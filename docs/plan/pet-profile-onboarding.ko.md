# 펫 프로필 온보딩 · "Max at a glance" (P1, 11.15)

> **한 줄:** 오너가 반려동물을 등록할 때 **사진 한 장 · 말 한마디 · 큰 글씨의 선택 몇 번**만으로 프로필이 채워지고, 시터는 예약 요청에서 **사진 + 5축 차트 + 안전 칩**을 한눈에 본다.
> **상태:** 명세 (2026-10-10). **구현은 맨 마지막** — P0 큐에서 06B · R2 · 10의 핵심이 끝난 뒤(2026-10-10 민식 결정). **적용 범위: 오너로 가입한 직후의 첫 반려동물 등록**(이후 Add pet도 같은 흐름). 시터 · 데모 계정에는 나오지 않는다. 일정은 근사값이고 밀리면 자르는 순서가 있다(§9).
> **다른 온보딩 문서와의 관계:** [onboarding.ko.md](onboarding.ko.md)는 **로그인 전** Welcome · Try demo · 데모 가입(OB.1–OB.5). 이 문서는 **로그인한 오너가 반려동물을 등록하는 흐름**(11.15)이다. 서로 겹치지 않는다.
> **기준:** [full-process.ko.md](full-process.ko.md) · [architecture.ko.md](phases/architecture.ko.md) D38(시터 글쓰기 제로) · D22(종) · D31(출입 정보는 AI에 안 넣음) · D42(재미용 문구 원칙) · [DESIGN.md](../../DESIGN.md) · [tavily.ko.md](tavily.ko.md).
> **UI 문구는 영어**(D1). 아래 영어 문장은 화면 카피 초안이다.

---

## 1. 왜 하나

- 슬기의 Rover 경험: **강아지 정보를 거의 비워 두는 오너가 많다.** 이유는 앱을 많이 쓰는 오너 중 연령대가 높은 분이 많고, **채우는 것 자체가 어렵기 때문**이다 (슬기의 관찰 — 우리가 검증한 통계가 아님).
- 정보가 비면 시터는 처음 만나기 전에 아무것도 모르고, 문의 AI · Life Record · 알림장도 근거가 없다. 프로필을 채우는 일이 **Goldito 전체의 입력**이다.
- 그러므로 목표는 "질문을 잘 만든다"가 아니라 **"비워 두지 않게 만든다"**: 쉬워야 하고, 짧아야 하고, 말로 해도 되고, 글씨가 커야 한다.

## 2. 원칙 (근거 포함)

| 원칙 | 근거 | 우리 규칙 |
| :--- | :--- | :--- |
| **한 화면에 질문 하나** | GOV.UK Design System의 question pages 패턴은 *한 페이지에 한 질문*을 기본으로 한다. 사용자가 무엇을 해야 하는지 이해하고 한 답에 집중하며, 연구에서 **자신감이 낮은 사용자**가 더 쉽게 느낀다고 한다. 모바일과 오류 복구에도 유리 | 모든 질문은 한 화면 하나. 묶는 것은 사용자 조사로 정당화될 때만 |
| **짧게, 건너뛸 수 있게, 필요할 때 묻기** | Apple HIG 온보딩: 빠르고 선택 가능해야 하며, 사람들이 많은 정보를 기억하거나 입력하게 하지 말고 **추가 정보 요청은 필요한 순간까지 미룬다** | 모든 질문에 **Skip**. 등록은 이름 + 종만으로 끝낼 수 있고, 나머지는 나중에 이어서 |
| **총 시간 상한** | "몇 분 이내"라는 **공식 표준은 찾지 못했다.** 설문 업계 데이터(Qualtrics)는 모바일에서 약 **9분**, 데스크톱 약 12분부터 이탈이 급증한다고 하지만 출처의 방법론이 공개돼 있지 않다 | 우리 스스로 **3~5분**을 상한으로 정한다(§4). 사용자 테스트로 확인(§9 DoD) |
| **큰 목표, 넓은 간격** | WCAG 2.2: 포인터 목표 **최소 24×24 CSS px(AA)**, 권장 **44×44(AAA 2.5.5)**. Apple 44 pt, Material 48 dp. 고령 사용자 연구는 "단순하게"와 "컨트롤을 크게 · 간격을 넓게"를 가장 일관된 규칙으로 꼽는다 | 선택지는 **높이 64**, 간격 12 이상 (§7) |
| **한 번의 탭으로 다음** | 설문 업계: 한 번 탭으로 답하는 입력이 모바일에서 가장 잘 되고 매트릭스(표)형 질문은 completion을 떨어뜨린다 (벤더 주장) | 선택지를 누르면 곧바로 다음 화면. 별도 Next 버튼 없음 |
| **AI는 제안만, 확정은 오너** | D38 · D36과 같은 원칙 | 사진 · 음성에서 나온 값은 **"We think… — Is that right?"** 확인 카드를 거쳐야 저장. 안전 항목은 항상 오너가 직접 한 번 눌러야 함 |

