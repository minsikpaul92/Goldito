# Phase 06 — 케어·투약 의뢰서 → 미션 체크리스트 · 5초 체크 · Activity 히스토리

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D8 시간대, D9 missed, D17 리마인더, **D34 5초 체크**  
> **Product spec (Plan B, locked):** [sitter-care-loop.ko.md](../sitter-care-loop.ko.md) · 제품 흐름: [full-process.ko.md](../full-process.ko.md) Stage 2-1 (의뢰서) · Stage 4-3 (5초 체크)

## Goal

키즈노트 **투약의뢰·보고** + **식사·배변·기분·에피소드**를 시터가 **탭만(사진 선택)** 으로 기록한다. 견주는 **체크 즉시 알림** + **Activity 히스토리**로 “언제 밥·산책·배변·기분이었는지” 본다. 견주가 등록한 **스케줄 task**(약·산책·feeding 등)는 자동으로 오늘 할 일이 되고, due면 **인앱 리마인더**가 뜬다.

**케어·투약 의뢰서 (Stage 2-1):** 견주는 task를 하나씩 만드는 대신 **메모처럼 의뢰서를 쓰고**("8 AM — 1 cup of kibble · 2 PM — skin pill in a treat · No knocking — text me"), AI(Super)가 이를 **시터 미션 체크리스트**(`care_tasks`) + **주의사항**(`pet_cautions` — 시터 Today·요청 카드의 **Heads-up**)으로 구조화한다. 견주가 미리보기에서 고친 뒤 저장 → 다음 예약에도 그대로 재사용.

### Goal 달성 기준

- [ ] Owner: **Care request**에 의뢰서 붙여넣기 → **Make a checklist** → 미리보기 "Feeding · 8:00 AM · 1 cup kibble", "Medication · 2:00 PM · Skin pill ×1 — in a treat", Heads-up 2개 → 1개 시각 수정 → **Save checklist** → `care_tasks` + `pet_cautions`
- [ ] Mochi(고양이) 의뢰서에 "walk at 5 PM" → 미리보기에서 "Walks are for dogs — skipped" (species 규칙, D23)
- [ ] Owner: Care에서 Max 08:00 med + 10:30 walk, Mochi 12:00 litter 직접 등록도 가능 · species별 type 제한
- [ ] Sitter: Tasks에 오늘 `task_logs` 자동 생성 · due 배너(±5m~+60m)
- [ ] Sitter: task **Mark done**(사진 없음) → owner `task_done` + Activity · **Done with photo** → + feed_post(선택)
- [ ] Sitter: Today **Quick check-ins** (5초 체크) — Meal / Potty / **Walk (10·20·30·45·60 min)** / Mood / Note(1줄) → 즉시 `care_checkin` 알림 + Activity (±사진)
- [ ] Sitter: Today 상단 **Heads-up** 카드 ("Text Chloe instead of knocking", "No other dogs on walks")
- [ ] Owner: Care **Activity** — 오늘+7일 타임라인(task 완료 + check-in + 사진 있으면 썸네일)
- [ ] Care 탭: task ✅/⏳/⚠️ missed (D9)

---

## 선행 조건

- [Phase 05](phase-05.md) 알림 인프라
- [Phase 04](phase-04.md) `uploadMedia()` · `pickMedia()` (4.7)

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| `care_checkins` + `log_care_checkin` · `complete_task_log` **optional media** (`008_care.sql`) | RRULE |
| 케어·투약 의뢰서 → `POST /api/ai/care-plan` 초안 → 견주 확인 → `care_requests`·`care_tasks`·`pet_cautions` | 의뢰서 사진(손글씨) OCR, 다국어 의뢰서 |
| Owner Activity timeline · Sitter quick check-ins | missed → owner push |
| Scheduled task CRUD · ensure logs · D17 reminder | 서버 푸시 리마인더 (6.7 stretch) |
| Check-in / task done → owner notification | 완료 취소 (P1) |

---

## 작업 상세

