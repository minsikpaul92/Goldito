-- PawNote 003: shared functions, triggers, booking & handoff RPCs (Phase 02, task 2.8)
-- Source of truth: docs/plan/phases/phase-02.md §2.8
--
-- RPC errors are raised with the error code as the message (e.g. 'sitter_unavailable')
-- so the client can branch on `error.message`. Full list: supabase/README.md.

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger owner_profiles_set_updated_at before update on public.owner_profiles
  for each row execute function public.set_updated_at();
create trigger sitter_profiles_set_updated_at before update on public.sitter_profiles
  for each row execute function public.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();
create trigger daily_reports_set_updated_at before update on public.daily_reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Signup & care
-- ---------------------------------------------------------------------------

-- Role comes from signUp options.data.role at insert time only; later user_metadata edits
-- do not change profiles.role (FastAPI must read the role from profiles, not the JWT).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := case when new.raw_user_meta_data ->> 'role' = 'sitter' then 'sitter' else 'owner' end;
  v_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'PawNote user'
  );
begin
  insert into public.profiles (id, role, display_name) values (new.id, v_role, v_name);
  if v_role = 'owner' then
    insert into public.owner_profiles (id) values (new.id);
  else
    insert into public.sitter_profiles (id) values (new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.guard_care_task_species()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_species text;
begin
  select species into v_species from public.pets where id = new.pet_id;
  if (new.type = 'walk' and v_species = 'cat') or (new.type = 'litter' and v_species = 'dog') then
    raise exception 'task_type_not_allowed_for_species';
  end if;
  return new;
end;
$$;

create trigger care_tasks_species_guard
  before insert or update of type, pet_id on public.care_tasks
  for each row execute function public.guard_care_task_species();

-- ---------------------------------------------------------------------------
-- Internal helpers (security invoker; run with definer rights when called from RPCs).
-- Execute is revoked from clients at the end of this file.
-- ---------------------------------------------------------------------------

create or replace function public.local_ts(p_day date, p_time time)
returns timestamptz
language sql
stable
set search_path = public
as $$ select (p_day + p_time) at time zone public.app_timezone() $$;

create or replace function public.hours_range(p_day date, p_starts time, p_ends time)
returns tstzrange
language sql
stable
set search_path = public
as $$
  select tstzrange(
    public.local_ts(p_day, p_starts),
    public.local_ts(p_day + case when p_ends <= p_starts then 1 else 0 end, p_ends),
    '[)'
  )
$$;

-- The open row that applies to a day × slot: the newest one covering that day.
create or replace function public.sitter_open_row(p_sitter uuid, p_day date, p_slot public.care_slot)
returns public.sitter_availability
language sql
stable
set search_path = public
as $$
  select a.*
  from public.sitter_availability a
  where a.sitter_id = p_sitter
    and a.kind = 'open'
    and a.slot = p_slot
    and p_day between a.start_date and a.end_date
  order by a.created_at desc, a.id desc
  limit 1
$$;

-- Sitter's own hours for an opened day × slot. Null if not opened.
create or replace function public.sitter_hours(p_sitter uuid, p_day date, p_slot public.care_slot)
returns tstzrange
language sql
stable
set search_path = public
as $$
  select public.hours_range(p_day, o.starts_at, o.ends_at)
  from public.sitter_open_row(p_sitter, p_day, p_slot) o
  where o.id is not null
$$;

-- sitter_profiles.default_hours for a day × slot (used for slots the sitter has not opened).
create or replace function public.default_slot_range(p_sitter uuid, p_day date, p_slot public.care_slot)
returns tstzrange
language sql
stable
set search_path = public
as $$
  select public.hours_range(
    p_day,
    coalesce(sp.default_hours -> p_slot::text ->> 0,
      case p_slot when 'morning' then '08:00' when 'afternoon' then '12:00' else '18:00' end)::time,
    coalesce(sp.default_hours -> p_slot::text ->> 1,
      case p_slot when 'morning' then '12:00' when 'afternoon' then '18:00' else '08:00' end)::time
  )
  from (select 1) one
  left join public.sitter_profiles sp on sp.id = p_sitter
$$;

-- The sitter's (day, slot)s a stay [p_from, p_to) needs:
--   * opened slots that overlap the stay;
--   * slots the sitter has not opened (default_hours) when the stay covers more than half
--     of them — e.g. an overnight in the middle of a trip, so a gap is never skipped.
--     A shorter overlap at either end is a custom drop-off / pick-up time the sitter can OK.
create or replace function public.slots_for_window(p_sitter uuid, p_from timestamptz, p_to timestamptz)
returns table (day date, slot public.care_slot)
language sql
stable
set search_path = public
as $$
  select x.day, x.slot
  from (
    select
      d::date as day,
      s.slot,
      public.sitter_hours(p_sitter, d::date, s.slot) as opened,
      public.default_slot_range(p_sitter, d::date, s.slot) as fallback,
      tstzrange(p_from, p_to, '[)') as stay
    from generate_series(
      ((p_from at time zone public.app_timezone())::date - 1)::timestamp,
      ((p_to at time zone public.app_timezone())::date)::timestamp,
      interval '1 day'
    ) d
    cross join unnest(enum_range(null::public.care_slot)) as s (slot)
  ) x
  where case
    when x.opened is not null then x.opened && x.stay
    else x.fallback && x.stay
      and upper(x.fallback * x.stay) - lower(x.fallback * x.stay)
        > (upper(x.fallback) - lower(x.fallback)) / 2
  end
  order by 1, 2
$$;

create or replace function public.sitter_capacity(p_sitter uuid, p_day date, p_slot public.care_slot)
returns int
language sql
stable
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.sitter_availability a
      where a.sitter_id = p_sitter and a.kind = 'blocked' and a.slot = p_slot
        and p_day between a.start_date and a.end_date
    ) then 0
    else coalesce((select o.max_pets from public.sitter_open_row(p_sitter, p_day, p_slot) o), 0)
  end
