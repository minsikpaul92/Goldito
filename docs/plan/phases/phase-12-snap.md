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

[Phase 08](phase-08-safety.md)의 파이프라인 · JSON 스키마 · 판정 기준 · 테스트 샘플 · Tavily 계획(8.7)을 **그대로** 쓴다. 바뀌는 것만:

| 08 원래 | 12.1 |
| :--- | :--- |
| `assert_on_duty_for` (시터만) | 견주는 `is_owner_of(pet)`, 시터는 `assert_on_duty_for` |
| 진입: sitter Home **Scan a treat** | Snap 탭 카드 (Home 버튼은 Snap으로 가는 바로가기로 남겨도 됨) |
| 8.7 Tavily = stretch, WARNING · 모르는 성분일 때만, 결과 0개면 도메인 필터 없이 재시도 | **매 검사마다 항상 호출, 신뢰 도메인만**(`aspca.org` · `fda.gov` · `avma.org` · `petpoisonhelpline.com` · `vcahospitals.com`) — 필터 없는 재시도 없음. 순서: 비전이 성분을 읽음 → Tavily 쿼리 ≤ 4개 병렬(8초) → **Ultra가 출처와 함께 한 번에 판단**(재판단 2회 대신 1회) → 서버 규칙이 알러지 · 독성은 강제 DANGER. Tavily가 실패 · 타임아웃이면 판정은 규칙 + 모델로 그대로 내고 "Sources unavailable right now"를 표시 |
| DANGER 알림 = 항상 견주 | 시터가 검사했을 때만 견주에게(견주 본인 검사면 알림 없음) |

- **쿼리(매번, 최대 4개):** 펫 알러지마다 숨은 출처 `"{ingredient} {allergen} derived"`(가장 애매한 성분부터) · 모르는 성분 `"{ingredient} toxic {species}s"` · 제품 리콜 `"{product} {species} treat recall"`(`topic=news`, 1년). 애매한 성분이 없으면 주 성분 1–2개의 `"{ingredient} safe for {species}s"`로 채워 **출처가 항상 1개 이상** 붙게 한다. 크레딧: 기본 search 1 크레딧 → 검사 1번에 ≤ 4 (무료 월 1,000 + 이벤트 8,000)
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
   items = [{sticker_id, public_id, x, y, scale, rotate, z}]  (x,y = 카드 기준 0–1 비율; public_id도 넣어 스티커함에서 지운 스티커도 꾸민 자리에 남음)
