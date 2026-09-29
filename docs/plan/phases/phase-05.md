# Phase 05 — 케어 피드 & 앨범 (AI 없음)

## Goal

**키즈노트 앨범**에 해당하는 핵심 UX: 펫시터가 강아지 사진을 올리면 **견주 피드/앨범에 즉시 보이고**, **알림**이 생성된다. 이 Phase에서는 캡션은 placeholder — AI는 Phase 09.

### Goal 달성 기준

- [ ] Sitter: 담당 dog 선택 → 사진 업로드 → `feed_posts` 생성
- [ ] Owner: 타임라인에서 최신순 게시물 + Cloudinary 썸네일
- [ ] 새 게시 → `notifications` row + Owner 측 Realtime/toast

---

## 선행 조건

- [Phase 04](phase-04.md) upload
- Owner–Dog–Sitter 관계 DB에 1세트 (수동 insert OK)

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| SitterHome dog list | 앨범 필터 by date (P1) |
| FeedTimeline | AI caption |
| notification type `feed_post` | Push (Expo) — web toast만 |
| placeholder caption `"..."` or `"Photo uploaded"` | 사진 요청 (P1) |

---

## 화면 (Goal UX)

| 화면 | 역할 | 핵심 액션 |
| :--- | :--- | :--- |
| SitterHome | sitter | dog 카드 → DogFeed |
| DogFeed (sitter) | sitter | + Upload |
| OwnerHome | owner | dog 선택 |
| FeedTimeline | owner | scroll, tap → detail (optional) |
| NotificationBell | owner | unread count |

---

## 작업 상세

| ID | 작업 | DoD |
| :--- | :--- | :--- |
| 5.1 | feed_posts insert | media_id 연결, sitter_id, dog_id |
| 5.2 | Owner timeline query | RLS 통과, pagination limit 20 |
| 5.3 | Notification on insert | DB trigger **또는** app-layer insert (문서화) |
| 5.4 | Realtime subscribe | `notifications` filter user_id=me |

---

## Definition of Done (DoD)

1. 두 브라우저( owner / sitter ) 동시 로그인 테스트 시나리오 통과
2. 제품 원칙: sitter 입력 = **사진 + 업로드 탭만** (캡션 입력 필드 없음)

---

## 산출물

- Frontend screens (owner/sitter feed)
- (선택) `supabase/migrations/003_feed_notification_trigger.sql`

---

## AI 프롬프트

Playbook §7 — "without AI captions first"

---

## 다음 Phase

→ [Phase 06 — 투약·산책](phase-06.md)
