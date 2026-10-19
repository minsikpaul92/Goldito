-- 014d: a sitter is open by default, and closes days by weekly rules.
--
-- Until now a day × slot was bookable only where the sitter had saved an "open" row; with no rows the sitter could not
-- be found. Now:
--   * with nothing set, every day × slot is open (and the sitter shows up in search) with the sitter's own default
--     hours and spots (sitter_profiles.default_hours / default_max_pets);
--   * an "open" row still overrides the hours and spots for the days it covers;
--   * a "blocked" row (one day or a range the sitter closed by hand) still closes a day × slot;
--   * NEW closing rules (sitter_closing_rules): "every Sunday overnight is closed" — a weekday × slot the sitter
--     closes for good. The result is the rules plus the days the sitter closed by hand.
--
-- A rule never takes away a stay that is already confirmed: on a rule-closed slot the capacity is what is already
-- booked, so the stay stays valid and nobody new can book it. (A blocked row still refuses to overlap a booking —
-- the guard in 003 — the sitter cancels that booking first.)
--
-- Everything else — search, the booking RPCs, the inquiry AI's can-host check, the schedule screen — already goes
-- through sitter_capacity / slots_for_window / within_sitter_hours, so they follow.

-- ---------------------------------------------------------------------------
-- Weekly closing rules
-- ---------------------------------------------------------------------------

create table public.sitter_closing_rules (
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday, like extract(dow …)
  slot public.care_slot not null,
  created_at timestamptz not null default now(),
  primary key (sitter_id, weekday, slot)
);

alter table public.sitter_closing_rules enable row level security;

create policy sitter_closing_rules_select on public.sitter_closing_rules
  for select to authenticated
  using (sitter_id = (select auth.uid()));

revoke all on public.sitter_closing_rules from anon, authenticated;
grant select on public.sitter_closing_rules to authenticated;
grant all on public.sitter_closing_rules to service_role;

-- True when a closing rule closes this weekday × slot.
create or replace function public.sitter_rule_closed(p_sitter uuid, p_day date, p_slot public.care_slot)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.sitter_closing_rules r
    where r.sitter_id = p_sitter and r.slot = p_slot and r.weekday = extract(dow from p_day)::int
  )
$$;

-- The sitter's hours and spots for a day × slot: the open row that covers it, else the profile defaults.
create or replace function public.sitter_slot_times(p_sitter uuid, p_day date, p_slot public.care_slot)
returns table (starts_at time, ends_at time, max_pets int)
language sql
stable
set search_path = public
as $$
  select
    coalesce(o.starts_at,
      (sp.default_hours -> p_slot::text ->> 0)::time,
      case p_slot when 'morning' then '08:00' when 'afternoon' then '12:00' else '18:00' end::time),
    coalesce(o.ends_at,
      (sp.default_hours -> p_slot::text ->> 1)::time,
      case p_slot when 'morning' then '12:00' when 'afternoon' then '18:00' else '08:00' end::time),
    coalesce(o.max_pets, sp.default_max_pets, 0)
  from (select 1) one
  left join lateral (select * from public.sitter_open_row(p_sitter, p_day, p_slot)) o on o.id is not null
  left join public.sitter_profiles sp on sp.id = p_sitter
$$;

-- Replace the whole rule set at once. p_rules: [{"weekday": 0..6, "slot": "morning" | "afternoon" | "overnight"}, …];
-- an empty array removes every rule (everything open again). Takes the same per-sitter lock as a booking.
create or replace function public.save_closing_rules(p_rules jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public.my_role() is distinct from 'sitter' then raise exception 'forbidden'; end if;
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' or jsonb_array_length(p_rules) > 21 then
    raise exception 'invalid_rules';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  delete from public.sitter_closing_rules where sitter_id = v_uid;
  insert into public.sitter_closing_rules (sitter_id, weekday, slot)
  select distinct v_uid, (r ->> 'weekday')::smallint, (r ->> 'slot')::public.care_slot
  from jsonb_array_elements(p_rules) r;
end;
$$;

revoke execute on function public.save_closing_rules(jsonb) from public, anon;
grant execute on function public.save_closing_rules(jsonb) to authenticated, service_role;

revoke execute on function
  public.sitter_rule_closed(uuid, date, public.care_slot),
  public.sitter_slot_times(uuid, date, public.care_slot)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Open by default
-- ---------------------------------------------------------------------------

-- Within the sitter's hours: the drop-off / pick-up time falls in a slot that has room, counting the default hours
-- of a slot nobody opened by hand. (sitter_hours and slots_for_window stay as in 003: a slot without an open row
-- only belongs to a stay when it covers more than half of it, so a custom time at the edge is still allowed.)
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
    cross join lateral (select public.hours_range(d::date, t.starts_at, t.ends_at) as h
                        from public.sitter_slot_times(p_sitter, d::date, s.slot) t) x
    where public.sitter_capacity(p_sitter, d::date, s.slot) > 0
      and p_at <@ tstzrange(lower(x.h), upper(x.h), '[]')
  )
$$;

-- Spots of a day × slot: 0 when the sitter blocked it; what is already booked when a rule closes it; otherwise the
-- open row's max_pets, else the sitter's default.
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
    when public.sitter_rule_closed(p_sitter, p_day, p_slot) then public.sitter_used(p_sitter, p_day, p_slot)
    else (select t.max_pets from public.sitter_slot_times(p_sitter, p_day, p_slot) t)
  end
$$;

-- The sitter's schedule: 'blocked' = closed by hand, 'closed' = closed by a weekly rule, 'full' = no spot left,
-- 'open' otherwise (also when nothing was ever set).
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
    t.starts_at,
    t.ends_at,
    case
      when cap.blocked then 'blocked'
      when cap.rule and used.n = 0 then 'closed'
      when rem.n = 0 then 'full'
      else 'open'
    end,
    case when cap.blocked or (cap.rule and used.n = 0) then 0 else rem.n end
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  cross join unnest(enum_range(null::public.care_slot)) as s (slot)
  cross join lateral (select * from public.sitter_slot_times(p_sitter, d::date, s.slot)) t
  cross join lateral (
    select
      exists (
        select 1 from public.sitter_availability a
        where a.sitter_id = p_sitter and a.kind = 'blocked' and a.slot = s.slot
          and d::date between a.start_date and a.end_date
      ) as blocked,
      public.sitter_rule_closed(p_sitter, d::date, s.slot) as rule
  ) cap
  cross join lateral (select public.sitter_used(p_sitter, d::date, s.slot) as n) used
  cross join lateral (select public.sitter_remaining(p_sitter, d::date, s.slot) as n) rem
  order by 1, 2;
end;
$$;
