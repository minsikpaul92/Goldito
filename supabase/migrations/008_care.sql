-- Phase 06 — care tasks → today's task logs (6.2). Later tasks (6.4 complete_task_log,
-- 6.8–6.9 care_checkins) add to this file.

-- The sitter's optional memo when finishing a task (≤ 120 characters, never empty).
alter table public.task_logs
  add column note_text text,
  add constraint task_logs_note_chk check (note_text is null or char_length(btrim(note_text)) between 1 and 120);

-- Today's task_logs for a pet, created on demand when the sitter opens the screen (D8: "today" is
-- the app-timezone day). Idempotent: unique (task_id, due_at) + on conflict do nothing.
--   · only the sitter on duty can call it (owners read task_logs through RLS);
--   · only active tasks, and only when the task's time falls inside the sitter's care window;
--   · a task with repeat_daily = false gets one log in its lifetime;
--   · returns every log of today for the pet, so the screen needs no second query.
create or replace function public.ensure_today_task_logs(p_pet uuid)
returns setof public.task_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.app_today();
begin
  if not public.is_on_duty_for(p_pet) then
    raise exception 'not_on_duty';
  end if;

  insert into public.task_logs (task_id, pet_id, due_at)
  select t.id, t.pet_id, public.local_ts(v_today, t.scheduled_time)
  from public.care_tasks t
  where t.pet_id = p_pet
    and t.active
    and public.in_care_window(p_pet, public.local_ts(v_today, t.scheduled_time))
    and (t.repeat_daily or not exists (select 1 from public.task_logs l where l.task_id = t.id))
    and not exists (
      select 1 from public.task_logs l
      where l.task_id = t.id and l.status = 'done'
        and l.due_at >= public.local_ts(v_today, '00:00')
        and l.due_at < public.local_ts(v_today + 1, '00:00')
    )
  on conflict (task_id, due_at) do nothing;

  return query
    select l.*
    from public.task_logs l
    where l.pet_id = p_pet
      and l.due_at >= public.local_ts(v_today, '00:00')
      and l.due_at < public.local_ts(v_today + 1, '00:00')
    order by l.due_at, l.created_at;
end;
$$;

revoke execute on function public.ensure_today_task_logs(uuid) from public, anon;
grant execute on function public.ensure_today_task_logs(uuid) to authenticated, service_role;

-- Complete one of today's tasks (6.4). Only the sitter in the care window. The owner always gets a
-- `task_done` notice: what was done ("Max had breakfast on time 🍽️") as the title, and the memo, if
-- one was typed, as its body — so the owner always knows what the memo is about. A photo (media purpose `task_proof`, the sitter's own upload for
-- this pet) also makes a shared feed post — and no second `feed_post` notice, because
-- notify_feed_post skips posts that carry a task_log_id (Plan B, sitter-care-loop §4).
create or replace function public.complete_task_log(
  p_task_log uuid,
  p_media_id uuid default null,
  p_note_text text default null
)
returns public.task_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.task_logs;
  v_task public.care_tasks;
  v_pet_name text;
  v_owner uuid;
  v_title text;
  v_emoji text;
  v_on_time text;
  v_note text := nullif(btrim(coalesce(p_note_text, '')), '');
