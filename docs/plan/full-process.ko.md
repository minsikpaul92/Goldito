# PawNote 전체 서비스 흐름 (Full Process) — 제품 흐름 정본

> **Status:** 2026-10-01 확정 (architecture **D27–D34**), 2026-10-02 보강 (**D35–D42**: 시터 말투 레이어 · 시터 승인 · 사람 속도 전달 · 모델 정책 · 변경 요청 · 위치 동의 · mood meter). 팀 시나리오 "PawNote Full Process"(PDF, 리포에 넣지 않음)를 앱 설계로 옮긴 문서입니다. 원문의 "PetNote"는 PawNote입니다.
> **이 문서가 제품 흐름의 정본입니다.** 루트 README(심사위원용), 데모 영상, Phase 순서([phases/README.ko.md](phases/README.ko.md)), [TODO.md](TODO.md)가 이 흐름을 따릅니다. 스키마·API 세부는 phase 문서와 [architecture.ko.md](phases/architecture.ko.md)가 정본입니다.
> **UI·AI 출력은 영어** (D1). 아래 영어 문구는 화면 카피 초안입니다.

---

## 0. 한 문장으로

견주가 **문의**하면 AI가 **시터의 말투(1인칭)로 초안**을 쓰고 시터가 승인해 보내고(자동 모드면 사람 속도로) → **케어·투약 의뢰서**가 시터의 체크리스트가 되고 → **동의서·결제** 후 출입 정보가 제때만 열리고 → **Uber처럼 실시간 이동**으로 맡기고 → 시터는 **5초 체크 + 사진**만, AI가 알림장을 쓰고 → **무사 귀가·리뷰** 후 모든 돌봄 기록이 **Pet Life Record + RAG**에 쌓여 다음 돌봄(다른 시터여도)에 다시 쓰인다.

영감: **Rover**(예약·빠른 응답) × **KidsNote**(투약의뢰서·등하원·알림장·앨범) × **Uber**(실시간 이동) + **AI/RAG** (Nebius Token Factory).

---

## 1. 5단계 한눈에

```
┌─ Stage 1. Inquiry ───────────────┐   Owner: 서비스 방식 + 날짜 + 반려동물 + 질문 1줄
│  AI draft in sitter's tone (RAG)│   AI: 시터 캘린더 · 요금(공휴일·다두 할증) · 정책 · Life Record → 초안 → 시터 승인
└──────────────┬───────────────────┘
               ▼
┌─ Stage 2. Meet & Greet ──────────┐   Owner: 케어·투약 의뢰서 (식사·투약·산책·주의사항)
│  Care request → mission checklist│   AI: 의뢰서 → 시터 미션 체크리스트 · Meet & Greet (대면/영상)
│  Owner drives / Sitter drives    │   이동 방식 선택
└──────────────┬───────────────────┘
               ▼
┌─ Stage 3. Booking ───────────────┐   견적 → 캐나다형 안전·귀가 동의서 → 결제(데모)
│  Consents · payment · unlock     │   보딩: 결제 즉시 시터 집 주소·Visitor parking·짐 체크리스트
│                                  │   견주 집 출입(lockbox·buzzer): 인수인계 2시간 전에만 해제
└──────────────┬───────────────────┘
               ▼
┌─ Stage 4. Care & Pet Transit ────┐   이동: Start trip → 실시간 GPS·ETA → 도착 알림 → 사진 → Vision AI 확인
│  Live trip · 5-second check ·    │   돌봄: 5초 체크 + 사진 2장 → AI 알림장 → 견주 실시간 알림
│  AI daily note · album           │   앨범: AI가 사진을 식사·산책·휴식으로 분류 (날짜별)
└──────────────┬───────────────────┘
               ▼
┌─ Stage 5. Completion ────────────┐   귀가 사진 + 최종 리포트 ("home safe") → ★ 리뷰 요청
│  Pet Life Record → RAG           │   돌봄 데이터 → Pet Life Record → RAG → 다음 예약에서 다시 사용
└──────────────────────────────────┘
```

---

## 2. 단계별 상세

### Stage 1 — Inquiry (초기 문의) · 목표: RAG 기반 초고속 맞춤 응대

