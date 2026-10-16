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

## Figma ↔ code

Library file: [Goldito Design System](https://www.figma.com/design/GvZcpNdR077U4VDiPTQ9T0) — built from this code, names match 1:1.

| Figma | Code |
| --- | --- |
| Variable `color/<name>` (collection **Color**) | `theme.color.<name>` — `theme/tokens.ts` |
| A **Mode** of the Color collection (`Default`, later one per pet skin) | a preset in `theme/themes.ts`; only `SkinColors` (`primary`, `primaryText`, `background`, `accent`, `surface`, `border`) may differ per mode |
| `spacing/*`, `radius/*`, `fontSize/*`, `fontWeight/*`, `lineHeight/*`, `icon/*` (collection **Size**) | `theme.spacing.*`, `theme.radius.*`, … |
| `opacity/*` (percent in Figma) | `theme.opacity.*` (0–1 in code) |
| Text styles `Title`, `Body`, `Body Semibold`, `Small`, `Small Semibold`, `Caption Bold` | `fontSize.*` + `fontWeight.*` + `lineHeight.*` |
| `Button` (Variant × State) | `components/ui/Button.tsx` (`variant`, `disabled`) |
| `TextButton` (Tone × State) | `components/ui/TextButton.tsx` (`danger`, `disabled`) |
| `Chip` (Removable) | `components/ui/Chip.tsx` (`onRemove`) |
| `Card` | `components/ui/Card.tsx` |
| `TextField` (State) | `components/ui/TextField.tsx` (`error`; focus is runtime) |
| `CheckRow` (Type × Checked) | `components/ui/CheckRow.tsx` (`radio`, `checked`, `hint`) |
| `Segment` / `SegmentedControl` | `components/ui/SegmentedControl.tsx` (`count` → badge) |
| `EmptyState` (Action) | `components/ui/EmptyState.tsx` (`action`) |

Not in Figma yet: sheets and pickers (`Sheet`, `DayPickerSheet`, `TimePickerSheet`), `AlertModal`, `Stepper`, `BackLink`, `SwipeToDelete`. Font is Inter in Figma as a placeholder; the app uses the system font.

**Sync order when the design changes:** Figma Variables → `tokens.ts` / `themes.ts` (read them with the Figma MCP `get_variable_defs`) → `components/ui/` → screens. Never copy a hex value from a frame into a screen.
