# 🐾 Goldito

> **Leave your pet, keep your peace of mind.**
> The whole pet-sitting journey for **dogs and cats** in one app — from the first question to the ride home — with an AI agent that answers, plans, checks, and writes so the sitter can just care. Powered by **NVIDIA Nemotron on Nebius Token Factory**.
>
> *Nebius x NVIDIA Global AI Hackathon · Track: Best Apps and Agents*

🇰🇷 [한국어](docs/README.ko.md) · 🛠️ [Development plan](docs/plan/README.md) · 📋 [Hackathon rules](docs/hackathon/README.md)

**Live demo:** [goldito-petcare.vercel.app](https://goldito-petcare.vercel.app) (sign in with **Try demo → Owner / Sitter**) · **Demo video:** _TBD_ · **Test accounts:** _TBD_

---

## 📌 The Problem

After 3 years of pet sitting, we saw the same things go wrong at every step of a stay:

| Step | What goes wrong today |
| :--- | :--- |
| **Inquiry** | Owners often book whoever answers first. A sitter who is busy with pets — or asleep — loses the booking. |
| **Meet & Greet** | Meals, pills, and house rules are passed on by voice or chat, and details get lost. |
| **Booking** | Lockbox codes and home addresses sit in plain chat days before they are needed. Emergency vet consent is rarely written down. |
| **Care & transit** | Owners keep texting: *"Did you leave yet?" "Did she eat?" "Can I see a photo?"* Sitters spend their time typing instead of caring. |
| **After the stay** | Everything the sitter learned about the pet disappears in a chat thread. The next sitter starts from zero. |

## 💡 Our Answer

| For owners | For sitters |
| :--- | :--- |
| **Never need to ask.** Replies, trip updates, photos, and daily notes arrive on their own. | **Just care, snap, and tap.** No quoting, no report writing, no answering the same questions. |

Goldito combines three experiences people already trust, and adds an AI agent that does the typing:

- **Rover**-style booking — find a sitter, ask, book.
- **KidsNote**-style care — medication requests, check-in and check-out, daily notes, photo albums.
- **Uber**-style trips — live location and ETA for every drop-off and pick-up.

---

## 🔄 How Goldito Works — 5 Stages

```
 ① Inquiry ──> ② Meet & Greet ──> ③ Booking ──> ④ Care & Pet Transit ──> ⑤ Completion
 AI drafts in    care request       consents,      live trip · 5-second      home safe · review ·
 sitter's tone → checklist        payment,       check · AI daily note     Pet Life Record → RAG
                                   timed unlock                                       │
      ▲                                                                               │
      └──────────────── the next stay starts with everything Goldito learned ─────────┘
```

### ① Inquiry — a reply in the sitter's own writing style
- The owner picks **Boarding** (at the sitter's home) or **House sitting** (at the owner's home), the dates, and the pets — their profiles (breed, age, allergies) go with the question.
- **Goldito AI drafts the reply in seconds, in the sitter's own writing style** (learned from the sitter's past conversations): availability from the sitter's calendar, a quote with **holiday** and **multi-pet** rates, and answers from the sitter's house policy and the pet's **Life Record** (RAG). The sitter sends it with one tap — or opts in to auto-send, which answers right away at a human pace after a clear responsibility prompt — so a busy or sleeping sitter still answers first.
- Prices are calculated by the server, never by the model — the reply and the checkout always show the same numbers.

### ② Meet & Greet — the care request becomes a checklist
- The owner writes a **care & medication request** like a note: *"8 AM — 1 cup of kibble · 2 PM — skin pill in a treat · No knocking — text me · Keep other dogs away on walks."*
- Nemotron turns it into the sitter's **mission checklist** (timed tasks) and **Heads-up** cards. The owner reviews it before saving.
- **First stay together? Meet first.** After the booking request, a first-time owner and sitter meet in person, at one of the spots either of them saved, or on video: Goldito creates a **Google Meet** link and calendar invite the moment they agree on a time. Either side can ask to skip; if the other says no, the booking is cancelled and the owner finds another sitter. Repeat clients skip this step.
- They choose how the pet travels: **Owner drives** or **Sitter drives**.

