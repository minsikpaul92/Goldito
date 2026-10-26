# Phase 10: Demo seed · deploy · submission README

> Shared context: [architecture.md](architecture.md): D18 deploy, D19 seed

## Goal

So that judges and the team can reproduce all of "A Stay with Goldito" (the **5 stages (Inquiry → Meet & Greet → Booking → Care & Transit → Completion)** of [full-process.md](../full-process.md)) **within 15 minutes**, finish the **seed data**, the **public demo URL**, the **test accounts**, and the **root README run guide**, and finish the operations prep so **the demo stays up until judging ends on 12/15**. Login UX·Welcome·Try demo are in **[onboarding.md](../onboarding.md)** (linked with OB.3·OB.5).

### Goal met when

- [ ] `backend/scripts/seed_demo.py`: owner, sitter, dog Max (chicken allergy, med 08:00, walk 10:30) + cat Mochi (feeding 09:00, litter 12:00) + Chloe's rate table·policy·Visitor parking + Robert's fictional access info·home coordinates + **a past stay (Paul) Life Record·review** (+ a `--relative` option: the 5 stage scenes relative to the current time)
- [ ] README Getting Started: clone → env → migrate → seed → run → login
- [ ] Public frontend URL (Vercel https://goldito-petcare.vercel.app) + backend URL (**Render** https://goldito-backend.onrender.com; Nebius AI Cloud is not used, D18), production CORS, **confirm the keep-alive ping runs every 10 minutes**
- [ ] Test account doc (for pasting into Devpost)
- [ ] Run the plan to keep it up until 12/15 (keep-alive, limit monitoring)
- [ ] Desktop browser: phone frame + side guide panel, finish the judge path **with the mouse only** (D25) · phone browser: full screen with no frame

---

## Prerequisites

- Scenario core done: Phase 03B · 03C · 04 · 05 · 06 · 06B · 07 · 07B · 09 · 07C (08 is a stretch; if it exists, a (+) demo scene). Backend deploy 10.3 was **moved up to U0 (2026-10-09)** so upload · AI can be hand-tested on Vercel (main), before R1b (the 2026-10-09 work split §2, removed; in git history)
- All Phase 00 keys set in the production env

---

## Scope

| In | Out |
| :--- | :--- |
| Vercel (Expo web export) + **Render** Web Service (Docker, free) + keep-alive ping | App Store / Play builds · Nebius AI Cloud deploy (D18, 2026-10-09) |
| Supabase keep-alive, monitoring | Multi-region HA |
| 3-minute video script outline | Video editing (Muk) |
| Nebius/NVIDIA feedback draft | Final Devpost click (Minsik) |
| Desktop side guide panel (10.9) · Split view (10.10, stretch) | Sitter desktop layout (after the hackathon, D25) |

---

## "A Stay with Goldito" demo script (Goal scenario: [full-process.md §6](../full-process.md#6-demo-path-a-stay-with-goldito))

| # | Stage | Action | Check (the other side's screen) | Phase |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Inquiry | Owner: Chloe's profile → **Ask before booking** (Boarding · 2 pets · includes a holiday · drop-off: Sitter drives · return: Owner drives) → after the reply, **Request booking** | Chloe (auto-send mode) "typing" → about 30 seconds later a reply in the sitter's tone + quote card (holiday·multi-pet) + Life Record source chip / Sitter notification "your draft reply is ready" → request card | 07B · 03C · 03B |
| 2 | Meet & Greet | Owner: **Care request** → AI checklist → Save · they have never met, so Meet & Greet: propose **Video** Oct 6 7 PM → Sitter Accept → **Join Google Meet** link created → Done (if in person, pick from the preferred spot chips) | Sitter request card: "Meet first" · 🚙/🚗 · Heads-up · From Max's Life Record · after accepting, Join Google Meet on both cards · Sitter Accept disabled before the M&G | 06 · 03B (3B.9 · 3B.11) |
| 3 | Booking | Sitter **Accept** → Owner **Checkout**: quote → consent form → **Pay (demo)** | Owner: Chloe's place · Visitor parking · packing checklist / Sitter: "Robert signed and paid" · access info 🔒 "Unlocks …" | 03C |
| 4a | Transit | (seed time = within 2 hours of the pick-up) Sitter **Show code** → **Start trip → Simulate the drive** | Owner `access_unlocked` · map·ETA · "Chloe has arrived" → sitter's in-car sample photo → Vision ✅ → **Received** → Owner "Pick-up complete, care has started · photo verified" | 06B |
| 4b | Care | Sitter: Today check-in (Walk 20 min) · photo **+ Photo** · Report: 2 photos → **chip suggestions** (turn off 1 wrong chip) + a short note → **Generate → approve (Send)** | Owner toast·Activity · feed AI caption · **Album** sorting · Reports daily report | 06 · 05 · 09 · 07 |
| 5 | Completion | Owner **Start trip** (Owner drives) → Simulate → sitter's return photo → **Returned** | Sitter "Robert has arrived" / Owner Visitor parking card → "home safe 🏠" → ★ review → "Life Record updated" | 06B · 07C |
| (+) | Stretch | Sitter Home **Scan a treat** → `chicken_jerky` sample | Red DANGER modal / Owner "Blocked a risky treat" | 08 |

Recording and judging must work at any time → `seed_demo.py --relative`: the pick-up (drop-off) of the confirmed and paid booking = **now + 90 minutes** (access info already unlocked), the return = now + 3 days, med = now+2 minutes, walk = now+6 minutes. To show scenes 1-3 fresh, `--fresh-inquiry` turns Robert ↔ Chloe back into **people who have never met** (deletes the bookings between them so the Meet & Greet of scene ② appears, D44). The live judge path (OB.5) centers on scenes ① and ④, and Meet & Greet is shown in the video. The video is under 3 minutes, so the roughly 30-second human-paced part of scene ① is fast-forwarded in editing and marked with a "~30 s later" caption (the app behaves the same).

---

## Task details

| ID | Task | Details / DoD |
| :--- | :--- | :--- |
| 10.1 | Seed script | **Accounts part done (2026-10-01):** `seed_demo.py` creates·updates demo-owner/demo-sitter + a `--check` read-only check (backend/README "Demo accounts"). **2026-10-09:** for testing, `scripts/reset_demo.py --state empty · pets · confirmed · ready · in_care` (+ app Profile → Demo tools, `POST /api/demo/reset`) was added (#60). **What changes before judging:** remove the reset feature (so judges cannot wipe data) and use the same `demo_reset` code to make **fixed demo accounts per starting point** (empty account · pets only · accepted booking → in care · finished stay) that Try demo picks from; two judges using one account at the same time needs a decision (TODO "Demo accounts for judging"). R60-3 to R60-5 (reset robustness) are absorbed here. Remaining: the pet·booking·task·Paul·sample feed below. `backend/scripts/seed_demo.py` (service role, D19): `auth.admin.create_user` × 2 (`demo-owner@goldito.test`, `demo-sitter@goldito.test`, `email_confirm=True`, password from env `DEMO_PASSWORD`), pet Max (dog, Maltese, 4y, allergy chicken, care_tasks medication+walk), pet Mochi (cat, Domestic Shorthair, 3y, care_tasks feeding+litter), **scenario data (D27):** Chloe `sitter_rates` (Boarding 55 · House sitting 70 · Daycare 35 · +50% · +25%)·`services`·`policies` (3 fictional policy paragraphs)·`visitor_parking`·`lobby_notes`·`home_lat/lng` (fictional coordinates near a park, not a real address), Robert `owner_home_access` (fake lockbox `0000`·buzzer `#000`, obviously fake values)·`home_lat/lng`, 2 `pet_cautions`, 1 `care_requests`, Chloe **tone data** (a fictional sitter style card + `tone_samples` seed: public samples, not the anonymized originals, 7B.8) · `ai_reply_mode='auto'` + `ai_consent_at` (scene ①: human pace right away with no waiting, D36) · 2 `meet_spots` each for Robert·Chloe·Paul (fictional park entrances·cafes, not real addresses, D44) · **1 draft awaiting approval** (an inquiry from the seed-only owner Joy → Chloe, `status='draft'`, to show the Send / Edit / Regenerate screen in the sitter demo, D36), a paid and consented booking (`paid_at`, 5 kinds of `booking_consents`, service role insert), last September's Paul booking (completed) + `pet_life_records` (Max·Mochi) + `reviews` (★5) + RAG indexing (`rag.index_source`), demo home coordinates (seeded in 06B by `demo_accounts.ensure_home_point`; the simulated drive is computed from the two home coordinates, so no route JSON is needed), holiday seed (03C),  sitter_availability open = today-7 days to today+60 days, every slot, capacity 3, slot times = Chloe's default (Morning 08-12 · Afternoon 12-18 · Overnight 18-08), **1 confirmed booking = drop-off yesterday 09:30 (Received done) to return today+6 days 17:00, place Chloe's place (Max + Mochi)**: the times are in the past, so insert `bookings` + `booking_pets` (care_range) + `booking_slots` + agreed `booking_handoffs` together with the service role instead of the RPC (same shape as the smoke test `_t_booking`) → Try demo shows "Now caring" right away + 1 past booking (to show a regular). A fake `home_address`, plus a sitter 2 (Paul) account + open range (for the rebooking search demo), fake emergency contacts in owner_profiles, 2 sample feed posts (optional, shared images in Cloudinary `goldito/demo/`). **Idempotent** (`--reset` deletes the demo account data and recreates it). Zero real PII |
| 10.2 | README | The root README already has the 5-stage flow structure (2026-10-01) + **The Goldito Agent** table (trigger → action → human approval, D46; the video narration uses the same wording). Right before deploy, **compare it with the features actually built** and delete what does not work or move it to "What's Next" (especially the 08 stretch). Getting Started (copy-paste commands, both Windows and mac), update the "How we use Nemotron" table with the real model·latency (07.1·07B metrics), architecture diagram, **5 screenshots, one per stage**. Update the backend/frontend READMEs |
| 10.3 | Deploy backend | **Moved up to U0 and done (2026-10-09), Render free plan**, https://goldito-backend.onrender.com. The Render Web Service watches GitHub `main` and builds·deploys with `backend/Dockerfile` (Root Directory `backend`, Health Check `/health`), env in Render → Environment ([env-setup.md](../env-setup.md) § deployed backend). CI (`ci.yml`) builds the same image on every PR and checks `/health`. **Nebius AI Cloud is not used** (D18: card registration + $25 prepayment, no event credits, about $128 to keep it always on until 12/15; the record of the attempt is in [notes/nebius-ai-cloud-feedback.md](notes/nebius-ai-cloud-feedback.md)). AI inference stays on Token Factory |
| 10.4 | Deploy frontend | **The Vercel connection was moved up to 2026-10-02**: Production **https://goldito-petcare.vercel.app** (auto deploy on every main merge; manual testing also happens here since 2026-10-09), `frontend/vercel.json` + [env-setup.md § Vercel](../env-setup.md). `EXPO_PUBLIC_API_URL` was filled in at U0. Left in 10.4: empty `EXPO_PUBLIC_DEMO_TOOLS` before judging · check the final production env. `npx expo export -p web` → `dist/` → Vercel (SPA rewrite `/(.*) → /index.html`), env `EXPO_PUBLIC_*` production values. Add the Vercel domain to backend `CORS_ORIGINS`. **CD:** Vercel GitHub integration: Root Directory `frontend`, Build `npx expo export -p web`, Output `dist`. A Preview URL for every PR, production on main merge. Allow Preview domains (`*.vercel.app`) in CORS with a regex, or use Preview only to check the UI without a staging backend. **The phone frame is a same-domain iframe**, so when adding security headers do not use `X-Frame-Options: DENY`; CSP is `frame-ancestors 'self'` (D25) |
| 10.5 | Demo account doc | `docs/DEMO_ACCOUNTS.md`: URL, 2 emails; the password is not written in the repo, only in the **Devpost submission field** and the deploy env (`DEMO_PASSWORD` for the seed, `EXPO_PUBLIC_DEMO_PASSWORD` for Try demo: values only for the demo accounts, [onboarding.md](../onboarding.md)) (the repo says "see submission"), 5 lines of demo order |
| 10.6 | Feedback log | README feedback table: Token Factory, AI Cloud (why we tried it and stopped: [notes/nebius-ai-cloud-feedback.md](notes/nebius-ai-cloud-feedback.md)), per Nemotron model (use / what worked / what to improve / onboarding / would use again): organize the notes collected in `notes/` during development |
| 10.7 | Keep-up plan (to 12/15) | ⓪ **Keep Render from sleeping (2026-10-09):** Render free sleeps after 15 minutes with no requests and the first request then takes 30-50 seconds → `.github/workflows/keepalive.yml` hits `/health` **every 10 minutes** + **cron-job.org `Goldito Keepalive`** every 10 minutes (registered 2026-10-09). **Before deploying · testing · recording video, check that the ping is alive** (Actions run interval ≤ 15 minutes, response within 1 second) · ① Keep Supabase free from pausing: once a day on the same cron → backend `GET /health/deep` (runs Supabase `select 1`; keep `/health` light) ② Check the Cloudinary·Nebius credit balance once a week (one screenshot ≈ a cost sheet) ③ If demo account data gets dirty, `seed_demo.py --reset` |
| 10.8 | Internal deadline 10/28 checklist | All of the DoD below + video upload (YouTube public, < 3 minutes, English voice) + Devpost draft |
| 10.9 | Desktop side guide panel (D25) | `components/shell/SidePanel.web.tsx`: next to the phone frame in framed mode: logo + one-line intro, hint "Click = tap · Drag or scroll = swipe", **Try demo as Sitter / Owner** (moves the iframe to `/login?demo=sitter`·`?demo=owner` → reuses the OB.3 auto login), **Open on your phone** QR (deploy URL, static image), video·GitHub links, (after 10.10) **Show both phones**. If the window is < 1100 wide, the panel goes below the frame. DoD: Chrome·Edge·Safari·Firefox × 1366×768·1440×900·1920×1080 + Windows 125%·150% scaling, frame·panel not cut off, every panel button works on click |
| 10.10 | ✅ 2026-10-15 (approach A: one phone by default, judge link `?view=split`; SPLIT-1 to 5 checked by a person) · Split view: Owner·Sitter phones side by side | `?view=split` (or the panel's **Show both phones**) → 2 frames, each iframe `name="pane-owner"` / `"pane-sitter"`. The inner app knows its pane from `window.name` and uses a Supabase `auth.storageKey` per pane (`getAuthStorageKey()`, 3.1) → two demo accounts logged in at the same time (Try demo runs automatically per pane). If the window is < 900 wide, normal framed. DoD: on one 1440×900 screen, sitter **Complete with photo** → toast on the owner's phone ≤ 3 seconds, the 5-stage demo script with no incognito window · also used for video recording |

---

## Definition of Done (DoD)

1. **Cold start:** a teammate runs it locally on a new PC from the README alone
2. **Judge path:** in a desktop browser, demo URL → phone frame + test owner/sitter login → demo script 1-5 succeeds **with the mouse only** (one screen in Split view if 10.10 exists, otherwise 2 incognito windows). Photos from the sample tray (4.7), travel with **Simulate the drive** (D32); (if 08 is done) the scan gives DANGER with the `chicken_jerky` sample. Run the same path once as a Playwright e2e against the production URL ([DESIGN.md §7.7](../../../DESIGN.md#77-works-with-a-mouse))
3. MIT license shown in GitHub About
4. Submission materials in **English** (description, video audio, README)
5. `/health` 200 at the deploy URL, first response < 10 seconds including cold start
6. Merge a PR with a 1-line backend change → reaches production with no manual step (CD check), Vercel Preview URL shown on the PR
7. On a phone (iPhone·Android), demo URL → full screen with no frame, the same path works with touch

---

## Deliverables

- `backend/scripts/seed_demo.py`, `backend/Dockerfile`, `.github/workflows/keepalive.yml`
- `docs/DEMO_ACCOUNTS.md`
- `frontend/components/shell/SidePanel.web.tsx` (10.9), split view in `AppShell.web.tsx` (10.10), `frontend/e2e/judge-path.spec.ts`
- Updated root `README.md` (Getting Started + Nemotron usage + Nebius services + Feedback log)

---

## AI prompts

Playbook §12: seed (10.1) / deploy backend (10.3) / deploy frontend (10.4), each separate

---

## README rewrite plan (decided 2026-10-11; written right before submission, 10.2)

> As soon as a judge opens the README they must see **"Why this when apps already exist?" and "Why AI?"**. Below is the plan from brainstorming and a draft of the top block (not final).

**Decided**

1. **Product first, the story in the top two lines.** Put the two story lines (why we built it · why AI) at the **very top** of the README, and right below them the title · one-line intro · demo link. No long telling.
2. **Do not name competitors.** Write the difference not as *whether a feature exists* but as **"who does the work"**: apps on the market connect people and take a fee on every booking, but during the stay the replies · rules · daily notes are typed by people. **Do not say how much fee we take or that we take less** (we have not built any; demo payment only). If we want to say more about fees, only as a vision in What's Next.
3. **Evidence from experience:** "dozens of stays, the same pets many times." No numbers. Write the senior story as an **observation** ("in our experience"), not a statistic.
4. Put one line on **reasons to stay in the app (features beyond sitting)** under the 5-stage strip: **state only what is built now as fact**, and mark plans as "coming" (below).
5. **Change the Korean version (`README.md`) too.**
6. The first-screen image/GIF (inquiry → AI draft → approval) **later** (with the video).
7. Right before writing, check every sentence against the [test-guide status table](../test-guide.md) and **delete what is not built or mark it "coming"** (the existing 10.2 rule).

**Top block draft v0 (EN)**

```md
> **Why we built this.** After dozens of stays as pet sitters, many with the same dogs and cats, we kept seeing the same thing: apps connect owners and sitters, and take a cut of every booking, but the stay itself (replies, house rules, daily notes) is still typed by hand, and a lot of it happens outside the app.
> **Why AI.** In our experience, owners who find typing hard (often seniors) leave their pet's profile half empty, and sitters spend their time writing instead of caring. Goldito's AI does the typing; people approve.

# 🐾 Goldito
**Leave your pet, keep your peace of mind.** The whole stay, inquiry to the ride home, in one app, for dogs and cats.
[Live demo](https://goldito-petcare.vercel.app) · Demo video · Test accounts · *Nebius x NVIDIA Global AI Hackathon: Best Apps and Agents*
```

Below it: ① "Why it matters" in two columns: **Owner:** your pet's status arrives on its own, without asking · **Sitter:** replies, notes and checklists are drafted for you, details aren't missed, more time to care → ② the 5-stage strip (one sentence per stage on what the AI does) → ③ **More than sitting** (below) → ④ the existing details (How It Works, Agent table, Nemotron use, architecture, Getting Started).

**More than sitting: reasons to stay in the app (the rule when writing the README)**

| Built now (fine to state as fact, recheck before submitting) | Planned (only as "coming" in the README) |
| :--- | :--- |
| Feed album (date · category) · Diary (the sitter's diary + daily report) · **Pet Life Record** (carries over to the next sitter) · favorite sitters · reviews (both ways, the sitter's private note) · notifications | Mood meter (for fun) · 8-bit Pet room · stickers · card daily report · photo request · pet skin · "Max at a glance" onboarding right after sign-up (11.15: built last, may be cut) |

Example (EN): *"Between stays, Goldito keeps the pet's story: a photo album, a diary, and a Life Record that follows the pet to any sitter. Coming next: a mood meter and an 8-bit pet room."*

---

## Open items (remaining follow-up work: the spec is here, the order is in [GitHub issues](https://github.com/minsikpaul92/Goldito/issues))

| ID | What | Owner |
| :--- | :--- | :--- |
| **10.1 Fixed demo accounts** | Remove Profile → Demo tools · `POST /api/demo/reset` (turn off `EXPO_PUBLIC_DEMO_TOOLS` · `DEMO_RESET_ENABLED`, delete `DemoTools.tsx` · `demoReset.ts` · `demo-tools.spec.ts` · `routers/demo.py` · the CI env lines) and replace them with fixed accounts per starting point (empty · pets only · accepted→in care · finished). Needs a decision: two judges using one account at the same time. **Absorbs R60-3 to R60-5:** the reset is not atomic (if it fails after deleting, it is half reset; we actually hit this locally) · the owner's extra pets go over capacity and the reset fails · `in_care` fails in Toronto 00:00-00:57 | Minsik |
| **10.1 Seed fill-in (after 11.15 S1)** | Fill `pets.profile` (personality answers · safety answers) of the demo pets Max · Mochi in the seed, so the "at a glance" on the sitter card shows without the sign-up flow. Skip if S1 is cut | Minsik |
| **10.7 Fill-in** | ① ~~`GET /health/deep` and a once-a-day ping~~: built (`health.py` · `keepalive.yml`, works once Render deploys after the merge; Supabase free pauses after 7 idle days and judging is 12/1-12/15) ② Turn on **Leaked password protection** in the dashboard ③ **KA-1**: before deploying · testing · recording, check the `keepalive` interval ≤ 15 minutes and cron-job.org `200 OK`, keep it until 12/15 | Minsik |
| **10.11 `/privacy` page** (built: `frontend/app/privacy.tsx`, linked from Welcome · Profile; remaining: put the URL in the OAuth consent screen Branding) | ~~The route does not exist yet.~~ A short privacy page on what we store · AI use · demo data, linked from the Google OAuth consent screen and Profile (needed for OAuth "In production"; Testing tokens expire in 7 days; domain `goldito-petcare.vercel.app`) | Minsik |
| **10.12 Submission checklist** | Based on [hackathon rules §4](../../hackathon/README.md): demo video (< 3 minutes, public on YouTube, voice explaining Token Factory + NVIDIA model use, no copyrighted music; Minsik records · Muk edits proposed, needs confirming, record 10/27) · Devpost description + track + Token Factory · feedback per model used (10.6) · README Getting Started + "How we use Nemotron" (10.2) · `docs/DEMO_ACCOUNTS.md` (10.5) · public repo + MIT shown in About + no real PII · all in English · **internal draft 10/28** | Minsik · Muk |

---

## Next

→ [Phase 11: P1 features](phase-11-p1.md) (only after the P0 demo works at the deploy URL)
