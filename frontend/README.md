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

## Desktop browsers (planned — tasks 1.6–1.7)

On a desktop browser (width ≥ 768) the app renders inside a **402 × 874 phone frame** (same app in a same-origin iframe), and the mouse acts like a finger: click = tap, drag or wheel = scroll. Phone browsers and native builds are unchanged. See [architecture D25](../docs/plan/phases/architecture.ko.md) and [DESIGN.md §2.1 · §7.7](../DESIGN.md#21-desktop-browsers-judges-phone-frame).

- `?frame=0` turns the frame off (video recording, debugging); `?frame=1` forces it on.
- Pick photos only through `pickMedia()` — on desktop it offers built-in sample photos.
