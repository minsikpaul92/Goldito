# Goldito backend

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

### Docker (deploy image)

```bash
cd backend
docker build -t goldito-backend .
docker run --rm -p 8000:8000 --env-file .env goldito-backend
curl -s http://localhost:8000/health
```

The image holds `app/` only (no `.env`, tests, or scripts). It listens on `$PORT` (default 8000) so hosts like Render can set their own. CI builds the image and checks `/health` on every backend change. Deployed env: everything in `.env.example`, with `CORS_ORIGINS` including the Vercel URL ([env-setup](../docs/plan/env-setup.ko.md)).

## Media upload (Phase 04) — manual check

Needs Cloudinary vars in `.env` and a **sitter** JWT for a pet they are on duty for (`is_on_duty_for`).

1. Get a sitter token (sign in as demo sitter in the app, then from the browser console on the phone frame page):  
   `JSON.parse(localStorage.getItem("goldito-auth")).access_token`
2. Sign:
   ```bash
   curl -s localhost:8000/api/media/sign \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"pet_id":"'$PET_ID'","resource_type":"image","purpose":"feed"}'
   ```
3. Upload to the returned `upload_url` with FormData fields `file`, `api_key`, `timestamp`, `signature`, `folder`, `transformation` (same values as the sign response — `transformation` is signed, so dropping it gives `401 Invalid Signature`). Cloudinary then stores a normalized original: photos `c_limit,w_2000/q_auto`, videos `so_0,du_30/c_limit,w_1280,h_1280/q_auto`. For a trimmed video, pass `trim_start` / `trim_duration` (seconds, duration ≤ 30) on `/sign`; the signed transformation becomes `so_{start},du_{duration}/…` and Cloudinary keeps only that part.
4. Complete:
   ```bash
   curl -s localhost:8000/api/media/complete \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"pet_id":"'$PET_ID'","public_id":"goldito/'$PET_ID'/feed/…","resource_type":"image","purpose":"feed"}'
   ```
5. Confirm a `media` row in Supabase (`cloudinary_public_id`, `purpose`).

Frontend helper: `frontend/lib/cloudinary.ts` → `uploadMedia()` (normalize → sign → Cloudinary → complete). Normalize (`frontend/lib/mediaNormalize.ts`): photos are always resized to a 2000 px long edge (JPEG ~0.8, under 10 MB); videos over 30 s need a trim (`trim` on `uploadMedia`, or `VideoTooLongError` if none).

App pick path: `pickMedia()` (`frontend/lib/media.ts`) opens the sample tray / file dialog / trim sheet via `MediaPickerProvider`. Sitter upload: `/sitter/feed/[petId]` **+ Photo** FAB → `uploadMedia` → `createFeedPost`.

### Images for the model (D12)

`app.services.cloudinary.fetch_as_data_url(public_id, resource_type)` returns the 1024 px JPEG (a video gives its first frame) as `data:image/jpeg;base64,…` for MiniCPM-V. It raises `ValueError` for ids outside `goldito/…` and `MediaFetchError` when Cloudinary cannot deliver the image. It does not check who owns the media — the calling AI route must.

## Auth (who may call what)

**Frontend → Supabase directly with the anon key + RLS** for reads and simple writes. **Frontend → FastAPI with the user's Supabase access token** (`Authorization: Bearer <token>`) for Cloudinary signing, AI, and anything that needs the service role. FastAPI verifies the token first, then may use the service role.

- `app/deps/auth.py` — `verify_supabase_jwt()`: ES256/RS256 tokens are checked against the project JWKS (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, keys cached 10 min); legacy HS256 tokens fall back to `SUPABASE_JWT_SECRET` (architecture D14). Audience must be `authenticated`, issuer `{SUPABASE_URL}/auth/v1`, `exp` and `sub` required. Once every token is ES256 you can clear `SUPABASE_JWT_SECRET` to turn the fallback off.
- `get_current_user` → `CurrentUser(id, email, role, display_name, access_token)`. The role is read from `profiles` with the service role — never from JWT `user_metadata`.
- `require_role("sitter")` → 403 `{"detail": "This action is for sitters.", "code": "forbidden"}` for the other role.
- Errors: no / bad / expired token → 401 `unauthorized`; valid token but no `profiles` row → 403 `forbidden`; JWKS unreachable → 502 `upstream_error`.

`GET /api/me` with a real token (sign in on the web app first; the session is stored under `goldito-auth`):

```bash
# Browser console on http://localhost:8081 (inside the phone frame's page, same origin):
#   JSON.parse(localStorage.getItem("goldito-auth")).access_token
curl -s localhost:8000/api/me -H "Authorization: Bearer $TOKEN"
# → {"id":"…","email":"…","role":"owner","display_name":"…"}
```

## Demo accounts

`scripts/seed_demo.py` creates (or refreshes) the two demo accounts used for testing now and by judges / **Try demo** later:

| Email | Role | Name |
| :--- | :--- | :--- |
| `demo-owner@goldito.test` | owner | Robert |
| `demo-sitter@goldito.test` | sitter | Chloe |

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