## 3. 흐름

```
0. Species (big Dog / Cat)  →  Name
1. Photo  (optional)         →  AI suggests breed + coat in the background
2. Tell us about {name} (voice or type, optional)
                             →  AI extracts facts + pre-fills questions it can answer
3. Questions, one per screen →  12 about {name}'s personality, only the ones not already answered
4. Safety essentials (6)     →  always shown; AI never answers them for the owner
5. "Meet {name}" card        →  preview of what the sitter will see → Save
```

### 3.0 언제 나오나 (2026-10-10 결정)

- **오너로 가입** → 곧바로 이 흐름으로 **첫 반려동물 등록**(0~5단계) → Home. 가입 화면 자체는 지금 그대로(이메일 · 비밀번호 · 역할).
- 이후 **Add pet**도 같은 흐름. 이미 있는 펫을 **고칠 때**는 지금의 `PetForm`을 그대로 쓴다.
- **시터**에게는 나오지 않는다(시터는 시터 프로필 화면이 따로 있음). 음성 · 성격 질문 · 사진은 모두 **오너 등록 단계에서만** 쓴다.
- **Try demo 계정**은 이 흐름을 건너뛴다. 데모 펫(Max · Mochi)은 시드(10.1)에서 `pets.profile`을 미리 채워 두어(S1이 들어온 뒤), 시터 카드와 "at a glance"를 흐름을 거치지 않고도 바로 보여 준다.

- 1~2단계의 **AI 작업은 백그라운드**에서 돌고, 오너는 기다리지 않고 다음 화면으로 간다. 결과가 오면 해당 화면의 선택지에 **"✨ suggested" 표시**로 미리 얹힌다(§6).
- 아무것도 건너뛰어도 5단계까지 간다. 비어 있는 축은 차트에서 빼고 "Not shared yet"으로 둔다.
- 등록 후에도 **Pet profile → "Tell Chloe more about Max"**로 남은 질문을 이어서 할 수 있다(한 번에 하나, 같은 화면 컴포넌트).

### 3.1 화면 모양 — 추천은 A

| 안 | 모양 | 평가 |
| :--- | :--- | :--- |
| **A (추천)** | 질문이 화면 가운데에 크게. 답을 누르면 약 200 ms 눌림 표시 후 **옆으로 밀려 다음 질문**. 위쪽에 진행 막대 + `Back` | 가장 단순하고 한 번에 한 가지만 보임. 고령 사용자에게 예측 가능 |
| B | 답한 질문은 위로 한 줄로 접히고 새 질문이 가운데에 뜸 (대화형) | 진행감은 좋지만 화면이 점점 길어지고 되돌아가기가 어려움 |

A로 간다. 마지막 **요약 화면(5단계)**에서 항목을 눌러 고치므로 B의 "지난 답 보기"도 해결된다.

## 4. 퀴즈 설계 — "MBTI가 아니라 행동 설명"

**참고한 것(문항은 베끼지 않음):** MCPQ-R(형용사 26개, 5요인), C-BARQ(상황별 행동 약 100문항), DPQ(5요인, 긴 판 75 · 짧은 판 45문항), 고양이는 Feline Five · Fe-BARQ. 우리 문항은 **같은 개념(낯선 사람, 다른 개, 소음, 혼자 있기, 에너지, 식욕, 훈련 정도)을 우리 말로 새로 썼고** 4지선다이므로 **원 설문의 검증이 이어지지 않는다.** 그래서 화면에는 항상 *"Based on what you tell us — not a behavior assessment"*를 적고, "검증된 성격검사"라고 부르지 않는다. (C-BARQ · DPQ의 이용 조건은 확인하지 못했다 — 문항을 쓰지 않으므로 문의는 필요 없다.)

**규칙**
- 질문 **12개(차트) + 6개(안전) = 18개**, 화면당 약 10초 → 약 **3분**. 음성으로 채워진 것은 건너뛰므로 더 짧다. 개와 고양이는 문항을 따로 둔다.
- 선택지는 **4개**, 아래 표의 순서(그 특성이 약한 쪽 → 강한 쪽, 점수 1→4)로 고정한다. 모든 화면에 **Skip**(= "Not sure").
- 차트는 **높을수록 좋다가 아니라 "그 특성이 더 강하다"**를 뜻한다. 점수(%)를 보여 주지 않고 **4단계 말(Level words)**로만 보인다.
- **공격성 · 물림 · 탈출 같은 안전 항목은 차트에 넣지 않는다.** 점수로 뭉개면 안 되는 정보이므로 별도 칩과 문장으로 보인다.

