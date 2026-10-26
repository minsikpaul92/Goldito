# Goldito 데이터 익명화 및 개인정보 보호 가이드 (Q.3)

> [!IMPORTANT]
> **AI 에이전트 필독 가이드 (Strict Anonymization Rules)**  
> 1. 이 문서는 데이터 익명화 작업을 수행하는 AI 에이전트의 정본 규칙입니다.
> 2. **문서 작성 철칙 (Zero-Leakage):** 본 가이드라인 문서 자체를 포함하여 모든 문서나 커밋 메시지에 **실제 개인정보(실제 인물명, 동물명, 전화번호, 주소, 우편번호, 도어락 번호, 특정 매장명, 지명 등)를 예시로라도 절대 직접 작성하지 마십시오.** 모든 예시와 설명은 반드시 완전히 일반화/추상화된 더미 표기(`[City]`, `[Shop]`, `[Postal Code]`, `XXg`, `N pcs` 등)만 사용해야 합니다.
> 3. **원천 차단 및 치환 우선순위:**
>    * **범위 및 결합 표현 우선 치환:** 복합 범위 표현(`the [Ordinal] to the [Ordinal]`, `[Time]-[Time]`, `N-N pooping per day`, `free anytime N-N`) 및 주소+우편번호 결합 표현(`{ADDRESS} [Postal Code]` 등)을 단일 단어보다 먼저 치환하여 분절 찌꺼기 버그를 원천 방지합니다.
>    * **모든 생활/생리/사료 수치 완전 마스킹:** 사료 팩 수(`N pack`), 배변/산책 횟수(`N-N pooping per day`, `N walks`), 간식 수량(`for N [item]`), 체류 박수(`Nnights`, `N nights`), 복합 급여 수치(`Nx N/N`, `Nx N/N teaspoon`) 등 텍스트에 등장하는 모든 구체적인 수량/횟수/단위 표현을 빠짐없이 해당 플레이스홀더로 치환합니다.
>    * **서수/결합 날짜 전수 치환:** 월(Month) 표기가 없는 단독 서수(`[Ordinal]`) 및 결합 날짜(`{DATE} or N`, `from {DATE}-N`)도 100% `{DATE}`로 치환합니다.

---

## 1. 핵심 원칙

1. **말투는 보존, 모든 식별 정보 및 세부 수치는 100% 완전 마스킹:**
   * 시터 고유의 어조(환영 인사, 세심한 배려 표현, 상태 설명 방식, 이모지 사용 패턴)는 보존하되, 사람 이름, 동물 실명, 견종/품종, 연락처, 주소, 우편번호, 출입/도어락 키 정보, 방문 장소/매장명, 특정 국가/도시/공원명, 대중교통 노선/역명, 특정 동물병원명, 외부 링크, 일정 시각 및 도착 소요 시간, 식단/패키지 단위, 배변/산책 빈도 수치, 구체적인 박수/연수 등 특정 개인/위치/대상을 식별하거나 고유 루틴을 특정할 수 있는 모든 단서는 마스킹합니다.
2. **저장소(Git) 보안 철칙:**
   * 실제 개인정보가 포함된 원본 데이터는 **절대 Git 저장소에 커밋하지 않습니다**.
   * 저장소의 문서 및 커밋에는 **실제 데이터에서 추출한 고유명칭을 예시로도 직접 적지 않으며, 일반화된 더미 표기만 사용**합니다.
3. **무작위 20건 전수 검증 통과 (DoD):**
   * 변환된 데이터 중 무작위 20개 샘플을 사람이 직접 확인하여 개인정보(PII) 유출이 0건이어야 작업을 완료로 인정합니다.

---

## 2. 치환(Placeholder) 및 정제 규칙

에이전트가 텍스트(예: 대화록, 메신저 내보내기 파일)를 처리할 때 적용해야 하는 마스킹 기준입니다.

### 2.1 주요 자리표시자 (Placeholders)

