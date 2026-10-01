# P0 개발 Todo & AI 프롬프트 플레이북

> ⚠️ **정본은 [phases/architecture.ko.md](phases/architecture.ko.md) + 각 phase 문서입니다.** 아래 프롬프트는 출발점일 뿐이며, 스키마·엔드포인트 body·파일 경로가 다르면 phase 문서를 따르세요 (예: safety-check는 multipart가 아니라 `{pet_id, media_id}`, UI·AI 출력은 영어 전용, Nebius client는 `backend/app/services/nebius.py`). 프롬프트에 해당 phase 문서의 "작업 상세" 표를 함께 붙여 넣는 것을 권장합니다.

> **목적:** 리포가 문서만 있는 상태에서, P0(피드·투약/산책·알림장·세이프티 가드)까지 **AI(Cursor)에게 줄 명령**을 단계별로 정리.
> **원칙:** 한 프롬프트 = 한 산출물. 항상 *수용 기준(DoD)* 를 붙인다.

관련 문서: [개발 계획](README.ko.md) · **[Phase별 Goal & 상세](phases/README.ko.md)** · [스키마 정본 phase-02](phases/phase-02.md) · [제품 README](../README.ko.md)

---

## 0. 어디부터? (추천 순서 한 줄)

**사람(계정·키) → DB 스키마 → 백엔드 뼈대 → 프론트 뼈대 → 인증·역할 → Cloudinary 업로드 → 피드( AI 없이) → 알림 → 일정/투약 → AI 모듈(슬기) 붙이기 → 알림장 → 세이프티 → 시드·데모·배포**

AI는 **위에서 아래로** 진행할 때 실패가 적습니다. AI 캡션/알림장/세이프티는 **피드·일정 API가 먼저** 있어야 붙입니다.

---

## 1. AI에게 줄 때 공통 프롬프트 머리말 (매번 복붙)

```text
You are working in the PawNote monorepo (Nebius x NVIDIA hackathon).
Stack: Expo (React Native Web), FastAPI (Python 3.12), Supabase (Postgres + Auth + Realtime), Cloudinary (media), Nebius Token Factory — Nemotron for reasoning/reports, MiniCPM-V for vision (AI only in backend).

Rules:
- Minimize scope: only change files needed for this task.
- Match existing conventions once they exist.
- No secrets in git; use .env.example only.
- English for code, comments, UI copy, and AI output (architecture D1).
- UI must work inside the desktop phone frame with a mouse (architecture D25, DESIGN.md §7.7): no gesture-only actions, no web-unsupported libraries, photos only via pickMedia().
- Do not commit unless I ask.

Read before coding:
- CLAUDE.md, docs/plan/TODO.md (current focus)
- docs/plan/phases/architecture.ko.md + the phase doc for this task (source of truth)

Task:
<아래 단계별 Task 내용>

Definition of done:
<해당 단계 DoD>

Output:
- List files created/changed
- How to run/verify locally
- Any follow-up tasks blocked on me (API keys, Supabase dashboard)
```

---

## 2. Phase 0 — 사람이 먼저 (AI 전)

| ID | Todo | 담당 | DoD |
| :--- | :--- | :--- | :--- |
| 0.1 | Supabase 프로젝트 생성, 리전 선택 | 민식 | URL + anon key + service role key 확보 |
| 0.2 | Cloudinary 계정, 업로드 프리셋(폴더 `pawnote/{pet_id}/`) | 민식 | cloud name, API key/secret |
| 0.3 | Nebius Token Factory API key, `GET /v1/models`로 비전 모델 ID 확인 | 슬기 | 사용할 model ID 목록 문서화 |
| 0.4 | Tavily API key (P0 후반 또는 P1) | 슬기 | key 확보 |
| 0.5 | `.env` 로컬 파일 (gitignore) | 민식 | backend/frontend 각각 |

---

