# PawNote — Design Guide

> **Status: interim draft — everything here is temporary.** Colors, type, spacing, components, and patterns are placeholders so development can start. The designer will finalize them (frontend built with AI assistance, details refined in Figma) and replace this file.
> Until then, values come from [`frontend/theme/tokens.ts`](frontend/theme/tokens.ts). When Figma is ready, Figma Variables become the source of truth: update `tokens.ts` first, then this file.
>
> Source of truth order: **Figma** (when available) → **`tokens.ts`** → **this file**.
> Items marked **(proposed)** are not in `tokens.ts` yet — add them there before using them in code.

This file is written for both people and AI coding agents. Before building any screen, read it and follow the rules in [For AI agents](#for-ai-agents).

---

## 1. Product feel

PawNote is a private care app for **dogs and cats**. Owners hand their pet to a part-time sitter; the app keeps them updated without asking.

| Keyword | Means in UI |
| :--- | :--- |
| **Warm** | Soft off-white background, rounded cards, friendly copy, pet names everywhere |
| **Trustworthy** | Calm green primary, clear status, no clutter, nothing hidden behind gestures |
| **Effortless** | One big action per screen, taps instead of typing (especially for sitters) |

- Feels like a family app (timeline, checkmarks, a warm daily note), **not a developer dashboard**.
- Always include both species: use dog **and** cat in examples, empty states, and illustrations.
- UI copy is **English only** (D1).

---

## 2. Layout

- **Mobile-first, single column.** Content max width **480 px**, centered (`Screen` component). Design frames at **390 px** wide.
- **8 px grid.** All spacing comes from `tokens.spacing`.
- Screen padding: `spacing.md` (16). Gap between cards: `spacing.md`. Inside a card: `spacing.md`.
- Bottom tab bar per role (owner / sitter). The primary action sits at the bottom of the screen, within thumb reach.
- Dev builds show a small role label (**Owner** / **Sitter**) in the header.

---

## 3. Color

Use the token name in code, never a hex value.

| Token | Value | Use |
| :--- | :--- | :--- |
| `background` | `#F7F7F5` | App background behind cards |
| `surface` | `#FFFFFF` | Cards, sheets, modals |
| `text` | `#1A1A1A` | Primary text |
| `textMuted` | `#5C5C5C` | Secondary text, timestamps, helper copy |
| `primary` | `#2D6A4F` | Primary buttons, active tab, links, checkmarks |
| `primaryText` | `#FFFFFF` | Text/icons on `primary` |
| `border` | `#E5E5E0` | Card borders, dividers, input outlines |
| `success` | `#067647` | Done states, SAFE result |
| `error` | `#B42318` | Form/API errors, **DANGER** safety result |
| `warning` **(proposed)** | `#B54708` | WARNING safety result, "needs your OK" handoff badge |
| `warningSurface` **(proposed)** | `#FFFAEB` | Background of warning banners |
| `errorSurface` **(proposed)** | `#FEF3F2` | Background of DANGER modal body / error banners |
| `successSurface` **(proposed)** | `#ECFDF3` | Background of SAFE result / success toast |

Rules:
- `error` red is reserved for real problems (failed actions, DANGER). Do not use red for decoration or "cancel" buttons.
- Status is never color-only — always pair color with an icon or text (e.g. ⚠️ + "Contains chicken").

---

## 4. Typography

System font for now (Figma will pick one family).

| Token | Size | Weight | Use |
| :--- | :--- | :--- | :--- |
| `fontSize.title` | 24 | 700 | Screen title, pet name on profile |
| `fontSize.subtitle` **(proposed)** | 18 | 600 | Card titles, section headers |
| `fontSize.body` | 16 | 400 / 600 for buttons | Body text, buttons, list rows |
| `fontSize.small` | 14 | 400 | Timestamps, helper text, chips |

- Line height ≈ 1.4 × size.
- Sentence case for buttons and titles ("Complete with photo", not "COMPLETE WITH PHOTO").

---

## 5. Spacing & shape

| Token | Value | Use |
| :--- | :--- | :--- |
| `spacing.xs` | 4 | Icon ↔ label |
| `spacing.sm` | 8 | Between related lines, chip padding |
| `spacing.md` | 16 | Screen padding, card padding, gap between cards |
| `spacing.lg` | 24 | Between sections |
| `spacing.xl` | 32 | Top of screen / hero spacing |
| `radius.sm` | 8 | Chips, small thumbnails |
| `radius.md` | 12 | Buttons, inputs |
| `radius.lg` | 16 | Cards, modals, photos in feed |

- Cards use a 1 px `border`, no heavy shadows.
- Minimum touch target: **44 × 44**.

---

## 6. Components

### Existing (`frontend/components/ui/`)

| Component | Rules |
| :--- | :--- |
| `Screen` | Wraps every screen: safe area, scroll, `background`, 16 padding, max width 480 |
| `Card` | `surface`, `radius.lg`, 16 padding, 1 px `border` |
| `Button` | Primary only for now: `primary` fill, `primaryText`, `radius.md`, 600 weight, pressed = 0.9 opacity, disabled = 0.5 opacity |

### Planned (build as needed, keep the same tokens)

| Component | Notes |
| :--- | :--- |
| `Button` variants | `secondary` (white + `border`), `danger` (`error` fill, only for destructive confirms), `large` (full-width, 56 tall — the one primary action on sitter screens) |
| `Chip` | `radius.sm`, `small` text. Allergens, task type, mood (🎾 Playful), slot (Morning / Afternoon / Overnight) |
| `Toast` | Bottom, auto-hide 3 s. Success after actions ("Sent to Jisoo ✅"). **Never** used alone for DANGER |
| `AlertModal` | Safety results — see [§7.4](#74-danger-is-loud) |
| `EmptyState` | Emoji or small illustration + one line + optional action |
| `TabBar` | Per role; tab names follow the route map in [architecture §3](docs/plan/phases/architecture.ko.md) (owner: Home · Feed · Care · Reports …, sitter: Today · Tasks · Scan · Report …) |
| `PetAvatar` | Round photo, species fallback icon (🐶 / 🐱) |
| `TaskRow` | Checkmark circle + title + time; pending first; tap → "Complete with photo" |
| `FeedCard` | Photo/video (`radius.lg`), caption, time, optional mood chip |
| `ProposalCard` | Handoff negotiation: time + place + **Accept** / **Suggest another time** / **Decline** |
| `ReportCard` | Daily report. P1: theme background + stickers (Phase 11.8) |
| `Skeleton` | Gray blocks while loading; matches the final layout |

---

## 7. Patterns

### 7.1 One primary action per screen
Each screen has at most one filled `primary` button. Everything else is secondary or a text link.
Sitter task row → big **Complete with photo**. Owner booking → **Request booking**.

### 7.2 No typing for sitters (P0)
No caption box, no report textarea. Sitters tap: photos, quick-tap chips (meal, water, potty, mood), Send. Optional edit before sending a report is OK.

### 7.3 Feedback loop
Action → **skeleton / spinner** → **toast** on success → the other side gets a **notification**. In the demo, both sides should be visible.

### 7.4 Danger is loud
Safety result modal:

| Result | Look | Close |
| :--- | :--- | :--- |
| **DANGER** | Full-screen, `error` header, ⚠️, pet name in the message, matched allergen / toxic chips | Only via **"I understand — don't feed"** (no tap-outside, no X) |
| **WARNING** | `warning` header, hidden-source explanation, "Ask the owner first" | Normal close |
| **SAFE** | `success` header, "Looks safe for Bori ✅" | Normal close |

### 7.5 Empty states
Always explain what will appear and who adds it.
- Owner feed: "No posts yet — your sitter will share photos here."
- Sitter today: "No pets in your care today. Open your schedule to take bookings."
- Bookings: "No bookings yet. Check your sitters' schedules to plan a trip."

### 7.6 Copy & emoji
- Short, warm, specific. Use the pet's name ("Bori had breakfast on time 🍽️").
- At most **2 emoji** per message; none in buttons except the status ones above.
- Times shown in the app timezone (America/Toronto) with AM/PM.

---

## 8. Imagery & icons

- Real pet photos are the hero; keep chrome minimal around them.
- Icons: one outline icon set (Figma will choose); emoji are fine in notifications, chips, and empty states.
- Stickers and report themes (P1, Phase 11.8): `sunny`, `cozy`, `playful`, `calm` — assets from the designer.

---

## 9. Accessibility

- Text contrast ≥ 4.5:1 on its background (all current text tokens pass on `background` and `surface`).
- Touch targets ≥ 44 × 44; spacing between tappable items ≥ 8.
- Set `accessibilityRole` / `accessibilityLabel` on buttons and icon-only controls.
- Never rely on color alone for status (see §3).

---

## For AI agents

1. Import values from `frontend/theme/tokens.ts`. **Never hardcode** hex colors, font sizes, or spacing numbers.
2. Wrap screens in `Screen`; group content in `Card`; use `Button` for actions. Extend these before creating new primitives.
3. If you need a **(proposed)** token, add it to `tokens.ts` in the same change and mention it in the PR.
4. Follow §7 patterns: one primary action, no sitter text fields, loud DANGER, empty states with copy.
5. Show both dogs and cats in placeholder content.
6. If a screen has a Figma frame, the Figma frame wins over this file.

---

## Open items for the designer (Figma)

Everything above is a placeholder until these are decided.

- [ ] Font family and final type scale (incl. `subtitle`)
- [ ] Final palette, including `warning` and the `*Surface` tints
- [ ] Icon set
- [ ] Logo and app icon
- [ ] Button variants, Chip, Toast, AlertModal, EmptyState, TabBar, ProposalCard, ReportCard
- [ ] Report themes (4) + preset sticker set (Phase 11.8)
- [ ] Welcome / Login screens ([#13](https://github.com/minsikpaul92/PawNote/issues/13))
