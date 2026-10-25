-- The chat list shows the pets of the stay asked about or requested in each chat (#263): id, name, species and the
-- first photo, taken from the latest stay or request card.

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
      where m.thread_id = t.id and m.sender_id is distinct from auth.uid()
        and m.created_at > coalesce(case when t.owner_id = auth.uid() then t.owner_read_at else t.sitter_read_at end, '-infinity')),
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
    where m.thread_id = t.id order by m.created_at desc limit 1
  ) lm on true
  where (t.owner_id = auth.uid() or t.sitter_id = auth.uid())
    and lm.created_at > coalesce(case when t.owner_id = auth.uid() then t.owner_left_at else t.sitter_left_at end, '-infinity')
  order by lm.created_at desc
$$;

revoke execute on function public.list_my_chats() from public, anon;
grant execute on function public.list_my_chats() to authenticated, service_role;
