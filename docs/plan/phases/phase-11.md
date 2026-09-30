# Phase 11 — P1: 사진 요청 · 스티커 알림장 · 영상 기분 · 공지 (+ P2 Q&A)

> 공통 전제: [architecture.ko.md](architecture.ko.md). **P0(Phase 05–09)가 배포 URL에서 동작한 후에만** 시작 (예외: 사용자가 우선순위 변경).
> 목표 기간: 10/12 – 10/18 (계획 3주차). **순서: 11.1 → 11.8 → 11.9 → 11.2** (데모 영상·디자인 점수에 효과 큰 순). 11.3은 08.7을 못 했을 때만.

## Goal

"PawNote의 하루" 13:00 구간(**사진 요청**)을 채우고, 알림장을 **반려동물 누끼 스티커로 자동 꾸민 카드**로 보내며, 영상에서 **보이는 행동으로 기분 한 줄**을 전하고, 키즈노트의 **공지 팝업**을 추가한다.

### Goal 달성 기준

- [ ] Owner **Request photo** 1탭 → sitter 알림 → sitter가 다음 사진을 올리면 요청 자동 완료 + owner 알림
- [ ] 알림장 전송 시 AI가 고른 테마·스티커(반려동물 누끼 포함)로 꾸민 카드가 owner에게 보임 — sitter는 탭만 (텍스트 입력 없음)
- [ ] 영상 업로드 → 캡션에 관찰 기반 기분 한 줄 ("looks relaxed and playful") — 의학적 판단 문구 없음
- [ ] 세이프티 Tavily 출처 링크 — **08.7에서 끝났으면 생략**
- [ ] Sitter 공지 작성 → owner 앱 실행 시 팝업 1회

---

## 작업 상세

