-- Phase 07C (7C.1): the stay is over — "home safe", a review, and the Pet Life Record.
--
-- * complete_handoff: the owner's Returned notice now says the pets are home safe.
-- * reviews + submit_review: one ★1–5 review per booking, by its owner, only after Returned. Rows are private to the
--   two parties; everyone else gets only the sitter's summary (sitter_rating_summary: average, count, three recent
--   comments with the reviewer's first name).
-- * review_requested (owner) is written when the pick-up handoff is completed; review_received goes to the sitter.
-- * pet_life_records: what a stay taught us about a pet, written by the backend (service role) and read by the owner,
--   by a sitter who has been asked to care for the pet (request or open inquiry) and by the current sitter.
--   A sitter whose stay is over loses access: the record travels to the NEXT sitter through the owner's request.

-- ---------------------------------------------------------------------------
-- Returned → "home safe"
-- ---------------------------------------------------------------------------

create or replace function public.complete_handoff(p_booking uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_h public.booking_handoffs;
  v_pets text;
  v_many boolean;
  v_sitter_name text;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.sitter_id is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;
  if b.status <> 'confirmed' then
    raise exception 'invalid_status';
  end if;
  if p_kind is null or p_kind not in ('drop_off', 'pick_up') then
    raise exception 'invalid_kind';
  end if;

  select * into v_h from public.booking_handoffs
  where booking_id = p_booking and kind = p_kind and status = 'agreed';
  if v_h.id is null then
    raise exception 'handoff_missing';
  end if;
  if v_h.completed_at is not null then
    raise exception 'handoff_completed';
  end if;
  if p_kind = 'drop_off' and now() < v_h.scheduled_at - interval '2 hours' then
    raise exception 'handoff_too_early';
  end if;
  if p_kind = 'pick_up' and not exists (
    select 1 from public.booking_handoffs
    where booking_id = p_booking and kind = 'drop_off' and status = 'agreed' and completed_at is not null
  ) then
    raise exception 'drop_off_not_completed';
  end if;

  update public.booking_handoffs set completed_at = now() where id = v_h.id;

  v_pets := public.booking_pet_names(p_booking);
  v_many := cardinality(public.booking_pet_ids(p_booking)) > 1;
  select display_name into v_sitter_name from public.profiles where id = b.sitter_id;
  if p_kind = 'drop_off' then
    perform public.notify_user(
      b.owner_id, 'pet_dropped_off',
      format('%s arrived at %s''s 🏠', v_pets, v_sitter_name),
      null, null, p_booking, v_h.id
    );
  else
    perform public.notify_user(
      b.owner_id, 'pet_picked_up',
      format('%s %s home safe 🏠', v_pets, case when v_many then 'are' else 'is' end),
      null, null, p_booking, v_h.id
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now()
);

create index reviews_sitter_created_idx on public.reviews (sitter_id, created_at desc);

alter table public.reviews enable row level security;

create policy reviews_select on public.reviews
  for select to authenticated
  using (owner_id = (select auth.uid()) or sitter_id = (select auth.uid()));

-- Written only through submit_review.
revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to authenticated;
grant all on public.reviews to service_role;

create or replace function public.submit_review(p_booking uuid, p_rating int, p_comment text default null)
returns public.reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_row public.reviews;
  v_owner_name text;
begin
  select * into b from public.bookings where id = p_booking;
  if not found or b.owner_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;
  if b.status <> 'confirmed' or not exists (
    select 1 from public.booking_handoffs
    where booking_id = p_booking and kind = 'pick_up' and completed_at is not null
  ) then
    raise exception 'stay_not_finished';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'invalid_rating';
  end if;
  if v_comment is not null and char_length(v_comment) > 500 then
    raise exception 'comment_too_long';
  end if;
  if exists (select 1 from public.reviews where booking_id = p_booking) then
    raise exception 'already_reviewed';
  end if;

  insert into public.reviews (booking_id, owner_id, sitter_id, rating, comment)
  values (p_booking, b.owner_id, b.sitter_id, p_rating, v_comment)
  returning * into v_row;

  select display_name into v_owner_name from public.profiles where id = b.owner_id;
  perform public.notify_user(
    b.sitter_id, 'review_received',
    format('%s left you %s ⭐', v_owner_name, p_rating || case when p_rating = 1 then ' star' else ' stars' end),
    left(v_comment, 140), null, p_booking, v_row.id
  );
  return v_row;
end;
$$;

-- The public side: average, count and the latest three comments with the reviewer's first name only.
create or replace function public.sitter_rating_summary(p_sitter uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'avg', (select round(avg(rating)::numeric, 1) from public.reviews where sitter_id = p_sitter),
    'count', (select count(*) from public.reviews where sitter_id = p_sitter),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rating', r.rating, 'comment', r.comment, 'created_at', r.created_at,
        'reviewer', split_part(coalesce(p.display_name, 'An owner'), ' ', 1)
      ) order by r.created_at desc)
      from (
        select * from public.reviews
        where sitter_id = p_sitter and comment is not null
        order by created_at desc limit 3
      ) r
      join public.profiles p on p.id = r.owner_id
    ), '[]'::jsonb)
  )
  where auth.uid() is not null
$$;

-- The owner is asked for a review the moment the pets are back (right after pet_picked_up).
create or replace function public.request_review_on_return()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_sitter text;
begin
  select * into b from public.bookings where id = new.booking_id;
  select display_name into v_sitter from public.profiles where id = b.sitter_id;
  perform public.notify_user(
    b.owner_id, 'review_requested',
    format('Thanks for trusting %s! How was %s''s stay? ⭐', v_sitter, public.booking_pet_names(new.booking_id)),
    null, null, new.booking_id, new.booking_id
  );
  return new;
end;
$$;

create trigger request_review_on_return
  after update of completed_at on public.booking_handoffs
  for each row
  when (new.kind = 'pick_up' and old.completed_at is null and new.completed_at is not null)
  execute function public.request_review_on_return();

revoke execute on function public.request_review_on_return() from public, anon, authenticated;
revoke execute on function public.submit_review(uuid, int, text), public.sitter_rating_summary(uuid) from public, anon;
grant execute on function public.submit_review(uuid, int, text), public.sitter_rating_summary(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Pet Life Records
-- ---------------------------------------------------------------------------

create table public.pet_life_records (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  sitter_id uuid references public.profiles (id) on delete set null,
  -- {eats, meds, potty, behavior, heads_up:[…], sitter_tips:[…], changed_since_last:[…]}
  summary jsonb not null,
  body text,
  source_snapshot jsonb,
  model text,
  created_at timestamptz not null default now(),
  unique (booking_id, pet_id)
);

create index pet_life_records_pet_created_idx on public.pet_life_records (pet_id, created_at desc);

-- A sitter who was asked about the pet through an open inquiry may read its latest record (the inquiry shared the profile).
create or replace function public.has_open_inquiry_about(p_pet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.inquiries i
    where i.sitter_id = auth.uid() and i.status = 'open' and p_pet = any (i.pet_ids)
  )
$$;

alter table public.pet_life_records enable row level security;

create policy pet_life_records_select on public.pet_life_records
  for select to authenticated
  using (public.can_view_pet_profile(pet_id) or public.has_open_inquiry_about(pet_id));

revoke all on public.pet_life_records from anon, authenticated;
grant select on public.pet_life_records to authenticated;
grant all on public.pet_life_records to service_role;

revoke execute on function public.has_open_inquiry_about(uuid) from public, anon;
grant execute on function public.has_open_inquiry_about(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
