# Phase 04 — Cloudinary 미디어 파이프

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D12–D13, API 계약 §5

## Handoff (2026-10-04) — for the next agent session

| Item | Status |
| :--- | :--- |
| OB | [PR #43](https://github.com/minsikpaul92/PawNote/pull/43) **merged** to `main` |
| Docs queue | [PR #44](https://github.com/minsikpaul92/PawNote/pull/44) (`docs/phase-04-queue`) — merge first so TODO + this policy land on `main` |
| Branch | `feat/phase-04-media` — rebase onto latest `main`, then **draft** Phase 04 PR |
| **4.1–4.4** | On branch only (not main): `POST /api/media/sign` · `/complete` · `services/authz.py` · `services/cloudinary.sign` · FE `apiPost` + `uploadMedia()` + thumb/video URL helpers · `tests/test_media_sign.py` · README curl steps |
| **4.5** | **Current focus** — implement **Media normalize policy** below (old “reject if &gt;10 MB / &gt;30 s” is outdated) |
| Then | **4.6** `fetch_as_data_url` → **4.7** `pickMedia` + sample tray + **video trim ≤ 30 s** + `/sitter/dev-upload` |
| Env | `CLOUDINARY_*` in `backend/.env`; `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` in frontend |
| Skip | OB.4 `intro_seen` (deferred). Privacy/`/privacy` stash is separate (Google OAuth In production) |

## Media normalize policy (2026-10-04)

Hackathon Free Cloudinary: **25 credits/mo**, image upload max **10 MB**, video max **100 MB** (account MCP). Prefer smaller stored + delivered assets.

### Photos (all uploads)

1. **Client (always):** long-edge resize ~**2000 px** (JPEG/WebP quality ~0.8) so typical phone shots land well under 10 MB.
2. **If still ≥ 10 MB:** compress/resize further until **&lt; 10 MB** (Free hard limit — incoming cannot bypass this).
3. **Cloudinary incoming (on upload):** normalize stored original, e.g. `c_limit,w_2000` + `q_auto` (not `f_auto` on incoming).
4. **Delivery:** existing `f_auto,q_auto` (and thumbs) — what owners/sitters see.

Do **not** leave sub-10 MB originals uncompressed; light normalize everything for credit/storage headroom.

### Video

| Rule | Value |
| :--- | :--- |
| Max duration | **30 s** (care clip / report / feed — short Kidsnote-style beat) |
| Shorter OK | Yes — user may upload or trim to **any length ≤ 30 s** |
| Over 30 s | Do **not** hard-reject only: open a **trim UI** — drag start/end (or a 30 s window) so the exported clip is ≤ 30 s; default window = first 30 s |
| Client compress | Always: downscale (e.g. 720p long edge) + bitrate cap before upload; target well under Free **100 MB** (soft goal ≤ **50 MB**) |
| Incoming (optional) | Cap duration `so_0,du_30` / limit resolution if signed upload supports it; delivery `q_auto` |
| Sample tray (4.7) | Still photos for P0; sample **videos** stay Phase **11.9** unless a short demo clip is added later |

**Trim method (decided 2026-10-04): Cloudinary trims, not the browser.** The trim sheet only picks `trim_start` / `trim_duration` (≤ 30 s). `/api/media/sign` validates them (`start ≥ 0`, `0 < duration ≤ 30`) and signs `so_{start},du_{duration}` in the incoming transformation, so Cloudinary stores only the chosen part (verified live: `so_10,du_20` on a 35 s clip → 20 s starting at 10 s). The client cannot change the signed value. The full file is still uploaded, so the 100 MB cap applies to the original.

Trim + compress live in `pickMedia()` / `MediaPicker` (4.7). Mouse must work in the phone frame (DESIGN.md §7.7).

## Goal

펫시터 앱에서 **API secret을 노출하지 않고** 사진·영상을 Cloudinary에 업로드하고, **`media` 테이블에 public_id를 저장**해 이후 피드(05)·인증 사진(06)·인수인계 사진 체크(06B)·5초 체크 사진(07)·AI vision(09)·성분표(08)에서 **같은 헬퍼 하나**로 재사용한다.

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
| 개발용 업로드 테스트 화면 `/sitter/dev-upload` (Phase 05에서 삭제) | 업로드 진행률 % (선택) |
| `lib/media.ts` `pickMedia()` + `MediaPicker` 샘플 트레이 (4.7) | 샘플 영상 (11.9에서), 웹캠 촬영 |

---

## 작업 상세

| ID | 작업 | 상세 |
| :--- | :--- | :--- |
| 4.1 | Sign endpoint | `routers/media.py`. `require_role("sitter")` + `assert_on_duty_for(pet_id)` (확정 예약 기간 밖이면 403). 예외: `purpose='handoff'`는 `assert_booked_sitter(booking_id, from_hours_before=2)` — 맡기기 사진은 맡기 직전에 찍으므로 (06B). purpose = `feed` · `task_proof` · `report` · `handoff` · `safety_label` (`media.purpose` check에 `report`·`handoff` 추가는 03B의 `004_booking_options.sql`에 함께 — Phase 04는 migration 없음). `folder = f"pawnote/{pet_id}/{purpose}"`, `timestamp = now`. **서명 대상 파라미터 = `folder`, `timestamp`** (클라이언트가 동일 값만 보내야 서명 일치). `cloudinary.utils.api_sign_request` 사용. 응답에 `upload_url = https://api.cloudinary.com/v1_1/{cloud}/{resource_type}/upload` |
| 4.2 | Complete endpoint | 검증: ① `public_id.startswith(f"pawnote/{pet_id}/{purpose}/")` (traversal 방지) ② `cloudinary.api.resource(public_id, resource_type=…)`로 **실존 확인** + width/height/duration 서버에서 취득 ③ service role로 `media` insert ④ `secure_url`, `thumb_url` 반환 |
| 4.3 | Frontend helper | `uploadMedia({petId, purpose, file}) → {mediaId, secureUrl, thumbUrl}`: `pickMedia()`(4.7)가 준 file → `api.post('/api/media/sign')` → `FormData(file, api_key, timestamp, signature, folder)` → fetch upload_url → `api.post('/api/media/complete')`. 실패 시 `UploadError(step)` throw → 호출 화면이 Toast + **Retry** |
| 4.4 | URL helper | `thumbUrl(publicId, w=400)` → `https://res.cloudinary.com/{cloud}/image/upload/f_auto,q_auto,c_fill,w_400,h_400/{publicId}`, `videoPosterUrl(publicId)` → `…/video/upload/so_0,f_jpg,w_400/{publicId}.jpg`, `videoUrl(publicId)` → `…/video/upload/q_auto/{publicId}` |
| 4.5 | Normalize + limits | See **Media normalize policy** above. Photos: always client long-edge + &lt;10 MB; sign request may include incoming transform params (or upload preset). Video: always client compress; duration ≤ 30 s after trim. Soft alert only if compress still fails Free limits. |
| 4.6 | Backend service | `services/cloudinary.py`: `sign()`, `delivery_url()`, `fetch_as_data_url(public_id, resource_type)` (D12 — Phase 08/09용, `w_1024,f_jpg` 변환본 다운로드 → base64). Wire incoming transform defaults into `sign()` / upload params as needed. |
| 4.7 | `pickMedia()` + 샘플 사진 트레이 + **video trim** (D25) | `lib/media.ts` `pickMedia({purpose, mediaTypes}) → File \| null` — **모든 화면의 미디어 선택은 이 함수만**. 네이티브: `expo-image-picker` 카메라/앨범. 모바일 웹: `capture` 입력. **데스크톱 프레임(`useShell().embedded`) 또는 데모 계정:** `components/MediaPicker.tsx` 시트 — purpose별 샘플(`feed`·`task_proof`·`report`: 강아지·고양이 일상(밥·산책·낮잠 — 09 분류 데모, + `walk_squirrel` 공원에서 다람쥐를 보는 강아지 — 07 알림장 에피소드가 사진에서 나오게, D38) / `handoff`: Phase 06B 픽스처와 같은 사진 — `dog_at_door`, `car_crate_ok`, `car_no_crate`, `empty_room` / `safety_label`: Phase 08 픽스처와 같은 라벨 — `chicken_jerky`(DANGER), `animal_fat_biscuit`(WARNING), `sweet_potato_chew`(SAFE), `lily_scented_cat_treat`(DANGER, Mochi)) + **Choose from library** (+ 폰이면 **Take photo**). 샘플은 `frontend/assets/demo/`의 정적 이미지를 Blob으로 읽어 **`uploadMedia()`를 그대로** 탐 → AI가 실제로 분석 (가짜 결과 없음). 샘플은 직접 촬영·생성 또는 CC0, 가상 브랜드(상표 가림), 사람·주소 없음. 시트는 Close 버튼 + 클릭만으로 선택. **실제 폰(데모 계정 아님):** 샘플 없이 **Take photo**(카메라)와 **Choose from library** 두 버튼 시트. **`confirm: true`**(예: Done with photo): 고른/찍은 뒤 미리보기 → **Use … / Retake** 후에만 resolve (`MediaConfirm`). **Video:** if duration &gt; 30 s → trim sheet (drag window ≤ 30 s, shorter OK) → export → compress → `uploadMedia()`. |

---

## Definition of Done (DoD)

1. `backend/README.md`에 수동 테스트 5단계 (token 얻기 → sign curl → Cloudinary curl 업로드 → complete curl → DB 확인)
2. 업로드 실패 시(네트워크 끊기) Retry 버튼으로 재시도 가능
3. video 1건 성공 + `videoPosterUrl`이 이미지로 열림
4. `pytest`: 폴더 prefix 불일치 public_id → 422, 비담당 sitter → 403
5. 데스크톱 프레임에서 마우스만으로: 샘플 사진 선택 → 업로드 → `media` row 생성 · **Choose from library**도 동작 (4.7)

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
