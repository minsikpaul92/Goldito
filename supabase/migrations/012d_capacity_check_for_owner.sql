-- 012d (CR-3, code review 2026-10-13): the can-host check names the owner it is asked for.
--
-- stay_capacity_check (011c, 011l) used auth.uid() as the owner for the "one owner at a time" rule. That is right
-- when the owner asks (the ask sheet), but the inquiry AI also runs it with the SITTER's token (Regenerate, the
-- Accept / Decline quick replies) and the sitter's Suggest sheet calls it directly. The sitter's own id then stood
-- in for the owner, so the owner's own hold or booking counted as "another owner" and the same dates flipped from
-- yes to no.
--
-- p_owner (optional) = the owner the stay is for. Null keeps the old meaning (the caller is the owner), so the
-- 4-argument call still works. Only that owner or the sitter being asked may name an owner.

drop function public.stay_capacity_check(uuid, timestamptz, timestamptz, int);

create function public.stay_capacity_check(
  p_sitter uuid,
  p_drop_off_at timestamptz,
  p_pick_up_at timestamptz,
  p_pet_count int,
  p_owner uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bad text;
  v_owner uuid := coalesce(p_owner, auth.uid());
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;
  if p_owner is not null and auth.uid() not in (p_owner, p_sitter) then
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
  return public.other_owner_shortfall(p_sitter, v_owner, null, p_drop_off_at, p_pick_up_at);
end;
$$;

revoke all on function public.stay_capacity_check(uuid, timestamptz, timestamptz, int, uuid) from public, anon;
grant execute on function public.stay_capacity_check(uuid, timestamptz, timestamptz, int, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
