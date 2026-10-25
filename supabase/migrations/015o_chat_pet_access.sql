-- A sitter who is asked about a stay in a chat can read the owner's pets on that stay (profile, photos, allergies), to
-- decide whether to take it (#263). Same reach as an open inquiry (011e): only the sitter of that chat, only the pets on the
-- latest stay or request card, only while that stay is still ahead and the card is under 30 days old, and not after the
-- sitter left the chat. It reaches `pets`, `pet_photos`, `pet_allergies` and `pet_life_records` through their policies.

create or replace function public.has_open_inquiry_about(p_pet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.inquiries i
    where i.sitter_id = auth.uid()
      and i.status = 'open'
      and p_pet = any (i.pet_ids)
      and i.pick_up_at > now()
      and i.created_at > now() - interval '30 days'
  ) or exists (
    select 1 from public.chat_threads t
    cross join lateral (
      select m.card, m.created_at from public.chat_messages m
      where m.thread_id = t.id and m.card ->> 'type' in ('stay', 'request')
      order by m.created_at desc limit 1
    ) c
    where t.sitter_id = auth.uid()
      and c.created_at > now() - interval '30 days'
      and c.created_at > coalesce(t.sitter_left_at, '-infinity')
      and (c.card ->> 'pick_up_at')::timestamptz > now()
      and c.card -> 'pets' @> jsonb_build_array(jsonb_build_object('id', p_pet))
  )
$$;

notify pgrst, 'reload schema';