```

- **대안(12.S2에서 결정):** Magic Touch 모델 파일 라이선스가 맞지 않거나 펫 분할이 나쁘면 → 백엔드 `rembg`(MIT, `u2netp` 4.7MB) `POST /api/media/sticker-cut`. **12.S2 결과(10/14):** 분할 품질 10 / 10 → MediaPipe(v2 `interactive_segmentation.task`, CPU, Web Worker). 대안은 쓰지 않음(Magic Touch 모델 카드: Apache-2.0).
- 견주 · 시터 각자 자기 층(`report_decor`의 자기 행)만 고치고, 둘 다 상대 층을 본다. 알림장 본문(`daily_reports.body`)은 건드리지 않는다.
- 마이그레이션 **`013b_mood_stickers.sql`**: `media.purpose`에 `sticker` 추가, `pet_stickers(id, pet_id, media_id, created_by, created_at)`, `report_decor(report_id, user_id, items jsonb, updated_at, primary key(report_id, user_id))` + RLS(펫에 접근 가능한 사람 읽기 · 자기 행만 쓰기 · 시터는 그 예약의 시터일 때만).

---

## 작업 순서 — 한 PR · 단계별 커밋 (CLAUDE.md §4.1a · §4.2)

| 단계 | 내용 | 날짜 |
| :--- | :--- | :--- |
| **12.0** ✅ | 탭 이름 Mood → Snap(아이콘 `camera-outline`) · Snap 화면 틀(`features/snap/SnapScreen` + 카드 3개, 각 도구 화면은 `SnapToolPlaceholder` "Coming soon" 자리 — `/{role}/snap/{treat,mood,sticker}`) · 결정 D61 · 이 문서 · TODO · test-guide · CLAUDE.md 탭 줄 | 10/13 |
| **12.1a** ✅ (12.1b 포함) | `013_safety.sql` + `POST /api/ai/safety-check`(vision → 규칙 → **Tavily 매번 · 신뢰 도메인만** → Ultra 한 번) + 업로드 권한(견주 `safety_label`) + pytest · `rls_smoke` 013 블록 — 실제 모델 · Tavily 호출 확인은 남음(로컬 키 없음, 아래 § 다음에 이어서) | 10/13 |
| **12.1c** ✅ | Treat check 화면 + `AlertModal` + 샘플 라벨 4장(만든 그림) + e2e — 실제 판정 확인은 키 · `013` 뒤 | 10/14 |
| **12.S2** ✅ | 스파이크(반나절): 폰 프레임 안에서 MediaPipe 인식 · 분할 속도, 모델 파일 라이선스, 개 분류기 쓸지 결정 → 결과는 § 다음에 이어서 › 12.S2 "스파이크 결과" (실제 폰 측정은 👤; Magic Touch 라이선스 Apache-2.0 확인 10/14) | 10/14 |
| **12.2a** ✅ | `POST /api/ai/pet-mood` + `mood_rules.py` + pytest (`test_mood_rules` · `test_ai_pet_mood`) — 실제 모델 호출 확인은 12.2b 화면과 함께 | 10/14 |
| **12.2b** ✅ | Mood 화면(박스 + % 표 + 영상 프레임) + 샘플 + e2e — `features/snap/{MoodScreen.tsx, vision.ts, moodApi.ts, SnapPets.tsx}`(펫 칩은 Treat check와 공용), MediaPipe는 CDN에서 실행 시 로드(번들 X), e2e는 `window.__goldiVision` 훅 | 10/14 |
| **12.3a** ✅ | `013b` + 스티커 만들기 화면 + 업로드 + e2e — `features/snap/{StickerScreen.tsx, cutout.ts, stickerApi.ts}`, 오리기는 classic Web Worker(module 워커는 MediaPipe WASM 로더가 안 됨), 스티커 PNG는 JPEG 변환 없이 업로드, 스티커함(견주 · 시터 같이 봄, 만든 사람만 삭제). `013b` 호스팅 DB 적용은 👤 | 10/14 |
| **12.3b** ✅ | 다이어리 꾸미기(견주 diary 상세 · 시터 ReportComposer) + e2e(마우스 드래그) — `features/snap/{DecoratedReport.tsx, StickerCanvas.web.tsx, decorApi.ts}`: 두 화면이 같은 "종이"(알림장 글)를 그리고 좌표는 종이 기준 0–1, 드래그는 DOM 포인터 + `data-gesture-owner`, 항목에 `public_id` | 10/14 |
| **12.4** ✅ | **그림일기 · 스티커 앞/뒤 · 다운로드 · 기본 스티커** (2026-10-14 민식 요청) — 보낸 알림장을 그림일기 한 장으로(날짜 · 펫 머리말, 그날 첫 사진이 든 그림 칸, 줄 공책 위 손글씨 글꼴 Gaegu), 스티커마다 **글 위 / 글 아래**(`layer`), 스티커 **다운로드**(만든 직후 PNG · 스티커함의 원본), **Goldito 기본 스티커 9장**(코드로 그린 임시본 — 묵 디자인으로 같은 이름 교체) | 10/14 |
| **12.5** | 마무리 · Snap 탭 "Recent checks" · test-guide · README 메모 ✅(별도 PR) · 데모 샘플 정리 → TODO "Phase 12 by hand" | 10/15–16 |

**일정이 밀리면 자르는 순서:** ① 영상 기분(사진만) → ② 시터 쪽 꾸미기(견주만) → ③ 개 분류기 혼합(태그 규칙만) → ④ Tavily 재판단(출처 표시만). **Treat check DANGER 장면과 사진 기분 · 스티커 1장은 반드시 남긴다.**

---

## 시작 전에 사람이 준비할 것

- **민식:** `TAVILY_API_KEY`를 Render · 로컬 `.env`에 (무료 플랜 확인). 데모용 펫 사진 4장(개 1 · 개 2마리 · 고양이 · 개+고양이)과 5초 영상 2개 — 사람 얼굴 · 주소 없이, 직접 찍은 것.
- **민식 · 묵:** 성분표 샘플 4장(08 표: `chicken_jerky` · `animal_fat_biscuit` · `sweet_potato_chew` · `lily_scented_cat_treat`) — 직접 만들거나 촬영, 상표 가림. → 10/14 상표 없는 가짜 라벨 4장을 그림으로 만들어 넣음(같은 이름으로 실제 촬영본으로 바꿔도 됨).
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

## 다음에 이어서 — 남은 작업 상세 (2026-10-13 마감 메모)

> 이 절만 읽고 이어서 할 수 있게 적었다. 브랜치 `feat/phase-12-snap`, PR [#90](https://github.com/minsikpaul92/Goldito/pull/90) (12.1c 뒤 **Ready for review**). 단계마다 커밋 하나 + TODO · test-guide 같이 고치기 (CLAUDE.md §4.1a).

### 지금 상태 (2026-10-14)

| 커밋 | 내용 |
| :--- | :--- |
| `7010762` · `ece0e1b` | 이 문서 · D61 · Tavily는 매번 신뢰 도메인만 |
| `2aedfc4` 12.0 | 탭 Mood → **Snap**(`camera-outline`), `features/snap/{SnapScreen,SnapToolCard,SnapToolPlaceholder,tools}`, 라우트 `app/{owner,sitter}/(tabs)/snap.tsx` · `app/{owner,sitter}/snap/{treat,mood,sticker}.tsx`(지금은 자리 화면), e2e `snap.spec.ts` |
| `15f5443` 12.1a (+12.1b) | `POST /api/ai/safety-check` — `routers/ai_safety_check.py`, 규칙 `ai/safety.py` + `ai/prompts/safety/{vision_system.md, reasoning_system.md, toxic_rules.json}`, Tavily `services/tavily.py`(httpx, 신뢰 도메인 5개, 8초, 쿼리 ≤ 4), 견주도 `safety_label` 업로드(`routers/media.py`), `013_safety.sql`, pytest 3개 파일, `rls_smoke` 013 블록 |
| 12.1c | `features/snap/{TreatCheckScreen.tsx, treatApi.ts}`, `components/ui/AlertModal.tsx`(빨강 전체 화면, 버튼으로만 닫힘), 라우트 `app/{owner,sitter}/snap/treat.tsx`, 샘플 `assets/demo/labels/*.jpg`(= `backend/tests/fixtures/labels/`), 알림 `safety_danger` → `/owner/snap/treat?check=…`, e2e `treat-check.spec.ts`. Snap 탭의 "Recent checks" 3개는 12.5로 미룸 |

**확인 2026-10-14 (모델 직접 호출, [notes/model-ids.md § Treat check calls](notes/model-ids.md)):** MiniCPM-V가 샘플 라벨 4장을 다 읽음(장당 0.9–1.4초), Tavily 신뢰 도메인 3건(2.9초), Ultra(추론 켬) WARNING 판정 2.7초 · 토큰 614(2000 충분) → 검사 1번 약 7–8초 예상. `013`은 2026-10-14 호스팅 DB에 적용, `rls_smoke` 전부 PASS. **아직 안 한 것:** FastAPI 라우트 전체(Cloudinary · DB · 알림) — Render는 `main`을 배포하므로 #90 머지 뒤, 그리고 `scripts/measure_safety.py`.

### 다시 시작할 때 사람이 먼저 할 것 (민식)

1. ✅ (2026-10-14) **`013_safety.sql` 적용** → `supabase/tests/rls_smoke.sql` 전체 실행 → 마지막 블록 `PASS: 013: …` 8줄.
2. **키:** `backend/.env`에 `NEBIUS_API_KEY`, `TAVILY_API_KEY`(그 밖의 값은 `backend/.env.example`). Render → Environment에도 `TAVILY_API_KEY`.
3. **샘플 라벨 4장** — ✅ 10/14 만든 그림으로 들어가 있음(바꾸려면 같은 이름으로)(직접 촬영 · 상표 가림, 긴 변 1200px 이하 JPG): `chicken_jerky.jpg`(DANGER · Max), `animal_fat_biscuit.jpg`(WARNING · Max), `sweet_potato_chew.jpg`(SAFE), `lily_scented_cat_treat.jpg`(DANGER · Mochi) → `frontend/assets/demo/labels/`와 `backend/tests/fixtures/labels/` 둘 다.
4. (12.2–12.3용, 늦어도 10/16) 펫 사진 4장 · 5초 영상 2개 → `frontend/assets/demo/mood/`. — 🟡 10/14 우리가 찍은 개 사진 10장 들어감(`assets/demo/mood/` = `backend/tests/fixtures/mood/`, 메타데이터 지움). **아직:** 개 2마리 한 장 · 고양이 · 5초 영상 2개.

### 12.1 실제 호출 확인 (키가 들어오면 맨 먼저, 30분)

- `backend/scripts/measure_safety.py` 작성: `scripts/measure_handoff.py`처럼 fixtures 라벨을 Cloudinary 없이 data URL로 만들어 `nebius.chat_json("vision", …)` → `ai.safety.check_rules` → `tavily.search_many` → `chat_json("safety", reasoning=True)` 순서로 부르고, 단계별 시간 · 판정 · 출처 수를 표로 출력. 기대값은 위 3번.
- 결과를 [notes/model-ids.md](notes/model-ids.md)에 한 줄(vision / Ultra / Tavily ms)로 남기고, 이 문서 § 12.1에 "확인 2026-10-…".
- 볼 점: Ultra는 추론 토큰이 많아 `max_tokens=2000`이 모자라면 `AIInvalidOutput` → `REASONING_TIMEOUT_S` · `max_tokens`를 올림. 전체가 60초를 넘으면 12.1c 진행 표시를 3단계로.

### 12.1c — Treat check 화면 ✅ (10/14, 아래는 만든 대로의 설계)

- **화면** `features/snap/TreatCheckScreen.tsx`(`{role}`) → `app/{owner,sitter}/snap/treat.tsx`가 자리 화면 대신 렌더.
  1. **펫 고르기:** 견주 = 내 펫(`PetCard` 재사용 가능), 시터 = 지금 돌보는 펫(`features/care/useCaringPets`; 없으면 "No pet in your care right now"). 펫이 하나면 자동 선택.
  2. **사진:** 기존 미디어 피커(데스크톱은 샘플 트레이) → `uploadMedia({petId, purpose: "safety_label"})`.
  3. **진행 표시:** "Reading the label…" → "Checking for {name}…" (서버가 단계를 안 알려 주므로 시간으로: 0–8초 / 그 뒤).
  4. **결과:**
     - DANGER = 새 `components/ui/AlertModal.tsx` — 전체 화면 빨강 `#B42318`(스킨으로 안 바뀜), ⚠️, `warning_message`, 일치 · 독성 칩, **"I understand — don't feed"**로만 닫힘(바깥 클릭 · X 없음, DESIGN.md §7.4). 닫을 때 `safety_checks.acknowledged_at` 업데이트(클라이언트 RLS, 013).
     - WARNING = 주황 카드 + 숨은 출처 이유 + "Ask the owner first"(시터) / "Check with your vet"(견주).
     - SAFE = 초록 "Looks fine for {name} ✅".
     - 공통: 읽은 성분 목록(접기), **Sources 칩**(제목 · 도메인, 새 탭), `sources_unavailable`면 "Sources unavailable right now", `double_checked=false`면 "We couldn't double-check this one".
  5. **맨 아래 작은 회색 디스클레이머(항상):** "AI can be wrong. Always double-check the label, and ask your vet if you're unsure."
  6. **최근 검사 10개:** `safety_checks` select(펫별, 최신순, `result_json->>product_name`, 상태 칩). Snap 탭 카드 아래 "Recent checks" 3개.
- **오류:** 422 → "Couldn't read the label. Try a closer, well-lit photo." + 다시 찍기, 503/502 → ErrorDialog + Retry.
- **API 클라이언트** `features/snap/treatApi.ts`: `checkTreat(petId, mediaId)`(`apiPost`, 타임아웃 120초 — `lib/api.ts` 기본값 확인), `listRecentChecks(petId)`, `acknowledge(checkId)`.
- **알림:** `lib/notifications.ts`의 `safety_danger` → `/owner/snap/treat?check={ref_id}`(그 검사 결과를 바로 보여 줌).
- **샘플:** `lib/demoSamples.ts`의 `safety_label: []` → 라벨 4장.
- **e2e** `e2e/treat-check.spec.ts`(FLOW_SPECS에 `"treat-check"` 추가): `page.route("**/api/ai/safety-check")`로 결과 주입(`e2e/caption.spec.ts:18` 방식) — DANGER 모달이 확인 전 안 닫힘 + 확인 시 `acknowledged_at` 기록, WARNING 출처 칩, SAFE, 422 안내, 디스클레이머 항상, 시터는 돌보는 펫만, 마우스만으로. 업로드는 기존 `supabaseMock`의 sign/complete 목업.
- **DoD:** 1366 × 768 폰 프레임에서 `chicken_jerky` 샘플 → DANGER 모달이 프레임 안에 있고 확인 전 안 닫힘.

