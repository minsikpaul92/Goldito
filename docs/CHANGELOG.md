# Changelog

All notable **user-facing** Goldito changes. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The in-app **Profile → Settings → What's New** screen (Phase 11.11) shows the released entries of this file. Release rule: when a feature ships to the demo / production URL, add its line here and run `node scripts/changelog.mjs` in `frontend/` (it writes `features/settings/changelog.json`; CI fails when the two differ). Planned items are never shown in the app.

## [Unreleased]

### Planned (documented, not shipped)

- 8-bit Pet status room on Owner Home — Tamagotchi-style fed/mood/potty (11.12)

## [0.2.0] — 2026-10-15

### Added

- Settings with What's New: open Profile → Settings to see the app version and what changed.
- Photo request: an owner asks the sitter for a photo from Feed; the sitter sees a banner on Home, and their next shared photo answers it with one notice.
- Split view for computers: open the demo link with `?view=split` to see the owner's and the sitter's phones side by side, each signed in to its own demo account.
- Snap tab: Treat check reads a treat label and checks it against your pet's allergies and foods toxic to its species, with sources from trusted vet sites; Mood reads your pet's body language for fun; Sticker cuts your pet out of a photo, and stickers decorate the daily diary page.
- Pet Transit: a live trip map with an arrival time for drop-off and pick-up.
- Completion: a home-safe report, a review, and a Pet Life Record the next sitter can read.
- Daily report: the AI suggests chips from the day's check-ins and photos; the sitter keeps or turns off each, adds a short note if they want, and approves before it goes out.
- Care: quick check-ins (meal, potty, walk, medicine), care tasks with a photo, and a feed and album with AI captions.
- Inquiry: the AI drafts the sitter's reply in their own tone from the schedule, the quote and the house rules; the sitter approves it (or turns on auto-send).
- Meet & Greet before a first stay, booking with consents and a demo payment, and entry info that opens only near the handoff.

### Fixed

- Treat check: a partly read or cut-off label is never called safe; allergies typed as "eggs" or "poultry" and label words like "caseinate" or "fishmeal" are caught; "peanut butter" is no longer treated as dairy.
- Snap tab: Recent checks show a new check as soon as you go back.

### Changed

- The app is now called **Goldito** (was Pawddy). You will be signed out once. New photos and videos go to the `goldito/` Cloudinary folder (older `pawddy/` and `pawnote/` media still loads). What had to be done by hand: [plan/rename-goldito.ko.md](plan/rename-goldito.ko.md).
- The app is now called **Pawddy** (was PawNote). Demo sign-in emails are now `@pawddy.test`; new photos and videos go to the `pawddy/` Cloudinary folder (older `pawnote/` media still loads).

## [0.0.0] — hackathon scaffold

### Added

- Monorepo: Expo web + FastAPI health (Phase 01)
- Supabase schema, RLS, booking RPCs (Phase 02)
