-- 014o (3D.7, #144): both sides agree to book, the final quote's fees are in the price, and the booking steps
-- show up in the chat as cards.
--
-- The owner's Request booking is a careful first step, not a yes. After the Meet & Greet (a repeat pair has none) the
-- owner says "I'd like to book" and the sitter says "I accept"; the booking is `confirmed` (waiting for payment) only
-- when both did, in any order.
--
--   bookings.owner_agreed_at    the owner's "I'd like to book" (agree_to_book)
--   bookings.sitter_accepted_at the sitter's "I accept" (respond_booking with accept)
--
-- * booking_stage: a requested booking is `confirm` once the Meet & Greet is over or was never needed, so a repeat pair
--   reaches `confirm` right away. booking_next_actor('confirm') is whoever has not agreed yet.
-- * A new handoff proposal on a booking that is still a request clears both agreements (they agreed to other terms).
-- * The accepted extra fees of the pair's newest confirmed chat quote for the same stay are added to the price in SQL
--   (booking_extra_fees, price_with_fees, quote_booking_for); pay_booking_demo and the 009d re-quote use them, so the
--   total shown at Checkout is the total paid. quote_booking and its rounding (03C) are unchanged.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column owner_agreed_at timestamptz,
  add column sitter_accepted_at timestamptz;

-- A booking that was already accepted had both sides' yes.
update public.bookings
set owner_agreed_at = coalesce(responded_at, created_at),
    sitter_accepted_at = coalesce(responded_at, created_at)
where status = 'confirmed';

-- ---------------------------------------------------------------------------
-- Stage (computed, never stored)
-- ---------------------------------------------------------------------------

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
        when b.sitter_interest_at is null then 'requested'
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

create or replace function public.booking_next_actor(b public.bookings)
returns text
language sql
stable
set search_path = public
as $$
  select case public.booking_stage(b)
    when 'requested' then 'sitter'
    when 'confirm' then
      case
        when b.owner_agreed_at is null and b.sitter_accepted_at is null then 'both'
        when b.owner_agreed_at is null then 'owner'
        when b.sitter_accepted_at is null then 'sitter'
        else 'none'
      end
    when 'awaiting_payment' then 'owner'
    when 'meet_greet' then
      case b.meet_greet_status
        when 'proposed' then case when b.meet_greet_proposed_by = b.owner_id then 'sitter' else 'owner' end
        when 'skip_requested' then case when b.meet_greet_skip_requested_by = b.owner_id then 'sitter' else 'owner' end
        else 'both'
      end
    else 'none'
  end
$$;

-- ---------------------------------------------------------------------------
-- Agreeing to book
-- ---------------------------------------------------------------------------

-- What has to hold before either side's yes counts (the old Accept checks): the Meet & Greet is over, no time the sitter
-- proposed is waiting for the owner, both times exist and the sitter has room.
create or replace function public.check_booking_agreement(b public.bookings)
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
  if b.meet_greet_status not in ('not_needed', 'done', 'skipped') then
    raise exception 'meet_greet_required';
  end if;
  if exists (
    select 1 from public.booking_handoffs
    where booking_id = b.id and status = 'proposed' and proposed_by = b.sitter_id
  ) then
    raise exception 'handoff_pending';
  end if;
  v_drop := public.current_handoff(b.id, 'drop_off');
  v_pick := public.current_handoff(b.id, 'pick_up');
  if v_drop.id is null or v_pick.id is null then
    raise exception 'handoff_missing';
  end if;
  perform pg_advisory_xact_lock(hashtext(b.sitter_id::text));
  v_bad := public.capacity_shortfall(
    b.sitter_id, b.id, cardinality(public.booking_pet_ids(b.id)),
    v_drop.scheduled_at, v_pick.scheduled_at
  );
  if v_bad is not null then
    raise exception 'sitter_unavailable' using detail = v_bad;
  end if;
end;
$$;

-- Both said yes: the booking is confirmed (waiting for payment). p_by is the one who said yes last.
create or replace function public.finish_booking_agreement(p_booking uuid, p_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_drop public.booking_handoffs;
  v_pick public.booking_handoffs;
  v_name text;
begin
  select * into b from public.bookings where id = p_booking;
  v_drop := public.current_handoff(p_booking, 'drop_off');
  v_pick := public.current_handoff(p_booking, 'pick_up');
  perform public.rebuild_booking(p_booking, v_drop.scheduled_at, v_pick.scheduled_at);

  -- Confirming accepts the pending handoff proposals.
  update public.booking_handoffs set status = 'superseded', responded_at = now()
  where booking_id = p_booking and status = 'agreed' and id not in (v_drop.id, v_pick.id);
  update public.booking_handoffs set status = 'agreed', responded_at = now()
  where id in (v_drop.id, v_pick.id) and status = 'proposed';

  update public.bookings set status = 'confirmed', responded_at = now() where id = p_booking;

  if p_by = b.sitter_id then
    select display_name into v_name from public.profiles where id = b.sitter_id;
    perform public.notify_user(
      b.owner_id, 'booking_confirmed',
      format('%s confirmed your booking', v_name),
      format('%s · %s', public.booking_pet_names(p_booking), public.fmt_date_range(b.start_date, b.end_date)),
      null, p_booking, p_booking
    );
  else
    select display_name into v_name from public.profiles where id = b.owner_id;
    perform public.notify_user(
      b.sitter_id, 'booking_confirmed',
      format('%s agreed to book', v_name),
      format('%s · %s', public.booking_pet_names(p_booking), public.fmt_date_range(b.start_date, b.end_date)),
      null, p_booking, p_booking
    );
  end if;
end;
$$;

-- The sitter's "I accept". Declining stays possible at any point and ends the request as before.
create or replace function public.respond_booking(p_booking uuid, p_accept boolean, p_note text default null)
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
  select display_name into v_sitter_name from public.profiles where id = b.sitter_id;

  if not p_accept then
    update public.booking_handoffs set status = 'rejected', responded_at = now()
    where booking_id = p_booking and status = 'proposed';
    update public.bookings
    set status = 'declined', sitter_note = p_note, responded_at = now()
    where id = p_booking;
    perform public.notify_user(
      b.owner_id, 'booking_declined',
      format('%s declined your booking request', v_sitter_name),
      p_note, null, p_booking, p_booking
    );
    return;
  end if;

  perform public.check_booking_agreement(b);

  update public.bookings
  set sitter_accepted_at = coalesce(sitter_accepted_at, now()), sitter_note = coalesce(p_note, sitter_note)
  where id = p_booking;

  if b.owner_agreed_at is null then
    perform public.notify_user(
      b.owner_id, 'booking_sitter_accepted',
      format('%s accepted. Your turn to book', v_sitter_name),
      format('%s · %s', public.booking_pet_names(p_booking), public.fmt_date_range(b.start_date, b.end_date)),
      null, p_booking, p_booking
    );
    return;
  end if;
  perform public.finish_booking_agreement(p_booking, b.sitter_id);
end;
$$;

-- The owner's "I'd like to book".
create or replace function public.agree_to_book(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_owner_name text;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.owner_id is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;
  if b.owner_agreed_at is not null then
    return; -- idempotent: a second tap, or a booking that is already confirmed
  end if;
  if b.status <> 'requested' then
    raise exception 'invalid_status';
  end if;

  perform public.check_booking_agreement(b);

  update public.bookings set owner_agreed_at = now() where id = p_booking;

  if b.sitter_accepted_at is null then
    select display_name into v_owner_name from public.profiles where id = b.owner_id;
    perform public.notify_user(
      b.sitter_id, 'booking_agree_requested',
      format('%s would like to book', v_owner_name),
      format('%s · %s', public.booking_pet_names(p_booking), public.fmt_date_range(b.start_date, b.end_date)),
      null, p_booking, p_booking
    );
    return;
  end if;
  perform public.finish_booking_agreement(p_booking, b.owner_id);
end;
$$;

-- A new handoff proposal on a request changes the terms: both have to say yes again.
create or replace function public.reset_agreement_on_new_proposal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'proposed' then
    update public.bookings
    set owner_agreed_at = null, sitter_accepted_at = null
    where id = new.booking_id and status = 'requested'
      and (owner_agreed_at is not null or sitter_accepted_at is not null);
  end if;
  return new;
end;
$$;

create trigger booking_handoffs_reset_agreement
  after insert on public.booking_handoffs
  for each row execute function public.reset_agreement_on_new_proposal();

-- ---------------------------------------------------------------------------
-- The accepted fees of the final quote are in the price
-- ---------------------------------------------------------------------------

-- The accepted extra fees [{label, amount}] of the newest CONFIRMED quote card in the pair's chat that prices this very
-- stay (same service, drop-off, pick-up and pets). A confirmed card never changes, so this is the agreed amount.
create or replace function public.booking_extra_fees(p_booking uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_drop public.booking_handoffs;
  v_pick public.booking_handoffs;
  v_pets uuid[];
  v_card jsonb;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then
    return '[]'::jsonb;
  end if;
  v_drop := public.current_handoff(p_booking, 'drop_off');
  v_pick := public.current_handoff(p_booking, 'pick_up');
  if v_drop.id is null or v_pick.id is null then
    return '[]'::jsonb;
  end if;
  select coalesce(array_agg(bp.pet_id order by bp.pet_id), '{}') into v_pets
  from public.booking_pets bp where bp.booking_id = p_booking and bp.active;

  select m.card into v_card
  from public.chat_messages m
  join public.chat_threads t on t.id = m.thread_id
  where t.owner_id = b.owner_id and t.sitter_id = b.sitter_id
    and m.kind = 'card' and m.card ->> 'type' = 'quote' and m.card ->> 'status' = 'confirmed'
    and m.card ->> 'service_type' = b.service_type
    and (m.card ->> 'drop_off_at')::timestamptz = v_drop.scheduled_at
    and (m.card ->> 'pick_up_at')::timestamptz = v_pick.scheduled_at
    and (select coalesce(array_agg((e ->> 'id')::uuid order by (e ->> 'id')::uuid), '{}')
         from jsonb_array_elements(coalesce(m.card -> 'pets', '[]'::jsonb)) e) = v_pets
  order by m.created_at desc
  limit 1;
  if v_card is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('label', e ->> 'label', 'amount', (e ->> 'amount')::numeric) order by o)
    from jsonb_array_elements(coalesce(v_card -> 'extras', '[]'::jsonb)) with ordinality as t(e, o)
    where e ->> 'status' = 'accepted'
  ), '[]'::jsonb);
end;
$$;

-- quote_booking's JSON plus the booking's accepted fees: `extras`, `extras_total`, `subtotal` (quote_booking's total) and
-- a `total` that includes the fees. Sums of two-decimal amounts, so no new rounding.
create or replace function public.price_with_fees(p_booking uuid, p_quote jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_extras jsonb := public.booking_extra_fees(p_booking);
  v_sum numeric;
begin
  select coalesce(sum((e ->> 'amount')::numeric), 0) into v_sum from jsonb_array_elements(v_extras) e;
  return p_quote || jsonb_build_object(
    'extras', v_extras,
    'extras_total', v_sum,
    'subtotal', p_quote -> 'total',
    'total', round((p_quote ->> 'total')::numeric + v_sum, 2)
  );
end;
$$;

-- What Checkout shows: the booking's current times and pets, priced the way payment will price them.
create or replace function public.quote_booking_for(p_booking uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_drop public.booking_handoffs;
  v_pick public.booking_handoffs;
  v_pets int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into b from public.bookings where id = p_booking;
  if not found or auth.uid() not in (b.owner_id, b.sitter_id) then
    raise exception 'not_allowed';
  end if;
  v_drop := public.current_handoff(p_booking, 'drop_off');
  v_pick := public.current_handoff(p_booking, 'pick_up');
  if v_drop.id is null or v_pick.id is null then
    raise exception 'handoff_missing';
  end if;
  select count(*)::int into v_pets from public.booking_pets bp where bp.booking_id = p_booking and bp.active;
  return public.price_with_fees(
    p_booking,
    public.quote_booking(b.sitter_id, b.service_type, v_drop.scheduled_at, v_pick.scheduled_at, greatest(v_pets, 1))
  );
end;
$$;

-- Demo payment (006) with the fees in the price.
create or replace function public.pay_booking_demo(p_booking uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  v_owner_name text;
  v_drop public.booking_handoffs%rowtype;
  v_pick public.booking_handoffs%rowtype;
  v_pets int;
  v_required text[];
  v_missing text[];
  v_quote jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'not_allowed';
  end if;
  if b.owner_id is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;
  if b.status is distinct from 'confirmed' then
    raise exception 'invalid_status';
  end if;
  if b.paid_at is not null then
    raise exception 'already_paid';
  end if;

  v_required := public.required_consents(p_booking);
  select coalesce(array_agg(k order by k), '{}')
    into v_missing
  from unnest(v_required) k
  where not exists (
    select 1 from public.booking_consents c
    where c.booking_id = p_booking and c.kind = k
  );
  if coalesce(cardinality(v_missing), 0) > 0 then
    raise exception 'consents_missing' using detail = array_to_string(v_missing, ',');
  end if;

  v_drop := public.current_handoff(p_booking, 'drop_off');
  v_pick := public.current_handoff(p_booking, 'pick_up');
  if v_drop.id is null or v_pick.id is null then
    raise exception 'handoff_missing';
  end if;

  select count(*)::int into v_pets
  from public.booking_pets bp
  where bp.booking_id = p_booking and bp.active;

  if v_pets < 1 then
    raise exception 'invalid_pet_count';
  end if;

  v_quote := public.price_with_fees(
    p_booking,
    public.quote_booking(b.sitter_id, b.service_type, v_drop.scheduled_at, v_pick.scheduled_at, v_pets)
  );

  update public.bookings
  set paid_at = now(),
      price_snapshot = v_quote,
      updated_at = now()
  where id = p_booking;

  select display_name into v_owner_name from public.profiles where id = b.owner_id;

  perform public.notify_user(
    b.sitter_id, 'booking_paid',
    format('%s signed and paid — %s is all set ✅',
      coalesce(v_owner_name, 'The owner'),
      public.fmt_date_range(b.start_date, b.end_date)),
    format('%s · $%s %s (demo)',
      public.booking_pet_names(p_booking),
      v_quote->>'total',
      coalesce(v_quote->>'currency', 'CAD')),
    null, p_booking, p_booking
  );

  return v_quote;
end;
$$;

-- An agreed change after payment re-quotes the stay (009d), fees included.
create or replace function public.follow_paid_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_drop public.booking_handoffs;
  v_pick public.booking_handoffs;
  v_pets int;
  v_quote jsonb;
  v_missing int := 0;
begin
  if new.status <> 'agreed' or old.status = 'agreed' then
    return new;
  end if;
  select * into b from public.bookings where id = new.booking_id;
  if b.status <> 'confirmed' or b.paid_at is null then
    return new;
  end if;

  begin
    select count(*)::int into v_missing
    from unnest(public.required_consents(b.id)) k
    where not exists (select 1 from public.booking_consents c where c.booking_id = b.id and c.kind = k);
  exception when others then
    v_missing := 0;
  end;
  if v_missing > 0 then
    update public.bookings set paid_at = null, updated_at = now() where id = b.id;
    perform public.notify_user(
      b.owner_id, 'checkout_needed',
      'Your stay changed — sign the new consent to finish checkout',
      public.booking_pet_names(b.id),
      null, b.id, b.id
    );
    return new;
  end if;

  v_drop := public.current_handoff(b.id, 'drop_off');
  v_pick := public.current_handoff(b.id, 'pick_up');
  select count(*)::int into v_pets from public.booking_pets bp where bp.booking_id = b.id and bp.active;
  begin
    v_quote := public.price_with_fees(
      b.id,
      public.quote_booking(b.sitter_id, b.service_type, v_drop.scheduled_at, v_pick.scheduled_at, greatest(v_pets, 1))
    );
  exception when others then
    v_quote := null; -- rates removed meanwhile: keep the paid quote
  end;
  if v_quote is not null
     and (v_quote->>'total')::numeric is distinct from (b.price_snapshot->>'total')::numeric then
    update public.bookings set price_snapshot = v_quote, updated_at = now() where id = b.id;
    perform public.notify_user(
      b.owner_id, 'price_updated',
      format('New total for your stay: $%s %s (demo)', v_quote->>'total', coalesce(v_quote->>'currency', 'CAD')),
      format('Was $%s — %s', coalesce(b.price_snapshot->>'total', '?'), public.booking_pet_names(b.id)),
      null, b.id, b.id
    );
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.check_booking_agreement(public.bookings),
  public.finish_booking_agreement(uuid, uuid),
  public.reset_agreement_on_new_proposal(),
  public.booking_extra_fees(uuid),
  public.price_with_fees(uuid, jsonb),
  public.agree_to_book(uuid),
  public.quote_booking_for(uuid)
from public, anon;

-- Internal: only the functions above and the triggers call these.
revoke execute on function
  public.check_booking_agreement(public.bookings),
  public.finish_booking_agreement(uuid, uuid),
  public.reset_agreement_on_new_proposal(),
  public.booking_extra_fees(uuid),
  public.price_with_fees(uuid, jsonb)
from authenticated;

grant execute on function public.agree_to_book(uuid), public.quote_booking_for(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
