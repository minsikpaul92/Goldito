# Phase 11 — P1: 사진 요청 · 펫 스킨 · 8bit 상태방 · 스티커 · 영상 기분 · Settings · 공지 (+ P2 SFT)

> 공통 전제: [architecture.ko.md](architecture.ko.md). **P0 시나리오 코어(5단계 — [full-process.ko.md](../full-process.ko.md))가 배포 URL에서 동작한 후에만** 시작 (예외: 사용자가 우선순위 변경). 구 11.4 P2 Q&A는 **Stage 1 문의 AI [07B](phase-07b.md)로 흡수** (D27).
> 목표 기간: **P0 배포(Phase 10) 후 남는 시간.** **권장 순서: 11.11 (Settings·패치노트) → 11.1 → 11.10 → 11.12 → 11.8 → 11.9 → 11.2** — 11.11은 작고 CHANGELOG 습관용; 11.12는 Phase 06 check-in 데이터 필요. Tavily(11.3)는 08.7에서 끝났으면 생략.

## Goal

Stage 4 돌봄 중 견주가 원할 때 **사진 요청**을 보내고, 알림장을 **반려동물 누끼 스티커로 자동 꾸민 카드**로 보내며, 영상에서 **보이는 행동으로 기분 한 줄**을 전하고, 키즈노트의 **공지 팝업**을 추가한다.

### Goal 달성 기준

- [ ] Owner **Request photo** 1탭 → sitter 알림 → sitter가 다음 사진을 올리면 요청 자동 완료 + owner 알림
- [ ] Owner가 pet 사진 1장 업로드 → AI가 털 색을 분석해 앱 스킨(테마 프리셋)이 그 pet 색으로 바뀜 — pet 전환 시 스킨도 전환
- [ ] 알림장 전송 시 AI가 고른 테마·스티커(반려동물 누끼 포함)로 꾸민 카드가 owner에게 보임 — sitter는 탭만 (텍스트 입력 없음)
- [ ] 영상 업로드 → 캡션에 관찰 기반 기분 한 줄 ("looks relaxed and playful") — 의학적 판단 문구 없음
- [ ] 세이프티 Tavily 출처 링크 — **08.7에서 끝났으면 생략**
- [ ] Sitter 공지 작성 → owner 앱 실행 시 팝업 1회
- [ ] **Settings → What's New**에서 in-app **패치노트** 확인 ([CHANGELOG.md](../../CHANGELOG.md))
- [ ] Owner Home **8bit Pet status room** — 밥·배변·기분·다음 task 한눈에 ([pet-status-room.ko.md](../pet-status-room.ko.md))

---

## 작업 상세

