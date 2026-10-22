-- 015: nap check-in (11.12 Tamagotchi, #184).
--
-- The sitter taps feed / walk / potty / nap on the pet room, and each tap is a care check-in. Nap is the new kind:
-- no value, like a note without text. The owner gets the usual `care_checkin` notice ("Max is taking a nap 💤").
-- Same rules as every other kind: written only by log_care_checkin, inside the care window.

alter table public.care_checkins drop constraint care_checkins_kind_check;
alter table public.care_checkins
  add constraint care_checkins_kind_check check (kind in ('meal', 'potty', 'walk', 'mood', 'note', 'nap'));

alter table public.care_checkins drop constraint care_checkins_value_chk;
alter table public.care_checkins
  add constraint care_checkins_value_chk check (
    (kind = 'meal' and value in ('all', 'most', 'little', 'none'))
    or (kind = 'potty' and value in ('normal', 'soft', 'none'))
    or (kind = 'walk' and value in ('10', '20', '30', '45', '60'))
    or (kind = 'mood' and value in ('happy', 'calm', 'tired'))
    or (kind = 'note' and value is null)
    or (kind = 'nap' and value is null)
  );

-- log_care_checkin (008_care.sql) with the nap title and emoji; nothing else changes.
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
    when 'meal' then '🍽️' when 'potty' then '💩' when 'walk' then '🦮' when 'mood' then '😊' when 'nap' then '💤' else '📝' end;
  v_title := case p_kind
    when 'meal' then case p_value
      when 'all' then format('%s ate everything', v_pet_name)
      when 'most' then format('%s ate most of the meal', v_pet_name)
      when 'little' then format('%s ate a little', v_pet_name)
      else format('%s skipped the meal', v_pet_name) end
    when 'potty' then format('Potty update for %s: %s', v_pet_name, p_value)
    when 'walk' then format('%s had a %s-minute walk', v_pet_name, p_value)
    when 'mood' then format('%s seems %s', v_pet_name, p_value)
    when 'nap' then format('%s is taking a nap', v_pet_name)
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
