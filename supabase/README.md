# Goldito — Supabase (Postgres + Auth + Realtime)

SQL migrations for the Goldito demo. Apply in order via the Supabase SQL Editor (or CLI if you use it locally).

**Blueprint:** [docs/plan/phases/architecture.md](../docs/plan/phases/architecture.md)

## Migration order

Apply `001 → 002 → 003 → …` in one go. Do not stop after `001`: tables are open until `002` enables RLS.

| File | Phase | Contents (summary) |
| :--- | :--- | :--- |
| `001_initial_schema.sql` | 02 | 17 tables: `profiles` + `owner_profiles` / `sitter_profiles`, `sitter_availability`, `bookings` / `booking_pets` (who has which pet when — no overlaps) / `booking_slots` (capacity: pet × day × slot) / `booking_handoffs` (drop-off & pick-up time, place, agreement), `pets` (dog/cat), allergies, tasks, media, feed, reports, safety, notifications |
| `002_rls_policies.sql` | 02 | Policy helpers (`is_owner_of`, `is_sitter_of`, `is_on_duty_for`, `can_view_pet_profile`, …), RLS by owner / sitter role, column grants |
| `003_functions_triggers.sql` | 02 | Signup → profiles, species guard, schedule/booking/handoff RPCs, overlap guard, read RPCs, execute privileges, Realtime |
| `004_booking_options.sql` | 03B | Service type (boarding / house sitting), sitter services, Meet & Greet columns + Accept guard (first-time pairs, meeting spots, Meet link), media purposes |
| `005_meet_greet.sql` | 03B | Meet & Greet RPCs: propose / respond / complete, skip request / answer (decline cancels), both sides' meeting spots |
| `006_agreements.sql` | 03C | Rates, Ontario holidays, `quote_booking`, consents, demo payment, owner entry info + timed unlock |
| `007_feed_notifications.sql` | 05 | Feed posts + notification triggers, `feed_posts.category` |
| `007b_feed_posts_realtime.sql` | 05 | `feed_posts` in the Realtime publication (owner Feed refetch on delete); idempotent. Numbered `007b` because `008` is reserved for care |
| `007c_feed_visibility.sql` | 05 | `feed_posts.posted_by` (author) + `visibility` (shared / private), owner posts, author-only delete, private media hidden from the other party, `feed_post` notices only for shared posts (sitter post → owner, owner post → on-duty sitter) |
| `008_care.sql` | 06 | `ensure_today_task_logs` (6.2), `complete_task_log` with optional photo (6.4), `care_checkins` table + RLS (6.8), `care_requests` + `pet_cautions` + atomic `save_care_request` (6.13), `log_care_checkin` with an optional memo and photo (6.9); later: check-ins, care requests, cautions |
| `008g_care_change_requests.sql` | 06 | While a stay is on the owner SENDS a care request (`send_care_change_request`, one open per pet) and the sitter approves or declines (`respond_care_change_request`: approve creates the tasks and Heads-ups, decline carries a reason); notices `care_request` · `care_request_approved` · `care_request_declined` |
| `008h_care_counter_requests.sql` | 06 | A decline can carry a note; the sitter can send a counter-request instead (`counter_care_change_request`: note + optional extra fee + tasks the owner does themselves) and the owner accepts or declines it (`answer_care_counter`); statuses `countered` · `accepted` · `withdrawn`; notices `care_request_countered` · `care_counter_accepted` · `care_counter_declined` |
| `008i_revoke_trigger_functions.sql` | 06 | Trigger functions (`care_task_reset_today`, `guard_care_checkin_species`, `notify_feed_post`) are no longer callable as RPCs by `anon` / `authenticated` (Supabase advisor) |
| `008j_no_direct_edits_during_stay.sql` | 06 | `pet_has_open_stay`: while a stay is on the owner can't INSERT care tasks or Heads-ups directly (RLS) — they send a care request; edits and deletes unchanged |
| `009_reports.sql` | 07 | `send_daily_report(p_report, p_body)`: the writing sitter sends the report once — the text they send (their edits) is published, status draft → sent, owner notice `report_sent`; the owner only ever sees sent reports |
| `009b_care_requests_follow_the_stay.sql` | review fix | Open care change requests close when their stay ends (cancel / decline / pick-up); `save_care_request` refuses while a stay is on |
| `009c_handoffs_stay_consistent.sql` | review fix | A checked handoff can't be replaced, Received / Returned closes that kind's proposals, passed times can't be agreed or confirmed, house-sitting handoffs stay at the owner's home |
| `009d_paid_bookings_follow_changes.sql` | review fix | A change agreed on a paid booking re-quotes it (owner notice `price_updated`) or, when it needs a new consent (`home_access`), reopens checkout (`paid_at` cleared, notice `checkout_needed`); consents are signed at checkout only; owner profile (address, emergency contact) shared only once the booking was paid (a reopened checkout keeps it) |
| `009e_reopened_checkout_keeps_addresses.sql` | review fix | `get_handoff_details` returns the handoff places for a booking paid at least once (`paid_at` or `price_snapshot`), so a checkout reopened by 009d keeps the addresses for both sides; only the entry codes wait for the new consent |
| `010_inquiries_rag.sql` | 07B | pgvector (in `extensions`), `inquiries` + `inquiry_messages` (owner never sees `author='ai'` or an unsent / not-yet-visible sitter message), `sitter_profiles.policies`, notices `inquiry_received` · `inquiry_replied`, service-role-only `knowledge_chunks` + `match_knowledge` (per-source scope) |
| `010b_send_inquiry_reply.sql` | 07B | `send_inquiry_reply` (the only way a sitter message is written: quote / sources / can_host copied from the draft, nothing else; the direct INSERT policy is dropped) + `mark_inquiry_read` (the sitter opening the thread is the owner's only read mark) |
| `010c_tone_samples.sql` | 07B | `tone_samples` (the sitter's own approved / edited / seeded replies, `regenerated` = thrown-away drafts), `match_tone`, `sitter_profiles.style_card` — all service-role only |
| `010d_auto_reply.sql` | 07B | Auto-send: `sitter_profiles.ai_reply_mode` / `ai_consent_at` via `set_ai_reply_mode` (consent first) + `get_my_ai_reply_mode`, `inquiries.reply_typing_at` / `reply_visible_at` (times only), `notifications.visible_at` (a notice that appears later; the select policy hides it until then) |
| `011_completion.sql` | 07C | Returned says "home safe 🏠"; `reviews` + `submit_review` (owner, once, only after Returned) + `sitter_rating_summary` (public: average, count, 3 recent comments with a first name); notices `review_requested` / `review_received`; `pet_life_records` (service-role writes; owner, a sitter asked about the pet by request or open inquiry, and the current sitter read) |
| `011b_life_record_columns.sql` | 07C | `pet_life_records.stay_from` / `stay_to`; clients read named columns only — the raw `source_snapshot` (check-ins, notes, the owner's questions) stays backend-only |
| `011c_stay_capacity_check.sql` | RV-1 | `stay_capacity_check`: the inquiry AI's "yes, I can host" runs the booking engine's own capacity rule (every slot of the stay has room for all the pets), so it never says yes to a request that then fails with `sitter_unavailable` |
| `011e_inquiry_access.sql` | RV-4 · RV-5 | What a sitter who was asked may see: names and pets of an owner who asked a question (before any booking), and `has_open_inquiry_about` now ends with the stay asked about and after 30 days |
| `011f_daily_reports_many.sql` | FB-22 | More than one daily report per pet, sitter and day: any number of sent reports, still at most one draft (partial unique index) |
| `011g_sitter_owner_notes.sql` | FB-25 · FB-29 | `sitter_owner_notes` + `save_owner_note`: the sitter rates an owner after a stay (1 to 5 and a short note), one per booking. Private at first; shared since `015s` |
| `011h_favorite_sitters.sql` | 11.5 | `owner_favorite_sitters`: an owner's favorite sitters, private to the owner; favorites come first in "Your sitters" and in search |
| `011i_care_window_follows_received.sql` | review fix | `care_window` starts at the earlier of the agreed drop-off and the moment Received was tapped, so check-ins, tasks and photos work when the pets arrive early |
| `011j_change_inquiry_dates.sql` | FB-34 | `change_inquiry_dates`: the owner changes the dates in the same inquiry thread (one owner message says so); the next AI draft answers for the new dates |
| `011k_inquiry_reply_outcome.sql` | FB-34 | `send_inquiry_reply` takes the sitter's outcome (accept, decline, suggest other dates); a decline or a suggestion carries no quote and `can_host = false` |
| `011l_booking_steps.sql` | 03B (BS-1 · BS-2) | Booking steps (D60): the sitter's first yes (`express_interest`) holds the dates, `sitter_profiles.accepts_multiple_owners` (one owner at a time by default), computed `booking_stage`, `sweep_stale_bookings()` (service role; nudge after 2 days, cancel 3 days later). Apply together with the app |
| `011z_inquiry_closing.sql` | RV-5 | A booking closes the owner's other open inquiries about that pet over those dates (to other sitters), and a Life Record hit knows its pet. Sorts after `011l` on purpose; `011m` to `011y` were left to Phase Q |
| `012_transit.sql` | 06B (last in P0, D41) | `home_lat` / `home_lng` on both profiles (own row; not in the public sitter list), `trips` (last position only, readable by the two parties, written by `start_trip` · `update_trip_position` · `end_trip`, in the Realtime publication; `sharing = false` = started without a live position), `complete_handoff` also closes the running trip, 150 m arrival notices `trip_started` · `trip_arrived`, `handoff_checks` (the vision model's read of a handoff photo; the backend writes, the two parties read, the sitter adds a reason). Later steps of 06B change `complete_handoff` in this same file until it is applied |
| `012b_trip_ends_with_booking.sql` | review fix (CR-1) | A booking that leaves `confirmed` cancels its live trips and erases the position |
| `012c_handoff_pair_change.sql` | review fix (CR-2) | After confirm, a drop-off / pick-up change that only fits with the same person's open proposal for the other handoff is checked against it, and `respond_handoff` accepts / declines the pair at once |
| `012d_capacity_check_for_owner.sql` | review fix (CR-3) | `stay_capacity_check(…, p_owner)`: the one-owner-at-a-time rule is checked for the named owner (the sitter's token runs it too) |
| `012e_inquiries_reopen.sql` | review fix (CR-4) | `inquiries.closed_by_booking`; a declined / cancelled request reopens the inquiries it closed (011z) unless another live booking still covers them |
| `012f_reply_from_fresh_draft.sql` | review fix (CR-7) | `send_inquiry_reply` refuses (`draft_stale`) an AI draft older than the owner's latest message — a follow-up or `change_inquiry_dates` — so no old quote goes out |
| `013_safety.sql` | 12.1 (Treat check — the 08 design, D61) | The owner may also acknowledge (`acknowledged_at`) their pet's checks; trigger `notify_safety_danger`: a DANGER checked by someone other than the owner sends the owner one `safety_danger` notice |
| `013b_mood_stickers.sql` | 12.3 (D61) | Pet stickers cut out in the browser: media purpose `sticker`, `pet_stickers` (both people on the pet read, the maker deletes) and `report_decor` (the owner and the report's sitter each keep their own sticker layer on a sent daily report, up to 20) |
| `014_photo_requests.sql` | 11.1 | Photo request: `photo_requests`, `request_photo`, the next shared photo answers it (one notice) |
| `014b_diary_book.sql` | Diary book | `save_report_draft` (the sitter on duty writes today's page by hand; same one draft as the AI route, sent by `send_daily_report`) · media purpose `diary_page` (a shared page image — Cloudinary links are public) |
| `014c_sitter_search.sql` | SS-1 | `search_sitters_nearby(drop-off, pick-up, pets, radius, [lat, lng])`: only sitters who can take the whole stay (room, not held by another owner, both times inside their hours), nearest first, whole km only |
| `014d_schedule_closing_rules.sql` | schedule | A sitter is **open by default** (no rows = every slot open with the profile's default hours and spots) and closes days by **weekly rules**: `sitter_closing_rules` (weekday × slot) + `save_closing_rules`; `sitter_capacity` / `within_sitter_hours` / `get_sitter_schedule` follow (`closed` = rule, `blocked` = by hand). A rule never cancels a confirmed stay (capacity = what is booked) |
| `014e_weekday_hours.sql` | schedule | Hours by weekday: `sitter_weekday_hours` (weekday × slot with its own start / end) + `save_weekday_hours`. `sitter_slot_times` / `default_slot_range` pick the hours: a date's own open row → the weekday's hours → the profile's default hours → built-in. Only hours move; open / closed is still 014d's rules, blocks and capacity |
| `014f_sitter_profile_answers.sql` | onboarding | Sitter onboarding answers (3D.2, #139): `sitter_profile_answers` (one row per question key; `answer`, `choice`, `source` typed / voice, `quote`) + `save_sitter_answers(answers, intro, finish)` (replace-all, sitter only; `multiple_owners` → `accepts_multiple_owners`, `max_pets` → `default_max_pets`, intro → `bio`, finish → `sitter_profiles.onboarded_at`). Every owner reads every sitter's answers; no direct writes |
| `014g_profile_photos.sql` | profile | Profile photos for sitters and owners (#135 – #137): `profile_photos` (up to 8 per person, position 0 = cover) read by the person, by every owner for a sitter's photos, and by a sitter only for an owner they share a booking or inquiry with (`shares_booking_or_inquiry`). No direct writes: `add_profile_photo` (service role, backend after the upload), `remove_profile_photo` (backend after it deleted the file; returns the Cloudinary public id), and the person's own `reorder_profile_photos` |
| `014h_sitter_handoff_both.sql` | onboarding | The handoff answer of sitter onboarding may be `sitter_picks_up,owner_brings` (both). Only `sitter_answer_choice_ok` changes |
| `014i_search_favorites.sql` | #138 | A favorite is listed even beyond the radius when the whole stay fits their calendar; `owner_profiles.search_radius_km` remembers the last radius (5 km when empty) |
| `014j_chat_threads.sql` | 3D.4 (#141) | One chat per owner and sitter pair: `chat_threads` (read and "left" marks, leaving hides it from your own list only) and `chat_messages` (text or a card written by the database), `open_chat_thread`, `list_my_chats` |
| `014k_chat_booking_request.sql` | 3D.4 (#141) | `post_booking_request_card`: the booking request shows up in the chat; a chat between two people now counts as a reason to see profile photos (`shares_booking_or_inquiry`) |
| `014k_quote_rates_not_set.sql` | #189 | `quote_booking` raises `rates_not_set` (detail = the service) when the sitter has a rates row but no price for it, instead of `service_not_offered` |
| `014l_chat_stay_card_replace.sql` | #141 | Asking about a stay again changes the last stay card instead of piling up cards, while nobody has written after it |
| `014m_chat_ai_summary.sql` | #142 | `chat_threads.ai_summary` and `ai_summary_upto`: the chat AI's rolling summary of a long thread, written by the backend only and not readable by the client (column-level select) |
| `014n_chat_quotes.sql` | 3D.6 (#143) | The sitter's quote and extra fees live in the chat as one card (service, dates, pets, a `quote_booking` result, extras offered, accepted or declined) that both people read |
| `014o_chat_booking_cards.sql` | 03D (3D.7, #144) | Both sides agree to book: `bookings.owner_agreed_at` (`agree_to_book`, the owner's "I'd like to book") and `sitter_accepted_at` (`respond_booking` with accept); `confirmed` only when both said yes, in any order. `booking_stage`: a requested booking is `confirm` once the Meet & Greet is over or not needed (a repeat pair right away), `booking_next_actor('confirm')` = whoever has not agreed; a new handoff proposal on a request clears both yes. The accepted fees of the pair's newest confirmed chat quote for the same stay are added to the price in SQL (`booking_extra_fees`, `price_with_fees`, `quote_booking_for`), used by `pay_booking_demo` and the 009d re-quote. A `bookings` trigger (`post_booking_chat_cards`) posts the step cards `meet_greet` · `agreement` · `payment` into the pair's chat once each (they hold only the booking id) and touches them (`rev`) on every change so the other chat follows by Realtime |
| `014p_owner_diary_entry.sql` | Diary (#186) | `add_owner_diary_entry(pet, body)`: the owner writes a diary page of their own. No new table: it is a sent `daily_reports` row whose author column (`sitter_id`) is the owner, so the owner reads it in their book and can decorate it, while sitters (who read only rows they wrote) and the Life Record (which filters by the booking's sitter) never see it. No draft, no AI, no notice |
| `014r_handoff_pair_and_trip_near.sql` | 03D (3D.8, #145 · #169) | A drop-off + pick-up suggestion is one pair: `booking_handoffs.pair_id` (two rows, one key), `propose_handoff_pair` (both rows, one notice) and `respond_handoff` answering both together, before or after confirm (a replaced row turns its partner into a single one: trigger `clear_pair_on_supersede`; rows with no key work as in 012c). `owner_profiles.default_handoff` (the owner's usual handoff place; the sitter's default is the onboarding answer `handoff`). `trips.near_notified_at` + `update_trip_position`: one `trip_near` notice ("is about 5 minutes away") per trip |
| `014s_meet_greet_done_early.sql` | #229 | "Done, we met" works any time after the Meet & Greet is agreed; a second press is a no-op |
| `014t_diary_delete_hide_photo.sql` | Diary (#243) | `delete_diary_page(report)`: the author deletes a page (draft or sent, sitter or owner); its stickers and its "report sent" notice go with it, Feed photos are never touched. `hide_diary_page(report)` + table `diary_page_hidden`: the owner takes a sitter's page out of their own book only (the owner's read policy on `daily_reports` skips hidden pages; the sitter's copy and the Life Record are unchanged; no way back yet). `daily_reports.media_id` + `set_diary_page_photo(report, media)`: the photo in the page's picture box, the author's own image of that pet (feed or report upload) |
| `014u_release_slots_on_return.sql` | #232 | An early Returned releases the rest of the stay's `booking_slots`, so the sitter is free again |
| `014v_owner_onboarding.sql` | 11.15 S1 (#185) | `pets.profile jsonb` (the owner's answers, an object up to 16000 characters), `owner_profiles.intro` (up to 500), `owner_profiles.onboarded_at` (null for a new owner until the sign-up questions are done; owners who exist when the migration runs are marked done). Table `pet_photos` (up to 8 per pet, first = cover, same shape as `profile_photos`): read by whoever reads the pet; `add_pet_photo` and `remove_pet_photo` are backend only, `reorder_pet_photos` is the owner's. `create_pet_with_profile(...)` saves a pet, its answers and its allergies in one call and is safe to retry with the same id |
| `014w_breed_notes.sql` | 11.15 S4 (#185) | `breed_notes (species, breed_key, chips, sources, found, fetched_at)`: a cache for breed lookups, service role only (no policy, no grant to the app). Since 2026-10-28 breed needs come only from the list we wrote ourselves and no website is read, so nothing new is cached here |
| `014y_chat_quote_fees_hold.sql` | 03D (#144 review) | The chat fees stay in the price: `booking_extra_fees` falls back to the booking's own final quote (confirmed, after its payment card and before the next booking's, `payment_card_between`), then to the fees it was paid with (`price_snapshot.extras`), so a time change no longer drops them; `pay_booking_demo` raises `quote_pending` while that final quote waits for the owner |
| `014z_demo_account_lock.sql` | Audit 2026-10-21 | Trigger `guard_demo_account` on `auth.users`: a `@goldito.test` account's password and email cannot change (the Try demo password is in the web bundle, so a visitor could lock the judges out). `set_demo_accounts_unlocked(bool)` (service role only) opens a 5-minute window; `scripts.seed_demo` opens it, refreshes the accounts and closes it. In the SQL Editor: `select set_demo_accounts_unlocked(true);` first |
| `015_nap_checkin.sql` | 11.12 (#184) | `care_checkins.kind` gains `nap` (no value); `log_care_checkin` tells the owner "Max is taking a nap 💤" |
| `015b_pet_medals.sql` | 11.12 (#184) | `pet_medals` (pet, booking, sitter, stay dates; one per pet and stay), read by the pet's owner and the sitter who gave it; written only by `award_pet_medal` (the booking's sitter, after the pick-up is done) |
| `015c_refund_on_cancel.sql` | #266 | `bookings.refunded_at`: cancelling a paid booking refunds it in full (demo money; real refunds come with Stripe), done by a trigger on the status change |
| `015d_wake_checkin.sql` | 11.12b (#184) | `care_checkins.kind` gains `wake` (no value): the sitter taps Awake when a napping pet wakes; `log_care_checkin` tells the owner "Max woke up ☀️" |
| `015e_notification_prefs.sql` | Settings (#292) | `profiles.notification_prefs` (Trip updates · Daily notes and photos on, Tips and news off) set by `set_notification_pref(key, on)`; a `notifications` BEFORE INSERT trigger drops a notice whose family the person turned off (`trip_*`, `report_sent` · `feed_post` · `photo_request_fulfilled`, `tip` · `news`). Everything else, safety DANGER included, is never muted |
| `015f_meet_greet_owner_choice.sql` | #236 | The owner asks for a Meet & Greet or to skip it right after Request booking, and the sitter's answer is the first yes (it holds the dates, like `express_interest`) |
| `015g_profile_address_details.sql` | Profile (#180) | `home_address_2` (unit, buzzer) and `home_postal_code` on `owner_profiles` and `sitter_profiles`, editable by the person; `full_address(details, street, postal)` builds the text, and `get_handoff_details` returns it as the drop-off / pick-up address |
| `015h_owner_packing_list.sql` | Profile (#180) | `owner_profiles.packing_list` (up to 20 items, written by the owner); `get_handoff_details` returns it on the drop-off row for both parties, so the sitter ticks it at hand-over. `sitter_profiles.packing_list` is no longer used |
| `015i_checkin_options.sql` | 11.12 | More check-in choices: `other` for meal and potty (with a memo), walk 5 and 15 minutes, eight moods |
| `015j_feed_sources.sql` | #345 | Feed tags for every care photo (`potty`, `mood` too), `feed_posts.note` (up to 200 characters), and `feed_post_hidden`: each person hides or removes a post for themselves |
| `015k_meet_greet_updates_in_chat.sql` | #264 | Every Meet & Greet change posts a short `meet_greet_update` card at the bottom of the chat (proposed, agreed, declined, skipped, done) |
| `015l_feed_edit.sql` | #345 | Edit a Feed photo: `feed_posts.tags` (several tags), `taken_at` (the day and time it is from, moved only by its author) and the memo |
| `015m_chat_list_pets.sql` | #263 | The chat list shows the pets of the stay asked about (id, name, species, first photo). Counts and previews follow `015w` |
| `015n_chat_thread_pets.sql` | #263 | `get_chat_thread_pets`: the sitter's chat header shows the owner's pets of the stay (face, species, breed only, no care notes or allergies) |
| `015o_chat_pet_access.sql` | #263 | A sitter asked about a stay in a chat can read that stay's pets (profile, photos, allergies, Life Record) while the stay is ahead and the card is under 30 days old |
| `015p_profile_phones.sql` | #358 | `profile_phones`: each person saves their own number; the other person of a chat gets it through `get_chat_contact` only once a Meet & Greet is agreed or done, or the booking is confirmed |
| `015q_trip_arrival_accuracy.sql` | #381 | `update_trip_position` takes the reading's accuracy; a reading worse than 100 m moves the map but never counts for the arrival or the "5 minutes away" notice |
| `015r_checkin_batch.sql` | Sitter-011 (#397) | `log_care_checkins(pet, picks, memo, photo)`: one check-in with a pick per group (meal, potty, walk, mood), one row per pick and **one** owner notice listing them; the memo and photo ride on the first pick. `log_care_checkin` keeps its contract; its body moves to `care_checkin_write` (not callable by clients) and `care_checkin_title` |
| `015s_shared_reviews.sql` | 2026-10-26 | Reviews both ways are shared: the owner reads the sitter's note about them and every sitter sees it (`owner_rating_summary`); the owner's review of a sitter shows in full on the sitter's profile. Replaces the private part of `011g` |
| `015t_judge_seats.sql` | #411 | Judge seats: four demo sets (judge1 to judge4), each held by one browser at a time with a heartbeat about every minute; free again after 10 minutes without one or on sign-out; the stay resets only when a different browser takes the seat |
| `015u_pet_reviews.sql` | #407 | `pet_reviews`: the sitter's review of each pet after a stay (chips plus an optional note), one per pet and booking, shared with the owner and with sitters who look at the pet |
| `015v_judge_sitters_hidden.sql` | #411 | `sitter_visible_to`: a judge set's sitter is listed only for her own set's owner, so a judge never sees another seat's Chloe in search |
| `015w_chat_list_shown.sql` | #451 | `chat_message_shown`: the chat list counts and previews only the messages the chat draws (the request card and an early Meet & Greet card are not counted) |
| `015x_diary_page_photos.sql` | Diary | Up to four photos on a diary page: `daily_reports.more_media_ids` and `set_diary_page_photos(report, media[])`; `set_diary_page_photo` keeps working |

Numbers follow the order the work was done in; take the next free name (see Naming).

### Naming

CI and a fresh local DB apply the files in **name order**; the hosted DB has them in the order they were **run**. The two only agree when every new file sorts after every file already applied — otherwise a function redefined in two files ends up different in CI and on the hosted DB.

- Take the **next free name after the highest file on `main` and in open PRs** (after `012e` comes `012f`; a letter keeps the phase number, a new phase takes the next number). No per-person letter ranges (they broke this rule: 2026-10-13, CR-6).
- Before applying a file to the hosted DB, check it still sorts after everything already applied there. If not, rename it first — a file that was never applied can be renamed freely.
- Never edit an applied file; fix it in a new one.

## ERD

```
auth.users 1─1 profiles (role owner|sitter) ─┬─1 owner_profiles
                                             └─1 sitter_profiles
profiles(sitter) 1─* sitter_availability (day range × slot, hours, max_pets, open|blocked)
profiles(owner)  1─* pets (dog|cat) 1─* pet_allergies · 1─* pet_photos
bookings (owner, sitter, status) 1─* booking_pets (pet, care_range — no overlap per pet) *─1 pets
bookings 1─* booking_slots (pet × day × slot, capacity) · 1─* booking_handoffs (drop_off|pick_up)
pets 1─* care_tasks 1─* task_logs ─0..1 media
pets 1─* media ─* feed_posts (sitter) ─0..1 task_logs
pets 1─* daily_reports (1 per pet × date × sitter)
pets 1─* safety_checks ─1 media
profiles 1─* notifications ─0..1 pets / bookings
```

## Smoke test

**Hosted (task 2.9):** after the latest migration (`003` includes API table grants at the end of the file; `004` adds column grants for its new profile columns), paste [`tests/rls_smoke.sql`](tests/rls_smoke.sql) into the SQL Editor and run it. If smoke fails with `permission denied for table pets`, run the **API table grants** section at the bottom of `003_functions_triggers.sql` (do not use a bare `grant update on all tables` — that allows changing `profiles.role` and breaks smoke). If smoke fails with `FAIL: user cannot change own role`, re-run that same grants section to restore column-level UPDATE rules — and then the **Column grants** lines at the end of `004_booking_options.sql`, which that section would otherwise drop. It creates fictional users, checks permissions and booking scenarios A–H from phase-02, then rolls everything back. Success = no error; any failure stops with `FAIL: <check>`.

**Local / CI:** Postgres 17 with pgvector (`010` needs the `vector` extension) plus [`tests/supabase_stub.sql`](tests/supabase_stub.sql) (API roles, `auth.users`, `auth.uid()`, `extensions` schema, realtime publication). Never run the stub on Supabase. The CI `supabase` job runs the same steps on every PR that touches `supabase/**`.

Start a **fresh** container for every run — reusing one leaves roles behind and the stub fails.

```bash
docker run -d --name goldito-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 pgvector/pgvector:pg17
```

```bash
export PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres
psql -v ON_ERROR_STOP=1 -q -f supabase/tests/supabase_stub.sql
for f in $(ls supabase/migrations/*.sql | LC_ALL=C sort); do psql -v ON_ERROR_STOP=1 -q -f "$f"; done
psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
```

## Client rules

- **`sitter_profiles`:** always list columns — `select('*')` fails because `home_address` and `meet_spots` are not readable. The sitter reads their own address and meeting spots with `rpc('get_my_sitter_profile')`; booking parties get addresses from `rpc('get_handoff_details')`. `services` is readable by everyone (search shows "Doesn't offer house sitting").
- **Service type (004):** `request_booking(..., p_service_type)` — `boarding` (default) or `house_sitting`; house sitting stores both handoffs as `owner_home` whatever place was sent.
- **Meet & Greet (004, D44):** `request_booking` sets `bookings.meet_greet_status` to `required` for a first-time pair (no earlier booking that reached the drop-off and no done Meet & Greet), else `not_needed`. `respond_booking` accepts only when it is `not_needed`, `done` or `skipped`.
- **Booking pets on cards:** use `rpc('get_booking_pets', { p_booking })` — the pets table hides a pet from the sitter once the booking has ended.
- **Writes:** bookings, handoffs, `booking_pets`, `booking_slots` change only through the RPCs in `003`.
- **Consents (009d):** the owner inserts `booking_consents` only during checkout — booking `confirmed`, `paid_at` null, and a kind from `rpc('required_consents')`; anything else is an RLS error (`42501`). A booking with `paid_at` null but a `price_snapshot` was paid once and reopened by an agreed change — show "sign to finish", not "accepted"; `get_handoff_details` still answers for it (009e), `get_home_access` answers `not_paid` until the owner signs.

## RPC errors

RPCs raise the error code as the message (`error.message` in supabase-js):

| Code | Meaning |
| :--- | :--- |
| `not_authenticated`, `not_owner`, `not_a_sitter`, `not_allowed` | Caller is not allowed for this pet / booking / role |
| `invalid_window` | Pick-up not after drop-off, drop-off in the past, trip over 31 days (schedule over 92 days) |
| `invalid_status`, `invalid_kind` | Booking is not in a state that allows this / handoff kind is not `drop_off`/`pick_up` |
| `invalid_location`, `location_note_required` | Unknown place type, or a house-sitting handoff away from the owner's home (009c) / "Somewhere else" without a note |
| `invalid_service`, `service_not_offered` | Service type is not `boarding`/`house_sitting` (or `daycare` for `quote_booking`) / the sitter has no rates row, or the service is not in `sitter_profiles.services` |
| `rates_not_set` | `quote_booking` / `pay_booking_demo`: the sitter has a rates row but no price for this service (014k). Detail = the service |
| `invalid_pet_count` | `quote_booking` / `pay_booking_demo` pet count is missing or less than 1 |
| `consents_missing` | Demo pay before every required consent is signed — detail = missing kinds |
| `already_paid` | `pay_booking_demo` called again on a booking that already has `paid_at` |
| `not_paid` | Address / entry info requested before demo pay (03C.4+); entry info also while a checkout reopened by a change waits for the new consent (009d) — addresses stay (009e) |
| `access_locked` | Entry codes outside the 2 h-before → pick-up window — detail JSON `unlocks_at` or `locked_since` |
| `forbidden` | `get_home_access` by anyone other than the booked sitter |
| `meet_greet_required` | Accepting a first-time pair before the Meet & Greet is done or both agreed to skip it (D44) |
| `invalid_mode`, `place_required`, `place_too_long` | Meet & Greet is not `in_person`/`video` / in person without a place / place over 120 characters |
| `meet_greet_not_yet` | No longer raised since `014s`: Done works any time after the Meet & Greet is agreed, and a second Done is a no-op (#229) |
| `sitter_unavailable` | A slot is full or closed — detail = `YYYY-MM-DD slot, …`, or `no_open_slot` |
| `pet_already_booked` | The pet already has a sitter (or a pending request) for overlapping hours |
| `handoff_pending` | The sitter's own counter-offer is waiting for the owner |
| `handoff_missing`, `handoff_completed` | No agreed handoff yet / already marked Received or Returned (it can't be replaced either, 009c) |
| `proposal_expired`, `request_expired` | Accepting a proposed time that has passed / confirming a request whose agreed pick-up has passed (009c) |
| `handoff_too_early`, `drop_off_not_completed` | Received more than 2 h before the drop-off / Returned before Received |
| `booking_in_progress` | Cancel after the pets were received or after the pick-up time |
| `booking_finished` | Handoff addresses are hidden 24 h after the pick-up |
| `overlaps_confirmed_booking` | Schedule change would drop below confirmed pets — detail = booking ids |
| `task_type_not_allowed_for_species` | `walk` for a cat or `litter` for a dog |
| `checkin_not_allowed_for_species` | A check-in kind that does not fit the pet (e.g. `walk` for a cat) |
| `not_on_duty`, `not_in_care_window` | Today's task list / a task or check-in outside the sitter's care window |
| `task_log_not_found`, `already_done` | Completing a task that is not on today's list / that is already done |
| `invalid_media` | The attached photo is not the sitter's own upload for this pet |
| `note_required` | A note check-in or a counter-request without a note |
| `too_many_items`, `empty_request` | More than 12 tasks or 8 Heads-ups / a care request with neither |
| `stay_in_progress` | `save_care_request` while a stay is on — send a change request instead (009b) |
| `no_active_stay`, `request_pending` | Change request with no stay on / one is already open (pending or countered) for the pet |
| `already_answered`, `invalid_tasks` | The change request was already answered or closed / counter-request names tasks that are not on it |
| `report_already_sent`, `body_required`, `body_too_long` | Daily report sent twice / empty / over 2000 characters |
