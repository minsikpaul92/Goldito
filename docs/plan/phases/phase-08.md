# Phase 08 — 간식 세이프티 가드 (Safety)

## Goal

새 간식 **성분표 사진**을 찍으면 Vision으로 성분을 읽고, **Ultra**가 견주 등록 **알레르기·숨은 성분**까지 판단해 **DANGER/WARNING/SAFE** JSON을 반환하고, 위험 시 **경고 모달**과 **견주 알림**까지 연결한다.

### Goal 달성 기준

- [ ] `POST /api/ai/safety-check` (multipart) → pydantic-valid JSON
- [ ] 알레르기 매칭 시 `safety_status: DANGER` + `warning_message` 한국어
- [ ] Sitter TreatScannerScreen + modal (DANGER는 확인 전 dismiss 제한)
- [ ] `safety_checks` 테이블 저장

---

## 선행 조건

- [Phase 07.1](phase-07.md) Nebius client
- `dog_allergies` seed (예: 닭고기)
- Vision model ID in env (`VISION_MODEL_ID`)

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| 2-step pipeline: vision extract → ultra reason | Tavily (P1 — Phase 08.6 stretch) |
| JSON schema + 1 retry | 바코드 스캔 |
| Owner notify on DANGER | 자동 구매 차단 |

---

## 파이프라인 (Goal 동작)

```
Image → [Vision: ingredient list text]
     → [Ultra: compare allergens + hidden sources]
     → JSON → DB → UI modal
```

### JSON Schema (필수 필드)

- `safety_status`, `matched_allergens`, `detected_ingredients`, `warning_message`
- optional: `unknown_ingredients` (Tavily 연동 시)

---

## 작업 상세

| ID | 작업 | DoD |
| :--- | :--- | :--- |
| 8.1 | Router + pydantic models | invalid JSON retry x1 |
| 8.2 | Vision step | env model id |
| 8.3 | Ultra step | system prompt: hidden allergen examples |
| 8.4 | TreatScannerScreen | loading, error states |
| 8.5 | Notify owner if DANGER | notification type `safety_danger` |
| 8.6 | (Stretch) Tavily unknown ingredient | Best Use of Tavily |

---

## Definition of Done (DoD)

1. 데모용 **실제 간식 포장지** 1장으로 재현 (스크린샷 또는 live)
2. 해커톤 규정: **NVIDIA Nemotron** Ultra + (가능하면 Omni) 사용 명시
3. SAFE 케이스도 1회 녹화용 확보

---

## 산출물

- `backend/app/routers/ai_safety.py`
- `frontend/.../TreatScannerScreen`

---

## AI 프롬프트

Playbook §10

---

## 다음 Phase

→ [Phase 09 — 캡션](phase-09.md) 또는 [Phase 10](phase-10.md) if caption done in parallel
