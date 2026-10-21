-- 014p (Diary, #186): the owner writes a diary page of their own.
--
-- No new table. An owner's page is a SENT daily_reports row whose author column (`sitter_id`, a profile id) is the
-- owner. Everything that already reads pages keeps working and stays private by the author column:
--   * the owner reads their pet's sent pages (daily_reports_select), so the owner sees their own page in the book;
--   * a sitter reads only rows they wrote, so no sitter ever sees an owner's page;
--   * the Pet Life Record and the report AI filter by the booking's sitter, so they never see it either;
--   * stickers (can_decorate_report) work: the owner may decorate a sent page of their pet.
-- There is no draft, no AI and no notice: the owner writes it for themselves and it is sent at once.

create or replace function public.add_owner_diary_entry(p_pet uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_me is null or not public.is_owner_of(p_pet) then
    raise exception 'not_owner';
  end if;
  if char_length(v_body) = 0 then
    raise exception 'body_required';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'body_too_long';
  end if;

  insert into public.daily_reports (pet_id, sitter_id, report_date, body, status, inputs, model, sent_at)
  values (p_pet, v_me, public.app_today(), v_body, 'sent', '{"by": "owner"}', null, now())
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.add_owner_diary_entry(uuid, text) from public, anon;
grant execute on function public.add_owner_diary_entry(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
