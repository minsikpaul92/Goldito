# PawNote — Supabase (Postgres + Auth + Realtime)

SQL migrations for the PawNote demo. Apply in order via the Supabase SQL Editor (or CLI if you use it locally).

**Blueprint:** [docs/plan/phases/architecture.ko.md](../docs/plan/phases/architecture.ko.md) · **Phase 02:** [phase-02.md](../docs/plan/phases/phase-02.md)

## Migration order

| File | Phase | Contents (summary) |
| :--- | :--- | :--- |
| `001_initial_schema.sql` | 02 | Core tables: `profiles` + `owner_profiles` / `sitter_profiles`, `sitter_availability`, `bookings` / `booking_days` (pet × day), `pets` (dog/cat), allergies, tasks, media, feed, reports, safety, notifications |
| `002_rls_policies.sql` | 02 | Row-level security by owner / sitter role |
| `003_functions_triggers.sql` | 02 | Signup → profiles, species guard, booking RPCs (search/request/respond/cancel), capacity + dropped-day triggers, Realtime |
| `004_feed_notifications.sql` | 05 | Feed posts + notification triggers |
| `005_tasks.sql` | 06 | Today task logs, complete with photo |
| `006_reports.sql` | 07 | Daily report send |
| `007_safety.sql` | 08 | Safety checks + DANGER owner notify |
| `008_p1.sql` | 11 | Photo request, notices (P1) |

Files appear in `migrations/` as each phase lands. Until Phase 02, this folder only holds placeholders.

## RLS smoke tests

After `002`, run queries in `tests/rls_smoke.sql` (added in Phase 02) with owner and sitter JWT contexts.

## Data model pointer

High-level entity list: [docs/plan/README.ko.md §9](../docs/plan/README.ko.md#9-데이터-모델-초안). **Source of truth for columns** is the phase-02 migration + architecture decisions (D6–D7, D10–D11).
