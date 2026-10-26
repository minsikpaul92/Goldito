-- 015v: a judge set's sitter is shown only to the owner of the same set (#411 follow-up).
--
-- The four judge sets (`demo-owner-judgeN` / `demo-sitter-judgeN@goldito.test`) each have a sitter called Chloe. The
-- sitter search showed every one of them to every owner, so a judge saw five Chloes and could ask another judge's
-- sitter, which crosses seats. Now a judge sitter is listed only for her own set's owner; every other sitter is
-- listed as before. Both search functions are the 011l / 014i versions with one more line in their sitter filter.

-- True unless the sitter is a judge sitter and the viewer is not the owner of the same judge set.
create or replace function public.sitter_visible_to(p_sitter uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from auth.users s
    where s.id = p_sitter
      and lower(s.email) like 'demo-sitter-judge%@goldito.test'
      and lower(s.email) is distinct from (
        select replace(lower(v.email), 'demo-owner-judge', 'demo-sitter-judge') from auth.users v where v.id = p_viewer
      )
  )
$$;

revoke execute on function public.sitter_visible_to(uuid, uuid) from public, anon, authenticated;
grant execute on function public.sitter_visible_to(uuid, uuid) to service_role;

create or replace function public.search_sitters(
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
    where p.role = 'sitter' and p.id <> auth.uid() and public.sitter_visible_to(p.id, auth.uid())
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
      and public.sitter_visible_to(p.id, auth.uid())
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

notify pgrst, 'reload schema';
