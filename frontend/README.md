# Goldito frontend

Expo (React Native Web) with **expo-router**, TypeScript, npm.

**Expo Web (Phase 1.3+):** expo-router under `app/`, `lib/api.ts`, `theme/tokens.ts`, `components/ui/`.

## Environment

1. Copy [`.env.example`](.env.example) → `.env` if needed.
2. Only **public** keys (`EXPO_PUBLIC_*`). Never put service role, Cloudinary secret, or Nebius keys here.
3. For Phase 1.3 health check: `EXPO_PUBLIC_API_URL=http://localhost:8000`

Details: [docs/plan/env-setup.ko.md](../docs/plan/env-setup.ko.md)

## Run

```bash
cd frontend
npm install
npx expo start --web
```

Start the backend on port 8000 first, then open `/dev/health` (needs `EXPO_PUBLIC_DEV_ROUTES=1` in `.env`) and tap **Check API** (`GET /health` → "API OK ✅"). `/` is the sign-in gate: it sends you to `/login`, or to `/owner` / `/sitter` once signed in. Sign in needs `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env`.

## Planned layout

See [architecture §2](../docs/plan/phases/architecture.ko.md#2-리포-구조-최종-형태): role areas `app/owner/` · `app/sitter/` (URL prefixes, architecture D26), `lib/supabase.ts`, `lib/api.ts`, UI kit under `components/ui/`.

Design values come from `useTheme()` / `useThemedStyles()` (`providers/ThemeProvider.tsx`): base values in `theme/tokens.ts`, skin presets in `theme/themes.ts` (only `default` until Phase 11.10). See [DESIGN.md](../DESIGN.md) "For AI agents".

## Desktop browsers

On a computer (mouse / trackpad) the app renders inside a **402 × 874 phone frame** at any window width — the same app in a same-origin iframe, so inside it everything behaves like a 402 px phone. Narrow windows keep the frame (scaled down if narrower than the phone). Phone / tablet browsers (touch) and native builds are unchanged. See [architecture D25](../docs/plan/phases/architecture.ko.md) and [DESIGN.md §2.1 · §7.7](../DESIGN.md#21-desktop-browsers-judges-phone-frame).

- `components/shell/` — `AppShell.web.tsx` picks the mode (`presentation.ts`), `DeviceFrame.web.tsx` draws the phone. Screens never import these; use `useShell()` / `useLayoutMode()`.
- Route changes inside the frame are mirrored to the address bar, so refresh and shared links keep the screen.
- `?frame=0` turns the frame off (video recording, debugging); `?frame=1` forces it on.
- Inside the frame the mouse acts like a finger (`TouchEmulation.web.ts`): click = tap, click-drag scrolls with momentum (a drag never taps), the wheel moves chip rows sideways, no text selection or image dragging, hidden scrollbars, round touch cursor. Mouse only — real phones and touch laptops keep native touch.
- Pick photos only through `pickMedia()` (task 4.7) — on desktop it offers built-in sample photos.

## E2E tests (Playwright)

`/dev/gestures` is a test screen with every touch pattern (long list, chip row, paged photos, rows, modal, toast, input). It only exists when `EXPO_PUBLIC_DEV_ROUTES=1` (set it in `.env` locally; never in production). Sign-in flows run against a **mocked Supabase** (`e2e/supabaseMock.ts`) — the test build points the Supabase URL at the test server itself, so no real project or secret is needed.

```bash
npx playwright install chromium firefox webkit   # once
EXPO_PUBLIC_DEV_ROUTES=1 EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:4173/supabase-mock EXPO_PUBLIC_SUPABASE_ANON_KEY=e2e-anon-key npx expo export -p web
npm run test:e2e
```

PowerShell: `$env:EXPO_PUBLIC_DEV_ROUTES="1"; $env:EXPO_PUBLIC_SUPABASE_URL="http://127.0.0.1:4173/supabase-mock"; $env:EXPO_PUBLIC_SUPABASE_ANON_KEY="e2e-anon-key"; npx expo export -p web`. Rebuild with your real `.env` before running the app for real (`dist/` is only for tests).

**Gotchas:** build the mock-backed export with the CI values from `.github/workflows/ci.yml` and `npx expo export -c -p web` (`-c` clears the cache so a real `.env` does not leak into the build). Commit only after the whole suite passes **three runs in a row**. Never write a test that depends on the time of day — use a fake clock (`page.clock`) or set the DB state. Do not run Prettier over existing files (it rewrites unrelated lines).

Projects: Chromium · Firefox · WebKit × 1366×768 · 1440×900 · 1920×1080 (phone frame + mouse), a touch phone (no frame, layout at 360 / 402 / 440), and `auth` (sign in / sign up / role routing / log out in the frame). CI runs the same suite on every frontend PR. Note: Playwright's Firefox needs the Visual C++ runtime on Windows — run `--project=chromium-*` / `webkit-*` / `phone` / `auth` locally if it is missing.

## Figma ↔ code (handoff for Muk)

Source of truth: Muk's [Goldito-Design](https://www.figma.com/design/stZjrJJU6KOhLauxPjaV8l/Goldito-Design) — page **Components** (65 components) and **Screens**; brand rules on [goldito-design / Brand](https://mooque-dev.github.io/goldito-design/brand.html). Code follows Figma; nobody restyles a screen in code without a Figma frame.

### Where to change what

| You change in Figma | Edit in code | Reaches |
| --- | --- | --- |
| A **Color** variable (mode `Default`) | `theme/tokens.ts` → `color` | every screen (≈ 2,000 style refs read the theme) |
| Another **Color** mode (`Balanced`, pet skins) | `theme/themes.ts` → one preset per mode | the app when that skin is on |
| **Size** / **Motion** variables, text styles | `theme/tokens.ts` → `spacing`, `radius`, `fontSize`, `fontWeight`, `lineHeight`, `layout`, `motion` | every screen |
| A **base** component (Button, Chip, Text Field…) | its file in `components/ui/` (table below) | every screen that uses it |
| A **screen-level** component (Booking Card, Feed Card…) | its file in `components/` (table below) | the screens that show it |
| Logo / favicon | `assets/brand/` + `components/BrandLogo.tsx`, `app.json` → `web.favicon` | Welcome, login, browser tab |

Every Figma variable's code syntax is its code name (`color/text-muted` → `theme.color.textMuted`). Figma uses kebab-case, code uses camelCase — keep the code syntax filled so the two stay linked.

### Run it while you work

```bash
cd frontend
npm ci
npx expo start --web
```

Needs `frontend/.env` (copy `.env.example`; Supabase URL + anon key from Minsik). Sign in with **Demo owner** / **Demo sitter** on the login screen. `http://localhost:8081/?view=split` shows both phones.

### Component map (Figma → code)

✅ one code file to edit · 🟡 exists but split over several files or partly different · ❌ not in code yet

| Figma component | Code | |
| --- | --- | --- |
| Button | `components/ui/Button.tsx` (Figma `Loading` state not in code yet) | ✅ |
| Text Button | `components/ui/TextButton.tsx` | ✅ |
| Chip | `components/ui/Chip.tsx` | ✅ |
| Card | `components/ui/Card.tsx` | ✅ |
| Text Field | `components/ui/TextField.tsx` (Figma `Helper` line not in code yet) | ✅ |
| Segment | `components/ui/SegmentedControl.tsx` | ✅ |
| Checkbox Row | `components/ui/CheckRow.tsx` | ✅ |
| Stepper | `components/ui/Stepper.tsx` | ✅ |
| Empty State | `components/ui/EmptyState.tsx` | ✅ |
| Bottom Sheet | `components/ui/Sheet.tsx` | ✅ |
| Alert Modal · DANGER | `components/ui/AlertModal.tsx` | ✅ |
| Toast | `providers/ToastProvider.tsx` | ✅ |
| Calendar Day | `components/SlotCalendar.tsx`, `components/ui/DayPickerSheet.tsx` | 🟡 |
| Tab Bar / Tab Bar Item | `components/RoleTabs.tsx` (Figma's last tab says **Mood** — the app's is **Snap**, D61) | 🟡 |
| Top Bar / Icon Button | screen headers from `expo-router` + `components/HeaderActions.tsx`, `components/NotificationBell.tsx` | 🟡 |
| Booking Card / Stage Card | `components/BookingCard.tsx`, `components/BookingStageBar.tsx` | ✅ |
| Stay Summary Card | `components/StaySummaryCard.tsx` | ✅ |
| Latest Update Row | `components/LiveUpdates.tsx` | ✅ |
| Pet Mini Card | `components/PetCard.tsx` | ✅ |
| Profile Card | `components/SitterCard.tsx` + `app/owner/sitters/[sitterId].tsx` | 🟡 |
| Choice Card | `components/RoleCard.tsx`; other big radio choices are local | 🟡 |
| Feed Card | `components/FeedCard.tsx` | ✅ |
| Grid Photo / Day Header | `components/AlbumView.tsx` | ✅ |
| Timeline Row | `components/DiaryTimeline.tsx` | ✅ |
| Next Task Card / Task Row | `components/SitterDashboard.tsx`, `components/TodayTasks.tsx`, `components/CareTasksSection.tsx` | 🟡 |
| Check-in Tile | `components/QuickCheckIn.tsx` | ✅ |
| Suggestion Chip | `components/ChipSuggestions.tsx` | ✅ |
| Report Summary / Daily Note | `components/ReportComposer.tsx`, `features/diary/` screens | 🟡 |
| Checklist Row | `components/ChecklistCard.tsx` | ✅ |
| Message Bubble | `components/MessageBubble.tsx` | ✅ |
| Quote Card | `components/QuoteCard.tsx` | ✅ |
| Consent Card | `components/ConsentCard.tsx` | ✅ |
| Entry Info Card | `components/EntryInfoCard.tsx` | ✅ |
| Star | `components/StarRating.tsx` | ✅ |
| Life Record Card | `components/LifeRecordCard.tsx` | ✅ |
| Trip Map | `components/TripMap.tsx` / `TripMap.web.tsx` | ✅ |
| Photo Check | `features/transit/TripScreen.tsx` (local) | 🟡 |
| Mood Result Card | `features/snap/MoodScreen.tsx` (local) | 🟡 |
| Action Row | `features/snap/SnapToolCard.tsx`; settings rows are local | 🟡 |
| Photo Tile | `components/MediaPicker.tsx`, `components/MediaPlaceholder.tsx` | 🟡 |
| Notification Row | `features/notifications/NotificationsCenter.tsx` (local) | 🟡 |
| **Tag** (status label) | **no shared component** — status labels are styled separately in `BookingCard`, `TodayTasks`, `CareTasksSection`, `ReportComposer`, `SitterDashboard`, `TreatCheckScreen`, `HeaderActions` (role) | ❌ |
| **Avatar** | **no shared component** — local round avatars in `PetCard`, `SitterCard`, `SnapToolCard` | ❌ |
| **Banner** | **no shared component** — `DueAlert`, `HeadsUpSection`, and local notices in `signup`, `care-request`, `TripScreen` | ❌ |
| Switch / Switch Row | not in code (closest: `components/ShareToggle.tsx`) | ❌ |
| Filter Chip | not in code | ❌ |
| Skeleton | not in code (`ui/LoadingView` shows a spinner) | ❌ |
| Progress Bar, Source Tag, Typing Indicator, Step Dot, Feature Row | not in code or local only | ❌ |
| Permission Prompt, Push Preview, Theme Preview, Demo Control | prototype / onboarding drafts — not built | — |

### Not decided yet (Figma ↔ code)

- **Code-only tokens** — add them to Figma as variables so both sides have them: `color/media`, `color/on-media`, `color/gold`, `color/gold-on-light`, `color/cream`, `font-weight/*`, `line-height/*`, `opacity/*`.
- **Mood vs Snap** — the Figma Tab Bar's last tab is Mood; the app (D61) is Snap.
- **Skins and text** — `Balanced` also changes `text` / `text-muted`; the code allows it only for dark, readable values (DESIGN.md §3.1).

**Sync order when the design changes:** Figma Variables → `tokens.ts` / `themes.ts` (read them with the Figma MCP `get_variable_defs`) → `components/ui/` → screen components → screens. Never copy a hex value from a frame into a screen.
