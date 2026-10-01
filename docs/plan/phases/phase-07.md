# Phase 07 — 알림장 AI (Daily Report)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D1 영어, **D34 5초 체크**, AI 규칙 §9, API 계약 §5
> 제품 흐름: [full-process.ko.md](../full-process.ko.md) Stage 4-3·4-4 — 시터 5초 체크 + 사진 2장 → AI 스마트 알림장

## Goal

하루의 **피드 캡션 + 완료/누락 task + `care_checkins`(식사·배변·산책·기분·note) + Report 화면 5초 체크(칩 + 사진 ≤ 2 + 메모 1줄)**만을 근거로 Nemotron **Super**가 **따뜻한 영어 알림장 초안**을 만들고, 펫시터는 **검토 후 한 번에 전송**, 견주는 **읽기 전용**으로 받는다. 5초 체크 사진은 Vision(`MODEL_VISION`)이 먼저 한 줄 묘사로 바꿔 snapshot에 넣는다. (Plan B: [sitter-care-loop.ko.md](../sitter-care-loop.ko.md))

> 목표 문장 예 (시나리오 4-4, 영어): *"Bori took the skin pill you left, tucked inside her treat, and finished every bit of her kibble! On our 20-minute morning walk she spotted a squirrel in the park and got so excited — it was adorable. Her potty was perfectly healthy, too. 🐶"*

### Goal 달성 기준

- [ ] `POST /api/ai/daily-report` → `daily_reports` status=draft (같은 날 재생성 시 덮어쓰기)
- [ ] Sitter: **5초 체크** — ☑ Meal: All · ☑ Potty: 1× normal · ☑ Walk: 20 min · ☑ Meds: done(task에서 자동) + 메모 "Saw a squirrel at the park — so excited" + 사진 2장 → **Generate** → (선택 편집) → **Send** → status=sent + owner `report_sent` 알림
- [ ] Owner: Reports 탭에서 날짜별 목록 + 본문 + 그날 사진 스트립
- [ ] **환각 방지:** `source_snapshot`에 없는 산책/투약/식사 내용이 report에 없음 (수동 테스트 3회)

---

## 선행 조건

- [Phase 05–06](phase-05.md) 당일 feed + task_logs
- [Phase 00](phase-00.md) 0.3 Nebius key + model ID
- 슬기: 7.4 few-shot (익명화 — 원본은 영어)

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| `services/nebius.py` (architecture §9 전부), `scripts/test_nebius.py` | Tavily |
| Super 모델 (`MODEL_REPORT`) | 다국어 (D1: EN만) |
| 퀵탭 입력 (`daily_reports.inputs`) | 자동 생성 스케줄 (stretch 7.6) |
| `009_reports.sql` (`send_daily_report` RPC) | 원본 raw 데이터 |
| 5초 체크 사진 ≤ 2 → Vision 한 줄 묘사 (`photos` snapshot) | 사진 3장 이상, 영상 |

---

## 작업 상세

| ID | 작업 | 담당 | 상세 |
| :--- | :--- | :--- | :--- |
| 7.1 | Nebius client + test script | 슬기 | architecture §9 규칙대로 `chat()`, `chat_json()`. `scripts/test_nebius.py`: 4개 role 각각 "Say hi in one sentence" + vision role에 샘플 이미지 1장 → model·latency 출력. `response_format` 지원 여부·reasoning 토글 방식 확인해 코드 주석 + `notes/model-ids.md`에 기록. **호출 지표 로그**(architecture §9: TTFT·전체 지연·토큰 수)를 `nebius.py`에 포함하고, 테스트 스크립트가 role별 5회 호출해 **TTFT/지연 중앙값 표**를 `notes/model-ids.md`에 남김 (README 피드백 근거). **Phase 01 끝나면 바로 시작 가능** |
| 7.2 | daily-report API | 슬기·민식 | 아래 "집계 → 프롬프트 → 저장" |
| 7.3 | Sitter ReportScreen + Owner ReportView | 민식 | 아래 "화면" |
| 7.4 | Few-shot + PROMPT.md | 슬기 | `app/ai/prompts/daily_report/few_shot.json` — 3편, 각 `{input: <source_snapshot 형식>, output: "<report>"}`, **영어**(원본 그대로), 가명 "Bori" 등, PII 0. `PROMPT.md`에 톤·구조 규칙만 기록 |
| 7.5 | send RPC | 민식 | `009_reports.sql`: `send_daily_report(p_report uuid, p_body text)` — 작성한 시터 본인(`sitter_id = auth.uid()`), status draft 확인, body 갱신(편집 반영), `status='sent', sent_at=now()`, owner 알림 `report_sent` |
| 7.6 | (Stretch) 자동 초안 | 민식 | 18:00에 Nebius Serverless Job이 draft 생성 + sitter에게 "Your report draft is ready" |

### 7.2 집계 → 프롬프트 → 저장

