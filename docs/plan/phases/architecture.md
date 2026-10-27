# Goldito P0: shared design blueprint (every phase follows it)

> Every phase doc is written **on top of the decisions, structure, and rules in this doc**.
> If this doc disagrees with README.md §9 Data Model (summary) or the Playbook, **this doc + the phase doc win**.
> To change a decision, fix the §1 decision log in this doc first, then update the affected phase docs with it.
> **The source of truth for the product flow (5 stages: Inquiry → Meet & Greet → Booking → Care & Transit → Completion) is [the README, How Goldito works](../../../README.md#how-goldito-works)** (D27 to D47). This doc sets the structure and rules that build that flow.

---

## 1. Decision log (final)

| # | Topic | Decision | Reason |
| :--- | :--- | :--- | :--- |
| D1 | Demo, UI, and AI output language | **English only (EN)**. UI strings, AI captions, daily reports, and warnings are all in English | Judges and the video are in English. The real few-shot source is also **English**; Seulgi commits it only to `few_shot.json` after **anonymizing it (PII removed)** |
| D2 | Frontend routing | **expo-router** (file-based, TypeScript) | Web URL = screen. Easy to split route groups by role |
| D3 | Package management | Frontend **npm**, Backend **requirements.txt + venv** | Hackathon speed |
| D4 | Python version | **3.12** (same locally and in Docker). 3.14 risks packages without wheels | Reproducibility |
| D5 | Data access pattern | **Option A:** frontend = Supabase JS + RLS (reads, simple writes), FastAPI = Cloudinary signing, AI, work that needs the service role | CLAUDE.md §2 |
| D6 | Writes that mix permissions | Handle with a **DB function (RPC, `security definer`) or a trigger**. Do not give the client broad update policies | Simpler RLS, no inserting notifications for other people |
| D7 | Creating notifications | A **DB trigger** inserts into `notifications` (no inserts from the app layer) | So a sitter cannot insert an owner's notification directly |
| D8 | Time zone | App-wide `APP_TIMEZONE=America/Toronto`. "Today" = 00:00 to 24:00 in this zone | Consistent task_logs creation and daily report totals |
| D9 | missed status | **Derived, not stored**: `status='pending' AND now() > due_at + 60 min` | Meets P0 without a scheduler |
| D10 | Feed post : media | **1 post = 1 media** (`feed_posts.media_id`). Multiple photos are P1 | Simplicity |
| D11 | Caption location | Only `feed_posts.caption` (no `media.caption`) | No duplication |
| D12 | AI image input | The backend gets a `w_1024,f_jpg` transform from Cloudinary and passes it to the model as a **base64 data URL**. Video uses an `so_0` thumbnail jpg | Does not depend on whether the model server can fetch outside URLs |
| D13 | Safety input | The ingredient label also goes up through the **normal upload pipe (Phase 04)**, then `POST /api/ai/safety-check {pet_id, media_id}` (not multipart) | Reuses upload code, keeps the evidence image |
| D14 | JWT verification | Supabase **JWKS** (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, ES256/RS256) first; for a legacy project, fall back to `SUPABASE_JWT_SECRET` (HS256) | New projects use asymmetric keys by default |
| D15 | Profile creation | An `auth.users` insert trigger creates `profiles` from `raw_user_meta_data.role/display_name`. **Confirm email OFF** | Avoids having no session right after sign-up |
| D16 | Sitter assignment | ~~Fixed assignment by sitter email~~ → **replaced by D24 date-range bookings** (2026-09-29) | Real pet sitting is by trip period |
| D17 | Reminders (P0) | **Client in-app reminders**: while the sitter app is open, check due items every 30 seconds → banner + toast. Server push is a stretch (6.7; Nebius AI Cloud is not used, D18) | Reproduces the demo's 08:00 segment without a scheduler |
| D18 | Deployment | **Backend API:** **Render** Web Service (Docker + FastAPI, free plan, auto-deploy from GitHub `main`, `backend/Dockerfile`). **Frontend:** `expo export -p web` → **Vercel**. **Nebius AI Cloud (Serverless Endpoint · Jobs) is not used**: decided 2026-10-09 (at first, on 2026-09-29, AI Cloud was the main plan and Render the fallback) | All AI inference is on **Token Factory** (meets the hackathon's "Runs on Nebius": either runtime calls or an AI Cloud deployment is enough). AI Cloud required a card and a $25 prepayment, the event credits were not on the account, and the endpoint stays on, so about $128 until 12/15 → Render free is $0. The free plan sleeps after 15 minutes with no requests, so **ping every 10 minutes** (D20 keep-alive). Lessons in [notes/nebius-ai-cloud-feedback.md](notes/nebius-ai-cloud-feedback.md) |
| D19 | Creating seed accounts | Python + Supabase Admin API (`auth.admin.create_user`); never insert into auth.users directly with SQL | Password hashes and triggers work properly |
| D20 | CI/CD | **CI:** GitHub Actions `ci.yml` (PRs and pushes to main): backend ruff+pytest, frontend tsc+web export+Playwright mouse tests (1.7). **CD:** frontend = Vercel Git integration (PR Preview, auto-deploy on main), backend = **Render Git integration** (on merge to main, build and deploy with `backend/Dockerfile`, Health Check `/health`). **Keep-alive:** `keepalive.yml` calls `/health` every 10 minutes (keeps Render free from sleeping). **DB migrations are manual** (SQL Editor, in order) | Avoids changing the production DB automatically during the hackathon, keeps workflows minimal. **Playwright runs on a PR only when app code changes** (app · components · features · lib · e2e · package config, etc.; a PR that only changes docs or scripts runs just the tsc · What's New · screen map checks). A push to main always runs everything + Firefox · WebKit. |
| D21 | Profile structure | Shared `profiles` (id, role, display_name) + a 1:1 table per role: `owner_profiles` (emergency contact, vet) / `sitter_profiles` (bio, service area, experience). The sign-up trigger also creates the row that matches the role. Sitters care for both dogs and cats (no species limit) | Clean RLS and forms per role. Avoids a mix of nullable columns |
| D22 | Species support | **Dogs and cats**: `pets.species in ('dog','cat')`, cannot change after creation. Every FK and API field is `pet_id` | The product targets dogs & cats. Adding species later only widens the check |
| D23 | Care by species | `care_tasks.type in ('medication','walk','feeding','litter','play','sleep')`. `walk` = dogs only, `litter` = cats only (trigger `guard_care_task_species`). The safety toxin list is also per species (phase-08) | Blocks wrong data like a cat walk, covers cat-only toxins (lilies, etc.) |
| D24 | Part-time boarding sitter · slots · handoff | The sitter is **part-time** and cares for pets **at the sitter's home**. Slots have **fixed names only** (Morning · Afternoon · Overnight); the sitter sets the exact hours of each slot (`sitter_availability.starts_at/ends_at`) + slot capacity `max_pets`. Booking = 1 sitter + 1 owner. **Who has the pet when** = `booking_pets.care_range` (the care range, no overlap per pet: an exclusion constraint), **capacity** = `booking_slots` (pet × date × slot, by that sitter's slot hours). When open rows overlap, the **most recent row** sets that day's hours and capacity. A slot the sitter did not open is taken only when the care range covers more than half of it (prevents an empty Overnight); a short bit of time sticking out before or after is agreed as a custom time. The owner sets the **drop-off time, pick-up time, and place** (sitter's home / owner's home / other) → `booking_handoffs`. Times outside the sitter's hours or a place change are **agreed** (proposal → the other side agrees); a change after confirmation is also proposal → agreement, and the old values hold until agreed. By default the owner books **the whole trip with one sitter**: the regular sitter's schedule first, otherwise search (fully available first). If the sitter tries to block a confirmed slot, it is refused → **cancel the whole booking** (only before drop-off; after Received, change the pick-up time instead) → the owner rebooks. Permissions and task ownership are decided by the **drop-off time to pick-up time** range, not by slots. Schedule changes send no notification. The address goes only to the confirmed parties (until 24 hours after pick-up) | Changing sitters is stressful for pets → one sitter is the default. The real drop-off time can differ from the sitter's working hours, so it needs agreeing |
| D25 | Web display (desktop = phone frame) | On a computer browser (mouse or trackpad is the main input, not `pointer: coarse`, **whatever the window width**) the **same app runs in a same-origin iframe** inside a **402 × 874 phone frame** (`components/shell/AppShell.web.tsx`; on native, `AppShell.tsx` renders children as is). **Split view (10.10, 2026-10-15):** `?view=split` + window width ≥ 900 gives two phone frames (iframe names `pane-owner` · `pane-sitter`, the sign-in storage key is also per pane: `getAuthStorageKey()`); the default is one phone. Phone browsers, native, and the inside of the iframe show the app as is. Inside the iframe, **only with a mouse**, `TouchEmulation`: drag to scroll + momentum, block the click after a drag, wheel turned into sideways scrolling on horizontal rows, no text selection or image dragging, round cursor, hidden scrollbars. Photo picking is one `pickMedia()`; desktop and demo accounts get the sample photo tray (4.7). The mode is decided in one place, `resolvePresentation()`; screens branch only with `useLayoutMode()`; tabs are expo-router JS `Tabs` (not NativeTabs). **After the hackathon (lowest priority):** a desktop `expanded` layout for sitters only (sidebar, no iframe); Owner stays in the frame | Judges watch on a PC → same experience as a phone + every action must work with a mouse. If the app is put straight into a box, RN `Modal` and Expo Router web modals portal to `document.body` (a web modal becomes a desktop dialog at `min-width: 768px`), and window size and media queries follow the browser, so it breaks (checked in the react-native-web 0.21.2 and expo-router 57.0.24 source). Inside the iframe it is a real phone screen, so there are almost no per-screen rules to follow. 402 = width of the current base iPhone (17); layouts support 360 to 440 |
| D26 | Role area URLs | Role screens use **URL prefix folders**: `app/owner/*` → `/owner/*`, `app/sitter/*` → `/sitter/*` (no route groups `(owner)`/`(sitter)`). `(auth)` and `(public)` stay groups because their URLs do not overlap (`/login`, `/signup`, `/welcome`). Read `/(owner)/x` in older docs as `/owner/x` (changed everywhere 2026-10-01) | Both roles have `tasks`, `bookings`, `notifications`, `pets/[petId]`, so with groups alone the URLs are the same. expo-router accepts this as a "shared route" without an error and **on refresh or deep link renders the first group alphabetically** (owner) → a sitter who refreshes `/tasks` is stopped by the owner guard and loses the screen. For D25 address-bar sync (same screen after a refresh) to hold, each URL must be unique per role (checked in expo-router 57 `getRoutesCore` · `getStateFromPath`) |
| D27 | Product flow = Full Process 5 stages | The product, root README, demo video, and work order follow **Inquiry → Meet & Greet → Booking → Care & Pet Transit → Completion** in [the README, How Goldito works](../../../README.md#how-goldito-works). Existing features fold into stages: care feed, album, checks, daily report = Stage 4; booking and handoff (D24) = Stages 2-3. **Treat Safety Guard (Phase 08) is a Stage 4 helper feature and a P0 stretch after the scenario core (03B to 07C)**; the P2 Q&A (old 11.4) folds into the Stage 1 inquiry AI (07B) | Team scenario first (2026-10-01). A product that reads as one flow scores better on judging "Potential Impact" and "Design" |
| D28 | Service type · transport mode | `bookings.service_type in ('boarding','house_sitting')` (default `boarding`). The types a sitter offers are in `sitter_profiles.services text[]`. **Transport mode = another name for the handoff place (D24):** `sitter_home` = **Owner drives**, `owner_home` = **Sitter drives**, `other` = both travel. For `house_sitting`, the drop-off and pick-up place is fixed to `owner_home`. House sitting uses the same slot capacity math as boarding (P0 simplification; drop-in visit capacity is after the hackathon) | Reuses the proven handoff model without a new state |
| D29 | Quote = server math | Sitter rate card `sitter_rates` (boarding per night · house sitting per night · daycare per day, extra pet %, holiday %, CAD) + `holidays` (Ontario statutory holidays) → SQL `quote_booking(...)` builds the line-item JSON. **AI never makes up or computes numbers**: the inquiry reply (07B) uses the values in this JSON as is, and the quote card under the reply and Checkout (03C) show the same values | Prevents price hallucination, numbers match across screens |
| D30 | Consents · payment (demo) | **Rules decide** which consents are needed, from the service and transport mode (not AI): `emergency_vet` (limit), `home_access` (lockbox · key · buzzer · fob), `cohabitation` (pets housed together), `handoff_rules` (times · Visitor parking), `safe_return` (who receives the pet at return). Text = **fixed English template + version**, checkbox + typed-name signature → `booking_consents`. The screen says "Demo template, not legal advice". **Payment is demo only**: no card details, `pay_booking_demo` → `bookings.paid_at` + quote snapshot. Real payment (Stripe) is after the hackathon | Legal text written by a model is risky; no reason to handle card details at a hackathon |
| D31 | Conditional unlock | ① **Owner's home entry info** `owner_home_access` (lockbox code · buzzer · fob · entry steps · sitter parking): owner-only RLS. The sitter gets it only through RPC `get_home_access(booking)`, when: paid + the sitter of that booking + from **2 hours before** a handoff at the owner's home (or the start of house sitting) **to the end of the booking (pick-up done)**. Outside that: `access_locked` + `unlocks_at`. The first open records `access_reveals` + owner notification `access_unlocked`. ② **Sitter's home info** (address · Visitor parking · lobby directions · packing checklist): to the owner right after payment, until 24 hours after pick-up (`get_handoff_details` condition changes from "confirmed" to "paid"). ③ Entry info **never goes into RAG, AI prompts, notification text, or logs** | Scenario: "not revealed right away even after payment", minimal exposure |
| D32 | Pet Transit (live trip) | The side that travels taps **Start trip** → `trips` keeps **only the last position** (no route history; position null when done) → the other side subscribes through Realtime (`postgres_changes` on `trips`, RLS = booking parties). ETA = straight-line distance × 1.3 ÷ speed (car 30 km/h, walking 4.5 km/h); no routing API. Arrival = within 150 m of the destination → `trip_arrived`. Destination coordinates = the profile's `home_lat/home_lng` ("Use my current location", one OSM Nominatim lookup when the address is saved (`/api/geo/geocode`, no key), or made-up seed coordinates). Map = **view-only** Leaflet + OpenStreetMap (web, auto-fit + ± buttons, no drag pan: D25 mouse rule). Location source = real GPS on a phone, **Simulate trip on desktop and demo accounts** (plays a made-up route) | Judges' PCs have no moving GPS; location goes only to the parties while traveling |
| D33 | Vision · embedding models | The scenario's Qwen-2.5-VL is **not** in the Token Factory catalog (2026-10-01 `GET /v1/models`) → photo analysis (captions · categories · handoff check · daily report photos) uses **`nvidia/Nemotron-3.5-Super-VL`** (global base URL, thinking off; since 2026-10-27, measured in [model-ids.md](notes/model-ids.md). Before that, and as the rollback: `openbmb/MiniCPM-V-4_5`). RAG embedding = **`Qwen/Qwen3-Embedding-8B`** (the only embedding model in the catalog, `dimensions: 1024` confirmed working) → Supabase **pgvector** `knowledge_chunks vector(1024)` (HNSW), service role only. Search is always filtered to that sitter, that pet, and that owner | Based on the catalog ([model-ids.md](notes/model-ids.md)). 1024 dimensions fits under the pgvector index limit (2000) |
| D34 | Sitter 5-second check | Sitter input = chips (meal · potty · walk minutes · medication) + photos ≤ 2 + **optional one-line note (≤ 120 chars)**. Still no required text input (§8-3) | The scenario's "short note": material for the daily report's story (D38 adds "AI writes first, the sitter only optionally edits or adds") |
| D35 | Sitter tone layer | Natural-language AI output the owner sees (inquiry replies · daily reports · captions) is in the **sitter's first-person tone**. Composed in one place, `backend/app/ai/tone.py`: style guide + top-k `tone_samples` of the same sitter (few-shot, `MODEL_EMBED` search). Seed = 3 years of anonymized conversations (English); after that, it is updated by logging when the sitter sends as is / edits / regenerates (the edit ratio is the metric). **Fixed text (safety warnings · quote numbers · consents) is excluded**; numbers go in as `{PRICE}` · `{DATE}` placeholders that the server fills. SFT is a showcase only (D43, 11.7) | Per-sitter tone without swapping models. Details in [the README, How Goldito works](../../../README.md#how-goldito-works) |
| D36 | Sitter approval · AI disclosure | Default = manual approval (Send sends right away). Auto-send = a sitter option + a responsibility consent modal (`sitter_profiles.ai_reply_mode`, `ai_consent_at`); when on, it sends without waiting, at human pace (2026-10-02). The owner's screen shows it as the sitter's message (no per-message AI label), disclosed once in the terms and onboarding, one line on the profile in auto mode. When asked "Is this AI?", it never answers that it is a person | An approved message is the sitter's message |
| D37 | Human-paced delivery | Only for auto-send and the demo video: `inquiry_messages.visible_at` (a future time) + a typing indicator. The read mark comes only from `read_at` (when the sitter really opened it); no fake reads (2026-10-02). The server creates and saves right away and **only delays the time it becomes visible** (no serverless sleep). Delay formula and message structure = Seulgi, TBD. Daily reports, captions, and manual approval have no delay | Safe within serverless request lifetimes |
| D38 | Near-zero sitter writing (revised 2026-10-02) | Daily report: AI suggests chips from the day's records and photos (`/api/ai/report-chips`) → the sitter picks (turns off wrong chips) + a short note (optional, ≤ 200 chars) → AI writes in the sitter's tone → posted after the sitter approves. Inquiry: intent chips + Send. Notes and edits are always optional | UX principle 5: photo analysis can be thin or wrong |
| D39 | Model policy | US models first and NVIDIA models first; Chinese models only when there is no alternative or a big cost/value gap, + the reason recorded in `model-ids.md`. Exceptions: embedding Qwen3-Embedding (**final 2026-10-02, no other embedding models compared**), vision is NVIDIA since 2026-10-27 (`Nemotron-3.5-Super-VL` reached the shared API; before that MiniCPM-V, because the 3 earlier NVIDIA vision models are Dedicated-Endpoint-only at $48-113/day). Chinese models that NVIDIA only quantized (GLM · MiniMax · Qwen NVFP4) do not count as NVIDIA models | Hackathon track + preference |
| D40 | Change requests after confirmation | Service and transport mode are fixed at confirmation. Either side can request a change; the other side must approve; if declined, only the change request is cancelled (the booking stays) | Prevents one-sided changes |
| D41 | Location sharing consent · scope | Start trip → in-app consent (to whom · until arrival) → browser permission. P0 web shares only while the screen is on. 06B is the very last P0 phase (right after 07C, before the 08 stretch; 2026-10-02); judging uses the demo video (Simulate trip stays). Launch = native app + location consent up front. **If consent or permission is denied (2026-10-10):** no live location or ETA, only the meeting place + an Open in Google Maps link button | Fits within Supabase Realtime Free (200 concurrent, 2 million messages a month) |
| D42 | Fun mood meter (P1 → Phase 12, **partly changed by D61: negative emotions in % too**) | A "for fun" line is required, the server computes behavior tags + frame ratios, no percentages for negative emotions. Candidates = vision model tags (A) + `agentmish/dog-emotion-classifier-v2` (Apache-2.0, B). Dropped if cost or license is a problem | Non-core feature for impact (11.9) |
| D43 | SFT is a showcase only | The app's runtime tone uses only Nemotron + the tone card + few-shot (D35). The fine-tuned model is not connected to or served in the app (a tuned Gemma 4 needs a Dedicated Endpoint, and new data is short too). 11.7 = README Future work + a data format spec, one training run if there is data (optional) | Shows the room to grow without always-on serving costs |
| D44 | Meet & Greet rules | **Only for an owner and sitter meeting for the first time** (when they have never done a handoff in an earlier booking or finished an M&G): `request_booking` sets `meet_greet_status` to `required` / `not_needed`. It comes after the booking request and before the sitter accepts; `respond_booking` can accept only after done or skipped (`meet_greet_required`). In person = pick one of either side's `meet_spots` (≤ 3 each, public places) + a time; home addresses stay private until payment (D31). Skip = one side asks → the other sees "Continue the booking without a Meet & Greet?" → if declined, `cancel_booking` (reason `meet_greet_declined`) + the owner gets Find a new sitter | Builds trust the first time; regulars skip it (2026-10-02 Minsik) |
| D45 | Video Meet & Greet = Google Meet | The moment a time is agreed (accept), FastAPI `/api/meet-greet/video-link` creates an event + Meet link with the **Google Calendar API** `events.insert` (`conferenceDataVersion=1`, `conferenceData.createRequest`, `conferenceSolutionKey.type="hangoutsMeet"`) and emails an invite to both sides (skipped for demo `.test` accounts) → it lands in each person's Google Calendar. Organizer = one Goldito Google account (OAuth refresh token in the backend env, OAuth app publishing status **In production**; Testing expires in 7 days). Time change = `events.patch`, cancel = `events.delete`. The link opens in a new tab (no iframe). On failure: time + .ics + paste a link. A service account alone is often blocked from creating Meet links, so it is not used | Works in any browser or phone without installing an app, auto-added to calendars, no extra cost |
| D46 | How we describe the agent | Keep the P0 structure (the server gathers the facts, one call per feature). In the README, video, and Devpost, describe it as **an agent that acts on its own whenever something happens, with a person approving** (trigger → action → approval table). Tool calling is optional and only for 07B, if 7.1 confirms it works on Token Factory (7B.11); the number-check and no-entry-info rules stay | The track (Best Apps and Agents) + the last sentence of the original, keeps it stable |
| D47 | Owner tab IA · Feed vs Diary | **Keep 5** owner tabs: `Home · Bookings · Feed · Diary · Mood` (→ **Snap**, D61). **Feed** = permanent pet album (Instagram-style grid → detail; both owner and sitter post; pet chips = select/deselect multi-toggle, with both on they merge by date and time; stays after care ends). **Diary** = care/journal stream (what I write + while the pet is away, sitter updates in time order as Live/On air; history filters by pet, sitter, date). **A Diary entry with a photo is mirrored to Feed** (same media/post). The old Care tab is gone → Care request from **Home → pet detail** (details later). Old Reports tab = Diary. **Mood** = the 5th slot (placeholder → 11.9 photo/video mood, Fun only). **Settings is not a tab**: it sits inside the header avatar `/profile` (merged with 11.11). The notification bell stays in the header. Sitter = **D47b** | Care and Reports were thin as tabs; keeps the Live and album mental models apart (2026-10-04 Minsik) |
| D47b | Sitter tab IA (**final**) | Sitter **5 tabs:** `Home · Bookings · Feed · Diary · Mood` (→ **Snap**, D61) (mirrors Owner; old Today → **Home**). **Home** = dashboard: (A) if caring for a pet now, centered on that pet's info and quick actions · (B) otherwise **requests waiting for approval** · **Upcoming** · **drop-off/pick-up in time order**. Later, a **tamagotchi/8-bit status** during care (11.12). Old Tasks folds into Home (to-dos) and Diary (done records). **Bookings** = requests · Meet & Greet · Past. **Feed** = + Photo. **Diary** = stay log + evening chip daily report (old Report). **Mood** = same as Owner. Treat scan = a Home button (08). Settings = Profile. **Earnings and care history (later):** no new tab; Bookings **Past** (by stay and owner) + a Profile **Earnings / payouts** section (summary of demo pay amounts and periods). Activity details via Diary filters | Mirrors Owner + sitter dashboard (2026-10-04 Minsik) |
| D48 | Test environment (2026-10-09) | Hand testing is **always `main` on Vercel production** (https://goldito-petcare.vercel.app). Backend is Render (D18). PR Previews are not in CORS, so upload and AI do not work there; record results (✅) against main only | Pulling a branch and running it locally gives everyone a different environment |
| D49 | The inquiry AI's "available" = the booking engine's rules (RV-1, `011c`) | `stay_capacity_check` runs the schedule part of `request_booking` as is (window check → `capacity_shortfall`). If there is not room for every pet, or any day the sitter did not open, the answer is "not available". If this check fails, nothing is promised: no quote, an `availability_note` saying not to state availability, `needs_sitter` forced (no auto-send) | Never make a promise in the sitter's name that the booking request later breaks with `sitter_unavailable` |
| D50 | What an inquiry reveals (RV-4 · RV-5, `011e`) | A sitter who gets an inquiry sees the owner's display name and the pets asked about (same level as a booking request). The pet's Life Record and allergies only while `has_open_inquiry_about` is true: the inquiry is `open`, the stay asked about has not ended yet (`pick_up_at > now()`), and the inquiry is less than 30 days old. If any one fails, it closes | Fixes an `open` inquiry keeping the pet's record open forever |
| D51 | "Ask before booking" (FB-33) | The sitter profile shows **[Ask before booking] [Book]** side by side (Book is the primary button) and says "a booking only happens when you send a request". Inquiry dates are required (availability and quote depend on dates). The sheet calendar marks days the sitter opened and full days (by pet count); sending on a full day offers **Ask anyway / Pick other dates** | Separates a question before booking from a booking request |
| D52 | Owner and sitter actions in the inquiry thread (FB-34, `011j` · `011k`) | When the sitter's reply is the last message, the owner continues with **Write back** (AI drafts again → sitter approves, same auto-send rules). **Change dates** changes the dates of the **same inquiry**, not a new one (`change_inquiry_dates`: owner only · open inquiries only · 31 days or less · scheduled auto-replies for the old dates are withdrawn). The sitter's Accept / Decline / Suggest open a popup with the reply already written, and **Send** sends it; Decline · Suggest go out with `can_host=false` + no quote (`send_inquiry_reply(…, p_outcome)`) | Fixes a quote card and Request booking showing under a decline reply, and conversations dead-ending |
| D53 | Owner reviews written by sitters (FB-25 · FB-29, `011g`, made public 2026-10-26 by `015s`) | After a stay ends, the sitter leaves stars + text (presets per star) about the owner (`save_owner_note`; saving again edits it; no notification). At first only the sitter could read it; now **that owner and every sitter** can (`owner_rating_summary`, sitter names first word only). Sitters see other sitters' reviews on the owner's request and booking screens. The other way, owners' reviews of a sitter are **all** shown on the sitter profile (`sitter_rating_summary`), and the sitter sees their own reviews together in Profile | Common good: each side judges by the other's ratings and uses reviews received as feedback |
| D54 | Favorite sitters moved up (FB-28, `011h`) | 11.5 moved up to P0: "Add Chloe to your favorites?" after a review, ☆ / ★ on the profile, favorites first in Your sitters and search. The sitter is not told | The first hand test needed a rebooking path for regulars |
| D55 | The care window starts at the earlier one (CW-1, `011i`) | For check-ins · tasks · daily report chips · drafts, the sitter's window starts at **the earlier of the agreed drop-off and Received**; the end stays the same. Because Received works from 2 hours before drop-off | Fixes check-ins blocked with `not_in_care_window` and photos not becoming chips after an early drop-off |
| D56 | Daily report rules (FB-22 · RV-6 to RV-8, `011f`) | The same sitter can send **several** daily reports for the same pet on the same day (one draft at a time; the next report's chips and snapshot only cover what came after the last sent report). **Chips turned off never go into the report** (sent to the server as `off`). Only up to 8 highlights go into the text; turning on more shows a notice. If the writing model is down, 200 with a plain-list draft (`template-fallback`) | The server enforces D38 "never write what the sitter turned off" |
| D57 | Demo reset is for testing only (2026-10-09) | Profile → Demo tools · `POST /api/demo/reset` only during testing. **Remove it before judging** and use the same `demo_reset` code to build fixed accounts per starting point (so judges cannot wipe data). Reset only erases what the two demo accounts did with each other (does not touch other owners' bookings) | Protects judges' data; R60-2, where reset erased other people's bookings |
| D58 | Pet profile onboarding principles (2026-10-10, 11.15) | Pet sign-up takes 3-5 minutes with **one question per screen · large text · 4 choices · one tap**, and every question can be skipped. Personality questions are **the owner describing behavior, not "MBTI / a validated test"** (items are newly written with MCPQ-R · C-BARQ · DPQ concepts as reference; the original surveys' validation does not carry over, so it is labeled "not a behavior assessment"). The sitter card shows 5 axes (Sociability · Sensitivity · Energy · Appetite · Trainability) as **4-level words with no scores**, and **safety items such as biting · other animals · escaping · guarding are kept off the chart** and shown as warning chips. AI values from photo and voice are **suggestions only**: saved after the owner confirms; a voice value needs a supporting sentence in the transcript, and the AI never pre-selects safety items. Token Factory has no speech recognition (catalog checked 2026-10-10), so **recording → outside STT (Groq Whisper, free plan, decided 2026-10-10) → text → Nemotron extracts facts**. Used only for the first pet sign-up right after owner sign-up (not sitters or demo accounts); **build it last in the P0 queue**. Details: pet-profile-onboarding.md | Prevents empty profiles (Rover's problem) and avoids misleading scores |
| D59 | Only 3 outside sources (2026-10-10) | **Tavily** (breed physical needs · treat ingredients · recall backup), **Government of Canada Recalls and Safety Alerts open data** (recalls), **static JSON we curate** (breed and toxin rule tables, with source links, reviewed by Seulgi). Not used: The Dog API (paid tiers, no sources cited) · API Ninjas (unknown sources) · openFDA (drugs and devices only) · Open Pet Food Facts (barcodes are out of plan). The first safety verdict comes from the server rule table; keep the rule that the server overrides to DANGER even when the model says SAFE | Few sources, trusted ones only |
| D60 | Booking steps · hold · timeout (2026-10-11) | **Steps are computed, not stored** (`booking_stage()` · `booking_next_actor()`; the app reads them like columns): `requested → meet_greet → confirm → awaiting_payment → paid → in_care → completed` (+ `declined` · `cancelled`). For a first meeting, **the sitter's first yes** (`bookings.sitter_interest_at`, `express_interest`) is the new gate, and a Meet & Greet proposal or skip request is only possible after it (`interest_required`). Regulars and pairs who already met: one Accept (no change). **Hold:** from the first yes until confirmed · declined · cancelled · timed out, no other owner can request or book that slot and the sitter cannot block it. **Sitter setting (adds to D24, decided 2026-10-11):** the sitter decides with `sitter_profiles.accepts_multiple_owners` (default **off = one owner at a time**). When off, different owners cannot hold the same slot at once (both hold and confirmed, regardless of `max_pets`; it only stays as the per-owner pet count limit). When on, as now, several owners fit within the `max_pets` capacity. **Owners can see this setting when they inquire or book** (badge "One owner at a time" / "Hosts several owners' pets" on the sitter profile · inquiry sheet · search results). It is passed to the inquiry AI as a fact too. **An owner's decline** is `cancel_booking` + reason chips (Doesn't seem like a fit · Found another sitter · My schedule changed · Something else). **Deadlines:** if no time is set within 2 days after the first yes, a notification (`meet_greet_stalled`); 3 more days with no word after that, auto-cancel (`meet_greet_timeout`); the periodic check ("sweep") is `pg_cron` or a backend call. Migration `011l_booking_steps` | Both sitter and owner know the current step and the next action, no double booking, no pile-up of requests stuck at Meet & Greet |
| D61 | Snap tab (2026-10-13, Phase 12) | The fifth tab `Mood` → **`Snap`** (both owner and sitter): **Treat check** (Phase 08 design as is + Tavily; owners can also check their own pet; the DANGER owner notification only when the sitter ran the check) · **Mood** (browser MediaPipe boxes each pet → a Token Factory vision model looks at the crops → **server rules compute 8 emotion %**, summing to 100%) · **Sticker** (browser MediaPipe Magic Touch cuts out only the pet → sticker box → **owner + sitter** each decorate the diary on their own layer). **Change to D42:** negative emotions are shown in % too. But the line "For fun only, not a behavior or health assessment" is required, the numbers come from the server not the model, and no medical or pain wording. 11.15 onboarding stays 10/24-27 → Snap is 10/14 to 10/22 (phase-12-snap.md) |
| D62 | In chat, AI only suggests; a person always sends (2026-10-19, Phase 03D) | In chat, AI makes **only chips (message drafts · action suggestions)**, and **a person always taps to send or act. No auto-send** (chat does not use D36's auto-send option). Action chips are picked **only from the list of actions possible right now** that the code sets, and the code fills prices · dates · availability. No reasons are shown. Both owner and sitter get them | D36 (auto-send stays only on the inquiry screen, and the inquiry screen goes away when it merges into chat in #142) |
| D63 | Chat tab · Diary inside Feed (#329, Seulgi's 5 tabs, Muk nav trial) | Both roles: **`Home · Bookings · Chat · Feed · Snap`**. **Chat** = chat list (unread count as a tab badge, the newest new chat highlighted); the chat list and Chats chip are gone from Bookings. **Photos · Diary** switch at the top of **Feed** (`?view=diary`); the Diary tab is gone (old `/owner/diary` · `/sitter/diary` go to Diary in Feed). Replaces the tab lists in D47 · D47b |

---

## 2. Repo layout (final shape)

```
Goldito/
├─ README.md                  # Product + Getting Started (finished in Phase 10)
├─ CLAUDE.md
├─ .gitignore                 # .env, data/raw/, node_modules, __pycache__, .venv, dist
├─ .github/workflows/
│  ├─ ci.yml                  # Phase 01.5: PR checks (backend / frontend, 2 jobs)
│  └─ keepalive.yml           # Phase 10.7: calls /health every 10 minutes (keeps Render free from sleeping)
├─ docs/
├─ supabase/
│  ├─ README.md               # ERD summary + apply order
│  ├─ migrations/
│  │  ├─ 001_initial_schema.sql
│  │  ├─ 002_rls_policies.sql
│  │  ├─ 003_functions_triggers.sql   # helpers · sign-up trigger · booking RPCs · conflict triggers · realtime (Phase 02)
│  │  ├─ 004_booking_options.sql      # Phase 03B (service_type, services, Meet & Greet: first-meeting check · skip · place · Meet link, both sides' meet_spots)
│  │  ├─ 005_meet_greet.sql           # Phase 03B 3B.9 (Meet & Greet RPCs: propose · respond · complete · skip, both sides' places)
│  │  ├─ 006_agreements.sql           # Phase 03C (rates · holidays · quote_booking, consents, demo payment, entry info unlock)
│  │  ├─ 007_feed_notifications.sql   # Phase 05 (+ feed_posts.category, filled by 09)
│  │  ├─ 007b_feed_posts_realtime.sql  # feed_posts Realtime (b/c suffix because 008 is reserved for care)
│  │  ├─ 007c_feed_visibility.sql      # posted_by + visibility (shared/private), owner posts
│  │  ├─ 008_care.sql                 # Phase 06 (task_logs RPC, care_checkins, care_requests, pet_cautions)
│  │  ├─ 008g_care_change_requests.sql   # owner → sitter requests during care, approve · decline
│  │  ├─ 008h_care_counter_requests.sql  # decline note, counter-request (extra cost · owner to-do), owner Accept · Decline
│  │  ├─ 008i_revoke_trigger_functions.sql # trigger functions cannot be called as RPCs (Supabase security check)
│  │  ├─ 008j_no_direct_edits_during_stay.sql # during care, the owner cannot INSERT tasks · Heads-ups directly
│  │  ├─ 009_reports.sql              # Phase 07 (send_daily_report)
│  │  ├─ 009b_care_requests_follow_the_stay.sql · 009c_handoffs_stay_consistent.sql · 009d_paid_bookings_follow_changes.sql · 009e_reopened_checkout_keeps_addresses.sql  # changes after confirm · payment stay consistent with the booking · requests · checkout (BF.x)
│  │  ├─ 010_inquiries_rag.sql        # Phase 07B (pgvector, inquiries, knowledge_chunks)
│  │  ├─ 010b_send_inquiry_reply.sql · 010c_tone_samples.sql · 010d_auto_reply.sql  # sitter reply RPC, tone samples, auto-send
│  │  ├─ 011_completion.sql           # Phase 07C (reviews, pet_life_records)
│  │  ├─ 011b_life_record_columns.sql · 011c_stay_capacity_check.sql · 011e_inquiry_access.sql  # Life Record columns, inquiry availability = booking capacity rules, what an inquiry reveals (011d left empty for RV-3)
│  │  ├─ 011f_daily_reports_many.sql · 011g_sitter_owner_notes.sql · 011h_favorite_sitters.sql  # several daily reports per day, the sitter's private owner notes, favorite sitters (11.5 moved up)
│  │  ├─ 011i_care_window_follows_received.sql · 011j_change_inquiry_dates.sql · 011k_inquiry_reply_outcome.sql  # care window from an early Received, change dates in the same inquiry, sitter reply outcome (decline · suggest have no quote)
│  │  ├─ 012_transit.sql              # Phase 06B (trips, handoff_checks, home coordinates), the very last P0 phase (D41)
│  │  ├─ 013_safety.sql               # Phase 08 (DANGER notification trigger), stretch if time remains after 06B
│  │  └─ 014_p1.sql                   # Phase 11 (P1)
│  │                                  # number = apply order. If the work order changes, use the next free number and fix this list (008 is a gap left by renumbering; not used)
│  └─ tests/rls_smoke.sql     # RLS check queries that switch roles
├─ backend/
│  ├─ requirements.txt
│  ├─ Dockerfile              # Phase 10
│  ├─ .env.example
│  ├─ README.md
│  ├─ app/
│  │  ├─ main.py              # FastAPI app, CORS, router include, error handlers
│  │  ├─ config.py            # pydantic-settings (all the §4 env below)
│  │  ├─ deps/
│  │  │  ├─ auth.py           # get_current_user, require_role("sitter")
│  │  │  └─ supabase.py       # service-role client (singleton)
│  │  ├─ services/
│  │  │  ├─ authz.py          # assert_owner_of(pet_id), assert_on_duty_for(pet_id)
│  │  │  ├─ cloudinary.py     # sign params, delivery URL, fetch image → base64
│  │  │  ├─ nebius.py         # model role → (model_id, base_url), chat(), chat_json(), embed()
│  │  │  ├─ rag.py            # 07B: chunk → embed → knowledge_chunks upsert, match_knowledge search
│  │  │  ├─ google_meet.py    # 3B.11: refresh token → Calendar event + Meet link (D45)
│  │  │  └─ timeutil.py       # today/day range in APP_TIMEZONE
│  │  ├─ routers/
│  │  │  ├─ health.py         # GET /health
│  │  │  ├─ me.py             # GET /api/me
│  │  │  ├─ meet_greet.py     # POST /api/meet-greet/video-link (3B.11, D45)
│  │  │  ├─ media.py          # POST /api/media/sign, /api/media/complete
│  │  │  ├─ ai_caption.py     # POST /api/ai/caption
│  │  │  ├─ ai_daily_report.py# POST /api/ai/daily-report
│  │  │  ├─ ai_care_plan.py   # POST /api/ai/care-plan (06)
│  │  │  ├─ ai_report_chips.py # POST /api/ai/report-chips (07, D38)
│  │  │  ├─ ai_handoff_check.py # POST /api/ai/handoff-check (06B)
│  │  │  ├─ ai_inquiry.py     # POST /api/ai/inquiry-reply (07B)
│  │  │  ├─ ai_life_record.py # POST /api/ai/life-record (07C)
│  │  │  ├─ ai_pet_review.py  # POST /api/ai/pet-review-chips (#407, D38)
│  │  │  ├─ ai_pet_mood.py    # POST /api/ai/pet-mood (12.2 Mood: tags → rule %)
│  │  │  └─ ai_safety_check.py # POST /api/ai/safety-check (12.1 Treat check: the 08 design)
│  │  ├─ schemas/             # pydantic request/response models (one file per router)
│  │  └─ ai/prompts/
│  │     ├─ caption/{system.md}
│  │     ├─ care_plan/{system.md}
│  │     ├─ handoff_check/{system.md}
│  │     ├─ inquiry/{system.md}
│  │     ├─ life_record/{system.md}
│  │     ├─ report_chips/{system.md}
│  │     ├─ daily_report/{PROMPT.md, system.md, few_shot.json}
│  │     └─ safety/{vision_system.md, reasoning_system.md}
│  ├─ scripts/
│  │  ├─ test_nebius.py       # Phase 07.1
│  │  └─ seed_demo.py         # Phase 10.1
│  └─ tests/                  # pytest (JSON parsing, authz, schemas)
└─ frontend/
   ├─ package.json, app.json, tsconfig.json
   ├─ .env.example
   ├─ README.md
   ├─ playwright.config.ts    # 1.7: mouse-only test config
   ├─ e2e/                    # 1.7: Playwright (desktop frame + mouse) / 10.x judging path
   ├─ app/                    # expo-router (§3)
   │  ├─ index.tsx            # 3.3: redirect by sign-in state / role
   │  ├─ (auth)/              # 3.1-3.2: login, signup (to `/` when signed in)
   │  ├─ owner/ · sitter/     # D26: `_layout.tsx` = role guard Stack, `(tabs)/` = JS Tabs (`/owner`, `/owner/feed` …), details on top of the Stack (`owner/pets/new`, `owner/pets/[petId]`)
   │  ├─ profile.tsx          # 3.8: profile per role (`/profile`, shared by both roles)
   │  └─ dev/                 # gestures.tsx (1.7), health.tsx (1.3); only when EXPO_PUBLIC_DEV_ROUTES=1
   ├─ assets/demo/            # 4.7: sample photos (everyday dogs and cats, made-up brand treat labels; no PII)
   ├─ components/shell/       # D25: AppShell.tsx / AppShell.web.tsx, DeviceFrame.web.tsx, TouchEmulation.web.ts, presentation.ts, useLayoutMode.ts, useShell.ts (screens import only `useShell` · `useLayoutMode`)
   ├─ components/ui/          # Button, TextButton, TextField, Card, Screen, EmptyState, LoadingView, Chip, SegmentedControl, Skeleton, Badge, Toast, AlertModal, Sheet, HorizontalList
   ├─ components/             # domain components (RoleTabs, HeaderActions, RoleCard, PetCard, PetForm, FeedCard, TaskRow, PetSwitcher, NotificationItem, MediaPicker, QuoteCard, ConsentCard, EntryInfoCard, TripMap(.web), ChecklistCard, StarRating, LifeRecordCard …)
   ├─ features/<domain>/      # per-screen data and state (`pets/` petApi · useMyPets · petValidation, `profile/` profileApi): use*.ts hooks (route files stay thin, D25; the post-hackathon sitter desktop screens reuse them)
   ├─ lib/
   │  ├─ supabase.ts          # getSupabase(): created on first use (anon, AsyncStorage persist, `getAuthStorageKey()`)
   │  ├─ authErrors.ts        # Supabase Auth errors → human wording
   │  ├─ api.ts               # FastAPI fetch wrapper (automatic Bearer, normalized errors)
   │  ├─ media.ts             # pickMedia(): the only entry point for every photo pick (4.7)
   │  ├─ cloudinary.ts        # uploadMedia(), thumbUrl(), videoPosterUrl()
   │  ├─ feed.ts              # createFeedPost(): shared by Phase 05/06/09
   │  ├─ location.ts          # 06B: one location source: real GPS watch / Simulate trip (D32)
   │  └─ time.ts              # APP_TIMEZONE display format
   ├─ providers/              # ThemeProvider(useTheme · useThemedStyles, 3.0), SessionProvider, PetProvider(selected pet), ToastProvider, NotificationsProvider(Realtime)
   ├─ theme/tokens.ts         # defaults: color · spacing (8px) · radius · type · layout · breakpoint; replaced with Muk's Figma tokens
   ├─ theme/themes.ts         # skin presets (`default` + 11.10 coat colors): changes only primary · primaryText · background · accent, status colors fixed
   └─ types/db.ts             # Supabase table types (by hand or supabase gen types)
```

---

## 3. Screen & route map (final shape)

| Route | Role | Screen | Primary action (1) | Phase added |
| :--- | :--- | :--- | :--- | :--- |
| `/` | - | Redirect by session and role (signed out → `/login`, welcome after OB.1) · Try again / Log out if the profile fails to load | - | 03 → OB.1 |
| `/welcome` (`app/(public)/welcome.tsx`) | - | Welcome + **Try demo** (Owner / Sitter) · "Already have an account?" | Try demo | OB.1 (onboarding.md) |
| `/login` (`app/(auth)/login.tsx`) | - | Login | Sign in | 03 |
| `/signup` (`app/(auth)/signup.tsx`) | - | Sign up (+ pick a role once) | Create account | 03 |
| `/owner/` (tab: Home) | owner | My pets · **Next booking** card (Trip · Received status while in progress) · **Pet status room (8bit, P1 11.12)** · today's summary | Add pet | 03 · 03B · 11.12 |
| `/owner/pets/new`, `/owner/pets/[petId]` | owner | Pet profile (**species Dog/Cat** · name · breed · birthday · notes · **allergy chips**) · entry to **Care request** · **Life Record** | Save | 03 |
| `/owner/pets/[petId]/care-request` | owner | Care and medication request (written like a note) → AI checklist preview → confirm (Stage 2) | **Save checklist** | 06 |
| `/owner/pets/[petId]/record` | owner | Pet Life Record: eating habits · potty · medication reactions · behavior · cautions + list of past stays (Stage 5) | Read | 07C |
| `/owner/bookings` (tab: Bookings), `/owner/bookings/new`, `/owner/bookings/[bookingId]`, `/owner/sitters/[sitterId]` | owner | List of bookings and inquiries / service type · regular's schedule · search · request (transport mode) / detail (first-meeting Meet & Greet (in-person place · Google Meet · skip consent, D44) · handoff · rebook) / sitter profile · schedule · stars + **Ask before booking** | Book care | 03B (+07B inquiries) |
| `/owner/inquiries/[inquiryId]` | owner | Inquiry thread: AI auto-reply + quote card (Stage 1) | **Request booking** | 07B |
| `/owner/bookings/[bookingId]/checkout` | owner | Quote → sign consents → **Pay (demo)** → sitter's home info · packing checklist (Stage 3) | **Pay** | 03C |
| `/owner/home-access` | owner | My home entry info (lockbox · buzzer · fob · entry steps): "Only shown to your sitter 2 hours before" | Save | 03C |
| `/owner/bookings/[bookingId]/trip`, `/sitter/bookings/[bookingId]/trip` | both | Live trip: view-only map · ETA · arrival card (Visitor parking / Buzzer · Lockbox) · photo check (Stage 4) | **Start trip** / photo → **Received · Returned** | 06B |
| `/owner/bookings/[bookingId]/review` | owner | ★ 1-5 + comment (optional) (Stage 5) | **Send review** | 07C |
| `/profile` | both | Profile per role + **Settings** (account · notifications · What's New: 11.11 moves here; D47). Address · bio · **preferred meeting spots ≤ 3**, etc. (D44) | Save | 03 (+03B · 11.11) |
| `/settings` | both | *(deprecated as tab)* → folded into the `/profile` Settings section (D47). Redirect for deep-link compatibility | - | 11.11 |
| `/owner/feed` (tab: Feed) | owner | **Permanent album**: pet chip multi-toggle (select/deselect) · 3-column grid → detail (D47). Owner and sitter post | Scroll / tap | 05 (+09 categories) |
| `/owner/diary` (tab: Diary) | owner | **Care diary**: during Live (On air), sitter updates in time order; history (pet · sitter · date). Entries with photos → mirrored to Feed (D47). Old `/owner/reports` | Read / write | 05-07 |
| `/owner/diary/[entryId]` | owner | Diary entry detail (daily report · checks · photo group) | Read | 07 |
| `/owner/snap` (tab: Snap) | owner | Treat check · Mood (box per pet + emotion %) · Sticker → diary decorating (D61) | 3 cards | 12 |
| `/owner/pets/[petId]` (Care request) | owner | Old Care tab content: medication and walk requests from **pet detail** (D47, details later). Route `/owner/pets/[petId]/care-request` stays | Save checklist | 06 |
| `/owner/notifications` (header bell) | owner | Notification center | Tap → that screen | 05 |
| `/sitter/` (tab: Home) | sitter | **Dashboard (D47b):** in care → pet card · quick actions · otherwise Requests (not yet approved) · Upcoming · drop/pick **in time order**. Tamagotchi later (11.12). Absorbs Tasks/check-in · (08) Scan | Open booking / check-in | 03 → 06 |
| `/sitter/schedule` | sitter | Schedule calendar (date × slot open + hours + capacity / blocked) | Save | 03B |
| `/sitter/bookings` (tab: Bookings), `/sitter/bookings/[bookingId]` | sitter | Inquiries · Requests · Upcoming · **Past** (care history). Later, entry to Past/Earnings | Accept | 03B (+03C · 07B · 07C) |
| `/sitter/inquiries/[inquiryId]` | sitter | Inquiry thread: draft in the sitter's tone + **Send** (D36) | Send | 07B |
| `/sitter/feed` (tab: Feed) | sitter | Album of pets in care · + Photo (links to `/sitter/feed/[petId]`) | **+ Photo** | 05 |
| `/sitter/feed/[petId]` | sitter | Pet feed (sitter view) | **+ Photo** (FAB) | 05 |
| `/sitter/diary` (tab: Diary) | sitter | Stay log + evening chip daily report (old Report · Tasks) | **Send** / Mark done | 06-07 |
| `/sitter/snap` (tab: Snap) | sitter | Same Snap tools as Owner (Treat check · Mood · Sticker, D61) | 3 cards | 12 |
| `/sitter/tasks`, `/sitter/report` | sitter | *(removed as tabs; redirect to Home / Diary)* | - | legacy |
| `/sitter/snap/treat` (Snap → Stack) | sitter | Treat check (old Treat scanner) | **Check** | 12.1 (08 design) |
| `/sitter/notifications` (header bell) | sitter | Notification center | Tap → that screen | 05 |
| `/profile` (Earnings, later) | sitter | Profile **Earnings**: amounts received and period summary (demo pay). The stay list is Bookings Past | - | P1 / 10+ |
| `/dev/gestures` | - | Mouse behavior test screen (long list · horizontal row · modal · toast · input). Only when `EXPO_PUBLIC_DEV_ROUTES=1`, no link | - | 1.7 |
| `/dev/health` | - | Checks backend `GET /health` (Check API: the 1.3 screen moved from `/`). Only when `EXPO_PUBLIC_DEV_ROUTES=1` | Check API | 1.3 → 3.3 |

- Tabs (D47 · D47b · D61 · D63): both owner and sitter have **`Home · Bookings · Chat · Feed · Snap`**. Diary is inside Feed (Photos · Diary switch). Treat check · Mood · Sticker = Snap tab (Phase 12). Notification bell = header; **Settings · (sitter) Earnings** = header Profile. Tabs are expo-router **JS `Tabs`** (D25).
- Web queries (D25, every route): `?frame=0` turns the phone frame off · `?frame=1` forces it on · `?view=split` Owner and Sitter phones side by side (10.10 stretch).
- Owner Feed pet filter = **multi-toggle chips** (select/deselect; with 0 selected, a notice or all by default). Diary and Mood can use the same set of pets. The demo has 2 pets (Max the dog, Mochi the cat).
- Role areas are **URL prefix folders** `app/owner/` · `app/sitter/` (D26), not groups `(owner)`/`(sitter)`. The role guard is `components/RoleTabs.tsx`: signed out → `/login`, other role → own home (`/owner` ↔ `/sitter`). The `(auth)` group sends signed-in users to `/`.

---

## 4. Environment variable master list

Put these in `.env.example` **with exactly these names**. (Real values go in `.env`, kept out of git)

### backend/.env

| Variable | Example / default | Used in phase |
| :--- | :--- | :--- |
| `APP_ENV` | `local` \| `production` | 01 |
| `APP_TIMEZONE` | `America/Toronto` | 06, 07 |
| `CORS_ORIGINS` | `http://localhost:8081,http://localhost:19006` (comma-separated) | 01 |
| `SUPABASE_URL` | `https://<ref>.supabase.co` | 03 |
| `SUPABASE_SERVICE_ROLE_KEY` | (secret) | 04 |
| `SUPABASE_JWT_SECRET` | (legacy HS256 projects only, can be empty) | 03 |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | | 04 |
| `NEBIUS_API_KEY` | (secret) | 07 |
| `MODEL_VISION` / `MODEL_VISION_BASE_URL` | `nvidia/Nemotron-3.5-Super-VL` / `https://api.tokenfactory.nebius.com/v1/` (global URL only; rollback `openbmb/MiniCPM-V-4_5` / us-central1, D39 · [model-ids.md](notes/model-ids.md)) | 08, 09 |
| `MODEL_SAFETY` / `MODEL_SAFETY_BASE_URL` | `nvidia/Nemotron-3-Ultra-550b-a55b` / us-central1 | 08 |
| `MODEL_REPORT` / `MODEL_REPORT_BASE_URL` | `nvidia/nemotron-3-super-120b-a12b` / us-central1 | 07 |
| `MODEL_FAST` / `MODEL_FAST_BASE_URL` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` / eu-north1 | 07.1 test, 07B inquiry reply |
| `MODEL_CHAT_OWNER` / `MODEL_CHAT_SITTER` / `MODEL_CHAT_CHIPS` | default `nvidia/nemotron-3-super-120b-a12b` (`MODEL_FAST` if empty) | Model for chat **drafts** (owner side · sitter side) and **chips** (both sides). Chat AI does not use Nano (#226; base URL is `MODEL_FAST_BASE_URL`) |
| `MODEL_EMBED` / `MODEL_EMBED_BASE_URL` / `MODEL_EMBED_DIM` | `Qwen/Qwen3-Embedding-8B` / eu-north1 / `1024` (D33: `dimensions` parameter confirmed working 2026-10-01) | 07B RAG, 07C Life Record |
| `TAVILY_API_KEY` | Tavily dashboard (Builders & Brews, etc.). **backend only** | 08.7 stretch (safety web search; 11.3 if it slips). tavily.md |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_OAUTH_REFRESH_TOKEN` | OAuth client of the Goldito Google account + the refresh token that account got by consenting once (scope `https://www.googleapis.com/auth/calendar.events` + `https://www.googleapis.com/auth/meetings.space.settings`; the latter is for the Meet REST call that opens the room to anyone with the link; without it the link is still created but people must ask to join; OAuth app publishing status **In production**, as Testing expires in 7 days). **backend only** | 3B.11 (video Meet & Greet, D45) |
| `GOOGLE_CALENDAR_ID` / `MEET_INVITE_ATTENDEES` | `primary` / `true` (with `false`, only the link is created and no invite email; always skipped for demo `.test` accounts) | 3B.11 |
| `DEMO_PASSWORD` | Password for demo accounts only: used by `scripts/seed_demo.py`, same value as frontend `EXPO_PUBLIC_DEMO_PASSWORD` (a value shown to judges; never reuse a real password) | 10.1 (the account part first, on 2026-10-01) |
| `GROQ_API_KEY` | (secret) Groq Whisper `whisper-large-v3-turbo` free plan: speech → text (STT). **backend only** | 11.15 voice, pet-profile-onboarding §6.2 |

### frontend/.env (all public values, `EXPO_PUBLIC_` prefix)

| Variable | Used in phase |
| :--- | :--- |
| `EXPO_PUBLIC_API_URL` (e.g. `http://localhost:8000`) | 01 |
| `EXPO_PUBLIC_SUPABASE_URL` | 03 |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | 03 |
| `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` (for building delivery URLs) | 04 |
| `EXPO_PUBLIC_APP_TIMEZONE` (`America/Toronto`) | 06 |
| `EXPO_PUBLIC_DEMO_PASSWORD` (password for demo accounts only: a public value in the bundle. No real accounts or service keys) | OB.2, 10 |
| `EXPO_PUBLIC_DEV_ROUTES` (`1` exposes `/dev/gestures`; local and CI only, never in the production env) | 1.7 |

> ❌ **Never** put the service role key, Cloudinary secret, or Nebius key in the frontend env.

---

## 5. Shared API conventions (FastAPI)

- Base: `/health` (no auth); every other `/api/*` **requires `Authorization: Bearer <supabase access_token>`**.
- Authorization: a router that reaches the DB with the service role must first call `assert_on_duty_for` (sitter: today is inside a confirmed booking) / `assert_owner_of` from `services/authz.py` (the service role bypasses RLS).
- Error format: `{"detail": "<human message>", "code": "<snake_case>"}`. Example codes: `unauthorized` (401), `forbidden` (403), `not_found` (404), `invalid_input` (422), `ai_timeout` (504), `ai_invalid_output` (502), `upstream_error` (502).
- Timeouts (server → Nebius): caption 20s, handoff-check 20s, inquiry-reply 45s (for making the draft; target p50 < 10s; the D37 human-pace delay is separate from this timeout), care-plan 45s, report-chips 30s, daily-report 60s, life-record 60s, pet-review-chips 20s, safety 90s (vision 30 + reasoning 60). Server → Google Calendar (meet video-link) 15s. Frontend fetch timeouts are these +5s.
- Per-booking permissions: `services/authz.py` has `assert_booking_party(booking_id)` (owner or sitter) / `assert_booked_sitter(booking_id, from_hours_before=2)` (handoff photo: from 2 hours before drop-off).
- Every AI response includes `model` (the model id used) and `latency_ms` → used in the feedback log and demo explanation.

### Endpoint contract (full)

| Method | Path | Permission | Body | Response | Phase |
| :--- | :--- | :--- | :--- | :--- | :--- |
| GET | `/health` | - | - | `{status:"ok"}` | 01 |
| GET | `/health/deep` | - | - | `{status:"ok", db:"ok"}` (Supabase `select 1`), keep-alive only | 10 |
| GET | `/api/me` | any | - | `{id, email, role, display_name}` | 03 |
| POST | `/api/meet-greet/video-link` | Booking party (video M&G is agreed) | `{booking_id}` | `{meet_url, calendar_event_id, starts_at}`: idempotent (returns the existing one), Google failure → 502 `upstream_error` (the screen falls back to .ics and pasting a link) | 3B.11 (D45) |
| POST | `/api/media/sign` | on-duty sitter (`handoff`: booked sitter, from 2 hours before drop-off) | `{pet_id, resource_type:"image"\|"video", purpose, booking_id?}`; purpose `feed` · `task_proof` · `report` · `handoff` · `safety_label` | `{cloud_name, api_key, timestamp, signature, folder, upload_url}` | 04 |
| POST | `/api/media/complete` | Same as above | `{pet_id, public_id, resource_type, purpose, width?, height?, duration?}` | `{media_id, public_id, secure_url, thumb_url}` | 04 |
| POST | `/api/profile-photos/sign` | Anyone signed in (sitter · owner), only into their own folder `goldito/profile/<my id>` | - | `{cloud_name, api_key, timestamp, signature, folder, upload_url, transformation}` | #135 |
| POST | `/api/profile-photos/complete` | Same as above | `{public_id}` (inside my folder, must really exist in Cloudinary) | `{id, public_id, position, url, thumb_url}` · the 9th gets 409 | #135 |
| DELETE | `/api/profile-photos/{id}` | My photos only (someone else's → 404) | - | `{deleted}`: deletes the Cloudinary file first, then the DB row | #135 |
| POST | `/api/ai/inquiry-reply` | Inquiry party (the frontend calls it right after the owner sends) | `{inquiry_id}` | `{message_id, body, can_host, needs_sitter, quote, sources:[{type, id}], model, latency_ms}`; `quote` is the `quote_booking` result as is (D29) | 07B |
| POST | `/api/ai/chat-chips` | Chat party (3D.5, #142, D62) | `{thread_id}` | `{chips:[{id, label}], action:{id, label}|null, for_message_id, source}`: **2-3 chips for my side** replying to the other person's last message (sitter: availability · rates · policy, owner: pets · dates); in an empty chat, the owner's opener chips. Chips with numbers are dropped; if the model fails, fixed chips (`source: fallback`); no chips if I spoke last. **Action chip (`action`)**: the code builds the list of actions possible now from the booking stage (`get_booking_stages`) and card state (`request_booking` · `send_quote` · `interest` · `meet_time` · `meet_accept` · `meet_skip` · `agree` · `accept` · `final_quote` · `confirm_quote` · `pay`), and the model picks one only when the other person's last message clearly leads there. The server checks it is on the list and confidence is 0.7 or more; the label comes from the code. If the stage cannot be read, no action. A person always taps. Nothing is saved |
| POST | `/api/ai/chat-draft` | Chat party | `{thread_id, chip}` | `{text, source}`: turns the tapped chip into **one short message in my voice** (sitter: tone card · examples, owner: neutral). Prices · dates · availability are DB values; if they do not match, one rewrite, and if that fails, the chip's words as is. **A person always sends** (D62). Context: last ~20 messages + `chat_threads.ai_summary` (refreshed past 40, `014m`) + DB facts |
| POST | `/api/ai/care-plan` | owner of pet | `{pet_id, text}` (≤ 2000 chars) | `{tasks:[{type, time, title, dose?, notes?}], cautions:[str], skipped:[{type, title, reason}], model, latency_ms}`: the server enforces species rules (D23), time format, and duplicates, and returns filtered items in `skipped` with a reason. **Draft only**; saved to Supabase after the owner confirms (§6) | 06 |
| POST | `/api/ai/handoff-check` | booked sitter | `{booking_id, kind:"drop_off"\|"pick_up", check_type:"pet_checkin"\|"vehicle_safety"\|"return", media_id}` | `{check_id, status:"ok"\|"warning", findings:{pet_visible, crate_visible?, restraint_visible?}, message, model, latency_ms}`; on failure or timeout `status:"unchecked"` (the handoff can still go ahead) | 06B |
| POST | `/api/ai/caption` | on-duty sitter | `{pet_id, media_id}` | `{caption, category:"meal"\|"walk"\|"nap"\|"play"\|"other", source:"ai"\|"fallback", model, latency_ms}` | 09 |
| POST | `/api/ai/report-chips` | on-duty sitter | `{pet_id, date:"YYYY-MM-DD", media_ids?:[≤2]}` | `{chips:[{id, kind, label, source:"checkin"\|"task"\|"photo", media_id?}], photos:[{media_id, description}], model, latency_ms}`: day-record chips come from the DB on the server (no model), only photo chips use `MODEL_VISION`. Photo descriptions are saved in the draft for daily-report to reuse | 07 (7.7, D38) |
| POST | `/api/ai/daily-report` | on-duty sitter | `{pet_id, date:"YYYY-MM-DD", inputs:{meal?, water?, potty?, walk_minutes?, mood?}, chips:[chips the sitter picked], note?:(≤ 200 chars), media_ids?:[≤2]}` | `{report_id, body, status:"draft", model, latency_ms}`; posted after the sitter approves (`send_daily_report`) | 07 |
| POST | `/api/ai/life-record` | booking party (after pick-up is done) | `{booking_id}` | `{records:[{pet_id, record_id, summary}], model, latency_ms}` + RAG indexing | 07C |
| POST | `/api/ai/safety-check` | **pet owner** or on-duty sitter (D61) | `{pet_id, media_id}` (media = own `safety_label` upload of that pet) | `{safety_check_id, safety_status, product_name, detected_ingredients[], matched_allergens[], hidden_sources[{ingredient, may_contain, reason}], toxic_ingredients[], unknown_ingredients[], sources[{title, url, domain}], sources_unavailable, double_checked, warning_message, model, latency_ms}`; 422 unreadable label · 503 vision down | 12.1 |
| POST | `/api/ai/pet-mood` | any signed-in user; with `pet_id` = its owner or on-duty sitter (D61) | `{pet_id?, frames:[{index, crops:[{box:{x,y,w,h} (0-1), image: data-URL ≤ 300 KB}]}]}`; ≤ 4 frames, ≤ 8 crops; the n-th crop of every frame is the same pet | `{pets:[{frame, box, emotions:{happy, relaxed, excited, curious, sleepy, anxious, angry, sad} (whole %, sum 100), top, summary, frames_used}], disclaimer, model, latency_ms}`; nothing saved; 422 no pet found / bad crop · 503 vision down | 12.2 |
| POST | `/api/ai/pet-theme` | owner of pet | `{pet_id, media_id}` | `{theme, coat_colors[], confidence, model, latency_ms}` (`theme:"default"` on failure or low confidence) | 11.10 (P1) |
| POST | `/api/ai/report-decor` | on-duty sitter | `{report_id}` | `{theme, preset_stickers[], model, latency_ms}` (on failure `theme:"calm"`, `[]`) | 11.8 (P1) |

> Daily report **sending**, task **completion**, feed **posting**, quotes · consents · payment · entry info unlock · trip location · reviews go through Supabase (RLS/RPC), not FastAPI (§6). FastAPI handles only AI · Cloudinary · RAG indexing · Google Meet links.

---

## 6. Write path summary (who writes what, where)

| Action | Path | Side effects (triggers) |
| :--- | :--- | :--- |
| Sign up | Supabase Auth `signUp({options:{data:{role, display_name}}})` | `handle_new_user` → `profiles` + `owner_profiles`/`sitter_profiles` |
| Create/edit pet, allergies, care_tasks | Supabase client (owner RLS). **For a pet insert, the client makes the `id` (UUID) and skips `.select()`**: `pets_select` decides with a function that reads the same table (`is_owner_of`), so it cannot see the row inserted in the same statement, and `insert().select()` can be blocked by RLS (3.5). Same for other tables with the same pattern | `guard_care_task_species` |
| Schedule open (slot · hours · capacity)/blocked | Supabase client `sitter_availability` (own RLS). Changing part of a range = insert a new open row (latest row wins) | If it overlaps a confirmed slot or capacity drops below the confirmed pet count, `guard_availability_change` refuses → the sitter must `cancel_booking` first. **No notification** |
| View regular sitters and schedules | RPC `list_my_sitters()` / `get_sitter_schedule(sitter, from, to)` | - |
| Sitter search | RPC `search_sitters(drop_off_at, pick_up_at, pet_count)`: fully available first, partly available for reference | - |
| Propose / answer handoff time and place | RPC `propose_handoff` / `respond_handoff` | other side `handoff_proposed` / proposer `handoff_agreed` |
| Received / Returned | RPC `complete_handoff` (sitter) | owner `pet_dropped_off` / `pet_picked_up` |
| Request / answer / cancel booking | RPC `request_booking` (`meet_greet_status='required'` for a first meeting) / `respond_booking` (for a first meeting, accept only after M&G done or skipped: `meet_greet_required`) / `cancel_booking` (cancel only before drop-off) | `booking_*` notification to the other side |
| Read booking pets · my sitter profile | RPC `get_booking_pets(booking)` / `get_my_sitter_profile()` | - |
| Meet & Greet (first meeting only, D44) propose / answer / complete / skip | RPC `propose_meet_greet(p_booking, p_mode, p_at, p_place)` / `respond_meet_greet` / `complete_meet_greet` / `request_skip_meet_greet` / `respond_skip_meet_greet` (decline = booking cancelled, reason `meet_greet_declined`; the wording is "…would like to meet first") / `get_meet_greet_options` (both sides' `meet_spots`) (03B). For video, FastAPI `/api/meet-greet/video-link` right after accept (3B.11) | other side `meet_greet_proposed` · proposer `meet_greet_agreed` (`meet_greet_declined` if declined) · other side `meet_greet_skip_requested` · requester `meet_greet_skipped` · `booking_cancelled` on decline · both `meet_greet_link_ready` |
| Send an inquiry | Supabase client insert `inquiries` + the first `inquiry_messages` (owner) → the frontend calls FastAPI `/api/ai/inquiry-reply` (07B) | sitter `inquiry_received` when the AI draft is inserted · owner `inquiry_replied` when the sitter sends or an auto-send becomes visible (§7, D36 · D37) |
| Quote | RPC `quote_booking(sitter, service_type, drop_off_at, pick_up_at, pet_count)`: read-only, shared by inquiry replies and Checkout (03C, D29) | - |
| Sign consents · demo payment | Supabase client insert `booking_consents` (owner RLS) → RPC `pay_booking_demo(booking)`: all required consents must be there (`consents_missing`) (03C) | sitter `booking_paid` |
| Entry info | Owner: Supabase client upsert `owner_home_access` (own RLS) / sitter: RPC `get_home_access(booking)` (D31 time condition) | on first open `access_reveals` + owner `access_unlocked` |
| Save care request | FastAPI `/api/ai/care-plan` draft → owner confirms → Supabase client insert `care_requests` + `care_tasks` + `pet_cautions` (06) | `guard_care_task_species` |
| Start / position / end trip | RPC `start_trip(booking, kind)` / `update_trip_position(trip, lat, lng)` (every 5 seconds) / `end_trip(trip)` (06B, D32) | other side `trip_started` / `trip_arrived` within 150 m |
| Handoff photo check | FastAPI `/api/ai/handoff-check` (service role insert `handoff_checks`) → `complete_handoff(booking, kind, p_check)` | "photo verified ✅" in the notification title |
| Review | Supabase client insert `reviews` (owner RLS, once after pick-up is done) (07C) | sitter `review_received` |
| Life Record | FastAPI `/api/ai/life-record` (service role insert `pet_life_records` + `knowledge_chunks`) (07C) | owner `life_record_updated` |
| Create today's task_logs | RPC `ensure_today_task_logs(pet_id)`: called automatically on opening the screen, idempotent | - |
| Register media | FastAPI `/api/media/complete` (service role) | - |
| Feed post | Supabase client insert `feed_posts` (on-duty sitter or pet owner RLS, `posted_by` · `visibility`): `lib/feed.ts` | `notify_feed_post` → owner `feed_post` (except posts linked to a task) |
| Complete a task | RPC `complete_task_log(task_log_id, media_id)` → also creates a feed_post inside | owner `task_done` |
| Daily report chip suggestions | FastAPI `/api/ai/report-chips` (day-record chips + photo chips; photo descriptions saved in the draft) | - |
| Daily report draft | FastAPI `/api/ai/daily-report` (service role upsert; input is only the picked chips, note, and photo descriptions) | - |
| Send daily report | RPC `send_daily_report(report_id, body)` | owner `report_sent` |
| Safety result | FastAPI `/api/ai/safety-check` (service role insert) | owner `safety_danger` only when DANGER **and someone other than the owner (the sitter) ran the check** (013) |
| Acknowledge warning | Supabase client update `safety_checks.acknowledged_at` (owner · sitter RLS, 013) | - |
| Save sticker | Transparent PNG cut out in the browser → `uploadMedia({purpose: "sticker"})` (no JPEG conversion) → Supabase client insert `pet_stickers` (own `sticker` uploads only, 013b) | - |
| Diary decorating (12.3b) | Supabase client upsert `report_decor`: writes only your own layer, reads both layers (owner: sent daily reports, sitter: own daily reports, 013b) | - |
| Mark notification read | Supabase client update `notifications.read_at` (own RLS) | - |

---

## 7. Notification matrix (P0)

| type | Recipient | Created by | Example title (EN) | Tap goes to |
| :--- | :--- | :--- | :--- | :--- |
| `inquiry_received` | sitter | AI draft insert (07B, D36) | "Robert asked about Oct 9-12. Your draft reply is ready" | `/sitter/inquiries/[id]` |
| `inquiry_replied` | owner | When the sitter's message becomes visible (`status='sent'`, `visible_at <= now()`) | "Chloe replied 💬" | `/owner/inquiries/[id]` |
| `booking_requested` | sitter | `request_booking` RPC | "New booking request: Oct 5 to Oct 12" | `/sitter/bookings` |
| `meet_greet_proposed` / `meet_greet_agreed` | other side / proposer | Meet & Greet RPC (03B) | "Robert suggested a video Meet & Greet on Oct 6, 7:00 PM" | Booking detail |
| `meet_greet_declined` | proposer | `respond_meet_greet` decline (3B.9) | "Chloe can't make that Meet & Greet. Suggest another time" | Booking detail (**Schedule Meet & Greet** again) |
| `meet_greet_skip_requested` | other side | `request_skip_meet_greet` RPC (03B, D44) | "Robert would like to skip the Meet & Greet. Continue the booking without meeting first?" | Booking detail (**Continue** / **Decline (cancels the booking)**) |
| `meet_greet_skipped` | requester | `respond_skip_meet_greet` accept | "Chloe is OK to skip the Meet & Greet. Your booking continues" | Booking detail |
| `meet_greet_link_ready` | both | `/api/meet-greet/video-link` (3B.11, D45) | "Video Meet & Greet on Oct 6, 7:00 PM. Join with Google Meet" | Booking detail (**Join Google Meet**) |
| `booking_paid` | sitter | `pay_booking_demo` RPC (03C) | "Robert signed and paid. Oct 9-12 is all set ✅" | `/sitter/bookings/[id]` |
| `access_unlocked` | owner | First reveal by `get_home_access` (03C) | "Chloe can now see your entry info (2 h before pick-up)" | Booking detail |
| `trip_started` | other side | `start_trip` RPC (06B) | "Chloe is on the way, ETA 7:42 AM 🚗" | Trip screen |
| `trip_arrived` | other side | `update_trip_position` within 150 m (06B) | "Robert has arrived 🚗" | Trip screen |
| `booking_confirmed` / `booking_declined` | owner | `respond_booking` RPC · `booking_declined` also from `respond_handoff` when the sitter declines during the negotiation before confirmation | "Chloe confirmed your booking for Max and Mochi 🎉" | `/owner/bookings/[id]` |
| `handoff_proposed` | other side | `propose_handoff` RPC | "Paul suggested drop-off at 8:30 AM" | Booking detail |
| `handoff_agreed` | proposer | `respond_handoff` RPC | "Robert agreed to pick-up at 8:00 PM" | Booking detail |
| `handoff_declined` | proposer | `respond_handoff` RPC (declines a change after confirmation) | "Chloe declined the pick-up change" | Booking detail |
| `pet_dropped_off` / `pet_picked_up` | owner | `complete_handoff` RPC | By place: "Max and Mochi checked in at Chloe's ✅" / Sitter drives: "Pick-up complete, care has started 🚗" / pick-up: "Max and Mochi are home safe 🏠" (with a photo check, "· photo verified") | Booking detail |
| `review_requested` | owner | Pick-up done trigger (07C) | "Thanks for trusting Chloe! How was Max's stay? ⭐" | `/owner/bookings/[id]/review` |
| `review_received` | sitter | `reviews` insert trigger (07C) | "Robert left you 5 stars ⭐" | `/sitter/bookings/[id]` |
| `life_record_updated` | owner | `/api/ai/life-record` (07C) | "Max's Life Record was updated 📒" | `/owner/pets/[id]/record` |
| `booking_cancelled` | other side | `cancel_booking` RPC · also `respond_handoff` when the owner declines during the negotiation before confirmation · also `respond_skip_meet_greet` when a Meet & Greet skip is declined | "Chloe can't take Max and Mochi on Oct 5-8. Find a new sitter." / skip declined: "Chloe would like to meet first, so this booking was cancelled. Find a new sitter." | Booking detail (**Find a new sitter**) |
| `booking_refunded` | owner | Trigger `bookings_notify_refund` when a paid booking is cancelled (whoever cancels) (015c, #266) | "Refunded in full" / "$268.13 CAD back for Max (demo)" | Booking detail (**Refunded** chip) |
| `feed_post` | owner (sitter posts) · on-duty sitter (owner posts) | Trigger on `feed_posts` insert (`task_log_id is null` · `visibility = 'shared'`) | "New photo of Max 📸" / "Robert shared a photo of Max 📸" | `/owner/feed` · `/sitter/feed/[petId]` |
| `task_done` | owner | `complete_task_log` RPC | By type: "Max had breakfast on time 🍽️" / "Max is asleep 😴" / "Max's medication is done 💊" | `/owner/diary` (Live / history) |
| `care_checkin` | owner | `log_care_checkin` RPC | By kind: meal / potty / mood / note (Plan B: sitter-care-loop.md) | `/owner/diary` |
| `report_sent` | owner | `send_daily_report` RPC | "Today's report for Max is here 📝" | `/owner/diary` (entry) |
| `safety_danger` | owner | Trigger on `safety_checks` insert (`safety_status='DANGER'`), 08 stretch | "Blocked a risky treat for Max ⚠️" | `/owner/notifications` |
| `task_due` (stretch) | sitter | Serverless Job / APScheduler (6.7) | "Max's walk is due at 10:30" | `/sitter/tasks` |
| `photo_request` (P1) | sitter | Phase 11 | "Owner asked for a photo of Max" | `/sitter/feed/[id]` |

Frontend: `NotificationsProvider` subscribes to `notifications` Realtime (INSERT, `user_id=eq.<me>`) → toast + unread count update + per-type query invalidation (e.g. `feed_post` → refetch the feed).

---

## 8. Shared UX rules (every screen)

1. **4 states required:** loading (Skeleton) · empty (EmptyState text) · error (retry button) · success (Toast).
2. **One primary action per screen**: only the §3 table's "Primary action" is a primary button.
3. **No required sitter text input (P0, D38: near-zero writing; AI suggests chips from the day's records and photos, and the sitter just picks + an optional short note)**. Exceptions (all optional): daily report short note (≤ 200, D38), one-line check-in note (≤ 120, D34), editing the report text before posting, a one-line note on a handoff proposal, a short reply in the inquiry thread, the sitter's policy doc and preferred meeting spots (profile, written once). Owner text (inquiry questions · care request · consent signature name · preferred meeting spots) is allowed.
4. **DANGER modal** is a red full-screen modal that cannot close until the "I understand, don't feed" button is pressed (backdrop/ESC ignored).
5. **Photo picking:** every screen uses only `pickMedia()` (4.7). Native = `expo-image-picker` camera/album, mobile web = `capture` input, **desktop frame and demo accounts = sample photo tray + Choose from library** (the system file/gallery picker; same wording on phone and web demo, never "Upload from computer"). Samples also go through `uploadMedia()` as is, so the AI really analyzes them.
6. All user-facing text is English (D1). Empty state example: "No posts yet. Your sitter will share photos here."
7. Only dev builds show the `Owner`/`Sitter` role label in the header (`APP_ENV !== 'production'`).
8. **Everything works with a mouse (D25):** no gesture-only features (swipe back or delete, pulling a sheet down, long press, pull to refresh: web `RefreshControl` does not work). Always have a visible button. No libraries without web support (e.g. `@react-native-community/datetimepicker` → a hand-built picker UI). Every screen PR runs the [DESIGN.md §7.7](../../../DESIGN.md#77-works-with-a-mouse) desktop check.
9. **Maps are view-only (D32):** auto-fit (the side that travels + destination) + ± buttons, no drag pan or pinch, since a mouse drag inside the frame is used for scrolling (1.7). While sharing location, the top of the screen always shows "Sharing your location with Chloe until you arrive".
10. **Sensitive info card (D31):** while locked, entry info shows only "Unlocks Oct 9, 5:30 AM" + a lock icon; even when open, the code shows only after tapping **Show code**.
11. **Outside links open in a new tab (D45):** Google Meet links open in a new tab, not inside the phone frame (iframe) (`Linking.openURL` → `window.open` on web). Meet cannot be embedded in another site.

---

## 9. Shared AI call rules (`services/nebius.py`)

- **Why the OpenAI-compatible SDK (`openai` package)?** Nebius Token Factory offers **the same HTTP/API format as OpenAI Chat Completions** (`base_url` + `api_key` + `model` + `messages`). Instead of a separate Nemotron-only Python SDK, calling `OpenAI(base_url=..., api_key=...)` the same way as the official cookbook and examples lets one code path handle Vision · Super · Ultra · Nano by **changing only the per-region base URL** (eu-north1 / us-central1) **and the model ID**. (A direct `httpx` POST would also work, but the SDK already handles streaming, error types, and the multimodal `image_url` message format.)
- The **model role → (model_id, base_url)** mapping comes from env (§4). `OpenAI` client instances are cached per base_url.
- `chat(role, messages, **kw)` / `chat_json(role, messages, schema: type[BaseModel])`.
- `chat_json` rules: ① try `response_format={"type":"json_object"}` (a flag, after 7.1 checks support) ② strip `<think>…</think>` from the response ③ extract the first `{…}` block ④ pydantic validation ⑤ on failure, **retry once** with the correction message "Return only valid JSON matching the schema" ⑥ still failing → `ai_invalid_output`.
- Nemotron reasoning mode: **off** for captions and daily reports (speed), **on** for the safety reasoning step (after 7.1 checks each model's toggle, recorded in `nebius.py`).
- Prompt text is not hard-coded; it loads from files in `app/ai/prompts/**` (so Seulgi can tune without code changes).
- No real PII in inputs. Never print image base64 in logs.
- **Grounding (D27 to D29):** the model's input is only JSON the server gathered (schedule · quote · pet profile · RAG search results · that day's records). Prices · dates · availability · times must be **used as given**, and after the response the server checks the numbers again (07B: if an amount not in the input shows up, keep only the quote card and regenerate the text once; if it fails again, the fixed line "Chloe will confirm the details soon."). Entry info (D31) never goes into any prompt.
- **Tone layer (D35):** endpoints that write natural language for owners (inquiry-reply · daily-report · caption) do not build prompts themselves but go through `tone.compose(sitter_id, intent, facts)`: style guide + the sitter's top-k `tone_samples` (few-shot) + the server's fact JSON. First person ("I"); the server fills placeholders (`{PRICE}` · `{DATE}`) and checks numbers against the fact JSON (D29). Safety warnings · consents · quote numbers are fixed text and skip the layer. The sitter's approvals, edits, and regenerations are recorded in `tone_samples` (auto-sends are left out of learning). Owner messages are anonymized before saving.
- **Embeddings (D33):** `embed(texts)`: `MODEL_EMBED`, `dimensions=MODEL_EMBED_DIM` (1024), batch ≤ 16. Search is SQL `match_knowledge(query_embedding, p_sitter, p_pets[], p_owner, k)` (cosine, scope filter first). Source `source_type`: `sitter_policy` · `life_record` · `inquiry` · `care_request`. The same `(source_type, source_id)` is overwritten. **Search scope per source:** `sitter_policy` = that sitter · `life_record` · `care_request` = that pet (shared with a new sitter too; noted on the inquiry sheet, 07B) · `inquiry` = only when both that owner **and** that sitter match, and only owner messages are indexed (so conversations and amounts with another sitter never mix into a new sitter's draft).
- **Chip suggestions (D38):** for `report-chips`, the server builds day-record chips from the DB (no model), and only photo chips come from `MODEL_VISION`, 1-2 short phrases per photo. Chips are only suggestions; only the chips the sitter picked and the note become the daily report input (chips turned off are left out).
- **Call metrics log:** one structured log line per `chat()`/`chat_json()`: `{role, model, endpoint, ttft_ms, latency_ms, prompt_tokens, completion_tokens, retried, ok}` (TTFT = first streamed token; null for models that cannot stream). Prompt and response text are not logged. Used as a per-model median table in the Phase 10 README **Token Factory / Nemotron feedback** (required, scored) and Most Valuable Feedback.

---

## 10. Shared verification steps (how to check each phase's DoD)

| Level | Method |
| :--- | :--- |
| Backend | `cd backend && pytest -q` (AI tests skip without a Nebius key) + the phase doc's `curl` examples |
| DB/RLS | Run `supabase/tests/rls_smoke.sql` in the Supabase SQL Editor (`set local request.jwt.claims` per role) |
| Frontend | `npx tsc --noEmit` + Playwright mouse tests (1.7, CI) + a manual scenario in two browsers (normal window = owner, private window = sitter; `?view=split` after 10.10) **with a mouse in the desktop phone frame** ([DESIGN.md §7.7](../../../DESIGN.md#77-works-with-a-mouse) check) |
| Demo | Phase 10 "A Stay with Goldito" checklist ([the README, How Goldito works](../../../README.md#how-goldito-works)) |

---

## 11. CI/CD pipeline (D20)

```
PR open/update ──> ci.yml ─┬─ backend: ruff check · pytest -q                               ─┐
                           └─ frontend: npm ci · tsc --noEmit · expo export · playwright (1.7) ┴─> ✅ required checks → can merge
                  Vercel ──> Preview URL (PR comment)

main merge ─┬─> Vercel ──> production frontend auto-deploy
            └─> Render ──> backend/Dockerfile build · deploy → Health Check /health (keeps the previous deploy if it fails)

10-min cron ──> keepalive.yml ──> GET https://goldito-backend.onrender.com/health (keeps Render free awake; it sleeps after 15 minutes with no requests)
DB migration ──> a person runs 00N_*.sql in order in the SQL Editor (the PR body says "migration 00N must be applied")
```

| Item | Rule |
| :--- | :--- |
| CI trigger | `pull_request` + `push: main`. A `paths` filter runs the backend/frontend job only when that part changes (a docs-only PR skips; a job-level `if` makes the required check count "skipped = pass") |
| CI environment | Python 3.12 + pip cache, Node 20 LTS + npm cache + Playwright browser cache. Playwright serves the `expo export` output on a static server and tests with the mouse only (`EXPO_PUBLIC_DEV_ROUTES=1`, no backend needed). **PRs run Chromium · 1366×768 only; a push to main runs Chromium · Firefox · WebKit × 3 resolutions** (`PW_BROWSERS` · `PW_FRAME_VIEWPORTS`); Playwright is split across 2 runners (shards) with 4 workers each; the required check name `frontend` belongs to the job that collects both shard results; a new push to the same PR cancels the previous run. **No secrets**: AI tests skip without `NEBIUS_API_KEY`, Supabase calls are mocked |
| Branch protection | After 1.5, GitHub Settings → `main`: PR required, `ci / backend` · `ci / frontend` must pass (Minsik sets it) |
| GitHub Secrets | None: CD is the Render · Vercel Git integration. App runtime keys (Supabase · Cloudinary · Nebius Token Factory API) are stored **only in the Render env / Vercel env** |
| Rollback | backend: Render dashboard → Deploys → **Rollback** to the previous deploy. frontend: Vercel dashboard "Promote previous deployment" |
| Keep-alive | Render free **sleeps after 15 minutes with no requests**, and the first request then takes 30-50 seconds. Call `/health` every 10 minutes from two places: GitHub Actions `keepalive.yml` + **cron-job.org `Goldito Keepalive`** (GitHub cron can run a few minutes late). **Before deploy or test work, first check the ping is running** ([env-setup.md](../env-setup.md) § Deployed backend) |

