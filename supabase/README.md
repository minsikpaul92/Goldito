# Pawddy — Supabase (Postgres + Auth + Realtime)

SQL migrations for the Pawddy demo. Apply in order via the Supabase SQL Editor (or CLI if you use it locally).

**Blueprint:** [docs/plan/phases/architecture.ko.md](../docs/plan/phases/architecture.ko.md) · **Schema source of truth:** [phase-02.md](../docs/plan/phases/phase-02.md) (columns, RLS, RPC behaviour — change it first, then the SQL)

## Migration order

Apply `001 → 002 → 003 → …` in one go. Do not stop after `001`: tables are open until `002` enables RLS.

| File | Phase | Contents (summary) |
| :--- | :--- | :--- |
| `001_initial_schema.sql` | 02 | 17 tables: `profiles` + `owner_profiles` / `sitter_profiles`, `sitter_availability`, `bookings` / `booking_pets` (who has which pet when — no overlaps) / `booking_slots` (capacity: pet × day × slot) / `booking_handoffs` (drop-off & pick-up time, place, agreement), `pets` (dog/cat), allergies, tasks, media, feed, reports, safety, notifications |
| `002_rls_policies.sql` | 02 | Policy helpers (`is_owner_of`, `is_sitter_of`, `is_on_duty_for`, `can_view_pet_profile`, …), RLS by owner / sitter role, column grants |
| `003_functions_triggers.sql` | 02 | Signup → profiles, species guard, schedule/booking/handoff RPCs, overlap guard, read RPCs, execute privileges, Realtime |
| `004_booking_options.sql` | 03B | Service type (boarding / house sitting), sitter services, Meet & Greet columns + Accept guard (first-time pairs, meeting spots, Meet link), media purposes |
| `005_meet_greet.sql` | 03B | Meet & Greet RPCs: propose / respond / complete, skip request / answer (decline cancels), both sides' meeting spots |
| `006_agreements.sql` | 03C | Rates, Ontario holidays, `quote_booking`, consents, demo payment, owner entry info + timed unlock |
| `007_feed_notifications.sql` | 05 | Feed posts + notification triggers, `feed_posts.category` |
| `007b_feed_posts_realtime.sql` | 05 | `feed_posts` in the Realtime publication (owner Feed refetch on delete); idempotent. Numbered `007b` because `008` is reserved for care |
| `007c_feed_visibility.sql` | 05 | `feed_posts.posted_by` (author) + `visibility` (shared / private), owner posts, author-only delete, private media hidden from the other party, `feed_post` notices only for shared posts (sitter post → owner, owner post → on-duty sitter) |
| `008_care.sql` | 06 | `ensure_today_task_logs` (6.2), `complete_task_log` with optional photo (6.4), `care_checkins` table + RLS (6.8), `care_requests` + `pet_cautions` + atomic `save_care_request` (6.13), `log_care_checkin` with an optional memo and photo (6.9); later: check-ins, care requests, cautions |
| `008g_care_change_requests.sql` | 06 | While a stay is on the owner SENDS a care request (`send_care_change_request`, one open per pet) and the sitter approves or declines (`respond_care_change_request`: approve creates the tasks and Heads-ups, decline carries a reason); notices `care_request` · `care_request_approved` · `care_request_declined` |
| `008h_care_counter_requests.sql` | 06 | A decline can carry a note; the sitter can send a counter-request instead (`counter_care_change_request`: note + optional extra fee + tasks the owner does themselves) and the owner accepts or declines it (`answer_care_counter`); statuses `countered` · `accepted` · `withdrawn`; notices `care_request_countered` · `care_counter_accepted` · `care_counter_declined` |
| `008i_revoke_trigger_functions.sql` | 06 | Trigger functions (`care_task_reset_today`, `guard_care_checkin_species`, `notify_feed_post`) are no longer callable as RPCs by `anon` / `authenticated` (Supabase advisor) |
| `008j_no_direct_edits_during_stay.sql` | 06 | `pet_has_open_stay`: while a stay is on the owner can't INSERT care tasks or Heads-ups directly (RLS) — they send a care request; edits and deletes unchanged |
| `009_reports.sql` | 07 | `send_daily_report(p_report, p_body)`: the writing sitter sends the report once — the text they send (their edits) is published, status draft → sent, owner notice `report_sent`; the owner only ever sees sent reports |
| `010_inquiries_rag.sql` | 07B | pgvector, inquiries + messages, `knowledge_chunks`, `match_knowledge` |
| `011_completion.sql` | 07C | Reviews, Pet Life Records |
| `012_transit.sql` | 06B (last in P0, D41) | Trips (last position only), handoff photo checks, home coordinates |
| `013_safety.sql` | 08 (stretch, after 06B) | Safety checks + DANGER owner notify |
| `014_p1.sql` | 11 | Photo request, notices (P1) |

