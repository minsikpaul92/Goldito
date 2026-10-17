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

## 방침

- 트립 · 다이어리 · 리포트 · 리뷰 화면은 **다시 만들지 않는다.** 1차는 채팅 카드에서 기존 화면으로 연결.
- 새 마이그레이션은 `supabase/README.md` § Naming의 다음 빈 이름을 쓴다. 호스팅 DB 적용은 사용자가 요청할 때만.
- 브랜치 · PR은 묶음별로 제안: ① 빠른 수정 + 캘린더(#131 – #134) ② 사진(#135 – #137) ③ 검색 후속 + 시터 프로필(#138 – #140) ④ 채팅(#141 – #146). 각각 한 PR.
