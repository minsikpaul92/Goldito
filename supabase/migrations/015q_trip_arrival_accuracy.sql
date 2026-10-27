-- 015q (#381, Owner-026): a trip arrives only when the traveller is really there.
--
-- Before, one position within 150 m of the destination ended the trip, so one jump of a Wi-Fi or IP fix (off by
-- hundreds of metres) said "You've arrived" while the car was still 400 m away. Now:
-- * update_trip_position takes the reading's accuracy in metres (p_accuracy, from the browser's GPS). A reading whose
--   accuracy is worse than 100 m is stored and moves the map, but it never counts for the arrival or for the
--   "about 5 minutes away" notice, and it does not break a run of good readings. No accuracy (a simulated drive, an
--   older app) counts as good.
-- * trips.close_readings counts the good readings in a row within 150 m; a good reading outside 150 m sets it back to
--   0. The second one in a row ends the trip as `arrived`. After that positions are no longer stored, so the last
--   position is the one that ended the trip.
-- "I've arrived" by hand (end_trip) does not change.

alter table public.trips add column close_readings smallint not null default 0;

-- The old signature would stay next to the new one and make a 3-argument call ambiguous.
drop function public.update_trip_position(uuid, double precision, double precision);

create function public.update_trip_position(
  p_trip uuid, p_lat double precision, p_lng double precision, p_accuracy double precision default null
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
  v_good boolean;
  v_close smallint;
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
  if not t.sharing then
    raise exception 'not_sharing';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
    or p_accuracy < 0 then
    raise exception 'invalid_position';
  end if;
  if t.status = 'arrived' or (t.last_at is not null and v_now - t.last_at < interval '1 second') then
    return t;
  end if;

  v_good := p_accuracy is null or p_accuracy <= 100;
  v_close := t.close_readings;
  if t.dest_lat is not null then
    v_dist := public.distance_m(p_lat, p_lng, t.dest_lat, t.dest_lng);
    if v_good then
      v_close := case when v_dist <= 150 then least(t.close_readings + 1, 2) else 0 end;
    end if;
  end if;

  update public.trips set
    last_lat = p_lat,
    last_lng = p_lng,
    last_at = v_now,
    distance_m = round(v_dist)::int,
    eta_at = case when v_dist is not null then public.trip_eta(v_now, v_dist) end,
    close_readings = v_close
  where id = p_trip
  returning * into t;

  if v_close >= 2 then
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
  elsif v_dist is not null and v_good and t.near_notified_at is null and t.eta_at <= v_now + interval '5 minutes' then
    -- 014r: once per trip, when the ETA is 5 minutes away or less.
    update public.trips set near_notified_at = v_now where id = p_trip returning * into t;
    select * into b from public.bookings where id = t.booking_id;
    select display_name into v_name from public.profiles where id = t.traveler_id;
    perform public.notify_user(
      case when t.traveler_id = b.owner_id then b.sitter_id else b.owner_id end, 'trip_near',
      format('%s is about 5 minutes away 🚗', coalesce(v_name, 'Your contact')),
      null, null, t.booking_id, t.id
    );
  end if;

  return t;
end;
$$;

revoke execute on function public.update_trip_position(uuid, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.update_trip_position(uuid, double precision, double precision, double precision)
  to authenticated, service_role;

notify pgrst, 'reload schema';
