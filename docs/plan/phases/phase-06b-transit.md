# Phase 06B — Pet Transit: 실시간 이동 · 도착 안내 · 인수인계 사진 체크 (Stage 4)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — **D28 이동 방식**, **D31 출입 정보**, **D32 Pet Transit**, **D33 Vision**, UX §8-9·10, 알림 §7
> 제품 흐름: [full-process.ko.md — Stage 4 (4-1, 4-2)](../full-process.ko.md#stage-4--care--uber-style-pet-transit--ai-스마트-알림장-핵심-실행-단계)
> **순서 변경 (D41, 2026-10-02):** 이 Phase는 **P0 큐의 맨 마지막**(Phase 07C 바로 다음 — 08 stretch보다 먼저, Phase 10 배포 직전 · 2026-10-02 확정)에 만든다. 인수인계 Received/Returned는 03B로 이미 동작하므로 이 Phase가 늦어져도 앞 단계는 막히지 않는다. 심사에서는 **데모 영상**(Simulate trip)으로 이동을 보여주고, 웹 데모 URL의 Simulate trip 버튼은 유지한다.
> **위치 공유 동의 (D41):** Start trip → **앱 동의 화면**("Share your live location with Chloe until you arrive?" — 누구에게·언제까지, 도착하면 자동 종료) → Allow 후에만 브라우저/OS 위치 권한 팝업. P0 웹은 **화면이 켜진 동안만** 공유(iOS·Android 웹은 백그라운드 불가). 출시(네이티브 앱)에서는 위치 권한을 미리 동의받아 이동 중 계속 공유. **동의 거부 · 권한 거부 (2026-10-10 결정, [full-process §9](../full-process.ko.md#9-열린-질문--tbd-2026-10-02) #4):** 실시간 위치·지도·ETA는 나오지 않고, 양쪽 화면에 **만나기로 한 장소 + Open in Google Maps 버튼**(Google Maps 링크)만 보인다.
> **비용 근거:** 이동 30분 · 5초 간격 ≈ 720 메시지(전송 + 수신) → Supabase Realtime Free(동시 연결 200, 월 200만 메시지) 안에서 월 2,700회 이상 이동 가능. 지도 = Leaflet + OSM 타일 (데모 수준 무료).
> **인수인계 사진 체크는 앱에서 뺀다 (2026-10-11 결정):** 견주와 시터가 직접 만나 건네므로 "인계가 됐다"는 증거로는 쓸모가 거의 없고, 비전 모델은 이미 캡션 · 알림장 칩에서 쓴다. 이미 만든 `POST /api/ai/handoff-check` · `handoff_checks`는 **P1 후보로 그대로 두고 앱에 연결하지 않는다**(Take a photo · Retake / Continue anyway · "photo verified ✅" 없음). Received / Returned가 열린 trip을 같이 끝내는 것만 06B에 남긴다.

## Goal

맡기기·찾기를 **Uber처럼** 만든다. 이동하는 쪽이 **Start trip**을 누르면 상대방 화면에 **실시간 위치·지도·ETA**가 뜨고, 목적지 150 m 안에 들어오면 **자동 도착 알림**과 상황별 안내 카드가 나온다 — 견주에게는 **Visitor parking·로비 안내**, 시터에게는 **Buzzer 1-tap·Lockbox 코드**(03C 해제 규칙). 인계 순간 시터가 사진 1장을 찍으면 **Vision AI**가 확인(반려동물 체크인 / 차량 안 **크레이트·안전벨트**)하고, **Received / Returned**와 함께 견주에게 "photo verified" 알림이 간다. 심사위원 PC에는 GPS 이동이 없으므로 **Simulate trip**으로 같은 화면을 재현한다.

### Goal 달성 기준 (full-process §6 데모 경로)

- [ ] **Sitter drives (맡기기):** Chloe **Start trip** → Robert `trip_started` "Chloe is on the way — ETA 7:42 AM 🚗" → Robert Trip 화면에 지도(Chloe 위치 + 내 집) + ETA가 5초마다 갱신
- [ ] Chloe가 Robert 집 150 m 안 → 양쪽 `trip_arrived` → Chloe 화면에 **EntryInfoCard**(Buzzer 1-tap · Lockbox **Show code** — 03C 시간 조건) 자동 표시
- [ ] ~~Chloe: 차량 안 사진(샘플 `car_crate_ok`) → Vision `ok` (crate ✅ restraint ✅) → **Received** → Robert "Pick-up complete — care has started 🚗 · photo verified"~~ — 보류(사진 UI 제외, 위 결정)
- [ ] ~~샘플 `car_no_crate` → `warning` "Couldn't see a crate or seatbelt" → **Retake** / **Continue anyway**(이유 칩: "Crate is in the trunk" 등) → Received 가능, 견주 알림에 photo verified 없음~~ — 보류(사진 UI 제외, 위 결정)
- [ ] **Owner drives (찾기):** Robert **Start trip** → Chloe 화면 지도·ETA → 도착 → Chloe "Robert has arrived 🚗" / Robert **Chloe's place** 카드(Visitor parking · 로비 안내) → Chloe 귀가 사진(`return`) → **Returned** → Robert "Max and Mochi are home safe 🏠"
- [ ] **Start trip**을 누르면 위치 공유 동의 화면이 먼저 뜨고, Allow 전에는 위치가 전송되지 않음 (Simulate trip도 같은 동의 화면을 탐 — 데모 영상 장면)
- [ ] 동의를 거부하면 위치·지도·ETA 없이 **만날 장소 + Open in Google Maps** 버튼만 보이고, 상대 화면에는 "Robert isn't sharing a live location" 한 줄과 같은 장소 버튼이 보임
- [ ] 이동이 끝나면 `trips.last_lat/last_lng = null`, 상대방 화면 지도 사라짐. 예약 당사자 아닌 계정은 `trips` 행이 안 보임
- [ ] 데스크톱 프레임 + 마우스만으로 위 전부 (Simulate trip)

---

## 선행 조건

- [Phase 03B](phase-03b-booking.md) 인수인계·`complete_handoff` · [Phase 03C](phase-03c-payment.md) `get_home_access`, 시터 집 정보
- [Phase 04](phase-04-upload.md) `uploadMedia({purpose:'handoff'})` · `pickMedia()` 샘플 트레이 (4.7)
- [Phase 05](phase-05-feed.md) 알림 인프라 (Realtime + 알림 센터)
- [Phase 07.1](phase-07-report.md) Nebius client (6B.5)

---

## 범위

| 포함 (P0) | 제외 (해커톤 후) |
| :--- | :--- |
| `trips` 마지막 위치 1개 + Realtime 구독 + 직선거리 ETA | 도로 경로·교통 반영 ETA(라우팅 API), 경로 이력 |
| 보기 전용 지도 (웹 Leaflet + OSM, 자동 맞춤 + ±) | 드래그 팬·핀치 줌, 네이티브 지도(`react-native-maps`) |
| 위치 소스: 실제 GPS(foreground) + **Simulate trip** | 백그라운드 위치 추적, 배터리 최적화 |
| 도착 150 m 지오펜스 → 알림 + 안내 카드 | 주소 자동완성 · 도로 단위 정밀도 (좌표 = 주소 저장 때 OSM Nominatim 1회 조회, 또는 "Use my current location", 또는 시드) |
| 인수인계 사진 Vision 체크 3종 (pet_checkin · vehicle_safety · return) | 영상 기반 체크, 얼굴 인식 |

---

## 화면

| Route | 역할 | 화면 | 주 액션 |
| :--- | :--- | :--- | :--- |
| `/sitter/bookings/[bookingId]/trip` · `/owner/bookings/[bookingId]/trip` | both | 상단 배너(이동 중일 때 항상) "Sharing your location with Robert until you arrive" · **TripMap**(보기 전용, 이동하는 쪽 + 목적지 자동 맞춤, ± 버튼) · **ETA** 큰 글씨 "ETA 7:42 AM · 3.2 km" · 상태 줄 (On the way → Arrived) · 도착 후 카드: 시터 = **EntryInfoCard**(Sitter drives) / 견주 = **Chloe's place**(Owner drives) · 인계 단계: **Take a photo** → 체크 결과 → **Received** / **Returned** | 상황별 1개: **Start trip** → **Take a photo** → **Received/Returned** |
| 예약 상세 (03B) | both | 인수인계 카드에 **Start trip** (이동하는 쪽 = D28, 인수인계 2시간 전부터) / 상대방은 이동 중이면 **Track Chloe** | Start trip |
| Owner Home / Sitter Home | both | 진행 중 이동 카드 "Chloe is on the way · ETA 7:42" → 탭 = Trip 화면 | — |
| `/profile` | both | **Home location** — "Use my current location" (폰) / 데모 계정은 시드 좌표 표시 | Save |

- **Simulate trip** (데모 계정 또는 `useShell().embedded`): Start trip 시트에 "Use my real location" / **Simulate the drive (demo)** — `frontend/assets/demo/routes/*.json`의 가상 경로(공원·교차로 수준 좌표, 실제 주소 아님)를 10배속으로 재생, 같은 `update_trip_position`을 탄다 (가짜 결과 없음, D32).
- 비전 모델: `openbmb/MiniCPM-V-4_5` 확정. NVIDIA 비전 모델(`Nemotron-Nano-V2-12b` · `Cosmos3-Super-Reasoner`)은 Dedicated Endpoint 전용이라 상시 비용($48~113/일)이 예산을 넘어 쓰지 않는다 ([model-ids.md](notes/model-ids.md), D39).
- 사진 체크 문구: ok → "Looks good — Max is visible and secured ✅" / warning → "Couldn't see a crate or seatbelt. Retake, or continue and tell Robert why." / unchecked(AI 실패) → "Photo saved — we couldn't check it this time."

---

## 작업 상세

| ID | 작업 | 상세 | DoD |
| :--- | :--- | :--- | :--- |
| 6B.1 | DB `012_transit.sql` | `owner_profiles`·`sitter_profiles`에 `home_lat double precision`, `home_lng double precision` (본인 RLS; 상대방에게는 아래 RPC로만). `trips(id, booking_id → bookings cascade, handoff_kind text check in ('drop_off','pick_up'), traveler_id → profiles, status text check in ('en_route','arrived','completed','cancelled'), dest_lat, dest_lng, last_lat null, last_lng null, last_at null, eta_at null, distance_m int null, simulated boolean default false, started_at, arrived_at, ended_at)` · unique(booking_id, handoff_kind) where status in ('en_route','arrived') · RLS select = 예약 당사자, 쓰기는 RPC만 · Realtime publication 추가. RPC: `start_trip(p_booking, p_kind, p_simulated default false, p_lat default null, p_lng default null, p_share default true)` — 첫 위치를 같이 보내면 상대방 알림에 ETA가 들어간다(없으면 "is on the way 🚗"). 호출자 = 이동하는 쪽(장소 `sitter_home`이면 견주, `owner_home`이면 시터, `other`면 둘 다 가능), 결제 완료(03C), agreed 시각 2시간 전부터(`trip_too_early`) · pick_up은 drop_off 완료 뒤(`drop_off_not_completed`), 목적지 = 장소 좌표(`other`는 null → 지도 없이 ETA 생략) → 상대방 `trip_started`. `update_trip_position(p_trip, p_lat, p_lng)` — 호출자 = traveler, 1초 이내 중복 무시, 거리·ETA 계산(D32), 150 m 안이면 status `arrived` + `arrived_at` + 양쪽 `trip_arrived`(1회). `end_trip(p_trip, p_cancel boolean default false)` — 위치 null, `completed`/`cancelled` | rls_smoke L: 제3자 select 0행, 다른 사람 update 거부 |
| 6B.2 | `lib/location.ts` · `TripProvider` · 홈 좌표 | `startLocationSource({mode:'gps'\|'simulate', …}) → stop()` — gps: 웹 `navigator.geolocation`(P0는 웹 앱이라 `expo-location`은 네이티브 출시 때), 첫 위치는 바로, 이후 5초 간격 `update_trip_position`. 권한·동의 거부 → 위치를 보내지 않고 6B.8의 장소 카드로 전환(데모 계정은 **Simulate** 제안도). simulate: **정적 경로 JSON 대신 두 집 좌표로 만든 가상 경로**(`buildSimulatedRoute`, 목적지 ~60 m 앞에서 끝나 150 m 규칙이 실제로 동작, 1.2초 간격 ≈ 30초 — 서버가 1초 안 중복을 무시하므로 5초의 10배속(0.5초)은 못 씀). 화면이 닫혀도 같은 탭이면 계속(앱 수준 `TripProvider`, 동의 화면 `ShareLocationSheet`은 Allow 전에는 위치를 읽지도 보내지도 않음). **홈 좌표:** Profile의 Home address 아래 **Map pin for trips** — ① **Use my current location**(동의 화면 후 GPS 1회) ② 주소를 저장하면 `POST /api/geo/geocode`(OSM Nominatim, 키 없음, User-Agent · 초당 1회)로 좌표를 구하고 토스트 한 줄 "Pin placed near …"(못 찾으면 옛 핀 삭제 + 안내). 이번 방문에 GPS로 찍은 핀은 주소 조회로 덮어쓰지 않음 | 실제 폰 1회 + 데스크톱 simulate |
| 6B.3 | TripMap + Trip 화면 | `components/TripMap.web.tsx` — Leaflet + OSM 타일(`© OpenStreetMap contributors` 표기), `dragging:false, scrollWheelZoom:false, touchZoom:false`, ± 버튼만, 마커 2개(🚗 · 📍) 자동 맞춤(± 쓰면 자동 맞춤 멈춤). 네이티브 `TripMap.tsx`는 지도 없음(ETA·상태 줄이 대신). `useLiveTrips`(`postgres_changes` + 4초 폴링 — Realtime이 막혀도 갱신). Trip 화면 `features/transit/TripScreen.tsx`(양쪽 라우트 `…/bookings/[bookingId]/trip.tsx`): 공유 중 배너 · ETA 큰 글씨 · 지도 · 도착 카드 · Cancel trip. 예약 상세에 `TripEntry`(Start trip / Track …), Home에 `ActiveTripCard`. 시터 예약 상세는 `[bookingId]/index.tsx`로 옮김 | 1.7 마우스 테스트: 지도 위 드래그가 화면 스크롤로 동작(`app/dev/gestures.tsx`에 지도 케이스) |
| 6B.4 | 도착 안내 카드 | 이동한 사람(traveler)의 Trip 화면에 `arrived`가 되면 자동 표시. 시터(Sitter drives): 기존 **EntryInfoCard**(03C — `get_home_access`, 시간 조건 그대로, Show code). 견주(Owner drives): `get_handoff_details`로 **Chloe's place**(주소 · Visitor parking · 로비 안내). 기다린 쪽은 "{이름} has arrived" 카드. **Buzzer 1-tap `tel:` 링크는 보류** — 견주 전화번호가 앱에 없고(비상 연락처는 다른 용도) 지어내지 않기로 함 | 도착 시 자동 표시 |
| 6B.5 | `POST /api/ai/handoff-check` (민식) — **API만, 앱 연결 없음(2026-10-11)** | `routers/ai_handoff_check.py` (요청·응답·모델 출력 스키마는 라우터 안, 다른 AI 라우터와 같음) — 요청 `{booking_id, media_id, check_type, handoff_kind}`(pet_checkin은 drop_off, return은 pick_up에만) · `assert_booked_sitter(booking, from_hours_before=2)`, media가 그 시터가 올린 `handoff` 사진이고 그 예약 반려동물 것인지 확인 → `fetch_as_data_url` → `MODEL_VISION` + `prompts/handoff_check/system.md` (check_type별 지시) → `HandoffFindings {pet_visible, species_match, crate_visible?, restraint_visible?, concerns:[str]}` (`chat_json`) → 서버 규칙으로 status: pet_checkin/return = `pet_visible && species_match` → ok / vehicle_safety = `pet_visible && (crate_visible \|\| restraint_visible)` → ok / 그 외 warning. 의학적 판단 금지("looks calm" 같은 관찰만). 실패·20 s 타임아웃 → `unchecked` (200, **이것도 행으로 저장**해 Received가 사진을 가리킬 수 있게 함). `handoff_checks(id, booking_id, handoff_kind, check_type, media_id, status, findings jsonb, override_reason text null, model, latency_ms, created_at)` service role insert, 예약 당사자 둘이 select, 시터만 `override_reason` update(200자 이하) — `012_transit.sql` | 샘플 4장 기대 결과 일치 (아래) |
| 6B.6 | Received / Returned가 trip을 끝냄 + FB-9 | `complete_handoff(p_booking, p_kind)` — **시그니처는 그대로**, 해당 인수인계의 열린 trip(`en_route`·`arrived`)을 `completed`로 닫고 위치를 지움(맞이하는 쪽이 눌러도 이동한 사람의 trip이 닫힘). ~~사진 → 체크 → `p_check` → photo verified~~는 보류. **FB-9 (2026-10-11 결정: 막지 않고 묻는다):** Returned는 언제든 누를 수 있다(일찍 돌려보내는 경우가 있음). 누르면 **확인 시트**("Return Max?" · "Max goes home with Robert. This can't be undone, and it writes the Life Record." + 아직 안 한 오늘 할 일 수 · 오늘 알림장을 안 보냈다면 "Send today's note first" 링크) → **Return** / **Cancel**. **합의된 픽업 시각의 30분 전보다 이르면**(`EARLY_RETURN_MS`) 시트에 "It's not pick-up time yet — … Do you really want to return Max now?"가 더 붙고 **Return이 빨간 바탕 · 흰 글씨**(`Button variant="danger"`)가 된다. 30분 전부터는 정상 상황이라 경고 없이 평소 버튼. **서버는 바꾸지 않음**(pick_up `handoff_too_early` 없음) | Received · Returned가 trip을 닫음(스모크 L) · Returned 확인 시트 · 일찍 누르면 경고 · Cancel은 아무것도 안 바꿈 |
| 6B.8 | Google Maps 버튼 + 공유 없이 시작 (2026-10-10 · 10-12 확장) | **Open in Google Maps**는 공유하든 안 하든 **양쪽 모두**에게 보인다(Trip 화면 · 예약 상세의 Start trip 카드): 이동하는 쪽은 길 안내 `https://www.google.com/maps/dir/?api=1&destination=<주소>&travelmode=driving`, 기다리는 쪽은 장소 `…/maps/search/?api=1&query=<주소>`(새 탭, `lib/maps.ts`). 주소 글자가 없으면(예: 장소가 "somewhere else"의 메모뿐) 메모, 그것도 없으면 저장된 좌표. 보는 사람이 **이미 볼 수 있는 장소만** 쓴다 — 시터 집은 결제 후 견주, 견주 집은 예약 당사자, `other`는 적어 둔 문구. 출입 코드 · buzzer는 링크 · 카드에 넣지 않음(03C 시간 조건 그대로). **동의 화면:** Allow / (데모) Simulate / **Start without sharing my location** / Cancel. "공유 안 함"을 고르거나 Allow 뒤 브라우저가 거절하면 `start_trip(…, p_share := false)` — trip은 생기지만 위치 · ETA · 지도 · 도착 판정이 없고(`trips.sharing = false`), 상대 화면에는 "{name} isn't sharing a live location" + 만날 장소 카드 + 같은 버튼. 자동 도착 알림은 불가, 수동 "I've arrived"는 두지 않음. **웹 한계:** Google Maps로 넘어가면 브라우저 탭이 백그라운드가 되어 위치 공유가 멈춘다 → 상대 화면에 "Last location N min ago — sharing pauses while the browser is in the background"(네이티브 앱에서 해결, D41) | 공유 없이 시작 → 지도 · ETA 없이 장소 + 버튼, 링크가 올바른 장소로 열림, 코드 · 좌표 외 개인정보 없음 |
| 6B.7 | 테스트 | Playwright `flows`: 데모 owner·sitter 두 컨텍스트 — sitter Simulate trip → owner ETA 갱신 → 도착 카드 → Received → owner 토스트. (Realtime mock은 `supabaseMock.ts`에 `trips` 채널 추가) | CI 통과 |

### 인수인계 샘플 사진 (`frontend/assets/demo/handoff/`, `backend/tests/fixtures/handoff/` — 직접 촬영·생성, 사람·번호판·주소 없음)

| 파일 | check_type | 기대 |
| :--- | :--- | :--- |
| `dog_at_door.jpg` | pet_checkin | ok |
| `car_crate_ok.jpg` | vehicle_safety | ok (crate) |
| `car_no_crate.jpg` | vehicle_safety | warning |
| `empty_room.jpg` | pet_checkin | warning (pet_visible=false) |

---

## Definition of Done (DoD)

1. Goal 달성 기준 수동 시나리오 통과 — 두 창(또는 10.10 Split view)에서 새로고침 없이 ETA·도착이 3초 안에 반영
2. 위치 프라이버시: 이동 끝나면 위치 null, 경로 이력 없음, 제3자 접근 0 (rls_smoke L)
3. 출입 정보는 03C 시간 조건 밖에서 안 보임 (도착해도 2시간 전 이전이면 잠김 카드)
4. `pytest`: handoff-check 비당사자 403, 상태 규칙(모델이 crate=false면 vehicle_safety warning), 타임아웃 → unchecked
5. 지도 화면이 데스크톱 프레임에서 마우스만으로 동작하고 드래그가 스크롤을 막지 않음 (DESIGN.md §7.7)
6. 동의 거부 경로(6B.8)와 Returned 확인 시트·이른 Returned 경고(FB-9, 6B.6)를 Playwright로 확인


### 확인 결과 (2026-10-12, S8)

| DoD | 결과 |
| :--- | :--- |
| 1 두 창에서 새로고침 없이 ETA · 도착 반영 | 🤖 `transit.spec.ts`의 두 브라우저 테스트(같은 DB, 4초 폴링 · Realtime은 e2e에서 안 씀)로 확인. **사람이 두 창 · 두 폰으로 확인하는 일은 남음** (test-guide TRIP-13 · 22) |
| 2 위치 프라이버시 | 스모크 L: 끝나면 위치 null, 제3자는 `trips` 0행, 클라이언트는 직접 쓰기 불가, `complete_handoff`도 위치를 지움 |
| 3 출입 정보 시간 조건 | 03C 그대로(`EntryInfoCard` → `get_home_access`). Start trip이 인수인계 2시간 전부터라 도착은 항상 해제 이후 — 잠긴 카드는 03C 테스트가 확인 |
| 4 pytest | `handoff-check`(비당사자 403 · crate=false → warning · 타임아웃 → unchecked) 통과. **앱에는 연결하지 않음(2026-10-11)** |
| 5 데스크톱 프레임 마우스 | `/dev/gestures`의 지도 위 드래그 = 화면 스크롤, ± 버튼 확인 |
| 6 거부 경로 · Returned 시트 | 공유 없이 시작 · 브라우저 거절 · Returned 확인 시트와 이른 경고 모두 Playwright로 확인 |

**남은 사람 일:** 실제 폰 GPS 1회(Vercel URL, Start trip → 위치 팝업 → 상대 창에 지도 · ETA), 두 계정 두 창 시나리오, 머지 때 `012` 호스팅 적용(요청 시).

---

## 작업 순서 — 한 PR · 단계별 커밋 (CLAUDE.md §4.1a · §4.2)

- **브랜치 `feat/phase-06b-transit`**(최신 `main`에서). **PR은 이 Phase가 끝날 때까지 하나** — 첫 단계 커밋을 push하면서 **ready for review**로 열고(`feat: phase 06B pet transit — live trip, arrival cards, handoff photo check`), 이후 단계는 모두 같은 PR에 쌓는다. PR 본문에 아래 단계 표를 넣고 단계마다 체크한다.
- **단계마다 커밋 하나** — 그 단계의 확인(타입체크 · 해당 테스트 · SQL 스모크 / pytest)이 통과한 뒤에 커밋 · push하고, 같은 커밋에서 TODO · test-guide를 고친다. 단계가 끝나면 사용자에게 "커밋 · 확인한 방법 · 다음 단계"를 보고한다.
- **`012_transit.sql`은 호스팅 DB에 적용하기 전까지 하나의 파일**이다 — S1에서 만들고 S5가 `complete_handoff`를 같은 파일에서 고친다(적용 전이라 "적용한 마이그레이션은 고치지 않는다" 규칙에 안 걸림). 호스팅 적용은 **머지할 때 사용자가 요청하면** 한다(Supabase 연결로).

| 단계 | 내용 | 커밋 전 확인 |
| :--- | :--- | :--- |
| **S1 DB** | 6B.1 — `012_transit.sql`(홈 좌표 · `trips` · `start_trip` · `update_trip_position` · `end_trip` · Realtime) + `rls_smoke.sql` L. 데모 계정 시드 좌표는 `backend/app/services/demo_reset.py` | Docker `pgvector/pgvector:pg17`에 stub → 모든 마이그레이션 → 스모크 통과 |
| **S2 백엔드 비전** | 6B.5 — `POST /api/ai/handoff-check` · `handoff_checks` · 프롬프트 · 샘플 사진 4장 fixtures · pytest(비당사자 403 · crate=false → warning · 타임아웃 → unchecked) | `pytest` · `ruff check` + 실제 모델로 샘플 4장 기대 결과(키 있을 때) |
| **S3 위치 소스** | 6B.2 — `lib/location.ts` · `TripProvider` · 데모 경로 JSON · 위치 공유 **동의 화면**(Allow 전에는 아무것도 안 보냄) · Profile **Home location** | 타입체크 · 단위/e2e(동의 → Allow 전 전송 없음) |
| **S4 지도 · Trip 화면** | 6B.3 + 6B.4 — `TripMap(.web)` · `trip.tsx` 양쪽 · 예약 상세 **Start trip / Track …** · Home의 이동 카드 · 도착 안내 카드(EntryInfoCard · Chloe's place) · `supabaseMock.ts` `trips` | 타입체크 · Playwright(Simulate → ETA 갱신 → 도착 카드) · 마우스만으로 지도 위 드래그 = 스크롤 |
| **S5 trip 종료** | 6B.6 전반 — `complete_handoff`가 열린 trip을 닫음(시그니처 불변). 사진 UI는 뺌(2026-10-11) | 스모크 L · Playwright(Received가 도착한 trip을 닫음) |
| **S6 FB-9** | Returned **확인 시트**(오늘 남은 할 일 · 알림장 미발송) + 픽업 30분 전보다 이르면 "정말 지금 Return?" 경고 + 빨간 **Return**(그 외엔 평소 버튼) / **Cancel**. 서버 변경 없음. **시작점: 닫힌 브랜치의 커밋 `ade2301`**(`git show ade2301`)은 확인 시트 + 이른 경고만 있었음 — 읽고 다시 적용 | `handoff.spec.ts` |
| **S7 Google Maps · 공유 없이 시작** | 6B.8 — 양쪽 모두 **Open in Google Maps**, 동의 화면에 **Start without sharing my location**, 공유 안 하는 trip(`012`의 `trips.sharing` · `start_trip(p_share)`), 상대 화면 "isn't sharing a live location" + 장소 카드, 오래된 위치 "Last location N min ago" | 스모크 L · Playwright(링크가 올바른 장소 · 코드 노출 없음) |
| **S8 마무리** | 6B.7 두 컨텍스트 e2e, 루트 `README.md` · `docs/README.ko.md`의 🚧(Transit · Returned 확인 시트 · 위치 거절 — 사진 체크는 앱에 없음) → ✅, test-guide 시나리오, TODO tidy, DoD 1~6 확인 | CI 통과 · 사용자에게 "Phase 완료" 보고 |

---

## 시작 전에 사람이 준비할 것 (Minsik · Muk)

**막힘 — 이게 없으면 해당 단계의 마지막 확인을 못 한다**

| # | 누가 | 무엇을 | 언제까지 / 어디에 |
| :--- | :--- | :--- | :--- |
| 1 | ~~Muk (또는 Minsik)~~ | **인수인계 샘플 사진 4장** 직접 촬영 · 생성: `dog_at_door.jpg`(문 앞의 강아지) · `car_crate_ok.jpg`(차 안, 크레이트 있음) · `car_no_crate.jpg`(차 안, 크레이트 · 안전벨트 없음) · `empty_room.jpg`(반려동물 없는 방). **사람 · 번호판 · 주소 · 실제 브랜드 라벨이 없어야 함**, 각 1 MB 이하 JPG | **S2 시작 전**(없으면 에이전트가 표시된 임시 이미지로 진행하고 S2의 "실제 모델 확인"만 남김). 같은 파일을 `frontend/assets/demo/handoff/` 와 `backend/tests/fixtures/handoff/` 에 둔다 | — **보류**(사진 체크를 앱에 연결하지 않기로 함 · 2026-10-11)
| 2 | Minsik | **Token Factory 확인**: `backend/.env`와 Render에 `NEBIUS_API_KEY`가 있고, `openbmb/MiniCPM-V-4_5`가 `GET /v1/models`에 나오는지 ([model-ids.md](notes/model-ids.md)) | S2 전. 안 나오면 에이전트가 멈추고 알린다(CLAUDE.md §3 "Ask the human when blocked") |
| 3 | Minsik | **시작 전 결정 2개** — (a) 위치 공유를 안 하는 이동에서 수동 **"I've arrived"** 버튼을 둘까? (추천: P0에서는 **두지 않음** — 장소 카드만, 자동 도착 알림은 위치가 있을 때만) (b) 데모 경로: 에이전트가 만드는 **가상 좌표**(공원 · 교차로 수준, 실제 주소 아님)를 그대로 써도 되는지 | S1 전. 말이 없으면 위 추천대로 진행 |

**병행 — 막지는 않지만 해 두면 좋은 것**

| # | 누가 | 무엇을 |
| :--- | :--- | :--- |
| 4 | Muk | Trip 화면(지도 · ETA · 도착 카드 · 사진 체크) **Figma 프레임**이 없으면 에이전트는 `DESIGN.md`로 와이어프레임 수준으로 만든다 — 나중에 Muk이 다듬을 화면이라고 PR에 적어 둔다 |
| 5 | Minsik | **실제 폰 1회**(GPS): Vercel URL에서 Start trip → 위치 팝업 → 상대 창에 지도 · ETA. S4 뒤, 머지 전에 (6B.2 DoD) |
| 6 | Minsik | 머지 때 에이전트에게 **"012 호스팅 DB에 적용해줘"** 라고 말하기(Supabase 연결). 적용하기 **전에 Seulgi에게 알리기**(Received · Returned가 열린 trip을 닫는 동작이 추가됨 — 시그니처는 그대로, S6의 Returned 경고는 앱 화면만 바뀜) |
| 7 | Minsik | 지난 마무리 중 남은 것(06B와 별개): Render `CRON_SECRET` + cron-job.org 15분 호출([env-setup.ko.md](../env-setup.ko.md)) · `/privacy` 페이지 · Supabase Leaked password protection |

새 외부 서비스나 환경 변수는 없다: 지도는 Leaflet + OSM 타일(무료, `© OpenStreetMap contributors` 표기), Google Maps 링크는 키가 필요 없다.

### 새 세션에서 붙여 넣을 프롬프트

```text
Read CLAUDE.md and docs/plan/TODO.md.
Work ONLY on the "Current focus" task: Phase 06B Pet Transit.
Read docs/plan/phases/phase-06b-transit.md — the Goal, DoD, 작업 순서 (steps S1–S8) and 시작 전에 사람이 준비할 것.
Update main, create feat/phase-06b-transit, work step by step: one commit per step, one PR (ready for review) for the whole phase, same PR until it is done.
Before S1, tell me which of the "blocking" items in the 준비 list are still open. After each step report the commit, how you verified it, and the next step.
```

---

## 산출물

- `supabase/migrations/012_transit.sql`, `supabase/tests/rls_smoke.sql` (L)
- `backend/app/routers/ai_handoff_check.py`, `backend/app/ai/prompts/handoff_check/system.md`
- `frontend/lib/location.ts`, `frontend/lib/transit.ts`, `frontend/features/transit/*`, `frontend/components/{TripEntry,ActiveTripCard}.tsx`, `frontend/providers/TripProvider.tsx`, `frontend/components/ShareLocationSheet.tsx`, `backend/app/routers/geo.py`, `frontend/components/TripMap.web.tsx` / `TripMap.tsx`, `frontend/app/{owner,sitter}/bookings/[bookingId]/trip.tsx`, `frontend/assets/demo/handoff/*`
- 의존성: `leaflet` (웹 전용 import) — `expo-location`은 네이티브 출시 때

---

## AI 프롬프트

Playbook §8B — (6B.1 SQL) / (6B.2–6B.4 UI) / (6B.5 Vision) 세 번

---

## 다음 Phase

→ (시간이 남으면 [Phase 08 — 세이프티 stretch](phase-08-safety.md)) → [Phase 10 — 데모·배포](phase-10-deploy.md) (06B가 P0 맨 마지막 — D41)
