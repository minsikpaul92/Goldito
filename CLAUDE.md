# CLAUDE.md — PawNote agent instructions

This file guides AI assistants (Claude, Cursor, etc.) working in **PawNote**: a Kidsnote-style pet care app for the **Nebius x NVIDIA Global AI Hackathon** (track: Best Apps and Agents).

**Human team:** Minsik (full-stack), Seulgi (AI & data anonymization), Muk (UX/UI).  
**User-facing explanations to Minsik:** Korean. **Code & comments:** English.

---

## 1. North-star goals

Every feature must pass:

| Owner | Sitter |
| :--- | :--- |
| **Learn without asking.** Updates arrive proactively. | **Care, snap, tap.** No report typing, no repetitive DMs. |

**Product benchmark:** Korean **Kidsnote** — album feed, medication request/report, daily report (알림장). We adapt that loop for **dogs and cats** + **NVIDIA Nemotron** on **Nebius Token Factory**.

**Demo north star:** The flow in root `README.md` — *A Day with PawNote* — must work end-to-end before hackathon submit.

**Hackathon hard rules:** Runtime on Token Factory; at least one **NVIDIA open-source model (Nemotron)**; public repo + MIT; demo stays up until judging ends; no real PII in repo or prompts.

---

## 2. Architecture (do not reinvent)

| Layer | Choice |
| :--- | :--- |
| Frontend | Expo (React Native Web) → later iOS/Android |
| Backend | FastAPI (Python 3.12) — media sign, `/api/ai/*`, JWT |
| Data / Auth / Realtime | Supabase (Postgres + RLS + Realtime notifications) |
| Media | Cloudinary (signed upload, `f_auto,q_auto` delivery) |
| AI | Token Factory (backend only; keys never in client) — Nemotron for reasoning/reports, MiniCPM-V for vision ([model-ids.md](docs/plan/phases/notes/model-ids.md)) |

**Preferred pattern:** Frontend uses **Supabase client + RLS** for CRUD; FastAPI for Cloudinary, AI, and authenticated helpers.

**Source of truth docs:**

- Product: `README.md`, `docs/README.ko.md`
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
Owner                          Sitter
  Home (my pets)                 Today (pets in my care now)
  Bookings (find sitter, trips)  Schedule + booking requests
  Feed / Album                   Pet feed upload
  Tasks setup (med/walk)         Today's tasks + complete + photo
  Daily report (read)            Report generate → send
  Notifications                  Treat scanner (safety)
  (P1) Photo request             (P1) Notices
```

### UX principles

1. **Mobile-first, single column** — max comfort on phone-width web demo. Design frame **402 × 874**; on desktop browsers the app runs inside a phone frame and **every action must work with a mouse** (click = tap, drag/wheel = swipe) — `DESIGN.md` §2.1 · §7.7, architecture D25.
2. **One primary action per screen** — e.g. sitter task row → big "Complete with photo".
3. **Feedback loops** — loading skeleton → success toast → owner notification (visible in demo).
4. **Danger is loud** — safety `DANGER`: red modal, must acknowledge; do not use subtle toasts only.
5. **No sitter text fields for P0** — no caption box, no report textarea required (optional edit on report send is OK).
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

**Never jump ahead of the queue.** One task → branch → implement → verify → commit → PR → update TODO.

```
┌─────────────────────────────────────────────────────────┐
│ 1. Read docs/plan/TODO.md → "Current focus" (one item)   │
│ 2. Read matching docs/plan/phases/phase-XX.md (Goal+DoD) │
│ 3. Git: pull main → create task branch (see §4.1)        │
│ 4. Implement ONLY that task (minimal diff)               │
│ 5. Verify DoD (commands, manual steps)                   │
│ 6. Commit on branch → push → open PR (see §4.2)          │
│ 7. Update TODO.md (see §5) on the same branch or follow-up PR │
│ 8. Report to user: PR link + next focus item             │
└─────────────────────────────────────────────────────────┘
```

### 4.1 Branch per task

- **One TODO task = one branch.** Do not mix unrelated tasks on one branch.
- Branch from latest `main` (or default branch): `git pull origin main` then `git checkout -b <branch>`.
- **Naming:** short, descriptive, **kebab-case**. Use task ID when helpful.

  Good: `feat/1-2-fastapi-health`, `feat/5-care-feed`, `docs/hackathon-phases`  
  **Forbidden:** `claude/…`, `cursor/…`, `ai/…`, `copilot/…`, or any tool/model name as prefix.

- Do not commit directly to `main` for feature work. Merge via PR after review (or when the user asks to merge).

### 4.2 Pull request

- After DoD passes: push branch and create a PR targeting `main` (`gh pr create` or GitHub UI).
- **PR title:** same style as commit message (see §4.3). Describe *what* and *why* for reviewers (Minsik / Seulgi / Muk).
- **PR body:** Summary bullets, test plan checklist, link to phase doc / task ID (e.g. `1.2`).
- **Do not merge** unless the user explicitly asks.

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

`00 → 01 → 02 → 03 → 03B → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 (P1)`  
After **07.1** (Nebius client), **07 / 08 / 09** can parallelize (Seulgi vs Minsik) but TODO must list **one** "Current focus" per agent session.

### Coding discipline

- Minimize scope; no drive-by refactors.
- No secrets in git; extend `.env.example` only.
- **Git:** follow §4.1–4.3 (task branch → commit → push → PR). Do not commit on `main` for features. If the user says “commit and push” for the current task, do it on the **task branch** and open/update the PR.
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
Create a new branch from main (CLAUDE.md §4.1 — no claude/cursor/ai prefixes).
When DoD passes: commit (§4.3), push, open PR (§4.2), update TODO.md (§5).
Report PR URL and verify steps.
```

Detailed Nebius/OpenAI-style header: `docs/plan/P0-ai-prompt-playbook.ko.md` §1.

---

## 7. P0 feature → phase map

| Feature | Phases |
| :--- | :--- |
| Sitter availability + trip booking | 02, 03B (P1 polish: 11) |
| Care feed & album + notify | 05, 09 |
| Medication & walk | 06 |
| Zero-typing daily report | 07 |
| Treat safety guard | 08 |
| Deploy & submit README | 10 |

Tavily sources in the safety guard are **8.7 (P0 stretch)** right after 8.1–8.6. P1 (photo request, notices, favorite sitters, recurring schedule; Tavily only if 8.7 slipped) and P2 (Q&A, SFT idea 11.7) — only after P0 queue is clear unless user reprioritizes.

---

## 8. AI endpoints (contract)

Implement in FastAPI; all call **Nebius Token Factory** — Nemotron for text reasoning, MiniCPM-V for vision (caption, label reading). Every call writes one metrics log line (architecture §9):

| Endpoint | Purpose |
| :--- | :--- |
| `POST /api/ai/caption` | Feed auto-caption |
| `POST /api/ai/daily-report` | End-of-day report draft |
| `POST /api/ai/safety-check` | Label photo → JSON safety (+ Tavily sources, 8.7) |

Model IDs and regions: `docs/plan/phases/notes/model-ids.md` (source of truth; checked with `GET /v1/models`) and phase-07/08 docs.

---

## 9. Definition of "done" for the hackathon

- Public demo URL + test owner/sitter accounts documented
- Root README Getting Started runs the project
- Video path matches *A Day with PawNote*
- Feedback on Token Factory / Nemotron filled in README log
- Design feels like a **product**, not a single API demo page

---

*Last aligned with repo docs: phases 00–10, P0 playbook. If you change process, update this file and `docs/plan/TODO.md` together.*
