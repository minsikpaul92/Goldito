/* Decisions (Oct 23): what the team decided outside the prototypes (in Figma by hand, in tickets, in PRs), applied
   by the plugin so a run keeps them, and flagged "Added · <date the decision was made>" for FLAG_DAYS days after the
   plugin first applies them. The board on the Components page lists every decision with its date and source.

   Applied here:
   - Icons: the app's Lucide set (Icon.tsx) as one component per meaning, and the Oct 19 hand-drawn icons redrawn.
   - Fonts: the text styles follow the font decisions (see FONT_RULES).
   - The Decisions board, rebuilt each run from DECISIONS. */

const hex2rgb = (hex) => ({ r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255 });

async function decisionVars() {
  const vars = {};
  for (const v of await figma.variables.getLocalVariablesAsync()) vars[v.name] = v;
  return (name, hex) => {
    const p = { type: "SOLID", color: hex2rgb(hex) }, v = vars[`color/${name}`];
    return v ? figma.variables.setBoundVariableForPaint(p, "color", v) : p;
  };
}

// The first time the plugin applies a decision, remember when, so its "Added" flag shows for FLAG_DAYS days.
function firstApplied(id, now) {
  const seen = JSON.parse(figma.root.getPluginData("decisionsApplied") || "{}");
  if (!seen[id]) { seen[id] = now; figma.root.setPluginData("decisionsApplied", JSON.stringify(seen)); }
  return seen[id];
}
const recent = (at, now) => (Date.parse(now) - Date.parse(at)) / 864e5 < FLAG_DAYS;

// Lines and fills of an SVG icon take one colour (bound to color/text), like the app's `color` prop.
function tintVectors(node, paint) {
  for (const n of node.findAll ? node.findAll(() => true) : []) {
    if ("strokes" in n && n.strokes && n.strokes.length) n.strokes = [paint];
    if ("fills" in n && n.fills && n.fills.length && n.type !== "FRAME") n.fills = [paint];
  }
}

/* The app's icons: Components page › "Icons · Lucide (app set)", one component per meaning ("Icon/bell"), the same
   names screens use in code. Components are kept and only redrawn when the SVG changes, so instances keep working. */
async function buildIconSet(page, now, label, body) {
  const paint = await decisionVars();
  let sec = page.children.find((n) => n.getPluginData("pawnote") === "icons-lucide");
  if (!sec) {
    sec = figma.createSection(); page.appendChild(sec); sec.setPluginData("pawnote", "icons-lucide");
    let right = 0, top = Infinity;
    for (const n of page.children) if (n !== sec && n.getPluginData("pawnote") !== "archive") { right = Math.max(right, n.x + n.width); top = Math.min(top, n.y); }
    sec.x = right + 400; sec.y = top === Infinity ? 0 : top;
  }
  sec.name = "Icons · Lucide (app set)";
  for (const n of [...sec.children]) if (n.getPluginData("pawnote") === "icons-part") n.remove();
  const head = figma.createText(); head.fontName = label; head.fontSize = 28; head.characters = "Icons · Lucide (app set)";
  const note = figma.createText(); note.fontName = body; note.fontSize = 15;
  note.characters = "One component per meaning, the names screens use in code: frontend/components/ui/Icon.tsx (Lucide, picked Oct 22, #182; merged Oct 23, #301; clock and tip with #293). 24 px, stroke 2, colour color/text. Icon/chats is Goldito's own paw bubble (#340). Use these, not the Oct 19 parts.";
  note.resize(1100, note.height); note.textAutoResize = "HEIGHT";
  for (const t of [head, note]) { sec.appendChild(t); t.setPluginData("pawnote", "icons-part"); }
  head.x = 40; head.y = 40; note.x = 40; note.y = 88;
  let made = 0, redrawn = 0, col = 0, row = 0;
  const madeNames = [], redrawnNames = [], firstBuild = !sec.children.some((n) => n.type === "COMPONENT");
  const top = note.y + note.height + 40;
  for (const ic of APP_ICONS) {
    let comp = sec.children.find((n) => n.type === "COMPONENT" && n.getPluginData("meaning") === ic.meaning);
    if (comp && comp.getPluginData("svg") !== ic.svg) { for (const k of [...comp.children]) k.remove(); redrawn++; redrawnNames.push(ic.meaning); }
    if (!comp) { comp = figma.createComponent(); sec.appendChild(comp); comp.resize(24, 24); comp.fills = []; comp.setPluginData("meaning", ic.meaning); made++; madeNames.push(ic.meaning); }
    if (!comp.children.length) {
      const svg = figma.createNodeFromSvg(ic.svg);
      tintVectors(svg, paint("text", "#1B4332"));
      for (const k of [...svg.children]) comp.appendChild(k);
      svg.remove();
      comp.setPluginData("svg", ic.svg);
    }
    comp.name = `Icon/${ic.meaning}`;
    comp.description = `${ic.lucide.startsWith("ChatPaw") ? ic.lucide : `Lucide "${ic.lucide}"`}. In code: <Icon name="${ic.meaning}" />.`;
    const x = 40 + col * 132, y = top + row * 96;
    comp.x = x + 30; comp.y = y;
    const cap = figma.createText(); cap.fontName = body; cap.fontSize = 13; cap.characters = ic.meaning;
    sec.appendChild(cap); cap.setPluginData("pawnote", "icons-part"); cap.x = x; cap.y = y + 34;
    if (++col === 10) { col = 0; row++; }
  }
  const rows = Math.ceil(APP_ICONS.length / 10);
  sec.resizeWithoutConstraints(40 + 10 * 132 + 40, top + rows * 96 + 40);
  const at = firstApplied("icons-lucide", now);
  // icons added or redrawn since the last run: remembered for FLAG_DAYS days, like screen and component flags
  let change = null; try { change = JSON.parse(sec.getPluginData("change") || "null"); } catch (e) {}
  if (!firstBuild && (madeNames.length || redrawnNames.length)) {
    const parts = [madeNames.length ? `${madeNames.length} new: ${madeNames.slice(0, 6).join(", ")}${madeNames.length > 6 ? "…" : ""}` : "", redrawnNames.length ? `${redrawnNames.length} redrawn: ${redrawnNames.slice(0, 4).join(", ")}` : ""].filter(Boolean);
    change = { at: now, what: madeNames.length ? "New icons" : "Icons redrawn", note: parts.join("; ") };
    sec.setPluginData("change", JSON.stringify(change));
  }
  return { section: sec, made, redrawn, at, change: change && recent(change.at, now) ? change : null };
}

