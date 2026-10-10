-- Phase 07B (7B.1): inquiries (Stage 1), the thread, and the RAG knowledge base.
--
-- * inquiries / inquiry_messages: an owner asks a sitter about a stay; the AI writes a DRAFT in the
--   sitter's voice (author 'ai', internal), the sitter sends it (author 'sitter') — the owner never sees
--   author 'ai', and sees a sitter message only once it is sent and visible_at has passed (D35–D37).
-- * knowledge_chunks + match_knowledge: pgvector search, service role only (no client policy at all).
-- * sitter_profiles.policies: the sitter's house rules, written once; read by the AI and shown as a source.
-- * Notices: inquiry_received (sitter, draft ready) · inquiry_replied (owner, a sitter message became visible).
--
-- The vector extension lives in the `extensions` schema (as on Supabase); functions that use the type put
-- it on their search_path.

create extension if not exists vector with schema extensions;

alter table public.sitter_profiles add column policies text
  check (policies is null or char_length(policies) <= 4000);

-- ---------------------------------------------------------------------------
-- inquiries
-- ---------------------------------------------------------------------------

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  service_type text not null default 'boarding' check (service_type in ('boarding', 'house_sitting')),
  drop_off_at timestamptz not null,
  pick_up_at timestamptz not null,
  drop_off_location_type text not null default 'sitter_home'
    check (drop_off_location_type in ('sitter_home', 'owner_home', 'other')),
  pick_up_location_type text not null default 'sitter_home'
    check (pick_up_location_type in ('sitter_home', 'owner_home', 'other')),
  pet_ids uuid[] not null check (cardinality(pet_ids) between 1 and 10),
  status text not null default 'open' check (status in ('open', 'booked', 'closed')),
  booking_id uuid references public.bookings (id) on delete set null,
  created_at timestamptz not null default now(),
  check (pick_up_at > drop_off_at),
  check (owner_id <> sitter_id)
);

create index inquiries_sitter_created_idx on public.inquiries (sitter_id, created_at desc);
create index inquiries_owner_created_idx on public.inquiries (owner_id, created_at desc);

create table public.inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  -- 'ai' is the internal draft stage only; the owner is never shown it.
  author text not null check (author in ('owner', 'ai', 'sitter')),
  sender_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) <= 2000),
  -- ai drafts: the facts the draft stands on (quote, availability, sources) — for the sitter's review.
  grounding jsonb,
  model text,
  latency_ms int,
  drafted_by_ai boolean not null default false,
  status text not null default 'sent' check (status in ('draft', 'sent')),
  confirmed_by_sitter_at timestamptz,
  -- A sent sitter message is visible to the owner from here on (auto-send sets it a little later, 7B.10).
  visible_at timestamptz not null default now(),
  -- When the sitter actually opened the thread (owner messages only). The owner's read mark follows this alone.
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check ((author = 'ai') = (status = 'draft' and sender_id is null and drafted_by_ai)),
  check (author <> 'owner' or (sender_id is not null and not drafted_by_ai))
);

create index inquiry_messages_thread_idx on public.inquiry_messages (inquiry_id, created_at);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.owns_all_pets(p_pets uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_pets is not null
    and cardinality(p_pets) > 0
    and not exists (
      select 1 from unnest(p_pets) as x(id)
      left join public.pets p on p.id = x.id
      where p.owner_id is distinct from auth.uid()
    )
$$;

create or replace function public.is_sitter_profile(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = p_user and role = 'sitter')
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.inquiries enable row level security;
alter table public.inquiry_messages enable row level security;

create policy inquiries_select on public.inquiries
  for select to authenticated
  using (owner_id = (select auth.uid()) or sitter_id = (select auth.uid()));

create policy inquiries_insert on public.inquiries
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_sitter_profile(sitter_id)
    and public.owns_all_pets(pet_ids)
    and status = 'open'
    and booking_id is null
  );

-- The owner marks the inquiry booked once the booking request went out (7B.5): only status / booking_id,
-- and only with their own booking with this sitter.
create policy inquiries_update on public.inquiries
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (
      booking_id is null
      or exists (
        select 1 from public.bookings b
        where b.id = booking_id and b.owner_id = inquiries.owner_id and b.sitter_id = inquiries.sitter_id
      )
    )
  );

-- Sitter: everything in their threads, drafts included. Owner: their own messages and the sitter's SENT,
-- already visible ones — never 'ai'.
create policy inquiry_messages_select on public.inquiry_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.inquiries i
      where i.id = inquiry_id
        and (
          i.sitter_id = (select auth.uid())
          or (
            i.owner_id = (select auth.uid())
            and inquiry_messages.author in ('owner', 'sitter')
            and inquiry_messages.status = 'sent'
            and inquiry_messages.visible_at <= now()
          )
        )
    )
  );

create policy inquiry_messages_insert_owner on public.inquiry_messages
  for insert to authenticated
  with check (
    author = 'owner'
    and sender_id = (select auth.uid())
    and not drafted_by_ai
    and confirmed_by_sitter_at is null
    and exists (select 1 from public.inquiries i where i.id = inquiry_id and i.owner_id = (select auth.uid()))
  );

