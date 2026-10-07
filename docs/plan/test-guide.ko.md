# Pawddy 기능 현황 · 테스트 가이드

> **누구를 위한 문서?** 개발에 같이 참여하는 사람(민식 · 슬기 · 묵)과 테스트하는 사람.
> **무엇을 알 수 있나?** ① 지금 무엇이 만들어졌고 무엇이 아직인지 ② 어떻게 확인하는지 ③ 확인 결과.
> **언제 갱신하나?** 작업(Task) 하나가 끝날 때마다 **같은 커밋에서** 현황표와 시나리오를 고친다 ([CLAUDE.md](../../CLAUDE.md) §5).
> 제품 흐름은 [full-process.ko.md](full-process.ko.md), 할 일 큐는 [TODO.md](TODO.md).

**마지막 갱신:** 2026-10-04 · Phase 06 / 6.11 + 오너·시터 화면 개편까지

---

## 1. 시작하기

### 1.1 접속

| 환경 | 주소 | 비고 |
| :--- | :--- | :--- |
| 로컬 앱 | `http://localhost:8081` | `cd frontend && npx expo start --web --port 8081` |
| 로컬 백엔드 | `http://localhost:8000` | `cd backend && .venv/bin/uvicorn app.main:app --port 8000` — **사진·영상 업로드와 피드 삭제에 필요** |
| Vercel preview | PR마다 자동 생성 (PR 코멘트의 Preview 링크) | 백엔드가 없으면 업로드는 안 됨 |

> 로컬 앱은 **호스티드 Supabase(실제 DB)** 에 붙는다. 테스트가 실제 데이터를 만든다는 뜻이다 (1.4 참고).

### 1.2 데모 계정

로그인 화면의 **Try the demo** → **Demo owner** / **Demo sitter** 버튼 (비밀번호 입력 불필요).

| 계정 | 이름 | 가진 것 |
| :--- | :--- | :--- |
| `demo-owner@pawddy.test` | Chloe (오너) | 강아지 **Max**, 고양이 **Mochi** |
| `demo-sitter@pawddy.test` | Lucy (시터) | Chloe의 확정 예약 1건 (아래) |

> **2026-10-06 이름 변경 (PawNote → Pawddy):** 데모 계정 이메일이 `@pawnote.test` → `@pawddy.test` 로 바뀌었다. hosted DB에 `cd backend && python -m scripts.seed_demo` 를 한 번 다시 돌려야 **Try demo** 버튼이 동작한다. 예전 `@pawnote.test` 계정의 데이터(예약 · 펫)는 새 계정으로 옮겨지지 않는다.

### 1.3 데모 데이터 (2026-10-04 기준)

- Chloe ↔ Lucy 예약 **확정**, 미팅 완료, **결제 전**. Max · Mochi.
- 드롭오프 완료(10/4), **픽업 예정 10/7 05:37 UTC (토론토 10/7 새벽 1:37)**.
- 그래서 **지금 Lucy는 "돌보는 중"** 이다 → 시터 Home의 할 일 · 체크인이 보인다.
- ⚠️ **픽업 시각이 지나면** 시터 쪽 시나리오(TASK · CHK)가 "Tasks open once the stay has started" 등으로 막힌다. 그때는 새 예약을 만들어 드롭오프를 완료 처리하거나 시드 스크립트(Phase 10, 10.1)를 쓴다.
- 데이터 시드·리셋 스크립트는 아직 없다 (Phase 10).

### 1.4 테스트가 남기는 데이터

| 지울 수 있음 (앱에서) | 지울 수 없음 (의도된 규칙) |
| :--- | :--- |
| 돌봄 할 일 (Delete), 피드 사진 (🗑️) | 체크인, 완료 기록, 알림 — 클라이언트는 읽기 전용 |

→ 테스트 후 알림·체크인이 쌓인다. 데모 전에는 시드 스크립트로 리셋할 예정 (Phase 10).

---

## 2. 기능 현황

범례: ✅ 만들어짐 · 🟡 일부 · ⬜ 아직 · 🤖 자동 테스트 있음 · 👤 사람이 확인해야 함

### Stage 1 — Inquiry (문의)

