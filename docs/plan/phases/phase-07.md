# Phase 07 — 알림장 AI (Daily Report)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D1 영어, **D34 5초 체크**, AI 규칙 §9, API 계약 §5
> **말투 레이어 (D35 · D38):** 알림장 본문은 `tone.compose()`(07B 7B.8)를 거쳐 시터 1인칭 말투로 쓴다. 입력은 **AI가 하루 기록·사진에서 제안하고 시터가 고른 칩 + 시터의 짧은 메모(선택) + 사진 묘사** (시터 글쓰기 거의 제로 — 사진 분석은 부족하거나 틀릴 수 있어 메모 칸을 둠). 알림장은 시터가 미리보기를 승인(Send)하는 즉시 게시되며 사람 속도 지연은 없다 (D37).
> 제품 흐름: [full-process.ko.md](../full-process.ko.md) Stage 4-3·4-4 — 시터 5초 체크 + 사진 2장 → AI 스마트 알림장

## Goal

하루의 **피드 캡션 + 완료/누락 task + `care_checkins`(식사·배변·산책·기분·note) + Report 화면 5초 체크(AI 칩 제안 중 시터가 고른 칩 + 짧은 메모(선택) + 사진 ≤ 2 — D38)**만을 근거로 Nemotron **Super**가 **따뜻한 영어 알림장 초안**을 만들고, 펫시터는 **미리보기를 승인(Send)**해야 게시되고, 견주는 **읽기 전용**으로 받는다. 사진은 Vision(`MODEL_VISION`)이 먼저 한 줄 묘사 + 에피소드 칩 1–2개로 바꾼다 (7.7 `/api/ai/report-chips`). (Plan B: [sitter-care-loop.ko.md](../sitter-care-loop.ko.md))

> 목표 문장 예 (시나리오 4-4, 영어): *"Max took the skin pill you left, tucked inside her treat, and finished every bit of her kibble! On our 20-minute morning walk she spotted a squirrel in the park and got so excited — it was adorable. Her potty was perfectly healthy, too. 🐶"*

### Goal 달성 기준

- [ ] `POST /api/ai/daily-report` → `daily_reports` status=draft (같은 날 재생성 시 덮어쓰기)
- [ ] Sitter: Report 화면에서 사진 2장(그중 1장 = 공원에서 다람쥐를 보는 Max, 샘플 `walk_squirrel`) → **칩 제안** — 하루 기록에서 ☑ Meal: All · ☑ Potty: 1× normal · ☑ Walk: 20 min · ☑ Meds: done(task), 사진에서 "🐿️ Watching a squirrel" · "🌳 Park walk" → 틀린 칩 1개 끄기 → 짧은 메모(선택) "She got so excited" → **Generate** → 시터 말투 미리보기 → **Send**(승인 = 게시) → status=sent + owner `report_sent` 알림
- [ ] 칩 제안이 틀려도(예: 공원 사진을 nap으로 봄) 시터가 끄면 알림장에 안 들어감 · 사진 0장·메모 없이도 하루 기록 칩만으로 생성 · 승인 전에는 견주에게 안 보임
- [ ] Owner: **Diary** 탭에서 날짜별 알림장 목록 + 본문 + 그날 사진 스트립 (구 Reports, D47)
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
| 칩 제안(7.7 `/api/ai/report-chips`) + 고른 칩·짧은 메모 입력 (`daily_reports.inputs`) | 자동 생성 스케줄 (stretch 7.6) |
| `009_reports.sql` (`send_daily_report` RPC) | 원본 raw 데이터 |
| 5초 체크 사진 ≤ 2 → Vision 한 줄 묘사 + 에피소드 칩 (`photos` snapshot) | 사진 3장 이상, 영상 |

---

## 작업 상세