| ID | 기능 | DB (`013_p1.sql`) | 동작 | UI |
| :--- | :--- | :--- | :--- | :--- |
| 11.1 | 사진 요청 | `photo_requests(id, pet_id, owner_id, status 'open'\|'fulfilled', fulfilled_post_id, created_at)` · RLS: owner insert/select own, sitter select `is_sitter_of(pet_id)` (확정 예약 기간) | owner insert → 트리거 sitter `photo_request` 알림. `feed_posts` insert 트리거 확장: 해당 pet의 open 요청을 fulfilled + owner 알림 "Here's the photo you asked for 📷" | Owner Feed 상단 **Request photo** (open 요청 있으면 "Requested · waiting" 비활성). Sitter Today 상단 노란 배너 → 탭 → pet 피드 + Photo |
| 11.2 | 공지 | `notices(id, sitter_id, title, body, starts_at, ends_at)`, `notice_reads(notice_id, user_id)` (근무일은 P0 `sitter_availability`로 이동) | owner는 확정 예약이 있는 시터의 공지 select. 앱 실행 시 active & unread 공지 → 모달 → `notice_reads` insert | Sitter: 공지 작성 화면(텍스트 허용 — 드문 작업). Owner: 팝업 |
| 11.5 | 즐겨찾기 시터 | `owner_favorite_sitters(owner_id, sitter_id)` — 예약 전이라도 단골로 고정 | - | 시터 카드 ☆ / "Your sitters" 상단 |
| 11.6 | 반복 근무 패턴 | `sitter_availability`에 `weekdays int[]` 추가 (예: 토·일만 open) — 스케줄·검색 계산에 반영 | - | 캘린더 "Every weekend" 토글 |
| 11.3 | Tavily in safety | - | **Phase 08.7 (stretch)로 앞당김.** 08에서 못 했을 때만 여기서 동일 스펙으로 진행 ([phase-08.md](phase-08.md) 8.7, [tavily.ko.md](../tavily.ko.md) 검색 규칙) | 모달에 "Sources" 섹션 (도메인 + 링크) |
| 11.7 | (P2 아이디어) SFT 파인튜닝 | - | P0 배포 후 여유가 있을 때만. Token Factory SFT로 **익명화한 시터 대화 데이터**(슬기 정책, D35)로 소형 모델을 튜닝 → few-shot + 검색(07B.8) 대비 말투 일관성·수정 비율 비교. **대상 모델 확정:** `google/gemma-4-E4B-it`(콘솔 마법사 확인: Full fine-tuning, $0.40/1M tokens, 8K 컨텍스트 — 말투에는 4B로 충분). Nemotron 모델은 마법사에 없고 모델 페이지에서도 파인튜닝 Not available이라 후보에서 제외 (2026-10-02). **데이터:** Data Lab에 `.jsonl`(Conversational: system / user=익명화한 견주 메시지(+앞 2~4턴) / assistant=시터 답, 금액·날짜는 `{PRICE}`·`{DATE}`), 학습 + 검증(약 10%, 대화 단위 분할) 두 파일, 별도로 숨긴 시험용 약 50건은 블라인드 평가용. 비용 추정(5,000쌍 × 400토큰 × 3에폭 ≈ 600만 토큰) E4B 약 $2.4. **서빙은 Dedicated Endpoint만**(L40S 시간당 $2 ≈ 하루 $48) → 녹화·평가 때만 켠다, 상시 서비스는 few-shot. **학습 방식: LoRA fine-tuning**(마법사 Training type에서 확인 — 말투만 바꾸므로 Full보다 적합). 먼저 확인: ① LoRA 어댑터를 Dedicated Endpoint 없이 서빙할 수 있는지(카탈로그 `Gemma-4-E4B-it` 페이지의 Public endpoint 항목) ② 최소 데이터 수량·소요 시간 ③ zero-retention과 제3자 처리 고지. RFT(강화 파인튜닝)는 신청하지 않는다. 결과는 README 피드백에 기록 (시도만 해도 피드백 가치 있음) | - |
| 11.8 | **스티커 + AI 꾸밈 알림장 카드** | `pet_stickers(id, pet_id, media_id, created_by, created_at)` · `daily_reports.decor jsonb` (`{theme, stickers:[{kind:'pet'\|'preset', ref, x, y, scale, rotate}]}`) · RLS: `can_access_pet` select, owner/on-duty sitter insert | **누끼:** 피드 사진 길게 누르기 → "Make sticker" → Cloudinary 배경 제거 변환(`e_background_removal`, 애드온 — 무료 한도 확인. 막히면 백엔드 `rembg`) URL을 `pet_stickers`에 저장 (새 업로드 없음). **꾸밈:** `send_daily_report` 직전 `POST /api/ai/report-decor` (MODEL_FAST) — 알림장 본문 + 퀵탭 → `{theme: 'sunny'\|'cozy'\|'playful'\|'calm', preset_stickers[] (고정 목록에서만 선택)}` JSON, 배치는 서버 규칙(모서리·겹침 없음). 실패 시 `theme='calm'`, 스티커 없음 | Sitter: 전송 전 미리보기 카드 + **Shuffle** 버튼(재생성)만. Owner: 알림장 = 꾸민 카드 + **Save image** (공유용). 스티커·테마 에셋은 묵 제작 |
| 11.9 | **영상 기분 한 줄** (Phase 09 확장) | `feed_posts.mood text null check in ('playful','relaxed','curious','sleepy','excited','uneasy')` | 영상 업로드 시 caption API가 Cloudinary `so_` 오프셋으로 프레임 3–4장 추출 → `MODEL_VISION`에 여러 장 입력 → 관찰 JSON `{activities[], body_language[], energy}` → `MODEL_FAST`가 캡션 + `mood` 생성. **짖음·오디오 분석 안 함** (공개 연구 정확도 3단계 분류 약 36–57% — 신뢰 불가). 프롬프트: 보이는 행동만, "looks/seems" 표현, 의학·통증 추정 금지. `uneasy`는 알림 강조 없이 캡션에만. 일일 `mood` 목록은 알림장 `source_snapshot` 입력에 포함. **Fun mood meter (D42):** 피드 카드·영상에 "Joy 70% · Excited 55%" 게이지 + 고정 문구 "For fun only — not a behavior or health assessment". 축 = Joy / Calm / Curious / Sleepy / Excited. 퍼센트 = 모델 확률이 아니라 **(A) 비전 모델이 뽑은 보이는 행동 태그**(tail wagging, mouth open, eating…)를 규칙으로 점수화 + **(B) 프레임별 분류기 결과의 비율**(영상에서 happy로 분류된 프레임 %). B 모델 = `agentmish/dog-emotion-classifier-v2`(ViT, Apache-2.0, 서버 CPU 추론, 정확도 86% — 소규모 Kaggle 학습 데이터라 실제 영상에서는 떨어질 수 있음). `Dewa/dog_emotion_v2`는 라이선스 미표기라 쓰지 않음. 학습 데이터셋 라이선스가 불명확하거나 비용이 크면 **A만 쓰거나 기능 제외**(핵심 기능 아님). 불안·통증 등 부정 감정은 퍼센트로 표시하지 않고 관찰 문장만. 자세 추정(DeepLabCut SuperAnimal)은 해커톤 후 | 피드 카드에 mood 칩 (예: 🎾 Playful) |
| 11.10 | **펫 털 색 스킨** (3.0 Theme provider 위에) | `pets.avatar_media_id uuid null references media` · `pets.theme text null` (프리셋 키, null = `default`) · `media.purpose`에 `'pet_avatar'` 추가 | Owner가 pet 프로필에서 사진 업로드 — `POST /api/media/sign`에 owner + `purpose='pet_avatar'` 허용(`is_owner_of(pet_id)`) → `POST /api/ai/pet-theme {pet_id, media_id}` → `MODEL_VISION`이 털 색 JSON `{coat_colors[], pattern, confidence}` → **서버 규칙으로 고정 프리셋 6–8개 중 가장 가까운 것 선택** (모델 hex를 그대로 UI에 쓰지 않음 — 대비·조명 오류 방지) → `pets.theme` 저장. 실패·저신뢰 → `default`. Owner는 프리셋 직접 변경 가능 | Pet 프로필 사진 + "Your app now matches Bori 🐶" 미리보기 → **Keep** / 다른 프리셋 선택. 앱 전체 스킨 = 선택된 pet 테마 (sitter 화면도 담당 pet 테마). 프리셋 팔레트는 디자이너 제작 |
| 11.11 | **Settings · What's New (패치노트)** | - | 헤더 **Settings** (`/settings`, owner·sitter 공통): **Account** (email read-only, Log out) · **Profile** → `/profile` · **Notifications** (P1 toggles stub OK) · **What's New** (필수) — [`docs/CHANGELOG.md`](../../CHANGELOG.md)를 빌드 시 JSON/MD로 번들하거나 앱 내 `assets/changelog.json` 동기화 · 날짜 역순 · `[Added]`/`[Fixed]` 섹션 · App version (`expo-constants`) · Privacy/Terms placeholder. **릴리스 규칙:** demo/prod 배포마다 CHANGELOG + What's New 동시 갱신 | Settings list · What's New 전용 scroll 화면 · unread dot (optional: `last_seen_changelog_version` in AsyncStorage) |
| 11.12 | **8bit Pet status room** (Tamagotchi-style) | - (파생 상태만 — [pet-status-room.ko.md](../pet-status-room.ko.md)) | `get_pet_status` 또는 client `lib/petStatus.ts` — 오늘 check-ins + task_logs → fed/hungry, potty, mood, next task · **8bit sprite** by species+breed (demo: Maltese, generic cat) · mood/hunger → sprite state · tap → Activity | Owner `/owner/` Home 상단 **Pet room** 카드 · 디자이너: `frontend/assets/pixel-pets/` |
| 11.13 | **말투 학습 루프 고도화** (D35) | - | 7B.8/7B.9가 쌓는 `voice_samples`를 활용: ① 시터 설정에 **수정 비율 추이**(주간 edit ratio) 표시 — 데모 지표 "수정 비율 42% → 9%" ② 주 1회 Nemotron이 수정 내역(초안 vs 최종본)을 요약해 **스타일 가이드 개정안**을 제안 → 시터가 Accept / Skip ③ 알림장·캡션처럼 수정 없이 나가는 출력에는 시터용 👍/👎 + 사유 칩(Too long · Too formal · Wrong info · Not my style) — 문의 답장은 승인·수정 행동이 이미 신호이므로 불필요. 누적 쌍이 충분하면 11.7 SFT 입력으로 사용(KTO는 약 1천~5천 개 양질 예시 필요, 해커톤 범위 밖) | 설정에 edit ratio 그래프, 스타일 가이드 개정 카드 |

