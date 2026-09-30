# PawNote — Active TODO

> **Agents:** After each task, follow [CLAUDE.md](../../CLAUDE.md) §5 — mark done, set one new **Current focus**, do not skip the queue.

**Phase index:** [phases/README.ko.md](phases/README.ko.md) · **Blueprint:** [phases/architecture.ko.md](phases/architecture.ko.md)

**Supplementary docs:** [onboarding.ko.md](onboarding.ko.md) · [tavily.ko.md](tavily.ko.md) · [env-setup.ko.md](env-setup.ko.md) · [Devpost](../hackathon/devpost-submission.ko.md)

**GitHub (execution order stays here):** Milestone [P0 hackathon](https://github.com/minsikpaul92/PawNote/milestone/1) · Epics [#4](https://github.com/minsikpaul92/PawNote/issues/4) Phase 01 · [#5](https://github.com/minsikpaul92/PawNote/issues/5) Phase 02 · [#6](https://github.com/minsikpaul92/PawNote/issues/6) Phase 03+OB · [#7](https://github.com/minsikpaul92/PawNote/issues/7) Phase 04–06 · [#8](https://github.com/minsikpaul92/PawNote/issues/8) Phase 07–09 · [#9](https://github.com/minsikpaul92/PawNote/issues/9) Phase 10 · [#10](https://github.com/minsikpaul92/PawNote/issues/10) Phase 11 P1 · [#11](https://github.com/minsikpaul92/PawNote/issues/11) Nebius IDs (Seulgi) · [#12](https://github.com/minsikpaul92/PawNote/issues/12) Tavily key (Seulgi) · [#13](https://github.com/minsikpaul92/PawNote/issues/13) Figma onboarding (Muk)

---

## Current focus (one task only)


| ID      | Task                                      | Phase doc                         |
| ------- | ----------------------------------------- | --------------------------------- |
| **2.9** | Apply `001`–`003` to the hosted Supabase project (SQL Editor) + run `tests/rls_smoke.sql` | [phase-02.md](phases/phase-02.md) |

---



## Up next (in order — do not start until Current focus is empty)

> Phase 00 account tasks (0.3–0.4) may run in parallel with Phase 01 (see phase-00.md).

- [ ] **3.1–3.3** Auth screens + role routing
- [ ] **3.4** FastAPI JWT + `/api/me`
- [ ] **3.5–3.8** Owner pet profile (species dog/cat) + allergies; sitter Today stub; role profiles incl. home address (`get_my_sitter_profile`)
- [ ] **3B.1–3B.8** Sitter schedule (day × slot, own hours, capacity) + owner "Your sitters" / whole-trip search + drop-off & pick-up time/place with negotiation + Received/Returned + cancel → Find a new sitter ([phase-03b.md](phases/phase-03b.md))
- [ ] **OB.1–OB.3** Welcome + Login **Try demo** (owner/sitter) — [onboarding.ko.md](onboarding.ko.md); needs **10.1** seed for demo login DoD
- [ ] **4.x** Cloudinary sign/complete + `uploadMedia()`
- [ ] **5.x** Care feed + owner timeline + notifications center (`004`)
- [ ] **6.x** Med/walk tasks + auto today logs + in-app reminder + complete with photo (`005`)
- [ ] **7.1** Nebius client + `test_nebius.py` + per-call metrics log (TTFT, latency, tokens → median table for README feedback) — Seulgi (can start right after Phase 01)
- [ ] **7.2–7.5** Daily report AI (Super) + quick-tap + send (`006`)
- [ ] **8.x** Safety check pipeline + modal + owner notify (`007`) · **8.7 stretch:** Tavily sources (keyword queries, trusted domains, recall search) — Best Use of Tavily
- [ ] **9.x** Auto caption on upload
- [ ] **10.x** Seed + deploy (Nebius AI Cloud Serverless Endpoint) + CD + README + demo accounts + keep-alive + **OB.5** judge checklist ([onboarding.ko.md](onboarding.ko.md), [devpost-submission.ko.md](../hackathon/devpost-submission.ko.md))
- [ ] **11.x** P1: photo request, notices, Tavily only if 8.7 slipped (after P0 is live) · P2 idea **11.7** SFT on anonymized reports
- [ ] **docs-figma** (optional) Figma ↔ code workflow note in frontend/README (Muk handoff)

---



## Completed

- [x] **docs-sync** Doc consistency pass: vision model = MiniCPM-V everywhere (Nano Omni not in catalog), #18 Tavily 8.7 / metrics reflected in CLAUDE.md · READMEs · playbook · phase-00/11, plan README §9/§10 → summaries pointing to phase-02 / architecture §7, playbook prompts aligned (signup trigger, English-only, auto task logs, D18 deploy, API bodies), D23 `sleep`, stale "assignment" wording, Toronto attended, deadlines, demo password policy (`EXPO_PUBLIC_DEMO_PASSWORD`), `welcome` route, Python 3.12, source-of-truth order in phases/README (2026-09-30)
- [x] **2.8b** Phase 02 review fixes: per-pet time overlap guard (`booking_pets` exclusion), custom drop-off/pick-up edge rule, 2 h read wrap-up, requested sitter sees pet profile, no cancel after Received, handoff time/place rules, newest open row wins, `default_hours` check, 24 h address window, execute privileges, `updated_at` trigger; smoke test 99 checks + `supabase_stub.sql` + CI `supabase` job (2026-09-30)
- [x] **2.10** `get_my_sitter_profile()` — sitter reads own `home_address` (2026-09-30)
- [x] **docs** Sponsor session review: Tavily keyword queries + domain/recall filters, Tavily moved to 8.7 stretch, Nebius per-call metrics (7.1, architecture §9), SFT as P2 idea 11.7 (2026-09-30)
- [x] **2.8** `003_functions_triggers.sql` (signup trigger, species guard, schedule/search/booking/handoff RPCs, overlap guard, realtime) + `rls_smoke.sql` (permissions + scenarios A–H, all pass on local Postgres) + supabase/backend README (2026-09-30)
- [x] **2.7** `002_rls_policies.sql` — policy helpers, RLS on 16 tables, column grants (2026-09-30)
- [x] **2.1–2.6** `001_initial_schema.sql` — 16 tables + `care_slot` enum, constraints verified on local Postgres (2026-09-29)
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
- [x] **0.3** Nebius key + catalog + [model-ids.md](phases/notes/model-ids.md) + inference smoke (Fast + MiniCPM vision) (2026-09-29)
- [x] **0.4** Tavily API key in local `backend/.env` (2026-09-29)
- [x] **0.5** Local `backend/.env` + `frontend/.env` + [env-setup.ko.md](env-setup.ko.md) (2026-09-29)
- [x] **1.1** Monorepo layout: `supabase/`, README links, env templates verified (2026-09-29)
- [x] **1.2** FastAPI `/health`, CORS, settings, pytest health test (2026-09-29)
- [x] **1.3** Expo Web + Check API → `/health` (2026-09-29)
- [x] **1.4** `.gitignore` hardening (2026-09-29)
- [x] **1.5** CI `ci.yml` + `backend/ruff.toml` (2026-09-29; branch protection: manual on GitHub)

---



## Phase status


| Phase                | Status                                                                        |
| -------------------- | ----------------------------------------------------------------------------- |
| 00 Prerequisites     | **done** (2026-09-29)                                                         |
| 01 Scaffold          | **done** (2026-09-29)                                                         |
| 02 DB + RLS          | in progress (**2.9** hosted apply — SQL verified locally + CI)                |
| 03 Auth              | not started                                                                   |
| 03B Bookings         | not started (DB + RPCs done in 02)                                            |
| 04 Cloudinary (code) | not started                                                                   |
| 05 Feed              | not started                                                                   |
| 06 Tasks             | not started                                                                   |
| 07 Report AI         | not started                                                                   |
| 08 Safety            | not started                                                                   |
| 09 Caption AI        | not started                                                                   |
| 10 Demo & deploy     | not started                                                                   |
| 11 P1                | not started                                                                   |
| Onboarding UX        | spec done ([onboarding.ko.md](onboarding.ko.md)); code **OB.*** not started   |


---



## Documentation readiness (P0 planning)


| Area                                      | Status    | Gap                                                 |
| ----------------------------------------- | --------- | --------------------------------------------------- |
| Blueprint + phases 00–11                  | ✅         | —                                                   |
| Hackathon rules + Devpost timing          | ✅         | Devpost **draft** on site = human (민식)              |
| Env / secrets layout                      | ✅         | —                                                   |
| Tavily / Nebius deploy / onboarding specs | ✅         | Tavily = 8.7 stretch (PR #18)                       |
| Nebius model IDs + smoke                  | ✅         | [phases/notes/model-ids.md](phases/notes/model-ids.md) |
| Figma ↔ code workflow                     | ⚠️        | README.ko 한 줄만; optional dedicated md               |
| Root README Getting Started / live URL    | ❌         | Phase **10**                                        |
| P0 playbook ↔ phase docs                  | ✅         | Playbook = prompt starters; phase docs win on conflict |
| Source-of-truth order                     | ✅         | [phases/README.ko.md](phases/README.ko.md) top   |