### 4.1 개 — 차트 12문항 (5축)

화면 문구는 영어, 한국어는 설명. `{name}`은 반려동물 이름.

| # | 축 | 질문 | 선택지 (점수 1→4) |
| :-- | :-- | :-- | :--- |
| 1 | Sociability | When a visitor comes in, {name}… | Keeps a distance · Watches, then comes over · Comes over for a sniff · Runs over to say hello |
| 2 | Sociability | Meeting another dog on a walk, {name}… | Pulls away or tenses up · Walks past · Says a calm hello · Wants to play right away |
| 3 | Sociability | Around children, {name}… | Prefers to avoid them · Is careful · Is fine · Loves them |
| 4 | Sensitivity | When there are loud noises (thunder, vacuum, fireworks), {name}… | Doesn't notice · Looks up, then relaxes · Gets nervous for a while · Panics or hides |
| 5 | Sensitivity | In a new place or a change of routine, {name}… | Settles right away · Is a little unsure · Needs a day or two · Gets stressed |
| 6 | Sensitivity | When left alone at home, {name}… | Sleeps or plays · Settles after a few minutes · Whines or paces · Gets very upset |
| 7 | Energy | A normal day, {name} needs… | A short stroll · One good walk · Two long walks or a run · Hours of activity |
| 8 | Energy | Indoors, {name} is mostly… | Asleep on the couch · Relaxed, follows me around · Playful in bursts · Always on the move |
| 9 | Appetite | At meal time, {name}… | Eats slowly, sometimes skips · Eats calmly · Eats eagerly · Gulps it down and wants more |
| 10 | Appetite | About treats, {name}… | Takes them or leaves them · Likes them · Works hard for them · Would do anything for one |
| 11 | Trainability | Commands like "sit" and "come" — {name}… | Is still learning · Knows the basics · Follows reliably · Follows even with distractions |
| 12 | Trainability | On a leash, {name}… | Is hard to hold when excited · Pulls a lot · Pulls a little · Walks nicely beside me |

(점수는 항상 **"그 축이 더 강함"** 방향이다: 문항 4·5·6은 높을수록 더 민감, 11·12는 높을수록 더 잘 따름. 화면에는 점수를 보이지 않는다.)

**축 → 4단계 말:** Sociability *Reserved · Selective · Friendly · Social*, Sensitivity *Unfazed · Mild · Sensitive · Very sensitive*, Energy *Couch · Steady · Active · Very active*, Appetite *Light · Steady · Hearty · Food-driven*, Trainability *Learning · Basics · Reliable · Star pupil*.
**계산:** 답한 문항 점수의 평균을 반올림해 단계로 보인다. 답이 하나도 없는 축은 숨긴다. AI는 점수를 만들지 않는다 — 고정 규칙.

### 4.2 고양이 — 차트 10문항

| 축 | 질문 (요지) |
| :-- | :-- |
| Sociability (3) | 방문객 · 다른 반려동물 · 안기거나 만져질 때 |
| Sensitivity (3) | 큰 소리 · 새 장소/루틴 변화 · 혼자 있을 때(숨는지) |
| Energy (2) | 놀이를 얼마나 원하는지 · 집 안에서 보내는 모습 |
| Appetite (1) | 식사 때와 간식에 대한 태도 |
| Handling (1; Trainability 대신) | 캐리어 · 빗질/발톱 · 약 먹이기를 얼마나 받아들이는지 |

문항 문구는 개와 같은 방식으로 구현 때 작성한다(고양이 동작에 맞게 — "Walk" 같은 개 전용 표현 금지, D23).

### 4.3 안전 필수 6문항 (차트 밖, 4지선다 + 항상 오너가 직접)

| # | 질문 | 선택지 |
| :-- | :-- | :--- |
| S1 | Has {name} ever bitten or snapped at a person? | Never · Once · More than once · Not sure |
| S2 | With other animals, {name}… | Gets along with all · Picky about some · Can't be with others · Not sure |
| S3 | Could {name} slip out of a door or gate? | Never · Sometimes, when excited · Often tries · Not sure |
| S4 | Guarding food, toys or spaces… | Never · Sometimes, with other animals · With people too · Not sure |
| S5 | Anything a sitter must know about health? | Nothing · Daily medication · A condition to watch · Both |
| S6 | Foods {name} must avoid? | (큰 칩: Chicken · Beef · Dairy · Wheat · Fish · None · "Something else" → 말하기/입력) |

