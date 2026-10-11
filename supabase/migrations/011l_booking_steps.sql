-- 011l (BS-1 · BS-2): booking steps (D60, full-process §2-2).
--
-- A first-time pair goes request → the sitter's first yes ("Yes, let's meet": the dates are HELD from then on) →
-- Meet & Greet (done, or both agree to skip) → the sitter confirms → the owner signs and pays. A repeat pair goes
-- request → Accept → pay, as before. The stage is computed here (`booking_stage`) and shown to both sides.
--
--   bookings.sitter_interest_at   the sitter's first yes (null = none yet); the hold starts here
--   bookings.meet_greet_due_at    first yes + 2 days: no Meet & Greet time by then → both are asked (stalled)
--   bookings.meet_greet_nudged_at when they were asked; 3 days later with no answer → auto-cancel
--   sitter_profiles.accepts_multiple_owners   default false = one owner at a time (D60)
--
-- A hold = a `requested` booking with sitter_interest_at set. It counts like a confirmed booking for capacity
-- (sitter_used), blocks the sitter from blocking those days (availability_conflicts), and — when the sitter takes
-- one owner at a time — keeps every other owner off the slot (booking_slots trigger below, `sitter_unavailable`).
-- Cancel / decline / the timeout end the hold with no extra code: it only counts while status = 'requested'.
--
-- Apply together with the app (CLAUDE.md): until the app ships, a first-time pair's Meet & Greet proposal fails with
-- `interest_required`. In-flight requests that already started the Meet & Greet are backfilled below.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column sitter_interest_at timestamptz,
  add column meet_greet_due_at timestamptz,
  add column meet_greet_nudged_at timestamptz;

alter table public.sitter_profiles
  add column accepts_multiple_owners boolean not null default false;

-- Requests that already moved on in the Meet & Greet keep working: the first yes is counted as given.
update public.bookings
set sitter_interest_at = created_at
where status = 'requested'
  and meet_greet_status in ('proposed', 'agreed', 'done', 'skip_requested', 'skipped');

-- Their clock starts now if the Meet & Greet is still unsettled.
update public.bookings
set meet_greet_due_at = now() + interval '2 days'
where status = 'requested'
  and meet_greet_status in ('proposed', 'skip_requested');

-- Column grants (sitter_profiles is column-granted; owners read the setting, the sitter flips it).
grant select (accepts_multiple_owners) on public.sitter_profiles to authenticated;
grant update (accepts_multiple_owners) on public.sitter_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Holds count like confirmed bookings
-- ---------------------------------------------------------------------------

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
    and (b.status = 'confirmed' or (b.status = 'requested' and b.sitter_interest_at is not null))
    and s.day = p_day
    and s.slot = p_slot
    and b.id is distinct from p_exclude_booking
$$;

-- Held or confirmed bookings whose pets no longer fit: the sitter cannot block over a hold.
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
    where b.sitter_id = p_sitter
      and (b.status = 'confirmed' or (b.status = 'requested' and b.sitter_interest_at is not null))
      and s.slot = p_slot and s.day between p_from and p_to
    group by s.day
  )
  select array_agg(distinct x)
  from used, unnest(used.ids) x
  where used.n > public.sitter_capacity(p_sitter, used.day, p_slot)
$$;

