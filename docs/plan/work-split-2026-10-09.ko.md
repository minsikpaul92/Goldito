# 남은 일 나누기 — 민식 (급한 것) · 슬기 (안 급한 것 · 데이터 · QA/UX) (2026-10-09)

> **왜:** 제출 마감은 **2026-10-30 10:00 AM PT (토론토 오후 1시)** — 21일 남음. P0 코드는 15개 phase 중 13개 완료(약 75%). 남은 일을 **데모 경로를 막는 급한 일(민식)** 과 **급하지 않은 일 · 익명화 데이터가 필요한 일 · QA/UX(슬기)** 로 나눈다.
> **슬기는 여기서 시작:** [phases/phase-q.md](phases/phase-q.md) (슬기 트랙 Phase Q — 목표 · 읽을 문서 순서 · 규칙 · 작업 목록).
> **기준 문서:** [TODO.md](TODO.md) (큐) · [review-2026-10-08.ko.md](review-2026-10-08.ko.md) (RV · M · L 항목 상세) · [feedback-2026-10-08.ko.md](feedback-2026-10-08.ko.md) (FB 항목) · [test-guide.ko.md](test-guide.ko.md) (시나리오).

---

## 1. 나누는 원칙

| | 민식 (급함) | 슬기 (안 급함 · 데이터 · QA/UX) |
| :--- | :--- | :--- |
| 기준 | 데모 경로(문의 → 만남 → 예약 → 돌봄 · 이동 → 완료)가 **막히거나 틀린 약속을 하는** 것, 제출에 꼭 필요한 것 | 품질을 올리는 것, **실제 시터 경험**이 필요한 것, **익명화된 실제 데이터**가 필요한 것, 사람이 직접 해 봐야 하는 확인 |
| 성격 | 새 기능 · 마이그레이션 · RLS · 배포 | 손 테스트 · 흐름 · 문구 · 말투 · AI 품질 · 평가 |
| 같은 파일을 만질 때 | 민식이 먼저 머지 → 슬기가 main을 받아서 이어감 (§4) | |

---

## 2. 민식 — 급한 것 (순서대로)

| # | 항목 | 왜 급한가 | 상세 |
| :--- | :--- | :--- | :--- |
| ~~U0~~ ✅ | **백엔드 배포** (10.3을 앞당김) — **2026-10-09 완료: Render 무료** https://goldito-backend.onrender.com (Nebius는 카드 · $25 선결제 요구로 보류), Vercel `EXPO_PUBLIC_API_URL` · `EXPO_PUBLIC_DEMO_TOOLS=1`, keep-alive cron | 테스트는 Vercel(main)에서 하는데 백엔드가 없으면 업로드 · AI · 데모 리셋이 전부 안 됨 | [phase-10.md](phases/phase-10.md) 10.3 · [env-setup.ko.md](env-setup.ko.md) § 배포된 백엔드 |
| CW-1 | **알림장 칩의 "맡은 시간" 버그** — 칩 · 초안이 약속된 드롭오프 시각부터 세서, 일찍 Received한 뒤의 사진 · 체크인이 빠짐 (`in_care` 리셋 뒤 3분은 항상). 작은 백엔드 수정 + pytest | 슬기 Q.1 테스트에서 "Feed 사진이 Diary에 안 나옴"으로 바로 보임 | TODO Up next CW-1 |
| U1 | **R1b — 문의 AI 안전 RV-1 → RV-5** (`fix/review-inquiry`, 마이그레이션 `011c`~`011e`) | 데모 1단계에서 AI가 **막힌 날짜에 "가능해요"**, 거절 답장에 견적 카드 — 시터 이름으로 틀린 약속. 예약 엔진 · RLS와 얽혀 있음 | review §4 RV-1~RV-5 |
| U2 | **06B Pet Transit** (`012`) — Start trip · 위치 · ETA · 도착 사진 체크 | P0 마지막 기능 (D41), 데모 4단계 | [phase-06b.md](phases/phase-06b.md) |
| U3 | **R2 — 예약 흐름** FB-8 (시터 In progress) → FB-9 (Returned 확인) → FB-5 · FB-6 (시간 변경 시트) → FB-2 (목록 실시간 갱신) | 심사위원이 직접 누르는 흐름 | feedback FB-2 · 5 · 6 · 8 · 9 |
| U4 | **10 데모 · 배포** — 고정 데모 계정(리셋 기능 제거), 시드, README, keep-alive, 데모 영상, Devpost (백엔드 배포는 U0에서 끝남) | 제출 필수 | [phase-10.md](phases/phase-10.md), TODO "Demo accounts for judging" |
| U5 | 사람만 할 수 있는 것 — 호스팅 DB 마이그레이션 적용, Google OAuth In production, 두 번째 시터 계정(Paul) | 배포 · 3B.11 앞 | TODO human 줄 |
| — | (08 세이프티 가드는 06B · 10 뒤 시간이 남을 때만) | stretch | [phase-08.md](phases/phase-08.md) |

**민식에서 빼는 것 (→ 10에 흡수):** R60-3~R60-5 (데모 리셋 견고성) — 심사 전에 리셋 기능 자체를 고정 계정으로 바꾸므로. R60-6 · FB-7b · BF.8 · BF.9는 시간이 남으면.

---

## 3. 슬기 — 안 급한 것 · 데이터 · QA/UX

전체 목록과 순서, 완료 기준은 **[phases/phase-q.md](phases/phase-q.md)** 에 있다. 요약:

