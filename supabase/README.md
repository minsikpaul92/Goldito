# PawNote — Supabase (Postgres + Auth + Realtime)

SQL migrations for the PawNote demo. Apply in order via the Supabase SQL Editor (or CLI if you use it locally).

**Blueprint:** [docs/plan/phases/architecture.ko.md](../docs/plan/phases/architecture.ko.md) · **Phase 02:** [phase-02.md](../docs/plan/phases/phase-02.md)

## Migration order

Apply `001 → 002 → 003 → …` in one go. Do not stop after `001`: tables are open until `002` enables RLS.

| File | Phase | Contents (summary) |
| :--- | :--- | :--- |
| `001_initial_schema.sql` | 02 | Core tables: `profiles` + `owner_profiles` / `sitter_profiles`, `sitter_availability`, `bookings` / `booking_slots` (pet × day × slot) / `booking_handoffs` (drop-off & pick-up time, place, agreement), `pets` (dog/cat), allergies, tasks, media, feed, reports, safety, notifications |
| `002_rls_policies.sql` | 02 | Policy helpers (`is_owner_of`, `is_sitter_of`, `is_on_duty_for`, …), RLS by owner / sitter role, column grants |
| `003_functions_triggers.sql` | 02 | Signup → profiles, species guard, schedule/booking/handoff RPCs, overlap guard, Realtime |
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
bookings (owner, sitter, status) 1─* booking_slots (pet × day × slot) *─1 pets
bookings 1─* booking_handoffs (drop_off|pick_up, time, place, proposed|agreed|…)
pets 1─* care_tasks 1─* task_logs ─0..1 media
pets 1─* media ─* feed_posts (sitter) ─0..1 task_logs
pets 1─* daily_reports (1 per pet × date × sitter)
pets 1─* safety_checks ─1 media
profiles 1─* notifications ─0..1 pets / bookings
```

## Smoke test

After `003`, paste [`tests/rls_smoke.sql`](tests/rls_smoke.sql) into the SQL Editor and run it. It creates fictional users, checks permissions and booking scenarios A–H from phase-02, then rolls everything back. Success = no error; any failure stops with `FAIL: <check>`.

## RPC errors

RPCs raise the error code as the message (`error.message` in supabase-js): `not_authenticated`, `not_owner`, `not_a_sitter`, `not_allowed`, `invalid_window`, `invalid_status`, `invalid_kind`, `sitter_unavailable` (detail = full slots), `pet_already_booked`, `handoff_pending`, `handoff_missing`, `handoff_completed`, `overlaps_confirmed_booking` (detail = booking ids), `task_type_not_allowed_for_species`.

## Data model pointer

**Source of truth for columns:** [phase-02.md](../docs/plan/phases/phase-02.md) + the migrations in this folder.