| 기능 | 상태 | Phase |
| :--- | :--- | :--- |
| 오너 **문의 보내기** (시터 프로필 → Ask about a stay: 서비스 · 반려동물 · 날짜 · 장소 · 질문(선택) → 대화 화면, 시터가 보낸 답만 보임, 견적 카드 · 출처 칩, Request booking 자동 입력, 불가 날짜면 Find other sitters) | ✅ 🤖 `inquiry.spec.ts` (실제 두 계정 · 실제 DB는 👤 — **010 호스팅 DB 적용 전**) | 07B / 7B.5 |
| 시터 **문의함** (Questions 탭 · 초안 Send 한 번 / Edit·Add / Regenerate / 의도 칩 · 경고 문구 · 열면 읽음) + 정책 편집 | ✅ 🤖 `inquiry.spec.ts` | 07B / 7B.6 |
| 문의 답장 **초안 API** (일정 · 견적 · 반려동물 · RAG 근거 → Nano, 금액 · 날짜 · 1인칭 · 출입 정보 검사, 정책 체중 한도, 멱등, 오너에게는 초안을 안 줌) | ✅ 🤖 pytest a–k (실제 모델 확인 · 지연 p50 3.2 s) | 07B / 7B.3–7B.4 · 7B.7 |
| RAG (문단 청크 · 재색인 · 범위 제한 검색) | ✅ 🤖 pytest + SQL smoke M | 07B / 7B.2 |
| **시터 말투** (스타일 카드 + 본인 예시 · 익명화 · 그대로 / 수정 / 다시 생성 학습) | ✅ 🤖 pytest · 실제 모델로 두 시터 다른 말투 확인 · 블라인드 평가(약 50건)는 👤 | 07B / 7B.8–7B.9 |
| **자동 발송** (동의 모달 · 약 30초 사람 속도 · typing → 말풍선 · 시터가 열기 전엔 읽음 없음) | ✅ 🤖 pytest + `inquiry.spec.ts` + SQL smoke M (지연 공식은 슬기 확정 전 기본값) | 07B / 7B.10 |
| 문의 에이전트 (tool calling, `INQUIRY_AGENT=1`, 기본 꺼짐) | ✅ 🤖 pytest · 실제 모델 확인 | 07B / 7B.11 |

### Stage 2 — Meet & Greet · 케어 요청

| 기능 | 상태 | Phase |
| :--- | :--- | :--- |
| 첫 만남 미팅 (직접 / 영상, 제안 · 수락 · 건너뛰기) | ✅ 🤖 | 03B.9 |
| Google Meet 링크 자동 생성 | 🟡 서버 완료, **앱 e2e 미확인** | 03B.11 |
| 오너가 돌봄 할 일 등록 (약 · 식사 · 산책 …) | ✅ 🤖 | 06 / 6.1 |
| AI 케어 요청서 → 체크리스트 (칩 · 한 줄씩 · 표 · 자동 저장) | ✅ 🤖 (실제 AI 응답은 👤) | 06 / 6.12–6.13 · 6.20 |

### Stage 3 — Booking (예약)

