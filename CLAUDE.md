# CLAUDE.md — PawNote agent instructions

This file guides AI assistants (Claude, Cursor, etc.) working in **PawNote**: a Kidsnote-style pet care app for the **Nebius x NVIDIA Global AI Hackathon** (track: Best Apps and Agents).

**Human team:** Minsik (full-stack), Seulgi (AI & data anonymization), Muk (UX/UI).  
**User-facing explanations to Minsik:** Korean. **Code & comments:** English.

---

## 1. North-star goals

Every feature must pass:

| Owner | Sitter |
| :--- | :--- |
| **Learn without asking.** Updates arrive proactively. | **Care, snap, tap.** Near-zero report typing (pick AI chips, add a short note if needed), no repetitive DMs. |

**Product benchmark:** **Rover** (booking, fast replies) × Korean **Kidsnote** (medication request, check-in/out, daily report 알림장, album) × **Uber** (live trips). We adapt that loop for **dogs and cats** + **NVIDIA Nemotron** on **Nebius Token Factory**.

**Product flow (source of truth):** `docs/plan/full-process.ko.md` — 5 stages: **Inquiry → Meet & Greet → Booking → Care & Pet Transit → Completion** (architecture D27–D47).

**Demo north star:** The 5-stage flow in root `README.md` — *How PawNote Works* and the demo path *A Stay with PawNote* — must work end-to-end before hackathon submit.

**Hackathon hard rules:** Runtime on Token Factory; at least one **NVIDIA open-source model (Nemotron)**; public repo + MIT; demo stays up until judging ends; no real PII in repo or prompts.

---

## 2. Architecture (do not reinvent)

| Layer | Choice |
| :--- | :--- |
| Frontend | Expo (React Native Web) → later iOS/Android |
| Backend | FastAPI (Python 3.12) — media sign, `/api/ai/*`, JWT |
| Data / Auth / Realtime | Supabase (Postgres + RLS + Realtime notifications) |
| Media | Cloudinary (signed upload, `f_auto,q_auto` delivery) |
| Video Meet & Greet | Google Meet links from the Google Calendar API (backend only; PawNote Google account OAuth — D45) |
| AI | Token Factory (backend only; keys never in client) — Nemotron for replies/reasoning/reports, MiniCPM-V for vision (final — NVIDIA vision models are Dedicated-Endpoint-only), Qwen3 Embedding for RAG (final; Supabase pgvector) — US/NVIDIA models first (D39) ([model-ids.md](docs/plan/phases/notes/model-ids.md)) |

**Preferred pattern:** Frontend uses **Supabase client + RLS** for CRUD; FastAPI for Cloudinary, AI, and authenticated helpers.

**Source of truth docs:**

- Product: `README.md`, `docs/README.ko.md`
- **Product flow (5 stages, demo path):** `docs/plan/full-process.ko.md`
- Plan & data model: `docs/plan/README.ko.md`
- **Active task queue:** `docs/plan/TODO.md` ← update every session
- **Blueprint (decisions, repo layout, routes, env, API contract):** `docs/plan/phases/architecture.ko.md`
- **Design guide (tokens, components, UI patterns):** `DESIGN.md` — interim until Muk's Figma
- Phase goals & DoD: `docs/plan/phases/` (see `README.ko.md` index)
- AI prompt snippets: `docs/plan/P0-ai-prompt-playbook.ko.md`
- Hackathon rules: `docs/hackathon/README.md`

---

## 3. UI/UX framework (build interactively)

Think in **two apps in one codebase** — role after login:

```
Owner                                  Sitter
  Home (pets, next booking;              Home (dashboard: in-care pets OR
    Care request → pet detail later;       pending requests · upcoming ·
    later: 8bit status)                    drop/pick by time; later: tamagotchi)
  Bookings (inquiry → checkout)          Bookings (requests · M&G · Past history)
  Trip (live map + ETA)                  Trip (Start trip, photo check)
  Feed (album, multi-pet toggle)         Feed (+ Photo → album)
  Diary (Live + history; photo→Feed)     Diary (stay log + evening chips)
  Mood (fun mood from clip)              Mood (same tool)
  Profile → Settings                     Profile → Settings · Earnings (later)
  Notifications (bell)                   Treat scanner from Home (08)
```

Tab bar (D47 · D47b): both roles `Home · Bookings · Feed · Diary · Mood`.
### UX principles

1. **Mobile-first, single column** — max comfort on phone-width web demo. Design frame **402 × 874**; on desktop browsers the app runs inside a phone frame and **every action must work with a mouse** (click = tap, drag/wheel = swipe) — `DESIGN.md` §2.1 · §7.7, architecture D25.
2. **One primary action per screen** — e.g. sitter task row → big "Complete with photo".
3. **Feedback loops** — loading skeleton → success toast → owner notification (visible in demo).
4. **Danger is loud** — safety `DANGER`: red modal, must acknowledge; do not use subtle toasts only.
5. **No required sitter text fields for P0 (near-zero typing, D38)** — no caption box, no required report textarea. The AI suggests chips from the day's check-ins and photos; the sitter picks them. Optional only: a short note on the daily report (≤ 200 chars), edits to an AI draft before it goes out (report, inquiry), the sitter's policy text and meeting spots (written once). All owner-facing AI text is in the sitter's first-person tone (D35); the sitter approves every reply unless auto-send is opted in (D36).
6. **Kidsnote familiarity** — timeline feed, checkmarks on meds, warm report tone (AI), not a developer dashboard.