| 누가 | 무엇을 |
| :--- | :--- |
| **Owner** | 시터 프로필에서 **Ask about a stay** → 서비스 방식(**A. House sitting** — 시터가 내 집으로 / **B. Boarding** — 시터 집에 맡김), 맡기기·찾기 날짜·시각, 반려동물 선택(프로필 자동 첨부: 종·품종·나이·알레르기·주의사항), 질문 1줄(선택) |
| **PawNote AI** | 문의가 오면 몇 초 안에 **시터의 말투(1인칭, "I can take Bori…")로 답장 초안**을 만든다 (D35). 근거: ① 그 시터의 **캘린더**(가능 여부) ② **요금 정책**(기본·**공휴일 할증**·**다두 할증**) → 서버가 계산한 견적 ③ 시터의 **정책 문서**(포함 서비스·취소·집 규칙) ④ 이 반려동물의 **Pet Life Record**·지난 대화 (RAG) ⑤ 시터의 **말투 스타일 가이드 + 과거 답변 예시** |
| **Sitter** | 알림 "Jisoo sent an inquiry — draft ready" → 스레드에서 초안을 보고 **Send**(그대로) · **Edit / Add**(수정·추가) · **Regenerate** · 의도 칩(수락 / 거절 / 다른 날짜 제안)으로 초안 방향을 바꿀 수 있다. 시터는 한 글자도 안 써도 된다 (D38). 초안 위에 "AI drafts can be wrong. You're responsible for what you send." 문구 (D36) |
| **왜** | 마켓플레이스에서는 견주가 **먼저 답한 시터**에게 예약하는 경우가 많다 → 바쁜 시터도 응답 속도를 유지하면서, 견주는 **시터와 직접 대화하는 느낌**을 받는다 (원문: Rover의 빠른 응답 환경) |

**발송 모드 (D36 · D37)**

| 모드 | 동작 | 사람 속도 연출 |
| :--- | :--- | :--- |
| **수동 승인** (기본) | 시터가 **Send**를 누르는 즉시 발송. 견주 화면에서 시터가 승인해 보낸 메시지는 **시터의 메시지**로 표시된다 (메시지마다 "AI" 라벨 없음) | 없음 (시터가 실제로 읽고 누른 시간이 곧 응답 시간) |
| **자동 발송** (옵션, 시터가 켬) | 시터가 N분 안에 안 보면 초안이 자동으로 나간다. **켜는 순간 책임 동의 모달**을 띄운다: "Replies go out in your name. You're responsible for what's sent." | 견주 메시지 아래 **읽음 "1"** → 5~10초 뒤 사라짐(읽음) → 10~15초 뒤 답장 = **총 약 30초**. 글자 수별 지연 공식은 **슬기가 정한다 (TBD, §9)**. 메시지 구조(1개/분할)도 미확정 |

- **데모 영상**에도 같은 사람 속도 연출을 쓴다 (장면 ①). 알림장·캡션에는 인위적 지연을 쓰지 않는다 (D37).
- **AI 사용 고지:** 메시지마다 라벨은 붙이지 않는다. 대신 ① 이용약관·시터 온보딩에 "시터가 AI 작성 보조를 쓸 수 있음"을 한 번 고지 ② 자동 발송 모드의 시터 프로필에 한 줄("Mina uses PawNote's assistant for quick replies") ③ 견주가 "Are you an AI?"처럼 직접 물으면 사람이라고 답하지 않고 시터에게 알린다 (D36).
- **계속 배우는 말투 (D35):** 시터가 초안을 **그대로 보냄 / 수정해서 보냄 / 다시 생성**한 결과가 시터별 예시 풀(`tone_samples`)에 쌓여, 다음 초안의 few-shot에 쓰인다. 수정 비율(edit ratio)이 줄어드는 곡선이 학습 지표다.
- 숫자(가격·날짜·가능 여부)는 **서버가 계산**하고 AI는 문장만 쓴다 (D29) — 답변 아래에 견적 카드가 같은 숫자로 붙는다. 안전 경고·견적 숫자·동의서는 **고정 문구**로 말투 레이어를 거치지 않는다 (D35).
- 다음 액션: **Request booking**(문의 내용 자동 입력) · **Schedule Meet & Greet**.
- Phase: **07B** (문의 스레드 + AI 답변 + RAG), 견적 계산은 **03C**.

### Stage 2 — Meet & Greet (사전 미팅) · 목표: 말로 전하다 생기는 누락 방지, 요구사항 구조화

**2-1. 케어·투약 의뢰서** (KidsNote 투약의뢰서 / 원아 케어 요청서 방식)

견주가 메모하듯 쓴다 (견주 텍스트는 허용):

```
Meals: 8:00 AM — 1 cup of kibble
Medication: 2:00 PM — 1 skin pill, hidden in a lickable treat
Heads-up: No knocking or doorbell — text me instead.
          Keep other dogs away on walks.
```

→ AI(Nemotron Super)가 **시터 미션 체크리스트**로 구조화 → 견주가 확인 후 저장:
`care_tasks` (Feeding 08:00 "1 cup kibble" · Medication 14:00 "Skin pill ×1 — with a treat") + `pet_cautions` ("Text instead of knocking", "No other dogs on walks"). 시터 Today·예약 요청 카드에 **Heads-up** 카드로 고정. 저장된 의뢰서는 다음 예약에 그대로 재사용.

