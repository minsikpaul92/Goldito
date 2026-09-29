# Phase 03 — 인증 & 역할 (Auth)

## Goal

**이메일/비밀번호 Supabase Auth**로 가입·로그인하고, `profiles.role`에 따라 **Owner 홈 / Sitter 홈**으로 분기하며, FastAPI는 **Bearer JWT**로 `/api/me`를 보호할 수 있게 한다.

### Goal 달성 기준

- [ ] owner 계정 1개, sitter 계정 1개 생성·로그인 성공
- [ ] 역할별 다른 홈 화면 (스텁 OK)
- [ ] `curl -H "Authorization: Bearer <access_token>" /api/me` → 200 + role

---

## 선행 조건

- [Phase 02](phase-02.md) profiles + RLS

---

## 아키텍처 결정 (Goal의 일부)

**A안 (권장):** 프론트 → Supabase JS (RLS)로 피드·일정·알림 CRUD  
**FastAPI:** Cloudinary sign, `/api/ai/*`, JWT 검증

이 Phase Goal은 **A안 기준**으로 작성됨.

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| Login, SignUp, role 선택, session persist (web) | 소셜 로그인, MFA |
| OwnerHome / SitterHome 스텁 | dog CRUD UI (Phase 05~6) |
| FastAPI `get_current_user` dependency | 전체 API 프록시 (B안) |

---

## 작업 상세

| ID | 작업 | DoD |
| :--- | :--- | :--- |
| 3.1 | Auth screens | email/password, 에러 메시지 |
| 3.2 | Signup → profiles insert + role | DB에 role 저장 |
| 3.3 | Navigation guard | 미로그인 → Login |
| 3.4 | FastAPI JWT | `/api/me` id, role, email(optional) |

### Signup UX

- 가입 시 **한 번만** role 선택 (owner / sitter)
- 해커톤 데모: 같은 이메일 도메인 제한 없음

---

## Definition of Done (DoD)

1. 로그아웃 후 재로그인 시 role 유지
2. JWT 만료/잘못된 토큰 → 401
3. `backend/README.md`에 "프론트는 anon key + RLS" 한 줄 명시

---

## 산출물

- `frontend/app/(auth)/login`, signup 등
- `frontend/lib/supabase.ts`
- `backend/app/deps/auth.py`

---

## AI 프롬프트

Playbook §5 — 3.1–3.2 한 번, 3.3 별도

---

## 다음 Phase

→ [Phase 04 — Cloudinary](phase-04.md)
