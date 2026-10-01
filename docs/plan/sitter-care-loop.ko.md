# Sitter care loop (확정: Plan B)

> **Status:** product decision locked for P0 (Phase 06–07).  
> **North star:** Sitter **care, snap, tap** — owner **learns without asking**.  
> **English UI** (D1). Code & SQL: English.

시터에게 필수인 **산책 · 밥 · 배변(똥/쉬) · 기분 · 짧은 에피소드**를 **탭(±사진)** 으로 기록하고, **체크 즉시 견주 알림**, 견주는 **히스토리(Activity)** 로 “언제 했는지” 확인한다. 저녁 **AI 알림장**은 같은 날 데이터를 **집계**만 한다.

---

## 1. Two ways to log care

| Path | When | Sitter UI | Owner |
| :--- | :--- | :--- | :--- |
| **Scheduled task** | Owner registered `care_tasks` (med, walk, feeding, litter, play, sleep) with a time | Tasks / Today “Next up” → **Mark done** or **Done with photo** | `task_done` notification + Activity row + optional feed card |
| **Ad-hoc check-in** | Any time, any count per day (meal, potty, mood, note) | Today **Quick check-ins** chips | `care_checkin` notification + Activity row + optional feed if photo |

Both paths write **timestamped rows** the owner can scroll in **Activity**.

---

## 2. Optional photo (not typing)

| Action | Photo |
| :--- | :--- |
| Complete scheduled task | **Optional** — `complete_task_log(p_task_log, p_media_id null)` |
| Log check-in | **Optional** — `log_care_checkin(..., p_media_id null)` |
| Feed | If photo attached, may also create `feed_post` (same rules as today: on-duty, pet match) |

Sitter never **must** type captions for these flows. Note check-in allows **≤120 chars** (episode line); still optional.

---

## 3. Check-in kinds (`care_checkins`)

Migration **`005_tasks.sql`** (Phase 06) adds:

| Column | Notes |
| :--- | :--- |
| `id`, `pet_id`, `created_by`, `created_at` | Standard |
| `kind` | `meal` · `potty` · `mood` · `note` (P0). Same enum extensible later (`water`, …) |
| `value` | Kind-specific: meal `all\|most\|little\|none`; potty `normal\|soft\|none`; mood `happy\|calm\|tired`; note → null |
| `note_text` | Required when `kind='note'`, else null, max 120 chars |
| `media_id` | Optional → `media` |

RLS: insert/select like task completion — on-duty sitter for `pet_id`; owner read via `can_access_pet` / history RPC.

**RPC:** `log_care_checkin(p_pet, p_kind, p_value, p_note_text, p_media_id)` → notification + optional feed.

---

## 4. Scheduled tasks (unchanged concept, relaxed completion)

- Owner **Care** tab: CRUD `care_tasks` (species-aware types, phase-06 6.1).
- `ensure_today_task_logs` → `task_logs` for today.
- **Complete:** primary **Mark done** (check only); secondary **Add photo** or one sheet: Mark done / Done with photo.
- Done → `task_done` (architecture notification matrix); if `media_id` set → `feed_post` with task badge (phase-06 6.4).

---

## 5. Owner Activity (history)

| Route | Phase | Content |
| :--- | :--- | :--- |
| `/(owner)/activity` or Care tab **Activity** segment | 06 | Pet switcher · default **today + last 7 days** · merged timeline: `task_logs` (done) + `care_checkins` + feed posts (optional collapse) · each row: time, icon, label (“Fed · All”, “Walk · Done”, “Mood · Happy”, “Note · …”), thumbnail if photo |

Tap row → detail modal (photo full size). No edit/delete for owner in P0.

---

## 6. Notifications (immediate)

| Type | Trigger | Owner title (examples) |
| :--- | :--- | :--- |
| `task_done` | `complete_task_log` | Existing type-specific copy (walk, med, feeding, …) |
| `care_checkin` | `log_care_checkin` | e.g. “Bori had a meal 🍽️”, “Potty update for Bori”, “Mochi seems calm 😌”, “Note from your sitter” |

Realtime + bell center (Phase 05). **Missed** tasks: owner sees ⚠️ on Care/Activity; **no** separate `task_missed` push in P0 (unchanged).

---

## 7. Sitter reminders (unchanged P0)

- **Scheduled tasks only:** client in-app banner (D17, phase-06 6.6) when app open and due window.
- **“Did you log meal/potty today?”** nudge → **stretch 6.7** (server) or P1 — not blocking P0 DoD.

---

## 8. Daily report (Phase 07) — aggregation only

End-of-day Report screen:

- **Quick chips** remain for **gap-fill** before Generate (meal/water/potty/mood/note) if sitter skipped check-ins.
- **`source_snapshot`** adds `checkins: [{time, kind, value, note_text?, has_photo}]` from DB; **tasks** and **photos** as today.
- AI must **not invent** events missing from snapshot + checkins + tasks.
- Send → `report_sent` (unchanged).

---

## 9. Demo / DoD scope (keep shippable)

P0 demo must show for **one dog (Bori)**:

1. Owner registers walk + feeding times.
2. Sitter **Mark done** walk without photo → owner notification + Activity.
3. Sitter **Meal · All** quick check-in with photo → notification + Activity + feed.
4. Sitter **Mood · Happy** check-only → notification + Activity.
5. Owner opens Activity → sees ordered history.
6. 18:00 report Generate includes check-ins in snapshot (no hallucinated walk if not done).

Cat (Mochi): litter task + potty check-in optional in same demo script.

---

## 10. Related docs

- Implementation detail: [phase-06.md](phases/phase-06.md), [phase-07.md](phases/phase-07.md)
- Schema columns in DB: [phase-02.md](phases/phase-02.md) (updated when `005` lands)
- Routes & notification types: [architecture.ko.md](phases/architecture.ko.md)
