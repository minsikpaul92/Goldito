# Pawddy — 개발 계획 (팀 내부용)

🇺🇸 English: [README.md](README.md) · 제품 소개: [../README.ko.md](../README.ko.md) · 해커톤 규정: [../hackathon/README.ko.md](../hackathon/README.ko.md) · **P0 Todo & AI 프롬프트:** [P0-ai-prompt-playbook.ko.md](P0-ai-prompt-playbook.ko.md) · **Phase별 Goal:** [phases/README.ko.md](phases/README.ko.md) · **진행 Todo:** [TODO.md](TODO.md) · **AI 규칙:** [CLAUDE.md](../../CLAUDE.md)

마감: **2026-10-30 오전 10시 PT (미 동부 오후 1시)** · 내부 마감: **10/28**

---

## 1. 제품 원칙

모든 기능은 두 질문을 통과해야 합니다.

| 견주 | 펫시터 |
| :--- | :--- |
| "**안 물어봤는데** 알게 됐나?" | "내가 **타이핑·메시지를 하나도 안 늘렸나?**" |

펫시터가 하는 입력은 **사진 찍기, AI가 제안한 칩 고르기**가 기본이고, 알림장에 짧은 메모를 적는 것은 선택입니다 (D38 — 글쓰기 거의 제로). 나머지는 AI와 자동화가 처리합니다.

**제품 흐름 (정본):** [full-process.ko.md](full-process.ko.md) — 5단계 **문의 → 사전 미팅 → 예약 확정 → 돌봄 & 이동 → 완료** (architecture D27–D46). Rover 예약 × 키즈노트 케어 × Uber 이동, 타이핑은 AI 에이전트가.

---

## 2. 기능 범위 & 우선순위

개발자 2명, 약 4주. 5단계 순서로 만들고 P1·P2는 시간이 남으면.

| 우선순위 | 단계 | 기능 | 참고 | AI | Phase |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P0** | ① 문의 | 견주 문의(서비스 방식·날짜·반려동물·질문) → AI가 몇 초 안에 시터 말투로 답장 초안(시터 승인 후 발송, 옵션으로 자동 발송) — 캘린더·서버 견적(공휴일·다두 할증)·시터 정책·Life Record(RAG) 근거 | Rover 빠른 응답 | Nano + Qwen3 Embedding | 07B (견적 03C) |
| **P0** | ② 사전 미팅 | 케어·투약 의뢰서 → AI 미션 체크리스트 + 주의사항 · 첫 만남 Meet & Greet(대면 장소 / Google Meet / 건너뛰기 동의 — 거부 시 예약 취소) · 이동 방식(Owner drives / Sitter drives) | 키즈노트 투약의뢰서 | Super | 06, 03B |
| **P0** | ③ 예약 | 파트타임 시터: 날짜 × 칸 스케줄(칸별 시간·정원), 단골 시터 스케줄, 여행 전체 예약 + 맡기기·찾기 시각·장소 협의, 보딩 / 하우스 시팅, 취소 → 재예약 | 예약 플랫폼 | — | 03B |
| **P0** | ③ 예약 | 견적 → 캐나다형 동의서 템플릿 → **데모 결제** → 결제 후 시터 집 정보 · 견주 집 출입 정보는 2시간 전 해제 | — | — (규칙) | 03C |
| **P0** | ④ 돌봄 & 이동 | Uber식 이동: 실시간 위치·ETA, 도착 카드(방문자 주차 / Buzzer·Lockbox), 인계 사진 확인(반려동물·크레이트·안전벨트) | Uber · 키즈노트 등하원 | Vision(MiniCPM-V) | 06B |
| **P0** | ④ 돌봄 & 이동 | 5초 체크(AI 칩 제안 → 고르기, 짧은 메모는 선택, 사진 ≤ 2) + 스케줄 task → 즉시 견주 알림 + Activity | 키즈노트 투약 보고 | — | 06 |
| **P0** | ④ 돌봄 & 이동 | 고른 칩 + 짧은 메모(선택) + 하루 데이터 → 시터 말투 알림장 → 시터 승인 후 게시 (글쓰기 거의 제로) | 알림장 | Vision → Super | 07 |
| **P0** | ④ 돌봄 & 이동 | 케어 피드 + 날짜·분류별 타임라인 앨범 (식사·산책·낮잠·놀이) | 앨범 | Vision 캡션 + 분류 | 05, 09 |
| **P0** | ⑤ 완료 | 귀가 리포트 + ★ 5점 리뷰 + Pet Life Record → RAG → 다음 예약에서 재사용 | 키즈노트 생활기록 | Super + Qwen3 Embedding | 07C |
| **P0 stretch** | ④ (추가) | 간식 세이프티 가드 — 시나리오 코어 뒤 (D27) | — (우리 차별점) | Vision(MiniCPM-V) + Ultra · Tavily 출처(8.7) | 08 |
| **P1** | — | 사진 요청 (견주 → 펫시터) | — | — | 11.1 |
| **P1** | — | 공지 팝업 · 즐겨찾기 시터 · 반복 근무 패턴 | 공지사항 | — | 11 |