**2-2. Meet & Greet** — 대면(**In person**) 또는 영상(**Video call**) 시각을 제안 → 상대방 수락 → 끝나면 **Done** (이미 만난 사이면 **Skip**). 확인할 것 체크리스트: 케어 요구사항 · 특이사항 · 이동 동선 · 인계 방식 · 주의사항.

**2-3. 이동 방식** — 맡기기·찾기마다 고름 (= 인수인계 장소, D28):

| 이동 방식 | 장소 | 누가 움직이나 |
| :--- | :--- | :--- |
| **Owner drives** | Sitter's place | 견주가 시터 집으로 → Drop-off / 다시 와서 Pick-up |
| **Sitter drives** | My place | 시터가 차·도보로 견주 집으로 → 반려동물 인수 / 귀가 |
| (Somewhere else) | 기타 장소 1줄 | 둘 다 (P0 데모는 위 두 가지) |

House sitting은 돌봄 장소가 견주 집이라 시작·끝 모두 **Sitter drives**로 고정.

서비스 방식과 이동 방식은 **문의·Meet & Greet 단계에서 협의**하고, **예약 확정 시 하나로 고정**된다 (D40, 아래 Stage 3).

- Phase: 의뢰서·체크리스트 **06** (AI 6.12), Meet & Greet·이동 방식 **03B**.

### Stage 3 — Booking (예약 확정) · 목표: 캐나다 맞춤 안전 동의서 + 조건부 보안 해제

1. 시터가 요청 수락 → 견주 **Checkout**: 서비스·이동 방식 확정 + **견적**(기본·다두·공휴일, CAD) 
2. 선택한 옵션에 맞춘 **전자 동의서**가 자동으로 정해짐 (규칙 기반, D30) → 항목마다 체크 + 이름 입력 서명
3. **결제** (해커톤: **데모 결제** — 카드 정보 없음, D30)
4. **조건부 보안 해제** (D31)

| 옵션 | 필요한 동의·정보 | 보안 해제 |
| :--- | :--- | :--- |
| **A. House sitting / Drop-in** (견주 집) | Lockbox 번호·열쇠 사용 동의 · 콘도 Buzzer/Fob 사용 권한 · **24시간 응급 동물병원 진료비 승인**(한도) | 결제 후에도 잠김 → **돌봄 시작 2시간 전**에만 시터 앱에서 Lockbox 번호·출입 방법 공개 |
| **B. Boarding / Daycare** (시터 집) | Drop-off·Pick-up 시간 규정 · 시터 집 **Visitor parking** 규정 · **합사 동의서**(다른 반려동물과 함께 지냄) · 응급 진료 승인 | **결제 즉시** 견주에게: 시터 집 상세 주소 · Visitor parking 위치 · 짐 체크리스트(사료·방석·약·리드줄…) |
| **Sitter drives** 인수인계가 있으면 (B에서도) | 견주 집 출입 동의 (Lockbox·Buzzer) | 그 인수인계 **2시간 전**에만 출입 정보 공개 |
| 공통 | **Safe return**(귀가 시 받을 사람) | — |

- **확정 후 변경 요청 (D40):** 서비스 방식·이동 방식은 확정과 함께 고정된다. **견주와 시터 모두 변경을 요청**할 수 있고, **상대가 승인해야** 적용된다. 한쪽이라도 거부하면 **변경 요청만 취소**되고 원래 예약은 그대로 유지된다. (예약 자체를 취소하는 흐름은 기존 03B 취소 규칙을 따른다.)
- 출입 정보가 열릴 때마다 기록 + 견주 알림 "Mina can now see your entry info". 끝나면 다시 잠김.
- 출입 정보는 **RAG·AI 입력·알림 본문에 절대 넣지 않음** (D31).
- Phase: **03C**.

### Stage 4 — Care + Uber-style Pet Transit + AI 스마트 알림장 (핵심 실행 단계)

**4-1. Scenario 1 — Owner drives** (견주가 시터 집으로)

0. **위치 공유 동의 (D41)** — 이동하는 쪽이 **Start trip**을 누르면 먼저 앱 동의 화면이 뜬다: "Share your live location with Mina until you arrive?" (**누구에게 · 언제까지**를 명시, 도착하면 자동 종료) → **Allow**를 누르면 그다음에 브라우저/OS 위치 권한 팝업. 동의하지 않으면 위치는 공유되지 않는다 (대안 흐름은 §9 TBD).
1. 견주 **Start trip** → 시터 화면: 견주 실시간 위치 · 지도 · **ETA**
2. 시터 집 근처(150 m) 도착 → 시터: "**Jisoo has arrived** 🚗" / 견주: **Visitor parking** 위치 · 로비 안내 카드
3. 체크인: 인계 → 시터가 사진 1장 → **Vision AI**가 상태 확인(반려동물이 보이고 이상 신호 없음) → **Received** → 견주 Push "**Bori checked in at Mina's ✅**"

