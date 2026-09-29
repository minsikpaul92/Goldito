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
