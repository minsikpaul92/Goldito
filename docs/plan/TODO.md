# PawNote — Active TODO

> **Agents:** After each task, follow [CLAUDE.md](../../CLAUDE.md) §5 — mark done, set one new **Current focus**, do not skip the queue.

**Phase index:** [phases/README.ko.md](phases/README.ko.md) · **Blueprint:** [phases/architecture.ko.md](phases/architecture.ko.md)

**Supplementary docs:** [onboarding.ko.md](onboarding.ko.md) · [tavily.ko.md](tavily.ko.md) · [env-setup.ko.md](env-setup.ko.md) · [Devpost](../hackathon/devpost-submission.ko.md)

---

## Current focus (one task only)

| ID | Task | Phase doc |
| :--- | :--- | :--- |
| **1.1** | Monorepo scaffold + `.env.example` (all vars from architecture §4) | [phase-01.md](phases/phase-01.md) |

> **1.1 partial:** `backend/.env.example`, `frontend/.env.example`, env guides exist; `backend/app/`, Expo app skeleton, `supabase/migrations/` layout still TODO.

---

## Up next (in order — do not start until Current focus is empty)

> Phase 00 account tasks (0.3–0.4) may run in parallel with Phase 01 (see phase-00.md).

- [ ] **0.3** Nebius API key + model IDs/base URLs → `phases/notes/model-ids.md` — Seulgi
- [ ] **0.4** Tavily API key → `TAVILY_API_KEY` in local `.env` ([tavily.ko.md](tavily.ko.md)) — Seulgi
- [ ] **1.2** FastAPI `/health` + CORS + settings
- [ ] **1.3** Expo Web (expo-router) + health check button
- [ ] **1.4** `.gitignore` hardening
- [ ] **1.5** CI: `.github/workflows/ci.yml` (backend ruff+pytest, frontend tsc+web export) → then enable `main` branch protection
- [ ] **2.1–2.6** `001_initial_schema.sql`
- [ ] **2.7** `002_rls_policies.sql` + `rls_smoke.sql`
- [ ] **2.8** `003_functions_triggers.sql` (signup trigger, `assign_sitter`, realtime)
- [ ] **3.1–3.3** Auth screens + role routing
- [ ] **3.4** FastAPI JWT + `/api/me`
- [ ] **3.5–3.7** Owner dog profile + allergies + sitter assignment; sitter Today stub
- [ ] **OB.1–OB.3** Welcome + Login **Try demo** (owner/sitter) — [onboarding.ko.md](onboarding.ko.md); needs **10.1** seed for demo login DoD
- [ ] **4.x** Cloudinary sign/complete + `uploadMedia()`
- [ ] **5.x** Care feed + owner timeline + notifications center (`004`)
- [ ] **6.x** Med/walk tasks + auto today logs + in-app reminder + complete with photo (`005`)
- [ ] **7.1** Nebius client + `test_nebius.py` — Seulgi (can start right after Phase 01)
- [ ] **7.2–7.5** Daily report AI (Super) + quick-tap + send (`006`)
- [ ] **8.x** Safety check pipeline + modal + owner notify (`007`)
- [ ] **9.x** Auto caption on upload
- [ ] **10.x** Seed + deploy (Nebius AI Cloud Serverless Endpoint) + CD + README + demo accounts + keep-alive + **OB.5** judge checklist ([onboarding.ko.md](onboarding.ko.md), [devpost-submission.ko.md](../hackathon/devpost-submission.ko.md))
- [ ] **11.x** P1: photo request, Tavily in safety, notices (after P0 is live)
- [ ] **docs-sync** phases/README index links; architecture §3 `welcome` route (OB.1); optional `figma` workflow note in frontend/README — after doc batch lands on `main`

---

## Completed

- [x] **docs** Phase blueprint: `architecture.ko.md`, phase 00–10 detailed, phase 11 (P1); decisions D1–D20 (2026-09-29)
- [x] **docs** CI/CD plan: D20, architecture §11, task 1.5, CD in phase 10 (2026-09-29)
- [x] **docs** D18: backend deploy = **Nebius AI Cloud Serverless Endpoint** (Render fallback only) — architecture, phase-00/10, README.ko (2026-09-29)
- [x] **docs** [tavily.ko.md](tavily.ko.md) + README.ko §12; `TAVILY_API_KEY` in [backend/.env.example](../../backend/.env.example) (2026-09-29)
- [x] **docs** [onboarding.ko.md](onboarding.ko.md) (Welcome, Try demo, OB.*, 묵 handoff) + README.ko §12.1, phase-10 link (2026-09-29)
- [x] **docs** [devpost-submission.ko.md](../hackathon/devpost-submission.ko.md) (마감 10-30 PT, draft vs submit) (2026-09-29)
- [x] **docs** [env-setup.ko.md](env-setup.ko.md) updated (API URL, Tavily, onboarding, Devpost links) (2026-09-29)
- [x] **docs** English few-shot / anonymization + Nebius OpenAI-compatible SDK note (commit `79fa010`) (2026-09-29)
- [x] **0.1** Supabase PawNote (Canada Central), URL + anon + service_role; Auth email ON (confirm email OFF 권장 — 대시보드 확인) (2026-09-29)
- [x] **0.2** Cloudinary (`tsmbhkpw`) + API keys (2026-09-29)
- [x] **0.5** Local `backend/.env` + `frontend/.env` + [env-setup.ko.md](env-setup.ko.md) (2026-09-29)

---

## Phase status

| Phase | Status |
| :--- | :--- |
| 00 Prerequisites | **partial** — 0.1, 0.2, 0.5 done; **0.3 Nebius, 0.4 Tavily** pending (Seulgi) |
| 01 Scaffold | in progress (**1.1** — env templates only so far) |
| 02 DB + RLS | not started |
| 03 Auth | not started |
| 04 Cloudinary (code) | not started |
| 05 Feed | not started |
| 06 Tasks | not started |
| 07 Report AI | not started |
| 08 Safety | not started |
| 09 Caption AI | not started |
| 10 Demo & deploy | not started |
| 11 P1 | not started |
| Onboarding UX | spec done ([onboarding.ko.md](onboarding.ko.md)); code **OB.*** not started |

---

## Documentation readiness (P0 planning)

| Area | Status | Gap |
| :--- | :--- | :--- |
| Blueprint + phases 00–11 | ✅ | — |
| Hackathon rules + Devpost timing | ✅ | Devpost **draft** on site = human (민식) |
| Env / secrets layout | ✅ | — |
| Tavily / Nebius deploy / onboarding specs | ✅ written | **Not all committed** on `main` yet (see git) |
| Seulgi model IDs doc | ❌ | `phases/notes/model-ids.md` (task **0.3**) |
| Figma ↔ code workflow | ⚠️ | README.ko 한 줄만; optional dedicated md |
| Root README Getting Started / live URL | ❌ | Phase **10** |
| P0 playbook ↔ OB.* | ⚠️ | Playbook still generic; use onboarding.ko.md for OB |
