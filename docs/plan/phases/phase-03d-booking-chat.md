# Phase 03D — 채팅 중심 부킹 (Stage 1 – 5를 한 채팅으로)

> **상태 (2026-10-17):** 시작 전 · P0 (결정 2026-10-17, Minsik). 에픽: [#130](https://github.com/minsikpaul92/Goldito/issues/130). 03B의 시터 검색(PR #128)이 먼저 머지되어야 한다.

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D27–D47, **D29 견적 · D31 보안 해제 · D35/D36 시터 말투·승인 · D38 타이핑 최소**

## Goal

오너가 호텔을 찾듯 시터를 검색하고(날짜 · 시간 · 펫 · 반경), 시터 상세에서 **채팅 시작**을 누르면 견적 · Meet & Greet · 예약 합의 · 결제 · 인계 · 케어 · 종료 · 리뷰가 **같은 채팅 하나**에서 진행된다. 채팅 위에는 부킹 진행도가 있고, 같은 오너–시터는 계속 같은 채팅을 쓰며 히스토리가 남는다. 뒤로 가면 채팅 목록이 나온다. 기존의 "Ask before booking"과 "Book care"는 없어진다.

## 시나리오 (오너 / 시터)

1. 검색 → 시터 상세 → **Start chat**. 첫 카드에 날짜 · 시간 · 펫이 자동으로 보인다.
2. 오너: 케어 되나요? → 시터: 가능, 견적(시터 설정 요금 × 시간 · 마릿수 · 인계 방식) 자동.
3. 오너: 요구사항 문의 → 시터: 추가요금 안내 → 오너 수용 → 시터: 최종 견적 → 오너: 확인.
4. 오너: Meet & Greet 요청(온라인/오프라인 · 시간 · 장소) → 시터 동의. 재방문 쌍은 건너뜀.
5. 오너 "예약하겠습니다" + 시터 "받겠습니다" → **둘 다 동의** → **오너 결제(데모) → 예약 확정**.
6. 인계: 오너와 시터의 저장된 기본 방식이 같으면 협의 없음, 다르면 요청 → 재요청 → 최종 수락. 세 가지 방식(오너가 감 · 시터가 데리러 옴 · 다른 곳) 유지.
7. 케어 당일: 트립 시작 → 출발 알림 · 5분 전 · 도착 알림 → 인사. 케어 중 홈에서 밥 · 산책 · 응가 · 낮잠 완료 → 오너 알림. 사진 요청 → 사진 + 한 줄. 저녁 다이어리 카드 → 누르면 다이어리.
8. 종료: 오너 데리러 감(트립) → 시터 Done → 서로 리뷰. **오너의 시터 리뷰는 공개, 시터의 오너 리뷰는 쓴 시터만 본다.**

## 채팅 AI (D4b, #142)

- 상대의 마지막 말에 대해 **내 쪽 조건에 맞는 칩 2–3개**(시터: 요금 · 캘린더 · 정책, 오너: 펫 · 날짜 · 프로필) → 칩을 누르면 내 말투로 짧은 초안 → 내가 고치고 Send. 직접 입력도 항상 된다. 오너의 첫 메시지(자기소개 · 언제 필요한지)도 칩 + 프로필로 만든다.
- **컨텍스트는 Redis 없이 Postgres에서:** 마지막 ~20개 메시지 + 스레드에 저장한 요약(길어지면 갱신) + DB의 구조화된 사실(부킹 단계 · 날짜 · 펫 · 견적 · 시터 정책 · 요금 · 오너 프로필) + RAG(pgvector, Life Record). 백엔드는 상태가 없다.
- 가격 · 날짜 · 가용성은 코드가 DB에서 넣고 모델은 쓰지 않는다. 출입 코드는 프롬프트에 넣지 않는다. 상대 메시지는 데이터이지 지시가 아니다.

## 단계 (GitHub 이슈 = 상태 · 체크리스트의 정본)

| ID | 단계 | 이슈 | 의존 |
| :--- | :--- | :--- | :--- |
| 3D.0 | 문서: full-process · architecture · test-guide 갱신 | [#130](https://github.com/minsikpaul92/Goldito/issues/130) | PR #128 |
| 3D.1 | 시터 검색 후속 (라이브 갱신 · 기본 5 km · 즐겨찾기 · 상세로 이동) | [#138](https://github.com/minsikpaul92/Goldito/issues/138) | PR #128 |
| 3D.2 | 시터 온보딩 · 구조화 프로필 | [#139](https://github.com/minsikpaul92/Goldito/issues/139) | — |
| 3D.3 | 시터 상세 + Start chat | [#140](https://github.com/minsikpaul92/Goldito/issues/140) | 3D.1 · 3D.2 · 사진 · 캘린더 |
| 3D.4 | 채팅 허브 (스레드 · 목록 · 진행도) | [#141](https://github.com/minsikpaul92/Goldito/issues/141) | 3D.3 |
| 3D.5 | AI 칩 · 초안 | [#142](https://github.com/minsikpaul92/Goldito/issues/142) | 3D.4 |
| 3D.6 | 채팅 안 견적 · 추가요금 | [#143](https://github.com/minsikpaul92/Goldito/issues/143) | 3D.4 |
| 3D.7 | Meet & Greet · 합의 · 결제 | [#144](https://github.com/minsikpaul92/Goldito/issues/144) | 3D.6 |
| 3D.8 | 인계 협의 · 트립 · 케어 연결 | [#145](https://github.com/minsikpaul92/Goldito/issues/145) | 3D.7 |
| 3D.9 | 종료 · 리뷰 | [#146](https://github.com/minsikpaul92/Goldito/issues/146) | 3D.8 |

함께 진행(같은 QA 피드백): 현재 위치 [#131](https://github.com/minsikpaul92/Goldito/issues/131) · Privacy 아코디언 [#132](https://github.com/minsikpaul92/Goldito/issues/132) · 취소 부킹 빈 카드 [#133](https://github.com/minsikpaul92/Goldito/issues/133) · 캘린더 빗금 [#134](https://github.com/minsikpaul92/Goldito/issues/134) · 프로필 사진 [#135](https://github.com/minsikpaul92/Goldito/issues/135) · [#136](https://github.com/minsikpaul92/Goldito/issues/136) · [#137](https://github.com/minsikpaul92/Goldito/issues/137) · 헤더 정리(Muk) [#147](https://github.com/minsikpaul92/Goldito/issues/147).

## 3D.2 시터 온보딩 설계 ([#139](https://github.com/minsikpaul92/Goldito/issues/139), 2026-10-17 Minsik 결정)

**지금 만든다 (타이핑 우선)**

- **번호 매긴 질문 목록 + 질문마다 텍스트 박스.** 전부 건너뛸 수 있다. 정해진 선택지가 있는 질문(여러 오너 동시 · 한 번에 맡는 마릿수 · 고양이 · 강아지 크기 · 인계 방식 등)은 박스 옆에 칩이 있어 칩 한 번으로 `choice`가 정해지고 박스는 덧붙이는 말이다.
- 마지막 단계는 **검토 → 고치기 → 완료**. 완료해야 저장되고 `onboarded_at`이 찍힌다. 기존 시터는 Profile에서 같은 화면으로 고친다.
- **자기소개 한 단락**(= `sitter_profiles.bio`)과 **직접 추가하는 Q&A**(`custom_1` – `custom_5`, 질문 문구는 시터가 쓴다).
- **언제 가능한지**: 요일별 가능 시간대(= 기존 `save_closing_rules` · `save_weekday_hours`)와 안 되는 날짜(= `sitter_availability` blocked)를 같은 온보딩 안에서 탭으로 등록해 Schedule에 바로 반영한다. 새 테이블은 만들지 않는다.
- **사진**: 얼굴 사진 1장 + 펫과 함께 찍은 사진 여러 장. 사진 갤러리는 [#135](https://github.com/minsikpaul92/Goldito/issues/135)의 `profile_photos` · `ProfilePhotoGallery`를 쓰므로 #135의 시터 쪽 데이터 · 컴포넌트를 먼저 한다(온보딩 화면 단계에서 끼워 넣음).
- DB: `014f_sitter_profile_answers.sql` — `sitter_profile_answers`(시터당 질문 키 하나, `answer` ≤ 300자, `choice`, `source` typed|voice, `quote`) + `save_sitter_answers(answers, intro, finish)`. 오너는 모든 시터의 답을 읽고 쓰기는 시터 본인의 RPC뿐이다. `multiple_owners` → `accepts_multiple_owners`, `max_pets` → `default_max_pets`로 복사된다(예약 규칙이 읽는 값). 인계 방식은 답에만 두고 #145가 기본값으로 읽는다.

**음성 입력 — 문서만, 구현은 뒤로 (Groq 키는 [#158](https://github.com/minsikpaul92/Goldito/issues/158)에서 나중에 넣는다)**

1. 마이크 버튼을 누르면 **텍스트 박스는 접히고 번호 목록만 크게 남는다.** 시터는 목록을 보면서 **"First… Second… Third…"처럼 번호를 말하며** 하나씩 답한다 — 파싱 정확도를 위해 화면이 "Say the number first" 힌트를 계속 보여 준다.
2. 말하는 동안 **청크 단위(2~3초)로 전사해 화면에 바로 보여 준다.** 시터가 자기 목소리가 제대로 들리는지 그 자리에서 확인한다. (청크를 모아 보내는 `POST /api/ai/transcribe` — Groq `whisper-large-v3-turbo`, 녹음은 저장하지 않음. 11.15 펫 음성도 이 엔드포인트를 쓴다.)
3. 끝내면 **전사문 전체를 보여 주고 "Record again" 또는 "Send"를 고른다.** Send 하면 `POST /api/ai/sitter-profile-parse`(MODEL_FAST, JSON)가 번호와 질문 키에 맞춰 칸을 채운다. 값마다 전사 속 근거 문장(`quote`)이 있어야 하고 없으면 버린다. 전사문은 데이터이며 지시가 아니다.
4. 검토 화면에서 채워진 칸은 "✨ from your voice"와 근거 문장이 보이고, 못 들은 질문은 비어 있다. 시터가 고치고 완료한다.
5. **가능한 날 / 안 되는 날도 음성으로 받는다.** "Weekdays yes, weekends no, not October 25" → 파서가 요일별 가능 시간대와 안 되는 날짜 목록을 만들고, 검토 화면의 같은 요일 · 날짜 위젯을 채운다. 시터가 확인한 뒤에만 `save_closing_rules` / blocked 행으로 Schedule에 등록된다(AI는 제안만).
6. 확인할 것(구현 때): iPhone Safari(mp4) · Chrome(webm) 청크 업로드, 무료 플랜 한도(분당 20요청 — 청크가 2~3초면 한도에 닿으므로 6~8초 청크 또는 녹음 끝에 한 번), Groq 무료 플랜 약관의 데이터 취급.

**단계(커밋 단위)**: ① `014f` 마이그레이션 + RPC + 스모크 ✅ → ② 시터 쪽 프로필 사진(#135의 시터 부분) → ③ 온보딩 화면(번호 + 텍스트 박스 + 칩, 검토 · 완료) → ④ 가능한 날 등록 위젯(온보딩 + Schedule 연결) → ⑤ Profile 편집 + 시드(데모 시터 둘) + e2e → ⑥ (보류) 음성.

## 방침

- 트립 · 다이어리 · 리포트 · 리뷰 화면은 **다시 만들지 않는다.** 1차는 채팅 카드에서 기존 화면으로 연결.
- 새 마이그레이션은 `supabase/README.md` § Naming의 다음 빈 이름을 쓴다. 호스팅 DB 적용은 사용자가 요청할 때만.
- 브랜치 · PR은 묶음별로 제안: ① 빠른 수정 + 캘린더(#131 – #134) ② 사진(#135 – #137) ③ 검색 후속 + 시터 프로필(#138 – #140) ④ 채팅(#141 – #146). 각각 한 PR.
