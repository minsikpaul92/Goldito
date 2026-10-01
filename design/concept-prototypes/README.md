# Pet-theme concept prototypes

Three clickable directions for two P1 ideas ([11.10 pet-photo theming](../../docs/plan/phases/phase-11.md), [11.12 pet status room](../../docs/plan/pet-status-room.ko.md)), built to playtest before writing the real feature. Not production code — throwaway exploration, not wired into the app.

Open `index.html` locally (double-click, or `python3 -m http.server` from this folder) — each file is fully self-contained, no build step or server required.

- **A — Calm Core**: accent-only theming, static status card.
- **B — Full Tamagotchi**: full re-theme + animated pixel-art room built live from the uploaded photo.
- **C — Balanced Skin** (recommended): the real 11.10/11.12 mechanic, sized to sit inside a normal Home layout.

Each is the same 3-step flow: add a pet (name, species, sample or uploaded photo) → theme preview (photo color sampled and snapped to an accessible preset, live contrast ratio) → Home (status card/room with tappable moods). Tap the ⓘ next to "PawNote" in any version for its write-up and trade-offs.