- S1~S4의 **Once 이상 / Can't be with others / Often tries / With people too**는 시터 카드에 **경고 칩**으로 보인다("⚠️ Has bitten once").
- S5가 약이면 **케어 요청서(06)**로 이어지는 링크("Add her medication"). S6은 기존 `pet_allergies`로 저장.
- "Not sure"를 고르면 시터에게 **"Owner isn't sure"**로 보인다 — 비워 둔 것과 다르게.

## 5. 시터가 보는 카드 — "{name} at a glance"

```
┌─────────────────────────────────────────┐
│ [사진]   Max · Maltese · 4 yrs · 6 kg    │
│          ⚠️ Has snapped once · 🍗 No chicken │
│                                          │
│       Sociability ●                      │
│   Trainability ●     ● Sensitivity       │  ← 5각형, 단계 1–4 (칸 눈금 4개)
│        Appetite ●  ● Energy              │
│                                          │
│  Needs: 2 walks/day · daily brushing     │  ← 품종 신체 필요 (§8), 출처 링크
│  Owner's description — not an assessment │
└─────────────────────────────────────────┘
```

- 야구 게임 선수 카드처럼 **사진 + 5각형**을 한눈에 보여 주는 참고 이미지에서 가져온 구조다. 게임 능력치와 달리 **숫자가 없고 높은 쪽이 좋다는 뜻도 없다.**
- 위치: ① 시터의 **예약 요청 카드 / 문의 스레드의 펫 칸**(03B · 07B) ② Pet detail ③ Life Record 위(07C)와 같은 카드 재사용. 시터가 볼 수 있는 범위는 **기존 규칙 그대로**(요청 · 문의를 받은 시터 — RLS `can_view_pet_profile`, D50).
- 차트는 `react-native-svg`로 그린다(현재 `package.json`에 없음 → 의존성 추가). 5각형 배경 격자 4단계, 값 다각형, 접근성 라벨은 "Sociability: Friendly" 식의 텍스트.
- RAG: 답 요약 문장("Max is Friendly, Sensitive to noise, Food-driven.")을 `pet` 범위로 인덱싱해 문의 AI의 근거로 쓴다(D31 해당 없음 — 출입 정보 아님).

## 6. AI로 쉽게 — 사진 · 음성

### 6.1 사진 → 품종 · 색 (MiniCPM-V)

- 사진 업로드(기존 Cloudinary 파이프, 클라이언트에서 긴 변 1024 px로 줄여 업로드) → `POST /api/ai/pet-photo {media_id}` → `{species_match, breed_guesses:[{name}] ≤ 3, mixed_breed: bool, coat_color}`.
- 화면: 선택지 칩 `Maltese?` · `Poodle mix?` · `Not sure` — 오너가 하나 누르거나 직접 입력. **자동으로 채우지 않는다.**
- **정확도 주의:** 품종 분류의 일반적인 공개 수치는 **순종 위주**(예: CLIP 제로샷이 Oxford-IIIT 37품종에서 약 86%)이고, **믹스견에 대한 검증 수치는 찾지 못했다.** 그래서 "맞다/아니다" 확인이 필수이고, 마케팅 문구로 정확도를 말하지 않는다.
- 실패 · 20초 초과 → 조용히 건너뜀(칩 없음).

### 6.2 음성 → 글 → 사실 추출

**파이프라인:** 브라우저에서 **녹음**(`MediaRecorder`, 최대 60초) → 백엔드 → **음성→글(STT)** → **Nemotron**이 글에서 사실만 추출 → 확인 카드. 글로 바꾼 뒤의 추출 · 판단은 계속 Token Factory(Nemotron)다.

**Token Factory에는 STT가 없다.** 2026-10-10 `GET /v1/models`: 두 base URL(25 · 18개 모델)에서 whisper · asr · speech · audio 계열을 찾지 못했다([model-ids.md](phases/notes/model-ids.md)). 그래서 STT만 외부 서비스 하나를 쓴다.