**4-2. Scenario 2 — Sitter drives** (시터가 견주 집으로)

1. 시터 **Start trip** → 견주 화면: 시터 실시간 위치 · 지도 · ETA
2. 견주 집 근처 도착 → 시터 앱에 출입 카드 자동 표시: 콘도 **Buzzer 1-tap** · **Lockbox 코드** (2시간 전부터 열린 정보)
3. 안전 검증: 차량 안 사진(**크레이트 · 안전벨트**) → Vision AI가 탑승 안전 확인 → 견주 Push "**Pick-up complete — care has started 🚗**". 안 보이면 "Couldn't see a crate or seatbelt" → 다시 찍기 / 이유 남기고 계속 (AI는 조언, 막지 않음)

**위치 공유의 범위 (D41):** 해커톤 P0는 웹 앱이라 **화면이 켜져 있을 때만** 위치가 공유된다(iOS·Android 웹은 백그라운드 위치 불가). 출시 때는 네이티브 앱에서 **위치 권한을 미리 동의**받아 이동 중 계속 공유한다. 이동 기능은 **P0에서 가장 마지막에 만들고**, 심사에서는 **데모 영상**(Simulate trip)으로 보여준다 (심사위원이 폰을 들고 이동할 수 없음). 웹 데모 URL의 Simulate trip 버튼은 유지한다.

**4-3. 5초 체크** — 시터는 글을 쓰지 않는다 (D34 · D38). 칩과 사진만 고르면 AI가 문장을 만든다.

| 입력 | 예 |
| :--- | :--- |
| 칩 | ☑ Meal: All · ☑ Potty: 1× normal · ☑ Walk: 20 min · ☑ Meds: done (task에서 자동) |
| 사진 (≤ 2) | 산책 사진 2장 → Vision이 사진을 요약해 에피소드 초안을 만든다 ("Saw a squirrel at the park") |
| 수정·추가 (선택, 1줄 ≤ 120) | AI가 만든 문장을 고치거나 한 줄 덧붙일 때만. 필수 입력 아님 |

→ **Generate AI report**

**4-4. AI 알림장 생성** — Vision(사진 묘사) → **Nemotron Super**(따뜻한 알림장, **시터의 말투·1인칭**, D35). 입력에 없는 일은 쓰지 않는다. 알림장은 시터가 **Send**를 누르는 순간 나가며 사람 속도 지연은 쓰지 않는다 (D37).

> *Bori took the skin pill you left, tucked inside her treat, and finished every bit of her kibble! On our 20-minute morning walk she spotted a squirrel in the park and got so excited — it was adorable. Her potty was perfectly healthy, too. 🐶*

**4-5. 타임라인 앨범** — 업로드 사진마다 AI 캡션 + **분류 태그**(Meals · Walks · Naps · Play) → KidsNote처럼 날짜별 앨범:

```
Oct 9, 2026
├── 🍚 Meals  · photos
├── 🐕 Walks  · photos
└── 😴 Naps   · photos
```

- **Fun mood meter (P1, D42):** 강아지 사진·영상을 올리면 "Joy 70% · Excited 55%"처럼 **재미용 게이지**를 보여준다. 항상 "For fun only — not a behavior or health assessment" 문구를 붙이고, 축은 Joy / Calm / Curious / Sleepy / Excited. 퍼센트는 모델의 확률이 아니라 **보이는 행동 태그와 프레임 비율**로 서버가 계산한 값이며, 불안·통증 같은 부정 감정은 퍼센트로 표시하지 않는다 (관찰 문장만). 비용·라이선스 문제가 있으면 제외해도 되는 비핵심 기능 (Phase 11.9).
- 돌봄 중 추가 안전장치: **Treat Safety Guard**(성분표 → 알레르기·숨은 성분) — 시나리오 코어 뒤 P0 stretch (D27, Phase 08).
- Phase: 이동·사진 확인 **06B**, 5초 체크 **06**·**07**, 알림장 **07**, 앨범 분류 **09**, 피드·알림 **05**.

### Stage 5 — Completion (완료) · 목표: 돌봄 데이터를 Pet Life Record + RAG에 축적

1. **체크아웃/귀가** — 마지막 인수인계(Returned)에 사진 인증 → 최종 리포트 "**Bori is home safe 🏠**"
2. **리뷰** — 견주에게 감사 인사 + **★ 5점 리뷰** 요청 (코멘트 선택)
3. **Pet Life Record** — 이번 돌봄의 체크인·task·알림장·인수인계 체크·메모·문의 대화를 AI(Super)가 정리:
   식습관 · 배변 특성 · 약 반응 · 행동 · 알레르기·주의사항 · 시터 팁 → `pet_life_records` + RAG(`knowledge_chunks`)
