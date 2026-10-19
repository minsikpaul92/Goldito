-- 014k: quote_booking says "rates_not_set" when the sitter has a rates row but no price for this service (#189, R60-6).
--
-- Before, a missing price answered "service_not_offered", so the app said the sitter doesn't offer a service they do.
-- Now: no rates row -> service_not_offered (unchanged); a boarding / house sitting service that is not in
-- sitter_profiles.services -> service_not_offered; the service is offered (or daycare) but its price is null ->
-- rates_not_set with detail = the service. pay_booking_demo calls quote_booking, so it raises the same codes.
-- Everything else is as in 006. Grants stay with the function.

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
    -- No price row at all: unchanged (the app tells this case apart by reading sitter_rates).
    raise exception 'service_not_offered';
  end if;

  select services into v_services from public.sitter_profiles where id = p_sitter;

  -- Boarding and house sitting must be offered in the profile. Daycare is not a profile service.
  if p_service in ('boarding', 'house_sitting') and (v_services is null or not (p_service = any (v_services))) then
    raise exception 'service_not_offered';
  end if;

  v_unit := case p_service
    when 'boarding' then v_rates.boarding_nightly
    when 'house_sitting' then v_rates.house_sitting_nightly
    else v_rates.daycare_daily
  end;
  -- A rates row without a price for this service: the sitter offers it but has not priced it yet (R60-6).
  if v_unit is null then
    raise exception 'rates_not_set' using detail = p_service;
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
