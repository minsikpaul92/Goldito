# Phase Q: Quality · data · tone · QA (Seulgi's track, 2026-10-09 to 10-30)

> **Owner:** Seulgi · **Also involved:** Minsik (urgent development), Muk (design)
> **Why it is split out:** the 2026-10-09 work split (removed; in git history): until the deadline (10/30), Minsik takes the urgent development that blocks the demo path (backend deploy → inquiry AI safety RV-1 to 5 → 06B Pet Transit → booking flow → demo deploy), and Seulgi takes **what is not urgent · what needs anonymized real data · the QA/UX that needs hands-on sitter experience**.
> **Shared context:** [CLAUDE.md](../../../CLAUDE.md) (work order · branch · commit rules) · [architecture.md](architecture.md) (D31 access info · D35 tone · D38 minimal sitter input · §9 AI rules)

---

## 0. Getting started, Seulgi (first day)

### 0.1 Reading order (about 1 hour)

| Order | Doc | What to look at |
| :--- | :--- | :--- |
| 1 | Root [README.md](../../../README.md): *How Goldito Works* · *A Stay with Goldito* | One-page product summary, the 5-stage demo path |
| 2 | [full-process.md](../full-process.md) | The 5-stage flow · decisions D27 to D47 · §9 open questions (Seulgi's: #1 delay formula, #5 tone data, #8 zero-retention, #9 mood meter data) |
| 3 | The 2026-10-09 work split (removed; in git history) | Who does what, §4 rules to avoid conflicts |
| 4 | **This doc** | My task list Q.0 to Q.10 |
| 5 | [test-guide.md](../test-guide.md) §2 · §3 · §4 | Feature status table, scenarios (ID · expected result), known limits |
| 6 | [test-run.md](../test-run.md) | Starting point for hand tests · demo reset states (`empty` · `pets` · `confirmed` · `ready` · `in_care`) |
| 7 | The GitHub issue form **QA feedback** (`.github/ISSUE_TEMPLATE/qa-feedback.yml`) · earlier examples in the 2026-10-08 feedback (removed; in git history) | Where to post feedback and in what format |
| 8 | The 2026-10-08 code review §5 · §6 (removed; in git history) | Details of the M · L items I take (symptom → cause → fix → test) |
| When needed | [P0-ai-prompt-playbook.md](../P0-ai-prompt-playbook.md) · [README.md](../README.md) §8 (anonymization) · [DESIGN.md](../../../DESIGN.md) | Prompts · anonymization rules · UI tokens |

### 0.2 Environment (Q.0)

**Hand tests happen on Vercel, with no install**: on **https://goldito-petcare.vercel.app**, which deploys automatically every time `main` is merged (decided 2026-10-09, [test-run.md](../test-run.md) §0). Results (✅) are also recorded only against Vercel (main).

1. https://goldito-petcare.vercel.app → **Try demo** on the login screen → **Demo owner** (Robert) / **Demo sitter** (Chloe).
2. Both accounts at once: the same address in a normal Chrome window + an incognito window.
3. Upload · AI · demo reset all work from Vercel with the backend deployed on Render (U0, 2026-10-09). It is a free plan, so **if nobody uses it for 15 minutes it falls asleep, and the first request takes 30-50 seconds**; that is not a bug.
4. Resetting the state: in the app, Profile → **Demo tools** (turned on only during the test period) → pick one of `empty` · `pets` · `confirmed` · `ready` · `in_care`. (Until `011i` is applied to the hosted DB, check-ins are blocked for 3 minutes right after `in_care`: CW-1.)
5. **A local environment only when you change code (from Q.2 on):** get the repo → a small branch from `main` (§3 below). **Get `backend/.env` and `frontend/.env` from Minsik separately (messenger · password manager)**: never commit them or post them in chat; the format is in each `.env.example`. Backend `cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt ruff` (on Windows `.venv\Scripts\python`) → `uvicorn app.main:app --port 8000`, frontend `cd frontend && npm ci && npx expo start --web --port 8081` → `http://localhost:8081`. Local is for checking while you fix; after the PR is merged, check again on Vercel and record that.
6. If you use a coding agent (Claude Code · Cursor), always start with: *"Read CLAUDE.md, the assigned GitHub issue, docs/plan/phases/phase-q-quality.md. Work only on that task."*

---

## Goal

When judges follow the demo path (inquiry → meeting → booking → care · transit → completion) with the mouse, make it feel **like an app real pet sitters use**: the flow is smooth, the wording is real working language, AI replies · daily reports are in **a real sitter's tone**, and no wrong numbers · personal data leak out. And leave **a record that a person checked it** (test-guide ✅).

### Goal met when (by 10/29)

- [ ] A person runs each demo path scenario in test-guide §3 (FLOW · REPORT · CAP · INQ · DONE) once and writes **✅ (date, Seulgi)** or an FB number in the status column
- [ ] Hand-check the phase DoD of 07 · 07B · 09 · 07C (now "code complete, DoD pending")
- [ ] Inquiry replies and daily reports come out in **a tone taken from anonymized real records** (record 3 before/after examples each with the same question)
- [ ] AI replies · daily reports are **RAG evidence first**: if the database has evidence, follow the evidence; if not, do not make things up and send it to the sitter to confirm (record Q.4b before/after examples)
- [ ] Review and fix the wording of review presets · daily report chips · check-in options into real sitter language
- [ ] Finish the Q.5 · Q.6 scope below from R3 Medium (or record "not doing + why")
- [ ] The original data is nowhere in the repo · prompts · video (anonymized samples only)

---

## 1. Task list (in order: one per GitHub issue, #99 to #110)

| # | Task | Output | Done when | Estimate |
| :--- | :--- | :--- | :--- | :--- |
| **Q.0** | Environment · accounts (§0.2) | Two accounts open at once on Vercel | Owner · sitter demo login at https://goldito-petcare.vercel.app (normal window + incognito window), one reset to the wanted state with Demo tools. The local environment only needs to be ready before Q.2 | 0.5 day |
| **Q.1** | **Full hand test + sitter-eye feedback**: the demo path from the start: inquiry (INQ) → Meet & Greet → booking · checkout (FLOW) → Received · check-in · photo · daily report (REPORT · CAP) → Returned · review · Life Record (DONE). Especially the new features REPORT-11 · 12, FLOW-15 to 23 | Update the test-guide status column; for each finding, the GitHub issue form **QA feedback** (what I saw · what I expected · how it works in practice · severity) | ✅ or an issue number per scenario. Tell Minsik right away about `blocks-demo` · `false-promise` | 1.5 days |
| **Q.2** | **Wording · preset review (real working language)**: ① review presets `frontend/features/completion/reviewPresets.ts` (owner → sitter · sitter → owner, 3 per star) ② daily report record chip wording `backend/app/ai/report_chips.py` (`MEAL` · `POTTY` · `MOOD`) ③ check-in options `frontend/features/care/checkinOptions.ts` ④ on-screen guide text (empty screens · buttons). Notification titles live inside SQL functions, so give **only a list** as feedback | Code fix PR (`fix/q-wording`) | Stays in English (D1), the related e2e · pytest pass (if you change the wording, change the test expectations too) | 1 day |
| **Q.3** | **Anonymization** (existing owner): 3 years of chats · daily reports → replace names · contacts · addresses · locations · real dog names, keep the tone → train / validation / hold-out JSONL. Rules for the `{PRICE}` · `{DATE}` placeholders. Decide whether to use Nebius **zero-retention** and the third-party processing notice | Anonymization rules doc (`docs/plan/anonymization.md`), JSONL **outside the repo** or in the gitignored `data/` | Minsik looks at 20 random samples and finds 0 personal data. Record the answers to full-process §9 #5 · #8 | 2 days |
| **Q.4** | **Add tone data**: ① inquiry: the demo sitter Chloe's style card + 5-10 example replies picked from the anonymized records into `backend/app/ai/prompts/tone/demo_sitters.json` → `scripts/seed_tone.py` (dry run → `--apply`) ② **daily report:** make the examples in `backend/app/ai/prompts/daily_report/few_shot.json` follow the style of real daily reports (anonymized), and if needed add `tone_samples` `kind='report'` samples ③ **auto-send delay formula · message splitting** (7B.10, `backend/app/ai/inquiry.py` `human_delay`): **after R1b is merged** | PR (`data/tone-samples`) + `docs/plan/phases/notes/tone-before-after.md` (before/after for the same 3 questions · the same 3 days) | The inquiry · daily report before/after examples sound "like Seulgi", pytest passes, no original data in the prompts | 2 days |
| **Q.4b** | **Prompt engineering + RAG-first answers**: make the **conversations** (inquiry replies) and the **sentences** (daily report · caption · Life Record · care checklist) the AI writes come out smooth and sitter-like. Principle: **build the answer from the database (RAG) first, and let the AI write only what is not there.** ① **RAG first (inquiry):** right now `search` in `backend/app/services/rag.py` passes the 5 nearest results to the model as they are, with no similarity threshold → set a **similarity threshold**; if there is evidence above the threshold (sitter policy · past inquiry answers · Life Record · care request), answer **based on that content** (only polish it into the sitter's tone); if there is no evidence, the model writes it, but it does not make up facts (price · date · availability · pet info) and sends it to the sitter to confirm (`needs_sitter`) with "I'll check and let you know". Keep the source chips that show which evidence was used ② **Prompt polish:** `backend/app/ai/prompts/**` (system · few-shot): fix sentence length, emoji, repeated phrases, awkward transitions, adding things the question did not ask. Look at it together with the Q.4 tone data ③ **What does not change:** the facts the server decides (D29 price · date · availability; D31 access info never goes into prompts), sitter approval (D36) | ② prompt PR (`data/prompt-tuning`): **possible any time** → ① RAG-first code PR (`fix/q-rag-first`): **after R1b is merged** (`inquiry.py` · `routers/ai_inquiry.py` are Minsik's work until then) + `notes/prompt-before-after.md` (before/after for the same 5 questions (3 with an answer in RAG, 2 without) and 2 days of daily reports) | Questions with evidence are answered with the same content as the evidence, questions without evidence do not make up facts and go to the sitter to confirm (pytest: both above and below the threshold), before/after examples that show natural sentences, the existing pytest · ruff pass | 2-3 days |
| **Q.5** | **R3 Medium: daily report · caption · Life Record · seed** (the 2026-10-08 code review §5, removed; in git history). First: **M-14** (turning off a record chip hides a missed medication in the owner checklist) · **M-20** (numbers · codes in the note end up in the Life Record, D31) · **M-16** (a sent daily report shows as a draft; recheck after `011f`). Then M-13 · M-15 · M-17 · M-18 · M-19 · M-21 · M-22 · M-23 · M-24 (M-12 is done) | One commit per item, branch `fix/q-review-medium` | Add pytest / Playwright per the "Test" column of the review doc, ✅ in the item title | 3-4 days |
| **Q.6** | **R3 Medium: inquiry AI M-1 to M-11** (**after R1b `fix/review-inquiry` is merged**: same files). Especially M-4 (another owner's text · contact info mixed into the tone examples: the same work as anonymization) | Same way | Same way | 3 days |
| **Q.7** | **Evaluation (needs keys)**: re-measure the default path with `scripts/measure_inquiry.py` (M-1), compare with and without the tone card with `scripts/measure_caption.py` (M-19), Life Record hallucination test 3 times (07C DoD) | Update the `phases/notes/model-ids.md` table | Numbers · date · one-line conclusion | 1 day |
| **Q.8** | **Final QA (10/27 to 29)**: the whole demo path at the deploy URL, two accounts, **mouse only** (desktop phone frame) + phone width + **a real phone camera** (Take photo / Choose from library, at the Vercel address) | test-guide ✅, remaining FB | The demo video path finishes with nothing blocking | 1 day |
| Q.9 | (if time) **R4 Low** L-1 to L-6 bundle, FB-1 · FB-3 · FB-4 | One commit per bundle | review §6 | If time |
| Q.10 | (P2, if time) **11.7 SFT showcase**: not used in the app runtime (D43) | [phase-11-p1.md](phase-11-p1.md) 11.7 | | If time |

> If you want to change the order, talk to Minsik first (in particular, Q.6 does not start before R1b is merged).

> **Q.1 areas (2026-10-19):** the hand test is split into four areas, posted as issues. **1 Booking · 2 Care & Pet Transit · 3 Completion · 4 Sign-up** (the matching sections of the test-guide). JeonBeomGu-S takes the fixes for incoming QA issues first ([phase-03d § QA issues to clean up together](phase-03d-booking-chat.md)).

---

## 2. Scope

| In | Out (Minsik) |
| :--- | :--- |
| Hand tests · feedback · wording · presets | Inquiry AI safety RV-1 to RV-5 (R1b) |
| Anonymization · tone · few-shot · delay formula | Booking flow R2 (FB-2 · 5 · 6 · 8 · 9) |
| R3 Medium (M-1 to M-24, M-12 done), R4 Low | 06B Pet Transit · 08 · 10 deploy · fixed demo accounts |
| Evaluation · measurement | Applying hosted DB migrations · OAuth |

---

## 3. Rules (summary; the full version was §4 of the 2026-10-09 work split, removed; in git history)

1. **Branch · commit · PR:** CLAUDE.md §4. Branches `qa/…` · `fix/q-…` · `data/…` · `docs/…` (no tool prefixes such as `claude/` · `cursor/`), one task = one commit, a one-line English conventional commit, **no AI mention**. A draft PR per bundle → ready when done, merge after checking with Minsik.
2. **Do not touch files Minsik is changing** (the table in work split §4). Prompt files (`backend/app/ai/prompts/**`) are fine any time.
3. **Migrations:** no letter range per person (2026-10-13, CR-6): use the next free name after the latest name on `main` and in open PRs ([supabase/README.md](../../../supabase/README.md) § Naming). Never edit a file that is already applied. New RPCs: `security definer` + `set search_path = public` + an `auth.uid()` check + `revoke … from public, anon`, and add a check to `supabase/tests/rls_smoke.sql`.
4. **Tests:** backend `pytest -q` + `ruff check .`, frontend `npx tsc --noEmit` + the related Playwright spec. CI must be green before the PR is ready.
5. **At the end of every task (CLAUDE.md §5):** `Closes #N` in the PR body (the record of finished work is the commit · PR · test-guide), move on to the next Q issue, and update the test-guide. **✅ only for what a person actually tried.**
6. **Data:** the originals never go into the repo · prompts · video · screenshots. Commit only anonymized samples. If a real person's or place's name shows up, stop right away and tell Minsik.
7. **If you find an urgent problem:** something that blocks the demo path or makes a wrong promise → write it in FB as "urgent" and tell Minsik right away (it goes into Minsik's queue).
