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

-- ---------------------------------------------------------------------------
-- 3C.2 — Consent templates (fixed English copy in the app) + signatures
-- ---------------------------------------------------------------------------

create table public.booking_consents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  kind text not null check (kind in (
    'emergency_vet', 'safe_return', 'handoff_rules', 'cohabitation', 'home_access'
  )),
  version text not null,
  signer_id uuid not null references public.profiles (id) on delete cascade,
  signer_name text not null check (char_length(trim(signer_name)) between 1 and 80),
  details jsonb not null default '{}'::jsonb,
  signed_at timestamptz not null default now(),
  unique (booking_id, kind)
);

create index booking_consents_booking_id_idx on public.booking_consents (booking_id);

-- Kinds the owner must sign before demo pay (D30). Same rules as the app templates.
create or replace function public.required_consents(p_booking uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_sitter uuid;
  v_service text;
  v_kinds text[] := array['emergency_vet', 'safe_return'];
  v_owner_home boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select b.owner_id, b.sitter_id, b.service_type
    into v_owner, v_sitter, v_service
  from public.bookings b
  where b.id = p_booking;

  if v_owner is null then
    raise exception 'not_allowed';
  end if;
  if auth.uid() is distinct from v_owner and auth.uid() is distinct from v_sitter then
    raise exception 'not_allowed';
  end if;

  if v_service = 'boarding' then
    v_kinds := v_kinds || array['handoff_rules', 'cohabitation'];
  end if;

  select exists (
    select 1 from public.booking_handoffs h
    where h.booking_id = p_booking
      and h.location_type = 'owner_home'
      and h.status in ('proposed', 'agreed')
  ) into v_owner_home;

  if v_service = 'house_sitting' or v_owner_home then
    v_kinds := v_kinds || array['home_access'];
  end if;

  return v_kinds;
end;
$$;

alter table public.booking_consents enable row level security;

-- Owner signs; both parties can read. Signatures are immutable (no update/delete policies).
create policy booking_consents_select on public.booking_consents
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and auth.uid() in (b.owner_id, b.sitter_id)
    )
  );

create policy booking_consents_insert on public.booking_consents
  for insert to authenticated
  with check (
    signer_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.owner_id = auth.uid()
    )
  );

grant select, insert on public.booking_consents to authenticated;
grant all on public.booking_consents to service_role;

