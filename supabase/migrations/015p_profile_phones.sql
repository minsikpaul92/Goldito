-- Phone numbers (#358). Each person saves their own; nobody else reads the table. The other person of a chat gets it only
-- through get_chat_contact, once a Meet & Greet is agreed or done, or the booking is confirmed. The home address and the
-- entry info keep their own rules (D31); this only gives the owner's area (the first three characters of the postal code).

create table public.profile_phones (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  phone text not null check (char_length(phone) between 7 and 20 and phone ~ '^[0-9+() -]+$'),
  updated_at timestamptz not null default now()
);

alter table public.profile_phones enable row level security;

create policy profile_phones_select on public.profile_phones
  for select to authenticated using (profile_id = (select auth.uid()));
create policy profile_phones_insert on public.profile_phones
  for insert to authenticated with check (profile_id = (select auth.uid()));
create policy profile_phones_update on public.profile_phones
  for update to authenticated using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy profile_phones_delete on public.profile_phones
  for delete to authenticated using (profile_id = (select auth.uid()));

revoke all on public.profile_phones from anon, authenticated;
grant select, insert, update, delete on public.profile_phones to authenticated;
grant all on public.profile_phones to service_role;

-- Someone's phone, for the caller, when they have a booking together that is requested or confirmed and the Meet & Greet
-- is agreed or done (or the booking is confirmed). Null otherwise.
create or replace function public.get_contact_phone(p_other uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when exists (
    select 1 from public.bookings b
    where ((b.owner_id = auth.uid() and b.sitter_id = p_other) or (b.sitter_id = auth.uid() and b.owner_id = p_other))
      and b.status in ('requested', 'confirmed')
      and (b.meet_greet_status in ('agreed', 'done') or b.status = 'confirmed')
  ) then (select pp.phone from public.profile_phones pp where pp.profile_id = p_other) end
$$;

revoke execute on function public.get_contact_phone(uuid) from public, anon;
grant execute on function public.get_contact_phone(uuid) to authenticated, service_role;

-- The other person of a chat: name, their phone when it may be shared, and, for an owner, the area of the home.
create or replace function public.get_chat_contact(p_thread uuid)
returns table (other_id uuid, other_name text, phone text, area text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id,
    o.display_name,
    public.get_contact_phone(o.id),
    case when o.id = t.owner_id then
      nullif(upper(left(regexp_replace(coalesce(
        (select op.home_postal_code from public.owner_profiles op where op.id = o.id),
        (select substring(replace(op.home_address, ' ', '') from '([A-Za-z][0-9][A-Za-z])[0-9][A-Za-z][0-9]$') from public.owner_profiles op where op.id = o.id),
        ''), '\s', '', 'g'), 3)), '')
    end
  from public.chat_threads t
  join public.profiles o on o.id = case when t.owner_id = auth.uid() then t.sitter_id else t.owner_id end
  where t.id = p_thread and (t.owner_id = auth.uid() or t.sitter_id = auth.uid())
$$;

revoke execute on function public.get_chat_contact(uuid) from public, anon;
grant execute on function public.get_chat_contact(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
