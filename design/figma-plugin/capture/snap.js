/* Serializes the visible phone screen into a tree the Figma plugin rebuilds as layers.
   Injected by capture.spec.ts; returns { tree, images }.
   Node kinds: frame (box with fill/stroke/radius/shadow/clip), text (styled runs),
   image (img or CSS background url), svg (inline icon markup). Coordinates are relative to the parent node.
   With window.__pawnoteAutoLayout (the ticket capture), flex and equal-column grid boxes also carry `al` (direction,
   gap, padding, alignment, wrap), each box says whether it hugs its content (hugW / hugH), and every child carries
   `flow` (absolute? grows?), so the plugin rebuilds them as auto-layout instead of fixed x / y. */
window.__pawnoteSnap = async function snap(root) {
  const R = root.getBoundingClientRect();
  const images = {}; // key -> dataURL
  let imgSeq = 0;
  const imgKey = new Map();

  const num = (v) => parseFloat(v) || 0;
  const parseColor = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    const a = p.length > 3 ? p[3] : 1;
    if (a === 0) return null;
    return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a };
  };
  const firstFamily = (ff) => {
    for (const f of ff.split(",").map((x) => x.trim().replace(/^["']|["']$/g, ""))) {
      if (!/^(-apple-system|BlinkMacSystemFont|system-ui|ui-rounded|ui-monospace|sans-serif|serif|monospace)$/i.test(f)) return f;
    }
    return "Inter";
  };
  const visible = (el, cs) => {
    if (cs.display === "none" || cs.visibility === "hidden" || num(cs.opacity) === 0) return false;
    // Screen-reader-only text (clip / 1px boxes) never shows on screen.
    if (/rect\(0(px)?,? ?0(px)?/.test(cs.clip) || (cs.position === "absolute" && el.getBoundingClientRect().width <= 1 && cs.overflow === "hidden")) return false;
    return true;
  };
  // Things Figma layers can't express (gradients, pixel art drawn with many shadows, canvas, filters)
  // are photographed by the capture script and placed as an image.
  let rasterSeq = 0;
  const needsRaster = (el, cs) => el.tagName === "CANVAS" || /gradient\(/.test(cs.backgroundImage) ||
    (cs.boxShadow && cs.boxShadow !== "none" && cs.boxShadow.split("), ").length > 3) || (cs.filter && cs.filter !== "none") ||
    cs.imageRendering === "pixelated";
  const register = (src) => {
    if (!src) return null;
    if (imgKey.has(src)) return imgKey.get(src);
    const k = "img" + imgSeq++;
    imgKey.set(src, k);
    images[k] = src;
    return k;
  };
  const shadowOf = (s) => {
    if (!s || s === "none") return [];
    // split top-level commas
    const parts = []; let depth = 0, cur = "";
    for (const ch of s) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && !depth) { parts.push(cur); cur = ""; } else cur += ch; }
    parts.push(cur);
    return parts.map((p) => {
      const color = parseColor(p);
      const nums = p.replace(/rgba?\([^)]*\)/, "").trim().split(/\s+/).filter((x) => /px|^0$/.test(x)).map(num);
      if (!color || nums.length < 2) return null;
      return { inset: /inset/.test(p), x: nums[0], y: nums[1], blur: nums[2] || 0, spread: nums[3] || 0, color };
    }).filter(Boolean);
  };
  const resolveVars = (str, cs) => str.replace(/var\((--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_, name, fb) => cs.getPropertyValue(name).trim() || (fb || "none").trim());

  // Rules from <style> blocks inside SVG sprites (the illustrations' ink outline .pn-o) — Figma's importer ignores
  // class styles, so they are written onto each matching shape as attributes.
  const SVG_RULES = [...document.querySelectorAll("svg style")].flatMap((s) => { try { return [...s.sheet.cssRules].filter((r) => r.selectorText); } catch (e) { return []; } });
  const inlineSvgRules = (inner) => {
    if (!SVG_RULES.length || !/class=/.test(inner)) return inner;
    const box = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    box.innerHTML = inner;
    for (const rule of SVG_RULES) {
      let hits = []; try { hits = box.querySelectorAll(rule.selectorText); } catch (e) {}
      for (const n of hits) for (const prop of rule.style) if (!n.hasAttribute(prop)) n.setAttribute(prop, rule.style.getPropertyValue(prop).trim());
    }
    return box.innerHTML;
  };
  const svgMarkup = (el, cs, w, h) => {
    const color = cs.color;
    let inner = "", viewBox = el.getAttribute("viewBox"), symAttrs = null;
    const use = el.querySelector("use");
    if (use) {
      const id = (use.getAttribute("href") || use.getAttribute("xlink:href") || "").slice(1);
      const sym = id && document.getElementById(id);
      if (sym) { inner = sym.innerHTML; viewBox = viewBox || sym.getAttribute("viewBox"); symAttrs = sym; }
    } else inner = el.innerHTML;
    inner = inlineSvgRules(resolveVars(inner, cs)).replace(/currentColor/g, color);
    // A <symbol> carries its own drawing attributes (fill="none" stroke="currentColor" …); they win over the <svg>'s defaults.
    const attrs = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"]
      .map((a) => { let v = (symAttrs && symAttrs.getAttribute(a)) || el.getAttribute(a) || cs.getPropertyValue(a); if (!v) return ""; v = v.replace(/currentcolor/gi, color); return `${a}="${v}"`; }).join(" ");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox || `0 0 ${w} ${h}`}" ${attrs}>${inner}</svg>`;
  };

  const textStyle = (cs) => ({
    family: firstFamily(cs.fontFamily), weight: num(cs.fontWeight) || 400, italic: cs.fontStyle === "italic",
    size: num(cs.fontSize), color: parseColor(cs.color) || { r: 0, g: 0, b: 0, a: 1 },
    lh: cs.lineHeight === "normal" ? null : num(cs.lineHeight), ls: cs.letterSpacing === "normal" ? 0 : num(cs.letterSpacing),
    upper: cs.textTransform === "uppercase", strike: /line-through/.test(cs.textDecorationLine), underline: /underline/.test(cs.textDecorationLine),
  });
  const pseudoText = (el, which) => {
    const ps = getComputedStyle(el, which);
    const c = ps.content;
    if (!c || c === "none" || c === "normal" || !/^["']/.test(c)) return null;
    const txt = c.slice(1, -1).replace(/\\([0-9a-f]{1,6})\s?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
    if (!txt.trim() || ps.position === "absolute") return null;
    return { text: txt + (which === "::before" ? " " : ""), style: textStyle(ps) };
  };
  const INLINE = /^(inline|inline-block|contents)$/;
  // Inline-only element → styled runs. Returns null if it contains a non-inline child.
  const runsOf = (el) => {
    const runs = [];
    const b = pseudoText(el, "::before"); if (b) runs.push(b);
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { const t = n.textContent.replace(/\s+/g, " "); if (t) runs.push({ text: t, style: textStyle(getComputedStyle(el)) }); }
      else if (n.nodeType === 1) {
        const cs = getComputedStyle(n);
        if (!visible(n, cs)) continue;
        if (n.tagName === "BR") { runs.push({ text: "\n", style: textStyle(getComputedStyle(el)) }); continue; }
        if (!INLINE.test(cs.display) || ["IMG", "SVG", "svg", "INPUT", "TEXTAREA", "BUTTON", "SELECT"].includes(n.tagName) || hasBox(n, cs)) return null;
        const inner = runsOf(n); if (inner === null) return null; runs.push(...inner);
      }
    }
    const a = pseudoText(el, "::after"); if (a) runs.push(a);
    return runs;
  };
  const hasBox = (el, cs) => !!(parseColor(cs.backgroundColor) || (cs.backgroundImage && cs.backgroundImage !== "none") ||
    num(cs.borderTopWidth) || num(cs.borderLeftWidth) || (cs.boxShadow && cs.boxShadow !== "none"));

  const rel = (r, origin) => ({ x: Math.round((r.left - origin.left) * 10) / 10, y: Math.round((r.top - origin.top) * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });

  // Components (capture/components.js): the outermost match becomes { k: "inst", comp, variant, tree }.
  const COMPS = window.__pawnoteComps || [];
  const AL = !!window.__pawnoteAutoLayout;
  let compDepth = 0;
  async function walk(el, origin, clipRect) {
    const spec = el !== root && !compDepth && el.matches ? COMPS.find((s) => { try { return el.matches(s.sel) && (!s.ok || s.ok(el)); } catch (e) { return false; } }) : null;
    if (!spec) return walkEl(el, origin, clipRect);
    compDepth++;
    let res; try { res = await walkEl(el, origin, clipRect); } finally { compDepth--; }
    if (!res) return null;
    const r = el.getBoundingClientRect(), box = rel(r, origin);
    let tree = res;
    if (res.k !== "frame" || Math.abs(res.x - box.x) > 0.5 || Math.abs(res.y - box.y) > 0.5 || Math.abs(res.w - box.w) > 0.5 || Math.abs(res.h - box.h) > 0.5)
      tree = { k: "frame", name: spec.name, ...box, children: [{ ...res, x: res.x - box.x, y: res.y - box.y }] };
    const cname = typeof spec.name === "function" ? spec.name(el) : spec.name;
    return { k: "inst", name: cname, comp: cname, variant: spec.v ? spec.v(el) : "", ...box, hugW: tree.hugW, hugH: tree.hugH, tree: { ...tree, name: cname, x: 0, y: 0 } };
  }
  async function walkEl(el, origin, clipRect) {
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) { if (cs.display !== "contents") return null; }
    if (clipRect && (r.right < clipRect.left || r.left > clipRect.right || r.bottom < clipRect.top || r.top > clipRect.bottom)) return null;
    const name = (el.id ? "#" + el.id + " " : "") + (typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "") || el.tagName.toLowerCase();
    const tag = el.tagName.toLowerCase();

    // Icons drawn as a CSS mask over a colored box: hand Figma the mask's SVG, in the box's color.
    const mask = cs.webkitMaskImage || cs.maskImage;
    if (mask && /^url\("?data:image\/svg\+xml/.test(mask)) {
      const raw = mask.replace(/^url\("?|"?\)$/g, "");
      let src = decodeURIComponent(raw.slice(raw.indexOf(",") + 1));
      const ink = cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : cs.color;
      src = src.replace(/currentColor/g, ink).replace(/<svg\b([^>]*)>/, (m0, at) => `<svg${at.replace(/\s(width|height)="[^"]*"/g, "")} width="${r.width}" height="${r.height}">`);
      return { k: "svg", name: el.getAttribute("aria-label") || "icon", ...rel(r, origin), svg: src, opacity: num(cs.opacity) };
    }
    if (tag === "svg") return { k: "svg", name, ...rel(r, origin), svg: svgMarkup(el, cs, r.width, r.height), opacity: num(cs.opacity) };
    if (tag === "img") {
      if (!el.currentSrc && !el.src) return null;
      return { k: "image", name, ...rel(r, origin), img: register(el.currentSrc || el.src), radius: radii(cs), opacity: num(cs.opacity), fit: cs.objectFit };
    }
    if (needsRaster(el, cs) && !el.innerText?.trim() && r.width * r.height < 402 * 874 * 0.6) {
      const id = "r" + rasterSeq++;
      el.setAttribute("data-snap-raster", id);
      return { k: "raster", name, ...rel(r, origin), raster: id, radius: radii(cs) };
    }
    const node = { k: "frame", name, ...rel(r, origin), children: [] };
    const bg = parseColor(cs.backgroundColor); if (bg) node.fill = bg;
    const bgi = cs.backgroundImage;
    if (bgi && bgi !== "none") {
      const u = bgi.match(/url\("?([^")]+)"?\)/);
      if (u) node.bgImg = register(u[1]);
      else { const c = parseColor(bgi.match(/rgba?\([^)]*\)/g)?.slice(-1)[0]); if (c && !node.fill) node.fill = c; }
    }
    const bw = num(cs.borderTopWidth) || num(cs.borderLeftWidth) || num(cs.borderBottomWidth);
    if (bw) {
      const side = num(cs.borderTopWidth) ? "Top" : num(cs.borderLeftWidth) ? "Left" : "Bottom";
      const bc = parseColor(cs[`border${side}Color`]);
      if (bc) { node.stroke = bc; node.sw = bw; node.dashed = /dashed|dotted/.test(cs[`border${side}Style`]);
        node.sides = ["Top", "Right", "Bottom", "Left"].map((s) => num(cs[`border${s}Width`])); }
    }
    node.radius = radii(cs);
    const sh = shadowOf(cs.boxShadow); if (sh.length) node.shadows = sh;
    const op = num(cs.opacity); if (op < 1) node.opacity = op;
    const clips = cs.overflow !== "visible" || cs.overflowX !== "visible" || cs.overflowY !== "visible";
    if (clips) node.clip = true;
    const childClip = clips ? r : clipRect;

    if (tag === "input" || tag === "textarea") {
      const type = (el.type || "").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        const accent = parseColor(cs.accentColor) || { r: 0.18, g: 0.42, b: 0.31, a: 1 };
        node.radius = type === "radio" ? [99, 99, 99, 99] : [3, 3, 3, 3];
        if (el.checked) { node.fill = accent; node.children.push({ k: "text", name: "check", x: 0, y: 0, w: r.width, h: r.height, align: "center", runs: [{ text: "✓", style: { ...textStyle(cs), color: { r: 1, g: 1, b: 1, a: 1 }, size: r.height * 0.8, weight: 700 } }] }); }
        else { node.stroke = node.stroke || { r: 0.45, g: 0.45, b: 0.45, a: 1 }; node.sw = node.sw || 1.5; node.fill = node.fill || { r: 1, g: 1, b: 1, a: 1 }; }
        return node;
      }
      if (type === "file") return null;
      const val = el.value, ph = el.getAttribute("placeholder") || "";
      const st = textStyle(cs);
      if (!val) st.color = parseColor(getComputedStyle(el, "::placeholder").color) || { ...st.color, a: 0.5 };
      const pl = num(cs.paddingLeft), pt = num(cs.paddingTop), pr = num(cs.paddingRight);
      node.children.push({ k: "text", name: "value", x: pl + num(cs.borderLeftWidth), y: pt + num(cs.borderTopWidth), w: r.width - pl - pr - 2 * num(cs.borderLeftWidth),
        h: r.height - 2 * pt, wrap: tag === "textarea", runs: [{ text: val || ph, style: st }] });
      // A field is an auto-layout box with its own padding; the value fills it (one line truncates with "…").
      if (AL) {
        const pad = padOf(cs), [bt, br, bb, bl] = borderOf(cs), v = node.children[node.children.length - 1];
        node.al = { mode: "H", pad, gap: 0, cgap: 0, justify: "flex-start", align: tag === "textarea" ? "flex-start" : "center" };
        node.inner = { w: r.width - pad[1] - pad[3] - bl - br, h: r.height - pad[0] - pad[2] - bt - bb };
        node.hugW = false; node.hugH = tag !== "textarea"; node.field = tag === "textarea" ? "area" : "line";
        v.flow = { abs: false, grow: true, self: "auto" };
      }
      return node;
    }

    // Inline-only content → one text node with styled runs (keeps the element's box if it has one).
    const runs = el.childNodes.length ? runsOf(el) : null;
    const hasText = runs && runs.some((x) => x.text.trim());
    if (runs && hasText) {
      const pl = num(cs.paddingLeft) + num(cs.borderLeftWidth), pt = num(cs.paddingTop) + num(cs.borderTopWidth);
      const pr = num(cs.paddingRight) + num(cs.borderRightWidth), pb = num(cs.paddingBottom) + num(cs.borderBottomWidth);
      const range = document.createRange(); range.selectNodeContents(el);
      const tr = range.getBoundingClientRect();
      const box = { x: Math.round((tr.left - r.left) * 10) / 10, y: Math.round((tr.top - r.top) * 10) / 10, w: Math.max(tr.width, 1), h: tr.height };
      const lines = Math.round(tr.height / (num(cs.lineHeight) || num(cs.fontSize) * 1.3));
      const t = { k: "text", name: "text", ...box, runs: runs.map((x) => ({ ...x, text: x.text })), wrap: lines > 1, align: cs.textAlign === "center" ? "center" : cs.textAlign === "right" || cs.textAlign === "end" ? "right" : "left" };
      // trim leading/trailing whitespace across runs
      if (t.runs.length) { t.runs[0].text = t.runs[0].text.replace(/^\s+/, ""); t.runs[t.runs.length - 1].text = t.runs[t.runs.length - 1].text.replace(/\s+$/, ""); }
      if (t.wrap) { t.x = pl; t.w = r.width - pl - pr; }
      const dots = pseudoBoxes(el, cs, r);
      const bare = !dots.length && !node.fill && !node.stroke && !node.shadows && !node.bgImg && !node.opacity;
      if (AL && bare && !/^inline/.test(cs.display) && !t.wrap && r.width - pl - pr > t.w + 1) {
        t.x = pl; t.w = r.width - pl - pr; t.span = true;   // a block of text: as wide as its box, aligned inside it
      }
      if (bare) return { ...t, x: r.left - origin.left + t.x, y: r.top - origin.top + t.y };
      node.children.push(...dots, t);
      if (AL) boxLayout(node, cs, r, t);
      return node;
    }
    // Block content: children elements, plus any loose text nodes positioned by range.
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        const txt = n.textContent.replace(/\s+/g, " ").trim();
        if (!txt) continue;
        const range = document.createRange(); range.selectNodeContents(n);
        const tr = range.getBoundingClientRect();
        if (!tr.width) continue;
        node.children.push({ k: "text", name: "text", x: tr.left - r.left, y: tr.top - r.top, w: tr.width, h: tr.height, wrap: tr.height > (num(cs.lineHeight) || num(cs.fontSize) * 1.3) * 1.5, runs: [{ text: txt, style: textStyle(cs) }] });
      } else if (n.nodeType === 1) {
        const c = await walk(n, r, childClip);
        if (c) {
          if (AL) { const ncs = getComputedStyle(n); c.flow = { abs: /absolute|fixed/.test(ncs.position), grow: num(ncs.flexGrow) > 0, self: ncs.alignSelf, z: Number.isFinite(parseFloat(ncs.zIndex)) ? parseFloat(ncs.zIndex) : null }; }
          node.children.push(c);
        }
      }
    }
    // Drop children fully hidden under a later opaque, square-cornered sibling (e.g. a screen under an overlay).
    const opaque = (c) => c.k === "frame" && c.fill && c.fill.a === 1 && !c.opacity && !(c.radius || []).some(Boolean);
    node.children = node.children.filter((c, i) => !node.children.slice(i + 1).some((o) => opaque(o) &&
      o.x <= c.x + 0.5 && o.y <= c.y + 0.5 && o.x + o.w >= c.x + c.w - 0.5 && o.y + o.h >= c.y + c.h - 0.5));
    node.children.unshift(...pseudoBoxes(el, cs, r));
    const before = pseudoText(el, "::before");
    if (before && node.children.length) { const f = node.children.find((c) => c.k === "text"); if (f) f.runs.unshift(before); }
    // Collapse pure wrappers (no visuals) with a single child.
    if (!node.fill && !node.stroke && !node.shadows && !node.bgImg && !node.clip && !node.opacity && node.children.length === 1 && el !== root) {
      const only = node.children[0];
      const same = Math.abs(only.x) < 0.6 && Math.abs(only.y) < 0.6 && Math.abs(only.w - node.w) < 0.6 && Math.abs(only.h - node.h) < 0.6;
      if (!AL || same || (only.flow && only.flow.abs)) return { ...only, x: only.x + node.x, y: only.y + node.y, flow: undefined };
    }
    if (AL) flexLayout(node, el, cs, r);
    if (!node.fill && !node.stroke && !node.shadows && !node.bgImg && !node.children.length) return null;
    return node;
  }
  // Empty ::before / ::after boxes with a background (status dots, little bars) become small frames.
  function pseudoBoxes(el, cs, r) {
    const out = [];
    for (const which of ["::before", "::after"]) {
      const ps = getComputedStyle(el, which);
      if (!ps.content || ps.content === "none" || ps.display === "none" || !/^["']{2}$|^""$/.test(ps.content.trim())) continue;
      const w = num(ps.width), h = num(ps.height), bg = parseColor(ps.backgroundColor);
      if (!bg || w < 1 || h < 1 || w > r.width || h > r.height) continue;
      let x, y;
      if (ps.position === "absolute") {
        x = ps.left !== "auto" ? num(ps.left) : r.width - num(ps.right) - w;
        y = ps.top !== "auto" ? num(ps.top) : r.height - num(ps.bottom) - h;
      } else {
        x = which === "::before" ? num(cs.paddingLeft) + num(cs.borderLeftWidth) + num(ps.marginLeft) : r.width - num(cs.paddingRight) - w - num(ps.marginRight);
        y = (r.height - h) / 2;
      }
      out.push({ k: "frame", name: which.slice(2), x, y, w, h, fill: bg, radius: radii(ps), children: [], flow: { abs: /absolute|fixed/.test(ps.position) } });
    }
    return out;
  }
  // ---------- auto-layout (ticket capture) ----------
  const padOf = (cs) => [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(num);
  const borderOf = (cs) => [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(num);
  // Where a single child sits inside the content box: start, center or end, per axis.
  const placeOf = (off, room) => Math.abs(off - room / 2) < 1.5 && room > 2 ? "center" : off > 1 && Math.abs(off - room) < 1.5 ? "end" : "start";
  function hugs(node, cs, kids, mode, gap) {
    const [pt, pr, pb, pl] = padOf(cs), [bt, br, bb, bl] = borderOf(cs);
    const flow = kids.filter((c) => !(c.flow && c.flow.abs));
    if (!flow.length) { node.hugW = node.hugH = false; return; }
    const sumW = flow.reduce((a, c) => a + c.w, 0) + gap * (flow.length - 1), maxW = Math.max(...flow.map((c) => c.w));
    const sumH = flow.reduce((a, c) => a + c.h, 0) + gap * (flow.length - 1), maxH = Math.max(...flow.map((c) => c.h));
    const cw = (mode === "H" ? sumW : maxW) + pl + pr + bl + br, ch = (mode === "V" ? sumH : maxH) + pt + pb + bt + bb;
    node.hugW = Math.abs(cw - node.w) < 1; node.hugH = Math.abs(ch - node.h) < 1;
  }
  // A box with one text inside (a tag, a button): horizontal, padded, the text where it sits.
  function boxLayout(node, cs, r, t) {
    const [pt, pr, pb, pl] = padOf(cs), [bt, br, bb, bl] = borderOf(cs);
    const roomW = r.width - pl - pr - bl - br - t.w, roomH = r.height - pt - pb - bt - bb - t.h;
    node.al = { mode: "H", pad: [pt, pr, pb, pl], gap: 0, cgap: 0, justify: placeOf(t.x - pl - bl, roomW), align: placeOf(t.y - pt - bt, roomH) };
    node.inner = { w: r.width - pl - pr - bl - br, h: r.height - pt - pb - bt - bb };
    node.children.forEach((c) => { if (!c.flow) c.flow = { abs: c !== t }; });
    hugs(node, cs, [t], "H", 0);
  }
  function flexLayout(node, el, cs, r) {
    const kids = node.children, flow = kids.filter((c) => !(c.flow && c.flow.abs));
    const pad = padOf(cs), [bt, br, bb, bl] = borderOf(cs);
    let al = null;
    if (/flex/.test(cs.display)) {
      const H = cs.flexDirection.startsWith("row");
      al = { mode: H ? "H" : "V", pad, gap: num(H ? cs.columnGap : cs.rowGap), cgap: num(H ? cs.rowGap : cs.columnGap),
        wrap: H && cs.flexWrap !== "nowrap", justify: cs.justifyContent, align: cs.alignItems };
      if (cs.flexDirection.endsWith("reverse")) { node.children = [...kids].reverse(); al.rev = true; }
      if (/around|evenly/.test(al.justify) && flow.length > 1) {   // no Figma equivalent: measured gaps, centred
        const xs = (H ? flow.map((c) => [c.x, c.w]) : flow.map((c) => [c.y, c.h])).sort((a, b) => a[0] - b[0]);
        let g = 0; for (let i = 1; i < xs.length; i++) g += xs[i][0] - xs[i - 1][0] - xs[i - 1][1];
        al.gap = Math.max(0, g / (xs.length - 1)); al.justify = "center";
      }
    } else if (/grid/.test(cs.display)) {
      const cols = cs.gridTemplateColumns.split(/\s+/).map(num).filter((x) => x > 0);
      if (cols.length && !cols.some((c) => Math.abs(c - cols[0]) > 0.6)) {
        if (cols.length === 1) {
          al = { mode: "V", pad, gap: num(cs.rowGap), cgap: 0, justify: "flex-start", align: cs.justifyItems === "center" ? "center" : "stretch" };
          if (flow.length === 1) {   // place-items: the one child's spot decides
            const c = flow[0];
            al.justify = placeOf(c.y - pad[0] - bt, r.height - pad[0] - pad[2] - bt - bb - c.h);
            al.align = placeOf(c.x - pad[3] - bl, r.width - pad[1] - pad[3] - bl - br - c.w);
          }
        } else al = { mode: "H", pad, gap: num(cs.columnGap), cgap: num(cs.rowGap), wrap: flow.length > cols.length, grid: cols.length, justify: "flex-start", align: /normal|stretch/.test(cs.alignItems) ? "stretch" : cs.alignItems };
      } else if (cols.length > 1 && flow.length > 1 && flow.length <= cols.length) {
        // One row of unequal columns (a time · task · ✕ row): a horizontal auto-layout; the widest column takes the free space.
        al = { mode: "H", pad, gap: num(cs.columnGap), cgap: 0, justify: "flex-start", align: /normal|stretch/.test(cs.alignItems) ? "center" : cs.alignItems };
        const widest = flow.reduce((a, c) => (c.w > a.w ? c : a), flow[0]);
        widest.flow = { ...(widest.flow || {}), abs: false, grow: true };
      }
    } else if (/^(block|flow-root)$/.test(cs.display) && flow.length > 1) {
      // A plain block whose children stack top to bottom with one even gap (a title over a line, a list of rows):
      // a vertical auto-layout, so a longer text pushes the next one down instead of running into it.
      const ys = [...flow].sort((a, b) => a.y - b.y), gaps = [];
      for (let i = 1; i < ys.length; i++) gaps.push(ys[i].y - ys[i - 1].y - ys[i - 1].h);
      const even = gaps.every((g) => g > -0.5 && Math.abs(g - gaps[0]) < 1.5);
      const innerW0 = r.width - pad[1] - pad[3] - bl - br;
      if (even) al = { mode: "V", pad, gap: Math.max(0, gaps[0]), cgap: 0, justify: "flex-start", align: ys.every((c) => Math.abs(c.w - innerW0) < 1 || c.k === "text") ? "stretch" : "flex-start" };
    }
    if (!al) return;
    node.al = al;
    hugs(node, cs, node.children, al.mode, al.gap);
    // A box whose children stretch or grow is sized by its parent, not by them.
    const innerW = node.w - pad[1] - pad[3] - bl - br, innerH = node.h - pad[0] - pad[2] - bt - bb;
    if (flow.some((c) => c.flow && c.flow.grow) || al.grid) { if (al.mode === "H") node.hugW = false; else node.hugH = false; }
    // A column whose children stretch to its width takes that width from its parent (the children fill it).
    if (al.mode === "V" && /normal|stretch/.test(al.align) && flow.some((c) => Math.abs(c.w - innerW) < 1)) node.hugW = false;
    node.inner = { w: innerW, h: innerH };
    if (al.wrap) node.hugW = false;
  }
  function radii(cs) {
    const v = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(num);
    return v.some(Boolean) ? v : undefined;
  }

  const clock = document.getElementById("clockTime"); if (clock) clock.textContent = "9:41";
  const tree = await walk(root, { left: R.left, top: R.top }, R);
  tree.x = 0; tree.y = 0;
  // Images: same-origin URLs → data URLs.
  for (const [k, src] of Object.entries(images)) {
    if (src.startsWith("data:")) continue;
    try { const b = await (await fetch(src)).blob(); images[k] = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); }
    catch (e) { delete images[k]; }
  }
  return { tree, images };
};
