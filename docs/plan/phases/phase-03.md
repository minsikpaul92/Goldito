# Phase 03 — 인증 & 역할 & Pet 프로필 (Auth)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D14–D15, D21–D24, 라우트 맵 §3

## Goal

**이메일/비밀번호 Supabase Auth**로 가입·로그인하고, `profiles.role`에 따라 **Owner / Sitter 탭 레이아웃**으로 분기한다. Owner는 **pet 프로필(종·알레르기 포함)**을 만들고, 두 역할 모두 **역할별 프로필**을 채울 수 있다. 시터 배정은 이 Phase가 아니라 [Phase 03B 기간 예약](phase-03b.md)에서 한다. FastAPI는 **Bearer JWT**로 `/api/me`를 보호한다.

### Goal 달성 기준

- [ ] owner 1, sitter 1 가입·로그인 성공, 새로고침 후 세션 유지
- [ ] 역할별 다른 탭 레이아웃 (Owner: Home·Feed·Care·Reports / Sitter: Today·Tasks·Scan·Report — 미구현 탭은 EmptyState 스텁)
- [ ] Owner: 강아지 "Bori" 생성 + 알레르기 `chicken` + 고양이 "Mochi" 생성 → Home에 두 마리 카드 (종 아이콘 🐶 / 🐱)
- [ ] Sitter: 예약이 없으면 Today에 "No bookings yet" 빈 상태 (예약 연동은 03B)
- [ ] `curl -H "Authorization: Bearer <access_token>" /api/me` → 200 + role

---

## 선행 조건

- [Phase 02](phase-02.md) profiles 트리거, RLS

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| Login, SignUp(role 1회 선택), session persist (web localStorage) | 소셜 로그인, MFA, 비밀번호 재설정 |
| 역할 route group + 탭 스텁 + 헤더(역할 라벨, 로그아웃, 벨 자리) | 알림 센터 동작 (Phase 05) |
| Owner pet 생성/수정 + 알레르기 chips + 역할별 프로필 | pet 사진(avatar) (P1) · 시터 배정 (→ 03B 예약) |
| FastAPI `get_current_user`, `require_role` | 전체 API 프록시 (B안) |
| `components/ui`: EmptyState, Skeleton, Toast(ToastProvider) | |

---

## 작업 상세

| ID | 작업 | 상세 | DoD |
| :--- | :--- | :--- | :--- |
| 3.1 | Auth screens | `app/(auth)/login.tsx`, `signup.tsx`. `lib/supabase.ts` (anon key, `persistSession:true`). Supabase 에러 → 사람 문구 ("Wrong email or password") | 가입·로그인 |
| 3.2 | Signup role | `signUp({email, password, options:{data:{role, display_name}}})` → 트리거가 `profiles` + `owner_profiles` 또는 `sitter_profiles` 생성 (클라이언트 insert 없음, D15·D21). Role 선택 UI: 큰 카드 2개 "I'm a pet owner" / "I'm a pet sitter" | DB에 role + 역할별 프로필 저장 |
| 3.3 | Navigation guard | `SessionProvider`(session + profile 로드). `app/index.tsx`: 미로그인 → `/(auth)/login`, owner → `/(owner)`, sitter → `/(sitter)`. 각 group `_layout.tsx`에서 role 불일치 시 redirect | 직접 URL 입력해도 차단 |
| 3.4 | FastAPI JWT | `deps/auth.py`: JWKS 검증(PyJWT + `PyJWKClient`, 캐시), audience `authenticated`, 실패 시 HS256 secret fallback (D14). `get_current_user` → `{id, email}` + service client로 profile(role, display_name) 조회. `require_role("sitter")` dependency. `routers/me.py` | 유효 200 / 무효·만료 401 |
| 3.5 | Owner pet 프로필 | `/(owner)/index.tsx` 내 pet 카드 목록 + **Add pet**. `/(owner)/pets/new`, `/(owner)/pets/[petId]`: **species(필수, Dog / Cat 세그먼트 — 생성 후 변경 불가, D22)**, name(필수), breed, birthdate, weight, notes, **Allergies** chip 입력(추가/삭제 → `pet_allergies`, 소문자 저장). Owner 입력은 텍스트 허용 (sitter 원칙과 무관) | Bori(dog) + chicken, Mochi(cat) 저장 |
| 3.6 | (삭제) | 이메일로 시터 배정은 기간 예약으로 대체 → [Phase 03B](phase-03b.md) | - |
| 3.7 | Sitter Today 스텁 | `/(sitter)/index.tsx`: 빈 상태 "No bookings yet — open your availability so owners can find you." (실제 목록은 3B.6) | 표시 |
| 3.8 | 내 프로필 (역할별) | 헤더 → **Profile** 화면 1개. Owner: emergency contact, vet clinic (모두 선택 입력) → `owner_profiles`. Sitter: bio, service area, years of experience → `sitter_profiles` (예약 검색 결과 카드에 표시). 견주 긴급 연락처는 **확정 예약 시터에게만** 보임 (phase-02 RLS) | 저장 확인 |
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

- `frontend/app/(auth)/*`, `frontend/app/(owner)/_layout.tsx` + `index.tsx` + `pets/*`, `frontend/app/(sitter)/_layout.tsx` + `index.tsx`
- `frontend/lib/supabase.ts`, `frontend/providers/SessionProvider.tsx`, `ToastProvider.tsx`, `PetProvider.tsx`
- `backend/app/deps/auth.py`, `backend/app/deps/supabase.py`, `backend/app/routers/me.py`

---

## AI 프롬프트

Playbook §5 — (3.1–3.3) / (3.4) / (3.5–3.7) 세 번

---

## 다음 Phase

→ [Phase 03B — 근무일 & 기간 예약](phase-03b.md)
