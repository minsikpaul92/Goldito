# Phase 13 (P2): 해커톤 이후, 앱 출시와 실결제

> **상태 (2026-10-19):** 시작 전. 해커톤 제출(2026-10-30) 뒤 바로 시작한다. GitHub 마일스톤: [P2 after hackathon](https://github.com/minsikpaul92/Goldito/milestone/3). 이슈가 상태와 체크리스트의 정본이고, 이 문서는 순서와 설계 결정만 적는다.
> **원칙:** 마감 전에는 손대지 않는다. 새 일이 생기면 GitHub 이슈로 만들고 마일스톤을 붙인다 (GitHub issues).

## Goal

웹앱으로 만든 Goldito를 iOS와 Android 스토어 앱으로 출시하고, 데모 결제를 Stripe 실결제로 바꾼다. 그 사이에 데모 경로 밖으로 밀어 둔 작은 개선들을 정리한다.

## 순서 (권장)

```
13.1 결제 전 버그 정리 (#194) → 13.2 Stripe (#198) ┐
13.3 작은 개선들 (#190 · #191 · #192 · #195 · #196)  ├→ 13.4 네이티브 이식 · 출시 (#197)
13.5 시터 일정 UI 정리 (#193, Stripe 온보딩과 같이)  ┘
```

결제 방식이 정해져야 앱의 결제 화면을 확정할 수 있어서 Stripe를 이식보다 먼저 시작한다. 이식 중 결제 화면은 웹 Stripe 흐름을 재사용한다.

## 작업

| ID | 작업 | 이슈 | 메모 |
| :--- | :--- | :--- | :--- |
| 13.1 | 결제 변경 뒤 체크아웃 재오픈 수정 (BF.8 · BF.9) | [#194](https://github.com/minsikpaul92/Goldito/issues/194) | `follow_paid_booking_change`가 아직 제안 상태인 인계를 동의로 센다. 두 번째 결제를 언제 묻는지 정하는 로직이라 Stripe 전에 고친다 |
| 13.2 | **Stripe 실결제** (Connect, 웹훅, 환불, 정산, 세금) | [#198](https://github.com/minsikpaul92/Goldito/issues/198) | 아래 § Stripe |
| 13.3a | 끝나지 않은 트립 정리 (TRIP-1) | [#190](https://github.com/minsikpaul92/Goldito/issues/190) | 네이티브 백그라운드 위치와 함께 보면 좋다 |
| 13.3b | 다른 오너가 잡은 날 표시 (HOLD-1) | [#191](https://github.com/minsikpaul92/Goldito/issues/191) | 오너가 둘 이상 쓰기 시작하면 먼저 올린다 |
| 13.3c | 시터 Bookings 탭 진입 위치 (BK-1) | [#192](https://github.com/minsikpaul92/Goldito/issues/192) | |
| 13.3d | 인계 사진 체크를 앱에 연결 (선택) | [#195](https://github.com/minsikpaul92/Goldito/issues/195) | API와 `handoff_checks`는 있다 ([phase-06b](phase-06b-transit.md)) |
| 13.3e | 뒤로 미룬 제품 목록 (IA 후속, 11.10 · 11.14 · 11.2 · 11.6 · 11.7, RK · IQ-16 · MG, 웹캠) | [#196](https://github.com/minsikpaul92/Goldito/issues/196) | 하나씩 꺼낼 때 각각 새 이슈로 나눈다 |
| 13.3f | 리포트 카드 테마와 프리셋 스티커 (11.8) | [#118](https://github.com/minsikpaul92/Goldito/issues/118) | 묵 트랙 |
| 13.4 | **iOS · Android 이식과 스토어 출시** | [#197](https://github.com/minsikpaul92/Goldito/issues/197) | 아래 § 네이티브 |
| 13.5 | 시터 일정 UI 정리와 "가격을 설정하세요" 알림 (CAL · FB-11 · FB-7b) | [#193](https://github.com/minsikpaul92/Goldito/issues/193) | 묵 디자인 후. Stripe의 시터 온보딩 화면과 같이 설계 |

## Stripe (13.2, [#198](https://github.com/minsikpaul92/Goldito/issues/198))

- **지금:** 체크아웃의 `Pay (demo)`는 `paid_at`만 저장하고 출입 정보를 연다 ([phase-03c](phase-03c-payment.md), D30, D31). 견적은 서버가 CAD로 계산한다 (D29).
- **모델:** Stripe Connect (캐나다)로 오너 결제, 플랫폼 수수료, 시터 정산. 수수료율과 정산 시점은 시작 전에 정한다.
- **결제 확정은 웹훅:** 서버가 저장된 견적으로 결제를 만들고(클라이언트 금액을 믿지 않는다), 웹훅이 `paid_at`을 쓴다. 출입 정보 해제는 이 확정에 묶는다.
- **변경과 환불:** 결제 후 변경(추가 결제 또는 차액 환불), 취소(양쪽), 취소 정책, 분쟁.
- **시터:** Connect 온보딩 화면(프로필), Earnings 화면(프로필, [D47](architecture.ko.md)), 정산 상태.
- **규정:** GST/HST, 영수증, 이용약관과 환불 정책 문구. 테스트 모드와 테스트 카드로 먼저 끝내고 라이브로 전환.
- **사람이 하는 일:** Stripe 계정 개설과 라이브 키, 마이그레이션 적용. 키는 환경 변수에만 둔다.
- **심사용 계정:** 출시 뒤에도 데모 결제 경로는 플래그 뒤에 남긴다.

## 네이티브 이식과 출시 (13.4, [#197](https://github.com/minsikpaul92/Goldito/issues/197))

- **지금:** Expo SDK 57, `frontend/app.json`에 번들 ID 없음, `eas.json` 없음, 스플래시 플러그인 없음 (`assets/splash-icon.png`는 Expo 기본 이미지), 브랜드 아이콘은 `frontend/assets/`에 있다 (TODO BRAND-1).
- **설정:** `eas.json`, iOS 번들 ID, Android 패키지, `expo-splash-screen`, 버전 규칙, Apple Developer와 Google Play 계정.
- **네이티브 기능:** 백그라운드 위치(`expo-location`과 태스크 매니저, "항상" 권한과 스토어 설명), 푸시 알림(`expo-notifications`: 출발, 도착), 네이티브 지도, 카메라 · 사진 · 마이크 권한 문구, 트립 정리(#190).
- **실기기 점검:** 모든 화면, 세이프 에어리어, 키보드, 딥링크(`goldito://`), Google 로그인과 Meet 링크, 실기기 위치 점검([#157](https://github.com/minsikpaul92/Goldito/issues/157)).
- **출시:** TestFlight와 Play 내부 테스트, 스토어 등록 정보(스크린샷, 설명, 개인정보 라벨, 데이터 안전 양식), 앱 안 계정 삭제, 연령 등급, 심사용 테스트 계정, 프로덕션.
- **주의:** 스토어 제출은 개발자가 직접 한다. 실제 서비스 결제는 디지털 상품이 아니라서 인앱 결제 대신 Stripe를 쓸 수 있지만, 제출 전에 현재 스토어 규정을 확인한다. 개인정보 페이지는 푸시와 위치까지 넓힌다.

## DoD

1. 서명된 iOS 빌드가 TestFlight에서, Android 빌드가 Play 내부 테스트에서 돈다.
2. Stripe 테스트 카드로 결제하면 웹훅 뒤에만 예약이 확정되고, 시터가 테스트 정산을 받는다.
3. 취소와 결제 후 변경이 맞는 환불 또는 추가 결제를 만든다.
4. 화면을 꺼도 트립 위치가 공유되고 핵심 이벤트의 푸시가 온다.
5. 두 스토어가 첫 릴리스를 승인한다.