---

## Definition of Done (DoD)

1. 11.1: 두 브라우저에서 요청 → 게시 → 자동 완료까지 새로고침 없이
2. 11.3 (08.7에서 안 했을 때만): WARNING 라벨(animal fat)로 Tavily 호출 로그 + 모달 출처 1개 이상 (런타임 호출 = 보너스상 요건)
3. README에 Tavily 사용 설명 + 데모 영상에 출처 링크 장면
4. 11.8: 사진 1장 → 스티커 생성 → 알림장 전송 → owner 화면에 꾸민 카드 (AI 테마 JSON 실패 시에도 카드 표시). 데모 영상 18:00 장면에 사용
5. 11.9: 강아지·고양이 영상 각 2개 → 캡션과 mood가 화면 속 행동과 맞음 (팀 합의), 의학적 표현 0건
6. 11.10: 털 색이 다른 강아지·고양이 사진 4장 → 3장 이상 맞는 프리셋, 모든 프리셋에서 텍스트 대비 ≥ 4.5:1, DANGER 모달 색은 스킨과 무관하게 동일
7. 11.11: Settings → What's New에 최신 CHANGELOG 항목 · 앱 version 표시
8. 11.12: sitter check-in 후 Home room HUD·sprite 상태 갱신 · Bori/Mochi ≥3 states

---

## 산출물

- `supabase/migrations/013_p1.sql`
- `backend/app/routers/ai_pet_theme.py`, `backend/app/ai/prompts/pet_theme/system.md` (11.10)
- `backend/app/services/tavily.py`, `backend/app/routers/ai_report_decor.py`
- `backend/app/ai/prompts/report_decor/system.md`, `prompts/caption/video_observe.md`
- Frontend: Request photo 버튼, NoticeModal, Sitter notices/schedule 화면, `ReportCard`(꾸밈 렌더 + Save image), Make sticker 액션, mood 칩, **`/settings` + What's New**, **`PetStatusRoom`** + `lib/petStatus.ts` (11.12)
- 디자인: 테마 4종·스티커·스킨 팔레트 (11.8/10) · **8bit pixel pet sprites** — breed×mood states for demo breeds (11.12, [pet-status-room.ko.md](../pet-status-room.ko.md))
