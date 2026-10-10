-- 011c (RV-1): the inquiry AI's "yes, I can host" uses the booking engine's own capacity rule.
--
-- The inquiry reply decided availability from `get_sitter_schedule`: a day was unavailable only when a slot was
-- blocked or full. `request_booking` (004) is stricter: every slot the stay touches must have room for ALL the
-- pets, and a slot the sitter never opened has room for none. So two pets and one spot left, or one unopened
-- night, read as "yes, I can host" — and the owner's request then failed with `sitter_unavailable`.
--
-- `stay_capacity_check` runs the schedule part of `request_booking` and nothing else (no pet ownership, no
-- service, no insert). It answers:
--   null                  the stay fits
--   'invalid_window'      past, reversed, or longer than 31 days (request_booking's `invalid_window`)
--   'no_open_slot'        none of the stay falls in a slot the sitter opened
--   'YYYY-MM-DD slot, …'  the slots without room for p_pet_count pets (capacity_shortfall's detail)

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
  return public.capacity_shortfall(p_sitter, null, p_pet_count, p_drop_off_at, p_pick_up_at);
end;
$$;

revoke all on function public.stay_capacity_check(uuid, timestamptz, timestamptz, int) from public, anon;
grant execute on function public.stay_capacity_check(uuid, timestamptz, timestamptz, int) to authenticated, service_role;