/* The icons drawn by hand on Oct 19 (Screens › "In the app" › Parts › Icons) were Ionicons shapes. Redraw them
   with the app's Lucide icons once; the header and drawer screens use them as instances, so they follow. */
const OCT19_ICONS = { bell: "bell", menu: "menu", calendar: "calendar", sparkles: "whatsNew", settings: "settings", logout: "logOut", chevron: "forward", back: "back", close: "close" };
async function redrawOct19Icons(screensPage) {
  const sec = screensPage.children.find((n) => n.type === "SECTION" && /^In the app/.test(n.name));
  if (!sec) return 0;
  const paint = await decisionVars();
  let n = 0;
  for (const comp of sec.findAll((k) => k.type === "COMPONENT" && /^Icon\//.test(k.name))) {
    if (comp.getPluginData("lucide")) continue;
    const ic = APP_ICONS.find((i) => i.meaning === OCT19_ICONS[comp.name.slice(5)]);
    if (!ic) continue;
    for (const k of [...comp.children]) k.remove();
    const svg = figma.createNodeFromSvg(ic.svg);
    tintVectors(svg, paint("text", "#1B4332"));
    for (const k of [...svg.children]) comp.appendChild(k);
    svg.remove();
    comp.setPluginData("lucide", ic.lucide);
    comp.description = `Lucide "${ic.lucide}" since Oct 23 (was Ionicons). In code: <Icon name="${ic.meaning}" />.`;
    n++;
  }
  return n;
}

/* ---------- Fonts ----------
   The text styles follow the font decisions: Fredoka for titles (Oct 15), Plus Jakarta Sans for everything else with
   400 / 600 / 700 / 800 (Oct 22, #304), Section 21 (Oct 22, #279) and the italic Placeholder (Oct 22, #269).
   Components and screens that use a style follow it. [style, family, weight, italic, size, line height, decision] */
const FONT_RULES = [
  ["Title", "Fredoka", 600, false, 24, 30, "fredoka-display"],
  ["Section", "Fredoka", 600, false, 21, 26, "section-title-fredoka-21"],
  ["Body", "Plus Jakarta Sans", 400, false, 16, 22, "plus-jakarta-sans-body"],
  ["Body Strong", "Plus Jakarta Sans", 600, false, 16, 22, "jakarta-weights"],
  ["Small", "Plus Jakarta Sans", 400, false, 14, 20, "plus-jakarta-sans-body"],
  ["Small Strong", "Plus Jakarta Sans", 600, false, 14, 20, "jakarta-weights"],
  ["Caption", "Plus Jakarta Sans", 500, false, 11, 14, "plus-jakarta-sans-body"],
  ["Button", "Plus Jakarta Sans", 700, false, 16, 22, "jakarta-weights"],
  ["Eyebrow", "Plus Jakarta Sans", 800, false, 11, 14, "jakarta-weights"],
  ["Placeholder", "Plus Jakarta Sans", 400, true, 16, 22, "placeholder-4b"],
];
const SIZE_VAR = { 24: "font-size/title", 16: "font-size/body", 14: "font-size/small", 11: "font-size/caption" };

async function applyFontDecisions(log) {
  const styles = await figma.getLocalTextStylesAsync();
  const vars = await figma.variables.getLocalVariablesAsync();
  const changed = [], added = [];
  for (const [name, family, weight, italic, size, lh, id] of FONT_RULES) {
    const font = await pickFont(family, weight, italic);
    if (font.family !== family) { log.push(`Font decision "${name}": ${family} isn't available in this Figma, so the style stays as it is.`); continue; }
    let st = styles.find((s) => s.name === name);
    if (!st) {
      st = figma.createTextStyle(); st.name = name; added.push(name);
      const v = vars.find((x) => x.name === SIZE_VAR[size]);
      if (v) { try { st.setBoundVariable("fontSize", v); } catch (e) { /* fine without the binding */ } }
    } else if (st.fontName && st.fontName.family === font.family && st.fontName.style === font.style && st.fontSize === size) continue;
    else changed.push(`${name} (${st.fontName ? `${st.fontName.family} ${st.fontName.style}` : "?"} → ${font.family} ${font.style})`);
    st.fontName = font; st.fontSize = size; st.lineHeight = { unit: "PIXELS", value: lh };
    const d = DECISIONS.find((x) => x.id === id);
    st.description = `${family} ${weight}${italic ? " italic" : ""}, ${size}/${lh}. ${d ? `${d.title} (${d.refs.filter((r) => r.startsWith("#")).join(", ") || d.refs[0]}, decided ${d.date.slice(5)})` : ""}`;
  }
  return { changed, added };
}

// Placeholder colour (Oct 22, #269): a Color variable so fields can link to it. Same value in every mode.
async function ensurePlaceholderColor() {
  const vars = await figma.variables.getLocalVariablesAsync();
  if (vars.find((v) => v.name === "color/placeholder")) return false;
  const col = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === "Color");
  if (!col) return false;
  const v = figma.variables.createVariable("color/placeholder", col, "COLOR");
  for (const m of col.modes) v.setValueForMode(m.modeId, hex2rgb("#807160"));
  try { v.scopes = ["TEXT_FILL"]; v.setVariableCodeSyntax("WEB", "theme.color.placeholder"); } catch (e) { /* optional */ }
  v.description = "Placeholder text, 4.7:1 on cream; with the italic Placeholder style (decided Oct 22, #269).";
  return true;
}

