-- PawNote RLS + booking smoke test (Phase 02 DoD 2)
--
-- Run after all migrations (001–004) in the Supabase SQL Editor (as postgres), or locally with
-- tests/supabase_stub.sql first (see supabase/README.md). Everything runs in one transaction
-- and is rolled back, so no data is left behind.
-- Success = the script finishes without error ("PASS: ..." notices for each check).
-- Failure = "FAIL: <check>" error.
--
-- Cast (all fictional): owners Jisoo (dog Bori, cat Mochi) and Hana (dogs Coco, Toto);
-- sitters Mina (08–12 / 12–18 / 18–08, 3 pets), Jun (09–13 / 13–17, 2 pets),
-- Sora (08–12 / 12–18 / 18–08, 3 pets), Nara (no schedule).
-- Scenario letters match docs/plan/phases/phase-02.md "예시 시나리오".
-- H (last-spot race) runs sequentially here; the advisory lock serializes real concurrent calls.

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

-- Act as a signed-in user, as anon ('anon'), or back to the session role (null).
create function public._t_as(p_user uuid, p_role text default 'authenticated') returns void
language plpgsql as $$
begin
  if p_user is null and p_role = 'authenticated' then
    perform set_config('role', 'none', true);
    perform set_config('request.jwt.claims', '', true);
  elsif p_role = 'anon' then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
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

-- Fixture booking inserted directly (bypassing RPCs): agreed handoffs if confirmed.
create function public._t_booking(
  p_owner uuid, p_sitter uuid, p_pets uuid[], p_drop timestamptz, p_pick timestamptz,
  p_status text, p_received boolean default false
) returns uuid
language plpgsql set search_path = public as $$
declare
  v uuid;
  v_hs text := case when p_status = 'confirmed' then 'agreed' else 'proposed' end;
begin
  insert into bookings (owner_id, sitter_id, start_date, end_date, status, responded_at)
  values (p_owner, p_sitter, (p_drop at time zone app_timezone())::date,
    (p_pick at time zone app_timezone())::date, p_status,
    case when p_status = 'confirmed' then p_drop - interval '7 days' end)
  returning id into v;
  insert into booking_pets (booking_id, pet_id, care_range)
  select v, x, tstzrange(p_drop, p_pick, '[)') from unnest(p_pets) x;
  insert into booking_slots (booking_id, pet_id, day, slot)
  select v, x, (p_drop at time zone app_timezone())::date, 'morning' from unnest(p_pets) x;
  insert into booking_handoffs (booking_id, kind, scheduled_at, within_sitter_hours, status, proposed_by, completed_at)
  values (v, 'drop_off', p_drop, true, v_hs, p_owner, case when p_received then p_drop end),
         (v, 'pick_up', p_pick, true, v_hs, p_owner, null);
  return v;
end;
$$;

-- Stand-in for the Meet & Greet RPCs (3B.9): mark a first-time pair's meeting done / skipped
-- so the sitter can accept (D44).
create function public._t_meet(p_booking uuid, p_status text default 'done') returns void
language sql security definer set search_path = public as $$
  update bookings set meet_greet_status = p_status where id = p_booking
$$;

grant execute on function public._t_put(text, uuid), public._t_get(text), public._t_as(uuid, text),
  public._t_ok(boolean, text), public._t_meet(uuid, text) to authenticated, anon;

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

update public.owner_profiles set home_address = '1 Owner Ave' where id = '00000000-0000-4000-8000-0000000000a1';
update public.sitter_profiles set home_address = '100 Example St' where id = '00000000-0000-4000-8000-0000000000b1';

-- Permission fixtures:
--   current:       Mina has Bori + Mochi right now.
--   future:        Jun has Coco next week.
--   requested:     Nara has an unanswered request for Mochi in 40 days.
--   just_finished: Jun returned Toto 1 hour ago (inside the 2 h wrap-up).
--   finished:      Sora had Coco last week.
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
  v_id uuid;
