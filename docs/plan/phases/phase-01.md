# Phase 01 — 모노레포 틀 (Scaffold)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — 리포 구조 §2, env §4, API 규약 §5

## Goal

**frontend(Expo Web, expo-router) + backend(FastAPI) + supabase/migrations** 디렉터리를 [architecture §2](architecture.ko.md#2-리포-구조-최종-형태) 구조로 만들고, 양쪽이 독립적으로 실행되며 **health check로 서로 연결**되는 최소 개발 환경을 확보한다.

### Goal 달성 기준

- [ ] `backend/`에서 uvicorn 기동 → `GET /health` → `{"status":"ok"}`
- [ ] `frontend/`에서 Expo Web 기동 → 버튼으로 backend health 성공 표시
- [ ] `.env.example`만 커밋, 실제 secret 없음

---

## 선행 조건

- 없음 (Phase 00 키 값은 health에 불필요 — 0.1–0.3은 병행)

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| 디렉터리 구조, 패키지 설정, `.env.example` (architecture §4 **전체 변수**) | DB, Auth, 비즈니스 API |
| CORS (`CORS_ORIGINS` env) | Cloudinary, AI |
| `theme/tokens.ts` 초안 + `components/ui/` 최소 3종(Button, Card, Screen) | 디자인 폴리싱 (묵 Figma 이후) |
| 루트 README Getting Started 링크 | Dockerfile (Phase 10) |

---

## 작업 상세

| ID | 작업 | 상세 | DoD |
| :--- | :--- | :--- | :--- |
| 1.1 | Monorepo layout | `frontend/`, `backend/`, `supabase/migrations/.gitkeep`, `supabase/README.md`, 각 README 1페이지, `backend/.env.example`·`frontend/.env.example` (architecture §4 변수 **전부**, 값은 placeholder) | 폴더·파일 존재 |
| 1.2 | FastAPI skeleton | `app/main.py` (FastAPI, CORSMiddleware ← `settings.cors_origins`), `app/config.py` (pydantic-settings, 모든 env 선언 — AI/Cloudinary 키는 Optional), `app/routers/health.py`. 공통 에러 핸들러 `{detail, code}` (architecture §5). `requirements.txt`: fastapi, uvicorn[standard], pydantic-settings, httpx, pytest | `uvicorn app.main:app --reload` → `/health` 200 |
| 1.3 | Expo skeleton | `npx create-expo-app@latest frontend --template tabs` 후 불필요 탭 제거 또는 blank + expo-router 설치. TypeScript. `app/index.tsx` = "PawNote" + **Check API** 버튼 → `lib/api.ts`의 `getHealth()` | web에서 `ok` 표시 |
| 1.4 | `.gitignore` | `.env`, `.env.*` (단 `!.env.example`), `data/raw/`, `__pycache__/`, `.venv/`, `node_modules/`, `dist/`, `.expo/`, `web-build/` | `git status` 깨끗 |

### 기술 선택 (확정 — D2~D4)

- Frontend: **Expo SDK 최신 + expo-router + TypeScript + npm**
- Backend: **Python 3.12 venv + requirements.txt**
  ```bash
  py -3.12 -m venv .venv   # Windows (mac/linux: python3.12 -m venv .venv)
  ```
- 포트: backend `8000`, Expo web `8081` (기본값) → `CORS_ORIGINS=http://localhost:8081`

### 1.3 health 에러 메시지 규칙 (DoD 2)

| 상황 | 화면 문구 |
| :--- | :--- |
| `EXPO_PUBLIC_API_URL` 미설정 | "API URL is not set. Add EXPO_PUBLIC_API_URL to frontend/.env and restart Expo." |
| fetch 네트워크 실패 (서버 다운/URL 오타/CORS) | "Cannot reach API at {url}. Is the backend running? Check the URL and CORS_ORIGINS." |
| 200 아닌 응답 | "API responded {status}: {detail}" |
| 성공 | "API OK ✅" |

---

## Definition of Done (DoD)

1. 새 클론 후 README 순서대로 install → backend + frontend 동시 실행 가능
2. 프론트 health 실패 시 위 표의 **구체적 메시지** 표시 (backend 끄고 확인)
3. `npx tsc --noEmit` 통과, `pytest -q` 통과 (health 테스트 1개: `TestClient`)

### 검증

```bash
cd backend && .venv/Scripts/activate && pip install -r requirements.txt && uvicorn app.main:app --reload
curl -s localhost:8000/health
cd frontend && npm install && npx expo start --web
```

---

## 산출물

```
frontend/ (app/_layout.tsx, app/index.tsx, lib/api.ts, theme/tokens.ts, components/ui/*)
backend/  (app/main.py, app/config.py, app/routers/health.py, tests/test_health.py, requirements.txt)
supabase/migrations/.gitkeep, supabase/README.md
backend/.env.example, frontend/.env.example, .gitignore
```

---

## AI 프롬프트

[P0-ai-prompt-playbook](../P0-ai-prompt-playbook.ko.md) §3 — **1.1 → 1.2 → 1.3 순**, 한 번에 하나

---

## 다음 Phase

→ [Phase 02 — DB + RLS](phase-02.md) (Supabase 0.1 완료 후)
