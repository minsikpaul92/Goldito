/* Tickets: one Section per design ticket on the "Tickets" page (created if missing), built from data/tickets.json, which
   capture/tickets.spec.ts takes from the ticket's workbench page (decided frames, decisions, spec).
   Push to Figma rebuilds only the parts this plugin made (tagged "ticket-part"); notes you add by hand stay, and the
   ticket's status, version and review rounds live in the Section's plugin data, so re-pushing never loses them.
   Submit for review marks the Section "In review" and returns a comment for the GitHub issue with links to the frames. */

const FILE_KEY_FALLBACK = "stZjrJJU6KOhLauxPjaV8l";   // Pawddy-Design
const TICKET_STATUS = {
  draft: ["Draft", { r: 0.91, g: 0.9, b: 0.88 }, { r: 0.36, g: 0.36, b: 0.36 }],
  review: ["In review", { r: 1, g: 0.98, b: 0.92 }, { r: 0.71, g: 0.28, b: 0.03 }],
  changes: ["Changes requested", { r: 1, g: 0.95, b: 0.95 }, { r: 0.71, g: 0.14, b: 0.09 }],
  approved: ["Approved", { r: 0.93, g: 0.99, b: 0.95 }, { r: 0.02, g: 0.46, b: 0.28 }],
};
const T_INK = { r: 0.11, g: 0.26, b: 0.2 }, T_MUTED = { r: 0.36, g: 0.36, b: 0.36 }, T_LINE = { r: 0.9, g: 0.9, b: 0.88 };

async function ticketsPage() {
  const pages = figma.root.children;
  let page = pages.find((p) => /ticket/i.test(p.name)) || pages.find((p) => /^5\s*[.)]/.test(p.name));
  if (!page) { page = figma.createPage(); page.name = "Tickets"; }
  await page.loadAsync();   // pages load on demand; reading children of an unloaded page throws
  return page;
}
function ticketSection(page, id) {
  return page.children.find((n) => n.getPluginData("pawnote") === "ticket" && n.getPluginData("ticket") === String(id));
}
function ticketMeta(sec) {
  try { return Object.assign({ status: "draft", version: 0, rounds: [] }, JSON.parse(sec.getPluginData("meta") || "{}")); }
  catch (e) { return { status: "draft", version: 0, rounds: [] }; }
}
function nodeLink(id) {
  return `https://www.figma.com/design/${figma.fileKey || FILE_KEY_FALLBACK}/?node-id=${encodeURIComponent(String(id).replace(":", "-"))}`;
}
const whenStr = (iso) => { try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return iso; } };

async function tText(chars, size, bold, color, parent, url) {
  const t = figma.createText();
  t.fontName = { family: "Inter", style: bold ? "Bold" : "Regular" };
  t.characters = chars; t.fontSize = size; t.fills = [solid(color)];
  if (url) { try { t.setRangeHyperlink(0, chars.length, { type: "URL", value: url }); t.textDecoration = "UNDERLINE"; } catch (e) {} }
  parent.appendChild(t);
  return t;
}
function tCard(name, parent, fill = { r: 1, g: 1, b: 1 }) {
  const f = figma.createFrame();
  f.name = name; f.layoutMode = "VERTICAL"; f.itemSpacing = 10;
  f.paddingTop = f.paddingBottom = 20; f.paddingLeft = f.paddingRight = 24;
  f.primaryAxisSizingMode = "AUTO"; f.counterAxisSizingMode = "AUTO";
  f.cornerRadius = 16; f.fills = [solid(fill)]; f.strokes = [solid(T_LINE)]; f.strokeWeight = 1;
  f.setPluginData("pawnote", "ticket-part");
  parent.appendChild(f);
  return f;
}
async function statusPill(meta, parent) {
  const [label, bg, ink] = TICKET_STATUS[meta.status] || TICKET_STATUS.draft;
  const p = figma.createFrame();
  p.name = "Status"; p.layoutMode = "HORIZONTAL"; p.paddingLeft = p.paddingRight = 12; p.paddingTop = p.paddingBottom = 6;
  p.primaryAxisSizingMode = "AUTO"; p.counterAxisSizingMode = "AUTO"; p.cornerRadius = 999; p.fills = [solid(bg)];
  p.setPluginData("pawnote", "ticket-status");
  parent.appendChild(p);
  await tText(label, 14, true, ink, p);
  return p;
}