### ③ Booking — consents, payment, and secrets that unlock on time
- **Consent forms** are generated for the chosen options, Canada-first: 24-hour emergency vet authorization, lockbox / condo buzzer and fob use, sharing space with other pets, and safe-return rules.
- **Payment** (simulated in the demo — no card needed).
- **Timed unlock:** for boarding, the sitter's address, visitor parking, and a packing list appear right after payment. Entry info for the owner's home (lockbox code, buzzer) **unlocks for the sitter only 2 hours before the visit** — and the owner is told when it opens.

### ④ Care & Pet Transit — live trips, 5-second checks, AI daily notes
- **Uber-style transit:** whoever is driving taps **Start trip**; the other side sees a live map and ETA. On arrival the owner gets visitor-parking directions, and the sitter gets the buzzer and lockbox card.
- **Photo check-in:** the sitter snaps one photo at the handoff, and a vision model confirms the pet is there and secured in the car (crate or seatbelt). The owner gets *"Pick-up complete — care has started · photo verified."*
- **5-second check:** Goldito suggests chips from the day's check-ins and photos — Meal ✅ · Potty ✅ · Walk 20 min ✅ · Meds ✅ · 🐿️ Squirrel at the park. The sitter turns off anything wrong and adds a short note if they want. **Nemotron writes the daily note** in the sitter's own voice from only those facts, and it is posted once the sitter approves it.
- **Timeline album:** every photo gets an AI caption and is sorted into Meals · Walks · Naps by day, KidsNote-style.
- **Treat Safety Guard** *(stretch)*: scan a treat label, and Nemotron Ultra catches allergens and hidden sources (for example, chicken in "animal fat") before the treat is fed.

> *"Max took the skin pill you left, tucked inside her treat, and finished every bit of her kibble! On our 20-minute morning walk she spotted a squirrel in the park and got so excited — it was adorable. Her potty was perfectly healthy, too. 🐶"*
> — an AI daily note built from a few chips, two photos, and one short line from the sitter

### ⑤ Completion — home safe, and a record that remembers
- The final handoff comes with a photo and a *"Max is home safe 🏠"* report, then a thank-you and a **5-star review** request.
- Nemotron turns the whole stay — check-ins, tasks, daily notes, handoff checks — into the pet's **Life Record**: eating habits, potty patterns, medication response, behavior, and cautions.
- The Life Record is stored in a **RAG knowledge base**. On the next booking, even with a **new sitter**, the AI reply, the checklist, and the sitter's request card already know the pet.

---

## 🤖 The Goldito Agent

Goldito's AI works like an agent. Each event in a stay triggers it; it gathers the facts it needs, acts, and remembers. A person approves anything that reaches the other side.

| When this happens | The agent | A person decides |
| :--- | :--- | :--- |
| An owner asks about a stay | Checks the calendar, gets the server's quote, searches the pet's Life Record, and drafts a reply in the sitter's voice | The sitter taps **Send**, or turns on auto-send |
| The owner writes a care request | Turns it into timed tasks and Heads-up cards | The owner reviews and saves |
| A handoff photo is taken | Checks that the pet is there and secured in the car | Advice only — the sitter can continue |
| The day ends | Suggests chips from check-ins and photos, then writes the daily note | The sitter fixes the chips, adds a line, and approves |
| The stay ends | Writes the pet's Life Record and indexes it for next time | The owner reads it |
| The next inquiry arrives | Retrieves that Life Record, so even a new sitter starts informed | — |

Prices, dates, and entry codes never come from the model: the server supplies them, and the agent only writes around them.

---

## 🗓️ A Stay with Goldito (demo path)

Thanksgiving weekend: Robert leaves **Max** (dog, Maltese, allergic to chicken) and **Mochi** (cat) with sitter Chloe.

