-- 014n (3D.6, #143): the sitter's quote and extra fees live in the chat as one card.
--
-- A quote card is a chat message (kind 'card', type 'quote') whose JSON holds the whole negotiation, so both people read
-- the same current state:
--   service_type, drop_off_at, pick_up_at, pets          the stay it prices
--   quote                                                  quote_booking() output, computed here, never typed
--   extras [{id, label, amount, status}]                   status: offered, accepted, declined
--   total                                                  quote.total plus the accepted extras (server arithmetic)
--   status                                                 sent, confirmed (owner read it), replaced (a newer quote exists)
--
-- * send_chat_quote   the thread's sitter prices a stay with their saved rates (same function as Checkout and Pay)
-- * add_chat_quote_extra   the sitter adds an extra fee line to an open quote (no fee = no line)
-- * answer_chat_quote_extra   the owner accepts or declines one fee; a declined fee is not in the total
-- * confirm_chat_quote   the owner confirms ("I've read it") once no fee is waiting for an answer
-- list_my_chats now also tells the card type of the last message, so the list can say "Quote".
-- Booking and payment keep using quote_booking; carrying the accepted extras into the booking is #144.

create or replace function public.chat_quote_total(p_card jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  select round(
    (p_card -> 'quote' ->> 'total')::numeric
    + coalesce((select sum((e ->> 'amount')::numeric)
                from jsonb_array_elements(coalesce(p_card -> 'extras', '[]'::jsonb)) e
                where e ->> 'status' = 'accepted'), 0),
    2)
$$;

revoke execute on function public.chat_quote_total(jsonb) from public, anon;
grant execute on function public.chat_quote_total(jsonb) to authenticated, service_role;

create or replace function public.send_chat_quote(
  p_thread uuid,
  p_service text,
  p_drop_off_at timestamptz,
  p_pick_up_at timestamptz,
  p_pet_ids uuid[]
)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread public.chat_threads;
  v_quote jsonb;
  v_pets jsonb;
  v_card jsonb;
  v_row public.chat_messages;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_thread from public.chat_threads where id = p_thread and sitter_id = auth.uid();
  if not found then raise exception 'forbidden'; end if;
  if p_pet_ids is null or cardinality(p_pet_ids) not between 1 and 10 then raise exception 'invalid_stay'; end if;
  if (select count(*) from public.pets p where p.id = any(p_pet_ids) and p.owner_id = v_thread.owner_id)
     <> (select count(distinct x) from unnest(p_pet_ids) x) then
    raise exception 'invalid_stay';
  end if;

  -- Errors of quote_booking (service_not_offered, rates_not_set, invalid_window ...) go to the caller as they are.
  v_quote := public.quote_booking(v_thread.sitter_id, p_service, p_drop_off_at, p_pick_up_at, cardinality(p_pet_ids));

  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name), '[]'::jsonb)
    into v_pets from public.pets p where p.id = any(p_pet_ids);

  v_card := jsonb_build_object(
    'type', 'quote',
    'service_type', p_service,
    'drop_off_at', p_drop_off_at,
    'pick_up_at', p_pick_up_at,
    'pets', v_pets,
    'quote', v_quote,
    'extras', '[]'::jsonb,
    'total', (v_quote ->> 'total')::numeric,
    'status', 'sent'
  );

  -- One quote is open at a time: a new one replaces the earlier ones that nobody confirmed.
  update public.chat_messages m
  set card = jsonb_set(m.card, '{status}', '"replaced"')
  where m.thread_id = p_thread and m.kind = 'card' and m.card ->> 'type' = 'quote' and m.card ->> 'status' = 'sent';

  insert into public.chat_messages (thread_id, sender_id, kind, card) values (p_thread, auth.uid(), 'card', v_card)
  returning * into v_row;
  return v_row;
end;
$$;

-- The quote card of a message, locked, for the person who may change it (role 'sitter' or 'owner'); it has to be open.
create or replace function public.open_quote_message(p_message uuid, p_role text)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.chat_messages;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select m.* into v_row
  from public.chat_messages m
  join public.chat_threads t on t.id = m.thread_id
  where m.id = p_message and m.kind = 'card' and m.card ->> 'type' = 'quote'
    and ((p_role = 'sitter' and t.sitter_id = auth.uid()) or (p_role = 'owner' and t.owner_id = auth.uid()))
  for update of m;
  if not found then raise exception 'forbidden'; end if;
  if v_row.card ->> 'status' <> 'sent' then raise exception 'quote_closed'; end if;
  return v_row;
end;
$$;

revoke execute on function public.open_quote_message(uuid, text) from public, anon, authenticated;