Files after `003` are planned — numbers follow the work order in [phases/README.ko.md](../docs/plan/phases/README.ko.md) (product flow: [full-process.ko.md](../docs/plan/full-process.ko.md)). If the order changes, take the next free number.

## ERD

```
auth.users 1─1 profiles (role owner|sitter) ─┬─1 owner_profiles
                                             └─1 sitter_profiles
profiles(sitter) 1─* sitter_availability (day range × slot, hours, max_pets, open|blocked)
profiles(owner)  1─* pets (dog|cat) 1─* pet_allergies
bookings (owner, sitter, status) 1─* booking_pets (pet, care_range — no overlap per pet) *─1 pets
bookings 1─* booking_slots (pet × day × slot, capacity) · 1─* booking_handoffs (drop_off|pick_up)
pets 1─* care_tasks 1─* task_logs ─0..1 media
pets 1─* media ─* feed_posts (sitter) ─0..1 task_logs
pets 1─* daily_reports (1 per pet × date × sitter)
pets 1─* safety_checks ─1 media
profiles 1─* notifications ─0..1 pets / bookings
```

## Smoke test

**Hosted (task 2.9):** after the latest migration (`003` includes API table grants at the end of the file; `004` adds column grants for its new profile columns), paste [`tests/rls_smoke.sql`](tests/rls_smoke.sql) into the SQL Editor and run it. If smoke fails with `permission denied for table pets`, run the **API table grants** section at the bottom of `003_functions_triggers.sql` (do not use a bare `grant update on all tables` — that allows changing `profiles.role` and breaks smoke). If smoke fails with `FAIL: user cannot change own role`, re-run that same grants section to restore column-level UPDATE rules — and then the **Column grants** lines at the end of `004_booking_options.sql`, which that section would otherwise drop. It creates fictional users, checks permissions and booking scenarios A–H from phase-02, then rolls everything back. Success = no error; any failure stops with `FAIL: <check>`.

**Local / CI:** plain Postgres 17 plus [`tests/supabase_stub.sql`](tests/supabase_stub.sql) (API roles, `auth.users`, `auth.uid()`, `extensions` schema, realtime publication). Never run the stub on Supabase. The CI `supabase` job runs the same steps on every PR that touches `supabase/**`.

```bash
docker run -d --name pawddy-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17
```

```bash
export PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres
psql -v ON_ERROR_STOP=1 -q -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -f "$f"; done
psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
```

## Client rules

- **`sitter_profiles`:** always list columns — `select('*')` fails because `home_address` and `meet_spots` are not readable. The sitter reads their own address and meeting spots with `rpc('get_my_sitter_profile')`; booking parties get addresses from `rpc('get_handoff_details')`. `services` is readable by everyone (search shows "Doesn't offer house sitting").
- **Service type (004):** `request_booking(..., p_service_type)` — `boarding` (default) or `house_sitting`; house sitting stores both handoffs as `owner_home` whatever place was sent.
- **Meet & Greet (004, D44):** `request_booking` sets `bookings.meet_greet_status` to `required` for a first-time pair (no earlier booking that reached the drop-off and no done Meet & Greet), else `not_needed`. `respond_booking` accepts only when it is `not_needed`, `done` or `skipped`.
- **Booking pets on cards:** use `rpc('get_booking_pets', { p_booking })` — the pets table hides a pet from the sitter once the booking has ended.
- **Writes:** bookings, handoffs, `booking_pets`, `booking_slots` change only through the RPCs in `003`.

