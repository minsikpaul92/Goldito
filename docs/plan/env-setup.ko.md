# 환경 변수 (.env) 설정

**변수 이름의 기준:** [phases/architecture.ko.md §4](phases/architecture.ko.md#4-환경-변수-마스터-목록)

**Tavily:** [tavily.ko.md](tavily.ko.md) · **모델 역할:** [phases/notes/model-ids.md](phases/notes/model-ids.md) · **온보딩:** [onboarding.ko.md](onboarding.ko.md) · **Devpost:** [../hackathon/devpost-submission.ko.md](../hackathon/devpost-submission.ko.md)

---

## 파일 위치

| 파일 | 용도 | Git |
| :--- | :--- | :--- |
| `backend/.env` | Supabase **service_role**, Cloudinary **secret**, Nebius, **Tavily** | **커밋 금지** (gitignore) |
| `frontend/.env` | Supabase URL + **anon(publishable)** , API URL | **커밋 금지** |
| `backend/.env.example` | 키 이름 템플릿 | 커밋 OK |
| `frontend/.env.example` | 키 이름 템플릿 | 커밋 OK |

코드는 Phase 1부터 `.env`를 읽습니다. **지금 값만 채워 두면** Phase 1.2/1.3 이후 바로 연결됩니다.

---

## backend/.env — 어디서 복사하나

| 변수 | 출처 |
| :--- | :--- |
| `SUPABASE_URL` | Supabase Connect → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → **service_role** (Secret) |
| `SUPABASE_JWT_SECRET` | Settings → API → JWT → **Legacy JWT Secret** (Phase 3) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary 대시보드 Product Environment |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | API Keys |
| `NEBIUS_API_KEY` | Nebius Token Factory (추론 API) |
| `TAVILY_API_KEY` | [Tavily](https://tavily.com) 대시보드 — [tavily.ko.md](tavily.ko.md). Builders & Brews Toronto **8,000 credits** |

### 배포된 백엔드 — Render (U0, 2026-10-09)

**주소: https://goldito-backend.onrender.com** (`/health` → `{"status":"ok"}`). 백엔드는 **Render 무료 플랜**에서만 돌립니다 — **Nebius AI Cloud(Serverless Endpoint · Jobs)는 쓰지 않습니다** (D18, 2026-10-09 결정: 카드 등록 + $25 선결제, 행사 크레딧 없음, 12/15까지 켜 두면 약 $128). AI는 그대로 **Nebius Token Factory**로 부릅니다.

> ⚠️ **Render 무료는 15분 동안 요청이 없으면 잠듭니다** (그 뒤 첫 요청 30~50초 — 심사위원이 첫 화면에서 멈춘 것처럼 봄). 그래서 **10분마다(늦어도 15분 안에) `/health` 핑이 꼭 돌아야** 합니다. **배포 · 테스트 · 데모 녹화 작업 전에 핑이 살아 있는지 먼저 확인하세요:**
> 1. GitHub → **Actions → keepalive** — 최근 실행이 초록이고, 실행 간격이 15분을 넘지 않는지 (GitHub의 예약 실행은 몇 분씩 늦거나 가끔 건너뜀)
> 2. 외부 핑 서비스(아래)를 쓰면 그 대시보드의 상태 · 응답 시간
> 3. 30분쯤 아무도 안 쓴 뒤 `curl -w "%{time_total}" https://goldito-backend.onrender.com/health` — 1초 안이면 깨어 있음, 30초 이상이면 핑이 안 돌고 있음
>
> **외부 핑 (선택, 권장):** GitHub cron만으로는 간격이 벌어질 수 있어 무료 모니터링 서비스를 하나 더 붙이면 안전합니다 — 예: **UptimeRobot**(무료 HTTP 모니터 5분 간격) 또는 **cron-job.org**(무료 cron 1분 단위). URL은 `https://goldito-backend.onrender.com/health`, 간격 5~10분. 계정은 사람이 만듭니다.

| Render 설정 | 값 |
| :--- | :--- |
| 서비스 | Web Service · GitHub `minsikpaul92/Goldito` · Branch `main` · **Root Directory `backend`** · Language **Docker** · Region Ohio · Instance **Free** |
| 배포 | **Auto-Deploy On Commit** — main에 머지하면 Render가 Dockerfile로 다시 빌드 (Build Filters에 `backend/**`를 넣으면 백엔드가 바뀔 때만) · Health Check Path `/health` |
| 환경변수 | **Add from .env**로 `backend/.env`를 붙여넣고 아래 세 줄만 다르게. `PORT`는 넣지 않음(Render가 정함, 이미지가 `$PORT`를 읽음). Secret Files는 안 씀 |
| 잠듦 | 무료 플랜은 **15분 동안 요청이 없으면 잠들고 첫 요청이 30~50초**. `.github/workflows/keepalive.yml`이 10분마다 `/health`를 불러 깨워 둠 (월 750시간 무료 = 서비스 1개 24시간) |

| 변수 (배포된 백엔드) | 값 |
| :--- | :--- |
| `APP_ENV` | `production` |
| `CORS_ORIGINS` | `https://goldito-petcare.vercel.app` (Preview `*-git-*.vercel.app`는 막힘 — 업로드 · AI 확인은 main(Production)에서) |
| `DEMO_RESET_ENABLED` | 테스트 기간에만 `1` (Profile → Demo tools). **심사 전에 `0`** — TODO "Demo accounts for judging" |

값을 바꾸면 Render → Environment → Save → **Manual Deploy**(또는 저장 시 자동 재시작)를 확인합니다.

---

## frontend/.env — 어디서 복사하나

| 변수 | 출처 |
| :--- | :--- |
| `EXPO_PUBLIC_SUPABASE_URL` | backend와 **동일** Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Connect → **Publishable** / Settings → API → **anon** |
| `EXPO_PUBLIC_API_URL` | 로컬: `http://localhost:8000` · 프로덕션(Vercel): `https://goldito-backend.onrender.com` |
| `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `EXPO_PUBLIC_APP_TIMEZONE` | `America/Toronto` |

**service_role**, Cloudinary secret, Nebius key, **TAVILY_API_KEY**는 frontend에 **넣지 마세요.**

### Vercel (frontend 배포 — 10.4를 2026-10-02에 앞당김)

**Production 주소: https://goldito-petcare.vercel.app** — 수동 테스트는 항상 여기서 `main`으로 합니다 ([test-run.ko.md](test-run.ko.md) §0).

빌드 설정은 [`frontend/vercel.json`](../../frontend/vercel.json)에 있습니다: `npm ci` → `npx expo export -p web` → `dist/`, 모든 경로 → `index.html` (새로고침·딥링크), `Content-Security-Policy: frame-ancestors 'self'` (데스크톱 폰 프레임이 같은 도메인 iframe — `X-Frame-Options: DENY` 금지, D25).

1. Vercel → **Add New → Project** → GitHub `minsikpaul92/Goldito` Import (옛 이름 `Pawddy`로 연결된 프로젝트는 GitHub이 새 이름으로 넘겨 줌 — 다시 연결할 필요 없음)
2. **Root Directory = `frontend`** (Framework Preset은 vercel.json이 덮어씀 — "Other")
3. **Environment Variables** (Production · Preview 둘 다):

| 변수 | 값 |
| :--- | :--- |
| `EXPO_PUBLIC_SUPABASE_URL` · `EXPO_PUBLIC_SUPABASE_ANON_KEY` | 로컬 `frontend/.env`와 동일 (anon/publishable만) |
| `EXPO_PUBLIC_APP_TIMEZONE` | `America/Toronto` |
| `EXPO_PUBLIC_DEMO_PASSWORD` | 데모 계정 비밀번호 (데모 전용 값) |
| `EXPO_PUBLIC_API_URL` | `https://goldito-backend.onrender.com` (U0, 2026-10-09). 비어 있으면 업로드 · AI · 데모 리셋이 안 됨 |
| `EXPO_PUBLIC_DEMO_TOOLS` | 테스트 기간에만 `1` (백엔드 `DEMO_RESET_ENABLED=1`과 함께 — Profile → Demo tools). **심사 전에 지움** |
| `EXPO_PUBLIC_DEV_ROUTES` | **설정하지 않음** (dev 화면은 로컬·CI만) |

> **Type은 Config로.** Vercel은 `EXPO_PUBLIC_`처럼 공개 접두사가 붙은 변수에 **Secret을 허용하지 않습니다** (수정하면 "cannot use `visibility: secret`" 오류). 어차피 번들에 들어가 브라우저에서 보이는 값이라 Config가 맞습니다. 예전에 Secret으로 만든 변수는 그대로 동작하지만 **수정할 수 없으니, 바꿀 때는 지우고 Config로 다시 추가**합니다 (2026-10-09: `EXPO_PUBLIC_API_URL` · `EXPO_PUBLIC_SUPABASE_URL`을 이렇게 다시 만듦).

4. Deploy → main = Production, 다른 브랜치·PR = Preview URL (PR 코멘트). `EXPO_PUBLIC_*`는 **빌드 시점**에 번들에 들어가므로 값을 바꾸면 Redeploy.
5. Supabase는 비밀번호 로그인만 쓰므로 Auth URL 설정은 필수 아님 (메일 링크·OAuth를 쓰게 되면 Authentication → URL Configuration에 Vercel 도메인 추가).

---

## Google Meet (3B.11, D45) — backend만

영상 Meet & Greet 링크는 **Goldito Google 계정**이 Calendar 이벤트를 만들어 생깁니다. 아래를 한 번만 하면 됩니다 (값이 비어 있으면 앱은 시각 + .ics로만 동작).

1. Google Cloud 프로젝트에서 **Google Calendar API** 사용 설정 (APIs & Services → Library)
2. **OAuth consent screen** (Google Auth Platform) → Get started: App name `Goldito`, support email, **Audience = External**, contact email → Create
3. **Data Access** → Add or remove scopes → `https://www.googleapis.com/auth/calendar.events` 추가 → Save
4. **Audience** → Publishing status **Publish app** → **In production** (Testing이면 refresh token이 7일 뒤 만료). "Google hasn't verified this app" 경고는 우리 계정 하나만 쓰므로 괜찮음
5. **Clients** (또는 Credentials → Create credentials → OAuth client ID) → **Web application**, 이름 `Goldito backend`, Authorized redirect URI `https://developers.google.com/oauthplayground` → Create → **Client ID / Client secret** 복사
6. [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) → 오른쪽 위 ⚙️ → **Use your own OAuth credentials** 체크 → ID / secret 붙여넣기 → Step 1에 `https://www.googleapis.com/auth/calendar.events` 입력 → **Authorize APIs** → **이벤트를 만들 Goldito Google 계정**으로 로그인 → (경고) Advanced → Go to Goldito → Allow → Step 2 **Exchange authorization code for tokens** → **Refresh token** 복사
7. `backend/.env` (배포된 백엔드는 Render → Environment): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` (+ `GOOGLE_CALENDAR_ID=primary`, `MEET_INVITE_ATTENDEES=true`). 세 값은 비밀번호 관리자에 보관 — frontend에는 절대 넣지 않음

---

## 팀 공유 (1Password 없이)

- **Supabase / Cloudinary:** 대시보드 **팀 초대**
- **Nebius / Tavily:** 각자 키 발급 또는 Bitwarden Send / Signal 1:1
- **`.env` 파일 통째로** Discord·Drive 업로드 금지

---

## 빠른 체크

- [ ] `backend/.env` Supabase + Cloudinary + Nebius (+ Tavily 키 있으면)
- [ ] `frontend/.env` URL + anon (+ cloud name)
- [ ] Secret은 키체인/비밀번호 앱에만 백업
