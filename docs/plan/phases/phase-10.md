# Phase 10 — 데모 시드 · 배포 · 제출 README

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D18 배포, D19 시드

## Goal

심사위원·팀이 **15분 안에** "PawNote의 하루" 전체를 재현할 수 있게 **시드 데이터**, **공개 데모 URL**, **테스트 계정**, **루트 README 실행 가이드**를 완성하고, **12/15 심사 종료까지 데모가 살아 있게** 운영 준비를 끝낸다. 로그인 UX·Welcome·Try demo는 **[onboarding.ko.md](../onboarding.ko.md)** (OB.3·OB.5와 연동).

### Goal 달성 기준

- [ ] `backend/scripts/seed_demo.py` — owner, sitter, dog Bori, chicken allergy, med 08:00, walk 10:30 (+ `--relative` 옵션)
- [ ] README Getting Started: clone → env → migrate → seed → run → login
- [ ] Public frontend URL (Vercel) + backend URL (**Nebius AI Cloud Serverless Endpoint** — 정식; Render는 fallback만), production CORS
- [ ] 테스트 계정 문서 (Devpost 붙여넣기용)
- [ ] 12/15까지 유지 계획 실행 (keep-alive, 한도 모니터링)

---

## 선행 조건

- Phase 05–09 P0 기능 완료 (배포 리허설 10.3은 **10/18까지** Phase 06 시점에 먼저 1회 해도 좋음)
- Phase 00 모든 키 production env에 설정

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| Vercel (Expo web export) + **Nebius AI Cloud** Serverless Endpoint (Docker) | App Store / Play 빌드 |
| Supabase keep-alive, 모니터링 | Multi-region HA |
| 3분 영상 스크립트 outline | 영상 편집 (묵) |
| Nebius/NVIDIA feedback 초안 | Devpost 최종 클릭 (민식) |

---

## "PawNote의 하루" 데모 스크립트 (Goal 시나리오)

| 시간 | 액션 (sitter) | 검증 (owner) | Phase |
| :--- | :--- | :--- | :--- |
| 08:00 | 리마인더 배너 → medication **Complete with photo** | 토스트 "Bori's medication is done ✅", Care ✅ | 06 |
| 10:30 | walk 완료 + 산책 사진 **+ Photo** | 피드에 AI 캡션 카드 | 06, 09 |
| 13:00 | (P1) owner **Request photo** → sitter 낮잠 사진 | 요청 완료 표시 | 11 |
| 15:00 | Scan 탭 → 치킨 간식 라벨 | sitter 빨간 모달 / owner "Blocked a risky treat" | 08 |
| 18:00 | 퀵탭 → Generate → Send | Reports에 알림장 | 07 |

녹화는 아무 시간에나 가능해야 함 → `seed_demo.py --relative`: med = now+2분, walk = now+6분으로 시드.

---

## 작업 상세

| ID | 작업 | 상세 / DoD |
| :--- | :--- | :--- |
| 10.1 | Seed script | `backend/scripts/seed_demo.py` (service role, D19): `auth.admin.create_user` × 2 (`demo-owner@pawnote.test`, `demo-sitter@pawnote.test`, `email_confirm=True`, 비밀번호는 env `DEMO_PASSWORD`), dog Bori(Maltese, 4y), allergy chicken, care_tasks 2개, 샘플 feed 2개(선택, Cloudinary `pawnote/demo/` 공용 이미지). **멱등** (`--reset`이면 demo 계정 데이터 삭제 후 재생성). 실제 PII 0 |
| 10.2 | README | 루트 Getting Started (복붙 명령, Windows/mac 둘 다), "How we use Nemotron" 표를 실제 model·latency로 갱신, architecture 그림, 스크린샷 4장. backend/frontend README 최신화 |
| 10.3 | Deploy backend | `backend/Dockerfile` (python:3.12-slim, `uvicorn app.main:app --host 0.0.0.0 --port 8000`). **Nebius AI Cloud:** Container Registry push → **Serverless Endpoint** 생성, env secret 주입, `/health` 확인 (Builders & Brews **AI Cloud $100** 크레딧 활용). **Render**는 Nebius만 막힐 때 fallback + README·피드백에 이유 기록. **CD:** `.github/workflows/deploy-backend.yml` — `push: main` + `paths: backend/**` + `workflow_dispatch(image_tag)`: docker build → Registry push (tag = `${{ github.sha }}`) → Endpoint 이미지 갱신 → `curl -f $BACKEND_URL/health` 재시도 5회. 첫 배포는 수동으로 Endpoint 생성 후 워크플로는 갱신만 담당 ([architecture §11](architecture.ko.md#11-cicd-파이프라인-d20)) |
| 10.4 | Deploy frontend | `npx expo export -p web` → `dist/` → Vercel (SPA rewrite `/(.*) → /index.html`), env `EXPO_PUBLIC_*` production 값. backend `CORS_ORIGINS`에 Vercel 도메인 추가. **CD:** Vercel GitHub 연동 — Root Directory `frontend`, Build `npx expo export -p web`, Output `dist`. PR마다 Preview URL, main 머지 시 production. Preview 도메인(`*.vercel.app`)은 CORS에 정규식으로 허용하거나 Preview는 staging backend 없이 UI 확인용으로만 사용 |
| 10.5 | 데모 계정 문서 | `docs/DEMO_ACCOUNTS.md`: URL, 이메일 2개, 비밀번호는 **Devpost 제출란에만** 기재 (repo엔 "see submission"), 데모 순서 5줄 |
| 10.6 | Feedback log | README 피드백 표: Token Factory, Serverless Endpoint, 각 Nemotron 모델별 (용도 / 잘된 점 / 개선점 / 온보딩 / 재사용 의향) — 개발 중 `notes/`에 쌓인 메모 정리 |
| 10.7 | 유지 계획 (~12/15) | ① Supabase 무료 일시정지 방지: `.github/workflows/keepalive.yml` cron(매일) → backend `GET /health/deep`(Supabase `select 1` 수행; `/health`는 가볍게 유지) ② Cloudinary·Nebius 크레딧 잔량 주 1회 확인 (캡처 1장 ≈ 비용 계산표) ③ 데모 계정 데이터 오염 시 `seed_demo.py --reset` |
| 10.8 | 내부 마감 10/28 체크리스트 | 아래 DoD 전부 + 영상 업로드(YouTube public, < 3분, 영어 음성) + Devpost 초안 |

---

## Definition of Done (DoD)

1. **Cold start:** 팀원이 README만 보고 새 PC에서 로컬 실행 성공
2. **Judge path:** demo URL + test owner/sitter 로그인 → 데모 스크립트 5단계 성공 (시크릿 창 2개)
3. MIT license가 GitHub About에 표시
4. 제출 자료 **영어** (description, video audio, README)
5. 배포 URL에서 `/health` 200, cold start 포함 첫 응답 < 10초
6. backend 코드 1줄 변경 PR 머지 → 수동 개입 없이 운영 반영 (CD 확인), Vercel Preview URL이 PR에 표시

---

## 산출물

- `backend/scripts/seed_demo.py`, `backend/Dockerfile`, `.github/workflows/deploy-backend.yml`, `.github/workflows/keepalive.yml`
- `docs/DEMO_ACCOUNTS.md`
- Updated root `README.md` (Getting Started + Nemotron usage + Nebius services + Feedback log)

---

## AI 프롬프트

Playbook §12 — seed(10.1) / deploy backend(10.3) / deploy frontend(10.4) 각각 별도

---

## 다음

→ [Phase 11 — P1 기능](phase-11.md) (P0 데모가 배포 URL에서 동작한 뒤에만)
