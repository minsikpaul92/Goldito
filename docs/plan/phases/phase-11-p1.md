# Phase 11 — P1: 사진 요청 · 펫 스킨 · 8bit 상태방 · 스티커 · 영상 기분 · Settings · 공지 (+ P2 SFT)

> 공통 전제: [architecture.ko.md](architecture.ko.md). **P0 시나리오 코어(5단계 — [full-process.ko.md](../full-process.ko.md))가 배포 URL에서 동작한 후에만** 시작 (예외: 사용자가 우선순위 변경). 구 11.4 P2 Q&A는 **Stage 1 문의 AI [07B](phase-07b-inquiry.md)로 흡수** (D27).
> 목표 기간: **P1 창 10/17–10/23** (2026-10-14 결정), 그 뒤 11.15(10/24–27) → Phase 10 나머지.
> **현황 (2026-10-16):** ✅ 11.1 사진 요청 (#94) · ✅ 11.11 Settings · What's New (#98) · ✅ 11.5 즐겨찾기 (10-09) · ✅ 11.8 **Save image** (#124) · 🟡 **다이어리 책** DB.1 – DB.6 (#126, 2026-10-16 추가: 표지 먼저 · 손글씨 또는 생성 → Send · 전체/펫별 책 넘기기 · 피드 칸 · Share 이미지/다운로드/공개 링크 — 시나리오 test-guide REPORT-14 · 15, DBK-1 – 9) · 11.3 Tavily는 **12.1 Treat check에서 끝나 생략**. 스티커 만들기 · 다이어리 꾸미기(11.8 앞부분)와 기분 도구(11.9 앞부분)는 **Phase 12로 당겨 끝남**(D61).
> **2026-10-19 갱신:** 11.12 다마고치는 P0 큐 1번으로 올라왔다 ([#184](https://github.com/minsikpaul92/Goldito/issues/184)). 11.15는 오너 가입 상세로 확장되어 2번이다 ([#185](https://github.com/minsikpaul92/Goldito/issues/185), Groq 음성과 Tavily 유지). 11.16 다이어리 수정([#186](https://github.com/minsikpaul92/Goldito/issues/186))과 11.17 Petstagram([#187](https://github.com/minsikpaul92/Goldito/issues/187))이 새로 생겼다. 뒤로 미룬 11.x는 [phase-13](phase-13-after-hackathon.md).
> **남은 순서 (2026-10-14 기준, 위 갱신이 우선):** 다이어리 책 (#126) → 11.9 피드 영상 mood 칩 → 11.13 말투 루프(슬기 Q.4 데이터 필요) → **11.15**(맨 마지막, 별도 명세). 지금 안 함: 11.2 · 11.6 · 11.14. 11.10 · 11.12는 묵의 팔레트 · 픽셀 아트가 오면. P2 11.7(SFT)은 보여주기용 (D43). 구 11.4 Q&A는 07B로 흡수.

## Goal

Stage 4 돌봄 중 견주가 원할 때 **사진 요청**을 보내고, 알림장을 **반려동물 누끼 스티커로 자동 꾸민 카드**로 보내며, 영상에서 **보이는 행동으로 기분 한 줄**을 전하고, 키즈노트의 **공지 팝업**을 추가한다.

### Goal 달성 기준

- [x] Owner **Request photo** 1탭 → sitter 알림 → sitter가 다음 사진을 올리면 요청 자동 완료 + owner 알림 (11.1, #94)
- [ ] Owner가 pet 사진 1장 업로드 → AI가 털 색을 분석해 앱 스킨(테마 프리셋)이 그 pet 색으로 바뀜 — pet 전환 시 스킨도 전환
- [ ] 알림장이 반려동물 누끼 스티커로 꾸민 그림일기로 보이고, 한 장을 **이미지로 저장**해 공유 — 꾸미기는 12.3b · 12.4 ✅(견주 · 시터가 직접), Save image는 11.8. AI가 테마 · 스티커를 자동으로 고르는 부분은 보류(아래 11.8)
- [ ] 영상 업로드 → 피드 카드에 관찰 기반 기분 칩 ("looks relaxed and playful") — 의학적 판단 문구 없음
- [x] 세이프티 Tavily 출처 링크 — 12.1 Treat check에서 끝나 생략
- [ ] Sitter 공지 작성 → owner 앱 실행 시 팝업 1회
- [x] **Settings → What's New**에서 in-app **패치노트** 확인 ([CHANGELOG.md](../../CHANGELOG.md)) (11.11, #98)
- [ ] Owner Home **8bit Pet status room** — 밥·배변·기분·다음 task 한눈에 ([pet-status-room.ko.md](../pet-status-room.ko.md))

---

## 작업 상세

| ID | 기능 | DB (`014*.sql`) | 동작 | UI |
| :--- | :--- | :--- | :--- | :--- |
| 11.1 | ✅ 2026-10-15 (#94) 사진 요청 — **`014_photo_requests.sql`** (호스팅 DB 적용됨, S1 – S4 · test-guide PHOTO): 요청은 예약(돌봄 기간)에 묶이고 쓰기는 RPC `request_photo(pet)`만(`not_in_care` · `not_allowed`, 열린 요청이 있으면 그것을 돌려줌), 다음 공유 사진이 완료하면 견주 알림은 `photo_request_fulfilled` 하나만 (`feed_post` 대신) | `photo_requests(id, pet_id, booking_id, owner_id, sitter_id, status 'open'\|'fulfilled', fulfilled_post_id, created_at)` · RLS: owner insert/select own, sitter select `is_sitter_of(pet_id)` (확정 예약 기간) | owner insert → 트리거 sitter `photo_request` 알림. `feed_posts` insert 트리거 확장: 해당 pet의 open 요청을 fulfilled + owner 알림 "Here's the photo you asked for 📷" | Owner Feed 상단 **Request photo** (open 요청 있으면 "Requested · waiting" 비활성). Sitter **Home** 상단 노란 배너 → 탭 → pet 피드 + Photo |
| 11.2 | 공지 | `notices(id, sitter_id, title, body, starts_at, ends_at)`, `notice_reads(notice_id, user_id)` (근무일은 P0 `sitter_availability`로 이동) | owner는 확정 예약이 있는 시터의 공지 select. 앱 실행 시 active & unread 공지 → 모달 → `notice_reads` insert | Sitter: 공지 작성 화면(텍스트 허용 — 드문 작업). Owner: 팝업 |
| 11.5 ✅ | 즐겨찾기 시터 — **2026-10-09 앞당겨 완료** (`011h`, FB-28) · 아래는 원래 설계 | `owner_favorite_sitters(owner_id, sitter_id)` — 예약 전이라도 단골로 고정 | - | 시터 카드 ☆ / "Your sitters" 상단 |
| 11.6 | 반복 근무 패턴 | `sitter_availability`에 `weekdays int[]` 추가 (예: 토·일만 open) — 스케줄·검색 계산에 반영 | - | 캘린더 "Every weekend" 토글 |
| 11.3 | ✅ 생략 — Tavily in safety는 **12.1 Treat check**에서 끝남 ([phase-12-snap.md](phase-12-snap.md), [tavily.ko.md](../tavily.ko.md)) | - | - | - |
| 11.7 | (P2, 보여주기용) SFT 파인튜닝 | - | **앱 런타임에는 쓰지 않는다**(D43). 앱의 말투는 Nemotron + 말투 카드 + few-shot(07B.8)이 담당하고, 새 데이터가 SFT를 돌릴 만큼 쌓이기 어렵다. 이 항목은 "이렇게 확장할 수 있다"를 보여주는 자료로만 둔다: ① README/DevPost *Future work*에 계획 한 단락(대상 `google/gemma-4-E4B-it`, LoRA, 8K, $0.40/1M tokens, 서빙은 Dedicated Endpoint라 상시 서비스 불가) ② 학습 데이터 형식 명세(Data Lab `.jsonl` Conversational: system / user=익명화한 견주 메시지(+앞 2~4턴) / assistant=시터 답, 금액·날짜는 `{PRICE}`·`{DATE}`, 학습 + 검증 약 10% 대화 단위 분할, 숨긴 시험용 약 50건) ③ (선택) 슬기의 익명화 데이터가 이미 있을 때만 학습 1회(약 $2~3, 서빙 없음)를 돌려 콘솔 스크린샷을 남김. Nemotron은 마법사에 없고 파인튜닝 Not available, RFT는 신청하지 않음, 중국 모델(Qwen3 등)로 바꿔도 서빙 제약은 같음, 서버리스 LoRA 서빙은 문서상 Llama-3.1-8B·3.3-70B만 확인됨. 먼저 확인할 것(실제로 돌릴 때만): zero-retention과 제3자 처리 고지. 시도 결과는 README 피드백에 기록 | - |
| 11.8 | ✅ 2026-10-16 (#124, Diary book #126에서 Share 시트 안으로) **꾸민 그림일기 Save image** — 스티커 만들기(브라우저 오리기) · 다이어리 꾸미기 · 기본 스티커 9장은 **Phase 12.3a · 12.3b · 12.4에서 끝남**(D61, `pet_stickers` · `report_decor` = `013b`). 여기 남은 것은 **Save image** 하나: 🟡 `features/snap/diaryImage.ts`(종이를 캔버스에 다시 그림 — 글은 DOM 줄바꿈 · 글꼴 그대로, 스티커는 꾸미기 항목으로, 2배 해상도 PNG) + `DecoratedReport` **⬇ Save image**(견주 · 시터, 웹) · e2e `decor.spec.ts` · test-guide SNAP-24. **보류:** 원래 설계의 AI 자동 꾸밈(`POST /api/ai/report-decor` → 테마 4종 · 프리셋 스티커 선택 + Shuffle) — 12.3에서 사람이 직접 꾸미는 쪽으로 바뀌어 큐에 없음, 다시 하려면 결정 · 묵의 테마 에셋 필요 | - (새 DB 없음) | 브라우저가 그린 종이 → canvas → `toBlob` → `goldito-{펫}-diary-{날짜}.png` 다운로드. 사진 · 스티커는 `crossOrigin` 다시 로드, 실패한 것은 빼고 토스트로 개수 안내 | 다이어리 종이 아래 **✨ Decorate · ⬇ Save image** |
| 11.9 | **영상 기분 한 줄** (Phase 09 확장) — 기분 도구는 **Phase 12.2에서 끝남**(D61, 펫별 박스 + 감정 %, `/api/ai/pet-mood`); 여기 남는 것은 피드 카드의 기분 칩(그 API 재사용) — 아래 설계는 원안 | `feed_posts.mood text null check in ('playful','relaxed','curious','sleepy','excited','uneasy')` | 영상 업로드 시 caption API가 Cloudinary `so_` 오프셋으로 프레임 3–4장 추출 → `MODEL_VISION`에 여러 장 입력 → 관찰 JSON `{activities[], body_language[], energy}` → `MODEL_FAST`가 캡션 + `mood` 생성. **짖음·오디오 분석 안 함** (공개 연구 정확도 3단계 분류 약 36–57% — 신뢰 불가). 프롬프트: 보이는 행동만, "looks/seems" 표현, 의학·통증 추정 금지. `uneasy`는 알림 강조 없이 캡션에만. 일일 `mood` 목록은 알림장 `source_snapshot` 입력에 포함. **Fun mood meter (D42):** 피드 카드·영상에 "Joy 70% · Excited 55%" 게이지 + 고정 문구 "For fun only — not a behavior or health assessment". 축 = Joy / Calm / Curious / Sleepy / Excited. 퍼센트 = 모델 확률이 아니라 **(A) 비전 모델이 뽑은 보이는 행동 태그**(tail wagging, mouth open, eating…)를 규칙으로 점수화 + **(B) 프레임별 분류기 결과의 비율**(영상에서 happy로 분류된 프레임 %). B 모델 = `agentmish/dog-emotion-classifier-v2`(ViT, Apache-2.0, 서버 CPU 추론, 정확도 86% — 소규모 Kaggle 학습 데이터라 실제 영상에서는 떨어질 수 있음). `Dewa/dog_emotion_v2`는 라이선스 미표기라 쓰지 않음. 학습 데이터셋 라이선스가 불명확하거나 비용이 크면 **A만 쓰거나 기능 제외**(핵심 기능 아님). 불안·통증 등 부정 감정은 퍼센트로 표시하지 않고 관찰 문장만. 자세 추정(DeepLabCut SuperAnimal)은 해커톤 후 | 피드 카드에 mood 칩 (예: 🎾 Playful) |
| 11.10 | **펫 털 색 스킨** (3.0 Theme provider 위에) | `pets.avatar_media_id uuid null references media` · `pets.theme text null` (프리셋 키, null = `default`) · `media.purpose`에 `'pet_avatar'` 추가 | Owner가 pet 프로필에서 사진 업로드 — `POST /api/media/sign`에 owner + `purpose='pet_avatar'` 허용(`is_owner_of(pet_id)`) → `POST /api/ai/pet-theme {pet_id, media_id}` → `MODEL_VISION`이 털 색 JSON `{coat_colors[], pattern, confidence}` → **서버 규칙으로 고정 프리셋 6–8개 중 가장 가까운 것 선택** (모델 hex를 그대로 UI에 쓰지 않음 — 대비·조명 오류 방지) → `pets.theme` 저장. 실패·저신뢰 → `default`. Owner는 프리셋 직접 변경 가능 | Pet 프로필 사진 + "Your app now matches Max 🐶" 미리보기 → **Keep** / 다른 프리셋 선택. 앱 전체 스킨 = 선택된 pet 테마 (sitter 화면도 담당 pet 테마). 프리셋 팔레트는 디자이너 제작 |
| 11.11 | ✅ 2026-10-15 **Settings · What's New (패치노트)** — `app/settings.tsx`, What's New = `docs/CHANGELOG.md` → `node scripts/changelog.mjs` → `features/settings/changelog.json`(커밋, CI가 일치 확인). 안 읽은 표시(dot)는 안 함 | - | **헤더 Profile 안 Settings**(D47; 단독 `/settings` 탭 아님 — redirect OK): **Account** · **Notifications** stub · **What's New** — [`docs/CHANGELOG.md`](../../CHANGELOG.md) … **Sitter Earnings**(추후, D47b)도 Profile 섹션. **릴리스 규칙:** demo/prod 배포마다 CHANGELOG + What's New 동시 갱신 | Profile → Settings list · What's New · optional unread dot |
| 11.12 | **8bit Pet status room** (Tamagotchi-style) | - (파생 상태만 — [pet-status-room.ko.md](../pet-status-room.ko.md)) | `get_pet_status` 또는 client `lib/petStatus.ts` — 오늘 check-ins + task_logs → fed/hungry, potty, mood, next task · **8bit sprite** by species+breed (demo: Maltese, generic cat) · mood/hunger → sprite state · tap → Activity | Owner `/owner/` Home 상단 **Pet room** 카드 · 디자이너: `frontend/assets/pixel-pets/` **2026-10-19 결정 ([#184](https://github.com/minsikpaul92/Goldito/issues/184), 계획만):** 파생 상태에 더해 시터가 밥 · 산책 · 응가 · 낮잠을 탭해 기록하고(기존 `care_checkins` 재사용) 오너가 본다. 홈 히어로는 스와이프 페이지, 스프라이트는 종 × 털색 × 기분 프리셋(묵의 픽셀 펫). 케어를 잘 마치면 시터가 메달로 아카이브(이후 동작은 나중). 상세: [pet-status-room.ko.md](../pet-status-room.ko.md) § 7 |
| 11.13 | **말투 학습 루프 고도화** (D35) | - | 7B.8/7B.9가 쌓는 `tone_samples`를 활용: ① 시터 설정에 **수정 비율 추이**(주간 edit ratio) 표시 — 데모 지표 "수정 비율 42% → 9%" ② 주 1회 Nemotron이 수정 내역(초안 vs 최종본)을 요약해 **스타일 가이드 개정안**을 제안 → 시터가 Accept / Skip ③ 알림장·캡션처럼 수정 없이 나가는 출력에는 시터용 👍/👎 + 사유 칩(Too long · Too formal · Wrong info · Not my style) — 문의 답장은 승인·수정 행동이 이미 신호이므로 불필요. 누적 쌍이 충분하면 11.7 SFT 입력으로 사용(KTO는 약 1천~5천 개 양질 예시 필요, 해커톤 범위 밖) | 설정에 edit ratio 그래프, 스타일 가이드 개정 카드 |
| 11.14 | **확정 후 서비스 방식 변경 요청** (D40) | - | 03B 3B.5의 변경 제안 카드를 서비스 방식(Boarding ↔ House sitting)까지 확장: 요청 → 상대 승인 시 `service_type` 변경(+ 장소·동의서·견적 재계산, 이미 결제했다면 차액은 해커톤 후), 거부 시 변경 요청만 취소·예약 유지 | 변경 요청 카드에 서비스 방식 선택 |
| 11.15 | **펫 프로필 온보딩 · "Max at a glance"** (**P0 큐의 맨 마지막에 구현**, 2026-10-10 결정 — 오너 가입 직후 첫 펫 등록에서만, 일정은 [명세 §9](../pet-profile-onboarding.ko.md)) | `pets.profile jsonb`(답 · 출처 · 단계), `breed_notes`(Tavily 캐시) — `014_p1.sql` | 한 화면 한 질문 · 큰 글씨 · 4지선다 18문항(차트 12 + 안전 6) · 사진(품종/색 제안) · 음성(사실 추출, 브라우저 음성 인식) · 시터 카드 5각형 + 경고 칩 · 품종 신체 필요(Tavily + 정적 JSON). **명세 전체: [pet-profile-onboarding.ko.md](../pet-profile-onboarding.ko.md)** | 시터 요청 카드 · 펫 디테일에 "at a glance" 카드, 등록 흐름 **2026-10-19 갱신 ([#185](https://github.com/minsikpaul92/Goldito/issues/185)):** 맨 마지막이 아니라 P0 큐 2번. 자기소개 · 펫 사진 · 위치 · 알레르기와 체크리스트 · 성격검사(5축)를 같은 흐름에 넣는다. 순서 S1 → S3 음성(Groq, 키 [#158](https://github.com/minsikpaul92/Goldito/issues/158)) → S2 사진 → S4 Tavily, 전부 유지하되 모자라면 아래부터 자른다 |
| 11.16 | **다이어리 수정** ([#186](https://github.com/minsikpaul92/Goldito/issues/186), 2026-10-19) | 새 테이블 없음 | 오너 작성 화면 추가 (`owner/(tabs)/diary.tsx`에 작성 UI가 없음), 케어 중인 시터가 실제로 쓸 수 있는지 먼저 확인, Snap에서 만든 스티커를 다이어리에서 사용, AI 칩 · 사진 인식 재확인 | 오너 다이어리 작성, 시터 작성, 스티커 트레이 |
| 11.17 | **Petstagram** ([#187](https://github.com/minsikpaul92/Goldito/issues/187), 2026-10-19, 가장 먼저 자르는 쪽) | 공개 범위(`feed_posts.visibility`에 공개 추가 또는 별도 플래그) + 반응 테이블, RLS. 비공개는 본인 앨범 | 오너가 올린 사진을 공개 또는 비공개로, 공개는 다른 오너의 공개 피드에 노출, 반응은 이모지 5개 안팎(오너당 사진당 하나), 댓글 없음, 팔로우는 여유 있을 때 | Feed에 공개 탭, 올릴 때 공개 스위치, 반응 줄. 위치와 시터 이름은 공개 글에서 제외 |

---

### 11.12 사진 → 픽셀 머리 (PR #261, 2026-10-21)

오너의 펫 사진에서 16x16 픽셀 펫을 만든다. 프리셋(종 × 털색)이 그 펫처럼 안 보일 때를 위한 것. AI 생성은 하지 않는다(브라우저에서 MediaPipe 오리기 + 계산만).

| Step | 내용 | 확인 |
| :--- | :--- | :--- |
| **PH.1** ✅ | `features/pets/sprites/pixelize.ts`: 오린 펫(`features/snap/cutout.ts`의 `segmentAt` 마스크) → 위쪽 정사각형으로 자르기(머리 쪽) → 14x14 칸 평균색 → median cut으로 6색 → 1칸 어두운 외곽선 → `{ v: 1, palette, rows }`(약 350자, `pets.profile`에 들어갈 크기). `PetSprite`의 `head` 프롭이 프리셋 대신 그린다. dev 갤러리 `/dev/sprites` 맨 위 **From a photo**(샘플 사진이나 내 사진) | 🤖 `pet-sprite.spec.ts`(저장 모양 검사, 테스트 훅으로 사진 → 머리) · 실제 MediaPipe로 샘플 사진 확인 |
| **PH.2** ✅ | 오너 Pet 페이지 펫 방 아래 **🎨 Make from photo** → 시트(`components/pet/PixelHeadSheet.tsx`): Pick a photo(샘플 · 내 사진) → 미리보기 → **Save** → `pets.profile.pixel_head`(`savePixelHead`, 다른 답은 그대로). **Try another photo** · 저장된 머리가 있으면 **Use the preset**(지우기). 오너 Pet 페이지 펫 방이 바로 그 머리로 그려짐. 오너가 `profile`을 직접 고칠 수 있어(014v grant + `pets_update`) 마이그레이션 없음 | 🤖 `pet-room.spec.ts`(저장 · 다른 답 유지 · 되돌리기) |
| **PH.3** ✅ | 시터 Home 펫 방도 저장된 머리로(`usePetLook` · `getPetLook`이 털색과 머리를 함께 읽음). 사진 머리에는 기분 얼굴을 그리지 않고 기분 글자 · 흔들림 그대로, sleepy만 Z(`withZzz`, 오너 쪽도 같음) | 🤖 `pet-room-sitter`(사진 머리 · 낮잠 Z) · `pet-sprite`(Z만 바뀜) |
| PH.4 | test-guide TAMA-10 사람 확인(실제 사진 여러 장, 개 · 고양이), TODO 정리 | 사람 |

### 11.12 시터 배지 (PR #261, 2026-10-21)

펫 메달(`015b`)은 시터가 펫에게 주고 오너가 Pet 페이지에서 본다. 시터도 받는 배지가 따로 있다: **시터 Profile 맨 위 Badges**. 저장하지 않고 데이터에서 계산(`features/sitters/badgeApi.ts`), 마이그레이션 없음.

| Badge | 언제 | 근거 |
| :--- | :--- | :--- |
| 🐾 First stay | 첫 스테이를 마친 날(첫 pick-up 완료) | `booking_handoffs` (시터 자기 예약) |
| ⭐ First 5-star review | 첫 별 5개 리뷰를 받은 날 | `reviews` (시터 자기 리뷰) |
| 그림자 4칸 "Soon" | 나중에 추가할 배지 자리 | - |

아직 못 받은 배지는 회색 "Not yet". 오너가 보는 시터 공개 프로필에 배지를 보이는 것과 다른 배지(10번째 스테이 등)는 나중. 🤖 `sitter-badges.spec.ts`.

한계: 옆모습 전신 사진은 몸까지 들어간다(머리 감지 없음). 얼굴 감지로 머리만 자르기는 나중.

## Definition of Done (DoD)

1. 11.1 ✅: 두 브라우저에서 요청 → 게시 → 자동 완료까지 새로고침 없이 (사람 확인은 test-guide PHOTO)
2. 11.3: 생략 (12.1에서 Tavily 출처 끝남)
3. README에 Tavily 사용 설명 + 데모 영상에 출처 링크 장면 — Phase 10 README에서
4. 11.8: 사진 1장 → 스티커 → 다이어리 꾸미기(12.3 ✅) → **⬇ Save image** → 받은 PNG가 화면의 종이와 같음(글 · 사진 · 두 사람의 스티커 앞/뒤 층). 데모 영상 18:00 장면에 사용
5. 11.9: 강아지·고양이 영상 각 2개 → 캡션과 mood가 화면 속 행동과 맞음 (팀 합의), 의학적 표현 0건
6. 11.10: 털 색이 다른 강아지·고양이 사진 4장 → 3장 이상 맞는 프리셋, 모든 프리셋에서 텍스트 대비 ≥ 4.5:1, DANGER 모달 색은 스킨과 무관하게 동일
7. 11.11 ✅: Settings → What's New에 최신 CHANGELOG 항목 · 앱 version 표시
8. 11.12: sitter check-in 후 Home room HUD·sprite 상태 갱신 · Max/Mochi ≥3 states

---

## 산출물

- ✅ `supabase/migrations/014_photo_requests.sql` (11.1) — 다른 11.x DB는 다음 빈 이름(`supabase/README.md` § Naming)
- `backend/app/routers/ai_pet_theme.py`, `backend/app/ai/prompts/pet_theme/system.md` (11.10)
- `prompts/caption/video_observe.md` (11.9) · (보류) `backend/app/routers/ai_report_decor.py` + `prompts/report_decor/system.md` (11.8 AI 자동 꾸밈)
- Frontend: ✅ Request photo 버튼 · ✅ **Profile → Settings + What's New** · 🟡 `features/snap/diaryImage.ts` + `DecoratedReport` Save image (11.8) · 피드 mood 칩 (11.9) · NoticeModal, Sitter notices 화면 (11.2) · **`PetStatusRoom`** + `lib/petStatus.ts` (11.12 — Owner·Sitter Home)
- 디자인: 테마 4종·스티커·스킨 팔레트 (11.8/10) · **8bit pixel pet sprites** — breed×mood states for demo breeds (11.12, [pet-status-room.ko.md](../pet-status-room.ko.md))
