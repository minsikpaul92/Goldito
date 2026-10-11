# Goldito — Active TODO

> **Rule of this file: it lists only what is still open.** When a task is done, delete its line (CLAUDE.md §5) — the commit, the PR and [test-guide.ko.md](test-guide.ko.md) are the record. No "Completed" section: finished items up to 2026-10-10 are in [../archive/todo-completed-2026-10.md](../archive/todo-completed-2026-10.md) (frozen lookup), later ones in `git log` / `gh pr list --state merged`.
> **Always start by updating `main`** (`git checkout main && git pull origin main`), then read this file ([CLAUDE.md](../../CLAUDE.md) top line).
> **Specs:** each open item's detail lives in its phase doc's **Open items** section ([03B](phases/phase-03b.md) · [03C](phases/phase-03c.md) · [06](phases/phase-06.md) · [06B](phases/phase-06b.md) · [07B](phases/phase-07b.md) · [10](phases/phase-10.md) · [Q](phases/phase-q.md)); this file keeps the order and owners. **Docs rules:** [CLAUDE.md §5.1](../../CLAUDE.md) — tidy this file in every PR. **Git:** one branch + one draft PR per phase, one commit per task ([CLAUDE.md](../../CLAUDE.md) §4.1–4.2). **Testing:** on `main`, at **https://goldito-petcare.vercel.app** (test-guide §1.1).

**Product flow (source of truth):** [full-process.ko.md](full-process.ko.md) — 5 stages, D27–D47 · **Phase index:** [phases/README.ko.md](phases/README.ko.md) · **Blueprint:** [phases/architecture.ko.md](phases/architecture.ko.md) · **Team split:** [work-split-2026-10-09.ko.md](work-split-2026-10-09.ko.md) · **Feedback / review detail:** [feedback-2026-10-08.ko.md](feedback-2026-10-08.ko.md) · [feedback-2026-10-10.ko.md](feedback-2026-10-10.ko.md) · [review-2026-10-08.ko.md](review-2026-10-08.ko.md) · **Other:** [test-guide.ko.md](test-guide.ko.md) · [onboarding.ko.md](onboarding.ko.md) · [tavily.ko.md](tavily.ko.md) · [env-setup.ko.md](env-setup.ko.md) · [Devpost](../hackathon/devpost-submission.ko.md)

**Deadline:** submit by **2026-10-30 10:00 AM PT**. Internal freeze **10/28**. Judging runs to 12/15 (the demo must stay up).

---

## Environment (facts to know before you start)

- **Frontend:** Vercel production **https://goldito-petcare.vercel.app** (auto-deploys from `main`). **Backend:** Render free **https://goldito-backend.onrender.com** — sleeps after 15 min idle (first request 30–50 s); `keepalive.yml` + cron-job.org ping `/health` every 10 min. PR previews are not in CORS.
- **Hosted DB** (Supabase, ca-central-1; dashboard name still `Pawddy`, see [rename-goldito.ko.md](rename-goldito.ko.md)): migrations `010`–`011k` applied. Letters: Minsik `011d` (RV-3, not created) and `011l`; Seulgi `011m`–`011z`; `012` = 06B, `013` = 08. Edit no applied migration.
- **IA reminders:** Diary photo → Feed mirror · Feed multi-pet toggle · Settings/Earnings in Profile · no 6th tab. **Do not** revive OB.4.

---

## Current focus (one task per person — each edits only their own row)

| Who | ID | Task | Doc |
| --- | --- | --- | --- |
| **Seulgi** | **Q.0 → Q.1** | Open **https://goldito-petcare.vercel.app** (normal + private window), Try demo owner + sitter, one demo reset (Profile → Demo tools), then the full manual run with sitter-eye feedback (FB-40+) | [phases/phase-q.md](phases/phase-q.md) §0 · §1 |
| **Minsik** | **FB-35** | decline reason chips + a short optional note (≤ 200 chars) shown to the owner; "Suggest another time instead" inside the decline sheet (sitter side) | [feedback-2026-10-08.ko.md](feedback-2026-10-08.ko.md) FB-35 |

---

## P0 demo path (in order — this is what must work for the video)

