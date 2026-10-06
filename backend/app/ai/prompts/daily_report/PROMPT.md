# Daily report prompt (Phase 07 · 7.2 / 7.4)

How the sitter's end-of-day note is written, and how to change it safely.

## What the model receives

`POST /api/ai/daily-report` builds one JSON object, the `source_snapshot` (also saved in
`daily_reports.source_snapshot`), and sends **only** that:

| Block | Source | Notes |
| :--- | :--- | :--- |
| `pet` | `pets` + `pet_allergies` + `pet_cautions` | **The owner's own information**: name, species, breed, age, `owner_notes`, `allergies`, `heads_up` |
| `tasks` | `task_logs` + `care_tasks` | Done or missed only, inside the sitter's hours. Each carries what the owner asked for (`owner_dose`, `owner_notes`) |
| `checkins` | `care_checkins` | This sitter's, today, inside their hours |
| `photos` | shared `feed_posts` captions + ≤ 2 photo descriptions typed or suggested on the Report screen | |
| `checks` | derived | `meal`, `potty`, `mood` (last value), `walk_minutes` (sum), `meds` (`done` / `missed`) |
| `chips`, `sitter_note` | the Report screen | Only the chips the sitter kept; a note of ≤ 200 characters |

A check the sitter turned off (`skip`) is removed from `tasks`, `checkins` and `checks` before the
prompt is built, so the model never sees it.

The owner's information is the **foundation**: a done task is reported in the owner's words ("hidden in a
lickable treat, as you asked"). It is **background, not news** — allergies, Heads-ups and traits are never
turned into things that happened today.

If nothing at all was recorded (no tasks, check-ins, photos, chips or note) the model is **not called**: the
report is a fixed line (`model = "template"`).

## Messages

`system.md` → the worked examples in `few_shot.json` (user = a snapshot, assistant = the report) → the
real snapshot. Role `report` (Nemotron Super), reasoning off, temperature 0.4, `max_tokens` 400.
The sitter's own style card and past reports (`tone.compose()`, 7B.8, D35) will replace the default examples
when they exist.

## The rule that matters

> Say only what the JSON says. If something is not there, it did not happen.

Tuning history (live Nemotron Super, 3 runs per case):

1. First prompt → on sparse days the model invented water, litter box, naps, a "sunspot", and used "he/she".
2. Added the one rule, the "do not invent" list, no gendered pronouns (the sex is unknown), no unsupported
   times of day, no "on time" → better, but still copied the sitter's "she" and padded.
3. Added the worked examples (including a sparse day that stays short) → no invented facts.
4. Added the owner's information as a foundation, "background, not news", "how much was eaten only from the
   check", "one event is one event" (a squirrel in a chip and a photo had become two squirrels).

## After the model answers

`broken_rules()` checks two rules a model still breaks now and then: a gendered pronoun for the pet (unless the
sitter's own words in the snapshot use it) and a punctuality claim ("on time", "right away"). If either is found
the model gets **one** rewrite request naming the problem (temperature 0.2); whatever comes back is used.

## Examples (`few_shot.json`)

Three pairs, English, in the exact snapshot shape: a full day with the owner's info, a short day where the
owner's notes/allergies/Heads-up are NOT mentioned, and a day with a missed walk. Keep an example **short** when
the input is short — the model copies the length.

## Checks before changing anything

Run `backend/scripts/check_daily_report.py` (live model, needs the Nebius key) and read the output:

- (a) a missed walk → the report says it was missed, never done
- (b) empty `checks` → no meal or potty mentioned
- (c) no photos → no photo description
- (d) an allergy / Heads-up / trait in the owner's info → not stated as an event
- (e) no `he` / `she` / `his` / `her`

`pytest backend/tests/test_ai_daily_report.py` covers the snapshot and the endpoint without the model.
