/* Rebuilds captured prototype screens (data/screens-*.json) as editable layers on the "Screens" page,
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

// Font decision (Oct 22, #304): text without a named font is Plus Jakarta Sans in the app, so a capture's system font
// (Segoe UI, -apple-system, Roboto…) or the old Inter stand-in becomes Jakarta. Fredoka and other named faces stay.
const SYSTEM_FONTS = /^(Segoe UI|-apple-system|BlinkMacSystemFont|system-ui|Roboto|Helvetica( Neue)?|Arial|Inter|ui-sans-serif|sans-serif)$/i;
let FONT_MAPPED = 0;
const appFamily = (family) => (SYSTEM_FONTS.test(family || "") ? (FONT_MAPPED++, "Plus Jakarta Sans") : family);
// Characters and per-run styles (font, size, color, spacing, case) on a text layer.
async function styleRuns(t, runs) {
  const chars = runs.map((r) => r.text).join("") || " ";
  const first = runs[0].style;
  t.fontName = await pickFont(appFamily(first.family), first.weight, first.italic);
  t.characters = chars;
  let i = 0;
  for (const r of runs) {
    const len = r.text.length;
    if (len) {
      const s = r.style, end = Math.min(i + len, chars.length);
      t.setRangeFontName(i, end, await pickFont(appFamily(s.family), s.weight, s.italic));
      t.setRangeFontSize(i, end, Math.max(1, s.size));
      t.setRangeFills(i, end, [solid(s.color)]);
      if (s.ls) t.setRangeLetterSpacing(i, end, { unit: "PIXELS", value: s.ls });
      if (s.lh) t.setRangeLineHeight(i, end, { unit: "PIXELS", value: s.lh });
      if (s.upper) t.setRangeTextCase(i, end, "UPPER");
      if (s.strike) t.setRangeTextDecoration(i, end, "STRIKETHROUGH");
    }
    i += len;
  }
  return chars;
}

async function buildText(n, parent) {
  const t = figma.createText();
  t.name = n.name || "text";
  const chars = n.runs.map((r) => r.text).join("") || " ";
  await styleRuns(t, n.runs);
  if (n.align === "center") t.textAlignHorizontal = "CENTER";
  else if (n.align === "right") t.textAlignHorizontal = "RIGHT";
  parent.appendChild(t);
  t.x = n.x; t.y = n.y;
  if (!n.wrap) { t.setPluginData("oneLine", "1"); t.setPluginData("bh", String(n.h || 0)); }
  if (n.wrap || n.span) { t.resize(Math.max(1, n.w), Math.max(1, t.height)); t.textAutoResize = "HEIGHT"; }
  else {
    t.textAutoResize = "WIDTH_AND_HEIGHT";
    // An input's value keeps its size and is cut off with "…", as in the field (never shrunk to fit).
    if (n.name === "value" && n.w > 4 && t.width > n.w) { t.textAutoResize = "NONE"; t.resize(n.w, t.height); try { t.textTruncation = "ENDING"; } catch (e) {} }
    if (n.align === "center" && n.w > t.width) { t.textAutoResize = "HEIGHT"; t.resize(n.w, t.height); }
  }
  return t;
}

/* A short fingerprint of a captured screen, so a run can tell what changed since the last one. */
function fingerprint(tree) {
  const str = JSON.stringify(tree);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + str.length.toString(36);
}

/* "What's new" flags (Oct 23), so devs aren't thrown off by a run: a frame whose capture changed gets an orange
   outline and a "Changed · Oct 23 · Copy" tag above it, a new one a green "New" tag. Facet fingerprints say what kind
   of change it was. Flags stay FLAG_DAYS days across runs, so a second run the same day doesn't hide them. */
