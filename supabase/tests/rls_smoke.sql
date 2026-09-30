-- PawNote RLS + booking smoke test (Phase 02 DoD 2)
--
-- Run after 001–003 in the Supabase SQL Editor (as postgres). Everything runs in one
-- transaction and is rolled back, so no data is left behind.
-- Success = the script finishes without error ("PASS: ..." notices for each check).
-- Failure = "FAIL: <check>" error.
--
-- Cast (all fictional): owners Jisoo (dog Bori, cat Mochi) and Hana (dogs Coco, Toto);
-- sitters Mina (08–12 / 12–18 / 18–08, 3 pets), Jun (09–13 / 13–17, 2 pets),
-- Sora (default hours, 3 pets), Nara (no bookings).
-- Scenario letters match docs/plan/phases/phase-02.md "예시 시나리오".

begin;

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with everything else)
-- ---------------------------------------------------------------------------

create table public._t_ids (name text primary key, id uuid not null);
grant all on public._t_ids to authenticated;

create function public._t_put(p_name text, p_id uuid) returns void
language sql security definer set search_path = public as $$
  insert into public._t_ids values (p_name, p_id)
  on conflict (name) do update set id = excluded.id
$$;

create function public._t_get(p_name text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public._t_ids where name = p_name
$$;

-- Act as a signed-in user (null = back to the session role, bypassing RLS).
create function public._t_as(p_user uuid) returns void
language plpgsql as $$
begin
  if p_user is null then
    perform set_config('role', 'none', true);
    perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  end if;
end;
$$;

create function public._t_ok(p_cond boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FAIL: %', p_label;
  end if;
  raise notice 'PASS: %', p_label;
end;
$$;

grant execute on function public._t_put(text, uuid), public._t_get(text), public._t_as(uuid),
  public._t_ok(boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures (signup trigger creates profiles)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'jisoo@example.test', '{"role":"owner","display_name":"Jisoo"}'),
  ('00000000-0000-4000-8000-0000000000a2', 'hana@example.test', '{"role":"owner","display_name":"Hana"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'mina@example.test', '{"role":"sitter","display_name":"Mina"}'),
  ('00000000-0000-4000-8000-0000000000b2', 'jun@example.test', '{"role":"sitter","display_name":"Jun"}'),
  ('00000000-0000-4000-8000-0000000000b3', 'sora@example.test', '{"role":"sitter","display_name":"Sora"}'),
  ('00000000-0000-4000-8000-0000000000b4', 'nara@example.test', '{"role":"sitter"}');

insert into public.pets (id, owner_id, species, name) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'dog', 'Bori'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a1', 'cat', 'Mochi'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000a2', 'dog', 'Coco'),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000a2', 'dog', 'Toto');

-- Permission fixtures, inserted directly (bypassing RPCs):
--   "current": Mina has Bori right now. "future": Jun has Coco next week.
--   "requested": Nara has an unanswered request from Jisoo.
do $$
declare
  v_id uuid;
begin
  insert into public.bookings (owner_id, sitter_id, start_date, end_date, status)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1',
    app_today() - 1, app_today() + 1, 'confirmed')
  returning id into v_id;
  insert into public.booking_slots (booking_id, pet_id, day, slot)
  values (v_id, '00000000-0000-4000-8000-0000000000c1', app_today(), 'morning');
  insert into public.booking_handoffs (booking_id, kind, scheduled_at, within_sitter_hours, status, proposed_by)
  values (v_id, 'drop_off', now() - interval '1 day', true, 'agreed', '00000000-0000-4000-8000-0000000000a1'),
         (v_id, 'pick_up', now() + interval '1 day', true, 'agreed', '00000000-0000-4000-8000-0000000000a1');

  insert into public.bookings (owner_id, sitter_id, start_date, end_date, status)
  values ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b2',
    app_today() + 7, app_today() + 8, 'confirmed')
  returning id into v_id;
  insert into public.booking_slots (booking_id, pet_id, day, slot)
  values (v_id, '00000000-0000-4000-8000-0000000000c3', app_today() + 7, 'morning');
  insert into public.booking_handoffs (booking_id, kind, scheduled_at, within_sitter_hours, status, proposed_by)
  values (v_id, 'drop_off', now() + interval '7 days', true, 'agreed', '00000000-0000-4000-8000-0000000000a2'),
         (v_id, 'pick_up', now() + interval '8 days', true, 'agreed', '00000000-0000-4000-8000-0000000000a2');

  insert into public.bookings (owner_id, sitter_id, start_date, end_date, status)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b4',
    app_today() + 40, app_today() + 41, 'requested');

  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', 'smoke/bori', 'image', 'feed')
  returning id into v_id;
  perform _t_put('media_bori', v_id);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
  values ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000b2', 'smoke/coco', 'image', 'feed')
  returning id into v_id;
  perform _t_put('media_coco', v_id);

  insert into public.care_tasks (pet_id, type, title, scheduled_time)
  values ('00000000-0000-4000-8000-0000000000c1', 'feeding', 'Breakfast', '08:00')
  returning id into v_id;
  perform _t_put('task_bori', v_id);

  insert into public.daily_reports (pet_id, sitter_id, report_date, body)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', app_today(), 'Draft');