### 12.S2 — 브라우저 모델 스파이크 (반나절, 10/16)

- 패키지 `@mediapipe/tasks-vision` — **2주 이상 된 정확한 버전**으로 고정(`npm view @mediapipe/tasks-vision time`). 웹 전용(`Platform.OS === "web"`). 앱은 데스크톱에서 iframe 안이라 WASM 경로는 CDN(`cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@<버전>/wasm`).
- 모델 파일: ObjectDetector `efficientdet_lite0`(int8) · InteractiveSegmenter `magic_touch` — `storage.googleapis.com/mediapipe-models/...`에서 바로 로드되는지(배포 `vercel.json` CSP는 `frame-ancestors`만), 아니면 `frontend/public/models/`(크기 확인).
- **측정:** 폰 프레임 안에서 모델 로딩 · 사진 1장 검출 · 분할 시간(데스크톱 Chrome, 실제 폰 1회).
- **라이선스:** 두 모델 카드(Apache-2.0인지). 아니면 12.3은 대안(백엔드 `rembg` + `u2netp`, MIT)으로.
- **개 분류기:** `agentmish/dog-emotion-classifier-v2` 학습 데이터 라이선스(슬기 확인)와 ONNX 크기 → 쓸지 결정. 기본은 **안 씀**(관찰 태그 규칙만).
- 결과는 이 문서 § 12.2 · 12.3에 "스파이크 결과" 표로.