구 P2 "AI 1차 답변 Q&A"는 Stage 1 문의 AI(07B, P0)로 흡수되었습니다.

데모 기준: README의 **5단계 흐름**(*How Pawddy Works* → *A Stay with Pawddy*)이 처음부터 끝까지 동작해야 합니다.

해커톤 이후 (우선순위 마지막): **시터 전용 데스크톱 웹** — 스케줄 작성·알림장 작업을 컴퓨터에서 빠르게 (사이드바 레이아웃). 견주는 계속 폰 화면. 전체 로드맵은 [README.md](README.md#post-hackathon-roadmap-not-built-for-the-hackathon), 설계 대비는 architecture D25.

---

## 3. 역할

| 이름 | 역할 | 할 일 |
| :--- | :--- | :--- |
| **민식** | 풀스택 리드 | Expo 앱, FastAPI, Supabase 스키마/인증/실시간, Cloudinary 업로드, 알림·스케줄러, 배포, **Devpost 대표 제출자** |
| **슬기** | AI & 프롬프트 | **데이터 익명화**, Few-shot 프롬프트, Token Factory Nemotron 파이프라인, 캡션/알림장/안전 프롬프트, JSON 검증, Tavily 연동 |
| **묵** | 프로덕트 & UX/UI | 피그마 디자인 시스템(Auto Layout, 토큰), 견주·펫시터 화면 흐름, 피드/앨범, 경고 모달, 공지 팝업, 데모 영상 비주얼 |

- **묵 님께:** 컴포넌트를 Auto Layout과 토큰 기반으로 잡아주시면 Figma MCP 코드 변환 품질이 올라갑니다. **디자인은 심사 기준의 1/4**이에요. 키즈노트 수준의 완성도를 목표로 해주세요.
- **슬기 님께:** 모델 ID 확인은 끝났습니다([model-ids.md](phases/notes/model-ids.md)). 다음은 데이터 익명화와 7.1 Nebius 클라이언트(호출 지표 로그 포함)입니다.

---

## 4. 일정

| 주차 | 기간 | 묵 | 슬기 | 민식 |
| :--- | :--- | :--- | :--- | :--- |
| **0. 킥오프** | 9/28 – 9/30 | Devpost 팀 합류, 무드보드 | 크레딧 받기, `GET /v1/models`로 모델 ID 확인, 첫 호출 | 리포 뼈대, Supabase·Cloudinary 계정 |
| **1. 세팅** | 10/1 – 10/4 | 디자인 시스템 + 시나리오 화면: 문의 스레드, Checkout, Trip, 5초 체크 | **데이터 익명화**, 7.1 Nebius 클라이언트 + `embed()` | Phase 01–03 ✅, 03B 예약 |
| **2. 단계 ①–③** | 10/5 – 10/11 | 예약·Checkout·Meet & Greet·케어 의뢰서 화면 | 07B 문의 AI + RAG 백엔드, 6.12 care-plan | 03B(+3B.11 Google Meet), 03C, 04, 05 |
| **3. 단계 ④** | 10/12 – 10/18 | Trip 화면·지도, 앨범, 마이크로 인터랙션 | 7.2 알림장 · 7.7 칩 제안, 9.1 캡션·분류 | 06, 07, 배포 리허설(10/18) |
| **4. 단계 ⑤ + 이동 + 데모** | 10/19 – 10/25 | 영상 비주얼, 썸네일, Life Record 화면 | 7C.4 Life Record, 6B.5 인계 사진 체크(마지막 — D41), 프롬프트 튜닝, 피드백 정리 · (stretch) 08 세이프티 | 07B UI, 09, 07C, **06B**(P0 맨 마지막 — D41, 10/27까지), (stretch 08), README, 테스트 계정, Devpost 초안 |
| **5. 제출** | 10/26 – 10/30 | 최종 폴리싱 | 최종 피드백 | 버그 수정 · **내부 마감 10/28** · 10/29–10/30 최종 Submit (마감 10/30 10:00 AM PT) |

---

## 5. 해커톤 전략

| 심사 기준 (동일 비중) | 전략 | 담당 |
| :--- | :--- | :--- |
| **기술 구현** | 작업별 Nemotron 분리(Nano 답장·Super 글쓰기·Ultra 안전), Token Factory 임베딩 + pgvector RAG, 서버 근거 고정(숫자), JSON 검증, Realtime 이동, 실제 배포 | 슬기, 민식 |
| **디자인** | 견주·펫시터가 함께 지나가는 5단계 한 흐름 (Rover × 키즈노트 × Uber), 키즈노트급 완성도 | 묵 |
| **잠재적 임팩트** | 3년 현장 경험 기반 실제 문제 + 숫자 (답장 몇 초, 줄어든 메시지 수, 알림장 작성 시간 절감) | 전원 |
| **아이디어 품질** | 시터 대신 답하고·정리하고·확인하고·쓰는 에이전트(트리거 → 행동 → 사람 승인, D46), 시간 맞춰 열리는 출입 정보, 다음 시터에게 이어지는 Life Record | 슬기 |

**절대 지킬 것**
- 모든 AI 호출은 Token Factory — 답장·추론·알림장은 Nemotron, 비전(인계 사진·캡션·성분표)은 MiniCPM-V, RAG 임베딩은 Qwen3 Embedding ([model-ids.md](phases/notes/model-ids.md))
- 실제 고객 데이터는 프롬프트·리포·영상에 쓰기 전 익명화
- 데모는 **12/15까지** 무료 접속 유지, 견주·펫시터 테스트 계정 제공
- 심사위원은 PC로 봄: 데스크톱에서는 **402 × 874 폰 프레임** 안에서 앱이 돌고, 마우스만으로 모든 동작 + 샘플 사진 내장 (architecture D25, [DESIGN.md §7.7](../../DESIGN.md#77-works-with-a-mouse))
- 영상 3분 미만, YouTube 공개, 영어 음성으로 Nemotron + Token Factory 설명, 저작권 음악 금지

**노려볼 상:** Best Apps and Agents 트랙 또는 종합상 · Best Use of Tavily · 최우수 피드백 · 토론토 도시상 (9/29 Builders & Brews Toronto 참석)

---

## 6. AI 모델 (2026-09-28 웹에서 확인)

출처: [Token Factory 모델 카탈로그](https://tokenfactory.nebius.com/model-catalog.md), [Nebius cookbook](https://github.com/nebius/token-factory-cookbook/tree/main/models/nemotron)

| 모델 ID | 입력 | 리전 / 엔드포인트 | 가격 (입력/출력, 100만 토큰당) | 용도 |
| :--- | :--- | :--- | :--- | :--- |
| `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | 텍스트 | eu-north1 · `https://api.tokenfactory.nebius.com/v1/` | $0.06 / $0.24 | 문의 자동 답장, 빠른 호출 |
| `nvidia/nemotron-3-super-120b-a12b` | 텍스트 | us-central1 · `https://api.tokenfactory.us-central1.nebius.com/v1/` | $0.30 / $0.90 | 케어 체크리스트, 알림장, Life Record |
| `nvidia/Nemotron-3-Ultra-550b-a55b` | 텍스트 | us-central1 | $1.00 / $3.00 | 안전 추론 |
| `nvidia/Nemotron-3_5-Lightning` | 텍스트 | eu-north1 | $0.06 / $0.24 | 빠른 모델 대안 (100만 토큰 컨텍스트) |
| `openbmb/MiniCPM-V-4_5` | 이미지+텍스트 | us-central1 | 카탈로그 참고 | 인계 사진 체크, 캡션·분류, 알림장 사진, 성분표 읽기 |
| `Qwen/Qwen3-Embedding-8B` | 텍스트 → 임베딩 | 두 리전 | 카탈로그 참고 | RAG (`dimensions: 1024`, 2026-10-01 확인) |

**주의**
- **NVIDIA 비전 모델**(`Nemotron-Nano-V2-12b`·`Cosmos3-Super-Reasoner`·`Nemotron-3-Nano-Omni`)은 **Dedicated Endpoint 전용**이라 우리 키의 공용 API에 없고, 상시로 켜 두면 하루 $48~113 (2026-10-02 확인, D39) → 비전은 **MiniCPM-V-4_5** 확정. 시나리오의 **Qwen-2.5-VL**은 카탈로그에 없음(2026-10-01). 다른 이미지 입력 후보(`moonshotai/Kimi-K2.6` 등)는 model-ids.md에. 규정은 "NVIDIA 모델 최소 1개" — 답장은 Nano, 체크리스트·알림장·Life Record는 Super, 세이프티(stretch)는 Ultra. 역할별 ID 정본: [model-ids.md](phases/notes/model-ids.md).
- **모델마다 리전이 달라서** 백엔드에서 모델별 base URL을 관리해야 합니다.
- 모델 ID는 **대소문자를 구분**하고 모델마다 표기가 제각각이니 그대로 복사하세요.
- 데모·AI 출력은 **영어 전용** (D1).

---

## 7. 프롬프트 스펙 (슬기)

### A. 사진 캡션 (Vision: MiniCPM-V)
- 입력: 사진 + 반려동물 이름·종
- 출력: 표정과 활동을 묘사하는 따뜻한 1–2문장. 의학적 판단 금지

### B. 알림장 (Super)
- **입력:** AI가 하루 기록·사진에서 제안하고 시터가 고른 칩, 시터의 짧은 메모(선택), 사진 ≤ 2장의 Vision 묘사, 그날의 피드 캡션·완료한 일정·check-in (D38)
- **역할:** 시터 본인 — 1인칭, 그 시터의 말투 (D35 말투 레이어: 스타일 카드 + 같은 시터의 과거 글 top-k)
- **Few-shot:** 같은 시터의 `tone_samples` top-k — 없을 때만 실제 최고 만족도 일지 3편 (**익명화**)
- **원칙:**
  1. 기계적 보고 금지 — ❌ "Completed a 40-minute walk." → ⭕ "Max wagged her tail the whole way on our 40-minute walk in the sunshine! 🐶💛" (출력은 영어, D1)
  2. 대변 상태, 식사·물 섭취를 자연스럽게
  3. 사진 속 표정/행동 묘사
  4. 입력에 없는 일을 지어내지 말 것

### C. 간식 안전 (Vision → Ultra → Tavily 8.7)
- Vision(MiniCPM-V)이 성분표 사진에서 성분 목록 추출
- Ultra가 알레르기 + 종별 독성과 대조, 숨은 성분까지 추론. WARNING·모르는 성분이면 Tavily 검색(8.7 stretch, [tavily.ko.md](tavily.ko.md)) → Ultra 재판단
- 출력: 아래 JSON (서버에서 검증)

```json
{
  "safety_status": "DANGER | WARNING | SAFE",
  "matched_allergens": ["닭고기", "밀"],
  "detected_ingredients": ["가수분해 닭고기분말", "소맥분", "글리세린"],
  "unknown_ingredients": [],
  "warning_message": "맥스의 등록 알레르기 성분인 '닭고기'가 검출되었습니다. 급여하지 마세요."
}
```

### D. 문의 자동 답장 (Nano + RAG) — Stage 1, Phase 07B
- 입력: 서버가 모은 JSON뿐 — 시터 가능 여부, `quote_booking` 결과, 반려동물 프로필, 시터 공개 프로필, RAG 상위 5개(시터 정책·Life Record·지난 문의·케어 의뢰서)
- 출력 JSON `{reply, can_host, needs_sitter, used_sources}`. 가격은 계산하지 않고 견적을 그대로 사용, 다른 견주·주소·출입 코드 언급 금지. 불확실하면 "Chloe will confirm" + `needs_sitter`
- 시터 1인칭 말투 초안(D35) → 시터가 **Send** / Edit / Regenerate로 승인(D36). 자동 발송은 시터가 켜는 옵션 + 사람 속도(D37)

### E. 케어 플랜 (Super) — Stage 2, Phase 06
- 견주 자유 텍스트 케어·투약 의뢰서 → `{tasks:[{type, time, title, dose, notes}], cautions:[], skipped:[]}`. 종 규칙은 서버가 강제(고양이 산책 없음). 초안만 — 견주가 확인 후 저장

### F. 인계 사진 체크 (Vision) — Stage 4, Phase 06B
- 맡기기·찾기 사진 → `{pet_visible, species_match, crate_visible, restraint_visible, concerns}` → ok / warning은 서버가 판정. 관찰만, 의학적 판단 금지

### G. Pet Life Record (Super) — Stage 5, Phase 07C
- 이번 돌봄의 check-in·task·알림장·인계 체크·시터 메모 → `{eats, meds, potty, behavior, heads_up, sitter_tips, changed_since_last}` — 근거 없으면 null. 다음 예약을 위해 RAG에 인덱싱

---

## 8. 데이터 익명화 (슬기 담당)

실무 few-shot 원본은 **영어**입니다. 3년치 데이터에는 견주 PII가 들어 있으므로, 프롬프트·리포·영상에 쓰기 **전에** 익명화(이름·연락처·실견명 등)만 하면 됩니다. 언어 번역은 하지 않습니다.

- 제거·치환: 견주 이름, 전화번호, 주소, 이메일, SNS 계정, 정확한 위치, 강아지 실명 (→ "맥스"처럼 일관된 가명)
- 데모용 사진 속 사람 얼굴 제거
- **말투**(호칭, 이모지, 문장 스타일)는 유지 — 그게 핵심 가치
- 원본 데이터는 **리포에 올리지 않기** (`data/raw/`를 `.gitignore`에), 익명화된 Few-shot 샘플만 커밋
- (선택) 익명화 배치를 **Nebius Serverless Jobs**로 실행 → Nebius 서비스 활용 포인트 추가

---

## 9. 데이터 모델 (요약)

> **정본은 [phases/phase-02.md](phases/phase-02.md)** (P0 17개 테이블 · RLS · RPC), 시나리오 테이블은 각 phase migration (03B–07C), P1은 [phase-11.md](phases/phase-11.md). 아래는 한눈에 보기용 목록이며 컬럼·제약은 적지 않습니다 — 스키마를 바꿀 때는 phase-02를 먼저 고칩니다.

| 영역 | 테이블 |
| :--- | :--- |
| 사람 | `profiles` (role owner·sitter) · `owner_profiles` · `sitter_profiles` |
| 반려동물 | `pets` (dog·cat) · `pet_allergies` |
| 스케줄·예약 | `sitter_availability` · `bookings` · `booking_pets` (맡긴 구간, 겹침 금지) · `booking_slots` (정원) · `booking_handoffs` (맡기기·찾기 시각·장소) |
| 케어 | `care_tasks` (medication·walk·feeding·litter·play·sleep) · `task_logs` · `media` · `feed_posts` · `daily_reports` · `safety_checks` |
| 시나리오 (D27–D46) | `sitter_rates` · `holidays` · `booking_consents` · `owner_home_access` · `access_reveals` (03C) · `care_checkins` · `care_requests` · `pet_cautions` (06) · `trips` · `handoff_checks` (06B) · `inquiries` · `inquiry_messages` · `knowledge_chunks` (pgvector) · `tone_samples` (07B, D35) · `reviews` · `pet_life_records` (07C) |
| 알림 | `notifications` |
| P1 (Phase 11) | `photo_requests` · `notices` · `notice_reads` · `owner_favorite_sitters` |

---

## 10. 알림

알림 종류·수신자·생성 위치는 **[architecture §7 알림 매트릭스](phases/architecture.ko.md#7-알림-매트릭스-p0)**가 정본입니다.

- **웹 데모:** Supabase Realtime → 인앱 알림 센터 + 토스트
- **모바일 (해커톤 이후):** Expo Notifications (푸시)
- **예약 리마인더:** (stretch 6.7) Nebius Serverless Jobs 또는 APScheduler
- 시터 스케줄 변경은 알림을 만들지 않음 (D24)

---

## 11. Cloudinary 가이드

이유: Supabase 무료 저장 공간은 사진·영상을 담기에 부족합니다. Cloudinary 무료 플랜은 크레딧 기반 저장·전송량과 자동 압축을 제공합니다. (현재 무료 한도는 [cloudinary.com/pricing](https://cloudinary.com/pricing)에서 확인)

- **업로드:** 클라이언트가 FastAPI에서 **서명(signed upload)**을 받아 Cloudinary로 직접 업로드 → 백엔드는 `public_id`만 Supabase에 저장
- **사진 정규화 (전부):** 클라 긴 변 ~2000px(+ 필요 시 &lt;10 MB까지) → 업로드 **incoming** (`c_limit,w_2000`, `q_auto`) → 전송 시 `f_auto,q_auto` — Free 플랜 이미지 업로드 한도 **10 MB**
- **영상:** 최대 **30초** (더 짧아도 OK). 그보다 길면 **트림 UI**로 ≤30초 구간 선택 → 클라 압축(≈720p) 후 업로드. Free 영상 한도 **100 MB**
- **썸네일:** 피드 그리드용 `c_fill,w_400,h_400`, 영상 썸네일은 `so_0` + `.jpg`
- **보안:** 강아지별 폴더 분리, API secret은 클라이언트에 노출 금지
- **상세:** [phases/phase-04.md](phases/phase-04.md) § Media normalize policy

---

## 11.5 Nebius 모델 매핑

기능별 어떤 Token Factory 모델을 쓰는지: **[phases/notes/model-ids.md](phases/notes/model-ids.md)** (Vision = MiniCPM-V-4_5, Safety = Ultra, Report = Super, smoke = Nano).

---

## 12. Tavily

상세: **[tavily.ko.md](tavily.ko.md)** (정본 — 무엇인지, 키워드 검색 규칙·신뢰 도메인·리콜, $3k 보너스, `TAVILY_API_KEY` 위치). 세이프티 **Phase 08.7 (stretch)**, 못 하면 11.3.

---

## 12.1 제품 온보딩 (심사·데모)

상세: **[onboarding.ko.md](onboarding.ko.md)** (Welcome · Try demo Owner/Sitter · Phase 03/10 · 묵 handoff).

---

## 13. Nebius & NVIDIA 피드백 로그

Devpost 제출 필수 항목이자 최우수 피드백 상 대상. 개발하면서 바로바로 적기 — 도구 이름을 명시해서 구체적으로. (제출은 영어라 영문 문서의 표에 기록)

---

## 14. 결정 필요

- [x] 데모 언어: **영어 전용** (UI + AI 출력) — 2026-09-29 확정 ([architecture D1](phases/architecture.ko.md#1-결정-로그-확정))
- [x] 백엔드 API: **Nebius AI Cloud Serverless Endpoint** (정식), Render는 긴급 fallback만 — 2026-09-29 (D18)
- [x] Builders & Brews Toronto 참석 — Token Factory $100, AI Cloud $100, Tavily 8k credits
- [x] Few-shot 원본 언어: **영어** (익명화만) — 2026-09-29 ([D1](phases/architecture.ko.md#1-결정-로그-확정))
- [x] Few-shot 샘플 규모 → D35 말투 레이어로 대체: 같은 시터의 `tone_samples` top-k, 없을 때만 기본 3편 (2026-10-02)
- [x] Nano Omni 사용 가능 여부 — 공용 API에 없음(2026-09-29). NVIDIA 비전 모델 3종 모두 Dedicated Endpoint 전용으로 확인(2026-10-02, D39) → 비전은 MiniCPM-V-4_5 확정
- [x] 제품 흐름: 팀 Full Process 시나리오 우선 (5단계) — 2026-10-01 (D27, [full-process.ko.md](full-process.ko.md))
- [x] 결제는 데모만(카드 정보 없음), 동의서는 고정 영문 템플릿("not legal advice") — 2026-10-01 (D30)
- [x] 간식 세이프티 가드: 시나리오 코어 뒤 P0 stretch — 2026-10-01 (D27)
- [x] 시나리오 Vision 모델 Qwen-2.5-VL → 카탈로그에 없음 → MiniCPM-V-4.5 확정 (D39, 2026-10-02). 인계 사진 품질이 부족할 때만 6B.5 spike에서 Kimi-K2.6 비교
- [x] 시터 말투 레이어 · 수동 승인 기본 · 자동 발송은 옵션(사람 속도) · 시터 글쓰기 거의 제로 — 2026-10-02 (D35–D38, D38은 같은 날 개정)
- [x] 확정 후 변경은 상대 승인 · 위치 공유 동의 화면 · 06B는 P0 맨 마지막 — 2026-10-02 (D40–D41)
- [x] Fun mood meter는 P1 · SFT는 보여주기용 · RFT는 신청 안 함 — 2026-10-02 (D42–D43)
- [x] 자동 발송은 대기 없이 바로 사람 속도 · 읽음은 실제로 열었을 때만 · 06B는 07C 다음(08은 그 뒤 시간이 남을 때) · 에이전트는 README·영상 설명으로(tool calling은 7B.11 선택) — 2026-10-02 (D36·D37·D41·D46)
- [x] Meet & Greet는 첫 만남만(요청 뒤 · 수락 전, 건너뛰기 거부 시 예약 취소) · 영상은 Google Meet · 알림장은 칩 제안 + 짧은 메모(거의 제로) — 2026-10-02 (D44·D45·D38)
- [ ] 남은 질문: [full-process §9](full-process.ko.md#9-열린-질문--tbd-2026-10-02) — 지연 공식(슬기), 위치 동의 거부 대안, Google 계정·OAuth 준비, Meet 참여 방식
