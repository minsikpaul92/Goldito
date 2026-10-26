-- 015u: a review per pet from the sitter after a stay (#407, decision 2026-10-26).
--
-- Next to the medal, the sitter of a finished stay leaves each pet of it a short review: phrases picked from chips
-- (D38) and an optional short note. One review per pet and booking; the sitter can change it later. Unlike the
-- private owner note it is shared: the pet's owner reads it under the pet, and every sitter reads it where they look
-- at the pet before or during a booking. Nobody else reads it, nobody deletes it.

create table public.pet_reviews (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  chips text[] not null default '{}',
  note text check (char_length(note) <= 200),
  -- The stay the review is for (Received to Returned), filled in by pet_reviews_stay.
  stay_from timestamptz,
  stay_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, pet_id),
  check (cardinality(chips) <= 6 and char_length(array_to_string(chips, '')) <= 360),
  check (cardinality(chips) > 0 or char_length(coalesce(note, '')) > 0)
);

create index pet_reviews_pet_idx on public.pet_reviews (pet_id, created_at desc);

-- The caller is the sitter of this confirmed booking, the pet was in it, and the pets are back (pick-up done).
create or replace function public.can_review_pet(p_booking uuid, p_pet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bookings b
    join public.booking_pets bp on bp.booking_id = b.id and bp.pet_id = p_pet
    join public.booking_handoffs h on h.booking_id = b.id and h.kind = 'pick_up' and h.status = 'agreed'
    where b.id = p_booking and b.sitter_id = auth.uid() and b.status = 'confirmed' and h.completed_at is not null
  )
$$;

revoke execute on function public.can_review_pet(uuid, uuid) from public, anon;
grant execute on function public.can_review_pet(uuid, uuid) to authenticated, service_role;

-- Stay dates come from the booking, never from the client; an edit bumps updated_at.
create or replace function public.pet_reviews_stay()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(max(h.completed_at) filter (where h.kind = 'drop_off'), min(h.scheduled_at) filter (where h.kind = 'drop_off')),
         max(h.completed_at) filter (where h.kind = 'pick_up')
    into new.stay_from, new.stay_to
    from public.booking_handoffs h
   where h.booking_id = new.booking_id and h.status = 'agreed';
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger pet_reviews_stay
  before insert or update on public.pet_reviews
  for each row execute function public.pet_reviews_stay();

alter table public.pet_reviews enable row level security;

create policy pet_reviews_select on public.pet_reviews
  for select to authenticated
  using (sitter_id = (select auth.uid()) or public.is_owner_of(pet_id) or public.my_role() = 'sitter');

create policy pet_reviews_insert on public.pet_reviews
  for insert to authenticated
  with check (sitter_id = (select auth.uid()) and public.can_review_pet(booking_id, pet_id));

create policy pet_reviews_update on public.pet_reviews
  for update to authenticated
  using (sitter_id = (select auth.uid()))
  with check (sitter_id = (select auth.uid()) and public.can_review_pet(booking_id, pet_id));

revoke all on public.pet_reviews from anon, authenticated;
grant select on public.pet_reviews to authenticated;
grant insert (pet_id, booking_id, sitter_id, chips, note) on public.pet_reviews to authenticated;
grant update (pet_id, booking_id, sitter_id, chips, note) on public.pet_reviews to authenticated;
grant all on public.pet_reviews to service_role;
