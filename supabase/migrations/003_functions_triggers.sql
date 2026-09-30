-- PawNote 003: shared functions, triggers, booking & handoff RPCs (Phase 02, task 2.8)
-- Source of truth: docs/plan/phases/phase-02.md §2.8
--
-- RPC errors are raised with the error code as the message (e.g. 'sitter_unavailable')
-- so the client can branch on `error.message`.

-- ---------------------------------------------------------------------------
-- Signup & care
-- ---------------------------------------------------------------------------

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
-- Internal helpers (security invoker; run with definer rights when called from RPCs)
-- ---------------------------------------------------------------------------

create or replace function public.local_ts(p_day date, p_time time)
returns timestamptz
language sql
stable
as $$ select (p_day + p_time) at time zone public.app_timezone() $$;

create or replace function public.hours_range(p_day date, p_starts time, p_ends time)
returns tstzrange
language sql
stable
as $$
  select tstzrange(
    public.local_ts(p_day, p_starts),
    public.local_ts(p_day + case when p_ends <= p_starts then 1 else 0 end, p_ends),
    '[)'
  )
$$;

-- Sitter's own hours for an opened day × slot (latest open row wins). Null if not opened.
create or replace function public.sitter_hours(p_sitter uuid, p_day date, p_slot public.care_slot)
returns tstzrange
language sql
stable
set search_path = public
as $$
  select public.hours_range(p_day, a.starts_at, a.ends_at)
  from public.sitter_availability a
  where a.sitter_id = p_sitter
    and a.kind = 'open'
    and a.slot = p_slot
    and p_day between a.start_date and a.end_date
  order by a.created_at desc
  limit 1
$$;

-- Opened hours, or the sitter's default_hours for days not opened (used to count
-- uncovered slots in search / request so a gap in the schedule is not silently skipped).
create or replace function public.slot_range(p_sitter uuid, p_day date, p_slot public.care_slot)
returns tstzrange
language sql
stable
set search_path = public
as $$
  select coalesce(
    public.sitter_hours(p_sitter, p_day, p_slot),
    public.hours_range(
      p_day,
      coalesce(sp.default_hours -> p_slot::text ->> 0,
        case p_slot when 'morning' then '08:00' when 'afternoon' then '12:00' else '18:00' end)::time,
      coalesce(sp.default_hours -> p_slot::text ->> 1,
        case p_slot when 'morning' then '12:00' when 'afternoon' then '18:00' else '08:00' end)::time
    )
  )
  from (select 1) one
  left join public.sitter_profiles sp on sp.id = p_sitter
$$;

create or replace function public.slots_for_window(p_sitter uuid, p_from timestamptz, p_to timestamptz)
returns table (day date, slot public.care_slot)
language sql
stable
set search_path = public
as $$
  select d::date, s.slot
  from generate_series(
    ((p_from at time zone public.app_timezone())::date - 1)::timestamp,
    ((p_to at time zone public.app_timezone())::date)::timestamp,
    interval '1 day'
  ) d
  cross join unnest(enum_range(null::public.care_slot)) as s (slot)
  where public.slot_range(p_sitter, d::date, s.slot) && tstzrange(p_from, p_to, '[)')
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
    else coalesce((
      select max(a.max_pets) from public.sitter_availability a
      where a.sitter_id = p_sitter and a.kind = 'open' and a.slot = p_slot
        and p_day between a.start_date and a.end_date
    ), 0)
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
    and s.active
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

-- Slots in the window that cannot take p_pet_count more pets, as "YYYY-MM-DD slot, ...".
-- Null when every slot fits.
create or replace function public.capacity_shortfall(
  p_sitter uuid, p_exclude_booking uuid, p_pet_count int, p_from timestamptz, p_to timestamptz
)
returns text
language sql
stable
set search_path = public
as $$
  select string_agg(format('%s %s', f.day, f.slot), ', ' order by f.day, f.slot)
  from public.slots_for_window(p_sitter, p_from, p_to) f
  where public.sitter_capacity(p_sitter, f.day, f.slot)
      - public.sitter_used(p_sitter, f.day, f.slot, p_exclude_booking) < p_pet_count
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
  select coalesce(array_agg(distinct pet_id), '{}')
  from public.booking_slots where booking_id = p_booking
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
as $$
  select case when p_from = p_to then to_char(p_from, 'Mon FMDD')
    else to_char(p_from, 'Mon FMDD') || '–' || to_char(p_to, 'Mon FMDD') end
$$;

create or replace function public.fmt_local_time(p_at timestamptz)
returns text
language sql
stable
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