| 기능 | 상태 | Phase |
| :--- | :--- | :--- |
| 시터 스케줄 열기 / 막기 | ✅ 🤖 | 03B.1 |
| 내 시터 목록 · 시터 프로필 | ✅ 🤖 | 03B.2 |
| 예약 요청 (펫 · 시간 · 장소 · 서비스) | ✅ 🤖 | 03B.3 · 03B.10 |
| 시터 요청 함 (수락 · 시간 제안 · 거절) | ✅ 🤖 | 03B.4 |
| 협상 · 확정 후 변경 | ✅ 🤖 | 03B.5 |
| 도착 / 인계 체크 (Received · Returned) | ✅ 🤖 | 03B.6 |
| 취소 · 새 시터 찾기 | ✅ 🤖 | 03B.7 |
| 시터 Home 대시보드 | ✅ 🤖 | 03B.8 |
| 견적 · 동의서 · 데모 결제 · 시간 제한 출입 정보 | ✅ 🤖 | 03C |

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
| 오너 **History** (오늘 + 최근 7일 기록, 알림을 지워도 남음) | ✅ 🤖 | 06 / 6.11 |
| 오너 **Diary 탭** = 시터가 보낸 알림장 목록(첫 문장) → 항목 화면(본문 · 그날 사진 · 할 일), 초안은 안 보임, 알림 탭하면 해당 항목 | ✅ 🤖 `report.spec.ts` (실제 두 계정은 👤) | 07 / 7.3 |
| 시터 **리마인더 배너** (할 일 시간이 되면 Home 맨 위 배너 + 토스트) | ✅ 🤖 | 06 / 6.6 |
| 시터 **Diary** (오늘 요약 한 줄 · 펫별 칩 켜기/끄기 · 기록 값 고치기 · + Add 내 칩 · 사진 ≤ 2 · 짧은 메모 → 초안 미리보기 수정 → Send, 새로고침 후 초안 유지) | ✅ 🤖 `report.spec.ts` (AI는 mock · 실제 모델 연결은 👤) | 07 / 7.3 |
| AI 알림장 **초안 API** (`POST /api/ai/daily-report`: 하루 기록 → 시터 1인칭 초안, 같은 날 덮어쓰기, 보낸 뒤엔 409, 기록이 없으면 고정 문장) | ✅ 🤖 pytest (실제 모델로 환각 점검 3회 · 화면 없음) | 07 / 7.2 |
| **알림장 보내기** (`send_daily_report`: 시터가 고친 **최종 본문**만 게시, 오너는 보낸 것만 보임, 한 번만, 오너 알림) | ✅ SQL `rls_smoke` (화면 없음) | 07 / 7.5 |
| AI 알림장 **칩 제안 API** (`POST /api/ai/report-chips`: 하루 기록 → 칩(모델 없음), 사진 ≤ 2 → 한 줄 묘사 + 에피소드 칩, 느리거나 실패한 사진은 빼고 기록 칩은 유지, 남의 사진 403) | ✅ 🤖 pytest (실제 비전 모델 호출은 아직 안 해봄 · 화면 없음) | 07 / 7.7 |
| 사진 자동 캡션 · 앨범 분류 | ⬜ | 09 |
| Pet Transit (실시간 위치 · 도착) | ⬜ | 06B |

### Stage 5 — Completion · 기타

| 기능 | 상태 | Phase |
| :--- | :--- | :--- |
| 홈 안전 도착 리포트 · 리뷰 · Pet Life Record | ⬜ | 07C |
| 간식 안전 스캐너 | ⬜ (스트레치) | 08 |
| 로그인 · 회원가입 · 역할별 화면 · Welcome 투어 | ✅ 🤖 | 01 · 03 · OB |
| 펫 · 프로필 | ✅ 🤖 | 03 |
| 데스크톱 폰 프레임 · 마우스=손가락 | ✅ 🤖 | 01 |

---

## 3. 시나리오

**열 설명** — 자동: 같은 시나리오를 자동 테스트가 확인하는지 (스펙 이름). **상태**: ✅ 통과 · ❌ 실패 · ➖ 미확인 (+ 날짜 · 확인한 사람). 아직 아무도 사람 손으로 확인하지 않은 줄은 **➖** 이다.

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
| REQ-7 | **돌보는 중**(수락된 예약, 아직 픽업 전)인 펫에서 같은 화면 | 제목이 **"Write a care request"**, 자동 저장 없음("Nothing changes until Lucy approves"). **Send request to Lucy** → 토스트, 펫 화면에 "⏳ Waiting for Lucy…". 승인 전엔 Care tasks에 아무것도 안 생김. 대기 중엔 또 보낼 수 없음 | 🤖 `care-request` · SQL `rls_smoke` | ➖ |
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
| TASK-3 | 팝업에서 메모 없이 **Done** | "… done ✅ Chloe was told" 토스트, **할 일이 목록에서 사라짐**, "Done today (N)"에 나타남. 오너 알림 제목은 **한 일**(예: "Max had breakfast on time 🍽️"), Feed 새 글 없음 | 🤖 `sitter-tasks` | ➖ |
| TASK-4 | 팝업에 **메모를 쓰고 Done** | 오너 알림에 **한 일(제목) + 메모(본문)** 이 같이 감 — 무엇에 대한 메모인지 알 수 있음 | 🤖 `sitter-tasks` · SQL | ➖ |
| TASK-5 | 팝업 **📷 Add photo** → 찍기/고르기/샘플 → 미리보기 → Use this photo → Done | 업로드 + 완료. 오너 Feed에 사진 글. 알림은 `task_done` 하나 | 🤖 `sitter-tasks` · **실제 업로드 👤** | ➖ |
| TASK-6 | 미리보기에서 **Retake** | 선택 화면으로 복귀, 아무것도 올라가지 않음 | 🤖 `sitter-tasks` | ➖ |
| TASK-7 | 업로드가 **실패**하면 | **빨간 팝업이 닫을 때까지 남음** + Try again. 팝업의 메모는 유지, 완료는 안 됨. Try again → 성공 | 🤖 `sitter-tasks` · **실제 환경 👤** | ➖ |
| TASK-8 | 예정 시각이 60분 넘게 지난 미완료 할 일 | ⚠️ Missed 배지 (60분 안이면 ⏳ Pending) | 🤖 `care-tasks` | ➖ |