end;
$$;

-- ---------------------------------------------------------------------------
-- Signup trigger & realtime
-- ---------------------------------------------------------------------------

do $$
begin
  perform _t_ok((select count(*) from public.profiles where id in (
      '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2',
      '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2',
      '00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000b4')) = 6,
    'signup trigger creates profiles');
  perform _t_ok(exists (select 1 from public.owner_profiles where id = '00000000-0000-4000-8000-0000000000a1')
      and exists (select 1 from public.sitter_profiles where id = '00000000-0000-4000-8000-0000000000b1')
      and not exists (select 1 from public.sitter_profiles where id = '00000000-0000-4000-8000-0000000000a1'),
    'signup trigger creates the matching role profile');
  perform _t_ok((select display_name from public.profiles where id = '00000000-0000-4000-8000-0000000000b4') = 'nara',
    'display_name falls back to email prefix');
  perform _t_ok(exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'),
    'notifications is in the realtime publication');
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

do $$
declare
  jisoo constant uuid := '00000000-0000-4000-8000-0000000000a1';
  mina constant uuid := '00000000-0000-4000-8000-0000000000b1';
  jun constant uuid := '00000000-0000-4000-8000-0000000000b2';
  nara constant uuid := '00000000-0000-4000-8000-0000000000b4';
  bori constant uuid := '00000000-0000-4000-8000-0000000000c1';
  mochi constant uuid := '00000000-0000-4000-8000-0000000000c2';
  coco constant uuid := '00000000-0000-4000-8000-0000000000c3';
  n int;
  v_err text;
