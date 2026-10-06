# Phase 03C — 견적 · 동의서 · 데모 결제 · 조건부 보안 해제 (Stage 3 Booking)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — **D29 견적**, **D30 동의서·데모 결제**, **D31 조건부 보안 해제**, 알림 §7
> 제품 흐름: [full-process.ko.md — Stage 3](../full-process.ko.md#stage-3--booking-예약-확정--목표-캐나다-맞춤-안전-동의서--조건부-보안-해제)

## Goal

시터가 요청을 수락하면 견주는 **Checkout** 한 흐름에서 **견적 확인 → 서비스·이동 방식에 맞춘 동의서 서명 → 데모 결제**를 끝낸다. 결제 후 정보는 **조건부로** 열린다: 보딩이면 **시터 집 주소·Visitor parking·로비 안내·짐 체크리스트**가 결제 즉시 견주에게, **견주 집 출입 정보**(lockbox·buzzer·fob·출입 순서)는 그 집에서 하는 인수인계(또는 house sitting 시작) **2시간 전부터** 시터 앱에서만 열리고 끝나면 다시 잠긴다. 가격은 서버가 계산하고 AI 문의 답변(07B)도 같은 함수를 쓴다.

### Goal 달성 기준 (phase-02·03B와 같은 인물)

- [ ] Lucy 요금표: Boarding $55/night · House sitting $70/night · Daycare $35/day · 추가 반려동물 +50% · 공휴일 +25% (CAD)
- [ ] `quote_booking(Lucy, boarding, 10/9 07:30, 10/12 17:00, 2)` → 3 nights · base $165.00 · extra pet $82.50 · holiday (Oct 12 Thanksgiving) $20.63 · **total $268.13 CAD** — 같은 숫자가 Checkout과 07B 답변 카드에
- [ ] 예약(보딩, 맡기기 = **Sitter drives**, 찾기 = **Owner drives**) Checkout에 필요한 동의서 = `emergency_vet` · `cohabitation` · `handoff_rules` · `home_access` · `safe_return` — 하나라도 빠지면 Pay 비활성 + `consents_missing`
- [ ] **Pay $268.13 (demo)** → `paid_at` 저장 → Lucy `booking_paid` 알림 → Chloe 예약 상세에 Lucy 집 주소 · Visitor parking · 로비 안내 · **Pack for Max & Mochi** 체크리스트
- [ ] 결제 전에는 Chloe에게 Lucy 주소가, Lucy에게 Chloe 주소가 어디에도 안 보임
- [ ] Lucy 예약 상세(10/7): 출입 카드 "🔒 Unlocks Oct 9, 5:30 AM (2 h before pick-up)" → 10/9 05:30 이후 **Show code** → buzzer·lockbox·출입 순서 → Chloe `access_unlocked` 알림 1회 → 맡기기 완료 후에도 예약 종료(찾기 완료)까지 열림 → 종료 후 `access_locked`
- [ ] Paul(다른 시터)은 언제든 Chloe 출입 정보 요청 시 `forbidden`

---

## 선행 조건

- [Phase 03B](phase-03b.md) 예약·수락·인수인계(장소 = 이동 방식, D28) · `service_type`
- [Phase 03](phase-03.md) 역할별 프로필 (`owner_profiles.home_address`, `sitter_profiles.home_address`)

---

## 범위

| 포함 (P0) | 제외 (해커톤 후) |
| :--- | :--- |
| 시터 요금표 + 온타리오 법정 공휴일 + `quote_booking` | 세금(HST)·쿠폰·환불·취소 수수료 |
| 동의서 5종 고정 영문 템플릿(버전) + 이름 서명 | 법률 검토된 동의서, 전자서명 인증(DocuSign 등) |
| **데모 결제** (`pay_booking_demo` — 카드 정보 없음) | 실결제(Stripe), 정산 |
| 시터 집 정보(Visitor parking·로비·짐 체크리스트) 결제 후 공개 | 주소 자동완성·지도 링크 |
| 견주 집 출입 정보 + 2시간 전 해제 + 열람 기록·알림 | 출입 코드 암호화 저장(pgsodium) — P0는 RLS + RPC로만 접근 |

---

## 화면

| Route | 역할 | 화면 | 주 액션 |
| :--- | :--- | :--- | :--- |
| `/owner/bookings/[bookingId]/checkout` | owner | ① **QuoteCard**: "3 nights × $55 · Extra pet +$82.50 · Thanksgiving (Oct 12) +$20.63 · **Total $268.13 CAD**" ② **Consents** — 카드마다 요약 3줄 + **Read full text** + 체크 ③ 이름 입력(서명) ④ **Pay $268.13 (demo)** + "Demo payment — no card needed" ⑤ 완료 → 예약 상세로 + 토스트 "You're all set ✅" | **Pay** |
| `/owner/bookings/[bookingId]` (03B 확장) | owner | 결제 후: **Lucy's place** 카드(주소 · Visitor parking · 로비 안내) + **Pack for Max & Mochi** 체크리스트(사료·방석·약·리드줄·화장실 모래 — 로컬 체크, 저장 안 함) | 상황별 1개 |
| `/owner/home-access` | owner | 출입 정보 폼: Entry steps · Lockbox code · Buzzer · Fob notes · Parking for sitter. 상단 안내 "Only shown to your booked sitter, starting 2 hours before they arrive. You'll be notified when it opens." | **Save** |
| `/sitter/bookings/[bookingId]` (03B 확장) | sitter | **EntryInfoCard** — 잠김: 🔒 "Unlocks Oct 9, 5:30 AM" / 열림: **Show code** 탭 → 코드 표시(10초 뒤 다시 가림). Sitter drives 인수인계 또는 house sitting일 때만 보임 | Show code |
| `/profile` (sitter 섹션 확장) | sitter | **Rates** (보딩·house sitting·데이케어·추가 반려동물 %·공휴일 %) · **Your place for owners** (Visitor parking · 로비 안내 · 짐 체크리스트 항목) | Save |

---

## 작업 상세

| ID | 작업 | 상세 | DoD |
| :--- | :--- | :--- | :--- |
| 3C.1 | 요금표 · 공휴일 · 견적 | `006_agreements.sql`: `sitter_rates(sitter_id PK → profiles, boarding_nightly numeric(8,2) null, house_sitting_nightly null, daycare_daily null, extra_pet_pct int default 50 check 0–200, holiday_pct int default 25 check 0–200, currency text default 'CAD', updated_at)` — null = 그 서비스 안 함 (03B `services`와 일치 검사). `holidays(day date PK, name text, region text default 'ON')` — 2026–2027 온타리오 법정 공휴일 시드 (Thanksgiving 2026-10-12 포함). `quote_booking(p_sitter, p_service, p_drop_off_at, p_pick_up_at, p_pet_count)` RPC (security definer, 읽기 전용): **nights** = 맡기기·찾기 로컬 날짜 차이(같은 날이면 0 → 데이케어 1일), base = 첫 반려동물 요금 × nights, extra = 요금 × extra_pet_pct × (pet_count − 1) × nights, holiday = 맡긴 구간이 걸치는 공휴일 날짜 수 × (요금 + 추가 반려동물 요금) × holiday_pct, 반올림 센트. 반환 `{service, nights, days, unit_price, base, extra_pets, holiday_days:[{day, name}], holiday_surcharge, total, currency, rate_version}`. 요금 없는 서비스 → `service_not_offered` | 단위 테스트(SQL smoke) 3건: 보딩 2마리 + 공휴일 / house sitting 1마리 / 데이케어 같은 날 |
| 3C.2 | 동의서 템플릿 + 서명 | `frontend/features/agreements/templates.ts` — 5종 `{kind, version, title, summary[3], body}` 영문 고정 + 화면 하단 "Demo template — not legal advice". 필요한 종류 = `requiredConsents(booking)` (아래 표). `booking_consents(id, booking_id → bookings cascade, kind, version, signer_id → profiles, signer_name text not null, details jsonb, signed_at)` · unique(booking_id, kind) · RLS: 견주 insert/select own booking, 시터 select. insert는 체크아웃 중에만 — confirmed · `paid_at` null · `required_consents`에 있는 종류 (009d). `emergency_vet.details = {limit_cad, vet_clinic_name}`(owner_profiles 값 기본), `safe_return.details = {receiver_name}` | 서명 후 다시 열면 읽기 전용 + 서명 시각 |
| 3C.3 | 데모 결제 | `pay_booking_demo(p_booking)` RPC: 호출자 = 견주, status `confirmed`, `paid_at is null`, `required_consents(p_booking)` 전부 서명(아니면 `consents_missing` + 목록) → `bookings.paid_at = now()`, `price_snapshot = quote_booking(...)`(최종 시각 기준) → 시터 `booking_paid`. 결제 후 인수인계 시각 변경(03B 3B.5)은 그대로 허용 — 금액 재계산은 해커톤 후 (화면에 "Price was set at checkout") | Pay 후 상태 뱃지 **Paid**, 같은 예약 재결제 `already_paid` |
| 3C.4 | 시터 집 정보 공개 시점 변경 | `sitter_profiles`에 `visitor_parking text`, `lobby_notes text`, `packing_list text[] default '{food,bed or cushion,medications,leash,favorite toy}'` 추가 (본인 RLS, 기존 column grant 규칙). `get_handoff_details` 조건을 **확정 → 결제(`paid_at is not null`)**로 바꾸고 `sitter_home`이면 위 3개 필드도 반환 (찾은 뒤 24시간까지 — 기존 규칙). 견주 집 주소(`owner_home`)도 결제 후에만 시터에게 | 결제 전 `not_paid` · 결제 후 반환 |
| 3C.5 | 견주 집 출입 정보 + 해제 | `owner_home_access(owner_id PK → profiles, entry_steps text, lockbox_code text, buzzer text, fob_notes text, sitter_parking text, updated_at)` — RLS: 본인만 select/insert/update (시터 정책 없음). `get_home_access(p_booking)` RPC: 호출자 = 그 예약 시터, `paid_at is not null`, 그 예약에 `owner_home` 인수인계가 있거나 `service_type='house_sitting'`, `now()`가 [첫 `owner_home` 인수인계(또는 맡기기) agreed 시각 − 2시간, 찾기 completed_at 또는 찾는 시각] 안 → 행 반환 + `access_reveals(booking_id, sitter_id, first_revealed_at)` 첫 회만 insert + 견주 `access_unlocked`. 밖이면 `access_locked` + detail `unlocks_at`/`locked_since`. 다른 사람 `forbidden` | rls_smoke 시나리오 I–K (아래) 통과 |
| 3C.6 | Checkout UI + 시터 잠금 카드 | 위 화면. `QuoteCard`(07B 답변에서도 재사용), `ConsentCard`, `EntryInfoCard`. Checkout 진입점: 예약 상세 배너 "Lucy accepted! Finish booking →" (confirmed & not paid) | 마우스만으로 Checkout 완주 (D25) |
| 3C.7 | 테스트 | `supabase/tests/rls_smoke.sql` 추가 시나리오 — **I** 결제 전 주소·출입 정보 비공개, **J** T−2h 전 `access_locked` → 후 반환 + reveal 1회 + 알림 1회, **K** 다른 시터·견주 본인 아닌 사람 `forbidden`, 예약 종료 후 다시 잠김. Playwright `flows`: Checkout(동의서 하나 빠지면 Pay 비활성) | CI 통과 |

### 필요한 동의서 규칙 (`required_consents` — SQL·프론트 같은 표)

| 조건 | 동의서 |
| :--- | :--- |
| 항상 | `emergency_vet` (24 h emergency vet care up to $limit) · `safe_return` (who may receive the pet) |
| `service_type = 'boarding'` | `handoff_rules` (drop-off/pick-up times + visitor parking rules) · `cohabitation` (may share space with other pets) |
| `service_type = 'house_sitting'` 또는 `owner_home` 인수인계가 있음 | `home_access` (lockbox/key use, condo buzzer/fob permission) |

---

## Definition of Done (DoD)

1. Goal 달성 기준 수동 시나리오 통과 (Chloe·Lucy·Paul)
2. `rls_smoke.sql` A–K 통과 (기존 A–H 유지)
3. 출입 정보가 RPC 응답 외에 어디에도 안 나감: 알림 본문·로그·FastAPI 프롬프트에 lockbox/buzzer 값 없음 (`grep` + 리뷰)
4. `quote_booking` 결과 = Checkout 표시 금액 = `price_snapshot` (같은 예약)
5. 모든 RPC 에러 코드(`service_not_offered`·`consents_missing`·`already_paid`·`not_paid`·`access_locked`)가 사람 문구로 표시 — [supabase/README.md](../../../supabase/README.md#rpc-errors)에 추가

---

## 산출물

- `supabase/migrations/006_agreements.sql` · `supabase/tests/rls_smoke.sql` (I–K)
- `frontend/app/owner/bookings/[bookingId]/checkout.tsx`, `frontend/app/owner/home-access.tsx`
- `frontend/components/QuoteCard.tsx`, `ConsentCard.tsx`, `EntryInfoCard.tsx`, `frontend/features/agreements/{templates.ts, agreementsApi.ts}`, `frontend/features/bookings/quote.ts`
- `docs` — supabase README RPC errors 표

---

## AI 프롬프트

Playbook §5B — (3C.1·3C.3–3C.5 SQL) / (3C.2·3C.6 UI) 두 번

---

## 다음 Phase

→ [Phase 04 — Cloudinary](phase-04.md)
