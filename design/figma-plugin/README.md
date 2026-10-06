# PawNote Design Sync (Figma plugin)

Builds the PawNote library and screens in the team's Figma file without the Figma MCP call limits.

- **Variables and text styles** (if the file doesn't have them): `Color` (Default = `tokens.ts`, plus the **Balanced** look as a mode), `Size`, `Motion`, and six text styles (Title · Body · Body Strong · Small · Small Strong · Caption).
- **3. Components**: 61 components and variant sets (core, live app, navigation, inputs, stay, care and transit, feedback), every fill, stroke, padding and radius bound to a variable. Hand-made components already on the page are left alone.
- **2. Screens**, built from component **instances** so editing a component updates every screen (DESIGN.md D2):
  - **Today**: the live app's tabs, captured (Live) next to the Balanced look.
  - **Upcoming**: inquiry, care request, Meet & Greet, checkout, entry info, trip, handoff, 5-second check, daily note, DANGER, review, Life Record.
  - **Edge states**: 16 screens for owners and sitters when things don't go to plan (DESIGN.md §10).
  - **Onboarding** (exploration).

Playful lives in the clickable prototypes only (DESIGN.md D1).

Re-running replaces only what the plugin made before (tagged with plugin data).

## Run it (Figma desktop app)

1. Open the PawNote Design System file. It needs pages whose names start with `2.` and `3.`.
2. Menu → Plugins → Development → **Import plugin from manifest…** → pick `design/figma-plugin/manifest.json`.
3. Menu → Plugins → Development → **PawNote Design Sync**. A small window opens; press **Build**. Progress and any errors show in that window (about a minute).

## Update after prototype changes

1. Serve the prototypes: `python3 -m http.server 4001 --directory design/concept-prototypes`
2. Capture: from `frontend/`, `NODE_PATH=$PWD/node_modules npx playwright test --config ../design/figma-plugin/capture/playwright.config.ts` (add `ONLY=B` to capture one concept)
3. Bundle: `python3 design/figma-plugin/build.py`, then run the plugin again.

Files: `src/` (plugin code), `capture/` (browser serializer + Playwright walk of every flow), `data/` (captured screens), `code.js` (generated bundle).

Known limits of the screen import: CSS pseudo-element shapes (timeline rails, some dots) and gradients are simplified; fonts fall back to Inter if a family isn't installed in Figma.