#### 스파이크 결과 (2026-10-14, 데스크톱 Chrome 계열 브라우저 · CPU, 우리가 찍은 강아지 사진 10장 `assets/demo/mood/`)

| 항목 | 결과 → 결정 |
| :--- | :--- |
| 패키지 | `@mediapipe/tasks-vision` **`1.0.1`**(2026-07-31, Apache-2.0)으로 고정 — `1.1.0`(10/06)은 2주 규칙에 걸림. 번들 · WASM은 jsdelivr `…@1.0.1/{vision_bundle.mjs, wasm}`에서 로드(WASM 11 MB, 1년 캐시) |
| 박스 (ObjectDetector) | `efficientdet_lite0` **int8 · CPU**: 로딩 ≈ 150 ms, 사진 1장 ≈ 60 ms, **10 / 10장에서 개를 찾음**(점수 ≥ 0.3, `categoryAllowlist: dog, cat`). ⚠️ **int8 + GPU는 0 / 10**(결과가 비어 있음) → **CPU로 고정**. float16은 CPU · GPU 모두 10 / 10(파일 7 MB)이라 대안 |
| 오리기 (InteractiveSegmenter) | 1.0.1은 **새 API**: `setImage(img)` → `segment([{ brushMode: 1 /* POSITIVE */, point: [{x, y}], isCompleted: true }])` → `MPMask`(float, > 0.5 = 펫). 예전 `magic_touch.tflite`는 `InteractiveSegmenterLegacy` 전용 → 새 파일 `interactive_segmenter_v2/magic_touch/int8/latest/interactive_segmentation.task` **30 MB**(1시간 캐시). `BrushMode`는 번들에서 값으로 export되지 않아 숫자 `1` |
| 오리기 품질 | 가장 큰 박스 중앙 한 번 탭으로 **10 / 10장 모두 펫만 깔끔하게**(마스크의 94–100 %가 박스 안; 가방 속 치와와만 68 % — 가방 일부 포함) → **MediaPipe로 감**(백엔드 `rembg` 대안 안 씀, 라이선스 확인이 막히지 않는 한) |
| 오리기 속도 | **CPU: 탭마다 ≈ 4.8초**(인코더가 첫 `segment`에서 돌고, 다시 탭해도 같음). GPU는 첫 탭 1.9초 · 다시 탭 0.6초지만 **int8 GPU 마스크가 비어 있음**(전경 0.1 % vs CPU 12 %) → **CPU로 고정**, 그 대신 **Web Worker에서 실행**(4.8초 동안 화면이 멈추지 않게) + "Cutting out…" 진행 표시. 실제 폰은 2–3배 느릴 수 있음 → 👤 실제 폰 1회 측정 남음 |
| 모델 로딩 위치 | `storage.googleapis.com`에서 바로 로드됨(교차 출처 OK, `vercel.json` CSP는 `frame-ancestors`만). 캐시가 1시간뿐이라 30 MB를 자주 받게 되면 `frontend/public/models/`로 옮길지 12.3a에서 결정 |
| 라이선스 | **Magic Touch: Apache License 2.0** ✅ — [모델 카드 PDF](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MagicTouch.pdf)(Google, 2023-03-13; MediaPipe 문서가 v2 `.task`에도 같은 카드를 링크) "LICENSED UNDER Apache License, Version 2.0". 용도: 사진 속 물체 · **동물** · 사람 분할(사진 편집 · 주석) → 스티커에 맞음. 범위 밖: 동의 없는 사람 분할, 감시 · 신원 인식, 4 m보다 먼 작은 물체 → 사람이 찍힌 사진은 펫 쪽을 탭하게 안내. **EfficientDet-Lite0**: Google 문서에 모델 카드 · 라이선스가 따로 없음(파일 링크만; 제3자 패키지가 Apache-2.0이라 함) — 박스만 그리는 용도라 위험은 낮음, README 크레딧에 "MediaPipe EfficientDet-Lite0 (Google)"로 적음 |
| 개 감정 분류기 | `agentmish/dog-emotion-classifier-v2`: 모델은 Apache-2.0이지만 학습 데이터 "unknown dataset", ViT-base 85.8M(웹에서 쓰기엔 큼) → **안 씀**(관찰 태그 규칙만) |
| 아직 없는 샘플 | **개 2마리가 한 장에 있는 사진**(DoD 3), 고양이 사진, 5초 영상 2개 — 지금 10장은 모두 개 한 마리 |

