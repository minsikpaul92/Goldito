# Phase 02 — Supabase DB + RLS

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D5–D11, 쓰기 경로 §6
> **이 문서의 스키마가 정본**입니다. ([README.ko.md §9](../README.ko.md#9-데이터-모델-초안)는 초안)

## Goal

P0에 필요한 **전체 데이터 모델**을 PostgreSQL migration으로 정의하고, **owner/sitter 역할에 맞는 Row Level Security**와 **공통 헬퍼 함수**를 적용해 프론트가 Supabase client만으로 안전하게 CRUD할 수 있는 기반을 만든다.

### Goal 달성 기준

- [ ] `001`–`003` migration이 SQL Editor에서 순서대로 오류 없이 적용
- [ ] 익명/타 사용자가 남의 dog·feed·task를 조회 불가 (`supabase/tests/rls_smoke.sql`)
- [ ] `notifications` Realtime publication 등록
- [ ] 신규 가입 시 `profiles` 자동 생성 (트리거)

---

## 선행 조건

- [Phase 00](phase-00.md) 0.1 Supabase 프로젝트
- [Phase 01](phase-01.md) `supabase/migrations/` 폴더

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| P0 테이블 10개 + 인덱스 + RLS + 헬퍼 함수 + 가입 트리거 + `assign_sitter` | 기능별 RPC·알림 트리거 (각 Phase의 migration: 05→`004`, 06→`005`, 07→`006`, 08→`007`) |
| `rls_smoke.sql` | 시드 데이터 (Phase 10) · P1 테이블 (Phase 11) |

---

## 2.1–2.6 스키마 (`001_initial_schema.sql`)

모든 테이블: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()` (예외는 명시).

| 테이블 | 컬럼 (타입 · 제약) | 인덱스 / 유니크 |
| :--- | :--- | :--- |
| **profiles** | `id uuid PK → auth.users(id) on delete cascade` · `role text not null check (role in ('owner','sitter'))` · `display_name text not null` · `created_at` | - |
| **dogs** | `owner_id uuid not null → profiles` · `sitter_id uuid null → profiles on delete set null` · `name text not null` · `breed text` · `birthdate date` · `weight_kg numeric(5,2)` · `notes text` | idx(owner_id), idx(sitter_id) |
| **dog_allergies** | `dog_id → dogs on delete cascade` · `allergen text not null` (EN 소문자, 예 `chicken`) · `notes text` | unique(dog_id, lower(allergen)) |
| **care_tasks** | `dog_id → dogs cascade` · `type text check in ('medication','walk')` · `title text not null` · `dose text` · `scheduled_time time not null` · `repeat_daily boolean not null default true` · `notes text` · `active boolean not null default true` · `created_by → profiles` | idx(dog_id) |
| **media** | `dog_id → dogs cascade` · `uploaded_by → profiles` · `cloudinary_public_id text not null unique` · `resource_type text check in ('image','video')` · `purpose text check in ('feed','task_proof','safety_label')` · `width int` · `height int` · `duration_s numeric` | idx(dog_id, created_at desc) |
| **task_logs** | `task_id → care_tasks cascade` · `dog_id → dogs cascade` (비정규화: RLS·조회용) · `due_at timestamptz not null` · `status text not null default 'pending' check in ('pending','done')` · `completed_at timestamptz` · `completed_by → profiles` · `media_id → media null` | **unique(task_id, due_at)**, idx(dog_id, due_at) |
| **feed_posts** | `dog_id → dogs cascade` · `sitter_id → profiles` · `media_id → media not null` · `caption text` · `caption_source text check in ('ai','fallback','task')` · `task_log_id → task_logs null` | idx(dog_id, created_at desc) |
| **daily_reports** | `dog_id → dogs cascade` · `sitter_id → profiles` · `report_date date not null` · `body text not null` · `status text not null default 'draft' check in ('draft','sent')` · `inputs jsonb not null default '{}'` (퀵탭) · `source_snapshot jsonb` (AI에 준 입력 원본 — 환각 검증용) · `model text` · `sent_at timestamptz` · `updated_at timestamptz` | **unique(dog_id, report_date)** |
| **safety_checks** | `dog_id → dogs cascade` · `checked_by → profiles` · `media_id → media` · `safety_status text check in ('DANGER','WARNING','SAFE')` · `result_json jsonb not null` · `model_vision text` · `model_reasoning text` · `acknowledged_at timestamptz` | idx(dog_id, created_at desc) |
| **notifications** | `user_id → profiles cascade` · `dog_id → dogs null` · `type text not null` (architecture §7) · `ref_id uuid` · `title text not null` · `body text` · `read_at timestamptz` | idx(user_id, created_at desc), partial idx(user_id) where read_at is null |

- `missed`는 컬럼 없음 (D9): `status='pending' and now() > due_at + interval '60 minutes'`.
- `daily_reports.inputs` 형식: `{"meal":"all|most|little|none","water":"normal|low","poop":"normal|soft|none","mood":"happy|calm|tired","note":"<=120 chars"}` — 모든 키 optional.

---

## 2.7 RLS (`002_rls_policies.sql`)

모든 테이블 `enable row level security`. 헬퍼 함수(003에 정의하되 002보다 먼저 필요하면 **002 맨 위에 정의**):

```sql
-- security definer + stable + set search_path = public
is_owner_of(dog uuid)  → exists(select 1 from dogs where id = dog and owner_id = auth.uid())
is_sitter_of(dog uuid) → exists(select 1 from dogs where id = dog and sitter_id = auth.uid())
can_access_dog(dog uuid) → is_owner_of(dog) or is_sitter_of(dog)
```

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
| :--- | :--- | :--- | :--- | :--- |
| profiles | 본인 + 내 dog의 상대방(owner↔sitter) | 트리거만 | 본인 (`display_name`만; role 변경은 check로 금지) | ✗ |
| dogs | `can_access_dog(id)` | owner (`owner_id = auth.uid()` and 내 role=owner) | owner (`is_owner_of`) — `sitter_id`는 RPC로만 (update 정책 `with check`에서 sitter_id 변경 불가) | owner |
| dog_allergies | `can_access_dog` | owner | owner | owner |
| care_tasks | `can_access_dog` | owner | owner | owner |
| media | `can_access_dog` | ✗ (FastAPI service role) | ✗ | ✗ |
| task_logs | `can_access_dog` | ✗ (RPC) | ✗ (RPC) | ✗ |
| feed_posts | `can_access_dog` | sitter (`sitter_id = auth.uid()` and `is_sitter_of(dog_id)` and media의 dog_id 일치) | ✗ | sitter 본인 글 |
| daily_reports | owner: `is_owner_of and status='sent'` / sitter: `is_sitter_of` | ✗ (FastAPI) | ✗ (RPC `send_daily_report`) | ✗ |
| safety_checks | `can_access_dog` | ✗ (FastAPI) | sitter (`is_sitter_of`) — `acknowledged_at`만 | ✗ |
| notifications | `user_id = auth.uid()` | ✗ (트리거/RPC) | 본인 (`read_at`만) | 본인 |

> **"~만" 수정 규칙은 RLS가 아니라 컬럼 권한으로 강제**합니다 (RLS `with check`는 이전 값과 비교 불가):
> ```sql
> revoke update on public.dogs, public.profiles, public.safety_checks, public.notifications from authenticated;
> grant update (name, breed, birthdate, weight_kg, notes) on public.dogs to authenticated;
> grant update (display_name) on public.profiles to authenticated;
> grant update (acknowledged_at) on public.safety_checks to authenticated;
> grant update (read_at) on public.notifications to authenticated;
> ```
> `dogs.sitter_id`는 `assign_sitter` RPC(security definer)로만 바뀝니다.

> "✗ (FastAPI)" 테이블은 service role로만 씀 → `backend/README.md`에 목록 (DoD 3): `media`, `daily_reports`(insert/upsert), `safety_checks`(insert), 조회용 전체.

---

## 2.8 공통 함수·트리거 (`003_functions_triggers.sql`)

| 이름 | 종류 | 동작 |
| :--- | :--- | :--- |
| `handle_new_user()` | trigger `after insert on auth.users` | `raw_user_meta_data->>'role'`(없으면 `owner`), `display_name`(없으면 email 앞부분)으로 `profiles` insert |
| `assign_sitter(p_dog uuid, p_email text)` | RPC security definer | 호출자가 `is_owner_of(p_dog)` 아니면 exception. `auth.users`에서 email → id, 그 profile role이 sitter 아니면 exception `'not_a_sitter'`. `dogs.sitter_id` 갱신, sitter `{id, display_name}` 반환. `p_email is null` → 배정 해제 |
| Realtime | DDL | `alter publication supabase_realtime add table public.notifications;` |

> 기능별 RPC(`ensure_today_task_logs`, `complete_task_log`, `send_daily_report`)와 알림 트리거는 **해당 Phase가 자기 migration에 추가**합니다.

---

## Definition of Done (DoD)

1. `supabase/README.md`에 ERD 10줄 이내 + migration 적용 순서 (`001 → 002 → 003 → …`)
2. `supabase/tests/rls_smoke.sql`로 아래 4개 확인 (주석에 기대 결과):
   - sitter A가 sitter B 담당 dog `select` → 0 rows
   - sitter A가 B의 dog에 `feed_posts` insert → RLS 에러
   - owner가 `task_logs` 직접 insert → 에러
   - owner가 draft 상태 `daily_reports` select → 0 rows
3. `backend/README.md`에 service role 사용 테이블 목록

### rls_smoke.sql 패턴

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<sitter-a-uuid>","role":"authenticated"}';
select count(*) from dogs where id = '<dog-of-sitter-b>';  -- expect 0
rollback;
```

---

## 산출물

- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_rls_policies.sql`
- `supabase/migrations/003_functions_triggers.sql`
- `supabase/tests/rls_smoke.sql`, `supabase/README.md`

---

## AI 프롬프트

Playbook §4 — **001 / 002 / 003 각각 별도 프롬프트**, 이 문서의 표를 그대로 붙여 넣기

---

## 다음 Phase

→ [Phase 03 — 인증·역할](phase-03.md)