| 구분 | 자리표시자 | 치환 대상 및 패턴 | 변환 예시 설명 (추상화 더미) |
| :--- | :--- | :--- | :--- |
| **금액/요금** | `{PRICE}` | 모든 통화 기호, 숫자 금액, 통화 단위 표기 | `$XX`, `$XX CAD`, `XX dollars` |
| **날짜/일정** | `{DATE}` | 요일, 월/일, 기간 범위, 서수 표기, 연월일, 월 생략 단독 일자/서수, 접속사 결합 단독 일자(`{DATE} or N`, `from {DATE}-N`, `{DATE} to N`) | 특정 요일, 특정 날짜, 날짜 범위, 단독 서수 일자, 결합 일자 |
| **시간/소요시간** | `{TIME}` | 시:분, am/pm 표기, 콜론 없는 3~4자리 시각(`NNN`, `NNNN`), 정각/구두 표기 결합(`between N o’clock and NNN`), am/pm 생략 시각 범위(`N-N`, `NN-N`), 띄어쓰기 없는 분 표기(`in Nminute`, `in NNminute`), 도착 예정 N분(ETA) | `XXam`, `XX:XXpm`, `X-X`, `between {TIME}`, `in {TIME}` |
| **수량/식단/단위** | `{AMOUNT}` | 사료 무게(g, kg), 알 수(pcs), 패키지 단위(`N pack`, `N cans`), 음식/사물/간식 수량(`for N [item]`), 메시지/업데이트/사진 건수(`N-N updates`, `N updates`), 건수/횟수(`these N trips`), 잔여 정류장/배송지 수(`N stops left`), 계량 스푼/펌프 단위(`N teaspoon`, `N pumps`), 수량 배수 접두사(`Nx`), 분수/소수 수치(`N/N`, `N.N`) | `XXg`, `Xpcs`, `{AMOUNT}`, `{AMOUNT} updates`, `these {AMOUNT} trips`, `{AMOUNT} stops`, `{AMOUNT} [unit]` |
| **빈도/횟수** | `{FREQUENCY}` | 일일/주간 활동 및 생리 빈도 (`N-N pooping per day`, `meals Nx a day`, `walks Nx a day`, `all N meals`, `N meals per day`, `N times a day`, `pee N times`) | `{FREQUENCY}`, `all {FREQUENCY} meals`, `meals {FREQUENCY}`, `walks {FREQUENCY}` |
| **체류/경력/소요 기간** | `{DURATION}` | 숙박 기간, 체류 박수/일수, 산책/외출 소요 시간(`Walks take NN to {TIME}` → `take {DURATION}`), 경력/기간 연수 (`Nnights`, `N nights`, `over N years`, `N years already`, `N yrs old`) | `{DURATION}`, `take {DURATION}`, `Xnights`, `over {DURATION}` |
| **견종/품종** | `{BREED}` | 구체적인 반려동물 품종명 (`[Breed A]`, `[Breed B]` 등) | `{BREED}`, `this breed` |
| **국가/도시/지역** | `{LOCATION}` | 특정 국가명, 도시명, 여행지, 출신 국가 및 관련 국적 형용사 | `[Country]`, `[City]`, `[Foreign Region]` 일체 |
| **전화번호** | `{PHONE}` | 국가번호, 지역번호를 포함한 모든 전화번호 형태 | 10~11자리 번호 및 하이픈/괄호 표기 |
| **이메일** | `{EMAIL}` | 모든 형태의 전자우편 주소 | `@` 및 도메인이 포함된 메일 주소 |
| **주소/위치/장소** | `{ADDRESS}` | 도로명 주소, 아파트 동/호수(`#NNN`, `unit NNNN`), **우편번호(국가별 우편번호 포맷 일체)**, 공원/보전지역명, 특정 동물병원 실명, 지하철역/기차역명, 버스 정류장, 특정 카페/매장/체인점 상호명 | 도로명, 특정 동물병원, 역명, 공원명, 우편번호 일체 |
| **웹 링크/URL** | `{URL}` | 유튜브, 구글맵, 웹사이트, 온라인 쇼핑몰 등 모든 외부 링크 | `https://...`, `http://...` 주소 일체 |
| **출입/보안** | `{CODE}` | 아파트 호출 번호(Buzzer code), 도어폰 키코드(N자리 등), 도어락 비밀번호, 키 보관함 코드 | `Buzzer: {CODE}`, `Key code: {CODE}`, `Key {CODE}` |
| **와이파이/비번** | `{WIFI}` | 가정 내 Wi-Fi 네트워크 이름(SSID) 및 접속 비밀번호 | `Wifi: {WIFI} // Password: {WIFI}` |
| **시터 이름** | `{SITTER}` | 담당 시터의 실명, 닉네임, 풀네임, 발화자명 | 텍스트 내 등장하는 시터의 본명 및 닉네임 |
| **견주 이름** | `{OWNER}` | 고객(견주)의 실명, 부부/커플명, 이니셜, 메신저 닉네임 | 고객 및 보호자의 실제 이름/호칭 |
| **반려동물** | `{PET}` | 돌봄 대상 강아지/고양이의 실제 이름 및 애칭 | 반려동물의 실제 호칭 |
| **첨부 미디어** | `[Photo]` | 메신저 사진/동영상 첨부 메타데이터 | `<attached: ...>` 등의 파일 첨부 로그 |