$$;

create or replace function public.sitter_used(
  p_sitter uuid, p_day date, p_slot public.care_slot, p_exclude_booking uuid default null
)
returns int
language sql
stable
set search_path = public
as $$
  select count(*)::int
  from public.booking_slots s
  join public.bookings b on b.id = s.booking_id
  where b.sitter_id = p_sitter
    and b.status = 'confirmed'
    and s.day = p_day
    and s.slot = p_slot
    and b.id is distinct from p_exclude_booking
$$;

create or replace function public.sitter_remaining(p_sitter uuid, p_day date, p_slot public.care_slot)
returns int
language sql
stable
set search_path = public
as $$
  select greatest(
    public.sitter_capacity(p_sitter, p_day, p_slot) - public.sitter_used(p_sitter, p_day, p_slot),
    0
  )
$$;

-- Slots in the stay that cannot take p_pet_count more pets, as "YYYY-MM-DD slot, ...".
-- 'no_open_slot' when the stay touches none of the sitter's slots. Null when everything fits.
create or replace function public.capacity_shortfall(
  p_sitter uuid, p_exclude_booking uuid, p_pet_count int, p_from timestamptz, p_to timestamptz
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when not exists (select 1 from public.slots_for_window(p_sitter, p_from, p_to)) then 'no_open_slot'
    else (
      select string_agg(format('%s %s', f.day, f.slot), ', ' order by f.day, f.slot)
      from public.slots_for_window(p_sitter, p_from, p_to) f
      where public.sitter_capacity(p_sitter, f.day, f.slot)
          - public.sitter_used(p_sitter, f.day, f.slot, p_exclude_booking) < p_pet_count
    )
  end
$$;

create or replace function public.within_sitter_hours(p_sitter uuid, p_at timestamptz)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from generate_series(
      ((p_at at time zone public.app_timezone())::date - 1)::timestamp,
      ((p_at at time zone public.app_timezone())::date)::timestamp,
      interval '1 day'
    ) d
    cross join unnest(enum_range(null::public.care_slot)) as s (slot)
    cross join lateral (select public.sitter_hours(p_sitter, d::date, s.slot) as h) x
    where x.h is not null
      and public.sitter_capacity(p_sitter, d::date, s.slot) > 0
      and p_at <@ tstzrange(lower(x.h), upper(x.h), '[]')
  )
$$;

create or replace function public.booking_pet_ids(p_booking uuid)
returns uuid[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(pet_id order by pet_id), '{}')
  from public.booking_pets where booking_id = p_booking
$$;

-- "Bori", "Bori and Mochi", "Bori, Coco and Mochi"
create or replace function public.booking_pet_names(p_booking uuid)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_names text[];
  n int;
begin
  select array_agg(p.name order by p.name) into v_names
  from public.pets p where p.id = any (public.booking_pet_ids(p_booking));
  n := coalesce(cardinality(v_names), 0);
  if n = 0 then return 'your pet'; end if;
  if n = 1 then return v_names[1]; end if;
  return array_to_string(v_names[1:n - 1], ', ') || ' and ' || v_names[n];
end;
$$;

create or replace function public.fmt_date_range(p_from date, p_to date)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_from = p_to then to_char(p_from, 'Mon FMDD')
    else to_char(p_from, 'Mon FMDD') || '–' || to_char(p_to, 'Mon FMDD') end
$$;

create or replace function public.fmt_local_time(p_at timestamptz)
returns text
language sql
stable
set search_path = public
as $$ select to_char(p_at at time zone public.app_timezone(), 'FMHH12:MI AM') $$;

