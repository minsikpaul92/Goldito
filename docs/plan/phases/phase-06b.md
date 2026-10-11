# Phase 06B — Pet Transit: 실시간 이동 · 도착 안내 · 인수인계 사진 체크 (Stage 4)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — **D28 이동 방식**, **D31 출입 정보**, **D32 Pet Transit**, **D33 Vision**, UX §8-9·10, 알림 §7
> 제품 흐름: [full-process.ko.md — Stage 4 (4-1, 4-2)](../full-process.ko.md#stage-4--care--uber-style-pet-transit--ai-스마트-알림장-핵심-실행-단계)
> **순서 변경 (D41, 2026-10-02):** 이 Phase는 **P0 큐의 맨 마지막**(Phase 07C 바로 다음 — 08 stretch보다 먼저, Phase 10 배포 직전 · 2026-10-02 확정)에 만든다. 인수인계 Received/Returned는 03B로 이미 동작하므로 이 Phase가 늦어져도 앞 단계는 막히지 않는다. 심사에서는 **데모 영상**(Simulate trip)으로 이동을 보여주고, 웹 데모 URL의 Simulate trip 버튼은 유지한다.
> **위치 공유 동의 (D41):** Start trip → **앱 동의 화면**("Share your live location with Chloe until you arrive?" — 누구에게·언제까지, 도착하면 자동 종료) → Allow 후에만 브라우저/OS 위치 권한 팝업. P0 웹은 **화면이 켜진 동안만** 공유(iOS·Android 웹은 백그라운드 불가). 출시(네이티브 앱)에서는 위치 권한을 미리 동의받아 이동 중 계속 공유. **동의 거부 · 권한 거부 (2026-10-10 결정, [full-process §9](../full-process.ko.md#9-열린-질문--tbd-2026-10-02) #4):** 실시간 위치·지도·ETA는 나오지 않고, 양쪽 화면에 **만나기로 한 장소 + Open in Google Maps 버튼**(Google Maps 링크)만 보인다.
> **비용 근거:** 이동 30분 · 5초 간격 ≈ 720 메시지(전송 + 수신) → Supabase Realtime Free(동시 연결 200, 월 200만 메시지) 안에서 월 2,700회 이상 이동 가능. 지도 = Leaflet + OSM 타일 (데모 수준 무료).

## Goal

맡기기·찾기를 **Uber처럼** 만든다. 이동하는 쪽이 **Start trip**을 누르면 상대방 화면에 **실시간 위치·지도·ETA**가 뜨고, 목적지 150 m 안에 들어오면 **자동 도착 알림**과 상황별 안내 카드가 나온다 — 견주에게는 **Visitor parking·로비 안내**, 시터에게는 **Buzzer 1-tap·Lockbox 코드**(03C 해제 규칙). 인계 순간 시터가 사진 1장을 찍으면 **Vision AI**가 확인(반려동물 체크인 / 차량 안 **크레이트·안전벨트**)하고, **Received / Returned**와 함께 견주에게 "photo verified" 알림이 간다. 심사위원 PC에는 GPS 이동이 없으므로 **Simulate trip**으로 같은 화면을 재현한다.

### Goal 달성 기준 (full-process §6 데모 경로)

- [ ] **Sitter drives (맡기기):** Chloe **Start trip** → Robert `trip_started` "Chloe is on the way — ETA 7:42 AM 🚗" → Robert Trip 화면에 지도(Chloe 위치 + 내 집) + ETA가 5초마다 갱신
- [ ] Chloe가 Robert 집 150 m 안 → 양쪽 `trip_arrived` → Chloe 화면에 **EntryInfoCard**(Buzzer 1-tap · Lockbox **Show code** — 03C 시간 조건) 자동 표시
- [ ] Chloe: 차량 안 사진(샘플 `car_crate_ok`) → Vision `ok` (crate ✅ restraint ✅) → **Received** → Robert "Pick-up complete — care has started 🚗 · photo verified"
- [ ] 샘플 `car_no_crate` → `warning` "Couldn't see a crate or seatbelt" → **Retake** / **Continue anyway**(이유 칩: "Crate is in the trunk" 등) → Received 가능, 견주 알림에 photo verified 없음
- [ ] **Owner drives (찾기):** Robert **Start trip** → Chloe 화면 지도·ETA → 도착 → Chloe "Robert has arrived 🚗" / Robert **Chloe's place** 카드(Visitor parking · 로비 안내) → Chloe 귀가 사진(`return`) → **Returned** → Robert "Max and Mochi are home safe 🏠"
- [ ] **Start trip**을 누르면 위치 공유 동의 화면이 먼저 뜨고, Allow 전에는 위치가 전송되지 않음 (Simulate trip도 같은 동의 화면을 탐 — 데모 영상 장면)
- [ ] 동의를 거부하면 위치·지도·ETA 없이 **만날 장소 + Open in Google Maps** 버튼만 보이고, 상대 화면에는 "Robert isn't sharing a live location" 한 줄과 같은 장소 버튼이 보임
- [ ] 이동이 끝나면 `trips.last_lat/last_lng = null`, 상대방 화면 지도 사라짐. 예약 당사자 아닌 계정은 `trips` 행이 안 보임
- [ ] 데스크톱 프레임 + 마우스만으로 위 전부 (Simulate trip, 샘플 사진 트레이)

---

## 선행 조건

- [Phase 03B](phase-03b.md) 인수인계·`complete_handoff` · [Phase 03C](phase-03c.md) `get_home_access`, 시터 집 정보
- [Phase 04](phase-04.md) `uploadMedia({purpose:'handoff'})` · `pickMedia()` 샘플 트레이 (4.7)
- [Phase 05](phase-05.md) 알림 인프라 (Realtime + 알림 센터)
- [Phase 07.1](phase-07.md) Nebius client (6B.5)

---

## 범위

| 포함 (P0) | 제외 (해커톤 후) |
| :--- | :--- |
| `trips` 마지막 위치 1개 + Realtime 구독 + 직선거리 ETA | 도로 경로·교통 반영 ETA(라우팅 API), 경로 이력 |
| 보기 전용 지도 (웹 Leaflet + OSM, 자동 맞춤 + ±) | 드래그 팬·핀치 줌, 네이티브 지도(`react-native-maps`) |
| 위치 소스: 실제 GPS(foreground) + **Simulate trip** | 백그라운드 위치 추적, 배터리 최적화 |
| 도착 150 m 지오펜스 → 알림 + 안내 카드 | 주소 지오코딩 (좌표는 "Use my current location" 또는 시드) |
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
| 6B.1 | DB `012_transit.sql` | `owner_profiles`·`sitter_profiles`에 `home_lat double precision`, `home_lng double precision` (본인 RLS; 상대방에게는 아래 RPC로만). `trips(id, booking_id → bookings cascade, handoff_kind text check in ('drop_off','pick_up'), traveler_id → profiles, status text check in ('en_route','arrived','completed','cancelled'), dest_lat, dest_lng, last_lat null, last_lng null, last_at null, eta_at null, distance_m int null, simulated boolean default false, started_at, arrived_at, ended_at)` · unique(booking_id, handoff_kind) where status in ('en_route','arrived') · RLS select = 예약 당사자, 쓰기는 RPC만 · Realtime publication 추가. RPC: `start_trip(p_booking, p_kind, p_simulated)` — 호출자 = 이동하는 쪽(장소 `sitter_home`이면 견주, `owner_home`이면 시터, `other`면 둘 다 가능), 결제 완료(03C), agreed 시각 2시간 전부터, 목적지 = 장소 좌표(`other`는 null → 지도 없이 ETA 생략) → 상대방 `trip_started`. `update_trip_position(p_trip, p_lat, p_lng)` — 호출자 = traveler, 1초 이내 중복 무시, 거리·ETA 계산(D32), 150 m 안이면 status `arrived` + `arrived_at` + 양쪽 `trip_arrived`(1회). `end_trip(p_trip, p_cancel boolean default false)` — 위치 null, `completed`/`cancelled` | rls_smoke L: 제3자 select 0행, 다른 사람 update 거부 |
| 6B.2 | `lib/location.ts` | `startLocationSource({mode:'gps'\|'simulate', route?}) → stop()` — gps: `expo-location` foreground watch (웹은 `navigator.geolocation.watchPosition`), 5초 간격 `update_trip_position`. 권한·동의 거부 → 위치를 보내지 않고 6B.8의 장소 카드로 전환(데모 계정은 **Simulate** 제안도). simulate: 경로 JSON 재생. 화면이 닫혀도 같은 탭이면 계속(앱 수준 provider `TripProvider`) | 실제 폰 1회 + 데스크톱 simulate |
| 6B.3 | TripMap + Trip 화면 | `components/TripMap.web.tsx` — Leaflet + OSM 타일(`© OpenStreetMap contributors` 표기), `dragging:false, scrollWheelZoom:false, touchZoom:false`, ± 버튼만, 마커 2개 자동 맞춤. 네이티브 `TripMap.tsx`는 지도 없이 거리·ETA 카드 (해커톤 후 지도). Realtime 구독 `trips` (booking_id 필터) → 마커·ETA 갱신 | 1.7 마우스 테스트: 지도 위 드래그가 화면 스크롤로 동작 |
| 6B.4 | 도착 안내 카드 | 시터(Sitter drives): `get_home_access` → **EntryInfoCard**(03C) — Buzzer 1-tap = `tel:` 링크(견주 전화, 데모는 가짜 번호) + buzzer 코드, Lockbox **Show code**. 견주(Owner drives): `get_handoff_details` → Chloe's place(주소·Visitor parking·로비 안내) | 도착 시 자동 표시 |
| 6B.5 | `POST /api/ai/handoff-check` (민식) | `routers/ai_handoff_check.py` — `assert_booked_sitter(booking, from_hours_before=2)`, media가 그 예약 반려동물 것인지 확인 → `fetch_as_data_url` → `MODEL_VISION` + `prompts/handoff_check/system.md` (check_type별 지시) → `HandoffFindings {pet_visible, species_match, crate_visible?, restraint_visible?, concerns:[str]}` (`chat_json`) → 서버 규칙으로 status: pet_checkin/return = `pet_visible && species_match` → ok / vehicle_safety = `pet_visible && (crate_visible \|\| restraint_visible)` → ok / 그 외 warning. 의학적 판단 금지("looks calm" 같은 관찰만). 실패·20 s 타임아웃 → `unchecked` (200). `handoff_checks(id, booking_id, handoff_kind, check_type, media_id, status, findings jsonb, override_reason text null, model, latency_ms, created_at)` service role insert | 샘플 4장 기대 결과 일치 (아래) |
| 6B.6 | 인수인계 연결 | `complete_handoff(p_booking, p_kind, p_check uuid default null)`로 확장 — check가 같은 예약·kind면 알림 제목에 "· photo verified ✅" (status ok일 때만). warning + **Continue anyway** → `override_reason` update (시터 RLS). 사진 없이도 Received 가능(카메라 없음·급한 상황) — 견주 알림은 일반 문구. 맡기기 Received 시 열려 있는 trip `end_trip`. **FB-9 합류 (2026-10-10):** Returned는 **확인 시트**("Max & Mochi are going home with Robert. This can't be undone." + 아직 안 한 오늘 할 일 수 · 알림장을 안 보냈다면 "Send today's note first?") 뒤에만 처리하고, 합의된 픽업 시각 **2시간 전부터**만 활성(Received와 같은 규칙, 서버에도 pick_up `handoff_too_early`) | 체크 ok/warning/없음 3경로 · Returned 확인 시트 · 너무 이른 시각이면 비활성 |
| 6B.8 | 동의 거부 대체 화면 (2026-10-10) | 위치를 공유하지 않는 이동의 **장소 카드**: 인수인계 장소 이름·주소 + **Open in Google Maps** 버튼 = `https://www.google.com/maps/search/?api=1&query=<주소 또는 좌표>` (새 탭, 앱 안 지도 없음). 보는 사람이 **이미 볼 수 있는 장소만** 쓴다 — 시터 집은 결제 후 견주(D31), 견주 집 주소는 예약 당사자 규칙(D24), `other`는 적어 둔 장소 문구. 출입 코드·buzzer는 링크·카드에 넣지 않음(03C 시간 조건 그대로). 상대 화면: "{name} isn't sharing a live location" 한 줄 + 같은 장소 버튼. 자동 도착 알림은 불가(위치 없음) — 수동 "I've arrived" 버튼 여부는 구현 때 확인 | 동의 거부 → 지도·ETA 없이 장소 + 버튼, 링크가 올바른 장소로 열림, 코드·좌표 외 개인정보 없음 |
| 6B.7 | 테스트 | Playwright `flows`: 데모 owner·sitter 두 컨텍스트 — sitter Simulate trip → owner ETA 갱신 → 도착 카드 → 샘플 사진 → Received → owner 토스트. (Realtime mock은 `supabaseMock.ts`에 `trips` 채널 추가) | CI 통과 |

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
6. 동의 거부 경로(6B.8)와 Returned 확인 시트·시각 가드(FB-9, 6B.6)를 Playwright로 확인

---

## 산출물

- `supabase/migrations/012_transit.sql`, `supabase/tests/rls_smoke.sql` (L)
- `backend/app/routers/ai_handoff_check.py`, `backend/app/schemas/handoff_check.py`, `backend/app/ai/prompts/handoff_check/system.md`
- `frontend/lib/location.ts`, `frontend/providers/TripProvider.tsx`, `frontend/components/TripMap.web.tsx` / `TripMap.tsx`, `frontend/app/{owner,sitter}/bookings/[bookingId]/trip.tsx`, `frontend/assets/demo/{routes,handoff}/*`
- 의존성: `leaflet` (웹 전용 import), `expo-location`

---

## AI 프롬프트

Playbook §8B — (6B.1 SQL) / (6B.2–6B.4 UI) / (6B.5 Vision) 세 번

---

## 다음 Phase

→ (시간이 남으면 [Phase 08 — 세이프티 stretch](phase-08.md)) → [Phase 10 — 데모·배포](phase-10.md) (06B가 P0 맨 마지막 — D41)
