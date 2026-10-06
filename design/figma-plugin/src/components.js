/* Builds the PawNote component library on "3. Components" from the local variables
   (color/*, spacing/*, radius/*, size/*) and text styles (Title, Body, Body Strong, Small,
   Small Strong, Caption). Every fill, stroke, padding, gap and radius is bound to a variable.
   Components already made by hand or earlier (Button, Text Button, Chip, Card, Toast,
   Text Field, Segment) are left alone; this adds everything else the prototypes use. */

let V = {}, TS = {}, SAMPLE = null, TAG_SET = null;
function tag(tone, label) {
  const v = TAG_SET.children.find((c) => c.name === `Tone=${tone}`) || TAG_SET.children[0];
  const i = v.createInstance();
  const k = Object.keys(i.componentProperties).find((p) => p.startsWith("Label"));
  if (k && label != null) i.setProperties({ [k]: label });
  return i;
}

async function initDS(sampleHash) {
  V = {}; TS = {};
  for (const v of await figma.variables.getLocalVariablesAsync()) V[v.name] = v;
  for (const s of await figma.getLocalTextStylesAsync()) TS[s.name] = s;
  for (const st of ["Regular", "Medium", "Semi Bold", "Bold"]) await figma.loadFontAsync({ family: "Inter", style: st });
  SAMPLE = sampleHash;
}

const FALLBACK = { background: "#F7F7F5", surface: "#FFFFFF", text: "#1A1A1A", "text-muted": "#5C5C5C", primary: "#2D6A4F", "primary-text": "#FFFFFF",
  accent: "#D8F3DC", border: "#E5E5E0", error: "#B42318", success: "#067647", warning: "#B54708", overlay: "#1A1A1A",
  "error-surface": "#FEF3F2", "warning-surface": "#FFFAEB", "success-surface": "#ECFDF3", "border-strong": "#86867F", track: "#E5E5E0" };
const hexRGB = (h) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
function paint(name, opacity) {
  const base = { type: "SOLID", color: hexRGB(FALLBACK[name] || "#888888"), opacity: opacity == null ? 1 : opacity };
  const v = V[`color/${name}`];
  if (!v) return base;
  const bound = figma.variables.setBoundVariableForPaint(base, "color", v);
  return Object.assign({}, bound, { opacity: base.opacity }); // binding can drop the tint opacity
}
function bindNum(node, field, token) {
  if (token == null) return;
  if (typeof token === "number") { node[field] = token; return; }
  const v = V[token.includes("/") ? token : `spacing/${token}`];
  if (v) node.setBoundVariable(field, v);
}
function bindRadius(node, token) {
  if (token == null) return;
  for (const k of ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"]) {
    if (typeof token === "number") node[k] = token; else bindNum(node, k, token.includes("/") ? token : `radius/${token}`);
  }
}

/* Auto-layout frame. o: dir, w, h, pad (token | [t,r,b,l]), gap, align, justify, fill, stroke, sw, dashed, radius, minH, wrap, opacity */
function box(name, o = {}, children = []) {
  const f = figma.createFrame();
  f.name = name;
  f.layoutMode = o.dir === "H" ? "HORIZONTAL" : "VERTICAL";
  if (o.w || o.h) f.resize(o.w || 100, o.h || 100);
  const horiz = f.layoutMode === "HORIZONTAL";
  f.primaryAxisSizingMode = (horiz ? o.w : o.h) ? "FIXED" : "AUTO";
  f.counterAxisSizingMode = (horiz ? o.h : o.w) ? "FIXED" : "AUTO";
  if (o.pad != null) {
    const [t, r, b, l] = Array.isArray(o.pad) ? o.pad : [o.pad, o.pad, o.pad, o.pad];
    bindNum(f, "paddingTop", t); bindNum(f, "paddingRight", r); bindNum(f, "paddingBottom", b); bindNum(f, "paddingLeft", l);
  }
  if (o.gap != null) bindNum(f, "itemSpacing", o.gap);
  if (o.align) f.counterAxisAlignItems = o.align;
  if (o.justify) f.primaryAxisAlignItems = o.justify;
  if (o.wrap) { f.layoutWrap = "WRAP"; if (o.gap != null) bindNum(f, "counterAxisSpacing", o.gap); }
  f.fills = o.fill ? [paint(o.fill, o.fillOpacity)] : [];
  if (o.stroke) { f.strokes = [paint(o.stroke)]; f.strokeWeight = o.sw || 1; f.strokeAlign = "INSIDE"; if (o.dashed) f.dashPattern = [4, 4]; }
  bindRadius(f, o.radius);
  if (o.minH) bindNum(f, "minHeight", o.minH);
  if (o.opacity != null) f.opacity = o.opacity;
  for (const c of children) if (c) add(f, c);
  return f;
}
// Append; nodes marked with fill() stretch to the parent's width, grow() take the free space.
const FILLS = new Set(), GROWS = new Set();
function add(parent, child) {
  parent.appendChild(child);
  if (FILLS.has(child.id) && parent.layoutMode !== "NONE") {
    if (child.type === "TEXT") child.textAutoResize = "HEIGHT";
    child.layoutSizingHorizontal = "FILL";
  }
  if (GROWS.has(child.id) && parent.layoutMode !== "NONE") child.layoutGrow = 1;
  return child;
}
const fill = (n) => { FILLS.add(n.id); return n; };
const grow = (n) => { GROWS.add(n.id); return n; };

async function txt(chars, style = "Body", color = "text", o = {}) {
  const t = figma.createText();
  t.name = o.name || "Text";
  if (TS[style]) await t.setTextStyleIdAsync(TS[style].id);
  else { t.fontName = { family: "Inter", style: "Regular" }; }
  t.characters = chars;
  t.fills = [paint(color)];
  if (o.size) t.fontSize = o.size;
  if (o.weight) t.fontName = { family: "Inter", style: o.weight };
  if (o.upper) t.textCase = "UPPER";
  if (o.strike) t.textDecoration = "STRIKETHROUGH";
  if (o.align) t.textAlignHorizontal = o.align;
  if (o.w) { t.resize(o.w, t.height); t.textAutoResize = "HEIGHT"; }
  if (o.fill) FILLS.add(t.id);
  return t;
}
function rect(name, w, h, o = {}) {
  const r = figma.createRectangle();
  r.name = name; r.resize(w, h);
  r.fills = o.image && SAMPLE ? [{ type: "IMAGE", imageHash: SAMPLE, scaleMode: "FILL" }] : o.fill ? [paint(o.fill, o.fillOpacity)] : [];
  if (o.stroke) { r.strokes = [paint(o.stroke)]; r.strokeWeight = o.sw || 1; }
  bindRadius(r, o.radius);
  return r;
}
async function await0(chars, muted) { return txt(chars, "Caption", muted ? "text-muted" : "primary-text"); }
function dot(name, size, color) { const e = figma.createEllipse(); e.name = name; e.resize(size, size); e.fills = [paint(color)]; return e; }

/* ---------- component factories ---------- */
const PLACED = [];
async function single(name, desc, build, textProps = []) {
  const frame = await build();
  const comp = figma.createComponentFromNode(frame);
  comp.name = name;
  comp.description = desc;
  for (const [prop, layer] of textProps) {
    const node = comp.findOne((n) => n.type === "TEXT" && n.name === layer);
    if (!node) continue;
    const key = comp.addComponentProperty(prop, "TEXT", node.characters);
    node.componentPropertyReferences = { characters: key };
  }
  PLACED.push(comp);
  return comp;
}
async function variants(name, desc, defs, textProps = [], width = 0) {
  const comps = [];
  for (const [variantName, build] of defs) {
    const frame = await build();
    const c = figma.createComponentFromNode(frame);
    c.name = variantName;
    comps.push(c);
  }
  const set = figma.combineAsVariants(comps, figma.currentPage);
  set.name = name;
  set.description = desc;
  set.layoutMode = "HORIZONTAL";
  set.layoutWrap = "WRAP";
  set.itemSpacing = 24; set.counterAxisSpacing = 24;
  set.paddingTop = set.paddingBottom = set.paddingLeft = set.paddingRight = 24;
  set.primaryAxisSizingMode = width ? "FIXED" : "AUTO";
  set.counterAxisSizingMode = "AUTO";
  if (width) set.resize(width, set.height);
  for (const [prop, layer] of textProps) {
    const first = set.children[0].findOne((n) => n.type === "TEXT" && n.name === layer);
    if (!first) continue;
    const key = set.addComponentProperty(prop, "TEXT", first.characters);
    for (const v of set.children) { const n = v.findOne((x) => x.type === "TEXT" && x.name === layer); if (n) n.componentPropertyReferences = { characters: key }; }
  }
  PLACED.push(set);
  return set;
}

