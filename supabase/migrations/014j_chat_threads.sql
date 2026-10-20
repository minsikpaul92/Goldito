-- 014j (3D.4, #141): one chat per owner and sitter pair.
--
-- * chat_threads: one row per (owner, sitter), reused for every later stay. Each person has a read mark and a
--   "left" mark: leaving hides the chat from their own list only (the history stays); a newer message, or opening
--   the chat again, brings it back.
-- * chat_messages: text typed by either person, or a card (kind 'card', JSON) written by the database for the first
--   card (dates, times and pets) and, in later steps, quotes, Meet & Greet, trips and diary entries.
-- * Everything is written through RPCs (no direct insert); reading is for the two people only (RLS).
-- * Existing inquiries become threads once: a stay card per inquiry and the messages the owner could see.
--   The inquiry tables and screens stay as they are (the AI draft flow moves to the chat in #142).

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  owner_read_at timestamptz,
  sitter_read_at timestamptz,
  owner_left_at timestamptz,
  sitter_left_at timestamptz,
  unique (owner_id, sitter_id),
  check (owner_id <> sitter_id)
);

create index chat_threads_sitter_idx on public.chat_threads (sitter_id, last_message_at desc);
create index chat_threads_owner_idx on public.chat_threads (owner_id, last_message_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'text' check (kind in ('text', 'card')),
  body text check (body is null or char_length(body) <= 2000),
  card jsonb,
  -- clock_timestamp, not now(): messages written in one transaction still keep their order.
  created_at timestamptz not null default clock_timestamp(),
  check (
    (kind = 'text' and body is not null and btrim(body) <> '' and card is null)
    or (kind = 'card' and card is not null and body is null)
  )
);

create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS: the two people of a thread, read only; every write is an RPC below
-- ---------------------------------------------------------------------------

create or replace function public.in_chat_thread(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_threads t
    where t.id = p_thread and (t.owner_id = auth.uid() or t.sitter_id = auth.uid())
  )
$$;

revoke execute on function public.in_chat_thread(uuid) from public, anon;
grant execute on function public.in_chat_thread(uuid) to authenticated, service_role;

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

create policy chat_threads_select on public.chat_threads
  for select to authenticated
  using (owner_id = (select auth.uid()) or sitter_id = (select auth.uid()));

create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (public.in_chat_thread(thread_id));

revoke all on public.chat_threads, public.chat_messages from anon, authenticated;
grant select on public.chat_threads, public.chat_messages to authenticated;
grant all on public.chat_threads, public.chat_messages to service_role;

-- A new message moves the thread up the list and counts as read for whoever wrote it.
create or replace function public.chat_message_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_threads t
  set last_message_at = greatest(t.last_message_at, new.created_at),
      owner_read_at = case when new.sender_id = t.owner_id then greatest(coalesce(t.owner_read_at, new.created_at), new.created_at) else t.owner_read_at end,
      sitter_read_at = case when new.sender_id = t.sitter_id then greatest(coalesce(t.sitter_read_at, new.created_at), new.created_at) else t.sitter_read_at end
  where t.id = new.thread_id;
  return new;
end;
$$;

revoke execute on function public.chat_message_inserted() from public, anon, authenticated;

create trigger chat_messages_after_insert
  after insert on public.chat_messages
  for each row execute function public.chat_message_inserted();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Opens (or finds) the chat with someone and brings it back to the caller's list. Only an owner starts a chat, and
-- only with a sitter; a sitter can open one that exists. With a stay (dates and pets) the first card is posted,
-- unless the latest stay card of the thread already says the same.
create or replace function public.open_chat_thread(
  p_other uuid,
  p_drop_off_at timestamptz default null,
  p_pick_up_at timestamptz default null,
  p_pet_ids uuid[] default null
)
returns public.chat_threads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_role text;
  v_owner uuid;
  v_sitter uuid;
  v_thread public.chat_threads;
  v_pets jsonb;
  v_card jsonb;
  v_last jsonb;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  v_role := public.my_role();
  if p_other is null or p_other = v_me then raise exception 'forbidden'; end if;

  if v_role = 'owner' then
    if not public.is_sitter_profile(p_other) then raise exception 'forbidden'; end if;
    v_owner := v_me;
    v_sitter := p_other;
  elsif v_role = 'sitter' then
    v_owner := p_other;
    v_sitter := v_me;
    if not exists (select 1 from public.chat_threads where owner_id = v_owner and sitter_id = v_sitter) then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;

  insert into public.chat_threads (owner_id, sitter_id) values (v_owner, v_sitter)
  on conflict (owner_id, sitter_id) do nothing;

  update public.chat_threads
  set owner_left_at = case when v_role = 'owner' then null else owner_left_at end,
      sitter_left_at = case when v_role = 'sitter' then null else sitter_left_at end
  where owner_id = v_owner and sitter_id = v_sitter
  returning * into v_thread;

  if v_role = 'owner' and p_drop_off_at is not null then
    if p_pick_up_at is null or p_pick_up_at <= p_drop_off_at or p_pet_ids is null
      or cardinality(p_pet_ids) not between 1 and 10 or not public.owns_all_pets(p_pet_ids)
    then
      raise exception 'invalid_stay';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name), '[]'::jsonb)
      into v_pets from public.pets p where p.id = any(p_pet_ids);
    v_card := jsonb_build_object(
      'type', 'stay', 'drop_off_at', p_drop_off_at, 'pick_up_at', p_pick_up_at, 'pets', v_pets
    );
    select m.card into v_last from public.chat_messages m
    where m.thread_id = v_thread.id and m.kind = 'card' and m.card ->> 'type' = 'stay'
    order by m.created_at desc limit 1;
    if v_last is distinct from v_card then
      insert into public.chat_messages (thread_id, sender_id, kind, card) values (v_thread.id, v_me, 'card', v_card);
    end if;
  end if;

  select * into v_thread from public.chat_threads where id = v_thread.id;
  return v_thread;
