# Phase 03B — 근무일 & 기간 예약 (Bookings)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D24, 라우트 맵 §3, 알림 §7
> 스키마·RPC 정본: [phase-02.md §근무일·예약](phase-02.md#시터-근무일--예약-d24)

## Goal

시터가 **근무 가능일을 열고**(하루 또는 기간), 쉬고 싶은 날은 **막아둔다**. 견주는 **여행 기간과 반려동물을 골라 가능한 시터를 검색**하고 예약을 요청한다. 시터가 수락하면 **그 기간 동안만** 담당이 되고, 이후 Phase(피드·할 일·알림장·세이프티)는 모두 이 확정 예약을 기준으로 권한이 열린다. 시터가 확정 기간 중 하루를 막으면 견주가 **충돌 알림**을 받고 해결한다.

### Goal 달성 기준

- [ ] Sitter: 캘린더에서 10/1–10/31 open, 10/20 blocked 추가
- [ ] Owner: "Book a sitter" → 10/5–10/12, Bori + Mochi 선택 → 검색 결과에 해당 시터 표시 → 요청
- [ ] Sitter: 요청 알림 → Accept → 견주에게 confirmed 알림
- [ ] 예약 기간이 되면 Sitter Today에 Bori·Mochi 표시, 기간 전에는 "Upcoming" 섹션에만 표시
- [ ] 같은 기간으로 다른 견주가 검색하면 그 시터가 결과에서 빠짐 (예약이 차서 자동 불가)
- [ ] Sitter가 10/8을 blocked 추가 → 예약이 conflict → 견주 알림 + 예약 상세에 "Find another sitter" (취소 후 재검색)

---

## 선행 조건

- [Phase 02](phase-02.md) `sitter_availability`, `bookings`, `booking_pets`, 예약 RPC, 충돌 트리거
- [Phase 03](phase-03.md) 로그인·역할 탭·pet 프로필

---

## 범위

| 포함 (P0) | 제외 (P1 — Phase 11) |
| :--- | :--- |
| 시터 근무일 캘린더 (open / blocked, 하루·기간) | 반복 근무 패턴 (매주 월–금 등) |
| 견주 기간 검색 (**기간 전체 가능한 시터만**) + 요청 | 일부 구간만 가능한 시터 표시 ("Available Oct 5–7 only") |
| 시터 요청함: 수락 / 거절 | 가격·결제·리뷰 |
| 예약 목록·상세 (양쪽), 취소 | 원탭 **시터 교체** / **날짜 변경** RPC (`reassign_booking`, `reschedule_booking`) |
| 충돌 배너 + "Find another sitter" = 취소 → 같은 기간으로 재검색 | 시터가 같은 날 여러 예약 동시 수용 |

---

## 화면

| Route | 역할 | 화면 | 주 액션 |
| :--- | :--- | :--- | :--- |
| `/(sitter)/availability` | sitter | 월 캘린더. 날짜 탭 또는 드래그로 기간 선택 → "Open" / "Block" 시트. open=초록, blocked=회색 빗금, booked=진한 초록 + 반려동물 이름 | **Save** |
| `/(sitter)/bookings` | sitter | 탭: Requests · Upcoming · Past. Request 카드: 견주 이름, 기간, 반려동물(🐶/🐱), 메모 | **Accept** |
| `/(owner)/bookings` | owner | 내 예약 목록 (상태 뱃지: Requested · Confirmed · Needs attention · Cancelled) + 상단 **Book a sitter** | **Book a sitter** |
| `/(owner)/bookings/new` | owner | ① 날짜 범위 선택 ② 반려동물 체크 ③ 검색 결과 카드(이름·소개·지역·경력) ④ 메모(선택) → 요청 | **Request booking** |
| `/(owner)/bookings/[bookingId]` | owner | 기간·시터·반려동물·상태 타임라인. `conflict`면 빨간 배너 "{Sitter} can't cover Oct 8" + **Find another sitter** | 상태별 1개 |

- 탭 구성: owner `Home · Feed · Care · Reports` + Home 상단 "Next booking" 카드 → `/(owner)/bookings`. sitter는 `Today` 상단에 "Requests (2)" 배지 → `/(sitter)/bookings`, 헤더 메뉴에 **Availability**.
- 날짜 표시는 종료일 포함 ("Oct 5 – Oct 12"), 저장은 `[start, end+1)` (phase-02 날짜 규칙).
- 견주 텍스트 입력 허용(메모). 시터는 수락/거절에 **텍스트 필수 아님** (거절 사유는 선택 1줄).

---

## 작업 상세

| ID | 작업 | 상세 | DoD |
| :--- | :--- | :--- | :--- |
| 3B.1 | 시터 근무일 캘린더 | `/(sitter)/availability`. 월 이동, 기간 선택 → `sitter_availability` insert (kind open/blocked). 기존 구간 탭 → 삭제. 확정 예약이 있는 open 구간 삭제 시 `window_has_bookings` → "You have a booking on these dates. Block the days instead so the owner is notified." | open/blocked 저장·삭제 |
| 3B.2 | 견주 검색 + 요청 | `/(owner)/bookings/new`: `rpc('search_available_sitters', {p_start, p_end})` → 카드 목록. 결과 없음 → "No sitters are free for all of these dates. Try shorter dates." 요청 → `rpc('request_booking', …)`. `pet_already_booked` → "{name} already has a booking on these dates." | 요청 생성 + 시터 알림 |
| 3B.3 | 시터 요청함 | `/(sitter)/bookings` Requests 탭 → `rpc('respond_booking', {p_accept})`. 수락 실패 `sitter_unavailable` → "These dates are no longer free." | 수락/거절 + 견주 알림 |
| 3B.4 | 예약 목록·상세 | owner/sitter 목록 + owner 상세. 취소 → `rpc('cancel_booking')` (확인 다이얼로그) | 취소 + 상대방 알림 |
| 3B.5 | 충돌 처리 (P0 버전) | owner 상세 `conflict` 배너 → **Find another sitter**: 확인 → `cancel_booking` → `/(owner)/bookings/new?start=…&end=…&pets=…` 로 같은 조건 재검색. 알림 탭 → 이 화면 | 충돌 → 재예약 흐름 |
| 3B.6 | Sitter Today 연동 | `/(sitter)/index.tsx`: **Today** = `is_on_duty_for` pet 목록, **Upcoming** = 확정됐지만 시작 전 예약. 둘 다 없으면 "No bookings yet — open your availability so owners can find you." + Availability 버튼 | 기간에 따라 표시 전환 |

---

## Definition of Done (DoD)

1. Goal 달성 기준 6개 수동 시나리오 통과 (시터 1 + 견주 2 계정)
2. phase-02 `rls_smoke.sql` 예약 항목 통과 상태 유지
3. 모든 예약 에러 코드(`sitter_unavailable`, `pet_already_booked`, `window_has_bookings`, `not_owner`, `not_a_sitter`)가 사람 문구로 표시
4. 알림 5종(`booking_requested`, `booking_confirmed`, `booking_declined`, `booking_cancelled`, `booking_conflict`) 탭 시 올바른 화면으로 이동

---

## 산출물

- `frontend/app/(sitter)/availability.tsx`, `frontend/app/(sitter)/bookings.tsx`
- `frontend/app/(owner)/bookings/index.tsx`, `new.tsx`, `[bookingId].tsx`
- `frontend/components/DateRangePicker.tsx`, `BookingCard.tsx`, `SitterResultCard.tsx`
- `frontend/lib/bookings.ts` (RPC 래퍼 + 날짜 `[start, end+1)` 변환)

---

## 다음 Phase

→ [Phase 04 — Cloudinary](phase-04.md) (업로드 서명은 `is_on_duty_for` 기준)
