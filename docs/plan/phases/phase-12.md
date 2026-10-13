# Phase 12 — Snap 탭 (Treat check · Mood · Sticker)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — **D61**(Snap 탭), D42(재미용 기분 — D61로 일부 변경), D12–D13, AI 규칙 §9, UX 규칙 §8-4 · [DESIGN.md](../../../DESIGN.md) §7.4(DANGER) · §7.7(마우스)
> **결정 (2026-10-13, 민식):** 다섯 번째 탭 `Mood`를 **`Snap`**으로 바꾸고, 펫이나 라벨을 찍어서 쓰는 도구 세 개를 넣는다. Phase 08(간식 세이프티 가드)은 이 Phase의 **12.1 Treat check**로 들어온다(08 설계를 그대로 쓰되 견주도 쓸 수 있게). 11.8(스티커) · 11.9(기분)도 여기로 당겨 온다. 11.15 펫 온보딩은 계획대로 10/24–27에 유지 → Snap은 **10/14–10/22** 안에 끝낸다.

## Goal

Owner와 Sitter 모두 **Snap** 탭에서 사진 한 장(또는 짧은 영상)으로:

1. **Treat check** — 간식 성분표를 찍으면 그 펫의 알레르기 · 종별 독성 성분과 대조해 **먹어도 되는지**(DANGER / WARNING / SAFE)와 근거(Tavily 출처)를 보여 준다. 맨 아래 작은 디스클레이머.
2. **Mood** — 펫 사진 · 영상을 넣거나 찍으면 **펫마다 박스**를 그리고 박스 옆에 **감정별 퍼센트**를 보여 준다(재미용).
3. **Sticker** — 펫 사진에서 **펫만 오려** 스티커로 만들고(아이폰 꾹 누르기처럼), 그 스티커로 **다이어리를 꾸민다**(견주 + 시터).

### Goal 달성 기준

- [ ] 탭 바: owner · sitter 모두 `Home · Bookings · Feed · Diary · Snap` (아이콘 카메라 계열), Snap 화면에 카드 3개
- [ ] Treat check: Max(chicken 알러지) + `chicken_jerky` 샘플 → **DANGER 빨간 모달**(확인 전 닫기 불가) + 출처 칩 + 견주 알림(시터가 검사했을 때)
- [ ] Mood: 개 2마리가 있는 사진 → 박스 2개 + 각 박스의 감정 % 표(합 100%) + "For fun only" 문구
- [ ] Mood: 짧은 영상 → 프레임 4장 평균 결과
- [ ] Sticker: 사진 → 펫만 오린 투명 PNG(흰 테두리) → 내 스티커함 → 다이어리 항목에 붙이기 · 옮기기 · 크기 · 회전(마우스만으로) → 상대방에게도 보임
- [ ] 런타임 AI 호출은 Token Factory(MiniCPM-V · Nemotron) + Tavily — 해커톤 규칙 그대로

---

## 결정 (D61 — architecture.ko.md에 기록)

| 항목 | 결정 |
| :--- | :--- |
| 탭 이름 | **Snap** (세 기능 모두 "찍기"에서 시작 — 원칙 "Care, snap, tap") |
| 기분 퍼센트 | **부정 감정을 포함해 전부 %로 표시** (D42의 "부정 감정 퍼센트 금지"를 바꿈). 대신 "For fun only — not a behavior or health assessment" 문구는 그대로 필수, 퍼센트는 **서버가 계산**(모델이 숫자를 지어내지 않음), 의학 · 통증 표현 금지 |
| 꾸미기 | **견주 + 시터** 둘 다. 각자 자기 스티커 층을 갖고, 상대 층도 보인다(시터 본문 · 견주 꾸밈을 서로 덮어쓰지 않음) |
| Treat check 사용자 | 08은 돌보는 중인 시터 전용이었음 → **견주(자기 펫) + 돌보는 중인 시터**. DANGER 견주 알림은 시터가 검사했을 때만 |
| 박스 · 오리기 | **브라우저에서** MediaPipe(무료 · 서버 메모리 0). 점수 · 판단은 서버(Token Factory) |

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| 12.1 Treat check (08 설계 + Tavily 8.7 + 견주 사용) | 바코드 스캔, 자동 구매 차단 |
| 12.2 Mood: 사진 · 영상(프레임 4장), 펫별 박스 + 감정 % | 소리(짖음) 분석, 실시간 카메라 스트림 |
| 12.3 Sticker: 오리기 → 스티커함 → 다이어리 꾸미기(견주 · 시터) | 스티커 공유 마켓, 프리셋 스티커 팩(디자인 에셋 오면 추가) |
| 데모 샘플(라벨 4 · 펫 사진 4 · 영상 2) 트레이 | 네이티브 앱 전용 기능 |