| ID | 작업 | 상세 |
| :--- | :--- | :--- |
| 6.1 | Owner Care `/owner/tasks` | Segments: **Tasks** (등록·오늘 상태) + **Activity** (히스토리). Add task 시트 — species별 type (phase-06 구 spec), 15분 time picker (DESIGN.md §7.7) |
| 6.2 | `ensure_today_task_logs` | 기존 spec 유지 (003 헬퍼, 멱등) |
| 6.3 | Sitter Tasks | missed → pending → done · **Mark done** (primary) · **Done with photo** (secondary) · Today "Next up" |
| 6.4 | `complete_task_log(p_task_log, p_media_id uuid default null)` | `in_care_window` 검사 · done 갱신 · **`task_done` 항상** · `media_id` 있을 때만 `feed_post` + task 캡션 (`caption_source='task'`) |
| 6.5 | missed / late | D9 파생 (변경 없음) |
| 6.6 | `useDueReminder` | scheduled task만 (변경 없음) |
| 6.7 | (Stretch) 서버 `task_due` | 변경 없음 |
| 6.8 | DB `care_checkins` + RLS | [sitter-care-loop §3](../sitter-care-loop.ko.md#3-check-in-kinds-care_checkins) · idx(pet_id, created_at desc) |
| 6.9 | `log_care_checkin` RPC | on-duty 검사 · insert check-in · owner `care_checkin` notification (kind별 title) · optional `media_id` → feed_post (고정 캡션 또는 note excerpt) |
| 6.10 | Sitter Today quick row | Meal (4 chips) · Poop (3) · **Walk** (10·20·30·45·60 min — dogs only, D23) · Mood (3) · **Note** (optional 1-line sheet ≤120) · each: tap = check-in; optional photo button before submit |
| 6.11 | Owner Activity UI | `list_pet_activity(p_pet, p_from, p_to)` RPC or client merge: done task_logs + checkins (+ optional feed) · 7-day default |
| 6.12 | `POST /api/ai/care-plan` (슬기) | `routers/ai_care_plan.py`: `assert_owner_of(pet_id)` → 펫(종·이름·알레르기) + 기존 `care_tasks` + (07C 이후) 최신 Life Record `heads_up` → `MODEL_REPORT`(Super) + `prompts/care_plan/system.md` → `chat_json` `CarePlan {tasks:[{type, time "HH:MM", title, dose?, notes?}], cautions:[str], skipped:[{text, reason}]}`. 서버 검증: type ∈ species 허용 목록(D23 — 아니면 skipped로 이동), 시각 형식, 중복(같은 type·시각) 제거. **저장 안 함** (초안만). 45 s 타임아웃 → 422 `ai_timeout` + "Try again, or add tasks one by one." |
| 6.13 | Care request UI | `/owner/pets/[petId]/care-request`: 큰 텍스트 칸(placeholder = 예시 의뢰서) → **Make a checklist** → `ChecklistCard` 미리보기(행마다 시각·제목·용량 수정, 삭제) + Heads-up 칩 → **Save checklist** = Supabase insert `care_requests(id, pet_id, raw_text, generated jsonb, created_by)` + `care_tasks` 여러 행 + `pet_cautions(id, pet_id, text, source 'owner'\|'ai', active)`. 저장 후 07B RAG 인덱싱 호출 (`care_request`). 진입: Pet profile **Care request** · 예약 상세 "Add care instructions for Lucy" |
| 6.14 | Heads-up 표시 | 시터 Today 상단·요청 카드(03B)·Trip 도착 카드(06B)에 `pet_cautions` (active) — 최대 3개 + "See all". RLS: 견주 CRUD, 요청 받은 시터·담당 시터 select (pets 규칙과 같음) |

### 피드·알림 (Plan B)

- **알림:** every task complete + every check-in → owner (Realtime, Phase 05).
- **feed_post:** only when sitter attached **photo** (task or check-in). No feed-only check-in without media in P0 (Activity still shows row).

---

## Definition of Done (DoD)

1. Walk **Mark done** without photo → notification + Activity, **no** feed card
2. Meal check-in **with** sample photo → notification + Activity + feed
3. Mood check-in only → notification + Activity
4. Report Generate (Phase 07) sees check-ins in `source_snapshot` — no extra doc here
5. `ensure_today_task_logs` idempotent · timezone display (DoD 4–5 legacy)
6. Desktop mouse path: register task → mark done / check-in (D25)
7. Care request: 예시 의뢰서 3개(강아지 2·고양이 1) → 체크리스트가 의뢰서 내용과 일치(팀 합의), species 위반은 skipped, 저장 전에는 DB 변화 없음 · `pytest` 비소유자 403, species 검증

---

## 산출물

- `supabase/migrations/008_care.sql` — `care_checkins`(kind에 `walk` 포함 — value = 분), `care_requests`, `pet_cautions`, RLS, RPCs (`ensure_today_task_logs`, `complete_task_log`, `log_care_checkin`, `list_pet_activity` or view)
- `frontend/app/owner/tasks.tsx` (Activity segment), `/sitter/tasks.tsx`, `/sitter/index.tsx` (quick check-ins), `TaskRow`, `QuickCheckInBar`, `ActivityTimeline`, `useDueReminder.ts`
- `frontend/app/owner/pets/[petId]/care-request.tsx`, `ChecklistCard`, `HeadsUpCard`
- `backend/app/routers/ai_care_plan.py`, `backend/app/schemas/care_plan.py`, `backend/app/ai/prompts/care_plan/system.md`

---

## AI 프롬프트

Playbook §8 — extend with check-in RPC + Activity (see [sitter-care-loop.ko.md](../sitter-care-loop.ko.md))

---

## 다음 Phase

→ [Phase 07 — 알림장 AI](phase-07.md) ([Phase 06B — Pet Transit](phase-06b.md)은 P0 맨 마지막 — D41)
