-- 011h: an owner's favorite sitters (feedback FB-28, 2026-10-09 — phase-11 11.5 pulled forward).
--
-- The owner marks a sitter as a favorite (after a review, or on the sitter's profile); favorites come first in
-- "Your sitters" and in the sitter search when booking. Private to the owner: the sitter is not told.

create table public.owner_favorite_sitters (
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, sitter_id),
  check (owner_id <> sitter_id)
);

alter table public.owner_favorite_sitters enable row level security;

create policy owner_favorite_sitters_select on public.owner_favorite_sitters
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- Only a sitter can be a favorite (010's is_sitter_profile).
create policy owner_favorite_sitters_insert on public.owner_favorite_sitters
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.is_sitter_profile(sitter_id));

create policy owner_favorite_sitters_delete on public.owner_favorite_sitters
  for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.owner_favorite_sitters from anon, authenticated;
grant select, insert, delete on public.owner_favorite_sitters to authenticated;
grant all on public.owner_favorite_sitters to service_role;