| 묶음 | 항목 | 왜 슬기 |
| :--- | :--- | :--- |
| **QA · 흐름** | 손 테스트로 07 · 07B · 09 · 07C의 DoD 확인, test-guide 시나리오 상태 ✅ 기록, 두 계정 동시 실행(INQ · REPORT-10), 매 단계 "시터 실무에서 이상한 점"을 피드백(FB-30~)으로 | 실제 시터 3년 경험 · 사람만 할 수 있음 |
| **문구 · 프리셋** | 리뷰 프리셋(오너 → 시터, 시터 → 오너), 알림장 칩 문구, 체크인 선택지, 케어 체크리스트 · 준비물 목록, 알림 제목 | 실무 표현 |
| **데이터 · 말투** | 3년치 대화 익명화 → JSONL, 문의 답장 말투(스타일 카드 + 예시 답장), **알림장 말투 · few-shot**, 자동 발송 지연 공식 | 원본 데이터를 가진 사람만 익명화 가능 |
| **AI 품질 (R3 Medium)** | 문의 AI M-1~M-11, 알림장 M-13~M-16, 캡션 M-17~M-19, Life Record M-20~M-23, 시드 M-24 | 말투 · 숫자 검사 · 익명화와 연결, 데모를 막지는 않음 |
| **다듬기 (R4 Low)** | L-1~L-6 묶음, FB-1 · FB-3 · FB-4 | 급하지 않은 UX |
| **평가** | 문의 응답 시간 실측(M-1), 캡션 말투 측정(M-19), Life Record 환각 테스트 | 키 + 판단 필요 |
| (P2) | 11.7 SFT 보여주기 | 시간이 남을 때만 |

> **RV-1~RV-5를 슬기에게 넘기지 않는 이유:** 예약 엔진의 정원 규칙 · RLS · 마이그레이션 3개를 이번 주에 바꾸는 일이고, 데모에서 틀린 약속을 막는 안전 문제라 급함. **말투 · 품질 쪽(M-1~M-11)** 은 RV가 머지된 뒤 슬기가 이어받는다.

---

## 4. 같이 일하는 규칙 (충돌 막기)

1. **브랜치:** 각자 main에서 작은 브랜치(CLAUDE.md §4.1 — `claude/` 같은 도구 이름 접두어 금지). 슬기: `qa/…`, `fix/q-…`, `data/…`, `docs/…`.
2. **같은 파일 동시 작업 금지 기간**
   | 기간 | 민식이 바꾸는 중 (슬기는 손대지 않음) |
   | :--- | :--- |
   | R1b 머지 전 | `backend/app/ai/inquiry.py` · `inquiry_agent.py` · `routers/ai_inquiry.py` · `app/sitter/inquiries/` · `app/owner/inquiries/` · `features/inquiry/` |
   | R2 머지 전 | `app/*/bookings/` · `components/HandoffChangeSheet.tsx` · `lib/bookings.ts` |
   | 06B 머지 전 | `trips` · `handoff_checks` 관련 전부 |
   슬기가 그 사이에 할 수 있는 것: QA, 문구, 데이터, `backend/app/ai/prompts/**`(프롬프트 파일 — 코드 수정 없이 튜닝, architecture §9), 알림장 · 캡션 · Life Record 쪽 M 항목.
3. **마이그레이션 글자:** 민식 `011c`~`011l`, 슬기 `011m`~`011z`. `012`는 06B, `013`은 08 예약. 만들면 TODO의 "Hosted DB status"에 `[ ] (not applied yet)` 줄 추가, 호스팅 DB 적용은 민식이.
4. **TODO.md:** "Current focus"가 **두 개**(민식 · 슬기 각 하나). 자기 줄만 바꾼다.
5. **피드백 번호:** FB-30부터 슬기가 이어서 붙인다([feedback-2026-10-08.ko.md](feedback-2026-10-08.ko.md) 형식 — 본 것 · 원인 · 생각 · 급함 여부). 급한 것은 민식 큐로, 나머지는 슬기 큐로.
6. **실제 데이터:** 원본은 **리포 · 프롬프트 · 영상 · 스크린샷 어디에도 넣지 않음**(`data/raw/`는 gitignore). 익명화된 샘플만 커밋(README.ko.md §8, D35). Nebius zero-retention 여부는 슬기가 결정해 기록.
7. **매주 동기화:** 월 · 목 — 각자 TODO의 Completed · Current focus 확인, 막힌 것 공유.

---

## 5. 일정 (제안)

| 기간 | 민식 | 슬기 |
| :--- | :--- | :--- |
| 10/9–10/11 | U0 백엔드 배포 ✅ → CW-1 알림장 맡은 시간 → U1 R1b (RV-1~5) | Q.0 Vercel에서 두 계정 → Q.1 전체 손 테스트 · 피드백 |
| 10/12–10/17 | U2 06B Pet Transit | Q.2 문구 · 프리셋 → Q.3 익명화 → Q.4 말투 데이터(문의 · 알림장) |
| 10/18–10/20 | U3 R2 예약 흐름 | Q.5 R3 알림장 · 캡션 · Life Record M 항목 |
| 10/21–10/26 | U3 마무리, 데모 경로 버그 | Q.6 R3 문의 M-1~M-11 (R1b 머지 뒤) · Q.7 평가 |
| 10/27–10/29 | U4 고정 데모 계정 · 시드 · README · 영상 · Devpost | Q.8 최종 QA(데모 경로 전체, 두 계정) · R4 Low 여유분 |
| 10/30 오전 | 제출 | 제출 전 마지막 확인 |
