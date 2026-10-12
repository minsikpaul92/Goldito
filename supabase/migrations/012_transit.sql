-- Phase 06B (6B.1, D28 · D32): Pet Transit — the person who travels to a handoff shares a live position.
--
-- * home_lat / home_lng on both profiles: where the handoff place is on a map ("Use my current location" or a seeded
--   demo point; no geocoding). The owner and the sitter edit their own; the other party only ever gets the point as the
--   destination of a trip they are part of. Not in the public sitter list (the column-listed select in 002 does not
--   include them).
-- * trips: ONE row per handoff trip, holding only the LAST position (no route history). The row is readable by the
--   two people on the booking and written only through the RPCs below. When the trip ends the position is erased.
-- * start_trip / update_trip_position / end_trip. ETA is a straight line × 1.3 at 30 km/h (D32, no routing API);
--   within 150 m of the destination the trip becomes `arrived` and both people are told once.
-- * Realtime: `trips` is published so the other person's screen follows without a refresh (RLS applies).
-- * handoff_checks: the vision model's read of the handoff photo (ok / warning / unchecked), written by the backend.

-- ---------------------------------------------------------------------------
-- Home location
-- ---------------------------------------------------------------------------

alter table public.owner_profiles
  add column home_lat double precision,
  add column home_lng double precision,
  add constraint owner_profiles_home_point check (
    (home_lat is null) = (home_lng is null)
    and (home_lat is null or (home_lat between -90 and 90 and home_lng between -180 and 180))
  );

alter table public.sitter_profiles
  add column home_lat double precision,
  add column home_lng double precision,
  add constraint sitter_profiles_home_point check (
    (home_lat is null) = (home_lng is null)
    and (home_lat is null or (home_lat between -90 and 90 and home_lng between -180 and 180))
  );

grant update (home_lat, home_lng) on public.owner_profiles to authenticated;
grant update (home_lat, home_lng) on public.sitter_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  handoff_kind text not null check (handoff_kind in ('drop_off', 'pick_up')),
  traveler_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'en_route' check (status in ('en_route', 'arrived', 'completed', 'cancelled')),
  dest_lat double precision,
  dest_lng double precision,
  last_lat double precision,
  last_lng double precision,
  last_at timestamptz,
  eta_at timestamptz,
  distance_m int,
  simulated boolean not null default false,
  started_at timestamptz not null default now(),
  arrived_at timestamptz,
  ended_at timestamptz,
  check ((dest_lat is null) = (dest_lng is null)),
  check ((last_lat is null) = (last_lng is null))
);

-- One live trip per handoff.
create unique index trips_live_key on public.trips (booking_id, handoff_kind)
  where status in ('en_route', 'arrived');
create index trips_booking_idx on public.trips (booking_id);

alter table public.trips enable row level security;

create policy trips_select on public.trips
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and (select auth.uid()) in (b.owner_id, b.sitter_id)
    )
  );

-- Written only through start_trip / update_trip_position / end_trip.
revoke all on public.trips from anon, authenticated;
grant select on public.trips to authenticated;
grant all on public.trips to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trips'
  ) then
    alter publication supabase_realtime add table public.trips;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Distance + ETA (D32)
-- ---------------------------------------------------------------------------

-- Great-circle distance in metres (haversine).
create or replace function public.distance_m(
  p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision
)
returns double precision
language sql
immutable
set search_path = public
as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  )))
$$;

revoke execute on function public.distance_m(double precision, double precision, double precision, double precision)
  from public, anon, authenticated;

-- Straight line × 1.3 at 30 km/h.
create or replace function public.trip_eta(p_now timestamptz, p_distance_m double precision)
returns timestamptz
language sql
immutable
set search_path = public
as $$ select p_now + make_interval(secs => p_distance_m * 1.3 / (30000.0 / 3600)) $$;

revoke execute on function public.trip_eta(timestamptz, double precision) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- start_trip
-- ---------------------------------------------------------------------------