| ID | 기능 | DB (`008_p1.sql`) | 동작 | UI |
| :--- | :--- | :--- | :--- | :--- |
| 11.1 | 사진 요청 | `photo_requests(id, pet_id, owner_id, status 'open'\|'fulfilled', fulfilled_post_id, created_at)` · RLS: owner insert/select own, sitter select assigned | owner insert → 트리거 sitter `photo_request` 알림. `feed_posts` insert 트리거 확장: 해당 pet의 open 요청을 fulfilled + owner 알림 "Here's the photo you asked for 📷" | Owner Feed 상단 **Request photo** (open 요청 있으면 "Requested · waiting" 비활성). Sitter Today 상단 노란 배너 → 탭 → pet 피드 + Photo |
| 11.2 | 공지 | `notices(id, sitter_id, title, body, starts_at, ends_at)`, `notice_reads(notice_id, user_id)` (근무일은 P0 `sitter_availability`로 이동) | owner는 확정 예약이 있는 시터의 공지 select. 앱 실행 시 active & unread 공지 → 모달 → `notice_reads` insert | Sitter: 공지 작성 화면(텍스트 허용 — 드문 작업). Owner: 팝업 |
| 11.5 | 즐겨찾기 시터 | `owner_favorite_sitters(owner_id, sitter_id)` — 예약 전이라도 단골로 고정 | - | 시터 카드 ☆ / "Your sitters" 상단 |
| 11.6 | 반복 근무 패턴 | `sitter_availability`에 `weekdays int[]` 추가 (예: 토·일만 open) — 스케줄·검색 계산에 반영 | - | 캘린더 "Every weekend" 토글 |
| 11.3 | Tavily in safety | - | **Phase 08.7 (stretch)로 앞당김.** 08에서 못 했을 때만 여기서 동일 스펙으로 진행 ([phase-08.md](phase-08.md) 8.7, [tavily.ko.md](../tavily.ko.md) 검색 규칙) | 모달에 "Sources" 섹션 (도메인 + 링크) |
| 11.7 | (P2 아이디어) SFT 파인튜닝 | - | P0 배포 후 여유가 있을 때만. Token Factory SFT로 **익명화한 알림장 데이터**(슬기 정책)로 Nemotron 튜닝 → few-shot 대비 톤·형식 일관성 비교. 먼저 확인: ① Nemotron이 SFT 대상 모델인지 ② 학습 데이터 최소 수량 ③ 비용·소요 시간. 결과는 README 피드백에 기록 (시도만 해도 피드백 가치 있음) | - |
| 11.8 | **스티커 + AI 꾸밈 알림장 카드** | `pet_stickers(id, pet_id, media_id, created_by, created_at)` · `daily_reports.decor jsonb` (`{theme, stickers:[{kind:'pet'\|'preset', ref, x, y, scale, rotate}]}`) · RLS: `can_access_pet` select, owner/on-duty sitter insert | **누끼:** 피드 사진 길게 누르기 → "Make sticker" → Cloudinary 배경 제거 변환(`e_background_removal`, 애드온 — 무료 한도 확인. 막히면 백엔드 `rembg`) URL을 `pet_stickers`에 저장 (새 업로드 없음). **꾸밈:** `send_daily_report` 직전 `POST /api/ai/report-decor` (MODEL_FAST) — 알림장 본문 + 퀵탭 → `{theme: 'sunny'\|'cozy'\|'playful'\|'calm', preset_stickers[] (고정 목록에서만 선택)}` JSON, 배치는 서버 규칙(모서리·겹침 없음). 실패 시 `theme='calm'`, 스티커 없음 | Sitter: 전송 전 미리보기 카드 + **Shuffle** 버튼(재생성)만. Owner: 알림장 = 꾸민 카드 + **Save image** (공유용). 스티커·테마 에셋은 묵 제작 |
| 11.9 | **영상 기분 한 줄** (Phase 09 확장) | `feed_posts.mood text null check in ('playful','relaxed','curious','sleepy','excited','uneasy')` | 영상 업로드 시 caption API가 Cloudinary `so_` 오프셋으로 프레임 3–4장 추출 → `MODEL_VISION`에 여러 장 입력 → 관찰 JSON `{activities[], body_language[], energy}` → `MODEL_FAST`가 캡션 + `mood` 생성. **짖음·오디오 분석 안 함** (공개 연구 정확도 3단계 분류 약 36–57% — 신뢰 불가). 프롬프트: 보이는 행동만, "looks/seems" 표현, 의학·통증 추정 금지. `uneasy`는 알림 강조 없이 캡션에만. 일일 `mood` 목록은 알림장 `source_snapshot` 입력에 포함 | 피드 카드에 mood 칩 (예: 🎾 Playful) |
| 11.4 | (P2) Q&A 1차 답변 | `messages(id, pet_id, sender_id, body, ai_generated bool, needs_sitter bool, created_at)` | owner 메시지 → `POST /api/ai/qa` (MODEL_FAST) — pet 프로필 + 오늘 source_snapshot만 근거. 확신 없으면 "Your sitter will reply soon." + sitter 알림 | 채팅 화면 1개 |

---

## Definition of Done (DoD)

1. 11.1: 두 브라우저에서 요청 → 게시 → 자동 완료까지 새로고침 없이
2. 11.3 (08.7에서 안 했을 때만): WARNING 라벨(animal fat)로 Tavily 호출 로그 + 모달 출처 1개 이상 (런타임 호출 = 보너스상 요건)
3. README에 Tavily 사용 설명 + 데모 영상에 출처 링크 장면
4. 11.8: 사진 1장 → 스티커 생성 → 알림장 전송 → owner 화면에 꾸민 카드 (AI 테마 JSON 실패 시에도 카드 표시). 데모 영상 18:00 장면에 사용
5. 11.9: 강아지·고양이 영상 각 2개 → 캡션과 mood가 화면 속 행동과 맞음 (팀 합의), 의학적 표현 0건

---

## 산출물

- `supabase/migrations/008_p1.sql`
- `backend/app/services/tavily.py`, `backend/app/routers/ai_report_decor.py`, `backend/app/routers/ai_qa.py`(P2)
- `backend/app/ai/prompts/report_decor/system.md`, `prompts/caption/video_observe.md`
- Frontend: Request photo 버튼, NoticeModal, Sitter notices/schedule 화면, `ReportCard`(꾸밈 렌더 + Save image), Make sticker 액션, mood 칩
- 디자인(묵): 테마 4종 배경·프레임, 프리셋 스티커 세트 (앱 번들 에셋)