create or replace function public.notify_user(
  p_user uuid, p_type text, p_title text, p_body text default null,
  p_pet uuid default null, p_booking uuid default null, p_ref uuid default null
)
returns void
language sql
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, body, pet_id, booking_id, ref_id)
  values (p_user, p_type, p_title, p_body, p_pet, p_booking, p_ref)
$$;

-- The handoff that currently counts for a booking:
--   confirmed → the agreed row (a pending change does not count until agreed);
--   requested → the pending proposal if any, else the row agreed during negotiation.
create or replace function public.current_handoff(p_booking uuid, p_kind text)
returns public.booking_handoffs
language sql
stable
set search_path = public
as $$
  select h.*
  from public.booking_handoffs h
  join public.bookings b on b.id = h.booking_id
  where h.booking_id = p_booking
    and h.kind = p_kind
    and (h.status = 'agreed' or (h.status = 'proposed' and b.status = 'requested'))
  order by (h.status = 'proposed') desc
  limit 1
$$;

-- Validates a handoff place and returns the normalized location_type.
create or replace function public.check_location(p_type text, p_note text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := coalesce(p_type, 'sitter_home');
begin
  if v not in ('sitter_home', 'owner_home', 'other') then
    raise exception 'invalid_location';
  end if;
  if v = 'other' and nullif(trim(p_note), '') is null then
    raise exception 'location_note_required';
  end if;
  return v;
end;
$$;

-- Point a booking at a new stay [p_from, p_to): pet care ranges (overlap guard),
-- capacity slots for the sitter, and the summary dates.
create or replace function public.rebuild_booking(p_booking uuid, p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_sitter uuid;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'invalid_window';
  end if;
  select sitter_id into v_sitter from public.bookings where id = p_booking;

  update public.booking_pets set care_range = tstzrange(p_from, p_to, '[)')
  where booking_id = p_booking;

  delete from public.booking_slots where booking_id = p_booking;
  insert into public.booking_slots (booking_id, pet_id, day, slot)
  select p_booking, bp.pet_id, f.day, f.slot
  from public.booking_pets bp
  cross join public.slots_for_window(v_sitter, p_from, p_to) f
  where bp.booking_id = p_booking;
  if not found then
    raise exception 'sitter_unavailable' using detail = 'no_open_slot';
  end if;

  update public.bookings
  set start_date = (p_from at time zone public.app_timezone())::date,
      end_date = (p_to at time zone public.app_timezone())::date
  where id = p_booking;
exception
  when exclusion_violation then
    raise exception 'pet_already_booked';
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedule & search RPCs
-- ---------------------------------------------------------------------------

create or replace function public.get_sitter_schedule(p_sitter uuid, p_from date, p_to date)
returns table (
  day date, slot public.care_slot, starts_at time, ends_at time, state text, remaining int
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = p_sitter and role = 'sitter') then
    raise exception 'not_a_sitter';
  end if;
  if p_to < p_from or p_to - p_from > 92 then raise exception 'invalid_window'; end if;

  return query
  select
    d::date,
    s.slot,
    o.starts_at,
    o.ends_at,
    case
      when cap.blocked then 'blocked'
      when o.id is null then 'closed'
      when rem.n = 0 then 'full'
      else 'open'
    end,
    case when cap.blocked or o.id is null then 0 else rem.n end
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  cross join unnest(enum_range(null::public.care_slot)) as s (slot)
  cross join lateral (select * from public.sitter_open_row(p_sitter, d::date, s.slot)) o
  cross join lateral (
    select exists (
      select 1 from public.sitter_availability a
      where a.sitter_id = p_sitter and a.kind = 'blocked' and a.slot = s.slot
        and d::date between a.start_date and a.end_date
    ) as blocked
  ) cap
  cross join lateral (select public.sitter_remaining(p_sitter, d::date, s.slot) as n) rem
  order by 1, 2;
end;
$$;

-- "Your sitters": sitters the caller has had a confirmed booking with
-- (including confirmed bookings that were later cancelled — responded_at marks acceptance).
create or replace function public.list_my_sitters()
returns table (
  sitter_id uuid, display_name text, bio text, service_area text, experience_years int,
  booking_count bigint, last_booking_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, sp.bio, sp.service_area, sp.experience_years,
    count(*), max(b.created_at)
  from public.bookings b
  join public.profiles p on p.id = b.sitter_id
  left join public.sitter_profiles sp on sp.id = p.id
  where b.owner_id = auth.uid()
    and (b.status = 'confirmed' or (b.status = 'cancelled' and b.responded_at is not null))
  group by p.id, p.display_name, sp.bio, sp.service_area, sp.experience_years
  order by max(b.created_at) desc
$$;

create or replace function public.search_sitters(
  p_drop_off_at timestamptz, p_pick_up_at timestamptz, p_pet_count int
)
returns table (
  sitter_id uuid, display_name text, bio text, service_area text, experience_years int,
  is_my_sitter boolean, covered_slots int, total_slots int,
  drop_off_within_hours boolean, pick_up_within_hours boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_pick_up_at <= p_drop_off_at or p_pick_up_at - p_drop_off_at > interval '31 days'
    or p_pet_count < 1 then
    raise exception 'invalid_window';
  end if;

  return query
  with mine as (
    select m.sitter_id from public.list_my_sitters() m
  ),
  s as (
    select p.id, p.display_name, sp.bio, sp.service_area, sp.experience_years,
      p.id in (select sitter_id from mine) as mine,
      w.covered, w.total
    from public.profiles p
    left join public.sitter_profiles sp on sp.id = p.id
    cross join lateral (
      select
        count(*) filter (where public.sitter_remaining(p.id, f.day, f.slot) >= p_pet_count)::int as covered,
        count(*)::int as total
      from public.slots_for_window(p.id, p_drop_off_at, p_pick_up_at) f
    ) w
    where p.role = 'sitter' and p.id <> auth.uid()
  )
  select s.id, s.display_name, s.bio, s.service_area, s.experience_years, s.mine,
    s.covered, s.total,
    public.within_sitter_hours(s.id, p_drop_off_at),
    public.within_sitter_hours(s.id, p_pick_up_at)
  from s
  where s.covered > 0
  order by (s.covered = s.total and s.mine) desc, (s.covered = s.total) desc,
    s.covered desc, s.display_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking RPCs
-- ---------------------------------------------------------------------------

create or replace function public.request_booking(
  p_sitter uuid,
  p_pets uuid[],
  p_drop_off_at timestamptz,
  p_drop_off_location_type text,
  p_drop_off_note text,
  p_pick_up_at timestamptz,
  p_pick_up_location_type text,
  p_pick_up_note text,
  p_note text,
  p_rebooked_from uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pets uuid[];
  v_booking uuid;
  v_bad text;
  v_drop_type text;
  v_pick_type text;
  v_owner_name text;
begin
  select coalesce(array_agg(distinct x), '{}') into v_pets from unnest(p_pets) x where x is not null;
  if v_uid is null or cardinality(v_pets) = 0
    or (select count(*) from public.pets where id = any (v_pets) and owner_id = v_uid) <> cardinality(v_pets)
  then
    raise exception 'not_owner';
  end if;
  if not exists (select 1 from public.profiles where id = p_sitter and role = 'sitter') then
    raise exception 'not_a_sitter';
  end if;
  if p_drop_off_at is null or p_pick_up_at is null or p_pick_up_at <= p_drop_off_at
    or p_pick_up_at - p_drop_off_at > interval '31 days' or p_drop_off_at < now()
  then
    raise exception 'invalid_window';
  end if;
  if p_rebooked_from is not null
    and not exists (select 1 from public.bookings where id = p_rebooked_from and owner_id = v_uid)
  then
    raise exception 'not_owner';
  end if;
  v_drop_type := public.check_location(p_drop_off_location_type, p_drop_off_note);
  v_pick_type := public.check_location(p_pick_up_location_type, p_pick_up_note);

  v_bad := public.capacity_shortfall(p_sitter, null, cardinality(v_pets), p_drop_off_at, p_pick_up_at);
  if v_bad is not null then
    raise exception 'sitter_unavailable' using detail = v_bad;
  end if;

  insert into public.bookings (owner_id, sitter_id, start_date, end_date, owner_note, rebooked_from)
  values (
    v_uid, p_sitter,
    (p_drop_off_at at time zone public.app_timezone())::date,
    (p_pick_up_at at time zone public.app_timezone())::date,
    p_note, p_rebooked_from
  )
  returning id into v_booking;

  begin
    insert into public.booking_pets (booking_id, pet_id, care_range)
    select v_booking, pid, tstzrange(p_drop_off_at, p_pick_up_at, '[)') from unnest(v_pets) pid;
  exception
    when exclusion_violation then
      raise exception 'pet_already_booked';
  end;
  perform public.rebuild_booking(v_booking, p_drop_off_at, p_pick_up_at);

  insert into public.booking_handoffs
    (booking_id, kind, scheduled_at, location_type, location_note, within_sitter_hours, status, proposed_by)
  values
    (v_booking, 'drop_off', p_drop_off_at, v_drop_type, p_drop_off_note,
     public.within_sitter_hours(p_sitter, p_drop_off_at), 'proposed', v_uid),
    (v_booking, 'pick_up', p_pick_up_at, v_pick_type, p_pick_up_note,
     public.within_sitter_hours(p_sitter, p_pick_up_at), 'proposed', v_uid);

  select display_name into v_owner_name from public.profiles where id = v_uid;
  perform public.notify_user(
    p_sitter, 'booking_requested',
    format('%s requested a booking', v_owner_name),
    format('%s · %s', public.booking_pet_names(v_booking),
      public.fmt_date_range((p_drop_off_at at time zone public.app_timezone())::date,
                            (p_pick_up_at at time zone public.app_timezone())::date)),
    null, v_booking, v_booking
  );
  return v_booking;
end;
$$;

create or replace function public.respond_booking(p_booking uuid, p_accept boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_drop public.booking_handoffs;
  v_pick public.booking_handoffs;
  v_bad text;
  v_sitter_name text;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.sitter_id is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;
  if b.status <> 'requested' then
    raise exception 'invalid_status';
  end if;
  select display_name into v_sitter_name from public.profiles where id = b.sitter_id;

  if not p_accept then
    update public.booking_handoffs set status = 'rejected', responded_at = now()
    where booking_id = p_booking and status = 'proposed';
    update public.bookings
    set status = 'declined', sitter_note = p_note, responded_at = now()
    where id = p_booking;
    perform public.notify_user(
      b.owner_id, 'booking_declined',
      format('%s declined your booking request', v_sitter_name),
      p_note, null, p_booking, p_booking
    );
    return;
  end if;

  -- Accepting the booking accepts the owner's pending handoff proposals.
  if exists (
    select 1 from public.booking_handoffs
    where booking_id = p_booking and status = 'proposed' and proposed_by = b.sitter_id
  ) then
    raise exception 'handoff_pending';
  end if;

  v_drop := public.current_handoff(p_booking, 'drop_off');
  v_pick := public.current_handoff(p_booking, 'pick_up');
  if v_drop.id is null or v_pick.id is null then
    raise exception 'handoff_missing';
  end if;

  perform pg_advisory_xact_lock(hashtext(b.sitter_id::text));
  v_bad := public.capacity_shortfall(
    b.sitter_id, p_booking, cardinality(public.booking_pet_ids(p_booking)),
    v_drop.scheduled_at, v_pick.scheduled_at
  );
  if v_bad is not null then
    raise exception 'sitter_unavailable' using detail = v_bad;
  end if;
  perform public.rebuild_booking(p_booking, v_drop.scheduled_at, v_pick.scheduled_at);

  update public.booking_handoffs set status = 'superseded', responded_at = now()
  where booking_id = p_booking and status = 'agreed' and id not in (v_drop.id, v_pick.id);
  update public.booking_handoffs set status = 'agreed', responded_at = now()
  where id in (v_drop.id, v_pick.id) and status = 'proposed';

  update public.bookings
  set status = 'confirmed', sitter_note = p_note, responded_at = now()
  where id = p_booking;

  perform public.notify_user(
    b.owner_id, 'booking_confirmed',
    format('%s confirmed your booking', v_sitter_name),
    format('%s · %s', public.booking_pet_names(p_booking),
      public.fmt_date_range((select start_date from public.bookings where id = p_booking),
                            (select end_date from public.bookings where id = p_booking))),
    null, p_booking, p_booking
  );
end;
$$;

-- Owner or sitter, before the pets are handed over. Once the drop-off is received (or the
-- pick-up time has passed) the booking can only change through propose_handoff (early pick-up).
create or replace function public.cancel_booking(p_booking uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_uid uuid := auth.uid();
  v_name text;
  v_pets text;
  v_dates text;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or v_uid is null or v_uid not in (b.owner_id, b.sitter_id) then
    raise exception 'not_allowed';
  end if;
  if b.status not in ('requested', 'confirmed') then
    raise exception 'invalid_status';
  end if;
  if b.status = 'confirmed' and exists (
    select 1 from public.booking_handoffs h
    where h.booking_id = p_booking and h.status = 'agreed'
      and ((h.kind = 'drop_off' and h.completed_at is not null)
        or (h.kind = 'pick_up' and h.scheduled_at <= now()))
  ) then
    raise exception 'booking_in_progress';
  end if;

  update public.bookings
  set status = 'cancelled', cancelled_by = v_uid, cancel_reason = p_reason
  where id = p_booking;

  select display_name into v_name from public.profiles where id = v_uid;
  v_pets := public.booking_pet_names(p_booking);
  v_dates := public.fmt_date_range(b.start_date, b.end_date);
  if v_uid = b.sitter_id then
    perform public.notify_user(
      b.owner_id, 'booking_cancelled',
      format('%s cancelled your booking', v_name),
      format('%s can''t take %s on %s. Find a new sitter.', v_name, v_pets, v_dates),
      null, p_booking, p_booking
    );
  else
    perform public.notify_user(
      b.sitter_id, 'booking_cancelled',
      format('%s cancelled the booking', v_name),
      format('%s · %s', v_pets, v_dates),
      null, p_booking, p_booking
    );
  end if;
end;
$$;

-- A declined/cancelled booking frees its pets (overlap guard) and closes open proposals.
-- Capacity needs nothing here: it only counts confirmed bookings.
create or replace function public.sync_booking_ended()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('declined', 'cancelled') and old.status is distinct from new.status then
    update public.booking_pets set active = false where booking_id = new.id and active;
    update public.booking_handoffs set status = 'superseded', responded_at = now()
    where booking_id = new.id and status = 'proposed';
  end if;
  return new;
end;
$$;

create trigger bookings_sync_ended
  after update of status on public.bookings
  for each row execute function public.sync_booking_ended();

-- Confirmed bookings whose pets no longer fit in the sitter's capacity for slot/date range.
create or replace function public.availability_conflicts(
  p_sitter uuid, p_slot public.care_slot, p_from date, p_to date
)
returns uuid[]
language sql
stable
set search_path = public
as $$
  with used as (
    select s.day, count(*) as n, array_agg(distinct b.id) as ids
    from public.booking_slots s
    join public.bookings b on b.id = s.booking_id
    where b.sitter_id = p_sitter and b.status = 'confirmed'
      and s.slot = p_slot and s.day between p_from and p_to
    group by s.day
  )
  select array_agg(distinct x)
  from used, unnest(used.ids) x
  where used.n > public.sitter_capacity(p_sitter, used.day, p_slot)
$$;

-- Runs after the row change so capacity reflects the new state; raising rolls it back.
create or replace function public.guard_availability_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  perform pg_advisory_xact_lock(hashtext(coalesce(new.sitter_id, old.sitter_id)::text));
  if tg_op in ('UPDATE', 'DELETE') then
    v_ids := public.availability_conflicts(old.sitter_id, old.slot, old.start_date, old.end_date);
  end if;
  if v_ids is null and tg_op in ('INSERT', 'UPDATE') then
    v_ids := public.availability_conflicts(new.sitter_id, new.slot, new.start_date, new.end_date);
  end if;
  if v_ids is not null then
    raise exception 'overlaps_confirmed_booking' using detail = array_to_string(v_ids, ',');
  end if;
  return null;
end;
$$;

create trigger sitter_availability_guard
  after insert or update or delete on public.sitter_availability
  for each row execute function public.guard_availability_change();

-- ---------------------------------------------------------------------------
-- Handoff RPCs (drop-off / pick-up)
-- ---------------------------------------------------------------------------

-- p_location_type null = keep the place of the current proposal / agreement (time-only change).
create or replace function public.propose_handoff(
  p_booking uuid, p_kind text, p_at timestamptz, p_location_type text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_uid uuid := auth.uid();
  v_cur public.booking_handoffs;
  v_other public.booking_handoffs;
  v_type text;
  v_note text;
  v_from timestamptz;
  v_to timestamptz;
  v_bad text;
  v_id uuid;
  v_name text;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or v_uid is null or v_uid not in (b.owner_id, b.sitter_id) then
    raise exception 'not_allowed';
  end if;
  if b.status not in ('requested', 'confirmed') then
    raise exception 'invalid_status';
  end if;
  if p_kind is null or p_kind not in ('drop_off', 'pick_up') then
    raise exception 'invalid_kind';
  end if;
  if exists (
    select 1 from public.booking_handoffs
    where booking_id = p_booking and kind = p_kind and completed_at is not null
  ) then
    raise exception 'handoff_completed';
  end if;
  if p_at is null or p_at < now() then
    raise exception 'invalid_window';
  end if;

  select * into v_cur from public.booking_handoffs
  where booking_id = p_booking and kind = p_kind and status in ('proposed', 'agreed')
  order by (status = 'proposed') desc limit 1;
  if p_location_type is null then
    v_type := coalesce(v_cur.location_type, 'sitter_home');
    v_note := coalesce(p_note, v_cur.location_note);
  else
    v_type := p_location_type;
    v_note := p_note;
  end if;
  v_type := public.check_location(v_type, v_note);

  v_other := public.current_handoff(p_booking,
    case when p_kind = 'drop_off' then 'pick_up' else 'drop_off' end);
  v_from := case when p_kind = 'drop_off' then p_at else v_other.scheduled_at end;
  v_to := case when p_kind = 'pick_up' then p_at else v_other.scheduled_at end;
  if v_from is null or v_to is null or v_to <= v_from then
    raise exception 'invalid_window';
  end if;

  if b.status = 'confirmed' then
    perform pg_advisory_xact_lock(hashtext(b.sitter_id::text));
    v_bad := public.capacity_shortfall(
      b.sitter_id, p_booking, cardinality(public.booking_pet_ids(p_booking)), v_from, v_to
    );
    if v_bad is not null then
      raise exception 'sitter_unavailable' using detail = v_bad;
    end if;
  end if;

  update public.booking_handoffs set status = 'superseded', responded_at = now()
  where booking_id = p_booking and kind = p_kind and status = 'proposed';

  insert into public.booking_handoffs
    (booking_id, kind, scheduled_at, location_type, location_note, within_sitter_hours, status, proposed_by)
  values
    (p_booking, p_kind, p_at, v_type, v_note,
     public.within_sitter_hours(b.sitter_id, p_at), 'proposed', v_uid)
  returning id into v_id;

  select display_name into v_name from public.profiles where id = v_uid;
  perform public.notify_user(
    case when v_uid = b.owner_id then b.sitter_id else b.owner_id end,
    'handoff_proposed',
    format('%s suggested %s at %s', v_name, replace(p_kind, '_', '-'), public.fmt_local_time(p_at)),
    format('%s · %s', public.booking_pet_names(p_booking),
      to_char(p_at at time zone public.app_timezone(), 'Mon FMDD')),
    null, p_booking, v_id
  );
  return v_id;
end;
$$;

create or replace function public.respond_handoff(p_handoff uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.booking_handoffs;
  b public.bookings;
  v_uid uuid := auth.uid();
  v_other public.booking_handoffs;
  v_from timestamptz;
  v_to timestamptz;
  v_bad text;
  v_name text;
  v_label text;
begin
  select * into h from public.booking_handoffs where id = p_handoff;
  if not found then
    raise exception 'not_allowed';
  end if;
  select * into b from public.bookings where id = h.booking_id for update;
  select * into h from public.booking_handoffs where id = p_handoff for update;
  if v_uid is null or v_uid not in (b.owner_id, b.sitter_id) or v_uid = h.proposed_by then
    raise exception 'not_allowed';
  end if;
  if h.status <> 'proposed' or b.status not in ('requested', 'confirmed') then
    raise exception 'invalid_status';
  end if;

  select display_name into v_name from public.profiles where id = v_uid;
  v_label := replace(h.kind, '_', '-');

  if not p_accept then
    update public.booking_handoffs set status = 'rejected', responded_at = now() where id = h.id;
    if b.status = 'requested' then
      -- Declining during pre-confirmation negotiation ends the request.
      if v_uid = b.sitter_id then
        update public.bookings set status = 'declined', responded_at = now() where id = b.id;
        perform public.notify_user(
          b.owner_id, 'booking_declined',
          format('%s declined your booking request', v_name),
          null, null, b.id, b.id
        );
      else
        update public.bookings
        set status = 'cancelled', cancelled_by = v_uid, cancel_reason = 'handoff_declined'
        where id = b.id;
        perform public.notify_user(
          b.sitter_id, 'booking_cancelled',
          format('%s cancelled the booking request', v_name),
          format('%s · %s', public.booking_pet_names(b.id), public.fmt_date_range(b.start_date, b.end_date)),
          null, b.id, b.id
        );
      end if;
    else
      perform public.notify_user(
        h.proposed_by, 'handoff_declined',
        format('%s declined the %s change', v_name, v_label),
        null, null, b.id, h.id
      );
    end if;
    return;
  end if;

  if b.status = 'confirmed' then
    v_other := public.current_handoff(b.id,
      case when h.kind = 'drop_off' then 'pick_up' else 'drop_off' end);
    v_from := case when h.kind = 'drop_off' then h.scheduled_at else v_other.scheduled_at end;
    v_to := case when h.kind = 'pick_up' then h.scheduled_at else v_other.scheduled_at end;
    if v_from is null or v_to is null or v_to <= v_from then
      raise exception 'invalid_window';
    end if;
    perform pg_advisory_xact_lock(hashtext(b.sitter_id::text));
    v_bad := public.capacity_shortfall(
      b.sitter_id, b.id, cardinality(public.booking_pet_ids(b.id)), v_from, v_to
    );
    if v_bad is not null then
      raise exception 'sitter_unavailable' using detail = v_bad;
    end if;
    perform public.rebuild_booking(b.id, v_from, v_to);
  end if;

  update public.booking_handoffs set status = 'superseded', responded_at = now()
  where booking_id = b.id and kind = h.kind and status = 'agreed';
  update public.booking_handoffs set status = 'agreed', responded_at = now() where id = h.id;

  perform public.notify_user(
    h.proposed_by, 'handoff_agreed',
    format('%s agreed to %s at %s', v_name, v_label, public.fmt_local_time(h.scheduled_at)),
    null, null, b.id, h.id
  );
end;
$$;

-- Sitter taps Received (from 2 h before the agreed drop-off) / Returned (after Received).
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
      format('%s %s on the way home 👋', v_pets, case when v_many then 'are' else 'is' end),
      null, null, p_booking, v_h.id
    );
  end if;
end;
$$;

-- Agreed handoffs with the real address, for the two parties of a confirmed booking,
-- until 24 h after the agreed pick-up (same window as owner_profiles access in 002).
create or replace function public.get_handoff_details(p_booking uuid)
returns table (
  handoff_id uuid, kind text, scheduled_at timestamptz, location_type text, address text,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking;
  if not found or auth.uid() is null or auth.uid() not in (b.owner_id, b.sitter_id) then
    raise exception 'not_allowed';
  end if;
  if b.status <> 'confirmed' then
    raise exception 'invalid_status';
  end if;
  if not exists (
    select 1 from public.booking_handoffs p
    where p.booking_id = p_booking and p.kind = 'pick_up' and p.status = 'agreed'
      and p.scheduled_at + interval '24 hours' > now()
  ) then
    raise exception 'booking_finished';
  end if;

  return query
  select h.id, h.kind, h.scheduled_at, h.location_type,
    case h.location_type
      when 'sitter_home' then (select sp.home_address from public.sitter_profiles sp where sp.id = b.sitter_id)
      when 'owner_home' then (select op.home_address from public.owner_profiles op where op.id = b.owner_id)
      else h.location_note
    end,
    h.completed_at
  from public.booking_handoffs h
  where h.booking_id = p_booking and h.status = 'agreed'
  order by h.kind;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read RPCs (columns RLS does not expose)
-- ---------------------------------------------------------------------------

-- Pet cards for a booking list/detail, for both parties, in any status
-- (pets RLS hides a pet from the sitter once the booking has ended).
create or replace function public.get_booking_pets(p_booking uuid)
returns table (pet_id uuid, name text, species text, breed text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not exists (
    select 1 from public.bookings b
    where b.id = p_booking and auth.uid() in (b.owner_id, b.sitter_id)
  ) then
    raise exception 'not_allowed';
  end if;
  return query
  select p.id, p.name, p.species, p.breed
  from public.booking_pets bp
  join public.pets p on p.id = bp.pet_id
  where bp.booking_id = p_booking
  order by p.name;
end;
$$;

-- The caller's own sitter profile including home_address (hidden from the public list).
create or replace function public.get_my_sitter_profile()
returns setof public.sitter_profiles
language sql
stable
security definer
set search_path = public
as $$ select * from public.sitter_profiles where id = auth.uid() $$;

-- ---------------------------------------------------------------------------
-- Privileges: clients call the RPCs above; internal helpers stay private.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;

-- Explicit grants, so policies and RPCs do not depend on Supabase default privileges.
grant execute on function
  public.app_timezone(),
  public.app_today(),
  public.valid_default_hours(jsonb),
  public.my_role(),
  public.is_owner_of(uuid),
  public.is_sitter_of(uuid),
  public.is_on_duty_for(uuid),
  public.in_care_window(uuid, timestamptz),
  public.is_requested_sitter_of(uuid),
  public.can_access_pet(uuid),
  public.can_view_pet_profile(uuid),
  public.has_booking_with(uuid),
  public.has_current_booking_with(uuid),
  public.local_ts(date, time),
  public.fmt_date_range(date, date),
  public.fmt_local_time(timestamptz),
  public.get_sitter_schedule(uuid, date, date),
  public.list_my_sitters(),
  public.search_sitters(timestamptz, timestamptz, int),
  public.request_booking(uuid, uuid[], timestamptz, text, text, timestamptz, text, text, text, uuid),
  public.respond_booking(uuid, boolean, text),
  public.cancel_booking(uuid, text),
  public.propose_handoff(uuid, text, timestamptz, text, text),
  public.respond_handoff(uuid, boolean),
  public.complete_handoff(uuid, text),
  public.get_handoff_details(uuid),
  public.get_booking_pets(uuid),
  public.get_my_sitter_profile()
to authenticated, service_role;

revoke execute on function
  public.care_window(uuid, uuid),
  public.hours_range(date, time, time),
  public.sitter_open_row(uuid, date, public.care_slot),
  public.sitter_hours(uuid, date, public.care_slot),
  public.default_slot_range(uuid, date, public.care_slot),
  public.slots_for_window(uuid, timestamptz, timestamptz),
  public.sitter_capacity(uuid, date, public.care_slot),
  public.sitter_used(uuid, date, public.care_slot, uuid),
  public.sitter_remaining(uuid, date, public.care_slot),
  public.capacity_shortfall(uuid, uuid, int, timestamptz, timestamptz),
  public.within_sitter_hours(uuid, timestamptz),
  public.booking_pet_ids(uuid),
  public.booking_pet_names(uuid),
  public.notify_user(uuid, text, text, text, uuid, uuid, uuid),
  public.current_handoff(uuid, text),
  public.check_location(text, text),
  public.rebuild_booking(uuid, timestamptz, timestamptz),
  public.availability_conflicts(uuid, public.care_slot, date, date)
from authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.notifications;
