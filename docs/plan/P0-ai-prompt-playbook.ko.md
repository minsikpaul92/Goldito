# P0 개발 Todo & AI 프롬프트 플레이북

> ⚠️ **정본은 [phases/architecture.ko.md](phases/architecture.ko.md) + 각 phase 문서입니다.** 아래 프롬프트는 출발점일 뿐이며, 스키마·엔드포인트 body·파일 경로가 다르면 phase 문서를 따르세요 (예: safety-check는 multipart가 아니라 `{pet_id, media_id}`, UI·AI 출력은 영어 전용, Nebius client는 `backend/app/services/nebius.py`). 프롬프트에 해당 phase 문서의 "작업 상세" 표를 함께 붙여 넣는 것을 권장합니다.

> **목적:** P0 — [Full Process 5단계](full-process.ko.md)(문의 → 사전 미팅 → 예약 → 돌봄 & 이동 → 완료) — 까지 **AI(Cursor·Claude)에게 줄 명령**을 단계별로 정리. 세이프티 가드는 시나리오 코어 뒤 stretch (D27).
> **원칙:** 한 프롬프트 = 한 산출물. 항상 *수용 기준(DoD)* 를 붙인다.

관련 문서: [개발 계획](README.ko.md) · **[Phase별 Goal & 상세](phases/README.ko.md)** · [스키마 정본 phase-02](phases/phase-02.md) · [제품 README](../README.ko.md)

---

## 0. 어디부터? (추천 순서 한 줄)

**사람(계정·키) → DB 스키마 → 백엔드 뼈대 → 프론트 뼈대 → 인증·역할 → 예약·Meet & Greet(03B) → 견적·동의서·데모 결제(03C) → Cloudinary 업로드 → 피드·알림 → 케어 의뢰서·5초 체크(06) → 알림장(07) → 문의 AI·RAG(07B) → 캡션·앨범(09) → 완료·Life Record(07C) → Pet Transit(06B — P0 맨 마지막, D41) → (stretch) 세이프티(08) → 시드·데모·배포(10)**

AI는 **위에서 아래로** 진행할 때 실패가 적습니다. AI 기능은 **붙일 데이터(예약·피드·체크인)가 먼저** 있어야 합니다. 슬기의 AI 백엔드(7.1 → 7B → 6.12 → 7.2·7.7 → 9.1 → 7C.4 → 6B.5)는 병렬로 진행합니다 (6B.5는 마지막 — D41).

---

## 1. AI에게 줄 때 공통 프롬프트 머리말 (매번 복붙)

```text
You are working in the PawNote monorepo (Nebius x NVIDIA hackathon).
Stack: Expo (React Native Web), FastAPI (Python 3.12), Supabase (Postgres + Auth + Realtime + pgvector), Cloudinary (media), Nebius Token Factory — Nemotron for replies/reasoning/reports, MiniCPM-V for vision, Qwen3 Embedding for RAG (AI only in backend).
Product flow: docs/plan/full-process.ko.md (5 stages).

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

## 5B. Phase 3B·3C — 서비스·이동 방식 · 예약 · Meet & Greet · 견적·동의서·데모 결제 (Stage 2–3)

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 3B.0 | 탭 변경 + `004_booking_options.sql` (service_type, services, Meet & Greet, media purpose) | 03 | 탭 라벨 안 잘림 |
| 3B.1–3B.8 | 스케줄 · 단골·검색 · 요청 · 협의 · Received/Returned · 취소·재예약 | 3B.0 | [phase-03b](phases/phase-03b.md) Goal |
| 3B.9–3B.11 | Meet & Greet(첫 만남만 — 대면 장소·건너뛰기 동의, D44) · 서비스·이동 방식 UI · Google Meet 링크(D45) | 3B.3 | 제안 → 수락 → Done / 건너뛰기 거부 = 취소 / 영상 수락 → Meet 링크 |
| 3C.1–3C.7 | `quote_booking` · 동의서 · `pay_booking_demo` · 시터 집 정보 · 출입 정보 2시간 전 해제 | 3B | rls_smoke I–K |

### AI 프롬프트 — 3C SQL (견적·결제·해제)

```text
Implement supabase/migrations/005_agreements.sql per docs/plan/phases/phase-03c.md (3C.1, 3C.3–3C.5) and architecture D29–D31:
- sitter_rates, holidays (Ontario 2026–2027), quote_booking(p_sitter, p_service, p_drop_off_at, p_pick_up_at, p_pet_count) returning the breakdown JSON — no AI involved
- booking_consents + required_consents(p_booking); pay_booking_demo(p_booking) → paid_at + price_snapshot, error codes consents_missing / already_paid
- owner_home_access (owner-only RLS) + get_home_access(p_booking): paid, booked sitter, window = first owner_home handoff − 2 h … stay end; access_reveals + access_unlocked notification once
- get_handoff_details: address only after payment
- Extend supabase/tests/rls_smoke.sql with scenarios I–K

