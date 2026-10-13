-- 012c (CR-2, code review 2026-10-13): a confirmed booking can move its drop-off and pick-up together.
--
-- After confirm, each handoff change is checked against the OTHER handoff's agreed time (current_handoff, 003). The
-- change sheet sends both kinds one after the other (FB-5), but moving a whole stay past its old window — drop-off
-- 20 → 23 and pick-up 22 → 25 — fails either way round: the new drop-off is after the agreed pick-up, and nothing
-- the sheet can do about the order fixes that. The first proposal went out, the second failed (half a change).
--
-- Now, for a confirmed booking only, when a new time does not fit the other handoff's agreed time:
--   propose_handoff   checks it against the other kind's open proposal from the SAME person, if there is one;
--   respond_handoff   accepting it accepts that partner too, in one step (both times, one rebuild of the slots);
--                     declining it also declines the partner, which only fit together with it.
-- A change that fits on its own works exactly as before (one proposal, one answer). Before confirm nothing changes:
-- current_handoff already reads the open proposals there.

create or replace function public.propose_handoff(
  p_booking uuid, p_kind text, p_at timestamptz, p_location_type text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_uid uuid := auth.uid();
  v_cur public.booking_handoffs;
  v_other public.booking_handoffs;
  v_pair public.booking_handoffs;
  v_other_kind text := case when p_kind = 'drop_off' then 'pick_up' else 'drop_off' end;
  v_type text;
  v_note text;
  v_from timestamptz;
  v_to timestamptz;
  v_bad text;
  v_id uuid;
  v_name text;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or v_uid is null or v_uid not in (b.owner_id, b.sitter_id) then
    raise exception 'not_allowed';
  end if;
  if b.status not in ('requested', 'confirmed') then
    raise exception 'invalid_status';
  end if;
  if p_kind is null or p_kind not in ('drop_off', 'pick_up') then
    raise exception 'invalid_kind';
  end if;
  if exists (
    select 1 from public.booking_handoffs
    where booking_id = p_booking and kind = p_kind and completed_at is not null
  ) then
    raise exception 'handoff_completed';
  end if;
  if p_at is null or p_at < now() then
    raise exception 'invalid_window';
  end if;

  select * into v_cur from public.booking_handoffs
  where booking_id = p_booking and kind = p_kind and status in ('proposed', 'agreed')
  order by (status = 'proposed') desc limit 1;
  if p_location_type is null then
    v_type := coalesce(v_cur.location_type, 'sitter_home');
    v_note := coalesce(p_note, v_cur.location_note);
  else
    v_type := p_location_type;
    v_note := p_note;
  end if;
  v_type := public.check_location(v_type, v_note);

  v_other := public.current_handoff(p_booking, v_other_kind);
  v_from := case when p_kind = 'drop_off' then p_at else v_other.scheduled_at end;
  v_to := case when p_kind = 'pick_up' then p_at else v_other.scheduled_at end;

  -- CR-2: after confirm, a time that only fits with my own open proposal for the other handoff is checked against it.
  if b.status = 'confirmed' and v_from is not null and v_to is not null and v_to <= v_from then
    select * into v_pair from public.booking_handoffs
    where booking_id = p_booking and kind = v_other_kind and status = 'proposed' and proposed_by = v_uid
      and completed_at is null;
    if v_pair.id is not null then
      v_from := case when p_kind = 'drop_off' then p_at else v_pair.scheduled_at end;
      v_to := case when p_kind = 'pick_up' then p_at else v_pair.scheduled_at end;
    end if;
  end if;
  if v_from is null or v_to is null or v_to <= v_from then
    raise exception 'invalid_window';
  end if;

  if b.status = 'confirmed' then
    perform pg_advisory_xact_lock(hashtext(b.sitter_id::text));
    v_bad := public.capacity_shortfall(
      b.sitter_id, p_booking, cardinality(public.booking_pet_ids(p_booking)), v_from, v_to
    );
    if v_bad is not null then
      raise exception 'sitter_unavailable' using detail = v_bad;
    end if;
  end if;

  update public.booking_handoffs set status = 'superseded', responded_at = now()
  where booking_id = p_booking and kind = p_kind and status = 'proposed';

  insert into public.booking_handoffs
    (booking_id, kind, scheduled_at, location_type, location_note, within_sitter_hours, status, proposed_by)
  values
    (p_booking, p_kind, p_at, v_type, v_note,
     public.within_sitter_hours(b.sitter_id, p_at), 'proposed', v_uid)
  returning id into v_id;

  select display_name into v_name from public.profiles where id = v_uid;
  perform public.notify_user(
    case when v_uid = b.owner_id then b.sitter_id else b.owner_id end,
    'handoff_proposed',
    format('%s suggested %s at %s', v_name, replace(p_kind, '_', '-'), public.fmt_local_time(p_at)),
    format('%s · %s', public.booking_pet_names(p_booking),
      to_char(p_at at time zone public.app_timezone(), 'Mon FMDD')),
    null, p_booking, v_id
  );
  return v_id;
end;
$$;

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

  -- CR-2: after confirm, an offer that only fits with the same person's offer for the other handoff is answered
  -- together with it.
  if b.status = 'confirmed' then
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

notify pgrst, 'reload schema';
