-- Goldito 005: Meet & Greet RPCs (Phase 03B, task 3B.9)
-- Source of truth: docs/plan/phases/phase-03b.md 3B.9 · architecture D44 (D45 Meet link = 3B.11)
--
-- 004 added the columns and the Accept guard (respond_booking raises meet_greet_required
-- until not_needed / done / skipped). These RPCs move a first-time pair through it:
--
--   required ──propose──▶ proposed ──accept──▶ agreed ──after the time──▶ done
--      ▲                     │ decline ──▶ required        (reschedule: propose again)
--      └── any open state ──request skip──▶ skip_requested ──accept──▶ skipped
--                                                          └─decline──▶ booking cancelled
--
-- All of it happens while the booking is still a request (before the sitter accepts).

-- "Oct 6, 7:00 PM"
create or replace function public.fmt_local_datetime(p_at timestamptz)
returns text
language sql
stable
set search_path = public
as $$ select to_char(p_at at time zone public.app_timezone(), 'Mon FMDD') || ', ' || public.fmt_local_time(p_at) $$;

-- Locks the booking and checks the caller is one of its two parties and it is still a request.
create or replace function public.meet_greet_booking(p_booking uuid)
returns public.bookings
language plpgsql
set search_path = public
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or auth.uid() is null or auth.uid() not in (b.owner_id, b.sitter_id) then
    raise exception 'not_allowed';
  end if;
  if b.status <> 'requested' then
    raise exception 'invalid_status';
  end if;
  return b;
end;
$$;

