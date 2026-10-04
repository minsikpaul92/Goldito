-- Phase 06 — care tasks → today's task logs (6.2). Later tasks (6.4 complete_task_log,
-- 6.8–6.9 care_checkins) add to this file.

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

-- Complete one of today's tasks (6.4). Only the sitter in the care window. The owner always
-- gets a `task_done` notice; a photo (media purpose `task_proof`, the sitter's own upload for this
-- pet) also makes a shared feed post with a task caption — and no second `feed_post` notice,
-- because notify_feed_post skips posts that carry a task_log_id (Plan B, sitter-care-loop §4).
create or replace function public.complete_task_log(p_task_log uuid, p_media_id uuid default null)
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
  set status = 'done', completed_at = now(), completed_by = auth.uid(), media_id = p_media_id
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
  perform public.notify_user(v_owner, 'task_done', v_title, null, v_log.pet_id, null, v_log.id);

  if p_media_id is not null then
    insert into public.feed_posts
      (pet_id, sitter_id, posted_by, media_id, caption, caption_source, task_log_id, visibility)
    values
      (v_log.pet_id, auth.uid(), auth.uid(), p_media_id,
       format('%s %s — done', v_emoji, v_task.title), 'task', v_log.id, 'shared');
  end if;

  return v_log;
end;
$$;

revoke execute on function public.complete_task_log(uuid, uuid) from public, anon;
grant execute on function public.complete_task_log(uuid, uuid) to authenticated, service_role;

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
  -- The episode line: required for a note, absent otherwise, at most 120 characters.
  constraint care_checkins_note_chk check (
    (kind = 'note' and note_text is not null and char_length(btrim(note_text)) between 1 and 120)
    or (kind <> 'note' and note_text is null)
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
