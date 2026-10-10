-- The care window starts when the pets really arrive, if that is earlier than agreed.
--
-- `care_window` was [agreed drop-off, agreed pick-up). The sitter's Received works from 2 hours before the
-- agreed drop-off, so an owner who comes early was received at 9:37 for a 10:22 drop-off — and every
-- check-in, task and photo said `not_in_care_window` until 10:22, with the pets already there.
-- Now the window starts at the earlier of the agreed time and the time Received was tapped.
-- Only the start moves: the end is still the agreed pick-up (Returned does not close the window here).
-- Everything that asks "is the sitter on duty / inside the care window" goes through this function.

create or replace function public.care_window(pet uuid, sitter uuid)
returns setof tstzrange
language sql
stable
set search_path = public
as $$
  select tstzrange(least(d.scheduled_at, coalesce(d.completed_at, d.scheduled_at)), p.scheduled_at, '[)')
  from public.bookings b
  join public.booking_pets bp on bp.booking_id = b.id and bp.pet_id = pet and bp.active
  join public.booking_handoffs d
    on d.booking_id = b.id and d.kind = 'drop_off' and d.status = 'agreed'
  join public.booking_handoffs p
    on p.booking_id = b.id and p.kind = 'pick_up' and p.status = 'agreed'
  where b.sitter_id = sitter
    and b.status = 'confirmed'
$$;
