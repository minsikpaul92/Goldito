-- 014s: "Done, we met" also works before the agreed Meet & Greet time (#229).
--
-- 005 refused it with meet_greet_not_yet until the agreed time had come, so the card said "After you meet, tap Done
-- here" while there was no Done button yet. People do meet early (or the time was set loosely), so either side may now
-- mark it done any time after it is agreed; the app asks "It is not time yet. Did you already meet?" first.
-- A second press (the other side, or a stale screen) is a no-op instead of invalid_status, so both presses are safe.
-- Everything else is as in 005. Grants stay with the function.

create or replace function public.complete_meet_greet(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
begin
  b := public.meet_greet_booking(p_booking);
  if b.meet_greet_status = 'done' then
    return;
  end if;
  if b.meet_greet_status <> 'agreed' then
    raise exception 'invalid_status';
  end if;
  update public.bookings set meet_greet_status = 'done' where id = p_booking;
end;
$$;
