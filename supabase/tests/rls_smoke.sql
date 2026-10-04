-- PawNote RLS + booking smoke test (Phase 02 DoD 2)
--
-- Run after all migrations (001–007) in the Supabase SQL Editor (as postgres), or locally with
-- tests/supabase_stub.sql first (see supabase/README.md). Everything runs in one transaction
-- and is rolled back, so no data is left behind.
-- Success = the script finishes without error ("PASS: ..." notices for each check).
-- Failure = "FAIL: <check>" error.
--
-- Cast (all fictional): owners Chloe (dog Max, cat Mochi) and Joy (dogs Coco, Toto);
-- sitters Lucy (08–12 / 12–18 / 18–08, 3 pets), Paul (09–13 / 13–17, 2 pets),
-- Allen (08–12 / 12–18 / 18–08, 3 pets), Nora (no schedule).
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
  ('00000000-0000-4000-8000-0000000000a1', 'chloe@example.test', '{"role":"owner","display_name":"Chloe"}'),
  ('00000000-0000-4000-8000-0000000000a2', 'joy@example.test', '{"role":"owner","display_name":"Joy"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'lucy@example.test', '{"role":"sitter","display_name":"Lucy"}'),
  ('00000000-0000-4000-8000-0000000000b2', 'paul@example.test', '{"role":"sitter","display_name":"Paul"}'),
  ('00000000-0000-4000-8000-0000000000b3', 'allen@example.test', '{"role":"sitter","display_name":"Allen"}'),
  ('00000000-0000-4000-8000-0000000000b4', 'nora@example.test', '{"role":"sitter"}');

insert into public.pets (id, owner_id, species, name) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'dog', 'Max'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a1', 'cat', 'Mochi'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000a2', 'dog', 'Coco'),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000a2', 'dog', 'Toto');

update public.owner_profiles set home_address = '1 Owner Ave' where id = '00000000-0000-4000-8000-0000000000a1';
update public.sitter_profiles set home_address = '100 Example St' where id = '00000000-0000-4000-8000-0000000000b1';

-- Permission fixtures:
--   current:       Lucy has Max + Mochi right now.
--   future:        Paul has Coco next week.
--   requested:     Nora has an unanswered request for Mochi in 40 days.
--   just_finished: Paul returned Toto 1 hour ago (inside the 2 h wrap-up).
--   finished:      Allen had Coco last week.
do $$
declare
  chloe constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  lucy constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  allen constant uuid := '00000000-0000-4000-8000-0000000000b3';
  nora constant uuid := '00000000-0000-4000-8000-0000000000b4';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  mochi constant uuid := '00000000-0000-4000-8000-0000000000c2';
  coco constant uuid := '00000000-0000-4000-8000-0000000000c3';
  toto constant uuid := '00000000-0000-4000-8000-0000000000c4';
  v_id uuid;
begin
  perform _t_put('current', _t_booking(chloe, lucy, array[max, mochi],
    now() - interval '1 day', now() + interval '1 day', 'confirmed'));
  perform _t_put('future', _t_booking(joy, paul, array[coco],
    now() + interval '7 days', now() + interval '8 days', 'confirmed'));
  perform _t_put('requested', _t_booking(chloe, nora, array[mochi],
    now() + interval '40 days', now() + interval '41 days', 'requested'));
  perform _t_put('just_finished', _t_booking(joy, paul, array[toto],
    now() - interval '2 days', now() - interval '1 hour', 'confirmed', true));
  perform _t_put('finished', _t_booking(joy, allen, array[coco],
    now() - interval '6 days', now() - interval '5 days', 'confirmed', true));

  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose) values
    (max, lucy, 'smoke/max', 'image', 'feed'),
    (mochi, lucy, 'smoke/mochi', 'image', 'feed'),
    (coco, paul, 'smoke/coco', 'image', 'feed'),
    (toto, paul, 'smoke/toto', 'image', 'feed');
  perform _t_put('media_bori', (select id from public.media where cloudinary_public_id = 'smoke/max'));
  perform _t_put('media_coco', (select id from public.media where cloudinary_public_id = 'smoke/coco'));
  perform _t_put('media_toto', (select id from public.media where cloudinary_public_id = 'smoke/toto'));

  insert into public.care_tasks (pet_id, type, title, scheduled_time)
  values (max, 'feeding', 'Breakfast', '08:00')
  returning id into v_id;
  perform _t_put('task_bori', v_id);

  insert into public.daily_reports (pet_id, sitter_id, report_date, body)
  values (max, lucy, app_today(), 'Draft');
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
  perform _t_ok((select display_name from public.profiles where id = '00000000-0000-4000-8000-0000000000b4') = 'nora',
    'display_name falls back to email prefix');
  perform _t_ok(exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'),
    'notifications is in the realtime publication');
  perform _t_ok(exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feed_posts'),
    '5.7: feed_posts is in the realtime publication (owner refetch on delete)');
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

do $$
declare
  chloe constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  lucy constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  allen constant uuid := '00000000-0000-4000-8000-0000000000b3';
  nora constant uuid := '00000000-0000-4000-8000-0000000000b4';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  mochi constant uuid := '00000000-0000-4000-8000-0000000000c2';
  coco constant uuid := '00000000-0000-4000-8000-0000000000c3';
  toto constant uuid := '00000000-0000-4000-8000-0000000000c4';
  n int;
  v_err text;
  r record;