create or replace function public.add_chat_quote_extra(p_message uuid, p_label text, p_amount numeric)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.chat_messages;
  v_label text := btrim(coalesce(p_label, ''));
  v_card jsonb;
begin
  v_row := public.open_quote_message(p_message, 'sitter');
  if char_length(v_label) = 0 or char_length(v_label) > 40 then raise exception 'invalid_extra'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 500 then raise exception 'invalid_extra'; end if;
  if jsonb_array_length(coalesce(v_row.card -> 'extras', '[]'::jsonb)) >= 5 then raise exception 'too_many_extras'; end if;

  v_card := jsonb_set(
    v_row.card, '{extras}',
    coalesce(v_row.card -> 'extras', '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object(
           'id', gen_random_uuid(), 'label', v_label, 'amount', round(p_amount, 2), 'status', 'offered'))
  );
  v_card := jsonb_set(v_card, '{total}', to_jsonb(public.chat_quote_total(v_card)));
  update public.chat_messages set card = v_card where id = p_message returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.answer_chat_quote_extra(p_message uuid, p_extra uuid, p_accept boolean)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.chat_messages;
  v_extras jsonb;
  v_card jsonb;
begin
  v_row := public.open_quote_message(p_message, 'owner');
  if p_accept is null then raise exception 'invalid_extra'; end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_row.card -> 'extras', '[]'::jsonb)) e
    where e ->> 'id' = p_extra::text and e ->> 'status' = 'offered'
  ) then
    raise exception 'invalid_extra';
  end if;

  select coalesce(jsonb_agg(
           case when e ->> 'id' = p_extra::text
                then jsonb_set(e, '{status}', to_jsonb(case when p_accept then 'accepted' else 'declined' end))
                else e end
           order by o), '[]'::jsonb)
    into v_extras
  from jsonb_array_elements(coalesce(v_row.card -> 'extras', '[]'::jsonb)) with ordinality as t(e, o);

  v_card := jsonb_set(v_row.card, '{extras}', v_extras);
  v_card := jsonb_set(v_card, '{total}', to_jsonb(public.chat_quote_total(v_card)));
  update public.chat_messages set card = v_card where id = p_message returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.confirm_chat_quote(p_message uuid)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.chat_messages;
begin
  v_row := public.open_quote_message(p_message, 'owner');
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_row.card -> 'extras', '[]'::jsonb)) e where e ->> 'status' = 'offered'
  ) then
    raise exception 'extras_pending';
  end if;
  update public.chat_messages
  set card = jsonb_set(jsonb_set(card, '{status}', '"confirmed"'), '{confirmed_at}', to_jsonb(now()))
  where id = p_message returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function
  public.send_chat_quote(uuid, text, timestamptz, timestamptz, uuid[]),
  public.add_chat_quote_extra(uuid, text, numeric),
  public.answer_chat_quote_extra(uuid, uuid, boolean),
  public.confirm_chat_quote(uuid)
from public, anon;
grant execute on function
  public.send_chat_quote(uuid, text, timestamptz, timestamptz, uuid[]),
  public.add_chat_quote_extra(uuid, text, numeric),
  public.answer_chat_quote_extra(uuid, uuid, boolean),
  public.confirm_chat_quote(uuid)
to authenticated, service_role;

-- The list previews a card by its type.
drop function if exists public.list_my_chats();
create or replace function public.list_my_chats()
returns table (
  thread_id uuid, other_id uuid, other_name text,
  last_kind text, last_body text, last_card_type text, last_at timestamptz, unread_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id,
    o.id,
    o.display_name,
    lm.kind,
    lm.body,
    lm.card_type,
    lm.created_at,
    (select count(*)::int from public.chat_messages m
      where m.thread_id = t.id and m.sender_id is distinct from auth.uid()
        and m.created_at > coalesce(case when t.owner_id = auth.uid() then t.owner_read_at else t.sitter_read_at end, '-infinity'))
  from public.chat_threads t
  join public.profiles o on o.id = case when t.owner_id = auth.uid() then t.sitter_id else t.owner_id end
  join lateral (
    select m.kind, m.body, m.card ->> 'type' as card_type, m.created_at from public.chat_messages m
    where m.thread_id = t.id order by m.created_at desc limit 1
  ) lm on true
  where (t.owner_id = auth.uid() or t.sitter_id = auth.uid())
    and lm.created_at > coalesce(case when t.owner_id = auth.uid() then t.owner_left_at else t.sitter_left_at end, '-infinity')
  order by lm.created_at desc
$$;

revoke execute on function public.list_my_chats() from public, anon;
grant execute on function public.list_my_chats() to authenticated, service_role;

notify pgrst, 'reload schema';
