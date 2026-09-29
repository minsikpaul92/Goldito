# Phase 11 — P1: 사진 요청 · 공지 · Tavily (+ P2 Q&A)

> 공통 전제: [architecture.ko.md](architecture.ko.md). **P0(Phase 05–09)가 배포 URL에서 동작한 후에만** 시작 (예외: 사용자가 우선순위 변경).
> 목표 기간: 10/12 – 10/18 (계획 3주차). 11.1과 11.3이 데모·보너스상에 가장 효과적 → 이 순서로.

## Goal

"PawNote의 하루" 13:00 구간(**사진 요청**)을 채우고, 세이프티 가드에 **Tavily 웹 근거**를 붙여 Best Use of Tavily 자격을 얻으며, 키즈노트의 **공지 팝업**을 추가한다.

### Goal 달성 기준

- [ ] Owner **Request photo** 1탭 → sitter 알림 → sitter가 다음 사진을 올리면 요청 자동 완료 + owner 알림
- [ ] 세이프티 `unknown_ingredients` / WARNING 시 Tavily 검색 → Ultra 재판단 → 모달에 **출처 링크**
- [ ] Sitter 공지 작성 → owner 앱 실행 시 팝업 1회

---

## 작업 상세

| ID | 기능 | DB (`008_p1.sql`) | 동작 | UI |
| :--- | :--- | :--- | :--- | :--- |
| 11.1 | 사진 요청 | `photo_requests(id, pet_id, owner_id, status 'open'\|'fulfilled', fulfilled_post_id, created_at)` · RLS: owner insert/select own, sitter select assigned | owner insert → 트리거 sitter `photo_request` 알림. `feed_posts` insert 트리거 확장: 해당 pet의 open 요청을 fulfilled + owner 알림 "Here's the photo you asked for 📷" | Owner Feed 상단 **Request photo** (open 요청 있으면 "Requested · waiting" 비활성). Sitter Today 상단 노란 배너 → 탭 → pet 피드 + Photo |
| 11.2 | 공지 | `notices(id, sitter_id, title, body, starts_at, ends_at)`, `notice_reads(notice_id, user_id)` (근무일은 P0 `sitter_availability`로 이동) | owner는 확정 예약이 있는 시터의 공지 select. 앱 실행 시 active & unread 공지 → 모달 → `notice_reads` insert | Sitter: 공지 작성 화면(텍스트 허용 — 드문 작업). Owner: 팝업 |
| 11.5 | 예약 날짜 변경 | RPC `reschedule_booking(p_booking, p_days)` — 같은 시터에게 새 날짜로 재요청 (확정된 날은 새 요청 수락 시 교체) | - | 예약 상세 **Change dates** |
| 11.6 | 반복 근무 패턴 | `sitter_availability`에 `weekdays int[]` 추가 (예: 토·일만 open) — 검색 계산에 반영 | - | 캘린더 "Every weekend" 토글 |
| 11.3 | Tavily in safety | `safety_checks.result_json.sources[]` 추가 (스키마 변경 없음) | Phase 08 파이프라인 step 4 뒤: `unknown_ingredients` 또는 hidden_sources 각 ≤ 3개 → `tavily.search(f"Is {ing} safe for {species}s? Does it contain {allergen}?", max_results=3, include_answer=True)` → 결과 요약을 Ultra에 추가 입력 → 최종 판정. 제품명 있으면 `"{product} {species} treat recall"` 1회. 총 8초 제한, 실패 시 Tavily 없이 결과 | 모달에 "Sources" 섹션 (도메인 + 링크) |
| 11.4 | (P2) Q&A 1차 답변 | `messages(id, pet_id, sender_id, body, ai_generated bool, needs_sitter bool, created_at)` | owner 메시지 → `POST /api/ai/qa` (MODEL_FAST) — pet 프로필 + 오늘 source_snapshot만 근거. 확신 없으면 "Your sitter will reply soon." + sitter 알림 | 채팅 화면 1개 |

---

## Definition of Done (DoD)

1. 11.1: 두 브라우저에서 요청 → 게시 → 자동 완료까지 새로고침 없이
2. 11.3: WARNING 라벨(animal fat)로 Tavily 호출 로그 + 모달 출처 1개 이상 (런타임 호출 = 보너스상 요건)
3. README에 Tavily 사용 설명 + 데모 영상에 출처 링크 장면

---

## 산출물

- `supabase/migrations/008_p1.sql`
- `backend/app/services/tavily.py`, `backend/app/routers/ai_qa.py`(P2)
- Frontend: Request photo 버튼, NoticeModal, Sitter notices/schedule 화면