begin
  -- Sitter with a pending request only (Nora → Mochi)
  perform _t_as(nora);
  select count(*) into n from public.pets where id = max;
  perform _t_ok(n = 0, 'sitter without booking cannot see pet');
  select count(*) into n from public.pets where id = mochi;
  perform _t_ok(n = 1, 'requested sitter can see the pet profile');
  select count(*) into n from public.media where pet_id = mochi;
  perform _t_ok(n = 0, 'requested sitter cannot see the pet''s media');
  select count(*) into n from public.owner_profiles where id = chloe;
  perform _t_ok(n = 0, 'requested-only sitter cannot see owner profile');
  select count(*) into n from public.profiles where id = chloe;
  perform _t_ok(n = 1, 'requested sitter sees the owner''s display name');
  select * into r from get_booking_pets(_t_get('requested'));
  perform _t_ok(r.name = 'Mochi' and r.species = 'cat', 'get_booking_pets returns the requested pets');

  -- Sitter with a confirmed booking next week and one that ended 1 h ago (Paul)
  perform _t_as(paul);
  select count(*) into n from public.pets where id = coco;
  perform _t_ok(n = 1, 'sitter with upcoming booking can see pet');
  begin
    insert into public.feed_posts (pet_id, sitter_id, media_id) values (coco, paul, _t_get('media_coco'));
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'sitter cannot post before drop-off');
  begin
    insert into public.feed_posts (pet_id, sitter_id, media_id) values (max, paul, _t_get('media_bori'));
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'other sitter cannot post for a pet in care');
  perform _t_ok(is_sitter_of(toto) and is_on_duty_for(toto), 'sitter keeps access for 2 h after pick-up');
  insert into public.feed_posts (pet_id, sitter_id, media_id) values (toto, paul, _t_get('media_toto'));
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

  -- Sitter whose booking ended last week (Allen → Coco)
  perform _t_as(allen);
  select count(*) into n from public.pets where id = coco;
  perform _t_ok(n = 0, 'sitter loses pet access after the booking ends');
  select count(*) into n from public.owner_profiles where id = joy;
  perform _t_ok(n = 0, 'sitter loses owner contacts 24 h after pick-up');
  select count(*) into n from public.profiles where id = joy;
  perform _t_ok(n = 1, 'past sitter still sees the owner''s display name');
  begin
    perform get_handoff_details(_t_get('finished'));
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_paid', '3C.4: unpaid past booking still gated by not_paid');
  perform _t_as(null);
  update public.bookings set paid_at = now() - interval '7 days' where id = _t_get('finished');
  perform _t_as(allen);
  begin
    perform get_handoff_details(_t_get('finished'));
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'booking_finished', 'addresses are hidden after the booking ends');
  perform _t_ok((select count(*) from get_booking_pets(_t_get('finished'))) = 1,
    'past booking still lists its pets');

  -- Sitter currently caring for Max + Mochi (Lucy)
  perform _t_as(lucy);
  insert into public.feed_posts (pet_id, sitter_id, media_id) values (max, lucy, _t_get('media_bori'));
  perform _t_ok(true, 'on-duty sitter can post');
  perform _t_as(null);
  perform _t_ok(
    (select title from public.notifications n
     join public.feed_posts fp on fp.id = n.ref_id
     where n.user_id = chloe and n.type = 'feed_post' and fp.pet_id = max
     order by n.created_at desc limit 1) = 'New photo of Max 📸',
    '5.3: feed post → owner feed_post notification');
  perform _t_as(lucy);
  select count(*) into n from public.owner_profiles where id = chloe;
  perform _t_ok(n = 1, 'confirmed sitter can see owner profile');
  perform _t_ok(in_care_window(max, now()), 'in_care_window true during care');
  perform _t_ok(not in_care_window(max, now() - interval '2 days'), 'in_care_window false before drop-off');
  perform _t_ok((select home_address from get_my_sitter_profile()) = '100 Example St',
    'sitter reads own home_address via get_my_sitter_profile');
  begin
    update public.sitter_profiles set default_hours = '{"morning":["8am","noon"]}' where id = lucy;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', 'malformed default_hours is rejected');
  perform complete_handoff(_t_get('current'), 'drop_off');
  perform _t_as(null);
  perform _t_ok((select title from public.notifications where user_id = chloe and type = 'pet_dropped_off')
      = 'Max and Mochi arrived at Lucy''s 🏠',
    'A: Received → owner notified');
  perform _t_as(lucy);
  begin
    perform cancel_booking(_t_get('current'), 'Something came up');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'booking_in_progress', 'cannot cancel after the pets are received');
  perform complete_handoff(_t_get('current'), 'pick_up');
  perform _t_as(null);
  perform _t_ok((select title from public.notifications where user_id = chloe and type = 'pet_picked_up')
      = 'Max and Mochi are on the way home 👋',
    'Returned → owner notified');

  -- Owner
  perform _t_as(chloe);
  begin
    insert into public.task_logs (task_id, pet_id, due_at) values (_t_get('task_bori'), max, now());
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'owner cannot insert task_logs directly');
  select count(*) into n from public.daily_reports where pet_id = max;
  perform _t_ok(n = 0, 'owner cannot see draft daily report');
  begin
    perform home_address from public.sitter_profiles where id = lucy;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'owner cannot read sitter home_address');
  select count(*) into n from public.sitter_profiles where id = lucy and bio is null;
  perform _t_ok(n = 1, 'owner can read public sitter profile columns');
  begin
    update public.profiles set role = 'sitter' where id = chloe;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'user cannot change own role');
  begin
    update public.pets set species = 'cat' where id = max;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'owner cannot change pet species');
  update public.pets set weight_kg = 7.5 where id = max;
  perform _t_ok(true, 'owner can update pet details');
  begin
    insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot)
    values (chloe, 'blocked', app_today(), app_today(), 'morning');
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
    perform sitter_remaining(lucy, app_today(), 'morning');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'internal helpers are not callable by clients');
  begin
    perform request_booking(lucy, array[coco], now() + interval '60 days', 'sitter_home', null,
      now() + interval '61 days', 'sitter_home', null, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_owner', 'owner cannot book someone else''s pet');
  begin
    perform request_booking(joy, array[max], now() + interval '60 days', 'sitter_home', null,
      now() + interval '61 days', 'sitter_home', null, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_a_sitter', 'booking an owner as sitter is rejected');
  begin
    perform request_booking(lucy, array[max], now() - interval '1 hour', 'sitter_home', null,
      now() + interval '1 day', 'sitter_home', null, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_window', 'drop-off in the past is rejected');
  perform _t_as(joy);
  begin
    perform cancel_booking(_t_get('just_finished'), null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'booking_in_progress', 'cannot cancel a booking after its pick-up time');

  -- updated_at is maintained by trigger
  perform _t_as(null);
  alter table public.profiles disable trigger profiles_set_updated_at;
  update public.profiles set updated_at = '2000-01-01' where id = chloe;
  alter table public.profiles enable trigger profiles_set_updated_at;
  perform _t_as(chloe);
  update public.profiles set display_name = 'Chloe K.' where id = chloe;
  perform _t_as(null);
  perform _t_ok((select updated_at > '2001-01-01' from public.profiles where id = chloe),
    'updated_at is refreshed on update');
  update public.profiles set display_name = 'Chloe' where id = chloe;

  -- Species care rules (D23)
  perform _t_as(chloe);
  begin
    insert into public.care_tasks (pet_id, type, title, scheduled_time) values (mochi, 'walk', 'Walk', '09:00');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'task_type_not_allowed_for_species', 'cat cannot get a walk task');
  begin
    insert into public.care_tasks (pet_id, type, title, scheduled_time) values (max, 'litter', 'Litter', '09:00');
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
    perform get_sitter_schedule(lucy, '2030-01-01', '2030-01-02');
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
  chloe constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  lucy constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  allen constant uuid := '00000000-0000-4000-8000-0000000000b3';
  nora constant uuid := '00000000-0000-4000-8000-0000000000b4';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
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
  perform _t_as(lucy);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (lucy, 'open', d - 1, d + 20, 'morning', '08:00', '12:00', 3),
         (lucy, 'open', d - 1, d + 20, 'afternoon', '12:00', '18:00', 3),
         (lucy, 'open', d - 1, d + 20, 'overnight', '18:00', '08:00', 3);
  perform _t_as(paul);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (paul, 'open', d - 1, d + 20, 'morning', '09:00', '13:00', 2),
         (paul, 'open', d - 1, d + 20, 'afternoon', '13:00', '17:00', 2);
  perform _t_as(allen);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (allen, 'open', d - 1, d + 20, 'morning', '08:00', '12:00', 3),
         (allen, 'open', d - 1, d + 20, 'afternoon', '12:00', '18:00', 3),
         (allen, 'open', d - 1, d + 20, 'overnight', '18:00', '08:00', 3);

  -- G: opening a schedule notifies nobody
  perform _t_as(null);
  perform _t_ok((select count(*) from public.notifications where user_id in (chloe, joy)
      and type not in ('pet_dropped_off', 'pet_picked_up', 'feed_post')) = 0,
    'G: opening a schedule sends no owner notifications');

  -- A: in-hours drop-off & pick-up at sitter's home → request → accept → confirmed
  perform _t_as(chloe);
  v_a := request_booking(lucy, array[max, mochi],
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
  -- Lucy received Max + Mochi in the 'current' fixture (permissions block), so they have met.
  perform _t_ok((select service_type = 'boarding' and meet_greet_status = 'not_needed'
      from public.bookings where id = v_a),
    'A: boarding by default; a pair that already had a drop-off skips the Meet & Greet');
  perform _t_as(lucy);
  perform respond_booking(v_a, true, 'See you!');
  perform _t_as(null);
  perform _t_ok((select status from public.bookings where id = v_a) = 'confirmed', 'A: booking confirmed');
  perform _t_ok((select count(*) from public.booking_handoffs where booking_id = v_a and status = 'agreed') = 2,
    'A: both handoffs agreed');
  perform _t_ok((select count(*) from public.notifications where user_id = chloe and type = 'booking_confirmed') = 1,
    'A: owner gets one booking_confirmed');
  perform _t_ok((select count(*) from public.notifications where user_id = lucy and type = 'booking_requested') = 1,
    'A: sitter got booking_requested');

  -- B + H: capacity 3 at day d morning; two requests race for the last spot
  perform _t_as(joy);
  v_b := request_booking(lucy, array[coco], local_ts(d, '09:00'), 'sitter_home', null,
    local_ts(d + 1, '17:00'), 'sitter_home', null, null);
  v_h := request_booking(lucy, array[toto], local_ts(d, '09:00'), 'sitter_home', null,
    local_ts(d + 1, '17:00'), 'sitter_home', null, null);
  -- Joy ↔ Lucy have never met: Accept waits for the Meet & Greet (D44).
  perform _t_ok((select count(*) from public.bookings
      where id in (v_b, v_h) and meet_greet_status = 'required') = 2,
    'B: first stay together needs a Meet & Greet');
  perform _t_as(lucy);
  begin
    perform respond_booking(v_b, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'meet_greet_required', 'B: sitter cannot accept a first-time pair before meeting');
  perform _t_meet(v_b);
  perform _t_meet(v_h);
  perform respond_booking(v_b, true);
  begin
    perform respond_booking(v_h, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'sitter_unavailable', 'H: second acceptance for the last spot fails');
  perform _t_as(joy);
  select * into r from get_sitter_schedule(lucy, d, d) s where s.slot = 'morning';
  perform _t_ok(r.state = 'full' and r.remaining = 0, 'B: schedule shows the slot as full');
  perform cancel_booking(v_h, 'Found another plan');
  begin
    perform request_booking(lucy, array[toto], local_ts(d, '09:00'), 'sitter_home', null,
      local_ts(d + 1, '17:00'), 'sitter_home', null, null);
    v_err := null;
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform _t_ok(v_err = 'sitter_unavailable' and v_detail like '%morning%',
    'B: new request into a full slot is rejected with the slot in detail');

  -- Capacity guard: lowering max_pets or removing an open slot below confirmed pets fails
  perform _t_as(lucy);
  begin
    insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
    values (lucy, 'open', d, d, 'morning', '08:00', '12:00', 2);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'overlaps_confirmed_booking', 'newer open row with fewer spots than booked fails');
  begin
    delete from public.sitter_availability where sitter_id = lucy and kind = 'open' and slot = 'morning';
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'overlaps_confirmed_booking', 'removing a booked open slot fails');
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (lucy, 'open', d + 15, d + 15, 'morning', '09:00', '12:00', 1);
  select * into r from get_sitter_schedule(lucy, d + 15, d + 15) s where s.slot = 'morning';
  perform _t_ok(r.starts_at = '09:00' and r.remaining = 1, 'the newest open row sets hours and spots');

  -- C: early-flight drop-off at 07:00, before Paul's Morning (09:00) → negotiated to 08:30
  perform _t_as(chloe);
  v_a := request_booking(paul, array[max], local_ts(d + 10, '07:00'), 'sitter_home', null,
    local_ts(d + 10, '16:00'), 'sitter_home', null, null);
  perform _t_meet(v_a);
  perform _t_ok((select within_sitter_hours from public.booking_handoffs
      where booking_id = v_a and kind = 'drop_off' and status = 'proposed') = false,
    'C: 07:00 drop-off is stored as a custom time (outside Paul''s hours)');
  perform _t_ok((select count(*) from public.booking_slots where booking_id = v_a) = 2
      and (select start_date from public.bookings where id = v_a) = d + 10,
    'C: the 1 h before Paul''s hours does not claim the previous night');
  begin
    perform request_booking(paul, array[mochi], local_ts(d + 11, '07:00'), 'sitter_home', null,
      local_ts(d + 11, '08:00'), 'sitter_home', null, null);
    v_err := null;
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform _t_ok(v_err = 'sitter_unavailable' and v_detail = 'no_open_slot',
    'C: a stay entirely outside the sitter''s slots is rejected');
  perform _t_as(paul);
  perform propose_handoff(v_a, 'drop_off', local_ts(d + 10, '08:30'));
  begin
    perform respond_booking(v_a, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'handoff_pending', 'C: sitter cannot accept while own counter-offer is pending');
  perform _t_as(chloe);
  perform propose_handoff(v_a, 'drop_off', local_ts(d + 10, '08:00'));
  perform _t_as(paul);
  v_h := propose_handoff(v_a, 'drop_off', local_ts(d + 10, '08:30'));
  perform _t_as(chloe);
  perform respond_handoff(v_h, true);
  perform _t_as(paul);
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
  perform _t_as(joy);
  v_a := request_booking(paul, array[coco], local_ts(d + 12, '10:00'), 'sitter_home', null,
    local_ts(d + 12, '15:00'), 'sitter_home', null, null);
  perform _t_ok((select meet_greet_status from public.bookings where id = v_a) = 'not_needed',
    'C″: a pair that already had a stay (Joy ↔ Paul) skips the Meet & Greet');
  perform _t_as(paul);
  v_h := propose_handoff(v_a, 'pick_up', local_ts(d + 12, '14:00'));
  perform _t_as(joy);
  perform respond_handoff(v_h, false);
  perform _t_as(null);
  perform _t_ok((select status from public.bookings where id = v_a) = 'cancelled', 'C″: booking cancelled');
  perform _t_ok(not exists (select 1 from public.booking_pets where booking_id = v_a and active),
    'C″: pets released');
  perform _t_ok(not exists (select 1 from public.booking_handoffs where booking_id = v_a and status = 'proposed'),
    'C″: no open proposals left');
  perform _t_ok((select count(*) from public.notifications where user_id = paul and type = 'booking_cancelled') = 1,
    'C″: sitter notified');

  -- D: confirmed booking, owner moves pick-up 17:00 → 20:00
  v_a := _t_get('A');
  perform _t_as(chloe);
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
  perform _t_as(lucy);
  perform respond_handoff(v_h, true);
  perform _t_as(null);
  perform _t_ok((select scheduled_at from public.booking_handoffs
      where booking_id = v_a and kind = 'pick_up' and status = 'agreed') = local_ts(d + 3, '20:00'),
    'D: new pick-up agreed');
  perform _t_ok((select count(*) from public.booking_slots where booking_id = v_a) = 24,
    'D: slots recalculated (overnight added)');
  perform _t_ok((select count(*) from public.notifications where user_id = chloe and type = 'handoff_agreed') = 1,
    'D: owner notified of agreement');

  -- D″: sitter declines a change after confirmation → booking unchanged
  perform _t_as(chloe);
  v_h := propose_handoff(v_a, 'pick_up', local_ts(d + 3, '21:00'));
  perform _t_as(lucy);
  perform respond_handoff(v_h, false);
  perform _t_as(null);
  perform _t_ok((select status from public.bookings where id = v_a) = 'confirmed'
      and (select scheduled_at from public.booking_handoffs
        where booking_id = v_a and kind = 'pick_up' and status = 'agreed') = local_ts(d + 3, '20:00'),
    'D″: declined change keeps the agreed pick-up');
  perform _t_ok((select count(*) from public.notifications where user_id = chloe and type = 'handoff_declined') = 1,
    'D″: owner notified of the decline');

  -- D′: pick-up at the owner's home; a time-only counter-offer keeps the place;
  --     addresses only via get_handoff_details, only for the booking parties
  perform _t_as(chloe);
  begin
    perform propose_handoff(v_a, 'pick_up', local_ts(d + 3, '20:00'), 'other');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'location_note_required', 'D′: "Somewhere else" needs a place note');
  perform propose_handoff(v_a, 'pick_up', local_ts(d + 3, '20:00'), 'owner_home');
  perform _t_as(lucy);
  v_h := propose_handoff(v_a, 'pick_up', local_ts(d + 3, '19:30'));
  perform _t_ok((select location_type from public.booking_handoffs where id = v_h) = 'owner_home',
    'D′: time-only counter-offer keeps the proposed place');
  perform _t_as(chloe);
  perform respond_handoff(v_h, true);
  perform _t_as(null);
  update public.bookings set paid_at = now() where id = v_a;
  perform _t_as(chloe);
  perform _t_ok((select address from get_handoff_details(v_a) where kind = 'drop_off') = '100 Example St',
    'D′: owner sees sitter address for the confirmed booking');
  perform _t_as(lucy);
  perform _t_ok((select address from get_handoff_details(v_a) where kind = 'pick_up') = '1 Owner Ave',
    'D′: sitter sees owner address for an owner_home pick-up');
  perform _t_as(nora);
  begin
    perform get_handoff_details(v_a);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', 'D′: outsider cannot read handoff details');

  -- E: sitter blocks a day overlapping a confirmed booking → must cancel first → owner rebooks
  perform _t_as(lucy);
  begin
    insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot)
    values (lucy, 'blocked', d + 2, d + 2, 'morning');
    v_err := null;
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform _t_ok(v_err = 'overlaps_confirmed_booking' and v_detail like '%' || v_a || '%',
    'E: block over a confirmed booking is rejected with the booking id');
  perform cancel_booking(v_a, 'Personal schedule');
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot)
  values (lucy, 'blocked', d + 2, d + 2, 'morning');
  perform _t_as(null);
  perform _t_ok(not exists (select 1 from public.booking_pets where booking_id = v_a and active),
    'E: cancelled booking releases the pets');
  perform _t_ok((select body from public.notifications where user_id = chloe and type = 'booking_cancelled')
      like 'Lucy can''t take Max and Mochi on %. Find a new sitter.',
    'E: owner told to find a new sitter');
  perform _t_as(chloe);
  select * into r from search_sitters(local_ts(d, '09:30'), local_ts(d + 3, '19:30'), 2) limit 1;
  perform _t_ok(r.sitter_id = allen and r.covered_slots = r.total_slots, 'E: fully available sitter ranks first');
  select * into r from search_sitters(local_ts(d, '09:30'), local_ts(d + 3, '19:30'), 2) s where s.sitter_id = paul;
  perform _t_ok(r.covered_slots < r.total_slots, 'E: sitter without overnights shows as partly available');
  v_b := request_booking(allen, array[max, mochi], local_ts(d, '09:30'), 'sitter_home', null,
    local_ts(d + 3, '19:30'), 'owner_home', null, null, v_a);
  perform _t_meet(v_b, 'skipped');
  perform _t_as(allen);
  perform respond_booking(v_b, true);
  perform _t_as(null);
  perform _t_ok((select status = 'confirmed' and rebooked_from = v_a from public.bookings where id = v_b),
    'E: rebooked with another sitter');

  -- F: Coco with Lucy 09:00–12:00, then Paul takes over at 12:00 (same pet & day)
  perform _t_as(joy);
  v_a := request_booking(lucy, array[coco], local_ts(d + 14, '09:00'), 'sitter_home', null,
    local_ts(d + 14, '12:00'), 'other', 'Paul picks up at Lucy''s', null);
  v_b := request_booking(paul, array[coco], local_ts(d + 14, '12:00'), 'other', 'Lucy''s place',
    local_ts(d + 14, '17:00'), 'sitter_home', null, null);
  perform _t_ok((select meet_greet_status from public.bookings where id = v_a) = 'not_needed',
    'F: a pair whose Meet & Greet was done (in B) does not meet again');
  perform _t_as(lucy);
  perform respond_booking(v_a, true);
  perform _t_as(paul);
  perform respond_booking(v_b, true);
  perform _t_as(joy);
  begin
    perform request_booking(allen, array[coco], local_ts(d + 14, '13:00'), 'sitter_home', null,
      local_ts(d + 14, '17:00'), 'sitter_home', null, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'pet_already_booked', 'F: a third sitter for the same hours is rejected');
  -- Overlapping stays are caught by time, even when the two sitters' slot names differ
  perform request_booking(lucy, array[toto], local_ts(d + 16, '12:00'), 'sitter_home', null,
    local_ts(d + 16, '17:00'), 'sitter_home', null, null);
  begin
    perform request_booking(paul, array[toto], local_ts(d + 16, '09:00'), 'sitter_home', null,
      local_ts(d + 16, '13:00'), 'sitter_home', null, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'pet_already_booked', 'F: overlapping stays at two sitters are rejected');
  perform _t_as(null);
  perform _t_ok((select count(*) from public.bookings where id in (v_a, v_b) and status = 'confirmed') = 2,
    'F: split day with two sitters confirmed');
  insert into public.daily_reports (pet_id, sitter_id, report_date, body)
  values (coco, lucy, d + 14, 'Morning report'), (coco, paul, d + 14, 'Afternoon report');
  perform _t_ok(true, 'F: one daily report per sitter for the same day');
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking options (004, phase-03b 3B.0): service type, sitter services, Meet & Greet
-- state, meeting spots, media purposes. Runs after A–H (Chloe ↔ Lucy met in the
-- 'current' fixture).
-- ---------------------------------------------------------------------------

