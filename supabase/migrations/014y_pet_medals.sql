-- 014y: pet medals (11.12 Tamagotchi, #184).
--
-- After a stay is over (the pets are Returned) the sitter can give each pet in it a medal: a keepsake the owner sees
-- under the pet room. One medal per pet and booking, written only by award_pet_medal (a sitter of that booking, once
-- the pick-up is done). The owner and the sitter who gave it read it; nobody edits or deletes it, it goes with the pet.
-- What the owner can do with a medal afterwards is later work.

create table public.pet_medals (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  -- The stay the medal is for: Received to Returned.
  stay_from timestamptz not null,
  stay_to timestamptz not null,
  awarded_at timestamptz not null default now(),
  unique (booking_id, pet_id)
);

create index pet_medals_pet_idx on public.pet_medals (pet_id, awarded_at desc);

alter table public.pet_medals enable row level security;

create policy pet_medals_select on public.pet_medals
  for select to authenticated
  using (public.is_owner_of(pet_id) or sitter_id = auth.uid());

revoke all on public.pet_medals from anon, authenticated;
grant select on public.pet_medals to authenticated;
grant all on public.pet_medals to service_role;

create or replace function public.award_pet_medal(p_booking uuid, p_pet uuid)
returns public.pet_medals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pet_medals;
  v_from timestamptz;
  v_to timestamptz;
begin
  if not exists (
    select 1 from public.bookings b
    where b.id = p_booking and b.sitter_id = auth.uid() and b.status = 'confirmed'
  ) then
    raise exception 'not_your_booking';
  end if;
  if not exists (select 1 from public.booking_pets bp where bp.booking_id = p_booking and bp.pet_id = p_pet) then
    raise exception 'pet_not_in_booking';
  end if;

  select coalesce(max(h.completed_at) filter (where h.kind = 'drop_off'), min(h.scheduled_at) filter (where h.kind = 'drop_off')),
         max(h.completed_at) filter (where h.kind = 'pick_up')
    into v_from, v_to
    from public.booking_handoffs h
   where h.booking_id = p_booking and h.status = 'agreed';
  if v_to is null then
    raise exception 'stay_not_finished';
  end if;

  insert into public.pet_medals (pet_id, booking_id, sitter_id, stay_from, stay_to)
  values (p_pet, p_booking, auth.uid(), v_from, v_to)
  on conflict (booking_id, pet_id) do nothing;

  select * into v_row from public.pet_medals where booking_id = p_booking and pet_id = p_pet;
  return v_row;
end;
$$;

revoke execute on function public.award_pet_medal(uuid, uuid) from public, anon;
grant execute on function public.award_pet_medal(uuid, uuid) to authenticated, service_role;