### 3.3 시터 — Home 대시보드 · 빠른 체크인 (HOME / CHK)

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| HOME-1 | 돌보는 중에 시터 Home | **스크롤 없이 한 화면**: 숫자 칩 · **Today 카드(오늘 남은 할 일 최대 3줄, 시간 전에도 보임; 나머지는 "+ N more")** · Now caring 펫 칩 · 바로가기 2개 | 🤖 `sitter-home` | ➖ |
| HOME-2 | Today 카드 줄의 **Done** (시간 전이어도 가능) | 팝업 → Done → 숫자(예: 1/4)가 바로 올라가고 다음 할 일이 올라옴. 지난 건 ⚠️ Overdue, 시간이 된 건 ⏰ Due now 표시 | 🤖 `sitter-home` | ➖ |
| HOME-3 | 바로가기 **All tasks · My history** (Photos · Bookings는 탭과 중복이라 뺌), 펫 칩 | 각각 해당 화면으로. 펫 칩 → 그 펫의 체크인 화면 + 📸 Photos 버튼 | 🤖 `sitter-home` | ➖ |
| HOME-4 | **My history** | 내가 끝낸 할 일 · 보낸 체크인(펫 이름 포함)이 최신순. 시간이 지난 미완료는 ⚠️ Missed로 | 🤖 `sitter-home` | ➖ |
| HOME-6 | 할 일 💤 스누즈 중에 Home | Next up 카드에 **"💤 Snoozed until 11:43 AM"** (할 일의 예정 시각은 그대로) | 🤖 `due-reminder` | ➖ |
| REM-1 | 시터 Home을 연 상태에서, 시간이 된(지난 지 1시간 안) 할 일이 있음 | **"⏰ Due now" 알람 팝업**이 화면 가운데 뜸(소리 · 진동 시도). **Done**으로 바로 완료, 팝업 뒤 Home엔 Today 목록이 그대로 | 🤖 `due-reminder` · 소리/진동 **👤** | ➖ |
| REM-2 | 앱을 켜 둔 채로 다음 할 일 시간이 됨 (30초마다 확인) | **"⏰ Time for Dinner · Max"** 토스트가 한 번 뜸. 이미 시간이 지난 할 일들 때문에 앱을 켤 때 토스트가 쏟아지지는 않음 | 🤖 `due-reminder` · **실제 시계 👤** | ➖ |
| REM-3 | 팝업의 **Dismiss** | 다음 할 일 팝업으로 넘어감. 1시간 넘게 지난 것은 **"⚠️ Overdue"**. 모두 닫으면 팝업 사라짐 | 🤖 `due-reminder` | ➖ |
| REM-4 | 급한 게 여러 개 | 가장 이른 것 하나 + "+ N more waiting — see all tasks" (누르면 전체 할 일) | 🤖 `due-reminder` | ➖ |
| REM-6 | 팝업의 **💤 Remind me in 10 min** | 팝업이 사라지고 Today 카드 줄에 **"💤 Snoozed until …"**. **새로고침해도 유지**. 10분 뒤 **"⏰ Still waiting: Dinner · Max"** 토스트와 함께 팝업이 다시 뜸 | 🤖 `due-reminder` | ➖ |
| REM-5 | **실제 시계로**: 오너가 2~3분 뒤 시각의 할 일을 만들고, 시터는 Home을 연 채 기다림 | 30초 안에 Today 목록에 나타나고, 그 시각 정각에 토스트 + 팝업 | **👤만** | ➖ |
| HOME-5 | (돌보는 중이 아닐 때) 시터 Home | 요청 배너 · 오늘 인계 · 다가오는 예약이 짧게 | 🤖 `today` | ➖ |
| CHK-1 | 체크인 화면 → Max의 Meal **All** 누르기 (메모 비움) | 버튼이 **"✓ All"** 로 선택만 됨(**아직 전송 안 됨**), "Ready to send: …" 안내, 다시 누르면 선택 해제. **Send**를 눌러야 전송 → 토스트 "Sent ✅", 오너 알림 "Max ate everything 🍽️" | 🤖 `quick-checkin` | ➖ |
| CHK-2 | 카드 아래 **"Sent to Chloe today"** 목록 | 방금 보낸 것이 시각과 함께 쌓임 (메모는 따옴표로) | 🤖 `quick-checkin` | ➖ |
| CHK-3 | 메모 칸에 글을 쓰고 Meal **A little** | 오너 알림: **보낸 것(제목) + 메모(본문)**. 전송 후 메모 칸 비워짐 | 🤖 `quick-checkin` | ➖ |
| CHK-4 | 아무것도 고르지 않고 메모만 쓰기 | 메모가 없으면 **Send 비활성**. 메모를 쓰면 "Ready to send as a note" → Send로 노트 전송 | 🤖 `quick-checkin` | ➖ |
| CHK-5 | Max에는 Walk 10–60분 있음, Mochi에는 **없음** | 펫마다 체크인 화면이 따로, 고양이는 산책 없음 | 🤖 `quick-checkin` | ➖ |
| CHK-6 | **📷 Add photo** → 선택 → 미리보기 → Use → Mood **Happy** | "Photo ready ✓", 전송 시 업로드. 오너 Feed에 사진 글 + 체크인 알림 하나 | 🤖 `quick-checkin` · **실제 업로드 👤** | ➖ |
| CHK-7 | 전송이 **실패**하면 | 빨간 팝업이 남고 Try again으로 다시 보냄 | 🤖 `quick-checkin` | ➖ |