| ID | 작업 | 담당 | 상세 |
| :--- | :--- | :--- | :--- |
| 7.1 | Nebius client + test script | 슬기 | architecture §9 규칙대로 `chat()`, `chat_json()`. `scripts/test_nebius.py`: 4개 role 각각 "Say hi in one sentence" + vision role에 샘플 이미지 1장 → model·latency 출력. `response_format` 지원 여부·reasoning 토글 방식 확인해 코드 주석 + `notes/model-ids.md`에 기록. **호출 지표 로그**(architecture §9: TTFT·전체 지연·토큰 수)를 `nebius.py`에 포함하고, 테스트 스크립트가 role별 5회 호출해 **TTFT/지연 중앙값 표**를 `notes/model-ids.md`에 남김 (README 피드백 근거). **Phase 01 끝나면 바로 시작 가능** |
| 7.2 | daily-report API | 슬기·민식 | 아래 "집계 → 프롬프트 → 저장" |
| 7.3 | Sitter ReportScreen + Owner ReportView | 민식 | 아래 "화면" |
| 7.4 | Few-shot + PROMPT.md | 슬기 | `app/ai/prompts/daily_report/few_shot.json` — 3편 (그 시터의 `tone_samples`가 아직 없을 때 쓰는 기본 예시, D35), 각 `{input: <source_snapshot 형식>, output: "<report>"}`, **영어**(원본 그대로), 가명 "Max" 등, PII 0. `PROMPT.md`에 톤·구조 규칙만 기록 |
| 7.5 | send RPC | 민식 | `009_reports.sql`: `send_daily_report(p_report uuid, p_body text)` — 작성한 시터 본인(`sitter_id = auth.uid()`), status draft 확인, body 갱신(편집 반영), `status='sent', sent_at=now()`, owner 알림 `report_sent` |
| 7.6 | (Stretch) 자동 초안 | 민식 | 18:00에 Nebius Serverless Job이 draft 생성 + sitter에게 "Your report draft is ready" |
| 7.7 | 칩 제안 `POST /api/ai/report-chips` (D38) | 슬기·민식 | 서버가 그날 check-in·task로 기본 칩을 만들고(모델 없음, 이미 check-in한 값은 그대로), 사진(≤ 2)은 `MODEL_VISION` + `prompts/report_chips/system.md`가 `{description, chips:[≤ 2 짧은 문구]}` (보이는 것만, 의학 판단 금지). 그날 피드 사진의 09 캡션도 칩 후보로. 응답 `{chips:[{id, kind, label, source, media_id?}], photos:[{media_id, description}]}` — 사진 묘사는 draft `inputs`에 저장해 7.2가 재사용(중복 호출 없음). 사진 칩이 20 s 안에 안 오면 하루 기록 칩만. 화면은 칩을 켜고 끄는 토글 + 하루 기록 칩 값 수정 |

### 7.2 집계 → 프롬프트 → 저장

1. `assert_on_duty_for(pet_id)` (오늘 이 pet의 칸을 맡음). 집계 범위 = **그날 중 이 시터가 맡은 시간** (맡긴 시각 ~ 찾는 시각과 그날의 교집합 — 09:00–12:00만 맡았으면 그 사이의 task·사진만). 오전 Lucy·오후 Paul이면 각자 자기 알림장 1개 (phase-02 `unique(pet_id, report_date, sitter_id)`).
2. 기존 report가 `sent`면 **409** `report_already_sent`.
3. `source_snapshot` 생성 (이 JSON이 **모델 입력의 전부** — `chips`는 시터가 켜 둔 칩만, `sitter_note`는 짧은 메모이고 없으면 null):
   ```json
   {
     "pet": {"species": "dog", "name": "Max", "breed": "Maltese", "age_years": 4},
     "date": "2026-10-15",
     "tasks": [{"type": "medication", "title": "Heartworm pill", "due": "08:00", "status": "done", "completed_at": "08:04"},
               {"type": "walk", "title": "Walk", "due": "10:30", "status": "done", "completed_at": "10:52"}],
     "photos": [{"time": "10:55", "caption": "Max sniffing autumn leaves with a wagging tail", "source": "feed"},
                {"time": "17:40", "caption": "Max looking up at a squirrel on a tree", "source": "report"}],
     "checkins": [{"time": "08:15", "kind": "meal", "value": "all", "has_photo": false},
                  {"time": "11:02", "kind": "potty", "value": "normal", "has_photo": false},
                  {"time": "14:30", "kind": "mood", "value": "happy", "has_photo": false},
                  {"time": "15:10", "kind": "note", "note_text": "Met a golden retriever at the park", "has_photo": true}],
     "checks": {"meal": "all", "potty": "normal", "walk_minutes": 20, "mood": "happy", "meds": "done"},
     "chips": ["Watching a squirrel", "Park walk"],
     "sitter_note": "She got so excited"
   }
   ```
