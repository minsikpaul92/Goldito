# Phase 07C — 완료: 귀가 리포트 · 리뷰 · Pet Life Record → RAG (Stage 5 Completion)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — **D31 출입 정보 제외**, **D33 RAG**, AI 규칙 §9, 알림 §7
> 제품 흐름: [full-process.ko.md — Stage 5](../full-process.ko.md#stage-5--completion-완료--목표-돌봄-데이터를-pet-life-record--rag에-축적)

## Goal

마지막 인수인계(**Returned** — 03B. 06B가 붙으면 귀가 사진 체크도)와 함께 견주에게 **"Bori is home safe 🏠"** 최종 리포트가 가고, 이어서 **감사 인사 + ★ 5점 리뷰** 요청이 간다. 동시에 이번 돌봄의 데이터(check-in·task·알림장·인수인계 체크·시터 메모·문의 대화·세이프티 경고)를 AI(Super)가 **Pet Life Record**(식습관 · 배변 · 약 반응 · 행동 · 알레르기·주의사항 · 시터 팁)로 정리해 저장하고 **RAG에 인덱싱**한다. 다음 예약에서는 **다른 시터여도** 요청 카드의 "From Bori's Life Record", 문의 AI 답(07B), 케어 체크리스트 초안(06)이 이 기록을 불러온다.

### Goal 달성 기준

- [ ] Mina **Returned** → Jisoo "Bori and Mochi are home safe 🏠" (06B 이후에는 귀가 사진이 ok면 "· photo verified") → 예약 상세에 **Stay summary** 카드(기간 · 알림장 수 · 사진 수 · 완료 task 수 · 마지막 알림장 첫 문장)
- [ ] 바로 뒤 Jisoo `review_requested` "Thanks for trusting Mina! How was Bori's stay? ⭐" → ★5 + (선택) 코멘트 → Mina `review_received` → Mina 시터 프로필 평균 별점·후기 수 갱신
- [ ] Returned 후 1분 안 `life_record_updated` → `/owner/pets/[Bori]/record`: "Eats: finishes 1 cup in the morning · Meds: takes the skin pill best inside a treat · Potty: twice a day, normal · Behavior: excited by squirrels, calm indoors · Heads-up: chicken allergy, text instead of knocking" + 이번 돌봄 출처 링크
- [ ] 기록에 없는 일(예: 산책을 안 했는데 "loves long walks")이 없음 (환각 테스트 3회)
- [ ] Jun이 다음 달 Bori 예약 요청을 받으면 요청 카드에 **From Bori's Life Record** 요약 (지난 시터 Mina 기록) · 07B 답이 이 기록을 출처로 씀
- [ ] Life Record·RAG 어디에도 lockbox·buzzer·주소 없음 (D31)

---

## 선행 조건

- [Phase 03B](phase-03b.md) Returned(`complete_handoff`) · [Phase 06](phase-06.md) check-in·task · [Phase 07](phase-07.md) 알림장
- [Phase 06B](phase-06b.md)의 `return` 사진 체크는 **선택** — 06B는 P0 맨 마지막(D41)이라 07C는 사진 체크 없이 먼저 동작하고, 06B가 붙으면 "photo verified"와 `handoff_checks` 요약이 자동으로 더해진다
- [Phase 07B](phase-07b.md) `rag.index_source` · `match_knowledge`

---

## 범위

| 포함 (P0) | 제외 |
| :--- | :--- |
| 귀가 알림 + Stay summary 카드 | PDF 리포트 내보내기 |
| 리뷰 1회(★1–5 + 선택 코멘트) + 시터 평균 별점 | 리뷰 답글·신고·수정 |
| `/api/ai/life-record` — 예약 1건 = 반려동물마다 기록 1개 + RAG 인덱싱 | 동물병원 의료 기록 연동, 체중 그래프 |
| Owner Life Record 화면 · 시터 요청 카드 요약 | 견주가 기록 직접 편집 (P1 — P0는 읽기 + "Report a mistake" 없음) |

---

## 화면

| Route | 역할 | 화면 | 주 액션 |
| :--- | :--- | :--- | :--- |
| `/owner/bookings/[bookingId]` (완료 상태) | owner | **Stay summary** · 귀가 사진 · **Leave a review** (아직 안 했으면) | Leave a review |
| `/owner/bookings/[bookingId]/review` | owner | "How was Bori and Mochi's stay with Mina?" · **StarRating**(탭 1–5, 마우스 클릭) · 코멘트(선택) | **Send review** |
| `/owner/pets/[petId]/record` | owner | **LifeRecordCard** 6칸(Eats · Meds · Potty · Behavior · Heads-up · Sitter tips) — 최신 기록 기준, 항목마다 출처 "From Mina · Oct 9–12" · 아래 지난 돌봄 목록 | 읽기 |
| `/sitter/bookings/[bookingId]` · 요청 카드 (03B 확장) | sitter | **From Bori's Life Record** 접힘 카드 (요청 받은 시터 ~ 예약 끝날 때까지) | — |
| `/owner/sitters/[sitterId]` (03B 확장) | owner | ★ 4.9 · 12 reviews + 최근 코멘트 3개 | Book this sitter |

---

## 작업 상세

| ID | 작업 | 담당 | 상세 | DoD |
| :--- | :--- | :--- | :--- | :--- |
| 7C.1 | DB `011_completion.sql` | 민식 | `reviews(id, booking_id → bookings unique, owner_id, sitter_id, rating int check 1–5, comment text null check (char_length(comment) <= 500), created_at)` — RLS: 견주 insert(자기 예약, 찾기 완료 후, 1회), 누구나(authenticated) select (시터 프로필 평균용 — 견주 이름은 display_name만). `sitter_rating_summary(p_sitter)` RPC `{avg, count, recent:[{rating, comment, created_at}]}`. `pet_life_records(id, pet_id → pets cascade, booking_id → bookings, sitter_id, summary jsonb not null, body text, source_snapshot jsonb, model, created_at)` · unique(booking_id, pet_id) — RLS select: 견주(`is_owner_of`) + 그 반려동물 예약이 requested/confirmed인 시터(기존 "요청 받은 시터는 펫 프로필 조회" 규칙과 같게) + 그 반려동물이 들어간 `open` 문의를 받은 시터(문의 = 펫 프로필 공유, 07B). 트리거: `pick_up` handoff `completed_at` 설정 시 → 견주 `review_requested` (`pet_picked_up` 다음) · reviews insert → 시터 `review_received` | rls_smoke N: 끝난 예약의 시터·제3자는 기록 0행 |
| 7C.2 | 귀가 리포트 · Stay summary | 민식 | 03B Returned → `pet_picked_up` 문구 "home safe" (06B 이후 `return` 사진 체크가 ok면 "· photo verified"). Stay summary는 클라이언트 집계(daily_reports·feed_posts·task_logs count) — 새 AI 호출 없음 | 완료 예약 상세 표시 |
| 7C.3 | 리뷰 UI | 민식 | `StarRating`(버튼 5개, 키보드·마우스), 보낸 뒤 읽기 전용. 시터 프로필·검색 카드에 평균 별점 | 1회 제한 |
| 7C.4 | `POST /api/ai/life-record` | 슬기 | `routers/ai_life_record.py`: `assert_booking_party(booking)` + 찾기 완료 확인 · 반려동물마다 `source_snapshot` = 그 예약 구간의 check-ins · task_logs(완료·누락) · daily_reports 본문 · handoff_checks findings(06B가 아직 없으면 생략) · safety_checks 요약(08 있으면) · 시터 메모 · 문의 메시지(견주 질문만) · 이전 최신 Life Record(있으면) — **출입 정보·주소 키 없음** → `MODEL_REPORT`(Super) + `prompts/life_record/system.md` → `chat_json` `LifeRecord {eats, meds, potty, behavior, heads_up:[str], sitter_tips:[str], changed_since_last:[str]}` (각 항목 ≤ 2문장, 근거 없으면 null) → insert + `rag.index_source('life_record', record_id, 텍스트화, scope pet+owner)` → 견주 `life_record_updated`. 프론트가 Returned 직후 호출(멱등 — 이미 있으면 반환), 실패 시 예약 상세 **Retry** | 환각 테스트 3회 · 멱등 |
| 7C.5 | Life Record UI | 민식 | 위 화면 + `LifeRecordCard` (07B 출처 칩·03B 요청 카드에서 재사용) | 데스크톱 마우스 확인 |
| 7C.6 | 다음 예약 연결 | 민식·슬기 | 03B 요청 카드·예약 상세에 최신 기록 요약. 07B `rag.search`에 life_record 포함(이미 범위 필터), 06 `care-plan` 입력에 최신 기록 `heads_up` 전달 → 체크리스트 초안 주의사항 자동 제안 | Jun 요청 카드에 Mina 기록 |

### 프롬프트 규칙 (`prompts/life_record/system.md`, 영어)

- Write like a careful sitter's handover notes for the **next** sitter. Short, factual, kind.
- Use only facts in the input JSON. If a field has no evidence, return null. Never guess medical causes; describe what was observed ("ate less on day 2").
- Merge with the previous record: keep facts still true, put new or changed facts in `changed_since_last`.
- Never include addresses, entry codes, or contact details (they are not in the input; refuse if they appear).

---

## Definition of Done (DoD)

1. Goal 달성 기준 수동 시나리오 통과 (Mina 완료 → 리뷰 → 기록 → Jun 요청 카드)
2. `pytest`: life-record 비당사자 403, 찾기 전 409 `stay_not_finished`, 멱등, snapshot에 금지 키 없음
3. 환각 테스트: (a) 산책 0회 → walk 관련 행동 문장 없음 (b) 약 task 없음 → meds null (c) 이전 기록과 충돌 → changed_since_last에 표시
4. rls_smoke N 통과 · 리뷰 1회 제한
5. README Stage 5 문구와 실제 화면 일치 (Phase 10 확인)

---

## 산출물

- `supabase/migrations/011_completion.sql`, `supabase/tests/rls_smoke.sql` (N)
- `backend/app/routers/ai_life_record.py`, `backend/app/schemas/life_record.py`, `backend/app/ai/prompts/life_record/system.md`
- `frontend/app/owner/bookings/[bookingId]/review.tsx`, `frontend/app/owner/pets/[petId]/record.tsx`, `frontend/components/{StarRating, LifeRecordCard, StaySummaryCard}.tsx`

---

## AI 프롬프트

Playbook §9C — (7C.1 SQL) / (7C.4 슬기) / (7C.2–7C.3·7C.5 UI)

---

## 다음 Phase

→ [Phase 06B — Pet Transit](phase-06b.md) (P0 맨 마지막, D41) → (시간 있으면 [Phase 08 — 세이프티 stretch](phase-08.md)) → [Phase 10 — 데모·배포](phase-10.md)
