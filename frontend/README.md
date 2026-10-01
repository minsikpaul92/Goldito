# PawNote frontend

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

Start the backend on port 8000 first, then tap **Check API** on the home screen (`GET /health` → "API OK ✅").

## Planned layout

See [architecture §2](../docs/plan/phases/architecture.ko.md#2-리포-구조-최종-형태): role groups `(owner)` / `(sitter)`, `lib/supabase.ts`, `lib/api.ts`, UI kit under `components/ui/`.

## Desktop browsers

On a computer (mouse / trackpad) the app renders inside a **402 × 874 phone frame** at any window width — the same app in a same-origin iframe, so inside it everything behaves like a 402 px phone. Narrow windows keep the frame (scaled down if narrower than the phone). Phone / tablet browsers (touch) and native builds are unchanged. See [architecture D25](../docs/plan/phases/architecture.ko.md) and [DESIGN.md §2.1 · §7.7](../DESIGN.md#21-desktop-browsers-judges-phone-frame).

- `components/shell/` — `AppShell.web.tsx` picks the mode (`presentation.ts`), `DeviceFrame.web.tsx` draws the phone. Screens never import these; use `useShell()` / `useLayoutMode()`.
- Route changes inside the frame are mirrored to the address bar, so refresh and shared links keep the screen.
- `?frame=0` turns the frame off (video recording, debugging); `?frame=1` forces it on.
- Inside the frame the mouse acts like a finger (`TouchEmulation.web.ts`): click = tap, click-drag scrolls with momentum (a drag never taps), the wheel moves chip rows sideways, no text selection or image dragging, hidden scrollbars, round touch cursor. Mouse only — real phones and touch laptops keep native touch.
- Pick photos only through `pickMedia()` (task 4.7) — on desktop it offers built-in sample photos.

## Mouse tests (Playwright)

`/dev/gestures` is a test screen with every touch pattern (long list, chip row, paged photos, rows, modal, toast, input). It only exists when `EXPO_PUBLIC_DEV_ROUTES=1` (set it in `.env` locally; never in production).

```bash
npx playwright install chromium firefox webkit   # once
EXPO_PUBLIC_DEV_ROUTES=1 npx expo export -p web   # PowerShell: $env:EXPO_PUBLIC_DEV_ROUTES="1"; npx expo export -p web
npm run test:e2e
```

Projects: Chromium · Firefox · WebKit × 1366×768 · 1440×900 · 1920×1080 (phone frame + mouse) and a touch phone (no frame, layout at 360 / 402 / 440). CI runs the same suite on every frontend PR. Note: Playwright's Firefox needs the Visual C++ runtime on Windows — run `--project=chromium-*` / `webkit-*` locally if it is missing.
