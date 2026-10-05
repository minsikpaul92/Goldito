-- Phase 06 follow-up (6.21): the sitter can answer a care request with a NOTE, and instead of a plain
-- "no" send a COUNTER-REQUEST: an optional extra fee and the tasks they ask the owner to do themselves.
-- The owner accepts (the tasks the sitter agreed to are created) or declines.
--   pending → approved | declined | countered;  countered → accepted | withdrawn
-- The fee is recorded and shown (the demo has no add-on payment).

alter table public.care_change_requests drop constraint care_change_requests_status_check;
alter table public.care_change_requests
  add constraint care_change_requests_status_check
    check (status in ('pending', 'approved', 'declined', 'countered', 'accepted', 'withdrawn')),
  add column note text check (note is null or char_length(btrim(note)) between 1 and 200),
  add column counter_fee_cents integer check (counter_fee_cents is null or counter_fee_cents between 0 and 100000),
  add column counter_owner_tasks integer[] not null default '{}';

-- A countered request is still open: the owner has to answer before another one is sent.
drop index public.care_change_requests_one_open_idx;
create unique index care_change_requests_one_open_idx
  on public.care_change_requests (pet_id) where status in ('pending', 'countered');

-- send_care_change_request: same as 008g, but "open" now includes a countered request.
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

  select b.* into v_booking
  from public.bookings b
  join public.booking_pets bp on bp.booking_id = b.id and bp.pet_id = p_pet and bp.active
  where b.status = 'confirmed'
    and not exists (
      select 1 from public.booking_handoffs h
      where h.booking_id = b.id and h.kind = 'pick_up' and h.completed_at is not null
    )
  order by exists (
      select 1 from public.booking_handoffs h
      where h.booking_id = b.id and h.kind = 'drop_off' and h.completed_at is not null
    ) desc,
    b.created_at asc
  limit 1;
  if not found then
    raise exception 'no_active_stay';
  end if;

  if exists (select 1 from public.care_change_requests where pet_id = p_pet and status in ('pending', 'countered')) then
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

-- Shared by "approve" and "owner accepts the counter": create the tasks (minus the ones the owner will
-- do themselves) and the Heads-ups.
create or replace function public.apply_care_change_request(p_req public.care_change_requests)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task jsonb;
  v_idx bigint;
  v_caution text;
begin
  for v_task, v_idx in select t, i - 1 from jsonb_array_elements(p_req.tasks) with ordinality as x(t, i) loop
    continue when (v_idx::int) = any (p_req.counter_owner_tasks);
    insert into public.care_tasks
      (pet_id, type, title, dose, scheduled_time, notes, repeat_daily, created_by)
    values
      (p_req.pet_id, v_task->>'type', btrim(v_task->>'title'), nullif(btrim(v_task->>'dose'), ''),
       (v_task->>'time')::time, nullif(btrim(v_task->>'notes'), ''),
       coalesce((v_task->>'repeat')::boolean, true), p_req.requested_by);
  end loop;
  for v_caution in select jsonb_array_elements_text(p_req.cautions) loop
    insert into public.pet_cautions (pet_id, text, created_by)
    values (p_req.pet_id, btrim(v_caution), p_req.requested_by);
  end loop;
end;
$$;
revoke execute on function public.apply_care_change_request(public.care_change_requests) from public, anon, authenticated;

-- Approve / decline. A decline can carry a reason (chip) and a note; both reach the owner.
drop function public.respond_care_change_request(uuid, boolean, text);
create or replace function public.respond_care_change_request(
  p_request uuid, p_approve boolean, p_reason text default null, p_note text default null
)
returns public.care_change_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.care_change_requests;
  v_pet_name text;
  v_sitter_name text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_req from public.care_change_requests where id = p_request for update;
  if not found or v_req.sitter_id <> auth.uid() then
    raise exception 'forbidden';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'already_answered';
  end if;

  if p_approve then
    perform public.apply_care_change_request(v_req);
  end if;

  update public.care_change_requests
  set status = case when p_approve then 'approved' else 'declined' end,
      decline_reason = case when p_approve then null else v_reason end,
      note = case when p_approve then null else v_note end,
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
    case when p_approve then null
      else coalesce(nullif(concat_ws(' — ', v_reason, v_note), ''), 'Message them to adjust it.') end,
    v_req.pet_id,
    v_req.booking_id,
    v_req.id
  );
  return v_req;