begin
  perform _t_put('current', _t_booking(jisoo, mina, array[bori, mochi],
    now() - interval '1 day', now() + interval '1 day', 'confirmed'));
  perform _t_put('future', _t_booking(hana, jun, array[coco],
    now() + interval '7 days', now() + interval '8 days', 'confirmed'));
  perform _t_put('requested', _t_booking(jisoo, nara, array[mochi],
    now() + interval '40 days', now() + interval '41 days', 'requested'));
  perform _t_put('just_finished', _t_booking(hana, jun, array[toto],
    now() - interval '2 days', now() - interval '1 hour', 'confirmed', true));
  perform _t_put('finished', _t_booking(hana, sora, array[coco],
    now() - interval '6 days', now() - interval '5 days', 'confirmed', true));

  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose) values
    (bori, mina, 'smoke/bori', 'image', 'feed'),
    (mochi, mina, 'smoke/mochi', 'image', 'feed'),
    (coco, jun, 'smoke/coco', 'image', 'feed'),
    (toto, jun, 'smoke/toto', 'image', 'feed');
  perform _t_put('media_bori', (select id from public.media where cloudinary_public_id = 'smoke/bori'));
  perform _t_put('media_coco', (select id from public.media where cloudinary_public_id = 'smoke/coco'));
  perform _t_put('media_toto', (select id from public.media where cloudinary_public_id = 'smoke/toto'));

  insert into public.care_tasks (pet_id, type, title, scheduled_time)
  values (bori, 'feeding', 'Breakfast', '08:00')
  returning id into v_id;
  perform _t_put('task_bori', v_id);

  insert into public.daily_reports (pet_id, sitter_id, report_date, body)
  values (bori, mina, app_today(), 'Draft');
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
  hana constant uuid := '00000000-0000-4000-8000-0000000000a2';
  mina constant uuid := '00000000-0000-4000-8000-0000000000b1';
  jun constant uuid := '00000000-0000-4000-8000-0000000000b2';
  sora constant uuid := '00000000-0000-4000-8000-0000000000b3';
  nara constant uuid := '00000000-0000-4000-8000-0000000000b4';
  bori constant uuid := '00000000-0000-4000-8000-0000000000c1';
  mochi constant uuid := '00000000-0000-4000-8000-0000000000c2';
  coco constant uuid := '00000000-0000-4000-8000-0000000000c3';
  toto constant uuid := '00000000-0000-4000-8000-0000000000c4';
  n int;
  v_err text;
  r record;
