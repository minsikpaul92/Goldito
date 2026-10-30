# Environment variables (.env) setup

**Source of truth for variable names:** [phases/architecture.md §4](phases/architecture.md#4-environment-variable-master-list)

**Model roles:** [phases/notes/model-ids.md](phases/notes/model-ids.md)

---

## File locations

| File | Use | Git |
| :--- | :--- | :--- |
| `backend/.env` | Supabase **service_role**, Cloudinary **secret**, Nebius, **Tavily** | **Never commit** (gitignore) |
| `frontend/.env` | Supabase URL + **anon(publishable)** , API URL | **Never commit** |
| `backend/.env.example` | Key name template | OK to commit |
| `frontend/.env.example` | Key name template | OK to commit |

The code reads `.env` from Phase 1 on. **If you fill in the values now**, they connect right away after Phase 1.2/1.3.

---

## backend/.env: where to copy from

| Variable | Source |
| :--- | :--- |
| `SUPABASE_URL` | Supabase Connect → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → **service_role** (Secret) |
| `SUPABASE_JWT_SECRET` | Settings → API → JWT → **Legacy JWT Secret** (Phase 3) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary dashboard Product Environment |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | API Keys |
| `NEBIUS_API_KEY` | Nebius Token Factory (inference API) |
| `TAVILY_API_KEY` | [Tavily](https://tavily.com) dashboard. Builders & Brews Toronto **8,000 credits**. Used by the treat check only (FDA pages) |
| `GROQ_API_KEY` | [Groq console](https://console.groq.com) → API keys. Speech to text for voice input in onboarding (`whisper-large-v3-turbo`, free plan); `GROQ_STT_MODEL` can override the model. |
| `MODEL_*` and `MODEL_*_BASE_URL` | Which model each role uses (`MODEL_FAST`, `MODEL_REPORT`, `MODEL_SAFETY`, `MODEL_VISION`, `MODEL_CHAT_OWNER` · `MODEL_CHAT_SITTER` · `MODEL_CHAT_CHIPS`, `MODEL_EMBED` + `MODEL_EMBED_DIM`). The defaults in `backend/.env.example` are the ones we run; the roles and the reason for each are in [model-ids.md](phases/notes/model-ids.md). Vision, fast and embeddings use the global Token Factory URL, safety and report use us-central1 |
| `DEMO_PASSWORD` | A demo-only value, the same as `EXPO_PUBLIC_DEMO_PASSWORD`; `scripts/seed_demo.py` sets it on the demo accounts |
| `DISCORD_BOT_TOKEN` | Only for the Discord MCP in Claude Code (QA channel); the API never reads it |

### Deployed backend: Render (U0, 2026-10-09)

**Address: https://goldito-backend.onrender.com** (`/health` → `{"status":"ok"}`). The backend runs **only on the Render free plan**. **We do not use Nebius AI Cloud (Serverless Endpoint · Jobs)** (D18, decided 2026-10-09: card registration + $25 prepayment, no event credits, about $128 if kept on until 12/15). AI is still called through **Nebius Token Factory**.

> ⚠️ **Render free sleeps after 15 minutes with no requests** (after that, the first request takes 30 to 50 seconds, and a judge sees the first screen as stuck). So **a `/health` ping must run every 10 minutes (within 15 minutes at the latest)**. **Before any deploy, test, or demo recording work, first check that the ping is alive:**
> 1. GitHub → **Actions → keepalive**: the latest runs are green, and the gap between runs is not more than 15 minutes (GitHub's scheduled runs are a few minutes late or sometimes skipped)
> 2. If you use the external ping service (below), its dashboard status and response time
> 3. After about 30 minutes with nobody using it, `curl -w "%{time_total}" https://goldito-backend.onrender.com/health`: under 1 second means awake, 30 seconds or more means the ping is not running
>
> **External ping (in use, 2026-10-09):** GitHub cron can be a few minutes late or skip runs, so we set a second ping on **cron-job.org**: **`Goldito Keepalive`** in Minsik's account (the same account also has another project, PairPocket Keepalive): `GET https://goldito-backend.onrender.com/health`, **every 10 minutes** (`*/10 * * * *`, America/Toronto), timeout 30 seconds, no end date (kept until 12/15), email alert on failure. To check: console.cron-job.org → Dashboard → Last Events shows `Successful (200 OK)`.
>
> **Keeping Supabase from pausing (10.7):** Supabase free pauses a project after 7 idle days. `GET /health/deep` reads one row from Supabase (503 if that fails), and `keepalive.yml` calls it **once a day** (06:17 UTC). `/health` stays a light ping that does not touch Supabase. Manual check: `curl -fsS https://goldito-backend.onrender.com/health/deep` → `{"status":"ok","database":"ok"}`.

| Render setting | Value |
| :--- | :--- |
| Service | Web Service · GitHub `minsikpaul92/Goldito` · Branch `main` · **Root Directory `backend`** · Language **Docker** · Region Ohio · Instance **Free** |
| Deploy | **Auto-Deploy On Commit**: a merge to main makes Render rebuild from the Dockerfile (with `backend/**` in Build Filters, only when the backend changes) · Health Check Path `/health` |
| Environment variables | Paste `backend/.env` with **Add from .env** and change only the three lines below. Do not add `PORT` (Render sets it; the image reads `$PORT`). No Secret Files |
| Sleep | The free plan **sleeps after 15 minutes with no requests, and the first request takes 30 to 50 seconds**. `.github/workflows/keepalive.yml` calls `/health` every 10 minutes to keep it awake (750 free hours a month = 1 service around the clock) |

| Variable (deployed backend) | Value |
| :--- | :--- |
| `APP_ENV` | `production` |
| `CORS_ORIGINS` | `https://goldito-petcare.vercel.app` (Preview `*-git-*.vercel.app` is blocked, so check uploads and AI on main (Production)) |
| `DEMO_RESET_ENABLED` | `1` only during the test period (Profile → Demo tools). **`0` before judging** (#406) |
| `CRON_SECRET` | A long random string. The secret header value that calls the **booking stage sweep** (BS-2). If it is empty, `POST /api/sweep/bookings` returns 404 (pretends not to exist). See "Booking stage sweep" below |

After you change a value, check Render → Environment → Save → **Manual Deploy** (or the automatic restart on save).

---

## frontend/.env: where to copy from

| Variable | Source |
| :--- | :--- |
| `EXPO_PUBLIC_SUPABASE_URL` | The **same** Project URL as the backend |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Connect → **Publishable** / Settings → API → **anon** |
| `EXPO_PUBLIC_API_URL` | Local: `http://localhost:8000` · production (Vercel): `https://goldito-backend.onrender.com` |
| `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `EXPO_PUBLIC_APP_TIMEZONE` | `America/Toronto` |
| `EXPO_PUBLIC_DEMO_PASSWORD` | The same demo-only value as the backend's `DEMO_PASSWORD` (the Try the demo buttons sign in with it) |
| `EXPO_PUBLIC_ADMIN_EMAILS` | Team emails (comma separated) who may edit a pet's look. Empty = nobody |

**Do not put** **service_role**, the Cloudinary secret, the Nebius key, or **TAVILY_API_KEY** in the frontend.

### Vercel (frontend deploy: 10.4 moved up to 2026-10-02)

**Production address: https://goldito-petcare.vercel.app**. Manual tests always happen here, on `main`.

The build settings live in [`frontend/vercel.json`](../../frontend/vercel.json): `npm ci` → `npx expo export -p web` → `dist/`, every path → `index.html` (refresh and deep links), `Content-Security-Policy: frame-ancestors 'self'` (the desktop phone frame is a same-domain iframe, so no `X-Frame-Options: DENY`, D25).

1. Vercel → **Add New → Project** → Import GitHub `minsikpaul92/Goldito` (for a project linked under the old name `Pawddy`, GitHub hands it over to the new name, so there is no need to reconnect)
2. **Root Directory = `frontend`** (vercel.json overrides the Framework Preset: "Other")
3. **Environment Variables** (both Production and Preview):

| Variable | Value |
| :--- | :--- |
| `EXPO_PUBLIC_SUPABASE_URL` · `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Same as the local `frontend/.env` (anon/publishable only) |
| `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` · `EXPO_PUBLIC_APP_TIMEZONE` | The cloud name · `America/Toronto` |
| `EXPO_PUBLIC_DEMO_PASSWORD` | Demo account password (a demo-only value) |
| `EXPO_PUBLIC_API_URL` | `https://goldito-backend.onrender.com` (U0, 2026-10-09). If it is empty, uploads, AI, and demo reset do not work |
| `EXPO_PUBLIC_DEMO_TOOLS` | `1` only during the test period (together with the backend `DEMO_RESET_ENABLED=1`: Profile → Demo tools). **Remove before judging** |
| `EXPO_PUBLIC_DEV_ROUTES` | **Do not set** (dev screens are for local and CI only) |

> **Set Type to Config.** Vercel **does not allow Secret** for variables with a public prefix like `EXPO_PUBLIC_` (editing one gives the error "cannot use `visibility: secret`"). These values go into the bundle and are visible in the browser anyway, so Config is right. Variables made as Secret earlier still work but **cannot be edited, so to change one, delete it and add it again as Config** (2026-10-09: `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SUPABASE_URL` were remade this way).

4. Deploy → main = Production, other branches and PRs = Preview URL (PR comment). `EXPO_PUBLIC_*` goes into the bundle **at build time**, so Redeploy after you change a value.
5. Supabase uses password sign-in only, so the Auth URL setting is not required (if we start using mail links or OAuth, add the Vercel domain under Authentication → URL Configuration).

---

## Google Meet (3B.11, D45): backend only

The video Meet & Greet link comes from a Calendar event that the **Goldito Google account** creates. Do the steps below once (if the values are empty, the app works with the time + .ics only).

1. In the Google Cloud project, enable the **Google Calendar API** and the **Google Meet REST API** (APIs & Services → Library). The Meet REST API is used to open the room as "anyone with the link can join right away". The guests (sitter and owner) are not hosts, so without it they get stuck at "Please wait until the host lets you in"
2. **OAuth consent screen** (Google Auth Platform) → Get started: App name `Goldito`, support email, **Audience = External**, contact email → Create
3. **Data Access** → Add or remove scopes → add `https://www.googleapis.com/auth/calendar.events` and `https://www.googleapis.com/auth/meetings.space.settings` → Save
4. **Audience** → Publishing status **Publish app** → **In production** (in Testing, the refresh token expires after 7 days). The "Google hasn't verified this app" warning is fine, because only our one account uses it
5. **Clients** (or Credentials → Create credentials → OAuth client ID) → **Web application**, name `Goldito backend`, Authorized redirect URI `https://developers.google.com/oauthplayground` → Create → copy the **Client ID / Client secret**
6. [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) → ⚙️ at the top right → check **Use your own OAuth credentials** → paste the ID / secret → in Step 1 enter both scopes together, `https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/meetings.space.settings` → **Authorize APIs** → sign in with **the Goldito Google account that will create the events** → (warning) Advanced → Go to Goldito → Allow → Step 2 **Exchange authorization code for tokens** → copy the **Refresh token**
7. `backend/.env` (for the deployed backend, Render → Environment): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` (+ `GOOGLE_CALENDAR_ID=primary`, `MEET_INVITE_ATTENDEES=true`). Keep the three values in a password manager, and never put them in the frontend

---

## Booking stage sweep (BS-2, 011l): cron-job.org

The DB function `sweep_stale_bookings()` does this job: if there is still no meeting time 2 days after the first agreement ("Yes, let's meet"), it notifies both sides, and if there is still no answer 3 days after that notice, it cancels automatically. What calls it every 15 minutes is the backend `POST /api/sweep/bookings` (`pg_cron` is not used: it is not in the CI image, and we did not check hosting support).

1. Add `CRON_SECRET` (a long random value) in Render → Environment.
2. New job on cron-job.org, `Goldito Booking Sweep`: `POST https://goldito-backend.onrender.com/api/sweep/bookings`, header `X-Cron-Secret: <same value>`, **every 15 minutes**, timeout 60 seconds (the first request may wake a sleeping Render).
3. Check: without the header it returns 404; called correctly it returns 200 with `{"stalled":N,"cancelled":M}`. Because the cycle is 15 minutes, a timeout is handled not exactly on day 5 but within up to 15 minutes after that.

## Team sharing (without 1Password)

- **Supabase / Cloudinary:** dashboard **team invite**
- **Nebius / Tavily:** each person gets their own key, or Bitwarden Send / Signal 1:1
- **Never upload a whole `.env` file** to Discord or Drive

---

## Quick check

- [ ] `backend/.env` Supabase + Cloudinary + Nebius (+ Tavily and Groq if you have the keys)
- [ ] `frontend/.env` URL + anon (+ cloud name)
- [ ] Back up secrets only in a keychain or password app