---

## 화면

```
Snap 탭
 ├─ [Treat check]  🏷️ "Can Max eat this?"      → /{role}/snap/treat
 ├─ [Mood]         😊 "How does Max seem?"     → /{role}/snap/mood
 └─ [Sticker]      ✂️ "Make a sticker"         → /{role}/snap/sticker
     (아래: 최근 검사 3개 · 내 스티커 몇 개)
```

- **Treat check:** 펫 고르기(돌보는 펫 / 내 펫) → 사진(찍기 · 고르기 · 샘플) → 진행 2단계("Reading the label…" → "Checking for Max…") → 결과. DANGER = 빨간 전체 모달 "I understand — don't feed"(DESIGN.md §7.4), WARNING = 주황 카드 + 숨은 성분 설명 + 출처, SAFE = 초록. **맨 아래 작은 회색 글씨:** "AI can be wrong. Always double-check the label and ask your vet if unsure."
- **Mood:** 사진 / 영상 고르기 → 이미지 위에 펫별 **박스**(테두리) + 박스 옆 **감정 % 표**(예시처럼 8줄, 가장 높은 것 강조) → 한 줄 요약("Max seems happy and playful") → "For fun only…" 문구. 영상이면 "4 frames" 표시 + 가장 대표 프레임에 박스.
- **Sticker:** 사진 → 자동으로 가장 큰 펫을 오림(박스 중앙을 탭한 것처럼) → **다른 곳을 탭하면 그 물체로 다시 오리기** → 미리보기(흰 테두리 · 그림자) → **Save sticker**. 다이어리 화면에서 **Decorate** → 스티커함에서 골라 붙이기 → 드래그로 이동, 버튼으로 크기 ± · 회전 ↺↻ · 삭제(마우스만으로 전부, D25) → Save.

---

## 12.1 Treat check — 파이프라인

[Phase 08](phase-08.md)의 파이프라인 · JSON 스키마 · 판정 기준 · 테스트 샘플 · Tavily 계획(8.7)을 **그대로** 쓴다. 바뀌는 것만:

| 08 원래 | 12.1 |
| :--- | :--- |
| `assert_on_duty_for` (시터만) | 견주는 `is_owner_of(pet)`, 시터는 `assert_on_duty_for` |
| 진입: sitter Home **Scan a treat** | Snap 탭 카드 (Home 버튼은 Snap으로 가는 바로가기로 남겨도 됨) |
| 8.7 Tavily = stretch | **포함** (Tavily 상금 조건: 런타임 호출 + 출처 1개 이상 표시) |
| DANGER 알림 = 항상 견주 | 시터가 검사했을 때만 견주에게(견주 본인 검사면 알림 없음) |

- `POST /api/ai/safety-check {pet_id, media_id}` → `{safety_check_id, safety_status, matched_allergens[], detected_ingredients[], hidden_sources[], toxic_ingredients[], unknown_ingredients[], sources[], warning_message, model, latency_ms}`
- 마이그레이션 **`013_safety.sql`**: `safety_danger` 알림 트리거(08 설계) + 견주 RLS(본인 펫 검사 기록 읽기 · `acknowledged_at` 갱신).

## 12.2 Mood — 파이프라인