### When implementing UI

- **Read [`DESIGN.md`](DESIGN.md) before building UI** (tokens, components, patterns). If a Figma frame exists for the screen, it wins; otherwise follow `DESIGN.md` and `frontend/theme/tokens.ts`.
- Empty states matter for judges: "No posts yet — sitter will share photos here."
- Prefer **working interaction** over pixel-perfect static screens.

### Ask the human when blocked

- Missing Figma for a screen — offer wireframe-level UI and note for Muk
- Model ID unavailable after `GET /v1/models`

---

## 4. How work progresses (mandatory loop)

**Never jump ahead of the queue.** One task → implement → verify → commit on the phase branch → update TODO. **PRs are per phase** (or per large chunk), not per task.

```
┌──────────────────────────────────────────────────────────────┐
│ 1. Read docs/plan/TODO.md → "Current focus" (one item)        │
│ 2. Read matching docs/plan/phases/phase-XX.md (Goal+DoD)      │
│ 3. Git: on the phase branch (create it from latest main at    │
│    the phase's first task — see §4.1)                         │
│ 4. Implement ONLY that task (minimal diff)                    │
│ 5. Verify DoD (commands, manual steps)                        │
│ 6. Commit (one commit per task, §4.3) → push                  │
│ 7. Update TODO.md (see §5) in the same commit                 │
│ 8. Phase done (or chunk large)? → finish the PR (§4.2)        │
│ 9. Report to user: commit + next focus item (PR link at end)  │
└──────────────────────────────────────────────────────────────┘
```

### 4.1 Branch per phase

- **One phase = one branch** (e.g. all of Phase 03 on `feat/phase-03-auth`). Each TODO task is **one commit** on it. Do not mix tasks from other phases.
- Start the branch from latest `main` (`git pull origin main` then `git checkout -b <branch>`); merge `main` into it when `main` moves.
- A very large or risky chunk inside a phase may get its own branch + PR — decide with the user.
- Small standalone fixes (typo, config, one-file chore) can be a small branch + PR when they can't wait for the phase.
- **Naming:** short, descriptive, **kebab-case**.

  Good: `feat/phase-03-auth`, `feat/phase-05-care-feed`, `docs/hackathon-phases`  
  **Forbidden:** `claude/…`, `cursor/…`, `ai/…`, `copilot/…`, or any tool/model name as prefix.

- **Never rename a branch that has an open PR** — GitHub closes the PR.
- Do not commit directly to `main` for feature work. Merge via PR after review (or when the user asks to merge).

### 4.2 Pull request (per phase)

- Open the phase PR as a **draft** after the first task commit (`gh pr create --draft`) so CI runs on every push; keep its task table up to date.
- When the phase DoD passes: update the PR title/body for the whole phase, mark it ready (`gh pr ready`).
- **PR title:** same style as commit message (see §4.3), e.g. `feat: phase 03 auth, roles, and pet profiles`. Describe *what* and *why* for reviewers (Minsik / Seulgi / Muk).
- **PR body:** Summary bullets / task table, test plan checklist, link to phase doc.
- **Do not merge** unless the user explicitly asks (squash merge, delete branch).

### 4.3 Commits, PRs, branches — no AI attribution

Write like a human teammate. **Never** indicate that an AI assistant wrote the change.

**Forbidden everywhere** (commit subject/body, PR title/body, branch names, co-author trailers):

- Mentions of Claude, Cursor, Copilot, ChatGPT, “AI-generated”, “written by assistant”, etc.
- Tool prefixes on branches (`claude/`, `cursor/`, …).
- `Co-authored-by:` (or similar) for bots/tools.
- “Made with …” footers in PR descriptions.

