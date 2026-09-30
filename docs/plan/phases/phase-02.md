# Phase 02 — Supabase DB + RLS

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D5–D11, D21–D24, 쓰기 경로 §6
> **이 문서의 스키마가 정본**입니다. ([README.ko.md §9](../README.ko.md#9-데이터-모델-초안)는 초안)

## Goal

P0에 필요한 **전체 데이터 모델**을 PostgreSQL migration으로 정의하고, **owner/sitter 역할에 맞는 Row Level Security**와 **공통 헬퍼 함수**를 적용해 프론트가 Supabase client만으로 안전하게 CRUD할 수 있는 기반을 만든다.

- 반려동물은 **강아지와 고양이**(`pets.species`)를 모두 지원한다.
- 견주·시터는 **공통 프로필 + 역할별 프로필**로 나눈다.
- 시터는 **파트타임**이고 반려동물을 **시터 집에서 돌본다**(보딩). 날짜마다 **칸(Morning·Afternoon·Overnight)**을 열고, 칸마다 **자기 근무 시간**(예: Morning 08:00–12:00)과 **몇 마리까지** 받을지 정한다. 같은 칸에 여러 집 반려동물을 맡을 수 있다.
- 견주는 보통 **여행 전체를 한 시터에게** 맡긴다. 단골 시터의 스케줄을 먼저 보고, 없으면 검색한다. 나눠 맡기기는 견주가 직접 고를 때만.
- 예약할 때 **맡기는 시각·찾는 시각과 장소**를 정한다. 시터 근무 시간 밖이거나 장소가 시터 집이 아니면 **협의**가 필요하고, 상대방이 동의해야 확정된다.
- 시터가 확정된 예약을 못 하게 되면 **예약 전체를 취소**하고, 견주는 알림을 받아 다시 예약한다 (D24).

### Goal 달성 기준

- [ ] `001`–`003` migration이 SQL Editor에서 순서대로 오류 없이 적용
- [ ] 예약이 없는 시터는 남의 pet·feed·task를 조회 불가, 맡은 시간이 아니면 게시·완료 불가 (`supabase/tests/rls_smoke.sql`)
- [ ] 시터의 칸 정원(`max_pets`)을 넘는 예약 수락을 DB가 거부
- [ ] 같은 반려동물이 같은 날·같은 칸에 두 시터에게 예약되지 않음 (DB 유니크 제약)
- [ ] 시터 근무 시간 밖 맡기기/찾기는 **협의 대기**로 저장되고, 상대방 동의 전엔 확정되지 않음
- [ ] 시터가 확정 예약과 겹치는 칸을 막으려 하면 거부 → 예약 취소를 거쳐야 하고, 취소 시 견주에게 알림
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
| P0 테이블 16개 + 인덱스 + RLS + 헬퍼 함수 + 가입 트리거 + 종별 task 가드 + 예약 RPC(단골·스케줄·검색·요청·응답·취소) + 인수인계 협의 RPC + 겹침 가드 | 기능별 RPC·알림 트리거 (각 Phase의 migration: 05→`004`, 06→`005`, 07→`006`, 08→`007`) |
| `rls_smoke.sql` | 시드 데이터 (Phase 10) · P1 (Phase 11: 즐겨찾기 시터, 반복 근무 패턴) |
| | 방문 돌봄(시터가 견주 집에서 돌봄) — P0는 **보딩**만. 지도·주소 검증 — P0 장소는 텍스트 |

---

## 2.1–2.6 스키마 (`001_initial_schema.sql`)

맨 위: `create type care_slot as enum ('morning','afternoon','overnight');`

모든 테이블: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()` (예외는 명시). 시각은 `timestamptz`로 저장하고 화면에는 `APP_TIMEZONE`(D8)으로 표시.

### 칸 · 시간 규칙 (D24)

- 칸은 **이름만 고정**: `morning` · `afternoon` · `overnight` (UI: Morning · Afternoon · Overnight). **정확한 시간은 앱 전체에 고정하지 않는다.**
- **시터**가 스케줄을 열 때 칸마다 자기 시간을 적는다. 예: Mina는 Morning 08:00–12:00, Afternoon 12:00–18:00, Overnight 18:00–다음날 08:00. Jun은 Morning 09:00–13:00만.
- **견주**는 예약할 때 **맡기는 시각**과 **찾는 시각**을 정확히 정한다. 예: 10/5 09:30 맡김 → 10/8 17:00 찾음.
- 칸은 **정원 계산과 검색**에 쓰고, "지금 누가 이 반려동물을 맡고 있나"는 **맡긴 시각 ~ 찾는 시각** 구간으로 판단한다.
- 예약이 걸치는 칸 = 맡긴 시각~찾는 시각 구간이 그날 그 시터의 칸 시간과 겹치는 칸.

### 사람 (프로필)

공통 `profiles`는 **인증·RLS·표시 이름**만 담는 얇은 테이블이고, 역할마다 필요한 정보는 1:1 테이블로 분리한다 (D21). 가입 트리거가 role에 맞는 행을 하나 같이 만든다.

| 테이블 | 컬럼 (타입 · 제약) | 인덱스 / 유니크 |
| :--- | :--- | :--- |
| **profiles** | `id uuid PK → auth.users(id) on delete cascade` · `role text not null check (role in ('owner','sitter'))` · `display_name text not null` · `created_at` · `updated_at timestamptz` | idx(role) |
| **owner_profiles** | `id uuid PK → profiles(id) on delete cascade` (owner만) · `home_address text` (견주 집 픽업·드랍오프용) · `emergency_contact_name text` · `emergency_contact_phone text` · `vet_clinic_name text` · `vet_clinic_phone text` · `notes text` · `updated_at timestamptz` | - |
| **sitter_profiles** | `id uuid PK → profiles(id) on delete cascade` (sitter만) · `bio text` · `service_area text` (공개: 동네 수준) · `home_address text` (비공개: 확정 예약 견주에게만) · `experience_years int check (experience_years >= 0)` · `home_notes text` (보딩 환경: 마당, 다른 반려동물 등) · `default_max_pets int not null default 2 check (default_max_pets between 1 and 10)` · `default_hours jsonb not null default '{"morning":["08:00","12:00"],"afternoon":["12:00","18:00"],"overnight":["18:00","08:00"]}'` (스케줄을 열 때 칸별 기본 시간 — 시터가 수정) · `updated_at timestamptz` | - |

- 시터는 강아지·고양이를 모두 돌본다 — 종 제한 컬럼 없음.
- 주소·연락처·동물병원 필드는 **P0 폼에서 선택 입력**. 시드·데모에는 가짜 값만 (실제 PII 금지, CLAUDE.md §1).

### 시터 스케줄 · 예약 · 인수인계 (D24)

| 테이블 | 컬럼 (타입 · 제약) | 인덱스 / 유니크 |
| :--- | :--- | :--- |
| **sitter_availability** | `sitter_id → profiles on delete cascade` · `kind text not null check (kind in ('open','blocked'))` · `start_date date not null` · `end_date date not null` (포함, `check (end_date >= start_date)`) · `slot care_slot not null` · `starts_at time` · `ends_at time` (open이면 둘 다 not null. overnight는 `ends_at < starts_at` 허용 = 다음날) · `max_pets int` (open이면 `not null check (max_pets between 1 and 10)`, blocked면 null — check로 강제) · `note text` | idx(sitter_id, start_date) |
| **bookings** | `owner_id → profiles` · `sitter_id → profiles` · `start_date date` · `end_date date` (표시·검색용 요약) · `status text not null default 'requested' check (status in ('requested','confirmed','declined','cancelled'))` · `owner_note text` · `sitter_note text` · `responded_at timestamptz` · `cancelled_by → profiles null` · `cancel_reason text` · `rebooked_from uuid → bookings null` · `updated_at timestamptz` | idx(sitter_id, start_date), idx(owner_id) |
| **booking_slots** | `booking_id → bookings on delete cascade` · `pet_id → pets on delete cascade` · `day date not null` · `slot care_slot not null` · `active boolean not null default true` · PK(booking_id, pet_id, day, slot) · `id`/`created_at` 없음 (예외) | **unique(pet_id, day, slot) where active** · idx(day, slot) |
| **booking_handoffs** | `booking_id → bookings on delete cascade` · `kind text not null check (kind in ('drop_off','pick_up'))` · `scheduled_at timestamptz not null` · `location_type text not null default 'sitter_home' check (location_type in ('sitter_home','owner_home','other'))` · `location_note text` (`other`면 not null — 예: "Trinity Bellwoods Park, north gate") · `within_sitter_hours boolean not null` (요청 시 계산) · `status text not null check (status in ('proposed','agreed','rejected','superseded'))` · `proposed_by → profiles` · `responded_at timestamptz` · `completed_at timestamptz` (시터가 "받았음/돌려줬음" 체크) | **unique(booking_id, kind) where status='agreed'**, **unique(booking_id, kind) where status='proposed'** |

**`booking_slots` = 정원·중복 계산용 단위.** Bori + Mochi를 10/5 09:30 → 10/6 17:00 Mina에게 맡기면, Mina의 칸 시간 기준으로 걸치는 칸은 10/5 morning·afternoon·overnight, 10/6 morning·afternoon → 2마리 × 5칸 = **10행**.

- `active` = 예약이 `requested`/`confirmed`. 트리거 `sync_booking_slots_active`가 예약이 거절·취소되면 `false`로 바꿔 자리를 비움.
- **`unique(pet_id, day, slot) where active`** → 한 반려동물은 한 칸에 **시터 1명**. 오전 Mina · 오후 Jun처럼 칸이 다르면 같은 날 시터 2명도 가능.

**`booking_handoffs` = 맡기기·찾기의 시간·장소와 협의 이력.** 예약마다 `drop_off` 1개, `pick_up` 1개가 **agreed** 상태로 있어야 확정된 것이다.

| 상황 | 저장 |
| :--- | :--- |
| 견주 요청 시 시각이 시터 칸 시간 안이고 장소 = `sitter_home` | `within_sitter_hours=true`, `status='proposed'` → 시터가 예약을 수락하면 함께 `agreed` |
| 시각이 시터 시간 밖 (예: 07:00 맡김, Mina Morning은 08:00부터) 또는 장소가 `owner_home`/`other` | `within_sitter_hours=false` 또는 장소 다름 → 요청 카드에 **"Custom drop-off — needs your OK"**. 시터가 예약을 수락하면 이 조건에 동의한 것 |
| 시터가 수락 전에 다른 시각 제안 ("07:30이면 가능해요") | 견주 제안 행 `superseded` → 시터 제안 행 `proposed` → 견주 알림 → 견주가 동의하면 `agreed` → 시터가 예약 수락 |
| **주고받기 (횟수 제한 없음)** | 받은 쪽은 매번 **Accept / Suggest another time / Decline**. 역제안할 때마다 이전 제안 `superseded`, 새 제안 `proposed` (대부분 1–2번, 필요하면 더) |
| **확정 전 협의에서 거절** | 제안 행 `rejected` → **예약 요청 종료**: 시터가 거절하면 booking `declined`, 견주가 거절하면 `cancelled`. 다시 하려면 새로 요청 |
| 확정 후 변경 (예: 비행기 연착으로 찾는 시각 변경) | 어느 쪽이든 새 `proposed` 행 → 상대방 동의 시 새 행 `agreed`, 기존 agreed 행 `superseded`. **동의 전까지는 기존 시각이 유효**. 역제안도 가능 |
| 확정 후 변경 제안을 거절 | 제안 행 `rejected`, **기존 agreed 유지** (예약은 그대로 — 변경만 안 됨) |

**시터의 칸별 남은 자리** (`sitter_remaining(p_sitter, p_day, p_slot)`, §2.8) — 저장하지 않고 계산:

```
정원 = (그 날짜·칸의 open 행들 max_pets 중 최댓값, 없으면 0)
       단, 그 날짜·칸이 blocked 행에 들어가면 0
사용 = 그 시터의 confirmed 예약에서 그 날짜·칸의 active booking_slots 수 (= 맡은 반려동물 수)
남은 자리 = 정원 - 사용
```

→ **"예약이 차면 자동으로 예약 불가"** = 남은 자리가 0인 칸은 스케줄에 "Full"로 보이고 검색·수락이 막힌다. 요청(`requested`)은 자리를 차지하지 않고, **먼저 수락한 쪽이 자리를 가져간다** (수락 시 재확인).

**예약 상태 전이**

```
requested ──(인수인계 2개 agreed + 시터 수락 + 모든 칸 자리 있음)──> confirmed ──(견주 또는 시터 취소)──> cancelled
    │                                                                              │
    ├─(시터 거절)─> declined                                                        └─ 견주: "Find a new sitter"
    └─(견주 취소)─> cancelled                                                          → 같은 반려동물·시각·장소로 재검색
```

- **시터가 일정이 생기면:** 확정 예약과 겹치는 칸을 `blocked`로 추가하려 하면 트리거가 `'overlaps_confirmed_booking'`으로 막는다 → 앱이 "This overlaps Jisoo's booking (Oct 5–8). Cancel that booking?" → 시터가 `cancel_booking` → **예약 전체 취소** + 견주 알림 → 그다음 blocked 추가.
- 견주는 취소 알림을 받고 **한 시터에게 다시 맡길지, 나눠 맡길지 직접 결정**한다. 앱이 자동으로 쪼개거나 대신 배정하지 않는다.
- `completed`는 저장하지 않고 파생: `pick_up` handoff의 `completed_at is not null` 또는 `scheduled_at < now()`.
- **한 예약 = 시터 1명 + 견주 1명.** 한 예약에 pet 여러 마리 가능.

### 반려동물 · 케어

| 테이블 | 컬럼 (타입 · 제약) | 인덱스 / 유니크 |
| :--- | :--- | :--- |
| **pets** | `owner_id uuid not null → profiles` · `species text not null check (species in ('dog','cat'))` · `name text not null` · `breed text` · `birthdate date` · `weight_kg numeric(5,2)` · `notes text` | idx(owner_id) |
| **pet_allergies** | `pet_id → pets on delete cascade` · `allergen text not null` (EN 소문자, 예 `chicken`) · `notes text` | unique(pet_id, lower(allergen)) |
| **care_tasks** | `pet_id → pets cascade` · `type text check in ('medication','walk','feeding','litter','play','sleep')` · `title text not null` · `dose text` · `scheduled_time time not null` · `repeat_daily boolean not null default true` · `notes text` · `active boolean not null default true` · `created_by → profiles` | idx(pet_id) |
| **media** | `pet_id → pets cascade` · `uploaded_by → profiles` · `cloudinary_public_id text not null unique` · `resource_type text check in ('image','video')` · `purpose text check in ('feed','task_proof','safety_label')` · `width int` · `height int` · `duration_s numeric` | idx(pet_id, created_at desc) |
| **task_logs** | `task_id → care_tasks cascade` · `pet_id → pets cascade` (비정규화: RLS·조회용) · `due_at timestamptz not null` · `status text not null default 'pending' check in ('pending','done')` · `completed_at timestamptz` · `completed_by → profiles` · `media_id → media null` | **unique(task_id, due_at)**, idx(pet_id, due_at) |
| **feed_posts** | `pet_id → pets cascade` · `sitter_id → profiles` (게시한 시터) · `media_id → media not null` · `caption text` · `caption_source text check in ('ai','fallback','task')` · `task_log_id → task_logs null` | idx(pet_id, created_at desc) |
| **daily_reports** | `pet_id → pets cascade` · `sitter_id → profiles` (작성한 시터) · `report_date date not null` · `body text not null` · `status text not null default 'draft' check in ('draft','sent')` · `inputs jsonb not null default '{}'` (퀵탭) · `source_snapshot jsonb` (AI에 준 입력 원본 — 환각 검증용) · `model text` · `sent_at timestamptz` · `updated_at timestamptz` | **unique(pet_id, report_date, sitter_id)** — 시터마다 그날 자기가 맡은 시간에 대해 1개 (오전 Mina·오후 Jun이면 하루 2개) |
| **safety_checks** | `pet_id → pets cascade` · `checked_by → profiles` · `media_id → media` · `safety_status text check in ('DANGER','WARNING','SAFE')` · `result_json jsonb not null` · `model_vision text` · `model_reasoning text` · `acknowledged_at timestamptz` | idx(pet_id, created_at desc) |
| **notifications** | `user_id → profiles cascade` · `pet_id → pets null` · `booking_id → bookings null` · `type text not null` (architecture §7) · `ref_id uuid` · `title text not null` · `body text` · `read_at timestamptz` | idx(user_id, created_at desc), partial idx(user_id) where read_at is null |

### 종별 케어 규칙 (D23)

| `care_tasks.type` | 강아지 | 고양이 | UI 라벨 (EN) | 완료 시 견주 알림 예 |
| :--- | :---: | :---: | :--- | :--- |
| `medication` | ✅ | ✅ | Medication | "Bori's medication is done 💊" |
| `feeding` | ✅ | ✅ | Feeding | "Bori had breakfast on time 🍽️" |
| `play` | ✅ | ✅ | Play time | "Mochi had play time 🎾" |
| `sleep` | ✅ | ✅ | Bedtime | "Bori is asleep 😴" |
| `walk` | ✅ | ✗ | Walk | "Bori's walk is done 🦮" |
| `litter` | ✗ | ✅ | Litter box | "Mochi's litter box is clean 🧺" |

- 프론트는 pet의 `species`에 맞는 type만 보여준다. DB는 트리거 `guard_care_task_species`(003)로 `walk`+cat, `litter`+dog 조합을 **거부**한다 (check 제약은 다른 테이블을 못 봐서 트리거 사용).
- task는 **그 시각에 반려동물을 맡고 있는 시터**가 완료한다: `due_at`이 그 시터 예약의 agreed 맡긴 시각 ~ 찾는 시각 사이. `complete_task_log`(Phase 06)가 `in_care_window(pet, due_at)`로 확인. 맡기기 전·찾은 뒤의 task는 시터 할 일 목록에 나오지 않는다.
- `missed`는 컬럼 없음 (D9): `status='pending' and now() > due_at + interval '60 minutes'`.
- `daily_reports.inputs` 형식 (모든 키 optional, 종 공통): `{"meal":"all|most|little|none","water":"normal|low","potty":"normal|soft|none","mood":"happy|calm|tired","note":"<=120 chars"}` — `potty`는 강아지 배변·고양이 화장실을 모두 뜻함.

---

## 2.7 RLS (`002_rls_policies.sql`)

모든 테이블 `enable row level security`. 헬퍼 함수(003에 정의하되 002보다 먼저 필요하면 **002 맨 위에 정의**):

```sql
-- security definer + stable + set search_path = public
app_today() → (now() at time zone 'America/Toronto')::date   -- APP_TIMEZONE(D8)과 반드시 일치

is_owner_of(pet uuid) → exists(select 1 from pets where id = pet and owner_id = auth.uid())

-- 맡긴 구간: 호출자(시터)의 confirmed 예약 중 이 pet이 포함되고, agreed drop_off ~ agreed pick_up
care_window(pet uuid, sitter uuid) → setof tstzrange   -- 예약마다 [drop_off.scheduled_at, pick_up.scheduled_at)

-- 조회용: 찾는 시각이 아직 안 지난 확정 예약이 있음 (맡기기 전 준비용 조회 허용)
is_sitter_of(pet uuid) → exists(care_window(pet, auth.uid()) w where upper(w) > now())

-- 작업용: 지금 이 반려동물을 맡고 있음 (게시·알림장·세이프티·업로드 서명).
-- 맡기기 30분 전 ~ 찾은 뒤 2시간까지 여유 (사진·알림장 마무리)
is_on_duty_for(pet uuid) → exists(care_window(pet, auth.uid()) w
    where now() between lower(w) - interval '30 minutes' and upper(w) + interval '2 hours')

-- 할 일용: 특정 시각에 맡고 있음
in_care_window(pet uuid, at timestamptz) → exists(care_window(pet, auth.uid()) w where w @> at)

can_access_pet(pet uuid) → is_owner_of(pet) or is_sitter_of(pet)

-- 프로필 상호 조회
has_booking_with(other uuid) → exists(select 1 from bookings
    where status in ('requested','confirmed')
      and ((owner_id = auth.uid() and sitter_id = other) or (sitter_id = auth.uid() and owner_id = other)))
has_confirmed_booking_with(other uuid) → 위와 같되 status = 'confirmed'
```

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
| :--- | :--- | :--- | :--- | :--- |
| profiles | 본인 + `role='sitter'`인 행 (검색·단골 목록) + `has_booking_with(id)` | 트리거만 | 본인 (`display_name`만) | ✗ |
| owner_profiles | 본인 + `has_confirmed_booking_with(id)` (확정된 시터만 주소·긴급 연락처 확인) | 트리거만 | 본인 | ✗ |
| sitter_profiles | 로그인 사용자 전체 (검색·단골 목록) — **`home_address` 컬럼은 select 권한 회수**. 주소는 확정 예약 당사자만 RPC `get_handoff_details(booking)`로 | 트리거만 | 본인 | ✗ |
| sitter_availability | 본인 (견주는 스케줄 조회·검색 RPC로만 — 칸 시간·남은 자리만, 다른 견주 예약 내용은 안 보임) | 본인 (role=sitter) | 본인 | 본인 |
| bookings | `owner_id = auth.uid() or sitter_id = auth.uid()` | ✗ (RPC) | ✗ (RPC) | ✗ |
| booking_slots | 해당 booking을 볼 수 있으면 | ✗ (RPC) | ✗ (트리거) | ✗ |
| booking_handoffs | 해당 booking을 볼 수 있으면 | ✗ (RPC) | ✗ (RPC) | ✗ |
| pets | `can_access_pet(id)` | owner (`owner_id = auth.uid()` and 내 role=owner) | owner (`is_owner_of`) | owner |
| pet_allergies | `can_access_pet` | owner | owner | owner |
| care_tasks | `can_access_pet` | owner | owner | owner |
| media | `can_access_pet` | ✗ (FastAPI service role — `is_on_duty_for` 확인 후) | ✗ | ✗ |
| task_logs | `can_access_pet` | ✗ (RPC) | ✗ (RPC — `in_care_window`) | ✗ |
| feed_posts | `can_access_pet` | sitter (`sitter_id = auth.uid()` and `is_on_duty_for(pet_id)` and media의 pet_id 일치) | ✗ | sitter 본인 글 |
| daily_reports | owner: `is_owner_of and status='sent'` / sitter: `sitter_id = auth.uid()` | ✗ (FastAPI) | ✗ (RPC `send_daily_report`) | ✗ |
| safety_checks | `can_access_pet` | ✗ (FastAPI) | sitter (`is_sitter_of`) — `acknowledged_at`만 | ✗ |
| notifications | `user_id = auth.uid()` | ✗ (트리거/RPC) | 본인 (`read_at`만) | 본인 |

> **"~만" 수정 규칙은 RLS가 아니라 컬럼 권한으로 강제**합니다 (RLS `with check`는 이전 값과 비교 불가):
> ```sql
> revoke update on public.pets, public.profiles, public.owner_profiles, public.sitter_profiles,
>   public.safety_checks, public.notifications from authenticated;
> -- 공개 목록에서 주소 가림: 테이블 단위 select가 있으면 컬럼 revoke가 무효라서, 통째로 회수 후 나머지 컬럼만 grant
> revoke select on public.sitter_profiles from anon, authenticated;
> grant select (id, bio, service_area, experience_years, home_notes, default_max_pets, default_hours,
>   created_at, updated_at) on public.sitter_profiles to authenticated;
> grant update (name, breed, birthdate, weight_kg, notes) on public.pets to authenticated;
> grant update (display_name) on public.profiles to authenticated;
> grant update (home_address, emergency_contact_name, emergency_contact_phone, vet_clinic_name,
>   vet_clinic_phone, notes) on public.owner_profiles to authenticated;
> grant update (bio, service_area, home_address, experience_years, home_notes, default_max_pets, default_hours)
>   on public.sitter_profiles to authenticated;
> grant update (acknowledged_at) on public.safety_checks to authenticated;
> grant update (read_at) on public.notifications to authenticated;
> ```
> `pets.species`는 생성 후 변경 불가 (grant에서 제외). 예약 상태·`booking_slots`·`booking_handoffs`는 RPC와 트리거(security definer)로만 바뀝니다.

> "✗ (FastAPI)" 테이블은 service role로만 씀 → `backend/README.md`에 목록 (DoD 3): `media`, `daily_reports`(insert/upsert), `safety_checks`(insert), 조회용 전체. service role은 RLS를 우회하므로 FastAPI `services/authz.py`가 `assert_on_duty_for(pet_id)`를 먼저 호출.

---

## 2.8 공통 함수·트리거 (`003_functions_triggers.sql`)

### 가입 · 케어

| 이름 | 종류 | 동작 |
| :--- | :--- | :--- |
| `handle_new_user()` | trigger `after insert on auth.users` | `raw_user_meta_data->>'role'`(없으면 `owner`), `display_name`(없으면 email 앞부분)으로 `profiles` insert → role이 owner면 `owner_profiles(id)`, sitter면 `sitter_profiles(id)` 빈 행 insert |
| `guard_care_task_species()` | trigger `before insert or update of type, pet_id on care_tasks` | pet의 species를 읽어 `walk`+`cat` 또는 `litter`+`dog`이면 exception `'task_type_not_allowed_for_species'` |

### 스케줄 · 예약

| 이름 | 종류 | 동작 |
| :--- | :--- | :--- |
| `sitter_hours(p_sitter uuid, p_day date, p_slot care_slot)` | function stable | 그날 그 칸의 open 행 `starts_at`/`ends_at` → `tstzrange` (overnight는 다음날까지). 없으면 null |
| `slots_for_window(p_sitter uuid, p_from timestamptz, p_to timestamptz)` | function stable | `[p_from, p_to)`와 겹치는 그 시터의 `(day, slot)` 목록. 시터가 연 칸 기준이라 **시터마다 결과가 다를 수 있음**. 열지 않은 칸은 `sitter_profiles.default_hours`로 계산해 포함 (정원 0 → "일부 가능"/`sitter_unavailable`로 드러남, 빈 칸을 건너뛰지 않음) |
| `sitter_remaining(p_sitter uuid, p_day date, p_slot care_slot)` | function stable | §2.1 "칸별 남은 자리". 음수면 0 |
| `get_sitter_schedule(p_sitter uuid, p_from date, p_to date)` | RPC security definer | 견주가 **특정 시터(단골)의 스케줄**을 볼 때. 날짜 × 칸마다 `{day, slot, starts_at, ends_at, state: 'open'\|'full'\|'blocked'\|'closed', remaining}`. 다른 견주의 예약 내용은 노출 안 함 |
| `list_my_sitters()` | RPC security definer | 호출자 owner가 **확정 예약을 한 적 있는 시터** 목록 (최근 순, 예약 횟수). 앱의 "Your sitters" = 단골 |
| `search_sitters(p_drop_off_at timestamptz, p_pick_up_at timestamptz, p_pet_count int)` | RPC security definer | 시터마다 `slots_for_window`의 칸 중 `sitter_remaining >= p_pet_count`인 칸 수 + 맡기는/찾는 시각이 그 시터 칸 시간 안인지 → `{sitter_id, display_name, bio, service_area, experience_years, is_my_sitter, covered_slots, total_slots, drop_off_within_hours, pick_up_within_hours}`. **정렬: ① 전체 가능 + 단골 ② 전체 가능 ③ 일부 가능**(나눠 맡기기 참고용). 시각이 시간 밖이어도 제외하지 않음 (협의 가능) — 카드에 "Custom drop-off time" 표시 |
| `request_booking(p_sitter, p_pets uuid[], p_drop_off_at, p_drop_off_location_type, p_drop_off_note, p_pick_up_at, p_pick_up_location_type, p_pick_up_note, p_note, p_rebooked_from default null)` | RPC security definer | 호출자가 모든 pet의 owner, `p_sitter`가 sitter, `p_pick_up_at > p_drop_off_at`, `slots_for_window`의 모든 칸 `sitter_remaining >= cardinality(p_pets)` → 실패 시 `'not_owner'` / `'not_a_sitter'` / `'invalid_window'` / `'sitter_unavailable'`(어느 칸인지 detail에). bookings(requested) + booking_slots(pet × 칸) + booking_handoffs 2행(`proposed`, `within_sitter_hours` 계산, `proposed_by` = 견주) insert. 유니크 위반 → `'pet_already_booked'`. 시터에게 `booking_requested` |
| `respond_booking(p_booking uuid, p_accept boolean, p_note text)` | RPC security definer | 호출자 = 해당 시터, status=`requested`. 수락: 두 handoff가 모두 견주 제안이거나 이미 agreed여야 함 (시터 역제안이 대기 중이면 `'handoff_pending'`) → `pg_advisory_xact_lock(hashtext(sitter_id::text))` → 모든 칸 자리 재확인 → 부족하면 `'sitter_unavailable'` → 충분하면 handoff 2개 `agreed` + booking `confirmed` + 견주 `booking_confirmed`. 거절: `declined` + 견주 `booking_declined` |
| `cancel_booking(p_booking uuid, p_reason text)` | RPC security definer | 호출자 = 견주 또는 시터, status in (`requested`,`confirmed`) → `cancelled`, `cancelled_by`·`cancel_reason` 기록 → 상대방에게 `booking_cancelled` ("Mina can't take Bori and Mochi on Oct 5–8. Find a new sitter.") |
| `sync_booking_slots_active()` | trigger `after update of status on bookings` | status가 `declined`/`cancelled`가 되면 그 예약의 `booking_slots.active = false` (자리·유니크 해제) |
| `guard_availability_change()` | trigger `after insert or update or delete on sitter_availability` (변경 후 정원으로 검사, 실패 시 롤백) | (1) `blocked` 추가/변경이 그 시터의 confirmed 칸과 겹치면 `'overlaps_confirmed_booking'` (+ 겹치는 booking id 목록) (2) `open`을 줄이거나 지우거나 `max_pets`를 낮춰서 이미 확정된 마리 수보다 정원이 작아지는 칸이 생기면 같은 에러. 칸 **시간(starts_at/ends_at)만 바꾸는 것은 허용** — 이미 agreed된 인수인계 시각은 그대로 유효 |

### 인수인계 (맡기기 · 찾기)

| 이름 | 종류 | 동작 |
| :--- | :--- | :--- |
| `propose_handoff(p_booking uuid, p_kind text, p_at timestamptz, p_location_type text, p_note text)` | RPC security definer | 호출자 = 그 예약의 견주 또는 시터, status in (`requested`,`confirmed`), 해당 handoff가 아직 `completed_at is null`. 기존 `proposed` 행 → `superseded`, 새 `proposed` 행 insert → **상대방**에게 `handoff_proposed` ("Mina suggested drop-off at 7:30 AM"). 확정 예약이면 새 시각이 걸치는 칸 자리도 재확인 |
| `respond_handoff(p_handoff uuid, p_accept boolean)` | RPC security definer | 호출자 = 제안하지 않은 쪽 (역제안은 `propose_handoff`로 — 횟수 제한 없음). 수락: 기존 agreed → `superseded`, 이 행 → `agreed`, 확정 예약이면 `booking_slots` 재계산 → 제안자에게 `handoff_agreed`. 거절: 이 행 `rejected` → **예약이 `requested`면 예약 종료** (시터 거절 → `declined`, 견주 거절 → `cancelled`, 상대방에게 `booking_declined`/`booking_cancelled`) / **`confirmed`면 기존 agreed 유지**, 제안자에게 `handoff_declined` |
| `complete_handoff(p_booking uuid, p_kind text)` | RPC security definer | 호출자 = 시터, agreed 행에 `completed_at = now()` → 견주에게 `pet_dropped_off` ("Bori and Mochi arrived at Mina's 🏠") / `pet_picked_up` ("Bori and Mochi are on their way home 👋") |
| `get_handoff_details(p_booking uuid)` | RPC security definer | 확정 예약 당사자에게 agreed 인수인계 + **실제 주소** (`sitter_home`이면 시터 `home_address`, `owner_home`이면 견주 `home_address`, `other`면 `location_note`) |

### 기타

| 이름 | 종류 | 동작 |
| :--- | :--- | :--- |
| Realtime | DDL | `alter publication supabase_realtime add table public.notifications;` |

> 기능별 RPC(`ensure_today_task_logs`, `complete_task_log`, `send_daily_report`)와 알림 트리거는 **해당 Phase가 자기 migration에 추가**합니다. 예약 화면은 [Phase 03B](phase-03b.md).
>
> **알림 원칙 (D24):** 시터가 스케줄을 열거나 바꿔도 견주에게 알림은 없다. 견주는 필요할 때 직접 스케줄을 본다. 견주 알림은 ① 예약·인수인계 결과(수락·거절·취소·시각 제안/동의) ② **맡긴 동안의 케어 소식**(도착·출발, 사진, 할 일 완료, 알림장, 세이프티 경고)뿐.

---

## Definition of Done (DoD)

1. `supabase/README.md`에 ERD 16줄 이내 + migration 적용 순서 (`001 → 002 → 003 → …`)
2. `supabase/tests/rls_smoke.sql`로 아래 확인 (주석에 기대 결과). 시나리오 이름은 [§ 예시 시나리오](#예시-시나리오-스키마-검증용)와 같음:
   - **권한**
     - 예약 없는 시터가 pet `select` → 0 rows
     - 다음 주 확정 예약이 있는 시터: pet `select` → 1 row, `feed_posts` insert → RLS 에러 (아직 안 맡음)
     - 맡긴 시간 안의 시터: `feed_posts` insert → 성공 / 다른 시터 → 에러
     - owner가 `task_logs` 직접 insert → 에러
     - owner가 draft `daily_reports` select → 0 rows
     - `requested` 단계 시터가 `owner_profiles` select → 0 rows / `confirmed` 시터 → 1 row
     - 견주가 시터 목록 조회 시 `home_address` 컬럼 접근 → 권한 에러
   - **예약 (시나리오 A–H)**
     - A: 시간 안 맡기기·찾기 + `sitter_home` → 요청·수락 → confirmed, handoff 2개 agreed, 견주 알림 1건
     - B: 정원 3 칸에 3마리 확정 후 4번째 요청 수락 → `sitter_unavailable`, 스케줄에 `full`
     - C: 시간 밖 맡기기(07:00) 요청 → handoff `within_sitter_hours=false` → 시터 역제안(07:30) → 수락 시도 → `handoff_pending` → 견주 역제안(07:15) → 시터 역제안(07:30) → 견주 동의 → 시터 수락 → confirmed
     - C″: 확정 전 협의 중 견주가 시터 제안 거절 → booking `cancelled`, slots `active=false`
     - D″: 확정 후 변경 제안을 시터가 거절 → 기존 agreed 유지, booking `confirmed` 그대로
     - D: 확정 후 견주가 찾는 시각 변경 제안 → 시터 동의 전까지 기존 agreed 유지 → 동의 후 새 시각 agreed, booking_slots 재계산
     - E: 시터가 확정 칸과 겹치게 blocked insert → `overlaps_confirmed_booking` → `cancel_booking` → slots `active=false`, 견주 `booking_cancelled` → 다른 시터에게 `request_booking(p_rebooked_from)` 성공
     - F: 오전 Mina · 오후 Jun 예약 2건 (같은 pet·같은 날, 칸 다름) 성공 / 같은 칸 두 번째 요청 → `pet_already_booked` / 각자 `daily_reports` 1개씩
     - G: 시터가 open 구간 insert → 견주 알림 0건
     - H: 두 요청이 마지막 1자리 경쟁 → 먼저 수락한 것만 confirmed
   - **케어**
     - 고양이 pet에 `walk` care_task insert → `task_type_not_allowed_for_species`
     - 맡기기 전 시각의 task를 시터가 완료 → `not_in_care_window` (`complete_task_log`는 Phase 06 — 02에서는 `in_care_window` 참/거짓만 확인)
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

등장인물: 시터 **Mina**(Morning 08:00–12:00 · Afternoon 12:00–18:00 · Overnight 18:00–08:00, 정원 3), 시터 **Jun**(Morning 09:00–13:00 · Afternoon 13:00–17:00만) · 견주 **Jisoo**(강아지 Bori, 고양이 Mochi) · 견주 **Hana**(강아지 Coco). 모두 가상 인물.

| # | 상황 | DB에서 일어나는 일 | 결과 |
| :--- | :--- | :--- | :--- |
| A | Jisoo가 10/5 09:30 Mina 집에 맡기고 10/8 17:00 찾음. "Your sitters"에서 Mina 스케줄 확인 → 요청 → 수락 | booking 1 + slots 2마리 × 11칸 + handoffs 2 (시간 안, `sitter_home`) → 수락 시 agreed | "Mina confirmed your booking" 1건. 10/5 09:35 Mina가 **Received** 체크 → "Bori and Mochi arrived at Mina's 🏠" |
| B | Hana가 Coco를 10/6–10/7 Mina에게 맡김. 다른 견주가 Mina 스케줄 확인 | 10/6 morning Mina 사용 3 → 남은 자리 0 | 그 칸 "Full" — 예약 불가 |
| C | Jisoo의 다음 여행은 새벽 비행기라 **07:00**에 맡기고 싶음 (Mina Morning은 08:00부터) | drop_off handoff `within_sitter_hours=false` → 요청 카드 "Custom drop-off — needs your OK" → Mina가 **07:30** 역제안 → (필요하면 몇 번 더 주고받음) → Jisoo 동의 → Mina 수락 | 07:30 맡기기로 확정. 둘 다 앱에서 협의. 어느 쪽이든 **Decline**하면 이 요청은 끝 |
| D | 확정 후 비행기 연착 → Jisoo가 찾는 시각 17:00 → 20:00 변경 제안 | 새 pick_up `proposed` → Mina 동의 전까지 17:00 유효 → 동의 → 20:00 agreed, 10/8 overnight 칸 추가 (자리 재확인) | Mina 동의 알림이 Jisoo에게 |
| D′ | 찾는 장소를 Jisoo 집으로 요청 ("Can you drop them at my place?") | pick_up `location_type='owner_home'` 제안 → Mina 동의 | `get_handoff_details`로 Mina만 Jisoo 주소 확인 |
| E | 10/1에 Mina가 10/7 개인 일정 → block 시도 | `overlaps_confirmed_booking` → Mina가 Jisoo·Hana 예약 취소 → 각자 취소 알림 | Jisoo가 **Find a new sitter** → 같은 시각·장소로 검색 → Jun은 오후 17시까지라 "Custom pick-up time" 표시, Sora는 전체 가능 → Jisoo가 **결정** (보통 Sora 한 명) |
| F | Hana가 출근하는 날 Coco를 09:00 Mina에게 맡기고 12:00에 Jun이 Mina 집에서 받아감 (`other`/장소 협의) | 예약 2건: Mina(09:00–12:00, morning), Jun(12:00–17:00, afternoon) | 08:00 feeding은 Hana 담당(맡기기 전), 13:00 feeding은 Jun. 알림장은 Mina·Jun 각자 1개 |
| G | Jun이 11월을 새로 open | `sitter_availability` insert | 견주 알림 없음 |
| H | 두 견주 요청이 Mina의 10/5 morning 마지막 1자리 경쟁 | 요청은 자리를 안 차지. 수락 시 advisory lock + 재확인 | 먼저 수락한 쪽만 confirmed |

**맡긴 동안 견주가 받는 알림 (Phase 05–08):** 도착 → "Bori arrived at Mina's 🏠" · 사진 → "New photo of Bori 📸" · 08:00 feeding → "Bori had breakfast on time 🍽️" · 21:00 sleep → "Bori is asleep 😴" · 알림장 → "Today's report for Bori is here 📝" · 세이프티 DANGER → 경고 · 출발 → "Bori is on the way home 👋".

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
