# Phase 01 — 모노레포 틀 (Scaffold)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — 리포 구조 §2, env §4, API 규약 §5

## Goal

**frontend(Expo Web, expo-router) + backend(FastAPI) + supabase/migrations** 디렉터리를 [architecture §2](architecture.ko.md#2-리포-구조-최종-형태) 구조로 만들고, 양쪽이 독립적으로 실행되며 **health check로 서로 연결**되는 최소 개발 환경을 확보한다.

### Goal 달성 기준

- [ ] `backend/`에서 uvicorn 기동 → `GET /health` → `{"status":"ok"}`
- [ ] `frontend/`에서 Expo Web 기동 → 버튼으로 backend health 성공 표시
- [ ] `.env.example`만 커밋, 실제 secret 없음
- [ ] (1.6–1.7, D25 — 2026-10-01 추가) 데스크톱 브라우저에서 앱이 **402 × 874 폰 프레임** 안에 뜨고, 마우스로 클릭 = 탭 · 휠/드래그 = 스크롤이 동작 (폰 브라우저는 프레임 없이 전체 화면)

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
| 루트 README Getting Started 링크 | Dockerfile, CD 워크플로 (Phase 10) |
| CI `ci.yml` (1.5) | 브랜치 보호 설정 (민식이 GitHub에서 직접) |
| 웹 셸: 데스크톱 폰 프레임 + 마우스 = 손가락 + Playwright 마우스 테스트 (1.6–1.7, D25) | 옆 안내 패널·Split view (Phase 10.9–10.10), 시터 데스크톱 레이아웃 (해커톤 후) |

---

## 작업 상세

| ID | 작업 | 상세 | DoD |
| :--- | :--- | :--- | :--- |
| 1.1 | Monorepo layout | `frontend/`, `backend/`, `supabase/migrations/.gitkeep`, `supabase/README.md`, 각 README 1페이지, `backend/.env.example`·`frontend/.env.example` (architecture §4 변수 **전부**, 값은 placeholder) | 폴더·파일 존재 |
| 1.2 | FastAPI skeleton | `app/main.py` (FastAPI, CORSMiddleware ← `settings.cors_origins`), `app/config.py` (pydantic-settings, 모든 env 선언 — AI/Cloudinary 키는 Optional), `app/routers/health.py`. 공통 에러 핸들러 `{detail, code}` (architecture §5). `requirements.txt`: fastapi, uvicorn[standard], pydantic-settings, httpx, pytest | `uvicorn app.main:app --reload` → `/health` 200 |
| 1.3 | Expo skeleton | `npx create-expo-app@latest frontend --template tabs` 후 불필요 탭 제거 또는 blank + expo-router 설치. TypeScript. `app/index.tsx` = "PawNote" + **Check API** 버튼 → `lib/api.ts`의 `getHealth()` | web에서 `ok` 표시 |
| 1.4 | `.gitignore` | `.env`, `.env.*` (단 `!.env.example`), `data/raw/`, `__pycache__/`, `.venv/`, `node_modules/`, `dist/`, `.expo/`, `web-build/` | `git status` 깨끗 |
| 1.5 | CI (GitHub Actions) | `.github/workflows/ci.yml` — [architecture §11](architecture.ko.md#11-cicd-파이프라인-d20). job `backend`: setup-python 3.12 → `pip install -r requirements.txt ruff` → `ruff check .` → `pytest -q`. job `frontend`: setup-node 20 → `npm ci` → `npx tsc --noEmit` → `npx expo export -p web`. 경로 필터(`dorny/paths-filter`)로 변경된 쪽만 실행. `backend/pyproject.toml` 또는 `ruff.toml` 최소 설정 | PR에 초록 체크 2개, 일부러 타입 에러 넣으면 빨간 체크 |
| 1.6 | Web shell — 데스크톱 폰 프레임 (D25) | `components/shell/`: `AppShell.tsx`(네이티브: children 그대로) / `AppShell.web.tsx`. `presentation.ts` `resolvePresentation()` — 모드 결정은 여기 한 곳: iframe 안(`window.self !== window.top`)·`?frame=0`·터치가 주 입력인 기기(`pointer: coarse` — 폰·태블릿) → `direct`(앱 그대로), `?frame=1`·마우스/트랙패드 컴퓨터(**창 폭 무관** — 창을 좁혀도 프레임 유지) → `framed`. **framed:** 바깥 페이지는 provider·route를 렌더하지 않고 배경 + `DeviceFrame.web.tsx` + `<iframe src={현재 path+search}>` (src는 첫 렌더 1회만, `allow="camera; microphone"`). `DeviceFrame`: 일반 CSS 폰(둥근 몸체, 시계 있는 상태바, 홈 인디케이터 — iframe 밖에 그림), 화면 **402 × 874**, 안쪽 앱은 항상 402px 폭으로 그림 — 창이 낮으면 높이만 `min(874, 창 높이 − 여백)` (최소 600, 더 낮으면 바깥 페이지 스크롤), 창이 폰보다 좁으면 폰 전체를 시각적으로 축소(iframe이라 클릭 좌표 안전), 실제 기기 이미지·상표 금지. **주소창 동기화:** iframe 안 앱이 경로가 바뀔 때 `window.parent.history.replaceState`로 바깥 URL 갱신 → 새로고침·링크 공유·브라우저 뒤로가기 동작. `useLayoutMode()` → `'compact'`(해커톤 동안 항상) / `'expanded'`(해커톤 후 시터 데스크톱 자리). `useShell()` → `{ embedded }` (4.7 샘플 트레이가 사용). `tokens.ts`에 `layout.frameWidth/frameHeight`, `breakpoint.expanded`, 프레임 색 토큰 추가. `app/_layout.tsx`에서 `AppShell`을 모든 provider보다 바깥에 | 1440×900 → 프레임 안에 앱 · 좁은 컴퓨터 창 → 프레임 유지 (폰보다 좁으면 축소, 클릭 정상) · 폰(터치) → 프레임 없이 전체 화면 · `?frame=0` 해제 · iframe 안에서 화면 이동 후 새로고침해도 같은 화면 · 1366×768에서 프레임 안 잘림 · 네이티브 번들에 프레임 코드 없음 |
| 1.7 | 마우스 = 손가락 (`TouchEmulation`) + 마우스 테스트 | `components/shell/TouchEmulation.web.ts` — **iframe 안 + `pointerType === 'mouse'`일 때만** 켬 (실제 폰·터치 노트북은 브라우저 기본 터치): ① 드래그 스크롤 — 6px 넘게 움직이면 축 고정 → 그 축으로 스크롤 가능한 가장 가까운 부모를 스크롤, 놓으면 관성 ② 드래그한 뒤의 `click` 1회를 window capture 단계에서 차단 (스크롤하다 카드 열림 방지 — RN Web `onPress`는 DOM `click`에서 실행) ③ 가로 전용 스크롤 줄 위의 세로 휠 → 가로 이동 (끝에 닿으면 통과) ④ `user-select: none` · 이미지 드래그 금지 (입력창 제외) ⑤ 반투명 원형 커서 (누르면 작아짐) ⑥ 스크롤바 숨김 + `overscroll-behavior: contain`. 입력창·`data-gesture-owner` 영역은 건드리지 않음. `app/dev/gestures.tsx` (`EXPO_PUBLIC_DEV_ROUTES=1`일 때만): 긴 세로 목록, 가로 칩 줄, 페이지 넘김 사진, 누를 수 있는 행, 오버레이 모달, 토스트, 입력창. **Playwright** (`frontend/e2e/`, `playwright.config.ts`): Chromium·WebKit·Firefox × 1366×768·1440×900·1920×1080, 마우스만 — 휠 스크롤, 드래그 스크롤, 드래그 후 클릭 안 됨, 클릭 = 탭, 가로 줄 드래그·휠, 모달이 프레임 안, 360·402·440 폭 레이아웃. CI frontend job에 추가 (`expo export` 결과를 정적 서버로, 백엔드 불필요). `.github/pull_request_template.md`에 [DESIGN.md §7.7](../../../DESIGN.md#77-works-with-a-mouse) 데스크톱 체크 | CI Playwright 통과 · Windows 마우스 + Mac 트랙패드 수동 확인 · 폰 브라우저 터치 스크롤 그대로 |

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
4. 1.5 PR에서 CI 2개 job이 GitHub에서 통과 → 민식이 `main` 브랜치 보호에 필수 체크로 등록
5. (1.6–1.7) 위 표 DoD 칸 전부 + Playwright 마우스 테스트가 CI frontend job에서 통과

### 검증

```bash
cd backend && .venv/Scripts/activate && pip install -r requirements.txt && uvicorn app.main:app --reload
curl -s localhost:8000/health
cd frontend && npm install && npx expo start --web
# 1.6–1.7: 데스크톱 창에서 http://localhost:8081 → 폰 프레임, ?frame=0 → 해제
EXPO_PUBLIC_DEV_ROUTES=1 npx expo export -p web && npx playwright test
```

---

## 산출물

```
frontend/ (app/_layout.tsx, app/index.tsx, lib/api.ts, theme/tokens.ts, components/ui/*)
backend/  (app/main.py, app/config.py, app/routers/health.py, tests/test_health.py, requirements.txt)
supabase/migrations/.gitkeep, supabase/README.md
backend/.env.example, frontend/.env.example, .gitignore
.github/workflows/ci.yml
# 1.6–1.7
frontend/components/shell/ (AppShell.tsx, AppShell.web.tsx, DeviceFrame.web.tsx, TouchEmulation.web.ts, presentation.ts, useLayoutMode.ts, useShell.ts)
frontend/app/dev/gestures.tsx, frontend/e2e/*, frontend/playwright.config.ts
.github/pull_request_template.md
```

---

## AI 프롬프트

[P0-ai-prompt-playbook](../P0-ai-prompt-playbook.ko.md) §3 — **1.1 → 1.2 → 1.3 순**, 한 번에 하나 · 1.6 → 1.7은 각각 별도 브랜치·PR

---

## 다음 Phase

→ [Phase 02 — DB + RLS](phase-02.md) (Supabase 0.1 완료 후)
