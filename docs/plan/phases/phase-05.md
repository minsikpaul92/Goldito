# Phase 05 — 케어 피드 & 앨범 + 알림 센터 (AI 없음)

> 공통 전제: [architecture.ko.md](architecture.ko.md) — 알림 매트릭스 §7, UX 규칙 §8

## Goal

**키즈노트 앨범**의 핵심 UX: 펫시터가 사진을 올리면 **견주 피드에 즉시 보이고**, **알림(Realtime 토스트 + 알림 센터)**이 생긴다. 캡션은 고정 fallback 문구 — AI는 Phase 09. 이 Phase에서 만든 **알림 인프라(트리거 패턴 + NotificationsProvider + 알림 센터)**를 06–08이 재사용한다.

### Goal 달성 기준

- [ ] Sitter: Today에서 pet 카드 → Pet 피드 → **+ Photo** → 업로드 → `feed_posts` 생성 (텍스트 입력 없음)
- [ ] Owner: Feed 탭에서 최신순 게시물 + Cloudinary 썸네일 (image/video)
- [ ] 새 게시 → `notifications` row(트리거) → Owner 화면 토스트 + 벨 unread +1 + 피드 자동 갱신
- [ ] 알림 센터: 목록, 탭 시 읽음 처리 + 해당 화면 이동, "Mark all as read"

---

## 선행 조건

- [Phase 04](phase-04.md) `uploadMedia()`
- [Phase 03](phase-03.md) pet + sitter 배정

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| Sitter pet 피드 + 업로드 FAB | 앨범 날짜 필터·그리드 뷰 (P1) |
| Owner FeedTimeline (페이지네이션 20) + 상세 모달(원본 이미지/영상 재생) | AI caption (09) |
| 트리거 `notify_feed_post` (`004_feed_notifications.sql`) | Push (Expo) — 웹 토스트만 |
| `NotificationsProvider`, 벨 badge, 알림 센터 화면 | 사진 요청 (P1, Phase 11) |

---

## 화면

| 화면 | Route | 역할 | 핵심 액션 | 상태 문구 |
| :--- | :--- | :--- | :--- | :--- |
| Sitter Pet 피드 | `/(sitter)/pets/[petId]` | sitter | **+ Photo** FAB → 업로드 중 카드 skeleton → 성공 토스트 "Shared with {owner} 🐾" | empty: "No posts yet — tap + to share Bori's day." |
| Owner Feed | `/(owner)/feed` | owner | 스크롤 / 탭 → 상세 | empty: "No posts yet — your sitter will share photos here." |
| 알림 센터 | `/(owner)/notifications`, `/(sitter)/notifications` | 둘 다 | 탭 → 이동 | empty: "You're all caught up." |

FeedCard: 썸네일(4:3, 영상은 poster + ▶), 캡션, 상대 시간("2h ago"), sitter 이름, (06 이후) task 뱃지 "💊 Medication" / "🦮 Walk".

---

## 작업 상세

| ID | 작업 | 상세 |
| :--- | :--- | :--- |
| 5.1 | `lib/feed.ts` `createFeedPost({petId, mediaId, caption, captionSource})` | Supabase insert `feed_posts` (sitter RLS). Phase 05 caption = `"A moment from today's care 🐾"`, `caption_source='fallback'`. **Phase 09가 이 함수 앞단에 AI 캡션만 끼워 넣음** |
| 5.2 | Owner timeline query | `feed_posts` join `media` (`select *, media(*)`) where pet_id, order created_at desc, `range(0,19)` + "Load more" / onEndReached |
| 5.3 | Notification trigger | `004_feed_notifications.sql`: `after insert on feed_posts for each row when (new.task_log_id is null)` → owner에게 `type='feed_post'`, `ref_id=new.id`, title `"New photo of {pet.name} 📸"`. security definer |
| 5.4 | Realtime subscribe | `NotificationsProvider`: `supabase.channel('notif').on('postgres_changes', {event:'INSERT', schema:'public', table:'notifications', filter:`user_id=eq.${uid}`}, …)` → Toast + unread 증가 + `feed_post`면 피드 리페치 이벤트 발행. 로그인 시 초기 unread count 조회 |
| 5.5 | 알림 센터 | 최근 50개, unread 굵게. 탭 → `read_at=now()` + architecture §7 "탭 시 이동" |
| 5.6 | Dev 화면 정리 | Phase 04 `dev-upload` 제거 |

---

## Definition of Done (DoD)

1. **두 브라우저 시나리오**(일반 창 owner / 시크릿 창 sitter): sitter 업로드 → **새로고침 없이** owner 토스트 + 피드에 새 카드 (≤ 3초)
2. 제품 원칙: sitter 입력 = **사진 선택 + 탭만** (캡션 입력 필드 없음)
3. 영상 게시물이 owner 상세에서 재생됨
4. 다른 owner 계정에는 알림·피드가 보이지 않음

---

## 산출물

- `frontend/app/(sitter)/pets/[petId].tsx`, `frontend/app/(owner)/feed.tsx`, `frontend/app/(*)/notifications.tsx`
- `frontend/components/FeedCard.tsx`, `NotificationBell.tsx`, `frontend/providers/NotificationsProvider.tsx`, `frontend/lib/feed.ts`
- `supabase/migrations/004_feed_notifications.sql`

---

## AI 프롬프트

Playbook §7 — "without AI captions first"; (5.1–5.2) / (5.3–5.5) 두 번

---

## 다음 Phase

→ [Phase 06 — 투약·산책](phase-06.md)
