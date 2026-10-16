/* Serializes the visible phone screen into a tree the Figma plugin rebuilds as layers.
   Injected by capture.spec.ts; returns { tree, images }.
   Node kinds: frame (box with fill/stroke/radius/shadow/clip), text (styled runs),
   image (img or CSS background url), svg (inline icon markup). Coordinates are relative to the parent node. */
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

  const svgMarkup = (el, cs, w, h) => {
    const color = cs.color;
    let inner = "", viewBox = el.getAttribute("viewBox");
    const use = el.querySelector("use");
    if (use) {
      const id = (use.getAttribute("href") || use.getAttribute("xlink:href") || "").slice(1);
      const sym = id && document.getElementById(id);
      if (sym) { inner = sym.innerHTML; viewBox = viewBox || sym.getAttribute("viewBox"); }
    } else inner = el.innerHTML;
    inner = resolveVars(inner, cs).replace(/currentColor/g, color);
    const attrs = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"]
      .map((a) => { let v = cs.getPropertyValue(a); if (!v) return ""; v = v.replace(/currentcolor/gi, color); return `${a}="${v}"`; }).join(" ");
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

  async function walk(el, origin, clipRect) {
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) { if (cs.display !== "contents") return null; }
    if (clipRect && (r.right < clipRect.left || r.left > clipRect.right || r.bottom < clipRect.top || r.top > clipRect.bottom)) return null;
    const name = (el.id ? "#" + el.id + " " : "") + (typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "") || el.tagName.toLowerCase();
    const tag = el.tagName.toLowerCase();

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
      if (!node.fill && !node.stroke && !node.shadows && !node.bgImg && !node.opacity) return { ...t, x: r.left - origin.left + t.x, y: r.top - origin.top + t.y };
      node.children.push(t);
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
        node.children.push({ k: "text", name: "text", x: tr.left - r.left, y: tr.top - r.top, w: tr.width, h: tr.height, runs: [{ text: txt, style: textStyle(cs) }] });
      } else if (n.nodeType === 1) {
        const c = await walk(n, r, childClip);
        if (c) node.children.push(c);
      }
    }
    // Drop children fully hidden under a later opaque, square-cornered sibling (e.g. a screen under an overlay).
    const opaque = (c) => c.k === "frame" && c.fill && c.fill.a === 1 && !c.opacity && !(c.radius || []).some(Boolean);
    node.children = node.children.filter((c, i) => !node.children.slice(i + 1).some((o) => opaque(o) &&
      o.x <= c.x + 0.5 && o.y <= c.y + 0.5 && o.x + o.w >= c.x + c.w - 0.5 && o.y + o.h >= c.y + c.h - 0.5));
    const before = pseudoText(el, "::before");
    if (before && node.children.length) { const f = node.children.find((c) => c.k === "text"); if (f) f.runs.unshift(before); }
    // Collapse pure wrappers (no visuals) with a single child.
    if (!node.fill && !node.stroke && !node.shadows && !node.bgImg && !node.clip && !node.opacity && node.children.length === 1 && el !== root) {
      const only = node.children[0];
      return { ...only, x: only.x + node.x, y: only.y + node.y };
    }
    if (!node.fill && !node.stroke && !node.shadows && !node.bgImg && !node.children.length) return null;
    return node;
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