create policy inquiry_messages_insert_sitter on public.inquiry_messages
  for insert to authenticated
  with check (
    author = 'sitter'
    and status = 'sent'
    and sender_id = (select auth.uid())
    and exists (select 1 from public.inquiries i where i.id = inquiry_id and i.sitter_id = (select auth.uid()))
  );

-- Clients write only these columns; status / visible_at / read_at are server-side (RPC or service role).
revoke all on public.inquiries, public.inquiry_messages from anon, authenticated;
grant select on public.inquiries, public.inquiry_messages to authenticated;
grant insert (owner_id, sitter_id, service_type, drop_off_at, pick_up_at, drop_off_location_type,
  pick_up_location_type, pet_ids) on public.inquiries to authenticated;
grant update (status, booking_id) on public.inquiries to authenticated;
grant insert (inquiry_id, author, sender_id, body, drafted_by_ai, confirmed_by_sitter_at)
  on public.inquiry_messages to authenticated;
grant all on public.inquiries, public.inquiry_messages to service_role;

-- Sitter policies: public like the rest of the profile text; only the sitter writes them.
grant select (policies) on public.sitter_profiles to authenticated;
grant update (policies) on public.sitter_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Notices
-- ---------------------------------------------------------------------------

create or replace function public.notify_inquiry_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry public.inquiries;
  v_owner_name text;
  v_sitter_name text;
begin
  select * into v_inquiry from public.inquiries where id = new.inquiry_id;
  if new.author = 'ai' and new.status = 'draft' then
    select display_name into v_owner_name from public.profiles where id = v_inquiry.owner_id;
    perform public.notify_user(
      v_inquiry.sitter_id,
      'inquiry_received',
      format('%s asked about a stay — your draft is ready ✍️', v_owner_name),
      null, null, null, v_inquiry.id
    );
  elsif new.author = 'sitter' and new.status = 'sent' and new.visible_at <= now() then
    select display_name into v_sitter_name from public.profiles where id = v_inquiry.sitter_id;
    perform public.notify_user(
      v_inquiry.owner_id,
      'inquiry_replied',
      format('%s replied to your question 💬', v_sitter_name),
      left(new.body, 140), null, null, v_inquiry.id
    );
  end if;
  return new;
end;
$$;

create trigger notify_inquiry_message
  after insert on public.inquiry_messages
  for each row
  execute function public.notify_inquiry_message();

revoke execute on function public.notify_inquiry_message() from public, anon, authenticated;
revoke execute on function public.owns_all_pets(uuid[]) from public, anon;
revoke execute on function public.is_sitter_profile(uuid) from public, anon;
grant execute on function public.owns_all_pets(uuid[]), public.is_sitter_profile(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Knowledge base (RAG) — service role only: RLS on, no client policy, no client grant.
-- ---------------------------------------------------------------------------

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('sitter', 'pet', 'owner')),
  sitter_id uuid references public.profiles (id) on delete cascade,
  pet_id uuid references public.pets (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete cascade,
  source_type text not null check (source_type in ('sitter_policy', 'life_record', 'inquiry', 'care_request')),
  source_id uuid not null,
  chunk_no int not null default 0,
  content text not null check (char_length(content) <= 2000),
  embedding extensions.vector(1024) not null,
  created_at timestamptz not null default now(),
  unique (source_type, source_id, chunk_no)
);

create index knowledge_chunks_embedding_idx on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);
create index knowledge_chunks_source_idx on public.knowledge_chunks (source_type, source_id);

alter table public.knowledge_chunks enable row level security;
revoke all on public.knowledge_chunks from anon, authenticated;
grant all on public.knowledge_chunks to service_role;

-- Each source type has its own scope filter, so one search can never reach another owner's pet,
-- another sitter's policy, or a conversation the pair did not have (architecture §9).
create or replace function public.match_knowledge(
  p_query extensions.vector(1024),
  p_sitter uuid,
  p_pets uuid[],
  p_owner uuid,
  p_k int default 5
)
returns table (content text, source_type text, source_id uuid, similarity float)
language sql
stable
set search_path = public, extensions
as $$
  select k.content, k.source_type, k.source_id, (1 - (k.embedding <=> p_query))::float as similarity
  from public.knowledge_chunks k
  where (k.source_type = 'sitter_policy' and k.sitter_id = p_sitter)
     or (k.source_type in ('life_record', 'care_request') and k.pet_id = any (p_pets))
     or (k.source_type = 'inquiry' and k.sitter_id = p_sitter and k.owner_id = p_owner)
  order by k.embedding <=> p_query
  limit greatest(1, least(p_k, 20))
$$;

revoke execute on function public.match_knowledge(extensions.vector, uuid, uuid[], uuid, int)
  from public, anon, authenticated;
grant execute on function public.match_knowledge(extensions.vector, uuid, uuid[], uuid, int) to service_role;

-- Realtime: the owner's thread refetches when a message becomes visible, the sitter's on a new draft.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.inquiry_messages;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

notify pgrst, 'reload schema';
