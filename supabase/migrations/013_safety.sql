-- 013 (Phase 12.1 Treat check — the Phase 08 design, D61): owners check treats too, and a sitter's DANGER tells the owner.
--
-- safety_checks (001) is written by the backend only (POST /api/ai/safety-check, service role); both people on the pet
-- already read it (can_access_pet). What changes:
-- 1. The owner may record "I understand — don't feed" (acknowledged_at) on their own pet's checks, not only the sitter
--    (the column grant from 002 / 003 stays: acknowledged_at is the only column a client can change).
-- 2. A DANGER found by someone other than the owner (the sitter on duty) sends the owner one `safety_danger` notice.
--    The owner's own checks send nothing — they saw the red screen themselves.

drop policy safety_checks_update on public.safety_checks;

create policy safety_checks_update on public.safety_checks
  for update to authenticated
  using (public.is_owner_of(pet_id) or public.is_sitter_of(pet_id))
  with check (public.is_owner_of(pet_id) or public.is_sitter_of(pet_id));

create or replace function public.notify_safety_danger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_pet_name text;
begin
  select p.owner_id, p.name into v_owner, v_pet_name from public.pets p where p.id = new.pet_id;
  if v_owner is null or new.checked_by is not distinct from v_owner then
    return new;
  end if;
  perform public.notify_user(
    v_owner,
    'safety_danger',
    format('Blocked a risky treat for %s ⚠️', v_pet_name),
    nullif(left(coalesce(new.result_json ->> 'warning_message', ''), 200), ''),
    new.pet_id,
    null,
    new.id
  );
  return new;
end;
$$;

create trigger safety_checks_notify_danger
  after insert on public.safety_checks
  for each row
  when (new.safety_status = 'DANGER')
  execute function public.notify_safety_danger();

revoke execute on function public.notify_safety_danger() from public, anon, authenticated;

notify pgrst, 'reload schema';