### 3.4 Feed · 공개 범위 (FEED / VIS)

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| FEED-1 | 시터: Feed 탭 → Max → **+ Photo** → 샘플 | "Shared with Chloe 🐾", 그리드에 새 사진 | 🤖 `media-picker` | ➖ |
| FEED-2 | **두 브라우저**: 일반 창 = 오너, 시크릿 창 = 시터. 시터가 올림 | 오너 화면에 **새로고침 없이** 토스트 + 벨 숫자 + Home 카드 + Feed 카드 (≤ 3초) | **👤만** (실시간) | ➖ |
| FEED-3 | 오너: 사진 탭 | **탭한 그 사진**이 전체화면. ‹ › 버튼, 스와이프, ←/→ 키 이동 | 🤖 `feed` | ➖ |
| FEED-4 | 영상 샘플 (Fetch play) 재생 | 오너 전체화면에서 재생 | 👤 | ➖ |
| FEED-5 | 시터가 **자기 사진** 열기 → 🗑️ → 확인 | "Photo deleted", 오너 Feed에서도 사라짐. 오너 화면에는 시터 글의 🗑️ **없음** | 🤖 `feed` · 파일 삭제는 pytest | ➖ |
| FEED-6 | 사진 업로드가 **실패**하면 | 빨간 팝업이 남고 Try again | 🤖 `media-picker` | ➖ |
| VIS-1 | 시터: **Share with Chloe** 칩 끄기("Only you") → 사진 올리기 | "Saved just for you 🔒", 🔒 배지. **오너는 못 봄**, 알림 없음 | 🤖 `media-picker` · SQL | ➖ |
| VIS-2 | 오너: Feed → **+ Photo** (기본 "Only you") | "Saved just for you 🔒". 시터는 못 봄 | 🤖 `media-picker` · SQL | ➖ |
| VIS-3 | 오너: "Visible to sitter" 켜고 올림 | 당직 시터가 알림 "Chloe shared a photo of Max 📸" → 탭 → 시터 Feed → Max, 사진 보임 | 🤖 SQL · e2e (알림 이동) | ➖ |

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
| NOTIF-7 | 한꺼번에 사진 여러 장 | 토스트는 "3 new photos 📸" 하나로 합쳐짐 | 👤 | ➖ |

