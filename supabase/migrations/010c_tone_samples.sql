-- Phase 07B (7B.8 · 7B.9): the sitter's voice for AI drafts (D35).
--
-- tone_samples: what the sitter actually writes, kept per sitter and searched by meaning so a draft can follow their
-- own examples. Rows come from the anonymized history (seed), from replies the sitter approved or edited, and from
-- drafts they threw away (`regenerated`, a negative signal that is never used as an example). Auto-sent messages are
-- never recorded. Service role only. `sitter_profiles.style_card` is the sitter's style guide, also server-side.

alter table public.sitter_profiles add column style_card text
  check (style_card is null or char_length(style_card) <= 2000);

create table public.tone_samples (
  id uuid primary key default gen_random_uuid(),
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'inquiry' check (kind in ('inquiry', 'report')),
  source text not null check (source in ('history', 'approved', 'edited', 'regenerated')),
  intent text,
  context_summary text not null check (char_length(context_summary) <= 600),
  draft text,
  final_text text not null check (char_length(final_text) <= 2000),
  -- Word-level edit distance ÷ the longer text, 0 = sent as is.
  edit_ratio real check (edit_ratio is null or (edit_ratio >= 0 and edit_ratio <= 1)),
  -- The thread message this came from (one sample per sent message).
  source_message_id uuid unique references public.inquiry_messages (id) on delete set null,
  embedding extensions.vector(1024) not null,
  created_at timestamptz not null default now()
);

create index tone_samples_sitter_idx on public.tone_samples (sitter_id, created_at desc);
create index tone_samples_embedding_idx on public.tone_samples
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.tone_samples enable row level security;
revoke all on public.tone_samples from anon, authenticated;
grant all on public.tone_samples to service_role;

-- The sitter's own closest examples (never another sitter's, never a thrown-away draft).
create or replace function public.match_tone(
  p_query extensions.vector(1024),
  p_sitter uuid,
  p_kind text default 'inquiry',
  p_k int default 3
)
returns table (context_summary text, final_text text, source text, intent text, edit_ratio real, similarity float)
language sql
stable
set search_path = public, extensions
as $$
  select t.context_summary, t.final_text, t.source, t.intent, t.edit_ratio,
         (1 - (t.embedding <=> p_query))::float as similarity
  from public.tone_samples t
  where t.sitter_id = p_sitter
    and t.kind = p_kind
    and t.source in ('history', 'approved', 'edited')
  order by t.embedding <=> p_query
  limit greatest(1, least(p_k, 10))
$$;

revoke execute on function public.match_tone(extensions.vector, uuid, text, int) from public, anon, authenticated;
grant execute on function public.match_tone(extensions.vector, uuid, text, int) to service_role;

notify pgrst, 'reload schema';