begin
  select * into v_log from public.task_logs where id = p_task_log for update;
  if not found then
    raise exception 'task_log_not_found';
  end if;
  if not public.in_care_window(v_log.pet_id, now()) then
    raise exception 'not_in_care_window';
  end if;
  if v_log.status = 'done' then
    raise exception 'already_done';
  end if;
  if p_media_id is not null and not exists (
    select 1 from public.media m
    where m.id = p_media_id
      and m.pet_id = v_log.pet_id
      and m.uploaded_by = auth.uid()
      and m.purpose = 'task_proof'
  ) then
    raise exception 'invalid_media';
  end if;

  select * into v_task from public.care_tasks where id = v_log.task_id;
  select p.name, p.owner_id into v_pet_name, v_owner from public.pets p where p.id = v_log.pet_id;

  update public.task_logs
  set status = 'done', completed_at = now(), completed_by = auth.uid(), media_id = p_media_id,
      note_text = v_note
  where id = v_log.id
  returning * into v_log;

  v_on_time := case when now() <= v_log.due_at + interval '60 minutes' then ' on time' else '' end;
  v_emoji := case v_task.type
    when 'medication' then '💊' when 'walk' then '🦮' when 'feeding' then '🍽️'
    when 'litter' then '🧹' when 'play' then '🎾' else '😴' end;
  v_title := case v_task.type
    when 'medication' then format('%s''s medication is done%s %s', v_pet_name, v_on_time, v_emoji)
    when 'walk' then format('%s had a walk%s %s', v_pet_name, v_on_time, v_emoji)
    when 'feeding' then format('%s had %s%s %s', v_pet_name, lower(v_task.title), v_on_time, v_emoji)
    when 'litter' then format('%s''s litter box is clean %s', v_pet_name, v_emoji)
    when 'play' then format('%s had playtime%s %s', v_pet_name, v_on_time, v_emoji)
    else format('%s is asleep %s', v_pet_name, v_emoji)
  end;
  perform public.notify_user(v_owner, 'task_done', v_title, v_note, v_log.pet_id, null, v_log.id);

  if p_media_id is not null then
    insert into public.feed_posts
      (pet_id, sitter_id, posted_by, media_id, caption, caption_source, task_log_id, visibility)
    values
      (v_log.pet_id, auth.uid(), auth.uid(), p_media_id,
       format('%s %s — %s', v_emoji, v_task.title, coalesce(v_note, 'done')), 'task', v_log.id, 'shared');
  end if;

  return v_log;
end;
$$;

revoke execute on function public.complete_task_log(uuid, uuid, text) from public, anon;
grant execute on function public.complete_task_log(uuid, uuid, text) to authenticated, service_role;

-- The owner edits a task (time) or pauses it: today's unfinished logs for the old plan go away, so
-- the sitter never sees a stale or "missed" row for a time that no longer exists. Finished logs and
-- earlier days stay as history. (Deleting the task removes its logs by cascade.)
create or replace function public.care_task_reset_today()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scheduled_time is distinct from old.scheduled_time or (old.active and not new.active) then
    delete from public.task_logs
    where task_id = new.id
      and status = 'pending'
      and due_at >= public.local_ts(public.app_today(), '00:00');
  end if;
  return new;
end;
$$;

create trigger care_tasks_reset_today
  after update of scheduled_time, active on public.care_tasks
  for each row execute function public.care_task_reset_today();

-- ---------------------------------------------------------------------------
-- 5-second check-ins (6.8): meal · potty · walk · mood · note, one tap each (D34, sitter-care-loop §3).
-- Rows are written by log_care_checkin (6.9, security definer: it also notifies the owner and can
-- attach a photo), so there is no insert policy — like task_logs, clients only read.
-- ---------------------------------------------------------------------------

create table public.care_checkins (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('meal', 'potty', 'walk', 'mood', 'note')),
  value text,
  note_text text,
  media_id uuid references public.media (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint care_checkins_value_chk check (
    (kind = 'meal' and value in ('all', 'most', 'little', 'none'))
    or (kind = 'potty' and value in ('normal', 'soft', 'none'))
    or (kind = 'walk' and value in ('10', '20', '30', '45', '60'))
    or (kind = 'mood' and value in ('happy', 'calm', 'tired'))
    or (kind = 'note' and value is null)
  ),
  -- The episode line (≤ 120 characters): required for a `note` check-in, optional on any other
  -- ("only if something special happened") — never an empty string.
  constraint care_checkins_note_chk check (
    note_text is null and kind <> 'note'
    or note_text is not null and char_length(btrim(note_text)) between 1 and 120
  )
);

create index care_checkins_pet_created_idx on public.care_checkins (pet_id, created_at desc);

