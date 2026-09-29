# PawNote — Active TODO

> **Agents:** After each task, follow [CLAUDE.md](../../CLAUDE.md) §5 — mark done, set one new **Current focus**, do not skip the queue.

**Phase index:** [phases/README.ko.md](phases/README.ko.md)

---

## Current focus (one task only)

| ID | Task | Phase doc |
| :--- | :--- | :--- |
| **0.1** | Create Supabase project (NA region, Email auth ON, **Confirm email OFF**); save URL, anon key, service role key, JWT key type | [phase-00.md](phases/phase-00.md) |

---

## Up next (in order — do not start until Current focus is empty)

> Phase 00 account tasks (0.1–0.4) may run in parallel with Phase 01 (see phase-00.md). Blueprint: [phases/architecture.ko.md](phases/architecture.ko.md).

- [ ] **0.2** Cloudinary account (signed upload only; server enforces `pawnote/{dog_id}/{purpose}/`)
- [ ] **0.3** Nebius API key + model IDs/base URLs → `phases/notes/model-ids.md` — Seulgi
- [ ] **0.4** Tavily key (P1) — Seulgi
- [ ] **1.1** Monorepo scaffold + `.env.example` (all vars from architecture §4)
- [ ] **0.5** Local `backend/.env` + `frontend/.env` from `.env.example`
- [ ] **1.2** FastAPI `/health` + CORS + settings
- [ ] **1.3** Expo Web (expo-router) + health check button
- [ ] **1.4** `.gitignore` hardening
- [ ] **2.1–2.6** `001_initial_schema.sql`
- [ ] **2.7** `002_rls_policies.sql` + `rls_smoke.sql`
- [ ] **2.8** `003_functions_triggers.sql` (signup trigger, `assign_sitter`, realtime)
- [ ] **3.1–3.3** Auth screens + role routing
- [ ] **3.4** FastAPI JWT + `/api/me`
- [ ] **3.5–3.7** Owner dog profile + allergies + sitter assignment; sitter Today stub
- [ ] **4.x** Cloudinary sign/complete + `uploadMedia()`
- [ ] **5.x** Care feed + owner timeline + notifications center (`004`)
- [ ] **6.x** Med/walk tasks + auto today logs + in-app reminder + complete with photo (`005`)
- [ ] **7.1** Nebius client + `test_nebius.py` — Seulgi (can start right after Phase 01)
- [ ] **7.2–7.5** Daily report AI (Super) + quick-tap + send (`006`)
- [ ] **8.x** Safety check pipeline + modal + owner notify (`007`)
- [ ] **9.x** Auto caption on upload
- [ ] **10.x** Seed + deploy (Nebius Serverless Endpoint / Vercel) + README + demo accounts + keep-alive
- [ ] **11.x** P1: photo request, Tavily in safety, notices (after P0 is live)

*(Expand **Up next** with sub-bullets from phase docs when you reach each phase; remove lines as they move to Completed.)*

---

## Completed

- [x] **docs** Phase blueprint: `architecture.ko.md`, phase 00–10 detailed, phase 11 (P1) added; decisions D1–D19 (EN-only demo, Nebius Serverless backend) (2026-09-29)

---

## Phase status

| Phase | Status |
| :--- | :--- |
| 00 Prerequisites | in progress |
| 01 Scaffold | not started |
| 02 DB + RLS | not started |
| 03 Auth | not started |
| 04 Cloudinary | not started |
| 05 Feed | not started |
| 06 Tasks | not started |
| 07 Report AI | not started |
| 08 Safety | not started |
| 09 Caption AI | not started |
| 10 Demo & deploy | not started |
| 11 P1 | not started |