4. **다음 예약에서 활용** — 새 시터에게 맡겨도: 요청 카드의 "From Bori's Life Record", AI 문의 답변, 케어 체크리스트 초안이 지난 기록을 불러온다

```
지난 기록 (알레르기 · 주의사항 · 식습관 · 배변 · 약 반응)
        ↓  embed (Qwen3-Embedding-8B)
     RAG DB (Supabase pgvector)
        ↓  다음 예약 시 검색
  맞춤 케어 정보 → 새 시터도 연속성 있는 케어
```

- 원문은 "Lockbox 위치 정보"도 축적 대상으로 적었지만, 출입 정보는 **견주 집 정보(`owner_home_access`)에 저장해 다음 예약에 재사용**하고 RAG에는 넣지 않는다 (D31).
- Phase: **07C**.

---

## 3. 역할별 흐름

| Owner | Sitter | PawNote AI |
| :--- | :--- | :--- |
| 예약 문의 | 문의 확인 | 요청 수신 → RAG 검색 |
| 펫 프로필 제공 (자동 첨부) | AI가 기본 응대 | 시터 일정·요금·펫 프로필 확인 |
| 케어·투약 의뢰서 작성 | Meet & Greet | 초고속 자동 응답 |
| 이동 방식 선택 | 케어 의뢰서 확인 | 의뢰서 → 미션 체크리스트 |
| 결제 및 동의 | 예약 확정 | GPS·ETA 처리 |
| 이동 · 실시간 GPS 확인 | 이동 · GPS 공유 · 반려동물 인수 | Vision AI 사진·안전 분석 |
| 돌봄 알림 확인 | 5초 체크 · 사진 촬영 | 돌봄 데이터 구조화 |
| AI 알림장 확인 | AI 알림장 생성 → 전송 | AI 알림장 생성 → Owner 알림 |
| 귀가 확인 · 리뷰 | 귀가 / 체크아웃 | 생활기록부 업데이트 → RAG 축적 |

---

## 4. 최종 요약표

| 단계 | 주요 기능 | Uber / Transit | KidsNote 방식 | AI · Nebius · NVIDIA |
| :--- | :--- | :--- | :--- | :--- |
| 1. Inquiry | 빠른 대화 응대 | — | 펫 기본 프로필 연동 | RAG + 시터 말투 초안 → 시터 승인 (자동 모드는 사람 속도) — Nemotron Nano + Qwen3 Embedding |
| 2. Meet & Greet | 돌봄 요구사항 정의 | 이동 주체 선택 (Owner / Sitter drives) | 케어·투약 의뢰서 | 의뢰서 → 시터 미션 체크리스트 — Nemotron Super |
| 3. Booking | 결제 및 보안 서약 | Visitor parking 안내 | 안전·귀가 동의서 | 돌봄 2시간 전 Lockbox 코드 보안 해제 (서버 규칙) |
| 4. Care & Transit | 이동 트래킹 & 돌봄 보고 | 실시간 GPS 라이브 지도 & ETA | 등하원 알림 & 스마트 알림장 | 차량 안전·사진 분석 — MiniCPM-V-4.5 (D39) · 시터 말투 알림장 — Nemotron Super |
| 5. Completion | 후기 및 데이터 저장 | — | 펫 생활기록부 | 대화·돌봄 데이터 → Life Record → RAG DB 자동 축적 — Nemotron Super + Qwen3 Embedding |

---

## 5. 시나리오를 앱으로 옮기며 정한 것 (D27–D43 요약)

