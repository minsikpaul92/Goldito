# Phase 02 — Supabase DB + RLS

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D5–D11, D21–D24, 쓰기 경로 §6
> **이 문서의 스키마가 정본**입니다. ([README.ko.md §9](../README.ko.md#9-데이터-모델-초안)는 초안)

## Goal

P0에 필요한 **전체 데이터 모델**을 PostgreSQL migration으로 정의하고, **owner/sitter 역할에 맞는 Row Level Security**와 **공통 헬퍼 함수**를 적용해 프론트가 Supabase client만으로 안전하게 CRUD할 수 있는 기반을 만든다.

- 반려동물은 **강아지와 고양이**(`pets.species`)를 모두 지원한다.
- 견주·시터는 **공통 프로필 + 역할별 프로필**로 나눈다.
- 시터는 **파트타임**이다. 일할 수 있는 날을 열고, 그날 **몇 마리까지 받을지** 정한다. 한 시터가 같은 날 여러 집의 반려동물을 맡을 수 있다.
- 견주는 여행 기간을 **여러 시터에게 나눠** 맡길 수 있다. 시터가 어느 날 안 되면 **그날만** 빠지고, 견주는 그날만 다른 시터에게 맡긴다 (D24).

### Goal 달성 기준

- [ ] `001`–`003` migration이 SQL Editor에서 순서대로 오류 없이 적용
- [ ] 예약이 없는 시터는 남의 pet·feed·task를 조회 불가, 오늘 담당이 아니면 게시·완료 불가 (`supabase/tests/rls_smoke.sql`)
- [ ] 시터의 그날 정원(`max_pets`)을 넘는 예약 수락을 DB가 거부
- [ ] 같은 반려동물이 같은 날 두 시터에게 예약되지 않음 (DB 유니크 제약)
- [ ] 시터가 확정 예약 중 하루를 막으면 **그날만** 빠지고 견주에게 알림, 나머지 날은 유지
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
| P0 테이블 15개 + 인덱스 + RLS + 헬퍼 함수 + 가입 트리거 + 종별 task 가드 + 예약 RPC(검색·요청·응답·취소) + 날짜 빠짐 트리거 | 기능별 RPC·알림 트리거 (각 Phase의 migration: 05→`004`, 06→`005`, 07→`006`, 08→`007`) |
| `rls_smoke.sql` | 시드 데이터 (Phase 10) · P1 RPC (Phase 11: 원탭 날짜 변경, 반복 근무 패턴) |
| | 시간 단위 근무 (오전만 가능 등) — P0는 **날짜 단위** |

---

## 2.1–2.6 스키마 (`001_initial_schema.sql`)

모든 테이블: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()` (예외는 명시).

**날짜 구간 규칙:** 기간은 `daterange`, **하한 포함·상한 미포함** `[start, end)`. 하루는 `[2026-10-05, 2026-10-06)`. UI는 "Oct 5 – Oct 12"처럼 종료일을 포함해서 보여주고 저장할 때 +1일. 공통 check: `not isempty(period) and not lower_inf(period) and not upper_inf(period)`.

### 사람 (프로필)

공통 `profiles`는 **인증·RLS·표시 이름**만 담는 얇은 테이블이고, 역할마다 필요한 정보는 1:1 테이블로 분리한다 (D21). 가입 트리거가 role에 맞는 행을 하나 같이 만든다.

| 테이블 | 컬럼 (타입 · 제약) | 인덱스 / 유니크 |
| :--- | :--- | :--- |
| **profiles** | `id uuid PK → auth.users(id) on delete cascade` · `role text not null check (role in ('owner','sitter'))` · `display_name text not null` · `created_at` · `updated_at timestamptz` | idx(role) |
| **owner_profiles** | `id uuid PK → profiles(id) on delete cascade` (owner만) · `emergency_contact_name text` · `emergency_contact_phone text` · `vet_clinic_name text` · `vet_clinic_phone text` · `notes text` · `updated_at timestamptz` | - |
| **sitter_profiles** | `id uuid PK → profiles(id) on delete cascade` (sitter만) · `bio text` · `service_area text` · `experience_years int check (experience_years >= 0)` · `default_max_pets int not null default 2 check (default_max_pets between 1 and 10)` (근무일을 열 때 기본 정원) · `updated_at timestamptz` | - |

- 시터는 강아지·고양이를 모두 돌본다 — 종 제한 컬럼 없음.
- 연락처·동물병원 필드는 **P0 폼에서 선택 입력**. 시드·데모에는 가짜 값만 (실제 PII 금지, CLAUDE.md §1).

### 시터 근무일 · 예약 (D24)

| 테이블 | 컬럼 (타입 · 제약) | 인덱스 / 유니크 |
| :--- | :--- | :--- |
| **sitter_availability** | `sitter_id → profiles on delete cascade` · `kind text not null check (kind in ('open','blocked'))` · `period daterange not null` (공통 check) · `max_pets int` (open이면 `not null check (max_pets between 1 and 10)`, blocked면 null — check로 강제) · `note text` | idx(sitter_id), gist(period) |
| **bookings** | `owner_id → profiles` · `sitter_id → profiles` · `period daterange not null` (요청한 전체 기간, 표시·검색용) · `status text not null default 'requested' check (status in ('requested','confirmed','declined','cancelled'))` · `owner_note text` · `sitter_note text` · `responded_at timestamptz` · `cancelled_by → profiles null` · `updated_at timestamptz` | idx(sitter_id), idx(owner_id), gist(period) |
| **booking_days** | `booking_id → bookings on delete cascade` · `pet_id → pets on delete cascade` · `day date not null` · `dropped_at timestamptz` (시터가 그날 막음) · `active boolean not null default true` · PK(booking_id, pet_id, day) · `id`/`created_at` 없음 (예외) | **unique(pet_id, day) where active** · idx(day) |

**`booking_days`가 예약의 진짜 단위다.** 한 예약은 "반려동물 × 날짜" 행들의 묶음이다. Bori + Mochi를 10/5–10/8 맡기면 2마리 × 4일 = **8행**.

- `active` = 예약이 `requested`/`confirmed`이고 그날이 빠지지 않았음 (`dropped_at is null`). 트리거 `sync_booking_days_active`가 booking 상태가 바뀔 때 함께 갱신 (partial unique index가 다른 테이블을 못 봐서 비정규화).
- **`unique(pet_id, day) where active`** → 한 반려동물은 하루에 **담당 시터 1명**. 요청 중이거나 확정된 날엔 다른 시터에게 또 요청할 수 없고, 빠진 날(`dropped`)이나 거절·취소된 예약은 자리를 비워준다.

**시터의 그날 남은 자리** (`sitter_remaining_slots`, §2.8) — 저장하지 않고 계산:

```
정원 = 그날을 포함하는 open 구간들의 max_pets 중 최댓값 (없으면 0)
       단, 그날이 blocked 구간에 들어가면 0
사용 = 그 시터의 confirmed 예약에서 그날 active인 booking_days 수 (= 맡은 반려동물 수)
남은 자리 = 정원 - 사용
```

→ **"예약이 차면 자동으로 예약 불가"** = 남은 자리가 0이 되면 검색에서 빠지고 수락도 막힌다. 요청(`requested`)은 자리를 차지하지 않고, **먼저 수락한 쪽이 자리를 가져간다** (수락 시 재확인).

**예약 상태 전이**

```
requested ──(시터 수락, 모든 날 자리 있음)──> confirmed ──(견주/시터 취소)──> cancelled
    │                                            │
    ├─(시터 거절)─> declined                      └─ 시터가 특정 날 blocked 추가
    └─(견주 취소)─> cancelled                        → 그날 booking_days만 dropped (예약은 confirmed 유지)
                                                     → 모든 날이 빠지면 cancelled
```

- 예약 전체에 대한 `conflict` 상태는 없다. 문제는 **날짜 단위**로만 생긴다.
- `completed`는 저장하지 않고 파생: `status='confirmed' and upper(period) <= app_today()`.
- **한 예약 = 시터 1명, 견주 1명.** 한 예약에 pet 여러 마리 가능. 여행을 여러 시터가 나눠 맡으면 예약이 여러 개가 된다.

### 반려동물 · 케어

| 테이블 | 컬럼 (타입 · 제약) | 인덱스 / 유니크 |
| :--- | :--- | :--- |
| **pets** | `owner_id uuid not null → profiles` · `species text not null check (species in ('dog','cat'))` · `name text not null` · `breed text` · `birthdate date` · `weight_kg numeric(5,2)` · `notes text` | idx(owner_id) |
| **pet_allergies** | `pet_id → pets on delete cascade` · `allergen text not null` (EN 소문자, 예 `chicken`) · `notes text` | unique(pet_id, lower(allergen)) |
| **care_tasks** | `pet_id → pets cascade` · `type text check in ('medication','walk','feeding','litter','play')` · `title text not null` · `dose text` · `scheduled_time time not null` · `repeat_daily boolean not null default true` · `notes text` · `active boolean not null default true` · `created_by → profiles` | idx(pet_id) |
| **media** | `pet_id → pets cascade` · `uploaded_by → profiles` · `cloudinary_public_id text not null unique` · `resource_type text check in ('image','video')` · `purpose text check in ('feed','task_proof','safety_label')` · `width int` · `height int` · `duration_s numeric` | idx(pet_id, created_at desc) |
| **task_logs** | `task_id → care_tasks cascade` · `pet_id → pets cascade` (비정규화: RLS·조회용) · `due_at timestamptz not null` · `status text not null default 'pending' check in ('pending','done')` · `completed_at timestamptz` · `completed_by → profiles` · `media_id → media null` | **unique(task_id, due_at)**, idx(pet_id, due_at) |
| **feed_posts** | `pet_id → pets cascade` · `sitter_id → profiles` (게시한 시터) · `media_id → media not null` · `caption text` · `caption_source text check in ('ai','fallback','task')` · `task_log_id → task_logs null` | idx(pet_id, created_at desc) |
| **daily_reports** | `pet_id → pets cascade` · `sitter_id → profiles` (그날 담당 시터) · `report_date date not null` · `body text not null` · `status text not null default 'draft' check in ('draft','sent')` · `inputs jsonb not null default '{}'` (퀵탭) · `source_snapshot jsonb` (AI에 준 입력 원본 — 환각 검증용) · `model text` · `sent_at timestamptz` · `updated_at timestamptz` | **unique(pet_id, report_date)** (하루 담당 1명이라 성립) |
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

-- 조회용: 이 pet을 맡는 확정 예약 날이 오늘 이후에 하나라도 있음 (시작 전 준비용 조회 허용)
is_sitter_of(pet uuid) → exists(select 1 from booking_days d join bookings b on b.id = d.booking_id
    where d.pet_id = pet and d.active and b.status = 'confirmed'
      and b.sitter_id = auth.uid() and d.day >= app_today())

-- 작업용: 오늘 이 pet의 담당 (게시·할 일 완료·알림장·세이프티·업로드 서명)
is_on_duty_for(pet uuid) → 위와 같되 d.day = app_today()

can_access_pet(pet uuid) → is_owner_of(pet) or is_sitter_of(pet)

-- 프로필 상호 조회
has_booking_with(other uuid) → exists(select 1 from bookings
    where status in ('requested','confirmed')
      and ((owner_id = auth.uid() and sitter_id = other) or (sitter_id = auth.uid() and owner_id = other)))
has_confirmed_booking_with(other uuid) → 위와 같되 status = 'confirmed'
```

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
| :--- | :--- | :--- | :--- | :--- |
| profiles | 본인 + `role='sitter'`인 행 (검색 목록) + `has_booking_with(id)` | 트리거만 | 본인 (`display_name`만) | ✗ |
| owner_profiles | 본인 + `has_confirmed_booking_with(id)` (확정된 시터만 긴급 연락처 확인 — 요청 단계에선 비공개) | 트리거만 | 본인 | ✗ |
| sitter_profiles | 로그인 사용자 전체 (검색 목록에 소개 표시) | 트리거만 | 본인 | ✗ |
| sitter_availability | 본인 (견주는 검색 RPC로만) | 본인 (role=sitter) | 본인 | 본인 |
| bookings | `owner_id = auth.uid() or sitter_id = auth.uid()` | ✗ (RPC) | ✗ (RPC) | ✗ |
| booking_days | 해당 booking을 볼 수 있으면 | ✗ (RPC) | ✗ (RPC·트리거) | ✗ |
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
> grant update (bio, service_area, experience_years, default_max_pets) on public.sitter_profiles to authenticated;
> grant update (acknowledged_at) on public.safety_checks to authenticated;
> grant update (read_at) on public.notifications to authenticated;
> ```
> `pets.species`는 생성 후 변경 불가 (grant에서 제외 — 종이 바뀌면 기존 task가 규칙을 어기게 됨). 예약 상태·`booking_days`는 RPC와 트리거(security definer)로만 바뀝니다.

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
| `sitter_remaining_slots(p_sitter uuid, p_day date)` | function stable | §2.1 "남은 자리" 계산. 음수면 0 |
| `search_available_sitters(p_start date, p_end date, p_pet_count int)` | RPC security definer | 호출자 role=owner. 시터마다 기간의 각 날짜에 대해 `sitter_remaining_slots >= p_pet_count`인지 계산 → **하루라도 가능한 시터 모두** 반환: `{sitter_id, display_name, bio, service_area, experience_years, available_days date[], total_days int}`. 정렬: 전체 가능 → 가능 일수 많은 순. 견주는 "Free for all 8 days" 또는 "Free Oct 5–8 (4 of 8 days)"로 보고 **일부 날짜만** 요청 가능 |
| `request_booking(p_sitter uuid, p_days date[], p_pets uuid[], p_note text)` | RPC security definer | 날짜 배열로 받음 (연속일 필요 없음 — 예: 주말만). 호출자가 모든 pet의 owner, `p_sitter`가 sitter, 각 날 `sitter_remaining_slots >= cardinality(p_pets)` 확인 → 실패 시 `'not_owner'` / `'not_a_sitter'` / `'sitter_unavailable'`(어느 날인지 detail에). bookings(requested, `period` = 최소~최대일) + booking_days(pet × day) insert. 유니크 위반 → `'pet_already_booked'` (그날 그 pet은 이미 다른 요청·예약에 있음). 시터에게 `booking_requested` |
| `respond_booking(p_booking uuid, p_accept boolean, p_note text)` | RPC security definer | 호출자 = 해당 시터, status=`requested`. 수락: `pg_advisory_xact_lock(hashtext(sitter_id))`로 같은 시터 동시 수락 직렬화 → 각 날 자리 재확인 (그 사이 다른 요청을 먼저 수락했을 수 있음) → 부족하면 `'sitter_unavailable'` → 충분하면 `confirmed` + 견주 `booking_confirmed`. 거절: `declined` + `booking_declined` |
| `cancel_booking(p_booking uuid, p_reason text)` | RPC security definer | 호출자 = 견주 또는 시터, status in (`requested`,`confirmed`) → `cancelled`, `cancelled_by` 기록, 상대방에게 `booking_cancelled` |
| `sync_booking_days_active()` | trigger `after update of status on bookings` | status가 `declined`/`cancelled`가 되면 그 예약의 `booking_days.active = false` (자리·유니크 해제) |
| `drop_days_on_block()` | trigger `after insert or update on sitter_availability` (kind=`blocked`) | 그 시터의 `confirmed` 예약 중 blocked 기간에 들어가는 `booking_days` → `dropped_at = now(), active = false`. 예약마다 견주에게 `booking_day_dropped` 알림 1건 ("Mina can't cover Oct 8 for Bori and Mochi — find another sitter for that day"). 예약의 모든 날이 빠지면 status `cancelled` |
| `guard_capacity_shrink()` | trigger `before update or delete on sitter_availability` (kind=`open`) | open 구간을 줄이거나 지우거나 `max_pets`를 낮춰서 **이미 확정된 마리 수보다 정원이 작아지는 날**이 생기면 `'window_has_bookings'` — 시터는 대신 그날을 **blocked로 추가**해야 함 (그래야 견주가 알림을 받고 다른 시터를 찾음) |

### 기타

| 이름 | 종류 | 동작 |
| :--- | :--- | :--- |
| Realtime | DDL | `alter publication supabase_realtime add table public.notifications;` |

> 기능별 RPC(`ensure_today_task_logs`, `complete_task_log`, `send_daily_report`)와 알림 트리거는 **해당 Phase가 자기 migration에 추가**합니다. 예약 화면은 [Phase 03B](phase-03b.md).
>
> `ensure_today_task_logs`(Phase 06)는 **그날 담당이 있는 pet**만 대상으로 해도 되고 전체 pet을 대상으로 해도 됩니다 — task_logs는 pet 기준이고, 누가 완료하는지는 `is_on_duty_for`가 막습니다.

---

## Definition of Done (DoD)

1. `supabase/README.md`에 ERD 15줄 이내 + migration 적용 순서 (`001 → 002 → 003 → …`)
2. `supabase/tests/rls_smoke.sql`로 아래 확인 (주석에 기대 결과). 시나리오 이름은 [§ 예시 시나리오](#예시-시나리오-스키마-검증용)와 같음:
   - **권한**
     - 예약 없는 시터가 pet `select` → 0 rows
     - 다음 주 확정 예약이 있는 시터: pet `select` → 1 row, `feed_posts` insert → RLS 에러 (오늘 담당 아님)
     - 오늘 담당 시터: `feed_posts` insert → 성공 / 다른 시터 → 에러
     - owner가 `task_logs` 직접 insert → 에러
     - owner가 draft `daily_reports` select → 0 rows
     - `requested` 단계 시터가 `owner_profiles` select → 0 rows / `confirmed` 시터 → 1 row
   - **예약 (시나리오 A–F)**
     - A: 정원 3인 시터에 2마리 + 1마리 예약 → 둘 다 수락 성공
     - B: 그날 4번째 마리 요청 수락 → `sitter_unavailable`
     - C: 시터가 연 날의 일부만 요청 → 성공, 안 연 날 포함 → `sitter_unavailable`
     - D: Bori를 같은 날 두 번째 시터에게 요청 → `pet_already_booked`
     - E: 확정 예약 중 하루 blocked → 그날 `booking_days`만 dropped, 나머지 active, 견주 알림 1건 → 그날 Bori를 다른 시터에게 요청 → 성공
     - F: 확정 마리 수보다 `max_pets`를 낮춤 → `window_has_bookings`
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

## 예시 시나리오 (스키마 검증용)

등장인물: 시터 **Mina**, **Jun** · 견주 **Jisoo**(강아지 Bori, 고양이 Mochi) · 견주 **Hana**(강아지 Coco). 모두 가상 인물.

| # | 상황 | DB에서 일어나는 일 | 결과 |
| :--- | :--- | :--- | :--- |
| A | Mina가 10/1–10/31을 open, 정원 3. Jisoo가 Bori+Mochi를 10/5–10/8 요청, Hana가 Coco를 10/6–10/7 요청 → Mina가 둘 다 수락 | `sitter_availability` open 1행(max_pets 3). booking_days: Jisoo 8행, Hana 2행 | 10/6–10/7 Mina는 3마리 → 남은 자리 0. 10/5·10/8은 1자리 남음 |
| B | 다른 견주가 10/6에 1마리로 검색 | `sitter_remaining_slots(Mina, 10/6) = 0` | Mina는 10/6 결과에서 빠짐 (예약이 차서 자동 불가) |
| C | Jisoo의 다음 여행 10/12–10/19. Mina는 10/12–10/15만 열었고 Jun은 10/16–10/19만 열었음 | 검색 결과: Mina "Free Oct 12–15 (4 of 8 days)", Jun "Free Oct 16–19 (4 of 8 days)" | Jisoo가 예약 2건 요청 (Mina 4일, Jun 4일). 10/16에 Bori를 게시할 수 있는 사람은 Jun뿐 |
| D | Jisoo가 실수로 10/13 Bori를 Jun에게도 요청 | `unique(pet_id, day) where active` 위반 | `pet_already_booked` — 한 반려동물은 하루에 시터 1명 |
| E | 확정 후 Mina가 10/7에 개인 일정이 생겨 10/7을 blocked 추가 | Jisoo 예약의 10/7 행 2개, Hana 예약의 10/7 행 1개 → dropped. 두 예약 모두 confirmed 유지 | Jisoo·Hana에게 각각 알림. Jisoo는 10/7만 Jun에게 요청 → 10/7 담당 Jun, 10/5·10/6·10/8은 Mina 그대로 |
| F | Mina가 정원을 3→1로 낮추려 함 (10/6에 이미 3마리) | `guard_capacity_shrink` | `window_has_bookings` → "Block the days instead so owners are notified." |
| G | 요청 두 건이 Mina의 10/5 마지막 1자리를 두고 경쟁 | 요청은 자리를 안 차지. 수락 시 advisory lock + 재확인 | 먼저 수락한 쪽만 confirmed. 두 번째 수락은 `sitter_unavailable` |

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
