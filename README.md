> **Why we built this.** After dozens of stays as pet sitters — many with the same dogs and cats — we kept seeing the same thing: apps connect owners and sitters, and take a cut of every booking, but the stay itself (replies, house rules, daily notes) is still typed by hand, and a lot of it happens outside the app.
> **Why AI.** In our experience, owners who find typing hard — often seniors — leave their pet's profile half empty, and sitters spend their time writing instead of caring. Goldito's AI does the typing; people approve.

<div align="center">

<!-- TODO(logo): put the Goldito logo here, e.g. <img src="docs/assets/logo.png" alt="Goldito" width="120"> — waiting for Muk's design. The Expo template icon in frontend/assets is only a placeholder; do not use it. -->

# Goldito

**Leave your pet, keep your peace of mind.**
The whole stay — inquiry to the ride home — in one app, for **dogs and cats**.
An AI agent answers, plans, checks, and writes, so the sitter can just care.

[![Live demo](https://img.shields.io/badge/live%20demo-goldito--petcare.vercel.app-0070f3?style=flat-square)](https://goldito-petcare.vercel.app)
[![Hackathon](https://img.shields.io/badge/Nebius%20x%20NVIDIA-Best%20Apps%20%26%20Agents-76b900?style=flat-square)](docs/hackathon/README.md)
[![Nemotron on Token Factory](https://img.shields.io/badge/NVIDIA%20Nemotron-on%20Nebius%20Token%20Factory-76b900?style=flat-square)](#how-we-use-nvidia-nemotron--nebius-token-factory)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

[Try it](#try-it-in-60-seconds) · [What changes](#what-changes) · [How it works](#how-goldito-works) · [Agent](#the-goldito-agent) · [Nemotron](#how-we-use-nvidia-nemotron--nebius-token-factory) · [Privacy](#privacy--safety-by-design) · [Run it](#run-it-yourself)

</div>

---

## Try it in 60 seconds

> [!TIP]
> No setup: open **[goldito-petcare.vercel.app](https://goldito-petcare.vercel.app)** and tap **Try demo → Owner** (or **Sitter**). No sign-up and no password — the demo accounts and pets are fictional.

1. On a computer the app runs inside a phone frame: **click = tap, drag or scroll = swipe**. Sample photos are built in, so no camera is needed.
2. Open the other role in a private window to watch both sides of one stay.

> [!NOTE]
> The backend runs on a free plan: the first request after a quiet spell can take 30–50 s while it wakes up (we ping it every 10 minutes).

**Demo video:** _coming_

> [!NOTE]
> **Status legend** (as of 2026-10-11; refreshed at submission): ✅ works in the live demo · 🚧 being built before the deadline · 🔭 after the hackathon

---

## What changes

| For owners | For sitters |
| :--- | :--- |
| **Never need to ask.** Your pet's status — trip updates, photos, a daily note — arrives on its own, so you can relax. | **Just care, snap, and tap.** Replies, notes, and checklists are drafted for you; nothing in the house rules gets missed; you spend your time on the pet. |
| **A profile that gets filled in.** Photo, voice, and big one-question screens help even first-time and senior users describe their pet. 🚧 | **No more digging through old messages** for the medication time or the "don't knock" rule — it is on the checklist. |

## The five stages — and what the AI does in each

| Stage | What the AI does | Status |
| :--- | :--- | :--- |
| **① Inquiry** | Drafts the reply **in the sitter's own writing style**, from the sitter's calendar, a server-side quote, house policy, and the pet's Life Record | ✅ |
| **② Meet & Greet** | Turns the owner's care note into a timed **mission checklist** and Heads-up cards | ✅ · Google Meet link ✅ server, app check 🚧 |
| **③ Booking** | Stays out of the way on purpose: consents, prices, and the timed unlock come from fixed rules, never from the model | ✅ |
| **④ Care & Pet Transit** | Suggests the day's chips, writes the **daily note**, captions and sorts photos · live trip + photo check 🚧 | ✅ care · 🚧 transit |
| **⑤ Completion** | Writes the pet's **Life Record** and remembers it for the next stay — even with a new sitter | ✅ |

**More than sitting — reasons to stay in the app.** Between stays, Goldito keeps the pet's story: a photo **album**, a **diary** of every stay, a **Life Record** that follows the pet to any sitter, **favorite sitters**, two-way **reviews**, and live notifications ✅. Coming next: a **pet profile** built from a photo, your voice, and a few big-button questions 🚧, a **mood meter**, and an **8-bit pet room** 🔭.

---

## How Goldito works

```
 ① Inquiry ──> ② Meet & Greet ──> ③ Booking ──> ④ Care & Pet Transit ──> ⑤ Completion
 AI drafts in    care request       consents,      live trip · 5-second      home safe · review ·
 sitter's tone → checklist        payment,       check · AI daily note     Pet Life Record → RAG
                                   timed unlock                                       │
      ▲                                                                               │
      └──────────────── the next stay starts with everything Goldito learned ─────────┘
```

Full flow and every decision: [full-process.ko.md](docs/plan/full-process.ko.md).

Tap a stage to expand it.

<details>
<summary><b>① Inquiry — a reply in the sitter's own writing style ✅</b></summary>

- The owner picks **Boarding** (at the sitter's home) or **House sitting** (at the owner's home), the dates, and the pets — their profiles (breed, age, allergies) go with the question. With **Ask before booking**, nothing is booked until a request is sent.
- **Goldito AI drafts the reply in seconds** (about 3 s median), in the sitter's own style learned from their past conversations: availability from the sitter's calendar, a quote with **holiday** and **multi-pet** rates, answers from the house policy and the pet's **Life Record** (RAG). The sitter sends it with one tap — or opts in to auto-send, which answers at a human pace after a clear responsibility prompt — so a busy or sleeping sitter still answers first. The thread keeps going: the owner can write back, **change the dates in the same conversation**, and the sitter's Accept / Decline / Suggest other dates are drafted for them too.
- Prices and availability are calculated by the server, never by the model — "can she take these dates?" uses the same rule as the booking engine, and the reply and the checkout always show the same numbers.

</details>

<details>
<summary><b>② Meet & Greet — the care request becomes a checklist ✅</b></summary>

- The owner writes a **care & medication request** like a note: *"8 AM — 1 cup of kibble · 2 PM — skin pill in a treat · No knocking — text me · Keep other dogs away on walks."* Nemotron turns it into timed tasks and **Heads-up** cards, and the owner reviews it before saving. While a stay is on, changes go through a request the sitter approves.
- **First stay together? Meet first.** After the booking request, a first-time owner and sitter meet in person, at a spot either of them saved, or on video with a **Google Meet** link and calendar invite created the moment they agree on a time (server done, app check 🚧). Either side can ask to skip; if the other says no, the booking is cancelled and the owner finds another sitter. Repeat clients skip this step.
- They choose how the pet travels: **Owner drives** or **Sitter drives**.

</details>

<details>
<summary><b>③ Booking — consents, payment, and secrets that unlock on time ✅</b></summary>

- **Consent forms** are generated for the chosen options, Canada-first: 24-hour emergency vet authorization, lockbox / buzzer / fob use, sharing space with other pets, and safe-return rules.
- **Payment** is simulated in the demo — no card needed.
- **Timed unlock:** for boarding, the sitter's address, visitor parking, and a packing list appear right after payment. Entry info for the owner's home (lockbox code, buzzer) **unlocks for the sitter only 2 hours before the visit**, and the owner is told when it opens.

</details>

<details>
<summary><b>④ Care & Pet Transit — 5-second checks, AI daily notes, live trips</b></summary>

- ✅ **5-second check:** Goldito suggests chips from the day's check-ins and photos — Meal ✅ · Potty ✅ · Walk 20 min ✅ · Meds ✅ · 🐿️ Squirrel at the park. The sitter turns off anything wrong and adds a short line if they want. **Nemotron writes the daily note** in the sitter's own voice from only those facts, and it is posted once the sitter approves it. Need another note the same day? Write another.
- ✅ **Timeline album:** every photo gets an AI caption and is sorted into Meals · Walks · Naps by day.
- 🚧 **Uber-style transit:** whoever is driving taps **Start trip** (after a clear location prompt); the other side sees a live map and ETA, and on arrival the owner gets visitor-parking directions while the sitter gets the buzzer and lockbox card. If someone declines to share location, both sides still see the meeting place with an **Open in Google Maps** button.
- 🚧 **Photo check-in:** one photo at the handoff, and a vision model confirms the pet is there and secured in the car (crate or seatbelt) — advice only, the sitter can continue.
- 🚧 **Treat Safety Guard** *(stretch)*: scan a treat label; Nemotron Ultra and a curated toxic-ingredient table catch allergens and hidden sources (for example, chicken in "animal fat") before the treat is fed.

> *"Max took the skin pill you left, tucked inside her treat, and finished every bit of her kibble! On our 20-minute morning walk she spotted a squirrel in the park and got so excited — it was adorable. Her potty was perfectly healthy, too. 🐶"*
> — an AI daily note built from a few chips, two photos, and one short line from the sitter

</details>

<details>
<summary><b>⑤ Completion — home safe, and a record that remembers ✅</b></summary>

- The final handoff comes with a *"Max is home safe 🏠"* report, then a thank-you and a **5-star review** request. Sitters can also leave a private note about the owner that the owner never sees.
- Nemotron turns the whole stay — check-ins, tasks, daily notes — into the pet's **Life Record**: eating habits, potty patterns, medication response, behavior, and cautions.
- The Life Record goes into a **RAG knowledge base**. On the next booking, even with a **new sitter**, the AI reply, the checklist, and the sitter's request card already know the pet.

</details>

---

## The Goldito Agent

Goldito's AI works like an agent. Each event in a stay triggers it; it gathers the facts it needs, acts, and remembers. **A person approves anything that reaches the other side.**

| When this happens | The agent | A person decides |
| :--- | :--- | :--- |
| An owner asks about a stay | Checks the calendar, gets the server's quote, searches the pet's Life Record, and drafts a reply in the sitter's voice | The sitter taps **Send**, or turns on auto-send |
| The owner writes a care request | Turns it into timed tasks and Heads-up cards | The owner reviews and saves |
| A handoff photo is taken 🚧 | Checks that the pet is there and secured in the car | Advice only — the sitter can continue |
| The day ends | Suggests chips from check-ins and photos, then writes the daily note | The sitter fixes the chips, adds a line, and approves |
| The stay ends | Writes the pet's Life Record and indexes it for next time | The owner reads it |
| The next inquiry arrives | Retrieves that Life Record, so even a new sitter starts informed | — |
| A new owner registers a pet 🚧 | Reads a photo and a few spoken sentences, and suggests the profile — breed, coat, habits | The owner confirms every suggestion; safety answers are never pre-filled |

> [!IMPORTANT]
> Prices, dates, and entry codes never come from the model: the server supplies them, and the agent only writes around them.

---

## A Stay with Goldito (demo path)

Thanksgiving weekend: Robert leaves **Max** (dog, Maltese, allergic to chicken) and **Mochi** (cat) with sitter Chloe.

<details>
<summary><b>The full script — five stages, one weekend</b></summary>

```
Mon 22:40  ① Robert asks Chloe about Oct 9–12 → Chloe's auto-send is on → "Chloe is typing…" and a reply ~30 s
              later: available, total incl. the Thanksgiving and second-pet rates, "Max takes her pill best in a treat — happy to do that"
Tue        ② Booking request → care request → AI checklist → first stay together, so a video Meet & Greet
              (Google Meet link + calendar invite) → drop-off: Sitter drives, pick-up: Owner drives
Wed        ③ Chloe accepts → Robert signs 5 consents → pays (demo) → Chloe's address + visitor parking unlock
Fri 05:30     Entry info becomes available to Chloe (2 h before pick-up); Robert is told the moment she first opens it
Fri 07:30  ④ 🚧 Chloe starts the trip (taps Allow on the location screen) → Robert watches the ETA → buzzer + lockbox card on arrival
              → photo of Max's crate in the car → ✅ "Pick-up complete — care has started"
Fri 18:00     ✅ Suggested chips from the day + 2 photos → Chloe adds one short line → AI daily note → she approves
              → posted · album sorted into Meals · Walks · Naps
Mon 17:00  ⑤ 🚧 Robert drives over (Chloe sees the ETA) → visitor parking card → return photo
              → ✅ "Max and Mochi are home safe 🏠" → ★★★★★ → Life Record updated for the next sitter
```

</details>

The trip and photo-check scenes are built last in the schedule and are marked 🚧 until they ship; every other step runs in the live demo today.

---

## How We Use NVIDIA Nemotron & Nebius Token Factory

Every reasoning and writing call runs on **Nebius Token Factory** through its OpenAI-compatible API, from the backend only. NVIDIA Nemotron does the reasoning and writing; a Token Factory vision model reads photos; a Token Factory embedding model powers retrieval. Role → model IDs: [model-ids.md](docs/plan/phases/notes/model-ids.md).

| Stage | AI task | Model ID | Why |
| :--- | :--- | :--- | :--- |
| ① Inquiry | Inquiry auto-reply — a draft in the sitter's tone, grounded in the sitter's calendar, server-side quote, house policy, and the pet's Life Record. About 3 s (median) | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` + Qwen3 Embedding | Fast enough to answer in seconds; facts and prices come from the server, and every amount in the draft is checked against the quote |
| ① ⑤ Retrieval | Embeddings for the RAG knowledge base (Life Records, policies, past questions) | `Qwen/Qwen3-Embedding-8B` (1024-dim) | The embedding model on Token Factory; stored in Supabase pgvector |
| ② Meet & Greet | Care & medication request → structured mission checklist | `nvidia/nemotron-3-super-120b-a12b` | Reliable structure for times, doses, and cautions |
| ④ Transit 🚧 | Handoff photo check — pet visible, crate or seatbelt in the car | `openbmb/MiniCPM-V-4_5` ¹ | Vision model on Token Factory |
| ④ Care | Photo descriptions → warm daily note from the 5-second check | `openbmb/MiniCPM-V-4_5` → `nvidia/nemotron-3-super-120b-a12b` | Few-shot tone from 3 years of (anonymized) real reports |
| ④ Album | Caption + category (Meals · Walks · Naps · Play) | `openbmb/MiniCPM-V-4_5` | One call per photo (about 1 s), no sitter typing |
| ④ Treat guard 🚧 *(stretch)* | Allergen & hidden-ingredient reasoning | `nvidia/Nemotron-3-Ultra-550b-a55b` | Safety-critical → strongest reasoning |
| ⑤ Completion | Stay → Pet Life Record (eating, potty, meds, behavior, cautions) | `nvidia/nemotron-3-super-120b-a12b` | Long-context summarizing that only uses recorded facts |
| New pet 🚧 | Spoken description → profile facts, each with the sentence it came from | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | Server drops any value that has no matching quote |

¹ NVIDIA's vision models on Token Factory (`Nemotron-Nano-V2-12b`, `Cosmos3-Super-Reasoner`, `Nemotron-3-Nano-Omni`) are offered only as dedicated endpoints, not on the shared API (checked 2026-10-02), and keeping one running through judging would cost more than our credits — so vision uses MiniCPM-V-4.5 on the shared API. Reasoning, writing, and replies stay on Nemotron.

**Other services we use:** **Tavily** (web search for ingredients and recalls, and breed needs — 🚧), **Groq Whisper** for speech-to-text on the pet-profile voice step 🚧 (Token Factory has no speech model — checked 2026-10-10), **Cloudinary** (photos), **Supabase** (database, auth, realtime, pgvector), **Google Calendar / Meet**, **OpenStreetMap**.

**Hosting.** The web app is on **Vercel**; the FastAPI backend is on **Render** (Docker, free plan). Render's free plan sleeps after 15 minutes, so a GitHub Actions job and an external cron both ping `/health` every 10 minutes; a daily database ping keeps Supabase from pausing 🚧.

<!-- TODO(10.6, before submission): "Where Token Factory accelerated our workflow" + the per-model feedback table. Do not invent content. -->

---

## Privacy & Safety by Design

- **Entry info unlocks on time.** Lockbox and buzzer codes are readable only by the booked sitter, from 2 hours before the visit until the stay ends, and the owner is notified when they open. They never enter AI prompts or the RAG knowledge base.
- **Need-to-know access.** A sitter sees an owner's name and the pet asked about only for as long as the question or booking is live.
- **Location only while moving.** Trips share one live position, only with the other person on the booking, and stop when you arrive. No route history is stored. Declining is fine — the meeting place is still shown. 🚧
- **The AI never invents facts.** Prices, dates, and availability come from the database; daily notes and Life Records use only what was recorded that day; a person approves every AI message that reaches the other side.
- **AI drafts can be wrong, and are not veterinary advice.** The pet profile (🚧) is the owner's description, **not a behavior assessment**.
- **No real personal data.** Demo accounts, pets, addresses, and codes are fictional; real messages used for tone are anonymized before they reach a prompt.

---

## Architecture

<details>
<summary><b>Architecture and stack</b></summary>

```
[ Owner app ]            [ Sitter app ]
      └──────────┬──────────┘
                 ▼
   Expo (React Native for Web / iOS / Android) — phone frame on desktop browsers
                 │  REST / JSON · Realtime (notifications, live threads)
                 ▼
        FastAPI (Python backend)
          ├── Supabase     → PostgreSQL + RLS · Auth · Realtime · pgvector (RAG)
          ├── Cloudinary   → photo/video storage, compression, thumbnails
          ├── Nebius Token Factory
          │     ├── Nemotron Nano   → inquiry auto-replies, profile facts from speech
          │     ├── Nemotron Super  → checklists, daily notes, Life Records
          │     ├── Nemotron Ultra  → treat safety reasoning (stretch)
          │     ├── MiniCPM-V       → captions, album sorting, handoff checks
          │     └── Qwen3 Embedding → RAG retrieval
          ├── Google Calendar → Google Meet links + invites (video Meet & Greet)
          ├── OpenStreetMap → trip map (view only)
          ├── Tavily       → ingredient / recall / breed web search (stretch)
          └── Groq Whisper → speech-to-text for the pet-profile voice step (planned)
```

| Area | Stack |
| :--- | :--- |
| Frontend | Expo (React Native for Web) · **Vercel** |
| Backend | FastAPI (Python 3.12) · Docker · **Render** |
| Database / Auth / Realtime / Vector search | Supabase (PostgreSQL, RLS, pgvector) |
| Media | Cloudinary |
| AI | NVIDIA Nemotron + MiniCPM-V (vision) + Qwen3 Embedding on Nebius Token Factory · Groq Whisper (speech) |
| Maps | Leaflet + OpenStreetMap |
| Video Meet & Greet | Google Meet (via the Google Calendar API) |
| Web search | Tavily (stretch) |
| Notifications | Supabase Realtime in-app alerts (web demo) · Expo push notifications (native apps, after the hackathon) |

</details>

---

## Run it yourself

The live demo above is the fastest way to see Goldito. To run your own copy you need a **Supabase** project, a **Nebius Token Factory** key, and a **Cloudinary** account (Tavily and Google OAuth are optional). Secrets setup: [env-setup.ko.md](docs/plan/env-setup.ko.md).

```bash
git clone https://github.com/minsikpaul92/Goldito.git && cd Goldito

# 1. Database — apply supabase/migrations/*.sql in order (see supabase/README.md)

# 2. Backend
cd backend && cp .env.example .env            # fill the keys
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m scripts.seed_demo                    # creates the demo owner + sitter
uvicorn app.main:app --reload --port 8000

# 3. Frontend (new terminal)
cd frontend && cp .env.example .env            # EXPO_PUBLIC_API_URL=http://localhost:8000
npm install && npx expo start --web --port 8081
```

Open `http://localhost:8081` and use **Try demo**. Tests: `pytest -q` in `backend/`, Playwright in `frontend/` (see its README).

| Path | Doc |
| :--- | :--- |
| Backend env & run | [backend/README.md](backend/README.md) |
| Frontend env & run | [frontend/README.md](frontend/README.md) |
| DB migrations | [supabase/README.md](supabase/README.md) |
| Product flow · decisions · test guide | [full-process.ko.md](docs/plan/full-process.ko.md) · [architecture.ko.md](docs/plan/phases/architecture.ko.md) · [test-guide.ko.md](docs/plan/test-guide.ko.md) |

---

## What's Next

<details>
<summary><b>Roadmap — after the hackathon</b></summary>

- **Real payments** — Stripe checkout, refunds, and taxes in place of the demo payment.
- **Road-based ETA** — routing API, address search, and background location on native apps.
- **Drop-in visits** — short house visits with their own capacity rules.
- **Settings & patch notes** — in-app **What's New** from the [CHANGELOG](docs/CHANGELOG.md).
- **8-bit pet status room** — Tamagotchi-style Home dashboard: fed, potty, mood, next task.
- **Decorated daily notes** — pet cut-out stickers and AI-picked themes turn each note into a keepsake card.
- **Mood from video** — a short clip becomes a one-line mood note, based only on what the pet is visibly doing.
- **Pawstagram** and a **pet-friendly map** — a public feed for pet lovers, and cafés, stores, and parks that welcome pets.
- **Sitter desktop** — sitters plan schedules and send daily notes faster from a computer; owners stay on their phone.

</details>

---

## Resources

- Product flow and decisions: [full-process.ko.md](docs/plan/full-process.ko.md) · [architecture.ko.md](docs/plan/phases/architecture.ko.md) · [test-guide.ko.md](docs/plan/test-guide.ko.md)
- Code: [backend](backend/README.md) · [frontend](frontend/README.md) · [database](supabase/README.md) · [development plan](docs/plan/README.md)
- [Hackathon rules](docs/hackathon/README.md) · [한국어 README](docs/README.ko.md)

---

## Team

| Member | Role |
| :--- | :--- |
| **Minsik** | Full-Stack Lead |
| **Seulgi** | AI & Prompt Engineer · Data Anonymization |
| **Muk** | Product & UX/UI Designer |

---

## License

[MIT](LICENSE)
