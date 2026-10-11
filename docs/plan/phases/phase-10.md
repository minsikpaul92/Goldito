# Phase 10 — 데모 시드 · 배포 · 제출 README

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D18 배포, D19 시드

## Goal

심사위원·팀이 **15분 안에** "A Stay with Goldito" — [full-process.ko.md](../full-process.ko.md)의 **5단계(Inquiry → Meet & Greet → Booking → Care & Transit → Completion)** — 전체를 재현할 수 있게 **시드 데이터**, **공개 데모 URL**, **테스트 계정**, **루트 README 실행 가이드**를 완성하고, **12/15 심사 종료까지 데모가 살아 있게** 운영 준비를 끝낸다. 로그인 UX·Welcome·Try demo는 **[onboarding.ko.md](../onboarding.ko.md)** (OB.3·OB.5와 연동).

### Goal 달성 기준

- [ ] `backend/scripts/seed_demo.py` — owner, sitter, 강아지 Max(chicken allergy, med 08:00, walk 10:30) + 고양이 Mochi(feeding 09:00, litter 12:00) + Chloe 요금표·정책·Visitor parking + Robert 가상 출입 정보·집 좌표 + **지난 돌봄(Paul) Life Record·리뷰** (+ `--relative` 옵션 — 5단계 장면을 지금 시각 기준으로)
- [ ] README Getting Started: clone → env → migrate → seed → run → login
- [ ] Public frontend URL (Vercel https://goldito-petcare.vercel.app) + backend URL (**Render** https://goldito-backend.onrender.com — Nebius AI Cloud는 안 씀, D18), production CORS, **keep-alive 핑이 10분마다 도는 것 확인**
- [ ] 테스트 계정 문서 (Devpost 붙여넣기용)
- [ ] 12/15까지 유지 계획 실행 (keep-alive, 한도 모니터링)
- [ ] 데스크톱 브라우저: 폰 프레임 + 옆 안내 패널, **마우스만으로** 심사 경로 완주 (D25) · 폰 브라우저: 프레임 없이 전체 화면

---

## 선행 조건

- 시나리오 코어 완료: Phase 03B · 03C · 04 · 05 · 06 · 06B · 07 · 07B · 09 · 07C (08은 stretch — 있으면 데모 (+) 장면). 백엔드 배포 10.3은 **U0로 앞당김 (2026-10-09)** — Vercel(main)에서 업로드 · AI까지 손 테스트하려고, R1b보다 먼저 ([work-split-2026-10-09.ko.md](../work-split-2026-10-09.ko.md) §2)
- Phase 00 모든 키 production env에 설정

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| Vercel (Expo web export) + **Render** Web Service (Docker, 무료) + keep-alive 핑 | App Store / Play 빌드 · Nebius AI Cloud 배포 (D18, 2026-10-09) |
| Supabase keep-alive, 모니터링 | Multi-region HA |
| 3분 영상 스크립트 outline | 영상 편집 (묵) |
| Nebius/NVIDIA feedback 초안 | Devpost 최종 클릭 (민식) |
| 데스크톱 옆 안내 패널 (10.9) · Split view (10.10, stretch) | 시터 데스크톱 레이아웃 (해커톤 후, D25) |

---

## "A Stay with Goldito" 데모 스크립트 (Goal 시나리오 — [full-process.ko.md §6](../full-process.ko.md#6-데모-경로-a-stay-with-goldito))

| # | Stage | 액션 | 검증 (상대방 화면) | Phase |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Inquiry | Owner: Chloe 프로필 → **Ask before booking** (Boarding · 2마리 · 연휴 포함 · 맡기기 Sitter drives · 찾기 Owner drives) → 답장 후 **Request booking** | Chloe(자동 발송 모드) "typing" → 약 30초 뒤 시터 말투 답장 + 견적 카드(공휴일·다두) + Life Record 출처 칩 / Sitter 알림 "your draft reply is ready" → 요청 카드 | 07B · 03C · 03B |
| 2 | Meet & Greet | Owner: **Care request** → AI 체크리스트 → Save · 처음 만나는 사이라 Meet & Greet: **Video** Oct 6 7 PM 제안 → Sitter Accept → **Join Google Meet** 링크 생성 → Done (대면이면 선호 장소 칩에서 고름) | Sitter 요청 카드: "Meet first" · 🚙/🚗 · Heads-up · From Max's Life Record · 수락 뒤 양쪽 카드에 Join Google Meet · M&G 전에는 Sitter Accept 비활성 | 06 · 03B (3B.9 · 3B.11) |
| 3 | Booking | Sitter **Accept** → Owner **Checkout**: 견적 → 동의서 → **Pay (demo)** | Owner: Chloe's place · Visitor parking · 짐 체크리스트 / Sitter: "Robert signed and paid" · 출입 정보 🔒 "Unlocks …" | 03C |
| 4a | Transit | (시드 시각 = 픽업 2시간 안) Sitter **Show code** → **Start trip → Simulate the drive** | Owner `access_unlocked` · 지도·ETA · "Chloe has arrived" → Sitter 차량 샘플 사진 → Vision ✅ → **Received** → Owner "Pick-up complete — care has started · photo verified" | 06B |
| 4b | Care | Sitter: Today 체크인(Walk 20 min) · 사진 **+ Photo** · Report: 사진 2장 → **칩 제안**(틀린 칩 1개 끄기) + 짧은 메모 → **Generate → 승인(Send)** | Owner 토스트·Activity · 피드 AI 캡션 · **Album** 분류 · Reports 알림장 | 06 · 05 · 09 · 07 |
| 5 | Completion | Owner **Start trip**(Owner drives) → Simulate → Sitter 귀가 사진 → **Returned** | Sitter "Robert has arrived" / Owner Visitor parking 카드 → "home safe 🏠" → ★ 리뷰 → "Life Record updated" | 06B · 07C |
| (+) | Stretch | Sitter Home **Scan a treat** → `chicken_jerky` 샘플 | 빨간 DANGER 모달 / Owner "Blocked a risky treat" | 08 |

녹화·심사는 아무 시간에나 가능해야 함 → `seed_demo.py --relative`: 확정·결제된 예약의 픽업(맡기기) = **now + 90분**(출입 정보가 이미 열린 상태), 찾기 = now + 3일, med = now+2분, walk = now+6분. 장면 1–3을 새로 보여 줄 때는 `--fresh-inquiry`로 Robert ↔ Chloe를 **처음 만나는 사이**로 되돌린다 (둘 사이 예약을 지워 장면 ②의 Meet & Greet가 뜨게 — D44). 라이브 심사 경로(OB.5)는 장면 ①·④ 중심이고, Meet & Greet는 영상으로 보여 준다. 영상은 3분 미만이므로 장면 ①의 약 30초 사람 속도 구간은 편집에서 빨리 감고 "~30 s later" 자막으로 표시한다 (앱 동작은 그대로).

---

## 작업 상세

| ID | 작업 | 상세 / DoD |
| :--- | :--- | :--- |
| 10.1 | Seed script | **계정 부분 완료 (2026-10-01):** `seed_demo.py`가 demo-owner/demo-sitter 생성·갱신 + `--check` 읽기 전용 확인 (backend/README "Demo accounts"). **2026-10-09:** 테스트용 `scripts/reset_demo.py --state empty · pets · confirmed · ready · in_care`(+ 앱 Profile → Demo tools, `POST /api/demo/reset`)가 생김 (#60). **심사 전에 바뀌는 것:** 리셋 기능을 없애고(심사위원이 데이터를 지울 수 없게) 같은 `demo_reset` 코드로 **시작 지점별 고정 데모 계정**(빈 계정 · 펫만 · 수락된 예약 → 돌보는 중 · 끝난 돌봄)을 만들어 Try demo가 그중에서 고름 — 한 계정을 두 심사위원이 동시에 쓰는 문제는 결정 필요 (TODO "Demo accounts for judging"). R60-3~R60-5(리셋 견고성)는 여기서 흡수. 남은 것: 아래 pet·예약·task·Paul·샘플 피드. `backend/scripts/seed_demo.py` (service role, D19): `auth.admin.create_user` × 2 (`demo-owner@goldito.test`, `demo-sitter@goldito.test`, `email_confirm=True`, 비밀번호는 env `DEMO_PASSWORD`), pet Max(dog, Maltese, 4y, allergy chicken, care_tasks medication+walk), pet Mochi(cat, Domestic Shorthair, 3y, care_tasks feeding+litter), **시나리오 데이터 (D27):** Chloe `sitter_rates`(Boarding 55 · House sitting 70 · Daycare 35 · +50% · +25%)·`services`·`policies`(가상 정책 문단 3개)·`visitor_parking`·`lobby_notes`·`home_lat/lng`(가상 좌표 — 공원 근처, 실제 주소 아님), Robert `owner_home_access`(가짜 lockbox `0000`·buzzer `#000` — 명백히 가짜 값)·`home_lat/lng`, `pet_cautions` 2개, `care_requests` 1개, Chloe **말투 데이터**(가상 시터 스타일 카드 + `tone_samples` 시드 — 익명화 원본이 아닌 공개용 샘플, 7B.8) · `ai_reply_mode='auto'` + `ai_consent_at`(장면 ① — 대기 없이 바로 사람 속도, D36) · Robert·Chloe·Paul `meet_spots` 각 2개(가상 공원 입구·카페 — 실제 주소 아님, D44) · **승인 대기 초안 1건**(시드 전용 견주 Joy → Chloe 문의, `status='draft'` — 시터 데모에서 Send / Edit / Regenerate 화면을 보여 주기 위함, D36), 결제·동의 완료 예약(`paid_at`, `booking_consents` 5종 — 서비스 role insert), 지난 9월 Paul 예약(완료) + `pet_life_records`(Max·Mochi) + `reviews`(★5) + RAG 인덱싱(`rag.index_source`), 데모 경로 JSON 2개(`assets/demo/routes/`), 공휴일 시드(03C),  sitter_availability open = 오늘-7일 ~ 오늘+60일, 모든 칸, 정원 3, 칸 시간 = Chloe 기본(Morning 08–12 · Afternoon 12–18 · Overnight 18–08), **확정 booking 1건 = 어제 09:30 맡김(Received 완료) ~ 오늘+6일 17:00 찾음, 장소 Chloe's place (Max + Mochi)** — 과거 시각이라 RPC가 아니라 service role로 `bookings` + `booking_pets`(care_range) + `booking_slots` + agreed `booking_handoffs`를 함께 insert (smoke test `_t_booking`과 같은 형태) → Try demo 즉시 "Now caring" + 과거 예약 1건(단골 표시용). 가짜 `home_address`, 추가로 시터2(Paul) 계정 + open 구간 (재예약 검색 데모용), owner_profiles 가짜 긴급 연락처, 샘플 feed 2개(선택, Cloudinary `goldito/demo/` 공용 이미지). **멱등** (`--reset`이면 demo 계정 데이터 삭제 후 재생성). 실제 PII 0 |
| 10.2 | README | 루트 README는 이미 5단계 흐름 구조 (2026-10-01) + **The Goldito Agent** 표(트리거 → 행동 → 사람 승인, D46 — 영상 내레이션도 같은 표현) — 배포 직전 **실제로 만든 기능과 대조**해 안 된 것은 지우거나 "What's Next"로 이동 (특히 08 stretch). Getting Started (복붙 명령, Windows/mac 둘 다), "How we use Nemotron" 표를 실제 model·latency(07.1·07B 지표)로 갱신, architecture 그림, **단계별 스크린샷 5장**. backend/frontend README 최신화 |
| 10.3 | Deploy backend | **U0로 앞당겨 완료 (2026-10-09) — Render 무료 플랜**, https://goldito-backend.onrender.com. Render Web Service가 GitHub `main`을 보고 `backend/Dockerfile`로 빌드 · 배포(Root Directory `backend`, Health Check `/health`), env는 Render → Environment ([env-setup.ko.md](../env-setup.ko.md) § 배포된 백엔드). CI(`ci.yml`)가 PR마다 같은 이미지를 빌드해 `/health`를 확인. **Nebius AI Cloud는 쓰지 않음** (D18 — 카드 등록 + $25 선결제, 행사 크레딧 없음, 상시 켜 두면 12/15까지 약 $128; 시도한 기록은 [notes/nebius-ai-cloud-feedback.md](notes/nebius-ai-cloud-feedback.md)). AI 추론은 그대로 Token Factory |
| 10.4 | Deploy frontend | **Vercel 연결은 2026-10-02에 앞당김** — Production **https://goldito-petcare.vercel.app** (main 머지마다 자동 배포, 2026-10-09부터 수동 테스트도 여기서), `frontend/vercel.json` + [env-setup.ko.md § Vercel](../env-setup.ko.md). `EXPO_PUBLIC_API_URL`은 U0에서 채움. 10.4에서 남은 것: 심사 전 `EXPO_PUBLIC_DEMO_TOOLS` 비우기 · 최종 production env 확인. `npx expo export -p web` → `dist/` → Vercel (SPA rewrite `/(.*) → /index.html`), env `EXPO_PUBLIC_*` production 값. backend `CORS_ORIGINS`에 Vercel 도메인 추가. **CD:** Vercel GitHub 연동 — Root Directory `frontend`, Build `npx expo export -p web`, Output `dist`. PR마다 Preview URL, main 머지 시 production. Preview 도메인(`*.vercel.app`)은 CORS에 정규식으로 허용하거나 Preview는 staging backend 없이 UI 확인용으로만 사용. **폰 프레임이 같은 도메인 iframe이므로** 보안 헤더를 넣을 때 `X-Frame-Options: DENY` 금지, CSP는 `frame-ancestors 'self'` (D25) |
| 10.5 | 데모 계정 문서 | `docs/DEMO_ACCOUNTS.md`: URL, 이메일 2개, 비밀번호는 repo에 적지 않고 **Devpost 제출란**과 배포 env(`DEMO_PASSWORD` 시드용, `EXPO_PUBLIC_DEMO_PASSWORD` Try demo용 — 데모 계정 전용 값, [onboarding.ko.md](../onboarding.ko.md))에만 (repo엔 "see submission"), 데모 순서 5줄 |
| 10.6 | Feedback log | README 피드백 표: Token Factory, AI Cloud(써 보려다 그만둔 이유 — [notes/nebius-ai-cloud-feedback.md](notes/nebius-ai-cloud-feedback.md)), 각 Nemotron 모델별 (용도 / 잘된 점 / 개선점 / 온보딩 / 재사용 의향) — 개발 중 `notes/`에 쌓인 메모 정리 |
| 10.7 | 유지 계획 (~12/15) | ⓪ **Render 잠듦 방지 (2026-10-09):** Render 무료는 15분 무요청 시 잠들어 첫 요청이 30~50초 → `.github/workflows/keepalive.yml`이 **10분마다** `/health` + **cron-job.org `Goldito Keepalive`** 10분마다 (2026-10-09 등록). **배포 · 테스트 · 영상 녹화 전에 핑이 살아 있는지 확인** (Actions 실행 간격 ≤ 15분, 응답 1초 안) · ① Supabase 무료 일시정지 방지: 같은 cron에 하루 한 번 → backend `GET /health/deep`(Supabase `select 1` 수행; `/health`는 가볍게 유지) ② Cloudinary·Nebius 크레딧 잔량 주 1회 확인 (캡처 1장 ≈ 비용 계산표) ③ 데모 계정 데이터 오염 시 `seed_demo.py --reset` |
| 10.8 | 내부 마감 10/28 체크리스트 | 아래 DoD 전부 + 영상 업로드(YouTube public, < 3분, 영어 음성) + Devpost 초안 |
| 10.9 | 데스크톱 옆 안내 패널 (D25) | `components/shell/SidePanel.web.tsx` — framed 모드에서 폰 프레임 옆: 로고 + 한 줄 소개, 힌트 "Click = tap · Drag or scroll = swipe", **Try demo as Sitter / Owner** (iframe을 `/login?demo=sitter`·`?demo=owner`로 이동 → OB.3 자동 로그인 재사용), **Open on your phone** QR (배포 URL, 정적 이미지), 영상·GitHub 링크, (10.10 후) **Show both phones**. 창 폭 < 1100이면 패널을 프레임 아래로. DoD: Chrome·Edge·Safari·Firefox × 1366×768·1440×900·1920×1080 + Windows 125%·150% 배율에서 프레임·패널 안 잘림, 패널 버튼 전부 클릭 동작 |
| 10.10 | (Stretch) Split view — Owner·Sitter 폰 나란히 | `?view=split` (또는 패널 **Show both phones**) → 프레임 2개, 각 iframe `name="pane-owner"` / `"pane-sitter"`. 안쪽 앱은 `window.name`으로 pane을 알고 Supabase `auth.storageKey`를 pane별로 (`getAuthStorageKey()`, 3.1) → 두 데모 계정 동시 로그인 (pane마다 Try demo 자동). 창 폭 < 900이면 일반 framed로. DoD: 1440×900 한 화면에서 sitter **Complete with photo** → owner 폰에 토스트 ≤ 3초, 시크릿 창 없이 데모 스크립트 5단계 · 영상 녹화에도 사용 |

---

## Definition of Done (DoD)

1. **Cold start:** 팀원이 README만 보고 새 PC에서 로컬 실행 성공
2. **Judge path:** 데스크톱 브라우저에서 demo URL → 폰 프레임 + test owner/sitter 로그인 → 데모 스크립트 1–5를 **마우스만으로** 성공 (10.10 있으면 Split view 한 화면, 없으면 시크릿 창 2개). 사진은 샘플 트레이(4.7), 이동은 **Simulate the drive**(D32) — (08 완료 시) 스캔은 `chicken_jerky` 샘플로 DANGER. 같은 경로를 Playwright e2e로 운영 URL에 1회 실행 ([DESIGN.md §7.7](../../../DESIGN.md#77-works-with-a-mouse))
3. MIT license가 GitHub About에 표시
4. 제출 자료 **영어** (description, video audio, README)
5. 배포 URL에서 `/health` 200, cold start 포함 첫 응답 < 10초
6. backend 코드 1줄 변경 PR 머지 → 수동 개입 없이 운영 반영 (CD 확인), Vercel Preview URL이 PR에 표시
7. 폰(iPhone·Android)에서 demo URL → 프레임 없이 전체 화면, 터치로 같은 경로 동작

---

## 산출물

- `backend/scripts/seed_demo.py`, `backend/Dockerfile`, `.github/workflows/keepalive.yml`
- `docs/DEMO_ACCOUNTS.md`
- `frontend/components/shell/SidePanel.web.tsx` (10.9), split view in `AppShell.web.tsx` (10.10), `frontend/e2e/judge-path.spec.ts`
- Updated root `README.md` (Getting Started + Nemotron usage + Nebius services + Feedback log)

---

## AI 프롬프트

Playbook §12 — seed(10.1) / deploy backend(10.3) / deploy frontend(10.4) 각각 별도

---

## README 재작성 방침 (2026-10-11 결정 — 쓰는 시점은 제출 직전, 10.2)

> 심사위원이 README를 열자마자 **"기존 앱이 있는데 왜?"와 "왜 AI?"**가 보여야 한다. 아래는 브레인스토밍에서 정한 방침과 맨 위 블록 초안이다(확정 전).

**정한 것**

1. **제품 먼저, 이야기는 맨 위 두 줄.** 이야기 두 줄(왜 만들었나 · 왜 AI인가)을 README **가장 위**에 두고, 바로 아래에 제목 · 한 줄 소개 · 데모 링크를 둔다. 길게 늘어놓지 않는다.
2. **경쟁 서비스 이름은 쓰지 않는다.** 차이는 *기능이 있냐*가 아니라 **"그 일을 누가 하냐"**로 쓴다 — 시중 앱은 연결하고 예약마다 수수료를 가져가지만, 머무는 동안의 답장 · 규칙 · 일일 노트는 사람이 직접 친다. **우리가 수수료를 얼마 받는다/덜 받는다는 말은 쓰지 않는다**(만들어 둔 것이 없다 — 데모 결제뿐). 수수료 이야기를 더 하고 싶으면 What's Next에 비전으로만.
3. **근거는 경험으로:** "수십 번의 케어, 같은 반려동물을 여러 번 맡았다." 숫자는 쓰지 않는다. 시니어 이야기는 통계가 아니라 **관찰**("in our experience")로 쓴다.
4. **앱에 머물 이유(시팅 밖의 기능)** 한 줄을 5단계 띠 아래에 넣는다 — **지금 만들어진 것만 단정하고**, 계획은 "coming"으로 표시한다(아래).
5. **한국어 판(`docs/README.ko.md`)도 같이** 바꾼다.
6. 첫 화면 이미지/GIF(문의 → AI 초안 → 승인)는 **나중에**(영상과 함께).
7. 모든 문장은 쓰기 직전에 [test-guide 현황표](../test-guide.ko.md)와 대조해 **안 만든 것은 지우거나 "coming"** 으로 (10.2의 기존 규칙).

**맨 위 블록 초안 v0 (EN)**

```md
> **Why we built this.** After dozens of stays as pet sitters — many with the same dogs and cats — we kept seeing the same thing: apps connect owners and sitters, and take a cut of every booking, but the stay itself (replies, house rules, daily notes) is still typed by hand, and a lot of it happens outside the app.
> **Why AI.** In our experience, owners who find typing hard — often seniors — leave their pet's profile half empty, and sitters spend their time writing instead of caring. Goldito's AI does the typing; people approve.

# 🐾 Goldito
**Leave your pet, keep your peace of mind.** The whole stay — inquiry to the ride home — in one app, for dogs and cats.
[Live demo](https://goldito-petcare.vercel.app) · Demo video · Test accounts · *Nebius x NVIDIA Global AI Hackathon — Best Apps and Agents*
```

그 아래: ① "Why it matters" 두 칸 — **Owner:** your pet's status arrives on its own, without asking · **Sitter:** replies, notes and checklists are drafted for you, details aren't missed, more time to care → ② 5단계 띠(각 단계에 AI가 하는 일 한 문장) → ③ **More than sitting**(아래) → ④ 기존 상세(How It Works, Agent 표, Nemotron 사용, 아키텍처, Getting Started).

**More than sitting — 앱에 머물 이유 (README에 쓸 때의 기준)**

| 지금 만들어짐 (단정해도 됨, 제출 전 재확인) | 계획 (README에는 "coming"으로만) |
| :--- | :--- |
| Feed 앨범(날짜 · 분류) · Diary(시터의 일기 + 알림장) · **Pet Life Record**(다음 시터에게도 이어짐) · 즐겨찾기 시터 · 리뷰(양방향, 시터의 비공개 노트) · 알림 | Mood meter(재미용) · 8-bit Pet room · 스티커 · 카드 알림장 · 사진 요청 · 펫 스킨 · 가입 직후 "Max at a glance" 온보딩(11.15 — 마지막에 구현, 잘릴 수 있음) |

예문(EN): *"Between stays, Goldito keeps the pet's story: a photo album, a diary, and a Life Record that follows the pet to any sitter. Coming next: a mood meter and an 8-bit pet room."*

---

## Open items (남은 후속 작업 — 명세는 여기, 순서는 [TODO](../TODO.md))

| ID | 내용 | 담당 |
| :--- | :--- | :--- |
| **10.1 고정 데모 계정** | Profile → Demo tools · `POST /api/demo/reset`을 제거하고(`EXPO_PUBLIC_DEMO_TOOLS` · `DEMO_RESET_ENABLED` 끄기, `DemoTools.tsx` · `demoReset.ts` · `demo-tools.spec.ts` · `routers/demo.py` · CI env 줄 삭제) 시작 지점별 고정 계정(빈 · 펫만 · 수락됨→돌보는 중 · 끝남)으로 대체. 결정 필요: 한 계정을 두 심사위원이 동시에 쓰는 문제. **R60-3 – R60-5 흡수:** 리셋이 원자적이지 않음(삭제 뒤 실패하면 반쯤 리셋 — 로컬에서 실제로 겪음) · 오너의 여분 펫이 정원을 넘겨 리셋 실패 · `in_care`가 토론토 00:00–00:57에 실패 | 민식 |
| **10.1 시드 보강 (11.15 S1 이후)** | 데모 펫 Max · Mochi의 `pets.profile`(성격 답 · 안전 답)을 시드로 채워 시터 카드의 "at a glance"가 가입 흐름 없이 보이게 한다. S1이 잘리면 하지 않는다 | 민식 |
| **10.7 보강** | ① **`GET /health/deep`**(Supabase `select 1`)과 하루 한 번 핑 — 아직 없음(`health.py`에 `/health`뿐), Supabase 무료는 7일 쉬면 멈추고 심사는 12/1–12/15 ② 대시보드에서 **Leaked password protection** 켜기 ③ **KA-1**: 배포 · 테스트 · 녹화 전에 `keepalive` 간격 ≤ 15분과 cron-job.org `200 OK` 확인, 12/15까지 유지 | 민식 |
| **10.11 `/privacy` 페이지** | 라우트가 아직 없음. 저장하는 것 · AI 사용 · 데모 데이터를 적은 짧은 개인정보 페이지, Google OAuth 동의 화면과 Profile에서 링크 (OAuth "In production" — Testing 토큰은 7일 만료 — 에 필요, 도메인 `goldito-petcare.vercel.app`) | 민식 |
| **10.12 제출 체크리스트** | [해커톤 규칙 §4](../../hackathon/README.md) 기준: 데모 영상(< 3분, YouTube 공개, Token Factory + NVIDIA 모델 사용을 설명하는 음성, 저작권 음악 없음 — 민식 녹화 · 묵 편집 제안, 확인 필요, 10/27 녹화) · Devpost 설명 + 트랙 + Token Factory · 쓴 모델별 피드백(10.6) · README Getting Started + "How we use Nemotron"(10.2) · `docs/DEMO_ACCOUNTS.md`(10.5) · 레포 공개 + MIT가 About에 표시 + 실제 PII 없음 · 전부 영어 · **내부 초안 10/28** | 민식 · 묵 |

---

## 다음

→ [Phase 11 — P1 기능](phase-11.md) (P0 데모가 배포 URL에서 동작한 뒤에만)
