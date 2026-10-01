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

- **Mobile-first, single column.** Content max width **480 px**, centered (`Screen` component).
- **Design frame: 402 × 874** (iPhone 17 class, the current base iPhone). Layouts are fluid and must work from **360 to 440 px** wide (small Android → Pro Max). Check 360 / 402 / 440.
- **8 px grid.** All spacing comes from `tokens.spacing`.
- Screen padding: `spacing.md` (16). Gap between cards: `spacing.md`. Inside a card: `spacing.md`.
- Bottom tab bar per role (owner / sitter). The primary action sits at the bottom of the screen, within thumb reach.
- Dev builds show a small role label (**Owner** / **Sitter**) in the header.

### 2.1 Desktop browsers (judges): phone frame

Judges open the demo URL on a computer. They must get the same experience as on a phone ([architecture D25](docs/plan/phases/architecture.ko.md)).

| Where the app runs | What renders |
| :--- | :--- |
| Native app, phone browser (width < 768) | The app, full screen |
| Desktop browser (width ≥ 768) | A phone frame (402 × 874 screen) centered on a soft backdrop, plus a side panel: one-line pitch, **Try demo**, "Open on your phone" QR, hint "Click = tap · Drag or scroll = swipe" (Phase 10.9) |
| `?frame=0` / `?frame=1` | Force the frame off (video recording, debugging) / on |
| `?view=split` (Phase 10.10, stretch) | Owner and Sitter phones side by side |

- The frame holds the **same app in a same-origin iframe**. Inside it, everything behaves like a real 402 px phone: modals, sheets, `useWindowDimensions`, media queries.
- The frame is a generic CSS phone (rounded body, status bar with the time, home indicator). No real device images or brand marks.
- On short windows (laptops at 1366 × 768, Windows at 125–150 % scaling) the frame keeps its width and **only gets shorter** (min 600). Never `transform: scale`.
- Inside the frame, the mouse acts like a finger — see [§7.7](#77-works-with-a-mouse).

| Token | Value | Use |
| :--- | :--- | :--- |
| `layout.frameWidth` | 402 | Phone frame screen width |
| `layout.frameHeight` | 874 | Phone frame screen height (max) — status bar 44 + app + home indicator 28 |
| `breakpoint.framed` | 768 | Desktop browser at or above this → phone frame |
| `breakpoint.expanded` | 1024 | Reserved for the sitter desktop layout (§2.2) |
| `color.frameBackdrop` / `frameBezel` / `frameShadow` | `#E8E8E3` / `#1A1A1A` / 18 % black | Desktop page behind the phone / phone body / phone shadow — frame only, never inside the app |

### 2.2 Later: sitter desktop (post-hackathon, lowest priority)

After the hackathon, **sitters only** get a full desktop layout for heavy work (schedule, daily reports). Owners stay in the phone frame. Build screens now so this stays cheap:

- Screens branch only on `useLayoutMode()` (`'compact'` | `'expanded'`), never on `Platform.OS` or raw width numbers. During the hackathon it is always `'compact'`.
- Tabs use expo-router `Tabs` (JS), not `NativeTabs`, so they can move to a left sidebar later (`tabBarPosition: 'left'`).
- Route files stay thin; data and state live in hooks (`features/<domain>/use*.ts`) that a desktop view can reuse.

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
| `Sheet` | Bottom sheet inside the app. Always has a visible **Close** / **Done**; tapping the backdrop closes it (never for DANGER). Never requires dragging |
| `MediaPicker` | The only way to pick a photo (`pickMedia()`, Phase 04.7). Phone: camera / library. Desktop frame and demo accounts: sample photo tray + **Upload from computer** |
| `HorizontalList` | Chips, photo strips, date strips. The next item peeks in (~24 px) so the row reads as scrollable; works with drag and mouse wheel (§7.7) |
| `AppShell` / `DeviceFrame` (web) | Phone frame on desktop (§2.1). Lives in `components/shell/`; screens never import it — they may only use `useShell()` (`{ embedded }`) and `useLayoutMode()` |

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

### 7.7 Works with a mouse

Judges use a computer, so every action must work with a mouse and a trackpad inside the phone frame (§2.1).

| On a phone | With a mouse in the frame | Rule |
| :--- | :--- | :--- |
| Tap | Click | Works as-is (react-native-web fires `onPress` on click) |
| Swipe to scroll | Wheel, trackpad, or click-drag | Click-drag scrolling with momentum comes from `TouchEmulation` (task 1.7) |
| Swipe sideways (chips, photos, dates) | Drag, or plain wheel over the row | Use `HorizontalList` — the next item peeks in |
| Pull to refresh | Nothing (`RefreshControl` is a no-op on web) | Data updates via Realtime; add a refresh button if needed |
| Long press | Works (hold 450 ms), but nobody finds it | Never the only way to do something |
| Swipe back, swipe to delete, drag a sheet down | Not reliable on web | Always a visible back button, delete button, **Close** |
| Camera | Most desktops have none | `pickMedia()` sample tray (`MediaPicker`) |
| Date / time pickers | `@react-native-community/datetimepicker` has no web support | Build our own (chips, steppers, `SlotCalendar`) |

**Desktop check for every screen PR** (phone frame, mouse only, 1366 × 768):

- [ ] Every action works by click; nothing is gesture-only
- [ ] Wheel and drag scrolling work; horizontal rows move
- [ ] The primary action is visible; nothing is cut off at the bottom
- [ ] Modals, sheets, and toasts stay inside the phone
- [ ] Layout holds at 360, 402, and 440 widths
- [ ] Any new library supports web (check the platform list in Expo docs)

---

## 8. Imagery & icons

- Real pet photos are the hero; keep chrome minimal around them.
- Icons: one outline icon set (Figma will choose); emoji are fine in notifications, chips, and empty states.
- Stickers and report themes (P1, Phase 11.8): `sunny`, `cozy`, `playful`, `calm` — assets from the designer.
- Sample photos for the demo tray (Phase 04.7): dog and cat daily photos plus treat labels with fictional brands (the same label images as the Phase 08 test fixtures). No people, faces, or addresses.

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
7. The UI must work inside the desktop phone frame with a mouse (§2.1, §7.7): no gesture-only actions, no pull-to-refresh-only updates, no native-only libraries (date/time pickers, swipeable rows).
8. Branch layout only with `useLayoutMode()` — no `Platform.OS` or width numbers in screens. Pick photos only through `pickMedia()`.

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
- [ ] Figma frames at **402 × 874**; spot-check at 360 and 440
- [ ] Desktop backdrop, side panel, and phone-frame style (§2.1)
- [ ] Sample photo set for the demo tray: dog / cat daily photos + treat labels with fictional brands (§8)
