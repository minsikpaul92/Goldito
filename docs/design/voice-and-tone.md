# Goldito — Voice & Tone Guide

> **목적:** Goldito 앱 전반(온보딩, 질문, 버튼, 알림장, 챗봇)에서 일관되게 지켜야 하는 문구 작성 및 어조(Voice & Tone) 원칙을 정의합니다.
> **핵심 가치:** 간결함(Concise) · 쉬운 일상 단어(Plain English) · 행동 중심(Action-based) · 시터/견주의 현실 반영(Real-world context).

---

## 1. 대원칙 (Core Principles)

| 원칙 | 설명 및 예시 | 나쁜 예 (지양) | 좋은 예 (지향) |
|---|---|---|---|
| **1. 1초 직관성** | 어르신이나 비영어권 사용자도 한눈에 바로 이해할 수 있는 쉬운 일상 단어를 쓴다. | `When a visitor comes in…`<br>`Are you away at work?` | `When a guest visits…`<br>`Do you have a fenced yard?` |
| **2. 질문다운 질문** | 뭉뚱그린 명사구나 진술형 대신, `Do you ~?`, `How many ~?`로 명확하게 묻는다. | `Pick-up preference`<br>`Board pets simultaneously` | `How do pick-up and drop-off work?`<br>`Do you take pets from different families?` |
| **3. 선택지는 3개 이내로** | 인지 피로를 줄이기 위해 선택지는 최대 2~3개 내외로 압축한다 (`1`, `2`, `3+`). | `COUNT([1, 2, 3, 4, 5, 6, 7])` | `COUNT([1, 2, 3])` (1 · 2 · 3+) |
| **4. 키워드 중심 선택지** | 버튼 안의 글자는 긴 문장 대신 행동/상태 키워드로 짧게 쓴다. | `Gulps it down and wants more`<br>`Pulls away or tenses up` | `Fast & wants more!`<br>`Pulls away` |
| **5. 의학적·진단 용어 금지** | 성격이나 상태를 평가/진단하려 들지 않는다 (MBTI, 질병 추정 금지). | `Behavior assessment`<br>`Separation anxiety confirmed` | `Based on what you tell us`<br>`Very anxious when left alone` |

---

## 2. 시터 온보딩 (Sitter Onboarding)

시터의 사생활을 존중하며, **견주가 돌봄을 맡길 때 가장 불안해하거나 궁금해하는 핵심 실무 조건**을 묻습니다.

### 질문 리스트 & 톤 규칙
1. **반려동물 보유 (최우선 질문):**
   - ❓ `Do you have your own pets at home?` → `Yes` · `No`
2. **동시 위탁 여부:**
   - ❓ `Do you take pets from different families at the same time?` → `Yes` · `No`
3. **최대 케어 마릿수:**
   - ❓ `How many pets can you host at once?` → `1` · `2` · `3+`
4. **산책 제공 횟수:**
   - ❓ `How many walks do you provide a day?` → `1` · `2` · `3+`
5. **활동성 성향:**
   - ❓ `How active is your home?` → `Active` · `Relaxed`
6. **안전한 야외 공간:**
   - ❓ `Do you have a fenced yard or outdoor space?` → `Yes` · `No`
7. **수용 가능한 강아지 체급 (구체적 무게 명시):**
   - ❓ `What dog sizes do you take?`
   - `Small (<15 lbs / 7 kg)` · `Medium (16–40 lbs / 7–18 kg)` · `Large (41+ lbs / 18+ kg)`
8. **고양이 돌봄 여부:**
   - ❓ `Do you take cats?` → `Yes` · `No`
9. **픽업/인계 방식:**
   - ❓ `How do pick-up and drop-off work?` → `I can pick up` · `Owner drops off`

---

## 3. 오너 펫 프로필 온보딩 (Owner Pet Personality)

견주가 자기 강아지/고양이의 성향을 입력할 때 사용합니다. 질문은 `{name}`(반려동물 이름)을 사용해 친근하게 부르며, 4단계 척도(약함 → 강함)를 유지합니다.

### 톤 가이드라인
- **방문객 반응:** `When a guest visits, {name}…`
  - `Stays back` · `Watches first` · `Comes to sniff` · `Runs to say hi!`
- **산책 중 다른 개 대면:** `Seeing other dogs on a walk, {name}…`
  - `Pulls away` · `Just walks past` · `Calm hello` · `Wants to play!`
- **소음 반응:** `With loud noises, {name}…`
  - `Doesn't care` · `Alert, then relaxes` · `Gets nervous` · `Panics or hides`
- **집에서의 성향:** `At home, {name} is mostly…`
  - `Sleeping` · `Relaxed & chill` · `Playful` · `Always active`
- **식사 및 간식:** `At meal time, {name}…` / `With treats, {name}…`
  - `Slow or picky` · `Eats calmly` · `Eats eagerly` · `Fast & wants more!`
  - `Not interested` · `Likes them` · `Works for them` · `Obsessed with treats!`

---

## 4. UI 버튼 및 액션 (Action Microcopy)

- **스킵:** 항상 `Skip` (언제든 건너뛸 수 있음을 명확히)
- **제출/다음:** `Next`, `Save`, `Create account` 등 행동 중심의 명료한 동사 사용
- **설명 링크:** `Already have an account? Sign in` 같이 목적지가 분명한 자연스러운 문장
