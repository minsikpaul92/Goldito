# Goldito P0 — 공통 설계 청사진 (모든 Phase가 따름)

> 각 phase 문서는 **이 문서의 결정·구조·규칙을 전제**로 작성되어 있습니다.
> 이 문서와 [README.ko.md §9 데이터 모델 요약](../README.ko.md#9-데이터-모델-요약) 또는 [Playbook](../P0-ai-prompt-playbook.ko.md)이 다르면 **이 문서 + phase 문서가 우선**입니다.
> 결정을 바꾸면 이 문서의 §1 결정 로그부터 고치고, 영향받는 phase 문서를 함께 수정합니다.
> **제품 흐름(5단계: Inquiry → Meet & Greet → Booking → Care & Transit → Completion)의 정본은 [full-process.ko.md](../full-process.ko.md)** (D27–D47). 이 문서는 그 흐름을 구현하는 구조·규칙을 정합니다.

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
| D17 | 리마인더 (P0) | **클라이언트 인앱 리마인더**: sitter 앱이 열려 있으면 30초마다 due 체크 → 배너+토스트. 서버 푸시는 stretch (6.7 — Nebius AI Cloud는 안 씀, D18) | 스케줄러 없이 데모 08:00 구간 재현 |
| D18 | 배포 | **Backend API:** **Render** Web Service (Docker + FastAPI, 무료 플랜, GitHub `main` 자동 배포, `backend/Dockerfile`). **Frontend:** `expo export -p web` → **Vercel**. **Nebius AI Cloud(Serverless Endpoint · Jobs)는 쓰지 않음** — 2026-10-09 결정 (처음 2026-09-29에는 AI Cloud가 정식, Render는 fallback이었음) | AI 추론은 전부 **Token Factory**(해커톤 "Runs on Nebius" 충족 — 런타임 호출 또는 AI Cloud 배포 중 하나면 됨). AI Cloud는 카드 등록 + $25 선결제를 요구했고 행사 크레딧이 계정에 없었으며, 엔드포인트는 계속 켜져 12/15까지 약 $128 → Render 무료로 0원. 무료 플랜은 15분 무요청 시 잠들므로 **10분마다 핑**(D20 keep-alive). 경험은 [notes/nebius-ai-cloud-feedback.md](notes/nebius-ai-cloud-feedback.md) |
| D19 | 시드 계정 생성 | Python + Supabase Admin API (`auth.admin.create_user`) — SQL로 auth.users 직접 insert 금지 | 비밀번호 해시·트리거 정상 동작 |
| D20 | CI/CD | **CI:** GitHub Actions `ci.yml` (PR·main push) — backend ruff+pytest, frontend tsc+web export+Playwright 마우스 테스트(1.7). **CD:** frontend = Vercel Git 연동(PR Preview, main 자동 배포), backend = **Render Git 연동**(main 머지 시 `backend/Dockerfile`로 빌드 · 배포, Health Check `/health`). **Keep-alive:** `keepalive.yml`이 10분마다 `/health` (Render 무료 잠듦 방지). **DB migration은 수동** (SQL Editor, 순서대로) | 해커톤 중 운영 DB 자동 변경 위험 회피, 워크플로 최소화 |
| D21 | 프로필 구조 | 공통 `profiles`(id, role, display_name) + 역할별 1:1 `owner_profiles`(긴급 연락처·동물병원) / `sitter_profiles`(소개·활동 지역·경력). 가입 트리거가 role에 맞는 행을 함께 생성. 시터는 강아지·고양이 모두 돌봄 (종 제한 없음) | RLS·폼이 역할별로 깔끔. nullable 컬럼 혼재 방지 |
| D22 | 종 지원 | **강아지·고양이** — `pets.species in ('dog','cat')`, 생성 후 변경 불가. 모든 FK·API 필드는 `pet_id` | 제품이 dogs & cats 대상. 추후 종 확장은 check만 넓힘 |
| D23 | 종별 케어 | `care_tasks.type in ('medication','walk','feeding','litter','play','sleep')`. `walk`=강아지만, `litter`=고양이만 (트리거 `guard_care_task_species`). 세이프티 독성 목록도 종별 (phase-08) | 고양이 산책 같은 잘못된 데이터 차단, 고양이 전용 독성(백합 등) 반영 |
| D24 | 파트타임 보딩 시터 · 칸 · 인수인계 | 시터는 **파트타임**이고 반려동물을 **시터 집에서** 돌봄. 칸은 **이름만 고정**(Morning·Afternoon·Overnight) — 정확한 시간은 시터가 칸마다 정함(`sitter_availability.starts_at/ends_at`) + 칸 정원 `max_pets`. 예약 = 시터 1명 + 견주 1명. **누가 언제 맡나** = `booking_pets.care_range`(맡긴 구간, 반려동물마다 겹침 금지 — exclusion 제약), **정원** = `booking_slots`(반려동물 × 날짜 × 칸, 그 시터의 칸 시간 기준). 겹치는 open 행은 **가장 최근 행**이 그 날의 시간·정원을 정함. 열지 않은 칸은 맡긴 구간이 절반 넘게 덮을 때만 차지(빈 Overnight 방지) — 앞뒤로 짧게 삐져나온 시간은 custom 시각으로 협의. 견주가 **맡기는 시각·찾는 시각·장소**(시터 집/견주 집/기타)를 정함 → `booking_handoffs`. 시터 시간 밖·장소 변경은 **협의**(제안 → 상대방 동의), 확정 후 변경도 제안→동의, 동의 전엔 기존 값 유효. 견주는 **여행 전체를 한 시터에게**가 기본 — 단골 스케줄 먼저, 없으면 검색(전체 가능 먼저). 시터가 확정 칸을 막으려 하면 거부 → **예약 전체 취소**(맡기기 전만 — Received 뒤엔 찾는 시각 변경으로) → 견주 재예약. 권한·할 일 담당은 칸이 아니라 **맡긴 시각 ~ 찾는 시각** 구간으로 판단. 스케줄 변경은 알림 없음. 주소는 확정 당사자에게만(찾은 뒤 24시간까지) | 반려동물에게 시터 교체는 스트레스 → 한 명이 기본. 실제 맡기는 시각이 시터 근무 시간과 다를 수 있어 협의 필요 |
| D25 | 웹 표시 방식 (데스크톱 = 폰 프레임) | 컴퓨터 브라우저(마우스·트랙패드가 주 입력 — `pointer: coarse`가 아님, **창 폭 무관**)에서는 **402 × 874 폰 프레임** 안에 **같은 앱을 same-origin iframe**으로 띄움 (`components/shell/AppShell.web.tsx` — 네이티브는 `AppShell.tsx`가 children 그대로). 폰 브라우저·네이티브·iframe 내부는 앱 그대로. iframe 안에서 **마우스일 때만** `TouchEmulation`: 드래그 스크롤 + 관성, 드래그 후 클릭 차단, 가로 줄 휠 변환, 글자 선택·이미지 드래그 금지, 원형 커서, 스크롤바 숨김. 사진 선택은 `pickMedia()` 하나 — 데스크톱·데모 계정은 샘플 사진 트레이(4.7). 모드 결정은 `resolvePresentation()` 한 곳, 화면 분기는 `useLayoutMode()`만, 탭은 expo-router JS `Tabs`(NativeTabs 아님). **해커톤 후(마지막 우선순위):** 시터만 데스크톱 `expanded` 레이아웃(iframe 없이 사이드바) — Owner는 계속 프레임 | 심사위원은 PC로 봄 → 폰과 같은 경험 + 마우스로 모든 동작 필요. 앱을 박스에 직접 넣으면 RN `Modal`·Expo Router 웹 모달이 `document.body`로 portal되고(웹 모달은 `min-width: 768px`면 데스크톱 다이얼로그), 창 크기·미디어쿼리가 브라우저 기준이라 깨짐 — react-native-web 0.21.2·expo-router 57.0.24 소스 확인. iframe 안은 진짜 폰 화면이라 화면마다 지킬 금지 규칙이 거의 없음. 402 = 현재 기본 iPhone(17) 폭, 레이아웃은 360–440 대응 |
| D26 | 역할 영역 URL | 역할 화면은 **URL 접두사 폴더** `app/owner/*` → `/owner/*`, `app/sitter/*` → `/sitter/*` (route group `(owner)`/`(sitter)` 쓰지 않음). `(auth)`·`(public)`은 URL이 겹치지 않아 그룹 유지 (`/login`, `/signup`, `/welcome`). 예전 문서의 `/(owner)/x`는 `/owner/x`로 읽음 (2026-10-01 일괄 변경) | 두 역할 모두 `tasks`·`bookings`·`notifications`·`pets/[petId]`가 있어 그룹만 쓰면 URL이 같아짐. expo-router는 이를 에러 없이 "shared route"로 받아 **새로고침·딥링크 시 알파벳 순 첫 그룹**(owner)을 렌더 → 시터가 `/tasks`를 새로고침하면 owner 가드에 막혀 화면을 잃음. D25 주소창 동기화(새로고침해도 같은 화면)가 성립하려면 URL이 역할마다 유일해야 함 (expo-router 57 `getRoutesCore`·`getStateFromPath` 확인) |
| D27 | 제품 흐름 = Full Process 5단계 | 제품·루트 README·데모 영상·작업 순서는 [full-process.ko.md](../full-process.ko.md)의 **Inquiry → Meet & Greet → Booking → Care & Pet Transit → Completion**을 따른다. 기존 기능은 단계에 흡수: 케어 피드·앨범·체크·알림장 = Stage 4, 예약·인수인계(D24) = Stage 2–3. **Treat Safety Guard(Phase 08)는 Stage 4 보조 기능으로 시나리오 코어(03B–07C) 뒤 P0 stretch**, P2 Q&A(구 11.4)는 Stage 1 문의 AI(07B)로 흡수 | 팀 시나리오 우선 (2026-10-01). 심사 "Potential Impact"·"Design"에 한 흐름으로 보이는 제품이 유리 |
| D28 | 서비스 방식 · 이동 방식 | `bookings.service_type in ('boarding','house_sitting')` (기본 `boarding`). 시터가 제공하는 방식은 `sitter_profiles.services text[]`. **이동 방식 = 인수인계 장소(D24)를 다시 부른 이름:** `sitter_home` = **Owner drives**, `owner_home` = **Sitter drives**, `other` = 둘 다 이동. `house_sitting`은 맡기기·찾기 장소가 `owner_home` 고정. 정원은 house sitting도 보딩과 같은 칸 계산 (P0 단순화 — drop-in 방문 정원은 해커톤 후) | 새 상태를 만들지 않고 이미 검증된 handoff 모델 재사용 |
| D29 | 견적 = 서버 계산 | 시터 요금표 `sitter_rates`(보딩 1박·house sitting 1박·데이케어 1일, 추가 반려동물 %, 공휴일 %, CAD) + `holidays`(온타리오 법정 공휴일) → SQL `quote_booking(...)`이 내역 JSON을 만든다. **AI는 숫자를 만들거나 계산하지 않는다** — 문의 답변(07B)은 이 JSON의 값을 그대로 쓰고, 답변 아래 견적 카드·Checkout(03C)이 같은 값 표시 | 가격 환각 방지, 화면 간 숫자 일치 |
| D30 | 동의서 · 결제 (데모) | 필요한 동의서는 서비스·이동 방식으로 **규칙이 정함** (AI 아님): `emergency_vet`(한도), `home_access`(lockbox·열쇠·buzzer·fob), `cohabitation`(합사), `handoff_rules`(시간·Visitor parking), `safe_return`(귀가 시 받을 사람). 본문 = **고정 영문 템플릿 + 버전**, 체크 + 이름 입력 서명 → `booking_consents`. 화면에 "Demo template — not legal advice". **결제는 데모만**: 카드 정보 없이 `pay_booking_demo` → `bookings.paid_at` + 견적 스냅샷. 실결제(Stripe)는 해커톤 후 | 법률 문구를 모델이 쓰면 위험, 해커톤에서 카드 정보를 다룰 이유 없음 |
| D31 | 조건부 보안 해제 | ① **견주 집 출입 정보** `owner_home_access`(lockbox 코드·buzzer·fob·출입 순서·시터 주차) — 견주 본인 RLS만. 시터는 RPC `get_home_access(booking)`로만, 조건 = 결제 완료 + 그 예약의 시터 + 견주 집에서 하는 인수인계(또는 house sitting 시작) **2시간 전 ~ 예약 종료(찾기 완료)**. 밖이면 `access_locked` + `unlocks_at`. 처음 열 때 `access_reveals` 기록 + 견주 알림 `access_unlocked`. ② **시터 집 정보**(주소·Visitor parking·로비 안내·짐 체크리스트) — 결제 직후 견주에게, 찾은 뒤 24시간까지 (`get_handoff_details` 조건을 "확정"에서 "결제"로). ③ 출입 정보는 **RAG·AI 프롬프트·알림 본문·로그에 넣지 않음** | 시나리오 "결제 후에도 바로 공개 안 함", 최소 노출 |
| D32 | Pet Transit (실시간 이동) | 이동하는 쪽이 **Start trip** → `trips`에 **마지막 위치 1개만** 갱신(경로 이력 저장 안 함, 끝나면 위치 null) → 상대방은 Realtime(`postgres_changes` on `trips`, RLS = 예약 당사자)으로 구독. ETA = 직선거리 × 1.3 ÷ 속도(차 30 km/h, 도보 4.5 km/h) — 라우팅 API 없음. 도착 = 목적지 150 m 안 → `trip_arrived`. 목적지 좌표 = 프로필의 `home_lat/home_lng`("Use my current location" 또는 시드 가상 좌표, 지오코딩 없음). 지도 = **보기 전용** Leaflet + OpenStreetMap(웹, 자동 맞춤 + ± 버튼, 드래그 팬 없음 — D25 마우스 규칙). 위치 소스 = 폰은 실제 GPS, **데스크톱·데모 계정은 Simulate trip**(가상 경로 재생) | 심사위원 PC에는 움직이는 GPS가 없음, 위치는 이동 중 당사자에게만 |
| D33 | Vision · 임베딩 모델 | 시나리오의 Qwen-2.5-VL은 Token Factory 카탈로그에 **없음** (2026-10-01 `GET /v1/models`) → 사진 분석(캡션·분류·인수인계 체크·알림장 사진)은 **`openbmb/MiniCPM-V-4_5`** (이미지 입력 대안: `moonshotai/Kimi-K2.6`). RAG 임베딩 = **`Qwen/Qwen3-Embedding-8B`** (카탈로그 유일 임베딩, `dimensions: 1024` 동작 확인) → Supabase **pgvector** `knowledge_chunks vector(1024)` (HNSW), service role 전용. 검색 범위는 항상 그 시터·그 반려동물·그 견주로 필터 | 카탈로그 기준 ([model-ids.md](notes/model-ids.md)). 1024차원이면 pgvector 인덱스 한도(2000) 안 |
| D34 | 시터 5초 체크 | 시터 입력 = 칩(식사·배변·산책 분·투약) + 사진 ≤ 2 + **선택 메모 1줄(≤ 120자)**. 필수 텍스트 입력은 여전히 없음 (§8-3) | 시나리오의 "짧은 메모" — 알림장 에피소드의 재료 (D38에서 "AI가 먼저 쓰고 시터는 수정·추가만 선택"으로 보강) |
| D35 | 시터 말투 레이어 | 견주에게 보이는 자연어 AI 출력(문의 답장·알림장·캡션)은 **시터 1인칭 말투**. `backend/app/ai/tone.py` 한 곳에서 합성: 스타일 가이드 + 같은 시터의 `tone_samples` top-k(few-shot, `MODEL_EMBED` 검색). 시드 = 익명화한 3년 대화(영어), 이후 시터의 그대로 보냄 / 수정 / 다시 생성을 기록해 갱신(수정 비율이 지표). **고정 문구(안전 경고·견적 숫자·동의서)는 제외**, 숫자는 `{PRICE}`·`{DATE}` 자리표시자 후 서버 채움. SFT는 보여주기용(D43, 11.7) | 모델 교체 없이 시터별 말투. 상세 [full-process §5](../full-process.ko.md#5-시나리오를-앱으로-옮기며-정한-것-d27d46-요약) |
| D36 | 시터 승인 · AI 고지 | 기본 = 수동 승인(Send 즉시 발송). 자동 발송 = 시터 옵션 + 책임 동의 모달(`sitter_profiles.ai_reply_mode`, `ai_consent_at`), 켜면 대기 없이 바로 사람 속도로(2026-10-02). 견주 화면에는 시터 메시지로 표시(메시지별 AI 라벨 없음), 약관·온보딩 1회 고지, 자동 모드 프로필 1줄. "AI냐"는 질문에 사람이라고 답하지 않음 | 승인한 메시지는 시터의 메시지 |
| D37 | 사람 속도 전달 | 자동 발송·데모 영상에만: `inquiry_messages.visible_at`(미래 시각) + 입력 중 연출. 읽음 표시는 `read_at`(시터가 실제로 연 시각)에만 — 가짜 읽음 없음(2026-10-02). 서버는 즉시 생성·저장하고 **공개 시각만 늦춤**(서버리스 sleep 금지). 지연 공식·메시지 구조 = 슬기 TBD. 알림장·캡션·수동 승인은 지연 없음 | 서버리스 요청 수명에 안전 |
| D38 | 시터 글쓰기 거의 제로 (2026-10-02 개정) | 알림장: AI가 하루 기록·사진에서 칩 제안(`/api/ai/report-chips`) → 시터가 고르고(틀린 칩은 끔) 짧은 메모(선택, ≤ 200자) → AI가 시터 말투로 작성 → 시터 승인 후 게시. 문의: 의도 칩 + Send. 메모·수정은 언제나 선택 | UX 원칙 5 — 사진 분석은 부족하거나 틀릴 수 있음 |
| D39 | 모델 정책 | 미국 모델 우선·NVIDIA 모델 우선, 중국 모델은 대안 없음/가성비 큰 차이일 때만 + `model-ids.md`에 이유 기록. 예외: 임베딩 Qwen3-Embedding(**확정 2026-10-02, 다른 임베딩 모델은 비교하지 않음**), 비전 MiniCPM-V(**확정** — NVIDIA 비전 모델 3종은 Dedicated Endpoint 전용이라 상시 비용이 $48~113/일). NVIDIA가 양자화만 한 중국 모델(GLM·MiniMax·Qwen NVFP4)은 NVIDIA 모델로 치지 않음 | 해커톤 트랙 + 선호 |
| D40 | 확정 후 변경 요청 | 서비스·이동 방식은 확정 시 고정. 양쪽 모두 변경 요청 가능, 상대 승인 필요, 거부 시 변경 요청만 취소(예약 유지) | 일방 변경 방지 |
| D41 | 위치 공유 동의 · 범위 | Start trip → 앱 동의(누구에게·도착까지) → 브라우저 권한. P0 웹은 화면이 켜진 동안만. 06B는 P0 맨 마지막(07C 바로 다음, 08 stretch보다 먼저 — 2026-10-02), 심사는 데모 영상(Simulate trip 유지). 출시는 네이티브 앱 + 사전 위치 동의 | Supabase Realtime Free(동시 200, 월 200만 메시지) 안에서 충분 |
| D42 | Fun mood meter (P1) | "재미용" 문구 필수, 행동 태그 + 프레임 비율을 서버가 계산, 부정 감정 퍼센트 금지. 후보 = 비전 모델 태그(A) + `agentmish/dog-emotion-classifier-v2`(Apache-2.0, B). 비용·라이선스 문제면 제외 | 임팩트용 비핵심 기능 (11.9) |
| D43 | SFT는 보여주기용 | 앱 런타임의 말투는 Nemotron + 말투 카드 + few-shot(D35)만 사용. 파인튜닝 모델은 앱에 연결·서빙하지 않음(튜닝한 Gemma 4는 Dedicated Endpoint 필요, 새 데이터도 부족). 11.7은 README Future work + 데이터 형식 명세, 데이터가 있으면 학습 1회(선택) | 상시 서빙 비용 없이 확장 가능성을 보여줌 |
| D44 | Meet & Greet 규칙 | **처음 만나는 견주·시터만**(이전 예약에서 인수인계를 했거나 M&G를 마친 적이 없을 때) — `request_booking`이 `meet_greet_status`를 `required` / `not_needed`로 정함. 예약 요청 뒤 · 시터 수락 전이고, `respond_booking` 수락은 done·skipped 뒤에만(`meet_greet_required`). 대면 = 양쪽 `meet_spots`(각 ≤ 3, 공개 장소) 중 선택 + 시각, 집 주소는 결제 전 비공개(D31). 건너뛰기 = 한쪽 요청 → 상대 "Continue the booking without a Meet & Greet?" → 거부 시 `cancel_booking`(reason `meet_greet_declined`) + 견주 Find a new sitter | 처음 맡기는 사이의 신뢰 확인, 단골은 생략 (2026-10-02 민식) |
| D45 | 영상 Meet & Greet = Google Meet | 시각이 합의(accept)되는 순간 FastAPI `/api/meet-greet/video-link`가 **Google Calendar API** `events.insert`(`conferenceDataVersion=1`, `conferenceData.createRequest`, `conferenceSolutionKey.type="hangoutsMeet"`)로 이벤트 + Meet 링크 생성, 양쪽 이메일 초대(데모 `.test` 계정은 생략) → 각자 Google Calendar에 등록. 주최자 = Goldito Google 계정 1개(OAuth refresh token, 백엔드 env, OAuth 앱 게시 상태 **In production** — Testing은 7일 만료). 시각 변경 = `events.patch`, 취소 = `events.delete`. 링크는 새 탭(iframe 불가). 실패 시 시각 + .ics + 링크 붙여넣기. 서비스 계정만으로는 Meet 링크 생성이 막히는 사례가 많아 쓰지 않음 | 앱 설치 없이 브라우저·폰 어디서나, 캘린더 자동 등록, 추가 비용 없음 |
| D46 | 에이전트 설명 | P0 구조(서버가 근거를 모아 기능마다 1회 호출)는 유지. README·영상·Devpost에서 **일이 생길 때마다 스스로 움직이고 사람이 승인하는 에이전트**로 설명(트리거 → 행동 → 승인 표). tool calling은 7.1에서 Token Factory 동작이 확인되면 07B에만 선택(7B.11) — 숫자 대조·출입 정보 제외 규칙은 그대로 | 트랙(Best Apps and Agents) + 원문 마지막 문장, 안정성 유지 |
| D47 | Owner 탭 IA · Feed vs Diary | Owner 탭 **5개 유지:** `Home · Bookings · Feed · Diary · Mood`. **Feed** = 영구 펫 앨범(인스타형 그리드→상세; 오너·시터 모두 작성; 펫 칩 = 선택/해제 멀티토글, 둘 다 켜면 날짜·시간순 합침; 케어 종료 후에도 유지). **Diary** = 돌봄/일기 스트림(내가 씀 + 맡긴 동안 Live/On air로 시터 업데이트 시간순; 히스토리는 펫·시터·날짜 필터). **Diary에 사진이 있으면 Feed에도 미러** (같은 media/post). 구 Care 탭은 없앰 → **Home → 펫 디테일**에서 Care request(추후 디테일). 구 Reports 탭 = Diary. **Mood** = 5번째 자리(플레이스홀더 → 11.9 사진/영상 기분, Fun only). **Settings는 탭이 아님** — 헤더 아바타 `/profile` 안에 둠(11.11과 합침). 알림 벨은 헤더 유지. Sitter = **D47b** | Care/Reports가 탭으로 얇음; Live와 앨범 멘탈모델 분리 (2026-10-04 민식) |
| D47b | Sitter 탭 IA (**확정**) | Sitter **5탭:** `Home · Bookings · Feed · Diary · Mood` (Owner와 대칭; 구 Today→**Home**). **Home** = 대시보드: (A) 지금 케어 중이면 그 펫 정보·퀵액션 중심 · (B) 아니면 **승인 대기 요청** · **Upcoming** · **drop-off/pick-up 시간순**. 추후 케어 중 **다마고치/8bit status**(11.12). 구 Tasks는 Home(할 일)·Diary(완료 기록)로 흡수. **Bookings** = 요청·Meet & Greet·Past. **Feed** = + Photo. **Diary** = 스테이 로그 + 저녁 칩 알림장(구 Report). **Mood** = Owner와 동일. Treat scan = Home 버튼(08). Settings = Profile. **수익·돌봄 히스토리(추후):** 탭 추가 없음 — Bookings **Past**(스테이·견주별) + Profile **Earnings / payouts** 섹션(데모 pay 금액·기간 요약). 활동 디테일은 Diary 필터 | Owner 대칭 + 시터 대시보드 (2026-10-04 민식) |

---

## 2. 리포 구조 (최종 형태)

```
Goldito/
├─ README.md                  # 제품 + Getting Started (Phase 10에서 완성)
├─ CLAUDE.md
├─ .gitignore                 # .env, data/raw/, node_modules, __pycache__, .venv, dist
├─ .github/workflows/
│  ├─ ci.yml                  # Phase 01.5 — PR 검사 (backend / frontend 2 job)
│  └─ keepalive.yml           # Phase 10.7 — 10분마다 /health 호출 (Render 무료 잠듦 방지)
├─ docs/
├─ supabase/
│  ├─ README.md               # ERD 요약 + 적용 순서
│  ├─ migrations/
│  │  ├─ 001_initial_schema.sql
│  │  ├─ 002_rls_policies.sql
│  │  ├─ 003_functions_triggers.sql   # 헬퍼·가입 트리거·예약 RPC·충돌 트리거·realtime (Phase 02)
│  │  ├─ 004_booking_options.sql      # Phase 03B (service_type, services, Meet & Greet — 첫 만남 판단·건너뛰기·장소·Meet 링크, 양쪽 meet_spots)
│  │  ├─ 005_meet_greet.sql           # Phase 03B 3B.9 (Meet & Greet RPC — 제안·응답·완료·건너뛰기, 양쪽 장소)
│  │  ├─ 006_agreements.sql           # Phase 03C (요금·공휴일·quote_booking, 동의서, 데모 결제, 출입 정보 해제)
│  │  ├─ 007_feed_notifications.sql   # Phase 05 (+ feed_posts.category — 09가 채움)
│  │  ├─ 007b_feed_posts_realtime.sql  # feed_posts Realtime (008은 care 예약이라 b/c 접미사)
│  │  ├─ 007c_feed_visibility.sql      # posted_by + visibility(shared/private), 오너 게시
│  │  ├─ 008_care.sql                 # Phase 06 (task_logs RPC, care_checkins, care_requests, pet_cautions)
│  │  ├─ 009_reports.sql              # Phase 07 (send_daily_report)
│  │  ├─ 010_inquiries_rag.sql        # Phase 07B (pgvector, inquiries, knowledge_chunks)
│  │  ├─ 011_completion.sql           # Phase 07C (reviews, pet_life_records)
│  │  ├─ 012_transit.sql              # Phase 06B (trips, handoff_checks, home 좌표) — P0 맨 마지막 (D41)
│  │  ├─ 013_safety.sql               # Phase 08 (DANGER 알림 트리거) — stretch, 06B 뒤 시간이 남을 때
│  │  └─ 014_p1.sql                   # Phase 11 (P1)
│  │                                  # 번호 = 적용 순서. 작업 순서가 바뀌면 다음 빈 번호를 쓰고 이 목록을 고친다 (008은 번호 정리 때 생긴 빈칸 — 쓰지 않음)
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
│  │  │  ├─ nebius.py         # model role → (model_id, base_url), chat(), chat_json(), embed()
│  │  │  ├─ rag.py            # 07B — chunk → embed → knowledge_chunks upsert, match_knowledge 검색
│  │  │  ├─ google_meet.py    # 3B.11 — refresh token → Calendar 이벤트 + Meet 링크 (D45)
│  │  │  └─ timeutil.py       # APP_TIMEZONE 기준 today/day range
│  │  ├─ routers/
│  │  │  ├─ health.py         # GET /health
│  │  │  ├─ me.py             # GET /api/me
│  │  │  ├─ meet_greet.py     # POST /api/meet-greet/video-link (3B.11, D45)
│  │  │  ├─ media.py          # POST /api/media/sign, /api/media/complete
│  │  │  ├─ ai_caption.py     # POST /api/ai/caption
│  │  │  ├─ ai_daily_report.py# POST /api/ai/daily-report
│  │  │  ├─ ai_care_plan.py   # POST /api/ai/care-plan (06)
│  │  │  ├─ ai_report_chips.py # POST /api/ai/report-chips (07, D38)
│  │  │  ├─ ai_handoff_check.py # POST /api/ai/handoff-check (06B)
│  │  │  ├─ ai_inquiry.py     # POST /api/ai/inquiry-reply (07B)
│  │  │  ├─ ai_life_record.py # POST /api/ai/life-record (07C)
│  │  │  └─ ai_safety.py      # POST /api/ai/safety-check (08, stretch)
│  │  ├─ schemas/             # pydantic request/response 모델 (라우터별 파일)
│  │  └─ ai/prompts/
│  │     ├─ caption/{system.md}
│  │     ├─ care_plan/{system.md}
│  │     ├─ handoff_check/{system.md}
│  │     ├─ inquiry/{system.md}
│  │     ├─ life_record/{system.md}
│  │     ├─ report_chips/{system.md}
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
   │  ├─ index.tsx            # 3.3 — 로그인/역할 보고 redirect
   │  ├─ (auth)/              # 3.1–3.2 — login, signup (로그인 상태면 `/`로)
   │  ├─ owner/ · sitter/     # D26 — `_layout.tsx` = 역할 가드 Stack, `(tabs)/` = JS Tabs (`/owner`, `/owner/feed` …), 상세는 Stack 위 (`owner/pets/new`, `owner/pets/[petId]`)
   │  ├─ profile.tsx          # 3.8 — 역할별 프로필 (`/profile`, 두 역할 공통)
   │  └─ dev/                 # gestures.tsx (1.7), health.tsx (1.3) — EXPO_PUBLIC_DEV_ROUTES=1일 때만
   ├─ assets/demo/            # 4.7 — 샘플 사진 (강아지·고양이 일상, 가상 브랜드 간식 라벨 — PII 없음)
   ├─ components/shell/       # D25 — AppShell.tsx / AppShell.web.tsx, DeviceFrame.web.tsx, TouchEmulation.web.ts, presentation.ts, useLayoutMode.ts, useShell.ts (화면은 `useShell`·`useLayoutMode`만 import)
   ├─ components/ui/          # Button, TextButton, TextField, Card, Screen, EmptyState, LoadingView, Chip, SegmentedControl, Skeleton, Badge, Toast, AlertModal, Sheet, HorizontalList
   ├─ components/             # 도메인 컴포넌트 (RoleTabs, HeaderActions, RoleCard, PetCard, PetForm, FeedCard, TaskRow, PetSwitcher, NotificationItem, MediaPicker, QuoteCard, ConsentCard, EntryInfoCard, TripMap(.web), ChecklistCard, StarRating, LifeRecordCard …)
   ├─ features/<domain>/      # 화면별 데이터·상태 (`pets/` petApi·useMyPets·petValidation, `profile/` profileApi) — use*.ts 훅 (route 파일은 얇게 — D25, 해커톤 후 시터 데스크톱 화면이 재사용)
   ├─ lib/
   │  ├─ supabase.ts          # getSupabase() — 첫 사용 시 생성(anon, AsyncStorage persist, `getAuthStorageKey()`)
   │  ├─ authErrors.ts        # Supabase Auth 에러 → 사람 문구
   │  ├─ api.ts               # FastAPI fetch 래퍼 (Bearer 자동, 에러 정규화)
   │  ├─ media.ts             # pickMedia() — 모든 사진 선택의 유일한 진입점 (4.7)
   │  ├─ cloudinary.ts        # uploadMedia(), thumbUrl(), videoPosterUrl()
   │  ├─ feed.ts              # createFeedPost() — Phase 05/06/09 공용
   │  ├─ location.ts          # 06B — 위치 소스 하나: 실제 GPS watch / Simulate trip (D32)
   │  └─ time.ts              # APP_TIMEZONE 표시 포맷
   ├─ providers/              # ThemeProvider(useTheme · useThemedStyles, 3.0), SessionProvider, PetProvider(선택된 pet), ToastProvider, NotificationsProvider(Realtime)
   ├─ theme/tokens.ts         # 기본값: 색·간격(8px)·radius·타이포·layout·breakpoint — 묵 Figma 토큰으로 교체
   ├─ theme/themes.ts         # 스킨 프리셋 (`default` + 11.10 털 색) — primary·primaryText·background·accent만 변경, 상태 색 고정
   └─ types/db.ts             # Supabase 테이블 타입 (수동 or supabase gen types)
```

---

## 3. 화면 & 라우트 맵 (최종 형태)

| Route | 역할 | 화면 | 주 액션 (1개) | 도입 Phase |
| :--- | :--- | :--- | :--- | :--- |
| `/` | - | 세션·역할 보고 redirect (미로그인 → `/login`, OB.1 이후 welcome) · 프로필 로드 실패 시 Try again / Log out | - | 03 → OB.1 |
| `/welcome` (`app/(public)/welcome.tsx`) | - | Welcome + **Try demo** (Owner / Sitter) · "Already have an account?" | Try demo | OB.1 ([onboarding.ko.md](../onboarding.ko.md)) |
| `/login` (`app/(auth)/login.tsx`) | - | Login | Sign in | 03 |
| `/signup` (`app/(auth)/signup.tsx`) | - | Sign up (+ role 선택 1회) | Create account | 03 |
| `/owner/` (tab: Home) | owner | My pets · **Next booking** 카드(진행 중이면 Trip·Received 상태) · **Pet status room (8bit, P1 11.12)** · 오늘 요약 | Add pet | 03 · 03B · 11.12 |
| `/owner/pets/new`, `/owner/pets/[petId]` | owner | Pet profile (**종 Dog/Cat**·이름·품종·생일·메모·**알레르기 chips**) · **Care request** · **Life Record** 진입 | Save | 03 |
| `/owner/pets/[petId]/care-request` | owner | 케어·투약 의뢰서 (메모처럼 작성) → AI 체크리스트 미리보기 → 확인 (Stage 2) | **Save checklist** | 06 |
| `/owner/pets/[petId]/record` | owner | Pet Life Record — 식습관·배변·약 반응·행동·주의사항 + 지난 돌봄 목록 (Stage 5) | 읽기 | 07C |
| `/owner/bookings` (tab: Bookings), `/owner/bookings/new`, `/owner/bookings/[bookingId]`, `/owner/sitters/[sitterId]` | owner | 예약·문의 목록 / 서비스 방식·단골 스케줄·검색·요청(이동 방식) / 상세(첫 만남 Meet & Greet — 대면 장소·Google Meet·건너뛰기 동의, D44 — ·인수인계·재예약) / 시터 프로필·스케줄·별점 + **Ask about a stay** | Book care | 03B (+07B 문의) |
| `/owner/inquiries/[inquiryId]` | owner | 문의 스레드 — AI 자동 답변 + 견적 카드 (Stage 1) | **Request booking** | 07B |
| `/owner/bookings/[bookingId]/checkout` | owner | 견적 → 동의서 서명 → **Pay (demo)** → 시터 집 정보·짐 체크리스트 (Stage 3) | **Pay** | 03C |
| `/owner/home-access` | owner | 내 집 출입 정보 (lockbox·buzzer·fob·출입 순서) — "Only shown to your sitter 2 hours before" | Save | 03C |
| `/owner/bookings/[bookingId]/trip`, `/sitter/bookings/[bookingId]/trip` | both | 실시간 이동 — 보기 전용 지도·ETA·도착 카드(Visitor parking / Buzzer·Lockbox)·사진 체크 (Stage 4) | **Start trip** / 사진 → **Received·Returned** | 06B |
| `/owner/bookings/[bookingId]/review` | owner | ★ 1–5 + 코멘트(선택) (Stage 5) | **Send review** | 07C |
| `/profile` | both | 역할별 프로필 + **Settings**(계정·알림·What's New — 11.11을 여기로; D47). 주소·bio·**선호 만남 장소 ≤ 3** 등 (D44) | Save | 03 (+03B · 11.11) |
| `/settings` | both | *(deprecated as tab)* → `/profile` Settings 섹션으로 흡수 (D47). 딥링크 호환 시 redirect | — | 11.11 |
| `/owner/feed` (tab: Feed) | owner | **영구 앨범** — 펫 칩 멀티토글(선택/해제) · 3열 그리드 → 상세 (D47). 오너·시터 게시 | 스크롤 / 탭 | 05 (+09 분류) |
| `/owner/diary` (tab: Diary) | owner | **돌봄 일기** — Live(On air) 시 시터 업데이트 시간순; 히스토리(펫·시터·날짜). 사진 있는 항목 → Feed 미러 (D47). 구 `/owner/reports` | 읽기 / 쓰기 | 05–07 |
| `/owner/diary/[entryId]` | owner | Diary 항목 상세 (알림장·체크·사진 묶음) | 읽기 | 07 |
| `/owner/mood` (tab: Mood) | owner | 사진/영상 → 기분 (Fun only, D42). P0는 플레이스홀더 | Snap / pick | 11.9 (stub now) |
| `/owner/pets/[petId]` (Care request) | owner | 구 Care 탭 내용 — 투약·산책 의뢰는 **펫 디테일**에서 (D47, 추후 디테일). 라우트 `/owner/pets/[petId]/care-request` 유지 | Save checklist | 06 |
| `/owner/notifications` (header bell) | owner | 알림 센터 | 탭 → 해당 화면 | 05 |
| `/sitter/` (tab: Home) | sitter | **대시보드 (D47b):** 케어 중 → 펫 카드·퀵액션 · 아니면 Requests(미승인) · Upcoming · drop/pick **시간순**. 추후 다마고치(11.12). Tasks/check-in 흡수 · (08) Scan | Open booking / check-in | 03 → 06 |
| `/sitter/schedule` | sitter | 스케줄 캘린더 (날짜 × 칸 open + 시간 + 정원 / blocked) | Save | 03B |
| `/sitter/bookings` (tab: Bookings), `/sitter/bookings/[bookingId]` | sitter | Inquiries · Requests · Upcoming · **Past**(돌봄 히스토리). 추후 Past/Earnings 진입 | Accept | 03B (+03C·07B·07C) |
| `/sitter/inquiries/[inquiryId]` | sitter | 문의 스레드 — 말투 초안 + **Send** (D36) | Send | 07B |
| `/sitter/feed` (tab: Feed) | sitter | 맡은 펫 앨범 · + Photo (`/sitter/feed/[petId]`와 연결) | **+ Photo** | 05 |
| `/sitter/feed/[petId]` | sitter | Pet 피드 (sitter 뷰) | **+ Photo** (FAB) | 05 |
| `/sitter/diary` (tab: Diary) | sitter | 스테이 로그 + 저녁 칩 알림장(구 Report·Tasks) | **Send** / Mark done | 06–07 |
| `/sitter/mood` (tab: Mood) | sitter | Owner와 동일 Mood 도구 | Snap / pick | 11.9 |
| `/sitter/tasks`, `/sitter/report` | sitter | *(removed as tabs — redirect to Home / Diary)* | — | legacy |
| `/sitter/scan` (Home 버튼 → Stack) | sitter | Treat scanner | **Scan label** | 08 (stretch) |
| `/sitter/notifications` (header bell) | sitter | 알림 센터 | 탭 → 해당 화면 | 05 |
| `/profile` (Earnings, 추후) | sitter | Profile **Earnings** — 받은 금액·기간 요약 (데모 pay). 스테이 목록은 Bookings Past | — | P1 / 10+ |
| `/dev/gestures` | - | 마우스 동작 테스트 화면 (긴 목록·가로 줄·모달·토스트·입력창). `EXPO_PUBLIC_DEV_ROUTES=1`일 때만, 링크 없음 | - | 1.7 |
| `/dev/health` | - | Backend `GET /health` 확인 (Check API — 1.3 화면을 `/`에서 옮김). `EXPO_PUBLIC_DEV_ROUTES=1`일 때만 | Check API | 1.3 → 3.3 |

- 탭 (D47 · D47b): owner·sitter 모두 **`Home · Bookings · Feed · Diary · Mood`**. Scan = Home 버튼(08). 알림 벨 = 헤더; **Settings · (sitter) Earnings** = 헤더 Profile. 탭은 expo-router **JS `Tabs`** (D25).
- 웹 쿼리 (D25, 모든 route 공통): `?frame=0` 폰 프레임 끄기 · `?frame=1` 강제로 켜기 · `?view=split` Owner·Sitter 폰 나란히 (10.10 stretch).
- Owner Feed 펫 필터 = **멀티토글 칩**(선택/해제; 0이면 안내 또는 기본 전체). Diary·Mood도 같은 펫 집합을 쓸 수 있음. 데모는 2마리(Max 강아지, Mochi 고양이).
- 역할 영역은 **URL 접두사 폴더** `app/owner/`·`app/sitter/` (D26) — 그룹 `(owner)`/`(sitter)`가 아님. 역할 가드는 `components/RoleTabs.tsx`: 미로그인 → `/login`, 다른 역할 → 자기 홈(`/owner` ↔ `/sitter`). `(auth)` 그룹은 로그인 상태면 `/`로.

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
| `MODEL_VISION` / `MODEL_VISION_BASE_URL` | `openbmb/MiniCPM-V-4_5` / us-central1 URL (확정 — NVIDIA 비전 모델은 Dedicated Endpoint 전용이라 공용 API에 없음, D39 · [model-ids.md](notes/model-ids.md)) | 08, 09 |
| `MODEL_SAFETY` / `MODEL_SAFETY_BASE_URL` | `nvidia/Nemotron-3-Ultra-550b-a55b` / us-central1 | 08 |
| `MODEL_REPORT` / `MODEL_REPORT_BASE_URL` | `nvidia/nemotron-3-super-120b-a12b` / us-central1 | 07 |
| `MODEL_FAST` / `MODEL_FAST_BASE_URL` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` / eu-north1 | 07.1 테스트, 07B 문의 답변 |
| `MODEL_EMBED` / `MODEL_EMBED_BASE_URL` / `MODEL_EMBED_DIM` | `Qwen/Qwen3-Embedding-8B` / eu-north1 / `1024` (D33 — `dimensions` 파라미터 동작 확인 2026-10-01) | 07B RAG, 07C Life Record |
| `TAVILY_API_KEY` | Tavily 대시보드 (Builders & Brews 등). **backend만** | 08.7 stretch (세이프티 웹 검색, 못 하면 11.3). [tavily.ko.md](../tavily.ko.md) |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_OAUTH_REFRESH_TOKEN` | Goldito Google 계정의 OAuth 클라이언트 + 그 계정이 한 번 동의해 받은 refresh token (scope `https://www.googleapis.com/auth/calendar.events`, OAuth 앱 게시 상태 **In production** — Testing이면 7일 만료). **backend만** | 3B.11 (영상 Meet & Greet, D45) |
| `GOOGLE_CALENDAR_ID` / `MEET_INVITE_ATTENDEES` | `primary` / `true` (`false`면 링크만 만들고 초대 메일 없음 — 데모 `.test` 계정은 항상 생략) | 3B.11 |
| `DEMO_PASSWORD` | 데모 계정 전용 비밀번호 — `scripts/seed_demo.py`가 사용, frontend `EXPO_PUBLIC_DEMO_PASSWORD`와 같은 값 (심사위원에게 공개되는 값, 실제 비밀번호 재사용 금지) | 10.1 (계정 부분은 2026-10-01 먼저) |

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
- 타임아웃 (서버→Nebius): caption 20s, handoff-check 20s, inquiry-reply 45s (초안 생성 기준 — 목표 p50 < 10s, 사람 속도 지연 D37은 이 타임아웃과 별개), care-plan 45s, report-chips 30s, daily-report 60s, life-record 60s, safety 90s (vision 30 + reasoning 60). 서버→Google Calendar(meet video-link) 15s. 프론트 fetch 타임아웃은 여기에 +5s.
- 예약 단위 권한: `services/authz.py`에 `assert_booking_party(booking_id)`(견주 또는 시터) / `assert_booked_sitter(booking_id, from_hours_before=2)`(인수인계 사진 — 맡기기 2시간 전부터)를 둔다.
- 모든 AI 응답에 `model`(사용한 model id)과 `latency_ms` 포함 → 피드백 로그·데모 설명에 사용.

### 엔드포인트 계약 (전체)

| Method | Path | 권한 | Body | Response | Phase |
| :--- | :--- | :--- | :--- | :--- | :--- |
| GET | `/health` | - | - | `{status:"ok"}` | 01 |
| GET | `/health/deep` | - | - | `{status:"ok", db:"ok"}` (Supabase `select 1`) — keep-alive 전용 | 10 |
| GET | `/api/me` | any | - | `{id, email, role, display_name}` | 03 |
| POST | `/api/meet-greet/video-link` | 예약 당사자 (영상 M&G가 agreed) | `{booking_id}` | `{meet_url, calendar_event_id, starts_at}` — 멱등(이미 있으면 그대로), Google 실패 → 502 `upstream_error`(화면은 .ics·링크 붙여넣기 fallback) | 3B.11 (D45) |
| POST | `/api/media/sign` | on-duty sitter (`handoff`은 booked sitter — 맡기기 2시간 전부터) | `{pet_id, resource_type:"image"\|"video", purpose, booking_id?}` — purpose `feed`·`task_proof`·`report`·`handoff`·`safety_label` | `{cloud_name, api_key, timestamp, signature, folder, upload_url}` | 04 |
| POST | `/api/media/complete` | 위와 같음 | `{pet_id, public_id, resource_type, purpose, width?, height?, duration?}` | `{media_id, public_id, secure_url, thumb_url}` | 04 |
| POST | `/api/ai/inquiry-reply` | 문의 당사자 (견주가 보낸 직후 프론트가 호출) | `{inquiry_id}` | `{message_id, body, can_host, needs_sitter, quote, sources:[{type, id}], model, latency_ms}` — `quote`는 `quote_booking` 결과 그대로 (D29) | 07B |
| POST | `/api/ai/care-plan` | owner of pet | `{pet_id, text}` (≤ 2000자) | `{tasks:[{type, time, title, dose?, notes?}], cautions:[str], skipped:[{type, title, reason}], model, latency_ms}` — 서버가 종 규칙(D23)·시각 형식·중복을 강제하고 걸러낸 항목은 `skipped`에 이유와 함께 돌려줌. **초안만**, 저장은 견주 확인 후 Supabase (§6) | 06 |
| POST | `/api/ai/handoff-check` | booked sitter | `{booking_id, kind:"drop_off"\|"pick_up", check_type:"pet_checkin"\|"vehicle_safety"\|"return", media_id}` | `{check_id, status:"ok"\|"warning", findings:{pet_visible, crate_visible?, restraint_visible?}, message, model, latency_ms}` — 실패·타임아웃이면 `status:"unchecked"` (인수인계는 계속 가능) | 06B |
| POST | `/api/ai/caption` | on-duty sitter | `{pet_id, media_id}` | `{caption, category:"meal"\|"walk"\|"nap"\|"play"\|"other", source:"ai"\|"fallback", model, latency_ms}` | 09 |
| POST | `/api/ai/report-chips` | on-duty sitter | `{pet_id, date:"YYYY-MM-DD", media_ids?:[≤2]}` | `{chips:[{id, kind, label, source:"checkin"\|"task"\|"photo", media_id?}], photos:[{media_id, description}], model, latency_ms}` — 하루 기록 칩은 서버가 DB에서(모델 없음), 사진 칩만 `MODEL_VISION`. 사진 묘사는 draft에 저장해 daily-report가 재사용 | 07 (7.7, D38) |
| POST | `/api/ai/daily-report` | on-duty sitter | `{pet_id, date:"YYYY-MM-DD", inputs:{meal?, water?, potty?, walk_minutes?, mood?}, chips:[시터가 고른 칩], note?:(≤ 200자), media_ids?:[≤2]}` | `{report_id, body, status:"draft", model, latency_ms}` — 게시는 시터 승인(`send_daily_report`) 뒤 | 07 |
| POST | `/api/ai/life-record` | booking party (찾기 완료 후) | `{booking_id}` | `{records:[{pet_id, record_id, summary}], model, latency_ms}` + RAG 인덱싱 | 07C |
| POST | `/api/ai/safety-check` | on-duty sitter | `{pet_id, media_id}` | `{safety_check_id, safety_status, matched_allergens[], detected_ingredients[], unknown_ingredients[], warning_message, model, latency_ms}` | 08 (stretch) |
| POST | `/api/ai/pet-theme` | owner of pet | `{pet_id, media_id}` | `{theme, coat_colors[], confidence, model, latency_ms}` (실패·저신뢰 시 `theme:"default"`) | 11.10 (P1) |
| POST | `/api/ai/report-decor` | on-duty sitter | `{report_id}` | `{theme, preset_stickers[], model, latency_ms}` (실패 시 `theme:"calm"`, `[]`) | 11.8 (P1) |

> 알림장 **전송**, task **완료**, 피드 **게시**, 견적·동의·결제·출입 정보 해제·이동 위치·리뷰는 FastAPI가 아니라 Supabase(RLS/RPC)로 처리합니다 (§6). FastAPI는 AI·Cloudinary·RAG 인덱싱·Google Meet 링크만.

---

## 6. 쓰기 경로 요약 (누가 무엇을 어디로 쓰나)

| 동작 | 경로 | 부수효과 (트리거) |
| :--- | :--- | :--- |
| 가입 | Supabase Auth `signUp({options:{data:{role, display_name}}})` | `handle_new_user` → `profiles` + `owner_profiles`/`sitter_profiles` |
| pet 생성/수정, 알레르기, care_tasks | Supabase client (owner RLS). **pet insert는 클라이언트가 `id`(UUID)를 만들고 `.select()` 없이** — `pets_select`가 같은 테이블을 읽는 함수(`is_owner_of`)로 판단해서, 같은 문장에서 넣은 행을 못 봐 `insert().select()`가 RLS에 막힐 수 있음 (3.5). 같은 패턴의 다른 테이블도 동일 | `guard_care_task_species` |
| 스케줄 open(칸·시간·정원)/blocked | Supabase client `sitter_availability` (본인 RLS). 기간 일부 변경 = 새 open 행 insert (최근 행 우선) | 확정 칸과 겹치거나 정원이 확정 마리 수보다 작아지면 `guard_availability_change`가 거부 → 시터가 먼저 `cancel_booking`. **알림 없음** |
| 단골 시터·스케줄 보기 | RPC `list_my_sitters()` / `get_sitter_schedule(sitter, from, to)` | - |
| 시터 검색 | RPC `search_sitters(drop_off_at, pick_up_at, pet_count)` — 전체 가능 먼저, 일부 가능은 참고용 | - |
| 인수인계 시각·장소 제안 / 응답 | RPC `propose_handoff` / `respond_handoff` | 상대방 `handoff_proposed` / 제안자 `handoff_agreed` |
| 받았음 / 돌려줬음 | RPC `complete_handoff` (시터) | owner `pet_dropped_off` / `pet_picked_up` |
| 예약 요청 / 응답 / 취소 | RPC `request_booking`(첫 만남이면 `meet_greet_status='required'`) / `respond_booking`(첫 만남이면 M&G done·skipped 뒤에만 수락 — `meet_greet_required`) / `cancel_booking` (취소는 맡기기 전만) | 상대방에게 `booking_*` 알림 |
| 예약 반려동물 · 내 시터 프로필 조회 | RPC `get_booking_pets(booking)` / `get_my_sitter_profile()` | - |
| Meet & Greet (첫 만남만, D44) 제안 / 응답 / 완료 / 건너뛰기 | RPC `propose_meet_greet(p_booking, p_mode, p_at, p_place)` / `respond_meet_greet` / `complete_meet_greet` / `request_skip_meet_greet` / `respond_skip_meet_greet`(거부 = 예약 취소, reason `meet_greet_declined` — 문구는 "…would like to meet first") / `get_meet_greet_options`(양쪽 `meet_spots`) (03B). 영상이면 수락 직후 FastAPI `/api/meet-greet/video-link` (3B.11) | 상대방 `meet_greet_proposed` · 제안자 `meet_greet_agreed` (거절이면 `meet_greet_declined`) · 상대방 `meet_greet_skip_requested` · 요청자 `meet_greet_skipped` · 거부 시 `booking_cancelled` · 양쪽 `meet_greet_link_ready` |
| 문의 보내기 | Supabase client insert `inquiries` + 첫 `inquiry_messages`(owner) → 프론트가 FastAPI `/api/ai/inquiry-reply` 호출 (07B) | AI 초안 insert 시 시터 `inquiry_received` · 시터가 보냈거나 자동 발송이 공개된 시점에 견주 `inquiry_replied` (§7, D36·D37) |
| 견적 | RPC `quote_booking(sitter, service_type, drop_off_at, pick_up_at, pet_count)` — 읽기 전용, 문의 답변·Checkout 공용 (03C, D29) | - |
| 동의서 서명 · 데모 결제 | Supabase client insert `booking_consents` (견주 RLS) → RPC `pay_booking_demo(booking)` — 필요한 동의서가 다 있어야 함 (`consents_missing`) (03C) | 시터 `booking_paid` |
| 출입 정보 | 견주: Supabase client upsert `owner_home_access` (본인 RLS) / 시터: RPC `get_home_access(booking)` (D31 시간 조건) | 처음 열 때 `access_reveals` + 견주 `access_unlocked` |
| 케어 의뢰서 저장 | FastAPI `/api/ai/care-plan` 초안 → 견주 확인 → Supabase client insert `care_requests` + `care_tasks` + `pet_cautions` (06) | `guard_care_task_species` |
| 이동 시작 / 위치 / 종료 | RPC `start_trip(booking, kind)` / `update_trip_position(trip, lat, lng)` (5초마다) / `end_trip(trip)` (06B, D32) | 상대방 `trip_started` / 150 m 안 `trip_arrived` |
| 인수인계 사진 체크 | FastAPI `/api/ai/handoff-check` (service role insert `handoff_checks`) → `complete_handoff(booking, kind, p_check)` | 알림 제목에 "photo verified ✅" |
| 리뷰 | Supabase client insert `reviews` (견주 RLS, 찾기 완료 후 1회) (07C) | 시터 `review_received` |
| Life Record | FastAPI `/api/ai/life-record` (service role insert `pet_life_records` + `knowledge_chunks`) (07C) | 견주 `life_record_updated` |
| 오늘 task_logs 생성 | RPC `ensure_today_task_logs(pet_id)` — 화면 진입 시 자동 호출, 멱등 | - |
| 미디어 등록 | FastAPI `/api/media/complete` (service role) | - |
| 피드 게시 | Supabase client insert `feed_posts` (시터 on-duty 또는 펫 owner RLS, `posted_by`·`visibility`) — `lib/feed.ts` | `notify_feed_post` → owner `feed_post` (task 연결 post는 제외) |
| task 완료 | RPC `complete_task_log(task_log_id, media_id)` → 내부에서 feed_post도 생성 | owner `task_done` |
| 알림장 칩 제안 | FastAPI `/api/ai/report-chips` (하루 기록 칩 + 사진 칩, 사진 묘사는 draft에 저장) | - |
| 알림장 초안 | FastAPI `/api/ai/daily-report` (service role upsert — 고른 칩·메모·사진 묘사만 입력) | - |
| 알림장 전송 | RPC `send_daily_report(report_id, body)` | owner `report_sent` |
| 세이프티 결과 | FastAPI `/api/ai/safety-check` (service role insert) | DANGER면 owner `safety_danger` |
| 경고 확인 | Supabase client update `safety_checks.acknowledged_at` (sitter RLS) | - |
| 알림 읽음 | Supabase client update `notifications.read_at` (본인 RLS) | - |

---

## 7. 알림 매트릭스 (P0)

| type | 수신자 | 생성 위치 | 제목 예 (EN) | 탭 시 이동 |
| :--- | :--- | :--- | :--- | :--- |
| `inquiry_received` | sitter | AI 초안 insert (07B, D36) | "Robert asked about Oct 9–12 — your draft reply is ready" | `/sitter/inquiries/[id]` |
| `inquiry_replied` | owner | 시터 메시지가 보이는 시점(`status='sent'`, `visible_at <= now()`) | "Chloe replied 💬" | `/owner/inquiries/[id]` |
| `booking_requested` | sitter | `request_booking` RPC | "New booking request: Oct 5 – Oct 12" | `/sitter/bookings` |
| `meet_greet_proposed` / `meet_greet_agreed` | 상대방 / 제안자 | Meet & Greet RPC (03B) | "Robert suggested a video Meet & Greet on Oct 6, 7:00 PM" | 예약 상세 |
| `meet_greet_declined` | 제안자 | `respond_meet_greet` 거절 (3B.9) | "Chloe can't make that Meet & Greet — suggest another time" | 예약 상세 (다시 **Schedule Meet & Greet**) |
| `meet_greet_skip_requested` | 상대방 | `request_skip_meet_greet` RPC (03B, D44) | "Robert would like to skip the Meet & Greet. Continue the booking without meeting first?" | 예약 상세 (**Continue** / **Decline — cancels the booking**) |
| `meet_greet_skipped` | 요청자 | `respond_skip_meet_greet` 수락 | "Chloe is OK to skip the Meet & Greet — your booking continues" | 예약 상세 |
| `meet_greet_link_ready` | 양쪽 | `/api/meet-greet/video-link` (3B.11, D45) | "Video Meet & Greet on Oct 6, 7:00 PM — join with Google Meet" | 예약 상세 (**Join Google Meet**) |
| `booking_paid` | sitter | `pay_booking_demo` RPC (03C) | "Robert signed and paid — Oct 9–12 is all set ✅" | `/sitter/bookings/[id]` |
| `access_unlocked` | owner | `get_home_access` 첫 공개 (03C) | "Chloe can now see your entry info (2 h before pick-up)" | 예약 상세 |
| `trip_started` | 상대방 | `start_trip` RPC (06B) | "Chloe is on the way — ETA 7:42 AM 🚗" | Trip 화면 |
| `trip_arrived` | 상대방 | `update_trip_position` 150 m 안 (06B) | "Robert has arrived 🚗" | Trip 화면 |
| `booking_confirmed` / `booking_declined` | owner | `respond_booking` RPC · `booking_declined`는 확정 전 협의에서 시터가 거절할 때 `respond_handoff`도 | "Chloe confirmed your booking for Max and Mochi 🎉" | `/owner/bookings/[id]` |
| `handoff_proposed` | 상대방 | `propose_handoff` RPC | "Paul suggested drop-off at 8:30 AM" | 예약 상세 |
| `handoff_agreed` | 제안자 | `respond_handoff` RPC | "Robert agreed to pick-up at 8:00 PM" | 예약 상세 |
| `handoff_declined` | 제안자 | `respond_handoff` RPC (확정 후 변경 거절) | "Chloe declined the pick-up change" | 예약 상세 |
| `pet_dropped_off` / `pet_picked_up` | owner | `complete_handoff` RPC | 장소별: "Max and Mochi checked in at Chloe's ✅" / Sitter drives: "Pick-up complete — care has started 🚗" / 찾기: "Max and Mochi are home safe 🏠" (사진 체크가 있으면 "· photo verified") | 예약 상세 |
| `review_requested` | owner | 찾기 완료 트리거 (07C) | "Thanks for trusting Chloe! How was Max's stay? ⭐" | `/owner/bookings/[id]/review` |
| `review_received` | sitter | `reviews` insert 트리거 (07C) | "Robert left you 5 stars ⭐" | `/sitter/bookings/[id]` |
| `life_record_updated` | owner | `/api/ai/life-record` (07C) | "Max's Life Record was updated 📒" | `/owner/pets/[id]/record` |
| `booking_cancelled` | 상대방 | `cancel_booking` RPC · 확정 전 협의에서 견주가 거절할 때 `respond_handoff`도 · Meet & Greet 건너뛰기를 거부할 때 `respond_skip_meet_greet`도 | "Chloe can't take Max and Mochi on Oct 5–8. Find a new sitter." / 건너뛰기 거부: "Chloe would like to meet first, so this booking was cancelled. Find a new sitter." | 예약 상세 (**Find a new sitter**) |
| `feed_post` | owner (시터 게시) · 당직 sitter (오너 게시) | 트리거 on `feed_posts` insert (`task_log_id is null` · `visibility = 'shared'`) | "New photo of Max 📸" / "Robert shared a photo of Max 📸" | `/owner/feed` · `/sitter/feed/[petId]` |
| `task_done` | owner | `complete_task_log` RPC | type별: "Max had breakfast on time 🍽️" / "Max is asleep 😴" / "Max's medication is done 💊" | `/owner/diary` (Live / history) |
| `care_checkin` | owner | `log_care_checkin` RPC | kind별: meal / potty / mood / note (Plan B — [sitter-care-loop.ko.md](../sitter-care-loop.ko.md)) | `/owner/diary` |
| `report_sent` | owner | `send_daily_report` RPC | "Today's report for Max is here 📝" | `/owner/diary` (entry) |
| `safety_danger` | owner | 트리거 on `safety_checks` insert (`safety_status='DANGER'`) — 08 stretch | "Blocked a risky treat for Max ⚠️" | `/owner/notifications` |
| `task_due` (stretch) | sitter | Serverless Job / APScheduler (6.7) | "Max's walk is due at 10:30" | `/sitter/tasks` |
| `photo_request` (P1) | sitter | Phase 11 | "Owner asked for a photo of Max" | `/sitter/feed/[id]` |

프론트: `NotificationsProvider`가 `notifications` Realtime(INSERT, `user_id=eq.<me>`)을 구독 → 토스트 + unread 카운트 갱신 + type별 쿼리 invalidate (예: `feed_post` → 피드 리페치).

---

## 8. UX 공통 규칙 (모든 화면)

1. **상태 4종 필수:** loading(Skeleton) · empty(EmptyState 문구) · error(재시도 버튼) · success(Toast).
2. **1화면 1 주 액션** — §3 표의 "주 액션"만 primary 버튼.
3. **sitter 필수 텍스트 입력 금지 (P0, D38 — 글쓰기 거의 제로: AI가 하루 기록·사진에서 칩을 제안하고 시터는 고르기 + 짧은 메모만 선택)** — 예외(모두 선택): 알림장 짧은 메모(≤ 200, D38), check-in 메모 1줄(≤ 120, D34), 알림장 게시 전 본문 편집, 인수인계 제안 메모 1줄, 문의 스레드 짧은 답, 시터 정책 문서·선호 만남 장소(프로필, 한 번 작성). 견주 텍스트(문의 질문·케어 의뢰서·동의서 서명 이름·선호 만남 장소)는 허용.
4. **DANGER 모달**은 빨간 전체 모달, "I understand — don't feed" 버튼 누르기 전 닫기 불가 (backdrop/ESC 무시).
5. **사진 선택:** 모든 화면은 `pickMedia()`(4.7)만 사용. 네이티브 = `expo-image-picker` 카메라/앨범, 모바일 웹 = `capture` 입력, **데스크톱 프레임·데모 계정 = 샘플 사진 트레이 + Choose from library**(시스템 파일/갤러리 피커 — 폰·웹 데모 동일 문구, "Upload from computer" 금지). 샘플도 `uploadMedia()`를 그대로 타서 AI가 실제로 분석.
6. 모든 사용자 문구는 영어 (D1). Empty state 예: "No posts yet — your sitter will share photos here."
7. 개발 빌드에만 헤더에 `Owner`/`Sitter` 역할 라벨 표시 (`APP_ENV !== 'production'`).
8. **마우스로 전부 동작 (D25):** 제스처 전용 기능 금지 (스와이프 뒤로가기·삭제, 시트 끌어내리기, 길게 누르기, 당겨서 새로고침 — 웹 `RefreshControl`은 동작 안 함). 항상 보이는 버튼을 둔다. 웹 미지원 라이브러리 금지 (예: `@react-native-community/datetimepicker` → 직접 만든 선택 UI). 화면 PR마다 [DESIGN.md §7.7](../../../DESIGN.md#77-works-with-a-mouse) 데스크톱 체크.
9. **지도는 보기 전용 (D32):** 자동 맞춤(이동하는 쪽 + 목적지) + ± 버튼, 드래그 팬·핀치 없음 — 프레임 안 마우스 드래그는 스크롤로 쓰임(1.7). 위치 공유 중이면 화면 상단에 "Sharing your location with Chloe until you arrive" 항상 표시.
10. **민감 정보 카드 (D31):** 출입 정보는 잠김 상태에서 "Unlocks Oct 9, 5:30 AM" + 자물쇠 아이콘만, 열려도 코드는 **Show code** 탭 후 표시.
11. **외부 링크는 새 탭 (D45):** Google Meet 링크는 폰 프레임(iframe) 안에서 열지 않고 새 탭으로 연다 (`Linking.openURL` → 웹은 `window.open`). Meet는 다른 사이트 안에 넣을 수 없다.

---

## 9. AI 호출 공통 규칙 (`services/nebius.py`)

- **왜 OpenAI 호환 SDK(`openai` 패키지)?** Nebius Token Factory는 **OpenAI Chat Completions와 같은 HTTP/API 형식**(`base_url` + `api_key` + `model` + `messages`)을 제공합니다. Nemotron 전용 Python SDK를 따로 쓰지 않고, 공식 cookbook·예제와 동일하게 `OpenAI(base_url=..., api_key=...)`로 호출하면 **리전별 base URL**(eu-north1 / us-central1)과 **모델 ID만 바꿔** Vision·Super·Ultra·Nano를 한 코드 경로로 처리할 수 있습니다. (직접 `httpx`로 POST해도 되지만, 스트리밍·에러 타입·멀티모달 `image_url` 메시지 형식을 SDK가 이미 맞춰 줍니다.)
- **model role → (model_id, base_url)** 매핑은 env에서 (§4). `OpenAI` 클라이언트 인스턴스는 base_url별로 캐시.
- `chat(role, messages, **kw)` / `chat_json(role, messages, schema: type[BaseModel])`.
- `chat_json` 규칙: ① `response_format={"type":"json_object"}` 시도 (7.1에서 지원 여부 확인 후 플래그) ② 응답에서 `<think>…</think>` 제거 ③ 첫 `{…}` 블록 추출 ④ pydantic 검증 ⑤ 실패 시 "Return only valid JSON matching the schema" 보정 메시지로 **1회 재시도** ⑥ 그래도 실패 → `ai_invalid_output`.
- Nemotron reasoning 모드: 캡션·알림장은 reasoning **off**(속도), 세이프티 reasoning 단계는 **on** (7.1에서 모델별 토글 방식 확인 후 `nebius.py`에 기록).
- 프롬프트 원문은 코드에 하드코딩하지 않고 `app/ai/prompts/**`의 파일에서 로드 (슬기가 코드 수정 없이 튜닝).
- 입력에 실제 PII 금지. 로그에 이미지 base64 출력 금지.
- **근거 고정 (D27–D29):** 모델 입력은 서버가 모은 JSON뿐 (스케줄·견적·펫 프로필·RAG 검색 결과·그날 기록). 가격·날짜·가능 여부·시간은 **입력 값을 그대로** 쓰게 하고, 응답 후 서버가 숫자를 다시 대조한다 (07B — 입력에 없는 금액이 나오면 견적 카드만 두고 문장은 재생성 1회, 또 실패하면 고정 문구 "Chloe will confirm the details soon."). 출입 정보(D31)는 어떤 프롬프트에도 넣지 않는다.
- **말투 레이어 (D35):** 견주에게 보이는 자연어를 만드는 엔드포인트(inquiry-reply · daily-report · caption)는 프롬프트를 직접 조립하지 않고 `tone.compose(sitter_id, intent, facts)`를 거친다 — 스타일 가이드 + 시터의 `tone_samples` top-k(few-shot) + 서버 근거 JSON. 1인칭("I"), 자리표시자(`{PRICE}`·`{DATE}`)는 서버가 채우고 숫자는 근거 JSON과 대조한다(D29). 안전 경고·동의서·견적 숫자는 고정 문구로 레이어를 거치지 않는다. 시터의 승인·수정·재생성은 `tone_samples`에 기록(자동 발송은 학습에서 제외). 견주 메시지는 저장 전 익명화.
- **임베딩 (D33):** `embed(texts)` — `MODEL_EMBED`, `dimensions=MODEL_EMBED_DIM`(1024), 배치 ≤ 16. 검색은 SQL `match_knowledge(query_embedding, p_sitter, p_pets[], p_owner, k)` (cosine, 범위 필터 먼저). 출처 `source_type`: `sitter_policy` · `life_record` · `inquiry` · `care_request`. 같은 `(source_type, source_id)`는 덮어쓰기. **출처별 검색 범위:** `sitter_policy` = 그 시터 · `life_record`·`care_request` = 그 반려동물(새 시터와도 공유 — 문의 시트에서 안내, 07B) · `inquiry` = 그 견주 **그리고** 그 시터가 모두 일치할 때만, 견주 메시지만 인덱싱 (다른 시터와 나눈 대화·금액이 새 시터의 초안에 섞이지 않게).
- **칩 제안 (D38):** `report-chips`는 하루 기록 칩을 서버가 DB에서 만들고(모델 없음), 사진 칩만 `MODEL_VISION`이 사진당 1–2개 짧은 문구로 제안한다. 칩은 제안일 뿐이고, 시터가 고른 칩과 메모만 알림장 입력이 된다 (끈 칩은 입력에서 빠짐).
- **호출 지표 로그:** `chat()`/`chat_json()`마다 구조화 로그 1줄 — `{role, model, endpoint, ttft_ms, latency_ms, prompt_tokens, completion_tokens, retried, ok}` (TTFT는 스트리밍 첫 토큰 기준, 스트리밍 불가 모델은 null). 프롬프트·응답 본문은 남기지 않음. Phase 10 README의 **Token Factory / Nemotron 피드백**(필수·채점 항목)과 Most Valuable Feedback에 모델별 중앙값 표로 사용.

---

## 10. 검증 공통 절차 (각 Phase DoD 확인 방법)

| 레벨 | 방법 |
| :--- | :--- |
| Backend | `cd backend && pytest -q` (Nebius 키 없으면 AI 테스트 skip) + phase 문서의 `curl` 예시 |
| DB/RLS | Supabase SQL Editor에서 `supabase/tests/rls_smoke.sql` 실행 (역할별 `set local request.jwt.claims`) |
| Frontend | `npx tsc --noEmit` + Playwright 마우스 테스트 (1.7, CI) + 두 브라우저(일반 창 = owner, 시크릿 창 = sitter — 10.10 이후는 `?view=split`) 수동 시나리오를 **데스크톱 폰 프레임에서 마우스로** ([DESIGN.md §7.7](../../../DESIGN.md#77-works-with-a-mouse) 체크) |
| 데모 | Phase 10 "A Stay with Goldito" 체크리스트 ([full-process.ko.md §6](../full-process.ko.md#6-데모-경로-a-stay-with-goldito)) |

---

## 11. CI/CD 파이프라인 (D20)

```
PR 열기/업데이트 ──> ci.yml ─┬─ backend: ruff check · pytest -q                               ─┐
                             └─ frontend: npm ci · tsc --noEmit · expo export · playwright (1.7) ┴─> ✅ 필수 체크 → 머지 가능
                    Vercel ──> Preview URL (PR 코멘트)

main 머지 ─┬─> Vercel ──> 운영 frontend 자동 배포
           └─> Render ──> backend/Dockerfile 빌드 · 배포 → Health Check /health (실패하면 이전 배포 유지)

10분 cron ──> keepalive.yml ──> GET https://goldito-backend.onrender.com/health — Render 무료 잠듦 방지 (15분 무요청 시 잠듦)
DB migration ──> 사람이 SQL Editor에서 00N_*.sql 순서대로 (PR 본문에 "migration 00N 적용 필요" 명시)
```

| 항목 | 규칙 |
| :--- | :--- |
| CI 트리거 | `pull_request` + `push: main`. `paths` 필터로 backend/frontend job 각각 변경 시만 실행 (docs-only PR은 스킵 → 필수 체크는 "skipped = pass" 되도록 job 단위 `if` 사용) |
| CI 환경 | Python 3.12 + pip cache, Node 20 LTS + npm cache + Playwright 브라우저(Chromium·WebKit·Firefox) cache. Playwright는 `expo export` 결과를 정적 서버로 띄워 데스크톱 해상도 3종에서 마우스만으로 테스트 (`EXPO_PUBLIC_DEV_ROUTES=1`, 백엔드 불필요). **시크릿 없음** — AI 테스트는 `NEBIUS_API_KEY` 없으면 skip, Supabase 호출은 mock |
| 브랜치 보호 | 1.5 완료 후 GitHub Settings → `main`: PR 필수, `ci / backend`·`ci / frontend` 통과 필수 (민식이 설정) |
| GitHub Secrets | 없음 — CD는 Render · Vercel의 Git 연동. 앱 런타임 키(Supabase·Cloudinary·Nebius Token Factory API)는 **Render env / Vercel env에만** 저장 |
| 롤백 | backend: Render 대시보드 → Deploys → 이전 배포 **Rollback**. frontend: Vercel 대시보드 "Promote previous deployment" |
| Keep-alive | Render 무료는 **15분 동안 요청이 없으면 잠들고** 첫 요청이 30~50초. 10분마다 `/health`를 부른다 (GitHub Actions cron은 몇 분씩 늦을 수 있어 외부 핑 서비스를 함께 써도 됨). **배포 · 테스트 작업 전에 핑이 돌고 있는지 먼저 확인** ([env-setup.ko.md](../env-setup.ko.md) § 배포된 백엔드) |

