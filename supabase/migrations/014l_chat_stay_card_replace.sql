-- 014l (#141): asking about a stay again changes the card instead of piling up cards.
--
-- open_chat_thread (014j) posted a new stay card whenever the stay differed from the last one. When nothing has been
-- said since that card (it is still the last message and it is the caller's own), the card is updated to the new
-- stay instead, so two searches in a row leave one card. Once anyone has written something after it, a different
-- stay is a new card, as before.

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
  v_end public.chat_messages;
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

    select * into v_end from public.chat_messages m where m.thread_id = v_thread.id order by m.created_at desc limit 1;
    if found and v_end.kind = 'card' and v_end.card ->> 'type' = 'stay' and v_end.sender_id = v_me then
      -- Nothing was said after my last stay card: it becomes the new stay.
      if v_end.card is distinct from v_card then
        update public.chat_messages set card = v_card where id = v_end.id;
      end if;
    else
      select m.card into v_last from public.chat_messages m
      where m.thread_id = v_thread.id and m.kind = 'card' and m.card ->> 'type' = 'stay'
      order by m.created_at desc limit 1;
      if v_last is distinct from v_card then
        insert into public.chat_messages (thread_id, sender_id, kind, card) values (v_thread.id, v_me, 'card', v_card);
      end if;
    end if;
  end if;

  select * into v_thread from public.chat_threads where id = v_thread.id;
  return v_thread;
end;
$$;

notify pgrst, 'reload schema';
