# PawNote — 개발 계획 (팀 내부용)

🇺🇸 English: [README.md](README.md) · 제품 소개: [../README.ko.md](../README.ko.md) · 해커톤 규정: [../hackathon/README.ko.md](../hackathon/README.ko.md) · **P0 Todo & AI 프롬프트:** [P0-ai-prompt-playbook.ko.md](P0-ai-prompt-playbook.ko.md) · **Phase별 Goal:** [phases/README.ko.md](phases/README.ko.md) · **진행 Todo:** [TODO.md](TODO.md) · **AI 규칙:** [CLAUDE.md](../../CLAUDE.md)

마감: **2026-10-30 오전 10시 PT (미 동부 오후 1시)** · 내부 마감: **10/28**

---

## 1. 제품 원칙

모든 기능은 두 질문을 통과해야 합니다.

| 견주 | 펫시터 |
| :--- | :--- |
| "**안 물어봤는데** 알게 됐나?" | "내가 **타이핑·메시지를 하나도 안 늘렸나?**" |

펫시터가 하는 입력은 **사진 찍기, 버튼 탭**뿐. 나머지는 AI와 자동화가 처리합니다.

---

## 2. 기능 범위 & 우선순위

개발자 2명, 약 4주. 이 순서로 만들고 P2는 시간이 남으면.

| 우선순위 | 기능 | 키즈노트 대응 | AI |
| :--- | :--- | :--- | :--- |
| **P0** | 케어 피드 & 앨범 + 업로드 알림 | 앨범 | Vision(MiniCPM-V) 캡션 |
| **P0** | 투약·산책 의뢰 → 리마인더 → 인증 사진 → 견주 알림 | 투약의뢰서/보고서 | — |
| **P0** | 타이핑 없는 알림장 (그날 피드 + 완료 일정 기반) | 알림장 | Super |
| **P0** | 간식 세이프티 가드 | — (우리 차별점) | Vision(MiniCPM-V) + Ultra · Tavily 출처(8.7 stretch) |
| **P1** | 사진 요청 (견주 → 펫시터) | — | — |
| **P0** | 파트타임 보딩 시터: 날짜 × 칸 스케줄(칸별 시간·정원), 단골 시터 스케줄 보기, 여행 전체 예약 + 맡기기·찾기 시각·장소 협의, 취소 → 재예약 | — (예약 플랫폼형) | — |
| **P1** | 공지 팝업 · 즐겨찾기 시터 · 반복 근무 패턴 | 공지사항 | — |
| **P2** | AI 1차 답변 Q&A | — | Nano |

데모 기준: README의 **"PawNote의 하루"** 흐름이 처음부터 끝까지 동작해야 합니다.

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
| **1. 세팅** | 10/1 – 10/4 | 디자인 시스템 + 핵심 화면: 피드, 일정 목록, 알림장, 스캐너 | **데이터 익명화**, 캡션·알림장 프롬프트 | Expo Web, Supabase 스키마, FastAPI 뼈대, Cloudinary 업로드 |
| **2. P0 코어** | 10/5 – 10/11 | 피드/앨범, 일정 체크, 경고 모달 | 안전 파이프라인(Vision → Ultra, JSON), 하루 데이터 기반 알림장 | 피드 + 알림, 투약·산책 일정 + 리마인더 |
| **3. P1 + 폴리싱** | 10/12 – 10/18 | 공지 팝업, 일정표, 마이크로 인터랙션 | 실제 사진·포장지로 프롬프트 튜닝 (Tavily는 8.7로 앞당김) | 사진 요청, 공지·일정, 데모 배포 |
| **4. 데모 & 문서** | 10/19 – 10/25 | 영상 비주얼, 썸네일 | Q&A(P2), 피드백 정리 | README 실행 가이드, 테스트 계정, Devpost 초안 |
| **5. 제출** | 10/26 – 10/30 | 최종 폴리싱 | 최종 피드백 | 버그 수정 · **내부 마감 10/28** · 10/29–10/30 최종 Submit (마감 10/30 10:00 AM PT) |

