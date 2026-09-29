# Phase 03 — 인증 & 역할 & Dog 프로필 (Auth)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D14–D16, 라우트 맵 §3

## Goal

**이메일/비밀번호 Supabase Auth**로 가입·로그인하고, `profiles.role`에 따라 **Owner / Sitter 탭 레이아웃**으로 분기한다. Owner는 **dog 프로필(알레르기 포함)을 만들고 sitter를 이메일로 배정**할 수 있어, 이후 Phase가 수동 SQL 없이 진행된다. FastAPI는 **Bearer JWT**로 `/api/me`를 보호한다.

### Goal 달성 기준

- [ ] owner 1, sitter 1 가입·로그인 성공, 새로고침 후 세션 유지
- [ ] 역할별 다른 탭 레이아웃 (Owner: Home·Feed·Care·Reports / Sitter: Today·Tasks·Scan·Report — 미구현 탭은 EmptyState 스텁)
- [ ] Owner: dog "Bori" 생성 + 알레르기 `chicken` + sitter 이메일 배정 → Sitter Today에 Bori 표시
- [ ] `curl -H "Authorization: Bearer <access_token>" /api/me` → 200 + role

---

## 선행 조건

- [Phase 02](phase-02.md) profiles 트리거, RLS, `assign_sitter`

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| Login, SignUp(role 1회 선택), session persist (web localStorage) | 소셜 로그인, MFA, 비밀번호 재설정 |
| 역할 route group + 탭 스텁 + 헤더(역할 라벨, 로그아웃, 벨 자리) | 알림 센터 동작 (Phase 05) |
| Owner dog 생성/수정 + 알레르기 chips + sitter 배정 | dog 사진(avatar) (P1) |
| FastAPI `get_current_user`, `require_role` | 전체 API 프록시 (B안) |
| `components/ui`: EmptyState, Skeleton, Toast(ToastProvider) | |

---

## 작업 상세

| ID | 작업 | 상세 | DoD |
| :--- | :--- | :--- | :--- |
| 3.1 | Auth screens | `app/(auth)/login.tsx`, `signup.tsx`. `lib/supabase.ts` (anon key, `persistSession:true`). Supabase 에러 → 사람 문구 ("Wrong email or password") | 가입·로그인 |
| 3.2 | Signup role | `signUp({email, password, options:{data:{role, display_name}}})` → 트리거가 profiles 생성 (클라이언트 insert 없음, D15). Role 선택 UI: 큰 카드 2개 "I'm a dog owner" / "I'm a pet sitter" | DB에 role 저장 |
| 3.3 | Navigation guard | `SessionProvider`(session + profile 로드). `app/index.tsx`: 미로그인 → `/(auth)/login`, owner → `/(owner)`, sitter → `/(sitter)`. 각 group `_layout.tsx`에서 role 불일치 시 redirect | 직접 URL 입력해도 차단 |
| 3.4 | FastAPI JWT | `deps/auth.py`: JWKS 검증(PyJWT + `PyJWKClient`, 캐시), audience `authenticated`, 실패 시 HS256 secret fallback (D14). `get_current_user` → `{id, email}` + service client로 profile(role, display_name) 조회. `require_role("sitter")` dependency. `routers/me.py` | 유효 200 / 무효·만료 401 |
| 3.5 | Owner dog 프로필 | `/(owner)/index.tsx` 내 dog 카드 목록 + **Add dog**. `/(owner)/dogs/new`, `/(owner)/dogs/[dogId]`: name(필수), breed, birthdate, weight, notes, **Allergies** chip 입력(추가/삭제 → `dog_allergies`, 소문자 저장). Owner 입력은 텍스트 허용 (sitter 원칙과 무관) | Bori + chicken 저장 |
| 3.6 | Sitter 배정 | dog 화면 "Sitter" 섹션: 이메일 입력 → `supabase.rpc('assign_sitter')` → 성공 시 sitter 이름 표시, `not_a_sitter` → "That account isn't a sitter." | sitter 로그인 시 Today에 Bori |
| 3.7 | Sitter Today 스텁 | `/(sitter)/index.tsx`: 담당 dog 카드 목록 (`dogs where sitter_id = me`). 없으면 "No dogs assigned yet — ask the owner to add you by email." | 표시 |

---

## Definition of Done (DoD)

1. 로그아웃 후 재로그인 시 role 유지, 새로고침 시 로그인 유지
2. JWT 만료/잘못된 토큰 → 401 `{detail, code:"unauthorized"}`
3. `backend/README.md`에 "프론트는 anon key + RLS, 백엔드는 JWT 검증 후 service role" 명시
4. sitter 계정으로 `/(owner)` URL 직접 접근 → `/(sitter)`로 이동
5. `pytest`: 무토큰 401, 위조 토큰 401 테스트

### 검증

```bash
# 브라우저 콘솔: (await supabase.auth.getSession()).data.session.access_token 복사
curl -s localhost:8000/api/me -H "Authorization: Bearer $TOKEN"
```

---

## 산출물

- `frontend/app/(auth)/*`, `frontend/app/(owner)/_layout.tsx` + `index.tsx` + `dogs/*`, `frontend/app/(sitter)/_layout.tsx` + `index.tsx`
- `frontend/lib/supabase.ts`, `frontend/providers/SessionProvider.tsx`, `ToastProvider.tsx`, `DogProvider.tsx`
- `backend/app/deps/auth.py`, `backend/app/deps/supabase.py`, `backend/app/routers/me.py`

---

## AI 프롬프트

Playbook §5 — (3.1–3.3) / (3.4) / (3.5–3.7) 세 번

---

## 다음 Phase

→ [Phase 04 — Cloudinary](phase-04.md)
