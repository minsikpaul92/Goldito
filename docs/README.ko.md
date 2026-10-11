> **왜 만들었나.** 펫시터로 수십 번의 케어를 하며 — 같은 강아지·고양이를 여러 번 맡기도 했습니다 — 늘 같은 모습을 봤습니다. 앱은 견주와 시터를 연결하고 예약마다 수수료를 가져가지만, 정작 머무는 동안의 일(답장, 집 규칙, 일일 노트)은 여전히 손으로 치고, 상당 부분이 앱 밖에서 이뤄집니다.
> **왜 AI인가.** 우리 경험상 타이핑이 어려운 견주 — 특히 시니어 — 는 반려동물 프로필을 반쯤 비워 두고, 시터는 돌보는 대신 글을 쓰느라 시간을 씁니다. Goldito의 AI가 타이핑을 맡고, 사람이 승인합니다.

<div align="center">

<!-- TODO(logo): Goldito 로고를 여기에 넣기, 예: <img src="assets/logo.png" alt="Goldito" width="120"> — 묵의 디자인 대기 중. frontend/assets의 Expo 기본 아이콘은 임시 파일이라 쓰지 않는다. -->

# Goldito (한국어)

**반려동물은 맡기고, 마음은 편하게.**
첫 문의부터 귀가까지 — **강아지·고양이** 펫시팅의 전 과정을 앱 하나로.
AI 에이전트가 답하고, 정리하고, 확인하고, 써 주니 시터는 돌봄에만 집중합니다.

