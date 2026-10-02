-- PawNote 004: booking options (Phase 03B, task 3B.0)
-- Source of truth: docs/plan/phases/phase-03b.md 3B.0 · architecture D28 (service type), D44 (Meet & Greet)
--
-- * bookings.service_type (boarding / house_sitting) + sitter_profiles.services
-- * Meet & Greet state on bookings — request_booking sets required for first-time pairs,
--   respond_booking will not accept until it is not_needed / done / skipped.
--   The Meet & Greet RPCs that move the state land in 3B.9; the Meet link in 3B.11.
-- * Preferred meeting spots on both profiles (public places, never the home address)
-- * media.purpose gains report / handoff (Phase 04, 06B)

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

-- Up to 3 short labels, e.g. "Christie Pits — east entrance".
create or replace function public.valid_meet_spots(p text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(cardinality(p), 0) <= 3
    and coalesce((
      select bool_and(s is not null and char_length(trim(s)) between 1 and 60)
      from unnest(p) s
    ), true)
$$;

alter table public.sitter_profiles
  add column services text[] not null default '{boarding}'
    check (cardinality(services) > 0 and services <@ array['boarding', 'house_sitting']),
  add column meet_spots text[] not null default '{}'
    check (public.valid_meet_spots(meet_spots));

alter table public.owner_profiles
  add column meet_spots text[] not null default '{}'
    check (public.valid_meet_spots(meet_spots));

-- Existing bookings keep not_needed; new ones get required / not_needed from request_booking.
alter table public.bookings
  add column service_type text not null default 'boarding'
    check (service_type in ('boarding', 'house_sitting')),
  add column meet_greet_status text not null default 'not_needed'
    check (meet_greet_status in
      ('not_needed', 'required', 'proposed', 'agreed', 'done', 'skip_requested', 'skipped')),
  add column meet_greet_mode text check (meet_greet_mode in ('in_person', 'video')),
  add column meet_greet_at timestamptz,
  add column meet_greet_place text check (char_length(meet_greet_place) <= 120),
  add column meet_greet_link text,
  add column meet_greet_event_id text,
  add column meet_greet_proposed_by uuid references public.profiles (id) on delete set null,
  add column meet_greet_skip_requested_by uuid references public.profiles (id) on delete set null,
  add constraint bookings_meet_greet_planned check (
    meet_greet_status not in ('proposed', 'agreed')
    or (meet_greet_mode is not null and meet_greet_at is not null)
  ),
  add constraint bookings_meet_greet_place check (
    meet_greet_mode is distinct from 'in_person' or meet_greet_place is not null
  );

alter table public.media drop constraint media_purpose_check;
alter table public.media add constraint media_purpose_check
  check (purpose in ('feed', 'task_proof', 'safety_label', 'report', 'handoff'));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The owner and sitter have met: an earlier booking reached the drop-off, or a
-- Meet & Greet was done (even on a booking that was later cancelled).
create or replace function public.pair_has_met(p_owner uuid, p_sitter uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.bookings b
    where b.owner_id = p_owner and b.sitter_id = p_sitter
      and (b.meet_greet_status = 'done'
        or exists (
          select 1 from public.booking_handoffs h
          where h.booking_id = b.id and h.kind = 'drop_off' and h.completed_at is not null
        ))
  )
$$;

-- ---------------------------------------------------------------------------
-- Search RPCs: return the sitter's services (return type changes → drop first)
-- ---------------------------------------------------------------------------

drop function public.search_sitters(timestamptz, timestamptz, int);
drop function public.list_my_sitters();

create function public.list_my_sitters()
returns table (
  sitter_id uuid, display_name text, bio text, service_area text, experience_years int,
  services text[], booking_count bigint, last_booking_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, sp.bio, sp.service_area, sp.experience_years, sp.services,
    count(*), max(b.created_at)
  from public.bookings b
  join public.profiles p on p.id = b.sitter_id
  left join public.sitter_profiles sp on sp.id = p.id
  where b.owner_id = auth.uid()
    and (b.status = 'confirmed' or (b.status = 'cancelled' and b.responded_at is not null))
  group by p.id, p.display_name, sp.bio, sp.service_area, sp.experience_years, sp.services
  order by max(b.created_at) desc
$$;

create function public.search_sitters(
  p_drop_off_at timestamptz, p_pick_up_at timestamptz, p_pet_count int
)
returns table (
  sitter_id uuid, display_name text, bio text, service_area text, experience_years int,
  services text[], is_my_sitter boolean, covered_slots int, total_slots int,
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
    select p.id, p.display_name, sp.bio, sp.service_area, sp.experience_years, sp.services,
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
  select s.id, s.display_name, s.bio, s.service_area, s.experience_years, s.services, s.mine,
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
-- Booking RPCs: service type + Meet & Greet
-- ---------------------------------------------------------------------------

-- New trailing parameter → a new signature; drop the 003 one so calls stay unambiguous.
drop function public.request_booking(
  uuid, uuid[], timestamptz, text, text, timestamptz, text, text, text, uuid
);

-- House sitting happens at the owner's home, so both handoffs are owner_home (D28).
create function public.request_booking(
  p_sitter uuid,
  p_pets uuid[],
  p_drop_off_at timestamptz,
  p_drop_off_location_type text,
  p_drop_off_note text,
  p_pick_up_at timestamptz,
  p_pick_up_location_type text,
  p_pick_up_note text,
  p_note text,
  p_rebooked_from uuid default null,
  p_service_type text default 'boarding'
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
  v_service text := coalesce(p_service_type, 'boarding');
  v_drop_type text;
  v_drop_note text := p_drop_off_note;
  v_pick_type text;
  v_pick_note text := p_pick_up_note;
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
  if v_service not in ('boarding', 'house_sitting') then
    raise exception 'invalid_service';
  end if;
  if not exists (
    select 1 from public.sitter_profiles where id = p_sitter and v_service = any (services)
  ) then
    raise exception 'service_not_offered';
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
  if v_service = 'house_sitting' then
    v_drop_type := 'owner_home';
    v_drop_note := null;
    v_pick_type := 'owner_home';
    v_pick_note := null;
  else
    v_drop_type := public.check_location(p_drop_off_location_type, p_drop_off_note);
    v_pick_type := public.check_location(p_pick_up_location_type, p_pick_up_note);
  end if;

  v_bad := public.capacity_shortfall(p_sitter, null, cardinality(v_pets), p_drop_off_at, p_pick_up_at);
  if v_bad is not null then
    raise exception 'sitter_unavailable' using detail = v_bad;
  end if;

  insert into public.bookings
    (owner_id, sitter_id, start_date, end_date, owner_note, rebooked_from, service_type,
     meet_greet_status)
  values (
    v_uid, p_sitter,
    (p_drop_off_at at time zone public.app_timezone())::date,
    (p_pick_up_at at time zone public.app_timezone())::date,
    p_note, p_rebooked_from, v_service,
    case when public.pair_has_met(v_uid, p_sitter) then 'not_needed' else 'required' end
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
    (v_booking, 'drop_off', p_drop_off_at, v_drop_type, v_drop_note,
     public.within_sitter_hours(p_sitter, p_drop_off_at), 'proposed', v_uid),
    (v_booking, 'pick_up', p_pick_up_at, v_pick_type, v_pick_note,
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

-- Same as 003, plus: a first-time pair cannot be accepted before the Meet & Greet is
-- done or both agreed to skip it (D44). Declining stays possible at any point.
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

  if b.meet_greet_status not in ('not_needed', 'done', 'skipped') then
    raise exception 'meet_greet_required';
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

-- ---------------------------------------------------------------------------
-- Privileges (new functions get Supabase's default EXECUTE grants — reset them)
-- ---------------------------------------------------------------------------

revoke execute on function
  public.valid_meet_spots(text[]),
  public.pair_has_met(uuid, uuid),
  public.list_my_sitters(),
  public.search_sitters(timestamptz, timestamptz, int),
  public.request_booking(uuid, uuid[], timestamptz, text, text, timestamptz, text, text, text, uuid, text)
from public, anon;

grant execute on function
  public.valid_meet_spots(text[]),
  public.list_my_sitters(),
  public.search_sitters(timestamptz, timestamptz, int),
  public.request_booking(uuid, uuid[], timestamptz, text, text, timestamptz, text, text, text, uuid, text)
to authenticated, service_role;

revoke execute on function public.pair_has_met(uuid, uuid) from authenticated;

-- Column grants for the new profile columns (keep in sync with 002 / the 003 grants block;
-- re-run this block after re-running that one). services is public for search; sitter
-- meet_spots stay hidden from the sitter list — the sitter reads them via
-- get_my_sitter_profile, the booking parties via get_meet_greet_options (3B.9).
grant update (services, meet_spots) on public.sitter_profiles to authenticated;
grant update (meet_spots) on public.owner_profiles to authenticated;
grant select (services) on public.sitter_profiles to authenticated;

-- PostgREST picks up the new RPC signatures and columns without a restart.
notify pgrst, 'reload schema';
