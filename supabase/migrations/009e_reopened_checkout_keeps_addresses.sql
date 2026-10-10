-- Review fix BF.7 (2026-10-06): a reopened checkout keeps the handoff addresses.
--
-- 009d reopens checkout (paid_at cleared, price_snapshot kept) when an agreed change needs a new consent.
-- get_handoff_details still answered `not_paid` whenever paid_at was null, so mid-stay the sitter lost the
-- drop-off / pick-up addresses — including where to bring the pet back — and the owner lost the sitter's
-- place card, while the owner profile (address, emergency contact) stayed visible through 009d's
-- has_current_booking_with. Addresses now follow the same rule: a booking paid at least once
-- (price_snapshot is set only by payment). Only the entry codes (get_home_access) wait for the new consent.

create or replace function public.get_handoff_details(p_booking uuid)
returns table (
  handoff_id uuid,
  kind text,
  scheduled_at timestamptz,
  location_type text,
  address text,
  visitor_parking text,
  lobby_notes text,
  packing_list text[],
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking;
  if not found or auth.uid() is null or auth.uid() not in (b.owner_id, b.sitter_id) then
    raise exception 'not_allowed';
  end if;
  if b.status <> 'confirmed' then
    raise exception 'invalid_status';
  end if;
  if b.paid_at is null and b.price_snapshot is null then
    raise exception 'not_paid';
  end if;
  if not exists (
    select 1 from public.booking_handoffs p
    where p.booking_id = p_booking and p.kind = 'pick_up' and p.status = 'agreed'
      and p.scheduled_at + interval '24 hours' > now()
  ) then
    raise exception 'booking_finished';
  end if;

  return query
  select h.id, h.kind, h.scheduled_at, h.location_type,
    case h.location_type
      when 'sitter_home' then (select sp.home_address from public.sitter_profiles sp where sp.id = b.sitter_id)
      when 'owner_home' then (select op.home_address from public.owner_profiles op where op.id = b.owner_id)
      else h.location_note
    end,
    case when h.location_type = 'sitter_home' then (
      select sp.visitor_parking from public.sitter_profiles sp where sp.id = b.sitter_id
    ) end,
    case when h.location_type = 'sitter_home' then (
      select sp.lobby_notes from public.sitter_profiles sp where sp.id = b.sitter_id
    ) end,
    case when h.location_type = 'sitter_home' then (
      select sp.packing_list from public.sitter_profiles sp where sp.id = b.sitter_id
    ) end,
    h.completed_at
  from public.booking_handoffs h
  where h.booking_id = p_booking and h.status = 'agreed'
  order by h.kind;
end;
$$;
