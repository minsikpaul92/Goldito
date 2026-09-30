# Phase 08 — 간식 세이프티 가드 (Safety)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D12–D13, AI 규칙 §9, UX 규칙 §8-4

## Goal

새 간식 **성분표 사진**을 찍으면 Vision(`MODEL_VISION`)이 성분을 읽고, **Ultra**(`MODEL_SAFETY`)가 **등록 알레르기 + 숨은 성분 + 그 종(강아지·고양이)에게 독성인 성분**까지 판단해 **DANGER/WARNING/SAFE** JSON을 반환한다. DANGER는 **확인해야만 닫히는 빨간 모달**과 **견주 알림**으로 이어진다.

### Goal 달성 기준

- [ ] `POST /api/ai/safety-check {pet_id, media_id}` → pydantic-valid JSON
- [ ] 알레르기 매칭(예: chicken ← "hydrolyzed poultry protein") 시 `DANGER` + 영어 `warning_message`
- [ ] Sitter Scan 탭 + 결과 모달 (DANGER는 "I understand — don't feed" 전 닫기 불가)
- [ ] `safety_checks` 저장 + DANGER 시 owner `safety_danger` 알림

---

## 선행 조건

- [Phase 07.1](phase-07.md) Nebius client (`chat_json`)
- [Phase 04](phase-04.md) `uploadMedia({purpose:'safety_label'})`, `fetch_as_data_url`
- Bori `pet_allergies = chicken` (Phase 03.5)

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| 2-step: vision extract → reasoning | - |
| **8.7 (stretch) Tavily 웹 근거** — 8.1–8.6 DoD 후 바로 | - |
| JSON schema + 1 retry | 바코드 스캔 |
| 트리거 `notify_safety_danger` (`007_safety.sql`) | 자동 구매 차단 |
| 스캔 기록 목록 (최근 10개) | owner 측 스캔 기능 |

---

## 파이프라인

```
Sitter picks label photo → uploadMedia(safety_label) → media_id
POST /api/ai/safety-check {pet_id, media_id}
  1. assert_on_duty_for → load pet(species, name, breed, weight) + allergens
  2. fetch_as_data_url(media)                          (D12)
  3. Vision (MODEL_VISION, 30s): → VisionResult {readable, product_name?, ingredients[]}
       readable=false or ingredients=[] → 422 "label_unreadable" → UI "Couldn't read the label. Try a closer, well-lit photo."
  4. Reasoning (MODEL_SAFETY, reasoning ON, 60s): input = {pet, allergens, ingredients} → SafetyResult
  4b. (8.7 stretch) WARNING 또는 unknown_ingredients 있으면 → Tavily search (8s 총 제한) → 결과 요약을 넣어 Ultra 재판단 → result_json.sources[]. 실패·타임아웃이면 4의 결과 그대로
  5. Server-side override: if any allergen string-matches an ingredient (case-insensitive substring) and model said SAFE → force DANGER (defense in depth)
  6. insert safety_checks (result_json, models) → trigger notifies owner on DANGER
  7. return SafetyResult + safety_check_id + model + latency_ms
```

### JSON Schema (pydantic — `schemas/safety.py`)

| 필드 | 타입 | 규칙 |
| :--- | :--- | :--- |
| `safety_status` | `"DANGER" \| "WARNING" \| "SAFE"` | 필수 |
| `matched_allergens` | `list[str]` | 등록 알레르기 중 걸린 것 (DANGER면 ≥1 또는 toxic 성분 존재) |
| `detected_ingredients` | `list[str]` | vision 결과 정규화 |
| `hidden_sources` | `list[{ingredient, may_contain, reason}]` | 예: `{"animal fat", "chicken", "often poultry-derived"}` |
| `toxic_ingredients` | `list[str]` | **종별 목록 (D23)** — 공통: onion, garlic, chocolate/cocoa, caffeine, alcohol, grapes/raisins, xylitol · 강아지 추가: macadamia · 고양이 추가: lilies(백합), essential oils(tea tree 등), propylene glycol, raw yeast dough. 목록은 `reasoning_system.md`에 species별 표로 두고, 입력의 `pet.species`로 해당 표를 적용 |
| `unknown_ingredients` | `list[str]` | 판단 불가 성분 (8.7 Tavily 입력) |
| `sources` | `list[{title, url, domain}]` | 8.7에서만 채움, 기본 `[]` (스키마 변경 없음 — `result_json` 안) |
| `warning_message` | `str` | 영어 1–2문장, pet 이름 포함 |

