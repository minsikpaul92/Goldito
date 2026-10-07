# Pet-theme concept prototypes

Three clickable directions for two P1 ideas ([11.10 pet-photo theming](../../docs/plan/phases/phase-11.md), [11.12 pet status room](../../docs/plan/pet-status-room.ko.md)), built to playtest before writing the real feature. Not production code — throwaway exploration, not wired into the app.

**Start here:** `review.html` — the design review (plan vs status, the 5 stages, decision tree, edge cases), then `index.html` for every prototype. The redesign of the live app's tabs is in `redesign/`.

## How to open

Each file is a single self-contained HTML page (pet photos are embedded). Fonts load from Google Fonts; offline, each page falls back to system fonts.

- Double-click `index.html`, or
- serve the folder: `python -m http.server 8765` from this folder, then open http://localhost:8765/index.html

Press Ctrl+F5 if a browser shows an old version.

## The three directions

All three share the same onboarding (see *Onboarding* below) and the same five-stage stay, then a working app with **Home · Stay · Feed · Care · Reports** tabs. The UI *and* the in-care UX differ on purpose so the team can compare them side by side. `index.html` lists every flow; clicking one opens `compare.html`, a viewer with an A · B · C · All three switcher (each concept keeps its own progress while you switch, keys 1–4, `[` `]` for the previous/next flow). The flow list lives in `flows.js`. Tap ⓘ in any version for its write-up, *What to look for*, and a restart button. The labels are descriptive (Accent only · Full re-theme · Soft tint), not a ranking.

| | A · Calm Core | B · Full Tamagotchi | C · Balanced Skin |
| :--- | :--- | :--- | :--- |
| Feel | Calm family journal (Kidsnote-like) | Playful game | Warm, modern, photo-first |
| Theming | Accent color only | Full re-theme of the whole phone | Soft tint (primary + surfaces) |
| Type / shape | Fraunces serif + Inter, hairline rules, few cards | Fredoka + Nunito (+ Press Start 2P for HUD), thick outlines, sticker shadows | Plus Jakarta Sans, large radii, hairline border + faint shadow (shadcn/ui elevation) |
| Home | Status card, mood preview, "Latest from Lucy" | Animated pixel room as hero | Status card + "Today's photos" strip + "Next up" |
| Feed | Timeline by time of day, tap → photo viewer | Album grid with stickers, lightbox | Large photo cards with AI caption, "Love it" |
| Care | Checklist with Undo toast | Quests with XP bar and bursts | Schedule with "Complete with photo" |
| Reports | Letter from Lucy + thank-you paw | Day recap stat cards | Summary card + highlights + AI note |
| Tab bar | Text + thin line icons | Floating pill | Standard bar, filled active pill |

## Status (2026-10-02)

- **All three now run the whole stay**, ① Inquiry → ⑤ Completion (see *The journey* below), with the same features in each so you compare look and feel, not feature gaps.
- **B and C got the A-level pass:** neutral coats (white/grey/black → Umber or Slate), pinned onboarding actions, neutral disabled buttons, Undo on every check-off, hover states, and paw moments in each direction's own voice (soft for C, loud for B).
- **Sitter is Lucy, owner is Chloe**, matching the main README demo path. Anything Lucy would do is a dashed **"Demo · as Lucy"** control.
- **Onboarding added** to all three (owner, sitter, returning user), with deep links for each flow and stage.
- **Concept C elevation** now follows shadcn/ui: 1px border + `shadow-xs` on cards and inputs, `shadow-md` on hover, `shadow-lg` only for the toast and sheet. No colored glow under primary buttons.
- **Fixed:** each concept's journey skin was being overridden by the shared stylesheet (it's inlined later). The shared defaults now use `:where()`, so A's serif headings, B's sticker cards and C's hairline cards show on the Stay tab.
- After choosing a direction: turn it into tokens in `frontend/theme/tokens.ts` + `DESIGN.md`, and add a task to `docs/plan/TODO.md`.

## Onboarding (all three concepts)

| Path | Screens |
| :--- | :--- |
| Owner | Welcome → *How will you use Goldito?* → Create account → **Add your pet** → **Your look** → Health & care (breed, age, allergies, medication, personality, vet, live "heads-up" preview) → Notifications (choose types, simulated system prompt or *Not now*) → Home |
| Sitter | Welcome → role → Create account → Services & rates (steppers; a sample quote for 2 pets over Thanksgiving updates live, same formula as the stay) → House rules (home type, rules, own pets, max pets, cancellation, optional note) → Availability (October calendar, Thanksgiving marked) → *You're live*: the profile owners see + an AI auto-reply preview → *Try it as an owner* |
| Returning | Welcome → Log in → Home |

