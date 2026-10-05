-- While a stay is on (booking confirmed, pet not yet picked up) the owner can no longer ADD care tasks
-- or Heads-ups directly: they send a care request and the sitter answers it (008g/008h). Approving a
-- request inserts through security definer functions, which are not affected by these policies.
-- Editing or removing what is already there is unchanged.

create or replace function public.pet_has_open_stay(p_pet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    join public.booking_pets bp on bp.booking_id = b.id and bp.pet_id = p_pet and bp.active
    where b.status = 'confirmed'
      and not exists (
        select 1 from public.booking_handoffs h
        where h.booking_id = b.id and h.kind = 'pick_up' and h.completed_at is not null
      )
  )
$$;
revoke execute on function public.pet_has_open_stay(uuid) from public, anon;
grant execute on function public.pet_has_open_stay(uuid) to authenticated, service_role;

drop policy care_tasks_insert on public.care_tasks;
create policy care_tasks_insert on public.care_tasks
  for insert to authenticated
  with check (public.is_owner_of(pet_id) and not public.pet_has_open_stay(pet_id));

drop policy pet_cautions_insert on public.pet_cautions;
create policy pet_cautions_insert on public.pet_cautions
  for insert to authenticated
  with check (public.is_owner_of(pet_id) and not public.pet_has_open_stay(pet_id));