### 3.6 오너 Home · History · Diary (LIVE / HIST)

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| LIVE-1 | 시터가 할 일 · 체크인 · 사진을 남긴 뒤 오너 Home | 맨 위 **Live updates**에 최신 3개 카드(할 일 완료 · 체크인 · 새 사진만; 메모가 있으면 제목 아래에 같이). 예약 알림 등은 안 나옴. **눌러서 확인한(읽은) 카드는 Home에서 사라짐**(알림 목록과 History엔 남음 — 안 읽은 것만 Home에 남음). 3개 넘으면 "N more in notifications" | 🤖 `live-updates` | ➖ |
| LIVE-2 | 카드를 **왼쪽으로 60% 넘게 밀기** | 카드가 사라지고 알림도 삭제. 다음 카드가 올라옴. **History에는 그대로 남음** | 🤖 `live-updates` | ➖ |
| LIVE-3 | 카드를 덜 밀기 / 탭 | 덜 밀면 유지. 체크인 · 할 일 카드 탭 → History, 새 사진 카드 → Feed | 🤖 `live-updates` | ➖ |
| LIVE-6 | 맨 위 카드 오른쪽 **✕** → **Clear all** (Cancel도 있음) | 보이는 Live updates(할 일 · 체크인 · 사진 알림)만 전부 삭제, 예약 알림 등은 남음 | 🤖 `live-updates` | ➖ |
| LIVE-7 | 오너 Home 펫 카드 | 지금 시터가 맡은 펫은 **카드 배경이 연한 초록 + 굵은 테두리 + 왼쪽 위 테두리에 "In care" 태그**, 이름 아래 "with Lucy · until Oct 7, 1:37 AM". 집에 있는 펫은 평범한 카드 | 🤖 `live-updates` | ➖ |
| LIVE-8 | 시터가 요청을 **Decline** 함 | 오너 Home 맨 위에 **주황 테두리 카드가 고정**("Tap to read and answer"): 밀어서 못 지움 · Clear all에도 남음 · 새로고침해도 남음. 탭 → 노트 시트(**Close는 그냥 닫힘**) → **읽으면 Home에서 사라짐**(답은 펫 화면 빨간 상자에 남음) | 🤖 `care-request` | ➖ |
| LIVE-9 | 시터가 **Counter-request** 를 보냄 | 같은 고정 카드. 읽어도 **오너가 Accept/Decline 하기 전까지 Home에 남음**, 답하면 사라짐 | 🤖 `care-request` | ➖ |
| LIVE-4 | 새 업데이트가 없을 때 | "Nothing new. During a stay, …" 안내 | 🤖 `live-updates` | ➖ |
| LIVE-5 | **두 브라우저**: 오너가 Home을 연 채 시터가 체크인 | 오너 Home에 **새로고침 없이** 카드 추가 | **👤만** (실시간) | ➖ |
| HIST-1 | Home의 **🕘 History** | 오늘 · 어제 · 날짜별 **최신순**, 줄마다 이모지 · 문구 · 시각 · 사람 · 썸네일 | 🤖 `diary` | ➖ |
| HIST-2 | 사진과 함께 완료/체크인 | 같은 사진이 **한 줄로만** (Feed 사진과 중복 안 됨) | 🤖 `diary` | ➖ |
| HIST-3 | 메모가 있는 체크인 / 7일보다 오래된 기록 | 메모가 줄 아래에 보임 / 오래된 건 안 보임 | 🤖 `diary` | ➖ |
| HIST-4 | 시간이 지난 미완료 할 일 | ⚠️ "… · Missed" | 🤖 `diary` | ➖ |
| HIST-5 | 줄 탭 | 사진이 있으면 크게, 없으면 상세(시각 · 사람 · 메모) | 🤖 `diary` | ➖ |
| HIST-6 | 펫이 둘이면 칩으로 전환 | 펫마다 자기 기록만 | 🤖 `diary` | ➖ |
| DIARY-1 | 오너 **Diary 탭** | "시터가 하루를 정리해 쓰면 여기에 나타나요" 안내 + Open History 버튼 (일기 쓰기는 Phase 07) | 🤖 `live-updates` | ➖ |
| DIARY-7 | (이전 화면에서 확인) 새로고침 없이 새 줄 추가 | 같은 동작이 이제 **Home 카드(LIVE-5)** 로 옮겨감 — 재확인 | **👤만** | ✅ 10/04 민식 (이전 Diary 화면) |

