-- 015k (#264): a Meet & Greet change arrives as a new line at the bottom of the chat.
--
-- The Meet & Greet card (014o) holds only the booking id and is redrawn as the booking changes, so an answer changed a
-- card higher up and nothing new arrived. Now every change also posts a short card at the bottom:
--
--   {type: 'meet_greet_update', booking_id, event, mode, at, place}
--   event: proposed · agreed · time_declined · skip_requested · skipped · done · declined
--
-- * The one who made the change is the sender, so the other side's unread count and chat preview follow it.
-- * mode, at and place are copied at that moment: the line keeps saying what was proposed even after a new time.
-- * Only once the Meet & Greet card is already in the chat: the card itself is the first word about the Meet & Greet.
-- * A cancel by the sweep (no time set) or by cancel_booking posts nothing here; their notices already say it.
-- * The old card stays where it is, as the record of the request. Agreement and payment cards are unchanged.

-- As 015f, plus the update line.
create or replace function public.post_booking_chat_cards()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
  v_sender uuid;
  v_type text;
  v_had_meet_card boolean;
  v_event text;
begin
  select t.id into v_thread from public.chat_threads t where t.owner_id = new.owner_id and t.sitter_id = new.sitter_id;
  if v_thread is null then
    return new; -- booked outside the chat (3B screens): no thread, no cards
  end if;
  v_sender := case when auth.uid() in (new.owner_id, new.sitter_id) then auth.uid() end;

  v_had_meet_card := exists (
    select 1 from public.chat_messages m
    where m.thread_id = v_thread and m.kind = 'card' and m.card ->> 'type' = 'meet_greet' and m.card ->> 'booking_id' = new.id::text
  );

  for v_type in
    select x from unnest(array[
      case when new.meet_greet_status <> 'not_needed'
            and (new.sitter_interest_at is not null or new.meet_greet_status <> 'required') then 'meet_greet' end,
      case when new.status in ('requested', 'confirmed') and new.meet_greet_status in ('not_needed', 'done', 'skipped')
           then 'agreement' end,
      case when new.status = 'confirmed' then 'payment' end
    ]) x where x is not null
  loop
    if not exists (
      select 1 from public.chat_messages m
      where m.thread_id = v_thread and m.kind = 'card' and m.card ->> 'type' = v_type and m.card ->> 'booking_id' = new.id::text
    ) then
      insert into public.chat_messages (thread_id, sender_id, kind, card)
      values (v_thread, v_sender, 'card', jsonb_build_object('type', v_type, 'booking_id', new.id, 'rev', 0));
    end if;
  end loop;

  -- The update line (#264): what changed, by whom, at the bottom.
  if v_had_meet_card then
    v_event := case
      when new.status = 'cancelled' and old.status is distinct from 'cancelled' and new.cancel_reason = 'meet_greet_declined'
        then 'declined'
      when new.status <> 'requested' then null
      when new.meet_greet_status = 'proposed'
           and (old.meet_greet_status is distinct from 'proposed' or old.meet_greet_at is distinct from new.meet_greet_at
                or old.meet_greet_mode is distinct from new.meet_greet_mode or old.meet_greet_place is distinct from new.meet_greet_place)
        then 'proposed'
      when new.meet_greet_status is not distinct from old.meet_greet_status then null
      when new.meet_greet_status = 'agreed' then 'agreed'
      when new.meet_greet_status = 'required' and old.meet_greet_status = 'proposed' then 'time_declined'
      when new.meet_greet_status = 'skip_requested' then 'skip_requested'
      when new.meet_greet_status = 'skipped' then 'skipped'
      when new.meet_greet_status = 'done' then 'done'
    end;
    if v_event is not null then
      insert into public.chat_messages (thread_id, sender_id, kind, card)
      values (v_thread, v_sender, 'card', jsonb_build_object(
        'type', 'meet_greet_update', 'booking_id', new.id, 'event', v_event,
        'mode', new.meet_greet_mode, 'at', new.meet_greet_at, 'place', new.meet_greet_place
      ));
    end if;
  end if;

  update public.chat_messages m
  set card = jsonb_set(m.card, '{rev}', to_jsonb(coalesce((m.card ->> 'rev')::int, 0) + 1))
  where m.thread_id = v_thread and m.kind = 'card'
    and m.card ->> 'type' in ('meet_greet', 'agreement', 'payment') and m.card ->> 'booking_id' = new.id::text;
  return new;
end;
$$;

-- The trigger (014o) fires on status, the Meet & Greet columns and the agreements; cancel_reason comes with status.
