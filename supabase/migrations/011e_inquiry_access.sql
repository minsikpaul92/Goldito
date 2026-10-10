-- 011e (RV-4 + the access part of RV-5, FB-31): what a sitter who was asked may see.
--
-- RV-4 / FB-31: an owner with no booking yet asked Chloe a question. Chloe's Questions card read "An owner ·",
-- the thread "The owner", no pet names — `profiles_select` only opens names to people with a booking
-- (`has_booking_with`), and `pets_select` / `pet_allergies_select` only to a booked or requested sitter. The AI
-- draft still said "Hi Robert" (the server reads with the service role), so the sitter saw less than the AI.
--
-- RV-5: `has_open_inquiry_about` (011) never expired — an inquiry stays `open` forever, so every sitter an owner
-- ever asked could keep reading that pet's Life Records. Now it ends with the stay asked about, and after 30 days.
--
-- Not here (RV-5, later): closing other open inquiries when a booking is made, `match_knowledge` returning
-- `pet_id`, and the backend refusing a draft for a closed inquiry.

-- Open = still asked about: open, the asked stay not over, asked in the last 30 days.
create or replace function public.has_open_inquiry_about(p_pet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.inquiries i
    where i.sitter_id = auth.uid()
      and i.status = 'open'
      and p_pet = any (i.pet_ids)
      and i.pick_up_at > now()
      and i.created_at > now() - interval '30 days'
  )
$$;

-- Names: anyone the caller has an inquiry with, whatever its status — the same level as a booking request.
create or replace function public.has_inquiry_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.inquiries
    where (owner_id = auth.uid() and sitter_id = other)
       or (sitter_id = auth.uid() and owner_id = other)
  )
$$;

revoke execute on function public.has_inquiry_with(uuid) from public, anon;
grant execute on function public.has_inquiry_with(uuid) to authenticated, service_role;

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid()) or role = 'sitter'
    or public.has_booking_with(id) or public.has_inquiry_with(id)
  );

-- The pet profile and allergies for a sitter with an open inquiry about the pet. `can_view_pet_profile` itself
-- stays as it is: care tasks and other tables use it too.
drop policy pets_select on public.pets;
create policy pets_select on public.pets
  for select to authenticated
  using (public.can_view_pet_profile(id) or public.has_open_inquiry_about(id));

drop policy pet_allergies_select on public.pet_allergies;
create policy pet_allergies_select on public.pet_allergies
  for select to authenticated
  using (public.can_view_pet_profile(pet_id) or public.has_open_inquiry_about(pet_id));

notify pgrst, 'reload schema';
