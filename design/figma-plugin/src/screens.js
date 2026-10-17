/* Rebuilds captured prototype screens (data/screens-*.json) as editable layers on "2. Screens",
   grouped by the app map: one Section per IA group, columns = screens, rows = concepts A · B · C. */

const WEIGHT_NAMES = {
  100: ["Thin"], 200: ["ExtraLight", "Extra Light"], 300: ["Light"], 400: ["Regular", "Book", "Normal"],
  500: ["Medium"], 600: ["SemiBold", "Semi Bold", "Semibold", "DemiBold"], 700: ["Bold"], 800: ["ExtraBold", "Extra Bold"], 900: ["Black", "Heavy"],
};
let FONT_INDEX = null;
const FONT_PICK = new Map();
const LOADED = new Set();

async function fontIndex() {
  if (FONT_INDEX) return FONT_INDEX;
  FONT_INDEX = new Map();
  for (const f of await figma.listAvailableFontsAsync()) {
    const list = FONT_INDEX.get(f.fontName.family) || [];
    list.push(f.fontName.style);
    FONT_INDEX.set(f.fontName.family, list);
  }
  return FONT_INDEX;
}
function styleWeight(style) {
  const s = style.replace(/\s*Italic/i, "").trim() || "Regular";
  for (const [w, names] of Object.entries(WEIGHT_NAMES)) if (names.some((n) => n.toLowerCase() === s.toLowerCase())) return Number(w);
  return 400;
}
// Closest available style for a CSS family/weight/italic; falls back to Inter.
async function pickFont(family, weight, italic) {
  const key = `${family}|${weight}|${italic}`;
  if (FONT_PICK.has(key)) return FONT_PICK.get(key);
  const idx = await fontIndex();
  let fam = idx.has(family) ? family : "Inter";
  let styles = idx.get(fam) || ["Regular"];
  let pool = styles.filter((s) => /italic/i.test(s) === !!italic);
  if (!pool.length) pool = styles;
  pool.sort((a, b) => Math.abs(styleWeight(a) - weight) - Math.abs(styleWeight(b) - weight));
  const font = { family: fam, style: pool[0] };
  const k = `${font.family}|${font.style}`;
  if (!LOADED.has(k)) { await figma.loadFontAsync(font); LOADED.add(k); }
  FONT_PICK.set(key, font);
  return font;
}

const solid = (c) => ({ type: "SOLID", color: { r: c.r, g: c.g, b: c.b }, opacity: c.a == null ? 1 : c.a });
const IMAGE_HASH = new Map();
function imageHash(images, key) {
  if (!key || !images[key]) return null;
  if (IMAGE_HASH.has(key)) return IMAGE_HASH.get(key);
  const data = images[key];
  const b64 = data.slice(data.indexOf(",") + 1);
  let hash = null;
  try { hash = figma.createImage(figma.base64Decode(b64)).hash; } catch (e) { hash = null; }
  IMAGE_HASH.set(key, hash);
  return hash;
}

function applyBox(node, n) {
  if (n.radius) { const [tl, tr, br, bl] = n.radius; node.topLeftRadius = tl; node.topRightRadius = tr; node.bottomRightRadius = br; node.bottomLeftRadius = bl; }
  if (n.opacity != null && n.opacity < 1) node.opacity = n.opacity;
  if (n.shadows) node.effects = n.shadows.map((s) => ({
    type: s.inset ? "INNER_SHADOW" : "DROP_SHADOW", color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
    offset: { x: s.x, y: s.y }, radius: s.blur, spread: s.spread, visible: true, blendMode: "NORMAL",
  }));
}

async function buildText(n, parent) {
  const t = figma.createText();
  t.name = n.name || "text";
  const chars = n.runs.map((r) => r.text).join("") || " ";
  const first = n.runs[0].style;
  t.fontName = await pickFont(first.family, first.weight, first.italic);
  t.characters = chars;
  let i = 0;
  for (const r of n.runs) {
    const len = r.text.length;
    if (len) {
      const s = r.style, end = Math.min(i + len, chars.length);
      t.setRangeFontName(i, end, await pickFont(s.family, s.weight, s.italic));
      t.setRangeFontSize(i, end, Math.max(1, s.size));
      t.setRangeFills(i, end, [solid(s.color)]);
      if (s.ls) t.setRangeLetterSpacing(i, end, { unit: "PIXELS", value: s.ls });
      if (s.lh) t.setRangeLineHeight(i, end, { unit: "PIXELS", value: s.lh });
      if (s.upper) t.setRangeTextCase(i, end, "UPPER");
      if (s.strike) t.setRangeTextDecoration(i, end, "STRIKETHROUGH");
    }
    i += len;
  }
  if (n.align === "center") t.textAlignHorizontal = "CENTER";
  else if (n.align === "right") t.textAlignHorizontal = "RIGHT";
  parent.appendChild(t);
  t.x = n.x; t.y = n.y;
  if (n.wrap) { t.resize(Math.max(1, n.w), Math.max(1, n.h)); t.textAutoResize = "HEIGHT"; }
  else {
    t.textAutoResize = "WIDTH_AND_HEIGHT";
    if (n.w > 4 && t.width > n.w * 1.06) {
      const k = n.w / t.width; let j = 0;
      for (const r of n.runs) { const len = r.text.length; if (len) t.setRangeFontSize(j, Math.min(j + len, chars.length), Math.max(1, r.style.size * k)); j += len; }
    }
    if (n.align === "center" && n.w > t.width) { t.textAutoResize = "HEIGHT"; t.resize(n.w, t.height); }
  }
  return t;
}