### 2.2 메신저 로그 및 특수 정보 정제 세부 규칙

1. **우편번호(Postal/Zip Code) 및 상세 주소(`{ADDRESS}`) 완결 마스킹:**
   * **원천 방지 규칙:** 도로명 뒤에 붙은 우편번호(알파벳+숫자 조합 코드, 5자리/9자리 우편번호 등)는 도로명과 함께 단일 `{ADDRESS}`로 통째 치환하거나, 개별로 남은 경우에도 반드시 `{ADDRESS}`로 마스킹합니다.
   * `({ADDRESS} [Postal Code])` 같은 부분 치환 버그를 금지하며, `({ADDRESS})`로 완전 치환해야 합니다.
2. **사료/물품/간식 수량 및 복합 급여/메시지 건수(`{AMOUNT}`) 체계적 마스킹:**
   * **메시지/업데이트/사진 공유 건수:** `N-N updates`, `N photos`, `N-N updates` 등 공유 건수 → `{AMOUNT} updates`
   * **배수 및 수량 배수 접두사:** `Nx` 등 수량 배수는 단독 혹은 결합형태 모두 `{AMOUNT}`로 마스킹합니다. (예: `Nx N/N kibble` → `{AMOUNT} of kibble`, `Nx N/N teaspoon` → `{AMOUNT}`)
   * **분수/소수 수치:** `N/N`, `N.N` 등 분수/소수 계량 수치 → `{AMOUNT}`
   * **계량 스푼/펌프 단위:** `teaspoon`, `tablespoon`, `tbsp`, `tsp`, `scoop`, `pump`, `drop` 등의 단위와 결합된 모든 수치(`N teaspoon`, `N pumps`, `N drops`) → `{AMOUNT}`
   * 패키지 단위: `N pack`, `Nx pack`, `N cans`, `N bottle`, `N bags` 등 → `{AMOUNT}`
   * 간식/채소 등 개별 수량: `for N [item]`, `N carrots`, `N treats` 등 → `for {AMOUNT} [item]` 또는 `{AMOUNT}`
   * 이동/경로 정류장 수: `N stops left`, `N stops away` 등 경로 잔여 수량 → `{AMOUNT} stops left`
   * 여행/예약 건수: `these N trips`, `N bookings` 등 특정 건수 → `these {AMOUNT} trips`
3. **견종/품종(`{BREED}`) 마스킹:**
   * 특정 품종명(예: 대화 내 등장하는 모든 고유 품종명)은 `{BREED}`로 치환합니다.
     * 복합 표기(예: `[Breed A] and [Breed B] breed`)는 `{BREED} and {BREED} breed` 또는 `{BREED}`로 마스킹합니다.
4. **생리 현상 및 케어 빈도(`{FREQUENCY}`) 마스킹:**
   * 식사 횟수: `all N meals` → `all {FREQUENCY} meals`, `N meals per day` → `meals {FREQUENCY}`, `**{FREQUENCY} + N meals per day` → `**{FREQUENCY} + {FREQUENCY}`
   * `Nx a day` / `N times a day` 형태:
     * `meals Nx a day` → `meals {FREQUENCY}`
     * `walks Nx a day` → `walks {FREQUENCY}`
     * `goes out N times a day`, `walk N times a day` → `{FREQUENCY}`
   * 배변/소변 빈도: `N-N pooping per day`, `Usually N-N pooping per day`, `N-N poops a day`, `pee N times a day` 등 → `{FREQUENCY}`
   * **범위형 빈도 우선 처리:** `N-N` 같은 범위형 표현을 단일 숫자보다 먼저 인식하여 치환.
5. **체류/경력 및 활동 소요 시간(`{DURATION}`) 마스킹:**
   * **산책/외출 소요 시간:** `Walks take NN to NNmin` / `Walks take NN to {TIME}` → `Walks take {DURATION}` (분 단위 범위 소요 시간은 기간/소요 시간이므로 `{DURATION}`으로 마스킹)
   * 띄어쓰기 유무와 무관한 모든 박수/일수 표기: `Nnights`, `N nights`, `N days`, `N full days` 등 → `{DURATION}`
   * 연수/경력 기간 표기: `over N years` → `over {DURATION}`, `N years already` → `{DURATION} already`, `After N years` → `After {DURATION}`
