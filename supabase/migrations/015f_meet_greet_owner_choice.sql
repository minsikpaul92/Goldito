-- 015f (#236): the owner asks for a Meet & Greet or to skip it right after Request booking, and both sides answer.
--
-- Before: nothing about the Meet & Greet could move until the sitter's first yes ("Next", 011l express_interest).
-- Now:
-- * The owner can propose a time or ask to skip before that yes (guard_interest_first lets the owner through).
-- * The sitter's answer is the first yes: Accept, Request skip, a new time or Accept skip holds the dates the same way
--   express_interest does (hold_booking_dates). "Next" stays for a request where the owner chose nothing yet.
-- * A skip request can be answered with a new time (propose_meet_greet from skip_requested).
-- * The time must be before the drop-off (meet_greet_too_late).
-- * Decline (decline_meet_greet) ends the request from any open Meet & Greet state, either side. respond_skip with
--   false does the same. Both keep cancel_reason = 'meet_greet_declined'.
-- * booking_stage: a request is in the Meet & Greet stage once anything about it moved, not only after the first yes.
-- * The chat's Meet & Greet card is posted as soon as the owner proposes or asks to skip.

-- ---------------------------------------------------------------------------
-- Holding the dates (the sitter's first yes)
-- ---------------------------------------------------------------------------

-- The hold of express_interest (011l), for every sitter answer that counts as the first yes. No notice: the caller sends
-- its own. The caller has locked the booking.
create or replace function public.hold_booking_dates(b public.bookings)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drop public.booking_handoffs;
  v_pick public.booking_handoffs;
  v_bad text;
begin
  if b.sitter_interest_at is not null then
    return;
  end if;
  v_drop := public.current_handoff(b.id, 'drop_off');
  v_pick := public.current_handoff(b.id, 'pick_up');
  if v_drop.id is null or v_pick.id is null then
    raise exception 'handoff_missing';
  end if;

  -- The hold needs the dates to be free: capacity (counting other holds) and, if needed, one owner at a time.
  perform pg_advisory_xact_lock(hashtext(b.sitter_id::text));
  v_bad := public.capacity_shortfall(
    b.sitter_id, b.id, cardinality(public.booking_pet_ids(b.id)),
    v_drop.scheduled_at, v_pick.scheduled_at
  );
  if v_bad is null then
    v_bad := public.other_owner_shortfall(b.sitter_id, b.owner_id, b.id, v_drop.scheduled_at, v_pick.scheduled_at);
  end if;
  if v_bad is not null then
    raise exception 'sitter_unavailable' using detail = v_bad;
  end if;

  update public.bookings
  set sitter_interest_at = now(), meet_greet_due_at = now() + interval '2 days'
  where id = b.id;
end;
$$;

-- Same as 011l, the hold now lives in hold_booking_dates.
create or replace function public.express_interest(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_sitter_name text;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.sitter_id is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;
  if b.status <> 'requested' then
    raise exception 'invalid_status';
  end if;
  if b.sitter_interest_at is not null then
    return; -- idempotent
  end if;
  if b.meet_greet_status <> 'required' then
    raise exception 'interest_not_needed'; -- a pair that has met just Accepts
  end if;

  perform public.hold_booking_dates(b);

  select display_name into v_sitter_name from public.profiles where id = b.sitter_id;
  perform public.notify_user(
    b.owner_id, 'booking_interest',
    format('%s would like to meet first', v_sitter_name),
    format('%s · %s. Your dates are on hold. Set a time to meet.', public.booking_pet_names(p_booking),
      public.fmt_date_range(b.start_date, b.end_date)),
    null, p_booking, p_booking
  );
end;
$$;

-- Only the sitter needs the first yes before a proposal or skip request; the owner may ask first.
create or replace function public.guard_interest_first()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.meet_greet_status in ('proposed', 'skip_requested')
    and new.meet_greet_status is distinct from old.meet_greet_status
    and new.sitter_interest_at is null
    and auth.uid() is distinct from new.owner_id
  then
    raise exception 'interest_required';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Meet & Greet RPCs (005), with the hold and the new rules
-- ---------------------------------------------------------------------------

-- Also from skip_requested (answering a skip request with a time); the time is before the drop-off.
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
  v_drop public.booking_handoffs;
  v_name text;
begin
  b := public.meet_greet_booking(p_booking);
  if b.meet_greet_status not in ('required', 'proposed', 'agreed', 'skip_requested') then
    raise exception 'invalid_status';
  end if;
  if p_mode is null or p_mode not in ('in_person', 'video') then
    raise exception 'invalid_mode';
  end if;
  if p_at is null or p_at <= now() then
    raise exception 'invalid_window';
  end if;
  v_drop := public.current_handoff(p_booking, 'drop_off');
  if v_drop.id is not null and p_at >= v_drop.scheduled_at then
    raise exception 'meet_greet_too_late';
  end if;
  if p_mode = 'in_person' and v_place is null then
    raise exception 'place_required';
  end if;
  if char_length(v_place) > 120 then
    raise exception 'place_too_long';
  end if;
  if v_uid = b.sitter_id then
    perform public.hold_booking_dates(b);
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

-- The sitter's Accept of the owner's time is also the first yes.
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
    if v_uid = b.sitter_id then
      perform public.hold_booking_dates(b);
    end if;
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
      format('%s can''t make that Meet & Greet. Suggest another time', v_name),
      null, null, p_booking, p_booking
    );
  end if;
end;
$$;

-- The sitter's Request skip is also the first yes.
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
  if v_uid = b.sitter_id then
    perform public.hold_booking_dates(b);
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

-- Decline: either side ends the request while the Meet & Greet is open. Same end state as cancel_booking
-- (sync_booking_ended frees the pets).
create or replace function public.decline_meet_greet(p_booking uuid)
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
  if b.meet_greet_status not in ('required', 'proposed', 'agreed', 'skip_requested') then
    raise exception 'invalid_status';
  end if;
  select display_name into v_name from public.profiles where id = v_uid;

  update public.bookings
  set status = 'cancelled', cancelled_by = v_uid, cancel_reason = 'meet_greet_declined'
  where id = p_booking;
  v_pets := public.booking_pet_names(p_booking);
  v_dates := public.fmt_date_range(b.start_date, b.end_date);
  if v_uid = b.sitter_id then
    perform public.notify_user(
      b.owner_id, 'booking_cancelled',
      format('%s declined the booking request', v_name),
      format('%s · %s. Find a new sitter.', v_pets, v_dates),
      null, p_booking, p_booking
    );
  else
    perform public.notify_user(
      b.sitter_id, 'booking_cancelled',
      format('%s declined, so the request was cancelled', v_name),
      format('%s · %s', v_pets, v_dates),
      null, p_booking, p_booking
    );
  end if;
end;
$$;

-- Accept = skipped (the sitter's Accept is also the first yes). Decline = decline_meet_greet.
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
begin
  b := public.meet_greet_booking(p_booking);
  if b.meet_greet_status <> 'skip_requested' then
    raise exception 'invalid_status';
  end if;
  if b.meet_greet_skip_requested_by = v_uid then
    raise exception 'not_allowed';
  end if;
  if not p_accept then
    perform public.decline_meet_greet(p_booking);
    return;
  end if;

  if v_uid = b.sitter_id then
    perform public.hold_booking_dates(b);
  end if;
  update public.bookings set meet_greet_status = 'skipped' where id = p_booking;
  select display_name into v_name from public.profiles where id = v_uid;
  perform public.notify_user(
    b.meet_greet_skip_requested_by, 'meet_greet_skipped',
    format('%s is OK to skip the Meet & Greet. Your booking continues', v_name),
    null, null, p_booking, p_booking
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Stage and chat card
-- ---------------------------------------------------------------------------

-- As 014o, but an owner's proposal or skip request already is the Meet & Greet stage.
create or replace function public.booking_stage(b public.bookings)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when b.status = 'declined' then 'declined'
    when b.status = 'cancelled' then 'cancelled'
    when b.status = 'requested' then
      case
        when b.meet_greet_status in ('not_needed', 'done', 'skipped') then 'confirm'
        when b.sitter_interest_at is null and b.meet_greet_status = 'required' then 'requested'
        else 'meet_greet'
      end
    when exists (
      select 1 from public.booking_handoffs h
      where h.booking_id = b.id and h.kind = 'pick_up' and h.completed_at is not null
    ) then 'completed'
    when exists (
      select 1 from public.booking_handoffs h
      where h.booking_id = b.id and h.kind = 'drop_off' and h.completed_at is not null
    ) then 'in_care'
    when b.paid_at is null then 'awaiting_payment'
    else 'paid'
  end
$$;

-- As 014o, but the Meet & Greet card also comes with the owner's proposal or skip request.
create or replace function public.post_booking_chat_cards()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
  v_sender uuid;
  v_type text;
begin
  select t.id into v_thread from public.chat_threads t where t.owner_id = new.owner_id and t.sitter_id = new.sitter_id;
  if v_thread is null then
    return new; -- booked outside the chat (3B screens): no thread, no cards
  end if;
  v_sender := case when auth.uid() in (new.owner_id, new.sitter_id) then auth.uid() end;

  for v_type in
    select x from unnest(array[
      case when new.meet_greet_status <> 'not_needed'
            and (new.sitter_interest_at is not null or new.meet_greet_status <> 'required') then 'meet_greet' end,
      case when new.status in ('requested', 'confirmed') and new.meet_greet_status in ('not_needed', 'done', 'skipped')
           then 'agreement' end,
      case when new.status = 'confirmed' then 'payment' end
    ]) x where x is not null
  loop
    if not exists (
      select 1 from public.chat_messages m
      where m.thread_id = v_thread and m.kind = 'card' and m.card ->> 'type' = v_type and m.card ->> 'booking_id' = new.id::text
    ) then
      insert into public.chat_messages (thread_id, sender_id, kind, card)
      values (v_thread, v_sender, 'card', jsonb_build_object('type', v_type, 'booking_id', new.id, 'rev', 0));
    end if;
  end loop;

  update public.chat_messages m
  set card = jsonb_set(m.card, '{rev}', to_jsonb(coalesce((m.card ->> 'rev')::int, 0) + 1))
  where m.thread_id = v_thread and m.kind = 'card'
    and m.card ->> 'type' in ('meet_greet', 'agreement', 'payment') and m.card ->> 'booking_id' = new.id::text;
  return new;
end;
$$;

-- As 014k, and a first-time pair's Meet & Greet card follows the request card right away, so the owner can choose
-- Request Meet & Greet or Skip Meet & Greet in the chat.
create or replace function public.post_booking_request_card(p_thread uuid, p_booking uuid)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread public.chat_threads;
  v_booking public.bookings;
  v_card jsonb;
  v_row public.chat_messages;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_thread from public.chat_threads where id = p_thread and owner_id = auth.uid();
  if not found then raise exception 'forbidden'; end if;
  select * into v_booking from public.bookings where id = p_booking;
  if not found or v_booking.owner_id <> auth.uid() or v_booking.sitter_id <> v_thread.sitter_id then
    raise exception 'forbidden';
  end if;

  select * into v_row from public.chat_messages m
  where m.thread_id = p_thread and m.kind = 'card' and m.card ->> 'type' = 'request' and m.card ->> 'booking_id' = p_booking::text
  limit 1;
  if found then return v_row; end if;

  select jsonb_build_object(
    'type', 'request',
    'booking_id', v_booking.id,
    'service_type', v_booking.service_type,
    'note', nullif(btrim(coalesce(v_booking.owner_note, '')), ''),
    'drop_off_at', (select h.scheduled_at from public.booking_handoffs h where h.booking_id = v_booking.id and h.kind = 'drop_off'),
    'drop_off_place', (select jsonb_build_object('type', h.location_type, 'note', h.location_note) from public.booking_handoffs h where h.booking_id = v_booking.id and h.kind = 'drop_off'),
    'pick_up_at', (select h.scheduled_at from public.booking_handoffs h where h.booking_id = v_booking.id and h.kind = 'pick_up'),
    'pick_up_place', (select jsonb_build_object('type', h.location_type, 'note', h.location_note) from public.booking_handoffs h where h.booking_id = v_booking.id and h.kind = 'pick_up'),
    'pets', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
                      from public.booking_pets bp join public.pets p on p.id = bp.pet_id where bp.booking_id = v_booking.id), '[]'::jsonb)
  ) into v_card;

  insert into public.chat_messages (thread_id, sender_id, kind, card) values (p_thread, auth.uid(), 'card', v_card)
  returning * into v_row;

  if v_booking.meet_greet_status <> 'not_needed' and not exists (
    select 1 from public.chat_messages m
    where m.thread_id = p_thread and m.kind = 'card' and m.card ->> 'type' = 'meet_greet' and m.card ->> 'booking_id' = p_booking::text
  ) then
    insert into public.chat_messages (thread_id, sender_id, kind, card)
    values (p_thread, auth.uid(), 'card', jsonb_build_object('type', 'meet_greet', 'booking_id', p_booking, 'rev', 0));
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function public.hold_booking_dates(public.bookings) from public, anon, authenticated;
revoke execute on function public.decline_meet_greet(uuid) from public, anon;
grant execute on function public.decline_meet_greet(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