revoke execute on function public.required_consents(uuid) from public, anon;
grant execute on function public.required_consents(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3C.3 — Demo pay (no Stripe): paid_at + price snapshot + sitter notice
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column if not exists paid_at timestamptz,
  add column if not exists price_snapshot jsonb;

-- Owner confirms checkout: all required consents signed → stamp payment.
create or replace function public.pay_booking_demo(p_booking uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  v_owner_name text;
  v_drop public.booking_handoffs%rowtype;
  v_pick public.booking_handoffs%rowtype;
  v_pets int;
  v_required text[];
  v_missing text[];
  v_quote jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'not_allowed';
  end if;
  if b.owner_id is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;
  if b.status is distinct from 'confirmed' then
    raise exception 'invalid_status';
  end if;
  if b.paid_at is not null then
    raise exception 'already_paid';
  end if;

  v_required := public.required_consents(p_booking);
  select coalesce(array_agg(k order by k), '{}')
    into v_missing
  from unnest(v_required) k
  where not exists (
    select 1 from public.booking_consents c
    where c.booking_id = p_booking and c.kind = k
  );
  if coalesce(cardinality(v_missing), 0) > 0 then
    raise exception 'consents_missing' using detail = array_to_string(v_missing, ',');
  end if;

  v_drop := public.current_handoff(p_booking, 'drop_off');
  v_pick := public.current_handoff(p_booking, 'pick_up');
  if v_drop.id is null or v_pick.id is null then
    raise exception 'handoff_missing';
  end if;

  select count(*)::int into v_pets
  from public.booking_pets bp
  where bp.booking_id = p_booking and bp.active;

  if v_pets < 1 then
    raise exception 'invalid_pet_count';
  end if;

  v_quote := public.quote_booking(
    b.sitter_id, b.service_type, v_drop.scheduled_at, v_pick.scheduled_at, v_pets
  );

  update public.bookings
  set paid_at = now(),
      price_snapshot = v_quote,
      updated_at = now()
  where id = p_booking;

  select display_name into v_owner_name from public.profiles where id = b.owner_id;

  perform public.notify_user(
    b.sitter_id, 'booking_paid',
    format('%s signed and paid — %s is all set ✅',
      coalesce(v_owner_name, 'The owner'),
      public.fmt_date_range(b.start_date, b.end_date)),
    format('%s · $%s %s (demo)',
      public.booking_pet_names(p_booking),
      v_quote->>'total',
      coalesce(v_quote->>'currency', 'CAD')),
    null, p_booking, p_booking
  );

  return v_quote;
end;
$$;

revoke execute on function public.pay_booking_demo(uuid) from public, anon;
grant execute on function public.pay_booking_demo(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3C.4 — Sitter place notes + addresses only after demo pay (D31)
-- ---------------------------------------------------------------------------

alter table public.sitter_profiles
  add column if not exists visitor_parking text,
  add column if not exists lobby_notes text,
  add column if not exists packing_list text[] not null
    default '{food,bed or cushion,medications,leash,favorite toy}';

-- Sitter edits their own place notes; not in the public sitter list (like home_address).
grant update (visitor_parking, lobby_notes, packing_list) on public.sitter_profiles to authenticated;

-- Return type grows → drop first (003 signature).
drop function if exists public.get_handoff_details(uuid);

-- Agreed handoffs with the real address + sitter place notes, only after paid_at,
-- until 24 h after the agreed pick-up.
create function public.get_handoff_details(p_booking uuid)
returns table (
  handoff_id uuid,
  kind text,
  scheduled_at timestamptz,
  location_type text,
  address text,
  visitor_parking text,
  lobby_notes text,
  packing_list text[],
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
  if b.paid_at is null then
    raise exception 'not_paid';
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
    case when h.location_type = 'sitter_home' then (
      select sp.visitor_parking from public.sitter_profiles sp where sp.id = b.sitter_id
    ) end,
    case when h.location_type = 'sitter_home' then (
      select sp.lobby_notes from public.sitter_profiles sp where sp.id = b.sitter_id
    ) end,
    case when h.location_type = 'sitter_home' then (
      select sp.packing_list from public.sitter_profiles sp where sp.id = b.sitter_id
    ) end,
    h.completed_at
  from public.booking_handoffs h
  where h.booking_id = p_booking and h.status = 'agreed'
  order by h.kind;
end;
$$;

revoke execute on function public.get_handoff_details(uuid) from public, anon;
grant execute on function public.get_handoff_details(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3C.5 — Owner entry info: unlock 2 h before arrival, lock after pick-up (D31)
-- ---------------------------------------------------------------------------

create table public.owner_home_access (
  owner_id uuid primary key references public.profiles (id) on delete cascade,
  entry_steps text,
  lockbox_code text,
  buzzer text,
  fob_notes text,
  sitter_parking text,
  updated_at timestamptz not null default now()
);

create table public.access_reveals (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  first_revealed_at timestamptz not null default now()
);

alter table public.owner_home_access enable row level security;
alter table public.access_reveals enable row level security;

-- Owner only — sitters never read this table directly (RPC only).
create policy owner_home_access_select on public.owner_home_access
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy owner_home_access_insert on public.owner_home_access
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.my_role() = 'owner');

create policy owner_home_access_update on public.owner_home_access
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Reveals are written by get_home_access (security definer); no client policies.
create policy access_reveals_select on public.access_reveals
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and auth.uid() in (b.owner_id, b.sitter_id)
    )
  );

create trigger owner_home_access_set_updated_at
  before update on public.owner_home_access
  for each row execute function public.set_updated_at();

grant select, insert, update on public.owner_home_access to authenticated;
grant select on public.access_reveals to authenticated;
grant all on public.owner_home_access to service_role;
grant all on public.access_reveals to service_role;

-- Window: [first owner_home (or drop-off for house sitting) − 2 h, pick-up completed_at or scheduled_at].
create or replace function public.get_home_access(p_booking uuid)
returns table (
  entry_steps text,
  lockbox_code text,
  buzzer text,
  fob_notes text,
  sitter_parking text,
  first_revealed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  b public.bookings;
  v_unlock_at timestamptz;
  v_lock_at timestamptz;
  v_needs_access boolean;
  v_sitter_name text;
  v_row public.owner_home_access%rowtype;
  v_reveal timestamptz;
  v_is_new boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into b from public.bookings where id = p_booking;
  if not found then
    raise exception 'forbidden';
  end if;
  if auth.uid() is distinct from b.sitter_id then
    raise exception 'forbidden';
  end if;
  if b.status <> 'confirmed' then
    raise exception 'invalid_status';
  end if;
  if b.paid_at is null then
    raise exception 'not_paid';
  end if;

  v_needs_access := b.service_type = 'house_sitting'
    or exists (
      select 1 from public.booking_handoffs h
      where h.booking_id = p_booking
        and h.location_type = 'owner_home'
        and h.status = 'agreed'
    );
  if not v_needs_access then
    raise exception 'forbidden';
  end if;

  -- Unlock from the first relevant arrival: earliest agreed owner_home handoff,
  -- or drop-off when house sitting (care starts at the owner's place).
  select min(h.scheduled_at) - interval '2 hours'
    into v_unlock_at
  from public.booking_handoffs h
  where h.booking_id = p_booking
    and h.status = 'agreed'
    and (
      h.location_type = 'owner_home'
      or (b.service_type = 'house_sitting' and h.kind = 'drop_off')
    );

  select coalesce(p.completed_at, p.scheduled_at)
    into v_lock_at
  from public.booking_handoffs p
  where p.booking_id = p_booking and p.kind = 'pick_up' and p.status = 'agreed';

  if v_unlock_at is null or v_lock_at is null then
    raise exception 'handoff_missing';
  end if;

  if now() < v_unlock_at then
    raise exception 'access_locked'
      using detail = json_build_object('unlocks_at', v_unlock_at)::text;
  end if;
  if now() >= v_lock_at then
    raise exception 'access_locked'
      using detail = json_build_object('locked_since', v_lock_at)::text;
  end if;

  select * into v_row from public.owner_home_access where owner_id = b.owner_id;
  if not found then
    -- No codes saved yet — still "open" window, empty fields.
    v_row.owner_id := b.owner_id;
  end if;

  select ar.first_revealed_at into v_reveal
  from public.access_reveals ar where ar.booking_id = p_booking;

  if v_reveal is null then
    insert into public.access_reveals (booking_id, sitter_id, first_revealed_at)
    values (p_booking, b.sitter_id, now())
    returning first_revealed_at into v_reveal;
    v_is_new := true;

    select display_name into v_sitter_name from public.profiles where id = b.sitter_id;
    perform public.notify_user(
      b.owner_id, 'access_unlocked',
      format('%s can now see your entry info (2 h before arrival)',
        coalesce(v_sitter_name, 'Your sitter')),
      'Codes stay available until pick-up is done. They are never sent in messages.',
      null, p_booking, p_booking
    );
  end if;

  return query
  select v_row.entry_steps, v_row.lockbox_code, v_row.buzzer, v_row.fob_notes,
    v_row.sitter_parking, v_reveal;
end;
$$;

revoke execute on function public.get_home_access(uuid) from public, anon;
grant execute on function public.get_home_access(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
