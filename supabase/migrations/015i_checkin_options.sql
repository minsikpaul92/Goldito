-- 015i: more check-in choices for the sitter Home tiles.
--
--   meal   + 'other'  (a typed memo is required: it is what the owner reads)
--   potty  + 'other'  (same)
--   walk   + '5', '15' (the Short / Mid / Long taps: about 5, about 15, 30 or more)
--   mood   happy · playful · excited · calm · tired · missing · sad · anxious
--
-- Same rules as before: only log_care_checkin writes, inside the care window. Rows written earlier stay valid
-- (`little`, 10 / 20 / 45 / 60, happy / calm / tired).

alter table public.care_checkins drop constraint care_checkins_value_chk;
alter table public.care_checkins
  add constraint care_checkins_value_chk check (
    (kind = 'meal' and value in ('all', 'most', 'little', 'none', 'other'))
    or (kind = 'potty' and value in ('normal', 'soft', 'none', 'other'))
    or (kind = 'walk' and value in ('5', '10', '15', '20', '30', '45', '60'))
    or (kind = 'mood' and value in ('happy', 'playful', 'excited', 'calm', 'tired', 'missing', 'sad', 'anxious'))
    or (kind = 'note' and value is null)
    or (kind = 'nap' and value is null)
    or (kind = 'wake' and value is null)
  );

-- "Other" means "see my note": it never goes without one.
alter table public.care_checkins
  add constraint care_checkins_other_chk check (value is distinct from 'other' or note_text is not null);

-- log_care_checkin (015d) with titles for the new values, and a check-in that settles the matching task.
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
  -- early). "Didn't eat" settles nothing. No second notice: the check-in notice below already tells the owner.
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

  select p.name, p.owner_id into v_pet_name, v_owner from public.pets p where p.id = p_pet;

  v_emoji := case p_kind
    when 'meal' then '🍽️' when 'potty' then '💩' when 'walk' then '🦮'
    when 'mood' then case p_value
      when 'playful' then '🎾' when 'excited' then '🤩' when 'calm' then '😌' when 'tired' then '😴'
      when 'missing' then '🥺' when 'sad' then '😢' when 'anxious' then '😟' else '😊' end
    when 'nap' then '💤' when 'wake' then '☀️' else '📝' end;
  v_title := case p_kind
    when 'meal' then case p_value
      when 'all' then format('%s ate everything', v_pet_name)
      when 'most' then format('%s ate most of the meal', v_pet_name)
      when 'little' then format('%s ate a little', v_pet_name)
      when 'other' then format('Meal update for %s', v_pet_name)
      else format('%s skipped the meal', v_pet_name) end
    when 'potty' then case p_value
      when 'other' then format('Potty update for %s', v_pet_name)
      else format('Potty update for %s: %s', v_pet_name, p_value) end
    when 'walk' then format('%s had a %s-minute walk', v_pet_name, p_value)
    when 'mood' then case p_value
      when 'missing' then format('%s is missing you', v_pet_name)
      else format('%s seems %s', v_pet_name, p_value) end
    when 'nap' then format('%s is taking a nap', v_pet_name)
    when 'wake' then format('%s woke up', v_pet_name)
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
