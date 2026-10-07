## Inspiration

After three years of pet sitting dogs and cats, we watched the same things go wrong at every step of a stay. Owners book whoever answers first, so a sitter who is busy with pets (or asleep) loses the booking. Meals, pills, and house rules get passed along by voice and chat, and details vanish. Lockbox codes sit in plain chat days before anyone needs them. During the stay owners keep texting *"Did she eat?" "Can I see a photo?"*, and sitters spend the day typing instead of caring. When it ends, everything the sitter learned about the pet disappears in a thread, and the next sitter starts from zero.

Existing pet-care and sitter apps help with booking and photo updates, but the work in between still happens in chat. We wanted to go one step further and fix the whole journey, not one screen: an app that covers every step of a stay, from the first question to the ride home, with an AI agent that does the typing so the sitter can just care.

**Goldito** is that product: owners never need to ask; sitters just care, snap, and tap.

## What it does

Goldito covers a pet stay in **five stages**, for dogs and cats:

1. **Inquiry** — The owner asks about a stay (boarding or house sitting, dates, pets). Goldito AI drafts a reply **in the sitter's own writing style** in seconds, using the sitter's calendar, a server-calculated quote (holiday and multi-pet rates), the house policy, and the pet's Life Record. The sitter sends it with one tap, or opts into auto-send with a human-paced "typing…" delay.
2. **Meet & Greet** — The owner writes a care and medication request like a note; Nemotron turns it into a timed mission checklist and Heads-up cards. First-time pairs meet in person or on **Google Meet** (link and calendar invite created automatically) before the sitter accepts.
3. **Booking** — Canada-first consent forms (emergency vet authorization, lockbox and buzzer use, shared space, safe return), a demo payment, and **timed unlock**: the sitter's address appears after payment, while the owner's lockbox and buzzer codes unlock for the sitter only 2 hours before the visit.
4. **Care & Pet Transit** — Live trip with map and ETA, a photo check at the handoff (vision model confirms the pet is there and secured), then a **5-second check**: Goldito suggests chips from the day's check-ins and photos, the sitter turns off anything wrong, and Nemotron writes the daily note in the sitter's voice. It posts only after the sitter approves. Every photo gets a caption and lands in a day-by-day album sorted into Meals, Walks, and Naps.
5. **Completion** — "Max is home safe" with a photo, a 5-star review, and a **Pet Life Record** built from the whole stay and stored in a RAG knowledge base. The next booking, even with a new sitter, starts informed.

Goldito's AI works like an agent: each event in a stay triggers it, it gathers facts, acts, and remembers. A person approves anything that reaches the other side. Prices, dates, and entry codes never come from the model, and entry codes never enter prompts or RAG.

**Demo tip:** open it on a computer. The app runs inside a phone frame (click = tap, drag = swipe), with sample photos and a **Simulate the drive** button, so no camera or GPS is needed.

## How we built it

| Layer | Stack |
| :--- | :--- |
| Frontend | Expo (React Native for Web), mobile-first, shown in a 402×874 phone frame on desktop |
| Backend | FastAPI (Python 3.12): JWT, Cloudinary signing, `/api/ai/*`, Google Calendar for Meet links |
| Data / Auth / Realtime | Supabase: Postgres + RLS, Realtime notifications, pgvector for RAG |
| Media | Cloudinary (signed upload, `f_auto,q_auto`) |
| Maps | Leaflet + OpenStreetMap (view only) |
| AI | **Nebius Token Factory** only, called from the backend (keys never in the client) |

**Models on Token Factory**
- **NVIDIA Nemotron 3 Nano** — fast inquiry replies in the sitter's tone
- **NVIDIA Nemotron 3 Super** — care-request checklists, daily notes, Life Records
- **NVIDIA Nemotron 3 Ultra** — treat-label safety reasoning (stretch)
- **MiniCPM-V 4.5** — handoff photo checks, captions, album sorting
- **Qwen3-Embedding-8B** — RAG retrieval (Supabase pgvector)

We worked from a single product-flow document (the 5 stages), a phase-by-phase plan with a definition of done for each phase, ordered SQL migrations, and a hosted smoke test, so the demo path and the code stayed in sync. Prices come from a server-side quote function; the model only writes the sentences around them.

## Challenges we ran into

- **Keeping the AI honest.** A wrong price or date in a booking reply is worse than a slow reply. We moved quotes, availability, and entry codes entirely to the server, so the model only writes around facts it is handed, and the reply and checkout always show the same numbers.
- **No NVIDIA vision model on the shared API.** Nemotron's vision models are dedicated-endpoint only, and keeping one running through judging would cost more than our credits. We kept Nemotron for reasoning and writing and used MiniCPM-V on the shared API for vision.
- **Sounding like the sitter, not like an AI.** Owner-facing text has to read as the sitter's voice. We built a style layer from anonymized past conversations plus few-shot examples, and kept safety warnings, quotes, and consent forms as fixed text outside it.
- **Secrets that unlock on time.** Lockbox codes must be visible to the right person only inside a time window, then lock again, with an access log and an owner notification. That put the logic in RLS and server rules, not the UI.
- **Scope vs. a five-stage journey.** The first version was a daily-report app. Covering the whole stay meant ordering work so the core scenario came first and the stretch features (treat safety guard) only if time remained.
- **Desktop judging.** Judges use mice, not phones, and can't carry a phone on a drive. We built a phone frame with mouse-as-finger interactions and a simulated trip.

## Accomplishments that we're proud of

- A clear promise for both sides: **owners never need to ask; sitters never type reports.**
- A human-in-the-loop agent design: the AI drafts and acts, a person approves what reaches the other side.
- Privacy built in: timed unlock for entry info, location shared only while moving with no route history, and codes kept out of prompts and RAG.
- A Pet Life Record that carries what one sitter learned to the next, so a new sitter starts informed.
- A shared data model, RLS, booking rules, Cloudinary media pipeline, care feed with notifications, care tasks and check-ins, and the daily-report API already built and merged.
- A web demo that feels like a real mobile product, even on a laptop.

## What we learned

- For care apps, **notifications and history beat chat**. Sitters will tap; they won't write essays.
- The best way to trust an AI in a booking flow is to take numbers and secrets away from it entirely.
- Token Factory pushes honest model choices: check `GET /v1/models` and the endpoint types instead of assuming a model is available on the shared API.
- **RLS and grants are the product.** If the wrong person can see a pet or an entry code, no UI polish matters.
- A hackathon demo is as much process (a task queue, per-phase definitions of done, migrations, smoke tests) as it is models.

## What's next for Goldito

- **Real payments** (Stripe, refunds, taxes) in place of the demo payment.
- **Road-based ETA** with a routing API, address search, and background location on native apps.
- **Drop-in visits** with their own capacity rules.
- **Settings & patch notes**: an in-app *What's New* from our changelog.
- **8-bit pet status room**: a Tamagotchi-style Home showing fed, potty, mood, and next task.
- **Decorated daily notes** with pet cut-out stickers, and **mood from video**: a short clip becomes a one-line note based only on what the pet visibly does.
- **Pawstagram** and a **pet-friendly map**, and a **sitter desktop** layout for planning schedules and sending notes faster.
