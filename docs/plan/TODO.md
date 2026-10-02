# PawNote — Active TODO

> **Agents:** After each task, follow [CLAUDE.md](../../CLAUDE.md) §5 — mark done, set one new **Current focus**, do not skip the queue.
> **Git:** one branch + one draft PR per phase, one commit per task ([CLAUDE.md](../../CLAUDE.md) §4.1–4.2). Phase 03B → `feat/phase-03b-bookings` (draft PR when the first task lands).

**Product flow (source of truth):** [full-process.ko.md](full-process.ko.md) — 5 stages, D27–D43 · **Phase index:** [phases/README.ko.md](phases/README.ko.md) · **Blueprint:** [phases/architecture.ko.md](phases/architecture.ko.md)

**Supplementary docs:** [onboarding.ko.md](onboarding.ko.md) · [tavily.ko.md](tavily.ko.md) · [env-setup.ko.md](env-setup.ko.md) · [Devpost](../hackathon/devpost-submission.ko.md)

**GitHub (execution order stays here):** Milestone [P0 hackathon](https://github.com/minsikpaul92/PawNote/milestone/1) · Epics [#4](https://github.com/minsikpaul92/PawNote/issues/4) Phase 01 · [#5](https://github.com/minsikpaul92/PawNote/issues/5) Phase 02 · [#6](https://github.com/minsikpaul92/PawNote/issues/6) Phase 03+OB · [#7](https://github.com/minsikpaul92/PawNote/issues/7) Phase 04–06 · [#8](https://github.com/minsikpaul92/PawNote/issues/8) Phase 07–09 · [#9](https://github.com/minsikpaul92/PawNote/issues/9) Phase 10 · [#10](https://github.com/minsikpaul92/PawNote/issues/10) Phase 11 P1 · [#11](https://github.com/minsikpaul92/PawNote/issues/11) Nebius IDs (Seulgi) · [#12](https://github.com/minsikpaul92/PawNote/issues/12) Tavily key (Seulgi) · [#13](https://github.com/minsikpaul92/PawNote/issues/13) Figma onboarding (Muk)

---

## Current focus (one task only)


| ID      | Task                                      | Phase doc                         |
| ------- | ----------------------------------------- | --------------------------------- |
| **3B.0** | Tabs (owner `Home · Bookings · Feed · Care · Reports`, sitter `Today · Bookings · Tasks · Report` — Scan tab removed) + `004_booking_options.sql` (`service_type`, sitter `services`, Meet & Greet columns, `request_booking` service param, `media.purpose` + `report`/`handoff`) | [phase-03b.md](phases/phase-03b.md) |

---



## Up next (in order — do not start until Current focus is empty)

> Phase 00 account tasks (0.3–0.4) may run in parallel with Phase 01 (see phase-00.md).

> Order follows the 5-stage scenario ([full-process.ko.md](full-process.ko.md), D27). Seulgi's AI tasks (7.1 → 7B backend → 6.12 → 6B.5 → 7.2/7.4 → 9.1 → 7C.4) run in parallel with Minsik's app queue — one Current focus per agent session.

- [ ] **3B.1** Sitter schedule `/sitter/schedule` — month calendar, day × slot (Morning · Afternoon · Overnight) open with own hours + capacity / blocked (`sitter_availability`)
- [ ] **3B.2–3B.10** Owner "Your sitters" / whole-trip search + service type (Boarding / House sitting) + drop-off & pick-up time/place = transport mode (Owner drives / Sitter drives) with negotiation + Received/Returned + cancel → Find a new sitter + **Meet & Greet** ([phase-03b.md](phases/phase-03b.md))
- [ ] **3C.1–3C.7** `quote_booking` (rates + Ontario holidays + extra pet) · consent templates + sign · **Pay (demo)** · sitter home info after payment · owner entry info unlocks 2 h before (`005`) ([phase-03c.md](phases/phase-03c.md))
- [ ] **OB.1–OB.3** Welcome + Login **Try demo** (owner/sitter) — [onboarding.ko.md](onboarding.ko.md); needs **10.1** seed for demo login DoD
- [ ] **4.x** Cloudinary sign/complete + `uploadMedia()` + **4.7** `pickMedia()` sample photo tray (desktop frame / demo accounts — no camera needed; handoff + report samples)
- [ ] **5.x** Care feed + owner timeline + notifications center (`006`)
- [ ] **6.x** Care request → AI mission checklist (6.12–6.14) + 5-second check-ins (walk minutes) + optional-photo tasks + Activity history ([sitter-care-loop.ko.md](sitter-care-loop.ko.md), `007`)
- [ ] **7.1** Nebius client + `test_nebius.py` + per-call metrics log (TTFT, latency, tokens → median table for README feedback) + `embed()` — Seulgi (can start right after Phase 01)
- [ ] **7.2–7.5** Daily report AI (Super) from the 5-second check + ≤ 2 photos + send (`009`)
- [ ] **7B.x** Inquiry AI draft in the sitter's tone + RAG (pgvector, Qwen3 Embedding) — backend Seulgi after 7.1, UI after 05 (`010`) ([phase-07b.md](phases/phase-07b.md)). New: **7B.8** tone layer (style card + `tone_samples` few-shot, D35) · **7B.9** sitter approval UX + learning log (D36, D38) · **7B.10** auto-send + human-paced delivery (D37; delay formula / message structure = Seulgi TBD)
- [ ] **data (Seulgi)** Anonymize the 3-year WhatsApp/message history (English) → `{PRICE}`/`{DATE}` placeholders → train / validation / hold-out test JSONL; `data/raw/` never committed; decide zero-retention + third-party notice (D35, [phase-11.md](phases/phase-11.md) 11.7)
- [ ] **9.x** Auto caption + album category (Meals · Walks · Naps · Play) + Album view
- [ ] **7C.x** Completion — home-safe report, review, Pet Life Record → RAG, next-booking card (`011`) ([phase-07c.md](phases/phase-07c.md))
- [ ] **8.x (P0 stretch, after 7C)** Safety check pipeline + modal + owner notify (`012`) · **8.7 stretch:** Tavily sources (keyword queries, trusted domains, recall search) — Best Use of Tavily
- [ ] **6B.x (P0, last — D41)** Pet Transit — Start trip with location-consent screen, live position + ETA (Simulate the drive), arrival cards, handoff photo check (Vision, MiniCPM-V-4.5) (`008`) ([phase-06b.md](phases/phase-06b.md)); the demo video shows it via Simulate trip
- [ ] **10.x** Seed (scenario data: rates, entry info, routes, past Life Record) + deploy (Nebius AI Cloud Serverless Endpoint) + CD + README + demo accounts + keep-alive + **OB.5** judge checklist ([onboarding.ko.md](onboarding.ko.md), [devpost-submission.ko.md](../hackathon/devpost-submission.ko.md)) + **10.9** desktop side panel (Try demo, QR, hint) + **10.10 stretch** Split view (Owner + Sitter phones side by side) + mouse-only judge path e2e
- [ ] **11.x** P1 (after P0 is live), in order: **11.11** Settings + in-app patch notes (CHANGELOG) → **11.1** photo request → **11.10** pet skin → **11.12** 8bit Pet status room → **11.8** stickers + report card → **11.9** video mood + Fun mood meter (D42) → **11.13** tone learning loop → **11.2** notices · Tavily 11.3 if 8.7 slipped · P2 **11.7** SFT (showcase only, D43) (old 11.4 Q&A → 07B)
- [ ] **design (Muk)** Report card themes (4) + preset sticker set for 11.8 + coat-color skin presets (6–8 palettes, fixed status colors) for 3.0/11.10 + **8bit pixel pet sprites** (Maltese, generic cat, ≥3 mood/hunger states) for 11.12 — can start any time
- [ ] **design (Muk)** Figma frames at **402 × 874** (spot-check 360 / 440) + desktop backdrop / side panel / phone-frame style (DESIGN.md §2.1, 10.9) + sample photo set for 4.7 (dog / cat daily photos for meals · walks · naps, handoff photos — pet at the door, car with / without a crate, empty room — fictional-brand treat labels = Phase 08 fixtures, no people or plates)
- [ ] **design (Muk)** Scenario screens: inquiry thread + quote card, care request → checklist, checkout (consents + demo pay), entry-info lock card, trip screen (map + ETA + arrival cards), 5-second check, album by category, review, Life Record ([full-process.ko.md](full-process.ko.md))
- [ ] **docs-figma** (optional) Figma ↔ code workflow note in frontend/README (Muk handoff)

---



## Completed

- [x] **docs** Tone layer, sitter approval and human pacing: architecture **D35–D42** (sitter-tone layer with style card + retrieved past replies, manual approval / opt-in auto-send with a responsibility modal and no per-message AI label, human-paced delivery for auto mode and the demo video with the delay formula left to Seulgi, zero-typing sitter flow, US/NVIDIA-first model policy, change requests after confirmation, location-consent screen with Pet Transit moved to the end of P0 and shown by demo video, fun mood meter); `full-process.ko.md` Stage 1/3/4 updated + TBD list; phases 06B/07/07B/09/11 and `model-ids.md` (NVIDIA catalog check: Nemotron-Nano-V2-12b, Cosmos3-Super-Reasoner and Nemotron-3-Nano-Omni are Dedicated-Endpoint-only with no fine-tuning, so MiniCPM-V stays and the SFT target is Gemma-4-E4B-it; Qwen3-Embedding is final; NVFP4 GLM/MiniMax/Qwen are Chinese originals; no RFT application); new tasks 7B.8–7B.10, 11.13 (2026-10-02)
- [x] **docs** Full Process scenario first: [full-process.ko.md](full-process.ko.md) (5 stages Inquiry → Meet & Greet → Booking → Care & Pet Transit → Completion, demo path "A Stay with PawNote"), architecture **D27–D34** (scenario-first, service type + transport = handoff place, server-side quote, consent templates + demo payment, timed entry-info unlock, Pet Transit, vision/embedding models, 5-second check memo), routes / API / notifications / env (`MODEL_EMBED`), new phases **03C** · **06B** · **07B** · **07C**, phases 03B–11 updated, migrations renumbered 004–013, Treat Safety Guard → P0 stretch after 7C, old 11.4 Q&A → 07B. Catalog check: Qwen2.5-VL not on Token Factory → MiniCPM-V-4.5; `Qwen/Qwen3-Embedding-8B` works with `dimensions: 1024`. Root README + docs/README.ko.md rewritten around the 5 stages (2026-10-01)
- [x] **fix** Radio controls (`SegmentedControl`, `RoleCard`) expose the selected option to screen readers via `aria-checked` (react-native-web ignores `accessibilityState.checked`); e2e asserts it (2026-10-01)
- [x] **3.5–3.8** Pet profiles + role profiles: owner Home `PetCard` list (🐶 / 🐱, "Dog · Maltese · 4 yrs · 3.2 kg", allergy chips) + Add pet; `/owner/pets/new` · `/owner/pets/[petId]` (`PetForm`: species locked after creation D22, name, breed, birthday, weight, allergy chips stored lowercase + duplicate check); pet insert uses a client UUID without `.select()` (pets_select reads `pets` through `is_owner_of`, which cannot see the row inserted by the same statement — architecture §6); sitter Today stub (3.7); `/profile` for both roles (owner: address, emergency contact, vet; sitter: bio, area, experience, home notes, home address via `get_my_sitter_profile`) + header Profile button; role areas now Stack (guard) over `(tabs)` so details have Back, `initialRouteName` for deep links; `Chip`, `SegmentedControl`, `ToastProvider`, `features/pets`, `features/profile`, `types/db.ts`, `expo-crypto`. Playwright `flows` project (auth 7 + pets 4 + profile 3) on an in-memory PostgREST mock; full local suite 87 passed. Live: sitter profile loads via RPC. Live: Bori (dog, Maltese, chicken) + Mochi (cat, Domestic Shorthair) added on the demo owner through the app and confirmed in the DB. **Phase 03 complete** — handoff-card address check moves to 3B (2026-10-01)
- [x] **10.1 (accounts part, early)** `backend/scripts/seed_demo.py`: demo-owner.test (Jisoo) / demo-sitter.test (Mina) via Admin API (D19), idempotent refresh, `--check` read-only report of `profiles` + role rows; `DEMO_PASSWORD` in backend `.env.example` + architecture §4 (same value as `EXPO_PUBLIC_DEMO_PASSWORD`). Accounts are created by running the script (not by an agent). Rest of 10.1 (pets, bookings, tasks, Jun, sample feed, `--reset`) stays in Phase 10 (2026-10-01)
- [x] **3.4** FastAPI JWT: `deps/auth.py` (`verify_supabase_jwt` — ES256/RS256 via project JWKS with 10 min key cache, legacy HS256 via `SUPABASE_JWT_SECRET`; aud `authenticated`, issuer, `exp`/`sub` required), `get_current_user` (role from `profiles` via service role, not token metadata), `require_role`, `deps/supabase.py` service client, `GET /api/me`; 502 → `upstream_error`. pytest 13 (no token / garbage / forged / expired / wrong aud·iss → 401, HS256 + ES256-via-JWKS → 200, other ES256 key → 401, metadata cannot change role, no profile → 403, require_role). Live: real JWKS fetch rejects unknown key, service-role `profiles` lookup works, CORS from :8081. backend README "Auth". **Live:** `/api/me` 200 with real ES256 tokens for demo owner (Jisoo) and sitter (Mina) (2026-10-01)
- [x] **3.1–3.3** Auth + role routing: `lib/supabase.ts` (lazy `getSupabase()`, AsyncStorage, `getAuthStorageKey()`), `lib/authErrors.ts`, `SessionProvider` (session + `profiles` row; Try again / Log out on load error), `/login` + `/signup` (role cards → `options.data` role + display_name for the signup trigger), `/` gate, role areas `app/owner/` · `app/sitter/` with JS Tabs + stub tabs + header (dev role label, bell slot, Log out) — **D26** URL prefixes instead of `(owner)`/`(sitter)` groups (shared-route refresh picked the wrong role; docs updated). UI: `TextField`, `TextButton`, `EmptyState`, `LoadingView`, `RoleCard`, `icon` tokens. Check API screen → `/dev/health`. Playwright `auth` project with mocked Supabase (7 flows: gate, wrong password, owner/sitter tabs, reload keeps session, sitter blocked from /owner, tab click, sitter signup metadata, log out) + frame/phone specs updated — 80 passed locally. CI frontend job: mock Supabase env + step/job timeouts. **Live (hosted project):** seeded demo owner + sitter sign in, land on their own tabs, reload keeps the session, typing the other role's URL bounces back (2026-10-01)
- [x] **3.0** Theme provider: `theme/themes.ts` (`SkinColors` = primary · primaryText · background · accent; text / error / success / warning fixed by type), `providers/ThemeProvider.tsx` (`useTheme`, `useThemedStyles`), mounted inside `AppShell`; `Button` / `Card` / `Screen` + home + gesture lab read the theme instead of `tokens`; new tokens `accent`, `warning`; DESIGN.md §3 · §3.1 · AI rules. Checked: computed styles identical to before, temp `primary` change recolors Button only, Playwright 73 passed (2026-10-01)
- [x] **chore** `frontend/expo-env.d.ts` untracked + gitignored (Expo template): Expo CLI deletes it on every `start` / `export` while `experiments.typedRoutes` is off; `tsc --noEmit` and `expo export -p web` pass without it (2026-10-01)
- [x] **1.7** Mouse = finger: `TouchEmulation.web.ts` inside the frame iframe, mouse only — drag scroll with axis lock + momentum, no tap after a drag, wheel moves chip rows sideways (paged carousels keep the screen scrolling), paged photos settle on a page, no text selection / image drag, round touch cursor, hidden scrollbars, root-only overscroll containment. `/dev/gestures` lab (`EXPO_PUBLIC_DEV_ROUTES=1`), `color.overlay` token, Playwright (`frontend/e2e/`, Chromium · Firefox · WebKit × 1366 / 1440 / 1920 + touch phone 360 / 402 / 440) in CI, PR template desktop checklist. Local: Chromium + WebKit + phone 73 passed ×2 (momentum test Chromium-only; Firefox needs VC++ runtime this PC lacks — CI covers it). **Phase 01 complete** (2026-10-01)
- [x] **1.6** Web shell: `components/shell/` (`AppShell` native/web, `DeviceFrame`, `presentation.ts`, `useShell`, `useLayoutMode`) — computers (mouse / trackpad, any window width) → 402 × 874 phone frame with the app in a same-origin iframe; touch phones / tablets → full screen. URL mirrored to the address bar (refresh / deep link / back work), `?frame=0|1`, short windows shrink height, narrower-than-phone windows scale the phone down; frame tokens in `tokens.ts`. Checked 1440×900 · 1366×768 · 1920×1080 · 493 narrow desktop pane (framed) · 375 touch (full screen) · 375 + `?frame=1` (scaled, click OK), wheel scroll + click in frame, `tsc` + `expo export` (2026-10-01)
- [x] **docs** Plan B sitter care loop ([sitter-care-loop.ko.md](sitter-care-loop.ko.md)): check-ins, optional photo, Activity, notifications; phase-06/07/architecture updated; P1 **11.11** Settings + [CHANGELOG.md](../CHANGELOG.md) (2026-10-01)
- [x] **2.9** Hosted Supabase: `001`–`003` applied (SQL Editor) + `rls_smoke.sql` passed after API table grants block in `003` (2026-10-01)
- [x] **docs** D25 web display plan: desktop = 402 × 874 phone frame (same-origin iframe), mouse = finger layer, `pickMedia()` sample tray, Playwright mouse tests, side panel + split view (10.9–10.10), sitter desktop as post-hackathon roadmap. New tasks 1.6 · 1.7 · 4.7 · 10.9 · 10.10; DESIGN.md §2.1 · §2.2 · §7.7; architecture, phase-01/03/03B/04/06/08/10, onboarding, Devpost, playbook, CLAUDE.md, READMEs updated (2026-10-01)
- [x] **docs** `DESIGN.md` interim design guide from `tokens.ts` (tokens, components, patterns, AI rules, open items for Muk); linked from CLAUDE.md (2026-10-01)
- [x] **docs** New feature review: stickers + decorated report (11.8) and video mood (11.9) as P1; Pawstagram, pet map, sticker store, bark analysis → post-hackathon roadmap (plan README, root/ko README "What's next") (2026-10-01)
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
| 01 Scaffold          | **done** (2026-09-29) · 1.6–1.7 web shell + mouse done (2026-10-01, D25)       |
| 02 DB + RLS          | **done** (2026-10-01) · hosted apply + smoke (2.9)                              |
| 03 Auth              | **done** (2026-10-01)                                                         |
| 03B Bookings         | next (**3B.0**; DB + RPCs done in 02)                                          |
| 03C Agreements       | not started (Stage 3)                                                         |
| 04 Cloudinary (code) | not started                                                                   |
| 05 Feed              | not started                                                                   |
| 06 Care request + checks | not started (Stage 2 · 4)                                                 |
| 06B Pet Transit      | not started (Stage 4)                                                         |
| 07 Report AI         | not started                                                                   |
| 07B Inquiry AI + RAG | not started (Stage 1)                                                         |
| 07C Completion       | not started (Stage 5)                                                         |
| 08 Safety            | P0 stretch — after 07C (D27)                                                  |
| 09 Caption + album   | not started                                                                   |
| 10 Demo & deploy     | not started                                                                   |
| 11 P1                | not started                                                                   |
| Onboarding UX        | spec done ([onboarding.ko.md](onboarding.ko.md)); code **OB.*** not started   |


---



## Documentation readiness (P0 planning)


| Area                                      | Status    | Gap                                                 |
| ----------------------------------------- | --------- | --------------------------------------------------- |
| Blueprint + phases 00–11                  | ✅         | —                                                   |
| Product flow (Full Process, 5 stages)     | ✅         | [full-process.ko.md](full-process.ko.md) · new phases 03C / 06B / 07B / 07C |
| Hackathon rules + Devpost timing          | ✅         | Devpost **draft** on site = human (민식)              |
| Env / secrets layout                      | ✅         | —                                                   |
| Tavily / Nebius deploy / onboarding specs | ✅         | Tavily = 8.7 stretch (PR #18)                       |
| Nebius model IDs + smoke                  | ✅         | [phases/notes/model-ids.md](phases/notes/model-ids.md) |
| Figma ↔ code workflow                     | ⚠️        | README.ko 한 줄만; optional dedicated md               |
| Root README Getting Started / live URL    | ❌         | Phase **10**                                        |
| P0 playbook ↔ phase docs                  | ✅         | Playbook = prompt starters; phase docs win on conflict |
| Source-of-truth order                     | ✅         | [phases/README.ko.md](phases/README.ko.md) top   |