-- The traveler follows D28: the place is the sitter's home → the owner drives; the owner's home → the sitter drives;
-- anywhere else → either of them. Allowed once the booking is paid and from 2 h before the agreed time (the same
-- window as Received). A first position may come with it, so the other person's notice can say when to expect them.
create or replace function public.start_trip(
  p_booking uuid, p_kind text, p_simulated boolean default false,
  p_lat double precision default null, p_lng double precision default null
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_h public.booking_handoffs;
  v_trip public.trips;
  v_other uuid;
  v_name text;
  v_dest_lat double precision;
  v_dest_lng double precision;
  v_dist double precision;
  v_eta timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found or auth.uid() not in (b.owner_id, b.sitter_id) then
    raise exception 'not_allowed';
  end if;
  if b.status <> 'confirmed' then
    raise exception 'invalid_status';
  end if;
  if b.paid_at is null then
    raise exception 'not_paid';
  end if;
  if p_kind is null or p_kind not in ('drop_off', 'pick_up') then
    raise exception 'invalid_kind';
  end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'invalid_position';
  end if;

  select * into v_h from public.booking_handoffs
  where booking_id = p_booking and kind = p_kind and status = 'agreed';
  if v_h.id is null then
    raise exception 'handoff_missing';
  end if;
  if v_h.completed_at is not null then
    raise exception 'handoff_completed';
  end if;
  if p_kind = 'pick_up' and not exists (
    select 1 from public.booking_handoffs
    where booking_id = p_booking and kind = 'drop_off' and status = 'agreed' and completed_at is not null
  ) then
    raise exception 'drop_off_not_completed';
  end if;
  if v_now < v_h.scheduled_at - interval '2 hours' then
    raise exception 'trip_too_early';
  end if;

  if (v_h.location_type = 'sitter_home' and auth.uid() <> b.owner_id)
     or (v_h.location_type = 'owner_home' and auth.uid() <> b.sitter_id) then
    raise exception 'not_traveler';
  end if;
  if exists (
    select 1 from public.trips
    where booking_id = p_booking and handoff_kind = p_kind and status in ('en_route', 'arrived')
  ) then
    raise exception 'trip_active';
  end if;

  -- Destination: the place's point; "somewhere else" has none (the place is only text), so no map and no ETA.
  if v_h.location_type = 'sitter_home' then
    select sp.home_lat, sp.home_lng into v_dest_lat, v_dest_lng from public.sitter_profiles sp where sp.id = b.sitter_id;
  elsif v_h.location_type = 'owner_home' then
    select op.home_lat, op.home_lng into v_dest_lat, v_dest_lng from public.owner_profiles op where op.id = b.owner_id;
  end if;

  if p_lat is not null and v_dest_lat is not null then
    v_dist := public.distance_m(p_lat, p_lng, v_dest_lat, v_dest_lng);
    v_eta := public.trip_eta(v_now, v_dist);
  end if;

  insert into public.trips (
    booking_id, handoff_kind, traveler_id, dest_lat, dest_lng,
    last_lat, last_lng, last_at, eta_at, distance_m, simulated, started_at
  )
  values (
    p_booking, p_kind, auth.uid(), v_dest_lat, v_dest_lng,
    p_lat, p_lng, case when p_lat is not null then v_now end, v_eta, round(v_dist)::int,
    coalesce(p_simulated, false), v_now
  )
  returning * into v_trip;

  v_other := case when auth.uid() = b.owner_id then b.sitter_id else b.owner_id end;
  select display_name into v_name from public.profiles where id = auth.uid();
  perform public.notify_user(
    v_other, 'trip_started',
    case when v_eta is not null
      then format('%s is on the way — ETA %s 🚗', coalesce(v_name, 'Your contact'), public.fmt_local_time(v_eta))
      else format('%s is on the way 🚗', coalesce(v_name, 'Your contact'))
    end,
    null, null, p_booking, v_trip.id
  );

  return v_trip;
end;
$$;

revoke execute on function public.start_trip(uuid, text, boolean, double precision, double precision) from public, anon;
grant execute on function public.start_trip(uuid, text, boolean, double precision, double precision)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- update_trip_position
-- ---------------------------------------------------------------------------

-- Keeps the LAST position only. A call within a second of the previous one is ignored; within 150 m of the
-- destination the trip becomes `arrived` (once) and both people are told. After that, positions are no longer stored.
create or replace function public.update_trip_position(
  p_trip uuid, p_lat double precision, p_lng double precision
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips;
  b public.bookings;
  v_dist double precision;
  v_now timestamptz := clock_timestamp();
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into t from public.trips where id = p_trip for update;
  if not found or t.traveler_id <> auth.uid() then
    raise exception 'not_allowed';
  end if;
  if t.status not in ('en_route', 'arrived') then
    raise exception 'trip_not_active';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_position';
  end if;
  if t.status = 'arrived' or (t.last_at is not null and v_now - t.last_at < interval '1 second') then
    return t;
  end if;

  if t.dest_lat is not null then
    v_dist := public.distance_m(p_lat, p_lng, t.dest_lat, t.dest_lng);
  end if;

  update public.trips set
    last_lat = p_lat,
    last_lng = p_lng,
    last_at = v_now,
    distance_m = round(v_dist)::int,
    eta_at = case when v_dist is not null then public.trip_eta(v_now, v_dist) end
  where id = p_trip
  returning * into t;

  if v_dist is not null and v_dist <= 150 then
    update public.trips set status = 'arrived', arrived_at = v_now where id = p_trip returning * into t;
    select * into b from public.bookings where id = t.booking_id;
    select display_name into v_name from public.profiles where id = t.traveler_id;
    perform public.notify_user(
      case when t.traveler_id = b.owner_id then b.sitter_id else b.owner_id end, 'trip_arrived',
      format('%s has arrived 🚗', coalesce(v_name, 'Your contact')),
      null, null, t.booking_id, t.id
    );
    perform public.notify_user(
      t.traveler_id, 'trip_arrived', 'You''ve arrived 📍', null, null, t.booking_id, t.id
    );
  end if;

  return t;
end;
$$;

revoke execute on function public.update_trip_position(uuid, double precision, double precision) from public, anon;
grant execute on function public.update_trip_position(uuid, double precision, double precision)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- end_trip
-- ---------------------------------------------------------------------------

-- The traveler ends (or cancels) their own trip. The position, ETA and distance are erased with it.
create or replace function public.end_trip(p_trip uuid, p_cancel boolean default false)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into t from public.trips where id = p_trip for update;
  if not found or t.traveler_id <> auth.uid() then
    raise exception 'not_allowed';
  end if;
  if t.status in ('completed', 'cancelled') then
    return t;
  end if;
  update public.trips set
    status = case when coalesce(p_cancel, false) then 'cancelled' else 'completed' end,
    last_lat = null, last_lng = null, last_at = null, eta_at = null, distance_m = null,
    ended_at = now()
  where id = p_trip
  returning * into t;
  return t;
end;
$$;

revoke execute on function public.end_trip(uuid, boolean) from public, anon;
grant execute on function public.end_trip(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- handoff_checks (6B.5): what the vision model made of the sitter's handoff photo
-- ---------------------------------------------------------------------------

-- One row per photo check, written by the backend (service role) from POST /api/ai/handoff-check — `unchecked`
-- (the model failed or timed out) is stored too, so Received can still point at the photo. The two people on the
-- booking read it; only the sitter may add their reason for continuing past a warning.
create table public.handoff_checks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  handoff_kind text not null check (handoff_kind in ('drop_off', 'pick_up')),
  check_type text not null check (check_type in ('pet_checkin', 'vehicle_safety', 'return')),
  media_id uuid references public.media (id) on delete set null,
  status text not null check (status in ('ok', 'warning', 'unchecked')),
  findings jsonb not null default '{}',
  override_reason text check (override_reason is null or char_length(override_reason) <= 200),
  model text,
  latency_ms int,
  created_at timestamptz not null default now()
);

create index handoff_checks_booking_idx on public.handoff_checks (booking_id, handoff_kind, created_at desc);

alter table public.handoff_checks enable row level security;

create policy handoff_checks_select on public.handoff_checks
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and (select auth.uid()) in (b.owner_id, b.sitter_id)
    )
  );

create policy handoff_checks_update on public.handoff_checks
  for update to authenticated
  using (
    exists (select 1 from public.bookings b where b.id = booking_id and b.sitter_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.bookings b where b.id = booking_id and b.sitter_id = (select auth.uid()))
  );

revoke all on public.handoff_checks from anon, authenticated;
grant select on public.handoff_checks to authenticated;
grant update (override_reason) on public.handoff_checks to authenticated;
grant all on public.handoff_checks to service_role;

notify pgrst, 'reload schema';
