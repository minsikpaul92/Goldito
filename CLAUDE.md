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

**Product benchmark:** Korean **Kidsnote** — album feed, medication request/report, daily report (알림장). We adapt that loop for dogs + **NVIDIA Nemotron** on **Nebius Token Factory**.

**Demo north star:** The flow in root `README.md` — *A Day with PawNote* — must work end-to-end before hackathon submit.

**Hackathon hard rules:** Runtime on Token Factory; at least one **NVIDIA open-source model (Nemotron)**; public repo + MIT; demo stays up until judging ends; no real PII in repo or prompts.

---

## 2. Architecture (do not reinvent)

| Layer | Choice |
| :--- | :--- |
| Frontend | Expo (React Native Web) → later iOS/Android |
| Backend | FastAPI (Python 3.11+) — media sign, `/api/ai/*`, JWT |
| Data / Auth / Realtime | Supabase (Postgres + RLS + Realtime notifications) |
| Media | Cloudinary (signed upload, `f_auto,q_auto` delivery) |
| AI | Nemotron via Token Factory (backend only; keys never in client) |

**Preferred pattern:** Frontend uses **Supabase client + RLS** for CRUD; FastAPI for Cloudinary, AI, and authenticated helpers.

**Source of truth docs:**

- Product: `README.md`, `docs/README.ko.md`
- Plan & data model: `docs/plan/README.ko.md`
- **Active task queue:** `docs/plan/TODO.md` ← update every session
- Phase goals & DoD: `docs/plan/phases/` (see `README.ko.md` index)
- AI prompt snippets: `docs/plan/P0-ai-prompt-playbook.ko.md`
- Hackathon rules: `docs/hackathon/README.md`

---

## 3. UI/UX framework (build interactively)

Think in **two apps in one codebase** — role after login:

```
Owner                          Sitter
  Home (my dogs)                 Home (assigned dogs)
  Feed / Album                   Dog feed upload
  Tasks setup (med/walk)         Today's tasks + complete + photo
  Daily report (read)            Report generate → send
  Notifications                  Treat scanner (safety)
  (P1) Photo request             (P1) Notices
```

### UX principles

1. **Mobile-first, single column** — max comfort on phone-width web demo.
2. **One primary action per screen** — e.g. sitter task row → big "Complete with photo".
3. **Feedback loops** — loading skeleton → success toast → owner notification (visible in demo).
4. **Danger is loud** — safety `DANGER`: red modal, must acknowledge; do not use subtle toasts only.
5. **No sitter text fields for P0** — no caption box, no report textarea required (optional edit on report send is OK).
6. **Kidsnote familiarity** — timeline feed, checkmarks on meds, warm report tone (AI), not a developer dashboard.

### When implementing UI

- If Figma links or tokens exist, use them; otherwise use neutral spacing (8px grid), rounded cards, clear role labels ("Owner" / "Sitter" in dev builds).
- Empty states matter for judges: "No posts yet — sitter will share photos here."
- Prefer **working interaction** over pixel-perfect static screens.

### Ask the human when blocked

- Demo language (KO vs EN UI)
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

`00 → 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10`  
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
| Care feed & album + notify | 05, 09 |
| Medication & walk | 06 |
| Zero-typing daily report | 07 |
| Treat safety guard | 08 |
| Deploy & submit README | 10 |

P1 (photo request, notices, Tavily in safety, Q&A) — only after P0 queue is clear unless user reprioritizes.

---

## 8. AI endpoints (contract)

Implement in FastAPI; all call **Nebius Token Factory** with **Nemotron** models:

| Endpoint | Purpose |
| :--- | :--- |
| `POST /api/ai/caption` | Feed auto-caption |
| `POST /api/ai/daily-report` | End-of-day report draft |
| `POST /api/ai/safety-check` | Label photo → JSON safety |

Model IDs and regions: `docs/plan/README.ko.md` §6 and phase-07/08 docs.

---

## 9. Definition of "done" for the hackathon

- Public demo URL + test owner/sitter accounts documented
- Root README Getting Started runs the project
- Video path matches *A Day with PawNote*
- Feedback on Token Factory / Nemotron filled in README log
- Design feels like a **product**, not a single API demo page

---

*Last aligned with repo docs: phases 00–10, P0 playbook. If you change process, update this file and `docs/plan/TODO.md` together.*
