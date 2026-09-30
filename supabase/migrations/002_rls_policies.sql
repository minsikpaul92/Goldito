-- PawNote 002: row level security (Phase 02, task 2.7)
-- Source of truth: docs/plan/phases/phase-02.md §2.7

-- ---------------------------------------------------------------------------
-- Helper functions (used by policies; security definer avoids RLS recursion)
-- ---------------------------------------------------------------------------

-- Must match APP_TIMEZONE (D8).
create or replace function public.app_timezone()
returns text
language sql
immutable
as $$ select 'America/Toronto'::text $$;

create or replace function public.app_today()
returns date
language sql
stable
set search_path = public
as $$ select (now() at time zone public.app_timezone())::date $$;

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_owner_of(pet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.pets where id = pet and owner_id = auth.uid())
$$;

-- One range per confirmed booking of `sitter` that includes `pet`:
-- [agreed drop_off, agreed pick_up).
create or replace function public.care_window(pet uuid, sitter uuid)
returns setof tstzrange
language sql
stable
set search_path = public
as $$
  select tstzrange(d.scheduled_at, p.scheduled_at, '[)')
  from public.bookings b
  join public.booking_handoffs d
    on d.booking_id = b.id and d.kind = 'drop_off' and d.status = 'agreed'
  join public.booking_handoffs p
    on p.booking_id = b.id and p.kind = 'pick_up' and p.status = 'agreed'
  where b.sitter_id = sitter
    and b.status = 'confirmed'
    and exists (
      select 1 from public.booking_slots s
      where s.booking_id = b.id and s.pet_id = pet and s.active
    )
$$;

-- Read access: a confirmed booking whose pick-up has not passed yet.
create or replace function public.is_sitter_of(pet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.care_window(pet, auth.uid()) w where upper(w) > now()
  )
$$;

-- Write access (post, report, safety, upload): 30 min before drop-off to 2 h after pick-up.
create or replace function public.is_on_duty_for(pet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.care_window(pet, auth.uid()) w
    where now() between lower(w) - interval '30 minutes' and upper(w) + interval '2 hours'
  )
$$;

create or replace function public.in_care_window(pet uuid, at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.care_window(pet, auth.uid()) w where w @> at)
$$;

create or replace function public.can_access_pet(pet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.is_owner_of(pet) or public.is_sitter_of(pet) $$;

create or replace function public.has_booking_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bookings
    where status in ('requested', 'confirmed')
      and ((owner_id = auth.uid() and sitter_id = other)
        or (sitter_id = auth.uid() and owner_id = other))
  )
$$;

create or replace function public.has_confirmed_booking_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bookings
    where status = 'confirmed'
      and ((owner_id = auth.uid() and sitter_id = other)
        or (sitter_id = auth.uid() and owner_id = other))
  )
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.owner_profiles enable row level security;
alter table public.sitter_profiles enable row level security;
alter table public.sitter_availability enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_slots enable row level security;
alter table public.booking_handoffs enable row level security;
alter table public.pets enable row level security;
alter table public.pet_allergies enable row level security;
alter table public.care_tasks enable row level security;
alter table public.media enable row level security;
alter table public.task_logs enable row level security;
alter table public.feed_posts enable row level security;
alter table public.daily_reports enable row level security;
alter table public.safety_checks enable row level security;
alter table public.notifications enable row level security;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or role = 'sitter' or public.has_booking_with(id));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy owner_profiles_select on public.owner_profiles
  for select to authenticated
  using (id = auth.uid() or public.has_confirmed_booking_with(id));

create policy owner_profiles_update on public.owner_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy sitter_profiles_select on public.sitter_profiles
  for select to authenticated
  using (true);

create policy sitter_profiles_update on public.sitter_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Schedule, bookings, handoffs (writes go through 003 RPCs)
-- ---------------------------------------------------------------------------

create policy sitter_availability_select on public.sitter_availability
  for select to authenticated
  using (sitter_id = auth.uid());

create policy sitter_availability_insert on public.sitter_availability
  for insert to authenticated
  with check (sitter_id = auth.uid() and public.my_role() = 'sitter');

create policy sitter_availability_update on public.sitter_availability
  for update to authenticated
  using (sitter_id = auth.uid())
  with check (sitter_id = auth.uid());

create policy sitter_availability_delete on public.sitter_availability
  for delete to authenticated
  using (sitter_id = auth.uid());

