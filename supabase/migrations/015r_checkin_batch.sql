-- 015r: one check-in, several picks (#397, Sitter-011).
--   The sitter's check-in screen keeps one pick per group (Meal, Potty, Walk, Mood) and sends them together.
--   log_care_checkins writes one care_checkins row per pick with the same rules as log_care_checkin, and the owner
--   gets ONE notice for all of them: the picks' lines joined with " · ", the memo as the body. The memo and the photo
--   ride on the first pick, so the photo makes one feed post and the notice (ref_id = that row) shows it.
--   log_care_checkin keeps its contract. Its body moves into care_checkin_write (the row, the task it settles, the
--   photo post) and care_checkin_title (the owner's line), so both functions share every rule.

-- The owner's line for one check-in ("Max ate everything 🍽️"), as log_care_checkin wrote it since 015j.
create or replace function public.care_checkin_title(p_pet_name text, p_kind text, p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_kind
    when 'meal' then case p_value
      when 'all' then format('%s ate everything', p_pet_name)
      when 'most' then format('%s ate most of the meal', p_pet_name)
      when 'little' then format('%s ate a little', p_pet_name)
      when 'other' then format('Meal update for %s', p_pet_name)
      else format('%s skipped the meal', p_pet_name) end
    when 'potty' then case p_value
      when 'other' then format('Potty update for %s', p_pet_name)
      else format('Potty update for %s: %s', p_pet_name, p_value) end
    when 'walk' then format('%s had a %s-minute walk', p_pet_name, p_value)
    when 'mood' then case p_value
      when 'missing' then format('%s is missing you', p_pet_name)
      else format('%s seems %s', p_pet_name, p_value) end
    when 'nap' then format('%s is taking a nap', p_pet_name)
    when 'wake' then format('%s woke up', p_pet_name)
    else format('Note from your sitter about %s', p_pet_name)
  end || ' ' || case p_kind
    when 'meal' then '🍽️' when 'potty' then '💩' when 'walk' then '🦮'
    when 'mood' then case p_value
      when 'playful' then '🎾' when 'excited' then '🤩' when 'calm' then '😌' when 'tired' then '😴'
      when 'missing' then '🥺' when 'sad' then '😢' when 'anxious' then '😟' else '😊' end
    when 'nap' then '💤' when 'wake' then '☀️' else '📝' end
$$;

-- Everything log_care_checkin did (015j) except the notice: the caller tells the owner.
create or replace function public.care_checkin_write(
  p_pet uuid,
  p_kind text,
  p_value text,
  p_note_text text,
  p_media_id uuid
)
returns public.care_checkins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.care_checkins;
  v_note text := nullif(btrim(coalesce(p_note_text, '')), '');
  v_title text;
  v_category text;
begin
  if not public.in_care_window(p_pet, now()) then
    raise exception 'not_in_care_window';
  end if;
  if (p_kind = 'note' or p_value = 'other') and v_note is null then
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

  -- A meal, a walk or a potty the sitter reports settles the nearest open task of that kind today (a pet may eat
  -- early). "Didn't eat" settles nothing. No second notice: the check-in notice tells the owner.
  if (p_kind = 'meal' and p_value in ('all', 'most', 'little', 'other'))
     or p_kind = 'walk'
     or (p_kind = 'potty' and p_value in ('normal', 'soft', 'other')) then
    update public.task_logs
       set status = 'done', completed_at = now(), completed_by = auth.uid()
     where id = (
       select l.id
         from public.task_logs l
         join public.care_tasks t on t.id = l.task_id
        where l.pet_id = p_pet
          and l.status = 'pending'
          and t.type = case p_kind when 'meal' then 'feeding' when 'walk' then 'walk' else 'litter' end
          and l.due_at >= public.local_ts(public.app_today(), '00:00')
          and l.due_at < public.local_ts(public.app_today() + 1, '00:00')
        order by l.due_at
        limit 1
     );
  end if;

  if p_media_id is not null then
    v_title := public.care_checkin_title((select p.name from public.pets p where p.id = p_pet), p_kind, p_value);
    v_category := case p_kind
      when 'meal' then 'meal' when 'walk' then 'walk' when 'nap' then 'nap'
      when 'potty' then 'potty' when 'mood' then 'mood' else null end;
    insert into public.feed_posts
      (pet_id, sitter_id, posted_by, media_id, caption, caption_source, visibility, category, note)
    values
      (p_pet, auth.uid(), auth.uid(), p_media_id,
       case when v_note is null then v_title else v_title || ' · ' || v_note end, 'task', 'shared',
       v_category, left(v_note, 200));
  end if;

  return v_row;
end;
$$;

-- Only the two functions below call it (they run as its owner).
revoke execute on function public.care_checkin_write(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.care_checkin_write(uuid, text, text, text, uuid) to service_role;

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
begin
  v_row := public.care_checkin_write(p_pet, p_kind, p_value, p_note_text, p_media_id);
  select p.name, p.owner_id into v_pet_name, v_owner from public.pets p where p.id = p_pet;
  -- What was sent is the title; a typed memo rides along as the body.
  perform public.notify_user(
    v_owner, 'care_checkin', public.care_checkin_title(v_pet_name, p_kind, p_value), v_row.note_text, p_pet, null, v_row.id);
  return v_row;
end;
$$;

revoke execute on function public.log_care_checkin(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.log_care_checkin(uuid, text, text, text, uuid) to authenticated, service_role;

-- One check-in with a pick per group: p_picks = [{"kind": "meal", "value": "all"}, {"kind": "mood", "value": "happy"}].
create or replace function public.log_care_checkins(
  p_pet uuid,
  p_picks jsonb,
  p_note_text text default null,
  p_media_id uuid default null
)
returns setof public.care_checkins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pick jsonb;
  v_row public.care_checkins;
  v_first public.care_checkins;
  v_pet_name text;
  v_owner uuid;
  v_titles text[] := '{}';
begin
  if jsonb_typeof(p_picks) is distinct from 'array' or jsonb_array_length(p_picks) = 0 then
    raise exception 'no_picks';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_picks) e
    where jsonb_typeof(e) is distinct from 'object' or coalesce(e ->> 'kind', '') not in ('meal', 'potty', 'walk', 'mood')
  ) then
    raise exception 'invalid_pick';
  end if;
  if (select count(*) <> count(distinct e ->> 'kind') from jsonb_array_elements(p_picks) e) then
    raise exception 'one_pick_per_group';
  end if;

  for v_pick in select e from jsonb_array_elements(p_picks) with ordinality as t (e, i) order by i loop
    -- The memo and the photo belong to the check-in as a whole: they ride on the first pick.
    v_row := public.care_checkin_write(
      p_pet, v_pick ->> 'kind', v_pick ->> 'value',
      case when v_first is null then p_note_text end,
      case when v_first is null then p_media_id end);
    if v_first is null then
      v_first := v_row;
      select p.name, p.owner_id into v_pet_name, v_owner from public.pets p where p.id = p_pet;
    end if;
    v_titles := v_titles || public.care_checkin_title(v_pet_name, v_row.kind, v_row.value);
    return next v_row;
  end loop;

  -- One notice for the whole check-in, pointing at the first pick (it holds the photo).
  perform public.notify_user(
    v_owner, 'care_checkin', array_to_string(v_titles, ' · '), v_first.note_text, p_pet, null, v_first.id);
  return;
end;
$$;

revoke execute on function public.log_care_checkins(uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.log_care_checkins(uuid, jsonb, text, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