begin
  -- Sitter with no booking
  perform _t_as(nara);
  select count(*) into n from public.pets where id = bori;
  perform _t_ok(n = 0, 'sitter without booking cannot see pet');
  select count(*) into n from public.owner_profiles where id = jisoo;
  perform _t_ok(n = 0, 'requested-only sitter cannot see owner profile');

  -- Sitter with a confirmed booking next week
  perform _t_as(jun);
  select count(*) into n from public.pets where id = coco;
  perform _t_ok(n = 1, 'sitter with upcoming booking can see pet');
  begin
    insert into public.feed_posts (pet_id, sitter_id, media_id) values (coco, jun, _t_get('media_coco'));
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'sitter cannot post before drop-off');
  begin
    insert into public.feed_posts (pet_id, sitter_id, media_id) values (bori, jun, _t_get('media_bori'));
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'other sitter cannot post for a pet in care');

  -- Sitter currently caring for Bori
  perform _t_as(mina);
  insert into public.feed_posts (pet_id, sitter_id, media_id) values (bori, mina, _t_get('media_bori'));
  perform _t_ok(true, 'on-duty sitter can post');
  select count(*) into n from public.owner_profiles where id = jisoo;
  perform _t_ok(n = 1, 'confirmed sitter can see owner profile');
  perform _t_ok(in_care_window(bori, now()), 'in_care_window true during care');
  perform _t_ok(not in_care_window(bori, now() - interval '2 days'), 'in_care_window false before drop-off');

  -- Owner
  perform _t_as(jisoo);
  begin
    insert into public.task_logs (task_id, pet_id, due_at) values (_t_get('task_bori'), bori, now());
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'owner cannot insert task_logs directly');
  select count(*) into n from public.daily_reports where pet_id = bori;
  perform _t_ok(n = 0, 'owner cannot see draft daily report');
  begin
    perform home_address from public.sitter_profiles where id = mina;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'owner cannot read sitter home_address');
  select count(*) into n from public.sitter_profiles where id = mina and bio is null;
  perform _t_ok(n = 1, 'owner can read public sitter profile columns');
  begin
    update public.profiles set role = 'sitter' where id = jisoo;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'user cannot change own role');
  begin
    update public.pets set species = 'cat' where id = bori;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'owner cannot change pet species');
  update public.pets set weight_kg = 7.5 where id = bori;
  perform _t_ok(true, 'owner can update pet details');
  begin
    insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot)
    values (jisoo, 'blocked', app_today(), app_today(), 'morning');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'owner cannot create sitter availability');

  -- Species care rules (D23)
  begin
    insert into public.care_tasks (pet_id, type, title, scheduled_time) values (mochi, 'walk', 'Walk', '09:00');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'task_type_not_allowed_for_species', 'cat cannot get a walk task');
  begin
    insert into public.care_tasks (pet_id, type, title, scheduled_time) values (bori, 'litter', 'Litter', '09:00');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'task_type_not_allowed_for_species', 'dog cannot get a litter task');
  insert into public.care_tasks (pet_id, type, title, scheduled_time) values (mochi, 'litter', 'Litter box', '09:00');
  perform _t_ok(true, 'cat can get a litter task');

  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking scenarios A–H (dates start 30 days from today to avoid fixture overlap)
-- ---------------------------------------------------------------------------

do $$
declare
  jisoo constant uuid := '00000000-0000-4000-8000-0000000000a1';
  hana constant uuid := '00000000-0000-4000-8000-0000000000a2';
  mina constant uuid := '00000000-0000-4000-8000-0000000000b1';
  jun constant uuid := '00000000-0000-4000-8000-0000000000b2';
  sora constant uuid := '00000000-0000-4000-8000-0000000000b3';
  nara constant uuid := '00000000-0000-4000-8000-0000000000b4';
  bori constant uuid := '00000000-0000-4000-8000-0000000000c1';
  mochi constant uuid := '00000000-0000-4000-8000-0000000000c2';
  coco constant uuid := '00000000-0000-4000-8000-0000000000c3';
  toto constant uuid := '00000000-0000-4000-8000-0000000000c4';
  d constant date := app_today() + 30;
  v_a uuid;
  v_b uuid;
  v_h uuid;
  v_err text;
  v_detail text;
  n int;
  r record;
