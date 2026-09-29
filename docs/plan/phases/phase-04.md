# Phase 04 — Cloudinary 미디어 파이프

## Goal

펫시터 앱에서 **API secret을 노출하지 않고** 사진·영상을 Cloudinary에 업로드하고, **`media` 테이블에 public_id를 저장**해 이후 피드·인증 사진·AI vision URL로 재사용한다.

### Goal 달성 기준

- [ ] Sitter JWT로 `POST /api/media/sign` → signature 받기
- [ ] 브라우저에서 파일 선택 → Cloudinary 업로드 성공
- [ ] `POST /api/media/complete` → Supabase `media` row 생성 + delivery URL 반환

---

## 선행 조건

- [Phase 00](phase-00.md) Cloudinary
- [Phase 03](phase-03.md) JWT + sitter role
- DB에 dog + sitter 할당 (수동 SQL 또는 Phase 10 seed 미리 일부)

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| signed upload (image, video) | Cloudinary AI 태깅 |
| folder `pawnote/{dog_id}/` | 영상 길이 제한 UI (간단 alert만) |
| transform URL 헬퍼 (썸네일) | Phase 09 caption |

---

## 작업 상세

| ID | 작업 | 상세 |
| :--- | :--- | :--- |
| 4.1 | Sign endpoint | dog_id, resource_type; sitter가 해당 dog의 sitter_id인지 검증 |
| 4.2 | Complete endpoint | public_id, width/height optional, insert media |
| 4.3 | Frontend upload helper | sign → FormData upload → complete |
| 4.4 | URL helper | `getThumbnailUrl(public_id)` → `f_auto,q_auto,w_400` |

### 보안

- Complete 시 **public_id가 해당 folder prefix**인지 검증 (folder traversal 방지)

---

## Definition of Done (DoD)

1. `backend/README.md`에 수동 테스트 5단계
2. 업로드 실패 시 사용자에게 retry 가능
3. video resource_type 1건 성공 (데모 짧은 clip)

---

## 산출물

- `backend/app/routers/media.py`
- `frontend/lib/cloudinaryUpload.ts`

---

## AI 프롬프트

Playbook §6 — 4.1–4.2, then 4.3

---

## 다음 Phase

→ [Phase 05 — 케어 피드](phase-05.md)