begin
  -- Sitter with a pending request only (Nara → Mochi)
  perform _t_as(nara);
  select count(*) into n from public.pets where id = bori;
  perform _t_ok(n = 0, 'sitter without booking cannot see pet');
  select count(*) into n from public.pets where id = mochi;
  perform _t_ok(n = 1, 'requested sitter can see the pet profile');
  select count(*) into n from public.media where pet_id = mochi;
  perform _t_ok(n = 0, 'requested sitter cannot see the pet''s media');
  select count(*) into n from public.owner_profiles where id = jisoo;
  perform _t_ok(n = 0, 'requested-only sitter cannot see owner profile');
  select count(*) into n from public.profiles where id = jisoo;
  perform _t_ok(n = 1, 'requested sitter sees the owner''s display name');
  select * into r from get_booking_pets(_t_get('requested'));
  perform _t_ok(r.name = 'Mochi' and r.species = 'cat', 'get_booking_pets returns the requested pets');

  -- Sitter with a confirmed booking next week and one that ended 1 h ago (Jun)
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
  perform _t_ok(is_sitter_of(toto) and is_on_duty_for(toto), 'sitter keeps access for 2 h after pick-up');
  insert into public.feed_posts (pet_id, sitter_id, media_id) values (toto, jun, _t_get('media_toto'));
  perform _t_ok(true, 'sitter can post within the 2 h wrap-up after pick-up');
  begin
    perform complete_handoff(_t_get('future'), 'drop_off');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'handoff_too_early', 'Received is not allowed days before drop-off');
  begin
    perform complete_handoff(_t_get('future'), 'pick_up');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'drop_off_not_completed', 'Returned requires Received first');

  -- Sitter whose booking ended last week (Sora → Coco)
  perform _t_as(sora);
  select count(*) into n from public.pets where id = coco;
  perform _t_ok(n = 0, 'sitter loses pet access after the booking ends');
  select count(*) into n from public.owner_profiles where id = hana;
  perform _t_ok(n = 0, 'sitter loses owner contacts 24 h after pick-up');
  select count(*) into n from public.profiles where id = hana;
  perform _t_ok(n = 1, 'past sitter still sees the owner''s display name');
  begin
    perform get_handoff_details(_t_get('finished'));
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'booking_finished', 'addresses are hidden after the booking ends');
  perform _t_ok((select count(*) from get_booking_pets(_t_get('finished'))) = 1,
    'past booking still lists its pets');

  -- Sitter currently caring for Bori + Mochi (Mina)
  perform _t_as(mina);
  insert into public.feed_posts (pet_id, sitter_id, media_id) values (bori, mina, _t_get('media_bori'));
  perform _t_ok(true, 'on-duty sitter can post');
  select count(*) into n from public.owner_profiles where id = jisoo;
  perform _t_ok(n = 1, 'confirmed sitter can see owner profile');
  perform _t_ok(in_care_window(bori, now()), 'in_care_window true during care');
  perform _t_ok(not in_care_window(bori, now() - interval '2 days'), 'in_care_window false before drop-off');
  perform _t_ok((select home_address from get_my_sitter_profile()) = '100 Example St',
    'sitter reads own home_address via get_my_sitter_profile');
  begin
    update public.sitter_profiles set default_hours = '{"morning":["8am","noon"]}' where id = mina;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', 'malformed default_hours is rejected');
  perform complete_handoff(_t_get('current'), 'drop_off');
  perform _t_as(null);
  perform _t_ok((select title from public.notifications where user_id = jisoo and type = 'pet_dropped_off')
      = 'Bori and Mochi arrived at Mina''s 🏠',
    'A: Received → owner notified');
  perform _t_as(mina);
  begin
    perform cancel_booking(_t_get('current'), 'Something came up');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'booking_in_progress', 'cannot cancel after the pets are received');
  perform complete_handoff(_t_get('current'), 'pick_up');
  perform _t_as(null);
  perform _t_ok((select title from public.notifications where user_id = jisoo and type = 'pet_picked_up')
      = 'Bori and Mochi are on the way home 👋',
    'Returned → owner notified');

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
  begin
    perform propose_handoff(_t_get('current'), 'drop_off', now() + interval '1 hour');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'handoff_completed', 'a received drop-off cannot be changed');
  begin
    perform sitter_remaining(mina, app_today(), 'morning');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'internal helpers are not callable by clients');
  begin
    perform request_booking(mina, array[coco], now() + interval '60 days', 'sitter_home', null,
      now() + interval '61 days', 'sitter_home', null, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_owner', 'owner cannot book someone else''s pet');
  begin
    perform request_booking(hana, array[bori], now() + interval '60 days', 'sitter_home', null,
      now() + interval '61 days', 'sitter_home', null, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_a_sitter', 'booking an owner as sitter is rejected');
  begin
    perform request_booking(mina, array[bori], now() - interval '1 hour', 'sitter_home', null,
      now() + interval '1 day', 'sitter_home', null, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_window', 'drop-off in the past is rejected');
  perform _t_as(hana);
  begin
    perform cancel_booking(_t_get('just_finished'), null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'booking_in_progress', 'cannot cancel a booking after its pick-up time');

  -- updated_at is maintained by trigger
  perform _t_as(null);
  alter table public.profiles disable trigger profiles_set_updated_at;
  update public.profiles set updated_at = '2000-01-01' where id = jisoo;
  alter table public.profiles enable trigger profiles_set_updated_at;
  perform _t_as(jisoo);
  update public.profiles set display_name = 'Jisoo K.' where id = jisoo;
  perform _t_as(null);
  perform _t_ok((select updated_at > '2001-01-01' from public.profiles where id = jisoo),
    'updated_at is refreshed on update');
  update public.profiles set display_name = 'Jisoo' where id = jisoo;

  -- Species care rules (D23)
  perform _t_as(jisoo);
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

  -- Anonymous visitors
  perform _t_as(null, 'anon');
  select count(*) into n from public.pets;
  perform _t_ok(n = 0, 'anon sees no pets');
  begin
    perform get_sitter_schedule(mina, '2030-01-01', '2030-01-02');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'anon cannot call RPCs');

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
  perform _t_ok((select count(*) from public.notifications where user_id in (jisoo, hana)
      and type not in ('pet_dropped_off', 'pet_picked_up')) = 0,
    'G: opening a schedule sends no owner notifications');

  -- A: in-hours drop-off & pick-up at sitter's home → request → accept → confirmed
  perform _t_as(jisoo);
  v_a := request_booking(mina, array[bori, mochi],
    local_ts(d, '09:30'), 'sitter_home', null,
    local_ts(d + 3, '17:00'), 'sitter_home', null, 'First trip');
  perform _t_put('A', v_a);
  perform _t_ok((select count(*) from public.booking_slots where booking_id = v_a) = 22,
    'A: 2 pets × 11 slots');
  perform _t_ok((select count(*) from public.booking_pets where booking_id = v_a and active) = 2,
    'A: 2 pets on the booking');
  perform _t_ok((select start_date = d and end_date = d + 3 from public.bookings where id = v_a),
    'A: booking dates follow drop-off / pick-up');
  perform _t_ok((select count(*) from public.booking_handoffs
      where booking_id = v_a and status = 'proposed' and within_sitter_hours) = 2,
    'A: two in-hours handoff proposals');
  perform _t_ok((select service_type = 'boarding' and meet_greet_status = 'required'
      from public.bookings where id = v_a),
    'A: boarding by default; first stay together needs a Meet & Greet');
  perform _t_as(mina);
  begin
    perform respond_booking(v_a, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'meet_greet_required', 'A: sitter cannot accept a first-time pair before meeting');
  perform _t_meet(v_a);
  perform respond_booking(v_a, true, 'See you!');
  perform _t_as(null);
  perform _t_ok((select status from public.bookings where id = v_a) = 'confirmed', 'A: booking confirmed');
  perform _t_ok((select count(*) from public.booking_handoffs where booking_id = v_a and status = 'agreed') = 2,
    'A: both handoffs agreed');
  perform _t_ok((select count(*) from public.notifications where user_id = jisoo and type = 'booking_confirmed') = 1,
    'A: owner gets one booking_confirmed');
  perform _t_ok((select count(*) from public.notifications where user_id = mina and type = 'booking_requested') = 1,
    'A: sitter got booking_requested');

  -- B + H: capacity 3 at day d morning; two requests race for the last spot
  perform _t_as(hana);
  v_b := request_booking(mina, array[coco], local_ts(d, '09:00'), 'sitter_home', null,
    local_ts(d + 1, '17:00'), 'sitter_home', null, null);
  v_h := request_booking(mina, array[toto], local_ts(d, '09:00'), 'sitter_home', null,
    local_ts(d + 1, '17:00'), 'sitter_home', null, null);
  perform _t_meet(v_b);
  perform _t_meet(v_h);
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

  -- Capacity guard: lowering max_pets or removing an open slot below confirmed pets fails
  perform _t_as(mina);
  begin
    insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
    values (mina, 'open', d, d, 'morning', '08:00', '12:00', 2);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'overlaps_confirmed_booking', 'newer open row with fewer spots than booked fails');
  begin
    delete from public.sitter_availability where sitter_id = mina and kind = 'open' and slot = 'morning';
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'overlaps_confirmed_booking', 'removing a booked open slot fails');
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (mina, 'open', d + 15, d + 15, 'morning', '09:00', '12:00', 1);
  select * into r from get_sitter_schedule(mina, d + 15, d + 15) s where s.slot = 'morning';
  perform _t_ok(r.starts_at = '09:00' and r.remaining = 1, 'the newest open row sets hours and spots');

  -- C: early-flight drop-off at 07:00, before Jun's Morning (09:00) → negotiated to 08:30
  perform _t_as(jisoo);
  v_a := request_booking(jun, array[bori], local_ts(d + 10, '07:00'), 'sitter_home', null,
    local_ts(d + 10, '16:00'), 'sitter_home', null, null);
  perform _t_meet(v_a);
  perform _t_ok((select within_sitter_hours from public.booking_handoffs
      where booking_id = v_a and kind = 'drop_off' and status = 'proposed') = false,
    'C: 07:00 drop-off is stored as a custom time (outside Jun''s hours)');
  perform _t_ok((select count(*) from public.booking_slots where booking_id = v_a) = 2
      and (select start_date from public.bookings where id = v_a) = d + 10,
    'C: the 1 h before Jun''s hours does not claim the previous night');
  begin
    perform request_booking(jun, array[mochi], local_ts(d + 11, '07:00'), 'sitter_home', null,
      local_ts(d + 11, '08:00'), 'sitter_home', null, null);
    v_err := null;
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform _t_ok(v_err = 'sitter_unavailable' and v_detail = 'no_open_slot',
    'C: a stay entirely outside the sitter''s slots is rejected');
  perform _t_as(jun);
  perform propose_handoff(v_a, 'drop_off', local_ts(d + 10, '08:30'));
  begin
    perform respond_booking(v_a, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'handoff_pending', 'C: sitter cannot accept while own counter-offer is pending');
  perform _t_as(jisoo);
  perform propose_handoff(v_a, 'drop_off', local_ts(d + 10, '08:00'));
  perform _t_as(jun);
  v_h := propose_handoff(v_a, 'drop_off', local_ts(d + 10, '08:30'));
  perform _t_as(jisoo);
  perform respond_handoff(v_h, true);
  perform _t_as(jun);
  perform respond_booking(v_a, true);
  perform _t_as(null);
  perform _t_ok((select status from public.bookings where id = v_a) = 'confirmed', 'C: booking confirmed');
  perform _t_ok((select scheduled_at from public.booking_handoffs
      where booking_id = v_a and kind = 'drop_off' and status = 'agreed') = local_ts(d + 10, '08:30'),
    'C: agreed drop-off is 08:30');
  perform _t_ok((select count(*) from public.booking_handoffs
      where booking_id = v_a and kind = 'drop_off' and status = 'superseded') = 3,
    'C: three superseded proposals');

  -- C″: owner declines sitter's counter-offer before confirmation → request ends
  perform _t_as(hana);
  v_a := request_booking(jun, array[coco], local_ts(d + 12, '10:00'), 'sitter_home', null,
    local_ts(d + 12, '15:00'), 'sitter_home', null, null);
  perform _t_ok((select meet_greet_status from public.bookings where id = v_a) = 'not_needed',
    'C″: a pair that already had a stay (Hana ↔ Jun) skips the Meet & Greet');
  perform _t_as(jun);
  v_h := propose_handoff(v_a, 'pick_up', local_ts(d + 12, '14:00'));
  perform _t_as(hana);
  perform respond_handoff(v_h, false);
  perform _t_as(null);
  perform _t_ok((select status from public.bookings where id = v_a) = 'cancelled', 'C″: booking cancelled');
  perform _t_ok(not exists (select 1 from public.booking_pets where booking_id = v_a and active),
    'C″: pets released');
  perform _t_ok(not exists (select 1 from public.booking_handoffs where booking_id = v_a and status = 'proposed'),
    'C″: no open proposals left');
  perform _t_ok((select count(*) from public.notifications where user_id = jun and type = 'booking_cancelled') = 1,
    'C″: sitter notified');

  -- D: confirmed booking, owner moves pick-up 17:00 → 20:00
  v_a := _t_get('A');
  perform _t_as(jisoo);
  v_h := propose_handoff(v_a, 'pick_up', local_ts(d + 3, '20:00'));
  begin
    perform respond_handoff(v_h, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', 'D: proposer cannot accept own proposal');
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
  perform _t_ok((select count(*) from public.booking_slots where booking_id = v_a) = 24,
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
  perform _t_ok((select count(*) from public.notifications where user_id = jisoo and type = 'handoff_declined') = 1,
    'D″: owner notified of the decline');

  -- D′: pick-up at the owner's home; a time-only counter-offer keeps the place;
  --     addresses only via get_handoff_details, only for the booking parties
  perform _t_as(jisoo);
  begin
    perform propose_handoff(v_a, 'pick_up', local_ts(d + 3, '20:00'), 'other');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'location_note_required', 'D′: "Somewhere else" needs a place note');
  perform propose_handoff(v_a, 'pick_up', local_ts(d + 3, '20:00'), 'owner_home');
  perform _t_as(mina);
  v_h := propose_handoff(v_a, 'pick_up', local_ts(d + 3, '19:30'));
  perform _t_ok((select location_type from public.booking_handoffs where id = v_h) = 'owner_home',
    'D′: time-only counter-offer keeps the proposed place');
  perform _t_as(jisoo);
  perform respond_handoff(v_h, true);
  perform _t_ok((select address from get_handoff_details(v_a) where kind = 'drop_off') = '100 Example St',
    'D′: owner sees sitter address for the confirmed booking');
  perform _t_as(mina);
  perform _t_ok((select address from get_handoff_details(v_a) where kind = 'pick_up') = '1 Owner Ave',
    'D′: sitter sees owner address for an owner_home pick-up');
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
  perform _t_ok(not exists (select 1 from public.booking_pets where booking_id = v_a and active),
    'E: cancelled booking releases the pets');
  perform _t_ok((select body from public.notifications where user_id = jisoo and type = 'booking_cancelled')
      like 'Mina can''t take Bori and Mochi on %. Find a new sitter.',
    'E: owner told to find a new sitter');
  perform _t_as(jisoo);
  select * into r from search_sitters(local_ts(d, '09:30'), local_ts(d + 3, '19:30'), 2) limit 1;
  perform _t_ok(r.sitter_id = sora and r.covered_slots = r.total_slots, 'E: fully available sitter ranks first');
  select * into r from search_sitters(local_ts(d, '09:30'), local_ts(d + 3, '19:30'), 2) s where s.sitter_id = jun;
  perform _t_ok(r.covered_slots < r.total_slots, 'E: sitter without overnights shows as partly available');
  v_b := request_booking(sora, array[bori, mochi], local_ts(d, '09:30'), 'sitter_home', null,
    local_ts(d + 3, '19:30'), 'owner_home', null, null, v_a);
  perform _t_meet(v_b, 'skipped');
  perform _t_as(sora);
  perform respond_booking(v_b, true);
  perform _t_as(null);
  perform _t_ok((select status = 'confirmed' and rebooked_from = v_a from public.bookings where id = v_b),
    'E: rebooked with another sitter');

  -- F: Coco with Mina 09:00–12:00, then Jun takes over at 12:00 (same pet & day)
  perform _t_as(hana);
  v_a := request_booking(mina, array[coco], local_ts(d + 14, '09:00'), 'sitter_home', null,
    local_ts(d + 14, '12:00'), 'other', 'Jun picks up at Mina''s', null);
  v_b := request_booking(jun, array[coco], local_ts(d + 14, '12:00'), 'other', 'Mina''s place',
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
  perform _t_ok(v_err = 'pet_already_booked', 'F: a third sitter for the same hours is rejected');
  -- Overlapping stays are caught by time, even when the two sitters' slot names differ
  perform request_booking(mina, array[toto], local_ts(d + 16, '12:00'), 'sitter_home', null,
    local_ts(d + 16, '17:00'), 'sitter_home', null, null);
  begin
    perform request_booking(jun, array[toto], local_ts(d + 16, '09:00'), 'sitter_home', null,
      local_ts(d + 16, '13:00'), 'sitter_home', null, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'pet_already_booked', 'F: overlapping stays at two sitters are rejected');
  perform _t_as(null);
  perform _t_ok((select count(*) from public.bookings where id in (v_a, v_b) and status = 'confirmed') = 2,
    'F: split day with two sitters confirmed');
  insert into public.daily_reports (pet_id, sitter_id, report_date, body)
  values (coco, mina, d + 14, 'Morning report'), (coco, jun, d + 14, 'Afternoon report');
  perform _t_ok(true, 'F: one daily report per sitter for the same day');
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking options (004, phase-03b 3B.0): service type, sitter services, Meet & Greet
-- state, meeting spots, media purposes. Runs after A–H (Jisoo ↔ Mina met in A).
-- ---------------------------------------------------------------------------

do $$
declare
  jisoo constant uuid := '00000000-0000-4000-8000-0000000000a1';
  mina constant uuid := '00000000-0000-4000-8000-0000000000b1';
  sora constant uuid := '00000000-0000-4000-8000-0000000000b3';
  bori constant uuid := '00000000-0000-4000-8000-0000000000c1';
  mochi constant uuid := '00000000-0000-4000-8000-0000000000c2';
  d constant date := app_today() + 30;
  v_a uuid;
  v_err text;
  n int;
  r record;
begin
  -- House sitting needs the sitter to offer it; both handoffs move to the owner's home
  perform _t_as(jisoo);
  begin
    perform request_booking(mina, array[bori], local_ts(d + 18, '09:00'), 'sitter_home', null,
      local_ts(d + 18, '11:00'), 'sitter_home', null, null, null, 'house_sitting');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'service_not_offered', '3B.0: sitters offer boarding only by default');
  begin
    perform request_booking(mina, array[bori], local_ts(d + 18, '09:00'), 'sitter_home', null,
      local_ts(d + 18, '11:00'), 'sitter_home', null, null, null, 'dog_walking');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_service', '3B.0: unknown service type is rejected');

  perform _t_as(mina);
  begin
    update public.sitter_profiles set services = '{}' where id = mina;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: a sitter must offer at least one service');
  begin
    update public.sitter_profiles set services = '{boarding,dog_walking}' where id = mina;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: services are boarding / house_sitting only');
  update public.sitter_profiles set services = '{boarding,house_sitting}' where id = mina;

  perform _t_as(jisoo);
  v_a := request_booking(mina, array[bori], local_ts(d + 18, '09:00'), 'sitter_home', null,
    local_ts(d + 18, '11:00'), 'other', 'Trinity Bellwoods', null, null, 'house_sitting');
  perform _t_as(null);
  perform _t_ok((select service_type from public.bookings where id = v_a) = 'house_sitting',
    '3B.0: house sitting booking stored');
  perform _t_ok((select count(*) from public.booking_handoffs
      where booking_id = v_a and location_type = 'owner_home' and location_note is null) = 2,
    '3B.0: house sitting fixes both handoffs to the owner''s home');
  perform _t_ok((select meet_greet_status from public.bookings where id = v_a) = 'not_needed',
    '3B.0: a pair whose Meet & Greet was done (even on a cancelled booking) does not meet again');

  -- A skipped Meet & Greet is not a meeting: Jisoo ↔ Sora are still first-time. Declining works.
  perform _t_as(jisoo);
  v_a := request_booking(sora, array[mochi], local_ts(d + 19, '09:00'), 'sitter_home', null,
    local_ts(d + 19, '11:00'), 'sitter_home', null, null);
  perform _t_ok((select meet_greet_status from public.bookings where id = v_a) = 'required',
    '3B.0: after a skipped Meet & Greet the pair still has not met');
  perform _t_as(sora);
  perform respond_booking(v_a, false, 'Fully booked that week');
  perform _t_as(null);
  perform _t_ok((select status from public.bookings where id = v_a) = 'declined',
    '3B.0: sitter can decline before the Meet & Greet');

  -- Search results carry the sitter's services
  perform _t_as(jisoo);
  select * into r from search_sitters(local_ts(d + 20, '09:00'), local_ts(d + 20, '11:00'), 1) s
  where s.sitter_id = mina;
  perform _t_ok(r.services = '{boarding,house_sitting}', '3B.0: search_sitters returns services');
  select * into r from list_my_sitters() s where s.sitter_id = sora;
  perform _t_ok(r.services = '{boarding}', '3B.0: list_my_sitters returns services');

  -- Preferred meeting spots: ≤ 3 labels of ≤ 60 chars; sitter spots are not in the public list
  update public.owner_profiles set meet_spots = '{"Trinity Bellwoods — north gate"}' where id = jisoo;
  perform _t_ok((select meet_spots from public.owner_profiles where id = jisoo)
      = '{"Trinity Bellwoods — north gate"}', '3B.0: owner saves a meeting spot');
  begin
    update public.owner_profiles set meet_spots = '{a,b,c,d}' where id = jisoo;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: at most 3 meeting spots');
  begin
    update public.owner_profiles set meet_spots = array[repeat('x', 61)] where id = jisoo;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: meeting spot label is at most 60 characters');
  begin
    update public.owner_profiles set meet_spots = '{" "}' where id = jisoo;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: blank meeting spot is rejected');

  perform _t_as(mina);
  update public.sitter_profiles set meet_spots = '{"Christie Pits — east entrance"}' where id = mina;
  perform _t_ok((select meet_spots from get_my_sitter_profile()) = '{"Christie Pits — east entrance"}',
    '3B.0: sitter reads own meeting spots');
  perform _t_as(jisoo);
  perform _t_ok((select services from public.sitter_profiles where id = mina) = '{boarding,house_sitting}',
    '3B.0: owners can read sitter services');
  begin
    select count(*) into n from (select meet_spots from public.sitter_profiles) s;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '3B.0: sitter meeting spots are not in the public sitter list');

  -- Media purposes for the daily report (07) and handoff photo check (06B)
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose) values
    (bori, mina, 'smoke/bori-report', 'image', 'report'),
    (bori, mina, 'smoke/bori-handoff', 'image', 'handoff');
  begin
    insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (bori, mina, 'smoke/bori-other', 'image', 'selfie');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: media purpose is still checked');

  -- The new request_booking signature is not open to anon (plain timestamps: local_ts is
  -- not granted to anon either, and would fail first)
  perform _t_as(null, 'anon');
  begin
    perform request_booking(mina, array[bori], now() + interval '60 days', 'sitter_home', null,
      now() + interval '61 days', 'sitter_home', null, null, null, 'boarding');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '3B.0: anon cannot call request_booking');
  perform _t_as(null);
end;
$$;

rollback;
