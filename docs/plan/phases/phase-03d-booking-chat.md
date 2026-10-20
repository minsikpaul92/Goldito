# Phase 03D — 채팅 중심 부킹 (Stage 1 – 5를 한 채팅으로)

> **상태 (2026-10-17):** 시작 전 · P0 (결정 2026-10-17, Minsik). 에픽: [#130](https://github.com/minsikpaul92/Goldito/issues/130). **담당 (2026-10-19):** Minsik = 3D.1 ([#138](https://github.com/minsikpaul92/Goldito/issues/138)) · 요청 화면 단순화 ([#168](https://github.com/minsikpaul92/Goldito/issues/168)) · 3D.4~3D.9. JeonBeomGu-S = 사진 한 줄과 뷰어 ([#136](https://github.com/minsikpaul92/Goldito/issues/136)) · 3D.3 ([#140](https://github.com/minsikpaul92/Goldito/issues/140)). 03B의 시터 검색(PR #128)이 먼저 머지되어야 한다.

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D27–D47, **D29 견적 · D31 보안 해제 · D35/D36 시터 말투·승인 · D38 타이핑 최소**

## Goal

오너가 호텔을 찾듯 시터를 검색하고(날짜 · 시간 · 펫 · 반경), 시터 상세에서 **채팅 시작**을 누르면 견적 · Meet & Greet · 예약 합의 · 결제 · 인계 · 케어 · 종료 · 리뷰가 **같은 채팅 하나**에서 진행된다. 채팅 위에는 부킹 진행도가 있고, 같은 오너–시터는 계속 같은 채팅을 쓰며 히스토리가 남는다. 뒤로 가면 채팅 목록이 나온다. 기존의 "Ask before booking"과 "Book care"는 없어진다.

## 시나리오 (오너 / 시터)

1. 검색 → 시터 상세 → **Start chat**. 첫 카드에 날짜 · 시간 · 펫이 자동으로 보인다.
2. 오너: 케어 되나요? → 시터: 가능, 견적(시터 설정 요금 × 시간 · 마릿수 · 인계 방식) 자동.
3. 오너: 요구사항 문의 → 시터: 추가요금 안내 → 오너 수용 → 시터: 최종 견적 → 오너: 확인.
4. 오너: Meet & Greet 요청(온라인/오프라인 · 시간 · 장소) → 시터 동의. 재방문 쌍은 건너뜀.
5. 오너 "예약하겠습니다" + 시터 "받겠습니다" → **둘 다 동의** → **오너 결제(데모) → 예약 확정**.
6. 인계: 오너와 시터의 저장된 기본 방식이 같으면 협의 없음, 다르면 요청 → 재요청 → 최종 수락. 세 가지 방식(오너가 감 · 시터가 데리러 옴 · 다른 곳) 유지.
7. 케어 당일: 트립 시작 → 출발 알림 · 5분 전 · 도착 알림 → 인사. 케어 중 홈에서 밥 · 산책 · 응가 · 낮잠 완료 → 오너 알림. 사진 요청 → 사진 + 한 줄. 저녁 다이어리 카드 → 누르면 다이어리.
8. 종료: 오너 데리러 감(트립) → 시터 Done → 서로 리뷰. **오너의 시터 리뷰는 공개, 시터의 오너 리뷰는 쓴 시터만 본다.**

## 채팅 화면 구조 (2026-10-19 결정: 카드 + 푸터)

**채팅은 상태를 갖지 않는다.** 예약의 진실은 `bookings`와 `booking_stage()` · `booking_next_actor()`(D60)에 있고, 채팅은 그걸 그리고 버튼을 눌러 줄 뿐이다.

- **카드 = 기록.** 견적 · Meet & Greet · 합의 · 결제 · 인계 · 트립 카드가 대화에 쌓인다. 카드는 복사된 값이 아니라 **DB의 현재 상태를 읽어 그린다**(한쪽이 수락하면 상대 화면의 카드도 바뀐다). 끝난 카드는 한 줄 요약으로 접히고, 진행 중인 카드만 버튼을 가진다.
- **푸터 = 지금 내 차례의 한 가지.** composer 바로 위에 큰 버튼 하나(`Request booking` · `Accept` · `Pick a Meet & Greet time` · `Pay`). 누르면 그 카드가 시트로 열린다. 내 차례가 아니면 "Waiting for Chloe"만 나온다. 이 한 줄은 AI 없이 `booking_next_actor`만으로 나온다.
- **+ 메뉴**: 가끔 쓰는 행동(날짜 변경 · 사진 요청 · 취소).
- 예약이 없을 때 푸터는 `Request booking` 하나다. 시터 상세의 "Ask before booking"과 "Book"은 **`Start chat` 하나**로 합친다. 채팅의 Stay 카드에서 `Request booking`은 당분간 지금의 예약 화면으로 연결하고, #144가 채팅 안 흐름으로 바꾼다.

## 채팅 AI (D4b, #142 · D62)

- **칩은 두 종류.** 말 칩: 상대의 마지막 말에 대해 내 쪽 조건에 맞는 2–3개(시터: 요금 · 캘린더 · 정책, 오너: 펫 · 날짜 · 프로필) → 누르면 composer에 내 말투의 짧은 초안 → 고치고 Send. 행동 칩(아이콘으로 구분): 눌러서 카드를 연다. 직접 입력도 항상 된다.
- **행동은 코드가 정한 목록 안에서만.** 예약 단계와 `booking_next_actor`로 지금 가능한 행동 집합을 코드가 만들고, AI는 마지막 메시지의 의도를 보고 그중 하나를 고르거나 아무것도 고르지 않는다(확신이 낮으면 아무것도 띄우지 않는다). 같은 호출에서 JSON으로 `{ 의도, 행동, 말 칩 }`을 받아 서버가 검증한다. 가격 · 날짜 · 가용성은 코드가 채우고, 칩이나 카드를 **누르는 것은 항상 사람**이다(자동 전송 없음, 이유 표시 없음).
- **예시.** (오너) "예약하면 얼마예요?" → 시터에게 `견적 보내기`(서버가 계산한 견적 카드가 미리 채워지고 시터가 추가 요금을 고쳐 보낸다) · (오너) "먼저 만나볼까요?" → 시터에게 `Meet & Greet 제안` · (오너) "금요일로 바꿔도 돼요?" → 코드가 먼저 가용성을 보고 `날짜 변경 수락` 또는 `다른 날짜 제안` · (시터) "견적은 $240" → 오너에게 `견적 수락 · 예약 요청` · (시터) "사료를 챙겨 오세요" → 오너에게 `체크리스트에 추가`(예약별 챙길 것 목록이 필요하다. 지금은 시터 프로필의 공용 목록뿐이라 3D.8과 함께 만든다).
- **컨텍스트는 Redis 없이 Postgres에서:** 마지막 ~20개 메시지 + 스레드에 저장한 요약(길어지면 갱신) + DB의 구조화된 사실(부킹 단계 · 날짜 · 펫 · 견적 · 시터 정책 · 요금 · 오너 프로필) + RAG(pgvector, Life Record). 백엔드는 상태가 없다. 호출은 **상대 메시지가 새로 왔을 때 받는 쪽에서 한 번**, 메시지 id로 결과를 캐시한다.
- 가격 · 날짜 · 가용성은 코드가 DB에서 넣고 모델은 쓰지 않는다. 출입 코드는 프롬프트에 넣지 않는다. 상대 메시지는 데이터이지 지시가 아니다. 칩을 눌렀는지 닫았는지 로그로 남겨 "제안 채택률"을 지표로 쓴다.
- **순서.** #140 상세(See schedule · Start chat, Minsik가 가져옴) → #142 전반부(말 칩 · AI 초안 답장, 옛 문의 화면 제거) → #143 견적 카드(먼저 사람이 누르는 버튼) → #142 후반부(행동 칩을 견적 · Meet & Greet 카드에 연결) → #144.

## 3D.7 Meet & Greet · 합의 · 최종 견적 · 결제 ([#144](https://github.com/minsikpaul92/Goldito/issues/144), 2026-10-20 Minsik 확정)

**시나리오 (이 단계는 1 ~ 7, 8은 #145 · #146)**

1. 오너가 날짜 · 펫으로 시터를 찾아 채팅을 시작한다. 첫 카드(Stay)에 날짜, 시간, 펫.
2. 인사하고 시터가 맡을 수 있는지 답한다. 오너의 **Request booking은 확정이 아닌 간 보기**다(Meet & Greet이 일어날 `bookings` 행을 만든다).
3. 맡을 수 있으면 시터가 **견적**을 준다(금액이 맞아야 맡기므로). 시터의 첫 yes(`express_interest`)가 날짜 홀드.
4. **처음 보는 쌍만** Meet & Greet. 필수 아님, 둘 다 건너뛰기로 하면 둘 다 동의로 보고 진행. 하면 온라인/오프라인, 시간, 장소.
5. 만난 뒤 **오너 "I'd like to book"**(체크리스트, 펫, 시간, 가격 요약을 보고 Confirm이 오너의 결정)와 **시터 "I accept"**. 순서 자유, 둘 다 있어야 한다.
6. 둘 다 동의하면 **시터가 최종 견적**을 보내고(견적 카드, 수수료 포함) 오너가 확인한다.
7. 오너 **결제(데모)** = 부킹 완료. 돈은 케어가 끝날 때까지 보관된다(문구만, 정산은 #146).
8. 인계, 케어, Returned, 리뷰, 시터 정산은 #145 · #146.

반복 쌍은 Meet & Greet과 "만난 뒤 결정"(5)만 건너뛴다. 오너 컨펌 이후는 같다. 채팅 화면은 **최종 견적이 확인되어야** Pay 버튼을 보여 주고, DB는 견적 카드가 없어도 결제를 막지 않는다(기존 부킹 화면과 데모 시드 그대로). 카드가 있으면 수락한 수수료를 가격에 더한다.

**지금 있는 것 (코드를 읽고 정리, 2026-10-20)**

| 무엇 | 이미 있음 | 이 단계에서 |
| :--- | :--- | :--- |
| 단계 | `booking_stage` / `booking_next_actor` (011l): requested → meet_greet → confirm → awaiting_payment → paid → in_care → completed. 반복 쌍(`not_needed`)은 `requested`에서 시터 Accept 한 번 | 반복 쌍도 `confirm`으로. `confirm`의 다음 차례는 "아직 동의 안 한 쪽" |
| 시터 첫 yes | `express_interest` | 변경 없음 |
| Meet & Greet | `propose_meet_greet`(제안 · 역제안은 같은 RPC), `respond_meet_greet`, `complete_meet_greet`, `request_skip_meet_greet`, `respond_skip_meet_greet`, `get_meet_greet_options`. Meet 링크는 FastAPI `/api/meet-greet/video-link` (앱 `lib/meetGreet.ts`) | RPC 변경 없음. 채팅 카드가 `MeetGreetCard`를 재사용 |
| 동의 | 오너: 요청 자체. 시터: `respond_booking(true)`가 곧바로 `confirmed` | `bookings.owner_agreed_at` / `sitter_accepted_at`, 새 RPC `agree_to_book`, 둘 다 있을 때 `confirmed` |
| 결제 | `pay_booking_demo`: 서명 확인 후 `quote_booking` 재계산 → `paid_at`, `price_snapshot`. 009d가 일정 변경 시 재계산 | 확인된 최종 견적의 수락 수수료를 SQL에서 더해 `price_snapshot.extras`, `total` |
| 채팅 | 014j 스레드, 014k 요청 카드, 014n 견적 카드(상태 jsonb), Realtime INSERT/UPDATE 구독 | `meet_greet` · `agreement` · `payment` 카드(`{type, booking_id}`만 저장, DB 상태를 읽어 그림) |
| 앱 | `BookingStageBar`(첫 만남 5칸, 반복 4칸), 채팅 푸터는 `Request booking` / `Send quote`만 | 푸터는 지금 내 차례 한 가지, 맨 위에 고정된 원 5개 |

**정한 것**

- `status`의 의미는 그대로다. `confirmed` = 둘 다 동의(결제 대기), 화면의 "부킹 완료"는 `paid_at`이 찍힌 `paid` 단계.
- 최종 견적 = 부킹이 `confirmed`가 된 뒤 보낸 견적 카드. 수수료는 서비스 · 드롭오프 · 픽업 · 펫이 부킹과 같은 확인된 가장 새 견적에서만 읽는다(SQL, 모델 글 없음, 반올림은 03C 그대로).
- 카드 게시는 bookings 트리거가 한다(3B 화면에서 진행해도 채팅에 남음). 마이그레이션 `014o_chat_booking_cards.sql`.
- 진행 원은 늘 5개(`Request · Meet · Confirm · Pay · Stay`), 반복 쌍은 Meet이 체크된 채로 보인다.

## 단계 (GitHub 이슈 = 상태 · 체크리스트의 정본)

| ID | 단계 | 이슈 | 의존 |
| :--- | :--- | :--- | :--- |
| 3D.0 | 문서: full-process · architecture · test-guide 갱신 | [#130](https://github.com/minsikpaul92/Goldito/issues/130) | PR #128 |
| 3D.1 | 시터 검색 후속 (라이브 갱신 · 기본 5 km · 즐겨찾기 · 상세로 이동) | [#138](https://github.com/minsikpaul92/Goldito/issues/138) | PR #128 |
| 3D.2 | 시터 온보딩 · 구조화 프로필 | [#139](https://github.com/minsikpaul92/Goldito/issues/139) | — |
| 3D.3 | 시터 상세 + Start chat | [#140](https://github.com/minsikpaul92/Goldito/issues/140) | 3D.1 · 3D.2 · 사진 · 캘린더 |
| 3D.4 | 채팅 허브 (스레드 · 목록 · 진행도) | [#141](https://github.com/minsikpaul92/Goldito/issues/141) | 3D.3 |
| 3D.5 | AI 칩 · 초안 | [#142](https://github.com/minsikpaul92/Goldito/issues/142) | 3D.4 |
| 3D.6 | 채팅 안 견적 · 추가요금 (구현: 시터 한 번 눌러 견적 카드, 수수료 줄, 오너 수락 · 확인) | [#143](https://github.com/minsikpaul92/Goldito/issues/143) | 3D.4 |
| 3D.7 | Meet & Greet · 합의 · 결제 | [#144](https://github.com/minsikpaul92/Goldito/issues/144) | 3D.6 |
| 3D.8 | 인계 협의 · 트립 · 케어 연결 | [#145](https://github.com/minsikpaul92/Goldito/issues/145) | 3D.7 |
| 3D.9 | 종료 · 리뷰 | [#146](https://github.com/minsikpaul92/Goldito/issues/146) | 3D.8 |

함께 진행(같은 QA 피드백): 현재 위치 [#131](https://github.com/minsikpaul92/Goldito/issues/131) · Privacy 아코디언 [#132](https://github.com/minsikpaul92/Goldito/issues/132) · 취소 부킹 빈 카드 [#133](https://github.com/minsikpaul92/Goldito/issues/133) · 캘린더 빗금 [#134](https://github.com/minsikpaul92/Goldito/issues/134) · 프로필 사진 [#135](https://github.com/minsikpaul92/Goldito/issues/135) · [#136](https://github.com/minsikpaul92/Goldito/issues/136) · [#137](https://github.com/minsikpaul92/Goldito/issues/137) · 헤더 정리(Muk) [#147](https://github.com/minsikpaul92/Goldito/issues/147).

## 3D.2 시터 온보딩 설계 ([#139](https://github.com/minsikpaul92/Goldito/issues/139), 2026-10-17 Minsik 결정)

**지금 만든다 (타이핑 우선)**

- **번호 매긴 질문 목록 + 질문마다 텍스트 박스.** 전부 건너뛸 수 있다. 정해진 선택지가 있는 질문(여러 오너 동시 · 한 번에 맡는 마릿수 · 고양이 · 강아지 크기 · 인계 방식 등)은 박스 옆에 칩이 있어 칩 한 번으로 `choice`가 정해지고 박스는 덧붙이는 말이다.
- 마지막 단계는 **검토 → 고치기 → 완료**. 완료해야 저장되고 `onboarded_at`이 찍힌다. 기존 시터는 Profile에서 같은 화면으로 고친다.
- **자기소개 한 단락**(= `sitter_profiles.bio`)과 **직접 추가하는 Q&A**(`custom_1` – `custom_5`, 질문 문구는 시터가 쓴다).
- **언제 가능한지**: 요일별 가능 시간대(= 기존 `save_closing_rules` · `save_weekday_hours`)와 안 되는 날짜(= `sitter_availability` blocked)를 같은 온보딩 안에서 탭으로 등록해 Schedule에 바로 반영한다. 새 테이블은 만들지 않는다.
- **사진**: 얼굴 사진 1장 + 펫과 함께 찍은 사진 여러 장. 사진 갤러리는 [#135](https://github.com/minsikpaul92/Goldito/issues/135)의 `profile_photos` · `ProfilePhotoGallery`를 쓰므로 #135의 시터 쪽 데이터 · 컴포넌트를 먼저 한다(온보딩 화면 단계에서 끼워 넣음).
- DB: `014f_sitter_profile_answers.sql` — `sitter_profile_answers`(시터당 질문 키 하나, `answer` ≤ 300자, `choice`, `source` typed|voice, `quote`) + `save_sitter_answers(answers, intro, finish)`. 오너는 모든 시터의 답을 읽고 쓰기는 시터 본인의 RPC뿐이다. `multiple_owners` → `accepts_multiple_owners`, `max_pets` → `default_max_pets`로 복사된다(예약 규칙이 읽는 값). 인계 방식은 답에만 두고 #145가 기본값으로 읽는다.

**음성 입력 — 문서만, 구현은 뒤로 (Groq 키는 [#158](https://github.com/minsikpaul92/Goldito/issues/158)에서 나중에 넣는다)**

1. 마이크 버튼을 누르면 **텍스트 박스는 접히고 번호 목록만 크게 남는다.** 시터는 목록을 보면서 **"First… Second… Third…"처럼 번호를 말하며** 하나씩 답한다 — 파싱 정확도를 위해 화면이 "Say the number first" 힌트를 계속 보여 준다.
2. 말하는 동안 **약 7초 청크로 전사해 화면에 이어서 보여 준다.** 시터가 자기 목소리가 제대로 들리는지 그 자리에서 확인한다. (`POST /api/ai/transcribe` — Groq `whisper-large-v3-turbo`, 녹음은 저장하지 않음. 11.15 펫 음성도 이 엔드포인트를 쓴다.)
   - **녹음 상한 180초.** 질문이 10개 안팎이라 한 번에 100~150초 말할 수 있다. 남은 시간 타이머, 일시정지 · 이어서 녹음.
   - **최종 텍스트 = 전사된 청크를 이어 붙인 것.** 전체를 다시 전사하지 않는다(오디오 사용량이 2배가 되고, 시터가 어차피 전사문을 보고 고친다). 청크 경계에서 단어가 끊기면 시터가 그 자리에서 고친다.
   - 화면은 "번호를 말하고, 답하고, 1초 쉬고, 다음 번호"를 안내한다. 번호 사이의 침묵이 청크 경계로 쓰이면 단어가 덜 잘린다.
   - 청크 하나가 실패하면 그 청크만 다시 보낸다.
3. 끝내면 **전사문 전체를 보여 주고 "Record again" 또는 "Send"를 고른다.** Send 하면 `POST /api/ai/sitter-profile-parse`(MODEL_FAST, JSON)가 번호와 질문 키에 맞춰 칸을 채운다. 값마다 전사 속 근거 문장(`quote`)이 있어야 하고 없으면 버린다. 전사문은 데이터이며 지시가 아니다.
4. 검토 화면에서 채워진 칸은 "✨ from your voice"와 근거 문장이 보이고, 못 들은 질문은 비어 있다. 시터가 고치고 완료한다.
5. **가능한 날 / 안 되는 날도 음성으로 받는다.** "Weekdays yes, weekends no, not October 25" → 파서가 요일별 가능 시간대와 안 되는 날짜 목록을 만들고, 검토 화면의 같은 요일 · 날짜 위젯을 채운다. 시터가 확인한 뒤에만 `save_closing_rules` / blocked 행으로 Schedule에 등록된다(AI는 제안만).
6. 확인할 것(구현 때): iPhone Safari(mp4) · Chrome(webm) 청크 업로드, Groq 무료 플랜 약관의 데이터 취급.
   - **한도 계산(문서의 무료 플랜 수치, Groq에서 직접 확인하지는 않음):** 분당 20요청 · 시간당 오디오 7,200초 · 하루 28,800초. 7초 청크면 녹음 길이와 상관없이 분당 8~9요청이라 한도 안이고, 150초 녹음이면 시간당 약 48명까지다. 2~3초 청크는 분당 20~30요청이라 한도를 넘으므로 쓰지 않는다. 한도 키 하나를 모든 사용자가 나누므로 동시 사용이 많으면 합쳐서 센다. 한도에 걸리면 청크 전사를 끄고 녹음이 끝난 뒤 한 번에 보내는 방식으로 바꾼다.

**PR A (시터 온보딩, 이 브랜치)**: ① `014f` 마이그레이션 + RPC + 스모크 ✅ → ② 번호 질문 화면(텍스트 박스 + 칩, 검토 · 완료, 새 시터 게이트, Profile → Edit your answers) ✅ → ③ 가능한 날 등록(기존 Closing rules 시트 + 쉬는 날 선택, Finish 때 한꺼번에 Schedule에 기록) ✅ → ④ (보류) 음성. **시드(데모 시터 Chloe · Paul의 답변)는 오너가 그 답을 읽는 시터 상세(#140)와 함께 한다** — 읽는 화면이 있어야 시드가 들어갔는지 눈으로 확인되고, 호스팅 DB의 `014f` 적용 뒤에 돌린다(2026-10-17 결정).

**PR B (프로필 사진, 별도 브랜치)**: #135 · #136 · #137 — 시터와 오너 모두, `profile_photos` + 라운드 크롭 갤러리. 머지된 뒤 온보딩에 사진 단계(얼굴 1장 + 펫과 함께 찍은 사진)를 작은 커밋으로 끼운다. 사진이 온보딩보다 먼저일 이유는 없어서 순서를 바꿨다(2026-10-17).

## 방침

- 트립 · 다이어리 · 리포트 · 리뷰 화면은 **다시 만들지 않는다.** 1차는 채팅 카드에서 기존 화면으로 연결.
- 새 마이그레이션은 `supabase/README.md` § Naming의 다음 빈 이름을 쓴다. 호스팅 DB 적용은 사용자가 요청할 때만.
- 브랜치 · PR은 묶음별로 제안: ① 빠른 수정 + 캘린더(#131 – #134) ② 사진(#135 – #137) ③ 검색 후속 + 시터 프로필(#138 – #140) ④ 채팅(#141 – #146). 각각 한 PR.

## 함께 정리할 QA 이슈 (2026-10-19, 담당 JeonBeomGu-S)

채팅 카드가 대체하는 화면이 있어서 순서를 지킨다. 먼저 독립적인 것, 채팅이 바꿀 화면은 해당 3D 단계 전에 Minsik과 확인한다.

| 이슈 | 내용 | 채팅과의 관계 |
| :--- | :--- | :--- |
| [#173](https://github.com/minsikpaul92/Goldito/issues/173) | UI 문구의 대시 제거, Cancelled 칩 | 독립. 먼저 |
| [#172](https://github.com/minsikpaul92/Goldito/issues/172) | 같은 날 보딩 견적이 "0 nights"로 나옴 (거짓 문구) | 독립. 견적 카드 [#143](https://github.com/minsikpaul92/Goldito/issues/143) 전에 |
| [#189](https://github.com/minsikpaul92/Goldito/issues/189) | 가격이 비면 `rates_not_set` (R60-6) | 독립 |
| [#169](https://github.com/minsikpaul92/Goldito/issues/169) | 시간 제안을 한 번에 (드롭오프와 픽업) | 3D.6 [#143](https://github.com/minsikpaul92/Goldito/issues/143)이 대체할 수 있음. 시작 전 확인 |
| [#170](https://github.com/minsikpaul92/Goldito/issues/170) | Meet & Greet 선택임을 분명히, 구글 캘린더 | 3D.7 [#144](https://github.com/minsikpaul92/Goldito/issues/144)이 대체할 수 있음. 시작 전 확인 |
| [#171](https://github.com/minsikpaul92/Goldito/issues/171) | 문의 채팅 수정 | 문의 흐름 결정 전까지 보류 (3D.5 [#142](https://github.com/minsikpaul92/Goldito/issues/142)) |
| [#179](https://github.com/minsikpaul92/Goldito/issues/179)~[#182](https://github.com/minsikpaul92/Goldito/issues/182) | 달력 한 번에 선택, 선택 입력 숨기기, 카드 축소, 라인 아이콘 | 묵의 Expressive 룩([#177](https://github.com/minsikpaul92/Goldito/issues/177)) 머지 후 가능 |

