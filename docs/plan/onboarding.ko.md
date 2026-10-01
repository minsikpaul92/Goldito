# 제품 온보딩 — 심사·데모·가입 첫 경험

> **목적:** 해커톤 **실 URL 데모**에서 심사위원이 가입·설정 없이 **Owner / Sitter 역할**과 **“A Day with PawNote”** 가치를 이해하고 바로 체험하게 한다.
>
> **관련:** [루트 README — A Day with PawNote](../../README.md) · [Phase 03](phases/phase-03.md) (Auth) · [Phase 10](phases/phase-10.md) (시드·배포) · [Devpost 제출](../hackathon/devpost-submission.ko.md) · [architecture D1](phases/architecture.ko.md#1-결정-로그-확정) (UI·카피 **영어**)

---

## 1. 왜 온보딩인가?

| 맥락 | 문제 | 온보딩이 해결하는 것 |
| :--- | :--- | :--- |
| **해커톤 심사** | Working demo URL 필수, 심사위원은 **몇 분**만 씀 | README만 읽고 로그인하는 friction 제거 |
| **PawNote 구조** | Owner·Sitter **역할 분리**, Owner는 **반려동물·알레르기 등록 + 시터 예약** 필요 | **시드 계정** + 화면에서 **Try demo** |
| **제품 스토리** | Kidsnote for pets + AI가 한눈에 안 들어옴 | 로그인 **전** 짧은 소개 (문제 → 두 역할 → 하루 타임라인) |

Nebius 피드백 표의 “Onboarding”은 **플랫폼( Token Factory 등 )** 경험을 뜻한다. 이 문서는 **엔드유저(견주·시터·심사위원) 제품 온보딩**이다.

---

## 2. 두 가지 진입 경로 (P0)

```
                    ┌─────────────────┐
                    │  Welcome / Intro │  ← 미로그인, 제품 소개 (신규)
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     Try demo as Owner  Try demo as Sitter   Sign in / Sign up
              │              │              │
              └──────┬───────┘              │
                     ▼                      ▼
              demo-owner@…            (auth)/login · signup
              demo-sitter@…                 │
                     │                      │
                     └──────────┬───────────┘
                                ▼
                     /owner · /sitter 앱 (Phase 03+)
```

| 경로 | 대상 | P0 우선순위 |
| :--- | :--- | :--- |
| **A. Demo login** | 심사위원, Devpost·영상 시연 | **필수** — Phase 10 시드와 연동 |
| **B. Welcome / Intro** | 첫 방문자 전체 | **권장** — 묵 디자인 후 Phase 03 직후 또는 10 직전 구현 |
| **C. Sign up + 역할 선택** | 새 사용자 (팀·지인) | Phase 03 기존 범위; Intro와 카피만 맞춤 |

**원칙:** 심사 재현의 **정본 경로는 A (시드 + Try demo)**. 가입·반려동물 등록·시터 예약은 README “Advanced: create your own accounts”로 두어도 됨.

---

## 3. 화면 구성 (와이어 목표)

### 3.1 Welcome / Intro (미로그인)

**라우트 제안:** `/(public)/welcome` 또는 `app/welcome.tsx` — 세션 없을 때 `app/index.tsx`가 여기로, “Already have an account?” → login.

| Step | 내용 (EN 카피 방향) | 비고 |
| :--- | :--- | :--- |
| 1 · Problem | Owner anxiety vs sitter DM fatigue (README Problem 1문장씩) | Illustration 또는 아이콘 |
| 2 · Two roles | **Learn without asking** (Owner) / **Care, snap, tap** (Sitter) | north-star 표와 동일 |
| 3 · One day | 08:00 med → 10:30 walk → 15:00 scan → 18:00 report (README 타임라인) | 데모·영상과 동일 스토리 |
| Footer CTA | Primary: **Try demo as Sitter** · Secondary: **Try demo as Owner** · Text: **Sign in** · **Create account** | 모바일 단일 컬럼, CTA 1개 primary |

- **Skip:** “Skip to sign in” (작은 링크) — 재방문·개발용.
- **Persist (선택 P1):** `localStorage` `pawnote_intro_seen=1` → 다음부터 `/` → login 직행.

### 3.2 Login (기존 Phase 03 확장)

| 요소 | 설명 |
| :--- | :--- |
| 이메일·비밀번호 | Supabase signIn |
| **Demo block** | 카드 또는 버튼 2개: Owner / Sitter — 탭 시 `demo-owner@pawnote.test` / `demo-sitter@pawnote.test` + `EXPO_PUBLIC_DEMO_PASSWORD` (데모 계정 전용 공개값, architecture §4 — service key 금지) 자동 채움 후 로그인 |
| 힌트 | “For judges: use Try demo — Bori (chicken allergy) is already set up.” |
| 링크 | Create account → signup |

> Demo 이메일·비번은 **공개 데모 전용** (`*.test` 도메인). Phase 10 `seed_demo.py`와 README·Devpost와 **동일 문자열** 유지.

### 3.3 Sign up (기존 Phase 03)

- Intro step 2와 **같은 비주얼·카피**로 “I'm a pet owner” / “I'm a pet sitter” 카드.
- 가입 후 Owner는 pet·알레르기 등록 (Phase 3.5) → 예약 (Phase 03B). Sitter는 “No bookings yet — open your schedule so owners can find you.” empty state (3.7).

### 3.4 로그인 후 (앱 내 “온보딩” — P0 최소)

| 역할 | 첫 진입 | P0 |
| :--- | :--- | :--- |
| Owner | Home에 Bori 카드·오늘 요약 (시드) | Empty state 카피만 명확히 |
| Sitter | Today에 Bori + due 배너 (Phase 06 이후) | “Complete with photo”가 primary |

**풀 튜토리얼(coach marks)은 P0 제외.** Empty state + 데모 데이터로 충분.

---

## 4. 데모 데이터 · Devpost · README (Phase 10 연동)

| 항목 | 내용 |
| :--- | :--- |
| 시드 | [phase-10.md](phases/phase-10.md) `seed_demo.py`: owner, sitter, Bori, chicken, med/walk, 샘플 피드 |
| 공개 문서 | 루트 README **Test accounts** + Devpost 설명란 (이메일·비번·“click Try demo on login”) |
| `--relative` | 영상 촬영용 med/walk 시간 — 온보딩 UX와 무관, README에만 명시 |

심사위원 **체크리스트 (Devpost / README에 복붙 가능):**

1. Open demo URL — on a computer it appears in a phone frame (**click = tap, drag or scroll = swipe**); on a phone it opens full screen → Welcome (또는 Login)
2. **Try demo as Sitter** → Today / Tasks → complete med with photo (pick a sample photo — no camera needed)
3. Log out → **Try demo as Owner** → Feed / notifications / report read (10.10 Split view가 있으면: **Show both phones** → 두 역할을 한 화면에서)
4. (Optional) Scan tab → sample **chicken jerky** label → DANGER

> 데스크톱 프레임·마우스 조작·샘플 트레이는 [architecture D25](phases/architecture.ko.md) · [DESIGN.md §2.1·§7.7](../../DESIGN.md#21-desktop-browsers-judges-phone-frame).

---

## 5. 디자이너 handoff (묵)

### 5.1 Deliverables

1. **Welcome flow** — 3 screens (or 1 scroll) + CTA 영역
2. **Login** — Demo block 레이아웃 (Owner / Sitter)
3. **Signup role cards** — Intro step 2와 토큰 통일 (색·타이포·illustration style)
4. **Empty states** (1장): sitter “No bookings yet”, owner “No posts yet”
5. **데스크톱 화면** (심사위원이 PC로 보는 첫 화면): 배경 + 폰 프레임(402 × 874) 스타일 + 옆 안내 패널(소개 한 줄, Try demo, QR, 힌트) — [DESIGN.md §2.1](../../DESIGN.md#21-desktop-browsers-judges-phone-frame), Phase 10.9
6. **샘플 사진 세트** (샘플 트레이 4.7): 강아지·고양이 일상 사진 + 가상 브랜드 간식 라벨 (Phase 08 픽스처와 동일) — 사람·주소 없음

### 5.2 UX 원칙 (CLAUDE.md와 동일)

- Mobile-first, single column (phone-width web demo) — 디자인 프레임 **402 × 874**, 데스크톱에서는 같은 크기의 폰 프레임 안에 표시 (D25)
- Kidsnote familiarity — warm, album/timeline, not admin dashboard
- One primary action per screen on Welcome: default **Try demo as Sitter** (데모 스토리는 sitter 액션부터 시작하기 쉬움)
- Danger (safety)는 별도 — 온보딩에서 과장하지 않음

### 5.3 Figma 메모

- [theme/tokens.ts](../../frontend/theme/tokens.ts) (Phase 01 이후) 또는 interim 8px grid, rounded cards
- 모든 **사용자-facing 카피 EN**
- Devpost 썸네일·영상 첫 프레임용 **Welcome 1장** export 고려

---

## 6. 구현 · Phase 매핑

| ID | 작업 | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| **OB.1** | 라우트: 미로그인 `/` → welcome (intro_seen 옵션은 OB.4) | Phase 03.3 | 로그아웃 후 welcome 노출 |
| **OB.2** | Welcome UI (3 step + CTA) | OB.1, 묵 와이어 | EN 카피, Sign in / Sign up 링크 |
| **OB.3** | Login demo buttons → 시드 계정 자동 로그인 · `/login?demo=sitter`·`?demo=owner` 쿼리도 같은 동작 (10.9 옆 패널·10.10 Split view가 사용) | Phase 10.1 시드, 03.1 login | Owner/Sitter 각 200, Bori visible |
| **OB.4** | (선택) intro_seen skip | OB.2 | 두 번째 방문 login 직행 |
| **OB.5** | README + Devpost 문구 | OB.3, 10.2 | Test accounts + judge checklist |

`/(public)/welcome`은 [architecture §3 라우트 맵](phases/architecture.ko.md#3-화면--라우트-맵-최종-형태)에 반영됨 (OB.1).

**담당 제안:** UI OB.2·OB.3 — 민식 (Expo); 비주얼 OB.2 — 묵; 카피 — README와 슬기 검수 (톤).

---

## 7. Definition of Done (온보딩 P0)

- [ ] 공개 데모 URL에서 **로그인 없이** Welcome(또는 Login demo block) 경로 설명 가능
- [ ] **Try demo as Owner / Sitter** 한 탭(또는 한 클릭)으로 시드 세션 진입
- [ ] 데스크톱 브라우저에서 폰 프레임 안의 Welcome → Try demo → 체크리스트 1–4를 **마우스만으로** 완주 (D25)
- [ ] Devpost·README에 테스트 계정 + **3~5단계 judge path** 영어
- [ ] Sign up 역할 UI와 Welcome “two roles” **카피·톤 일치**
- [ ] 실 PII·개인 계정을 온보딩/시드에 넣지 않음

---

## 8. 범위 밖 (P0)

- 소셜 로그인, 비밀번호 재설정 UI
- 앱 내 coach marks / tooltip 투어
- Owner 가입 후 forced pet setup wizard (시드 데모가 우선)
- 한국어 UI (D1: EN only)

P1에서 intro_seen, Welcome 일러스트 polish, “Request photo” 스텝을 Intro에 한 줄 추가 등은 [Phase 11](phases/phase-11.md) 폴리싱과 함께 검토.

---

## 9. 카피 초안 (EN — 구현 시 그대로 또는 묵 수정)

**Welcome step 1 title:** “Peace of mind for owners. Less typing for sitters.”

**Welcome step 2:** “Owners get updates without asking. Sitters care, snap, and tap — no report essays.”

**Welcome step 3 title:** “A day with PawNote” — bullet: 08:00 pill · 10:30 walk · 15:00 treat check · 18:00 daily report

**CTA:** “Try demo as Sitter” / “Try demo as Owner” / “Sign in” / “Create account”

**Login demo hint:** “Demo accounts include Bori (Maltese, allergic to chicken).”

---

*Last updated: 2026-09-29 — P0 onboarding spec; implementation tracked as OB.* in phase 03/10 work.*
