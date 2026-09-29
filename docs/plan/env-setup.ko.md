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

## 팀 공유 (1Password 없이)

- **Supabase / Cloudinary:** 대시보드 **팀 초대**
- **Nebius / Tavily:** 각자 키 발급 또는 Bitwarden Send / Signal 1:1
- **`.env` 파일 통째로** Discord·Drive 업로드 금지

---

## 빠른 체크

- [ ] `backend/.env` Supabase + Cloudinary + Nebius (+ Tavily 키 있으면)
- [ ] `frontend/.env` URL + anon (+ cloud name)
- [ ] Secret은 키체인/비밀번호 앱에만 백업