begin
  -- Sitters open their schedules
  perform _t_as(mina);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (mina, 'open', d - 1, d + 20, 'morning', '08:00', '12:00', 3),
         (mina, 'open', d - 1, d + 20, 'afternoon', '12:00', '18:00', 3),
         (mina, 'open', d - 1, d + 20, 'overnight', '18:00', '08:00', 3);
  perform _t_as(jun);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (jun, 'open', d - 1, d + 20, 'morning', '09:00', '13:00', 2),
         (jun, 'open', d - 1, d + 20, 'afternoon', '13:00', '17:00', 2);
  perform _t_as(sora);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (sora, 'open', d - 1, d + 20, 'morning', '08:00', '12:00', 3),
         (sora, 'open', d - 1, d + 20, 'afternoon', '12:00', '18:00', 3),
         (sora, 'open', d - 1, d + 20, 'overnight', '18:00', '08:00', 3);

  -- G: opening a schedule notifies nobody
  perform _t_as(null);
  perform _t_ok((select count(*) from public.notifications where user_id in (jisoo, hana)) = 0,
    'G: opening a schedule sends no owner notifications');

  -- A: in-hours drop-off & pick-up at sitter's home → request → accept → confirmed
  perform _t_as(jisoo);
  v_a := request_booking(mina, array[bori, mochi],
    local_ts(d, '09:30'), 'sitter_home', null,
    local_ts(d + 3, '17:00'), 'sitter_home', null, 'First trip');
  perform _t_put('A', v_a);
  perform _t_ok((select count(*) from public.booking_slots where booking_id = v_a) = 22,
    'A: 2 pets × 11 slots');
  perform _t_ok((select count(*) from public.booking_handoffs
      where booking_id = v_a and status = 'proposed' and within_sitter_hours) = 2,
    'A: two in-hours handoff proposals');
  perform _t_as(mina);
  perform respond_booking(v_a, true, 'See you!');
  perform _t_as(null);
  perform _t_ok((select status from public.bookings where id = v_a) = 'confirmed', 'A: booking confirmed');
  perform _t_ok((select count(*) from public.booking_handoffs where booking_id = v_a and status = 'agreed') = 2,
    'A: both handoffs agreed');
  perform _t_ok((select count(*) from public.notifications where user_id = jisoo and type = 'booking_confirmed') = 1,
    'A: owner gets one booking_confirmed');
  perform _t_ok((select count(*) from public.notifications where user_id = mina and type = 'booking_requested') = 1,
    'A: sitter got booking_requested');
  perform _t_as(mina);
  perform complete_handoff(v_a, 'drop_off');
  perform _t_as(null);
  perform _t_ok((select title from public.notifications where user_id = jisoo and type = 'pet_dropped_off')
      = 'Bori and Mochi arrived at Mina''s 🏠',
    'A: Received → owner notified');

  -- B + H: capacity 3 at day d morning; two requests race for the last spot
  perform _t_as(hana);
  v_b := request_booking(mina, array[coco], local_ts(d, '09:00'), 'sitter_home', null,
    local_ts(d + 1, '17:00'), 'sitter_home', null, null);
  v_h := request_booking(mina, array[toto], local_ts(d, '09:00'), 'sitter_home', null,
    local_ts(d + 1, '17:00'), 'sitter_home', null, null);
  perform _t_as(mina);
  perform respond_booking(v_b, true);
  begin
    perform respond_booking(v_h, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'sitter_unavailable', 'H: second acceptance for the last spot fails');
  perform _t_as(hana);
  select * into r from get_sitter_schedule(mina, d, d) s where s.slot = 'morning';
  perform _t_ok(r.state = 'full' and r.remaining = 0, 'B: schedule shows the slot as full');
  perform cancel_booking(v_h, 'Found another plan');
  begin
    perform request_booking(mina, array[toto], local_ts(d, '09:00'), 'sitter_home', null,
      local_ts(d + 1, '17:00'), 'sitter_home', null, null);
    v_err := null;
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform _t_ok(v_err = 'sitter_unavailable' and v_detail like '%morning%',
    'B: new request into a full slot is rejected with the slot in detail');

  -- C: out-of-hours drop-off negotiated back and forth (Jun opens at 09:00)
  perform _t_as(jisoo);
  v_a := request_booking(jun, array[bori], local_ts(d + 10, '08:00'), 'sitter_home', null,
    local_ts(d + 10, '16:00'), 'sitter_home', null, null);
  perform _t_ok((select within_sitter_hours from public.booking_handoffs
      where booking_id = v_a and kind = 'drop_off' and status = 'proposed') = false,
    'C: 08:00 drop-off is outside Jun''s hours');
  perform _t_as(jun);
  perform propose_handoff(v_a, 'drop_off', local_ts(d + 10, '08:45'));
  begin
    perform respond_booking(v_a, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'handoff_pending', 'C: sitter cannot accept while own counter-offer is pending');
  perform _t_as(jisoo);
  perform propose_handoff(v_a, 'drop_off', local_ts(d + 10, '08:30'));
  perform _t_as(jun);
  v_h := propose_handoff(v_a, 'drop_off', local_ts(d + 10, '08:45'));
  perform _t_as(jisoo);
  perform respond_handoff(v_h, true);
  perform _t_as(jun);
  perform respond_booking(v_a, true);
  perform _t_as(null);
  perform _t_ok((select status from public.bookings where id = v_a) = 'confirmed', 'C: booking confirmed');
  perform _t_ok((select scheduled_at from public.booking_handoffs
      where booking_id = v_a and kind = 'drop_off' and status = 'agreed') = local_ts(d + 10, '08:45'),
    'C: agreed drop-off is 08:45');
  perform _t_ok((select count(*) from public.booking_handoffs
      where booking_id = v_a and kind = 'drop_off' and status = 'superseded') = 3,
    'C: three superseded proposals');

  -- C″: owner declines sitter's counter-offer before confirmation → request ends
  perform _t_as(hana);
  v_a := request_booking(jun, array[coco], local_ts(d + 12, '10:00'), 'sitter_home', null,
    local_ts(d + 12, '15:00'), 'sitter_home', null, null);
  perform _t_as(jun);
  v_h := propose_handoff(v_a, 'pick_up', local_ts(d + 12, '14:00'));
  perform _t_as(hana);
  perform respond_handoff(v_h, false);
  perform _t_as(null);
  perform _t_ok((select status from public.bookings where id = v_a) = 'cancelled', 'C″: booking cancelled');
  perform _t_ok(not exists (select 1 from public.booking_slots where booking_id = v_a and active),
    'C″: slots released');
  perform _t_ok((select count(*) from public.notifications where user_id = jun and type = 'booking_cancelled') = 1,
    'C″: sitter notified');

  -- D: confirmed booking, owner moves pick-up 17:00 → 20:00
  v_a := _t_get('A');
  perform _t_as(jisoo);
  v_h := propose_handoff(v_a, 'pick_up', local_ts(d + 3, '20:00'));
  perform _t_as(null);
  perform _t_ok((select scheduled_at from public.booking_handoffs
      where booking_id = v_a and kind = 'pick_up' and status = 'agreed') = local_ts(d + 3, '17:00'),
    'D: old pick-up stays valid until agreed');
  perform _t_as(mina);
  perform respond_handoff(v_h, true);
  perform _t_as(null);
  perform _t_ok((select scheduled_at from public.booking_handoffs
      where booking_id = v_a and kind = 'pick_up' and status = 'agreed') = local_ts(d + 3, '20:00'),
    'D: new pick-up agreed');
  perform _t_ok((select count(*) from public.booking_slots where booking_id = v_a and active) = 24,
    'D: slots recalculated (overnight added)');
  perform _t_ok((select count(*) from public.notifications where user_id = jisoo and type = 'handoff_agreed') = 1,
    'D: owner notified of agreement');

  -- D″: sitter declines a change after confirmation → booking unchanged
  perform _t_as(jisoo);
  v_h := propose_handoff(v_a, 'pick_up', local_ts(d + 3, '21:00'));
  perform _t_as(mina);
  perform respond_handoff(v_h, false);
  perform _t_as(null);
  perform _t_ok((select status from public.bookings where id = v_a) = 'confirmed'
      and (select scheduled_at from public.booking_handoffs
        where booking_id = v_a and kind = 'pick_up' and status = 'agreed') = local_ts(d + 3, '20:00'),
    'D″: declined change keeps the agreed pick-up');

  -- D′: address only via get_handoff_details, only for the booking parties
  perform _t_as(mina);
  update public.sitter_profiles set home_address = '100 Example St' where id = mina;
  perform _t_as(jisoo);
  perform _t_ok((select address from get_handoff_details(v_a) where kind = 'drop_off') = '100 Example St',
    'D′: owner sees sitter address for the confirmed booking');
  perform _t_as(nara);
  begin
    perform get_handoff_details(v_a);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', 'D′: outsider cannot read handoff details');

  -- E: sitter blocks a day overlapping a confirmed booking → must cancel first → owner rebooks
  perform _t_as(mina);
  begin
    insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot)
    values (mina, 'blocked', d + 2, d + 2, 'morning');
    v_err := null;
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform _t_ok(v_err = 'overlaps_confirmed_booking' and v_detail like '%' || v_a || '%',
    'E: block over a confirmed booking is rejected with the booking id');
  perform cancel_booking(v_a, 'Personal schedule');
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot)
  values (mina, 'blocked', d + 2, d + 2, 'morning');
  perform _t_as(null);
  perform _t_ok(not exists (select 1 from public.booking_slots where booking_id = v_a and active),
    'E: cancelled booking releases slots');
  perform _t_ok((select body from public.notifications where user_id = jisoo and type = 'booking_cancelled')
      like 'Mina can''t take Bori and Mochi on %. Find a new sitter.',
    'E: owner told to find a new sitter');
  perform _t_as(jisoo);
  select * into r from search_sitters(local_ts(d, '09:30'), local_ts(d + 3, '20:00'), 2) limit 1;
  perform _t_ok(r.sitter_id = sora and r.covered_slots = r.total_slots, 'E: fully available sitter ranks first');
  v_b := request_booking(sora, array[bori, mochi], local_ts(d, '09:30'), 'sitter_home', null,
    local_ts(d + 3, '20:00'), 'sitter_home', null, null, v_a);
  perform _t_as(sora);
  perform respond_booking(v_b, true);
  perform _t_as(null);
  perform _t_ok((select status = 'confirmed' and rebooked_from = v_a from public.bookings where id = v_b),
    'E: rebooked with another sitter');

  -- F: morning with Mina, afternoon with Jun, same pet & day; same slot twice fails
  perform _t_as(hana);
  v_a := request_booking(mina, array[coco], local_ts(d + 14, '09:00'), 'sitter_home', null,
    local_ts(d + 14, '12:00'), 'other', 'Mina''s place, Jun picks up', null);
  v_b := request_booking(jun, array[coco], local_ts(d + 14, '13:00'), 'other', 'Mina''s place',
    local_ts(d + 14, '17:00'), 'sitter_home', null, null);
  perform _t_as(mina);
  perform respond_booking(v_a, true);
  perform _t_as(jun);
  perform respond_booking(v_b, true);
  perform _t_as(hana);
  begin
    perform request_booking(sora, array[coco], local_ts(d + 14, '13:00'), 'sitter_home', null,
      local_ts(d + 14, '17:00'), 'sitter_home', null, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'pet_already_booked', 'F: same pet, same slot, second sitter is rejected');
  perform _t_as(null);
  perform _t_ok((select count(*) from public.bookings where id in (v_a, v_b) and status = 'confirmed') = 2,
    'F: split day with two sitters confirmed');
  insert into public.daily_reports (pet_id, sitter_id, report_date, body)
  values (coco, mina, d + 14, 'Morning report'), (coco, jun, d + 14, 'Afternoon report');
  perform _t_ok(true, 'F: one daily report per sitter for the same day');
end;
$$;

rollback;