do $$
declare
  chloe constant uuid := '00000000-0000-4000-8000-0000000000a1';
  lucy constant uuid := '00000000-0000-4000-8000-0000000000b1';
  allen constant uuid := '00000000-0000-4000-8000-0000000000b3';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  mochi constant uuid := '00000000-0000-4000-8000-0000000000c2';
  d constant date := app_today() + 30;
  v_a uuid;
  v_err text;
  n int;
  r record;
begin
  -- House sitting needs the sitter to offer it; both handoffs move to the owner's home
  perform _t_as(chloe);
  begin
    perform request_booking(lucy, array[max], local_ts(d + 18, '09:00'), 'sitter_home', null,
      local_ts(d + 18, '11:00'), 'sitter_home', null, null, null, 'house_sitting');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'service_not_offered', '3B.0: sitters offer boarding only by default');
  begin
    perform request_booking(lucy, array[max], local_ts(d + 18, '09:00'), 'sitter_home', null,
      local_ts(d + 18, '11:00'), 'sitter_home', null, null, null, 'dog_walking');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_service', '3B.0: unknown service type is rejected');

  perform _t_as(lucy);
  begin
    update public.sitter_profiles set services = '{}' where id = lucy;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: a sitter must offer at least one service');
  begin
    update public.sitter_profiles set services = '{boarding,dog_walking}' where id = lucy;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: services are boarding / house_sitting only');
  update public.sitter_profiles set services = '{boarding,house_sitting}' where id = lucy;

  perform _t_as(chloe);
  v_a := request_booking(lucy, array[max], local_ts(d + 18, '09:00'), 'sitter_home', null,
    local_ts(d + 18, '11:00'), 'other', 'Trinity Bellwoods', null, null, 'house_sitting');
  perform _t_as(null);
  perform _t_ok((select service_type from public.bookings where id = v_a) = 'house_sitting',
    '3B.0: house sitting booking stored');
  perform _t_ok((select count(*) from public.booking_handoffs
      where booking_id = v_a and location_type = 'owner_home' and location_note is null) = 2,
    '3B.0: house sitting fixes both handoffs to the owner''s home');
  perform _t_ok((select meet_greet_status from public.bookings where id = v_a) = 'not_needed',
    '3B.0: a pair that already met does not meet again');

  -- A skipped Meet & Greet is not a meeting: Chloe ↔ Allen are still first-time. Declining works.
  perform _t_as(chloe);
  v_a := request_booking(allen, array[mochi], local_ts(d + 19, '09:00'), 'sitter_home', null,
    local_ts(d + 19, '11:00'), 'sitter_home', null, null);
  perform _t_ok((select meet_greet_status from public.bookings where id = v_a) = 'required',
    '3B.0: after a skipped Meet & Greet the pair still has not met');
  perform _t_as(allen);
  perform respond_booking(v_a, false, 'Fully booked that week');
  perform _t_as(null);
  perform _t_ok((select status from public.bookings where id = v_a) = 'declined',
    '3B.0: sitter can decline before the Meet & Greet');

  -- Search results carry the sitter's services
  perform _t_as(chloe);
  select * into r from search_sitters(local_ts(d + 20, '09:00'), local_ts(d + 20, '11:00'), 1) s
  where s.sitter_id = lucy;
  perform _t_ok(r.services = '{boarding,house_sitting}', '3B.0: search_sitters returns services');
  select * into r from list_my_sitters() s where s.sitter_id = allen;
  perform _t_ok(r.services = '{boarding}', '3B.0: list_my_sitters returns services');

  -- Preferred meeting spots: ≤ 3 labels of ≤ 60 chars; sitter spots are not in the public list
  update public.owner_profiles set meet_spots = '{"Trinity Bellwoods — north gate"}' where id = chloe;
  perform _t_ok((select meet_spots from public.owner_profiles where id = chloe)
      = '{"Trinity Bellwoods — north gate"}', '3B.0: owner saves a meeting spot');
  begin
    update public.owner_profiles set meet_spots = '{a,b,c,d}' where id = chloe;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: at most 3 meeting spots');
  begin
    update public.owner_profiles set meet_spots = array[repeat('x', 61)] where id = chloe;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: meeting spot label is at most 60 characters');
  begin
    update public.owner_profiles set meet_spots = '{" "}' where id = chloe;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: blank meeting spot is rejected');

  perform _t_as(lucy);
  update public.sitter_profiles set meet_spots = '{"Christie Pits — east entrance"}' where id = lucy;
  perform _t_ok((select meet_spots from get_my_sitter_profile()) = '{"Christie Pits — east entrance"}',
    '3B.0: sitter reads own meeting spots');
  perform _t_as(chloe);
  perform _t_ok((select services from public.sitter_profiles where id = lucy) = '{boarding,house_sitting}',
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
    (max, lucy, 'smoke/max-report', 'image', 'report'),
    (max, lucy, 'smoke/max-handoff', 'image', 'handoff');
  begin
    insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (max, lucy, 'smoke/max-other', 'image', 'selfie');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: media purpose is still checked');

  -- The new request_booking signature is not open to anon (plain timestamps: local_ts is
  -- not granted to anon either, and would fail first)
  perform _t_as(null, 'anon');
  begin
    perform request_booking(lucy, array[max], now() + interval '60 days', 'sitter_home', null,
      now() + interval '61 days', 'sitter_home', null, null, null, 'boarding');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '3B.0: anon cannot call request_booking');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Meet & Greet (005, phase-03b 3B.9, D44): propose / respond / done, skip accepted /