async function pushTicket(t, log, opts = {}) {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  const page = opts.page || await ticketsPage();   // opts.page: the Dev reference page (src/devref.js)
  await figma.setCurrentPageAsync(page);
  let sec = ticketSection(page, t.id);
  if (!sec) {
    sec = figma.createSection();
    page.appendChild(sec);
    let top = 0;
    for (const n of page.children) if (n !== sec) top = Math.max(top, n.y + n.height + 160);
    sec.x = 0; sec.y = top;
    sec.setPluginData("pawnote", "ticket"); sec.setPluginData("ticket", String(t.id));
  }
  const meta = ticketMeta(sec);
  // Everything the plugin drew goes, except the ticket's components: the designer may have edited those masters.
  const prevMeta = new Map(), firstPush = !sec.children.some((c) => c.getPluginData("pawnote") === "ticket-frame" && c.getPluginData("fp"));
  for (const c of [...sec.children]) {
    const tag = c.getPluginData("pawnote");
    if (tag === "ticket-frame" && c.getPluginData("cap")) prevMeta.set(c.getPluginData("cap"), readMeta(c));
    if (tag === "ticket-part" || tag === "ticket-frame" || (tag === "ticket-comps" && opts.rebuild)) c.remove();
  }
  const now = new Date().toISOString(), flagFont = { family: "Inter", style: "Bold" }; let flagged = 0;
  meta.version += 1; meta.pushed = new Date().toISOString(); meta.captured = t.captured;
  if (meta.status === "approved" || meta.status === "review") meta.status = "draft";   // a new push needs a new review
  sec.name = `#${t.id} · ${t.title}`;

  // header: title, links, status, version
  const head = tCard("Ticket", sec);
  head.x = 40; head.y = 40;
  await tText(`${typeof t.id === "number" ? `#${t.id} · ` : ""}${t.title}`, 32, true, T_INK, head);
  const links = figma.createFrame();
  links.name = "Links"; links.layoutMode = "HORIZONTAL"; links.itemSpacing = 16; links.fills = [];
  links.primaryAxisSizingMode = "AUTO"; links.counterAxisSizingMode = "AUTO";
  head.appendChild(links);
  if (t.issue) await tText(`Issue #${t.id} ↗`, 15, true, { r: 0.18, g: 0.42, b: 0.31 }, links, t.issue);
  if (t.workbench) await tText("Workbench ↗", 15, true, { r: 0.18, g: 0.42, b: 0.31 }, links, t.workbench);
  const row = figma.createFrame();
  row.name = "Status row"; row.layoutMode = "HORIZONTAL"; row.itemSpacing = 12; row.counterAxisAlignItems = "CENTER"; row.fills = [];
  row.primaryAxisSizingMode = "AUTO"; row.counterAxisSizingMode = "AUTO";
  head.appendChild(row);
  if (opts.dev) await devPill(opts.dev, row); else await statusPill(meta, row);
  await tText(`v${meta.version} · pushed ${whenStr(meta.pushed)} · design ${t.design || "—"} · code ${t.code || "—"}`, 14, false, T_MUTED, row);
  if (meta.rounds.length) {
    const r = meta.rounds[meta.rounds.length - 1];
    await tText(`Last review: round ${meta.rounds.length}, ${whenStr(r.at)} (v${r.version})${r.note ? ` · “${r.note}”` : ""}`, 13, false, T_MUTED, head);
  }

  // decisions
  const dec = tCard("Decisions", sec);
  dec.x = head.x + head.width + 32; dec.y = 40;
  await tText("Decisions", 18, true, T_INK, dec);
  for (const d of t.decisions || []) await tText(`${d.q}: ${d.a}`, 14, false, { r: 0.1, g: 0.1, b: 0.1 }, dec);

  // the ticket's own components (kept between pushes), then the frames as instances of them
  const comps = await ticketComponents(t, sec, log, opts);
  const savedComps = XCOMP; XCOMP = comps.map; XSTATS.instances = 0; XSTATS.detached = 0; XSTATS.restyled = 0; XSTATS.plain = [];
  let x = 40, y = Math.max(head.y + head.height, dec.y + dec.height) + 72, rowH = 0;   // room for a "What's new" tag
  const frames = [];
  try {
    for (const s of t.screens) {
      const holder = figma.createFrame();
      holder.name = s.title; holder.fills = []; holder.clipsContent = false;
      holder.setPluginData("pawnote", "ticket-frame"); holder.setPluginData("cap", s.id);
      sec.appendChild(holder);
      holder.x = x; holder.y = y;
      const mapped0 = FONT_MAPPED, plain0 = (XSTATS.plain || []).length;
      const root = await buildNode({ ...s.tree, x: 0, y: 0, name: s.title }, holder, t.images || {});
      repairWraps(root);
      holder.resize(Math.max(1, root.width), Math.max(1, root.height));
      const fp = fingerprint(s.tree), cur = facets(s.tree), flag = flagFor(prevMeta.get(s.id), fp, cur, firstPush, now);
      saveMeta(holder, fp, cur, flag);
      if (flag) { drawFlag(sec, holder, flag, flagFont, "ticket-part"); flagged++; }
      else if (FONT_MAPPED > mapped0 && recent(firstApplied("plus-jakarta-sans-body", now), now)) {
        // the capture's system font became Plus Jakarta Sans (font decision, Oct 22, #304)
        drawFlag(sec, holder, { at: "2026-10-22T12:00:00Z", what: "Added", note: "Plus Jakarta Sans (#304)" }, flagFont, "ticket-part"); flagged++;
      }
      const cap = await tText(s.title, 14, true, T_MUTED, sec);
      cap.setPluginData("pawnote", "ticket-part"); cap.x = x; cap.y = y + root.height + 10;
      const plainHere = (XSTATS.plain || []).slice(plain0);
      if (plainHere.length) drawCheck(sec, holder, notLinkedText(plainHere), flagFont, "ticket-part", 40);
      frames.push({ id: holder.id, title: s.title });
      x += root.width + 40; rowH = Math.max(rowH, root.height + 34);
    }
  } finally { XCOMP = savedComps; }
  const linked = XSTATS.instances, unlinked = XSTATS.detached;
  y += rowH + 48;
  if (comps.card && comps.card.parent === sec) { comps.card.x = 40; comps.card.y = y; y += comps.card.height + 48; }
  await annotateTicket(t, sec, comps);

  // spec, as a table; notes (e.g. drafted GitHub comments) to its right
  const spec = await specCard(t, sec, comps);
  spec.x = 40; spec.y = y;
  let nx = spec.x + spec.width + 32;
  for (const [title, text] of t.notes || []) {
    const n = tCard(title, sec);
    n.x = nx; n.y = spec.y;
    await tText(title, 18, true, T_INK, n);
    const body = await tText(text, 13, false, { r: 0.1, g: 0.1, b: 0.1 }, n);
    body.resize(520, body.height); body.textAutoResize = "HEIGHT";
    nx += n.width + 32;
  }

  let w = 0, h = 0;
  for (const n of sec.children) { w = Math.max(w, n.x + n.width); h = Math.max(h, n.y + n.height); }
  sec.resizeWithoutConstraints(w + 40, h + 40);
  sec.setPluginData("meta", JSON.stringify(meta));
  sec.setPluginData("frames", JSON.stringify(frames));
  return { id: t.id, section: sec.id, ...meta, frames, components: comps.count, linked, unlinked, flagged };
}

/* ---------- the ticket's components ----------
   Elements a workbench marks data-comp (and data-variant) become components that live in this ticket's section,
   not on the Components page: the design may never ship. One component per variant, from its first occurrence;
   the frames use instances and override only the texts and photos that differ from it. A re-push keeps the masters
   (with the designer's edits) and only adds variants that are new; "Rebuild components" starts them over.
   A library ticket (the design kit, `library: true`) is the design system itself, so its components go to a
   "Kit components" section on the Components page instead; its boards on the Tickets page use instances of them. */
async function ticketComponents(t, sec, log, opts = {}) {
  const home = (t.library && (await libraryHome(t))) || sec;
  if (home !== sec) {
    // masters from before the kit became the library: the boards are rebuilt from the library ones
    const old = sec.children.find((c) => c.getPluginData("pawnote") === "ticket-comps");
    if (old) old.remove();
  }
  const groups = new Map();
  const visit = (n) => {
    if (n.k === "inst") { if (!groups.has(n.comp)) groups.set(n.comp, new Map()); const g = groups.get(n.comp); if (!g.has(n.variant)) g.set(n.variant, n.tree); return; }
    (n.children || []).forEach(visit);
  };
  for (const s of t.screens) visit(s.tree);
  const map = new Map(), sets = new Map();
  let card = home.children.find((c) => c.getPluginData("pawnote") === "ticket-comps") || null;
  if (card && opts.rebuild && home !== sec) { card.remove(); card = null; }
  if (!groups.size && !card) return { map, sets, card: null, count: 0 };
  if (!card) {
    card = tCard("Components", home);
    card.setPluginData("pawnote", "ticket-comps");
    await tText("Components", 18, true, T_INK, card);
    const sub = await tText(home !== sec ? "The design kit's components: the design system the app is built from (design site kit.html). Edit a master and the kit boards on the Tickets page follow; re-pushing keeps your edits." : "This ticket's own components. Edit a master and every frame above follows; re-pushing keeps your edits. They stay in this ticket until the design ships; then move them to the Components page.", 13, false, T_MUTED, card);
    sub.resize(900, sub.height); sub.textAutoResize = "HEIGHT";
    const masters = figma.createFrame();
    masters.name = "Masters"; masters.fills = []; masters.layoutMode = "HORIZONTAL"; masters.layoutWrap = "WRAP";
    masters.itemSpacing = 32; masters.counterAxisSpacing = 32; masters.clipsContent = false;
    card.appendChild(masters); masters.resize(1800, 100);
    masters.primaryAxisSizingMode = "FIXED"; masters.counterAxisSizingMode = "AUTO";   // after resize(), which resets both to fixed
  }
  const masters = card.children.find((c) => c.name === "Masters");
  for (const c of card.findAll((n) => n.type === "COMPONENT" && !!n.getPluginData("ticketComp"))) map.set(c.getPluginData("ticketComp"), c);
  for (const c of masters.children) if (c.getPluginData("ticketSet")) sets.set(c.getPluginData("ticketSet"), c);
  // repair: sets from earlier pushes that kept their first width (variants spilling past the edge)
  for (const n of sets.values()) fitVariantSet(n);
  let count = 0;
  for (const [comp, variants] of groups) {
    const fresh = [];
    for (const [variant, tree] of variants) {
      const key = `${comp}|${variant}`;
      if (map.has(key)) continue;
      try {
        const f = await buildNode({ ...tree, x: 0, y: 0 }, masters, t.images || {});
        repairWraps(f);
        const c = figma.createComponentFromNode(f);
        c.name = variant || comp;
        c.setPluginData("ticketComp", key);
        c.setPluginData("srcTexts", JSON.stringify(textLeaves(tree).map((w) => w.runs.map((r) => r.text).join("") || " ")));
        if (c.layoutMode === "NONE") constrainTree(c);
        fresh.push(c); map.set(key, c);
      } catch (e) { log.push(`Component ${comp} ${variant}: ${e.message || e}`); }
    }
    let node = sets.get(comp);
    const named = [...variants.keys()].some(Boolean);
    if (fresh.length) {
      if (node && node.type === "COMPONENT_SET") { for (const c of fresh) node.appendChild(c); fitVariantSet(node); }
      else if (named) {
        const all = node ? [node, ...fresh] : fresh;
        for (const c of all) if (!c.name.includes("=")) c.name = `Variant=${c.name === comp ? "Default" : c.name}`;
        node = figma.combineAsVariants(all, masters);
        node.name = comp; node.setPluginData("ticketSet", comp);
        node.layoutMode = "HORIZONTAL"; node.layoutWrap = "WRAP"; node.itemSpacing = 24; node.counterAxisSpacing = 24;
        node.paddingTop = node.paddingBottom = node.paddingLeft = node.paddingRight = 24;
        node.primaryAxisSizingMode = "AUTO"; node.counterAxisSizingMode = "AUTO";
        fitVariantSet(node);
        node.fills = [solid({ r: 1, g: 1, b: 1, a: 1 })];
      } else { node = fresh[0]; node.name = comp; node.setPluginData("ticketSet", comp); }
      sets.set(comp, node);
    }
    if (node) describe(node, t, comp);
    count += variants.size;
  }
  if (home !== sec) {
    // the section doesn't grow on its own
    card.x = 40; card.y = 40;
    home.resizeWithoutConstraints(card.width + 80, card.height + 80);
  }
  return { map, sets, card, count };
}

/* The Components page section for a library ticket's components, next to the Expressive components. */
async function libraryHome(t) {
  const page = figma.root.children.find((p) => /component/i.test(p.name)) || figma.root.children.find((p) => /^3\s*[.)]/.test(p.name));
  if (!page) return null;
  await page.loadAsync();
  let sec = page.children.find((n) => n.type === "SECTION" && n.getPluginData("pawnote") === "kit-library");
  if (!sec) {
    sec = figma.createSection();
    page.appendChild(sec);
    const expressive = page.children.find((n) => n.type === "SECTION" && n.name === "Expressive components");
    if (expressive) { sec.x = expressive.x + expressive.width + 400; sec.y = expressive.y; }
    else { let top = 0; for (const n of page.children) if (n !== sec) top = Math.max(top, n.y + n.height + 400); sec.x = 0; sec.y = top; }
    sec.setPluginData("pawnote", "kit-library");
  }
  sec.name = `Kit components · ${t.title} (design site kit.html)`;
  return sec;
}

