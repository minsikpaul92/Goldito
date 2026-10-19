-- 014e: hours that differ by weekday.
--
-- 014d gave a sitter one set of default hours (Morning / Afternoon / Overnight, profile default_hours). A sitter often
-- keeps different hours on different days ("Fridays I start the morning at 10"). sitter_weekday_hours holds those:
-- a weekday × slot with its own start and end. Which hours apply to a day × slot, first match wins:
--   1. an "open" row the sitter saved by hand for that date (sitter_availability);
--   2. the weekday's hours (this table);
--   3. the sitter's default hours (profile), else the built-in 8–12 · 12–18 · 18–8.
-- Only the hours move: whether a slot is open is still the closing rules, blocked days and capacity of 014d.

create table public.sitter_weekday_hours (
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday, like extract(dow …)
  slot public.care_slot not null,
  starts_at time not null,
  ends_at time not null,
  created_at timestamptz not null default now(),
  primary key (sitter_id, weekday, slot),
  -- Overnight may wrap past midnight; the other slots end the same day (same rule as sitter_availability).
  check (starts_at <> ends_at and (slot = 'overnight' or ends_at > starts_at))
);

alter table public.sitter_weekday_hours enable row level security;

create policy sitter_weekday_hours_select on public.sitter_weekday_hours
  for select to authenticated
  using (sitter_id = (select auth.uid()));

revoke all on public.sitter_weekday_hours from anon, authenticated;
grant select on public.sitter_weekday_hours to authenticated;
grant all on public.sitter_weekday_hours to service_role;

-- Replace the whole set at once. p_hours: [{"weekday": 0..6, "slot": "morning" | …, "starts_at": "HH:MM", "ends_at": "HH:MM"}, …];
-- an empty array removes every weekday override (the default hours apply to every day again).
create or replace function public.save_weekday_hours(p_hours jsonb)
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
  if p_hours is null or jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 21 then
    raise exception 'invalid_hours';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  delete from public.sitter_weekday_hours where sitter_id = v_uid;
  begin
    insert into public.sitter_weekday_hours (sitter_id, weekday, slot, starts_at, ends_at)
    select v_uid, (h ->> 'weekday')::smallint, (h ->> 'slot')::public.care_slot,
           (h ->> 'starts_at')::time, (h ->> 'ends_at')::time
    from jsonb_array_elements(p_hours) h;
  exception when check_violation or invalid_text_representation or datetime_field_overflow or not_null_violation
    or unique_violation then
    raise exception 'invalid_hours';
  end;
end;
$$;

revoke execute on function public.save_weekday_hours(jsonb) from public, anon;
grant execute on function public.save_weekday_hours(jsonb) to authenticated, service_role;

-- Hours and spots of a day × slot: open row → weekday hours → profile defaults → built-in (replaces 014d's).
create or replace function public.sitter_slot_times(p_sitter uuid, p_day date, p_slot public.care_slot)
returns table (starts_at time, ends_at time, max_pets int)
language sql
stable
set search_path = public
as $$
  select
    coalesce(o.starts_at, wh.starts_at,
      (sp.default_hours -> p_slot::text ->> 0)::time,
      case p_slot when 'morning' then '08:00' when 'afternoon' then '12:00' else '18:00' end::time),
    coalesce(o.ends_at, wh.ends_at,
      (sp.default_hours -> p_slot::text ->> 1)::time,
      case p_slot when 'morning' then '12:00' when 'afternoon' then '18:00' else '08:00' end::time),
    coalesce(o.max_pets, sp.default_max_pets, 0)
  from (select 1) one
  left join lateral (select * from public.sitter_open_row(p_sitter, p_day, p_slot)) o on o.id is not null
  left join public.sitter_weekday_hours wh
    on wh.sitter_id = p_sitter and wh.slot = p_slot and wh.weekday = extract(dow from p_day)::int
  left join public.sitter_profiles sp on sp.id = p_sitter
$$;

-- A slot nobody opened by hand still belongs to a stay when the stay covers more than half of it (003's
-- slots_for_window); its range now follows the weekday hours too.
create or replace function public.default_slot_range(p_sitter uuid, p_day date, p_slot public.care_slot)
returns tstzrange
language sql
stable
set search_path = public
as $$
  select public.hours_range(p_day, t.starts_at, t.ends_at)
  from public.sitter_slot_times(p_sitter, p_day, p_slot) t
$$;