DoD: rls_smoke passes; quote for the phase-03c example = 268.13 CAD.
```

### AI 프롬프트 — 3C UI (Checkout)

```text
Build /owner/bookings/[bookingId]/checkout and /owner/home-access per phase-03c (3C.2, 3C.6):
QuoteCard (rpc quote_booking), ConsentCard list from features/agreements/templates.ts (required kinds from rpc required_consents), signer name, Pay (demo) → rpc pay_booking_demo, then booking detail shows the sitter's place + packing list.
Sitter booking detail: EntryInfoCard (locked → "Unlocks …", unlocked → Show code, hides after 10 s).
Mouse-only inside the phone frame (DESIGN.md §7.7). English copy. "Demo template — not legal advice" footer.

DoD: Pay is disabled until every required consent is signed; Playwright flow covers it.
```

### AI 프롬프트 — 3B.9·3B.11 Meet & Greet

```text
Implement Meet & Greet per docs/plan/phases/phase-03b.md 3B.9 and 3B.11 (architecture D44–D45):
- 004_booking_options.sql: meet_greet_status (not_needed / required / proposed / agreed / done / skip_requested / skipped), set by request_booking — required only when this owner and sitter have never met (no earlier booking with a finished handoff and no finished Meet & Greet); meet_greet_mode, meet_greet_at, meet_greet_place, meet_greet_link, meet_greet_event_id, proposed_by / skip_requested_by; owner_profiles.meet_spots and sitter_profiles.meet_spots (up to 3 labels each)
- RPCs: propose_meet_greet, respond_meet_greet, complete_meet_greet, request_skip_meet_greet, respond_skip_meet_greet (decline → cancel_booking with reason 'meet_greet_declined'), get_meet_greet_options; respond_booking(accept) raises meet_greet_required until the status is not_needed, done, or skipped
- FastAPI POST /api/meet-greet/video-link {booking_id}: Google Calendar events.insert with conferenceDataVersion=1 and conferenceData.createRequest (conferenceSolutionKey.type = hangoutsMeet); organizer = the PawNote Google account via a stored refresh token; attendees = both emails unless MEET_INVITE_ATTENDEES=false or the address ends in .test; idempotent; events.patch on reschedule, events.delete on cancel
- UI: MeetGreetCard + sheet (In person: both sides' spots as chips + Somewhere else + date/time; Video: date/time, then Join Google Meet opens a new tab + Add to calendar .ics); skip confirm "If Mina says no, this booking will be cancelled."; the other side sees "Continue the booking without a Meet & Greet?" with Continue / Decline

DoD: the phase-03b Goal checklist (first-time, in person, video, skip accepted, skip declined, repeat pair) passes in two browser windows; pytest mocks Google.
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

## 8. Phase 6 — 케어·투약 의뢰서 · 5초 체크 · 리마인더 (Stage 2·4)

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 6.1 | Owner: `care_tasks` CRUD (약/산책, 시간) | 3.2 | DB 반영 |
| 6.2 | `ensure_today_task_logs` RPC — 화면 진입 시 자동, 멱등 (수동 버튼 없음, phase-06 6.2) | 6.1 | sitter todo list |
| 6.3 | Sitter: due task → **Mark done** (사진은 선택 — Plan B) → task_log done | 4.3, 6.2 | 사진이 있을 때만 feed_post |
| 6.4 | 완료 시 owner notification | 6.3 | |
| 6.5 | 인앱 리마인더 배너 (phase-06) · stretch 6.7 Serverless Job | 6.2 | |

### AI 프롬프트 — 6.1–6.4

```text
Implement medication/walk tasks:
- OwnerTaskScreen: create care_task with a species-allowed type (medication, feeding, play, sleep + walk for dogs / litter for cats), title, dose optional, scheduled_time, repeat daily
- RPC ensure_today_task_logs(p_pet) in 007_care.sql, called automatically when the screen opens (idempotent) — phase-06 6.2
- SitterTasksScreen: list pending task_logs for today; primary **Mark done** (no photo), secondary **Done with photo** via pickMedia() → complete_task_log(p_task_log, p_media_id default null); a feed_post is created only when a photo is attached (Plan B — docs/plan/sitter-care-loop.ko.md)
- Notify owner on completion (task_done), with or without a photo

DoD: owner creates an 8am medication; the sitter marks it done without a photo (notification + Activity, no feed card), then completes another task with a sample photo (notification + feed card).
```

### AI 프롬프트 — 6.12–6.14 케어·투약 의뢰서 (Stage 2)

```text
Implement the care request per docs/plan/phases/phase-06.md 6.12–6.14:
- Backend (Seulgi): POST /api/ai/care-plan {pet_id, text} — assert_owner_of, MODEL_REPORT + prompts/care_plan/system.md → chat_json CarePlan; the server enforces species rules (walk = dogs, litter = cats → skipped), HH:MM times, dedupe. Draft only, nothing saved.
- Frontend: /owner/pets/[petId]/care-request — text box → Make a checklist → ChecklistCard (editable rows, Heads-up chips) → Save checklist inserts care_requests + care_tasks + pet_cautions; Heads-up cards on sitter Today and the booking request card.

DoD: the phase-06 example request becomes Feeding 8:00 + Medication 14:00 + 2 Heads-up; a cat walk is skipped.
```

---

## 8B. Phase 6B — Pet Transit (Stage 4) — 만드는 순서는 P0 맨 마지막 (D41)

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 6B.1 | `012_transit.sql` — trips (마지막 위치만), handoff_checks, home 좌표, start/update/end RPC | 03C | rls_smoke L |
| 6B.2–6B.4 | `lib/location.ts` (GPS / Simulate) · TripMap(보기 전용) · 도착 카드 | 6B.1, 05 | 두 창에서 ETA 3초 안 |
| 6B.5 | `POST /api/ai/handoff-check` (슬기) | 7.1, 04 | 샘플 4장 기대 결과 |
| 6B.6–6B.7 | `complete_handoff(p_check)` 연결 · Playwright | 6B.5 | photo verified 알림 |

### AI 프롬프트 — 6B.1–6B.4

```text
Implement Pet Transit per docs/plan/phases/phase-06b.md and architecture D32:
- supabase/migrations/012_transit.sql: trips (one last position, cleared on end), RPCs start_trip / update_trip_position (ETA = straight-line × 1.3 / 30 km/h, arrived within 150 m → trip_arrived once) / end_trip, Realtime publication, RLS = booking parties only
- frontend/lib/location.ts: one source for real GPS (expo-location / navigator.geolocation) and "Simulate the drive" (assets/demo/routes/*.json at 10×), posting every 5 s
- TripMap.web.tsx: Leaflet + OSM, dragging/scrollWheelZoom/touchZoom off, ± buttons, fit both markers, OSM attribution; native TripMap.tsx = distance + ETA card
- Trip screen for both roles + arrival cards (EntryInfoCard from 03C for the sitter, the sitter's place for the owner)

DoD: phase-06b Goal checklist in two browser windows; drag over the map scrolls the screen (1.7 tests).
```

### 슬기 전용 AI 프롬프트 — 6B.5 handoff check

```text
Implement POST /api/ai/handoff-check per phase-06b 6B.5: assert_booked_sitter(booking, 2 h before), fetch_as_data_url, MODEL_VISION + prompts/handoff_check/system.md (per check_type), chat_json → HandoffFindings; the server (not the model) decides ok / warning; timeout or model error → status "unchecked" (200). Insert handoff_checks via service role. Observations only, no medical claims. pytest with mocked model output.
```

---

## 9. Phase 7 — P0-3 알림장 (AI: Super)

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 7.1 | `backend/app/services/nebius.py` — 모델별 base_url, `chat`·`chat_json`·`embed`, 호출 지표 로그 | 0.3 | role별 hello world + TTFT·지연 중앙값 표 |
| 7.2 | `POST /api/ai/daily-report` 입력: pet_id, date | 5.x, 6.x | draft JSON |
| 7.3 | Sitter: 초안 미리보기 → Send → `daily_reports.sent` | 7.2 | Owner 읽기 |
| 7.4 | Few-shot 파일 `backend/app/ai/prompts/daily_report/` (익명화 샘플) | 슬기 | git에 샘플만 |
| 7.7 | `POST /api/ai/report-chips` — 하루 기록 칩(서버) + 사진 칩(Vision) (D38) | 7.1, 06 | 사진 2장 → 칩 2–4개, 끈 칩은 알림장에 없음 |

### AI 프롬프트 — 7.1 Nebius 클라이언트

```text
Implement backend/app/services/nebius.py per docs/plan/phases/phase-07.md 7.1 and architecture §9:
- OpenAI-compatible clients cached per base URL; model role (MODEL_FAST / MODEL_REPORT / MODEL_SAFETY / MODEL_VISION / MODEL_EMBED) -> (model id, base URL) from env
- chat(role, messages, **kw), chat_json(role, messages, schema) with the strip-<think> / first-JSON-block / one-retry rules, embed(texts) with dimensions=MODEL_EMBED_DIM
- One structured metrics log line per call: role, model, endpoint, ttft_ms, latency_ms, tokens, retried, ok (no prompt or response text)
- Unit tests mock the client or skip without NEBIUS_API_KEY

DoD: scripts/test_nebius.py calls every role 5 times (vision with one sample image) and writes the TTFT / latency median table to docs/plan/phases/notes/model-ids.md.
```

### AI 프롬프트 — 7.2–7.3 알림장 API + UI

```text
POST /api/ai/daily-report { pet_id, date, inputs, media_ids? } per docs/plan/phases/phase-07.md 7.2:
- Build source_snapshot server-side (service role): the day's tasks, feed captions, care_checkins, the chips the sitter kept from POST /api/ai/report-chips (7.7), the sitter's optional short note, and the report photo descriptions saved by 7.7 (no second vision call)
- Compose the prompt through tone.compose() (the sitter's style card + the same sitter's past reports, D35; few_shot.json only as the fallback) and call MODEL_REPORT (Super); facts only from source_snapshot
- Save daily_reports status draft
- Sitter UI: up to 2 photos → suggested chips (turn off wrong ones, fix values) → optional short note (≤ 200 chars) → Generate → review → Send (send_daily_report) posts it and notifies the owner (D38)
- Owner UI: Reports list + read-only detail

DoD: the phase-07 Goal checklist and hallucination tests pass; a chip the sitter turned off never shows up, and a report can be sent with no note.
```

### 슬기 전용 AI 프롬프트 — 7.4 Few-shot

```text
Do not change app code. Create backend/app/ai/prompts/daily_report/few_shot.json with 3 anonymized example reports (English, D1), and PROMPT.md describing rules. No PII. Placeholder names like "Bori". These 3 are the fallback when a sitter has no tone_samples yet (D35).
```

---

## 9B. Phase 7B — 문의 AI 자동 답변 + RAG (Stage 1)

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 7B.1 | `010_inquiries_rag.sql` — pgvector, inquiries, inquiry_messages, knowledge_chunks, match_knowledge | 03C | rls_smoke M |
| 7B.2 | `nebius.embed()` + `services/rag.py` (index / search) | 7.1 | 재인덱싱 중복 없음 |
| 7B.3–7B.4 | `POST /api/ai/inquiry-reply` + prompt (슬기) | 7B.1–7B.2, 3C.1 | 근거 테스트 a–k |
| 7B.5–7B.6 | Owner 문의 시트·스레드 · Sitter Inquiries + 초안 Send/Edit · 정책 편집 | 05, 7B.3 | 마우스만으로 문의 → 답 → 요청 |
| 7B.7 | latency 지표 (p50 < 10 s) | 7B.3 | model-ids.md 기록 |
| 7B.8 | 말투 레이어 `tone.compose()` + `tone_samples` (슬기, D35) | 7B.2 | 샘플 시터 2명의 초안 말투가 다르고 숫자는 서버 값 |
| 7B.9 | 시터 승인 UX(Send · Edit/Add · Regenerate) + 학습 기록 (D36 · D38) | 7B.6, 7B.8 | 수정 후 발송 → edit_ratio 기록, 견주 화면에 AI 라벨 없음 |
| 7B.10 | 자동 발송(대기 없이 바로) + 사람 속도 전달(입력 중 → 답장, 읽음은 실제 열람만) (D36–D37 — 지연 공식은 슬기) | 7B.9 | 자동 모드 약 30초 연출, 수동은 즉시 |
| 7B.11 | (선택) tool calling 문의 에이전트 (D46) — 7.1에서 동작할 때만 | 7.1, 7B.3 | 근거 테스트 a–k 그대로 통과 |

### 슬기 전용 AI 프롬프트 — 7B.2–7B.4

```text
Implement the inquiry auto-reply per docs/plan/phases/phase-07b.md and architecture §9 (grounding rules, D29, D31, D33):
- nebius.embed(texts) with MODEL_EMBED and dimensions=MODEL_EMBED_DIM (1024); services/rag.py index_source / search using rpc match_knowledge (service role)
- POST /api/ai/inquiry-reply {inquiry_id}: collect availability (get_sitter_schedule), quote_booking, pet profiles + pet_cautions, sitter public profile, rag.search top-5 → MODEL_FAST + prompts/inquiry/system.md → chat_json {reply, can_host, needs_sitter, used_sources}
- Number check: any $ amount or date in reply must exist in the grounding JSON, else regenerate once, else fixed fallback text
- Grounding JSON must never contain addresses, lockbox, buzzer, or other owners' data (unit test)
- Idempotent: return the existing AI message if one exists
- The reply is a first-person draft in the sitter's voice through tone.compose() (7B.8, D35); it stays a draft (status 'draft') until the sitter sends it, unless auto-send is on (7B.10, D36–D37)
- Index only the owner's inquiry messages, scoped to that owner AND that sitter (architecture §9) — another sitter must never retrieve them

DoD: backend/tests/test_inquiry.py cases a–k pass with a mocked model; live call p50 < 10 s logged.
```

---

## 9C. Phase 7C — 완료 · 리뷰 · Pet Life Record (Stage 5)

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 7C.1 | `011_completion.sql` — reviews, pet_life_records, 트리거 | 03B (Returned — 06B 사진 체크는 붙으면 추가) | rls_smoke N |
| 7C.2–7C.3 | 귀가 리포트 · Stay summary · 리뷰 UI | 7C.1 | 1회 제한 |
| 7C.4 | `POST /api/ai/life-record` + RAG 인덱싱 (슬기) | 7B.2, 07 | 환각 테스트 3회 |
| 7C.5–7C.6 | Life Record 화면 · 다음 예약 요청 카드 · 07B/06 연결 | 7C.4 | Jun 요청 카드에 Mina 기록 |

### 슬기 전용 AI 프롬프트 — 7C.4

```text
Implement POST /api/ai/life-record {booking_id} per phase-07c 7C.4: booking party + pick-up completed (else 409 stay_not_finished); per pet build source_snapshot from that stay (check-ins, task_logs, daily_reports, handoff_checks, sitter memos, owner inquiry questions, previous record) with no address / entry-code keys; MODEL_REPORT + prompts/life_record/system.md → chat_json LifeRecord (null when no evidence, changed_since_last); insert pet_life_records + rag.index_source('life_record', …); notify owner life_record_updated. Idempotent.
```

---

## 10. Phase 8 — 간식 세이프티 가드 (P0 stretch — 06B 뒤 시간이 남을 때, D27·D41)

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

## 11. Phase 9 — AI 캡션 + 앨범 분류 (Stage 4)

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

## 12. Phase 10 — 데모 시드 & "A Stay with PawNote"

| ID | Todo | 선행 | DoD |
| :--- | :--- | :--- | :--- |
| 10.1 | `scripts/seed_demo.py` 또는 SQL seed | P0 전부 | owner/sitter/Bori(dog)/Mochi(cat) + 시나리오 데이터(요금·정책·가상 출입 정보·좌표·지난 Life Record) |
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

- Scenario data (phase-10 10.1): Mina rates/policies/visitor parking, fictional entry info and coordinates, a paid booking whose pick-up is now + 90 min (--relative), a past completed stay with Jun + Life Records + review, RAG indexing

DoD: fresh DB can demo the 5-stage stay in 15 minutes.
```

---

## 13. 병렬 작업 (민식 vs 슬기)

| 동시에 가능 | 민식 (Cursor) | 슬기 (Cursor) |
| :--- | :--- | :--- |
| Week 1 | Phase 1–3 ✅, 03B 예약 (Meet & Greet · 3B.11 Google Meet 포함) | 7.1 Nebius client + `embed()`, 데이터 익명화, 7.4 few-shot |
| Week 2 | 03C · 04 · 05 | 07B 문의 AI + RAG 백엔드, 6.12 care-plan |
| Week 3 | 06 · 07 UI | 7.2 알림장 · 7.7 칩 제안, 9.1 캡션·분류 |
| Week 4 | 07B UI · 09 · 07C · 06B (P0 맨 마지막, D41) · (stretch 08) · 10 | 7C.4 Life Record, 6B.5 handoff-check, 프롬프트 튜닝 · (stretch) 8.1–8.3 |
| 합류 지점 | `/api/ai/*` contract OpenAPI or README | FastAPI 라우터에 붙이기 |

**API 계약을 먼저 고정**하면 병렬이 쉽습니다. Phase 7 시작 전에 `backend/docs/openapi-ai.yaml` 또는 README 표:

| Endpoint | Body | Response |
| :--- | :--- | :--- |
| POST /api/ai/inquiry-reply | `{ inquiry_id }` | `{ message_id, body, can_host, needs_sitter, quote, sources, model, latency_ms }` |
| POST /api/ai/care-plan | `{ pet_id, text }` | `{ tasks, cautions, model, latency_ms }` |
| POST /api/ai/handoff-check | `{ booking_id, kind, check_type, media_id }` | `{ check_id, status, findings, message, model, latency_ms }` |
| POST /api/ai/caption | `{ pet_id, media_id }` | `{ caption, category, source, model, latency_ms }` |
| POST /api/ai/life-record | `{ booking_id }` | `{ records, model, latency_ms }` |
| POST /api/ai/report-chips | `{ pet_id, date, media_ids? }` | `{ chips, photos, model, latency_ms }` |
| POST /api/ai/daily-report | `{ pet_id, date, inputs, chips, note?, media_ids? }` | `{ report_id, body, status, model, latency_ms }` |
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
- [x] 0.1 Supabase
- [x] 0.2 Cloudinary
- [x] 0.3 Nebius models 확인
- [x] 0.5 .env

### Phase 1
- [x] 1.1 monorepo
- [x] 1.2 FastAPI health
- [x] 1.3 Expo web
- [x] 1.6 web shell (desktop phone frame)
- [x] 1.7 mouse = finger + Playwright

### Phase 2
- [x] 2.1–2.6 migrations
- [x] 2.7 RLS
- [x] 2.8 functions + smoke test
- [x] 2.9 hosted apply

### Phase 3
- [x] 3.1–3.3 Auth + role routing
- [x] 3.4 FastAPI JWT
- [x] 3.5–3.8 pets + profiles

### Phase 3B · 3C — Stage 2–3
- [ ] 3B.0 tabs + 004 migration
- [ ] 3B.1–3B.8 schedule · booking · handoff · cancel
- [ ] 3B.9–3B.10 Meet & Greet (first-time only, spots, skip consent) · service / transport
- [ ] 3B.11 Google Meet link (Google Calendar API)
- [ ] 3C.1–3C.7 quote · consents · demo pay · timed unlock

### Phase 4
- [ ] 4.1–4.3 Cloudinary
- [ ] 4.7 pickMedia + sample tray

### Phase 5 — Feed
- [ ] 5.1 sitter post
- [ ] 5.2 owner timeline
- [ ] 5.3 notifications

### Phase 6 — Care request + checks
- [ ] 6.1 owner CRUD tasks
- [ ] 6.2 task_logs today
- [ ] 6.3 Mark done (photo optional)
- [ ] 6.4 notify owner
- [ ] 6.8–6.11 check-ins (walk minutes) + Activity
- [ ] 6.12–6.14 care request → AI checklist + Heads-up

### Phase 7 — Report AI
- [ ] 7.1 nebius client
- [ ] 7.2 daily-report API
- [ ] 7.3 send UI
- [ ] 7.4 few-shot (슬기)
- [ ] 7.7 report chips (AI suggestions)

### Phase 7B — Inquiry AI + RAG
- [ ] 7B.1 migration (pgvector)
- [ ] 7B.2 embed + rag service
- [ ] 7B.3–7B.4 inquiry-reply + prompt
- [ ] 7B.5–7B.6 owner / sitter UI
- [ ] 7B.7 latency
- [ ] 7B.8 tone layer (Seulgi)
- [ ] 7B.9 sitter approval UX + learning log
- [ ] 7B.10 auto-send + human pacing
- [ ] 7B.11 (optional) tool-calling inquiry agent

### Phase 9 — Caption AI + album
- [ ] 9.1–9.2 auto caption
- [ ] 9.5 category + Album view

### Phase 7C — Completion
- [ ] 7C.1 migration
- [ ] 7C.2–7C.3 home-safe report + review
- [ ] 7C.4 life-record (Seulgi)
- [ ] 7C.5–7C.6 Life Record UI + next booking

### Phase 6B — Pet Transit (P0 last — right after 7C, D41)
- [ ] 6B.1 trips migration (`012`)
- [ ] 6B.2–6B.4 location · map · arrival cards
- [ ] 6B.5 handoff-check (Seulgi)
- [ ] 6B.6–6B.7 handoff wiring + e2e

### Phase 8 — Safety (stretch)
- [ ] 8.1–8.3 pipeline
- [ ] 8.4–8.5 UI + notify
- [ ] 8.7 Tavily sources (stretch)

### Phase 10 — Demo
- [ ] 10.1 seed
- [ ] 10.2 README run
- [ ] 10.3 deploy
- [ ] 10.4 test accounts
- [ ] 10.9 desktop side panel · 10.10 split view (stretch)

---

## 16. 지금 당장 첫 Cursor 채팅에 넣을 한 줄

```text
Read CLAUDE.md and docs/plan/TODO.md. Work ONLY on the "Current focus" task (now 3B.0). Read docs/plan/full-process.ko.md and the linked phase doc for Goal and DoD. Use the common prompt header from section 1.
```
