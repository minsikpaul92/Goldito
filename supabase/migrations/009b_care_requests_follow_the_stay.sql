-- Review fix (2026-10-06): care requests follow the stay.
--
-- 1. save_care_request (008, the owner's own checklist) refuses while a stay is on — the same rule as the
--    008j insert policies, which this security definer function did not go through. Mid-stay changes go
--    through send_care_change_request and the sitter's answer (008g/008h).
-- 2. An open change request (pending / countered) is closed when its booking is cancelled or declined, or
--    when the pet is picked up. Before, it kept blocking the next request for the pet (`request_pending`)
--    and the old sitter could still approve it weeks later and add tasks to a pet that is no longer theirs.
--    New status `closed`; requests already stuck that way are closed now.

alter table public.care_change_requests drop constraint care_change_requests_status_check;
alter table public.care_change_requests
  add constraint care_change_requests_status_check
    check (status in ('pending', 'approved', 'declined', 'countered', 'accepted', 'withdrawn', 'closed'));

create or replace function public.save_care_request(
  p_pet uuid,
  p_text text,
  p_model text,
  p_tasks jsonb,
  p_cautions text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request uuid;
  v_task jsonb;
  v_caution text;
begin
  if not public.is_owner_of(p_pet) then
    raise exception 'forbidden';
  end if;
  if public.pet_has_open_stay(p_pet) then
    raise exception 'stay_in_progress';
  end if;
  if jsonb_typeof(p_tasks) is distinct from 'array'
     or jsonb_array_length(p_tasks) > 12
     or coalesce(array_length(p_cautions, 1), 0) > 8 then
    raise exception 'too_many_items';
  end if;

  insert into public.care_requests (pet_id, created_by, raw_text, model)
  values (p_pet, auth.uid(), p_text, p_model)
  returning id into v_request;

  -- care_tasks' own checks (types, species guard) apply: any bad row rolls the whole save back.
  for v_task in select * from jsonb_array_elements(p_tasks) loop
    insert into public.care_tasks
      (pet_id, type, title, dose, scheduled_time, notes, repeat_daily, created_by, request_id)
    values
      (p_pet, v_task->>'type', btrim(v_task->>'title'), nullif(btrim(v_task->>'dose'), ''),
       (v_task->>'time')::time, nullif(btrim(v_task->>'notes'), ''), true, auth.uid(), v_request);
  end loop;

  foreach v_caution in array coalesce(p_cautions, '{}') loop
    insert into public.pet_cautions (pet_id, request_id, text, created_by)
    values (p_pet, v_request, btrim(v_caution), auth.uid());
  end loop;

  return v_request;
end;
$$;

-- Open requests of a booking whose stay is over (or never happened) can no longer be answered.
create or replace function public.close_open_care_requests(p_booking uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.care_change_requests
  set status = 'closed', decided_at = now()
  where booking_id = p_booking and status in ('pending', 'countered')
$$;

create or replace function public.close_care_requests_when_booking_ends()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('declined', 'cancelled') and old.status is distinct from new.status then
    perform public.close_open_care_requests(new.id);
  end if;
  return new;
end;
$$;

create trigger bookings_close_care_requests
  after update of status on public.bookings
  for each row execute function public.close_care_requests_when_booking_ends();

create or replace function public.close_care_requests_after_pick_up()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'pick_up' and new.completed_at is not null and old.completed_at is null then
    perform public.close_open_care_requests(new.booking_id);
  end if;
  return new;
end;
$$;

create trigger booking_handoffs_close_care_requests
  after update of completed_at on public.booking_handoffs
  for each row execute function public.close_care_requests_after_pick_up();

-- Requests that are already stuck: their booking is no longer a stay that is on.
update public.care_change_requests r
set status = 'closed', decided_at = now()
where r.status in ('pending', 'countered')
  and not exists (
    select 1 from public.bookings b
    where b.id = r.booking_id
      and b.status = 'confirmed'
      and not exists (
        select 1 from public.booking_handoffs h
        where h.booking_id = b.id and h.kind = 'pick_up' and h.completed_at is not null
      )
  );

revoke execute on function public.close_open_care_requests(uuid) from public, anon, authenticated;
revoke execute on function public.close_care_requests_when_booking_ends() from public, anon, authenticated;
revoke execute on function public.close_care_requests_after_pick_up() from public, anon, authenticated;
