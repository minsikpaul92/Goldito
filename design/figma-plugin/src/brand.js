/* Brand logos on the "Brand" page (created if missing): for each logo version, three VECTOR components (from SVG, never PNG)
   named "Logo/<Group>/<Version>/Icon master", "/Symbol master" and "/Devpost", at their real size: icon and symbol
   1024 × 1024, Devpost 1500 × 1000. Each exports as SVG, or as PNG at 1x for the exact files.
   Data: data/brand.json, built by brand_svg.py from design/brand/logo-files. Re-running replaces only what this plugin made. */

async function brandPage() {
  const pages = figma.root.children;
  let page = pages.find((p) => /brand/i.test(p.name)) || pages.find((p) => /^4\s*[.)]/.test(p.name));
  if (!page) { page = figma.createPage(); page.name = "Brand"; }
  return page;
}

function svgComponent(name, desc, svg, w, h, transparent) {
  const node = figma.createNodeFromSvg(svg);
  node.resize(w, h);
  const c = figma.createComponentFromNode(node);
  c.name = name;
  c.description = desc;
  c.clipsContent = true;
  if (transparent) c.fills = [];
  c.exportSettings = [{ format: "SVG" }, { format: "PNG", constraint: { type: "SCALE", value: 1 } }];
  if (transparent) c.setPluginData("transparent", "1");
  return c;
}

async function buildBrand(BRAND, log) {
  const page = await brandPage();
  await figma.setCurrentPageAsync(page);
  for (const n of page.children.filter((c) => c.getPluginData("pawnote") === "brand")) n.remove();
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  const label = (chars, size, x, y, bold) => {
    const t = figma.createText();
    t.fontName = { family: "Inter", style: bold ? "Bold" : "Regular" };
    t.characters = chars; t.fontSize = size; t.x = x; t.y = y;
    t.setPluginData("pawnote", "brand"); page.appendChild(t);
    return t;
  };
  let top = 0;
  for (const n of page.children) top = Math.max(top, n.y + n.height);
  let y = top ? top + 240 : 0;
  label("Goldito logos", 48, 0, y, true); y += 80;
  label("Vectors from the SVG masters. Export as SVG, or PNG at 1x: icon and symbol 1024 × 1024, Devpost 1500 × 1000. Icon: opaque, square, art inside the centre 66%. Symbol: transparent.", 18, 0, y); y += 70;
  let count = 0, group = null;
  for (const v of BRAND) {
    if (v.group !== group) { group = v.group; y += 40; label(group, 32, 0, y, true); y += 60; }
    label(v.name, 18, 0, y, true); y += 34;
    const base = `Logo/${v.group}/${v.name}`;
    try {
      const parts = [
        svgComponent(`${base}/Icon master`, `${v.group} · ${v.name}. App icon master: opaque square, art inside the centre 66%. Vector; export SVG or PNG 1x = 1024.`, v.icon, 1024, 1024),
        svgComponent(`${base}/Symbol master`, `${v.group} · ${v.name}. Symbol master: transparent, same art and position as the icon. Vector; export SVG or PNG 1x = 1024.`, v.symbol, 1024, 1024, true),
        svgComponent(`${base}/Devpost`, `${v.group} · ${v.name}. Devpost logo with the name, 3:2. Vector; export SVG or PNG 1x = 1500 × 1000.`, v.devpost, 1500, 1000),
      ];
      let x = 0;
      for (const c of parts) { page.appendChild(c); c.x = x; c.y = y; x += c.width + 96; c.setPluginData("pawnote", "brand"); count++; }
      y += 1024 + 96;
    } catch (e) { log.push(`${base}: ${e.message || e}`); }
    say(`  ${v.group} · ${v.name}`); await tick();
  }
  return count;
}