/* ---------- The Decisions board (Components page) ----------
   Every decision with its date as a flag ("Added · Oct 22"), grouped by area; proposals listed apart in orange
   ("Proposed · Oct 23"). Rebuilt each run in the same place. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const AREAS = ["Fonts", "Colours", "Icons", "Header", "Navigation", "Patterns", "Components", "Calendar", "Booking", "Screens", "Copy", "Brand", "Other"];

async function buildDecisionsBoard(page, label, body, now) {
  const old = page.children.find((n) => n.getPluginData("pawnote") === "decisions");
  let x = 0, y = null;
  if (old) { x = old.x; y = old.y; old.remove(); }
  const ink = { type: "SOLID", color: hex2rgb("#1B4332") }, muted = { type: "SOLID", color: hex2rgb("#5C5C5C") };
  const T = (chars, font, size, fill, w) => {
    const t = figma.createText(); t.fontName = font; t.fontSize = size; t.characters = chars; t.fills = [fill];
    if (w) { t.resize(w, t.height); t.textAutoResize = "HEIGHT"; }
    return t;
  };
  const V = (name, gap, pad) => { const f = figma.createFrame(); f.name = name; f.layoutMode = "VERTICAL"; f.primaryAxisSizingMode = "AUTO"; f.counterAxisSizingMode = "AUTO"; f.itemSpacing = gap; if (pad) f.paddingLeft = f.paddingRight = f.paddingTop = f.paddingBottom = pad; f.fills = []; return f; };
  const H = (name, gap) => { const f = V(name, gap); f.layoutMode = "HORIZONTAL"; return f; };
  const pill = (text, proposal) => {
    const p = H("Flag", 0); p.paddingLeft = p.paddingRight = 10; p.paddingTop = p.paddingBottom = 4; p.cornerRadius = 12;
    p.fills = [{ type: "SOLID", color: hex2rgb(proposal ? "#FDE2CC" : "#D8F3DC") }];
    p.appendChild(T(text, label, 13, { type: "SOLID", color: hex2rgb(proposal ? "#9A3412" : "#1B4332") }));
    return p;
  };
  const board = V("Decisions · what's decided, with dates", 28, 48);
  board.fills = [{ type: "SOLID", color: hex2rgb("#FFFFFF") }]; board.cornerRadius = 24;
  board.setPluginData("pawnote", "decisions");
  const decided = DECISIONS.filter((d) => d.status !== "proposal"), props = DECISIONS.filter((d) => d.status === "proposal");
  board.appendChild(T("Decisions · what's decided, with dates", label, 40, ink));
  board.appendChild(T(`${decided.length} decisions and ${props.length} open proposals, updated Oct 25 from the design site, DESIGN.md and the merged PRs. Green "Added · date" = the day the team decided it; "In Figma" says where this plugin applies it. Orange "Proposed" = a team call still open: nothing in it is built as decided. To add one: design/figma-plugin/src/decisions-data.js, then re-run.`, body, 16, muted, 1300));
  const row = (d) => {
    const r = H(d.id, 20); r.counterAxisAlignItems = "MIN";
    const flagCol = V("When", 6); flagCol.resize(170, 10); flagCol.counterAxisSizingMode = "FIXED"; flagCol.primaryAxisSizingMode = "AUTO"; flagCol.clipsContent = false;
    flagCol.appendChild(pill(`${d.status === "proposal" ? "Proposed" : "Added"} · ${shortDate(d.date)}`, d.status === "proposal"));
    if (d.status === "shipped") flagCol.appendChild(T("In the app", body, 12, muted));
    r.appendChild(flagCol);
    const txt = V("What", 4);
    txt.appendChild(T(d.title, label, 17, ink, 1080));
    txt.appendChild(T(d.decision, body, 15, ink, 1080));
    const meta = [d.refs.join(" · "), d.replaces ? `Replaces: ${d.replaces}` : "", d.figma ? `In Figma: ${d.figma}` : ""].filter(Boolean).join("   ");
    if (meta) txt.appendChild(T(meta, body, 13, muted, 1080));
    r.appendChild(txt);
    return r;
  };
  for (const area of AREAS) {
    const ds = decided.filter((d) => d.area === area).sort((a, b) => b.date.localeCompare(a.date));
    if (!ds.length) continue;
    const g = V(area, 16); g.appendChild(T(area, label, 26, ink));
    for (const d of ds) g.appendChild(row(d));
    board.appendChild(g);
  }
  const pg = V("Proposals", 16); pg.appendChild(T("Open proposals (team call)", label, 26, { type: "SOLID", color: hex2rgb("#9A3412") }));
  for (const d of props.sort((a, b) => b.date.localeCompare(a.date))) pg.appendChild(row(d));
  board.appendChild(pg);
  page.appendChild(board);
  if (y === null) {   // first time: above everything on the page, left-aligned
    let top = Infinity, left = Infinity;
    for (const n of page.children) if (n !== board && n.getPluginData("pawnote") !== "archive") { top = Math.min(top, n.y); left = Math.min(left, n.x); }
    x = left === Infinity ? 0 : left; y = (top === Infinity ? 0 : top) - board.height - 400;
  }
  board.x = x; board.y = y;
  board.locked = true;
  return board;
}

/* ---------- Run: apply, then flag ----------
   Flags read "Added · <date decided> · <what>" and show for FLAG_DAYS days after the plugin first applies each one. */