-- declined. First-time pairs: Chloe ↔ Nora (the 'requested' fixture) and Joy ↔ Nora.
-- ---------------------------------------------------------------------------

do $$
declare
  chloe constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  lucy constant uuid := '00000000-0000-4000-8000-0000000000b1';
  nora constant uuid := '00000000-0000-4000-8000-0000000000b4';
  coco constant uuid := '00000000-0000-4000-8000-0000000000c3';
  toto constant uuid := '00000000-0000-4000-8000-0000000000c4';
  v_a uuid := _t_get('requested');
  v_b uuid;
  v_err text;
  r record;
begin
  perform _t_meet(v_a, 'required');

  -- Proposals are checked
  perform _t_as(chloe);
  begin
    perform propose_meet_greet(v_a, 'in_person', now() + interval '1 day', '  ');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'place_required', '3B.9: in person needs a place');
  begin
    perform propose_meet_greet(v_a, 'video', now() - interval '1 hour');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_window', '3B.9: a Meet & Greet in the past is rejected');
  begin
    perform propose_meet_greet(v_a, 'phone', now() + interval '1 day');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_mode', '3B.9: only in person or video');

  -- In person: propose → the other side declines → back to required
  perform propose_meet_greet(v_a, 'in_person', now() + interval '1 day', 'Trinity Bellwoods — north gate');
  perform _t_as(null);
  perform _t_ok((select meet_greet_status = 'proposed' and meet_greet_place = 'Trinity Bellwoods — north gate'
      and meet_greet_proposed_by = chloe from public.bookings where id = v_a),
    '3B.9: in-person proposal stored');
  perform _t_ok(exists (select 1 from public.notifications where user_id = nora and type = 'meet_greet_proposed'
      and title like 'Chloe suggested meeting at Trinity Bellwoods — north gate on %'),
    '3B.9: the other side gets meet_greet_proposed');
  perform _t_as(chloe);
  begin
    perform respond_meet_greet(v_a, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', '3B.9: the proposer cannot accept their own Meet & Greet');
  perform _t_as(lucy);
  begin
    perform respond_meet_greet(v_a, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', '3B.9: an outsider cannot answer');
  perform _t_as(nora);
  perform respond_meet_greet(v_a, false);
  perform _t_as(null);
  perform _t_ok((select meet_greet_status = 'required' and meet_greet_mode is null and meet_greet_at is null
      from public.bookings where id = v_a),
    '3B.9: a declined Meet & Greet goes back to required');
  perform _t_ok(exists (select 1 from public.notifications where user_id = chloe and type = 'meet_greet_declined'),
    '3B.9: the proposer hears about the decline');

  -- Video: Nora proposes, Chloe agrees, done only once the time has come, then Accept works
  perform _t_as(nora);
  perform propose_meet_greet(v_a, 'video', now() + interval '2 days');
  perform _t_as(chloe);
  perform respond_meet_greet(v_a, true);
  perform _t_as(null);
  perform _t_ok((select meet_greet_status = 'agreed' and meet_greet_mode = 'video' and meet_greet_place is null
      from public.bookings where id = v_a),
    '3B.9: video Meet & Greet agreed');
  perform _t_ok(exists (select 1 from public.notifications where user_id = nora and type = 'meet_greet_agreed'),
    '3B.9: the proposer gets meet_greet_agreed');
  perform _t_as(nora);
  begin
    perform respond_booking(v_a, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'meet_greet_required', '3B.9: Accept still waits while the Meet & Greet is only agreed');
  begin
    perform complete_meet_greet(v_a);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'meet_greet_not_yet', '3B.9: Done only after the meeting time');
  perform _t_as(null);
  update public.bookings set meet_greet_at = now() - interval '1 hour' where id = v_a;
  perform _t_as(chloe);
  perform complete_meet_greet(v_a);
  perform _t_as(lucy);
  begin
    select * into r from get_meet_greet_options(v_a);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', '3B.9: meeting spots are only for the two parties');
  perform _t_as(nora);
  select * into r from get_meet_greet_options(v_a);
  perform _t_ok(r.owner_name = 'Chloe' and r.owner_spots = '{"Trinity Bellwoods — north gate"}'
      and r.sitter_spots = '{}',
    '3B.9: both sides'' meeting spots for the In person sheet');
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  select nora, 'open', app_today() + 38, app_today() + 43, s, '00:00', '23:59', 3
  from unnest(array['morning', 'afternoon']::care_slot[]) s;
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (nora, 'open', app_today() + 38, app_today() + 43, 'overnight', '18:00', '08:00', 3);
  perform respond_booking(v_a, true);
  perform _t_as(null);
  perform _t_ok((select status = 'confirmed' and meet_greet_status = 'done' from public.bookings where id = v_a),
    '3B.9: after the Meet & Greet is done the sitter can accept');

  -- Skip accepted: Joy asks, Nora continues without meeting
  v_b := _t_booking(joy, nora, array[toto], now() + interval '50 days', now() + interval '51 days', 'requested');
  perform _t_meet(v_b, 'required');
  perform _t_as(joy);
  perform request_skip_meet_greet(v_b);
  begin
    perform respond_skip_meet_greet(v_b, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', '3B.9: the one who asked to skip cannot answer it');
  perform _t_as(nora);
  perform respond_skip_meet_greet(v_b, true);
  perform _t_as(null);
  perform _t_ok((select meet_greet_status = 'skipped' and status = 'requested' from public.bookings where id = v_b),
    '3B.9: skip accepted → skipped, the request goes on');
  perform _t_ok(exists (select 1 from public.notifications where user_id = nora and type = 'meet_greet_skip_requested')
      and exists (select 1 from public.notifications where user_id = joy and type = 'meet_greet_skipped'),
    '3B.9: skip request and answer are notified');

  -- Skip declined: the booking is cancelled and the owner is told to find a new sitter
  v_b := _t_booking(joy, nora, array[coco], now() + interval '60 days', now() + interval '61 days', 'requested');
  perform _t_meet(v_b, 'required');
  perform _t_as(joy);
  perform request_skip_meet_greet(v_b);
  perform _t_as(nora);
  perform respond_skip_meet_greet(v_b, false);
  perform _t_as(null);
  perform _t_ok((select status = 'cancelled' and cancel_reason = 'meet_greet_declined' and cancelled_by = nora
      from public.bookings where id = v_b),
    '3B.9: declining the skip cancels the booking');
  perform _t_ok(not exists (select 1 from public.booking_pets where booking_id = v_b and active),
    '3B.9: the cancelled booking frees the pet');
  perform _t_ok(exists (select 1 from public.notifications where user_id = joy and type = 'booking_cancelled'
      -- The Nora fixture has no display_name, so the signup trigger used the email prefix.
      and title = 'nora would like to meet first, so this booking was cancelled'),
    '3B.9: the owner is told the sitter wants to meet first');
  perform _t_as(joy);
  begin
    perform propose_meet_greet(v_b, 'video', now() + interval '1 day');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_status', '3B.9: no Meet & Greet on a cancelled booking');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Quote (006, phase-03c 3C.1, D29): rates + Ontario holidays + quote_booking
-- ---------------------------------------------------------------------------

do $$
declare
  chloe constant uuid := '00000000-0000-4000-8000-0000000000a1';
  lucy constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  q jsonb;
  v_err text;
  -- Goal example: boarding Oct 9 07:30 → Oct 12 17:00 Toronto, 2 pets, Thanksgiving Oct 12.
  v_drop timestamptz := ('2026-10-09 07:30:00'::timestamp at time zone app_timezone());
  v_pick timestamptz := ('2026-10-12 17:00:00'::timestamp at time zone app_timezone());
  v_hs_drop timestamptz := ('2026-10-05 09:00:00'::timestamp at time zone app_timezone());
  v_hs_pick timestamptz := ('2026-10-08 17:00:00'::timestamp at time zone app_timezone());
  v_day_drop timestamptz := ('2026-10-10 08:00:00'::timestamp at time zone app_timezone());
  v_day_pick timestamptz := ('2026-10-10 18:00:00'::timestamp at time zone app_timezone());
begin
  -- Lucy: Boarding $55 · House sitting $70 · Daycare $35 · +50% · +25% (Goal)
  perform _t_as(null);
  update public.sitter_profiles
  set services = array['boarding', 'house_sitting']
  where id = lucy;

  perform _t_as(lucy);
  insert into public.sitter_rates (
    sitter_id, boarding_nightly, house_sitting_nightly, daycare_daily,
    extra_pet_pct, holiday_pct
  ) values (lucy, 55.00, 70.00, 35.00, 50, 25);

  -- Boarding · 2 pets · Thanksgiving (phase-03c Goal): $268.13 CAD
  perform _t_as(chloe);
  q := quote_booking(lucy, 'boarding', v_drop, v_pick, 2);
  perform _t_ok(
    (q->>'nights')::int = 3
    and (q->>'days')::int = 3
    and (q->>'unit_price')::numeric = 55.00
    and (q->>'base')::numeric = 165.00
    and (q->>'extra_pets')::numeric = 82.50
    and (q->>'holiday_surcharge')::numeric = 20.63
    and (q->>'total')::numeric = 268.13
    and q->>'currency' = 'CAD'
    and q->'holiday_days' = '[{"day":"2026-10-12","name":"Thanksgiving Day"}]'::jsonb,
    '3C.1: boarding 2 pets + Thanksgiving = $268.13');

  -- House sitting · 1 pet · no holiday in Oct 5–8
  q := quote_booking(lucy, 'house_sitting', v_hs_drop, v_hs_pick, 1);
  perform _t_ok(
    (q->>'nights')::int = 3
    and (q->>'unit_price')::numeric = 70.00
    and (q->>'base')::numeric = 210.00
    and (q->>'extra_pets')::numeric = 0
    and (q->>'holiday_surcharge')::numeric = 0
    and (q->>'total')::numeric = 210.00
    and q->'holiday_days' = '[]'::jsonb,
    '3C.1: house sitting 1 pet = $210.00');

  -- Daycare · same day · 2 pets
  q := quote_booking(lucy, 'daycare', v_day_drop, v_day_pick, 2);
  perform _t_ok(
    (q->>'nights')::int = 0
    and (q->>'days')::int = 1
    and (q->>'unit_price')::numeric = 35.00
    and (q->>'base')::numeric = 35.00
    and (q->>'extra_pets')::numeric = 17.50
    and (q->>'holiday_surcharge')::numeric = 0
    and (q->>'total')::numeric = 52.50,
    '3C.1: daycare same day 2 pets = $52.50');

  -- Paul has no rates → service_not_offered
  begin
    q := quote_booking(paul, 'boarding', v_drop, v_pick, 1);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'service_not_offered', '3C.1: no rates → service_not_offered');

  -- House sitting rate without the service in the profile is rejected on insert
  perform _t_as(null);
  update public.sitter_profiles set services = array['boarding'] where id = paul;
  perform _t_as(paul);
  begin
    insert into public.sitter_rates (sitter_id, house_sitting_nightly)
    values (paul, 60.00);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'service_not_offered', '3C.1: rates must match offered services');

  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Consents (006, phase-03c 3C.2, D30): required_consents + booking_consents RLS