```
[브라우저] 사진 1장 or 영상 → 프레임 4장(<video> + canvas, 0.2/0.4/0.6/0.8 지점)
   → MediaPipe ObjectDetector (EfficientDet-Lite0, COCO "dog"/"cat", score ≥ 0.5)  → 펫별 박스
   → 박스를 10% 넓혀 잘라 JPEG(긴 변 512px)
[서버] POST /api/ai/pet-mood {pet_id?, frames:[{index, crops:[{box, image}]}]}
   → 크롭마다 MiniCPM-V: 관찰 JSON만 {ears, eyes, mouth, tail, posture, body_tension, activity} (자유 문장 금지)
   → (선택, 개만) dog-emotion 분류기 점수 — 12.S2 스파이크 결과로 결정
   → 서버 규칙: 관찰 태그 → 8개 감정 점수 → 정규화(합 100%) → 프레임 평균
   → Nemotron(MODEL_FAST): 한 줄 요약 ("seems" 표현, 의학 표현 금지)
   ← {pets:[{box, frame, emotions:{happy, relaxed, excited, curious, sleepy, anxious, angry, sad}, top, summary}], disclaimer}
```

- **왜 이렇게:** 펫 감정 전용으로 검증된 오픈 모델은 거의 없다(강아지 `agentmish/dog-emotion-classifier-v2` 4종 · 학습 데이터 라이선스 미표기, 고양이는 데이터셋만 있음). Token Factory에 박스를 잘 그리는 Qwen-VL도 없다(10/10 확인). → 박스는 브라우저 모델, 판단은 Token Factory 비전 모델 + **서버 규칙으로 계산한 퍼센트**. 같은 사진이면 같은 결과.
- **8개 감정:** Happy · Relaxed · Excited · Curious · Sleepy · Anxious · Angry · Sad (D61: 전부 %). 규칙표는 `backend/app/ai/mood_rules.py` + 단위 테스트.
- 저장: 기본은 **저장 안 함**(결과만 보여 줌). "Save to Feed"는 S5에서 여유 있을 때.

## 12.3 Sticker + 다이어리 꾸미기 — 파이프라인

```
[브라우저] 사진 → ObjectDetector로 가장 큰 펫 박스 → 그 중앙점으로 MediaPipe InteractiveSegmenter(Magic Touch)
   → 마스크 → canvas: 투명 배경 + 흰 테두리 6px + 그림자 → PNG(긴 변 512px)
   → (사용자가 다른 곳을 탭하면 그 점으로 다시 분할)
   → uploadMedia({purpose:'sticker'}) → pet_stickers 행
[다이어리] Decorate → report_decor(report_id, user_id, items jsonb) upsert
   items = [{sticker_id, x, y, scale, rotate, z}]  (x,y = 카드 기준 0–1 비율)
```

- **대안(12.S2에서 결정):** Magic Touch 모델 파일 라이선스가 맞지 않거나 펫 분할이 나쁘면 → 백엔드 `rembg`(MIT, `u2netp` 4.7MB) `POST /api/media/sticker-cut`.
- 견주 · 시터 각자 자기 층(`report_decor`의 자기 행)만 고치고, 둘 다 상대 층을 본다. 알림장 본문(`daily_reports.body`)은 건드리지 않는다.
- 마이그레이션 **`013b_mood_stickers.sql`**: `media.purpose`에 `sticker` 추가, `pet_stickers(id, pet_id, media_id, created_by, created_at)`, `report_decor(report_id, user_id, items jsonb, updated_at, primary key(report_id, user_id))` + RLS(펫에 접근 가능한 사람 읽기 · 자기 행만 쓰기 · 시터는 그 예약의 시터일 때만).

---

## 작업 순서 — 한 PR · 단계별 커밋 (CLAUDE.md §4.1a · §4.2)

| 단계 | 내용 | 날짜 |
| :--- | :--- | :--- |
| **12.0** | 탭 이름 Mood → Snap · Snap 화면 틀(카드 3개, 각 화면은 "Coming in this phase" 자리) · 결정 D61 · 이 문서 · TODO · test-guide · CLAUDE.md 탭 줄 | 10/14 |
| **12.1a** | `013_safety.sql` + `POST /api/ai/safety-check`(vision → 규칙 → Ultra) + pytest(알러지 강제 DANGER · 스키마) | 10/14–15 |
| **12.1b** | Tavily 서비스(신뢰 도메인 · 8초 · 실패 시 무시) + 출처 | 10/15 |
| **12.1c** | Treat check 화면 + `AlertModal` + 샘플 라벨 4장 + e2e | 10/16 |
| **12.S2** | 스파이크(반나절): 폰 프레임 안에서 MediaPipe 인식 · 분할 속도, 모델 파일 라이선스, 개 분류기 쓸지 결정 → 이 문서에 결과 기록 | 10/16 |
| **12.2a** | `POST /api/ai/pet-mood` + `mood_rules.py` + pytest | 10/17 |
| **12.2b** | Mood 화면(박스 + % 표 + 영상 프레임) + 샘플 + e2e | 10/18 |
| **12.3a** | `013b` + 스티커 만들기 화면 + 업로드 + e2e | 10/19–20 |
| **12.3b** | 다이어리 꾸미기(견주 diary 상세 · 시터 ReportComposer) + e2e(마우스 드래그) | 10/21 |
| **12.5** | 마무리 · test-guide · README 메모 · 데모 샘플 정리 | 10/22 |

