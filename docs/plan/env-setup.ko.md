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

### Vercel (frontend 배포 — 10.4를 2026-10-02에 앞당김)

빌드 설정은 [`frontend/vercel.json`](../../frontend/vercel.json)에 있습니다: `npm ci` → `npx expo export -p web` → `dist/`, 모든 경로 → `index.html` (새로고침·딥링크), `Content-Security-Policy: frame-ancestors 'self'` (데스크톱 폰 프레임이 같은 도메인 iframe — `X-Frame-Options: DENY` 금지, D25).

1. Vercel → **Add New → Project** → GitHub `minsikpaul92/PawNote` Import
2. **Root Directory = `frontend`** (Framework Preset은 vercel.json이 덮어씀 — "Other")
3. **Environment Variables** (Production · Preview 둘 다):

| 변수 | 값 |
| :--- | :--- |
| `EXPO_PUBLIC_SUPABASE_URL` · `EXPO_PUBLIC_SUPABASE_ANON_KEY` | 로컬 `frontend/.env`와 동일 (anon/publishable만) |
| `EXPO_PUBLIC_APP_TIMEZONE` | `America/Toronto` |
| `EXPO_PUBLIC_DEMO_PASSWORD` | 데모 계정 비밀번호 (데모 전용 값) |
| `EXPO_PUBLIC_API_URL` | 백엔드 배포 전(3B.11 직전까지)에는 비워 둠 — 지금 앱 화면은 Supabase만 씀 |
| `EXPO_PUBLIC_DEV_ROUTES` | **설정하지 않음** (dev 화면은 로컬·CI만) |

4. Deploy → main = Production, 다른 브랜치·PR = Preview URL (PR 코멘트). `EXPO_PUBLIC_*`는 **빌드 시점**에 번들에 들어가므로 값을 바꾸면 Redeploy.
5. Supabase는 비밀번호 로그인만 쓰므로 Auth URL 설정은 필수 아님 (메일 링크·OAuth를 쓰게 되면 Authentication → URL Configuration에 Vercel 도메인 추가).

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
