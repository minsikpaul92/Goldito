-- 012f (CR-7, code review 2026-10-13): a reply is never sent from a draft older than the owner's latest message.
--
-- send_inquiry_reply (011k) copied the quote and can_host of ANY AI draft of the thread. When the owner changed the
-- dates (change_inquiry_dates, 011j, which leaves an owner message) or wrote again while the sitter still had the old
-- draft on screen, Send put out the old quote and a "yes" for dates that were never checked. Now such a draft is
-- refused with `draft_stale`; the app reloads the thread, where the new draft for the latest message is coming.
-- Everything else is 011k unchanged (same signature, so the grants are kept).

create or replace function public.send_inquiry_reply(
  p_inquiry uuid,
  p_body text,
  p_draft uuid default null,
  p_outcome text default null
)
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
  if p_outcome is not null and p_outcome not in ('accept', 'decline', 'suggest') then
    raise exception 'invalid_outcome';
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
    -- CR-7: a draft answers the owner's latest message. One written before a newer owner message (a follow-up, or
    -- change_inquiry_dates moving the dates) would send an answer — and a quote — for something the owner no longer asks.
    if exists (
      select 1 from public.inquiry_messages m
      where m.inquiry_id = p_inquiry and m.author = 'owner' and m.created_at > v_draft.created_at
    ) then
      raise exception 'draft_stale';
    end if;
  end if;

  if p_outcome in ('decline', 'suggest') then
    v_grounding := jsonb_build_object('availability', jsonb_build_object('can_host', false));
  elsif p_draft is not null then
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

notify pgrst, 'reload schema';
