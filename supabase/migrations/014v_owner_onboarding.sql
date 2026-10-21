-- 014v: owner sign-up details (11.15 S1, #185).
--
--   * pets.profile       the owner's answers (personality, safety) as one jsonb object;
--   * owner_profiles.intro  a short note about the owner;
--   * pet_photos         up to 8 photos per pet, first = cover (same shape as profile_photos, 014g);
--   * create_pet_with_profile  saves a pet, its allergies and its answers in one call, safe to retry.
--
-- Photos are written the way 014g does it: adding and removing go through the backend (service role) after it checked
-- the Cloudinary file; reordering is the owner's own RPC.

-- ---------------------------------------------------------------------------
-- Answers and intro
-- ---------------------------------------------------------------------------

alter table public.pets
  add column profile jsonb not null default '{}'::jsonb
    constraint pets_profile_shape check (jsonb_typeof(profile) = 'object' and octet_length(profile::text) <= 16000);

alter table public.owner_profiles
  add column intro text constraint owner_profiles_intro_length check (char_length(intro) <= 500);

grant update (profile) on public.pets to authenticated;
grant update (intro) on public.owner_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Pet photos
-- ---------------------------------------------------------------------------

create table public.pet_photos (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  public_id text not null check (char_length(public_id) between 1 and 200),
  position smallint not null default 0 check (position between 0 and 7),
  created_at timestamptz not null default now()
);

create index pet_photos_pet_idx on public.pet_photos (pet_id, position);

alter table public.pet_photos enable row level security;

-- Whoever reads the pet reads its photos (the owner, a booked or requested sitter, a sitter with an open inquiry).
create policy pet_photos_select on public.pet_photos
  for select to authenticated
  using (public.can_view_pet_profile(pet_id) or public.has_open_inquiry_about(pet_id));

revoke all on public.pet_photos from anon, authenticated;
grant select on public.pet_photos to authenticated;
grant all on public.pet_photos to service_role;

-- Backend only: add a photo at the end of the pet's list (the 9th is refused). The owner is checked here too.
create or replace function public.add_pet_photo(p_owner uuid, p_pet uuid, p_public_id text)
returns public.pet_photos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_row public.pet_photos;
begin
  if not exists (select 1 from public.pets where id = p_pet and owner_id = p_owner) then
    raise exception 'not_found';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_pet::text));
  select count(*) into v_count from public.pet_photos where pet_id = p_pet;
  if v_count >= 8 then raise exception 'too_many_photos'; end if;
  insert into public.pet_photos (pet_id, public_id, position)
  values (p_pet, p_public_id, v_count)
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.add_pet_photo(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.add_pet_photo(uuid, uuid, text) to service_role;

-- The owner's own call: p_ids must be exactly the pet's photo ids, first = cover.
create or replace function public.reorder_pet_photos(p_pet uuid, p_ids uuid[])
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
  if not exists (select 1 from public.pets where id = p_pet and owner_id = v_uid) then
    raise exception 'not_found';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_pet::text));
  if cardinality(p_ids) <> (select count(*) from public.pet_photos where pet_id = p_pet)
     or exists (select 1 from unnest(p_ids) x where not exists (
       select 1 from public.pet_photos p where p.id = x and p.pet_id = p_pet))
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then
    raise exception 'invalid_photos';
  end if;

  update public.pet_photos p
  set position = o.pos - 1
  from unnest(p_ids) with ordinality as o (id, pos)
  where p.id = o.id;
end;
$$;

revoke execute on function public.reorder_pet_photos(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_pet_photos(uuid, uuid[]) to authenticated, service_role;

-- Backend only: remove one photo of the owner's pet and close the gap; returns the Cloudinary public id. The backend
-- deletes the file first, then calls this.
create or replace function public.remove_pet_photo(p_owner uuid, p_pet uuid, p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_public_id text;
begin
  if not exists (select 1 from public.pets where id = p_pet and owner_id = p_owner) then
    raise exception 'not_found';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_pet::text));
  delete from public.pet_photos where id = p_id and pet_id = p_pet returning public_id into v_public_id;
  if v_public_id is null then raise exception 'not_found'; end if;

  update public.pet_photos p
  set position = r.pos - 1
  from (select id, row_number() over (order by position, created_at, id) as pos
        from public.pet_photos where pet_id = p_pet) r
  where p.id = r.id;
  return v_public_id;
end;
$$;

revoke execute on function public.remove_pet_photo(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_pet_photo(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Save a pet in one call
-- ---------------------------------------------------------------------------

-- Creates the pet with the id the app made, or, when that id is already the caller's pet (a retry after a lost
-- answer), updates it. Allergies are replaced by p_allergens. Runs with the caller's rights: RLS still decides.
create or replace function public.create_pet_with_profile(
  p_id uuid,
  p_species text,
  p_name text,
  p_breed text,
  p_birthdate date,
  p_weight_kg numeric,
  p_notes text,
  p_profile jsonb,
  p_allergens text[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_allergens text[];
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_id is null then raise exception 'invalid_pet'; end if;

  select coalesce(array_agg(distinct a), '{}') into v_allergens
  from (select lower(btrim(x)) as a from unnest(coalesce(p_allergens, '{}')) x) s
  where a <> '';

  if exists (select 1 from public.pets where id = p_id and owner_id = v_uid) then
    update public.pets
    set name = p_name, breed = p_breed, birthdate = p_birthdate, weight_kg = p_weight_kg, notes = p_notes,
        profile = coalesce(p_profile, '{}'::jsonb)
    where id = p_id;
    delete from public.pet_allergies where pet_id = p_id and lower(allergen) <> all (v_allergens);
  else
    insert into public.pets (id, owner_id, species, name, breed, birthdate, weight_kg, notes, profile)
    values (p_id, v_uid, p_species, p_name, p_breed, p_birthdate, p_weight_kg, p_notes, coalesce(p_profile, '{}'::jsonb));
  end if;

  insert into public.pet_allergies (pet_id, allergen)
  select p_id, a from unnest(v_allergens) a
  on conflict (pet_id, lower(allergen)) do nothing;
  return p_id;
end;
$$;

revoke execute on function public.create_pet_with_profile(uuid, text, text, text, date, numeric, text, jsonb, text[])
  from public, anon;
grant execute on function public.create_pet_with_profile(uuid, text, text, text, date, numeric, text, jsonb, text[])
  to authenticated, service_role;

notify pgrst, 'reload schema';
