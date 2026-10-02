# Phase 07B — 문의 AI 자동 답변 + RAG Knowledge Base (Stage 1 Inquiry)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — **D29 견적**, **D31 출입 정보 제외**, **D33 임베딩**, **D35 말투 레이어**, **D36 승인·고지**, **D37 사람 속도**, **D38 글쓰기 거의 제로**, **D46 에이전트 설명**, AI 규칙 §9, API §5, 알림 §7
> 제품 흐름: [full-process.ko.md — Stage 1](../full-process.ko.md#stage-1--inquiry-초기-문의--목표-rag-기반-초고속-맞춤-응대)
> 구 P2 11.4 "Q&A 1차 답변"을 이 Phase가 대신한다 (D27).

## Goal

견주가 시터에게 **문의**(서비스 방식 · 날짜·시각 · 반려동물 · 질문 1줄)를 보내면, **몇 초 안에(초안 p50 < 10초)** PawNote AI가 **그 시터의 말투(1인칭)로 답장 초안**을 만든다 (D35). 시터가 **Send**로 승인하면 즉시 시터의 메시지로 나가고(수동 승인, D36), 시터가 자동 발송 모드를 켜 둔 경우에는 시터가 돌보는 중이거나 자고 있어도 대기 없이 바로 **약 30초의 사람 속도 연출**(입력 중 → 답장, D37 — 읽음 표시는 시터가 실제로 열었을 때만)로 나간다. 견주 화면에는 메시지마다 AI 라벨이 없다. 답의 근거는 서버가 모은 것뿐이다: **그 시터의 스케줄(가능 여부)**, **`quote_booking` 견적**(공휴일·다두 할증 — 03C), **시터 정책 문서**, 그리고 RAG로 찾은 **이 반려동물의 Pet Life Record·지난 대화·케어 의뢰서**. 견주는 답 아래 견적 카드에서 바로 **Request booking**(문의 내용 자동 입력)으로 넘어가고, 처음 만나는 사이면 요청 뒤 Meet & Greet 단계가 이어진다 (3B.9, D44).

### Goal 달성 기준

- [ ] Chloe → Lucy 문의: Boarding · Oct 9 07:30 → Oct 12 17:00 · Max + Mochi · "Can you give Max her skin pill at 2 PM?" → **10초 안** 초안 "Hi Chloe! I'm available for Max and Mochi from Oct 9 to Oct 12 🐾 … Total $268.13 CAD (includes Thanksgiving and a second-pet rate). Max's Life Record says she takes her pill best inside a treat — happy to do that at 2 PM." (Lucy 1인칭) + 견적 카드 (03C와 같은 숫자)
- [ ] 견주 말풍선에는 AI 라벨이 없고 시터의 메시지로 표시됨 · Lucy에게 `inquiry_received`("draft ready") · Chloe에게 `inquiry_replied` (시터가 보냈거나 자동 발송이 공개된 시점)
- [ ] 수동 승인: Lucy가 **Send** → 즉시 Chloe 화면에 나타남 (지연 없음). 시터 화면 초안 위에 "AI drafts can be wrong. You're responsible for what you send." 표시
- [ ] 자동 발송(Lucy가 옵션을 켠 계정): 대기 없이 "Lucy is typing…" → 답장, 총 약 30초 (글자 수별 지연 공식은 TBD — 슬기). Lucy가 스레드를 열기 전에는 견주 화면에 읽음 표시가 없음
- [ ] 시터가 초안을 수정해 보내면 `tone_samples`에 (초안, 최종본, 수정 비율)이 기록되고, 자동 발송 메시지는 기록되지 않음
- [ ] Lucy가 10/10을 block한 상태로 같은 문의 → "Lucy isn't available on Oct 10 …" + **Find other sitters** (가격 문장 없음)
- [ ] Lucy 정책 "No dogs over 20 kg"이 있고 반려동물이 25 kg → 정책 근거로 정중히 안내 + `needs_sitter=true` ("Lucy will confirm")
- [ ] 답에 다른 견주 이름·예약, 주소, 출입 정보(lockbox 등)가 **절대** 없음
- [ ] Lucy: 초안을 **Send** 한 탭으로 보냄 (텍스트 입력 없이). 의도 칩(수락 / 거절 / 다른 날짜 제안)을 누르면 초안 방향이 바뀜
- [ ] **Request booking** → `/owner/bookings/new`에 서비스·시각·반려동물·이동 방식이 채워짐

---

## 선행 조건

- [Phase 07.1](phase-07.md) Nebius client (`chat_json`, 지표 로그) + 이 Phase에서 `embed()` 추가
- [Phase 03B](phase-03b.md) 시터 스케줄·`get_sitter_schedule`·서비스 방식 · [Phase 03C](phase-03c.md) `quote_booking`
- [Phase 05](phase-05.md) 알림 인프라 (UI 연결 시)
- Life Record 근거는 [Phase 07C](phase-07c.md) 이후 자동으로 들어옴 (그 전엔 펫 프로필·케어 의뢰서·정책만)

---

## 범위

| 포함 (P0) | 제외 |
| :--- | :--- |
| 문의 스레드(견주 질문 · AI 답 · 시터 👍/짧은 답) | 범용 실시간 채팅, 첨부 파일 (읽음·입력 중 표시는 7B.10의 사람 속도 연출용으로만) |
| `/api/ai/inquiry-reply` — 서버가 근거 수집 → Nano 1회 호출 | 모델 tool calling 에이전트 루프 — 7.1에서 동작이 확인되면 7B.11(선택)로만 (D46) |
| pgvector `knowledge_chunks` + `match_knowledge` + 인덱싱(정책·Life Record·문의·의뢰서) | 외부 마켓플레이스(Rover 등) 문의 연동 |
| 시터 정책 문서 편집 (`/profile`) | 다국어 답변 (D1: EN) |

---

## 화면

| Route | 역할 | 화면 | 주 액션 |
| :--- | :--- | :--- | :--- |
| `/owner/sitters/[sitterId]` (03B 확장) | owner | 시터 프로필 하단 **Ask about a stay** → 시트: Service(Boarding / House sitting — 시터가 제공하는 것만) · Drop-off · Pick-up(HandoffPicker 재사용 — 이동 방식 포함) · Pets(체크 — 안내 "Max's profile and Life Record are shared with Lucy") · Question(선택, ≤ 300자) | **Send** |
| `/owner/inquiries/[inquiryId]` | owner | 스레드: 내 질문 카드(조건 요약) → "Lucy is typing…" (사람 속도 연출 구간, 아니면 skeleton) → 시터 말풍선(AI 라벨 없음) + **QuoteCard** + 출처 칩("From Lucy's policies", "From Max's Life Record") → 버튼 **Request booking** (primary — 처음 만나는 사이면 요청 뒤 Meet & Greet 단계, 3B.9) | **Request booking** |
| `/sitter/bookings` (Inquiries 세그먼트) · `/sitter/inquiries/[inquiryId]` | sitter | 문의 카드(견주·반려동물·날짜·"Draft ready") → 스레드: 말투 초안 + 경고 문구("AI drafts can be wrong. You're responsible for what you send.") · **Send** (primary) · **Edit / Add** · **Regenerate** · 의도 칩(Accept · Decline · Suggest other dates) | **Send** |
| `/profile` (sitter) | sitter | **House rules & policies** (자유 텍스트, 한 번 작성 — 포함 서비스·취소·집 규칙·받지 않는 경우). 저장 시 RAG 재인덱싱. **AI replies**: Manual approval(기본) / Auto-send(대기 없이 바로, 약 30초 사람 속도) — Auto를 켜면 책임 동의 모달("Replies go out in your name. You're responsible for what's sent.") | Save |

---

## 작업 상세

| ID | 작업 | 담당 | 상세 | DoD |
| :--- | :--- | :--- | :--- | :--- |
| 7B.1 | DB `010_inquiries_rag.sql` | 민식 | `create extension if not exists vector;` · `inquiries(id, owner_id, sitter_id, service_type, drop_off_at, pick_up_at, drop_off_location_type, pick_up_location_type, pet_ids uuid[] not null, status text check in ('open','booked','closed') default 'open', booking_id → bookings null, created_at)` · `inquiry_messages(id, inquiry_id → inquiries cascade, author text check in ('owner','ai','sitter'), sender_id → profiles null (ai면 null), body text not null check (char_length(body) <= 2000), grounding jsonb null (ai: quote·availability·sources), model text, latency_ms int, confirmed_by_sitter_at timestamptz null, created_at)` · RLS: 당사자 select, 견주 insert (author=owner, 자기 문의), 시터 insert (author=sitter) + `confirmed_by_sitter_at` update, ai는 service role. `sitter_profiles.policies text` 추가. `knowledge_chunks(id, scope text check in ('sitter','pet','owner'), sitter_id null, pet_id null, owner_id null, source_type text check in ('sitter_policy','life_record','inquiry','care_request'), source_id uuid, content text, embedding vector(1024), created_at)` · unique(source_type, source_id, chunk_no) · HNSW index (`vector_cosine_ops`) · **RLS on, 클라이언트 정책 없음**(service role 전용). `match_knowledge(p_query vector(1024), p_sitter uuid, p_pets uuid[], p_owner uuid, p_k int default 5)` — 출처별 범위 필터(`sitter_policy`: `sitter_id = p_sitter` · `life_record`·`care_request`: `pet_id = any(p_pets)` · `inquiry`: `sitter_id = p_sitter and owner_id = p_owner` — architecture §9) 후 cosine 정렬, `{content, source_type, source_id, similarity}`. 알림 트리거: ai 초안 insert → `inquiry_received`(시터) · 견주 `inquiry_replied`는 시터 발송(`status='sent'`) 또는 자동 발송 공개 시점 (아래 스키마 보강 · 7B.10) | rls_smoke M: 제3자 문의 0행, `knowledge_chunks` anon/authenticated select 거부 |
| 7B.2 | 임베딩 · RAG 서비스 | 슬기 | `nebius.embed(texts)` (D33 — `MODEL_EMBED`, `dimensions=1024`, 지표 로그). `services/rag.py`: `index_source(source_type, source_id, text, scope ids)` — 문단 단위 ≤ 800자 청크, 기존 행 삭제 후 insert. 인덱싱 시점: 시터 정책 저장(`POST /api/rag/reindex-sitter` — 시터 본인), 케어 의뢰서 저장(06 → `POST /api/rag/reindex-care-request`), 문의 메시지(답 생성 후 같은 요청 안에서 — **견주 메시지만**, `sitter_id`·`owner_id` 둘 다 저장), Life Record(07C). `search(query, sitter, pets, owner, k=5)` | 같은 소스 재인덱싱 시 중복 없음 |
| 7B.3 | `POST /api/ai/inquiry-reply` | 슬기·민식 | `routers/ai_inquiry.py`: ① `assert_booking_party` 대신 문의 당사자 확인, 이미 ai 답이 있으면 그대로 반환(멱등) ② 근거 수집(병렬): `get_sitter_schedule` 구간 → 가능 여부 + 막힌 날, `quote_booking` (가능할 때만), 반려동물 프로필(종·품종·나이·체중·알레르기·`pet_cautions`), 시터 공개 프로필(bio·service_area·경력·평균 별점), `rag.search(질문 + 조건 요약)` top-5 ③ 메시지: `prompts/inquiry/system.md` + user = 근거 JSON + 견주 질문 → `MODEL_FAST`(Nano), reasoning off, `max_tokens` 350, temperature 0.4 → `chat_json` `{reply, can_host, needs_sitter, used_sources:[ids]}` ④ **숫자 대조**: reply 안의 `$` 금액·날짜가 근거 JSON에 없으면 1회 재생성 → 또 실패면 고정 문구 + 견적 카드 ⑤ insert ai 메시지(grounding = quote·availability·sources) + 견주 문의 메시지 인덱싱(7B.2) ⑥ 응답 + `latency_ms`. 45 s 타임아웃·모델 실패 → 고정 문구 "Thanks, Chloe! Lucy will reply soon." + `needs_sitter=true` (200) | 아래 근거 테스트 a–k |
| 7B.4 | 프롬프트 (`prompts/inquiry/system.md`) | 슬기 | 영어. **시터 본인 1인칭**("I'm available…", D35 — 3인칭·"Lucy's assistant" 금지), 말투는 `tone.compose()`가 주는 스타일 가이드 + 시터의 과거 답변 예시를 따른다. 사람이냐고 묻는 질문에는 사람이라고 답하지 않고 `needs_sitter=true` (D36). 규칙: 입력 JSON에 있는 사실만 · 금액은 `quote.total`·항목 그대로(계산 금지) · 불확실·정책 밖 요청은 "Lucy will confirm" + `needs_sitter` · 의학 조언 금지 · 다른 견주·주소·출입 정보 언급 금지(입력에도 없음) · 120단어 이하 · 이모지 ≤ 2 · 마지막 줄은 다음 행동 1개 ("Tap **Request booking** to hold these dates.") | Seulgi 리뷰 |
| 7B.5 | Owner 문의 UI | 민식 | 위 화면. 보내기 = Supabase insert(`inquiries` + owner 메시지) → `api.post('/api/ai/inquiry-reply')` (응답 오기 전 skeleton, 실패해도 스레드는 남고 "Lucy will reply soon"). **Request booking** → `/owner/bookings/new?inquiry=<id>` 자동 입력 → 요청 성공 시 `inquiries.booking_id`·`status='booked'` | 마우스만으로 문의 → 답 → 요청 |
| 7B.6 | Sitter 문의 UI + 정책 편집 | 민식 | Inquiries 세그먼트(최근순, 미확인 뱃지), 스레드 초안 **Send**(그대로) / **Edit / Add**(수정·추가) / **Regenerate** → 승인된 메시지는 `author='sitter'`로 저장(`drafted_by_ai=true`, `confirmed_by_sitter_at`) + 견주 알림 `inquiry_replied`. 시터는 아무것도 쓰지 않아도 된다 (D38). `/profile` 정책 필드 + 저장 후 reindex 호출 | 텍스트 없이 발송 가능 |
| 7B.7 | 지표 | 슬기 | 10회 호출 → `notes/model-ids.md`에 inquiry-reply p50/max latency(근거 수집 + 모델 분리) — README "Inquiry answered in N s" 근거 | 초안 생성 p50 < 10 s, max < 60 s (사람 속도 지연은 별도, 7B.10) |
| 7B.8 | **말투 레이어** (D35) | 슬기 | `backend/app/ai/tone.py` `compose(sitter_id, intent, facts, kind)` + `prompts/tone/style_card.md`(시터별 스타일 가이드: 인사·마무리 습관, 이모지, 문장 길이, 자주 쓰는 표현). `tone_samples(id, sitter_id, source in ('history','approved','edited'), intent, context_summary, draft null, final_text, edit_ratio real null, embedding vector(1024), created_at)` — service role 전용 RLS, HNSW. 시드 = 익명화한 3년치 대화(영어, 슬기 파이프라인 → 견주 메시지 → 시터 답 쌍, 금액·날짜는 `{PRICE}`·`{DATE}` 자리표시자). 공개 리포에는 **가상 시터의 샘플 스타일 가이드**만 둔다 (`data/raw/` 커밋 금지). 호출 순서: 의도 분류 → 같은 시터의 비슷한 샘플 top-k(`match_tone`) → 근거 JSON + 예시 → 초안 → 숫자 대조(D29). 안전 경고·견적 숫자·동의서는 레이어를 거치지 않음. 7·9에서도 재사용 | 샘플 시터로 같은 질문 2건 → 서로 다른 말투 초안, `{PRICE}`가 서버 값으로 채워짐 |
| 7B.9 | **승인 UX · 학습 기록** (D36 · D38) | 민식 | `inquiry_messages.drafted_by_ai boolean`, `status in ('draft','sent')`. 시터 스레드: 초안 + 경고 문구 + Send / Edit·Add / Regenerate + 의도 칩. 발송 시 `tone_samples`에 `approved`(그대로) / `edited`(수정, `edit_ratio` = 편집 거리 ÷ 길이) 기록, Regenerate는 부정 신호로 카운트. 견주 화면은 `author='sitter'` 메시지로 렌더 (AI 라벨 없음). 약관·시터 온보딩에 "may use AI writing assistance" 1회 고지 문구. "Are you an AI?" 류 질문 감지 시 `needs_sitter=true` + 시터 알림 | 수정 후 발송 → `tone_samples`에 edit_ratio 기록, 견주 화면에 AI 라벨 없음 |
| 7B.10 | **자동 발송 · 사람 속도 전달** (D36 · D37) | 슬기·민식 | `sitter_profiles.ai_reply_mode in ('manual','auto')` (기본 manual), `ai_consent_at`(책임 동의 모달 확인 시각). 자동 모드: 초안을 만들자마자(대기 없음 — N분 기다리지 않음, 2026-10-02) `visible_at = now() + delay`로 저장되고 RLS select는 `visible_at <= now()`만 견주에게 노출. 견주 화면: "typing" → 말풍선(클라이언트 타이머 + Realtime). **읽음 표시는 `read_at` = 시터가 스레드를 실제로 연 시각에만** (가짜 읽음 없음, 2026-10-02). **지연 공식(글자 수 → 초)과 메시지 구조(1개/분할)는 슬기가 정한다 — 이 문서에서 확정하지 않음.** 목표 총 약 30초. 자동 발송 메시지는 학습 샘플에서 제외. 데모 계정 Lucy는 자동 모드로 시드 (장면 ①) | 자동 모드 계정: 문의 → 약 30초 연출 후 답장, 시터가 열기 전엔 읽음 없음, 수동 모드는 즉시 |
| 7B.11 | (선택) **tool calling 문의 에이전트** (D46) | 슬기 | 7.1 spike에서 Nemotron tool calling이 Token Factory에서 동작할 때만: 도구 `check_availability`·`get_quote`·`search_records`(서버 함수 래퍼)로 모델이 필요한 근거를 직접 고름 → 숫자 대조(D29)·출입 정보 제외(D31)·말투 레이어(D35)는 그대로. 실패하거나 초안 p50이 10초를 넘으면 기존 1회 호출로 fallback | 근거 테스트 a–k 그대로 통과 + 도구 호출 로그 |

> **7B.1 스키마 보강 (D35–D37):** `inquiry_messages`에 `drafted_by_ai boolean`, `status text check in ('draft','sent')`, `visible_at timestamptz`, `read_at timestamptz`(시터가 스레드를 실제로 연 시각 — 견주 화면의 읽음 표시는 이 값만 따름) 추가. `author='ai'`는 **초안 단계의 내부 값**이며 견주 쿼리/RLS에는 노출하지 않는다(견주는 `status='sent'` 이고 `visible_at <= now()`인 행만, 작성자 표기는 시터). `tone_samples`는 7B.8 (같은 migration `010`). 알림 `inquiry_received`는 초안 생성 시 시터에게, `inquiry_replied`는 발송(visible) 시 견주에게.

> **7B.10 구현 주의 (2026-10-02 점검):** `visible_at`이 지나는 순간에는 DB 이벤트가 새로 생기지 않는다. 그래서 트리거·Realtime만으로는 견주의 말풍선과 `inquiry_replied` 알림이 제때 뜨지 않고, 견주 RLS가 `visible_at` 전의 행을 숨기면 Realtime INSERT도 견주에게 전달되지 않는다. 제안: 초안을 저장할 때 견주가 읽을 수 있는 시각 값만(본문 없이, 예: `inquiries.reply_typing_at`·`reply_visible_at`) 함께 갱신 → 견주 화면이 그 값으로 타이머를 걸어 입력 중·말풍선을 연출하고 `visible_at`에 메시지를 다시 조회. 알림 행도 같은 `visible_at`을 갖고 벨 목록은 `visible_at <= now()`만 보여 준다 (NotificationsProvider가 그 시각에 다시 조회). 서버리스 sleep·cron 없이 동작한다 (D37). 최종 방식은 7B.10에서 슬기·민식이 정한다.

### 근거 테스트 (`backend/tests/test_inquiry.py` — 모델 호출은 mock, 근거 수집·대조는 실제 로직)

| # | 상황 | 기대 |
| :--- | :--- | :--- |
| a | 구간 중 하루 blocked | `can_host=false`, quote 없음, 금액 문장 없음 |
| b | Thanksgiving 포함 | grounding.quote.holiday_days에 Oct 12, 답 금액 = quote.total |
| c | 모델이 없는 금액($300)을 씀 | 1회 재생성 → 또 틀리면 고정 문구 |
| d | 시터 정책에 걸림 | `needs_sitter=true`, 정책 source 포함 |
| e | Life Record 있음 | sources에 `life_record` |
| f | 근거 JSON 전체에 `lockbox`·`buzzer`·주소 키 없음 | 단위 테스트로 키 검사 (D31) |
| g | 초안이 3인칭("Lucy is…", "assistant")을 씀 | 1회 재생성 → 또 틀리면 1인칭 고정 문구 (D35) |
| h | 초안에 `{PRICE}`·`{DATE}` 자리표시자가 남음 | 서버가 채우거나 재생성, 남은 채로 발송 불가 |
| i | "Are you an AI?" 문의 | 사람이라고 답하지 않음 + `needs_sitter=true` (D36) |
| j | 자동 발송 메시지 | `tone_samples`에 기록되지 않음, `visible_at` 전에는 견주 select 0행 |
| k | 같은 견주가 예전에 다른 시터(Paul)와 나눈 문의가 있음 | Lucy 초안의 검색 결과·근거에 그 대화가 없음 (`inquiry` 범위 = 견주 × 시터) |

---

## Definition of Done (DoD)

1. Goal 달성 기준 수동 시나리오 통과 (Chloe → Lucy, 블록·정책 케이스 포함)
2. `pytest` 근거 테스트 a–k + 비당사자 403 + 멱등(두 번 호출해도 ai 메시지 1개)
3. `knowledge_chunks`를 클라이언트(anon·authenticated)가 읽을 수 없음 (rls_smoke M)
4. 7B.7 지표 기록, README Nebius 표에 "Inquiry auto-reply — Nemotron Nano + Qwen3 Embedding" 1줄 (Phase 10에서 확장)
5. 데스크톱 프레임에서 마우스만으로 문의 → 답 → Request booking (D25)
6. 말투 레이어(7B.8): 샘플 시터 2명 이상에서 같은 질문의 초안 말투가 다르고, 모든 금액·날짜가 서버 값과 일치. 파일럿 평가 — 슬기가 숨겨 둔 시험용 약 50건으로 few-shot 초안 vs 실제 시터 답을 시터가 블라인드 비교 (결과는 README 피드백·데모 지표에 기록)
7. 승인 UX(7B.9)·자동 발송(7B.10): Goal 달성 기준의 수동 승인 / 자동 모드 시나리오 통과, 자동 발송 메시지는 `tone_samples`에 안 들어감

---

## 산출물

- `supabase/migrations/010_inquiries_rag.sql`, `supabase/tests/rls_smoke.sql` (M)
- `backend/app/services/rag.py`, `nebius.embed()`, `backend/app/routers/ai_inquiry.py`, `backend/app/routers/rag.py`, `backend/app/schemas/inquiry.py`, `backend/app/ai/prompts/inquiry/system.md`, `backend/tests/test_inquiry.py`
- `frontend/app/owner/inquiries/[inquiryId].tsx`, `frontend/app/sitter/inquiries/[inquiryId].tsx`, `frontend/components/InquirySheet.tsx`, `MessageBubble.tsx`, `frontend/features/inquiries/*`

---

## AI 프롬프트

Playbook §9B — (7B.1 SQL) / (7B.2–7B.4 슬기) / (7B.5–7B.6 UI)

---

## 다음 Phase

→ [Phase 09 — 캡션·앨범 분류](phase-09.md) · 그다음 [Phase 07C — 완료·Life Record](phase-07c.md)