const FLAG_DAYS = 7;
function facets(tree) {
  const copy = [], icons = [], photos = [];
  const strip = (n, geo) => {
    if (Array.isArray(n)) return n.map((v) => strip(v, geo));
    if (!n || typeof n !== "object") return n;
    const o = {};
    for (const [k, v] of Object.entries(n)) {
      if (k === "runs") { if (geo) copy.push(v.map((r) => r.text).join("")); o.runs = v.map(({ text, ...r }) => r); }
      else if (k === "svg") { if (geo) icons.push(v); }
      else if (k === "img" || k === "bgImg") { if (geo) photos.push(v); }
      else if (!geo && ["x", "y", "w", "h"].includes(k)) continue;
      else o[k] = strip(v, geo);
    }
    return o;
  };
  const look = fingerprint(strip(tree, true)), shape = fingerprint(strip(tree, false));
  return { fc: { copy: fingerprint(copy), icons: fingerprint(icons), photos: fingerprint(photos), look, shape }, texts: copy };
}
function readMeta(node) {
  try { return Object.assign({ fp: node.getPluginData("fp") }, JSON.parse(node.getPluginData("meta") || "{}"), { texts: JSON.parse(node.getPluginData("texts") || "[]") }); }
  catch (e) { return { fp: node.getPluginData("fp"), texts: [] }; }
}
// prev: what the frame's last build stored (undefined for a new frame); firstRun: nothing was tracked before
function flagFor(prev, fp, cur, firstRun, now) {
  if (!prev) return firstRun ? null : { at: now, what: "New" };
  if (prev.fp === fp) return prev.flag && (Date.parse(now) - Date.parse(prev.flag.at)) / 864e5 < FLAG_DAYS ? prev.flag : null;
  if (!prev.fc) return { at: now, what: "Updated" };
  const a = prev.fc, b = cur.fc, what = [];
  if (a.copy !== b.copy) what.push("Copy");
  if (a.icons !== b.icons) what.push("Icons");
  if (a.photos !== b.photos) what.push("Photos");
  if (a.shape !== b.shape || (a.look !== b.look && a.copy === b.copy)) what.push("Look");
  const old = new Set(prev.texts || []), fresh = cur.texts.filter((t) => t.trim() && !old.has(t));
  return { at: now, what: what.join(", ") || "Look", note: fresh[0] || "" };
}
function saveMeta(node, fp, cur, flag) {
  node.setPluginData("fp", fp);
  node.setPluginData("meta", JSON.stringify({ fc: cur.fc, flag }));
  node.setPluginData("texts", JSON.stringify(cur.texts).slice(0, 60000));
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function flagText(flag) {
  const d = new Date(flag.at), when = `${MON[d.getMonth()]} ${d.getDate()}`;   // the viewer's own date, not UTC
  if (flag.what === "New") return `New · ${when}`;
  if (flag.what === "Added") return `Added · ${when} · ${flag.note}`;
  if (/icons/i.test(flag.what) && flag.note) return `Changed · ${when} · ${flag.what} · ${flag.note}`;
  const note = flag.note ? ` · “${flag.note.length > 30 ? flag.note.slice(0, 29) + "…" : flag.note}”` : "";
  return `Changed · ${when} · ${flag.what}${note}`;
}
// Drawn beside the frame, never inside it, so the screen itself stays clean for Dev Mode. Locked, tagged as plugin output.
function drawFlag(parent, f, flag, font, tag, where = "above") {
  const isNew = flag.what === "New" || flag.what === "Added";   // green; orange = changed
  const line = isNew ? { r: 0.176, g: 0.416, b: 0.31 } : { r: 0.761, g: 0.255, b: 0.047 };
  const ring = figma.createRectangle();
  parent.insertChild(parent.children.indexOf(f), ring);
  ring.name = "What's new · outline"; ring.resize(f.width + 16, f.height + 16); ring.x = f.x - 8; ring.y = f.y - 8;
  ring.cornerRadius = 20; ring.fills = []; ring.strokes = [{ type: "SOLID", color: line }]; ring.strokeWeight = 4;
  const pill = figma.createFrame(); parent.appendChild(pill);
  pill.name = "What's new · tag"; pill.layoutMode = "HORIZONTAL"; pill.primaryAxisSizingMode = "AUTO"; pill.counterAxisSizingMode = "AUTO";
  pill.paddingLeft = pill.paddingRight = 12; pill.paddingTop = pill.paddingBottom = 5; pill.cornerRadius = 14;
  pill.fills = [{ type: "SOLID", color: isNew ? { r: 0.847, g: 0.953, b: 0.863 } : { r: 0.992, g: 0.886, b: 0.8 } }];
  const t = figma.createText(); t.fontName = font; t.fontSize = 14; t.characters = flagText(flag);
  t.fills = [{ type: "SOLID", color: isNew ? { r: 0.106, g: 0.263, b: 0.196 } : { r: 0.604, g: 0.204, b: 0.071 } }];
  pill.appendChild(t);
  pill.x = f.x; pill.y = where === "below" ? f.y + f.height + 16 : f.y - 46;
  for (const n of [ring, pill]) { n.locked = true; n.setPluginData("pawnote", tag); }
  return { ring, pill };
}
// A neutral note under a frame, no outline: e.g. "Not linked · Chip · State=On (look)". Current state, not a change.
function drawCheck(parent, f, text, font, tag, dy = 16) {
  const pill = figma.createFrame(); parent.appendChild(pill);
  pill.name = "Check · not linked"; pill.layoutMode = "HORIZONTAL"; pill.primaryAxisSizingMode = "AUTO"; pill.counterAxisSizingMode = "AUTO";
  pill.paddingLeft = pill.paddingRight = 12; pill.paddingTop = pill.paddingBottom = 5; pill.cornerRadius = 14;
  pill.fills = [{ type: "SOLID", color: { r: 0.937, g: 0.937, b: 0.925 } }];
  const t = figma.createText(); t.fontName = font; t.fontSize = 13; t.characters = text; t.fills = [{ type: "SOLID", color: { r: 0.247, g: 0.29, b: 0.263 } }];
  pill.appendChild(t);
  pill.x = f.x; pill.y = f.y + f.height + dy; pill.locked = true; pill.setPluginData("pawnote", tag);
  return pill;
}
// "Chip · State=On (look) ×2, Button (layout)" from the parts a frame drew as plain layers
function notLinkedText(list) {
  const counts = new Map(); for (const k of list) counts.set(k, (counts.get(k) || 0) + 1);
  const parts = [...counts].map(([k, n]) => `${k}${n > 1 ? ` ×${n}` : ""}`);
  return `Not linked · ${parts.slice(0, 3).join(", ")}${parts.length > 3 ? ` +${parts.length - 3} more` : ""}`;
}

/* The "Run log" note on a page: newest run on top, the last 12 kept. Never removed by a run. */
async function runLog(page, entry, bodyFont, labelFont) {
  let note = page.children.find((n) => n.getPluginData("pawnote") === "runlog");
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const prev = note ? JSON.parse(note.getPluginData("entries") || "[]") : [];
  const entries = [`${stamp} UTC · ${entry}`, ...prev].slice(0, 12);
  if (!note) {
    note = figma.createFrame(); note.name = "Run log · Goldito plugin"; note.setPluginData("pawnote", "runlog");
    note.layoutMode = "VERTICAL"; note.itemSpacing = 12; note.paddingTop = note.paddingBottom = note.paddingLeft = note.paddingRight = 24;
    note.primaryAxisSizingMode = "AUTO"; note.counterAxisSizingMode = "FIXED"; note.resize(900, 100);
    note.cornerRadius = 16; note.fills = [solid({ r: 1, g: 0.98, b: 0.92, a: 1 })];
    page.appendChild(note);
    let right = 0; for (const n of page.children) if (n !== note) right = Math.max(right, n.x + n.width);
    note.x = right + 200; note.y = 0;
  }
  for (const k of [...note.children]) k.remove();
  const head = figma.createText(); head.fontName = labelFont; head.fontSize = 28; head.characters = "Run log · what each plugin run changed";
  note.appendChild(head);
  const help = figma.createText(); help.fontName = bodyFont; help.fontSize = 16;
  help.characters = `Each run saves a restore point first (File › Show version history, \"Goldito plugin · before …\"). Notes, stickies and frames people add inside the sections are kept. What's new: a green outline and tag on new screens, orange on changed ones (with what changed), for ${FLAG_DAYS} days.`;
  note.appendChild(help); help.layoutSizingHorizontal = "FILL"; help.textAutoResize = "HEIGHT";
  for (const e of entries) {
    const t = figma.createText(); t.fontName = bodyFont; t.fontSize = 18; t.characters = e;
    note.appendChild(t); t.layoutSizingHorizontal = "FILL"; t.textAutoResize = "HEIGHT";
  }
  note.setPluginData("entries", JSON.stringify(entries));
}

/* After a whole screen is built: a text the browser drew on one line that wraps in Figma (the fonts measure a
   little wider there) hugs its words instead, and any fixed-width box around it grows to fit. Then a text wider
   than its column fills the column and wraps, never clipped. */
function repairWraps(root) {
  if (!root || !root.findAll) return 0;
  let fixed = 0;
  for (const t of root.findAll((n) => n.type === "TEXT" && n.getPluginData("oneLine") === "1")) {
    const bh = parseFloat(t.getPluginData("bh")) || 0;
    if (!bh || t.height <= bh * 1.4) continue;
    try {
      const inFlow = t.parent && "layoutMode" in t.parent && t.parent.layoutMode !== "NONE" && t.layoutPositioning !== "ABSOLUTE";
      if (inFlow && t.layoutSizingHorizontal !== "FILL") t.layoutSizingHorizontal = "HUG";
      t.textAutoResize = inFlow && t.layoutSizingHorizontal === "FILL" ? "HEIGHT" : "WIDTH_AND_HEIGHT";
      if (t.textAutoResize === "HEIGHT") { t.maxLines = 1; t.textTruncation = "ENDING"; }
      fixed++;
    } catch (e) { continue; }
    // fixed-width boxes around it (a title column next to the bell) grow to fit; stop at a filling box or the screen
    for (let p = t.parent; p && p !== root && p.type === "FRAME"; p = p.parent) {
      const pAL = p.parent && "layoutMode" in p.parent && p.parent.layoutMode !== "NONE";
      if (!pAL || p.layoutMode === "NONE") break;
      try {
        if (p.layoutSizingHorizontal === "FIXED") p.layoutSizingHorizontal = "HUG";
        if (p.layoutSizingVertical === "FIXED") p.layoutSizingVertical = "HUG";
      } catch (e) { break; }
      if (p.layoutSizingHorizontal === "FILL") break;
    }
  }
  // Then any text still wider than the column it sits in (a message under an avatar row) wraps inside the column
  // instead of being cut off at its edge.
  for (const t of root.findAll((n) => n.type === "TEXT")) {
    const p = t.parent;
    if (!p || !("layoutMode" in p) || p.layoutMode === "NONE" || t.layoutPositioning === "ABSOLUTE") continue;
    const inner = p.width - (p.paddingLeft || 0) - (p.paddingRight || 0);
    if (p.layoutMode === "VERTICAL" && t.width > inner + 1) {
      try { t.layoutSizingHorizontal = "FILL"; t.textAutoResize = "HEIGHT"; fixed++; } catch (e) { /* keep it */ }
    }
  }
  return fixed;
}

async function buildNode(n, parent, images) {
  if (n.k === "text") return buildText(n, parent);
  if (n.k === "inst") return buildInstance(n, parent, images);
  if (n.k === "svg") {
    let s;
    try { s = figma.createNodeFromSvg(n.svg); } catch (e) { s = figma.createRectangle(); s.fills = []; }
    s.name = n.name || "icon";
    s.setPluginData("svg", "1");
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
  // Auto-layout when the capture has it; if Figma refuses any step, the frame stays as fixed x / y layers.
  let al = false;
  if (n.al) { try { applyAutoLayout(f, n); al = true; } catch (e) { try { f.layoutMode = "NONE"; f.resize(Math.max(0.01, n.w), Math.max(0.01, n.h)); } catch (e2) {} } }
  for (const c of n.children || []) {
    try { const k = await buildNode(c, f, images); if (k && al) placeInFlow(k, c, n); } catch (e) { /* skip one bad layer, keep the screen */ }
  }
  if (al) { try { if (n.hugW) f.layoutSizingHorizontal = "HUG"; if (n.hugH) f.layoutSizingVertical = "HUG"; } catch (e) {} }
  // CSS z-index that falls along the flow (e.g. the Stepper: 5, 4, 3 …) means earlier children sit on top: "First on top".
  // A circle holding one icon (an emoji badge, an avatar glyph): the icon sits in the middle, whatever the capture measured.
  try {
    const kids = f.children.filter((k) => k.layoutPositioning !== "ABSOLUTE");
    const r = typeof f.cornerRadius === "number" ? f.cornerRadius : Math.min(f.topLeftRadius || 0, f.bottomRightRadius || 0);
    if (kids.length === 1 && kids[0].type !== "TEXT" && Math.abs(f.width - f.height) < 1 && r >= f.width / 2 - 1) {
      const icon = kids[0], w = icon.width, h = icon.height;
      if (f.layoutMode === "NONE") { f.layoutMode = "HORIZONTAL"; f.primaryAxisSizingMode = "FIXED"; f.counterAxisSizingMode = "FIXED"; f.resize(n.w, n.h); al = true; }
      f.paddingTop = f.paddingBottom = f.paddingLeft = f.paddingRight = 0;
      f.primaryAxisAlignItems = "CENTER"; f.counterAxisAlignItems = "CENTER";
      icon.layoutSizingHorizontal = "FIXED"; icon.layoutSizingVertical = "FIXED"; icon.resize(w, h);
    }
  } catch (e) {}
  // Earlier children must sit on top ("First on top") when CSS stacks them that way (z-index 5, 4, 3 …) or when a
  // later child's absolutely positioned part reaches back over the one before it (the Stepper's connector lines).
  if (al) { const flow = (n.children || []).filter((c) => c.flow && !c.flow.abs), H = !!n.al && n.al.mode === "H";
    const zs = flow.map((c) => c.flow.z);
    const zDown = zs.length > 1 && zs.every((z) => z != null) && zs.every((z, i) => i === 0 || z < zs[i - 1]);
    const reachBack = flow.slice(1).some((c) => (c.children || []).some((g) => g.flow && g.flow.abs && (H ? g.x < 0 : g.y < 0)));
    if (zDown || reachBack) { try { f.itemReverseZIndex = true; } catch (e) {} } }
  return f;
}

/* ---------- auto-layout (captures made with window.__pawnoteAutoLayout, e.g. the ticket workbenches) ----------
   A flex or equal-column grid box becomes an auto-layout frame with the same direction, gap, padding and
   alignment; its children hug, fill or keep their size as they did in the browser; absolutely positioned
   children stay where they were (layoutPositioning ABSOLUTE). */
const AL_JUSTIFY = { center: "CENTER", end: "MAX", "flex-end": "MAX", right: "MAX", "space-between": "SPACE_BETWEEN" };
const AL_ALIGN = { center: "CENTER", end: "MAX", "flex-end": "MAX", baseline: "BASELINE" };
function applyAutoLayout(f, n) {
  const al = n.al;
  f.layoutMode = al.mode === "H" ? "HORIZONTAL" : "VERTICAL";
  f.primaryAxisSizingMode = "FIXED"; f.counterAxisSizingMode = "FIXED";
  f.resize(Math.max(0.01, n.w), Math.max(0.01, n.h));
  f.strokesIncludedInLayout = true;   // CSS border-box: padding starts inside the border
  [f.paddingTop, f.paddingRight, f.paddingBottom, f.paddingLeft] = al.pad.map((v) => Math.max(0, v));
  f.itemSpacing = Math.max(0, al.gap || 0);
  if (al.wrap) { f.layoutWrap = "WRAP"; f.counterAxisSpacing = Math.max(0, al.cgap || 0); }
  f.primaryAxisAlignItems = AL_JUSTIFY[al.justify] || "MIN";
  f.counterAxisAlignItems = al.align === "baseline" && al.mode !== "H" ? "MIN" : AL_ALIGN[al.align] || "MIN";
}
function placeInFlow(k, c, parent) {
  if (c.flow && c.flow.abs) { try { k.layoutPositioning = "ABSOLUTE"; k.x = c.x; k.y = c.y; } catch (e) {} return; }
  const al = parent.al, H = al.mode === "H", inner = parent.inner || { w: parent.w, h: parent.h };
  const canHug = k.type === "TEXT" || ("layoutMode" in k && k.layoutMode !== "NONE");
  const text = k.type === "TEXT";
  // primary axis: grows (flex-grow, or a single-row grid cell) → fill; text and hugging boxes → hug; else fixed
  const grow = (c.flow && c.flow.grow) || (al.grid && !al.wrap);
  // A one-line text in a row hugs its words, even when the browser drew it inside a wider box (span), so a longer
  // label in an instance grows the chip or button instead of wrapping inside the old width.
  const hugP = text ? !(H ? c.wrap : false) : H ? c.hugW : c.hugH;
  const parentHugP = H ? parent.hugW : parent.hugH, parentHugC = H ? parent.hugH : parent.hugW;
  // A label that is the only thing in a row (a button, a pill) fills it, so a longer override never wraps or clips.
  const soleText = text && H && (parent.children || []).filter((x) => !(x.flow && x.flow.abs)).length === 1;
  const p = (grow || soleText) && !parentHugP ? "FILL" : canHug && hugP ? "HUG" : "FIXED";
  // counter axis: stretched to the parent's inner size → fill; else hug or fixed
  const cross = H ? c.h : c.w, innerCross = H ? inner.h : inner.w;
  const stretch = /normal|stretch/.test(al.align) && !/^(center|start|end|flex-start|flex-end|baseline)$/.test((c.flow && c.flow.self) || "auto");
  const fillC = !parentHugC && Math.abs(cross - innerCross) < 1 && (stretch || (text && c.wrap));
  const hugC = text ? (H ? true : !(c.wrap || c.span)) : H ? c.hugH : c.hugW;
  const q = fillC ? "FILL" : canHug && hugC ? "HUG" : "FIXED";
  try { if (H) { k.layoutSizingHorizontal = p; k.layoutSizingVertical = q; } else { k.layoutSizingVertical = p; k.layoutSizingHorizontal = q; } }
  catch (e) { /* keep the fixed size */ }
  if (text && (k.layoutSizingHorizontal === "FILL" || k.layoutSizingHorizontal === "FIXED") && c.wrap) k.textAutoResize = "HEIGHT";
  // A one-line block of text (span) never wraps: Figma draws Fredoka and Jakarta a little wider than the browser, so the
  // browser's exact box width would break "Bookings" onto two lines. Fill keeps it aligned; the text itself stays one line.
  if (text && c.span && !c.wrap && !soleText) {
    try { if (k.layoutSizingHorizontal === "FIXED") k.layoutSizingHorizontal = "HUG"; k.textAutoResize = k.layoutSizingHorizontal === "FILL" ? "HEIGHT" : "WIDTH_AND_HEIGHT"; } catch (e) {}
  }
  if (soleText && k.layoutSizingHorizontal === "FILL") { k.textAutoResize = "HEIGHT"; if (/center/.test(al.justify || "")) k.textAlignHorizontal = "CENTER"; }
  // A form field's value: fills the field; a one-line field cuts long text with "…" instead of wrapping or spilling.
  if (text && c.name === "value" && parent.field) {
    try { k.layoutSizingHorizontal = "FILL"; k.textAutoResize = "HEIGHT"; if (parent.field === "line") { k.textTruncation = "ENDING"; k.maxLines = 1; } } catch (e) {}
  }
}

const GROUP_ORDER = [
  "Redesign · live app tabs (D47)",
  "Get started › Owner sign-up", "Get started › Sitter setup", "Get started › Log in",
  "Home", "Stay › 1 Inquiry", "Stay › 2 Meet & Greet", "Stay › 3 Booking", "Stay › 4 Pick-up & care", "Stay › 5 Home & review",
  "Feed", "Care", "Reports", "Over any screen",
];

let COMPOSED_SCREENS = [];
// Set to true to rebuild the archived Balanced and Live screen sections on the Screens page as well.
const BUILD_ARCHIVED_SCREENS = false;
/* The "In the app" section was drawn by hand on Oct 19 to show the app's own screens; runs don't rebuild it. Header C
   shipped on Oct 23 (#294): the title has "Name · Role" under it, the role chip is gone, and your avatar (in a thin
   ring) replaces the menu icon and opens the same drawer. This brings that section's App Header component in line
   once; the header screens there are instances, so they follow. A "Changed" tag marks it for FLAG_DAYS days. */
async function refreshInAppHeader(page, now) {
  const sec = page.children.find((n) => n.type === "SECTION" && /^In the app/.test(n.name));
  if (!sec) return "";
  // flags drawn here by earlier runs expire like the others
  for (const n of sec.findAll((k) => k.getPluginData("pawnote") === "inapp-flag"))
    if ((Date.parse(now) - Date.parse(n.getPluginData("at") || now)) / 864e5 >= FLAG_DAYS) n.remove();
  const set = sec.findOne((n) => n.type === "COMPONENT_SET" && n.name === "App Header");
  if (set && set.getPluginData("headerC")) { for (const n of set.findAll((k) => k.name === "Avatar menu")) fixAvatar(n); return ""; }
  if (!set) return "";
  const vars = {}; for (const v of await figma.variables.getLocalVariablesAsync()) vars[v.name] = v;
  const paint = (name, hex) => {
    const c = { r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255 };
    const p = { type: "SOLID", color: c }, v = vars[`color/${name}`];
    return v ? figma.variables.setBoundVariableForPaint(p, "color", v) : p;
  };
  const who = { Owner: "Robert", Sitter: "Chloe" };
  for (const v of set.children) {
    const role = /Sitter/.test(v.name) ? "Sitter" : "Owner";
    const title = v.children.find((n) => n.type === "TEXT");
    const tag = v.children.find((n) => n.name === "Role tag");
    const menu = v.children.find((n) => n.name === "Menu");
    if (!title || !menu) continue;
    const small = tag && tag.findOne((n) => n.type === "TEXT");
    const smallFont = small ? small.fontName : { family: "Inter", style: "Semi Bold" };
    await figma.loadFontAsync(title.fontName); await figma.loadFontAsync(smallFont);
    // title + "Name · Role" stacked, where the title was
    const box = figma.createFrame(); box.name = "Title"; box.fills = []; box.layoutMode = "VERTICAL";
    box.primaryAxisSizingMode = "AUTO"; box.counterAxisSizingMode = "AUTO";
    v.insertChild(v.children.indexOf(title), box);
    const tx = title.x, grow = title.layoutGrow;
    box.appendChild(title); title.layoutGrow = 0;
    const sub = figma.createText(); sub.fontName = smallFont; sub.fontSize = 13; sub.characters = `${who[role]} · ${role}`;
    sub.fills = [paint("text-muted", "#5C5C5C")]; sub.name = "Name · Role"; box.appendChild(sub);
    if (v.layoutMode === "NONE") { box.x = tx; box.y = Math.round((v.height - box.height) / 2); } else box.layoutGrow = grow;
    if (tag) tag.remove();
    // the avatar: initial on primary, 32 px, in a 1.5 px primary ring, inside the 44 px button
    for (const k of [...menu.children]) k.remove();
    menu.name = "Avatar menu";
    const ring = figma.createFrame(); ring.name = "Avatar ring"; ring.resize(39, 39); ring.cornerRadius = 20;
    ring.fills = []; ring.strokes = [paint("primary", "#2D6A4F")]; ring.strokeWeight = 1.5;
    ring.layoutMode = "HORIZONTAL"; ring.primaryAxisAlignItems = "CENTER"; ring.counterAxisAlignItems = "CENTER";
    const av = figma.createFrame(); av.name = "Avatar · Initial"; av.resize(32, 32); av.cornerRadius = 16; av.fills = [paint("primary", "#2D6A4F")];
    av.layoutMode = "HORIZONTAL"; av.primaryAxisAlignItems = "CENTER"; av.counterAxisAlignItems = "CENTER";
    const ini = figma.createText(); ini.fontName = smallFont; ini.fontSize = 13; ini.characters = who[role][0]; ini.fills = [paint("primary-text", "#FFFFFF")];
    av.appendChild(ini); ring.appendChild(av); menu.appendChild(ring);
    fixAvatar(menu);
  }
  set.setPluginData("headerC", now);
  // captions that mentioned the menu icon
  for (const t of sec.findAll((n) => n.type === "TEXT" && /^\d\. (Owner|Sitter) · Menu/.test(n.characters))) {
    await figma.loadFontAsync(t.fontName);
    t.characters = t.characters.startsWith("3.") ? "3. Owner · Menu (tap your avatar; slides in from the right)" : "5. Sitter · Menu (tap your avatar)";
  }
  // flagged by applyDecisions ("Added · Oct 22 · Header C")
  return "In the app: App Header now matches header C (#294): avatar instead of the menu icon, Name · Role under the title, no role chip.";
}

/* The header avatar keeps its size: a 44 px button holding a 39 px ring around a 32 px initial. Without fixed sizing
   an auto-layout row stretches the ring into a tall pill (Oct 25). Also repairs avatars drawn by earlier runs. */
function fixAvatar(menu) {
  const ring = menu.findOne((n) => n.name === "Avatar ring"), av = menu.findOne((n) => n.name === "Avatar · Initial");
  const fix = (f, size) => {
    if (!f) return;
    if (f.layoutMode !== "NONE") { f.primaryAxisSizingMode = "FIXED"; f.counterAxisSizingMode = "FIXED"; }
    if ("layoutAlign" in f) f.layoutAlign = "INHERIT";
    if ("layoutGrow" in f) f.layoutGrow = 0;
    f.resize(size, size);
  };
  fix(menu, 44); fix(ring, 39); fix(av, 32);
  if (menu.layoutMode === "NONE") { if (ring) { ring.x = (menu.width - 39) / 2; ring.y = (menu.height - 39) / 2; } }
  else { menu.primaryAxisAlignItems = "CENTER"; menu.counterAxisAlignItems = "CENTER"; }
}

async function buildScreens(page, datasets, log, componentsPage) {
  await figma.setCurrentPageAsync(page);
  if (componentsPage) {
    // Composed screens are Balanced only (archived), so they are built only when the archive is rebuilt;
    // otherwise they were left stacked at the page origin on every run.
    try { await loadLibrary(componentsPage); await initDS(SAMPLE); COMPOSED_SCREENS = BUILD_ARCHIVED_SCREENS ? await buildComposedScreens(log) : []; }
    catch (e) { log.push(`Component-built screens skipped: ${e.message || e}`); COMPOSED_SCREENS = []; }
  }
  if (componentsPage) {
    try { const n = await buildExpressiveComponents(componentsPage, datasets, log); say(`✓ ${n} Expressive components on "${componentsPage.name}"`, "ok");
      await componentsPage.loadAsync(); const moved = archiveDuplicates(componentsPage); if (moved) say(`  ${moved} older components with the same names moved to the Archive section (screens using them still work)`, "ok"); }
    catch (e) { log.push(`Expressive components skipped: ${e.message || e}`); XCOMP = new Map(); }
    await figma.setCurrentPageAsync(page);
  }
  // Sections are kept (emptied and refilled) so their node IDs stay stable: the design review links to them.
  const oldSections = new Map();
  // Clean up composed screens orphaned at the page origin by earlier runs (untagged then: "<title> · <look>" frames outside any section).
  const looksRe = /\s·\s(Balanced|Default|Live|Warm|Calm)$/;
  for (const n of [...page.children]) if (n.type === "FRAME" && (n.getPluginData("pawnote") === "composed" || (!n.getPluginData("pawnote") && looksRe.test(n.name)))) n.remove();
  // Only the plugin's own layers are replaced: a note, sticky or frame a dev puts in a section stays (and is counted).
  // Layers from runs before this rule have no tag; those are the screen frames ("D · …") and the plugin's text labels.
  const prevFp = new Map(), prevMeta = new Map(); let keptDev = 0, leftovers = 0, flagged = 0, notLinked = 0;
  const now = new Date().toISOString();
  // Untagged frames named like captured web classes ("jr-stage.is-current", or a frame of "jr-stage-head" parts) are
  // the plugin's own output from older runs (the stepper "Pages variation", Oct 21), not a person's layer.
  const CLASSY = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$|^[a-z]+-[a-z0-9-]+$/;
  const capturedLeftover = (k) => k.type === "FRAME" && !k.getPluginData("pawnote") &&
    (CLASSY.test(k.name) || (k.children.length > 0 && k.children.every((c) => CLASSY.test(c.name))));
  for (const n of page.children.filter((c) => c.getPluginData("pawnote") === "screens")) {
    if (n.type === "SECTION" && !oldSections.has(n.name)) {
      // the untagged rule only for a section last built before tags existed
      const legacy = !n.children.some((k) => k.getPluginData("pawnote") === "screen-part");
      const ours = (k) => k.getPluginData("pawnote") === "screen-part" || (legacy && !k.getPluginData("pawnote") && (k.type === "TEXT" || (k.type === "FRAME" && / · /.test(k.name))));
      for (const k of [...n.children]) {
        if (k.getPluginData("sid")) { prevFp.set(k.getPluginData("sid"), k.getPluginData("fp")); prevMeta.set(k.getPluginData("sid"), readMeta(k)); }
        if (ours(k)) k.remove(); else if (capturedLeftover(k)) { k.remove(); leftovers++; } else keptDev++;
      }
      oldSections.set(n.name, n);
    } else n.remove();
  }
  const seen = new Map();

  const label = await pickFont("Inter", 700, false), body = await pickFont("Inter", 400, false);
  const W = 402, H = 874, GAP = 64, ROW_LABEL = 260, PAD = 80;
  const rowLabel = (parent, chars, top) => { const t = figma.createText(); t.fontName = label; t.fontSize = 20; t.characters = chars;
    parent.appendChild(t); t.textAutoResize = "HEIGHT"; t.resize(ROW_LABEL - 40, t.height); t.x = PAD; t.y = top + 8; t.setPluginData("pawnote", "screen-part"); return t; };
  const concepts = datasets.map((d) => ({ k: d.concept, label: d.label }));
  let y = 0;

  const title = figma.createText(); title.fontName = label; title.fontSize = 64; title.characters = "Screens · by app map";
  page.appendChild(title); title.x = 0; title.y = y; title.setPluginData("pawnote", "screens");
  const sub = figma.createText(); sub.fontName = body; sub.fontSize = 24;
  sub.characters = "Expressive: every screen of the Draft in the Expressive look, as the Prototype tab shows it: app tabs, the whole stay ① to ⑤ at full length in the stepper layout, onboarding, and (Oct 25) every other screen the app has: chat, care and history, bookings, Snap, pets, people and schedule. Captured from the prototypes, editable layers; logos and icons are vectors. The older Balanced and Live screens are on the Archive page. Re-run the Goldito plugin after changes.";
  page.appendChild(sub); sub.x = 0; sub.y = y + 90; sub.setPluginData("pawnote", "screens");
  y += 220;

  let built = 0;
  const order = SECTION_ORDER();
  // Grid: sections flow left to right and wrap; the same 160 px gap both ways.
  const SECTION_GAP = 160, MAX_ROW = 12000;
  let x = 0, rowH = 0, lastCat = null;
  for (const group of order) {
    // Expressive is the look (Oct 19): the Balanced and Live screens were moved to the "Archive" page and are not rebuilt.
    if (!BUILD_ARCHIVED_SCREENS && !/^Expressive/.test(group)) continue;
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
    // Each row is as tall as its tallest screen (Expressive stay screens are captured at full length).
    const rowHs = rows.map((d) => Math.max(H, ...d.screens.filter((x) => x.group === group).map((x) => x.tree.h || H)));
    const rowTop = []; let acc = PAD + 84;   // room under the column titles for a "What's new" tag
    for (const h of rowHs) { rowTop.push(acc); acc += h + GAP + 40; }
    for (const _ of lookNames) { rowTop.push(acc); acc += H + GAP + 40; }
    const sh = acc - GAP - 40 + PAD;
    section.resizeWithoutConstraints(sw, sh);

    // Column headers (screen titles)
    ids.forEach((id, col) => {
      const any = datasets.flatMap((d) => d.screens).find((s) => s.id === id) || COMPOSED_SCREENS.find((c) => c.id === id);
      const h = figma.createText(); h.fontName = label; h.fontSize = 22; h.characters = `${col + 1}. ${any.title}`;
      section.appendChild(h); h.x = PAD + ROW_LABEL + col * (W + GAP); h.y = PAD; h.setPluginData("pawnote", "screen-part");
    });
    for (const [row, d] of rows.entries()) {
      const top = rowTop[row];
      rowLabel(section, d.label, top);
      for (const [col, id] of ids.entries()) {
        const s = d.screens.find((x) => x.id === id && x.group === group);
        if (!s) continue;
        try {
          const plain0 = (XSTATS.plain || []).length;
          const f = await buildNode(s.tree, section, d.images);
          repairWraps(f);
          f.name = `${d.concept} · ${s.title}`;
          const sid = `${d.concept}/${s.id}`, fp = fingerprint(s.tree), cur = facets(s.tree);
          const flag = flagFor(prevMeta.get(sid), fp, cur, prevFp.size === 0, now);
          f.setPluginData("pawnote", "screen-part"); f.setPluginData("sid", sid); saveMeta(f, fp, cur, flag);
          seen.set(sid, { fp, name: f.name });
          f.x = PAD + ROW_LABEL + col * (W + GAP); f.y = top;
          f.clipsContent = true;
          if (flag) { drawFlag(section, f, flag, label, "screen-part"); flagged++; }
          const plainHere = (XSTATS.plain || []).slice(plain0);
          if (plainHere.length) { drawCheck(section, f, notLinkedText(plainHere), label, "screen-part"); notLinked++; }
          built++;
        } catch (e) { log.push(`Screen ${d.concept}/${s.id}: ${e.message || e}`); }
      }
    }
    for (const [li, look] of lookNames.entries()) {
      const top = rowTop[rows.length + li];
      rowLabel(section, `${look}\n(components)`, top);
      for (const [col, id] of ids.entries()) {
        const c = composed.find((x) => x.id === id && x.look === look);
        if (!c) continue;
        section.appendChild(c.frame); c.frame.x = PAD + ROW_LABEL + col * (W + GAP); c.frame.y = top; c.frame.setPluginData("pawnote", "screen-part"); built++;
      }
    }
    x += sw + SECTION_GAP; rowH = Math.max(rowH, sh);
    say(`  ${group}: done (${built} so far)`);
    await tick();
  }
  // groups that no longer exist: gone, unless a dev left something in them
  for (const n of oldSections.values()) { if (n.children.length) n.name = `No longer built · ${n.name}`; else n.remove(); }
  // 3. what changed since the last run, for the plugin window and the Run log note on this page
  const added = [], changed = [], removed = [];
  for (const [sid, v] of seen) { if (!prevFp.has(sid)) added.push(v.name); else if (prevFp.get(sid) !== v.fp) changed.push(v.name); }
  for (const sid of prevFp.keys()) if (!seen.has(sid)) removed.push(sid.replace("/", " · "));
  const first = prevFp.size === 0;
  const report = first
    ? `First tracked run: ${seen.size} screens. From the next run on, this log lists what changed.`
    : `${changed.length} changed, ${added.length} new, ${removed.length} removed, ${seen.size - changed.length - added.length} unchanged.` +
      (changed.length ? `\nChanged: ${changed.join(", ")}` : "") + (added.length ? `\nNew: ${added.join(", ")}` : "") + (removed.length ? `\nRemoved: ${removed.join(", ")}` : "");
  say(`Changes: ${report.split("\n")[0]}`, "ok");
  for (const line of report.split("\n").slice(1)) say(`  ${line}`);
  if (keptDev) say(`  Kept ${keptDev} layer${keptDev > 1 ? "s" : ""} a person added inside the sections.`, "ok");
  const inApp = await refreshInAppHeader(page, now);
  if (inApp) say(`  ${inApp}`, "ok");
  if (notLinked) say(`  ${notLinked} screen${notLinked > 1 ? "s have" : " has"} parts drawn as plain layers, marked "Not linked" under the frame.`, "warn");
  if (flagged) say(`  ${flagged} screen${flagged > 1 ? "s" : ""} flagged as new or changed (outline and tag, ${FLAG_DAYS} days).`, "ok");
  if (leftovers) say(`  Removed ${leftovers} old plugin layer${leftovers > 1 ? "s" : ""} (captured class names from earlier runs).`, "ok");
  await runLog(page, `Screens · ${report}${keptDev ? `\nKept ${keptDev} layers people added.` : ""}${leftovers ? `\nRemoved ${leftovers} old plugin layers left by earlier runs.` : ""}${inApp ? `\n${inApp}` : ""}${XSTATS.components && XSTATS.components.changed.length ? `\nComponents: ${XSTATS.components.changed.join("; ")}` : ""}${XSTATS.components && XSTATS.components.removed.length ? `\nComponent variants removed: ${XSTATS.components.removed.join(", ")}` : ""}${notLinked ? `\n${notLinked} screens have parts drawn as plain layers ("Not linked" under the frame).` : ""}`, body, label);
  if (XSTATS.instances || XSTATS.detached) say(`Expressive screens: ${XSTATS.instances} component instances, ${XSTATS.detached} parts drawn as plain layers (${XSTATS.restyled || 0} of them look different from their component, the rest differ in layout).`, XSTATS.detached ? "warn" : "ok");
  return built;
}


/* ---------- Expressive components (from the captures) ----------
   capture/components.js marks repeated parts of the Expressive prototype (tab bars, buttons, chips, stage cards…).
   Here each component + variant is built once, from its first occurrence, on the Components page; screens then place
   instances and override only text and photos. An occurrence whose layers don't line up with its component
   (different number of texts) is drawn as plain layers and counted as "not linked". */
let XCOMP = new Map();
const XSTATS = { instances: 0, detached: 0 };
const textLeaves = (n, out = []) => { if (n.k === "text") out.push(n); else if (n.k !== "svg") (n.children || []).forEach((c) => textLeaves(c, out)); return out; };
const imageLeaves = (n, out = []) => { if (n.k === "image" || (n.k === "frame" && n.bgImg)) out.push(n); if (n.k !== "svg") (n.children || []).forEach((c) => imageLeaves(c, out)); return out; };

// Children follow their parent when an instance is resized: full-width parts stretch, centred parts stay centred,
// right-aligned parts stay right. A centred single-line label is widened to the parent and centre-aligned so a
// longer override stays centred.
function constrainTree(frame) {
  const W = frame.width, H = frame.height;
  // Auto-layout places its children itself: constraints don't apply, and fixing a hugging label's width would undo the Hug rule.
  const auto = "layoutMode" in frame && frame.layoutMode !== "NONE";
  for (const k of frame.children || []) {
    if (auto || k.layoutPositioning === "ABSOLUTE") { if (k.type === "FRAME" && k.getPluginData("svg") !== "1") constrainTree(k); if (auto) continue; }
    if (!("constraints" in k) && k.type !== "TEXT" && k.type !== "FRAME" && k.type !== "RECTANGLE" && k.type !== "INSTANCE") continue;
    const cx = k.x + k.width / 2, cy = k.y + k.height / 2;
    let h = k.width >= W * 0.8 ? "STRETCH" : Math.abs(cx - W / 2) < 2 ? "CENTER" : W - k.x - k.width < k.x ? "MAX" : "MIN";
    const v = k.height >= H * 0.8 ? "STRETCH" : Math.abs(cy - H / 2) < 2 ? "CENTER" : H - k.y - k.height < k.y ? "MAX" : "MIN";
    if (k.type === "TEXT" && h === "CENTER" && k.textAutoResize === "WIDTH_AND_HEIGHT") {
      const pad = Math.max(0, Math.min(k.x, W - k.x - k.width) - 2);
      k.textAutoResize = "HEIGHT"; k.textAlignHorizontal = "CENTER"; k.x = pad; k.resize(Math.max(1, W - 2 * pad), k.height); h = "STRETCH";
    } else if (k.type === "TEXT" && h === "STRETCH" && k.textAutoResize === "WIDTH_AND_HEIGHT") k.textAutoResize = "HEIGHT";
    try { k.constraints = { horizontal: h, vertical: v }; } catch (e) {}
    if (k.type === "FRAME" && k.getPluginData("svg") !== "1") constrainTree(k);
  }
}

async function buildExpressiveComponents(page, datasets, log) {
  await figma.setCurrentPageAsync(page);
  for (const n of page.children.filter((c) => c.getPluginData("pawnote") === "xcomp")) n.remove();
  XCOMP = new Map(); XSTATS.instances = 0; XSTATS.detached = 0; XSTATS.restyled = 0; XSTATS.plain = [];
  const groups = new Map(); // comp -> Map(variant -> { tree, images })
  const visit = (n, images) => {
    if (n.k === "inst") { if (!groups.has(n.comp)) groups.set(n.comp, new Map()); const g = groups.get(n.comp); if (!g.has(n.variant)) g.set(n.variant, { tree: n.tree, images }); return; }
    (n.children || []).forEach((c) => visit(c, images));
  };
  for (const d of datasets) for (const s of d.screens) visit(s.tree, d.images);
  if (!groups.size) return 0;
  const section = figma.createSection();
  section.name = "Expressive components";
  section.setPluginData("pawnote", "xcomp");
  page.appendChild(section);
  const label = await pickFont("Fredoka", 600, false), body = await pickFont("Inter", 400, false);
  const head = figma.createText(); head.fontName = label; head.fontSize = 56; head.characters = "Expressive components";
  section.appendChild(head); head.x = 80; head.y = 80;
  const sub = figma.createText(); sub.fontName = body; sub.fontSize = 22;
  sub.characters = "Built from the Expressive prototype by the Goldito plugin. The Expressive screens on the Screens page are instances of these: edit a component here and every screen follows. Texts and photos are per-screen overrides.";
  section.appendChild(sub); sub.x = 80; sub.y = 160; sub.textAutoResize = "HEIGHT"; sub.resize(2400, sub.height);
  let x = 80, y = 260, rowH = 0, count = 0;
  const ROW = 5200;
  // last build of every component variant (fingerprint, facets, size, flag): flags last FLAG_DAYS days, like screens'
  let xmetaPrev = {}; try { xmetaPrev = JSON.parse(figma.root.getPluginData("xcompMeta") || "{}"); } catch (e) {}
  if (!Object.keys(xmetaPrev).length && typeof XCOMP_BASELINE === "object") xmetaPrev = XCOMP_BASELINE;   // first tracked run
  const xmetaNext = {}, xNow = new Date().toISOString(), xFirst = !Object.keys(xmetaPrev).length, xChanged = [];
  for (const [comp, variants] of groups) {
    const built = [];
    for (const [variant, { tree, images }] of variants) {
      try {
        const f = await buildNode({ ...tree, x: 0, y: 0 }, section, images);
        repairWraps(f);
        const firstOnTop = !!f.itemReverseZIndex;
        const c = figma.createComponentFromNode(f);
        if (firstOnTop) c.itemReverseZIndex = true;
        c.name = variant || comp;
        c.description = `${comp}. Captured from the Expressive prototype (Prototype tab).`;
        c.setPluginData("look", lookOf(tree));
        constrainTree(c);
        built.push([variant, c]);
      } catch (e) { log.push(`Component ${comp} ${variant}: ${e.message || e}`); }
    }
    if (!built.length) continue;
    let node;
    if (built.length > 1 || built[0][0]) {
      node = figma.combineAsVariants(built.map(([, c]) => c), section);
      node.name = comp;
      node.layoutMode = "HORIZONTAL"; node.layoutWrap = "WRAP"; node.itemSpacing = 24; node.counterAxisSpacing = 24;
      node.paddingTop = node.paddingBottom = node.paddingLeft = node.paddingRight = 24;
      node.primaryAxisSizingMode = "AUTO"; node.counterAxisSizingMode = "AUTO";
      fitVariantSet(node, 2400);
      node.fills = [solid({ r: 1, g: 1, b: 1, a: 1 })];
    } else { node = built[0][1]; node.name = comp; }
    for (const [variant, c] of built) XCOMP.set(`${comp}|${variant}`, c);
    const cap = figma.createText(); cap.fontName = label; cap.fontSize = 24; cap.characters = `${comp} · ${built.length} variant${built.length > 1 ? "s" : ""}`;
    if (x > 80 && x + node.width > ROW) { x = 80; y += rowH + 120; rowH = 0; }
    section.appendChild(cap); cap.x = x; cap.y = y;
    node.x = x; node.y = y + 44;
    // What changed in this component since the last run (look, size, copy), or a new one: a tag beside its name
    const changes = [];
    for (const [variant] of built) {
      const { tree } = variants.get(variant), key = `${comp}|${variant}`, fp = fingerprint(tree), cur = facets(tree);
      const prev = xmetaPrev[key];
      let flag = flagFor(prev, fp, cur, xFirst, xNow);
      if (flag && prev && prev.w != null && (Math.abs(prev.w - tree.w) > 0.5 || Math.abs(prev.h - tree.h) > 0.5) && flag.at === xNow && flag.what !== "New")
        flag = { ...flag, what: [...new Set([...flag.what.split(", "), "Size"])].join(", ") };
      xmetaNext[key] = { fp, fc: cur.fc, texts: cur.texts.slice(0, 40), w: tree.w, h: tree.h, flag };
      if (flag) changes.push([variant, flag]);
    }
    if (changes.length) {
      const isNew = changes.every(([, f]) => f.what === "New") && changes.length === built.length;
      const at = changes.map(([, f]) => f.at).sort().pop();
      const what = isNew ? "New" : [...new Set(changes.flatMap(([, f]) => (f.what === "New" ? ["New variant"] : f.what.split(", "))))].join(", ");
      const note = isNew ? "" : changes.map(([v]) => v || comp).slice(0, 2).join(", ");
      const { pill } = drawFlag(section, node, { at, what, note }, label, "xcomp-flag");
      pill.x = cap.x + cap.width + 16; pill.y = cap.y - 2;
      xChanged.push(`${comp}${isNew ? " (new)" : `: ${what}`}`);
    }
    x += Math.max(node.width, cap.width) + 120; rowH = Math.max(rowH, node.height + 44);
    count += built.length;
    await tick();
  }
  section.resizeWithoutConstraints(ROW + 160, y + rowH + 120);
  figma.root.setPluginData("xcompMeta", JSON.stringify(xmetaNext));
  const gone = Object.keys(xmetaPrev).filter((k) => !xmetaNext[k]);
  XSTATS.components = { changed: xChanged, removed: gone.map((k) => k.replace("|", " · ")), first: xFirst };
  if (xChanged.length) say(`  Components changed or new: ${xChanged.join("; ")} (tagged beside each name).`, "ok");
  if (gone.length) say(`  Component variants no longer captured: ${gone.map((k) => k.replace("|", " · ")).join(", ")}.`, "warn");
  // Above everything else on the page.
  let minY = Infinity;
  for (const n of page.children) if (n !== section) minY = Math.min(minY, n.y);
  section.x = 0; section.y = (isFinite(minY) ? minY : 0) - section.height - 400;
  return count;
}

async function overrideRuns(t, runs) {
  for (const f of t.getRangeAllFontNames(0, Math.max(1, t.characters.length))) { const k = `${f.family}|${f.style}`; if (!LOADED.has(k)) { await figma.loadFontAsync(f); LOADED.add(k); } }
  await styleRuns(t, runs);
}

async function buildInstance(n, parent, images) {
  const master = XCOMP.get(`${n.comp}|${n.variant}`);
  const why = (reason) => { (XSTATS.plain || (XSTATS.plain = [])).push(`${n.comp}${n.variant ? ` · ${n.variant}` : ""} (${reason})`); };
  const plain = async () => { const f = await buildNode({ ...n.tree, x: n.x, y: n.y }, parent, images); f.name = `${n.comp} (not linked)`; XSTATS.detached++; return f; };
  if (!master) { why("no component"); return plain(); }
  // Same layers but a different look (a fill or line in another colour, e.g. an ink chip vs a mint one, Oct 23): an
  // instance would keep the master's look under this occurrence's text colour, so draw it as plain layers instead.
  if (!sameLook(master, n.tree)) { XSTATS.restyled = (XSTATS.restyled || 0) + 1; why("look"); return plain(); }
  const inst = master.createInstance();
  parent.appendChild(inst);
  inst.x = n.x; inst.y = n.y;
  if (Math.abs(inst.width - n.w) > 0.5 || Math.abs(inst.height - n.h) > 0.5) inst.resize(Math.max(0.01, n.w), Math.max(0.01, n.h));
  const want = textLeaves(n.tree), have = inst.findAll((x) => x.type === "TEXT");
  if (want.length !== have.length) { inst.remove(); why("layout"); return plain(); }
  // A master that remembers its source texts (ticket components) is only overridden where this occurrence's text
  // differs from the source, so a label the designer edits on the master reaches every instance.
  let src = null; try { src = JSON.parse(master.getPluginData("srcTexts") || "null"); } catch (e) {}
  for (const [i, w] of want.entries()) {
    const chars = w.runs.map((r) => r.text).join("") || " ";
    if (src ? src[i] !== chars : have[i].characters !== chars) await overrideRuns(have[i], w.runs);
  }
  const imgs = imageLeaves(n.tree), slots = inst.findAll((x) => (x.type === "RECTANGLE" || x.type === "FRAME") && Array.isArray(x.fills) && x.fills.some((f) => f.type === "IMAGE"));
  if (imgs.length === slots.length) for (const [i, w] of imgs.entries()) {
    const h = imageHash(images, w.img || w.bgImg);
    if (h) slots[i].fills = slots[i].fills.map((f) => (f.type === "IMAGE" ? { ...f, imageHash: h } : f));
  }
  // a text override can re-hug an auto-layout instance: keep the captured size
  if (Math.abs(inst.width - n.w) > 0.5 || Math.abs(inst.height - n.h) > 0.5) inst.resize(Math.max(0.01, n.w), Math.max(0.01, n.h));
  inst.name = n.comp;
  XSTATS.instances++;
  return inst;
}
// The look a component was built from (its captured root fill and line), kept on the master as plugin data, so an
// occurrence is compared with the capture, not with Figma's variable-bound paints.
const hexOf = (c) => (c && (c.a == null || c.a > 0.05) ? [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("") : "");
const lookOf = (tree) => `${hexOf(tree.fill)}|${hexOf(tree.stroke)}`;
function sameLook(master, tree) {
  const was = master.getPluginData("look");
  if (!was) return true;   // older masters and ticket components: layout check only
  const near = (a, b) => !a || !b ? a === b : [0, 2, 4].every((i) => Math.abs(parseInt(a.substr(i, 2), 16) - parseInt(b.substr(i, 2), 16)) <= 10);
  const [f0, s0] = was.split("|"), [f1, s1] = lookOf(tree).split("|");
  return near(f0, f1) && (!s0 || !s1 || near(s0, s1));
}

// Expressive replaces the older component with the same name (Mook, Oct 18): the older one moves to an "Archive"
// section at the bottom of the Components page, renamed "Archive / Name", so existing instances keep working.
function archiveDuplicates(page) {
  const xs = page.children.find((c) => c.getPluginData("pawnote") === "xcomp");
  if (!xs) return 0;
  const names = new Set(xs.children.filter((c) => c.type === "COMPONENT" || c.type === "COMPONENT_SET").map((c) => c.name));
  let arch = page.children.find((c) => c.getPluginData("pawnote") === "archive");
  const olds = page.children.filter((c) => (c.type === "COMPONENT" || c.type === "COMPONENT_SET") && c.getPluginData("pawnote") === "components" && names.has(c.name));
  if (!olds.length) return 0;
  if (!arch) { arch = figma.createSection(); arch.name = "Archive"; arch.setPluginData("pawnote", "archive"); page.appendChild(arch); }
  let maxY = 0; for (const n of page.children) if (n !== arch) maxY = Math.max(maxY, n.y + n.height);
  arch.x = 0; arch.y = maxY + 400;
  let x = 80;
  for (const c of olds) { arch.appendChild(c); c.name = `Archive / ${c.name}`; c.x = x; c.y = 80; x += c.width + 80; }
  arch.resizeWithoutConstraints(Math.max(800, x), Math.max(...olds.map((c) => c.height)) + 160);
  return olds.length;
}