/* ---------- the library ---------- */
const LIBRARY = [
  // ===== Core (only if the file doesn't already have hand-made versions)
  ["Core", async () => {
    // Tag: status label on a light surface of the same tone (never tone on tone).
    const TONES = { Danger: ["error-surface", "error"], Warning: ["warning-surface", "warning"], Success: ["success-surface", "success"], Brand: ["accent", "primary"], Neutral: ["surface", "text-muted"] };
    TAG_SET = await variants("Tag", "Status label. Text always sits on the light surface of its tone (error-surface, warning-surface, success-surface, accent), never on the solid tone color. Warning = heads-up (allergy, behavior); Danger = blocked ingredient; Brand = booking status.",
      Object.entries(TONES).map(([tone, [bg, fg]]) => [`Tone=${tone}`, async () =>
        box("Tag", { dir: "H", pad: [4, "sm", 4, "sm"], radius: "sm", fill: bg, stroke: tone === "Neutral" ? "border" : undefined, align: "CENTER" },
          [await txt(tone === "Warning" ? "⚠️ Allergic to chicken" : tone === "Danger" ? "chicken" : tone === "Success" ? "Passes AA ✓" : tone === "Brand" ? "Confirmed" : "😊 Happy", "Small Strong", fg, { name: "Label" })])]), [["Label", "Label"]]);
    const has = (name) => figma.currentPage.children.some((n) => n.name === name && n.getPluginData("pawnote") !== "components" && (n.type === "COMPONENT" || n.type === "COMPONENT_SET"));
    if (!has("Button")) await variants("Button", "The one filled action per screen (§7.1). Secondary = white + border. Disabled = neutral (never a faded brand color). Loading keeps the color and adds a spinner. Code: components/ui/Button.tsx",
      ["Primary", "Secondary"].flatMap((style) => ["Default", "Disabled", "Loading"].map((state) => [`Style=${style}, State=${state}`, async () => {
        const dis = state === "Disabled", pri = style === "Primary";
        const fg = dis ? "text-muted" : pri ? "primary-text" : "primary";
        const kids = [];
        if (state === "Loading") { const e = figma.createEllipse(); e.name = "Spinner"; e.resize(16, 16); e.fills = []; e.strokes = [paint(fg)]; e.strokeWeight = 2; e.arcData = { startingAngle: 0, endingAngle: Math.PI * 1.5, innerRadius: 1 }; kids.push(e); }
        kids.push(await txt("Request booking", "Body Strong", fg, { name: "Label" }));
        return box("Button", { dir: "H", pad: ["sm", "md", "sm", "md"], gap: "sm", align: "CENTER", justify: "CENTER", radius: "md", minH: "size/touch-target",
          fill: dis ? "border" : pri ? "primary" : "surface", stroke: dis ? "border" : pri ? "primary" : "border" }, kids);
      }])), [["Label", "Label"]]);
    if (!has("Text Button")) await variants("Text Button", "Secondary action as a text link (keeps one filled button per screen). Danger = destructive link. Code: components/ui/TextButton.tsx",
      ["Default", "Danger"].flatMap((tone) => ["Enabled", "Disabled"].map((st) => [`Tone=${tone}, State=${st}`, async () =>
        box("Text Button", { dir: "H", pad: [0, "sm", 0, "sm"], align: "CENTER", minH: "size/touch-target", opacity: st === "Disabled" ? 0.4 : 1 },
          [await txt(tone === "Danger" ? "Cancel booking" : "Suggest another time", "Body Strong", tone === "Danger" ? "error" : "primary", { name: "Label" })])])), [["Label", "Label"]]);
    if (!has("Chip")) await variants("Chip", "Small label (allergens). Removable adds ✕. Code: components/ui/Chip.tsx", ["No", "Yes"].map((r) => [`Removable=${r}`, async () =>
      box("Chip", { dir: "H", gap: "xs", pad: ["xs", "sm", "xs", "sm"], radius: "sm", fill: "surface", stroke: "border", align: "CENTER" },
        [await txt("chicken", "Small", "text", { name: "Label" }), r === "Yes" ? await txt("✕", "Small", "text-muted") : null].filter(Boolean))]), [["Label", "Label"]]);
    if (!has("Card")) await single("Card", "Container: surface, radius/lg, spacing/md padding, 1 px border. Code: components/ui/Card.tsx", async () =>
      box("Card", { w: 340, gap: "xs", pad: "md", radius: "lg", fill: "surface", stroke: "border" },
        [await txt("Lucy's place · Oct 9–12", "Body Strong", "text", { name: "Title" }), await txt("Max and Mochi · Boarding · Confirmed", "Small", "text-muted", { name: "Body" })]), [["Title", "Title"], ["Body", "Body"]]);
    if (!has("Toast")) await single("Toast", "Success feedback after an action; above the tab bar and any pinned footer; hides after 3 s. Never the only signal for DANGER. Code: providers/ToastProvider.tsx", async () =>
      box("Toast", { dir: "H", w: 370, pad: "md", radius: "md", fill: "text", justify: "CENTER", align: "CENTER" }, [await txt("Max is added 🐶", "Body", "primary-text", { name: "Message" })]), [["Message", "Message"]]);
    if (!has("Text Field")) await variants("Text Field", "Label above, 44 min height. Focus = primary border; Error = error border + message (clears on edit). Placeholders start with 'e.g.'. Code: components/ui/TextField.tsx", ["Default", "Focused", "Error"].map((st) => [`State=${st}`, async () =>
      box("Text Field", { w: 320, gap: "xs" }, [await txt("Pet's name", "Small Strong", "text-muted", { name: "Label" }),
        fill(box("Input", { dir: "H", pad: ["sm", "md", "sm", "md"], radius: "md", minH: "size/touch-target", fill: "surface", stroke: st === "Focused" ? "primary" : st === "Error" ? "error" : "border-strong", align: "CENTER" },
          [await txt(st === "Default" ? "e.g. Max" : "Max", "Body", st === "Default" ? "text-muted" : "text", { name: "Value" })])),
        await txt(st === "Error" ? "Enter your pet's name." : "Shown on every booking.", "Small", st === "Error" ? "error" : "text-muted", { name: "Helper" })])]), [["Label", "Label"]]);
    if (!has("Segment")) await variants("Segment", "One option of a Segmented Control (2–4 options). Selected = primary border + accent fill. Code: components/ui/SegmentedControl.tsx", ["Default", "Selected", "Disabled"].map((st) => [`State=${st}`, async () =>
      box("Segment", { dir: "H", w: 140, h: 44, radius: "md", align: "CENTER", justify: "CENTER", fill: st === "Selected" ? "accent" : "surface", stroke: st === "Selected" ? "primary" : "border-strong", opacity: st === "Disabled" ? 0.5 : 1 },
        [await txt("🐶 Dog", st === "Selected" ? "Body Strong" : "Body", "text", { name: "Label" })])]), [["Label", "Label"]]);
  }],

  // ===== Live app redesign (D47 tabs)
  ["Live app · redesign", async () => {
    await single("Stay Summary Card", "Owner Home hero during a stay: photo, 'With Lucy now', day of stay, handoffs and today's care progress. Answers 'is my pet OK?' first.", async () => {
      const c = box("Stay Summary", { w: 360, radius: "lg", fill: "surface", stroke: "border" }, [rect("Photo", 360, 150, { image: true })]);
      const body = box("Body", { w: 360, gap: "sm", pad: "md" }, [
        fill(box("Top", { dir: "H", justify: "SPACE_BETWEEN", align: "CENTER" }, [box("Live", { dir: "H", gap: 6, pad: [3, 10, 3, 10], radius: 999, fill: "accent", align: "CENTER" }, [dot("live", 7, "success"), await txt("With Lucy now", "Small Strong", "primary", { name: "Status" })]), await txt("Day 2 of 3", "Small", "text-muted", { name: "Day" })])),
        await txt("Max & Mochi are with Lucy", "Body Strong", "text", { name: "Title", w: 328 }),
        await txt("Picked up Fri 7:30 AM · photo verified · home Mon 5:00 PM", "Small", "text-muted", { name: "Handoffs", w: 328 }),
        fill(box("Care", { dir: "H", justify: "SPACE_BETWEEN" }, [await txt("Today's care", "Small Strong"), await txt("3 of 5 done", "Small", "text-muted", { name: "Progress" })])),
        box("Bar", { dir: "H", gap: 4, w: 328 }, [1, 1, 1, 0, 0].map((on, i) => grow(rect(`seg${i}`, 60, 6, { fill: on ? "primary" : "track", radius: 3 })))),
      ]);
      add(c, body); return c;
    }, [["Title", "Title"], ["Day", "Day"], ["Handoffs", "Handoffs"], ["Progress", "Progress"]]);

    await single("Latest Update Row", "The newest thing the sitter shared, on owner Home: photo + time + one line.", async () =>
      box("Latest Update", { dir: "H", w: 360, gap: "sm", pad: "md", radius: "lg", fill: "surface", stroke: "border" }, [
        rect("Photo", 56, 56, { image: true, radius: 12 }),
        grow(box("Copy", { gap: 2 }, [await txt("LATEST · 9:02 AM", "Caption", "text-muted", { name: "Meta" }), await txt("Breakfast done. Max finished every bit and asked for more.", "Small", "text", { name: "Text", w: 260 })]))]),
      [["Meta", "Meta"], ["Text", "Text"]]);

    await single("Pet Mini Card", "Compact pet card (Home 'Your pets'). Allergies show as a Heads-up Tag below, not inside.", async () =>
      box("Pet Mini", { dir: "H", w: 170, gap: "sm", pad: 10, radius: "lg", fill: "surface", stroke: "border", align: "CENTER" }, [
        rect("Photo", 36, 36, { image: true, radius: 18 }), box("Copy", {}, [await txt("Max", "Body Strong", "text", { name: "Name" }), await txt("Maltese · 4 yrs", "Caption", "text-muted", { name: "Meta" })])]),
      [["Name", "Name"], ["Meta", "Meta"]]);

    await variants("Booking Card", "Bookings tab row: sitter, pets, dates, status, the 5-step stay, handoff rows with who drives, and the paid total.", ["Requested", "Confirmed", "In care"].map((st) => [`Status=${st}`, async () => {
      const step = async (state, n) => box(`Step ${n}`, { dir: "H", w: 22, h: 22, radius: 11, fill: state === "done" ? "success" : state === "now" ? "primary" : "border", align: "CENTER", justify: "CENTER" }, [await await0(state === "done" ? "✓" : String(n), state === "todo")]);
      const cur = st === "Requested" ? 2 : st === "Confirmed" ? 3 : 4;
      const steps = box("Steps", { dir: "H", gap: 4, align: "CENTER", w: 328 }, []);
      for (let n = 1; n <= 5; n++) { add(steps, await step(n < cur ? "done" : n === cur ? "now" : "todo", n)); if (n < 5) add(steps, grow(rect("line", 10, 2, { fill: n < cur ? "success" : "border" }))); }
      return box("Booking Card", { w: 360, gap: "sm", pad: "md", radius: "lg", fill: "surface", stroke: "border" }, [
        fill(box("Head", { dir: "H", justify: "SPACE_BETWEEN", align: "CENTER" }, [
          box("Who", {}, [await txt("Lucy · Boarding", "Body Strong", "text", { name: "Title" }), await txt("Max, Mochi · Oct 9–12", "Caption", "text-muted", { name: "Meta" })]),
          tag(st === "Requested" ? "Neutral" : "Brand", st)])),
        steps,
        fill(rect("Divider", 328, 1, { fill: "border" })),
        fill(box("Drop-off", { dir: "H", justify: "SPACE_BETWEEN" }, [await txt("🚗 Drop-off · you drive", "Small"), await txt("Fri 7:30 AM", "Small Strong")])),
        fill(box("Pick-up", { dir: "H", justify: "SPACE_BETWEEN" }, [await txt("🏠 Pick-up · you drive", "Small"), await txt("Mon 5:00 PM", "Small Strong")])),
        fill(box("Total", { dir: "H", justify: "SPACE_BETWEEN" }, [await txt(st === "Requested" ? "Quote" : "Paid · 5 consents signed", "Small", "text-muted"), await txt("$268.13 CAD", "Small Strong")])),
      ]);
    }]), [["Title", "Title"], ["Meta", "Meta"]]);

    await single("Feature Row", "Welcome screen value line: emoji tile + title + one line.", async () =>
      box("Feature Row", { dir: "H", w: 360, gap: "sm", align: "CENTER" }, [
        box("Tile", { dir: "H", w: 40, h: 40, radius: "md", fill: "accent", align: "CENTER", justify: "CENTER" }, [await txt("📸", "Body", "text", { name: "Emoji" })]),
        box("Copy", {}, [await txt("Photos all day", "Body Strong", "text", { name: "Title" }), await txt("Each one with a short AI caption.", "Small", "text-muted", { name: "Line" })])]),
      [["Emoji", "Emoji"], ["Title", "Title"], ["Line", "Line"]]);

    await single("Day Header", "Groups Feed and Diary by day: date + count.", async () =>
      box("Day Header", { dir: "H", w: 360, justify: "SPACE_BETWEEN", align: "CENTER" }, [await txt("Today · Sat Oct 10", "Body Strong", "text", { name: "Day" }), await txt("6 photos", "Caption", "text-muted", { name: "Count" })]),
      [["Day", "Day"], ["Count", "Count"]]);

    await variants("Timeline Row", "Diary entry on a time rail: time, dot, text, optional photo.", ["Text", "Photo"].map((k) => [`Kind=${k}`, async () =>
      box("Timeline Row", { dir: "H", w: 360, gap: "sm" }, [
        box("Time", { w: 44 }, [await txt("9:02", "Caption", "text-muted", { name: "Time" })]),
        box("Rail", { w: 14, align: "CENTER" }, [box("Dot", { dir: "H", w: 10, h: 10, radius: 5, stroke: "primary", sw: 2, fill: "surface" }), rect("Line", 2, 28, { fill: "border" })]),
        grow(box("Body", { dir: "H", gap: "sm", align: "CENTER" }, [k === "Photo" ? rect("Photo", 36, 36, { image: true, radius: 8 }) : null, await txt("Walk · 20 min, all good", "Small", "text", { name: "Text" })].filter(Boolean))),
      ])]), [["Time", "Time"], ["Text", "Text"]]);

    await variants("Grid Photo", "Feed grid tile with a category + time badge.", ["Meals", "Walks", "Naps", "Play"].map((k) => [`Category=${k}`, async () => {
      const t = box("Grid Photo", { w: 116, h: 116, radius: 8 }, []); t.layoutMode = "NONE";
      t.appendChild(rect("Photo", 116, 116, { image: true, radius: 8 }));
      const b = box("Badge", { dir: "H", pad: [1, 6, 1, 6], radius: 999, fill: "surface" }, [await txt(`${{ Meals: "🍽️", Walks: "🦮", Naps: "😴", Play: "🎾" }[k]} 9:02`, "Caption", "text", { name: "Badge" })]);
      t.appendChild(b); b.x = 4; b.y = 94; t.clipsContent = true; return t;
    }]));

    await single("Next Task Card", "Sitter Home hero: the next scheduled task and the one primary action, Complete with photo (DESIGN.md §7.1).", async () =>
      box("Next Task", { w: 360, gap: "sm", pad: "md", radius: "lg", fill: "surface", stroke: "primary", sw: 2 }, [
        await txt("NEXT · 2:00 PM", "Caption", "primary", { name: "When" }),
        box("Row", { dir: "H", gap: "sm", align: "CENTER" }, [rect("Photo", 40, 40, { image: true, radius: 20 }),
          box("Copy", {}, [await txt("Max · skin pill in a treat", "Body Strong", "text", { name: "Task" }), await txt("From Chloe's care request", "Caption", "text-muted", { name: "Source" })])]),
        fill(box("Action", { dir: "H", pad: ["sm", "md", "sm", "md"], radius: "md", fill: "primary", justify: "CENTER", align: "CENTER", minH: "size/touch-target" }, [await txt("📷 Complete with photo", "Body Strong", "primary-text")]))]),
      [["When", "When"], ["Task", "Task"], ["Source", "Source"]]);

    await single("Mood Result Card", "Mood tab (11.9): photo or clip + a 'for fun' read of the pet's mood. Always says it isn't a health check.", async () =>
      box("Mood Result", { w: 360, radius: "lg", fill: "surface", stroke: "border" }, [rect("Photo", 360, 180, { image: true }),
        box("Body", { w: 360, gap: "xs", pad: "md" }, [await txt("JUST FOR FUN", "Caption", "primary"), await txt("Max seems playful today 😄", "Body Strong", "text", { name: "Result" }),
          await txt("From Lucy's 9:02 AM walk clip. Not a health check.", "Small", "text-muted", { name: "Source", w: 328 })])]),
      [["Result", "Result"], ["Source", "Source"]]);
  }],

  // ===== Navigation & structure
  ["Navigation", async () => {
    await variants("Step Dot", "Onboarding progress in the top bar. Done steps stay tinted.", ["Todo", "Active", "Done"].map((s) => [`State=${s}`, async () =>
      box("dot", { dir: "H" }, [rect("dot", s === "Active" ? 18 : 6, 6, { fill: s === "Todo" ? "border-strong" : "primary", fillOpacity: s === "Done" ? 0.45 : 1, radius: 3 })])]));

    await variants("Icon Button", "Header icon (ⓘ notes, 🔔 updates, profile). 44 × 44 hit area; the badge dot marks unread updates.", ["Default", "Badge"].map((s) => [`State=${s}`, async () => {
      const b = box("Icon Button", { dir: "H", w: 44, h: 44, align: "CENTER", justify: "CENTER", radius: 22 }, [await txt("🔔", "Body", "text", { name: "Icon" })]);
      if (s === "Badge") { const d = dot("Badge", 8, "error"); b.appendChild(d); d.layoutPositioning = "ABSOLUTE"; d.x = 30; d.y = 8; }
      return b;
    }]), [["Icon", "Icon"]]);

    await variants("Top Bar", "App: tab title + bell (unread dot) + profile avatar. Detail: Back + title (screens opened from a booking). Onboarding: Back + step dots. Log out and settings live in Profile (D47).", ["App", "Detail", "Onboarding"].map((s) => [`Kind=${s}`, async () => {
      if (s === "Detail") return box("Top Bar", { dir: "H", w: 402, h: 56, pad: [0, "md", 0, "md"], align: "CENTER", justify: "SPACE_BETWEEN", fill: "background" }, [
        await txt("‹ Back", "Body Strong", "primary", { name: "Leading" }), await txt("Booking", "Body Strong", "text", { name: "Title" }), box("Spacer", { dir: "H", w: 52, h: 10 })]);
      if (s === "Onboarding") return box("Top Bar", { dir: "H", w: 402, h: 52, pad: [0, "md", 0, "md"], align: "CENTER", justify: "SPACE_BETWEEN", fill: "background" }, [
        await txt("‹ Back", "Body Strong", "primary", { name: "Leading" }),
        box("Dots", { dir: "H", gap: 6, align: "CENTER" }, [rect("d1", 6, 6, { fill: "primary", radius: 3 }), rect("d2", 18, 6, { fill: "primary", radius: 3 }), rect("d3", 6, 6, { fill: "border", radius: 3 })]),
        box("Spacer", { dir: "H", w: 44, h: 10 })]);
      const bell = box("Bell", { dir: "H", w: 44, h: 44, align: "CENTER", justify: "CENTER" }, [await txt("🔔", "Body")]);
      const d = dot("Unread", 8, "error"); bell.appendChild(d); d.layoutPositioning = "ABSOLUTE"; d.x = 28; d.y = 9;
      return box("Top Bar", { dir: "H", w: 402, h: 56, pad: [0, "md", 0, "md"], align: "CENTER", justify: "SPACE_BETWEEN", fill: "background" }, [
        await txt("Home", "Title", "text", { name: "Title", size: 20 }),
        box("Actions", { dir: "H", gap: "xs", align: "CENTER" }, [bell,
          box("Avatar", { dir: "H", w: 30, h: 30, radius: 15, fill: "accent", align: "CENTER", justify: "CENTER" }, [await txt("C", "Small Strong", "primary", { name: "Initial" })])])]);
    }]), [["Title", "Title"]]);

    await variants("Tab Bar Item", "One tab: icon + label. Active = filled pill + primary label.", ["Default", "Active"].map((s) => [`State=${s}`, async () =>
      box("Tab", { w: 72, gap: "xs", align: "CENTER", pad: ["sm", 0, "sm", 0] }, [
        box("Pill", { dir: "H", w: 52, h: 30, align: "CENTER", justify: "CENTER", radius: 15, fill: s === "Active" ? "accent" : undefined }, [await txt("🏠", "Body", "text", { name: "Icon" })]),
        await txt("Home", "Caption", s === "Active" ? "primary" : "text-muted", { name: "Label" }),
      ])]), [["Label", "Label"], ["Icon", "Icon"]]);

    await variants("Tab Bar", "Both roles: Home · Bookings · Feed · Diary · Mood (D47 / D47b). Pick the active tab with the Active property. Settings and Log out are in Profile, not a tab.",
      ["Home", "Bookings", "Feed", "Diary", "Mood"].map((active) => [`Active=${active}`, async () => {
        const bar = box("Tab Bar", { dir: "H", w: 402, h: 60, justify: "SPACE_BETWEEN", pad: [0, "sm", 0, "sm"], fill: "surface", stroke: "border", align: "CENTER" });
        bar.strokeTopWeight = 1; bar.strokeBottomWeight = 0; bar.strokeLeftWeight = 0; bar.strokeRightWeight = 0;
        for (const [icon, label] of [["🏠", "Home"], ["🗓️", "Bookings"], ["🖼️", "Feed"], ["📖", "Diary"], ["🙂", "Mood"]]) {
          const on = label === active;
          add(bar, box(label, { gap: 2, align: "CENTER", w: 70 }, [box("Pill", { dir: "H", w: 52, h: 28, align: "CENTER", justify: "CENTER", radius: 14, fill: on ? "accent" : undefined }, [await txt(icon, "Body")]),
            await txt(label, "Caption", on ? "primary" : "text-muted")]));
        }
        return bar;
      }]), [], 2200);

    await single("Bottom Sheet", "Sheet inside the phone frame: title + Close, scrolling body, optional pinned primary. Backdrop closes it. Never use a sheet for DANGER (§7.4).", async () =>
      box("Bottom Sheet", { w: 402, gap: "sm", pad: ["md", "md", "lg", "md"], fill: "surface", radius: 16 }, [
        box("Grab", { dir: "H", w: 370, justify: "CENTER" }, [rect("Grab", 40, 4, { fill: "border", radius: 2 })]),
        fill(box("Header", { dir: "H", justify: "SPACE_BETWEEN", align: "CENTER" }, [await txt("Updates", "Body Strong", "text", { name: "Title" }), await txt("Close", "Body Strong", "primary")])),
        fill(box("Body", { gap: "sm" }, [await txt("Content goes here.", "Small", "text-muted", { name: "Body", fill: true })])),
      ]), [["Title", "Title"]]);

    await single("Empty State", "Before something exists: emoji + what appears here + who adds it + one action (DESIGN.md §7.5). Also the gate on Feed / Care / Reports before pick-up.", async () =>
      box("Empty State", { w: 340, gap: "sm", align: "CENTER", pad: ["xl", "md", "xl", "md"] }, [
        await txt("🗓️", "Title", "text", { name: "Emoji", size: 40 }),
        await txt("Feed starts when Max is with Lucy", "Body Strong", "text", { name: "Title", w: 300, align: "CENTER" }),
        await txt("Everything shows up here on its own after pick-up.", "Small", "text-muted", { name: "Message", w: 300, align: "CENTER" }),
        box("Action", { dir: "H", pad: ["sm", "md", "sm", "md"], radius: "md", stroke: "border", fill: "surface", minH: "size/touch-target", align: "CENTER" }, [await txt("Open the stay", "Body Strong", "primary", { name: "Action" })]),
      ]), [["Title", "Title"], ["Message", "Message"], ["Action", "Action"]]);
  }],

  // ===== Inputs & selection
  ["Inputs & selection", async () => {
    await variants("Choice Card", "Big radio choice (role, cancellation policy). Selected = 2 px primary ring + tint + check.", [["Large", 1], ["Compact", 0]].flatMap(([size, big]) => ["No", "Yes"].map((sel) => [`Size=${size}, Selected=${sel}`, async () => {
      const on = sel === "Yes";
      const kids = [];
      if (big) kids.push(box("Emoji", { dir: "H", w: 48, h: 48, align: "CENTER", justify: "CENTER", radius: 14, fill: "accent" }, [await txt("🏡", "Title", "text", { name: "Emoji" })]));
      kids.push(grow(box("Copy", { gap: 2 }, [await txt(big ? "I have a pet" : "Moderate", "Body Strong", "text", { name: "Title" }),
        await txt(big ? "Book sitters and follow along" : "Full refund up to 5 days before", "Small", "text-muted", { name: "Subtitle" })])));
      kids.push(box("Tick", { dir: "H", w: 22, h: 22, align: "CENTER", justify: "CENTER", radius: 11, fill: on ? "primary" : undefined, stroke: on ? "primary" : "border-strong", sw: 2 }, on ? [await txt("✓", "Caption", "primary-text")] : []));
      return box("Choice", { dir: "H", w: 340, gap: "md", align: "CENTER", pad: big ? "md" : ["sm", "md", "sm", "md"], radius: "lg", fill: on ? "accent" : "surface", stroke: on ? "primary" : "border-strong", sw: on ? 2 : 1 }, kids);
    }])), [["Title", "Title"], ["Subtitle", "Subtitle"]]);

    await variants("Switch", "On/off setting. Locked = always on (safety alerts).", ["Off", "On", "Locked"].map((s) => [`State=${s}`, async () => {
      const on = s !== "Off";
      const track = box("Switch", { dir: "H", w: 46, h: 28, pad: 3, radius: 14, fill: on ? "primary" : "border-strong", justify: on ? "MAX" : "MIN", align: "CENTER", opacity: s === "Locked" ? 0.55 : 1 });
      add(track, dot("Knob", 22, "surface"));
      return track;
    }]));

    await single("Switch Row", "Label + one line + Switch, for notification and service settings.", async () =>
      box("Switch Row", { dir: "H", w: 340, justify: "SPACE_BETWEEN", align: "CENTER", pad: ["sm", 0, "sm", 0], gap: "md" }, [
        grow(box("Copy", { gap: 2 }, [await txt("Daily report", "Body Strong", "text", { name: "Title" }), await txt("Each evening at 8 PM", "Small", "text-muted", { name: "Subtitle" })])),
        box("Switch", { dir: "H", w: 46, h: 28, pad: 3, radius: 14, fill: "primary", justify: "MAX", align: "CENTER" }, [dot("Knob", 22, "surface")]),
      ]), [["Title", "Title"], ["Subtitle", "Subtitle"]]);

    await single("Stepper", "− value + with 44 × 44 buttons; the stand-in for native pickers (rates, times, counts — §7.7).", async () => {
      const btn = async (c) => box(c === "−" ? "Minus" : "Plus", { dir: "H", w: 44, h: 44, align: "CENTER", justify: "CENTER", radius: "md", stroke: "border-strong", fill: "surface" }, [await txt(c, "Body Strong")]);
      return box("Stepper", { dir: "H", gap: "xs", align: "CENTER" }, [await btn("−"),
        box("Value", { w: 72, align: "CENTER" }, [await txt("$55", "Body Strong", "text", { name: "Value" }), await txt("/ night", "Caption", "text-muted", { name: "Unit" })]), await btn("+")]);
    }, [["Value", "Value"], ["Unit", "Unit"]]);

    await variants("Filter Chip", "Selectable chip (feed filter, service, age, allergies). Active = primary fill.", ["Default", "Active"].map((s) => [`State=${s}`, async () =>
      box("Filter Chip", { dir: "H", pad: ["sm", "md", "sm", "md"], radius: 999, fill: s === "Active" ? "primary" : "surface", stroke: s === "Active" ? undefined : "border-strong", align: "CENTER", minH: "size/touch-target" }, [
        await txt("🍽️ Meals", "Small Strong", s === "Active" ? "primary-text" : "text", { name: "Label" })])]), [["Label", "Label"]]);

    await variants("Suggestion Chip", "5-second check (D38): AI-suggested fact from today. Tap turns a wrong one off (struck through).", ["On", "Off"].map((s) => [`State=${s}`, async () =>
      box("Suggestion Chip", { dir: "H", pad: ["xs", "md", "xs", "md"], radius: 999, fill: s === "On" ? "primary" : "surface", stroke: s === "On" ? undefined : "border-strong", align: "CENTER", minH: "size/touch-target" }, [
        await txt("🦮 Walk 20 min", "Small Strong", s === "On" ? "primary-text" : "text-muted", { name: "Label", strike: s === "Off" })])]), [["Label", "Label"]]);

    await variants("Photo Tile", "Photo picker tile (pet photo, 5-second check ≤ 2). Selected = ring + check. Upload = dashed.", ["Default", "Selected", "Upload"].map((s) => [`State=${s}`, async () => {
      if (s === "Upload") return box("Photo Tile", { w: 76, h: 76, radius: "md", stroke: "border-strong", sw: 2, dashed: true, align: "CENTER", justify: "CENTER", gap: 2 }, [await txt("📷", "Body"), await txt("Upload", "Caption", "text-muted")]);
      const t = box("Photo Tile", { w: 76, h: 76, radius: "md", stroke: s === "Selected" ? "primary" : undefined, sw: 3 }, []);
      t.layoutMode = "NONE"; const img = rect("Photo", 76, 76, { image: true, radius: 12 }); t.appendChild(img);
      if (s === "Selected") { const c = box("Check", { dir: "H", w: 20, h: 20, radius: 10, fill: "primary", align: "CENTER", justify: "CENTER" }, [await txt("✓", "Caption", "primary-text")]); t.appendChild(c); c.x = 50; c.y = 6; }
      t.clipsContent = true; return t;
    }]));

    await variants("Calendar Day", "Availability calendar day. Open = primary fill. Holiday adds a dot (Thanksgiving).", ["Closed", "Open", "Holiday"].map((s) => [`State=${s}`, async () => {
      const d = box("Day", { w: 44, h: 44, radius: "md", fill: s === "Closed" ? undefined : "primary", align: "CENTER", justify: "CENTER", gap: 2 }, [await txt("12", "Small Strong", s === "Closed" ? "text" : "primary-text", { name: "Day" })]);
      if (s === "Holiday") add(d, dot("Holiday", 6, "primary-text")); // white on green: 6:1
      return d;
    }]), [["Day", "Day"]]);

    await variants("Checkbox Row", "Checkbox + label (+ hint) as one 44-tall target (CheckRow).", ["No", "Yes"].map((s) => [`Checked=${s}`, async () =>
      box("Checkbox Row", { dir: "H", w: 340, gap: "sm", align: "CENTER", minH: "size/touch-target" }, [
        box("Box", { dir: "H", w: 20, h: 20, radius: 4, fill: s === "Yes" ? "primary" : "surface", stroke: s === "Yes" ? "primary" : "text-muted", sw: 1.5, align: "CENTER", justify: "CENTER" }, s === "Yes" ? [await txt("✓", "Caption", "primary-text")] : []),
        grow(await txt("24-hour emergency vet", "Body Strong", "text", { name: "Label" })),
      ])]), [["Label", "Label"]]);
  }],

  // ===== Stay (booking) components
  ["Stay · booking", async () => {
    await variants("Stage Card", "One step of the 5-stage stay. Current is expanded; done collapses to a one-line summary; future is dimmed.", ["Done", "Current", "Future"].map((s) => [`State=${s}`, async () =>
      box("Stage", { w: 360, gap: "sm", pad: "md", radius: "lg", fill: "surface", stroke: "border", opacity: s === "Future" ? 0.6 : 1 }, [
        box("Head", { dir: "H", gap: "sm", align: "CENTER" }, [
          box("Num", { dir: "H", w: 28, h: 28, radius: 14, fill: s === "Done" ? "success" : s === "Current" ? "primary" : "border", align: "CENTER", justify: "CENTER" }, [await txt(s === "Done" ? "✓" : "3", "Small Strong", s === "Future" ? "text-muted" : "primary-text", { name: "Number" })]),
          box("Copy", { gap: 0 }, [await txt("Booking", "Body Strong", "text", { name: "Title" }), await txt(s === "Done" ? "Paid $268.13 · 5 consents signed" : "Wed", "Small", "text-muted", { name: "Subtitle" })]),
        ]),
      ])]), [["Title", "Title"], ["Subtitle", "Subtitle"]]);

    const sourceTag = await single("Source Tag", "Where an AI line came from (calendar, house policy, Life Record). Used in AI replies, Daily Note and Life Record. Never a button.", async () =>
      box("Source Tag", { dir: "H", pad: [2, "sm", 2, "sm"], radius: 999, stroke: "border" }, [await txt("From Lucy's calendar", "Caption", "text-muted", { name: "Label" })]), [["Label", "Label"]]);
    const tagOf = (label) => { const i = sourceTag.createInstance(); const k = Object.keys(i.componentProperties).find((p) => p.startsWith("Label")); if (k) i.setProperties({ [k]: label }); return i; };

    await variants("Message Bubble", "Inquiry thread (07B). Owners see the sitter's reply as the sitter's own message: name and time, no AI label (D36), with source tags. The AI-draft warning appears only in the sitter's draft view.", ["Owner", "Sitter"].map((s) => [`From=${s}`, async () => {
      if (s === "Owner") return box("Bubble", { w: 280, pad: ["sm", "md", "sm", "md"], radius: 16, fill: "primary" }, [await txt("Is Lucy free Oct 9–12 for Max?", "Body", "primary-text", { name: "Message", fill: true })]);
      return box("Bubble", { w: 300, gap: "sm", pad: ["sm", "md", "sm", "md"], radius: 16, fill: "background", stroke: "border" }, [
        await txt("Lucy · 9:14 AM", "Caption", "text-muted", { name: "Label", fill: true }),
        await txt("Hi Chloe! Lucy is free Oct 9–12 for Max and Mochi.", "Body", "text", { name: "Message", fill: true }),
        fill(box("Sources", { dir: "H", gap: "xs", wrap: true }, [tagOf("From Lucy's calendar"), tagOf("From Lucy's house policy")])),
      ]);
    }]), [["Message", "Message"]]);

    await single("Typing Indicator", "While the AI drafts: “Lucy is typing…” (auto-send, D37).", async () =>
      box("Typing", { dir: "H", gap: "sm", align: "CENTER" }, [box("Dots", { dir: "H", gap: 3 }, [dot("d", 6, "text-muted"), dot("d", 6, "text-muted"), dot("d", 6, "text-muted")]), await txt("Lucy is typing…", "Small", "text-muted", { name: "Label" })]),
      [["Label", "Label"]]);

    await single("Quote Card", "Price breakdown (03C): nights × rate, extra pet, holiday, Total. Same in the thread and at checkout. Prices come from the server, never the AI.", async () => {
      const line = async (a, b, strong) => fill(box("Line", { dir: "H", justify: "SPACE_BETWEEN" }, [await txt(a, strong ? "Body Strong" : "Small", "text"), await txt(b, strong ? "Body Strong" : "Small", "text")]));
      const c = box("Quote Card", { w: 340, gap: "xs", pad: "md", radius: "lg", fill: "surface", stroke: "border" }, [
        await line("3 nights × $55.00", "$165.00"), await line("Extra pet (Mochi, 50%)", "+$82.50"), await line("Thanksgiving (Oct 12) +25%", "+$20.63")]);
      add(c, fill(rect("Divider", 300, 1, { fill: "border" })));
      add(c, await line("Total", "$268.13 CAD", true));
      return c;
    });

    await single("Checklist Row", "AI checklist from the care request (06): editable time + task, remove.", async () =>
      box("Checklist Row", { dir: "H", w: 340, gap: "sm", align: "CENTER" }, [
        box("Time", { dir: "H", w: 76, pad: ["sm", "sm", "sm", "sm"], radius: "md", stroke: "border-strong", fill: "surface", minH: "size/touch-target", align: "CENTER" }, [await txt("8 AM", "Small", "text", { name: "Time" })]),
        grow(box("Task", { dir: "H", pad: ["sm", "sm", "sm", "sm"], radius: "md", stroke: "border-strong", fill: "surface", minH: "size/touch-target", align: "CENTER" }, [await txt("1 cup of kibble", "Small", "text", { name: "Task" })])),
        box("Remove", { dir: "H", w: 44, h: 44, align: "CENTER", justify: "CENTER" }, [await txt("✕", "Body", "text-muted")]),
      ]), [["Time", "Time"], ["Task", "Task"]]);

    await variants("Consent Card", "One consent at checkout (03C): title, summary, Read full text, checkbox. Pay unlocks after all 5 + typed name.", ["No", "Yes"].map((s) => [`Checked=${s}`, async () =>
      box("Consent", { w: 340, gap: "xs", pad: ["sm", "md", "sm", "md"], radius: "md", stroke: "border", fill: "surface" }, [
        box("Row", { dir: "H", gap: "sm", align: "CENTER" }, [
          box("Box", { dir: "H", w: 20, h: 20, radius: 4, fill: s === "Yes" ? "primary" : "surface", stroke: s === "Yes" ? "primary" : "text-muted", sw: 1.5, align: "CENTER", justify: "CENTER" }, s === "Yes" ? [await txt("✓", "Caption", "primary-text")] : []),
          await txt("24-hour emergency vet", "Body Strong", "text", { name: "Title" })]),
        await txt("Lucy may take your pet to the nearest 24-hour vet if needed.", "Small", "text-muted", { name: "Summary", w: 300 }),
        await txt("Read full text", "Small Strong", "primary", { name: "Link" }),
      ])]), [["Title", "Title"], ["Summary", "Summary"]]);

    await variants("Entry Info Card", "Owner's entry info for the sitter (03C). Unlocks 2 h before pick-up; the code hides again after 10 s; never in a notification.", ["Locked", "Unlocked", "Code shown"].map((s) => [`State=${s}`, async () =>
      box("Entry Info", { w: 340, dir: "H", gap: "sm", pad: "md", radius: "lg", stroke: "border", fill: "surface" }, [
        await txt(s === "Locked" ? "🔒" : "🔓", "Title"),
        grow(box("Copy", { gap: "xs" }, [await txt("Entry info for Lucy", "Body Strong", "text", { name: "Title" }),
          await txt(s === "Locked" ? "Unlocks Fri 5:30 AM — 2 hours before pick-up." : "Open for Lucy until the stay ends.", "Small", "text-muted", { name: "Body", w: 260 }),
          s === "Code shown" ? await txt("4 8 2 1", "Title", "text", { name: "Code" }) : s === "Unlocked" ? box("Show", { dir: "H", pad: ["sm", "md", "sm", "md"], radius: "md", stroke: "border", minH: "size/touch-target", align: "CENTER" }, [await txt("Show code", "Body Strong", "primary")]) : null])),
      ])]));

    await variants("Star", "Review star (07C); large hit area.", ["Off", "On"].map((s) => [`State=${s}`, async () =>
      box("Star", { dir: "H", w: 44, h: 44, align: "CENTER", justify: "CENTER" }, [await txt("★", "Title", s === "On" ? "warning" : "border-strong", { size: 30 })])]));

    await single("Profile Card", "What owners see of a sitter: name, area, services with rates, house rules.", async () =>
      box("Profile Card", { w: 340, gap: "sm", pad: "md", radius: "lg", stroke: "border", fill: "surface" }, [
        box("Head", { dir: "H", gap: "sm", align: "CENTER" }, [box("Avatar", { dir: "H", w: 44, h: 44, radius: 22, fill: "primary", align: "CENTER", justify: "CENTER" }, [await txt("L", "Body Strong", "primary-text", { name: "Initial" })]),
          box("Copy", {}, [await txt("Lucy Kim", "Body Strong", "text", { name: "Name" }), await txt("New sitter · Condo · up to 2 pets", "Small", "text-muted", { name: "Meta" })])]),
        fill(box("Rate", { dir: "H", justify: "SPACE_BETWEEN" }, [await txt("Boarding", "Small"), await txt("$55 / night", "Small Strong")])),
        fill(box("Rate", { dir: "H", justify: "SPACE_BETWEEN" }, [await txt("House sitting", "Small"), await txt("$70 / night", "Small Strong")])),
      ]), [["Name", "Name"], ["Meta", "Meta"]]);
  }],

  // ===== Care & transit
  ["Care & transit", async () => {
    await single("Trip Map", "View-only live map (06B): route, car, destination; ± buttons only, no drag-pan (§7.7). ETA below while sharing.", async () => {
      const card = box("Trip Map", { w: 340, gap: "sm", pad: "md", radius: "lg", fill: "surface", stroke: "border" }, [
        fill(box("Sharing", { dir: "H", gap: "xs", align: "CENTER" }, [dot("live", 8, "success"), await txt("Sharing location until arrival", "Caption", "text-muted")]))]);
      const map = box("Map", { w: 308, h: 170, radius: "md", fill: "accent", stroke: "border" }, []);
      map.layoutMode = "NONE";
      const road = rect("Road", 308, 8, { fill: "border" }); map.appendChild(road); road.y = 60;
      const road2 = rect("Road", 8, 170, { fill: "border" }); map.appendChild(road2); road2.x = 200;
      const car = box("Car", { dir: "H", w: 26, h: 26, radius: 13, fill: "primary", align: "CENTER", justify: "CENTER" }, [await txt("🚗", "Caption")]); map.appendChild(car); car.x = 120; car.y = 52;
      const dest = dot("Destination", 16, "primary"); map.appendChild(dest); dest.x = 270; dest.y = 20;
      const zoom = box("Zoom", { gap: 4 }, [box("+", { dir: "H", w: 36, h: 36, radius: "sm", fill: "surface", stroke: "border-strong", align: "CENTER", justify: "CENTER" }, [await txt("+", "Body Strong")]),
        box("−", { dir: "H", w: 36, h: 36, radius: "sm", fill: "surface", stroke: "border-strong", align: "CENTER", justify: "CENTER" }, [await txt("−", "Body Strong")])]);
      map.appendChild(zoom); zoom.x = 264; zoom.y = 80;
      map.clipsContent = true;
      add(card, map);
      add(card, box("ETA", { dir: "H", gap: "sm", align: "MAX" }, [await txt("6 min", "Title", "text", { name: "ETA" }), await txt("ETA · live", "Small", "text-muted")]));
      return card;
    }, [["ETA", "ETA"]]);

    await variants("Photo Check", "Handoff photo check (MiniCPM-V): pet visible, crate secured. Passed completes the handoff. Retake = the model couldn't see something: retake, or the sitter confirms by eye and the owner sees 'Checked by Lucy' instead of 'Photo verified'. A check never blocks a handoff (vision can be wrong).", ["Passed", "Retake"].map((r) => [`Result=${r}`, async () =>
      box("Photo Check", { dir: "H", w: 340, gap: "md", pad: "md", radius: "lg", fill: "surface", stroke: r === "Passed" ? "border" : "warning", align: "CENTER" }, [
        rect("Photo", 88, 88, { image: true, radius: 12 }),
        box("Checks", { gap: "xs" }, [await txt("✓ Max is in the photo", "Small Strong", "success", { name: "Check 1" }),
          await txt(r === "Passed" ? "✓ Crate secured in the car" : "? Couldn't see the crate", "Small Strong", r === "Passed" ? "success" : "warning", { name: "Check 2" }),
          await txt(r === "Passed" ? "Checked by MiniCPM-V" : "Retake, or confirm by eye", "Caption", "text-muted", { name: "Note" })]),
      ])]), [["Check 1", "Check 1"], ["Check 2", "Check 2"]]);

    await variants("Task Row", "A care task on the schedule. Next = the one primary action (Complete with photo); done shows the time and photo.", ["Pending", "Next", "Done"].map((s) => [`State=${s}`, async () =>
      box("Task", { w: 340, gap: "sm", pad: "md", radius: "lg", fill: "surface", stroke: s === "Next" ? "primary" : "border", sw: s === "Next" ? 2 : 1 }, [
        box("Row", { dir: "H", gap: "sm", align: "CENTER" }, [box("Icon", { dir: "H", w: 40, h: 40, radius: "md", fill: s === "Done" ? "success-surface" : "accent", align: "CENTER", justify: "CENTER" }, [await txt("💊", "Body")]),
          box("Copy", {}, [await txt("2:00 PM", "Caption", s === "Next" ? "primary" : "text-muted", { name: "Time" }), await txt("Skin pill in a treat", "Body Strong", "text", { name: "Title" })])]),
        s === "Next" ? fill(box("Action", { dir: "H", pad: ["sm", "md", "sm", "md"], radius: "md", fill: "primary", justify: "CENTER", minH: "size/touch-target", align: "CENTER" }, [await txt("Complete with photo", "Body Strong", "primary-text")])) : null,
        s === "Done" ? await txt("✓ Done 2:04 PM · sent to Chloe", "Small Strong", "success") : null,
      ].filter(Boolean))]), [["Title", "Title"], ["Time", "Time"]]);

    await single("Progress Bar", "Care progress (2 of 5 done).", async () => {
      const b = box("Progress", { w: 300, gap: "xs" }, [fill(box("Top", { dir: "H", justify: "SPACE_BETWEEN" }, [await txt("2 of 5 done", "Small Strong", "text", { name: "Label" }), await txt("Owner sees each one live", "Caption", "text-muted")]))]);
      const track = box("Track", { dir: "H", w: 300, h: 8, radius: 4, fill: "track" }, [rect("Fill", 120, 8, { fill: "primary", radius: 4 })]);
      add(b, track); return b;
    }, [["Label", "Label"]]);

    await single("Feed Card", "A photo from the sitter with AI caption (Nemotron/MiniCPM-V), time, mood and Love it.", async () =>
      box("Feed Card", { w: 340, radius: "lg", fill: "surface", stroke: "border" }, [
        box("Head", { dir: "H", gap: "sm", pad: ["sm", "md", "sm", "md"], align: "CENTER" }, [box("Avatar", { dir: "H", w: 32, h: 32, radius: 16, fill: "primary", align: "CENTER", justify: "CENTER" }, [await txt("L", "Small Strong", "primary-text")]),
          box("Who", {}, [await txt("Lucy", "Small Strong"), await txt("Sitter · 9:02 AM", "Caption", "text-muted", { name: "Meta" })])]),
        rect("Photo", 340, 272, { image: true }),
        box("Body", { w: 340, gap: "xs", pad: "md" }, [await txt("✦ AI caption", "Caption", "primary", { upper: true }), await txt("Max finished every bit of breakfast and asked for more.", "Body", "text", { name: "Caption", w: 300 }),
          box("Foot", { dir: "H", gap: "sm" }, [tag("Neutral", "😊 Happy"), await txt("♡ Love it", "Small Strong", "text-muted")])]),
      ]), [["Caption", "Caption"], ["Meta", "Meta"]]);

    await single("Report Summary", "Daily report header: mood + three stats.", async () =>
      box("Report Summary", { w: 340, radius: "lg", fill: "surface", stroke: "border" }, [
        box("Top", { dir: "H", w: 340, justify: "SPACE_BETWEEN", align: "CENTER", pad: "md", fill: "accent" }, [await txt("Max's day", "Title", "text", { name: "Title" }), await txt("😊", "Title")]),
        box("Stats", { dir: "H", w: 340, justify: "SPACE_BETWEEN", pad: "md" }, [
          box("Stat", { align: "CENTER" }, [await txt("5/5", "Title"), await txt("Tasks", "Caption", "text-muted")]),
          box("Stat", { align: "CENTER" }, [await txt("40m", "Title"), await txt("Walks", "Caption", "text-muted")]),
          box("Stat", { align: "CENTER" }, [await txt("12", "Title"), await txt("Photos", "Caption", "text-muted")])]),
      ]), [["Title", "Title"]]);

    await single("Daily Note", "AI daily note from the 5-second check, in the sitter's voice; posted only after the sitter taps Send.", async () =>
      box("Daily Note", { w: 340, gap: "sm", pad: "md", radius: "lg", fill: "background", stroke: "border" }, [
        await txt("✦ Draft · only from the chips and note", "Caption", "text-muted", { upper: true }),
        await txt("Max finished every bit of her breakfast, took her skin pill tucked in a treat, and we did a 20-minute walk!", "Body", "text", { name: "Note", w: 308 }),
      ]), [["Note", "Note"]]);

    await single("Life Record Card", "Pet Life Record (07C): Eats · Meds · Potty · Behavior · Heads-up · Sitter tips, each with its source. Only recorded facts.", async () => {
      const row = async (k, v, s) => box(k, { gap: 2, w: 308 }, [await txt(k, "Caption", "text-muted", { upper: true }), await txt(v, "Body", "text", { w: 308 }), await txt(s, "Caption", "text-muted")]);
      return box("Life Record", { w: 340, gap: "sm", pad: "md", radius: "lg", fill: "surface", stroke: "border" }, [
        await txt("Max's Life Record", "Body Strong", "text", { name: "Title" }),
        await row("Eats", "Finishes 1 cup of kibble at 8 AM.", "From Lucy · Oct 9–12"),
        await row("Heads-up", "Allergic to chicken — check labels for “animal fat”.", "From your profile · Treat Guard")]);
    }, [["Title", "Title"]]);
  }],

  // ===== Feedback & system
  ["Feedback & system", async () => {
    await single("Alert Modal · DANGER", "Treat safety result (DESIGN.md §7.4): full screen, error header, closes only with its button — not Escape, not the backdrop.", async () =>
      box("DANGER", { w: 402, h: 874, fill: "background" }, [
        fill(box("Header", { w: 402, gap: "xs", pad: [44, "md", "md", "md"], fill: "error" }, [await txt("⚠️ DANGER", "Small Strong", "primary-text", { upper: true }), await txt("Don't feed this treat to Max", "Title", "primary-text", { name: "Title", w: 360 })])),
        grow(box("Body", { w: 402, gap: "md", pad: "md" }, [await txt("“Chewy Chompers” contains chicken — Max is allergic.", "Body", "text", { name: "Body", w: 360 }),
          box("Tags", { dir: "H", gap: "xs", wrap: true, w: 370 }, [tag("Danger", "chicken"), tag("Danger", "animal fat (may contain chicken)")])])),
        box("Footer", { w: 402, pad: ["md", "md", "lg", "md"] }, [box("Ack", { dir: "H", w: 370, pad: ["sm", "md", "sm", "md"], radius: "md", fill: "error", justify: "CENTER", align: "CENTER", minH: "size/touch-target" }, [await txt("I understand — don't feed", "Body Strong", "primary-text", { name: "Action" })])]),
      ]), [["Title", "Title"], ["Body", "Body"]]);

    // Banner: inline notice for edge states (offline, late, failed, handed to a person). Not for DANGER (§7.4).
    const BANNER = {
      Info: ["accent", "primary", "border", "💬", "Lucy will answer this one herself", "Health questions always go to Lucy, not the assistant. Usually within 2 hours.", "Got it"],
      Warning: ["warning-surface", "warning", "warning", "⏱️", "Lucy is running 10 min late", "New ETA 7:40 AM — updated on its own. Nothing to do.", "Message Lucy"],
      Error: ["error-surface", "error", "error", "⚠️", "Payment didn't go through", "You weren't charged. Your consents and signature are kept.", "Try again"],
      Offline: ["surface", "text", "border-strong", "📶", "You're offline", "2 check-ins are saved on this phone and send on their own.", "Retry now"],
    };
    await variants("Banner", "Inline notice at the top of the content for an edge state (DESIGN.md §10): icon + title in the tone color + one line saying what happens next + optional action. Text sits on the tone's surface (never tone on tone). Never used for DANGER, which is a full-screen Alert Modal.",
      Object.entries(BANNER).map(([tone, [bg, fg, line, emoji, title, body, action]]) => [`Tone=${tone}`, async () =>
        box("Banner", { dir: "H", w: 340, gap: "sm", pad: ["sm", "md", "sm", "md"], radius: "md", fill: bg, stroke: line }, [
          await txt(emoji, "Body", "text", { name: "Icon" }),
          grow(box("Copy", { gap: 2 }, [await txt(title, "Small Strong", fg, { name: "Title", fill: true }), await txt(body, "Small", "text", { name: "Body", fill: true }),
            box("Action", { dir: "H", minH: "size/touch-target", align: "CENTER" }, [await txt(action, "Small Strong", tone === "Error" ? "error" : "primary", { name: "Action" })])])),
        ])]), [["Title", "Title"], ["Body", "Body"], ["Action", "Action"]]);

    await variants("Notification Row", "One update in the 🔔 sheet. Unread = dot after the title.", ["Read", "Unread"].map((s) => [`State=${s}`, async () =>
      box("Notification", { dir: "H", w: 340, gap: "sm", pad: ["sm", 0, "sm", 0] }, [await txt("🐾", "Body"),
        box("Copy", {}, [box("Title", { dir: "H", gap: "xs", align: "CENTER" }, [await txt("Lucy accepted your booking 🎉", "Small Strong", "text", { name: "Title" }), s === "Unread" ? dot("Unread", 7, "primary") : null].filter(Boolean)),
          await txt("Wed", "Caption", "text-muted", { name: "Time" })])])]), [["Title", "Title"], ["Time", "Time"]]);

    await single("Permission Prompt", "Simulated system prompt after the notification primer. System look, not the app skin.", async () =>
      box("Permission", { w: 270, radius: 14, fill: "surface" }, [
        box("Body", { w: 270, gap: "xs", pad: "md", align: "CENTER" }, [await txt("“PawNote” Would Like to Send You Notifications", "Body Strong", "text", { w: 238, align: "CENTER" }),
          await txt("Notifications may include alerts, sounds and icon badges.", "Small", "text-muted", { w: 238, align: "CENTER" })]),
        box("Buttons", { dir: "H", w: 270, stroke: "border" }, [grow(box("No", { dir: "H", h: 44, justify: "CENTER", align: "CENTER" }, [await txt("Don’t Allow", "Body", "primary")])),
          grow(box("Yes", { dir: "H", h: 44, justify: "CENTER", align: "CENTER" }, [await txt("Allow", "Body Strong", "primary")]))]),
      ]));

    await single("Push Preview", "Lock-screen notification preview used in the notifications step.", async () =>
      box("Push", { dir: "H", w: 340, gap: "sm", pad: "sm", radius: 16, fill: "surface", stroke: "border" }, [
        box("App", { dir: "H", w: 36, h: 36, radius: 9, fill: "primary", align: "CENTER", justify: "CENTER" }, [await txt("🐾", "Body")]),
        grow(box("Copy", {}, [await txt("PAWNOTE · now", "Caption", "text-muted"), await txt("Lucy posted 2 photos of Max 📸", "Small Strong", "text", { name: "Title" }), await txt("Breakfast done. Finished the whole bowl.", "Small", "text-muted", { name: "Body" })]))]),
      [["Title", "Title"], ["Body", "Body"]]);

    await single("Theme Preview", "Onboarding Look step: coat color → nearest accessible preset, contrast badge (≥ 4.5:1), and how it carries into the app.", async () =>
      box("Theme Preview", { w: 340, gap: "md", pad: "md", radius: "lg", fill: "surface", stroke: "border" }, [
        box("Swatches", { dir: "H", gap: "md", align: "CENTER" }, [rect("Detected", 56, 56, { fill: "text-muted", radius: 12 }), await txt("→", "Body", "text-muted"), rect("Preset", 88, 88, { fill: "primary", radius: 18 }), await txt("Forest", "Body Strong", "text", { name: "Preset" })]),
        tag("Success", "6.4:1 with white text · Passes AA ✓"),
      ]), [["Preset", "Preset"]]);

    await variants("Avatar", "Round avatar: sitter initial or pet photo.", ["Initial", "Photo"].map((s) => [`Kind=${s}`, async () => {
      if (s === "Initial") return box("Avatar", { dir: "H", w: 40, h: 40, radius: 20, fill: "primary", align: "CENTER", justify: "CENTER" }, [await txt("L", "Body Strong", "primary-text", { name: "Initial" })]);
      const a = box("Avatar", { w: 40, h: 40, radius: 20 }, []); a.layoutMode = "NONE"; a.appendChild(rect("Photo", 40, 40, { image: true, radius: 20 })); a.clipsContent = true; return a;
    }]));

    await variants("Skeleton", "Loading placeholder that matches the final layout (gray blocks).", ["Line", "Block", "Card"].map((s) => [`Kind=${s}`, async () => {
      if (s === "Line") return box("Skeleton", { gap: "xs", w: 240 }, [rect("l1", 240, 12, { fill: "border", radius: 6 }), rect("l2", 160, 12, { fill: "border", radius: 6 })]);
      if (s === "Block") return box("Skeleton", { w: 240 }, [rect("b", 240, 140, { fill: "border", radius: 12 })]);
      return box("Skeleton", { dir: "H", gap: "sm", pad: "md", w: 300, radius: "lg", stroke: "border", fill: "surface" }, [rect("a", 40, 40, { fill: "border", radius: 20 }), box("Lines", { gap: "xs" }, [rect("l1", 180, 12, { fill: "border", radius: 6 }), rect("l2", 120, 12, { fill: "border", radius: 6 })])]);
    }]));

    await single("Demo Control", "PROTOTYPE ONLY: anything the sitter would do, shown to the owner as a dashed control. Not part of the shipped app.", async () =>
      box("Demo Control", { dir: "H", w: 340, gap: "sm", pad: ["sm", "md", "sm", "md"], radius: "md", stroke: "border", sw: 2, dashed: true, justify: "CENTER", align: "CENTER", minH: "size/touch-target" }, [
        await txt("DEMO · AS LUCY", "Caption", "text-muted"), await txt("Lucy accepts", "Body Strong", "text", { name: "Label" })]), [["Label", "Label"]]);
  }],
];

