# Phase 10 — 데모 시드 · 배포 · 제출 README

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D18 배포, D19 시드

## Goal

심사위원·팀이 **15분 안에** "A Stay with Goldito" — [full-process.ko.md](../full-process.ko.md)의 **5단계(Inquiry → Meet & Greet → Booking → Care & Transit → Completion)** — 전체를 재현할 수 있게 **시드 데이터**, **공개 데모 URL**, **테스트 계정**, **루트 README 실행 가이드**를 완성하고, **12/15 심사 종료까지 데모가 살아 있게** 운영 준비를 끝낸다. 로그인 UX·Welcome·Try demo는 **[onboarding.ko.md](../onboarding.ko.md)** (OB.3·OB.5와 연동).

### Goal 달성 기준

- [ ] `backend/scripts/seed_demo.py` — owner, sitter, 강아지 Max(chicken allergy, med 08:00, walk 10:30) + 고양이 Mochi(feeding 09:00, litter 12:00) + Chloe 요금표·정책·Visitor parking + Robert 가상 출입 정보·집 좌표 + **지난 돌봄(Paul) Life Record·리뷰** (+ `--relative` 옵션 — 5단계 장면을 지금 시각 기준으로)
- [ ] README Getting Started: clone → env → migrate → seed → run → login
- [ ] Public frontend URL (Vercel) + backend URL (**Nebius AI Cloud Serverless Endpoint** — 정식; Render는 fallback만), production CORS
- [ ] 테스트 계정 문서 (Devpost 붙여넣기용)
- [ ] 12/15까지 유지 계획 실행 (keep-alive, 한도 모니터링)
- [ ] 데스크톱 브라우저: 폰 프레임 + 옆 안내 패널, **마우스만으로** 심사 경로 완주 (D25) · 폰 브라우저: 프레임 없이 전체 화면

---

## 선행 조건

- 시나리오 코어 완료: Phase 03B · 03C · 04 · 05 · 06 · 06B · 07 · 07B · 09 · 07C (08은 stretch — 있으면 데모 (+) 장면). 배포 리허설 10.3은 **10/18까지** Phase 06 시점에 먼저 1회 해도 좋음
- Phase 00 모든 키 production env에 설정

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| Vercel (Expo web export) + **Nebius AI Cloud** Serverless Endpoint (Docker) | App Store / Play 빌드 |
| Supabase keep-alive, 모니터링 | Multi-region HA |
| 3분 영상 스크립트 outline | 영상 편집 (묵) |
| Nebius/NVIDIA feedback 초안 | Devpost 최종 클릭 (민식) |
| 데스크톱 옆 안내 패널 (10.9) · Split view (10.10, stretch) | 시터 데스크톱 레이아웃 (해커톤 후, D25) |

---

## "A Stay with Goldito" 데모 스크립트 (Goal 시나리오 — [full-process.ko.md §6](../full-process.ko.md#6-데모-경로-a-stay-with-goldito))