### 3.7 보안 · 권한 (SEC) — 실제 DB에서 👤

| ID | 단계 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| SEC-1 | 다른 오너 계정으로 로그인 | Chloe의 Max/Mochi 피드 · 알림 · 체크인이 **보이지 않음** | SQL `rls_smoke` | ➖ |
| SEC-2 | 시터로 `/owner` 주소를 직접 입력 | 시터 화면으로 되돌아감 | 🤖 `auth` | ➖ |
| SEC-3 | 오너가 체크인 · 할 일 완료를 API로 직접 시도 | 거절 (돌봄 구간의 시터만 가능) | SQL `rls_smoke` | ➖ |

### 3.8 예약 · 미팅 · 결제 (BOOK) — 이전 Phase, 자동 테스트가 촘촘함

| ID | 확인 내용 | 자동 | 상태 |
| :--- | :--- | :--- | :--- |
| BOOK-1 | 예약 요청 → 시터 수락 → 확정 | 🤖 `booking` · `sitter-bookings` | ➖ |
| BOOK-2 | 시간 · 장소 협상, 확정 후 변경 | 🤖 `negotiation` | ➖ |
| BOOK-3 | 첫 만남 미팅 (제안 · 수락 · 건너뛰기) | 🤖 `meet-greet` | ➖ |
| BOOK-4 | Received → Returned, 취소 · 새 시터 찾기 | 🤖 `handoff` · `rebook` | ➖ |
| BOOK-5 | 견적 → 동의서 → 데모 결제 → 출입 정보 잠금 해제 | 🤖 `checkout` · SQL | ➖ |
| BOOK-6 | **영상 미팅 Google Meet 링크** (앱에서) | 서버만 확인 (**앱 e2e 미확인**, 3B.11) | ➖ |

### 3.9 리뷰 버그 수정 (BF) — 2026-10-06 코드 리뷰에서 나온 버그

| ID | 확인 내용 | 기대 결과 | 자동 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| BF-1 | 시터가 handoff 사진 업로드 (`purpose=handoff`) | 확정 예약의 시터만, 합의된 맡기기 2시간 전부터 찾기 2시간 뒤까지 서명 발급. 그 밖에는 403 (예전엔 없는 컬럼을 읽어 **항상 500**) | pytest `test_authz_handoff` | ➖ |
| BF-2 | 사진을 붙인 체크인 → Feed에서 그 글을 🗑️ 삭제 | 피드 글만 지워지고 **Diary · History의 체크인 사진은 남음** (예전엔 Cloudinary 파일까지 지워짐) | pytest `test_feed_delete` | ➖ |
| BF-3 | 오너 · 시터가 거의 동시에 영상 미팅 링크를 받음 / 시터가 영상 미팅이 잡힌 요청을 Decline | 링크(캘린더 이벤트)는 **하나만** 남고 알림도 한 번. Decline하면 캘린더 이벤트도 지워짐 | pytest `test_meet_greet` (Decline 후 삭제는 👤 — Google 계정 필요) | ➖ |
| BF-4 | 돌봄 중 오너가 보낸 요청에 시터가 답하기 전에 예약이 취소되거나 찾기(Returned)가 끝남 | 요청이 **closed** 로 닫혀 다음 요청을 막지 않고, 예전 시터는 더 이상 승인할 수 없음 (시터 화면: "The stay ended before this request was answered."). 돌봄 중에는 저장형 체크리스트(`save_care_request`)도 거절 | SQL `rls_smoke` (BF.4) | ➖ |
| BF-5 | 오너가 찾기 시간 변경을 보낸 뒤 시터가 먼저 Returned · 지난 시간 제안 수락 · 하우스시팅 장소 변경 | Returned가 남은 제안을 닫아 **완료된 인수인계가 다시 열리지 않음**(출입 정보도 다시 안 열림). 지난 시간은 수락 불가, 픽업 시간이 지난 요청은 **Expired**로 Past에. 하우스시팅은 시간만 바꿀 수 있음 | SQL `rls_smoke` (BF.5) · 🤖 `sitter-bookings` · `negotiation` | ➖ |
| BF-6 | 결제한 예약에서 찾기 장소를 오너 집으로 바꾸고 시터가 수락 / 찾기 시간을 늦추고 수락 | 오너 집 → 체크아웃이 다시 열림(결제 취소, 지난 견적 유지) + 오너에게 `checkout_needed` 알림, 예약 화면 배너 "Your stay changed — sign to finish", Checkout에서는 **home_access 하나만** 체크하면 결제 완료. 그 전까지 시터의 출입 정보는 잠김. 기간 변경 → 새 총액으로 다시 견적 + `price_updated` 알림(결제 상태 유지). 동의서는 체크아웃 중(확정 · 미결제 · 필요한 종류)에만 서명. 오너 주소·긴급 연락처는 결제 후에만 시터에게 보임 | SQL `rls_smoke` (BF.6) · 🤖 `checkout` | ➖ |
| BF-7 | BF-6처럼 체크아웃이 다시 열린 상태에서 오너 · 시터가 예약 화면을 엶 | 오너: 시터 집 카드(주소 · 주차 · 로비)가 그대로 보임. 시터: 맡기기 · 찾기 주소(펫을 데려다줄 오너 집 포함)가 그대로 보이고, 출입 정보 카드는 사라지지 않고 "Waiting for {오너} to sign"을 보여 줌(코드는 서명 전까지 잠김). 한 번도 결제하지 않은 예약은 예전처럼 주소가 안 보임 | SQL `rls_smoke` (BF.7) · 🤖 `checkout` | ➖ |

