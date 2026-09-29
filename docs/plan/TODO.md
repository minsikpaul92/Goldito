# PawNote — Active TODO

> **Agents:** After each task, follow [CLAUDE.md](../../CLAUDE.md) §5 — mark done, set one new **Current focus**, do not skip the queue.

**Phase index:** [phases/README.ko.md](phases/README.ko.md)

---

## Current focus (one task only)

| ID | Task | Phase doc |
| :--- | :--- | :--- |
| **0.1** | Create Supabase project; save URL, anon key, service role key | [phase-00.md](phases/phase-00.md) |

---

## Up next (in order — do not start until Current focus is empty)

- [ ] **0.2** Cloudinary account + folder rule `pawnote/{dog_id}/`
- [ ] **0.3** Nebius API key + document model IDs (`GET /v1/models`) — Seulgi
- [ ] **0.5** Local `backend/.env` + `frontend/.env` from `.env.example`
- [ ] **1.1** Monorepo scaffold (`frontend/`, `backend/`, `supabase/migrations/`)
- [ ] **1.2** FastAPI `/health` + CORS + settings
- [ ] **1.3** Expo Web + health check button
- [ ] **2.x** Migrations `001` schema + `002` RLS
- [ ] **3.x** Auth + owner/sitter homes + `/api/me`
- [ ] **4.x** Cloudinary sign + complete + upload UI
- [ ] **5.x** Care feed + owner timeline + notifications
- [ ] **6.x** Med/walk tasks + complete with photo
- [ ] **7.x** Daily report AI (Super) + send UI
- [ ] **8.x** Safety check pipeline + modal
- [ ] **9.x** Auto caption on upload
- [ ] **10.x** Seed + deploy + README + demo accounts

*(Expand **Up next** with sub-bullets from phase docs when you reach each phase; remove lines as they move to Completed.)*

---

## Completed

<!-- Move finished tasks here with date, then remove from Up next.

Example:
- [x] **1.1** Monorepo scaffold (2026-09-29)
-->

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