---

## 5. 해커톤 전략

| 심사 기준 (동일 비중) | 전략 | 담당 |
| :--- | :--- | :--- |
| **기술 구현** | 작업별 Nemotron 4개 모델 분리, JSON 검증, 스케줄 작업, 실제 배포 | 슬기, 민식 |
| **디자인** | 견주·펫시터 양쪽의 완성된 흐름, 키즈노트급 완성도 | 묵 |
| **잠재적 임팩트** | 3년 현장 경험 기반 실제 문제 + 숫자 (줄어든 메시지 수, 알림장 작성 시간 절감) | 전원 |
| **아이디어 품질** | 타이핑 없는 케어 루프, 숨은 알레르기 추론, 실제 데이터 기반 말투 복제 | 슬기 |

**절대 지킬 것**
- 모든 AI 호출은 Token Factory — 추론·알림장은 Nemotron, 비전(캡션·성분표)은 MiniCPM-V ([model-ids.md](phases/notes/model-ids.md))
- 실제 고객 데이터는 프롬프트·리포·영상에 쓰기 전 익명화
- 데모는 **12/15까지** 무료 접속 유지, 견주·펫시터 테스트 계정 제공
- 영상 3분 미만, YouTube 공개, 영어 음성으로 Nemotron + Token Factory 설명, 저작권 음악 금지

**노려볼 상:** Best Apps and Agents 트랙 또는 종합상 · Best Use of Tavily · 최우수 피드백 · 토론토 도시상 (9/29 Builders & Brews Toronto 참석)

---

## 6. AI 모델 (2026-09-28 웹에서 확인)