---

## 4. 알려진 제약 (버그로 올리기 전에 확인)

- **오너 Diary 탭은 비어 있다** — 시터가 쓰는 일기(저녁 알림장)는 Phase 07에서 만든다. 지금의 실시간 소식은 Home, 전체 기록은 History.
- **시터 Diary** 는 아직 없다. History는 **읽기 전용**이다.
- Heads-up은 시터 **예약 상세와 Home**에 보인다. "도착 카드"(Pet Transit)는 Phase 06B에서 만든다.
- History는 3가지 기록(할 일 · 체크인 · 피드 사진)을 화면에서 합쳐 보여준다. 같은 사진이 Feed에도 있으면 한 번만 나온다.
- 체크인은 **전송 후 취소할 수 없다** (연타 잠금만 있음). 필요해지면 "10초 취소"를 추가한다.
- 알림을 지워도 History에는 남는다 (알림 = 지우는 것, 기록 = 남는 것).
- AI 기능 (문의 응대 · 알림장 · 캡션 · 안전 검사) 은 전부 아직이다.
- 샘플 사진 트레이는 **데스크톱 프레임 / 데모 계정**에서만 보인다. 실제 폰 + 일반 계정에서는 **Take photo / Choose from library**.
- 사진 · 영상 업로드와 피드 삭제는 **백엔드가 떠 있어야** 한다.
- 안 읽은 알림 숫자는 벨이 있는 화면에서만 보인다 (Welcome · 로그인 화면 제외).
- 데모 예약의 **픽업 시각이 지나면** 시터 화면의 할 일 · 체크인이 막힌다 (1.3).
- 이름 변경(2026-10-06) 뒤 첫 접속에서는 로그인 세션 저장 키가 바뀌어 **한 번 로그아웃**되고, 할 일 알림 미루기(snooze)도 처음 상태로 돌아간다. 새 사진 · 영상은 Cloudinary `pawddy/` 폴더로 가고, 예전 `pawnote/` 사진도 그대로 보인다.

---

## 5. 버그 · 요청

- **버그**: GitHub 이슈로 올린다 (제목 · 본문은 영문, [CLAUDE.md](../../CLAUDE.md) 규칙). 최소한 **시나리오 ID · 계정 · 한 일 · 기대 · 실제 · 스크린샷** 을 적는다.
- **시나리오 추가 요청**: 아래 표에 한 줄 적어서 개발자(또는 Claude)에게 알린다. 확인되면 위 3장으로 옮긴다.

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
