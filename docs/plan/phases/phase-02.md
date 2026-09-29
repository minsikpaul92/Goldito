# Phase 02 — Supabase DB + RLS

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D5–D11, D21–D24, 쓰기 경로 §6
> **이 문서의 스키마가 정본**입니다. ([README.ko.md §9](../README.ko.md#9-데이터-모델-초안)는 초안)

## Goal

P0에 필요한 **전체 데이터 모델**을 PostgreSQL migration으로 정의하고, **owner/sitter 역할에 맞는 Row Level Security**와 **공통 헬퍼 함수**를 적용해 프론트가 Supabase client만으로 안전하게 CRUD할 수 있는 기반을 만든다.

- 반려동물은 **강아지와 고양이**(`pets.species`)를 모두 지원한다.
- 견주·시터는 **공통 프로필 + 역할별 프로필**로 나눈다.
- 시터는 **파트타임**이고 반려동물을 **시터 집에서 돌본다**(보딩). 일할 수 있는 날과 **칸(오전·오후·밤)**을 열고, 칸마다 **몇 마리까지** 받을지 정한다. 같은 칸에 여러 집 반려동물을 맡을 수 있다.
- 견주는 보통 **여행 전체를 한 시터에게** 맡긴다 (자주 바뀌면 반려동물에게 안 좋음). 단골 시터의 스케줄을 먼저 보고, 없으면 검색한다. 나눠 맡기기는 견주가 직접 고를 때만.
- 시터가 확정된 예약을 못 하게 되면 **예약 전체를 취소**하고, 견주는 알림을 받아 다시 예약한다 (D24).

### Goal 달성 기준

- [ ] `001`–`003` migration이 SQL Editor에서 순서대로 오류 없이 적용
- [ ] 예약이 없는 시터는 남의 pet·feed·task를 조회 불가, 오늘 담당이 아니면 게시·완료 불가 (`supabase/tests/rls_smoke.sql`)
- [ ] 시터의 칸 정원(`max_pets`)을 넘는 예약 수락을 DB가 거부
- [ ] 같은 반려동물이 같은 칸에 두 시터에게 예약되지 않음 (DB 유니크 제약)
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
| P0 테이블 15개 + 인덱스 + RLS + 헬퍼 함수 + 가입 트리거 + 종별 task 가드 + 예약 RPC(스케줄 조회·검색·요청·응답·취소) + 겹침 가드 | 기능별 RPC·알림 트리거 (각 Phase의 migration: 05→`004`, 06→`005`, 07→`006`, 08→`007`) |
| `rls_smoke.sql` | 시드 데이터 (Phase 10) · P1 (Phase 11: 즐겨찾기 시터, 반복 근무 패턴) |
| | 방문 돌봄(시터가 견주 집으로) — P0는 **보딩**만 · 자유 시간 입력 — P0는 **정해진 칸** |

---

## 2.1–2.6 스키마 (`001_initial_schema.sql`)

모든 테이블: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()` (예외는 명시).

### 시간 칸 규칙 (D24)

돌봄 시간은 **날짜 + 칸**으로 표현한다. 칸은 3개로 고정 (`care_slot` enum):

| 칸 | 시간 (`APP_TIMEZONE`) | UI 라벨 (EN) |
| :--- | :--- | :--- |
| `morning` | 07:00–13:00 | Morning |
| `afternoon` | 13:00–19:00 | Afternoon |
| `overnight` | 19:00–다음날 07:00 | Overnight |

- **종일** = morning + afternoon. **1박** = morning + afternoon + overnight.
- 여행(예: 10/5 오전 맡김 → 10/8 오후 찾음)은 칸 목록으로 펼친다: 10/5 morning·afternoon·overnight, 10/6 …, 10/8 morning·afternoon.
- 칸 순서: `morning < afternoon < overnight`, 그다음 날 `morning`. 연속 여부 계산에 사용.

### 사람 (프로필)

공통 `profiles`는 **인증·RLS·표시 이름**만 담는 얇은 테이블이고, 역할마다 필요한 정보는 1:1 테이블로 분리한다 (D21). 가입 트리거가 role에 맞는 행을 하나 같이 만든다.

| 테이블 | 컬럼 (타입 · 제약) | 인덱스 / 유니크 |
| :--- | :--- | :--- |
| **profiles** | `id uuid PK → auth.users(id) on delete cascade` · `role text not null check (role in ('owner','sitter'))` · `display_name text not null` · `created_at` · `updated_at timestamptz` | idx(role) |
| **owner_profiles** | `id uuid PK → profiles(id) on delete cascade` (owner만) · `emergency_contact_name text` · `emergency_contact_phone text` · `vet_clinic_name text` · `vet_clinic_phone text` · `notes text` · `updated_at timestamptz` | - |
| **sitter_profiles** | `id uuid PK → profiles(id) on delete cascade` (sitter만) · `bio text` · `service_area text` · `experience_years int check (experience_years >= 0)` · `home_notes text` (보딩 환경: 마당, 다른 반려동물 등) · `default_max_pets int not null default 2 check (default_max_pets between 1 and 10)` (근무일을 열 때 기본 정원) · `updated_at timestamptz` | - |

- 시터는 강아지·고양이를 모두 돌본다 — 종 제한 컬럼 없음.
- 연락처·동물병원 필드는 **P0 폼에서 선택 입력**. 시드·데모에는 가짜 값만 (실제 PII 금지, CLAUDE.md §1).

### 시터 스케줄 · 예약 (D24)

| 테이블 | 컬럼 (타입 · 제약) | 인덱스 / 유니크 |
| :--- | :--- | :--- |
| **sitter_availability** | `sitter_id → profiles on delete cascade` · `kind text not null check (kind in ('open','blocked'))` · `start_date date not null` · `end_date date not null` (포함, `check (end_date >= start_date)`) · `slots care_slot[] not null default '{morning,afternoon,overnight}'` (그 기간의 어느 칸인지, 비어 있으면 안 됨) · `max_pets int` (open이면 `not null check (max_pets between 1 and 10)`, blocked면 null — check로 강제) · `note text` | idx(sitter_id, start_date) |
| **bookings** | `owner_id → profiles` · `sitter_id → profiles` · `start_date date` · `end_date date` (표시·검색용 요약) · `status text not null default 'requested' check (status in ('requested','confirmed','declined','cancelled'))` · `owner_note text` · `sitter_note text` · `responded_at timestamptz` · `cancelled_by → profiles null` · `cancel_reason text` · `rebooked_from uuid → bookings null` (취소된 예약을 다시 잡을 때 연결) · `updated_at timestamptz` | idx(sitter_id, start_date), idx(owner_id) |
| **booking_slots** | `booking_id → bookings on delete cascade` · `pet_id → pets on delete cascade` · `day date not null` · `slot care_slot not null` · `active boolean not null default true` · PK(booking_id, pet_id, day, slot) · `id`/`created_at` 없음 (예외) | **unique(pet_id, day, slot) where active** · idx(day, slot) |

**`booking_slots`가 예약의 진짜 단위다.** Bori + Mochi를 10/5 오전 → 10/6 오후로 맡기면 2마리 × 5칸(10/5 morning·afternoon·overnight, 10/6 morning·afternoon) = **10행**.

- `active` = 예약이 `requested`/`confirmed`. 트리거 `sync_booking_slots_active`가 예약이 거절·취소되면 `false`로 바꿔 자리를 비움 (partial unique index가 다른 테이블을 못 봐서 비정규화).
- **`unique(pet_id, day, slot) where active`** → 한 반려동물은 한 칸에 **시터 1명**. 오전 Mina · 오후 Jun처럼 칸이 다르면 같은 날 시터 2명도 가능.

**시터의 칸별 남은 자리** (`sitter_remaining(p_sitter, p_day, p_slot)`, §2.8) — 저장하지 않고 계산:

```
정원 = (그 날짜·칸을 포함하는 open 행들의 max_pets 중 최댓값, 없으면 0)
       단, 그 날짜·칸이 blocked 행에 들어가면 0
사용 = 그 시터의 confirmed 예약에서 그 날짜·칸의 active booking_slots 수 (= 맡은 반려동물 수)
남은 자리 = 정원 - 사용
```

→ **"예약이 차면 자동으로 예약 불가"** = 남은 자리가 0인 칸은 스케줄에 "Full"로 보이고 검색·수락이 막힌다. 요청(`requested`)은 자리를 차지하지 않고, **먼저 수락한 쪽이 자리를 가져간다** (수락 시 재확인).

**예약 상태 전이**

```
requested ──(시터 수락, 모든 칸 자리 있음)──> confirmed ──(견주 또는 시터 취소)──> cancelled
    │                                                              │
    ├─(시터 거절)─> declined                                        └─ 견주: "Find a new sitter"
    └─(견주 취소)─> cancelled                                          → 같은 반려동물·칸으로 재검색
                                                                     → 새 예약에 rebooked_from 연결
```

- **시터가 일정이 생기면:** 확정 예약과 겹치는 칸을 `blocked`로 추가하려 하면 트리거가 `'overlaps_confirmed_booking'`으로 막는다. 앱은 "This overlaps Jisoo's booking (Oct 5–8). Cancel that booking?"으로 안내 → 시터가 `cancel_booking` → **예약 전체 취소** + 견주 알림. 그다음에 blocked 추가.
- 견주는 취소 알림을 받고 **한 시터에게 다시 맡길지, 나눠 맡길지 직접 결정**한다. 앱이 자동으로 쪼개거나 대신 배정하지 않는다.
- `completed`는 저장하지 않고 파생: `status='confirmed' and end_date < app_today()`.
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
| **daily_reports** | `pet_id → pets cascade` · `sitter_id → profiles` (작성한 시터) · `report_date date not null` · `body text not null` · `status text not null default 'draft' check in ('draft','sent')` · `inputs jsonb not null default '{}'` (퀵탭) · `source_snapshot jsonb` (AI에 준 입력 원본 — 환각 검증용) · `model text` · `sent_at timestamptz` · `updated_at timestamptz` | **unique(pet_id, report_date, sitter_id)** — 시터마다 자기 담당 칸이 끝나면 1개 (오전 Mina·오후 Jun이면 하루 2개) |
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
- task의 `scheduled_time`이 속한 칸의 담당 시터가 완료한다 (08:00 → morning 담당, 21:00 → overnight 담당). `complete_task_log`(Phase 06)가 `slot_of(time)`으로 확인.
- `missed`는 컬럼 없음 (D9): `status='pending' and now() > due_at + interval '60 minutes'`.
- `daily_reports.inputs` 형식 (모든 키 optional, 종 공통): `{"meal":"all|most|little|none","water":"normal|low","potty":"normal|soft|none","mood":"happy|calm|tired","note":"<=120 chars"}` — `potty`는 강아지 배변·고양이 화장실을 모두 뜻함.

---

## 2.7 RLS (`002_rls_policies.sql`)

모든 테이블 `enable row level security`. 헬퍼 함수(003에 정의하되 002보다 먼저 필요하면 **002 맨 위에 정의**):

```sql
-- security definer + stable + set search_path = public
app_today() → (now() at time zone 'America/Toronto')::date   -- APP_TIMEZONE(D8)과 반드시 일치
slot_of(t time) → case when t >= '07:00' and t < '13:00' then 'morning'
                       when t >= '13:00' and t < '19:00' then 'afternoon'
                       else 'overnight' end
-- 새벽 00:00–07:00은 전날 overnight 칸 → 날짜 계산 시 하루 빼서 봄 (current_care_day())

is_owner_of(pet uuid) → exists(select 1 from pets where id = pet and owner_id = auth.uid())

-- 조회용: 이 pet을 맡는 확정 칸이 오늘 이후에 하나라도 있음 (시작 전 준비용 조회 허용)
is_sitter_of(pet uuid) → exists(select 1 from booking_slots s join bookings b on b.id = s.booking_id
    where s.pet_id = pet and s.active and b.status = 'confirmed'
      and b.sitter_id = auth.uid() and s.day >= app_today())

-- 작업용: 오늘(돌봄 날짜 기준) 이 pet의 칸을 하나라도 맡음 (게시·완료·알림장·세이프티·업로드 서명)
is_on_duty_for(pet uuid) → 위와 같되 s.day = current_care_day()

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
| owner_profiles | 본인 + `has_confirmed_booking_with(id)` (확정된 시터만 긴급 연락처 확인 — 요청 단계에선 비공개) | 트리거만 | 본인 | ✗ |
| sitter_profiles | 로그인 사용자 전체 (검색·단골 목록에 소개 표시) | 트리거만 | 본인 | ✗ |
| sitter_availability | 본인 (견주는 스케줄 조회·검색 RPC로만 — 남은 자리만 보고 다른 견주 예약 내용은 안 보임) | 본인 (role=sitter) | 본인 | 본인 |
| bookings | `owner_id = auth.uid() or sitter_id = auth.uid()` | ✗ (RPC) | ✗ (RPC) | ✗ |
| booking_slots | 해당 booking을 볼 수 있으면 | ✗ (RPC) | ✗ (트리거) | ✗ |
| pets | `can_access_pet(id)` | owner (`owner_id = auth.uid()` and 내 role=owner) | owner (`is_owner_of`) | owner |
| pet_allergies | `can_access_pet` | owner | owner | owner |
| care_tasks | `can_access_pet` | owner | owner | owner |
| media | `can_access_pet` | ✗ (FastAPI service role — `is_on_duty_for` 확인 후) | ✗ | ✗ |
| task_logs | `can_access_pet` | ✗ (RPC) | ✗ (RPC — 그 칸 담당 확인) | ✗ |
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
> grant update (bio, service_area, experience_years, home_notes, default_max_pets)
>   on public.sitter_profiles to authenticated;
> grant update (acknowledged_at) on public.safety_checks to authenticated;
> grant update (read_at) on public.notifications to authenticated;
> ```
> `pets.species`는 생성 후 변경 불가 (grant에서 제외 — 종이 바뀌면 기존 task가 규칙을 어기게 됨). 예약 상태·`booking_slots`는 RPC와 트리거(security definer)로만 바뀝니다.

> "✗ (FastAPI)" 테이블은 service role로만 씀 → `backend/README.md`에 목록 (DoD 3): `media`, `daily_reports`(insert/upsert), `safety_checks`(insert), 조회용 전체. service role은 RLS를 우회하므로 FastAPI `services/authz.py`가 `assert_on_duty_for(pet_id)`를 먼저 호출.

---

## 2.8 공통 함수·트리거 (`003_functions_triggers.sql`)

맨 위: `create type care_slot as enum ('morning','afternoon','overnight');` (001에서 필요하므로 실제로는 **001 맨 위**에 둔다).

### 가입 · 케어

| 이름 | 종류 | 동작 |
| :--- | :--- | :--- |
| `handle_new_user()` | trigger `after insert on auth.users` | `raw_user_meta_data->>'role'`(없으면 `owner`), `display_name`(없으면 email 앞부분)으로 `profiles` insert → role이 owner면 `owner_profiles(id)`, sitter면 `sitter_profiles(id)` 빈 행 insert |
| `guard_care_task_species()` | trigger `before insert or update of type, pet_id on care_tasks` | pet의 species를 읽어 `walk`+`cat` 또는 `litter`+`dog`이면 exception `'task_type_not_allowed_for_species'` |

### 스케줄 · 예약

| 이름 | 종류 | 동작 |
| :--- | :--- | :--- |
| `sitter_remaining(p_sitter uuid, p_day date, p_slot care_slot)` | function stable | §2.1 "칸별 남은 자리" 계산. 음수면 0 |
| `get_sitter_schedule(p_sitter uuid, p_from date, p_to date)` | RPC security definer | 견주가 **특정 시터(단골)의 스케줄**을 볼 때. 날짜 × 칸마다 `{day, slot, state: 'open'\|'full'\|'blocked'\|'closed', remaining}` 반환. 다른 견주의 예약 내용은 노출 안 함 (남은 자리 수만) |
| `list_my_sitters()` | RPC security definer | 호출자 owner가 **확정 예약을 한 적 있는 시터** 목록 (최근 순, 예약 횟수). 앱의 "Your sitters" = 단골 |
| `search_sitters(p_slots jsonb, p_pet_count int)` | RPC security definer | `p_slots` = `[{day, slot}, …]` (여행 칸 목록). 시터마다 요청 칸 중 `sitter_remaining >= p_pet_count`인 칸 수 계산 → `{sitter_id, display_name, bio, service_area, experience_years, is_my_sitter, covered_slots, total_slots}`. **정렬: ① 전체 가능 + 단골 ② 전체 가능 ③ 일부 가능**(견주가 나눠 맡기기를 고를 때 참고용). 0칸 가능 시터는 제외 |
| `request_booking(p_sitter uuid, p_slots jsonb, p_pets uuid[], p_note text, p_rebooked_from uuid default null)` | RPC security definer | 호출자가 모든 pet의 owner, `p_sitter`가 sitter, 모든 칸 `sitter_remaining >= cardinality(p_pets)` 확인 → 실패 시 `'not_owner'` / `'not_a_sitter'` / `'sitter_unavailable'`(어느 칸인지 detail에). bookings(requested, start/end = 최소~최대일) + booking_slots(pet × 칸) insert. 유니크 위반 → `'pet_already_booked'`. 시터에게 `booking_requested` |
| `respond_booking(p_booking uuid, p_accept boolean, p_note text)` | RPC security definer | 호출자 = 해당 시터, status=`requested`. 수락: `pg_advisory_xact_lock(hashtext(sitter_id::text))`로 같은 시터 동시 수락 직렬화 → 모든 칸 자리 재확인 → 부족하면 `'sitter_unavailable'` → 충분하면 `confirmed` + 견주 `booking_confirmed`. 거절: `declined` + 견주 `booking_declined` |
| `cancel_booking(p_booking uuid, p_reason text)` | RPC security definer | 호출자 = 견주 또는 시터, status in (`requested`,`confirmed`) → `cancelled`, `cancelled_by`·`cancel_reason` 기록 → 상대방에게 `booking_cancelled` ("Mina can't take Bori and Mochi on Oct 5–8. Find a new sitter.") |
| `sync_booking_slots_active()` | trigger `after update of status on bookings` | status가 `declined`/`cancelled`가 되면 그 예약의 `booking_slots.active = false` (자리·유니크 해제) |
| `guard_availability_change()` | trigger `before insert or update or delete on sitter_availability` | (1) `blocked` 추가/변경이 그 시터의 confirmed 칸과 겹치면 `'overlaps_confirmed_booking'` (+ 겹치는 booking id 목록) (2) `open`을 줄이거나 지우거나 `max_pets`를 낮춰서 이미 확정된 마리 수보다 정원이 작아지는 칸이 생기면 같은 에러. → 시터는 **먼저 해당 예약을 취소**해야 함 (그래야 견주가 알림을 받음) |

### 기타

| 이름 | 종류 | 동작 |
| :--- | :--- | :--- |
| Realtime | DDL | `alter publication supabase_realtime add table public.notifications;` |

> 기능별 RPC(`ensure_today_task_logs`, `complete_task_log`, `send_daily_report`)와 알림 트리거는 **해당 Phase가 자기 migration에 추가**합니다. 예약 화면은 [Phase 03B](phase-03b.md).
>
> **알림 원칙 (D24):** 시터가 스케줄을 열거나 바꿔도 견주에게 알림은 없다. 견주는 필요할 때 직접 스케줄을 본다. 견주 알림은 ① 예약 결과(수락·거절·취소) ② **맡긴 동안의 케어 소식**(사진, 할 일 완료, 알림장, 세이프티 경고)뿐.

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
   - **예약 (시나리오 A–G)**
     - A: 단골 Mina 스케줄 조회 → 여행 전 칸 `open` → 요청·수락 → confirmed + 견주 알림 1건
     - B: 정원 3 칸에 3마리 확정 후 4번째 요청 수락 → `sitter_unavailable`, 스케줄에 `full`
     - C: 시터가 확정 칸과 겹치게 blocked insert → `overlaps_confirmed_booking`
     - C: `cancel_booking` → 모든 booking_slots `active=false`, 견주 `booking_cancelled` 1건 → 같은 칸으로 다른 시터에게 `request_booking(p_rebooked_from)` → 성공
     - D: 오전 Mina · 오후 Jun 예약 2건 (같은 pet·같은 날) → 둘 다 성공 / 같은 칸 두 번째 요청 → `pet_already_booked`
     - E: 오전 Mina, 오후 Jun이 각자 `daily_reports` 작성 → 2행 성공 (유니크 = pet·날짜·시터)
     - F: 시터가 open 구간 insert → 견주 알림 0건
     - G: 두 요청이 마지막 1자리 경쟁 → 먼저 수락한 것만 confirmed
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
| A | Mina가 10월을 모든 칸 open, 정원 3. Jisoo가 10/5 오전 → 10/8 오후 여행. 앱의 "Your sitters"에서 Mina(전에 맡긴 적 있음) 스케줄 확인 → 전부 open → 요청 → Mina 수락 | `sitter_availability` open 1행. booking 1건 + booking_slots 2마리 × 11칸 = 22행 | Jisoo에게 "Mina confirmed your booking" 알림 1건 |
| B | Hana가 Coco를 10/6–10/7 종일 Mina에게 맡김 (수락). 다른 견주가 10/6 오전 1마리로 Mina 스케줄 확인 | 10/6 오전 Mina 사용 3 (Bori·Mochi·Coco) → 남은 자리 0 | 그 칸이 "Full" — 예약 불가 |
| C | 10/1에 Mina가 10/7 개인 일정이 생김 → 캘린더에서 10/7 block 시도 | `guard_availability_change` → `overlaps_confirmed_booking` (Jisoo·Hana 예약) | 앱: "This overlaps 2 bookings. Cancel them?" → Mina가 취소 → Jisoo·Hana에게 각각 취소 알림 → 그다음 block 저장 |
| C′ | Jisoo가 취소 알림 → **Find a new sitter** (같은 반려동물·칸으로 재검색) | `search_sitters` → Jun 전체 가능, Sora는 10/5–10/6만 | Jisoo가 **결정**: Jun 한 명에게 전체 맡김 (보통) — 또는 원하면 나눠서 요청. 새 예약 `rebooked_from` = 취소된 예약 |
| D | Hana가 출근하는 날 Coco를 오전 Mina, 오후 Jun에게 맡김 | booking 2건. Coco의 10/10 morning(Mina), afternoon(Jun) | 둘 다 성공. 같은 칸에 두 번 요청하면 `pet_already_booked` |
| E | D의 저녁 | Mina는 오전 끝에, Jun은 오후 끝에 각자 알림장 작성 | Hana는 그날 알림장 2개 수신 |
| F | Jun이 11월을 새로 open | `sitter_availability` insert | 견주 알림 없음 — 견주는 필요할 때 스케줄을 직접 봄 |
| G | 두 견주 요청이 Mina의 10/5 오전 마지막 1자리를 두고 경쟁 | 요청은 자리를 안 차지. 수락 시 advisory lock + 재확인 | 먼저 수락한 쪽만 confirmed. 두 번째 수락은 `sitter_unavailable` |

**맡긴 동안 견주가 받는 알림 (Phase 05–08):** Mina가 사진 게시 → "New photo of Bori 📸" · 08:00 feeding 완료 → "Bori had breakfast on time 🍽️" · 21:00 sleep 완료 → "Bori is asleep 😴" · 담당 칸 끝 알림장 → "Today's report for Bori is here 📝" · 세이프티 DANGER → 경고.

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
