# PawNote backend

FastAPI (Python 3.12): Cloudinary signing, JWT-protected routes, Nemotron via Nebius Token Factory.

**Backend API (Phase 1.2+):** FastAPI app under `app/`, `requirements.txt`, `tests/`.

## Environment

1. Copy [`.env.example`](.env.example) → `.env` (gitignored).
2. Variable names match [architecture §4](../docs/plan/phases/architecture.ko.md#4-환경-변수-마스터-목록).
3. Secrets setup: [docs/plan/env-setup.ko.md](../docs/plan/env-setup.ko.md).

## Run

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
curl -s http://localhost:8000/health
pytest -q   # auth tests use their own test keys — no real project needed
```

Default port **8000**. Set `CORS_ORIGINS` to include Expo web (`http://localhost:8081`, `http://localhost:19006`).

## Auth (who may call what)

**Frontend → Supabase directly with the anon key + RLS** for reads and simple writes. **Frontend → FastAPI with the user's Supabase access token** (`Authorization: Bearer <token>`) for Cloudinary signing, AI, and anything that needs the service role. FastAPI verifies the token first, then may use the service role.

- `app/deps/auth.py` — `verify_supabase_jwt()`: ES256/RS256 tokens are checked against the project JWKS (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, keys cached 10 min); legacy HS256 tokens fall back to `SUPABASE_JWT_SECRET` (architecture D14). Audience must be `authenticated`, issuer `{SUPABASE_URL}/auth/v1`, `exp` and `sub` required. Once every token is ES256 you can clear `SUPABASE_JWT_SECRET` to turn the fallback off.
- `get_current_user` → `CurrentUser(id, email, role, display_name, access_token)`. The role is read from `profiles` with the service role — never from JWT `user_metadata`.
- `require_role("sitter")` → 403 `{"detail": "This action is for sitters.", "code": "forbidden"}` for the other role.
- Errors: no / bad / expired token → 401 `unauthorized`; valid token but no `profiles` row → 403 `forbidden`; JWKS unreachable → 502 `upstream_error`.

`GET /api/me` with a real token (sign in on the web app first; the session is stored under `pawnote-auth`):

```bash
# Browser console on http://localhost:8081 (inside the phone frame's page, same origin):
#   JSON.parse(localStorage.getItem("pawnote-auth")).access_token
curl -s localhost:8000/api/me -H "Authorization: Bearer $TOKEN"
# → {"id":"…","email":"…","role":"owner","display_name":"…"}
```

## Demo accounts

`scripts/seed_demo.py` creates (or refreshes) the two demo accounts used for testing now and by judges / **Try demo** later:

| Email | Role | Name |
| :--- | :--- | :--- |
| `demo-owner@pawnote.test` | owner | Jisoo |
| `demo-sitter@pawnote.test` | sitter | Mina |

The password is `DEMO_PASSWORD` in `backend/.env` (same value as `EXPO_PUBLIC_DEMO_PASSWORD` in `frontend/.env`). It is a demo-only value that will be shared with judges — never reuse a real password. `.test` addresses never receive mail.

```bash
cd backend
.venv/Scripts/python -m scripts.seed_demo          # create / refresh (Windows; macOS/Linux: .venv/bin/python)
.venv/Scripts/python -m scripts.seed_demo --check  # read-only report
```

It uses the Admin API with the service role (architecture D19); the signup trigger creates `profiles` + `owner_profiles` / `sitter_profiles`, and the script checks those rows. Pets, bookings, and tasks join it in Phase 10.1.

## Supabase service role usage

The service role key bypasses RLS. FastAPI uses it only for the writes below, and must call `services/authz.py` → `assert_on_duty_for(pet_id)` (or an equivalent ownership check) first. Everything else goes through the Supabase client with the user's JWT.

`assert_on_duty_for` must call `rpc('is_on_duty_for', {'pet': pet_id})` **with the user's JWT** — under the service role `auth.uid()` is null, so the helper would always return false. Read the caller's role from `profiles`, not from JWT `user_metadata` (users can edit their metadata).

| Table | Operation | Why not the client |
| :--- | :--- | :--- |
| `media` | insert | Created after Cloudinary signed upload completes (Phase 04) |
| `daily_reports` | insert / upsert draft | AI draft generated server-side (Phase 07) |
| `safety_checks` | insert | AI result generated server-side (Phase 08) |
| any | select | Building AI prompt inputs (tasks, feed, allergies) for the on-duty sitter |

Policies and grants: [`supabase/migrations/002_rls_policies.sql`](../supabase/migrations/002_rls_policies.sql).

## Planned layout

See [architecture §2](../docs/plan/phases/architecture.ko.md#2-리포-구조-최종-형태): `app/main.py`, `routers/`, `services/nebius.py`, `ai/prompts/`, etc.