const LOOKS = {
  Balanced: { background: "#F4F2EE", surface: "#FFFFFF", text: "#1F1B16", "text-muted": "#5E5850", border: "#E6E1D9", accent: "#DCEDE3", "border-strong": "#857E73", track: "#E6E1D9" },
  // Playful lives in the prototypes only (Oct 6): Figma shows the Balanced look.
};
// Adds the two looks as modes on the Color collection (same variables, different values).
async function addLookModes(log) {
  const col = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === "Color");
  if (!col) { log.push("No 'Color' collection found; looks not added."); return 0; }
  // Remove the Playful mode an earlier run added (Playful stays in the prototypes only).
  const old = col.modes.find((m) => m.name === "Playful");
  if (old && col.modes.length > 1) { try { col.removeMode(old.modeId); log.push("Removed the Playful color mode (kept in the prototypes only)."); } catch (e) {} }
  let added = 0;
  for (const [look, values] of Object.entries(LOOKS)) {
    let mode = col.modes.find((m) => m.name === look);
    if (!mode) {
      try { const id = col.addMode(look); mode = { modeId: id, name: look }; added++; }
      catch (e) { log.push(`Couldn't add the "${look}" mode (${e.message || e}). Figma's Starter plan may allow only one mode per collection.`); continue; }
    }
    const def = col.modes[0].modeId;
    for (const id of col.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(id);
      const key = v.name.replace("color/", "");
      v.setValueForMode(mode.modeId, values[key] ? hexRGB(values[key]) : v.valuesByMode[def]);
    }
  }
  return added;
}

