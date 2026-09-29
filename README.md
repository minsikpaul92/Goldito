# 🐾 PawNote

> **Leave your dog, keep your peace of mind.**
> A Kidsnote-style care app for dog walkers and pet sitters, powered by NVIDIA Nemotron on Nebius Token Factory.
>
> *Nebius x NVIDIA Global AI Hackathon · Track: Best Apps and Agents*

🇰🇷 [한국어](docs/README.ko.md) · 🛠️ [Development plan](docs/plan/README.md) · 📋 [Hackathon rules](docs/hackathon/README.md)

**Live demo:** _TBD_ · **Demo video:** _TBD_ · **Test accounts:** _TBD_

---

## 📌 The Problem

In Korea, daycare parents rely on **Kidsnote** — a daily feed of photos, reports, and medication logs — so they never have to ask "how is my child doing?".
Dog owners have nothing like it. After 3 years of pet sitting in the field, we saw the same pattern every day:

- **Owners feel anxious** and keep texting: *"Did she eat?" "Did you give the pills?" "Can I see a photo?"*
- **Sitters lose time** answering messages, writing reports, and sending photos one by one — instead of caring for dogs.
- **Safety slips through the cracks** — a missed pill, a forgotten walk, a treat with a hidden allergen.

## 💡 Our Answer

PawNote is built on two promises:

| For owners | For sitters |
| :--- | :--- |
| **Never need to ask.** Photos, walks, meds, and reports arrive on their own. | **Just care, snap, and tap.** No typing reports, no answering the same questions. |

---

## ✨ Features

### 1. 📸 Care Feed & Album
- Sitters post photos and videos of the dog to a **private, Facebook-style feed** — no more sending pictures one by one.
- Owners get a **push notification** on every new post and can browse everything in an album.
- Owners can **request a photo** with one tap; the sitter gets a nudge.
- Nemotron (vision) **auto-writes captions** from the photo, so sitters never type.
- Media is stored and compressed on **Cloudinary** (auto format/quality, video transcoding).

### 2. 💊 Medication & Walk Requests
*Inspired by Kidsnote's medication request & report.*
- Owners register **medication** (name, dose, time, notes) and **walk schedules**.
- At the scheduled time, the sitter gets a **reminder**.
- The sitter **snaps a proof photo** → the task is checked off → the owner is notified instantly.
- Missed tasks are flagged, so nothing slips.

### 3. 📝 Zero-Typing Daily Report
- At the end of the day, Nemotron **drafts the report automatically** from the day's feed posts, completed walks/meds, and photos.
- Written in the warm tone learned from 3 years of real (anonymized) owner messages.
- The sitter reviews and sends with **one tap**.

### 4. 🛡️ Treat Safety Guard
1. **See** — snap the ingredient label; Nemotron vision reads it.
2. **Reason** — Nemotron 3 Ultra checks it against the dog's allergens and breed risks, including *hidden* sources (e.g. "animal fat" may contain chicken).
3. **Search** — unknown ingredients or recalls are looked up on the web via **Tavily**.
4. **Warn** — a warning modal blocks the treat before it's fed.

### 5. 📢 Sitter Schedule & Notices
- Owners see the sitter's **schedule** (availability, holidays).
- Sitters post **notices** (e.g. "Closed on Thanksgiving") that show as a **popup** when owners open the app.

### 6. 💬 Private Q&A with AI First Reply
- Owners message inside the app — no personal phone numbers shared.
- For routine questions, Nemotron **answers first** in the sitter's tone, grounded in the dog's profile and today's logs. The sitter only steps in when needed.

---

## 🗓️ A Day with PawNote

```
08:00  💊 Reminder → sitter gives Bori her pill → snaps photo → owner notified ✅
10:30  🦮 Walk reminder → walk done → photo + auto-caption posted to feed → owner notified
13:00  📷 Owner taps "Request photo" → sitter posts a nap photo
15:00  🛡️ New treat? Scan label → ⚠️ "Contains chicken — Bori is allergic"
18:00  📝 Daily report drafted by AI → sitter taps "Send" → owner reads it at home
```

---

## 🟩 How We Use NVIDIA Nemotron & Nebius Token Factory

Every AI call runs on **Nebius Token Factory** through its OpenAI-compatible API. We route each task to the right-sized Nemotron model.

| Task | Model ID | Why |
| :--- | :--- | :--- |
| Photo/video captions, ingredient label reading | `nvidia/nemotron-3-nano-omni` ¹ | Multimodal (image, video, text) in one compact model |
| Allergen & hidden-ingredient reasoning | `nvidia/Nemotron-3-Ultra-550b-a55b` | Safety-critical → strongest reasoning |
| Daily report generation | `nvidia/nemotron-3-super-120b-a12b` | High-quality tone replication with few-shot examples |
| Q&A first reply, quick calls | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | Fast and cheap for everyday calls |

¹ Listed in the Nebius Token Factory cookbook; to be confirmed via `GET /v1/models` with our API key.

**Other Nebius services**
- **Serverless Jobs** *(planned)* — scheduled reminders and end-of-day report generation.
- **Serverless Endpoints** *(optional)* — hosting the FastAPI backend.

**Where Token Factory accelerated our workflow:** _to be written after development._

---

## 🛠️ Architecture

```
[ Owner app ]            [ Sitter app ]
      └──────────┬──────────┘
                 ▼
   Expo (React Native for Web / iOS / Android)
                 │  REST / JSON · Realtime
                 ▼
        FastAPI (Python backend)
          ├── Supabase     → PostgreSQL (data) · Auth · Realtime (in-app notifications)
          ├── Cloudinary   → photo/video storage, compression, thumbnails
          ├── Nebius Token Factory (NVIDIA Nemotron)
          │     ├── Nano Omni → captions, label reading
          │     ├── Ultra     → safety reasoning
          │     ├── Super     → daily reports
          │     └── Nano      → Q&A
          ├── Tavily       → ingredient / recall web search
          └── Scheduler    → medication & walk reminders
```

| Area | Stack |
| :--- | :--- |
| Frontend | Expo (React Native for Web) |
| Backend | FastAPI (Python 3.11+) |
| Database / Auth / Realtime | Supabase (PostgreSQL) |
| Media | Cloudinary |
| AI | NVIDIA Nemotron on Nebius Token Factory |
| Web search | Tavily |
| Notifications | Supabase Realtime (web) · Expo Notifications (mobile) |

---

## 🚀 Getting Started

Monorepo layout (Phase **1.1**): `backend/`, `frontend/`, `supabase/migrations/`. Runnable app lands in Phase **1.2** (API) and **1.3** (Expo web).

| Path | Doc |
| :--- | :--- |
| Backend env & run | [backend/README.md](backend/README.md) |
| Frontend env & run | [frontend/README.md](frontend/README.md) |
| DB migrations | [supabase/README.md](supabase/README.md) |
| Local secrets | [docs/plan/env-setup.ko.md](docs/plan/env-setup.ko.md) |

```bash
# After Phase 1.2–1.3 (not yet on main until those tasks merge):
cd backend && cp .env.example .env   # fill per env-setup.ko.md
cd frontend && cp .env.example .env  # EXPO_PUBLIC_API_URL=http://localhost:8000
# Then follow backend/ and frontend/ README run commands.
```

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