```
Mon 22:40  ① Robert asks Chloe about Oct 9–12 → Chloe's auto-send is on → "Chloe is typing…" and a reply ~30 s
              later: available, total incl. the Thanksgiving and second-pet rates, "Max takes her pill best in a treat — happy to do that"
Tue        ② Booking request → care request → AI checklist → first stay together, so a video Meet & Greet
              (Google Meet link + calendar invite) → drop-off: Sitter drives, pick-up: Owner drives
Wed        ③ Chloe accepts → Robert signs 5 consents → pays (demo) → Chloe's address + visitor parking unlock
Fri 05:30     Entry info unlocks for Chloe (2 h before pick-up) → Robert is notified
Fri 07:30  ④ Chloe starts the trip (taps Allow on the location screen) → Robert watches the ETA → buzzer + lockbox card on arrival
              → photo of Max's crate in the car → ✅ "Pick-up complete — care has started"
Fri 18:00     Suggested chips from the day + 2 photos → Chloe adds one short line → AI daily note → she approves
              → posted · album sorted into Meals · Walks · Naps
Mon 17:00  ⑤ Robert drives over (Chloe sees the ETA) → visitor parking card → return photo
              → "Max and Mochi are home safe 🏠" → ★★★★★ → Life Record updated for the next sitter
```

On a computer, the demo runs inside a phone frame — **click = tap, drag or scroll = swipe**. Sample photos and a **Simulate the drive** button are built in, so no camera or GPS is needed.

---

## 🟩 How We Use NVIDIA Nemotron & Nebius Token Factory

Every AI call runs on **Nebius Token Factory** through its OpenAI-compatible API, from the backend only. NVIDIA Nemotron does the reasoning and writing; a Token Factory vision model reads photos; a Token Factory embedding model powers retrieval. Role → model IDs: [model-ids.md](docs/plan/phases/notes/model-ids.md).

| Stage | AI task | Model ID | Why |
| :--- | :--- | :--- | :--- |
| ① Inquiry | Inquiry auto-reply — Reply draft in the sitter's tone, grounded in the sitter's calendar, server-side quote, house policy, and the pet's Life Record. Answered in about 3 s (p50) | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` + Qwen3 Embedding | Fast enough to answer in seconds; facts and prices come from the server, and every amount in the draft is checked against the quote |
| ① ⑤ Retrieval | Embeddings for the RAG knowledge base (Life Records, policies, past questions) | `Qwen/Qwen3-Embedding-8B` (1024-dim) | The embedding model on Token Factory; stored in Supabase pgvector |
| ② Meet & Greet | Care & medication request → structured mission checklist | `nvidia/nemotron-3-super-120b-a12b` | Reliable structure for times, doses, and cautions |
| ④ Transit | Handoff photo check — pet visible, crate or seatbelt in the car | `openbmb/MiniCPM-V-4_5` ¹ | Vision model on Token Factory |
| ④ Care | Photo descriptions → warm daily note from the 5-second check | `openbmb/MiniCPM-V-4_5` → `nvidia/nemotron-3-super-120b-a12b` | Few-shot tone from 3 years of (anonymized) real reports |
| ④ Album | Caption + category (Meals · Walks · Naps · Play) | `openbmb/MiniCPM-V-4_5` | One call per photo, no sitter typing |
| ④ Treat guard *(stretch)* | Allergen & hidden-ingredient reasoning | `nvidia/Nemotron-3-Ultra-550b-a55b` | Safety-critical → strongest reasoning |
| ⑤ Completion | Stay → Pet Life Record (eating, potty, meds, behavior, cautions) | `nvidia/nemotron-3-super-120b-a12b` | Long-context summarizing that only uses recorded facts |

¹ NVIDIA's vision models on Token Factory (`Nemotron-Nano-V2-12b`, `Cosmos3-Super-Reasoner`, `Nemotron-3-Nano-Omni`) are offered only as dedicated endpoints, not on the shared API (checked 2026-10-02), and keeping one running through judging would cost more than our credits — so vision uses MiniCPM-V-4.5 on the shared API. Reasoning, writing, and replies stay on Nemotron.

**Other Nebius services**
- **Nebius AI Cloud — Serverless Endpoint** — hosts the FastAPI backend (Render only as an emergency fallback).
- **Serverless Jobs** *(planned)* — scheduled reminders and end-of-day report drafts.

**Where Token Factory accelerated our workflow:** _to be written after development._

---

## 🔐 Privacy & Safety by Design

- **Entry info unlocks on time.** Lockbox and buzzer codes are readable only by the booked sitter, from 2 hours before the visit until the stay ends, and the owner is notified when they open. They never enter AI prompts or the RAG knowledge base.
- **Location only while moving.** Trips share one live position, only with the other person on the booking, and stop when you arrive. No route history is stored.
- **Video Meet & Greets run on Google Meet.** Goldito shares only the owner's and sitter's account emails with Google, to send the calendar invite.
- **The AI never invents facts.** Prices, dates, and availability come from the database; daily notes and Life Records use only what was recorded that day.
- **No real personal data.** Demo accounts, pets, addresses, and codes are fictional; real messages used for tone are anonymized before they reach a prompt.

