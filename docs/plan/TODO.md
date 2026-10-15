# Goldito — Active TODO

> **Rule of this file: it lists only what is still open.** When a task is done, delete its line (CLAUDE.md §5) — the commit, the PR and [test-guide.ko.md](test-guide.ko.md) are the record. No "Completed" section: finished items up to 2026-10-10 are in [../archive/todo-completed-2026-10.md](../archive/todo-completed-2026-10.md) (frozen lookup), later ones in `git log` / `gh pr list --state merged`.
> **Always start by updating `main`** (`git checkout main && git pull origin main`), then read this file ([CLAUDE.md](../../CLAUDE.md) top line).
> **Specs:** each open item's detail lives in its phase doc's **Open items** section ([03B 예약](phases/phase-03b-booking.md) · [03C 결제](phases/phase-03c-payment.md) · [06 체크](phases/phase-06-checks.md) · [06B 이동](phases/phase-06b-transit.md) · [07B 문의AI](phases/phase-07b-inquiry.md) · [10 배포](phases/phase-10-deploy.md) · [12 Snap](phases/phase-12-snap.md) · [Q 품질·QA](phases/phase-q-quality.md)); the pet-profile onboarding has its own spec ([pet-profile-onboarding.ko.md](pet-profile-onboarding.ko.md)); this file keeps the order and owners. **Docs rules:** [CLAUDE.md §5.1](../../CLAUDE.md) — tidy this file in every PR. **Git:** one branch + one PR per phase, one commit per step ([CLAUDE.md](../../CLAUDE.md) §4.1–4.2). **Testing:** on `main`, at **https://goldito-petcare.vercel.app** (test-guide §1.1).

