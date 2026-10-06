# Changelog

All notable **user-facing** Pawddy changes. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The in-app **Settings → What's New** screen (Phase 11.11) reads this file (or a build-time copy). Add an entry when a feature ships to production/demo URL.

## [Unreleased]

### Changed

- The app is now called **Pawddy** (was PawNote). Demo sign-in emails are now `@pawddy.test`; new photos and videos go to the `pawddy/` Cloudinary folder (older `pawnote/` media still loads).

### Planned (documented, not shipped)

- Sitter care loop Plan B: quick check-ins (meal, potty, mood, note), optional photo on tasks, owner Activity history ([plan/sitter-care-loop.ko.md](plan/sitter-care-loop.ko.md))
- Settings screen with in-app patch notes — **Settings → What's New** (11.11)
- 8-bit Pet status room on Owner Home — Tamagotchi-style fed/mood/potty (11.12)

## [0.0.0] — hackathon scaffold

### Added

- Monorepo: Expo web + FastAPI health (Phase 01)
- Supabase schema, RLS, booking RPCs (Phase 02)