| 후보 (조사 2026-10-10 — 가격 · 한도는 바뀔 수 있어 구현 전 확인) | 비용 | 장점 | 걸림돌 |
| :--- | :--- | :--- | :--- |
| **Groq `whisper-large-v3-turbo`** | **무료 플랜**: 분당 20요청, **오디오 7,200초/시간 · 28,800초/일** | 무료, 빠름, OpenAI 호환 API, FLAC · MP3 · M4A · OGG · WAV · WEBM 지원(Chrome webm · Safari mp4 모두 가능성 높음 — 실기기 확인) | 무료 플랜의 데이터 약관은 이번에 확인하지 못함. 파일 한도 자료가 25MB / 40MB로 엇갈림(60초 녹음은 문제 없음) |
| **Gemini API (Flash 계열)** | 무료 플랜 있음(한도는 AI Studio에서 확인) + **민식의 유료 키** | WAV · MP3 · AAC · OGG · FLAC · M4A · WebM 지원, 글 + 구조화를 한 번에도 가능(우리는 글만 받는다 — 추출은 Nemotron) | **무료(unpaid) 플랜은 입력이 구글 제품 개선에 쓰이고 사람이 읽을 수 있다.** 결제 계정이 연결된 유료 플랜은 그렇지 않다 → **유료 키로** 쓸 것 |
| OpenAI `gpt-4o-mini-transcribe` / `whisper-1` | 분당 약 $0.003 / $0.006 (제3자 정리 — 공식 가격표 확인) | 정확, 간단 | 유료, 25MB 한도 |
| 브라우저 Web Speech API | 무료, 키 없음 | 말하는 동안 글자가 바로 보임 | 오디오가 브라우저 제공자 서버로 감, Firefox 기본 미지원, Safari 현재 지원 불명 |
| NVIDIA Parakeet (build.nvidia.com) | 불명 | NVIDIA 오픈 모델 | 호스팅 무료 여부 · 한도 확인 못 함, "프로토타이핑 용도" 안내, gRPC |

- **결정 (2026-10-10): Groq `whisper-large-v3-turbo`, 무료 플랜.** 키는 백엔드 env에만(`GROQ_API_KEY`). Gemini · OpenAI는 쓰지 않는다 — Groq가 안 될 때의 비상용으로 Gemini **유료 키**가 있다는 것만 기억해 둔다(무료 Gemini는 입력이 제품 개선에 쓰이므로 사용하지 않음).
- **구현 때 확인할 것(반나절):** 실제 음성 5개(조용한 곳 · 시끄러운 곳 · 반려동물 이름 포함 · 느린 말투 · 고령 화자)로 글이 쓸 만한지, **iPhone Safari(mp4) · Chrome(webm) 업로드가 되는지**, Groq 무료 플랜 약관의 데이터 취급. 반려동물 이름 · 품종이 자주 틀리므로 오너가 글을 고칠 수 있어야 한다. 이 결과가 나쁘면 위 표의 다른 후보로 바꾼다.
- **해커톤:** 외부 STT는 README에 "다른 서비스"로 적는다. 공식 규칙 페이지는 이번에 열 수 없어(403) 제3자 서비스 허용 여부를 **확인하지 못했다** — Tavily도 이미 외부 서비스라 같은 취급이지만 제출 전에 규칙 문장으로 확인한다.
- 화면: 88 px 마이크 버튼(눌러서 시작/정지), 녹음 시간 표시, 끝나면 "Reading what you said…"(약 2~4초) 후 **글이 보이고 오너가 고칠 수 있다.** 아래에 **"Or type it" 항상 표시.** 한 줄 고지: "Your voice is sent to a speech-to-text service to make text. We don't keep the recording."
- 글 → `POST /api/ai/pet-voice`(오디오 `multipart` 또는 `transcript` 텍스트 중 하나) → `MODEL_FAST`(Nano, JSON) → `{transcript, fields:{breed?, age?, weight?, allergies?[], medications?[], likes?[]}, answers:{q3:{value, quote}, …}}`.
- **환각 방지(D29와 같은 방식):** 각 값에는 **글 속 근거 문장(quote)**이 있어야 하고, 서버가 그 문장이 글에 실제로 있는지 검사한다. 근거 없는 값 · 허용 목록 밖의 값은 버린다. **S1~S4(안전)는 미리 골라 주지 않는다** — 말했더라도 "We heard '…' — tap to confirm"만 보여 준다.
- 오디오 · 글은 저장하지 않고(추출된 답만 저장), 프롬프트에 연락처 · 주소를 넣지 않는다.
- 안내 예시(화면): *"Tell us about {name} — what's {name} like? Brag a little!"*

### 6.3 건너뛰기 / 실패

두 AI가 모두 실패해도 §3 흐름은 그대로 18문항이다. 오너가 AI를 눈치채지 못할 정도로 **추가 대기가 없어야 한다**(§7).

## 7. 부드럽게 — 지연 없는 구조