-- ---------------------------------------------------------------------------

do $$
declare
  chloe constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  lucy constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  coco constant uuid := '00000000-0000-4000-8000-0000000000c3';
  v_board uuid;
  v_house uuid;
  v_kinds text[];
  v_err text;
  n int;
  v_signed_at timestamptz;
begin
  -- Boarding (sitter_home handoffs): emergency_vet, safe_return, handoff_rules, cohabitation
  v_board := _t_booking(chloe, lucy, array[max],
    now() + interval '20 days', now() + interval '23 days', 'confirmed');
  perform _t_as(chloe);
  v_kinds := required_consents(v_board);
  perform _t_ok(v_kinds = array['emergency_vet', 'safe_return', 'handoff_rules', 'cohabitation'],
    '3C.2: boarding requires 4 consents');

  insert into public.booking_consents (booking_id, kind, version, signer_id, signer_name, details)
  values (v_board, 'emergency_vet', '1', chloe, 'Chloe',
    jsonb_build_object('limit_cad', 500, 'vet_clinic_name', 'Demo Vet'));
  select signed_at into v_signed_at from public.booking_consents
    where booking_id = v_board and kind = 'emergency_vet';
  perform _t_ok(v_signed_at is not null, '3C.2: owner signature stores signed_at');

  begin
    insert into public.booking_consents (booking_id, kind, version, signer_id, signer_name)
    values (v_board, 'emergency_vet', '1', chloe, 'Chloe');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23505', '3C.2: same kind cannot be signed twice');

  begin
    update public.booking_consents set signer_name = 'Changed' where booking_id = v_board;
    get diagnostics n = row_count;
    v_err := null;
  exception when others then
    v_err := sqlstate;
    n := -1;
  end;
  perform _t_ok(n = 0 or v_err = '42501', '3C.2: signatures are read-only after signing');

  perform _t_as(lucy);
  select count(*) into n from public.booking_consents where booking_id = v_board;
  perform _t_ok(n = 1, '3C.2: sitter can read owner signatures');

  perform _t_as(paul);
  select count(*) into n from public.booking_consents where booking_id = v_board;
  perform _t_ok(n = 0, '3C.2: outsider cannot read consents');
  begin
    v_kinds := required_consents(v_board);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', '3C.2: outsider cannot call required_consents');

  -- House sitting → home_access instead of boarding-only kinds
  perform _t_as(null);
  v_house := _t_booking(joy, paul, array[coco],
    now() + interval '70 days', now() + interval '72 days', 'confirmed');
  update public.bookings set service_type = 'house_sitting' where id = v_house;
  update public.booking_handoffs set location_type = 'owner_home' where booking_id = v_house;

  perform _t_as(joy);
  v_kinds := required_consents(v_house);
  perform _t_ok(v_kinds = array['emergency_vet', 'safe_return', 'home_access'],
    '3C.2: house sitting requires home_access');

  begin
    insert into public.booking_consents (booking_id, kind, version, signer_id, signer_name)
    values (v_house, 'safe_return', '1', paul, 'Paul');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '3C.2: only the owner can sign');

  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Demo pay (006, phase-03c 3C.3, D30): pay_booking_demo — no Stripe
