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
| **P0** | Care Feed & Album + upload notifications | Album | Nano Omni captions |
| **P0** | Medication & Walk requests → reminder → photo proof → owner notified | Medication request / report | — |
| **P0** | Zero-typing daily report (from the day's feed + tasks) | Daily report (알림장) | Super |
| **P0** | Treat Safety Guard | — (our differentiator) | Nano Omni + Ultra |
| **P1** | Photo request (owner → sitter) | — | — |
| **P1** | Sitter schedule & notices with popup | Notices / calendar | — |
| **P1** | Tavily ingredient/recall search | — | Tavily |
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
| **0. Kickoff** | Sep 28 – 30 | Join Devpost team, moodboard | Claim credits, confirm Nano Omni via `GET /v1/models`, first call | Repo scaffold, Supabase + Cloudinary accounts |
| **1. Setup** | Oct 1 – 4 | Design system + key screens: feed, task list, report, scanner | **Anonymize dataset**, caption + report prompts | Expo Web, Supabase schema, FastAPI skeleton, Cloudinary upload |
| **2. P0 core** | Oct 5 – 11 | Feed/album, task check-off, warning modal | Safety pipeline (Omni → Ultra, JSON), report from day's data | Feed + notifications, med/walk tasks + reminders |
| **3. P1 + polish** | Oct 12 – 18 | Notice popup, schedule, micro-interactions | Tavily search, prompt tuning with real photos/packages | Photo request, notices/schedule, deploy demo |
| **4. Demo & docs** | Oct 19 – 25 | Video visuals, thumbnails | Q&A (P2), feedback write-up | README setup guide, test accounts, Devpost draft |
| **5. Submit** | Oct 26 – 30 | Final polish | Final feedback | Bug fixes · **internal deadline Oct 28** · submit by Oct 29 |

---

## 5. Hackathon Strategy

| Criterion (equal weight) | Our plan | Owner |
| :--- | :--- | :--- |
| **Technological Implementation** | 4 Nemotron models routed by task, JSON validation, scheduled jobs, real deployment | Seulgi, Minsik |
| **Design** | Complete owner + sitter flows, Kidsnote-level polish — not a PoC | Muk |
| **Potential Impact** | Real problem from 3 years in the field; show numbers (messages avoided, minutes saved per report) | All |
| **Quality of the Idea** | Zero-typing care loop, hidden-allergen reasoning, tone replication from real data | Seulgi |

**Non-negotiables**
- Every AI call goes through Token Factory with Nemotron.
- Real customer data is anonymized before it touches prompts, the repo, or the video.
- Demo stays online and free until **Dec 15**; test accounts for owner and sitter.
- Video < 3 min, public YouTube, English audio covering Nemotron + Token Factory, no copyrighted music.

**Prize targets:** Best Apps and Agents Track or Overall · Best Use of Tavily · Most Valuable Feedback · Toronto City Winner (event registration pending).

---

## 6. AI Models (verified Sep 28, 2026)

Source: [Token Factory model catalog](https://tokenfactory.nebius.com/model-catalog.md) and [Nebius cookbook](https://github.com/nebius/token-factory-cookbook/tree/main/models/nemotron).

| Model ID | Type | Region / endpoint | Price (in / out per 1M) | Use |
| :--- | :--- | :--- | :--- | :--- |
| `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | text | eu-north1 · `https://api.tokenfactory.nebius.com/v1/` | $0.06 / $0.24 | Q&A, quick calls |
| `nvidia/nemotron-3-super-120b-a12b` | text | us-central1 · `https://api.tokenfactory.us-central1.nebius.com/v1/` | $0.30 / $0.90 | Daily report |
| `nvidia/Nemotron-3-Ultra-550b-a55b` | text | us-central1 | $1.00 / $3.00 | Safety reasoning |
| `nvidia/Nemotron-3_5-Lightning` | text | eu-north1 | $0.06 / $0.24 | Alternative fast model (1M context) |
| `nvidia/nemotron-3-nano-omni` ⚠️ | image + video + text | us-central1 (per cookbook) | ~$0.06 / $0.24 | Captions, label reading |

**Notes**
- ⚠️ **Nano Omni is in the cookbook but not in the public catalog.** Confirm the exact ID with `GET /v1/models` using our key. Fallback: a non-NVIDIA vision model on Token Factory (e.g. MiniCPM-V, Kimi) for OCR only — allowed, since rules require *at least one* NVIDIA model, but Nemotron must remain central.
- **Models live in different regions** → the backend needs a per-model base URL.
- Model IDs are **case-sensitive** and inconsistent across models — copy them exactly.
- Test **Korean vs English** output quality early (depends on demo language and dataset language).

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

### A. Photo caption (Nano Omni)
- Input: photo/video + dog name.
- Output: 1–2 warm sentences describing expression and activity. No medical claims.

### B. Daily report (Super)
- **Input:** the day's feed captions, completed tasks (walk times, meds), sitter's optional quick notes.
- **Role:** A warm, detail-oriented dog walker with 3 years of experience.
- **Few-shot:** 3 top-rated real reports (**anonymized**).
- **Rules:**
  1. No robotic reporting. ❌ "Completed a 40-minute walk." ⭕ "Bori wagged her tail the whole way on our 40-minute walk in the sunshine! 🐶💛"
  2. Naturally mention stool condition, food, and water intake.
  3. Describe the dog's expression/behavior from the photos.
  4. Never invent events not present in the input.

### C. Treat safety (Nano Omni → Ultra → Tavily)
- Omni extracts the ingredient list from the label photo.
- Ultra compares it against the dog's allergens + breed risks, reasoning about hidden sources. Unknown ingredients → Tavily search → Ultra re-evaluates.
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
- Grounded only in the dog's profile and today's logs. If unsure → "Your sitter will reply soon." and notify the sitter.

---

## 8. Data Anonymization (Seulgi)

The 3-year dataset contains real owners' personal data. It must be anonymized **before** it is used in prompts, committed, or shown in the video.

- Remove or replace: owner names, phone numbers, addresses, emails, social handles, exact locations, dog real names (→ consistent pseudonyms like "Bori").
- Remove faces of people in photos used for demos.
- Keep the **tone** (nicknames, emojis, sentence style) — that's the value.
- Keep raw data **out of the repo** (`data/raw/` in `.gitignore`); commit only anonymized few-shot samples.
- Optionally run anonymization as a batch on **Nebius Serverless Jobs** (another Nebius service to highlight).

---

## 9. Data Model (draft)

> The final schema lives in [phases/phase-02.md](phases/phase-02.md) (P0) and [phase-11.md](phases/phase-11.md) (P1); cross-cutting decisions in [phases/architecture.ko.md](phases/architecture.ko.md).

```
users            (id, role: owner|sitter, name, push_token)
dogs             (id, owner_id, sitter_id, name, breed, birthdate, notes)
dog_allergies    (dog_id, allergen)
care_tasks       (id, dog_id, type: medication|walk, title, dose, schedule, notes)
task_logs        (id, task_id, due_at, completed_at, media_id, status: done|missed)
media            (id, dog_id, cloudinary_public_id, type: image|video, caption)
feed_posts       (id, dog_id, sitter_id, media_ids[], caption, task_log_id?, created_at)
photo_requests   (id, dog_id, owner_id, status, created_at)
daily_reports    (id, dog_id, date, body, status: draft|sent)
safety_checks    (id, dog_id, media_id, result_json, created_at)
notices          (id, sitter_id, title, body, show_popup, starts_at, ends_at)
sitter_schedule  (id, sitter_id, date, status, note)
messages         (id, dog_id, sender, body, ai_generated, created_at)
notifications    (id, user_id, type, ref_id, read_at)
```

---

## 10. Notifications

| Event | Recipient |
| :--- | :--- |
| New feed post (photo/video) | Owner |
| Medication / walk due | Sitter |
| Medication / walk completed (with photo) | Owner |
| Task missed | Owner + Sitter |
| Photo requested | Sitter |
| Daily report sent | Owner |
| New notice | Owner (popup on next app open) |
| Safety check = DANGER | Owner + Sitter |

- **Web demo:** Supabase Realtime → in-app notification center + toast.
- **Mobile (post-hackathon):** Expo Notifications (push).
- **Scheduled reminders:** backend scheduler (APScheduler) or Nebius Serverless Jobs.

---

## 11. Cloudinary Guide

Why: Supabase free storage is too small for photos and videos. Cloudinary's free plan gives credit-based storage/bandwidth plus automatic compression. (Check current free-plan limits at [cloudinary.com/pricing](https://cloudinary.com/pricing).)

- **Upload:** client requests a **signed upload** signature from FastAPI → uploads directly to Cloudinary → backend stores only `public_id` in Supabase.
- **Compression:** deliver with `f_auto,q_auto` (auto format like WebP/AVIF, auto quality).
- **Thumbnails:** `c_fill,w_400,h_400` for feed grid; video poster via `so_0` + `.jpg`.
- **Video:** limit length/size on upload; Cloudinary transcodes for web playback.
- **Privacy:** use a dedicated folder per dog; don't expose the API secret to the client.

---

## 12. Tavily Guide

**What it is:** Tavily is a **web search API built for AI agents**. Instead of returning a list of links like Google, it returns cleaned, relevant content (and an optional short answer) that an LLM can read directly. It also offers `extract` (pull content from a URL) and `crawl`.

**Why we use it**
- Nemotron's knowledge is fixed at training time. Pet food recalls and obscure ingredients change — Tavily gives the safety guard **live, cited information**.
- Qualifies us for **Best Use of Tavily ($3,000)** — requires a functional runtime call.
- Credits: included with the **Nebius Builders Program**; Tavily also has a free monthly tier.

**Where it fits**
1. **Unknown ingredient** → "Is `<ingredient>` safe for dogs? Does it contain chicken?" → feed results to Ultra.
2. **Recall check** → "`<brand> <product>` dog treat recall 2026".
3. *(Optional)* Q&A questions that need up-to-date info.

```python
from tavily import TavilyClient

tavily = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])
res = tavily.search(
    query="Is hydrolyzed animal protein safe for dogs with chicken allergy?",
    search_depth="basic",
    max_results=5,
    include_answer=True,
)
# res["answer"], res["results"][i]["content"], res["results"][i]["url"]
```

Show the sources (URLs) in the warning modal — it makes the AI's decision trustworthy and visible in the demo.

---

## 13. Nebius & NVIDIA Feedback Log

Required in the Devpost submission (and eligible for Most Valuable Feedback). Log as we go — be specific and name the tool.

| Date | Tool / Model | Used for | Worked well | Needs work | Onboarding | Who |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Sep 28 | Token Factory catalog | Choosing models | Clear pricing per model | Nano Omni in cookbook but missing from public catalog; model ID casing inconsistent | — | Minsik |

---

## 14. Open Questions

- [x] Demo language: **English only** (UI + AI output) — decided 2026-09-29 (architecture D1)
- [x] Backend hosting: **Nebius Serverless Endpoint**, Render fallback — decided 2026-09-29 (D18)
- [ ] Dataset language (Korean / English) and size.
- [ ] Nano Omni availability (confirm with API key).
- [ ] Toronto Builders & Brews (Sep 29) registration status.
