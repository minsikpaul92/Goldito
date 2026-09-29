# Phase 01 — 모노레포 틀 (Scaffold)

## Goal

**frontend(Expo Web) + backend(FastAPI) + supabase/migrations** 디렉터리를 만들고, 양쪽이 독립적으로 실행되며 **health check로 서로 연결**되는 최소 개발 환경을 확보한다.

### Goal 달성 기준

- [ ] `backend/`에서 uvicorn 기동 → `GET /health` → `{"status":"ok"}`
- [ ] `frontend/`에서 Expo Web 기동 → 버튼으로 backend health 성공 표시
- [ ] `.env.example`만 커밋, 실제 secret 없음

---

## 선행 조건

- [Phase 00](phase-00.md) 0.5 (env 키 이름 합의; 값은 health에는 불필요)

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| 디렉터리 구조, 패키지 매니저 설정 | DB, Auth, 비즈니스 API |
| CORS (Expo web dev origin) | Cloudinary, AI |
| 루트 README Getting Started 링크 | UI 디자인 폴리싱 |

---

## 작업 상세

| ID | 작업 | DoD |
| :--- | :--- | :--- |
| 1.1 | Monorepo layout | `frontend/`, `backend/`, `supabase/migrations/` 존재, 각 README 1페이지 |
| 1.2 | FastAPI skeleton | `app/main.py`, `app/config.py` (pydantic-settings), `/health` |
| 1.3 | Expo TypeScript skeleton | 단일 Home + `EXPO_PUBLIC_API_URL` health fetch |
| 1.4 | `.gitignore` | `.env`, `data/raw/`, `__pycache__`, `node_modules` |

### 기술 선택 (고정 권장)

- Frontend: **Expo + expo-router** 또는 React Navigation — 하나 선택 후 README에 명시
- Backend: **requirements.txt** 또는 uv — 해커톤 속도는 requirements.txt

---

## Definition of Done (DoD)

1. 새 클론 후 README 순서대로 install → backend + frontend 동시 실행 가능
2. 프론트 health 실패 시 네트워크/CORS 에러가 아닌 명확한 메시지 (URL misconfig)

---

## 산출물

```
PawNote/
  frontend/
  backend/
  supabase/migrations/   (empty or .gitkeep)
  backend/.env.example
  frontend/.env.example
```

---

## AI 프롬프트

[P0-ai-prompt-playbook](../P0-ai-prompt-playbook.ko.md) §3 Phase 1 — **1.1 → 1.2 → 1.3 순**, 한 채팅에 1.1만 권장

---

## 다음 Phase

→ [Phase 02 — DB + RLS](phase-02.md) (Supabase 0.1 완료 후)
