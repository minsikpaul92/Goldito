# Phase 06 — 케어 체크 · 스케줄 task · Activity 히스토리

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D8 시간대, D9 missed, D17 리마인더  
> **Product spec (Plan B, locked):** [sitter-care-loop.ko.md](../sitter-care-loop.ko.md)

## Goal

키즈노트 **투약의뢰·보고** + **식사·배변·기분·에피소드**를 시터가 **탭만(사진 선택)** 으로 기록한다. 견주는 **체크 즉시 알림** + **Activity 히스토리**로 “언제 밥·산책·배변·기분이었는지” 본다. 견주가 등록한 **스케줄 task**(약·산책·feeding 등)는 자동으로 오늘 할 일이 되고, due면 **인앱 리마인더**가 뜬다.

### Goal 달성 기준

- [ ] Owner: Care에서 Bori 08:00 med + 10:30 walk, Mochi 12:00 litter 등록 · species별 type 제한
- [ ] Sitter: Tasks에 오늘 `task_logs` 자동 생성 · due 배너(±5m~+60m)
- [ ] Sitter: task **Mark done**(사진 없음) → owner `task_done` + Activity · **Done with photo** → + feed_post(선택)
- [ ] Sitter: Today **Quick check-ins** — Meal / Potty / Mood / Note → 즉시 `care_checkin` 알림 + Activity (±사진)
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
| `care_checkins` + `log_care_checkin` · `complete_task_log` **optional media** (`005_tasks.sql`) | RRULE |
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
| 6.10 | Sitter Today quick row | Meal (4 chips) · Poop (3) · Mood (3) · **Note** (1-line sheet ≤120) · each: tap = check-in; optional photo button before submit |
| 6.11 | Owner Activity UI | `list_pet_activity(p_pet, p_from, p_to)` RPC or client merge: done task_logs + checkins (+ optional feed) · 7-day default |

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

---

## 산출물

- `supabase/migrations/005_tasks.sql` — table, RLS, RPCs (`ensure_today_task_logs`, `complete_task_log`, `log_care_checkin`, `list_pet_activity` or view)
- `frontend/app/owner/tasks.tsx` (Activity segment), `/sitter/tasks.tsx`, `/sitter/index.tsx` (quick check-ins), `TaskRow`, `QuickCheckInBar`, `ActivityTimeline`, `useDueReminder.ts`

---

## AI 프롬프트

Playbook §8 — extend with check-in RPC + Activity (see [sitter-care-loop.ko.md](../sitter-care-loop.ko.md))

---

## 다음 Phase

→ [Phase 07 — 알림장 AI](phase-07.md)
