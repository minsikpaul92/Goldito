# PawNote — Development Plan (Team Internal)

🇰🇷 Korean: [README.ko.md](README.ko.md) · Product README: [../../README.md](../../README.md) · Hackathon rules: [../hackathon/README.md](../hackathon/README.md)

Deadline: **Oct 30, 2026, 10:00 AM PT (1:00 PM EDT)** · Internal deadline: **Oct 28**

---

## 1. Product Principles

Every feature must pass both tests:

| Owner | Sitter |
| :--- | :--- |
| "Did I learn this **without asking**?" | "Did this add **zero typing / messaging** for me?" |

Sitter inputs should be limited to: **take a photo, tap a button.** AI and automation do the rest.

---

## 2. Feature Scope & Priority

Two developers, ~4 weeks. Build in this order; P2 only if time allows.

| Priority | Feature | Kidsnote equivalent | AI |
| :--- | :--- | :--- | :--- |
| **P0** | Care Feed & Album + upload notifications | Album | Vision (MiniCPM-V) captions |
| **P0** | Medication & Walk requests → reminder → photo proof → owner notified | Medication request / report | — |
| **P0** | Zero-typing daily report (from the day's feed + tasks) | Daily report (알림장) | Super |
| **P0** | Treat Safety Guard | — (our differentiator) | Vision (MiniCPM-V) + Ultra · Tavily sources (8.7 stretch) |
| **P1** | Photo request (owner → sitter) | — | — |
| **P0** | Part-time boarding sitters: schedule by day × slot (own hours, capacity), regular-sitter schedule view, whole-trip booking with drop-off/pick-up time & place (negotiable), cancel → rebook | — (marketplace-style) | — |
| **P1** | Notices with popup · favorite sitters · recurring schedule patterns | Notices | — |
| **P2** | Private Q&A with AI first reply | — | Nano |

Demo priority: the **"A Day with PawNote"** flow in the main README must work end-to-end.

---

## 3. Roles

| Member | Role | Responsibilities |
| :--- | :--- | :--- |
| **Minsik** | Full-Stack Lead | Expo app, FastAPI, Supabase schema/auth/realtime, Cloudinary upload, notifications & scheduler, deployment, **Devpost Representative** |
| **Seulgi** | AI & Prompt Engineer | **Data anonymization**, few-shot prompts, Nemotron pipeline on Token Factory, caption/report/safety prompts, JSON validation, Tavily integration |
| **Muk** | Product & UX/UI Designer | Figma design system (Auto Layout, tokens), owner & sitter flows, feed/album, warning modal, notice popup, demo video visuals |

```
Muk: Figma design (Auto Layout / tokens)
        ▼
Minsik: Figma MCP + Cursor → Expo components
        ▲
        │ API endpoints
Seulgi: Nemotron pipeline → FastAPI routers
```

---

## 4. Schedule

| Week | Dates | Muk | Seulgi | Minsik |
| :--- | :--- | :--- | :--- | :--- |
| **0. Kickoff** | Sep 28 – 30 | Join Devpost team, moodboard | Claim credits, confirm model IDs via `GET /v1/models`, first call | Repo scaffold, Supabase + Cloudinary accounts |
| **1. Setup** | Oct 1 – 4 | Design system + key screens: feed, task list, report, scanner | **Anonymize dataset**, caption + report prompts | Expo Web, Supabase schema, FastAPI skeleton, Cloudinary upload |
| **2. P0 core** | Oct 5 – 11 | Feed/album, task check-off, warning modal | Safety pipeline (Vision → Ultra, JSON), report from day's data | Feed + notifications, med/walk tasks + reminders |
| **3. P1 + polish** | Oct 12 – 18 | Notice popup, schedule, micro-interactions | Prompt tuning with real photos/packages (Tavily moved to 8.7) | Photo request, notices/schedule, deploy demo |
| **4. Demo & docs** | Oct 19 – 25 | Video visuals, thumbnails | Q&A (P2), feedback write-up | README setup guide, test accounts, Devpost draft |
| **5. Submit** | Oct 26 – 30 | Final polish | Final feedback | Bug fixes · **internal deadline Oct 28** · final submit Oct 29–30 (deadline Oct 30, 10:00 AM PT) |

---

## 5. Hackathon Strategy

| Criterion (equal weight) | Our plan | Owner |
| :--- | :--- | :--- |
| **Technological Implementation** | 4 Nemotron models routed by task, JSON validation, scheduled jobs, real deployment | Seulgi, Minsik |
| **Design** | Complete owner + sitter flows, Kidsnote-level polish — not a PoC | Muk |
| **Potential Impact** | Real problem from 3 years in the field; show numbers (messages avoided, minutes saved per report) | All |
| **Quality of the Idea** | Zero-typing care loop, hidden-allergen reasoning, tone replication from real data | Seulgi |

**Non-negotiables**
- Every AI call goes through Token Factory — Nemotron for reasoning and reports, MiniCPM-V for vision (captions, labels). See [model-ids.md](phases/notes/model-ids.md).
- Real customer data is anonymized before it touches prompts, the repo, or the video.
- Demo stays online and free until **Dec 15**; test accounts for owner and sitter.
- Video < 3 min, public YouTube, English audio covering Nemotron + Token Factory, no copyrighted music.

**Prize targets:** Best Apps and Agents Track or Overall · Best Use of Tavily · Most Valuable Feedback · Toronto City Winner (attended Builders & Brews Toronto, Sep 29).

---

## 6. AI Models (verified Sep 28, 2026)

Source: [Token Factory model catalog](https://tokenfactory.nebius.com/model-catalog.md) and [Nebius cookbook](https://github.com/nebius/token-factory-cookbook/tree/main/models/nemotron).

| Model ID | Type | Region / endpoint | Price (in / out per 1M) | Use |
| :--- | :--- | :--- | :--- | :--- |
| `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | text | eu-north1 · `https://api.tokenfactory.nebius.com/v1/` | $0.06 / $0.24 | Q&A, quick calls |
| `nvidia/nemotron-3-super-120b-a12b` | text | us-central1 · `https://api.tokenfactory.us-central1.nebius.com/v1/` | $0.30 / $0.90 | Daily report |
| `nvidia/Nemotron-3-Ultra-550b-a55b` | text | us-central1 | $1.00 / $3.00 | Safety reasoning |
| `nvidia/Nemotron-3_5-Lightning` | text | eu-north1 | $0.06 / $0.24 | Alternative fast model (1M context) |
| `openbmb/MiniCPM-V-4_5` | image + text | us-central1 | see catalog | Captions, label reading |

**Notes**
- **Nano Omni (`nvidia/nemotron-3-nano-omni`) is not in the catalog** (checked with `GET /v1/models`, 2026-09-29), so vision uses **MiniCPM-V-4_5**. Rules require at least one NVIDIA model; Nemotron (Ultra, Super) handles reasoning and reports. Role → ID source of truth: [model-ids.md](phases/notes/model-ids.md).
- **Models live in different regions** → the backend needs a per-model base URL.
- Model IDs are **case-sensitive** and inconsistent across models — copy them exactly.
- Demo and AI output are **English only** (D1).

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://api.tokenfactory.us-central1.nebius.com/v1/",
    api_key=os.environ["NEBIUS_API_KEY"],
)
client.chat.completions.create(
    model="nvidia/nemotron-3-super-120b-a12b",
    messages=[{"role": "user", "content": "Hello"}],
)
```

---

## 7. Prompt Specs (Seulgi)

### A. Photo caption (Vision: MiniCPM-V)
- Input: photo/video + pet name and species.
- Output: 1–2 warm sentences describing expression and activity. No medical claims.

### B. Daily report (Super)
- **Input:** the day's feed captions, completed tasks (walk times, meds), sitter's optional quick notes.
- **Role:** A warm, detail-oriented pet sitter with 3 years of experience.
- **Few-shot:** 3 top-rated real reports (**anonymized**).
- **Rules:**
  1. No robotic reporting. ❌ "Completed a 40-minute walk." ⭕ "Bori wagged her tail the whole way on our 40-minute walk in the sunshine! 🐶💛"
  2. Naturally mention stool condition, food, and water intake.
  3. Describe the pet's expression/behavior from the photos.
  4. Never invent events not present in the input.

### C. Treat safety (Vision → Ultra → Tavily 8.7)
- Vision (MiniCPM-V) extracts the ingredient list from the label photo.
- Ultra compares it against the pet's allergens + species-specific toxins, reasoning about hidden sources. WARNING or unknown ingredients → Tavily search (8.7 stretch, [tavily.ko.md](tavily.ko.md)) → Ultra re-evaluates.
- Output (strict JSON, validated server-side):

```json
{
  "safety_status": "DANGER | WARNING | SAFE",
  "matched_allergens": ["chicken", "wheat"],
  "detected_ingredients": ["hydrolyzed chicken powder", "wheat flour", "glycerin"],
  "unknown_ingredients": [],
  "warning_message": "Chicken, a registered allergen for Bori, was detected. Do not feed."
}
```

### D. Q&A first reply (Nano)
- Grounded only in the pet's profile and today's logs. If unsure → "Your sitter will reply soon." and notify the sitter.

---

## 8. Data Anonymization (Seulgi)

The 3-year dataset contains real owners' personal data. It must be anonymized **before** it is used in prompts, committed, or shown in the video.

- Remove or replace: owner names, phone numbers, addresses, emails, social handles, exact locations, real pet names (→ consistent pseudonyms like "Bori", "Mochi").
- Remove faces of people in photos used for demos.
- Keep the **tone** (nicknames, emojis, sentence style) — that's the value.
- Keep raw data **out of the repo** (`data/raw/` in `.gitignore`); commit only anonymized few-shot samples.
- Optionally run anonymization as a batch on **Nebius Serverless Jobs** (another Nebius service to highlight).

---

## 9. Data Model (summary)

> **Source of truth: [phases/phase-02.md](phases/phase-02.md)** (17 P0 tables, RLS, RPCs) and [phase-11.md](phases/phase-11.md) (P1). This is an at-a-glance list only — change phase-02 first when the schema changes.

| Area | Tables |
| :--- | :--- |
| People | `profiles` (role owner/sitter) · `owner_profiles` · `sitter_profiles` |
| Pets | `pets` (dog/cat) · `pet_allergies` |
| Schedule & bookings | `sitter_availability` · `bookings` · `booking_pets` (care window, no overlaps) · `booking_slots` (capacity) · `booking_handoffs` (drop-off / pick-up time & place) |
| Care | `care_tasks` (medication·walk·feeding·litter·play·sleep) · `task_logs` · `media` · `feed_posts` · `daily_reports` · `safety_checks` |
| Notifications | `notifications` |
| P1 (Phase 11) | `photo_requests` · `notices` · `notice_reads` · `owner_favorite_sitters` · `messages` (P2) |

---

## 10. Notifications

Notification types, recipients, and where each is created: **[architecture §7 notification matrix](phases/architecture.ko.md#7-알림-매트릭스-p0)** (source of truth).

- **Web demo:** Supabase Realtime → in-app notification center + toast.
- **Mobile (post-hackathon):** Expo Notifications (push).
- **Scheduled reminders:** (stretch 6.7) Nebius Serverless Jobs or APScheduler.
- Sitter schedule changes never notify owners (D24).

---

## 11. Cloudinary Guide

Why: Supabase free storage is too small for photos and videos. Cloudinary's free plan gives credit-based storage/bandwidth plus automatic compression. (Check current free-plan limits at [cloudinary.com/pricing](https://cloudinary.com/pricing).)

- **Upload:** client requests a **signed upload** signature from FastAPI → uploads directly to Cloudinary → backend stores only `public_id` in Supabase.
- **Compression:** deliver with `f_auto,q_auto` (auto format like WebP/AVIF, auto quality).
- **Thumbnails:** `c_fill,w_400,h_400` for feed grid; video poster via `so_0` + `.jpg`.
- **Video:** limit length/size on upload; Cloudinary transcodes for web playback.
- **Privacy:** use a dedicated folder per pet; don't expose the API secret to the client.

---

## 12. Tavily Guide

**Source of truth: [tavily.ko.md](tavily.ko.md)** (what Tavily is, keyword query rules, trusted domains, recall search, 8-second budget, `TAVILY_API_KEY`).

- Used in the treat safety guard as **Phase 08.7 (stretch)** — right after 8.1–8.6; Phase 11.3 only if 8.7 slips.
- Qualifies us for **Best Use of Tavily ($3,000)** — requires a functional runtime call; the warning modal shows **Sources** links.

---

## 13. Nebius & NVIDIA Feedback Log

Required in the Devpost submission (and eligible for Most Valuable Feedback). Log as we go — be specific and name the tool.

| Date | Tool / Model | Used for | Worked well | Needs work | Onboarding | Who |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Sep 28 | Token Factory catalog | Choosing models | Clear pricing per model | Nano Omni in cookbook but missing from public catalog; model ID casing inconsistent | — | Minsik |

---

## 14. Open Questions

- [x] Demo language: **English only** (UI + AI output) — decided 2026-09-29 (architecture D1)
- [x] Backend API: **Nebius AI Cloud Serverless Endpoint** (primary), Render emergency fallback only — 2026-09-29 (D18)
- [x] Few-shot source language: **English** (anonymized only) — 2026-09-29 (D1)
- [ ] Few-shot sample **size** (3 confirmed; more?)
- [x] Nano Omni availability — not in catalog; vision uses MiniCPM-V-4_5 (2026-09-29)
- [x] Toronto Builders & Brews (Sep 29) — attended (Token Factory $100, AI Cloud $100, Tavily 8k credits)
