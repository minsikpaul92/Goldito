-- 015x (Diary): up to four photos on a page.
--
-- The first photo stays where 014t put it (`daily_reports.media_id`, the page's main photo); the others are kept in
-- order in `more_media_ids`. No new table and no new relationship to media, so the existing `media(...)` embed of a page
-- stays unambiguous. The app reads the extra photos with one `media` query (the same media policy as the main photo).
--
-- `set_diary_page_photos(report, media[])` replaces all of them: the author's own images of that pet, the first one is
-- the main photo. An empty array takes every photo off. `set_diary_page_photo` (one photo) keeps working and clears the
-- extras, so a page never shows a stale second photo.

alter table public.daily_reports
  add column more_media_ids uuid[] not null default '{}'
  check (cardinality(more_media_ids) <= 3);

create or replace function public.set_diary_page_photos(p_report uuid, p_media uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pet uuid;
  v_author uuid;
  v_ids uuid[] := coalesce(p_media, '{}');
begin
  select pet_id, sitter_id into v_pet, v_author from public.daily_reports where id = p_report;
  if not found then
    raise exception 'not_found';
  end if;
  if auth.uid() is null or v_author <> auth.uid() then
    raise exception 'not_author';
  end if;
  if cardinality(v_ids) > 4 then
    raise exception 'too_many';
  end if;
  if (select count(distinct m) from unnest(v_ids) as m) <> cardinality(v_ids) then
    raise exception 'bad_photo';
  end if;
  if (
    select count(*) from public.media m
    where m.id = any (v_ids)
      and m.pet_id = v_pet
      and m.uploaded_by = auth.uid()
      and m.purpose in ('feed', 'report')
      and m.resource_type = 'image'
  ) <> cardinality(v_ids) then
    raise exception 'bad_photo';
  end if;
  update public.daily_reports
  set media_id = v_ids[1],
      more_media_ids = case when cardinality(v_ids) > 1 then v_ids[2:cardinality(v_ids)] else '{}' end
  where id = p_report;
end;
$$;

-- One photo (014t): the extras go, so the page shows only that photo.
create or replace function public.set_diary_page_photo(p_report uuid, p_media uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.set_diary_page_photos(p_report, case when p_media is null then '{}'::uuid[] else array[p_media] end);
end;
$$;

revoke execute on function public.set_diary_page_photos(uuid, uuid[]) from public, anon;
revoke execute on function public.set_diary_page_photo(uuid, uuid) from public, anon;
grant execute on function public.set_diary_page_photos(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.set_diary_page_photo(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
