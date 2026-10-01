# PawNote — Supabase (Postgres + Auth + Realtime)

SQL migrations for the PawNote demo. Apply in order via the Supabase SQL Editor (or CLI if you use it locally).

**Blueprint:** [docs/plan/phases/architecture.ko.md](../docs/plan/phases/architecture.ko.md) · **Schema source of truth:** [phase-02.md](../docs/plan/phases/phase-02.md) (columns, RLS, RPC behaviour — change it first, then the SQL)

## Migration order

Apply `001 → 002 → 003 → …` in one go. Do not stop after `001`: tables are open until `002` enables RLS.

| File | Phase | Contents (summary) |
| :--- | :--- | :--- |
| `001_initial_schema.sql` | 02 | 17 tables: `profiles` + `owner_profiles` / `sitter_profiles`, `sitter_availability`, `bookings` / `booking_pets` (who has which pet when — no overlaps) / `booking_slots` (capacity: pet × day × slot) / `booking_handoffs` (drop-off & pick-up time, place, agreement), `pets` (dog/cat), allergies, tasks, media, feed, reports, safety, notifications |
| `002_rls_policies.sql` | 02 | Policy helpers (`is_owner_of`, `is_sitter_of`, `is_on_duty_for`, `can_view_pet_profile`, …), RLS by owner / sitter role, column grants |
| `003_functions_triggers.sql` | 02 | Signup → profiles, species guard, schedule/booking/handoff RPCs, overlap guard, read RPCs, execute privileges, Realtime |
| `004_feed_notifications.sql` | 05 | Feed posts + notification triggers |
| `005_tasks.sql` | 06 | Today task logs, complete with photo |
| `006_reports.sql` | 07 | Daily report send |
| `007_safety.sql` | 08 | Safety checks + DANGER owner notify |
| `008_p1.sql` | 11 | Photo request, notices (P1) |

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

**Hosted (task 2.9):** after `003` (includes API table grants at the end of the file), paste [`tests/rls_smoke.sql`](tests/rls_smoke.sql) into the SQL Editor and run it. If smoke fails with `permission denied for table pets`, run the **API table grants** section at the bottom of `003_functions_triggers.sql` (do not use a bare `grant update on all tables` — that allows changing `profiles.role` and breaks smoke). If smoke fails with `FAIL: user cannot change own role`, re-run that same grants section to restore column-level UPDATE rules. It creates fictional users, checks permissions and booking scenarios A–H from phase-02, then rolls everything back. Success = no error; any failure stops with `FAIL: <check>`.

**Local / CI:** plain Postgres 17 plus [`tests/supabase_stub.sql`](tests/supabase_stub.sql) (API roles, `auth.users`, `auth.uid()`, `extensions` schema, realtime publication). Never run the stub on Supabase. The CI `supabase` job runs the same steps on every PR that touches `supabase/**`.

```bash
docker run -d --name pawnote-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17
```

```bash
export PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres
psql -v ON_ERROR_STOP=1 -q -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -f "$f"; done
psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
```

## Client rules

- **`sitter_profiles`:** always list columns — `select('*')` fails because `home_address` is not readable. The sitter reads their own address with `rpc('get_my_sitter_profile')`; booking parties get addresses from `rpc('get_handoff_details')`.
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
| `sitter_unavailable` | A slot is full or closed — detail = `YYYY-MM-DD slot, …`, or `no_open_slot` |
| `pet_already_booked` | The pet already has a sitter (or a pending request) for overlapping hours |
| `handoff_pending` | The sitter's own counter-offer is waiting for the owner |
| `handoff_missing`, `handoff_completed` | No agreed handoff yet / already marked Received or Returned |
| `handoff_too_early`, `drop_off_not_completed` | Received more than 2 h before the drop-off / Returned before Received |
| `booking_in_progress` | Cancel after the pets were received or after the pick-up time |
| `booking_finished` | Handoff addresses are hidden 24 h after the pick-up |
| `overlaps_confirmed_booking` | Schedule change would drop below confirmed pets — detail = booking ids |
| `task_type_not_allowed_for_species` | `walk` for a cat or `litter` for a dog |
