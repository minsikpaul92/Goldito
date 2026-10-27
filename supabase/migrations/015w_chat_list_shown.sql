-- 015w (#451): the chat list counts and previews only the messages the chat draws.
--
-- A booking request writes the request card and, for a first-time pair, the Meet & Greet card (015f). The chat never
-- draws the request card, and draws the Meet & Greet card only after the sitter's first yes
-- (`frontend/app/chat/[threadId].tsx`, stepCard). 015m counted and previewed every row, so a request with a message
-- showed 4 unread and "Meet" as the preview where the chat showed 2 messages.
--
-- `chat_message_shown` is the chat's rule in SQL; keep the two in step. A row with no sender (a step card posted by
-- the system) is never unread.

create or replace function public.chat_message_shown(p_kind text, p_card jsonb)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_kind <> 'card' then true
    when p_card ->> 'type' in ('stay', 'quote', 'meet_greet_update') then true
    when p_card ->> 'type' = 'meet_greet' then exists (
      select 1 from public.bookings b
      where b.id = (p_card ->> 'booking_id')::uuid
        and not (b.meet_greet_status = 'required' and b.sitter_interest_at is null))
    when p_card ->> 'type' in ('agreement', 'payment') then exists (
      select 1 from public.bookings b where b.id = (p_card ->> 'booking_id')::uuid)
    else false -- 'request' and any card the chat does not draw
  end
$$;

revoke execute on function public.chat_message_shown(text, jsonb) from public, anon, authenticated;

-- As 015m; the preview is the newest shown message (the newest of any kind only when none is shown).
drop function if exists public.list_my_chats();
create or replace function public.list_my_chats()
returns table (
  thread_id uuid, other_id uuid, other_name text,
  last_kind text, last_body text, last_card_type text, last_at timestamptz, unread_count int,
  pets jsonb
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
      where m.thread_id = t.id and m.sender_id is not null and m.sender_id <> auth.uid()
        and m.created_at > coalesce(case when t.owner_id = auth.uid() then t.owner_read_at else t.sitter_read_at end, '-infinity')
        and public.chat_message_shown(m.kind, m.card)),
    (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'species', p.species,
        'photo', (select ph.public_id from public.pet_photos ph where ph.pet_id = p.id order by ph.position limit 1)
      ) order by p.name), '[]'::jsonb)
      from (
        select m.card from public.chat_messages m
        where m.thread_id = t.id and m.card ->> 'type' in ('stay', 'request')
        order by m.created_at desc limit 1
      ) c
      cross join lateral jsonb_array_elements(coalesce(c.card -> 'pets', '[]'::jsonb)) as e(pet)
      join public.pets p on p.id = (e.pet ->> 'id')::uuid)
  from public.chat_threads t
  join public.profiles o on o.id = case when t.owner_id = auth.uid() then t.sitter_id else t.owner_id end
  join lateral (
    select m.kind, m.body, m.card ->> 'type' as card_type, m.created_at from public.chat_messages m
    where m.thread_id = t.id
    order by public.chat_message_shown(m.kind, m.card) desc, m.created_at desc limit 1
  ) lm on true
  where (t.owner_id = auth.uid() or t.sitter_id = auth.uid())
    and lm.created_at > coalesce(case when t.owner_id = auth.uid() then t.owner_left_at else t.sitter_left_at end, '-infinity')
  order by lm.created_at desc
$$;

revoke execute on function public.list_my_chats() from public, anon;
grant execute on function public.list_my_chats() to authenticated, service_role;
