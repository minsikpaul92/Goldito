# Goldito — Design Guide

> **Figma is the source of truth.** Muk's [Goldito-Design](https://www.figma.com/design/stZjrJJU6KOhLauxPjaV8l/Goldito-Design) file (Variables, text styles, 65 components, screens) and the [brand site](https://mooque-dev.github.io/goldito-design/brand.html) decide how Goldito looks and behaves. This file is the **bridge**: [§0](#0-figma--code-read-first) says where every Figma piece lives in the code; §1–§9 are the rules the code follows. When Figma and this file disagree, Figma wins — then update this file.
>
> Source of truth order: **Figma** → **`frontend/theme/tokens.ts` / `themes.ts`** → **this file**. Items marked **(proposed)** are not in `tokens.ts` yet — add them there before using them in code.
> Every design decision and its reason is in the [Decision log](#decision-log) (D1–D10).

This file is written for both people and AI coding agents (including the designer's agent working with the Figma MCP). Read §0 first, then follow [For AI agents](#for-ai-agents).

---

## 0. Figma ↔ code (read first)

### 0.1 The four places

| What | Where | Who changes it |
| :--- | :--- | :--- |
| Look (colors, sizes, type, components, screens) | Figma [Goldito-Design](https://www.figma.com/design/stZjrJJU6KOhLauxPjaV8l/Goldito-Design) — pages **Components** and **Screens** | Muk |
| Design values in code | [`frontend/theme/tokens.ts`](frontend/theme/tokens.ts) (Figma Color mode `Default` + Size + Motion) · [`frontend/theme/themes.ts`](frontend/theme/themes.ts) (one preset per other Color mode) | whoever syncs Figma → code |
| Base components | [`frontend/components/ui/`](frontend/components/ui/) — one file per Figma base component (§0.4) | same |
| Every screen and every button | `docs/design/screen-map.md` — **generated, not committed** (git-ignored): route → file → each action's label, ID and line (§0.6). Build it with `cd frontend && node scripts/screen-map.mjs`; CI builds it too and attaches it to the run | never hand-edited |

**The Figma file since Oct 19:** Expressive is the look. The **Screens** page holds the Expressive sections plus "In the app · Oct 19" (what PRs #177, #178 and #183 built); the older Balanced and Live screens are on the **Archive** page. The logo is the pixel coin (**Brand** › `Logo/Pixel coin/Gold/Symbol master`, code `frontend/assets/brand/goldito-symbol.svg`). Most components and screens are built by the Goldito plugin from the HTML prototypes, so a fix goes into the prototype or the plugin's capture rules (`design/figma-plugin/README.md`), never only into the Figma output. Those rules: a label alone in a button or pill fills it; one-line labels hug; stacked text blocks and form fields are auto-layout (one-line fields cut long text with "…"); icons in circles are centred; steppers stack first on top.

Code reads design values only through `useTheme()` (≈ 2,000 style references). Changing a value in `tokens.ts` changes every screen; no screen needs a separate edit for a color, size or type change.

### 0.2 Variables → tokens

Every Figma variable carries its code name as **code syntax** (Figma uses kebab-case, code camelCase): `color/text-muted` → `theme.color.textMuted`. Keep the code syntax filled on every new variable — it is the link.

| Figma collection | Code | Note |
| :--- | :--- | :--- |
| **Color**, mode `Default` | `tokens.color.*` | The base theme |
| **Color**, any other mode (`Balanced`, later one per pet coat skin) | a preset in `themes.ts` (`balanced`, …) | A mode may change only the `SkinColors` keys (§3.1); status colors are the same in every mode |
| **Size**: `spacing/*`, `radius/*`, `icon/*`, `font-size/*`, `size/touch-target`, `layout/*` | `tokens.spacing`, `radius`, `icon`, `fontSize`, `layout.touchTarget`, `layout.*` | |
| **Motion**: `duration/*`, `press/scale`, `press/opacity` | `tokens.motion.fast/base/slow`, `pressScale`, `pressOpacity` | |
| Text styles `Title`, `Section`, `Body`, `Body Strong`, `Small`, `Small Strong`, `Caption`, `Button`, `Eyebrow`, `Placeholder` | `fontSize.*` + `fontWeight.*` + `lineHeight.*` (§4) | Font family: Fredoka for titles, Plus Jakarta Sans for everything else (D11). The Figma text styles use the same families since Oct 23 |

**Code-only tokens — add them to Figma as variables** so both sides have them: `color/media`, `color/on-media`, `color/gold`, `color/gold-on-light`, `color/cream`, `font-weight/*` (400 · 500 · 600 · 700), `line-height/*` (14 · 20 · 22 · 30), `opacity/pressed` (0.7), `opacity/disabled` (0.5).

### 0.3 Sync steps (Figma → code)

1. Change the Variables / components in Figma first.
2. Read them with the Figma MCP: `get_variable_defs` on a node (or a read-only `use_figma` over `figma.variables`) for values; `get_design_context` on a component for its layout.
3. Update `tokens.ts` / `themes.ts` (values only — keep the keys; a new key gets added to both Figma and code in the same change).
4. Update the matching file in `components/ui/` (§0.4) — never restyle a screen to fake a component change.
5. Screens last, one at a time, against the Figma frame (§0.5).
6. `cd frontend && npx tsc --noEmit`. The screen map is not committed: run `node scripts/screen-map.mjs` when you want to look something up (it writes the git-ignored `docs/design/screen-map.md`); CI builds it on every run.
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
| Booking Card / Stage Card | `components/BookingCard.tsx`, `components/BookingStageBar.tsx` (steps Request · M&G · Confirm · Pay · Care; a small word under a step: Scheduled, Trip, Skipped, #237) | ✅ |
| Booking Ticket | `components/BookingTicket.tsx`: the stay's big card (dates, the five steps, drop-off and pick-up, paid). It lives on **Home** for owners and sitters (the stay in care, else the next paid one, `homeStay`); the Bookings tab lists every booking as a `BookingCard` row (Oct 25) | ✅ |
| Stay Summary Card | `components/StaySummaryCard.tsx` | ✅ |
| Latest Update Row | `components/home/LatestCard.tsx` | ✅ |
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
| Tab Bar / Tab Bar Item | `components/RoleTabs.tsx` — Home · Bookings · Chat · Moments · **Snap**, in the app and in Figma (D61, D19) | ✅ |
| Top Bar / Icon Button | `expo-router` headers + `components/HeaderActions.tsx`, `components/NotificationBell.tsx`, `components/HeaderMenu.tsx` | ✅ |
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

Routes follow `expo-router` files (`frontend/app/`): `app/owner/(tabs)/bookings.tsx` is `/owner/bookings`. The full list with every button is the generated screen map (`node scripts/screen-map.mjs` in `frontend/` writes `docs/design/screen-map.md`; it is not committed).

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
| Onboarding · Welcome / How it works / Log in | `/welcome`, `/welcome/how` (`/welcome/owner` and `/welcome/sitter` redirect there), `/login` |
| Onboarding · Create account / Add your pet | `/signup`, `/owner/pets/new` |
| Onboarding · Your look, Health & care, Notifications, Permission prompt | not built (OB.4 on hold; 11.15 pet onboarding) |
| Sitter setup · Services & rates, House rules, Availability, Live profile | `/profile`, `/sitter/schedule` |

**Name new Figma frames `<Role> · <Screen>` and put the route in the frame description** (e.g. `/owner/bookings`), so a frame and its file find each other in one step.

### 0.6 UX changes: move, merge, remove

UX can change, not only the look: a button moves to another screen, two actions merge, a section disappears. The code is set up so this is safe to plan and quick to find:

- **Every action has a stable ID** (`testID`), e.g. `book-care`, `cancel-confirm`, `demo-owner` — 321 of 321 today. The ID names *what the action does*, not where it sits, so it stays the same when the button moves.
- **The screen map** (`docs/design/screen-map.md`, generated and git-ignored: run `node scripts/screen-map.mjs`) lists, per screen, the components it shows and every action with its label, ID and line. Search it for a label from a Figma frame ("Book care") or an ID to land on the file and line.
- The e2e tests (`frontend/e2e/`) find actions by these IDs, so `grep -rn "<id>" frontend/e2e` shows which tests depend on an action before you move or remove it.
- **Screens are thin**: data and logic live in hooks and API files (`features/<domain>/use*.ts`, `*Api.ts`); the route file mostly arranges components. Moving a button = moving its JSX and calling the same hook in the new place.

| UX change | How |
| :--- | :--- |
| Move an action to another screen | Move the JSX (keep its `testID`), call the same hook / API in the new screen, update the e2e test's navigation |
| Merge two actions | Keep one `testID` (the surviving action's), delete the other, update its tests |
| Remove an action or section | Delete the JSX; `grep` its `testID` in `frontend/e2e` and delete or update those tests; delete the hook only if nothing else uses it |
| Rename a label only | Change the `label`; the `testID` stays |
| New action | Add a `testID` named for what it does (`<thing>-<verb>`, kebab-case) |

After any of these there is nothing to regenerate in git: the screen map is built fresh when you run `node scripts/screen-map.mjs` and by CI.

### 0.7 Not decided yet

- **Skins and text** — `Balanced` also tints `text` / `text-muted`; the code allows that only for dark, readable values (§3.1).
- **18 px subtitle** — §4 proposes it; D6 says four sizes. One of them changes.

---

## Decision log

Each design decision, its reason, and what it replaced. Change a row only with the team; add new rows at the end. The visual version is the *Design review* page in the prototypes (`design/concept-prototypes/review.html`).

| ID | Decision | Why | Instead of |
| :--- | :--- | :--- | :--- |
| **D1** | **Balanced** is the recommended app look; Playful lives in the prototypes only (Oct 6). *Pending team OK.* | Closest to the code tokens, so it costs almost no code. Playful changes outlines, shadows, corners and fonts — too much to build and test before Oct 28 | Calm Core (dropped Oct 5: Balanced covers its calm tone) |
| **D2** | Components first; screens are built only from component instances, with the same names as code | Edit once, every screen updates. A Figma name tells you the code file | Screens drawn or captured as loose layers |
| **D3** | Status text sits on its own light surface (`errorSurface` …) through `Tag` and `Banner` | Faded (opacity) status colors failed 4.5:1 ("red on red") | Opacity tints of `error` / `warning` |
| **D4** | `borderStrong` outlines every control; `border` is decoration only; `track` is the empty part of progress | `border` is 1.3:1 on white — inputs and chips were nearly invisible (WCAG 1.4.11 needs 3:1) | One `border` for everything |
| **D5** | When AI is unsure: **safety fails closed** (don't feed), everything else **falls back to a person** (sitter answers, confirm by eye, plain chips) | A wrong "safe" can hurt a pet. A blocked handoff or missing caption only slows people down | One generic error for every AI failure |
| **D6** | *Replaced by D11 (Oct 22).* App uses the **system font**; Figma uses Inter as its stand-in. Four sizes: 24 · 16 · 14 · 11 | No font download on the demo, native feel; Inter's metrics are close to SF / Roboto. Card titles use Body Strong, so the 18 px size was never needed | A brand font; `fontSize.subtitle` 18 |
| **D7** | One press feel (scale 0.97 + opacity 0.85) and three durations (120 · 240 · 420 ms); decorative motion stops under Reduce motion | Consistent, cheap to build, accessible | Per-component animation values |
| **D8** | Never lose a sitter's tap: offline check-ins and photos queue on the phone and send on their own | Sitters work on walks with weak signal; "No typing for sitters" fails if taps get lost | Error toast + retype |
| **D9** | Facts the AI learns during a stay enter the Life Record only after the owner confirms; ratings of 1–2 stars stay private | The Life Record feeds future AI replies (RAG) — a wrong fact would repeat forever | Auto-publishing everything |
| **D10** | A sitter's reply in the inquiry thread shows as the sitter's own message (name + time); the AI warning lives only in the sitter's draft view | Matches D36; owners trust the sitter, not a bot | "Auto-reply from the assistant" label on every bubble |
| **D11** | **Plus Jakarta Sans** for all text except titles; **Fredoka** (600) for screen, tab and section titles, one-question headings and big numbers (Oct 22, #304) | One friendly family that matches Figma's Expressive parts; Fredoka is the logo's face. Web only for now; native keeps the system font until the native app ships | D6: the system font, with Inter as Figma's stand-in |
| **D12** | **Lucide** line icons, always through `components/ui/Icon.tsx`, named by meaning (`home`, `bell`, `back`), never by Lucide name (Oct 22, #301, #323) | Friendlier line, has a dog and a cat, covers every concept; one table to change if the set changes | Ionicons (`@expo/vector-icons`) |
| **D13** | **Header C**: the tab title with "Name · Role" under it, the bell, and your avatar, which opens the menu drawer; no role chip (Oct 22, #294) | Shows who is signed in on every tab, which matters with two roles in split view | #147 option B: role chip, bell and a ≡ menu button |
| **D14** | **Back, close and leave** follow one rule set: Back goes back, Close dismisses, the primary button finishes; one back per screen; typed input is never dropped silently (§7.8, Oct 25). *Proposed, pending team OK on U1 to U4.* | The audit found 19 different back and close behaviours, three backs on one screen, and sheets that lose a typed note on a scrim tap | Each screen choosing its own back |
| **D15** | **Feedback surfaces** are picked by job: field errors inline, screen problems in a Banner, quick results in a toast with a tone, decisions in an ErrorDialog; destructive acts ask in a Sheet with a `danger` button, reversible ones offer Undo (§7.11, Oct 25). *Proposed, pending U5 to U9.* | About 30 failures showed a green success check; errors used five surfaces for the same job; Cancel booking had no danger style while Sign out did | Toast, dialog or red text chosen per screen |
| **D16** | **Actions and forms**: the pinned primary uses `Screen footer`; one word per job (Save, Done, Next, Send, Delete); sheet actions sit in the sheet footer; one control per kind of choice (§7.12, Oct 25). *Proposed, pending U10 to U12.* | Footers were built four ways, "Done" meant four things, and pets were picked six ways | Per-feature controls and labels |
| **D17** | **Moments, decided by Minsik (Play and Pick, Oct 25)**: the pet picker sits in the tabs and Moments opens on all pets; the tab is **Moments**; the Diary has Days, Calendar and Footprints; a sticker is seen only by its maker; owners ask for a photo only in Chat; a sitter's diary page starts shared; the paw shortcut menu waits until after the freeze; words are a little playful (toasts and empty states only) | Nine calls tried in the Moments trial and voted on one page | The Feed trial's earlier picks (filter-chip picker, a shared sticker box, an Ask link in Moments, pages kept until shared) |
| **D18** | **UX calls, decided by Mook (Oct 25)**: U1 A, U2 C, U3 B, U4 A, U5 A, U6 A, U7 A, U8 B, U9 A, U10 A, U11 A, U12 A (§7.13). Back was the chevron + Back (U1 changed by D20); typed input is kept as a draft in long flows and a sheet asks before dropping it; Undo is 6 s; Accept is the one yes word | Twelve calls from the UX audit, drawn as phone screens and picked on one page | Icon-only Back; dropping typed text silently; per-card primaries |
| **D19** | **Snap and the coin, settled (Mook, Oct 25)**: the fifth tab is **Snap** (treat check · mood · stickers), in the app (#341) and in Figma's Tab Bar; the logo is the **pixel gold coin with a paw** plus "Goldito" in the display face (decided Oct 19). The gold tag, Notebook and Pixel stay on the brand site as other directions, for reference | Both were still listed under §0.7 although the app and Figma had moved on | Mood as the tab name; the gold tag as the logo |
| **D20** | **Words and playful words (Mook, Oct 26)**: Log in / Log out everywhere; the sitter's daily write-up is a Diary page; puns come only from `content/words.ts` through `useWords()`, and Settings → Playful words turns them off | The copy audit: log in, sign in and sign out mixed; the write-up called Diary, report, daily note and page; puns typed into four screens (cats got Paw-fect!) with no way to turn them off | Sign in / Sign out; "daily report"; hard-coded puns |
| **D25** | **Back is the ← arrow alone (Mook, Oct 25)**: one control everywhere, top left, 44 × 44, read aloud as Back, no visible word; `Icon name="arrowBack"` in `BackLink`, `StepHeader` and `StepFrame`, and the native header in minimal mode. Replaces U1 A | "‹ Back" crowded the sign-up step header next to its progress bar; the arrow is what ~37 native headers already showed, and what #383 proposed | Chevron + the word Back (U1 A) |
| **D21** | **Sign out asks in a sheet (Mook, Oct 26)**: the menu and Settings both confirm Sign out in a bottom sheet, as #387 built it. Replaces U5 A | The sheet shipped (#387) before U5 was built; one sheet in both places is already consistent, and signing out of a demo account by accident costs a judge the stay | No confirm (U5 A) |
| **D23** | **The booking stepper says skipped and under way with dashes (Mook, Oct 27)**: a Meet both agreed to skip is a **dashed circle with »** (`Icon name="skipped"`), still dashed links on both sides and a grey Skipped pill; the link into the step under way is **dashed and flows toward it**, and done links stay solid. Reduce motion keeps the dashes still. `BookingStageBar` | Skipped showed a "–" in a done circle, and the step under way differed from the rest only by a bolder label | A grey solid circle for Skipped (4 A); a turning dashed ring or three dots for the step under way (5 M2, M3) |
| **D24** | **Meet is the one word (Mook, Oct 27)**: steps, buttons, toasts, chat lines and notices say **Meet** ("Schedule a meet", "Skip the meet", "Robert agreed to meet"). The full name **Meet & Greet** appears only where it is explained: How it works ("A Meet & Greet; notes become a checklist"), Terms, and the calendar invite read outside the app | Meet & Greet, M&G and Meet were mixed, and "Meet & Greet" does not fit a step label (#237) | Meet & Greet everywhere; Meet with no explanation anywhere (6 A) |
| **D26** | **The 5-second check folds and docks, with the mood on faces (Mook, Oct 27)**: a group with an answer folds to one line ("Meal · All ✓", tap to reopen); Mood picks from the pet's own pixel faces, four across with the word under each (`PetMoodFace`); a dock with the Ready chips and **Send to <owner>** stays pinned at any scroll | The check was one long column; Send and what goes out scrolled out of view, and moods were words only | Mood as words (1 A) |
| **D27** | **Notifications are day cards (Mook, Oct 27)**: one card per day of the stay ("Today · Day 2 of 4 with Chloe"), rows with their own padding and space between them, unread = mint tint + bold title, a drawn icon per kind and no emoji, a pet's repeated check-ins folded into one row, and an action word (See, Read, Reply) on rows that need you | Unread rows ran together, emoji in every title, and routine check-ins buried the rows that need an answer | Rows that start with the pet's face (2 A2) |
| **D28** | **The Mood page leads with the answer (Mook, Oct 27)**: the pet's mood face, one sentence ("Max seems relaxed and a little sleepy") and the photo as a thumbnail, then the top three bars; the rest folds under "See all 8" | Eight bars and a big photo were hard to read at a glance | Three faces and no bars (P2); a face-a-day collection, kept for later (B) |

---

## 1. Product feel

Goldito is a private care app for **dogs and cats**. Owners hand their pet to a part-time sitter; the app keeps them updated without asking. One stay runs through five stages — Inquiry → Meet & Greet → Booking → Care & Pet Transit → Completion ([README](README.md#how-goldito-works)) — so screens should feel like one continuous journey (Rover booking × KidsNote care × Uber trip), not separate tools.

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
- **Content width: 370** (402 − 2 × 16). Full-width components (cards, rows, banners, fields) are built at 370 in Figma, and everything inside them fills or grows — never a fixed inner width — so they adapt from 360 to 440. Chat bubbles are 80 % of the content width.
- Bottom tab bar per role (owner / sitter). The primary action sits at the bottom of the screen, within thumb reach.
- The header shows who is signed in under the title, for example **Chloe · Sitter** (header C, D13). There is no role chip.
- **Avatar menu** (`components/HeaderMenu.tsx`): your avatar, in a thin `primary` ring, opens a full-width drawer that slides in from the right. You (→ Profile), Notifications with the count, Schedule (sitters), What's new, Settings, and Sign out pinned at the bottom; it asks in a bottom sheet (#387). Settings has Sign out with the same sheet (D21).

### 2.1 Desktop browsers (judges): phone frame

Judges open the demo URL on a computer. They must get the same experience as on a phone ([architecture D25](docs/plan/phases/architecture.md)).

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
| `border` | `#E5E5E0` | ✅ | Card borders, dividers (decorative only — too faint for controls) |
| `borderStrong` | `#86867F` | ✅ | Outlines of things you interact with: inputs, checkboxes, unselected chips and segments, switch off, star off. ≥ 3:1 on `surface`, `background` and `accent` (WCAG 1.4.11) |
| `track` | `#E5E5E0` | ✅ | Empty part of progress bars; `primary` fill stays ≥ 3:1 against it |
| `overlay` | 40 % `text` | | Dimmed backdrop behind modals and sheets |
| `media` | `#000000` | | Letterbox behind photos and videos in viewers |
| `onMedia` | `#FFFFFF` | | Text and icons on a photo, a video, or a solid status color |
| `gold` | `#F4C35A` | 🔒 brand | Logo tag, celebration moments — never text on a light background |
| `goldOnLight` | `#C9962E` | 🔒 brand | Small gold accents on light backgrounds (the logo heart) |
| `cream` | `#FBF6EA` | 🔒 brand | Warm expressive ground for brand moments |
| `success` | `#067647` | 🔒 fixed | Done states, SAFE result |
| `error` | `#B42318` | 🔒 fixed | Form/API errors, **DANGER** safety result |
| `warning` | `#B54708` | 🔒 fixed | WARNING safety result, "needs your OK" handoff badge |
| `warningSurface` | `#FFFAEB` | 🔒 fixed | Behind `warning` text: Tag, Banner, heads-up |
| `errorSurface` | `#FEF3F2` | 🔒 fixed | Behind `error` text: Tag, Banner, DANGER modal body |
| `successSurface` | `#ECFDF3` | 🔒 fixed | Behind `success` text: Tag, SAFE result |

Rules:
- `error` red is reserved for real problems (failed actions, DANGER). Do not use red for decoration or "cancel" buttons.
- Status is never color-only — always pair color with an icon or text (e.g. ⚠️ + "Contains chicken").
- Status text sits on its **surface** token (`error` on `errorSurface`, `warning` on `warningSurface`, `success` on `successSurface`), never on the solid status color and never on a faded (opacity) copy of it. Use the `Tag` component.
- `border` is decoration; anything you interact with uses `borderStrong`.

### 3.1 Themes (pet skins)

A theme preset in `themes.ts` (= one mode of the Figma Color collection) may change **only** the ✅ colors (`primary`, `primaryText`, `background`, `accent`, `surface`, `border`, `borderStrong`, `track`, `text`, `textMuted`); `text` / `textMuted` may only shift within dark, readable values. The 🔒 colors (`error`, `success`, `warning` and their surfaces) never change, so a DANGER warning can't blend into a skin. Today there are `default` and `balanced` (warmer neutrals, Figma mode `Balanced`); the coat-color presets (6–8, from the designer) and choosing them per pet arrive in Phase 11.10.

**Pet skins in the prototypes (proposed, 11.10).** The first-round prototypes ("Full journey") already try this: the onboarding *Your look* step reads the pet photo's coat color and picks the nearest of 7 presets — **Forest** (hue 152, sat 42 — the brand green) · **Amber** (40, 62) · **Clay** (16, 58) · **Umber** (26, 28) · **Slate** (210, 26) · **Plum** (280, 34) · **Rose** (350, 48). White, grey and black coats (saturation < 18) fall back to Umber (warm) or **Slate** (cool) — that's why a white Maltese shows a blue app there. Each preset's lightness is adjusted until text on it is ≥ 4.5:1. None of these are in `tokens.ts` yet. Goldito green is the default and is preselected; a coat color is only offered (never applied) and the owner picks it on the *Pick your colors* step (Figma: `Look Preview`, `Color Swatch`).

### 3.2 Looks (brand direction — pick one)

A **look** is the overall palette the team chooses once for the app; a **skin** (3.1) is the per-pet tint applied on top of it. Two looks remain after the Oct 5 review (Calm Core dropped). **Recommended: Balanced** (D1) — waiting for the team's OK before `tokens.ts` switches to it:

| Token | Balanced | Playful |
| :--- | :--- | :--- |
| `background` | `#F4F2EE` | `#FFF1D6` |
| `surface` | `#FFFFFF` | `#FFFDF7` |
| `text` | `#1F1B16` | `#231B12` |
| `textMuted` | `#5E5850` | `#5E4B33` |
| `border` | `#E6E1D9` | `#231B12` (ink outlines) |
| `borderStrong` | `#857E73` | `#231B12` |
| `track` | `#E6E1D9` | `#F2E2BD` |
| `accent` | `#DCEDE3` | `#FFE0A3` |

`primary`, `primaryText` and the status colors are the same in both. Every text pair is ≥ 4.5:1 and every control outline ≥ 3:1 in both looks (audited Oct 5). Figma (*Goldito Design System*) shows **Balanced** only; Playful also changes outlines, shadows, corners and fonts, so it lives in the clickable prototypes (`design/concept-prototypes/redesign/`) until the team picks a look.

**Expressive** is the app's look since Oct 18 (skin `expressive` in `themes.ts`, the default; `?skin=default` on web or `EXPO_PUBLIC_THEME=default` brings back the earlier look for debugging). Ink `#1B4332` text on cream `#FBF6EA`, mint accent, Fredoka for screen titles (`fontFamily.display`). Shape and chrome come from the skin's `theme.ui`, so components never check the skin name:

| `theme.ui` | Expressive | default |
| :--- | :--- | :--- |
| `radius.button` · `chip` · `segment` · `tag` · `stepper` | `pill` (999) | 12 · 8 · 12 · 8 · 12 |
| `radius.card` · `radius.block` | 16 · 24 | 16 · 16 |
| `chrome` (header bar) | cream | white |
| `stepperBorder` · `stepperPressed` | gold · butter | border · accent |
| `tabs` | `pill`: white bar, 26 top corners, mint pill behind the selected icon | `pushed` |
| `blocks` | on: tinted Card blocks and numbered stage dots on booking screens | off |

`Card tone` (`mint` · `peach` · `butter` · `blush`) is a tinted block with no border; stages use mint (Inquiry, Care), peach (Meet & Greet), butter (Booking). `ScreenHeader` is the large in-page title with an optional subtitle and right-side slots. The logo is the gold coin symbol (`assets/brand/goldito-symbol.svg`) plus "Goldito" in the display face.

---

## 4. Typography

**Fonts (D11, Oct 22):** **Fredoka** 600 for titles (`fontFamily.display` in the Expressive skin): screen and tab titles, section titles, one-question headings, big numbers, sheet titles. Never for paragraphs or buttons. **Plus Jakarta Sans** for everything else: body, rows, labels, chips, buttons, fields, toasts and tags. On web, `theme/bodyFont.web.ts` loads five weights (400 to 800) and every text without a named font becomes Jakarta, so `fontWeight` picks the face. Native keeps the platform's system font until the native app ships. Figma's text styles use the same families.

**One exception — the picture-diary page (12.4):** a sent daily report is drawn as a 그림일기 page (date + pet on top, the day's photo in a picture box, the words on ruled lines) in **Gaegu** (Google Fonts, SIL OFL), loaded on web only from `fonts.googleapis.com`; native keeps the system font. Body `fontSize.body + 4` on a 30 px rule. Nowhere else.

| Figma text style | Token | Size / line height | Weight | Use |
| :--- | :--- | :--- | :--- | :--- |
| Title | `fontSize.title` | 24 / 30 | 700 | Screen title, pet name on profile, big ETA |
| Body | `fontSize.body` | 16 / 22 | 400 | Body text, list rows, messages |
| Body Strong | `fontSize.body` | 16 / 22 | 600 | Buttons, card titles, section headers |
| Small | `fontSize.small` | 14 / 20 | 400 | Timestamps, helper text, banner body |
| Small Strong | `fontSize.small` | 14 / 20 | 600 | Chips, tags, field labels, banner title |
| Caption | `fontSize.caption` | 11 / 14 | 500 | Tab labels, slot letters, source tags — never body text |
| Section | `fontSize.section` | 21 / 26 | 600, Fredoka | Section titles (`SectionTitle`) |
| Placeholder | `fontSize.body` | 16 / 22 | 400, italic on web | Field placeholders in `color.placeholder` (Expressive `#807160`, 4.7:1); typed text stays upright, in `text` (#269) |

- Four sizes (D6). Whether to add an 18 px subtitle is still open (§0.7); until then card titles use Body Strong.
- Weights: `fontWeight.regular` (400), `medium` (500, Caption), `semibold` (600, Strong styles and row titles), `bold` (700, Title outside the Expressive skin) — never a raw `"600"` / `"700"` in code. With Jakarta: 400 body, 600 labels, 700 buttons, 800 eyebrows.
- Line height per Figma text style: `lineHeight.title` (30), `body` (22), `small` (20), `caption` (14).
- Sentence case for buttons and titles ("Complete with photo", not "COMPLETE WITH PHOTO"). Uppercase only for tiny eyebrow labels (Caption + letter spacing).
- Text must wrap, never clip: no fixed heights on text containers, and no `numberOfLines` on titles or messages (OS text size can reach 200 %). Names and labels may wrap to two lines.

---

## 5. Spacing & shape

| Token | Value | Use |
| :--- | :--- | :--- |
| `spacing.xs` | 4 | Icon ↔ label |
| `spacing.sm` | 8 | Between related lines, chip padding |
| `spacing.md` | 16 | Screen padding, card padding, gap between cards |
| `spacing.lg` | 24 | Between sections |
| `spacing.xl` | 32 | Top of screen / hero spacing |
| `radius.sm` | 8 | Tags, small thumbnails |
| `radius.md` | 12 | Buttons, inputs, banners, toasts |
| `radius.lg` | 16 | Cards, modals, photos in feed |
| `icon.sm` | 22 | Header and inline icons, radio marks |
| `icon.md` | 28 | Icons inside cards (role cards) |
| `icon.hero` | 40 | Emoji / illustration at the top of an empty state |

Line icons are **Lucide**, always through `components/ui/Icon.tsx` by meaning (`<Icon name="bell" />`), 2 px stroke in the colour the caller passes (D12). In Figma: Components › **Icons · Lucide (app set)**, one component per meaning with the same names (`Icon/bell`).
| `layout.touchTarget` | 44 | Minimum size of anything tappable |
| `layout.contentMaxWidth` | 480 | `Screen` content column on wide screens |

- Cards use a 1 px `border`, no heavy shadows.
- Minimum touch target: **44 × 44** (`layout.touchTarget`); content column at most `layout.contentMaxWidth` (480).
- Press / disabled feedback: `opacity.pressed` (0.7) and `opacity.disabled` (0.5).
- Motion: `motion.fast` (120 ms), `motion.base` (240), `motion.slow` (420); pressed buttons may use `motion.pressScale` (0.97) / `motion.pressOpacity` (0.85) as in Figma.
- Pills (chips, filter chips, avatars) use a full radius (999); everything else uses `radius.*`.

### 5.1 Motion

| Token | Value | Use |
| :--- | :--- | :--- |
| `motion.fast` | 120 ms | Press feedback, checkmarks, chip on/off |
| `motion.base` | 240 ms | Content appearing, toasts, sheet open |
| `motion.slow` | 420 ms | Celebrations (care started, home safe), progress fills |
| `motion.pressScale` | 0.97 | Every tappable scales to this while pressed |
| `motion.pressOpacity` | 0.85 | … and fades to this |

- Motion explains what happened (a check lands, a card appears); it never decorates.
- Under the OS **Reduce motion** setting, decorative motion stops and state changes are instant. Nothing depends on an animation finishing.
- No looping animation except the live dot, the typing dots and loading skeletons.

### 5.2 Elevation

Flat by default: cards are separated by `border`, not shadow. Only things that float above the page get a shadow: the bottom sheet, the toast and the desktop phone frame. Modals dim the page with `overlay` instead.

---

## 6. Components

### Existing (`frontend/components/ui/`)

| Component | Rules |
| :--- | :--- |
| `Screen` | Wraps every screen: safe area, scroll, `background`, 16 padding, max width 480 |
| `BackLink` | Standard back control: the ← arrow alone (`<Icon name="arrowBack" />`, `text` color, 44 × 44), read aloud as **Back**. Use wherever a screen draws its own top bar: Log in, How it works, Settings, What's new, Privacy, Terms. `StepHeader` and `StepFrame` draw the same arrow. See [§7.8](#78-back-close-and-leaving) |
| `MediaPlaceholder` (`components/`) | Onboarding photo/video slot (~4:3, dashed `accent` frame). Centered in leftover tour height; title + brief for Mook’s asset brief. Replace with real media later — see [§7.9](#79-welcome--role-onboarding) |
| `Card` | `surface`, `radius.lg`, 16 padding, 1 px `border` |
| `Button` | `primary` (filled) and `secondary` (`surface` + `borderStrong` border, `primary` label); `radius.md`, 44 min height, 8 / 16 padding, semibold label. Pressed = `motion.pressOpacity` + `motion.pressScale`; disabled = `border` fill + `textMuted` label (Figma Button, Style × State) |
| `TextButton` | Secondary action as a `primary`-colored text link (44 tall) — keeps one filled button per screen; `danger` = `error` color for destructive links (Cancel booking) |
| `TextField` | Label above, `surface` input with 1 px `borderStrong`, `radius.md`, 44 min height, 8 / 16 padding; focus = `primary` border, error = `error` border + message below. An optional **hint** goes on the label line, right after the label: `small`, `textMuted` at reduced opacity, regular weight (e.g. **Meals** `what to give or do (empty = the hint)`). Never join label and hint into one string with a dash |
| `EmptyState` | `icon.hero` emoji + title + one line saying what appears here and who adds it + optional action as a **secondary** button at its natural width (Figma Empty State) |
| `LoadingView` | Full-screen centered spinner (`primary`) while the session or a screen loads |
| `RoleCard` (`components/`) | Big tappable role choice (radio): icon + title + one line; selected = `primary` border + `accent` fill. Sign up now, Welcome later (OB.2) |
| `Chip` | `radius.sm`, `small` text, 1 px `border`; optional ✕ remove button (`Remove <label>`). Allergens now; task type, mood, slot later |
| `Tag` | Status label (Figma Tag): `small` semibold text on its tone's light surface, never a faded color (D3). `brand` (accent / primary) · `success` · `warning` · `danger` · `neutral` (surface + border). Information only, never tappable. Late or missed = `warning`; `danger` only for DANGER and failed payments. Used for booking status, task status, report sent, treat result. An optional Lucide `icon` sits before the label in the label's colour: `check` done, `clock` pending, `close` missed, `warning` heads-up (D12) |
| `Avatar` | Round (Figma Avatar): `initial` (`primary` + `primaryText` letter, people), `photo` (pet photo), `emoji` (species / tool emoji on `accent`). Default 40; cards use 56 |
| `Banner` | Inline notice for an edge state (Figma Banner): icon + title in the tone color + one line on what happens next + optional action. `info` (accent) · `warning` · `error` · `offline`. **Never for DANGER** — that is `AlertModal` (§7.4) |
| `SegmentedControl` | 2–4 options as 44-tall segments (radio); unselected = `borderStrong` border; selected = `primary` border + `accent` fill; `disabled` for locked values (pet species, D22) |
| `Toast` (`useToast()`) | Bottom, above the tab bar and any pinned footer, light green with a check icon (yellow tint with an alert icon for warnings), auto-hide 3 s. Success after actions ("Max is added", "Profile saved"). **Never** used alone for DANGER |
| `PetCard` (`components/`) | Owner Home: round species avatar (🐶 / 🐱 on `accent`) + name + "Dog · Maltese · 4 yrs · 3.2 kg" + allergy chips; tap → pet profile |
| `PetForm` (`components/`) | Add pet / Pet profile: species (locked after creation), name, breed, birthday (`YYYY-MM-DD`), weight (kg), allergies (chip input, stored lowercase), notes |
| `Sheet` | Bottom sheet (RN `Modal`, stays in the phone frame): title + **Close**, backdrop click closes (never use a sheet for DANGER — §7.4), scrolling body, pinned footer for the one primary action. Grab the handle or title bar: pull down closes (from full screen a short pull returns to normal height, a long one closes), pull up goes full screen. **Close** always stays |
| `Stepper` | − value + (44 × 44 buttons) — counts (pets, times a day). **Not for dates and times** — those use `DateField` / `TimeField` (§7.10). The stand-in for native pickers (§7.7) |
| `CheckRow` | Checkbox + label (+ hint line) as one 44-tall click target; `aria-checked` for screen readers |
| `SitterCard` (`components/`) | "Your sitters" row (3B.2): initial on `accent`, name, area · years, note ("2 bookings with you"), service chips (🏠 Boarding / 🔑 House sitting); tap → sitter profile |
| `HandoffPicker` (`components/`) | Book care drop-off / pick-up (3B.3): day stepper (± 1 day), time stepper (± 15 min), place as radio rows = who drives (🚗 I'll drive — at Chloe's place / 🚙 Chloe picks up — at my place / 📍 Somewhere else + "Where to meet") |
| `BookingCard` (`components/`) | Owner booking row (3B.3): sitter, pets with species emoji, drop-off / pick-up time · place label (never the address), status badge with text (Requested · Time suggested by Chloe · Confirmed · Declined · Cancelled — find a new sitter) |
| `PaidConfirmation` (`components/`) | Owner booking detail after checkout (FB-12): an `accent` card with `primary` border — **Booked and paid: $X CAD**, the drop-off time, "Nothing else to do. We'll tell you when {sitter} receives {pets}.", **Tap to dismiss**. It stays until tapped (remembered per booking on this device); the header chip row keeps a small `Paid` chip |
| `ProposalCard` (`components/`) | One open handoff offer (3B.5), `warning` border: the other side's "Chloe suggested a new drop-off · Oct 5, 10:00 AM · Chloe's place" with **Accept** (filled) + Suggest another time (no Decline on the card, #169: ending a booking is the screen's own Decline / Cancel), or my own "Change pending — until Chloe agrees, it stays at …"; history line "You: 9:30 AM → Chloe: 10:00 AM" |
| `HandoffChangeSheet` (`components/`) | Sheet for a new handoff time (Drop-off / Pick-up switch, day ± 1, time ± 15 min); after confirm also the place (radio rows) — **Change time or place** |
| `SlotCalendar` (`components/`) | Sitter schedule month grid (3B.1): Sunday-first weeks, the whole day cell split into three horizontal bands behind the date (from the bottom up: morning · afternoon · night — no letters) — one light diagonal hatch (`borderStrong` at 45%) covers the cell and an open band is a plain layer over it, so all bands share one pattern; a band is hatched when the slot can't be booked (blocked, full or not opened); white calendar card, no cell borders (the hatch alone marks a slot); legend "Available / Not available" with a faint outline on its two swatches; the reason is in the detail list under the calendar. Past days disabled and greyed, no hatch; range = two clicks, or press a day and drag across (mouse at once, finger after a long press so swipes still scroll; sitter schedule only). Hatch is CSS on web; native shows a flat `border` fill until `react-native-svg` is added |
| `ClosingRulesSheet` (`components/`) | Sitter schedule ⚙️ (header right): Sheet with a weekday × slot grid (Sun – Sat × Morning · Afternoon · Night; a tapped cell is filled + ✕ = closed every week; `aria-checked`), "Open everything", then the **Hours**: a chip row (Every day · Sun – Sat, a • on a weekday that has its own hours) picks which hours the three slot steppers edit (30 min steps, same as `ScheduleSheet`), "Same as every day" clears a weekday's own hours, and one **Apply** footer. Nothing picked = open. The sitter's result = rules + days closed by hand |

### In Figma (design file, *Components* page)

**65 components**, every fill, stroke, padding and radius bound to a variable; *2. Screens* uses only instances of them (D2). Groups: Core (`Tag`, `Button`, `Text Button`, `Chip`, `Card`, `Toast`, `Text Field`, `Segment`) · Live app (`Stay Summary Card`, `Booking Card`, `Timeline Row`, `Grid Photo`, `Next Task Card` …) · Navigation (`Top Bar`, `Tab Bar`, `Icon Button`, `Bottom Sheet`, `Empty State`) · Inputs (`Choice Card`, `Switch`, `Stepper`, `Filter Chip`, `Suggestion Chip`, `Photo Tile`, `Calendar Day`, `Checkbox Row`) · Stay (`Stage Card`, `Source Tag`, `Message Bubble`, `Quote Card`, `Checklist Row`, `Consent Card`, `Entry Info Card`, `Star`, `Profile Card`) · Care & transit (`Trip Map`, `Photo Check`, `Task Row`, `Progress Bar`, `Feed Card`, `Daily Note`, `Life Record Card`) · Feedback (`Alert Modal · DANGER`, `Banner`, `Notification Row`, `Skeleton`, `Avatar` …). `Demo Control` is prototype-only. Code has the `Existing` set plus the components marked *built* below; the rest arrive with their phases.

### Planned and recently built (keep the same tokens)

| Component | Notes |
| :--- | :--- |
| `DateField` / `TimeField` **(proposed)** | The one way to enter a day or a time — [§7.10](#710-dates-and-times). `[−] value [+]`; tapping the value opens the calendar (`DayPickerSheet`) or the clock (`TimePickerSheet`) |
| Role label next to a name | The header's **Owner** / **Sitter** is a `brand` `Tag`. Show the same Tag next to a person's name wherever it would otherwise be unclear who they are (booking card and detail, inquiry thread, request cards) — never plain text like "(sitter)" |
| `Button` variants | Built: `primary`, `secondary`, `danger` (`error` fill, only for destructive confirms). Proposed: `large` (full-width, 56 tall — the one primary action on sitter screens), Figma `Loading` state |
| `AlertModal` | Safety results — see [§7.4](#74-danger-is-loud) |
| `TabBar` | Per role; [architecture §3](docs/plan/phases/architecture.md) **D47 / D47b · D61 · D63**: both **Home · Bookings · Chat · Feed · Snap** (Chat = the chats with an unread badge, icon `chats` = square bubble with a paw; Feed = Photos · Diary switch; Snap = treat check · mood · sticker, icon `camera`). Settings (and sitter Earnings later) = header Profile |
| Pet photo avatars | `Avatar kind="photo"` once pets have photos (11.10); `kind="emoji"` (🐶 / 🐱) until then |
| `TaskRow` | Checkmark circle + title + time; pending first; tap → "Complete with photo" |
| `FeedCard` (built: `components/FeedCard.tsx`) | Photo/video (`radius.lg`), caption, time, optional mood chip |
| `ReportCard` | Daily report. P1: theme background + stickers (Phase 11.8) |
| `MessageBubble` | Inquiry thread (07B). Owners see the sitter's reply as the sitter's own message (no per-message AI label, D36) with source chips ("From Max's Life Record") and the quote card. The sitter's draft view carries the warning "AI drafts can be wrong. You're responsible for what you send." Auto-send mode shows "Chloe is typing…", then the reply (D37); a read marker appears only when the sitter really opens the thread |
| `QuoteCard` (built: `components/QuoteCard.tsx`) | Price breakdown (03C): nights × rate, extra pet, holiday lines, **Total** in bold, currency. Same component in the inquiry thread and checkout |
| `MeetGreetCard` (`components/`, built in 3B.9 with `MeetGreetSheet`) | Booking detail, first-time pairs only (03B, D44). Done / skipped collapse to one muted line; once agreed in person a local "Go over together" checklist (Care needs · Quirks · Route · Handoff · Heads-up; none for video, #229). States: to schedule (**Schedule Meet & Greet** · **Skip Meet & Greet**; the sheet's day opens the calendar and its time the clock, to the minute) → proposed → set (in person: spot + time / video: **Join Google Meet** opens a new tab + **Add to calendar**) → **Done, we met** (shown as soon as it is set; before the agreed time it asks "Did you already meet …?" first). A skip request shows the other side **Continue without meeting** and **Decline and cancel booking** |
| `ChipSuggestions` | Report screen (07, D38). AI-suggested chips in two rows: from today's records and from photos. Tap to turn a chip off or on, tap a value to change it. Wrong suggestions are expected, so turning one off is a single tap |
| `ConsentCard` (built: `components/ConsentCard.tsx`) | One consent: title, 3-line summary, **Read full text**, checkbox. Footer note "Demo template — not legal advice" |
| `EntryInfoCard` (built: `components/EntryInfoCard.tsx`) | Owner's entry info for the sitter (03C). Locked: 🔒 + "Unlocks Oct 9, 5:30 AM". Unlocked: **Show code** button, code hides again after 10 s. Never on a toast or notification |
| `ChecklistCard` (built: `components/ChecklistCard.tsx`) | AI checklist preview from a care request (06): editable rows (time · title · dose), delete, Heads-up chips |
| `TripMap` (web) | Leaflet + OpenStreetMap map (06B): auto-fits traveler + destination until the person drags it, **±** buttons and drag-pan (no wheel or pinch, so the screen still scrolls; on arrival the car sits on the pin). Shows OSM attribution. A "Sharing your location until you arrive" banner sits above it while sharing |
| `StarRating` | Five tappable stars (07C), large hit areas, keyboard and mouse |
| `LifeRecordCard` | Pet Life Record (07C): Eats · Meds · Potty · Behavior · Heads-up · Sitter tips, each line with its source ("From Chloe · Oct 9–12") |
| `Skeleton` | Gray blocks while loading; matches the final layout. After 10 s add "Still loading…" + **Retry** |
| `Tag` (built: `components/ui/Tag.tsx`) | Status label (Figma: Tone = Danger · Warning · Success · Brand · Neutral; code `tone="danger" …`). Text on the tone's surface (D3). Not tappable — for facts, allergies and statuses. Anything pressable or removable is a `Chip` |
| `Banner` | Inline notice at the top of the content for an edge state (§10). Tone = Info · Warning · Error · Offline. Icon + title (tone color) + one line saying what happens next + optional action link. Never for DANGER (§7.4) |
| `MediaPicker` (built: `components/MediaPicker.tsx`) | The only way to pick a photo (`pickMedia()`, Phase 04.7). Phone: **Take photo** + **Choose from library**. Desktop frame and demo accounts: sample tray + **Choose from library** (opens the system file/gallery picker — same label on web demo and phones; never "Upload from computer") |
| `HorizontalList` | Chips, photo strips, date strips. The next item peeks in (~24 px) so the row reads as scrollable; works with drag and mouse wheel (§7.7) |
| `AppShell` / `DeviceFrame` (web) | Phone frame on desktop (§2.1). Lives in `components/shell/`; screens never import it — they may only use `useShell()` (`{ embedded }`) and `useLayoutMode()` |

### 6.1 Component specs

Sizes in px, from the Figma components (every value is a token). Heights are minimums: text may wrap and grow the component.

| Component | Size | Padding | Radius | Text | States |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Button` | min 44 tall; `large` 56, full width | 8 × 16 | `md` | Body Strong | Default · Pressed (0.97 / 0.85) · Disabled (`border` fill, `textMuted` label — never a faded brand color) · Loading (spinner + label, not tappable) |
| `TextButton` | min 44 tall | 0 × 8 | — | Body Strong, `primary` (`error` for Danger) | Enabled · Disabled |
| `TextField` | input min 44 | 8 × 16 | `md` | Label Small Strong `textMuted` above; value Body; helper Small below | Default (`borderStrong`) · Focused (`primary`) · Error (`error` + message, clears on edit). Placeholders start with "e.g.", in `color.placeholder`, italic on web (#269) |
| `Chip` / filter chip | min 44 tall | 8 × 16 | full | Small Strong | Default (`borderStrong` outline) · Active (`primary` fill, `primaryText`) |
| Suggestion chip | min 44 tall | 4 × 16 | full | Small Strong | On (`primary` fill) · Off (outline, `textMuted`, struck through) |
| `SegmentedControl` | segments 44 tall, equal width | — | `md` | Body | Default · Selected (`primary` border + `accent`) · Disabled |
| `Tag` | hugs text | 4 × 8 | `sm` | Small Strong | Tones (§6) |
| `Banner` | full width | 8 × 16 | `md` | Title Small Strong, body Small, action Small Strong (44 tall) | Info · Warning · Error · Offline; 1 px border in the tone |
| `Action Row` | full width, min 60 | 8 | `lg` | Title Body Strong, line Small `textMuted`, icon tile 40 on `accent`, **›** | Default; 1 px `borderStrong` (§6.2) |
| `Check-in Tile` | ¼ width, min 64 | 8 × 4 | `md` | Icon over label (Small Strong) | Default (`borderStrong`) · Logged (`successSurface` + ✓) |
| `Card` | full width | 16 | `lg` | Title Body Strong, body Small | — |
| Task row | full width; icon 40 | 16 | `lg` | Time Caption, title Body Strong | Pending · Next (2 px `primary` border + the one filled action) · Done (time + ✓ in `success`) |
| `Toast` | width − 32 | 16 | `md` | Body on `text` fill | Shows 3 s; with **Undo** 5 s. Above the tab bar and pinned footer |
| `Sheet` | full width | 16, footer 24 | 16 top | Title Body Strong + **Close** | — |
| Top bar | 56 tall (onboarding 52) | 0 × 16 | — | Title Body Strong (Expressive: 24 display face) | App: title (owner "Home", sitter "Today", else the tab name) with "Name · Role" under it + 🔔 (24, count badge with a 2 px ring) + your avatar, which opens the menu (#147, D13) · Detail (Back + title) · Onboarding (Back + step dots) |
| Tab bar | 60 tall (`layout.tabBarHeight`) | 0 × 8 | — | Caption | Active tab: `accent` pill behind the icon + `primary` label |
| Icon button | 44 × 44 | — | full | — | Default · Badge (8 px `error` dot) |
| Star · calendar day · stepper button | 44 × 44 | — | `md` (day, stepper) | — | Star Off uses `borderStrong`, On uses `warning` |
| Avatar | 40 (feed 32) | — | full | Initial Body Strong on `primary` | Initial · Photo |
| Photo tile | 76 × 76 | — | `md` | — | Default · Selected (3 px `primary` ring + ✓) · Upload (dashed `borderStrong`) |
| `AlertModal` · DANGER | full screen | 16 | — | Title on `error` header | Closes only with its button (§7.4) |

### 6.2 Tappable vs information

Anyone should tell in under a second what they can tap. One rule for every screen:

| It is… | It looks like | Never |
| :--- | :--- | :--- |
| **The main action** | `Button` Primary: filled `primary`, full width, pinned or inside its card | Two filled buttons on one screen |
| **Another action** | `Button` Secondary: `surface` + **`borderStrong`** outline + `primary` label | A faint `border` outline (reads as a card) |
| **A tool or another screen** (5-second check, Scan a treat, settings) | `Action Row`: icon tile + title + one line + **›**, `borderStrong` outline, min 60 tall | A plain white card with green text |
| **A one-tap log** (Ate, Potty, Walk, Mood) | `Check-in Tile`: icon over label, `borderStrong` outline, 64 tall, four across | Filter-chip styling (reads as a filter) |
| **A filter** | `Filter Chip`: outline when off, filled `primary` when on — one selected style per screen | Mint for some filters and green for others |
| **A card that opens something** | The card plus a last row **View booking ›** / **View profile ›** | A card with no hint that it opens |
| **Pet traits for the sitter** | Two groups: **Heads-up** (allergies, meds, watch-outs) as warning `Tag`s; **Good to know** (friendly with dogs…) as brand `Tag`s | Positive traits shown as warnings |
| **Your own tag** (allergy, trait) | `Add Chip` (dashed **+ Add**) opens an inline field; the new tag is a `Filter Chip` in the Custom state with **✕** | A fixed list with no way to add |
| **Information** (status, facts, labels) | `Tag`: tinted surface, no outline, not 44 tall | Outlined or filled chips for facts (they look tappable) |
| **A result** (mood, safety) | A meter or result card | Chips that look selectable |

Buttons carry text and, if needed, a line icon or an emoji that says what the button does and is not on the AI list (§7.6).

---

## 7. Patterns

### 7.1 One primary action per screen
Each screen has at most one filled `primary` button. Everything else is secondary or a text link.
Sitter task row → big **Complete with photo**. Owner booking → **Request booking**.

### 7.2 No typing for sitters (P0)
No caption box, no long report typing. Sitters tap: **Today quick check-ins** (meal, potty, walk minutes, mood, note) and scheduled tasks (**Mark done** or with photo). Report screen = the **5-second check**: up to 2 photos → **AI-suggested chips** from the day's check-ins, tasks, and photos (the sitter turns off wrong ones) + an optional short note (≤ 200 chars) → Generate → review → **Send** posts it (D34 · D38). Optional edit before Send is OK. Inquiries: the AI drafts the reply in the sitter's tone; the sitter just taps **Send** (Edit / Add / Regenerate are optional, D36 · D38).

Owners may type where it saves the sitter work: the inquiry question, the care & medication request, their name on consents, and their preferred meeting spots.

### 7.3 Feedback loop
Action → **skeleton / spinner** → **toast** on success → the other side gets a **notification**. In the demo, both sides should be visible. Which surface to use for what (toast, Banner, ErrorDialog, confirm, Undo) is in [§7.11](#711-feedback-errors-and-confirms).

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
- At most **2 emoji** per message.
- **Avoid the emoji AI text uses all the time**, in copy, buttons, rows, chips and empty states: ✨ 🚀 💡 🔥 ✅ ❌ ⚠️ 🎯 📌 🌟 🎉 👋 🙌 💪 🤖 🔍 📝 ⭐ 💬. Use plain words, a line icon, or nothing instead. Status and section labels use the line icons (`<Icon>` or `Tag icon`: check, clock, close, warning, meal, pill, paw, tip); emoji stay for content: empty-state art, pet species, album and badge names. Buttons are words, with no emoji.
- **AI buttons:** a button that asks the AI to write or check carries the sparkles line icon before its label: `<Button ai />` (or `<Icon name="ai" />` on a chip), 18 px on buttons and 14 px on chips. Never the ✨ emoji.
- Any other emoji is fine, in a button too, when it helps (📍 on a "use my current location" button, a pet's 🐶 / 🐱). Swapping one for a line icon is optional.
- Times shown in the app timezone (America/Toronto) with AM/PM.
- **Questions and choices** (sign-up and onboarding; the wording itself lives in `frontend/features/onboarding/questions.ts` and `frontend/features/ownerOnboarding/questions.ts`):
  - Everyday words that older users and non-native speakers get at a glance ("When a guest visits", not "When a visitor comes in").
  - A question reads as a question ("Do you take cats?", "How many walks a day?"), never a noun phrase ("Pick-up preference").
  - A choice is a short keyword, not a sentence ("Pulls away", "Fast & wants more!"). Sitter counts stay at three choices (1 · 2 · 3+); owner pet questions use the pet's `{name}` and a 4-step scale from weaker to stronger.
  - No medical or diagnostic words: "Based on what you tell us", never "Behavior assessment" or "Separation anxiety". Skipping is always **Skip**.
- **One word per thing** (D20, D24): **Meet** (Meet & Greet only where it is explained); **Log in / Log out** (never sign in / sign out, except Google's own "Sign in with Google"); the sitter's daily write-up is a **Diary page** ("Writing Max's page", "Diary page · Sent"); the photo tab is **Moments**; errors start with **Couldn't**.
- **Playful words** (D20): a pun only on a toast, an empty state, a loading line, a few titles and small celebrations, taken from `frontend/content/words.ts` with `useWords()` (plain, dog and cat versions; the playful one follows the pet's species). Never on safety, money, agreements, errors or button labels. **Settings → Playful words** (on by default) turns every one back to its plain line. The list and the never list: [Playful words](https://mooque-dev.github.io/goldito-design/words-trial.html).

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
| Swipe back, swipe to delete, drag a sheet down | Not reliable on web | Always a visible back button, delete button, **Close** (a sheet's handle drag is an extra, never the only way) |
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

### 7.8 Back, close and leaving

Four jobs, four controls. Pick by the job, never by the screen. The [UX audit](https://mooque-dev.github.io/goldito-design/ux-audit.html) lists every place that does it differently today (Oct 25).

| Job | Control | Where | Label |
| :--- | :--- | :--- | :--- |
| **Go back** to the screen you came from | The **← arrow** alone (`Icon name="arrowBack"`: `BackLink`, `StepHeader`, `StepFrame`, or the native header with `headerBackButtonDisplayMode: "minimal"` and `headerBackTitle: "Back"`) | Top left, `text` color, 44 × 44 | Read aloud as **Back**. No visible word: next to a title or a progress bar it crowds the row (D25). Not "Back to the booking", not "‹ Diaries" |
| **Step back** inside a flow (onboarding, booking, checkout) | The same ← arrow, top left. It goes one step; on step 1 it leaves the flow | Top left only. **No second Back at the bottom** | Read aloud as **Back** |
| **Dismiss** a sheet, dialog, menu or full-screen viewer | **Close** text (sheets, dialogs) or ✕ icon labelled "Close" (full-screen photo viewers, the menu drawer) | Sheets: top right. Viewers: top left, white on the dark fade, 44 px, visible whenever the details are | **Close**. One per surface: never Close *and* Cancel |
| **Finish** a task | The primary button that says what it does (**Save**, **Send**, **Pay**) | Pinned footer (§7.12) | A verb. After it, go back to where the task started (`router.dismissTo`), not forward to a copy of it |

**Rules**

1. **One back per screen.** A screen never has a native header Back *and* its own Back, or a top Back *and* a bottom Back. Sitter setup today has three (header, StepFrame top, StepFrame bottom).
2. **Back on step 1 leaves the flow**, the same way on every flow. If the flow sets something permanent on exit (owner setup's "Add a pet later"), it says so on the button.
3. **Typed input is never dropped silently.** If leaving would lose text, photos or ticks the person typed or picked, either keep a draft (preferred for long flows, as owner setup and the care request already do) or ask in a Sheet: *"Discard your note?"* with **Keep editing** (primary) and **Discard** (`danger`). This applies to Back, Close, a scrim tap, a drag down and Escape. [U2]
4. **Close never saves; Done never discards.** A sheet whose changes apply as you tap (filters, search pickers) has one **Done** and no Close. A sheet that needs confirming has **Close** (discards, after rule 3) and one primary that saves. [U10]
5. **A scrim tap, Escape and Android back all equal Close**, on every sheet, dialog and menu, except the DANGER alert (§7.4), which only closes with its button. The menu drawer's scrim closes it too.
6. **Where Back lands** (code): `router.back()` with a `replace(parent)` fallback when there's no history; finishing a flow uses `dismissTo(origin)`; switching between Log in and Sign up uses `replace` both ways; never `push` a tab route from a stack screen (use the tab). Step state lives in the URL so the browser's Back moves one step. [U8]
7. **Tapping the tab you're on** scrolls to the top, then pops to the tab's first screen.
8. **Labels and size.** Every back and close control is at least 44 × 44 and has an accessibility label that says its job ("Back" for the ← arrow, "Close" for Close and ✕). A "‹" or "←" that closes is not allowed: it looks like Back. Chevrons (‹ ›) are for paging (calendar months, photos), never for Back.

### 7.9 Welcome / role onboarding

Public intro for **signed-out** visitors (`/welcome`, `/welcome/how`, `/login`, `/signup`). Design: the [intro trial](https://mooque-dev.github.io/goldito-design/intro-trial.html) (#374).

| Rule | Detail |
| :--- | :--- |
| Who sees it | **Signed-out only.** `(public)` layout redirects signed-in users away. After **Sign out**, Welcome shows again (OB.1). **`intro_seen` skip (OB.4) is deferred** — keep showing Welcome for judges; do not block Phase 04. |
| Boot | While the session loads, `BootView`: the four-print paw walk (`PawWalk`) with the coin and Goldito under it, never a bare spinner. The pet setup finish is meant to reuse the same walk (not built yet). |
| Welcome | Max and Mochi on a mint block, the tagline, a butter **How it works** card (art, "Three short pages, about a minute", chevron) so a first-time visitor sees where to learn more, then **Try the demo** as the one primary button (opens `DemoSheet`: who to be), then Sign up with email and Log in as text buttons, and a small Privacy · Terms line. Without a demo password the primary is Create account. |
| How it works | Three pages (the problem, two sides, one stay) drawn with the app's own art and demo photos; Next, Skip and Back; the last page offers Try the demo and Create account. No placeholder boxes. |
| Sign up | Three steps under one `StepHeader` (who you are, name and email, password); its Back is the ← arrow, like `BackLink` (§7.8). The step button says **Next** ("Pick one first" while nothing is picked) and the last one **Create account** (§7.12). Back steps back and keeps what was typed, then leaves. Terms and Privacy are links. |
| Demo roles | The demo sheet and the Log in demo tiles show what each side gets (`RoleArt`): the owner's home with a photo of Max arriving; the sitter with Max and Mochi and the camera. |
| How it works 2 | Chloe's checks reach Robert along a dashed line with a "Goldito sends the update" pill on it, the step Goldito takes for them. |
| Apple / Google | `SocialSignIn` stays hidden until they work; when shown, Apple and Google share one row of two so Welcome keeps How it works in view (`EXPO_PUBLIC_SOCIAL_SIGN_IN=1` shows them); a judge never taps a "Coming soon" button. |
| Privacy and Terms | One `LegalPage`: `BackLink`, `ScreenHeader` (title, Last updated), then one `Collapsible` card per section, one open at a time. No native header on top of it. Welcome links to both from a small caption line under the buttons. |

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

### 7.11 Feedback, errors and confirms

One surface per job. The [UX audit](https://mooque-dev.github.io/goldito-design/ux-audit.html) has the places that differ today.

| Something… | Use | Never |
| :--- | :--- | :--- |
| **is loading a screen** | `Skeleton` in the final layout. `LoadingView` (spinner only) is for the first app load. After 10 s: "Still loading…" + **Try again** | A spinner inside a scrolling screen |
| **is working on a button tap** | `Button loading` and a present-tense label that matches the button: Save → "Saving…", Accept → "Accepting…", Pay → "Paying…". Ellipsis is one character (…) | "Working…", "Please wait…", "Saving…" on a button that doesn't save, "..." |
| **worked** | A toast with `tone: "success"`, naming the thing and who was told: "Sent to Robert", "Max checked in. Robert was told". No trailing period | A toast for every small thing the screen already shows |
| **partly worked** | A toast with `tone: "warning"`: "Sent, but the stickers weren't saved" | A success check on a partial result |
| **failed after a tap** | A toast with `tone: "error"` and **Try again** when retrying is the whole answer; an `ErrorDialog` when the person must decide something. Say what happened, what was kept and what to do: "Not sent. Your note is kept. Try again" | The default success tone on an error; raw server text (`e.message`, status text, env names) |
| **is wrong with a field** | Red text under that field (`TextField` error) when they leave the field or press the button | A toast for a field problem |
| **is wrong with the whole screen** (offline, payment failed, sitter late) | `Banner` with the right tone, at the top | Red inline text in the middle |
| **is empty** | `EmptyState`: what will appear, who adds it, and an action when the person can do something (§7.5) | An empty title like "Diary"; a hidden section |
| **is not found or failed to load** | `EmptyState` with **Try again** or **Back**; the error is the message, not the title | A dead end with no button |
| **is destructive and can't be undone** (cancel booking, decline, delete, clear all, reset) | Ask in a Sheet: what will happen, then a `danger` button named for the act ("Cancel booking") and Close. The sheet's buttons sit in its footer | A `primary` button for a destructive confirm; `danger` for things that aren't destructive (Sign out) [U5] |
| **is quick and reversible** (hide, remove a chip, check-in, mark done, leave a chat) | Do it, then a toast with **Undo** for 6 s [U3] | A confirm sheet; no way back |
| **is a button that can't be pressed yet** | `dimmed` (looks off, still takes the tap) plus one line saying why, and a tap scrolls to what's missing, like Checkout's Pay | A silently disabled button |
| **arrived from the other side** (a notification) | The bell badge (cap **9+** everywhere) and the "New" marker; a toast only if it isn't about the screen you're on, and never over a toast you just caused [U9] | A notification toast replacing your own Undo |

Swipe actions (leave a chat, delete a notification) always have a visible button too (§7.7).

### 7.12 Actions, sheets and forms

**The main action**

- One filled `primary` per screen (§7.1), including the cards in it. Cards that offer a next step use a secondary button or an Action Row; the screen's footer carries the one primary. On busy screens (booking detail, chat), the primary is the *next step of the stay*, and the cards' buttons are secondary. [U11]
- A pinned primary uses `Screen footer=` (so toasts sit above it), never a hand-made footer view.
- Buttons stretch to full width; `size="large"` (60 px) is for one-question flows (onboarding, step-by-step booking).
- Colors come from the theme (`useTheme().color.primary`), never `tokens.color.primary` directly, so skins work.

**One word per job**

| Job | Word | Not |
| :--- | :--- | :--- |
| Keep changes | **Save** (or "Save {thing}") | Done, Apply, OK |
| Close a sheet whose changes already applied | **Done** | Close (it reads as discard) |
| Mark a task complete | **Mark done** | Done |
| Move to the next step | **Next** (the last step says what it does: **Create account**, **Send request**) | Continue on one flow and Next on another |
| Send something to the other person | **Send** / "Send to {name}" | Submit |
| Say yes to a request | **Accept** (and **Confirm and pay** only at checkout) | I accept, Approve, Confirm quote [U12] |
| Say no | **Decline** | Not this sitter, Decline and end the request |
| Retry | **Try again** | Retry, Record again (unless it records) |
| Leave a flow early | **Skip** for one step, **Skip for now** for the rest | Skip all, Skip all for now, Skip questions |

Buttons are words. A line icon may sit before the word (`<Icon>`), never an emoji or a typed glyph ("+ Add", "↗ Share", "✏️ Edit", "‹ Diaries"). 📍 on "Use my current location" stays allowed (§7.6).

**Sheet, screen or inline**

| Job | Use |
| :--- | :--- |
| Edit one thing (a task, a caption, a time) | Sheet |
| Edit many fields or a whole profile | Full screen with a pinned **Save** |
| Add an item to a list (allergy, Heads-up, line) | Inline `Add Chip` (dashed **+ Add**, §6.2) that opens a field; Enter adds |
| Confirm | Sheet (§7.11) |
| Pick one of a few | `SegmentedControl` (2 to 4 options) or `CheckRow` radio (more, or with detail) |
| Pick several | `CheckRow` checkbox, or `ChoiceChips multi` with the "Pick all that fit" hint |
| Pick a pet | One `PetChips` component everywhere (face + name) |
| View a photo | One full-screen viewer (§7.8 for its Close) |

Sheet actions always sit in the sheet's `footer`, never in the scrolling body.

**Forms**

- Every field has a visible label above it; no `label=""`. One-question screens use the question as the label and pass it as the accessibility label.
- Mark **optional** fields with "(optional)" in the label; required fields have no mark.
- Placeholders start with "e.g." (§6.1). Dates use `DateField` or `DayPickerSheet`, never typed text.
- Check a field when they leave it or press the button; show the error under the field. Don't disable the main button silently (§7.11).
- `maxLength` on every free-text field; show a counter once they pass 80% of it.
- On web, Enter in the last field submits.

**Taps and rows**

- Anything that opens another screen is an Action Row (icon tile + title + one line + ›) or a card with a last row "View … ›" (§6.2). Text links are for small extras only.
- Facts are `Tag`s; outlined chips are for things you can tap.
- Every tap target is at least 44 × 44, close and remove buttons included.

### 7.13 UX calls (decided Oct 25)

From the [UX audit](https://mooque-dev.github.io/goldito-design/ux-audit.html), picked by Mook on Oct 25 on the [UX calls page](https://mooque-dev.github.io/goldito-design/ux-calls.html) (D18). The rules above follow them.

| # | Call | Options | Decision |
| :--- | :--- | :--- | :--- |
| U1 | Native header Back | Chevron + "Back" (this file) or chevron only (what ~37 screens show) | **The ← arrow alone, everywhere** (picked A, then changed the same night once "‹ Back" sat next to the sign-up progress bar; D25) |
| U2 | Leaving with typed input | Keep a draft, or ask "Discard?" | **C: Both: drafts in long flows, ask before leaving a sheet** |
| U3 | Undo time | 5 s (this file before), 6 s (the toast today), 8 s (care request) | **B: 6 s everywhere** |
| U4 | Full-screen viewer close | ✕ top left or top right | **A: ✕ top left, labelled Close** |
| U5 | Sign out | Confirm (two ways today) or no confirm | **B: Confirm in a sheet** (picked A, then kept the sheet #387 had just shipped; D21) |
| U6 | Error surfaces | As §7.11, or toasts only | **A: By job, as §7.11 (add `ErrorDialog` to §6)** |
| U7 | Skeletons before the freeze | All 53 spinner screens, tab roots only, or after | **A: Skeletons on tab roots, after the freeze; spinners until then** |
| U8 | Steps in the URL | Now or after the freeze | **B: After the freeze; until then browser Back leaves the flow and the draft is kept** |
| U9 | Notification toasts | Toast every notification, or only off-screen ones, queued | **A: Badge the bell, queue the toast; your Undo stays** |
| U10 | Live sheets | Done only, or Close and Done | **A: Done only** |
| U11 | Busy screens with many primaries (booking detail, chat) | One primary for the next step, or a primary per card | **A: One primary for the next step; card actions are secondary** |
| U12 | Accept wording | Accept, I accept, Approve, Confirm quote | **A: Accept everywhere; Confirm and pay only at checkout** |

## 8. Imagery & icons

- **Logo:** the gold coin symbol (`frontend/assets/brand/goldito-symbol.svg`, PNG copy for native). In the app use `<BrandLogo />` (`components/BrandLogo.tsx`): the symbol + "Goldito" in the display face. Never re-type the name as text with an emoji. Favicon and app icons still use the gold tag (`goldito-favicon-48.png`, `app.json`) until they are redrawn.
- Real pet photos are the hero; keep chrome minimal around them.
- Icons: one outline icon set (Figma will choose); emoji are fine in notifications, chips, and empty states, except the ones listed in §7.6.
- Stickers and report themes (P1, Phase 11.8): `sunny`, `cozy`, `playful`, `calm` — assets from the designer.
- Sample photos for the demo tray (Phase 04.7): dog and cat daily photos plus treat labels with fictional brands (the same label images as the Phase 08 test fixtures). No people, faces, or addresses.

---

## 9. Accessibility

- Text contrast ≥ 4.5:1 on its background (all current text tokens pass on `background`, `surface` and `accent`, in both looks).
- Non-text contrast ≥ 3:1 for control outlines, focus rings, progress fills and selected states (`borderStrong`, `track` — §3).
- No opacity tints for text or its background: a faded status color can drop below 4.5:1. Use the `*Surface` tokens.
- Touch targets ≥ 44 × 44 — including chips, calendar days and stars; spacing between tappable items ≥ 8.
- Set `accessibilityRole` / `accessibilityLabel` on buttons and icon-only controls.
- Never rely on color alone for status (see §3).
- Focus is visible: 2 px `primary` outline, 2 px offset, on everything focusable (keyboard and switch users on the web demo).
- Respect OS text size and **Reduce motion** (§4, §5.1).
- Every image a person posts gets a text alternative: the AI caption, or "Photo of Max, 9:02 AM".

---

## 10. States & edge cases

Every screen is designed for more than the happy path. Before a screen PR, check it in these states:

| State | Rule |
| :--- | :--- |
| **Loading** | `Skeleton` in the final layout (no spinner-only screens, except the first app load). After 10 s: "Still loading…" + **Retry** |
| **Empty** | `EmptyState`: what will appear, who adds it, and when (§7.5) |
| **Error** | `Banner` (Error) that says what happened, what was kept, and the next step. Nothing the user entered is lost |
| **Offline** | `Banner` (Offline). Sitter taps and photos queue on the phone with "Waiting to send" and send on their own (D8). Owners see "Last update 9:02" |
| **Long content** | Long names wrap (two lines max in rows); 10+ items show a count and **See all**; long notes collapse after 4 lines with **More** |
| **Two pets, two species** | Every card and notification names the pet; filters default to all pets; test with Max 🐶 *and* Mochi 🐱 |
| **Slow or unsure AI** | Typing dots or a skeleton while it works; when unsure, the fallback in D5 — never a blank or a guess |
| **Undo** | Quick, reversible taps (check-ins, chip off, remove a checklist row) show a toast with **Undo** (6 s, U3) instead of a confirm dialog. Destructive or paid actions (cancel booking, pay) ask first (§7.11) |

### 10.1 Edge cases by stage

Each has a screen in Figma (*2. Screens → Edge states*).

| Stage | Situation | Owner sees | Sitter sees |
| :--- | :--- | :--- | :--- |
| ① | Dates are full | Reply with the next open dates as chips; prices only from the server | Nothing to do — the calendar answers |
| ① | Health or out-of-scope question | `Banner` (Info) "Chloe will answer this one herself · usually within 2 hours" | Thread flagged for a personal reply |
| ② | Dose missing, or a task conflicts with an allergy | The row is tagged (Warning: "Add the dose — the assistant never guesses doses"; Danger: "chicken — Max is allergic"); **Save** disabled with "Fix 2 items" | Only ever the confirmed checklist |
| ③ | Sitter declines, or doesn't answer within 24 h | `Banner` (Info) "You weren't charged" + another open sitter. Not red: nothing failed | — |
| ③ | Payment fails | `Banner` (Error); the 5 consents and the typed name are kept; **Try again** | — |
| ③ | Entry info not added by pick-up day | Reminder notification | `Banner` (Warning); the card stays 🔒 |
| ④ | Sitter running late (ETA grows by 5+ min) | `Banner` (Warning) with the new ETA, updated on its own — no action needed | Nothing extra; the ETA comes from the trip |
| ④ | Location off or denied | Status lines instead of the map | **Leaving now** · **10 min away** · **I'm here** |
| ④ | Handoff photo check unsure | "Checked by Chloe" instead of "Photo verified" | Photo Check (Retake): **Retake photo** or **Confirm by eye**. Never blocks the handoff (D5) |
| ④ | Offline | "Last update 9:02" on the stay card | `Banner` (Offline); tasks show "Waiting to send" (D8) |
| ④ | Medication late | Neutral "Not checked off yet" — no red, no alarm | `Banner` (Warning) + the task as the next action; the real time is recorded |
| ④ | No photos yet today | `EmptyState` with the usual time ("Chloe usually posts after the morning walk") | — |
| ④ | Treat label unreadable | Asked to confirm the treat | `Banner` (Warning) "Don't feed it yet" — unsure means no (D5) |
| ⑤ | Rating of 1–2 stars | Optional private note | Sees the note; no public low score |
| ⑤ | AI learned a new fact ("scared of the vacuum") | `Banner` (Info) + **Add to Max's profile** / **Not accurate** (D9) | — |

Proposed for later (not in P0): a sitter **Heads-up** quick action with preset reasons (Didn't eat · Vomited · Limping) that notifies the owner right away.

---

## For AI agents

1. Read design values through `useTheme()` / `useThemedStyles(makeStyles)` from `frontend/providers/ThemeProvider.tsx` — in screens and `components/ui`, never import `tokens` directly (only `components/shell/` does, because it renders outside the provider). **Never hardcode** hex colors, font sizes, or spacing numbers. Pattern: a module-level `const makeStyles = (theme: Theme) => StyleSheet.create({...})`, then `const styles = useThemedStyles(makeStyles)` in the component.
2. Wrap screens in `Screen`; group content in `Card`; use `Button` for actions; use `BackLink` for back (§7.8). Extend these before creating new primitives.
3. If you need a **(proposed)** token, add it to `tokens.ts` in the same change and mention it in the PR. A new color that skins should change also goes into `SkinColors` in `themes.ts`; status colors never do (§3.1).
4. Follow §7 patterns: one primary action, no sitter text fields, loud DANGER, empty states with copy. Cover the §10 states (loading, empty, error, offline) for every screen.
5. Show both dogs and cats in placeholder content.
6. If a screen has a Figma frame, the Figma frame wins over this file.
7. The UI must work inside the desktop phone frame with a mouse (§2.1, §7.7): no gesture-only actions, no pull-to-refresh-only updates, no native-only libraries (date/time pickers, swipeable rows).
8. Branch layout only with `useLayoutMode()` — no `Platform.OS` or width numbers in screens. Pick photos only through `pickMedia()`.
9. **Working from Figma:** read §0 first. Status labels use `Tag`, edge-state notices `Banner`, round pictures `Avatar` — never a local look-alike. One Figma component = one code file, named like Figma.
10. **Every action has a `testID`** named for what it does (`book-care`, `cancel-confirm`). Keep it when a button moves or its label changes; when you remove one, `grep` it in `frontend/e2e` and fix those tests. The screen map (`node scripts/screen-map.mjs` in `frontend/`) is generated and not committed.

---

## Open items for the designer (Figma)

Done in Figma and synced: palette incl. `warning` and the `*Surface` tints, the `Balanced` mode, base components (Button, Text Button, Chip, Tag, Avatar, Banner, Text Field, Segment, Checkbox Row, Empty State), the gold tag logo. Still open:

- [ ] Code-only tokens as Figma variables (§0.2)
- [ ] Final type scale (`subtitle` or not, §0.7); the families are settled (D11)
- [x] Icon set: Lucide (D12), in Figma as Icons · Lucide (app set)
- [ ] App icon at 1024 px (only the 180 px touch icon and favicons are in `assets/brand/`)
- [ ] 🟡 / ❌ components in §0.4 (Tab Bar Snap label, Switch, Skeleton, Filter Chip, …), ProposalCard, ReportCard
- [ ] Expressive: dark mode, the new owner Home (prototype), Figma icon set in the tab bar
- [ ] Report themes (4) + preset sticker set (Phase 11.8)
- [ ] Welcome / Login screens ([#13](https://github.com/minsikpaul92/Pawddy/issues/13))
- [ ] Figma frames at **402 × 874**; spot-check at 360 and 440
- [ ] Desktop backdrop, side panel, and phone-frame style (§2.1)
- [ ] Sample photo set for the demo tray: dog / cat daily photos + treat labels with fictional brands (§8)