| # | 시나리오 원문 | 앱 결정 | 이유 |
| :--- | :--- | :--- | :--- |
| D27 | 5단계 전체 프로세스 | 제품·README·데모·작업 순서 = 5단계. 기존 Treat Safety Guard는 Stage 4 보조 기능, 시나리오 코어 뒤 P0 stretch | 시나리오 우선 (2026-10-01 민식) |
| D28 | A 보호자 집 / B 시터 집, Owner/Sitter Drives | `bookings.service_type` (`boarding`·`house_sitting`) + 이동 방식 = 기존 인수인계 장소 (`sitter_home` = Owner drives, `owner_home` = Sitter drives) | DB(D24) 재사용, 새 상태 최소 |
| D29 | 요금·공휴일·다두 할증 조회 후 답변 | 견적은 서버 함수 `quote_booking` (요금표 + 온타리오 공휴일 + 다두 할증), AI는 숫자를 만들지 않음 | 가격 환각 방지, 답변·결제 화면이 같은 숫자 |
| D30 | 캐나다 맞춤 전자 동의서 자동 발급 + 결제 | 옵션별 **고정 영문 템플릿**(버전) + 이름 서명, **데모 결제**(카드 정보 없음) | 법률 문구를 AI가 쓰지 않음 ("not legal advice" 표시), 해커톤에서 실결제 불필요 |
| D31 | 결제 후에도 잠김 → 2시간 전 해제 / 결제 즉시 주소 전달 | 견주 집 출입 정보 = 인수인계·돌봄 시작 2시간 전 ~ 종료까지만 RPC 공개 + 열람 기록·알림. 시터 집 정보 = 결제 직후. **출입 정보는 RAG에 넣지 않음** | 최소 노출 원칙 |
| D32 | 실시간 GPS + ETA + 지도 | 이동 중에만 마지막 위치 1개 공유(경로 이력 저장 안 함), ETA = 직선거리 기반 추정, 보기 전용 지도(OSM), 데스크톱·데모는 **Simulate trip** | 심사위원 PC에는 GPS 이동이 없음, 위치 프라이버시 |
| D33 | Vision AI = Qwen-2.5-VL | Token Factory 카탈로그에 없음(2026-10-01) → **MiniCPM-V-4.5** (대안 Kimi-K2.6). RAG 임베딩 = `Qwen/Qwen3-Embedding-8B` (1024차원) | 카탈로그 기준 ([model-ids.md](phases/notes/model-ids.md)) |
| D34 | 5초 체크 + 짧은 메모 | 칩 + 사진 ≤ 2 + **선택 메모 1줄** — 필수 텍스트 입력은 여전히 없음 (D38에서 "AI가 먼저 쓰고 시터는 수정·추가만"으로 보강) | 시나리오의 "짧은 메모" 반영 |
| D35 | 시터 말투 레이어 | 견주에게 보이는 모든 자연어 AI 출력(문의 답장·알림장·캡션)은 **시터 1인칭 말투**. 구성 = 스타일 가이드 + 같은 시터의 과거 답변 top-k(few-shot, 임베딩 검색). 시드 = 익명화한 3년치 대화(영어, 메시지·WhatsApp), 이후 시터의 **그대로 보냄 / 수정 / 다시 생성**으로 계속 갱신. **고정 문구(안전 경고·견적 숫자·동의서)는 제외.** 파인튜닝(SFT)은 보여주기용(D43) | 모델 교체 없이 시터마다 말투를 배우고, AI 어투를 줄임 |
| D36 | 시터 승인 · AI 고지 | 기본 = 시터가 초안을 승인해 보내는 **수동 승인**(누르는 즉시 발송, 지연 없음). **자동 발송**은 시터가 옵션으로 켜며, 켤 때 책임 동의 모달. 메시지마다 AI 라벨은 없고 약관·온보딩에 1회 고지, 자동 모드는 프로필 한 줄. 견주가 AI인지 물으면 부인하지 않고 시터에게 알림 | 승인한 메시지는 시터의 메시지. 사람이 안 본 자동 발송만 추가 고지 |
| D37 | 사람 속도 전달 | 자동 발송과 데모 영상에만 적용: 읽음 "1" → 사라짐(5~10초) → 입력 중 → 답장(10~15초), 총 약 30초. 글자 수별 지연 공식·메시지 구조는 **슬기가 정함 (TBD)**. 알림장·캡션·수동 승인에는 적용 안 함 | 사람이 읽고 쓴 느낌. 업계 관행이지 Airbnb 공식 정책은 아님 |
| D38 | 시터 글쓰기 제로 | 칩·사진·의도 칩만으로 AI가 문장 생성. 시터는 **수정·추가를 선택적으로** 할 수 있음 (D34 메모 1줄은 이 수정·추가 칸으로 흡수) | "Care, snap, tap" |
| D39 | 모델 정책 | **미국 모델 우선, NVIDIA 모델 우선.** 중국 모델은 대안이 없거나 가성비 차이가 클 때만(기록 필수). 현재 예외: 임베딩 Qwen3-Embedding(확정, 다른 임베딩 비교 안 함), 비전 MiniCPM-V(확정 — NVIDIA 비전 모델 `Nemotron-Nano-V2-12b`·`Cosmos3-Super-Reasoner`·`Nemotron-3-Nano-Omni`는 Dedicated Endpoint 전용이라 상시 서비스 비용이 $48~113/일). Provider가 NVIDIA인 NVFP4 양자화 모델 중 GLM·MiniMax·Qwen은 원본이 중국 모델이라 "NVIDIA 우선"에 해당하지 않음 | 해커톤 트랙(Nemotron) + 선호. [model-ids.md](phases/notes/model-ids.md) |
| D40 | 확정 후 변경 요청 | 서비스·이동 방식은 예약 확정 시 고정. 견주·시터 누구나 변경 요청 가능, 상대 승인 필요, 거부 시 변경 요청만 취소(예약 유지) | 일방 변경 방지 |
| D41 | 위치 공유 동의 · 범위 | Start trip → 앱 동의 화면(누구에게·도착까지) → 브라우저 권한. P0 웹은 화면이 켜진 동안만, **06B는 P0 맨 마지막**, 심사는 **데모 영상**. 출시 때 네이티브 앱에서 위치 권한을 미리 동의 | 무료 스택(Supabase Realtime Free + 브라우저 Geolocation + OSM) 안에서 가능 |
| D42 | Fun mood meter (P1) | 재미용 문구 필수, 보이는 행동 태그 + 프레임 비율로 서버 계산, 부정 감정 퍼센트 금지. 모델 후보 = 비전 모델 태그 추출(A) + Apache-2.0 이미지 분류기 `agentmish/dog-emotion-classifier-v2`(B). 비용·라이선스 문제 시 제외 가능 | 임팩트용 비핵심 기능 |
| D43 | SFT는 보여주기용 | 앱 말투는 Nemotron + 말투 카드 + few-shot만. 파인튜닝은 앱에 연결하지 않고 README Future work·데이터 명세로만 보여줌 (서빙 비용·데이터 부족) | 비용 없이 확장 가능성만 전달 |

