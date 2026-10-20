-- 014k (3D.4/3D.7 groundwork, #141): the booking request shows up in the chat, and a chat counts as a reason to see photos.
--
-- * post_booking_request_card(thread, booking): after the owner sent request_booking from the chat, one card with the
--   dates, places, pets and note goes into the thread, so the sitter reads the request there. The owner's own booking
--   and the thread's sitter only; the same booking is never posted twice.
-- * shares_booking_or_inquiry now also counts a chat between the two (an owner who writes to a sitter may be seen by
--   them, like with a question): it decides who may see whose profile photos (014g).

create or replace function public.shares_booking_or_inquiry(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bookings b
    where (b.owner_id = p_a and b.sitter_id = p_b) or (b.owner_id = p_b and b.sitter_id = p_a)
  ) or exists (
    select 1 from public.inquiries i
    where (i.owner_id = p_a and i.sitter_id = p_b) or (i.owner_id = p_b and i.sitter_id = p_a)
  ) or exists (
    select 1 from public.chat_threads t
    where (t.owner_id = p_a and t.sitter_id = p_b) or (t.owner_id = p_b and t.sitter_id = p_a)
  )
$$;

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
  return v_row;
end;
$$;

revoke execute on function public.post_booking_request_card(uuid, uuid) from public, anon;
grant execute on function public.post_booking_request_card(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
