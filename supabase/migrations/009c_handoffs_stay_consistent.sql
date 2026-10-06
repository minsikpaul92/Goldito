-- Review fix (2026-10-06): handoffs stay consistent once they happened or their time passed.
--
-- 1. A handoff the sitter already checked (Received / Returned) keeps its status. Accepting a leftover
--    proposal of the same kind used to supersede the completed row, which re-opened the stay: entry codes
--    visible again until the new time, Received / Returned shown again, cancel allowed while the pet was
--    with the sitter. Checking a handoff now also closes that kind's open proposals.
-- 2. A proposed time that has already passed can't be accepted (`proposal_expired`) — propose_handoff
--    already refuses past times when they are suggested. A request whose agreed pick-up has passed can't be
--    confirmed (`request_expired`): it would sit in Upcoming forever and could still be paid for.
-- 3. House sitting happens at the owner's home: its handoffs stay `owner_home` (request_booking sets it;
--    a later change of place could move them and reveal the sitter's address).

create or replace function public.guard_handoff_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.completed_at is not null and new.status is distinct from old.status then
    raise exception 'handoff_completed';
  end if;
  if old.status = 'proposed' and new.status = 'agreed' and new.scheduled_at < now() then
    raise exception 'proposal_expired';
  end if;
  return new;
end;
$$;

create trigger booking_handoffs_guard_update
  before update on public.booking_handoffs
  for each row execute function public.guard_handoff_update();

create or replace function public.close_proposals_after_handoff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.completed_at is not null and old.completed_at is null then
    update public.booking_handoffs
    set status = 'superseded', responded_at = now()
    where booking_id = new.booking_id and kind = new.kind and status = 'proposed';
  end if;
  return new;
end;
$$;

create trigger booking_handoffs_close_proposals
  after update of completed_at on public.booking_handoffs
  for each row execute function public.close_proposals_after_handoff();

create or replace function public.guard_booking_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'requested' and new.status = 'confirmed' and exists (
    select 1 from public.booking_handoffs h
    where h.booking_id = new.id and h.kind = 'pick_up' and h.status = 'agreed' and h.scheduled_at <= now()
  ) then
    raise exception 'request_expired';
  end if;
  return new;
end;
$$;

create trigger bookings_guard_confirm
  before update of status on public.bookings
  for each row execute function public.guard_booking_confirm();

create or replace function public.guard_house_sitting_place()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.location_type <> 'owner_home' and exists (
    select 1 from public.bookings b where b.id = new.booking_id and b.service_type = 'house_sitting'
  ) then
    raise exception 'invalid_location';
  end if;
  return new;
end;
$$;

create trigger booking_handoffs_house_sitting_place
  before insert or update of location_type on public.booking_handoffs
  for each row execute function public.guard_house_sitting_place();

-- Pending proposals of handoffs that already happened are closed now.
update public.booking_handoffs p
set status = 'superseded', responded_at = now()
where p.status = 'proposed'
  and exists (
    select 1 from public.booking_handoffs h
    where h.booking_id = p.booking_id and h.kind = p.kind and h.status = 'agreed' and h.completed_at is not null
  );

revoke execute on function public.guard_handoff_update() from public, anon, authenticated;
revoke execute on function public.close_proposals_after_handoff() from public, anon, authenticated;
revoke execute on function public.guard_booking_confirm() from public, anon, authenticated;
revoke execute on function public.guard_house_sitting_place() from public, anon, authenticated;
