# Phase 09 — 피드 AI 캡션 (Caption)

## Goal

펫시터가 **사진만 업로드**하면 Nemotron **Vision**이 **1–2문장 따뜻한 캡션**을 생성해 `feed_post.caption`에 넣어, **타이핑 없는 피드**를 완성한다.

### Goal 달성 기준

- [ ] `POST /api/ai/caption` { dog_id, image_url } → { caption }
- [ ] 업로드 플로우: complete media → caption API → feed_post insert
- [ ] AI 실패 시 fallback 캡션 (고정 문구)으로 피드는 항상 생성

---

## 선행 조건

- [Phase 05](phase-05.md) feed insert flow
- [Phase 07.1](phase-07.md) Nebius + vision model
- Cloudinary **secure_url** 또는 signed delivery URL

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| Vision prompt: dog name + activity tone | Video caption (stretch: same endpoint) |
| Backend-only API key | Client-side OpenAI |

---

## 작업 상세

| ID | 작업 | 상세 |
| :--- | :--- | :--- |
| 9.1 | caption endpoint | max tokens 짧게, 한국어 default |
| 9.2 | Integrate upload | Phase 5 flow 수정 — placeholder 제거 |
| 9.3 | Loading UX | "캡션 만드는 중…" sitter side |

### 프롬프트 Goal

- 의학적 진단 금지
- 표정·활동 묘사
- 견주가 읽었을 때 안심되는 톤

---

## Definition of Done (DoD)

1. Phase 05 DoD 재테스트 — caption이 사람이 쓴 것처럼 보임 (主관 OK)
2. sitter UI에 **caption 입력 필드 없음** 유지

---

## 산출물

- `backend/app/routers/ai_caption.py`
- Updated `cloudinaryUpload` or feed service

---

## AI 프롬프트

Playbook §11

---

## 다음 Phase

→ [Phase 10 — 데모·배포](phase-10.md)
