# Phase 10 — 데모 시드 · 배포 · 제출 README

## Goal

심사위원·팀이 **15분 안에** "PawNote의 하루" 전체를 재현할 수 있게 **시드 데이터**, **공개 데모 URL**, **테스트 계정**, **루트 README 실행 가이드**를 완성하고 Devpost 제출 준비를 끝낸다.

### Goal 달성 기준

- [ ] `scripts/seed_demo` — owner, sitter, dog Bori, chicken allergy, med 8am, walk 10:30
- [ ] README Getting Started: clone → env → migrate → seed → run → login
- [ ] Public demo URL (frontend) + backend URL, CORS/production env
- [ ] Test credentials document (비밀번호는 repo 밖 또는 1Password)
- [ ] 데모 **12/15까지** 유지 계획 (호스팅·Supabase·Cloudinary 한도)

---

## 선행 조건

- Phase 05–09 P0 기능 완료
- Phase 00 모든 키 production env에 설정

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| Vercel (Expo web) or EAS web export | App Store 빌드 |
| Railway/Render/Fly backend | Multi-region HA |
| 3-min video script outline | 영상 편집 (묵) |
| Nebius/NVIDIA feedback paragraph draft | Devpost 최종 클릭 |

---

## "PawNote의 하루" 데모 스크립트 (Goal 시나리오)

| 시간 | 액션 | 검증 |
| :--- | :--- | :--- |
| 08:00 | Sitter completes medication + photo | Owner notification |
| 10:30 | Sitter completes walk + feed post | Auto caption |
| 13:00 | (P1) photo request — skip if P1 미완 | |
| 15:00 | Treat scanner DANGER | Modal |
| 18:00 | Generate + send daily report | Owner reads |

---

## 작업 상세

| ID | 작업 | DoD |
| :--- | :--- | :--- |
| 10.1 | Seed script | no real PII |
| 10.2 | Root README + backend/frontend README | copy-paste commands |
| 10.3 | Deploy + env vars | health + login |
| 10.4 | `docs/DEMO_ACCOUNTS.md` (gitignore password file option) | Devpost paste-ready |
| 10.5 | Feedback log table filled (initial) | Token Factory onboarding notes |
| 10.6 | Internal deadline Oct 28 checklist | |

---

## Definition of Done (DoD)

1. **Cold start:** 새 팀원이 README만 보고 로컬 실행 성공
2. **Judge path:** demo URL + test owner/sitter + video shows same flow
3. MIT license visible on GitHub About
4. Submission materials **English** (description, video audio)

---

## 산출물

- `scripts/seed_demo.sql` or `.py`
- `docs/DEMO_ACCOUNTS.md` (or SECRETS.local.example)
- Updated root `README.md` Getting Started + Nemotron usage + Feedback log

---

## AI 프롬프트

Playbook §12 — seed only first, deploy in separate prompt with host choice

---

## 이후 (P1+)

- Photo request, notices popup, Tavily, Q&A — [개발 계획](../README.ko.md) P1 표
