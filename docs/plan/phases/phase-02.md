# Phase 02 — Supabase DB + RLS

## Goal

P0에 필요한 **전체 데이터 모델**을 PostgreSQL migration으로 정의하고, **owner/sitter 역할에 맞는 Row Level Security**를 적용해 프론트가 Supabase client만으로 안전하게 CRUD할 수 있는 기반을 만든다.

### Goal 달성 기준

- [ ] `001_initial_schema.sql` Supabase SQL Editor에서 오류 없이 적용
- [ ] `002_rls_policies.sql` 적용 후 **익명/타 사용자가 남의 dog 조회 불가**
- [ ] `notifications` 테이블 Realtime publication 설정 (또는 migration 주석 + 대시보드 체크리스트)

---

## 선행 조건

- [Phase 00](phase-00.md) Supabase 프로젝트
- [Phase 01](phase-01.md) `supabase/migrations/` 폴더

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| profiles, dogs, allergies, tasks, feed, reports, safety, notifications | Edge Functions (필요 시 Phase 06+) |
| 인덱스 (dog_id, user_id, created_at) | 시드 데이터 (Phase 10) |

---

## 작업 상세

| ID | 테이블/주제 | 핵심 컬럼·관계 |
| :--- | :--- | :--- |
| 2.1 | `profiles` | `id` = auth.users, `role` owner\|sitter, `display_name` |
| 2.2 | `dogs`, `dog_allergies` | owner_id, sitter_id (nullable), breed, notes |
| 2.3 | `care_tasks`, `task_logs` | type medication\|walk, schedule, status pending\|done\|missed |
| 2.4 | `media`, `feed_posts` | cloudinary_public_id, caption, media 연결 |
| 2.5 | `daily_reports`, `safety_checks` | body, status draft\|sent, result_json |
| 2.6 | `notifications` | user_id, type, ref_id, read_at |
| 2.7 | RLS policies | owner ↔ sitter 경계 |

### 스케줄 저장 방식 (결정 필요)

- **권장:** `care_tasks.scheduled_time` (TIME) + `repeat` daily (boolean) — 해커톤 데모 단순화
- `task_logs.due_at` (TIMESTAMPTZ) — 당일 인스턴스

---

## Definition of Done (DoD)

1. ERD 수준 설명이 `supabase/migrations/README.md`에 10줄 이내로 있음
2. RLS: sitter A가 sitter B의 dog에 insert 불가 (SQL 또는 앱 테스트 계획 명시)
3. FastAPI가 service role이 필요한 테이블이 있으면 `backend/README.md`에 목록

---

## 산출물

- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_rls_policies.sql`

---

## AI 프롬프트

Playbook §4 — 스키마가 크면 **001 / 002 분할** 프롬프트 2회

---

## 다음 Phase

→ [Phase 03 — 인증·역할](phase-03.md)