---

## 6. 데모 경로 (A Stay with PawNote)

추수감사절 연휴(2026-10-09 금 ~ 10-12 월, 10-12 = Thanksgiving) Bori(강아지·Maltese·닭고기 알레르기) + Mochi(고양이)를 Mina에게 보딩. 시드는 상대 날짜(`--relative`)로 언제든 재현.

| # | 장면 | 화면 (역할) | Phase |
| :--- | :--- | :--- | :--- |
| ① | 22:40 Jisoo가 Mina에게 문의 (Mina는 자동 발송 모드) → 읽음 "1" 사라짐 → "Mina is typing…" → **약 30초 뒤 답장**(Mina의 말투·1인칭): 가능, 견적(공휴일·2마리 할증 포함), "Bori's Life Record says she takes her pill in a treat — happy to do that". 초안 생성 자체는 몇 초 | Owner 스레드 · Sitter 알림 | 07B (+03C 견적, 07C 기록) |
| ② | 케어·투약 의뢰서 → AI 체크리스트 → 확인 · Meet & Greet 영상 통화 Done · 맡기기 = **Sitter drives**, 찾기 = **Owner drives** | Owner Care · 예약 상세 | 06 · 03B |
| ③ | Mina 수락 → Checkout: 견적 → 동의서 4개 서명 → **Pay (demo)** → Mina 집 주소·Visitor parking·짐 체크리스트 열림 | Owner Checkout | 03C |
| ④-a | 픽업 2시간 전 출입 정보 해제(Jisoo 알림) → Mina **Start trip** → **위치 공유 동의 화면** → Jisoo가 지도·ETA 확인 → 도착 시 Buzzer·Lockbox 카드 → 차량 사진 → Vision ✅ → "Pick-up complete — care has started" | Sitter Trip · Owner Trip | 06B · 03C |
| ④-b | 5초 체크 + 사진 2장 → AI 알림장 → Send · 앨범이 Meals/Walks/Naps로 정리 | Sitter Report · Owner Reports/Feed | 06 · 07 · 09 · 05 |
| ⑤ | Jisoo **Start trip**(Owner drives) → Mina가 ETA 확인 → "Jisoo has arrived" + Jisoo에게 Visitor parking 안내 → 귀가 사진 → "Bori is home safe 🏠" → ★★★★★ → Life Record 갱신 | Owner/Sitter Trip · Review · Life Record | 06B · 07C |
| (선택) | 새 간식 성분표 스캔 → DANGER "Contains chicken" | Sitter Scan | 08 (stretch) |

---

## 7. Stage → Phase → Task

| Stage | Phase | 핵심 Task |
| :--- | :--- | :--- |
| 1 Inquiry | [07B](phases/phase-07b.md) · [03C](phases/phase-03c.md) 3C.1 | 문의 스레드 · `/api/ai/inquiry-reply` · RAG 인덱싱 · 견적 · **말투 레이어 7B.8 · 승인 UX 7B.9 · 사람 속도 7B.10** |
| 2 Meet & Greet | [06](phases/phase-06.md) 6.12–6.14 · [03B](phases/phase-03b.md) 3B.9–3B.10 | 케어 의뢰서 → `/api/ai/care-plan` · Meet & Greet · 서비스·이동 방식 |
| 3 Booking | [03B](phases/phase-03b.md) · [03C](phases/phase-03c.md) | 예약·협의·취소 · 동의서 · 데모 결제 · 조건부 해제 |
| 4 Care & Transit | [04](phases/phase-04.md) · [05](phases/phase-05.md) · [06](phases/phase-06.md) · [06B](phases/phase-06b.md) (**P0 맨 마지막**, D41) · [07](phases/phase-07.md) · [09](phases/phase-09.md) · ([08](phases/phase-08.md) stretch) · P1 [11.9](phases/phase-11.md) mood meter | 업로드 · 피드·알림 · 5초 체크 · 실시간 이동 · `/api/ai/handoff-check` · 알림장 · 앨범 분류 |
| 5 Completion | [07C](phases/phase-07c.md) | 귀가 리포트 · 리뷰 · `/api/ai/life-record` · Life Record 화면 |
| 전체 | [10](phases/phase-10.md) | 시드 · 배포 · 심사 경로 · README |