### 12.2a/b — Mood (10/17–18)

- **API** `POST /api/ai/pet-mood`(`routers/ai_pet_mood.py`)
  - 요청 `{pet_id?: uuid, frames: [{index, crops: [{box: {x, y, w, h}(0–1 비율), image: data-url JPEG ≤ 512px}]}]}` — 크롭 ≤ 8개, 각 ≤ 300KB. 로그인한 누구나(사진 · 결과 기본 저장 안 함).
  - 크롭마다 `chat_json("vision", …, MoodTags)` 병렬(≤ 4) → 태그 `{species, ears, eyes, mouth, tail, posture, body_tension, activity}`(각각 고정 선택지).
  - `ai/mood_rules.py`: 태그 → 8개 감정 가중치 합 → 정규화(정수, 합 100, 반올림 오차는 최댓값에) → 같은 펫(박스 순서)의 프레임 평균.
  - `chat("fast")`로 요약 한 줄("seems", 의학 · 통증 표현 금지 — 검사 후 실패하면 규칙 문장).
  - 응답 `{pets: [{frame, box, emotions: {happy, relaxed, excited, curious, sleepy, anxious, angry, sad}, top, summary}], disclaimer: "For fun only — not a behavior or health assessment."}`.
- **규칙 예:** `mouth=open_relaxed` → happy +3 · relaxed +1 / `tail=high_wagging` → excited +3 · happy +2 / `ears=pinned_back` → anxious +3 · angry +1 / `body_tension=stiff` → angry +2 · anxious +2 / `eyes=half_closed` → sleepy +3 · relaxed +1 … 단위 테스트: 같은 태그 → 같은 %, 합 100.
- **화면** `features/snap/MoodScreen.tsx`: 사진/영상 선택(샘플 포함) → `features/snap/vision.ts`의 `detectPets(image)`(12.S2) → 영상은 `<video>` + canvas로 4프레임 → 크롭 → API → 원본 위 **박스**(표시 크기에 맞춘 절대 위치) + 박스 옆 **감정 % 표 8줄**(최댓값 굵게, 예시 사진처럼) + 요약 + 디스클레이머. 펫이 안 잡히면 "We couldn't find a pet — try a clearer photo". 박스가 여러 개면 탭해서 표 전환.
- **테스트:** pytest(규칙 · 정규화 · 권한 · 크롭 하나 실패 시 그 크롭만 제외), e2e(테스트 훅으로 고정 박스 주입, API는 route 목업).

