-- PawNote 006: agreements (Phase 03C) — task 3C.1 first
-- Source of truth: docs/plan/phases/phase-03c.md 3C.1 · architecture D29
--
-- * sitter_rates — nightly / daily prices + extra-pet and holiday %
-- * holidays — Ontario statutory days 2026–2027 (Thanksgiving 2026-10-12)
-- * quote_booking — server-side breakdown JSON (AI never invents prices)
-- Later tasks in this file: consents, demo pay, timed home-access unlock (3C.2–3C.5)

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.sitter_rates (
  sitter_id uuid primary key references public.profiles (id) on delete cascade,
  boarding_nightly numeric(8, 2) check (boarding_nightly is null or boarding_nightly >= 0),
  house_sitting_nightly numeric(8, 2)
    check (house_sitting_nightly is null or house_sitting_nightly >= 0),
  daycare_daily numeric(8, 2) check (daycare_daily is null or daycare_daily >= 0),
  extra_pet_pct int not null default 50 check (extra_pet_pct between 0 and 200),
  holiday_pct int not null default 25 check (holiday_pct between 0 and 200),
  currency text not null default 'CAD' check (currency = 'CAD'),
  updated_at timestamptz not null default now(),
  -- At least one price so the row is useful; null = that service is not priced.
  check (
    boarding_nightly is not null
    or house_sitting_nightly is not null
    or daycare_daily is not null
  )
);

create table public.holidays (
  day date primary key,
  name text not null,
  region text not null default 'ON'
);

-- Ontario ESA public holidays 2026–2027 (9 days each year).
insert into public.holidays (day, name, region) values
  ('2026-01-01', 'New Year''s Day', 'ON'),
  ('2026-02-16', 'Family Day', 'ON'),
  ('2026-04-03', 'Good Friday', 'ON'),
  ('2026-05-18', 'Victoria Day', 'ON'),
  ('2026-07-01', 'Canada Day', 'ON'),
  ('2026-09-07', 'Labour Day', 'ON'),
  ('2026-10-12', 'Thanksgiving Day', 'ON'),
  ('2026-12-25', 'Christmas Day', 'ON'),
  ('2026-12-26', 'Boxing Day', 'ON'),
  ('2027-01-01', 'New Year''s Day', 'ON'),
  ('2027-02-15', 'Family Day', 'ON'),
  ('2027-03-26', 'Good Friday', 'ON'),
  ('2027-05-24', 'Victoria Day', 'ON'),
  ('2027-07-01', 'Canada Day', 'ON'),
  ('2027-09-06', 'Labour Day', 'ON'),
  ('2027-10-11', 'Thanksgiving Day', 'ON'),
  ('2027-12-25', 'Christmas Day', 'ON'),
  ('2027-12-26', 'Boxing Day', 'ON');

-- ---------------------------------------------------------------------------
-- Rates must match the sitter's offered services (boarding / house sitting)
-- ---------------------------------------------------------------------------

create or replace function public.sitter_rates_match_services()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_services text[];
begin
  select services into v_services from public.sitter_profiles where id = new.sitter_id;
  if v_services is null then
    raise exception 'not_a_sitter';
  end if;
  if new.boarding_nightly is not null and not ('boarding' = any (v_services)) then
    raise exception 'service_not_offered' using detail = 'boarding';
  end if;
  if new.house_sitting_nightly is not null and not ('house_sitting' = any (v_services)) then
    raise exception 'service_not_offered' using detail = 'house_sitting';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger sitter_rates_match_services
  before insert or update on public.sitter_rates
  for each row execute function public.sitter_rates_match_services();

-- ---------------------------------------------------------------------------
-- quote_booking — read-only breakdown (Checkout + 07B inquiry card)
-- ---------------------------------------------------------------------------