end;
$$;

-- Sitter → owner: not a plain no. A note is required; an extra fee and "please do these yourself" are optional.
create or replace function public.counter_care_change_request(
  p_request uuid, p_note text, p_fee_cents integer default null, p_owner_tasks integer[] default '{}'
)
returns public.care_change_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.care_change_requests;
  v_pet_name text;
  v_sitter_name text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_owner_tasks integer[] := coalesce(p_owner_tasks, '{}');
  v_n int;
begin
  select * into v_req from public.care_change_requests where id = p_request for update;
  if not found or v_req.sitter_id <> auth.uid() then
    raise exception 'forbidden';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'already_answered';
  end if;
  if v_note is null then
    raise exception 'note_required';
  end if;
  v_n := jsonb_array_length(v_req.tasks);
  if exists (select 1 from unnest(v_owner_tasks) i where i < 0 or i >= v_n) then
    raise exception 'invalid_tasks';
  end if;

  update public.care_change_requests
  set status = 'countered', note = v_note, counter_fee_cents = p_fee_cents,
      counter_owner_tasks = v_owner_tasks, decided_at = now()
  where id = v_req.id
  returning * into v_req;

  select p.name into v_pet_name from public.pets p where p.id = v_req.pet_id;
  select display_name into v_sitter_name from public.profiles where id = v_req.sitter_id;
  perform public.notify_user(
    v_req.requested_by,
    'care_request_countered',
    format('%s sent a counter-request for %s 💬', v_sitter_name, v_pet_name),
    v_note || case when p_fee_cents is not null and p_fee_cents > 0
      then format(' (+$%s)', trim(to_char(p_fee_cents / 100.0, 'FM999990.00'))) else '' end,
    v_req.pet_id,
    v_req.booking_id,
    v_req.id
  );
  return v_req;
end;
$$;

-- Owner answers the counter-request: accept → what the sitter agreed to is created; decline → closed.
create or replace function public.answer_care_counter(p_request uuid, p_accept boolean)
returns public.care_change_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.care_change_requests;
  v_pet_name text;
  v_owner_name text;
begin
  select * into v_req from public.care_change_requests where id = p_request for update;
  if not found or v_req.requested_by <> auth.uid() then
    raise exception 'forbidden';
  end if;
  if v_req.status <> 'countered' then
    raise exception 'already_answered';
  end if;

  if p_accept then
    perform public.apply_care_change_request(v_req);
  end if;

  update public.care_change_requests
  set status = case when p_accept then 'accepted' else 'withdrawn' end, decided_at = now()
  where id = v_req.id
  returning * into v_req;

  select p.name into v_pet_name from public.pets p where p.id = v_req.pet_id;
  select display_name into v_owner_name from public.profiles where id = v_req.requested_by;
  perform public.notify_user(
    v_req.sitter_id,
    case when p_accept then 'care_counter_accepted' else 'care_counter_declined' end,
    case when p_accept
      then format('%s accepted your counter-request for %s ✅', v_owner_name, v_pet_name)
      else format('%s declined your counter-request for %s', v_owner_name, v_pet_name) end,
    null,
    v_req.pet_id,
    v_req.booking_id,
    v_req.id
  );
  return v_req;
end;
$$;

revoke execute on function public.send_care_change_request(uuid, jsonb, text[]) from public, anon;
revoke execute on function public.respond_care_change_request(uuid, boolean, text, text) from public, anon;
revoke execute on function public.counter_care_change_request(uuid, text, integer, integer[]) from public, anon;
revoke execute on function public.answer_care_counter(uuid, boolean) from public, anon;
grant execute on function public.send_care_change_request(uuid, jsonb, text[]) to authenticated, service_role;
grant execute on function public.respond_care_change_request(uuid, boolean, text, text) to authenticated, service_role;
grant execute on function public.counter_care_change_request(uuid, text, integer, integer[]) to authenticated, service_role;
grant execute on function public.answer_care_counter(uuid, boolean) to authenticated, service_role;