-- Same species rule as walk tasks (D23): walks are for dogs.
create or replace function public.guard_care_checkin_species()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'walk' and exists (select 1 from public.pets p where p.id = new.pet_id and p.species = 'cat') then
    raise exception 'checkin_not_allowed_for_species';
  end if;
  return new;
end;
$$;

create trigger care_checkins_species_guard
  before insert or update of kind, pet_id on public.care_checkins
  for each row execute function public.guard_care_checkin_species();

alter table public.care_checkins enable row level security;

-- Owner and the sitter in the care window read, exactly like task_logs and feed posts.
create policy care_checkins_select on public.care_checkins
  for select to authenticated
  using (public.can_access_pet(pet_id));

revoke all on public.care_checkins from anon, authenticated;
grant select on public.care_checkins to authenticated;
grant all on public.care_checkins to service_role;

-- The 5-second check (6.9): one tap per check-in, an optional short memo for anything special,
-- an optional photo. Only the sitter inside the care window. The owner gets a `care_checkin`
-- notice: what was sent ("Max ate everything 🍽️") as the title, and the memo, if typed, as its body.
-- A photo (media purpose `task_proof`, the sitter's own upload for
-- this pet) also makes a shared feed post — captioned like a task photo, so it sends no second
-- `feed_post` notice (notify_feed_post skips caption_source 'task').
create or replace function public.log_care_checkin(
  p_pet uuid,
  p_kind text,
  p_value text default null,
  p_note_text text default null,
  p_media_id uuid default null
)
returns public.care_checkins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.care_checkins;
  v_pet_name text;
  v_owner uuid;
  v_note text := nullif(btrim(coalesce(p_note_text, '')), '');
  v_title text;
  v_emoji text;
begin
  if not public.in_care_window(p_pet, now()) then
    raise exception 'not_in_care_window';
  end if;
  if p_kind = 'note' and v_note is null then
    raise exception 'note_required';
  end if;
  if p_media_id is not null and not exists (
    select 1 from public.media m
    where m.id = p_media_id
      and m.pet_id = p_pet
      and m.uploaded_by = auth.uid()
      and m.purpose = 'task_proof'
  ) then
    raise exception 'invalid_media';
  end if;

  -- Value / length / species rules live in the table (checks + trigger) and surface as errors.
  insert into public.care_checkins (pet_id, created_by, kind, value, note_text, media_id)
  values (p_pet, auth.uid(), p_kind, case when p_kind = 'note' then null else p_value end, v_note, p_media_id)
  returning * into v_row;

  select p.name, p.owner_id into v_pet_name, v_owner from public.pets p where p.id = p_pet;

  v_emoji := case p_kind
    when 'meal' then '🍽️' when 'potty' then '💩' when 'walk' then '🦮' when 'mood' then '😊' else '📝' end;
  v_title := case p_kind
    when 'meal' then case p_value
      when 'all' then format('%s ate everything', v_pet_name)
      when 'most' then format('%s ate most of the meal', v_pet_name)
      when 'little' then format('%s ate a little', v_pet_name)
      else format('%s skipped the meal', v_pet_name) end
    when 'potty' then format('Potty update for %s: %s', v_pet_name, p_value)
    when 'walk' then format('%s had a %s-minute walk', v_pet_name, p_value)
    when 'mood' then format('%s seems %s', v_pet_name, p_value)
    else format('Note from your sitter about %s', v_pet_name)
  end || ' ' || v_emoji;
  -- What was sent is the title; a typed memo rides along as the body.
  perform public.notify_user(v_owner, 'care_checkin', v_title, v_note, p_pet, null, v_row.id);

  if p_media_id is not null then
    insert into public.feed_posts
      (pet_id, sitter_id, posted_by, media_id, caption, caption_source, visibility)
    values
      (p_pet, auth.uid(), auth.uid(), p_media_id,
       case when v_note is null then v_title else v_title || ' — ' || v_note end, 'task', 'shared');
  end if;

  return v_row;
end;
$$;

