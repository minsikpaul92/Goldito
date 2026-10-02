# Phase 03B — 시터 스케줄 · 서비스·이동 방식 · 예약 · Meet & Greet · 인수인계 (Bookings)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D24, **D28 서비스·이동 방식**, 라우트 맵 §3, 알림 §7
> 제품 흐름: [full-process.ko.md](../full-process.ko.md) Stage 2 (Meet & Greet · 이동 방식) · Stage 3 (예약). 문의 AI(Stage 1)는 [07B](phase-07b.md), 견적·동의서·결제·보안 해제는 [03C](phase-03c.md), 실시간 이동은 [06B](phase-06b.md)
> 스키마·RPC·예시 시나리오 정본: [phase-02.md §시터 스케줄·예약·인수인계](phase-02.md#시터-스케줄--예약--인수인계-d24)

## Goal

**파트타임 시터**가 자기 집에서 돌볼 수 있는 날짜와 **칸(Morning·Afternoon·Overnight)**을 열고, 칸마다 **자기 근무 시간**과 몇 마리까지 받을지 정한다. 쉬는 날은 막아둔다. 견주는 여행이 생기면 **단골 시터의 스케줄을 먼저 확인**하고, 안 되면 **여행 전체를 맡을 수 있는 시터를 검색**한다. 요청할 때 **맡기는 시각·찾는 시각·장소**를 정하고, 시터 시간 밖이거나 장소가 다르면 **앱 안에서 협의**한다. 확정 후에도 양쪽이 시각·장소 변경을 제안할 수 있다. 시터가 일정이 생기면 **예약을 취소**하고, 견주는 알림을 받아 **다시 예약한다** — 한 명에게 맡길지 나눠 맡길지는 견주가 정한다.

시나리오(D27·D28)에 맞춰 견주는 요청할 때 **서비스 방식**(**Boarding** — 시터 집 / **House sitting** — 시터가 내 집으로)을 고르고, 맡기기·찾기마다 **이동 방식**(**Owner drives** = 시터 집에서 / **Sitter drives** = 내 집에서 / Somewhere else)을 고른다 — DB는 기존 인수인계 장소 그대로. 확정 전후로 **Meet & Greet**(대면 / 영상)를 잡고 끝나면 Done(이미 만난 사이면 Skip).

### Goal 달성 기준 (phase-02 시나리오와 같은 인물)

- [ ] Mina: 스케줄에서 10월 전체 open — Morning 08:00–12:00, Afternoon 12:00–18:00, Overnight 18:00–08:00, 정원 3
- [ ] Jisoo: **Book care** → Bori + Mochi, 10/5 09:30 맡김 → 10/8 17:00 찾음, 장소 Mina's place → "Your sitters"에 Mina(전체 가능) → 요청 → 수락 → Jisoo 알림
- [ ] Mina: 10/5 09:35 **Received** → Jisoo에게 "Bori and Mochi arrived at Mina's 🏠"
- [ ] Jun: 11월 Morning 09:00–13:00 · Afternoon 13:00–17:00 open (Overnight 없음), 정원 2
- [ ] Jisoo: Bori를 Jun에게 07:00 맡기기 요청 → Jun 요청 카드에 "Custom drop-off — needs your OK" → Jun이 08:30 제안 → Jisoo가 08:00 역제안 → Jun이 08:30 재제안 → Jisoo 동의 → Jun 수락
- [ ] 확정 전 협의에서 한쪽이 Decline → 요청 종료 / 확정 후 변경 제안을 Decline → 기존 시간으로 예약 유지
- [ ] Jisoo: 확정 후 찾는 시각 20:00 + 장소 My place로 변경 제안 → Mina 동의 전까지 17:00 유지 → 동의 후 변경
- [ ] Mina: 10/7 block 시도 → "This overlaps 2 bookings" → 취소 → Jisoo·Hana에게 취소 알림 → **Find a new sitter** (같은 시각·장소로 재검색)
- [ ] Jun이 스케줄을 open해도 견주 알림 없음
- [ ] Jisoo: 10/9 07:30 → 10/12 17:00 Boarding 요청 — Drop-off **Sitter drives** ("Mina picks up at my place") · Pick-up **Owner drives** ("I pick up at Mina's") → Mina 요청 카드에 🚙 / 🚗 아이콘과 문구
- [ ] Jisoo: **House sitting** 선택 → 맡기기·찾기 장소가 My place로 고정 · house sitting을 제공하지 않는 시터(`services`에 없음)는 검색·단골 목록에 "Doesn't offer house sitting"
- [ ] Meet & Greet: Jisoo가 **Video call · Oct 6 7:00 PM** 제안 → Mina `meet_greet_proposed` → Accept → 양쪽 카드 "Meet & Greet · Video · Oct 6, 7:00 PM" → 이후 **Done** → 카드 ✅ (Skip도 가능, 확정에 필수 아님)

---

## 선행 조건

- [Phase 02](phase-02.md) `sitter_availability`, `bookings`, `booking_slots`, `booking_handoffs`, 스케줄·예약·인수인계 RPC, 겹침 가드
- [Phase 03](phase-03.md) 로그인·역할 탭·pet 프로필·역할별 프로필(주소)

---

## 범위

| 포함 (P0) | 제외 (P1 — Phase 11) |
| :--- | :--- |
| 시터 스케줄 (날짜 × 칸 open + **칸별 시간** + 정원 / blocked) | 반복 근무 패턴 (매주 토·일 등) |
| 견주: 단골 시터 스케줄 보기 + 여행 전체 가능 시터 검색 + 요청 | 즐겨찾기(별표) 시터 — P0 단골 = 예약한 적 있는 시터 |
| **맡기기·찾기 시각 + 장소** (시터 집 / 견주 집 / 기타 텍스트) | 지도·주소 자동완성, 이동 거리 |
| 시간 밖·장소 변경 **협의** — 제안 카드 주고받기(횟수 제한 없음, 선택 메모 1줄), 확정 전 거절 = 요청 종료, 확정 후 변경 제안 | 인앱 채팅 (P0는 제안 카드로만 협의) |
| 시터 **Received / Returned** 체크 → 견주 알림 | 견적·동의서·결제·보안 해제 → [03C](phase-03c.md), 리뷰 → [07C](phase-07c.md) |
| 시터 요청함: 수락 / 거절, 예약 목록·상세·취소 (양쪽) | 실시간 이동·지도·도착 알림 → [06B](phase-06b.md) |
| 취소 → **Find a new sitter** (같은 조건 재검색, `rebooked_from`) | 문의 스레드·AI 답 → [07B](phase-07b.md) |
| **서비스 방식** Boarding / House sitting (D28) + 시터 제공 서비스 `services` | Drop-in(짧은 방문) 전용 정원 — house sitting도 칸 정원으로 계산 (해커톤 후) |
| **이동 방식** 라벨 (Owner drives / Sitter drives = 인수인계 장소) | |
| **Meet & Greet** 제안·수락·Done/Skip (대면 / 영상) | 영상 통화 자체 (링크는 각자 — P0는 시각·방식만) |
| 탭 변경 (3B.0) — owner **Bookings** 탭, sitter **Bookings** 탭 (Scan은 Today 버튼으로) | |

---

## 화면

| Route | 역할 | 화면 | 주 액션 |
| :--- | :--- | :--- | :--- |
| `/sitter/schedule` | sitter | 월 캘린더, 날짜마다 칸 3개(M·A·N). 날짜·기간 선택 → 시트: **Open** (칸별 체크 + 시간 2개 — 기본 `default_hours`, 정원 스테퍼) / **Block** (칸 체크). 칸 표시: "08–12 · 1/3", Full, Blocked. 겹치는 block·정원 축소 → "This overlaps Jisoo's booking (Oct 5–8). Cancel that booking?" | **Save** |
| `/sitter/bookings` | sitter | 탭: Requests · Upcoming · Past. Request 카드: 견주, 반려동물(🐶/🐱 — `get_booking_pets`), **Drop-off Oct 5 09:30 · Mina's place**, **Pick-up Oct 8 17:00 · Mina's place**. 카드 탭 → 반려동물 프로필·알러지·케어 일정(요청 받은 시터는 조회 가능). 시간 밖이면 주황 뱃지 "Custom time — needs your OK" + **Suggest another time** | **Accept** |
| `/sitter/bookings/[bookingId]` | sitter | 인수인계 카드 2개(시각·장소·주소) + 변경 제안 대기 배너. 맡기는 시각 2시간 전부터 **Received**, 그 뒤 **Returned** 큰 버튼 | 상황별 1개 |
| `/owner/bookings` | owner | 내 예약 목록. 뱃지: Requested · **Time suggested by Mina** · Confirmed · Cancelled — find a new sitter · Declined. 상단 **Book care** | **Book care** |
| `/owner/bookings/new` | owner | ⓪ **Service**: Boarding at the sitter's / House sitting at my place ① 반려동물 체크 ② **Drop-off**: 날짜 + 시각 + 이동 방식(장소) ③ **Pick-up**: 날짜 + 시각 + 이동 방식(장소) ④ **Your sitters** (단골: 미니 스케줄 + "Available for your whole trip" / "Drop-off 07:00 is before Jun's hours — you can still ask") ⑤ 없으면 **Find other sitters** ⑥ 메모(선택) → 요청 | **Request booking** |
| `/owner/sitters/[sitterId]` | owner | 시터 소개(bio·지역·경력·집 환경) + 월 스케줄 (칸별 시간·open/full/closed — 다른 견주 정보 없음) | **Book this sitter** |
| `/owner/bookings/[bookingId]` | owner | 반려동물·인수인계 카드 2개(확정 후 ~ 찾은 뒤 24시간 주소 표시) · **Change time or place** (맡긴 뒤 일찍 데려가기도 여기서) · 시터 제안이 오면 **Accept / Decline** · 맡기기 전에만 **Cancel** · `cancelled`면 사유 + **Find a new sitter** | 상황별 1개 |

- 진입점: owner Home 상단 "Next booking" 카드 / 예약 없으면 **Book care**. sitter `Today` 상단 "Requests (2)" · "Drop-off at 09:30 today" 배지, 헤더 메뉴 **Schedule**.
- **장소 = 이동 방식 (D28):** `🚗 I'll drive — at Mina's place` (Owner drives, 기본·보딩) · `🚙 Mina picks up — at my place` (Sitter drives) · `📍 Somewhere else` (텍스트 1줄 필수, 예: "Trinity Bellwoods Park, north gate"). House sitting이면 두 인수인계 모두 `My place` 고정(선택 숨김). 주소는 **결제 후**(03C) 상대방에게만 보인다 — 03C 전까지는 확정 후. 시각만 바꾸는 역제안은 장소를 그대로 둔다 (`p_location_type` 생략).
- **시각 입력:** 15분 단위, 지난 시각 불가. 시터 칸 시간 밖을 골라도 막지 않고 "needs Jun's OK"로 안내 (협의 가능). 단, 시터가 열지 않은 칸을 절반 넘게 덮으면(예: Overnight 없는 시터에게 1박) 그 시터는 "일부 가능" — [phase-02 칸·시간 규칙](phase-02.md#칸--시간-규칙-d24).
- **나눠 맡기기** (견주가 고를 때만): 검색 결과의 **Other options** 접힘 영역 — "Covers Oct 5–6 only".
- 텍스트: 견주 메모·장소 텍스트 허용. 시터는 제안 시 **선택 메모 1줄**만 (P0 시터 텍스트 최소화 원칙).

---

## 작업 상세

| ID | 작업 | 상세 | DoD |
| :--- | :--- | :--- | :--- |
| 3B.0 | 탭 변경 · migration `004_booking_options.sql` | owner 탭 `Home · Bookings · Feed · Care · Reports`, sitter 탭 `Today · Bookings · Tasks · Report` (기존 Scan 스텁 탭 제거 → Phase 08에서 Today 버튼, architecture §3). migration: `bookings.service_type text not null default 'boarding' check in ('boarding','house_sitting')` · `sitter_profiles.services text[] not null default '{boarding}'` (check 원소 ⊂ {boarding, house_sitting}) · Meet & Greet 컬럼(`meet_greet_mode` in_person/video, `meet_greet_at`, `meet_greet_status` proposed/agreed/done/skipped, `meet_greet_proposed_by`) · `request_booking`에 `p_service_type` 추가 (house_sitting이면 두 장소 `owner_home` 강제, 시터 `services`에 없으면 `service_not_offered`) · `search_sitters`/`list_my_sitters` 결과에 `services` · (Phase 04 대비) `media.purpose` check에 `report`·`handoff` 추가 | 탭 4·5개 라벨 안 잘림 (Playwright) · 기존 rls_smoke 유지 |
| 3B.1 | 시터 스케줄 | `/sitter/schedule`. `sitter_availability` insert/update/delete (칸별 행: slot + starts_at/ends_at + max_pets / blocked). 기간 일부만 바꿀 때는 그 기간으로 **새 open 행을 insert** — 가장 최근 행이 그 날의 시간·정원을 정함(phase-02). `overlaps_confirmed_booking` → 겹치는 예약 목록 → 예약별 **Cancel booking** → 전부 취소되면 block 재시도 | open/blocked/시간/정원 저장, 겹침 시 취소 흐름 |
| 3B.2 | 단골 시터 + 스케줄 보기 | `rpc('list_my_sitters')` → "Your sitters". `/owner/sitters/[id]` → `rpc('get_sitter_schedule')` 월 캘린더 | 단골 스케줄 표시 |
| 3B.3 | 예약 만들기 | `/owner/bookings/new`: 맡기기·찾기 시각·장소 입력 → 단골마다 `get_sitter_schedule`로 전체 가능 여부 + 시간 안 여부 → 없으면 `rpc('search_sitters', {p_drop_off_at, p_pick_up_at, p_pet_count})`. 요청 → `rpc('request_booking', …)`. 에러 문구: `pet_already_booked` → "{name} already has a sitter (or a pending request) at that time." · `invalid_window` → "Pick a drop-off in the future and a pick-up after it." · `location_note_required` → "Tell the sitter where to meet." | 요청 + handoff 2개 + 시터 알림 |
| 3B.4 | 시터 요청함 + 시각 제안 | `/sitter/bookings` → 카드 반려동물은 `rpc('get_booking_pets')`, 상세는 `pets`·`pet_allergies`·`care_tasks` select(요청 받은 시터 허용). **Accept** `rpc('respond_booking')` / **Suggest another time** → `rpc('propose_handoff')`. `handoff_pending` → "Waiting for Jisoo to confirm the new time." `sitter_unavailable` → "You no longer have room on {day} {slot}." | 수락·거절·역제안 |
| 3B.5 | 협의 응답 + 확정 후 변경 | 양쪽 상세에서 제안 카드 **Accept / Suggest another time / Decline** → `rpc('respond_handoff')` 또는 `rpc('propose_handoff')`(역제안, 횟수 제한 없음). 카드에 이전 제안 이력 표시 ("You: 07:00 → Mina: 07:30 → You: 07:15 …"). 확정 전 **Decline** → 확인 다이얼로그 "This will end the booking request." → 요청 종료. 확정 후 **Change time or place** → 제안 (P0는 시각·장소(=이동 방식)만. 서비스 방식 Boarding ↔ House sitting 변경은 P1 [11.14](phase-11.md)), 거절되면 "Mina kept the original time." (예약 유지). 동의 전엔 기존 값 + "Change pending" | 주고받기 → 동의 → 반영 / 거절 규칙 |
| 3B.6 | 인수인계 체크 | sitter 상세 **Received**(맡기는 시각 2시간 전부터) / **Returned**(Received 후) → `rpc('complete_handoff')` → 견주 알림. `handoff_too_early` → "You can check in from 2 hours before drop-off." `get_handoff_details`로 주소 표시 (확정 후 ~ 찾은 뒤 24시간) | 도착·출발 알림 |
| 3B.7 | 취소 · 다시 예약 | 취소(맡기기 전만) → `rpc('cancel_booking', {p_reason})`. Received 뒤엔 `booking_in_progress` → "Bori is already with Mina — change the pick-up time instead." 견주 알림 `booking_cancelled` → 상세 → **Find a new sitter** → `/owner/bookings/new?rebook=<id>` (반려동물·시각·장소 자동 입력) → `p_rebooked_from` | 취소 → 재예약 |
| 3B.9 | Meet & Greet | RPC `propose_meet_greet(p_booking, p_mode, p_at)` (당사자, requested/confirmed, 미래 시각 → 상대방 `meet_greet_proposed`) · `respond_meet_greet(p_booking, p_accept)` (상대방 → agreed + 제안자 `meet_greet_agreed` / 거절이면 null로 되돌림) · `complete_meet_greet(p_booking, p_skipped boolean)` (당사자 → done/skipped). 예약 상세 카드: 미정 → **Schedule Meet & Greet** (방식 2개 + 날짜·시각 피커) / 제안 대기 / 확정 "Video · Oct 6, 7:00 PM" + 확인할 것 체크리스트(Care needs · Quirks · Route · Handoff · Heads-up — 로컬 체크) / 지난 뒤 **Done** · "We've met before — skip" | 제안 → 수락 → Done, Skip |
| 3B.10 | 서비스 방식 · 이동 방식 UI | `/owner/bookings/new` ⓪ Service 선택 + HandoffPicker 이동 방식 라벨 · 요청 카드·예약 상세·BookingCard에 서비스(🏠 Boarding / 🔑 House sitting)·이동 방식(🚗 Owner drives / 🚙 Sitter drives) 표시 · `/profile` 시터 **Services offered** 체크 | 라벨·고정 규칙 |
| 3B.8 | Sitter Today 연동 | `/sitter/index.tsx`: **Now caring** = 맡긴 시간 안 반려동물 (견주별 묶음, 여러 집 가능) · **Today** = 오늘 맡기기/찾기 예정(시각·장소) · **Upcoming**. 없으면 "No bookings yet — open your schedule so owners can find you." | 시각에 따라 표시 전환 |

---

## Definition of Done (DoD)

1. Goal 달성 기준 수동 시나리오 전부 통과 (시터 2 + 견주 2 계정)
2. phase-02 `rls_smoke.sql` 예약 시나리오 A–H 통과 상태 유지
3. 예약·인수인계 RPC 에러 코드 전부([supabase/README.md — RPC errors](../../../supabase/README.md#rpc-errors))가 사람 문구로 표시
4. 알림 탭 시 올바른 화면: `meet_greet_proposed`/`meet_greet_agreed`(상대방·제안자) · `booking_requested`(시터) · `booking_confirmed`/`booking_declined`(견주) · `booking_cancelled`(상대방) · `handoff_proposed`(상대방) · `handoff_agreed`/`handoff_declined`(제안자) · `pet_dropped_off`/`pet_picked_up`(견주). 스케줄 변경으로는 알림이 생기지 않음
5. 확정 전에는 상대방 주소가 어디에도 노출되지 않음

---

## 산출물

- `frontend/app/sitter/schedule.tsx`, `frontend/app/sitter/bookings/index.tsx`, `[bookingId].tsx`
- `frontend/app/owner/bookings/index.tsx`, `new.tsx`, `[bookingId].tsx`, `frontend/app/owner/sitters/[sitterId].tsx`
- `frontend/components/SlotCalendar.tsx`, `HandoffCard.tsx`, `HandoffPicker.tsx`, `BookingCard.tsx`, `SitterCard.tsx` — 날짜·시간 선택은 직접 만든 UI (웹 미지원 `@react-native-community/datetimepicker` 금지), 기간은 시작일·종료일 **두 번 탭** (드래그 선택 없음), 시트는 Close 버튼 필수 — 데스크톱 프레임에서 마우스로 동작 ([DESIGN.md §7.7](../../../DESIGN.md#77-works-with-a-mouse), D25)
- `frontend/lib/bookings.ts` (RPC 래퍼)
- `supabase/migrations/004_booking_options.sql` (3B.0 · 3B.9), `frontend/components/MeetGreetCard.tsx`

---

## 다음 Phase

→ [Phase 03C — 견적 · 동의서 · 데모 결제 · 보안 해제](phase-03c.md) → [Phase 04 — Cloudinary](phase-04.md) (업로드 서명은 `is_on_duty_for` 기준)