출처: [Token Factory 모델 카탈로그](https://tokenfactory.nebius.com/model-catalog.md), [Nebius cookbook](https://github.com/nebius/token-factory-cookbook/tree/main/models/nemotron)

| 모델 ID | 입력 | 리전 / 엔드포인트 | 가격 (입력/출력, 100만 토큰당) | 용도 |
| :--- | :--- | :--- | :--- | :--- |
| `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | 텍스트 | eu-north1 · `https://api.tokenfactory.nebius.com/v1/` | $0.06 / $0.24 | Q&A, 빠른 호출 |
| `nvidia/nemotron-3-super-120b-a12b` | 텍스트 | us-central1 · `https://api.tokenfactory.us-central1.nebius.com/v1/` | $0.30 / $0.90 | 알림장 |
| `nvidia/Nemotron-3-Ultra-550b-a55b` | 텍스트 | us-central1 | $1.00 / $3.00 | 안전 추론 |
| `nvidia/Nemotron-3_5-Lightning` | 텍스트 | eu-north1 | $0.06 / $0.24 | 빠른 모델 대안 (100만 토큰 컨텍스트) |
| `openbmb/MiniCPM-V-4_5` | 이미지+텍스트 | us-central1 | 카탈로그 참고 | 캡션, 성분표 읽기 |

**주의**
- **Nano Omni(`nvidia/nemotron-3-nano-omni`)는 카탈로그에 없어**(2026-09-29 `GET /v1/models` 확인) 비전은 **MiniCPM-V-4_5**를 씁니다. 규정은 "NVIDIA 모델 최소 1개"이고, 추론·알림장은 Nemotron(Ultra·Super)이 맡습니다. 역할별 ID 정본: [model-ids.md](phases/notes/model-ids.md).
- **모델마다 리전이 달라서** 백엔드에서 모델별 base URL을 관리해야 합니다.
- 모델 ID는 **대소문자를 구분**하고 모델마다 표기가 제각각이니 그대로 복사하세요.
- 데모·AI 출력은 **영어 전용** (D1).

---

## 7. 프롬프트 스펙 (슬기)

### A. 사진 캡션 (Vision: MiniCPM-V)
- 입력: 사진 + 반려동물 이름·종
- 출력: 표정과 활동을 묘사하는 따뜻한 1–2문장. 의학적 판단 금지

### B. 알림장 (Super)
- **입력:** 그날의 피드 캡션, 완료한 일정(산책 시간, 투약), 펫시터의 선택적 짧은 메모
- **역할:** 경력 3년의 따뜻하고 꼼꼼한 펫시터
- **Few-shot:** 실제 최고 만족도 일지 3편 (**익명화**)
- **원칙:**
  1. 기계적 보고 금지 — ❌ "Completed a 40-minute walk." → ⭕ "Bori wagged her tail the whole way on our 40-minute walk in the sunshine! 🐶💛" (출력은 영어, D1)
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
  "warning_message": "보리의 등록 알레르기 성분인 '닭고기'가 검출되었습니다. 급여하지 마세요."
}
```

### D. Q&A 1차 답변 (Nano)
- 강아지 프로필과 오늘 기록만 근거로 답변. 확실하지 않으면 "곧 펫시터가 답변드릴게요"라고 하고 펫시터에게 알림

---

## 8. 데이터 익명화 (슬기 담당)

실무 few-shot 원본은 **영어**입니다. 3년치 데이터에는 견주 PII가 들어 있으므로, 프롬프트·리포·영상에 쓰기 **전에** 익명화(이름·연락처·실견명 등)만 하면 됩니다. 언어 번역은 하지 않습니다.

- 제거·치환: 견주 이름, 전화번호, 주소, 이메일, SNS 계정, 정확한 위치, 강아지 실명 (→ "보리"처럼 일관된 가명)
- 데모용 사진 속 사람 얼굴 제거
- **말투**(호칭, 이모지, 문장 스타일)는 유지 — 그게 핵심 가치
- 원본 데이터는 **리포에 올리지 않기** (`data/raw/`를 `.gitignore`에), 익명화된 Few-shot 샘플만 커밋
- (선택) 익명화 배치를 **Nebius Serverless Jobs**로 실행 → Nebius 서비스 활용 포인트 추가

---

## 9. 데이터 모델 (요약)

> **정본은 [phases/phase-02.md](phases/phase-02.md)** (P0 17개 테이블 · RLS · RPC)와 [phase-11.md](phases/phase-11.md) (P1). 아래는 한눈에 보기용 목록이며 컬럼·제약은 적지 않습니다 — 스키마를 바꿀 때는 phase-02를 먼저 고칩니다.

| 영역 | 테이블 |
| :--- | :--- |
| 사람 | `profiles` (role owner·sitter) · `owner_profiles` · `sitter_profiles` |
| 반려동물 | `pets` (dog·cat) · `pet_allergies` |
| 스케줄·예약 | `sitter_availability` · `bookings` · `booking_pets` (맡긴 구간, 겹침 금지) · `booking_slots` (정원) · `booking_handoffs` (맡기기·찾기 시각·장소) |
| 케어 | `care_tasks` (medication·walk·feeding·litter·play·sleep) · `task_logs` · `media` · `feed_posts` · `daily_reports` · `safety_checks` |
| 알림 | `notifications` |
| P1 (Phase 11) | `photo_requests` · `notices` · `notice_reads` · `owner_favorite_sitters` · `messages` (P2) |

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
- **압축:** `f_auto,q_auto`로 전송 (WebP/AVIF 등 포맷 자동, 화질 자동)
- **썸네일:** 피드 그리드용 `c_fill,w_400,h_400`, 영상 썸네일은 `so_0` + `.jpg`
- **영상:** 업로드 시 길이·용량 제한, 웹 재생용 변환은 Cloudinary가 처리
- **보안:** 강아지별 폴더 분리, API secret은 클라이언트에 노출 금지

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
- [ ] Few-shot 샘플 **규모**(3편 확정, 추가 여부)
- [x] Nano Omni 사용 가능 여부 — 카탈로그에 없음, 비전은 MiniCPM-V-4_5 (2026-09-29)