**Minsik**
1. **FB-35** (above) → **RV-2** the draft's yes / no must match availability; a "no" is never auto-sent → **RV-3** a declined reply carries no quote / Request booking (`011d`; the sitter-side quick replies in `011k` already send `can_host=false` with no quote — re-check what is left) → **RV-5 rest** (`011l`, written as `011j` in the review but that letter is taken): close other open inquiries when a booking is made, `match_knowledge` returns `pet_id`, backend 409 for a closed inquiry. One commit per ID. [review §4](review-2026-10-08.ko.md)
2. **06B Pet Transit** (`012`) — Start trip with location consent, live position + ETA (Simulate the drive), arrival cards, handoff photo check (MiniCPM-V). **Decided 2026-10-10:** if the person declines (or the browser denies), no live location / map / ETA — both screens show the meeting place + an **Open in Google Maps** button (6B.8). **FB-9 joins 06B (6B.6):** the Returned confirm sheet + the 2-hour guard — the written commit `ade2301` on the closed `fix/booking-flow-feedback` is the starting point. Last P0 feature (D41). [phase-06b.md](phases/phase-06b.md)
3. **R2 (new branch from main):** **FB-8** sitter In progress → **FB-5 · FB-6** time-change sheet (FB-9 moved into 06B). [feedback FB-5 – FB-9](feedback-2026-10-08.ko.md)
4. **10 Demo & deploy** — seed (rates, entry info, routes, past Life Record, tone data + auto mode, meeting spots, a pending draft, a second sitter "Paul"; `--fresh-inquiry`), **fixed demo accounts** instead of Demo tools (below), README **Goldito Agent** section (D46) + Getting Started + demo accounts, **OB.5** judge checklist, **10.9** desktop side panel (Try demo, QR, hint), mouse-only judge path e2e, **10.10 stretch** Split view. [phase-10.md](phases/phase-10.md)
5. **08 Safety guard** (`013`) — P0 **stretch**, only if time remains after 06B + 10; 8.7 Tavily is a further stretch. [phase-08.md](phases/phase-08.md)

**Seulgi — Phase Q** (one at a time in her row; detail in [phase-q.md](phases/phase-q.md)): Q.0 environment → Q.1 full manual run + feedback FB-40+ → Q.2 wording / presets → Q.3 anonymization (+ zero-retention decision) → Q.4 tone data (inquiry + daily report) + auto-send delay formula → Q.4b prompt engineering + RAG-first answers → Q.5 R3 Medium report / caption / Life Record / seed (M-14 · M-20 · M-16 first; M-12 done) → Q.6 R3 Medium inquiry M-1–M-11 → Q.7 measurements → Q.8 final QA (10/27–29, two accounts: test-guide **INQ-1 … INQ-19**, **REPORT-10**; plus the real phone camera on the Vercel URL — Take photo / Choose from library) → Q.9 R4 Low (L-1–L-6, FB-3 · FB-4 · FB-1) → Q.10 SFT (P2). Branches `fix/q-review-medium`, `fix/q-review-low`.