async function buildNode(n, parent, images) {
  if (n.k === "text") return buildText(n, parent);
  if (n.k === "svg") {
    let s;
    try { s = figma.createNodeFromSvg(n.svg); } catch (e) { s = figma.createRectangle(); s.fills = []; }
    s.name = n.name || "icon";
    parent.appendChild(s);
    s.x = n.x; s.y = n.y;
    if (s.width && s.height && n.w && n.h) s.resize(Math.max(0.01, n.w), Math.max(0.01, n.h));
    if (n.opacity != null && n.opacity < 1) s.opacity = n.opacity;
    return s;
  }
  if (n.k === "image") {
    const r = figma.createRectangle();
    r.name = n.name || "image";
    parent.appendChild(r);
    r.x = n.x; r.y = n.y; r.resize(Math.max(0.01, n.w), Math.max(0.01, n.h));
    const h = imageHash(images, n.img);
    r.fills = h ? [{ type: "IMAGE", imageHash: h, scaleMode: n.fit === "contain" ? "FIT" : "FILL" }] : [solid({ r: 0.9, g: 0.9, b: 0.9, a: 1 })];
    applyBox(r, n);
    return r;
  }
  const f = figma.createFrame();
  f.name = n.name || "frame";
  parent.appendChild(f);
  f.x = n.x; f.y = n.y;
  f.resize(Math.max(0.01, n.w), Math.max(0.01, n.h));
  const fills = [];
  if (n.fill) fills.push(solid(n.fill));
  const h = n.bgImg && imageHash(images, n.bgImg);
  if (h) fills.push({ type: "IMAGE", imageHash: h, scaleMode: "FILL" });
  f.fills = fills;
  if (n.stroke) {
    f.strokes = [solid(n.stroke)];
    f.strokeAlign = "INSIDE";
    const [t, r, b, l] = n.sides || [n.sw, n.sw, n.sw, n.sw];
    if (t === r && r === b && b === l) f.strokeWeight = n.sw;
    else { f.strokeTopWeight = t; f.strokeRightWeight = r; f.strokeBottomWeight = b; f.strokeLeftWeight = l; }
    if (n.dashed) f.dashPattern = [4, 4];
  }
  applyBox(f, n);
  f.clipsContent = !!n.clip;
  for (const c of n.children || []) {
    try { await buildNode(c, f, images); } catch (e) { /* skip one bad layer, keep the screen */ }
  }
  return f;
}

const GROUP_ORDER = [
  "Redesign · live app tabs (D47)",
  "Get started › Owner sign-up", "Get started › Sitter setup", "Get started › Log in",
  "Home", "Stay › 1 Inquiry", "Stay › 2 Meet & Greet", "Stay › 3 Booking", "Stay › 4 Pick-up & care", "Stay › 5 Home & review",
  "Feed", "Care", "Reports", "Over any screen",
];

