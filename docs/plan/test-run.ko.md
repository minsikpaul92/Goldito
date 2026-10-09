# 수동 테스트 런북 (2026-10-09 갱신)

> 지금까지 만든 기능을 **손으로** 확인하는 순서입니다. 시나리오 표 자체는 [test-guide.ko.md](test-guide.ko.md) §3에 있고, 이 문서는 **어디서 시작 → 준비 → 순서 → 결과 적기**만 다룹니다.
>
> PR #55~#60은 **모두 `main`에 머지**됐습니다(#60 = `ad80583`, 2026-10-09). **테스트는 항상 `main`을 Vercel에서** 합니다 — 브랜치를 받아서 로컬로 테스트하지 않습니다 (2026-10-09 결정).

## 0. 어디서 · 어떤 상태에서 시작하나 ⬅️ 먼저 읽기

**주소: https://goldito-petcare.vercel.app** (main이 머지될 때마다 자동 배포). 로그인 화면 **Try demo → Demo owner / Demo sitter**.

> **백엔드는 Render에 배포돼 있습니다 (U0, 2026-10-09 — https://goldito-backend.onrender.com).** 업로드 · AI(알림장 칩 · 초안, 문의 답장, 캡션, 케어 체크리스트, Life Record) · 데모 리셋이 모두 Vercel에서 됩니다. 무료 플랜이라 **15분 동안 아무도 안 쓰면 잠들고, 그 뒤 첫 요청은 30~50초** 걸립니다 — 그래서 10분마다 핑으로 깨워 둡니다. 처음 한 번 느린 건 괜찮지만, **매번 처음이 느리면 핑이 멈춘 것**이니 민식에게 알려 주세요 (확인 방법: [env-setup.ko.md](env-setup.ko.md) § 배포된 백엔드).

**데모 계정의 상태는 누가 마지막에 뭘 했는지에 따라 다릅니다.** 시작하기 전에 원하는 상태로 리셋하세요(§1 아래).

### 어떤 시나리오는 어느 상태에서 시작하나

| 보고 싶은 것 | 시작 상태 | 처음 할 일 |
| :--- | :--- | :--- |
| 펫 등록 · 처음 사용 | `empty` | 오너 로그인 → Add pet |
| 예약 만들기 (Book care · 달력 UX-1) · 문의 INQ-* | `pets` | 오너 Bookings → Book care, 또는 Chloe 프로필 → Ask about a stay |
| 체크아웃 · 결제 (FLOW-3 · BOOK-5) | `confirmed` | 오너 예약 → Finish booking |
| 결제 직후 확인 카드 · 준비물 (FLOW-13 · FLOW-14) | `ready` 또는 `confirmed`(직접 결제) | 오너 예약 상세 |
| 시터 Received · 돌봄 시작 | `ready` | 시터 예약 → Received |
| 체크인 · 사진 · 알림장 · 캡션 (REPORT · CAP) | `in_care` | 시터 Home → 체크인 |
| Returned · 리뷰 · Life Record (DONE-*) · 즐겨찾기 · 시터 비공개 리뷰 | `in_care` → 돌본 뒤 | 시터 예약 → Returned |

## 1. 준비 (한 번)

호스팅 DB에는 `010`~`011b`와 `011f`~`011h`가 **적용**돼 있습니다 (`011c`~`011e`는 R1b에서 만들 예정).

1. **브라우저 두 개**: 크롬 일반 창 + 시크릿 창에 각각 https://goldito-petcare.vercel.app → 한쪽은 **Demo owner**(Robert), 다른 쪽은 **Demo sitter**(Chloe). 새로고침 없이 이어지는 흐름(알림 · 자동 발송 · 문의)을 볼 수 있습니다.
2. 결과는 §5대로 test-guide에 적습니다 (`main` 기준).
3. **(개발자만) 로컬로 띄울 때** — 코드를 고치는 중 확인용이고, 결과 기록(✅)은 Vercel(main) 기준입니다:
   ```bash
   cd backend && .venv/bin/uvicorn app.main:app --port 8000    # backend/.env 필요 (env-setup.ko.md)
   cd frontend && npx expo start --web --port 8081              # 다른 터미널
   ```

### 상태를 다시 고르고 싶을 때 (리셋)

**앱에서:** 시터 또는 오너로 로그인 → **Profile → Demo tools** → 상태 선택 → 확인. 테스트 기간에만 켜 둔 기능입니다(`DEMO_RESET_ENABLED=1` + `EXPO_PUBLIC_DEMO_TOOLS=1` — 심사 전에 제거).

호스팅 DB의 데모 데이터를 **지우고 다시 만듭니다** (펫 · 정책 · 말투 시드는 유지). 지우는 것은 **두 데모 계정 사이의 것만**입니다 — 다른 계정이 Chloe를 예약 · 문의한 것(그 알림장 · Life Record · 알림 포함)은 남고, Chloe에게 다른 오너의 확정 예약이 있으면 일정은 그대로 둡니다(출력에 "schedule kept"). 되돌릴 수 없으니 먼저 dry run으로 숫자를 보세요.

```bash
cd backend
.venv/bin/python -m scripts.reset_demo --state ready              # dry run — 지울 행 수만 보여 줌
.venv/bin/python -m scripts.reset_demo --state ready --apply      # reset 입력 (--yes면 생략)
```

`--state`는 `empty` · `pets` · `confirmed` · `ready` · `in_care`. 위 스크립트는 `backend/.env`(서비스 키)가 있는 개발자 PC에서만 — 보통은 앱의 Demo tools를 쓰면 됩니다. `in_care`는 드롭오프를 "지금 + 3분"으로 잡지만 Received까지 끝난 상태라 바로 기록할 수 있습니다(CW-1) — 단 호스팅 DB에 `011i`가 적용되기 전에는 3분 동안 체크인이 막힙니다.

| 상태 | 만들어지는 것 |
| :--- | :--- |
| `empty` | 오너 펫 없음, 시터는 스케줄 · 요금 준비됨 |
| `pets` | Max + Mochi, 예약 없음 |
| `confirmed` | 시터가 수락한 예약, **체크아웃 전** (드롭오프 모레 9:30 AM) |
| `ready` | 결제까지 끝, **드롭오프 1시간 뒤** → 시터 Received가 바로 열림 |
| `in_care` | 결제 + **Received까지 끝**, 드롭오프 3분 뒤 → 돌보는 중 (체크인 · 사진 · 알림장 가능) |

## 2. "끝난 돌봄" 만들기 — 지금은 [A]부터

| 단계 | 누가 | 무엇을 | 확인 |
| :--- | :--- | :--- | :--- |
| ~~1~~ | ~~오너~~ | ~~예약 요청 → 시터 수락 → 체크아웃 · 결제~~ | **`ready`가 이미 했음** (직접 해 보려면 `pets`부터) |
| **A** | 오너 Robert | **Bookings → 예약 열기**(제목 **Booking details**): 맨 위 초록 **확인 카드**("Booked and paid: $268.13 CAD · Drop-off …")가 보임 → 누르면 사라지고 새로고침해도 안 나옴, 상단에 `Paid` 칩 남음 · **Pack for …** 체크 → 나갔다 와도 체크 남음 | **FLOW-13 · FLOW-14** |
| B | 오너 | Max → **Care tasks → Add task**로 할 일 3개: **Medication**(약), **Feeding**(밥), **Walk**(산책) (`ready`/`in_care`에서는 지워져 있음) | 시터 Home에서 보임 |
| C | 시터 Chloe | **Bookings → 예약 → Received** (드롭오프 2시간 전부터 눌림) | 오너에게 "Max & Mochi arrived …" 알림 · 돌보는 중 |
| D | 시터 | 돌보는 동안 쌓기: **체크인** 몇 개(식사 · 배변 · 산책 · 메모, 사진 포함 1개), **할 일 완료**(사진 1~2장 포함), Feed **+ Photo** 2~3장(밥 · 산책 · 낮잠을 섞어서 = CAP), **Diary**에서 알림장 보내기(= REPORT) | Home 숫자가 올라감 |
| E | 시터 | 예약 상세 → **Returned** | = DONE-1 |

> 한 번의 흐름으로 **REPORT · CAP · DONE**을 모두 볼 수 있습니다. D에서 일부러 **하지 않는 것**을 하나 정해 두면(예: 산책 기록을 안 남김) DONE-8의 "지어내지 않음"을 확인하기 좋습니다. **돌보는 중(`in_care`)에서 바로 시작**하려면 C를 건너뛰고 B → D로 가면 됩니다.

## 3. 권장 순서

1. **FLOW-13 · FLOW-14** (§3.16) — [A] 오너 예약 상세. 가장 먼저 (닫으면 확인 카드가 다시 안 나옴).
2. **REPORT** (§3.10) — D 중에. 시터 Diary → 오너 Diary / 알림.
3. **CAP** (§3.12) — D 중 사진 올릴 때마다 + 오너 Feed Album. **CAP-4**(백엔드 끄고 올리기)는 마지막에.
4. **INQ** (§3.11) — 완료와 별개로 언제든. 오너 → Chloe 프로필 → **Ask about a stay**. 자동 발송(INQ-13~14)은 시터가 `/profile` → **AI replies → Auto-send**를 켠 뒤 한 번 더. 정책(INQ-12)은 시터 `/profile`의 **House rules & policies**에 "No dogs over 20 kg."를 적고 시작하면 INQ-9도 볼 수 있음(Max의 체중을 25 kg으로 바꿔서).
5. **DONE** (§3.13) — E(Returned) 직후부터. DONE-12는 **다른 시터 계정**이 필요합니다(아래 §4).
6. **UX** (§3.14) · **NAME** (§3.15) — 화면 돌아다니며.

## 4. 알려진 준비물 · 주의

| 항목 | 설명 |
| :--- | :--- |
| 두 번째 시터 | 호스팅 DB에는 시터가 Chloe 한 명뿐입니다. **INQ-16**(말투 비교)과 **DONE-12**(다음 시터 요청 카드)는 두 번째 시터 계정이 필요합니다. 가입 화면에서 시터 "Paul"을 직접 만든 뒤 알려 주시면 `backend/scripts/seed_tone.py --apply`로 차분한 말투(이모지 없음)를 넣어 드립니다. (계정 생성은 사람이 직접.) |
| 상태는 시간이 지나면 낡음 | `ready`는 만든 시각 +1시간이 드롭오프라, **하루 이상 지나면** 다시 만드세요 (`--state ready`). 시터 돌봄 도구는 드롭오프 30분 전 ~ 픽업 2시간 뒤에만 열립니다. |
| 확인 카드 · 준비물은 이 브라우저에만 저장 | FLOW-13/14의 "닫음"과 준비물 체크는 **브라우저 localStorage**입니다 (다른 브라우저 · 시크릿 창 · 새 기기에서는 비어 있음 — 설계). |
| 자동 발송 지연 | 약 15~40초(보통 30초 안팎)는 **임시 공식**입니다. 슬기의 공식이 정해지면 바뀝니다. |
| AI 응답 | 모델은 매번 조금씩 다른 문장을 씁니다. **사실(금액 · 날짜 · 없던 일)**이 맞는지를 기준으로 보세요. |
| 카메라 | 폰 카메라 촬영은 배포 뒤 확인합니다 (#19). 지금은 샘플 사진 · 파일 선택. |

### 아직 안 고친 알려진 문제 (보고하지 않아도 됩니다)

이미 기록돼 있고 순서대로 고칠 예정입니다 — 만나면 "그거구나" 하고 넘어가세요. 자세한 내용은 [feedback-2026-10-08.ko.md](feedback-2026-10-08.ko.md) · [review-2026-10-08.ko.md](review-2026-10-08.ko.md).

| 어디서 | 증상 | 항목 |
| :--- | :--- | :--- |
| 시터 Bookings | 진행 중 예약이 **Upcoming**에 있음 (In progress 구분 없음) | FB-8 |
| 시터 예약 상세 | **Returned**가 확인 없이 바로 처리됨 (되돌릴 수 없음 — Life Record가 써짐) | FB-9 |
| 시간 변경 시트 | Drop-off ↔ Pick-up 오갈 때 값이 날아감 · 이미 끝난 드롭오프 변경을 제안함 | FB-5 · FB-6 |
| 상대 화면 | 요청을 보내도 상대 목록이 실시간으로 안 바뀜 (새로고침 필요) | FB-2 |
| 날짜 · 시간 입력 | 곳곳이 − + 만 있음 (달력 · 시계 통일은 아직) | FB-3 |
| 시터 알림 | 오너가 요금표 없는 시터로 체크아웃하면 시터에게 "Set your prices" 알림이 안 감 | FB-7b |
| 문의 AI | AI가 "가능해요"라고 했는데 예약이 거절될 수 있음 · 거절 답장에 견적 카드가 붙음 · 처음 문의한 오너 이름이 시터에게 안 보임 | RV-1 · RV-3 · RV-4 (R1b) |
| 시터 체크인 | Received를 약속 시각보다 일찍 누른 뒤(또는 `in_care` 리셋 뒤 3분 안) 체크인이 "Tasks open once the stay has started"로 막힘 | CW-1 — 호스팅 DB에 `011i` 적용 전까지 |
| 첫 요청 | 30~50초 걸림 (Render 무료 플랜이 잠들었다 깨는 중) | 설계 — keep-alive cron |

## 5. 결과 적는 법

- 시나리오 표의 **상태** 칸을 `✅ 10/09 이름` 또는 `❌ 10/09 이름 — 한 줄 이유`로 고칩니다 (`test-guide.ko.md`). 사람이 안 해 본 줄은 ➖ 그대로. **Vercel(main)에서 한 것만** 기록합니다.
- 버그 · 요청은 [feedback-2026-10-08.ko.md](feedback-2026-10-08.ko.md)에 **FB-30부터** 번호를 붙여 적고(본 것 · 원인 짐작 · 생각 · 급함 여부), 급하면 민식에게 바로 알립니다 — [phases/phase-q.md](phases/phase-q.md) Q.1.
- 막히면 **어느 단계에서 어떤 화면 문구가 떴는지**만 알려 주면 됩니다 (스크린샷이면 더 좋음).

## 6. 자동 테스트 (참고 — 코드는 이미 통과)

```bash
cd backend && .venv/bin/python -m pytest -q          # 380개 (2026-10-09)
cd frontend && npx playwright test --project=flows    # 약 210개 (먼저 npx expo export -p web, 환경변수는 .github/workflows/ci.yml 참고)
```
