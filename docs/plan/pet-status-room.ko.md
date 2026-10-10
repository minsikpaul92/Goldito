# Pet status room (8-bit Tamagotchi-style dashboard)

> **Status:** P1 product spec (Phase **11.12**). Depends on Plan B care data ([sitter-care-loop.ko.md](sitter-care-loop.ko.md) — Phase 06 check-ins + tasks) and optional pet theme ([11.10](phases/phase-11.md)).

Owner **Home** (or Care top) shows one screen like a **Tamagotchi / Digimon v-pet**: at a glance — **fed?, potty?, mood?, next task?** — with an **8-bit pixel pet** that reflects **species + breed** (and later `pets.theme` from 11.10).

---

## 1. User story

| Who | Want |
| :--- | :--- |
| Owner | Open Goldito and **see Max’s state now** without scrolling Activity or asking the sitter |
| Owner | Feel emotional connection (retro 8-bit room, pet reacts to today’s care) |
| Sitter | (Indirect) Owner sees updates from check-ins/tasks already logged — no extra sitter work |

---

## 2. Data (no new tables in P1 v1)

Derive **`PetStatusSnapshot`** on the client or via RPC `get_pet_status(p_pet, p_date)`:

| Signal | Source | Example rule |
| :--- | :--- | :--- |
| **Meal** | Latest `care_checkins` kind=`meal` today, or feeding task `done` | No meal in 6h → `hungry`; last `all`/`most` → `fed` |
| **Potty** | Latest `potty` check-in or litter task done | No potty today by 18:00 → `needs_potty` (soft nudge on UI only) |
| **Mood** | Latest `mood` check-in; P1 optional latest feed `mood` chip (11.9) | `happy` / `calm` / `tired` → sprite variant |
| **Care** | Pending/missed `task_logs` (walk, med) | Next due task label under sprite |
| **Episode** | Latest `note` check-in (optional one-liner under sprite) | Truncate 40 chars |

Rules live in one module (`lib/petStatus.ts`) — tunable without schema churn.

---

## 3. UI (8-bit)

| Element | Spec |
| :--- | :--- |
| **Layout** | Single card ~ full width on Home; tap → Activity timeline |
| **Sprite** | **8-bit pixel art** — idle animation (2–4 frames). States: `happy`, `calm`, `tired`, `hungry`, `sleepy` (map from snapshot) |
| **Breed mapping** | P1 demo: **2–3 dog breeds** (e.g. Maltese, Golden, Shiba) + **1 cat** from `pets.breed` / species fallback. Unknown breed → generic dog/cat sprite |
| **HUD** | Icon row: 🍽️ fed / ⚠️ hungry · 💩 potty · 😊 mood · 🦮 next task — same data as text under sprite |
| **Style** | Retro palette (limited colors), optional CRT/scanline **off** by default for readability; fits [DESIGN.md](../../DESIGN.md) tokens for chrome around the “device bezel” |

**Sitter:** optional read-only mini status on Today for assigned pet (same snapshot, no room chrome) — stretch.

---

## 4. Assets & design

- Designer: sprite sheets per breed × mood state; JSON or PNG strip; bundle under `frontend/assets/pixel-pets/`.
- Can pair with **11.10** theme (background tint of room, not sprite recolor in v1).
- **Do not** block P0/P1 core on full breed catalog — ship demo breeds only.

---

## 5. Phase & DoD (11.12)

1. Owner Home shows **Pet status room** for selected pet (PetSwitcher).
2. After sitter logs meal + mood check-ins (Phase 06), room updates within one refresh / Realtime invalidate.
3. At least **Max (Maltese)** + **Mochi (cat)** sprites with **3+ visual states** each.
4. Tap room → Owner Activity (Phase 06).

---

## 6. Related

- Settings & patch notes: [phase-11 §11.11](phases/phase-11.md)
- Post-hackathon: more breeds, room furniture (sticker BM), sitter co-op mini events — roadmap only.