[![Live demo](https://img.shields.io/badge/live%20demo-goldito--petcare.vercel.app-0070f3?style=flat-square)](https://goldito-petcare.vercel.app)
[![Hackathon](https://img.shields.io/badge/Nebius%20x%20NVIDIA-Best%20Apps%20%26%20Agents-76b900?style=flat-square)](hackathon/README.ko.md)
[![Nemotron on Token Factory](https://img.shields.io/badge/NVIDIA%20Nemotron-on%20Nebius%20Token%20Factory-76b900?style=flat-square)](#nvidia-nemotron--nebius-token-factory-사용-방식)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](../LICENSE)

[써 보기](#60초-만에-써-보기) · [달라지는 점](#무엇이-달라지나) · [동작 방식](#goldito는-이렇게-동작합니다) · [에이전트](#goldito-에이전트) · [Nemotron](#nvidia-nemotron--nebius-token-factory-사용-방식) · [프라이버시](#프라이버시안전) · [실행](#직접-실행하기)

🇺🇸 [English README](../README.md) · [개발 계획](plan/README.ko.md) · [해커톤 규정 요약](hackathon/README.ko.md) · [전체 서비스 흐름 (정본)](plan/full-process.ko.md)

</div>

> 이 문서는 루트 README(해커톤 제출용)의 한국어판입니다. 일정·역할·전략 등 팀 내부 내용은 [개발 계획](plan/README.ko.md)에 있습니다.

---

## 60초 만에 써 보기

> [!TIP]
> 설치 없이: **[goldito-petcare.vercel.app](https://goldito-petcare.vercel.app)** 을 열고 **Try demo → Owner**(또는 **Sitter**)를 누르세요. 가입도 비밀번호도 필요 없습니다 — 데모 계정과 반려동물은 모두 가상입니다.

1. 컴퓨터에서는 앱이 폰 프레임 안에서 돌아갑니다: **클릭 = 탭, 드래그·스크롤 = 스와이프**. 샘플 사진이 내장돼 있어 카메라가 없어도 됩니다.
2. 다른 역할은 시크릿 창에서 열면 한 번의 돌봄을 양쪽에서 볼 수 있습니다.

> [!NOTE]
> 백엔드는 무료 플랜이라, 한동안 쓰지 않은 뒤 첫 요청은 깨어나는 데 30~50초 걸릴 수 있습니다(10분마다 핑을 보내 깨워 둡니다).

**데모 영상:** _준비 중_

> [!NOTE]
> **상태 표시** (2026-10-11 기준, 제출 때 갱신): ✅ 지금 데모에서 됨 · 🚧 마감 전까지 만드는 중 · 🔭 해커톤 이후

---

## 무엇이 달라지나

| 견주에게 | 시터에게 |
| :--- | :--- |
| **물어볼 필요가 없게.** 반려동물의 상태 — 이동 소식, 사진, 알림장 — 이 알아서 도착해서 마음이 편합니다. | **돌보고, 찍고, 탭만.** 답장·노트·체크리스트가 초안으로 와 있고, 집 규칙을 놓치지 않으며, 시간을 반려동물에게 씁니다. |
| **채워지는 프로필.** 사진, 음성, 한 화면 한 질문의 큰 화면이 처음 쓰는 분과 시니어도 반려동물을 쉽게 설명하게 돕습니다. 🚧 | **옛 메시지를 뒤질 일이 없게.** 약 시간이나 "노크 금지" 같은 규칙이 체크리스트에 들어 있습니다. |

## 5단계 — 단계마다 AI가 하는 일

| 단계 | AI가 하는 일 | 상태 |
| :--- | :--- | :--- |
| **① 문의** | 시터 캘린더, 서버 견적, 정책, 반려동물 Life Record를 근거로 **시터의 말투로** 답장 초안을 씁니다 | ✅ |
| **② 사전 미팅** | 견주의 케어 메모를 시간별 **미션 체크리스트**와 주의사항 카드로 정리합니다 | ✅ · Google Meet 링크 ✅ 서버, 앱 확인 🚧 · 진행 막대 + 날짜 홀드 🚧 |
| **③ 예약 확정** | 일부러 나서지 않습니다: 동의서, 가격, 시간 맞춘 해제는 모델이 아니라 고정 규칙으로 | ✅ |
| **④ 돌봄 & 이동** | 하루 칩을 제안하고 **알림장**을 쓰고 사진에 캡션을 달아 분류합니다 · 실시간 이동 + 사진 체크 🚧 | ✅ 돌봄 · 🚧 이동 |
| **⑤ 완료** | 반려동물의 **Life Record**를 쓰고 다음 돌봄에 기억합니다 — 새 시터여도 | ✅ |

**시팅 그 이상 — 앱에 머물 이유.** 돌봄과 돌봄 사이에도 Goldito는 반려동물의 이야기를 쌓습니다: 사진 **앨범**, 돌봄마다의 **다이어리**, 어느 시터에게나 이어지는 **Life Record**, **즐겨찾기 시터**, 양방향 **리뷰**, 실시간 알림 ✅. 다음 계획: 사진·음성·큰 버튼 몇 개로 만드는 **펫 프로필** 🚧, **무드 미터**, **8-bit 펫 룸** 🔭.

---

## Goldito는 이렇게 동작합니다

```
 ① 문의 ──> ② 사전 미팅 ──> ③ 예약 확정 ──> ④ 돌봄 & 이동 ──> ⑤ 완료
 AI가 시터     케어 의뢰서      동의서·결제·       실시간 이동 · 5초      무사 귀가 · 리뷰 ·
 말투로 답장   → 체크리스트     시간 맞춰 해제      체크 · AI 알림장       Pet Life Record → RAG
      ▲                                                                       │
      └──────────── 다음 돌봄은 Goldito가 배운 모든 것과 함께 시작 ──────────────┘
```

전체 흐름과 모든 결정: [full-process.ko.md](plan/full-process.ko.md).

단계를 눌러 펼쳐 보세요.

<details>
<summary><b>① 문의 — 시터의 말투로 오는 답 ✅</b></summary>

- 견주는 **보딩**(시터 집) 또는 **하우스 시팅**(내 집), 날짜, 반려동물을 고릅니다 — 반려동물 프로필(품종·나이·알레르기)이 함께 전달됩니다. **예약 전에 문의하기(Ask before booking)**는 요청을 보내기 전까지 아무것도 예약되지 않습니다. 시터 프로필에는 시터가 정한 대로 **한 번에 한 오너의 반려동물만 받는지, 여러 오너를 받는지**도 보입니다 🚧.
- **Goldito AI가 몇 초 안에(중앙값 약 3초) 시터의 말투로 답장 초안을 씁니다.** 시터의 지난 대화에서 배운 말투로, 캘린더의 가능 여부, **공휴일·다두 할증**이 들어간 견적, 하우스 정책과 반려동물 **Life Record**(RAG)를 근거로. 시터가 한 번 탭해 보내거나, 책임 동의 후 자동 발송을 켜면 바쁘거나 자고 있어도 사람 속도로 먼저 답합니다. 대화는 이어집니다: 견주가 다시 쓰고, **같은 대화에서 날짜를 바꾸고**, 시터의 수락·거절·다른 날짜 제안도 초안으로 준비됩니다.
- 가격과 가능 여부는 모델이 아니라 서버가 계산합니다 — "이 날짜 가능해요?"는 예약 엔진과 같은 규칙을 쓰고, 답장과 결제 화면의 숫자는 항상 같습니다.

</details>

<details>
<summary><b>② 사전 미팅 — 케어 의뢰서가 체크리스트로 ✅</b></summary>

- 견주는 메모하듯 **케어·투약 의뢰서**를 씁니다: *"오전 8시 사료 1컵 · 오후 2시 피부약 1알, 간식과 함께 · 노크 금지 — 문자 주세요 · 산책 중 다른 강아지 접근 금지"* Nemotron이 이를 시간별 할 일과 **주의사항** 카드로 정리하고, 견주가 확인한 뒤 저장합니다. 돌보는 중에는 시터가 승인하는 요청으로 바뀝니다.
- **처음 맡기는 사이면 먼저 만납니다.** 예약 요청 뒤, 대면이면 서로 저장해 둔 장소 중에서 고르고, 영상이면 시간이 정해지는 순간 **Google Meet** 링크와 캘린더 초대가 만들어집니다(서버 완료, 앱 확인 🚧). 한쪽이 건너뛰고 싶으면 상대가 동의해야 하고, 동의하지 않으면 예약이 취소되어 견주는 다른 시터를 찾습니다. 시터가 먼저 **Yes, let's meet**로 동의하면 그 순간부터 날짜가 오너를 위해 홀드되고, 2일 안에 만날 시간이 안 잡히면 양쪽에게 시간 잡기·스킵·거절을 묻고 답이 없으면 요청이 취소됩니다 🚧. 만난 뒤에도 한쪽이 거절할 수 있습니다 🚧. 단골이면 이 단계가 없습니다.
- 이동 방식을 고릅니다: **견주가 데려다주기(Owner drives)** 또는 **시터가 데리러 가기(Sitter drives)**.

</details>

<details>
<summary><b>③ 예약 확정 — 동의서, 결제, 그리고 제때 열리는 정보 ✅</b></summary>

- 고른 옵션에 맞춰 **캐나다형 동의서**가 준비됩니다: 24시간 응급 동물병원 진료 승인, Lockbox·Buzzer·Fob 사용, 합사, 귀가 규칙.
- **결제**는 데모에서 가상입니다 — 카드가 필요 없습니다.
- **시간 맞춰 해제:** 보딩이면 결제 즉시 시터 집 주소·방문자 주차·짐 체크리스트가 열립니다. 견주 집 출입 정보(Lockbox 번호·Buzzer)는 **방문 2시간 전에만** 시터에게 열리고, 열리는 순간 견주에게 알림이 갑니다.

</details>

<details>
<summary><b>④ 돌봄 & 이동 — 5초 체크, AI 알림장, 실시간 이동</b></summary>

- ✅ **5초 체크:** 하루 체크인과 사진에서 AI가 칩을 제안합니다 — 식사 ✅ · 배변 ✅ · 산책 20분 ✅ · 투약 ✅ · 🐿️ 공원 다람쥐. 시터는 틀린 칩을 끄고 필요하면 짧게 적기만 하면, **Nemotron이 그 내용만으로 시터의 말투로 알림장을 쓰고** 시터가 승인하면 게시됩니다. 같은 날 한 번 더 쓸 수도 있습니다.
- ✅ **타임라인 앨범:** 사진마다 AI 캡션과 날짜별 식사·산책·낮잠 분류.
- 🚧 **Uber식 이동:** 운전하는 쪽이 **Start trip**(분명한 위치 안내 후)을 누르면 상대방은 실시간 지도와 ETA를 봅니다. 도착하면 견주에게는 방문자 주차 안내, 시터에게는 Buzzer·Lockbox 카드가 뜹니다. 위치 공유를 거부해도 양쪽은 만나는 장소와 **Open in Google Maps** 버튼을 봅니다.
- 🚧 **사진 체크인:** 인계 순간 사진 한 장 → 비전 모델이 반려동물이 있는지, 차 안에서 크레이트·안전벨트로 고정됐는지 확인 — 조언일 뿐 시터는 계속 진행할 수 있습니다.
- 🚧 **간식 세이프티 가드** *(stretch)*: 성분표를 찍으면 Nemotron Ultra와 직접 정리한 독성 성분 표가 알레르기·숨은 성분(예: "동물성 지방" 속 닭고기)을 급여 전에 잡아냅니다.

> *"Max took the skin pill you left, tucked inside her treat, and finished every bit of her kibble! On our 20-minute morning walk she spotted a squirrel in the park and got so excited — it was adorable. Her potty was perfectly healthy, too. 🐶"*
> — 칩 몇 개, 사진 2장, 시터의 짧은 한 줄로 만든 AI 알림장 (앱 출력은 영어, D1)

</details>

<details>
<summary><b>⑤ 완료 — 무사 귀가, 그리고 기억하는 기록 ✅</b></summary>

- 마지막 인계는 *"Max is home safe 🏠"* 리포트로 끝나고, 감사 인사와 **★ 5점 리뷰** 요청이 갑니다. 시터는 오너에 대한 비공개 노트도 남길 수 있고, 오너는 그 사실을 볼 수 없습니다.
- Nemotron이 이번 돌봄 전체(체크인·할 일·알림장)를 반려동물의 **Life Record**로 정리합니다: 식습관, 배변 특성, 약 반응, 행동, 주의사항.
- Life Record는 **RAG 지식 베이스**에 저장됩니다. 다음 예약에서는 **새 시터여도** AI 답장, 체크리스트, 시터 요청 카드가 이미 그 반려동물을 알고 있습니다.

</details>

---

## Goldito 에이전트

Goldito의 AI는 에이전트처럼 움직입니다. 돌봄 중 일이 생기면 스스로 필요한 사실을 모아 행동하고 기억합니다. **상대에게 닿는 것은 모두 사람이 승인합니다.**

| 이런 일이 생기면 | 에이전트가 하는 일 | 사람이 정하는 것 |
| :--- | :--- | :--- |
| 견주가 문의 | 캘린더 확인, 서버 견적, Life Record 검색, 시터 말투로 답장 초안 | 시터가 **Send** (또는 자동 발송을 켬) |
| 견주가 케어 의뢰서 작성 | 시간별 할 일과 주의사항 카드로 정리 | 견주가 확인 후 저장 |
| 인계 사진 촬영 🚧 | 반려동물이 있는지, 차 안에서 고정됐는지 확인 | 조언만 — 시터는 계속 진행 가능 |
| 하루가 끝나면 | 기록과 사진에서 칩 제안 → 알림장 작성 | 시터가 칩 수정·한 줄 추가·승인 |
| 돌봄이 끝나면 | Life Record 작성 → 다음을 위해 인덱싱 | 견주가 읽음 |
| 다음 문의가 오면 | 그 Life Record를 찾아 새 시터도 알고 시작 | — |
| 새 견주가 반려동물을 등록하면 🚧 | 사진과 몇 마디 말에서 품종·털색·습관 등 프로필을 제안 | 견주가 모든 제안을 확인, 안전 답변은 미리 채우지 않음 |

> [!IMPORTANT]
> 가격·날짜·출입 코드는 모델이 만들지 않습니다. 서버가 주고, 에이전트는 그 주변 문장만 씁니다.

---

## Goldito와 함께하는 한 번의 돌봄 (데모 경로)

추수감사절 연휴 10/9–12: 로버트가 **맥스**(강아지·말티즈·닭고기 알레르기)와 **모찌**(고양이)를 처음 만나는 시터 클로이에게 맡깁니다. **System**은 Goldito의 AI와 규칙이고, AI가 상대에게 보내는 것은 사람이 승인합니다.

<details open>
<summary><b>한 번의 돌봄, 단계별로</b></summary>

| 단계 | 액터 | 무슨 일이 일어나나 |
| :--- | :--- | :--- |
| **문의** | 1 · Owner | **예약 전에 문의하기(Ask before booking)**로 클로이에게 **10/9–12** 가능한지, 맡길 동물 수(2마리)와 비용을 묻습니다. ✅ |
| | 2 · System | 클로이 캘린더를 예약 엔진과 같은 규칙으로 확인하고, 서버가 견적(공휴일·두 번째 반려동물 요금)을 계산하고, 맥스의 Life Record를 검색해 **클로이의 말투로 답장 초안**을 씁니다. 자동 발송을 켜 뒀다면 클로이가 자는 동안 약 30초 뒤("Chloe is typing…") 나가고, 아니면 클로이가 **Send**를 탭합니다. ✅ |
| | 3 · Owner | 답장과 견적을 보고 **Request booking**을 탭합니다 — 예약이 아니라 예약 **요청**입니다. ✅ |
| **사전 미팅 (Meet & Greet)** | 4 · Owner | 케어 메모를 씁니다 — *"8시 사료 · 2시 약은 간식에 · 노크 금지"*. 지금은 타이핑 ✅, 곧 말로도 🚧. |
| | 5 · System | Nemotron이 메모를 시간별 **체크리스트**와 **주의사항** 카드로 정리하고, 오너가 확인 후 저장합니다. ✅ |
| | 6 · Sitter | 요청을 엽니다: 체크리스트, 주의사항 카드, 반려동물 프로필(한눈에 보는 카드 🚧). 거절하거나, 첫 동의인 **"Yes, let's meet"**를 탭합니다. 단골이면 **Accept** 한 번으로 끝나고 밋&그릿 단계는 건너뜁니다. 🚧 |
| | 7 · System | 클로이의 그 날짜를 로버트를 위해 **홀드**해 다른 사람이 예약하지 못하게 하고, 만나고 싶다는 소식을 로버트에게 알리고, 둘에게 **진행 막대**(지금 단계와 다음 행동 하나)를 보여 줍니다. 🚧 |
| | 8 · Owner | 첫 만남을 제안합니다 — 둘 중 누군가 저장해 둔 공개 장소(예: 클로이 집 근처 공원)에서 **대면**하거나 **영상**으로, 날짜와 시간과 함께. ✅ |
| | 9 · Sitter | 시간을 수락합니다. 영상이면 Goldito가 **Google Meet** 링크와 캘린더 초대를 만듭니다. ✅ (링크: 서버 ✅, 앱 확인 🚧) |
| | 10 · Owner & Sitter | 만납니다(대면이면 반려동물과 함께) — "함께 확인할 것" 목록을 보며 이야기하고, 한 명이 **Done**을 탭합니다. ✅ |
| **예약 확정** | 11 · Sitter | 만난 뒤 **Confirm booking**을 탭하거나, 사유 칩과 함께 거절합니다. ✅ 확정 · 🚧 사유 칩 |
| | 12 · Owner | 최종 견적을 확인하고 동의서에 서명하고 **결제(데모)**합니다. "Booked and paid" 카드가 다음에 일어날 일을 알려 줍니다. ✅ 또는 **Not this sitter**를 사유 칩과 함께 탭하면 날짜 홀드가 풀립니다. 🚧 |
| | 13 · System | 오너에게 클로이 집 주소, 방문자 주차, 짐 체크리스트를 엽니다. ✅ |
| **돌봄 & 이동** | 14 · Owner | 맡기는 날 **Start trip**을 탭하고 도착할 때까지 실시간 위치 공유에 동의합니다. 거부해도 괜찮습니다 — 만나는 장소와 **Open in Google Maps** 버튼이 보입니다. 🚧 |
| | 15 · System | 클로이에게 로버트가 오고 있다고 알리고, 실시간 지도와 ETA를 보여 주고, 도착하면 방문자 주차 안내와 함께 알립니다. 🚧 |
| | 16 · Sitter | 만나는 장소에서 반려동물을 받고 **Received**를 탭합니다. 사진 한 장으로 비전 모델이 반려동물이 있는지 확인합니다. 오너에게 "care has started"가 갑니다. ✅ Received · 🚧 사진 확인 |
| | 17 · Sitter | 돌봄 중: 체크리스트와 주의사항을 보고, 할 일 시간이 되면 알림을 받고, 탭으로 할 일(약은 사진과 함께)과 빠른 체크인(식사·배변·산책·기분), 사진을 남깁니다. ✅ |
| | 18 · Owner | 모든 소식을 실시간 업데이트와 피드의 사진으로 봅니다 — 물어볼 필요가 없습니다. ✅ |
| | 19 · System → Sitter | 매일 저녁 그날의 기록과 사진에서 칩을 제안합니다. 시터는 틀린 칩을 끄고 짧게 한 줄을 더하면, Nemotron이 시터의 말투로 **알림장**을 쓰고, 시터가 승인하면 게시됩니다. 앨범은 식사·산책·낮잠으로 저절로 정리됩니다. ✅ |
| | 20 · Owner | 알림장을 읽습니다. 반응을 남기거나 질문하고, 시터가 AI 초안을 승인해 답하는 것은 이후에 🔭. |
| **완료** | 21 · Owner | 찾는 날 **Start trip**을 탭하고 위치를 공유합니다. 🚧 |
| | 22 · Sitter | ETA를 보고, 약속한 장소에서 오너를 만나, 확인 시트 뒤에 **Returned**를 탭합니다. ✅ Returned · 🚧 확인 시트 |
| | 23 · System | 오너에게 *"Max and Mochi are home safe 🏠"*를 알리고 리뷰를 요청합니다. ✅ |
| | 24 · Owner | 시터를 리뷰합니다(별점, 프리셋 문구, 직접 쓰기). 즐겨찾기에 추가할 수 있습니다. ✅ |
| | 25 · System | Nemotron이 이번 돌봄을 반려동물의 **Life Record**로 정리해 인덱싱합니다. 다음 시터의 요청 카드·답장·체크리스트가 이미 반려동물을 압니다. ✅ |
| | 26 · Sitter | **오너에 대한 비공개 노트**를 남깁니다 — 본인만 보고, 같은 오너가 다시 요청하면 다시 보입니다. ✅ |

**예외**

| 언제 | 무슨 일이 일어나나 | 상태 |
| :--- | :--- | :--- |
| 시터가 거절(요청 단계 또는 만난 뒤) | 사유 칩과 제안 시간, 오너는 다른 시터를 찾을 수 있음 | 🚧 사유 칩 |
| 만난 뒤 오너가 "아니다"라고 판단 | **Not this sitter**와 사유 칩, 날짜 홀드가 풀림 | 🚧 |
| 한쪽이 사전 미팅을 건너뛰고 싶음 | 상대가 동의해야 함 — 아니면 예약이 취소되고 오너가 다른 시터를 찾음 | ✅ |
| 2일 안에 사전 미팅 시간이 안 잡힘 | 양쪽에게 시간 잡기·스킵·거절을 묻고, 3일 더 답이 없으면 요청이 취소되고 홀드가 풀림 | 🚧 |
| 인계 사진에 반려동물·크레이트가 안 보임 | 다시 찍거나 이유를 남기고 계속(조언일 뿐) | 🚧 |
| 오너가 위치 공유를 거부 | 실시간 지도 없이 만나는 장소와 **Open in Google Maps** 버튼 | 🚧 |
| AI를 쓸 수 없음 | 오류 대신 목록 초안 | ✅ |
| 시터가 오너 집으로 가는 경우 | 출입 코드는 2시간 전에만 열리고, 시터가 처음 열 때 오너에게 알림 | ✅ |

</details>

🚧 표시 단계는 일정상 가장 마지막에 만들고, 나머지 단계는 지금 라이브 데모에서 돌아갑니다.

---

## NVIDIA Nemotron & Nebius Token Factory 사용 방식

모든 추론·글쓰기 호출은 백엔드에서 **Nebius Token Factory**(OpenAI 호환 API)로 실행합니다. 추론·글쓰기는 NVIDIA Nemotron, 사진은 Token Factory 비전 모델, 검색은 Token Factory 임베딩 모델이 맡습니다. 역할별 모델 ID: [model-ids.md](plan/phases/notes/model-ids.md).

| 단계 | AI 작업 | 모델 ID | 이유 |
| :--- | :--- | :--- | :--- |
| ① 문의 | 시터 캘린더·서버 견적·정책·Life Record 근거 자동 답장. 중앙값 약 3초 | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` + Qwen3 Embedding | 몇 초 안에 답할 속도, 사실·가격은 서버가 제공하고 초안의 모든 금액은 견적과 대조 |
| ① ⑤ 검색 | RAG 지식 베이스 임베딩 (Life Record·정책·지난 문의) | `Qwen/Qwen3-Embedding-8B` (1024차원) | Token Factory의 임베딩 모델, Supabase pgvector에 저장 |
| ② 사전 미팅 | 케어·투약 의뢰서 → 미션 체크리스트 | `nvidia/nemotron-3-super-120b-a12b` | 시각·용량·주의사항 구조화 신뢰도 |
| ④ 이동 🚧 | 인계 사진 확인 — 반려동물, 차 안 크레이트·안전벨트 | `openbmb/MiniCPM-V-4_5` ¹ | Token Factory 비전 모델 |
| ④ 돌봄 | 사진 묘사 → 5초 체크 기반 알림장 | `openbmb/MiniCPM-V-4_5` → `nvidia/nemotron-3-super-120b-a12b` | 3년치(익명화) 실제 알림장 few-shot 말투 |
| ④ 앨범 | 캡션 + 분류 (식사·산책·낮잠·놀이) | `openbmb/MiniCPM-V-4_5` | 사진 1장 = 호출 1번(약 1초), 시터 타이핑 없음 |
| ④ 간식 가드 🚧 *(stretch)* | 알레르기·숨은 성분 추론 | `nvidia/Nemotron-3-Ultra-550b-a55b` | 안전 판단 → 가장 강한 추론 |
| ⑤ 완료 | 돌봄 → Pet Life Record (식습관·배변·약·행동·주의사항) | `nvidia/nemotron-3-super-120b-a12b` | 기록된 사실만 쓰는 긴 맥락 요약 |
| 새 반려동물 🚧 | 말로 한 설명 → 프로필 사실, 각각 근거 문장과 함께 | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | 근거 문장이 없는 값은 서버가 버림 |

¹ Token Factory의 NVIDIA 비전 모델(`Nemotron-Nano-V2-12b`·`Cosmos3-Super-Reasoner`·`Nemotron-3-Nano-Omni`)은 Dedicated Endpoint 전용이라 공용 API로 부를 수 없고(2026-10-02 확인), 심사 기간 내내 켜 두면 크레딧을 넘음 → 비전은 공용 API의 MiniCPM-V-4.5. 추론·글쓰기·답장은 Nemotron.

**함께 쓰는 서비스:** **Tavily**(성분·리콜 웹 검색, 품종 정보 — 🚧), 펫 프로필 음성 단계의 음성→글에 **Groq Whisper** 🚧 (Token Factory에는 음성 모델이 없음 — 2026-10-10 확인), **Cloudinary**(사진), **Supabase**(데이터베이스·인증·실시간·pgvector), **Google Calendar / Meet**, **OpenStreetMap**.

**호스팅.** 웹 앱은 **Vercel**, FastAPI 백엔드는 **Render**(Docker, 무료 플랜)입니다. Render 무료 플랜은 15분 뒤 잠들기 때문에 GitHub Actions와 외부 크론이 10분마다 `/health`를 호출하고, Supabase가 멈추지 않도록 하루 한 번 데이터베이스 핑을 보낼 예정입니다 🚧.

<!-- TODO(10.6, 제출 전): "Token Factory가 작업을 어떻게 빠르게 했나" + 모델별 피드백 표. 내용을 지어내지 않는다. -->

---

## 프라이버시·안전

- **출입 정보는 제때만.** Lockbox·Buzzer 코드는 예약된 시터에게만, 방문 2시간 전부터 돌봄 종료까지 보이고, 열릴 때 견주에게 알림이 갑니다. AI 프롬프트와 RAG에는 절대 들어가지 않습니다.
- **필요한 만큼만 공개.** 시터는 문의나 예약이 살아 있는 동안에만 견주의 이름과 문의한 반려동물을 봅니다.
- **위치는 이동 중에만.** 예약 상대방에게만 현재 위치 하나를 공유하고, 도착하면 멈춥니다. 경로 기록은 저장하지 않습니다. 공유를 거부해도 괜찮습니다 — 만나는 장소는 계속 보입니다. 🚧
- **AI는 사실을 지어내지 않습니다.** 가격·날짜·가능 여부는 DB에서, 알림장과 Life Record는 그날 기록된 것만으로, 상대에게 닿는 AI 메시지는 모두 사람이 승인합니다.
- **AI 초안은 틀릴 수 있고, 수의학 조언이 아닙니다.** 펫 프로필(🚧)은 견주가 설명한 내용이며 **행동 평가가 아닙니다**.
- **실제 개인정보 없음.** 데모 계정·반려동물·주소·코드는 모두 가상이고, 말투 학습용 실제 메시지는 프롬프트에 쓰기 전에 익명화합니다.

---

## 아키텍처

<details>
<summary><b>아키텍처와 스택</b></summary>

```
[ 견주 앱 ]            [ 시터 앱 ]
      └──────────┬──────────┘
                 ▼
   Expo (웹 / iOS / Android) — 데스크톱 브라우저에서는 폰 프레임
                 │  REST / JSON · Realtime (알림, 실시간 대화)
                 ▼
        FastAPI (파이썬 백엔드)
          ├── Supabase     → PostgreSQL + RLS · 인증 · Realtime · pgvector (RAG)
          ├── Cloudinary   → 사진/영상 저장, 압축, 썸네일
          ├── Nebius Token Factory
          │     ├── Nemotron Nano   → 문의 자동 답장, 음성에서 프로필 사실 추출
          │     ├── Nemotron Super  → 체크리스트, 알림장, Life Record
          │     ├── Nemotron Ultra  → 간식 안전 추론 (stretch)
          │     ├── MiniCPM-V       → 캡션, 앨범 분류, 인계 사진 확인
          │     └── Qwen3 Embedding → RAG 검색
          ├── Google Calendar → 영상 Meet & Greet용 Google Meet 링크·초대
          ├── OpenStreetMap → 이동 지도 (보기 전용)
          ├── Tavily       → 성분·리콜·품종 웹 검색 (stretch)
          └── Groq Whisper → 펫 프로필 음성 단계의 음성→글 (예정)
```

| 영역 | 스택 |
| :--- | :--- |
| 프론트엔드 | Expo (React Native for Web) · **Vercel** |
| 백엔드 | FastAPI (Python 3.12) · Docker · **Render** |
| DB / 인증 / 실시간 / 벡터 검색 | Supabase (PostgreSQL, RLS, pgvector) |
| 미디어 | Cloudinary |
| AI | NVIDIA Nemotron + MiniCPM-V(비전) + Qwen3 Embedding @ Nebius Token Factory · Groq Whisper(음성) |
| 지도 | Leaflet + OpenStreetMap |
| 영상 Meet & Greet | Google Meet (Google Calendar API) |
| 웹 검색 | Tavily (stretch) |
| 알림 | Supabase Realtime 인앱 알림 (웹 데모) · Expo 푸시 (네이티브 앱, 해커톤 후) |

</details>

---

## 직접 실행하기

위의 라이브 데모가 가장 빠르게 Goldito를 보는 방법입니다. 내 사본을 돌리려면 **Supabase** 프로젝트, **Nebius Token Factory** 키, **Cloudinary** 계정이 필요합니다(Tavily와 Google OAuth는 선택). 시크릿 설정: [env-setup.ko.md](plan/env-setup.ko.md).

```bash
git clone https://github.com/minsikpaul92/Goldito.git && cd Goldito

# 1. DB — supabase/migrations/*.sql 을 순서대로 적용 (supabase/README.md 참고)

# 2. 백엔드
cd backend && cp .env.example .env            # 키 채우기
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m scripts.seed_demo                    # 데모 견주 + 시터 생성
uvicorn app.main:app --reload --port 8000

# 3. 프론트엔드 (새 터미널)
cd frontend && cp .env.example .env            # EXPO_PUBLIC_API_URL=http://localhost:8000
npm install && npx expo start --web --port 8081
```

`http://localhost:8081`을 열고 **Try demo**를 누르세요. 테스트: `backend/`에서 `pytest -q`, `frontend/`에서 Playwright(해당 README 참고).

| 경로 | 문서 |
| :--- | :--- |
| 백엔드 환경 · 실행 | [backend/README.md](../backend/README.md) |
| 프론트엔드 환경 · 실행 | [frontend/README.md](../frontend/README.md) |
| DB 마이그레이션 | [supabase/README.md](../supabase/README.md) |
| 제품 흐름 · 결정 · 테스트 가이드 | [full-process.ko.md](plan/full-process.ko.md) · [architecture.ko.md](plan/phases/architecture.ko.md) · [test-guide.ko.md](plan/test-guide.ko.md) |

---

## 다음 계획

<details>
<summary><b>로드맵 — 해커톤 이후</b></summary>

- **실결제** — 데모 결제 대신 Stripe 결제·환불·세금
- **도로 기준 ETA** — 라우팅 API, 주소 검색, 네이티브 앱 백그라운드 위치
- **Drop-in 방문** — 짧은 방문 전용 정원 규칙
- **Settings · 패치노트** — 앱 **Settings → What's New**에서 [CHANGELOG](CHANGELOG.md) 확인
- **8bit 펫 상태방** — Home에 다마고치처럼 밥·배변·기분·다음 일정 ([pet-status-room.ko.md](plan/pet-status-room.ko.md))
- **꾸민 알림장** — 반려동물 누끼 스티커와 AI가 고른 테마로 간직하고 싶은 카드로
- **영상으로 기분 읽기** — 짧은 영상에서 눈에 보이는 행동만 근거로 기분 한 줄
- **멍스타그램 · 펫 동반 지도** — 반려동물 자랑 공개 피드, 반려동물과 갈 수 있는 카페·마트·공원
- **시터용 데스크톱** — 시터는 컴퓨터에서 스케줄·알림장을 더 빠르게, 견주는 계속 폰으로

</details>

---

## 자료

- 제품 흐름과 결정: [full-process.ko.md](plan/full-process.ko.md) · [architecture.ko.md](plan/phases/architecture.ko.md) · [test-guide.ko.md](plan/test-guide.ko.md)
- 코드: [backend](../backend/README.md) · [frontend](../frontend/README.md) · [database](../supabase/README.md) · [개발 계획](plan/README.ko.md)
- [해커톤 규정 요약](hackathon/README.ko.md) · [English README](../README.md)

---

## 팀

| 이름 | 역할 |
| :--- | :--- |
| **민식** | 풀스택 리드 |
| **슬기** | AI & 프롬프트 엔지니어 · 데이터 익명화 |
| **묵** | 프로덕트 & UX/UI 디자이너 |

---

## 라이선스

[MIT](../LICENSE)