| 목표 | 방법 |
| :--- | :--- |
| 탭 → 다음 화면 **< 100 ms** | 질문 단계는 **한 화면 컴포넌트의 상태**(`step`)로 바꾼다 — 라우트 이동 없음, 네트워크 호출 없음. 다음 질문 컴포넌트는 미리 렌더. 전환은 `transform`/`opacity`만 (네이티브 드라이버) |
| 질문 사이에 스피너 금지 | 답은 **로컬 상태 + 로컬 저장**(AsyncStorage/localStorage)에 즉시 쓰고, 서버에는 **끝에서 한 번**(또는 섹션마다 한 번) 저장. 새로고침해도 이어서 |
| AI가 흐름을 막지 않음 | 사진 · 음성 호출은 **시작하고 바로 다음으로**. 목표: 사진 p50 ≤ 8 s, 음성(STT 2~4 s + 추출) p50 ≤ 12 s. **15 s 넘으면 조용히 포기.** 도착하면 이미 지나간 화면은 건드리지 않고 **다음에 나오는 질문**의 선택지에 "✨ suggested"로 얹음 |
| Render 콜드스타트(30~50 s) 흡수 | 온보딩 **0단계에서 `/health`를 백그라운드로 한 번** 호출해 서버를 깨움. keepalive는 그대로 |
| 사진이 느리지 않게 | 선택 즉시 로컬 미리보기, 업로드는 백그라운드, 클라이언트에서 긴 변 1024 px · JPEG로 줄임 |
| 저장 한 번 | `pets` + `pet_allergies` + `profile`을 **하나의 요청(또는 RPC)**으로. 실패하면 로컬 초안이 남아 다시 시도 |
| 큰 글씨 | 아래 §7.1 |

### 7.1 큰 글씨 · 큰 버튼 (DESIGN.md의 16 px 본문보다 키움 — 이 흐름 한정)

| 요소 | 값 |
| :--- | :--- |
| 질문 | 28 px / 700, 한 문장 |
| 선택지 | 20 px / 600, **높이 64**, 전체 폭, 간격 12 이상, 선택 시 `primary` 테두리 + 체크 + 200 ms |
| 보조 문장 | 18 px (11~14 px 금지) |
| 마이크 버튼 | 88 px, 상태(듣는 중 · 정지)와 남은 시간이 눈에 보임 |
| 대비 | 본문 · 선택지 글자 **4.5:1 이상, 가능하면 7:1** |
| 시스템 글꼴 크기 | 운영체제의 글자 크기 설정을 따르고(`allowFontScaling`), **200%에서도 레이아웃이 깨지지 않음** |
| 한 화면 한 행동 | 선택지가 주 행동 · Back(왼쪽 위, 44 px 이상) · Skip(아래 텍스트 링크)만 |
| 움직임 | `prefers-reduced-motion`이면 전환 애니메이션 끔 |

> 위 값은 **제안**이다. Figma에서 묵이 확정하고, 확정되면 `DESIGN.md`에 "Large-text flow" 절로 옮긴다.

## 8. 데이터 · 출처 — 3개만 쓴다

| 쓰는 것 | 용도 | 비고 |
| :--- | :--- | :--- |
| **① Tavily** (이미 계획됨) | 품종의 **신체 필요**(운동 · 털 관리 · 더위/관절 주의) 검색, 간식 성분 · 리콜 보조 | 아래 §8.1 |
| **② 캐나다 정부 오픈데이터 — Recalls and Safety Alerts** | 간식 리콜 확인(08) | 공식, 무료, Open Government Licence. JSON 파일과 API 가이드가 있음. **사료 전용 필터가 있는지는 확인하지 못함** → 샘플 레코드를 먼저 확인(스파이크) |
| **③ 직접 정리한 정적 JSON** (슬기 감수) | 품종 20종 + 고양이 8종의 신체 필요 / 독성 규칙 표(종별) | 출처 URL을 행마다 단다. ASPCA · Pet Poison Helpline에는 공개 API · 오픈 라이선스가 없어서 **문구를 복사하지 않고 사실(성분 이름)과 출처 링크만** |

**쓰지 않는 것 (이유):** The Dog API — 품종 특성은 유료 요금제부터, 데이터 출처 미표기 / API Ninjas — 공식 문서 · 출처 확인 안 됨 / openFDA — 동물 **약 · 기기** 이상반응이고 사료는 다루지 않음, 분기 업데이트에 3~6개월 지연 / Open Pet Food Facts — 바코드는 계획 밖, 캐나다 사료 커버리지 불명.

**품종 정보는 몸이 필요한 것만 보여 준다** (성격은 오너가 고른 개체 값). 근거: Morrill 외 2022(*Science*)에서 품종이 **개체 행동 차이의 약 9%**만 설명한다.

### 8.1 Tavily를 적극적으로 쓰는 곳 (전부 백엔드, 출처 링크와 함께)

