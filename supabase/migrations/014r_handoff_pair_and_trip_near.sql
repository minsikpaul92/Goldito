-- 014r (3D.8, #145 and #169): a drop-off and pick-up suggestion is one pair; the owner keeps a default handoff place;
-- the traveller's 5-minute notice.
--
-- 1. booking_handoffs.pair_id: the two rows (drop-off + pick-up) of one suggestion share a key. `propose_handoff_pair`
--    writes both in one transaction with ONE notice, and `respond_handoff` answers both together, whatever the times
--    (012c only paired them when a time did not fit alone, and only after confirm). Rows with no key work as before:
--    one suggestion, one answer, and the 012c rule when a time does not fit the other handoff.
--    The two rows stay (current_handoff, rebuild_booking, trips and the history all read one row per kind). A suggestion
--    that replaces one row of a pair leaves the other as a single one (trigger below).
-- 2. owner_profiles.default_handoff: where the owner usually hands over (the sitter's place, the owner's place, elsewhere).
--    The request opens with it and remembers the last choice. The sitter's default is the onboarding answer `handoff`
--    (014f / 014h); nothing new is stored for them.
-- 3. trips.near_notified_at + update_trip_position: when the ETA is 5 minutes away or less the other person gets one
--    `trip_near` notice ("is about 5 minutes away"), once per trip. The rest of the function is as in 012.

-- ---------------------------------------------------------------------------
-- 1. Pairs
-- ---------------------------------------------------------------------------

alter table public.booking_handoffs add column pair_id uuid;
create index booking_handoffs_pair_idx on public.booking_handoffs (pair_id) where pair_id is not null;

-- One row of a pair was replaced by a newer suggestion: its partner is a single suggestion from now on.
create or replace function public.clear_pair_on_supersede()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pair_id is not null and new.status = 'superseded' and old.status = 'proposed' then
    update public.booking_handoffs set pair_id = null
    where pair_id = new.pair_id and id <> new.id and status = 'proposed';
  end if;
  return new;
end;
$$;

create trigger booking_handoffs_clear_pair
  after update of status on public.booking_handoffs
  for each row execute function public.clear_pair_on_supersede();

revoke execute on function public.clear_pair_on_supersede() from public, anon, authenticated;

-- A new time and place for the drop-off AND the pick-up, as one suggestion. Same checks as propose_handoff (012c), for
-- both rows; both times have to be new (to move only one, use propose_handoff). Returns the pair id.
create or replace function public.propose_handoff_pair(
  p_booking uuid,
  p_drop_at timestamptz,
  p_pick_at timestamptz,
  p_drop_type text default null,
  p_drop_note text default null,
  p_pick_type text default null,
  p_pick_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_uid uuid := auth.uid();
  v_cur_drop public.booking_handoffs;
  v_cur_pick public.booking_handoffs;
  v_drop_type text;
  v_drop_note text;
  v_pick_type text;
  v_pick_note text;
  v_bad text;
  v_pair uuid := gen_random_uuid();
  v_name text;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or v_uid is null or v_uid not in (b.owner_id, b.sitter_id) then
    raise exception 'not_allowed';
  end if;
  if b.status not in ('requested', 'confirmed') then
    raise exception 'invalid_status';
  end if;
  if exists (
    select 1 from public.booking_handoffs where booking_id = p_booking and completed_at is not null
  ) then
    raise exception 'handoff_completed';
  end if;
  if p_drop_at is null or p_pick_at is null or p_drop_at < now() or p_pick_at <= p_drop_at then
    raise exception 'invalid_window';
  end if;

  select * into v_cur_drop from public.booking_handoffs
  where booking_id = p_booking and kind = 'drop_off' and status in ('proposed', 'agreed')
  order by (status = 'proposed') desc limit 1;
  select * into v_cur_pick from public.booking_handoffs
  where booking_id = p_booking and kind = 'pick_up' and status in ('proposed', 'agreed')
  order by (status = 'proposed') desc limit 1;
  if p_drop_type is null then
    v_drop_type := coalesce(v_cur_drop.location_type, 'sitter_home');
    v_drop_note := coalesce(p_drop_note, v_cur_drop.location_note);
  else
    v_drop_type := p_drop_type;
    v_drop_note := p_drop_note;
  end if;
  if p_pick_type is null then
    v_pick_type := coalesce(v_cur_pick.location_type, 'sitter_home');
    v_pick_note := coalesce(p_pick_note, v_cur_pick.location_note);
  else
    v_pick_type := p_pick_type;
    v_pick_note := p_pick_note;
  end if;
  v_drop_type := public.check_location(v_drop_type, v_drop_note);
  v_pick_type := public.check_location(v_pick_type, v_pick_note);

  if b.status = 'confirmed' then
    perform pg_advisory_xact_lock(hashtext(b.sitter_id::text));
    v_bad := public.capacity_shortfall(
      b.sitter_id, p_booking, cardinality(public.booking_pet_ids(p_booking)), p_drop_at, p_pick_at
    );
    if v_bad is not null then
      raise exception 'sitter_unavailable' using detail = v_bad;
    end if;
  end if;

  update public.booking_handoffs set status = 'superseded', responded_at = now()
  where booking_id = p_booking and status = 'proposed';

  insert into public.booking_handoffs
    (booking_id, kind, scheduled_at, location_type, location_note, within_sitter_hours, status, proposed_by, pair_id)
  values
    (p_booking, 'drop_off', p_drop_at, v_drop_type, v_drop_note,
     public.within_sitter_hours(b.sitter_id, p_drop_at), 'proposed', v_uid, v_pair),
    (p_booking, 'pick_up', p_pick_at, v_pick_type, v_pick_note,
     public.within_sitter_hours(b.sitter_id, p_pick_at), 'proposed', v_uid, v_pair);

  select display_name into v_name from public.profiles where id = v_uid;
  perform public.notify_user(
    case when v_uid = b.owner_id then b.sitter_id else b.owner_id end,
    'handoff_proposed',
    format('%s suggested a new drop-off and pick-up', v_name),
    format('%s · %s', public.booking_pet_names(p_booking),
      public.fmt_date_range(
        (p_drop_at at time zone public.app_timezone())::date, (p_pick_at at time zone public.app_timezone())::date)),
    null, p_booking, (select id from public.booking_handoffs where pair_id = v_pair and kind = 'drop_off')
  );
  return v_pair;
end;
$$;

revoke execute on function public.propose_handoff_pair(uuid, timestamptz, timestamptz, text, text, text, text) from public, anon;
grant execute on function public.propose_handoff_pair(uuid, timestamptz, timestamptz, text, text, text, text) to authenticated, service_role;

-- respond_handoff: as 012c, plus the explicit pair (answered together before or after confirm, whatever the times).
create or replace function public.respond_handoff(p_handoff uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.booking_handoffs;
  b public.bookings;
  v_uid uuid := auth.uid();
  v_other public.booking_handoffs;
  v_pair public.booking_handoffs;
  v_from timestamptz;
  v_to timestamptz;
  v_bad text;
  v_name text;
  v_label text;
begin
  select * into h from public.booking_handoffs where id = p_handoff;
  if not found then
    raise exception 'not_allowed';
  end if;
  select * into b from public.bookings where id = h.booking_id for update;
  select * into h from public.booking_handoffs where id = p_handoff for update;
  if v_uid is null or v_uid not in (b.owner_id, b.sitter_id) or v_uid = h.proposed_by then
    raise exception 'not_allowed';
  end if;
  if h.status <> 'proposed' or b.status not in ('requested', 'confirmed') then
    raise exception 'invalid_status';
  end if;

  select display_name into v_name from public.profiles where id = v_uid;
  v_label := replace(h.kind, '_', '-');

  -- 014r: the other row of an explicit pair.
  if h.pair_id is not null then
    select * into v_pair from public.booking_handoffs
    where pair_id = h.pair_id and id <> h.id and status = 'proposed' and completed_at is null
    for update;
    if v_pair.id is not null then
      v_from := case when h.kind = 'drop_off' then h.scheduled_at else v_pair.scheduled_at end;
      v_to := case when h.kind = 'pick_up' then h.scheduled_at else v_pair.scheduled_at end;
    end if;
  end if;

  -- CR-2: after confirm, an offer that only fits with the same person's offer for the other handoff is answered
  -- together with it.
  if v_pair.id is null and b.status = 'confirmed' then
    v_other := public.current_handoff(b.id,
      case when h.kind = 'drop_off' then 'pick_up' else 'drop_off' end);
    v_from := case when h.kind = 'drop_off' then h.scheduled_at else v_other.scheduled_at end;
    v_to := case when h.kind = 'pick_up' then h.scheduled_at else v_other.scheduled_at end;
    if v_from is not null and v_to is not null and v_to <= v_from then
      select * into v_pair from public.booking_handoffs
      where booking_id = b.id and kind <> h.kind and status = 'proposed' and proposed_by = h.proposed_by
        and completed_at is null
      for update;
      if v_pair.id is not null then
        v_from := case when h.kind = 'drop_off' then h.scheduled_at else v_pair.scheduled_at end;
        v_to := case when h.kind = 'pick_up' then h.scheduled_at else v_pair.scheduled_at end;
      end if;
    end if;
  end if;

  if not p_accept then
    update public.booking_handoffs set status = 'rejected', responded_at = now()
    where id in (h.id, v_pair.id);
    if b.status = 'requested' then
      -- Declining during pre-confirmation negotiation ends the request.
      if v_uid = b.sitter_id then
        update public.bookings set status = 'declined', responded_at = now() where id = b.id;
        perform public.notify_user(
          b.owner_id, 'booking_declined',
          format('%s declined your booking request', v_name),
          null, null, b.id, b.id
        );
      else
        update public.bookings
        set status = 'cancelled', cancelled_by = v_uid, cancel_reason = 'handoff_declined'
        where id = b.id;
        perform public.notify_user(
          b.sitter_id, 'booking_cancelled',
          format('%s cancelled the booking request', v_name),
          format('%s · %s', public.booking_pet_names(b.id), public.fmt_date_range(b.start_date, b.end_date)),
          null, b.id, b.id
        );
      end if;
    else
      perform public.notify_user(
        h.proposed_by, 'handoff_declined',
        case when v_pair.id is null
          then format('%s declined the %s change', v_name, v_label)
          else format('%s declined the drop-off and pick-up change', v_name)
        end,
        null, null, b.id, h.id
      );
    end if;
    return;
  end if;

  if b.status = 'confirmed' then
    if v_from is null or v_to is null or v_to <= v_from then
      raise exception 'invalid_window';
    end if;
    perform pg_advisory_xact_lock(hashtext(b.sitter_id::text));
    v_bad := public.capacity_shortfall(
      b.sitter_id, b.id, cardinality(public.booking_pet_ids(b.id)), v_from, v_to
    );
    if v_bad is not null then
      raise exception 'sitter_unavailable' using detail = v_bad;
    end if;
    perform public.rebuild_booking(b.id, v_from, v_to);
  end if;

  update public.booking_handoffs set status = 'superseded', responded_at = now()
  where booking_id = b.id and status = 'agreed'
    and (kind = h.kind or (v_pair.id is not null and kind = v_pair.kind));
  update public.booking_handoffs set status = 'agreed', responded_at = now() where id in (h.id, v_pair.id);

  perform public.notify_user(
    h.proposed_by, 'handoff_agreed',
    case when v_pair.id is null
      then format('%s agreed to %s at %s', v_name, v_label, public.fmt_local_time(h.scheduled_at))
      else format('%s agreed to the new drop-off and pick-up (%s)', v_name, public.fmt_date_range(
        (v_from at time zone public.app_timezone())::date, (v_to at time zone public.app_timezone())::date))
    end,
    null, null, b.id, h.id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The owner's default handoff place
-- ---------------------------------------------------------------------------

alter table public.owner_profiles
  add column default_handoff text check (default_handoff in ('sitter_home', 'owner_home', 'other'));

grant update (default_handoff) on public.owner_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 3. "5 minutes away"
-- ---------------------------------------------------------------------------

alter table public.trips add column near_notified_at timestamptz;

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
  if not t.sharing then
    raise exception 'not_sharing';
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
  elsif v_dist is not null and t.near_notified_at is null and t.eta_at <= v_now + interval '5 minutes' then
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

notify pgrst, 'reload schema';
