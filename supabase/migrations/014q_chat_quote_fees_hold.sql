-- 014q (#144 review): the fees agreed in the chat stay in the price.
--
-- * booking_extra_fees: a paid booking keeps the fees it was paid with when its times change (009d re-quote, or a
--   checkout reopened for a new consent). Before, the confirmed quote had to price the exact new times, so the fees
--   fell out of the total. A confirmed quote for the new stay still wins.
-- * pay_booking_demo: no payment while the sitter's final quote (a quote sent after the booking's payment card) waits
--   for the owner (`quote_pending`), so fees on it can't be skipped by paying from the booking screen.
-- * A booking's final quote is a quote after its payment card and before the next booking's payment card in the chat.

-- Another booking's payment card sits between two chat messages: a quote after it belongs to that booking.
create or replace function public.payment_card_between(p_thread uuid, p_from timestamptz, p_to timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_messages m
    where m.thread_id = p_thread and m.kind = 'card' and m.card ->> 'type' = 'payment'
      and m.created_at > p_from and m.created_at < p_to
  )
$$;

revoke execute on function public.payment_card_between(uuid, timestamptz, timestamptz) from public, anon, authenticated;

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
  v_paid jsonb;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then
    return '[]'::jsonb;
  end if;
  -- The fees the booking was paid with (none before payment, or before 014o).
  v_paid := case when jsonb_typeof(b.price_snapshot -> 'extras') = 'array' then b.price_snapshot -> 'extras' else '[]'::jsonb end;
  v_drop := public.current_handoff(p_booking, 'drop_off');
  v_pick := public.current_handoff(p_booking, 'pick_up');
  if v_drop.id is null or v_pick.id is null then
    return v_paid;
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

  -- Times or pets changed after the final quote: the booking's own final quote (confirmed, after its payment card).
  if v_card is null then
    select m.card into v_card
    from public.chat_messages m
    join public.chat_messages p on p.thread_id = m.thread_id
      and p.kind = 'card' and p.card ->> 'type' = 'payment' and p.card ->> 'booking_id' = p_booking::text
    where m.kind = 'card' and m.card ->> 'type' = 'quote' and m.card ->> 'status' = 'confirmed'
      and m.card ->> 'service_type' = b.service_type and m.created_at > p.created_at
      and not public.payment_card_between(m.thread_id, p.created_at, m.created_at)
    order by m.created_at desc
    limit 1;
  end if;
  if v_card is null then
    return v_paid;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('label', e ->> 'label', 'amount', (e ->> 'amount')::numeric) order by o)
    from jsonb_array_elements(coalesce(v_card -> 'extras', '[]'::jsonb)) with ordinality as t(e, o)
    where e ->> 'status' = 'accepted'
  ), '[]'::jsonb);
end;
$$;

-- Demo payment (006, 014o) that waits for an open final quote.
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
  v_card public.chat_messages;
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

  -- The sitter's final quote comes after the booking's payment card; while it is open, its fees are not answered yet.
  select m.* into v_card from public.chat_messages m
  where m.kind = 'card' and m.card ->> 'type' = 'payment' and m.card ->> 'booking_id' = p_booking::text
  order by m.created_at limit 1;
  if found and exists (
    select 1 from public.chat_messages m
    where m.thread_id = v_card.thread_id and m.kind = 'card' and m.card ->> 'type' = 'quote'
      and m.card ->> 'status' = 'sent' and m.created_at > v_card.created_at
      and not public.payment_card_between(m.thread_id, v_card.created_at, m.created_at)
  ) then
    raise exception 'quote_pending';
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
    format('%s signed and paid. %s is all set ✅',
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

notify pgrst, 'reload schema';