revoke execute on function public.log_care_checkin(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.log_care_checkin(uuid, text, text, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Care request (6.13): the owner's note, the checklist it became, and the Heads-ups.
--   care_requests  the note as written (owner-only: it can say private things)
--   care_tasks     gains request_id — which request a task came from (set null if the request goes)
--   pet_cautions   short "be careful" lines the sitter sees as Heads-up cards (owner edits them)
-- Saved by save_care_request in ONE transaction, so a failure never leaves half a checklist.
-- ---------------------------------------------------------------------------

create table public.care_requests (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  raw_text text not null check (char_length(btrim(raw_text)) between 1 and 2000),
  model text,
  created_at timestamptz not null default now()
);

create index care_requests_pet_created_idx on public.care_requests (pet_id, created_at desc);

alter table public.care_tasks
  add column request_id uuid references public.care_requests (id) on delete set null;

create table public.pet_cautions (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  request_id uuid references public.care_requests (id) on delete set null,
  text text not null check (char_length(btrim(text)) between 1 and 100),
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index pet_cautions_pet_idx on public.pet_cautions (pet_id) where active;

alter table public.care_requests enable row level security;
alter table public.pet_cautions enable row level security;

create policy care_requests_select on public.care_requests
  for select to authenticated using (public.is_owner_of(pet_id));
create policy care_requests_delete on public.care_requests
  for delete to authenticated using (public.is_owner_of(pet_id));

-- Same audience as care_tasks: the owner, the sitter in the care window, and a sitter deciding on a request.
create policy pet_cautions_select on public.pet_cautions
  for select to authenticated using (public.can_view_pet_profile(pet_id));
create policy pet_cautions_insert on public.pet_cautions
  for insert to authenticated with check (public.is_owner_of(pet_id));
create policy pet_cautions_update on public.pet_cautions
  for update to authenticated using (public.is_owner_of(pet_id)) with check (public.is_owner_of(pet_id));
create policy pet_cautions_delete on public.pet_cautions
  for delete to authenticated using (public.is_owner_of(pet_id));

revoke all on public.care_requests, public.pet_cautions from anon, authenticated;
grant select, delete on public.care_requests to authenticated;
grant select, insert, update, delete on public.pet_cautions to authenticated;
grant all on public.care_requests, public.pet_cautions to service_role;

create or replace function public.save_care_request(
  p_pet uuid,
  p_text text,
  p_model text,
  p_tasks jsonb,
  p_cautions text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request uuid;
  v_task jsonb;
  v_caution text;
begin
  if not public.is_owner_of(p_pet) then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(p_tasks) is distinct from 'array'
     or jsonb_array_length(p_tasks) > 12
     or coalesce(array_length(p_cautions, 1), 0) > 8 then
    raise exception 'too_many_items';
  end if;

  insert into public.care_requests (pet_id, created_by, raw_text, model)
  values (p_pet, auth.uid(), p_text, p_model)
  returning id into v_request;

  -- care_tasks' own checks (types, species guard) apply: any bad row rolls the whole save back.
  for v_task in select * from jsonb_array_elements(p_tasks) loop
    insert into public.care_tasks
      (pet_id, type, title, dose, scheduled_time, notes, repeat_daily, created_by, request_id)
    values
      (p_pet, v_task->>'type', btrim(v_task->>'title'), nullif(btrim(v_task->>'dose'), ''),
       (v_task->>'time')::time, nullif(btrim(v_task->>'notes'), ''), true, auth.uid(), v_request);
  end loop;

  foreach v_caution in array coalesce(p_cautions, '{}') loop
    insert into public.pet_cautions (pet_id, request_id, text, created_by)
    values (p_pet, v_request, btrim(v_caution), auth.uid());
  end loop;

  return v_request;
end;
$$;

revoke execute on function public.save_care_request(uuid, text, text, jsonb, text[]) from public, anon;
grant execute on function public.save_care_request(uuid, text, text, jsonb, text[]) to authenticated, service_role;
