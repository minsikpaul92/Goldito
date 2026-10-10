-- Phase 07B (7B.6): the sitter sends the reply through one RPC.
--
-- `send_inquiry_reply` is the only way a sitter message is written (the direct INSERT policy of 010 is
-- dropped): it checks the sitter owns the thread, stores the text they send (their edits included), and copies
-- ONLY the quote, the source labels and can_host from the AI draft onto the message the owner will read — never
-- the draft's internal notes. `mark_inquiry_read` stamps the owner's messages the moment the sitter opens the thread.

drop policy inquiry_messages_insert_sitter on public.inquiry_messages;
revoke insert (inquiry_id, author, sender_id, body, drafted_by_ai, confirmed_by_sitter_at)
  on public.inquiry_messages from authenticated;
-- The owner still inserts their own message; the column grant stays for that (policy: author = 'owner').
grant insert (inquiry_id, author, sender_id, body, drafted_by_ai, confirmed_by_sitter_at)
  on public.inquiry_messages to authenticated;

create or replace function public.send_inquiry_reply(p_inquiry uuid, p_body text, p_draft uuid default null)
returns public.inquiry_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry public.inquiries;
  v_draft public.inquiry_messages;
  v_body text := btrim(coalesce(p_body, ''));
  v_grounding jsonb;
  v_row public.inquiry_messages;
begin
  select * into v_inquiry from public.inquiries where id = p_inquiry;
  if not found or v_inquiry.sitter_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;
  if v_inquiry.status = 'closed' then
    raise exception 'inquiry_closed';
  end if;
  if char_length(v_body) = 0 then
    raise exception 'body_required';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'body_too_long';
  end if;

  if p_draft is not null then
    select * into v_draft from public.inquiry_messages
    where id = p_draft and inquiry_id = p_inquiry and author = 'ai';
    if not found then
      raise exception 'draft_not_found';
    end if;
    v_grounding := jsonb_strip_nulls(jsonb_build_object(
      'quote', v_draft.grounding -> 'quote',
      'sources', v_draft.grounding -> 'sources',
      'availability', jsonb_build_object('can_host', coalesce(v_draft.grounding #> '{availability,can_host}', 'true'::jsonb))
    ));
  end if;

  insert into public.inquiry_messages
    (inquiry_id, author, sender_id, body, grounding, drafted_by_ai, status, confirmed_by_sitter_at)
  values
    (p_inquiry, 'sitter', auth.uid(), v_body, v_grounding, p_draft is not null, 'sent', now())
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.mark_inquiry_read(p_inquiry uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.inquiry_messages m
  set read_at = now()
  from public.inquiries i
  where i.id = p_inquiry
    and i.sitter_id = auth.uid()
    and m.inquiry_id = i.id
    and m.author = 'owner'
    and m.read_at is null
$$;

revoke execute on function public.send_inquiry_reply(uuid, text, uuid) from public, anon;
revoke execute on function public.mark_inquiry_read(uuid) from public, anon;
grant execute on function public.send_inquiry_reply(uuid, text, uuid), public.mark_inquiry_read(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