-- In person needs a place (a public spot from either profile, or one line typed);
-- video gets its Google Meet link from FastAPI after the other side agrees (3B.11).
create or replace function public.propose_meet_greet(
  p_booking uuid, p_mode text, p_at timestamptz, p_place text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_uid uuid := auth.uid();
  v_place text := nullif(trim(p_place), '');
  v_name text;
begin
  b := public.meet_greet_booking(p_booking);
  if b.meet_greet_status not in ('required', 'proposed', 'agreed') then
    raise exception 'invalid_status';
  end if;
  if p_mode is null or p_mode not in ('in_person', 'video') then
    raise exception 'invalid_mode';
  end if;
  if p_at is null or p_at <= now() then
    raise exception 'invalid_window';
  end if;
  if p_mode = 'in_person' and v_place is null then
    raise exception 'place_required';
  end if;
  if char_length(v_place) > 120 then
    raise exception 'place_too_long';
  end if;

  update public.bookings
  set meet_greet_status = 'proposed',
      meet_greet_mode = p_mode,
      meet_greet_at = p_at,
      meet_greet_place = case when p_mode = 'in_person' then v_place end,
      meet_greet_link = null,
      meet_greet_proposed_by = v_uid,
      meet_greet_skip_requested_by = null
  where id = p_booking;

  select display_name into v_name from public.profiles where id = v_uid;
  perform public.notify_user(
    case when v_uid = b.owner_id then b.sitter_id else b.owner_id end,
    'meet_greet_proposed',
    case when p_mode = 'video'
      then format('%s suggested a video Meet & Greet on %s', v_name, public.fmt_local_datetime(p_at))
      else format('%s suggested meeting at %s on %s', v_name, v_place, public.fmt_local_datetime(p_at))
    end,
    public.booking_pet_names(p_booking), null, p_booking, p_booking
  );
end;
$$;

-- The other side answers. Declining goes back to required so either side can suggest again.
create or replace function public.respond_meet_greet(p_booking uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_uid uuid := auth.uid();
  v_name text;
begin
  b := public.meet_greet_booking(p_booking);
  if b.meet_greet_status <> 'proposed' then
    raise exception 'invalid_status';
  end if;
  if b.meet_greet_proposed_by = v_uid then
    raise exception 'not_allowed';
  end if;
  select display_name into v_name from public.profiles where id = v_uid;

  if p_accept then
    update public.bookings set meet_greet_status = 'agreed' where id = p_booking;
    perform public.notify_user(
      b.meet_greet_proposed_by, 'meet_greet_agreed',
      format('%s is in for the Meet & Greet on %s', v_name, public.fmt_local_datetime(b.meet_greet_at)),
      case when b.meet_greet_mode = 'in_person' then b.meet_greet_place else 'Video call' end,
      null, p_booking, p_booking
    );
  else
    update public.bookings
    set meet_greet_status = 'required', meet_greet_mode = null, meet_greet_at = null,
        meet_greet_place = null, meet_greet_link = null, meet_greet_proposed_by = null
    where id = p_booking;
    perform public.notify_user(
      b.meet_greet_proposed_by, 'meet_greet_declined',
      format('%s can''t make that Meet & Greet — suggest another time', v_name),
      null, null, p_booking, p_booking
    );
  end if;
end;
$$;

-- Either side, once the agreed time has come.
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
  if b.meet_greet_status <> 'agreed' then
    raise exception 'invalid_status';
  end if;
  if now() < b.meet_greet_at then
    raise exception 'meet_greet_not_yet';
  end if;
  update public.bookings set meet_greet_status = 'done' where id = p_booking;
end;
$$;

-- Skipping needs the other side's OK (D44); a planned meeting stays on record until then.
create or replace function public.request_skip_meet_greet(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_uid uuid := auth.uid();
  v_name text;
begin
  b := public.meet_greet_booking(p_booking);
  if b.meet_greet_status not in ('required', 'proposed', 'agreed') then
    raise exception 'invalid_status';
  end if;
  update public.bookings
  set meet_greet_status = 'skip_requested', meet_greet_skip_requested_by = v_uid
  where id = p_booking;

  select display_name into v_name from public.profiles where id = v_uid;
  perform public.notify_user(
    case when v_uid = b.owner_id then b.sitter_id else b.owner_id end,
    'meet_greet_skip_requested',
    format('%s would like to skip the Meet & Greet', v_name),
    'Continue the booking without meeting first?',
    null, p_booking, p_booking
  );
end;
$$;

-- Continue = skipped (Accept unlocks). Decline = the booking is cancelled and the owner
-- looks for another sitter (the decliner wants to meet first).
create or replace function public.respond_skip_meet_greet(p_booking uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_uid uuid := auth.uid();
  v_name text;
  v_pets text;
  v_dates text;
begin
  b := public.meet_greet_booking(p_booking);
  if b.meet_greet_status <> 'skip_requested' then
    raise exception 'invalid_status';
  end if;
  if b.meet_greet_skip_requested_by = v_uid then
    raise exception 'not_allowed';
  end if;
  select display_name into v_name from public.profiles where id = v_uid;

  if p_accept then
    update public.bookings set meet_greet_status = 'skipped' where id = p_booking;
    perform public.notify_user(
      b.meet_greet_skip_requested_by, 'meet_greet_skipped',
      format('%s is OK to skip the Meet & Greet — your booking continues', v_name),
      null, null, p_booking, p_booking
    );
    return;
  end if;

  -- Same end state as cancel_booking (sync_booking_ended frees the pets), own wording.
  update public.bookings
  set status = 'cancelled', cancelled_by = v_uid, cancel_reason = 'meet_greet_declined'
  where id = p_booking;
  v_pets := public.booking_pet_names(p_booking);
  v_dates := public.fmt_date_range(b.start_date, b.end_date);
  if v_uid = b.sitter_id then
    perform public.notify_user(
      b.owner_id, 'booking_cancelled',
      format('%s would like to meet first, so this booking was cancelled', v_name),
      format('%s · %s. Find a new sitter.', v_pets, v_dates),
      null, p_booking, p_booking
    );
  else
    perform public.notify_user(
      b.sitter_id, 'booking_cancelled',
      format('%s would like to meet first, so the request was cancelled', v_name),
      format('%s · %s', v_pets, v_dates),
      null, p_booking, p_booking
    );
  end if;
end;
$$;

-- Both sides' preferred meeting spots for the In person sheet (sitter spots are not in the
-- public sitter list; owner_profiles is only visible after a confirmed booking).
create or replace function public.get_meet_greet_options(p_booking uuid)
returns table (owner_name text, owner_spots text[], sitter_name text, sitter_spots text[])
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
  return query
  select o.display_name, coalesce(op.meet_spots, '{}'), s.display_name, coalesce(sp.meet_spots, '{}')
  from public.profiles o
  left join public.owner_profiles op on op.id = o.id
  cross join public.profiles s
  left join public.sitter_profiles sp on sp.id = s.id
  where o.id = b.owner_id and s.id = b.sitter_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.fmt_local_datetime(timestamptz),
  public.meet_greet_booking(uuid),
  public.propose_meet_greet(uuid, text, timestamptz, text),
  public.respond_meet_greet(uuid, boolean),
  public.complete_meet_greet(uuid),
  public.request_skip_meet_greet(uuid),
  public.respond_skip_meet_greet(uuid, boolean),
  public.get_meet_greet_options(uuid)
from public, anon;

grant execute on function
  public.fmt_local_datetime(timestamptz),
  public.propose_meet_greet(uuid, text, timestamptz, text),
  public.respond_meet_greet(uuid, boolean),
  public.complete_meet_greet(uuid),
  public.request_skip_meet_greet(uuid),
  public.respond_skip_meet_greet(uuid, boolean),
  public.get_meet_greet_options(uuid)
to authenticated, service_role;

-- Internal: only the RPCs above call it.
revoke execute on function public.meet_greet_booking(uuid) from authenticated;

notify pgrst, 'reload schema';