async function applyDecisions(componentsPage, screensPage, log, fonts) {
  const now = new Date().toISOString();
  const label = await pickFont("Inter", 700, false), body = await pickFont("Inter", 400, false);
  const done = [];
  const flagOn = (host, node, id, note, where) => {
    const d = DECISIONS.find((x) => x.id === id);
    if (!d || !recent(firstApplied(id, now), now)) return;
    drawFlag(host, node, { at: d.date + "T12:00:00Z", what: "Added", note }, label, "decision-flag", where);
  };
  // old decision flags go; current ones are redrawn below
  for (const pg of [componentsPage, screensPage]) for (const n of pg.findAll((k) => k.getPluginData("pawnote") === "decision-flag")) n.remove();

  if (fonts && (fonts.changed.length || fonts.added.length)) done.push(`Text styles follow the font decisions: ${[...fonts.changed, ...fonts.added.map((a) => `${a} (new)`)].join("; ")}.`);
  if (await ensurePlaceholderColor()) done.push("Added the color/placeholder variable (#807160, #269).");

  const icons = await buildIconSet(componentsPage, now, label, body);
  if (icons.made || icons.redrawn) done.push(`Icons · Lucide (app set): ${icons.made} new, ${icons.redrawn} redrawn.`);
  if (icons.change) {
    const { pill } = drawFlag(componentsPage, icons.section, { at: icons.change.at, what: icons.change.what, note: icons.change.note }, label, "decision-flag");
    pill.x = icons.section.x;
  } else flagOn(componentsPage, icons.section, "lucide-icons", "Lucide icons (#301)");
  const redrawn = await redrawOct19Icons(screensPage);
  if (redrawn) done.push(`Redrew ${redrawn} Oct 19 icons in "In the app" with Lucide.`);
  const inApp = screensPage.children.find((n) => n.type === "SECTION" && /^In the app/.test(n.name));
  if (inApp) {
    const parts = inApp.children.find((n) => n.name === "Parts (components)");
    if (parts) flagOn(inApp, parts, "lucide-icons", "Lucide icons, header C (#301, #294)");
    for (const f of inApp.children.filter((n) => n.type === "FRAME" && /header \(#147\)/.test(n.name))) flagOn(inApp, f, "header-c", "Header C: avatar opens the menu (#294)", "below");
  }
  // #147 on the Tickets page shows option B (the menu icon), which header C replaced on Oct 22
  const ticketsPage = figma.root.children.find((p) => /ticket/i.test(p.name));
  if (ticketsPage) {
    await ticketsPage.loadAsync();
    for (const n of ticketsPage.findAll((k) => k.getPluginData("pawnote") === "decision-flag")) n.remove();
    const t147 = ticketsPage.children.find((n) => n.getPluginData("ticket") === "147");
    if (t147 && recent(firstApplied("header-c", now), now))
      drawFlag(ticketsPage, t147, { at: "2026-10-22T12:00:00Z", what: "Option B replaced by header C (#294)", note: "" }, label, "decision-flag");
  }
  if (ticketsPage) {
    const tb = await buildTicketsBoard(ticketsPage, label, body);
    if (tb) {
      if (recent(firstApplied(`tickets-board-${DESIGN_TICKETS.checked}`, now), now)) drawFlag(ticketsPage, tb, { at: DESIGN_TICKETS.checked + "T12:00:00Z", what: "New" }, label, "decision-flag");
      done.push(`Design tickets board: ${DESIGN_TICKETS.tickets.length} tickets on "${ticketsPage.name}" (checked ${DESIGN_TICKETS.checked}).`);
    }
  }
  const board = await buildDecisionsBoard(componentsPage, label, body, now);
  flagOn(componentsPage, board, "plus-jakarta-sans-body", "Fonts: Fredoka titles, Jakarta text (#304)");
  done.push(`Decisions board: ${DECISIONS.length} entries on "${componentsPage.name}".`);
  return done;
}

/* ---------- Design tickets: today's slot (Tickets page) ----------
   Every open track:design ticket and what happens next, from concept-prototypes/design-tickets.js (build.py puts it
   in DESIGN_TICKETS): the same list as the Project page and the daily update. Rebuilt each run in the same place. */
async function buildTicketsBoard(page, label, body) {
  if (!DESIGN_TICKETS.tickets.length) return null;
  await page.loadAsync();
  const old = page.children.find((n) => n.getPluginData("pawnote") === "tickets-board");
  let x = 0, y = null;
  if (old) { x = old.x; y = old.y; old.remove(); }
  const C = (hex) => ({ type: "SOLID", color: hex2rgb(hex) });
  const T = (chars, font, size, fill, w) => { const t = figma.createText(); t.fontName = font; t.fontSize = size; t.characters = chars; t.fills = [fill]; if (w) { t.resize(w, t.height); t.textAutoResize = "HEIGHT"; } return t; };
  const V = (name, gap, pad) => { const f = figma.createFrame(); f.name = name; f.layoutMode = "VERTICAL"; f.primaryAxisSizingMode = "AUTO"; f.counterAxisSizingMode = "AUTO"; f.itemSpacing = gap; if (pad) f.paddingLeft = f.paddingRight = f.paddingTop = f.paddingBottom = pad; f.fills = []; return f; };
  const H = (name, gap) => { const f = V(name, gap); f.layoutMode = "HORIZONTAL"; return f; };
  const ink = C("#1B4332"), muted = C("#5C5C5C");
  const TONE = { done: ["#D8F3DC", "#1B4332"], today: ["#D8F3DC", "#1B4332"], call: ["#FDE2CC", "#9A3412"], close: ["#E3EADF", "#3F4A43"], after: ["#EFEFEC", "#5C5C5C"] };
  const day = DESIGN_TICKETS.checked ? new Date(DESIGN_TICKETS.checked + "T12:00:00Z") : null;
  const when = day ? `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][day.getUTCMonth()]} ${day.getUTCDate()}` : "";
  const GROUPS = [["done", `Finished, up to ${when}`], ["today", "Being worked on"], ["call", "Waiting on a team call"], ["close", "Done, but still open on GitHub: close these"], ["after", "After the submission"]];
  const board = V(`Design tickets · ${when}`, 28, 48);
  board.fills = [C("#FFFFFF")]; board.cornerRadius = 24; board.setPluginData("pawnote", "tickets-board");
  board.appendChild(T(`Design tickets · ${when}`, label, 40, ink));
  board.appendChild(T(`Every open track:design ticket, checked against GitHub and the code on main on ${when}. The same list is on the design site's Project page and in the ${when} update. Source: design/concept-prototypes/design-tickets.js.`, body, 16, muted, 1300));
  for (const [key, name] of GROUPS) {
    const list = DESIGN_TICKETS.tickets.filter((t) => t.bucket === key);
    if (!list.length) continue;
    const g = V(name, 14); g.appendChild(T(name, label, 26, ink));
    for (const t of list) {
      const r = H(`#${t.n}`, 20); r.counterAxisAlignItems = "MIN";
      const left = V("Status", 6); left.resize(190, 10); left.counterAxisSizingMode = "FIXED"; left.primaryAxisSizingMode = "AUTO"; left.clipsContent = false; left.counterAxisAlignItems = "MIN";
      const pill = H("Status", 0); pill.paddingLeft = pill.paddingRight = 10; pill.paddingTop = pill.paddingBottom = 4; pill.cornerRadius = 12; pill.fills = [C(TONE[key][0])];
      pill.appendChild(T(t.status[0], label, 13, C(TONE[key][1]))); left.appendChild(pill);
      const num = T(`#${t.n}`, label, 15, ink);
      const gh = t.links.find(([h]) => /github\.com/.test(h));
      if (gh) { try { num.setRangeHyperlink(0, num.characters.length, { type: "URL", value: gh[0] }); num.textDecoration = "UNDERLINE"; } catch (e) { /* plain text then */ } }
      left.appendChild(num);
      r.appendChild(left);
      const txt = V("What", 4);
      txt.appendChild(T(t.title[0], label, 17, ink, 1060));
      txt.appendChild(T(t.done[0], body, 15, ink, 1060));
      txt.appendChild(T(`Next: ${t.next[0]}`, body, 15, ink, 1060));
      txt.appendChild(T(`Who: ${t.owner[0]}`, body, 13, muted, 1060));
      r.appendChild(txt);
      g.appendChild(r);
    }
    board.appendChild(g);
  }
  page.appendChild(board);
  if (y === null) {   // first time: above the tickets, left-aligned
    let top = Infinity, leftX = Infinity;
    for (const n of page.children) if (n !== board) { top = Math.min(top, n.y); leftX = Math.min(leftX, n.x); }
    x = leftX === Infinity ? 0 : leftX; y = (top === Infinity ? 0 : top) - board.height - 400;
  }
  board.x = x; board.y = y; board.locked = true;
  return board;
}