-- ---------------------------------------------------------------------------

do $$
declare
  chloe constant uuid := '00000000-0000-4000-8000-0000000000a1';
  lucy constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  mochi constant uuid := '00000000-0000-4000-8000-0000000000c2';
  v_pay uuid;
  v_kind text;
  v_quote jsonb;
  v_err text;
  v_detail text;
begin
  -- Confirmed boarding with Lucy rates already seeded in 3C.1
  v_pay := _t_booking(chloe, lucy, array[max, mochi],
    ('2026-10-09 07:30:00'::timestamp at time zone app_timezone()),
    ('2026-10-12 17:00:00'::timestamp at time zone app_timezone()),
    'confirmed');

  perform _t_as(chloe);
  begin
    v_quote := pay_booking_demo(v_pay);
    v_err := null;
    v_detail := null;
  exception when others then
    get stacked diagnostics v_err = message_text, v_detail = pg_exception_detail;
  end;
  perform _t_ok(v_err = 'consents_missing', '3C.3: pay without consents → consents_missing');
  perform _t_ok(v_detail like '%emergency_vet%', '3C.3: consents_missing lists the kinds');

  -- Sign every required kind
  foreach v_kind in array required_consents(v_pay) loop
    insert into public.booking_consents (booking_id, kind, version, signer_id, signer_name, details)
    values (v_pay, v_kind, '1', chloe, 'Chloe',
      case v_kind
        when 'emergency_vet' then jsonb_build_object('limit_cad', 500, 'vet_clinic_name', 'Demo Vet')
        when 'safe_return' then jsonb_build_object('receiver_name', 'Chloe')
        else '{}'::jsonb
      end);
  end loop;

  v_quote := pay_booking_demo(v_pay);
  perform _t_ok(
    (v_quote->>'total')::numeric = 268.13
    and (select paid_at is not null and price_snapshot->>'total' = '268.13' from public.bookings where id = v_pay),
    '3C.3: demo pay freezes $268.13 and sets paid_at');
  perform _t_as(null);
  perform _t_ok(exists (
      select 1 from public.notifications
      where user_id = lucy and type = 'booking_paid' and booking_id = v_pay),
    '3C.3: sitter gets booking_paid');

  perform _t_as(chloe);
  begin
    v_quote := pay_booking_demo(v_pay);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'already_paid', '3C.3: second pay → already_paid');

  perform _t_as(lucy);
  begin
    v_quote := pay_booking_demo(v_pay);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', '3C.3: sitter cannot pay');

  perform _t_as(paul);
  begin
    v_quote := pay_booking_demo(v_pay);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', '3C.3: outsider cannot pay');

  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Paid address gate (006, phase-03c 3C.4, D31)
