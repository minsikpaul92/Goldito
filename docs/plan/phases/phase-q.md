# Phase Q — 품질 · 데이터 · 말투 · QA (슬기 트랙, 2026-10-09 ~ 10-30)

> **담당:** 슬기 · **같이 보는 사람:** 민식 (급한 개발), 묵 (디자인)
> **왜 따로 뺐나:** [work-split-2026-10-09.ko.md](../work-split-2026-10-09.ko.md) — 마감(10/30)까지 민식은 데모 경로를 막는 급한 개발(백엔드 배포 → 문의 AI 안전 RV-1~5 → 06B Pet Transit → 예약 흐름 → 데모 배포), 슬기는 **안 급한 것 · 익명화된 실제 데이터가 필요한 것 · 시터 실무 경험이 필요한 QA/UX**를 맡는다.
> **공통 전제:** [CLAUDE.md](../../../CLAUDE.md) (작업 순서 · 브랜치 · 커밋 규칙) · [architecture.ko.md](architecture.ko.md) (D31 출입 정보 · D35 말투 · D38 시터 입력 최소화 · §9 AI 규칙)

---

## 0. 슬기 시작하기 (첫날)

### 0.1 읽는 순서 (약 1시간)

| 순서 | 문서 | 무엇을 보나 |
| :--- | :--- | :--- |
| 1 | 루트 [README.md](../../../README.md) — *How Goldito Works* · *A Stay with Goldito* | 제품 한 장 요약, 데모 경로 5단계 |
| 2 | [full-process.ko.md](../full-process.ko.md) | 5단계 흐름 · 결정 D27~D47 · §9 열린 질문(슬기 담당: #1 지연 공식, #5 말투 데이터, #8 zero-retention, #9 mood meter 데이터) |
| 3 | [work-split-2026-10-09.ko.md](../work-split-2026-10-09.ko.md) | 누가 무엇을, 충돌 막는 규칙 §4 |
| 4 | **이 문서** | 내 작업 목록 Q.0~Q.10 |
| 5 | [test-guide.ko.md](../test-guide.ko.md) §2 · §3 · §4 | 기능 상태표, 시나리오(ID · 기대 결과), 알려진 제약 |
| 6 | [test-run.ko.md](../test-run.ko.md) | 손 테스트 시작점 · 데모 리셋 상태(`empty` · `pets` · `confirmed` · `ready` · `in_care`) |
| 7 | [feedback-2026-10-08.ko.md](../feedback-2026-10-08.ko.md) | 피드백을 쓰는 형식 (FB-1~29 예시) |
| 8 | [review-2026-10-08.ko.md](../review-2026-10-08.ko.md) §5 · §6 | 내가 맡을 M · L 항목 상세 (현상 → 원인 → 수정 → 테스트) |
| 필요할 때 | [P0-ai-prompt-playbook.ko.md](../P0-ai-prompt-playbook.ko.md) · [README.ko.md](../README.ko.md) §8 (익명화) · [DESIGN.md](../../../DESIGN.md) | 프롬프트 · 익명화 규칙 · UI 토큰 |

### 0.2 환경 (Q.0)

**손 테스트는 설치 없이 Vercel에서** — `main`이 머지될 때마다 자동 배포되는 **https://goldito-petcare.vercel.app** 에서 합니다 (2026-10-09 결정, [test-run.ko.md](../test-run.ko.md) §0). 결과(✅)도 Vercel(main) 기준으로만 적습니다.

1. https://goldito-petcare.vercel.app → 로그인 화면 **Try demo** → **Demo owner**(Robert) / **Demo sitter**(Chloe).
2. 두 계정 동시에: 크롬 일반 창 + 시크릿 창에 각각 같은 주소.
3. 업로드 · AI · 데모 리셋은 Render에 배포된 백엔드로 Vercel에서 다 됩니다 (U0, 2026-10-09). 무료 플랜이라 **15분 동안 아무도 안 쓰면 잠들고, 첫 요청이 30~50초** 걸립니다 — 고장이 아닙니다.
4. 상태 되돌리기: 앱의 Profile → **Demo tools**(테스트 기간에만 켜 둠) → `empty` · `pets` · `confirmed` · `ready` · `in_care` 중 선택. (`011i`가 호스팅 DB에 적용되기 전에는 `in_care` 직후 3분 동안 체크인이 막힙니다 — CW-1.)
5. **코드를 고칠 때만(Q.2부터) 로컬 환경:** 저장소 받기 → `main`에서 작은 브랜치(아래 §3). `backend/.env`, `frontend/.env`는 **민식에게 따로(메신저 · 비밀번호 관리자) 받는다** — 절대 커밋 · 채팅 공개 금지, 형식은 각 `.env.example`. 백엔드 `cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt ruff` (Windows는 `.venv\Scripts\python`) → `uvicorn app.main:app --port 8000`, 프론트 `cd frontend && npm ci && npx expo start --web --port 8081` → `http://localhost:8081`. 로컬은 고치는 중 확인용이고, PR이 머지된 뒤 Vercel에서 다시 확인해 기록합니다.
6. 코딩 에이전트(Claude Code · Cursor)를 쓰면 시작할 때 항상: *"Read CLAUDE.md, docs/plan/TODO.md (Seulgi's Current focus), docs/plan/phases/phase-q.md. Work only on that task."*

---

## Goal

심사위원이 데모 경로(문의 → 만남 → 예약 → 돌봄 · 이동 → 완료)를 마우스로 따라갈 때 **실제 펫시터가 쓰는 앱처럼** 느껴지게 한다: 흐름이 매끄럽고, 문구가 실무 표현이고, AI 답장 · 알림장이 **진짜 시터의 말투**이며, 틀린 숫자 · 개인정보가 새지 않는다. 그리고 그것을 **사람이 직접 확인한 기록**(test-guide ✅)으로 남긴다.

### Goal 달성 기준 (10/29까지)

- [ ] test-guide §3의 데모 경로 시나리오(FLOW · REPORT · CAP · INQ · DONE)를 사람이 한 번씩 돌리고 상태 칸에 **✅ (날짜, 슬기)** 또는 FB 번호
- [ ] 07 · 07B · 09 · 07C의 phase DoD를 손으로 확인 (지금 "code complete, DoD pending")
- [ ] 문의 답장과 알림장이 **익명화된 실제 기록에서 온 말투**로 나옴 (같은 질문으로 전/후 예시 3개씩 기록)
- [ ] AI 답장 · 알림장이 **RAG 근거 우선** — 데이터베이스에 근거가 있으면 근거대로, 없으면 지어내지 않고 시터 확인으로 (Q.4b 전/후 예시 기록)
- [ ] 리뷰 프리셋 · 알림장 칩 · 체크인 선택지 문구를 시터 실무 표현으로 검수 · 수정
- [ ] R3 Medium 중 아래 Q.5 · Q.6 범위 완료 (또는 "안 함 + 이유" 기록)
- [ ] 원본 데이터가 리포 · 프롬프트 · 영상 어디에도 없음 (익명화 샘플만)

---

## 1. 작업 목록 (순서대로 — TODO의 "Current focus (Seulgi)"에 하나씩)

| # | 작업 | 출력물 | 완료 기준 | 예상 |
| :--- | :--- | :--- | :--- | :--- |
| **Q.0** | 환경 · 계정 (§0.2) | Vercel에서 두 계정이 동시에 열림 | https://goldito-petcare.vercel.app 에서 오너 · 시터 데모 로그인(일반 창 + 시크릿 창), Demo tools로 원하는 상태로 리셋 1회. 로컬 환경은 Q.2 전까지만 준비하면 됨 | 0.5일 |
| **Q.1** | **전체 손 테스트 + 시터 관점 피드백** — 데모 경로를 처음부터: 문의(INQ) → Meet & Greet → 예약 · 체크아웃(FLOW) → Received · 체크인 · 사진 · 알림장(REPORT · CAP) → Returned · 리뷰 · Life Record(DONE). 특히 새 기능 REPORT-11 · 12, FLOW-15~23 | test-guide 상태 칸 갱신, `feedback-2026-10-08.ko.md`에 **FB-40~** (본 것 · 실무에서는 · 생각 · 급함 여부) | 시나리오마다 ✅ 또는 FB 번호. 급한 FB는 민식에게 바로 알림 | 1.5일 |
| **Q.2** | **문구 · 프리셋 검수 (실무 표현)** — ① 리뷰 프리셋 `frontend/features/completion/reviewPresets.ts` (오너 → 시터 · 시터 → 오너, 별마다 3개) ② 알림장 기록 칩 문구 `backend/app/ai/report_chips.py` (`MEAL` · `POTTY` · `MOOD`) ③ 체크인 선택지 `frontend/features/care/checkinOptions.ts` ④ 화면 안내 문구(빈 화면 · 버튼). 알림 제목은 SQL 함수 안에 있으니 **목록만** 피드백으로 | 코드 수정 PR (`fix/q-wording`) | 영어(D1) 유지, 관련 e2e · pytest 통과(문구를 고치면 테스트 기대값도) | 1일 |
| **Q.3** | **익명화** (기존 담당) — 3년치 대화 · 알림장 → 이름 · 연락처 · 주소 · 위치 · 실견명 치환, 말투 유지 → train / validation / hold-out JSONL. `{PRICE}` · `{DATE}` 자리표시자 규칙. Nebius **zero-retention** 사용 여부와 제3자 처리 고지 결정 | 익명화 규칙 문서(`docs/plan/anonymization.ko.md`), JSONL은 **리포 밖** 또는 gitignore된 `data/` | 샘플 20개를 민식이 무작위로 봐서 개인정보 0. full-process §9 #5 · #8 답 기록 | 2일 |
| **Q.4** | **말투 데이터 넣기** — ① 문의: 데모 시터 Chloe의 스타일 카드 + 예시 답장 5~10개를 익명화 기록에서 골라 `backend/app/ai/prompts/tone/demo_sitters.json` → `scripts/seed_tone.py` (dry run → `--apply`) ② **알림장:** `backend/app/ai/prompts/daily_report/few_shot.json` 예시를 실제 알림장(익명화) 스타일로, 필요하면 `tone_samples` `kind='report'` 샘플 ③ **자동 발송 지연 공식 · 메시지 분할** (7B.10, `backend/app/ai/inquiry.py` `human_delay`) — **R1b 머지 뒤** | PR (`data/tone-samples`) + `docs/plan/phases/notes/tone-before-after.ko.md`(같은 질문 3개 · 같은 하루 3개의 전/후) | 문의 · 알림장 전/후 예시가 "슬기다운" 말투, pytest 통과, 프롬프트에 원본 데이터 없음 | 2일 |
| **Q.4b** | **프롬프트 엔지니어링 + RAG 우선 답변** — AI가 만드는 **대화**(문의 답장)와 **문장**(알림장 · 캡션 · Life Record · 케어 체크리스트)이 매끄럽고 시터답게 나오게 한다. 원칙: **답은 먼저 데이터베이스(RAG)에서 만들고, 거기 없는 내용만 AI가 쓴다.** ① **RAG 우선 (문의):** 지금 `backend/app/services/rag.py`의 `search`는 유사도 기준 없이 가장 가까운 5개를 그대로 모델에 넘긴다 → **유사도 기준값**을 정해, 기준 이상으로 맞는 근거(시터 정책 · 지난 문의 답 · Life Record · 케어 요청서)가 있으면 **그 내용을 바탕으로** 답하고(시터 말투로 다듬기만), 근거가 없으면 모델이 쓰되 사실(가격 · 날짜 · 가능 여부 · 펫 정보)은 지어내지 않고 "확인해서 알려 드릴게요"로 시터 확인(`needs_sitter`)으로 보낸다. 어떤 근거를 썼는지 출처 칩은 유지 ② **프롬프트 다듬기:** `backend/app/ai/prompts/**`(system · few-shot) — 문장 길이, 이모지, 같은 표현 반복, 어색한 연결, 질문에 없는 말 덧붙이기를 고친다. Q.4 말투 데이터와 같이 본다 ③ **바꾸지 않는 것:** 서버가 정하는 사실(D29 가격 · 날짜 · 가능 여부, D31 출입 정보는 프롬프트에 안 넣음), 시터 승인(D36) | ② 프롬프트 PR (`data/prompt-tuning`) — **언제든 가능** → ① RAG 우선 코드 PR (`fix/q-rag-first`) — **R1b 머지 뒤** (`inquiry.py` · `routers/ai_inquiry.py`는 그때까지 민식 작업 중) + `notes/prompt-before-after.ko.md` (같은 질문 5개 — RAG에 답이 있는 것 3 · 없는 것 2 — 와 알림장 하루 2개의 전/후) | 근거가 있는 질문은 근거와 같은 내용으로 답하고, 없는 질문은 사실을 지어내지 않고 시터 확인으로 감 (pytest: 기준 이상 · 이하 두 경우), 문장이 자연스럽다는 전/후 예시, 기존 pytest · ruff 통과 | 2~3일 |
| **Q.5** | **R3 Medium — 알림장 · 캡션 · Life Record · 시드** ([review §5](../review-2026-10-08.ko.md)). 먼저: **M-14**(기록 칩을 끄면 오너 체크리스트에서 놓친 약이 숨음) · **M-20**(메모 속 번호 · 코드가 Life Record에 — D31) · **M-16**(보낸 알림장이 초안으로 — `011f` 뒤 다시 확인). 그다음 M-13 · M-15 · M-17 · M-18 · M-19 · M-21 · M-22 · M-23 · M-24 (M-12는 완료) | 항목마다 커밋 하나, 브랜치 `fix/q-review-medium` | review 문서의 "테스트" 칸대로 pytest / Playwright 추가, 항목 제목에 ✅ | 3~4일 |
| **Q.6** | **R3 Medium — 문의 AI M-1~M-11** (**R1b `fix/review-inquiry` 머지 뒤** — 같은 파일). 특히 M-4(말투 예시에 다른 오너의 글 · 연락처가 섞임 — 익명화와 같은 일) | 같은 방식 | 같은 방식 | 3일 |
| **Q.7** | **평가 (키 필요)** — `scripts/measure_inquiry.py` 기본 경로 재측정(M-1), `scripts/measure_caption.py`로 말투 카드 유무 비교(M-19), Life Record 환각 테스트 3회(07C DoD) | `phases/notes/model-ids.md` 표 갱신 | 수치 · 날짜 · 결론 한 줄 | 1일 |
| **Q.8** | **최종 QA (10/27~29)** — 배포 URL에서 데모 경로 전체, 두 계정, **마우스만**(데스크톱 폰 프레임) + 폰 너비 + **실제 폰 카메라**(Take photo / Choose from library, Vercel 주소에서) | test-guide ✅, 남은 FB | 데모 영상 경로가 막힘 없이 끝남 | 1일 |
| Q.9 | (여유) **R4 Low** L-1~L-6 묶음, FB-1 · FB-3 · FB-4 | 묶음마다 커밋 | review §6 | 여유 |
| Q.10 | (P2, 여유) **11.7 SFT 보여주기** — 앱 런타임에는 안 씀(D43) | [phase-11.md](phase-11.md) 11.7 | | 여유 |

> 순서를 바꾸고 싶으면 민식과 먼저 얘기한다(특히 Q.6은 R1b 머지 전에는 시작하지 않음).

---

## 2. 범위

| 포함 | 제외 (민식) |
| :--- | :--- |
| 손 테스트 · 피드백 · 문구 · 프리셋 | 문의 AI 안전 RV-1~RV-5 (R1b) |
| 익명화 · 말투 · few-shot · 지연 공식 | 예약 흐름 R2 (FB-2 · 5 · 6 · 8 · 9) |
| R3 Medium (M-1~M-24, M-12 완료), R4 Low | 06B Pet Transit · 08 · 10 배포 · 고정 데모 계정 |
| 평가 · 측정 | 호스팅 DB 마이그레이션 적용 · OAuth |

---

## 3. 규칙 (요약 — 전체는 [work-split §4](../work-split-2026-10-09.ko.md#4-같이-일하는-규칙-충돌-막기))

1. **브랜치 · 커밋 · PR:** CLAUDE.md §4. 브랜치 `qa/…` · `fix/q-…` · `data/…` · `docs/…` (`claude/` · `cursor/` 같은 도구 접두어 금지), 작업 하나 = 커밋 하나, 영어 한 줄 conventional commit, **AI 표기 금지**. 묶음마다 draft PR → 끝나면 ready, 머지는 민식과 확인 후.
2. **민식이 바꾸는 중인 파일은 건드리지 않는다** (work-split §4 표). 프롬프트 파일(`backend/app/ai/prompts/**`)은 언제든 가능.
3. **마이그레이션:** 슬기는 `011m`~`011z`. 이미 적용된 파일은 절대 수정하지 않는다. 새 RPC는 `security definer` + `set search_path = public` + `auth.uid()` 검사 + `revoke … from public, anon`, `supabase/tests/rls_smoke.sql`에 체크 추가.
4. **테스트:** 백엔드 `pytest -q` + `ruff check .`, 프론트 `npx tsc --noEmit` + 해당 Playwright spec. CI가 초록이어야 PR ready.
5. **매 작업 끝 (CLAUDE.md §5):** TODO의 내 Current focus 줄 삭제(완료 기록은 커밋 · PR · test-guide), 다음 Q 항목을 Current focus로, test-guide 갱신. **✅는 사람이 실제로 해 본 것만.**
6. **데이터:** 원본은 리포 · 프롬프트 · 영상 · 스크린샷에 넣지 않는다. 익명화 샘플만 커밋. 실제 사람 · 장소 이름이 보이면 바로 멈추고 민식에게.
7. **급한 문제를 찾으면:** 데모 경로가 막히거나 틀린 약속을 하는 것 → FB에 "급함"으로 적고 민식에게 바로 알린다(민식 큐로 감).
