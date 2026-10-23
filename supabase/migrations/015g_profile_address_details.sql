-- 015g: Profile home address keeps its details and postal code apart (#180).
--
-- * home_address_2: unit, floor, buzzer ("Unit 1204, buzz 55"). Optional.
-- * home_postal_code: the postal code. Optional.
-- Both sit on owner_profiles and sitter_profiles next to home_address and follow its rules: the person edits their
-- own, a sitter's stay out of the public sitter list (the column grant in 002 names the readable columns, so a
-- new column is hidden), and the booking parties get them through get_handoff_details.
--
-- * full_address(details, street, postal): "Unit 1204, 55 Mill St, Toronto, ON M5A 3C4". The postal code is left
--   off when the street line already ends with it (addresses saved before this file carry it inside home_address).
-- * get_handoff_details: the drop-off / pick-up address is that full text. Same columns and rules as 009e.

alter table public.owner_profiles
  add column home_address_2 text check (char_length(home_address_2) <= 120),
  add column home_postal_code text check (char_length(home_postal_code) <= 10);

alter table public.sitter_profiles
  add column home_address_2 text check (char_length(home_address_2) <= 120),
  add column home_postal_code text check (char_length(home_postal_code) <= 10);

grant update (home_address_2, home_postal_code) on public.owner_profiles to authenticated;
grant update (home_address_2, home_postal_code) on public.sitter_profiles to authenticated;

create or replace function public.full_address(p_details text, p_street text, p_postal text)
returns text
language sql
immutable
as $$
  select nullif(btrim(
    concat_ws(', ', nullif(btrim(p_details), ''), nullif(btrim(p_street), ''))
    || case
         when nullif(btrim(p_postal), '') is not null
          and position(upper(replace(btrim(p_postal), ' ', '')) in upper(replace(coalesce(p_street, ''), ' ', ''))) = 0
         then ' ' || upper(btrim(p_postal))
         else ''
       end
  ), '')
$$;

revoke execute on function public.full_address(text, text, text) from public, anon, authenticated;

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
    case when h.location_type = 'sitter_home' then (
      select sp.packing_list from public.sitter_profiles sp where sp.id = b.sitter_id
    ) end,
    h.completed_at
  from public.booking_handoffs h
  where h.booking_id = p_booking and h.status = 'agreed'
  order by h.kind;
end;
$$;
