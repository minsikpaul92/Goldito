# Phase 07 — 알림장 AI (Daily Report)

## Goal

하루의 **피드 캡션 + 완료된 투약/산책**만을 근거로 Nemotron **Super**가 **따뜻한 알림장 초안**을 만들고, 펫시터는 **검토 후 한 번에 전송**, 견주는 **읽기 전용**으로 받는다.

### Goal 달성 기준

- [ ] `POST /api/ai/daily-report` → `daily_reports` status=draft
- [ ] Sitter: Generate → (선택 편집) → Send → status=sent + owner notification
- [ ] Owner: 해당 날짜 report 본문 표시
- [ ] **환각 방지:** 입력에 없는 산책/투약 내용이 report에 없음 (수동 테스트)

---

## 선행 조건

- [Phase 05–06](phase-05.md) 당일 feed + task_logs 데이터
- [Phase 00](phase-00.md) Nebius API key
- 슬기: [Phase 07.4] few-shot 익명화 샘플

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| `backend/app/services/nebius.py` (multi-region) | Tavily |
| Super model `nvidia/nemotron-3-super-120b-a12b` | 다국어 EN report (데모 언어 결정 전 KR) |
| Few-shot 3편 (git) | 원본 raw 데이터 |

---

## 작업 상세

| ID | 작업 | 담당 |
| :--- | :--- | :--- |
| 7.1 | Nebius client + test script | 슬기 |
| 7.2 | daily-report API: aggregate + prompt + save draft | 슬기·민식 |
| 7.3 | Sitter ReportScreen + Owner ReportView | 민식 |
| 7.4 | `prompts/daily_report/few_shot.json`, PROMPT.md | 슬기 |

### API 계약

```
POST /api/ai/daily-report
Body: { "dog_id": "uuid", "date": "2026-10-15" }
Response: { "report_id", "body", "status": "draft" }
```

### 프롬프트 규칙 (Goal 품질)

- 역할: 3년 경력 도그워커
- 기계적 보고 금지, 이모지·호칭 허용
- 사진/캡션에서 표정·행동 1문장
- **입력 JSON만** 근거 — 없으면 쓰지 않음

---

## Definition of Done (DoD)

1. `scripts/test_nebius.py` 또는 7.1 스크립트 Green
2. Token Factory 호출이 **backend에서만** (키 노출 없음)
3. README Nebius 섹션에 "daily report uses Super" 1줄 (Phase 10에서 확장)

---

## 산출물

- `backend/app/routers/ai_daily_report.py`
- `backend/app/ai/prompts/daily_report/*`

---

## AI 프롬프트

Playbook §9 — 7.1 / 7.2–7.3 / 7.4 분리

---

## 다음 Phase

→ [Phase 08 — 세이프티](phase-08.md) · 병렬 가능: [Phase 09](phase-09.md)는 7.1 후 시작 가능