// The spec rows that name this component, as its description (Dev Mode and the inspect panel show it on every instance).
function specFor(t, comp) {
  return (t.spec || []).map((r, i) => [r, (t.specLinks || [])[i]]).filter(([, c]) => c === comp).map(([r]) => r);
}
function specLine(r, head) {
  const [el, ...rest] = r;
  const parts = rest.map((v, i) => [head[i + 1], v]).filter(([, v]) => v && v !== "—");
  return `**${el}** · ${parts.map(([k, v]) => `${k}: ${v}`).join(" · ")}`;
}
const DEFAULT_HEAD = ["Element", "Size", "Colour", "Label · testID", "Notes"];
function describe(node, t, comp) {
  const head = t.specHead || DEFAULT_HEAD, rows = specFor(t, comp);
  const md = [...rows.map((r) => specLine(r, head)), "", `From ticket #${t.id} (${t.title}). Options and decisions: ${t.workbench || t.issue}`].join("\n").trim();
  try { node.descriptionMarkdown = md; } catch (e) { try { node.description = md.replace(/\*\*/g, ""); } catch (e2) {} }
  try { if (t.workbench) node.documentationLinks = [{ uri: t.workbench }]; } catch (e) {}
}

// Dev Mode annotations: the first instance of each described component, in the frames, carries its spec rows and
// pins its live measurements (size, padding, gap, fills, corners).
async function annotateTicket(t, sec, comps) {
  if (!comps.sets.size) return;
  let cat = null;
  try {
    const cats = await figma.annotations.getAnnotationCategoriesAsync();
    cat = cats.find((c) => c.label === "Spec") || await figma.annotations.addAnnotationCategoryAsync({ label: "Spec", color: "green" });
  } catch (e) { cat = null; }
  const head = t.specHead || DEFAULT_HEAD;
  const frames = sec.children.filter((c) => c.getPluginData("pawnote") === "ticket-frame");
  for (const [comp] of comps.sets) {
    const rows = specFor(t, comp); if (!rows.length) continue;
    let inst = null;
    for (const f of frames) { inst = f.findOne((n) => n.type === "INSTANCE" && n.name === comp); if (inst) break; }
    if (!inst) continue;
    const props = ["width", "height", "fills", "cornerRadius"].concat(inst.layoutMode && inst.layoutMode !== "NONE" ? ["padding", "itemSpacing"] : []);
    const a = { labelMarkdown: rows.map((r) => specLine(r, head)).join("\n"), properties: props.map((type) => ({ type })) };
    if (cat) a.categoryId = cat.id;
    try { inst.annotations = [a]; } catch (e) { try { inst.annotations = [{ labelMarkdown: a.labelMarkdown }]; } catch (e2) {} }
  }
}

