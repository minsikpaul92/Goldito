# Phase 00 — 사전 준비 (Prerequisites)

## Goal

**코드를 작성하기 전에** Supabase·Cloudinary·Nebius(·Tavily) 계정과 로컬 환경 변수를 준비해, Phase 01부터 AI/개발이 막히지 않게 한다.

### Goal 달성 기준

- [ ] `backend/.env`와 `frontend/.env`에 필요한 키가 채워져 있음 (git에는 `.env.example`만)
- [ ] Supabase 대시보드에서 프로젝트 URL·anon key·service role key 확인
- [ ] 슬기가 사용할 **Nemotron model ID 목록**이 팀 공유 문서 또는 `docs/plan/README.ko.md` §6에 반영됨

---

## 왜 이 Phase가 먼저인가

Phase 01~03은 Supabase 없이도 뼈대는 만들 수 있지만, Phase 02 migration 적용·Phase 03 Auth는 **즉시 Supabase가 필요**합니다. Cloudinary는 Phase 04, Nebius는 Phase 07부터 필수입니다.

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| 계정 생성, API 키 발급, activation code | 애플리케이션 코드 |
| 로컬 `.env` 작성 | Devpost 제출 |
| Nebius 크레딧 신청 (`NEBIUS-DEVPOST-GLOBAL26`) | Tavily 연동 코드 (키만 Phase 00.4) |

---

## 작업 상세

| ID | 작업 | 담당 | 상세 |
| :--- | :--- | :--- | :--- |
| 0.1 | Supabase 프로젝트 | 민식 | Auth 이메일 활성화, 리전 선택(지연 고려). Realtime 사용 예정이므로 무료 tier 한도 확인 |
| 0.2 | Cloudinary | 민식 | Cloud name, API Key/Secret. 폴더 규칙: `pawnote/{dog_id}/`. unsigned 금지 → signed upload만 |
| 0.3 | Nebius Token Factory | 슬기 | API key, `GET /v1/models`로 비전 모델(`nano-omni` 등) 존재 여부 확인. Super/Ultra/Nano 텍스트 ID 확정 |
| 0.4 | Tavily | 슬기 | Builders Program 또는 tavily.com — P1 보너스상 대비, Phase 08 확장 시 사용 |
| 0.5 | `.env` | 민식 | `backend/.env.example`, `frontend/.env.example` 키 이름과 1:1 매칭 |

### Nebius 크레딧 (권장)

1. Devpost 폼 + 코드 `NEBIUS-DEVPOST-GLOBAL26` ($25)
2. Nebius Builders Program 가입 (추가 크레딧 + Tavily)

---

## Definition of Done (DoD)

1. 팀원(슬기)이 Nebius key로 로컬에서 테스트 스크립트 1회 호출 가능 (Phase 07.1 전에도 `curl` 또는 playground OK)
2. 민식이 Supabase SQL Editor 접속 가능
3. `.env`가 `.gitignore`에 있고 커밋되지 않음

---

## 산출물

- 로컬 `.env` (비공개)
- (선택) `docs/plan/phases/notes/model-ids.md` — 슬기가 확인한 model ID 스냅샷

---

## 리스크 & 대응

| 리스크 | 대응 |
| :--- | :--- |
| Nano Omni 카탈로그 미노출 | `VISION_MODEL_ID` env로 fallback VL + Nemotron은 텍스트 추론에 집중 |
| Supabase 리전 지연 | 프론트와 같은 대륙 리전 선택 |

---

## 다음 Phase

→ [Phase 01 — 모노레포 틀](phase-01.md)