4. 메시지: system(`system.md`) + `tone.compose()`(7B.8, D35)가 주는 시터 스타일 카드 + 같은 시터의 과거 알림장 top-k(few-shot — `tone_samples`가 없으면 `few_shot.json` 3쌍: user=input JSON, assistant=output) + user(source_snapshot). Reasoning off, `max_tokens` 400, temperature 0.7.
5. 후처리: `<think>` 제거, 120–220 단어 목표(넘으면 그대로 두되 로그).
6. `daily_reports` upsert on (pet_id, report_date, sitter_id): body, inputs, source_snapshot, model, status draft, updated_at.
7. 응답 `{report_id, body, status, model, latency_ms}`.

### 프롬프트 규칙 (`system.md`, 영어)

- Role: write as the sitter, in first person ("I", "we"), warm and detail-oriented — the style card and examples from `tone.compose()` set the voice (D35).
- Address the pet by name; friendly emojis OK (≤ 4); no robotic lists ("Walk completed: 40 min" ❌).
- One sentence describing expression/behavior from photo captions.
- Mention meal/water/potty/walk/mood/meds **only if present in `checks`**. Use the chips the sitter kept and the sitter's short note (if any) as the day's facts and episode; photo descriptions add detail. Never mention a chip the sitter turned off (D38).
- **Use only facts in the input JSON. If something isn't there, don't mention it.** Missed tasks: state gently and honestly ("We missed the 10:30 walk today…").
- No medical diagnosis or advice.

### 화면

| 화면 | Route | 내용 |
| :--- | :--- | :--- |
| Sitter Diary (evening note) | `/sitter/diary` | ① 오늘 요약 ② Add photos ≤ 2 ③ Suggested chips (7.7) ④ 짧은 메모 ⑤ Generate → preview ⑥ **Send to {owner}** (구 `/sitter/report`, D47b) |
| Owner Diary | `/owner/diary` | Live + 히스토리; 알림장 카드(첫 문장 미리보기). empty: "When a stay is on, updates show up here live." |
| Owner Diary entry | `/owner/diary/[entryId]` | 날짜, 본문, 사진 스트립, task 체크리스트 (구 `/owner/reports/[reportId]`) |

---

## Definition of Done (DoD)

1. `python scripts/test_nebius.py` 4개 role Green
2. Token Factory 호출이 **backend에서만** (프론트 번들에 `NEBIUS` 문자열 없음: `grep -r NEBIUS frontend/` 결과 없음)
3. 환각 테스트: (a) 산책 미완료 날 → report에 산책 완료 언급 없음 (b) checks 비움 → 식사·배변 언급 없음 (c) 사진 0장 → 사진 묘사 없음
4. `pytest`: sent report 재생성 409, 비담당 sitter 403, source_snapshot 조립 단위 테스트
5. README Nebius 섹션에 "daily report uses Super" 1줄 (Phase 10에서 확장)
6. 칩 제안(7.7): 사진 2장 → 칩 2–4개, 끈 칩 내용은 알림장에 없음, 메모가 비어도 생성, 승인(Send) 전에는 견주에게 안 보임

---

## 산출물

- `backend/app/services/nebius.py`, `backend/scripts/test_nebius.py`
- `backend/app/routers/ai_daily_report.py`, `backend/app/schemas/daily_report.py`, `backend/app/routers/ai_report_chips.py`, `backend/app/ai/prompts/report_chips/system.md`, `frontend/components/ChipSuggestions.tsx` (7.7)
- `backend/app/ai/prompts/daily_report/{system.md, few_shot.json, PROMPT.md}`
- `frontend/app/sitter/diary.tsx` (evening note), `frontend/app/owner/diary.tsx` (+ `[entryId]`)
- `supabase/migrations/009_reports.sql`

---

## AI 프롬프트

Playbook §9 — 7.1 / 7.2 / 7.3+7.5 / 7.4(슬기) 분리

---

## 다음 Phase

→ [Phase 07B — 문의 AI](phase-07b.md) · [Phase 09 — 캡션·앨범](phase-09.md) (둘 다 7.1 후 시작 가능) → [Phase 07C — 완료](phase-07c.md). [Phase 08 — 세이프티](phase-08.md)는 시나리오 코어 뒤 stretch (D27)
