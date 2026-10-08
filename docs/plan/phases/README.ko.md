# Goldito — Phase 가이드 (개발 청사진)

각 Phase는 **Goal → 범위 → 작업 → DoD → 산출물** 순으로 정리되어 있습니다.
**먼저 [architecture.ko.md](architecture.ko.md)를 읽으세요** — 확정된 결정(D1–D47), 리포 구조, 라우트 맵, env 목록, API 계약, 알림 매트릭스가 있고 모든 phase가 이를 전제로 합니다.
**제품 흐름은 [full-process.ko.md](../full-process.ko.md)** (5단계: Inquiry → Meet & Greet → Booking → Care & Pet Transit → Completion, D27–D47) — 작업 순서와 데모가 이 흐름을 따릅니다. 탭 IA: **D47 / D47b** 양 역할 `Home · Bookings · Feed · Diary · Mood`.

문서 우선순위 (Source of truth): **architecture.ko.md + phase 문서** (제품 흐름은 [full-process.ko.md](../full-process.ko.md), 스키마는 [phase-02](phase-02.md) + 각 phase migration, 모델 ID는 [notes/model-ids.md](notes/model-ids.md)) > [TODO.md](../TODO.md) (진행 순서) > [P0 playbook](../P0-ai-prompt-playbook.ko.md) (프롬프트 출발점) > [개발 계획](../README.ko.md) (배경·요약). 아래 문서가 위 문서와 다르면 위 문서가 맞고, 아래 문서를 고칩니다.

**보조 스펙 (phase 번호 밖):** [전체 서비스 흐름 (Full Process)](../full-process.ko.md) · [시터 케어 루프 Plan B](../sitter-care-loop.ko.md) · [8bit Pet status room](../pet-status-room.ko.md) · [온보딩·데모 UX](../onboarding.ko.md) · [Tavily](../tavily.ko.md) · [로컬 env](../env-setup.ko.md) · [Devpost 제출](../../hackathon/devpost-submission.ko.md) · [CHANGELOG (패치노트 원본)](../../CHANGELOG.md)

## 의존 관계

```
앱 (순서대로):  00 → 01 → 02 → 03 → 03B → 03C → 04 → 05 → 06 → 07 → 07B UI → 09 → 07C → 06B → (08) → 10 → 11 (P1)   ※ 06B는 P0 맨 마지막, 08 stretch는 그 뒤 시간이 남을 때 (D41)
AI (병렬):      07.1 Nebius client (01 이후 언제든) → 07B 백엔드 (03C quote_booking 필요) → 6.12 → 7.2·7.4·7.7 → 9.1 → 7C.4 → 6B.5 (마지막)
Stretch:        08 세이프티 (06B 뒤 시간이 남을 때, 10 최종 배포 전에 끝나면 데모 (+) 장면)
0.1·0.2·0.3은 01과 병행 (완료)
```

- **민식 (앱):** 03B(Meet & Greet · 3B.11 Google Meet 포함) → 03C → 04 → 05 → 06 → 07 UI → 07B UI → 09 UI → 07C UI → 06B → 10
- **민식 (AI 백엔드 포함 — 2026-10-04부터 슬기 담당분 전부 인수):** 7.1 → 07B 백엔드(RAG·문의 답변) → 6.12 care-plan → 7.2·7.4 알림장 + 7.7 칩 제안 → 9.1 캡션·분류 → 7C.4 life-record → 6B.5 handoff-check → (08)
- **슬기 (데이터만, 2026-10-04부터):** 3년치 대화 내역 익명화 → train / validation / hold-out JSONL을 민식에게 전달 (few-shot · 말투 샘플 · 평가용). 나머지 작업은 민식.

## Phase 목록 & 목표 일정

