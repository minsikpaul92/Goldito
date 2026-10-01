# Phase 04 — Cloudinary 미디어 파이프

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D12–D13, API 계약 §5

## Goal

펫시터 앱에서 **API secret을 노출하지 않고** 사진·영상을 Cloudinary에 업로드하고, **`media` 테이블에 public_id를 저장**해 이후 피드(05)·인증 사진(06)·성분표(08)·AI vision(09)에서 **같은 헬퍼 하나**로 재사용한다.

### Goal 달성 기준

- [ ] Sitter JWT로 `POST /api/media/sign` → signature 받기 (담당 아닌 pet → 403)
- [ ] 브라우저에서 파일 선택 → Cloudinary 업로드 성공 (image + video 각 1건)
- [ ] `POST /api/media/complete` → `media` row 생성 + `secure_url`, `thumb_url` 반환
- [ ] 데스크톱 프레임(카메라 없음)에서 **샘플 사진 트레이**로 고른 사진이 같은 업로드 파이프로 올라감 (4.7, D25)

---

## 선행 조건

- [Phase 00](phase-00.md) 0.2 Cloudinary
- [Phase 03](phase-03.md) JWT + sitter role · [Phase 03B](phase-03b.md) 확정 예약 (서명 권한 = `is_on_duty_for`)

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| signed upload (image, video), purpose별 폴더 | Cloudinary AI 태깅, unsigned preset |
| `lib/cloudinary.ts`: `uploadMedia()`, `thumbUrl()`, `videoPosterUrl()` | 피드 화면 (Phase 05) |
| 개발용 업로드 테스트 화면 `/(sitter)/dev-upload` (Phase 05에서 삭제) | 업로드 진행률 % (선택) |
| `lib/media.ts` `pickMedia()` + `MediaPicker` 샘플 트레이 (4.7) | 샘플 영상 (11.9에서), 웹캠 촬영 |

---

## 작업 상세

| ID | 작업 | 상세 |
| :--- | :--- | :--- |
| 4.1 | Sign endpoint | `routers/media.py`. `require_role("sitter")` + `assert_on_duty_for(pet_id)` (확정 예약 기간 밖이면 403). `folder = f"pawnote/{pet_id}/{purpose}"`, `timestamp = now`. **서명 대상 파라미터 = `folder`, `timestamp`** (클라이언트가 동일 값만 보내야 서명 일치). `cloudinary.utils.api_sign_request` 사용. 응답에 `upload_url = https://api.cloudinary.com/v1_1/{cloud}/{resource_type}/upload` |
| 4.2 | Complete endpoint | 검증: ① `public_id.startswith(f"pawnote/{pet_id}/{purpose}/")` (traversal 방지) ② `cloudinary.api.resource(public_id, resource_type=…)`로 **실존 확인** + width/height/duration 서버에서 취득 ③ service role로 `media` insert ④ `secure_url`, `thumb_url` 반환 |
| 4.3 | Frontend helper | `uploadMedia({petId, purpose, file}) → {mediaId, secureUrl, thumbUrl}`: `pickMedia()`(4.7)가 준 file → `api.post('/api/media/sign')` → `FormData(file, api_key, timestamp, signature, folder)` → fetch upload_url → `api.post('/api/media/complete')`. 실패 시 `UploadError(step)` throw → 호출 화면이 Toast + **Retry** |
| 4.4 | URL helper | `thumbUrl(publicId, w=400)` → `https://res.cloudinary.com/{cloud}/image/upload/f_auto,q_auto,c_fill,w_400,h_400/{publicId}`, `videoPosterUrl(publicId)` → `…/video/upload/so_0,f_jpg,w_400/{publicId}.jpg`, `videoUrl(publicId)` → `…/video/upload/q_auto/{publicId}` |
| 4.5 | 제한 | 클라이언트 사전 체크: image ≤ 10MB, video ≤ 50MB & ≤ 30초 (초과 시 alert "Please pick a shorter clip (max 30s).") |
| 4.6 | Backend service | `services/cloudinary.py`: `sign()`, `delivery_url()`, `fetch_as_data_url(public_id, resource_type)` (D12 — Phase 08/09용, `w_1024,f_jpg` 변환본 다운로드 → base64) |
| 4.7 | `pickMedia()` + 샘플 사진 트레이 (D25) | `lib/media.ts` `pickMedia({purpose, mediaTypes}) → File \| null` — **모든 화면의 사진 선택은 이 함수만**. 네이티브: `expo-image-picker` 카메라/앨범. 모바일 웹: `capture` 입력. **데스크톱 프레임(`useShell().embedded`) 또는 데모 계정:** `components/MediaPicker.tsx` 시트 — purpose별 샘플(`feed`·`task_proof`: 강아지·고양이 일상 / `safety_label`: Phase 08 픽스처와 같은 라벨 — `chicken_jerky`(DANGER), `animal_fat_biscuit`(WARNING), `sweet_potato_chew`(SAFE), `lily_scented_cat_treat`(DANGER, Mochi)) + **Upload from computer** (+ 폰이면 **Take photo**). 샘플은 `frontend/assets/demo/`의 정적 이미지를 Blob으로 읽어 **`uploadMedia()`를 그대로** 탐 → AI가 실제로 분석 (가짜 결과 없음). 샘플은 직접 촬영·생성 또는 CC0, 가상 브랜드(상표 가림), 사람·주소 없음. 시트는 Close 버튼 + 클릭만으로 선택 |

---

## Definition of Done (DoD)

1. `backend/README.md`에 수동 테스트 5단계 (token 얻기 → sign curl → Cloudinary curl 업로드 → complete curl → DB 확인)
2. 업로드 실패 시(네트워크 끊기) Retry 버튼으로 재시도 가능
3. video 1건 성공 + `videoPosterUrl`이 이미지로 열림
4. `pytest`: 폴더 prefix 불일치 public_id → 422, 비담당 sitter → 403
5. 데스크톱 프레임에서 마우스만으로: 샘플 사진 선택 → 업로드 → `media` row 생성 · **Upload from computer**도 동작 (4.7)

---

## 산출물

- `backend/app/routers/media.py`, `backend/app/services/cloudinary.py`, `backend/app/services/authz.py`
- `frontend/lib/cloudinary.ts`, `frontend/lib/api.ts` (Bearer 자동 첨부로 확장)
- `frontend/lib/media.ts`, `frontend/components/MediaPicker.tsx`, `frontend/assets/demo/*` (4.7)

---

## AI 프롬프트

Playbook §6 — (4.1–4.2, 4.6) 후 (4.3–4.5)

---

## 다음 Phase

→ [Phase 05 — 케어 피드](phase-05.md)
