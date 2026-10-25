-- The sitter's chat header shows the owner's pets of the stay (#263). Before a booking request the sitter cannot read the
-- pet rows (RLS, 002 · 011e), so the face, species and breed come from here: only the two people of the chat, only the
-- pets on the latest stay or request card, only what the header shows (no care notes, no allergies).

create or replace function public.get_chat_thread_pets(p_thread uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'species', p.species, 'breed', p.breed,
      'photo', (select ph.public_id from public.pet_photos ph where ph.pet_id = p.id order by ph.position limit 1)
    ) order by p.name), '[]'::jsonb)
  from public.chat_threads t
  cross join lateral (
    select m.card from public.chat_messages m
    where m.thread_id = t.id and m.card ->> 'type' in ('stay', 'request')
    order by m.created_at desc limit 1
  ) c
  cross join lateral jsonb_array_elements(coalesce(c.card -> 'pets', '[]'::jsonb)) as e(pet)
  join public.pets p on p.id = (e.pet ->> 'id')::uuid
  where t.id = p_thread and (t.owner_id = auth.uid() or t.sitter_id = auth.uid())
$$;

revoke execute on function public.get_chat_thread_pets(uuid) from public, anon;
grant execute on function public.get_chat_thread_pets(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
