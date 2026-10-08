# 머지 전 PR 테스트 런북 (2026-10-07)

> 아직 머지하지 않은 PR 4개를 **한 번에** 손으로 확인하는 순서입니다. 시나리오 표 자체는 [test-guide.ko.md](test-guide.ko.md) §3에 있고, 이 문서는 **준비 → 데이터 만들기 → 순서 → 결과 적기**만 다룹니다.

> ⚠️ **2026-10-08 첫 테스트에서 막힘** — 체크아웃이 열리지 않음(요금표 없음)과 깨끗한 테스트 계정 상태가 없음. 피드백 전부와 고치는 아이디어: [feedback-2026-10-08.ko.md](feedback-2026-10-08.ko.md). FB-7(요금표)·FB-10(계정 리셋)이 끝나기 전에는 아래 §2의 3~7단계를 끝까지 갈 수 없습니다.

## 0. 무엇을 테스트하나

네 PR은 서로 위에 쌓여 있습니다 (#55 → #56 → #57 → #58). **맨 위 브랜치 하나에 전부 들어 있으니 그것만 받으면 됩니다.**

| PR | 내용 | 시나리오 |
| :--- | :--- | :--- |
| [#55](https://github.com/minsikpaul92/Pawddy/pull/55) 알림장 칩 · 화면 + 피드백 반영 + 날짜 달력 | 시터 Diary(칩 · 사진 · 값 고치기 · + Add · 메모 · 미리보기 · Send), 오너 Diary, 달력, 시터 Home 버튼 모양, 시터 Bookings 첫 탭 | REPORT-1~10 · UX-1~3 |
| [#56](https://github.com/minsikpaul92/Pawddy/pull/56) 문의 AI · RAG · 말투 · 자동 발송 | 오너 문의 → 시터 초안 → Send, 정책, 자동 모드, Your questions, **Goldito 이름 변경** | INQ-1~19 · UX-4 · NAME-1~5 |
| [#57](https://github.com/minsikpaul92/Pawddy/pull/57) 사진 캡션 · 앨범 | 올리기만 하면 AI 캡션 + 분류, Timeline / Album | CAP-1~7 |
| [#58](https://github.com/minsikpaul92/Pawddy/pull/58) 완료 · 리뷰 · Life Record | home safe, Stay summary, 리뷰, Life Record, 다음 시터 요청 카드 | DONE-1~15 |

```bash
git fetch origin
git checkout feat/phase-07c-completion
git pull
```

## 1. 준비 (한 번)

호스팅 DB에는 `010`~`011b`가 **이미 적용**돼 있고, 시터 Chloe의 말투(스타일 카드 + 예시 3개)도 시드돼 있습니다.

1. **백엔드** (`.env`에 `NEBIUS_API_KEY` · Supabase · Cloudinary 키가 있어야 함 — [env-setup.ko.md](env-setup.ko.md)):
   ```bash
   cd backend && .venv/bin/uvicorn app.main:app --port 8000
   ```
2. **프론트** (다른 터미널):
   ```bash
   cd frontend && npx expo start --web --port 8081
   ```
   → `http://localhost:8081`. 로그인 화면의 **Try the demo** → Demo owner / Demo sitter.
3. **두 계정을 동시에**: 브라우저 프로필 두 개(또는 일반 창 + 시크릿 창)에 오너와 시터를 따로 로그인해 두면 새로고침 없이 이어지는 흐름(알림 · 자동 발송 · 문의)을 볼 수 있습니다.
4. 이름 변경 때문에 **한 번 로그아웃**된 상태에서 시작합니다 (정상, NAME-2).

⚠️ 지금 데모 예약(Robert ↔ Chloe)은 **픽업 시각(10/7 새벽)이 이미 지나서** 돌봄 중이 아닙니다. 아래 §2로 새 예약을 만들어야 시터 쪽 · 완료 시나리오를 볼 수 있습니다.

## 2. "끝난 돌봄" 만들기 (약 10분) — CAP · REPORT · DONE의 사전 조건

| 단계 | 누가 | 무엇을 | 확인 |
| :--- | :--- | :--- | :--- |
| 1 | 오너 Robert | Max → **Care tasks → Add task**로 할 일 3개: **Medication**(약), **Feeding**(밥), **Walk**(산책) | 시터 Home에서 보임 |
| 2 | 오너 | Bookings → **Book care** → Max + Mochi, **Drop-off = 오늘, 지금부터 1시간쯤 뒤**(날짜를 탭해 달력 확인 = **UX-1**, 시간은 − / +), **Pick-up = 내일** → Chloe 선택 → 요청 | 요청 카드 |
| 3 | 시터 Chloe | Bookings → **Requests** → 요청 → **Accept** (이미 만난 사이라 Meet & Greet 없음) | 오너에게 알림 |
| 4 | 오너 | 예약 → **Finish booking** → 동의서 서명 → **Pay (demo)** | 결제 완료 |
| 5 | 시터 | 예약 상세 → **Received** (드롭오프 2시간 전부터 눌림) | 돌보는 중 |
| 6 | 시터 | 돌보는 동안 쌓기: **체크인** 몇 개(식사 · 배변 · 산책 · 메모, 사진 포함 1개), **할 일 완료**(사진 1~2장 포함), Feed **+ Photo** 2~3장(밥 · 산책 · 낮잠 사진을 섞어서 = CAP), **Diary**에서 알림장 보내기(= REPORT) | Home 숫자가 올라감 |
| 7 | 시터 | 예약 상세 → **Returned** | = DONE-1 |

> 이 한 번의 흐름으로 **REPORT · CAP · DONE**을 모두 볼 수 있습니다. 6단계에서 일부러 **하지 않는 것**을 하나 정해 두면(예: 산책 기록을 안 남김) DONE-8의 "지어내지 않음"을 확인하기 좋습니다.

## 3. 권장 순서

1. **REPORT** (§3.10) — 2단계의 6번 중에. 시터 Diary → 오너 Diary / 알림.
2. **CAP** (§3.12) — 6번 중 사진 올릴 때마다 + 오너 Feed Album. **CAP-4**(백엔드 끄고 올리기)는 마지막에.
3. **INQ** (§3.11) — 완료와 별개로 언제든. 오너 → Chloe 프로필 → **Ask about a stay**. 자동 발송(INQ-13~14)은 시터가 `/profile` → **AI replies → Auto-send**를 켠 뒤 한 번 더. 정책(INQ-12)은 시터 `/profile`의 **House rules & policies**에 "No dogs over 20 kg."를 적고 시작하면 INQ-9도 볼 수 있음(Max의 체중을 25 kg으로 바꿔서).
4. **DONE** (§3.13) — 7번(Returned) 직후부터. DONE-12는 **다른 시터 계정**이 필요하면 Chloe가 아닌 시터로 Max를 요청해야 합니다(아래 §4).
5. **UX** (§3.14) · **NAME** (§3.15) — 화면 돌아다니며.

## 4. 알려진 준비물 · 주의

| 항목 | 설명 |
| :--- | :--- |
| 두 번째 시터 | 호스팅 DB에는 시터가 Chloe 한 명뿐입니다. **INQ-16**(말투 비교)과 **DONE-12**(다음 시터 요청 카드)는 두 번째 시터 계정이 필요합니다. 가입 화면에서 시터 "Paul"을 직접 만든 뒤 알려 주시면 `backend/scripts/seed_tone.py --apply`로 차분한 말투(이모지 없음)를 넣어 드립니다. (계정 생성은 사람이 직접 해야 합니다.) |
| 자동 발송 지연 | 약 15~40초(보통 30초 안팎)는 **임시 공식**입니다. 슬기의 공식이 정해지면 바뀝니다. |
| 시각 의존 | 시터 쪽 기능은 "돌보는 중"(드롭오프 30분 전 ~ 픽업 2시간 뒤)에만 열립니다. §2의 예약은 **내일 픽업**이니 오늘 테스트하면 충분합니다. |
| AI 응답 | 모델은 매번 조금씩 다른 문장을 씁니다. **사실(금액 · 날짜 · 없던 일)**이 맞는지를 기준으로 보세요. |
| 첫 로그인 | 저장 키가 바뀌어 한 번 로그아웃됩니다 (NAME-2). |
| 카메라 | 폰 카메라 촬영은 배포 뒤 확인합니다 (#19). 지금은 샘플 사진 · 파일 선택. |

## 5. 결과 적는 법

- 시나리오 표의 **상태** 칸을 `✅ 10/07 이름` 또는 `❌ 10/07 이름 — 한 줄 이유`로 고칩니다 (`test-guide.ko.md`). 사람이 안 해 본 줄은 ➖ 그대로.
- 버그 · 요청은 [test-guide.ko.md §5](test-guide.ko.md)의 표에 추가하거나, 개발자에게 시나리오 ID와 함께 알려 주세요 ("DONE-7 실패: …").
- 막히면 **어느 단계에서 어떤 화면 문구가 떴는지**만 알려 주면 됩니다 (스크린샷이면 더 좋음).

## 6. 자동 테스트 (참고 — 코드는 이미 통과)

```bash
cd backend && .venv/bin/python -m pytest -q          # 334
cd frontend && npx playwright test --project=flows    # 182 (먼저 npx expo export -p web, 환경변수는 .github/workflows/ci.yml 참고)
```