- **Bold** screens are each concept's own (pet + photo theme); the rest is shared. Health & care and Notifications come after the look, so they already show the pet's colors.
- Back and the progress dots stay in each concept's own top bar for the whole flow (6 steps for owners, 5 for sitters).
- What you enter carries into the stay: the first allergy drives Treat Guard and the Life Record (no allergy → a species toxin, e.g. xylitol), the owner's first name goes into the AI reply, the sitter's rates go into the quote.
- **Deep links** for testing: `#owner`, `#sitter`, `#login`, `#app` (skip setup), `#stage-1` … `#stage-5`, `#care`, `#check` (5-second check), `#splash`. Example: `pawnote-concept-c-balanced-skin.html#stage-3`.

## The journey (all three concepts)

After the pet + theme setup you land on Home with **Plan a stay**. The new **Stay** tab walks the README's five stages; Feed, Care and Reports stay empty ("starts when Max is with Lucy") until pick-up.

| Stage | Try this |
| :--- | :--- |
| ① Inquiry | Pick Boarding / House sitting, add the second demo pet → **Ask Lucy** → AI auto-reply with a quote (3 nights, extra pet, Thanksgiving: **$268.13 CAD** for two pets) and source chips |
| ② Meet & Greet | **Turn into checklist** (editable rows + Heads-up) → propose a Meet & Greet → *Demo · Lucy confirms* → choose who drives each way |
| ③ Booking | *Demo · Lucy accepts* → 5 consents + type your name (Pay stays disabled until both) → **Pay (demo)** → Lucy's address unlocks; entry code unlocks 2 h before and hides again 10 s after **Show code** |
| ④ Pick-up & care | Live map with ETA (or **Simulate the drive**) → *Demo · handoff photo* → "care has started · photo verified" → Home/Feed/Care/Reports unlock. Feed gets **Meals · Walks · Naps · Play** filters. *Demo · Lucy scans a treat* → full-screen DANGER that only "I understand — don't feed" closes. *Demo · Lucy does the 5-second check*: ≤ 2 photos → turn off wrong AI chips → optional note (≤ 200) → Generate → Send to Chloe |
| ⑤ Home & review | Drive home → return photo → stars + thank-you → **Life Record** (each line with its source) → **Plan the next stay** starts over with Lucy and the record attached |

- **🔔 Updates** (top bar) collects every step, so the owner never needs to ask.
- **Testing shortcut:** ⓘ → *Testing: jump to a stage* (① … ⑤, or straight to *Care in progress*).
- With Reduce motion on, every arrival, burst and trip animation is skipped; everything still works.

**How it's built:** the journey and onboarding live once in `journey/` (`journey.js`, `journey.css`, `onboard.js`, `onboard.css`). Each concept file has a `<!-- journey:start -->…<!-- journey:end -->` block that `python3 journey/build.py` fills in, so the HTML files stay single-file and offline. Each concept adds a short skin block (A paper hairlines, B stickers, C soft cards) and a `celebrate()` hook (A paw burst, B "STAGE CLEAR" stars, C soft paws). **Edit `journey/`, then run `build.py`** — don't edit the inlined copy.

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
5. **Thank-you paw** — Reports' one primary action: "Send Lucy a thank-you paw".
6. Smaller touches: mood emoji hop, swatch bump on preset change, "Next" line flash when it updates.

If the team later wants the exact Lottie file instead, it needs the `lottie-web` (or dotLottie) player script plus the downloaded animation file.

## Decisions and caveats from this session

- **REM sizing.** Everything inside the app is in rem; 1–2px hairlines and the phone *device* (402px wide, bezel, outer radius) stay px because it imitates fixed hardware. Caveats:
  - rem scales with the user's **font-size setting**, not screen width. Width scaling comes from fluid layout (%, flex, grid).
  - The real app is **React Native** — no rem there. Sizes are unitless numbers in `tokens.ts`; the equivalent is OS font scaling (`allowFontScaling`, `useWindowDimensions().fontScale`). So rem here doesn't carry over 1:1.
  - Inside the desktop phone frame the app is always 402px wide.
- **Mock content** uses the chosen pet's name, species and photo; the sitter is "Lucy" (owner: Chloe). With few sample photos per species, feeds reuse or crop the chosen photo (and B/C add a "friend" pet).
- **Owner can tick care items** in these demos so judges can click through; in the real app the sitter does this.

## Designer polish opportunities (from `DESIGN.md`)

`DESIGN.md` marks almost every value as a placeholder until the designer decides. Highest leverage, in order:

1. **Foundations (tokens):** font family; final palette; the **(proposed)** tokens not yet in code — `warning`, `warningSurface`, `errorSurface`, `successSurface`, `fontSize.subtitle` (18); logo + app icon.
2. **What judges see first:** the desktop backdrop + side panel around the phone frame (pitch, Try demo, QR); Welcome / Login screens ([#13](https://github.com/minsikpaul92/Goldito/issues/13)).
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
