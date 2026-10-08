# Goldito — Design Guide

> **Status: interim draft — everything here is temporary.** Colors, type, spacing, components, and patterns are placeholders so development can start. The designer will finalize them (frontend built with AI assistance, details refined in Figma) and replace this file.
> Until then, values come from [`frontend/theme/tokens.ts`](frontend/theme/tokens.ts) (base) and [`frontend/theme/themes.ts`](frontend/theme/themes.ts) (skin presets); code reads them through `useTheme()`. When Figma is ready, Figma Variables become the source of truth: update `tokens.ts` / `themes.ts` first, then this file.
>
> Source of truth order: **Figma** (when available) → **`tokens.ts`** → **this file**.
> Items marked **(proposed)** are not in `tokens.ts` yet — add them there before using them in code.

This file is written for both people and AI coding agents. Before building any screen, read it and follow the rules in [For AI agents](#for-ai-agents).

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
| `?view=split` (Phase 10.10, stretch) | Owner and Sitter phones side by side |

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
| `surface` | `#FFFFFF` | | Cards, sheets, modals |
| `text` | `#1A1A1A` | 🔒 fixed | Primary text |
| `textMuted` | `#5C5C5C` | | Secondary text, timestamps, helper copy |
| `primary` | `#2D6A4F` | ✅ | Primary buttons, active tab, links, checkmarks |
| `primaryText` | `#FFFFFF` | ✅ | Text/icons on `primary` |
| `accent` | `#D8F3DC` | ✅ | Soft highlight behind selected chips and badges (text on it uses `text`) |
| `border` | `#E5E5E0` | | Card borders, dividers, input outlines |
| `overlay` | 40 % `text` | | Dimmed backdrop behind modals and sheets |
| `success` | `#067647` | 🔒 fixed | Done states, SAFE result |
| `error` | `#B42318` | 🔒 fixed | Form/API errors, **DANGER** safety result |
| `warning` | `#B54708` | 🔒 fixed | WARNING safety result, "needs your OK" handoff badge |
| `warningSurface` **(proposed)** | `#FFFAEB` | Background of warning banners |
| `errorSurface` **(proposed)** | `#FEF3F2` | Background of DANGER modal body / error banners |
| `successSurface` **(proposed)** | `#ECFDF3` | Background of SAFE result / success toast |

Rules:
- `error` red is reserved for real problems (failed actions, DANGER). Do not use red for decoration or "cancel" buttons.
- Status is never color-only — always pair color with an icon or text (e.g. ⚠️ + "Contains chicken").

### 3.1 Themes (pet skins)

A theme preset in `themes.ts` may change **only** the ✅ colors (`primary`, `primaryText`, `background`, `accent`). The 🔒 colors (`text`, `error`, `success`, `warning`) never change, so a DANGER warning can't blend into a skin. Today there is only `default`; the coat-color presets (6–8, from the designer) and choosing them per pet arrive in Phase 11.10.

---

## 4. Typography

System font for now (Figma will pick one family).

| Token | Size | Weight | Use |
| :--- | :--- | :--- | :--- |
| `fontSize.title` | 24 | 700 | Screen title, pet name on profile |
| `fontSize.subtitle` **(proposed)** | 18 | 600 | Card titles, section headers |
| `fontSize.body` | 16 | 400 / 600 for buttons | Body text, buttons, list rows |
| `fontSize.small` | 14 | 400 | Timestamps, helper text, chips |
| `fontSize.caption` **(proposed)** | 11 | 600 | Slot letters (M · A · N) inside `SlotCalendar` day cells only |

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
| `icon.sm` | 22 | Header and inline icons, radio marks |
| `icon.md` | 28 | Icons inside cards (role cards) |
| `icon.hero` | 40 | Emoji / illustration at the top of an empty state |

- Cards use a 1 px `border`, no heavy shadows.
- Minimum touch target: **44 × 44**.

---

## 6. Components

### Existing (`frontend/components/ui/`)

| Component | Rules |
| :--- | :--- |
| `Screen` | Wraps every screen: safe area, scroll, `background`, 16 padding, max width 480 |
| `BackLink` | Standard back control: `chevron-back` + label **Back** (`primary`, 600, 44 min height). Use for login → Welcome, signup → previous, onboarding step-back / exit. Label stays **Back** — never “Back to Onboarding” or other destination names. See [§7.8](#78-back-navigation) |
| `MediaPlaceholder` (`components/`) | Onboarding photo/video slot (~4:3, dashed `accent` frame). Centered in leftover tour height; title + brief for Muk’s asset brief. Replace with real media later — see [§7.9](#79-welcome--role-onboarding) |
| `Card` | `surface`, `radius.lg`, 16 padding, 1 px `border` |
| `Button` | Primary only for now: `primary` fill, `primaryText`, `radius.md`, 600 weight, pressed = 0.9 opacity, disabled = 0.5 opacity |
| `TextButton` | Secondary action as a `primary`-colored text link (44 tall) — keeps one filled button per screen; `danger` = `error` color for destructive links (Cancel booking) |
| `TextField` | Label above, `surface` input with 1 px `border`, `radius.md`, 44 min height; focus = `primary` border, error = `error` border + message below. An optional **hint** goes on the label line, right after the label: `small`, `textMuted` at reduced opacity, regular weight (e.g. **Meals** `what to give or do (empty = the hint)`). Never join label and hint into one string with a dash |
| `EmptyState` | `icon.hero` emoji + title + one line saying what appears here and who adds it + optional action |
| `LoadingView` | Full-screen centered spinner (`primary`) while the session or a screen loads |
| `RoleCard` (`components/`) | Big tappable role choice (radio): icon + title + one line; selected = `primary` border + `accent` fill. Sign up now, Welcome later (OB.2) |
| `Chip` | `radius.sm`, `small` text, 1 px `border`; optional ✕ remove button (`Remove <label>`). Allergens now; task type, mood, slot later |
| `SegmentedControl` | 2–4 options as 44-tall segments (radio); selected = `primary` border + `accent` fill; `disabled` for locked values (pet species, D22) |
| `Toast` (`useToast()`) | Bottom, above the tab bar, auto-hide 3 s. Success after actions ("Max is added 🐶", "Profile saved ✅"). **Never** used alone for DANGER |
| `PetCard` (`components/`) | Owner Home: round species avatar (🐶 / 🐱 on `accent`) + name + "Dog · Maltese · 4 yrs · 3.2 kg" + allergy chips; tap → pet profile |
| `PetForm` (`components/`) | Add pet / Pet profile: species (locked after creation), name, breed, birthday (`YYYY-MM-DD`), weight (kg), allergies (chip input, stored lowercase), notes |
| `Sheet` | Bottom sheet (RN `Modal`, stays in the phone frame): title + **Close**, backdrop click closes (never use a sheet for DANGER — §7.4), scrolling body, pinned footer for the one primary action. No drag |
| `Stepper` | − value + (44 × 44 buttons) — counts (pets, times a day). **Not for dates and times** — those use `DateField` / `TimeField` (§7.10). The stand-in for native pickers (§7.7) |
| `CheckRow` | Checkbox + label (+ hint line) as one 44-tall click target; `aria-checked` for screen readers |
| `SitterCard` (`components/`) | "Your sitters" row (3B.2): initial on `accent`, name, area · years, note ("2 bookings with you"), service chips (🏠 Boarding / 🔑 House sitting); tap → sitter profile |
| `HandoffPicker` (`components/`) | Book care drop-off / pick-up (3B.3): day stepper (± 1 day), time stepper (± 15 min), place as radio rows = who drives (🚗 I'll drive — at Chloe's place / 🚙 Chloe picks up — at my place / 📍 Somewhere else + "Where to meet") |
| `BookingCard` (`components/`) | Owner booking row (3B.3): sitter, pets with species emoji, drop-off / pick-up time · place label (never the address), status badge with text (Requested · Time suggested by Chloe · Confirmed · Declined · Cancelled — find a new sitter) |
| `ProposalCard` (`components/`) | One open handoff offer (3B.5), `warning` border: the other side's "Chloe suggested a new drop-off · Oct 5, 10:00 AM · Chloe's place" with **Accept** (filled) + Suggest another time + Decline (`danger` link), or my own "Change pending — until Chloe agrees, it stays at …"; history line "You: 9:30 AM → Chloe: 10:00 AM" |
| `HandoffChangeSheet` (`components/`) | Sheet for a new handoff time (Drop-off / Pick-up switch, day ± 1, time ± 15 min); after confirm also the place (radio rows) — **Change time or place** |
| `SlotCalendar` (`components/`) | Sitter schedule month grid (3B.1): Sunday-first weeks, three slot letters M · A · N per day — open = `accent` fill, full = `primary` fill, blocked = outlined + struck-through, closed = faint outline; legend below. Past days disabled; range = two clicks |

### Planned (build as needed, keep the same tokens)

| Component | Notes |
| :--- | :--- |
| `DateField` / `TimeField` **(proposed)** | The one way to enter a day or a time — [§7.10](#710-dates-and-times). `[−] value [+]`; tapping the value opens the calendar (`DayPickerSheet`) or the clock (`TimePickerSheet`) |
| `RoleBadge` **(proposed)** | The green pill that says **Owner** / **Sitter** in the header, as its own component. Shown next to a person's name wherever it would otherwise be unclear who they are (booking card and detail, inquiry thread, request cards): the other person gets the badge of *their* role. Same colors, shape and type as the header pill — never plain text like "(sitter)" |
| `Button` variants | `secondary` (white + `border`), `danger` (`error` fill, only for destructive confirms), `large` (full-width, 56 tall — the one primary action on sitter screens) |
| `AlertModal` | Safety results — see [§7.4](#74-danger-is-loud) |
| `TabBar` | Per role; [architecture §3](docs/plan/phases/architecture.ko.md) **D47 / D47b**: both **Home · Bookings · Feed · Diary · Mood**. Settings (and sitter Earnings later) = header Profile |
| `PetAvatar` | Round photo, species fallback icon (🐶 / 🐱) — `PetCard` draws the fallback today; photos come with pet avatars (11.10) |
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

---

## Open items for the designer (Figma)

Everything above is a placeholder until these are decided.

- [ ] Font family and final type scale (incl. `subtitle`)
- [ ] Final palette, including `warning` and the `*Surface` tints
- [ ] Icon set
- [ ] Logo and app icon
- [ ] Button variants, Chip, Toast, AlertModal, EmptyState, TabBar, ProposalCard, ReportCard
- [ ] Report themes (4) + preset sticker set (Phase 11.8)
- [ ] Welcome / Login screens ([#13](https://github.com/minsikpaul92/Pawddy/issues/13))
- [ ] Figma frames at **402 × 874**; spot-check at 360 and 440
- [ ] Desktop backdrop, side panel, and phone-frame style (§2.1)
- [ ] Sample photo set for the demo tray: dog / cat daily photos + treat labels with fictional brands (§8)