**Use instead:**

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:` — **single-line subject** (repo rule).
- Example: `feat: add FastAPI health endpoint and CORS for Expo web`
- Optional issue ref: `feat: add care feed timeline (#12)`

English only for commit messages and GitHub PR content.

### Phase order

`00 → 01 → 02 → 03 → 03B → 03C → 04 → 05 → 06 → 07 → 07B → 09 → 07C → 06B → (08 stretch) → 10 → 11 (P1)` — 06B is the last P0 phase, right after 07C; 08 runs only if time remains (D41). Dates in `docs/plan/phases/README.ko.md`.  
After **07.1** (Nebius client), Seulgi's AI backend track (07B → 6.12 → 7.2/7.4 → 9.1 → 7C.4 → 6B.5) runs in parallel with Minsik's app queue, but TODO must list **one** "Current focus" per agent session.

### Coding discipline

- Minimize scope; no drive-by refactors.
- No secrets in git; extend `.env.example` only.
- **Git:** follow §4.1–4.3 (phase branch → one commit per task → push → phase PR). Do not commit on `main` for features. If the user says “commit and push” for the current task, do it on the **phase branch** (the draft PR updates itself).
- Anonymize any real customer data (Seulgi owns policy; never commit `data/raw/`).

---

## 5. TODO list ritual (required after every task)

**File:** `docs/plan/TODO.md`

When a task is **done** (DoD met):

1. **Remove** its line from **Current focus** / **Up next** (or check `[x]` and move to **Completed** with date `YYYY-MM-DD`).
2. Set **Current focus** to exactly **one** next task ID (e.g. `1.2 FastAPI health`).
3. If the whole phase is done, note `Phase N complete` in **Completed** and set focus to first task of phase N+1.
4. If you discovered new work, add it to **Up next** with a short ID — do not silently expand scope in the same task.

If TODO.md and phase docs disagree, **phase Goal/DoD wins**; fix TODO to match.

---

## 6. Task prompt template (copy for each session)

```text
Read CLAUDE.md and docs/plan/TODO.md.
Work ONLY on the "Current focus" task.
Read the linked docs/plan/phases/phase-XX.md for Goal and DoD.
Work on the phase branch (CLAUDE.md §4.1 — create it from main at the phase's first task; no claude/cursor/ai prefixes).
When DoD passes: update TODO.md (§5), commit (§4.3), push — the phase draft PR updates itself (§4.2).
When the phase is done: finish the phase PR. Report the commit, verify steps, and next focus.
```

Detailed Nebius/OpenAI-style header: `docs/plan/P0-ai-prompt-playbook.ko.md` §1.

---

## 7. P0 feature → phase map

| Feature | Phases |
| :--- | :--- |
| ① Inquiry — AI draft in the sitter's tone + approval + RAG | 07B (quote: 03C) |
| ② Meet & Greet — care request → checklist, Meet & Greet, transport mode | 06, 03B |
| ③ Booking — schedule, request, consents, demo payment, timed unlock | 02, 03B, 03C (P1 polish: 11) |
| ④ Care & Pet Transit — live trip, photo check, 5-second check, daily report, feed & album | 04, 05, 06, 06B, 07, 09 |
| ⑤ Completion — home-safe report, review, Pet Life Record → RAG | 07C |
| Treat safety guard (stretch, after 07C) | 08 |
| Deploy & submit README | 10 |

The scenario core (03B → 07C) comes first, then Pet Transit (06B) as the last P0 phase (D41); the treat safety guard (08, + Tavily 8.7) is a P0 stretch only if time remains after 06B (D27). P1 (photo request, notices, favorite sitters, recurring schedule; Tavily only if 8.7 slipped) and P2 (SFT showcase 11.7, D43) — only after P0 queue is clear unless user reprioritizes. The old P2 Q&A is now the Stage 1 inquiry AI (07B).

---

## 8. AI endpoints (contract)

Implement in FastAPI; all call **Nebius Token Factory** — Nemotron for text, MiniCPM-V for vision, Qwen3 Embedding for RAG. Prices, dates, and availability come from the server, never from the model; entry codes never go into prompts (D29, D31). Every call writes one metrics log line (architecture §9):

| Endpoint | Purpose |
| :--- | :--- |
| `POST /api/ai/inquiry-reply` | Stage 1 — auto-reply grounded in schedule, quote, policy, Life Record (RAG) |
| `POST /api/ai/care-plan` | Stage 2 — care & medication request → checklist draft |
| `POST /api/ai/handoff-check` | Stage 4 — handoff photo check (pet visible, crate / seatbelt) |
| `POST /api/ai/caption` | Stage 4 — feed auto-caption + album category |
| `POST /api/ai/report-chips` | Stage 4 — chip suggestions from the day's check-ins, tasks, and photos; the sitter keeps or turns off each (D38) |
| `POST /api/ai/daily-report` | Stage 4 — report draft from the chips the sitter kept, an optional short note, and photos; posted only after the sitter approves |
| `POST /api/ai/life-record` | Stage 5 — stay → Pet Life Record + RAG indexing |
| `POST /api/ai/safety-check` | Stretch — label photo → JSON safety (+ Tavily sources, 8.7) |

Model IDs and regions: `docs/plan/phases/notes/model-ids.md` (source of truth; checked with `GET /v1/models`) and phase-07/08 docs.

---

## 9. Definition of "done" for the hackathon

- Public demo URL + test owner/sitter accounts documented
- Root README Getting Started runs the project
- Video path matches *A Stay with PawNote* (5 stages, `docs/plan/full-process.ko.md` §6)
- Feedback on Token Factory / Nemotron filled in README log
- Design feels like a **product**, not a single API demo page

---

*Last aligned with repo docs: phases 00–11 (incl. 03C · 06B · 07B · 07C), full-process.ko.md, P0 playbook, **D47 / D47b** both roles Home · Bookings · Feed · Diary · Mood. If you change process, update this file and `docs/plan/TODO.md` together.*
