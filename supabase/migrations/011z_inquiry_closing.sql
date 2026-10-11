-- 011z (RV-5 rest): inquiries close when the owner books someone else, and a Life Record hit knows its pet.
--
-- The file name sorts after 011l on purpose: CI applies migrations in name order. 011m–011y are left to Phase Q.
--
-- 1. A booking for a pet over given dates closes the owner's other `open` inquiries about that pet over those dates —
--    to OTHER sitters. Those sitters could otherwise read the pet's Life Record for as long as their inquiry stayed
--    open (has_open_inquiry_about, 011e), including other sitters' care notes. The inquiry to the booked sitter is
--    left alone: the app marks it `booked` itself right after the request (markInquiryBooked).
--    Hooked on booking_pets because the pets and the care range are written after the booking row.
-- 2. match_knowledge returns pet_id, so "From Max's Life Record" names the right pet when an inquiry has several.
--    (The backend already reads hit["pet_id"].)

create or replace function public.close_sibling_inquiries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = new.booking_id;
  if not found then
    return new;
  end if;
  update public.inquiries i
  set status = 'closed'
  where i.owner_id = b.owner_id
    and i.sitter_id <> b.sitter_id
    and i.status = 'open'
    and new.pet_id = any (i.pet_ids)
    and tstzrange(i.drop_off_at, i.pick_up_at, '[)') && new.care_range;
  return new;
end;
$$;

create trigger booking_pets_close_sibling_inquiries
  after insert on public.booking_pets
  for each row execute function public.close_sibling_inquiries();

revoke execute on function public.close_sibling_inquiries() from public, anon, authenticated;

drop function public.match_knowledge(extensions.vector, uuid, uuid[], uuid, int);

create function public.match_knowledge(
  p_query extensions.vector(1024),
  p_sitter uuid,
  p_pets uuid[],
  p_owner uuid,
  p_k int default 5
)
returns table (content text, source_type text, source_id uuid, similarity float, pet_id uuid)
language sql
stable
set search_path = public, extensions
as $$
  select k.content, k.source_type, k.source_id, (1 - (k.embedding <=> p_query))::float as similarity, k.pet_id
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

notify pgrst, 'reload schema';
