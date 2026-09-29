# Phase 06 — 투약·산책 의뢰 & 완료 보고

## Goal

키즈노트 **투약의뢰서/투약보고서** 흐름을 반려견에 맞춘다: 견주가 **약·산책 일정**을 등록 → 펫시터에게 **오늘 할 일**이 보임 → **인증 사진**과 함께 완료 → **견주 알림**.

### Goal 달성 기준

- [ ] Owner: 08:00 medication + 10:30 walk `care_tasks` 생성
- [ ] Sitter: 오늘 `task_logs` pending 목록
- [ ] Complete + photo → status done + owner notification
- [ ] (데모) "PawNote의 하루" 중 08:00, 10:30 구간 재현 가능

---

## 선행 조건

- [Phase 05](phase-05.md) notifications 패턴
- [Phase 04](phase-04.md) photo upload

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| care_tasks CRUD (owner) | 복잡한 RRULE (매주 등) |
| task_logs generate today | APScheduler 자동 리마인더 (stretch 6.5) |
| complete → optional feed_post | SMS |

---

## 작업 상세

| ID | 작업 | 상세 |
| :--- | :--- | :--- |
| 6.1 | OwnerTaskScreen | medication: title, dose, time / walk: time |
| 6.2 | Generate today | 버튼 "오늘 일정 만들기" → task_logs due_at 오늘 날짜+time |
| 6.3 | SitterTasksScreen | pending first, complete CTA |
| 6.4 | Complete flow | upload photo → update task_log → notify owner |
| 6.5 | (Stretch) | due_at 5분 전 sitter notification — Serverless Jobs or APScheduler |

### 완료와 피드 연동 (권장)

- Complete 시 **자동 feed_post** (caption placeholder → Phase 09에서 AI)
- `task_log_id` FK on feed_post (optional column)

---

## Definition of Done (DoD)

1. missed 상태 표시 (due_at 지남 + pending) — UI badge
2. Owner가 완료 사진을 피드 또는 task detail에서 확인
3. sitter **메시지/타이핑 없이** complete만으로 견주 안심

---

## 산출물

- OwnerTaskScreen, SitterTasksScreen
- `POST /api/tasks/generate-today` 또는 Supabase RPC

---

## AI 프롬프트

Playbook §8

---

## 다음 Phase

→ [Phase 07 — 알림장 AI](phase-07.md) (병렬: 슬기 Nebius client)
