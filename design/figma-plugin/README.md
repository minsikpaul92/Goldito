# Goldito Design Sync (Figma plugin)

Builds the Goldito library and screens in the team's Figma file without the Figma MCP call limits.

- **Expressive components** (top of the Components page): 15 components with their variants, captured from the Expressive prototype: Status Bar, App Bar, Tab Bar (Active=…), Tab Bar · Stay prototype, Stage Card (Stage × Done/Upcoming), Stage Header (Stage × Sections/Pages), Stepper, Button (Style × State × Width), Chip (On/Off), Tag, Demo Tag, Checklist Row, Consent Card, Message Bubble, List Row (Trailing × Lines × Tone). Which parts become components is set in `capture/components.js`. Edit one and every Expressive screen follows.
- **Variables and text styles** (if the file doesn't have them): `Color` (Default = `tokens.ts`, plus the **Balanced** look as a mode), `Size`, `Motion`, and six text styles (Title · Body · Body Strong · Small · Small Strong · Caption).
- **Components** page: 61 components and variant sets (core, live app, navigation, inputs, stay, care and transit, feedback), every fill, stroke, padding and radius bound to a variable. Hand-made components already on the page are left alone.
- **Screens**:
  - **Expressive (first)**: every screen of the Prototype tab in the Expressive look, built from the **Expressive components** (below) as instances, with each screen's own text and photos as overrides: the app tabs (Home · Bookings · Feed · Diary · Snap, Sitter Home, Settings, What's New), the whole stay ① – ⑤ walked by clicking and captured at full length, the Pages layout variation, and onboarding. Logos and icons are vectors; only pixel-art layers are images.
  - Below it, built from component **instances** so editing a component updates every screen (DESIGN.md D2):
  - **Today**: the live app's tabs, captured (Live) next to the Balanced look.
  - **Upcoming**: inquiry, care request, Meet & Greet, checkout, entry info, trip, handoff, 5-second check, daily note, DANGER, review, Life Record.
  - **Edge states**: 16 screens for owners and sitters when things don't go to plan (DESIGN.md §10).
  - **Onboarding** (exploration).

Playful lives in the clickable prototypes only. The Color variables get **Balanced** and **Expressive** modes.

