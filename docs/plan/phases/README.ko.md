# Goldito — Phase 가이드 (개발 청사진)

각 Phase는 **Goal → 범위 → 작업 → DoD → 산출물** 순으로 정리되어 있습니다.
**먼저 [architecture.ko.md](architecture.ko.md)를 읽으세요** — 확정된 결정(D1–D61), 리포 구조, 라우트 맵, env 목록, API 계약, 알림 매트릭스가 있고 모든 phase가 이를 전제로 합니다.
**제품 흐름은 [full-process.ko.md](../full-process.ko.md)** (5단계: Inquiry → Meet & Greet → Booking → Care & Pet Transit → Completion, D27–D47) — 작업 순서와 데모가 이 흐름을 따릅니다. 탭 IA: **D47 / D47b · D61** 양 역할 `Home · Bookings · Feed · Diary · Snap`.

문서 우선순위 (Source of truth): **architecture.ko.md + phase 문서** (제품 흐름은 [full-process.ko.md](../full-process.ko.md), 스키마는 [phase-02](phase-02-db.md) + 각 phase migration, 모델 ID는 [notes/model-ids.md](notes/model-ids.md)) > [GitHub issues](https://github.com/minsikpaul92/Goldito/issues) (진행 순서) > [P0 playbook](../P0-ai-prompt-playbook.ko.md) (프롬프트 출발점) > [개발 계획](../README.ko.md) (배경·요약). 아래 문서가 위 문서와 다르면 위 문서가 맞고, 아래 문서를 고칩니다.

**보조 스펙 (phase 번호 밖):** [전체 서비스 흐름 (Full Process)](../full-process.ko.md) · [시터 케어 루프 Plan B](../sitter-care-loop.ko.md) · [8bit Pet status room](../pet-status-room.ko.md) · [펫 프로필 온보딩 (11.15)](../pet-profile-onboarding.ko.md) · [온보딩·데모 UX](../onboarding.ko.md) · [Tavily](../tavily.ko.md) · [로컬 env](../env-setup.ko.md) · [Devpost 제출](../../hackathon/devpost-submission.ko.md) · [CHANGELOG (패치노트 원본)](../../CHANGELOG.md)

## 의존 관계 · 실제 진행 순서

번호는 처음 계획한 순서이고 바꾸지 않는다(ID `7B.10`, `CR-7` 등이 커밋 · 코드 · 테스트에 남아 있음). **실제로 만든 순서와 남은 순서**는 아래와 같다.

```
완료(P0 기반):  00 준비 → 01 틀 → 02 DB → 03 인증 → 03B 예약 → 03C 결제 → 04 업로드 → 05 피드 → 06 체크
                → 07 알림장 → 07B 문의 → 09 캡션 → 07C 완료 → 06B 이동            (08 세이프티는 12.1로 옮김, D61)
진행 중:        12 Snap (12.0 – 12.4 끝, 12.5 마무리)
남은 순서:      채팅 부킹 03D(P0) → 11.12 다마고치(#184) → 11.15 오너 가입 상세(#185) → 다이어리 수정(#186) → Petstagram(#187) → 10 데모·배포(맨 끝) (2026-10-19 결정, 순서 정본은 GitHub 이슈 마일스톤)
병렬:           Q 품질 · QA (슬기)
```

- **우선순위 (2026-10-19 결정, 마감 10/28 전에 다 못 함):** 채팅 → Tamagotchi → 오너 가입 상세 → Diary → Petstagram. 시간이 모자라면 Petstagram의 follow부터, 그다음 Petstagram 전체를 뺀다. Tamagotchi는 끝까지 둔다. 심사위원이 5단계 경로에서 보는 것이 먼저다.
- **민식:** 위 "남은 순서" 그대로. 순서와 날짜의 정본은 [GitHub issues](https://github.com/minsikpaul92/Goldito/issues) (2026-10-14 결정: Phase 10은 맨 끝).
- **슬기 — [Phase Q](phase-q-quality.md):** 손 테스트 · 시터 관점 UX 피드백 · 문구/프리셋 · 익명화 · 말투(문의 + 알림장) · R3 Medium / R4 Low 리뷰 항목 · 측정 — [work-split-2026-10-09.ko.md](../work-split-2026-10-09.ko.md).

## Phase 목록 (진행 순서대로)

| 순서 | Phase | 이름 | Stage | Goal 한 줄 | 상태 | Migration |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | [00](phase-00-prep.md) | 사전 준비 | — | 외부 서비스 키 + 로컬 `.env` | ✅ 9/30 | - |
| 2 | [01](phase-01-repo.md) | 모노레포 틀 | — | 프론트·백엔드 기동 + health · 데스크톱 폰 프레임 + 마우스 조작 (D25) | ✅ 10/1 | - |
| 3 | [02](phase-02-db.md) | DB + RLS | — | P0 스키마 + 역할별 접근 통제 + 가입 트리거 | ✅ 10/1 | 001–003 |
| 4 | [03](phase-03-auth.md) | 인증 · 역할 · Pet 프로필 | — | 로그인 → 역할별 탭, pet(종 · 알레르기) · 역할별 프로필 | ✅ 10/1 | - |
| 5 | [03B](phase-03b-booking.md) | 스케줄 · 서비스 · 이동 방식 · 예약 · Meet & Greet | 2–3 | 시터 스케줄 → 검색 → Boarding / House sitting · Owner/Sitter drives → 협의 → 확정 → Received/Returned · 첫 만남 Meet & Greet | ✅ (Open items: BK-1 · MG · CAL · 3B.11 실기기) | 004 |
| 6 | [03C](phase-03c-payment.md) | 견적 · 동의서 · 데모 결제 · 보안 해제 | 3 | `quote_booking` → 동의서 → Pay (demo) → 시터 집 정보 즉시 / 견주 집 출입 정보 2시간 전 | ✅ — **ENTRY-1 (P0) 남음** | 005 |
| 6b | [03D](phase-03d-booking-chat.md) | 채팅 중심 부킹 | 12 | 검색 → 시터 상세 → 채팅 한 곳에서 견적 · Meet & Greet · 합의 · 결제 · 인계 · 케어 · 리뷰, AI 칩 | 시작 전 (P0, 2026-10-17) | 014d+ |
| 7 | [04](phase-04-upload.md) | Cloudinary 업로드 | 4 | secret 없이 사진 · 영상 업로드 헬퍼 + 샘플 트레이 | ✅ | - |
| 8 | [05](phase-05-feed.md) | 케어 피드 + 알림 | 4 | 업로드 → 견주 타임라인 · Realtime 알림 센터 | ✅ | 006 |
| 9 | [06](phase-06-checks.md) | 케어 의뢰서 · 5초 체크 · Activity | 2 · 4 | 의뢰서 → AI 미션 체크리스트 · 탭 체크 → 즉시 알림 · 히스토리 | ✅ | 007 |
| 10 | [07](phase-07-report.md) | 알림장 AI | 4 | AI 칩 + 짧은 메모(선택) + 사진 → Super 초안 → 시터 승인 후 게시 | ✅ 머지 (DoD 손 확인 Q.1) | 009 |
| 11 | [07B](phase-07b-inquiry.md) | 문의 AI + RAG | 1 | 문의 → 몇 초 안 시터 말투 초안 → 시터 승인(자동 발송은 사람 속도) — 스케줄 · 견적 · 정책 · Life Record 근거 | ✅ 머지 (DoD 손 확인 Q.1) | 010 · 011* |
| 12 | [09](phase-09-caption.md) | 캡션 · 앨범 분류 | 4 | 업로드만으로 AI 캡션 + Meals/Walks/Naps 앨범 (fallback 보장) | ✅ 머지 (DoD 손 확인 Q.1) | - |
| 13 | [07C](phase-07c-completion.md) | 완료 · 리뷰 · Life Record | 5 | 귀가 리포트 → ★ 리뷰 → Life Record → RAG → 다음 예약 | ✅ 머지 (DoD 손 확인 Q.1) | 011 |
| 14 | [06B](phase-06b-transit.md) | Pet Transit | 4 | Start trip → 실시간 위치 · ETA → 도착 안내 → Received/Returned (사진 체크는 API만) | ✅ #83 | 012 |
| — | [08](phase-08-safety.md) | 세이프티 가드 → **12.1 Treat check로 이동** (D61) | 4 보조 | 설계 문서로만 남음 (성분표 → Vision + Ultra → 경고 모달 · 알림 + Tavily) | 12.1에서 구현 ✅ | 013 |
| 15 | [12](phase-12-snap.md) | **Snap 탭** — Treat check · Mood · Sticker (D61) | 4 보조 | 라벨 → 먹어도 되는지 · 펫 사진/영상 → 펫별 박스 + 감정 % · 펫 스티커 → 그림일기 꾸미기 | 🟡 12.0–12.4 끝 (PR #90), 12.5 다음 | 013 · 013b |
| 16 | [11](phase-11-p1.md) | P1 (+P2) | — | 이번 창(10/17–10/23): **11.1 사진 요청 → 11.11 Settings · What's New**, 그다음 **11.15 펫 온보딩**(10/24–27) | ⏳ | 014 |
| 17 | [10](phase-10-deploy.md) | 데모 · 배포 | 전체 | 시드 + 고정 데모 계정 + README + 영상 + 12/15까지 유지 | ⏳ **맨 끝** (Vercel · Render는 이미 운영 중) | - |
| 18 | [13](phase-13-after-hackathon.md) | **해커톤 이후 (P2)** | 전체 | iOS · Android 이식과 스토어 출시, Stripe 실결제, 뒤로 미룬 개선들 | ⏳ 10/30 이후 ([마일스톤 P2](https://github.com/minsikpaul92/Goldito/milestone/3)) | - |
| 병렬 | [Q](phase-q-quality.md) | 품질 · 데이터 · 말투 · QA | 전체 | 손 테스트 · 실무 문구 · 익명화 데이터 말투 · R3/R4 리뷰 항목 | 🟡 슬기, 10/9–10/29 | 011m–011z |

> 일정이 밀리면 줄이는 순서: Phase 12 안에서 먼저([phase-12-snap.md](phase-12-snap.md) § 자르는 순서) → 11 P1 창(11.11 → 11.1) → 11.15 S4 → S3 → S2 → 10.10 Split view. **5단계 각각 한 장면은 반드시 남긴다.**

## Stage ↔ Phase 매핑 (데모 장면)

| Stage | 완료 Phase | 데모 장면 ([full-process.ko.md §6](../full-process.ko.md#6-데모-경로-a-stay-with-goldito)) |
| :--- | :--- | :--- |
| 1 Inquiry | 07B (+03C 견적, 07C 기록) | ① 문의 → AI 초안(몇 초) → 자동 모드면 약 30초 뒤 답 + 견적 카드 |
| 2 Meet & Greet | 06 (의뢰서) · 03B (Meet & Greet · 3B.11 Google Meet · 이동 방식) | ② 의뢰서 → 체크리스트 · 첫 만남 Meet & Greet(Google Meet) · Sitter/Owner drives |
| 3 Booking | 03B · 03C | ③ 수락 → 동의서 → Pay (demo) → 정보 해제 |
| 4 Care & Transit | 04 · 05 · 06 · 06B · 07 · 09 · 12 (Snap: Treat check · Mood · 그림일기 스티커) | ④ Trip → 5초 체크 → 알림장(그림일기) → 앨범 · Treat check |
| 5 Completion | 07C | ⑤ 귀가 → home safe → ★ 리뷰 → Life Record |

## Phase 문서 사용법 (에이전트·사람 공통)

1. 담당 GitHub 이슈의 task ID 확인
2. 해당 phase 문서의 **작업 상세 행 + DoD**만 구현 (범위 "제외" 칸은 손대지 않음)
3. 새 파일 위치·이름은 [architecture §2](architecture.ko.md#2-리포-구조-최종-형태), 화면 route는 [§3](architecture.ko.md#3-화면--라우트-맵-최종-형태)
4. 끝난 phase 뒤에 생긴 후속 작업(리뷰 · 피드백에서 나온 것)은 그 phase 문서의 **Open items** 절이 명세이고, 순서와 담당은 GitHub 이슈(마일스톤 + 담당자)가 정한다. 끝난 phase 문서의 체크박스는 갱신하지 않는다(상태의 정본 = test-guide 현황표 + 이 문서의 Phase 목록)
5. 결정이 필요한데 문서에 없으면 → architecture §1에 D## 추가 제안 후 사람에게 확인