/* ---------- the spec table ----------
   A real table: a header row, then one row per spec line, fixed columns. `code` from the workbench is set in a
   monospace face; hex colours and colour tokens get a swatch (bound to the file's Color variable when one has that
   name); an element with its own component links to it. */
async function specCard(t, sec, comps) {
  const card = tCard("Spec", sec);
  await tText("Spec", 18, true, T_INK, card);
  const note = await tText("What the layers can't say: labels, test IDs, behaviour and the decision behind each value. Select a component instance in Dev Mode for its live measurements; these rows are on its description and annotation too.", 13, false, T_MUTED, card);
  note.resize(1000, note.height); note.textAutoResize = "HEIGHT";
  const head = t.specHead || DEFAULT_HEAD;
  const W = head.length === 5 ? [190, 250, 250, 270, 460] : head.map(() => Math.floor(1420 / head.length));
  const table = figma.createFrame();
  table.name = "Spec table"; table.fills = []; table.layoutMode = "VERTICAL"; table.itemSpacing = 0;
  table.primaryAxisSizingMode = "AUTO"; table.counterAxisSizingMode = "AUTO";
  card.appendChild(table);
  const mono = await pickFont("Roboto Mono", 500, false), bold = await pickFont("Inter", 700, false), reg = await pickFont("Inter", 400, false);
  let colorVars = [];
  try { colorVars = await figma.variables.getLocalVariablesAsync("COLOR"); } catch (e) {}
  const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  const varFor = (tok) => colorVars.find((v) => v.name.split("/").pop().toLowerCase() === kebab(tok));
  const isColour = (i) => /colou?r/i.test(head[i] || "");
  const rowFrame = (header) => {
    const r = figma.createFrame();
    r.name = header ? "Header" : "Row"; r.fills = []; r.layoutMode = "HORIZONTAL"; r.itemSpacing = 24;
    r.paddingTop = r.paddingBottom = header ? 8 : 12; r.primaryAxisSizingMode = "AUTO"; r.counterAxisSizingMode = "AUTO";
    r.strokes = [solid({ ...T_LINE, a: 1 })]; r.strokeTopWeight = 0; r.strokeLeftWeight = 0; r.strokeRightWeight = 0; r.strokeBottomWeight = 1; r.strokeAlign = "INSIDE";
    table.appendChild(r);
    return r;
  };
  const cellText = async (parent, text, w, opt = {}) => {
    const tx = figma.createText();
    tx.fontName = opt.bold ? bold : reg; tx.fontSize = opt.size || 13;
    const parts = String(text).split(/`([^`]+)`/), chars = parts.join("") || " ";
    tx.characters = chars;
    tx.fills = [solid(opt.color || { r: 0.1, g: 0.1, b: 0.1, a: 1 })];
    let i = 0;
    parts.forEach((p, k) => { if (k % 2 && p.length) { tx.setRangeFontName(i, i + p.length, mono); tx.setRangeFontSize(i, i + p.length, (opt.size || 13) - 1); tx.setRangeFills(i, i + p.length, [solid({ ...T_INK, a: 1 })]); } i += p.length; });
    if (opt.upper) { tx.textCase = "UPPER"; tx.letterSpacing = { unit: "PERCENT", value: 6 }; }
    if (opt.link) { try { tx.setRangeHyperlink(0, chars.length, { type: "NODE", value: opt.link }); tx.textDecoration = "UNDERLINE"; } catch (e) {} }
    parent.appendChild(tx);
    tx.resize(w, tx.height); tx.textAutoResize = "HEIGHT";   // fixed width, wraps, grows down
    return tx;
  };
  const hdr = rowFrame(true);
  for (const [i, h] of head.entries()) await cellText(hdr, h, W[i], { bold: true, size: 11, upper: true, color: { ...T_MUTED, a: 1 } });
  for (const [ri, r] of (t.spec || []).entries()) {
    const rf = rowFrame(false);
    for (const [i, v] of r.entries()) {
      if (i === 0) {
        const comp = (t.specLinks || [])[ri], target = comp && comps.sets.get(comp);
        await cellText(rf, v, W[i], { bold: true, link: target ? target.id : null });
        continue;
      }
      if (!isColour(i)) { await cellText(rf, v, W[i]); continue; }
      // colour cell: swatches for hex values and token names, then the text
      const cell = figma.createFrame();
      cell.name = "Colour"; cell.fills = []; cell.layoutMode = "HORIZONTAL"; cell.itemSpacing = 6; cell.counterAxisAlignItems = "MIN"; cell.clipsContent = false;
      rf.appendChild(cell); cell.resize(W[i], 10); cell.primaryAxisSizingMode = "FIXED"; cell.counterAxisSizingMode = "AUTO";
      const swatches = [];
      for (const m of String(v).matchAll(/#([0-9a-f]{6})\b|`([A-Za-z][\w-]*)`/gi)) {
        if (m[1]) swatches.push({ hex: m[1] });
        else { const vv = varFor(m[2]); if (vv) swatches.push({ variable: vv }); }
      }
      const shown = swatches.slice(0, 3);
      for (const sw of shown) {
        const e = figma.createEllipse(); e.name = sw.variable ? sw.variable.name : `#${sw.hex}`; e.resize(14, 14);
        let paint = solid(sw.hex ? { r: parseInt(sw.hex.slice(0, 2), 16) / 255, g: parseInt(sw.hex.slice(2, 4), 16) / 255, b: parseInt(sw.hex.slice(4, 6), 16) / 255, a: 1 } : { r: 0.5, g: 0.5, b: 0.5, a: 1 });
        if (sw.variable) { try { paint = figma.variables.setBoundVariableForPaint(paint, "color", sw.variable); } catch (er) {} }
        e.fills = [paint]; e.strokes = [solid({ r: 0, g: 0, b: 0, a: 0.15 })]; e.strokeWeight = 1;
        cell.appendChild(e);
      }
      await cellText(cell, v, Math.max(40, W[i] - shown.length * 20));
    }
  }
  return card;
}

