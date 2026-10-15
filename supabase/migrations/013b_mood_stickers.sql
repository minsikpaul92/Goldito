-- 013b (Phase 12.3 Sticker, D61): pet stickers cut out in the browser, and each person's sticker layer on a daily report.
--
-- 1. media.purpose gains 'sticker': a transparent PNG of the pet only (Magic Touch cut-out in the browser), uploaded
--    through the usual sign → Cloudinary → complete path by the pet's owner or the sitter on duty (the backend checks).
-- 2. pet_stickers: one row per saved sticker. Both people on the pet see the pet's stickers; the one who made a
--    sticker may delete it. A row can only point at the maker's own sticker upload of that pet.
-- 3. report_decor (12.3b): the owner and the report's sitter each keep their own layer of stickers on a sent daily
--    report — {sticker_id, public_id, x, y, scale, rotate, z}, x / y as 0–1 of the card, at most 20 (public_id keeps a sticker on the page after it leaves the box). Each reads both layers and
--    writes only their own, so neither covers the other's (the report text itself is never touched).

alter table public.media drop constraint media_purpose_check;
alter table public.media add constraint media_purpose_check
  check (purpose in ('feed', 'task_proof', 'safety_label', 'report', 'handoff', 'sticker'));

create table public.pet_stickers (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  media_id uuid not null unique references public.media (id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index pet_stickers_pet_created_idx on public.pet_stickers (pet_id, created_at desc);

alter table public.pet_stickers enable row level security;

create policy pet_stickers_select on public.pet_stickers
  for select to authenticated
  using (public.can_access_pet(pet_id));

create policy pet_stickers_insert on public.pet_stickers
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.can_access_pet(pet_id)
    and exists (
      select 1 from public.media m
      where m.id = media_id
        and m.pet_id = pet_stickers.pet_id
        and m.uploaded_by = (select auth.uid())
        and m.purpose = 'sticker'
    )
  );

create policy pet_stickers_delete on public.pet_stickers
  for delete to authenticated
  using (created_by = (select auth.uid()));

revoke all on public.pet_stickers from anon, authenticated;
grant select, insert, delete on public.pet_stickers to authenticated;
grant all on public.pet_stickers to service_role;

create table public.report_decor (
  report_id uuid not null references public.daily_reports (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (report_id, user_id),
  constraint report_decor_items_chk check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 20)
);

alter table public.report_decor enable row level security;

-- May this user put stickers on this report? The owner once it is sent, or the report's own sitter.
-- (security definer: the policy reads daily_reports, whose own RLS would hide a draft from the owner anyway.)
create or replace function public.can_decorate_report(report uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.daily_reports r
    where r.id = report
      and ((r.status = 'sent' and public.is_owner_of(r.pet_id)) or r.sitter_id = auth.uid())
  )
$$;
revoke execute on function public.can_decorate_report(uuid) from public, anon;
grant execute on function public.can_decorate_report(uuid) to authenticated, service_role;

create policy report_decor_select on public.report_decor
  for select to authenticated
  using (public.can_decorate_report(report_id));

create policy report_decor_insert on public.report_decor
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_decorate_report(report_id));

create policy report_decor_update on public.report_decor
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_decorate_report(report_id));

create policy report_decor_delete on public.report_decor
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.report_decor from anon, authenticated;
grant select, insert, update, delete on public.report_decor to authenticated;
grant all on public.report_decor to service_role;

notify pgrst, 'reload schema';
