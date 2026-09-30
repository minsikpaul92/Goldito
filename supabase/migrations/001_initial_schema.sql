-- PawNote 001: core schema (Phase 02, tasks 2.1–2.6)
-- Source of truth: docs/plan/phases/phase-02.md
-- RLS is added in 002, helper functions / triggers / RPCs in 003.

create type public.care_slot as enum ('morning', 'afternoon', 'overnight');

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'sitter')),
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

create table public.owner_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  home_address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  vet_clinic_name text,
  vet_clinic_phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sitter_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  bio text,
  service_area text,
  home_address text,
  experience_years int check (experience_years >= 0),
  home_notes text,
  default_max_pets int not null default 2 check (default_max_pets between 1 and 10),
  default_hours jsonb not null default
    '{"morning":["08:00","12:00"],"afternoon":["12:00","18:00"],"overnight":["18:00","08:00"]}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Pets
-- ---------------------------------------------------------------------------

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  species text not null check (species in ('dog', 'cat')),
  name text not null,
  breed text,
  birthdate date,
  weight_kg numeric(5, 2),
  notes text,
  created_at timestamptz not null default now()
);

create index pets_owner_id_idx on public.pets (owner_id);

create table public.pet_allergies (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  allergen text not null,
  notes text,
  created_at timestamptz not null default now()
);

create unique index pet_allergies_pet_allergen_key
  on public.pet_allergies (pet_id, lower(allergen));

-- ---------------------------------------------------------------------------
-- Sitter schedule, bookings, handoffs (D24)
-- ---------------------------------------------------------------------------

create table public.sitter_availability (
  id uuid primary key default gen_random_uuid(),
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('open', 'blocked')),
  start_date date not null,
  end_date date not null,
  slot public.care_slot not null,
  starts_at time,
  ends_at time,
  max_pets int,
  note text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (
    (kind = 'open'
      and starts_at is not null
      and ends_at is not null
      and max_pets is not null
      and max_pets between 1 and 10)
    or (kind = 'blocked' and max_pets is null)
  ),
  -- Overnight may wrap past midnight (ends_at < starts_at = next day); other slots may not.
  check (
    starts_at is null or ends_at is null
    or (starts_at <> ends_at and (slot = 'overnight' or ends_at > starts_at))
  )
);

create index sitter_availability_sitter_start_idx
  on public.sitter_availability (sitter_id, start_date);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'declined', 'cancelled')),
  owner_note text,
  sitter_note text,
  responded_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancel_reason text,
  rebooked_from uuid references public.bookings (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (owner_id <> sitter_id)
);

create index bookings_sitter_start_idx on public.bookings (sitter_id, start_date);
create index bookings_owner_id_idx on public.bookings (owner_id);

create table public.booking_slots (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  pet_id uuid not null references public.pets (id) on delete cascade,
  day date not null,
  slot public.care_slot not null,
  active boolean not null default true,
  primary key (booking_id, pet_id, day, slot)
);

-- One pet, one sitter per day × slot while the booking is requested/confirmed.
create unique index booking_slots_pet_day_slot_active_key
  on public.booking_slots (pet_id, day, slot) where active;
create index booking_slots_day_slot_idx on public.booking_slots (day, slot);

create table public.booking_handoffs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  kind text not null check (kind in ('drop_off', 'pick_up')),
  scheduled_at timestamptz not null,
  location_type text not null default 'sitter_home'
    check (location_type in ('sitter_home', 'owner_home', 'other')),
  location_note text,
  within_sitter_hours boolean not null,
  status text not null check (status in ('proposed', 'agreed', 'rejected', 'superseded')),
  proposed_by uuid not null references public.profiles (id) on delete cascade,
  responded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (location_type <> 'other' or location_note is not null)
);

create unique index booking_handoffs_agreed_key
  on public.booking_handoffs (booking_id, kind) where status = 'agreed';
create unique index booking_handoffs_proposed_key
  on public.booking_handoffs (booking_id, kind) where status = 'proposed';

-- ---------------------------------------------------------------------------
-- Care
-- ---------------------------------------------------------------------------

create table public.care_tasks (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  type text not null
    check (type in ('medication', 'walk', 'feeding', 'litter', 'play', 'sleep')),
  title text not null,
  dose text,
  scheduled_time time not null,
  repeat_daily boolean not null default true,
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index care_tasks_pet_id_idx on public.care_tasks (pet_id);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  uploaded_by uuid references public.profiles (id) on delete set null,
  cloudinary_public_id text not null unique,
  resource_type text not null check (resource_type in ('image', 'video')),
  purpose text not null check (purpose in ('feed', 'task_proof', 'safety_label')),
  width int,
  height int,
  duration_s numeric,
  created_at timestamptz not null default now()
);

create index media_pet_created_idx on public.media (pet_id, created_at desc);

create table public.task_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.care_tasks (id) on delete cascade,
  pet_id uuid not null references public.pets (id) on delete cascade,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  media_id uuid references public.media (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (task_id, due_at)
);

create index task_logs_pet_due_idx on public.task_logs (pet_id, due_at);

create table public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  media_id uuid not null references public.media (id) on delete cascade,
  caption text,
  caption_source text check (caption_source in ('ai', 'fallback', 'task')),
  task_log_id uuid references public.task_logs (id) on delete set null,
  created_at timestamptz not null default now()
);

create index feed_posts_pet_created_idx on public.feed_posts (pet_id, created_at desc);

create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  report_date date not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'sent')),
  inputs jsonb not null default '{}',
  source_snapshot jsonb,
  model text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pet_id, report_date, sitter_id)
);

create table public.safety_checks (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  checked_by uuid references public.profiles (id) on delete set null,
  media_id uuid not null references public.media (id) on delete cascade,
  safety_status text not null check (safety_status in ('DANGER', 'WARNING', 'SAFE')),
  result_json jsonb not null,
  model_vision text,
  model_reasoning text,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index safety_checks_pet_created_idx on public.safety_checks (pet_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  pet_id uuid references public.pets (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete cascade,
  type text not null,
  ref_id uuid,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;