| # | Stage | 액션 | 검증 (상대방 화면) | Phase |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Inquiry | Owner: Chloe 프로필 → **Ask about a stay** (Boarding · 2마리 · 연휴 포함 · 맡기기 Sitter drives · 찾기 Owner drives) → 답장 후 **Request booking** | Chloe(자동 발송 모드) "typing" → 약 30초 뒤 시터 말투 답장 + 견적 카드(공휴일·다두) + Life Record 출처 칩 / Sitter 알림 "your draft reply is ready" → 요청 카드 | 07B · 03C · 03B |
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
| 10.1 | Seed script | **계정 부분 완료 (2026-10-01):** `seed_demo.py`가 demo-owner/demo-sitter 생성·갱신 + `--check` 읽기 전용 확인 (backend/README "Demo accounts"). 남은 것: 아래 pet·예약·task·Paul·샘플 피드·`--reset`. `backend/scripts/seed_demo.py` (service role, D19): `auth.admin.create_user` × 2 (`demo-owner@pawddy.test`, `demo-sitter@pawddy.test`, `email_confirm=True`, 비밀번호는 env `DEMO_PASSWORD`), pet Max(dog, Maltese, 4y, allergy chicken, care_tasks medication+walk), pet Mochi(cat, Domestic Shorthair, 3y, care_tasks feeding+litter), **시나리오 데이터 (D27):** Chloe `sitter_rates`(Boarding 55 · House sitting 70 · Daycare 35 · +50% · +25%)·`services`·`policies`(가상 정책 문단 3개)·`visitor_parking`·`lobby_notes`·`home_lat/lng`(가상 좌표 — 공원 근처, 실제 주소 아님), Robert `owner_home_access`(가짜 lockbox `0000`·buzzer `#000` — 명백히 가짜 값)·`home_lat/lng`, `pet_cautions` 2개, `care_requests` 1개, Chloe **말투 데이터**(가상 시터 스타일 카드 + `tone_samples` 시드 — 익명화 원본이 아닌 공개용 샘플, 7B.8) · `ai_reply_mode='auto'` + `ai_consent_at`(장면 ① — 대기 없이 바로 사람 속도, D36) · Robert·Chloe·Paul `meet_spots` 각 2개(가상 공원 입구·카페 — 실제 주소 아님, D44) · **승인 대기 초안 1건**(시드 전용 견주 Joy → Chloe 문의, `status='draft'` — 시터 데모에서 Send / Edit / Regenerate 화면을 보여 주기 위함, D36), 결제·동의 완료 예약(`paid_at`, `booking_consents` 5종 — 서비스 role insert), 지난 9월 Paul 예약(완료) + `pet_life_records`(Max·Mochi) + `reviews`(★5) + RAG 인덱싱(`rag.index_source`), 데모 경로 JSON 2개(`assets/demo/routes/`), 공휴일 시드(03C),  sitter_availability open = 오늘-7일 ~ 오늘+60일, 모든 칸, 정원 3, 칸 시간 = Chloe 기본(Morning 08–12 · Afternoon 12–18 · Overnight 18–08), **확정 booking 1건 = 어제 09:30 맡김(Received 완료) ~ 오늘+6일 17:00 찾음, 장소 Chloe's place (Max + Mochi)** — 과거 시각이라 RPC가 아니라 service role로 `bookings` + `booking_pets`(care_range) + `booking_slots` + agreed `booking_handoffs`를 함께 insert (smoke test `_t_booking`과 같은 형태) → Try demo 즉시 "Now caring" + 과거 예약 1건(단골 표시용). 가짜 `home_address`, 추가로 시터2(Paul) 계정 + open 구간 (재예약 검색 데모용), owner_profiles 가짜 긴급 연락처, 샘플 feed 2개(선택, Cloudinary `goldito/demo/` 공용 이미지). **멱등** (`--reset`이면 demo 계정 데이터 삭제 후 재생성). 실제 PII 0 |
| 10.2 | README | 루트 README는 이미 5단계 흐름 구조 (2026-10-01) + **The Goldito Agent** 표(트리거 → 행동 → 사람 승인, D46 — 영상 내레이션도 같은 표현) — 배포 직전 **실제로 만든 기능과 대조**해 안 된 것은 지우거나 "What's Next"로 이동 (특히 08 stretch). Getting Started (복붙 명령, Windows/mac 둘 다), "How we use Nemotron" 표를 실제 model·latency(07.1·07B 지표)로 갱신, architecture 그림, **단계별 스크린샷 5장**. backend/frontend README 최신화 |
| 10.3 | Deploy backend | `backend/Dockerfile` (python:3.12-slim, `uvicorn app.main:app --host 0.0.0.0 --port 8000`). **Nebius AI Cloud:** Container Registry push → **Serverless Endpoint** 생성, env secret 주입, `/health` 확인 (Builders & Brews **AI Cloud $100** 크레딧 활용). **Render**는 Nebius만 막힐 때 fallback + README·피드백에 이유 기록. **CD:** `.github/workflows/deploy-backend.yml` — `push: main` + `paths: backend/**` + `workflow_dispatch(image_tag)`: docker build → Registry push (tag = `${{ github.sha }}`) → Endpoint 이미지 갱신 → `curl -f $BACKEND_URL/health` 재시도 5회. 첫 배포는 수동으로 Endpoint 생성 후 워크플로는 갱신만 담당 ([architecture §11](architecture.ko.md#11-cicd-파이프라인-d20)) |
| 10.4 | Deploy frontend | **Vercel 연결은 2026-10-02에 앞당김** — `frontend/vercel.json` + [env-setup.ko.md § Vercel](../env-setup.ko.md); 10.4에서는 production env·CORS·도메인만 마무리. `npx expo export -p web` → `dist/` → Vercel (SPA rewrite `/(.*) → /index.html`), env `EXPO_PUBLIC_*` production 값. backend `CORS_ORIGINS`에 Vercel 도메인 추가. **CD:** Vercel GitHub 연동 — Root Directory `frontend`, Build `npx expo export -p web`, Output `dist`. PR마다 Preview URL, main 머지 시 production. Preview 도메인(`*.vercel.app`)은 CORS에 정규식으로 허용하거나 Preview는 staging backend 없이 UI 확인용으로만 사용. **폰 프레임이 같은 도메인 iframe이므로** 보안 헤더를 넣을 때 `X-Frame-Options: DENY` 금지, CSP는 `frame-ancestors 'self'` (D25) |
| 10.5 | 데모 계정 문서 | `docs/DEMO_ACCOUNTS.md`: URL, 이메일 2개, 비밀번호는 repo에 적지 않고 **Devpost 제출란**과 배포 env(`DEMO_PASSWORD` 시드용, `EXPO_PUBLIC_DEMO_PASSWORD` Try demo용 — 데모 계정 전용 값, [onboarding.ko.md](../onboarding.ko.md))에만 (repo엔 "see submission"), 데모 순서 5줄 |
| 10.6 | Feedback log | README 피드백 표: Token Factory, Serverless Endpoint, 각 Nemotron 모델별 (용도 / 잘된 점 / 개선점 / 온보딩 / 재사용 의향) — 개발 중 `notes/`에 쌓인 메모 정리 |
| 10.7 | 유지 계획 (~12/15) | ① Supabase 무료 일시정지 방지: `.github/workflows/keepalive.yml` cron(매일) → backend `GET /health/deep`(Supabase `select 1` 수행; `/health`는 가볍게 유지) ② Cloudinary·Nebius 크레딧 잔량 주 1회 확인 (캡처 1장 ≈ 비용 계산표) ③ 데모 계정 데이터 오염 시 `seed_demo.py --reset` |
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

- `backend/scripts/seed_demo.py`, `backend/Dockerfile`, `.github/workflows/deploy-backend.yml`, `.github/workflows/keepalive.yml`
- `docs/DEMO_ACCOUNTS.md`
- `frontend/components/shell/SidePanel.web.tsx` (10.9), split view in `AppShell.web.tsx` (10.10), `frontend/e2e/judge-path.spec.ts`
- Updated root `README.md` (Getting Started + Nemotron usage + Nebius services + Feedback log)

---

## AI 프롬프트

Playbook §12 — seed(10.1) / deploy backend(10.3) / deploy frontend(10.4) 각각 별도

---

## 다음

→ [Phase 11 — P1 기능](phase-11.md) (P0 데모가 배포 URL에서 동작한 뒤에만)