6. **시간 범위, 구두 시각 및 단독/붙여쓴 시각(`{TIME}`) 마스킹:**
   * **구두 표현 및 3~4자리 시각 범위:** `between N o'clock and NNN`, `between N o’clock and NNN` 등 정각 표현과 콜론 없는 숫자가 결합된 시간 범위는 통째로 `between {TIME}`으로 치환합니다.
   * **붙여 쓴 분 단위 표기:** `in Nminute`, `in NNminute` 등 띄어쓰기가 누락된 분 표기도 누락 없이 `in {TIME}`으로 전수 치환합니다.
   * am/pm 없는 시간 범위: `free anytime N-N`, `between NN-N`, `between N-N`, `N - NN is better` 등은 `{TIME}`(또는 `{TIME}-{TIME}`)으로 전수 치환합니다.
   * 맥락상 시각을 나타내는 단독 숫자: `closer to N`, `could we do N?`, `NN will do`, `at N!`, `around NN or NN` 등은 전수 `{TIME}`으로 치환합니다.
   * 시간대 지정: `Morning between {TIME}`, `Afternoon between {TIME}`, `Evening between {TIME}`
7. **접속사/하이픈 결합 단독 날짜(`{DATE}`) 마스킹:**
   * 선행 날짜 뒤에 병기된 단독 숫자 날짜(예: `starting {DATE} or N` → `starting {DATE} or {DATE}`, `from {DATE}-N` → `from {DATE}–{DATE}`, `{DATE} to NN` → `{DATE} to {DATE}`)는 전수 `{DATE}`로 치환합니다.
8. **치환 순서 원칙 (복합/범위 표현 및 주소 결합 우선):**
   * **주소+우편번호 결합 표현 우선 치환:** `[주소 문맥] + [우편번호]`를 묶어서 먼저 `{ADDRESS}`로 치환하여 뒤에 우편번호 찌꺼기가 남지 않도록 합니다.
   * 복합 범위 표현(`N-N pooping per day`, `free anytime N-N`, `between Nam and Nam`, `from the [Ordinal] to the [Ordinal]`, `Npm-NNNpm`)을 단일 단어보다 먼저 통째로 치환합니다.
9. **단독 서수 날짜(`{DATE}`) 전수 마스킹:**
   * 월(Month) 표기가 없이 단독으로 쓰인 서수(`[Ordinal]` 등)는 100% `{DATE}`로 치환합니다.
10. **도어폰 키 및 출입 보안(`{CODE}`) 전수 마스킹:**
    * 도어폰 키 번호(`Key NNNNNNNN` 등), Buzzer 호출 번호, 키박스 번호 등 보안 정보는 엄격히 `{CODE}`로 마스킹합니다.
11. **연속된 중복 마스킹 정리:**
    * 치환 후 발생하는 중복 태그(예: `{DATE}, {DATE}`, `{TIME}, {TIME}`, `{AMOUNT}, {AMOUNT}`, `{ADDRESS} {ADDRESS}`)는 단일 태그로 병합 정제합니다.

---

## 3. 데이터 분할 및 학습 데이터셋 구성

익명화된 데이터는 목적에 따라 다음과 같이 3개 세트로 분할하여 관리합니다:

1. **Train Set (학습용):**
   * 대다수 데이터(약 80~85%)를 대화형/알림장 생성 학습용으로 활용.
2. **Validation Set (검증용):**
   * 전체의 약 10~15%를 분할하여 생성 품질 및 과적합 검증용으로 활용.
3. **Hold-out Test Set (블라인드 평가용):**
   * 약 50건의 독립된 대화/알림장 세트를 별도로 떼어내어, 모델 개선 전/후 비교 및 블라인드 테스트용으로 사용.

* **JSONL 포맷 형식:**
  ```json
  {"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "Hi {SITTER}, can you watch {PET} for {DURATION}?"}, {"role": "assistant", "content": "Hi {OWNER}, I'd love to take care of {PET}! {DURATION} works great for me."}]}
  ```

---

## 4. 제3자 처리 및 Zero-Retention 정책 (full-process §9 결정)

Goldito는 서비스 런타임 및 데모 운영 중 사용자 프라이버시를 위해 다음과 같은 정책을 준수합니다.

