# 환경 변수 (.env) 설정

**변수 이름의 기준:** [phases/architecture.ko.md §4](phases/architecture.ko.md#4-환경-변수-마스터-목록)

## 파일 위치

| 파일 | 용도 | Git |
| :--- | :--- | :--- |
| `backend/.env` | Supabase **service_role**, Cloudinary **secret**, Nebius, Tavily | **커밋 금지** (gitignore) |
| `frontend/.env` | Supabase URL + **anon(publishable)** , API URL | **커밋 금지** |
| `backend/.env.example` | 키 이름 템플릿 | 커밋 OK |
| `frontend/.env.example` | 키 이름 템플릿 | 커밋 OK |

코드는 아직 Phase 1에서 붙습니다. **지금은 값만 채워 두면** Phase 1.2/1.3에서 바로 읽습니다.

---

## backend/.env — 어디서 복사하나

| 변수 | 출처 |
| :--- | :--- |
| `SUPABASE_URL` | Supabase Connect → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → **service_role** (Secret) |
| `SUPABASE_JWT_SECRET` | Settings → API → JWT → **Legacy JWT Secret** |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary 대시보드 Product Environment |
| `CLOUDINARY_API_KEY` | API Keys |
| `CLOUDINARY_API_SECRET` | API Keys (Secret) |
| `NEBIUS_API_KEY` | Nebius Token Factory (슬기 · Phase 0.3) |
| `TAVILY_API_KEY` | (선택) Tavily |

---

## frontend/.env — 어디서 복사하나

| 변수 | 출처 |
| :--- | :--- |
| `EXPO_PUBLIC_SUPABASE_URL` | backend와 **동일** Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Connect → **Publishable** / Settings → API → **anon** |
| `EXPO_PUBLIC_API_URL` | 로컬 FastAPI — 기본 `http://localhost:8000` 유지 |

**service_role은 frontend에 넣지 마세요.**

---

## 빠른 체크

- [ ] `backend/.env` Supabase 3개 + Cloudinary 3개 채움  
- [ ] `frontend/.env` URL + anon 채움  
- [ ] Apple Passwords에 service_role / API Secret 백업  