| Phase | 이름 | Stage | Goal 한 줄 | 담당 | 목표 기간 | Migration |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [00](phase-00.md) | 사전 준비 | — | 외부 서비스 키 + 로컬 `.env` | 민식 | 9/28–9/30 ✅ | - |
| [01](phase-01.md) | 모노레포 틀 | — | 프론트·백엔드 기동 + health 연결 · 데스크톱 폰 프레임 + 마우스 조작 (1.6–1.7, D25) | 민식 | ✅ 10/1 | - |
| [02](phase-02.md) | DB + RLS | — | P0 스키마 + 역할별 접근 통제 + 가입 트리거 | 민식 | ✅ 10/1 | 001–003 |
| [03](phase-03.md) | 인증·역할·Pet 프로필 | — | 로그인 → 역할별 탭, pet(종·알레르기)·역할별 프로필 | 민식 | ✅ 10/1 | - |
| [03B](phase-03b.md) | 스케줄 · 서비스·이동 방식 · 예약 · Meet & Greet | 2–3 | 시터 칸별 스케줄 → 단골·검색 → Boarding / House sitting · Owner/Sitter drives → 협의 → 확정 → Received/Returned, 취소 → 재예약 · 첫 만남 Meet & Greet(대면 장소 / Google Meet / 건너뛰기 동의) | 민식 | 10/2–10/6 | 004 |
| [03C](phase-03c.md) | 견적 · 동의서 · 데모 결제 · 보안 해제 | 3 | `quote_booking` → 동의서 서명 → Pay (demo) → 시터 집 정보 즉시 / 견주 집 출입 정보 2시간 전 | 민식 | 10/6–10/8 | 005 |
| [04](phase-04.md) | Cloudinary | 4 | secret 없이 사진·영상 업로드 헬퍼 + 샘플 트레이 | 민식 | 10/8–10/9 | - |
| [05](phase-05.md) | 케어 피드 + 알림 | 4 | 업로드 → 견주 타임라인·Realtime 알림 센터 | 민식 | 10/9–10/11 | 006 |
| [06](phase-06.md) | 케어 의뢰서 · 5초 체크 · Activity | 2 · 4 | 의뢰서 → AI 미션 체크리스트 · 탭 체크 → 즉시 알림 · 히스토리 | 민식 | 10/11–10/14 | 007 |
| [06B](phase-06b.md) | Pet Transit | 4 | Start trip → 실시간 위치·ETA → 도착 안내 → 사진 Vision 체크 → Received/Returned | 민식 | P0 맨 마지막 (D41) — 07C 바로 다음, 08보다 먼저 · 10/23–10/27 | 012 |
| [07](phase-07.md) | 알림장 AI | 4 | AI 칩 제안 + 짧은 메모(선택) + 사진 2장 + 하루 데이터 → Super 초안 → 시터 승인 후 게시 | 민식 | 7.1: 10/1–10/4 · 나머지 10/16–10/18 | 009 |
| [07B](phase-07b.md) | 문의 AI + RAG | 1 | 문의 → 몇 초 안(초안 p50 10초) 시터 말투 AI 초안 → 시터 승인(자동 발송은 사람 속도) — 스케줄·견적·정책·Life Record 근거 | 민식 | 백엔드 10/5–10/10 · UI 10/18–10/20 | 010 |
| [09](phase-09.md) | 캡션 · 앨범 분류 | 4 | 업로드만으로 AI 캡션 + Meals/Walks/Naps 앨범 (fallback 보장) | 민식 | 10/19–10/21 | - |
| [07C](phase-07c.md) | 완료 · 리뷰 · Life Record | 5 | 귀가 리포트 → ★ 리뷰 → Life Record → RAG → 다음 예약 | 민식 | 10/20–10/23 | 011 |
| [08](phase-08.md) | 세이프티 가드 (stretch) | 4 보조 | 성분표 → Vision + Ultra → 경고 모달·알림 (+ Tavily 8.7) | 민식 | 06B 뒤 시간이 남을 때만 (10 배포 전) | 013 |
| [10](phase-10.md) | 데모·배포 | 전체 | 시드 + 공개 URL + README + 12/15 유지 | 민식 | 배포 리허설 10/18 · 완료 10/28 | - |
| [11](phase-11.md) | P1 (+P2) | — | 사진 요청 · 공지 · 즐겨찾기·반복 근무 · 스킨·스티커 등 (Tavily는 8.7 못 했을 때만 · SFT 아이디어) | 민식 | P0 배포 후 남는 시간 | 014 |

> 일정이 밀리면 줄이는 순서: 08 전체 → 10.10 Split view → 3B.5 역제안 UI(제안·수락만) → 7C Life Record 화면(요청 카드 요약만) → 06B 실제 GPS(Simulate만). **5단계 각각 한 장면은 반드시 남긴다.**

## Stage ↔ Phase 매핑 (데모 장면)

| Stage | 완료 Phase | 데모 장면 ([full-process.ko.md §6](../full-process.ko.md#6-데모-경로-a-stay-with-goldito)) |
| :--- | :--- | :--- |
| 1 Inquiry | 07B (+03C 견적, 07C 기록) | ① 문의 → AI 초안(몇 초) → 자동 모드면 약 30초 뒤 답 + 견적 카드 |
| 2 Meet & Greet | 06 (의뢰서) · 03B (Meet & Greet · 3B.11 Google Meet · 이동 방식) | ② 의뢰서 → 체크리스트 · 첫 만남 Meet & Greet(Google Meet) · Sitter/Owner drives |
| 3 Booking | 03B · 03C | ③ 수락 → 동의서 → Pay (demo) → 정보 해제 |
| 4 Care & Transit | 04 · 05 · 06 · 06B · 07 · 09 (+08 stretch) | ④ Trip → 사진 체크 → 5초 체크 → 알림장 → 앨범 |
| 5 Completion | 07C | ⑤ 귀가 → home safe → ★ 리뷰 → Life Record |

## Phase 문서 사용법 (에이전트·사람 공통)

1. [TODO.md](../TODO.md) Current focus의 task ID 확인
2. 해당 phase 문서의 **작업 상세 행 + DoD**만 구현 (범위 "제외" 칸은 손대지 않음)
3. 새 파일 위치·이름은 [architecture §2](architecture.ko.md#2-리포-구조-최종-형태), 화면 route는 [§3](architecture.ko.md#3-화면--라우트-맵-최종-형태)
4. 결정이 필요한데 문서에 없으면 → architecture §1에 D## 추가 제안 후 사람에게 확인
