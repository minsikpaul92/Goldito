-- 014u: an early Returned gives the sitter the rest of the stay back (#232).
--
-- booking_slots holds one row per pet × day × slot of a stay, and sitter_used() (011l) counts the rows of every
-- confirmed booking. Nothing removed them when the pets went home, so after an early Returned the sitter stayed
-- booked until the originally agreed pick-up (found on the hosted DB: Returned on day one, 26 rows still holding
-- Oct 20 to Oct 24).
--
-- Now, when the pick-up handoff gets its completed_at, the booking's slots that START at or after that moment are
-- deleted. The slot the return falls in, and every slot before it, stays (the stay used it). Slot times are the same
-- ones slots_for_window (003) used to write them: the sitter's own opening hours for that day and slot, else the
-- default slot range. A return at or after the agreed pick-up deletes nothing, because no slot of the stay starts
-- after its end. The rows are capacity only (no earnings or history read them), so nothing else changes.
--
-- A trigger rather than a new complete_handoff (012): every way a pick-up gets completed goes through it.

create or replace function public.release_slots_after(p_booking uuid, p_at timestamptz)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sitter uuid;
  v_count int;
begin
  select sitter_id into v_sitter from public.bookings where id = p_booking;
  delete from public.booking_slots s
  where s.booking_id = p_booking
    and lower(coalesce(
      public.sitter_hours(v_sitter, s.day, s.slot),
      public.default_slot_range(v_sitter, s.day, s.slot)
    )) >= p_at;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.release_slots_on_return()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'pick_up' and new.completed_at is not null and old.completed_at is null then
    perform public.release_slots_after(new.booking_id, new.completed_at);
  end if;
  return new;
end;
$$;

create trigger booking_handoffs_release_slots
  after update of completed_at on public.booking_handoffs
  for each row execute function public.release_slots_on_return();

revoke execute on function
  public.release_slots_after(uuid, timestamptz),
  public.release_slots_on_return()
from public, anon, authenticated;

-- Stays that were already returned early before this migration (the hosted DB has at least one).
select public.release_slots_after(h.booking_id, h.completed_at)
from public.booking_handoffs h
where h.kind = 'pick_up' and h.completed_at is not null;
