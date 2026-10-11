# Phase 05 — 피드 앨범 · Diary Live · 알림 센터 (AI 없음)

> **상태 (2026-10-10):** 완료 (2026-10-04, PR #47). DoD 손 확인과 시나리오 상태의 정본은 [test-guide](../test-guide.ko.md) 현황표 · [TODO](../TODO.md) Phase status이고, 이 문서의 체크박스는 더 이상 갱신하지 않는다.

> 공통 전제: [architecture.ko.md](architecture.ko.md) — 알림 매트릭스 §7, UX 규칙 §8, **D47 · D47b** 탭 IA  
> 제품 흐름: [full-process.ko.md](../full-process.ko.md) Stage 4 — 견주 Push + **Feed 앨범** + **Diary** Live 스트림 (분류는 [09](phase-09.md))

## Goal

**Feed** = 영구 펫 앨범(인스타형 그리드; 오너·시터 게시; 펫 멀티토글). **Diary** = 맡긴 동안 Live/On air 스트림 + 히스토리(사진 있으면 Feed에도 미러, D47). 시터가 사진을 올리면 견주 Feed·알림이 즉시 생기고, 이 Phase의 **알림 인프라**를 06–08이 재사용한다. 캡션은 fallback — AI는 Phase 09.

### Goal 달성 기준

- [ ] Sitter: Home(케어 중) 또는 Feed → pet → **+ Photo** → `uploadMedia` → `createFeedPost` (텍스트 입력 없음)
- [ ] Owner: Feed 탭 — 펫 칩 멀티토글 · 그리드/타임라인 + Cloudinary 썸네일 (image/video)
- [ ] 새 게시 → `notifications` → Owner 토스트 + 벨 unread +1 + Feed 갱신 (Diary Live도 같은 이벤트 구독 가능)
- [ ] 알림 센터: 목록, 탭 시 읽음 + 이동, "Mark all as read"

---

## 선행 조건

- [Phase 04](phase-04.md) `uploadMedia()`
- [Phase 03](phase-03.md) pet 프로필 · [Phase 03B](phase-03b.md) 확정 예약 (게시 권한 = `is_on_duty_for`)

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| Sitter pet 피드 + 업로드 FAB (`/sitter/feed` · `/sitter/feed/[petId]`) | 앨범 날짜 필터·풀 그리드 폴리시 (P1) |
| Owner Feed (쿼리·카드·멀티토글·상세) | AI caption·분류 + 날짜별 앨범 묶기 (09) |
| Diary 탭 stub + Live는 5.4 알림과 연동 가능 (풀 Diary UI는 06–07) | Diary 작성 풀 UX (오너 글쓰기 — follow-up) |
| 트리거 `notify_feed_post` (`007`) + `feed_posts.category` null | Push (Expo) — 웹 토스트만 |
| `NotificationsProvider`, 벨 badge, 알림 센터 | 사진 요청 (P1, Phase 11) |

---

## 화면

| 화면 | Route | 역할 | 핵심 액션 | 상태 문구 |
| :--- | :--- | :--- | :--- | :--- |
| Sitter Pet 피드 | `/sitter/feed/[petId]` | sitter | **+ Photo** FAB → 업로드 중 카드 skeleton → 성공 토스트 "Shared with {owner} 🐾" | empty: "No posts yet — tap + to share Max's day." |
| Owner Feed | `/owner/feed` | owner | 그리드 · 펫 멀티토글 · 탭 → 상세 | empty: "No posts yet — your sitter will share photos here." |
| Owner Diary | `/owner/diary` | owner | Live / 히스토리 (펫·시터·날짜); 사진 → Feed 미러 (D47) | empty: "When a stay is on, updates show up here live." |
| 알림 센터 | `/owner/notifications`, `/sitter/notifications` | 둘 다 | 탭 → 이동 | empty: "You're all caught up." |

FeedCard / Diary rows: 썸네일(4:3, 영상은 poster + ▶), 캡션, 상대 시간("2h ago"), 작성자(sitter/owner), (06 이후) task 뱃지.

---

## 작업 상세

| ID | 작업 | 상세 |
| :--- | :--- | :--- |
| 5.1 | `lib/feed.ts` `createFeedPost({petId, mediaId, caption, captionSource})` | Supabase insert `feed_posts` (sitter RLS). Phase 05 caption = `"A moment from today's care 🐾"`, `caption_source='fallback'`. **Phase 09가 이 함수 앞단에 AI 캡션만 끼워 넣음** |
| 5.2 | Owner Feed query + UI | `listFeedPosts` + FeedCard + `/owner/feed` (페이지 20, Load more). **Follow-up:** 펫 칩 **멀티토글**(선택/해제) · 3열 그리드 (D47) — 5.2는 타임라인으로 착수됨 |
| 5.3 | Notification trigger | `007_feed_notifications.sql` (+ `feed_posts.category text null check in ('meal','walk','nap','play','other')`): `after insert on feed_posts for each row when (new.task_log_id is null)` → owner에게 `type='feed_post'`, `ref_id=new.id`, title `"New photo of {pet.name} 📸"`. security definer |
| 5.4 | Realtime subscribe | `NotificationsProvider` … `feed_post`면 Feed(+ Diary Live) 리페치. 로그인 시 unread count |
| 5.5 | 알림 센터 | 최근 50개 … architecture §7 "탭 시 이동" (`feed_post` → `/owner/feed`, 이후 Diary 항목도 `/owner/diary`) |
| 5.6 | Dev 화면 정리 | Phase 04 `dev-upload` 제거 — 실업로드는 Sitter Feed / pet FAB |
| 5.x follow-up | Sitter upload path | `/sitter/feed/[petId]` + Photo → `uploadMedia` → `createFeedPost` (Goal 1). Diary Live 목록 UI는 06–07 |

---

## Follow-up (post-05, not started) — Feed delete · visibility · viewer open bug

> Documented 2026-10-04 after Phase 05 manual test. **Do not implement until Current focus allows** (after 06 or as a small `feat/feed-album-polish` chunk). Spec wins over ad-hoc UI.

### Product rules

1. **Delete = author only.** The person who posted can remove the post; the other role cannot.
2. **Today (schema):** `feed_posts.sitter_id` is the only author. RLS already has `feed_posts_delete` (`sitter_id = auth.uid()`) — **UI is missing**.
3. **Later (when owners post):** introduce a real author (`posted_by` / keep role column) and delete policy = `posted_by = auth.uid()`. Cascade: deleting a post should not leave orphan care-critical media if still referenced elsewhere; prefer delete `feed_posts` row + Cloudinary cleanup only when `media` is unused.
4. **Visibility (related, same epic):** stay-default is a **shared album**. Options to add with schema:
   - Sitter upload: **Share with owner** (default on) → if off, post is sitter-only (no owner notify / not in owner Feed).
   - Owner upload: **owner-only** by default; optional **Visible to sitter** while on duty (Kidsnote-style family album vs private scrapbook).
5. **UX:** Full-screen viewer → **Delete** (danger text button) → confirm sheet ("Delete this photo?") → toast → close viewer + grid refresh. Optional later: long-press on grid cell. No delete on the sample tray.

### Tasks (proposed IDs)

| ID | Work |
| :--- | :--- |
| **5.7** | Sitter delete UI on own posts (viewer + confirm); wire existing RLS; hide Delete for non-authors — **done** (`deleteFeedPost`, FeedViewer Delete, confirm Sheet on sitter pet feed) |
| **5.8** | **done** — `007c_feed_visibility.sql`: `posted_by` + `visibility` (`shared` / `private`), owner posts (`sitter_id` null), author-only delete, private media row hidden from the other party, private posts never notify. Sitter chip **Share with {owner}** (default on); owner **+ Photo** with **Visible to sitter** (default off). |
| **5.9** | **done** — owner's shared post → `feed_post` notice to the on-duty sitter(s) (tap → `/sitter/feed/[petId]`); sitter's shared post → owner; private → nobody. In `007c`. |
| **5.10** | **done** — `FeedViewer` renders only the active post (swipe, ‹ › buttons, ←/→ keys); tracked by post id, so Load more never moves it; a tapped photo opens that photo, a tapped video plays that video. Playwright `feed.spec.ts`. |

---

## Definition of Done (DoD)

1. **두 브라우저 시나리오**(일반 창 owner / 시크릿 창 sitter): sitter 업로드 → **새로고침 없이** owner 토스트 + 피드에 새 카드 (≤ 3초)
2. 제품 원칙: sitter 입력 = **사진 선택 + 탭만** (캡션 입력 필드 없음)
3. 영상 게시물이 owner 상세에서 재생됨
4. 다른 owner 계정에는 알림·피드가 보이지 않음

---

## 산출물

- `frontend/app/sitter/(tabs)/feed/[petId].tsx`, `frontend/app/owner/feed.tsx`, `frontend/app/owner/(tabs)/diary.tsx`, `frontend/app/(*)/notifications.tsx`
- `frontend/components/FeedCard.tsx`, `NotificationBell.tsx`, `frontend/providers/NotificationsProvider.tsx`, `frontend/lib/feed.ts`
- `supabase/migrations/007_feed_notifications.sql`
- Owner tabs D47: Feed = album; stay Live stream lives under **Diary** (not a separate Care Live tab)

---

## AI 프롬프트

Playbook §7 — "without AI captions first"; (5.1–5.2) / (5.3–5.5) 두 번

---

## 다음 Phase

→ [Phase 06 — 투약·산책](phase-06.md)