**Product flow (source of truth):** [full-process.ko.md](full-process.ko.md) — 5 stages, D27–D47 · **Phase index:** [phases/README.ko.md](phases/README.ko.md) · **Blueprint:** [phases/architecture.ko.md](phases/architecture.ko.md) · **Team split:** [work-split-2026-10-09.ko.md](work-split-2026-10-09.ko.md) · **Feedback / review detail:** [feedback-2026-10-08.ko.md](feedback-2026-10-08.ko.md) · [feedback-2026-10-10.ko.md](feedback-2026-10-10.ko.md) · [review-2026-10-08.ko.md](review-2026-10-08.ko.md) · [review-2026-10-15.ko.md](review-2026-10-15.ko.md) (Snap, PR #90 · #91) · **Other:** [test-guide.ko.md](test-guide.ko.md) · [onboarding.ko.md](onboarding.ko.md) · [tavily.ko.md](tavily.ko.md) · [env-setup.ko.md](env-setup.ko.md) · [Devpost](../hackathon/devpost-submission.ko.md)

**Deadline:** submit by **2026-10-30 10:00 AM PT**. Internal freeze **10/28**. Judging runs to 12/15 (the demo must stay up).

---

## Environment (facts to know before you start)

- **Frontend:** Vercel production **https://goldito-petcare.vercel.app** (auto-deploys from `main`). **Backend:** Render free **https://goldito-backend.onrender.com** — sleeps after 15 min idle (first request 30–50 s); `keepalive.yml` + cron-job.org ping `/health` every 10 min. PR previews are not in CORS.
- **Hosted DB** (Supabase, ca-central-1; dashboard name still `Pawddy`, see [rename-goldito.ko.md](rename-goldito.ko.md)): applied `010`–`011l`, `011z`, `012` (06B, applied 2026-10-12 while PR #83 was still open), `012b`–`012f` (code review CR-1 – CR-7, applied 2026-10-13 before the merge of their PR; smoke test passed) and `013` (12.1a Treat check: owner acknowledge + sitter-DANGER notice, applied 2026-10-14 while PR #90 was open; `rls_smoke.sql` all PASS — running `013` again fails with "trigger already exists", which only means it is in). `013b_mood_stickers.sql` (12.3a stickers + 12.3b report decor) applied 2026-10-14, also while PR #90 was open — `rls_smoke.sql` all PASS (013b block included). **Names:** no per-person letter ranges any more (CR-6) — a new file takes the next free name after the highest one on `main` and in open PRs, and must still sort after everything already applied when it is applied ([supabase/README.md](../../supabase/README.md) § Naming). Edit no applied migration.
- **IA reminders:** Diary photo → Feed mirror · Feed multi-pet toggle · Settings/Earnings in Profile · no 6th tab. **Do not** revive OB.4.

---

## Current focus (one task per person — each edits only their own row)

| Who | ID | Task | Doc |
| --- | --- | --- | --- |
| **Seulgi** | **Q.0 → Q.1** | Open **https://goldito-petcare.vercel.app** (normal + private window), Try demo owner + sitter, one demo reset (Profile → Demo tools), then the full manual run with sitter-eye feedback as GitHub issues (QA feedback form) | [phases/phase-q-quality.md](phases/phase-q-quality.md) §0 · §1 |
| **Minsik** | **SR-3 → SR-1 → SR-4 Snap review fixes** | P0 from the 2026-10-15 review of #90 · #91: Treat check never says SAFE on a partly read label (SR-1), stops calling `peanut butter` dairy or `beef liver` a hidden chicken source (SR-3); the Snap tab's Recent checks reload on focus (SR-4). One branch + PR (`fix/snap-review-p0`), one commit per item, SR-2 done, then SR-3 → SR-1 → SR-4. Then **11.1 Photo request** (P1 window 10/17–10/23) → 11.11 → 11.15 → Phase 10 last (order decided 2026-10-14). | [review-2026-10-15.ko.md](review-2026-10-15.ko.md) §2 |

---

## P0 demo path (in order — this is what must work for the video)

**Minsik**
1. **SR-1 · SR-3 · SR-4 Snap review fixes (P0 since 2026-10-15; SR-2 done)** — the treat check says something untrue, and Recent checks is in the README ([review-2026-10-15.ko.md](review-2026-10-15.ko.md) §2, scenarios test-guide §3.21): **SR-1** a partly read or cut-off ingredient list is at least WARNING with a "retake the whole list" line (vision `complete` flag, `_clean_list` re-splits instead of cutting at 120 chars) · **SR-3** allergen exclusions (`peanut butter` is not dairy) and no hidden-source WARNING when the ingredient already names an animal (`beef liver`) · **SR-4** Snap tab Recent checks reload with `useFocusEffect`. About a day, before the P1 window.
2. **P1 window (10/17–10/23, decided 2026-10-14)** — **11.1 photo request** (Owner Feed **Request photo** → sitter Home banner → the next photo fulfills it; migration `014`) → **11.11 Settings + What's New** (CHANGELOG under Profile → Settings). Only if time remains: 11.8 **Save image** of the decorated diary page · 11.9 mood chip on feed videos (reuses `/api/ai/pet-mood`) · 11.13 tone loop (needs Seulgi's Q.4 data). Not now: 11.2 · 11.6 · 11.14; 11.10 · 11.12 wait for Muk's palettes / pixel art. [phase-11-p1.md](phases/phase-11-p1.md)
3. **11.15 Pet profile onboarding + "Max at a glance" — implement last** (decided 2026-10-10). Spec: [pet-profile-onboarding.ko.md](pet-profile-onboarding.ko.md). Shown only to **owners right after sign-up** (first pet; also Add pet) — not to sitters, not to Try demo accounts (the seed fills Max · Mochi). One question per screen, large text, 12 + 6 four-choice questions (3–5 min), photo → breed / coat suggestions, voice → speech-to-text (**Groq Whisper, free plan** — Token Factory has no STT; check Safari / Chrome recordings and Groq's terms when building) → facts, 5-axis card + safety chips for the sitter, breed needs via Tavily + a curated JSON. **Approximate schedule:** after 10's core (≈ 10/20–24): S1 (no AI) 10/24–25 · S2 photo 10/25 · S3 voice 10/25–26 · S4 Tavily 10/26–27. **Because it is last it is cut first:** S4 → S3 → S2 (keep S1). Owners: Minsik build · Seulgi question wording + breed list + the 55+ timing test · Muk large-text spec in Figma
4. **10 Demo & deploy — last (moved to the end 2026-10-14)** — seed (rates, entry info, home points ✅ (06B), past Life Record, tone data + auto mode, meeting spots, a pending draft, a second sitter "Paul"; `--fresh-inquiry`), **fixed demo accounts** instead of Demo tools (below), README **Goldito Agent** section (D46) + Getting Started + demo accounts, **OB.5** judge checklist, **10.9** desktop side panel (Try demo, QR, hint), mouse-only judge path e2e, **10.10 stretch** Split view. [phase-10-deploy.md](phases/phase-10-deploy.md)

**Seulgi — Phase Q** (one at a time in her row; detail in [phase-q-quality.md](phases/phase-q-quality.md)): Q.0 environment → Q.1 full manual run + findings as GitHub issues (QA feedback form) → Q.2 wording / presets → Q.3 anonymization (+ zero-retention decision) → Q.4 tone data (inquiry + daily report) + auto-send delay formula → Q.4b prompt engineering + RAG-first answers → Q.5 R3 Medium report / caption / Life Record / seed (M-14 · M-20 · M-16 first; M-12 done) → Q.6 R3 Medium inquiry M-1–M-11 → Q.7 measurements → Q.8 final QA (10/27–29, two accounts: test-guide **INQ-1 … INQ-19**, **REPORT-10**; plus the real phone camera on the Vercel URL — Take photo / Choose from library) → Q.9 R4 Low (L-1–L-6, FB-3 · FB-4 · FB-1) → Q.10 SFT (P2). Branches `fix/q-review-medium`, `fix/q-review-low`.

**Before submit (Minsik, human):**
- **Supabase must not pause (10.7①)** — `GET /health/deep` (one read from Supabase) and a daily call from `keepalive.yml` are merged ([#88](https://github.com/minsikpaul92/Goldito/pull/88)); they work once Render has redeployed the backend — then run `curl -fsS https://goldito-backend.onrender.com/health/deep` once by hand and check the first daily Actions run is green. Still by hand: turn on **Leaked password protection** in the Supabase dashboard, and before submit check the project is active.
- **Submission checklist** (phase-10 10.2 · 10.5 · 10.6 · 10.8, [hackathon rules §4](../hackathon/README.md)) — owners proposed, confirm: **demo video** < 3 min, public on YouTube, audio explaining the Token Factory + NVIDIA model use, no copyrighted music (Minsik records, Muk edits; record after Q.8 starts, 10/27) · **Devpost** text + track + **feedback** on Token Factory and every model used (README feedback table, 10.6) · **README** Getting Started + "How we use Nemotron" (10.2) · `docs/DEMO_ACCOUNTS.md` (10.5; passwords only in the Devpost field) · repo public, MIT in About, no real PII · everything in English · internal draft done **10/28**.
- **Demo accounts for judging** — take **Profile → Demo tools** and `POST /api/demo/reset` out (unset `EXPO_PUBLIC_DEMO_TOOLS` + `DEMO_RESET_ENABLED`; delete `components/DemoTools.tsx`, `lib/demoReset.ts`, `e2e/demo-tools.spec.ts`, `app/routers/demo.py`, the CI env line). Replace with fixed accounts per starting point built by the same `demo_reset` code, nothing a judge can delete: empty · pets only · booking accepted, later in care · finished; Try demo buttons pick among them. Open decision: two judges on one account. **R60-3 – R60-5 fold in here** — the reset is not atomic (a failure after the deletes leaves it half-reset; IQ-14 hit this in practice) · extra owner pets over capacity fail the reset · `in_care` fails 00:00–00:57 Toronto.
- **KA-1 keep-alive check** before every deploy, test session or demo recording: Actions → `keepalive` green, gaps ≤ 15 min; cron-job.org `Goldito Keepalive` shows `200 OK`; after 30 idle minutes `/health` answers < 1 s. Keep both running until **12/15**.
- **Google OAuth In production** (Testing-mode refresh tokens expire in 7 days; needed before **3B.11**): no custom domain and no Google verification needed — only the Goldito-owned account ever consents (OAuth Playground, once), which is Google's personal-use case (< 100 users; the guests only get Calendar invites, they never sign in). Steps: Branding → app home page `https://goldito-petcare.vercel.app`, privacy policy `https://goldito-petcare.vercel.app/privacy` (now has the Google Calendar and Meet section with the Limited Use statement), authorized domain `goldito-petcare.vercel.app`, support + developer contact email → Audience → **Publish app** (accept the "needs verification" notice; the one consent shows "Google hasn't verified this app" → Advanced → Continue) → a new refresh token from the Playground → Render env. Only if verification is ever wanted: the authorized domain must be verified in Google Search Console — a URL-prefix property on the Vercel URL (HTML tag) may do, a domain we own is the safe route.
- **3B.11 app e2e** Video Meet & Greet on the hosted DB needs a first-time pair and the backend with the Google vars; after the seed adds the second sitter (full-process §9 #14).

- **README final pass (10.2)** — written once, at the end, from these notes; **approach + top-block draft decided 2026-10-11: [phase-10 § README 재작성 방침](phases/phase-10-deploy.md)** (two story lines at the very top, no competitor names, "more than sitting" line, Korean README too): how Goldito works (5 stages, agent table D46), Getting Started, demo accounts, **Nemotron usage** + Token Factory benefits, **other services we use** (Tavily, speech-to-text provider, Cloudinary, Supabase, Render, Vercel, the Canada recalls open data), **operations note** (Render free sleeps after 15 min → GitHub Actions + cron-job.org ping `/health` every 10 min; Supabase kept alive by `/health/deep`), the model-use + feedback table (10.6), disclaimers (AI drafts · not veterinary advice · not a behavior assessment).

---

## Later (only after the P0 path above is done — nothing here blocks the demo)

> New feedback goes here unless it blocks the demo path or makes a false promise. Triage question: *does a judge hit it on the 5-stage path, or does the app say something untrue?*

- **Phase 12 by hand:** one real-phone timing of the sticker cut-out; missing mood samples (two dogs in one photo, a cat, two 5 s clips); designed Goldito stickers from Muk to replace `frontend/assets/stickers/*.png` (same names); run test-guide **SNAP-1 … SNAP-23** once on the deployed app (the full routes were on the deployed backend only after the merge of #90).
- **SR-5 – SR-21 Phase 12 review leftovers** (2026-10-15, detail and step-by-step fixes in [review-2026-10-15.ko.md](review-2026-10-15.ko.md) §3 · §4) — medium first: **SR-5** ✨ Decorate before the layer loads (or after a failed load) and Save wipes your saved stickers · **SR-6** Mood clips pair pets across frames by left-to-right order, so a missed or extra box mixes pets · **SR-7** a report's sitter may write a decor layer forever (needs a migration: `is_sitter_of` on insert / update) and decor items are not checked · **SR-8** owner Snap pets do not reload after Add pet. Then low: SR-9 Recent checks race on the Treat check screen · SR-10 acknowledge can no-op or trap the red modal offline · SR-11 one shared `acknowledged_at` (decide: owner's own flag?) · SR-12 late pick-up → sitter Snap 403 · SR-13 Treat check server hardening (Tavily non-dict, ASPCA source cut, SAFE with unknown ingredients, URL scheme, no overall deadline) · SR-14 Mood server (stray exceptions → 500, `null` tags, summary filter) · SR-15 Mood screen (detector URL `latest`, no timeouts, wrong error text, box label follows the chip) · SR-16 sitter Diary does not reload the owner's stickers · SR-17 cut-out worker fallback / timeout · SR-18 no page scroll while decorating · SR-19 no rate limit on `/api/ai/safety-check` · `/api/ai/pet-mood` (with the Phase 10 fixed accounts) · SR-20 test gaps · SR-21 `supabase/README.md` `013b` row + PR template link

- **Flow findings from the demo-stay walkthrough (2026-10-11)** — **A** done as **ENTRY-1** (2026-10-15) · **E** no arrival check-in between pick-up and the evening note · **F** no notification tiers or quiet hours · owner reaction / question on the daily note (with an AI-drafted reply the sitter approves) is not in the plan · the progress bar and the deadlines (C, D) are the Booking steps (done, PR #79)
- **TRIP-1** A trip the traveler never ends (closed app, dead battery) keeps its last position on the other person's screen (the screen now says "Last location N min ago"): add a sweep (in the `sweep_stale_bookings` cron or its own) that ends `en_route` trips whose `last_at` is older than a few hours, and have the Trip screen show "last seen" when the position is old
- **HOLD-1** The owner's view of a sitter's calendar (ask sheet, Book care month, schedule dots) does not show days another owner holds or has booked while the sitter takes one owner at a time — the owner only learns it when `sitter_unavailable` comes back on Send. Search and the inquiry AI's can-host check already count holds (`011l`); `get_sitter_schedule` should report them as taken for the asking owner
- **BK-1** Sitter Bookings tab landing — every time the tab is entered: the last-clicked tab if it still has a count, else the first tab with a count (Upcoming → Requests → Questions), else the last clicked ([IQ-10](feedback-2026-10-10.ko.md); `bookings.tsx`, `userPicked`)
- **RK-1 – RK-4** Reply kind + owner hint chips: the sitter's reply carries a kind (dates can't work · pet type not accepted · price / policy · yes · other; extends `011k`), the owner thread shows what fits (Change dates, hint chips that fill Write back), and **IQ-15** a one-tap *Use Oct 20 – Oct 22* from a Suggest message (`change_inquiry_dates`). RK-4: "Ask anyway" / "Pick other dates" pattern ([IQ-11 · IQ-15](feedback-2026-10-10.ko.md))
- **IQ-16** Start the sitter's draft on the server (DB trigger / webhook) so closing the owner's window right after Send cannot lose it
- **MG-1 – MG-6** Meet & Greet checklist: rename to "Things to cover", tick saved and shared (`meet_greet_items`, needs a migration), item detail + note, drag to reorder, + to add / drag away to delete, decide whether video mode keeps it ([IQ-8](feedback-2026-10-10.ko.md))
- **CAL-1 – CAL-4** Sitter profile calendar UX (after Muk's Figma pass): no M·A·N marks, tap schedule rolls the calendar up and shows slots, readable slot text, pull the calendar back down ([IQ-13](feedback-2026-10-10.ko.md))
- **Sitter schedule UI/UX overhaul + FB-11** `SlotCalendar` · `ScheduleSheet` · `/sitter/schedule` as one pass: date / time inputs (DESIGN.md §7.10), prices input, open / blocked days, many days at once, hour editing
- **FB-7b** The sitter gets a "Set your prices" notice when an owner hits checkout with no price row (needs a service-role write or migration + RPC; do with FB-11)
- **R60-6** FB-7 still says "doesn't offer that service" when a rates row exists but this service's price is null (`quote_booking` should raise `rates_not_set`)
- **BF.8** 009d `follow_paid_booking_change` counts a still-proposed owner-home handoff in `required_consents` → an unrelated agreed change can reopen checkout early and lock entry codes; count only agreed handoffs. Also note: the trigger swallows `required_consents` / `quote_booking` errors (fine while only user RPCs agree handoffs)
- **BF.9** A reopened checkout still reads like a first payment — when `priceSnapshot` is set, label it "Sign and confirm" and tell the sitter "{owner} signed the new consent"
- **Auto-send delay formula (Seulgi, Q.4)** replace the placeholder `human_delay` (`backend/app/ai/inquiry.py`: 10 s + 0.06 s/char, clamped 15–40 s) with her formula and message split ([phase-07b-inquiry.md](phases/phase-07b-inquiry.md) 7B.10)
- **Native app (after the hackathon)** — keeps sharing in the background while the traveller is in Google Maps (`expo-location` + task manager, an EAS dev build, "always" permission and the store explanation), push notifications for "on the way / arrived", a native map (Apple Maps / Google's default SDK map, no per-load fee), and trip clean-up (TRIP-1). The web build only shares while the traveller's screen is on; the Trip screen already says "Last location N min ago" when it pauses
- **Handoff photo check in the app (P1, only if wanted)** — the API (`POST /api/ai/handoff-check`) and `handoff_checks` are built and tested; dropped from 06B on 2026-10-11 because owner and sitter meet in person. Needs the Take a photo step, the result copy, and real sample photos (`measure_handoff.py` for crate / seatbelt accuracy)
- **IA follow-ups (D47 / D47b)** Feed multi-pet toggle · Diary Live + filters · Diary photo → Feed · Mood stubs · Care in pet detail · Profile Settings · sitter Home dashboard polish · Bookings Past · Profile Earnings
- **Data (Seulgi, Q.3)** Anonymize the 3-year message history (English) → `{PRICE}` / `{DATE}` placeholders → train / validation / hold-out JSONL; `data/raw/` never committed; decide zero-retention + third-party notice (D35, [phase-11-p1.md](phases/phase-11-p1.md) 11.7)
- **11.x P1** after P0 is live, in order: 11.11 Settings + in-app patch notes (CHANGELOG) → 11.1 photo request → 11.10 pet skin → 11.12 8bit Pet status room → 11.8 stickers + report card → 11.9 video mood → 11.13 tone learning loop → 11.14 service-type change → 11.2 notices (11.3 Tavily only if 8.7 slipped) → P2 11.7 SFT
- **Take photo with the computer's webcam** (feedback 10-05 E3, optional) — today Take photo shows only on touch devices; desktop has the sample tray (D25). Useful only for recording the demo video
- **OB.4 (deferred)** `intro_seen` skip — optional, keep Welcome every logout for judges

---

## Meeting agenda (next team meeting — Minsik · Seulgi · Muk)

1. **11.15 is last** — is the approximate plan (S1 10/24–25 … S4 10/26–27) realistic, is the cut order (S4 → S3 → S2) agreed, and when do we record the video (with or without 11.15)?
2. **Speech-to-text** — decided: Groq Whisper, free plan. Only left: check the hackathon Official Rules on third-party services (the rules page was not reachable when we looked).
3. **Quiz wording** (Seulgi) — the 18 questions and four-choice orders in [the spec](pet-profile-onboarding.ko.md) §4; the 20 dog + 8 cat breeds for the curated JSON.
4. **Large-text flow in Figma** (Muk) — question 28 px / options 20 px / 64 px height, the "at a glance" card and the five axis names.
5. **QA feedback as GitHub issues** — everyone uses the QA feedback form; severity labels `blocks-demo` / `false-promise` / `polish`; `ui-polish` for Muk.
6. **Demo accounts for judges** — fixed accounts per starting point; the "two judges, one account" problem.
7. **Demo video** — who records and who edits (proposed: Minsik records, Muk edits), the recording slot around 10/27.
8. **Archive timing** — when the old `feedback-*` / `review-*` documents move to `docs/archive/` (after Seulgi's Q.1).

---

## Design / frontend (Muk)

- Figma frames at **402 × 874** (spot-check 360 / 440) + desktop backdrop / side panel / phone-frame style (DESIGN.md §2.1, 10.9) + sample photo set for 4.7 (daily dog / cat photos for meals · walks · naps incl. `walk_squirrel`, handoff photos — pet at the door, car with / without a crate, empty room; fictional-brand treat labels for Phase 08; no people or plates)
- Scenario screens: inquiry thread + quote card, care request → checklist, Meet & Greet card + sheet, checkout (consents + demo pay), entry-info lock card, trip screen (map + ETA + arrival cards), 5-second check with AI chips + short note, album by category, review, Life Record ([full-process.ko.md](full-process.ko.md))
- Report card themes (4) + preset sticker set (11.8) + coat-color skin presets (6–8 palettes) + 8bit pixel pet sprites (Maltese, generic cat, ≥ 3 states) for 11.12
- Optional: Figma ↔ code workflow note in `frontend/README`
- Open design PRs [#41](https://github.com/minsikpaul92/Goldito/pull/41) (primitives) and [#54](https://github.com/minsikpaul92/Goldito/pull/54) (design system v1): Muk will handle them (agreed 2026-10-10) — do not touch

---

## Phase status

| Phase | Status |
| --- | --- |
| 00 준비 · 01 틀 · 02 DB · 03 인증 · 03B 예약 · 03C 결제 · 04 업로드 · 05 피드 · 06 체크 | done |
| 07 알림장 AI · 07B 문의 AI + RAG · 07C 완료 · 09 캡션 + 앨범 | merged; DoD hand-check pending (Seulgi Q.1) |
| 06B Pet Transit | done, merged ([#83](https://github.com/minsikpaul92/Goldito/pull/83)); `012` applied to the hosted DB (2026-10-12) |
| 08 Safety | moved into Phase 12.1 Treat check (D61) |
| 10 Demo & deploy | frontend on Vercel, backend on Render (U0 done); seed / fixed demo accounts / README / video open — **last**, after 11.15 (decided 2026-10-14) |
| 12 Snap (treat check · mood · sticker) | done, merged ([#90](https://github.com/minsikpaul92/Goldito/pull/90), 12.5 polish in its own PR) — hand checks open, see Later ([phase-12-snap.md](phases/phase-12-snap.md)) |
| 11 P1 | not started — 11.1 and 11.11 picked for 10/17 – 10/23 (2026-10-14); 11.8 sticker-making and 11.9 mood tool pulled into 12 |
| Onboarding UX | OB.1 – OB.3 done; OB.4 deferred; OB.5 with Phase 10 |
| Q Quality track | Seulgi, from 2026-10-09 — [phases/phase-q-quality.md](phases/phase-q-quality.md) |

---

## Hosted DB — still to do

- [ ] **`011l` is applied (2026-10-11); still to do by hand:** `CRON_SECRET` on Render + the 15-minute cron-job.org call to `POST /api/sweep/bookings` ([env-setup.ko.md](env-setup.ko.md)) — without it the 2-day nudge and the 3-day auto-cancel never run.
- [ ] Apply new migrations as they are created and add a line here when a commit creates one (`013` · `013b` are applied, smoke all PASS 2026-10-14).
- [ ] Two-account run of test-guide **INQ-1 … INQ-19** and **REPORT-10** (human, Seulgi Q.1 / Q.8).
- Housekeeping: two git stashes exist (`wip privacy oauth docs` on `feat/onboarding-welcome`, `try-taste-skill: sitter home tweaks + PR59 cherry-pick`) — decide to apply or drop; leave them while undecided. The second sitter style ("Paul", plain, no emoji) is in `scripts/seed_tone.py` but has no account yet — the Phase 10 seed adds it. Advisors report "RLS enabled, no policy" on `knowledge_chunks` / `tone_samples` only: intended (service-role only).
