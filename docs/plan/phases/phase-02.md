# Phase 02 — Supabase DB + RLS

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D5–D11, D21–D23, 쓰기 경로 §6
> **이 문서의 스키마가 정본**입니다. ([README.ko.md §9](../README.ko.md#9-데이터-모델-초안)는 초안)

## Goal

P0에 필요한 **전체 데이터 모델**을 PostgreSQL migration으로 정의하고, **owner/sitter 역할에 맞는 Row Level Security**와 **공통 헬퍼 함수**를 적용해 프론트가 Supabase client만으로 안전하게 CRUD할 수 있는 기반을 만든다. 반려동물은 **강아지와 고양이**(`pets.species`)를 모두 지원하고, 견주·시터는 **공통 프로필 + 역할별 프로필**로 나눈다.

### Goal 달성 기준

- [ ] `001`–`003` migration이 SQL Editor에서 순서대로 오류 없이 적용
- [ ] 익명/타 사용자가 남의 pet·feed·task를 조회 불가 (`supabase/tests/rls_smoke.sql`)
- [ ] `notifications` Realtime publication 등록
- [ ] 신규 가입 시 `profiles` + 역할별 프로필(`owner_profiles` 또는 `sitter_profiles`) 자동 생성 (트리거)
- [ ] 고양이에게 `walk`, 강아지에게 `litter` task 생성 시 DB가 거부

---

## 선행 조건

- [Phase 00](phase-00.md) 0.1 Supabase 프로젝트
- [Phase 01](phase-01.md) `supabase/migrations/` 폴더

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| P0 테이블 12개 + 인덱스 + RLS + 헬퍼 함수 + 가입 트리거 + `assign_sitter` + 종별 task 가드 | 기능별 RPC·알림 트리거 (각 Phase의 migration: 05→`004`, 06→`005`, 07→`006`, 08→`007`) |
| `rls_smoke.sql` | 시드 데이터 (Phase 10) · P1 테이블 (Phase 11) |
| | 강아지·고양이 외 종 (토끼 등) — `species` check만 넓히면 추후 확장 가능 |

---

## 2.1–2.6 스키마 (`001_initial_schema.sql`)

모든 테이블: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()` (예외는 명시).

### 사람 (프로필)

공통 `profiles`는 **인증·RLS·표시 이름**만 담는 얇은 테이블이고, 역할마다 필요한 정보는 1:1 테이블로 분리한다 (D21). 가입 트리거가 role에 맞는 행을 하나 같이 만든다.

| 테이블 | 컬럼 (타입 · 제약) | 인덱스 / 유니크 |
| :--- | :--- | :--- |
| **profiles** | `id uuid PK → auth.users(id) on delete cascade` · `role text not null check (role in ('owner','sitter'))` · `display_name text not null` · `created_at` · `updated_at timestamptz` | - |
| **owner_profiles** | `id uuid PK → profiles(id) on delete cascade` (owner만) · `emergency_contact_name text` · `emergency_contact_phone text` · `vet_clinic_name text` · `vet_clinic_phone text` · `notes text` · `updated_at timestamptz` | - |
| **sitter_profiles** | `id uuid PK → profiles(id) on delete cascade` (sitter만) · `bio text` · `species_served text[] not null default '{dog,cat}'` + `check (species_served <@ array['dog','cat']::text[] and cardinality(species_served) > 0)` · `service_area text` · `experience_years int check (experience_years >= 0)` · `updated_at timestamptz` | - |

- `owner_profiles` / `sitter_profiles`는 id가 곧 `profiles.id`라 **조인 키가 하나**다. role이 다른 행이 생기지 않도록 `handle_new_user()`만 insert한다 (§2.8).
- 연락처·동물병원 필드는 **P0 폼에서 선택 입력**. 시드·데모에는 가짜 값만 (실제 PII 금지, CLAUDE.md §1).

### 반려동물 · 케어

| 테이블 | 컬럼 (타입 · 제약) | 인덱스 / 유니크 |
| :--- | :--- | :--- |
| **pets** | `owner_id uuid not null → profiles` · `sitter_id uuid null → profiles on delete set null` · `species text not null check (species in ('dog','cat'))` · `name text not null` · `breed text` · `birthdate date` · `weight_kg numeric(5,2)` · `notes text` | idx(owner_id), idx(sitter_id) |
| **pet_allergies** | `pet_id → pets on delete cascade` · `allergen text not null` (EN 소문자, 예 `chicken`) · `notes text` | unique(pet_id, lower(allergen)) |
| **care_tasks** | `pet_id → pets cascade` · `type text check in ('medication','walk','feeding','litter','play')` · `title text not null` · `dose text` · `scheduled_time time not null` · `repeat_daily boolean not null default true` · `notes text` · `active boolean not null default true` · `created_by → profiles` | idx(pet_id) |
| **media** | `pet_id → pets cascade` · `uploaded_by → profiles` · `cloudinary_public_id text not null unique` · `resource_type text check in ('image','video')` · `purpose text check in ('feed','task_proof','safety_label')` · `width int` · `height int` · `duration_s numeric` | idx(pet_id, created_at desc) |
| **task_logs** | `task_id → care_tasks cascade` · `pet_id → pets cascade` (비정규화: RLS·조회용) · `due_at timestamptz not null` · `status text not null default 'pending' check in ('pending','done')` · `completed_at timestamptz` · `completed_by → profiles` · `media_id → media null` | **unique(task_id, due_at)**, idx(pet_id, due_at) |
| **feed_posts** | `pet_id → pets cascade` · `sitter_id → profiles` · `media_id → media not null` · `caption text` · `caption_source text check in ('ai','fallback','task')` · `task_log_id → task_logs null` | idx(pet_id, created_at desc) |
| **daily_reports** | `pet_id → pets cascade` · `sitter_id → profiles` · `report_date date not null` · `body text not null` · `status text not null default 'draft' check in ('draft','sent')` · `inputs jsonb not null default '{}'` (퀵탭) · `source_snapshot jsonb` (AI에 준 입력 원본 — 환각 검증용) · `model text` · `sent_at timestamptz` · `updated_at timestamptz` | **unique(pet_id, report_date)** |
| **safety_checks** | `pet_id → pets cascade` · `checked_by → profiles` · `media_id → media` · `safety_status text check in ('DANGER','WARNING','SAFE')` · `result_json jsonb not null` · `model_vision text` · `model_reasoning text` · `acknowledged_at timestamptz` | idx(pet_id, created_at desc) |
| **notifications** | `user_id → profiles cascade` · `pet_id → pets null` · `type text not null` (architecture §7) · `ref_id uuid` · `title text not null` · `body text` · `read_at timestamptz` | idx(user_id, created_at desc), partial idx(user_id) where read_at is null |

### 종별 케어 규칙 (D22)

| `care_tasks.type` | 강아지 | 고양이 | UI 라벨 (EN) |
| :--- | :---: | :---: | :--- |
| `medication` | ✅ | ✅ | Medication |
| `feeding` | ✅ | ✅ | Feeding |
| `play` | ✅ | ✅ | Play time |
| `walk` | ✅ | ✗ | Walk |
| `litter` | ✗ | ✅ | Litter box |

- 프론트는 pet의 `species`에 맞는 type만 보여준다. DB는 트리거 `guard_care_task_species`(003)로 `walk`+cat, `litter`+dog 조합을 **거부**한다 (check 제약은 다른 테이블을 못 봐서 트리거 사용).
- `missed`는 컬럼 없음 (D9): `status='pending' and now() > due_at + interval '60 minutes'`.
- `daily_reports.inputs` 형식 (모든 키 optional, 종 공통): `{"meal":"all|most|little|none","water":"normal|low","potty":"normal|soft|none","mood":"happy|calm|tired","note":"<=120 chars"}` — `potty`는 강아지 배변·고양이 화장실을 모두 뜻함.

---

## 2.7 RLS (`002_rls_policies.sql`)

모든 테이블 `enable row level security`. 헬퍼 함수(003에 정의하되 002보다 먼저 필요하면 **002 맨 위에 정의**):

```sql
-- security definer + stable + set search_path = public
is_owner_of(pet uuid)  → exists(select 1 from pets where id = pet and owner_id = auth.uid())
is_sitter_of(pet uuid) → exists(select 1 from pets where id = pet and sitter_id = auth.uid())
can_access_pet(pet uuid) → is_owner_of(pet) or is_sitter_of(pet)
-- 두 사람이 적어도 한 마리 pet으로 연결돼 있는지 (프로필 상호 조회용)
shares_pet_with(other uuid) → exists(select 1 from pets
    where (owner_id = auth.uid() and sitter_id = other)
       or (sitter_id = auth.uid() and owner_id = other))
```

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
| :--- | :--- | :--- | :--- | :--- |
| profiles | 본인 + `shares_pet_with(id)` | 트리거만 | 본인 (`display_name`만; role 변경 금지) | ✗ |
| owner_profiles | 본인 + `shares_pet_with(id)` (담당 시터가 긴급 연락처·병원 확인) | 트리거만 | 본인 | ✗ |
| sitter_profiles | 본인 + `shares_pet_with(id)` (견주가 시터 소개 확인) | 트리거만 | 본인 | ✗ |
| pets | `can_access_pet(id)` | owner (`owner_id = auth.uid()` and 내 role=owner) | owner (`is_owner_of`) — `sitter_id`는 RPC로만 | owner |
| pet_allergies | `can_access_pet` | owner | owner | owner |
| care_tasks | `can_access_pet` | owner | owner | owner |
| media | `can_access_pet` | ✗ (FastAPI service role) | ✗ | ✗ |
| task_logs | `can_access_pet` | ✗ (RPC) | ✗ (RPC) | ✗ |
| feed_posts | `can_access_pet` | sitter (`sitter_id = auth.uid()` and `is_sitter_of(pet_id)` and media의 pet_id 일치) | ✗ | sitter 본인 글 |
| daily_reports | owner: `is_owner_of and status='sent'` / sitter: `is_sitter_of` | ✗ (FastAPI) | ✗ (RPC `send_daily_report`) | ✗ |
| safety_checks | `can_access_pet` | ✗ (FastAPI) | sitter (`is_sitter_of`) — `acknowledged_at`만 | ✗ |
| notifications | `user_id = auth.uid()` | ✗ (트리거/RPC) | 본인 (`read_at`만) | 본인 |

> **"~만" 수정 규칙은 RLS가 아니라 컬럼 권한으로 강제**합니다 (RLS `with check`는 이전 값과 비교 불가):
> ```sql
> revoke update on public.pets, public.profiles, public.owner_profiles, public.sitter_profiles,
>   public.safety_checks, public.notifications from authenticated;
> grant update (name, breed, birthdate, weight_kg, notes) on public.pets to authenticated;
> grant update (display_name) on public.profiles to authenticated;
> grant update (emergency_contact_name, emergency_contact_phone, vet_clinic_name, vet_clinic_phone, notes)
>   on public.owner_profiles to authenticated;
> grant update (bio, species_served, service_area, experience_years) on public.sitter_profiles to authenticated;
> grant update (acknowledged_at) on public.safety_checks to authenticated;
> grant update (read_at) on public.notifications to authenticated;
> ```
> `pets.sitter_id`는 `assign_sitter` RPC(security definer)로만 바뀝니다. `pets.species`는 생성 후 변경 불가 (grant에서 제외 — 종이 바뀌면 기존 task가 규칙을 어기게 됨).

> "✗ (FastAPI)" 테이블은 service role로만 씀 → `backend/README.md`에 목록 (DoD 3): `media`, `daily_reports`(insert/upsert), `safety_checks`(insert), 조회용 전체.

---

## 2.8 공통 함수·트리거 (`003_functions_triggers.sql`)

| 이름 | 종류 | 동작 |
| :--- | :--- | :--- |
| `handle_new_user()` | trigger `after insert on auth.users` | `raw_user_meta_data->>'role'`(없으면 `owner`), `display_name`(없으면 email 앞부분)으로 `profiles` insert → role이 owner면 `owner_profiles(id)`, sitter면 `sitter_profiles(id)` 빈 행 insert (sitter의 `species_served`는 metadata에 있으면 사용, 없으면 기본값 `{dog,cat}`) |
| `guard_care_task_species()` | trigger `before insert or update of type, pet_id on care_tasks` | pet의 species를 읽어 `walk`+`cat` 또는 `litter`+`dog`이면 exception `'task_type_not_allowed_for_species'` |
| `assign_sitter(p_pet uuid, p_email text)` | RPC security definer | 호출자가 `is_owner_of(p_pet)` 아니면 exception. `auth.users`에서 email → id, profile role이 sitter 아니면 `'not_a_sitter'`. 시터의 `species_served`에 pet의 species가 없으면 `'species_not_served'`. `pets.sitter_id` 갱신, sitter `{id, display_name}` 반환. `p_email is null` → 배정 해제 |
| Realtime | DDL | `alter publication supabase_realtime add table public.notifications;` |

> 기능별 RPC(`ensure_today_task_logs`, `complete_task_log`, `send_daily_report`)와 알림 트리거는 **해당 Phase가 자기 migration에 추가**합니다.

---

## Definition of Done (DoD)

1. `supabase/README.md`에 ERD 12줄 이내 + migration 적용 순서 (`001 → 002 → 003 → …`)
2. `supabase/tests/rls_smoke.sql`로 아래 7개 확인 (주석에 기대 결과):
   - sitter A가 sitter B 담당 pet `select` → 0 rows
   - sitter A가 B의 pet에 `feed_posts` insert → RLS 에러
   - owner가 `task_logs` 직접 insert → 에러
   - owner가 draft 상태 `daily_reports` select → 0 rows
   - 담당 시터가 견주의 `owner_profiles` select → 1 row / 무관한 시터 → 0 rows
   - 고양이 pet에 `walk` care_task insert → `task_type_not_allowed_for_species`
   - `species_served = {dog}` 시터를 고양이에 `assign_sitter` → `species_not_served`
3. `backend/README.md`에 service role 사용 테이블 목록

### rls_smoke.sql 패턴

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<sitter-a-uuid>","role":"authenticated"}';
select count(*) from pets where id = '<pet-of-sitter-b>';  -- expect 0
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
