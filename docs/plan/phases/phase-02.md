# Phase 02 — Supabase DB + RLS

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D5–D11, D21–D24, 쓰기 경로 §6
> **이 문서의 스키마가 정본**입니다. ([README.ko.md §9](../README.ko.md#9-데이터-모델-초안)는 초안)

## Goal

P0에 필요한 **전체 데이터 모델**을 PostgreSQL migration으로 정의하고, **owner/sitter 역할에 맞는 Row Level Security**와 **공통 헬퍼 함수**를 적용해 프론트가 Supabase client만으로 안전하게 CRUD할 수 있는 기반을 만든다.

- 반려동물은 **강아지와 고양이**(`pets.species`)를 모두 지원한다.
- 견주·시터는 **공통 프로필 + 역할별 프로필**로 나눈다.
- 시터 배정은 고정이 아니라 **기간 예약**이다. 시터가 근무 가능일을 열어두면 견주가 여행 기간으로 검색해 예약을 요청하고, 시터가 수락하면 **그 기간 동안만** 담당이 된다 (D24).

### Goal 달성 기준

- [ ] `001`–`003` migration이 SQL Editor에서 순서대로 오류 없이 적용
- [ ] 예약이 없는 시터는 남의 pet·feed·task를 조회 불가, 확정 예약 기간이 아니면 게시·완료 불가 (`supabase/tests/rls_smoke.sql`)
- [ ] 같은 시터의 확정 예약 기간이 겹치면 DB가 거부
- [ ] 시터가 확정 예약 기간 중 하루를 막으면 그 예약이 `conflict`가 되고 견주에게 알림
- [ ] `notifications` Realtime publication 등록
- [ ] 신규 가입 시 `profiles` + 역할별 프로필 자동 생성 (트리거)
- [ ] 고양이에게 `walk`, 강아지에게 `litter` task 생성 시 DB가 거부

---

## 선행 조건

- [Phase 00](phase-00.md) 0.1 Supabase 프로젝트
- [Phase 01](phase-01.md) `supabase/migrations/` 폴더

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| P0 테이블 15개 + 인덱스 + RLS + 헬퍼 함수 + 가입 트리거 + 종별 task 가드 + 예약 RPC(검색·요청·응답·취소) + 충돌 감지 트리거 | 기능별 RPC·알림 트리거 (각 Phase의 migration: 05→`004`, 06→`005`, 07→`006`, 08→`007`) |
| `rls_smoke.sql` | 시드 데이터 (Phase 10) · P1 테이블/RPC (Phase 11: 원탭 시터 교체·날짜 변경, 일부 구간 검색) |
| | 강아지·고양이 외 종, 시터가 같은 날 여러 예약 동시 수용 (P0는 시터당 동시 예약 1건) |

---

## 2.1–2.6 스키마 (`001_initial_schema.sql`)

맨 위: `create extension if not exists btree_gist;` (예약 기간 겹침 제약에 필요).

모든 테이블: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()` (예외는 명시).

**날짜 구간 규칙:** 모든 기간은 `daterange`, **하한 포함·상한 미포함** `[start, end)`. 하루는 `[2026-10-05, 2026-10-06)`. UI는 "Oct 5 – Oct 12"처럼 종료일을 포함해서 보여주고 저장할 때 +1일. 공통 check: `not isempty(period) and not lower_inf(period) and not upper_inf(period)`.

### 사람 (프로필)

공통 `profiles`는 **인증·RLS·표시 이름**만 담는 얇은 테이블이고, 역할마다 필요한 정보는 1:1 테이블로 분리한다 (D21). 가입 트리거가 role에 맞는 행을 하나 같이 만든다.

| 테이블 | 컬럼 (타입 · 제약) | 인덱스 / 유니크 |
| :--- | :--- | :--- |
| **profiles** | `id uuid PK → auth.users(id) on delete cascade` · `role text not null check (role in ('owner','sitter'))` · `display_name text not null` · `created_at` · `updated_at timestamptz` | idx(role) |
| **owner_profiles** | `id uuid PK → profiles(id) on delete cascade` (owner만) · `emergency_contact_name text` · `emergency_contact_phone text` · `vet_clinic_name text` · `vet_clinic_phone text` · `notes text` · `updated_at timestamptz` | - |
| **sitter_profiles** | `id uuid PK → profiles(id) on delete cascade` (sitter만) · `bio text` · `service_area text` · `experience_years int check (experience_years >= 0)` · `updated_at timestamptz` | - |

- 시터는 강아지·고양이를 모두 돌본다고 가정 — 종 제한 컬럼 없음.
- 연락처·동물병원 필드는 **P0 폼에서 선택 입력**. 시드·데모에는 가짜 값만 (실제 PII 금지, CLAUDE.md §1).

### 시터 근무일 · 예약 (D24)

| 테이블 | 컬럼 (타입 · 제약) | 인덱스 / 유니크 |
| :--- | :--- | :--- |
| **sitter_availability** | `sitter_id → profiles on delete cascade` · `kind text not null check (kind in ('open','blocked'))` · `period daterange not null` (공통 check) · `note text` | gist(sitter_id, period) |
| **bookings** | `owner_id → profiles` · `sitter_id → profiles` · `period daterange not null` (공통 check) · `status text not null default 'requested' check (status in ('requested','confirmed','declined','cancelled','conflict'))` · `owner_note text` · `sitter_note text` · `responded_at timestamptz` · `cancelled_by → profiles null` · `updated_at timestamptz` | gist(sitter_id, period), idx(owner_id) · **`exclude using gist (sitter_id with =, period with &&) where (status in ('confirmed','conflict'))`** |
| **booking_pets** | `booking_id → bookings on delete cascade` · `pet_id → pets on delete cascade` · PK(booking_id, pet_id) · `id`/`created_at` 없음 (예외) | idx(pet_id) |

**시터가 특정 날에 예약 가능한가** (`sitter_is_available`, §2.8)는 저장하지 않고 계산한다:

1. 그 날이 `open` 구간 중 하나에 들어가고 (여러 open 구간은 합쳐서 봄)
2. 어떤 `blocked` 구간에도 들어가지 않고
3. 그 시터의 `confirmed`/`conflict` 예약과 겹치지 않을 것

→ **"예약이 차면 자동으로 예약 불가"**는 3번 조건 + exclusion 제약이 담당한다. 시터가 따로 막을 필요 없음.

**예약 상태 전이**

```
requested ──(시터 수락)──> confirmed ──(시터가 기간 중 blocked 추가)──> conflict
    │                         │                                        │
    └─(시터 거절)─> declined   └─(견주/시터 취소)─> cancelled <──(취소)───┘
```

- `completed`는 저장하지 않고 파생: `status='confirmed' and upper(period) <= app_today()`.
- `conflict`인 동안에도 기존 시터가 계속 담당 (갑자기 공백이 생기지 않게). 견주가 해결: **P0** = 취소 후 다른 시터에게 새 요청 / **P1** = 원탭 시터 교체·날짜 변경 (Phase 11).
- **한 예약 = 시터 한 명** (D24). 한 예약에 pet 여러 마리 가능 (Bori + Mochi).

### 반려동물 · 케어

| 테이블 | 컬럼 (타입 · 제약) | 인덱스 / 유니크 |
| :--- | :--- | :--- |
| **pets** | `owner_id uuid not null → profiles` · `species text not null check (species in ('dog','cat'))` · `name text not null` · `breed text` · `birthdate date` · `weight_kg numeric(5,2)` · `notes text` | idx(owner_id) |
| **pet_allergies** | `pet_id → pets on delete cascade` · `allergen text not null` (EN 소문자, 예 `chicken`) · `notes text` | unique(pet_id, lower(allergen)) |
| **care_tasks** | `pet_id → pets cascade` · `type text check in ('medication','walk','feeding','litter','play')` · `title text not null` · `dose text` · `scheduled_time time not null` · `repeat_daily boolean not null default true` · `notes text` · `active boolean not null default true` · `created_by → profiles` | idx(pet_id) |
| **media** | `pet_id → pets cascade` · `uploaded_by → profiles` · `cloudinary_public_id text not null unique` · `resource_type text check in ('image','video')` · `purpose text check in ('feed','task_proof','safety_label')` · `width int` · `height int` · `duration_s numeric` | idx(pet_id, created_at desc) |
| **task_logs** | `task_id → care_tasks cascade` · `pet_id → pets cascade` (비정규화: RLS·조회용) · `due_at timestamptz not null` · `status text not null default 'pending' check in ('pending','done')` · `completed_at timestamptz` · `completed_by → profiles` · `media_id → media null` | **unique(task_id, due_at)**, idx(pet_id, due_at) |
| **feed_posts** | `pet_id → pets cascade` · `sitter_id → profiles` (게시한 시터) · `media_id → media not null` · `caption text` · `caption_source text check in ('ai','fallback','task')` · `task_log_id → task_logs null` | idx(pet_id, created_at desc) |
| **daily_reports** | `pet_id → pets cascade` · `sitter_id → profiles` (작성한 시터) · `report_date date not null` · `body text not null` · `status text not null default 'draft' check in ('draft','sent')` · `inputs jsonb not null default '{}'` (퀵탭) · `source_snapshot jsonb` (AI에 준 입력 원본 — 환각 검증용) · `model text` · `sent_at timestamptz` · `updated_at timestamptz` | **unique(pet_id, report_date)** |
| **safety_checks** | `pet_id → pets cascade` · `checked_by → profiles` · `media_id → media` · `safety_status text check in ('DANGER','WARNING','SAFE')` · `result_json jsonb not null` · `model_vision text` · `model_reasoning text` · `acknowledged_at timestamptz` | idx(pet_id, created_at desc) |
| **notifications** | `user_id → profiles cascade` · `pet_id → pets null` · `booking_id → bookings null` · `type text not null` (architecture §7) · `ref_id uuid` · `title text not null` · `body text` · `read_at timestamptz` | idx(user_id, created_at desc), partial idx(user_id) where read_at is null |

### 종별 케어 규칙 (D23)

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
app_today() → (now() at time zone 'America/Toronto')::date   -- APP_TIMEZONE(D8)과 반드시 일치

is_owner_of(pet uuid) → exists(select 1 from pets where id = pet and owner_id = auth.uid())

-- 조회용: 확정 예약이 진행 중이거나 앞으로 있음 (준비를 위해 시작 전에도 볼 수 있음)
is_sitter_of(pet uuid) → exists(select 1 from bookings b join booking_pets bp on bp.booking_id = b.id
    where bp.pet_id = pet and b.sitter_id = auth.uid()
      and b.status in ('confirmed','conflict') and upper(b.period) > app_today())

-- 작업용: 오늘이 확정 예약 기간 안 (게시·할 일 완료·알림장·세이프티·업로드 서명)
is_on_duty_for(pet uuid) → 위와 같되 b.period @> app_today()

can_access_pet(pet uuid) → is_owner_of(pet) or is_sitter_of(pet)

-- 프로필 상호 조회
has_booking_with(other uuid) → exists(select 1 from bookings
    where status in ('requested','confirmed','conflict')
      and ((owner_id = auth.uid() and sitter_id = other) or (sitter_id = auth.uid() and owner_id = other)))
has_confirmed_booking_with(other uuid) → 위와 같되 status in ('confirmed','conflict')
```

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
| :--- | :--- | :--- | :--- | :--- |
| profiles | 본인 + `role='sitter'`인 행 (검색 목록) + `has_booking_with(id)` | 트리거만 | 본인 (`display_name`만) | ✗ |
| owner_profiles | 본인 + `has_confirmed_booking_with(id)` (확정된 시터만 긴급 연락처 확인 — 요청 단계에선 비공개) | 트리거만 | 본인 | ✗ |
| sitter_profiles | 로그인 사용자 전체 (검색 목록에 소개 표시) | 트리거만 | 본인 | ✗ |
| sitter_availability | 본인 (견주는 검색 RPC로만) | 본인 (role=sitter) | 본인 | 본인 |
| bookings | `owner_id = auth.uid() or sitter_id = auth.uid()` | ✗ (RPC) | ✗ (RPC) | ✗ |
| booking_pets | 해당 booking을 볼 수 있으면 | ✗ (RPC) | ✗ | ✗ |
| pets | `can_access_pet(id)` | owner (`owner_id = auth.uid()` and 내 role=owner) | owner (`is_owner_of`) | owner |
| pet_allergies | `can_access_pet` | owner | owner | owner |
| care_tasks | `can_access_pet` | owner | owner | owner |
| media | `can_access_pet` | ✗ (FastAPI service role — `is_on_duty_for` 확인 후) | ✗ | ✗ |
| task_logs | `can_access_pet` | ✗ (RPC) | ✗ (RPC — `is_on_duty_for`) | ✗ |
| feed_posts | `can_access_pet` | sitter (`sitter_id = auth.uid()` and `is_on_duty_for(pet_id)` and media의 pet_id 일치) | ✗ | sitter 본인 글 |
| daily_reports | owner: `is_owner_of and status='sent'` / sitter: `sitter_id = auth.uid()` | ✗ (FastAPI) | ✗ (RPC `send_daily_report`) | ✗ |
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
> grant update (bio, service_area, experience_years) on public.sitter_profiles to authenticated;
> grant update (acknowledged_at) on public.safety_checks to authenticated;
> grant update (read_at) on public.notifications to authenticated;
> ```
> `pets.species`는 생성 후 변경 불가 (grant에서 제외 — 종이 바뀌면 기존 task가 규칙을 어기게 됨). 예약 상태는 RPC(security definer)로만 바뀝니다.

> "✗ (FastAPI)" 테이블은 service role로만 씀 → `backend/README.md`에 목록 (DoD 3): `media`, `daily_reports`(insert/upsert), `safety_checks`(insert), 조회용 전체. service role은 RLS를 우회하므로 FastAPI `services/authz.py`가 `assert_on_duty_for(pet_id)`를 먼저 호출.

---

## 2.8 공통 함수·트리거 (`003_functions_triggers.sql`)

### 가입 · 케어

| 이름 | 종류 | 동작 |
| :--- | :--- | :--- |
| `handle_new_user()` | trigger `after insert on auth.users` | `raw_user_meta_data->>'role'`(없으면 `owner`), `display_name`(없으면 email 앞부분)으로 `profiles` insert → role이 owner면 `owner_profiles(id)`, sitter면 `sitter_profiles(id)` 빈 행 insert |
| `guard_care_task_species()` | trigger `before insert or update of type, pet_id on care_tasks` | pet의 species를 읽어 `walk`+`cat` 또는 `litter`+`dog`이면 exception `'task_type_not_allowed_for_species'` |

### 근무일 · 예약

| 이름 | 종류 | 동작 |
| :--- | :--- | :--- |
| `sitter_is_available(p_sitter uuid, p_period daterange, p_ignore_booking uuid default null)` | function stable | §2.1 "예약 가능" 3조건을 기간의 **모든 날**에 대해 확인 (`generate_series`로 날짜 펼침). `p_ignore_booking`은 재확인 시 자기 자신 제외용 |
| `search_available_sitters(p_start date, p_end date)` | RPC security definer | 호출자 role=owner. `[p_start, p_end + 1)` 전체가 가능한 시터만 반환: `{sitter_id, display_name, bio, service_area, experience_years}`. **일부 구간만 가능한 시터 표시는 P1** |
| `request_booking(p_sitter uuid, p_start date, p_end date, p_pets uuid[], p_note text)` | RPC security definer | 호출자가 모든 pet의 owner인지, `p_sitter`가 sitter인지, `sitter_is_available`인지 확인 → 실패 시 `'not_owner'` / `'not_a_sitter'` / `'sitter_unavailable'`. bookings(requested) + booking_pets insert. 시터에게 `booking_requested` 알림. booking id 반환 |
| `respond_booking(p_booking uuid, p_accept boolean, p_note text)` | RPC security definer | 호출자 = 해당 시터, status=`requested`. 수락: `sitter_is_available` 재확인 (그 사이 다른 예약이 확정됐을 수 있음) → `confirmed` + 견주에게 `booking_confirmed`. 거절: `declined` + `booking_declined` |
| `cancel_booking(p_booking uuid, p_reason text)` | RPC security definer | 호출자 = 견주 또는 시터, status in (`requested`,`confirmed`,`conflict`) → `cancelled`, `cancelled_by` 기록, 상대방에게 `booking_cancelled` |
| `guard_booking_pets()` | trigger `before insert on booking_pets` | pet의 owner = booking의 owner인지. 같은 pet이 겹치는 기간의 다른 `requested`/`confirmed`/`conflict` 예약에 있으면 `'pet_already_booked'` (한 번에 한 시터에게만 요청) |
| `flag_booking_conflicts()` | trigger `after insert or update on sitter_availability` (kind=`blocked`) | 그 시터의 `confirmed` 예약 중 새 blocked 구간과 겹치는 것 → `conflict` + 견주에게 `booking_conflict` 알림 ("{sitter} can't cover Oct 8 — find another sitter or change dates") |
| `guard_open_window_shrink()` | trigger `before update or delete on sitter_availability` (kind=`open`) | 줄이거나 지우려는 open 구간 안에 확정 예약 날짜가 있으면 `'window_has_bookings'` — 시터는 대신 해당 날을 **blocked로 추가**해야 함 (그래야 견주에게 충돌 알림이 감) |

### 기타

| 이름 | 종류 | 동작 |
| :--- | :--- | :--- |
| Realtime | DDL | `alter publication supabase_realtime add table public.notifications;` |

> 기능별 RPC(`ensure_today_task_logs`, `complete_task_log`, `send_daily_report`)와 알림 트리거는 **해당 Phase가 자기 migration에 추가**합니다. 예약 화면은 [Phase 03B](phase-03b.md).

---

## Definition of Done (DoD)

1. `supabase/README.md`에 ERD 15줄 이내 + migration 적용 순서 (`001 → 002 → 003 → …`)
2. `supabase/tests/rls_smoke.sql`로 아래 확인 (주석에 기대 결과):
   - **권한**
     - 예약 없는 시터가 pet `select` → 0 rows
     - 다음 주 확정 예약이 있는 시터: pet `select` → 1 row, `feed_posts` insert → RLS 에러 (아직 기간 아님)
     - 오늘이 기간 안인 시터: `feed_posts` insert → 성공 / 다른 시터 → 에러
     - owner가 `task_logs` 직접 insert → 에러
     - owner가 draft `daily_reports` select → 0 rows
     - `requested` 단계 시터가 `owner_profiles` select → 0 rows / `confirmed` 시터 → 1 row
   - **예약**
     - 시터가 열지 않은 날짜로 `request_booking` → `sitter_unavailable`
     - 같은 시터에 겹치는 두 요청을 모두 수락 → 두 번째가 `sitter_unavailable` (또는 exclusion 에러)
     - 같은 pet으로 겹치는 두 번째 요청 → `pet_already_booked`
     - 확정 예약 기간 중 하루를 시터가 blocked 추가 → 예약 `conflict` + 견주 `booking_conflict` 알림 1건
     - 확정 예약이 있는 open 구간 delete → `window_has_bookings`
   - **케어**
     - 고양이 pet에 `walk` care_task insert → `task_type_not_allowed_for_species`
3. `backend/README.md`에 service role 사용 테이블 목록

### rls_smoke.sql 패턴

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<sitter-a-uuid>","role":"authenticated"}';
select count(*) from pets where id = '<pet-without-booking-for-a>';  -- expect 0
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

→ [Phase 03 — 인증·역할](phase-03.md) → [Phase 03B — 예약](phase-03b.md)