-- ---------------------------------------------------------------------------

do $$
declare
  chloe constant uuid := '00000000-0000-4000-8000-0000000000a1';
  lucy constant uuid := '00000000-0000-4000-8000-0000000000b1';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  v_id uuid;
  r record;
  v_err text;
begin
  perform _t_as(null);
  update public.sitter_profiles
  set visitor_parking = 'Visitor spot B-12',
      lobby_notes = 'Buzz 1204',
      packing_list = array['food', 'leash']
  where id = lucy;

  v_id := _t_booking(chloe, lucy, array[max],
    now() + interval '80 days', now() + interval '83 days', 'confirmed');

  perform _t_as(chloe);
  begin
    select * into r from get_handoff_details(v_id);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_paid', '3C.4: address hidden before demo pay');

  perform _t_as(null);
  update public.bookings set paid_at = now() where id = v_id;

  perform _t_as(chloe);
  select * into r from get_handoff_details(v_id) where kind = 'drop_off';
  perform _t_ok(
    r.address = '100 Example St'
    and r.visitor_parking = 'Visitor spot B-12'
    and r.lobby_notes = 'Buzz 1204'
    and r.packing_list = array['food', 'leash'],
    '3C.4: after pay, sitter home + packing list return');

  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Home access unlock (006, phase-03c 3C.5 / I–K, D31)
-- ---------------------------------------------------------------------------

do $$
declare
  chloe constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  lucy constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  coco constant uuid := '00000000-0000-4000-8000-0000000000c3';
  v_id uuid;
  r record;
  v_err text;
  v_detail text;
  n int;