---

## 🛠️ Architecture

```
[ Owner app ]            [ Sitter app ]
      └──────────┬──────────┘
                 ▼
   Expo (React Native for Web / iOS / Android) — phone frame on desktop browsers
                 │  REST / JSON · Realtime (notifications, live trips)
                 ▼
        FastAPI (Python backend)
          ├── Supabase     → PostgreSQL + RLS · Auth · Realtime · pgvector (RAG)
          ├── Cloudinary   → photo/video storage, compression, thumbnails
          ├── Nebius Token Factory
          │     ├── Nemotron Nano   → inquiry auto-replies
          │     ├── Nemotron Super  → checklists, daily notes, Life Records
          │     ├── Nemotron Ultra  → treat safety reasoning (stretch)
          │     ├── MiniCPM-V       → handoff checks, captions, album sorting
          │     └── Qwen3 Embedding → RAG retrieval
          ├── Google Calendar → Google Meet links + invites (video Meet & Greet)
          ├── OpenStreetMap → trip map (view only)
          └── Tavily       → ingredient / recall web search (safety stretch)
```

| Area | Stack |
| :--- | :--- |
| Frontend | Expo (React Native for Web) |
| Backend | FastAPI (Python 3.12) |
| Database / Auth / Realtime / Vector search | Supabase (PostgreSQL, RLS, pgvector) |
| Media | Cloudinary |
| AI | NVIDIA Nemotron + MiniCPM-V (vision) + Qwen3 Embedding on Nebius Token Factory |
| Maps | Leaflet + OpenStreetMap |
| Video Meet & Greet | Google Meet (via the Google Calendar API) |
| Web search | Tavily |
| Notifications | Supabase Realtime in-app alerts (web demo) · Expo push notifications (native apps, after the hackathon) |

---

## 🚀 Getting Started

Monorepo: `backend/` (FastAPI), `frontend/` (Expo Web), `supabase/migrations/`. Apply the migrations, run backend then frontend, and open `/dev/health` (with `EXPO_PUBLIC_DEV_ROUTES=1`) to tap **Check API**; `/` opens sign in. Full judge-ready steps land in Phase 10.

| Path | Doc |
| :--- | :--- |
| Backend env & run | [backend/README.md](backend/README.md) |
| Frontend env & run | [frontend/README.md](frontend/README.md) |
| DB migrations | [supabase/README.md](supabase/README.md) |
| Local secrets | [docs/plan/env-setup.ko.md](docs/plan/env-setup.ko.md) |

```bash
cd backend && cp .env.example .env   # fill per env-setup.ko.md
cd frontend && cp .env.example .env  # EXPO_PUBLIC_API_URL=http://localhost:8000
# Then follow backend/ and frontend/ README run commands.
```

---

## 🔭 What's Next

- **Real payments** — Stripe checkout, refunds, and taxes in place of the demo payment.
- **Road-based ETA** — routing API, address search, and background location on native apps.
- **Drop-in visits** — short house visits with their own capacity rules.
- **Settings & patch notes** — in-app **What's New** from the [CHANGELOG](docs/CHANGELOG.md).
- **8-bit pet status room** — Tamagotchi-style Home dashboard: fed, potty, mood, next task.
- **Decorated daily notes** — pet cut-out stickers and AI-picked themes turn each note into a keepsake card.
- **Mood from video** — a short clip becomes a one-line mood note, based only on what the pet is visibly doing.
- **Pawstagram** and a **pet-friendly map** — a public feed for pet lovers, and cafés, stores, and parks that welcome pets.
- **Sitter desktop** — sitters plan schedules and send daily notes faster from a computer; owners stay on their phone.

---

## 👥 Team

| Member | Role |
| :--- | :--- |
| **Minsik** | Full-Stack Lead |
| **Seulgi** | AI & Prompt Engineer · Data Anonymization |
| **Muk** | Product & UX/UI Designer |

---

## 📄 License

[MIT](LICENSE)