1. **Nebius Token Factory Zero-Retention 정책:**
   * Nebius AI API 호출 시 전송되는 프롬프트와 생성 결과물은 모델 제공자의 서버에 저장(Retention)되거나 추가 학습 데이터로 재활용되지 않는 **Zero-Retention** 방식을 채택합니다.
2. **제3자 제공 고지:**
   * 앱의 개인정보 보호방침(`frontend/app/privacy.tsx`) 및 설정 메뉴 내에 인공지능 응답 생성(Nebius Token Factory)을 위한 데이터 전송 및 처리 사실을 투명하게 안내합니다.
3. **민감 정보 원천 차단 (D29, D31):**
   * 가격, 날짜, 시간, 출입 코드 및 도어락 비밀번호는 백엔드 서버 로직에서 엄격히 통제되며, LLM 모델 프롬프트로 직접 노출되지 않습니다.

---

## 5. 문서 작성 및 Git 커밋 시 개인정보 유출 방지 가이드 (Doc Leak Prevention)

가이드라인 문서(`*.md`), 기획서, 주석, 커밋 메시지를 작성할 때 원본 데이터의 실제 정보가 문서 자체를 통해 깃허브에 노출되는 참사를 막기 위한 표준 운영 절차(SOP)입니다.

### 5.1 "설명하려다 유출하는 함정" 원천 금지
* **문제 배경:** 에이전트나 작업자가 치환 규칙을 명확히 설명하려는 의도로 원본 텍스트에 있던 실제 예시(예: 고객이 언급한 실제 우편번호, 특정 도어락 키 번호, 실제 식단 품목, 특정 상호명, 실제 시간대)를 마크다운 문서에 그대로 인용하는 실수가 빈번하게 발생합니다.
* **철칙:** **문서에는 원본 데이터의 실제 토큰을 1글자도 직접 적지 않습니다.**

### 5.2 추상화 더미 변수(Abstract Dummy Tokens) 의무화 표준
모든 마크다운 문서 작성 시 아래 치환 규칙에 따라 100% 가공된 더미 변수만 사용해야 합니다:

| 실제 정보 유형 | 문서 내 허용 표기 (규격) | 문서 내 금지 표기 (실제 노출) |
| :--- | :--- | :--- |
| **우편번호 / 주소** | `[Postal Code]`, `[City]`, `{ADDRESS}` | 실제 캐나다/미국 우편번호 코드, 실제 도로명/호수 |
| **출입 코드 / 키** | `Key NNNNNNNN`, `{CODE}` | 대화에 나온 실제 4~8자리 숫자 키 |
| **반려동물 품종** | `[Breed A]`, `[Breed B]`, `{BREED}` | 실제 대화에 등장한 특정 고유 견종명 |
| **음식 / 간식 / 채소** | `for N [item]`, `N [food]` | 실제 대화에 나온 특정 간식/채소 고유 명칭 |
| **시간 / 소요시간** | `between N o'clock and NNN`, `in Nminute` | 실제 시각/정각 숫자 조합, 특정 도착 분 |
| **날짜 / 박수** | `{DATE} or N`, `Nnights`, `N nights` | 실제 예약 박수, 실제 날짜 숫자 |
| **수량 / 배수 단위** | `Nx N/N`, `N teaspoon`, `N pack` | 실제 계량 수치, 특정 팩 수량 |

### 5.3 커밋 전 자동 검증 (Pre-commit Verification Checklist)
가이드라인 문서나 기획 문서를 Git에 스테이징/커밋하기 전에 반드시 다음 3단계를 수행합니다:

1. **정규식 누출 스캔:**
   ```bash
   # 실제 우편번호 패턴 잔여 여부 확인
   git diff --staged | grep -E "[A-Za-z][0-9][A-Za-z]\s*[0-9][A-Za-z][0-9]"
   # 실제 고유 명칭 및 도어락 키(4자리 이상 숫자) 확인
   git diff --staged | grep -E "Key\s*[0-9]{4,}"
   ```
2. **원문 대조 금지 검증:**
   * 작성한 마크다운 문서 내 단어가 원본 메신저 텍스트 파일(`raw_*.txt`)과 3단어 이상 연속으로 일치하는지 확인. 일치할 경우 즉시 추상 토큰(`[Item]`, `N`)으로 일반화.
3. **무작위 샘플링 검증 통과 후 커밋:**
   * 작성자 본인 및 리뷰어가 문서 내 "예시" 컬럼만을 대상으로 역추적(Re-identification)이 가능한 정보가 0건임을 확인한 후에만 커밋을 승인합니다.