begin
  -- I: before pay — get_home_access blocked; owner can save codes privately
  perform _t_as(chloe);
  insert into public.owner_home_access (owner_id, entry_steps, lockbox_code, buzzer, fob_notes, sitter_parking)
  values (chloe, '1. Buzz 1204  2. Lockbox left of door', '0000', '#1204', 'Fob on key hook', 'Street parking OK')
  on conflict (owner_id) do update set
    entry_steps = excluded.entry_steps,
    lockbox_code = excluded.lockbox_code,
    buzzer = excluded.buzzer,
    fob_notes = excluded.fob_notes,
    sitter_parking = excluded.sitter_parking;

  perform _t_as(null);
  v_id := _t_booking(chloe, lucy, array[max],
    now() + interval '90 days', now() + interval '93 days', 'confirmed');
  update public.booking_handoffs set location_type = 'owner_home'
    where booking_id = v_id and kind = 'drop_off';

  perform _t_as(lucy);
  begin
    select * into r from get_home_access(v_id);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_paid', '3C.5 I: access hidden before pay');

  perform _t_as(null);
  update public.bookings set paid_at = now() where id = v_id;
  -- Drop-off still > 2 h away
  update public.booking_handoffs
  set scheduled_at = now() + interval '5 hours'
  where booking_id = v_id and kind = 'drop_off';
  update public.booking_handoffs
  set scheduled_at = now() + interval '3 days'
  where booking_id = v_id and kind = 'pick_up';

  -- J: T−2h before → access_locked with unlocks_at
  perform _t_as(lucy);
  begin
    select * into r from get_home_access(v_id);
    v_err := null;
    v_detail := null;
  exception when others then
    get stacked diagnostics v_err = message_text, v_detail = pg_exception_detail;
  end;
  perform _t_ok(v_err = 'access_locked' and v_detail like '%unlocks_at%',
    '3C.5 J: locked before T−2h with unlocks_at');

  perform _t_as(null);
  update public.booking_handoffs
  set scheduled_at = now() + interval '1 hour'
  where booking_id = v_id and kind = 'drop_off';

  perform _t_as(lucy);
  select * into r from get_home_access(v_id);
  perform _t_ok(r.lockbox_code = '0000' and r.buzzer = '#1204',
    '3C.5 J: codes return inside the window');
  perform _t_as(null);
  perform _t_ok((select count(*) from public.access_reveals where booking_id = v_id) = 1,
    '3C.5 J: first reveal recorded once');
  perform _t_ok((select count(*) from public.notifications
      where user_id = chloe and type = 'access_unlocked' and booking_id = v_id) = 1,
    '3C.5 J: owner notified once');

  perform _t_as(lucy);
  select * into r from get_home_access(v_id);
  perform _t_as(null);
  perform _t_ok((select count(*) from public.access_reveals where booking_id = v_id) = 1
      and (select count(*) from public.notifications
        where user_id = chloe and type = 'access_unlocked' and booking_id = v_id) = 1,
    '3C.5 J: second open does not re-notify');

  -- K: other sitter forbidden; after pick-up completed → locked_since
  perform _t_as(paul);
  begin
    select * into r from get_home_access(v_id);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'forbidden', '3C.5 K: other sitter forbidden');

  perform _t_as(chloe);
  begin
    select * into r from get_home_access(v_id);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'forbidden', '3C.5 K: owner cannot call get_home_access');

  perform _t_as(null);
  update public.booking_handoffs
  set completed_at = now() - interval '1 minute'
  where booking_id = v_id and kind = 'pick_up';

  perform _t_as(lucy);
  begin
    select * into r from get_home_access(v_id);
    v_err := null;
    v_detail := null;
  exception when others then
    get stacked diagnostics v_err = message_text, v_detail = pg_exception_detail;
  end;
  perform _t_ok(v_err = 'access_locked' and v_detail like '%locked_since%',
    '3C.5 K: locked again after pick-up completed');

  -- Paul cannot read Chloe's owner_home_access row directly
  perform _t_as(paul);
  select count(*) into n from public.owner_home_access where owner_id = chloe;
  perform _t_ok(n = 0, '3C.5 K: sitter RLS cannot read owner_home_access');

  -- 3C.7 polish: unlock notice must never echo lockbox / buzzer codes (DoD #3)
  perform _t_ok(
    not exists (
      select 1 from public.notifications n
      where n.booking_id = v_id and n.type = 'access_unlocked'
        and (coalesce(n.title, '') || ' ' || coalesce(n.body, ''))
          ~* '(0000|#1204|Buzz 1204|lockbox left)'
    ),
    '3C.7: access_unlocked notice has no entry codes');

  -- Phase 05 (5.3): feed_posts.category
  perform _t_as(lucy);
  begin
    insert into public.feed_posts (pet_id, sitter_id, media_id, category)
    values (max, lucy, _t_get('media_bori'), 'not_a_category');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '5.3: feed_posts.category check');

  -- Phase 05 (5.8): visibility + owner posts
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose) values
    (max, lucy, 'smoke/max-private', 'image', 'feed'),
    (max, chloe, 'smoke/max-owner-private', 'image', 'feed'),
    (max, chloe, 'smoke/max-owner-shared', 'image', 'feed');
  perform _t_put('m_priv', (select id from public.media where cloudinary_public_id = 'smoke/max-private'));
  perform _t_put('m_opriv', (select id from public.media where cloudinary_public_id = 'smoke/max-owner-private'));
  perform _t_put('m_oshared', (select id from public.media where cloudinary_public_id = 'smoke/max-owner-shared'));

  perform _t_as(lucy);
  insert into public.feed_posts (pet_id, sitter_id, media_id, visibility)
  values (max, lucy, _t_get('m_priv'), 'private');
  select count(*) into n from public.feed_posts where media_id = _t_get('m_priv');
  perform _t_ok(n = 1, '5.8: author sees her own private post');
  begin
    insert into public.feed_posts (pet_id, sitter_id, media_id, visibility)
    values (max, lucy, _t_get('media_bori'), 'hidden');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '5.8: visibility check');
  begin
    insert into public.feed_posts (pet_id, sitter_id, media_id)
    values (max, lucy, _t_get('m_oshared'));
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '5.8: cannot attach media someone else uploaded');
  perform _t_as(null);
  perform _t_ok(not exists (
      select 1 from public.notifications n join public.feed_posts fp on fp.id = n.ref_id
      where n.type = 'feed_post' and fp.media_id = _t_get('m_priv')),
    '5.8: private post sends no owner notification');

  perform _t_as(chloe);
  select count(*) into n from public.feed_posts where media_id = _t_get('m_priv');
  perform _t_ok(n = 0, '5.8: owner cannot see the sitter''s private post');
  select count(*) into n from public.media where id = _t_get('m_priv');
  perform _t_ok(n = 0, '5.8: owner cannot read the private post''s media row');
  insert into public.feed_posts (pet_id, sitter_id, media_id, visibility)
  values (max, null, _t_get('m_opriv'), 'private');
  insert into public.feed_posts (pet_id, sitter_id, media_id, visibility)
  values (max, null, _t_get('m_oshared'), 'shared');
  perform _t_ok(true, '5.8: owner can post for her own pet');
  perform _t_as(null);
  perform _t_ok((select count(*) from public.notifications n
      join public.feed_posts fp on fp.id = n.ref_id
      where n.type = 'feed_post' and fp.media_id = _t_get('m_oshared') and n.user_id = lucy) = 1,
    '5.9: owner''s shared post notifies the on-duty sitter');
  perform _t_ok((select count(*) from public.notifications n
      join public.feed_posts fp on fp.id = n.ref_id
      where n.type = 'feed_post' and fp.media_id = _t_get('m_oshared') and n.user_id <> lucy) = 0,
    '5.9: nobody else is notified (not the other sitter, not the owner)');
  perform _t_ok(not exists (select 1 from public.notifications n
      join public.feed_posts fp on fp.id = n.ref_id
      where n.type = 'feed_post' and fp.media_id = _t_get('m_opriv')),
    '5.9: owner''s private post notifies nobody');
  perform _t_as(chloe);
  begin
    insert into public.feed_posts (pet_id, sitter_id, media_id)
    values (max, lucy, _t_get('media_bori'));
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err in ('42501', '23514'), '5.8: owner cannot post as the sitter');
  begin
    insert into public.feed_posts (pet_id, sitter_id, media_id)
    values (coco, null, _t_get('media_coco'));
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '5.8: owner cannot post for another owner''s pet');
  delete from public.feed_posts where media_id = _t_get('media_bori');
  get diagnostics n = row_count;
  perform _t_ok(n = 0, '5.8: owner cannot delete the sitter''s post');

  perform _t_as(lucy);
  select count(*) into n from public.feed_posts where media_id = _t_get('m_opriv');
  perform _t_ok(n = 0, '5.8: sitter cannot see the owner''s private post');
  select count(*) into n from public.media where id = _t_get('m_opriv');
  perform _t_ok(n = 0, '5.8: sitter cannot read the owner''s private media row');
  select count(*) into n from public.feed_posts where media_id = _t_get('m_oshared');
  perform _t_ok(n = 1, '5.8: sitter on duty sees the owner''s shared post');
  delete from public.feed_posts where media_id = _t_get('m_oshared');
  get diagnostics n = row_count;
  perform _t_ok(n = 0, '5.8: sitter cannot delete the owner''s post');
  delete from public.feed_posts where media_id = _t_get('m_priv');
  get diagnostics n = row_count;
  perform _t_ok(n = 1, '5.8: author deletes her own post');

  -- Phase 06 (6.2): ensure_today_task_logs
  perform _t_as(chloe);
  begin
    perform ensure_today_task_logs(max);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_on_duty', '6.2: the owner cannot create task logs');
  perform _t_as(paul);
  begin
    perform ensure_today_task_logs(max);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_on_duty', '6.2: a sitter who is not on duty cannot create task logs');

  perform _t_as(chloe);
  insert into public.care_tasks (pet_id, type, title, scheduled_time, active)
  values (max, 'play', 'Paused play', '17:00', false);
  insert into public.care_tasks (pet_id, type, title, scheduled_time, repeat_daily)
  values (max, 'medication', 'One-off pill', '12:00', false)
  returning id into v_id;
  perform _t_put('task_once', v_id);

  perform _t_as(lucy);
  select count(*) into n from ensure_today_task_logs(max);
  perform _t_ok(n = 2, '6.2: logs for the active tasks only (Breakfast + one-off pill, not the paused one)');
  select count(*) into n from ensure_today_task_logs(max);
  perform _t_ok(n = 2, '6.2: calling again is idempotent');
  perform _t_ok(
    (select due_at from public.task_logs where task_id = _t_get('task_bori'))
      = local_ts(app_today(), '08:00'),
    '6.2: due_at is today at the task time in the app timezone');
  perform _t_ok(
    (select count(*) from public.task_logs where task_id = _t_get('task_once')) = 1,
    '6.2: a non-repeating task gets one log');
  perform _t_ok(
    (select count(*) from ensure_today_task_logs('00000000-0000-4000-8000-0000000000c2')) = 1,
    '6.2: each pet gets its own logs (Mochi: litter box)');

  perform _t_as(chloe);
  select count(*) into n from public.task_logs where pet_id = max;
  perform _t_ok(n = 2, '6.2: the owner reads the logs through RLS');
  -- A pet nobody has booked: only its owner reads its logs (later scenarios hand Max to
  -- different sitters, so Max is not a stable "no access" pet).
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (chloe, 'dog', 'Solo') returning id into v_id;
  insert into public.care_tasks (pet_id, type, title, scheduled_time) values (v_id, 'feeding', 'Dinner', '18:00');
  insert into public.task_logs (task_id, pet_id, due_at)
  select id, v_id, local_ts(app_today(), '18:00') from public.care_tasks where pet_id = v_id;
  perform _t_as(lucy);
  select count(*) into n from public.task_logs where pet_id = v_id;
  perform _t_ok(n = 0, '6.2: a sitter with no booking for the pet cannot read the logs');
  perform _t_as(chloe);
  select count(*) into n from public.task_logs where pet_id = v_id;
  perform _t_ok(n = 1, '6.2: the owner sees the logs of her unbooked pet');

  -- Phase 06 (6.4): complete_task_log
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
  values (max, lucy, 'smoke/proof-pill', 'image', 'task_proof');
  perform _t_put('m_proof', (select id from public.media where cloudinary_public_id = 'smoke/proof-pill'));
  perform _t_put('log_bf', (select id from public.task_logs where task_id = _t_get('task_bori')));
  perform _t_put('log_pill', (select id from public.task_logs where task_id = _t_get('task_once')));

  perform _t_as(chloe);
  begin
    perform complete_task_log(_t_get('log_bf'));
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_in_care_window', '6.4: the owner cannot complete a task');
  perform _t_as(paul);
  begin
    perform complete_task_log(_t_get('log_bf'));
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_in_care_window', '6.4: a sitter outside the care window cannot complete it');

  perform _t_as(lucy);
  begin
    perform complete_task_log(_t_get('log_bf'), _t_get('media_bori'));
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_media', '6.4: media must be a task_proof upload');
  perform _t_ok((select status from public.task_logs where id = _t_get('log_bf')) = 'pending',
    '6.4: a rejected completion leaves the log pending');

  perform complete_task_log(_t_get('log_bf'));
  perform _t_ok(
    (select status = 'done' and completed_by = lucy and completed_at is not null and media_id is null
     from public.task_logs where id = _t_get('log_bf')),
    '6.4: Mark done without a photo');
  begin
    perform complete_task_log(_t_get('log_bf'));
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'already_done', '6.4: completing twice is refused');

  perform _t_as(null);
  perform _t_ok(
    (select count(*) from public.notifications
     where user_id = chloe and type = 'task_done' and ref_id = _t_get('log_bf')
       and title like 'Max had breakfast%') = 1,
    '6.4: the owner gets a task_done notice');
  perform _t_ok(not exists (select 1 from public.feed_posts where task_log_id = _t_get('log_bf')),
    '6.4: no photo → no feed post');

  perform _t_as(lucy);
  perform complete_task_log(_t_get('log_pill'), _t_get('m_proof'));
  perform _t_as(null);
  perform _t_ok(
    (select count(*) from public.feed_posts
     where task_log_id = _t_get('log_pill') and caption_source = 'task' and visibility = 'shared'
       and media_id = _t_get('m_proof') and posted_by = lucy) = 1,
    '6.4: with a photo → a shared feed post with a task caption');
  perform _t_ok(
    (select count(*) from public.notifications where user_id = chloe and ref_id = _t_get('log_pill')
       and type = 'task_done') = 1
    and not exists (select 1 from public.notifications n join public.feed_posts fp on fp.id = n.ref_id
       where n.type = 'feed_post' and fp.task_log_id = _t_get('log_pill')),
    '6.4: task_done only — no extra feed_post notice for a task photo');
  perform _t_as(chloe);
  perform _t_ok(
    (select count(*) from public.feed_posts where task_log_id = _t_get('log_pill')) = 1,
    '6.4: the owner sees the task photo in the feed');

  perform _t_as(null);
end;
$$;

rollback;