| # | 언제 | 하는 일 | 런타임 호출? |
| :--- | :--- | :--- | :--- |
| T1 | 오너가 고른 · 입력한 **품종이 정적 JSON에 없음** | `search`(`include_domains`: `akc.org`, `vcahospitals.com`, `merckvetmanual.com`, 고양이 `icatcare.org` · `cfa.org`) → Nemotron이 **반환된 본문만으로** 3칩 요약 → `breed_notes`(품종, 칩, 출처, 시각)에 캐시 → 시터 카드의 "Needs" 줄에 출처와 함께 | **예** — 데모 영상에서는 정적 JSON에 없는 품종으로 보여 준다 |
| T2 | 정적 JSON을 **만들 때**(오프라인) | `backend/scripts/build_breed_needs.py`가 같은 함수를 돌려 후보를 만들고 슬기가 감수. 정해진 URL은 `extract`로 읽음 (5개 URL = 1 크레딧) | 아니오 |
| T3 | 간식 스캔에서 WARNING · 모르는 성분 (08.7) | 기존 계획 그대로 | 예 |
| T4 | 숨은 알레르기 출처 확인 ("animal fat → 닭고기 유래?") (08.7) | 기존 계획 그대로 | 예 |

- 크레딧: Tavily 무료 플랜은 **월 1,000 크레딧**, 기본 `search` 1 크레딧 · 고급 2 · `extract` 5 URL당 1 (Tavily 공식 문서). T1은 새 품종당 1회(캐시)라 사실상 몇십 크레딧이다. 행사 8,000 크레딧은 [tavily.ko.md](tavily.ko.md) 기록이고 이번 조사에서 확인하지 못했다.
- `tavily.ko.md`의 "search 하나만 쓴다" 규칙은 **런타임은 search만, 오프라인 스크립트는 extract 허용**으로 바꾼다.
- 어떤 경우에도 Tavily 결과가 **안전 판정을 낮추지는 않는다**(08의 서버 규칙이 우선, 모델이 SAFE여도 서버가 DANGER로 덮는 규칙 유지).

## 9. 구현 순서 · 일정(근사) · DoD

| 단계 | 내용 | 크기 |
| :--- | :--- | :--- |
| **S1** AI 없는 핵심 | 한 화면 한 질문 흐름(§3, §7), 18문항 · Skip · Back · 로컬 초안, 요약 화면, `pets.profile`(jsonb) 저장, "at a glance" 카드(`react-native-svg` 5각형 + 경고 칩), 시터 요청 카드에 표시. **큰 글씨 · 64 px 선택지** | 중 |
| **S2** 사진 | `/api/ai/pet-photo` + 확인 칩 | 작음 |
| **S3** 음성 | STT 스파이크(§6.2) → 녹음 · `/api/ai/pet-voice` · quote 검사 · 확인 카드 | 중 |
| **S4** Tavily | T1 품종 신체 필요 + `breed_notes` + 정적 JSON 20+8종 | 작음~중 |
| S5 (08과 함께) | 독성 규칙 표 · 캐나다 리콜 | phase-08 |

**순서와 일정 (근사값 — 2026-10-10 기준):** FB-35 → RV-2 · 3 · 5 ≈ 10/12 · 06B 10/13~17 · R2 10/18~19 · **10 데모 · 배포의 핵심**(시드 · 고정 데모 계정 · README · keep-alive) 10/20~24 · **11.15 S1 10/24~25 · S2 10/25 · S3 10/25~26 · S4 10/26~27** · 영상 녹화 10/27~28 · Q.8 최종 QA 10/27~29 · 제출 10/30. **빠듯하다.**

**맨 마지막이라 생기는 일:** ① 밀리면 **가장 먼저 잘리는 것**이 이 기능이다 — 자르는 순서는 S4(Tavily 품종 조회 — 정적 JSON만) → S3(음성 — 직접 입력만) → S2(사진) → S1만 남긴다. ② 영상 녹화는 그때까지 들어온 것으로 한다. S1(카드 포함)이 들어왔다면 시드로 채운 데모 펫 `profile`로 "at a glance" 카드는 흐름 없이도 보여 줄 수 있다. 08 세이프티는 원래 stretch라 11.15 뒤로 간다.

**DoD**
1. 18문항을 **처음 하는 사람이 3~5분 안에** 끝낸다 — **55세 이상 3명**(가족 · 지인)이 도움 없이 해 보고 걸린 시간을 기록 (슬기 주도).
2. 탭 → 다음 화면이 느리다고 느껴지지 않는다(수동) + Playwright로 "답 클릭 후 100 ms 안에 다음 질문이 보임".
3. 네트워크를 끊어도(AI 없이) 18문항을 끝내고 저장할 수 있다 — 저장만 재시도.
4. 음성: 글에 없는 값이 저장되지 않는다(단위 테스트: quote 불일치 → 버림). 안전 4문항은 한 번도 자동으로 선택되지 않는다.
5. 시터 카드: 값이 비면 축이 빠지고 "Not shared yet", "Owner isn't sure"가 "비워 둠"과 다르게 보인다. 데스크톱 프레임 마우스만으로 전체 흐름 완료.
6. 질문 · 카드 어디에도 "MBTI" · 점수(%) · "검증된"이라는 말이 없고 "not a behavior assessment" 문구가 있다.

