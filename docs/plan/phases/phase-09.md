# Phase 09 — 피드 AI 캡션 + 타임라인 앨범 분류 (Caption & Album)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D11–D12, **D33 Vision**, AI 규칙 §9
> **말투 레이어 (D35):** 캡션 문장은 `voice.compose()`(07B 7B.8)로 시터 말투를 따른다. 분류 태그(meal·walk·nap·play)와 사람 속도 지연은 해당 없음 (D37). Vision 모델은 MiniCPM-V-4.5로 확정 (NVIDIA 비전 모델은 Dedicated Endpoint 전용 — D39).
> 제품 흐름: [full-process.ko.md](../full-process.ko.md) Stage 4-5 — 업로드 사진을 AI가 식사·산책·휴식 등으로 분류해 KidsNote식 날짜별 앨범에 저장

## Goal

펫시터가 **사진(또는 영상)만 업로드**하면 Vision 모델(`MODEL_VISION` = MiniCPM-V-4.5)이 **1–2문장 따뜻한 영어 캡션**과 **분류 태그**(`meal` · `walk` · `nap` · `play` · `other`)를 만들어 `feed_posts.caption`·`category`에 넣어, **타이핑 없는 피드**와 **날짜 → 분류별 앨범**(🍚 Meals · 🐕 Walks · 😴 Naps · 🎾 Play)을 완성한다. AI가 실패해도 게시는 항상 성공한다 (분류 null → "Moments").

### Goal 달성 기준

- [ ] `POST /api/ai/caption {pet_id, media_id}` → `{caption, category, source, model, latency_ms}`
- [ ] Owner Feed **Album** 보기: 날짜 헤더(Oct 9, 2026) 아래 분류 묶음 — 샘플 사진 6장(밥 2·산책 2·낮잠 2) 중 5장 이상 맞는 묶음
- [ ] 업로드 플로우: `uploadMedia` → caption API → `createFeedPost(caption_source='ai')`
- [ ] AI 실패·타임아웃(20s) → fallback 캡션(`caption_source='fallback'`)으로 피드는 항상 생성

---

## 선행 조건

- [Phase 05](phase-05.md) `createFeedPost` 플로우
- [Phase 07.1](phase-07.md) Nebius client
- [Phase 04](phase-04.md) `fetch_as_data_url` (영상은 `so_0` poster 사용 — D12)

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| Vision 캡션 + 분류 태그 (image + video poster) | 영상 여러 프레임 기반 기분 한 줄 → [Phase 11.9](phase-11.md) |
| Owner Feed **Timeline / Album** 토글 — Album = 날짜 → 분류 그리드 | 분류 직접 수정, 사용자 정의 앨범 |
| Backend-only API key | client-side AI |
| 업로드 카드 "Writing a caption…" 로딩 UX | task 완료 게시물 캡션 (Phase 06 고정 문구 유지) |

---

## 작업 상세

| ID | 작업 | 상세 |
| :--- | :--- | :--- |
| 9.1 | caption endpoint | `routers/ai_caption.py`: `assert_on_duty_for`, media가 해당 pet 소유인지 확인, pet name·species 로드 → `prompts/caption/system.md` + user `[image, "Pet: Bori (dog)"]` → reasoning off, `max_tokens` 80, temperature 0.8. 후처리: 따옴표·`<think>` 제거, 200자 초과 시 첫 2문장. 모델 에러/타임아웃 → **200 + `source:"fallback"`**, caption `"{name} had a lovely moment today 🐾"` (프론트는 분기 불필요) |
| 9.2 | Integrate upload | `lib/feed.ts`에 `postPhoto({petId, file})` = `uploadMedia` → `api.post('/api/ai/caption')` → `createFeedPost`. Phase 05의 고정 캡션 호출부 교체 |
| 9.3 | Loading UX | 업로드 즉시 sitter 피드 상단에 임시 카드(로컬 썸네일 + skeleton "Writing a caption…"), 완료 시 실제 카드로 교체 + 토스트 |
| 9.5 | 분류 + 앨범 | 캡션과 같은 호출에서 `category` (`chat_json` — `{caption, category}`; 허용 값 밖이면 `other`). Owner Feed 상단 SegmentedControl **Timeline · Album** — Album = `feed_posts` (+ 06 task·check-in 사진, 07 report 사진)을 로컬 날짜별 → category별 3열 썸네일, 탭 → 상세 모달. 빈 분류는 숨김 |
| 9.4 | (선택) task 사진 캡션 | Phase 06 완료 게시물에도 AI 캡션을 비동기로 추가 (`caption_source` 유지 규칙 결정 후) |

### 프롬프트 Goal (`prompts/caption/system.md`, 영어)

- 1–2 sentences, warm and playful, as if the sitter wrote it to the owner. Use the pet's name once.
- Also return one `category`: `meal` (eating/drinking), `walk` (outdoors on a walk), `nap` (sleeping/resting), `play` (toys, playing), else `other`.
- Describe visible expression and activity only. **No medical claims**, no guessing location/people.
- ≤ 2 emojis. No hashtags.

---

## Definition of Done (DoD)

1. Phase 05 DoD 재테스트 — 캡션이 사람이 쓴 것처럼 보임 (사진 5장 중 4장 이상 팀 합의)
2. sitter UI에 **caption 입력 필드 없음** 유지
3. `MODEL_VISION` 키를 틀리게 설정해도 게시 성공 + fallback 캡션
4. 평균 latency를 `notes/model-ids.md`에 기록 (피드백 로그용)

---

## 산출물

- `backend/app/routers/ai_caption.py`, `backend/app/ai/prompts/caption/system.md`
- Updated `frontend/lib/feed.ts`, `frontend/app/sitter/pets/[petId].tsx`

---

## AI 프롬프트

Playbook §11

---

## 다음 Phase

→ [Phase 07C — 완료 · Life Record](phase-07c.md) → [Phase 10 — 데모·배포](phase-10.md)
