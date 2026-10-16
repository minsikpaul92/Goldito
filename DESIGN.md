# Goldito — Design Guide

> **Figma is the source of truth.** Muk's [Goldito-Design](https://www.figma.com/design/stZjrJJU6KOhLauxPjaV8l/Goldito-Design) file (Variables, text styles, 65 components, screens) and the [brand site](https://mooque-dev.github.io/goldito-design/brand.html) decide how Goldito looks and behaves. This file is the **bridge**: [§0](#0-figma--code-read-first) says where every Figma piece lives in the code; §1–§9 are the rules the code follows. When Figma and this file disagree, Figma wins — then update this file.
>
> Source of truth order: **Figma** → **`frontend/theme/tokens.ts` / `themes.ts`** → **this file**. Items marked **(proposed)** are not in `tokens.ts` yet — add them there before using them in code.

This file is written for both people and AI coding agents (including the designer's agent working with the Figma MCP). Read §0 first, then follow [For AI agents](#for-ai-agents).

---

## 0. Figma ↔ code (read first)

### 0.1 The four places

| What | Where | Who changes it |
| :--- | :--- | :--- |
| Look (colors, sizes, type, components, screens) | Figma [Goldito-Design](https://www.figma.com/design/stZjrJJU6KOhLauxPjaV8l/Goldito-Design) — pages **Components** and **Screens** | Muk |
| Design values in code | [`frontend/theme/tokens.ts`](frontend/theme/tokens.ts) (Figma Color mode `Default` + Size + Motion) · [`frontend/theme/themes.ts`](frontend/theme/themes.ts) (one preset per other Color mode) | whoever syncs Figma → code |
| Base components | [`frontend/components/ui/`](frontend/components/ui/) — one file per Figma base component (§0.4) | same |
| Every screen and every button | [`docs/design/screen-map.md`](docs/design/screen-map.md) — **generated**: route → file → each action's label, ID and line (§0.6) | regenerated, never hand-edited |

Code reads design values only through `useTheme()` (≈ 2,000 style references). Changing a value in `tokens.ts` changes every screen; no screen needs a separate edit for a color, size or type change.

### 0.2 Variables → tokens

Every Figma variable carries its code name as **code syntax** (Figma uses kebab-case, code camelCase): `color/text-muted` → `theme.color.textMuted`. Keep the code syntax filled on every new variable — it is the link.

| Figma collection | Code | Note |
| :--- | :--- | :--- |
| **Color**, mode `Default` | `tokens.color.*` | The base theme |
| **Color**, any other mode (`Balanced`, later one per pet coat skin) | a preset in `themes.ts` (`balanced`, …) | A mode may change only the `SkinColors` keys (§3.1); status colors are the same in every mode |
| **Size**: `spacing/*`, `radius/*`, `icon/*`, `font-size/*`, `size/touch-target`, `layout/*` | `tokens.spacing`, `radius`, `icon`, `fontSize`, `layout.touchTarget`, `layout.*` | |
| **Motion**: `duration/*`, `press/scale`, `press/opacity` | `tokens.motion.fast/base/slow`, `pressScale`, `pressOpacity` | |
| Text styles `Title`, `Body`, `Body Strong`, `Small`, `Small Strong`, `Caption` | `fontSize.*` + `fontWeight.*` + `lineHeight.*` (§4) | Font family: system font in the app (D6); Inter in Figma is a stand-in |

**Code-only tokens — add them to Figma as variables** so both sides have them: `color/media`, `color/on-media`, `color/gold`, `color/gold-on-light`, `color/cream`, `font-weight/*` (400 · 500 · 600 · 700), `line-height/*` (14 · 20 · 22 · 30), `opacity/pressed` (0.7), `opacity/disabled` (0.5).

### 0.3 Sync steps (Figma → code)

1. Change the Variables / components in Figma first.
2. Read them with the Figma MCP: `get_variable_defs` on a node (or a read-only `use_figma` over `figma.variables`) for values; `get_design_context` on a component for its layout.
3. Update `tokens.ts` / `themes.ts` (values only — keep the keys; a new key gets added to both Figma and code in the same change).
4. Update the matching file in `components/ui/` (§0.4) — never restyle a screen to fake a component change.
5. Screens last, one at a time, against the Figma frame (§0.5).
6. `cd frontend && npx tsc --noEmit && node scripts/screen-map.mjs` — commit the regenerated map with the change.
7. Check on the running app (`npx expo start --web`, sign in with **Demo owner** / **Demo sitter**; `/?view=split` shows both phones).

### 0.4 Components (Figma → code)

✅ one file to edit · 🟡 split over several files or partly different · ❌ not in code yet

| Figma component | Code | |
| :--- | :--- | :--- |
| Button (Style × State) | `components/ui/Button.tsx` — `variant` primary · secondary · danger, `disabled` (Figma `Loading` not in code yet) | ✅ |
| Text Button (Tone × State) | `components/ui/TextButton.tsx` — `danger`, `disabled` | ✅ |
| Chip (Removable) | `components/ui/Chip.tsx` — `onRemove` | ✅ |
| Tag (Tone) | `components/ui/Tag.tsx` — `tone` brand · success · warning · danger · neutral | ✅ |
| Avatar (Kind) | `components/ui/Avatar.tsx` — `kind` initial · photo · emoji, `size` | ✅ |
| Banner (Tone) | `components/ui/Banner.tsx` — `tone` info · warning · error · offline, `icon`, `title`, `body`, `action` | ✅ |
| Card | `components/ui/Card.tsx` | ✅ |
| Text Field (State) | `components/ui/TextField.tsx` — `error` (Figma `Helper` line not in code yet) | ✅ |
| Segment | `components/ui/SegmentedControl.tsx` — `count` → corner badge | ✅ |
| Checkbox Row | `components/ui/CheckRow.tsx` — `radio`, `hint` | ✅ |
| Stepper | `components/ui/Stepper.tsx` | ✅ |
| Empty State | `components/ui/EmptyState.tsx` — `action` | ✅ |
| Bottom Sheet | `components/ui/Sheet.tsx` | ✅ |
| Alert Modal · DANGER | `components/ui/AlertModal.tsx` | ✅ |
| Toast | `providers/ToastProvider.tsx` (`useToast()`) | ✅ |
| Logo (brand site) | `components/BrandLogo.tsx` + `assets/brand/` · favicon in `app.json` | ✅ |
| Booking Card / Stage Card | `components/BookingCard.tsx`, `components/BookingStageBar.tsx` | ✅ |
| Stay Summary Card | `components/StaySummaryCard.tsx` | ✅ |
| Latest Update Row | `components/LiveUpdates.tsx` | ✅ |
| Pet Mini Card | `components/PetCard.tsx` | ✅ |
| Feed Card | `components/FeedCard.tsx` | ✅ |
| Grid Photo / Day Header | `components/AlbumView.tsx` | ✅ |
| Timeline Row | `components/DiaryTimeline.tsx` | ✅ |
| Check-in Tile | `components/QuickCheckIn.tsx` | ✅ |
| Suggestion Chip | `components/ChipSuggestions.tsx` | ✅ |
| Checklist Row | `components/ChecklistCard.tsx` | ✅ |
| Message Bubble | `components/MessageBubble.tsx` | ✅ |
| Quote Card | `components/QuoteCard.tsx` | ✅ |
| Consent Card | `components/ConsentCard.tsx` | ✅ |
| Entry Info Card | `components/EntryInfoCard.tsx` | ✅ |
| Star | `components/StarRating.tsx` | ✅ |
| Life Record Card | `components/LifeRecordCard.tsx` | ✅ |
| Trip Map | `components/TripMap.tsx` / `TripMap.web.tsx` | ✅ |
| Calendar Day | `components/SlotCalendar.tsx`, `components/ui/DayPickerSheet.tsx` | 🟡 |
| Tab Bar / Tab Bar Item | `components/RoleTabs.tsx` — Figma's last tab says **Mood**, the app's is **Snap** (D61) | 🟡 |
| Top Bar / Icon Button | `expo-router` headers + `components/HeaderActions.tsx`, `components/NotificationBell.tsx` | 🟡 |
| Profile Card | `components/SitterCard.tsx` + `app/owner/sitters/[sitterId].tsx` | 🟡 |
| Choice Card | `components/RoleCard.tsx`; other big radio choices are local | 🟡 |
| Next Task Card / Task Row | `components/SitterDashboard.tsx`, `components/TodayTasks.tsx`, `components/CareTasksSection.tsx` | 🟡 |
| Report Summary / Daily Note | `components/ReportComposer.tsx` + diary screens | 🟡 |
| Photo Check | `features/transit/TripScreen.tsx` (local) | 🟡 |
| Mood Result Card | `features/snap/MoodScreen.tsx` (local) | 🟡 |
| Action Row | `features/snap/SnapToolCard.tsx`; settings rows are local | 🟡 |
| Photo Tile | `components/MediaPicker.tsx`, `components/MediaPlaceholder.tsx` | 🟡 |
| Notification Row | `features/notifications/NotificationsCenter.tsx` (local) | 🟡 |
| Switch / Switch Row | not in code (closest: `components/ShareToggle.tsx`) | ❌ |
| Filter Chip, Skeleton, Progress Bar, Source Tag, Typing Indicator, Step Dot, Feature Row | not in code, or drawn locally | ❌ |
| Permission Prompt, Push Preview, Theme Preview, Demo Control | prototype / onboarding drafts — not built | — |

When a 🟡 or ❌ component is built, give it **one** file in `components/ui/` (base) or `components/` (screen-level) with the **Figma name and the Figma property names** (`Tone`, `Kind`, `State` → lower-case props), and point every use at it. One Figma component = one code file.

### 0.5 Screens (Figma Screens page → routes)

Routes follow `expo-router` files (`frontend/app/`): `app/owner/(tabs)/bookings.tsx` is `/owner/bookings`. The full list with every button is in [`docs/design/screen-map.md`](docs/design/screen-map.md).

| Figma frame (Screens page) | Route(s) |
| :--- | :--- |
| Owner · Home | `/owner` |
| Owner · Bookings | `/owner/bookings` |
| Owner · Feed | `/owner/feed` |
| Owner · Diary | `/owner/diary` |
| Owner · Mood (= **Snap** tab, D61) | `/owner/snap`, `/owner/snap/mood` |
| Sitter · Home | `/sitter` |
| Inquiry · AI reply (07B) | `/owner/inquiries/[inquiryId]`, `/sitter/inquiries/[inquiryId]` |
| Care request → checklist (06) | `/owner/pets/[petId]/care-request`, `/sitter/care-request/[requestId]` |
| Meet & Greet (3B.9) | booking detail `/owner/bookings/[bookingId]`, `/sitter/bookings/[bookingId]` (`MeetGreetCard`, `MeetGreetSheet`) |
| Checkout · consents (03C) | `/owner/bookings/[bookingId]/checkout` |
| Paid · entry info (03C) | booking detail (`PaidConfirmation`, `EntryInfoCard`) + `/owner/home-access` |
| Live trip (06B) · Handoff photo check (06B) | `/owner/bookings/[bookingId]/trip`, `/sitter/bookings/[bookingId]/trip` (`features/transit/TripScreen.tsx`) |
| 5-second check (7.7) · Daily note · review (7.3) | `/sitter/diary` (`ReportComposer`) |
| Treat Guard · DANGER (08) | `/owner/snap/treat`, `/sitter/snap/treat` |
| Home safe · review (07C) | `/owner/bookings/[bookingId]/review` |
| Life Record (07C) | `/owner/pets/[petId]/record` |
| Edge states ①–⑤ | the screen of that stage, shown with `Banner` (or `AlertModal` for DANGER); the edge state's name goes in the Banner's `testID` |
| Onboarding · Welcome / Role / Log in | `/welcome`, `/welcome/owner`, `/welcome/sitter`, `/login` |
| Onboarding · Create account / Add your pet | `/signup`, `/owner/pets/new` |
| Onboarding · Your look, Health & care, Notifications, Permission prompt | not built (OB.4 on hold; 11.15 pet onboarding) |
| Sitter setup · Services & rates, House rules, Availability, Live profile | `/profile`, `/sitter/schedule` |

**Name new Figma frames `<Role> · <Screen>` and put the route in the frame description** (e.g. `/owner/bookings`), so a frame and its file find each other in one step.

### 0.6 UX changes: move, merge, remove

UX can change, not only the look: a button moves to another screen, two actions merge, a section disappears. The code is set up so this is safe to plan and quick to find:

- **Every action has a stable ID** (`testID`), e.g. `book-care`, `cancel-confirm`, `demo-owner` — 321 of 321 today. The ID names *what the action does*, not where it sits, so it stays the same when the button moves.
- **[`docs/design/screen-map.md`](docs/design/screen-map.md)** lists, per screen, the components it shows and every action with its label, ID and line. Search it for a label from a Figma frame ("Book care") or an ID to land on the file and line.
- The e2e tests (`frontend/e2e/`) find actions by these IDs, so `grep -rn "<id>" frontend/e2e` shows which tests depend on an action before you move or remove it.
- **Screens are thin**: data and logic live in hooks and API files (`features/<domain>/use*.ts`, `*Api.ts`); the route file mostly arranges components. Moving a button = moving its JSX and calling the same hook in the new place.

| UX change | How |
| :--- | :--- |
| Move an action to another screen | Move the JSX (keep its `testID`), call the same hook / API in the new screen, update the e2e test's navigation |
| Merge two actions | Keep one `testID` (the surviving action's), delete the other, update its tests |
| Remove an action or section | Delete the JSX; `grep` its `testID` in `frontend/e2e` and delete or update those tests; delete the hook only if nothing else uses it |
| Rename a label only | Change the `label`; the `testID` stays |
| New action | Add a `testID` named for what it does (`<thing>-<verb>`, kebab-case) |

After any of these: `node scripts/screen-map.mjs` (CI fails if the map is stale).

### 0.7 Not decided yet

- **Mood vs Snap** — Figma's Tab Bar says Mood; the app (D61) is **Snap** (treat check · mood · stickers).
- **Skins and text** — `Balanced` also tints `text` / `text-muted`; the code allows that only for dark, readable values (§3.1).
- **18 px subtitle** — §4 proposes it; D6 says four sizes. One of them changes.
- **Logo** — the gold tag (v2.1) is in the app; the brand site still lists Notebook and Pixel as directions.

---

## 1. Product feel

Goldito is a private care app for **dogs and cats**. Owners hand their pet to a part-time sitter; the app keeps them updated without asking. One stay runs through five stages — Inquiry → Meet & Greet → Booking → Care & Pet Transit → Completion ([full-process.ko.md](docs/plan/full-process.ko.md)) — so screens should feel like one continuous journey (Rover booking × KidsNote care × Uber trip), not separate tools.

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
| Native app, phone or tablet browser (touch is the primary input) | The app, full screen |
| Computer browser (mouse / trackpad), **any window width** | A phone frame (402 × 874 screen) centered on a soft backdrop, plus a side panel: one-line pitch, **Try demo**, "Open on your phone" QR, hint "Click = tap · Drag or scroll = swipe" (Phase 10.9) |
| `?frame=0` / `?frame=1` | Force the frame off (video recording, debugging) / on |
| `?view=split` on a computer window ≥ 900 px (Phase 10.10) | Owner and Sitter phones side by side, each signed in to its own demo account (judges' link and video). Narrower windows and touch devices get the normal view. **Show both phones** under the single phone / **Show one phone** switch between them |

- The frame holds the **same app in a same-origin iframe**. Inside it, everything behaves like a real 402 px phone: modals, sheets, `useWindowDimensions`, media queries.
- The frame is a generic CSS phone (rounded body, status bar with the time, home indicator). No real device images or brand marks.
- The device type decides, not the window width (`pointer: coarse` = touch): narrowing a desktop window keeps the phone frame, so the team can always see the mobile behavior.
- The app inside always lays out at **402 px wide**. On short windows (laptops at 1366 × 768, Windows at 125–150 % scaling) only the screen height shrinks (min 600). On windows narrower than the phone, the whole phone is scaled down visually — safe because the app lives in an iframe with its own coordinates.
- Inside the frame, the mouse acts like a finger — see [§7.7](#77-works-with-a-mouse).

| Token | Value | Use |
| :--- | :--- | :--- |
| `layout.frameWidth` | 402 | Phone frame screen width |
| `layout.frameHeight` | 874 | Phone frame screen height (max) — status bar 44 + app + home indicator 28 |
| `breakpoint.expanded` | 1024 | Reserved for the sitter desktop layout (§2.2) |
| `layout.tabBarHeight` | 60 | Bottom tab bar — the library default (49) cuts the labels off on web |
| `color.frameBackdrop` / `frameBezel` / `frameShadow` | `#E8E8E3` / `#1A1A1A` / 18 % black | Desktop page behind the phone / phone body / phone shadow — frame only, never inside the app |

### 2.2 Later: sitter desktop (post-hackathon, lowest priority)

After the hackathon, **sitters only** get a full desktop layout for heavy work (schedule, daily reports). Owners stay in the phone frame. Build screens now so this stays cheap:

- Screens branch only on `useLayoutMode()` (`'compact'` | `'expanded'`), never on `Platform.OS` or raw width numbers. During the hackathon it is always `'compact'`.
- Tabs use expo-router `Tabs` (JS), not `NativeTabs`, so they can move to a left sidebar later (`tabBarPosition: 'left'`).
- Route files stay thin; data and state live in hooks (`features/<domain>/use*.ts`) that a desktop view can reuse.

---

## 3. Color

Use the token name in code (`theme.color.primary` from `useTheme()`), never a hex value.

| Token | Value | Skin? | Use |
| :--- | :--- | :--- | :--- |
| `background` | `#F7F7F5` | ✅ | App background behind cards |
| `surface` | `#FFFFFF` | ✅ | Cards, sheets, modals, inputs |
| `text` | `#1A1A1A` | ✅ dark only | Primary text |
| `textMuted` | `#5C5C5C` | ✅ dark only | Secondary text, timestamps, helper copy |
| `primary` | `#2D6A4F` | ✅ | Primary buttons, active tab, links, checkmarks |
| `primaryText` | `#FFFFFF` | ✅ | Text/icons on `primary` |
| `accent` | `#D8F3DC` | ✅ | Soft highlight behind selected chips and badges (text on it uses `text`) |
| `border` | `#E5E5E0` | ✅ | Card borders, dividers, input outlines |
| `borderStrong` | `#86867F` | ✅ | Outlines that must stay visible (radio rings, inputs on tinted backgrounds) |
| `track` | `#E5E5E0` | ✅ | Empty part of a progress bar or switch |
| `overlay` | 40 % `text` | | Dimmed backdrop behind modals and sheets |
| `media` | `#000000` | | Letterbox behind photos and videos in viewers |
| `onMedia` | `#FFFFFF` | | Text and icons on a photo, a video, or a solid status color |
| `gold` | `#F4C35A` | 🔒 brand | Logo tag, celebration moments — never text on a light background |
| `goldOnLight` | `#C9962E` | 🔒 brand | Small gold accents on light backgrounds (the logo heart) |
| `cream` | `#FBF6EA` | 🔒 brand | Warm expressive ground for brand moments |
| `success` | `#067647` | 🔒 fixed | Done states, SAFE result |
| `error` | `#B42318` | 🔒 fixed | Form/API errors, **DANGER** safety result |
| `warning` | `#B54708` | 🔒 fixed | WARNING safety result, "needs your OK" handoff badge |
| `warningSurface` | `#FFFAEB` | 🔒 fixed | Background of warning banners |
| `errorSurface` | `#FEF3F2` | 🔒 fixed | Background of DANGER modal body / error banners |
| `successSurface` | `#ECFDF3` | 🔒 fixed | Background of SAFE result / success toast |

Rules:
- `error` red is reserved for real problems (failed actions, DANGER). Do not use red for decoration or "cancel" buttons.
- Status is never color-only — always pair color with an icon or text (e.g. ⚠️ + "Contains chicken").

### 3.1 Themes (pet skins)

A theme preset in `themes.ts` (= one mode of the Figma Color collection) may change **only** the ✅ colors (`primary`, `primaryText`, `background`, `accent`, `surface`, `border`, `borderStrong`, `track`, `text`, `textMuted`); `text` / `textMuted` may only shift within dark, readable values. The 🔒 colors (`error`, `success`, `warning` and their surfaces) never change, so a DANGER warning can't blend into a skin. Today there are `default` and `balanced` (warmer neutrals, Figma mode `Balanced`); the coat-color presets (6–8, from the designer) and choosing them per pet arrive in Phase 11.10.

---

## 4. Typography

The phone's own system font (D6, brand site); Inter in Figma stands in for it.

**One exception — the picture-diary page (12.4):** a sent daily report is drawn as a 그림일기 page (date + pet on top, the day's photo in a picture box, the words on ruled lines) in **Gaegu** (Google Fonts, SIL OFL), loaded on web only from `fonts.googleapis.com`; native keeps the system font. Body `fontSize.body + 4` on a 30 px rule. Nowhere else.

| Token | Size | Weight | Use |
| :--- | :--- | :--- | :--- |
| `fontSize.title` | 24 | 700 | Screen title, pet name on profile |
| `fontSize.subtitle` **(proposed)** | 18 | 600 | Card titles, section headers |
| `fontSize.body` | 16 | 400 / 600 for buttons | Body text, buttons, list rows |
| `fontSize.small` | 14 | 400 | Timestamps, helper text, chips |
| `fontSize.caption` **(proposed)** | 11 | 600 | Slot letters (M · A · N) inside `SlotCalendar` day cells only |

- Weights: `fontWeight.regular` (400), `medium` (500, Caption), `semibold` (600, Strong styles), `bold` (700, Title) — never a raw `"600"` / `"700"` in code.
- Line height per Figma text style: `lineHeight.title` (30), `body` (22), `small` (20), `caption` (14).
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
| `icon.sm` | 22 | Header and inline icons, radio marks |
| `icon.md` | 28 | Icons inside cards (role cards) |
| `icon.hero` | 40 | Emoji / illustration at the top of an empty state |

- Cards use a 1 px `border`, no heavy shadows.
- Minimum touch target: **44 × 44** (`layout.touchTarget`); content column at most `layout.contentMaxWidth` (480).
- Press / disabled feedback: `opacity.pressed` (0.7) and `opacity.disabled` (0.5).
- Motion: `motion.fast` (120 ms), `motion.base` (240), `motion.slow` (420); pressed buttons may use `motion.pressScale` (0.97) / `motion.pressOpacity` (0.85) as in Figma.

---

## 6. Components

### Existing (`frontend/components/ui/`)

| Component | Rules |
| :--- | :--- |
| `Screen` | Wraps every screen: safe area, scroll, `background`, 16 padding, max width 480 |
| `BackLink` | Standard back control: `chevron-back` + label **Back** (`primary`, 600, 44 min height). Use for login → Welcome, signup → previous, onboarding step-back / exit. Label stays **Back** — never “Back to Onboarding” or other destination names. See [§7.8](#78-back-navigation) |
| `MediaPlaceholder` (`components/`) | Onboarding photo/video slot (~4:3, dashed `accent` frame). Centered in leftover tour height; title + brief for Muk’s asset brief. Replace with real media later — see [§7.9](#79-welcome--role-onboarding) |
| `Card` | `surface`, `radius.lg`, 16 padding, 1 px `border` |
| `Button` | `primary` (filled) and `secondary` (`surface` + `borderStrong` border, `primary` label); `radius.md`, 44 min height, 8 / 16 padding, semibold label. Pressed = `motion.pressOpacity` + `motion.pressScale`; disabled = `border` fill + `textMuted` label (Figma Button, Style × State) |
| `TextButton` | Secondary action as a `primary`-colored text link (44 tall) — keeps one filled button per screen; `danger` = `error` color for destructive links (Cancel booking) |
| `TextField` | Label above, `surface` input with 1 px `borderStrong`, `radius.md`, 44 min height, 8 / 16 padding; focus = `primary` border, error = `error` border + message below. An optional **hint** goes on the label line, right after the label: `small`, `textMuted` at reduced opacity, regular weight (e.g. **Meals** `what to give or do (empty = the hint)`). Never join label and hint into one string with a dash |
| `EmptyState` | `icon.hero` emoji + title + one line saying what appears here and who adds it + optional action as a **secondary** button at its natural width (Figma Empty State) |
| `LoadingView` | Full-screen centered spinner (`primary`) while the session or a screen loads |
| `RoleCard` (`components/`) | Big tappable role choice (radio): icon + title + one line; selected = `primary` border + `accent` fill. Sign up now, Welcome later (OB.2) |
| `Chip` | `radius.sm`, `small` text, 1 px `border`; optional ✕ remove button (`Remove <label>`). Allergens now; task type, mood, slot later |
| `Tag` | Status label (Figma Tag): `small` semibold text on its tone's light surface, never a faded color (D3). `brand` (accent / primary) · `success` · `warning` · `danger` · `neutral` (surface + border). Information only, never tappable. Late or missed = `warning`; `danger` only for DANGER and failed payments. Used for booking status, task status, report sent, treat result, the header role (**Owner** / **Sitter**) |
| `Avatar` | Round (Figma Avatar): `initial` (`primary` + `primaryText` letter, people), `photo` (pet photo), `emoji` (species / tool emoji on `accent`). Default 40; cards use 56 |
| `Banner` | Inline notice for an edge state (Figma Banner): icon + title in the tone color + one line on what happens next + optional action. `info` (accent) · `warning` · `error` · `offline`. **Never for DANGER** — that is `AlertModal` (§7.4) |
| `SegmentedControl` | 2–4 options as 44-tall segments (radio); unselected = `borderStrong` border; selected = `primary` border + `accent` fill; `disabled` for locked values (pet species, D22) |
| `Toast` (`useToast()`) | Bottom, above the tab bar, auto-hide 3 s. Success after actions ("Max is added 🐶", "Profile saved ✅"). **Never** used alone for DANGER |
| `PetCard` (`components/`) | Owner Home: round species avatar (🐶 / 🐱 on `accent`) + name + "Dog · Maltese · 4 yrs · 3.2 kg" + allergy chips; tap → pet profile |
| `PetForm` (`components/`) | Add pet / Pet profile: species (locked after creation), name, breed, birthday (`YYYY-MM-DD`), weight (kg), allergies (chip input, stored lowercase), notes |
| `Sheet` | Bottom sheet (RN `Modal`, stays in the phone frame): title + **Close**, backdrop click closes (never use a sheet for DANGER — §7.4), scrolling body, pinned footer for the one primary action. No drag |
| `Stepper` | − value + (44 × 44 buttons) — counts (pets, times a day). **Not for dates and times** — those use `DateField` / `TimeField` (§7.10). The stand-in for native pickers (§7.7) |
| `CheckRow` | Checkbox + label (+ hint line) as one 44-tall click target; `aria-checked` for screen readers |
| `SitterCard` (`components/`) | "Your sitters" row (3B.2): initial on `accent`, name, area · years, note ("2 bookings with you"), service chips (🏠 Boarding / 🔑 House sitting); tap → sitter profile |
| `HandoffPicker` (`components/`) | Book care drop-off / pick-up (3B.3): day stepper (± 1 day), time stepper (± 15 min), place as radio rows = who drives (🚗 I'll drive — at Chloe's place / 🚙 Chloe picks up — at my place / 📍 Somewhere else + "Where to meet") |
| `BookingCard` (`components/`) | Owner booking row (3B.3): sitter, pets with species emoji, drop-off / pick-up time · place label (never the address), status badge with text (Requested · Time suggested by Chloe · Confirmed · Declined · Cancelled — find a new sitter) |
| `PaidConfirmation` (`components/`) | Owner booking detail after checkout (FB-12): an `accent` card with `primary` border — **Booked and paid: $X CAD**, the drop-off time, "Nothing else to do. We'll tell you when {sitter} receives {pets}.", **Tap to dismiss**. It stays until tapped (remembered per booking on this device); the header chip row keeps a small `Paid` chip |
| `ProposalCard` (`components/`) | One open handoff offer (3B.5), `warning` border: the other side's "Chloe suggested a new drop-off · Oct 5, 10:00 AM · Chloe's place" with **Accept** (filled) + Suggest another time + Decline (`danger` link), or my own "Change pending — until Chloe agrees, it stays at …"; history line "You: 9:30 AM → Chloe: 10:00 AM" |
| `HandoffChangeSheet` (`components/`) | Sheet for a new handoff time (Drop-off / Pick-up switch, day ± 1, time ± 15 min); after confirm also the place (radio rows) — **Change time or place** |
| `SlotCalendar` (`components/`) | Sitter schedule month grid (3B.1): Sunday-first weeks, three slot letters M · A · N per day — open = `accent` fill, full = `primary` fill, blocked = outlined + struck-through, closed = faint outline; legend below. Past days disabled; range = two clicks |

### Planned (build as needed, keep the same tokens)

| Component | Notes |
| :--- | :--- |
| `DateField` / `TimeField` **(proposed)** | The one way to enter a day or a time — [§7.10](#710-dates-and-times). `[−] value [+]`; tapping the value opens the calendar (`DayPickerSheet`) or the clock (`TimePickerSheet`) |
| Role label next to a name | The header's **Owner** / **Sitter** is a `brand` `Tag`. Show the same Tag next to a person's name wherever it would otherwise be unclear who they are (booking card and detail, inquiry thread, request cards) — never plain text like "(sitter)" |
| `Button` variants | Built: `primary`, `secondary`, `danger` (`error` fill, only for destructive confirms). Proposed: `large` (full-width, 56 tall — the one primary action on sitter screens), Figma `Loading` state |
| `AlertModal` | Safety results — see [§7.4](#74-danger-is-loud) |
| `TabBar` | Per role; [architecture §3](docs/plan/phases/architecture.ko.md) **D47 / D47b · D61**: both **Home · Bookings · Feed · Diary · Snap** (Snap = treat check · mood · sticker, icon `camera-outline`). Settings (and sitter Earnings later) = header Profile |
| Pet photo avatars | `Avatar kind="photo"` once pets have photos (11.10); `kind="emoji"` (🐶 / 🐱) until then |
| `TaskRow` | Checkmark circle + title + time; pending first; tap → "Complete with photo" |
| `FeedCard` | Photo/video (`radius.lg`), caption, time, optional mood chip |
| `ReportCard` | Daily report. P1: theme background + stickers (Phase 11.8) |
| `MessageBubble` | Inquiry thread (07B). Owners see the sitter's reply as the sitter's own message (no per-message AI label, D36) with source chips ("From Max's Life Record") and the quote card. The sitter's draft view carries the warning "AI drafts can be wrong. You're responsible for what you send." Auto-send mode shows "Chloe is typing…", then the reply (D37); a read marker appears only when the sitter really opens the thread |
| `QuoteCard` | Price breakdown (03C): nights × rate, extra pet, holiday lines, **Total** in bold, currency. Same component in the inquiry thread and checkout |
| `MeetGreetCard` (`components/`, built in 3B.9 with `MeetGreetSheet`) | Booking detail, first-time pairs only (03B, D44). Done / skipped collapse to one muted line; once agreed a local "Go over together" checklist (Care needs · Quirks · Route · Handoff · Heads-up). States: to schedule (**Schedule Meet & Greet** · **Skip Meet & Greet**) → proposed → set (in person: spot + time / video: **Join Google Meet** opens a new tab + **Add to calendar**) → **Done**. A skip request shows the other side **Continue without meeting** and **Decline — cancels the booking** |
| `ChipSuggestions` | Report screen (07, D38). AI-suggested chips in two rows: from today's records and from photos. Tap to turn a chip off or on, tap a value to change it. Wrong suggestions are expected, so turning one off is a single tap |
| `ConsentCard` | One consent: title, 3-line summary, **Read full text**, checkbox. Footer note "Demo template — not legal advice" |
| `EntryInfoCard` | Owner's entry info for the sitter (03C). Locked: 🔒 + "Unlocks Oct 9, 5:30 AM". Unlocked: **Show code** button, code hides again after 10 s. Never on a toast or notification |
| `ChecklistCard` | AI checklist preview from a care request (06): editable rows (time · title · dose), delete, Heads-up chips |
| `TripMap` (web) | View-only Leaflet + OpenStreetMap map (06B): auto-fits traveler + destination, **±** buttons only, no drag-pan (drags scroll the screen, §7.7). Shows OSM attribution. A "Sharing your location until you arrive" banner sits above it while sharing |
| `StarRating` | Five tappable stars (07C), large hit areas, keyboard and mouse |
| `LifeRecordCard` | Pet Life Record (07C): Eats · Meds · Potty · Behavior · Heads-up · Sitter tips, each line with its source ("From Chloe · Oct 9–12") |
| `Skeleton` | Gray blocks while loading; matches the final layout |
| `MediaPicker` | The only way to pick a photo (`pickMedia()`, Phase 04.7). Phone: **Take photo** + **Choose from library**. Desktop frame and demo accounts: sample tray + **Choose from library** (opens the system file/gallery picker — same label on web demo and phones; never "Upload from computer") |
| `HorizontalList` | Chips, photo strips, date strips. The next item peeks in (~24 px) so the row reads as scrollable; works with drag and mouse wheel (§7.7) |
| `AppShell` / `DeviceFrame` (web) | Phone frame on desktop (§2.1). Lives in `components/shell/`; screens never import it — they may only use `useShell()` (`{ embedded }`) and `useLayoutMode()` |

---

## 7. Patterns

### 7.1 One primary action per screen
Each screen has at most one filled `primary` button. Everything else is secondary or a text link.
Sitter task row → big **Complete with photo**. Owner booking → **Request booking**.

### 7.2 No typing for sitters (P0)
No caption box, no long report typing. Sitters tap: **Today quick check-ins** (meal, potty, walk minutes, mood, note) and scheduled tasks (**Mark done** or with photo). Report screen = the **5-second check**: up to 2 photos → **AI-suggested chips** from the day's check-ins, tasks, and photos (the sitter turns off wrong ones) + an optional short note (≤ 200 chars) → Generate → review → **Send** posts it (D34 · D38). Optional edit before Send is OK. Inquiries: the AI drafts the reply in the sitter's tone; the sitter just taps **Send** (Edit / Add / Regenerate are optional, D36 · D38). See [sitter-care-loop.ko.md](docs/plan/sitter-care-loop.ko.md).

Owners may type where it saves the sitter work: the inquiry question, the care & medication request, their name on consents, and their preferred meeting spots.

### 7.3 Feedback loop
Action → **skeleton / spinner** → **toast** on success → the other side gets a **notification**. In the demo, both sides should be visible.

### 7.4 Danger is loud
Safety result modal:

| Result | Look | Close |
| :--- | :--- | :--- |
| **DANGER** | Full-screen, `error` header, ⚠️, pet name in the message, matched allergen / toxic chips | Only via **"I understand — don't feed"** (no tap-outside, no X) |
| **WARNING** | `warning` header, hidden-source explanation, "Ask the owner first" | Normal close |
| **SAFE** | `success` header, "Looks safe for Max ✅" | Normal close |

### 7.5 Empty states
Always explain what will appear and who adds it.
- Owner feed: "No posts yet — your sitter will share photos here."
- Sitter today: "No pets in your care today. Open your schedule to take bookings."
- Bookings: "No bookings yet. Check your sitters' schedules to plan a trip."

### 7.6 Copy & emoji
- Short, warm, specific. Use the pet's name ("Max had breakfast on time 🍽️").
- At most **2 emoji** per message; none in buttons except the status ones above.
- Times shown in the app timezone (America/Toronto) with AM/PM.

### 7.7 Works with a mouse

Judges use a computer, so every action must work with a mouse and a trackpad inside the phone frame (§2.1).

| On a phone | With a mouse in the frame | Rule |
| :--- | :--- | :--- |
| Tap | Click | Works as-is (react-native-web fires `onPress` on click) |
| Swipe to scroll | Wheel, trackpad, or click-drag | Click-drag scrolling with momentum comes from `TouchEmulation` (`components/shell/`) — a drag never fires a tap |
| Swipe sideways (chips, dates) | Drag, or plain wheel over the row | Use `HorizontalList` — the next item peeks in |
| Swipe through paged photos (`pagingEnabled`) | Drag (past half a page, or a quick flick → next page) | The wheel keeps scrolling the screen over a carousel, so feeds never get stuck |
| Custom drag gesture (slider, sticker placement) | — | Mark the area `dataSet={{ gestureOwner: "true" }}` so `TouchEmulation` leaves it alone |
| Pull to refresh | Nothing (`RefreshControl` is a no-op on web) | Data updates via Realtime; add a refresh button if needed |
| Long press | Works (hold 450 ms), but nobody finds it | Never the only way to do something |
| Swipe back, swipe to delete, drag a sheet down | Not reliable on web | Always a visible back button, delete button, **Close** |
| Camera | Most desktops have none | `pickMedia()` sample tray (`MediaPicker`) |
| Date / time pickers | `@react-native-community/datetimepicker` has no web support | Build our own (chips, steppers, `SlotCalendar`) |
| Pan / pinch a map | Drag would fight frame scrolling | `TripMap` is view-only: auto-fit + **±** buttons (D32) |
| Real GPS while driving | A desktop does not move | **Simulate the drive** on demo accounts and in the frame — same trip updates, recorded fictional route |

**Desktop check for every screen PR** (phone frame, mouse only, 1366 × 768):

- [ ] Every action works by click; nothing is gesture-only
- [ ] Wheel and drag scrolling work; horizontal rows move
- [ ] The primary action is visible; nothing is cut off at the bottom
- [ ] Modals, sheets, and toasts stay inside the phone
- [ ] Layout holds at 360, 402, and 440 widths
- [ ] Any new library supports web (check the platform list in Expo docs)

`/dev/gestures` (with `EXPO_PUBLIC_DEV_ROUTES=1`) shows every pattern above in one screen, and the Playwright suite (`frontend/e2e/`) checks it with a mouse in CI. The same checklist is in the PR template.

### 7.8 Back navigation

Every screen that leaves a parent flow uses **`BackLink`** (`frontend/components/ui/BackLink.tsx`):

- Visual: Ionicons `chevron-back` + the word **Back** (same row, `primary` color).
- Placement: top of the screen (or the tour top bar), left-aligned, 44 px min hit area.
- Behavior: go to the previous step or parent route (e.g. Login → `/welcome`, onboarding step 0 → role landing). Prefer `router.push` / `replace` to a known parent over inventing a second marketing link.
- Label is always **Back** — not “Back to Onboarding”, not icon-only, not a marketing link (“How Goldito works”) for the same job.

### 7.9 Welcome / role onboarding

Public intro for **signed-out** visitors (`/welcome`, `/welcome/owner`, `/welcome/sitter`). Spec: [onboarding.ko.md](docs/plan/onboarding.ko.md).

| Rule | Detail |
| :--- | :--- |
| Who sees it | **Signed-out only.** `(public)` layout redirects signed-in users away. After **Sign out**, Welcome shows again (OB.1). **`intro_seen` skip (OB.4) is deferred** — keep showing Welcome for judges; do not block Phase 04. |
| Layout | One phone-height step, **no scroll**: top `BackLink` + progress · full title/body (do **not** clip with `numberOfLines`) · media column fills leftover height · footer CTA + dots |
| Media | `MediaPlaceholder` fills the leftover column (photo-sized area, no large empty bands). Real demo stills/clips replace it later; keep the dashed brief until then |
| Exit to auth | Last step → Sign in / Try demo / Create account → existing `/login` · `/signup` (login keeps `BackLink` → `/welcome`) |


### 7.10 Dates and times

One way to enter a day or a time, everywhere — booking, inquiry, change-time sheet, Meet & Greet, the sitter's schedule, care tasks. No screen invents its own.

| Part | Rule |
| :--- | :--- |
| **Layout** | A **date** field and a **time** field, in that order, each `[−] value [+]` (44 × 44 buttons, value between). Label above the pair ("Drop-off", "Pick-up"); a one-line error below, in `error`. |
| **Tap the date** | Opens the **calendar** sheet (`DayPickerSheet`): month grid, previous/next month, today's and the selected day marked, days before the earliest allowed day disabled. Tapping a day picks it and closes the sheet. |
| **Tap the time** | Opens the **clock** sheet (`TimePickerSheet`): hour · minute · AM/PM wheels, the same iPhone-style wheel everywhere. Set picks it and closes the sheet. |
| **− / +** | Stay on both fields, because they are the quickest way to nudge. **Date: one day** per tap. **Time: 15 minutes** per tap (crossing midnight moves the date). − is disabled at the earliest allowed value. |
| **Format** | Date `Oct 7` (add the year when it is not the current year, `Oct 7, 2027`); time `11:37 PM`; always the app time zone (America/Toronto), 12-hour with AM/PM. |
| **Limits** | The earliest allowed day/time is passed in (`min`): now for a new booking; the drop-off for a pick-up; the current offer for a change. An invalid pair shows the message ("Pick a time in the future.") and the sheet's primary button is disabled — it never silently changes the value. |
| **Several parts in one sheet** | When a sheet edits more than one date/time (Drop-off and Pick-up tabs), each part keeps its **own draft** while the user switches between them. **Send** (the one primary button) saves and sends everything that changed; **Close** or a tap on the backdrop discards the drafts and just closes. Nothing is stored or sent before Send. |
| **Finished things** | A handoff that already happened (Received / Returned) is shown as done and cannot be edited — disable or hide it, never let the server refuse it. |
| **Mouse** | Everything works by click; the wheels also take the mouse wheel and drag (§7.7). No native date/time pickers. |

Counts (number of pets, times a day) are the only thing that still uses the plain `Stepper`.

**Applies to (all of them, none left on the old stepper-only input):** Book care and the Ask-about-a-stay sheet (`HandoffPicker`), Change time or place and Suggest another time (`HandoffChangeSheet`), Meet & Greet (`MeetGreetSheet`), the sitter's schedule (`ScheduleSheet`), the care checklist's "Several times" (`CareLineBuilder`), care task times.

---

## 8. Imagery & icons

- **Logo:** Muk's gold tag (brand page v2.1, `frontend/assets/brand/`). In the app use `<BrandLogo />` (`components/BrandLogo.tsx`): the light lockup `goldito-lockup-light.svg` on web, app icon + name on native. Never re-type the name as text with an emoji. Favicon: `goldito-favicon-48.png` (`app.json`).
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

1. Read design values through `useTheme()` / `useThemedStyles(makeStyles)` from `frontend/providers/ThemeProvider.tsx` — in screens and `components/ui`, never import `tokens` directly (only `components/shell/` does, because it renders outside the provider). **Never hardcode** hex colors, font sizes, or spacing numbers. Pattern: a module-level `const makeStyles = (theme: Theme) => StyleSheet.create({...})`, then `const styles = useThemedStyles(makeStyles)` in the component.
2. Wrap screens in `Screen`; group content in `Card`; use `Button` for actions; use `BackLink` for back (§7.8). Extend these before creating new primitives.
3. If you need a **(proposed)** token, add it to `tokens.ts` in the same change and mention it in the PR. A new color that skins should change also goes into `SkinColors` in `themes.ts`; status colors never do (§3.1).
4. Follow §7 patterns: one primary action, no sitter text fields, loud DANGER, empty states with copy.
5. Show both dogs and cats in placeholder content.
6. If a screen has a Figma frame, the Figma frame wins over this file.
7. The UI must work inside the desktop phone frame with a mouse (§2.1, §7.7): no gesture-only actions, no pull-to-refresh-only updates, no native-only libraries (date/time pickers, swipeable rows).
8. Branch layout only with `useLayoutMode()` — no `Platform.OS` or width numbers in screens. Pick photos only through `pickMedia()`.
9. **Working from Figma:** read §0 first. Status labels use `Tag`, edge-state notices `Banner`, round pictures `Avatar` — never a local look-alike. One Figma component = one code file, named like Figma.
10. **Every action has a `testID`** named for what it does (`book-care`, `cancel-confirm`). Keep it when a button moves or its label changes; when you remove one, `grep` it in `frontend/e2e` and fix those tests. After changing a screen run `node scripts/screen-map.mjs` in `frontend/` and commit `docs/design/screen-map.md` (CI checks it).

---

## Open items for the designer (Figma)

Done in Figma and synced: palette incl. `warning` and the `*Surface` tints, the `Balanced` mode, base components (Button, Text Button, Chip, Tag, Avatar, Banner, Text Field, Segment, Checkbox Row, Empty State), the gold tag logo. Still open:

- [ ] Code-only tokens as Figma variables (§0.2)
- [ ] Final type scale (`subtitle` or not, §0.7); the app keeps the system font (D6)
- [ ] Icon set
- [ ] App icon at 1024 px (only the 180 px touch icon and favicons are in `assets/brand/`)
- [ ] 🟡 / ❌ components in §0.4 (Tab Bar Snap label, Switch, Skeleton, Filter Chip, …), ProposalCard, ReportCard
- [ ] Report themes (4) + preset sticker set (Phase 11.8)
- [ ] Welcome / Login screens ([#13](https://github.com/minsikpaul92/Pawddy/issues/13))
- [ ] Figma frames at **402 × 874**; spot-check at 360 and 440
- [ ] Desktop backdrop, side panel, and phone-frame style (§2.1)
- [ ] Sample photo set for the demo tray: dog / cat daily photos + treat labels with fictional brands (§8)