-- Replace a booking's slots with the (pet × slot) set for a new window.
create or replace function public.rebuild_booking_slots(p_booking uuid, p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_pets uuid[] := public.booking_pet_ids(p_booking);
  v_sitter uuid;
begin
  select sitter_id into v_sitter from public.bookings where id = p_booking;
  delete from public.booking_slots where booking_id = p_booking;
  insert into public.booking_slots (booking_id, pet_id, day, slot)
  select p_booking, pid, f.day, f.slot
  from unnest(v_pets) pid
  cross join public.slots_for_window(v_sitter, p_from, p_to) f;
  if not found then
    raise exception 'invalid_window';
  end if;
  update public.bookings b
  set start_date = x.min_day, end_date = x.max_day, updated_at = now()
  from (select min(day) min_day, max(day) max_day from public.booking_slots where booking_id = p_booking) x
  where b.id = p_booking;
exception
  when unique_violation then
    raise exception 'pet_already_booked';
end;
$$;

revoke execute on function public.notify_user(uuid, text, text, text, uuid, uuid, uuid),
  public.rebuild_booking_slots(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

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
      when o.starts_at is null then 'closed'
      when rem.n = 0 then 'full'
      else 'open'
    end,
    case when cap.blocked or o.starts_at is null then 0 else rem.n end
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  cross join unnest(enum_range(null::public.care_slot)) as s (slot)
  left join lateral (
    select a.starts_at, a.ends_at from public.sitter_availability a
    where a.sitter_id = p_sitter and a.kind = 'open' and a.slot = s.slot
      and d::date between a.start_date and a.end_date
    order by a.created_at desc limit 1
  ) o on true
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

-- "Your sitters": sitters the caller has had a confirmed booking with.
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
  v_owner_name text;
begin
  select coalesce(array_agg(distinct x), '{}') into v_pets from unnest(p_pets) x;
  if v_uid is null or cardinality(v_pets) = 0
    or (select count(*) from public.pets where id = any (v_pets) and owner_id = v_uid) <> cardinality(v_pets)
  then
    raise exception 'not_owner';
  end if;
  if not exists (select 1 from public.profiles where id = p_sitter and role = 'sitter') then
    raise exception 'not_a_sitter';
  end if;
  if p_pick_up_at <= p_drop_off_at or p_pick_up_at - p_drop_off_at > interval '31 days' then
    raise exception 'invalid_window';
  end if;
  if p_rebooked_from is not null
    and not exists (select 1 from public.bookings where id = p_rebooked_from and owner_id = v_uid)
  then
    raise exception 'not_owner';
  end if;

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
    insert into public.booking_slots (booking_id, pet_id, day, slot)
    select v_booking, pid, f.day, f.slot
    from unnest(v_pets) pid
    cross join public.slots_for_window(p_sitter, p_drop_off_at, p_pick_up_at) f;
  exception
    when unique_violation then
      raise exception 'pet_already_booked';
  end;

  update public.bookings b
  set start_date = x.min_day, end_date = x.max_day
  from (select min(day) min_day, max(day) max_day from public.booking_slots where booking_id = v_booking) x
  where b.id = v_booking;

  insert into public.booking_handoffs
    (booking_id, kind, scheduled_at, location_type, location_note, within_sitter_hours, status, proposed_by)
  values
    (v_booking, 'drop_off', p_drop_off_at, coalesce(p_drop_off_location_type, 'sitter_home'),
     p_drop_off_note, public.within_sitter_hours(p_sitter, p_drop_off_at), 'proposed', v_uid),
    (v_booking, 'pick_up', p_pick_up_at, coalesce(p_pick_up_location_type, 'sitter_home'),
     p_pick_up_note, public.within_sitter_hours(p_sitter, p_pick_up_at), 'proposed', v_uid);

  select display_name into v_owner_name from public.profiles where id = v_uid;
  perform public.notify_user(
    p_sitter, 'booking_requested',
    format('%s requested a booking', v_owner_name),
    format('%s · %s', public.booking_pet_names(v_booking),
      public.fmt_date_range((select start_date from public.bookings where id = v_booking),
                            (select end_date from public.bookings where id = v_booking))),
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
    set status = 'declined', sitter_note = p_note, responded_at = now(), updated_at = now()
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

  select * into v_drop from public.booking_handoffs
  where booking_id = p_booking and kind = 'drop_off' and status in ('proposed', 'agreed')
  order by (status = 'proposed') desc limit 1;
  select * into v_pick from public.booking_handoffs
  where booking_id = p_booking and kind = 'pick_up' and status in ('proposed', 'agreed')
  order by (status = 'proposed') desc limit 1;
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
  perform public.rebuild_booking_slots(p_booking, v_drop.scheduled_at, v_pick.scheduled_at);

  update public.booking_handoffs set status = 'superseded', responded_at = now()
  where booking_id = p_booking and status = 'agreed' and id not in (v_drop.id, v_pick.id);
  update public.booking_handoffs set status = 'agreed', responded_at = now()
  where id in (v_drop.id, v_pick.id) and status = 'proposed';

  update public.bookings
  set status = 'confirmed', sitter_note = p_note, responded_at = now(), updated_at = now()
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

  update public.bookings
  set status = 'cancelled', cancelled_by = v_uid, cancel_reason = p_reason, updated_at = now()
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

create or replace function public.sync_booking_slots_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('declined', 'cancelled') and old.status is distinct from new.status then
    update public.booking_slots set active = false where booking_id = new.id and active;
  end if;
  return new;
end;
$$;

create trigger bookings_sync_slots_active
  after update of status on public.bookings
  for each row execute function public.sync_booking_slots_active();

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
    where b.sitter_id = p_sitter and b.status = 'confirmed' and s.active
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

create or replace function public.propose_handoff(
  p_booking uuid, p_kind text, p_at timestamptz, p_location_type text default 'sitter_home',
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
  v_other_at timestamptz;
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
  if p_kind not in ('drop_off', 'pick_up') then
    raise exception 'invalid_kind';
  end if;
  if exists (
    select 1 from public.booking_handoffs
    where booking_id = p_booking and kind = p_kind and completed_at is not null
  ) then
    raise exception 'handoff_completed';
  end if;

  select scheduled_at into v_other_at from public.booking_handoffs
  where booking_id = p_booking and kind <> p_kind and status in ('agreed', 'proposed')
  order by (status = 'agreed') desc, created_at desc limit 1;
  v_from := case when p_kind = 'drop_off' then p_at else v_other_at end;
  v_to := case when p_kind = 'pick_up' then p_at else v_other_at end;
  if v_to <= v_from then
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
    (p_booking, p_kind, p_at, coalesce(p_location_type, 'sitter_home'), p_note,
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
  v_other_at timestamptz;
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
        update public.bookings set status = 'declined', responded_at = now(), updated_at = now()
        where id = b.id;
        perform public.notify_user(
          b.owner_id, 'booking_declined',
          format('%s declined your booking request', v_name),
          null, null, b.id, b.id
        );
      else
        update public.bookings
        set status = 'cancelled', cancelled_by = v_uid, cancel_reason = 'handoff_declined',
          updated_at = now()
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
    select scheduled_at into v_other_at from public.booking_handoffs
    where booking_id = b.id and kind <> h.kind and status = 'agreed';
    v_from := case when h.kind = 'drop_off' then h.scheduled_at else v_other_at end;
    v_to := case when h.kind = 'pick_up' then h.scheduled_at else v_other_at end;
    if v_to <= v_from then
      raise exception 'invalid_window';
    end if;
    perform pg_advisory_xact_lock(hashtext(b.sitter_id::text));
    v_bad := public.capacity_shortfall(
      b.sitter_id, b.id, cardinality(public.booking_pet_ids(b.id)), v_from, v_to
    );
    if v_bad is not null then
      raise exception 'sitter_unavailable' using detail = v_bad;
    end if;
    perform public.rebuild_booking_slots(b.id, v_from, v_to);
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

create or replace function public.complete_handoff(p_booking uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_id uuid;
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

  select id into v_id from public.booking_handoffs
  where booking_id = p_booking and kind = p_kind and status = 'agreed';
  if v_id is null then
    raise exception 'handoff_missing';
  end if;
  update public.booking_handoffs set completed_at = now()
  where id = v_id and completed_at is null;
  if not found then
    raise exception 'handoff_completed';
  end if;

  v_pets := public.booking_pet_names(p_booking);
  v_many := cardinality(public.booking_pet_ids(p_booking)) > 1;
  select display_name into v_sitter_name from public.profiles where id = b.sitter_id;
  if p_kind = 'drop_off' then
    perform public.notify_user(
      b.owner_id, 'pet_dropped_off',
      format('%s arrived at %s''s 🏠', v_pets, v_sitter_name),
      null, null, p_booking, v_id
    );
  else
    perform public.notify_user(
      b.owner_id, 'pet_picked_up',
      format('%s %s on the way home 👋', v_pets, case when v_many then 'are' else 'is' end),
      null, null, p_booking, v_id
    );
  end if;
end;
$$;

-- Agreed handoffs with the real address, for the two parties of a confirmed booking.
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
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.notifications;
