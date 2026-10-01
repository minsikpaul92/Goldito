# PawNote — Development Plan (Team Internal)

🇰🇷 Korean: [README.ko.md](README.ko.md) · Product README: [../../README.md](../../README.md) · Hackathon rules: [../hackathon/README.md](../hackathon/README.md)

Deadline: **Oct 30, 2026, 10:00 AM PT (1:00 PM EDT)** · Internal deadline: **Oct 28**

---

## 1. Product Principles

Every feature must pass both tests:

| Owner | Sitter |
| :--- | :--- |
| "Did I learn this **without asking**?" | "Did this add **zero typing / messaging** for me?" |

Sitter inputs should be limited to: **take a photo, tap a button** (plus an optional one-line memo on the 5-second check). AI and automation do the rest.

**Product flow (source of truth):** [full-process.ko.md](full-process.ko.md) — 5 stages, **Inquiry → Meet & Greet → Booking → Care & Pet Transit → Completion** (architecture D27–D34). Rover booking × Kidsnote care × Uber trips, with an AI agent doing the typing.

---

## 2. Feature Scope & Priority

Two developers, ~4 weeks. Build in this order (the 5 stages first); P2 only if time allows.

| Priority | Stage | Feature | Inspired by | AI | Phase |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P0** | ① Inquiry | Owner asks a sitter (service type, dates, pets, a question) → AI replies on the sitter's behalf in < 1 min, grounded in the calendar, server-side quote (holiday + multi-pet rates), sitter policy, Life Record (RAG) | Rover fast replies | Nano + Qwen3 Embedding | 07B (03C quote) |
| **P0** | ② Meet & Greet | Care & medication request → AI mission checklist + Heads-up · Meet & Greet (in person / video) · transport mode (Owner drives / Sitter drives) | Kidsnote medication request | Super | 06, 03B |
| **P0** | ③ Booking | Part-time sitters: schedule by day × slot (own hours, capacity), regular-sitter schedule, whole-trip booking with drop-off/pick-up time & place (negotiable), Boarding / House sitting, cancel → rebook | Marketplace | — | 03B |
| **P0** | ③ Booking | Quote → Canada-first consent templates → **demo payment** → sitter home info after payment · owner entry info unlocks 2 h before | — | — (rules) | 03C |
| **P0** | ④ Care & Transit | Uber-style trip: live position + ETA, arrival cards (visitor parking / buzzer + lockbox), handoff photo check (pet, crate, seatbelt) | Uber · Kidsnote check-in/out | Vision (MiniCPM-V) | 06B |
| **P0** | ④ Care & Transit | 5-second check (meal, potty, walk, meds, memo, ≤ 2 photos) + scheduled tasks → instant owner notifications + Activity | Kidsnote medication report | — | 06 |
| **P0** | ④ Care & Transit | Zero-typing daily report from the 5-second check + the day's data | Daily report (알림장) | Vision → Super | 07 |
| **P0** | ④ Care & Transit | Care feed + timeline album sorted by day and category (Meals · Walks · Naps · Play) | Album | Vision captions + category | 05, 09 |
| **P0** | ⑤ Completion | Home-safe report + 5-star review + Pet Life Record → RAG → reused on the next booking | Kidsnote records | Super + Qwen3 Embedding | 07C |
| **P0 stretch** | ④ (extra) | Treat Safety Guard — after the scenario core (D27) | — (our differentiator) | Vision (MiniCPM-V) + Ultra · Tavily sources (8.7) | 08 |
| **P1** | — | Photo request (owner → sitter) | — | — | 11.1 |
| **P1** | — | Notices with popup · favorite sitters · recurring schedule patterns | Notices | — | 11 |
| **P1** | — | Pet-color app skin: owner uploads a pet photo, app theme matches its coat (Phase 11.10; theme provider in 3.0) | — | Vision (coat colors) → preset theme | 11.10 |
| **P1** | — | Pet cut-out stickers + AI-decorated daily report card (Phase 11.8) | Diary decorating | Nano picks theme & stickers | 11.8 |
| **P1** | — | Settings + in-app patch notes (What's New ← CHANGELOG) (Phase 11.11) | — | — | 11.11 |
| **P1** | — | 8-bit Tamagotchi-style pet status room on Owner Home (Phase 11.12) | At-a-glance care | Derived from check-ins + tasks | 11.12 |
| **P1** | — | Video mood line from visible behavior — no bark/audio analysis (Phase 11.9) | — | Vision (multi-frame) + Nano | 11.9 |


The old P2 "Private Q&A with AI first reply" is now the Stage 1 inquiry AI (07B, P0).

Demo priority: the **5-stage flow** in the main README (*How PawNote Works* → *A Stay with PawNote*) must work end-to-end.

### Post-hackathon roadmap (not built for the hackathon)

| Idea | Why later |
| :--- | :--- |
| **Public pet feed ("Pawstagram")** — owners share pet photos and decorated notes; anyone can browse for comfort | Dilutes the owner ↔ sitter care story for judges; needs public feed, reporting/blocking, moderation (AI pet-only photo filter), privacy rules for sitter photos |
| **Pet-friendly map** — restaurants, stores, parks that allow pets | Outside the care loop; Google Places `allowsDogs` exists but is dogs-only, highest-cost field tier, and cannot be used as a search filter |
| **Sticker / emoji / skin store** (business model) | Presented in README / Devpost as the monetization path; no payments built |
| **Bark / vocal emotion analysis** | Public research reaches ~36–57% on 3-class emotion — not reliable enough to show owners |
| **Google / Apple sign-in** | Needs a Google Cloud OAuth client + Supabase provider setup, and an Apple Developer membership ($99/yr) with Services ID and domain verification. Google's sign-in page refuses to load inside the desktop phone frame (iframe), so it needs a popup or top-level redirect; OAuth sign-ups carry no owner/sitter role, so a one-time role choice (+ RPC) is required. Judges use Try demo, so P0 keeps email + password (phase-03 excludes social login) |
| **Sitter desktop web** — sitters plan schedules and write reports faster on a computer (sidebar layout); owners stay on the phone | Lowest priority. The hackathon build only frames the phone app on desktop (architecture D25); screens use `useLayoutMode()` and JS `Tabs` so this layout can be added later |

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
| **1. Setup** | Oct 1 – 4 | Design system + scenario screens: inquiry thread, checkout, trip, 5-second check | **Anonymize dataset**, 7.1 Nebius client + `embed()` | Phases 01–03 ✅, 03B bookings |
| **2. Stages ①–③** | Oct 5 – 11 | Booking, checkout, Meet & Greet, care request screens | 07B inquiry AI + RAG backend, 6.12 care-plan | 03B, 03C, 04, 05 |
| **3. Stage ④** | Oct 12 – 18 | Trip screen + map, album, micro-interactions | 6B.5 handoff check, 7.2 report, 9.1 caption + category | 06, 06B, 07, deploy rehearsal (Oct 18) |
| **4. Stage ⑤ + demo** | Oct 19 – 25 | Video visuals, thumbnails, Life Record screen | 7C.4 Life Record, prompt tuning, feedback write-up · (stretch) 08 safety | 07B UI, 09, 07C, README, test accounts, Devpost draft |
| **5. Submit** | Oct 26 – 30 | Final polish | Final feedback | Bug fixes · **internal deadline Oct 28** · final submit Oct 29–30 (deadline Oct 30, 10:00 AM PT) |

---

## 5. Hackathon Strategy

| Criterion (equal weight) | Our plan | Owner |
| :--- | :--- | :--- |
| **Technological Implementation** | Nemotron models routed by task (Nano replies, Super writing, Ultra safety), RAG on Token Factory embeddings + pgvector, server-grounded numbers, JSON validation, Realtime trips, real deployment | Seulgi, Minsik |
| **Design** | One continuous 5-stage journey for owner + sitter (Rover × Kidsnote × Uber), Kidsnote-level polish — not a PoC | Muk |
| **Potential Impact** | Real problem from 3 years in the field; show numbers (reply time in seconds, messages avoided, minutes saved per report) | All |
| **Quality of the Idea** | An agent that answers, plans, checks, and writes for the sitter; timed entry-info unlock; a Life Record that carries over to the next sitter | Seulgi |

**Non-negotiables**
- Every AI call goes through Token Factory — Nemotron for replies, reasoning, and reports, MiniCPM-V for vision (handoff checks, captions, labels), Qwen3 Embedding for RAG. See [model-ids.md](phases/notes/model-ids.md).
- Real customer data is anonymized before it touches prompts, the repo, or the video.
- Demo stays online and free until **Dec 15**; test accounts for owner and sitter.
- Judges use computers: on desktop the demo runs inside a **402 × 874 phone frame** and everything works with a mouse, sample photos included (architecture D25, [DESIGN.md §7.7](../../DESIGN.md#77-works-with-a-mouse)).
- Video < 3 min, public YouTube, English audio covering Nemotron + Token Factory, no copyrighted music.

**Prize targets:** Best Apps and Agents Track or Overall · Best Use of Tavily · Most Valuable Feedback · Toronto City Winner (attended Builders & Brews Toronto, Sep 29).

---

## 6. AI Models (verified Sep 28, 2026)

Source: [Token Factory model catalog](https://tokenfactory.nebius.com/model-catalog.md) and [Nebius cookbook](https://github.com/nebius/token-factory-cookbook/tree/main/models/nemotron).

| Model ID | Type | Region / endpoint | Price (in / out per 1M) | Use |
| :--- | :--- | :--- | :--- | :--- |
| `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | text | eu-north1 · `https://api.tokenfactory.nebius.com/v1/` | $0.06 / $0.24 | Inquiry auto-reply, quick calls |
| `nvidia/nemotron-3-super-120b-a12b` | text | us-central1 · `https://api.tokenfactory.us-central1.nebius.com/v1/` | $0.30 / $0.90 | Care checklist, daily report, Life Record |
| `nvidia/Nemotron-3-Ultra-550b-a55b` | text | us-central1 | $1.00 / $3.00 | Safety reasoning |
| `nvidia/Nemotron-3_5-Lightning` | text | eu-north1 | $0.06 / $0.24 | Alternative fast model (1M context) |
| `openbmb/MiniCPM-V-4_5` | image + text | us-central1 | see catalog | Handoff photo check, captions + category, report photos, label reading |
| `Qwen/Qwen3-Embedding-8B` | text → embedding | both | see catalog | RAG (`dimensions: 1024`, checked 2026-10-01) |

**Notes**
- **Nano Omni (`nvidia/nemotron-3-nano-omni`) is not in the catalog** (checked with `GET /v1/models`, 2026-09-29), so vision uses **MiniCPM-V-4_5**. The scenario's **Qwen-2.5-VL** is not in the catalog either (2026-10-01); the only other image-input model is `moonshotai/Kimi-K2.6` (fallback candidate). Rules require at least one NVIDIA model; Nemotron (Ultra, Super) handles reasoning and reports. Role → ID source of truth: [model-ids.md](phases/notes/model-ids.md).
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

### D. Inquiry auto-reply (Nano + RAG) — Stage 1, Phase 07B
- Input: server-collected JSON only — sitter availability, `quote_booking` result, pet profiles, sitter public profile, top-5 RAG chunks (sitter policy, Life Record, past questions, care request).
- Output JSON `{reply, can_host, needs_sitter, used_sources}`. Never computes prices (copies the quote), never mentions other owners, addresses, or entry codes. Unsure → "Mina will confirm" + `needs_sitter`.

### E. Care plan (Super) — Stage 2, Phase 06
- Owner's free-text care & medication request → `{tasks:[{type, time, title, dose, notes}], cautions:[], skipped:[]}`. Server enforces species rules (no walks for cats). Draft only; the owner confirms.

### F. Handoff check (Vision) — Stage 4, Phase 06B
- Photo at drop-off / pick-up → `{pet_visible, species_match, crate_visible, restraint_visible, concerns}`; the server decides ok / warning. Observations only, no medical claims.

### G. Pet Life Record (Super) — Stage 5, Phase 07C
- The stay's check-ins, tasks, reports, handoff checks, sitter memos → `{eats, meds, potty, behavior, heads_up, sitter_tips, changed_since_last}`; null when there is no evidence. Indexed into RAG for the next booking.

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
| Scenario (D27–D34) | `sitter_rates` · `holidays` · `booking_consents` · `owner_home_access` · `access_reveals` (03C) · `care_checkins` · `care_requests` · `pet_cautions` (06) · `trips` · `handoff_checks` (06B) · `inquiries` · `inquiry_messages` · `knowledge_chunks` (pgvector) (07B) · `reviews` · `pet_life_records` (07C) |
| Notifications | `notifications` |
| P1 (Phase 11) | `photo_requests` · `notices` · `notice_reads` · `owner_favorite_sitters` |

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
| Oct 1 | Token Factory embeddings | RAG | `Qwen/Qwen3-Embedding-8B` honors `dimensions: 1024` on both regions (fits a pgvector HNSW index) | Only one embedding model and no NVIDIA embedding model in the catalog; only two image-input models (MiniCPM-V-4.5, Kimi-K2.6) | — | Minsik |

---

## 14. Open Questions

- [x] Demo language: **English only** (UI + AI output) — decided 2026-09-29 (architecture D1)
- [x] Backend API: **Nebius AI Cloud Serverless Endpoint** (primary), Render emergency fallback only — 2026-09-29 (D18)
- [x] Few-shot source language: **English** (anonymized only) — 2026-09-29 (D1)
- [ ] Few-shot sample **size** (3 confirmed; more?)
- [x] Nano Omni availability — not in catalog; vision uses MiniCPM-V-4_5 (2026-09-29)
- [x] Toronto Builders & Brews (Sep 29) — attended (Token Factory $100, AI Cloud $100, Tavily 8k credits)
- [x] Product flow: team Full Process scenario first (5 stages) — 2026-10-01 (D27, [full-process.ko.md](full-process.ko.md))
- [x] Payment: demo only (no card data); consents: fixed English templates, not legal advice — 2026-10-01 (D30)
- [x] Treat Safety Guard: P0 stretch after the scenario core — 2026-10-01 (D27)