### 12.3a/b — Sticker + 다이어리 꾸미기 (10/19–21)

- **`013b_mood_stickers.sql`:**
  - `media.purpose` check에 `sticker` 추가(+ `routers/media.py` `Purpose` · `services/cloudinary.py` `PURPOSES` · 프론트 `MediaPurpose`; 견주 · 돌보는 시터 허용; PNG 투명이 업로드 변환에서 유지되는지 확인).
  - `pet_stickers(id, pet_id, media_id unique, created_by, created_at)` — 읽기 `can_access_pet`, 쓰기 본인 + `can_access_pet`.
  - `report_decor(report_id → daily_reports, user_id, items jsonb, updated_at, primary key(report_id, user_id))` — 읽기 = 그 보고서의 펫에 접근 가능한 사람, 쓰기 = 자기 행 + (견주 또는 그 보고서의 시터), `items` ≤ 20개.
  - `rls_smoke` 블록.
- **스티커 만들기** `features/snap/StickerScreen.tsx`: 사진 → `detectPets` 가장 큰 박스 중앙 → `segmentAt(image, point)`(12.S2) → 마스크 → canvas로 투명 PNG + 흰 테두리 6px(마스크를 팽창시켜 흰색으로 먼저 그림) + 그림자 → 미리보기 → "Tap your pet if we picked the wrong thing"(다른 점으로 다시) → **Save sticker** → `uploadMedia({purpose: "sticker"})` + `pet_stickers` insert. 내 스티커함(펫별 그리드, 삭제).
- **꾸미기** `components/DecorateSheet.tsx` + `components/StickerLayer.tsx`: 견주 `app/owner/diary/[entryId].tsx` 카드 위, 시터 `components/ReportComposer.tsx`(보낸 보고서) — **Decorate** → 스티커함에서 고르기 → 드래그 이동(`dataSet={{gestureOwner: "true"}}`, DESIGN.md) + **크기 ± · 회전 ↺↻ · 삭제 버튼**(D25 마우스) → Save(`report_decor` upsert). 표시는 두 층(내 것 위), 좌표는 카드 기준 0–1.
- **테스트:** pytest(업로드 목적), `rls_smoke`, e2e(마우스 드래그 → 저장 → 새로고침해도 같은 자리, 상대 역할에서도 보임; 분할은 테스트 훅으로 고정 마스크).

