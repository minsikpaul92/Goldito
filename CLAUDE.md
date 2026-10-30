> **Before starting any work, update `main` first:** `git checkout main && git pull origin main`. Only then read the assigned GitHub issue, create the phase branch (from that updated `main`, §4.1) and begin.

# CLAUDE.md — Goldito agent instructions

This file guides AI assistants (Claude, Cursor, etc.) working in **Goldito**: a Kidsnote-style pet care app for the **Nebius x NVIDIA Global AI Hackathon** (track: Best Apps and Agents).

**Human team:** Minsik (full-stack **and, since 2026-10-04, the AI backend track too** — from 2026-10-09 the urgent demo-path work), Seulgi (from 2026-10-09 **Phase Q**: QA, sitter-eye UX and wording, anonymized data and tone, R3/R4 review items — `docs/plan/phases/phase-q-quality.md`), Muk (UX/UI), JeonBeomGu-S (from 2026-10-19: QA fixes first, new features after; full stack).  
**User-facing explanations to Minsik:** Korean. **Code & comments:** English.

---

## 1. North-star goals

Every feature must pass:

| Owner | Sitter |
| :--- | :--- |
| **Learn without asking.** Updates arrive proactively. | **Care, snap, tap.** Near-zero report typing (pick AI chips, add a short note if needed), no repetitive DMs. |

**Product benchmark:** **Rover** (booking, fast replies) × Korean **Kidsnote** (medication request, check-in/out, daily report 알림장, album) × **Uber** (live trips). We adapt that loop for **dogs and cats** + **NVIDIA Nemotron** on **Nebius Token Factory**.

**Product flow (source of truth):** root `README.md` (*How Goldito works*) and `docs/plan/phases/architecture.md` — 5 stages: **Inquiry → Meet & Greet → Booking → Care & Pet Transit → Completion** (architecture D27–D47).

**Demo north star:** The 5-stage flow in root `README.md` — *How Goldito Works* — must work end-to-end before hackathon submit.

**Hackathon hard rules:** Runtime on Token Factory; at least one **NVIDIA open-source model (Nemotron)**; public repo + MIT; demo stays up until judging ends; no real PII in repo or prompts.

---

## 2. Architecture (do not reinvent)

| Layer | Choice |
| :--- | :--- |
| Frontend | Expo (React Native Web) → later iOS/Android |
| Backend | FastAPI (Python 3.12) — media sign, `/api/ai/*`, JWT |
| Data / Auth / Realtime | Supabase (Postgres + RLS + Realtime notifications) |
| Media | Cloudinary (signed upload, `f_auto,q_auto` delivery) |
| Video Meet & Greet | Google Meet links from the Google Calendar API (backend only; Goldito Google account OAuth — D45) |
| AI | Token Factory (backend only; keys never in client) — Nemotron for replies/reasoning/reports, Nemotron 3.5 Super VL for vision (since 2026-10-27; MiniCPM-V before, and the rollback), Qwen3 Embedding for RAG (final; Supabase pgvector) — US/NVIDIA models first (D39) ([model-ids.md](docs/plan/phases/notes/model-ids.md)) |

**Preferred pattern:** Frontend uses **Supabase client + RLS** for CRUD; FastAPI for Cloudinary, AI, and authenticated helpers.

**Source of truth docs:**

