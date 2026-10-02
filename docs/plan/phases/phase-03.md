# Phase 03 — 인증 & 역할 & Pet 프로필 (Auth)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D14–D15, D21–D24, 라우트 맵 §3

## Goal

**이메일/비밀번호 Supabase Auth**로 가입·로그인하고, `profiles.role`에 따라 **Owner / Sitter 탭 레이아웃**으로 분기한다. Owner는 **pet 프로필(종·알레르기 포함)**을 만들고, 두 역할 모두 **역할별 프로필**을 채울 수 있다. 시터 배정은 이 Phase가 아니라 [Phase 03B 기간 예약](phase-03b.md)에서 한다. FastAPI는 **Bearer JWT**로 `/api/me`를 보호한다.

### Goal 달성 기준

- [ ] owner 1, sitter 1 가입·로그인 성공, 새로고침 후 세션 유지
- [ ] 역할별 다른 탭 레이아웃 (Owner: Home·Feed·Care·Reports / Sitter: Today·Tasks·Scan·Report — 미구현 탭은 EmptyState 스텁)
- [ ] Owner: 강아지 "Max" 생성 + 알레르기 `chicken` + 고양이 "Mochi" 생성 → Home에 두 마리 카드 (종 아이콘 🐶 / 🐱)
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
| 3.0 | Theme provider (펫 스킨 대비) | `frontend/theme/themes.ts`: 테마 프리셋 맵(`default` + 털 색 프리셋 자리, 값은 디자이너 확정 전 임시). 테마가 바꾸는 키: `primary`, `primaryText`, `background`, `accent` / **고정 키**(테마 무관): `text`, `error`, `success`, `warning` — 위험 경고가 스킨에 묻히지 않게. `ThemeProvider` + `useTheme()` — `components/ui` 전부 `tokens` 직접 import 대신 `useTheme()` 사용. 이번엔 `default`만 (pet별 적용은 [11.10](phase-11.md)). `DESIGN.md` "For AI agents" 규칙을 `useTheme()` 기준으로 갱신 | 기존 화면 동일 렌더 + `themes.ts`에서 `primary` 바꾸면 Button 색 변경 |
| 3.1 | Auth screens | `app/(auth)/login.tsx`, `signup.tsx`. `lib/supabase.ts` (anon key, `persistSession:true`, `auth.storageKey`는 `getAuthStorageKey()`에서 — 지금은 고정값, 10.10 Split view에서 iframe pane별로 분리). Supabase 에러 → 사람 문구 ("Wrong email or password") | 가입·로그인 |
| 3.2 | Signup role | `signUp({email, password, options:{data:{role, display_name}}})` → 트리거가 `profiles` + `owner_profiles` 또는 `sitter_profiles` 생성 (클라이언트 insert 없음, D15·D21). Role 선택 UI: 큰 카드 2개 "I'm a pet owner" / "I'm a pet sitter" | DB에 role + 역할별 프로필 저장 |
| 3.3 | Navigation guard | `SessionProvider`(session + profile 로드). `app/index.tsx`: 미로그인 → `/login`, owner → `/owner`, sitter → `/sitter`. 각 역할 폴더 `_layout.tsx`(`app/owner`·`app/sitter` — D26, `components/RoleTabs.tsx`)에서 미로그인 → `/login`, role 불일치 → 자기 홈. 탭은 expo-router **JS `Tabs`** (NativeTabs 아님 — D25, 해커톤 후 시터 데스크톱 사이드바 `tabBarPosition: 'left'`) | 직접 URL 입력해도 차단 · 데스크톱 프레임에서 마우스로 탭 이동 |
| 3.4 | FastAPI JWT | `deps/auth.py`: JWKS 검증(PyJWT + `PyJWKClient`, 캐시), audience `authenticated`, 실패 시 HS256 secret fallback (D14). `get_current_user` → `{id, email}` + service client로 profile(role, display_name) 조회. `require_role("sitter")` dependency. `routers/me.py` | 유효 200 / 무효·만료 401 |
| 3.5 | Owner pet 프로필 | `/owner/index.tsx` 내 pet 카드 목록 + **Add pet**. `/owner/pets/new`, `/owner/pets/[petId]`: **species(필수, Dog / Cat 세그먼트 — 생성 후 변경 불가, D22)**, name(필수), breed, birthdate, weight, notes, **Allergies** chip 입력(추가/삭제 → `pet_allergies`, 소문자 저장). Owner 입력은 텍스트 허용 (sitter 원칙과 무관) | Max(dog) + chicken, Mochi(cat) 저장 |
| 3.6 | (삭제) | 이메일로 시터 배정은 기간 예약으로 대체 → [Phase 03B](phase-03b.md) | - |
| 3.7 | Sitter Today 스텁 | `/sitter/index.tsx`: 빈 상태 "No bookings yet — open your availability so owners can find you." (실제 목록은 3B.8) | 표시 |
| 3.8 | 내 프로필 (역할별) | 헤더 → **Profile** (`/profile`). Owner: home address, emergency contact, vet clinic → `owner_profiles`. Sitter: bio, service area, experience, home notes, **home address** → `sitter_profiles` (`get_my_sitter_profile`로 읽기). **P0에는 Settings 화면 없음** — 로그아웃 Profile/헤더. **Settings + What's New(패치노트)** → [11.11](phase-11.md) | 저장 확인 + handoff 카드 주소 (카드는 3B — 3.8에서는 저장·`get_my_sitter_profile` 읽기까지) |
---

## Definition of Done (DoD)

1. 로그아웃 후 재로그인 시 role 유지, 새로고침 시 로그인 유지
2. JWT 만료/잘못된 토큰 → 401 `{detail, code:"unauthorized"}`
3. `backend/README.md`에 "프론트는 anon key + RLS, 백엔드는 JWT 검증 후 service role" 명시
4. sitter 계정으로 `/owner` URL 직접 접근 → `/sitter`로 이동
5. `pytest`: 무토큰 401, 위조 토큰 401 테스트

### 검증

```bash
# 웹 앱에서 로그인 후 브라우저 콘솔: JSON.parse(localStorage.getItem("pawnote-auth")).access_token 복사 (backend/README.md "Auth")
curl -s localhost:8000/api/me -H "Authorization: Bearer $TOKEN"
```

---

## 산출물

- `frontend/app/(auth)/*`, `frontend/app/owner/_layout.tsx` + `index.tsx` + `pets/*`, `frontend/app/sitter/_layout.tsx` + `index.tsx`
- `frontend/theme/themes.ts`, `frontend/providers/ThemeProvider.tsx` (3.0)
- `frontend/lib/supabase.ts`, `frontend/providers/SessionProvider.tsx`, `ToastProvider.tsx`, `PetProvider.tsx`
- `backend/app/deps/auth.py`, `backend/app/deps/supabase.py`, `backend/app/routers/me.py`

---

## AI 프롬프트

Playbook §5 — (3.1–3.3) / (3.4) / (3.5–3.8) 세 번

---

## 다음 Phase

→ [Phase 03B — 시터 스케줄 · 예약 · 인수인계](phase-03b.md)
