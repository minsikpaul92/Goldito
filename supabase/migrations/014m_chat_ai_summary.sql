-- 014m (#142): the chat AI keeps a rolling summary of a long thread on the thread itself, so the backend stays stateless
-- (no Redis): each call reads the last ~20 messages plus this summary of everything before them.
--
-- ai_summary / ai_summary_upto are written only by the backend (service role). The two people of a thread read the thread
-- through RPCs and the messages table, never this column: column-level select keeps the summary out of the client's reach.

alter table public.chat_threads
  add column ai_summary text check (ai_summary is null or char_length(ai_summary) <= 2000),
  add column ai_summary_upto timestamptz;

revoke select on public.chat_threads from authenticated;
grant select (id, owner_id, sitter_id, created_at, last_message_at, owner_read_at, sitter_read_at, owner_left_at, sitter_left_at)
  on public.chat_threads to authenticated;

notify pgrst, 'reload schema';