- Product: `README.md`
- **Feature status + test scenarios:** `docs/plan/test-guide.md`
- **Product flow (5 stages):** root `README.md` (*How Goldito works*), decisions D27 to D47 in `docs/plan/phases/architecture.md`
- Plan & data model: `docs/plan/phases/architecture.md`
- **Active task queue:** [GitHub issues](https://github.com/minsikpaul92/Goldito/issues): milestone = priority (P0 hackathon, P1, P2 after hackathon), assignee = owner. There is no TODO file: do not create or update one, read the assigned issue and update the issue (comment, checklist, PR `Closes #N`).
- **Blueprint (decisions, repo layout, routes, env, API contract):** `docs/plan/phases/architecture.md`
- **Design guide (tokens, components, UI patterns):** `DESIGN.md` — §0 maps Muk's Figma (source of truth) to the code; every screen and button: the screen map (`node frontend/scripts/screen-map.mjs` writes `docs/design/screen-map.md`; generated, not committed)
- Phase goals & DoD: `docs/plan/phases/` (see `README.md` index)
- Hackathon rules: `docs/hackathon/README.md`
- Discord MCP (`.mcp.json`, token in `backend/.env`): QA channel `qa` = `1560683683072180224`

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
  Snap (treat check · mood · sticker)    Snap (same tools)
  Profile → Settings                     Profile → Settings · Earnings (later)
  Notifications (bell)
```

Tab bar (D47 · D47b · D61, D63): both roles `Home · Bookings · Chat · Feed · Snap`; Diary sits inside Feed (Photos · Diary).
### UX principles

1. **Mobile-first, single column** — max comfort on phone-width web demo. Design frame **402 × 874**; on desktop browsers the app runs inside a phone frame and **every action must work with a mouse** (click = tap, drag/wheel = swipe) — `DESIGN.md` §2.1 · §7.7, architecture D25.
2. **One primary action per screen** — e.g. sitter task row → big "Complete with photo".
3. **Feedback loops** — loading skeleton → success toast → owner notification (visible in demo).
4. **Danger is loud** — safety `DANGER`: red modal, must acknowledge; do not use subtle toasts only.
5. **No required sitter text fields for P0 (near-zero typing, D38)** — no caption box, no required report textarea. The AI suggests chips from the day's check-ins and photos; the sitter picks them. Optional only: a short note on the daily report (≤ 200 chars), edits to an AI draft before it goes out (report, inquiry), the sitter's policy text and meeting spots (written once). All owner-facing AI text is in the sitter's first-person tone (D35); the sitter approves every reply unless auto-send is opted in (D36).
6. **Kidsnote familiarity** — timeline feed, checkmarks on meds, warm report tone (AI), not a developer dashboard.

### When implementing UI

- **Read [`DESIGN.md`](DESIGN.md) before building UI** (tokens, components, patterns). If a Figma frame exists for the screen, it wins; otherwise follow `DESIGN.md` and `frontend/theme/tokens.ts`.
- Empty states matter for judges: "No posts yet. Your sitter will share photos here."
- Prefer **working interaction** over pixel-perfect static screens.

### Minimal UI and copy

Build the app minimal. A screen should be understandable at a glance, without explanations.

- **Prefer an obvious UI over an explained one.** Add a hint, caption, helper text, or description only when the screen cannot be understood without it. If it can, leave it out.
- **No tutorial-style text.** Do not restate what a label or button already says, and do not write "this is where you..." sentences. When a line is truly needed, keep it to one short sentence.
- **Keep every string short.** Labels, buttons, empty states, errors, toasts, placeholders, and confirmations are a few words or one short sentence. Detailed or lengthy copy reads as AI-written and makes the app look cluttered.
- **Hide optional inputs by default** (for example, a note box behind a "+" button) instead of showing every field with a description.
- **Emoji: avoid the ones AI text uses all the time** (the list is in `DESIGN.md` §7.6, e.g. ✨ 🚀 💡 🔥 ✅ ❌ ⚠️ 🎯 📌 🌟 🎉 👋 🙌 💪 🤖 🔍 📝 ⭐ 💬). Other emoji are fine, buttons included; a line icon or plain words also work.
- **Punctuation: never use em dashes or en dashes** in anything you write (UI copy, hints, placeholders, comments, docs, commit and PR text, replies). Use a comma, parentheses, or split the text into two sentences. For ranges write "1 to 4" or "1-4" with a hyphen.
- Do not rewrite existing text in bulk. Fix a line when you touch it (surgical changes still apply).

### Ask the human when blocked

- Missing Figma for a screen — offer wireframe-level UI and note for Muk
- Model ID unavailable after `GET /v1/models`

---

## 4. How work progresses (mandatory loop)

**Never jump ahead of the queue.** One task → implement in **steps** → verify → commit each step on the phase branch → update the issue. **One PR per bundle of work** (a phase, or everything one person does in one stretch on one track, such as several issues of the booking chat) — it stays the same PR until the bundle is done; never one PR per task, per issue or per step, and never a stack of PRs on each other. Every PR costs a full CI wait, so fewer and bigger is the rule.

```
┌──────────────────────────────────────────────────────────────┐
│ 1. Read the assigned GitHub issue (one item)                  │
│ 2. Read matching docs/plan/phases/phase-XX.md (Goal+DoD)      │
│ 3. Git: on the phase branch (create it from latest main at    │
│    the phase's first task — see §4.1)                         │
│ 4. Implement ONLY that task (minimal diff)                    │
│ 5. Verify DoD (commands, manual steps)                        │
│ 6. Commit (one commit per STEP, §4.1a) → push                 │
│ 7. Update test-guide in the step's commit (§5)                │
│ 8. More steps in this phase? → back to 4, same branch, same PR│
│    Phase / chunk done? → update the PR body (§4.2)            │
│ 9. Report to user: commits + next step (PR link at end)       │
└──────────────────────────────────────────────────────────────┘
```

### 4.1 Branch per phase

- **One phase = one branch = one PR** (e.g. all of Phase 03 on `feat/phase-03-auth`), from its first task until its DoD passes. Do not mix tasks from other phases.
- Start the branch from latest `main` (`git pull origin main` then `git checkout -b <branch>`); merge `main` into it when `main` moves.
- **Do not split a bundle into several PRs, and do not stack a PR on another PR's branch.** A bundle that spans several issues (for example #145 and #235 in one session) is one branch and one PR, with one commit per step and the issues named in the title and body. Open a second PR only for work that has nothing to do with the first (a different track or person) or that must go out alone (an urgent fix). When in doubt, put it in the PR that is already open.
- Small standalone fixes (typo, config, one-file chore) can be a small branch + PR when they can't wait for the phase.
- **Naming:** short, descriptive, **kebab-case**.

  Good: `feat/phase-03-auth`, `feat/phase-05-care-feed`, `docs/hackathon-phases`  
  **Forbidden:** `claude/…`, `cursor/…`, `ai/…`, `copilot/…`, or any tool/model name as prefix.

- **Never rename a branch that has an open PR** — GitHub closes the PR.
- Do not commit directly to `main` for feature work. Merge via PR after review (or when the user asks to merge).

### 4.1a Commits — one per step

- A **step** is one coherent, verifiable slice of a task that could be reviewed alone, in the order the work depends on itself — typically *database* → *backend* → *app* → *tests / e2e* → *docs*, or one numbered task of the phase doc (e.g. `6B.1`). A step never mixes tasks of different IDs.
- **One commit per step**, made when that step's checks pass (typecheck, the tests that touch it, `ruff` / smoke for backend / SQL), then pushed. No "wip" commits, no squashing steps together afterwards, no step left uncommitted at the end of a session.
- Each commit updates `docs/plan/test-guide.md` for what *that step* changed (§5); the closing commit of the phase does the final tidy.
- A step that needs a person (a photo, a key, a hosted-DB apply) is committed as far as it can go, and the phase doc's "Before you start" list says what the person does.

### 4.2 Pull request (per phase)

- Open the phase PR **after the first step's commit, as ready for review** (`gh pr create`, no `--draft`) unless there is a reason to keep it a draft (work that cannot be reviewed yet, a human step it is blocked on) — then say why in the PR body. CI runs on every push to it. Keep the PR body's step table up to date after each step; **keep pushing to this same PR** for every later step.
- **PR title:** same style as commit message (see §4.3), e.g. `feat: phase 03 auth, roles, and pet profiles`. Describe *what* and *why* for reviewers (Minsik / Seulgi / Muk).
- **PR body:** Summary bullets / task table, test plan checklist, link to phase doc.
- **Issues on every PR (required):** the PR body says `Closes #N` (or `Refs #N`) for each issue it finishes. New findings become new issues with a milestone and an assignee, not lines in a file. Documents the PR closed are archived (§5.1).
- Before the phase is done, report after each step with: the commit, how it was verified, and the next step. When the phase DoD passes, update the PR title / body for the whole phase and tell the user it is complete.
- **Do not merge** unless the user explicitly asks (squash merge, delete branch). A migration that has to reach the hosted DB is applied only when the user asks, at the merge of its PR.

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

`00 prep → 01 repo → 02 db → 03 auth → 03B booking → 03C payment → 04 upload → 05 feed → 06 checks → 07 report → 07B inquiry → 09 caption → 07C completion → 06B transit → 12 Snap (treat check = the 08 design, mood, stickers; D61) → 10 deploy → 11 P1` — 06B is the last scenario phase, right after 07C; 12 runs 10/14–10/22, before the rest of 10 and the 11.15 onboarding (D61). Dates in `docs/plan/phases/README.md`.  
After **07.1** (Nebius client), the AI backend track (07B inquiry → 6.12 care-plan → 7.2/7.4 report → 9.1 caption → 7C.4 life-record → 6B.5 photo-check — Seulgi's before 2026-10-04, now Minsik's) is interleaved with the app queue, and each agent session works on **one** assigned issue. An agent works only on issues assigned to its person (Minsik, Seulgi, Muk, JeonBeomGu-S). Seulgi's Phase Q runs in parallel (migration names: next free name, `supabase/README.md` § Naming).

### Coding discipline

- Minimize scope; no drive-by refactors.
- No secrets in git; extend `.env.example` only.
- **Git:** follow §4.1–4.3 (phase branch → one commit per step → push → one phase PR). Do not commit on `main` for features. If the user says “commit and push” for the current task, do it on the **phase branch** (the PR updates itself).
- Anonymize any real customer data (Seulgi owns policy; never commit `data/raw/`).

---

## 5. Issue ritual (required after every task)

**Where:** [GitHub issues](https://github.com/minsikpaul92/Goldito/issues). Before creating one, read `~/.claude/github-issue-template.md`; issues are written in English.

When a task is **done** (DoD met):

1. The PR body closes the issue (`Closes #N`). The record of finished work is the commit, the PR and `test-guide.md`; closed docs move to `docs/archive/` (frozen, read only when asked, never a source of truth).
2. If the whole phase is done, update its row in `docs/plan/phases/README.md` (status column).
3. If you discovered new work, open an issue with a milestone (P0 hackathon only if it blocks the demo or makes the app say something untrue; otherwise P1 or P2 after hackathon) and an assignee. Do not silently expand scope in the same task.
4. Update [`docs/plan/test-guide.md`](docs/plan/test-guide.md) **in the same commit**: the feature's row in the status table (§2) and its scenarios (§3: new ID, expected result, which Playwright spec or SQL smoke covers it, what stays manual). Add new limits to §4. Never mark a scenario ✅ unless a person actually ran it (date + name).

If an issue and a phase doc disagree, **phase Goal/DoD wins**; fix the issue to match.

### 5.1 Docs hygiene — open work in the queue, finished work in the archive

- **One question, one document.** If two docs answer the same question, merge them and delete one — do not archive a duplicate.
- **Open work lives in GitHub issues.** Finished work is recorded by the commit, the PR and `test-guide.md`; never add finished items to an archive file.
- **`docs/archive/` is for whole documents that are closed** (every item in a `feedback-*` / `review-*` / `status-*` file is done or moved to an issue). Move them with `git mv` — do not delete — and add a first line: `Frozen record — not the plan. The queue is GitHub issues.` `docs/archive/todo-completed-2026-10.md` is the lookup for everything finished before 2026-10-10.
- **Archive = read only when asked** ("did we do X?"). Never use it as a source of truth, never edit it, never follow a plan or decision from it without checking the current docs.
- When you archive or merge a doc, fix the links that pointed to it in the same commit (`grep -rn <filename> .`).
- **Weekly sweep** (Mon · Thu sync): every open issue has a milestone and an assignee, closed feedback / review docs are archived.

---

## 6. Task prompt template (copy for each session)

```text
Read CLAUDE.md and the assigned GitHub issue (gh issue view <N>).
Work ONLY on that issue.
Read the linked docs/plan/phases/phase-XX.md for Goal and DoD.
Work on the phase branch (CLAUDE.md §4.1 — create it from main at the phase's first task; no claude/cursor/ai prefixes).
Work in steps (§4.1a): when a step's checks pass, update test-guide (§5), make ONE commit (§4.3), push. The first push opens the phase PR (ready for review, §4.2); every later step goes into the same PR.
Before opening the PR and again when the phase is done: update the PR body and `Closes #N` (§4.2, §5). Report after each step: the commit, how it was verified, and the next step.
```

---

## 7. P0 feature → phase map

| Feature | Phases |
| :--- | :--- |
| ① Inquiry — AI draft in the sitter's tone + approval + RAG | 07B (quote: 03C) |
| ② Meet & Greet — care request → checklist, Meet & Greet, transport mode | 06, 03B |
| ③ Booking — schedule, request, consents, demo payment, timed unlock | 02, 03B, 03C (P1 polish: 11) |
| ④ Care & Pet Transit — live trip, photo check, 5-second check, daily report, feed & album | 04, 05, 06, 06B, 07, 09 |
| ⑤ Completion — home-safe report, review, Pet Life Record → RAG | 07C |
| Snap tab — treat check (the 08 design + Tavily), pet mood, stickers + diary decorating (D61) | 12 |
| Deploy & submit README | 10 |

The scenario core (03B → 07C) comes first, then Pet Transit (06B) as the last P0 phase (D41); the treat safety guard (08, + Tavily 8.7) is a P0 stretch only if time remains after 06B (D27). P1 (photo request, notices, recurring schedule; Tavily only if 8.7 slipped) and P2 (SFT showcase 11.7, D43) — only after P0 queue is clear unless user reprioritizes. The old P2 Q&A is now the Stage 1 inquiry AI (07B).

---

## 8. AI endpoints (contract)

Implement in FastAPI; all call **Nebius Token Factory** — Nemotron for text, Nemotron 3.5 Super VL for vision, Qwen3 Embedding for RAG. Prices, dates, and availability come from the server, never from the model; entry codes never go into prompts (D29, D31). Every call writes one metrics log line (architecture §9):

| Endpoint | Purpose |
| :--- | :--- |
| `POST /api/ai/inquiry-reply` | Stage 1 — auto-reply grounded in schedule, quote, policy, Life Record (RAG) |
| `POST /api/ai/care-plan` | Stage 2 — care & medication request → checklist draft |
| `POST /api/ai/handoff-check` | Stage 4 — handoff photo check (pet visible, crate / seatbelt) |
| `POST /api/ai/caption` | Stage 4 — feed auto-caption + album category |
| `POST /api/ai/report-chips` | Stage 4 — chip suggestions from the day's check-ins, tasks, and photos; the sitter keeps or turns off each (D38) |
| `POST /api/ai/daily-report` | Stage 4 — report draft from the chips the sitter kept, an optional short note, and photos; posted only after the sitter approves |
| `POST /api/ai/life-record` | Stage 5 — stay → Pet Life Record + RAG indexing |
| `POST /api/ai/pet-review-chips` | Stage 5: chips for the sitter's review of each pet after a stay (stay check-ins + Life Record); the sitter picks, the app saves to `pet_reviews` (#407, D38) |
| `POST /api/ai/safety-check` | Snap → Treat check (12.1) — label photo → JSON safety (+ Tavily sources from FDA pages) |
| `POST /api/ai/pet-mood` | Snap → Mood (12.2) — pet crops from the browser → body-language tags (vision) → server-computed emotion % (sum 100) + one "seems" line; for fun only, nothing saved |
| `POST /api/ai/pet-photo` | P1 (11.15) — pet photo → breed guesses (≤ 3, owner confirms) + coat color |
| `POST /api/ai/pet-voice/transcribe` | 11.15 — the recording (audio body) → speech-to-text (Groq Whisper free plan; Token Factory has none) → text the owner can fix; nothing is stored |
| `POST /api/ai/sitter-voice` | Sitter onboarding — the (fixed) text → picks for the numbered onboarding questions, each with a quote the server checks; recording to text uses `/api/ai/pet-voice/transcribe` (owners and sitters) |
| `POST /api/ai/pet-voice` | 11.15 — the (fixed) text → profile facts from Nemotron, each with a quote from the text; safety answers are never pre-selected |

Model IDs and regions: `docs/plan/phases/notes/model-ids.md` (source of truth; checked with `GET /v1/models`) and phase-07/08 docs.

---

## 9. Definition of "done" for the hackathon

- Public demo URL + test owner/sitter accounts documented
- Root README Getting Started runs the project
- Video path matches the 5 stages in the README (*How Goldito works*)
- Feedback on Token Factory / Nemotron filled in README log
- Design feels like a **product**, not a single API demo page

---

*Last aligned with repo docs: phases 00–12 (incl. 03C · 06B · 07B · 07C · 12 Snap), **D47 / D47b · D61 · D63** both roles Home · Bookings · Chat · Feed · Snap. If you change process, update this file together with the docs it names.*