## 10. 열린 질문 (회의 의제 — TODO "Meeting agenda")

| # | 질문 | 담당 |
| :--- | :--- | :--- |
| 1 | ~~앞당길지~~ → **P0 큐의 맨 마지막으로 결정(2026-10-10).** 영상 녹화 시점(11.15 없이 찍을 수도 있음)과 자르는 순서 확인 | 민식 · 팀 |
| 2 | 질문 문구 · 선택지 순서 감수(시터 관점), 품종 20+8종 목록 | 슬기 |
| 3 | 큰 글씨 값 · 카드 모양 확정(Figma), 5각형 축 이름 | 묵 |
| 4 | ~~STT 제공자~~ → **Groq Whisper 무료 플랜으로 결정(2026-10-10).** 구현 때 Safari · Chrome 녹음과 약관만 확인 | 민식 |
| 5 | 캐나다 리콜 JSON에 사료가 들어 있는지 샘플 확인 | 민식 (08 전) |
| 6 | 해커톤 공식 규칙에서 외부(제3자) 서비스 사용 · 고지 조건 확인 | 민식 |

---

## 11. 출처 (이번 조사, 2026-10-10)

- GOV.UK Design System — [Question pages](https://design-system.service.gov.uk/patterns/question-pages), [One thing per page](https://designnotes.blog.gov.uk/2015/07/03/one-thing-per-page/)
- Apple HIG 온보딩 (Apple 도메인 미러 페이지로 확인 — 원문에서 다시 확인 권장): [Onboarding](https://developer-rno.apple.com/design/human-interface-guidelines/patterns/onboarding)
- 목표 크기: WCAG 2.2 SC 2.5.8 (24 px) · 2.5.5 (44 px) 요약 — [Target size](https://wcag.dock.codes/documentation/wcag258); 고령 사용자 앱 지침 체계적 고찰 — [PMC10557006](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10557006/)
- 설문 이탈 시간(벤더 수치, 방법론 미공개) — [Qualtrics](https://www.qualtrics.com/articles/strategy-research/4-tips-for-preventing-drop-offs-in-surveys/) · 모바일 완료율이 낮다는 동료심사 연구 — [BMC Research Notes](https://bmcresnotes.biomedcentral.com/articles/10.1186/1756-0500-6-258)
- 성격 설문: MCPQ-R 신뢰도 — [Ley 외](https://wellbeingintlstudiesrepository.org/person/9) · DPQ — [Gosling 연구실](https://gosling.psy.utexas.edu/scales-weve-developed/dog-personality-questionnaire-dpq/) · C-BARQ — [Penn](https://vetapps.vet.upenn.edu/cbarq/) · Fe-BARQ — [Penn](https://vetapps.vet.upenn.edu/febarq/about.cfm) · Feline Five — [Kinship 정리](https://kinship.com/cat-behavior/feline-five-study)
- 품종의 설명력 약 9% — [Morrill 외 2022, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9675396)
- 음성: [Groq 속도 제한 (Whisper 무료 플랜)](https://console.groq.com/docs/rate-limits) · [Groq Whisper large v3 지원 형식](https://console.groq.com/docs/model/whisper-large-v3) · [Gemini 오디오 이해](https://ai.google.dev/gemini-api/docs/audio) · [Gemini API 추가 약관 (무료/유료 데이터 사용)](https://ai.google.dev/terms) · [NVIDIA NIM FAQ](https://forums.developer.nvidia.com/t/nvidia-nim-faq/300317) · 브라우저 음성 인식은 서버 기반인 경우가 많음 — [MDN Web Speech API](https://developer.mozilla.org/docs/Web/API/Web_Speech_API) · Token Factory 카탈로그는 `GET /v1/models`로 직접 확인 ([model-ids.md](phases/notes/model-ids.md))
- Tavily 크레딧 · 엔드포인트 — [docs.tavily.com/guides/api-credits](https://docs.tavily.com/guides/api-credits)
- 캐나다 리콜 — [Recalls and Safety Alerts (Open Government)](https://open.canada.ca/data/en/dataset/d38de914-c94c-429b-8ab1-8776c31643e3)
- 쓰지 않기로 한 것: [TheDogAPI 문서](https://docs.thedogapi.com/docs/intro) · [openFDA Animal & Veterinary](https://open.fda.gov/apis/animalandveterinary/event)