**일정이 밀리면 자르는 순서:** ① 영상 기분(사진만) → ② 시터 쪽 꾸미기(견주만) → ③ 개 분류기 혼합(태그 규칙만) → ④ Tavily 재판단(출처 표시만). **Treat check DANGER 장면과 사진 기분 · 스티커 1장은 반드시 남긴다.**

---

## 시작 전에 사람이 준비할 것

- **민식:** `TAVILY_API_KEY`를 Render · 로컬 `.env`에 (무료 플랜 확인). 데모용 펫 사진 4장(개 1 · 개 2마리 · 고양이 · 개+고양이)과 5초 영상 2개 — 사람 얼굴 · 주소 없이, 직접 찍은 것.
- **민식 · 묵:** 성분표 샘플 4장(08 표: `chicken_jerky` · `animal_fat_biscuit` · `sweet_potato_chew` · `lily_scented_cat_treat`) — 직접 만들거나 촬영, 상표 가림.
- **슬기:** 감정 규칙표 문구 검토(8개 감정 이름 · 요약 문장 톤, "seems" 표현), `dog-emotion-classifier-v2` 학습 데이터 라이선스 확인(12.S2 전).
- **묵:** Snap 탭 아이콘 · 카드 3개 · 스티커 테두리 스타일(없으면 DESIGN.md 토큰으로 진행).

---

## Definition of Done (DoD)

1. 두 역할 모두 탭 바에 Snap, 마우스만으로 세 도구를 끝까지 쓸 수 있다(1366 × 768 폰 프레임).
2. Treat check: 샘플 4장이 기대대로(DANGER · WARNING · SAFE · 고양이 DANGER), DANGER 모달은 확인 전 닫히지 않음, WARNING에 Tavily 출처 1개 이상, 디스클레이머가 맨 아래.
3. Mood: 개 2마리 사진에서 박스 2개 · 각 % 합 100 · 같은 사진 두 번 → 같은 결과, 영상 → 프레임 4장 평균. "For fun only" 문구 항상 보임, 의학 표현 0.
4. Sticker: 샘플 사진 3장 중 2장 이상에서 펫만 깔끔하게 오려짐, 다이어리에 붙인 스티커가 새로고침 · 상대방 화면에서도 같은 자리.
5. pytest(규칙 · 스키마 · 권한) · SQL `rls_smoke`(013 · 013b) · Playwright e2e 통과, test-guide에 SNAP 시나리오.

---

## 산출물

- Backend: `routers/ai_safety.py` · `schemas/safety.py` · `ai/prompts/safety/*` · `services/tavily.py` · `routers/ai_pet_mood.py` · `ai/mood_rules.py` · `ai/prompts/mood/*` · (대안) `routers/sticker_cut.py`
- DB: `013_safety.sql` · `013b_mood_stickers.sql` + `rls_smoke.sql` 블록
- Frontend: `app/{owner,sitter}/(tabs)/snap.tsx` · `app/{owner,sitter}/snap/{treat,mood,sticker}.tsx` · `components/ui/AlertModal.tsx` · `features/snap/*`(MediaPipe 로더 · 크롭 · 마스크 → PNG) · `components/StickerLayer.tsx` · `components/DecorateSheet.tsx`
- 샘플: `frontend/assets/demo/{labels,mood,sticker}/` · `backend/tests/fixtures/{labels,mood}/`

## 다음 Phase

[Phase 10](phase-10.md) 나머지(고정 데모 계정 · README · 영상) → [11.15](../pet-profile-onboarding.ko.md) 온보딩(10/24–27).