## RPC errors

RPCs raise the error code as the message (`error.message` in supabase-js):

| Code | Meaning |
| :--- | :--- |
| `not_authenticated`, `not_owner`, `not_a_sitter`, `not_allowed` | Caller is not allowed for this pet / booking / role |
| `invalid_window` | Pick-up not after drop-off, drop-off in the past, trip over 31 days (schedule over 92 days) |
| `invalid_status`, `invalid_kind` | Booking is not in a state that allows this / handoff kind is not `drop_off`/`pick_up` |
| `invalid_location`, `location_note_required` | Unknown place type / "Somewhere else" without a note |
| `invalid_service`, `service_not_offered` | Service type is not `boarding`/`house_sitting` (or `daycare` for `quote_booking`) / the sitter has no matching rate or `sitter_profiles.services` entry |
| `invalid_pet_count` | `quote_booking` / `pay_booking_demo` pet count is missing or less than 1 |
| `consents_missing` | Demo pay before every required consent is signed — detail = missing kinds |
| `already_paid` | `pay_booking_demo` called again on a booking that already has `paid_at` |
| `not_paid` | Address / entry info requested before demo pay (03C.4+) |
| `access_locked` | Entry codes outside the 2 h-before → pick-up window — detail JSON `unlocks_at` or `locked_since` |
| `forbidden` | `get_home_access` by anyone other than the booked sitter |
| `meet_greet_required` | Accepting a first-time pair before the Meet & Greet is done or both agreed to skip it (D44) |
| `invalid_mode`, `place_required`, `place_too_long` | Meet & Greet is not `in_person`/`video` / in person without a place / place over 120 characters |
| `meet_greet_not_yet` | Marking the Meet & Greet done before its agreed time |
| `sitter_unavailable` | A slot is full or closed — detail = `YYYY-MM-DD slot, …`, or `no_open_slot` |
| `pet_already_booked` | The pet already has a sitter (or a pending request) for overlapping hours |
| `handoff_pending` | The sitter's own counter-offer is waiting for the owner |
| `handoff_missing`, `handoff_completed` | No agreed handoff yet / already marked Received or Returned |
| `handoff_too_early`, `drop_off_not_completed` | Received more than 2 h before the drop-off / Returned before Received |
| `booking_in_progress` | Cancel after the pets were received or after the pick-up time |
| `booking_finished` | Handoff addresses are hidden 24 h after the pick-up |
| `overlaps_confirmed_booking` | Schedule change would drop below confirmed pets — detail = booking ids |
| `task_type_not_allowed_for_species` | `walk` for a cat or `litter` for a dog |
| `checkin_not_allowed_for_species` | A check-in kind that does not fit the pet (e.g. `walk` for a cat) |
| `not_on_duty`, `not_in_care_window` | Today's task list / a task or check-in outside the sitter's care window |
| `task_log_not_found`, `already_done` | Completing a task that is not on today's list / that is already done |
| `invalid_media` | The attached photo is not the sitter's own upload for this pet |
| `note_required` | A note check-in or a counter-request without a note |
| `too_many_items`, `empty_request` | More than 12 tasks or 8 Heads-ups / a care request with neither |
| `stay_in_progress` | `save_care_request` while a stay is on — send a change request instead (009b) |
| `no_active_stay`, `request_pending` | Change request with no stay on / one is already open (pending or countered) for the pet |
| `already_answered`, `invalid_tasks` | The change request was already answered or closed / counter-request names tasks that are not on it |
| `report_already_sent`, `body_required`, `body_too_long` | Daily report sent twice / empty / over 2000 characters |