create or replace function public.quote_booking(
  p_sitter uuid,
  p_service text,
  p_drop_off_at timestamptz,
  p_pick_up_at timestamptz,
  p_pet_count int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rates public.sitter_rates%rowtype;
  v_services text[];
  v_unit numeric(8, 2);
  v_drop_day date;
  v_pick_day date;
  v_nights int;
  v_days int;
  v_units int;
  v_extra_factor numeric;
  v_per_unit_all numeric;
  v_base numeric(12, 2);
  v_extra numeric(12, 2);
  v_holiday numeric(12, 2);
  v_holiday_days jsonb;
  v_holiday_count int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_service is null or p_service not in ('boarding', 'house_sitting', 'daycare') then
    raise exception 'invalid_service';
  end if;
  if p_pet_count is null or p_pet_count < 1 then
    raise exception 'invalid_pet_count';
  end if;
  if p_drop_off_at is null or p_pick_up_at is null or p_pick_up_at <= p_drop_off_at then
    raise exception 'invalid_window';
  end if;

  select * into v_rates from public.sitter_rates where sitter_id = p_sitter;
  if not found then
    raise exception 'service_not_offered';
  end if;

  select services into v_services from public.sitter_profiles where id = p_sitter;

  if p_service = 'boarding' then
    v_unit := v_rates.boarding_nightly;
    if v_unit is null or v_services is null or not ('boarding' = any (v_services)) then
      raise exception 'service_not_offered';
    end if;
  elsif p_service = 'house_sitting' then
    v_unit := v_rates.house_sitting_nightly;
    if v_unit is null or v_services is null or not ('house_sitting' = any (v_services)) then
      raise exception 'service_not_offered';
    end if;
  else
    v_unit := v_rates.daycare_daily;
    if v_unit is null then
      raise exception 'service_not_offered';
    end if;
  end if;

  v_drop_day := (p_drop_off_at at time zone public.app_timezone())::date;
  v_pick_day := (p_pick_up_at at time zone public.app_timezone())::date;
  v_nights := v_pick_day - v_drop_day;
  -- Same calendar day → 0 nights; bill one day (daycare, or a same-day stay).
  v_days := case when v_nights = 0 then 1 else v_nights end;
  v_units := v_days;

  v_extra_factor := (v_rates.extra_pet_pct::numeric / 100.0) * (p_pet_count - 1);
  v_per_unit_all := v_unit * (1 + v_extra_factor);

  v_base := round(v_unit * v_units, 2);
  v_extra := round(v_unit * v_extra_factor * v_units, 2);

  select coalesce(jsonb_agg(
           jsonb_build_object('day', to_char(h.day, 'YYYY-MM-DD'), 'name', h.name)
           order by h.day
         ), '[]'::jsonb),
         count(*)::int
    into v_holiday_days, v_holiday_count
  from public.holidays h
  where h.region = 'ON'
    and h.day between v_drop_day and v_pick_day;

  v_holiday := round(
    v_holiday_count * v_per_unit_all * (v_rates.holiday_pct::numeric / 100.0),
    2
  );

  return jsonb_build_object(
    'service', p_service,
    'nights', v_nights,
    'days', v_days,
    'unit_price', v_unit,
    'base', v_base,
    'extra_pets', v_extra,
    'holiday_days', v_holiday_days,
    'holiday_surcharge', v_holiday,
    'total', v_base + v_extra + v_holiday,
    'currency', v_rates.currency,
    'rate_version', to_char(v_rates.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------------------

alter table public.sitter_rates enable row level security;
alter table public.holidays enable row level security;

-- Rates are public to signed-in users (quote + profile). Only the sitter writes.
create policy sitter_rates_select on public.sitter_rates
  for select to authenticated
  using (true);

create policy sitter_rates_insert on public.sitter_rates
  for insert to authenticated
  with check (sitter_id = (select auth.uid()) and public.my_role() = 'sitter');

create policy sitter_rates_update on public.sitter_rates
  for update to authenticated
  using (sitter_id = (select auth.uid()))
  with check (sitter_id = (select auth.uid()));

create policy sitter_rates_delete on public.sitter_rates
  for delete to authenticated
  using (sitter_id = (select auth.uid()));

-- Holidays are read-only for clients (seeded in this migration).
create policy holidays_select on public.holidays
  for select to authenticated
  using (true);

grant select, insert, update, delete on public.sitter_rates to authenticated;
grant select on public.holidays to authenticated;
grant all on public.sitter_rates to service_role;
grant all on public.holidays to service_role;

revoke execute on function
  public.sitter_rates_match_services(),
  public.quote_booking(uuid, text, timestamptz, timestamptz, int)
from public, anon;

grant execute on function
  public.quote_booking(uuid, text, timestamptz, timestamptz, int)
to authenticated, service_role;

revoke execute on function public.sitter_rates_match_services() from authenticated;

notify pgrst, 'reload schema';