### 12.4 — 그림일기 · 스티커 앞/뒤 · 다운로드 · 기본 스티커 ✅ (10/14)

- **그림일기 종이** `features/snap/DecoratedReport.tsx`: 머리말(📅 요일, 날짜 · "{펫}'s day 🐾") → **그림 칸**(높이 180 고정 — 그날 첫 공유 사진, 없으면 🖍️) → **줄 공책**(30 px 줄, 글은 Gaegu 손글씨 — 웹만, Google Fonts SIL OFL, DESIGN.md §4 예외). 견주 다이어리 상세와 시터의 보낸 알림장이 같은 종이를 그려 좌표(종이 기준 0–1)가 같다.
- **층 순서(아래→위):** 종이 → 그림 칸 · 줄 → **글 아래 스티커**(`layer: "back"`) → 글 → **글 위 스티커**(기본). 꾸미는 동안에는 내 "글 아래" 스티커가 위 편집 층에 반투명으로 떠서 잡고 끌 수 있고, 저장하면 글 아래로 돌아간다(react-native-web에서 글이 클릭을 통과시키는 데 기대지 않음 — CI에서 확인). 도구 **⬇ Behind text / ⬆ Over text**. 항목에 `layer`가 없으면 "front"(12.3b에 저장한 것 그대로).
- **기본 스티커** `features/snap/presetStickers.ts` + `frontend/assets/stickers/*.png` 9장(heart · star · sun · cloud · paw · bone · ball · zzz · best_day): 앱에 들어 있어 업로드 없음, 꾸미기 항목에는 `preset:<id>`. 지금 파일은 코드로 그린 임시본 → 묵이 같은 이름으로 바꾸면 끝.
- **다운로드** `features/snap/download.ts`: Sticker 미리보기 **⬇ Download sticker**(브라우저에서 만든 PNG 그대로), 스티커함 타일 ⬇(Cloudinary `fl_attachment` 원본 PNG). 파일 이름 `goldito-{펫}-sticker.png`.
- **남은 것(11.8 쪽):** 꾸민 그림일기 한 장을 이미지로 저장(**Save image**) — P1 창에서 시간이 남으면.