**Before submit (Minsik, human):**
- **Supabase must not pause (10.7①)** — `GET /health/deep` (a `select 1` on Supabase) does not exist yet (`health.py` has only `/health`) and `keepalive.yml` pings only `/health`. Supabase free pauses after 7 idle days and judging is 12/1–12/15, so add the endpoint, point a daily ping at it, and check the project is active before submit. Also turn on **Leaked password protection** in the Supabase dashboard.
- **`/privacy` page** — there is no route yet (the only trace is in a git stash). Needed for Google OAuth "In production" (below) and the submission. Write a short privacy page (what is stored, AI use, demo data) and link it from the OAuth consent screen + Profile.
- **Submission checklist** (phase-10 10.2 · 10.5 · 10.6 · 10.8, [hackathon rules §4](../hackathon/README.md)) — owners proposed, confirm: **demo video** < 3 min, public on YouTube, audio explaining the Token Factory + NVIDIA model use, no copyrighted music (Minsik records, Muk edits; record after Q.8 starts, 10/27) · **Devpost** text + track + **feedback** on Token Factory and every model used (README feedback table, 10.6) · **README** Getting Started + "How we use Nemotron" (10.2) · `docs/DEMO_ACCOUNTS.md` (10.5; passwords only in the Devpost field) · repo public, MIT in About, no real PII · everything in English · internal draft done **10/28**.
- **Demo accounts for judging** — take **Profile → Demo tools** and `POST /api/demo/reset` out (unset `EXPO_PUBLIC_DEMO_TOOLS` + `DEMO_RESET_ENABLED`; delete `components/DemoTools.tsx`, `lib/demoReset.ts`, `e2e/demo-tools.spec.ts`, `app/routers/demo.py`, the CI env line). Replace with fixed accounts per starting point built by the same `demo_reset` code, nothing a judge can delete: empty · pets only · booking accepted, later in care · finished; Try demo buttons pick among them. Open decision: two judges on one account. **R60-3 – R60-5 fold in here** — the reset is not atomic (a failure after the deletes leaves it half-reset; IQ-14 hit this in practice) · extra owner pets over capacity fail the reset · `in_care` fails 00:00–00:57 Toronto.
- **KA-1 keep-alive check** before every deploy, test session or demo recording: Actions → `keepalive` green, gaps ≤ 15 min; cron-job.org `Goldito Keepalive` shows `200 OK`; after 30 idle minutes `/health` answers < 1 s. Keep both running until **12/15**.
- **Google OAuth In production** (Testing-mode refresh tokens expire in 7 days): privacy page `/privacy` + Branding links + Authorized domain `goldito-petcare.vercel.app` → Publish app → one new refresh token in the Render env. Needed before **3B.11**.
- **3B.11 app e2e** Video Meet & Greet on the hosted DB needs a first-time pair and the backend with the Google vars; after the seed adds the second sitter (full-process §9 #14).

---

## Later (only after the P0 path above is done — nothing here blocks the demo)

> New feedback goes here unless it blocks the demo path or makes a false promise. Triage question: *does a judge hit it on the 5-stage path, or does the app say something untrue?*

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
- **Auto-send delay formula (Seulgi, Q.4)** replace the placeholder `human_delay` (`backend/app/ai/inquiry.py`: 10 s + 0.06 s/char, clamped 15–40 s) with her formula and message split ([phase-07b.md](phases/phase-07b.md) 7B.10)
- **IA follow-ups (D47 / D47b)** Feed multi-pet toggle · Diary Live + filters · Diary photo → Feed · Mood stubs · Care in pet detail · Profile Settings · sitter Home dashboard polish · Bookings Past · Profile Earnings
- **Data (Seulgi, Q.3)** Anonymize the 3-year message history (English) → `{PRICE}` / `{DATE}` placeholders → train / validation / hold-out JSONL; `data/raw/` never committed; decide zero-retention + third-party notice (D35, [phase-11.md](phases/phase-11.md) 11.7)
- **11.x P1** after P0 is live, in order: 11.11 Settings + in-app patch notes (CHANGELOG) → 11.1 photo request → 11.10 pet skin → 11.12 8bit Pet status room → 11.8 stickers + report card → 11.9 video mood → 11.13 tone learning loop → 11.14 service-type change → 11.2 notices (11.3 Tavily only if 8.7 slipped) → P2 11.7 SFT
- **Take photo with the computer's webcam** (feedback 10-05 E3, optional) — today Take photo shows only on touch devices; desktop has the sample tray (D25). Useful only for recording the demo video
- **OB.4 (deferred)** `intro_seen` skip — optional, keep Welcome every logout for judges

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
| 00 – 06, 03B, 03C | done |
| 07 Report AI · 07B Inquiry AI + RAG · 07C Completion · 09 Caption + album | merged; DoD hand-check pending (Seulgi Q.1) |
| 06B Pet Transit | not started (Minsik, after FB-35 → RV-2/3/5) |
| 08 Safety | P0 stretch, only if time remains |
| 10 Demo & deploy | frontend on Vercel, backend on Render (U0 done); seed / fixed demo accounts / README / video open |
| 11 P1 | not started |
| Onboarding UX | OB.1 – OB.3 done; OB.4 deferred; OB.5 with Phase 10 |
| Q Quality track | Seulgi, from 2026-10-09 — [phases/phase-q.md](phases/phase-q.md) |

---

## Hosted DB — still to do

- [ ] Apply new migrations as they are created (`011d` RV-3, `011l` RV-5 rest, `012` 06B, `013` 08) and add a line here when a commit creates one.
- [ ] Two-account run of test-guide **INQ-1 … INQ-19** and **REPORT-10** (human, Seulgi Q.1 / Q.8).
- Housekeeping: two git stashes exist (`wip privacy oauth docs` on `feat/onboarding-welcome`, `try-taste-skill: sitter home tweaks + PR59 cherry-pick`) — decide to apply or drop; leave them while undecided. The second sitter style ("Paul", plain, no emoji) is in `scripts/seed_tone.py` but has no account yet — the Phase 10 seed adds it. Advisors report "RLS enabled, no policy" on `knowledge_chunks` / `tone_samples` only: intended (service-role only).