end;
$$;

-- Free chat: either person writes any time.
create or replace function public.send_chat_message(p_thread uuid, p_body text)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_row public.chat_messages;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.in_chat_thread(p_thread) then raise exception 'forbidden'; end if;
  if char_length(v_body) = 0 then raise exception 'body_required'; end if;
  if char_length(v_body) > 2000 then raise exception 'body_too_long'; end if;
  insert into public.chat_messages (thread_id, sender_id, kind, body)
  values (p_thread, auth.uid(), 'text', v_body)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.mark_chat_read(p_thread uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.in_chat_thread(p_thread) then raise exception 'forbidden'; end if;
  update public.chat_threads t
  set owner_read_at = case when t.owner_id = auth.uid() then clock_timestamp() else t.owner_read_at end,
      sitter_read_at = case when t.sitter_id = auth.uid() then clock_timestamp() else t.sitter_read_at end
  where t.id = p_thread;
end;
$$;

-- Leaving hides the chat from the caller's list only; the history is kept, and the next message brings it back.
create or replace function public.leave_chat(p_thread uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.in_chat_thread(p_thread) then raise exception 'forbidden'; end if;
  update public.chat_threads t
  set owner_left_at = case when t.owner_id = auth.uid() then clock_timestamp() else t.owner_left_at end,
      sitter_left_at = case when t.sitter_id = auth.uid() then clock_timestamp() else t.sitter_left_at end
  where t.id = p_thread;
end;
$$;

-- The caller's chats, newest first, with the other person's name, a preview and the unread count.
create or replace function public.list_my_chats()
returns table (
  thread_id uuid, other_id uuid, other_name text,
  last_kind text, last_body text, last_at timestamptz, unread_count int
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
    lm.created_at,
    (select count(*)::int from public.chat_messages m
      where m.thread_id = t.id and m.sender_id is distinct from auth.uid()
        and m.created_at > coalesce(case when t.owner_id = auth.uid() then t.owner_read_at else t.sitter_read_at end, '-infinity'))
  from public.chat_threads t
  join public.profiles o on o.id = case when t.owner_id = auth.uid() then t.sitter_id else t.owner_id end
  join lateral (
    select m.kind, m.body, m.created_at from public.chat_messages m
    where m.thread_id = t.id order by m.created_at desc limit 1
  ) lm on true
  where (t.owner_id = auth.uid() or t.sitter_id = auth.uid())
    and lm.created_at > coalesce(case when t.owner_id = auth.uid() then t.owner_left_at else t.sitter_left_at end, '-infinity')
  order by lm.created_at desc
$$;

-- One thread with the other person's name (a sitter has no other way to read an owner's name before a booking).
create or replace function public.get_chat_thread(p_thread uuid)
returns table (thread_id uuid, owner_id uuid, sitter_id uuid, other_id uuid, other_name text, my_role text)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.owner_id, t.sitter_id, o.id, o.display_name,
    case when t.owner_id = auth.uid() then 'owner' else 'sitter' end
  from public.chat_threads t
  join public.profiles o on o.id = case when t.owner_id = auth.uid() then t.sitter_id else t.owner_id end
  where t.id = p_thread and (t.owner_id = auth.uid() or t.sitter_id = auth.uid())
$$;

revoke execute on function
  public.open_chat_thread(uuid, timestamptz, timestamptz, uuid[]),
  public.send_chat_message(uuid, text),
  public.mark_chat_read(uuid),
  public.leave_chat(uuid),
  public.list_my_chats(),
  public.get_chat_thread(uuid)
from public, anon;
grant execute on function
  public.open_chat_thread(uuid, timestamptz, timestamptz, uuid[]),
  public.send_chat_message(uuid, text),
  public.mark_chat_read(uuid),
  public.leave_chat(uuid),
  public.list_my_chats(),
  public.get_chat_thread(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Existing inquiries become threads, once. Nothing is deleted; the AI drafts (internal) are not copied.
-- ---------------------------------------------------------------------------

insert into public.chat_threads (owner_id, sitter_id, created_at)
select i.owner_id, i.sitter_id, min(i.created_at) from public.inquiries i group by i.owner_id, i.sitter_id
on conflict (owner_id, sitter_id) do nothing;

insert into public.chat_messages (thread_id, sender_id, kind, card, created_at)
select t.id, i.owner_id, 'card',
  jsonb_build_object(
    'type', 'stay', 'drop_off_at', i.drop_off_at, 'pick_up_at', i.pick_up_at,
    'pets', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
                      from public.pets p where p.id = any(i.pet_ids)), '[]'::jsonb)
  ),
  i.created_at
from public.inquiries i
join public.chat_threads t on t.owner_id = i.owner_id and t.sitter_id = i.sitter_id;

insert into public.chat_messages (thread_id, sender_id, kind, body, created_at)
select t.id, case m.author when 'owner' then i.owner_id else i.sitter_id end, 'text', m.body, m.created_at
from public.inquiry_messages m
join public.inquiries i on i.id = m.inquiry_id
join public.chat_threads t on t.owner_id = i.owner_id and t.sitter_id = i.sitter_id
where m.author in ('owner', 'sitter') and m.status = 'sent' and m.visible_at <= now()
  and btrim(m.body) <> '';

-- The old conversations are history, not news, and sit at the time of their last message.
update public.chat_threads t
set owner_read_at = now(), sitter_read_at = now(),
    last_message_at = coalesce((select max(m.created_at) from public.chat_messages m where m.thread_id = t.id), t.created_at);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
    )
  then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

notify pgrst, 'reload schema';
