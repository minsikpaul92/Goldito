# Phase 03D: Chat-centered booking (Stage 1 to 5 in one chat)

> **Status (2026-10-20):** In progress · 3D.1 to 3D.7 merged, next is 3D.8 ([#145](https://github.com/minsikpaul92/Goldito/issues/145)) · P0 (decided 2026-10-17, Minsik). Epic: [#130](https://github.com/minsikpaul92/Goldito/issues/130). **Owners (2026-10-19):** Minsik = 3D.1 ([#138](https://github.com/minsikpaul92/Goldito/issues/138)) · simpler request screen ([#168](https://github.com/minsikpaul92/Goldito/issues/168)) · 3D.4 to 3D.9. JeonBeomGu-S = photo row and viewer ([#136](https://github.com/minsikpaul92/Goldito/issues/136)) · 3D.3 ([#140](https://github.com/minsikpaul92/Goldito/issues/140)). The sitter search from 03B (PR #128) must be merged first.

> Shared basis: [architecture.md](architecture.md): D27-D47, **D29 quote · D31 security unlock · D35/D36 sitter tone · approval · D38 minimal typing**

## Goal

The owner searches for a sitter the way they would find a hotel (date · time · pets · radius), and after **Start chat** on the sitter detail, the quote · Meet & Greet · booking agreement · payment · handoff · care · completion · reviews all happen in **one and the same chat**. Above the chat sits the booking progress; the same owner and sitter keep using the same chat, and the history stays. Going back shows the chat list. The old "Ask before booking" and "Book care" go away.

## Scenario (owner / sitter)

1. Search → sitter detail → **Start chat**. The first card shows the date · time · pets automatically.
2. Owner: can you take care of them? → Sitter: yes, and the quote (the sitter's rates × time · number of pets · handoff mode) comes automatically.
3. Owner: asks about their needs → Sitter: explains the extra fees → owner accepts → Sitter: final quote → Owner: confirms.
4. Owner: requests a Meet & Greet (online/offline · time · place) → sitter agrees. Returning pairs skip it.
5. Owner "I'd like to book" + sitter "I accept" → **both agree** → **owner pays (demo) → booking confirmed**.
6. Handoff: if the owner's and the sitter's saved default modes match, no negotiation; if they differ, request → request again → final accept. The three modes stay (owner drives · sitter picks up · somewhere else).
7. Care day: start trip → departure notification · 5 minutes before · arrival notification → greeting. During care, meal · walk · poop · nap marked done on Home → owner notification. Photo request → photo + one line. Evening diary card → tap to open the diary.
8. End: the owner picks up (trip) → sitter Done → each reviews the other. **The owner's review of the sitter is public; the sitter's review of the owner is seen only by the sitter who wrote it.**

## Chat screen structure (decided 2026-10-19: cards + footer)

**The chat holds no state.** The truth about a booking is in `bookings` and `booking_stage()` · `booking_next_actor()` (D60); the chat only draws it and lets people press the buttons.

- **Cards = the record.** Quote · Meet & Greet · agreement · payment · handoff · trip cards stack up in the conversation. A card is not a copied value; it **reads the current state from the DB to draw itself** (when one side accepts, the card on the other side's screen changes too). Finished cards fold into a one-line summary, and only cards still in progress have buttons.
- **Footer = the one thing that is my turn now.** One big button right above the composer (`Request booking` · `Accept` · `Pick a Meet & Greet time` · `Pay`). Pressing it opens that card as a sheet. If it is not my turn, only "Waiting for Chloe" shows. This one line comes from `booking_next_actor` alone, with no AI.
- **+ menu**: actions used now and then (change dates · ask for a photo · cancel).
- With no booking, the footer is just `Request booking`. The sitter detail's "Ask before booking" and "Book" merge into **one `Start chat`**. For now, `Request booking` on the chat's Stay card links to the current booking screen, and #144 turns it into an in-chat flow.

## Chat AI (D4b, #142 · D62)

- **Two kinds of chips.** Word chips: 2-3 replies to the other person's last message that fit my side's conditions (sitter: rates · calendar · policy, owner: pets · dates · profile) → tap → a short draft in my tone goes into the composer → edit and Send. Action chips (marked with an icon): tap to open a card. Typing directly always works too.
- **Actions only from a list the code sets.** The code builds the set of actions possible right now from the booking stage and `booking_next_actor`, and the AI looks at the intent of the last message and picks one of them or none (if confidence is low, it shows nothing). The same call returns JSON `{ intent, action, word chips }` and the server validates it. Price · dates · availability are filled in by the code, and **a person always taps** a chip or card (no auto-send, no reason shown).
- **What the AI reads (#249 · #238, PR #276).** The server builds the facts and the state; the model only picks and writes: `i_am` (who I am: "I am Robert, a pet owner with Max (Maltese) and Luna (cat)") · per-pet `profile` (onboarding personality step · safety answers · allergy status: has allergies / "none, the owner says" / "not answered yet"; with no answer it never says "none") and the owner's care `checklist` (for the sitter **only when there is a booking**) · the sitter's sign-up answers · **every card** (quote · Meet & Greet · agreement · payment, one line each, `who` is `app`) · `progress` (the DB's `booking_stage` and `booking_next_actor`, plus the step computed from the buttons possible now: hello → decide → meet_greet → agree → pay → handoff → care → done, `turn` · `now` · `waiting_for` · `done` · `later`) · `topics` (not yet discussed, `open`, and finished, `covered`, only the ones that fit the step). A rule check rejects a draft that says "none" for a pet with allergies (or "none" for a pet whose owner has not answered). The model is Super for both the chat chips and the drafts. Code: `app/ai/chat_profile.py` · `chat_state.py` · `chat.py`, tests CHAT-41 to CHAT-44.
- **Examples.** (Owner) "How much would it be to book?" → to the sitter, `Send quote` (a quote card computed by the server is prefilled, and the sitter edits the extra fees and sends it) · (Owner) "Shall we meet first?" → to the sitter, `Suggest a Meet & Greet` · (Owner) "Can we move it to Friday?" → the code checks availability first, then `Accept date change` or `Suggest another date` · (Sitter) "The quote is $240" → to the owner, `Accept quote · request booking` · (Sitter) "Please bring the food" → to the owner, `Add to checklist` (this needs a per-booking packing list. Today there is only the shared list on the sitter profile, so it is built together with 3D.8).
- **Context from Postgres, no Redis:** the last ~20 messages + a summary saved on the thread (updated when it gets long) + structured facts from the DB (booking stage · dates · pets · quote · sitter policy · rates · owner profile) + RAG (pgvector, Life Record). The backend holds no state. The call happens **once, on the receiving side, when a new message from the other person arrives**, and the result is cached by message id.
- Price · dates · availability are put in by the code from the DB; the model does not write them. Entry codes never go into prompts. The other person's message is data, not instructions. Whether a chip was tapped or dismissed is logged, and the "suggestion acceptance rate" is used as a metric.
- **Order.** #140 detail (See schedule · Start chat, taken over by Minsik) → #142 first half (word chips · AI draft reply, old inquiry screens removed) → #143 quote card (first as a button a person taps) → #142 second half (action chips, built 2026-10-20: the server builds the list of possible actions from `get_booking_stages` and the card states, the model points at only one of them, and the app shows it only when that same action is possible now) → #144.

## 3D.7 Meet & Greet · agreement · final quote · payment ([#144](https://github.com/minsikpaul92/Goldito/issues/144), confirmed by Minsik 2026-10-20)

**Scenario (this step is 1 to 7; 8 is #145 · #146)**

1. The owner finds a sitter by date · pets and starts a chat. The first card (Stay) has the date, time, pets.
2. They say hello, and the sitter answers whether they can take the stay. The owner's **Request booking is a feeler, not a commitment** (it creates the `bookings` row the Meet & Greet will hang on).
3. If they can take it, the sitter gives a **quote** (the amount has to work before anyone commits). The sitter's first yes (`express_interest`) holds the dates.
4. Meet & Greet **only for a pair meeting for the first time**. It is not required; if both choose to skip, that counts as both agreeing and the booking goes on. If they do it: online/offline, time, place.
5. After meeting, **owner "I'd like to book"** (looking at the checklist, pets, time and a price summary, Confirm is the owner's decision) and **sitter "I accept"**. Any order, both are needed.
6. When both agree, the **sitter sends the final quote** (quote card, fees included) and the owner confirms.
7. The owner **pays (demo)** = booking complete. The money is held until the care ends (wording only; payout is #146).
8. Handoff, care, Returned, reviews and the sitter payout are #145 · #146.

A returning pair skips only the Meet & Greet and the "decide after meeting" step (5). From the owner's confirm on, it is the same. The chat screen shows the Pay button **only once the final quote is confirmed**; the DB does not block payment when there is no quote card (same as the old booking screens and the demo seed). If there is a card, the accepted fees are added to the price.

**What exists now (summarized from reading the code, 2026-10-20)**

| What | Already there | In this step |
| :--- | :--- | :--- |
| Stages | `booking_stage` / `booking_next_actor` (011l): requested → meet_greet → confirm → awaiting_payment → paid → in_care → completed. A returning pair (`not_needed`) needs one sitter Accept at `requested` | Returning pairs go to `confirm` too. At `confirm`, the next turn is "the side that has not agreed yet" |
| Sitter's first yes | `express_interest` | No change |
| Meet & Greet | `propose_meet_greet` (proposal and counter-proposal are the same RPC), `respond_meet_greet`, `complete_meet_greet`, `request_skip_meet_greet`, `respond_skip_meet_greet`, `get_meet_greet_options`. Meet link from FastAPI `/api/meet-greet/video-link` (app `lib/meetGreet.ts`) | No RPC change. The chat card reuses `MeetGreetCard` |
| Agreement | Owner: the request itself. Sitter: `respond_booking(true)` goes straight to `confirmed` | `bookings.owner_agreed_at` / `sitter_accepted_at`, new RPC `agree_to_book`, `confirmed` when both are set |
| Payment | `pay_booking_demo`: after checking the signatures, recomputes `quote_booking` → `paid_at`, `price_snapshot`. 009d recomputes on a schedule change | Add the accepted fees of the confirmed final quote in SQL, into `price_snapshot.extras`, `total` |
| Chat | 014j threads, 014k request card, 014n quote card (state jsonb), Realtime INSERT/UPDATE subscription | `meet_greet` · `agreement` · `payment` cards (store only `{type, booking_id}`, drawn from the DB state) |
| App | `BookingStageBar` (5 steps for a first meeting, 4 for returning pairs), the chat footer has only `Request booking` / `Send quote` | The footer is the one thing that is my turn now, 5 circles pinned at the top |

**Decided**

- The meaning of `status` stays the same. `confirmed` = both agreed (waiting for payment); "booking complete" on screen is the `paid` stage, when `paid_at` is set.
- Final quote = a quote card sent after the booking became `confirmed`. Fees are read only from the newest confirmed quote whose service · drop-off · pick-up · pets match the booking (SQL, no model text, rounding as in 03C).
- Cards are posted by a bookings trigger (so they stay in the chat even if a step happens on the 3B screens). Migration `014o_chat_booking_cards.sql`.
- There are always 5 progress circles (`Request · Meet · Confirm · Pay · Stay`); for a returning pair, Meet shows as already checked.

## Steps (GitHub issues are the source of truth for status and checklists)

| ID | Step | Issue | Depends on |
| :--- | :--- | :--- | :--- |
| 3D.0 | Docs: update full-process · architecture · test-guide | [#130](https://github.com/minsikpaul92/Goldito/issues/130) | PR #128 |
| 3D.1 | Sitter search follow-up (live update · default 5 km · favorites · go to detail) | [#138](https://github.com/minsikpaul92/Goldito/issues/138) | PR #128 |
| 3D.2 | Sitter onboarding · structured profile | [#139](https://github.com/minsikpaul92/Goldito/issues/139) | None |
| 3D.3 | Sitter detail + Start chat | [#140](https://github.com/minsikpaul92/Goldito/issues/140) | 3D.1 · 3D.2 · photos · calendar |
| 3D.4 | Chat hub (threads · list · progress) | [#141](https://github.com/minsikpaul92/Goldito/issues/141) | 3D.3 |
| 3D.5 | AI chips · drafts | [#142](https://github.com/minsikpaul92/Goldito/issues/142) | 3D.4 |
| 3D.6 | Quote and extra fees in chat (built: the sitter taps once for a quote card, fee lines, the owner accepts · confirms) | [#143](https://github.com/minsikpaul92/Goldito/issues/143) | 3D.4 |
| 3D.7 | Meet & Greet · agreement · final quote · payment (merged, PR [#218](https://github.com/minsikpaul92/Goldito/pull/218)) | [#144](https://github.com/minsikpaul92/Goldito/issues/144) | 3D.6 |
| 3D.8 | Handoff negotiation · trip · care link-up | [#145](https://github.com/minsikpaul92/Goldito/issues/145) | 3D.7 |
| 3D.9 | Completion · reviews | [#146](https://github.com/minsikpaul92/Goldito/issues/146) | 3D.8 |

Done alongside (same QA feedback): current location [#131](https://github.com/minsikpaul92/Goldito/issues/131) · Privacy accordion [#132](https://github.com/minsikpaul92/Goldito/issues/132) · empty card for a cancelled booking [#133](https://github.com/minsikpaul92/Goldito/issues/133) · calendar hatching [#134](https://github.com/minsikpaul92/Goldito/issues/134) · profile photos [#135](https://github.com/minsikpaul92/Goldito/issues/135) · [#136](https://github.com/minsikpaul92/Goldito/issues/136) · [#137](https://github.com/minsikpaul92/Goldito/issues/137) · header cleanup (Muk) [#147](https://github.com/minsikpaul92/Goldito/issues/147).

## 3D.2 Sitter onboarding design ([#139](https://github.com/minsikpaul92/Goldito/issues/139), decided by Minsik 2026-10-17)

**Build now (typing first)**

- **A numbered list of questions + a text box per question.** Every one can be skipped. Questions with set options (several owners at once · how many pets at a time · cats · dog sizes · handoff mode, etc.) have chips next to the box, so one chip tap sets `choice` and the box is for extra words.
- The last step is **review → fix → finish**. Answers are saved and `onboarded_at` is set only on finish. Existing sitters edit on the same screen from Profile.
- **A one-paragraph intro** (= `sitter_profiles.bio`) and **Q&A they add themselves** (`custom_1` to `custom_5`, the sitter writes the question).
- **When they are available**: available hours per weekday (= the existing `save_closing_rules` · `save_weekday_hours`) and unavailable dates (= `sitter_availability` blocked) are set by tapping inside the same onboarding and go straight into Schedule. No new table.
- **Photos**: 1 face photo + several photos with pets. The photo gallery uses `profile_photos` · `ProfilePhotoGallery` from [#135](https://github.com/minsikpaul92/Goldito/issues/135), so #135's sitter-side data and components come first (slotted in at the onboarding screen step).
- DB: `014f_sitter_profile_answers.sql`: `sitter_profile_answers` (one row per question key per sitter, `answer` ≤ 300 chars, `choice`, `source` typed|voice, `quote`) + `save_sitter_answers(answers, intro, finish)`. Owners read every sitter's answers; writing goes only through the sitter's own RPC. `multiple_owners` is copied to `accepts_multiple_owners`, `max_pets` to `default_max_pets` (the values the booking rules read). Handoff mode stays only in the answers, and #145 reads it as the default.

**Voice input: docs only, built later (the Groq key goes in later in [#158](https://github.com/minsikpaul92/Goldito/issues/158))**

1. Pressing the mic button **folds the text boxes and leaves only the numbered list, shown large.** The sitter looks at the list and answers one at a time, **saying the number first, like "First… Second… Third…"**; for parsing accuracy, the screen keeps showing a "Say the number first" hint.
2. While they talk, **it transcribes in chunks of about 7 seconds and keeps adding them on screen.** The sitter checks on the spot that their voice is heard right. (`POST /api/ai/transcribe`: Groq `whisper-large-v3-turbo`, the recording is not stored. 11.15 pet voice also uses this endpoint.)
   - **Recording limit 180 seconds.** With about 10 questions, one can talk for 100 to 150 seconds in one go. A remaining-time timer, pause · resume recording.
   - **Final text = the transcribed chunks joined together.** The whole recording is not transcribed again (it would double the audio usage, and the sitter reads and fixes the transcript anyway). If a word is cut at a chunk boundary, the sitter fixes it right there.
   - The screen guides "say the number, answer, pause 1 second, next number". If the silence between numbers is used as the chunk boundary, fewer words get cut.
   - If one chunk fails, only that chunk is sent again.
3. At the end, **the whole transcript is shown with "Record again" or "Send".** On Send, `POST /api/ai/sitter-profile-parse` (MODEL_FAST, JSON) fills the fields by number and question key. Every value must have a supporting sentence from the transcript (`quote`), or it is dropped. The transcript is data, not instructions.
4. On the review screen, filled fields show "✨ from your voice" and the supporting sentence; questions it did not catch stay empty. The sitter fixes them and finishes.
5. **Available and unavailable days also come by voice.** "Weekdays yes, weekends no, not October 25" → the parser builds available hours per weekday and a list of unavailable dates, and fills the same weekday · date widgets on the review screen. Only after the sitter confirms are they saved to Schedule as `save_closing_rules` / blocked rows (the AI only suggests).
6. To check (when building): chunk upload on iPhone Safari (mp4) · Chrome (webm), and how the Groq free plan terms treat the data.
   - **Limit math (free plan numbers from the docs, not checked directly with Groq):** 20 requests per minute · 7,200 audio seconds per hour · 28,800 per day. With 7-second chunks it is 8 to 9 requests per minute whatever the recording length, so within the limit, and with 150-second recordings up to about 48 people per hour. 2 to 3 second chunks would be 20 to 30 requests per minute, over the limit, so they are not used. All users share one limit key, so heavy concurrent use counts together. If the limit is hit, chunk transcription is turned off and the app switches to sending once after the recording ends.

**PR A (sitter onboarding, this branch)**: ① `014f` migration + RPC + smoke ✅ → ② numbered question screen (text box + chips, review · finish, gate for new sitters, Profile → Edit your answers) ✅ → ③ available days (the existing Closing rules sheet + picking days off, written to Schedule all at once on Finish) ✅ → ④ (on hold) voice. **The seed (answers for demo sitters Chloe · Paul) goes in together with the sitter detail where owners read those answers (#140)**: a screen that reads them is needed to see with your own eyes that the seed went in, and it runs after `014f` is applied to the hosted DB (decided 2026-10-17).

**PR B (profile photos, separate branch)**: #135 · #136 · #137, for both sitters and owners, `profile_photos` + a round-crop gallery. After it merges, a photo step (1 face photo + photos with pets) is slotted into onboarding in a small commit. There was no reason for photos to come before onboarding, so the order was swapped (2026-10-17).

## Approach

- Trip · diary · report · review screens are **not rebuilt.** The first pass links from the chat cards to the existing screens.
- New migrations use the next free name from `supabase/README.md` § Naming. Applying to the hosted DB happens only when the user asks.
- Branches · PRs proposed per bundle: ① quick fixes + calendar (#131 to #134) ② photos (#135 to #137) ③ search follow-up + sitter profile (#138 to #140) ④ chat (#141 to #146). One PR each.

## QA issues to clean up alongside (2026-10-19, owner JeonBeomGu-S)

Some screens get replaced by chat cards, so keep the order. Independent ones first; for screens the chat will change, check with Minsik before the matching 3D step.

| Issue | What | Relation to the chat |
| :--- | :--- | :--- |
| [#173](https://github.com/minsikpaul92/Goldito/issues/173) | Remove dashes from UI copy, Cancelled chip | Independent. First |
| [#172](https://github.com/minsikpaul92/Goldito/issues/172) | Same-day boarding quote shows "0 nights" (untrue copy) | Independent. Before the quote card [#143](https://github.com/minsikpaul92/Goldito/issues/143) |
| [#189](https://github.com/minsikpaul92/Goldito/issues/189) | `rates_not_set` when the price is empty (R60-6) | Independent |
| [#169](https://github.com/minsikpaul92/Goldito/issues/169) | Time proposal in one go (drop-off and pick-up) | 3D.6 [#143](https://github.com/minsikpaul92/Goldito/issues/143) may replace it. Check before starting |
| [#170](https://github.com/minsikpaul92/Goldito/issues/170) | Make it clear the Meet & Greet is optional, Google Calendar | 3D.7 [#144](https://github.com/minsikpaul92/Goldito/issues/144) may replace it. Check before starting |
| [#171](https://github.com/minsikpaul92/Goldito/issues/171) | Inquiry chat fixes | On hold until the inquiry flow is decided (3D.5 [#142](https://github.com/minsikpaul92/Goldito/issues/142)) |
| [#179](https://github.com/minsikpaul92/Goldito/issues/179) to [#182](https://github.com/minsikpaul92/Goldito/issues/182) | Calendar pick in one go, hide optional inputs, smaller cards, line icons | Possible after Muk's Expressive look ([#177](https://github.com/minsikpaul92/Goldito/issues/177)) merges |