create policy bookings_select on public.bookings
  for select to authenticated
  using (owner_id = auth.uid() or sitter_id = auth.uid());

create policy booking_slots_select on public.booking_slots
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id));

create policy booking_handoffs_select on public.booking_handoffs
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id));

-- ---------------------------------------------------------------------------
-- Pets & care
-- ---------------------------------------------------------------------------

create policy pets_select on public.pets
  for select to authenticated
  using (public.can_access_pet(id));

create policy pets_insert on public.pets
  for insert to authenticated
  with check (owner_id = auth.uid() and public.my_role() = 'owner');

create policy pets_update on public.pets
  for update to authenticated
  using (public.is_owner_of(id))
  with check (public.is_owner_of(id));

create policy pets_delete on public.pets
  for delete to authenticated
  using (public.is_owner_of(id));

create policy pet_allergies_select on public.pet_allergies
  for select to authenticated
  using (public.can_access_pet(pet_id));

create policy pet_allergies_insert on public.pet_allergies
  for insert to authenticated
  with check (public.is_owner_of(pet_id));

create policy pet_allergies_update on public.pet_allergies
  for update to authenticated
  using (public.is_owner_of(pet_id))
  with check (public.is_owner_of(pet_id));

create policy pet_allergies_delete on public.pet_allergies
  for delete to authenticated
  using (public.is_owner_of(pet_id));

create policy care_tasks_select on public.care_tasks
  for select to authenticated
  using (public.can_access_pet(pet_id));

create policy care_tasks_insert on public.care_tasks
  for insert to authenticated
  with check (public.is_owner_of(pet_id));

create policy care_tasks_update on public.care_tasks
  for update to authenticated
  using (public.is_owner_of(pet_id))
  with check (public.is_owner_of(pet_id));

create policy care_tasks_delete on public.care_tasks
  for delete to authenticated
  using (public.is_owner_of(pet_id));

-- media: inserted by FastAPI (service role) after assert_on_duty_for.
create policy media_select on public.media
  for select to authenticated
  using (public.can_access_pet(pet_id));

-- task_logs: written by Phase 06 RPCs.
create policy task_logs_select on public.task_logs
  for select to authenticated
  using (public.can_access_pet(pet_id));

create policy feed_posts_select on public.feed_posts
  for select to authenticated
  using (public.can_access_pet(pet_id));

create policy feed_posts_insert on public.feed_posts
  for insert to authenticated
  with check (
    sitter_id = auth.uid()
    and public.is_on_duty_for(pet_id)
    and exists (
      select 1 from public.media m
      where m.id = media_id and m.pet_id = feed_posts.pet_id
    )
  );

create policy feed_posts_delete on public.feed_posts
  for delete to authenticated
  using (sitter_id = auth.uid());

-- daily_reports: inserted by FastAPI, sent via Phase 07 RPC.
create policy daily_reports_select on public.daily_reports
  for select to authenticated
  using (
    (public.is_owner_of(pet_id) and status = 'sent')
    or sitter_id = auth.uid()
  );

-- safety_checks: inserted by FastAPI.
create policy safety_checks_select on public.safety_checks
  for select to authenticated
  using (public.can_access_pet(pet_id));

create policy safety_checks_update on public.safety_checks
  for update to authenticated
  using (public.is_sitter_of(pet_id))
  with check (public.is_sitter_of(pet_id));

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notifications_delete on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Column privileges ("only these columns" rules — RLS cannot compare old/new)
-- ---------------------------------------------------------------------------

revoke update on public.pets, public.profiles, public.owner_profiles, public.sitter_profiles,
  public.safety_checks, public.notifications from anon, authenticated;

grant update (name, breed, birthdate, weight_kg, notes) on public.pets to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant update (home_address, emergency_contact_name, emergency_contact_phone, vet_clinic_name,
  vet_clinic_phone, notes) on public.owner_profiles to authenticated;
grant update (bio, service_area, home_address, experience_years, home_notes, default_max_pets,
  default_hours) on public.sitter_profiles to authenticated;
grant update (acknowledged_at) on public.safety_checks to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Hide sitter home_address from the public sitter list. A column-level revoke has no effect
-- while a table-level grant exists, so re-grant every other column explicitly.
-- The address is exposed only via get_handoff_details (003).
revoke select on public.sitter_profiles from anon, authenticated;
grant select (id, bio, service_area, experience_years, home_notes, default_max_pets,
  default_hours, created_at, updated_at) on public.sitter_profiles to authenticated;