## 3. Phase 1 — 모노레포 틀

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 1.1 | 디렉터리 구조 + 루트 README에 로컬 실행 한 줄 | 0.5 | `frontend/`, `backend/`, `supabase/migrations/` 존재 |
| 1.2 | `backend`: FastAPI app, `/health`, CORS, pydantic settings | 1.1 | `curl localhost:8000/health` → 200 |
| 1.3 | `frontend`: Expo (tabs or stack), web 실행 | 1.1 | `npx expo start --web` 동작 |
| 1.4 | 루트 `.gitignore` 보강 (`.env`, `data/raw/`) | 1.1 | |
| 1.6 | Web shell: 데스크톱 폰 프레임 402 × 874 (iframe, D25) | 1.3 | 데스크톱 = 프레임, 폰 = 전체 화면, `?frame=0` |
| 1.7 | `TouchEmulation` + `/dev/gestures` + Playwright 마우스 테스트 (CI) | 1.6 | CI 통과, 드래그 스크롤·클릭 = 탭 |

### AI 프롬프트 — 1.1 모노레포 scaffold

```text
Create monorepo layout under PawNote:
- frontend/ Expo app (TypeScript), app router or standard expo-router — pick one and document in frontend/README.md
- backend/ FastAPI with pyproject.toml or requirements.txt
- supabase/migrations/ for SQL
- backend/.env.example and frontend/.env.example with placeholders: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, NEBIUS_API_KEY, API_BASE_URL

Do not implement features yet. Add a root section in README Getting Started pointing to frontend and backend readmes.

DoD: both packages install and start skeleton; no real secrets.
```

### AI 프롬프트 — 1.2 FastAPI 뼈대

```text
Implement backend/app/main.py with FastAPI, CORSMiddleware allowing Expo web dev origins, GET /health returning {"status":"ok"}.
Use pydantic-settings in backend/app/config.py for env vars listed in .env.example.
Add backend/README.md with uvicorn run command.

DoD: uvicorn app.main:app --reload works from backend/.
```

### AI 프롬프트 — 1.3 Expo 뼈대

```text
Scaffold Expo TypeScript app in frontend/ with a single Home screen showing "PawNote" and API health check button that fetches BACKEND_URL/health.
Use expo-constants or env for EXPO_PUBLIC_API_URL.

DoD: web loads and health check shows ok when backend runs.
```

### AI 프롬프트 — 1.6 Web shell (데스크톱 폰 프레임)

```text
Implement the web shell from architecture D25 and phase-01 task 1.6.
- components/shell/AppShell.tsx (native: return children) and AppShell.web.tsx.
- presentation.ts resolvePresentation(): direct when inside an iframe, ?frame=0, or the primary input is touch (pointer: coarse); framed when ?frame=1 or on a mouse/trackpad computer at any window width.
- framed: render only a backdrop + DeviceFrame.web.tsx + a same-origin <iframe> of the current path+search (set src once). No providers or routes in the outer page.
- DeviceFrame: generic CSS phone, screen 402 x 874, status bar + home indicator outside the iframe, the app always lays out at 402 px; height shrinks on short windows (min 600) and the whole phone scales down on windows narrower than it; no real device images.
- Inside the iframe, mirror route changes to the parent with window.parent.history.replaceState.
- useLayoutMode() returns 'compact' for now; useShell() exposes { embedded }.
- Add layout.frameWidth/frameHeight, breakpoint.expanded, and frame colors to theme/tokens.ts.
- Mount AppShell outside every provider in app/_layout.tsx.

DoD: phase-01 1.6 DoD column (desktop framed at any width, touch phone full screen, refresh keeps route, 1366x768 not cut off).
```

### AI 프롬프트 — 1.7 마우스 = 손가락 + 테스트

```text
Implement phase-01 task 1.7.
- components/shell/TouchEmulation.web.ts, active only inside the iframe and only for pointerType 'mouse':
  drag-to-scroll with axis lock (6px) and momentum on the nearest scrollable ancestor; block the next click after a drag
  (window capture phase — react-native-web fires onPress on DOM click); vertical wheel scrolls horizontal-only rows;
  user-select none and no image drag (except inputs); round touch-like cursor; hidden scrollbars; overscroll-behavior contain.
  Skip inputs and elements with data-gesture-owner.
- app/dev/gestures.tsx behind EXPO_PUBLIC_DEV_ROUTES=1: long list, chip row, paged photos, pressable rows, overlay modal, toast, text input.
- Playwright in frontend/e2e (Chromium, WebKit, Firefox x 1366x768, 1440x900, 1920x1080), mouse only. Add to the CI frontend job against a static server of `expo export -p web`.
- Add .github/pull_request_template.md with the DESIGN.md §7.7 desktop checklist.

DoD: CI green; phone-browser touch scrolling unchanged.
```

