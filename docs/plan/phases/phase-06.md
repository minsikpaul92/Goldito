# Phase 06 — 케어·투약 의뢰서 → 미션 체크리스트 · 5초 체크 · Activity 히스토리

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D8 시간대, D9 missed, D17 리마인더, **D34 5초 체크**  
> **Product spec (Plan B, locked):** [sitter-care-loop.ko.md](../sitter-care-loop.ko.md) · 제품 흐름: [full-process.ko.md](../full-process.ko.md) Stage 2-1 (의뢰서) · Stage 4-3 (5초 체크)

## Goal

키즈노트 **투약의뢰·보고** + **식사·배변·기분·에피소드**를 시터가 **탭만(사진 선택)** 으로 기록한다. 견주는 **체크 즉시 알림** + **Diary / Activity 히스토리**(D47 — 구 Care Activity)로 본다. 견주 **Care request**는 **Home → 펫 디테일**(구 Care 탭 없음).

**케어·투약 의뢰서 (Stage 2-1):** … AI가 **시터 미션 체크리스트** + **주의사항**(`pet_cautions` — 시터 **Home**·요청 카드 **Heads-up**)으로 구조화한다.

### Goal 달성 기준

- [ ] Owner: **Care request**(펫 디테일)에 의뢰서 → Make a checklist → Save → `care_tasks` + `pet_cautions`
- [ ] Mochi 의뢰서 "walk at 5 PM" → skipped (D23)
- [ ] Owner: 펫 디테일/의뢰서에서 Max med·walk, Mochi litter 등록 가능
- [ ] Sitter: **Home / Diary**에 오늘 `task_logs` · due 배너 (구 Tasks 탭 흡수, D47b)
- [ ] Sitter: Mark done / Done with photo → owner 알림 + Diary · 사진 있으면 Feed
- [ ] Sitter: **Home** Quick check-ins (5초) → `care_checkin` + Diary (±사진 → Feed)
- [ ] Sitter: Home 상단 **Heads-up**
- [ ] Owner: **Diary** 타임라인(오늘+7일: task + check-in + 썸네일) — 구 Care Activity
- [ ] Task 상태 ✅/⏳/⚠️ missed (D9) — Diary / Home
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
| 6.1 ✅ | Owner care tasks UI | **펫 디테일 / Care request**에서 등록·오늘 상태 (구 `/owner/tasks` Care 탭 — D47). Activity 히스토리는 **Diary** |
| 6.2 ✅ | `ensure_today_task_logs` | 기존 spec 유지 (003 헬퍼, 멱등) |
| 6.3 ✅ | Sitter tasks on Home/Diary | missed → pending → done · **Mark done** · **Done with photo** · Home "Next up" (구 `/sitter/tasks` 탭 제거, D47b) |
| 6.4 ✅ | `complete_task_log(p_task_log, p_media_id uuid default null)` | `in_care_window` 검사 · done 갱신 · **`task_done` 항상** · `media_id` 있을 때만 `feed_post` + task 캡션 (`caption_source='task'`) — Diary에도 행 |
| 6.5 | missed / late | D9 파생 (변경 없음) |
| 6.6 | `useDueReminder` | scheduled task만 (변경 없음) |
| 6.7 | (Stretch) 서버 `task_due` | 변경 없음 |
| 6.8 ✅ | DB `care_checkins` + RLS | [sitter-care-loop §3](../sitter-care-loop.ko.md#3-check-in-kinds-care_checkins) · idx(pet_id, created_at desc) |
| 6.9 ✅ | `log_care_checkin` RPC | on-duty · insert · owner `care_checkin` · optional media → feed_post (+ Diary) |
| 6.10 ✅ | Sitter Home quick row | Meal · Poop · Walk · Mood · Note — Home 대시보드 (구 Today, D47b) |
| 6.11 ✅ | Owner Diary activity | `list_pet_activity` … → **`/owner/diary`** (구 Care Activity) |
| 6.12 | `POST /api/ai/care-plan` (슬기) | (unchanged API) |
| 6.13 | Care request UI | `/owner/pets/[petId]/care-request` … 진입: Pet profile **Care request** |
| 6.14 | Heads-up 표시 | 시터 **Home** 상단·요청 카드·Trip 도착 카드 |

### 피드·알림 (Plan B)

- **알림:** every task complete + every check-in → owner (Realtime, Phase 05).
- **feed_post:** only when sitter attached **photo** (task or check-in). No feed-only check-in without media in P0 (Activity still shows row).

---

## Definition of Done (DoD)

1. Walk **Mark done** without photo → notification + Diary, **no** feed card
2. Meal check-in **with** sample photo → notification + Diary + feed
3. Mood check-in only → notification + Diary
4. Report Generate (Phase 07) sees check-ins in `source_snapshot` — no extra doc here
5. `ensure_today_task_logs` idempotent · timezone display (DoD 4–5 legacy)
6. Desktop mouse path: register task → mark done / check-in (D25)
7. Care request: 예시 의뢰서 3개 → 체크리스트 일치, species 위반 skipped, 저장 전 DB 변화 없음 · pytest

---

## 산출물

- `supabase/migrations/008_care.sql` — …
- `frontend/app/owner/diary.tsx` (Activity), `/sitter/` Home (quick check-ins), `/sitter/diary`, `TaskRow`, `QuickCheckInBar`, `ActivityTimeline`, `useDueReminder.ts`
- `frontend/app/owner/pets/[petId]/care-request.tsx`, `ChecklistCard`, `HeadsUpCard`
- `backend/app/routers/ai_care_plan.py`, …
---

## AI 프롬프트

Playbook §8 — extend with check-in RPC + Activity (see [sitter-care-loop.ko.md](../sitter-care-loop.ko.md))

---

## 다음 Phase

→ [Phase 07 — 알림장 AI](phase-07.md) ([Phase 06B — Pet Transit](phase-06b.md)은 P0 맨 마지막 — D41)
