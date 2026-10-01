# PawNote P0 — 공통 설계 청사진 (모든 Phase가 따름)

> 각 phase 문서는 **이 문서의 결정·구조·규칙을 전제**로 작성되어 있습니다.
> 이 문서와 [README.ko.md §9 데이터 모델 요약](../README.ko.md#9-데이터-모델-요약) 또는 [Playbook](../P0-ai-prompt-playbook.ko.md)이 다르면 **이 문서 + phase 문서가 우선**입니다.
> 결정을 바꾸면 이 문서의 §1 결정 로그부터 고치고, 영향받는 phase 문서를 함께 수정합니다.

---

## 1. 결정 로그 (확정)

| # | 주제 | 결정 | 이유 |
| :--- | :--- | :--- | :--- |
| D1 | 데모·UI·AI 출력 언어 | **영어만 (EN)**. UI 문자열, AI 캡션·알림장·경고문 모두 영어 | 심사위원·영상이 영어. 실무 few-shot 원본도 **영어** — 슬기는 **익명화(PII 제거)** 후 `few_shot.json`에만 커밋 |
| D2 | 프론트 라우팅 | **expo-router** (파일 기반, TypeScript) | 웹 URL = 화면. 역할별 route group 분리 용이 |
| D3 | 패키지 관리 | Frontend **npm**, Backend **requirements.txt + venv** | 해커톤 속도 |
| D4 | Python 버전 | **3.12** (로컬·Docker 동일). 3.14는 휠 미지원 패키지 위험 | 재현성 |
| D5 | 데이터 접근 패턴 | **A안:** 프론트 = Supabase JS + RLS (조회·단순 쓰기), FastAPI = Cloudinary 서명, AI, service-role이 필요한 작업 | CLAUDE.md §2 |
| D6 | 권한이 섞이는 쓰기 | **DB 함수(RPC, `security definer`) 또는 트리거**로 처리. 클라이언트에 넓은 update 정책을 주지 않음 | RLS 단순화, 타인 알림 insert 금지 |
| D7 | 알림 생성 | **DB 트리거**가 `notifications` insert (앱 레이어 insert 금지) | sitter가 owner 알림을 직접 insert할 수 없게 |
| D8 | 시간대 | 앱 전체 기준 `APP_TIMEZONE=America/Toronto`. "오늘" = 이 시간대 00:00–24:00 | task_logs 생성·알림장 집계 일관성 |
| D9 | missed 상태 | **저장하지 않고 파생**: `status='pending' AND now() > due_at + 60분` | 스케줄러 없이 P0 충족 |
| D10 | 피드 게시물 : 미디어 | **1 post = 1 media** (`feed_posts.media_id`). 다중 사진은 P1 | 단순화 |
| D11 | 캡션 위치 | `feed_posts.caption`만 사용 (`media.caption` 없음) | 중복 제거 |
| D12 | AI 이미지 입력 | 백엔드가 Cloudinary에서 `w_1024,f_jpg` 변환본을 받아 **base64 data URL**로 모델에 전달. 영상은 `so_0` 썸네일 jpg | 모델 서버의 외부 URL fetch 가능 여부에 의존하지 않음 |
| D13 | 세이프티 입력 | 성분표도 **일반 업로드 파이프(Phase 04)** 로 올린 뒤 `POST /api/ai/safety-check {pet_id, media_id}` (multipart 아님) | 업로드 코드 재사용, 증거 이미지 보관 |
| D14 | JWT 검증 | Supabase **JWKS**(`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, ES256/RS256) 우선, 레거시 프로젝트면 `SUPABASE_JWT_SECRET`(HS256) fallback | 신규 프로젝트는 asymmetric key 기본 |
| D15 | 프로필 생성 | `auth.users` insert 트리거가 `raw_user_meta_data.role/display_name`으로 `profiles` 생성. **이메일 확인(Confirm email) OFF** | 가입 직후 세션 없음 문제 회피 |
| D16 | sitter 배정 | ~~sitter 이메일로 고정 배정~~ → **D24 기간 예약으로 대체** (2026-09-29) | 실제 펫시팅은 여행 기간 단위 |
| D17 | 리마인더 (P0) | **클라이언트 인앱 리마인더**: sitter 앱이 열려 있으면 30초마다 due 체크 → 배너+토스트. 서버 푸시는 stretch (6.7, Nebius Serverless Jobs) | 스케줄러 없이 데모 08:00 구간 재현 |
| D18 | 배포 | **Backend API:** **Nebius AI Cloud — Serverless Endpoint** (Docker + FastAPI). **Frontend:** `expo export -p web` → **Vercel**. **Render**는 Nebius 배포가 막힐 때만 **긴급 fallback** (제출·피드백·데모 URL은 Nebius Endpoint를 정식 경로로 기록) | Token Factory=추론, AI Cloud=API 호스팅 (별도 크레딧). 심사·피드백에서 Nebius 인프라 명시 |
| D19 | 시드 계정 생성 | Python + Supabase Admin API (`auth.admin.create_user`) — SQL로 auth.users 직접 insert 금지 | 비밀번호 해시·트리거 정상 동작 |
| D20 | CI/CD | **CI:** GitHub Actions `ci.yml` (PR·main push) — backend ruff+pytest, frontend tsc+web export+Playwright 마우스 테스트(1.7). **CD:** frontend = Vercel Git 연동(PR Preview, main 자동 배포), backend = `deploy-backend.yml`(main + `backend/**` 변경 시 Docker → Nebius Registry → Serverless Endpoint). **DB migration은 수동** (SQL Editor, 순서대로) | 해커톤 중 운영 DB 자동 변경 위험 회피, 워크플로 최소화 |
| D21 | 프로필 구조 | 공통 `profiles`(id, role, display_name) + 역할별 1:1 `owner_profiles`(긴급 연락처·동물병원) / `sitter_profiles`(소개·활동 지역·경력). 가입 트리거가 role에 맞는 행을 함께 생성. 시터는 강아지·고양이 모두 돌봄 (종 제한 없음) | RLS·폼이 역할별로 깔끔. nullable 컬럼 혼재 방지 |
| D22 | 종 지원 | **강아지·고양이** — `pets.species in ('dog','cat')`, 생성 후 변경 불가. 모든 FK·API 필드는 `pet_id` | 제품이 dogs & cats 대상. 추후 종 확장은 check만 넓힘 |
| D23 | 종별 케어 | `care_tasks.type in ('medication','walk','feeding','litter','play','sleep')`. `walk`=강아지만, `litter`=고양이만 (트리거 `guard_care_task_species`). 세이프티 독성 목록도 종별 (phase-08) | 고양이 산책 같은 잘못된 데이터 차단, 고양이 전용 독성(백합 등) 반영 |
| D24 | 파트타임 보딩 시터 · 칸 · 인수인계 | 시터는 **파트타임**이고 반려동물을 **시터 집에서** 돌봄. 칸은 **이름만 고정**(Morning·Afternoon·Overnight) — 정확한 시간은 시터가 칸마다 정함(`sitter_availability.starts_at/ends_at`) + 칸 정원 `max_pets`. 예약 = 시터 1명 + 견주 1명. **누가 언제 맡나** = `booking_pets.care_range`(맡긴 구간, 반려동물마다 겹침 금지 — exclusion 제약), **정원** = `booking_slots`(반려동물 × 날짜 × 칸, 그 시터의 칸 시간 기준). 겹치는 open 행은 **가장 최근 행**이 그 날의 시간·정원을 정함. 열지 않은 칸은 맡긴 구간이 절반 넘게 덮을 때만 차지(빈 Overnight 방지) — 앞뒤로 짧게 삐져나온 시간은 custom 시각으로 협의. 견주가 **맡기는 시각·찾는 시각·장소**(시터 집/견주 집/기타)를 정함 → `booking_handoffs`. 시터 시간 밖·장소 변경은 **협의**(제안 → 상대방 동의), 확정 후 변경도 제안→동의, 동의 전엔 기존 값 유효. 견주는 **여행 전체를 한 시터에게**가 기본 — 단골 스케줄 먼저, 없으면 검색(전체 가능 먼저). 시터가 확정 칸을 막으려 하면 거부 → **예약 전체 취소**(맡기기 전만 — Received 뒤엔 찾는 시각 변경으로) → 견주 재예약. 권한·할 일 담당은 칸이 아니라 **맡긴 시각 ~ 찾는 시각** 구간으로 판단. 스케줄 변경은 알림 없음. 주소는 확정 당사자에게만(찾은 뒤 24시간까지) | 반려동물에게 시터 교체는 스트레스 → 한 명이 기본. 실제 맡기는 시각이 시터 근무 시간과 다를 수 있어 협의 필요 |
| D25 | 웹 표시 방식 (데스크톱 = 폰 프레임) | 컴퓨터 브라우저(마우스·트랙패드가 주 입력 — `pointer: coarse`가 아님, **창 폭 무관**)에서는 **402 × 874 폰 프레임** 안에 **같은 앱을 same-origin iframe**으로 띄움 (`components/shell/AppShell.web.tsx` — 네이티브는 `AppShell.tsx`가 children 그대로). 폰 브라우저·네이티브·iframe 내부는 앱 그대로. iframe 안에서 **마우스일 때만** `TouchEmulation`: 드래그 스크롤 + 관성, 드래그 후 클릭 차단, 가로 줄 휠 변환, 글자 선택·이미지 드래그 금지, 원형 커서, 스크롤바 숨김. 사진 선택은 `pickMedia()` 하나 — 데스크톱·데모 계정은 샘플 사진 트레이(4.7). 모드 결정은 `resolvePresentation()` 한 곳, 화면 분기는 `useLayoutMode()`만, 탭은 expo-router JS `Tabs`(NativeTabs 아님). **해커톤 후(마지막 우선순위):** 시터만 데스크톱 `expanded` 레이아웃(iframe 없이 사이드바) — Owner는 계속 프레임 | 심사위원은 PC로 봄 → 폰과 같은 경험 + 마우스로 모든 동작 필요. 앱을 박스에 직접 넣으면 RN `Modal`·Expo Router 웹 모달이 `document.body`로 portal되고(웹 모달은 `min-width: 768px`면 데스크톱 다이얼로그), 창 크기·미디어쿼리가 브라우저 기준이라 깨짐 — react-native-web 0.21.2·expo-router 57.0.24 소스 확인. iframe 안은 진짜 폰 화면이라 화면마다 지킬 금지 규칙이 거의 없음. 402 = 현재 기본 iPhone(17) 폭, 레이아웃은 360–440 대응 |

---

## 2. 리포 구조 (최종 형태)

```
PawNote/
├─ README.md                  # 제품 + Getting Started (Phase 10에서 완성)
├─ CLAUDE.md
├─ .gitignore                 # .env, data/raw/, node_modules, __pycache__, .venv, dist
├─ .github/workflows/
│  ├─ ci.yml                  # Phase 01.5 — PR 검사 (backend / frontend 2 job)
│  ├─ deploy-backend.yml      # Phase 10.3 — main → Nebius Serverless Endpoint
│  └─ keepalive.yml           # Phase 10.7 — 매일 /health/deep 호출
├─ docs/
├─ supabase/
│  ├─ README.md               # ERD 요약 + 적용 순서
│  ├─ migrations/
│  │  ├─ 001_initial_schema.sql
│  │  ├─ 002_rls_policies.sql
│  │  ├─ 003_functions_triggers.sql   # 헬퍼·가입 트리거·예약 RPC·충돌 트리거·realtime (Phase 02)
│  │  ├─ 004_feed_notifications.sql   # Phase 05
│  │  ├─ 005_tasks.sql                # Phase 06 (ensure_today_task_logs, complete_task_log)
│  │  ├─ 006_reports.sql              # Phase 07 (send_daily_report)
│  │  ├─ 007_safety.sql               # Phase 08 (DANGER 알림 트리거)
│  │  └─ 008_p1.sql                   # Phase 11 (P1)
│  └─ tests/rls_smoke.sql     # 역할 전환 RLS 확인 쿼리
├─ backend/
│  ├─ requirements.txt
│  ├─ Dockerfile              # Phase 10
│  ├─ .env.example
│  ├─ README.md
│  ├─ app/
│  │  ├─ main.py              # FastAPI app, CORS, router include, 에러 핸들러
│  │  ├─ config.py            # pydantic-settings (아래 §4 env 전부)
│  │  ├─ deps/
│  │  │  ├─ auth.py           # get_current_user, require_role("sitter")
│  │  │  └─ supabase.py       # service-role client (싱글톤)
│  │  ├─ services/
│  │  │  ├─ authz.py          # assert_owner_of(pet_id), assert_on_duty_for(pet_id)
│  │  │  ├─ cloudinary.py     # sign params, delivery URL, fetch image → base64
│  │  │  ├─ nebius.py         # model role → (model_id, base_url), chat(), chat_json()
│  │  │  └─ timeutil.py       # APP_TIMEZONE 기준 today/day range
│  │  ├─ routers/
│  │  │  ├─ health.py         # GET /health
│  │  │  ├─ me.py             # GET /api/me
│  │  │  ├─ media.py          # POST /api/media/sign, /api/media/complete
│  │  │  ├─ ai_caption.py     # POST /api/ai/caption
│  │  │  ├─ ai_daily_report.py# POST /api/ai/daily-report
│  │  │  └─ ai_safety.py      # POST /api/ai/safety-check
│  │  ├─ schemas/             # pydantic request/response 모델 (라우터별 파일)
│  │  └─ ai/prompts/
│  │     ├─ caption/{system.md}
│  │     ├─ daily_report/{PROMPT.md, system.md, few_shot.json}
│  │     └─ safety/{vision_system.md, reasoning_system.md}
│  ├─ scripts/
│  │  ├─ test_nebius.py       # Phase 07.1
│  │  └─ seed_demo.py         # Phase 10.1
│  └─ tests/                  # pytest (JSON 파싱, authz, 스키마)
└─ frontend/
   ├─ package.json, app.json, tsconfig.json
   ├─ .env.example
   ├─ README.md
   ├─ playwright.config.ts    # 1.7 — 마우스 전용 테스트 설정
   ├─ e2e/                    # 1.7 — Playwright (데스크톱 프레임 + 마우스) / 10.x 심사 경로
   ├─ app/                    # expo-router (§3)
   │  └─ dev/gestures.tsx     # 1.7 — 마우스 동작 테스트 화면 (EXPO_PUBLIC_DEV_ROUTES=1일 때만)
   ├─ assets/demo/            # 4.7 — 샘플 사진 (강아지·고양이 일상, 가상 브랜드 간식 라벨 — PII 없음)
   ├─ components/shell/       # D25 — AppShell.tsx / AppShell.web.tsx, DeviceFrame.web.tsx, TouchEmulation.web.ts, presentation.ts, useLayoutMode.ts, useShell.ts (화면은 `useShell`·`useLayoutMode`만 import)
   ├─ components/ui/          # Button, Card, Screen, EmptyState, Skeleton, Badge, Toast, AlertModal, Sheet, HorizontalList
   ├─ components/             # 도메인 컴포넌트 (FeedCard, TaskRow, PetSwitcher, NotificationItem, MediaPicker …)
   ├─ features/<domain>/      # 화면별 데이터·상태 훅 use*.ts (route 파일은 얇게 — D25, 해커톤 후 시터 데스크톱 화면이 재사용)
   ├─ lib/
   │  ├─ supabase.ts          # createClient(anon) + web session persist
   │  ├─ api.ts               # FastAPI fetch 래퍼 (Bearer 자동, 에러 정규화)
   │  ├─ media.ts             # pickMedia() — 모든 사진 선택의 유일한 진입점 (4.7)
   │  ├─ cloudinary.ts        # uploadMedia(), thumbUrl(), videoPosterUrl()
   │  ├─ feed.ts              # createFeedPost() — Phase 05/06/09 공용
   │  └─ time.ts              # APP_TIMEZONE 표시 포맷
   ├─ providers/              # SessionProvider, PetProvider(선택된 pet), ToastProvider, NotificationsProvider(Realtime)
   ├─ theme/tokens.ts         # 색·간격(8px)·radius·타이포·layout·breakpoint — 묵 Figma 토큰으로 교체
   └─ types/db.ts             # Supabase 테이블 타입 (수동 or supabase gen types)
```

---

## 3. 화면 & 라우트 맵 (최종 형태)

| Route | 역할 | 화면 | 주 액션 (1개) | 도입 Phase |
| :--- | :--- | :--- | :--- | :--- |
| `/` | - | 세션·역할 보고 redirect (미로그인 → welcome) | - | 03 → OB.1 |
| `/(public)/welcome` | - | Welcome + **Try demo** (Owner / Sitter) · "Already have an account?" | Try demo | OB.1 ([onboarding.ko.md](../onboarding.ko.md)) |
| `/(auth)/login` | - | Login | Sign in | 03 |
| `/(auth)/signup` | - | Sign up (+ role 선택 1회) | Create account | 03 |
| `/(owner)/` (tab: Home) | owner | My pets 카드 + 오늘 요약 | Add pet | 03 |
| `/(owner)/pets/new`, `/(owner)/pets/[petId]` | owner | Pet profile (**종 Dog/Cat**·이름·품종·생일·메모·**알레르기 chips**) | Save | 03 |
| `/(owner)/bookings`, `/(owner)/bookings/new`, `/(owner)/bookings/[bookingId]`, `/(owner)/sitters/[sitterId]` | owner | 예약 목록 / 단골 스케줄 확인·검색·요청 / 상세·재예약 / 시터 스케줄 | Book care | 03B |
| `/profile` | both | 역할별 프로필 편집 (주소·bio 등) — **Settings 아님** | Save | 03 |
| `/settings` | both | 계정·알림·앱 정보 · **What's New**(패치노트) | — | **11.11 (P1)** |
| `/(owner)/feed` (tab: Feed) | owner | 선택 pet 타임라인 (PetSwitcher) | 스크롤 | 05 |
| `/(owner)/tasks` (tab: Care) | owner | Task 등록 + 오늘 상태 · **Activity** 히스토리 (Plan B) | Add task | 06 |
| `/(owner)/reports` , `/(owner)/reports/[reportId]` (tab: Reports) | owner | 알림장 목록 / 읽기 | 읽기 | 07 |
| `/(owner)/notifications` (header bell) | owner | 알림 센터 | 탭 → 해당 화면 | 05 |
| `/(sitter)/` (tab: Today) | sitter | 담당 pet · 예약 · **Quick check-ins**(meal/potty/mood/note) · due 배너 | Mark done / check-in | 03(스텁) → 03B → 06 |
| `/(sitter)/schedule` | sitter | 스케줄 캘린더 (날짜 × 칸 open + 시간 + 정원 / blocked) | Save | 03B |
| `/(sitter)/bookings`, `/(sitter)/bookings/[bookingId]` | sitter | 요청함 · 예정 · 지난 예약 / 인수인계·Received·Returned | Accept | 03B |
| `/(sitter)/pets/[petId]` | sitter | Pet 피드 (sitter 뷰) | **+ Photo** (FAB) | 05 |
| `/(sitter)/tasks` (tab: Tasks) | sitter | 오늘 task_logs (pending 먼저) | **Mark done** / Done with photo | 06 |
| `/(sitter)/scan` (tab: Scan) | sitter | Treat scanner | **Scan label** | 08 |
| `/(sitter)/report` (tab: Report) | sitter | 퀵탭 체크 → Generate → (편집) → Send | **Send report** | 07 |
| `/(sitter)/notifications` (header bell) | sitter | 알림 센터 | 탭 → 해당 화면 | 05 |
| `/dev/gestures` | - | 마우스 동작 테스트 화면 (긴 목록·가로 줄·모달·토스트·입력창). `EXPO_PUBLIC_DEV_ROUTES=1`일 때만, 링크 없음 | - | 1.7 |

- 탭: owner `Home · Feed · Care · Reports`, sitter `Today · Tasks · Scan · Report`. 알림 벨은 두 역할 모두 헤더 우측 (unread badge). 탭은 expo-router **JS `Tabs`** (NativeTabs 아님 — D25: 해커톤 후 시터 데스크톱에서 `tabBarPosition: 'left'`로 사이드바 전환).
- 웹 쿼리 (D25, 모든 route 공통): `?frame=0` 폰 프레임 끄기 · `?frame=1` 강제로 켜기 · `?view=split` Owner·Sitter 폰 나란히 (10.10 stretch).
- pet이 여러 마리면 `PetProvider`의 선택값을 모든 탭이 공유 (헤더 PetSwitcher, 종 아이콘 🐶/🐱). 데모는 2마리(Bori 강아지, Mochi 고양이).
- 역할 가드: `(owner)`/`(sitter)` 그룹 `_layout.tsx`에서 role 불일치 시 `/`로 redirect.

---

## 4. 환경 변수 마스터 목록

`.env.example`에 **아래 이름 그대로** 둡니다. (실제 값은 `.env`, git 제외)

### backend/.env

| 변수 | 예시 / 기본값 | 사용 Phase |
| :--- | :--- | :--- |
| `APP_ENV` | `local` \| `production` | 01 |
| `APP_TIMEZONE` | `America/Toronto` | 06, 07 |
| `CORS_ORIGINS` | `http://localhost:8081,http://localhost:19006` (콤마 구분) | 01 |
| `SUPABASE_URL` | `https://<ref>.supabase.co` | 03 |
| `SUPABASE_SERVICE_ROLE_KEY` | (secret) | 04 |
| `SUPABASE_JWT_SECRET` | (레거시 HS256 프로젝트만, 비워도 됨) | 03 |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | | 04 |
| `NEBIUS_API_KEY` | (secret) | 07 |
| `MODEL_VISION` / `MODEL_VISION_BASE_URL` | `openbmb/MiniCPM-V-4_5` / us-central1 URL (0.3 확정 — Nano Omni는 카탈로그에 없음, [model-ids.md](notes/model-ids.md)) | 08, 09 |
| `MODEL_SAFETY` / `MODEL_SAFETY_BASE_URL` | `nvidia/Nemotron-3-Ultra-550b-a55b` / us-central1 | 08 |
| `MODEL_REPORT` / `MODEL_REPORT_BASE_URL` | `nvidia/nemotron-3-super-120b-a12b` / us-central1 | 07 |
| `MODEL_FAST` / `MODEL_FAST_BASE_URL` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` / eu-north1 | 07.1 테스트, P2 |
| `TAVILY_API_KEY` | Tavily 대시보드 (Builders & Brews 등). **backend만** | 08.7 stretch (세이프티 웹 검색, 못 하면 11.3). [tavily.ko.md](../tavily.ko.md) |

### frontend/.env (모두 공개값 — `EXPO_PUBLIC_` 접두사)

| 변수 | 사용 Phase |
| :--- | :--- |
| `EXPO_PUBLIC_API_URL` (예: `http://localhost:8000`) | 01 |
| `EXPO_PUBLIC_SUPABASE_URL` | 03 |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | 03 |
| `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` (delivery URL 조립용) | 04 |
| `EXPO_PUBLIC_APP_TIMEZONE` (`America/Toronto`) | 06 |
| `EXPO_PUBLIC_DEMO_PASSWORD` (데모 계정 전용 비밀번호 — 번들에 들어가는 공개값. 실제 계정·service key 금지) | OB.2, 10 |
| `EXPO_PUBLIC_DEV_ROUTES` (`1`이면 `/dev/gestures` 노출 — 로컬·CI만, 운영 env에는 두지 않음) | 1.7 |

> ❌ service role key, Cloudinary secret, Nebius key는 **절대** frontend env에 두지 않습니다.

---

## 5. API 공통 규약 (FastAPI)

- Base: `/health`(무인증), 나머지 `/api/*`는 **`Authorization: Bearer <supabase access_token>` 필수**.
- 인가: service-role로 DB에 접근하는 라우터는 반드시 `services/authz.py`의 `assert_on_duty_for`(시터 — 오늘이 확정 예약 기간 안) / `assert_owner_of`를 먼저 호출 (service role은 RLS를 우회하므로).
- 에러 형식: `{"detail": "<human message>", "code": "<snake_case>"}` — 코드 예: `unauthorized`(401), `forbidden`(403), `not_found`(404), `invalid_input`(422), `ai_timeout`(504), `ai_invalid_output`(502), `upstream_error`(502).
- 타임아웃 (서버→Nebius): caption 20s, daily-report 60s, safety 90s (vision 30 + reasoning 60). 프론트 fetch 타임아웃은 여기에 +5s.
- 모든 AI 응답에 `model`(사용한 model id)과 `latency_ms` 포함 → 피드백 로그·데모 설명에 사용.

### 엔드포인트 계약 (전체)

| Method | Path | 권한 | Body | Response | Phase |
| :--- | :--- | :--- | :--- | :--- | :--- |
| GET | `/health` | - | - | `{status:"ok"}` | 01 |
| GET | `/health/deep` | - | - | `{status:"ok", db:"ok"}` (Supabase `select 1`) — keep-alive 전용 | 10 |
| GET | `/api/me` | any | - | `{id, email, role, display_name}` | 03 |
| POST | `/api/media/sign` | on-duty sitter | `{pet_id, resource_type:"image"\|"video", purpose}` | `{cloud_name, api_key, timestamp, signature, folder, upload_url}` | 04 |
| POST | `/api/media/complete` | on-duty sitter | `{pet_id, public_id, resource_type, purpose, width?, height?, duration?}` | `{media_id, public_id, secure_url, thumb_url}` | 04 |
| POST | `/api/ai/caption` | on-duty sitter | `{pet_id, media_id}` | `{caption, source:"ai"\|"fallback", model, latency_ms}` | 09 |
| POST | `/api/ai/daily-report` | on-duty sitter | `{pet_id, date:"YYYY-MM-DD", inputs:{meal?, water?, potty?, mood?, note?}}` | `{report_id, body, status:"draft", model, latency_ms}` | 07 |
| POST | `/api/ai/safety-check` | on-duty sitter | `{pet_id, media_id}` | `{safety_check_id, safety_status, matched_allergens[], detected_ingredients[], unknown_ingredients[], warning_message, model, latency_ms}` | 08 |
| POST | `/api/ai/pet-theme` | owner of pet | `{pet_id, media_id}` | `{theme, coat_colors[], confidence, model, latency_ms}` (실패·저신뢰 시 `theme:"default"`) | 11.10 (P1) |
| POST | `/api/ai/report-decor` | on-duty sitter | `{report_id}` | `{theme, preset_stickers[], model, latency_ms}` (실패 시 `theme:"calm"`, `[]`) | 11.8 (P1) |

> 알림장 **전송**, task **완료**, 피드 **게시**는 FastAPI가 아니라 Supabase(RLS/RPC)로 처리합니다 (§6).

---

## 6. 쓰기 경로 요약 (누가 무엇을 어디로 쓰나)

| 동작 | 경로 | 부수효과 (트리거) |
| :--- | :--- | :--- |
| 가입 | Supabase Auth `signUp({options:{data:{role, display_name}}})` | `handle_new_user` → `profiles` + `owner_profiles`/`sitter_profiles` |
| pet 생성/수정, 알레르기, care_tasks | Supabase client (owner RLS) | `guard_care_task_species` |
| 스케줄 open(칸·시간·정원)/blocked | Supabase client `sitter_availability` (본인 RLS). 기간 일부 변경 = 새 open 행 insert (최근 행 우선) | 확정 칸과 겹치거나 정원이 확정 마리 수보다 작아지면 `guard_availability_change`가 거부 → 시터가 먼저 `cancel_booking`. **알림 없음** |
| 단골 시터·스케줄 보기 | RPC `list_my_sitters()` / `get_sitter_schedule(sitter, from, to)` | - |
| 시터 검색 | RPC `search_sitters(drop_off_at, pick_up_at, pet_count)` — 전체 가능 먼저, 일부 가능은 참고용 | - |
| 인수인계 시각·장소 제안 / 응답 | RPC `propose_handoff` / `respond_handoff` | 상대방 `handoff_proposed` / 제안자 `handoff_agreed` |
| 받았음 / 돌려줬음 | RPC `complete_handoff` (시터) | owner `pet_dropped_off` / `pet_picked_up` |
| 예약 요청 / 응답 / 취소 | RPC `request_booking` / `respond_booking` / `cancel_booking` (취소는 맡기기 전만) | 상대방에게 `booking_*` 알림 |
| 예약 반려동물 · 내 시터 프로필 조회 | RPC `get_booking_pets(booking)` / `get_my_sitter_profile()` | - |
| 오늘 task_logs 생성 | RPC `ensure_today_task_logs(pet_id)` — 화면 진입 시 자동 호출, 멱등 | - |
| 미디어 등록 | FastAPI `/api/media/complete` (service role) | - |
| 피드 게시 | Supabase client insert `feed_posts` (sitter RLS) — `lib/feed.ts` | `notify_feed_post` → owner `feed_post` (task 연결 post는 제외) |
| task 완료 | RPC `complete_task_log(task_log_id, media_id)` → 내부에서 feed_post도 생성 | owner `task_done` |
| 알림장 초안 | FastAPI `/api/ai/daily-report` (service role upsert) | - |
| 알림장 전송 | RPC `send_daily_report(report_id, body)` | owner `report_sent` |
| 세이프티 결과 | FastAPI `/api/ai/safety-check` (service role insert) | DANGER면 owner `safety_danger` |
| 경고 확인 | Supabase client update `safety_checks.acknowledged_at` (sitter RLS) | - |
| 알림 읽음 | Supabase client update `notifications.read_at` (본인 RLS) | - |

---

## 7. 알림 매트릭스 (P0)

| type | 수신자 | 생성 위치 | 제목 예 (EN) | 탭 시 이동 |
| :--- | :--- | :--- | :--- | :--- |
| `booking_requested` | sitter | `request_booking` RPC | "New booking request: Oct 5 – Oct 12" | `/(sitter)/bookings` |
| `booking_confirmed` / `booking_declined` | owner | `respond_booking` RPC · `booking_declined`는 확정 전 협의에서 시터가 거절할 때 `respond_handoff`도 | "Mina confirmed your booking for Bori and Mochi 🎉" | `/(owner)/bookings/[id]` |
| `handoff_proposed` | 상대방 | `propose_handoff` RPC | "Jun suggested drop-off at 8:30 AM" | 예약 상세 |
| `handoff_agreed` | 제안자 | `respond_handoff` RPC | "Jisoo agreed to pick-up at 8:00 PM" | 예약 상세 |
| `handoff_declined` | 제안자 | `respond_handoff` RPC (확정 후 변경 거절) | "Mina declined the pick-up change" | 예약 상세 |
| `pet_dropped_off` / `pet_picked_up` | owner | `complete_handoff` RPC | "Bori and Mochi arrived at Mina's 🏠" / "Bori and Mochi are on the way home 👋" | 예약 상세 |
| `booking_cancelled` | 상대방 | `cancel_booking` RPC · 확정 전 협의에서 견주가 거절할 때 `respond_handoff`도 | "Mina can't take Bori and Mochi on Oct 5–8. Find a new sitter." | 예약 상세 (**Find a new sitter**) |
| `feed_post` | owner | 트리거 on `feed_posts` insert (`task_log_id is null`) | "New photo of Bori 📸" | `/(owner)/feed` |
| `task_done` | owner | `complete_task_log` RPC | type별: "Bori had breakfast on time 🍽️" / "Bori is asleep 😴" / "Bori's medication is done 💊" | `/(owner)/tasks` (Activity) |
| `care_checkin` | owner | `log_care_checkin` RPC | kind별: meal / potty / mood / note (Plan B — [sitter-care-loop.ko.md](../sitter-care-loop.ko.md)) | `/(owner)/tasks` (Activity) |
| `report_sent` | owner | `send_daily_report` RPC | "Today's report for Bori is here 📝" | `/(owner)/reports/[id]` |
| `safety_danger` | owner | 트리거 on `safety_checks` insert (`safety_status='DANGER'`) | "Blocked a risky treat for Bori ⚠️" | `/(owner)/notifications` |
| `task_due` (stretch) | sitter | Serverless Job / APScheduler (6.7) | "Bori's walk is due at 10:30" | `/(sitter)/tasks` |
| `photo_request` (P1) | sitter | Phase 11 | "Owner asked for a photo of Bori" | `/(sitter)/pets/[id]` |

프론트: `NotificationsProvider`가 `notifications` Realtime(INSERT, `user_id=eq.<me>`)을 구독 → 토스트 + unread 카운트 갱신 + type별 쿼리 invalidate (예: `feed_post` → 피드 리페치).

---

## 8. UX 공통 규칙 (모든 화면)

1. **상태 4종 필수:** loading(Skeleton) · empty(EmptyState 문구) · error(재시도 버튼) · success(Toast).
2. **1화면 1 주 액션** — §3 표의 "주 액션"만 primary 버튼.
3. **sitter 텍스트 입력 금지 (P0)** — 예외: 알림장 전송 전 본문 선택 편집, 알림장 선택 메모 1줄.
4. **DANGER 모달**은 빨간 전체 모달, "I understand — don't feed" 버튼 누르기 전 닫기 불가 (backdrop/ESC 무시).
5. **사진 선택:** 모든 화면은 `pickMedia()`(4.7)만 사용. 네이티브 = `expo-image-picker` 카메라/앨범, 모바일 웹 = `capture` 입력, **데스크톱 프레임·데모 계정 = 샘플 사진 트레이 + Upload from computer**. 샘플도 `uploadMedia()`를 그대로 타서 AI가 실제로 분석.
6. 모든 사용자 문구는 영어 (D1). Empty state 예: "No posts yet — your sitter will share photos here."
7. 개발 빌드에만 헤더에 `Owner`/`Sitter` 역할 라벨 표시 (`APP_ENV !== 'production'`).
8. **마우스로 전부 동작 (D25):** 제스처 전용 기능 금지 (스와이프 뒤로가기·삭제, 시트 끌어내리기, 길게 누르기, 당겨서 새로고침 — 웹 `RefreshControl`은 동작 안 함). 항상 보이는 버튼을 둔다. 웹 미지원 라이브러리 금지 (예: `@react-native-community/datetimepicker` → 직접 만든 선택 UI). 화면 PR마다 [DESIGN.md §7.7](../../../DESIGN.md#77-works-with-a-mouse) 데스크톱 체크.

---

## 9. AI 호출 공통 규칙 (`services/nebius.py`)

- **왜 OpenAI 호환 SDK(`openai` 패키지)?** Nebius Token Factory는 **OpenAI Chat Completions와 같은 HTTP/API 형식**(`base_url` + `api_key` + `model` + `messages`)을 제공합니다. Nemotron 전용 Python SDK를 따로 쓰지 않고, 공식 cookbook·예제와 동일하게 `OpenAI(base_url=..., api_key=...)`로 호출하면 **리전별 base URL**(eu-north1 / us-central1)과 **모델 ID만 바꿔** Vision·Super·Ultra·Nano를 한 코드 경로로 처리할 수 있습니다. (직접 `httpx`로 POST해도 되지만, 스트리밍·에러 타입·멀티모달 `image_url` 메시지 형식을 SDK가 이미 맞춰 줍니다.)
- **model role → (model_id, base_url)** 매핑은 env에서 (§4). `OpenAI` 클라이언트 인스턴스는 base_url별로 캐시.
- `chat(role, messages, **kw)` / `chat_json(role, messages, schema: type[BaseModel])`.
- `chat_json` 규칙: ① `response_format={"type":"json_object"}` 시도 (7.1에서 지원 여부 확인 후 플래그) ② 응답에서 `<think>…</think>` 제거 ③ 첫 `{…}` 블록 추출 ④ pydantic 검증 ⑤ 실패 시 "Return only valid JSON matching the schema" 보정 메시지로 **1회 재시도** ⑥ 그래도 실패 → `ai_invalid_output`.
- Nemotron reasoning 모드: 캡션·알림장은 reasoning **off**(속도), 세이프티 reasoning 단계는 **on** (7.1에서 모델별 토글 방식 확인 후 `nebius.py`에 기록).
- 프롬프트 원문은 코드에 하드코딩하지 않고 `app/ai/prompts/**`의 파일에서 로드 (슬기가 코드 수정 없이 튜닝).
- 입력에 실제 PII 금지. 로그에 이미지 base64 출력 금지.
- **호출 지표 로그:** `chat()`/`chat_json()`마다 구조화 로그 1줄 — `{role, model, endpoint, ttft_ms, latency_ms, prompt_tokens, completion_tokens, retried, ok}` (TTFT는 스트리밍 첫 토큰 기준, 스트리밍 불가 모델은 null). 프롬프트·응답 본문은 남기지 않음. Phase 10 README의 **Token Factory / Nemotron 피드백**(필수·채점 항목)과 Most Valuable Feedback에 모델별 중앙값 표로 사용.

---

## 10. 검증 공통 절차 (각 Phase DoD 확인 방법)

| 레벨 | 방법 |
| :--- | :--- |
| Backend | `cd backend && pytest -q` (Nebius 키 없으면 AI 테스트 skip) + phase 문서의 `curl` 예시 |
| DB/RLS | Supabase SQL Editor에서 `supabase/tests/rls_smoke.sql` 실행 (역할별 `set local request.jwt.claims`) |
| Frontend | `npx tsc --noEmit` + Playwright 마우스 테스트 (1.7, CI) + 두 브라우저(일반 창 = owner, 시크릿 창 = sitter — 10.10 이후는 `?view=split`) 수동 시나리오를 **데스크톱 폰 프레임에서 마우스로** ([DESIGN.md §7.7](../../../DESIGN.md#77-works-with-a-mouse) 체크) |
| 데모 | Phase 10 "PawNote의 하루" 체크리스트 |

---

## 11. CI/CD 파이프라인 (D20)

```
PR 열기/업데이트 ──> ci.yml ─┬─ backend: ruff check · pytest -q                               ─┐
                             └─ frontend: npm ci · tsc --noEmit · expo export · playwright (1.7) ┴─> ✅ 필수 체크 → 머지 가능
                    Vercel ──> Preview URL (PR 코멘트)

main 머지 ─┬─> Vercel ──> 운영 frontend 자동 배포
           └─> deploy-backend.yml (backend/** 변경 시)
                 docker build → Nebius Container Registry push (tag = git sha)
                 → Serverless Endpoint 이미지 갱신 → /health 스모크 (실패 시 job 실패, 이전 이미지 유지)

매일 cron ──> keepalive.yml ──> GET {BACKEND_URL}/health/deep (Supabase select 1) — 일시정지 방지
DB migration ──> 사람이 SQL Editor에서 00N_*.sql 순서대로 (PR 본문에 "migration 00N 적용 필요" 명시)
```

| 항목 | 규칙 |
| :--- | :--- |
| CI 트리거 | `pull_request` + `push: main`. `paths` 필터로 backend/frontend job 각각 변경 시만 실행 (docs-only PR은 스킵 → 필수 체크는 "skipped = pass" 되도록 job 단위 `if` 사용) |
| CI 환경 | Python 3.12 + pip cache, Node 20 LTS + npm cache + Playwright 브라우저(Chromium·WebKit·Firefox) cache. Playwright는 `expo export` 결과를 정적 서버로 띄워 데스크톱 해상도 3종에서 마우스만으로 테스트 (`EXPO_PUBLIC_DEV_ROUTES=1`, 백엔드 불필요). **시크릿 없음** — AI 테스트는 `NEBIUS_API_KEY` 없으면 skip, Supabase 호출은 mock |
| 브랜치 보호 | 1.5 완료 후 GitHub Settings → `main`: PR 필수, `ci / backend`·`ci / frontend` 통과 필수 (민식이 설정) |
| GitHub Secrets (CD 전용) | `NEBIUS_REGISTRY_*`(레지스트리 로그인), `NEBIUS_ENDPOINT_ID`, `BACKEND_URL`. 앱 런타임 키(Supabase·Cloudinary·Nebius API)는 **Nebius Endpoint env / Vercel env에만** 저장 |
| 롤백 | backend: 이전 sha 태그로 Endpoint 재지정 (`workflow_dispatch` 입력 `image_tag`). frontend: Vercel 대시보드 "Promote previous deployment" |
| Fallback | **예외만:** Nebius AI Cloud Endpoint 배포가 막히면 Render(동일 Dockerfile). 정상 경로는 항상 **Nebius AI Cloud Serverless Endpoint** |

