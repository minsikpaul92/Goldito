-- 014i (Sitter search follow-up, #138): favorites and a remembered radius.
--
-- * search_sitters_nearby: a favorite sitter of the owner is listed even beyond the radius, with the real distance,
--   but only when the whole stay fits the favorite's calendar and hours (the same checks as everyone else). Everyone
--   else keeps the exact radius rule. Still no coordinates out: whole km, at least 1.
-- * owner_profiles.search_radius_km: the radius the owner last used; the app starts there (5 km when empty).

alter table public.owner_profiles
  add column search_radius_km int check (search_radius_km between 1 and 100);

grant update (search_radius_km) on public.owner_profiles to authenticated;

create or replace function public.search_sitters_nearby(
  p_drop_off_at timestamptz,
  p_pick_up_at timestamptz,
  p_pet_count int,
  p_radius_km int,
  p_lat double precision default null,
  p_lng double precision default null
)
returns table (
  sitter_id uuid, display_name text, bio text, service_area text, experience_years int,
  services text[], is_my_sitter boolean, accepts_multiple_owners boolean, distance_km int,
  boarding_nightly numeric, house_sitting_nightly numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_lat double precision := p_lat;
  v_lng double precision := p_lng;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if public.my_role() is distinct from 'owner' then raise exception 'forbidden'; end if;
  if p_drop_off_at is null or p_pick_up_at is null or p_pick_up_at <= p_drop_off_at
    or p_pick_up_at - p_drop_off_at > interval '31 days' or p_drop_off_at < now()
    or p_pet_count is null or p_pet_count < 1
  then
    raise exception 'invalid_window';
  end if;
  if p_radius_km is null or p_radius_km not between 1 and 100 then
    raise exception 'invalid_radius';
  end if;

  if v_lat is null and v_lng is null then
    select op.home_lat, op.home_lng into v_lat, v_lng from public.owner_profiles op where op.id = auth.uid();
    if v_lat is null then raise exception 'no_home_point'; end if;
  elsif v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    raise exception 'invalid_point';
  end if;

  return query
  with placed as materialized (
    select p.id, p.display_name, sp.bio, sp.service_area, sp.experience_years, sp.services,
      coalesce(sp.accepts_multiple_owners, false) as multi,
      -- Haversine, km (least(1, ..) keeps float noise near the antipode from breaking asin)
      6371 * 2 * asin(least(1, sqrt(
        power(sin(radians(sp.home_lat - v_lat) / 2), 2)
        + cos(radians(v_lat)) * cos(radians(sp.home_lat)) * power(sin(radians(sp.home_lng - v_lng) / 2), 2)
      ))) as km
    from public.profiles p
    join public.sitter_profiles sp on sp.id = p.id
    where p.role = 'sitter' and p.id <> auth.uid() and sp.home_lat is not null
  ),
  nearby as (
    -- Distance first: availability below is only checked for sitters inside the radius, and for the owner's
    -- favorites wherever they live (014i).
    select * from placed
    where km <= p_radius_km
      or id in (select ofs.sitter_id from public.owner_favorite_sitters ofs where ofs.owner_id = auth.uid())
  ),
  fits as (
    select n.*
    from nearby n
    cross join lateral (
      select
        count(*) filter (
          where public.sitter_remaining(n.id, f.day, f.slot) >= p_pet_count
            and not public.slot_held_by_other_owner(n.id, f.day, f.slot, auth.uid())
        )::int as covered,
        count(*)::int as total
      from public.slots_for_window(n.id, p_drop_off_at, p_pick_up_at) f
    ) w
    where w.total > 0 and w.covered = w.total
      and public.within_sitter_hours(n.id, p_drop_off_at)
      and public.within_sitter_hours(n.id, p_pick_up_at)
  )
  select f.id, f.display_name, f.bio, f.service_area, f.experience_years, f.services,
    f.id in (select m.sitter_id from public.list_my_sitters() m),
    f.multi,
    greatest(1, round(f.km))::int,
    r.boarding_nightly, r.house_sitting_nightly
  from fits f
  left join public.sitter_rates r on r.sitter_id = f.id
  order by f.km, f.display_name;
end;
$$;

revoke execute on function public.search_sitters_nearby(timestamptz, timestamptz, int, int, double precision, double precision)
from public, anon;
grant execute on function public.search_sitters_nearby(timestamptz, timestamptz, int, int, double precision, double precision)
to authenticated, service_role;

notify pgrst, 'reload schema';