async function buildComponents(page, log) {
  await figma.setCurrentPageAsync(page);
  for (const n of page.children.filter((c) => c.getPluginData("pawnote") === "components")) n.remove();
  PLACED.length = 0;
  // Start below whatever is already on the page (hand-made components stay untouched).
  let top = 0;
  for (const n of page.children) top = Math.max(top, n.y + n.height);
  let y = top + 240;
  const heading = async (chars, size, yy) => { const t = await txt(chars, "Title", "text", { size }); page.appendChild(t); t.x = 0; t.y = yy; t.setPluginData("pawnote", "components"); return t; };
  await heading("Components · from the prototypes", 48, y); y += 110;
  let count = 0;
  for (const [category, build] of LIBRARY) {
    await heading(category, 28, y); y += 60;
    say(`  ${category}…`); await tick();
    const start = PLACED.length;
    try { await build(); } catch (e) { log.push(`${category}: ${e.message || e}`); }
    // Flow the new components left to right, wrapping at 2400 px.
    let x = 0, rowH = 0;
    for (const c of PLACED.slice(start)) {
      if (c.parent !== page) page.appendChild(c);
      if (x > 0 && x + c.width > 2400) { x = 0; y += rowH + 60; rowH = 0; }
      c.x = x; c.y = y; x += c.width + 60; rowH = Math.max(rowH, c.height);
      c.setPluginData("pawnote", "components");
      count++;
    }
    y += rowH + 140;
  }
  return count;
}
