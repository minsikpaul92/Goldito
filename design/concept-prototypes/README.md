# Pet-theme concept prototypes

Three clickable directions for two P1 ideas ([11.10 pet-photo theming](../../docs/plan/phases/phase-11.md), [11.12 pet status room](../../docs/plan/pet-status-room.ko.md)), built to playtest before writing the real feature. Not production code — throwaway exploration, not wired into the app.

## How to open

Each file is a single self-contained HTML page (pet photos are embedded). Fonts load from Google Fonts; offline, each page falls back to system fonts.

- Double-click `index.html`, or
- serve the folder: `python -m http.server 8765` from this folder, then open http://localhost:8765/index.html

Press Ctrl+F5 if a browser shows an old version.

## The three directions

All three share the same flow — add a pet (name, species, sample or uploaded photo) → theme preview (coat color snapped to an accessible preset, live contrast ratio) → a working app with **Home · Feed · Care · Reports** tabs. The tab bar only appears after setup. The UI *and* UX differ on purpose so the team can compare them side by side. Tap ⓘ in any version for its write-up, trade-offs, and a restart button.

| | A · Calm Core | B · Full Tamagotchi | C · Balanced Skin |
| :--- | :--- | :--- | :--- |
| Feel | Calm family journal (Kidsnote-like) | Playful game | Warm, modern, photo-first |
| Theming | Accent color only | Full re-theme of the whole phone | Soft tint (primary + surfaces) |
| Type / shape | Fraunces serif + Inter, hairline rules, few cards | Fredoka + Nunito (+ Press Start 2P for HUD), thick outlines, sticker shadows | Plus Jakarta Sans, soft shadows, large radii |
| Home | Status card, mood preview, "Latest from Jisoo" | Animated pixel room as hero | Status card + "Today's photos" strip + "Next up" |
| Feed | Timeline by time of day, tap → photo viewer | Album grid with stickers, lightbox | Large photo cards with AI caption, "Love it" |
| Care | Checklist with Undo toast | Quests with XP bar and bursts | Schedule with "Complete with photo" |
| Reports | Letter from Jisoo + thank-you paw | Day recap stat cards | Summary card + highlights + AI note |
| Tab bar | Text + thin line icons | Floating pill | Standard bar, filled active pill |

## Status (2026-10-01)