- **Brand** page (created if missing): nine logo versions as **vector** components (from SVG, never PNG), three each (Icon master, Symbol master, Devpost), named `Logo/<Group>/<Version>/…`, at real size (1024 × 1024, 1500 × 1000). Export as SVG, or PNG at 1x. To refresh: `python3 design/figma-plugin/brand_svg.py` (reads `design/brand/logo-files/` and `data/brand-svg/`, expands SVG patterns Figma can't import), then `build.py`. Untick the other boxes to build only the logos.

Re-running replaces only what the plugin made before (tagged with plugin data).

## Run it (Figma desktop app)

1. Open the Goldito design file. It needs a page with “Screens” and one with “Components” in its name.
2. Menu → Plugins → Development → **Import plugin from manifest…** → pick `design/figma-plugin/manifest.json`.
3. Menu → Plugins → Development → **Goldito Design Sync**. A small window opens; press **Build**. Progress and any errors show in that window (about a minute).

## Tickets (design review from Figma)

The **Tickets** tab builds one section per design ticket on the **Tickets** page (created if missing), from the ticket's workbench page (for #147: `design/concept-prototypes/ticket-147.html`, published as an artifact where decisions are saved).

- **Push to Figma / Push update**: builds or rebuilds the ticket's section: a card with the issue and workbench links, the status and version, the decisions, the decided frames, the ticket's components, and the spec. Re-pushing replaces only what the plugin made; notes you add inside the section stay, and so do the status and the review history.
- **Auto-layout**: the frames are captured with their flex and grid layout, so boxes come in as auto-layout (direction, gap, padding, alignment, hug / fill / fixed), not fixed x / y. Parts Figma layers can't draw (the calendar hatch) come in as images.
- **The ticket's components**: elements the workbench marks `data-comp="Name"` (and `data-variant="Prop=Value"`) become components inside the ticket's section, not on the Components page, since a design option may not ship. The frames use instances. Edit a master and every frame follows; **Push update keeps your edits** to the masters (and to their texts) and only adds new variants. Tick **Rebuild this ticket's components** to start them over from the workbench.
- **Spec and Dev Mode**: the spec is a table (code in monospace, colour swatches bound to the Color variables, element names linking to their component). Each spec row that names a component (`<tr data-comp>`) is also that component's description and a Dev Mode annotation (category “Spec”) on its first instance, with its size, padding, gap, fills and corners pinned. Dev Mode reads the measurements from the layers; the spec adds what layers can't say: labels, test IDs, behaviour, the decision behind a value.
- **Submit for review**: marks the ticket **In review** (a new round), and writes a comment for the GitHub issue with links to the section and every frame, the decisions, the spec table and your note. **Copy comment** and **Open issue ↗**, or **Post to GitHub** if you saved a token.
- **Set status**: Draft · In review · Changes requested · Approved, shown as a pill on the canvas. Pushing an update after a review sends it back to Draft until you submit again.
- **GitHub posting (optional)**: a fine-grained token for `minsikpaul92/Goldito` with Issues: read and write, saved in this Figma app on your computer (`figma.clientStorage`). Without one, copy and paste.

Update a ticket after its workbench changes:
1. Serve the prototypes on :4001 (as above).
2. From `frontend/`: `NODE_PATH=$PWD/node_modules npx playwright test --config <repo>/design/figma-plugin/capture/playwright.config.ts tickets` → `data/tickets.json`
3. `python3 design/figma-plugin/build.py`, then **Push update** in the Tickets tab.

A ticket can also capture states its opening screen doesn't show (Oct 25): `window.__ticketStates = [{ cap, title, on, go }]`, where `go()` opens the sheet, photo or view and `on` names the `data-cap` phone to capture; the Moments, Intro and Pet tone tickets use it.

A new ticket = a workbench page that sets `window.__ticket` (id, title, issue, workbench, decisions, spec, specLinks) and marks its decided phones with `data-cap` and `data-title` (and its repeated parts with `data-comp`), added to `PAGES` in `capture/tickets.spec.ts`. The shared kit is `design/concept-prototypes/tickets/` (`wb.js`: `WB.decisions`, `WB.specRows`, `WB.specLinks`).

## Dev reference page (Oct 25)

**Build the Dev reference page** (Tickets tab) makes one page for the devs, "Dev reference": a header with how to read it, then one section per feature in `DEVREF` (`src/devref.js`), each with a status pill (Decided · in the app, Decided · build before Oct 28, Decided · after the freeze, Proposal · after the freeze, Proposal · needs a team call), its frames, decisions and notes. The first section copies the app tabs from the Screens page (run Screens first); the rest reuse `pushTicket` on this page (Intro, Moments, Playful words, UX calls, Pet tone, Little delights). Re-running rebuilds what the plugin drew; anything people add inside a section stays. Edit components on the Tickets page: this page is a reference copy. To add a feature, give its workbench a `__ticket`, add it to `PAGES` in `capture/tickets.spec.ts` and to `DEVREF`.

## Update after prototype changes

The Expressive capture runs with the clock fixed at Oct 23, 4 PM, because the stay prototype prints today's date; that keeps a re-run from flagging every screen with a dated line. The app tabs come from `concept-prototypes/redesign/expressive.html` (edit it, then `python3 redesign/build_app.py`), not from `app.html`, which is generated.

1. Serve the prototypes: `python3 -m http.server 4001 --directory design/concept-prototypes`
2. Capture the Expressive screens: from a `frontend/` with Playwright installed, `NODE_PATH=$PWD/node_modules npx playwright test --config <repo>/design/figma-plugin/capture/playwright.config.ts expressive` → `data/expressive.json` (about a minute)
3. Bundle: `python3 design/figma-plugin/build.py`, then run the plugin again.

Files: `src/` (plugin code), `capture/` (browser serializer + Playwright walk of every flow), `data/` (captured screens), `code.js` (generated bundle).

## How the import turns the browser into auto-layout (rules, Oct 19)

Fix the prototype or these rules, never only the Figma output: a re-run rebuilds components and screens from the capture, so hand edits there are lost.

| What the browser has | What Figma gets | Why |
| :--- | :--- | :--- |
| A label that is the only thing in a row (button, pill, chip) | The text **Fills** the row (fixed parent) or **Hugs** (hugging parent), centred when the row is | A longer label in an instance never wraps or clips |
| A one-line text in a row, even inside a wider box | **Hug** | Chips and buttons grow with their label |
| A one-line block of text (a title, a subline) | **Hug** (or Fill in a filling column), never a fixed wrapping width; after each screen, any one-line text that still wraps in Figma hugs its words and the fixed boxes around it grow (`repairWraps`) | Figma draws Fredoka and Jakarta a little wider than the browser, so the browser's exact width broke "Bookings" onto two lines (Oct 22) |
| A plain block whose children stack with one even gap | **Vertical auto-layout**, texts Fill | A longer line pushes the next one down instead of overlapping |
| One row of unequal grid columns (time · task · ✕) | **Horizontal auto-layout**, the widest column grows | Rows keep their gaps when texts change |
| `<input>` / `<textarea>` | Auto-layout with the field's own padding; the value **Fills**; one-line fields **truncate** with “…” | Fields look the same in every screen |
| A circle with a single icon inside | Auto-layout, icon centred both ways | The badge never sits off centre |
| Later items whose absolute part reaches back over the one before (the Stepper's lines), or CSS `z-index` falling along the row | **First on top** (`itemReverseZIndex`) | Lines sit under the circles |
| A frame turned into a component | The component keeps First on top | |
| Screen sections | Only the **Expressive** sections are built; Balanced and Live live on the **Archive** page (`BUILD_ARCHIVED_SCREENS = false` in `src/screens.js`) | Expressive is the look since Oct 19 |
| The logo | The prototypes draw the **pixel coin** (`concept-prototypes/assets/brand/goldito-coin.svg`, framed tight); Figma gets its vectors | The coin is the logo since Oct 19 |

Check a change without Figma: `node <claude-tools>/plugin-mock/mock.js code.js` runs the bundle on a mock of the Plugin API.

Known limits of the screen import: CSS pseudo-element shapes (timeline rails, some dots) and gradients are simplified; fonts fall back to Inter if a family isn't installed in Figma.

## Working in the file with others (Oct 22)

Devs work in this file too, so every run is safe to repeat:

- **Restore point first.** Before it changes anything, a run saves a named version: File › Show version history › "Goldito plugin · before …". Restore it to undo a run.
- **Only the plugin's own layers are replaced.** Stickies, notes and frames people add inside the plugin's sections stay put, and the run says how many it kept. A section the plugin no longer builds stays (renamed "No longer built · …") if someone left something in it.
- **Run log.** The plugin window and a "Run log" note on the Screens page list what each run changed: screens changed, new, removed and unchanged, by a fingerprint of each captured screen. The last 12 runs are kept.
- **What's new flags (Oct 23).** When a run or a ticket push changes a frame, it gets an orange outline and a tag above it, e.g. "Changed · Oct 23 · Copy · “Oct 9 to 12”" (what changed: Copy, Icons, Photos or Look, plus the first new text). A new frame gets a green "New · Oct 23". Flags stay 7 days, even across more runs the same day; they're locked and sit outside the frame, so Dev Mode inspects the screen as is. Removed screens are listed in the Run log.
- **"In the app" header (Oct 23).** That section was drawn by hand on Oct 19 and runs don't rebuild it. A Screens run now updates its App Header component once to header C (#294): your avatar in a thin ring instead of the menu icon, "Name · Role" under the title, no role chip. The header screens are instances, so they follow, and the drawer captions say "tap your avatar". Flagged "Changed · Header" for 7 days.
- **Decisions (Oct 23).** `src/decisions-data.js` lists every design decision with the date it was made (54 decided or shipped, 13 open proposals), compiled from the design site, DESIGN.md and the merged PRs. Each Components or Screens run applies the ones Figma can carry, then flags them green "Added · <date decided> · <what>" for 7 days after it first applies them:
  - **Fonts:** text styles follow the font decisions: Title and Section in Fredoka 600; Body, Small and Caption in Plus Jakarta Sans 400 to 500; Body Strong and Small Strong 600; new Button 700, Eyebrow 800 and an italic Placeholder; plus the color/placeholder variable (#807160). Captured text in a system font or Inter becomes Plus Jakarta Sans (#304), and ticket frames that changed get an "Added · Oct 22 · Plus Jakarta Sans" flag.
  - **Icons:** Components › "Icons · Lucide (app set)": one component per meaning, named like `Icon.tsx` (`Icon/bell`, `Icon/whatsNew`…), 24 px, stroke 2, color/text. The Oct 19 hand-drawn icons in "In the app" are redrawn with Lucide.
  - **Header C** in "In the app" (see below), and #147 on the Tickets page is flagged "Option B replaced by header C".
  - **The Decisions board** at the top of the Components page: every decision with its date, status, source, what it replaced and where it lives in Figma; proposals listed apart in orange.
  To add a decision, append it to `decisions-data.js` and re-run.
- **Same look or plain layers (Oct 23).** Each Expressive component remembers the fill and line it was captured with. A part that has the same layers but a different look (an ink chip vs a mint one) is drawn as plain layers, not as an instance that would keep the component's colours under its own text colour. The window counts them ("look different from their component"). Instances also keep their captured size after a text change.
- **Component changes and "Not linked" (Oct 23).** Each run compares every Expressive component variant with its last build (kept in the file as `xcompMeta`; the first tracked run compares with `data/xcomp-baseline.json`, the capture from before the Oct 23 chip fix). A changed component gets an orange tag beside its name, e.g. "Changed · Oct 23 · Look, Size · “State=On, State=Off”", a new one a green "New", for 7 days; removed variants are listed in the window and the Run log. A screen or ticket frame with parts drawn as plain layers gets a grey "Not linked · Chip · State=Off (look)" note under it, saying which part and why (look, layout or no component), so devs know it isn't a live instance.
- **Design tickets board (Oct 23).** Each Components or Screens run draws "Design tickets · today's slot" at the top of the Tickets page: every open track:design ticket grouped as In the slot today, Team calls, Ready to close and After the submission. It reads `concept-prototypes/design-tickets.js` (build.py copies it in), the same list as the site's Project page and the daily update, so update that file and rebuild.
- **Components page drift (Oct 23).** The library used to be placed below the Archive section, so each run moved it about 7,800 px down. It now starts below everything except the Archive.
- **Old plugin layers (Oct 23).** Untagged frames named like captured web classes ("jr-stage.is-current", or a frame made of "jr-stage-head" parts) are the plugin's own output from runs before tags existed, so a Screens run removes them and the Run log counts them. Anything else untagged stays.
- **What still changes on every run:** the screens and Expressive components are redrawn, so their node IDs change. Comment on the section or on your own frames, not on a plugin-drawn layer. The design site's Figma links go by layer name (`figma-nodes.js`) and are refreshed after a run.