1. `assert_on_duty_for(pet_id)` (오늘 이 pet의 칸을 맡음). 집계 범위 = **그날 중 이 시터가 맡은 시간** (맡긴 시각 ~ 찾는 시각과 그날의 교집합 — 09:00–12:00만 맡았으면 그 사이의 task·사진만). 오전 Mina·오후 Jun이면 각자 자기 알림장 1개 (phase-02 `unique(pet_id, report_date, sitter_id)`).
2. 기존 report가 `sent`면 **409** `report_already_sent`.
3. `source_snapshot` 생성 (이 JSON이 **모델 입력의 전부**):
   ```json
   {
     "pet": {"species": "dog", "name": "Bori", "breed": "Maltese", "age_years": 4},
     "date": "2026-10-15",
     "tasks": [{"type": "medication", "title": "Heartworm pill", "due": "08:00", "status": "done", "completed_at": "08:04"},
               {"type": "walk", "title": "Walk", "due": "10:30", "status": "done", "completed_at": "10:52"}],
     "photos": [{"time": "10:55", "caption": "Bori sniffing autumn leaves with a wagging tail", "source": "feed"},
                {"time": "17:40", "caption": "Bori looking up at a squirrel on a tree", "source": "report"}],
     "checkins": [{"time": "08:15", "kind": "meal", "value": "all", "has_photo": false},
                  {"time": "11:02", "kind": "potty", "value": "normal", "has_photo": false},
                  {"time": "14:30", "kind": "mood", "value": "happy", "has_photo": false},
                  {"time": "15:10", "kind": "note", "note_text": "Met a golden retriever at the park", "has_photo": true}],
     "checks": {"meal": "all", "potty": "normal", "walk_minutes": 20, "mood": "happy", "meds": "done"},
     "sitter_note": "Saw a squirrel at the park — so excited"
   }
   ```
4. 메시지: system(`system.md`) + few-shot 3쌍(user=input JSON, assistant=output) + user(source_snapshot). Reasoning off, `max_tokens` 400, temperature 0.7.
5. 후처리: `<think>` 제거, 120–220 단어 목표(넘으면 그대로 두되 로그).
6. `daily_reports` upsert on (pet_id, report_date, sitter_id): body, inputs, source_snapshot, model, status draft, updated_at.
7. 응답 `{report_id, body, status, model, latency_ms}`.

### 프롬프트 규칙 (`system.md`, 영어)

- Role: warm, detail-oriented pet sitter with 3 years of experience writing to the owner.
- Address the pet by name; friendly emojis OK (≤ 4); no robotic lists ("Walk completed: 40 min" ❌).
- One sentence describing expression/behavior from photo captions.
- Mention meal/water/potty/walk/mood/meds **only if present in `checks`**. Use the sitter note as the day's episode, in your own warm words.
- **Use only facts in the input JSON. If something isn't there, don't mention it.** Missed tasks: state gently and honestly ("We missed the 10:30 walk today…").
- No medical diagnosis or advice.

### 화면

| 화면 | Route | 내용 |
| :--- | :--- | :--- |
| Sitter Report | `/sitter/report` | ① 오늘 요약(완료 task · check-in 수 · 사진) ② **5초 체크 칩** — Meal · Potty · Walk(분) · Mood (이미 check-in한 값은 readonly, Meds는 오늘 medication task 상태 자동) ③ (선택) 메모 1줄 ④ **Add photos** (≤ 2, `pickMedia` — purpose `report`) ⑤ **Generate report** → skeleton "Writing today's report…" → 본문 미리보기 (탭하면 편집 가능한 textarea) ⑤ **Send to {owner}** (주 액션) → 토스트 "Report sent 📝". 이미 sent면 읽기 전용 + "Sent at 18:02" |
| Owner Reports | `/owner/reports` | 날짜 역순 카드(첫 문장 미리보기). empty: "Your sitter's daily report will appear here each evening." |
| Owner Report 상세 | `/owner/reports/[reportId]` | 날짜, 본문, 그날 feed 사진 가로 스트립, 완료 task 체크리스트 (source_snapshot 기반) |

---

## Definition of Done (DoD)

1. `python scripts/test_nebius.py` 4개 role Green
2. Token Factory 호출이 **backend에서만** (프론트 번들에 `NEBIUS` 문자열 없음: `grep -r NEBIUS frontend/` 결과 없음)
3. 환각 테스트: (a) 산책 미완료 날 → report에 산책 완료 언급 없음 (b) checks 비움 → 식사·배변 언급 없음 (c) 사진 0장 → 사진 묘사 없음
4. `pytest`: sent report 재생성 409, 비담당 sitter 403, source_snapshot 조립 단위 테스트
5. README Nebius 섹션에 "daily report uses Super" 1줄 (Phase 10에서 확장)

---

## 산출물

- `backend/app/services/nebius.py`, `backend/scripts/test_nebius.py`
- `backend/app/routers/ai_daily_report.py`, `backend/app/schemas/daily_report.py`
- `backend/app/ai/prompts/daily_report/{system.md, few_shot.json, PROMPT.md}`
- `frontend/app/sitter/report.tsx`, `frontend/app/owner/reports/*`
- `supabase/migrations/009_reports.sql`

---

## AI 프롬프트

Playbook §9 — 7.1 / 7.2 / 7.3+7.5 / 7.4(슬기) 분리

---

## 다음 Phase

→ [Phase 07B — 문의 AI](phase-07b.md) · [Phase 09 — 캡션·앨범](phase-09.md) (둘 다 7.1 후 시작 가능) → [Phase 07C — 완료](phase-07c.md). [Phase 08 — 세이프티](phase-08.md)는 시나리오 코어 뒤 stretch (D27)
