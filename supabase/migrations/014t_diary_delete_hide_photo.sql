-- 014t (Diary, #243): delete a page, hide a sitter's page on the owner's side, a photo on the page.
--
-- No change to who may write a page (014b · 014p). Three additions:
--   1. delete_diary_page(report): the page's author deletes it, draft or sent. The sitter's page disappears from the
--      owner's book too (it is the sitter's page); the owner's own page goes the same way. Its stickers go with it
--      (report_decor cascades) and so does the "report sent" notice that pointed at it. Feed photos are never
--      touched: a page only points at a photo, it does not own one.
--   2. hide_diary_page(report): the owner takes a page a sitter sent out of THEIR book. The sitter's copy, the stay's
--      Pet Life Record and the sitter's other readers are unchanged. A row in diary_page_hidden, read by the one
--      policy that decides what the owner sees; there is no way back yet.
--   3. daily_reports.media_id + set_diary_page_photo(report, media): the photo shown in the page's picture box. The
--      author picks one of their own images of that pet (a feed or report upload). The owner reads it through the
--      existing media policy. Without one the page keeps showing the day's first shared photo, as before.

alter table public.daily_reports
  add column media_id uuid references public.media (id) on delete set null;

create table public.diary_page_hidden (
  report_id uuid not null references public.daily_reports (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

alter table public.diary_page_hidden enable row level security;

-- Own rows only, and only to read: hiding goes through hide_diary_page.
create policy diary_page_hidden_select on public.diary_page_hidden
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.diary_page_hidden from anon, authenticated;
grant select on public.diary_page_hidden to authenticated;
grant all on public.diary_page_hidden to service_role;

-- 002's policy plus: the owner no longer sees a page they hid.
drop policy daily_reports_select on public.daily_reports;
create policy daily_reports_select on public.daily_reports
  for select to authenticated
  using (
    (
      public.is_owner_of(pet_id)
      and status = 'sent'
      and not exists (
        select 1 from public.diary_page_hidden h
        where h.report_id = daily_reports.id and h.user_id = (select auth.uid())
      )
    )
    or sitter_id = (select auth.uid())
  );

create or replace function public.delete_diary_page(p_report uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  select sitter_id into v_author from public.daily_reports where id = p_report;
  if not found then
    raise exception 'not_found';
  end if;
  if auth.uid() is null or v_author <> auth.uid() then
    raise exception 'not_author';
  end if;
  delete from public.notifications where type = 'report_sent' and ref_id = p_report;
  delete from public.daily_reports where id = p_report;
end;
$$;

create or replace function public.hide_diary_page(p_report uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_pet uuid;
  v_author uuid;
  v_status text;
begin
  select pet_id, sitter_id, status into v_pet, v_author, v_status from public.daily_reports where id = p_report;
  if not found or v_status <> 'sent' then
    raise exception 'not_found';
  end if;
  if v_me is null or not public.is_owner_of(v_pet) then
    raise exception 'not_owner';
  end if;
  if v_author = v_me then
    raise exception 'own_page'; -- the owner's own page is deleted, not hidden
  end if;
  insert into public.diary_page_hidden (report_id, user_id) values (p_report, v_me) on conflict do nothing;
  delete from public.notifications where user_id = v_me and type = 'report_sent' and ref_id = p_report;
end;
$$;

create or replace function public.set_diary_page_photo(p_report uuid, p_media uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pet uuid;
  v_author uuid;
begin
  select pet_id, sitter_id into v_pet, v_author from public.daily_reports where id = p_report;
  if not found then
    raise exception 'not_found';
  end if;
  if auth.uid() is null or v_author <> auth.uid() then
    raise exception 'not_author';
  end if;
  if p_media is not null and not exists (
    select 1 from public.media m
    where m.id = p_media
      and m.pet_id = v_pet
      and m.uploaded_by = auth.uid()
      and m.purpose in ('feed', 'report')
      and m.resource_type = 'image'
  ) then
    raise exception 'bad_photo';
  end if;
  update public.daily_reports set media_id = p_media where id = p_report;
end;
$$;

revoke execute on function public.delete_diary_page(uuid) from public, anon;
revoke execute on function public.hide_diary_page(uuid) from public, anon;
revoke execute on function public.set_diary_page_photo(uuid, uuid) from public, anon;
grant execute on function public.delete_diary_page(uuid) to authenticated, service_role;
grant execute on function public.hide_diary_page(uuid) to authenticated, service_role;
grant execute on function public.set_diary_page_photo(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
