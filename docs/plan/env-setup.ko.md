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

**배포 (Phase 10):** Nebius **AI Cloud Serverless Endpoint** URL·시크릿은 GitHub Actions secrets 또는 Nebius 콘솔에 두고, 로컬 `.env`의 `EXPO_PUBLIC_API_URL`만 프로덕션 URL로 바꿉니다.

---

## frontend/.env — 어디서 복사하나

| 변수 | 출처 |
| :--- | :--- |
| `EXPO_PUBLIC_SUPABASE_URL` | backend와 **동일** Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Connect → **Publishable** / Settings → API → **anon** |
| `EXPO_PUBLIC_API_URL` | 로컬: `http://localhost:8000` · 프로덕션: **Nebius AI Cloud Endpoint** URL |
| `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `EXPO_PUBLIC_APP_TIMEZONE` | `America/Toronto` |

**service_role**, Cloudinary secret, Nebius key, **TAVILY_API_KEY**는 frontend에 **넣지 마세요.**

---

## Google Meet (3B.11, D45) — backend만

영상 Meet & Greet 링크는 **PawNote Google 계정**이 Calendar 이벤트를 만들어 생깁니다. 아래를 한 번만 하면 됩니다 (값이 비어 있으면 앱은 시각 + .ics로만 동작).

1. Google Cloud 프로젝트에서 **Google Calendar API** 사용 설정 (APIs & Services → Library)
2. **OAuth consent screen** (Google Auth Platform) → Get started: App name `PawNote`, support email, **Audience = External**, contact email → Create
3. **Data Access** → Add or remove scopes → `https://www.googleapis.com/auth/calendar.events` 추가 → Save
4. **Audience** → Publishing status **Publish app** → **In production** (Testing이면 refresh token이 7일 뒤 만료). "Google hasn't verified this app" 경고는 우리 계정 하나만 쓰므로 괜찮음
5. **Clients** (또는 Credentials → Create credentials → OAuth client ID) → **Web application**, 이름 `PawNote backend`, Authorized redirect URI `https://developers.google.com/oauthplayground` → Create → **Client ID / Client secret** 복사
6. [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) → 오른쪽 위 ⚙️ → **Use your own OAuth credentials** 체크 → ID / secret 붙여넣기 → Step 1에 `https://www.googleapis.com/auth/calendar.events` 입력 → **Authorize APIs** → **이벤트를 만들 PawNote Google 계정**으로 로그인 → (경고) Advanced → Go to PawNote → Allow → Step 2 **Exchange authorization code for tokens** → **Refresh token** 복사
7. `backend/.env` (배포 후에는 Nebius Endpoint env): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` (+ `GOOGLE_CALENDAR_ID=primary`, `MEET_INVITE_ATTENDEES=true`). 세 값은 비밀번호 관리자에 보관 — frontend에는 절대 넣지 않음

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
