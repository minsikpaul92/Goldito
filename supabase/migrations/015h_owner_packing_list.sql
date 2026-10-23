-- 015h: The packing list belongs to the owner (#180).
--
-- The owner writes what goes with the pet (owner_profiles.packing_list, up to 20 items). The sitter reads it on the
-- drop-off handoff and ticks it when the pet is handed over. get_handoff_details returns that list on the drop-off
-- row, for both parties, in place of the sitter's own list.
--
-- sitter_profiles.packing_list (006) stays in the table and is no longer read or written by the app.

alter table public.owner_profiles
  add column packing_list text[] not null default '{}' check (cardinality(packing_list) <= 20);

grant update (packing_list) on public.owner_profiles to authenticated;

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
      when 'sitter_home' then (
        select public.full_address(sp.home_address_2, sp.home_address, sp.home_postal_code)
        from public.sitter_profiles sp where sp.id = b.sitter_id
      )
      when 'owner_home' then (
        select public.full_address(op.home_address_2, op.home_address, op.home_postal_code)
        from public.owner_profiles op where op.id = b.owner_id
      )
      else h.location_note
    end,
    case when h.location_type = 'sitter_home' then (
      select sp.visitor_parking from public.sitter_profiles sp where sp.id = b.sitter_id
    ) end,
    case when h.location_type = 'sitter_home' then (
      select sp.lobby_notes from public.sitter_profiles sp where sp.id = b.sitter_id
    ) end,
    case when h.kind = 'drop_off' then (
      select op.packing_list from public.owner_profiles op where op.id = b.owner_id
    ) end,
    h.completed_at
  from public.booking_handoffs h
  where h.booking_id = p_booking and h.status = 'agreed'
  order by h.kind;
end;
$$;