### 12.5 — 마무리 (10/15–16)

- test-guide SNAP 시나리오 상태 · 사람 확인, Snap 줄 ✅, Snap 탭 카드 아래 "Recent checks" 3개(12.1c에서 미룸), README 메모(Treat check = Nemotron Ultra + MiniCPM-V + Tavily, Mood · Sticker = 브라우저 MediaPipe + Token Factory), 데모 샘플 정리, PR #90 본문 단계 표 갱신 → **Ready for review** → CI → 머지(사용자 요청 시). 호스팅 DB `013` · `013b` 적용 확인.

### 새 세션에서 붙여 넣을 프롬프트

```text
Read CLAUDE.md, docs/plan/TODO.md and docs/plan/phases/phase-12-snap.md (§ 다음에 이어서).
Branch feat/phase-12-snap, PR #90. Continue from the first unfinished item there:
the 12.1 real-model check if keys are in backend/.env, otherwise 12.S2 (the MediaPipe spike).
One commit per step with TODO.md + test-guide.ko.md updated (CLAUDE.md §4.1a), push to the same PR.
```

---

## Open items — 리뷰 2026-10-15 (#90 · #91)

상세(현상 → 원인 → 수정 → 테스트)는 [review-2026-10-15.ko.md](../review-2026-10-15.ko.md), 순서 · 담당은 [TODO.md](../TODO.md).

- **P0:** SR-1 부분 라벨이 SAFE · SR-3 잘못된 DANGER(`peanut butter` = 유제품) · 엉뚱한 WARNING(`beef liver`) · SR-4 Snap 탭 Recent checks 새로고침.
- **Later:** SR-5 – SR-21 (꾸미기 저장이 기존 스티커를 지움 · Mood 클립 펫 짝짓기 · 시터 꾸미기 기간 · Add pet 뒤 새로고침 · 그 밖의 낮음).

---

## 산출물

- Backend: `routers/ai_safety.py` · `schemas/safety.py` · `ai/prompts/safety/*` · `services/tavily.py` · `routers/ai_pet_mood.py` · `ai/mood_rules.py` · `ai/prompts/mood/*` · (대안) `routers/sticker_cut.py`
- DB: `013_safety.sql` · `013b_mood_stickers.sql` + `rls_smoke.sql` 블록
- Frontend: `app/{owner,sitter}/(tabs)/snap.tsx` · `app/{owner,sitter}/snap/{treat,mood,sticker}.tsx` · `components/ui/AlertModal.tsx` · `features/snap/*`(MediaPipe 로더 · 크롭 · 마스크 → PNG) · `components/StickerLayer.tsx` · `components/DecorateSheet.tsx`
- 샘플: `frontend/assets/demo/{labels,mood,sticker}/` · `backend/tests/fixtures/{labels,mood}/`

## 다음 Phase

[Phase 10](phase-10-deploy.md) 나머지(고정 데모 계정 · README · 영상) → [11.15](../pet-profile-onboarding.ko.md) 온보딩(10/24–27).
