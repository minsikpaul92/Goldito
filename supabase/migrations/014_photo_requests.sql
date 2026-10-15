-- 014 (Phase 11.1 Photo request): the owner asks the sitter on duty for a photo; the sitter's next shared photo of that
-- pet answers it.
--
-- 1. photo_requests: one row per ask, tied to the stay (booking) it was made in, so an ask left open when a stay ends
--    never shows up in the next one. At most one open ask per pet per stay — asking again returns the open one.
-- 2. request_photo(pet): the only way to ask. The pet must be in a confirmed stay right now (30 min before drop-off to
--    pick-up); the sitter of that stay gets one `photo_request` notice.
-- 3. A shared post by that sitter of that pet fulfills the open ask (any shared post — a task photo counts too) and
--    sends the owner `photo_request_fulfilled` instead of the usual `feed_post` notice, so one photo is one notice.
--    Trigger order: AFTER triggers on one table fire in name order, so fulfill_photo_request runs before
--    notify_feed_post and the latter can see the post was an answer.

create table public.photo_requests (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'fulfilled')),
  fulfilled_post_id uuid references public.feed_posts (id) on delete set null,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint photo_requests_fulfilled_chk check ((status = 'fulfilled') = (fulfilled_at is not null))
);

create unique index photo_requests_one_open_idx on public.photo_requests (booking_id, pet_id) where status = 'open';
create index photo_requests_sitter_open_idx on public.photo_requests (sitter_id) where status = 'open';
create index photo_requests_pet_created_idx on public.photo_requests (pet_id, created_at desc);

alter table public.photo_requests enable row level security;

-- Read: the owner who asked, and the asked sitter while the stay lasts (is_sitter_of). Writes go through
-- request_photo and the feed trigger only.
create policy photo_requests_select on public.photo_requests
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (sitter_id = (select auth.uid()) and public.is_sitter_of(pet_id))
  );

revoke all on public.photo_requests from anon, authenticated;
grant select on public.photo_requests to authenticated;
grant all on public.photo_requests to service_role;

create or replace function public.request_photo(p_pet uuid)
returns public.photo_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pet_name text;
  v_owner_name text;
  v_booking uuid;
  v_sitter uuid;
  v_row public.photo_requests;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select p.name, pr.display_name into v_pet_name, v_owner_name
  from public.pets p
  join public.profiles pr on pr.id = p.owner_id
  where p.id = p_pet and p.owner_id = v_uid;
  if not found then
    raise exception 'not_allowed';
  end if;

  -- The stay the pet is in right now (the latest one if two overlap).
  select b.id, b.sitter_id into v_booking, v_sitter
  from public.bookings b
  join public.booking_pets bp on bp.booking_id = b.id and bp.pet_id = p_pet and bp.active
  cross join lateral public.care_window(p_pet, b.sitter_id) w
  where b.status = 'confirmed'
    and b.owner_id = v_uid
    and now() between lower(w) - interval '30 minutes' and upper(w)
  order by lower(w) desc
  limit 1;
  if v_booking is null then
    raise exception 'not_in_care';
  end if;

  select * into v_row from public.photo_requests
  where booking_id = v_booking and pet_id = p_pet and status = 'open';
  if found then
    return v_row;
  end if;

  insert into public.photo_requests (pet_id, booking_id, owner_id, sitter_id)
  values (p_pet, v_booking, v_uid, v_sitter)
  returning * into v_row;

  perform public.notify_user(
    v_sitter,
    'photo_request',
    format('%s asked for a photo of %s 📷', v_owner_name, v_pet_name),
    null,
    p_pet,
    v_booking,
    v_row.id
  );
  return v_row;
end;
$$;

revoke execute on function public.request_photo(uuid) from public, anon;
grant execute on function public.request_photo(uuid) to authenticated, service_role;

create or replace function public.fulfill_photo_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    update public.photo_requests pr
    set status = 'fulfilled', fulfilled_post_id = new.id, fulfilled_at = now()
    where pr.pet_id = new.pet_id and pr.sitter_id = new.sitter_id and pr.status = 'open'
    returning pr.owner_id, pr.booking_id
  loop
    perform public.notify_user(
      r.owner_id,
      'photo_request_fulfilled',
      format('Here''s the photo of %s you asked for 📷', (select name from public.pets where id = new.pet_id)),
      null,
      new.pet_id,
      r.booking_id,
      new.id
    );
  end loop;
  return new;
end;
$$;

create trigger fulfill_photo_request
  after insert on public.feed_posts
  for each row
  when (new.sitter_id is not null and new.visibility = 'shared')
  execute function public.fulfill_photo_request();

revoke execute on function public.fulfill_photo_request() from public, anon, authenticated;

-- Same as 007c, plus: a sitter post that answered a photo request already sent its own notice.
create or replace function public.notify_feed_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_pet_name text;
  v_owner_name text;
  r record;
begin
  select p.owner_id, p.name, pr.display_name into v_owner, v_pet_name, v_owner_name
  from public.pets p
  join public.profiles pr on pr.id = p.owner_id
  where p.id = new.pet_id;

  if new.sitter_id is not null then
    if exists (select 1 from public.photo_requests where fulfilled_post_id = new.id) then
      return new;
    end if;
    perform public.notify_user(
      v_owner,
      'feed_post',
      format('New photo of %s 📸', v_pet_name),
      null,
      new.pet_id,
      null,
      new.id
    );
  else
    for r in
      select distinct on (b.sitter_id) b.sitter_id, b.id as booking_id
      from public.bookings b
      join public.booking_pets bp on bp.booking_id = b.id and bp.pet_id = new.pet_id and bp.active
      where b.status = 'confirmed'
        and exists (
          select 1 from public.care_window(new.pet_id, b.sitter_id) w
          where now() between lower(w) - interval '30 minutes' and upper(w) + interval '2 hours'
        )
    loop
      perform public.notify_user(
        r.sitter_id,
        'feed_post',
        format('%s shared a photo of %s 📸', v_owner_name, v_pet_name),
        null,
        new.pet_id,
        r.booking_id,
        new.id
      );
    end loop;
  end if;

  return new;
end;
$$;

revoke execute on function public.notify_feed_post() from public, anon, authenticated;

-- Realtime: the owner's button and the sitter's banner follow the request without a reload (RLS applies).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'photo_requests'
  ) then
    alter publication supabase_realtime add table public.photo_requests;
  end if;
end
$$;

notify pgrst, 'reload schema';