- **A — fully audited and presentation-ready** (see below).
- **B and C — rebuilt and self-tested, but not yet given the same hands-on audit as A.** Next step: same pass (spacing, hover/press states, pinned primary actions, paw moments in each direction's own style — louder for B, softer for C).
- After choosing a direction: turn it into tokens in `frontend/theme/tokens.ts` + `DESIGN.md`, and add a task to `docs/plan/TODO.md`.

## Pending merge (read first)

This work lives on branch **`design/pet-theme-concepts-audit`** (not on `playground/pet-theme-concepts`). While it was being made, mooque pushed `d89f649` "Add streak chip and sitter-side read-only view to Concept C" to `playground/pet-theme-concepts`. Both rewrote `pawnote-concept-c-balanced-skin.html`, so they conflict.

- A, B, `index.html` and this README merge cleanly.
- Concept C needs a decision: keep this rebuild and re-add mooque's streak chip + sitter read-only view on top (suggested), or keep mooque's version.

```bash
git fetch origin
git checkout design/pet-theme-concepts-audit
```

## Concept A audit (what was fixed)

Tested in Edge with mouse only, in light mode, dark mode, at a 20px root font size, and on a 1366×768 laptop window. No console errors, nothing overflows the phone, and the top bar's middle item is 0px off-center on every screen.

- **Primary action hidden on laptops.** At 768px tall the phone shrinks and "Continue" fell below the fold. Onboarding actions are now pinned to the bottom of the screen.
- **"Keep this look" stayed green** while previewing another preset. Step 2 buttons now use the previewed color.
- **White/grey/black coats got random hues** (white Maltese → "Rose"). Below 18% saturation the coat now maps to a neutral preset (Umber if warm, Slate otherwise).
- **Care items jumped lists instantly.** Now: check animates → row slides out → toast with **Undo**.
- **Feed photos weren't clickable.** Now open a full-size viewer with Earlier / Later.
- **Notes sheet** had Close only at the very bottom → sticky header with a close button; sheet opens at the top; a toast can no longer cover it.
- **Top bar balance:** brand/Back left · step dots or masthead center · ⓘ right.
- **Spacing:** consistent 1.5rem section rhythm, removed double rules above lists, photo picker fits on one row of 4, no duplicated pet name on Home, pick-up time on its own line, 2-line clamp on the latest caption, tab bar clears a home-indicator bar.
- **Interaction states:** hover and pressed feedback on every button, tile, row and tab.
- The phone uses `overflow: clip` (the hidden sheet could otherwise scroll the frame — same bug found in B and C).

## Paw micro-interactions (Concept A)

Inspired by a LottieFiles "paws" animation, but built in CSS + inline SVG instead of embedding Lottie: no extra library or download, uses the pet's accent color, works offline. All respect `prefers-reduced-motion`.

1. **Welcome walk** — after "Keep this look", paw prints step in one by one (alternating feet), then "Welcome, {name}".
2. **Paw stamp** — a paw thumps into each success toast.
3. **Paw burst** — small paws float up from the checkbox on care check-off and from the thank-you button.
4. **Progress paw** — rides the head of the care progress line.
5. **Thank-you paw** — Reports' one primary action: "Send Jisoo a thank-you paw".
6. Smaller touches: mood emoji hop, swatch bump on preset change, "Next" line flash when it updates.

If the team later wants the exact Lottie file instead, it needs the `lottie-web` (or dotLottie) player script plus the downloaded animation file.

## Decisions and caveats from this session

- **REM sizing.** Everything inside the app is in rem; 1–2px hairlines and the phone *device* (402px wide, bezel, outer radius) stay px because it imitates fixed hardware. Caveats:
  - rem scales with the user's **font-size setting**, not screen width. Width scaling comes from fluid layout (%, flex, grid).
  - The real app is **React Native** — no rem there. Sizes are unitless numbers in `tokens.ts`; the equivalent is OS font scaling (`allowFontScaling`, `useWindowDimensions().fontScale`). So rem here doesn't carry over 1:1.
  - Inside the desktop phone frame the app is always 402px wide.
- **Mock content** uses the chosen pet's name, species and photo; the sitter is "Jisoo". With few sample photos per species, feeds reuse or crop the chosen photo (and B/C add a "friend" pet).
- **Owner can tick care items** in these demos so judges can click through; in the real app the sitter does this.

## Designer polish opportunities (from `DESIGN.md`)

`DESIGN.md` marks almost every value as a placeholder until the designer decides. Highest leverage, in order:

1. **Foundations (tokens):** font family; final palette; the **(proposed)** tokens not yet in code — `warning`, `warningSurface`, `errorSurface`, `successSurface`, `fontSize.subtitle` (18); logo + app icon.
2. **What judges see first:** the desktop backdrop + side panel around the phone frame (pitch, Try demo, QR); Welcome / Login screens ([#13](https://github.com/minsikpaul92/PawNote/issues/13)).
3. **Demo "wow" moment:** the full-screen DANGER treat-safety modal (plus WARNING / SAFE variants), §7.4.
4. **Components without visuals yet:** Button variants, TabBar, TaskRow, FeedCard, Toast (high); Chip, EmptyState, PetAvatar, Skeleton, Sheet (medium); ProposalCard, ReportCard, report themes/stickers (later).
5. **Gaps in DESIGN.md:** shadow/elevation scale, motion (durations, easing, skeleton shimmer), icon sizes and line-height tokens, empty-state illustration style, photo loading/error/no-photo states, a stated dark-mode decision.
6. **Demo content:** sample dog/cat daily photos + treat labels with fictional brands (no people, faces or addresses).

Handoff order: **Figma Variables → `tokens.ts` → `DESIGN.md`**. Design at 402 × 874; spot-check at 360 and 440.

## Dev notes for running the real app (`frontend/`)

- First run: `npm install` in `frontend/` (and again whenever `package.json` changes).
- Start: `npx expo start --web --port 8081` → http://localhost:8081
- The gesture test page `/dev/gestures` only opens with `EXPO_PUBLIC_DEV_ROUTES=1` (otherwise it redirects to `/`). Either start with `EXPO_PUBLIC_DEV_ROUTES=1 npx expo start --web`, or add `EXPO_PUBLIC_DEV_ROUTES=1` to `frontend/.env` (copied from `.env.example`; never committed). Env vars are read only at startup — restart after changing them.
- Without `frontend/.env`, Supabase keys and the demo password are empty, so login / "Try demo" won't work.
- If port 8081 is "already in use", an old Expo process is still running — stop it before restarting.
- Expo deletes `frontend/expo-env.d.ts` on start; restore it with `git checkout -- frontend/expo-env.d.ts` (possible follow-up: gitignore it).
