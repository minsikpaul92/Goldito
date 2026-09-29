# Phase 03B — 근무일 & 예약 (Bookings)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D24, 라우트 맵 §3, 알림 §7
> 스키마·RPC·예시 시나리오 정본: [phase-02.md §근무일·예약](phase-02.md#시터-근무일--예약-d24)

## Goal

**파트타임 시터**가 일할 수 있는 날을 열고(하루 또는 기간) **그날 몇 마리까지 받을지** 정한다. 쉬는 날은 막아둔다. 견주는 여행 날짜와 반려동물을 골라 시터를 검색하고, **한 시터가 전부 안 되면 날짜를 나눠 여러 시터에게** 요청한다. 시터가 수락하면 **그 날짜에만** 담당이 되고, 이후 Phase(피드·할 일·알림장·세이프티)는 "오늘 담당인가"를 기준으로 권한이 열린다. 시터가 확정된 날 중 하루를 막으면 **그날만 빠지고**, 견주는 알림을 받아 그날만 다른 시터에게 맡긴다.

### Goal 달성 기준 (phase-02 시나리오와 같은 인물)

- [ ] Mina: 캘린더에서 10/1–10/31 open(정원 3), 10/20 blocked
- [ ] Jisoo: 10/5–10/8, Bori + Mochi로 검색 → Mina "Free for all 4 days" → 요청 → Mina 수락
- [ ] Hana: 10/6–10/7 Coco 요청 → Mina 수락 → 10/6에 1마리로 검색하는 다른 견주에게 Mina가 안 보임 (정원 참)
- [ ] Jisoo: 10/12–10/19 검색 → Mina "Free Oct 12–15", Jun "Free Oct 16–19" → 두 시터에게 나눠 요청
- [ ] 예약일이 되면 Sitter Today에 그날 맡은 반려동물만 표시 (여러 집 반려동물이 함께 보일 수 있음), 앞으로의 예약은 Upcoming
- [ ] Mina가 10/7 blocked → Jisoo·Hana에게 "Mina can't cover Oct 7" 알림 → Jisoo가 예약 상세에서 **Find a sitter for Oct 7** → Jun에게 10/7만 요청

---

## 선행 조건

- [Phase 02](phase-02.md) `sitter_availability`, `bookings`, `booking_days`, 예약 RPC, 날짜 빠짐 트리거
- [Phase 03](phase-03.md) 로그인·역할 탭·pet 프로필

---

## 범위

| 포함 (P0) | 제외 (P1 — Phase 11) |
| :--- | :--- |
| 시터 근무일 캘린더 (open + 정원 / blocked, 하루·기간) | 반복 근무 패턴 (매주 토·일 등) |
| 견주 검색 — **일부 날짜만 가능한 시터도 표시** + 날짜 골라 요청 | 시간 단위 근무 (오전만 등) |
| 시터 요청함: 수락 / 거절 | 가격·결제·리뷰 |
| 예약 목록·상세 (양쪽), 예약 전체 취소 | 원탭 **날짜 변경** (`reschedule_booking`) |
| 빠진 날 배너 + "Find a sitter for {date}" = 그날만 재검색 | 시터가 일부 반려동물만 빼기 (그날 전체만 막을 수 있음) |

---

## 화면

| Route | 역할 | 화면 | 주 액션 |
| :--- | :--- | :--- | :--- |
| `/(sitter)/availability` | sitter | 월 캘린더. 날짜 탭 또는 드래그로 기간 선택 → 시트: **Open** (정원 스테퍼, 기본값 = `default_max_pets`) / **Block**. 칸 표시: open = 초록 + "2/3" (맡은 수/정원), full = 진한 초록, blocked = 회색 빗금 | **Save** |
| `/(sitter)/bookings` | sitter | 탭: Requests · Upcoming · Past. Request 카드: 견주 이름, 날짜 목록, 반려동물(🐶/🐱), 메모, 그날들 남은 자리 | **Accept** |
| `/(owner)/bookings` | owner | 내 예약 목록. 상태 뱃지: Requested · Confirmed · **Needs a sitter (Oct 7)** · Cancelled. 상단 **Book a sitter** | **Book a sitter** |
| `/(owner)/bookings/new` | owner | ① 날짜 범위 ② 반려동물 체크 ③ 결과: 전체 가능 시터 먼저, 그다음 "Free Oct 12–15 (4 of 8 days)" ④ 카드에서 날짜 선택(기본 = 가능한 날 전부) ⑤ 메모(선택) → 요청. 요청 후 "Oct 16–19 still needs a sitter" 안내 → 남은 날짜로 바로 재검색 | **Request booking** |
| `/(owner)/bookings/[bookingId]` | owner | 날짜 × 반려동물 표. 빠진 날은 빨간 칸 + 배너 "Mina can't cover Oct 7" + **Find a sitter for Oct 7** | 상태별 1개 |

- 진입점: owner Home 상단 "Next booking" 카드 → `/(owner)/bookings`. sitter `Today` 상단 "Requests (2)" 배지 → `/(sitter)/bookings`, 헤더 메뉴 **Availability**.
- **Coverage 바**: 검색·상세 화면 상단에 여행 날짜별로 담당 시터를 색으로 표시 (Mina / Jun / 비어 있음). 견주가 빈 날을 한눈에 봄.
- 날짜 표시는 종료일 포함 ("Oct 5 – Oct 12"), 저장은 날짜 배열 또는 `[start, end+1)` (phase-02 날짜 규칙).
- 견주 텍스트 입력 허용(메모). 시터는 수락/거절에 **텍스트 필수 아님** (거절 사유는 선택 1줄).

---

## 작업 상세

| ID | 작업 | 상세 | DoD |
| :--- | :--- | :--- | :--- |
| 3B.1 | 시터 근무일 캘린더 | `/(sitter)/availability`. 월 이동, 기간 선택 → `sitter_availability` insert (open + max_pets / blocked). 기존 구간 탭 → 정원 수정 또는 삭제. `window_has_bookings` → "You already have pets booked on these days. Block the days instead so owners can find another sitter." | open/blocked/정원 저장 |
| 3B.2 | 견주 검색 + 요청 | `/(owner)/bookings/new`: `rpc('search_available_sitters', {p_start, p_end, p_pet_count})` → 전체 가능 / 일부 가능 카드. 요청 → `rpc('request_booking', {p_sitter, p_days, p_pets})`. `pet_already_booked` → "{name} already has a sitter on {date}." 결과 없음 → "No sitters are free on these days yet." | 요청 생성 + 시터 알림 |
| 3B.3 | 시터 요청함 | `/(sitter)/bookings` Requests 탭 → `rpc('respond_booking', {p_accept})`. 수락 실패 `sitter_unavailable` → "You no longer have room on {date}." | 수락/거절 + 견주 알림 |
| 3B.4 | 예약 목록·상세 | owner/sitter 목록 + owner 상세(날짜 × 반려동물 표, Coverage 바). 취소 → `rpc('cancel_booking')` (확인 다이얼로그) | 취소 + 상대방 알림 |
| 3B.5 | 빠진 날 처리 | 알림 `booking_day_dropped` 탭 → 예약 상세. **Find a sitter for {date}** → `/(owner)/bookings/new?days=…&pets=…` 로 **빠진 날만** 재검색. 새 예약이 확정되면 Coverage 바가 채워짐 | 빠진 날 → 다른 시터로 채움 |
| 3B.6 | Sitter Today 연동 | `/(sitter)/index.tsx`: **Today** = 오늘 담당인 반려동물 (견주별로 묶어서, 여러 집 가능), **Upcoming** = 앞으로의 확정 예약. 둘 다 없으면 "No bookings yet — open your availability so owners can find you." + Availability 버튼 | 날짜에 따라 표시 전환 |

---

## Definition of Done (DoD)

1. Goal 달성 기준 6개 수동 시나리오 통과 (시터 2 + 견주 2 계정)
2. phase-02 `rls_smoke.sql` 예약 시나리오 A–G 통과 상태 유지
3. 모든 예약 에러 코드(`sitter_unavailable`, `pet_already_booked`, `window_has_bookings`, `not_owner`, `not_a_sitter`)가 사람 문구로 표시
4. 알림 5종(`booking_requested`, `booking_confirmed`, `booking_declined`, `booking_cancelled`, `booking_day_dropped`) 탭 시 올바른 화면으로 이동

---

## 산출물

- `frontend/app/(sitter)/availability.tsx`, `frontend/app/(sitter)/bookings.tsx`
- `frontend/app/(owner)/bookings/index.tsx`, `new.tsx`, `[bookingId].tsx`
- `frontend/components/DateRangePicker.tsx`, `CoverageBar.tsx`, `BookingCard.tsx`, `SitterResultCard.tsx`
- `frontend/lib/bookings.ts` (RPC 래퍼 + 날짜 변환)

---

## 다음 Phase

→ [Phase 04 — Cloudinary](phase-04.md) (업로드 서명은 `is_on_duty_for` 기준)