let COMPOSED_SCREENS = [];
async function buildScreens(page, datasets, log, componentsPage) {
  await figma.setCurrentPageAsync(page);
  if (componentsPage) {
    try { await loadLibrary(componentsPage); await initDS(SAMPLE); COMPOSED_SCREENS = await buildComposedScreens(log); }
    catch (e) { log.push(`Component-built screens skipped: ${e.message || e}`); COMPOSED_SCREENS = []; }
  }
  // Sections are kept (emptied and refilled) so their node IDs stay stable: the design review links to them.
  const oldSections = new Map();
  for (const n of page.children.filter((c) => c.getPluginData("pawnote") === "screens")) {
    if (n.type === "SECTION" && !oldSections.has(n.name)) { for (const k of [...n.children]) k.remove(); oldSections.set(n.name, n); }
    else n.remove();
  }

  const label = await pickFont("Inter", 700, false), body = await pickFont("Inter", 400, false);
  const W = 402, H = 874, GAP = 64, ROW_LABEL = 260, PAD = 80;
  const rowLabel = (parent, chars, top) => { const t = figma.createText(); t.fontName = label; t.fontSize = 20; t.characters = chars;
    parent.appendChild(t); t.textAutoResize = "HEIGHT"; t.resize(ROW_LABEL - 40, t.height); t.x = PAD; t.y = top + 8; return t; };
  const concepts = datasets.map((d) => ({ k: d.concept, label: d.label }));
  let y = 0;

  const title = figma.createText(); title.fontName = label; title.fontSize = 64; title.characters = "Screens · by app map";
  page.appendChild(title); title.x = 0; title.y = y; title.setPluginData("pawnote", "screens");
  const sub = figma.createText(); sub.fontName = body; sub.fontSize = 24;
  sub.characters = "1) Today: the live app's tabs (D47), Live (captured) vs Balanced (components). 2) Upcoming: the next phases' screens in stay order — inquiry, care request, Meet & Greet, checkout, trip, 5-second check, review, Life Record. 3) Edge states: what owners and sitters see when things don't go to plan (DESIGN.md §10). 4) Onboarding: explored sign-up and sitter setup (OB.4 on hold). Everything except Live is built from components; re-run the Goldito plugin after changes.";
  page.appendChild(sub); sub.x = 0; sub.y = y + 90; sub.setPluginData("pawnote", "screens");
  y += 220;

  let built = 0;
  const order = SECTION_ORDER();
  // Grid: sections flow left to right and wrap; the same 160 px gap both ways.
  const SECTION_GAP = 160, MAX_ROW = 12000;
  let x = 0, rowH = 0, lastCat = null;
  for (const group of order) {
    const ids = [];
    for (const d of datasets) for (const s of d.screens) if (s.group === group && !ids.includes(s.id)) ids.push(s.id);
    for (const c of COMPOSED_SCREENS) if (c.group === group && !ids.includes(c.id)) ids.push(c.id);
    if (!ids.length) continue;
    const section = oldSections.get(group) || figma.createSection();
    oldSections.delete(group);
    section.name = group;
    page.appendChild(section);
    section.setPluginData("pawnote", "screens");
    const sectionW = PAD * 2 + ROW_LABEL + ids.length * (W + GAP) - GAP;
    // New row when the category changes (Today · Upcoming · Onboarding).
    const cat = group.split(" ")[0];
    if (x > 0 && (cat !== lastCat || x + sectionW > MAX_ROW)) { x = 0; y += rowH + SECTION_GAP; rowH = 0; }
    lastCat = cat;
    section.x = x; section.y = y;
    const sw = PAD * 2 + ROW_LABEL + ids.length * (W + GAP) - GAP;
    const composed = COMPOSED_SCREENS.filter((c) => c.group === group);
    const lookNames = [...new Set(composed.map((c) => c.look))];
    const rows = datasets.filter((d) => d.screens.some((x) => x.group === group) && !(composed.length && d.concept !== "Live"));
    const sh = PAD * 2 + 60 + (rows.length + lookNames.length) * (H + GAP + 40) - GAP;
    section.resizeWithoutConstraints(sw, sh);

    // Column headers (screen titles)
    ids.forEach((id, col) => {
      const any = datasets.flatMap((d) => d.screens).find((s) => s.id === id) || COMPOSED_SCREENS.find((c) => c.id === id);
      const h = figma.createText(); h.fontName = label; h.fontSize = 22; h.characters = `${col + 1}. ${any.title}`;
      section.appendChild(h); h.x = PAD + ROW_LABEL + col * (W + GAP); h.y = PAD;
    });
    for (const [row, d] of rows.entries()) {
      const top = PAD + 60 + row * (H + GAP + 40);
      rowLabel(section, d.label, top);
      for (const [col, id] of ids.entries()) {
        const s = d.screens.find((x) => x.id === id && x.group === group);
        if (!s) continue;
        try {
          const f = await buildNode(s.tree, section, d.images);
          f.name = `${d.concept} · ${s.title}`;
          f.x = PAD + ROW_LABEL + col * (W + GAP); f.y = top;
          f.clipsContent = true;
          built++;
        } catch (e) { log.push(`Screen ${d.concept}/${s.id}: ${e.message || e}`); }
      }
    }
    for (const [li, look] of lookNames.entries()) {
      const top = PAD + 60 + (rows.length + li) * (H + GAP + 40);
      rowLabel(section, `${look}\n(components)`, top);
      for (const [col, id] of ids.entries()) {
        const c = composed.find((x) => x.id === id && x.look === look);
        if (!c) continue;
        section.appendChild(c.frame); c.frame.x = PAD + ROW_LABEL + col * (W + GAP); c.frame.y = top; built++;
      }
    }
    x += sw + SECTION_GAP; rowH = Math.max(rowH, sh);
    say(`  ${group}: done (${built} so far)`);
    await tick();
  }
  for (const n of oldSections.values()) n.remove(); // groups that no longer exist
  return built;
}
