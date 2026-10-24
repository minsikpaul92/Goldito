# Goldito 기능 현황 · 테스트 가이드

> **누구를 위한 문서?** 개발에 같이 참여하는 사람(민식 · 슬기 · 묵)과 테스트하는 사람.
> **무엇을 알 수 있나?** ① 지금 무엇이 만들어졌고 무엇이 아직인지 ② 어떻게 확인하는지 ③ 확인 결과.
> **언제 갱신하나?** 작업(Task) 하나가 끝날 때마다 **같은 커밋에서** 현황표와 시나리오를 고친다 ([CLAUDE.md](../../CLAUDE.md) §5).
> 제품 흐름은 [full-process.ko.md](full-process.ko.md), 할 일 큐는 [GitHub issues](https://github.com/minsikpaul92/Goldito/issues).

**마지막 갱신:** 2026-10-09 · #60 머지(FLOW-13~23 · REPORT-11~12 · RV-6~10 수정) · 테스트는 **main = Vercel** (§1.1) · 슬기 QA 트랙 [Phase Q](phases/phase-q-quality.md) · 이전: 첫 수동 테스트 결과 (§3.0), 코드 리뷰 시나리오 (§3.17)

---

## 1. 시작하기

### 1.1 접속 — 테스트는 항상 main을 Vercel에서 (2026-10-09 결정)

| 환경 | 주소 | 비고 |
| :--- | :--- | :--- |
| **Production (main) — 손 테스트는 여기** | **https://goldito-petcare.vercel.app** | main이 머지될 때마다 자동 배포. 결과(✅)는 여기서 한 것만 기록 |
| Vercel preview (선택) | PR 코멘트의 Preview 링크 | 머지 전 미리 보기용 — 결과 기록은 main 기준 |
| 로컬 (개발할 때만) | `http://localhost:8081` + 백엔드 `http://localhost:8000` | `cd frontend && npx expo start --web --port 8081`, `cd backend && .venv/bin/uvicorn app.main:app --port 8000` |

> **백엔드 (U0, 2026-10-09):** Vercel 빌드는 Render의 **https://goldito-backend.onrender.com** 을 본다 → 업로드 · AI · 데모 리셋(Profile → Demo tools)이 Vercel에서 된다. 무료 플랜이라 **15분 동안 요청이 없으면 잠들고 첫 요청이 30~50초** 걸린다(keep-alive cron이 깨워 둠). PR **Preview는 CORS에 없어** 업로드 · AI가 안 된다 — 결과는 main(Production)에서.
> 어느 환경이든 **호스티드 Supabase(실제 DB)** 에 붙는다. 테스트가 실제 데이터를 만든다는 뜻이다 (1.4 참고).

### 1.2 데모 계정

로그인 화면의 **Try the demo** → **Demo owner** / **Demo sitter** 버튼 (비밀번호 입력 불필요).

| 계정 | 이름 | 가진 것 |
| :--- | :--- | :--- |
| `demo-owner@goldito.test` | Robert (오너) | 강아지 **Max**, 고양이 **Mochi** |
| `demo-sitter@goldito.test` | Chloe (시터) | Robert의 확정 예약 1건 (아래) |

**팀 QA용 세트(#163):** 사람마다 오너 1 + 시터 1 한 세트. 로그인 화면의 **Whose demo** 드롭다운에서 고르면 그 세트의 Demo owner / Demo sitter로 들어가고, Profile → Demo tools는 **로그인한 그 계정만** 초기화한다(오너는 오너쪽, 시터는 시터쪽, 다른 계정은 그대로). 데모 도구가 켜진 빌드에서만 보이고, 심사용 빌드는 기본 한 쌍(Chloe 세트)만 쓴다.

| 세트 | 오너 | 시터 |
| :--- | :--- | :--- |
| Chloe (기본, 슬기 QA) | `demo-owner@goldito.test` (Robert) | `demo-sitter@goldito.test` (Chloe) |
| Paul | `demo-owner-paul@goldito.test` (Peter) | `demo-sitter-paul@goldito.test` (Paul) |
| Allen | `demo-owner-allen@goldito.test` (Alex) | `demo-sitter-allen@goldito.test` (Allen) |
| Daniel | `demo-owner-daniel@goldito.test` (David) | `demo-sitter-daniel@goldito.test` (Daniel) |

> **이름:** 여덟 계정 이름이 모두 다르고 펫 이름도 세트마다 다르다(Chloe 세트 Max · Mochi, Paul 세트 Biscuit · Luna, Allen 세트 Cooper · Olive, Daniel 세트 Teddy · Leo). 강아지는 모든 세트에서 닭고기 알레르기가 있어 Treat check 샘플 결과는 같다.
>
> **초기화 범위:** 오너가 초기화하면 오너쪽(펫과 돌봄 계획, 오너의 알림)과 **그 세트 시터와의 예약 · 문의 · 채팅**이 지워지고 시터의 일정과 말투는 그대로. 시터가 초기화하면 시터쪽(일정, 시터의 알림)과 같은 예약 · 문의 · 채팅이 지워지고 오너의 펫과 돌봄 계획은 그대로. 다른 세트의 계정과 주고받은 예약은 어느 쪽 초기화에도 안 지워진다.
>
> **초기화가 다시 만드는 것 (10/20):** `empty`를 뺀 모든 상태에서 오너의 즐겨찾기 1개(그 세트 시터), 그 쌍의 채팅 하나(Stay 카드 + 짧은 대화, 예약 상태면 요청 카드와 시터의 답까지), 시터의 온보딩 답(이미 답이 있으면 그대로 두고, 없을 때만: 걷기 · 식사 · 집에 있음 · 활동 · 공원 · 개 크기 · 고양이)과 온보딩 완료 표시. 시드 스크립트도 시터 답을 넣는다. 사진(Cloudinary 업로드가 필요)은 아직 없다. 오너는 가입 질문을 마친 것으로 표시되고(`onboarded_at`) Max · Mochi에는 성격 · 안전 답이 들어가 "at a glance" 카드가 바로 보인다(`014v` 적용 뒤).
>
> **세트가 서로 만나는 곳:** 모든 데모 시터는 모든 오너의 검색에 보인다. 세트 사이의 예약(예: Paul 오너와 Chloe 시터)은 어느 세트의 초기화에도 지워지지 않는다. 새 세트(Paul · Allen · Daniel)는 시드를 돌린 뒤 첫 초기화(Pets only)로 펫과 일정이 생긴다.

> **데모 이메일:** 호스팅 DB 계정은 `@goldito.test`(이름 Robert / Chloe). 호스팅 DB에 옛 `seed_demo.py`(`@pawddy.test`)를 돌리지 말 것.

### 1.3 데모 데이터 (2026-10-04 기준 — 2026-10-08 현재 아래 참고)

- Robert ↔ Chloe 예약 **확정**, 미팅 완료, **결제 전**. Max · Mochi.
- 드롭오프 완료(10/4), **픽업 예정 10/7 05:37 UTC (토론토 10/7 새벽 1:37)**.
- 그래서 **지금 Chloe는 "돌보는 중"** 이다 → 시터 Home의 할 일 · 체크인이 보인다.
- ⚠️ **픽업 시각이 지나면** 시터 쪽 시나리오(TASK · CHK)가 "Tasks open once the stay has started" 등으로 막힌다. 그때는 새 예약을 만들어 드롭오프를 완료 처리하거나 시드 스크립트(Phase 10, 10.1)를 쓴다.
- **상태는 누가 마지막에 무엇을 했는지에 따라 다르다.** 원하는 시작 상태(`empty` · `pets` · `confirmed` · `ready` · `in_care`)로 리셋하는 법은 [test-run.ko.md](test-run.ko.md) §1 (`backend/scripts/reset_demo.py`, dry run 먼저 — 민식 PC에서; 백엔드 배포 뒤에는 앱의 Profile → Demo tools).

### 1.4 테스트가 남기는 데이터

| 지울 수 있음 (앱에서) | 지울 수 없음 (의도된 규칙) |
| :--- | :--- |
| 돌봄 할 일 (Delete), 피드 사진 (🗑️) | 체크인, 완료 기록, 알림 — 클라이언트는 읽기 전용 |

→ 테스트 후 알림·체크인이 쌓인다. 필요하면 `reset_demo.py` / Demo tools로 리셋한다. 심사용으로는 Phase 10에서 고정 데모 계정으로 바꾼다.

---

## 2. 기능 현황

범례: ✅ 만들어짐 · 🟡 일부 · ⬜ 아직 · 🤖 자동 테스트 있음 · 👤 사람이 확인해야 함

### Stage 1 — Inquiry (문의)

| 기능 | 상태 | Phase |
| :--- | :--- | :--- |
| 오너 **문의 보내기** — 화면 제거됨(채팅이 대신함, #142): 채팅의 말 칩 · AI 초안 → `chat.spec.ts` (CHAT-*) | 🤖 `chat.spec.ts` (옛 `inquiry.spec.ts` 삭제) | 07B / 7B.5 → 3D.5 |
| 시터 **문의함** — 화면 제거됨(Questions 탭 · 문의 상세). 채팅 목록(Chats)이 대신함. 정책 편집은 그대로 | 🤖 `chat.spec.ts` | 07B / 7B.6 → 3D.5 |
| 문의 답장 **초안 API** (일정 · 견적 · 반려동물 · RAG 근거 → Nano, 금액 · 날짜 · 1인칭 · 출입 정보 검사, 정책 체중 한도, 멱등, 오너에게는 초안을 안 줌) | ✅ 🤖 pytest a–k (실제 모델 확인 · 지연 p50 3.2 s) | 07B / 7B.3–7B.4 · 7B.7 |
| RAG (문단 청크 · 재색인 · 범위 제한 검색) | ✅ 🤖 pytest + SQL smoke M | 07B / 7B.2 |
| **시터 말투** (스타일 카드 + 본인 예시 · 익명화 · 그대로 / 수정 / 다시 생성 학습) | ✅ 🤖 pytest · 실제 모델로 두 시터 다른 말투 확인 · 블라인드 평가(약 50건)는 👤 | 07B / 7B.8–7B.9 |
| **자동 발송** (동의 모달 · 약 30초 사람 속도 · typing → 말풍선 · 시터가 열기 전엔 읽음 없음) | ✅ 🤖 pytest + `inquiry.spec.ts` + SQL smoke M (지연 공식은 슬기 확정 전 기본값) | 07B / 7B.10 |
| 문의 에이전트 (tool calling, `INQUIRY_AGENT=off\|auto\|on`, **기본 `auto`** = 게이트가 필요하다고 볼 때 Nemotron Super로 — 지금은 거의 항상 켜짐, 리뷰 M-1) | ✅ 🤖 pytest · 실제 모델 확인 | 07B / 7B.11 |

### Stage 2 — Meet & Greet · 케어 요청

| 기능 | 상태 | Phase |
| :--- | :--- | :--- |
| 첫 만남 미팅 (직접 / 영상, 제안 · 수락 · 건너뛰기 — 오너는 요청 직후 **Request / Skip Meet & Greet**, 시터의 답이 첫 동의, BOOK-8 ~ 13 · MGCHOICE) | ✅ 🤖 (`015f` 호스팅 적용 전) | 03B.9 · Booking steps · #236 |
| Google Meet 링크 자동 생성 (방은 링크 누구나 입장으로 열림 — 새 범위로 token 재발급 후 사람 확인 필요) | 🟡 서버 완료, **앱 e2e 미확인** | 03B.11 |
| 오너가 돌봄 할 일 등록 (약 · 식사 · 산책 …) | ✅ 🤖 | 06 / 6.1 |
| AI 케어 요청서 → 체크리스트 (칩 · 한 줄씩 · 표 · 자동 저장) | ✅ 🤖 (실제 AI 응답은 👤) | 06 / 6.12–6.13 · 6.20 |

### Stage 3 — Booking (예약)

| 기능 | 상태 | Phase |
| :--- | :--- | :--- |
| 시터 스케줄 열기 / 막기 | ✅ 🤖 | 03B.1 |
| 내 시터 목록 · 시터 프로필 | ✅ 🤖 | 03B.2 |
| 예약 요청 (펫 · 시간 · 장소 · 서비스) | ✅ 🤖 | 03B.3 · 03B.10 |
| **예약 단계 (D60)**: 시터의 첫 동의 "Next" → 날짜 홀드 · 진행 막대 · 2일 알림 / 3일 뒤 자동 취소 · 한 번에 한 오너 설정 · 오너 "Not this sitter" | ✅ 🤖 (사람 확인 대기, 호스팅 DB에 `011l` + 백엔드 `CRON_SECRET` 필요) · 단계 조회(`get_booking_stages`)가 실패해도 앱이 같은 규칙으로 단계를 계산해 결제된 예약이 "Request"로 보이지 않음 (CR-8, 🤖 `negotiation.spec.ts`) | 03B Booking steps |
| 시터 요청 함 (수락 · 시간 제안 · 거절 — 거절 시트에 사유 칩 · 짧은 메모 · Suggest another time instead, 오너 알림 · 예약 상세에 사유 표시) | ✅ 🤖 (FB-35 부분은 사람 확인 대기) | 03B.4 · FB-35 |
| 협상 · 확정 후 변경 | ✅ 🤖 | 03B.5 |
| 도착 / 인계 체크 (Received · Returned) | ✅ 🤖 | 03B.6 |
| 취소 · 새 시터 찾기 | ✅ 🤖 | 03B.7 |
| 시터 Home 대시보드 | ✅ 🤖 | 03B.8 |
| 견적 · 동의서 · 데모 결제 · 시간 제한 출입 정보 (+ 결제 전 입구 정보 경고, ENTRY-1) | ✅ 🤖 | 03C |
| **시터 검색 (SS)** — 날짜 · 시간 · 집 / 현재 위치 · 반경 1–100 km(정확히), 머무는 내내 가능한 시터만, 거리는 정수 km | 🟡 화면 · 슬라이더 · 현재 위치 · 빈 상태 · Book 채우기 ✅ 🤖 `sitter-search.spec.ts` · SQL(정확한 반경) smoke는 CI 대기 — 호스팅 DB에는 +2 km 여유가 있는 옛 `014c`가 들어 있어 머지 때 다시 적용 · 사람 확인 대기 | 03B SS |
| **채팅 허브 (3D.4)** — 오너 · 시터 한 쌍에 채팅 하나(같은 쌍은 늘 같은 스레드), 자유롭게 여러 번 보내기, 맨 위 부킹 진행도 + 첫 카드(날짜 · 시간 · 펫), **Chat 탭**의 채팅 목록(안 읽은 수, 나가기, #329), 기존 문의는 한 번 스레드로 옮김. 문의 화면과 AI 초안은 #142까지 그대로 | `014j` (호스팅 미적용) | 🤖 `chat` e2e · SQL `rls_smoke` | 사람 확인 대기 |
| **채팅 안의 트립 (3D.8, #145 1단계)** — 이동하는 쪽 Start trip, 양쪽에 on the way · N min away · arrived 카드, 도착 인사 한 번 누르기. 기존 Trip 화면으로 연결 | 없음 | 🤖 `chat-trip` e2e | 사람 확인 대기 |
| **채팅 안의 케어 카드 (3D.8, #145 2단계)** — 사진 요청(Ask for a photo)과 사진 답장 + 한 줄 캡션, 저녁 알림장 카드가 Diary로 연결. 마이그레이션 없음 | 없음 | 🤖 `chat-trip` e2e | 사람 확인 대기 |
| **채팅 안의 인계 (3D.8, #145 3단계 · #169)** — 기본 방식(오너 마지막 요청 · 시터 온보딩 답), 드롭오프 + 픽업을 한 쌍으로 제안 · 한 번에 수락, 5분 전 트립 알림(`014r` 호스팅 적용 2026-10-20), 펫 Received · Returned를 채팅 카드로 | `014r` (호스팅 적용) | 🤖 `chat-handoff` · `chat-trip` e2e · SQL `rls_smoke` | 사람 확인 대기 |
| **채팅 안의 종료 · 리뷰 (3D.9, #146)** — Home safe 아래 오너의 리뷰 폼 · 하트, 시터가 읽는 오너 리뷰 + 비공개 노트, 끝난 스테이의 푸터 정리. 리뷰 폼은 예약 화면과 공유 | 없음 | 🤖 `chat-trip` e2e | 사람 확인 대기 |
| **채팅 컨트롤 (#235)** — 견적 초안 검토(수수료 줄), Final quote 이름, 한 줄 칩, + 메뉴(카드 직접 보내기), 오너 동의가 시터 채팅에 바로 표시, 입력에 맞는 칩(1.5초 멈춤) · **수수료는 #265로 제거** | 없음 | 🤖 `chat` · `chat-trip` e2e · pytest | 사람 확인 대기 |
| **채팅 안 견적 (3D.6, #143)** — 시터가 한 번 눌러 견적 카드(서버 계산), 추가 수수료 줄(시터 추가 → 오너 Accept/Decline), 오너 Confirm, 새 견적은 이전 것을 Replaced로. 합계는 DB 함수가 계산하고 모델은 가격을 쓰지 않음. 예약 · 결제 연결은 #144 · **수수료는 #265로 제거** | `014n` (호스팅 미적용) | 🤖 `chat` e2e · SQL `rls_smoke` | 사람 확인 대기 |
| **시터 온보딩 답변 (3D.2)** — 번호 질문 · 칩 · 자기소개 · 직접 추가 Q&A, 건너뛰기 가능, 오너는 읽기만 | 🟡 DB(`014f`) · 번호 질문 화면 · 검토 · 완료 · Profile 편집 ✅ 🤖 SQL smoke + `sitter-onboarding.spec.ts` · 가능한 날 등록(주간 규칙 · 시간)도 ✅ · Profile의 답변 목록 · 메모 "+" · "4+" 칩 · 쉬는 날 제거(#161) ✅ · 사진(PR B) · 시드 · 오너 상세 표시는 아직 · 음성은 문서만(보류) · 사람 확인 대기 | 03D / #139 |
| **오너 가입 상세 (11.15 S1, #185)**: 한 화면 한 질문, 펫 사진 여러 장, 5축 "at a glance" 카드 | 🟡 DB(`014v`) 🤖 SQL smoke ✅ · 펫 사진 백엔드 라우트 🤖 pytest ✅ · 질문 화면(종 · 이름 · 사진 · 품종 · 나이 · 몸무게 · 소개 · 성격 · 안전 · 음식 · 요약 · 저장) 오너 소개 · 위치 · 음성 입력(녹음 → 글 → 제안, 가짜 마이크) · 사진 추측(품종 칩 · 털색 단계) 🤖 e2e ✅ · at a glance 카드(시터 예약 상세 · 오너 펫 상세 · 가입 요약, 품종 Needs 줄) 🤖 e2e ✅ · 시터 요청 카드(문의 스레드)와 Life Record 위는 아직 · 사람 확인 대기 | 11 / #185 |
| **다마고치 (11.12, #184)**: Home의 8-bit 펫, 오늘 체크인에서 계산한 기분 · HUD, 시터 탭 액션 | 🟡 파생 상태 `lib/petStatus.ts` 🤖 e2e ✅ · 임시 스프라이트(코드로 그린 픽셀 헤드, 종 2 × 털색 8 × 기분 5) 🤖 e2e ✅ · 오너 Home 카드 뒤집기(버튼 · 드래그 · 휠로 Today ↔ 펫 방, 점 없음, #286) · 펫 방(스프라이트 · 기분 · HUD) 🤖 e2e ✅ · 펫 카드 커버 사진(없으면 이모지) 🤖 e2e ✅ · 펫 화면 아바타 탭으로 사진 바꾸기(원형 크롭, 카메라 배지) · Retake personality(같은 질문 다시 답하기) 🤖 e2e ✅(업로드 자체는 사람 확인 대기) · 시터 Home의 펫 방과 탭 액션(밥 · 산책 · 응가 · 낮잠, `015`) 🤖 e2e ✅ · SQL smoke ✅ · 아카이브 메달(`015b`, 시터가 Returned 뒤에 펫마다 한 번 수여, 오너 Pet 페이지 아래에 표시) 🤖 e2e ✅ · SQL smoke ✅ · 사람 확인 대기 · 견종별 머리 모양(개 4 · 고양이 2) · 몸무게별 크기 · 사진은 색만(Match colors from photo, `pixel_colors`) 🤖 e2e ✅ · 시터 배지(Profile: First stay · First 5-star review, 그림자 4칸) 🤖 e2e ✅ | 11 / #184 |
| **프로필 사진 (#135 – #137)** — 시터 · 오너 사진 최대 8장, 첫 장이 대표, 라운드 크롭 · 순서 · 삭제, 시터 사진은 오너에게 · 오너 사진은 예약 · 문의가 있는 시터에게만 | 🟡 DB(`014g`) · 업로드 API ✅ · 시터 Profile의 갤러리(추가 · 라운드 크롭 · 대표로 · 앞뒤 이동 · 삭제 · 최대 8장 · 빈 실루엣) ✅ 🤖 SQL smoke + `test_profile_photos.py` + `profile-photos.spec.ts` · 오너 Profile의 같은 갤러리와 시터가 예약 · 문의 화면에서 보는 오너 대표 사진(#137) ✅ · 시터 상세 한 줄과 뷰어(#136) · Privacy 페이지의 Profile photos 문구 ✅ · 사람 확인 대기(`014g`는 호스팅 DB에 적용됨) | #135 – #137 |

### Stage 4 — 돌봄 · 알림장

| 기능 | 상태 | Phase |
| :--- | :--- | :--- |
| 사진 · 영상 업로드 (서명, 리사이즈, 30초 트림) | ✅ 🤖 (실제 Cloudinary는 👤) | 04 |
| 사진 선택 · **촬영** · 미리보기 → 확인 | ✅ 🤖 (실제 카메라는 👤) | 04 / 6.3 |
| 오너 **Feed** 앨범 · 전체화면 보기 (스와이프 · 화살표) | ✅ 🤖 | 05 |
| 시터 Feed (+ Photo) | ✅ 🤖 | 05 |
| **공개 범위** (시터 "Share with owner", 오너 "Visible to sitter") | ✅ 🤖 SQL · e2e | 05 / 5.8–5.9 |
| 작성자 삭제 🗑️ (파일까지 삭제) | ✅ 🤖 | 05 / 5.7 |
| 알림 (토스트 · 벨 · 알림센터 · 탭 이동) | ✅ 🤖 (실시간은 👤) | 05 |
| 알림 **밀어서 삭제**(60% 이상) · **Clear all** | ✅ 🤖 | 06 후속 |
| 실패하면 **닫을 때까지 남는 에러 팝업** + Try again | ✅ 🤖 | 06 후속 |
| **Heads-up** (오너가 관리 · 시터 Home 한 줄 · 예약 상세) | ✅ 🤖 | 06 / 6.14 |
| 오너 **케어 체크리스트 / 요청** (칩 → 줄 → 표, 돌보는 중엔 시터 승인 · 거절) | ✅ 🤖 (실제 AI · 두 계정은 👤) | 06 / 6.12–6.13 · 6.20 |
| 오너 **돌봄 할 일** 등록 · **시간 탭 선택** · 탭해서 **수정**(종류 고정) · 일시중지 · 삭제 | ✅ 🤖 | 06 / 6.1 + 후속 |
| 시터 **오늘 할 일** — Done → 팝업(메모 + 사진) → Done, 끝낸 건 목록에서 사라짐 | ✅ 🤖 | 06 / 6.2–6.4 · 6.3 + 후속 |
| 시터 **빠른 체크인** (식사 · 배변 · 산책 · 기분 · 메모 · 사진), 보냄 표시 · 연타 잠금 · 오늘 보낸 것 목록 | ✅ 🤖 | 06 / 6.8–6.10 + 후속 |
| 시터 **Home 대시보드** (한 화면) · 할 일 / 체크인 / 내 기록 화면 | ✅ 🤖 | 06 후속 |
| 오너 **Home 실시간 업데이트 카드** (밀어서 지우기) | ✅ 🤖 | 06 후속 |
| 오너 **Home Today 면 Figma 정렬** (돌보는 중이면 초록 히어로 "Max is with Chloe" · Day N of M · 오늘 케어 진행바 · 통계 타일(care done · photos today · of walks) · Latest from 시터 · See today's updates → History, 아닐 때는 Your pets만, 펫 타일 2열 · + Add pet). 숫자는 시터가 기록한 값만, 없으면 숨김 · 아이콘은 Lucide 임시(SVG 오면 `components/home/HomeArt.tsx`) | 🟡 타입체크 · 토큰 체크 ✅ · e2e 기대값 수정(`pets` · `live-updates`)은 아직 안 돌림 · 사람 확인 대기 | 오너 Home Figma |
| **시트 핸들 드래그 · 사진 넘기기**: 모든 Sheet의 핸들/제목줄을 아래로 끌면 닫힘(전체화면이면 먼저 원래 높이), 위로 끌면 전체화면. 사진 보기(시터 · 펫)는 좌우 드래그 · 가로 휠 · 점으로 넘김. Home 펫 타일은 사진이 있으면 얼굴 자리에 표시, 누르면 사진 크게(여러 장 넘김), Home에 돌아올 때마다 다시 읽음 | 🟡 타입체크 ✅ · 사람 확인 대기 (마우스 드래그와 터치 모두) | 오너 Home Figma |
| **Home 카드 회전 방향**: 마우스로 옆으로 끌면 카드가 손가락을 따라 돌고(오른쪽으로 끌면 오른쪽으로, 왼쪽이면 왼쪽으로), 조금만 끌면 제자리로 돌아오고 많이 끌면 반대 면이 됨. 가로 휠 · 터치 스와이프도 같은 방향. 회전 버튼은 지금처럼 앞→뒤, 뒤→앞으로 되돌려 돎 | 🤖 `pet-room`(버튼 · 끌기 · 휠로 면이 바뀜) · 회전 방향 자체는 사람 확인 대기 | 오너 · 시터 Home |
| **펫 사진 여러 장 (Pet 화면)**: 동그란 대표 사진 아래에 전체 사진 줄(최대 8장) + 더하기. 카메라 배지와 더하기는 사진을 **추가**(대표를 바꾸지 않음), 사진 모서리의 **빨간 원 − 를 누르면 바로 삭제**. 시트는 손가락을 따라 움직이고 조금만 끌면 제자리, 어느 정도 끌면 닫힘/전체화면 | 🟡 타입체크 ✅ · 사람 확인 대기 | 오너 Home Figma |
| **Care request Quick add**: 케어 요청서 맨 위 **Quick add** 칩 5개(개: Breakfast 8 AM · Dinner 6 PM · Walk 8:30 AM · Walk 5 PM · No knocking / 고양이: Breakfast · Dinner · Pill 8 AM · No knocking · Door closed). 누르면 완성된 줄이 바로 추가되고 그 칩은 사라짐, 줄 옆 ✕로 지울 수 있음 | 🟡 타입체크 ✅ · 사람 확인 대기 | 오너 Home Figma |
| **체크인 선택지 확장 (`015i`)**: 무드 8개(happy · playful · excited · calm · tired · missing · sad · anxious), Ate / Potty **기타(메모 필수)**, 산책 5 · 15분 값. 기존 값은 그대로 유효 | 🟡 SQL smoke 추가(`rls_smoke` 015i, CI에서 처음 실행) · **호스팅 DB 적용 2026-10-23**(제약 · 함수 · 권한 확인) | 시터 Home Figma |
| 오너 **History** (오늘 + 최근 7일 기록, 알림을 지워도 남음) | ✅ 🤖 | 06 / 6.11 |
| 오너 **Diary 탭** = 시터가 보낸 알림장 목록(첫 문장) → 항목 화면(본문 · 그날 사진 · 할 일), 초안은 안 보임, 알림 탭하면 해당 항목 | ✅ 🤖 `report.spec.ts` (실제 두 계정은 👤) | 07 / 7.3 |
| 시터 **리마인더 배너** (할 일 시간이 되면 Home 맨 위 배너 + 토스트) | ✅ 🤖 | 06 / 6.6 |
| 시터 **Diary** (펫이 둘 이상이면 먼저 펫 선택 · 오늘 요약 한 줄 · 칩 켜기/끄기 · 기록 값 고치기 · "Anything to add?" 짧은 줄 = 내 칩(× 지우기) · 사진 ≤ 2 → 초안 미리보기 수정 → Send, 새로고침 후 초안 유지, 탭으로 돌아오면 새 기록 칩) | ✅ 🤖 `report.spec.ts` (AI는 mock · 실제 모델 연결은 👤) | 07 / 7.3 |
| AI 알림장 **초안 API** (`POST /api/ai/daily-report`: 하루 기록 → 시터 1인칭 초안, 같은 날 덮어쓰기, 보낸 뒤엔 409, 기록이 없으면 고정 문장) | ✅ 🤖 pytest (실제 모델로 환각 점검 3회) · 화면은 시터 Diary(7.3) | 07 / 7.2 |
| **알림장 보내기** (`send_daily_report`: 시터가 고친 **최종 본문**만 게시, 오너는 보낸 것만 보임, 한 번만, 오너 알림) | ✅ SQL `rls_smoke` · 🤖 `report.spec.ts` (Send) | 07 / 7.5 |
| AI 알림장 **칩 제안 API** (`POST /api/ai/report-chips`: 하루 기록 → 칩(모델 없음), 사진 ≤ 2 → 한 줄 묘사 + 에피소드 칩, 느리거나 실패한 사진은 빼고 기록 칩은 유지, 남의 사진 403) | ✅ 🤖 pytest · 실제 비전 모델로 데모 사진 3장 확인(2026-10-07) · 화면은 시터 Diary(7.3) | 07 / 7.7 |
| **사진 자동 캡션 · 앨범 분류** (시터는 올리기만 → AI가 캡션 + 분류 → 피드 게시, "Writing a caption…" 단계, 실패해도 게시, 오너 Feed **Timeline / Album**) | ✅ 🤖 `caption.spec.ts` + pytest (실제 비전 모델로 샘플 9장 중 8장 분류 · 지연 약 1.2초 · 실제 사진 5장 합의는 👤) | 09 / 9.1–9.3 · 9.5 |
| Pet Transit **DB** (홈 좌표 · `trips` 마지막 위치 1개 · `start_trip` · `update_trip_position` · `end_trip` · 150 m 도착 알림 · Realtime · **예약이 취소되면 열린 trip도 취소 + 위치 삭제** (`012b`, CR-1)) | ✅ SQL `rls_smoke` L · CR-1 (사람 확인 ➖ — `012b` 호스팅 DB 적용 10/13) | 06B / 6B.1 |
| Pet Transit **사진 체크 API — 앱에는 연결하지 않음(2026-10-11 결정, P1 후보)** (`POST /api/ai/handoff-check`: 사진 → 보이는 것만 보고, ok / warning은 서버 규칙, 실패하면 unchecked, `handoff_checks`에 저장) | ✅ 🤖 pytest + SQL `rls_smoke` L · 실제 모델은 개 사진 3장(종 일치 · 불일치)만 확인 — **크레이트 · 안전벨트 감지는 임시 이미지라 미확인, 진짜 샘플 4장 대기** | 06B / 6B.5 |
| Pet Transit **홈 핀** (Profile → Map pin for trips: 버튼 한 번에 현재 위치 1회(브라우저 권한 창이 동의) · 주소 저장 시 OSM 조회 + 한 줄 안내 · 못 찾으면 옛 핀 삭제) | ✅ 🤖 `home-location.spec.ts` + pytest `test_geo` (실제 Nominatim은 공개 주소 1건만 손으로 확인, 실제 폰 GPS는 👤) | 06B / 6B.2 |
| Pet Transit **위치 소스 · 동의** (`lib/location.ts`: GPS / 가상 경로, `TripProvider` + 위치 공유 동의 화면 — Start trip 버튼이 붙는 S4에서 화면 단위로 확인) | 🟡 🤖 `location.spec.ts`(소스 단위) · 동의 화면은 프로필 핀으로만 e2e | 06B / 6B.2 |
| Pet Transit **Start trip · 지도 · ETA · 도착 카드 (두 컨텍스트 e2e 포함)** (동의 화면 → 가상 운전 → 지도 · ETA 갱신 → 도착 시 Chloe's place / 출입 정보, 상대 화면은 새로고침 없이 따라감, Home 카드, Cancel trip) | ✅ 🤖 `transit.spec.ts` (Realtime은 e2e에서 안 쓰고 4초 폴링으로 확인 · 실제 두 화면 동시 확인과 실제 폰 GPS는 👤) | 06B / 6B.3 · 6B.4 |
| Pet Transit **Received · Returned가 trip을 닫음** (`complete_handoff`가 열린 trip의 위치를 지움, 시그니처 불변) | ✅ SQL `rls_smoke` L · 🤖 `transit.spec.ts` | 06B / 6B.6 |
| Pet Transit **Returned 확인 시트 · 이른 Returned 경고** (FB-9) | ✅ 🤖 `handoff.spec.ts` (실제 사람 확인은 FLOW-6) | 06B / 6B.6 |
| Pet Transit **Open in Google Maps(양쪽) · 공유 없이 시작 · 공유 안 하는 상대 화면 · 오래된 위치 안내** | ✅ 🤖 `transit.spec.ts` + SQL `rls_smoke` L (실제 폰은 👤) | 06B / 6B.8 |
| **사진 요청** (견주 Feed **Request photo** → 시터 Home 배너 → 시터의 다음 공유 사진이 요청을 완료, 알림 하나만) | ✅ 11.1 S1 DB ✅ SQL `rls_smoke` 014 (`014` 호스팅 DB 적용 2026-10-15) · S2 견주 Feed 버튼 · S3 시터 Home 배너 · S4 답 알림이 feed_post처럼 🤖 `photo-request.spec.ts` · 두 브라우저 DoD ✅ 2026-10-15 Minsik | 11 / 11.1 |
| **Settings · What's new** (Figma `D · Profile → Settings`: 메뉴 → Settings: 초록 계정 블록 · What's New 행 · Account(Name → Profile, Email, Pets는 오너만) · Notifications 스위치 3개(Trip updates · Daily notes and photos · Tips and news: 누르면 바로 저장돼 나갔다 와도 유지, 끄면 그 종류의 알림이 안 옴 · `015e`, 호스팅 DB에는 머지 때 적용 · Tips and news는 아직 보내는 알림이 없음 · 예약 · 채팅 · 안전 DANGER은 못 끔) · Privacy · Sign out · 앱 버전 · 프로필 사진이 있으면 이니셜 대신 사진 / `D · Settings → What's New`: `docs/CHANGELOG.md`의 **날짜 있는 항목**마다 카드 하나(맨 위 카드는 윗줄에 노란 New 배지, 해커톤 기간 변경도 임시로 보임, `SHOW_BEFORE_LAUNCH`로 다시 숨김), 없으면 "Nothing new yet") | 🟡 🤖 `settings.spec.ts` · 사람 확인 대기 |

### Stage 5 — Completion · 기타

| 기능 | 상태 | Phase |
| :--- | :--- | :--- |
| Privacy 페이지 `/privacy` (로그아웃 상태 · Welcome · Profile에서 열림, Google Calendar · Meet 문단과 Limited Use 문구 — OAuth 동의 화면 Branding의 개인정보 링크) | 🤖 `privacy.spec.ts` · 사람 확인 대기 (PRIV) | 10.11 |
| 브랜드 아이콘 (골드 코인 + 발바닥) — 브라우저 탭 · 즐겨찾기 `favicon.ico`, iOS 홈 화면 `apple-touch-icon`, 안드로이드 홈 화면 · PWA `manifest.json`(192 · 512 · maskable), 앱 아이콘 `assets/icon.png` 1024(불투명) · Android adaptive 전경 · 배경 · monochrome | 🟡 빌드 산출물 · `<head>` 태그 · manifest 확인(2026-10-18) · 폰 홈 화면 · 탭 표시는 사람 확인 대기 (BRAND) | 10 |
| **귀가 알림** (Returned → "Max and Mochi are home safe 🏠" → 바로 뒤 리뷰 요청 알림) · **Stay summary** (기간 · 알림장 수 · 사진 수 · 완료 할 일 수 · 마지막 알림장 첫 문장) | ✅ 🤖 `completion.spec.ts` + SQL smoke N (실제 두 계정 👤) | 07C / 7C.1–7C.2 |
| **리뷰** (★1–5 + 코멘트 ≤ 500 · 한 번만 · 귀가 뒤에만 · 시터 알림 · 시터 프로필 평균 ★ · 후기 수 · 최근 코멘트 3개) | ✅ 🤖 `completion.spec.ts` + SQL smoke N | 07C / 7C.1 · 7C.3 |
| **Pet Life Record** — AI 정리(근거 없는 문장은 버림 · 출입 정보 없음) · 오너 펫 화면 `📖 Life Record` · 끝난 예약 화면(자동 작성 · Retry) | ✅ 🤖 pytest + `completion.spec.ts` (실제 모델 확인, 실제 두 계정 👤) | 07C / 7C.4–7C.5 |
| 다음 시터 요청 카드의 **From Max's Life Record** (접힘) · 문의 AI 근거 칩 · 케어 체크리스트 초안에 지난 Heads-up 자동 제안 | ✅ 🤖 `sitter-bookings.spec.ts` + pytest | 07C / 7C.6 |
| **Snap 탭** (D61): Treat check(간식 성분표 → 알러지 · 독성 · Tavily 출처, DANGER 빨간 모달) · Mood(펫별 박스 + 감정 %) · Sticker(펫만 오리기 → 다이어리 꾸미기, 견주 + 시터) | 🟡 12.0 탭 · 카드 3개 ✅(🤖 `snap.spec.ts` · `auth.spec.ts`) · 12.1a Treat check **API만** ✅(🤖 pytest `test_ai_safety_check` · `test_safety_rules` · `test_tavily` + SQL `rls_smoke` 013 — `013` 호스팅 DB 적용 · smoke 통과 2026-10-14, 모델 직접 호출 확인 2026-10-14) · 12.1c Treat check **화면** ✅(🤖 `treat-check.spec.ts` — API는 목업, 사람 확인 · 실제 호출은 대기) · 12.2a Mood **API만** ✅(🤖 pytest `test_mood_rules` · `test_ai_pet_mood`; 비전 태그는 우리 사진 8장으로 직접 호출 확인 2026-10-14) · 12.2b Mood **화면** ✅(🤖 `mood.spec.ts` — MediaPipe는 테스트 훅, API 목업; 실제 브라우저 · 모델 확인은 대기) · 12.3a Sticker **만들기** ✅(🤖 `sticker.spec.ts` + SQL `rls_smoke` 013b — `013b` 호스팅 DB 적용 · smoke 통과 2026-10-14, 실제 Magic Touch는 머지 뒤) · 12.3b 다이어리 **꾸미기** ✅(🤖 `decor.spec.ts` — 견주 다이어리 상세 · 시터 보낸 알림장, 마우스 드래그 · 크기 · 회전; `013b` 적용 2026-10-14) · 12.4 **그림일기 · 글 위/아래 스티커 · 다운로드 · 기본 스티커 9장** ✅(🤖 `decor.spec.ts` · `sticker.spec.ts`; 기본 스티커는 임시 그림) · 12.5 **Snap 탭 Recent checks 3개 · README** ✅(🤖 `snap.spec.ts`) · 11.8 **Save image**(꾸민 그림일기 한 장 → PNG) 🟡(🤖 `decor.spec.ts` · 사람 확인 대기) | 12 (08 설계 포함) |
| **공개 데모 보호** (감사 2026-10-21): 데모 계정(`@goldito.test`)의 비밀번호 · 이메일은 시드만 바꿈(`014z`) · AI 호출(`/api/ai/*` · `/api/rag/*` · `/api/tone/*`)과 업로드 서명(`/api/media/sign` · 펫 · 프로필 사진)은 한 사람당 하루 100번(공유 데모 계정 1000번), 넘으면 429 | 🟡 🤖 SQL `rls_smoke`(014z) · pytest `test_seed_demo` · `test_limits` · 호스팅 DB 적용은 머지 때 (SEC-4 to SEC-6) | 10 |
| 로그인 · 회원가입 (Apple · Google 버튼은 "Coming soon" 토스트만, 이메일 가입 위 "or with email" 구분선) · 역할별 화면 · Welcome 투어 | ✅ 🤖 (소셜 버튼 · 구분선은 사람 확인 대기) | 01 · 03 · OB |
| 펫 · 프로필 | ✅ 🤖 | 03 |
| **Profile의 Save 고정** (스크롤해도 화면 맨 아래에 Save와 저장 에러가 보임, 오너 · 시터 같음 · 시터는 Your photos가 Badges 위) | 🟡 기존 `profile` e2e가 `profile-save`로 저장 확인 · 고정 위치 · 순서는 사람 확인 대기 | #292 |
| **Profile Save 후 그대로 머묾** (저장하면 "Profile saved" 토스트만 뜨고 홈이나 이전 화면으로 가지 않음, 오너 · 시터 같음) | 🟡 사람 확인 대기 | - |
| **Profile 정리 (#180)**: 선택 입력 카드 접기(▸ ▾, 닫힌 카드는 값을 한 줄로) · Home address 카드(주소 · 현재 위치 버튼 · Address details · Postal code) · 서비스 지역 자동 · 오너 패킹 리스트와 시터 인수 체크 · 미팅 스팟 삭제 · Your answers 카드 · 시터 Packing list 제거 | 🟡 DB(`015g` · `015h`, 호스팅 DB에 적용됨 10/23) · 앱 구현 🤖 e2e(`profile` · `home-location` · `checkout` · `sitter-badges` · `profile-photos` · `sitter-onboarding` 등 로컬 chromium 108개 통과 10/23) · SQL smoke(CI에서 처음 실행, 로컬 Postgres는 못 돌림) · 사람 확인 대기 | #180 |
| 데스크톱 폰 프레임 · 마우스=손가락 | ✅ 🤖 | 01 |
| 데스크톱 Split view, 폰 두 개 나란히 (`?view=split`, 폭 ≥ 900), 각 폰은 로그인 화면에서 시작하고 로그인한 계정이 폰 위에 보임 | ✅ 🤖 `split.spec.ts` · 사람 SPLIT-1은 다시 확인 대기, SPLIT-2 – 5는 ✅ (2026-10-15 Minsik) | 10 / 10.10 |

---

## 3. 시나리오

**열 설명** — 자동: 같은 시나리오를 자동 테스트가 확인하는지 (스펙 이름). **상태**: ✅ 통과 · ❌ 실패 · ➖ 미확인 (+ 날짜 · 확인한 사람). 아직 아무도 사람 손으로 확인하지 않은 줄은 **➖** 이다.

### 3.0 테스트 진행 현황 (2026-10-08, 첫 수동 테스트 후)

**범례** ✅ 사람이 확인해 통과 · 🟡 일부만(또는 Claude가 확인, 사람 확인 대기) · ❌ 사람이 확인해 실패 · ➖ 아직 안 해 봄. 아래는 이번 첫 테스트(런북 §2 단계 1~5까지)에서 **사람이 직접 본 것**만 반영한 표입니다.

| 영역 | 결과 | 비고 |
| :--- | :--- | :--- |
| 예약 요청 → 수락 → Confirmed (BOOK-1) | 🟡 | 진행은 됨. 실시간 갱신 ❌ (FLOW-1) |
| 시간 · 장소 변경 (BOOK-2) | 🤖 (FLOW-7 · 8 · 9 · FLOW-9b) + SQL `rls_smoke` CR-2 · 사람 확인 대기 | 시트가 Drop-off · Pick-up 값을 각각 유지하고 한 번에 Send, 끝난 인수인계는 비활성 (FB-5 · FB-6). 확정 뒤 일정 전체를 옛 기간 밖으로 옮기면 두 제안이 한 쌍으로 수락 · 거절됨 (`012c`, CR-2 — 호스팅 DB 적용 10/13) — 사람이 다시 확인 필요 |
| 체크아웃 · 결제 (BOOK-5) | ❌ → 다시 확인 필요 | 요금표 없음이 원인이었음 — **10/08 Chloe 요금 행을 임시로 넣어 풀림**(견적 $268.13 확인). 예약을 새로 만들거나 기존 예약의 Finish booking을 다시 눌러 보세요 (FLOW-3) |
| Received → Returned (BOOK-4) | 🤖 (FLOW-5 · 6) · 사람 확인 대기 | 시터 Bookings **In progress** 탭 추가 (FB-8) — 사람이 다시 확인 필요 |
| 날짜 · 시간 입력 통일 (FLOW-10) · 이름 옆 역할 표시 (FLOW-11) · 입력칸 힌트 (FLOW-12) | ❌ | 모양 · 통일 |
| 데모 로그인 (NAME-2) | 🟡 | Claude 확인 |
| **REPORT · CAP · INQ · DONE · UX-1~4 · NAME-1 · 3~5** | ➖ | 체크아웃이 막혀 아직 못 감 (INQ · UX-1~4 일부는 막히지 않음) |

피드백과 고치는 아이디어: [feedback-2026-10-08.ko.md](feedback-2026-10-08.ko.md).

### 3.1 오너 — 돌봄 할 일 (CARE)

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| CARE-1 | Demo owner → Home → Max → 아래 **Care tasks** → **Add task** → Medication, 이름·용량 입력 → Save | "Added …" 토스트, 목록에 "8:00 AM · every day · 용량" | 🤖 `care-tasks` | 🟡 10/04 Claude가 실 DB로 확인 — 사람 확인 필요 |
| CARE-2 | Mochi(고양이)에서 Add task | **Walk가 목록에 없음** (Litter는 있음). Max는 반대 | 🤖 `care-tasks` | ✅ 10/04 민식 |
| CARE-3 | 이름을 비우고 Save | "Give the task a name." | 🤖 `care-tasks` | ➖ |
| CARE-4 | 태스크 **Pause** → **Resume** → **Delete**(확인 시트) | Paused 표시 → 복귀 → 취소하면 남고, 확인하면 사라짐 | 🤖 `care-tasks` | ➖ |
| CARE-5 | **시간 칸을 탭** → iPhone처럼 **시 · 분 · AM/PM 휠**이 뜸. 손가락/마우스로 돌리거나 마우스 휠로 굴리거나, 줄을 눌러 고름 → Set | 가운데 띠에 멈춘 값이 선택됨 (예: 8:05 PM). + 버튼 없이 바로 | 🤖 `care-tasks` | ➖ |
| CARE-6 | 목록의 **태스크를 탭** → 이름 · 용량 · 시간 · 메모 수정 → Save changes | "Saved …" (시간을 바꾸면 "Saved — now at 6:45 PM"). **종류는 잠겨 있음** | 🤖 `care-tasks` | ➖ |
| CARE-7 | 시터가 아직 안 한 오늘 할 일의 **시간을 바꾸거나 Pause** | 시터 화면에서 옛 시각의 할 일이 사라지고 새 시각으로 나타남 (Missed로 남지 않음) | SQL `rls_smoke` · **실제 확인 👤** | ➖ |
| REQ-1 | Home → Max → Care tasks → **✍️ Write a care checklist** (돌보는 중이면 "care request") → 칩 **Meals** | 글상자는 **비어 있고 연한 힌트**("1 cup of kibble")만 보임. 비워 두고 Add line 하면 힌트 문구가 쓰임. 고양이는 **Walk 칩이 없음**. 칩마다 기본 문구가 다름 | 🤖 `care-request` | ➖ |
| REQ-2 | 시간 선택: **At a time**(휠) 또는 **Several times**(− 3 times +) — 둘 다 **Every day / Once** 선택 → **Add line** | 줄이 위 목록에 쌓이고 **새 칩 줄**이 이어서 나타남. Several times는 하루에 균등 배치(8 AM · 2 PM · 8 PM) 후 표에서 시간 수정 가능. **Heads-up** 칩은 글만 입력 | 🤖 `care-request` | ➖ |
| REQ-3 | **Make a checklist** | **표**(Time · Task)가 나타남. 줄마다 AI가 따로 다듬음(이름 · 용량 · 메모) — AI가 안 되거나 거절하면 내가 쓴 그대로 남고 **에러 없이** 진행. AI가 뺀 항목은 **빨간 "Left out" 박스**(탭하면 사라짐). 다시 줄을 쓰고 **Add to the checklist**로 같은 표에 추가 | 🤖 `care-request` · **실제 AI 👤** | ➖ |
| REQ-4 | (돌보는 중이 아닐 때) 표가 만들어지는 순간 | **자동 저장**: "Saving…" → **"✓ All changes saved"**. 이름 · 용량 · 시간 고치면 저장됨. 펫 화면 Care tasks에 바로 보임. **Save 버튼 없음**(Done만) | 🤖 `care-request` | ➖ |
| REQ-5 | 표에서 행 **Remove** | 바로 삭제 저장 + 아래 **"Removed … · Undo"** 8초. Undo → 행이 돌아오고 다시 저장됨 | 🤖 `care-request` | ➖ |
| REQ-6 | 한 번에 13개 이상 / 글 없는 줄 | 글이 없으면 **Add line** 비활성. 12개 초과면 "A checklist holds 12 tasks…" 팝업 | 🤖 `care-request` | ➖ |
| REQ-7 | **돌보는 중**(수락된 예약, 아직 픽업 전)인 펫에서 같은 화면 | 제목이 **"Write a care request"**, 자동 저장 없음("Nothing changes until Chloe approves"). **Send request to Chloe** → 토스트, 펫 화면에 "⏳ Waiting for Chloe…". 승인 전엔 Care tasks에 아무것도 안 생김. 대기 중엔 또 보낼 수 없음 | 🤖 `care-request` · SQL `rls_smoke` | ➖ |
| REQ-8 | 시터: Home에 **"📝 Care request for Max — tap to answer"** 줄(또는 알림) → 요청 화면 → **Approve** | 할 일 · Heads-up이 Max에 생성(한 번만 하는 건 once). 오너에게 "approved" 알림 | 🤖 `care-request` · SQL | ➖ |
| REQ-9 | 시터: **Decline or reply…** → 이유 칩(선택) 및/또는 **노트**(200자) → Decline | 아무것도 생성 안 됨. 오너 알림 본문에 이유 + 노트. 이유도 노트도 없으면 Decline 비활성 | 🤖 `care-request` · SQL | ➖ |
| REQ-10 | **실제 두 계정**: 오너가 요청 → 시터 화면 확인 → 답변 → 오너 확인 | 위 흐름이 새로고침 없이 이어짐(시터 알림 · 오너 알림) | **👤만** | ➖ |
| REQ-11 | 시터: 노트를 쓰면 **Counter-request** 상자가 나타남 → 추가 비용($, 선택) + "이 할 일은 오너가 해 주세요" 선택 → **Send counter-request** | 아무것도 생성 안 됨, 요청은 열린 채(오너가 답하기 전엔 새 요청 불가). 오너에게 알림 | 🤖 `care-request` · SQL | ➖ |
| REQ-12 | 오너: 펫 화면 **counter-reply 상자** (노트 · Extra fee · "You'd do yourself: …") → **Accept** / **Decline** | Accept → 시터가 맡기로 한 할 일 + Heads-up만 생성(오너가 하기로 한 할 일은 제외), 시터에게 알림. Decline → 닫힘, 아무것도 생성 안 됨. (비용은 기록·표시만 — 데모엔 추가 결제 없음) | 🤖 `care-request` · SQL | ➖ |
| REQ-13 | 돌보는 중(수락된 예약, 아직 픽업 전)인 펫의 펫 화면 | **Add task 버튼이 없음**, Heads-up의 직접 입력칸도 없음("A stay is on — … care request로"). 서버도 거절(오너가 직접 추가 시 42501). 이미 있는 할 일의 **수정 · 삭제는 그대로** 가능. 집에 있는 펫은 예전처럼 직접 추가 | 🤖 `care-request` · SQL `rls_smoke` | ➖ |
| HEADS-1 | 오너: 펫 화면 맨 아래 **Heads-up** 칸 → 문구 입력 → **Add Heads-up** | 칩으로 추가됨, 입력칸 비워짐. 같은 문구(대소문자만 다름)를 또 넣어도 중복 안 됨. 칩의 ✕ → 삭제. 없으면 "None yet…" 안내 | 🤖 `heads-up` | ➖ |
| HEADS-2 | 시터 Home (돌보는 중) | **한 줄 카드** "⚠️ Max: Text instead of knocking  +2". 카드를 누르면 펫별(+오너 이름)로 전부 보임. Home은 여전히 한 화면 | 🤖 `heads-up` | ➖ |
| HEADS-3 | 시터: 예약 상세(요청 수락 전 포함) | 펫 카드 **맨 위에 "⚠️ Heads-up" 상자**. 꺼 둔(inactive) 것은 안 보임, 없으면 상자 자체가 없음 | 🤖 `heads-up` | ➖ |
| HEADS-4 | 케어 요청서에서 저장한 Heads-up | 오너 펫 화면 · 시터 Home · 예약 상세에 **같이** 나타남 | 🤖 (각각) · 전체 흐름 👤 | ➖ |

### 3.2 시터 — 오늘 할 일 (TASK) · *사전: 오너가 태스크를 만들어 둠*

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| TASK-1 | Demo sitter → Home → **All tasks** | 오늘 시각의 태스크가 시간순, 위에 "N left · M done"과 **Next up**. 일시중지한 태스크는 없음 | 🤖 `sitter-tasks` | ➖ |
| TASK-2 | 할 일의 **Done** | **팝업**이 뜸(메모 칸 · 📷 Add photo · Done). 이 시점엔 아무것도 전송되지 않음 | 🤖 `sitter-tasks` | ➖ |
| TASK-3 | 팝업에서 메모 없이 **Done** | "… done. Robert was told" 토스트, **할 일이 목록에서 사라짐**, "Done today (N)"에 나타남. 오너 알림 제목은 **한 일**(예: "Max had breakfast on time 🍽️"), Feed 새 글 없음 | 🤖 `sitter-tasks` | ➖ |
| TASK-4 | 팝업에 **메모를 쓰고 Done** | 오너 알림에 **한 일(제목) + 메모(본문)** 이 같이 감 — 무엇에 대한 메모인지 알 수 있음 | 🤖 `sitter-tasks` · SQL | ➖ |
| TASK-5 | 팝업 **📷 Add photo** → 찍기/고르기/샘플 → 미리보기 → Use this photo → Done | 업로드 + 완료. 오너 Feed에 사진 글. 알림은 `task_done` 하나 | 🤖 `sitter-tasks` · **실제 업로드 👤** | ➖ |
| TASK-6 | 미리보기에서 **Retake** | 선택 화면으로 복귀, 아무것도 올라가지 않음 | 🤖 `sitter-tasks` | ➖ |
| TASK-7 | 업로드가 **실패**하면 | **빨간 팝업이 닫을 때까지 남음** + Try again. 팝업의 메모는 유지, 완료는 안 됨. Try again → 성공 | 🤖 `sitter-tasks` · **실제 환경 👤** | ➖ |
| TASK-8 | 예정 시각이 60분 넘게 지난 미완료 할 일 | ⚠️ Missed 배지 (60분 안이면 ⏳ Pending) | 🤖 `care-tasks` | ➖ |

### 3.3 시터 — Home 대시보드 · 빠른 체크인 (HOME / CHK)

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| HOME-1 | 돌보는 중에 시터 Home | 앞면이 **Today**(기본): 초록 히어로(**Next · 시각** · "Max · Breakfast" · N of M done today · **Complete with photo**) · Heads-up 알약 한 줄(펫이 여럿이면 "Max: …", "+N") · **Quick check-in · 펫 이름** 타일 4개(Ate · Potty · Walk · Mood, 고양이는 Walk 대신 Nap) · **5-second check** · **Treat check** 카드 · All tasks / My history 링크. 펫이 여럿이면 이름 칩으로 대상 선택. 회전 버튼으로 뒷면 **픽셀 펫 방**(밥 · 산책 · 응가 · 낮잠). 돌보는 중이 아니면 Pager 없이 요청 · 오늘 인계 · 다가오는 예약 | 🤖 `sitter-home` · `pet-room-sitter` | 사람 확인 대기 |
| HOME-2 | 히어로의 **Complete with photo** | 완료 시트(메모 · 사진) → Done → "1 of 4 done today"로 오르고 다음 할 일이 히어로로. 시간이 된 건 "Due now" · 알람 팝업 | 🤖 `sitter-home` · `due-reminder` | ➖ |
| HOME-3 | 링크 **All tasks · My history**, 카드 **5-second check · Treat check** | 각각 해당 화면으로(5-second check는 고른 펫의 체크인 화면 + 📸 Photos, Treat check는 Snap의 Treat check) | 🤖 `sitter-home` | ➖ |
| HOME-4 | **My history** | 내가 끝낸 할 일 · 보낸 체크인(펫 이름 포함)이 최신순. 시간이 지난 미완료는 ⚠️ Missed로 | 🤖 `sitter-home` | ➖ |
| HOME-6 | 할 일 💤 스누즈 중에 Home | 히어로에 **"💤 Snoozed until 11:43 AM"** (할 일의 예정 시각은 그대로) | 🤖 `due-reminder` | ➖ |
| HOME-7 | Quick check-in 타일을 **한 번 탭** | 타일 위에 선택지가 뜸(첫 번째가 강조). Ate: Ate everything · Left a little · Didn't eat · Other / Potty: All done · Soft stool · Other / Walk: Short ~5분 · Mid ~15분 · Long 30분+ / Nap: Nap · Awake / Mood: 8개(Happy · Playful · Excited · Calm · Tired · Missing you · Sad · Anxious). 하나 누르면 바로 전송 + "Sent. Robert was told" | 🤖 `sitter-home` | 사람 확인 대기 |
| HOME-8 | 같은 타일을 **빠르게 두 번 탭** (0.4초 안) | 첫 번째 선택지가 바로 전송됨(Ate = Ate everything, Potty = All done, Walk = Short, Mood = Happy). 느리게 두 번째를 누르면 선택지만 닫힘 | 🤖 `sitter-home` | 사람 확인 대기 (터치 · 마우스) |
| HOME-9 | **Other** 선택 | 메모 시트(최대 120자). 비어 있으면 Send 비활성. 보낸 글이 보호자 알림 본문이 됨 | 🤖 `sitter-home` · SQL smoke `015i` | ➖ |
| HOME-10 | 산책 시작/종료로 거리 · 장소 기록 | **아직 없음** (#339). 지금 Walk는 Short / Mid / Long 기록만 | ➖ | ➖ |
| HOME-11 | 돌보는 중에 시터 Home, 히어로(Next 카드) 바로 아래 | **알러지 배너**(경고색): 맡은 모든 펫의 알러지가 펫별 한 줄씩(\"Max: No chicken\"). 체크인 대상 펫을 바꿔도 그대로 보임. 알러지가 없는 펫은 줄 없음, 아무도 없으면 배너 없음 | 🤖 `sitter-home` | 사람 확인 대기 |
| HOME-12 | Ate · Walk · Potty 체크인을 보냄 | 그 펫의 오늘 **가장 이른 미완료** 같은 종류 할 일(밥 · 산책 · 화장실)이 시간 전이어도 완료 처리, 히어로의 다음 할 일이 넘어가고 N of M이 오름. **Didn't eat은 완료 안 함**. 보호자에게는 체크인 알림 하나만(할 일 알림 따로 안 감) | 🤖 `sitter-home` · DB `015i` 호스팅 미적용 | 사람 확인 대기 |
| HOME-13 | 타일에 보낸 기록 | 오늘 보낸 타일에 **✓ 시각**. 전체 목록은 My history | 🤖 `sitter-home` | ➖ |
| HOME-14 | Quick check-in 타일 아래 **Today's checklist · N of M** | 오늘 할 일 전부(펫 이름 · 시각 · 용량), 동그란 칸을 **한 번 누르면** 메모 · 사진 없이 완료, 줄을 누르면 완료 시트(사진 · 메모). 제목 줄(▾)을 누르면 목록이 **접히고 펴짐**(개수는 제목에 그대로). 끝난 건 체크 + 흐리게. **맡은 시간 밖의 할 일**(첫날 맡기기 전 아침 등)도 흐린 줄 \"Outside the stay hours\"로 함께 나오고 N of M에 들어감 → 보호자 Today's care와 같은 총 개수 | 🤖 `sitter-home` | 사람 확인 대기 |
| REM-1 | 시터 Home을 연 상태에서, 시간이 된(지난 지 1시간 안) 할 일이 있음 | **"⏰ Due now" 알람 팝업**이 화면 가운데 뜸(소리 · 진동 시도). **Done**으로 바로 완료, 팝업 뒤 Home엔 Today 목록이 그대로 | 🤖 `due-reminder` · 소리/진동 **👤** | ➖ |
| REM-2 | 앱을 켜 둔 채로 다음 할 일 시간이 됨 (30초마다 확인) | **"⏰ Time for Dinner · Max"** 토스트가 한 번 뜸. 이미 시간이 지난 할 일들 때문에 앱을 켤 때 토스트가 쏟아지지는 않음 | 🤖 `due-reminder` · **실제 시계 👤** | ➖ |
| REM-3 | 팝업의 **Dismiss** | 다음 할 일 팝업으로 넘어감. 1시간 넘게 지난 것은 **"⚠️ Overdue"**. 모두 닫으면 팝업 사라짐 | 🤖 `due-reminder` | ➖ |
| REM-4 | 급한 게 여러 개 | 가장 이른 것 하나 + "+ N more waiting — see all tasks" (누르면 전체 할 일) | 🤖 `due-reminder` | ➖ |
| REM-6 | 팝업의 **💤 Remind me in 10 min** | 팝업이 사라지고 Today 카드 줄에 **"💤 Snoozed until …"**. **새로고침해도 유지**. 10분 뒤 **"⏰ Still waiting: Dinner · Max"** 토스트와 함께 팝업이 다시 뜸 | 🤖 `due-reminder` | ➖ |
| REM-5 | **실제 시계로**: 오너가 2~3분 뒤 시각의 할 일을 만들고, 시터는 Home을 연 채 기다림 | 30초 안에 Today 목록에 나타나고, 그 시각 정각에 토스트 + 팝업 | **👤만** | ➖ |
| HOME-5 | (돌보는 중이 아닐 때) 시터 Home | 요청 배너 · 오늘 인계 · 다가오는 예약이 짧게 | 🤖 `today` | ➖ |
| CHK-1 | 체크인 화면 → Max의 Meal **All** 누르기 (메모 비움) | 버튼이 **"✓ All"** 로 선택만 됨(**아직 전송 안 됨**), "Ready to send: …" 안내, 다시 누르면 선택 해제. **Send**를 눌러야 전송 → 토스트 "Sent ✅", 오너 알림 "Max ate everything 🍽️" | 🤖 `quick-checkin` | ➖ |
| CHK-2 | 카드 아래 **"Sent to Robert today"** 목록 | 방금 보낸 것이 시각과 함께 쌓임 (메모는 따옴표로) | 🤖 `quick-checkin` | ➖ |
| CHK-3 | 메모 칸에 글을 쓰고 Meal **A little** | 오너 알림: **보낸 것(제목) + 메모(본문)**. 전송 후 메모 칸 비워짐 | 🤖 `quick-checkin` | ➖ |
| CHK-4 | 아무것도 고르지 않고 메모만 쓰기 | 메모가 없으면 **Send 비활성**. 메모를 쓰면 "Ready to send as a note" → Send로 노트 전송 | 🤖 `quick-checkin` | ➖ |
| CHK-5 | Max에는 Walk 10–60분 있음, Mochi에는 **없음** | 펫마다 체크인 화면이 따로, 고양이는 산책 없음 | 🤖 `quick-checkin` | ➖ |
| CHK-6 | **📷 Add photo** → 선택 → 미리보기 → Use → Mood **Happy** | "Photo ready ✓", 전송 시 업로드. 오너 Feed에 사진 글 + 체크인 알림 하나 | 🤖 `quick-checkin` · **실제 업로드 👤** | ➖ |
| CHK-7 | 전송이 **실패**하면 | 빨간 팝업이 남고 Try again으로 다시 보냄 | 🤖 `quick-checkin` | ➖ |

### 3.4 Feed · 공개 범위 (FEED / VIS)

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| FEED-1 | 시터: Feed 탭 → Max → **+ Photo** → 샘플 | "Shared with Robert", 그리드에 새 사진 | 🤖 `media-picker` | ➖ |
| FEED-2 | **두 브라우저**: 일반 창 = 오너, 시크릿 창 = 시터. 시터가 올림 | 오너 화면에 **새로고침 없이** 토스트 + 벨 숫자 + Home 카드 + Feed 카드 (≤ 3초) | **👤만** (실시간) | ➖ |
| FEED-3 | 오너: 사진 탭 | **탭한 그 사진**이 전체화면. ‹ › 버튼, 스와이프, ←/→ 키 이동 | 🤖 `feed` | ➖ |
| FEED-4 | 영상 샘플 (Fetch play) 재생 | 오너 전체화면에서 재생 | 👤 | ➖ |
| FEED-5 | 시터가 **자기 사진** 열기 → 🗑️ → 확인 | "Photo deleted", 오너 Feed에서도 사라짐. 오너 화면에는 시터 글의 🗑️ **없음** | 🤖 `feed` · 파일 삭제는 pytest | ➖ |
| FEED-6 | 사진 업로드가 **실패**하면 | 빨간 팝업이 남고 Try again | 🤖 `media-picker` | ➖ |
| FEED-7 | 샘플 트레이: 사진을 고르는 곳을 연다(시터 · 오너 Feed, Diary 오너 글, 작업 사진, 알림장, 프로필, Snap Mood · Sticker) | 같은 사진 모음이 보인다: 일상 3장 + 영상(Fetch play), 강아지 6장, **고양이 5장**(Orange cat · Wary cat · Blank stare · Curious cat · Belly up). Mood는 영상 · 강아지 · 고양이 · 일상 순, Sticker · 프로필은 영상 없이. Treat check는 라벨 4장만. 트레이가 길면 스크롤 | 👤 | ➖ |
| VIS-1 | 시터: **Share with Robert** 칩 끄기("Only you") → 사진 올리기 | "Saved just for you", 🔒 배지. **오너는 못 봄**, 알림 없음 | 🤖 `media-picker` · SQL | ➖ |
| VIS-2 | 오너: Feed → **+ Photo** (기본 "Only you") | "Saved just for you". 시터는 못 봄 | 🤖 `media-picker` · SQL | ➖ |
| VIS-3 | 오너: "Visible to sitter" 켜고 올림 | 당직 시터가 알림 "Robert shared a photo of Max 📸" → 탭 → 시터 Feed → Max, 사진 보임 | 🤖 SQL · e2e (알림 이동) | ➖ |

### 3.5 알림 (NOTIF)

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| NOTIF-1 | 오너: 벨 → 알림 목록 | **둥근 카드** 한 장씩, 최신순, 안 읽은 것 강조, 벨 숫자 | 🤖 `feed` | ➖ |
| NOTIF-2 | 알림 탭 | 읽음 처리 + 해당 화면 (`feed_post` → Feed, 할 일 · 체크인 → **History**), **그 알림의 펫**으로 열림(Mochi 알림 → Mochi). 사진/메모가 있으면 **먼저 크게 보여 주고** 닫으면 이동 | 🤖 `feed` · `live-updates` | ➖ |
| NOTIF-8 | 사진이 달린 알림 | 목록/카드 오른쪽에 **작은 사진 썸네일**. 탭 → 큰 사진 + 메모 시트. **Close는 그냥 닫힘**, "See in History" 버튼을 눌러야 History | 🤖 `live-updates` · 실제 사진 **👤** | ➖ |
| NOTIF-3 | **Mark all as read** | 숫자 사라짐 | 🤖 `feed` | ➖ |
| NOTIF-4 | 알림 한 줄을 **왼쪽으로 60% 넘게 밀기** | 카드와 같은 **둥근 모양의 빨간 Delete**가 드러나고, 놓으면 사라지며 삭제됨(가만히 있을 땐 빨간 부분이 안 보임). 벨 숫자 갱신 | 🤖 `feed` | ➖ |
| NOTIF-5 | 알림 한 줄을 **덜 밀다 놓기** | 제자리로 돌아오고 유지됨. 탭은 여전히 열림 | 🤖 `feed` | ➖ |
| NOTIF-6 | **Clear all** → 확인 | 확인 시트("Clear 2 notifications") 후 전부 삭제, "You're all caught up." | 🤖 `feed` | ➖ |
| NOTIF-7 | 한꺼번에 사진 여러 장 | 토스트는 "3 new photos" 하나로 합쳐짐 | 👤 | ➖ |

### 3.6 오너 Home · History · Diary (LIVE / HIST)

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| LIVE-1 | 시터가 할 일 · 체크인 · 사진을 남긴 뒤 오너 Home (돌보는 중) | 초록 히어로 아래 **Latest from 시터** 카드 한 장(최신 1건). 탭하면 그 항목이 **History에서 바로 열림**(사진이면 큰 사진 시트), 알림장이면 그 알림장. Home에 Live updates 목록은 없음(벨 → Notifications) | 🤖 `live-updates` | ➖ |
| LIVE-2 | 벨 → Notifications | 읽지 않은 알림은 굵게, 밀어서 삭제 · Mark all as read · Clear all, **History** 링크(알림이 없을 때도 있음) | 🤖 `live-updates` | ➖ |
| LIVE-6 | 시터가 아무것도 기록하지 않은 날 오너 Home (돌보는 중) | 타일이 **0/0 care done · 0 photos today · 0m of walks** | 🤖 `live-updates` | ➖ |
| LIVE-7 | 오너 Home (돌보는 중) | 초록 히어로 "Max is with Chloe" · Day N of M · 오른쪽 **시터 사진**(없으면 이니셜), 탭하면 시터가 올린 사진 전부(여러 장은 옆으로 넘김) · **Today's care N of M done** 진행바(할 일 개수만큼 칸, 개수에 따라 칸 너비가 늘고 줄어듦; 할 일이 없으면 0 of 0. 총 개수 = 맡은 모든 펫의 오늘 할 일 합계(맡기기 전 시각 포함), Heads-up은 할 일이 아니라 안 셈). 집에 있는 펫은 히어로에 안 나옴. 돌봄 중이 아니면 히어로 · 타일 · Latest 없이 Your pets만 | 🤖 `live-updates` | ➖ |
| LIVE-8 | 시터가 요청을 **Decline** 함 | 오너 **Notifications**에 읽지 않은 알림. 탭 → 노트 시트(**Close는 그냥 닫힘**). 답은 펫 화면 빨간 상자에 남음. (Home에 고정되던 카드는 없어짐) | 🤖 `care-request` | ➖ |
| LIVE-9 | 시터가 **Counter-request** 를 보냄 | Notifications에 알림. 탭 → 노트 시트 → 펫 화면에서 Accept/Decline | 🤖 `care-request` | ➖ |
| LIVE-5 | **두 브라우저**: 오너가 Home을 연 채 시터가 체크인 | 오너 Home에 **새로고침 없이** 카드 추가 | **👤만** (실시간) | ➖ |
| HIST-1 | Home의 **See today's updates** 또는 Notifications의 **History** | 오늘 · 어제 · 날짜별 **최신순**, 줄마다 이모지 · 문구 · 시각 · 사람 · 썸네일 | 🤖 `diary` | ➖ |
| HIST-2 | 사진과 함께 완료/체크인 | 같은 사진이 **한 줄로만** (Feed 사진과 중복 안 됨) | 🤖 `diary` | ➖ |
| HIST-3 | 메모가 있는 체크인 / 7일보다 오래된 기록 | 메모가 줄 아래에 보임 / 오래된 건 안 보임 | 🤖 `diary` | ➖ |
| HIST-4 | 시간이 지난 미완료 할 일 | ⚠️ "… · Missed" | 🤖 `diary` | ➖ |
| HIST-5 | 줄 탭 | 사진이 있으면 크게, 없으면 상세(시각 · 사람 · 메모) | 🤖 `diary` | ➖ |
| HIST-6 | 펫이 둘이면 칩으로 전환 | 펫마다 자기 기록만 | 🤖 `diary` | ➖ |
| DIARY-1 | 오너 **Diary 탭** | "시터가 하루를 정리해 쓰면 여기에 나타나요" 안내 + Open History 버튼 + ✏️ Write a page (DBK-11) | 🤖 `live-updates` | ➖ |
| DIARY-7 | (이전 화면에서 확인) 새로고침 없이 새 줄 추가 | 같은 동작이 이제 **Home 카드(LIVE-5)** 로 옮겨감 — 재확인 | **👤만** | ✅ 10/04 민식 (이전 Diary 화면) |

### 3.7 보안 · 권한 (SEC) — 실제 DB에서 👤

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| SEC-1 | 다른 오너 계정으로 로그인 | Robert의 Max/Mochi 피드 · 알림 · 체크인이 **보이지 않음** | SQL `rls_smoke` | ➖ |
| SEC-2 | 시터로 `/owner` 주소를 직접 입력 | 시터 화면으로 되돌아감 | 🤖 `auth` | ➖ |
| SEC-3 | 오너가 체크인 · 할 일 완료를 API로 직접 시도 | 거절 (돌봄 구간의 시터만 가능) | SQL `rls_smoke` | ➖ |
| SEC-4 | 데모 계정으로 로그인 → 브라우저 콘솔에서 `supabase.auth.updateUser({ password: 'x12345' })`, 이메일 변경도 | 둘 다 오류(Database error). 로그아웃 뒤 원래 데모 비밀번호로 다시 로그인됨. 일반 계정은 비밀번호를 바꿀 수 있음 | SQL `rls_smoke`(014z) | 👤 호스팅 DB에 `014z` 적용 뒤 |
| SEC-5 | `014z` 적용 뒤 `python -m scripts.seed_demo` | 모든 데모 계정 `updated ... ok`, 끝나면 다시 잠김(SEC-4가 여전히 오류) | pytest `test_seed_demo` | 👤 |
| SEC-6 | 새로 가입한 계정으로 AI 기능(채팅 칩, Snap 등)을 하루에 100번 넘게 | 101번째부터 429 "Daily AI limit reached. Try again tomorrow."(code `rate_limited`). 업로드 서명도 따로 100번. 다음 날(UTC) 다시 됨 | pytest `test_limits`(모든 AI 라우트 · 서명 라우트) | ➖ |

### 3.8 예약 · 미팅 · 결제 (BOOK) — 이전 Phase, 자동 테스트가 촘촘함

| ID | 확인 내용 | 자동 | 상태 |
| :--- | :--- | :--- | :--- |
| BOOK-1 | 예약 요청 → 시터 수락 → 확정. **이미 만난 사이(단골)** 는 버튼이 **Accept** 하나, **처음 만나는 사이**는 BOOK-8 ~ 9의 **Next → Meet & Greet → Confirm booking** (같은 동작, 이름만 다름) | 🤖 `booking` · `sitter-bookings` · `meet-greet` | 🟡 10/08 민식: 요청 → 수락 → Confirmed까지 진행됨 (오너 화면이 실시간으로 안 바뀜 → FLOW-1) |
| BOOK-2 | 시간 · 장소 협상, 확정 후 변경 | 🤖 `negotiation` | ❌ 10/08 민식 — 시간 변경 시트에서 값이 날아감 · "That handoff already happened." (FLOW-7~9) → 고침, 다시 확인 필요 |
| BOOK-3 | 첫 만남 미팅 (제안 · 수락 · 건너뛰기). **사전 조건:** 시터가 먼저 Next(BOOK-9)를 눌러 홀드가 걸려 있어야 함. 그 전에는 오너 화면에 일정 · 건너뛰기 버튼이 없고, API로 시도하면 `interest_required` | 🤖 `meet-greet` | ➖ |
| BOOK-4 | Received → Returned, 취소 · 새 시터 찾기 | 🤖 `handoff` · `rebook` | ❌ 10/08 민식 — Returned가 확인 없이 바로 처리됨 (FLOW-6) |
| BOOK-5 | 견적 → 동의서 → 데모 결제 → 출입 정보 잠금 해제 | 🤖 `checkout` · SQL | ❌ 10/08 민식 — Finish booking → "This sitter doesn't offer that service." (`sitter_rates` 비어 있음, FLOW-3) |
| BOOK-6 | **영상 미팅 Google Meet 링크** (앱에서). 링크는 호스트(Goldito 계정) 승인 없이 **바로 입장**돼야 함 (다른 계정, 시크릿 창으로 확인). **Join Google Meet** 버튼은 Safari에서도 눌려 새 탭이 열려야 함 (진짜 `<a>` 링크) | 🤖 `test_meet_greet.py` (방 열기 호출 · 실패해도 링크 유지) · `meet-greet.spec.ts` (버튼이 `href` · `target=_blank` 링크) · Safari에서 실제 클릭과 입장은 **👤** | ➖ |
| BOOK-7 | 시터가 요청의 **Decline** → 시트에서 사유 칩(여러 개 가능) + 짧은 메모(≤ 200자, 선택)를 입력 → **Decline request**. 칩 · 메모 없이도 거절됨. 시트의 **Suggest another time instead**는 거절하지 않고 시간 제안 시트를 연다 (FB-35) | 요청이 Declined로 Past에 가고, 오너에게 "Chloe declined your booking request" 알림(본문 = 사유 · 메모)이 오며, 오너의 예약 상세에 **"Chloe can't take this one."** 아래 인용으로 사유가 보임. 사유 · 메모가 없으면 인용 줄이 없음. 거절 · 취소된 예약에는 헤더 카드와 안내 줄 사이에 **빈 카드가 없음**(오너 · 시터 둘 다, 진행 중 예약은 단계 막대 그대로) | 🤖 `sitter-bookings` · SQL `rls_smoke` | ➖ |
| BOOK-8 | **첫 만남 쌍의 첫 동의.** 오너가 처음 만나는 시터에게 요청 → 시터 상세 | 시터 화면 맨 위에 **단계 막대**(Request · M&G · Confirm · Pay · Care, #237)와 "Your turn", 버튼은 **Next / Decline**(Accept 없음). 오너 화면은 **Request Meet & Greet / Skip Meet & Greet** 두 버튼(#236, MGCHOICE-1), 날짜는 아직 홀드 안 됨 | 🤖 `meet-greet` · `sitter-bookings` · SQL `rls_smoke` (011l) | ➖ |
| SCHED-1 | 시터 일정 · 오너가 보는 시터 프로필의 **달력** | 날짜 칸에 **M · A · N 글자가 없고** **날짜 칸 전체가 세 개의 가로 띠**(위부터 **Night · Afternoon · Morning** — 아래가 오전, 위가 밤, 날짜 숫자는 그 위). 예약할 수 없는 띠(막음 · 꽉 참 · 열지 않음)는 **연한 빗금**(세 띠가 같은 무늬로 이어짐), 열린 띠는 비어 있음. 지난 날은 흐리게(빗금 없음). 범례는 한 줄 **Available / Not available**. 날짜를 누르면 아래에 칸별 시간 · 상태("Morning: Open · 9:30 AM–1:00 PM", 막힌 이유 포함). 스크린리더 라벨에 세 칸 상태가 모두 있음. 네이티브는 빗금 대신 회색 칸(react-native-svg 없음) | 🤖 `schedule.spec.ts` (빗금 여부는 computed style) · 실제 폰 너비 👤 | 10/17 화면은 로컬 스크린샷으로만 확인 · 사람 확인 대기 |
| SCHED-2 | 시터 Schedule에서 날짜 범위 고르기 | **하나씩 클릭**(첫 클릭 = 하루, 두 번째 클릭 = 범위, 다음 클릭 = 다시 시작)해도 되고, **날짜를 누른 채 끌어서** 한 번에 고를 수도 있음(뒤로 끌어도 됨, 선택이 끌리는 대로 바뀜, 끝나고 손을 떼면 그 범위 유지 · 요약에 "3 days"). 끌기가 끝날 때 생기는 클릭은 선택을 다시 시작하지 않음. 지난 날짜는 범위에 들어오지 않음. 폰에서는 **길게 눌렀다가** 끌어야 하고, 그냥 쓸어 넘기면 화면이 스크롤됨. 오너가 보는 시터 달력은 하루만 고름 | 🤖 `schedule.spec.ts` (마우스 끌기 · 클릭) · 폰 길게 누르기는 👤 | 사람 확인 대기 (터치 끌기는 아직 실제 기기에서 안 봄) |
| SCHED-3 | 시터 Schedule **기본 열림** — 일정을 하나도 안 만든 시터 | 달력의 모든 날 · 세 시간대가 **열림**(프로필의 기본 시간 · 기본 마릿수), 오너 검색에도 나옴(이전엔 일정을 열어야만 나왔음). 날짜를 눌러 Open으로 저장하면 **그 날들만** 시간 · 마릿수가 바뀜. Open 시트에서 **일부 시간대만 체크하고 저장하면 체크를 끈 시간대는 그 날들에 닫힘**(예: 오전만 열면 그 날의 오후 · 야간은 Blocked, 이미 확정된 예약과 겹치면 취소 확인이 먼저 뜸). 날짜를 건드리지 않으면 전부 열림. 반복해서 닫으려면 아래 규칙 | 🤖 `schedule.spec.ts` · `sitters.spec.ts` · SQL `rls_smoke` (014d) | 사람 확인 대기 |
| SCHED-4 | Schedule 오른쪽 위 **⚙️ → Closing rules** | **요일 × 시간대(Morning · Afternoon · Night)** 격자에서 칸을 눌러 닫음(✕), 아래 **Hours**에서 세 시간대의 기본 시간을 30분 단위로 고침. **Apply** → "Rules applied ✅", 달력에 그 요일마다 해당 띠가 **빗금**("Closed · weekly rule"), 규칙 + 달력에서 직접 닫은 날이 **합쳐서** 적용. 아무것도 고르지 않고 Apply(또는 Open everything)면 규칙이 사라져 다시 전부 열림. 다시 열면 저장된 규칙 · 시간으로 시작. 시간이 맞지 않으면(끝 ≤ 시작) Apply 비활성. **이미 확정된 예약은 규칙이 취소하지 않음**(그 칸은 Full로 보이고 새 예약만 막힘) | 🤖 `schedule.spec.ts` · SQL `rls_smoke` (014d: 규칙 · 기본 열림 · 확정 예약 유지 · 권한) | 사람 확인 대기 |
| SCHED-5 | ⚙️ → Closing rules → **Hours**에서 **Every day · Sun … Sat** 칩 | **Every day**를 고르면 세 시간대의 기본 시간(전 요일 공통)을 고침. **요일 칩**을 누르면 그 요일만의 시간을 따로 고칠 수 있고(그 요일은 칩에 **•** 표시, "Mondays have their own hours."), 다른 요일은 Every day 시간 그대로. **Same as every day**로 그 요일의 개별 시간을 지움. Apply 후 달력에서 그 요일을 누르면 "Morning: Open · 9:30 AM–1:00 PM"처럼 요일별 시간이 보임. 우선순위: **날짜를 직접 연 행 > 요일별 시간 > Every day 시간**. 끝 ≤ 시작이면 "Morning on Wednesdays needs …"로 Apply 비활성. 요일 시간이 Every day와 같아지면 저장하지 않음 | 🤖 `schedule.spec.ts` · SQL `rls_smoke` (014e) | 사람 확인 대기 · 호스팅 DB에 `014e` 적용 후 |
| BOOK-9 | 시터가 **Next** | 토스트 "Dates held …", 오너에게 "Chloe would like to meet first" 알림. 막대 아래 "Day 1", 카드는 "These dates are on hold for Robert" / 오너는 "Chloe is holding your dates …"와 **Schedule Meet & Greet**. 시터 버튼은 **Confirm booking**(만나기 전까지 비활성). 두 번 눌러도 알림은 한 번 | 🤖 `meet-greet` · SQL | ➖ |
| BOOK-10 | 단골에게 Yes(첫 동의)를 API로 시도 | `interest_not_needed`. 첫 동의 전 오너의 일정 제안 · 건너뛰기는 이제 허용(#236, `015f`), 시터의 제안 · 답은 그 자리에서 첫 동의가 됨 | SQL `rls_smoke` | ➖ |
| BOOK-11 | **홀드와 한 번에 한 오너.** Chloe(기본 설정)에게 오너 A가 첫 동의를 받은 날짜에 오너 B가 요청 · 검색 · 문의 | B의 요청은 `sitter_unavailable`(날짜가 상세에), 시터 검색에 안 나옴, 문의 AI의 "can host"도 불가. 시터가 일정 막기로 덮으려 해도 거부. 시터 프로필에서 **Take pets from more than one owner at a time**을 켜면 정원(max pets) 안에서 허용. 오너에게는 시터 프로필 · 문의 시트 · 검색 결과에 "One owner at a time" / "Hosts several owners' pets" 배지 | 🤖 `profile` · SQL · pytest `test_inquiry` | ➖ |
| BOOK-12 | 만난 뒤 **오너가 Not this sitter**(사유 칩 + 짧은 메모) / 취소 · 거절 · 타임아웃 | 오너 버튼 이름이 첫 동의 뒤에는 **Not this sitter**(그 전에는 Cancel booking), 사유가 취소 이유로 저장되고 시터 화면에 "Robert passed: …" 표시. 취소되면 홀드가 풀려 다음 오너가 요청 가능 | 🤖 `meet-greet` · SQL | ➖ |
| BOOK-13 | **2일 · 3일 규칙.** 첫 동의 2일 뒤에도 만남 시간이 없음 → 알림 → 3일 더 무응답 | 양쪽에 "Still no time to meet …"(시간 잡기 · 건너뛰기 · 거절), 카드에 같은 문구. 3일 뒤 자동 취소(`meet_greet_timeout`), 홀드 해제, 양쪽 알림. 시간이 **agreed**가 되면 시계가 멈춤 | SQL `rls_smoke` (스윕) · pytest `test_sweep` · 실제 15분 cron은 👤 | ➖ |
| BOOK-14 | **결제 전 입구 정보 (ENTRY-1).** 견주가 하우스 시팅 예약, 또는 드롭오프 · 픽업이 **견주 집**인 예약의 체크아웃을 엶 (입구 정보 form이 비어 있음) → **Add entry info** → 자물쇠 코드 하나 저장 → 뒤로 | 견적 아래에 🔑 **"Add entry info"** 카드(시터가 문 앞에서 열 방법이 없다는 문장 + 버튼). 버튼이 `/owner/home-access`를 열고, 저장해서 돌아오면 카드가 사라짐. 시터 집 보딩, 또는 이미 입구 정보가 저장된 견주는 카드가 안 나옴. Pay는 막지 않음(경고만). **시터 쪽:** 입구 정보가 전부 빈 채로 열 시간이 오면 Show code 대신 **"{견주} hasn't added entry info yet — message them."** | 🤖 `checkout.spec.ts`(5개) | 사람 확인 대기 |

### 3.9 리뷰 버그 수정 (BF) — 2026-10-06 코드 리뷰에서 나온 버그

| ID | 확인 내용 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| BF-1 | 시터가 handoff 사진 업로드 (`purpose=handoff`) | 확정 예약의 시터만, 합의된 맡기기 2시간 전부터 찾기 2시간 뒤까지 서명 발급. 그 밖에는 403 (예전엔 없는 컬럼을 읽어 **항상 500**) | pytest `test_authz_handoff` | ➖ |
| BF-2 | 사진을 붙인 체크인 → Feed에서 그 글을 🗑️ 삭제 | 피드 글만 지워지고 **Diary · History의 체크인 사진은 남음** (예전엔 Cloudinary 파일까지 지워짐) | pytest `test_feed_delete` | ➖ |
| BF-2b | Diary 페이지 사진 칸에 넣은 피드 사진, 또는 Received(인계 사진 확인)에 쓴 사진 → Feed에서 그 글을 🗑️ 삭제 | 피드 글만 지워지고 **Diary 페이지 사진 · 인계 기록의 사진은 남음** (감사 2026-10-21 전엔 Cloudinary 파일까지 지워짐) | pytest `test_feed_delete` | ➖ |
| BF-3 | 오너 · 시터가 거의 동시에 영상 미팅 링크를 받음 / 시터가 영상 미팅이 잡힌 요청을 Decline | 링크(캘린더 이벤트)는 **하나만** 남고 알림도 한 번. Decline하면 캘린더 이벤트도 지워짐 | pytest `test_meet_greet` (Decline 후 삭제는 👤 — Google 계정 필요) | ➖ |
| BF-4 | 돌봄 중 오너가 보낸 요청에 시터가 답하기 전에 예약이 취소되거나 찾기(Returned)가 끝남 | 요청이 **closed** 로 닫혀 다음 요청을 막지 않고, 예전 시터는 더 이상 승인할 수 없음 (시터 화면: "The stay ended before this request was answered."). 돌봄 중에는 저장형 체크리스트(`save_care_request`)도 거절 | SQL `rls_smoke` (BF.4) | ➖ |
| BF-5 | 오너가 찾기 시간 변경을 보낸 뒤 시터가 먼저 Returned · 지난 시간 제안 수락 · 하우스시팅 장소 변경 | Returned가 남은 제안을 닫아 **완료된 인수인계가 다시 열리지 않음**(출입 정보도 다시 안 열림). 지난 시간은 수락 불가, 픽업 시간이 지난 요청은 **Expired**로 Past에. 하우스시팅은 시간만 바꿀 수 있음 | SQL `rls_smoke` (BF.5) · 🤖 `sitter-bookings` · `negotiation` | ➖ |
| BF-6 | 결제한 예약에서 찾기 장소를 오너 집으로 바꾸고 시터가 수락 / 찾기 시간을 늦추고 수락 | 오너 집 → 체크아웃이 다시 열림(결제 취소, 지난 견적 유지) + 오너에게 `checkout_needed` 알림, 예약 화면 배너 "Your stay changed — sign to finish", Checkout에서는 **home_access 하나만** 체크하면 결제 완료. 그 전까지 시터의 출입 정보는 잠김. 기간 변경 → 새 총액으로 다시 견적 + `price_updated` 알림(결제 상태 유지). 동의서는 체크아웃 중(확정 · 미결제 · 필요한 종류)에만 서명. 오너 주소·긴급 연락처는 결제 후에만 시터에게 보임 | SQL `rls_smoke` (BF.6) · 🤖 `checkout` | ➖ |
| BF-7 | BF-6처럼 체크아웃이 다시 열린 상태에서 오너 · 시터가 예약 화면을 엶 | 오너: 시터 집 카드(주소 · 주차 · 로비)가 그대로 보임. 시터: 맡기기 · 찾기 주소(펫을 데려다줄 오너 집 포함)가 그대로 보이고, 출입 정보 카드는 사라지지 않고 "Waiting for {오너} to sign"을 보여 줌(코드는 서명 전까지 잠김). 한 번도 결제하지 않은 예약은 예전처럼 주소가 안 보임 | SQL `rls_smoke` (BF.7) · 🤖 `checkout` | ➖ |

### 3.10 알림장 (REPORT) — Phase 07 · *사전: 시터가 돌보는 중, 오늘 체크인 몇 개, 백엔드 + `NEBIUS_API_KEY`*

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| REPORT-1 | 시터 → **Diary** 탭 | 펫이 둘 이상이면 맨 위 **펫 선택**(이름 + "Draft" / "Sent ✓") — 고른 펫 카드 하나만 보이고, 바꿔도 각 펫의 칩 · 줄이 남음 (FB-19). 카드 맨 위 **"Today: n tasks done · m missed · k check-ins"**, 그날 기록에서 만든 칩(식사 · 배변 · 산책 · 기분 · 약)이 모두 켜진 상태 | 🤖 `report` · pytest | ➖ |
| REPORT-2 | 칩을 눌러 **끄기** → **Write the report** | 미리보기에 **끈 칩의 내용이 없음**. 끈 칩은 서버로 `skip`으로 감 | 🤖 `report` · pytest | ➖ |
| REPORT-3 | **✎ Fix a recorded value** → 식사를 Most로, 산책 30 min으로 | 칩 문구가 "Meal: Most" · "Walk: 30 min"으로 바뀌고 알림장에도 그 값이 쓰임. 그 칩을 끄면 고친 값도 안 감 | 🤖 `report` · pytest | ➖ |
| REPORT-4 | **Anything to add?** 칸에 짧은 줄("Learned a new trick") → Add(또는 Enter), 몇 줄 더 | 줄마다 내 칩이 생기고 칸은 비워짐. 켜 두면 알림장에 **맨 앞**으로 반영, 끄면 빠짐. 내 칩만 **×**로 지울 수 있음(제안 칩은 끄기만). 칸을 비우면 아무것도 안 생김 (FB-16 · 17 · 18) | 🤖 `report` | ➖ |
| REPORT-5 | **📷 Add photo** (최대 2장) → 사진 추가 | 사진 묘사 한 줄 + 에피소드 칩 1–2개가 생김(📷 표시). 사진을 지우면 그 칩도 사라짐. 사진 칩을 전부 끄면 그 사진 내용은 알림장에 안 들어감 | 🤖 `report` (AI는 mock) · **실제 모델 👤** | ➖ |
| REPORT-6 | Write the report → 미리보기 **직접 고치기** → **Send to {owner}** | "Sent ✅ … was told". 오너가 받는 글은 **시터가 고친 최종본**. 같은 날 다시 Write하면 덮어쓴 초안(보낸 뒤엔 불가) | 🤖 `report` · SQL | ➖ |
| REPORT-7 | 초안을 만든 뒤 앱 새로고침 | 초안이 그대로 다시 보임 (오너에게는 보내기 전까지 안 보임) | 🤖 `report` | ➖ |
| REPORT-8 | 기록이 하나도 없는 날 Write the report | 고정된 짧은 인사 문장만 (모델을 안 부름, 지어내지 않음) | 🤖 pytest | ➖ |
| REPORT-9 | 오너 → **Diary** 탭 | 보낸 알림장만 날짜순 카드(첫 문장 미리보기). 카드 → 본문 · 그날 사진 스트립 · 할 일 체크리스트. 초안은 절대 안 보임 | 🤖 `report` · SQL | ➖ |
| REPORT-10 | **실제 두 계정**: 시터가 Send → 오너 벨 알림 → 탭 | 알림을 누르면 해당 알림장 항목이 열림. 새로고침 없이 이어짐 | **👤만** | ➖ |
| REPORT-11 | Diary를 연 채로 Home에서 체크인(메모 포함) → Diary로 돌아옴 | 그 메모가 칩으로 바로 보임(새로고침 불필요). 꺼 둔 칩은 꺼진 채 (FB-15 · M-12) | 🤖 `report` | ➖ |
| REPORT-12 | 알림장 Send 뒤 **✏️ Write another report** → 줄 추가 → Write → Send | 새 칩은 **첫 알림장을 보낸 뒤의 기록**만. 두 번째 알림장이 따로 저장 · 전송되고 오너 Diary에 같은 날 두 장(나중 것이 위) (FB-22) | 🤖 `report` · pytest · SQL 011f | ➖ |
| REPORT-13 | `in_care`로 리셋하자마자(3분 안) Feed에 사진 1장 + 체크인 1개 → Diary | 체크인이 바로 저장되고, 그 사진 캡션 · 체크인이 칩으로 나옴 — 일찍 Received한 뒤의 기록도 그날 알림장에 들어감 (CW-1) | pytest · SQL 011i (호스팅 DB에 `011i` 적용 뒤) | ➖ |
| REPORT-14 | (Diary book DB.2) 시터 → Diary — 아무것도 안 했을 때 | **그림일기 표지가 바로** 보임(📅 날짜 · "Max's day 🐾" · 그림 칸 · 줄 공책), 줄 위에 손글씨로 직접 씀("Dear diary, today…"). 쓰기 시작하면 "Draft — only you can see it", **Send to {견주}**가 켜짐. 직접 쓴 글만 Send → AI 호출 없이 오늘 초안이 만들어져(`save_report_draft`, 014b) 바로 보내짐, 견주에게 알림 1개 | 🤖 `report.spec.ts` · SQL `rls_smoke` 014b · 호스팅 DB는 `014b` 적용 뒤 👤 | 사람 확인 대기 |
| REPORT-15 | (DB.2) 페이지에 몇 줄 쓴 뒤 아래 **Let Goldito write it** → **✨ Rewrite the page from the chips** | "This replaces what's on the page — nothing is sent." 안내, 만든 글이 **종이 위에** 초안으로 들어감(견주에게 안 감). 종이에서 고친 뒤 Send → 그 초안이 보내짐(새 행 없음). 칩 · 사진 · 내 줄은 같은 화면에 그대로 있어 끄고 다시 쓸 수 있음(이전의 Back to chips 없음) | 🤖 `report.spec.ts` | 사람 확인 대기 |
| REPORT-16 | (#186) 시터가 40자보다 긴 메모로 체크인(예: "Watched the birds from the window for an hour") → Diary의 칩 | 칩이 **낱말 단위로 잘리고 "…"로 끝남**("Watched the birds from the window for…"), 40자 안. 글 초안에는 원문이 그대로 들어감. 사진 설명 칩 · 피드 캡션 칩도 같음 | 🤖 pytest `test_ai_report_chips`(`_chip`). 2026-10-20 **어시스턴트(사람 아님)**가 Paul 데모 세트로 화면 확인 | 사람 확인 대기 (어시스턴트 실행만, 사람 확인 아님) |

### 3.11 문의 AI (INQ) — Phase 07B · *사전: 백엔드 + `NEBIUS_API_KEY`, Chloe의 일정 · 요금이 있고 Robert에게 Max(+Mochi)가 있음*

> **2026-10-20:** 옛 문의 화면(오너 Your questions · 대화 · 시터 Questions 탭 · 초안 시트)과 `inquiry.spec.ts`는 삭제됨. 아래 INQ 중 화면 단계(INQ-1~3 · 5~7 · 11 · 14 · 17 · 19 · 21~28)는 **폐기**(채팅 CHAT-*가 대신함). 서버 쪽(초안 API · 정책 · 보안 · 말투: INQ-4 · 8 · 9 · 10 · 12 · 13 · 15 · 16 · 18 · 20)은 pytest · SQL로 유지. 백엔드 `/api/ai/inquiry-reply`와 `inquiries` 테이블은 기존 기록 때문에 남겨 둠.

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| INQ-1 | (프로필의 Ask before booking은 3D.3에서 없어짐. 이 흐름은 #142 채팅 AI 초안이 대신하며, 해당 e2e는 그때까지 skip) 오너 → Chloe 프로필 → **Ask before booking** → 반려동물 · 날짜 · 질문("Can you give Max his pill at 2 PM?") → **Send** | 시트가 닫히고 대화 화면. 내 질문 말풍선, "Chloe will reply soon". **시터가 보내기 전에는 답이 안 보임** | 🤖 `inquiry` | ➖ |
| INQ-2 | 질문을 비우고 Send | 질문 자리에 "Boarding · Oct 9 – Oct 12 · Max" 같은 한 줄 요약이 감 | 🤖 `inquiry` | ➖ |
| INQ-3 | 시터 → Bookings → **Questions (1)** → 문의 카드("✍️ Draft ready") → 열기 | 경고 문구 "AI drafts can be wrong. You're responsible for what you send.", **시터 1인칭** 초안, 견적 카드(03C와 **같은 금액**), 출처 칩. 열면 오너 질문이 읽음 처리 | 🤖 `inquiry` · pytest · **실제 모델 👤** | ➖ |
| INQ-4 | 초안의 금액 · 날짜가 서버 값과 같은가 (Thanksgiving 포함 3박 2마리 → $268.13 CAD) | 금액 = 견적 total, 날짜는 문의한 기간 안, `{PRICE}` 같은 자리표시자 없음 | pytest a–c · h | ➖ |
| INQ-5 | 시터가 **Send** 한 번 (타이핑 없이) | "Sent ✅ … was told". 오너 대화에 **AI 라벨 없는 시터 말풍선** + 견적 카드 + "From Chloe's policies" 칩 + **Request booking** | 🤖 `inquiry` · SQL | ➖ |
| INQ-6 | 시터 **Edit / Add** → 고쳐서 Send | 오너가 받는 글 = 고친 글. (학습: `edited` + 수정 비율 기록) | 🤖 `inquiry` · pytest | ➖ |
| INQ-7 | 시터 **Regenerate** · 의도 칩(Accept / Decline / Suggest other dates) | 새 초안이 뜨고 방향이 바뀜(Decline이면 정중한 거절, 가격 문장 없음) | 🤖 `inquiry` · pytest | ➖ |
| INQ-8 | 시터가 문의 기간 중 하루를 **block** 한 상태로 같은 문의 | 초안이 "그날은 어렵다 + 다른 날짜/다른 시터" 안내, **가격 문장 없음**. 오너에게는 **Find other sitters**만 (Request booking 없음) | 🤖 `inquiry` · pytest a | ➖ |
| INQ-9 | 시터 정책에 "No dogs over 20 kg." + 25 kg 반려동물로 문의 | 초안이 "확인하겠다"로 안내하고 **⚠️ Check this one** 표시 (자동 발송 안 됨) | pytest d | ➖ |
| INQ-10 | 질문에 "Are you an AI?" | 사람이라고 답하지 않음 · 시터에게 "reply yourself" 별도 알림 · 자동 발송 안 됨 | pytest i | ➖ |
| INQ-11 | 오너 **Request booking** | `/owner/bookings/new`에 서비스 · 반려동물 · 시간 · 장소 · 시터가 **채워진 채** 열림. 요청을 보내면 그 문의가 booked | 🤖 `inquiry` | ➖ |
| INQ-12 | 시터 `/profile` → **House rules** 카드에 쓰고 저장 | 저장되고 백그라운드에서 재색인. 이후 초안이 그 규칙을 근거("From Chloe's policies")로 씀 | 🤖 `inquiry` · pytest · **실제 DB 👤** | ➖ |
| INQ-13 | 시터 `/profile` → **AI replies → Auto-send** | 책임 동의 모달("Replies go out in your name…") 확인 후에만 켜짐. 껐다 켜면 모달 없음 | 🤖 `inquiry` · SQL | ➖ |
| INQ-14 | **자동 모드 시터에게** 오너가 문의 | 대기 없이 초안 생성 → 오너 화면 "Chloe will reply soon" → **약 4초 뒤 "Chloe is typing…"** → **약 15–40초(보통 ≈ 30초) 뒤 답 말풍선** + 그 시각에 알림. 시터가 스레드를 열기 **전엔 "Read" 표시가 없음**. 시터 화면에는 "Sent automatically" | 🤖 `inquiry` · pytest | ➖ |
| INQ-15 | 자동 모드인데 초안이 확인이 필요한 경우(정책 충돌 · AI 질문 · 모델 실패) | **자동 발송 안 됨** — 수동 초안으로 시터에게 | pytest | ➖ |
| INQ-16 | 시터 말투 비교: Chloe(경쾌) vs Paul(차분) 같은 질문 | 초안 말투가 뚜렷이 다름 (금액 · 날짜는 둘 다 서버 값). 약 50건 블라인드 평가는 슬기 | 실제 모델 확인 · **평가 👤** | ➖ |
| INQ-17 | **실제 두 계정** 전체 흐름 (문의 → 초안 → Send → 오너 알림 → Request booking) | 새로고침 없이 이어지고 오너는 초안을 한 번도 못 봄 | **👤만** | ➖ |
| INQ-18 | **보안 (실제 DB 👤)**: 제3자 · 다른 시터가 남의 문의 열기, 오너가 `author='ai'` 행 조회, 클라이언트가 `knowledge_chunks` · `tone_samples` 읽기 | 모두 0행 / 거부 | SQL `rls_smoke` M | ➖ |
| INQ-19 | 오너 → **Bookings** 탭 → **Your questions** | 내가 보낸 문의가 최신순으로 (시터 · 반려동물 · 날짜), 상태: "Waiting for Chloe" / "💬 Reply ready" / "Booking requested". 카드를 누르면 그 대화로. 시터가 아직 안 보낸 답(초안 · 자동 발송 대기 중)은 "Reply ready"로 안 보임 | 🤖 `inquiry` | ➖ |
| INQ-20 | 시터 일정에서 어느 하룻밤의 자리를 1로 줄임(그 밤 `max_pets` 1) → 오너가 **Max + Mochi**로 그 밤을 포함해 문의 | AI 초안이 **"가능해요" 대신 그 날짜는 못 한다**고 하고 견적 카드 · Request booking 없음 — 예약 요청을 해도 같은 판단(`sitter_unavailable`). 시터가 안 연 날짜가 끼어도 같음 (RV-1) | pytest · SQL 011c (호스팅 DB에 `011c` 적용 뒤) | 로컬 ✅ 10/09 민식 (Max+Mochi, 10/16 자리 1 → "unavailable on Oct 16", 견적 없음) · Vercel ➖ |
| INQ-21 | `pets`로 리셋(예약 이력 없음) → 오너가 Chloe에게 Max + Mochi 문의 → 시터 Bookings → **Questions** | 카드 제목이 **"Robert · Max, Mochi"**("An owner" 아님), 스레드 제목 · 여행 줄에 펫 이름. 머문 기간이 끝나거나 문의가 닫히면 펫 정보는 다시 안 보임(이름은 남음) (FB-31 · RV-4) | SQL 011e (호스팅 DB에 `011e` 적용 뒤) | ➖ |
| INQ-22 | Chloe 일정에서 하루를 Max pets 1로 → 오너가 Chloe 프로필 | 버튼이 **[Ask before booking] [Book]** 나란히. 문의 시트에서 Max만 고르면 그날 초록 점, **Max + Mochi**면 그날 **주황 점(Full)** + "Chloe has no room for your pets that day — you can still ask." 달력 아래 범례 (FB-33) | 🤖 `inquiry` | 로컬 ✅ 10/09 민식 · Vercel ➖ |
| INQ-23 | 시터가 답한 문의(가능/불가 아무거나)에서 오너 대화 화면을 연다 → **Write back** 칸에 "What about the weekend after?" → **Send** | 대화에 **모든 메시지가 시간순**으로 보임(내 질문 · 시터 답 · 새 질문). 보낸 뒤 "Chloe will reply soon"으로 돌아가고 입력칸 · 이전 답의 버튼은 사라짐. 새 초안이 생기며 시터에게 "your draft is ready" 알림. 자동 발송 시터면 같은 규칙으로 약 30초 뒤 답이 나타남 (시터 승인 · 자동 발송 규칙은 첫 문의와 동일) (FB-34) | 🤖 `inquiry` (오너 이어 쓰기) · AI 초안 자체는 pytest(#67) | 로컬 🤖 10/10 (브라우저로 실제 Supabase · 백엔드 · AI 실행 — 사람 ✅ 대기) · Vercel ➖ |
| INQ-24 | 시터가 **불가**로 답한 문의 → 오너 대화 | 큰 버튼 **Change dates**, 그 아래 글자 버튼 **Find other sitters**(보조). Change dates → 문의 시트가 **같은 서비스 · 반려동물 · 시간 · 장소**로 채워져 열림(지난 날짜면 오늘로) → Send → **새 문의**(이전 대화는 그대로)로 이동 (FB-34) | 🤖 `inquiry` | 로컬 🤖 10/10 (브라우저로 실제 Supabase · 백엔드 · AI 실행 — 사람 ✅ 대기) · Vercel ➖ |
| INQ-25 | 시터가 답한 문의에 오너가 새 메시지를 씀 → 시터 Bookings → **Questions** | 그 카드가 다시 **"Writing the draft…"**(Questions 숫자에 포함), 초안이 생기면 **"Draft ready"**, 열면 **새 질문에 대한 초안만** 보임(이전 초안 X) → Send 하면 "Replied" (목록 · 스레드 모두 마지막 오너 메시지 기준) (FB-34) | 🤖 `inquiry` | 로컬 🤖 10/10 (브라우저로 실제 Supabase · 백엔드 · AI 실행 — 사람 ✅ 대기) · Vercel ➖ |
| INQ-26 | 오너 · 시터 대화 화면의 시간 표기 | 메시지 · Drop-off · Pick-up 시간이 **"Oct 10, 1:05 PM"**(올해가 아니면 "Oct 10, 2027, 1:05 PM")으로 보임 ("10-10 1:05 PM" 아님) (FB-34) | 🤖 `inquiry` | ➖ |
| INQ-27 | 두 브라우저(오너 · 시터)에서 같은 대화를 열어 둔 채 한쪽이 보냄 | **새로고침 없이** 상대 화면에 메시지가 나타남(Realtime, 안 되면 5초 폴링). 시터 화면에 오너의 새 메시지가 뜨는 순간 오너 쪽엔 **Read**. 오너 화면에서 시터의 새 답도 바로 뜸 (FB-34) | 🤖 `inquiry` (폴링 경로) · Realtime 소켓은 👤 | ➖ |
| INQ-28 | 시터 초안에 **"From your earlier messages"** 칩 | 오너 · 시터 화면 어디에도 안 나옴(오너의 이전 메시지는 AI의 참고일 뿐, 출처 칩이 아님). 정책 · Life Record 출처 칩은 그대로 (FB-34) | 🤖 `inquiry` | ➖ |
| INQ-29 | 시터 일정에 자리가 없는 날로 온 문의의 초안을 시터가 연다 → Accept / Decline / Suggest other dates / Regenerate | 초안 위에 **"📅 Your calendar has no room … a draft can't say yes"** 안내, **Accept는 비활성**(자리가 없으면 "가능"이라 쓸 수 없는 RV-1 안전 규칙). Decline · Suggest · Regenerate는 새 초안을 만들고 **"New draft ready ✍️"** 토스트. 문구가 비슷해 보여도 정상 — 사실(자리 없음)이 같기 때문. 일정을 열고 Regenerate하면 가능 답이 나옴 (FB-34) | 🤖 `inquiry` (안내 · 비활성) · 실제 AI 답은 👤 | ➖ |
| INQ-30 | 시터에게 답 안 한 문의가 있고 다른 대기 요청 · 임박한 stay가 없을 때 | **Home**에 "💬 Questions (n) — tap to answer" 배너(누르면 Bookings). **Bookings 탭을 누르면 Questions 탭이 바로 열림**(요청이 있으면 Requests가 우선, 임박한 stay는 Upcoming). 직접 탭을 고른 뒤에는 자동으로 옮기지 않음. 답하면 배너가 사라지고, 오너가 새 메시지를 쓰면 다시 나타남. 면책 문구("AI drafts can be wrong…")는 **Send 아래 작은 회색 글씨** (FB-34) | 🤖 `inquiry` | ➖ |
| INQ-31 | 오너가 거절 답을 받은 대화에서 **Change dates** → 날짜 하루 뒤로(+) → **Send** | **같은 대화**에서 시트가 닫히고(새 문의 아님, URL 그대로) 내 말풍선 **"Changed dates: Oct 12, 9:00 AM – Oct 14, 5:00 PM"**이 이어 붙음. 픽업도 같은 길이만큼 같이 이동. 시터에게 "draft is ready" 알림, 새 초안은 **새 날짜** 기준(견적 · 자리 포함). 펫 · 서비스는 그대로 (011j, FB-34) | 🤖 `inquiry` (앱) · SQL 011j (호스팅 DB에 `011j` 적용 뒤) | ➖ |
| INQ-32 | 시터가 초안 아래 **Accept** | 팝업에 **수락 답장이 써져 있음**(AI, 시터 말투, 수정 가능, 견적 카드) → **Send acceptance** 하면 바로 대화에 전송. 자리가 없는 날이면 팝업은 "📅 no room … " 설명 + **Open my schedule**만 (가짜 "yes"는 안 나감) (FB-34). 화면의 초안이 이미 "yes"면 그 초안을 그대로 쓰고 새로 만들지 않음 — 모델 호출 없음, 시터 말투 학습에 "버린 초안"으로 남지 않음 (CR-5). 다른 쪽(Decline)으로 기운 초안일 때만 새 수락 초안 | 🤖 `inquiry` · pytest `test_inquiry`(의도를 바꾼 재생성은 버린 초안이 아님) · 실제 AI 문구는 👤 | ➖ |
| INQ-33 | 시터가 **Decline** | 팝업에 거절 답장(화면 초안이 이미 거절이면 그대로, CR-5) → **Send decline** → 바로 전송. 오너 화면은 **Change dates**(Request booking · 견적 없음) (011k) | 🤖 `inquiry` · SQL 011k (`011k` 적용 뒤) | ➖ |
| INQ-34 | 시터가 **Suggest other dates** | 팝업에서 **날짜 · 시간을 고르고**(내 일정 달력 표시) 메시지에 그 날짜가 자동으로 들어감(수정 가능) → **Send suggestion**. 내 일정에 자리 없는 날을 고르면 빨간 안내 + Send 비활성. 오너는 Change dates로 이어 감 (FB-34) | 🤖 `inquiry` | ➖ |
| INQ-35 | 오너가 시터가 안 연(또는 꽉 찬) 날짜로 문의 시트 → **Send** (새 문의, 그리고 Change dates 둘 다) | 바로 보내지 않고 시트 아래가 **"Chloe has no room on these dates. You can still ask…" + [Ask anyway] [Pick other dates]**로 바뀜. Pick other dates → 시트로 돌아가 날짜 수정(아무것도 안 보내짐). Ask anyway → 그대로 문의 전송. 자리가 있는 날은 확인 없이 바로 전송. 날짜를 바꾸면 안내는 사라짐 (FB-33 후속) | 🤖 `inquiry` | ➖ |
| INQ-36 | 한 번에 한 오너만 받는 시터와 이미 확정 · 홀드된 날짜에 **같은 오너**가 더 묻는 문의 → 시터가 **Regenerate** / **Accept** / **Suggest other dates** (CR-3) | 오너가 처음 받은 답과 시터가 다시 만든 초안의 가능 여부가 같음(오너 본인의 예약을 "다른 오너"로 세지 않음). 다른 오너에게는 그 슬롯이 계속 막힘. 제3자가 다른 오너 이름으로 묻으면 `forbidden` | 🤖 pytest `test_inquiry`(`p_owner` 전달) · `inquiry.spec.ts`(Suggest 확인에 `p_owner`) · SQL `rls_smoke` CR-3 · 👤 (DB는 10/13 적용 — 사람 확인 대기) | ➖ |
| INQ-37 | 오너가 같은 펫 · 날짜로 시터 A, B에게 문의 → A에게 예약 요청 → A가 **거절**(또는 오너 취소 · 만남 시간 초과로 자동 취소) (CR-4) | 요청 순간 B 문의는 `closed`(B는 Life Record를 더 못 봄). 요청이 끝나면 B 문의가 다시 `open` — 오너 · B 모두 이어서 대화 가능. 같은 날짜를 덮는 다른 살아 있는 예약이 있으면 그 예약이 끝날 때까지 닫힌 채. 지난 날짜 · 손으로 닫은 문의는 다시 안 열림 | SQL `rls_smoke` CR-4 · 👤 (DB는 10/13 적용 — 사람 확인 대기) | ➖ |
| INQ-38 | 시터 화면에 초안이 떠 있는 동안 오너가 **Change dates**(또는 새 메시지) → 시터가 그 옛 초안을 **Send** / Accept (CR-7) | 보내지지 않고 "The owner wrote again after this draft …" 안내(Retry 없음), 스레드가 다시 읽혀 새 메시지용 초안을 기다림 — 옛 견적 · 옛 날짜의 "yes"가 나가지 않음. 시터가 직접 쓴 답(초안 없이)은 그대로 전송 | SQL `rls_smoke` CR-7 · 🤖 `inquiry.spec.ts` · 👤 (DB는 10/13 적용 — 사람 확인 대기) | ➖ |

### 3.12 사진 캡션 · 앨범 (CAP) — Phase 09 · *사전: 시터가 돌보는 중, 백엔드 + `NEBIUS_API_KEY`*

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| CAP-1 | 시터 → Feed → 펫 → **+ Photo** → 샘플 사진 하나 | 피드 위에 **내 사진 썸네일 카드** + "Uploading…" → **"Writing a caption…"** → 토스트 "Shared with Robert". **글 입력칸이 어디에도 없음** | 🤖 `caption` | ➖ |
| CAP-2 | 게시된 카드의 캡션 | 1–2문장, 따뜻함, 펫 이름 한 번, 이모지 ≤ 2, **해시태그 · 따옴표 없음**, 사진에 안 보이는 것을 지어내지 않음. 샘플 5장 중 4장 이상이 사람이 쓴 듯 | **👤** | ➖ |
| CAP-3 | 샘플 meal · walk · nap 사진을 각각 올림 | 오너 Album에서 각각 🍚 Meals · 🐕 Walks · 😴 Naps (샘플 9번 중 8번 맞음 — 틀린 한두 장은 정상) | **👤** (분류) | ➖ |
| CAP-4 | 백엔드를 끄고(또는 `NEBIUS_API_KEY`를 틀리게) 사진 올리기 | **그래도 게시됨**, 캡션이 "… had a lovely moment today 🐾" / "A moment from today's care 🐾", Album에서는 ✨ Moments | 🤖 `caption` · pytest | ➖ |
| CAP-5 | 영상 올리기 | 첫 프레임으로 캡션 · 분류, 카드에 ▶ | **👤** | ➖ |
| CAP-6 | 오너 → Feed → **Timeline / Album** 토글 | Timeline = 최신순 카드. Album = 날짜 헤더("Oct 9, 2026") 아래 분류별 3열, **빈 분류는 안 보임**, "Meals · 2" 같은 개수. 사진을 누르면 뷰어 | 🤖 `caption` | ➖ |
| CAP-7 | 할 일(밥 · 산책 · 낮잠 · 놀이)을 사진과 함께 완료 | 오너 Album에서 그 사진이 할 일 종류대로 Meals · Walks · Naps · Play에 들어감 | **👤** | ➖ |

### 3.13 완료 · 리뷰 · Life Record (DONE) — Phase 07C · *사전: Life Record는 백엔드 + `NEBIUS_API_KEY`, 돌봄이 끝난(Returned) 예약 — 만드는 법은 [test-run.ko.md](test-run.ko.md) §2*

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| DONE-1 | 시터가 **Returned** | 시터 토스트 "… home safe — Robert gets a notice". 오너 알림 두 개: **"Max and Mochi are home safe 🏠"** → 바로 뒤 **"Thanks for trusting Chloe! How was … stay? ⭐"** (이 순서) | SQL N | ➖ |
| DONE-2 | 오너 → 그 예약 상세 | 맨 위 **"home safe 🏠"** + **Stay summary**(기간 · 알림장 수 · 사진 수 · 완료 할 일 수 · 마지막 알림장 첫 문장 — **그 돌봄 기간만** 셈) | 🤖 `completion` | ➖ |
| DONE-3 | **Leave a review ⭐** → 별 없이 Send | Send **비활성**. 별을 누르면 선택 표시 (마우스 · 키보드) | 🤖 `completion` | ➖ |
| DONE-4 | 별 4 + 코멘트 → **Send review** | 토스트 "Thanks! Chloe was told", 예약 상세로 돌아오고 **별 · 코멘트 읽기 전용**, Leave a review 사라짐. 시터에게 "Robert left you 4 stars ⭐" 알림 | 🤖 `completion` · SQL N | ➖ |
| DONE-5 | 같은 리뷰를 다시 (주소 `/owner/bookings/<id>/review` 직접) | "you already reviewed this stay" — 두 번 못 씀. 돌봄이 안 끝난 예약이면 "Not ready yet" | 🤖 `completion` · SQL N | ➖ |
| DONE-6 | 오너 → Chloe 시터 프로필 | **★ 평균 · 후기 수**, 최근 코멘트(리뷰어는 **이름만**). 후기가 없으면 별점 줄 없음 | 🤖 `completion` | ➖ |
| DONE-7 | 끝난 예약 상세를 처음 엶 (Life Record가 없을 때) | "📖 Writing the Life Record…" → 펫마다 **LifeRecordCard**. 기록 없는 칸(예: 배변을 안 적음)은 **안 보임**, 전부 비면 "Nothing was recorded…". 출처 "From Chloe · Oct 9 – Oct 12" | 🤖 `completion` · pytest · **실제 모델 👤** | ➖ |
| DONE-8 | **지어낸 내용이 없는지** — 이번 돌봄에 없던 것(산책을 안 했는데 "loves long walks", 약 할 일이 없는데 약 얘기)이 기록에 있나? 3번 확인 | 없어야 함 | pytest · **👤 3회** | ➖ |
| DONE-9 | 기록 어디에도 lockbox · buzzer · 주소 · 전화번호 · 이메일이 없나? | 없어야 함 (Heads-up이나 Sitter tips에 섞여 들어가지 않음) | pytest · **👤** | ➖ |
| DONE-10 | AI가 실패하는 상황(백엔드 끔) | "Couldn't write … Life Record" + **Retry**. 백엔드를 켜고 Retry → 기록 생성. 이미 있으면 다시 안 만듦(새로고침해도 요청 없음) | 🤖 `completion` | ➖ |
| DONE-11 | 오너 → 펫(Max) → **📖 Life Record** | 최신 돌봄이 위, **Earlier stays** 아래. 알림 "…'s Life Record is updated 📖"를 누르면 이 화면 | 🤖 `completion` | ➖ |
| DONE-12 | **다음 시터(다른 계정/시터)에게 Max 요청** → 그 시터 화면의 요청 · 예약 상세 | Max 카드에 **"📖 From Max's Life Record"** (접힘, 지난 시터 · 날짜) → 펼치면 기록. 기록 없는 펫(Mochi)에는 없음. 요청이 거절되면 사라짐 | 🤖 `sitter-bookings` · SQL N | ➖ |
| DONE-13 | 오너 → 케어 요청서 **Make a checklist** (기록에 Heads-up이 있는 펫) | 제안된 주의사항에 지난 Heads-up이 **자동으로** 포함 (오너가 쓴 것과 같은 말은 중복 안 됨) | pytest | ➖ |
| DONE-14 | 다른 시터가 Max에 대해 문의받았을 때(07B) 초안의 출처 | 출처 칩에 "From Max's Life Record" | pytest | ➖ |
| DONE-15 | **보안 (실제 DB 👤)**: 돌봄이 끝난 시터(접근 시간 2시간 이후) · 제3자가 기록 조회, 오너가 `source_snapshot` 조회, 클라이언트가 `reviews`에 직접 insert | 모두 0행 / 거부 | SQL N | ➖ |

### 3.14 이번 피드백 반영 (UX)

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| UX-1 | 오너 → 예약 새로 만들기 → Drop-off / Pick-up **날짜를 탭** | **달력 시트**가 뜸. 오늘 이전 날은 비활성(Pick-up은 Drop-off 이전), 월 이동 가능, 날짜를 누르면 그 날로 선택. −/+ 는 여전히 하루씩 | 🤖 `booking` | ➖ |
| UX-2 | 시터 Home (돌보는 중) | **All tasks / My history**가 숫자 타일과 **달라 보임** (색 테두리 · 연한 배경 · `›`), 누르면 이동 | **👤** (모양) | ➖ |
| UX-3 | 시터 → Bookings 탭 | (채팅은 Chat 탭, #329) 칩 **Requests · In progress · Upcoming · Past**. 숫자가 붙은 칩(시터가 답해야 할 일)으로 **버튼을 안 눌러도 바로 열림**(Requests 먼저, 그다음 In progress). 숫자가 없으면 돌봄 중 → 48시간 안에 시작 → Upcoming. 직접 칩을 고르면 그 방문 동안 유지 | 🤖 `sitter-bookings` | 사람 확인 대기 |
| UX-4 | 오너 → Bookings → **Your questions** | 내 문의가 최신순으로, "Waiting for …" / "💬 Reply ready" / "Booking requested" (= INQ-19) | 🤖 `inquiry` | ➖ |
| UX-5 | 시터 Bookings에 대기 요청 · 답할 문의가 있을 때 (폰 너비 402) | Requests · Questions · Upcoming · Past가 **한 줄**, 숫자는 칸 오른쪽 위 **작은 배지**(괄호 "(1)" 없음) (FB-30) | 🤖 `sitter-bookings` · `inquiry` | ➖ |
| UX-6 | `pets`로 리셋한 오너(예약 · 문의 · 시터 이력 없음) → Bookings 탭 | 빈 화면 대신 **Sitters on Goldito** — 시터 카드(→ 프로필), 아래 Book care. Book care의 시터 목록에도 각 시터 옆 **Profile** (FB-32) | 🤖 `sitters` | 로컬 ✅ 10/09 민식 · Vercel ➖ |

### 3.15 이름 변경 (NAME) — Pawddy → Goldito

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| NAME-1 | 앱 첫 화면 · 로그인 · 가입 | 어디에도 "Pawddy"가 없고 **Goldito** | 🤖 (iframe 제목) · **👤** | ➖ |
| NAME-2 | 데모 계정으로 로그인 (한 번 로그아웃된 상태에서) | Try the demo 로그인 성공 (이메일 `@goldito.test`) | 🤖 `welcome` | 🟡 10/08 Claude가 브라우저로 두 버튼 로그인 확인 (사람 확인 대기) |
| NAME-3 | 새 사진 업로드 후 Cloudinary 주소 | 폴더 `goldito/…`. **예전 사진(`pawddy/…`)도 계속 보임** | pytest | ➖ |
| NAME-4 | Meet & Greet 영상 링크 · `.ics` 파일 | 제목이 "Goldito Meet & Greet — …", 파일명 `goldito-meet-greet.ics` | **👤** | ➖ |
| NAME-5 | 동의서 문구 | "demo template for the Goldito hackathon" | **👤** | ➖ |

### 3.16 예약 흐름 피드백 (FLOW) — [feedback-2026-10-08.ko.md](feedback-2026-10-08.ko.md) 반영 후 확인할 것 *(FLOW-13~23은 #60에서 수정 · FLOW-1~12는 R2(민식) / R4(슬기)에서)*

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| FLOW-1 | 오너가 예약 요청 → 시터 화면 (새로고침 없이) | 시터 Home · Bookings가 새로고침 없이 갱신 — Requests 탭 모서리 배지 1, 문의면 Questions (FB-2) | 👤 (실시간) | ❌ 10/08 민식 (실시간 안 뜸) |
| FLOW-2 | 시터가 Accept(처음 만나는 사이면 **Confirm booking**) → 오너 화면 | 오너 예약이 새로고침 없이 Confirmed로 | 👤 (실시간) | ➖ |
| FLOW-3 | 오너 **Finish booking** (시터 요금표가 있는 상태 — **10/08에 Chloe 요금 행을 임시로 넣음**: 보딩 $55 · 추가 펫 +50% · 공휴일 +25%, 다시 눌러 확인) | 체크아웃이 열려 **견적 · 동의서 · 데모 결제**가 진행됨 (FB-7) | 🤖 `checkout` (mock — 요금표 없음 → "hasn't set their prices yet" · 서비스 안 함 → "doesn't offer" 2건 추가) · pytest `test_seed_demo` | ❌ 10/08 민식 ("This sitter doesn't offer that service" — `sitter_rates` 비어 있음). 코드 수정됨 — 호스팅 DB에 `seed_demo` 실행 후 다시 확인 |
| FLOW-4 | 요금표가 **없는** 시터로 체크아웃 | "Chloe hasn't set her prices yet"처럼 **진짜 이유** 문구 (서비스 문구 아님) | 새로 필요 | ➖ |
| FLOW-5 | 시터 Bookings 분류 (D60 단계 기준) | **Requests** = 아직 첫 답(Yes, let's meet)을 안 한 요청 · **In progress** = 첫 답 이후 Meet & Greet · 합의 · 결제 대기, 그리고 펫을 받은 뒤 돌봄 중 · **Upcoming** = 결제 끝, 아직 인계 전 · **Past** = 끝남 · 거절 · 취소 · 만료 · 시간이 지나도 시작 못 한 것. In progress 칩은 해당 예약이 있을 때만 보임 | 🤖 `sitter-bookings` | 사람 확인 대기 |
| FLOW-6 | 시터 **Returned** | **확인 시트**가 먼저 뜸("Return Max?" · 되돌릴 수 없고 Life Record가 써진다는 문구 · 오늘 남은 할 일 수 · 알림장 미발송이면 "Send today's note first"). 합의된 픽업 **30분 전보다 이르면** "It's not pick-up time yet … Do you really want to return Max now?"가 더 붙고 **Return이 빨간 바탕 · 흰 글씨**(막지는 않음, 2026-10-11 결정). 30분 전부터는 경고 없이 평소 버튼. **Return**을 눌러야만 처리, **Cancel**은 아무것도 안 바꿈 (FB-9) | 🤖 `handoff.spec.ts` (5개) | ❌ 10/08 민식 (바로 처리됨) → 다시 확인 필요 |
| FLOW-7 | 시간 변경 시트에서 Drop-off 를 바꾸고 Pick-up 탭 → 다시 Drop-off | 각각 고친 값이 **유지** (FB-5) | 🤖 `negotiation.spec.ts` | ❌ 10/08 민식 → 다시 확인 필요 |
| FLOW-8 | 두 탭을 고치고 **Send to …** | 바뀐 것 **전부** 한 번에 전송(새 드롭오프가 옛 픽업보다 늦으면 픽업을 먼저). 하나가 실패하면 시트가 열린 채로 "Drop-off was sent. Pick-up didn't go through …"를 보이고 Send가 나머지만 다시 보냄. **Close** 는 아무것도 저장 · 전송하지 않고 그냥 닫힘 | 🤖 `negotiation.spec.ts` (4개) | ❌ 10/08 민식 → 다시 확인 필요 |
| FLOW-9 | Received 가 끝난 예약에서 **Change time or place** | 끝난 Drop-off 는 비활성("Drop-off · done ✓"), 에러("That handoff already happened.")가 안 나옴. 픽업까지 끝났으면 Change time or place 버튼이 없음 (FB-6) | 🤖 `negotiation.spec.ts` | ❌ 10/08 민식 → 다시 확인 필요 |
| FLOW-9b | **확정된** 예약에서 일정 전체를 옛 픽업보다 뒤로 옮김 (예: Oct 5–8 → Oct 10–14, CR-2) | 두 제안이 모두 전송됨(예전엔 픽업만 가고 드롭오프는 `invalid_window`). 상대의 드롭오프 카드에 "Comes with the new pick-up (…) — Accept or Decline answers both." Accept 한 번에 두 시간이 모두 합의되고 슬롯이 새 기간으로 다시 만들어짐, Decline은 둘 다 거절하고 원래 일정 유지. 혼자 맞는 변경은 예전처럼 하나씩 | 🤖 `negotiation.spec.ts`(안내 문구) · SQL `rls_smoke` CR-2(수락 · 거절 · 단독) · 👤 (DB는 10/13 적용 — 사람 확인 대기) | ➖ |
| FLOW-10 | 모든 날짜 · 시간 입력(Book care · 문의 · 변경 시트 · M&G · 스케줄 · 케어) | 날짜 탭 → 달력, 시간 탭 → 시계, − + 는 하루 / 15분 (DESIGN.md §7.10) (FB-3) | 새로 필요 | ❌ 10/08 민식 (변경 시트는 − + 만) |
| FLOW-11 | 예약 상세 · 카드 (오너) | 시터 이름 옆에 헤더와 같은 **Sitter 알약**, 시터 쪽엔 **Owner** 알약 (FB-4) | 새로 필요 | ❌ 10/08 민식 |
| FLOW-12 | Max → Care tasks → Add → 입력칸 라벨 | 굵은 라벨 + 같은 줄에 **작은 연한 회색 힌트**, 엠대시 없음 (FB-1) | 새로 필요 | ❌ 10/08 민식 |
| FLOW-13 | 오너가 체크아웃에서 Pay 한 직후 예약 화면 | 맨 위에 **확인 카드**: 결제 금액 · 드롭오프 시각 · "Nothing else to do"; **누르면 사라지고** 새로 고침해도 그대로, 상단 칩 줄에 `Paid` (FB-12) | 🤖 `checkout` (Pay 후 카드 · 닫기 · 새로 고침) | ❌ 10/09 민식 (Paid 칩만 있어 저장됐는지 모름) → 코드 수정됨, 다시 확인 |
| FLOW-14 | 예약 화면의 준비물(Pack for …) | 준비물에 체크하고 나갔다 와도(새로 고침) 체크가 남음. "saved on this device" 안내 (FB-13, 이 기기에만 저장 · 시터는 못 봄) | 🤖 `checkout` (체크 → 새로 고침) | ❌ 10/09 민식 (체크가 저장 안 됨) → 코드 수정됨, 다시 확인 |
| FLOW-15 | 시터가 알림장 Send → 오너 | 벨 → Notifications에 📓 알림장 알림, 누르면 그 알림장 (FB-21) | 👤 (Home 카드 e2e는 없어짐) | ➖ |
| FLOW-16 | 시터 Home → **My history** | 보낸 알림장이 📓 "Daily report · Sent"(본문 두 줄, 누르면 전체)로 보임. 초안은 안 보임 (FB-23) | 🤖 `sitter-home` | ➖ |
| FLOW-17 | Received 뒤 / Returned 뒤 예약 목록 · 상세 (오너 · 시터) | Received 뒤 **In care**, Returned 뒤 **Completed — pets home** (더는 "Confirmed" 아님) (FB-26) | 🤖 `handoff` | ➖ |
| FLOW-18 | Returned 뒤 오너 Home | ⭐ "How was …'s stay?" 카드가 **리뷰를 남길 때까지** 고정(열어 봐도 남음), 리뷰 후 사라짐 (FB-24) | 🤖 `live-updates` | ➖ |
| FLOW-19 | 오너가 리뷰를 남긴 뒤 시터 → 그 예약 상세 | "Robert's review" 카드에 별점 · 코멘트. 리뷰 전이면 "hasn't left a review yet" (FB-29) | 🤖 `handoff` | ➖ |
| FLOW-20 | 오너 리뷰 화면에서 별 5 → 프리셋 칩 / 별 2로 바꿈 | 별점마다 다른 프리셋 3개, 별을 바꾸면 이전 선택이 빠짐. 고른 문구 + 직접 쓴 글이 코멘트로 저장 (FB-27) | 🤖 `completion` | ➖ |
| FLOW-21 | 시터 Returned 뒤 그 예약(또는 Past) → **⭐ Rate Robert** → 별 · 프리셋 · 한마디 → Save | "Your note about Robert" 읽기 전용 + Edit. "🔒 Only you can see this — Robert is never told." 오너에게 알림 **없음**, 오너는 읽을 수 없음 (FB-25) | 🤖 `handoff` · SQL O | ➖ |
| FLOW-22 | 같은 오너가 다시 예약 요청 → 시터가 그 요청 열기 | 맨 위에 "Your notes from earlier stays with Robert"(별 · 메모 · 날짜, 본인만 보임) (FB-29) | 🤖 `handoff` | ➖ |
| FLOW-23 | 오너 리뷰 Send → 같은 화면의 **♡ Add Chloe to favorites** 한 번 누르기 → **Back to the booking** (#251) | 질문 시트 없음, 별 없음. 하트가 채워지고 "Chloe is a favorite" 토스트(시터에게는 알림 없음). 채팅 · 시터 프로필과 같은 하트. Book care 검색에서 즐겨찾기 시터가 먼저. 이미 즐겨찾기면 묻지 않고 채워진 하트 "Favorite"만 보임. 이미 리뷰한 예약의 리뷰 화면에도 같은 하트 (FB-28) | 🤖 `completion` · SQL P | ➖ |

---

### 3.17 코드 리뷰 수정 (REV) — [review-2026-10-08.ko.md](review-2026-10-08.ko.md) *(RV-6~10은 #60에서 수정 · RV-1~5는 R1b(민식) · M · L은 Phase Q(슬기) — ID는 리뷰 문서 항목과 같음)*

**사전:** main이 Vercel에 배포됨, 원하는 상태로 리셋. "자동" 칸은 고치는 커밋이 채운다.

| ID | 무엇을 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| R0-1 | 스택 PR의 CI | `supabase` 잡이 010 · 011을 적용하고 스모크 M · N이 실제로 돈다 | 🤖 CI `supabase` 잡 (#56 초록, 로컬 스모크 423 ✓ — 2026-10-08) | ➖ |
| R0-2 | CI를 토론토 자정 · 저녁 · 월말에 | `care-tasks` · `report` · `booking` · `caption` spec이 시각과 무관하게 통과 | 🤖 고정 시계(`NOON_TORONTO`) · CI `frontend` (#55 · #56 초록, flows 182 ✓ — 2026-10-08) | ➖ |
| RV-1 | 시터가 밤 슬롯을 **닫았거나**(직접 또는 매주 규칙) 남은 자리 1인데 펫 2마리로 문의 | AI가 "가능"이라고 하지 않고, 안 되는 날을 말함 · 견적 없음 | 새로 필요 | ➖ |
| RV-2 | 막힌 날짜로 문의(자동 발송 켬) | "Yes, I can host" 같은 답이 나가지 않음(검사에 걸려 다시 쓰거나 고정 문구), 안 되는 날을 문장에 적음, **불가인 답은 자동 발송 안 되고 시터 확인 대기**. 날짜가 열려 있는데 "I can't take…"만 하는 답도 걸림 | pytest `test_inquiry` · `test_inquiry_agent` (실제 AI 문장은 👤) | ➖ |
| RV-3 | 시터가 Decline 칩 → Send / 가능 초안을 **Edit / Add**로 거절 문장으로 고치고 **"Include the price and a Request booking button"**을 끄고 Send / 가격 없는 초안(모델 장애 대체 문장 포함) | 오너 화면에 견적 카드 · Request booking이 없고 **Change dates**가 주 버튼. 토글은 가능 + 견적이 있는 초안에서만 기본 켜짐, 불가 초안에는 토글 자체가 없음 | 🤖 `inquiry` · pytest `test_inquiry` · SQL 011k | ➖ |
| RV-4 | 예약한 적 없는 오너가 처음 문의 | 시터 Questions 카드 · 스레드에 **오너 이름**과 **펫 이름 · 정보**가 보임 | 새로 필요 | ➖ |
| RV-5 | 오너가 시터 A · B에게 같은 펫 · 겹치는 날짜로 문의 후 A를 예약 / 문의 기간이 지남 | B의 문의는 **closed**(A의 문의는 앱이 booked로, 다른 펫 · 다른 날짜의 문의는 그대로 open). B는 그 펫의 Life Record를 못 읽음. 닫힌 · booked 문의에서 새 초안 · Regenerate · 의도 칩은 **409**("This question is closed…"), Life Record 근거 칩의 라벨은 문장이 속한 펫 이름 (`011z`) | SQL `rls_smoke` (011z) · pytest `test_inquiry` · 호스팅 DB에 `011z` 적용 뒤 👤 | ➖ |
| RV-6 | Diary에서 메모 · 사진 칩 하나를 끄고 Write | 초안에 꺼진 칩 내용이 없음 | 🤖 `report` (`off` 전송 · 사진 칩 하나만 꺼도 설명 제외) · pytest `test_ai_daily_report` (꺼진 메모 · 피드 원문이 모델 입력에 없음 · 할 일 사진 캡션 제외 · `_ref` 숨김), `test_ai_report_chips` (칩 id = 기록 id) | ➖ |
| RV-7 | 켜진 칩 9개 이상으로 Write | 안내 문구가 보이고 초안이 생김 (422 없음) | 🤖 `report` (안내 문구 · 9개 전송 · 422 문구) · pytest `test_ai_daily_report` (칩 12개 → 앞 8개) | ➖ |
| RV-8 | AI가 꺼진 상태(키 없음)로 Write | "plain list" 안내와 함께 칩 목록 초안 → 고쳐서 Send 가능 | 🤖 `report` (안내 · Send) · pytest `test_ai_daily_report` (장애 · 빈 답 → 목록 초안, 꺼진 칩 없음) | ➖ |
| RV-9 | 시터 Returned 직후 오너가 home safe 알림을 눌러 예약 열기 | 오류 없이 "Writing the Life Record…" → 기록 표시, 기록은 펫마다 하나 | 🤖 `completion` (Returned 직후 대기 · 재진입 시 요청 1번 · 실패해도 기록 있으면 표시) · pytest `test_ai_life_record` (23505 재사용 · 모델 전 재확인) | ➖ |
| RV-10 | 같은 시터와 두 번째 돌봄 후 Life Record | 이번 돌봄의 알림장 내용만 반영 | pytest `test_ai_life_record` (예전 돌봄 제외 · 긴 돌봄은 최신 5개 · 이 예약의 문의 우선 · 끝난 뒤 문의 제외) | ➖ |
| M-1 | 정책이 있는 시터에게 단순 문의 | 에이전트 안 탐(빠름), 응답 35초 이내 | pytest | ➖ |
| M-2~M-3 | "1박에 얼마?" · "Oct 9-14" · "10% off?" 문의 | 틀린 금액 · 날짜 · 할인이 초안에 남지 않음 | pytest | ➖ |
| M-4 | 다른 오너 대화에 전화번호 · 출입 코드가 있었던 시터 | 새 초안 · 프롬프트 예시에 번호 · 코드 없음 | pytest | ➖ |
| M-5 | 백엔드를 끈 채 오너가 문의 → 백엔드 켜고 시터가 스레드 열기 | 시터는 문의 알림을 받았고, 스레드를 열면 초안이 만들어짐 | 새로 필요 | ➖ |
| M-6 | 요금표 없는 시터에게 문의(자동 발송 켬) | 자동 발송 안 됨, 시터에게 "가격 없음" 확인 요청 | pytest | ➖ |
| M-7 | Write it myself로 쓰는 중 초안 도착 | 쓰던 글 유지 + "A draft is ready" 배너 | 새로 필요 | ➖ |
| M-9 | "Somewhere else" + 메모로 문의 → Request booking | 시터 · AI가 메모를 보고, 예약 프리필에 메모가 있음 | 새로 필요 | ➖ |
| M-10 | "Are you real?" 문의 | 시터 확인 대기(자동 발송 안 됨), "virtual Meet & Greet" 초안은 통과 | pytest | ➖ |
| M-11 | 시터가 Regenerate 3번 | 시터 알림은 처음 한 번뿐 | SQL smoke | ➖ |
| M-12 | Diary를 열어 두고 다른 탭에서 체크인 후 돌아오기 | 새 칩이 보이고, 꺼 둔 칩은 꺼진 채 | 새로 필요 | ➖ |
| M-13 | 사진 추가 직후 바로 삭제 | 삭제한 사진의 칩이 다시 나타나지 않음 | 새로 필요 | ➖ |
| M-14 | "Missed a medication" 칩 | 끌 수 없고, 오너 알림장 상세에 놓친 약이 보임 | 새로 필요 | ➖ |
| M-15 | 시간 변경이 합의된 예약에서 알림장 | 새 시각 기준으로 하루 기록이 잡힘 | pytest | ➖ |
| M-16 | 초안 생성 중 다른 창에서 Send | 보낸 알림장이 초안으로 돌아가지 않음 | pytest | ➖ |
| M-17 | 식사 체크인에 사진 첨부 → 오너 Album | 사진이 🍚 Meals에 | SQL smoke · 새로 필요 | ➖ |
| M-18 | 캡션이 오래 걸림(느린 모델) | 12초 뒤 기본 캡션으로 게시 | 새로 필요 | ➖ |
| M-19 | 인사 · 맺음말이 있는 말투 카드의 시터가 사진 올림 | 캡션에 "Hello …" · "Kind regards" 없음 | pytest | ➖ |
| M-20~M-21 | 메모에 전화번호 · 게이트 코드, 약 할 일 없음 | Life Record에 번호 · 코드 · 지어낸 약 없음, 오너의 "산책 금지" 주의는 남음 | pytest | ➖ |
| M-22 | 옛 예약을 열어 기록을 쓴 뒤 다음 시터 요청 | "From Max's Life Record"가 가장 최근 돌봄 기준 | pytest | ➖ |
| M-23 | 모델이 빈 답 | 빈 기록 대신 이전 Heads-up을 이어받음, 알림 없음 | pytest | ➖ |
| M-24 | `seed_demo.py --check` (이름이 다른 DB) | 이름 차이를 알려 줌, `--apply`로 고쳐짐 | 수동 | ➖ |

### 3.18 Pet Transit (TRIP) — Phase 06B · *지금은 DB(S1)만 — 화면 시나리오는 단계가 끝날 때마다 아래에 추가*

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| TRIP-1 | 결제 전 · 합의 시각 2시간보다 이른 때 · 이동하는 쪽이 아닌 사람(시터 집이면 시터)이 Start trip | 모두 거절 (`not_paid` · `trip_too_early` · `not_traveler`), 제3자는 `not_allowed` | SQL `rls_smoke` L | ➖ |
| TRIP-2 | 견주가 첫 위치와 함께 Start trip → 위치 몇 번 갱신 → 목적지 150 m 안 | `en_route` + 거리 · ETA, 1초 안의 중복 호출은 무시, 150 m 안에서 `arrived`와 양쪽 알림 1회, 이후엔 위치를 저장하지 않음 | SQL `rls_smoke` L | ➖ |
| TRIP-3 | End trip · Cancel trip | 위치 · ETA · 거리가 지워지고 `completed` / `cancelled`, 같은 예약 · 같은 인수인계에 새 Start trip 가능 | SQL `rls_smoke` L | ➖ |
| TRIP-4 | 예약 당사자 아닌 계정, 시터 프로필 목록에서 좌표 | `trips` 행이 0건, 시터의 `home_lat` 열은 읽기 거부, 클라이언트가 직접 INSERT · UPDATE 하면 거부 | SQL `rls_smoke` L | ➖ |
| TRIP-5 | 인수인계 장소 = 견주 집 / 다른 곳 | 시터가 이동(목적지 = 견주 집 좌표) / 둘 다 이동 가능하지만 목적지 없음 → 지도 · ETA 없음, 거리로 도착 판정 안 함 | SQL `rls_smoke` L | ➖ |
| TRIP-6 | 시터가 인수인계 사진을 올리고 사진 체크를 요청 (강아지 사진 / 동물 없는 방 / 차 안 크레이트 없음) | 강아지가 보이고 종이 맞으면 `ok`, 동물이 없거나 종이 다르면 `warning`, 차 사진은 크레이트나 안전벨트가 보여야 `ok`(모델이 "안전해 보임"이라고 해도 서버 규칙이 우선). 모델이 실패·20초 초과여도 200 `unchecked`로 저장. 예약의 시터가 아니거나 남의 사진이면 403 | 🤖 pytest `test_ai_handoff_check` · SQL `rls_smoke` L(행 읽기·쓰기 권한) · **차 안 크레이트 감지는 진짜 사진으로 확인 대기 👤** | ➖ |
| TRIP-7 | Profile → **Home address** 카드 → **📍 Use my current location** | 버튼을 누르기 전에는 위치를 읽지 않음(핀 상태 · 동네 · 지도 링크 · 용도 문구는 없음). 한 번 누르면 브라우저 권한 창(이미 허용이면 바로) → 토스트 **"Location found 📍 Tap Save to keep it"**, **Home address**에 "거리명, 도시"(예: Dundas St W, Toronto), **Postal code**에 우편 앞 3자리(예: M6J)가 따로 채워짐(집 번호는 사람이 덧붙임). Save하면 핀과 함께 저장되고 토스트 **"Pin saved near {동네}"**. 브라우저가 거절하면 칸 아래에 "Location is off. Allow it in your browser settings, or check your address instead." 핀은 그대로 | 🤖 `home-location.spec.ts` + pytest `test_geo` (reverse) · 실제 폰 👤 | ➖ |
| TRIP-8 | 주소를 새로 쓰거나 고치고 Save | 토스트에 한 줄 "Profile saved · Pin placed near {동네, 도시}". 주소를 못 찾거나 조회가 안 되면 "We couldn't place that address on the map — use your current location for the pin"이고 옛 핀은 지워짐. 주소를 안 건드리면 조회하지 않고 핀 유지. 같은 방문에 현재 위치로 찍은 핀은 주소 조회로 덮어쓰지 않음 | 🤖 `home-location.spec.ts` + pytest `test_geo` | ➖ |
| TRIP-9 | 가상 운전(Simulate the drive)의 경로 | 출발 = 이동하는 쪽 집, 매 단계 목적지에 가까워지고, 마지막 점은 목적지 약 60 m 앞(150 m 도착 규칙 안) | 🤖 `location.spec.ts` | ➖ |
| TRIP-10 | 견주가 인수인계 2시간 전부터 예약 상세 **Start trip** → 동의 화면 → **Simulate the drive (demo)** | 동의 화면이 먼저 뜨고 그 전에는 trip이 만들어지지 않음. 시작하면 Trip 화면: "Sharing your location with Chloe until you arrive" 배너, "ETA 7:42 AM · 3.2 km", 지도(🚗 · 📍, ± 버튼, © OpenStreetMap contributors). 약 30초 뒤 "You've arrived 🚗", 배너가 사라지고 **Chloe's place**(주소 · Visitor parking · 로비 안내) | 🤖 `transit.spec.ts` | ➖ |
| TRIP-11 | 동의 화면에서 **Cancel** (또는 Close) | 위치도 trip도 시작되지 않고 예약 상세에 머묾 | 🤖 `transit.spec.ts` | ➖ |
| TRIP-12 | 이동하지 않는 쪽(시터 집이면 시터) | Start trip 없음. 2시간 전 이전의 견주는 "You can start the trip from 7:00 AM" 한 줄만 | 🤖 `transit.spec.ts` | ➖ |
| TRIP-13 | 시터가 Home에서 "Robert is on the way · ETA …" 카드 → Trip 화면, 이어서 견주가 도착 | 지도 + ETA(거리 포함), 내 위치 배너 · Cancel trip 없음. 도착하면 새로고침 없이(폴링 4초 안) "Robert has arrived" 카드. trip이 끝나면 Home 카드가 사라짐. 진행 중인 trip이 없을 때는 15초마다만 읽고(Realtime이 시작을 알림), 확정되지 않은 예약 화면은 trip을 읽지 않음 (CR-9) | 🤖 `transit.spec.ts` · 두 창 실시간은 👤 | ➖ |
| TRIP-14 | 시터가 견주 집으로 이동(Sitter drives) → 도착 | Trip 화면에 **EntryInfoCard**(03C 시간 조건 그대로, Show code), Chloe's place 카드는 없음 | 🤖 `transit.spec.ts` | ➖ |
| TRIP-15 | 이동 중 **Cancel trip** (새로고침해서 이 기기가 공유 중이 아닐 때 포함) | 상태 `cancelled`, 위치 · ETA 삭제, "No trip running" | 🤖 `transit.spec.ts` | ➖ |
| TRIP-16 | 지도 위에서 마우스로 드래그 · ± 버튼 | 드래그는 지도가 아니라 화면을 스크롤(지도가 움직이지 않음), ±는 확대 · 축소 | 🤖 `transit.spec.ts` (`/dev/gestures`) | ➖ |
| TRIP-17 | 시터가 예약 상세에서 **Received**(맡기기) 또는 **Returned**(찾기)를 누름 — 이동 중이거나 막 도착한 trip이 있을 때 | 그 trip이 `completed`가 되고 위치 · ETA가 지워짐. 양쪽 Home의 이동 카드와 예약 상세의 Track 카드가 사라짐. 견주 알림은 예전 그대로 | SQL `rls_smoke` L · 🤖 `transit.spec.ts` | ➖ |
| TRIP-18 | 동의 화면에서 **Start without sharing my location** | trip은 생기지만 위치 · ETA · 지도 없음. 이동하는 쪽: "You're not sharing your location — Chloe sees the meeting place." + 만날 장소 카드 + Open in Google Maps(**길 안내**, `maps/dir`, `destination=` 주소). 상대에게는 "Robert is on the way" 알림 | 🤖 `transit.spec.ts` + SQL `rls_smoke` L | ➖ |
| TRIP-19 | 기다리는 쪽이 공유 없는 trip을 봄 | "Robert is on the way / Robert isn't sharing a live location", 지도 없음, 장소 카드(주소 · 출입 코드는 없음) + Open in Google Maps(**장소**, `maps/search`, `query=` 주소). 주소 글자가 없으면 저장된 좌표로 | 🤖 `transit.spec.ts` | ➖ |
| TRIP-20 | 공유 중인 trip과 Start trip 직전 | Trip 화면과 예약 상세의 Start trip 카드에서도 **양쪽 모두** Open in Google Maps가 보임(이동하는 쪽 = 길 안내, 기다리는 쪽 = 장소). 지도 앱으로 넘어가면 브라우저가 백그라운드가 되어 위치 공유가 멈추고, 상대 화면에 "Last location N min ago — sharing pauses while the browser is in the background" | 🤖 `transit.spec.ts` · 실제 폰에서 Maps로 넘어갔다 돌아오기 👤 | ➖ |
| TRIP-21 | Allow를 눌렀는데 브라우저가 위치를 거절 | 자동으로 공유 없는 trip으로 시작되고 토스트 "Location is off in this browser, so Chloe sees the meeting place instead" | 🤖 `transit.spec.ts` | ➖ |
| TRIP-22 | **두 사람 동시** — 시터(Chloe)가 견주 집으로 Start trip → Simulate, 견주는 Home에 있음 | 견주 Home에 새로고침 없이 "Chloe is on the way" 카드 → 탭하면 지도 + ETA가 줄어들며 갱신 → "Chloe has arrived" 카드. 시터 화면에는 출입 정보 카드. 시터가 Received를 누르면 견주 Trip 화면이 "No trip running"이 되고 예약에 ✓ Received | 🤖 `transit.spec.ts`(브라우저 둘, 같은 DB, 폴링으로 갱신) · **실제 두 계정 · 두 폰 👤** | ➖ |
| TRIP-23 | 견주가 드롭오프 2시간 전 Start trip(위치 공유 중) → 둘 중 한 명이 예약을 **Cancel** (CR-1) | 그 trip이 같은 순간 `cancelled`가 되고 위치 · ETA · 거리가 지워짐. 이동하던 기기의 다음 위치는 `trip_not_active`로 거절돼 공유가 멈추고, 양쪽 Home의 이동 카드가 사라짐 | SQL `rls_smoke` CR-1 · 화면은 👤 (DB는 10/13 적용 — 사람 확인 대기) | ➖ |
| TRIP-24 | 이동 중 ETA가 5분 이하로 줄어듦 (`014r`) | 상대에게 알림 한 번 "Robert is about 5 minutes away 🚗"(`trip_near`, 누르면 Trip 화면), 이후 위치가 더 와도 다시 안 옴. 도착하면 기존 `trip_arrived`. 채팅 카드의 "N min away" 줄과 같은 기준 | SQL `rls_smoke` L · 014r | ➖ |

### 3.19 개인정보 페이지 (PRIV) — Phase 10 · 10.11

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| PRIV-1 | 로그아웃 상태로 Welcome 하단 **Privacy** | `/privacy`가 열리고(섹션은 **한 번에 하나만 펼쳐지는 아코디언**, 처음엔 "What this is"가 열림, 닫힌 섹션도 DOM에는 있음; `/privacy?open=google-calendar-and-meet`로 Google 문단이 바로 열림) 무엇을 저장하는지 · AI(Nebius Token Factory, 진입 코드는 모델에 안 감) · 다른 서비스(OpenStreetMap Nominatim에 집 주소가 한 번, Cloudinary) 문단, **Google Calendar and Meet** 문단(Google 로그인 없음 · `calendar.events`만 · 이벤트에 들어가는 것 · Google API Services User Data Policy / Limited Use 준수 문구)이 있음 | 🤖 `privacy.spec.ts` | 사람 확인 대기 |
| PRIV-2 | 로그인 후 Profile 아래 **Privacy**, 그리고 주소창으로 `/privacy` 직접 열기 | 열리고, 새로고침해도 역할 홈으로 튕기지 않음 | 🤖 `privacy.spec.ts` | 사람 확인 대기 |
| PRIV-3 | 실제 문구가 앱 동작과 맞는지 읽기 (저장 항목 · 보내는 곳 · 보존 기간) | 새 서비스를 붙일 때마다 페이지도 같이 고침 | 수동 | 사람 확인 대기 |
| BRAND-1 | 배포 URL을 브라우저 탭에서 열기 → 즐겨찾기에 추가 | 탭 · 즐겨찾기에 Vercel 기본 아이콘이 아니라 골드 코인 아이콘이 보임(캐시가 남으면 강력 새로고침) | 수동 | 사람 확인 대기 |
| BRAND-2 | iPhone Safari → 공유 → **홈 화면에 추가** · Android Chrome → **홈 화면에 추가** | 홈 화면 아이콘이 골드 코인이고 이름이 Goldito, 안드로이드는 원형으로 잘려도 코인이 안 잘림 | 수동 | 사람 확인 대기 |

### 3.20 Snap 탭 (SNAP) — Phase 12 · D61

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| SNAP-1 | 견주 · 시터로 로그인 → 탭 바 | 탭 5개 `Home · Bookings · Chat · Feed · Snap`(카메라 아이콘, #329), Diary · Mood 탭은 없음 | 🤖 `auth.spec.ts` | 사람 확인 대기 |
| SNAP-2 | **Snap** 탭 → 카드 3개(Treat check · Mood · Sticker) → 각각 클릭 → 뒤로 | 각 도구 화면(`/{역할}/snap/treat` · `mood` · `sticker`)이 열리고(Treat check는 SNAP-5, Mood는 SNAP-11, Sticker는 SNAP-15) 뒤로 가면 Snap 탭. 마우스만으로 가능 | 🤖 `snap.spec.ts` | 사람 확인 대기 |
| SNAP-2b | **Snap** 탭 (Figma 1730:104290): 펫이 둘 이상이면 위에 **아바타 칩**, 아래 색 카드 3장(Treat check 복숭아 · Mood 민트 · Sticker 버터, 오른쪽 흰 원 화살표) | 선택한 펫 이름이 카드 문구에 들어감("Max's allergies"). 카드를 누르면 그 펫이 **이미 골라진 채** 도구 화면이 열림(`?pet=`). 그림은 Figma SVG | 🤖 `snap.spec.ts` | 사람 확인 대기 |
| SNAP-2c | **Recent checks** | 고른 펫의 최근 **2건**: 그림 · 제품명 · 이유 한 줄("Chicken · Max is allergic" · "Nothing on Max's list") · DANGER / WARNING / SAFE 알약. **See all** → 그 펫의 최근 20건 목록, 줄을 누르면 그 결과 | 🤖 `snap.spec.ts` | 사람 확인 대기 |
| ART-1 | **Figma 그림(SVG)**: Snap 카드 · 칩 · Recent checks, 오너 Home 타일(밥그릇 · 카메라 · 나무) · 사진 없는 펫 얼굴(개 · 고양이), 시터 Home 체크인 타일(Ate · Potty · Walk · Mood) · 약 히어로 · 5-second check · Treat check 카드 | 그림이 Lucide 선 아이콘이 아니라 Figma의 색 그림으로 보임. 새 그림은 `assets/art/<화면>/`에 .svg를 넣고 `npm run art` → `HomeArt`의 `art`로 연결(CI가 `art.mjs --check`로 확인). 아직 Lucide인 곳: 고양이 Nap 타일, 약 외의 히어로 그림, 보호자 히어로의 시터 사진이 없을 때 | 🤖 `snap.spec.ts`(그림이 그려짐) · 모양은 사람 확인 대기 | 사람 확인 대기 |
| SAMPLE-1 | **Mumu 샘플** (비숑프리제): 사진 13장 + 영상 1개(17초, 소리 없음). 사진 고르는 모든 곳(피드 · 일기 · 할 일 · 리포트 · Snap · 프로필)과 Mood · Sticker에 나옴, 영상은 사진/영상을 둘 다 받는 곳과 Mood에 | 샘플 목록에 "Mumu · …" 이름으로 보임. 메타데이터(위치 포함) 제거, 창문 사진의 가게 전화번호는 흐리게 처리. 파일은 `assets/demo/mumu/` | 🤖 `media-picker.spec.ts`(목록에 보임) | 사람 확인 대기 |
| BOOKTAB-1 | **오너 Bookings** (Figma 1730:103907): 진행 중인 예약(Requests · Upcoming)이 있을 때 | 맨 위 **Your bookings**: 칩 Upcoming · Requests · Past, 예약은 **티켓 카드**(복숭아색: 집 그림 · "Boarding at Chloe's" · 펫 이름 · DROP-OFF → PICK-UP 큰 날짜 · 단계 알약 Ask · Meet · Book · Care · Home(끝난 단계 ✓) · 상태 태그 · Drop-off / Pick-up 줄("you drive" · 시각, 끝나면 ✓) · Paid + 금액). **Book care**를 누르면 아래 시터 찾기로 내려감. 그 아래 검색창 · Favorites · Sitters nearby | 🤖 `sitter-bookings` | 사람 확인 대기 |
| BOOKTAB-2 | 오너: 진행 중인 예약이 없을 때 | Your bookings와 "No bookings yet"가 **숨겨지고** 시터 찾기가 맨 위. 지난 예약만 있으면 맨 아래 **Past bookings (N)**를 눌러 펼침 | 🤖 `sitter-bookings` · `auth` · `rebook` · `completion` | 사람 확인 대기 |
| BOOKTAB-3 | 시터 Bookings의 예약 카드 | 오너와 같은 티켓 카드("Boarding · Robert", 누가 운전하는지는 시터 기준 "Robert drives" · "you drive"). Past는 예전 작은 카드 | 🤖 `sitter-bookings` | 사람 확인 대기 |
| BOOKTAB-4 | 오너 Bookings의 시터 카드(Favorites · Sitters nearby) | 이름 옆에 후기가 있으면 **★ 4.5**(금색), 없으면 아무것도 안 붙음. 즐겨찾기는 이름 앞 **채워진 하트**(시터 페이지의 하트와 같음, 별 아님). 아래 줄은 **거리가 먼저**: "7 km · 10 yrs exp" | 🤖 `sitter-search` | 사람 확인 대기 |
| SNAP-3 | (API) 견주가 본인 펫 성분표 사진으로 `POST /api/ai/safety-check` — chicken 알러지 Max에 `chicken breast` 라벨 / 개에게 `raisins` / 고양이에게 `lily extract` / `animal fat` / 평범한 라벨 | 차례로 DANGER(모델이 SAFE라 해도) · DANGER · DANGER · WARNING(숨은 출처 설명) · SAFE. 결과에 신뢰 도메인 출처, Tavily가 안 되면 `sources_unavailable`, Ultra가 안 되면 SAFE 대신 WARNING(`double_checked: false`). 라벨을 못 읽으면 422. 남의 사진 · 다른 펫 · 돌보는 중이 아닌 시터는 403 | 🤖 pytest · 실제 모델은 👤 — 모델 직접 호출 확인(라벨 4장 읽기 · Tavily · Ultra WARNING, 2026-10-14 [model-ids.md](phases/notes/model-ids.md)), 라우트 전체는 배포 백엔드에 이 코드가 올라간 뒤(#90 머지) | ➖ |
| SNAP-4 | (DB) 시터가 검사한 DANGER / 견주가 검사한 DANGER / WARNING | 시터 DANGER만 견주에게 "Blocked a risky treat for {이름} ⚠️" 알림 1건. 견주도 "I understand"(`acknowledged_at`)를 남길 수 있음, 판정은 앱에서 못 바꿈 | SQL `rls_smoke` 013 — 호스팅 DB에서 전부 PASS | ✅ 2026-10-14 민식 (SQL) |
| SNAP-5 | 견주(Max chicken 알러지 · Mochi) → Snap → **Treat check** → Max 고르기 → **Snap a label** → 샘플 **Chicken jerky** → **Check for Max** | "Reading the label…" → (8초 뒤) "Checking for Max…" → **빨간 전체 화면** "Don't give this to Max" + 이유 + `chicken` 칩. 폰 프레임 안, 바깥 클릭 · Esc로 안 닫힘, **I understand — don't feed**로만 닫힘 → `acknowledged_at` 기록, 결과 카드 · Recent checks 1줄이 남음. 맨 아래 작은 회색 "AI can be wrong…" 항상 | 🤖 `treat-check.spec.ts`(API 목업) · 실제 판정은 👤(배포 백엔드에 이 코드가 올라간 뒤) | 사람 확인 대기 |
| SNAP-6 | 시터(돌보는 펫 Max 하나) → Treat check → 샘플 **Biscuit** | 펫이 이미 골라져 있고 이 예약에 없는 펫은 안 보임 → 주황 "Ask the owner first", "animal fat may contain chicken — …", 출처 칩(제목 · 도메인, 클릭하면 새 탭), "Ingredients we read" 펼치기. 돌보는 펫이 없으면 "No pet in your care right now" | 🤖 `treat-check.spec.ts` | 사람 확인 대기 |
| SNAP-7 | 견주 → 샘플 **Sweet potato** / 출처 없이 온 결과 / Ultra 없이 온 결과 | 초록 "Looks fine for Max ✅" · "Sources unavailable right now." · "We couldn't double-check this one." (견주 WARNING은 "Check with your vet first") | 🤖 `treat-check.spec.ts` | 사람 확인 대기 |
| SNAP-8 | 흐린 사진(422) / 서버 오류(503) | 422 → "Couldn't read the label. Try a closer, well-lit photo." + 버튼 **Retake photo**. 503 → 오류 창 + **Try again** → 같은 사진으로 다시 검사(재업로드 없음) | 🤖 `treat-check.spec.ts` | 사람 확인 대기 |
| SNAP-9 | 시터가 DANGER를 낸 뒤 견주가 알림 "Blocked a risky treat for Max ⚠️"를 탭 | `/owner/snap/treat?check=…` → 그 검사가 열리고 아직 아무도 확인 안 했으면 빨간 화면 → 확인하면 결과 카드 | 🤖 `treat-check.spec.ts`(링크 직접 열기) · 알림 탭은 👤(`013` 적용됨 — 배포 백엔드에 이 코드가 올라간 뒤) | 사람 확인 대기 |
| SNAP-10 | (API) `POST /api/ai/pet-mood` — 개 1마리 사진(크롭 1개) / 개 2마리(크롭 2개) / 영상(프레임 4장) / 펫이 없는 크롭 / 같은 사진 두 번 | 펫마다 박스 + 감정 8개가 **정수 %로 합 100**(서버 규칙, 모델은 태그만) + "seems" 한 줄 + "For fun only — not a behavior or health assessment.". 영상은 프레임 평균 + 평균에 가장 가까운 프레임의 박스. 같은 사진 → 같은 %. 요약에 건강 · 통증 · vet 단어가 있거나 "seems/looks"가 없으면 규칙 문장으로. 못 읽은 크롭만 빠지고, 펫이 하나도 없으면 422, 비전 모델이 다 안 되면 503. 크롭 9개 · 프레임 5장 · 300 KB 초과 · data URL 아님 · 박스 범위 밖은 모델 호출 전에 422. `pet_id`를 주면 그 펫의 견주 · 돌보는 시터만(아니면 403), 저장은 안 함 | 🤖 pytest `test_mood_rules` · `test_ai_pet_mood` · 비전 태그 실제 호출은 👤(우리 사진 8장 직접 호출 확인 2026-10-14) | ➖ |
| SNAP-11 | 견주(Max · Mochi) → Snap → **Mood** → **Pick a photo or clip** → 샘플 사진(예: **Tug of war**) | "Getting your photo ready…" → "Finding your pet…"(첫 사용은 MediaPipe 내려받기로 몇 초) → "Reading the mood…" → 사진 위에 펫마다 **박스**(라벨: 펫 · 1등 감정 %) + **감정 8줄 표**(큰 순, 1등 굵게) + "seems" 한 줄. 맨 아래 "For fun only — not a behavior or health assessment."는 고르기 전부터 항상. 펫 칩은 선택(하나뿐이면 미리 골라짐, 다시 누르면 해제) — 고르면 요약에 이름. 마우스만으로 | 🤖 `mood.spec.ts`(박스는 테스트 훅, API 목업) · 실제 MediaPipe · 모델은 👤 | 사람 확인 대기 |
| SNAP-12 | 개 2마리 사진 → 다른 펫의 박스나 아래 "Pet 2" 칩 클릭 | 박스가 왼쪽부터 Pet 1 · Pet 2, 클릭한 펫의 표 · 요약으로 바뀜. 서버에는 크롭이 왼쪽→오른쪽 순서로 감(사진은 펫 ≤ 4, 영상은 프레임당 ≤ 2) | 🤖 `mood.spec.ts` · 실제 2마리 사진은 👤(샘플 없음) | 사람 확인 대기 |
| SNAP-13 | 샘플 **Fetch play**(영상) | 프레임 4장(20 · 40 · 60 · 80 % 지점)을 보내고 "Average of 4 frames from the clip", 평균에 가장 가까운 프레임과 그 박스를 보여 줌. 30초 넘는 영상은 자르기 시트에서 고른 부분 안에서 | 🤖 `mood.spec.ts`(프레임은 테스트 훅) · 실제 영상 디코딩은 👤 | 사람 확인 대기 |
| SNAP-14 | 펫이 없는 사진 / 서버 422 / 서버 503 | "We couldn't find a pet — try a clearer photo." + **Try another photo**(서버를 부르지 않음) · 422도 같은 문장 · 503은 오류 창 **Try again** → 같은 크롭으로 다시 | 🤖 `mood.spec.ts` | 사람 확인 대기 |
| SNAP-15 | 견주(Max) → Snap → **Sticker** → **Pick a photo** → 샘플(예: **Grass walk**) | "Finding your pet…" → "Cutting out your pet… (a few seconds)"(첫 사용은 모델 30 MB 내려받기, 오리기는 Web Worker라 화면은 계속 움직임) → 사진 위에 탭한 점 · 아래에 **흰 테두리 · 그림자가 있는 투명 스티커** 미리보기. 사진의 다른 곳을 클릭하면 그 자리로 다시 오림. **Save sticker** → "Sticker saved ✂️", Sticker box에 1개. 마우스만으로 | 🤖 `sticker.spec.ts`(오리기 마스크는 테스트 훅, 스티커 그림은 실제 캔버스 코드) · 실제 Magic Touch는 👤(`013b` 적용됨 — 백엔드가 이 코드를 배포한 뒤) | 사람 확인 대기 |
| SNAP-16 | 스티커가 저장된 뒤 Cloudinary · DB 확인 | 올라간 파일은 **PNG 그대로**(`sticker.png`, `image/png` — JPEG로 다시 인코딩하지 않음, 배경 투명), `media.purpose = sticker`, `pet_stickers` 행(만든 사람). 원본 사진은 올라가지 않음 | 🤖 `sticker.spec.ts`(업로드 본문) · SQL `rls_smoke` 013b — 호스팅 DB 전부 PASS (2026-10-14, 민식) · Cloudinary 투명 배경은 👤 | ✅ 2026-10-14 민식 (SQL) |
| SNAP-17 | 시터(Max 돌보는 중)로 Sticker 탭 / 견주가 만든 스티커에 × / 못 오린 사진 | 견주의 스티커도 Sticker box에 보이지만 ×(삭제)는 만든 사람에게만, 삭제는 확인 시트 뒤. 펫을 못 잡은 오리기 → "We couldn't cut out a pet there — tap your pet." + Save 없음. 돌보는 펫이 없으면 "No pet in your care right now" | 🤖 `sticker.spec.ts` · SQL `rls_smoke` 013b(남의 업로드 · 피드 사진으로 스티커 못 만듦, 만든 사람만 삭제) | 사람 확인 대기 |
| SNAP-18 | 견주 → Diary → 보낸 알림장 하나 → **✨ Decorate** → 스티커함에서 하나 클릭 → 스티커를 **마우스로 끌기** → **+** 두 번 · **↻** 한 번 → **Save stickers** → 새로고침 | 알림장 글이 "종이" 위에 있고, 스티커가 종이 가운데에 붙어 끌리는 대로 따라옴(화면 스크롤로 바뀌지 않음), 크기 · 회전 반영, "Stickers saved ✨". 새로고침해도 같은 자리 · 크기 · 각도. 글은 그대로. **Cancel**은 저장한 상태로 되돌리고, 고른 스티커 **Remove**. 스티커가 없으면 "No stickers yet — make one in Snap." + **Make a sticker** | 🤖 `decor.spec.ts`(마우스 드래그) | 사람 확인 대기 |
| SNAP-19 | 시터 → Diary → 오늘 보낸 알림장 카드 / 그 알림장을 견주가 열기 | 시터 카드의 종이에 견주 스티커가 **같은 자리**에(아래 층), 시터도 자기 층을 꾸밀 수 있고 견주 화면에서도 같은 자리에 보임. 서로의 층은 못 바꿈, 알림장 초안에는 견주가 못 붙임 | 🤖 `decor.spec.ts` · SQL `rls_smoke` 013b · 두 계정 실제 확인은 👤(`013b` 적용됨 — #90 머지 뒤) | 사람 확인 대기 |
| SNAP-20 | 견주 → Diary → 보낸 알림장 / 시터 → Diary → 오늘 보낸 알림장 | **그림일기 한 장**: 맨 위 "📅 Monday, Oct 5" · "Max's day 🐾", 가운데 그림 칸(그날 첫 사진, 없으면 🖍️), 아래 줄 공책 위에 손글씨 글꼴(Gaegu)로 알림장 글. 두 화면의 종이가 같아서 스티커가 같은 자리 | 🤖 `decor.spec.ts`(머리말 · 그림 칸) · 손글씨 글꼴 · 사진은 👤 | 사람 확인 대기 |
| SNAP-21 | ✨ Decorate → **Goldito stickers**에서 하나(예: ❤️) → **⬇ Behind text** → 끌기 → Save | 새 스티커는 글 위, 누르면 **글 아래**로 지정(다시 **⬆ Over text**) — 꾸미는 동안은 반투명으로 위에 떠서 마우스로 끌 수 있고, **Save** 뒤에는 글씨가 스티커 위에 보임. 저장 뒤 새로고침해도 글 아래. 기본 스티커는 업로드 없이 바로(`preset:heart`) | 🤖 `decor.spec.ts` | 사람 확인 대기 |
| SNAP-22 | Sticker 미리보기 **⬇ Download sticker** / 스티커함 타일 ⬇ | 브라우저가 `goldito-max-sticker.png`(투명 PNG)를 저장. 타일 ⬇는 Cloudinary 원본(`fl_attachment`) | 🤖 `sticker.spec.ts`(미리보기 다운로드) · 타일 다운로드 · 실제 폰 저장은 👤 | 사람 확인 대기 |
| SNAP-23 | 견주(Max · 검사 4번) → Snap 탭 → 카드 3개 아래 | **Recent checks**에 가장 최근 3개(상태 칩 · 제품 이름 · 날짜, 새것이 위). 한 줄을 클릭하면 `/{역할}/snap/treat?check=…`로 그 검사가 열림(SNAP-9와 같은 화면). 검사가 하나도 없으면 이 목록 자체가 안 보임. 시터는 지금 돌보는 펫들의 검사만 | 🤖 `snap.spec.ts` | 사람 확인 대기 |
| SNAP-24 | 견주 → Diary → 꾸민 알림장 / 시터 → Diary → 오늘 보낸 알림장 → **↗ Share → ⬇ Download image** (11.8, DB.5부터 Share 시트 안) | 브라우저가 `goldito-max-diary-2026-10-05.png`를 저장하고 "Saved Max's diary page 📔". 그림은 화면의 종이 그대로: 머리말 · 그림 칸(그날 첫 사진) · 줄 · 손글씨 글 · **두 사람의 스티커**(글 아래 · 위 층, 크기 · 회전 포함), 화면의 2배 해상도. 꾸미는 중에는 버튼이 없음(먼저 Save stickers). 사진 하나를 못 불러오면 그것만 빼고 저장 + "Saved — one picture couldn't be added" | 🤖 `decor.spec.ts`(파일 이름 · PNG 크기 · 가운데 스티커 픽셀) · 실제 사진 · 손글씨 글꼴 · Safari · 폰 저장은 👤 | 사람 확인 대기 |

### 3.21 Snap 리뷰 수정 (SR) — [review-2026-10-15.ko.md](review-2026-10-15.ko.md) *(P0 SR-1 – SR-4만, ID는 리뷰 문서 항목과 같음 · Later SR-5 – SR-21은 고칠 때 여기에 추가)*

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| SR-1 | (API) 성분표 끝이 잘린 사진 · 모델이 `complete: false` / 쉼표 없이 한 줄로 온 129자 목록 끝에 `xylitol` / 61번째 성분이 `xylitol` | 무해한 앞부분만 읽혀도 **SAFE가 아님** — 최소 WARNING + "We could only read part of the label — retake a photo of the whole ingredient list." 계열 문장 + **Retake photo**. 한 줄 목록은 다시 나눠져 DANGER | 🤖 `test_ai_safety_check.py` (`test_a_partly_read_label_is_never_safe` · `test_a_list_sent_as_one_string_is_split_again` · `test_more_than_sixty_ingredients_is_partial` · `test_a_complete_label_stays_safe`) · `treat-check.spec.ts` (`treat-partial`). 👤 실제 모델이 `complete`를 주는지: 샘플 라벨 4장 + 끝을 가린 사진 1장 → [model-ids.md](phases/notes/model-ids.md)에 기록 | 수정됨, 사람 확인 대기 |
| SR-2 | (API · 규칙) 알러지 `eggs` + "dried egg product" / `poultry` + "chicken breast" / milk + "sodium caseinate" / fish + "fishmeal" · "catfish" / dairy + "buttermilk powder" | 전부 규칙만으로 **DANGER**(모델이 SAFE라 해도) | 🤖 `test_safety_rules.py::test_an_allergy_typed_freely_still_matches_label_words` · `test_allergen_keys_normalize_what_a_person_typed` | 수정됨, 사람 확인 대기 |
| SR-3 | (API · 규칙) dairy + "peanut butter" / dairy + "butter" / chicken + "beef liver" / chicken + "liver" / chicken + "chicken liver" | 규칙 판정이 차례로 SAFE · DANGER · SAFE · WARNING · DANGER. 시터의 "peanut butter" 검사로 견주에게 "Blocked a risky treat" 알림이 가지 않음 | 🤖 `test_safety_rules.py::test_look_alikes_and_named_animals_do_not_raise_false_alarms` | 수정됨, 사람 확인 대기 |
| SR-4 | 견주 → Snap → Treat check → 샘플로 검사 → **뒤로** | Snap 탭 **Recent checks** 맨 위에 방금 한 검사(새로고침 없이) | 🤖 `snap.spec.ts` (`the newest three treat checks are listed…` — a check added while Treat check is open shows on Back) | 수정됨, 사람 확인 대기 |

### 3.22 사진 요청 (PHOTO) — Phase 11.1 · *사전: 시터가 돌보는 중(확정 예약, 지금이 맡긴 시각 30분 전 ~ 데려가는 시각)*

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| PHOTO-1 | (DB) 견주가 돌봄 중인 펫에 `request_photo` → 다시 한 번 | 열린 요청 1개(같은 예약 · 펫에 하나만, 두 번째는 같은 요청을 돌려줌), 시터에게 `photo_request` 알림 1개 "{견주} asked for a photo of {펫} 📷". 돌봄 중이 아닌 펫은 `not_in_care`, 남의 펫은 `not_allowed`, 표에 직접 쓰기 · 시터가 손으로 닫기는 막힘 | SQL `rls_smoke` 014 | 자동 통과 대기(CI) |
| PHOTO-2 | (DB) 시터가 그 펫의 **나만 보기** 사진 → **공유** 사진 | 나만 보기는 요청을 그대로 둠. 공유 사진이 요청을 `fulfilled`로(`fulfilled_post_id`), 견주에게 "Here's the photo of {펫} you asked for 📷" **하나만**(같은 사진의 `feed_post` 알림은 안 감). 그 뒤 견주는 다시 요청 가능 | SQL `rls_smoke` 014 | 자동 통과 대기(CI) |
| PHOTO-3 | (옮김, #345) 견주의 **Request photo**는 채팅 카드에 있고 Feed에는 버튼이 없음 | Feed 화면에 Request photo 버튼 없음. 요청이 답을 받으면(`photo_request_fulfilled` 알림) 피드가 새 사진을 다시 불러옴 | 채팅 쪽은 `chat-trip` 등 | 사람 확인 대기 |
| PHOTO-4 | 시터 → Home (견주가 Max 사진을 요청한 상태) → 배너 **📷 {견주} asked for a photo of Max — tap to share** → Max 피드 → **+ Photo** → 샘플 → **Save**로 공유 → Home | 배너 탭(또는 벨의 `photo_request` 알림)이 `/sitter/feed/{펫}`를 연다. 공유 사진이 요청을 끝내고 견주에게는 `photo_request_fulfilled` 알림 하나만, Home에 돌아오면 배너 없음. 새 요청은 Home을 떠나지 않아도 배너로 보인다(알림 수신 때 다시 읽음) | 🤖 `photo-request.spec.ts` | ✅ 2026-10-15 Minsik (두 브라우저 · 로컬 앱 + 호스팅 DB, 새로고침 없이) |
| PHOTO-5 | 견주 → Home (요청이 답을 받은 뒤) | `photo_request_fulfilled` 알림이 `feed_post`처럼 Home 라이브 카드(📷)·Diary Live 새로고침·벨 상세(사진이 있으면 **See in Feed**)로 보이고, 누르면 그 펫의 Feed | 🤖 `photo-request.spec.ts` | ✅ 2026-10-15 Minsik (두 브라우저 · 로컬 앱 + 호스팅 DB, 새로고침 없이) |

### 3.23 Split view (SPLIT) — Phase 10 · 10.10 · *방식 A: 기본은 폰 하나, `?view=split`일 때만 두 폰*

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| SPLIT-1 | 컴퓨터(1440 × 900) → `/?view=split` | 폰 두 개 나란히, 위에 둘 다 "Not signed in". **자동 로그인 없음**: 각 폰은 로그인 화면에서 시작하고, 거기서 Demo owner / Demo sitter(또는 직접 로그인)로 들어가면 폰 위 이름이 "Robert · Owner" 같이 바뀜. 주소창은 `/?view=split` 그대로 | 🤖 `split.spec.ts` | 사람 확인 대기(2026-10-18 자동 로그인 제거) |
| SPLIT-2 | 시터 폰에서 **Log out** → 견주 폰 새로고침 | 시터 폰만 Welcome, 견주 폰은 로그인 유지 (폰마다 저장 키 `goldito-auth-pane-left` · `goldito-auth-pane-right`) | 🤖 `split.spec.ts` | ✅ 2026-10-15 Minsik (Chrome 전체 화면, 로컬 앱 + 호스팅 DB) |
| SPLIT-3 | 폰 하나 화면 아래 **Show both phones** → split 화면 아래 **Show one phone** | 두 폰 ↔ 폰 하나로 바뀜 | 🤖 `split.spec.ts` | ✅ 2026-10-15 Minsik (Chrome 전체 화면, 로컬 앱 + 호스팅 DB) |
| SPLIT-4 | 폭 800 창 또는 휴대폰에서 `/?view=split` → (컴퓨터) 다시 넓히기 | 폰 하나(휴대폰은 앱만), Show both phones 링크 없음. 다시 넓히면 두 폰으로 돌아오고 주소창도 `/?view=split` (2026-10-15 수정: 전에는 폰 하나로 남음) | 🤖 `split.spec.ts` (폭 800 · 800 → 1440) | ✅ 2026-10-15 Minsik (Chrome, 줄였다가 다시 넓히기 포함) |
| SPLIT-5 | (DoD) 1440 × 900 → `/?view=split` → 시터 폰에서 사진 공유 또는 Complete with photo | 견주 폰에 토스트 ≤ 3초, 새로고침 없이. 1366 × 768 노트북에서도 두 폰이 잘리지 않음 | 👤 (e2e mock에는 실시간 없음) | ✅ 2026-10-15 Minsik (Chrome 전체 화면, 로컬 앱 + 호스팅 DB) |

### 3.24 Settings · What's New (SET) — Phase 11.11

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| SET-1 | 견주 / 시터 → ≡ 메뉴 → **Settings** | Account(이름 · 이메일 · Pet owner/sitter · **Edit profile**), Notifications 안내, **About**(Privacy · 앱 버전), Log out. What's New는 여기에 없음. Edit profile은 Profile을 열고, Profile 맨 아래에는 Settings · What's New · Privacy 링크가 없음 | 🤖 `settings.spec.ts` | 사람 확인 대기 |
| SET-4 | ≡ 메뉴 → **What's new** | 출시(1.0.0) 이후에 생긴 것만 버전별로. 지금은 출시 전이라 "Nothing new yet". 해커톤까지의 기능(P0)은 적지 않음. 출시 후 기능은 CHANGELOG.md에 새 버전으로 적고 `node scripts/changelog.mjs` | 🤖 `settings.spec.ts` · `node --test scripts/changelog.test.mjs` | 사람 확인 대기 |
| SET-2 | `docs/CHANGELOG.md`의 `### Planned` 항목과 0.x 버전 | 앱 What's new에 보이지 않음(출시 후 것만) | 🤖 `settings.spec.ts` · `node --test scripts/changelog.test.mjs` | 사람 확인 대기 |
| SET-3 | (개발) CHANGELOG.md만 고치고 `node scripts/changelog.mjs`를 안 돌린 PR | CI frontend 잡의 "What's New matches docs/CHANGELOG.md" 단계가 실패 | CI | ➖ |


### 3.25 Figma 디자인 적용 (DS) — FIG-1 · 기준: Muk의 [Goldito-Design](https://www.figma.com/design/stZjrJJU6KOhLauxPjaV8l/Goldito-Design) Components 페이지

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| DS-1 | 로그인 화면 · 아무 폼 | 입력칸 테두리가 진한 회색(`borderStrong`), 안쪽 여백 8 / 16, 높이 44. 비활성 버튼(Sign in 빈 칸일 때)은 **회색 칸 + 흐린 글자**(반투명 초록이 아님) | 👤 | 사람 확인 대기 |
| DS-2 | 아무 Primary / Secondary 버튼 누르기 | 누르는 동안 살짝 작아지고 흐려짐(0.97 · 0.85). Secondary는 흰 바탕 + 진한 테두리 + 초록 글자 | 👤 | 사람 확인 대기 |
| DS-3 | 버튼이 있는 빈 화면(`EmptyState`에 action이 있는 곳) | 버튼이 꽉 찬 초록이 아니라 **흰 Secondary 버튼, 글자 길이만큼** 가운데 | 👤 | 사람 확인 대기 |
| DS-4 | SegmentedControl(종 선택, Bookings 탭 등) | 선택 안 된 칸 테두리가 진한 회색, 선택된 칸은 초록 테두리 + 연두 바탕 | 👤 | 사람 확인 대기 |
| DS-5 | 로그아웃 상태로 Welcome · 로그인 화면 | 맨 위에 **골드 태그 로고 + 초록 "goldito" 글자**(이모지 `🐾 Goldito` 아님). 태그 안 g는 초록, i 점은 금색 하트 | 👤 | 10/16 민식 화면 확인 대기 |
| DS-6 | 배포된 사이트의 브라우저 탭 | 탭 아이콘이 초록 바탕 골드 태그 | 👤 | 배포 후 확인 |
| DS-7 | 예약 카드 · 예약 상세 · 시터 Home 할 일 · 견주 케어 할 일 · 알림장 보냄 · 간식 체크 결과 | 상태 표시가 모두 **Tag** 하나로: 글자가 자기 톤의 연한 바탕 위(완료 = 초록, 지연·놓침 = 주황 — 빨강 아님, 대기 = 흰 바탕 + 테두리, 요청 등 = 연두). 시터 이니셜 원은 진한 초록 + 흰 글자, 펫·Snap 도구 원은 연두 + 이모지 | 👤 | 10/16 서버에서 예약 화면만 확인 · 나머지 확인 대기 |
---

### 3.25 다이어리 책 (DBK) — Diary book DB.3 – DB.5 · *사전: 보낸 알림장 몇 장(펫 둘 이상이면 좋음)*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| DBK-1 | 견주 → **Diary** 탭 → 펫 **표지**(Max) 누르기 | 보낸 알림장이 펫마다 **한 권의 책**: 맨 위 **‹ Diaries**, 그 아래 **‹ · "Max · Oct 7" · Page 2 of 2 · ›**, 그 펫의 가장 **최근 장이 펼쳐져** 있음. 초안은 안 보임. 쪽 아래 "From {시터}"와 그날 할 일(✓ / ⚠️ missed) | 🤖 `diary-book.spec.ts` · `report.spec.ts` | 사람 확인 대기 |
| DBK-2 | **‹** / **›** 누르기 | 오래된 → 최신 순서로 한 장씩(여러 날 · 여러 펫이 날짜순으로 섞임), 첫 장에서 ‹ · 마지막 장에서 ›는 꺼짐. 넘길 때 종이가 왼쪽 모서리(책등)를 축으로 넘어가는 모션 | 🤖 `diary-book.spec.ts` · 모션은 👤 | 사람 확인 대기 |
| DBK-3 | (표지) **‹ Diaries** → 다른 펫(**Mochi**) 표지 | 그 펫의 쪽만, 그 펫의 최신 장부터. 다른 펫의 쪽은 이 책에 없음 | 🤖 `diary-book.spec.ts` | 사람 확인 대기 |
| DBK-4 | 손가락(폰) / 마우스로 쪽을 **왼쪽으로 끌기**, **오른쪽으로 끌기**, 조금만 끌다 놓기 | 왼쪽 → 다음 날, 오른쪽 → 전날: 끄는 만큼 종이가 들리고 놓으면 넘어감(폭의 30% 넘게, 또는 빠르게 튕기기). 조금만 끌면 제자리로. 위아래로는 화면이 그대로 스크롤. ✨ Decorate 중에는 책이 안 넘어감(스티커 끌기와 안 섞임) | 🤖 `diary-book.spec.ts`(마우스 끌기) · 폰 손가락 · Safari는 👤 | 사람 확인 대기 |
| DBK-5 | 알림 "…sent Max's daily report" 누르기(`/owner/diary/{id}`) | 책이 **그 장으로** 열림, 앞뒤로 넘길 수 있음 | 🤖 `diary-book.spec.ts` | 사람 확인 대기 |
| DBK-6 | 시터 → **Diary** → **Diary book** | 지금까지 보낸 쪽 전부(돌봤던 펫마다 표지, 누르면 그 펫의 책), 최신 장부터, 초안 없음. 지금 돌보는 펫이 없으면 Diary를 열면 바로 표지들 | 🤖 `diary-book.spec.ts` | 사람 확인 대기 |
| DBK-7 | (대체됨, #345) 예전에는 Feed 그리드 사진 사이에 다이어리 칸이 끼었음 | 지금은 Feed 안의 **Photos · Diary** 전환 탭에서 다이어리를 봄(칸은 그리드에서 뺌) | 🤖 `diary-book.spec.ts`(책 열기 · 알림) | 사람 확인 대기 |
| DBK-8 | (대체됨, #345) 시터 쪽도 같음 | 시터는 Feed의 **Photos · Diary** 전환 탭 → Diary book에서 보낸 장을 봄 | 🤖 `diary-book.spec.ts` | 사람 확인 대기 |
| DBK-9 | (DB.5) 보낸 장 아래 **↗ Share** | 시트 "Share {펫}'s page": **↗ Share image**(폰 브라우저처럼 파일 공유가 되는 곳에서만 — 카톡 · 메시지 등 공유 시트로 PNG), **⬇ Download image**(`goldito-max-diary-2026-10-05.png`), 안내 "A link is a public copy of this page as an image: anyone who has the link can open it." 뒤 **🔗 Copy public link** → 그때 처음 이미지를 올림(`diary_page`, 014b) → 링크가 클립보드에 복사되고 칸에도 보임. 같은 장 · 같은 스티커면 다시 눌러도 같은 링크(다시 안 올림), 스티커를 바꾸면 새 링크 | 🤖 `decor.spec.ts`(다운로드 PNG · 링크 업로드 1번 · 목적 `diary_page`) · 폰 공유 시트 · 실제 Cloudinary 링크는 `014b` 적용 뒤 👤 | 사람 확인 대기 |
| DBK-10 | (DB) `rls_smoke.sql`의 014p 블록 | 오너가 자기 펫의 일기 쪽을 `add_owner_diary_entry`로 씀: 곧바로 **보냄** 상태, 앞뒤 공백 제거, 작성자는 오너, 하루에 여러 장 가능, 알림 없음 · 같은 펫을 돌보는 시터는 **못 봄**(작성자 열이 오너라서) · 다른 오너 · 시터는 쓸 수 없음(`not_owner`) · 빈 글(`body_required`)과 2000자 초과(`body_too_long`) 거부 · anon 불가 · 오너는 자기 쪽에 스티커 가능 | SQL `rls_smoke` | ➖ |
| DBK-11 | 견주 → **Diary** → **✏️ Write a page** (펫이 둘 이상이면 위에서 펫 고르기) | 시트 "New page": 그림일기 종이 위에 바로 쓰기("Dear diary, today…"), 글이 비면 Save page는 꺼짐. **+ Photo**로 사진 한 장(선택). Save page → "Page saved", 책이 새 장("Your page")으로 열림. 사진은 **Feed에 비공개**로도 남고 종이의 그림 칸에 보임. 알림 없음, 시터는 못 봄. ✨ Decorate로 스티커도 붙임. 일기가 하나도 없어도 버튼이 있음 | 🤖 `diary-owner-entry.spec.ts` | 사람 확인 대기 |
| DBK-12 | (#186) 돌보는 펫이 있는 시터 → Diary → 직접 쓰기 → Send / 스티커 | 시터는 돌보는 펫의 오늘 쪽을 직접 쓰고 보낼 수 있음(AI 칩 · 사진 제안도 그대로 동작). Snap에서 만든 스티커는 오너 · 시터 둘 다의 ✨ Decorate 서랍에 뜨고 쪽에 붙음(오너가 새로 쓴 쪽 포함). 코드 점검에서 막는 곳은 못 찾음. 돌봄 시간이 끝나고 2시간이 지나면 DB가 쓰기를 막음(`not_on_duty`) | 🤖 `report.spec.ts` · `decor.spec.ts` · `diary-owner-entry.spec.ts` | 사람 확인 대기 |
| DBK-13 | (#186) 견주가 **Diary**를 연 채로 시터가 알림장을 Send | 새로고침 없이 쪽 수가 늘어남("Page 3 of 3" → "Page 3 of 4"), 읽던 쪽은 그대로(맨 뒤로 튀지 않음), 스피너 없음. 알림 벨도 같이 올라감 | Realtime은 e2e에서 흉내 내지 않음 → 👤만. 2026-10-20 **어시스턴트(사람 아님)**가 Paul 데모 세트로 `?view=split`에서 실행: 위 동작 확인 | 사람 확인 대기 (어시스턴트 실행만, 사람 확인 아님) |
| DBK-14 | (#243) 견주 · 시터 → Diary book(시터는 **Diary book** 칩) | **펫마다 표지 하나**: 펫 사진(그 펫의 가장 최근 사진, 없으면 🐶 · 🐱) · "Max's diary" · "2 pages". 표지를 누르면 그 펫의 책이 열리고, **‹ Diaries**로 표지들로 돌아옴. 알림 · Feed 칸에서 들어오면 표지를 건너뛰고 그 장이 펼쳐짐 | 🤖 `diary-book.spec.ts`(표지 · 펼침 · 돌아오기) · 사진 썸네일은 👤. Figma 프레임 없음, 와이어프레임 수준(Muk 확인 대기) | 사람 확인 대기 |
| DBK-15 | (#243) 책의 모든 쪽 · 표지 · 쓰기 시트의 쪽 | 쪽 **왼쪽에 스프링 제본**(고리가 줄지어 있음), 글 · 스티커 위치는 그대로, 쪽 넘김 · 스티커 끌기가 평소처럼 동작 | 🤖 `diary-book.spec.ts`(spiral 보임) · 모양은 👤(Muk) | 사람 확인 대기 |
| DBK-16 | (#243) 긴 쪽(예: 2000자)을 책에서 열기 / 쓰기 시트에 길게 쓰기 | 쪽이 **마우스 휠**로도, 쪽 위를 **위아래로 끌어서**도 스크롤됨(끌어도 쪽이 넘어가지 않음, **옆으로** 끌 때만 넘어감). 화면 오른쪽에 **얇은 스크롤바**가 보임(Diary 화면 · 새 쪽 시트 한정, 앱의 다른 화면은 그대로 숨김) | 🤖 `diary-book.spec.ts`(휠 · 세로 끌기 · 쪽 안 넘어감 · `data-scrollbar`) · 폰 손가락 · 스크롤바 모양은 👤 | 사람 확인 대기 |
| DBK-17 | (#243) 견주 **✏️ Write a page** 시트 / 시터 Diary의 오늘 쪽에서 글을 쓰는 중에 **✨ Decorate** → 스티커 하나 붙이고 **Save stickers** → **Save page** / **Send** | 쪽이 저장되기 전에도 스티커를 붙일 수 있음("Stickers added ✨", 아직 DB에는 없음, **↗ Share**는 아직 없음). 쪽을 저장하거나 보내면 스티커가 같이 저장되어 책에서 같은 자리에 보임. 새로고침하면 쓰던 글과 함께 사라짐(저장 전이라서) | 🤖 `diary-owner-entry.spec.ts` · `report.spec.ts` | 사람 확인 대기 |
| DBK-18 | (DB) `rls_smoke.sql`의 014t 블록 | 작성자만 `delete_diary_page`로 지움(초안 · 보낸 쪽, 시터의 쪽이면 견주 책에서도 사라지고 스티커 · "report sent" 알림도 같이 지워짐, **Feed 사진은 그대로**, 두 번 지우면 `not_found`) · 견주는 `hide_diary_page`로 시터가 보낸 쪽을 **자기 책에서만** 숨김(시터 쪽은 그대로, 그 쪽의 알림만 지워짐, 두 번 숨겨도 무방, 자기 쪽 · 초안은 못 숨김, 시터 · 다른 견주는 `not_owner`) · `set_diary_page_photo`는 작성자가 같은 펫의 자기 이미지(feed · report)만 붙임(남의 사진 · 다른 펫 · 영상은 `bad_photo`, 견주는 시터 쪽에 못 붙임) · anon 불가 | SQL `rls_smoke`(로컬 Postgres 17에서 전체 PASS 940 · FAIL 0, 어시스턴트 실행). **호스팅 DB에는 아직 안 올림**(사용자가 시킬 때) | 사람 확인 대기 |
| DBK-19 | (#243) 쪽 아래 **Delete page**(내가 쓴 쪽: 견주의 자기 쪽 · 시터의 쪽, 시터는 Today의 보낸 쪽 카드에도 있음) → "Delete this page?" 시트 → **Delete** | 짧은 확인 뒤 쪽이 지워지고 "Page deleted". 시터의 쪽이면 "The owner loses it too."라고 알려 주고 견주 책에서도 사라짐(스티커 · 알림 같이). 견주의 자기 쪽은 시터 쪽에 영향 없음. Feed 사진은 그대로. 내가 쓰지 않은 쪽에는 버튼이 없음 | 🤖 `diary-owner-entry.spec.ts`(견주 삭제 · 시터 삭제, 목 DB) · DB는 DBK-18 · **호스팅 DB에 `014t`를 올린 뒤** 실제 앱에서 👤 | 사람 확인 대기 |
| DBK-20 | (#243) 견주 → 시터가 보낸 쪽 아래 **Hide page** → "Hide this page?" → **Hide** | "It leaves your diary. {시터} keeps their copy." 확인 뒤 내 책에서만 사라지고(새로고침해도 숨겨진 채) 시터의 책에는 그대로. 숨김을 되돌리는 화면은 아직 없음 | 🤖 `diary-owner-entry.spec.ts`(숨김 · 새로고침) · DB는 DBK-18 · **`014t` 적용 뒤** 두 계정 실제 확인은 👤 | 사람 확인 대기 |
| DBK-21 | (#243) 견주 새 쪽 시트에서 **+ Photo** → 사진 고르기 / 시터가 Diary에서 **📷 Add photo**로 사진 추가 → Send | 견주: 고른 사진이 **바로 쪽의 그림 칸에** 보임(저장 전), 저장하면 책의 그 쪽에도 같은 사진(Feed에는 비공개로도 남음). 시터: 쓰는 쪽의 그림 칸에 첫 사진이 보이고, Send하면 견주가 읽는 쪽에도 그 사진이 있음(사진 두 장이면 첫 장만). 사진이 없는 쪽도 평소처럼 저장 · 전송됨(그림 칸은 그날의 첫 공유 사진, 없으면 🖍️). 쪽을 지워도 Feed 사진은 그대로 | 🤖 `diary-owner-entry.spec.ts`(미리보기 · `media_id` · 사진 없는 쪽) · `report.spec.ts`(`media_id` 저장). 실제 Cloudinary 이미지 모양은 **호스팅 DB에 `014t`를 올린 뒤** 👤 | 사람 확인 대기 |

> **2026-10-20 어시스턴트 실행 (사람 아님):** Paul 데모 세트(견주 Peter · 시터 Paul, Biscuit · Luna, `in_care`로 리셋)로 `?view=split` 로컬 앱 + 호스팅 DB에서 DBK-11(글 · 사진 · 비공개 Feed · 시터에게 안 보임 · 알림 없음), DBK-12(시터 직접 쓰기 · Send · AI 칩 · 사진 칩 · 초안), Snap 스티커가 견주 · 시터 Decorate 서랍에 뜸, DBK-7(Feed의 📔 칸)을 돌려 봤고 오류는 없었다. 이 줄은 "사람이 확인함"이 아니므로 위 시나리오의 상태는 그대로 **사람 확인 대기**다.

### 3.26 시터 검색 (SEARCH) — 03B SS · *사전: 호스팅 DB에 `014c`, 견주 프로필에 집 위치(데모 Robert는 시드에 있음), 시터의 일정 · 집 위치(데모 Chloe는 시드에 있음, 약 7 km)*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| SEARCH-1 | (DB) `rls_smoke.sql`의 014c 블록 | 7 km → 3 km · 6.4 km 시터만, 가까운 순 · 6 km면 6.4 km 시터 빠짐 · 8 km에도 9 km 시터 없음 · 맡기기 시각이 시터 시간 밖이면 반경 100 km에도 없음 · 열지 않은 날 · 정원 초과도 없음 · 앱이 보낸 좌표로 검색 · 집 없음 → `no_home_point` · 반경 0 / 101 → `invalid_radius` · 시터 `forbidden` · anon 권한 없음 · 결과에 좌표 컬럼 없음 · (014i) 즐겨찾기 시터는 반경 밖(30 km)이어도 일정이 맞으면 거리와 함께 나옴, 일정이 안 맞거나 즐겨찾기가 아니면 안 나옴, 오너별로 다름 · 마지막 반경 저장, 101 km 거부 | SQL `rls_smoke` | ➖ |
| SEARCH-2 | 견주 → **Bookings** 탭 열기 | 맨 위에 한 줄 검색 바(📍 장소 · 📅 날짜 · 🐾 펫)와 그 아래 반경 슬라이더. **Search 버튼은 없음**: 장소 · 날짜 · 시간 · 펫 · 반경 중 무엇이든 바꾸면 잠깐 뒤 저절로 다시 검색됨. 결과는 **Favorites**(즐겨찾기 중 그 기간이 맞는 시터)가 맨 위, 그 아래 **Sitters nearby**(나머지, 반경 안에서 머무는 내내 가능한 시터)가 한 줄씩(아바타 · 이름 · 거리). 즐겨찾기가 없으면 Sitters nearby만. 아래에 Chats · 예약 · 질문 | 🤖 `sitter-search` | 사람 확인 대기 |
| SEARCH-3 | 검색 바 바로 아래 **Within** 슬라이더(1~100 km, 1 km 단위: 끌기 · 트랙 클릭 · →/PageUp) | 처음 **5 km**(이전에 바꿨다면 마지막 값), 쉬면 한 번만 다시 검색해 목록이 바뀜. 마지막 반경이 저장되어 다음에 열 때 그 값 | 🤖 `sitter-search` | 사람 확인 대기 |
| SEARCH-4 | 날짜 칸 → 범위 달력에서 시작일 · 종료일을 차례로 누르고 시간 −/+ 또는 시간 값을 눌러 시계로 설정 | 바에 "Oct 24 - 28"처럼 한 줄로 나오고, **Done** 뒤 자동으로 다시 검색. 펫 칸에서 펫을 바꿔도 같음 | 🤖 `sitter-search` | 사람 확인 대기 |
| SEARCH-5 | 장소 칸 → **Current location** / 주소 · **우편번호** 입력 후 Use this place | 현재 위치는 브라우저가 한 번만 묻고 그 좌표로 검색, 찾은 주소가 번지수까지 검색 바(첫 부분, 예 "12 Dundas St W")와 시트의 Current location 아래(전체, 예 "12 Dundas St W, Toronto, ON M6J 1G1")에 보임. 이때만 반올림 없는 좌표로 조회(`exact`, 처리방침에 적음), 시터는 보지 못함. 노트북은 위치 오차로 번지수가 다를 수 있음. 주소를 못 찾으면 거리, 동네 이름, "Current location" 순. **My home**도 검색 바에 Profile의 집 주소(첫 부분, 예 "120 Harbord St"), 시트에 전체 주소(#268), 차단되면 푸는 법 안내(집 기준 유지). 우편번호(예 M5V 2T6)는 전체 코드를 못 찾으면 앞 3자리(M5V)로 다시 찾음. 못 찾으면 "Couldn't find that place". 주소 조회는 백엔드(`/api/geo/geocode`)가 떠 있어야 함 | 🤖 `sitter-search`(위치 · 조회 목업) · 실제 브라우저 권한은 👤 | 사람 확인 대기 |
| SEARCH-6 | 집 위치가 없는 견주 | 목록 자리에 "Your home isn't on the map yet." + Open Profile. 장소 시트에서 현재 위치 · 주소로 검색 가능 | 🤖 `sitter-search` | 사람 확인 대기 |
| SEARCH-7 | 맞는 시터가 없음 | Favorites에서는 "No favorites free for these dates.", 주변 목록에서는 "No sitters within N km for these dates." | 🤖 `sitter-search` | 사람 확인 대기 |
| SEARCH-8 | 시터 줄의 **아바타**(사진이 있으면 큰 사진 보기, 없으면 프로필) / **이름**(시터 프로필) | 시터 상세(`/owner/sitters/{id}`)가 열림(머무는 날짜 · 시간 · 펫이 주소에 실림). 시터를 이미 고른 채 Book care가 열리면 시터 목록은 그 시터 하나만 | 🤖 `sitter-search` | 사람 확인 대기 |

### 3.27 시터 온보딩 (ONB) — 3D.2 · #139 · *DB와 번호 질문 화면까지 — 나머지 화면 시나리오는 단계가 끝날 때마다 아래에 추가*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| ONB-1 | (DB) `rls_smoke.sql`의 014f 블록 | 모든 질문을 건너뛰고 끝내도 `onboarded_at`이 찍히고 아무것도 저장되지 않음 · 빈 답은 건너뜀으로 처리 · 저장하면 목록 전체가 교체됨 · `multiple_owners` · `max_pets` · 자기소개가 `accepts_multiple_owners` · `default_max_pets` · `bio`로 복사됨 · 음성 답은 근거 문장을 가짐 · 선택지 밖 값 · 모르는 질문 · 질문 없는 직접 질문 · 목록이 아닌 입력 · 601자 소개는 거부되고 아무것도 바뀌지 않음 · 다른 시터는 못 읽고 오너는 모두 읽음 · 오너 `forbidden` · 직접 쓰기 / anon은 권한 없음 | SQL `rls_smoke` (로컬 Postgres 17 전체 파일 744 PASS, 2026-10-17) | 호스팅 DB에 `014f` 적용 후 |
| ONB-2 | **새 시터**로 가입(또는 `onboarded_at`이 null인 시터)해 로그인 | 시터 홈 대신 **"Tell us how you look after pets"**(음성 · 직접 입력) 화면이 먼저 열림. **Skip**을 누르면 질문 1번부터 **한 화면에 질문 하나**(큰 글씨, 진행 막대, Back). 선택지는 큰 버튼이고 하나를 누르면 잠깐 뒤 다음 질문으로 넘어감. 여러 개를 고르는 질문(강아지 크기 · 인계 방식)은 "Pick all that fit."와 **Next**. 개수 질문의 마지막은 **4+** · **5+**(저장 값은 숫자, 이상의 뜻). 질문마다 **+ Add a note**로 직접 쓰는 칸이 열리고(열려 있으면 Next를 눌러야 넘어감), 모든 질문에 **Skip**. 음성 화면의 **Skip all for now** → 시터 홈으로 가고 다시 안 물음. 이미 있던 시터는 이 화면을 안 만남 | 🤖 `sitter-onboarding` | 사람 확인 대기 |
| ONB-3 | 질문을 몇 개 고르고 노트를 하나 쓴 뒤 마지막 화면("A few words about you")의 **Review** | 채운 질문만 "번호. 질문 / 선택 · 노트"로 보이고 나머지는 "N skipped". 강아지 크기는 "Small, Large"(선택지 순서대로, 누른 순서와 상관없이). **Back to edit**으로 돌아가도 쓴 것이 남음. 선택지를 한 번 더 누르면 해제(건너뜀) | 🤖 `sitter-onboarding` | 사람 확인 대기 |
| ONB-5 | 온보딩의 **When can you host?** → **Set weekly availability** → 요일 × 시간대 칸을 눌러 닫고 Apply. Review → Finish | 요약이 "Closed: Sun, Sat night."처럼 보이고, Review에도 같은 내용. **Finish 전에는 스케줄에 아무것도 쓰지 않음**. Finish 후 Schedule 달력에 규칙(빗금)과 쉬는 날(세 시간대 모두 닫힘)이 보임. 이 섹션을 안 건드리면 스케줄은 그대로(이미 규칙이 있으면 요약에 그대로 보임) | 🤖 `sitter-onboarding` | 사람 확인 대기 |
| ONB-6 | 첫 화면에서 말하기 또는 입력 → **Use this** | 마이크 · 받아 적은 글 고치기 · "We don't keep the recording."는 오너와 같음. 글에서 읽은 것만 해당 질문에 **골라진 채로** "✨ suggested"와 "✨ You said: ..."로 나옴(이미 고른 질문은 덮어쓰지 않음, 다른 걸 누르면 표시가 사라짐). 말하지 않은 질문은 비어 있음. 숫자 선택지는 말한 숫자만("twice a day" = 2). 읽기가 실패하면 "...You can answer the questions yourself."가 나오고 Skip으로 직접 답함. 마지막에 Finish를 눌러야 저장됨 | 🤖 `sitter-onboarding` (가짜 마이크) · pytest `test_ai_sitter_voice.py` | **👤** 실제 마이크로 한 번 (Chrome · Safari) |
| ONB-4 | **Finish** | "Saved" 토스트 후 시터 홈. 같은 시터는 Profile → **Your answers**에 답한 질문만 읽기용 목록으로 보이고(안 답한 질문은 안 보임), **Edit your answers**에서 같은 화면(Skip all 없음)을 열어 고치고 다시 저장할 수 있음. 직접 추가한 질문(최대 5개)과 자기소개도 저장됨 | 🤖 `sitter-onboarding` | 사람 확인 대기 |

### 3.28 프로필 사진 (PFP) — #135 – #137 · *DB · 업로드 API · 시터 갤러리까지 — 나머지 화면 시나리오는 단계가 끝날 때마다 아래에 추가*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| PFP-1 | (DB) `rls_smoke.sql`의 014g 블록 | 사진은 뒤에 붙고 첫 장이 대표 · 한 사람 최대 8장(9번째는 `too_many_photos`) · 시터 사진은 본인과 모든 오너가 읽고 다른 시터 · anon은 못 읽음 · 오너 사진은 본인과 **그 오너와 예약이나 문의가 있는 시터**만 읽음(다른 오너 · 관계없는 시터는 0장) · 순서 바꾸기는 내 사진 전부만(빠뜨리거나 중복하거나 남의 사진이면 `invalid_photos`) · 삭제는 백엔드만(그 사람의 사진이 아니면 `not_found`)이고 Cloudinary public id를 돌려주며 빈 자리는 메워짐 · 직접 insert · 로그인한 사용자의 `add_profile_photo` · `remove_profile_photo` · anon 삭제는 권한 없음 | SQL `rls_smoke` (로컬 Postgres 17 전체 파일 746 PASS, 2026-10-17) | 호스팅 DB에 `014g` 적용 후 |
| PFP-2 | (API) `POST /api/profile-photos/sign` · `/complete` · `DELETE /api/profile-photos/{id}` | 시터 · 오너 누구나 **자기 폴더**(`goldito/profile/<내 id>`)에만 서명을 받음 · 등록은 서명한 폴더의 파일이고 Cloudinary에 실제로 있어야 하며 같은 업로드를 다시 등록해도 같은 사진 · 9번째는 409 "up to 8" · 삭제는 **내 사진만**(남의 것은 404)이고 파일을 먼저 지운 뒤 DB를 지움(파일 삭제가 실패하면 그대로 두고 502) | 🤖 `test_profile_photos.py` (백엔드 552 passed) | ➖ |
| PFP-3 | 시터 → Profile → **Your photos**. 사진이 없을 때 | 사진 한 장 크기(72 px)의 빈 원 실루엣과 그 아래 작은 **Add a photo**(첫 사진이 올라와도 줄이 튀지 않음). 누르면 사진 고르기(데스크톱 프레임 · 데모 계정은 샘플 트레이, 폰은 Take photo / Choose from library) → **Crop your photo** | 🤖 `profile-photos` | 사람 확인 대기 |
| PFP-4 | Crop 시트에서 사진을 마우스(또는 손가락)로 끌어 옮기고(키보드 방향키도 됨), 슬라이더(또는 마우스 휠)로 확대 → **Use photo** | 둥근 창 안에서 사진이 상하좌우로 움직이고 창을 벗어나게 옮길 수 없음(항상 창을 덮음 — 사진이 거의 정사각형이면 **확대해야** 움직일 여지가 생김). 확대는 100~400%. **Use photo** 후 잘린 정사각형(800 px)이 올라가 목록 끝에 붙고 첫 사진에는 **Cover** 표시. 잘못되면(예: 9번째) 이유가 시트 안에 보이고 시트는 그대로 | 🤖 `profile-photos` | 폰에서 터치로 끌기 · 확대 확인 대기 |
| PFP-5 | 사진을 누른 뒤 **Make cover** · **Move earlier** · **Move later** · **Remove photo** | 대표로 만들면 맨 앞으로. 앞뒤 이동은 한 칸씩(대표는 앞으로 못 가고, 마지막은 뒤로 못 감). Remove는 한 번 더 확인(**Keep it**으로 취소 가능) 후 Cloudinary 파일과 목록에서 사라지고 빈자리가 메워짐. 8장이면 **+**가 없음. 끌어서 순서 바꾸기는 아직 없음(버튼으로만) | 🤖 `profile-photos` | 사람 확인 대기 |
| PFP-6 | 오너 → Profile → **Your photos** | 시터와 같은 갤러리(추가 · 크롭 · 대표 · 이동 · 삭제). 안내 문구: "A sitter sees it only once you have a booking or a question with them." | 🤖 `profile-photos` | 사람 확인 대기 |
| PFP-7 | 시터 → 그 오너와의 예약 요청 · 문의 화면 | 오너 이름 옆(문의는 위쪽)에 **대표 사진 원**이 보임. 사진이 없으면 이니셜. 예약도 문의도 없는 오너의 사진은 DB 규칙(`014g`) 때문에 시터에게 안 보임 → 이니셜 | 🤖 `sitter-bookings` (사진 있음 / 없음) · SQL `rls_smoke` (읽기 규칙) | 사람 확인 대기 |

### 3.29 데모 계정 세트 (DSET): #163 · *사전: 데모 도구가 켜진 빌드(`EXPO_PUBLIC_DEMO_TOOLS=1`), 호스팅 DB는 Paul · Allen · Daniel 계정을 시드한 뒤*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| DSET-1 | 로그인 화면(데모 도구가 켜진 빌드) → **Whose demo** 드롭다운 → Paul → **Demo owner** 또는 **Demo sitter** | 드롭다운에 Chloe · Paul · Allen · Daniel. 고른 세트의 오너(Peter) 또는 시터(Paul)로 로그인되고 폰 위(또는 화면 위)에 "Peter · Owner" 또는 "Paul · Sitter". 아무것도 안 고르면 Chloe 세트(Robert · Chloe) | 🤖 `demo-sets` | 사람 확인 대기 |
| DSET-2 | Peter(Paul 세트의 오너)로 Profile → **Demo tools (Peter)** → 상태 고르고 **Reset demo…**. 이어서 Paul(시터)로도 같은 것 | 확인 시트에 "Peter goes back to ... with Paul". 오너 초기화는 시터의 일정과 말투를 안 건드리고, 시터 초기화는 오너의 펫과 돌봄 계획을 안 건드림(시터에는 Empty 상태가 없고 Clean이 있음). Chloe 세트(슬기님)는 그대로. 세트에 없는 계정은 도구가 안 보이고 서버도 403 | 🤖 `demo-sets` · `test_demo_reset_api.py` · `test_reset_demo.py` | 사람 확인 대기(호스팅 DB에 Paul · Allen · Daniel 계정을 시드한 뒤) |

### 3.30 Expressive 룩 (EXP) · *사전: 없음. `?skin=default`로 예전 룩*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| EXP-1 | 아무 화면이나 스위치 없이 열기 | 크림 배경, 잉크색 글씨, 화면 제목은 Fredoka. 버튼 · 칩 · 세그먼트는 알약 모양 | 🤖 `skin` | ➖ |
| EXP-2 | 주소에 `?skin=default` 붙이고 새로고침 | 예전 룩(회색 배경, 시스템 글꼴, 네모난 버튼). 탭을 닫기 전까지 유지 | 🤖 `skin` | ➖ |
| EXP-3 | 오너 · 시터 탭 바 | 흰 바, 위쪽 모서리 둥글게, 선택한 탭 아이콘 뒤에 민트 알약. 라벨이 잘리지 않음 | **👤** (모양) | ➖ |
| EXP-4 | 오너 → 진행 중인 예약 열기 | 시터 이름이 큰 Fredoka 제목, 단계는 번호 동그라미(끝난 단계 금색 ✓, 지금 단계 잉크색). Meet & Greet 카드는 복숭아색, Finish booking은 버터색, 짐 목록은 민트 | **👤** (모양) | ➖ |
| EXP-5 | Welcome · 로그인 화면 | 금색 코인 로고 + "Goldito" | **👤** (모양) | ➖ |

### 3.30 Expressive 룩 (EXP) · *사전: 없음. `?skin=default`로 예전 룩*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| EXP-1 | 아무 화면이나 스위치 없이 열기 | 크림 배경, 잉크색 글씨, 화면 제목은 Fredoka. 버튼 · 칩 · 세그먼트는 알약 모양 | 🤖 `skin` | ➖ |
| EXP-2 | 주소에 `?skin=default` 붙이고 새로고침 | 예전 룩(회색 배경, 시스템 글꼴, 네모난 버튼). 탭을 닫기 전까지 유지 | 🤖 `skin` | ➖ |
| EXP-3 | 오너 · 시터 탭 바 | 흰 바, 위쪽 모서리 둥글게, 선택한 탭 아이콘 뒤에 민트 알약. 라벨이 잘리지 않음 | **👤** (모양) | ➖ |
| EXP-4 | 오너 → 진행 중인 예약 열기 | 시터 이름이 큰 Fredoka 제목, 단계는 번호 동그라미(끝난 단계 금색 ✓, 지금 단계 잉크색). Meet & Greet 카드는 복숭아색, Finish booking은 버터색, 짐 목록은 민트 | **👤** (모양) | ➖ |
| EXP-5 | Welcome · 로그인 화면 | 금색 코인 로고 + "Goldito" | **👤** (모양) | ➖ |

### 3.31 헤더 (HDR) · #147

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| HDR-1 | 오너 Home · 시터 Home | 제목은 오너 "Home", 시터 "Today". 오른쪽에 역할 칩(Owner / Sitter), 종(안 읽은 수), ≡. 글자로 된 "Log out" 없음 | 🤖 `auth` · `split` | ➖ |
| HDR-2 | ≡ 누르기 | 오른쪽에서 화면 전체 너비로 미끄러져 들어옴. 나(→ Profile), Notifications(숫자), Schedule(시터만), What's new, Settings, 맨 아래 Log out. ✕나 항목을 누르면 미끄러져 나감 | 🤖 `profile` · `schedule` | ➖ |
| HDR-3 | ≡ → Log out | "Log out?" 확인 후에만 로그아웃, Welcome으로 | 🤖 `auth` | ➖ |
| HDR-4 | ≡ 메뉴 → Settings → Log out | 같은 확인 시트, 확인하면 Welcome으로 | **👤** | ➖ |

### 3.30 Expressive 룩 (EXP) · *사전: 없음. `?skin=default`로 예전 룩*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| EXP-1 | 아무 화면이나 스위치 없이 열기 | 크림 배경, 잉크색 글씨, 화면 제목은 Fredoka. 버튼 · 칩 · 세그먼트는 알약 모양 | 🤖 `skin` | ➖ |
| EXP-2 | 주소에 `?skin=default` 붙이고 새로고침 | 예전 룩(회색 배경, 시스템 글꼴, 네모난 버튼). 탭을 닫기 전까지 유지 | 🤖 `skin` | ➖ |
| EXP-3 | 오너 · 시터 탭 바 | 흰 바, 위쪽 모서리 둥글게, 선택한 탭 아이콘 뒤에 민트 알약. 라벨이 잘리지 않음 | **👤** (모양) | ➖ |
| EXP-4 | 오너 → 진행 중인 예약 열기 | 시터 이름이 큰 Fredoka 제목, 단계는 번호 동그라미(끝난 단계 금색 ✓, 지금 단계 잉크색). Meet & Greet 카드는 복숭아색, Finish booking은 버터색, 짐 목록은 민트 | **👤** (모양) | ➖ |
| EXP-5 | Welcome · 로그인 화면 | 금색 코인 로고 + "Goldito" | **👤** (모양) | ➖ |

### 3.31 헤더 (HDR) · #147

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| HDR-1 | 오너 Home · 시터 Home | 제목은 오너 "Home", 시터 "Today". 오른쪽에 역할 칩(Owner / Sitter), 종(안 읽은 수), ≡. 글자로 된 "Log out" 없음 | 🤖 `auth` · `split` | ➖ |
| HDR-2 | ≡ 누르기 | 오른쪽에서 화면 전체 너비로 미끄러져 들어옴. 나(→ Profile), Notifications(숫자), Schedule(시터만), What's new, Settings, 맨 아래 Log out. ✕나 항목을 누르면 미끄러져 나감 | 🤖 `profile` · `schedule` | ➖ |
| HDR-3 | ≡ → Log out | "Log out?" 확인 후에만 로그아웃, Welcome으로 | 🤖 `auth` | ➖ |
| HDR-4 | ≡ 메뉴 → Settings → Log out | 같은 확인 시트, 확인하면 Welcome으로 | **👤** | ➖ |

### 3.32 시터 일정 보기 (CAL) · #120

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| CAL-1 | 오너 → Bookings → 시터 줄 → 시터 프로필 | 소개와 **See schedule**(열린 날과 닫힌 날을 보는 곳). **Next openings 목록은 없음**(검색에 나온 시터는 이미 그 기간이 맞음). 아래 고정 버튼은 **Start chat** 하나(Ask before booking · Book은 없음) | 🤖 `sitters` | ➖ |
| CAL-2 | 한 줄 누르기 | 그날 페이지: 제목 "Tue, Oct 20", 세 줄(Morning · 시간 · "2 spots left" / "Full" / "Not available"). ← 누르면 프로필로 | 🤖 `sitters` | ➖ |
| CAL-3 | See schedule → 날짜 누르기 | 달력(#150 빗금 그대로) **바로 아래에 그날 시간대**(Morning · Afternoon · Night 시간과 남은 자리, #268). 처음엔 검색의 맡기기 날(없으면 오늘)이 선택돼 있음, 다른 날을 누르면 그날로 바뀜(새 화면 · 시트 없음, "Tap a day…" 문구 없음). 날짜를 누른 뒤의 **Start chat**은 그날 기준. 검색에서 온 날짜 · 펫은 프로필 → 달력으로 따라감 | 🤖 `sitters` · `chat` | ➖ |
| CAL-4 | 그날 페이지에서 **Start chat** | 채팅이 열리고 첫 카드가 그날로 채워짐(첫 빈 시간에 맡기기, 다음 날 5 PM에 찾기; 검색에서 온 펫이 있을 때). 채팅 맨 아래 **Request booking**이 같은 시터 · 날짜 · 펫으로 Book care를 엶 | 🤖 `chat` · `booking` | 사람 확인 대기 |

### 3.33 문구 대시 정리 (COPY) · #173

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| COPY-1 | `frontend`에서 `rg -n "[–—]" -g '*.ts' -g '*.tsx' --glob '!e2e' --glob '!app/dev'` | 주석 말고는 결과 없음. 날짜 · 시간 범위는 "Oct 19 to 21", "9:30 AM to 1:00 PM" | **👤** (grep) | ➖ |
| COPY-2 | 오너 → Bookings, 취소된 예약 카드 | 칩이 **Cancelled** 한 단어 | 🤖 `rebook` | ➖ |
| COPY-3 | 시터 → Schedule | 안내 한 줄("Tap a day to open or block it. Drag for a range."), 오른쪽 위 ⚙ 옆에 **Weekly rules** 글자 | 🤖 `schedule` | ➖ |
| COPY-4 | 오너 → Book care 검색, 반경 안에 시터 없음 | "For Oct 19 to 21. Try a wider area." 슬라이더 아래 직선거리 안내 줄은 없음 | 🤖 `sitter-search` | ➖ |

### 3.34 당일 숙박 견적 (QUOTE) · #172

`quote_booking`은 당일 숙박(맡기기 · 찾기가 같은 날)을 `nights: 0`, `days: 1`로 돌려주고 하루치 요금을 받는다. 카드는 이때 밤 대신 날로 보여 주고, AI 초안에는 `nights`를 넘기지 않는다.

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| QUOTE-1 | Boarding을 같은 날(예: Oct 21, 9:00 AM에서 5:00 PM)로 요청 → 견적 카드 | **"1 day × $55.00"**, 합계 $55.00. "0 nights"는 안 나옴 | 🤖 `checkout` | ➖ |
| QUOTE-2 | 1박 · 2박으로 다시 | "1 night × …", "2 nights × …", 단가 × 수 = 기본 금액 | 🤖 `checkout`(3박) | ➖ |
| QUOTE-3 | 같은 날 문의의 AI 초안 | 합계만 말하고 "0 nights"라고 쓰지 않음(모델은 `days`만 받음) | pytest `test_inquiry` · `test_inquiry_agent` · **실제 모델 👤** | ➖ |

### 3.35 서비스 가격이 빈 시터 (RATE) · #189 · *사전: 호스팅 DB에 `014k` 적용 뒤*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| RATE-1 | 요금표는 있는데 Boarding 가격만 비어 있는 시터에게 Boarding 체크아웃 | **"This sitter hasn't set a Boarding price yet."** "doesn't offer that service"는 안 나옴 | SQL `rls_smoke`(014k) · 🤖 `checkout` | ➖ |
| RATE-2 | Daycare 가격만 빈 경우 | `rates_not_set`, detail `daycare` | SQL `rls_smoke`(014k) | ➖ |
| RATE-3 | 요금표가 아예 없는 시터 | 예전 그대로 "This sitter hasn't set their prices yet…" | SQL `rls_smoke`(3C.1) · 🤖 `checkout` | ➖ |
| RATE-4 | 프로필에 없는 서비스(예: House sitting을 안 하는 시터) | 예전 그대로 "This sitter doesn't offer that service." | SQL `rls_smoke`(014k) · 🤖 `checkout` | ➖ |

### 3.36 시터 프로필 헤더 · 사진 뷰어 (PROF) · #136

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| PROF-1 | 오너 → 시터 프로필 (폰 너비 402) | 둥근 대표 사진 · 이름(+ 지역 · 경력) · 하트가 **한 줄**. "Add to favorites" 줄은 없음 | 🤖 `sitters` | ➖ |
| PROF-2 | 하트 누르기 → 새로고침 → 다시 누르기 | ♥로 채워지고 "Added to favorites", 새로고침해도 유지, 다시 누르면 ♡ + "Removed from favorites". 즐겨찾기 시터는 시터 고르는 목록 맨 앞 | 🤖 `sitters` · `completion`(FB-28) | ➖ |
| PROF-3 | 사진 누르기 | 전체 화면 뷰어, 대표 사진이 첫 장, "1 / 3". ‹ › 버튼 · ← → 키 · 마우스 드래그(터치는 스와이프)로 넘기고, ✕ 또는 Esc로 닫힘 | 🤖 `sitters` · **👤** (실제 폰 스와이프) | ➖ |
| PROF-4 | 사진이 없는 시터 | 빈 칸 대신 **이름 첫 글자** 동그라미(다른 화면과 같은 모양), 눌러도 뷰어는 안 열림 | 🤖 `sitters` | ➖ |

---

### 3.33 프로필 주소 · 만남 장소 (ADDR) · *사전: 백엔드가 떠 있음(`/api/geo/suggest`), 견주 또는 시터 계정*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| ADDR-1 | 주소를 쓰는 모든 칸(Profile의 Home address, 예약 요청의 Elsewhere)에서 주소나 우편번호를 쓰고 **Check address** | 실제 주소 후보가 최대 5개 나옴(예: "127 Broadway Ave, Toronto, ON M4P 1V9"). 하나를 누르면 칸이 그 주소로 바뀌고 "✓ Found on the map". 입력할 때마다 조회하지 않고 버튼을 누를 때 한 번만(OpenStreetMap 정책) | 🤖 `home-location.spec.ts` (+ pytest `test_geo`) | 사람 확인 대기 | 우편번호는 어떤 철자든(`m4p1v4`) 한 형태로 찾고, 지도에 그 코드가 없으면 **우편 앞 3자리 지역**("M4P, Toronto, ON")으로 대신함(번들한 GeoNames 지역 표, CC BY 4.0)
| ADDR-2 | 주소를 비우고 / 쓰기만 하고 / 확인한 뒤 고쳐서 **Save** | 주소는 필수: "Add your home address." / "Check your address so it's on the map." 로 막힘. 못 찾은 주소는 "We couldn't find that address…", 조회가 꺼져 있으면 안내 문구, 저장된 주소와 핀은 그대로 | 🤖 `home-location.spec.ts` | 사람 확인 대기 |
| ADDR-3 | **📍 Use my current location** | 핀이 찍히고 Home address가 "거리명, 도시"로, Postal code가 우편 앞 3자리로 따로 채워짐(집 번호는 직접 덧붙이면 다시 Check address) | 🤖 `home-location.spec.ts` | 사람 확인 대기 |
| ADDR-4 | Profile → **Meeting spots** 카드(▸) | 열면 칸은 하나로 시작, **+ Add another spot**으로 늘리고 최대 3개, 칸마다 **✕**로 지움(하나뿐이면 내용을 비움). 닫힌 카드는 저장된 장소를 한 줄로 보여 줌 | 🤖 `profile.spec.ts` | 사람 확인 대기 |
| ADDR-5 | 즐겨찾기가 없는 오너의 Bookings 탭 | Favorites 칸 없이 **Sitters nearby**에 주변 시터가 바로 보임. 반경 안에 없으면 "No sitters within N km for these dates." | 🤖 `sitter-search` | 사람 확인 대기 |
| ADDR-6 | 데모 계정(`@goldito.test`) 전부 | 계정마다 **자기 주소와 핀**이 있음(토론토 공공 건물 주소, 실제 사람 집 아님): 오너 Robert · Peter · Alex · David, 시터 Chloe · Paul · Allen · Daniel. 서로 0.6 ~ 14 km라 반경 슬라이더로 결과가 달라짐. **Reset demo**나 `seed_demo.py`를 다시 돌려도 이 주소가 유지됨 | 🤖 pytest `test_seed_demo` · `test_reset_demo` | 사람 확인 대기 |
| ADDR-7 | 시터가 Profile에서 주소를 확인하고 저장 | 서비스 지역은 입력칸 없이 **도시 + 우편 앞 3자리**("Toronto M4W")로 자동으로 정해짐(도시나 우편번호를 못 뽑으면 기존 값 유지). 오너의 예약 요청 시트에는 "At Allen's place, Toronto M4W"처럼 대략적인 위치만 나오고 정확한 주소는 결제 뒤에만 공개 | 🤖 `home-location` · `chat` | 사람 확인 대기 |

### 3.32 채팅 허브 (CHAT) — 3D.4 · #141 · *사전: 호스팅 DB에 `014j`(적용은 요청할 때만), 오너와 시터 계정 둘(예: Peter와 Chloe), 두 브라우저나 창*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| CHAT-1 | (DB) `rls_smoke.sql`의 014j 블록 | 같은 쌍은 늘 같은 스레드 · 메시지가 없으면 목록에 안 나옴 · 같은 머무름은 첫 카드를 한 번만, 다르면 새 카드 · 둘 다 여러 번 보내기 · 안 읽은 수와 읽음 처리 · 시터는 새 채팅을 시작할 수 없고 있는 채팅은 열 수 있음 · 제3자는 읽기 · 쓰기 · 읽음 표시 모두 불가 · 직접 insert 없음 · 빈 메시지와 2000자 초과 거부 · 나가기는 내 목록에서만, 새 메시지나 다시 열면 돌아옴 · anon 불가 | SQL `rls_smoke` | ➖ |
| CHAT-2 | 오너 → Bookings → 시터 이름 → 시터 프로필 → **Start chat**(시터 줄에는 채팅 버튼이 없음) | 채팅이 열리고 헤더에 **시터 사진(없으면 이니셜) · 이름**과 그 아래 **펫 아바타**만(날짜는 카드에 있어 헤더에 없음). Stay는 **카드**로, 내가 보낸 것은 오른쪽 · 상대 것은 왼쪽(와츠앱처럼). 입력창은 **한 줄**(오른쪽 보내기 버튼). 같은 시터의 💬를 다시 누르면 같은 채팅(같은 머무름이면 카드는 한 번만) | 🤖 `chat` | 사람 확인 대기 | 날짜를 바꿔 💬를 또 눌렀을 때 아직 아무도 말하지 않았다면 Stay 카드는 **새로 쌓이지 않고 그 카드가 새 날짜로 바뀜**(누군가 말한 뒤에는 새 카드, `014l`)
| CHAT-3 | 시터 → **Chat** 탭(#329) | 오너 이름 · 마지막 메시지 · 안 읽은 수. 열면 가장 최근 메시지에서 시작하고 안 읽은 수가 사라짐. 시터도 계속 답할 수 있음 | 🤖 `chat` | 사람 확인 대기 |
| CHAT-4 | 한쪽이 보내면 다른 쪽 화면 | 열려 있는 채팅에 새 메시지가 곧바로(Realtime, 안 되면 5초 안에) 나타남. 목록의 미리보기와 숫자도 갱신 | 🤖 `chat`(폴링) · 실제 Realtime은 👤 | 사람 확인 대기 |
| CHAT-5 | 목록의 채팅 줄을 왼쪽으로 밀기 | 내 목록에서만 사라지고 기록은 남음. 상대 목록에는 그대로. 다시 💬로 열거나 상대가 새로 보내면 돌아옴. 채팅 화면에는 Leave 버튼이 없음(← 가 나가는 길) | 🤖 `chat` | 사람 확인 대기 |
| CHAT-6 | 채팅 맨 위 | **작은 원 5개**(Request · Meet · Confirm · Pay · Stay)가 이어진 줄이 **스크롤해도 맨 위에 고정**, 부킹의 단계(DB가 계산)를 따라 옮겨가고 아래에 "Your turn" / "Waiting for …". 이미 만난 쌍은 Meet이 체크된 채로 시작, 부킹이 아직 없으면 Request에 있음. 누르면 그 부킹으로 이동 | 🤖 `chat` | 사람 확인 대기 |
| CHAT-7 | 채팅 주소를 다른 사람(쌍이 아닌 오너)이 직접 열기 | "Chat not found" | 🤖 `chat` | 사람 확인 대기 |
| CHAT-8 | 시터 프로필(또는 일정 페이지) → **Start chat** | 한 버튼. 검색에서 온 날짜 · 펫이 있으면 채팅 첫 카드로 올라감. 진행 중인 예약이 없는 오너의 채팅 맨 아래에 **Request booking**(시터에게는 없음) | 🤖 `chat` · `booking` | 사람 확인 대기 |
| CHAT-9 | 채팅 헤더의 **사진(아바타)** / **이름** | 아바타(사진이 있을 때)를 누르면 큰 사진을 옆으로 넘겨 봄. 이름을 누르면 시터 상세(오너만), ← 로 같은 채팅으로 돌아옴. 사진 보기는 상대가 채팅이 있는 오너여도 시터에게 보임(채팅이 있으면 서로의 사진을 볼 수 있음, `014k`) | 🤖 `chat` · SQL `rls_smoke` | 사람 확인 대기 |
| CHAT-10 | 채팅 → **Request booking** | 채팅 **위로 아래에서 올라오는 시트**(뒤에 채팅이 보임). 서비스 · 펫 선택은 없음. **Drop-off · Pick-up이 한 카드**에 날짜 · 시간이 한 줄씩. 장소는 기본 "At {시터}'s place, {동네}"(시터의 정확한 주소는 결제 뒤에만 공개되어 동네까지만), **My place**를 고르면 내 주소가 보임, **Elsewhere**는 주소를 쓰고 **Check address**로 실제 주소를 골라야 보낼 수 있음. 메모는 + 로. **Send request** 한 번에 모두 전송 → 채팅에 요청 카드가 올라가 시터가 채팅에서 읽음 | 🤖 `chat` · SQL `rls_smoke` | 사람 확인 대기 |
| CHAT-11 | 상대가 쓴 뒤 내 채팅 화면(시터와 오너 모두) | 입력창 위에 **칩 2~3개**(시터: "Yes, I can host" · "Let me check" 같은 짧은 말, 오너: 펫 · 질문 · 감사). **내가 마지막으로 말했어도 칩이 있음**(후속 질문 · 제안, #226): 내 글을 보내면 칩이 새로 만들어짐. 빈 채팅에서는 오프너 칩(오너는 인사, 시터는 환영). AI가 안 되면 말투가 맞는 기본 칩(시터의 첫 답은 "Hi, nice to meet you"), 연결이 끊겨도 500이 아니라 기본 칩. 입력은 항상 됨 | 🤖 `chat`(목업) · pytest `test_ai_chat` | 사람 확인 대기 칩이 만들어지는 동안 **그 자리에 "Writing replies…" 스피너**가 처음부터 있어서 칩이 나타나도 화면이 밀리지 않음. 입력을 시작하면 칩 자리는 사라짐. 새 메시지가 온 채팅은 목록에서 미리 칩을 만들어 두어 들어가면 바로 보임. **오너와 시터의 말이 다름**: 시터는 호스트 말투(가용성 · 요금 · 우리 집), 오너는 반려동물 주인 말투(펫 이름 · 고마움 · 실용적인 질문, "I can host" 같은 말은 안 함) | 🤖 `chat` · pytest `test_ai_chat` | 사람 확인 대기 |
| CHAT-12 | 칩을 누름 | 잠깐 "작성 중" 뒤 **입력창에 내 말투의 짧은 초안**이 채워지고 칩이 사라짐. **아무것도 보내지지 않음**: 고치고 **Send**를 눌러야 전송. 긴 초안은 **여러 줄 입력창이 커져서 보임**(약 6줄까지, 그 위는 같은 높이로 두고 스크롤바가 보이며 스크롤), 웹에서 Enter는 전송 · Shift+Enter는 줄바꿈. 시터가 가격을 말하면 숫자는 그 시터의 실제 요금 · 견적과 같음(다른 숫자는 거절되고 다시 씀) | 🤖 `chat` · pytest `test_ai_chat` | 사람 확인 대기 |
| CHAT-13 | 50개 넘는 긴 대화에서 칩 | 최근 20개와 스레드에 저장된 요약(`ai_summary`)으로 답함. 요약은 오래된 메시지 10개 이상이 쌓였을 때만 새로 씀. 요약은 클라이언트가 읽을 수 없음(`014m`) | pytest `test_ai_chat` | ➖ |
| CHAT-14 | 시터 → 채팅(오너의 Stay 카드가 있음) → **Send quote** → 시트에서 서비스(여러 개일 때) 확인 → **Send quote** | 채팅에 **Quote 카드**: 박 수 × 단가, 추가 펫, 공휴일, **Total은 서버 계산값**(Checkout과 같은 `quote_booking`). 같은 일정에는 Send quote 버튼이 다시 안 나옴. 요금 미설정이면 "This sitter hasn't set a Boarding price yet." | 🤖 `chat` · SQL `rls_smoke` 014n | ➖ |
| CHAT-15 | **(#265로 없어짐: 수수료 제거)** 시터가 열린 견적에서 **Add a fee**(라벨 칩 또는 직접 입력 + 금액 $0 초과 500 이하, 최대 5개) | 카드에 수수료 줄 + 시터에게는 "Waiting for an answer". **Total은 아직 그대로**. 오너는 줄마다 **Accept / Decline** | 🤖 `chat` · SQL | ➖ |
| CHAT-16 | **(#265로 없어짐: 수수료 제거)** 오너가 수수료 하나 Accept, 하나 Decline → **Confirm quote** | Accept한 금액만 Total에 더해짐, Decline은 취소선 + "Declined"로 Total에 없음. 답 안 한 수수료가 있으면 Confirm 비활성. 확인하면 카드 **Confirmed**, 이후 수수료 추가 불가. 새 견적을 보내면 열려 있던 이전 견적은 Replaced (확인된 것은 그대로). 채팅 목록 미리보기는 "Quote" | 🤖 `chat` · SQL | ➖ |
| CHAT-17 | (DB) `rls_smoke.sql`의 014o 블록 | 반복 쌍은 요청 직후 `confirm`(다음 차례 both) · 시터가 먼저 수락하면 요청 상태로 남고 오너 차례 · 오너가 먼저 동의하면 시터 차례 · 둘 다 있으면 `confirmed`와 두 핸드오프 agreed, 순서는 자유 · 시터가 제안한 새 시간은 양쪽 동의를 지움 · 처음 보는 쌍은 Meet & Greet이 끝나야 동의 가능 · 가격은 같은 일정의 확인된 최종 견적에서 수락한 수수료만 더함(미확인 · 다른 일정 견적 제외) · `pay_booking_demo`가 같은 총액을 얼림 · 채팅 카드: `meet_greet`(시터 첫 yes부터, 첫 만남 쌍만) · `agreement` · `payment`가 부킹당 한 번씩, booking id만 들고, 변경마다 `rev`가 올라 상대 화면이 따라옴, 쌍 밖은 못 읽음 · 낯선 사람 · anon 불가 | SQL `rls_smoke` | ➖ |
| CHAT-18 | 예약 상세에서 합의: 오너 → 예약 상세(Meet & Greet 뒤 또는 이미 만난 쌍) → **I'd like to book** · 시터 → 같은 예약 → **I accept** | 오너 버튼은 시트에서 **펫 · 시간 · 장소 · 체크리스트 · 가격**을 한 번 더 보여 주고 한 번 더 누르면 오너의 yes. 시터의 **I accept**는 yes의 절반: 오너가 아직이면 "You accepted. Waiting for … to book."로 남고 부킹은 요청 상태 그대로, 오너도 눌러야 `confirmed`(순서 자유). 시터가 새 시간을 제안하면 둘의 yes가 지워짐 | 🤖 `meet-greet` · `sitter-bookings` · SQL `rls_smoke` 014o | 사람 확인 대기 |
| CHAT-19 | **(#265로 없어짐: 수수료 제거)** 확인된 최종 견적에서 수락한 수수료가 있는 부킹의 Checkout → 총액 → Pay | Checkout 견적에 **수수료 줄**이 보이고 **Total = 기본 + 수락한 수수료**, 결제 버튼 금액도 같음. 낸 금액은 `price_snapshot`(`extras` 포함)에 얼어 있음. 수수료가 없으면 이전과 같음 | 🤖 `checkout` · SQL `rls_smoke` 014o | 사람 확인 대기 |
| CHAT-20 | 첫 만남 쌍: 시터 → 채팅(오너의 요청 카드) → 푸터 **Next** → **Pick a time** → 장소 · 시간 → Send / 오너 → 푸터 **Accept** → 바로 **Done, we met**(시간 전이면 한 번 더 확인, #229) | 푸터는 **지금 내 차례의 한 가지**만(아니면 "Waiting for …"). **Meet & Greet 카드**가 날짜 홀드 · 제안 · 수락 · Done을 DB에서 읽어 그리고, 한 줄로 접힘("Met ✓"). 건너뛰기 · 시간 바꾸기 · 거절 · 캘린더 · Google Meet 링크는 카드 안에서(기존 RPC) | 🤖 `chat` | 사람 확인 대기 · 실제 Google Meet 링크는 3B.11 변수가 있는 호스팅 DB에서 |
| CHAT-21 | Meet & Greet 뒤(반복 쌍은 요청 직후): 오너 푸터 **I'd like to book** → 시트(펫 · 시간 · 체크리스트 · 가격) → 확인 / 시터 푸터 **I accept** | **Agreement 카드**에 두 줄(오너 ✓ / 시터 ✓), 순서 자유, 둘 다 있으면 "Booked, you both agreed ✓" 한 줄로 접힘. 한쪽만 눌렀을 때 부킹은 요청 상태, **결제 버튼 없음** | 🤖 `chat` · SQL `rls_smoke` 014o | 사람 확인 대기 |
| CHAT-22 | **(수수료 부분은 #265로 없어짐)** 둘 다 동의한 뒤: 시터 푸터 **Send final quote** (수수료는 카드에서 추가) → 오너 수수료 Accept/Decline → 푸터 **Confirm quote** → **Pay $…** → Checkout(서명 · 데모 결제) | 최종 견적이 **확인되어야** 오너에게 Pay가 나옴(그 전에는 "Waiting for …"). **Payment 카드**는 총액과 "Held until the stay ends"(결제 뒤 "Paid"), 카드를 눌러도 Checkout으로. Checkout 총액 = 카드 총액(수락한 수수료 포함) = 낸 금액. 카드 정보 없음 | 🤖 `chat` · `checkout` · SQL `rls_smoke` 014o | 사람 확인 대기 |
| CHAT-23 | 이미 만난 쌍의 채팅 | 푸터에 **Next**가 없고 Meet & Greet 카드도 없음, 진행 원은 3번째(Confirm)에서 시작하며 M&G는 체크됨 | 🤖 `chat` | 사람 확인 대기 |
| CHAT-24 | 오너가 "How much would it be?"처럼 가격을 물은 뒤 시터가 채팅을 열기, 또는 시터가 "Shall we book it?"이라고 한 뒤 오너가 열기 | 말 칩 줄 맨 앞에 **번개 아이콘이 붙은 행동 칩**(시터 `Send quote`, 오너 `I'd like to book` 등)이 한 개 나온다. 누르면 푸터나 카드가 하는 것과 같은 시트가 **열릴 뿐** 아무것도 저장되지 않고, 칩은 사라진다(눌러서 확정하는 것은 시트 안). 서버가 가리켜도 **이 화면에서 지금 불가능한 행동**(예: 확정 전 `pay`)은 안 나오고, 행동이 없으면 말 칩만. 코드가 만든 가능한 행동 목록(`get_booking_stages`의 단계 + 카드 상태) 안에서만 고르고 확신도 0.7 미만 · 단계를 못 읽음 · 모델 장애면 없음 | 🤖 `chat` · pytest `test_ai_chat` | 사람 확인 대기 · 실제 모델 응답은 배포 앱에서 |
| CHAT-25 | 오너와 시터의 AI가 따로: 시터가 오너의 첫 글(Stay 카드와 "Can you take Max?")에 칩 → 초안 / 오너가 시터 답 뒤에 칩 → 초안 | 두 쪽이 **각자의 프롬프트와 입력**을 씀. 시터의 **첫 답은 인사와 자기소개**("Hi Robert, I'm Chloe …")이고 **금액이 없음**. 금액(견적, 요금)은 오너가 돈을 물었거나 채팅에 견적 카드가 있을 때만 시터 쪽에 들어가고, **오너 쪽은 요금 · 정책 · 가용성을 못 보고** 채팅에 보이는 견적만 봄. 오너 초안은 "I can host" · "my place" 같은 호스트 말이 없고 **맡기고 찾는 쪽은 오너**(시터가 "I'll pick up"이라고 쓰거나 오너가 "you drop off"라고 쓴 초안은 거절되고 다시 씀). 직전 메시지(양쪽)와 거의 같은 초안도 거절. 펫에 없는 종의 이모지(개 둘에 고양이)도 거절. 모델은 `MODEL_CHAT_OWNER` / `MODEL_CHAT_SITTER`(초안)와 `MODEL_CHAT_CHIPS`(칩), 모두 기본 Super(비면 `MODEL_FAST`) | 🤖 pytest `test_ai_chat` · `test_nebius` | 사람 확인 대기 · 실제 모델로 오너와 시터를 나란히(`?view=split`) 4턴 이상 눌러서 말투 · 반복 · 역할을 읽어야 함 |
| CHAT-26 | 칩 요청이 실패하거나 연결이 끊김, 로그 | Supabase 연결이 끊겨도 `chat-chips`는 200과 기본 칩(채팅 자체를 못 읽으면 한 번 다시 시도한 뒤 503). 칩 · 초안마다 서버 로그 한 줄 `chat_ai {...}`(쪽 · 상태 · source model/fallback · 버려진 이유 · 칩 문구 · 초안 문구): 이름은 `{NAME}`으로 가려지고 id는 없음 | 🤖 pytest `test_ai_chat` · 🤖 `chat` | 사람 확인 대기 |
| CHAT-27 | 결제한 확정 부킹의 채팅 (3D.8 트립, #145): 오너가 드롭오프 2시간 안에 열기 → 시터 집이면 오너에게 **Heading to the drop-off?** + **Start trip** (동의 화면 뒤에 트립 화면), 시터 쪽에는 Start 없음. 2시간보다 이르면 오너에게 "You can start the trip from …" 한 줄. 이동 중에는 양쪽 카드가 "You're on the way" / "Robert is on the way · ETA" → ETA 5분 안이면 "Robert is 3 min away" → "Robert has arrived", 누르면 기존 Trip 화면(**Open trip** / **Track Robert**). 도착하면 카드에 작은 **빠른 답장 칩**(드롭오프: 오너 **Please take care of them**, 시터 **We will**; 픽업: 오너 **Thank you for everything**, 시터 **It was a pleasure**). **오너가 먼저**, 시터 칩은 오너의 인사가 채팅에 온 뒤에만 보임(#250). 누르면 내 말풍선으로 들어가며 칩이 사라짐. 여행자 카드에는 **I've arrived**(위치 공유 없는 트립을 끝냄, #250). 결제 전 부킹엔 카드 없음. 카드는 `trips`를 읽어 그릴 뿐 채팅에 저장하지 않음 | 🤖 `chat-trip` · `transit` | 사람 확인 대기 (두 폰 · 실제 위치 👤) |
| CHAT-28 | 케어 중(드롭오프 완료, 픽업 전) 채팅의 케어 카드 (3D.8, #145): 오너에게 **Ask for a photo**(펫마다 열린 요청이 없을 때만) → "You asked for a photo of Max · Waiting for Chloe", 시터에게는 "Robert asked for a photo of Max 📷" + **Send photo**(피드 올리기 화면으로). 시터가 공유 사진을 올리면(DB가 요청을 채움) 양쪽에 사진 카드(오너 "Chloe sent a photo of Max", 시터 "You sent a photo of Max") + 사진 아래 **한 줄 캡션**. 저녁에 시터가 알림장을 보내면 "Diary written 📖 · Max · Oct 21" + **Open diary**(오너는 그 페이지, 시터는 Diary 탭). 드롭오프 전에는 버튼도 카드도 없음. 카드는 `photo_requests` · `feed_posts` · `daily_reports`를 읽어 그릴 뿐 채팅에 저장하지 않으며 열려 있는 동안 10초마다 갱신 | 🤖 `chat-trip` | 사람 확인 대기 (두 계정 · 실제 사진 👤) |
| CHAT-29 | (DB, `014r`) 드롭오프 + 픽업을 한 쌍으로 제안 (#145 · #169) | `propose_handoff_pair`는 두 행을 같은 `pair_id`로 쓰고 알림은 한 번("… suggested a new drop-off and pick-up"). 한 행에 응답하면 시각이 따로 맞아도 두 행이 함께 수락 · 거절(확정 전에도), 확정 뒤 수락하면 스테이가 새 구간으로 다시 만들어지고 알림은 한 번. 한 행만 새로 제안하면 짝은 단일 제안이 됨(`pair_id` 해제). 제안자는 응답 불가, 제3자 · anon 불가, 픽업이 드롭오프보다 빠르면 `invalid_window`. 오너 `default_handoff`는 세 장소 중 하나만, 남은 못 바꿈 | SQL `rls_smoke` 014r | ➖ |
| CHAT-30 | 채팅 안의 인계 카드 (3D.8, #145 · #169; 앱은 `014r` 없이도 단일 제안은 그대로 동작, 쌍 제안은 `014r` 필요): (a) 시터 기본 방식(온보딩 handoff 답)과 요청의 장소가 다르면 시터에게 **Handoff differs from your default** + 두 줄(Drop-off / Pick-up과 장소) + **Suggest another**, 맞으면(`owner_brings` ↔ 시터 집, `sitter_picks_up` ↔ 오너 집, 둘 다 가능 · 답 없음은 모두 맞음) 카드 없음. (b) **Suggest another**는 시간 · 장소 시트를 열고 둘 다 바꾸면 **한 번에 한 쌍**으로 가며(알림 한 번) 보낸 쪽엔 "Waiting for Robert", 받는 쪽엔 "Chloe suggested a new drop-off and pick-up" 한 장 + **Accept** 한 번이 두 인계를 함께 수락(확정 전에도 후에도). 한 인계만 바꾸면 단일 제안. (c) 오너가 요청 시트를 열면 장소는 오너의 마지막 요청(`default_handoff`), 없으면 시터가 한 가지만 원할 때 그 장소, 아니면 시터 집으로 열리고, 보내면 오너 기본값이 저장됨. 예약 화면의 시간 변경 시트도 같은 쌍 호출 | 🤖 `chat-handoff` · `negotiation` · SQL `rls_smoke` 014r | 사람 확인 대기 (두 계정) |
| CHAT-31 | **(수수료 부분은 #265로 없어짐)** 시터가 견적을 보내기 전 초안 (#235): 채팅의 **Send quote**를 누르면 시트에 서버가 계산한 내역(단가 × 박수 · 추가 펫 · 공휴일)과 합계가 먼저 보이고 아직 아무것도 안 보내짐. 요금이 없으면 시트 안에 이유가 나오고 Send는 꺼짐. 같은 시트에서 **수수료 줄**(Medication · Extra walks 같은 칩 또는 직접, 금액 0 초과 500 이하, 최대 5개)을 붙이고 **Remove**로 뺄 수 있고 합계("Total with your fees")가 따라감. Send하면 견적 카드가 가고 수수료는 오너가 하나씩 답하는 제안으로 붙음(합계는 수락 전엔 그대로). 숫자는 늘 서버 것이고 모델이 쓰지 않음 | 🤖 `chat` | 사람 확인 대기 |
| CHAT-32 | Final quote 이름 (#235): Meet & Greet · 동의 · 결제 카드 뒤에 시터가 보내는 견적은 카드 제목과 시트 제목 · 버튼이 **Final quote** / **Send final quote**, 그 전의 견적은 **Quote**. 채팅의 칩은 **한 줄, 작은 칩, 옆으로 스크롤**(둘째 줄 없음) | 🤖 `chat` | 사람 확인 대기 (두 계정) |
| CHAT-33 | 메시지창 왼쪽 **+** (#235): 누르면 **Send a card** 시트에 Meet & Greet request · Quote(시터만, 결제 카드 뒤에는 Final quote) · Date change · Start trip · Photo request(오너만, 케어 중일 때만). 지금 할 수 없는 항목은 흐리게(예약이 없으면 Meet · Date · Trip이 꺼짐, 시터 집이 장소면 시터의 Start trip은 꺼짐, 2시간 창 전엔 Start trip 꺼짐). 항목마다 흐름이 여는 것과 같은 것을 엶: Quote → 견적 초안 시트, Date change → 시간 · 장소 시트, Start trip → 위치 공유 동의 화면, Photo request → 사진 요청 카드, Meet & Greet → 카드의 Pick a time / Accept | 🤖 `chat` · `chat-trip` | 사람 확인 대기 |
| CHAT-34 | 오너의 "I'd like to book" (#235): 시터의 채팅이 열려 있는 동안 오너가 동의하면 새로고침 없이(폴링 5초 안, Realtime) 동의 카드가 "Booked, you both agreed"로 바뀜. 오너 쪽도 같은 카드에 "✓ Robert would like to book" | 🤖 `chat` | 사람 확인 대기 (두 폰) |
| CHAT-35 | 입력에 맞는 칩 (#235): 메시지창에 글을 쓰다 **1.5초** 멈추면 평소 칩이 사라진 자리에 스피너("Finding replies…") → 쓰는 글에 맞는 칩 2–3개(예: "can you take them early" → 조기 픽업 · 목줄 같은 질문). 쓰는 도중에는 아무것도 묻지 않음. 칩을 누르면 **쓴 글을 살린 초안**이 상자에 들어가고(보내는 건 사람), 초안을 넣은 뒤에는 다시 묻지 않음. 상자를 비우면 평소 칩이 돌아옴. 실패하면 칩 없음(추측 안 함), 비우면 평소 칩. 서버: `/api/ai/chat-chips`에 `typed`(≤300자)를 주면 이메일 · 4자리 이상 숫자(전화 · 출입 코드)를 지운 뒤에만 프롬프트로 가고, 행동(action)은 없음, 로그에는 글 내용 없이 길이만 + 이름이 가려진 칩. 가격 · 날짜는 계속 서버가 넣음 | 🤖 `chat` e2e · pytest `test_ai_chat` | 사람 확인 대기 (실제 모델로 칩 품질 👤) |
| CHAT-36 | 펫 인계도 채팅에서 (3D.8, #145): 결제한 확정 부킹에서 **드롭오프 트립이 도착했거나 I've arrived로 끝난 뒤에만** 시터 채팅에 Received(#250: 2시간 창이 열린 것만으로는 안 나옴, 오너에겐 없음, 트립 없이 맡기면 예약 화면의 Received). 카드는 하나로 합쳐져 **"Robert has arrived 🚗 · 7:16 PM"**(도착 시각) 아래에 **Track Robert** · **Received**(· 인사 버튼)가 같이 보임. 누르면 "Max & Mochi are with you 🐾 · Received …" + **Returned**로 바뀌고 오너 채팅에는 "… are with Chloe 🐾"(누를 것 없음). **Returned**는 예약 화면과 같은 Return 시트(남은 오늘 할 일 · 오늘 알림장 안 보냄 경고, 픽업 30분 전보다 이르면 빨간 Return과 "really?"), 확인하면 "Home safe 🏠"(시터 "… went home with Robert", 오너 "… are back with you")이고 오너에게 알림, Life Record는 뒤에서 생성. 트립 카드의 도착 인사 → Received → 케어 카드 → Returned → Home safe가 한 채팅에서 이어짐. 종료 · 리뷰는 #146 | 🤖 `chat-trip` · `completion` | 사람 확인 대기 (두 계정) |
| CHAT-37 | 종료와 리뷰도 채팅에서 (3D.9, #146): Returned 뒤 두 채팅에 "Home safe 🏠" 아래로 리뷰 카드. **오너**: "How was Biscuit and Luna's stay with Paul?" + 별점 · 별마다 한 번에 고르는 문구 · 한마디(선택) · **Send review**(한 스테이에 한 번, 시터에게 알림). 보내면 같은 자리가 **"Your review"**(별 · 코멘트)로 바뀌고 그 아래 **하트**(♡ "Add Paul to favorites" / ♥ "Favorite", 누르면 바로 저장 · 다시 누르면 해제, 시터는 모름). 다시 열어도 폼이 아니라 리뷰가 보임. **시터**: "Peter's review"(오너가 쓰기 전엔 "hasn't left a review yet", 쓰면 10초 안에 새로고침 없이 별 · 코멘트가 보임)와 **"How was it working with Peter?" 🔒 Only you can see this** 비공개 노트(별 · 문구 · 한마디, 오너는 절대 못 봄, 하트는 없음). 끝난 스테이의 채팅 맨 아래에는 **Send quote · Request booking 버튼이 없음**(새 Stay 카드가 생기면 다시 나옴). 예약 화면의 리뷰 화면은 같은 폼을 쓰고 그대로 동작 | 🤖 `chat-trip` · `completion` · `handoff` | 사람 확인 대기 (두 계정, 데모 계정으로 한 번 눌러 봄 2026-10-20) |

### 3.37 제안 카드에 Decline 없음 (PROP) · #169

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| PROP-1 | 확정 전 요청에서 시터가 새 시간을 제안 → 오너가 예약 화면을 엶 | 제안 카드에 **Accept**와 **Suggest another time**만 있고 Decline은 없음. 카드로는 예약이 끝나지 않음 | 🤖 `negotiation` | ➖ |
| PROP-2 | 오너가 새 시간을 제안 → 시터가 예약 화면을 엶 (확정 뒤 함께 옮기는 두 시간 포함) | 카드에 Decline 없음. 짝 제안 안내는 "Accept answers both." | 🤖 `negotiation` | ➖ |
| PROP-3 | 예약을 끝내고 싶을 때 | 화면 아래의 시터 **Decline** / 오너 **Cancel booking**(또는 Not this sitter)만 예약을 끝냄 | 🤖 `sitter-bookings` · `rebook` | ➖ |

### 3.38 Meet & Greet가 선택임을 분명히 (MGOPT) · #170

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| MGOPT-1 | 시터가 처음 만나는 사이의 요청을 엶 (예약 화면, 채팅 푸터) | 앞으로 가는 버튼이 **Next** (예전 "Yes, let's meet"). 누르면 날짜가 잡히고, 다음 화면에서 시간 정하기 또는 건너뛰기 | 🤖 `sitter-bookings` · `meet-greet` · `chat` | ➖ |
| MGOPT-2 | Next 뒤, 아직 만나지도 건너뛰지도 않았을 때 예약 화면 | **I accept**가 꺼져 있고 바로 위에 "Meet Robert first, or agree to skip the Meet & Greet." 기간이 지난 요청은 "The pick-up time has passed." | 🤖 `meet-greet` · `sitter-bookings` | ➖ |
| MGOPT-3 | 시간이 정해진 Meet & Greet 카드에서 **Add to calendar** | 새 탭에 Google Calendar 일정 화면, 제목 · 30분 시간 · 장소(화상이면 Meet 링크)가 채워짐. `.ics` 파일은 더 이상 안 받음 | 🤖 `meet-greet` (링크 확인) · **👤** (실제 Google 화면) | ➖ |

### 3.39 Meet & Greet 카드 손보기 (MGCARD) · #229 · *사전: 호스팅 DB에 `014s` 적용 뒤*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| MGCARD-1 | 정해진 화상 Meet & Greet에서 **Join Google Meet** | 새 탭으로 열리고 앱은 그대로 | 🤖 `meet-greet` (데스크톱 프레임) | **👤** 휴대폰(Meet 앱이 설치돼 있으면 앱이 링크를 가져갈 수 있음) |
| MGCARD-2 | 화상으로 정해진 카드 | "Go over together" 체크리스트가 없음. 대면이면 그대로 있음 | 🤖 `meet-greet` | ➖ |
| MGCARD-3 | 정해진 시간 **전**에 **Done, we met** (카드 또는 채팅 푸터) | "It is not time yet / Did you already meet …?" 확인. **Cancel**은 아무것도 안 바뀜, **Yes, we met**이면 Met ✓. "After you meet, tap Done here." 줄은 없음. 양쪽이 둘 다 눌러도 오류 없음 | 🤖 `meet-greet` · `chat` · SQL `rls_smoke`(014s) | ➖ |
| MGCARD-4 | Schedule Meet & Greet 시트에서 날짜 · 시간 누르기 | 날짜는 **달력**, 시간은 **시계**(분 단위, 예: 3:07 PM). −/+는 빠른 조정용으로 남음 | 🤖 `meet-greet` | ➖ |

### 3.40 일찍 찾아가면 시터 일정이 다시 열림 (EARLY) · #232 · *사전: 호스팅 DB에 `014u` 적용 뒤*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| EARLY-1 | 여러 날 숙박을 맡기고(Received) 첫날 바로 **Returned** → 시터 Schedule, 다른 오너의 검색 | 반납 뒤의 날짜 · 칸이 다시 비어 있음(남은 자리가 돌아옴). 반납 시각이 들어 있는 칸과 그 전 칸은 그대로 | SQL `rls_smoke`(014u) | ➖ |
| EARLY-2 | 약속한 픽업 시각이 지난 뒤 Returned | 아무 칸도 바뀌지 않음 | SQL `rls_smoke`(014u) | ➖ |
| EARLY-3 | `014u` 적용 직후 호스팅 DB | 이미 일찍 반납된 예약(예: `c717fdcc…`)의 반납 뒤 칸도 한 번에 정리됨 | **👤** (읽기 전용 확인) | ➖ |

### 3.41 오너 가입 상세 (OWN) · 11.15 S1 · #185 · *DB · 사진 라우트 · 질문 화면 · 카드까지, 나머지 화면 시나리오는 단계가 끝날 때마다 아래에 추가*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| OWN-1 | (DB) `rls_smoke.sql`의 014v 블록 | 한 번 호출로 펫 · 답 · 알레르기가 저장됨(알레르기는 다듬어 소문자 · 중복 제거) · 같은 id로 다시 부르면 두 번째 펫 없이 수정됨 · 답은 객체만, 16000자까지 · 소개는 500자까지 · 새 오너는 `onboarded_at`이 null로 시작하고 본인만 바꿈 · 다른 오너의 펫 id 재사용 · 시터 · anon은 거부 · 오너만 답 · 소개 수정 · 사진은 8장까지(9번째 거부), 펫 주인만 추가 · 오너 · 예약된 시터는 읽고 다른 오너 · 관계 없는 시터 · anon은 못 읽음 · 순서 변경은 오너만, 일부만 보내면 거부 · 삭제는 백엔드만 · 틈이 닫힘 · 펫을 지우면 사진도 사라짐 | SQL `rls_smoke` (로컬 Postgres 17 전체 파일 980 PASS, 2026-10-21, 어시스턴트) | 호스팅 DB에 `014v` 적용 후 |
| OWN-2 | (백엔드) 펫 사진 라우트 `/api/pet-photos` | 서명은 로그인한 사람의 폴더(`goldito/pet-profile/<id>`)로만 · `complete`는 폴더가 다르면 422, 펫 주인이 아니면 404, Cloudinary에 없는 파일은 422, 9번째는 409("up to 8"), 같은 업로드를 두 번 보내면 같은 행 · 삭제는 펫 주인만(아니면 404), 파일을 먼저 지우고 행을 지우며 파일 삭제가 실패하면 행은 남음 | 🤖 pytest `test_pet_photos.py` (12개) | ➖ |
| OWN-3 | (로직) 질문 목록 · 점수 계산 | 개 12문항 · 고양이 10문항 · 안전 5문항(+ 피해야 할 음식), 선택지는 모두 4개 · 고양이 문항에 개 전용 표현 없음 · 화면에 점수(%)나 "MBTI"가 없음 · 축 단계는 답의 평균을 반올림, 답이 없는 축은 빠짐 · 경고 칩은 스펙대로("Not sure"는 "Owner isn't sure", 건너뜀은 아무것도 안 보임) · 저장된 프로필은 이상한 값을 버리고 읽음 | 🤖 `owner-onboarding-logic.spec.ts` (10개) | ➖ |
| OWN-4 | **새 오너**(`owner_profiles.onboarded_at`이 null)로 가입 또는 로그인 | 홈 대신 **"What kind of pet do you have?"**가 열림(큰 글씨 28 px 질문, 64 px 높이 답, 위에 진행 막대와 Back). **Dog**와 **Cat**은 둘 다 고를 수 있고(다시 누르면 해제), 하나 이상 고르면 **Next**가 켜져 이름 화면으로 넘어감(OWN-24). 이전부터 있던 오너는 이 화면을 만나지 않음 | 🤖 `owner-onboarding` | 사람 확인 대기 |
| OWN-5 | 이름 → 품종 → 나이(−/+) → 몸무게(kg 또는 lbs, OWN-25) → **Tell us about {name}** → 개 12문항 또는 고양이 10문항 → 안전 5문항 → 피해야 할 음식 | 한 화면에 질문 하나, 질문마다 펫 이름이 들어감. **Back · Skip(또는 Next · Save)은 화면 맨 아래에 고정**되어 질문마다 위치가 바뀌지 않음. 답을 누르면 자동으로 다음 화면. 이름이 비면 Next가 눌리지 않음. 품종 · 나이 · 몸무게 · 소개는 쓴 뒤에만 Next가 켜지고 **Skip**은 항상 있음. 고양이 문항에는 산책 · 목줄 같은 개 전용 표현이 없음. 음식은 칩(Chicken · Beef · Dairy · Wheat · Fish) + **Something else**(직접 입력) + **None**. 성격 문항(또는 "Where these questions come from")에서 **Skip all** · **Skip questions**를 누르면 요약이 아니라 **건강 질문("Anything a sitter must know about {name}'s health?")**에서 멈추고 거기부터 이어서 답함 | 🤖 `owner-onboarding` | 사람 확인 대기 |
| OWN-6 | 마지막 **Meet {name}** 요약 | 행마다 값이 보이고(없으면 "Not shared yet", 문항은 "9 of 12 answered"), 경고 칩이 보임("Has snapped once", 모르면 "Owner isn't sure (…)" — 건너뛴 질문은 아무것도 안 보임). 행을 누르면 그 화면으로 가고 하나 고친 뒤 요약으로 돌아옴. **Save {name}** → 홈, 펫 · 답 · 알레르기가 저장되고 `onboarded_at`이 찍힘 | 🤖 `owner-onboarding` | 사람 확인 대기 |
| OWN-7 | 중간에 새로고침 · Back · **Add a pet later** | 새로고침하면 보던 화면에서 이어짐(답은 기기에 저장). Back은 직전 화면(쓴 값 그대로). **Add a pet later**는 펫 없이 오너를 완료로 표시하고 홈으로 감(다시 안 물음) | 🤖 `owner-onboarding` | 사람 확인 대기 |
| OWN-8 | 이름 다음 **Add photos of {name}** | 사진을 몇 장이든 8장까지 추가(고르기 → 자르기 → 올리기), 첫 장이 **Cover**. 사진을 누르면 **Make cover** · **Remove photo**. 올리는 동안 Next는 "Uploading…"으로 잠김, 한 장도 없으면 Next가 꺼져 있고 **Skip**만 됨. 저장하면 펫이 먼저 만들어지고 사진이 순서대로 붙음(다시 저장해도 중복 없음). 지운 사진은 Cloudinary에 파일이 남을 수 있음(저장 전 초안이라 펫에 안 붙음) | 🤖 `owner-onboarding` · pytest · SQL `rls_smoke` | 사람 확인 대기 |
| OWN-9 | 안전 질문과 음식 다음 **A few words about you** → **Where do you live?** | 오너 소개(500자까지, 선택)와 위치(선택). 주소를 쓰고 **Check address**로 찾은 것을 고르거나 **📍 Use my current location** 버튼으로 핀을 찍고 찾은 주소(예: "Dundas St W, Toronto, M6J")가 주소칸에 채워져 "✓ Found on the map"으로 보임(주소를 못 찾으면 "No address found here. The pin is kept."와 "Pin set", 브라우저가 막으면 "Location is off for Goldito in this browser", #284). 둘 다 **Skip** 가능. 저장하면 채운 것만 오너 프로필에 들어가고(소개 · 집 주소 · 핀) 안 채운 것은 건드리지 않음. 요약에 "About you" · "Home" 행이 보임 | 🤖 `owner-onboarding` | 사람 확인 대기 (실기기 GPS) |
| OWN-10 | **"{name} at a glance" 카드**: 시터의 예약 상세(펫마다), 오너의 펫 상세, 가입 요약 맨 위 | 사진(없으면 종 아이콘) · "Dog · Maltese · 4 yrs · 6 kg" · 경고 칩 먼저("⚠️ Has snapped once", "Owner isn't sure (…)", "Daily medication", "No chicken") · 5각형 차트(눈금 4칸, 숫자 · % 없음, 축마다 "Social" 같은 단계 말) · 안 답한 축은 "Not shared yet"로 모양에서 빠짐 · 아무 답도 없으면 "Personality: not shared yet" · 맨 아래 "Owner's description, not an assessment.". 답 · 경고 · 사진이 하나도 없는 펫은 카드가 아예 안 나옴(기존 펫 화면 그대로). 시터는 요청 · 예약을 받은 펫만 읽음(RLS) | 🤖 `pet-glance` · `owner-onboarding` | 사람 확인 대기 (휴대폰 너비 360 · 402 · 440, 글자 크기 200%) |
| OWN-11 | 데모 초기화(Profile → Demo tools)와 시드 스크립트 | 오너가 가입 질문을 마친 것으로 표시되어 로그인해도 질문 화면이 안 열림. Max · Mochi에 답이 들어가 시터의 예약 상세와 오너의 펫 상세에 카드가 보임. 이미 답이 있는 펫은 그대로 둠(다시 초기화해도 덮어쓰지 않음). **`014v`를 호스팅 DB에 적용한 뒤에만** 동작(그 전에는 초기화가 `profile` 열을 못 찾아 실패) | 🤖 pytest `test_reset_demo.py` | 호스팅 DB에 `014v` 적용 뒤 한 번 |
| OWN-12 | (백엔드) `POST /api/ai/pet-voice/transcribe`: 녹음 파일을 본문으로 보냄 | 오너만(시터 403, 로그인 안 하면 401) · 오디오 타입만(그 외 415) · 1 KB 미만 422, 5 MB 초과 413(Groq로 보내기 전에 거절) · Groq에 `whisper-large-v3-turbo`로 보내고 텍스트를 공백 정리해 돌려줌 · Safari mp4는 `voice.m4a` · 키가 없으면 503 "Voice isn't available right now. You can type it instead." · 서비스 오류 502, 시간 초과 503 · 아무 말도 없으면 빈 텍스트. 로그에는 시간과 바이트 수만 남고 소리와 글은 안 남음 | 🤖 pytest `test_pet_voice_transcribe.py` (10개) | 실제 Groq 호출은 사람이 한 번(음성 5개: 조용 · 시끄러움 · 반려동물 이름 · 느린 말투 · 고령 화자) |
| OWN-13 | (백엔드) `POST /api/ai/pet-voice`: 고친 글 + 아직 안 답한 질문 목록을 보냄 | 오너만 · 글은 `<transcript>` 태그 안의 데이터로만 모델에 감(명령으로 안 읽음) · 사실마다 **글 속 근거 문장(quote)**이 있어야 하고 서버가 글에 실제로 있는지(대소문자 · 문장부호 무시, 단어 단위) 검사 · 값이 근거와 안 맞으면 버림(품종 · 나이 · 몸무게 · 음식) · 파운드로 말하면 kg로 환산된 값만 통과 · 질문 목록 밖의 키 · 선택지 밖의 값 · 지어낸 근거는 버림 · 모델 오류는 503/502 "answer the questions yourself" · 아무것도 저장하지 않음 | 🤖 pytest `test_ai_pet_voice.py` (15개) · 라이브 확인(어시스턴트, 2026-10-21): `say`로 만든 음성 → Groq 0.5 s → Nemotron Nano 1.4 s, 품종 · 나이 · 몸무게(13 lb → 5.9 kg) · 닭고기 · d4=3 · s1=once가 근거와 함께 나오고 말하지 않은 d1은 비어 있음 · 2026-10-22: 줄바꿈이 있는 JSON의 쉼표를 대시 제거가 지워 502가 나던 것을 고침(`test_nebius.py`), 라이브 8번 모두 통과 · 2026-10-23: 번호 목록 순서로 말한 글에서 품종 · 나이 · 몸무게 · 알레르기(음식마다 한 항목, "chicken and beef" → 둘) · 안전 질문(once → once)이 맞게 나오고, 어떤 아이인지 · 좋아하는 것 · 무서워하는 것 · 하루 일과 · 건강과 약 · 조심할 것 · 더 알려줄 것(2026-10-24 질문 11개 개편, 키 `personality` · `loves` · `scares` · `routine` · `health` · `careful` · `more`)은 **말한 그대로의 문장(`notes`, 글에 실제로 있어야 하고 300자 이하, "nothing special" · "none" 같은 없다는 답은 버림)**으로 돌아옴. 성격 퀴즈 질문은 더 이상 모델에 보내지 않음(버튼으로 답함, pytest `test_ai_pet_voice.py` 18개). 2026-10-23: 모델이 말하지 않은 항목을 `"likes": null`처럼 항목째 null로 주면 답 전체가 502로 버려지던 것(구조 없이 말한 글에서 18번 중 6번)을 고침: null 항목은 건너뛰고 나머지는 살림(foods 목록 · answers · notes, 시터 음성도 같음). 이 항목 null 처리 뒤 같은 시나리오 18번 중 0번 실패. 2026-10-23: 모델이 말하지 않은 항목에 `"quote": null`을 주면 답 전체가 502로 버려지던 것을 고침(null 근거는 근거 없음으로 읽어 그 항목만 버림, 시터 음성도 같음, pytest `test_ai_pet_voice.py` · `test_ai_sitter_voice.py`) | 사람이 실제 목소리로 한 번(조용 · 시끄러움 · 이름 · 느린 말투 · 고령 화자) |
| OWN-14 | 사진 다음 **Tell us about {name}** (음성 · 직접 입력) | 처음에는 **화면 가운데에 마이크 버튼**(96 px, "Tap to talk")과 **그 바로 아래의 작은 Or type it 버튼**(좌우 여백이 좁은 secondary 버튼), 그 밑에 **작은 회색 글씨**의 개인정보 안내만 보임(질문 목록은 없음). **첫 화면은 스크롤 없이 한 화면에 다 들어오고**(폰 높이 704 px 기준 맨 아래 Back · Skip까지), 화면이 낮으면 마이크 영역이 줄어듦. 녹음 중에는 파형이 **마이크 좌우**에서 움직이고 질문 영역이 그 위에 남은 높이만큼 스크롤됨. 녹음이 시작되면 Or type it 버튼은 서서히 사라짐. 마이크를 누르면 **마이크가 아래로 부드럽게 내려가고** 위에 질문이 **한 줄씩 큰 글씨로 써짐**(11개: "1. What breed is {name}?" · "2. How old is {name}?" · "3. How much does {name} weigh?" · "4. What is {name} like?" · "5. What does {name} love?" · "6. What scares or upsets {name}, and how do you calm {name} down?" · "7. What does a normal day look like for {name}?" · "8. Is {name} allergic to anything?" · "9. Any health problems or medicine for {name}?" · "10. What should a sitter watch out for?" · "11. Anything else we should know?". 5 · 6 · 7 · 10번 밑에는 **종류별 예시가 작은 회색 글씨**로 붙음: 강아지는 "Treats, toys, walks, spots" · "Thunder, strangers, baths" · "Food, walks, potty, sleep" · "Pulling, other dogs, escaping", 고양이는 "Treats, toys, windows, spots" · "Visitors, loud noises, the carrier" · "Food, litter box, play, sleep" · "Hiding, scratching, slipping outside". 길면 스크롤). 질문 목록이 상자보다 길면 **오른쪽에 눈에 보이는 스크롤바**(트랙 + 막대)가 그려져 스크롤할 수 있다는 것을 알 수 있음(브라우저의 기본 스크롤바는 스크롤하기 전엔 숨겨지므로 직접 그림). 녹음 중에는 **파형**이 목소리 크기에 따라 움직이고 마이크가 살짝 커졌다 줄어듦, "0:03 of 1:00"(60초에 자동 멈춤). 다시 누르면 "Reading what you said…" 뒤 **받아 적은 글 전체**가 고칠 수 있는 칸에 나오고 **Fill in the answers** · **Record again**이 있음. 마이크가 막히거나 없으면 바로 3번째 줄의 입력 칸(OWN-14b)으로 감. 마이크가 막히면 "The microphone is off for Goldito in this browser. You can type it instead." 화면을 떠나면 녹음이 멈춤 | 🤖 `owner-onboarding` (가짜 마이크, 질문이 가려졌다 보이는지는 opacity로) · 이동 · 파형 움직임은 사람 눈으로 | **👤** 실제 마이크: Chrome · Safari(iPhone), 소리 5가지 · 마이크가 내려가는 움직임 · 파형이 목소리에 반응하는지 |
| OWN-14b | **Fill in the answers** 또는 **Or type it** | **질문 하나에 칸 하나**(질문이 글씨 큰 라벨, 11칸, 예시는 칸의 힌트)가 나옴. 음성에서 온 경우 읽어 낸 답이 **칸에 채워져 있고 고칠 수 있음**(품종 · 나이 · 몸무게는 칸마다 숫자 · 알레르기는 "chicken, beef" 쉼표 · 어떤 아이인지 · 좋아하는 것 · 무서워하는 것과 달래는 법 · 하루 일과 · 건강과 약 · 시터가 조심할 것 · 더 알려줄 것은 말한 문장 그대로). 못 읽었으면 이유 줄과 함께 **빈 칸**을 직접 채움. Or type it은 읽는 단계 없이 **빈 칸**을 바로 채움(모델 호출 없음). **Use these**를 누르면 채운 칸만 반영: 품종 · 나이 · 몸무게는 다음 화면들에 채워지고, **알레르기는 Foods to avoid에 골라진 칩**이 되되 오너가 그 화면에서 한 번 더 확인해야 하고(OWN-15b), 나머지 칸은 **About {name}**(1000자까지)에 한 줄씩("어떤 아이인지" 다음 "Loves:" · "Upset by:" · "Routine:" · "Health:" · "Watch out:" · "More:") 들어감. 비운 칸은 아무것도 바꾸지 않음. 성격 퀴즈 12개는 **아무것도 골라져 있지 않음**. 안전 질문은 말한 문장만 "We heard"로 보이고 오너가 눌러야 골라짐 | 🤖 `owner-onboarding` · `owner-onboarding-logic` | 사람 확인 대기 |
| OWN-15 | **Use these** 뒤 다음 화면들 | 칸에 남긴 값이 품종 · 나이 · 몸무게 화면에 채워져 있고 품종 · 나이 · 몸무게에는 "✨ You said: ..."가 보임. **성격 문항 12개는 아무것도 골라져 있지 않음**. **안전 문항은 미리 골라지지 않음**: "✨ We heard: ..."와 해당 선택지에 "✨ suggested"만 붙고 눌러야 답이 됨. 칸을 비운 항목은 아무것도 바꾸지 않음. 읽기가 실패하면 "...You can answer the questions yourself."가 나오고 빈 칸을 직접 채움 | 🤖 `owner-onboarding` · `owner-onboarding-logic` | 사람 확인 대기 |
| OWN-15b | **알레르기는 무조건 한 번 더 확인**: 음성 · 입력 칸의 알레르기를 거쳐 **Foods {name} must avoid?** 화면에 도착 / 직접 칩을 골라 도착 | 음성이나 입력 칸에서 온 알레르기는 칩이 **골라진 채**로 나오지만 아래 **"I checked this list"** 체크가 꺼져 있고 **Next가 눌리지 않음**(고른 음식이 없고 None도 아니면 체크해도 안 눌림). 체크해야 Next가 켜짐. **칩 · None · Something else를 한 번이라도 바꾸면 체크가 다시 꺼지고** 다시 체크해야 함. 음성 입력 칸에 알레르기를 또 적어 돌아오면 체크는 꺼진 채로 시작. 음식 화면에는 **Skip이 없고** 제목 밑에 회색 작은 글씨 "If there are none, tap None."이 보임. **체크 없이 Skip all로 넘어가면 알레르기와 음식 답(s6)은 저장되지 않음**(요약의 Foods to avoid가 "Not shared yet", `pet_allergies` 0건, `profile.safety`에 s6 없음). 체크한 목록만 저장됨 | 🤖 `owner-onboarding` (체크 전 Next 비활성 · 바꾸면 체크 해제) · `owner-onboarding-logic` (저장 보호) | 사람 확인 대기 |
| OWN-16 | (백엔드) `POST /api/ai/pet-photo {public_id, species}` | 오너만 · 본인의 펫 사진 폴더(`goldito/pet-profile/<내 id>/`)에 올린 사진만(다른 사람 · 다른 폴더는 403, 모델에 안 감) · 품종은 최대 3개, 중복 · 긴 이름 제거 · 털색은 white · cream · golden · orange · brown · black · gray · mixed 중 하나(그 밖은 null) · 오너가 고른 종과 사진 속 동물이 다르거나 동물이 없으면 `species_match: false`와 빈 제안 · 오너가 고른 종은 모델에 알려 주지 않음(알려 주면 따라감, 라이브로 확인) · 사진을 못 열면 422, 모델 오류 503/502 · 저장 안 함 | 🤖 pytest `test_ai_pet_photo.py` (9개) · 라이브(어시스턴트, 2026-10-21): 샘플 사진 5장, 1.2 ~ 1.7 s. 몰티즈 → Maltese(white), 치와와 → Chihuahua(cream), 개 사진을 cat으로 보내면 `species_match: false` | 실제 믹스견 · 고양이 사진은 사람이 한 번(스펙 §6.1: 믹스견 정확도는 검증 못 함, 오너 확인이 필수) |
| OWN-17 | 사진을 올린 뒤(대표 사진) 품종 화면과 **What color is {name}?** 화면 | 사진을 올리면 **기다리지 않고** 뒤에서 대표 사진을 봄(15초 넘으면 포기). 품종 화면에 추측이 오면 "Maltese?" "Poodle mix?"(각각 "✨ suggested") + **Not sure** 칩이 나옴: 누르면 품종이 채워지고 다음으로, 입력칸은 그대로 쓸 수 있음. **자동으로 채워지지 않음**. 색 화면은 흰색 · 크림 · 금색 · 주황 · 갈색 · 검정 · 회색 · 섞임 중 하나, 추측된 색에만 "✨ suggested"(선택은 안 됨), Skip 가능. 고른 색은 `pets.profile.coat`에 저장(다마고치 스프라이트 키). 다른 동물이거나 실패하면 아무것도 안 나오고 흐름은 그대로. 새로고침해도 고른 값은 유지 | 🤖 `owner-onboarding` · pytest | 사람 확인 대기 |
| OWN-18 | (DB) `rls_smoke.sql`의 014w 블록 | 백엔드(서비스 롤)만 `breed_notes`를 읽고 씀 · 종과 품종당 한 행 · 개와 고양이만 · `chips`는 목록 · 오너 · 시터 · anon은 읽기도 쓰기도 권한 없음 | SQL `rls_smoke` (로컬 Postgres 17 전체 파일 990 PASS, 2026-10-21, 어시스턴트) | 호스팅 DB에 `014w` 적용 후 |
| OWN-19 | (백엔드) `POST /api/breed-needs {species, breed}` | 로그인한 오너 · 시터 누구나 · 품종처럼 보이는 글만(숫자 · 기호 · 60자 초과는 422) · 검수한 목록(`app/data/breed_needs.json`)에 있으면 검색 없이 `origin: list` · 없으면 캐시(`breed_notes`, 찾음 30일 · 못 찾음 3일) · 그래도 없으면 신뢰 사이트(개 akc.org · vcahospitals.com · merckvetmanual.com, 고양이 icatcare.org · cfa.org 등)에서 검색 1회 + Nemotron 요약, **줄마다 글 속 인용이 실제 페이지 발췌에 있어야** 남김 · 최대 3줄(exercise · grooming · care 각 한 번) · 출처는 남은 줄이 나온 페이지만 · "Poodle mix"는 Poodle로 찾고 `basis: Poodle` · 실패(키 없음 · 느림 · 모델 오류)는 `none`이고 캐시하지 않음 · 새 품종 검색은 사람당 하루 20번(넘으면 429, 목록 · 캐시는 제한 없음) | 🤖 pytest `test_breed_needs.py` (16개) | 실제 검색은 사람이 한 번(새 품종으로) |
| OWN-20 | 품종 목록 `backend/app/data/breed_needs.json` (`scripts/build_breed_needs.py`가 만든 후보) | 개 20종 · 고양이 8종 중 검색에서 근거가 나온 품종만 들어감(개 16 · 고양이 5 안팎, 나머지는 앱이 처음 볼 때 검색). 줄마다 `quote`(출처 페이지의 실제 문장)와 출처 링크가 있고 전부 `reviewed: false`. **슬기가 줄마다 출처 링크의 페이지와 맞는지 읽고 고치거나 지운 뒤 `reviewed: true`로 바꿈**(약한 줄 · 다른 품종 페이지에서 온 줄 · 일반 문서 출처가 섞여 있음) | 🤖 (만드는 스크립트는 앱과 같은 검증을 씀) | **👤 슬기 감수** |
| OWN-21 | "at a glance" 카드의 **Needs** 줄(시터 예약 상세 · 오너 펫 상세 · 가입 요약) | 품종이 있으면 카드가 먼저 뜨고 잠시 뒤 "Needs" 아래에 최대 3줄("Grooming: Brush daily", "Watch for: …")과 "Source: akc.org" 같은 출처 링크가 붙음(링크는 새 탭). "Poodle mix"는 "Needs (based on Poodle)". 품종을 못 찾거나 실패하면 Needs 칸이 아예 없고 카드는 그대로. 품종 글을 쓰는 동안 글자마다 검색하지 않음(0.4초 쉼) | 🤖 `pet-glance` · `owner-onboarding` | 사람 확인 대기 (정적 목록에 없는 품종으로 데모 영상용 한 번) |
| OWN-22 | 오너 가입에서 **Tell us about {name}**(소개) 다음, 성격 질문 시작 전 | **"Where these questions come from"** 화면: "We wrote them ourselves, in plain words. The ideas come from published pet personality surveys. It is not a behavior test." + **Sources** 링크(개: MCPQ-R · C-BARQ · DPQ, 고양이: Feline Five · Fe-BARQ, 새 탭) + **Start**. 링크는 앱 글꼴로 보임 | 🤖 `owner-onboarding` | 사람 확인 대기 (링크가 열리는지) |
| OWN-23 | 질문 · 선택지 화면 맨 아래 **Back · Skip** 한 줄 (오너 · 시터 온보딩 전체) | 맨 아래에 **한 줄**로 **왼쪽 Back, 오른쪽 Skip**이 같은 폭의 **테두리 버튼**(DESIGN.md의 secondary: 흰 바탕 · 진한 테두리 · 초록 글씨)으로 나옴. 위의 채운 **Next**(primary)가 있으면 그 아래. Back은 위쪽 화살표와 똑같이 이전 화면으로 돌아가고(쓴 값 그대로) 첫 화면에는 자리만 비어 있음(Skip은 오른쪽 그대로). Skip이 없는 화면(필수 화면)은 Back만 왼쪽에. 시터 온보딩 질문 화면과 음성 화면도 같음(음성 화면의 "Skip all for now"는 글자 링크로 그 위에) | 🤖 `owner-onboarding` · `sitter-onboarding` (두 버튼의 위치로 한 줄 · 왼쪽 오른쪽 확인) | 사람 확인 대기 |
| OWN-24 | 강아지와 고양이 **둘 다** 고른 오너 (#285 Common-007): 종류 화면에서 Dog와 Cat을 다 고르고 Next | 강아지가 먼저이고 질문이 **"What's your dog's name?"**로 펫을 구분함. 첫 펫의 요약에서 **Save**를 누르면 "{name} is added" 뒤 **고양이의 이름 화면**으로 감: 종류 질문과 "A few words about you" · "Where do you live?"는 다시 묻지 않고, 요약에도 About you · Home 행이 없음. 고양이는 10문항. 두 번째 펫 첫 화면에는 Back이 없음. **첫 펫을 저장해도 오너는 아직 끝난 게 아님**(`onboarded_at`은 마지막 펫을 저장해야 채워짐): 고양이 도중에 새로고침하면 고양이 화면에서 이어짐. 마지막 Save 뒤 홈으로 가고 두 펫이 다 보임 | 🤖 `owner-onboarding` (둘 다 고르기 · 펫마다 한 번씩 · 새로고침) | 사람 확인 대기 |
| OWN-25 | 몸무게 화면의 **kg · lbs** 전환 (#285 Common-009): 기본은 kg. lbs를 누르고 "22.5"를 입력 | 입력칸 힌트가 단위(kg · lbs)로 바뀜. 단위를 바꾸면 **입력한 숫자가 바뀐 단위로 환산**됨(6.8 kg ↔ 15 lbs). 요약의 Weight 행은 입력한 그대로("22.5 lbs"), 카드와 저장은 **kg 소수 둘째 자리**(10.21 kg). lbs로 0이나 1000 kg 넘는 값은 저장되지 않음(Next는 켜져도 저장 때 빈 값). 음성으로 들은 몸무게는 고른 단위로 적힘(5.9 kg → 13 lbs). 펫 상세와 홈에는 kg로 나옴 | 🤖 `owner-onboarding` (단위 전환 · 저장) · `owner-onboarding-logic` (환산 · 범위) | 사람 확인 대기 |
| OWN-26 | **몇 마리인지** 정하고 이어서 등록 (#325): 첫 화면 "What kind of pet do you have?" | **Dog** · **Cat**을 누르면 골라지고 그 아래에 **"How many dogs?" / "How many cats?"** − 값 + 가 나옴(1에서 6까지, 1에서는 − 가 꺼짐). 둘 다 고를 수 있어서 강아지 2 + 고양이 1 같은 조합이 됨(강아지 먼저, 그다음 고양이). 다시 누르면 선택이 풀림(0). Next 뒤 펫마다 이름 → 질문 → 요약이 한 번씩 돌고, 오너 소개 · 집 주소는 첫 펫에서만 묻고 다음 펫부터는 묻지 않음. 아직 남은 펫이 있는 요약에는 **"Save, add next"**(이어서 다음 펫, Back 오른쪽)과 **Save and finish later**(테두리 버튼)가 있음. 이어서를 누르면 저장하고 "What's your dog's name?"으로, **finish later**를 누르면 이 펫만 저장하고 오너 완료 처리 후 홈으로 감(남은 펫은 묻지 않음, 나중에 Pets에서 추가). 마지막 펫의 요약에는 **Save {name}**만 있음 | 🤖 `owner-onboarding` (강아지 2마리 · finish later · 강아지 + 고양이) | 사람 확인 대기 |

### 3.42 합의와 최종 견적에서 거절 · 가격 역제안 (DECL) · #230

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| DECL-1 | 오너 → 채팅 푸터 **I'd like to book** 옆 **Decline** → 사유 칩(선택) · 메모(선택) → **Decline and end the request** | "Not this sitter?" 시트, 확인하면 토스트 "Request ended", 예약은 Cancelled(사유 저장), 시터에게 알림, 날짜 홀드가 풀림. 푸터는 다시 **Request booking** | 🤖 `chat` | ➖ |
| DECL-2 | 시터 → 채팅 푸터 **I accept** 옆 **Decline** | "Decline this booking?" 시트, 확인하면 "Request declined", 예약은 Declined(사유는 오너가 읽는 메모로) | 🤖 `chat` | ➖ |
| DECL-3 | 오너 → **Final quote** 카드의 **Decline** 또는 푸터 **Confirm quote** 옆 **Decline** | "Decline the final quote?" 시트, 사유 칩 맨 앞에 "The price doesn't work". 확인하면 예약 Cancelled, Pay 버튼 없음. 시터 화면의 최종 견적 카드에는 Decline 없음 | 🤖 `chat` | ➖ |
| DECL-4 | 오너의 **Final quote** 카드 | **Confirm quote**와 **Decline**만. 금액이 바뀌어도 **Suggest another price**는 없음(#265: 수수료가 없어 시터가 가격을 바꿀 수 없으므로 역제안도 뺌) | 🤖 `chat` | ➖ |
| DECL-5 | **(#265로 없어짐: 수수료 제거)** 시터가 최종 견적에 수수료를 더해 **금액이 달라짐** → 오너 카드 **Suggest another price** → 금액(시터가 요구하는 금액이 미리 채워짐) · 메모(선택) → Send | 채팅에 오너의 일반 메시지 "Could you do $280.00 in total?"(+ 메모)만 감. 가격 · 예약 상태는 그대로(가격은 서버 계산). 시터 푸터 **Send a new final quote** → 새 최종 견적, 이전 것은 Replaced | 🤖 `chat` | ➖ |
| CHAT-38 | **(#265로 없어짐: 수수료 제거)** 채팅 수수료가 결제에 남는지 (014y): ① House sitting 부킹에서 시터 **Send final quote** ② 최종 견적이 열린 채(수수료 미응답) 오너가 예약 상세 → Checkout → Pay ③ 수수료 포함 결제 뒤 픽업 시간 변경을 둘이 합의 | ① 시트에 서비스 선택이 없고 부킹의 서비스(House sitting)로 가격이 나감 ② "Answer the sitter's new quote in the chat first." 결제 안 됨 ③ 새 총액 = 새 기본가 + 낸 수수료(수수료가 사라지지 않음) | 🤖 `chat`(①) · SQL `rls_smoke` 014q(②③) | 사람 확인 대기 · 호스팅 DB는 014q 적용 뒤 |
| CHAT-39 | 채팅에 "door code 4821, call 416-555-0199"를 보내거나 예약 요청 메모에 쓰고, 다음 칩 · 초안을 부름 (R20-7) | 모델에 가는 대화 · 요약에는 `#`만 남고 코드 · 전화번호 · 이메일이 없음. "Oct 10-12" 같은 날짜와 가격은 그대로. 저장된 `chat_threads.ai_summary`에도 숫자 없음 | pytest `test_ai_chat`(scrub · 보낸 메시지 · 요청 메모 · 요약) | ➖ |
| CHAT-40 | 채팅 AI가 Super로 도는지 (#249, #238): 시터와 오너가 칩 → 초안을 **10턴 이상** 눌러서 읽음 (`?view=split`) | 칩은 **짧은 라벨**(30자 미만, 숫자 없음)이고 상대 말에 이어지는 **새 주제**를 섞음. 초안은 facts에 없는 장소 · 음식 · 시간을 지어내지 않고, 같은 확인(픽업 시간 · 약 · 사진)을 계속 되풀이하지 않음. 한두 단어 조각 메시지가 나오지 않음 | 🤖 pytest `test_ai_chat` · `test_nebius` (20 · 50메시지 로컬 시뮬레이션 결과는 `model-ids.md`) | 사람 확인 대기 · 20메시지 뒤에도 대화가 앞으로 가는지(반복 루프)는 시뮬레이션으로 풀리지 않아 사람이 읽어야 함 |
| CHAT-41 | 채팅 AI가 **누구인지 · 가입 때 말한 것**을 아는지 (#249, #238): 오너 계정(Max와 Luna)과 시터 계정을 나란히(`?view=split`), 알러지 · 약이 있는 펫과 온보딩 답이 있는 펫으로 칩 → 초안을 10턴 이상 | 모델 입력에 `i_am`("I am Robert, a pet owner with Max (Maltese) and Luna (cat)"), 펫별 `profile`(성격 단계 · 안전 답 · 알러지), 오너 쪽 `checklist`(케어 태스크), 시터의 가입 답이 들어감. **알러지가 있으면 "없다"고 하지 않고**, 답이 없으면 "none"이 아니라 "not answered"로 읽음. 시터는 체크리스트를 부킹 전에는 못 봄 | 🤖 pytest `test_chat_profile` · `test_ai_chat` | 사람 확인 대기 · 실제 앱에서 알러지 펫의 초안이 알러지를 틀리게 말하지 않는지 읽어야 함 |
| CHAT-42 | 채팅 AI가 **모든 카드**를 읽는지 (#249): 부킹 중인 오너와 시터를 나란히, 견적 보내기 → Meet & Greet 제안 · 수락 → 동의 → 결제 순으로 카드가 생긴 뒤 칩 → 초안 | 모델이 읽는 대화에 Stay · 예약 요청 카드뿐 아니라 **견적**(`[Quote CAD 268.13 for boarding, sent, waiting for the owner]`), **Meet & Greet**(제안한 사람 · 시간 · 장소 · 화상 여부 · 건너뛰기 요청), **동의**(오너 · 시터 각각), **결제**(대기 · 완료)가 한 줄씩 들어감(`who`는 `app`). 다른 예약의 카드나 예약이 없을 때의 단계 카드는 빠짐. 그래서 "견적 보냈어요" · "결제됐어요"를 되풀이하지 않음 | 🤖 pytest `test_ai_chat` | 사람 확인 대기 · 카드가 생긴 직후 초안이 그 일을 아는 말을 하는지 읽어야 함 |
| CHAT-43 | 채팅 AI가 **예약이 어디까지 왔는지** 아는지 (#249): 오너와 시터를 나란히, 인사 → 예약 요청 → Meet & Greet → 동의 → 견적 · 결제 → 맡기기 순으로 가며 칩 → 초안 | 모델 입력의 `progress`가 DB의 `booking_stage` · `booking_next_actor`와 지금 가능한 버튼(CHAT-24)에서 계산됨: `step`(hello · decide · meet_greet · agree · pay · handoff · care · done · closed), `turn`(me · them · both · nobody), `now`(내가 지금 할 일), `waiting_for`, `done`(이미 끝난 것, 되풀이 금지), `later`. 첫 만남이 아닌 쌍은 Meet & Greet 단계가 없음. 읽을 수 없으면 `progress` 없이 예전처럼 동작. 시터는 **부킹이 있을 때만** 오너의 케어 체크리스트를 봄 | 🤖 pytest `test_chat_state` · `test_ai_chat` | 사람 확인 대기 · 단계가 바뀐 직후 칩이 그 단계 일로 바뀌고, 끝난 일을 되풀이하지 않는지 읽어야 함 |
| CHAT-44 | 채팅 AI가 **아직 안 한 얘기**를 꺼내고 **알러지를 틀리게 말하지 않는지** (#249, #238): 오너와 시터를 나란히, 알러지 · 약이 있는 펫(Max)과 없는 펫(Luna)으로 20턴 이상 | 모델 입력의 `topics`에 아직 안 나온 주제(`open`: 알러지 → 약 → 식사 → 산책 → 사진 업데이트 → 픽업 …, 최대 5개, 펫에 맞는 것만)와 끝난 주제(`covered`: 두 번 이상 나왔거나 양쪽이 말함)가 들어가고, 할 말이 끝났으면 마무리 칩("Thanks!"). **알러지가 있는 펫을 "알러지 없다"고 쓴 초안, 오너가 아직 답하지 않은 펫을 "없다"고 쓴 초안은 거절되고 다시 씀**(펫 이름이 든 문장은 그 펫으로, 없으면 모든 펫으로 판단). 오너가 "없음"이라고 답한 펫은 "알러지 없음"이라고 써도 됨 | 🤖 pytest `test_chat_state` · `test_ai_chat` | 사람 확인 대기 · 20턴 넘게 이어가도 같은 확인(픽업 · 약 · 사진)을 되풀이하지 않고 새 주제로 가는지 읽어야 함 |
| CHAT-45 | **긴 줄표(em dash)와 en dash가 AI가 쓴 글 어디에도 없는지**, 그리고 **인사는 첫 메시지에서만 하는지**: 오너와 시터를 나란히, 칩 → 초안을 10턴 이상 (그 밖에 문의 답장 · 일일 리포트 · 사진 캡션 · Life Record · 케어 플랜도 한 번씩) | 모델이 쓴 모든 글은 `nebius.strip_think`를 지나며 긴 줄표는 쉼표로, `24–27` 같은 범위는 하이픈 `24-27`로 바뀜. 프롬프트와 품종 데이터에도 없음(자동 시험 `test_no_dashes`). **내가 이미 한 번 썼으면** 초안은 `Hi` · `Hey` · `Hello`로 시작하지 않고 칩에도 인사 칩이 없음(첫 메시지만 인사, 규칙 검사가 걸러서 다시 씀). 이미 저장된 옛 글은 그대로 | 🤖 pytest `test_nebius` · `test_no_dashes` · `test_ai_chat` | 사람 확인 대기 · 화면에 줄표가 보이면 그 문장과 화면 이름을 알려주기 (AI가 아닌 화면 문구는 이 필터를 안 지남) |
| CHAT-46 | 시터가 **견적 카드**를 보내면 오너의 칩이 그 견적에 대한 것으로 바뀌는지 (#249): 오너와 시터를 나란히, 시터가 Send quote → 오너 화면 | 오너의 칩 맨 앞에 **"Looks good" · "Can we adjust it?"**가 나오고(코드가 앞에 둠, 나머지 한 자리는 모델), 칩을 누르면 초안이 견적 카드의 금액을 그대로 쓴 한 줄("The quote looks good, $180 total ...")이 됨. 칩이 마지막 **텍스트**가 아니라 마지막 **텍스트나 카드**(견적 · 예약 요청 · Meet & Greet · 동의 · 결제)를 기준으로 만들어지고, 내가 보낸 카드면 "follow_up"(답할 것 없음). 이미 확인된 견적에는 반응 칩이 없음 | 🤖 pytest `test_ai_chat` | 사람 확인 대기 · 견적 카드가 오면 몇 초 안에 칩이 바뀌는지, 그 뒤에 요청 · 결제 카드가 와도 칩이 따라 바뀌는지 봐야 함 |
| CHAT-47 | **Returned 이후** 채팅 AI의 세 갈래 (#249): 시터가 Returned를 누른 뒤(조기 반납 포함) 오너와 시터 화면에서 칩 → 초안을 이어서 | `progress.step`이 `done`이고 `progress.phase`가 **closing → after_closing → chat**으로 바뀜(돌아온 시각 뒤에 쓴 글만 봄). **closing**: 오너 "Thanks for everything!" · "I'll book again" · "How have you been?", 시터 "It was a pleasure!" · "Welcome back anytime!" · "How is Max doing?". 내가 맺음말을 보낸 뒤 **after_closing**: 안부 칩(오너 "How have you been?", 시터 "How is Max doing?" · "How have you been?") + 모델의 지난 케어 칩, 맺음말은 다시 안 나옴. 누구든 **안부를 한 뒤 chat**: 맺음말과 안부 칩이 다 빠지고 안부 이후 대화만 이어지는 칩(시터는 다음 여행을 묻고 "다시 맡아주세요"로 이어져 오너가 기억하게, 모자라면 안전한 두 칩). 안부 칩의 초안은 **묻는 한 문장**(답하거나 소식을 지어내지 않음) | 🤖 pytest `test_chat_state` · `test_ai_chat` | 사람 확인 대기 · Returned 직후부터 두 화면에서 맺음말 → 안부 → 그 뒤 대화로 칩이 바뀌는지, 같은 말이 되풀이되지 않는지 읽어야 함 |
| CHAT-48 | 채팅 **+ 메뉴** (#235): 시터 + → **Received** · **Returned** · Quote · Meet & Greet request · Date change · Start trip, 오너 + → **Quote request** · Meet & Greet request · Date change · Start trip · Photo request | **Received**(시터)는 결제 뒤 체크인 창(약속 2시간 전)이 열렸고 아직 안 받았을 때만, **Returned**(시터)는 받은 뒤 돌려주기 전에만 켜짐(카드의 버튼과 같은 동작: Returned는 반납 시트가 열림). **Quote request**(오너)는 견적이 아직 없을 때 입력창에 "Could you send me a quote for these dates?"를 채우고 보내는 건 사람이 함. Start trip은 **움직이는 쪽에만**(시터 집이면 오너, 오너 집이면 시터, 그 밖엔 둘 다) 약속 2시간 전부터 켜짐. 메뉴 줄 간격이 전보다 좁음 | e2e `chat-trip` | 사람 확인 대기 · 두 계정으로 + 메뉴 항목이 단계마다 맞게 켜지고 꺼지는지, 줄 간격이 보기 좋은지 봐야 함 |

### 3.43 결제한 예약을 취소하면 전액 환불 (REFUND) · #266 · *사전: 호스팅 DB에 `015c` 적용 뒤*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| REFUND-1 | 오너: 예약 → 데모 결제 → 예약 상세 **Cancel booking** | 토스트 "Cancelled. Refunded in full", 칩이 **Paid** 대신 **Refunded**, 알림 "Refunded in full / $… CAD back for Max (demo)". 결제 기록(`paid_at`)은 남고 `refunded_at`이 생김. "Booked and paid" 카드는 사라짐 | 🤖 `rebook` · SQL `rls_smoke`(015c) | ➖ |
| REFUND-2 | 시터가 결제된 예약을 취소 | 오너도 환불되고 같은 알림, 오너 예약 상세는 **Refunded**. 시터에게는 환불 알림 없음 | 🤖 `rebook` · SQL `rls_smoke`(015c) | ➖ |
| REFUND-3 | 결제 전 예약을 취소 | 환불 없음(`refunded_at` 비어 있음), 환불 알림 없음 | SQL `rls_smoke`(015c) | ➖ |
| REFUND-4 | 맡긴 뒤(Received) 취소 시도 | 예전처럼 `booking_in_progress`로 막히고 환불도 없음 | SQL `rls_smoke`(015c) | ➖ |
| REFUND-5 | 오너 채팅의 결제 카드(취소된 예약) | "Cancelled" 아래 "Refunded in full · $…". 시터 카드에는 금액이 안 보임 | **👤** | ➖ |

### 3.44 하트를 누르면 즐겨찾기에 바로 (FAV) · #267

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| FAV-1 | 오너 → Bookings → Sitters nearby의 시터 → 시터 페이지에서 하트 → 뒤로 | 새로고침 없이 그 시터가 **Favorites** 아래로 올라감, Sitters nearby에서는 빠짐 | 🤖 `sitter-search` | ➖ |
| FAV-2 | Favorites의 시터 → 하트 해제 → 뒤로 | 바로 **Sitters nearby**로 내려감(반경 밖이면 목록에서 빠짐) | 🤖 `sitter-search` | ➖ |
| FAV-3 | 반경 밖에 있는 시터를 즐겨찾기 | 반경과 상관없이 Favorites에 보임(014i). 하트를 누른 뒤 검색을 다시 해서 반영됨 | 🤖 `sitter-search` | ➖ |

### 3.45 최종 견적은 하나의 가격 (NOFEE) · #265

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| NOFEE-1 | 시터 → 채팅 **Send quote** / **Send final quote** | 시트에 서버가 계산한 내역과 **Total**만. 수수료 칩(Medication 등), Fee · Amount 칸, Add fee, "Total with your fees" 없음 | 🤖 `chat` | ➖ |
| NOFEE-2 | 보낸 견적 카드 (시터 · 오너) | **Add a fee** 없음, 수수료마다 Accept / Decline 없음, 줄 그어진 Declined 줄 없음. 오너가 보는 Total = 시터가 보낸 금액 | 🤖 `chat` | ➖ |
| NOFEE-3 | 최종 견적 → 오너 Confirm → Pay → Checkout | 결제 금액 = 견적 Total(예: $268.13), Checkout에 수수료 줄 없음 | 🤖 `chat` · `checkout` | ➖ |
| NOFEE-4 | #265 전에 보낸 견적(DB에 수수료 줄이 남은 것) | 수락된 수수료는 일반 줄로 보이고 Total에 포함, 아직 답 안 한 수수료는 버튼 없이 "This older quote has a fee no one can answer now. A new quote replaces it."와 Confirm 비활성(시터가 + 메뉴로 새 견적을 보내면 됨). 거절된 수수료는 안 보임 | 🤖 `chat` | ➖ |

### 3.46 새 채팅 알려 주기 (CHATNEW) · #228 → #329에서 Chat 탭으로

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| CHATNEW-1 | 오너가 채팅을 보냄 → 시터 화면 | 새로고침 없이 하단 **Chat** 탭에 안 읽은 수 배지(빨간 원). Chat 탭을 열면 그 채팅 줄 왼쪽에 색 막대 · 옅은 배경(가장 최근의 새 채팅 하나만) | 🤖 `chat` | ➖ |
| CHATNEW-2 | 두 오너가 각각 씀 | 배지는 합계(예: 3), 더 최근에 쓴 오너의 채팅이 강조됨 | 🤖 `chat` | ➖ |
| CHATNEW-3 | 다 읽음 | 배지와 강조가 사라짐 | 🤖 `chat` | ➖ |
| CHATNEW-4 | 시터 → Bookings | Chats 칩이 없음. 숫자가 붙은 칩으로 바로 열림 | 🤖 `chat` · `sitter-bookings` | ➖ |

### 3.47 채팅 첫 카드는 한 줄 요약 (STAYLINE) · #227

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| STAYLINE-1 | 오너: 개 한 마리와 고양이 한 마리로 시터 프로필 → **Start chat** | 첫 카드가 한 줄: "Oct 21 9:00 AM to Oct 24 5:00 PM · 2 pets: 🐶 Max, 🐱 Mochi". "Stay" 제목, Drop-off · Pick-up 문구 없음. 펫이 하나면 "· 🐶 Max"(개수 없음). 402 px에서는 줄바꿈될 수 있음 | 🤖 `chat` | ➖ |
| STAYLINE-2 | 시터가 같은 채팅을 엶 (아직 예약 없음) | 같은 한 줄이지만 펫은 **이름만**(시터는 예약 전에는 펫 정보를 못 읽음, 틀린 이모지는 넣지 않음). 예약이 생기면 이모지도 보임 | 🤖 `chat` | ➖ |

### 3.48 다마고치 (TAMA) · 11.12 · #184 · *파생 상태 · 스프라이트 · 몸통과 움직임 · 모자 · 먹기 · 응가 · 낮잠과 Awake · 오너 Home 펫 방 · 시터 탭 액션 · 메달까지, 나머지 화면 시나리오는 단계가 끝날 때마다 아래에 추가*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| TAMA-1 | 오늘의 체크인으로 펫 상태 계산 (`lib/petStatus.ts`) | 오늘 기록이 없으면 calm이고 밥 · 응가는 unknown. 6시간 안의 좋은 밥(all · most)은 fed, 적게 · 안 먹음이거나 6시간 넘게 밥이 없으면 hungry(기분보다 우선). 2시간 안의 낮잠은 sleepy(가장 우선). mood 체크인 happy · calm · tired는 excited · calm · tired. 1시간 안의 산책은 mood가 없을 때 excited. 응가는 기록되면 done, 없고 18시(앱 시간대) 이후면 due. 목록 순서와 상관없이 같은 결과 | 🤖 `pet-status` | ➖ |
| TAMA-2 | 임시 스프라이트: dev 빌드(`EXPO_PUBLIC_DEV_ROUTES=1`)에서 `/dev/sprites` | 머리 모양(개 floppy · pointy · fluffy · flat, 고양이 short · long, 괄호 안은 그 모양의 견종 예) × 기분 5종이 한 줄씩, 그 아래 털색 8종. 견종 글자로 모양이 정해짐(말티즈 → fluffy, 허스키 → pointy, 퍼그 → flat, 메인쿤 → long, 모르는 견종 → floppy · short). 기분마다 눈 · 입이 다르고(sleepy는 오른쪽 아래에 Z), 털색은 색만 바뀌고 모양은 같음. 검정 털에서도 눈이 보임. 모르는 털색 · 비어 있는 털색은 개 golden · 고양이 orange. Muk의 PNG는 `pngs.ts`에 한 줄 추가하면 같은 key(`species_shape_coat_mood`)의 코드 스프라이트를 대신함 | 🤖 `pet-sprite` (격자 · 기분 · 폴백) | 사람이 갤러리를 한 번 봄 (모양이 개 · 고양이로 읽히는지) |
| TAMA-3 | 오너 Home 상단 점 두 개(Today · Pet)를 누르거나, 마우스로 좌우 드래그, 가로 휠, 휴대폰은 스와이프 | 페이지가 한 장씩 넘어가고 점이 따라감. 펫 페이지는 **처음 열 때** 만들어짐(Home만 보면 체크인을 불러오지 않음). 알림 카드를 옆으로 밀어 지우는 동작은 그대로(페이저가 가로채지 않음). 세로 스크롤도 그대로 | 🤖 `pet-room` · `live-updates` | 사람이 휴대폰 터치로 한 번, 모바일 Safari 포함 |
| TAMA-4 | Pet 페이지: 펫 이름 칩(여러 마리일 때), 히어로 전체가 다마고치 화면(이름 · 기분 · 큰 스프라이트 · HUD가 한 화면 안). 스크롤 없이 펫 방이 페이지의 남은 높이를 다 채우고 펫이 그 안에서 가장 크게(화면 높이에 맞춰 픽셀 크기가 정해짐). 머리 모양은 견종(말티즈 → 복슬), 크기는 몸무게(개 10 kg 미만 작게 · 25 kg 넘으면 크게), 펫을 바꿔도 화면 높이는 같음 | 오늘 기록이 없으면 Calm에 HUD 없음. 좋은 밥 + 기분 happy면 "Happy · 🍽️ Fed", 30분 산책이면 "🦮 30 min"(고양이는 산책 칩 없음). 밥을 안 먹었거나 6시간 넘게 없으면 "Hungry"(경고색). 털색은 가입 때 고른 색(`pets.profile.coat`), 없으면 개 golden · 고양이 orange. 남은 할 일이 있으면 "Next: 제목 · 시각". 펫을 누르면 Diary 탭으로 | 🤖 `pet-room` | 사람이 데모 계정(Max · Mochi)으로 한 번 |
| TAMA-5 | 시터가 체크인을 보낸 뒤 오너 Pet 페이지 | 알림이 오면 새로고침 없이 스프라이트와 HUD가 바뀜(알림을 받을 때 다시 읽음). 1분마다 시계가 움직여 시간이 지나면 hungry로 바뀜 | 🤖 일부(로직 `pet-status`) | 두 브라우저로 사람이 확인 (시터 탭 액션이 들어간 뒤 함께) |
| TAMA-6 | 시터 Home(Today): 맨 위에 케어 중인 펫의 큰 픽셀 펫(오너와 같은 다마고치 화면, 첫 화면 높이의 약 60%, 그 아래 통계 · 할 일. 여럿이면 이름 칩으로 하나씩)과 **Feed · Walk · Poop · Nap** 네 버튼(고양이는 Walk 없음), 펫을 누르면 전체 체크인 화면 | 버튼 하나가 체크인 하나: Feed = 밥 all, Walk = 20분, Poop = 응가 normal, Nap = 낮잠. 누르면 토스트 "Sent ✅ {오너} was told", 펫이 바로 반응(Fed · 🦮 20 min · Done 칩, 낮잠이면 Sleepy). 오너는 "Max is taking a nap 💤" 같은 알림을 받음. 실패하면 "Not sent"와 Try again. 보내는 동안 버튼은 잠깐 비활성 | 🤖 `pet-room-sitter` · SQL smoke `11.12` | 사람이 두 브라우저로(시터 탭 → 오너 Pet 페이지가 새로고침 없이 바뀜, TAMA-5), 호스팅 DB에 `015` 적용 뒤 |
| TAMA-7 | 낮잠 체크인 (`015`) | `care_checkins.kind = nap`은 값이 없어야 함(값을 주면 거부). 오너 History · Diary에는 💤 Nap으로 보임. 돌봄 시간 밖에서는 기존처럼 거부 | 🤖 SQL smoke `11.12` · `pet-room-sitter` | 호스팅 DB에 `015` 적용 뒤 한 번 | · `wake`도 같은 규칙(`015d`): 값 없음, 오너 알림 "Max woke up ☀️", Diary에는 ☀️ Awake
| TAMA-8 | 시터: 끝난 예약(Returned 뒤 "Stay complete 🐾") 상세에서 펫마다 **🏅 Give {펫} a medal** | 누르면 토스트 "🏅 Max got a medal. Robert can see it", 그 펫은 "🏅 Max has a medal"로 바뀌고 버튼이 사라짐(다시 열어도 유지). 다른 펫은 그대로 버튼. 한 스테이 · 한 펫에 메달 하나(두 번 불러도 하나). Returned 전에는 버튼 자체가 없음(DB도 `stay_not_finished`로 거부). 다른 시터 · 오너는 줄 수 없음 | 🤖 `pet-medal` · SQL smoke `015b` | 호스팅 DB에 `015b` 적용 뒤 한 번 |
| TAMA-9 | 오너: Home → Pet 페이지, 펫 방 아래 | 받은 메달이 새것부터 한 줄씩("🏅 시터 이름 · Oct 6 to Oct 9", 하루짜리 스테이는 날짜 하나). 메달이 없으면 아무것도 안 보임. 펫을 바꾸면 그 펫의 메달만. 오너는 읽기만 가능(수정 · 삭제 없음). 메달로 할 수 있는 일은 아직 없음(범위 밖) | 🤖 `pet-medal` · SQL smoke `015b` | 호스팅 DB에 `015b` 적용 뒤 한 번 |
| TAMA-10 | 사진 색 (PS.3): dev 빌드(`EXPO_PUBLIC_DEV_ROUTES=1`)의 `/dev/sprites` 맨 위 **Colors from a photo** → Pick a photo → 샘플이나 내 사진 | 몇 초 뒤 사진 옆에 말티즈 프리셋이 그 사진의 색으로(주된 털색 · 더 어두운 그늘 · 더 밝은 주둥이). 배경색은 안 들어감. 털이 어두우면 눈이 밝게. 펫을 못 찾으면 "We couldn't find a pet there" | 🤖 `pet-sprite`(테스트 훅) | 실제 사진 여러 장(밝은 털 · 어두운 털 · 얼룩)으로 사람이 한 번 |
| TAMA-11 | 오너: Home → Pet 페이지 → 펫 방 아래 **🎨 Match colors from photo** → Pick a photo → 샘플이나 내 사진 → **Save** | 미리보기는 그 펫의 프리셋(견종 모양)에 사진 색. Save 뒤 토스트 "Max's colors saved", 펫 방이 그 색으로(새로고침해도 유지). 다시 열면 **Use the coat color** → "Back to the coat color", 온보딩 털색으로. 가입 때 답은 그대로, 예전 사진 머리(`pixel_head`)는 지워짐. 그 펫을 돌보는 시터 Home에도 같은 색, 기분 얼굴(Nap이면 Sleepy와 Z)은 그대로 | 🤖 `pet-room` · `pet-room-sitter` | 데모 오너로 실제 사진 한 번(호스팅 DB, 마이그레이션 없음) |
| TAMA-12 | 시터: 메뉴 → Profile 맨 위 **Badges** | 🐾 First stay(첫 픽업을 마친 날짜) · ⭐ First 5-star review(첫 별 5개 리뷰 날짜). 아직이면 회색 "Not yet". 그 뒤에 그림자 4칸 "Soon". 진행 중인 스테이 · 별 4개 이하는 세지 않음. 오너 Profile에는 없음 | 🤖 `sitter-badges` | 데모 시터로 한 번(스테이를 마치고 리뷰 5개 받은 뒤 배지가 켜지는지) |
| TAMA-13 | 데모 펫의 털색: Profile → Demo tools 리셋 뒤 데모 오너 Home → Pet 페이지 | 모든 데모 펫에 털색이 있음(Max · Teddy white, Mochi · Olive gray, Biscuit mixed, Luna cream, Cooper orange, Leo brown). 가입 답이 이미 있는 펫은 답을 그대로 두고 털색만 채움. 오너가 고른 털색이나 사진 색(`pixel_colors`)은 덮어쓰지 않음 | 🤖 `test_reset_demo` | 머지 · 백엔드 배포 뒤 데모 리셋 한 번(Max가 흰색으로) |
| TAMA-14 | 몸통: dev 빌드의 `/dev/sprites`에서 모양을 골라(chips) 포즈 줄을 봄 | 개 4모양 · 고양이 2모양마다 **앞 · 옆 · 뒤**, 앞 2프레임, **걷기 4프레임**, 왼쪽(오른쪽 그림의 좌우 반전), **엎드려 자기 2프레임**(항상 자는 얼굴과 Z). 털색은 모든 포즈에서 같은 자리만 칠함. 발이 바닥에 닿고 그림 밖으로 나가지 않음. **Bigger** 버튼으로 2배 | 🤖 `pet-scene` | 사람이 갤러리를 한 번 봄 (개 · 고양이로 읽히는지, 걷는 모양이 어색하지 않은지) |
| TAMA-15 | 오너 Home → Pet 페이지, 시터 Home의 펫 방을 몇 초 지켜봄 | 펫이 방 안을 **걸어 다니고**(좌우로 걷기), 멈추고, 정면 · 뒷모습을 보이고, 벽에서는 정면을 본 뒤 **돌아서 반대로** 걷고, 가끔 **엎드려 쉼**. 졸린(sleepy) 펫은 바로 엎드려 자고 계속 잠, 기분이 좋거나 배고프면 일어나 계속 걷고, 피곤하면 엎드리는 시간이 길고, 차분하면 골고루. 방 밖으로 나가지 않음. 펫을 눌러도 이동 중 버튼이 가로막히지 않음 | 🤖 `pet-behavior`(규칙) · `pet-room` · `pet-room-sitter`(방에 보임) | 사람이 눈으로 한 번(움직임이 자연스러운지, 너무 빠르거나 느리지 않은지) |
| TAMA-16 | 오너: Home → Pet 페이지, 펫 방 아래 **🎃 Pumpkin hat** (할로윈 오픈 이벤트: 모든 오너에게 있음) | 누르면 펫이 호박 모자(귀엽게 눈 위까지 덮는 오렌지 모자, 위에 검은 박쥐 날개 두 개, 앞에는 화난 눈과 지그재그 입을 새긴 잭오랜턴 얼굴)를 쓰고(정면 · 옆 · 뒤 모두 머리 위에 얹힘, 걸어 다녀도 따라다님) 버튼이 눌린 모양, 한 번 더 누르면 벗음. 새로고침해도 유지. 펫마다 따로. 프로필의 다른 값(털색 · 사진 색)은 그대로. 모르는 모자 값은 무시. 시터 Home의 같은 펫도 모자를 씀. 이벤트가 끝나면 `items.ts`의 source를 `first_pet`(첫 펫 등록 시 지급)으로 바꿈 | 🤖 `pet-wardrobe` · `pet-scene` | 사람이 데모 계정으로 한 번 (모자 모양, 시터 Home에서 보이는지) |
| TAMA-17 | 시터 Home에서 **Feed**, **Poop**을 누름 (오너 쪽은 알림이 오면) | **Feed**: 펫이 옆을 보고 서서 **빨간 밥그릇에 얼굴을 박고** 먹음(약 3~4초, 사료가 줄어들고) 끝나면 그릇이 사라지고 다시 돌아다님. **Poop**: 펫이 **쪼그려 앉는 자세**를 하고 뒤쪽 바닥에 **응가가 생김**, 펫이 가고 나서도 약 6초 뒤 깜빡이며 **치워짐**. 졸린(자는) 펫은 깨우지 않고 그대로 잠. 밥을 안 먹었거나(none) 응가를 못 했다는(none) 기록에는 안 나옴. 오너 화면은 알림 뒤 20초 안에 불러온 기록이면 같은 모습을 봄 | 🤖 `pet-behavior` · `pet-scene` · `pet-room-sitter` | 사람이 두 브라우저로 한 번 (밥그릇 · 응가 모양, 타이밍) |
| TAMA-18 | 시터: **Nap** 누르기 → **Awake** 누르기 (`015d`) | Nap을 누르면 펫이 바로 엎드려 자고(Sleepy, Z) 버튼이 **☀️ Awake**로 바뀌어 **Awake를 누를 때까지 계속 잠**. Awake를 누르면 일어나 정면을 보고 다시 돌아다님, 버튼은 Nap으로 돌아옴. Awake 없이 4시간이 지난 낮잠은 저절로 끝남. 오너는 "Max is taking a nap 💤"과 "Max woke up ☀️" 알림을 받음 | 🤖 `pet-status` · `pet-room-sitter` · `pet-behavior` · SQL smoke `11.12b` | 호스팅 DB에 `015d` 적용 뒤 한 번 |

### 3.43 헤더 일관성과 계정 사진 (HDR) · #287

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| :--- | :--- | :--- | :--- | :--- |
| HDR-1 | 로그인 후 헤더 우측 확인 (Common-001) | 벨과 햄버거 메뉴 사이에 소형 계정 아바타 표시. 사진이 없으면 이니셜(Chloe는 "C"), 아바타를 누르면 `/profile`로 이동 | 🤖 `auth` | ➖ |
| HDR-2 | 프로필 사진이 있는 계정으로 로그인 (Sitter-007) | 헤더 아바타 및 햄버거 메뉴 상단 프로필 영역에 이니셜 대신 실제 사진 노출 | 🤖 `auth` | ➖ |
| HDR-3 | 로그인 · 회원가입 · 투어 화면 헤더 비교 (Common-006) | 로그인, 회원가입(`/signup`), 온보딩 투어(`/welcome/owner`, `/welcome/sitter`) 상단에 `BrandLogo` 일관되게 표시 | 🤖 `auth` · `welcome` | ➖ |
| HDR-4 | 시터 피드 탭(`/sitter/feed`) 진입 (Muk) | 탭 루트 화면에 뒤로가기 화살표가 없음 | 🤖 `auth` | ➖ |
| HDR-5 | 오너 온보딩 질문 스킵 (About 및 각 질문 화면) | About 화면 하단 "Skip questions" 및 우측 상단 "Skip all" 버튼으로 남은 모든 질문을 건너뛰고 요약(Summary)으로 바로 이동. 이후 질문 화면에서도 우측 상단 "Skip all" 제공 | 🤖 `owner-onboarding` | ➖ |

### 3.49 채팅 인계 순서: 트립 → 도착 → Received, 인사는 빠른 답장 (ARRIVE) · #250

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| ARRIVE-1 | 결제한 예약, 드롭오프 2시간 안, 아무도 출발 안 함 → 시터 채팅 | **Received 없음**(예전엔 2시간 전부터 나왔음). + 메뉴의 Received도 꺼져 있고 "After the arrival". 오너가 출발해 "on the way"인 동안에도 없음. 취소된 트립도 도착으로 안 셈 | 🤖 `chat-trip` | ➖ |
| ARRIVE-2 | 오너가 위치 공유로 출발 → 거리로 도착 | 시터 카드 하나에 "Robert has arrived 🚗 · 시각", **Track Robert**, **Received** | 🤖 `chat-trip` | 실제 위치 👤 |
| ARRIVE-3 | 오너가 위치 공유 **없이** 출발 → 오너 카드 **I've arrived** | 트립이 끝나고 오너 카드는 "You've arrived ✓ · 시각"(Start trip이 카드에도 + 메뉴에도 다시 나오지 않음, 같은 인계로 두 번째 트립 없음), 시터 카드는 "Robert arrived ✓" + **Received** | 🤖 `chat-trip` | ➖ |
| ARRIVE-4 | 도착 뒤 인사 | 오너에게 작은 칩 **Please take care of them**. 시터의 **We will** 칩은 오너 인사가 채팅에 온 뒤에만. 픽업도 같은 순서(Thank you for everything → It was a pleasure). 칩은 버튼보다 작아 Track · Received가 주 행동 | 🤖 `chat-trip` | ➖ |
| ARRIVE-5 | 2시간 전, 여행자의 + 메뉴 | 꺼진 **Start trip** 옆에 "From 8:00 PM"(열리는 시각). 카드와 예약 화면에는 원래대로 "You can start the trip from …" | 🤖 `chat-trip` | ➖ |
| ARRIVE-6 | 트립 없이 맡김 | 채팅에는 Received가 없고, **예약 화면의 Received**(2시간 전부터, 서버 규칙 그대로)로 처리 | **👤** | ➖ |

### 3.50 Meet & Greet 요청 · 건너뛰기를 오너가 먼저, 양쪽이 답하기 (MGCHOICE) · #236 · *사전: 호스팅 DB에 `015f` 적용 뒤*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| MGCHOICE-1 | 처음 만나는 시터에게 채팅에서 **Request booking** → Send request | 요청 카드 바로 아래 Meet & Greet 카드에 **Request Meet & Greet** · **Skip Meet & Greet** 두 버튼이 나란히. 오너 푸터에는 "Waiting for …" 없음. 예약 화면의 카드도 같은 두 버튼. 날짜는 아직 홀드 안 됨 | 🤖 `chat` · `meet-greet` · SQL `rls_smoke` (015f) | 사람 확인 대기 |
| MGCHOICE-2 | **Request Meet & Greet** → 시간 시트 | 맡기기 날 다음 날짜는 달력에서 못 고르고 +도 꺼짐. 맡기기 시각 이후면 "Pick a time before the drop-off." 와 Send 꺼짐(서버도 `meet_greet_too_late`) | 🤖 `meet-greet` · SQL | ➖ |
| MGCHOICE-3 | 오너가 시간을 보낸 뒤 시터 | 카드에 **Accept**(채팅은 푸터) · Suggest another time · **Request skip** · 빨간 **Decline**. Accept나 Request skip을 누르면 그 자리에서 날짜 홀드(따로 Next 없음) | 🤖 `meet-greet` · SQL | ➖ |
| MGCHOICE-4 | 아무 쪽이나 **Decline** | "Decline this request?" 시트 → 빨간 **Decline request** → 요청이 끝남(취소, `meet_greet_declined`), 상대에게 "… declined the booking request" 알림. 예약 화면에는 "Chloe declined this request." / "You declined this request." 시트를 닫으면 아무 일도 없음 | 🤖 `meet-greet` · SQL | ➖ |
| MGCHOICE-5 | 한쪽이 건너뛰기를 요청한 뒤 다른 쪽 | **Accept skip**(채팅은 푸터) · **Request Meet & Greet**(새 시간) · 빨간 **Decline**. Accept skip이면 Meet & Greet 없이 Confirm 단계로, Request Meet & Greet이면 새 시간 제안으로 바뀜. 시터의 Accept skip도 첫 동의 | 🤖 `chat` · `meet-greet` · SQL | ➖ |
| MGCHOICE-6 | 오너가 아무것도 안 고른 요청 | 시터는 예전처럼 **Next**로 먼저 날짜를 홀드할 수 있음(BOOK-9) | 🤖 `meet-greet` | ➖ |
| MGCHOICE-7 | Checkout의 **Type your name to sign** | 처음엔 비어 있고 프로필 이름이 연한 힌트로만 보임, 자동완성 꺼짐. **프로필 이름과 같은 이름**을 쳐야 Pay가 켜짐(PAYWHY-3) | 🤖 `checkout` | ➖ |

### 3.51 단계 막대: M&G · Care, Scheduled · Trip · Skipped (STAGEBAR) · #237

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| STAGEBAR-1 | 채팅 위 · 예약 화면의 단계 막대 | 다섯 단계 **Request · M&G · Confirm · Pay · Care**(예전 Meet · Stay). 360 px 폭에서도 잘리지 않음. 스크린리더는 "Meet & Greet"로 읽음 | 🤖 `chat` · `meet-greet` | ➖ |
| STAGEBAR-2 | Meet & Greet 시간이 합의됨(Meet & Greet set) | M&G 아래 작은 글씨 **Scheduled**. 화상이든 직접이든 같음(Meet & Greet에는 트립이 없음) | 🤖 `meet-greet` | ➖ |
| STAGEBAR-3 | 둘 다 건너뛰기에 동의 | M&G 원에 ✓ 대신 **–**, 아래 **Skipped** | 🤖 `meet-greet` | ➖ |
| STAGEBAR-4 | 결제 뒤 맡기기 전 / 맡기기 트립이 가는 중 | Care 아래 **Scheduled**, 트립이 출발해 끝날 때까지(도착 포함) **Trip**, 맡기면 사라짐. 채팅과 예약 화면 모두 | 🤖 `chat-trip` | 실제 트립 👤 |

### 3.52 Profile 정리 (PFOLD) · #180 · *사전: 호스팅 DB에 `015g` · `015h` 적용 뒤(10/23 적용됨)*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| PFOLD-1 | (DB) `rls_smoke.sql`의 015g 블록 | 시터의 `home_address_2` · `home_postal_code`가 있으면 오너가 보는 주소가 "Unit 5, 100 Example St M5A 3C4"로 합쳐져 나옴. 거리 주소 끝에 이미 같은 우편번호가 있으면 반복하지 않고, 아무것도 없으면 null. 클라이언트는 `full_address`를 직접 못 부름 | SQL `rls_smoke` (015g) | CI 결과 대기 |
| PFOLD-2 | (DB) `rls_smoke.sql`의 015h 블록 | 오너의 `packing_list`는 `get_handoff_details`의 **drop_off 행에만** 실리고 pick_up 행은 null. 시터와 오너 둘 다 그 행에서 읽음. 시터 테이블의 옛 `packing_list`는 더 이상 쓰이지 않음 | SQL `rls_smoke` (3C.4 · 015h) | CI 결과 대기 |
| PFOLD-3 | Profile 열기(오너 · 시터) | 선택 입력 카드는 전부 **닫힘(▸)**이고 제목 아래에 값이 있으면 한 줄로 보임. 항상 보이는 것은 사진 · 이름(시터는 About you도). 헤더를 누르면 ▾로 열리고 다시 누르면 닫힘, 닫아도 쓴 내용은 Save에 그대로 들어감. Save에서 닫힌 카드 안의 에러(예: 주소 없음)가 나면 그 카드가 열림 | 🤖 `profile.spec.ts` | 사람 확인 대기 |
| PFOLD-4 | 카드 순서 | 시터: About you, Home address, About your home, Experience, Visitor parking, Lobby notes, House rules, 그 아래 Meeting spots · Services · AI replies · Your answers, 위에 접힌 Badges. 오너: Home address, Emergency contact, Vet, Packing list, Entry info(`›`, 다른 화면으로 감), Meeting spots. 시터에는 Packing list · Service area 칸이 없음 | 🤖 `profile.spec.ts` · `sitter-badges.spec.ts` | 사람 확인 대기 |
| PFOLD-5 | Home address 카드 | 주소(Check address) → 📍 버튼 → **Address details**(예: Unit 1204, buzz 55) → **Postal code**. Check address로 고른 주소 "100 Queen St W, Toronto, ON M5H 2N2"는 거리 주소 "100 Queen St W, Toronto, ON"과 우편번호 "M5H 2N2"로 나뉘어 들어감. 우편번호가 주소 안에 같이 저장돼 있던 옛 주소는 열 때 나뉘어 보이고 저장도 나뉘어서 됨. 예약 확정 뒤 시터 · 오너가 받는 주소는 세 칸이 합쳐진 한 줄 | 🤖 `profile.spec.ts` · `home-location.spec.ts` · SQL(015g) | 사람 확인 대기 |
| PFOLD-6 | 오너 Profile → **Packing list**(▸) | ☐ 항목을 **+ Add item**으로 늘리고(최대 20) ✕로 지우고 Save. 닫힌 카드는 "3 items"처럼 개수를 보여 줌 | 🤖 `profile.spec.ts` | 사람 확인 대기 |
| PFOLD-7 | 결제한 예약에서 시터 → 예약 화면 / 오너 → 예약 화면 | 시터에게 **"{펫}'s things"** 카드에 오너가 적은 리스트가 나오고 항목을 눌러 체크(이 기기에 저장, 새로고침해도 유지). 오너에게는 **"Pack for {펫}"** 카드에 본인 리스트(같은 방식으로 체크). 리스트가 비면 카드 없음 | 🤖 `checkout.spec.ts` | 두 기기 사이 동기화는 없음(체크는 기기별) · 사람 확인 대기 |
| PFOLD-8 | 시터 Profile → **Your answers** | 질문마다 번호 원 + 질문, 아래 **흰 박스에 내 답변**(민트 카드 안). 직접 추가한 질문과 가능한 날도 같은 모양 | 🤖 `sitter-onboarding.spec.ts` | 사람 확인 대기 |

### 3.53 탭: Chat 탭, Diary는 Feed 안 (NAV) · #329

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| NAV-1 | 오너 · 시터로 로그인 → 탭 바 | **Home · Bookings · Chat · Feed · Snap**, 402 px에서 이름이 잘리지 않음. Chat 아이콘은 발바닥이 있는 네모 말풍선 | 🤖 `auth` | 사람 확인 대기 |
| NAV-2 | 오너 → Bookings | 검색 · 즐겨찾기 · 예약만, **Chats 섹션 없음**. 채팅 목록은 Chat 탭에 | 🤖 `chat` | ➖ |
| NAV-3 | Chat 탭 | 채팅 목록(이름 · 마지막 메시지 · 시간 · 안 읽은 수), 밀어서 나가기. 채팅이 없으면 "No chats yet" | 🤖 `chat` | ➖ |
| NAV-4 | Feed 탭 | 맨 위 **Photos · Diary** 전환. Photos는 예전 Feed, Diary는 예전 Diary 탭(오너: 다이어리 책, 시터: Today · Diary book). 주소는 `?view=diary` | 🤖 `report` · `diary-book` | 사람 확인 대기 |
| NAV-5 | 옛 주소 `/owner/diary` · `/sitter/diary?page=…`, 펫 방 · 반납 시트의 Diary 링크, 리포트 알림 | Feed의 Diary가 열림(시터는 그 페이지로) | 🤖 `pet-room` · `diary-book` | ➖ |
| NAV-6 | 시터 Home의 **💬 Chats (n)** | Chat 탭으로 감 | **👤** | ➖ |

### 3.54 Feed 개편 (FEEDX) · #345 · *사전: 호스팅 DB에 `015j` 적용 뒤(적용은 요청할 때만). 화면 시나리오는 단계가 끝날 때마다 아래에 추가*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| FEEDX-1 | (DB) `rls_smoke.sql`의 015j 블록, 태그 · 메모 | 체크인 사진 글은 종류대로 태그가 붙고(potty, mood 포함) 메모가 `note`에 들어감. 없는 태그 · 200자가 넘는 메모는 거절 | SQL `rls_smoke` 015j(로컬 Postgres 17, 어시스턴트 실행) | 사람 확인 대기 |
| FEEDX-2 | (DB) 내 쪽에서만 지우기 | 오너가 시터의 공유 사진을 지워도 시터는 그대로 가짐, 시터가 지워도 오너는 그대로 가짐. 둘 다 지우면 `purge`. 같은 사진을 두 번 지우면 `not_found` | SQL `rls_smoke` 015j | 사람 확인 대기 |
| FEEDX-3 | (DB) 30분 규칙 | 보낸 지 30분 안에는 작성자가 둘 다에게서 삭제(`everyone`, 알림도 같이 삭제), 30분이 지나면 `too_late`(내 쪽에서만은 가능). 작성자가 아니면 `not_author` | SQL `rls_smoke` 015j | 사람 확인 대기 |
| FEEDX-4 | (DB) 숨기기 | 내 숨김 행은 나만 읽음. 숨긴 사진은 목록에 오되 표시가 붙고, 다시 보이게 하면 행이 사라짐. 남의 사진은 `not_found` | SQL `rls_smoke` 015j | 사람 확인 대기 |
| FEEDX-5 | (DB) 스티커 | 스티커를 저장하면 만든 사람의 비공개 글이 생김. 오너 스티커는 시터가, 시터 스티커는 오너가 못 봄 | SQL `rls_smoke` 015j | 사람 확인 대기 |
| FEEDX-6 | (DB) 돌봄이 끝난 뒤 | 시터는 자기가 올린 글을 계속 읽고, 비공개 글만 새로 올림(공유는 거절). 오너가 공유한 사진은 더 못 읽음. 돌본 적 없는 펫에는 비공개로도 못 올림 | SQL `rls_smoke` 015j | 사람 확인 대기 |
| FEEDX-7 | (백엔드) `DELETE /api/feed/{id}?scope=me`(기본) · `scope=everyone` | 내 쪽에서만이면 글은 그대로이고 `deleted: false`. 아무도 못 보게 되면 글 · 사진 파일 · media 행이 지워짐(다른 기록이 쓰는 사진은 파일이 남음, 스티커 칸 포함). 30분이 지났으면 409 "…only be deleted on your side", 작성자가 아니면 403, 없으면 404. 파일 삭제가 실패해도 지우기는 성공으로 처리 | pytest `test_feed_delete` | 사람 확인 대기 |
| FEEDX-8 | (백엔드) 돌봄이 끝난 시터의 사진 서명 | 돌본 적 있는 시터는 `feed` 사진만 서명됨(비공개로만 올라감), 그 밖의 용도는 여전히 403 | pytest `test_media_sign` | 사람 확인 대기 |
| FEEDX-9 | 오너 → Feed (사진 여러 장, 오늘 · 어제) | 날짜마다 헤더(**Today · Fri Oct 9** · 5 photos, **Yesterday · Thu Oct 8**). 가장 최근 사진이 **2×2칸**이고 옆에 작은 사진 둘이 세로로, 그 아래부터는 **가로 최대 3장**씩. 사진 사이 8 px(Figma 그대로), 세로로 계속 늘어나고 스크롤 | 🤖 `feed`(칸 크기 · 간격 · 헤더) · 모양은 사람 확인 대기 | 사람 확인 대기 |
| FEEDX-10 | 칩 줄 | **All · Meals · Walks · Naps · Mood · Potty · No tag**(No tag가 맨 뒤). 옆으로 밀면 넘어감(마우스는 휠). 칩을 누르면 그 태그의 사진만, No tag는 태그 없는 사진 · 놀이 · 기타 · 스티커. 태그가 비면 "No mood photos yet" 같은 한 줄 | 🤖 `feed` | 사람 확인 대기 |
| FEEDX-11 | 사진 칸 | 태그가 있으면 **태그 그림 + 시간**(예: 9:02), 태그가 없으면 시간만. 영상은 ▶. 스티커는 흰 바탕이 아닌 연한 노랑 바탕에 잘리지 않게 | 🤖 `feed`(접근 이름 "Meals at 12:00") · 그림은 사람 확인 대기 | 사람 확인 대기 |
| FEEDX-12 | 사진 누르기 | 전체화면에 **태그, 날짜(Oct 9, 2026), 시간(9:02 AM)**, 내가 남긴 메모가 있으면 메모. 작성자 이름, 나만 보는 글이면 "Only you". 위에 **Hide** · **Delete** | 🤖 `feed` | 사람 확인 대기 |
| FEEDX-13 | **Hide** → 맨 아래 **Hidden (1)** → 사진 → **Unhide** | 숨기면 그리드에서 사라지고 토스트 "Photo hidden". Hidden에서 흐리게 보이고 Unhide로 돌아옴. 상대 쪽은 그대로 | 🤖 `feed` | 사람 확인 대기 |
| FEEDX-14 | 시터가 사진을 보낸 직후 Delete(30분 안) / 30분 뒤 Delete | 30분 안: 고르기 둘(양쪽 / 내 쪽만). 30분 뒤: "It will be deleted on your side only." | 🤖 `feed` | 사람 확인 대기 |
| FEEDX-15 | 돌봄이 끝난 시터 → Feed 탭 | 펫이 목록에 **Past stay**로 남고 이름을 누르면 그 피드가 열림. **+ Photo**의 Share 칸은 눌러지지 않고 Only me만, 저장하면 "Saved just for you", 오너는 못 봄 | 🤖 `feed` · `media-picker` | 사람 확인 대기 |
| FEEDX-16 | Snap에서 스티커를 만듦(오너 / 시터) | 만든 사람의 Feed(No tag)에만 스티커가 올라옴. 상대는 못 봄. 다이어리 사진 고르기 · 표지 · 사진 수에는 안 끼임 | SQL `015j` · 화면은 사람 확인 대기 | 사람 확인 대기 |
| FEEDX-17 | Feed에서 Request photo | 버튼 없음(채팅에 있음) | 🤖 `feed` | 사람 확인 대기 |

### 3.55 Pay가 꺼진 이유 (PAYWHY) · #282

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| PAYWHY-1 | Checkout을 열고 아무것도 안 함 | Pay 위에 **Agree to 4 more items**(빠진 개수), Pay는 회색. 체크할 때마다 숫자가 줄고 마지막엔 **Agree to 1 more item** | 🤖 `checkout` | 사람 확인 대기 |
| PAYWHY-2 | 회색 Pay 누르기 | 결제는 안 되고, 화면이 **첫 번째로 안 체크한 동의**(다 체크했으면 이름 칸)로 스크롤 | 🤖 `checkout` | ➖ |
| PAYWHY-3 | 다 체크 → 이름 칸 | 비어 있으면 **Type your name to sign**, 다른 이름이면 **Type your name as on your profile**. 프로필 이름과 같으면(대소문자 · 앞뒤 · 여러 칸 띄어쓰기는 무시) 줄이 사라지고 Pay가 켜짐 | 🤖 `checkout` | ➖ |
| PAYWHY-4 | 다 맞춘 뒤 Pay | 예전처럼 결제 → 예약 화면 "Booked and paid" | 🤖 `checkout` | ➖ |

### 3.55 Meet & Greet가 바뀌면 채팅 맨 아래에 새 줄 (MGUPD) · #264 · *사전: 호스팅 DB에 `015k` 적용 뒤*

| ID | 해보기 | 기대 결과 | 자동 | 사람 |
| --- | --- | --- | --- | --- |
| MGUPD-1 | (DB) `rls_smoke.sql`의 015k 블록 | 요청 직후엔 줄 없음 · 제안과 수락이 차례로 맨 아래에(보낸 사람 = 한 사람) · 제안한 시간과 방식이 줄에 남음 · 채팅 목록의 마지막 메시지와 안 읽은 수가 따라옴 · 건너뛰기 요청과 거절도 줄로 | SQL `rls_smoke` | ➖ |
| MGUPD-2 | 오너가 M&G 시간 제안 → 시터가 수락(채팅을 주고받는 중에) | 두 화면 모두 맨 아래에 작은 줄: 오너 "You suggested a Meet & Greet · Video · 날짜", 시터 "Robert suggested …", 수락 뒤 "Chloe accepted the Meet & Greet" / "You accepted …". 위의 M&G 카드는 그대로(지금 상태) | 🤖 `chat` | 사람 확인 대기 |
| MGUPD-3 | 상대가 M&G를 바꾼 뒤 채팅 목록 | 미리보기 "Meet & Greet update", 안 읽은 수 +1, Chat 탭 배지 | 🤖 `chat` | ➖ |
| MGUPD-4 | 다른 변화: 시간 거절, 건너뛰기 요청 · 수락, Done, 요청 거절 | 각각 "can't make that time" · "asked to skip" · "agreed to skip" · "Meet & Greet done" · "declined the request" 줄 | SQL(건너뛰기 · 거절) | **👤** 나머지 |
| MGUPD-5 | 채팅 칩 | 상대의 업데이트 줄에 반응하는 칩(채팅 AI가 줄을 읽음) | pytest `test_ai_chat` | 실제 모델 👤 |

## 4. 알려진 제약 (버그로 올리기 전에 확인)

- **Feed 삭제 · 숨기기 (FEEDX, #345):** 시터가 오너에게 보낸 사진은 **보낸 지 30분 안**에만 둘 다에게서 지울 수 있다(서버 시계 기준, 앱은 같은 30분으로 버튼을 보여 준다). 그 뒤의 삭제는 내 쪽에서만이고 상대 Feed에는 남는다. 숨기기는 되돌릴 수 있고(Feed 맨 아래 Hidden), 삭제는 되돌릴 수 없다. 사진 파일은 아무도 못 보게 됐을 때만 지워진다. 돌봄이 끝난 시터는 자기가 올린 글만 계속 읽고(오너가 공유해 준 사진은 돌봄 기간까지만), 새로 올리는 사진은 나만 보기로만 된다. 호스팅 DB에 `015j`를 적용하기 전에는 새 Feed가 사진을 못 불러온다.

- **업데이트 줄은 Meet & Greet만 (MGUPD):** 동의(I'd like to book · I accept) · 결제 카드는 예전처럼 제자리에서 바뀌고 새 줄은 없다. 채팅 목록 미리보기는 어떤 변화든 "Meet & Greet update"로 같다(목록은 카드 종류만 안다).

- **서명 이름은 앱에서만 확인한다 (PAYWHY-3):** Pay 버튼은 프로필 이름과 같을 때만 켜지지만, 서버(`sign_booking_consent`)는 이름이 1-80자인지만 본다. 앱을 거치지 않은 호출은 다른 이름으로도 서명할 수 있다. 데모 결제라 서버 확인은 넣지 않았다. 또 회색 Pay는 탭을 받기 때문에(빠진 곳으로 스크롤) 스크린리더에는 "꺼짐"으로 읽히지 않고, 바로 위의 이유 줄이 대신 알려 준다.

- **오너가 먼저 고른 Meet & Greet에는 시간 제한이 없다 (MGCHOICE):** 2일 · 3일 알림과 자동 취소(011l)는 시터의 첫 동의부터 센다. 오너가 시간을 보내거나 건너뛰기를 요청하고 시터가 답하지 않으면 그 요청은 시터가 답하거나 둘 중 하나가 취소할 때까지 그대로 남는다.

- **하루 한도 (감사 2026-10-21):** AI 호출과 업로드 서명은 한 사람당 하루(UTC) 100번, 공유 데모 계정은 1000번. 숫자는 백엔드 메모리에만 있어서 Render가 다시 시작하면 0부터 센다. 테스트로 한도에 걸리면 다음 날까지 기다리거나 Render를 다시 시작한다.

- **데모 계정 비밀번호 · 이메일 (`014z`):** 시드(`scripts.seed_demo`)만 바꿀 수 있다. SQL Editor나 대시보드에서 바꿀 때는 먼저 `select set_demo_accounts_unlocked(true);`(5분).

- **검색이 서비스 · 인계 방식을 아직 걸러내지 않는다 (CHAT-10):** 예약 요청 시트에는 서비스 선택이 없다(시터가 하는 서비스, 둘 다면 Boarding). 오너 · 시터의 온보딩 선택(서비스, 누가 데려다주는지)으로 검색을 거르는 일은 온보딩 데이터가 생긴 뒤에 한다. 둘 다 맞는 경우는 요청을 받은 시터가 수락 · 변경 · 거절한다.
- **결제는 데모이고, 돈의 보관과 정산은 표시뿐이다 (CHAT-22):** "Held until the stay ends"는 문구이고 실제로 돈이 움직이지 않는다. 케어가 끝난 뒤 시터에게 지급되는 것은 #146(종료 · 리뷰)에서 다룬다. DB는 최종 견적 카드가 없어도 결제를 막지 않지만(기존 예약 화면 · 데모 시드), 보낸 최종 견적이 오너의 답을 기다리는 동안은 막는다(`quote_pending`, 014y). 채팅 화면은 최종 견적이 확인되어야 Pay를 보여 준다. 확정 뒤 시간이 바뀌어도 그 부킹의 최종 견적(결제 카드 뒤에 확인된 견적) 수수료는 가격에 남는다. 다만 채팅의 Pay 버튼은 견적 카드의 옛 기본가를 보여 주므로, Checkout의 새 총액과 다를 수 있다. 견적 카드를 보내는 것은 시터의 버튼이며 AI가 자동으로 보내지 않는다(행동 칩은 #142 후반부).
- **채팅 AI는 제안만 한다 (CHAT-11 ~ 13, D62):** 자동 전송은 없다. 칩은 말 칩과 행동 칩(CHAT-24)이 있고, 행동 칩도 누르기 전에는 아무 일도 일어나지 않는다. 제안 채택률 로그(눌렀는지 닫았는지)는 아직 남기지 않는다(칩 · 초안이 만들어진 결과는 `chat_ai` 로그에 남는다, CHAT-26). 시터의 첫 답에는 금액이 없다: 가격은 **Send quote**로 보낸다(CHAT-25). Meet & Greet 카드가 채팅에 없는 부킹(옛 부킹)은 그 카드를 여는 행동 칩이 아무것도 못 연다. 옛 문의 화면과 그 AI 초안은 아직 남아 있다(채팅으로 합치는 정리는 다음 PR).
- **채팅은 아직 알림을 보내지 않는다 (CHAT):** 새 메시지는 목록의 안 읽은 수와 열려 있는 채팅 갱신으로만 알 수 있다(알림 종은 울리지 않음). 기존 문의 화면과 시터의 AI 초안 흐름은 그대로이고, 새 문의의 메시지는 채팅으로 복사되지 않는다(#142에서 합침). 기존 문의는 `014j` 적용 때 한 번만 스레드로 옮겨진다.
- **DB에서 만드는 문구에는 아직 대시가 남아 있다 (COPY, #173):** 알림 제목 · 본문(`005` · `006` · `009d` · `010` · `011l` · `012`), 할 일 완료 캡션(`008`), `fmt_date_range`(`003`). 앱 코드만 고쳤고, SQL은 새 마이그레이션이 필요해서 따로 다룬다.

- **시터 검색 거리는 직선거리이고 정수 km로 반올림해 보여 준다 (SEARCH):** 반경은 정확히 적용된다(5 km면 5 km 안). 시터 좌표는 절대 내려가지 않지만, 오너가 좌표를 바꿔 가며 여러 번 검색하면 시터 집을 대략 1 km 안으로 좁힐 수 있다 — 해커톤 데모(익명 시드)에서는 그대로 두고, TODO Later에 거리 구간화 · 호출 제한을 적어 둠.

- **사진 요청 버튼은 앱의 "돌봄 중" 기준(맡긴 시각 ~ 데려가는 시각, `isCaring`)으로만 보인다 (11.1):** 서버(`request_photo`)는 맡기기 30분 전부터 받지만, 그 30분 동안 Feed에는 버튼이 아직 없다.
- **Snap 리뷰에서 나온 알려진 문제 (2026-10-15, [review-2026-10-15.ko.md](review-2026-10-15.ko.md)) — 이미 기록됨, 따로 이슈로 올리지 않아도 됨 (P0 SR-1 – SR-4는 고침, 아래는 Later):** 스티커를 불러오기 전에(또는 실패 뒤) ✨ Decorate → Save 하면 저장된 스티커가 지워질 수 있음(SR-5) · Mood 영상에서 펫 박스가 프레임마다 다르게 잡히면 펫끼리 섞일 수 있음(SR-6) · 새 견주가 Snap 도구에서 Add pet 뒤 돌아오면 "Add a pet first"가 그대로(SR-8) · 시터 Diary는 견주가 새로 붙인 스티커를 새로고침 전까지 안 보여 줌(SR-16).

- **입구 정보는 경고일 뿐 결제를 막지 않는다 (ENTRY-1):** 하우스 시팅 · 견주 집 인수인계 체크아웃에서 입구 정보 form이 비어 있으면 카드로 알리고 링크를 주지만, 견주가 무시하고 Pay 할 수 있다(가족이 직접 열어 주는 경우 등). 그 경우 시터는 Show code 대신 "{견주} hasn't added entry info yet — message them."를 본다. 데모 시드에 입구 정보를 넣는 것은 Phase 10 시드 계획에 있다(지금 시드에는 없음).
- **Treat check 샘플 라벨은 만든 그림이다** (`frontend/assets/demo/labels/` = `backend/tests/fixtures/labels/`, 상표 없는 가짜 제품명 · 실제 성분표 형식). 실제 촬영 라벨은 사람이 바꿔 넣을 수 있다(같은 파일 이름). 진행 표시 "Checking for {이름}…"는 서버 단계가 아니라 **시간**(8초)으로 바뀐다. Snap 탭의 "Recent checks"는 **최근 3개**만 보인다(펫이 여럿이면 이름이 붙고, 전체 10개는 Treat check 화면 안에서).
- **Mood 퍼센트는 재미용 규칙 계산이다** — 비전 모델은 귀 · 눈 · 입 · 꼬리 · 자세 · 긴장 · 행동 태그만 고르고, `backend/app/ai/mood_rules.py` 표가 %를 만든다. 그래서 같은 사진 → 같은 %, 하지만 태그를 잘못 읽으면 %도 같이 틀린다. 장난감은 입 모양 선택지로는 잘 못 잡아서 **`toy` 태그를 따로 묻고**(우리 사진 10장 중 터그 사진만 `in_mouth`, 2026-10-14), 입에 장난감이 있으면 "놀이"로 계산해 **excited**가 1등이 된다. 감정 전용으로 검증된 모델이 아니다(D61, "For fun only").
- **Mood는 웹에서만**, 펫 찾기(MediaPipe `tasks-vision@1.0.1`)는 실행할 때 jsdelivr · Google 저장소에서 받아 온다(WASM 11 MB + 모델 4.5 MB, 첫 사용에 몇 초). 네트워크가 막히면 "Couldn't get the pet finder ready…". 영상 프레임은 브라우저가 그 코덱을 열 수 있어야 한다(데스크톱 Chrome · Safari의 mp4 OK). 결과는 저장하지 않는다.
- **Sticker 오리기는 한 번에 약 5초**(Magic Touch, CPU — GPU는 빈 마스크라 안 씀). classic Web Worker에서 돌아 화면은 멈추지 않는다(워커가 안 되는 브라우저는 메인 스레드로 — 그동안 화면이 잠깐 멈춤). 모델 파일 30 MB는 Google 저장소에서 받고 캐시가 1시간이다. 목줄 · 하네스는 펫과 같이 잘릴 수 있고, 사진 가장자리에 걸친 펫은 그 가장자리에서 잘린다. 스티커를 지워도 이미 꾸민 다이어리에는 남는다(꾸미기 항목이 이미지 `public_id`를 같이 가짐, Cloudinary 파일은 지우지 않음).
- **다이어리 꾸미기는 알림장 글이 있는 "종이" 기준 좌표(0–1)** — 견주와 시터가 같은 종이(같은 글 · 같은 크기)를 보므로 같은 자리지만, 화면 폭이 크게 다르면(폰 프레임 밖 넓은 창) 글 줄바꿈이 달라 글과 스티커의 상대 위치가 조금 달라질 수 있다. 한 사람 층에 스티커 20개까지. 꾸미기는 웹에서만(앱 빌드는 스티커를 그리지 않음).
- **Save image(11.8)는 브라우저가 지금 그린 종이를 캔버스에 다시 그린다** — 글은 화면의 줄바꿈 · 글꼴 그대로, 스티커는 저장된 자리 · 크기 · 각도로. 사진 · 스티커는 CORS로 다시 불러오므로(Cloudinary는 허용) 못 불러온 것은 빠지고 토스트가 몇 개 빠졌는지 알려 준다. 꾸미는 중(저장 전) 상태는 저장되지 않는다 — 먼저 **Save stickers**. 웹에서만, 파일은 화면 종이의 2배 크기 PNG.
- **다이어리 공개 링크(DB.5)는 정말 공개다** — Cloudinary 이미지 주소라 링크를 가진 누구나 열 수 있고, 앱에서 지울 수 없다(링크 삭제는 해커톤 후). 그래서 시트가 올리기 전에 알려 준다. 폰 공유 시트(Share image)는 브라우저가 파일 공유를 지원할 때만 보인다(데스크톱 Chrome · Firefox는 보통 안 보임 → Download / 링크).
- **그림일기 손글씨 글꼴(Gaegu)은 Google Fonts에서 받는다**(웹만) — 막히면 시스템 글꼴로 보이고, 글꼴이 늦게 오면 처음 잠깐 다른 글꼴. **Goldito 기본 스티커 9장은 코드로 그린 임시본**이다(`frontend/assets/stickers/`, 같은 이름으로 디자인 파일 교체). 그림 칸 사진은 그날 첫 공유 사진이라 견주가 못 보는 비공개 사진이 있으면 두 화면의 그림이 다를 수 있다(칸 크기는 같아 스티커 자리는 같음).

- **오너 Diary 탭은 시터가 보낸 알림장만 보여 준다** — 실시간 소식(Live)은 Home, 전체 기록은 History. Diary 안의 Live 섹션은 아직 없다 (TODO의 IA follow-up).
- **문의 AI**: Render가 잠들어 있으면 첫 답장이 30~50초 더 걸린다. 자동 발송 지연(약 30초)은 임시 공식이다(슬기 확정 전). 오너는 Bookings 탭의 "Your questions"에서 지난 문의로 다시 들어갈 수 있다.
- **불가인 답은 자동 발송되지 않는다 (RV-2):** 날짜가 안 되면(또는 확인 못 하면) 자동 발송 시터여도 초안이 시터 확인을 기다린다 — 모델이 "확인 필요 없음"이라고 해도 서버가 막는다. 도구를 쓰는 에이전트 모드는 달력(`check_availability`)을 안 본 답을 받아들이지 않고 한 번 호출 경로로 다시 쓴다.
- **문의 AI의 가능 여부 = 예약 엔진의 규칙 (RV-1):** 펫 수만큼 자리가 없는 슬롯이나 시터가 안 연 날이 하나라도 있으면 "못 해요"다. 시터가 Regenerate · Accept / Decline · Suggest로 다시 확인할 때도 **문의한 오너 기준**으로 본다(`012d`, CR-3) (`012d`, 호스팅 DB 적용 10/13). 호스팅 DB에 **`011c`가 적용되기 전에는** 이 검사를 못 해서 모든 답장이 "확인해서 알려 드릴게요"(가격 없음, 자동 발송 안 됨)로 나온다.
- **후속 질문의 AI 답 (FB-34, 알려진 한계):** 모델은 최신 오너 메시지 + 앞선 대화(최대 6개)를 읽지만, **날짜 · 견적 · 가능 여부는 문의에 저장된 원래 일정** 기준이다. 그래서 "Could you open for me?" 같은 후속에도 "그날은 자리가 없다"로 답할 수 있다 — 시터가 일정을 열거나 직접 쓰는 것이 맞는 경우다(오너가 일정을 열어 달라는 요청이면 시터 확인이 필요하다고 표시하는 프롬프트는 Q.4b / RV-2 몫).
- **Change dates와 011j · 011k:** 오너의 Change dates는 `011j`, 시터의 Decline · Suggest(can_host=false, 견적 없음)는 `011k`가 호스팅 DB에 적용돼 있어야 한다(없으면 "Couldn't change the dates / send the reply"). 새 앱은 옛 DB에서 답장 전송이 실패하고, 옛 앱(Vercel main)은 011k 뒤에도 그대로 동작한다(`p_outcome`은 선택). 시터의 **Suggest** 메시지는 일반 글이라 오너가 "이 날짜로 바꾸기" 한 번에 쓰는 버튼은 아직 없다(Change dates로 직접 고름).
- **예약 단계 (011l):** 마이그레이션 `011l`은 앱과 **같은 PR로 배포**(먼저 적용하면 옛 앱의 첫 만남 제안이 `interest_required`로 막힘). 시터의 기본 설정은 **한 번에 한 오너**라, 같은 날짜에 오너 두 명을 받으려면 시터 프로필에서 설정을 켜야 한다(테스트 계정 Chloe는 켜 두고 시작하려면 Profile에서 켠다). **홀드는 시터가 동의한 요청에만** 걸린다 — 동의 전 요청은 날짜를 잡지 않으므로 같은 날짜에 오너 둘의 요청이 함께 보일 수 있고, 한쪽이 홀드되면 다른 쪽의 동의는 실패한다. 오너가 보는 시터 달력(빈 날 / 꽉 찬 날)은 **다른 오너의 홀드를 아직 반영하지 않는다**(요청을 보내는 순간 `sitter_unavailable`로 알려 줌). 스윕은 15분마다 도는 cron이라 2일 · 3일 규칙은 최대 15분 늦게 적용된다. 첫 동의 전 상태의 요청은 단계가 `requested`로만 보이고, 오너 거절 사유(칩)는 시터 화면에 취소 이유로만 보이며 알림 본문에는 없다.
- **Decline 메모 길이 (FB-35):** 200자 제한은 앱 입력칸에서만 건다(서버 `respond_booking`은 길이를 검사하지 않음). 사유 칩과 메모는 한 문장(`sitter_note` · 알림 본문)으로 합쳐져 저장되므로 오너 화면에서 칩과 메모를 따로 구분해 보여 주지 않는다.
- **문의 이어 쓰기 (FB-34):** 오너의 **Write back** 칸은 *시터의 답이 마지막 메시지일 때만* 보이고(내가 보낸 뒤에는 시터가 답할 때까지 숨김), 문의가 `booked` · `closed`면 없다. 새 초안은 백엔드가 "마지막 초안 이후의 새 오너 메시지"로 만든다 — Render가 잠들어 있거나 모델이 실패하면 초안이 늦거나 없고, 시터는 **Write it myself**로 직접 답할 수 있다. **Change dates**는 새 문의를 만들 뿐 이전 문의는 닫지 않는다. 장소가 *Somewhere else*였던 문의는 메모를 저장하지 않아서 시트에서 장소 메모를 다시 써야 한다.
- **일찍 Received한 뒤의 기록 (CW-1, 2026-10-09 수정):** 체크인 · 할 일 · 알림장 칩 · 초안이 모두 "약속된 드롭오프와 Received 중 **이른 쪽**"부터 센다(끝은 약속된 픽업 그대로). 체크인 · 할 일 쪽은 DB 함수라 **`011i`가 호스팅 DB에 적용돼야** 바뀐다 — 적용 전에는 `in_care` 리셋 뒤 3분 동안 체크인이 "Tasks open once the stay has started"로 막힌다(알림장 칩은 백엔드 배포만으로 고쳐짐).
- **케어 요청서의 한계 (Phase 06 결정):** "a week" 같은 주 단위 반복은 없다(할 일은 매일 반복이거나 한 번뿐). 횟수 방식("3 times a day")은 카운터가 아니라 시간 자동 배치(8 AM · 2 PM · 8 PM, 표에서 수정). counter-request의 추가 비용은 기록·표시만 한다(추가 결제 없음). 돌보는 중 요청은 펫당 열린 것 1건(대기 또는 counter). 돌보는 중에도 이미 있는 할 일의 수정·삭제는 오너가 직접 할 수 있고, 추가만 요청이다. 요청은 보낼 때 검증하지 않고 승인할 때 만들어져서, 규칙(글자 수·종)에 어긋난 요청은 승인 때 오류가 날 수 있다.
- **서버 푸시(6.7)는 하지 않는다:** 앱이 꺼진 상태의 알람은 없고, 알람 팝업은 앱이 열려 있을 때만(소리·진동은 브라우저가 허용할 때).
- **AI 알림장의 환각 방지 구조:** 모델에는 `source_snapshot` 하나만 주고, 기록이 없으면 모델을 부르지 않으며, 규칙 위반(성별 대명사 · "on time")은 한 번 다시 쓰게 한다. 프롬프트를 바꾸면 `backend/scripts/check_daily_report.py`를 다시 돌려 사람이 읽는다.
- History는 **읽기 전용**이다. 시터 Diary(알림장 쓰기)는 7.3에서 생겼다(스택 #55).
- Heads-up은 시터 **예약 상세와 Home**에 보인다. "도착 카드"(Pet Transit)는 Phase 06B에서 만든다.
- History는 3가지 기록(할 일 · 체크인 · 피드 사진)을 화면에서 합쳐 보여준다. 같은 사진이 Feed에도 있으면 한 번만 나온다.
- 체크인은 **전송 후 취소할 수 없다** (연타 잠금만 있음). 필요해지면 "10초 취소"를 추가한다.
- 알림을 지워도 History에는 남는다 (알림 = 지우는 것, 기록 = 남는 것).
- AI 기능: 문의 응대(07B) · 알림장(07) · 캡션(09) · Life Record(07C)는 main에 머지됐다(#55~#58, 수정 #60). 안전 검사(08)는 아직이다. 알려진 문제는 [review-2026-10-08.ko.md](review-2026-10-08.ko.md).
- 샘플 사진 트레이는 **데스크톱 프레임 / 데모 계정**에서만 보인다. 실제 폰 + 일반 계정에서는 **Take photo / Choose from library**. 사진 샘플은 라벨 · 영상 · 알림장 그림을 뺀 모든 사진 선택에서 같은 모음(강아지 · 고양이 · 일상)이다. 고양이 사진은 `frontend/assets/demo/mood/` = `backend/tests/fixtures/mood/`, 설명은 `cat_notes.json`. 호랑이 무늬 고양이 사진은 키보드 글자와 사탕 포장지를 흐리게 가렸다.
- 사진 · 영상 업로드와 피드 삭제는 **백엔드가 떠 있어야** 한다.
- 안 읽은 알림 숫자는 벨이 있는 화면에서만 보인다 (Welcome · 로그인 화면 제외).
- 데모 예약의 **픽업 시각이 지나면** 시터 화면의 할 일 · 체크인이 막힌다 (1.3).
- 이름 변경(2026-10-06) 뒤 첫 접속에서는 로그인 세션 저장 키가 바뀌어 **한 번 로그아웃**되고, 할 일 알림 미루기(snooze)도 처음 상태로 돌아간다. 새 사진 · 영상은 Cloudinary `goldito/` 폴더로 가고(2026-10-07 Goldito 이름 변경부터), 예전 `pawddy/` · `pawnote/` 사진도 그대로 보인다.

---

## 5. 버그 · 요청

- **버그**: GitHub 이슈로 올린다 (제목 · 본문은 영문, [CLAUDE.md](../../CLAUDE.md) 규칙). 최소한 **시나리오 ID · 계정 · 한 일 · 기대 · 실제 · 스크린샷** 을 적는다.
- **시나리오 추가 요청**: 아래 표에 한 줄 적어서 개발자에게 알린다. 확인되면 위 3장으로 옮긴다.

| 날짜 | 요청한 사람 | 기능 | 역할 | 이런 기대 결과를 확인하고 싶다 | 처리 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 10/04 | 민식 | 오너 Care tasks | 오너 | 시간을 +로만 올리지 않고 직접 눌러 고르기. 등록한 태스크를 눌러 상세 보기 · 수정 | ✅ 구현됨 (06 후속) |
| 10/04 | 민식 | 시터 Mark done | 시터 | Mark done → 팝업(메모 입력 + Done)에서 한 번 더 Done 하면 전송 | ✅ 구현됨 (06 후속) |
| 10/04 | 민식 | 시터 전송 반응성 | 시터 | 눌린 것/전송된 것/알림 갔는지가 분명해야 함, 연타 시 동작, 내가 보낸 기록(히스토리) | ✅ 구현됨 (06 후속) |
| 10/04 | 민식 | 알림 삭제 | 오너·시터 | 밀어서 지우기(60% 이상) · Clear all | ✅ 구현됨 (06 후속) |
| 10/04 | 민식 | 시터 Home | 시터 | 스크롤 없이 한눈에 보이는 대시보드, 나머지는 버튼으로 들어가서 | ✅ 구현됨 (06 후속) |
| 10/04 | 민식 | Diary 재정의 | 오너 | Diary에는 시터가 쓴 일기만. 시시각각 업데이트는 Home에 알림처럼, 지울 수 있고, 나중에 다시 볼 수 있게 | ✅ 구현됨 (06 후속) |
| | | | | | |

---

## 6. 갱신 규칙

1. Task 하나를 끝내는 커밋에서 **2장 현황표**의 줄 상태와 **3장 시나리오**(필요하면 새 ID)를 같이 고친다.
2. 자동 테스트를 추가했으면 "자동" 열에 스펙 이름을 적고, **자동으로 못 보는 것**(실제 폰 · 실시간 · 디자인)은 👤로 남긴다.
3. 사람이 확인했으면 상태에 `✅ 10/05 민식` 처럼 날짜와 이름을 적는다. 실패하면 ❌와 이슈 링크.
4. 새 제약이 생기면 4장에 한 줄 추가한다.
