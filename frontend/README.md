# PawNote frontend

Expo (React Native Web) with **expo-router**, TypeScript, npm.

**Monorepo layout (Phase 1.1):** this directory holds `.env.example` and will gain `app/`, `lib/`, `theme/`, and `components/ui/` in Phase **1.3**.

## Environment

1. Copy [`.env.example`](.env.example) → `.env` if needed.
2. Only **public** keys (`EXPO_PUBLIC_*`). Never put service role, Cloudinary secret, or Nebius keys here.
3. For Phase 1.3 health check: `EXPO_PUBLIC_API_URL=http://localhost:8000`

Details: [docs/plan/env-setup.ko.md](../docs/plan/env-setup.ko.md)

## Run (after Phase 1.3)

```bash
cd frontend
npm install
npx expo start --web
```

Use **Check API** on the home screen to verify the backend `/health` endpoint.

## Planned layout

See [architecture §2](../docs/plan/phases/architecture.ko.md#2-리포-구조-최종-형태): role groups `(owner)` / `(sitter)`, `lib/supabase.ts`, `lib/api.ts`, UI kit under `components/ui/`.