---

## 8. 범위 밖 (해커톤 후)

- 실결제(Stripe 등)·환불·세금, 법률 검토를 거친 동의서
- 도로 경로 기반 ETA(라우팅 API)·주소 자동완성·지오코딩, **백그라운드 위치 추적**(네이티브 앱에서 사전 동의 후 — D41)
- 시터 말투 SFT 파인튜닝 — 보여주기용(앱에는 연결하지 않음, Dedicated Endpoint 비용·데이터 부족) ([phase-11.md](phases/phase-11.md) 11.7). RFT(강화 파인튜닝)는 신청하지 않음
- Drop-in(짧은 방문) 전용 정원 계산 — P0는 house sitting도 보딩과 같은 칸 정원으로 계산
- 실제 마켓플레이스(Rover 등) 문의 연동 — P0는 앱 안 문의만
- AI 에이전트의 도구 호출(tool calling) 방식 응답 — P0는 서버가 근거를 모아 한 번 호출 (7.1 spike에서 지원 여부만 기록)

---

## 9. 열린 질문 · TBD (2026-10-02)

| # | 항목 | 담당 | 비고 |
| :--- | :--- | :--- | :--- |
| 1 | **글자 수별 지연 공식**과 **메시지 구조**(1개 / 분할) — 읽음 5~10초 + 입력 10~15초, 총 약 30초 목표 | 슬기 | 확정하지 않음. 모바일 타이핑은 초당 약 3자라 사람 속도를 그대로 재현하면 60단어에 1분 이상 걸림 → 길이 한도·분할 여부를 함께 정할 것 |
| 2 | 자동 모드의 **읽음 표시**를 실제 읽음과 연동할지, 연출로만 쓸지 | 민식 | 수동 모드는 시터가 열었을 때 실제 읽음. 자동 모드에서 시터가 안 본 채 읽음을 보여주는 것은 속임에 가까워 위험 — 결정 필요 |
| 3 | 자동 발송(옵션)을 P0 후반으로 당길지 P1로 둘지 | 민식 | 데모 장면 ①이 자동 모드를 쓰므로 P0 후반 필요. 제안: 7B.10을 P0 후반, 책임 동의 모달 포함 |
| 4 | 위치 공유 **동의 거부** 시 대안 (수동 ETA 칩 등) | 민식·묵 | 06B 착수 전 |
| 5 | 말투 학습 데이터: 3년치 대화 건수·익명화 완료 시점·`{PRICE}`/`{DATE}` 자리표시자 규칙 | 슬기 | 익명화 후 `data/raw/`는 git 금지. 학습·검증·시험 분할 |
| 6 | ✅ **SFT는 보여주기용으로만 (D43)** — 앱 런타임은 Nemotron + 말투 카드 + few-shot. 참고 후보: Gemma-4-E4B-it (콘솔 마법사에서 확인, $0.40/1M tokens). Nemotron 모델은 마법사에 없고 모델 페이지에서도 파인튜닝 "Not available" | — | 학습 방식 = **LoRA** (마법사에서 확인). 서빙은 Dedicated Endpoint만일 가능성이 높음 → L40S 시간당 $2 → 녹화·평가 때만 켬. 상시 서비스는 few-shot. 남은 확인: 카탈로그 Gemma-4-E4B-it 페이지의 Public endpoint가 "Not available"인지 (그러면 LoRA도 Dedicated 필요) |
| 7 | ✅ **NVIDIA 비전 모델은 쓰지 않음.** 3종 모두 Dedicated Endpoint 전용(Public 없음, 파인튜닝 없음) → 상시 비용 $48~113/일 → 비전은 MiniCPM-V 유지 | — | 해커톤 후 예산이 생기면 재검토 |
| 8 | Nebius **zero-retention** 모드 사용 여부, 익명화 데이터의 제3자(Nebius) 처리 고지 | 슬기 | 익명화 정책 문서에 포함 |
| 9 | mood meter B안(분류기)의 **학습 데이터셋 라이선스** | 슬기 | 모델 카드에 학습 데이터 미기재 → 불확실하면 A안(태그 추출)만 |
| 10 | ✅ RFT 연구 프로그램은 신청하지 않음 | — | 2026-10-02 결정 |