-- One owner at a time: is this slot held or booked by a DIFFERENT owner, for a sitter who takes one owner at a time?
create or replace function public.slot_held_by_other_owner(
  p_sitter uuid, p_day date, p_slot public.care_slot, p_owner uuid, p_exclude_booking uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not coalesce((select sp.accepts_multiple_owners from public.sitter_profiles sp where sp.id = p_sitter), false)
    and exists (
      select 1
      from public.booking_slots s
      join public.bookings b on b.id = s.booking_id
      where b.sitter_id = p_sitter
        and b.owner_id <> p_owner
        and (b.status = 'confirmed' or (b.status = 'requested' and b.sitter_interest_at is not null))
        and s.day = p_day and s.slot = p_slot
        and b.id is distinct from p_exclude_booking
    )
$$;

-- Slots in the stay another owner holds (same "YYYY-MM-DD slot, …" format as capacity_shortfall); null when none.
create or replace function public.other_owner_shortfall(
  p_sitter uuid, p_owner uuid, p_exclude_booking uuid, p_from timestamptz, p_to timestamptz
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select string_agg(format('%s %s', f.day, f.slot), ', ' order by f.day, f.slot)
  from public.slots_for_window(p_sitter, p_from, p_to) f
  where public.slot_held_by_other_owner(p_sitter, f.day, f.slot, p_owner, p_exclude_booking)
$$;

-- Every way a booking's slots get written (request, confirm, a time change) goes through here.
create or replace function public.guard_slot_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sitter uuid;
  v_owner uuid;
begin
  select sitter_id, owner_id into v_sitter, v_owner from public.bookings where id = new.booking_id;
  if public.slot_held_by_other_owner(v_sitter, new.day, new.slot, v_owner, new.booking_id) then
    raise exception 'sitter_unavailable' using detail = format('%s %s', new.day, new.slot);
  end if;
  return new;
end;
$$;

create trigger booking_slots_guard_owner
  before insert on public.booking_slots
  for each row execute function public.guard_slot_owner();

-- The inquiry AI's "can I host?" (011c) and search must see the same rule as request_booking.
create or replace function public.stay_capacity_check(
  p_sitter uuid,
  p_drop_off_at timestamptz,
  p_pick_up_at timestamptz,
  p_pet_count int
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bad text;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.profiles where id = p_sitter and role = 'sitter') then
    raise exception 'not_a_sitter';
  end if;
  if p_pet_count is null or p_pet_count < 1 then
    raise exception 'invalid_pet_count';
  end if;
  if p_drop_off_at is null or p_pick_up_at is null or p_pick_up_at <= p_drop_off_at
    or p_pick_up_at - p_drop_off_at > interval '31 days' or p_drop_off_at < now()
  then
    return 'invalid_window';
  end if;
  v_bad := public.capacity_shortfall(p_sitter, null, p_pet_count, p_drop_off_at, p_pick_up_at);
  if v_bad is not null then
    return v_bad;
  end if;
  return public.other_owner_shortfall(p_sitter, auth.uid(), null, p_drop_off_at, p_pick_up_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- Search: show the sitter's setting, and don't offer slots another owner holds
-- ---------------------------------------------------------------------------

drop function public.search_sitters(timestamptz, timestamptz, int);
drop function public.list_my_sitters();

create function public.list_my_sitters()
returns table (
  sitter_id uuid, display_name text, bio text, service_area text, experience_years int,
  services text[], booking_count bigint, last_booking_at timestamptz, accepts_multiple_owners boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, sp.bio, sp.service_area, sp.experience_years, sp.services,
    count(*), max(b.created_at), coalesce(sp.accepts_multiple_owners, false)
  from public.bookings b
  join public.profiles p on p.id = b.sitter_id
  left join public.sitter_profiles sp on sp.id = p.id
  where b.owner_id = auth.uid()
    and (b.status = 'confirmed' or (b.status = 'cancelled' and b.responded_at is not null))
  group by p.id, p.display_name, sp.bio, sp.service_area, sp.experience_years, sp.services,
    sp.accepts_multiple_owners
  order by max(b.created_at) desc
$$;

create function public.search_sitters(
  p_drop_off_at timestamptz, p_pick_up_at timestamptz, p_pet_count int
)
returns table (
  sitter_id uuid, display_name text, bio text, service_area text, experience_years int,
  services text[], is_my_sitter boolean, covered_slots int, total_slots int,
  drop_off_within_hours boolean, pick_up_within_hours boolean, accepts_multiple_owners boolean
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
      coalesce(sp.accepts_multiple_owners, false) as multi,
      w.covered, w.total
    from public.profiles p
    left join public.sitter_profiles sp on sp.id = p.id
    cross join lateral (
      select
        count(*) filter (
          where public.sitter_remaining(p.id, f.day, f.slot) >= p_pet_count
            and not public.slot_held_by_other_owner(p.id, f.day, f.slot, auth.uid())
        )::int as covered,
        count(*)::int as total
      from public.slots_for_window(p.id, p_drop_off_at, p_pick_up_at) f
    ) w
    where p.role = 'sitter' and p.id <> auth.uid()
  )
  select s.id, s.display_name, s.bio, s.service_area, s.experience_years, s.services, s.mine,
    s.covered, s.total,
    public.within_sitter_hours(s.id, p_drop_off_at),
    public.within_sitter_hours(s.id, p_pick_up_at),
    s.multi
  from s
  where s.covered > 0
  order by (s.covered = s.total and s.mine) desc, (s.covered = s.total) desc,
    s.covered desc, s.display_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- The sitter's first yes
-- ---------------------------------------------------------------------------

create or replace function public.express_interest(p_booking uuid)
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
  if b.sitter_interest_at is not null then
    return; -- idempotent
  end if;
  if b.meet_greet_status <> 'required' then
    raise exception 'interest_not_needed'; -- a pair that has met just Accepts
  end if;

  v_drop := public.current_handoff(p_booking, 'drop_off');
  v_pick := public.current_handoff(p_booking, 'pick_up');
  if v_drop.id is null or v_pick.id is null then
    raise exception 'handoff_missing';
  end if;

  -- The hold needs the dates to be free: capacity (counting other holds) and, if needed, one owner at a time.
  perform pg_advisory_xact_lock(hashtext(b.sitter_id::text));
  v_bad := public.capacity_shortfall(
    b.sitter_id, p_booking, cardinality(public.booking_pet_ids(p_booking)),
    v_drop.scheduled_at, v_pick.scheduled_at
  );
  if v_bad is null then
    v_bad := public.other_owner_shortfall(b.sitter_id, b.owner_id, p_booking, v_drop.scheduled_at, v_pick.scheduled_at);
  end if;
  if v_bad is not null then
    raise exception 'sitter_unavailable' using detail = v_bad;
  end if;

  update public.bookings
  set sitter_interest_at = now(), meet_greet_due_at = now() + interval '2 days'
  where id = p_booking;

  select display_name into v_sitter_name from public.profiles where id = b.sitter_id;
  perform public.notify_user(
    b.owner_id, 'booking_interest',
    format('%s would like to meet first', v_sitter_name),
    format('%s · %s — your dates are on hold. Set a time to meet.', public.booking_pet_names(p_booking),
      public.fmt_date_range(b.start_date, b.end_date)),
    null, p_booking, p_booking
  );
end;
$$;

-- A Meet & Greet proposal or skip request needs the sitter's first yes (bookings already in progress were backfilled).
create or replace function public.guard_interest_first()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.meet_greet_status in ('proposed', 'skip_requested')
    and new.meet_greet_status is distinct from old.meet_greet_status
    and new.sitter_interest_at is null
  then
    raise exception 'interest_required';
  end if;
  return new;
end;
$$;

create trigger bookings_guard_interest
  before update of meet_greet_status on public.bookings
  for each row execute function public.guard_interest_first();

-- ---------------------------------------------------------------------------
-- Stage (computed, never stored)
-- ---------------------------------------------------------------------------

-- requested → meet_greet → confirm → awaiting_payment → paid → in_care → completed  (+ declined, cancelled)
create or replace function public.booking_stage(b public.bookings)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when b.status = 'declined' then 'declined'
    when b.status = 'cancelled' then 'cancelled'
    when b.status = 'requested' then
      case
        when b.meet_greet_status = 'not_needed' or b.sitter_interest_at is null then 'requested'
        when b.meet_greet_status in ('done', 'skipped') then 'confirm'
        else 'meet_greet'
      end
    when exists (
      select 1 from public.booking_handoffs h
      where h.booking_id = b.id and h.kind = 'pick_up' and h.completed_at is not null
    ) then 'completed'
    when exists (
      select 1 from public.booking_handoffs h
      where h.booking_id = b.id and h.kind = 'drop_off' and h.completed_at is not null
    ) then 'in_care'
    when b.paid_at is null then 'awaiting_payment'
    else 'paid'
  end
$$;

-- Who has to act next: 'sitter' · 'owner' · 'both' · 'none'.
create or replace function public.booking_next_actor(b public.bookings)
returns text
language sql
stable
set search_path = public
as $$
  select case public.booking_stage(b)
    when 'requested' then 'sitter'
    when 'confirm' then 'sitter'
    when 'awaiting_payment' then 'owner'
    when 'meet_greet' then
      case b.meet_greet_status
        when 'proposed' then case when b.meet_greet_proposed_by = b.owner_id then 'sitter' else 'owner' end
        when 'skip_requested' then case when b.meet_greet_skip_requested_by = b.owner_id then 'sitter' else 'owner' end
        else 'both'
      end
    else 'none'
  end
$$;

-- What the app reads: one call for a list of bookings (only the caller's own).
create or replace function public.get_booking_stages(p_ids uuid[])
returns table (booking_id uuid, stage text, next_actor text)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, public.booking_stage(b), public.booking_next_actor(b)
  from public.bookings b
  where b.id = any (p_ids) and auth.uid() in (b.owner_id, b.sitter_id)
$$;

-- ---------------------------------------------------------------------------
-- The sweep (BS-2): called every 15 minutes by the backend (POST /api/sweep/bookings)
-- ---------------------------------------------------------------------------

create or replace function public.sweep_stale_bookings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_stalled int := 0;
  v_cancelled int := 0;
  v_owner text;
  v_sitter text;
begin
  -- 3 days after the question with no way forward → cancel and release the hold.
  for b in
    select * from public.bookings
    where status = 'requested' and meet_greet_nudged_at is not null
      and meet_greet_nudged_at + interval '3 days' < now()
      and meet_greet_status in ('required', 'proposed', 'skip_requested')
    for update
  loop
    update public.bookings
    set status = 'cancelled', cancel_reason = 'meet_greet_timeout'
    where id = b.id;
    select display_name into v_owner from public.profiles where id = b.owner_id;
    select display_name into v_sitter from public.profiles where id = b.sitter_id;
    perform public.notify_user(
      b.owner_id, 'meet_greet_timeout', 'Booking cancelled — no time to meet was set',
      format('%s · %s with %s was cancelled and the dates are free again.', public.booking_pet_names(b.id),
        public.fmt_date_range(b.start_date, b.end_date), v_sitter),
      null, b.id, b.id
    );
    perform public.notify_user(
      b.sitter_id, 'meet_greet_timeout', 'Booking cancelled — no time to meet was set',
      format('%s · %s for %s was cancelled and the dates are free again.', public.booking_pet_names(b.id),
        public.fmt_date_range(b.start_date, b.end_date), v_owner),
      null, b.id, b.id
    );
    v_cancelled := v_cancelled + 1;
  end loop;

  -- 2 days after the first yes with no agreed time → ask both (set a time, skip, or decline).
  for b in
    select * from public.bookings
    where status = 'requested' and meet_greet_nudged_at is null
      and meet_greet_due_at is not null and meet_greet_due_at < now()
      and meet_greet_status in ('required', 'proposed', 'skip_requested')
    for update
  loop
    update public.bookings set meet_greet_nudged_at = now() where id = b.id;
    select display_name into v_owner from public.profiles where id = b.owner_id;
    select display_name into v_sitter from public.profiles where id = b.sitter_id;
    perform public.notify_user(
      b.owner_id, 'meet_greet_stalled', format('Still no time to meet %s', v_sitter),
      'Set a time, skip the Meet & Greet, or decline. With no answer in 3 days the booking is cancelled.',
      null, b.id, b.id
    );
    perform public.notify_user(
      b.sitter_id, 'meet_greet_stalled', format('Still no time to meet %s', v_owner),
      'Set a time, skip the Meet & Greet, or decline. With no answer in 3 days the booking is cancelled.',
      null, b.id, b.id
    );
    v_stalled := v_stalled + 1;
  end loop;

  return jsonb_build_object('stalled', v_stalled, 'cancelled', v_cancelled);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges (new functions get Supabase's default EXECUTE grants — reset them)
-- ---------------------------------------------------------------------------

revoke execute on function
  public.slot_held_by_other_owner(uuid, date, public.care_slot, uuid, uuid),
  public.other_owner_shortfall(uuid, uuid, uuid, timestamptz, timestamptz),
  public.guard_slot_owner(),
  public.guard_interest_first(),
  public.booking_stage(public.bookings),
  public.booking_next_actor(public.bookings),
  public.sweep_stale_bookings()
from public, anon, authenticated;

revoke execute on function
  public.express_interest(uuid),
  public.get_booking_stages(uuid[]),
  public.list_my_sitters(),
  public.search_sitters(timestamptz, timestamptz, int)
from public, anon;

grant execute on function
  public.express_interest(uuid),
  public.get_booking_stages(uuid[]),
  public.list_my_sitters(),
  public.search_sitters(timestamptz, timestamptz, int)
to authenticated, service_role;

grant execute on function public.sweep_stale_bookings() to service_role;

notify pgrst, 'reload schema';