---

## 4. Phase 2 — Supabase DB + RLS

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 2.1–2.6 | 스키마 17개 테이블 — [phase-02 §2.1–2.6](phases/phase-02.md#2126-스키마-001_initial_schemasql) | 0.1 | `001_initial_schema.sql` |
| 2.7 | RLS + 컬럼 권한 — [phase-02 §2.7](phases/phase-02.md#27-rls-002_rls_policiessql) | 2.1–2.6 | `002_rls_policies.sql` |
| 2.8 | 함수·트리거·예약 RPC + smoke test — [phase-02 §2.8](phases/phase-02.md#28-공통-함수트리거-003_functions_triggerssql) | 2.7 | `003_functions_triggers.sql`, `tests/rls_smoke.sql` |

> Phase 02는 완료(2.9 호스팅 적용만 남음). 스키마를 바꿀 때는 **phase-02.md 표를 먼저 고치고**, 아래 프롬프트에 그 표를 붙여 넣습니다.

### AI 프롬프트 — 001 / 002 / 003 (각각 별도)

```text
Update supabase/migrations/00N_*.sql to match docs/plan/phases/phase-02.md.
Paste: the phase-02 table(s) for this file (§2.1–2.6 schema / §2.7 RLS / §2.8 functions).

Rules:
- phase-02.md is the source of truth; if the SQL needs a different rule, stop and propose a doc change first.
- Keep rls_smoke.sql passing: stub + migrations + smoke on Postgres 17 (supabase/README.md "Local / CI").
- Add a smoke check for every new rule (expected result in a comment).

DoD: CI `supabase` job green; phase-02 DoD 2 list still true.
```

---

## 5. Phase 3 — 인증 & 역할 (프론트 ↔ Supabase)

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 3.1 | Supabase Auth 이메일/비번 (해커톤용) | 2.7 | 가입/로그인 |
| 3.2 | 로그인 후 `profiles.role` 로 owner/sitter 분기 | 3.1 | 두 홈 화면 스텁 |
| 3.3 | FastAPI: JWT 검증 (Supabase JWKS) 또는 프록시 패턴 결정 | 3.1 | `/api/me` 인증됨 |

**결정 포인트 (프롬프트에 명시):**
- **A안:** 프론트는 Supabase 직접(RLS) + AI만 FastAPI
- **B안:** 프론트는 전부 FastAPI (service role) — RLS 덜 씀

해커톤 속도: **A안 추천** (피드/CRUD는 Supabase client, `/api/ai/*` 만 FastAPI).

### AI 프롬프트 — 3.1–3.2 Auth UI

```text
Implement Supabase auth in frontend using @supabase/supabase-js:
- LoginScreen, SignUpScreen (email/password)
- Sign up with supabase.auth.signUp({ email, password, options: { data: { role, display_name } } }) — the handle_new_user trigger creates profiles + owner_profiles/sitter_profiles (no client insert, phase-03 3.2)
- After login, navigate to OwnerHome or SitterHome based on profile.role
- Store session with supabase auth persistence for web

DoD: can create owner and sitter test users; role persists.
```

### AI 프롬프트 — 3.3 FastAPI auth

```text
Add backend dependency get_current_user that validates Supabase JWT from Authorization Bearer header (use SUPABASE_JWT_SECRET or JWKS — pick standard approach for Supabase).
Route GET /api/me returns user id and role read from profiles (never from JWT user_metadata — users can edit it).

DoD: curl with valid access token returns 200; invalid returns 401.
```

---

## 6. Phase 4 — Cloudinary 업로드 파이프

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 4.1 | `POST /api/media/sign` signed upload params | 3.3, 0.2 | 프론트가 secret 없이 업로드 |
| 4.2 | 업로드 완료 후 `media` row + URL 반환 | 4.1 | DB에 public_id 저장 |
| 4.3 | 프론트: 이미지 picker → Cloudinary → 콜백 | 4.1 | 웹에서 파일 선택 동작 |
| 4.7 | `pickMedia()` + 샘플 사진 트레이 (데스크톱·데모 계정, D25) | 4.3, 1.6 | 데스크톱에서 샘플 → 같은 업로드 파이프 |

### AI 프롬프트 — 4.1–4.2

```text
Implement Cloudinary signed upload:
- POST /api/media/sign { pet_id, resource_type: image|video, purpose } requires an on-duty sitter: call rpc('is_on_duty_for') with the user's JWT (architecture §5, phase-04)
- Return timestamp, signature, cloud_name, api_key, folder pawnote/{pet_id}/
- POST /api/media/complete { pet_id, public_id, resource_type } inserts media row via Supabase service role or user client — use pattern consistent with Phase 3 choice

DoD: integration test script or manual steps in backend/README.md.
```

---

## 7. Phase 5 — P0-1 케어 피드 & 앨범 (AI 없이 먼저)

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 5.1 | Sitter: 개 선택 → 피드에 사진 업로드 → `feed_posts` 생성 | 4.3 | Owner 피드에 보임 |
| 5.2 | Owner: 앨범/피드 타임라인 UI (썸네일 Cloudinary transform) | 5.1 | `f_auto,q_auto,w_400` |
| 5.3 | 새 게시 시 `notifications` + Realtime toast | 5.1 | Owner 화면에 알림 |

### AI 프롬프트 — 5.1–5.3

```text
Implement care feed without AI captions first:
- SitterHome: list pets from confirmed bookings covering today (phase-03b 3B.6)
- DogFeedScreen (sitter): upload photo via signed flow, create feed_post with caption placeholder "..."
- OwnerHome: select pet, FeedTimeline with infinite scroll by created_at desc
- On feed_post insert, create notification for owner and subscribe via supabase channel for notifications insert

DoD: sitter posts photo, owner sees it within realtime or refresh; notification row exists.
```

---

## 8. Phase 6 — P0-2 투약·산책 의뢰 & 리마인더

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 6.1 | Owner: `care_tasks` CRUD (약/산책, 시간) | 3.2 | DB 반영 |
| 6.2 | `ensure_today_task_logs` RPC — 화면 진입 시 자동, 멱등 (수동 버튼 없음, phase-06 6.2) | 6.1 | sitter todo list |
| 6.3 | Sitter: due task → 완료 + **인증 사진** → task_log done | 4.3, 6.2 | optional feed_post link |
| 6.4 | 완료 시 owner notification | 6.3 | |
| 6.5 | 인앱 리마인더 배너 (phase-06) · stretch 6.7 Serverless Job | 6.2 | |

### AI 프롬프트 — 6.1–6.4

```text
Implement medication/walk tasks:
- OwnerTaskScreen: create care_task with a species-allowed type (medication, feeding, play, sleep + walk for dogs / litter for cats), title, dose optional, scheduled_time, repeat daily
- RPC ensure_today_task_logs(p_pet) in 005_tasks.sql, called automatically when the screen opens (idempotent) — phase-06 6.2
- SitterTasksScreen: list pending task_logs for today, Complete opens camera/upload, marks done, links media_id, creates feed_post optional with caption "Medication done" / "Walk done"
- Notify owner on completion

DoD: owner creates 8am medication, sitter completes with photo, owner gets notification and sees task done state.
```

---

## 9. Phase 7 — P0-3 알림장 (AI: Super)

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 7.1 | `backend/app/ai/nebius_client.py` 모델별 base_url | 0.3 | hello world chat |
| 7.2 | `POST /api/ai/daily-report` 입력: pet_id, date | 5.x, 6.x | draft JSON |
| 7.3 | Sitter: 초안 미리보기 → Send → `daily_reports.sent` | 7.2 | Owner 읽기 |
| 7.4 | Few-shot 파일 `backend/app/ai/prompts/daily_report/` (익명화 샘플) | 슬기 | git에 샘플만 |

### AI 프롬프트 — 7.1 Nebius 클라이언트

```text
Implement backend/app/services/nebius.py:
- OpenAI-compatible clients map model id -> base_url (eu-north1 vs us-central1 per docs/plan/README.ko.md)
- chat_completion(model, messages, **kwargs)
- Unit test mock or skip if no key

DoD: script scripts/test_nebius.py prints response from nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B.
```

### AI 프롬프트 — 7.2–7.3 알림장 API + UI

```text
POST /api/ai/daily-report { pet_id, date }:
- Gather today's feed_post captions, completed task_logs summaries (server-side Supabase service role)
- Call nvidia/nemotron-3-super-120b-a12b with system prompt from docs/plan (warm pet sitter, no fabrication)
- Save daily_reports status draft
- Sitter UI: Generate report button, edit optional single textarea, Send sets status sent and notifies owner
- Owner UI: DailyReportScreen read-only

DoD: end of day flow produces a warm English report from real today's data only.
```

### 슬기 전용 AI 프롬프트 — 7.4 Few-shot

```text
Do not change app code. Create backend/app/ai/prompts/daily_report/few_shot.json with 3 anonymized example reports (English, D1), and PROMPT.md describing rules. No PII. Placeholder names like "Bori".
```

---

## 10. Phase 8 — P0-4 간식 세이프티 가드

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 8.1 | `POST /api/ai/safety-check` photo + pet_id | 7.1, 2.2 | JSON schema |
| 8.2 | Step1 vision: extract ingredients (`MODEL_VISION` = MiniCPM-V) | 8.1 | |
| 8.3 | Step2 Ultra: allergens + hidden sources | 8.2 | DANGER/WARNING/SAFE |
| 8.4 | Sitter UI: scanner → modal with warning_message | 8.3 | 데모 가능 |
| 8.5 | `safety_checks` 저장 + owner notify if DANGER | 8.4 | |
| 8.7 | (stretch) Tavily 출처 — [tavily.ko.md](tavily.ko.md) 키워드 규칙 | 8.1–8.6 | 모달 Sources |

### AI 프롬프트 — 8.1–8.3 파이프라인

```text
Implement POST /api/ai/safety-check { pet_id, media_id } (phase-08 pipeline):
1) Load pet species + allergens from pet_allergies
2) Vision step: env MODEL_VISION (openbmb/MiniCPM-V-4_5, see notes/model-ids.md) — extract ingredient list from label photo
3) Reasoning step: nvidia/Nemotron-3-Ultra-550b-a55b — output strict JSON matching schema in docs/plan (safety_status, matched_allergens, detected_ingredients, warning_message)
4) Validate with pydantic; retry once on invalid JSON
5) Insert safety_checks row

DoD: sample label image returns JSON; DANGER when allergen match.
```

### AI 프롬프트 — 8.4 UI

```text
Sitter: TreatScannerScreen — pick image, call safety-check, show modal color by status, block dismiss on DANGER until acknowledged.
DoD: matches design stub (red modal).
```

---

## 11. Phase 9 — AI 캡션 (피드 P0 마무리)

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 9.1 | `POST /api/ai/caption` `{pet_id, media_id}` | 7.1 | 1–2 warm sentences |
| 9.2 | 피드 업로드 후 caption 자동 채우기 | 5.1, 9.1 | sitter 타이핑 0 |

### AI 프롬프트 — 9.1–9.2

```text
After media upload, call POST /api/ai/caption { pet_id, media_id } (backend loads the image as a base64 data URL, D12); set feed_post.caption before save.
Use MODEL_VISION from env. Fallback caption per phase-09 (English) if AI fails.

DoD: sitter upload only; caption appears automatically.
```

---

## 12. Phase 10 — 데모 시드 & "PawNote의 하루"

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 10.1 | `scripts/seed_demo.py` 또는 SQL seed | P0 전부 | owner/sitter/Bori(dog)/Mochi(cat) |
| 10.2 | README Getting Started 실제 명령 | 10.1 | 심사위원 재현 |
| 10.3 | 배포: Vercel(front) + Nebius AI Cloud Serverless Endpoint(backend, D18 — Render는 긴급 fallback) | 10.2 | public demo URL |
| 10.4 | 테스트 계정 Devpost용 문서 | 10.3 | |
| 10.9–10.10 | 데스크톱 옆 안내 패널 · (stretch) Split view — 번호는 [phase-10](phases/phase-10.md) 기준 | 10.3 | 마우스만으로 심사 경로 |

### AI 프롬프트 — 10.1 seed

```text
Create scripts/seed_demo.sql or Python using service role:
- Users: demo-owner@pawnote.test, demo-sitter@pawnote.test (password from env DEMO_PASSWORD — never committed; phase-10 10.1)
- Confirmed booking in progress: bookings + booking_pets + booking_slots + agreed booking_handoffs (see rls_smoke.sql _t_booking)
- Dog Bori with chicken allergy, one medication task 8am, walk 10:30
- Cat Mochi, feeding 9am, litter 12pm
- Do not seed real PII

DoD: fresh DB can demo full day flow in 15 minutes.
```

---

## 13. 병렬 작업 (민식 vs 슬기)

| 동시에 가능 | 민식 (Cursor) | 슬기 (Cursor) |
| :--- | :--- | :--- |
| Week 1 | Phase 1–5 (틀, DB, auth, feed) | Phase 0.3, 7.4 few-shot, `scripts/test_nebius.py` |
| Week 2 | Phase 6–7 UI + wiring | Phase 7.2 prompt tuning, 8.1–8.3 pipeline |
| 합류 지점 | `/api/ai/*` contract OpenAPI or README | FastAPI 라우터에 붙이기 |

**API 계약을 먼저 고정**하면 병렬이 쉽습니다. Phase 7 시작 전에 `backend/docs/openapi-ai.yaml` 또는 README 표:

| Endpoint | Body | Response |
| :--- | :--- | :--- |
| POST /api/ai/caption | `{ pet_id, media_id }` | `{ caption, source, model, latency_ms }` |
| POST /api/ai/daily-report | `{ pet_id, date, inputs }` | `{ report_id, body, status, model, latency_ms }` |
| POST /api/ai/safety-check | `{ pet_id, media_id }` | SafetyCheck JSON (phase-08) |

> 정본은 [architecture §5 엔드포인트 계약](phases/architecture.ko.md#엔드포인트-계약-전체).

---

## 14. 프롬프트 실패 줄이는 팁

1. **"이미 있는 파일만 수정"** — 새 패턴 금지 unless needed  
2. **한 화면씩** — "OwnerHome + FeedTimeline only"  
3. **스크린샷/피그마 URL** 있으면 프롬프트에 붙이기 (묵)  
4. **에러 나면** — 로그 + 기대 동작 + 실제 동작 3줄로 재프롬프트  
5. **리팩터는 P0 후** — "동작 유지, rename only" 따로 요청  

---

## 15. 마스터 Todo 체크리스트 (복사용)

### Phase 0
- [ ] 0.1 Supabase
- [ ] 0.2 Cloudinary
- [ ] 0.3 Nebius models 확인
- [ ] 0.5 .env

### Phase 1
- [ ] 1.1 monorepo
- [ ] 1.2 FastAPI health
- [ ] 1.3 Expo web
- [ ] 1.6 web shell (desktop phone frame)
- [ ] 1.7 mouse = finger + Playwright

### Phase 2
- [x] 2.1–2.6 migrations
- [x] 2.7 RLS
- [x] 2.8 functions + smoke test
- [ ] 2.9 hosted apply

### Phase 3
- [ ] 3.1–3.2 Auth + role
- [ ] 3.3 FastAPI JWT

### Phase 4
- [ ] 4.1–4.3 Cloudinary
- [ ] 4.7 pickMedia + sample tray

### Phase 5 — Feed
- [ ] 5.1 sitter post
- [ ] 5.2 owner timeline
- [ ] 5.3 notifications

### Phase 6 — Tasks
- [ ] 6.1 owner CRUD tasks
- [ ] 6.2 task_logs today
- [ ] 6.3 complete + photo
- [ ] 6.4 notify owner

### Phase 7 — Report AI
- [ ] 7.1 nebius client
- [ ] 7.2 daily-report API
- [ ] 7.3 send UI
- [ ] 7.4 few-shot (슬기)

### Phase 8 — Safety
- [ ] 8.1–8.3 pipeline
- [ ] 8.4–8.5 UI + notify
- [ ] 8.7 Tavily sources (stretch)

### Phase 9 — Caption AI
- [ ] 9.1–9.2 auto caption

### Phase 10 — Demo
- [ ] 10.1 seed
- [ ] 10.2 README run
- [ ] 10.3 deploy
- [ ] 10.4 test accounts
- [ ] 10.9 desktop side panel · 10.10 split view (stretch)

---

## 16. 지금 당장 첫 Cursor 채팅에 넣을 한 줄

```text
Start Phase 1.1 only: monorepo scaffold for PawNote per docs/plan/P0-ai-prompt-playbook.ko.md section 3 Phase 1. Use the common prompt header from section 1. Do not implement auth or database yet.
```
