-- Goldito RLS + booking smoke test (Phase 02 DoD 2)
--
-- Run after all migrations (001–007) in the Supabase SQL Editor (as postgres), or locally with
-- tests/supabase_stub.sql first (see supabase/README.md). Everything runs in one transaction
-- and is rolled back, so no data is left behind.
-- Success = the script finishes without error ("PASS: ..." notices for each check).
-- Failure = "FAIL: <check>" error.
--
-- Cast (all fictional): owners Robert (dog Max, cat Mochi) and Joy (dogs Coco, Toto);
-- sitters Chloe (08–12 / 12–18 / 18–08, 3 pets), Paul (09–13 / 13–17, 2 pets),
-- Allen (08–12 / 12–18 / 18–08, 3 pets), Nora (no schedule).
-- Scenario letters match docs/plan/phases/phase-02-db.md "예시 시나리오".
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

-- Stand-in for the sitter's first yes (011l) on a fixture booking: starts the hold without the capacity check.
create function public._t_interest(p_booking uuid) returns void
language sql security definer set search_path = public as $$
  update bookings set sitter_interest_at = now(), meet_greet_due_at = now() + interval '2 days'
  where id = p_booking
$$;

-- Stand-in for the owner's "I'd like to book" (agree_to_book, 014o) on a fixture booking: the sitter's Accept then confirms.
create function public._t_agree(p_booking uuid) returns void
language sql security definer set search_path = public as $$
  update bookings set owner_agreed_at = coalesce(owner_agreed_at, now()) where id = p_booking
$$;

grant execute on function public._t_put(text, uuid), public._t_get(text), public._t_as(uuid, text),
  public._t_ok(boolean, text), public._t_meet(uuid, text), public._t_interest(uuid), public._t_agree(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fixtures (signup trigger creates profiles)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'robert@example.test', '{"role":"owner","display_name":"Robert"}'),
  ('00000000-0000-4000-8000-0000000000a2', 'joy@example.test', '{"role":"owner","display_name":"Joy"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'chloe@example.test', '{"role":"sitter","display_name":"Chloe"}'),
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
--   current:       Chloe has Max + Mochi right now.
--   future:        Paul has Coco next week.
--   requested:     Nora has an unanswered request for Mochi in 40 days.
--   just_finished: Paul returned Toto 1 hour ago (inside the 2 h wrap-up).
--   finished:      Allen had Coco last week.
do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  allen constant uuid := '00000000-0000-4000-8000-0000000000b3';
  nora constant uuid := '00000000-0000-4000-8000-0000000000b4';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  mochi constant uuid := '00000000-0000-4000-8000-0000000000c2';
  coco constant uuid := '00000000-0000-4000-8000-0000000000c3';
  toto constant uuid := '00000000-0000-4000-8000-0000000000c4';
  v_id uuid;
begin
  perform _t_put('current', _t_booking(robert, chloe, array[max, mochi],
    now() - interval '1 day', now() + interval '1 day', 'confirmed'));
  perform _t_put('future', _t_booking(joy, paul, array[coco],
    now() + interval '7 days', now() + interval '8 days', 'confirmed'));
  perform _t_put('requested', _t_booking(robert, nora, array[mochi],
    now() + interval '40 days', now() + interval '41 days', 'requested'));
  perform _t_put('just_finished', _t_booking(joy, paul, array[toto],
    now() - interval '2 days', now() - interval '1 hour', 'confirmed', true));
  perform _t_put('finished', _t_booking(joy, allen, array[coco],
    now() - interval '6 days', now() - interval '5 days', 'confirmed', true));

  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose) values
    (max, chloe, 'smoke/max', 'image', 'feed'),
    (mochi, chloe, 'smoke/mochi', 'image', 'feed'),
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
  values (max, chloe, app_today(), 'Draft');
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
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
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
  select count(*) into n from public.owner_profiles where id = robert;
  perform _t_ok(n = 0, 'requested-only sitter cannot see owner profile');
  select count(*) into n from public.profiles where id = robert;
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

  -- Sitter currently caring for Max + Mochi (Chloe)
  perform _t_as(chloe);
  insert into public.feed_posts (pet_id, sitter_id, media_id) values (max, chloe, _t_get('media_bori'));
  perform _t_ok(true, 'on-duty sitter can post');
  perform _t_as(null);
  perform _t_ok(
    (select title from public.notifications n
     join public.feed_posts fp on fp.id = n.ref_id
     where n.user_id = robert and n.type = 'feed_post' and fp.pet_id = max
     order by n.created_at desc limit 1) = 'New photo of Max 📸',
    '5.3: feed post → owner feed_post notification');
  perform _t_as(chloe);
  select count(*) into n from public.owner_profiles where id = robert;
  perform _t_ok(n = 0, 'BF.6: a confirmed sitter cannot see the owner profile before payment');
  perform _t_as(null);
  update public.bookings set paid_at = now() where id = _t_get('current');
  perform _t_as(chloe);
  select count(*) into n from public.owner_profiles where id = robert;
  perform _t_ok(n = 1, 'paid sitter can see owner profile');
  perform _t_as(null);
  update public.bookings set paid_at = null where id = _t_get('current');
  perform _t_as(chloe);
  perform _t_ok(in_care_window(max, now()), 'in_care_window true during care');
  perform _t_ok(not in_care_window(max, now() - interval '2 days'), 'in_care_window false before drop-off');
  perform _t_ok((select home_address from get_my_sitter_profile()) = '100 Example St',
    'sitter reads own home_address via get_my_sitter_profile');
  begin
    update public.sitter_profiles set default_hours = '{"morning":["8am","noon"]}' where id = chloe;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', 'malformed default_hours is rejected');
  perform complete_handoff(_t_get('current'), 'drop_off');
  perform _t_as(null);
  perform _t_ok((select title from public.notifications where user_id = robert and type = 'pet_dropped_off')
      = 'Max and Mochi arrived at Chloe''s 🏠',
    'A: Received → owner notified');
  perform _t_as(chloe);
  begin
    perform cancel_booking(_t_get('current'), 'Something came up');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'booking_in_progress', 'cannot cancel after the pets are received');
  perform complete_handoff(_t_get('current'), 'pick_up');
  perform _t_as(null);
  perform _t_ok((select title from public.notifications where user_id = robert and type = 'pet_picked_up')
      = 'Max and Mochi are home safe 🏠',
    'Returned → owner notified');

  -- Owner
  perform _t_as(robert);
  begin
    insert into public.task_logs (task_id, pet_id, due_at) values (_t_get('task_bori'), max, now());
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'owner cannot insert task_logs directly');
  select count(*) into n from public.daily_reports where pet_id = max;
  perform _t_ok(n = 0, 'owner cannot see draft daily report');
  begin
    perform home_address from public.sitter_profiles where id = chloe;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'owner cannot read sitter home_address');
  select count(*) into n from public.sitter_profiles where id = chloe and bio is null;
  perform _t_ok(n = 1, 'owner can read public sitter profile columns');
  begin
    update public.profiles set role = 'sitter' where id = robert;
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
    values (robert, 'blocked', app_today(), app_today(), 'morning');
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
    perform sitter_remaining(chloe, app_today(), 'morning');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'internal helpers are not callable by clients');
  begin
    perform request_booking(chloe, array[coco], now() + interval '60 days', 'sitter_home', null,
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
    perform request_booking(chloe, array[max], now() - interval '1 hour', 'sitter_home', null,
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
  update public.profiles set updated_at = '2000-01-01' where id = robert;
  alter table public.profiles enable trigger profiles_set_updated_at;
  perform _t_as(robert);
  update public.profiles set display_name = 'Robert K.' where id = robert;
  perform _t_as(null);
  perform _t_ok((select updated_at > '2001-01-01' from public.profiles where id = robert),
    'updated_at is refreshed on update');
  update public.profiles set display_name = 'Robert' where id = robert;

  -- Species care rules (D23)
  perform _t_as(robert);
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
    perform get_sitter_schedule(chloe, '2030-01-01', '2030-01-02');
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
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
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
  perform _t_as(chloe);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (chloe, 'open', d - 1, d + 20, 'morning', '08:00', '12:00', 3),
         (chloe, 'open', d - 1, d + 20, 'afternoon', '12:00', '18:00', 3),
         (chloe, 'open', d - 1, d + 20, 'overnight', '18:00', '08:00', 3);
  -- 011l: the default is one owner at a time; B / H below race two owners for Chloe's last spot.
  update public.sitter_profiles set accepts_multiple_owners = true where id = chloe;
  perform _t_as(paul);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (paul, 'open', d - 1, d + 20, 'morning', '09:00', '13:00', 2),
         (paul, 'open', d - 1, d + 20, 'afternoon', '13:00', '17:00', 2);
  -- 014d: a sitter is open by default, so "no overnights" means closing them.
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot)
  values (paul, 'blocked', d - 1, d + 20, 'overnight');
  perform _t_as(allen);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (allen, 'open', d - 1, d + 20, 'morning', '08:00', '12:00', 3),
         (allen, 'open', d - 1, d + 20, 'afternoon', '12:00', '18:00', 3),
         (allen, 'open', d - 1, d + 20, 'overnight', '18:00', '08:00', 3);

  -- G: opening a schedule notifies nobody
  perform _t_as(null);
  perform _t_ok((select count(*) from public.notifications where user_id in (robert, joy)
      and type not in ('pet_dropped_off', 'pet_picked_up', 'review_requested', 'feed_post')) = 0,
    'G: opening a schedule sends no owner notifications');

  -- A: in-hours drop-off & pick-up at sitter's home → request → accept → confirmed
  perform _t_as(robert);
  v_a := request_booking(chloe, array[max, mochi],
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
  -- Chloe received Max + Mochi in the 'current' fixture (permissions block), so they have met.
  perform _t_ok((select service_type = 'boarding' and meet_greet_status = 'not_needed'
      from public.bookings where id = v_a),
    'A: boarding by default; a pair that already had a drop-off skips the Meet & Greet');
  perform _t_as(chloe);
  perform _t_agree(v_a);
  perform respond_booking(v_a, true, 'See you!');
  perform _t_as(null);
  perform _t_ok((select status from public.bookings where id = v_a) = 'confirmed', 'A: booking confirmed');
  perform _t_ok((select count(*) from public.booking_handoffs where booking_id = v_a and status = 'agreed') = 2,
    'A: both handoffs agreed');
  perform _t_ok((select count(*) from public.notifications where user_id = robert and type = 'booking_confirmed') = 1,
    'A: owner gets one booking_confirmed');
  perform _t_ok((select count(*) from public.notifications where user_id = chloe and type = 'booking_requested') = 1,
    'A: sitter got booking_requested');

  -- B + H: capacity 3 at day d morning; two requests race for the last spot
  perform _t_as(joy);
  v_b := request_booking(chloe, array[coco], local_ts(d, '09:00'), 'sitter_home', null,
    local_ts(d + 1, '17:00'), 'sitter_home', null, null);
  v_h := request_booking(chloe, array[toto], local_ts(d, '09:00'), 'sitter_home', null,
    local_ts(d + 1, '17:00'), 'sitter_home', null, null);
  -- Joy ↔ Chloe have never met: Accept waits for the Meet & Greet (D44).
  perform _t_ok((select count(*) from public.bookings
      where id in (v_b, v_h) and meet_greet_status = 'required') = 2,
    'B: first stay together needs a Meet & Greet');
  perform _t_as(chloe);
  begin
    perform _t_agree(v_b);
    perform respond_booking(v_b, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'meet_greet_required', 'B: sitter cannot accept a first-time pair before meeting');
  perform _t_meet(v_b);
  perform _t_meet(v_h);
  perform _t_agree(v_b);
  perform respond_booking(v_b, true);
  begin
    perform _t_agree(v_h);
    perform respond_booking(v_h, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'sitter_unavailable', 'H: second acceptance for the last spot fails');
  perform _t_as(joy);
  select * into r from get_sitter_schedule(chloe, d, d) s where s.slot = 'morning';
  perform _t_ok(r.state = 'full' and r.remaining = 0, 'B: schedule shows the slot as full');
  perform cancel_booking(v_h, 'Found another plan');
  begin
    perform request_booking(chloe, array[toto], local_ts(d, '09:00'), 'sitter_home', null,
      local_ts(d + 1, '17:00'), 'sitter_home', null, null);
    v_err := null;
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform _t_ok(v_err = 'sitter_unavailable' and v_detail like '%morning%',
    'B: new request into a full slot is rejected with the slot in detail');

  -- Capacity guard: lowering max_pets or removing an open slot below confirmed pets fails
  perform _t_as(chloe);
  begin
    insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
    values (chloe, 'open', d, d, 'morning', '08:00', '12:00', 2);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'overlaps_confirmed_booking', 'newer open row with fewer spots than booked fails');
  begin
    delete from public.sitter_availability where sitter_id = chloe and kind = 'open' and slot = 'morning';
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'overlaps_confirmed_booking', 'removing a booked open slot fails');
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (chloe, 'open', d + 15, d + 15, 'morning', '09:00', '12:00', 1);
  select * into r from get_sitter_schedule(chloe, d + 15, d + 15) s where s.slot = 'morning';
  perform _t_ok(r.starts_at = '09:00' and r.remaining = 1, 'the newest open row sets hours and spots');

  -- C: early-flight drop-off at 07:00, before Paul's Morning (09:00) → negotiated to 08:30
  perform _t_as(robert);
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
    perform _t_agree(v_a);
    perform respond_booking(v_a, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'handoff_pending', 'C: sitter cannot accept while own counter-offer is pending');
  perform _t_as(robert);
  perform propose_handoff(v_a, 'drop_off', local_ts(d + 10, '08:00'));
  perform _t_as(paul);
  v_h := propose_handoff(v_a, 'drop_off', local_ts(d + 10, '08:30'));
  perform _t_as(robert);
  perform respond_handoff(v_h, true);
  perform _t_as(paul);
  perform _t_agree(v_a);
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
  perform _t_as(robert);
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
  perform _t_as(chloe);
  perform respond_handoff(v_h, true);
  perform _t_as(null);
  perform _t_ok((select scheduled_at from public.booking_handoffs
      where booking_id = v_a and kind = 'pick_up' and status = 'agreed') = local_ts(d + 3, '20:00'),
    'D: new pick-up agreed');
  perform _t_ok((select count(*) from public.booking_slots where booking_id = v_a) = 24,
    'D: slots recalculated (overnight added)');
  perform _t_ok((select count(*) from public.notifications where user_id = robert and type = 'handoff_agreed') = 1,
    'D: owner notified of agreement');

  -- D″: sitter declines a change after confirmation → booking unchanged
  perform _t_as(robert);
  v_h := propose_handoff(v_a, 'pick_up', local_ts(d + 3, '21:00'));
  perform _t_as(chloe);
  perform respond_handoff(v_h, false);
  perform _t_as(null);
  perform _t_ok((select status from public.bookings where id = v_a) = 'confirmed'
      and (select scheduled_at from public.booking_handoffs
        where booking_id = v_a and kind = 'pick_up' and status = 'agreed') = local_ts(d + 3, '20:00'),
    'D″: declined change keeps the agreed pick-up');
  perform _t_ok((select count(*) from public.notifications where user_id = robert and type = 'handoff_declined') = 1,
    'D″: owner notified of the decline');

  -- D′: pick-up at the owner's home; a time-only counter-offer keeps the place;
  --     addresses only via get_handoff_details, only for the booking parties
  perform _t_as(robert);
  begin
    perform propose_handoff(v_a, 'pick_up', local_ts(d + 3, '20:00'), 'other');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'location_note_required', 'D′: "Somewhere else" needs a place note');
  perform propose_handoff(v_a, 'pick_up', local_ts(d + 3, '20:00'), 'owner_home');
  perform _t_as(chloe);
  v_h := propose_handoff(v_a, 'pick_up', local_ts(d + 3, '19:30'));
  perform _t_ok((select location_type from public.booking_handoffs where id = v_h) = 'owner_home',
    'D′: time-only counter-offer keeps the proposed place');
  perform _t_as(robert);
  perform respond_handoff(v_h, true);
  perform _t_as(null);
  update public.bookings set paid_at = now() where id = v_a;
  perform _t_as(robert);
  perform _t_ok((select address from get_handoff_details(v_a) where kind = 'drop_off') = '100 Example St',
    'D′: owner sees sitter address for the confirmed booking');
  perform _t_as(chloe);
  perform _t_ok((select address from get_handoff_details(v_a) where kind = 'pick_up') = '1 Owner Ave',
    'D′: sitter sees owner address for an owner_home pick-up');

  -- 015g: the unit and the postal code join the address the booking parties see.
  perform _t_as(null);
  update public.sitter_profiles set home_address_2 = 'Unit 5', home_postal_code = 'm5a 3c4' where id = chloe;
  perform _t_as(robert);
  perform _t_ok((select address from get_handoff_details(v_a) where kind = 'drop_off') = 'Unit 5, 100 Example St M5A 3C4',
    '015g: the owner sees the sitter''s unit and postal code in the address');
  perform _t_as(null);
  update public.sitter_profiles set home_address_2 = null, home_postal_code = null where id = chloe;
  perform _t_ok(public.full_address(null, '55 Mill St, Toronto, ON M5A 3C4', 'M5A 3C4') = '55 Mill St, Toronto, ON M5A 3C4',
    '015g: a postal code the street already ends with is not repeated');
  perform _t_ok(public.full_address('  ', null, null) is null, '015g: nothing to show gives null');
  perform _t_as(nora);
  begin
    perform get_handoff_details(v_a);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', 'D′: outsider cannot read handoff details');

  -- E: sitter blocks a day overlapping a confirmed booking → must cancel first → owner rebooks
  perform _t_as(chloe);
  begin
    insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot)
    values (chloe, 'blocked', d + 2, d + 2, 'morning');
    v_err := null;
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform _t_ok(v_err = 'overlaps_confirmed_booking' and v_detail like '%' || v_a || '%',
    'E: block over a confirmed booking is rejected with the booking id');
  perform cancel_booking(v_a, 'Personal schedule');
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot)
  values (chloe, 'blocked', d + 2, d + 2, 'morning');
  perform _t_as(null);
  perform _t_ok(not exists (select 1 from public.booking_pets where booking_id = v_a and active),
    'E: cancelled booking releases the pets');
  perform _t_ok((select body from public.notifications where user_id = robert and type = 'booking_cancelled')
      like 'Chloe can''t take Max and Mochi on %. Find a new sitter.',
    'E: owner told to find a new sitter');
  perform _t_as(robert);
  -- Only the fixture sitters count: a hosted database has real sitters (the demo ones) who are just as available and
  -- can rank first, so the ranking is read among the fixtures.
  select * into r from search_sitters(local_ts(d, '09:30'), local_ts(d + 3, '19:30'), 2) s where s.sitter_id = allen;
  perform _t_ok(r.covered_slots = r.total_slots, 'E: fully available sitter is fully covered');
  perform _t_ok(
    (select count(*) from search_sitters(local_ts(d, '09:30'), local_ts(d + 3, '19:30'), 2) s
      where s.sitter_id in (allen, paul, chloe) and s.covered_slots = s.total_slots) = 1
    and (select s.sitter_id from search_sitters(local_ts(d, '09:30'), local_ts(d + 3, '19:30'), 2) s
         where s.sitter_id in (allen, paul, chloe) limit 1) = allen,
    'E: among the fixture sitters the fully available one ranks first');
  select * into r from search_sitters(local_ts(d, '09:30'), local_ts(d + 3, '19:30'), 2) s where s.sitter_id = paul;
  perform _t_ok(r.covered_slots < r.total_slots, 'E: sitter without overnights shows as partly available');
  v_b := request_booking(allen, array[max, mochi], local_ts(d, '09:30'), 'sitter_home', null,
    local_ts(d + 3, '19:30'), 'owner_home', null, null, v_a);
  perform _t_meet(v_b, 'skipped');
  perform _t_as(allen);
  perform _t_agree(v_b);
  perform respond_booking(v_b, true);
  perform _t_as(null);
  perform _t_ok((select status = 'confirmed' and rebooked_from = v_a from public.bookings where id = v_b),
    'E: rebooked with another sitter');

  -- F: Coco with Chloe 09:00–12:00, then Paul takes over at 12:00 (same pet & day)
  perform _t_as(joy);
  v_a := request_booking(chloe, array[coco], local_ts(d + 14, '09:00'), 'sitter_home', null,
    local_ts(d + 14, '12:00'), 'other', 'Paul picks up at Chloe''s', null);
  v_b := request_booking(paul, array[coco], local_ts(d + 14, '12:00'), 'other', 'Chloe''s place',
    local_ts(d + 14, '17:00'), 'sitter_home', null, null);
  perform _t_ok((select meet_greet_status from public.bookings where id = v_a) = 'not_needed',
    'F: a pair whose Meet & Greet was done (in B) does not meet again');
  perform _t_as(chloe);
  perform _t_agree(v_a);
  perform respond_booking(v_a, true);
  perform _t_as(paul);
  perform _t_agree(v_b);
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
  perform request_booking(chloe, array[toto], local_ts(d + 16, '12:00'), 'sitter_home', null,
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
  values (coco, chloe, d + 14, 'Morning report'), (coco, paul, d + 14, 'Afternoon report');
  perform _t_ok(true, 'F: one daily report per sitter for the same day');
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking options (004, phase-03b 3B.0): service type, sitter services, Meet & Greet
-- state, meeting spots, media purposes. Runs after A–H (Robert ↔ Chloe met in the
-- 'current' fixture).
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
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
  perform _t_as(robert);
  begin
    perform request_booking(chloe, array[max], local_ts(d + 18, '09:00'), 'sitter_home', null,
      local_ts(d + 18, '11:00'), 'sitter_home', null, null, null, 'house_sitting');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'service_not_offered', '3B.0: sitters offer boarding only by default');
  begin
    perform request_booking(chloe, array[max], local_ts(d + 18, '09:00'), 'sitter_home', null,
      local_ts(d + 18, '11:00'), 'sitter_home', null, null, null, 'dog_walking');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_service', '3B.0: unknown service type is rejected');

  perform _t_as(chloe);
  begin
    update public.sitter_profiles set services = '{}' where id = chloe;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: a sitter must offer at least one service');
  begin
    update public.sitter_profiles set services = '{boarding,dog_walking}' where id = chloe;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: services are boarding / house_sitting only');
  update public.sitter_profiles set services = '{boarding,house_sitting}' where id = chloe;

  perform _t_as(robert);
  v_a := request_booking(chloe, array[max], local_ts(d + 18, '09:00'), 'sitter_home', null,
    local_ts(d + 18, '11:00'), 'other', 'Trinity Bellwoods', null, null, 'house_sitting');
  perform _t_as(null);
  perform _t_ok((select service_type from public.bookings where id = v_a) = 'house_sitting',
    '3B.0: house sitting booking stored');
  perform _t_ok((select count(*) from public.booking_handoffs
      where booking_id = v_a and location_type = 'owner_home' and location_note is null) = 2,
    '3B.0: house sitting fixes both handoffs to the owner''s home');
  perform _t_ok((select meet_greet_status from public.bookings where id = v_a) = 'not_needed',
    '3B.0: a pair that already met does not meet again');

  -- A skipped Meet & Greet is not a meeting: Robert ↔ Allen are still first-time. Declining works.
  perform _t_as(robert);
  v_a := request_booking(allen, array[mochi], local_ts(d + 19, '09:00'), 'sitter_home', null,
    local_ts(d + 19, '11:00'), 'sitter_home', null, null);
  perform _t_ok((select meet_greet_status from public.bookings where id = v_a) = 'required',
    '3B.0: after a skipped Meet & Greet the pair still has not met');
  perform _t_as(allen);
  perform respond_booking(v_a, false, 'Fully booked that week');
  perform _t_as(null);
  perform _t_ok((select status from public.bookings where id = v_a) = 'declined',
    '3B.0: sitter can decline before the Meet & Greet');
  perform _t_as(robert);
  perform _t_ok((select sitter_note from public.bookings where id = v_a) = 'Fully booked that week',
    'FB-35: the owner reads the sitter''s decline reason');
  perform _t_as(null);

  -- Search results carry the sitter's services
  perform _t_as(robert);
  select * into r from search_sitters(local_ts(d + 20, '09:00'), local_ts(d + 20, '11:00'), 1) s
  where s.sitter_id = chloe;
  perform _t_ok(r.services = '{boarding,house_sitting}', '3B.0: search_sitters returns services');
  select * into r from list_my_sitters() s where s.sitter_id = allen;
  perform _t_ok(r.services = '{boarding}', '3B.0: list_my_sitters returns services');

  -- Preferred meeting spots: ≤ 3 labels of ≤ 60 chars; sitter spots are not in the public list
  update public.owner_profiles set meet_spots = '{"Trinity Bellwoods — north gate"}' where id = robert;
  perform _t_ok((select meet_spots from public.owner_profiles where id = robert)
      = '{"Trinity Bellwoods — north gate"}', '3B.0: owner saves a meeting spot');
  begin
    update public.owner_profiles set meet_spots = '{a,b,c,d}' where id = robert;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: at most 3 meeting spots');
  begin
    update public.owner_profiles set meet_spots = array[repeat('x', 61)] where id = robert;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: meeting spot label is at most 60 characters');
  begin
    update public.owner_profiles set meet_spots = '{" "}' where id = robert;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: blank meeting spot is rejected');

  perform _t_as(chloe);
  update public.sitter_profiles set meet_spots = '{"Christie Pits — east entrance"}' where id = chloe;
  perform _t_ok((select meet_spots from get_my_sitter_profile()) = '{"Christie Pits — east entrance"}',
    '3B.0: sitter reads own meeting spots');
  perform _t_as(robert);
  perform _t_ok((select services from public.sitter_profiles where id = chloe) = '{boarding,house_sitting}',
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
    (max, chloe, 'smoke/max-report', 'image', 'report'),
    (max, chloe, 'smoke/max-handoff', 'image', 'handoff');
  begin
    insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (max, chloe, 'smoke/max-other', 'image', 'selfie');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '3B.0: media purpose is still checked');

  -- The new request_booking signature is not open to anon (plain timestamps: local_ts is
  -- not granted to anon either, and would fail first)
  perform _t_as(null, 'anon');
  begin
    perform request_booking(chloe, array[max], now() + interval '60 days', 'sitter_home', null,
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
-- declined. First-time pairs: Robert ↔ Nora (the 'requested' fixture) and Joy ↔ Nora.
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  nora constant uuid := '00000000-0000-4000-8000-0000000000b4';
  coco constant uuid := '00000000-0000-4000-8000-0000000000c3';
  toto constant uuid := '00000000-0000-4000-8000-0000000000c4';
  v_a uuid := _t_get('requested');
  v_b uuid;
  v_err text;
  r record;
begin
  perform _t_meet(v_a, 'required');
  perform _t_interest(v_a);

  -- Proposals are checked
  perform _t_as(robert);
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
      and meet_greet_proposed_by = robert from public.bookings where id = v_a),
    '3B.9: in-person proposal stored');
  perform _t_ok(exists (select 1 from public.notifications where user_id = nora and type = 'meet_greet_proposed'
      and title like 'Robert suggested meeting at Trinity Bellwoods — north gate on %'),
    '3B.9: the other side gets meet_greet_proposed');
  perform _t_as(robert);
  begin
    perform respond_meet_greet(v_a, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', '3B.9: the proposer cannot accept their own Meet & Greet');
  perform _t_as(chloe);
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
  perform _t_ok(exists (select 1 from public.notifications where user_id = robert and type = 'meet_greet_declined'),
    '3B.9: the proposer hears about the decline');

  -- Video: Nora proposes, Robert agrees, done even before the time (014s, #229), then Accept works
  perform _t_as(nora);
  perform propose_meet_greet(v_a, 'video', now() + interval '2 days');
  perform _t_as(robert);
  perform respond_meet_greet(v_a, true);
  perform _t_as(null);
  perform _t_ok((select meet_greet_status = 'agreed' and meet_greet_mode = 'video' and meet_greet_place is null
      from public.bookings where id = v_a),
    '3B.9: video Meet & Greet agreed');
  perform _t_ok(exists (select 1 from public.notifications where user_id = nora and type = 'meet_greet_agreed'),
    '3B.9: the proposer gets meet_greet_agreed');
  perform _t_as(nora);
  begin
    perform _t_agree(v_a);
    perform respond_booking(v_a, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'meet_greet_required', '3B.9: Accept still waits while the Meet & Greet is only agreed');
  -- 014s: Done works before the agreed time, and a second press (the other side) is a no-op.
  perform _t_as(robert);
  perform complete_meet_greet(v_a);
  perform _t_as(nora);
  begin
    perform complete_meet_greet(v_a);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err is null and (select meet_greet_status = 'done' from public.bookings where id = v_a),
    '014s: Done before the meeting time, and again from the other side, leaves it done');
  perform _t_as(chloe);
  begin
    select * into r from get_meet_greet_options(v_a);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', '3B.9: meeting spots are only for the two parties');
  perform _t_as(nora);
  select * into r from get_meet_greet_options(v_a);
  perform _t_ok(r.owner_name = 'Robert' and r.owner_spots = '{"Trinity Bellwoods — north gate"}'
      and r.sitter_spots = '{}',
    '3B.9: both sides'' meeting spots for the In person sheet');
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  select nora, 'open', app_today() + 38, app_today() + 43, s, '00:00', '23:59', 3
  from unnest(array['morning', 'afternoon']::care_slot[]) s;
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (nora, 'open', app_today() + 38, app_today() + 43, 'overnight', '18:00', '08:00', 3);
  perform _t_agree(v_a);
  perform respond_booking(v_a, true);
  perform _t_as(null);
  perform _t_ok((select status = 'confirmed' and meet_greet_status = 'done' from public.bookings where id = v_a),
    '3B.9: after the Meet & Greet is done the sitter can accept');

  -- Skip accepted: Joy asks, Nora continues without meeting
  v_b := _t_booking(joy, nora, array[toto], now() + interval '50 days', now() + interval '51 days', 'requested');
  perform _t_meet(v_b, 'required');
  perform _t_interest(v_b);
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
  perform _t_interest(v_b);
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
      and title = 'nora declined the booking request'),
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
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  q jsonb;
  v_err text;
  v_detail text;
  -- Goal example: boarding Oct 9 07:30 → Oct 12 17:00 Toronto, 2 pets, Thanksgiving Oct 12.
  v_drop timestamptz := ('2026-10-09 07:30:00'::timestamp at time zone app_timezone());
  v_pick timestamptz := ('2026-10-12 17:00:00'::timestamp at time zone app_timezone());
  v_hs_drop timestamptz := ('2026-10-05 09:00:00'::timestamp at time zone app_timezone());
  v_hs_pick timestamptz := ('2026-10-08 17:00:00'::timestamp at time zone app_timezone());
  v_day_drop timestamptz := ('2026-10-10 08:00:00'::timestamp at time zone app_timezone());
  v_day_pick timestamptz := ('2026-10-10 18:00:00'::timestamp at time zone app_timezone());
begin
  -- Chloe: Boarding $55 · House sitting $70 · Daycare $35 · +50% · +25% (Goal)
  perform _t_as(null);
  update public.sitter_profiles
  set services = array['boarding', 'house_sitting']
  where id = chloe;

  perform _t_as(chloe);
  insert into public.sitter_rates (
    sitter_id, boarding_nightly, house_sitting_nightly, daycare_daily,
    extra_pet_pct, holiday_pct
  ) values (chloe, 55.00, 70.00, 35.00, 50, 25);

  -- Boarding · 2 pets · Thanksgiving (phase-03c Goal): $268.13 CAD
  perform _t_as(robert);
  q := quote_booking(chloe, 'boarding', v_drop, v_pick, 2);
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
  q := quote_booking(chloe, 'house_sitting', v_hs_drop, v_hs_pick, 1);
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
  q := quote_booking(chloe, 'daycare', v_day_drop, v_day_pick, 2);
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

  -- A rates row without this service's price is "rates_not_set", not "doesn't offer" (014k, #189 R60-6).
  insert into public.sitter_rates (sitter_id, daycare_daily) values (paul, 30.00);
  perform _t_as(robert);
  begin
    q := quote_booking(paul, 'boarding', v_drop, v_pick, 1);
    v_err := null;
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform _t_ok(v_err = 'rates_not_set' and v_detail = 'boarding', '014k: offered boarding with no price → rates_not_set (boarding)');

  begin
    q := quote_booking(paul, 'house_sitting', v_hs_drop, v_hs_pick, 1);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'service_not_offered', '014k: a service not in the profile is still service_not_offered');

  perform _t_as(paul);
  update public.sitter_rates set boarding_nightly = 50.00, daycare_daily = null where sitter_id = paul;
  perform _t_as(robert);
  begin
    q := quote_booking(paul, 'daycare', v_day_drop, v_day_pick, 1);
    v_err := null;
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform _t_ok(v_err = 'rates_not_set' and v_detail = 'daycare', '014k: no daycare price → rates_not_set (daycare)');

  q := quote_booking(paul, 'boarding', v_drop, v_pick, 1);
  perform _t_ok((q->>'unit_price')::numeric = 50.00, '014k: a priced service still quotes');

  -- Later blocks expect Paul without rates.
  perform _t_as(null);
  delete from public.sitter_rates where sitter_id = paul;
end;
$$;

-- ---------------------------------------------------------------------------
-- Consents (006, phase-03c 3C.2, D30): required_consents + booking_consents RLS
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
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
  v_board := _t_booking(robert, chloe, array[max],
    now() + interval '20 days', now() + interval '23 days', 'confirmed');
  perform _t_as(robert);
  v_kinds := required_consents(v_board);
  perform _t_ok(v_kinds = array['emergency_vet', 'safe_return', 'handoff_rules', 'cohabitation'],
    '3C.2: boarding requires 4 consents');

  insert into public.booking_consents (booking_id, kind, version, signer_id, signer_name, details)
  values (v_board, 'emergency_vet', '1', robert, 'Robert',
    jsonb_build_object('limit_cad', 500, 'vet_clinic_name', 'Demo Vet'));
  select signed_at into v_signed_at from public.booking_consents
    where booking_id = v_board and kind = 'emergency_vet';
  perform _t_ok(v_signed_at is not null, '3C.2: owner signature stores signed_at');

  begin
    insert into public.booking_consents (booking_id, kind, version, signer_id, signer_name)
    values (v_board, 'emergency_vet', '1', robert, 'Robert');
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

  perform _t_as(chloe);
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
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  v_pay uuid;
  v_kind text;
  v_quote jsonb;
  v_err text;
  v_detail text;
  v_dog uuid;
  v_cat uuid;
begin
  -- Confirmed boarding with Chloe rates already seeded in 3C.1. The Thanksgiving dates are fixed, so this
  -- booking gets its own pets: Max and Mochi are booked relative to now(), which would overlap it for a few days.
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Payer') returning id into v_dog;
  insert into public.pets (owner_id, species, name) values (robert, 'cat', 'Payee') returning id into v_cat;
  v_pay := _t_booking(robert, chloe, array[v_dog, v_cat],
    ('2026-10-09 07:30:00'::timestamp at time zone app_timezone()),
    ('2026-10-12 17:00:00'::timestamp at time zone app_timezone()),
    'confirmed');

  perform _t_as(robert);
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
    values (v_pay, v_kind, '1', robert, 'Robert',
      case v_kind
        when 'emergency_vet' then jsonb_build_object('limit_cad', 500, 'vet_clinic_name', 'Demo Vet')
        when 'safe_return' then jsonb_build_object('receiver_name', 'Robert')
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
      where user_id = chloe and type = 'booking_paid' and booking_id = v_pay),
    '3C.3: sitter gets booking_paid');

  perform _t_as(robert);
  begin
    v_quote := pay_booking_demo(v_pay);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'already_paid', '3C.3: second pay → already_paid');

  perform _t_as(chloe);
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
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  v_id uuid;
  r record;
  v_err text;
begin
  perform _t_as(null);
  update public.sitter_profiles
  set visitor_parking = 'Visitor spot B-12',
      lobby_notes = 'Buzz 1204'
  where id = chloe;
  update public.owner_profiles set packing_list = array['food', 'leash'] where id = robert;

  v_id := _t_booking(robert, chloe, array[max],
    now() + interval '80 days', now() + interval '83 days', 'confirmed');

  perform _t_as(robert);
  begin
    select * into r from get_handoff_details(v_id);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_paid', '3C.4: address hidden before demo pay');

  perform _t_as(null);
  update public.bookings set paid_at = now() where id = v_id;

  perform _t_as(robert);
  select * into r from get_handoff_details(v_id) where kind = 'drop_off';
  perform _t_ok(
    r.address = '100 Example St'
    and r.visitor_parking = 'Visitor spot B-12'
    and r.lobby_notes = 'Buzz 1204'
    and r.packing_list = array['food', 'leash'],
    '3C.4: after pay, sitter home + packing list return');
  perform _t_ok((select packing_list from get_handoff_details(v_id) where kind = 'pick_up') is null,
    '015h: the packing list rides on the drop-off only');
  perform _t_as(chloe);
  perform _t_ok((select packing_list from get_handoff_details(v_id) where kind = 'drop_off') = array['food', 'leash'],
    '015h: the sitter reads the owner''s packing list');

  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Home access unlock (006, phase-03c 3C.5 / I–K, D31)
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
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
  perform _t_as(robert);
  insert into public.owner_home_access (owner_id, entry_steps, lockbox_code, buzzer, fob_notes, sitter_parking)
  values (robert, '1. Buzz 1204  2. Lockbox left of door', '0000', '#1204', 'Fob on key hook', 'Street parking OK')
  on conflict (owner_id) do update set
    entry_steps = excluded.entry_steps,
    lockbox_code = excluded.lockbox_code,
    buzzer = excluded.buzzer,
    fob_notes = excluded.fob_notes,
    sitter_parking = excluded.sitter_parking;

  perform _t_as(null);
  v_id := _t_booking(robert, chloe, array[max],
    now() + interval '90 days', now() + interval '93 days', 'confirmed');
  update public.booking_handoffs set location_type = 'owner_home'
    where booking_id = v_id and kind = 'drop_off';

  perform _t_as(chloe);
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
  perform _t_as(chloe);
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

  perform _t_as(chloe);
  select * into r from get_home_access(v_id);
  perform _t_ok(r.lockbox_code = '0000' and r.buzzer = '#1204',
    '3C.5 J: codes return inside the window');
  perform _t_as(null);
  perform _t_ok((select count(*) from public.access_reveals where booking_id = v_id) = 1,
    '3C.5 J: first reveal recorded once');
  perform _t_ok((select count(*) from public.notifications
      where user_id = robert and type = 'access_unlocked' and booking_id = v_id) = 1,
    '3C.5 J: owner notified once');

  perform _t_as(chloe);
  select * into r from get_home_access(v_id);
  perform _t_as(null);
  perform _t_ok((select count(*) from public.access_reveals where booking_id = v_id) = 1
      and (select count(*) from public.notifications
        where user_id = robert and type = 'access_unlocked' and booking_id = v_id) = 1,
    '3C.5 J: second open does not re-notify');

  -- K: other sitter forbidden; after pick-up completed → locked_since
  perform _t_as(paul);
  begin
    select * into r from get_home_access(v_id);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'forbidden', '3C.5 K: other sitter forbidden');

  perform _t_as(robert);
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

  perform _t_as(chloe);
  begin
    select * into r from get_home_access(v_id);
    v_err := null;
    v_detail := null;
  exception when others then
    get stacked diagnostics v_err = message_text, v_detail = pg_exception_detail;
  end;
  perform _t_ok(v_err = 'access_locked' and v_detail like '%locked_since%',
    '3C.5 K: locked again after pick-up completed');

  -- Paul cannot read Robert's owner_home_access row directly
  perform _t_as(paul);
  select count(*) into n from public.owner_home_access where owner_id = robert;
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
  perform _t_as(chloe);
  begin
    insert into public.feed_posts (pet_id, sitter_id, media_id, category)
    values (max, chloe, _t_get('media_bori'), 'not_a_category');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '5.3: feed_posts.category check');

  -- Phase 05 (5.8): visibility + owner posts
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose) values
    (max, chloe, 'smoke/max-private', 'image', 'feed'),
    (max, robert, 'smoke/max-owner-private', 'image', 'feed'),
    (max, robert, 'smoke/max-owner-shared', 'image', 'feed');
  perform _t_put('m_priv', (select id from public.media where cloudinary_public_id = 'smoke/max-private'));
  perform _t_put('m_opriv', (select id from public.media where cloudinary_public_id = 'smoke/max-owner-private'));
  perform _t_put('m_oshared', (select id from public.media where cloudinary_public_id = 'smoke/max-owner-shared'));

  perform _t_as(chloe);
  insert into public.feed_posts (pet_id, sitter_id, media_id, visibility)
  values (max, chloe, _t_get('m_priv'), 'private');
  select count(*) into n from public.feed_posts where media_id = _t_get('m_priv');
  perform _t_ok(n = 1, '5.8: author sees her own private post');
  begin
    insert into public.feed_posts (pet_id, sitter_id, media_id, visibility)
    values (max, chloe, _t_get('media_bori'), 'hidden');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '5.8: visibility check');
  begin
    insert into public.feed_posts (pet_id, sitter_id, media_id)
    values (max, chloe, _t_get('m_oshared'));
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '5.8: cannot attach media someone else uploaded');
  perform _t_as(null);
  perform _t_ok(not exists (
      select 1 from public.notifications n join public.feed_posts fp on fp.id = n.ref_id
      where n.type = 'feed_post' and fp.media_id = _t_get('m_priv')),
    '5.8: private post sends no owner notification');

  perform _t_as(robert);
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
      where n.type = 'feed_post' and fp.media_id = _t_get('m_oshared') and n.user_id = chloe) = 1,
    '5.9: owner''s shared post notifies the on-duty sitter');
  perform _t_ok((select count(*) from public.notifications n
      join public.feed_posts fp on fp.id = n.ref_id
      where n.type = 'feed_post' and fp.media_id = _t_get('m_oshared') and n.user_id <> chloe) = 0,
    '5.9: nobody else is notified (not the other sitter, not the owner)');
  perform _t_ok(not exists (select 1 from public.notifications n
      join public.feed_posts fp on fp.id = n.ref_id
      where n.type = 'feed_post' and fp.media_id = _t_get('m_opriv')),
    '5.9: owner''s private post notifies nobody');
  perform _t_as(robert);
  begin
    insert into public.feed_posts (pet_id, sitter_id, media_id)
    values (max, chloe, _t_get('media_bori'));
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

  perform _t_as(chloe);
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
  perform _t_as(robert);
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

  -- (seeded as the system: the owner can no longer add tasks to a pet whose stay is on — see 6.23)
  perform _t_as(null);
  insert into public.care_tasks (pet_id, type, title, scheduled_time, active)
  values (max, 'play', 'Paused play', '17:00', false);
  insert into public.care_tasks (pet_id, type, title, scheduled_time, repeat_daily)
  values (max, 'medication', 'One-off pill', '12:00', false)
  returning id into v_id;
  perform _t_put('task_once', v_id);

  perform _t_as(chloe);
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

  perform _t_as(robert);
  select count(*) into n from public.task_logs where pet_id = max;
  perform _t_ok(n = 2, '6.2: the owner reads the logs through RLS');
  -- A pet nobody has booked: only its owner reads its logs (later scenarios hand Max to
  -- different sitters, so Max is not a stable "no access" pet).
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Solo') returning id into v_id;
  insert into public.care_tasks (pet_id, type, title, scheduled_time) values (v_id, 'feeding', 'Dinner', '18:00');
  insert into public.task_logs (task_id, pet_id, due_at)
  select id, v_id, local_ts(app_today(), '18:00') from public.care_tasks where pet_id = v_id;
  perform _t_as(chloe);
  select count(*) into n from public.task_logs where pet_id = v_id;
  perform _t_ok(n = 0, '6.2: a sitter with no booking for the pet cannot read the logs');
  perform _t_as(robert);
  select count(*) into n from public.task_logs where pet_id = v_id;
  perform _t_ok(n = 1, '6.2: the owner sees the logs of her unbooked pet');

  -- Phase 06 (6.4): complete_task_log
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
  values (max, chloe, 'smoke/proof-pill', 'image', 'task_proof');
  perform _t_put('m_proof', (select id from public.media where cloudinary_public_id = 'smoke/proof-pill'));
  perform _t_put('log_bf', (select id from public.task_logs where task_id = _t_get('task_bori')));
  perform _t_put('log_pill', (select id from public.task_logs where task_id = _t_get('task_once')));

  perform _t_as(robert);
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

  perform _t_as(chloe);
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
    (select status = 'done' and completed_by = chloe and completed_at is not null and media_id is null
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
     where user_id = robert and type = 'task_done' and ref_id = _t_get('log_bf')
       and title like 'Max had breakfast%') = 1,
    '6.4: the owner gets a task_done notice');
  perform _t_ok(not exists (select 1 from public.feed_posts where task_log_id = _t_get('log_bf')),
    '6.4: no photo → no feed post');

  perform _t_as(chloe);
  perform complete_task_log(_t_get('log_pill'), _t_get('m_proof'));
  perform _t_as(null);
  perform _t_ok(
    (select count(*) from public.feed_posts
     where task_log_id = _t_get('log_pill') and caption_source = 'task' and visibility = 'shared'
       and media_id = _t_get('m_proof') and posted_by = chloe) = 1,
    '6.4: with a photo → a shared feed post with a task caption');
  perform _t_ok(
    (select count(*) from public.notifications where user_id = robert and ref_id = _t_get('log_pill')
       and type = 'task_done') = 1
    and not exists (select 1 from public.notifications n join public.feed_posts fp on fp.id = n.ref_id
       where n.type = 'feed_post' and fp.task_log_id = _t_get('log_pill')),
    '6.4: task_done only — no extra feed_post notice for a task photo');
  perform _t_as(robert);
  perform _t_ok(
    (select count(*) from public.feed_posts where task_log_id = _t_get('log_pill')) = 1,
    '6.4: the owner sees the task photo in the feed');

  -- Phase 06 (6.8): care_checkins
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Solo2') returning id into v_id;
  insert into public.care_checkins (pet_id, kind, value) values (v_id, 'meal', 'all');
  insert into public.care_checkins (pet_id, kind, value) values (v_id, 'walk', '30');
  insert into public.care_checkins (pet_id, kind, note_text) values (v_id, 'note', 'Watched a squirrel for ten minutes');
  insert into public.care_checkins (pet_id, kind, value) values (max, 'mood', 'happy');
  perform _t_ok(true, '6.8: valid check-ins of every shape insert');

  begin
    insert into public.care_checkins (pet_id, kind, value) values (v_id, 'meal', 'a lot');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '6.8: value must fit the kind');
  begin
    insert into public.care_checkins (pet_id, kind, value) values (v_id, 'walk', '25');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '6.8: walk minutes are 5 / 10 / 15 / 20 / 30 / 45 / 60');
  begin
    insert into public.care_checkins (pet_id, kind) values (v_id, 'note');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '6.8: a note needs its line');
  insert into public.care_checkins (pet_id, kind, value, note_text) values (v_id, 'mood', 'calm', 'Hid under the bed');
  perform _t_ok(true, '6.8: any check-in may carry a short memo');
  -- 015i: the Home tile choices.
  begin
    insert into public.care_checkins (pet_id, kind, value) values (max, 'mood', 'missing');
    insert into public.care_checkins (pet_id, kind, value) values (max, 'mood', 'anxious');
    insert into public.care_checkins (pet_id, kind, value) values (max, 'walk', '5');
    insert into public.care_checkins (pet_id, kind, value, note_text) values (max, 'meal', 'other', 'Only ate the chicken bits');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err is null, '015i: new moods, a 5-minute walk and an "other" meal with its memo insert');
  begin
    insert into public.care_checkins (pet_id, kind, value) values (max, 'potty', 'other');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '015i: "other" never goes without a memo');
  begin
    insert into public.care_checkins (pet_id, kind, value) values (max, 'mood', 'grumpy');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '015i: a mood outside the list is refused');
  begin
    insert into public.care_checkins (pet_id, kind, value, note_text) values (v_id, 'mood', 'calm', '   ');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '6.8: a memo is never an empty string');
  begin
    insert into public.care_checkins (pet_id, kind, value, note_text) values (v_id, 'meal', 'all', repeat('x', 121));
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '6.8: a memo is at most 120 characters on any kind');
  begin
    insert into public.care_checkins (pet_id, kind, note_text) values (v_id, 'note', repeat('x', 121));
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '6.8: a note is at most 120 characters');
  begin
    insert into public.care_checkins (pet_id, kind, value)
    values ('00000000-0000-4000-8000-0000000000c2', 'walk', '20');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'checkin_not_allowed_for_species', '6.8: no walk check-in for a cat (D23)');

  -- RLS: read only, owner and the sitter in the window.
  perform _t_as(chloe);
  begin
    insert into public.care_checkins (pet_id, created_by, kind, value) values (max, chloe, 'mood', 'calm');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '6.8: clients cannot insert directly (log_care_checkin writes)');
  perform _t_ok((select count(*) from public.care_checkins where pet_id = v_id) = 0,
    '6.8: a sitter with no booking for the pet reads nothing');
  perform _t_ok((select count(*) from public.care_checkins where pet_id = max and kind = 'mood') >= 1,
    '6.8: the sitter in the care window reads the pet''s check-ins');
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.care_checkins where pet_id = v_id) = 4,
    '6.8: the owner reads her pet''s check-ins');
  begin
    update public.care_checkins set value = 'none' where pet_id = v_id and kind = 'meal';
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '6.8: nobody edits a check-in from the client');
  begin
    delete from public.care_checkins where pet_id = v_id;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '6.8: nobody deletes one from the client');
  perform _t_as(null, 'anon');
  begin
    perform count(*) from public.care_checkins;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '6.8: anon cannot read check-ins');

  -- Phase 06 (6.9): log_care_checkin
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
  values (max, chloe, 'smoke/proof-checkin', 'image', 'task_proof');
  perform _t_put('m_checkin', (select id from public.media where cloudinary_public_id = 'smoke/proof-checkin'));

  perform _t_as(robert);
  begin
    perform log_care_checkin(max, 'meal', 'all');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_in_care_window', '6.9: the owner cannot log a check-in');
  perform _t_as('00000000-0000-4000-8000-0000000000b3');
  begin
    perform log_care_checkin(max, 'meal', 'all');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_in_care_window', '6.9: a sitter outside the care window cannot');

  perform _t_as(chloe);
  perform log_care_checkin(max, 'meal', 'all');
  perform _t_ok(
    (select count(*) from public.care_checkins where pet_id = max and kind = 'meal' and value = 'all'
       and created_by = chloe and note_text is null and media_id is null) = 1,
    '6.9: one tap, no memo');
  perform log_care_checkin(max, 'mood', 'tired', '   ');
  perform _t_ok(
    (select note_text from public.care_checkins where pet_id = max and kind = 'mood' and value = 'tired') is null,
    '6.9: a blank memo is dropped');
  perform log_care_checkin(max, 'meal', 'little', ' Left the chicken bits, sniffed and walked off ');
  perform _t_ok(
    (select note_text from public.care_checkins where pet_id = max and value = 'little')
      = 'Left the chicken bits, sniffed and walked off',
    '6.9: something special → a trimmed memo on the check-in');
  perform log_care_checkin(max, 'note', null, 'Watched a squirrel for ten minutes');
  begin
    perform log_care_checkin(max, 'note', null, '  ');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'note_required', '6.9: a note check-in needs its line');
  begin
    perform log_care_checkin(max, 'meal', 'plenty');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '6.9: a value that does not fit the kind is refused');
  begin
    perform log_care_checkin('00000000-0000-4000-8000-0000000000c2', 'walk', '20');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'checkin_not_allowed_for_species', '6.9: no walk check-in for a cat');
  -- 11.12 (015): nap
  perform log_care_checkin(max, 'nap');
  begin
    perform log_care_checkin(max, 'nap', 'long');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '11.12: a nap takes no value');
  perform _t_as(null);
  perform _t_ok(
    (select count(*) from public.care_checkins where pet_id = max and kind = 'nap' and value is null and created_by = chloe) = 1
    and (select count(*) from public.notifications n join public.care_checkins c on c.id = n.ref_id
         where n.user_id = robert and n.type = 'care_checkin' and c.kind = 'nap'
           and n.title like 'Max is taking a nap%') = 1,
    '11.12: a nap check-in has no value and tells the owner "Max is taking a nap 💤"');
  -- 11.12b (015d): wake
  perform _t_as(chloe);
  perform log_care_checkin(max, 'wake');
  begin
    perform log_care_checkin(max, 'wake', 'now');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '11.12b: a wake takes no value');
  perform _t_as(null);
  perform _t_ok(
    (select count(*) from public.care_checkins where pet_id = max and kind = 'wake' and value is null and created_by = chloe) = 1
    and (select count(*) from public.notifications n join public.care_checkins c on c.id = n.ref_id
         where n.user_id = robert and n.type = 'care_checkin' and c.kind = 'wake'
           and n.title like 'Max woke up%') = 1,
    '11.12b: a wake check-in has no value and tells the owner "Max woke up ☀️"');
  perform _t_as(chloe);
  perform _t_as(chloe);
  begin
    perform log_care_checkin(max, 'meal', 'all', null, _t_get('media_bori'));
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_media', '6.9: the photo must be a task_proof upload');

  perform _t_as(null);
  perform _t_ok(
    (select count(*) from public.notifications n join public.care_checkins c on c.id = n.ref_id
     where n.user_id = robert and n.type = 'care_checkin' and c.kind = 'meal' and c.value = 'all'
       and n.title like 'Max ate everything%' and n.body is null) >= 1,
    '6.9: no memo typed → the preset line, "Max ate everything 🍽️"');
  perform _t_ok(
    (select count(*) from public.notifications n join public.care_checkins c on c.id = n.ref_id
     where n.user_id = robert and n.type = 'care_checkin' and c.value = 'little'
       and n.title like 'Max ate a little%' and n.body = 'Left the chicken bits, sniffed and walked off') = 1,
    '6.9: a typed memo rides along as the body of the preset title');
  perform _t_ok(not exists (select 1 from public.feed_posts fp
      join public.care_checkins c on c.pet_id = fp.pet_id and c.media_id = fp.media_id),
    '6.9: no photo → no feed post');

  perform _t_as(chloe);
  perform log_care_checkin(max, 'meal', 'most', null, _t_get('m_checkin'));
  perform _t_as(null);
  perform _t_ok(
    (select count(*) from public.feed_posts
     where media_id = _t_get('m_checkin') and caption_source = 'task' and visibility = 'shared'
       and posted_by = chloe and task_log_id is null) = 1,
    '6.9: with a photo → a shared feed post');
  perform _t_ok(
    (select count(*) from public.notifications n join public.feed_posts fp on fp.id = n.ref_id
     where n.type = 'feed_post' and fp.media_id = _t_get('m_checkin')) = 0
    and (select count(*) from public.notifications n join public.care_checkins c on c.id = n.ref_id
     where n.type = 'care_checkin' and c.media_id = _t_get('m_checkin')) = 1,
    '6.9: a check-in photo sends the care_checkin notice only');
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.feed_posts where media_id = _t_get('m_checkin')) = 1,
    '6.9: the owner sees the check-in photo in the feed');

  -- Phase 06 follow-ups: task memo, editing a task, deleting notifications
  perform _t_as(null);
  insert into public.care_tasks (pet_id, type, title, scheduled_time)
  values (max, 'play', 'Evening play', '21:00') returning id into v_id;
  perform _t_put('task_play', v_id);
  perform _t_as(chloe);
  perform ensure_today_task_logs(max);
  perform _t_ok((select count(*) from public.task_logs where task_id = _t_get('task_play')) = 1,
    '6.x: the new task gets today''s log');

  perform _t_as(robert);
  update public.care_tasks set scheduled_time = '22:00' where id = _t_get('task_play');
  perform _t_ok((select count(*) from public.task_logs where task_id = _t_get('task_play')) = 0,
    '6.x: changing a task''s time drops today''s unfinished log');
  perform _t_as(chloe);
  perform ensure_today_task_logs(max);
  perform _t_ok(
    (select count(*) from public.task_logs
     where task_id = _t_get('task_play') and due_at = local_ts(app_today(), '22:00')) = 1,
    '6.x: …and today gets one log at the new time');

  perform _t_as(robert);
  update public.care_tasks set active = false where id = _t_get('task_play');
  perform _t_ok((select count(*) from public.task_logs where task_id = _t_get('task_play')) = 0,
    '6.x: pausing a task drops today''s unfinished log');
  update public.care_tasks set active = true where id = _t_get('task_play');

  perform _t_as(chloe);
  perform ensure_today_task_logs(max);
  perform complete_task_log(
    (select id from public.task_logs where task_id = _t_get('task_play')), null, '  Chased the ball twice, then napped  ');
  perform _t_as(null);
  perform _t_ok(
    (select note_text from public.task_logs where task_id = _t_get('task_play')) = 'Chased the ball twice, then napped',
    '6.x: Mark done with a memo stores it (trimmed)');
  perform _t_ok(
    (select count(*) from public.notifications n join public.task_logs l on l.id = n.ref_id
     where n.user_id = robert and n.type = 'task_done' and l.task_id = _t_get('task_play')
       and n.title like 'Max had playtime%' and n.body = 'Chased the ball twice, then napped') = 1,
    '6.x: with a memo the owner gets what was done (title) plus the memo (body)');

  perform _t_as(robert);
  update public.care_tasks set scheduled_time = '23:00' where id = _t_get('task_play');
  perform _t_as(chloe);
  perform ensure_today_task_logs(max);
  perform _t_ok((select count(*) from public.task_logs where task_id = _t_get('task_play')) = 1,
    '6.x: a task finished today gets no second log when its time is edited (history stays)');
  begin
    perform complete_task_log(
      (select id from public.task_logs where task_id = _t_get('task_play')), null, repeat('x', 121));
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err is not null, '6.x: a memo over 120 characters is refused');

  -- Notifications can be deleted — by their owner only
  perform _t_as(robert);
  delete from public.notifications where id = (select id from public.notifications where user_id = robert limit 1);
  get diagnostics n = row_count;
  perform _t_ok(n = 1, '6.x: a user deletes their own notification');
  perform _t_as(chloe);
  delete from public.notifications where user_id = robert;
  get diagnostics n = row_count;
  perform _t_ok(n = 0, '6.x: nobody deletes someone else''s notifications');
  perform _t_as(robert);
  delete from public.notifications;
  perform _t_ok((select count(*) from public.notifications) = 0, '6.x: Clear all empties one''s own list');
  perform _t_as(chloe);
  perform _t_ok((select count(*) from public.notifications) > 0, '6.x: …and leaves other people''s alone');

  -- Phase 06 (6.13): care requests, tasks and Heads-ups saved in one go — on pets with no stay on
  -- (009b: while a stay is on the owner sends a change request instead, see 6.20).
  perform _t_as(robert);
  begin
    perform save_care_request(max, 'x', null, '[]'::jsonb, array['Be careful']);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'stay_in_progress', 'BF.4: no saved checklist for a pet whose stay is on');
  perform _t_as(null);
  insert into public.pets (id, owner_id, species, name) values
    ('00000000-0000-4000-8000-0000000000d1', robert, 'dog', 'Biscuit'),
    ('00000000-0000-4000-8000-0000000000d2', robert, 'cat', 'Pickle');
  perform _t_as(robert);
  v_id := save_care_request(
    '00000000-0000-4000-8000-0000000000d1',
    'Meals: 8:00 AM — 1 cup of kibble. Heads-up: text instead of knocking.',
    'nvidia/test-model',
    '[{"type":"feeding","time":"08:00","title":"Breakfast","dose":"1 cup of kibble","notes":null},
      {"type":"medication","time":"14:00","title":"Skin pill","dose":"1 skin pill with a treat"}]'::jsonb,
    array['Text instead of knocking', 'Keep other dogs away on walks']);
  perform _t_put('req_saved', v_id);
  perform _t_ok((select count(*) from public.care_tasks where request_id = v_id) = 2,
    '6.13: the checklist rows are saved with the request');
  perform _t_ok((select count(*) from public.pet_cautions where request_id = v_id and active) = 2,
    '6.13: the Heads-ups are saved with the request');
  perform _t_ok((select scheduled_time from public.care_tasks where request_id = v_id and type = 'medication') = '14:00',
    '6.13: times arrive as clock times');
  perform _t_ok((select count(*) from public.care_requests where id = v_id and model = 'nvidia/test-model') = 1,
    '6.13: the note is kept as written');

  begin
    perform save_care_request(
      '00000000-0000-4000-8000-0000000000d2', 'walk', null,
      '[{"type":"feeding","time":"07:00","title":"Breakfast"},{"type":"walk","time":"17:00","title":"Walk"}]'::jsonb,
      array['Close the door gently']);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'task_type_not_allowed_for_species', '6.13: a walk for a cat is refused…');
  perform _t_ok(
    (select count(*) from public.care_requests where pet_id = '00000000-0000-4000-8000-0000000000d2') = 0
    and (select count(*) from public.pet_cautions where pet_id = '00000000-0000-4000-8000-0000000000d2') = 0
    and (select count(*) from public.care_tasks where pet_id = '00000000-0000-4000-8000-0000000000d2'
         and title in ('Breakfast', 'Walk') and created_at > now() - interval '1 minute') = 0,
    '6.13: …and the whole save is rolled back (no request, no cautions, no half a checklist)');

  begin
    perform save_care_request('00000000-0000-4000-8000-0000000000d1', 'x', null, '[]'::jsonb,
      (select array_agg('c' || g) from generate_series(1, 9) g));
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'too_many_items', '6.13: more than 8 Heads-ups is refused');

  perform _t_as(chloe);
  begin
    perform save_care_request(max, 'x', null, '[]'::jsonb, array['Be careful']);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'forbidden', '6.13: a sitter cannot write a care request');
  perform _t_ok((select count(*) from public.pet_cautions where request_id = _t_get('req_saved')) = 0,
    '6.13: a sitter with no booking of the pet does not see its Heads-ups');
  perform _t_ok((select count(*) from public.care_requests) = 0,
    '6.13: …but not the owner''s note as written');
  begin
    insert into public.pet_cautions (pet_id, text) values (max, 'Sitter wrote this');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '6.13: a sitter cannot add a Heads-up');
  update public.pet_cautions set active = false where request_id = _t_get('req_saved');
  perform _t_ok((select count(*) from public.pet_cautions where request_id = _t_get('req_saved') and not active) = 0,
    '6.13: …or switch one off');

  perform _t_as(robert);
  update public.pet_cautions set active = false
  where request_id = _t_get('req_saved') and text = 'Keep other dogs away on walks';
  perform _t_ok((select count(*) from public.pet_cautions where request_id = _t_get('req_saved') and active) = 1,
    '6.13: the owner switches a Heads-up off');
  delete from public.pet_cautions where request_id = _t_get('req_saved') and not active;
  perform _t_ok((select count(*) from public.pet_cautions where request_id = _t_get('req_saved')) = 1,
    '6.13: …and deletes it');
  delete from public.care_requests where id = _t_get('req_saved');
  perform _t_ok((select count(*) from public.care_tasks where request_id is null and title = 'Skin pill') = 1,
    '6.13: deleting the note keeps the tasks it created (request_id → null)');

  -- Phase 06 (6.20): while a stay is on, the owner SENDS a care request and the sitter answers it
  perform _t_as(robert);
  v_id := send_care_change_request(
    max,
    '[{"type":"feeding","time":"19:00","title":"Late snack","dose":"a few treats","notes":null,"repeat":false}]'::jsonb,
    array['Never feed grapes']
  );
  perform _t_put('ccr', v_id);
  perform _t_ok((select count(*) from public.care_change_requests where id = v_id and status = 'pending') = 1,
    '6.20: the owner sends a care request (pending)');
  begin
    perform send_care_change_request(max, '[]'::jsonb, array['One more']);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'request_pending', '6.20: only one open request per pet');
  -- The request goes to the sitter of the stay that is on (the fixtures hold several bookings of Max).
  perform _t_as(null);
  perform _t_put('ccr_sitter', (select sitter_id from public.care_change_requests where id = _t_get('ccr')));
  perform _t_as(_t_get('ccr_sitter'));
  perform _t_ok((select count(*) from public.notifications where user_id = _t_get('ccr_sitter') and type = 'care_request' and ref_id = _t_get('ccr')) = 1,
    '6.20: the sitter is told about the request');
  perform _t_ok((select count(*) from public.care_change_requests where id = _t_get('ccr')) = 1,
    '6.20: the sitter sees the request');
  begin
    perform send_care_change_request(max, '[]'::jsonb, array['Sitter wrote this']);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'forbidden', '6.20: a sitter cannot send a care request');
  perform _t_as(robert);
  begin
    perform respond_care_change_request(_t_get('ccr'), true, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'forbidden', '6.20: the owner cannot approve their own request');
  perform _t_as(_t_get('ccr_sitter'));
  perform respond_care_change_request(_t_get('ccr'), true, null);
  perform _t_ok(exists (select 1 from public.care_tasks where pet_id = max and title = 'Late snack' and not repeat_daily and scheduled_time = '19:00'),
    '6.20: approving creates the task (one-time here)');
  perform _t_ok(exists (select 1 from public.pet_cautions where pet_id = max and text = 'Never feed grapes'),
    '6.20: …and the Heads-up');
  begin
    perform respond_care_change_request(_t_get('ccr'), false, 'late');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'already_answered', '6.20: a request is answered once');
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.notifications where user_id = robert and type = 'care_request_approved' and ref_id = _t_get('ccr')) = 1,
    '6.20: the owner is told it was approved');

  v_id := send_care_change_request(max, '[{"type":"walk","time":"22:00","title":"Night walk","dose":null,"notes":null}]'::jsonb, '{}');
  perform _t_put('ccr2', v_id);
  perform _t_as(_t_get('ccr_sitter'));
  perform respond_care_change_request(_t_get('ccr2'), false, 'I''m out by then');
  perform _t_ok(not exists (select 1 from public.care_tasks where pet_id = max and title = 'Night walk'),
    '6.20: declining creates nothing');
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.notifications where user_id = robert and type = 'care_request_declined'
      and ref_id = _t_get('ccr2') and body = 'I''m out by then') = 1,
    '6.20: the owner gets the sitter''s reason');
  begin
    perform send_care_change_request(max, '[]'::jsonb, '{}');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'empty_request', '6.20: an empty request is refused');
  begin
    insert into public.care_change_requests (pet_id, booking_id, requested_by, sitter_id)
    select max, booking_id, robert, chloe from public.care_change_requests limit 1;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '6.20: requests are written only through the functions');

  -- Phase 06 (6.23): no direct additions while a stay is on
  perform _t_as(robert);
  begin
    insert into public.care_tasks (pet_id, type, title, scheduled_time) values (max, 'play', 'Sneaky task', '10:00');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '6.23: the owner cannot add a task to a pet whose stay is on');
  begin
    insert into public.pet_cautions (pet_id, text, created_by) values (max, 'Sneaky heads-up', robert);
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '6.23: …or a Heads-up');
  update public.care_tasks set title = 'Late snack (edited)' where pet_id = max and title = 'Late snack';
  perform _t_ok(exists (select 1 from public.care_tasks where title = 'Late snack (edited)'),
    '6.23: …but can still edit what is already there');
  delete from public.care_tasks where title = 'Late snack (edited)';
  perform _t_ok(not exists (select 1 from public.care_tasks where title = 'Late snack (edited)'),
    '6.23: …and remove it');
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Homebody') returning id into v_id;
  perform _t_as(robert);
  insert into public.care_tasks (pet_id, type, title, scheduled_time) values (v_id, 'feeding', 'Breakfast', '08:00');
  insert into public.pet_cautions (pet_id, text, created_by) values (v_id, 'Shy with strangers', robert);
  perform _t_ok(true, '6.23: a pet with no stay on is edited directly as before');

  -- Phase 07 (7.5): the sitter sends the daily report; the owner only ever sees the sent text
  perform _t_as(null);
  insert into public.daily_reports (pet_id, sitter_id, report_date, body, status, model)
  values (max, _t_get('ccr_sitter'), '2026-10-15', 'AI DRAFT: Max had a day.', 'draft', 'test-model')
  returning id into v_id;
  perform _t_put('report', v_id);
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.daily_reports where id = _t_get('report')) = 0,
    '7.5: the owner does not see the draft');
  begin
    perform send_daily_report(_t_get('report'), 'I am the owner');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'forbidden', '7.5: the owner cannot send it');
  perform _t_as(_t_get('ccr_sitter'));
  perform _t_ok((select count(*) from public.daily_reports where id = _t_get('report')) = 1,
    '7.5: the sitter sees their own draft');
  perform _t_as(chloe);
  begin
    perform send_daily_report(_t_get('report'), 'Not mine');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'forbidden', '7.5: another sitter cannot send it');
  perform _t_as(_t_get('ccr_sitter'));
  begin
    perform send_daily_report(_t_get('report'), '   ');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'body_required', '7.5: an empty report cannot be sent');
  begin
    perform send_daily_report(_t_get('report'), repeat('x', 2001));
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'body_too_long', '7.5: …or one over 2000 characters');
  perform send_daily_report(_t_get('report'), '  Max had a lovely day — my own words.  ');
  perform _t_ok((select status = 'sent' and body = 'Max had a lovely day — my own words.' and sent_at is not null
      from public.daily_reports where id = _t_get('report')),
    '7.5: sending publishes the sitter''s edited text (trimmed), not the AI draft');
  perform _t_as(robert);
  perform _t_ok((select body from public.daily_reports where id = _t_get('report')) = 'Max had a lovely day — my own words.',
    '7.5: the owner now sees the sent report');
  perform _t_ok((select count(*) from public.notifications where user_id = robert and type = 'report_sent'
      and ref_id = _t_get('report') and pet_id = max and body like 'Max had a lovely day%') = 1,
    '7.5: the owner is told, with the start of the text');
  perform _t_as(_t_get('ccr_sitter'));
  begin
    perform send_daily_report(_t_get('report'), 'Again');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'report_already_sent', '7.5: a report is sent once');
  update public.daily_reports set body = 'Rewritten after sending' where id = _t_get('report');
  perform _t_as(null);
  perform _t_ok((select body from public.daily_reports where id = _t_get('report')) = 'Max had a lovely day — my own words.',
    '7.5: a sent report cannot be edited directly');

  -- 011f (FB-22): after one is sent, another report can be written the same day — but only one draft at a time
  perform _t_as(null);
  insert into public.daily_reports (pet_id, sitter_id, report_date, body, status, model)
  values (max, _t_get('ccr_sitter'), '2026-10-15', 'AI DRAFT: the evening went well.', 'draft', 'test-model')
  returning id into v_id;
  perform _t_ok(v_id is not null, '011f: a second report the same day can be drafted once the first is sent');
  begin
    insert into public.daily_reports (pet_id, sitter_id, report_date, body, status, model)
    values (max, _t_get('ccr_sitter'), '2026-10-15', 'AI DRAFT: a third one', 'draft', 'test-model');
    v_err := null;
  exception when unique_violation then v_err := 'unique_violation';
  end;
  perform _t_ok(v_err = 'unique_violation', '011f: …but there is only ever one draft per pet, sitter and day');
  perform _t_as(_t_get('ccr_sitter'));
  perform send_daily_report(v_id, 'Evening update: Max is asleep.');
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.daily_reports where pet_id = max and report_date = '2026-10-15' and status = 'sent') = 2,
    '011f: the owner sees both reports of the day');

  -- Phase 06 (6.21): a decline can carry a note; the sitter can send a counter-request instead
  perform _t_as(robert);
  v_id := send_care_change_request(
    max,
    '[{"type":"feeding","time":"06:00","title":"Early meal","dose":null,"notes":null},{"type":"walk","time":"23:00","title":"Late walk","dose":null,"notes":null}]'::jsonb,
    array['Keep the porch light on']
  );
  perform _t_put('ccr3', v_id);
  perform _t_as(_t_get('ccr_sitter'));
  begin
    perform counter_care_change_request(_t_get('ccr3'), '   ', 500, '{}');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'note_required', '6.21: a counter-request needs a note');
  begin
    perform counter_care_change_request(_t_get('ccr3'), 'x', 500, array[5]);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_tasks', '6.21: …and the tasks must be on the request');
  perform counter_care_change_request(_t_get('ccr3'), 'I can do the early meal for $5; please do the late walk yourself.', 500, array[1]);
  perform _t_ok((select status from public.care_change_requests where id = _t_get('ccr3')) = 'countered'
      and not exists (select 1 from public.care_tasks where pet_id = max and title in ('Early meal', 'Late walk')),
    '6.21: a counter-request creates nothing yet');
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.notifications where user_id = robert and type = 'care_request_countered'
      and ref_id = _t_get('ccr3') and body like '%$5.00%') = 1,
    '6.21: the owner is told, with the fee');
  begin
    perform send_care_change_request(max, '[]'::jsonb, array['Another']);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'request_pending', '6.21: a counter-request keeps the request open');
  perform _t_as(_t_get('ccr_sitter'));
  begin
    perform answer_care_counter(_t_get('ccr3'), true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'forbidden', '6.21: only the owner answers a counter-request');
  perform _t_as(robert);
  perform answer_care_counter(_t_get('ccr3'), true);
  perform _t_ok(exists (select 1 from public.care_tasks where pet_id = max and title = 'Early meal')
      and not exists (select 1 from public.care_tasks where pet_id = max and title = 'Late walk')
      and exists (select 1 from public.pet_cautions where pet_id = max and text = 'Keep the porch light on'),
    '6.21: accepting creates what the sitter agreed to (not the tasks the owner will do)');
  perform _t_as(_t_get('ccr_sitter'));
  perform _t_ok((select count(*) from public.notifications where user_id = _t_get('ccr_sitter') and type = 'care_counter_accepted'
      and ref_id = _t_get('ccr3')) = 1, '6.21: the sitter is told it was accepted');

  perform _t_as(robert);
  v_id := send_care_change_request(max, '[{"type":"play","time":"15:00","title":"Tug game","dose":null,"notes":null}]'::jsonb, '{}');
  perform _t_put('ccr4', v_id);
  perform _t_as(_t_get('ccr_sitter'));
  perform counter_care_change_request(_t_get('ccr4'), 'Extra time for this one.', 300, '{}');
  perform _t_as(robert);
  perform answer_care_counter(_t_get('ccr4'), false);
  perform _t_ok((select status from public.care_change_requests where id = _t_get('ccr4')) = 'withdrawn'
      and not exists (select 1 from public.care_tasks where pet_id = max and title = 'Tug game'),
    '6.21: declining the counter-request closes it and creates nothing');

  perform _t_as(robert);
  v_id := send_care_change_request(max, '[{"type":"play","time":"16:00","title":"Ball","dose":null,"notes":null}]'::jsonb, '{}');
  perform _t_as(_t_get('ccr_sitter'));
  perform respond_care_change_request(v_id, false, 'Needs a different time', 'Could we do 5 PM instead?');
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.notifications where user_id = robert and type = 'care_request_declined'
      and body = 'Needs a different time — Could we do 5 PM instead?') = 1,
    '6.21: a decline carries the reason and the note');

  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Review fixes (009b+, 2026-10-06)
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  pepper uuid;
  v_b1 uuid;
  v_b2 uuid;
  v_req uuid;
  v_err text;
  nori uuid;
  sesame uuid;
  v_b3 uuid;
  v_b4 uuid;
  v_b5 uuid;
  v_b6 uuid;
  v_prop uuid;
begin
  -- BF.4 (009b): an open care request ends with its stay
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Pepper') returning id into pepper;
  v_b1 := _t_booking(robert, chloe, array[pepper], now() + interval '100 days', now() + interval '102 days', 'confirmed');
  perform _t_as(robert);
  v_req := send_care_change_request(pepper,
    '[{"type":"play","time":"10:00","title":"Fetch","dose":null,"notes":null}]'::jsonb, '{}');
  perform cancel_booking(v_b1, 'Plans changed');
  perform _t_ok((select status from public.care_change_requests where id = v_req) = 'closed',
    'BF.4: cancelling the booking closes its open care request');
  perform _t_as(chloe);
  begin
    perform respond_care_change_request(v_req, true, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'already_answered', 'BF.4: …so the old sitter can no longer approve it');
  perform _t_as(null);
  perform _t_ok(not exists (select 1 from public.care_tasks where pet_id = pepper and title = 'Fetch'),
    'BF.4: …and nothing was added');

  v_b2 := _t_booking(robert, paul, array[pepper], now() + interval '110 days', now() + interval '112 days', 'confirmed');
  perform _t_as(robert);
  v_req := send_care_change_request(pepper,
    '[{"type":"play","time":"11:00","title":"Tug","dose":null,"notes":null}]'::jsonb, '{}');
  perform _t_ok((select status from public.care_change_requests where id = v_req) = 'pending',
    'BF.4: the next stay''s request is not blocked by the closed one');
  perform _t_as(null);
  update public.booking_handoffs set completed_at = now() where booking_id = v_b2 and kind = 'drop_off';
  update public.booking_handoffs set completed_at = now() where booking_id = v_b2 and kind = 'pick_up';
  perform _t_ok((select status from public.care_change_requests where id = v_req) = 'closed',
    'BF.4: picking the pet up closes an unanswered request');

  -- BF.5 (009c): a checked handoff stays checked; passed times can't be agreed; house sitting stays home
  perform _t_as(null);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (chloe, 'open', app_today() + 115, app_today() + 150, 'morning', '08:00', '12:00', 3),
         (chloe, 'open', app_today() + 115, app_today() + 150, 'afternoon', '12:00', '18:00', 3),
         (chloe, 'open', app_today() + 115, app_today() + 150, 'overnight', '18:00', '08:00', 3);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Nori') returning id into nori;
  v_b3 := _t_booking(robert, chloe, array[nori], now() + interval '120 days', now() + interval '122 days', 'confirmed', true);
  perform _t_as(robert);
  v_prop := propose_handoff(v_b3, 'pick_up', now() + interval '123 days');
  perform _t_as(chloe);
  perform complete_handoff(v_b3, 'pick_up');
  perform _t_ok((select status from public.booking_handoffs where id = v_prop) = 'superseded',
    'BF.5: Returned closes the open pick-up proposal');
  begin
    perform respond_handoff(v_prop, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_status', 'BF.5: …so it can no longer be accepted');
  perform _t_as(null);
  insert into public.booking_handoffs (booking_id, kind, scheduled_at, within_sitter_hours, status, proposed_by)
  values (v_b3, 'pick_up', now() + interval '124 days', true, 'proposed', robert)
  returning id into v_prop;
  perform _t_as(chloe);
  begin
    perform respond_handoff(v_prop, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'handoff_completed', 'BF.5: a checked handoff is never replaced');
  perform _t_as(null);
  perform _t_ok((select count(*) from public.booking_handoffs
      where booking_id = v_b3 and kind = 'pick_up' and status = 'agreed' and completed_at is not null) = 1,
    'BF.5: …the Returned pick-up is still the agreed one');

  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Sesame') returning id into sesame;
  v_b4 := _t_booking(robert, chloe, array[sesame], now() + interval '130 days', now() + interval '132 days', 'confirmed');
  v_b5 := _t_booking(robert, chloe, array[sesame], now() + interval '140 days', now() + interval '142 days', 'requested');
  update public.booking_handoffs set scheduled_at = now() - interval '1 minute'
  where booking_id = v_b5 and kind = 'drop_off'
  returning id into v_prop;
  perform _t_as(chloe);
  begin
    perform respond_handoff(v_prop, true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'proposal_expired', 'BF.5: a proposed time that has passed cannot be accepted');

  perform _t_as(null);
  v_b6 := _t_booking(robert, chloe, array[sesame], now() + interval '145 days', now() + interval '147 days', 'requested');
  update public.booking_handoffs set status = 'agreed' where booking_id = v_b6;
  update public.booking_handoffs set scheduled_at = now() - interval '1 hour' where booking_id = v_b6 and kind = 'pick_up';
  begin
    update public.bookings set status = 'confirmed' where id = v_b6;
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'request_expired', 'BF.5: a request whose pick-up has passed cannot be confirmed');

  update public.bookings set service_type = 'house_sitting' where id = v_b4;
  update public.booking_handoffs set location_type = 'owner_home' where booking_id = v_b4;
  perform _t_as(robert);
  begin
    perform propose_handoff(v_b4, 'drop_off', now() + interval '130 days', 'sitter_home');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_location', 'BF.5: house sitting handoffs stay at the owner''s home');
  perform propose_handoff(v_b4, 'drop_off', now() + interval '130 days' + interval '1 hour');
  perform _t_ok(true, 'BF.5: …a new time at the same place is fine');
end;
$$;

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  miso uuid;
  v_b uuid;
  v_req uuid;
  v_kind text;
  v_prop uuid;
  v_paid jsonb;
  v_quote jsonb;
  v_err text;
begin
  -- BF.6 (009d): consents are signed at checkout only, and a paid booking follows agreed changes
  perform _t_as(null);
  -- From here on only Miso's stay is a paid Robert ↔ Chloe booking (earlier fixtures reset).
  update public.bookings set paid_at = null, price_snapshot = null where owner_id = robert and sitter_id = chloe;
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Miso') returning id into miso;
  v_req := _t_booking(robert, chloe, array[miso], now() + interval '160 days', now() + interval '162 days', 'requested');
  v_b := _t_booking(robert, chloe, array[miso], now() + interval '134 days', now() + interval '136 days', 'confirmed');
  perform _t_as(robert);
  begin
    insert into public.booking_consents (booking_id, kind, version, signer_id, signer_name)
    values (v_req, 'emergency_vet', '1', robert, 'Robert');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'BF.6: nothing is signed before the sitter confirms');
  begin
    insert into public.booking_consents (booking_id, kind, version, signer_id, signer_name)
    values (v_b, 'home_access', '1', robert, 'Robert');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'BF.6: only a kind the booking requires can be signed');
  perform _t_as(chloe);
  perform _t_ok((select count(*) from public.owner_profiles where id = robert) = 0,
    'BF.6: the sitter sees no owner profile before payment');
  perform _t_as(robert);

  foreach v_kind in array required_consents(v_b) loop
    insert into public.booking_consents (booking_id, kind, version, signer_id, signer_name)
    values (v_b, v_kind, '1', robert, 'Robert');
  end loop;
  v_paid := pay_booking_demo(v_b);

  -- Pick-up moves to the owner's home → home_access is now required
  v_prop := propose_handoff(v_b, 'pick_up', now() + interval '136 days', 'owner_home');
  perform _t_ok('home_access' = any (required_consents(v_b)), 'BF.6: an owner_home handoff requires home_access');
  begin
    insert into public.booking_consents (booking_id, kind, version, signer_id, signer_name)
    values (v_b, 'home_access', '1', robert, 'Robert');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'BF.6: …but nothing is signed on a paid booking');
  perform _t_as(chloe);
  perform respond_handoff(v_prop, true);
  perform _t_as(null);
  perform _t_ok((select paid_at is null and price_snapshot->>'total' = v_paid->>'total'
      from public.bookings where id = v_b),
    'BF.6: agreeing to it reopens checkout (the paid quote is kept)');
  perform _t_ok(exists (select 1 from public.notifications
      where user_id = robert and type = 'checkout_needed' and booking_id = v_b),
    'BF.6: …and the owner is told to sign');
  perform _t_as(chloe);
  begin
    perform get_home_access(v_b);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_paid', 'BF.6: …so the entry codes stay locked until then');
  perform _t_ok((select count(*) from public.owner_profiles where id = robert) = 1,
    'BF.6: …while the owner''s emergency contact stays visible');
  perform _t_ok((select address from get_handoff_details(v_b) where kind = 'pick_up') = '1 Owner Ave',
    'BF.7: …and the sitter still sees where to bring the pet back');
  perform _t_as(robert);
  perform _t_ok((select count(*) from get_handoff_details(v_b)) = 2,
    'BF.7: …and the owner still sees both handoff places');

  insert into public.booking_consents (booking_id, kind, version, signer_id, signer_name)
  values (v_b, 'home_access', '1', robert, 'Robert');
  v_paid := pay_booking_demo(v_b);
  perform _t_ok((select paid_at is not null from public.bookings where id = v_b),
    'BF.6: signing home_access finishes checkout again');

  -- Longer stay → re-quoted, owner told the new total; checkout stays done
  v_prop := propose_handoff(v_b, 'pick_up', now() + interval '138 days');
  v_quote := quote_booking(chloe, 'boarding', now() + interval '134 days', now() + interval '138 days', 1);
  perform _t_as(chloe);
  perform respond_handoff(v_prop, true);
  perform _t_as(null);
  perform _t_ok((select paid_at is not null
        and (price_snapshot->>'total')::numeric = (v_quote->>'total')::numeric
        and (price_snapshot->>'total')::numeric > (v_paid->>'total')::numeric
      from public.bookings where id = v_b),
    'BF.6: a longer stay is re-quoted and stays paid');
  perform _t_ok(exists (select 1 from public.notifications
      where user_id = robert and type = 'price_updated' and booking_id = v_b),
    'BF.6: …and the owner gets the new total');
end;
$$;

-- ---------------------------------------------------------------------------
-- M (Phase 07B, 7B.1): inquiries, the thread, the knowledge base
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  coco constant uuid := '00000000-0000-4000-8000-0000000000c3';
  v_inq uuid;
  v_other uuid;
  v_msg uuid;
  v_draft uuid;
  v_err text;
begin
  -- Robert asks Chloe; she can ask only about her own pets and only a sitter
  perform _t_as(robert);
  insert into public.inquiries (owner_id, sitter_id, drop_off_at, pick_up_at, pet_ids)
  values (robert, chloe, now() + interval '200 days', now() + interval '203 days', array[max])
  returning id into v_inq;
  begin
    insert into public.inquiries (owner_id, sitter_id, drop_off_at, pick_up_at, pet_ids)
    values (robert, chloe, now() + interval '200 days', now() + interval '203 days', array[coco]);
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'M: an owner cannot ask about someone else''s pet');
  begin
    insert into public.inquiries (owner_id, sitter_id, drop_off_at, pick_up_at, pet_ids)
    values (robert, joy, now() + interval '200 days', now() + interval '203 days', array[max]);
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'M: …nor ask an owner');
  begin
    insert into public.inquiries (owner_id, sitter_id, drop_off_at, pick_up_at, pet_ids, status)
    values (robert, chloe, now() + interval '200 days', now() + interval '203 days', array[max], 'booked');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'M: …and a new inquiry cannot start as booked');

  insert into public.inquiry_messages (inquiry_id, author, sender_id, body)
  values (v_inq, 'owner', robert, 'Can you give Max his pill at 2 PM?') returning id into v_msg;
  begin
    insert into public.inquiry_messages (inquiry_id, author, body, drafted_by_ai, status)
    values (v_inq, 'ai', 'forged draft', true, 'draft');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'M: an owner cannot write an AI draft');
  begin
    insert into public.inquiry_messages (inquiry_id, author, sender_id, body)
    values (v_inq, 'sitter', robert, 'pretend to be Chloe');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'M: …nor write as the sitter');

  -- The AI draft arrives (service role): Chloe is told, Robert sees nothing of it
  perform _t_as(null);
  insert into public.inquiry_messages (inquiry_id, author, body, drafted_by_ai, status, grounding, model)
  values (v_inq, 'ai', 'Hi Robert! I''m available…', true, 'draft', '{"quote":{"total":268.13}}', 'm')
  returning id into v_draft;
  perform _t_ok(exists (select 1 from public.notifications
      where user_id = chloe and type = 'inquiry_received' and ref_id = v_inq),
    'M: the sitter is told the draft is ready');
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.inquiry_messages where inquiry_id = v_inq) = 1,
    'M: the owner sees her own message and not the AI draft');
  perform _t_as(chloe);
  perform _t_ok((select count(*) from public.inquiry_messages where inquiry_id = v_inq) = 2,
    'M: the sitter sees the question and the draft');

  -- Third parties see nothing
  perform _t_as(joy);
  perform _t_ok((select count(*) from public.inquiries) = 0 and (select count(*) from public.inquiry_messages) = 0,
    'M: a third party sees no inquiry and no message');
  perform _t_as(paul);
  perform _t_ok((select count(*) from public.inquiries) = 0 and (select count(*) from public.inquiry_messages) = 0,
    'M: another sitter sees none either');

  -- Chloe sends it through the RPC; a direct insert as the sitter is refused
  perform _t_as(chloe);
  begin
    insert into public.inquiry_messages (inquiry_id, author, sender_id, body)
    values (v_inq, 'sitter', chloe, 'a message written around the RPC');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'M: a sitter cannot insert a message directly (only through send_inquiry_reply)');
  perform _t_as(paul);
  begin
    perform send_inquiry_reply(v_inq, 'as Paul', null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'forbidden', 'M: another sitter cannot reply in Chloe''s thread');
  perform _t_as(robert);
  begin
    perform send_inquiry_reply(v_inq, 'as Robert', null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'forbidden', 'M: the owner cannot reply as the sitter');
  perform _t_as(chloe);
  begin
    perform send_inquiry_reply(v_inq, '   ', v_draft);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'body_required', 'M: an empty reply is refused');
  begin
    perform send_inquiry_reply(v_inq, 'hi', gen_random_uuid());
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'draft_not_found', 'M: a draft that is not in this thread is refused');
  perform send_inquiry_reply(v_inq, 'Hi Robert! I''m available…', v_draft);
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.inquiry_messages where inquiry_id = v_inq and author = 'sitter') = 1
      and (select count(*) from public.inquiry_messages where inquiry_id = v_inq and author = 'ai') = 0,
    'M: the owner sees the sitter''s sent reply, still not the draft');
  perform _t_ok((select grounding -> 'quote' ->> 'total' from public.inquiry_messages
        where inquiry_id = v_inq and author = 'sitter') = '268.13'
      and (select grounding ? 'needs_sitter' from public.inquiry_messages where inquiry_id = v_inq and author = 'sitter') = false,
    'M: the reply carries the quote but none of the draft''s internal notes');
  perform _t_ok((select drafted_by_ai and confirmed_by_sitter_at is not null and sender_id = chloe
        from public.inquiry_messages where inquiry_id = v_inq and author = 'sitter'),
    'M: …marked as approved by the sitter');
  perform _t_ok(exists (select 1 from public.notifications
      where user_id = robert and type = 'inquiry_replied' and ref_id = v_inq),
    'M: the owner is told Chloe replied');

  -- The sitter opening the thread is the only "read"
  perform _t_ok((select read_at is null from public.inquiry_messages where id = v_msg),
    'M: the owner''s message is unread until the sitter opens the thread');
  perform _t_as(paul);
  perform mark_inquiry_read(v_inq);
  perform _t_as(chloe);
  perform _t_ok((select read_at is null from public.inquiry_messages where id = v_msg),
    'M: another sitter opening it marks nothing');
  perform mark_inquiry_read(v_inq);
  perform _t_ok((select read_at is not null from public.inquiry_messages where id = v_msg),
    'M: the sitter opening the thread marks the owner''s message read');

  -- A reply that is not visible yet stays hidden from the owner
  perform _t_as(null);
  insert into public.inquiry_messages (inquiry_id, author, sender_id, body, status, visible_at)
  values (v_inq, 'sitter', chloe, 'later', 'sent', now() + interval '1 hour');
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.inquiry_messages where inquiry_id = v_inq and body = 'later') = 0,
    'M: a reply before its visible_at is hidden from the owner');

  -- Booking link: only her own booking with this sitter
  begin
    update public.inquiries set booking_id = (select id from public.bookings where owner_id = joy limit 1)
    where id = v_inq;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err is not null or (select booking_id is null from public.inquiries where id = v_inq),
    'M: an inquiry cannot be linked to someone else''s booking');
  update public.inquiries set status = 'closed' where id = v_inq;
  perform _t_ok((select status = 'closed' from public.inquiries where id = v_inq), 'M: the owner can close her inquiry');
  begin
    update public.inquiries set owner_id = joy where id = v_inq;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'M: …but cannot change who it belongs to');

  -- Sitter policies: written by the sitter only
  perform _t_as(chloe);
  update public.sitter_profiles set policies = 'No dogs over 20 kg.' where id = chloe;
  perform _t_ok((select policies from public.sitter_profiles where id = chloe) = 'No dogs over 20 kg.',
    'M: a sitter writes her own policies');
  perform _t_as(paul);
  update public.sitter_profiles set policies = 'hijacked' where id = chloe;
  perform _t_ok((select policies from public.sitter_profiles where id = chloe) = 'No dogs over 20 kg.',
    'M: …and nobody else can');

  -- The knowledge base is service-role only
  perform _t_as(null);
  insert into public.knowledge_chunks (scope, sitter_id, source_type, source_id, content, embedding)
  values ('sitter', chloe, 'sitter_policy', chloe, 'No dogs over 20 kg.', (select array_fill(0.1::real, array[1024])::extensions.vector(1024)));
  v_other := null;
  perform _t_as(robert);
  begin
    perform count(*) from public.knowledge_chunks;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'M: knowledge_chunks is not readable by authenticated');
  perform _t_as(null, 'anon');
  begin
    perform count(*) from public.knowledge_chunks;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'M: …nor by anon');
  perform _t_as(robert);
  begin
    perform * from public.match_knowledge((select array_fill(0.1::real, array[1024])::extensions.vector(1024)), chloe, array[max], robert);
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'M: …and match_knowledge is not callable by clients');
  -- match_knowledge stays inside each source's scope (service role)
  perform _t_as(null);
  insert into public.knowledge_chunks (scope, sitter_id, owner_id, source_type, source_id, content, embedding)
  values
    ('owner', paul, robert, 'inquiry', gen_random_uuid(), 'Robert asked Paul about weekends', (select array_fill(0.1::real, array[1024])::extensions.vector(1024))),
    ('owner', chloe, robert, 'inquiry', gen_random_uuid(), 'Robert asked Chloe about pills', (select array_fill(0.1::real, array[1024])::extensions.vector(1024))),
    ('owner', chloe, joy, 'inquiry', gen_random_uuid(), 'Joy asked Chloe about Toto', (select array_fill(0.1::real, array[1024])::extensions.vector(1024)));
  insert into public.knowledge_chunks (scope, sitter_id, source_type, source_id, content, embedding)
  values ('sitter', paul, 'sitter_policy', paul, 'Paul never takes cats', (select array_fill(0.1::real, array[1024])::extensions.vector(1024)));
  insert into public.knowledge_chunks (scope, pet_id, source_type, source_id, content, embedding)
  values ('pet', coco, 'life_record', gen_random_uuid(), 'Coco is afraid of thunder', (select array_fill(0.1::real, array[1024])::extensions.vector(1024)));
  perform _t_ok((select array_agg(content order by content) from public.match_knowledge(
        (select array_fill(0.1::real, array[1024])::extensions.vector(1024)), chloe, array[max], robert, 20))
      = array['No dogs over 20 kg.', 'Robert asked Chloe about pills'],
    'M: a search reaches only this sitter''s policy and this owner × sitter conversation — no other pet, sitter or owner');
  -- tone_samples: service role only, and a search never reaches another sitter's voice or a thrown-away draft
  perform _t_as(null);
  insert into public.tone_samples (sitter_id, kind, source, context_summary, final_text, embedding) values
    (chloe, 'inquiry', 'approved', 'asks about a pill', 'Hi! Happy to help 🐾', (select array_fill(0.1::real, array[1024])::extensions.vector(1024))),
    (chloe, 'inquiry', 'regenerated', 'asks about a pill', '', (select array_fill(0.1::real, array[1024])::extensions.vector(1024))),
    (chloe, 'report', 'approved', 'daily report', 'A lovely day!', (select array_fill(0.1::real, array[1024])::extensions.vector(1024))),
    (paul, 'inquiry', 'approved', 'asks about a pill', 'Hello. Yes.', (select array_fill(0.1::real, array[1024])::extensions.vector(1024)));
  perform _t_ok((select array_agg(final_text) from public.match_tone(
        (select array_fill(0.1::real, array[1024])::extensions.vector(1024)), chloe, 'inquiry', 10))
      = array['Hi! Happy to help 🐾'],
    'M: match_tone returns only this sitter''s approved / edited examples of this kind');
  perform _t_as(chloe);
  begin
    perform count(*) from public.tone_samples;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'M: tone_samples is not readable by clients, not even the sitter''s own');
  begin
    perform style_card from public.sitter_profiles where id = chloe;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'M: …and neither is the style card');
  -- Auto-send settings: consent first, the sitter's own row only, and the mode is not a plain column update
  perform _t_as(chloe);
  perform _t_ok((public.get_my_ai_reply_mode() ->> 'mode') = 'manual' and (public.get_my_ai_reply_mode() ->> 'consented') = 'false',
    'M: auto-send is off until the sitter turns it on');
  begin
    perform set_ai_reply_mode('auto', false);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'consent_required', 'M: auto-send needs the sitter''s consent');
  begin
    update public.sitter_profiles set ai_reply_mode = 'auto' where id = chloe;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'M: …and cannot be switched with a plain update');
  perform set_ai_reply_mode('auto', true);
  perform _t_ok((get_my_ai_reply_mode() ->> 'mode') = 'auto' and (get_my_ai_reply_mode() ->> 'consented') = 'true',
    'M: with consent auto-send turns on');
  perform set_ai_reply_mode('manual');
  perform set_ai_reply_mode('auto');
  perform _t_ok((get_my_ai_reply_mode() ->> 'mode') = 'auto',
    'M: turning it off and on again needs no second consent');
  perform _t_as(robert);
  begin
    perform set_ai_reply_mode('auto', true);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'forbidden', 'M: an owner has no auto-send setting');

  -- A notice that is written now but appears later
  perform _t_as(null);
  insert into public.notifications (user_id, type, title, ref_id, visible_at)
  values (robert, 'inquiry_replied', 'later', v_inq, now() + interval '1 hour'),
         (robert, 'inquiry_replied', 'now', v_inq, now() - interval '1 second');
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.notifications where title = 'now') = 1
      and (select count(*) from public.notifications where title = 'later') = 0,
    'M: a notice with a later visible_at stays hidden until then');
  perform _t_as(null);
  update public.inquiries set reply_typing_at = now() + interval '5 seconds', reply_visible_at = now() + interval '30 seconds' where id = v_inq;
  perform _t_as(robert);
  perform _t_ok((select reply_visible_at is not null from public.inquiries where id = v_inq),
    'M: the owner can read when the reply will appear (times only, no text)');
  begin
    update public.inquiries set reply_visible_at = now() where id = v_inq;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'M: …but cannot change it');
end;
$$;

-- ---------------------------------------------------------------------------
-- N (Phase 07C, 7C.1): home safe, reviews, Pet Life Records
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  max uuid;
  coco constant uuid := '00000000-0000-4000-8000-0000000000c3';
  v_b uuid;
  v_open uuid;
  v_rev public.reviews;
  v_err text;
  v_sum jsonb;
begin
  -- A pet of their own (earlier scenarios keep Max booked far into the future)
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Rex') returning id into max;
  -- A stay: Received, not Returned yet
  perform _t_as(null);
  v_b := _t_booking(robert, chloe, array[max], now() + interval '300 days', now() + interval '302 days', 'confirmed', true);

  perform _t_as(robert);
  begin
    perform submit_review(v_b, 5, 'Great');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'stay_not_finished', 'N: no review before the pets are back');

  -- Returned → home safe + the owner is asked for a review, in that order
  perform _t_as(chloe);
  perform complete_handoff(v_b, 'pick_up');
  perform _t_as(null);
  perform _t_ok((select title from public.notifications where user_id = robert and type = 'pet_picked_up' and booking_id = v_b)
      = 'Rex is home safe 🏠', 'N: Returned says the pet is home safe');
  perform _t_ok((select title from public.notifications where user_id = robert and type = 'review_requested' and booking_id = v_b)
      = 'Thanks for trusting Chloe! How was Rex''s stay? ⭐', 'N: …and asks for a review');
  perform _t_ok((select created_at from public.notifications where type = 'review_requested' and booking_id = v_b)
      >= (select created_at from public.notifications where type = 'pet_picked_up' and booking_id = v_b),
    'N: …right after it');

  -- Who may review
  perform _t_as(chloe);
  begin
    perform submit_review(v_b, 5, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'forbidden', 'N: the sitter cannot review their own stay');
  perform _t_as(joy);
  begin
    perform submit_review(v_b, 5, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'forbidden', 'N: a third party cannot review it');
  perform _t_as(robert);
  begin
    insert into public.reviews (booking_id, owner_id, sitter_id, rating) values (v_b, robert, chloe, 5);
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'N: reviews are not written around submit_review');
  begin
    perform submit_review(v_b, 6, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_rating', 'N: ★1–5 only');
  begin
    perform submit_review(v_b, 4, repeat('x', 501));
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'comment_too_long', 'N: a comment is at most 500 characters');

  v_rev := submit_review(v_b, 5, '  Lovely, Rex came home happy!  ');
  perform _t_ok(v_rev.rating = 5 and v_rev.comment = 'Lovely, Rex came home happy!', 'N: the owner reviews once the pets are back');
  begin
    perform submit_review(v_b, 1, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'already_reviewed', 'N: one review per booking');
  perform _t_as(null);
  perform _t_ok(exists (select 1 from public.notifications where user_id = chloe and type = 'review_received' and ref_id = v_rev.id),
    'N: the sitter is told');

  -- Rows are private to the two parties; the summary is public
  perform _t_as(chloe);
  perform _t_ok((select count(*) from public.reviews) >= 1, 'N: the sitter reads reviews about them');
  perform _t_as(joy);
  perform _t_ok((select count(*) from public.reviews) = 0, 'N: a third party reads no review rows');
  v_sum := sitter_rating_summary(chloe);
  perform _t_ok((v_sum ->> 'count')::int = 1 and (v_sum ->> 'avg')::numeric = 5.0
      and v_sum -> 'recent' -> 0 ->> 'reviewer' = 'Robert' and v_sum -> 'recent' -> 0 ->> 'comment' like 'Lovely%',
    'N: …but anyone signed in sees the average, the count and recent comments with a first name');
  perform _t_ok(not (v_sum::text like '%' || robert::text || '%'), 'N: …and no id of the reviewer');
  perform _t_as(null, 'anon');
  begin
    perform sitter_rating_summary(chloe);
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'N: signed-out visitors get no summary');

  -- Life Records: written by the service role, read by the right people
  perform _t_as(null);
  insert into public.pet_life_records (pet_id, booking_id, sitter_id, summary)
  values (max, v_b, chloe, '{"eats":"finishes breakfast","heads_up":["chicken allergy"]}');
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.pet_life_records where pet_id = max) = 1, 'N: the owner reads their pet''s record');
  begin
    insert into public.pet_life_records (pet_id, booking_id, summary) values (max, v_b, '{}');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'N: clients never write records');
  begin
    perform source_snapshot from public.pet_life_records;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'N: even the owner reads the summary, not the raw source_snapshot');
  perform _t_as(chloe);
  perform _t_ok((select count(*) from public.pet_life_records) = 1,
    'N: the sitter still reads it until their wrap-up window (2 h after the agreed pick-up) closes');
  perform _t_as(null);
  update public.booking_handoffs set scheduled_at = case kind when 'drop_off' then now() - interval '2 days' else now() - interval '3 hours' end
  where booking_id = v_b;
  perform _t_as(chloe);
  perform _t_ok((select count(*) from public.pet_life_records) = 0,
    'N: …then the sitter of a finished stay no longer reads the record');
  perform _t_as(joy);
  perform _t_ok((select count(*) from public.pet_life_records) = 0, 'N: a third party reads no record');

  -- Paul is asked to care for Max: a request opens it
  perform _t_as(null);
  perform _t_booking(robert, paul, array[max], now() + interval '330 days', now() + interval '332 days', 'requested');
  perform _t_as(paul);
  perform _t_ok((select count(*) from public.pet_life_records where pet_id = max) = 1,
    'N: a sitter with a pending request for the pet reads its record');
  perform _t_as(null);
  update public.bookings set status = 'declined' where owner_id = robert and sitter_id = paul;
  perform _t_as(paul);
  perform _t_ok((select count(*) from public.pet_life_records) = 0, 'N: …until the request ends');

  -- …or an open inquiry
  perform _t_as(robert);
  insert into public.inquiries (owner_id, sitter_id, drop_off_at, pick_up_at, pet_ids)
  values (robert, paul, now() + interval '340 days', now() + interval '342 days', array[max]) returning id into v_open;
  perform _t_as(paul);
  perform _t_ok((select count(*) from public.pet_life_records where pet_id = max) = 1,
    'N: a sitter with an open inquiry about the pet reads its record');
  perform _t_as(robert);
  update public.inquiries set status = 'closed' where id = v_open;
  perform _t_as(paul);
  perform _t_ok((select count(*) from public.pet_life_records) = 0, 'N: …until the inquiry is closed');
  perform _t_as(joy);
  begin
    perform count(*) from public.pet_life_records where pet_id = coco;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err is null, 'N: a query on someone else''s pet just returns nothing');
end;
$$;


-- ---------------------------------------------------------------------------
-- O (011g, FB-25 · FB-29, 015s): the sitter's review of an owner, read by that owner and by every sitter
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  pet uuid;
  v_b uuid;
  v_err text;
  v_notes int;
  v_sum jsonb;
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Notey') returning id into pet;
  v_b := _t_booking(robert, chloe, array[pet], now() + interval '310 days', now() + interval '312 days', 'confirmed', true);

  perform _t_as(chloe);
  begin
    perform save_owner_note(v_b, 4, 'Clear care notes');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'stay_not_finished', 'O: no owner note before the pets are back');

  perform complete_handoff(v_b, 'pick_up');
  perform _t_as(null); -- count every notice of the owner (RLS hides them from the sitter)
  select count(*) into v_notes from public.notifications where user_id = robert;
  perform _t_as(chloe);
  perform save_owner_note(v_b, 4, '  Clear care notes  ');
  perform _t_ok((select rating = 4 and comment = 'Clear care notes' from public.sitter_owner_notes where booking_id = v_b),
    'O: the sitter saves a review of the owner (trimmed)');
  perform save_owner_note(v_b, 5, 'Happy to host again');
  perform _t_ok((select count(*) = 1 and max(rating) = 5 from public.sitter_owner_notes where booking_id = v_b),
    'O: saving again edits the same note');
  perform _t_as(null);
  perform _t_ok((select count(*) from public.notifications where user_id = robert) = v_notes,
    'O: the owner is not told');

  perform _t_as(robert);
  perform _t_ok((select count(*) from public.sitter_owner_notes where booking_id = v_b) = 1, 'O: the owner reads the review about them (015s)');
  v_sum := owner_rating_summary(robert);
  perform _t_ok((v_sum ->> 'count')::int = 1 and v_sum -> 'reviews' -> 0 ->> 'reviewer' = 'Chloe'
      and (v_sum -> 'reviews' -> 0 ->> 'mine')::boolean = false,
    'O: …and in their summary, with the sitter''s first name');
  begin
    perform save_owner_note(v_b, 1, 'From the owner');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'forbidden', 'O: …or write one');
  perform _t_as(paul);
  perform _t_ok((select count(*) from public.sitter_owner_notes where booking_id = v_b) = 0, 'O: another sitter cannot read the row');
  v_sum := owner_rating_summary(robert);
  perform _t_ok((v_sum ->> 'count')::int = 1 and v_sum -> 'reviews' -> 0 ->> 'comment' = 'Happy to host again'
      and v_sum ->> 'avg' = '5.0',
    'O: …but sees the owner''s average and every review in owner_rating_summary (015s)');
  perform _t_as(joy);
  perform _t_ok(owner_rating_summary(robert) is null, 'O: another owner does not see it');
  perform _t_as(paul);
  begin
    insert into public.sitter_owner_notes (booking_id, sitter_id, owner_id, rating) values (v_b, paul, robert, 1);
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err is not null, 'O: no direct insert, only save_owner_note');
  perform _t_as(chloe);
  begin
    perform save_owner_note(v_b, 6, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_rating', 'O: 1 to 5 stars');
end;
$$;


-- ---------------------------------------------------------------------------
-- P (011h, FB-28): an owner's favorite sitters
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  v_err text;
begin
  perform _t_as(robert);
  insert into public.owner_favorite_sitters (sitter_id) values (chloe);
  perform _t_ok((select count(*) from public.owner_favorite_sitters where sitter_id = chloe) = 1,
    'P: an owner adds a sitter to their favorites (owner_id defaults to them)');
  begin
    insert into public.owner_favorite_sitters (sitter_id) values (joy);
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err is not null, 'P: only a sitter can be a favorite');
  begin
    insert into public.owner_favorite_sitters (owner_id, sitter_id) values (joy, chloe);
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err is not null, 'P: …and only into their own list');
  perform _t_as(joy);
  perform _t_ok((select count(*) from public.owner_favorite_sitters) = 0, 'P: another owner does not see the list');
  perform _t_as(chloe);
  perform _t_ok((select count(*) from public.owner_favorite_sitters) = 0, 'P: the sitter is not told (cannot read it)');
  perform _t_as(robert);
  delete from public.owner_favorite_sitters where sitter_id = chloe;
  perform _t_ok((select count(*) from public.owner_favorite_sitters) = 0, 'P: the owner removes a favorite');
end;
$$;

-- ---------------------------------------------------------------------------
-- Care window follows Received (011i): the pets are at the sitter's early → check-ins open at once
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  v_pet uuid;
  v_booking uuid;
  v_err text;
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Early') returning id into v_pet;
  -- Agreed drop-off an hour away, pick-up in three days; nothing received yet.
  v_booking := _t_booking(robert, chloe, array[v_pet], now() + interval '1 hour', now() + interval '3 days', 'confirmed');

  perform _t_as(chloe);
  perform _t_ok(not in_care_window(v_pet, now()), '011i: before Received and before the agreed drop-off the window is closed');
  begin
    perform log_care_checkin(v_pet, 'meal', 'all');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_in_care_window', '011i: …and a check-in is refused');

  -- The sitter taps Received an hour early (allowed from 2 h before).
  perform complete_handoff(v_booking, 'drop_off');
  perform _t_ok(in_care_window(v_pet, now()), '011i: after an early Received the window is open now');
  perform log_care_checkin(v_pet, 'meal', 'all');
  perform _t_ok(
    (select count(*) from public.care_checkins where pet_id = v_pet and kind = 'meal' and created_by = chloe) = 1,
    '011i: an early Received lets the sitter log a check-in before the agreed time');

  -- Nobody else gains access, and the owner still cannot log one.
  perform _t_as(paul);
  perform _t_ok(not in_care_window(v_pet, now()), '011i: another sitter is not inside the window');
  perform _t_as(robert);
  perform _t_ok(not in_care_window(v_pet, now()), '011i: the owner is not inside the window');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Stay capacity check (011c, RV-1): the inquiry AI's availability = request_booking's capacity rule
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  d constant date := app_today() + 200;
  v text;
  v_err text;
begin
  -- Chloe opens four days with room for 2, then lowers one night to 1 (the newest open row sets the spots).
  perform _t_as(chloe);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (chloe, 'open', d, d + 3, 'morning', '08:00', '12:00', 2),
         (chloe, 'open', d, d + 3, 'afternoon', '12:00', '18:00', 2),
         (chloe, 'open', d, d + 3, 'overnight', '18:00', '08:00', 2);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (chloe, 'open', d + 2, d + 2, 'overnight', '18:00', '08:00', 1);

  perform _t_as(robert);
  v := stay_capacity_check(chloe, local_ts(d, '10:00'), local_ts(d + 1, '10:00'), 2);
  perform _t_ok(v is null, '011c: two pets fit where every slot has two spots');
  v := stay_capacity_check(chloe, local_ts(d + 1, '10:00'), local_ts(d + 3, '10:00'), 2);
  perform _t_ok(v = format('%s overnight', d + 2),
    '011c: two pets and a night with one spot left → that slot, as request_booking would refuse');
  v := stay_capacity_check(chloe, local_ts(d + 1, '10:00'), local_ts(d + 3, '10:00'), 1);
  perform _t_ok(v is null, '011c: …while one pet still fits');
  v := stay_capacity_check(chloe, local_ts(d + 10, '10:00'), local_ts(d + 11, '10:00'), 1);
  perform _t_ok(v is null,
    '011c (014d): days the sitter never touched are open with their default spots');
  v := stay_capacity_check(chloe, local_ts(d + 3, '10:00'), local_ts(d + 5, '10:00'), 1);
  perform _t_ok(v is null,
    '011c (014d): a stay running past the opened days still fits the default spots');
  v := stay_capacity_check(chloe, local_ts(d + 1, '10:00'), local_ts(d, '10:00'), 1);
  perform _t_ok(v = 'invalid_window', '011c: a reversed window is invalid_window');

  perform _t_as(null, 'anon');
  begin
    perform stay_capacity_check(chloe, local_ts(d, '10:00'), local_ts(d + 1, '10:00'), 1);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err like 'permission denied%', '011c: anon cannot call it');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Inquiry access (011e, RV-4 / FB-31 + RV-5's limits): names and the asked pets for the asked sitter
-- ---------------------------------------------------------------------------

do $$
declare
  ivy constant uuid := '00000000-0000-4000-8000-0000000000a9';
  sam constant uuid := '00000000-0000-4000-8000-0000000000b9';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  pip constant uuid := '00000000-0000-4000-8000-0000000000c9';
  v_inq uuid;
begin
  -- A new owner and a new sitter with no booking between them.
  perform _t_as(null);
  insert into auth.users (id, email, raw_user_meta_data) values
    (ivy, 'ivy@example.test', '{"role":"owner","display_name":"Ivy"}'),
    (sam, 'sam@example.test', '{"role":"sitter","display_name":"Sam"}');
  insert into public.pets (id, owner_id, species, name) values (pip, ivy, 'dog', 'Pip');
  insert into public.pet_allergies (pet_id, allergen) values (pip, 'chicken');

  perform _t_as(sam);
  perform _t_ok(not exists (select 1 from public.profiles where id = ivy), '011e: before any inquiry Sam cannot see Ivy');
  perform _t_ok(not exists (select 1 from public.pets where id = pip), '011e: …nor her pet');

  perform _t_as(ivy);
  insert into public.inquiries (owner_id, sitter_id, drop_off_at, pick_up_at, pet_ids)
  values (ivy, sam, now() + interval '10 days', now() + interval '12 days', array[pip])
  returning id into v_inq;

  perform _t_as(sam);
  perform _t_ok((select display_name from public.profiles where id = ivy) = 'Ivy',
    '011e: the asked sitter sees the owner''s name (no more "An owner")');
  perform _t_ok((select name from public.pets where id = pip) = 'Pip', '011e: …and the pet asked about');
  perform _t_ok(exists (select 1 from public.pet_allergies where pet_id = pip), '011e: …and its allergies');

  perform _t_as(paul);
  perform _t_ok(not exists (select 1 from public.profiles where id = ivy), '011e: a sitter who was not asked sees no name');
  perform _t_ok(not exists (select 1 from public.pets where id = pip), '011e: …and no pet');

  -- The stay asked about is over: the pet goes, the name stays.
  perform _t_as(null);
  update public.inquiries set drop_off_at = now() - interval '3 days', pick_up_at = now() - interval '1 day' where id = v_inq;
  perform _t_as(sam);
  perform _t_ok(not exists (select 1 from public.pets where id = pip), '011e: after the asked stay the pet is hidden again');
  perform _t_ok(exists (select 1 from public.profiles where id = ivy), '011e: …while the name stays');

  -- Asked more than 30 days ago (stay still ahead), or closed: hidden too.
  perform _t_as(null);
  update public.inquiries
  set drop_off_at = now() + interval '10 days', pick_up_at = now() + interval '12 days', created_at = now() - interval '31 days'
  where id = v_inq;
  perform _t_as(sam);
  perform _t_ok(not exists (select 1 from public.pets where id = pip), '011e: an inquiry older than 30 days no longer opens the pet');
  perform _t_as(null);
  update public.inquiries set created_at = now(), status = 'closed' where id = v_inq;
  perform _t_as(sam);
  perform _t_ok(not exists (select 1 from public.pets where id = pip), '011e: a closed inquiry no longer opens the pet');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Same-thread date change (011j) and the sitter's reply outcome (011k), FB-34
-- ---------------------------------------------------------------------------

do $$
declare
  kai constant uuid := '00000000-0000-4000-8000-0000000000aa';
  lou constant uuid := '00000000-0000-4000-8000-0000000000ba';
  kip constant uuid := '00000000-0000-4000-8000-0000000000ca';
  v_inq uuid;
  v_draft uuid;
  v_err text;
  v_msg public.inquiry_messages;
begin
  perform _t_as(null);
  insert into auth.users (id, email, raw_user_meta_data) values
    (kai, 'kai@example.test', '{"role":"owner","display_name":"Kai"}'),
    (lou, 'lou@example.test', '{"role":"sitter","display_name":"Lou"}');
  insert into public.pets (id, owner_id, species, name) values (kip, kai, 'dog', 'Kip');

  perform _t_as(kai);
  insert into public.inquiries (owner_id, sitter_id, drop_off_at, pick_up_at, pet_ids)
  values (kai, lou, now() + interval '5 days', now() + interval '7 days', array[kip]) returning id into v_inq;
  insert into public.inquiry_messages (inquiry_id, author, sender_id, body) values (v_inq, 'owner', kai, 'Can you host Kip?');

  -- 011j: the owner moves the dates in the same thread; one owner message records it.
  v_msg := public.change_inquiry_dates(v_inq, now() + interval '20 days', now() + interval '22 days', 'owner_home', null, 'Changed dates');
  perform _t_ok(v_msg.author = 'owner' and v_msg.inquiry_id = v_inq and v_msg.body = 'Changed dates', '011j: the change leaves an owner message in the thread');
  perform _t_ok((select drop_off_at from public.inquiries where id = v_inq) > now() + interval '19 days', '011j: the inquiry has the new drop-off');
  perform _t_ok((select drop_off_location_type from public.inquiries where id = v_inq) = 'owner_home', '011j: …a given place is changed');
  perform _t_ok((select pick_up_location_type from public.inquiries where id = v_inq) = 'sitter_home', '011j: …a null place is kept');
  perform _t_ok((select count(*) from public.inquiries where owner_id = kai) = 1, '011j: still one inquiry (the thread continues)');

  v_err := null;
  begin
    perform public.change_inquiry_dates(v_inq, now() + interval '22 days', now() + interval '20 days', null, null, 'x');
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_window', '011j: a pick-up before the drop-off is refused');
  v_err := null;
  begin
    perform public.change_inquiry_dates(v_inq, now() + interval '20 days', now() + interval '60 days', null, null, 'x');
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_window', '011j: a trip over 31 days is refused');
  v_err := null;
  begin
    perform public.change_inquiry_dates(v_inq, now() + interval '20 days', now() + interval '22 days', null, null, '   ');
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'body_required', '011j: an empty message is refused');

  perform _t_as(lou);
  v_err := null;
  begin
    perform public.change_inquiry_dates(v_inq, now() + interval '20 days', now() + interval '22 days', null, null, 'x');
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'forbidden', '011j: the sitter cannot change the owner''s dates');

  -- 011k: the outcome the sitter chose decides what the owner sees.
  perform _t_as(null);
  insert into public.inquiry_messages (inquiry_id, author, sender_id, body, drafted_by_ai, status, grounding)
  values (v_inq, 'ai', null, 'Yes! $100', true, 'draft',
    '{"quote":{"total":100},"sources":[{"id":"policy-0"}],"availability":{"can_host":true}}') returning id into v_draft;

  perform _t_as(lou);
  v_msg := public.send_inquiry_reply(v_inq, 'Sorry, I cannot.', v_draft, 'decline');
  perform _t_ok((v_msg.grounding #>> '{availability,can_host}') = 'false', '011k: a decline says can_host false');
  perform _t_ok(v_msg.grounding -> 'quote' is null, '011k: …and carries no quote');
  perform _t_ok(v_msg.drafted_by_ai and v_msg.confirmed_by_sitter_at is not null, '011k: …yet it is still the approved draft');
  v_msg := public.send_inquiry_reply(v_inq, 'How about Nov 3?', null, 'suggest');
  perform _t_ok((v_msg.grounding #>> '{availability,can_host}') = 'false' and not v_msg.drafted_by_ai, '011k: a suggestion says can_host false');
  v_msg := public.send_inquiry_reply(v_inq, 'Yes, happy to!', v_draft, 'accept');
  perform _t_ok((v_msg.grounding #>> '{quote,total}') = '100' and (v_msg.grounding #>> '{availability,can_host}') = 'true', '011k: an accept keeps the draft''s quote and availability');
  v_msg := public.send_inquiry_reply(v_inq, 'Plain', v_draft);
  perform _t_ok((v_msg.grounding #>> '{quote,total}') = '100', '011k: no outcome behaves as before');
  v_err := null;
  begin
    perform public.send_inquiry_reply(v_inq, 'x', v_draft, 'maybe');
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_outcome', '011k: an unknown outcome is refused');

  -- The owner sees the decline without a quote.
  perform _t_as(kai);
  perform _t_ok((select count(*) from public.inquiry_messages where inquiry_id = v_inq and author = 'sitter') = 4, '011k: the owner sees the sent replies');
  perform _t_ok(not exists (select 1 from public.inquiry_messages where inquiry_id = v_inq and body = 'Sorry, I cannot.' and grounding ? 'quote'), '011k: …the decline among them has no quote');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 011l booking steps (D60): the sitter's first yes holds the dates; one owner at a time;
-- the stage is computed; the sweep nudges after 2 days and cancels 3 days later.
-- Robert / Joy ↔ Allen are first-time pairs (Allen takes one owner at a time by default);
-- Robert ↔ Chloe have met.
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  allen constant uuid := '00000000-0000-4000-8000-0000000000b3';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  mochi constant uuid := '00000000-0000-4000-8000-0000000000c2';
  coco constant uuid := '00000000-0000-4000-8000-0000000000c3';
  toto constant uuid := '00000000-0000-4000-8000-0000000000c4';
  e constant date := app_today() + 120;
  v1 uuid;
  v2 uuid;
  v3 uuid;
  v4 uuid;
  vc uuid;
  v_err text;
  v_detail text;
  s jsonb;
  r record;
begin
  perform _t_as(allen);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (allen, 'open', e - 1, e + 10, 'morning', '08:00', '12:00', 3),
         (allen, 'open', e - 1, e + 10, 'afternoon', '12:00', '18:00', 3),
         (allen, 'open', e - 1, e + 10, 'overnight', '18:00', '08:00', 3);
  perform _t_as(chloe);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (chloe, 'open', e - 1, e + 10, 'morning', '08:00', '12:00', 3),
         (chloe, 'open', e - 1, e + 10, 'afternoon', '12:00', '18:00', 3),
         (chloe, 'open', e - 1, e + 10, 'overnight', '18:00', '08:00', 3);
  perform _t_ok(not (select accepts_multiple_owners from public.sitter_profiles where id = paul),
    '011l: a sitter takes one owner at a time by default');

  -- A first-time request starts at "requested"; nothing happens without the sitter's first yes.
  perform _t_as(robert);
  v1 := request_booking(allen, array[max], local_ts(e, '09:00'), 'sitter_home', null,
    local_ts(e + 2, '17:00'), 'sitter_home', null, null);
  select * into r from get_booking_stages(array[v1]);
  perform _t_ok(r.stage = 'requested' and r.next_actor = 'sitter', '011l: a first request waits for the sitter');
  -- (015f: the owner may now propose a time or ask to skip before the first yes; tested there.)
  v_err := null;
  begin
    perform express_interest(v1);
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_allowed', '011l: the owner cannot give the sitter''s first yes');

  -- Before the first yes nothing is held: Joy can ask for the same dates too.
  perform _t_as(joy);
  v2 := request_booking(allen, array[toto], local_ts(e, '09:00'), 'sitter_home', null,
    local_ts(e + 2, '17:00'), 'sitter_home', null, null);
  perform _t_ok(v2 is not null, '011l: a request without a first yes holds nothing');
  -- Joy and Allen have met in an earlier scenario; make this one a first-time pair.
  perform _t_as(null);
  perform _t_meet(v2, 'required');

  -- The first yes holds the dates.
  perform _t_as(allen);
  perform express_interest(v1);
  perform express_interest(v1);
  perform _t_as(null);
  perform _t_ok((select sitter_interest_at is not null and meet_greet_due_at > now() + interval '1 day 23 hours'
      from public.bookings where id = v1),
    '011l: the first yes starts the hold and a 2-day clock (and is idempotent)');
  perform _t_ok((select count(*) from public.notifications where user_id = robert and type = 'booking_interest'
      and booking_id = v1) = 1,
    '011l: the owner is told once');
  perform _t_as(robert);
  select * into r from get_booking_stages(array[v1]);
  perform _t_ok(r.stage = 'meet_greet' and r.next_actor = 'both', '011l: after the first yes the stage is meet_greet');
  perform propose_meet_greet(v1, 'video', now() + interval '1 day');
  select * into r from get_booking_stages(array[v1]);
  perform _t_ok(r.stage = 'meet_greet' and r.next_actor = 'sitter', '011l: a proposal waits for the other side');
  perform _t_as(joy);
  perform _t_ok((select count(*) from get_booking_stages(array[v1])) = 0, '011l: stages are only readable by the two parties');

  -- One owner at a time: Joy cannot take the held dates, in any way.
  perform _t_as(allen);
  v_err := null;
  begin
    perform express_interest(v2);
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'sitter_unavailable', '011l: a second owner cannot be held on the same dates');
  perform _t_as(joy);
  v_err := null;
  begin
    perform request_booking(allen, array[coco], local_ts(e + 1, '09:00'), 'sitter_home', null,
      local_ts(e + 1, '17:00'), 'sitter_home', null, null);
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform _t_ok(v_err = 'sitter_unavailable' and v_detail like '%' || (e + 1)::text || '%',
    '011l: a new request on held dates is refused with the slot in detail');
  perform _t_ok(not exists (select 1 from search_sitters(local_ts(e, '09:00'), local_ts(e + 2, '17:00'), 1) x
      where x.sitter_id = allen),
    '011l: search does not offer a sitter whose dates another owner holds');
  perform _t_ok(stay_capacity_check(allen, local_ts(e, '09:00'), local_ts(e + 2, '17:00'), 1) is not null,
    '011l: the inquiry AI''s can-host check sees the hold too');
  perform _t_ok(stay_capacity_check(allen, local_ts(e + 5, '09:00'), local_ts(e + 6, '17:00'), 1) is null,
    '011l: …and free dates still fit');
  select * into r from search_sitters(local_ts(e + 5, '09:00'), local_ts(e + 6, '17:00'), 1) x where x.sitter_id = allen;
  perform _t_ok(r.sitter_id = allen and r.accepts_multiple_owners = false,
    '011l: search shows the sitter''s setting');

  -- The sitter cannot block the held days.
  perform _t_as(allen);
  v_err := null;
  begin
    insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot)
    values (allen, 'blocked', e, e + 2, 'morning');
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'overlaps_confirmed_booking', '011l: a hold cannot be blocked over');

  -- A repeat pair has nothing to say yes to.
  perform _t_as(robert);
  vc := request_booking(chloe, array[mochi], local_ts(e, '09:00'), 'sitter_home', null,
    local_ts(e + 2, '17:00'), 'sitter_home', null, null);
  perform _t_as(chloe);
  v_err := null;
  begin
    perform express_interest(vc);
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'interest_not_needed', '011l: a pair that has met just Accepts');
  perform _t_as(null);
  perform _t_ok((select count(*) from get_booking_stages(array[vc])) = 0, '011l: the service role is not a party');

  -- Cancelling releases the hold; then Joy gets her yes.
  perform _t_as(robert);
  perform cancel_booking(v1, 'schedule changed');
  perform _t_as(allen);
  perform express_interest(v2);
  perform _t_as(robert);
  v_err := null;
  begin
    perform request_booking(allen, array[max], local_ts(e, '09:00'), 'sitter_home', null,
      local_ts(e + 2, '17:00'), 'sitter_home', null, null);
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'sitter_unavailable', '011l: a cancelled hold frees the dates for the next owner');

  -- Several owners: the same dates are fine within max_pets.
  perform _t_as(allen);
  update public.sitter_profiles set accepts_multiple_owners = true where id = allen;
  perform _t_as(robert);
  v3 := request_booking(allen, array[max], local_ts(e, '09:00'), 'sitter_home', null,
    local_ts(e + 2, '17:00'), 'sitter_home', null, null);
  perform _t_as(allen);
  perform express_interest(v3);
  perform _t_as(null);
  perform _t_ok((select status = 'requested' and sitter_interest_at is not null from public.bookings where id = v3),
    '011l: with "several owners" on, a second owner is held beside the first');
  perform _t_ok(public.sitter_used(allen, e, 'morning') = 2, '011l: holds count against max_pets');

  -- The sweep: 2 days → both are asked, 3 more → cancelled.
  update public.bookings set meet_greet_due_at = now() - interval '1 minute' where id in (v2, v3);
  update public.bookings set meet_greet_status = 'agreed', meet_greet_mode = 'video',
    meet_greet_at = now() + interval '1 day', meet_greet_proposed_by = robert where id = v3;
  perform _t_as(robert);
  v_err := null;
  begin
    perform sweep_stale_bookings();
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err is not null, '011l: the sweep is not callable by users');
  perform _t_as(null);
  s := sweep_stale_bookings();
  perform _t_ok((s ->> 'stalled')::int = 1 and (s ->> 'cancelled')::int = 0, '011l: the sweep asks only the stalled booking');
  perform _t_ok((select count(*) from public.notifications where booking_id = v2 and type = 'meet_greet_stalled') = 2,
    '011l: both sides are asked to set a time, skip or decline');
  perform _t_ok(not exists (select 1 from public.notifications where booking_id = v3 and type = 'meet_greet_stalled'),
    '011l: an agreed time stops the clock');
  s := sweep_stale_bookings();
  perform _t_ok((s ->> 'stalled')::int = 0, '011l: nobody is asked twice');
  update public.bookings set meet_greet_nudged_at = now() - interval '3 days 1 minute' where id = v2;
  s := sweep_stale_bookings();
  perform _t_ok((s ->> 'cancelled')::int = 1, '011l: 3 days after the question the booking is cancelled');
  perform _t_ok((select status = 'cancelled' and cancel_reason = 'meet_greet_timeout' from public.bookings where id = v2),
    '011l: …with the timeout as the reason');
  perform _t_ok((select count(*) from public.notifications where booking_id = v2 and type = 'meet_greet_timeout') = 2,
    '011l: …and both sides are told');
  perform _t_ok(public.sitter_used(allen, e, 'morning') = 1, '011l: …and the hold is released');

  -- Stages of every kind.
  v4 := _t_booking(robert, paul, array[max], local_ts(e + 40, '10:00'), local_ts(e + 41, '10:00'), 'confirmed');
  perform _t_as(robert);
  select * into r from get_booking_stages(array[v4]);
  perform _t_ok(r.stage = 'awaiting_payment' and r.next_actor = 'owner', '011l: confirmed and unpaid → awaiting_payment');
  perform _t_as(null);
  update public.bookings set paid_at = now() where id = v4;
  perform _t_as(robert);
  select * into r from get_booking_stages(array[v4]);
  perform _t_ok(r.stage = 'paid', '011l: paid');
  perform _t_as(null);
  update public.booking_handoffs set completed_at = now() where booking_id = v4 and kind = 'drop_off';
  perform _t_as(robert);
  select * into r from get_booking_stages(array[v4]);
  perform _t_ok(r.stage = 'in_care', '011l: dropped off → in_care');
  perform _t_as(null);
  update public.booking_handoffs set completed_at = now() where booking_id = v4 and kind = 'pick_up';
  perform _t_as(robert);
  select * into r from get_booking_stages(array[v4]);
  perform _t_ok(r.stage = 'completed', '011l: picked up → completed');
  perform _t_as(null);
  perform _t_as(robert);
  perform _t_ok((select stage from get_booking_stages(array[v1])) = 'cancelled', '011l: cancelled');
  perform _t_as(joy);
  perform _t_ok((select stage from get_booking_stages(array[v2])) = 'cancelled', '011l: timed out → cancelled');
  perform _t_as(null);
  update public.bookings set meet_greet_status = 'done' where id = v3;
  perform _t_as(robert);
  perform _t_ok((select stage from get_booking_stages(array[v3])) = 'confirm', '011l: met → the sitter confirms');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 011z (RV-5 rest): a booking closes the owner's other open inquiries about that pet and those dates
-- (to other sitters only); match_knowledge says which pet a Life Record hit is about.
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  allen constant uuid := '00000000-0000-4000-8000-0000000000b3';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  mochi constant uuid := '00000000-0000-4000-8000-0000000000c2';
  d timestamptz := now() + interval '400 days';
  v_same uuid;
  v_sibling uuid;
  v_later uuid;
  v_other_pet uuid;
  v_hit record;
begin
  perform _t_as(robert);
  insert into public.inquiries (owner_id, sitter_id, drop_off_at, pick_up_at, pet_ids)
  values (robert, chloe, d, d + interval '2 days', array[max]) returning id into v_same;
  insert into public.inquiries (owner_id, sitter_id, drop_off_at, pick_up_at, pet_ids)
  values (robert, paul, d, d + interval '2 days', array[max]) returning id into v_sibling;
  insert into public.inquiries (owner_id, sitter_id, drop_off_at, pick_up_at, pet_ids)
  values (robert, allen, d + interval '40 days', d + interval '42 days', array[max]) returning id into v_later;
  insert into public.inquiries (owner_id, sitter_id, drop_off_at, pick_up_at, pet_ids)
  values (robert, allen, d, d + interval '2 days', array[mochi]) returning id into v_other_pet;

  -- Robert books Max with Chloe for those dates.
  perform _t_as(null);
  perform _t_booking(robert, chloe, array[max], d, d + interval '2 days', 'requested');

  perform _t_ok((select status from public.inquiries where id = v_sibling) = 'closed',
    '011z: booking one sitter closes the owner''s other open inquiry about the same pet and dates');
  perform _t_ok((select status from public.inquiries where id = v_same) = 'open',
    '011z: …but not the inquiry to the booked sitter (the app marks it booked)');
  perform _t_ok((select status from public.inquiries where id = v_later) = 'open',
    '011z: …nor an inquiry for other dates');
  perform _t_ok((select status from public.inquiries where id = v_other_pet) = 'open',
    '011z: …nor one about another pet');
  perform _t_as(paul);
  perform _t_ok(not public.has_open_inquiry_about(max), '011z: the closed inquiry no longer opens Max''s Life Record to Paul');
  perform _t_as(allen);
  perform _t_ok(public.has_open_inquiry_about(mochi), '011z: Allen still has his open inquiry about Mochi');

  -- A Life Record hit names its pet.
  perform _t_as(null);
  insert into public.knowledge_chunks (scope, pet_id, source_type, source_id, content, embedding)
  values ('pet', max, 'life_record', gen_random_uuid(), 'Max finishes breakfast', (select array_fill(0.1::real, array[1024])::extensions.vector(1024)));
  select * into v_hit from public.match_knowledge(
    (select array_fill(0.1::real, array[1024])::extensions.vector(1024)), chloe, array[max], robert, 20) m
  where m.source_type = 'life_record';
  perform _t_ok(v_hit.pet_id = max and v_hit.content = 'Max finishes breakfast', '011z: match_knowledge returns the pet of a Life Record hit');
end;
$$;

-- ---------------------------------------------------------------------------
-- L (012, Phase 06B, 6B.1): Pet Transit — home points, trips, start / update / end
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  scout uuid;
  v_b uuid;
  v_trip public.trips;
  v_err text;
  v_n int;
  v_eta_title text;
  v_media uuid;
  v_check uuid;
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Scout') returning id into scout;
  v_b := _t_booking(robert, chloe, array[scout], now() + interval '400 days', now() + interval '402 days', 'confirmed');

  -- Home points: own row only, both coordinates or neither, never in the public sitter list
  perform _t_as(chloe);
  update public.sitter_profiles set home_lat = 43.6532, home_lng = -79.3832 where id = chloe;
  perform _t_ok((select home_lat from public.get_my_sitter_profile()) = 43.6532, 'L: a sitter saves and reads their own home point');
  begin
    update public.sitter_profiles set home_lat = null where id = chloe;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', 'L: a home point needs both coordinates');
  begin
    update public.sitter_profiles set home_lat = 91, home_lng = 0 where id = chloe;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', 'L: …and real ones');
  perform _t_as(robert);
  begin
    perform home_lat from public.sitter_profiles where id = chloe;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'L: another account cannot read a sitter''s home point from the profile list');
  update public.sitter_profiles set home_lat = 0, home_lng = 0 where id = chloe;
  perform _t_as(chloe);
  perform _t_ok((select home_lat from public.get_my_sitter_profile()) = 43.6532, 'L: …nor change it');
  perform _t_as(robert);
  update public.owner_profiles set home_lat = 43.7, home_lng = -79.4 where id = robert;

  -- Start rules
  begin
    perform start_trip(v_b, 'drop_off');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_paid', 'L: no trip before the booking is paid');
  perform _t_as(null);
  update public.bookings set paid_at = now() where id = v_b;
  perform _t_as(robert);
  begin
    perform start_trip(v_b, 'drop_off');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'trip_too_early', 'L: …nor earlier than 2 h before the agreed time');
  perform _t_as(null);
  update public.booking_handoffs set scheduled_at = now() + interval '1 hour' where booking_id = v_b and kind = 'drop_off';

  perform _t_as(chloe);
  begin
    perform start_trip(v_b, 'drop_off');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_traveler', 'L: at the sitter''s home the owner travels, not the sitter');
  perform _t_as(joy);
  begin
    perform start_trip(v_b, 'drop_off');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', 'L: a third party cannot start a trip');
  perform _t_as(robert);
  begin
    perform start_trip(v_b, 'pick_up');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'drop_off_not_completed', 'L: no pick-up trip before the drop-off is done');
  begin
    perform start_trip(v_b, 'drop_off', false, 91, 0);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_position', 'L: a start position must be a real point');

  -- Owner drives: Robert starts about 2.2 km away
  v_trip := start_trip(v_b, 'drop_off', true, 43.6732, -79.3832);
  perform _t_ok(v_trip.status = 'en_route' and v_trip.traveler_id = robert and v_trip.simulated
      and v_trip.dest_lat = 43.6532 and v_trip.distance_m between 2200 and 2250 and v_trip.eta_at > now(),
    'L: Start trip → en route, destination = the sitter''s home, distance and ETA from the first point');
  perform _t_as(null);
  select title into v_eta_title from public.notifications where user_id = chloe and type = 'trip_started' and ref_id = v_trip.id;
  perform _t_ok(v_eta_title like 'Robert is on the way — ETA % 🚗', 'L: the sitter is told, with the ETA');
  perform _t_as(robert);
  begin
    perform start_trip(v_b, 'drop_off');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'trip_active', 'L: one live trip per handoff');

  -- Who sees and writes the row
  perform _t_ok((select count(*) from public.trips where booking_id = v_b) = 1, 'L: the traveler reads the trip');
  perform _t_as(chloe);
  perform _t_ok((select count(*) from public.trips where booking_id = v_b) = 1, 'L: …and so does the other person on the booking');
  perform _t_as(joy);
  perform _t_ok((select count(*) from public.trips) = 0, 'L: a third party sees no trip');
  perform _t_as(robert);
  begin
    update public.trips set last_lat = 0, last_lng = 0 where id = v_trip.id;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'L: positions are not written around update_trip_position');
  begin
    insert into public.trips (booking_id, handoff_kind, traveler_id) values (v_b, 'pick_up', robert);
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'L: trips are not inserted around start_trip');

  -- Positions
  perform _t_as(chloe);
  begin
    perform update_trip_position(v_trip.id, 43.66, -79.3832);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', 'L: only the traveler shares a position');
  perform _t_as(robert);
  v_trip := update_trip_position(v_trip.id, 43.6602, -79.3832);
  perform _t_ok(v_trip.last_lat = 43.6732 and v_trip.status = 'en_route', 'L: a call within a second of the last one is ignored');
  perform _t_as(null);
  update public.trips set last_at = last_at - interval '5 seconds' where id = v_trip.id;
  perform _t_as(robert);
  v_trip := update_trip_position(v_trip.id, 43.6602, -79.3832, 500);
  perform _t_ok(v_trip.last_lat = 43.6602 and v_trip.near_notified_at is null,
    '015q: a reading with 500 m accuracy moves the map but never sends "about 5 minutes away"');
  begin
    perform update_trip_position(v_trip.id, 43.6602, -79.3832, -1);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_position', '015q: an accuracy below 0 is refused');
  perform _t_as(null);
  update public.trips set last_at = last_at - interval '5 seconds' where id = v_trip.id;
  perform _t_as(robert);
  v_trip := update_trip_position(v_trip.id, 43.6602, -79.3832);
  perform _t_ok(v_trip.last_lat = 43.6602 and v_trip.status = 'en_route' and v_trip.distance_m between 770 and 790,
    'L: a later position replaces the last one; still far → en route');
  begin
    perform update_trip_position(v_trip.id, null, 0);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_position', 'L: a position must be a real point');

  -- 014r: about 780 m out is under 5 minutes → the other person is told once
  perform _t_as(null);
  perform _t_ok((select count(*) from public.notifications where user_id = chloe and type = 'trip_near' and ref_id = v_trip.id
        and title like 'Robert is about 5 minutes away%') = 1
      and (select near_notified_at is not null from public.trips where id = v_trip.id),
    '014r: within 5 minutes of the ETA → one "about 5 minutes away" notice for the other person');
  -- 015q (#381): within 150 m → arrived only after two good readings in a row; both told once, no more positions stored
  perform _t_as(null);
  update public.trips set last_at = last_at - interval '5 seconds' where id = v_trip.id;
  perform _t_as(robert);
  v_trip := update_trip_position(v_trip.id, 43.6542, -79.3832, 500);
  perform _t_ok(v_trip.status = 'en_route' and v_trip.last_lat = 43.6542 and v_trip.close_readings = 0,
    '015q: one reading at about 110 m with 500 m accuracy → still en route');
  perform _t_as(null);
  update public.trips set last_at = last_at - interval '5 seconds' where id = v_trip.id;
  perform _t_as(robert);
  v_trip := update_trip_position(v_trip.id, 43.6542, -79.3832, 20);
  perform _t_ok(v_trip.status = 'en_route' and v_trip.close_readings = 1, '015q: one good reading within 150 m is not enough');
  perform _t_as(null);
  update public.trips set last_at = last_at - interval '5 seconds' where id = v_trip.id;
  perform _t_as(robert);
  v_trip := update_trip_position(v_trip.id, 43.6602, -79.3832, 20);
  perform _t_ok(v_trip.status = 'en_route' and v_trip.close_readings = 0, '015q: a good reading farther out starts the count again');
  perform _t_as(null);
  update public.trips set last_at = last_at - interval '5 seconds' where id = v_trip.id;
  perform _t_as(robert);
  v_trip := update_trip_position(v_trip.id, 43.6542, -79.3832, 20);
  perform _t_as(null);
  update public.trips set last_at = last_at - interval '5 seconds' where id = v_trip.id;
  perform _t_as(robert);
  v_trip := update_trip_position(v_trip.id, 43.6541, -79.3832, 500);
  perform _t_ok(v_trip.status = 'en_route' and v_trip.close_readings = 1,
    '015q: a poor reading in between neither counts nor breaks the run');
  perform _t_as(null);
  update public.trips set last_at = last_at - interval '5 seconds' where id = v_trip.id;
  perform _t_as(robert);
  v_trip := update_trip_position(v_trip.id, 43.6542, -79.3832, 20);
  perform _t_ok(v_trip.status = 'arrived' and v_trip.arrived_at is not null and v_trip.distance_m between 100 and 120,
    '015q: two good readings in a row within 150 m of the destination → arrived');
  perform _t_as(null);
  update public.trips set last_at = last_at - interval '5 seconds' where id = v_trip.id;
  perform _t_as(robert);
  v_trip := update_trip_position(v_trip.id, 43.6535, -79.3832);
  perform _t_ok(v_trip.last_lat = 43.6542, 'L: after arrival positions are no longer stored');
  perform _t_as(null);
  select count(*) into v_n from public.notifications where type = 'trip_arrived' and ref_id = v_trip.id;
  perform _t_ok(v_n = 2 and exists (select 1 from public.notifications where user_id = chloe and type = 'trip_arrived' and title = 'Robert has arrived 🚗')
      and exists (select 1 from public.notifications where user_id = robert and type = 'trip_arrived'),
    'L: both are told, once');
  perform _t_ok((select count(*) from public.notifications where type = 'trip_near' and ref_id = v_trip.id) = 1,
    '014r: …and only once, however many positions follow');

  -- End: only the traveler, and the position is erased
  perform _t_as(chloe);
  begin
    perform end_trip(v_trip.id);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', 'L: only the traveler ends the trip');
  perform _t_as(robert);
  v_trip := end_trip(v_trip.id);
  perform _t_ok(v_trip.status = 'completed' and v_trip.ended_at is not null and v_trip.last_lat is null
      and v_trip.last_lng is null and v_trip.eta_at is null and v_trip.distance_m is null,
    'L: End trip → completed, position / ETA / distance erased');
  perform _t_ok((end_trip(v_trip.id)).status = 'completed', 'L: ending twice is harmless');
  begin
    perform update_trip_position(v_trip.id, 43.6, -79.38);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'trip_not_active', 'L: no positions after the trip ended');

  -- A new trip for the same handoff after the first one ended; cancel erases too
  v_trip := start_trip(v_b, 'drop_off');
  perform _t_ok(v_trip.last_lat is null and v_trip.eta_at is null, 'L: without a first point there is no ETA yet');
  perform _t_as(null);
  select title into v_eta_title from public.notifications where user_id = chloe and type = 'trip_started' and ref_id = v_trip.id;
  perform _t_ok(v_eta_title = 'Robert is on the way 🚗', 'L: …and the notice says on the way, without a time');
  perform _t_as(robert);
  v_trip := update_trip_position(v_trip.id, 43.6602, -79.3832);
  v_trip := end_trip(v_trip.id, true);
  perform _t_ok(v_trip.status = 'cancelled' and v_trip.last_lat is null, 'L: Cancel trip → cancelled, position erased');

  -- Sitter drives to the owner's home (D28): the owner cannot be the traveler there
  perform _t_as(null);
  update public.booking_handoffs set location_type = 'owner_home' where booking_id = v_b and kind = 'drop_off';
  perform _t_as(robert);
  begin
    perform start_trip(v_b, 'drop_off');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_traveler', 'L: at the owner''s home the sitter travels, not the owner');
  perform _t_as(chloe);
  v_trip := start_trip(v_b, 'drop_off', false, 43.6532, -79.3832);
  perform _t_ok(v_trip.dest_lat = 43.7 and v_trip.dest_lng = -79.4 and v_trip.traveler_id = chloe,
    'L: destination = the owner''s home point');
  perform _t_as(null);
  perform _t_ok(exists (select 1 from public.notifications where user_id = robert and type = 'trip_started' and ref_id = v_trip.id),
    'L: the owner is told');
  perform _t_as(chloe);
  perform end_trip(v_trip.id);

  -- Somewhere else: either of them may travel; no destination, no ETA
  perform _t_as(null);
  update public.booking_handoffs set location_type = 'other', location_note = 'Riverside Park gate' where booking_id = v_b and kind = 'drop_off';
  perform _t_as(chloe);
  v_trip := start_trip(v_b, 'drop_off', false, 43.6532, -79.3832);
  perform _t_ok(v_trip.dest_lat is null and v_trip.eta_at is null and v_trip.distance_m is null,
    'L: at another place there is no destination, so no ETA');
  perform _t_as(robert);
  begin
    perform start_trip(v_b, 'drop_off');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'trip_active', 'L: …and still one live trip per handoff');
  perform _t_as(null);
  update public.trips set last_at = last_at - interval '5 seconds' where id = v_trip.id;
  perform _t_as(chloe);
  v_trip := update_trip_position(v_trip.id, 43.6540, -79.3832);
  perform _t_ok(v_trip.status = 'en_route' and v_trip.last_lat = 43.6540, 'L: no destination → never "arrived" by distance');
  perform end_trip(v_trip.id);

  -- Starting without sharing: the trip exists, but never carries a position, an ETA or an arrival
  perform _t_as(chloe);
  v_trip := start_trip(v_b, 'drop_off', false, 43.6540, -79.3832, false);
  perform _t_ok(not v_trip.sharing and v_trip.last_lat is null and v_trip.eta_at is null and v_trip.distance_m is null
      and v_trip.status = 'en_route', 'L: a trip started without sharing carries no position, ETA or distance');
  perform _t_as(null);
  perform _t_ok(exists (select 1 from public.notifications where user_id = robert and type = 'trip_started' and ref_id = v_trip.id
      and title = 'Chloe is on the way 🚗'), 'L: …and the other person is still told she is on the way');
  perform _t_as(chloe);
  begin
    perform update_trip_position(v_trip.id, 43.6540, -79.3832);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_sharing', 'L: a position is refused on a trip that is not shared');
  perform end_trip(v_trip.id);

  -- Received ends the drop-off trip that is still running (whoever travelled)
  perform _t_as(chloe);
  v_trip := start_trip(v_b, 'drop_off', false, 43.6540, -79.3832);
  perform complete_handoff(v_b, 'drop_off');
  perform _t_as(null);
  select * into v_trip from public.trips where id = v_trip.id;
  perform _t_ok(v_trip.status = 'completed' and v_trip.last_lat is null and v_trip.eta_at is null and v_trip.ended_at is not null,
    'L: Received ends the running trip and erases its position');
  perform _t_ok(exists (select 1 from public.notifications where user_id = robert and type = 'pet_dropped_off' and booking_id = v_b),
    'L: …and still tells the owner');

  -- Once the drop-off is done, the pick-up trip is open (Owner drives back to the sitter's home)
  update public.booking_handoffs set scheduled_at = now() + interval '1 hour', location_type = 'sitter_home', location_note = null
  where booking_id = v_b and kind = 'pick_up';
  perform _t_as(robert);
  v_trip := start_trip(v_b, 'pick_up');
  perform _t_ok(v_trip.handoff_kind = 'pick_up', 'L: after Received the owner can start the pick-up trip');
  perform _t_as(chloe);
  perform complete_handoff(v_b, 'pick_up');
  perform _t_as(null);
  select * into v_trip from public.trips where id = v_trip.id;
  perform _t_ok(v_trip.status = 'completed' and v_trip.last_lat is null, 'L: Returned ends the pick-up trip');
  perform _t_as(robert);
  begin
    perform start_trip(v_b, 'pick_up');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err in ('handoff_completed', 'trip_active'), 'L: no trip for a handoff that is done');

  -- Handoff photo checks (6B.5): the backend writes, the two parties read, only the sitter adds a reason
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
  values (scout, chloe, 'goldito/scout/handoff/abc', 'image', 'handoff') returning id into v_media;
  insert into public.handoff_checks (booking_id, handoff_kind, check_type, media_id, status, findings, model, latency_ms)
  values (v_b, 'drop_off', 'vehicle_safety', v_media, 'warning', '{"pet_visible":true,"crate_visible":false}', 'vision-model', 900)
  returning id into v_check;
  perform _t_as(chloe);
  perform _t_ok((select count(*) from public.handoff_checks where booking_id = v_b) = 1, 'L: the sitter reads the check of their photo');
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.handoff_checks where booking_id = v_b) = 1, 'L: …and so does the owner');
  perform _t_as(joy);
  perform _t_ok((select count(*) from public.handoff_checks) = 0, 'L: a third party reads no check');
  perform _t_as(chloe);
  begin
    insert into public.handoff_checks (booking_id, handoff_kind, check_type, status) values (v_b, 'drop_off', 'pet_checkin', 'ok');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'L: a check is never written by a client (only by the backend)');
  begin
    update public.handoff_checks set status = 'ok' where id = v_check;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', 'L: the sitter cannot rewrite what the model found');
  update public.handoff_checks set override_reason = 'Crate is in the trunk' where id = v_check;
  perform _t_as(null);
  perform _t_ok((select override_reason from public.handoff_checks where id = v_check) = 'Crate is in the trunk',
    'L: the sitter adds why they continue past a warning');
  perform _t_as(robert);
  update public.handoff_checks set override_reason = 'x' where id = v_check;
  perform _t_as(null);
  perform _t_ok((select override_reason from public.handoff_checks where id = v_check) = 'Crate is in the trunk',
    'L: the owner cannot change that reason');
  perform _t_as(chloe);
  begin
    update public.handoff_checks set override_reason = repeat('x', 201) where id = v_check;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', 'L: the reason is at most 200 characters');
end;
$$;

-- ---------------------------------------------------------------------------
-- 012b (CR-1): cancelling the booking ends its live trip and erases the position
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  rex uuid;
  v_b uuid;
  v_trip public.trips;
  v_err text;
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Rex') returning id into rex;
  v_b := _t_booking(robert, chloe, array[rex], now() + interval '500 days', now() + interval '502 days', 'confirmed');
  update public.bookings set paid_at = now() where id = v_b;
  update public.booking_handoffs set scheduled_at = now() + interval '1 hour' where booking_id = v_b and kind = 'drop_off';

  perform _t_as(robert);
  v_trip := start_trip(v_b, 'drop_off', false, 43.6732, -79.3832);
  perform _t_ok(v_trip.status = 'en_route' and v_trip.last_lat is not null, 'CR-1: the owner is on the way before the drop-off');
  perform cancel_booking(v_b, 'schedule_changed');

  perform _t_as(null);
  select * into v_trip from public.trips where id = v_trip.id;
  perform _t_ok(v_trip.status = 'cancelled' and v_trip.ended_at is not null and v_trip.last_lat is null
      and v_trip.last_lng is null and v_trip.last_at is null and v_trip.eta_at is null and v_trip.distance_m is null,
    'CR-1: cancelling the booking cancels the live trip and erases its position');
  perform _t_as(robert);
  begin
    perform update_trip_position(v_trip.id, 43.6602, -79.3832);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'trip_not_active', 'CR-1: …so the traveller''s next position is refused');
  perform _t_as(chloe);
  perform _t_ok(not exists (select 1 from public.trips where booking_id = v_b and status in ('en_route', 'arrived')),
    'CR-1: …and the other person has no live trip left to follow');
end;
$$;

-- ---------------------------------------------------------------------------
-- 012c (CR-2): after confirm, the drop-off and the pick-up can move together past the old window
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  d constant date := app_today() + 600;
  bolt uuid;
  v_b uuid;
  v_drop uuid;
  v_pick uuid;
  v_err text;
begin
  perform _t_as(chloe);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (chloe, 'open', d - 1, d + 10, 'morning', '08:00', '12:00', 3),
         (chloe, 'open', d - 1, d + 10, 'afternoon', '12:00', '18:00', 3),
         (chloe, 'open', d - 1, d + 10, 'overnight', '18:00', '08:00', 3);
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Bolt') returning id into bolt;
  v_b := _t_booking(robert, chloe, array[bolt], local_ts(d, '09:00'), local_ts(d + 2, '17:00'), 'confirmed');

  -- Alone, a drop-off after the agreed pick-up still does not fit.
  perform _t_as(robert);
  begin
    perform propose_handoff(v_b, 'drop_off', local_ts(d + 3, '09:00'));
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_window', 'CR-2: a drop-off after the agreed pick-up does not fit on its own');

  -- With my own new pick-up first, it does.
  v_pick := propose_handoff(v_b, 'pick_up', local_ts(d + 5, '17:00'));
  v_drop := propose_handoff(v_b, 'drop_off', local_ts(d + 3, '09:00'));
  perform _t_ok(v_drop is not null, 'CR-2: …but it fits together with my open pick-up proposal');

  -- The sitter's Accept on the drop-off takes both, and the stay moves.
  perform _t_as(chloe);
  perform respond_handoff(v_drop, true);
  perform _t_as(null);
  perform _t_ok((select status from public.booking_handoffs where id = v_drop) = 'agreed'
      and (select status from public.booking_handoffs where id = v_pick) = 'agreed',
    'CR-2: accepting the paired drop-off agrees the pick-up too');
  perform _t_ok((select count(*) from public.booking_handoffs where booking_id = v_b and status = 'agreed') = 2,
    'CR-2: …and the old agreed times are superseded');
  perform _t_ok((select care_range from public.booking_pets where booking_id = v_b)
      = tstzrange(local_ts(d + 3, '09:00'), local_ts(d + 5, '17:00'), '[)'),
    'CR-2: …and the stay is rebuilt for the new window');
  perform _t_ok(exists (select 1 from public.notifications where user_id = robert and type = 'handoff_agreed'
      and ref_id = v_drop and title like 'Chloe agreed to the new drop-off and pick-up%'),
    'CR-2: …and the owner is told once, for both');

  -- Declining one of a pair declines the other; the agreed stay is kept.
  perform _t_as(robert);
  v_pick := propose_handoff(v_b, 'pick_up', local_ts(d + 8, '17:00'));
  v_drop := propose_handoff(v_b, 'drop_off', local_ts(d + 6, '09:00'));
  perform _t_as(chloe);
  perform respond_handoff(v_drop, false);
  perform _t_as(null);
  perform _t_ok((select status from public.booking_handoffs where id = v_drop) = 'rejected'
      and (select status from public.booking_handoffs where id = v_pick) = 'rejected',
    'CR-2: declining the paired drop-off declines the pick-up too');
  perform _t_ok((select care_range from public.booking_pets where booking_id = v_b)
      = tstzrange(local_ts(d + 3, '09:00'), local_ts(d + 5, '17:00'), '[)'),
    'CR-2: …and the agreed stay stays');

  -- A change that fits on its own is still answered on its own.
  perform _t_as(robert);
  v_pick := propose_handoff(v_b, 'pick_up', local_ts(d + 6, '17:00'));
  v_drop := propose_handoff(v_b, 'drop_off', local_ts(d + 4, '09:00'));
  perform _t_as(chloe);
  perform respond_handoff(v_pick, true);
  perform _t_as(null);
  perform _t_ok((select status from public.booking_handoffs where id = v_pick) = 'agreed'
      and (select status from public.booking_handoffs where id = v_drop) = 'proposed',
    'CR-2: an offer that fits alone is agreed alone; the other one still waits');
end;
$$;

-- ---------------------------------------------------------------------------
-- 012d (CR-3): the can-host check is for a named owner, also when the sitter asks
-- (Allen takes one owner at a time; Robert already has those dates booked with him)
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  allen constant uuid := '00000000-0000-4000-8000-0000000000b3';
  d constant date := app_today() + 700;
  pip uuid;
  v_err text;
begin
  perform _t_as(allen);
  -- The 011l block above switched Allen to several owners; this check is about one owner at a time.
  update public.sitter_profiles set accepts_multiple_owners = false where id = allen;
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (allen, 'open', d - 1, d + 3, 'morning', '08:00', '12:00', 3),
         (allen, 'open', d - 1, d + 3, 'afternoon', '12:00', '18:00', 3),
         (allen, 'open', d - 1, d + 3, 'overnight', '18:00', '08:00', 3);
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Pip') returning id into pip;
  perform _t_booking(robert, allen, array[pip], local_ts(d, '09:00'), local_ts(d, '11:00'), 'confirmed');

  perform _t_as(robert);
  perform _t_ok(stay_capacity_check(allen, local_ts(d, '09:00'), local_ts(d, '11:00'), 1) is null,
    'CR-3: the owner asking about dates they already have with the sitter → it fits');
  perform _t_ok(stay_capacity_check(allen, local_ts(d, '09:00'), local_ts(d, '11:00'), 1, robert) is null,
    'CR-3: …the same when the owner names themselves');
  perform _t_as(allen);
  perform _t_ok(stay_capacity_check(allen, local_ts(d, '09:00'), local_ts(d, '11:00'), 1) is not null,
    'CR-3: without p_owner the sitter''s own call still counts the owner as "another owner" (the old bug, kept for old callers)');
  perform _t_ok(stay_capacity_check(allen, local_ts(d, '09:00'), local_ts(d, '11:00'), 1, robert) is null,
    'CR-3: the sitter asking for that owner gets the same answer (Regenerate, quick replies, Suggest)');
  perform _t_ok(stay_capacity_check(allen, local_ts(d, '09:00'), local_ts(d, '11:00'), 1, joy) is not null,
    'CR-3: …while for another owner the slot is taken');
  perform _t_as(joy);
  begin
    perform stay_capacity_check(allen, local_ts(d, '09:00'), local_ts(d, '11:00'), 1, robert);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'forbidden', 'CR-3: a third person cannot ask on another owner''s behalf');
end;
$$;

-- ---------------------------------------------------------------------------
-- 012e (CR-4): inquiries a request closed open again when that request is declined or cancelled
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  allen constant uuid := '00000000-0000-4000-8000-0000000000b3';
  d timestamptz := now() + interval '800 days';
  juno uuid;
  kiwi uuid;
  v_q uuid;
  v_a uuid;
  v_b uuid;
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Juno') returning id into juno;
  insert into public.pets (owner_id, species, name) values (robert, 'cat', 'Kiwi') returning id into kiwi;
  perform _t_as(robert);
  insert into public.inquiries (owner_id, sitter_id, drop_off_at, pick_up_at, pet_ids)
  values (robert, paul, d, d + interval '2 days', array[juno, kiwi]) returning id into v_q;

  -- One request closes Paul's inquiry; declining it opens it again.
  perform _t_as(null);
  v_a := _t_booking(robert, chloe, array[juno], d, d + interval '2 days', 'requested');
  perform _t_ok((select status = 'closed' and closed_by_booking = v_a from public.inquiries where id = v_q),
    'CR-4: the request closes the other sitter''s inquiry and remembers which booking did');
  update public.bookings set status = 'declined', responded_at = now() where id = v_a;
  perform _t_ok((select status = 'open' and closed_by_booking is null from public.inquiries where id = v_q),
    'CR-4: the request is declined → the inquiry is open again');
  perform _t_as(paul);
  perform _t_ok(public.has_open_inquiry_about(juno), 'CR-4: …and Paul can answer it again');

  -- Two live requests cover the inquiry: it stays closed until the last one ends.
  perform _t_as(null);
  v_a := _t_booking(robert, chloe, array[juno], d, d + interval '2 days', 'requested');
  v_b := _t_booking(robert, allen, array[kiwi], d, d + interval '2 days', 'requested');
  perform _t_ok((select status = 'closed' and closed_by_booking = v_a from public.inquiries where id = v_q),
    'CR-4: closed by the first request');
  update public.bookings set status = 'cancelled' where id = v_a;
  perform _t_ok((select status = 'closed' and closed_by_booking = v_b from public.inquiries where id = v_q),
    'CR-4: another live request still covers the dates → stays closed, now held by that one');
  update public.bookings set status = 'cancelled' where id = v_b;
  perform _t_ok((select status from public.inquiries where id = v_q) = 'open',
    'CR-4: the last one cancelled → open again');

  -- A confirmed booking keeps it closed; an inquiry closed by hand never reopens.
  v_a := _t_booking(robert, chloe, array[juno], d, d + interval '2 days', 'confirmed');
  perform _t_ok((select status from public.inquiries where id = v_q) = 'closed', 'CR-4: a confirmed booking closes it too');
  update public.inquiries set closed_by_booking = null where id = v_q;
  update public.bookings set status = 'cancelled' where id = v_a;
  perform _t_ok((select status from public.inquiries where id = v_q) = 'closed',
    'CR-4: an inquiry not closed by that booking stays closed');
end;
$$;

-- ---------------------------------------------------------------------------
-- 012f (CR-7): a reply is never sent from a draft older than the owner's latest message
-- (Kai / Lou / Kip come from the 011j block above)
-- ---------------------------------------------------------------------------

do $$
declare
  kai constant uuid := '00000000-0000-4000-8000-0000000000aa';
  lou constant uuid := '00000000-0000-4000-8000-0000000000ba';
  kip constant uuid := '00000000-0000-4000-8000-0000000000ca';
  v_inq uuid;
  v_draft uuid;
  v_err text;
  v_msg public.inquiry_messages;
begin
  perform _t_as(kai);
  insert into public.inquiries (owner_id, sitter_id, drop_off_at, pick_up_at, pet_ids)
  values (kai, lou, now() + interval '50 days', now() + interval '52 days', array[kip]) returning id into v_inq;
  perform _t_as(null);
  insert into public.inquiry_messages (inquiry_id, author, sender_id, body, created_at)
  values (v_inq, 'owner', kai, 'Can you host Kip?', now() - interval '10 minutes');
  insert into public.inquiry_messages (inquiry_id, author, sender_id, body, drafted_by_ai, status, grounding, created_at)
  values (v_inq, 'ai', null, 'Yes! $100', true, 'draft',
    '{"quote":{"total":100},"availability":{"can_host":true}}', now() - interval '5 minutes') returning id into v_draft;
  -- The owner moves the dates after the draft was written (change_inquiry_dates leaves this message).
  insert into public.inquiry_messages (inquiry_id, author, sender_id, body, created_at)
  values (v_inq, 'owner', kai, 'Changed dates: Dec 1 – Dec 3', now() - interval '1 minute');

  perform _t_as(lou);
  begin
    perform send_inquiry_reply(v_inq, 'Yes! $100', v_draft);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'draft_stale', 'CR-7: a draft older than the owner''s latest message is refused (no old quote goes out)');
  begin
    perform send_inquiry_reply(v_inq, 'Yes, happy to!', v_draft, 'accept');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'draft_stale', 'CR-7: …also as an Accept');
  perform _t_ok((select count(*) from public.inquiry_messages where inquiry_id = v_inq and author = 'sitter') = 0,
    'CR-7: …and nothing was sent');
  v_msg := send_inquiry_reply(v_inq, 'Let me check those dates and come back to you.', null);
  perform _t_ok(v_msg.author = 'sitter' and v_msg.grounding is null, 'CR-7: a reply written by the sitter still goes out');

  -- A draft written after the latest owner message is fine.
  perform _t_as(null);
  insert into public.inquiry_messages (inquiry_id, author, sender_id, body, drafted_by_ai, status, grounding, created_at)
  values (v_inq, 'ai', null, 'Yes for Dec 1 – 3! $120', true, 'draft',
    '{"quote":{"total":120},"availability":{"can_host":true}}', now()) returning id into v_draft;
  perform _t_as(lou);
  v_msg := send_inquiry_reply(v_inq, 'Yes for Dec 1 – 3! $120', v_draft);
  perform _t_ok((v_msg.grounding #>> '{quote,total}') = '120', 'CR-7: the new draft for the latest message is sent with its quote');
end;
$$;

-- ---------------------------------------------------------------------------
-- 013 (Phase 12.1 Treat check, D61): owner + sitter read and acknowledge, a sitter's DANGER tells the owner
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  biscuit uuid;
  v_media uuid;
  v_by_sitter uuid;
  v_by_owner uuid;
  v_warning uuid;
  v_err text;
  v_n int;
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Biscuit') returning id into biscuit;
  perform _t_booking(robert, chloe, array[biscuit], now() - interval '1 hour', now() + interval '1 day', 'confirmed');
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
  values (biscuit, chloe, 'goldito/biscuit/safety_label/a', 'image', 'safety_label') returning id into v_media;

  -- The backend writes the checks (service role).
  insert into public.safety_checks (pet_id, checked_by, media_id, safety_status, result_json)
  values (biscuit, chloe, v_media, 'DANGER', '{"warning_message":"Biscuit is allergic to chicken. Don''t feed it."}')
  returning id into v_by_sitter;
  insert into public.safety_checks (pet_id, checked_by, media_id, safety_status, result_json)
  values (biscuit, robert, v_media, 'DANGER', '{"warning_message":"x"}') returning id into v_by_owner;
  insert into public.safety_checks (pet_id, checked_by, media_id, safety_status, result_json)
  values (biscuit, chloe, v_media, 'WARNING', '{"warning_message":"y"}') returning id into v_warning;

  select count(*) into v_n from public.notifications where user_id = robert and type = 'safety_danger' and pet_id = biscuit;
  perform _t_ok(v_n = 1, '013: only the sitter''s DANGER notifies the owner (not the owner''s own, not a WARNING)');
  perform _t_ok(exists (select 1 from public.notifications where user_id = robert and type = 'safety_danger'
      and ref_id = v_by_sitter and title = 'Blocked a risky treat for Biscuit ⚠️'
      and body = 'Biscuit is allergic to chicken. Don''t feed it.'),
    '013: the notice names the pet and carries the warning');

  -- Who reads them
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.safety_checks where pet_id = biscuit) = 3, '013: the owner reads every check of their pet');
  perform _t_as(chloe);
  perform _t_ok((select count(*) from public.safety_checks where pet_id = biscuit) = 3, '013: …and so does the sitter');
  perform _t_as(joy);
  perform _t_ok((select count(*) from public.safety_checks) = 0, '013: a third party reads none');

  -- Acknowledge: the owner now too; nothing else is writable by a client
  perform _t_as(robert);
  update public.safety_checks set acknowledged_at = now() where id = v_by_sitter;
  perform _t_as(null);
  perform _t_ok((select acknowledged_at is not null from public.safety_checks where id = v_by_sitter),
    '013: the owner records "I understand — don''t feed"');
  perform _t_as(joy);
  update public.safety_checks set acknowledged_at = now() where id = v_warning;
  perform _t_as(null);
  perform _t_ok((select acknowledged_at is null from public.safety_checks where id = v_warning), '013: a third party cannot');
  perform _t_as(robert);
  begin
    update public.safety_checks set safety_status = 'SAFE' where id = v_by_owner;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '013: the verdict cannot be changed by a client');
  begin
    insert into public.safety_checks (pet_id, checked_by, media_id, safety_status, result_json)
    values (biscuit, robert, v_media, 'SAFE', '{}');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '013: a check is never written by a client (only by the backend)');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 013b (Phase 12.3 Sticker, D61): stickers of a pet, and each person's own sticker layer on a sent report
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  pip uuid;
  v_sticker_media uuid;
  v_spare_media uuid;
  v_feed_media uuid;
  v_sticker uuid;
  v_report uuid;
  v_draft uuid;
  v_err text;
  v_n int;
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Pip') returning id into pip;
  perform _t_booking(robert, chloe, array[pip], now() - interval '1 hour', now() + interval '1 day', 'confirmed');
  -- The backend registers uploads (service role); 'sticker' is now a purpose.
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
  values (pip, chloe, 'goldito/pip/sticker/a', 'image', 'sticker') returning id into v_sticker_media;
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
  values (pip, chloe, 'goldito/pip/sticker/b', 'image', 'sticker') returning id into v_spare_media;
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
  values (pip, chloe, 'goldito/pip/feed/c', 'image', 'feed') returning id into v_feed_media;
  perform _t_ok(v_sticker_media is not null, '013b: media takes the sticker purpose');

  -- Saving a sticker: only from your own sticker upload of that pet
  perform _t_as(chloe);
  insert into public.pet_stickers (pet_id, media_id) values (pip, v_sticker_media) returning id into v_sticker;
  perform _t_ok(v_sticker is not null, '013b: the sitter on duty saves a sticker from her own sticker upload');
  begin
    insert into public.pet_stickers (pet_id, media_id) values (pip, v_feed_media);
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '013b: a feed photo cannot be saved as a sticker');
  perform _t_as(robert);
  begin
    insert into public.pet_stickers (pet_id, media_id) values (pip, v_spare_media);
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '013b: the owner cannot save someone else''s upload as their sticker');

  -- Who sees them, who removes them
  perform _t_ok((select count(*) from public.pet_stickers where pet_id = pip) = 1, '013b: the owner sees the stickers of their pet');
  delete from public.pet_stickers where id = v_sticker;
  perform _t_as(null);
  perform _t_ok(exists (select 1 from public.pet_stickers where id = v_sticker), '013b: only the maker deletes a sticker');
  perform _t_as(joy);
  perform _t_ok((select count(*) from public.pet_stickers) = 0, '013b: a third party sees no stickers');

  -- Decorating a report: own layer only, both layers visible, sent reports only for the owner
  perform _t_as(null);
  insert into public.daily_reports (pet_id, sitter_id, report_date, body, status, sent_at)
  values (pip, chloe, current_date, 'Pip had a lovely day.', 'sent', now()) returning id into v_report;
  insert into public.daily_reports (pet_id, sitter_id, report_date, body)
  values (pip, chloe, current_date - 1, 'Draft') returning id into v_draft;

  perform _t_as(robert);
  insert into public.report_decor (report_id, items)
  values (v_report, jsonb_build_array(jsonb_build_object('sticker_id', v_sticker, 'x', 0.2, 'y', 0.3, 'scale', 1, 'rotate', 0, 'z', 1)));
  perform _t_as(chloe);
  insert into public.report_decor (report_id, items)
  values (v_report, jsonb_build_array(jsonb_build_object('sticker_id', v_sticker, 'x', 0.8, 'y', 0.6, 'scale', 1.5, 'rotate', 15, 'z', 1)));
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.report_decor where report_id = v_report) = 2, '013b: the owner sees both layers on the report');
  update public.report_decor set items = '[]'::jsonb where report_id = v_report and user_id = chloe;
  perform _t_as(chloe);
  perform _t_ok((select jsonb_array_length(items) from public.report_decor where report_id = v_report and user_id = chloe) = 1,
    '013b: nobody changes the other person''s layer');
  perform _t_as(robert);
  begin
    insert into public.report_decor (report_id, items) values (v_draft, '[]'::jsonb);
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '013b: the owner cannot decorate a draft');
  begin
    update public.report_decor set items = (select jsonb_agg(jsonb_build_object('x', g)) from generate_series(1, 21) g)
    where report_id = v_report and user_id = robert;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514', '013b: at most 20 stickers in one layer');
  perform _t_as(joy);
  perform _t_ok((select count(*) from public.report_decor) = 0, '013b: a third party sees no layer');
  begin
    insert into public.report_decor (report_id, items) values (v_report, '[]'::jsonb);
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '013b: …and cannot add one');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 014 (Phase 11.1 Photo request): the owner asks the sitter on duty, the sitter's next shared photo answers it
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  toffee uuid;
  bean uuid;
  v_media_a uuid;
  v_media_b uuid;
  v_media_c uuid;
  v_req public.photo_requests;
  v_again public.photo_requests;
  v_post uuid;
  v_private uuid;
  v_err text;
  v_n int;
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Toffee') returning id into toffee;
  insert into public.pets (owner_id, species, name) values (robert, 'cat', 'Bean') returning id into bean;
  perform _t_booking(robert, chloe, array[toffee], now() - interval '1 hour', now() + interval '1 day', 'confirmed');
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
  values (toffee, chloe, 'goldito/toffee/feed/a', 'image', 'feed') returning id into v_media_a;
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
  values (toffee, chloe, 'goldito/toffee/feed/b', 'image', 'feed') returning id into v_media_b;
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
  values (toffee, chloe, 'goldito/toffee/feed/c', 'image', 'feed') returning id into v_media_c;

  -- Asking: the owner of a pet in care, once per stay; the sitter hears about it
  perform _t_as(robert);
  v_req := public.request_photo(toffee);
  perform _t_ok(v_req.status = 'open' and v_req.sitter_id = chloe, '014: the owner asks the sitter on duty for a photo');
  v_again := public.request_photo(toffee);
  perform _t_ok(v_again.id = v_req.id, '014: asking again returns the open request');
  begin
    perform public.request_photo(bean);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_in_care', '014: no request for a pet that is not in care');
  begin
    insert into public.photo_requests (pet_id, booking_id, owner_id, sitter_id)
    values (toffee, v_req.booking_id, robert, chloe);
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '014: requests are written only through request_photo');

  perform _t_as(chloe);
  select count(*) into v_n from public.notifications where user_id = chloe and type = 'photo_request' and ref_id = v_req.id;
  perform _t_ok(v_n = 1, '014: the sitter gets one photo_request notice');
  perform _t_ok(exists (select 1 from public.photo_requests where id = v_req.id and status = 'open'),
    '014: the sitter sees the open request');
  begin
    update public.photo_requests set status = 'fulfilled', fulfilled_at = now() where id = v_req.id;
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '014: the sitter cannot close it by hand');

  perform _t_as(joy);
  perform _t_ok((select count(*) from public.photo_requests) = 0, '014: a third party sees no requests');
  begin
    perform public.request_photo(toffee);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_allowed', '014: a third party cannot ask');

  -- Answering: a private post does not count, the next shared one does — with one notice, not two
  perform _t_as(chloe);
  insert into public.feed_posts (pet_id, sitter_id, media_id, visibility)
  values (toffee, chloe, v_media_a, 'private') returning id into v_private;
  perform _t_ok((select status from public.photo_requests where id = v_req.id) = 'open', '014: a private post leaves it open');
  insert into public.feed_posts (pet_id, sitter_id, media_id) values (toffee, chloe, v_media_b) returning id into v_post;

  perform _t_as(robert);
  select * into v_again from public.photo_requests where id = v_req.id;
  perform _t_ok(v_again.status = 'fulfilled' and v_again.fulfilled_post_id = v_post, '014: the next shared photo fulfills it');
  perform _t_ok((select count(*) from public.notifications
      where user_id = robert and type = 'photo_request_fulfilled' and ref_id = v_post) = 1,
    '014: the owner hears the asked-for photo is here');
  perform _t_ok(not exists (select 1 from public.notifications where user_id = robert and type = 'feed_post' and ref_id = v_post),
    '014: …and no second feed_post notice for the same photo');

  -- After an answer the owner may ask again; later photos with nothing open notify as usual
  v_again := public.request_photo(toffee);
  perform _t_ok(v_again.id <> v_req.id and v_again.status = 'open', '014: the owner can ask again after an answer');
  perform _t_as(chloe);
  insert into public.feed_posts (pet_id, sitter_id, media_id) values (toffee, chloe, v_media_c) returning id into v_post;
  perform _t_as(robert);
  perform _t_ok((select status from public.photo_requests where id = v_again.id) = 'fulfilled', '014: the second ask is answered too');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 014b (Diary book): a diary page written by hand, and the 'diary_page' media purpose
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  biscuit uuid;
  v_id uuid;
  v_again uuid;
  v_err text;
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Biscuit') returning id into biscuit;
  perform _t_booking(robert, chloe, array[biscuit], now() - interval '1 hour', now() + interval '1 day', 'confirmed');

  -- The sitter on duty writes today's page by hand; saving again keeps the one draft
  perform _t_as(chloe);
  v_id := public.save_report_draft(biscuit, '  We played fetch.  ');
  perform _t_ok((select body from public.daily_reports where id = v_id) = 'We played fetch.', '014b: the sitter saves a hand-written draft');
  v_again := public.save_report_draft(biscuit, 'We played fetch, then napped.');
  perform _t_ok(v_again = v_id and (select count(*) from public.daily_reports where pet_id = biscuit and status = 'draft') = 1,
    '014b: saving again updates the same draft');

  -- The owner does not see a draft; sending it is still send_daily_report
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.daily_reports where pet_id = biscuit) = 0, '014b: the owner does not see the draft');
  perform _t_as(chloe);
  perform public.send_daily_report(v_id, 'We played fetch, then napped.');
  perform _t_as(robert);
  perform _t_ok((select status from public.daily_reports where id = v_id) = 'sent', '014b: the hand-written page is sent with send_daily_report');

  -- After a send the next save starts a new draft
  perform _t_as(chloe);
  v_again := public.save_report_draft(biscuit, 'Evening walk.');
  perform _t_ok(v_again <> v_id, '014b: after a send, the next page is a new draft');

  -- Only the sitter on duty; no empty page
  perform _t_as(paul);
  begin
    perform public.save_report_draft(biscuit, 'Not my pet.');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_on_duty', '014b: a sitter not on duty cannot write the page');
  perform _t_as(robert);
  begin
    perform public.save_report_draft(biscuit, 'Owner text.');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_on_duty', '014b: the owner cannot write the sitter''s page');
  perform _t_as(chloe);
  begin
    perform public.save_report_draft(biscuit, '   ');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'body_required', '014b: an empty page is refused');

  -- The shared image of a page is a media purpose of its own
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
  values (biscuit, robert, 'goldito/biscuit/diary_page/a', 'image', 'diary_page') returning id into v_id;
  perform _t_ok(v_id is not null, '014b: media takes the diary_page purpose');
end;
$$;

-- ---------------------------------------------------------------------------
-- 014c (Sitter search): dates, times, a place and a radius; whole-stay fits only; no coordinates leave the DB
-- ---------------------------------------------------------------------------

-- Four sitters north of Robert's home (1 km ≈ 0.008993° of latitude): Sana 3 km, Theo 6.4 km, Uma 9 km, and Vic
-- 1 km away but only open from 10:00. Dates far ahead so no other block's schedule or booking touches them.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000d1', 'sana@example.test', '{"role":"sitter","display_name":"Sana"}'),
  ('00000000-0000-4000-8000-0000000000d2', 'theo@example.test', '{"role":"sitter","display_name":"Theo"}'),
  ('00000000-0000-4000-8000-0000000000d3', 'uma@example.test', '{"role":"sitter","display_name":"Uma"}'),
  ('00000000-0000-4000-8000-0000000000d4', 'vic@example.test', '{"role":"sitter","display_name":"Vic"}');

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  sana constant uuid := '00000000-0000-4000-8000-0000000000d1';
  theo constant uuid := '00000000-0000-4000-8000-0000000000d2';
  uma constant uuid := '00000000-0000-4000-8000-0000000000d3';
  vic constant uuid := '00000000-0000-4000-8000-0000000000d4';
  d constant date := app_today() + 200;
  drop_at timestamptz := local_ts(d, '09:30');
  pick_at timestamptz := local_ts(d, '16:00');
  r record;
  v_ids uuid[];
  v_err text;
begin
  perform _t_as(null);
  update public.owner_profiles set home_lat = 43.6644, home_lng = -79.3573 where id = robert;
  update public.owner_profiles set home_lat = null, home_lng = null where id = joy;
  update public.sitter_profiles set home_lat = 43.6644 + 3 * 0.008993, home_lng = -79.3573 where id = sana;
  update public.sitter_profiles set home_lat = 43.6644 + 6.4 * 0.008993, home_lng = -79.3573 where id = theo;
  update public.sitter_profiles set home_lat = 43.6644 + 9 * 0.008993, home_lng = -79.3573 where id = uma;
  update public.sitter_profiles set home_lat = 43.6644 + 1 * 0.008993, home_lng = -79.3573 where id = vic;
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  select x, 'open', d, d, s.slot, s.a, s.b, 2
  from unnest(array[sana, theo, uma]) x
  cross join (values ('morning'::care_slot, '08:00'::time, '12:00'::time),
                     ('afternoon'::care_slot, '12:00'::time, '18:00'::time)) s (slot, a, b);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (vic, 'open', d, d, 'morning', '10:00', '12:00', 2),
         (vic, 'open', d, d, 'afternoon', '12:00', '18:00', 2);
  -- 014d: open by default — these four keep to daytime hours, so they close that day's overnight.
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot)
  select x, 'blocked', d, d, 'overnight' from unnest(array[sana, theo, uma, vic]) x;
  insert into public.sitter_rates (sitter_id, boarding_nightly) values (sana, 48);

  -- Robert searches from his saved home: only sitters inside the radius, nearest first
  perform _t_as(robert);
  select array_agg(x.sitter_id order by x.distance_km) into v_ids
  from search_sitters_nearby(drop_at, pick_at, 1, 7) x where x.sitter_id in (sana, theo, uma, vic);
  perform _t_ok(v_ids = array[sana, theo],
    '014c: 7 km from home finds Sana (3 km) and Theo (6.4 km), nearest first; Uma (9 km) and Vic (out of hours) are not shown');
  select * into r from search_sitters_nearby(drop_at, pick_at, 1, 7) x where x.sitter_id = sana;
  perform _t_ok(r.distance_km = 3 and r.boarding_nightly = 48 and r.display_name = 'Sana',
    '014c: a result carries a rounded distance and the server price');
  select * into r from search_sitters_nearby(drop_at, pick_at, 1, 7) x where x.sitter_id = theo;
  perform _t_ok(r.distance_km = 6, '014c: the distance is rounded to whole km');
  perform _t_ok(not exists (select 1 from search_sitters_nearby(drop_at, pick_at, 1, 6) x where x.sitter_id = theo),
    '014c: the radius is exact — 6 km leaves Theo (6.4 km) out');
  perform _t_ok(not exists (select 1 from search_sitters_nearby(drop_at, pick_at, 1, 8) x where x.sitter_id = uma),
    '014c: …and 8 km leaves Uma (9 km) out');
  perform _t_ok(exists (select 1 from search_sitters_nearby(drop_at, pick_at, 1, 10) x where x.sitter_id = uma),
    '014c: 10 km reaches Uma');

  -- Out of hours = not shown at all, at any radius; the same sitter shows once the drop-off is inside her hours
  perform _t_ok(not exists (select 1 from search_sitters_nearby(drop_at, pick_at, 1, 100) x where x.sitter_id = vic),
    '014c: a sitter whose hours do not cover the drop-off is left out');
  perform _t_ok(exists (select 1 from search_sitters_nearby(local_ts(d, '10:30'), pick_at, 1, 5) x where x.sitter_id = vic),
    '014c: …and shows when the times fit');
  perform _t_ok(not exists (select 1 from search_sitters_nearby(drop_at, local_ts(d, '19:00'), 1, 100) x
      where x.sitter_id in (sana, theo, uma)),
    '014c: a pick-up after the sitters'' hours leaves them out');
  perform _t_ok(exists (select 1 from search_sitters_nearby(local_ts(d + 1, '09:30'), local_ts(d + 1, '16:00'), 1, 100) x
      where x.sitter_id in (sana, theo, uma)),
    '014c (014d): a day the sitters never touched is open by default, so they show');
  perform _t_ok(not exists (select 1 from search_sitters_nearby(drop_at, pick_at, 3, 100) x where x.sitter_id = sana),
    '014c: more pets than the sitter has room for leaves her out');

  -- The current location instead of home: 11 km north, Uma is 2 km away and Theo 4.6 km (past 3 km)
  select array_agg(x.sitter_id) into v_ids
  from search_sitters_nearby(drop_at, pick_at, 1, 3, 43.6644 + 11 * 0.008993, -79.3573) x
  where x.sitter_id in (sana, theo, uma, vic);
  perform _t_ok(v_ids = array[uma], '014c: a point sent by the app is searched instead of the saved home');

  -- No coordinates come back
  perform _t_ok(pg_get_function_result(
      'public.search_sitters_nearby(timestamptz, timestamptz, int, int, double precision, double precision)'::regprocedure
    ) !~* '(lat|lng|lon)', '014c: the result has no coordinate columns');

  -- Refusals
  begin perform search_sitters_nearby(drop_at, pick_at, 1, 0); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_radius', '014c: a radius under 1 km is refused');
  begin perform search_sitters_nearby(drop_at, pick_at, 1, 101); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_radius', '014c: a radius over 100 km is refused');
  begin perform search_sitters_nearby(drop_at, pick_at, 1, 5, 43.7, null); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_point', '014c: half a point is refused');
  begin perform search_sitters_nearby(pick_at, drop_at, 1, 5); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_window', '014c: a pick-up before the drop-off is refused');

  perform _t_as(joy);
  begin perform search_sitters_nearby(drop_at, pick_at, 1, 5); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'no_home_point', '014c: an owner with no saved home is asked for a place');
  perform _t_ok(exists (select 1 from search_sitters_nearby(drop_at, pick_at, 1, 5, 43.6644, -79.3573) x
      where x.sitter_id = sana),
    '014c: …and can search from the current location');

  perform _t_as(chloe);
  begin perform search_sitters_nearby(drop_at, pick_at, 1, 5, 43.6644, -79.3573); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'forbidden', '014c: a sitter cannot call the owner search');

  perform _t_as(null, 'anon');
  begin perform search_sitters_nearby(drop_at, pick_at, 1, 5, 43.6644, -79.3573); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014c: anon cannot call the owner search');

  -- Sitter coordinates stay unreadable to owners
  perform _t_as(robert);
  begin perform home_lat from public.sitter_profiles where id = sana; v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014c: an owner still cannot read a sitter''s home point');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 014i (Sitter search follow-up): favorites beyond the radius (when the stay fits) and a remembered radius
-- ---------------------------------------------------------------------------

-- Three sitters 30 km north of Robert's home: Wes (favorite, free), Xan (favorite, morning blocked), Yan (not a favorite).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000d5', 'wes@example.test', '{"role":"sitter","display_name":"Wes"}'),
  ('00000000-0000-4000-8000-0000000000d6', 'xan@example.test', '{"role":"sitter","display_name":"Xan"}'),
  ('00000000-0000-4000-8000-0000000000d7', 'yan@example.test', '{"role":"sitter","display_name":"Yan"}');

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  sana constant uuid := '00000000-0000-4000-8000-0000000000d1';
  wes constant uuid := '00000000-0000-4000-8000-0000000000d5';
  xan constant uuid := '00000000-0000-4000-8000-0000000000d6';
  yan constant uuid := '00000000-0000-4000-8000-0000000000d7';
  d constant date := app_today() + 202;
  drop_at timestamptz := local_ts(d, '09:30');
  pick_at timestamptz := local_ts(d, '16:00');
  r record;
  v_err text;
  v_radius int;
begin
  perform _t_as(null);
  update public.sitter_profiles set home_lat = 43.6644 + 30 * 0.008993, home_lng = -79.3573 where id in (wes, xan, yan);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot)
  values (xan, 'blocked', d, d, 'morning');

  perform _t_as(robert);
  insert into public.owner_favorite_sitters (sitter_id) values (wes), (xan);

  select * into r from search_sitters_nearby(drop_at, pick_at, 1, 5) x where x.sitter_id = wes;
  perform _t_ok(r.sitter_id is not null and r.distance_km = 30,
    '014i: a favorite 30 km away is listed at a 5 km radius, with its distance');
  perform _t_ok(not exists (select 1 from search_sitters_nearby(drop_at, pick_at, 1, 5) x where x.sitter_id = xan),
    '014i: …but not when the stay does not fit its calendar');
  perform _t_ok(not exists (select 1 from search_sitters_nearby(drop_at, pick_at, 1, 5) x where x.sitter_id = yan),
    '014i: a sitter who is not a favorite keeps the exact radius rule');
  perform _t_ok(exists (select 1 from search_sitters_nearby(drop_at, pick_at, 1, 5) x where x.sitter_id = sana),
    '014i: sitters inside the radius are unchanged');
  perform _t_ok(pg_get_function_result(
      'public.search_sitters_nearby(timestamptz, timestamptz, int, int, double precision, double precision)'::regprocedure
    ) !~* '(lat|lng|lon)', '014i: the result still has no coordinate columns');

  -- Another owner's favorites do not leak into this owner's search
  perform _t_as(joy);
  perform _t_ok(not exists (select 1 from search_sitters_nearby(drop_at, pick_at, 1, 5, 43.6644, -79.3573) x
      where x.sitter_id = wes),
    '014i: favorites are per owner');

  -- The last radius
  perform _t_as(robert);
  update public.owner_profiles set search_radius_km = 12 where id = robert;
  select search_radius_km into v_radius from public.owner_profiles where id = robert;
  perform _t_ok(v_radius = 12, '014i: an owner saves the radius they last used');
  begin update public.owner_profiles set search_radius_km = 101 where id = robert; v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like '%search_radius_km%', '014i: a radius over 100 km is refused');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 014j (Chat hub): one thread per owner and sitter pair, free chat, unread, leave, RLS
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  sana constant uuid := '00000000-0000-4000-8000-0000000000d1';
  biscuit constant uuid := '00000000-0000-4000-8000-0000000000c1';
  d constant date := app_today() + 210;
  drop_at timestamptz := local_ts(d, '09:00');
  pick_at timestamptz := local_ts(d + 2, '17:00');
  t1 public.chat_threads;
  t2 public.chat_threads;
  v_n int;
  r record;
  v_err text;
begin
  perform _t_as(null);

  -- An owner opens a chat with a sitter; the same pair always gets the same thread
  perform _t_as(robert);
  t1 := open_chat_thread(chloe);
  t2 := open_chat_thread(chloe);
  perform _t_ok(t1.id = t2.id and t1.owner_id = robert and t1.sitter_id = chloe,
    '014j: the same owner and sitter always get the same thread');
  perform _t_ok(not exists (select 1 from list_my_chats() x where x.thread_id = t1.id),
    '014j: a chat with no message yet is not in the list');

  -- The stay becomes the first card, once for the same stay
  t2 := open_chat_thread(chloe, drop_at, pick_at, array[biscuit]);
  t2 := open_chat_thread(chloe, drop_at, pick_at, array[biscuit]);
  select count(*) into v_n from public.chat_messages where thread_id = t1.id and kind = 'card';
  perform _t_ok(v_n = 1, '014j: the first card (dates, times, pets) is posted once for the same stay');
  t2 := open_chat_thread(chloe, drop_at, pick_at + interval '1 day', array[biscuit]);
  select count(*) into v_n from public.chat_messages where thread_id = t1.id and kind = 'card';
  perform _t_ok(v_n = 1 and (select (card ->> 'pick_up_at')::timestamptz from public.chat_messages where thread_id = t1.id and kind = 'card') = pick_at + interval '1 day',
    '014l: a different stay with nothing said since changes the card instead of adding one');

  begin perform open_chat_thread(chloe, pick_at, drop_at, array[biscuit]); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_stay', '014j: a pick-up before the drop-off is refused');

  -- Free chat, both sides, as often as they like
  perform send_chat_message(t1.id, 'Hi Chloe');
  perform send_chat_message(t1.id, 'Can you take Biscuit?');
  perform _t_as(chloe);
  select * into r from list_my_chats() x where x.thread_id = t1.id;
  perform _t_ok(r.unread_count = 3 and r.last_body = 'Can you take Biscuit?' and r.other_name is not null,
    '014j: the sitter sees the card and two messages as unread, the last one and the owner''s name');
  perform send_chat_message(t1.id, 'Yes, happy to');
  perform send_chat_message(t1.id, 'Any allergies?');
  perform mark_chat_read(t1.id);
  select * into r from list_my_chats() x where x.thread_id = t1.id;
  perform _t_ok(r.unread_count = 0, '014j: opening the chat marks it read');
  perform _t_as(robert);
  select * into r from list_my_chats() x where x.thread_id = t1.id;
  perform _t_ok(r.unread_count = 2, '014j: the owner sees the sitter''s two replies as unread');
  select count(*) into v_n from public.chat_messages where thread_id = t1.id and kind = 'text';
  perform _t_ok(v_n = 4, '014j: either person can send repeatedly in the same thread');
  t2 := open_chat_thread(chloe, drop_at, pick_at + interval '3 days', array[biscuit]);
  select count(*) into v_n from public.chat_messages where thread_id = t1.id and kind = 'card';
  perform _t_ok(v_n = 2, '014j: once something was said, a different stay is a new card in the same thread');

  -- A sitter can open an existing chat but cannot start one
  perform _t_as(chloe);
  t2 := open_chat_thread(robert);
  perform _t_ok(t2.id = t1.id, '014j: a sitter opens the existing chat with an owner');
  begin perform open_chat_thread(joy); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'forbidden', '014j: a sitter cannot start a chat with an owner');
  perform _t_as(robert);
  begin perform open_chat_thread(joy); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'forbidden', '014j: an owner cannot open a chat with another owner');

  -- Only the two people read or write
  perform _t_as(joy);
  perform _t_ok(not exists (select 1 from public.chat_threads where id = t1.id)
      and not exists (select 1 from public.chat_messages where thread_id = t1.id),
    '014j: a third person reads neither the thread nor its messages');
  begin perform send_chat_message(t1.id, 'hello'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'forbidden', '014j: a third person cannot write in it');
  begin perform mark_chat_read(t1.id); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'forbidden', '014j: …nor mark it read');
  perform _t_ok(not exists (select 1 from get_chat_thread(t1.id)), '014j: …nor read its header');
  perform _t_as(robert);
  begin insert into public.chat_messages (thread_id, sender_id, body) values (t1.id, robert, 'x'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014j: there is no direct insert');
  begin perform send_chat_message(t1.id, '   '); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'body_required', '014j: an empty message is refused');
  begin perform send_chat_message(t1.id, repeat('a', 2001)); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'body_too_long', '014j: a message over 2000 characters is refused');
  select * into r from get_chat_thread(t1.id);
  perform _t_ok(r.my_role = 'owner' and r.other_id = chloe and r.other_name is not null,
    '014j: the header says who the other person is');

  -- Leaving hides the chat for that person only; a new message brings it back
  perform leave_chat(t1.id);
  perform _t_ok(not exists (select 1 from list_my_chats() x where x.thread_id = t1.id), '014j: a left chat leaves the list');
  perform _t_ok(exists (select 1 from public.chat_messages where thread_id = t1.id), '014j: …but the history is kept');
  perform _t_as(chloe);
  perform _t_ok(exists (select 1 from list_my_chats() x where x.thread_id = t1.id), '014j: …and the other person still has it');
  perform send_chat_message(t1.id, 'Still there?');
  perform _t_as(robert);
  perform _t_ok(exists (select 1 from list_my_chats() x where x.thread_id = t1.id), '014j: a new message brings the chat back');
  perform leave_chat(t1.id);
  t2 := open_chat_thread(chloe);
  perform _t_ok(exists (select 1 from list_my_chats() x where x.thread_id = t1.id), '014j: opening the chat again brings it back');

  -- No anon access
  perform _t_as(null, 'anon');
  begin perform list_my_chats(); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014j: anon cannot call the chat functions');
  begin perform count(*) from public.chat_messages; v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014j: anon cannot read messages');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 014k (Booking request in the chat): the request becomes one card; a chat shows photos
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  sana constant uuid := '00000000-0000-4000-8000-0000000000d1';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  d constant date := app_today() + 230;
  t1 public.chat_threads;
  t2 public.chat_threads;
  v_b uuid;
  r public.chat_messages;
  r2 public.chat_messages;
  v_n int;
  v_err text;
begin
  perform _t_as(robert);
  v_b := request_booking(chloe, array[max], local_ts(d, '09:00'), 'sitter_home', null,
    local_ts(d + 1, '17:00'), 'owner_home', null, 'Pill at 2 PM');
  t1 := open_chat_thread(chloe);
  r := post_booking_request_card(t1.id, v_b);
  perform _t_ok(r.kind = 'card' and r.card ->> 'type' = 'request' and r.card ->> 'booking_id' = v_b::text,
    '014k: the request is posted into the chat as a card');
  perform _t_ok(r.card ->> 'note' = 'Pill at 2 PM'
      and r.card -> 'drop_off_place' ->> 'type' = 'sitter_home' and r.card -> 'pick_up_place' ->> 'type' = 'owner_home'
      and jsonb_array_length(r.card -> 'pets') = 1,
    '014k: the card carries the note, both places and the pets');
  r2 := post_booking_request_card(t1.id, v_b);
  select count(*) into v_n from public.chat_messages where thread_id = t1.id and card ->> 'type' = 'request';
  perform _t_ok(r2.id = r.id and v_n = 1, '014k: the same booking is never posted twice');

  -- Only the owner of the booking, in their own thread with that sitter
  perform _t_as(chloe);
  begin perform post_booking_request_card(t1.id, v_b); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'forbidden', '014k: the sitter cannot post a request card');
  perform _t_as(joy);
  begin perform post_booking_request_card(t1.id, v_b); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'forbidden', '014k: a third person cannot post into the thread');
  -- Robert has a photo; Sana shares nothing with him yet, then a chat counts
  perform _t_as(null);
  insert into public.profile_photos (profile_id, public_id, position) values (robert, 'goldito/robert/p1', 0);
  perform _t_as(sana);
  perform _t_ok(not exists (select 1 from public.profile_photos where profile_id = robert),
    '014k: a sitter does not see the photos of an owner they share nothing with');
  perform _t_as(robert);
  t2 := open_chat_thread(sana);
  perform _t_as(sana);
  perform _t_ok(exists (select 1 from public.profile_photos where profile_id = robert),
    '014k: …but does once the owner has a chat with them');
  perform _t_as(robert);
  begin perform post_booking_request_card(t2.id, v_b); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'forbidden', '014k: a booking with another sitter does not go into this thread');

  perform _t_as(null);
  delete from public.profile_photos where public_id = 'goldito/robert/p1'; -- the later 014g block counts Robert's photos
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Open by default + weekly closing rules (014d)
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  d constant date := app_today() + 500;
  v_dow int := extract(dow from d)::int;
  v_spots int;
  v_id uuid;
  v_err text;
  v_state text;
  v_left int;
begin
  perform _t_as(null);
  select default_max_pets into v_spots from public.sitter_profiles where id = chloe;

  -- Nothing set: every slot is open with the sitter's defaults
  perform _t_as(robert);
  perform _t_ok((select count(*) from get_sitter_schedule(chloe, d, d) where state = 'open' and remaining = v_spots) = 3,
    '014d: a day nobody touched is open in all three slots, with the default spots');
  perform _t_ok((select starts_at = '08:00' and ends_at = '12:00' from get_sitter_schedule(chloe, d, d) where slot = 'morning')
    or (select count(*) from get_sitter_schedule(chloe, d, d) where starts_at is not null and ends_at is not null) = 3,
    '014d: the default hours come back for a day nobody touched');
  perform _t_ok(stay_capacity_check(chloe, local_ts(d, '10:00'), local_ts(d + 1, '10:00'), 1) is null,
    '014d: a stay on untouched days fits');

  -- A rule closes that weekday × slot for good
  perform _t_as(chloe);
  perform save_closing_rules(jsonb_build_array(jsonb_build_object('weekday', v_dow, 'slot', 'overnight')));
  perform _t_as(robert);
  select state, remaining into v_state, v_left from get_sitter_schedule(chloe, d, d) where slot = 'overnight';
  perform _t_ok(v_state = 'closed' and v_left = 0, '014d: the rule closes that weekday''s overnight');
  perform _t_ok((select count(*) from get_sitter_schedule(chloe, d, d) where state = 'open') = 2,
    '014d: …and only that slot');
  perform _t_ok((select state from get_sitter_schedule(chloe, d + 7, d + 7) where slot = 'overnight') = 'closed',
    '014d: …every week');
  perform _t_ok((select state from get_sitter_schedule(chloe, d + 1, d + 1) where slot = 'overnight') = 'open',
    '014d: …but not other weekdays');
  perform _t_ok(stay_capacity_check(chloe, local_ts(d, '10:00'), local_ts(d + 1, '10:00'), 1) like '%overnight%',
    '014d: a stay through a rule-closed night is turned away');
  begin
    perform request_booking(chloe, array[max], local_ts(d, '10:00'), 'sitter_home', null,
      local_ts(d + 1, '10:00'), 'sitter_home', null, 'rule check');
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'sitter_unavailable', '014d: request_booking refuses a rule-closed night');
  perform _t_as(null);
  perform _t_ok(not within_sitter_hours(chloe, local_ts(d, '20:00')), '014d: a time in a rule-closed slot is outside the hours');
  perform _t_ok(within_sitter_hours(chloe, local_ts(d + 2, '20:00')), '014d: …and inside the default hours on a day with no rule');

  -- A day closed by hand still works, next to the rule
  perform _t_as(chloe);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot)
  values (chloe, 'blocked', d + 1, d + 1, 'morning');
  perform _t_as(robert);
  perform _t_ok((select state from get_sitter_schedule(chloe, d + 1, d + 1) where slot = 'morning') = 'blocked',
    '014d: a hand-closed day shows as blocked, the rule as closed');

  -- A rule never cancels a confirmed stay: the stay stays, nobody new can book that slot
  perform _t_as(chloe);
  perform save_closing_rules('[]'::jsonb);
  perform _t_as(robert);
  v_id := request_booking(chloe, array[max], local_ts(d + 14, '10:00'), 'sitter_home', null,
    local_ts(d + 15, '10:00'), 'sitter_home', null, 'before the rule');
  perform _t_as(chloe);
  perform _t_agree(v_id);
  perform respond_booking(v_id, true, null);
  perform save_closing_rules(jsonb_build_array(jsonb_build_object('weekday', extract(dow from d + 14)::int, 'slot', 'overnight')));
  perform _t_as(null);
  perform _t_ok((select status from public.bookings where id = v_id) = 'confirmed',
    '014d: a closing rule leaves a confirmed stay as it is');
  perform _t_as(robert);
  select state, remaining into v_state, v_left from get_sitter_schedule(chloe, d + 14, d + 14) where slot = 'overnight';
  perform _t_ok(v_state = 'full' and v_left = 0, '014d: …and the booked night reads full, not closed');

  -- Rules belong to the sitter
  perform _t_ok((select count(*) from public.sitter_closing_rules where sitter_id = chloe) = 0,
    '014d: an owner cannot read a sitter''s rules');
  begin perform save_closing_rules('[]'::jsonb); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'forbidden', '014d: an owner cannot save closing rules');
  perform _t_as(null, 'anon');
  begin perform save_closing_rules('[]'::jsonb); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014d: anon cannot save closing rules');
  perform _t_as(chloe);
  begin perform save_closing_rules('{"weekday": 1}'::jsonb); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_rules', '014d: rules must be a list');
  begin perform save_closing_rules('[{"weekday": 9, "slot": "morning"}]'::jsonb); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like '%sitter_closing_rules_weekday_check%', '014d: a weekday is 0 – 6');
  perform _t_ok((select count(*) from public.sitter_closing_rules where sitter_id = chloe) = 1,
    '014d: a sitter reads their own rules (and a refused save changed nothing)');
  perform save_closing_rules('[]'::jsonb);
  perform _t_ok((select count(*) from public.sitter_closing_rules where sitter_id = chloe) = 0,
    '014d: saving an empty list opens everything again');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Hours by weekday (014e)
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  d constant date := app_today() + 900;
  v_dow int := extract(dow from d)::int;
  v_err text;
  v_start time;
  v_end time;
begin
  perform _t_as(chloe);
  perform save_weekday_hours(jsonb_build_array(
    jsonb_build_object('weekday', v_dow, 'slot', 'morning', 'starts_at', '10:00', 'ends_at', '13:00')));

  -- That weekday's morning has its own hours; the other days keep the default
  perform _t_as(robert);
  select starts_at, ends_at into v_start, v_end from get_sitter_schedule(chloe, d, d) where slot = 'morning';
  perform _t_ok(v_start = '10:00' and v_end = '13:00', '014e: a weekday''s own hours show on that weekday');
  select starts_at into v_start from get_sitter_schedule(chloe, d + 7, d + 7) where slot = 'morning';
  perform _t_ok(v_start = '10:00', '014e: …every week');
  select starts_at into v_start from get_sitter_schedule(chloe, d + 1, d + 1) where slot = 'morning';
  perform _t_ok(v_start = '08:00', '014e: …and the other weekdays keep the default hours');
  select starts_at into v_start from get_sitter_schedule(chloe, d, d) where slot = 'afternoon';
  perform _t_ok(v_start = '12:00', '014e: …and the other slots of that weekday too');

  perform _t_as(null);
  perform _t_ok(not within_sitter_hours(chloe, local_ts(d, '08:30')), '014e: 08:30 is outside a morning that starts at 10:00');
  perform _t_ok(within_sitter_hours(chloe, local_ts(d + 1, '08:30')), '014e: …but inside the default morning on another weekday');

  -- A date opened by hand still wins over the weekday hours
  perform _t_as(chloe);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (chloe, 'open', d, d, 'morning', '11:00', '12:00', 2);
  perform _t_as(robert);
  select starts_at into v_start from get_sitter_schedule(chloe, d, d) where slot = 'morning';
  perform _t_ok(v_start = '11:00', '014e: an open row for the date beats the weekday hours');

  -- Rules belong to the sitter and are checked
  perform _t_ok((select count(*) from public.sitter_weekday_hours where sitter_id = chloe) = 0,
    '014e: an owner cannot read a sitter''s weekday hours');
  begin perform save_weekday_hours('[]'::jsonb); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'forbidden', '014e: an owner cannot save weekday hours');
  perform _t_as(null, 'anon');
  begin perform save_weekday_hours('[]'::jsonb); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014e: anon cannot save weekday hours');
  perform _t_as(chloe);
  begin perform save_weekday_hours('{"weekday": 1}'::jsonb); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_hours', '014e: weekday hours must be a list');
  begin
    perform save_weekday_hours('[{"weekday": 1, "slot": "morning", "starts_at": "13:00", "ends_at": "09:00"}]'::jsonb);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_hours', '014e: a morning that ends before it starts is refused');
  begin
    perform save_weekday_hours('[{"weekday": 9, "slot": "morning", "starts_at": "09:00", "ends_at": "12:00"}]'::jsonb);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_hours', '014e: a weekday is 0 – 6');
  perform save_weekday_hours('[{"weekday": 5, "slot": "overnight", "starts_at": "20:00", "ends_at": "07:00"}]'::jsonb);
  perform _t_ok((select count(*) from public.sitter_weekday_hours where sitter_id = chloe) = 1,
    '014e: an overnight may end the next morning, and a refused save changed nothing');
  perform save_weekday_hours('[]'::jsonb);
  perform _t_ok((select count(*) from public.sitter_weekday_hours where sitter_id = chloe) = 0,
    '014e: saving an empty list puts the default hours back');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Sitter onboarding answers (014f)
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  v_err text;
begin
  perform _t_as(null);
  perform _t_ok((select onboarded_at is null from public.sitter_profiles where id = chloe),
    '014f: a sitter who has not been through onboarding has no onboarded_at');

  -- Finishing with every question skipped is allowed
  perform _t_as(chloe);
  perform save_sitter_answers('[]'::jsonb);
  perform _t_ok((select onboarded_at is not null from public.sitter_profiles where id = chloe),
    '014f: onboarding can be finished with every question skipped');
  perform _t_ok((select count(*) from public.sitter_profile_answers where sitter_id = chloe) = 0,
    '014f: …and nothing is stored');

  -- Save: typed answers, a choice, a custom question, the intro
  perform save_sitter_answers(jsonb_build_array(
    jsonb_build_object('key', 'multiple_owners', 'choice', 'yes', 'answer', 'Two households at most'),
    jsonb_build_object('key', 'max_pets', 'choice', '3'),
    jsonb_build_object('key', 'walks_per_day', 'answer', 'Three, one long'),
    jsonb_build_object('key', 'dog_sizes', 'choice', 'small,medium'),
    jsonb_build_object('key', 'handoff', 'choice', 'owner_brings'),
    jsonb_build_object('key', 'park_nearby', 'answer', '   '),
    jsonb_build_object('key', 'custom_1', 'question', 'Do you have a fenced yard?', 'answer', 'Yes, small one')
  ), 'Hi, I am Chloe.');
  perform _t_ok((select count(*) from public.sitter_profile_answers where sitter_id = chloe) = 6,
    '014f: six answers are stored; a blank one counts as skipped');
  perform _t_ok((select accepts_multiple_owners and default_max_pets = 3 and bio = 'Hi, I am Chloe.'
                 from public.sitter_profiles where id = chloe),
    '014f: multiple_owners, max_pets and the intro reach the columns the booking rules read');
  perform _t_ok((select source = 'typed' and quote is null from public.sitter_profile_answers
                 where sitter_id = chloe and question_key = 'walks_per_day'),
    '014f: a typed answer has source typed and no quote');
  perform _t_ok((select question_text = 'Do you have a fenced yard?' from public.sitter_profile_answers
                 where sitter_id = chloe and question_key = 'custom_1'),
    '014f: a custom question keeps its own wording');

  -- Replace-all: a second save drops what is not sent, and a voice answer keeps its quote
  perform save_sitter_answers(jsonb_build_array(
    jsonb_build_object('key', 'cats', 'choice', 'no', 'source', 'voice', 'quote', 'no cats please')
  ), null, false);
  perform _t_ok((select count(*) from public.sitter_profile_answers where sitter_id = chloe) = 1,
    '014f: saving again replaces the whole list');
  perform _t_ok((select source = 'voice' and quote = 'no cats please' from public.sitter_profile_answers
                 where sitter_id = chloe and question_key = 'cats'),
    '014f: a voice answer keeps the sentence it was read from');
  perform _t_ok((select bio = 'Hi, I am Chloe.' from public.sitter_profiles where id = chloe),
    '014f: no intro sent leaves the bio as it was');

  -- Checks
  begin perform save_sitter_answers('[{"key": "max_pets", "choice": "11"}]'::jsonb); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_choice', '014f: a choice outside the question''s options is refused');
  perform save_sitter_answers('[{"key": "handoff", "choice": "sitter_picks_up,owner_brings"}]'::jsonb);
  perform _t_ok((select choice from public.sitter_profile_answers where sitter_id = chloe and question_key = 'handoff') = 'sitter_picks_up,owner_brings',
    '014h: the handoff answer can hold both options');
  begin perform save_sitter_answers('[{"key": "handoff", "choice": "owner_brings,sitter_picks_up"}]'::jsonb); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_choice', '014h: …in the one order the app sends, and no other spelling');
  begin perform save_sitter_answers('[{"key": "favourite_colour", "answer": "blue"}]'::jsonb); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_answers', '014f: an unknown question is refused');
  begin perform save_sitter_answers('[{"key": "custom_2", "answer": "no question text"}]'::jsonb); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_answers', '014f: a custom answer needs its question');
  begin perform save_sitter_answers('{"key": "cats"}'::jsonb); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_answers', '014f: answers must be a list');
  begin perform save_sitter_answers('[{"key": "cats", "choice": "no", "source": "robot"}]'::jsonb); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_answers', '014f: the source is typed or voice');
  begin perform save_sitter_answers('[]'::jsonb, repeat('x', 601)); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_intro', '014f: an intro over 600 characters is refused');
  perform _t_ok((select count(*) from public.sitter_profile_answers where sitter_id = chloe) = 1,
    '014f: a refused save changed nothing');

  -- Who reads and who writes
  perform _t_as(paul);
  perform _t_ok((select count(*) from public.sitter_profile_answers where sitter_id = chloe) = 0,
    '014f: another sitter cannot read Chloe''s answers');
  perform save_sitter_answers(jsonb_build_array(jsonb_build_object('key', 'cats', 'choice', 'yes')));
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.sitter_profile_answers where sitter_id in (chloe, paul)) = 2,
    '014f: an owner reads every sitter''s answers');
  begin perform save_sitter_answers('[]'::jsonb); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'forbidden', '014f: an owner cannot save sitter answers');
  begin insert into public.sitter_profile_answers (sitter_id, question_key, answer) values (robert, 'cats', 'x'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014f: there is no direct write to the table');
  perform _t_as(null, 'anon');
  begin perform save_sitter_answers('[]'::jsonb); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014f: anon cannot save sitter answers');
  begin perform count(*) from public.sitter_profile_answers; v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014f: anon cannot read the answers');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile photos (014g)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000e1', 'zed@example.test', '{"role":"sitter","display_name":"Zed"}');

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  zed constant uuid := '00000000-0000-4000-8000-0000000000e1';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  coco constant uuid := '00000000-0000-4000-8000-0000000000c3';
  v_ids uuid[];
  v_first uuid;
  v_out text;
  v_err text;
begin
  perform _t_as(null);

  -- Adding is the backend's job: positions run 0, 1, 2 and the 9th photo is refused
  perform add_profile_photo(chloe, 'profiles/chloe-a');
  perform add_profile_photo(chloe, 'profiles/chloe-b');
  perform add_profile_photo(chloe, 'profiles/chloe-c');
  perform _t_ok((select array_agg(position order by position) from public.profile_photos where profile_id = chloe) = array[0, 1, 2]::smallint[],
    '014g: photos are added at the end, cover first');
  for i in 4..8 loop perform add_profile_photo(paul, 'profiles/paul-' || i); end loop;
  perform add_profile_photo(paul, 'profiles/paul-9'); perform add_profile_photo(paul, 'profiles/paul-10'); perform add_profile_photo(paul, 'profiles/paul-11');
  begin perform add_profile_photo(paul, 'profiles/paul-12'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'too_many_photos', '014g: a person keeps at most 8 photos');

  -- Who reads a sitter's photos: the sitter, every owner; not another sitter, not anon
  perform _t_as(chloe);
  perform _t_ok((select count(*) from public.profile_photos where profile_id = chloe) = 3, '014g: a sitter reads their own photos');
  perform _t_ok((select count(*) from public.profile_photos where profile_id = paul) = 0, '014g: …and not another sitter''s');
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.profile_photos where profile_id = chloe) = 3, '014g: an owner reads a sitter''s photos');
  perform _t_as(joy);
  perform _t_ok((select count(*) from public.profile_photos where profile_id = chloe) = 3, '014g: …any owner');
  perform _t_as(null, 'anon');
  begin perform count(*) from public.profile_photos; v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014g: anon cannot read photos');

  -- An owner's photos: only a sitter who shares a booking or an inquiry sees them
  perform _t_as(null);
  perform add_profile_photo(robert, 'profiles/robert-a');
  perform add_profile_photo(robert, 'profiles/robert-b');
  perform add_profile_photo(joy, 'profiles/joy-a');
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.profile_photos where profile_id = robert) = 2, '014g: an owner reads their own photos');
  perform _t_as(joy);
  perform _t_ok((select count(*) from public.profile_photos where profile_id = robert) = 0, '014g: …and no other owner reads them');
  perform _t_as(chloe);
  perform _t_ok((select count(*) from public.profile_photos where profile_id = robert) = 2,
    '014g: a sitter with a booking with the owner reads their photos');
  perform _t_as(zed);
  perform _t_ok((select count(*) from public.profile_photos where profile_id in (robert, joy)) = 0,
    '014g: a sitter with no booking or inquiry reads no owner photos');
  perform _t_as(null);
  insert into public.inquiries (owner_id, sitter_id, drop_off_at, pick_up_at, pet_ids)
  values (joy, zed, now() + interval '900 days', now() + interval '901 days', array[coco]);
  perform _t_as(zed);
  perform _t_ok((select count(*) from public.profile_photos where profile_id = joy) = 1, '014g: an inquiry is enough to see the owner''s photos');
  perform _t_ok((select count(*) from public.profile_photos where profile_id = robert) = 0, '014g: …only for that owner');

  -- Reorder: exactly your own ids, first = cover
  perform _t_as(chloe);
  select array_agg(id order by position desc) into v_ids from public.profile_photos where profile_id = chloe;
  perform reorder_profile_photos(v_ids);
  perform _t_ok((select public_id from public.profile_photos where profile_id = chloe and position = 0) = 'profiles/chloe-c',
    '014g: reordering moves the cover');
  begin perform reorder_profile_photos(v_ids[1:2]); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_photos', '014g: a reorder that leaves a photo out is refused');
  begin perform reorder_profile_photos(array[v_ids[1], v_ids[1], v_ids[2]]); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_photos', '014g: …or repeats one');
  begin perform reorder_profile_photos(array[v_ids[1], v_ids[2], (select id from public.profile_photos where profile_id = paul limit 1)]); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_photos', '014g: …or names someone else''s photo');

  -- Remove (the backend's call): that person's photo only, positions close up, the public id comes back
  perform _t_as(null);
  select id into v_first from public.profile_photos where profile_id = chloe and position = 0;
  v_out := remove_profile_photo(chloe, v_first);
  perform _t_ok(v_out = 'profiles/chloe-c', '014g: removing returns the Cloudinary public id');
  perform _t_ok((select array_agg(position order by position) from public.profile_photos where profile_id = chloe) = array[0, 1]::smallint[],
    '014g: …and the gap closes');
  begin perform remove_profile_photo(chloe, v_first); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_found', '014g: a photo already gone is not found');
  begin perform remove_profile_photo(robert, (select id from public.profile_photos where profile_id = chloe limit 1)); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_found', '014g: a photo is removed only for the person it belongs to');
  perform _t_as(robert);
  begin perform remove_profile_photo(robert, (select id from public.profile_photos where profile_id = robert limit 1)); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014g: removing goes through the backend, not a signed-in user');

  -- No direct writes; the add function is the backend's
  begin insert into public.profile_photos (profile_id, public_id) values (robert, 'x'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014g: there is no direct insert');
  begin perform add_profile_photo(robert, 'profiles/sneaky'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014g: add_profile_photo is not callable by a signed-in user');
  perform _t_as(null, 'anon');
  begin perform remove_profile_photo(robert, v_first); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014g: anon cannot remove photos');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 014n (Quotes in the chat): the sitter's quote, extra fees, the owner's answers
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  d constant date := app_today() + 270;
  t1 public.chat_threads;
  q public.chat_messages;
  q2 public.chat_messages;
  v_extra uuid;
  v_extra2 uuid;
  v_base numeric;
  v_n int;
  v_err text;
begin
  perform _t_as(robert);
  t1 := open_chat_thread(chloe);

  -- Only the thread's sitter sends a quote, and the numbers are the server's
  begin perform send_chat_quote(t1.id, 'boarding', local_ts(d, '09:00'), local_ts(d + 2, '17:00'), array[max]); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'forbidden', '014n: an owner cannot send a quote');
  perform _t_as(chloe);
  q := send_chat_quote(t1.id, 'boarding', local_ts(d, '09:00'), local_ts(d + 2, '17:00'), array[max]);
  v_base := (quote_booking(chloe, 'boarding', local_ts(d, '09:00'), local_ts(d + 2, '17:00'), 1) ->> 'total')::numeric;
  perform _t_ok(q.kind = 'card' and q.card ->> 'type' = 'quote' and q.sender_id = chloe and q.card ->> 'status' = 'sent',
    '014n: the sitter posts a quote card');
  perform _t_ok((q.card ->> 'total')::numeric = v_base and (q.card -> 'quote' ->> 'total')::numeric = v_base,
    '014n: the card total is quote_booking''s total');
  begin perform send_chat_quote(t1.id, 'boarding', local_ts(d, '09:00'), local_ts(d + 2, '17:00'), array[]::uuid[]); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_stay', '014n: a quote needs pets');
  begin perform send_chat_quote(t1.id, 'boarding', local_ts(d + 2, '17:00'), local_ts(d, '09:00'), array[max]); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_window', '014n: a pick-up before the drop-off is refused by the quote function');

  -- Extra fees: the sitter adds, the owner answers
  q := add_chat_quote_extra(q.id, 'Medication visits', 12.50);
  v_extra := (q.card -> 'extras' -> 0 ->> 'id')::uuid;
  perform _t_ok(q.card -> 'extras' -> 0 ->> 'status' = 'offered' and (q.card ->> 'total')::numeric = v_base,
    '014n: an offered fee is not in the total yet');
  q := add_chat_quote_extra(q.id, 'Long walks', 20);
  v_extra2 := (q.card -> 'extras' -> 1 ->> 'id')::uuid;
  begin perform add_chat_quote_extra(q.id, 'Free', 0); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_extra', '014n: a fee must be above zero');
  begin perform add_chat_quote_extra(q.id, '', 5); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_extra', '014n: a fee needs a label');
  begin perform answer_chat_quote_extra(q.id, v_extra, true); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'forbidden', '014n: the sitter cannot answer her own fee');

  perform _t_as(robert);
  begin perform add_chat_quote_extra(q.id, 'Sneaky', 99); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'forbidden', '014n: the owner cannot add a fee');
  begin perform confirm_chat_quote(q.id); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'extras_pending', '014n: the quote cannot be confirmed while a fee waits for an answer');
  q := answer_chat_quote_extra(q.id, v_extra, true);
  perform _t_ok((q.card ->> 'total')::numeric = v_base + 12.50, '014n: an accepted fee is added to the total');
  q := answer_chat_quote_extra(q.id, v_extra2, false);
  perform _t_ok((q.card ->> 'total')::numeric = v_base + 12.50 and q.card -> 'extras' -> 1 ->> 'status' = 'declined',
    '014n: a declined fee is not in the total');
  begin perform answer_chat_quote_extra(q.id, v_extra2, true); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_extra', '014n: a fee that was answered cannot be answered again');

  q := confirm_chat_quote(q.id);
  perform _t_ok(q.card ->> 'status' = 'confirmed' and q.card ? 'confirmed_at', '014n: the owner confirms the quote');
  perform _t_as(chloe);
  begin perform add_chat_quote_extra(q.id, 'Late', 5); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'quote_closed', '014n: a confirmed quote takes no more fees');

  -- A new quote replaces an open one but not a confirmed one
  q2 := send_chat_quote(t1.id, 'boarding', local_ts(d, '09:00'), local_ts(d + 3, '17:00'), array[max]);
  q := send_chat_quote(t1.id, 'boarding', local_ts(d, '09:00'), local_ts(d + 4, '17:00'), array[max]);
  select count(*) into v_n from public.chat_messages where thread_id = t1.id and card ->> 'type' = 'quote' and card ->> 'status' = 'replaced';
  perform _t_ok(v_n = 1, '014n: a newer quote replaces the open one');
  select count(*) into v_n from public.chat_messages where thread_id = t1.id and card ->> 'type' = 'quote' and card ->> 'status' = 'confirmed';
  perform _t_ok(v_n = 1, '014n: …and leaves the confirmed one');

  -- The list says what the last message is
  perform _t_ok((select last_card_type from list_my_chats() x where x.thread_id = t1.id) = 'quote', '014n: the chat list knows the last card is a quote');

  -- Outsiders
  perform _t_as(joy);
  begin perform confirm_chat_quote(q.id); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'forbidden', '014n: a third person cannot confirm');
  perform _t_as(null, 'anon');
  begin perform send_chat_quote(t1.id, 'boarding', local_ts(d, '09:00'), local_ts(d + 2, '17:00'), array[max]); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014n: anon cannot call the quote functions');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 014o (Both sides agree, the final quote's fees in the price): the owner's "I'd like to book" and the sitter's "I accept"
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  allen constant uuid := '00000000-0000-4000-8000-0000000000b3';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  coco constant uuid := '00000000-0000-4000-8000-0000000000c3';
  d constant date := app_today() + 300;
  v1 uuid;
  v2 uuid;
  v3 uuid;
  v_h uuid;
  t1 public.chat_threads;
  q public.chat_messages;
  v_extra uuid;
  v_extra2 uuid;
  v_base numeric;
  v_quote jsonb;
  v_kind text;
  v_err text;
  r record;
begin
  perform _t_as(chloe);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (chloe, 'open', d - 1, d + 12, 'morning', '08:00', '12:00', 3),
         (chloe, 'open', d - 1, d + 12, 'afternoon', '12:00', '18:00', 3),
         (chloe, 'open', d - 1, d + 12, 'overnight', '18:00', '08:00', 3);

  -- A repeat pair (Robert and Chloe have met) is at "confirm" as soon as the request is in: both still have to say yes.
  perform _t_as(robert);
  v1 := request_booking(chloe, array[max], local_ts(d, '09:00'), 'sitter_home', null,
    local_ts(d + 2, '17:00'), 'sitter_home', null, null);
  select * into r from get_booking_stages(array[v1]);
  perform _t_ok(r.stage = 'confirm' and r.next_actor = 'both', '014o: a repeat pair is at confirm, both still to agree');
  begin perform pay_booking_demo(v1); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_status', '014o: no payment before the booking is confirmed');

  -- The sitter says yes first: still a request, now the owner's turn.
  perform _t_as(chloe);
  begin perform agree_to_book(v1); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_allowed', '014o: only the owner says "I''d like to book"');
  perform respond_booking(v1, true, 'See you!');
  perform _t_as(robert);
  select * into r from get_booking_stages(array[v1]);
  perform _t_ok((select status = 'requested' and sitter_accepted_at is not null and owner_agreed_at is null
        and sitter_note = 'See you!' from public.bookings where id = v1)
      and r.stage = 'confirm' and r.next_actor = 'owner',
    '014o: the sitter''s yes alone does not confirm; it is the owner''s turn');
  perform _t_ok((select count(*) from public.notifications where user_id = robert and type = 'booking_sitter_accepted'
      and booking_id = v1) = 1,
    '014o: the owner is told it is their turn');
  perform _t_ok((select count(*) from public.booking_handoffs where booking_id = v1 and status = 'agreed') = 0,
    '014o: nothing is agreed on the handoffs yet');

  -- The owner says yes: confirmed, waiting for payment.
  perform agree_to_book(v1);
  perform agree_to_book(v1);
  perform _t_ok((select status = 'confirmed' and owner_agreed_at is not null from public.bookings where id = v1)
      and (select count(*) from public.booking_handoffs where booking_id = v1 and status = 'agreed') = 2,
    '014o: both said yes, so it is confirmed with both handoffs agreed (and the owner''s yes is idempotent)');
  select * into r from get_booking_stages(array[v1]);
  perform _t_ok(r.stage = 'awaiting_payment' and r.next_actor = 'owner', '014o: confirmed and unpaid waits for the owner to pay');
  perform _t_as(null);
  perform _t_ok((select count(*) from public.notifications where user_id = chloe and type = 'booking_confirmed'
      and booking_id = v1) = 1,
    '014o: the sitter is told when the owner''s yes completes it');
  perform _t_as(robert);

  -- The owner says yes first; a new time the sitter proposes clears both yes.
  v2 := request_booking(chloe, array[max], local_ts(d + 5, '09:00'), 'sitter_home', null,
    local_ts(d + 6, '17:00'), 'sitter_home', null, null);
  perform agree_to_book(v2);
  perform _t_ok((select status = 'requested' and owner_agreed_at is not null and sitter_accepted_at is null
        from public.bookings where id = v2),
    '014o: the owner''s yes alone does not confirm');
  select * into r from get_booking_stages(array[v2]);
  perform _t_ok(r.stage = 'confirm' and r.next_actor = 'sitter', '014o: then it is the sitter''s turn');
  perform _t_as(null);
  perform _t_ok((select count(*) from public.notifications where user_id = chloe and type = 'booking_agree_requested'
      and booking_id = v2) = 1,
    '014o: the sitter is told the owner would like to book');
  perform _t_as(robert);
  perform _t_as(chloe);
  v_h := propose_handoff(v2, 'drop_off', local_ts(d + 5, '10:00'));
  perform _t_ok((select owner_agreed_at is null and sitter_accepted_at is null from public.bookings where id = v2),
    '014o: a new proposed time clears both yes');
  begin perform respond_booking(v2, true); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'handoff_pending', '014o: the sitter cannot say yes over her own pending time');
  perform _t_as(robert);
  begin perform agree_to_book(v2); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'handoff_pending', '014o: the owner answers the proposed time first');
  perform respond_handoff(v_h, true);
  perform agree_to_book(v2);
  perform _t_as(chloe);
  perform respond_booking(v2, true);
  perform _t_ok((select status = 'confirmed' from public.bookings where id = v2), '014o: the second yes confirms, in either order');
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.notifications where user_id = robert and type = 'booking_confirmed'
      and booking_id = v2) = 1,
    '014o: the owner is told when the sitter''s yes completes it');

  -- A first-time pair needs the Meet & Greet over before either yes.
  perform _t_as(joy);
  v3 := request_booking(allen, array[coco], local_ts(d + 8, '09:00'), 'sitter_home', null,
    local_ts(d + 9, '17:00'), 'sitter_home', null, null);
  perform _t_as(null);
  perform _t_meet(v3, 'required');
  perform _t_as(joy);
  perform open_chat_thread(allen);
  perform _t_as(allen);
  perform express_interest(v3);
  perform _t_as(joy);
  begin perform agree_to_book(v3); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'meet_greet_required', '014o: no "I''d like to book" before the Meet & Greet is over');
  perform _t_as(null);
  perform _t_meet(v3, 'skipped');
  perform _t_as(joy);
  select * into r from get_booking_stages(array[v3]);
  perform _t_ok(r.stage = 'confirm' and r.next_actor = 'both', '014o: after a skipped Meet & Greet both still say yes');
  perform _t_as(null);

  -- The price: the final quote's accepted fees, computed here.
  perform _t_as(robert);
  v_base := (quote_booking(chloe, 'boarding', local_ts(d, '09:00'), local_ts(d + 2, '17:00'), 1) ->> 'total')::numeric;
  v_quote := quote_booking_for(v1);
  perform _t_ok((v_quote ->> 'total')::numeric = v_base and jsonb_array_length(v_quote -> 'extras') = 0
      and (v_quote ->> 'extras_total')::numeric = 0,
    '014o: no confirmed quote card, no fees: the price is quote_booking''s');
  perform _t_as(joy);
  begin perform quote_booking_for(v1); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_allowed', '014o: a stranger cannot read the booking''s price');

  perform _t_as(robert);
  t1 := open_chat_thread(chloe);
  perform _t_as(chloe);
  q := send_chat_quote(t1.id, 'boarding', local_ts(d, '09:00'), local_ts(d + 2, '17:00'), array[max]);
  q := add_chat_quote_extra(q.id, 'Medication visits', 12.50);
  v_extra := (q.card -> 'extras' -> 0 ->> 'id')::uuid;
  q := add_chat_quote_extra(q.id, 'Long walks', 20);
  v_extra2 := (q.card -> 'extras' -> 1 ->> 'id')::uuid;
  perform _t_as(robert);
  q := answer_chat_quote_extra(q.id, v_extra, true);
  q := answer_chat_quote_extra(q.id, v_extra2, false);
  v_quote := quote_booking_for(v1);
  perform _t_ok((v_quote ->> 'total')::numeric = v_base and jsonb_array_length(v_quote -> 'extras') = 0,
    '014o: fees on a quote nobody confirmed are not in the price');
  q := confirm_chat_quote(q.id);
  v_quote := quote_booking_for(v1);
  perform _t_ok((v_quote ->> 'total')::numeric = v_base + 12.50 and (v_quote ->> 'subtotal')::numeric = v_base
      and (v_quote ->> 'extras_total')::numeric = 12.50
      and jsonb_array_length(v_quote -> 'extras') = 1 and v_quote -> 'extras' -> 0 ->> 'label' = 'Medication visits',
    '014o: only the accepted fee of the confirmed quote is in the price');
  perform _t_as(chloe);
  perform _t_ok((quote_booking_for(v1) ->> 'total')::numeric = v_base + 12.50, '014o: the sitter sees the same total');

  -- A newer quote nobody confirmed, and a confirmed quote for another stay, change nothing.
  q := send_chat_quote(t1.id, 'boarding', local_ts(d, '09:00'), local_ts(d + 2, '17:00'), array[max]);
  q := add_chat_quote_extra(q.id, 'Grooming', 99);
  perform _t_as(robert);
  q := answer_chat_quote_extra(q.id, (q.card -> 'extras' -> 0 ->> 'id')::uuid, true);
  perform _t_ok((quote_booking_for(v1) ->> 'total')::numeric = v_base + 12.50, '014o: an open newer quote does not change the price');
  perform _t_as(chloe);
  q := send_chat_quote(t1.id, 'boarding', local_ts(d + 20, '09:00'), local_ts(d + 21, '17:00'), array[max]);
  q := add_chat_quote_extra(q.id, 'Elsewhere', 40);
  perform _t_as(robert);
  q := answer_chat_quote_extra(q.id, (q.card -> 'extras' -> 0 ->> 'id')::uuid, true);
  q := confirm_chat_quote(q.id);
  perform _t_ok((quote_booking_for(v1) ->> 'total')::numeric = v_base + 12.50, '014o: a confirmed quote for another stay does not change the price');

  -- Pay: the snapshot is what Checkout showed.
  foreach v_kind in array required_consents(v1) loop
    insert into public.booking_consents (booking_id, kind, version, signer_id, signer_name, details)
    values (v1, v_kind, '1', robert, 'Robert',
      case v_kind
        when 'emergency_vet' then jsonb_build_object('limit_cad', 500, 'vet_clinic_name', 'Demo Vet')
        when 'safe_return' then jsonb_build_object('receiver_name', 'Robert')
        else '{}'::jsonb
      end);
  end loop;
  v_quote := pay_booking_demo(v1);
  perform _t_as(null);
  perform _t_ok((v_quote ->> 'total')::numeric = v_base + 12.50
      and (select (price_snapshot ->> 'total')::numeric = v_base + 12.50 and jsonb_array_length(price_snapshot -> 'extras') = 1
            and paid_at is not null from public.bookings where id = v1),
    '014o: payment freezes the base price plus the accepted fees');
  perform _t_ok(exists (select 1 from public.notifications where user_id = chloe and type = 'booking_paid' and booking_id = v1
      and body like '%$' || (v_base + 12.50)::text || '%'),
    '014o: the sitter''s payment notice shows the total with fees');

  -- The steps show up in the pair's chat as cards that hold only the booking's id.
  perform _t_as(null);
  select * into t1 from public.chat_threads where owner_id = robert and sitter_id = chloe;
  perform _t_ok((select count(*) from public.chat_messages where thread_id = t1.id and card ->> 'type' = 'agreement'
        and card ->> 'booking_id' = v1::text) = 1
      and (select count(*) from public.chat_messages where thread_id = t1.id and card ->> 'type' = 'payment'
        and card ->> 'booking_id' = v1::text) = 1,
    '014o: one agreement card and one payment card for the booking');
  perform _t_ok(not exists (select 1 from public.chat_messages where thread_id = t1.id and card ->> 'type' = 'meet_greet'
        and card ->> 'booking_id' = v1::text),
    '014o: a repeat pair has no Meet & Greet card');
  perform _t_ok((select sender_id = chloe and (card ->> 'rev')::int >= 1 and card - 'rev' - 'type' - 'booking_id' = '{}'::jsonb
        from public.chat_messages where thread_id = t1.id and card ->> 'type' = 'agreement' and card ->> 'booking_id' = v1::text),
    '014o: the card is sent by who acted first, is touched on every change, and carries only the booking id');
  perform _t_ok((select sender_id = robert from public.chat_messages
        where thread_id = t1.id and card ->> 'type' = 'payment' and card ->> 'booking_id' = v1::text),
    '014o: the payment card is sent by the one who confirmed it');
  perform _t_ok((select count(*) from public.chat_messages m join public.chat_threads t on t.id = m.thread_id
        where t.owner_id = joy and t.sitter_id = allen and m.card ->> 'booking_id' = v3::text and m.card ->> 'type' = 'meet_greet') = 1
      and (select count(*) from public.chat_messages m join public.chat_threads t on t.id = m.thread_id
        where t.owner_id = joy and t.sitter_id = allen and m.card ->> 'booking_id' = v3::text and m.card ->> 'type' = 'agreement') = 1,
    '014o: a first-time pair gets a Meet & Greet card at the sitter''s first yes and an agreement card after it');
  perform _t_as(robert);
  perform _t_ok(not exists (select 1 from public.chat_messages where card ->> 'booking_id' = v3::text),
    '014o: another pair''s booking cards are not readable');
  perform _t_as(joy);
  perform _t_ok((select count(*) from public.chat_messages where card ->> 'booking_id' = v3::text
        and card ->> 'type' in ('meet_greet', 'agreement')) = 2,
    '014o: the pair reads its own booking cards');
  perform _t_as(null);
  update public.bookings set status = 'cancelled' where id = v3;
  perform _t_ok((select min((card ->> 'rev')::int) from public.chat_messages where card ->> 'booking_id' = v3::text) >= 2,
    '014o: a cancelled booking touches its cards and posts no new one');
  perform _t_ok((select count(*) from public.chat_messages where card ->> 'booking_id' = v3::text
      and card ->> 'type' in ('meet_greet', 'agreement')) = 2, '014o: …still two cards');

  -- Anon cannot call the new functions.
  perform _t_as(null, 'anon');
  begin perform agree_to_book(v2); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014o: anon cannot say yes');
  begin perform quote_booking_for(v2); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014o: anon cannot read a booking price');
  perform _t_as(robert);
  begin perform booking_extra_fees(v1); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014o: the fee helper is internal');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 014p (Diary, #186): the owner writes a diary page of their own
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  pip uuid;
  v_id uuid;
  v_second uuid;
  v_err text;
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Pip') returning id into pip;
  perform _t_booking(robert, chloe, array[pip], now() - interval '1 hour', now() + interval '1 day', 'confirmed');

  -- The owner writes a page: sent at once, trimmed, the owner is the author
  perform _t_as(robert);
  v_id := public.add_owner_diary_entry(pip, '  A long walk in the park.  ');
  perform _t_ok((select status = 'sent' and sent_at is not null and sitter_id = robert and body = 'A long walk in the park.'
        and report_date = public.app_today() and model is null
      from public.daily_reports where id = v_id),
    '014p: the owner''s page is sent at once, trimmed, with the owner as its author');
  v_second := public.add_owner_diary_entry(pip, 'Evening cuddles.');
  perform _t_ok((select count(*) from public.daily_reports where pet_id = pip) = 2 and v_second <> v_id,
    '014p: the owner may write more than one page a day');
  perform _t_ok(public.can_decorate_report(v_id), '014p: the owner can put stickers on their own page');

  -- Nobody else sees it, and nobody else can write one
  perform _t_as(chloe);
  perform _t_ok((select count(*) from public.daily_reports where pet_id = pip) = 0,
    '014p: the sitter on duty does not see the owner''s pages');
  perform _t_ok(not public.can_decorate_report(v_id), '014p: the sitter cannot decorate the owner''s page');
  begin perform public.add_owner_diary_entry(pip, 'Sitter text.'); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_owner', '014p: a sitter cannot write an owner page');
  perform _t_as(joy);
  begin perform public.add_owner_diary_entry(pip, 'Not my dog.'); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_owner', '014p: another owner cannot write on my pet''s page');
  perform _t_ok((select count(*) from public.daily_reports where pet_id = pip) = 0, '014p: another owner does not see it');

  -- Empty and too long are refused; no notice goes out; anon cannot call it
  perform _t_as(robert);
  begin perform public.add_owner_diary_entry(pip, '   '); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'body_required', '014p: an empty page is refused');
  begin perform public.add_owner_diary_entry(pip, repeat('x', 2001)); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'body_too_long', '014p: a page over 2000 characters is refused');
  perform _t_ok(not exists (select 1 from public.notifications where pet_id = pip), '014p: nobody is notified of an owner page');
  perform _t_as(null, 'anon');
  begin perform public.add_owner_diary_entry(pip, 'Anon.'); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014p: anon cannot write a page');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 014r: a drop-off + pick-up suggestion is one pair; the owner's default handoff place
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  d constant date := app_today() + 800;
  rex uuid;
  v_b uuid;
  v_pair uuid;
  v_drop uuid;
  v_pick uuid;
  v_err text;
begin
  perform _t_as(chloe);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (chloe, 'open', d - 1, d + 12, 'morning', '08:00', '12:00', 3),
         (chloe, 'open', d - 1, d + 12, 'afternoon', '12:00', '18:00', 3),
         (chloe, 'open', d - 1, d + 12, 'overnight', '18:00', '08:00', 3);
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Rex') returning id into rex;
  v_b := _t_booking(robert, chloe, array[rex], local_ts(d, '09:00'), local_ts(d + 2, '17:00'), 'confirmed');

  -- One suggestion for both: two rows with one key, one notice
  perform _t_as(robert);
  v_pair := propose_handoff_pair(v_b, local_ts(d + 1, '09:00'), local_ts(d + 3, '17:00'));
  perform _t_ok(v_pair is not null
      and (select count(*) from public.booking_handoffs where booking_id = v_b and status = 'proposed' and pair_id = v_pair) = 2
      and (select count(distinct kind) from public.booking_handoffs where pair_id = v_pair) = 2,
    '014r: a pair suggestion writes the drop-off and the pick-up with one key');
  perform _t_as(null);
  perform _t_ok((select count(*) from public.notifications where user_id = chloe and type = 'handoff_proposed'
      and title = 'Robert suggested a new drop-off and pick-up') = 1,
    '014r: …and the other person gets one notice, not two');

  -- The window has to be real, and only the two people on the booking can suggest
  perform _t_as(robert);
  begin perform propose_handoff_pair(v_b, local_ts(d + 4, '09:00'), local_ts(d + 3, '17:00')); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_window', '014r: a pick-up before the drop-off is refused');
  perform _t_as(joy);
  begin perform propose_handoff_pair(v_b, local_ts(d + 1, '09:00'), local_ts(d + 3, '17:00')); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_allowed', '014r: a third party cannot suggest a pair');
  perform _t_as(null, 'anon');
  begin perform propose_handoff_pair(v_b, local_ts(d + 1, '09:00'), local_ts(d + 3, '17:00')); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014r: anon cannot suggest a pair');
  perform _t_as(null);

  -- The answer takes both, even though each time fits on its own
  select id into v_pick from public.booking_handoffs where pair_id = v_pair and kind = 'pick_up';
  select id into v_drop from public.booking_handoffs where pair_id = v_pair and kind = 'drop_off';
  perform _t_as(robert);
  begin perform respond_handoff(v_pick, true); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_allowed', '014r: the one who suggested cannot answer');
  perform _t_as(chloe);
  perform respond_handoff(v_pick, true);
  perform _t_as(null);
  perform _t_ok((select status from public.booking_handoffs where id = v_drop) = 'agreed'
      and (select status from public.booking_handoffs where id = v_pick) = 'agreed',
    '014r: accepting one row of a pair agrees both');
  perform _t_ok((select care_range from public.booking_pets where booking_id = v_b)
      = tstzrange(local_ts(d + 1, '09:00'), local_ts(d + 3, '17:00'), '[)'),
    '014r: …and the stay is rebuilt for the new window');
  perform _t_ok((select count(*) from public.notifications where user_id = robert and type = 'handoff_agreed'
      and ref_id = v_pick and title like 'Chloe agreed to the new drop-off and pick-up%') = 1,
    '014r: …and the owner is told once');

  -- Declining takes both; the agreed stay stays
  perform _t_as(chloe);
  v_pair := propose_handoff_pair(v_b, local_ts(d + 2, '09:00'), local_ts(d + 4, '17:00'));
  select id into v_drop from public.booking_handoffs where pair_id = v_pair and kind = 'drop_off';
  select id into v_pick from public.booking_handoffs where pair_id = v_pair and kind = 'pick_up';
  perform _t_as(robert);
  perform respond_handoff(v_pick, false);
  perform _t_as(null);
  perform _t_ok((select status from public.booking_handoffs where id = v_drop) = 'rejected'
      and (select status from public.booking_handoffs where id = v_pick) = 'rejected',
    '014r: declining one row of a pair declines both');
  perform _t_ok((select care_range from public.booking_pets where booking_id = v_b)
      = tstzrange(local_ts(d + 1, '09:00'), local_ts(d + 3, '17:00'), '[)'),
    '014r: …and the agreed stay stays');

  -- A newer suggestion for one handoff turns the other row into a single one
  perform _t_as(robert);
  v_pair := propose_handoff_pair(v_b, local_ts(d + 2, '09:00'), local_ts(d + 4, '17:00'));
  perform propose_handoff(v_b, 'drop_off', local_ts(d + 2, '10:00'));
  perform _t_as(null);
  perform _t_ok((select pair_id is null from public.booking_handoffs where pair_id is not distinct from null
      and booking_id = v_b and kind = 'pick_up' and status = 'proposed')
      and not exists (select 1 from public.booking_handoffs where pair_id = v_pair and status = 'proposed'),
    '014r: replacing one row of a pair leaves the other as a single suggestion');
  select id into v_pick from public.booking_handoffs where booking_id = v_b and kind = 'pick_up' and status = 'proposed';
  perform _t_as(chloe);
  perform respond_handoff(v_pick, true);
  perform _t_as(null);
  perform _t_ok((select status from public.booking_handoffs where booking_id = v_b and kind = 'drop_off' and status <> 'agreed' and scheduled_at = local_ts(d + 2, '10:00')) = 'proposed',
    '014r: …and answering that one leaves the new drop-off waiting');

  -- Before confirm: the sitter answers a pair of the owner's suggestions; no rebuild, both agreed
  perform _t_as(null);
  v_b := _t_booking(robert, chloe, array[rex], local_ts(d + 7, '09:00'), local_ts(d + 9, '17:00'), 'requested');
  perform _t_as(robert);
  v_pair := propose_handoff_pair(v_b, local_ts(d + 7, '10:00'), local_ts(d + 9, '16:00'), 'owner_home');
  perform _t_as(null);
  select id into v_drop from public.booking_handoffs where pair_id = v_pair and kind = 'drop_off';
  perform _t_ok((select location_type from public.booking_handoffs where id = v_drop) = 'owner_home'
      and (select location_type from public.booking_handoffs where pair_id = v_pair and kind = 'pick_up') = 'sitter_home',
    '014r: each row of a pair keeps its own place (an omitted place stays as it was)');
  perform _t_as(chloe);
  perform respond_handoff(v_drop, true);
  perform _t_as(null);
  perform _t_ok((select count(*) from public.booking_handoffs where booking_id = v_b and status = 'agreed') = 2
      and (select status from public.bookings where id = v_b) = 'requested',
    '014r: before confirm a pair is agreed together and the request stays a request');

  -- The owner's default handoff place
  perform _t_as(robert);
  update public.owner_profiles set default_handoff = 'owner_home' where id = robert;
  perform _t_ok((select default_handoff from public.owner_profiles where id = robert) = 'owner_home',
    '014r: the owner saves a default handoff place');
  begin update public.owner_profiles set default_handoff = 'on_the_moon' where id = robert; v_err := null; exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '23514', '014r: …only one of the three places');
  perform _t_as(joy);
  update public.owner_profiles set default_handoff = 'other' where id = robert;
  perform _t_as(null);
  perform _t_ok((select default_handoff from public.owner_profiles where id = robert) = 'owner_home',
    '014r: …and nobody else changes it');
end;
$$;

-- ---------------------------------------------------------------------------
-- 014t (Diary, #243): delete a page, hide a sitter's page on the owner's side, a photo on the page
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  pip uuid;
  other_pet uuid;
  v_sit uuid;
  v_sit2 uuid;
  v_draft uuid;
  v_own uuid;
  m_ok uuid;
  m_robert uuid;
  m_other uuid;
  m_video uuid;
  v_err text;
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Pip14t') returning id into pip;
  insert into public.pets (owner_id, species, name) values (joy, 'cat', 'Kit14t') returning id into other_pet;
  perform _t_booking(robert, chloe, array[pip], now() - interval '1 hour', now() + interval '1 day', 'confirmed');
  insert into public.daily_reports (pet_id, sitter_id, report_date, body, status, sent_at)
    values (pip, chloe, public.app_today(), 'Sitter page one.', 'sent', now()) returning id into v_sit;
  insert into public.daily_reports (pet_id, sitter_id, report_date, body, status, sent_at)
    values (pip, chloe, public.app_today(), 'Sitter page two.', 'sent', now()) returning id into v_sit2;
  insert into public.daily_reports (pet_id, sitter_id, report_date, body, status)
    values (pip, chloe, public.app_today(), 'Sitter draft.', 'draft') returning id into v_draft;
  perform public.notify_user(robert, 'report_sent', 'one', null, pip, null, v_sit);
  perform public.notify_user(robert, 'report_sent', 'two', null, pip, null, v_sit2);
  insert into public.report_decor (report_id, user_id, items) values (v_sit2, robert, '[]'), (v_sit2, chloe, '[]');
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip, chloe, 'smoke/014t/ok', 'image', 'report') returning id into m_ok;
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip, robert, 'smoke/014t/robert', 'image', 'feed') returning id into m_robert;
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (other_pet, chloe, 'smoke/014t/other', 'image', 'report') returning id into m_other;
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip, chloe, 'smoke/014t/video', 'video', 'feed') returning id into m_video;

  -- Hide: the owner takes a sitter's page out of their own book only
  perform _t_as(robert);
  v_own := public.add_owner_diary_entry(pip, 'My own page.');
  perform _t_ok((select count(*) from public.daily_reports where pet_id = pip) = 3, '014t: the owner sees both sitter pages and their own');
  perform public.hide_diary_page(v_sit);
  perform public.hide_diary_page(v_sit); -- a second hide is a no-op
  perform _t_ok((select count(*) from public.daily_reports where pet_id = pip) = 2
      and not exists (select 1 from public.daily_reports where id = v_sit),
    '014t: a hidden page is gone from the owner''s book');
  perform _t_ok(not exists (select 1 from public.notifications where user_id = robert and ref_id = v_sit)
      and exists (select 1 from public.notifications where user_id = robert and ref_id = v_sit2),
    '014t: hiding clears that page''s notice and no other');
  begin perform public.hide_diary_page(v_own); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'own_page', '014t: the owner''s own page is deleted, not hidden');
  begin perform public.hide_diary_page(v_draft); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_found', '014t: a draft cannot be hidden');
  perform _t_as(chloe);
  perform _t_ok(exists (select 1 from public.daily_reports where id = v_sit), '014t: the sitter''s copy of a hidden page stays');
  begin perform public.hide_diary_page(v_sit2); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_owner', '014t: a sitter cannot hide a page');
  perform _t_as(joy);
  begin perform public.hide_diary_page(v_sit2); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_owner', '014t: another owner cannot hide my pet''s page');
  perform _t_ok((select count(*) from public.diary_page_hidden) = 0, '014t: nobody reads another person''s hidden rows');
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.diary_page_hidden) = 1, '014t: the owner reads their own hidden rows');
  begin insert into public.diary_page_hidden (report_id) values (v_sit2); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014t: hidden rows are written only through hide_diary_page');

  -- A photo on the page: the author's own image of that pet
  perform _t_as(chloe);
  perform public.set_diary_page_photo(v_sit2, m_ok);
  perform _t_ok((select media_id from public.daily_reports where id = v_sit2) = m_ok, '014t: the sitter puts a photo on their page');
  begin perform public.set_diary_page_photo(v_sit2, m_robert); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'bad_photo', '014t: …not someone else''s photo');
  begin perform public.set_diary_page_photo(v_sit2, m_other); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'bad_photo', '014t: …not another pet''s photo');
  begin perform public.set_diary_page_photo(v_sit2, m_video); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'bad_photo', '014t: …not a video');
  perform _t_as(robert);
  perform _t_ok((select media_id from public.daily_reports where id = v_sit2) = m_ok
      and exists (select 1 from public.media where id = m_ok),
    '014t: the owner reads the photo of the page');
  begin perform public.set_diary_page_photo(v_sit2, m_robert); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_author', '014t: the owner cannot change a sitter''s page photo');
  perform public.set_diary_page_photo(v_own, m_robert);
  perform _t_ok((select media_id from public.daily_reports where id = v_own) = m_robert, '014t: the owner puts a photo on their own page');
  perform _t_as(chloe);
  perform public.set_diary_page_photo(v_sit2, null);
  perform _t_ok((select media_id from public.daily_reports where id = v_sit2) is null, '014t: the photo can be taken off');

  -- Delete: only the author, the page and its stickers and notice go, the photo stays
  perform public.set_diary_page_photo(v_sit2, m_ok);
  perform _t_as(robert);
  begin perform public.delete_diary_page(v_sit2); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_author', '014t: the owner cannot delete a sitter''s page');
  perform _t_as(joy);
  begin perform public.delete_diary_page(v_own); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_author', '014t: another owner cannot delete my page');
  perform _t_as(chloe);
  perform public.delete_diary_page(v_draft);
  perform public.delete_diary_page(v_sit2);
  begin perform public.delete_diary_page(v_sit2); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_found', '014t: a page is deleted once');
  perform _t_as(robert);
  perform _t_ok(not exists (select 1 from public.daily_reports where id = v_sit2)
      and not exists (select 1 from public.notifications where ref_id = v_sit2)
      and not exists (select 1 from public.report_decor where report_id = v_sit2),
    '014t: a sitter''s deleted page is gone for the owner too, with its notice and stickers');
  perform _t_ok(exists (select 1 from public.media where id = m_ok), '014t: deleting a page keeps its photo');
  perform public.delete_diary_page(v_own);
  perform _t_ok((select count(*) from public.daily_reports where id = v_own) = 0, '014t: the owner deletes their own page');
  perform _t_as(null, 'anon');
  begin perform public.delete_diary_page(v_sit); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014t: anon cannot delete');
  begin perform public.hide_diary_page(v_sit); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014t: anon cannot hide');
  begin perform public.set_diary_page_photo(v_sit, null); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014t: anon cannot set a page photo');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 014u (#232): an early Returned gives the sitter the rest of the stay back
-- ---------------------------------------------------------------------------

do $$
declare
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  allen constant uuid := '00000000-0000-4000-8000-0000000000b3';
  v_pet uuid;
  v_pet2 uuid;
  v_b uuid;
  v_on uuid;
  v_before int;
  v_after_now int;
  v_n int;
  v_from timestamptz := date_trunc('hour', now()) - interval '1 day';
  v_to timestamptz := date_trunc('hour', now()) + interval '3 days';
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (joy, 'dog', 'Biscuit') returning id into v_pet;
  insert into public.pets (owner_id, species, name) values (joy, 'cat', 'Pepper') returning id into v_pet2;

  -- A stay that started yesterday and runs three more days, already Received.
  v_b := _t_booking(joy, allen, array[v_pet], v_from, v_to, 'confirmed', true);
  delete from public.booking_slots where booking_id = v_b;
  insert into public.booking_slots (booking_id, pet_id, day, slot)
  select v_b, v_pet, f.day, f.slot from public.slots_for_window(allen, v_from, v_to) f;
  select count(*) into v_before from public.booking_slots where booking_id = v_b;
  select count(*) into v_after_now from public.booking_slots s
  where s.booking_id = v_b
    and lower(coalesce(sitter_hours(allen, s.day, s.slot), default_slot_range(allen, s.day, s.slot))) >= now();
  perform _t_ok(v_after_now > 0 and v_before > v_after_now, '014u: fixture holds slots before and after now');

  -- Returned today, days early.
  perform _t_as(allen);
  perform complete_handoff(v_b, 'pick_up');
  perform _t_as(null);
  select count(*) into v_n from public.booking_slots s
  where s.booking_id = v_b
    and lower(coalesce(sitter_hours(allen, s.day, s.slot), default_slot_range(allen, s.day, s.slot))) >= now();
  perform _t_ok(v_n = 0, '014u: an early Returned frees every slot that starts after the return');
  perform _t_ok((select count(*) from public.booking_slots where booking_id = v_b) = v_before - v_after_now,
    '014u: …and keeps the slots the stay already used');
  perform _t_ok(not exists (
      select 1 from public.booking_slots s where s.booking_id = v_b
        and s.day = (v_to at time zone app_timezone())::date - 1),
    '014u: …so tomorrow and later count nothing for this sitter');

  -- A return after the agreed pick-up changes nothing.
  v_on := _t_booking(joy, allen, array[v_pet2], v_from - interval '3 days', now() - interval '1 hour', 'confirmed', true);
  delete from public.booking_slots where booking_id = v_on;
  insert into public.booking_slots (booking_id, pet_id, day, slot)
  select v_on, v_pet2, f.day, f.slot from public.slots_for_window(allen, v_from - interval '3 days', now() - interval '1 hour') f;
  select count(*) into v_before from public.booking_slots where booking_id = v_on;
  perform _t_as(allen);
  perform complete_handoff(v_on, 'pick_up');
  perform _t_as(null);
  perform _t_ok((select count(*) from public.booking_slots where booking_id = v_on) = v_before,
    '014u: a return after the agreed pick-up keeps every slot');

  -- Nobody can call the helper directly.
  perform _t_as(allen);
  begin
    perform release_slots_after(v_on, now() - interval '10 days');
    v_n := null;
  exception when others then v_n := -1;
  end;
  perform _t_ok(v_n = -1, '014u: release_slots_after is not callable by a signed-in user');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 014v (11.15 S1, #185): pet answers, owner intro, pet photos, save a pet in one call
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  zed constant uuid := '00000000-0000-4000-8000-0000000000e1';
  v_id uuid := gen_random_uuid();
  v_tmp uuid := gen_random_uuid();
  v_ids uuid[];
  v_first uuid;
  v_out text;
  v_err text;
begin
  perform _t_as(robert);

  -- One call saves the pet, its answers and its allergies
  perform create_pet_with_profile(v_id, 'dog', 'Pip14v', 'Maltese', null, 6, null,
    '{"answers":{"q1":3},"safety":{"s1":"never"}}', array[' Chicken ', 'chicken', 'Dairy', '']);
  perform _t_ok((select profile->'answers'->>'q1' from public.pets where id = v_id) = '3', '014v: the answers are saved with the pet');
  perform _t_ok((select count(*) from public.pet_allergies where pet_id = v_id) = 2,
    '014v: allergies are trimmed, lowercased and unique');

  -- A retry with the same id updates instead of failing, and replaces the allergies
  perform create_pet_with_profile(v_id, 'dog', 'Pip14v', 'Maltese', null, 6, null, '{"answers":{"q1":4}}', array['dairy', 'fish']);
  perform _t_ok((select count(*) from public.pets where id = v_id) = 1, '014v: a retry does not make a second pet');
  perform _t_ok((select profile->'answers'->>'q1' from public.pets where id = v_id) = '4', '014v: …and updates the answers');
  perform _t_ok((select array_agg(allergen order by allergen) from public.pet_allergies where pet_id = v_id) = array['dairy', 'fish'],
    '014v: …and the allergies follow the new list');

  -- The answers must be an object, and not huge
  begin perform create_pet_with_profile(gen_random_uuid(), 'dog', 'Bad', null, null, null, null, '[1]', '{}'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like '%pets_profile_shape%', '014v: pets.profile must be an object');
  begin perform create_pet_with_profile(gen_random_uuid(), 'dog', 'Big', null, null, null, null,
    jsonb_build_object('x', repeat('a', 17000)), '{}'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like '%pets_profile_shape%', '014v: pets.profile is capped at 16000 characters');

  -- Another owner's pet id is not overwritten, a sitter cannot save a pet
  perform _t_as(joy);
  begin perform create_pet_with_profile(v_id, 'dog', 'Stolen', null, null, null, null, '{}', '{}'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err is not null, '014v: another owner cannot reuse a pet id');
  perform _t_as(robert);
  perform _t_ok((select name from public.pets where id = v_id) = 'Pip14v', '014v: …and the pet is unchanged');
  perform _t_as(chloe);
  begin perform create_pet_with_profile(gen_random_uuid(), 'dog', 'Sitter', null, null, null, null, '{}', '{}'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err is not null, '014v: a sitter cannot save a pet');
  perform _t_as(null, 'anon');
  begin perform create_pet_with_profile(gen_random_uuid(), 'dog', 'Anon', null, null, null, null, '{}', '{}'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014v: anon cannot save a pet');

  -- The owner edits the answers and the intro; nobody else can
  perform _t_as(robert);
  update public.pets set profile = '{"answers":{"q1":2}}' where id = v_id;
  perform _t_ok((select profile->'answers'->>'q1' from public.pets where id = v_id) = '2', '014v: the owner edits their pet''s answers');
  update public.owner_profiles set intro = 'Hello, I am Robert.' where id = robert;
  perform _t_ok((select intro from public.owner_profiles where id = robert) = 'Hello, I am Robert.', '014v: the owner writes an intro');
  begin update public.owner_profiles set intro = repeat('a', 501) where id = robert; v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like '%owner_profiles_intro_length%', '014v: the intro is at most 500 characters');
  perform _t_ok((select onboarded_at is null from public.owner_profiles where id = robert),
    '014v: a new owner starts with onboarded_at null');
  update public.owner_profiles set onboarded_at = now() where id = robert;
  perform _t_ok((select onboarded_at is not null from public.owner_profiles where id = robert), '014v: the owner marks themselves onboarded');
  perform _t_as(joy);
  update public.owner_profiles set onboarded_at = null where id = robert;
  update public.pets set profile = '{"hacked":true}' where id = v_id;
  perform _t_as(robert);
  perform _t_ok((select onboarded_at is not null from public.owner_profiles where id = robert), '014v: another owner cannot change the flag');
  perform _t_ok((select profile ? 'hacked' from public.pets where id = v_id) = false, '014v: another owner cannot edit the answers');

  -- Photos: added by the backend, the 9th is refused, a stranger's pet is refused
  perform _t_as(null);
  for i in 1..8 loop perform add_pet_photo(robert, v_id, 'pets/pip-' || i); end loop;
  begin perform add_pet_photo(robert, v_id, 'pets/pip-9'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'too_many_photos', '014v: a pet keeps at most 8 photos');
  begin perform add_pet_photo(joy, v_id, 'pets/joy-1'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_found', '014v: photos are added only for the pet''s own owner');
  perform _t_ok((select array_agg(position order by position) from public.pet_photos where pet_id = v_id) = array[0,1,2,3,4,5,6,7]::smallint[],
    '014v: photos are added at the end, cover first');

  -- Who reads them: the owner; not another owner, not an unrelated sitter, not anon; a booked sitter does
  perform _t_as(robert);
  perform _t_ok((select count(*) from public.pet_photos where pet_id = v_id) = 8, '014v: the owner reads their pet''s photos');
  perform _t_as(joy);
  perform _t_ok((select count(*) from public.pet_photos where pet_id = v_id) = 0, '014v: …and no other owner does');
  perform _t_as(zed);
  perform _t_ok((select count(*) from public.pet_photos where pet_id = v_id) = 0, '014v: a sitter with no booking or inquiry does not');
  perform _t_as(null);
  perform _t_booking(robert, chloe, array[v_id], now() - interval '1 hour', now() + interval '1 day', 'confirmed');
  perform _t_as(chloe);
  perform _t_ok((select count(*) from public.pet_photos where pet_id = v_id) = 8, '014v: a booked sitter reads the photos');
  perform _t_as(null, 'anon');
  begin perform count(*) from public.pet_photos; v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014v: anon cannot read pet photos');

  -- Reorder: the owner only, exactly the pet's own ids
  perform _t_as(robert);
  select array_agg(id order by position desc) into v_ids from public.pet_photos where pet_id = v_id;
  perform reorder_pet_photos(v_id, v_ids);
  select id into v_first from public.pet_photos where pet_id = v_id and position = 0;
  perform _t_ok(v_first = v_ids[1], '014v: the owner reorders, first = cover');
  begin perform reorder_pet_photos(v_id, v_ids[1:7]); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_photos', '014v: a partial order is refused');
  perform _t_as(joy);
  begin perform reorder_pet_photos(v_id, v_ids); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_found', '014v: another owner cannot reorder');
  perform _t_as(robert);
  begin perform remove_pet_photo(robert, v_id, v_ids[1]); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014v: an owner cannot call remove_pet_photo directly');

  -- Remove (backend): returns the file id and closes the gap
  perform _t_as(null);
  v_out := remove_pet_photo(robert, v_id, v_ids[1]);
  perform _t_ok(v_out is not null, '014v: remove returns the Cloudinary public id');
  perform _t_ok((select array_agg(position order by position) from public.pet_photos where pet_id = v_id) = array[0,1,2,3,4,5,6]::smallint[],
    '014v: removing closes the gap');
  begin perform remove_pet_photo(joy, v_id, v_ids[2]); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_found', '014v: only the pet''s owner can remove a photo');

  -- Photos go with the pet
  perform _t_as(robert);
  perform create_pet_with_profile(v_tmp, 'cat', 'Tmp14v', null, null, null, null, '{}', '{}');
  perform _t_as(null);
  perform add_pet_photo(robert, v_tmp, 'pets/tmp-1');
  perform _t_as(robert);
  delete from public.pets where id = v_tmp;
  perform _t_as(null);
  perform _t_ok(not exists (select 1 from public.pet_photos where pet_id = v_tmp), '014v: photos go with the pet');
end;
$$;

-- ---------------------------------------------------------------------------
-- 014w (11.15 S4, #185): the breed needs cache is for the backend only
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  v_err text;
begin
  perform _t_as(null);
  insert into public.breed_notes (species, breed_key, chips, sources, found)
    values ('dog', 'maltese', '["Brush daily"]', '[{"title":"AKC","url":"https://www.akc.org/x"}]', true);
  perform _t_ok((select b.found from public.breed_notes b where b.breed_key = 'maltese'), '014w: the backend writes and reads a breed note');
  begin
    insert into public.breed_notes (species, breed_key, found) values ('dog', 'maltese', false);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like '%duplicate key%', '014w: one row per species and breed');
  begin
    insert into public.breed_notes (species, breed_key, found) values ('bird', 'parrot', true);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like '%violates check constraint%', '014w: only dogs and cats');
  begin
    insert into public.breed_notes (species, breed_key, chips, found) values ('cat', 'x', '{}', true);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like '%violates check constraint%', '014w: chips are a list');

  foreach v_err in array array['owner', 'sitter', 'anon'] loop
    if v_err = 'owner' then perform _t_as(robert);
    elsif v_err = 'sitter' then perform _t_as(chloe);
    else perform _t_as(null, 'anon');
    end if;
    begin
      perform count(*) from public.breed_notes;
      perform _t_ok(false, '014w: ' || v_err || ' cannot read the cache');
    exception when others then
      perform _t_ok(sqlerrm like 'permission denied%', '014w: ' || v_err || ' cannot read the cache');
    end;
    begin
      insert into public.breed_notes (species, breed_key, found) values ('dog', 'poodle', true);
      perform _t_ok(false, '014w: ' || v_err || ' cannot write the cache');
    exception when others then
      perform _t_ok(sqlerrm like 'permission denied%', '014w: ' || v_err || ' cannot write the cache');
    end;
  end loop;
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 014y (the fees agreed in the chat stay in the price): no payment over an open final quote, and a paid booking keeps
-- its fees when its times change
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  max constant uuid := '00000000-0000-4000-8000-0000000000c1';
  d constant date := app_today() + 340;
  v1 uuid;
  v_h uuid;
  t1 public.chat_threads;
  q public.chat_messages;
  v_base numeric;
  v_quote jsonb;
  v_kind text;
  v_err text;
begin
  perform _t_as(chloe);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (chloe, 'open', d - 1, d + 6, 'morning', '08:00', '12:00', 3),
         (chloe, 'open', d - 1, d + 6, 'afternoon', '12:00', '18:00', 3),
         (chloe, 'open', d - 1, d + 6, 'overnight', '18:00', '08:00', 3);

  perform _t_as(robert);
  t1 := open_chat_thread(chloe);
  v1 := request_booking(chloe, array[max], local_ts(d, '09:00'), 'sitter_home', null,
    local_ts(d + 2, '17:00'), 'sitter_home', null, null);
  perform agree_to_book(v1);
  perform _t_as(chloe);
  perform respond_booking(v1, true);
  perform _t_as(robert);
  foreach v_kind in array required_consents(v1) loop
    insert into public.booking_consents (booking_id, kind, version, signer_id, signer_name, details)
    values (v1, v_kind, '1', robert, 'Robert',
      case v_kind
        when 'emergency_vet' then jsonb_build_object('limit_cad', 500, 'vet_clinic_name', 'Demo Vet')
        when 'safe_return' then jsonb_build_object('receiver_name', 'Robert')
        else '{}'::jsonb
      end);
  end loop;
  v_base := (quote_booking(chloe, 'boarding', local_ts(d, '09:00'), local_ts(d + 2, '17:00'), 1) ->> 'total')::numeric;

  -- The sitter's final quote with a fee: no payment until the owner answers it.
  perform _t_as(chloe);
  q := send_chat_quote(t1.id, 'boarding', local_ts(d, '09:00'), local_ts(d + 2, '17:00'), array[max]);
  q := add_chat_quote_extra(q.id, 'Medication visits', 15);
  perform _t_as(robert);
  begin perform pay_booking_demo(v1); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'quote_pending', '014y: no payment while the final quote waits for the owner');
  perform _t_ok((select paid_at is null from public.bookings where id = v1), '014y: ...so nothing is paid');
  q := answer_chat_quote_extra(q.id, (q.card -> 'extras' -> 0 ->> 'id')::uuid, true);
  q := confirm_chat_quote(q.id);
  v_quote := pay_booking_demo(v1);
  perform _t_ok((v_quote ->> 'total')::numeric = v_base + 15, '014y: once confirmed, the fee is paid');
  perform _t_as(null);
  perform _t_ok(exists (select 1 from public.notifications where user_id = chloe and type = 'booking_paid' and booking_id = v1
      and title not like '%' || chr(8212) || '%'),
    '014y: the payment notice has no em dash');

  -- A later pick-up, agreed after payment: re-quoted with the paid fee still in.
  perform _t_as(robert);
  v_h := propose_handoff(v1, 'pick_up', local_ts(d + 3, '17:00'));
  perform _t_as(chloe);
  perform respond_handoff(v_h, true);
  perform _t_as(robert); -- quote_booking needs a signed-in user
  v_base := (quote_booking(chloe, 'boarding', local_ts(d, '09:00'), local_ts(d + 3, '17:00'), 1) ->> 'total')::numeric;
  perform _t_ok((select paid_at is not null and (price_snapshot ->> 'total')::numeric = v_base + 15
        and jsonb_array_length(price_snapshot -> 'extras') = 1
      from public.bookings where id = v1),
    '014y: a paid booking keeps its fee when the times change');
  perform _t_ok((quote_booking_for(v1) ->> 'total')::numeric = v_base + 15, '014y: Checkout shows the same total');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 014z (audit 2026-10-21): a demo account keeps its password and email unless the service role opens the window
-- ---------------------------------------------------------------------------

do $$
declare
  demo constant uuid := '00000000-0000-4000-8000-0000000000d9';
  other constant uuid := '00000000-0000-4000-8000-0000000000d8';
  v_err text;
begin
  perform _t_as(null);
  insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values
    (demo, 'demo-lock@goldito.test', 'hash-1', '{"role":"owner","display_name":"Demo"}'),
    (other, 'other-lock@example.test', 'hash-1', '{"role":"owner","display_name":"Other"}');
  perform set_demo_accounts_unlocked(false);

  begin
    update auth.users set encrypted_password = 'hash-2' where id = demo;
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'Demo accounts cannot change%', '014z: a demo account cannot change its password');
  begin
    update auth.users set email = 'mine@example.test' where id = demo;
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'Demo accounts cannot change%', '014z: a demo account cannot change its email');

  update auth.users set raw_user_meta_data = '{"role":"owner","display_name":"Demo 2"}' where id = demo;
  perform _t_ok((select raw_user_meta_data ->> 'display_name' from auth.users where id = demo) = 'Demo 2', '014z: other demo account fields still change');
  update auth.users set encrypted_password = 'hash-2' where id = other;
  perform _t_ok((select encrypted_password from auth.users where id = other) = 'hash-2', '014z: a real account changes its password');

  perform _t_as(demo);
  begin
    perform set_demo_accounts_unlocked(true);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014z: a signed-in person cannot open the window');
  begin
    perform count(*) from public.demo_account_unlock;
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '014z: a signed-in person cannot read the window');

  perform set_config('role', 'service_role', true);
  perform set_demo_accounts_unlocked(true);
  perform _t_as(null);
  update auth.users set encrypted_password = 'hash-3' where id = demo;
  perform _t_ok((select encrypted_password from auth.users where id = demo) = 'hash-3', '014z: the seed changes the password while the window is open');

  perform set_demo_accounts_unlocked(false);
  begin
    update auth.users set encrypted_password = 'hash-4' where id = demo;
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'Demo accounts cannot change%', '014z: closing the window locks it again');
end;
$$;

-- ---------------------------------------------------------------------------
-- 015c (#266): cancelling a paid booking refunds it in full, whoever cancels
-- ---------------------------------------------------------------------------

do $$
declare
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  v_pet uuid;
  v_pet2 uuid;
  v_pet3 uuid;
  v_pet4 uuid;
  v_owner_cancel uuid;
  v_sitter_cancel uuid;
  v_unpaid uuid;
  v_started uuid;
  v_err text;
  v_paid timestamptz := now() - interval '1 day';
  v_snapshot jsonb := '{"total": 210.00, "currency": "CAD"}';
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (joy, 'dog', 'Waffle') returning id into v_pet;
  insert into public.pets (owner_id, species, name) values (joy, 'dog', 'Noodle') returning id into v_pet2;
  insert into public.pets (owner_id, species, name) values (joy, 'cat', 'Olive') returning id into v_pet3;
  insert into public.pets (owner_id, species, name) values (joy, 'cat', 'Pickle') returning id into v_pet4;
  v_owner_cancel := _t_booking(joy, paul, array[v_pet], now() + interval '400 days', now() + interval '402 days', 'confirmed');
  v_sitter_cancel := _t_booking(joy, paul, array[v_pet2], now() + interval '410 days', now() + interval '412 days', 'confirmed');
  v_unpaid := _t_booking(joy, paul, array[v_pet3], now() + interval '420 days', now() + interval '422 days', 'confirmed');
  v_started := _t_booking(joy, paul, array[v_pet4], now() - interval '1 hour', now() + interval '2 days', 'confirmed', true);
  update public.bookings set paid_at = v_paid, price_snapshot = v_snapshot
  where id in (v_owner_cancel, v_sitter_cancel, v_started);

  -- The owner cancels a paid booking.
  perform _t_as(joy);
  perform cancel_booking(v_owner_cancel, 'Plans changed');
  perform _t_as(null);
  perform _t_ok((select status = 'cancelled' and refunded_at is not null and paid_at = v_paid
      from public.bookings where id = v_owner_cancel),
    '015c: the owner cancels a paid booking: refunded, the payment stays on record');
  perform _t_ok(exists (select 1 from public.notifications where user_id = joy and type = 'booking_refunded'
      and booking_id = v_owner_cancel and title = 'Refunded in full' and body = '$210.00 CAD back for Waffle (demo)'),
    '015c: …and the owner is told "Refunded in full" with the amount');

  -- The sitter cancels a paid booking: the owner is refunded too.
  perform _t_as(paul);
  perform cancel_booking(v_sitter_cancel, 'Sitter cancelled');
  perform _t_as(null);
  perform _t_ok((select refunded_at is not null from public.bookings where id = v_sitter_cancel)
      and exists (select 1 from public.notifications where user_id = joy and type = 'booking_refunded' and booking_id = v_sitter_cancel),
    '015c: the sitter cancels a paid booking: the owner is refunded and told');
  perform _t_ok(not exists (select 1 from public.notifications where user_id = paul and type = 'booking_refunded'),
    '015c: …the sitter gets no refund notice');

  -- Nothing paid, nothing refunded.
  perform _t_as(joy);
  perform cancel_booking(v_unpaid, null);
  perform _t_as(null);
  perform _t_ok((select refunded_at is null from public.bookings where id = v_unpaid)
      and not exists (select 1 from public.notifications where type = 'booking_refunded' and booking_id = v_unpaid),
    '015c: an unpaid booking is cancelled with no refund');

  -- A stay in progress still cannot be cancelled, so it is never refunded.
  perform _t_as(joy);
  begin
    perform cancel_booking(v_started, null);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_as(null);
  perform _t_ok(v_err = 'booking_in_progress' and (select refunded_at is null and status = 'confirmed' from public.bookings where id = v_started),
    '015c: a stay in progress cannot be cancelled or refunded');
end;
$$;

-- ---------------------------------------------------------------------------
-- 015b (11.12, #184): pet medals
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  v_pet uuid;
  v_b uuid;
  v_err text;
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Medal') returning id into v_pet;
  v_b := _t_booking(robert, chloe, array[v_pet], now() + interval '400 days', now() + interval '402 days', 'confirmed', true);

  perform _t_as(chloe);
  begin
    perform award_pet_medal(v_b, v_pet);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'stay_not_finished', '015b: no medal before the pets are back');

  perform complete_handoff(v_b, 'pick_up');
  perform award_pet_medal(v_b, v_pet);
  perform award_pet_medal(v_b, v_pet);
  perform _t_ok((select count(*) from public.pet_medals where booking_id = v_b and pet_id = v_pet and sitter_id = chloe
                   and stay_from is not null and stay_to is not null) = 1,
    '015b: the sitter gives the medal, once per pet and stay');

  perform _t_as(robert);
  perform _t_ok((select count(*) from public.pet_medals where pet_id = v_pet) = 1, '015b: the owner reads their pet''s medal');
  begin
    perform award_pet_medal(v_b, v_pet);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_your_booking', '015b: the owner cannot give one');
  begin
    insert into public.pet_medals (pet_id, booking_id, sitter_id, stay_from, stay_to) values (v_pet, v_b, chloe, now(), now());
    v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '42501', '015b: clients never write medals directly');
  begin
    delete from public.pet_medals;
    v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '42501', '015b: nobody deletes a medal');

  perform _t_as(joy);
  perform _t_ok((select count(*) from public.pet_medals) = 0, '015b: a third party reads no medal');
  perform _t_as(paul);
  begin
    perform award_pet_medal(v_b, v_pet);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_your_booking', '015b: another sitter cannot give one');

  perform _t_as(chloe);
  begin
    perform award_pet_medal(v_b, '00000000-0000-4000-8000-0000000000c3');
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'pet_not_in_booking', '015b: only a pet that was in the stay');
  perform _t_as(null, 'anon');
  begin
    perform award_pet_medal(v_b, v_pet);
    v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '42501', '015b: signed-out visitors cannot');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 015f (#236): the owner asks for a Meet & Greet or to skip it first, the sitter's answer is the first yes
-- ---------------------------------------------------------------------------

do $$
declare
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  nora constant uuid := '00000000-0000-4000-8000-0000000000b4';
  e constant date := app_today() + 500;
  v_pet uuid;
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_d uuid;
  v_e uuid;
  v_thread uuid;
  v_err text;
  r record;
begin
  perform _t_as(nora);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (nora, 'open', e - 1, e + 40, 'morning', '08:00', '12:00', 3),
         (nora, 'open', e - 1, e + 40, 'afternoon', '12:00', '18:00', 3),
         (nora, 'open', e - 1, e + 40, 'overnight', '18:00', '08:00', 3);
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (joy, 'dog', 'Biscuit') returning id into v_pet;
  insert into public.chat_threads (owner_id, sitter_id) values (joy, nora) on conflict do nothing;
  select id into v_thread from public.chat_threads where owner_id = joy and sitter_id = nora;
  v_a := _t_booking(joy, nora, array[v_pet], local_ts(e, '09:00'), local_ts(e + 2, '17:00'), 'requested');
  v_b := _t_booking(joy, nora, array[v_pet], local_ts(e + 10, '09:00'), local_ts(e + 12, '17:00'), 'requested');
  v_c := _t_booking(joy, nora, array[v_pet], local_ts(e + 20, '09:00'), local_ts(e + 22, '17:00'), 'requested');
  v_d := _t_booking(joy, nora, array[v_pet], local_ts(e + 30, '09:00'), local_ts(e + 32, '17:00'), 'requested');
  perform _t_meet(v_a, 'required');
  perform _t_meet(v_b, 'required');
  perform _t_meet(v_c, 'required');
  perform _t_meet(v_d, 'required');

  -- The owner proposes a time before the sitter's first yes.
  perform _t_as(joy);
  v_err := null;
  begin
    perform propose_meet_greet(v_a, 'video', local_ts(e, '09:00'));
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'meet_greet_too_late', '015f: a Meet & Greet at the drop-off time or later is refused');
  perform propose_meet_greet(v_a, 'video', local_ts(e - 1, '19:00'));
  select * into r from get_booking_stages(array[v_a]);
  perform _t_ok(r.stage = 'meet_greet' and r.next_actor = 'sitter', '015f: the owner can propose a time first; the sitter answers');
  perform _t_as(null);
  perform _t_ok((select sitter_interest_at is null from public.bookings where id = v_a),
    '015f: …and nothing is held before the sitter answers');
  perform _t_ok(exists (select 1 from public.chat_messages where thread_id = v_thread and kind = 'card'
      and card ->> 'type' = 'meet_greet' and card ->> 'booking_id' = v_a::text),
    '015f: the owner''s proposal posts the Meet & Greet card in the chat');

  -- The sitter's Accept is the first yes.
  perform _t_as(nora);
  perform respond_meet_greet(v_a, true);
  perform _t_as(null);
  perform _t_ok((select meet_greet_status = 'agreed' and sitter_interest_at is not null and meet_greet_due_at is not null
      from public.bookings where id = v_a),
    '015f: the sitter accepts the owner''s time: agreed and the dates are held');

  -- The owner asks to skip first; the sitter answers with a time instead.
  perform _t_as(joy);
  perform request_skip_meet_greet(v_b);
  perform _t_as(nora);
  perform propose_meet_greet(v_b, 'video', local_ts(e + 9, '19:00'));
  perform _t_as(null);
  perform _t_ok((select meet_greet_status = 'proposed' and meet_greet_proposed_by = nora and sitter_interest_at is not null
      and meet_greet_skip_requested_by is null from public.bookings where id = v_b),
    '015f: a skip request can be answered with a time, which holds the dates');

  -- The owner asks to skip; the sitter accepts.
  perform _t_as(joy);
  perform request_skip_meet_greet(v_c);
  perform _t_as(nora);
  perform respond_skip_meet_greet(v_c, true);
  perform _t_as(null);
  perform _t_ok((select meet_greet_status = 'skipped' and status = 'requested' and sitter_interest_at is not null
      from public.bookings where id = v_c),
    '015f: the sitter accepts the owner''s skip: skipped and held');
  perform _t_as(joy);
  select * into r from get_booking_stages(array[v_c]);
  perform _t_ok(r.stage = 'confirm', '015f: …and the booking moves on without a Meet & Greet');

  -- The owner proposes; the sitter asks to skip instead; the owner declines.
  perform _t_as(joy);
  perform propose_meet_greet(v_d, 'video', local_ts(e + 29, '19:00'));
  perform _t_as(nora);
  perform request_skip_meet_greet(v_d);
  perform _t_as(null);
  perform _t_ok((select meet_greet_status = 'skip_requested' and meet_greet_skip_requested_by = nora
      and sitter_interest_at is not null from public.bookings where id = v_d),
    '015f: the sitter''s Request skip is the first yes too');
  perform _t_as(joy);
  perform decline_meet_greet(v_d);
  perform _t_as(null);
  perform _t_ok((select status = 'cancelled' and cancel_reason = 'meet_greet_declined' and cancelled_by = joy
      from public.bookings where id = v_d)
      and exists (select 1 from public.notifications where user_id = nora and type = 'booking_cancelled'
        and booking_id = v_d and title like '%declined, so the request was cancelled'),
    '015f: Decline ends the request and tells the other side');

  -- A first-time request in the chat comes with its Meet & Greet card, right under the request card.
  v_e := _t_booking(joy, nora, array[v_pet], local_ts(e + 36, '09:00'), local_ts(e + 37, '17:00'), 'requested');
  perform _t_meet(v_e, 'required');
  perform _t_as(joy);
  perform post_booking_request_card(v_thread, v_e);
  perform _t_as(null);
  perform _t_ok((select array_agg(card ->> 'type' order by created_at) from public.chat_messages
      where thread_id = v_thread and card ->> 'booking_id' = v_e::text) = array['request', 'meet_greet'],
    '015f: the request card is followed by the Meet & Greet card');

  -- Decline only while the Meet & Greet is open, and only the two parties.
  perform _t_as(nora);
  v_err := null;
  begin
    perform decline_meet_greet(v_c);
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'invalid_status', '015f: no Decline once the Meet & Greet is settled');
  perform _t_as('00000000-0000-4000-8000-0000000000b2');
  v_err := null;
  begin
    perform decline_meet_greet(v_a);
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_allowed', '015f: another sitter cannot decline it');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 015k (#264): a Meet & Greet change posts a new line at the bottom of the chat
-- ---------------------------------------------------------------------------

do $$
declare
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  nora constant uuid := '00000000-0000-4000-8000-0000000000b4';
  e constant date := app_today() + 600;
  v_pet uuid;
  v_b uuid;
  v_c uuid;
  v_thread uuid;
  r record;
  v_events text;
begin
  perform _t_as(nora);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  values (nora, 'open', e - 1, e + 20, 'morning', '08:00', '12:00', 3),
         (nora, 'open', e - 1, e + 20, 'afternoon', '12:00', '18:00', 3),
         (nora, 'open', e - 1, e + 20, 'overnight', '18:00', '08:00', 3);
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (joy, 'dog', 'Pebble') returning id into v_pet;
  insert into public.chat_threads (owner_id, sitter_id) values (joy, nora) on conflict do nothing;
  select id into v_thread from public.chat_threads where owner_id = joy and sitter_id = nora;
  v_b := _t_booking(joy, nora, array[v_pet], local_ts(e, '09:00'), local_ts(e + 2, '17:00'), 'requested');
  perform _t_meet(v_b, 'required');

  -- The request card brings the Meet & Greet card; nothing has changed yet, so no update line.
  perform _t_as(joy);
  perform post_booking_request_card(v_thread, v_b);
  perform _t_as(null);
  perform _t_ok(not exists (select 1 from public.chat_messages where thread_id = v_thread
      and card ->> 'type' = 'meet_greet_update' and card ->> 'booking_id' = v_b::text),
    '015k: no update line before anything changes');

  -- Joy proposes, Nora accepts: two lines at the bottom, each from the one who acted, with the time copied in.
  perform _t_as(joy);
  perform propose_meet_greet(v_b, 'video', local_ts(e - 1, '19:00'));
  perform _t_as(nora);
  perform respond_meet_greet(v_b, true);
  perform _t_as(null);
  select string_agg((card ->> 'event') || ':' || case sender_id when joy then 'joy' when nora then 'nora' else '?' end, ',' order by created_at)
  into v_events
  from public.chat_messages where thread_id = v_thread and card ->> 'type' = 'meet_greet_update' and card ->> 'booking_id' = v_b::text;
  perform _t_ok(v_events = 'proposed:joy,agreed:nora', '015k: proposed by Joy, then agreed by Nora (' || coalesce(v_events, 'none') || ')');
  perform _t_ok((select (card ->> 'at')::timestamptz = local_ts(e - 1, '19:00') and card ->> 'mode' = 'video'
      from public.chat_messages where thread_id = v_thread and card ->> 'event' = 'proposed' and card ->> 'booking_id' = v_b::text),
    '015k: the line keeps the proposed time and mode');
  perform _t_ok((select card ->> 'type' from public.chat_messages where thread_id = v_thread order by created_at desc limit 1) = 'meet_greet_update',
    '015k: the newest message in the chat is the update');

  -- Joy's chat list: the update is the newest message, and Nora's acceptance is unread for Joy.
  perform _t_as(joy);
  select * into r from list_my_chats() where thread_id = v_thread;
  perform _t_ok(r.last_card_type = 'meet_greet_update' and r.unread_count >= 1, '015k: the chat list follows the update (preview and unread)');
  perform _t_as(null);

  -- A skip asked and declined: skip_requested, then declined (the request ends).
  v_c := _t_booking(joy, nora, array[v_pet], local_ts(e + 10, '09:00'), local_ts(e + 12, '17:00'), 'requested');
  perform _t_meet(v_c, 'required');
  perform _t_as(joy);
  perform post_booking_request_card(v_thread, v_c);
  perform request_skip_meet_greet(v_c);
  perform _t_as(nora);
  perform respond_skip_meet_greet(v_c, false);
  perform _t_as(null);
  select string_agg(card ->> 'event', ',' order by created_at) into v_events
  from public.chat_messages where thread_id = v_thread and card ->> 'type' = 'meet_greet_update' and card ->> 'booking_id' = v_c::text;
  perform _t_ok(v_events = 'skip_requested,declined', '015k: a skip request and its decline are posted (' || coalesce(v_events, 'none') || ')');
end;
$$;

-- ---------------------------------------------------------------------------
-- 015j (#345): Feed tags and memo, each person's own remove / hide, the 30-minute unsend, stickers, after the stay
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  pip uuid;
  pip_old uuid;
  kit uuid;
  m_task uuid;
  m_mood uuid;
  m uuid;
  p_a uuid;
  p_b uuid;
  p_c uuid;
  p_priv uuid;
  p_own uuid;
  p_past uuid;
  v_notice int;
  v_res jsonb;
  v_err text;
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Pip15j') returning id into pip;
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Old15j') returning id into pip_old;
  insert into public.pets (owner_id, species, name) values (joy, 'cat', 'Kit15j') returning id into kit;
  perform _t_booking(robert, chloe, array[pip], now() - interval '1 hour', now() + interval '1 day', 'confirmed');
  perform _t_booking(robert, chloe, array[pip_old], now() - interval '5 days', now() - interval '3 days', 'confirmed');

  -- Tags and memo: a check-in photo carries its tag and the memo
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip, chloe, 'smoke/015j/task', 'image', 'task_proof') returning id into m_task;
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip, chloe, 'smoke/015j/mood', 'image', 'task_proof') returning id into m_mood;
  perform _t_as(chloe);
  perform public.log_care_checkin(pip, 'potty', 'normal', 'Firm and on time', m_task);
  perform public.log_care_checkin(pip, 'mood', 'happy', null, m_mood);
  perform _t_as(null);
  perform _t_ok((select category = 'potty' and note = 'Firm and on time' from public.feed_posts where media_id = m_task),
    '015j: a potty check-in photo is tagged Potty and keeps the memo');
  perform _t_ok((select category = 'mood' and note is null from public.feed_posts where media_id = m_mood),
    '015j: a mood check-in photo is tagged Mood');
  begin
    update public.feed_posts set category = 'cuddle' where media_id = m_task; v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '23514', '015j: an unknown tag is refused');
  begin
    update public.feed_posts set note = repeat('x', 201) where media_id = m_task; v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '23514', '015j: a memo is at most 200 characters');

  -- A sitter's shared photo: each side removes it from their own Feed only
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip, chloe, 'smoke/015j/a', 'image', 'feed') returning id into m;
  perform _t_as(chloe);
  insert into public.feed_posts (pet_id, sitter_id, posted_by, media_id, visibility, category, note)
    values (pip, chloe, chloe, m, 'shared', 'meal', 'Ate it all') returning id into p_a;
  perform _t_as(robert);
  perform _t_ok(exists (select 1 from public.feed_posts where id = p_a), '015j: the owner sees the sitter''s shared photo');
  v_res := public.remove_feed_post(p_a, 'me');
  perform _t_ok((v_res ->> 'purge') = 'false' and not exists (select 1 from public.feed_posts where id = p_a),
    '015j: the owner removes it from their Feed; it is not purged yet');
  perform _t_as(chloe);
  perform _t_ok(exists (select 1 from public.feed_posts where id = p_a), '015j: the sitter still has it after the owner removed it');
  v_res := public.remove_feed_post(p_a, 'me');
  perform _t_ok((v_res ->> 'purge') = 'true' and not exists (select 1 from public.feed_posts where id = p_a),
    '015j: once both removed it, it can be purged');
  begin perform public.remove_feed_post(p_a, 'me'); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_found', '015j: a removed photo cannot be removed again');

  -- The other way round: the sitter removes first, the owner keeps it
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip, chloe, 'smoke/015j/b', 'image', 'feed') returning id into m;
  perform _t_as(chloe);
  insert into public.feed_posts (pet_id, sitter_id, posted_by, media_id, visibility)
    values (pip, chloe, chloe, m, 'shared') returning id into p_b;
  perform _t_as(null);
  update public.feed_posts set created_at = now() - interval '31 minutes' where id = p_b;
  perform _t_as(chloe);
  begin perform public.remove_feed_post(p_b, 'everyone'); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'too_late', '015j: after 30 minutes the sitter cannot delete a shared photo for both');
  v_res := public.remove_feed_post(p_b, 'me');
  perform _t_ok((v_res ->> 'purge') = 'false' and not exists (select 1 from public.feed_posts where id = p_b),
    '015j: after 30 minutes the sitter removes it from their own Feed only');
  perform _t_as(robert);
  perform _t_ok(exists (select 1 from public.feed_posts where id = p_b), '015j: the owner keeps what the sitter removed');
  begin perform public.remove_feed_post(p_b, 'everyone'); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_author', '015j: only the author deletes for both');

  -- Within 30 minutes the author can delete for both, and the notice goes
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip, chloe, 'smoke/015j/c', 'image', 'feed') returning id into m;
  perform _t_as(chloe);
  insert into public.feed_posts (pet_id, sitter_id, posted_by, media_id, visibility)
    values (pip, chloe, chloe, m, 'shared') returning id into p_c;
  perform _t_as(null);
  perform _t_ok(exists (select 1 from public.notifications where user_id = robert and ref_id = p_c), '015j: a shared photo notifies the owner');
  perform _t_as(chloe);
  v_res := public.remove_feed_post(p_c, 'everyone');
  perform _t_as(null);
  perform _t_ok((v_res ->> 'purge') = 'true' and not exists (select 1 from public.notifications where ref_id = p_c),
    '015j: within 30 minutes delete-for-both purges the photo and clears its notice');

  -- Hide: mine only, reversible, and only for what I can see
  perform _t_as(robert);
  perform public.hide_feed_post(p_b);
  perform _t_ok((select state from public.feed_post_hidden where post_id = p_b) = 'hidden'
      and exists (select 1 from public.feed_posts where id = p_b),
    '015j: a hidden photo still comes back from the Feed, flagged by my own row');
  perform _t_as(chloe);
  perform _t_ok(not exists (select 1 from public.feed_post_hidden where user_id = robert), '015j: nobody reads another person''s hidden rows');
  perform _t_as(robert);
  perform public.unhide_feed_post(p_b);
  perform _t_ok((select count(*) from public.feed_post_hidden where post_id = p_b) = 0, '015j: unhide brings it back');
  perform _t_as(joy);
  begin perform public.hide_feed_post(p_b); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_found', '015j: another owner cannot hide my pet''s photo');
  begin insert into public.feed_post_hidden (post_id, state) values (p_b, 'removed'); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '015j: hidden rows are written only through the functions');

  -- An owner's shared photo: the sitter on duty reads it, both have to remove it
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip, robert, 'smoke/015j/own', 'image', 'feed') returning id into m;
  perform _t_as(robert);
  insert into public.feed_posts (pet_id, sitter_id, posted_by, media_id, visibility)
    values (pip, null, robert, m, 'shared') returning id into p_own;
  perform _t_as(chloe);
  perform _t_ok(exists (select 1 from public.feed_posts where id = p_own), '015j: the sitter on duty reads a photo the owner shared');
  perform _t_as(robert);
  v_res := public.remove_feed_post(p_own, 'me');
  perform _t_ok((v_res ->> 'purge') = 'false', '015j: the owner removes their shared photo, the sitter on duty can still read it');
  perform _t_as(chloe);
  v_res := public.remove_feed_post(p_own, 'me');
  perform _t_ok((v_res ->> 'purge') = 'true', '015j: when the sitter removes it too, it can be purged');

  -- A private photo is only the author's, and is purged when they remove it
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip, chloe, 'smoke/015j/priv', 'image', 'feed') returning id into m;
  perform _t_as(chloe);
  insert into public.feed_posts (pet_id, sitter_id, posted_by, media_id, visibility)
    values (pip, chloe, chloe, m, 'private') returning id into p_priv;
  perform _t_as(robert);
  perform _t_ok(not exists (select 1 from public.feed_posts where id = p_priv), '015j: the owner does not see a private sitter photo');
  perform _t_as(chloe);
  v_res := public.remove_feed_post(p_priv, 'me');
  perform _t_ok((v_res ->> 'purge') = 'true', '015j: removing a private photo purges it');

  -- Stickers land in the maker's own Feed and nobody else's
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip, robert, 'smoke/015j/sticker-o', 'image', 'sticker') returning id into m;
  perform _t_as(robert);
  insert into public.pet_stickers (pet_id, media_id) values (pip, m);
  perform _t_ok((select visibility = 'private' and sitter_id is null and posted_by = robert
        from public.feed_posts where media_id = m),
    '015j: an owner''s sticker becomes a private post of theirs');
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip, chloe, 'smoke/015j/sticker-s', 'image', 'sticker') returning id into m;
  perform _t_as(chloe);
  insert into public.pet_stickers (pet_id, media_id) values (pip, m);
  perform _t_ok((select visibility = 'private' and sitter_id = chloe from public.feed_posts where media_id = m),
    '015j: a sitter''s sticker becomes a private post of theirs');
  perform _t_ok(not exists (select 1 from public.feed_posts fp join public.media md on md.id = fp.media_id
        where md.purpose = 'sticker' and fp.posted_by = robert),
    '015j: the sitter does not see the owner''s sticker post');
  perform _t_as(robert);
  perform _t_ok(not exists (select 1 from public.feed_posts fp join public.media md on md.id = fp.media_id
        where md.purpose = 'sticker' and fp.posted_by = chloe),
    '015j: the owner does not see the sitter''s sticker post');

  -- After the stay: the sitter keeps their posts, adds only private ones, and loses the owner's shared photos
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip_old, chloe, 'smoke/015j/past', 'image', 'feed') returning id into m;
  insert into public.feed_posts (pet_id, sitter_id, posted_by, media_id, visibility, created_at)
    values (pip_old, chloe, chloe, m, 'shared', now() - interval '4 days') returning id into p_past;
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip_old, robert, 'smoke/015j/past-owner', 'image', 'feed') returning id into m;
  insert into public.feed_posts (pet_id, sitter_id, posted_by, media_id, visibility)
    values (pip_old, null, robert, m, 'shared');
  perform _t_as(chloe);
  perform _t_ok(exists (select 1 from public.feed_posts where id = p_past), '015j: after the stay the sitter still reads their own posts');
  perform _t_ok(not exists (select 1 from public.feed_posts where pet_id = pip_old and posted_by = robert),
    '015j: after the stay the sitter no longer reads the owner''s shared photos');
  perform _t_ok(public.has_cared_for(pip_old) and not public.is_on_duty_for(pip_old), '015j: a past stay is cared-for, not on duty');
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip_old, chloe, 'smoke/015j/after-priv', 'image', 'feed') returning id into m;
  perform _t_as(chloe);
  insert into public.feed_posts (pet_id, sitter_id, posted_by, media_id, visibility)
    values (pip_old, chloe, chloe, m, 'private');
  perform _t_ok(true, '015j: after the stay the sitter can add a photo for themself');
  begin
    insert into public.feed_posts (pet_id, sitter_id, posted_by, media_id, visibility)
      values (pip_old, chloe, chloe, m, 'shared'); v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '42501', '015j: after the stay a shared post is refused');
  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (kit, chloe, 'smoke/015j/stranger', 'image', 'feed') returning id into m;
  perform _t_as(chloe);
  begin
    insert into public.feed_posts (pet_id, sitter_id, posted_by, media_id, visibility)
      values (kit, chloe, chloe, m, 'private'); v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '42501', '015j: a sitter cannot post, even privately, for a pet they never cared for');

  perform _t_as(null, 'anon');
  begin perform public.remove_feed_post(p_b, 'me'); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '015j: anon cannot remove');
  begin perform public.hide_feed_post(p_b); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '015j: anon cannot hide');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 015l (#345): edit a Feed photo: several tags, the day and time it was taken, the memo
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  pip uuid;
  m uuid;
  p_a uuid;
  p_b uuid;
  v_err text;
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Pip15l') returning id into pip;
  perform _t_booking(robert, chloe, array[pip], now() - interval '1 hour', now() + interval '1 day', 'confirmed');
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip, chloe, 'smoke/015l/a', 'image', 'feed') returning id into m;
  perform _t_as(chloe);
  insert into public.feed_posts (pet_id, sitter_id, posted_by, media_id, visibility, category)
    values (pip, chloe, chloe, m, 'shared', 'walk') returning id into p_a;
  perform _t_ok((select tags = array['walk'] and taken_at = created_at from public.feed_posts where id = p_a),
    '015l: a new post copies its tag into tags and starts at the time it was sent');

  perform _t_as(null);
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip, chloe, 'smoke/015l/b', 'image', 'feed') returning id into m;
  perform _t_as(chloe);
  insert into public.feed_posts (pet_id, sitter_id, posted_by, media_id, visibility, category)
    values (pip, chloe, chloe, m, 'shared', 'play') returning id into p_b;
  perform _t_ok((select tags = '{}' from public.feed_posts where id = p_b), '015l: a play or other tag has no chip, so no tag');

  -- The author edits: two tags, an earlier time, a memo; the time it was sent stays
  perform public.update_feed_post(p_a, now() - interval '3 hours', '  Walk, then a potty break  ', array['potty', 'walk', 'walk']);
  perform _t_ok((select tags = array['potty', 'walk'] and category = 'potty' and note = 'Walk, then a potty break'
        and taken_at < created_at - interval '2 hours' from public.feed_posts where id = p_a),
    '015l: the author sets several tags (once each, in order), a memo and an earlier time');
  perform _t_ok((select created_at > now() - interval '5 minutes' from public.feed_posts where id = p_a),
    '015l: editing the time leaves the time it was sent, so the 30 minutes cannot be stretched');
  perform public.update_feed_post(p_a, now() - interval '3 hours', '', '{}');
  perform _t_ok((select tags = '{}' and category is null and note is null from public.feed_posts where id = p_a),
    '015l: no tags and an empty memo clear both');

  -- Who and what is refused
  perform _t_as(robert);
  begin perform public.update_feed_post(p_a, now(), 'mine now', '{}'); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'not_author', '015l: the owner cannot edit the sitter''s photo');
  perform _t_as(chloe);
  begin perform public.update_feed_post(p_a, now() + interval '1 hour', null, '{}'); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'in_the_future', '015l: a time in the future is refused');
  begin perform public.update_feed_post(p_a, now(), null, array['cuddle']); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'bad_tag', '015l: only the five tags');
  begin perform public.update_feed_post(p_a, now(), repeat('x', 201), '{}'); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'note_too_long', '015l: a memo is at most 200 characters');
  begin update public.feed_posts set tags = array['meal'] where id = p_a; v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%' or not exists (select 1 from public.feed_posts where id = p_a and tags = array['meal']),
    '015l: no direct edits, only update_feed_post');
  perform _t_as(null, 'anon');
  begin perform public.update_feed_post(p_a, now(), null, '{}'); v_err := null; exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err like 'permission denied%', '015l: anon cannot edit');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 015r (#397): one check-in with a pick per group, one notice to the owner
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  pip uuid;
  m uuid;
  n int;
  v_err text;
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Pip15q') returning id into pip;
  perform _t_booking(robert, chloe, array[pip], now() - interval '1 hour', now() + interval '1 day', 'confirmed');
  insert into public.media (pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose)
    values (pip, chloe, 'smoke/015r/a', 'image', 'task_proof') returning id into m;

  perform _t_as(chloe);
  select count(*) into n from public.log_care_checkins(pip,
    '[{"kind": "meal", "value": "all"}, {"kind": "potty", "value": "normal"}, {"kind": "walk", "value": "20"}, {"kind": "mood", "value": "happy"}]',
    '  Loved the park  ', m);
  perform _t_as(null);
  perform _t_ok(n = 4 and (select count(*) from public.care_checkins where pet_id = pip) = 4,
    '015r: four picks are four check-ins');
  perform _t_ok((select count(*) from public.notifications where pet_id = pip and type = 'care_checkin') = 1,
    '015r: the owner gets one notice for the whole check-in');
  perform _t_ok((select n2.title = 'Pip15q ate everything 🍽️ · Potty update for Pip15q: normal 💩 · Pip15q had a 20-minute walk 🦮 · Pip15q seems happy 😊'
        and n2.body = 'Loved the park' and n2.user_id = robert
        and n2.ref_id = (select id from public.care_checkins where pet_id = pip and kind = 'meal')
      from public.notifications n2 where n2.pet_id = pip and n2.type = 'care_checkin'),
    '015r: the notice lists every pick, carries the memo and points at the first pick');
  perform _t_ok((select count(*) from public.care_checkins where pet_id = pip and (note_text is not null or media_id is not null)) = 1
    and (select note_text = 'Loved the park' and media_id = m from public.care_checkins where pet_id = pip and kind = 'meal'),
    '015r: the memo and the photo ride on the first pick only');
  perform _t_ok((select count(*) from public.feed_posts where media_id = m and category = 'meal' and note = 'Loved the park') = 1,
    '015r: the photo makes one feed post');

  perform _t_as(chloe);
  begin
    perform public.log_care_checkins(pip, '[{"kind": "meal", "value": "all"}, {"kind": "meal", "value": "most"}]');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'one_pick_per_group', '015r: one pick per group');
  begin
    perform public.log_care_checkins(pip, '[{"kind": "note", "value": null}]');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'invalid_pick', '015r: only meal, potty, walk and mood are picks');
  begin
    perform public.log_care_checkins(pip, '[]');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'no_picks', '015r: nothing picked is refused');
  begin
    perform public.log_care_checkins(pip, '[{"kind": "meal", "value": "all"}, {"kind": "mood", "value": "giddy"}]');
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '23514' and (select count(*) from public.care_checkins where pet_id = pip) = 4,
    '015r: one bad pick sends nothing');

  perform _t_as(robert);
  begin
    perform public.log_care_checkins(pip, '[{"kind": "meal", "value": "all"}]');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform _t_ok(v_err = 'not_in_care_window', '015r: the owner cannot log a check-in');
  begin
    perform public.care_checkin_write(pip, 'meal', 'all', null, null);
    v_err := null;
  exception when others then v_err := sqlstate;
  end;
  perform _t_ok(v_err = '42501', '015r: care_checkin_write is not callable by clients');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 015t (#411): Judge seats, one browser per set: claim, double claim, heartbeat, release, expiry
-- ---------------------------------------------------------------------------

do $$
declare
  a constant uuid := '00000000-0000-4000-8000-0000000000ea';
  b constant uuid := '00000000-0000-4000-8000-0000000000eb';
  v_ok boolean;
  v_fresh boolean;
  v_err text;
begin
  perform _t_as(null);
  update public.judge_seats set holder = null, heartbeat_at = '-infinity', claimed_at = null;

  perform set_config('role', 'service_role', true);
  select ok, fresh into v_ok, v_fresh from claim_judge_seat('judge1', a);
  perform _t_ok(v_ok and v_fresh, '015t: a free seat is taken, and fresh (the set gets reset)');
  select ok, fresh into v_ok, v_fresh from claim_judge_seat('judge1', b);
  perform _t_ok(not v_ok and not v_fresh, '015t: a second browser cannot take a held seat');
  select ok, fresh into v_ok, v_fresh from claim_judge_seat('judge1', a);
  perform _t_ok(v_ok and not v_fresh, '015t: the holder taking its own seat again is not fresh (no reset)');
  perform _t_ok(judge_seat_held('judge1', a) and not judge_seat_held('judge1', b), '015t: only the holder holds the seat');
  begin
    perform claim_judge_seat('chloe', a);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform _t_ok(v_err = 'unknown_seat', '015t: only judge sets have seats');

  perform _t_as(null, 'anon');
  perform _t_ok((select in_use and not mine from judge_seat_status(b) where set_key = 'judge1'), '015t: another browser sees the seat in use');
  perform _t_ok((select in_use and mine from judge_seat_status(a) where set_key = 'judge1'), '015t: the holder sees its own seat');
  perform _t_ok((select not in_use from judge_seat_status(b) where set_key = 'judge2'), '015t: a free seat is not in use');
  perform _t_ok(judge_seat_heartbeat('judge1', a), '015t: the holder keeps the seat with a heartbeat');
  perform _t_ok(not judge_seat_heartbeat('judge1', b), '015t: a heartbeat from another browser does nothing');
  begin
    perform claim_judge_seat('judge2', b);
    v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '42501', '015t: the app cannot take a seat without the backend');
  begin
    perform count(*) from public.judge_seats;
    v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '42501', '015t: the app cannot read holder ids');

  -- Release: another browser cannot free it; the holder can, and then it is free at once.
  perform release_judge_seat('judge1', b);
  perform _t_ok((select in_use from judge_seat_status(b) where set_key = 'judge1'), '015t: another browser cannot release a seat');
  perform release_judge_seat('judge1', a);
  perform _t_ok((select not in_use from judge_seat_status(b) where set_key = 'judge1'), '015t: sign-out frees the seat at once');
  perform _t_ok(not judge_seat_heartbeat('judge1', a), '015t: a released seat is not taken back by a heartbeat');

  perform set_config('role', 'service_role', true);
  select ok, fresh into v_ok, v_fresh from claim_judge_seat('judge1', a);
  perform _t_ok(v_ok and not v_fresh, '015t: the same browser coming back keeps its stay');
  select ok, fresh into v_ok, v_fresh from claim_judge_seat('judge2', b);
  perform _t_ok(v_ok and v_fresh, '015t: a second browser takes another seat');

  -- Expiry: no heartbeat for 10 minutes frees the seat, and the next browser gets a fresh set.
  perform _t_as(null);
  update public.judge_seats set heartbeat_at = now() - interval '11 minutes' where set_key = 'judge1';
  perform set_config('role', 'service_role', true);
  perform _t_ok(not judge_seat_held('judge1', a), '015t: a seat without a heartbeat for 10 minutes is no longer held');
  select ok, fresh into v_ok, v_fresh from claim_judge_seat('judge1', b);
  perform _t_ok(v_ok and v_fresh, '015t: an expired seat is taken by another browser, fresh');
  perform _t_as(null, 'anon');
  perform _t_ok(not judge_seat_heartbeat('judge1', a), '015t: the old holder lost the seat');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 015v: a judge set's sitter shows in search only for the owner of the same set
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000f1', 'demo-owner-judge1@goldito.test', '{"role":"owner","display_name":"Robert"}'),
  ('00000000-0000-4000-8000-0000000000f2', 'demo-sitter-judge1@goldito.test', '{"role":"sitter","display_name":"Chloe"}'),
  ('00000000-0000-4000-8000-0000000000f3', 'demo-sitter-judge2@goldito.test', '{"role":"sitter","display_name":"Chloe"}');

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  judge_owner constant uuid := '00000000-0000-4000-8000-0000000000f1';
  judge_sitter constant uuid := '00000000-0000-4000-8000-0000000000f2';
  other_judge_sitter constant uuid := '00000000-0000-4000-8000-0000000000f3';
  d constant date := app_today() + 300;
  drop_at timestamptz := local_ts(d, '09:30');
  pick_at timestamptz := local_ts(d, '16:00');
  v_ids uuid[];
begin
  perform _t_as(null);
  update public.owner_profiles set home_lat = 43.6644, home_lng = -79.3573 where id in (robert, judge_owner);
  update public.sitter_profiles set home_lat = 43.6644 + 0.008993, home_lng = -79.3573
    where id in (judge_sitter, other_judge_sitter);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets)
  select x, 'open', d, d, s.slot, s.a, s.b, 2
  from unnest(array[judge_sitter, other_judge_sitter]) x
  cross join (values ('morning'::care_slot, '08:00'::time, '12:00'::time),
                     ('afternoon'::care_slot, '12:00'::time, '18:00'::time)) s (slot, a, b);
  insert into public.sitter_availability (sitter_id, kind, start_date, end_date, slot)
  select x, 'blocked', d, d, 'overnight' from unnest(array[judge_sitter, other_judge_sitter]) x;

  perform _t_ok(sitter_visible_to(judge_sitter, judge_owner) and not sitter_visible_to(other_judge_sitter, judge_owner)
    and not sitter_visible_to(judge_sitter, robert) and sitter_visible_to('00000000-0000-4000-8000-0000000000b1', judge_owner),
    '015v: a judge sitter is visible only to her own set''s owner; other sitters to everyone');

  perform _t_as(judge_owner);
  select array_agg(x.sitter_id) into v_ids
  from search_sitters_nearby(drop_at, pick_at, 1, 5) x where x.sitter_id in (judge_sitter, other_judge_sitter);
  perform _t_ok(v_ids = array[judge_sitter], '015v: a judge owner finds only the own set''s sitter (nearby search)');
  select array_agg(x.sitter_id) into v_ids
  from search_sitters(drop_at, pick_at, 1) x where x.sitter_id in (judge_sitter, other_judge_sitter);
  perform _t_ok(v_ids = array[judge_sitter], '015v: …and in the date search');

  perform _t_as(robert);
  perform _t_ok(not exists (select 1 from search_sitters_nearby(drop_at, pick_at, 1, 5) x
    where x.sitter_id in (judge_sitter, other_judge_sitter)), '015v: another owner never sees a judge sitter (nearby search)');
  perform _t_ok(not exists (select 1 from search_sitters(drop_at, pick_at, 1) x
    where x.sitter_id in (judge_sitter, other_judge_sitter)), '015v: …nor in the date search');
  perform _t_as(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 015u (#407): a review per pet from the sitter after a stay
-- ---------------------------------------------------------------------------

do $$
declare
  robert constant uuid := '00000000-0000-4000-8000-0000000000a1';
  joy constant uuid := '00000000-0000-4000-8000-0000000000a2';
  chloe constant uuid := '00000000-0000-4000-8000-0000000000b1';
  paul constant uuid := '00000000-0000-4000-8000-0000000000b2';
  v_pet uuid;
  v_other uuid;
  v_b uuid;
  v_err text;
begin
  perform _t_as(null);
  insert into public.pets (owner_id, species, name) values (robert, 'dog', 'Review') returning id into v_pet;
  insert into public.pets (owner_id, species, name) values (robert, 'cat', 'NotInStay') returning id into v_other;
  v_b := _t_booking(robert, chloe, array[v_pet], now() + interval '410 days', now() + interval '412 days', 'confirmed', true);

  perform _t_as(chloe);
  begin
    insert into public.pet_reviews (pet_id, booking_id, sitter_id, chips) values (v_pet, v_b, chloe, array['So sweet']);
    v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '42501', '015u: no review before the pets are back');

  perform complete_handoff(v_b, 'pick_up');
  insert into public.pet_reviews (pet_id, booking_id, sitter_id, chips, note)
    values (v_pet, v_b, chloe, array['Loved our walks', 'Ate every meal'], 'A joy to look after.');
  perform _t_ok((select stay_to is not null and stay_from is not null from public.pet_reviews where booking_id = v_b and pet_id = v_pet),
    '015u: the sitter writes the review, with the stay dates from the booking');
  update public.pet_reviews set chips = array['Loved our walks'], note = null where booking_id = v_b and pet_id = v_pet;
  perform _t_ok((select chips = array['Loved our walks'] and note is null from public.pet_reviews where booking_id = v_b and pet_id = v_pet),
    '015u: the sitter edits their review');
  begin
    insert into public.pet_reviews (pet_id, booking_id, sitter_id, chips) values (v_pet, v_b, chloe, array['Again']);
    v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '23505', '015u: one review per pet and stay');
  begin
    insert into public.pet_reviews (pet_id, booking_id, sitter_id, chips) values (v_other, v_b, chloe, array['Hi']);
    v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '42501', '015u: only a pet that was in the stay');
  begin
    insert into public.pet_reviews (pet_id, booking_id, sitter_id) values (v_pet, v_b, chloe)
      on conflict (booking_id, pet_id) do update set chips = '{}', note = null;
    v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '23514', '015u: an empty review is refused');

  perform _t_as(paul);
  perform _t_ok((select count(*) from public.pet_reviews where pet_id = v_pet) = 1, '015u: another sitter reads it');
  begin
    insert into public.pet_reviews (pet_id, booking_id, sitter_id, chips) values (v_pet, v_b, paul, array['Mine']);
    v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '42501', '015u: another sitter cannot write one');
  update public.pet_reviews set note = 'Not mine' where pet_id = v_pet;
  perform _t_as(null);
  perform _t_ok((select note is null from public.pet_reviews where pet_id = v_pet), '015u: another sitter cannot edit it');

  perform _t_as(robert);
  perform _t_ok((select count(*) from public.pet_reviews where pet_id = v_pet) = 1, '015u: the owner reads their pet''s review');
  begin
    insert into public.pet_reviews (pet_id, booking_id, sitter_id, chips) values (v_pet, v_b, robert, array['Owner']);
    v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '42501', '015u: the owner cannot write one');
  begin
    delete from public.pet_reviews;
    v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '42501', '015u: nobody deletes a review');

  perform _t_as(joy);
  perform _t_ok((select count(*) from public.pet_reviews where pet_id = v_pet) = 0, '015u: another owner reads no review');
  perform _t_as(null, 'anon');
  begin
    perform count(*) from public.pet_reviews;
    v_err := null;
  exception when others then v_err := sqlstate; end;
  perform _t_ok(v_err = '42501', '015u: signed-out visitors cannot read');
  perform _t_as(null);
end;
$$;

rollback;
