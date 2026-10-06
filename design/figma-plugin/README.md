# PawNote Design Sync (Figma plugin)

Builds the PawNote library and screens in the team's Figma file without the Figma MCP call limits.

- **3. Components**: the components the prototypes use (42 sets/components: navigation, inputs, stay/booking, care and transit, feedback), bound to the file's variables (`color/*`, `spacing/*`, `radius/*`, `size/*`) and text styles. Hand-made components already on the page are left alone.
- **2. Screens**: every prototype state for A · Calm Core, B · Full Tamagotchi and C · Balanced Skin, rebuilt as editable layers (402 × 874), one Section per app-map group.

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
