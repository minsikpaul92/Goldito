# Phase 03B — 시터 스케줄 & 예약 (Bookings)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D24, 라우트 맵 §3, 알림 §7
> 스키마·RPC·예시 시나리오 정본: [phase-02.md §시터 스케줄·예약](phase-02.md#시터-스케줄--예약-d24)

## Goal

**파트타임 시터**가 자기 집에서 돌볼 수 있는 날짜와 **칸(오전·오후·밤)**을 열고, 칸마다 몇 마리까지 받을지 정한다. 쉬는 날은 막아둔다. 견주는 여행이 생기면 **단골 시터의 스케줄을 먼저 확인**하고, 안 되면 **여행 전체를 맡을 수 있는 시터를 검색**해 예약을 요청한다. 시터가 수락하면 그 칸 동안만 담당이 된다. 시터가 일정이 생기면 **예약을 취소**하고, 견주는 알림을 받아 **다시 예약한다** — 한 명에게 맡길지 나눠 맡길지는 견주가 정한다.

### Goal 달성 기준 (phase-02 시나리오와 같은 인물)

- [ ] Mina: 캘린더에서 10월 전체 open(모든 칸, 정원 3)
- [ ] Jisoo: Home → **Book care** → 10/5 오전 ~ 10/8 오후, Bori + Mochi → "Your sitters"에 Mina(전체 가능) → 요청 → Mina 수락 → Jisoo에게 수락 알림
- [ ] Hana: Coco 10/6–10/7 Mina 예약 → 다른 견주가 Mina 스케줄을 보면 10/6–10/7이 "Full"
- [ ] Mina: 10/7 block 시도 → "This overlaps 2 bookings" → 취소 → Jisoo·Hana에게 취소 알림 → block 저장
- [ ] Jisoo: 취소 알림 → **Find a new sitter** → 같은 조건 검색 → Jun "Available for your whole trip" 맨 위 → Jun에게 요청
- [ ] Hana: Coco를 10/10 오전 Mina · 오후 Jun으로 나눠 예약 (견주가 직접 고른 경우)
- [ ] Jun이 11월을 open해도 견주 알림 없음

---

## 선행 조건

- [Phase 02](phase-02.md) `sitter_availability`, `bookings`, `booking_slots`, 스케줄·예약 RPC, 겹침 가드
- [Phase 03](phase-03.md) 로그인·역할 탭·pet 프로필

---

## 범위

| 포함 (P0) | 제외 (P1 — Phase 11) |
| :--- | :--- |
| 시터 스케줄 캘린더 (날짜 × 칸 open + 정원 / blocked) | 반복 근무 패턴 (매주 토·일 등) |
| 견주: 단골 시터 스케줄 보기 + 여행 전체 가능 시터 검색 + 요청 | 즐겨찾기(별표) 시터 — P0 단골 = 예약한 적 있는 시터 |
| 시터 요청함: 수락 / 거절 | 가격·결제·리뷰 |
| 예약 목록·상세 (양쪽), 취소 (양쪽) | 방문 돌봄 (시터가 견주 집으로) |
| 취소된 예약 → **Find a new sitter** (같은 조건 재검색, `rebooked_from` 연결) | 인수인계(드롭오프·픽업) 체크리스트 |
| 견주가 원하면 칸을 나눠 여러 시터에게 요청 | |

---

## 화면

| Route | 역할 | 화면 | 주 액션 |
| :--- | :--- | :--- | :--- |
| `/(sitter)/schedule` | sitter | 월 캘린더, 날짜마다 칸 3개(M·A·N). 날짜·기간 선택 → 시트: **Open** (칸 체크, 정원 스테퍼 — 기본 `default_max_pets`) / **Block** (칸 체크). 칸 표시: open "1/3", full, blocked. 확정 예약과 겹치는 block → "This overlaps Jisoo's booking (Oct 5–8). Cancel that booking?" | **Save** |
| `/(sitter)/bookings` | sitter | 탭: Requests · Upcoming · Past. Request 카드: 견주 이름, 기간·칸 요약("Oct 5 morning → Oct 8 afternoon"), 반려동물(🐶/🐱), 메모 | **Accept** |
| `/(owner)/bookings` | owner | 내 예약 목록. 상태 뱃지: Requested · Confirmed · **Cancelled — find a new sitter** · Declined. 상단 **Book care** | **Book care** |
| `/(owner)/bookings/new` | owner | ① 맡기는 시작(날짜 + 칸)·찾는 끝(날짜 + 칸) ② 반려동물 체크 ③ **Your sitters** (단골: 스케줄 미니 캘린더 + "Available for your whole trip" / "Not available Oct 7") ④ 단골이 안 되면 **Find other sitters** (검색 결과: 전체 가능 먼저) ⑤ 메모(선택) → 요청 | **Request booking** |
| `/(owner)/sitters/[sitterId]` | owner | 시터 소개(bio·지역·경력·집 환경) + 월 스케줄 (칸별 open/full/closed만 — 다른 견주 정보 없음) | **Book this sitter** |
| `/(owner)/bookings/[bookingId]` | owner | 시터·반려동물·기간·칸·상태. `cancelled`면 취소 사유 + **Find a new sitter** | 상태별 1개 |

- 진입점: owner Home 상단 "Next booking" 카드 / 예약 없으면 **Book care**. sitter `Today` 상단 "Requests (2)" 배지 → `/(sitter)/bookings`, 헤더 메뉴 **Schedule**.
- **나눠 맡기기** (견주가 고를 때만): 검색 결과의 "일부 가능" 카드에 "Covers Oct 5–6 only" 표시 → 카드에서 칸 선택 후 요청 → 남은 칸은 "Oct 7–8 still needs a sitter" 안내. 기본 흐름이 아니라 **Other options** 접힘 영역에 둔다.
- 견주 텍스트 입력 허용(메모). 시터는 수락/거절에 **텍스트 필수 아님** (거절·취소 사유는 선택 1줄).

---

## 작업 상세

| ID | 작업 | 상세 | DoD |
| :--- | :--- | :--- | :--- |
| 3B.1 | 시터 스케줄 캘린더 | `/(sitter)/schedule`. `sitter_availability` insert/update/delete (open + slots + max_pets / blocked + slots). `overlaps_confirmed_booking` → 겹치는 예약 목록 다이얼로그 → 예약별 **Cancel booking** → 전부 취소되면 block 재시도 | open/blocked/정원 저장, 겹침 시 취소 흐름 |
| 3B.2 | 단골 시터 + 스케줄 보기 | `rpc('list_my_sitters')` → "Your sitters" 카드. `/(owner)/sitters/[id]` → `rpc('get_sitter_schedule', {p_from, p_to})` 월 캘린더 | 단골 스케줄 표시 |
| 3B.3 | 예약 만들기 | `/(owner)/bookings/new`: 여행 칸 목록 생성(`lib/bookings.ts: expandTrip(start, startSlot, end, endSlot)`) → 단골마다 `get_sitter_schedule`로 전체 가능 여부 → 없으면 `rpc('search_sitters', {p_slots, p_pet_count})`. 요청 → `rpc('request_booking', …)`. `pet_already_booked` → "{name} already has a sitter on {day} {slot}." 결과 없음 → "No sitters are free for this whole trip. See other options." | 요청 생성 + 시터 알림 |
| 3B.4 | 시터 요청함 | `/(sitter)/bookings` → `rpc('respond_booking', {p_accept})`. `sitter_unavailable` → "You no longer have room on {day} {slot}." | 수락/거절 + 견주 알림 |
| 3B.5 | 예약 목록·상세·취소 | owner/sitter 목록 + 상세. 취소 → `rpc('cancel_booking', {p_reason})` (확인 다이얼로그) | 취소 + 상대방 알림 |
| 3B.6 | 다시 예약 | 알림 `booking_cancelled` 탭 → 예약 상세 → **Find a new sitter** → `/(owner)/bookings/new?rebook=<id>` (같은 반려동물·칸 자동 입력) → 요청 시 `p_rebooked_from` | 취소 → 재예약 흐름 |
| 3B.7 | Sitter Today 연동 | `/(sitter)/index.tsx`: **Today** = 지금 칸에 맡은 반려동물 (견주별로 묶음, 여러 집 가능) + 오늘 다른 칸 예정, **Upcoming** = 앞으로의 확정 예약. 없으면 "No bookings yet — open your schedule so owners can find you." + Schedule 버튼 | 칸에 따라 표시 전환 |

---

## Definition of Done (DoD)

1. Goal 달성 기준 7개 수동 시나리오 통과 (시터 2 + 견주 2 계정)
2. phase-02 `rls_smoke.sql` 예약 시나리오 A–G 통과 상태 유지
3. 모든 예약 에러 코드(`sitter_unavailable`, `pet_already_booked`, `overlaps_confirmed_booking`, `not_owner`, `not_a_sitter`)가 사람 문구로 표시
4. 예약 알림 4종(`booking_requested` → 시터, `booking_confirmed` / `booking_declined` → 견주, `booking_cancelled` → 상대방) 탭 시 올바른 화면으로 이동. 스케줄 변경으로는 알림이 생기지 않음

---

## 산출물

- `frontend/app/(sitter)/schedule.tsx`, `frontend/app/(sitter)/bookings.tsx`
- `frontend/app/(owner)/bookings/index.tsx`, `new.tsx`, `[bookingId].tsx`, `frontend/app/(owner)/sitters/[sitterId].tsx`
- `frontend/components/SlotCalendar.tsx`, `TripPicker.tsx`, `BookingCard.tsx`, `SitterCard.tsx`
- `frontend/lib/bookings.ts` (RPC 래퍼 + `expandTrip` 칸 펼치기)

---

## 다음 Phase

→ [Phase 04 — Cloudinary](phase-04.md) (업로드 서명은 `is_on_duty_for` 기준)