async function setTicketStatus(id, status, note) {
  const page = await ticketsPage();
  const sec = ticketSection(page, id);
  if (!sec) throw new Error(`Push #${id} to Figma first.`);
  const meta = ticketMeta(sec);
  meta.status = status;
  if (status === "review") meta.rounds.push({ at: new Date().toISOString(), version: meta.version, note: note || "" });
  sec.setPluginData("meta", JSON.stringify(meta));
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  const old = sec.findOne((n) => n.getPluginData("pawnote") === "ticket-status");
  if (old) { const parent = old.parent, i = parent.children.indexOf(old); old.remove(); const p = await statusPill(meta, parent); parent.insertChild(i, p); }
  return { id, section: sec.id, ...meta, frames: JSON.parse(sec.getPluginData("frames") || "[]") };
}

function reviewComment(t, info, note, mention) {
  const frames = info.frames.map((f) => `[${f.title}](${nodeLink(f.id)})`).join(" · ");
  const lines = [
    `### Design ready for review: #${t.id} ${t.title}`,
    `Round ${info.rounds.length} · v${info.version} · pushed ${whenStr(info.pushed)}`,
    "",
    `**Figma:** [the ticket section](${nodeLink(info.section)})${frames ? ` · ${frames}` : ""}`,
    t.workbench ? `**Workbench:** ${t.workbench} (options, decisions and the full spec)` : "",
    "",
    "**Decisions**",
    ...(t.decisions || []).map((d) => `- ${d.q}: ${d.a}`),
    "",
    "**Spec**",
    `| ${(t.specHead || ["Element", "Size", "Colour", "Label · testID", "Notes"]).join(" | ")} |`,
    `| ${(t.specHead || [1, 2, 3, 4, 5]).map(() => "---").join(" | ")} |`,
    ...(t.spec || []).map((r) => `| ${r.map((c) => String(c).replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`),
  ];
  for (const [title, text] of t.notes || []) lines.push("", `**${title}**`, ...String(text).split("\n").map((l) => `> ${l}`));
  if (note) lines.push("", `**Note from design:** ${note}`);
  if (mention) lines.push("", t.code === "Minsik" ? "@minsikpaul92 ready for code when you are." : "@minsikpaul92 for a look when you have a minute.");
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

async function ticketStatuses(ids) {
  const page = figma.root.children.find((p) => /ticket/i.test(p.name)) || null;
  if (page) await page.loadAsync();
  return ids.map((id) => {
    const sec = page && ticketSection(page, id);
    return sec ? { id, section: sec.id, ...ticketMeta(sec), frames: JSON.parse(sec.getPluginData("frames") || "[]") } : { id, status: "none" };
  });
}
