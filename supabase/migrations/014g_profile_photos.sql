-- 014g: profile photos for sitters and owners (#135, #136, #137).
--
-- A person keeps up to 8 photos; the first (position 0) is the cover. Sitters are shown to owners with a face and photos
-- with pets; an owner is shown to a sitter only once they share a booking or an inquiry — before that nothing of an owner
-- is visible. Photos live on Cloudinary; this table keeps the public id and the order.
--
-- Writes never go straight to the table:
--   * adding and removing go through the backend (service role): add_profile_photo after it checked the upload,
--     remove_profile_photo after it deleted the file on Cloudinary, so removing really removes the picture;
--   * reordering is the person's own RPC: reorder_profile_photos.

create table public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  public_id text not null check (char_length(public_id) between 1 and 200),
  position smallint not null default 0 check (position between 0 and 7),
  created_at timestamptz not null default now()
);

create index profile_photos_profile_idx on public.profile_photos (profile_id, position);

alter table public.profile_photos enable row level security;

-- True when the two people share a booking (any status) or an inquiry, in either role.
create or replace function public.shares_booking_or_inquiry(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bookings b
    where (b.owner_id = p_a and b.sitter_id = p_b) or (b.owner_id = p_b and b.sitter_id = p_a)
  ) or exists (
    select 1 from public.inquiries i
    where (i.owner_id = p_a and i.sitter_id = p_b) or (i.owner_id = p_b and i.sitter_id = p_a)
  )
$$;

revoke execute on function public.shares_booking_or_inquiry(uuid, uuid) from public, anon;
grant execute on function public.shares_booking_or_inquiry(uuid, uuid) to authenticated, service_role;

-- Own photos; a sitter's photos to every owner; an owner's photos to a sitter they share a booking or inquiry with.
create policy profile_photos_select on public.profile_photos
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (public.my_role() = 'owner' and public.is_sitter_profile(profile_id))
    or (public.my_role() = 'sitter' and public.shares_booking_or_inquiry(profile_id, (select auth.uid())))
  );

revoke all on public.profile_photos from anon, authenticated;
grant select on public.profile_photos to authenticated;
grant all on public.profile_photos to service_role;

-- Backend only: add a photo at the end of the person's list (the 9th is refused).
create or replace function public.add_profile_photo(p_profile uuid, p_public_id text)
returns public.profile_photos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_row public.profile_photos;
begin
  perform pg_advisory_xact_lock(hashtext(p_profile::text));
  select count(*) into v_count from public.profile_photos where profile_id = p_profile;
  if v_count >= 8 then raise exception 'too_many_photos'; end if;
  insert into public.profile_photos (profile_id, public_id, position)
  values (p_profile, p_public_id, v_count)
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.add_profile_photo(uuid, text) from public, anon, authenticated;
grant execute on function public.add_profile_photo(uuid, text) to service_role;

-- Replace the order: p_ids must be exactly the person's own photo ids, first = cover.
create or replace function public.reorder_profile_photos(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_ids is null then raise exception 'invalid_photos'; end if;

  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  if cardinality(p_ids) <> (select count(*) from public.profile_photos where profile_id = v_uid)
     or exists (select 1 from unnest(p_ids) x where not exists (
       select 1 from public.profile_photos p where p.id = x and p.profile_id = v_uid))
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then
    raise exception 'invalid_photos';
  end if;

  update public.profile_photos p
  set position = o.pos - 1
  from unnest(p_ids) with ordinality as o (id, pos)
  where p.id = o.id;
end;
$$;

revoke execute on function public.reorder_profile_photos(uuid[]) from public, anon;
grant execute on function public.reorder_profile_photos(uuid[]) to authenticated, service_role;

-- Backend only: remove one of the person's photos and close the gap; returns the Cloudinary public id. The backend
-- deletes the file first, then calls this.
create or replace function public.remove_profile_photo(p_profile uuid, p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_public_id text;
begin
  perform pg_advisory_xact_lock(hashtext(p_profile::text));
  delete from public.profile_photos where id = p_id and profile_id = p_profile returning public_id into v_public_id;
  if v_public_id is null then raise exception 'not_found'; end if;

  update public.profile_photos p
  set position = r.pos - 1
  from (select id, row_number() over (order by position, created_at, id) as pos
        from public.profile_photos where profile_id = p_profile) r
  where p.id = r.id;
  return v_public_id;
end;
$$;

revoke execute on function public.remove_profile_photo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_profile_photo(uuid, uuid) to service_role;
