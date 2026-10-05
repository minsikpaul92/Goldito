-- Phase 06 follow-up (6.20): while a stay is on, the owner no longer edits the checklist directly —
-- they SEND a care request and the sitter approves or declines it, so tasks can't keep piling up
-- mid-stay. One open request per pet. Approving applies the tasks and Heads-ups in one transaction.
--
-- (`care_requests` from 008 is the owner's saved note; this is a different thing — a request TO the sitter.)

create table public.care_change_requests (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  tasks jsonb not null default '[]'::jsonb,
  cautions jsonb not null default '[]'::jsonb,
  decline_reason text check (decline_reason is null or char_length(btrim(decline_reason)) between 1 and 200),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- At most one open request per pet.
create unique index care_change_requests_one_open_idx on public.care_change_requests (pet_id) where status = 'pending';
create index care_change_requests_pet_idx on public.care_change_requests (pet_id, created_at desc);

alter table public.care_change_requests enable row level security;

create policy care_change_requests_select on public.care_change_requests
  for select to authenticated
  using (requested_by = (select auth.uid()) or sitter_id = (select auth.uid()));

revoke all on public.care_change_requests from anon, authenticated;
grant select on public.care_change_requests to authenticated;
grant all on public.care_change_requests to service_role;

-- Owner → sitter. Tasks: [{type, time, title, dose, notes, repeat}], cautions: text[].
create or replace function public.send_care_change_request(p_pet uuid, p_tasks jsonb, p_cautions text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_id uuid;
  v_pet_name text;
  v_owner_name text;
  v_tasks int;
  v_cautions int := coalesce(array_length(p_cautions, 1), 0);
begin
  if not public.is_owner_of(p_pet) then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(p_tasks) is distinct from 'array' then
    raise exception 'too_many_items';
  end if;
  v_tasks := jsonb_array_length(p_tasks);
  if v_tasks > 12 or v_cautions > 8 then
    raise exception 'too_many_items';
  end if;
  if v_tasks = 0 and v_cautions = 0 then
    raise exception 'empty_request';
  end if;

  -- The stay that is on (or about to start): confirmed and the pet not yet picked up.
  select b.* into v_booking
  from public.bookings b
  join public.booking_pets bp on bp.booking_id = b.id and bp.pet_id = p_pet and bp.active
  where b.status = 'confirmed'
    and not exists (
      select 1 from public.booking_handoffs h
      where h.booking_id = b.id and h.kind = 'pick_up' and h.completed_at is not null
    )
  -- A stay already under way comes before one that is only booked; then the earliest.
  order by exists (
      select 1 from public.booking_handoffs h
      where h.booking_id = b.id and h.kind = 'drop_off' and h.completed_at is not null
    ) desc,
    b.created_at asc
  limit 1;
  if not found then
    raise exception 'no_active_stay';
  end if;

  if exists (select 1 from public.care_change_requests where pet_id = p_pet and status = 'pending') then
    raise exception 'request_pending';
  end if;

  insert into public.care_change_requests (pet_id, booking_id, requested_by, sitter_id, tasks, cautions)
  values (p_pet, v_booking.id, auth.uid(), v_booking.sitter_id, p_tasks, to_jsonb(coalesce(p_cautions, '{}')))
  returning id into v_id;

  select p.name, pr.display_name into v_pet_name, v_owner_name
  from public.pets p join public.profiles pr on pr.id = p.owner_id where p.id = p_pet;

  perform public.notify_user(
    v_booking.sitter_id,
    'care_request',
    format('%s sent a care request for %s 📝', v_owner_name, v_pet_name),
    format('%s task%s, %s Heads-up%s', v_tasks, case when v_tasks = 1 then '' else 's' end,
           v_cautions, case when v_cautions = 1 then '' else 's' end),
    p_pet,
    v_booking.id,
    v_id
  );
  return v_id;
end;
$$;

-- Sitter answers. Approve → the tasks and Heads-ups are created; decline → the owner gets the reason.
create or replace function public.respond_care_change_request(p_request uuid, p_approve boolean, p_reason text default null)
returns public.care_change_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.care_change_requests;
  v_task jsonb;
  v_caution text;
  v_pet_name text;
  v_sitter_name text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_req from public.care_change_requests where id = p_request for update;
  if not found or v_req.sitter_id <> auth.uid() then
    raise exception 'forbidden';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'already_answered';
  end if;

  if p_approve then
    for v_task in select * from jsonb_array_elements(v_req.tasks) loop
      insert into public.care_tasks
        (pet_id, type, title, dose, scheduled_time, notes, repeat_daily, created_by)
      values
        (v_req.pet_id, v_task->>'type', btrim(v_task->>'title'), nullif(btrim(v_task->>'dose'), ''),
         (v_task->>'time')::time, nullif(btrim(v_task->>'notes'), ''),
         coalesce((v_task->>'repeat')::boolean, true), v_req.requested_by);
    end loop;
    for v_caution in select jsonb_array_elements_text(v_req.cautions) loop
      insert into public.pet_cautions (pet_id, text, created_by)
      values (v_req.pet_id, btrim(v_caution), v_req.requested_by);
    end loop;
  end if;

  update public.care_change_requests
  set status = case when p_approve then 'approved' else 'declined' end,
      decline_reason = case when p_approve then null else v_reason end,
      decided_at = now()
  where id = v_req.id
  returning * into v_req;

  select p.name into v_pet_name from public.pets p where p.id = v_req.pet_id;
  select display_name into v_sitter_name from public.profiles where id = v_req.sitter_id;
  perform public.notify_user(
    v_req.requested_by,
    case when p_approve then 'care_request_approved' else 'care_request_declined' end,
    case when p_approve
      then format('%s approved your care request for %s ✅', v_sitter_name, v_pet_name)
      else format('%s couldn''t take this one for %s', v_sitter_name, v_pet_name) end,
    case when p_approve then null else coalesce(v_reason, 'Message them to adjust it.') end,
    v_req.pet_id,
    v_req.booking_id,
    v_req.id
  );
  return v_req;
end;
$$;

revoke execute on function public.send_care_change_request(uuid, jsonb, text[]) from public, anon;
revoke execute on function public.respond_care_change_request(uuid, boolean, text) from public, anon;
grant execute on function public.send_care_change_request(uuid, jsonb, text[]) to authenticated, service_role;
grant execute on function public.respond_care_change_request(uuid, boolean, text) to authenticated, service_role;
