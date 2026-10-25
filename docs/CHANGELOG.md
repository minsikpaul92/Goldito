# Changelog

All notable **user-facing** Goldito changes. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The in-app **Menu → What's new** screen (Phase 11.11) shows the released entries of this file, **from 1.0.0 on**: what people can do now that they could not at launch. Everything before 1.0.0 (the hackathon build, P0) stays below as history and is never shown in the app. A release may be split by day (the same version under several dated headings): What's new shows one card per dated heading, and a heading with no date is left out of the app. Release rule: when a feature ships after launch (P1, post-hackathon, post-release), add its line under the new version here and run `node scripts/changelog.mjs` in `frontend/` (it writes `features/settings/changelog.json`; CI fails when the two differ). Planned items are never shown in the app.

## [Unreleased] — 2026-10-21

### Added

- Moments (the Feed tab): filter photos by Meals, Walks, Naps, Mood, Potty or No tag, see every pet together or pick one from the pet chip, and switch between Photos and Diary. Edit a photo you posted: its tags (several), the day and time, and your note. Swipe or tap the edges to turn photos and pinch to zoom. The newest photo is shown big, a photo opens with its tag, date, time and your note, and you can hide a photo or delete it on your side only. Press and hold a photo, or tap Make a sticker, to turn it into a sticker. A shared photo can be deleted for both of you for 30 minutes after it is sent. A sitter can still open the photos of a pet after the stay, and your stickers show up in your own Moments.
- Pet room: an 8-bit pet on your Home (and the sitter's) that walks around its room, eats from a bowl, naps and wakes, and shows today's care (fed, potty, mood). Put a Halloween pumpkin hat on it, or match its colors to a photo. Sitters tap Feed, Walk, Poop and Nap on it, give a medal after a stay and collect badges.

## [0.2.0] — 2026-10-15

### Added

- Settings with What's New: open Profile → Settings to see the app version and what changed.
- Photo request: an owner asks the sitter for a photo from Feed; the sitter sees a banner on Home, and their next shared photo answers it with one notice.
- Split view for computers: open the demo link with `?view=split` to see the owner's and the sitter's phones side by side, each signed in to its own demo account.

### Fixed

- Treat check: a partly read or cut-off label is never called safe; allergies typed as "eggs" or "poultry" and label words like "caseinate" or "fishmeal" are caught; "peanut butter" is no longer treated as dairy.
- Snap tab: Recent checks show a new check as soon as you go back.

### Changed

- The app is now called **Goldito** (was Pawddy). You will be signed out once. New photos and videos go to the `goldito/` Cloudinary folder (older `pawddy/` and `pawnote/` media still loads). What had to be done by hand: [plan/rename-goldito.ko.md](plan/rename-goldito.ko.md).
- The app is now called **Pawddy** (was PawNote). Demo sign-in emails are now `@pawddy.test`; new photos and videos go to the `pawddy/` Cloudinary folder (older `pawnote/` media still loads).

## [0.2.0] — 2026-10-14

### Added

- Snap tab: Treat check reads a treat label and checks it against your pet's allergies and foods toxic to its species, with sources from trusted vet sites; Mood reads your pet's body language for fun; Sticker cuts your pet out of a photo, and stickers decorate the daily diary page.

## [0.2.0] — 2026-10-12

### Added

- Pet Transit: a live trip map with an arrival time for drop-off and pick-up.

## [0.2.0] — 2026-10-08

### Added

- Completion: a home-safe report, a review, and a Pet Life Record the next sitter can read.
- Daily report: the AI suggests chips from the day's check-ins and photos; the sitter keeps or turns off each, adds a short note if they want, and approves before it goes out.
- Inquiry: the AI drafts the sitter's reply in their own tone from the schedule, the quote and the house rules; the sitter approves it (or turns on auto-send).

## [0.2.0] — 2026-10-06

### Added

- Care: quick check-ins (meal, potty, walk, medicine), care tasks with a photo, and a feed and album with AI captions.
- Meet & Greet before a first stay, booking with consents and a demo payment, and entry info that opens only near the handoff.

## [0.0.0] — hackathon scaffold

### Added

- Monorepo: Expo web + FastAPI health (Phase 01)
- Supabase schema, RLS, booking RPCs (Phase 02)