### 판정 기준 (reasoning_system.md에 명시)

| 상태 | 조건 |
| :--- | :--- |
| **DANGER** | 등록 알레르기 직접 포함 · 보편 독성 성분 포함 |
| **WARNING** | 숨은 출처 가능성(animal fat, meat meal, natural flavor, hydrolyzed protein 등) · unknown 성분 존재 · 품종/체중 대비 주의(예: 고지방) · **다른 종 전용 제품**(고양이에게 dog treat, 강아지에게 cat food) |
| **SAFE** | 위 해당 없음 |

---

## 작업 상세

| ID | 작업 | DoD |
| :--- | :--- | :--- |
| 8.1 | Router + pydantic models (`VisionResult`, `SafetyResult`) | invalid JSON → retry x1 → 502 `ai_invalid_output` |
| 8.2 | Vision step + `prompts/safety/vision_system.md` | 영어·다국어 라벨 모두 영어 성분명으로 정규화 |
| 8.3 | Reasoning step + `prompts/safety/reasoning_system.md` (hidden allergen 예시 표, toxic 목록) + 서버 override (step 5) | 샘플 3종 기대 결과 일치 |
| 8.4 | TreatScannerScreen `/(sitter)/scan` | 큰 **Scan a treat label** 버튼 → 업로드 → 2단계 진행 표시 "Reading label…" → "Checking for Bori…" → 결과 모달. 에러·재촬영. 하단 최근 스캔 10개 |
| 8.5 | 결과 모달 `components/ui/AlertModal` | DANGER: 빨간 전체 화면, ⚠️ 아이콘, warning_message, matched·toxic 칩, 버튼 "I understand — don't feed" → `acknowledged_at` update. WARNING: 주황, hidden_sources 설명, "Ask owner first" 안내. SAFE: 초록, "Looks safe for Bori ✅" |
| 8.6 | Notify owner | `007_safety.sql`: `after insert on safety_checks when (new.safety_status='DANGER')` → owner `safety_danger`, title "Blocked a risky treat for {name} ⚠️" |
| 8.7 | **(Stretch) Tavily 웹 근거** — [tavily.ko.md](../tavily.ko.md) 검색 규칙 | `services/tavily.py`: 성분마다 키워드 쿼리 ≤ 3개(`"{ingredient} toxic {species}s"`, `"{ingredient} {allergen} derived"`) + 신뢰 도메인 필터, 제품명 있으면 리콜 쿼리 1회(`topic="news"`, 최근 1년). 결과 요약을 Ultra 재판단에 추가. 모달 WARNING/DANGER에 **Sources** (도메인 + 링크). `animal_fat_biscuit.jpg`로 Tavily 호출 로그 + 출처 1개 이상 = **Best Use of Tavily 요건(런타임 호출)** |

### 테스트 샘플 (`backend/tests/fixtures/labels/`, 직접 촬영 or 생성한 라벨 — 상표 가림)

| 파일 | 기대 |
| :--- | :--- |
| `chicken_jerky.jpg` | DANGER (chicken) |
| `animal_fat_biscuit.jpg` | WARNING (hidden: animal fat) |
| `sweet_potato_chew.jpg` | SAFE (Bori) |
| `lily_scented_cat_treat.jpg` | DANGER (Mochi — lilies, cat-toxic) |

---

## Definition of Done (DoD)

1. 데모용 **실제 간식 포장지** 1장으로 DANGER 재현 (스크린샷 또는 live)
2. README에 "Vision = {MODEL_VISION}, Reasoning = Nemotron 3 Ultra" 명시 (해커톤 규정)
3. SAFE / WARNING 케이스 각 1회 녹화용 확보
4. `pytest`: allergen override 단위 테스트 (모델이 SAFE 반환해도 chicken 포함 시 DANGER), 스키마 검증 테스트

---

## 산출물

- `backend/app/routers/ai_safety.py`, `backend/app/schemas/safety.py`, `backend/app/ai/prompts/safety/*`
- `frontend/app/(sitter)/scan.tsx`, `frontend/components/ui/AlertModal.tsx`
- `supabase/migrations/007_safety.sql`

---

## AI 프롬프트

Playbook §10 — (8.1–8.3) / (8.4–8.6)

---

## 다음 Phase

→ [Phase 09 — 캡션](phase-09.md) 또는 [Phase 10](phase-10.md) if caption done in parallel
