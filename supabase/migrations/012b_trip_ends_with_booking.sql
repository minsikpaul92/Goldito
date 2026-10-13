-- 012b (CR-1, code review 2026-10-13): a live trip ends when its booking does.
--
-- A drop-off trip can start 2 h before the agreed time (start_trip, 012), and the booking can still be cancelled
-- until Received (cancel_booking, 003). The trip then stayed `en_route`: the traveller's device kept storing
-- positions through update_trip_position, the other person could still read them (trips_select), and both Home
-- screens kept saying "on the way". Now a booking that leaves `confirmed` cancels its live trips and erases the
-- position in the same transaction; the traveller's next position gets `trip_not_active`, which stops the app's
-- location source (TripProvider).

create or replace function public.end_trips_when_booking_ends()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.trips set
    status = 'cancelled',
    last_lat = null, last_lng = null, last_at = null, eta_at = null, distance_m = null,
    ended_at = now()
  where booking_id = new.id and status in ('en_route', 'arrived');
  return new;
end;
$$;

create trigger bookings_end_trips
  after update of status on public.bookings
  for each row
  when (old.status = 'confirmed' and new.status is distinct from 'confirmed')
  execute function public.end_trips_when_booking_ends();

revoke execute on function public.end_trips_when_booking_ends() from public, anon, authenticated;
