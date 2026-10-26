/* Copied from the design source: design/pixel-bodies/petgen.js in the prototypes repo (pawnote-prototypes, branch design/combined-viewer).
   Edit it there and copy it here, so the Pet maker page and the app draw the same pets. Types: petgen.d.ts. */
/* Goldito pet generator (Oct 26): draws a 32 x 32 pet from a recipe, in the browser or in node.

   A port of tama360.frame360 (design/pixel-bodies) plus the template options that let it cover any dog or cat:

     recipe = { base,                    head shape: one of the 17 Pet options pets (data.bases)
                ears,                    default | big | tufts | lynx (big + tufts) | tipped | folded | long (floppy)
                coat,                    smooth | fluffy | long
                face: [...],             mask | blaze | tan | points | whiteface | spots | stripes | patches | merle
                body: [...],             saddle | spots | merle | patches | stripes | brindle | points | socks | tan
                eyes,                    dark | blue | amber | green | hazel | odd
                mood,                    idle | perk | calm | sleep | love | excited | wink | content | surprised | shy | teary
                earType,                 dogs only: up | floppy (swaps the base head's ears)
                cheeks,                  regular | ruff (fluffy fur around the face)
                nose,                    base | black | brown | pink | liver
                chest, paws,             base | white | coat | tan | dark
                tail,                    base | wag | curl | tip | none | cat
                plain,                   true: leave out the base pet's own markings (husky cheeks, beagle saddle…)
                build, legs, length,     -1 slim / 1 chonky · -2 short / 1 long legs · 1 long body
                colors: { coat, light, muzzle, ear, white, dark, tan, patch, nose, outline } }

   Without options a recipe draws exactly what tama360.py draws (test_petgen.mjs checks every base, view and frame).
   Grid tokens: "#X" = the base pet's palette letter X; one-letter body roles O F s M p H; pattern roles k (dark),
   t (tan), w (white), g (merle mid), u (patch), e / j (eye colors); R r x y bowl and food. */
(function (root) {
  "use strict";
  const W = 32, H = 32;
  let D = null;
  const init = (data) => { D = data; };
  const blank = () => Array.from({ length: H }, () => Array(W).fill("."));
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  function put(g, rows, x0, y0, tag, pm, part) {
    rows.forEach((r, dy) => [...r].forEach((c, dx) => {
      const x = x0 + dx, y = y0 + dy;
      if (c !== "." && inb(x, y)) { g[y][x] = tag ? tag + c : c; if (pm) pm[y][x] = part ? { p: part, x: dx, y: dy } : null; }
    }));
  }
  const mirrorRows = (rows) => rows.map((r) => [...r].reverse().join(""));
  const toGrid = (s) => { const n = Math.round(Math.sqrt(s.length)), out = []; for (let y = 0; y < n; y++) out.push(s.slice(y * n, (y + 1) * n).split("")); return out; };

  // ---------- shapes (PIL ImageDraw semantics: boxes include both ends) ----------
  // Pillow's ellipse, row spans from petgen-data.json (box sizes up to 36 x 20), so pixels match the Python drawing.
  const E = (x0, y0, x1, y1) => {
    const spans = D.ellipses[`${x1 - x0 + 1},${y1 - y0 + 1}`];
    if (!spans) { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2; return (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1; }
    return (x, y) => { const s = spans[y - y0]; return !!s && y >= y0 && x >= x0 + s[0] && x <= x0 + s[1]; };
  };
  const R = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const U = (...fs) => (x, y) => fs.some((f) => f(x, y));
  const Poly = (pts) => (x, y) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      // on an edge counts as inside
      const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
      if (cross === 0 && x >= Math.min(xi, xj) && x <= Math.max(xi, xj) && y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) return true;
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const on = (m, x, y) => inb(x, y) && m(x, y);
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  /** One part: outline on its edge, fill inside, shade on the inner bottom rows, light inside `light`.
      `into`: a part this one grows out of (a leg out of the torso): nothing inside it, open on its outline. */
  function layer(g, m, o = {}) {
    const fill = o.fill || "F", lightRole = o.lightRole || "M", shade = o.shade !== false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!m(x, y)) continue;
      if (o.into && on(o.into, x, y)) {
        const inner = N4.every(([dx, dy]) => on(o.into, x + dx, y + dy));
        const side = !(on(m, x - 1, y) && on(m, x + 1, y));
        if (inner) continue;
        g[y][x] = side ? "O" : fill; mark(o, x, y); continue;
      }
      if (!N4.every(([dx, dy]) => on(m, x + dx, y + dy))) { g[y][x] = "O"; mark(o, x, y); continue; }
      let role = fill;
      if (o.light && on(o.light, x, y)) role = lightRole;
      else if (shade && fill === "F" && !on(m, x, y + 2)) role = "s";
      g[y][x] = role; mark(o, x, y);
    }
  }
  function mark(o, x, y) { if (o.pm) o.pm[y][x] = o.part ? { p: o.part, x: x - (o.ox || 0), y: y - (o.oy || 0) } : null; }

  // ---------- the pet as drawn: base tables plus the recipe ----------
  function resolve(r) {
    const b = D.bases[r.base];
    if (!b) throw new Error("unknown base " + r.base);
    const spec = Object.assign({}, b.spec);
    if (r.plain) { delete spec.spots; delete spec.patches; delete spec.stripes; }
    let tail = r.tail && r.tail !== "base" ? r.tail : (b.cat ? "cat" : spec.tail);
    const build = r.build == null ? b.body[0] : r.build, legs = r.legs == null ? b.body[1] : r.legs;
    return { r, b, base: r.base, cat: b.cat, spec, tail, build, legs, length: r.length || 0, kind: r.plain ? "" : r.base,
      face: new Set(r.face || []), body: new Set(r.body || []), ears: r.ears || "default", coat: r.coat || "smooth",
      head: headType(b, r) };
  }
  /** The head type drawn: the base's, unless a dog's ears were swapped (up <-> floppy). */
  const SWAPPABLE_FLOPPY = ["dog", "blacklab", "beagle", "dalmatian", "maltese"], SWAPPABLE_UP = ["shiba", "jindo", "corgi", "husky", "frenchie"];
  function headType(b, r) {
    if (r.earType === "up" && SWAPPABLE_FLOPPY.includes(r.base)) return "pointy";
    if (r.earType === "floppy" && SWAPPABLE_UP.includes(r.base)) return "floppy";
    return b.head;
  }

  // ---------- front body ----------
  function standRows(build, legs) {
    let rows = []; for (let y = 19; y < 32; y++) rows.push(D.stand[y]);
    if (legs > 0) rows = rows.slice(0, 8).concat(Array(legs).fill(rows[8]), rows.slice(8));
    else if (legs < 0) rows = rows.slice(0, 8).concat(rows.slice(8 - legs));
    const out = rows.map((r, i) => {
      const last = i === rows.length - 2;
      if (build < 0) {
        if (i < 5) { const j = r.indexOf("O"); return "." + r.slice(0, j + 1) + r.slice(j + 2); }
        if (last) return r.replace("........OO", ".........O");
        return r.replace("OsO", "..O");
      }
      if (build > 0) {
        if (i < 5) { const j = r.indexOf("O"); return r.slice(1, j + 1) + "F" + r.slice(j + 1); }
        if (last) return r.replace("........OO", ".......OOO");
        return r.includes("OsO") ? r.replace("OsO", "OssO").slice(1) : r;
      }
      return r;
    });
    const top = 32 - out.length, map = {};
    out.forEach((r, i) => { map[top + i] = r; });
    return { rows: map, hy0: top - 17, top };
  }
  function stampBody(g, rows, pm, top) {
    for (const ys of Object.keys(rows)) {
      const y = +ys, r = rows[ys], full = r + [...r].reverse().join("");
      if (y < 0 || y >= H) continue;
      for (let x = 0; x < full.length; x++) if (full[x] !== ".") {
        g[y][x] = full[x];
        if (pm) { const i = y - top; pm[y][x] = i < 5 ? { p: "torso", x, y: i } : { p: "leg", x: x < 16 ? x - 7 : 24 - x, y: i - 5 }; }
      }
    }
  }
  function paintMarksFront(g, P) {
    const sp = P.spec;
    if (sp.spots) for (const [x, y] of [[9, 24], [10, 25], [21, 27], [20, 23], [12, 29], [7, 28]]) if (g[y][x] === "F") g[y][x] = "#" + sp.spots;
    if (sp.patches) {
      const [a, b] = sp.patches;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (g[y][x] === "F" && x < 12 && y < 28) g[y][x] = "#" + a;
        if (g[y][x] === "F" && x > 20 && y > 25) g[y][x] = "#" + b;
      }
    }
    if (sp.stripes) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === "F" && (x < 11 || x > 20) && y % 3 === 0) g[y][x] = "s";
  }

  // ---------- heads ----------
  function frontRaw(P, face) {
    const b = P.b, f = toGrid(face === "blink" ? b.blink : face !== "idle" && b.faces && b.faces[face] ? b.faces[face] : b.snug), n = toGrid(b.snug);
    const rows = f.slice(0, 17).concat(n.slice(17));
    return P.head !== b.head ? swapEars(P, rows) : rows;
  }
  const UP_EAR = ["..O...", ".OFO..", ".OBFO.", "OBBFFO", "OBBFFF", "OFFFFF"];
  /** Up ears on a floppy head, or floppy ears (the golden pup's) on an up-eared head. */
  function swapEars(P, rows) {
    rows = rows.map((r) => r.slice());
    const W2 = rows[0].length;
    if (P.head === "pointy") {
      for (let y = 4; y < 18; y++) for (let x = 0; x < W2; x++) if (x <= 4 || x >= 19) rows[y][x] = ".";
      // close the face where the ears were
      for (let y = 4; y < 17; y++) for (const x of [5, 18]) if (rows[y][x] !== "." && rows[y][x] !== "O") rows[y][x] = "O";
      const put2 = (stamp, x0, flip) => stamp.forEach((r, dy) => [...r].forEach((c, dx) => { const x = flip ? x0 + stamp[0].length - 1 - dx : x0 + dx; if (c !== ".") rows[dy][x] = c; }));
      put2(UP_EAR, 4, false); put2(UP_EAR, 14, true);
      return rows;
    }
    // floppy: drop the ears above the skull, hang the golden pup's ears at the sides
    const top = skullTop(rows);
    for (let y = 0; y < top; y++) rows[y] = rows[y].map(() => ".");
    const dog = toGrid(D.bases.dog.snug);
    for (let y = 4; y < 17; y++) for (let x = 0; x < W2; x++) if ((x <= 5 || x >= 18) && "SO".includes(dog[y][x]) && (dog[y][x] === "S" || x <= 4 || x >= 19)) rows[y][x] = dog[y][x];
    return rows;
  }
  function backRaw(P, rows) {
    rows = rows.map((r) => r.slice());
    const face = new Set("KWTMBNEPh"); if (P.kind === "siamese") face.add("S");
    const top = rows.length - 24; // rows the ear options added on top
    for (let y = 0; y < 17 + top; y++) for (let x = 0; x < 24; x++) {
      const c = rows[y][x];
      if ("BM".includes(c) || (face.has(c) && y >= 6 + top && x >= 5 && x < 19)) rows[y][x] = "F";
    }
    rows.forEach((r, y) => r.forEach((c, x) => { if (y >= 11 + top && c === "K" && (x < 4 || x > 19)) r[x] = "."; }));
    rows[18 + top] = rows[18 + top].map((c) => ("GD".includes(c) ? "O" : c));
    for (let y = 19 + top; y < rows.length; y++) rows[y] = rows[y].map(() => ".");
    if (P.kind === "calico") for (let y = 2 + top; y < 9 + top; y++) for (let x = 4; x < 12; x++) if (rows[y][x] === "F") rows[y][x] = "U";
    return rows;
  }
  function sideRaw(P, eyes) {
    const rows = D.side[P.head].map((r) => r.split(""));
    const wy = rows.findIndex((r) => r.includes("W")), wx = rows[wy].indexOf("W");
    if (eyes === "closed") { rows[wy][wx] = rows[wy][wx + 1] = "F"; rows[wy + 1][wx] = rows[wy + 1][wx + 1] = "K"; }
    else if (eyes === "happy") { rows[wy][wx] = "F"; rows[wy][wx + 1] = "K"; rows[wy + 1][wx] = "K"; rows[wy + 1][wx + 1] = "F"; }
    else if (eyes === "squeeze") { rows[wy][wx] = "K"; rows[wy][wx + 1] = "F"; rows[wy + 1][wx] = "F"; rows[wy + 1][wx + 1] = "K"; }
    if (eyes !== "open") rows.forEach((r) => r.forEach((c, x) => { if (c === "T") r[x] = ["cat", "fold"].includes(P.head) ? "F" : "M"; }));
    marksSideHead(P, rows);
    return { rows, eye: [wx, wy] };
  }
  function marksSideHead(P, rows) {
    const k = P.kind, set = (x, y, to, from) => { if (rows[y] && from.includes(rows[y][x])) rows[y][x] = to; };
    if (k === "dalmatian") for (const [x, y] of [[6, 3], [7, 3], [12, 5], [13, 6], [3, 6]]) set(x, y, "V", "FH");
    if (k === "calico") {
      for (let y = 0; y < 9; y++) for (let x = 0; x < 8; x++) set(x, y, "U", "FH");
      for (let y = 0; y < 6; y++) for (let x = 9; x < 14; x++) set(x, y, "V", "FE");
    }
    if (P.spec.stripes) for (const [x, y] of [[6, 6], [8, 6], [6, 7], [8, 7], [3, 9], [4, 10]]) set(x, y, "s", "F");
    if (k === "husky") for (const [x, y] of [[12, 7], [13, 7], [10, 10], [11, 10], [10, 11]]) rows[y][x] = "M";
    if (k === "beagle") for (const [x, y] of [[9, 1], [10, 1], [10, 2], [11, 2], [11, 3], [12, 3], [12, 4], [13, 4]]) set(x, y, "M", "HF");
    if (k === "tuxedo") for (const [x, y] of [[14, 7], [14, 8], [15, 9]]) rows[y][x] = "M";
  }
  function sideMap(P) {
    const pal = P.b.pal, has = (k) => k in pal, kind = P.r.base;
    const eye = ["husky", "siamese"].includes(kind) ? "E" : "K";
    const m = { O: "#O", F: "#F", H: has("H") ? "#H" : "#F", S: has("S") || P.head !== P.b.head ? "#S" : "#F", E: has("B") ? "#B" : "#F", M: "#M", K: "#K",
      W: "#W", e: "#" + eye, B: "#B", N: has("N") ? "#N" : "#K", T: "#T", C: "#C", G: "#G", k: "#K", s: "s", U: "#U", V: "#V", q: "k" };
    if (kind === "siamese") Object.assign(m, { E: "#S", M: "#S", S: "#S" });
    if (kind === "jindo") m.E = "#B";
    return m;
  }

  // ---------- ear options (on the raw letters, before colors) ----------
  const nonEmpty = (r) => r.some((c) => c !== ".");
  function skullTop(rows) {
    for (let y = 0; y < rows.length; y++) {
      const xs = rows[y].map((c, x) => (c !== "." ? x : -1)).filter((x) => x >= 0);
      if (xs.length && xs[xs.length - 1] - xs[0] + 1 >= 12 && rows[y].slice(xs[0], xs[xs.length - 1] + 1).every((c) => c !== ".")) return y;
    }
    return 0;
  }
  function runs(r) { const out = []; let s = -1; r.forEach((c, x) => { if (c !== "." && s < 0) s = x; if ((c === "." || x === r.length - 1) && s >= 0) { out.push([s, c === "." ? x - 1 : x]); s = -1; } }); return out; }
  /** Ears that stand up get taller: the row where the ears stand apart is repeated twice. */
  function earsBig(rows, view) {
    const top = skullTop(rows);
    let row = -1;
    for (let y = top - 1; y >= 0; y--) {
      if (!nonEmpty(rows[y])) continue;
      const ok = view === "side" ? runs(rows[y]).every(([a, b]) => b - a < 8) : rows[y].slice(10, 14).every((c) => c === ".");
      if (ok) { row = y; break; }
    }
    if (row < 0) return { rows, dy: 0 };
    return { rows: rows.slice(0, row + 1).concat([rows[row].slice(), rows[row].slice()], rows.slice(row + 1)), dy: 2 };
  }
  /** Floppy ears hang lower: the ear columns stretch down two rows. */
  function earsLong(rows, view) {
    const cols = new Set();
    rows.forEach((r, y) => r.forEach((c, x) => { if (c === "S" && y >= 4 && (view === "side" ? x < 10 : x <= 4 || x >= 19)) cols.add(x); }));
    if (!cols.size) return rows;
    const out = rows.map((r) => r.slice()).concat([Array(rows[0].length).fill("."), Array(rows[0].length).fill(".")]);
    const from = view === "side" ? 11 : 12;
    for (const x of cols) for (let y = out.length - 1; y > from; y--) out[y][x] = y - 2 > from ? (rows[y - 2] ? rows[y - 2][x] : ".") : rows[from][x];
    return out.slice(0, rows.length + (view === "side" ? 2 : 0));
  }
  /** Lynx tufts: two dark hairs on each ear tip. Needs two free rows on top. */
  function earsTufts(rows) {
    const out = [Array(rows[0].length).fill("."), Array(rows[0].length).fill(".")].concat(rows.map((r) => r.slice()));
    const y0 = out.findIndex(nonEmpty);
    for (const [a, b] of runs(out[y0])) { const x = Math.round((a + b) / 2); out[y0 - 1][x] = "O"; out[y0 - 2][x] = "O"; }
    return { rows: out, dy: 2 };
  }
  /** Ears folded over at the tip (dog) or folded flat (cat): the top two rows go, the ear closes, a dark tip for dogs. */
  function earsFold(rows, dark) {
    const top = skullTop(rows), y0 = rows.findIndex(nonEmpty);
    if (top - y0 < 3) return rows;
    const out = rows.map((r) => r.slice());
    for (let y = y0; y < y0 + 2; y++) out[y] = out[y].map(() => ".");
    out[y0 + 2] = out[y0 + 2].map((c) => (c !== "." ? "O" : c));
    if (dark && out[y0 + 3]) out[y0 + 3] = out[y0 + 3].map((c, x) => (c !== "." && c !== "O" && y0 + 3 < top ? "q" : c));
    return out;
  }
  function earOps(P, rows, view) {
    let dy = 0, e = P.ears;
    const up = !["floppy", "pug"].includes(P.head);
    if (up && (e === "big" || e === "lynx")) { const o = earsBig(rows, view); rows = o.rows; dy += o.dy; }
    if (up && (e === "tufts" || e === "lynx")) { const o = earsTufts(rows); rows = o.rows; dy += o.dy; }
    if (up && (e === "tipped" || e === "folded")) rows = earsFold(rows, e === "tipped");
    if (!up && e === "long") rows = earsLong(rows, view);
    return { rows, dy };
  }

  // ---------- face options (on tokens, in head coordinates) ----------
  const COAT = new Set(["#F", "#H"]);
  const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  /** Spots: one dot in most 3 x 3 cells, at a spot picked by the cell, so they read as spots and not lines. */
  function spotAt(x, y, seed) {
    const cx = Math.floor(x / 3), cy = Math.floor(y / 3);
    if (hash(cx, cy, seed) > 0.7) return false;
    return x === cx * 3 + Math.floor(hash(cx, cy, seed + 1) * 3) && y === cy * 3 + Math.floor(hash(cx, cy, seed + 2) * 3);
  }
  function faceOps(P, t, view, eyes, top) {
    const f = P.face, H2 = t.length, W2 = t[0].length;
    const at = (x, y) => (y >= 0 && y < H2 && x >= 0 && x < W2 ? t[y][x] : ".");
    const setIf = (x, y, to, test) => { if (y >= 0 && y < H2 && x >= 0 && x < W2 && test(t[y][x])) t[y][x] = to; };
    const isCoat = (c) => COAT.has(c), isMuzzle = (c) => c === "#M";
    const eye = eyes[0] || [Math.floor(W2 / 2), Math.floor(H2 / 2)];
    const ey = eye[1];
    if (view === "back") {
      if (f.has("points")) for (let y = 0; y < top + 2; y++) for (let x = 0; x < W2; x++) setIf(x, y, "k", (c) => isCoat(c) || c === "#B");
    } else {
      if (f.has("whiteface")) for (let y = ey + 2; y < H2; y++) for (let x = 0; x < W2; x++) if (view === "front" || x >= eye[0] - 3) setIf(x, y, "w", isCoat);
      if (f.has("mask") || f.has("points")) {
        for (let y = ey - 1; y < H2; y++) for (let x = 0; x < W2; x++) setIf(x, y, "k", isMuzzle);
        for (const [ex, eyy] of eyes) for (let y = eyy - 1; y <= eyy + 2; y++) for (let x = ex - 1; x <= ex + 2; x++) setIf(x, y, "k", (c) => isCoat(c) || isMuzzle(c));
      }
      if (f.has("points")) {
        for (let y = 0; y < top + 2; y++) for (let x = 0; x < W2; x++) setIf(x, y, "k", (c) => isCoat(c) || c === "#B");
        const nx = view === "front" ? 11.5 : eye[0] + 4, ny = ey + 3;
        for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) if (Math.abs(x - nx) + Math.abs(y - ny) <= 3.5) setIf(x, y, "k", isCoat);
      }
      if (f.has("blaze")) {
        if (view === "front") { for (let y = top + 1; y < ey + 3; y++) for (const x of [11, 12]) setIf(x, y, "w", isCoat); }
        else for (let x = eye[0] - 2; x <= eye[0] + 4; x++) { const y = t.findIndex((r) => isCoat(r[x])); if (y >= 0 && y < ey) { t[y][x] = "w"; setIf(x, y + 1, "w", isCoat); } }
      }
      if (f.has("tan")) {
        for (const [ex, eyy] of eyes) for (const x of [ex, ex + 1]) setIf(x, eyy - 1, "t", isCoat);
        if (!f.has("mask")) for (let y = ey; y < H2; y++) for (let x = 0; x < W2; x++) setIf(x, y, "t", isMuzzle);
      }
    }
    if (f.has("spots")) for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      if (!isCoat(at(x, y)) || eyes.some(([ex, eyy]) => Math.abs(x - ex - 0.5) < 2.5 && Math.abs(y - eyy - 0.5) < 2.5)) continue;
      if (spotAt(x, y, 7)) t[y][x] = "k";
    }
    if (f.has("stripes") && view !== "side") for (let y = top; y < top + 3; y++) for (const x of [9, 11, 12, 14]) setIf(x, y, "s", isCoat);
    if (f.has("stripes") && view === "side") for (const [x, y] of [[6, 6], [8, 6], [6, 7], [8, 7], [3, 9], [4, 10]]) setIf(x, y + (top - 5 > 0 ? top - 5 : 0), "s", isCoat);
    if (f.has("patches")) for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      if (view === "front" && x < 12 && y < ey) setIf(x, y, "u", isCoat);
      if (view === "front" && x >= 12 && y < top + 1) setIf(x, y, "k", isCoat);
      if (view === "side" && x < 9 && y < ey + 2) setIf(x, y, "u", isCoat);
      if (view === "back" && x < 12) setIf(x, y, "u", isCoat);
    }
    if (f.has("merle")) for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      if (!isCoat(at(x, y))) continue;
      const v = hash(Math.floor(x / 3), Math.floor(y / 2), 11);
      if (v < 0.22) t[y][x] = "k"; else if (v < 0.45) t[y][x] = "g";
    }
    // nose color: the dark nose pixels below the eyes (front), at the snout tip (side)
    if (P.r.nose && P.r.nose !== "base" && view !== "back") {
      const isNose = (c) => c === "#K" || c === "#N";
      if (view === "front") {
        let ny = -1;
        for (let y = ey + 2; y < H2 && ny < 0; y++) for (let x = 9; x <= 14; x++) if (isNose(at(x, y))) { ny = y; break; }
        if (ny >= 0) for (let y = ny; y <= ny + 1; y++) for (let x = 9; x <= 14; x++) setIf(x, y, "n", isNose);
      } else {
        for (let y = ey + 1; y <= ey + 3; y++) { let x = W2 - 1; while (x >= 0 && !isNose(at(x, y))) x--; if (x > eye[0] + 2) { t[y][x] = "n"; if (isNose(at(x - 1, y))) t[y][x - 1] = "n"; } }
      }
    }
    // ruff: tufts of fur round the cheeks and under the chin
    if (P.r.cheeks === "ruff" && view !== "back") {
      const adds = [];
      for (let y = ey; y < Math.min(H2, ey + 9); y++) {
        const row = t[y]; let l = row.findIndex((c) => c !== "."), r = row.length - 1 - [...row].reverse().findIndex((c) => c !== ".");
        if (l < 0) continue;
        if ((y + 1) % 2 === 0) {
          if (l >= 2) adds.push([l - 1, y, "#F"], [l - 2, y, "#O"]);
          if (view === "front" && r <= W2 - 3) adds.push([r + 1, y, "#F"], [r + 2, y, "#O"]);
        } else {
          if (l >= 1) adds.push([l - 1, y, "#O"]);
          if (view === "front" && r <= W2 - 2) adds.push([r + 1, y, "#O"]);
        }
      }
      for (const [x, y, c] of adds) if (t[y][x] === "." || c === "#F") t[y][x] = c;
    }
    // eye color on open eyes
    if (P.r.eyes && P.r.eyes !== "dark" && view !== "back") eyes.forEach(([ex, eyy], i) => {
      if (at(ex, eyy) !== "#W") return;
      const role = P.r.eyes === "odd" && i === 1 ? "j" : "e";
      for (const [x, y] of [[ex + 1, eyy], [ex, eyy + 1], [ex + 1, eyy + 1]]) setIf(x, y, role, (c) => c === "#K" || c === "#E");
    });
  }
  function tokens(rows, map) { return rows.map((r) => r.map((c) => (c === "." ? "." : map ? (map[c] !== undefined ? map[c] : "#" + c) : c === "q" ? "k" : c === "s" ? "s" : "#" + c))); }
  function eyesOf(rows) { const out = []; rows.forEach((r, y) => r.forEach((c, x) => { if (c === "W") out.push([x, y]); })); return out; }

  function headFront(P, face) {
    const idle = earOps(P, frontRaw(P, "idle"), "front");
    const raw = face === "blink" ? earOps(P, frontRaw(P, "blink"), "front").rows : idle.rows;
    const t = tokens(raw);
    const eyes = eyesOf(idle.rows);
    faceOps(P, t, "front", eyes, skullTop(idle.rows));
    return { t, dy: idle.dy, eyeRow: eyes.length ? eyes[0][1] : 9 + idle.dy, center: 12 };
  }
  function headBack(P) {
    const o = earOps(P, frontRaw(P, "idle"), "front");
    const raw = backRaw(P, o.rows), t = tokens(raw);
    faceOps(P, t, "back", [], skullTop(o.rows));
    const eyes = eyesOf(o.rows);
    return { t, dy: o.dy, eyeRow: eyes.length ? eyes[0][1] : 9 + o.dy, center: 12 };
  }
  function headSide(P, eyes) {
    const s = sideRaw(P, eyes), o = earOps(P, s.rows, "side");
    const t = tokens(o.rows, sideMap(P));
    const ey = [[s.eye[0], s.eye[1] + o.dy]];
    const top = skullTop(o.rows);
    faceOps(P, t, "side", ey, top);
    const xs = o.rows[top].map((c, x) => (c !== "." ? x : -1)).filter((x) => x >= 0);
    return { t, dy: o.dy, eyeRow: ey[0][1], center: xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : 8 };
  }

  // ---------- side body ----------
  function sideTail(g, P, x, y, f, up, pm) {
    if (P.tail === "none") { layer(g, E(x + 1, y + 1, x + 4, y + 4), { pm, part: "tail", ox: x, oy: y }); return; }
    if (P.tail === "cat") put(g, mirrorRows(D.tails.cat[f % 2]), x - 2, y - 6 - (up ? 2 : 0), null, pm, "tail");
    else put(g, mirrorRows(D.tails[P.tail][f % 2]), x - 1, y - 3 - (up ? 2 : 0), null, pm, "tail");
  }
  function sideBody(g, P, action, f, pm) {
    const { build, legs } = P, ground = 31, cat = P.cat;
    if (action === "lie") {
      const b = f % 2;
      if (!cat) sideTail(g, P, 1, 27, 0, false, pm);
      layer(g, U(E(2, 21 - b - build, 21, 31), R(6, 26, 21, 31)), { light: E(9, 28, 19, 30), pm, part: "torso", ox: 2, oy: 21 - b - build });
      layer(g, E(1, 25, 9, 31), { pm, part: "torso", ox: 2, oy: 21 - b - build });
      layer(g, R(17, 28, 29, 31), { light: R(25, 29, 28, 30), lightRole: "p", pm, part: "paw", ox: 17, oy: 28 });
      for (const y of [29, 30]) g[y][27] = "O";
      if (cat) put(g, ["..OOOOOOOOO..", ".OFFFFFFFFFO.", "OsOOOOOOOOOO."], 2, 29, null, pm, "tail");
      return { hx: 8, hy: 12 - b, eyes: "closed" };
    }
    if (action === "poop") {
      const s = f % 2;
      sideTail(g, P, 3, 20 - s, 0, true, pm);
      const cells = new Set(D.poop[s].map(([x, y]) => y * W + x)), torso = (x, y) => cells.has(y * W + x); // Pillow's polygon
      layer(g, R(17, 23, 20, ground), { light: R(18, ground - 1, 19, ground - 1), lightRole: "p", pm, part: "leg", ox: 17, oy: 23 });
      layer(g, torso, { light: E(13, 24, 21, 27), pm, part: "torso", ox: 3, oy: 18 });
      layer(g, R(3, 28, 13, ground), { light: R(10, ground - 1, 12, ground - 1), lightRole: "p", pm, part: "leg", ox: 3, oy: 24 });
      return { hx: 10, hy: 5 + s, eyes: "squeeze" };
    }
    const walking = action === "walk";
    const swing = walking ? [2, 0, -2, 0][f] : 0;
    const bob = walking || action === "idle" ? f % 2 : 0;
    const bot = ground - (8 + legs) + 2, top = bot - (8 + build);
    const x1 = 20, x0 = x1 - (17 + 2 * build + 4 * P.length);
    const liftA = walking && f === 1, liftB = walking && f === 3;
    const torso = E(x0, top + bob, x1, bot + bob);
    const leg = (x, lifted, fill) => {
      const y1 = ground - (lifted ? 1 : 0);
      layer(g, R(x, bot - 3, x + 4, y1), { fill, shade: false, light: fill === "F" ? R(x + 1, y1 - 1, x + 3, y1 - 1) : null, lightRole: "p",
        into: fill === "F" ? torso : null, pm, part: "leg", ox: x, oy: bot - 3 });
    };
    leg(x1 - 4 - swing, liftB, "s"); leg(x0 + 3 + swing, liftA, "s");
    sideTail(g, P, x0, top + 3 + bob, f, false, pm);
    layer(g, torso, { light: E(x0 + 5, bot - 2 + bob, x1 - 3, bot + bob), pm, part: "torso", ox: x0, oy: top + bob });
    leg(x1 - 6 + swing, liftA, "F"); leg(x0 + 1 - swing, liftB, "F");
    if (action === "eat") return { hx: 8, hy: top - 3 + (f % 2), eyes: "happy" };
    return { hx: 10, hy: top - 12 + bob, eyes: "open" };
  }
  function sideMarksBody(g, P) {
    const sp = P.spec, k = P.kind;
    if (sp.spots) for (const [x, y] of [[7, 21], [12, 22], [16, 20], [9, 25], [18, 24]]) if (g[y][x] === "F") g[y][x] = "#V";
    if (sp.patches) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (g[y][x] === "F" && x < 11) g[y][x] = "#U";
      else if (g[y][x] === "F" && x > 14 && x < 19 && y > 19 && y < 23) g[y][x] = "#V";
    }
    if (sp.stripes) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === "F" && x % 3 === 0 && y < 26) g[y][x] = "s";
    if (k === "beagle") for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === "F" && x > 6 && x < 17 && y < 21) g[y][x] = "#S";
    if (k === "husky") for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === "s" && y > 22) g[y][x] = "M";
  }
  function sideCollar(g, P, hx, hy) {
    const [a, b] = D.neck[P.head], y = hy + 16;
    for (let x = a; x <= b; x++) {
      const X = hx + x;
      if (X >= 0 && X < W) { if (y >= 0 && y < H) g[y][X] = x === a || x === b ? "#O" : "#C"; if (y + 1 >= 0 && y + 1 < H) g[y + 1][X] = "#O"; }
    }
    const t = hx + b - 1;
    ["G", "OGO", ".O."].forEach((row, dy) => [...row].forEach((c, dx) => {
      const X = t - Math.floor(row.length / 2) + dx, Y = y + 1 + dy;
      if (c !== "." && inb(X, Y)) g[Y][X] = "#" + c;
    }));
  }

  // ---------- body patterns (part coordinates, so they move with the pet) ----------
  function bodyOps(g, pm, P, view) {
    const b = P.body;
    if (!b.size && P.r.chest == null && P.r.paws == null) return;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const m = pm[y][x], c = g[y][x];
      if (!m || typeof c !== "string" || c.startsWith("#")) continue;
      const coat = c === "F" || c === "s" || c === "H";
      const lx = m.x, ly = m.y, part = m.p;
      let to = null;
      if (b.has("saddle") && coat && part === "torso" && (view === "side" ? ly <= 4 : view === "back" ? ly <= 3 : (x < 10 || x > 21))) to = "k";
      if (b.has("stripes") && coat && (part === "torso" || part === "tail") && (view === "side" ? lx % 3 === 0 : ly % 3 === 0 && (x < 11 || x > 20 || view === "back"))) to = "s";
      if (b.has("brindle") && coat && part !== "paw" && (lx + ly) % 3 === 0 && hash(lx, ly, 3) < 0.7) to = "k";
      if (b.has("spots") && coat && spotAt(lx, ly, part.length * 13)) to = "k";
      if (b.has("merle") && coat) { const v = hash(Math.floor(lx / 3), Math.floor(ly / 2), part.length + 11); if (v < 0.22) to = "k"; else if (v < 0.45) to = "g"; }
      if (b.has("patches") && coat && part === "torso") { const v = hash(Math.floor(lx / 6), Math.floor(ly / 4), 5); if (v < 0.35) to = "u"; else if (v < 0.6) to = "k"; }
      if (b.has("points") && ((part === "leg" && ly >= 3) || part === "paw" || part === "tail") && (coat || c === "p" || c === "M")) to = "k";
      if (b.has("tan") && ((part === "leg" && ly >= 4) || part === "paw") && (coat || c === "p")) to = "t";
      if (b.has("socks") && ((part === "leg" && ly >= 5) || part === "paw") && (coat || c === "p")) to = "w";
      if (to) g[y][x] = to;
    }
  }

  // ---------- coat: fluffy fur breaks the outline into tufts ----------
  function fluff(g, rows, seed) {
    const isO = (x, y) => inb(x, y) && (g[y][x] === "O" || g[y][x] === "#O");
    const empty = (x, y) => inb(x, y) && g[y][x] === ".";
    const fillOf = (x, y) => { if (!inb(x, y)) return null; const c = g[y][x]; return c === "O" || c === "#O" || c === "." ? null : c; };
    const adds = [];
    for (let y = 1; y < rows; y++) for (let x = 1; x < W - 1; x++) {
      // a tuft every third pixel along an edge, only where the edge runs straight (corners stay clean)
      if (!isO(x, y) || (x + 2 * y + seed) % 3) continue;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]]) {
        if (!empty(x + dx, y + dy)) continue;
        const along = dx ? isO(x, y - 1) && isO(x, y + 1) : isO(x - 1, y) && isO(x + 1, y);
        const inner = fillOf(x - dx, y - dy);
        if (!along || !inner) continue;
        adds.push([x + dx, y + dy, g[y][x], x, y, inner]);
        break;
      }
    }
    for (const [ax, ay, o, x, y, inner] of adds) if (g[ay][ax] === ".") { g[ay][ax] = o; g[y][x] = inner; }
  }

  // ---------- one frame ----------
  /** view: front | back | side; action: idle | walk | lie | eat | poop; f: frame. Returns a 32 x 32 grid of tokens. */
  function frame(recipe, view, action, f) {
    const P = resolve(recipe), g = blank(), pm = Array.from({ length: H }, () => Array(W).fill(null));
    const { rows, hy0, top } = standRows(P.build, P.legs);
    const tailRows = (i) => (P.tail === "none" ? [] : D.tails[P.cat ? "cat" : P.tail][i]);
    let head;
    if (view === "front") {
      const tail = tailRows(f % 2);
      if (tail.length) put(g, tail, 23 + Math.max(P.build, 0), hy0 + 14 + (f % 2), null, pm, "tail");
      stampBody(g, rows, pm, top);
      paintMarksFront(g, P);
      bodyOps(g, pm, P, view);
      const mood = recipe.mood || "idle", open = ["idle", "perk", "surprised", "shy", "teary", "love"].includes(mood);
      const h = headFront(P, f === 0 || !open ? mood : mood === "idle" ? "blink" : mood);
      g.head = { view, x: 4, y: hy0 + (f % 2) - h.dy, eyeRow: h.eyeRow, center: h.center };
      head = () => put(g, h.t, 4, hy0 + (f % 2) - h.dy);
    } else if (view === "back") {
      stampBody(g, Object.fromEntries(Object.entries(rows).map(([y, r]) => [y, r.replace(/M/g, "F").replace(/p/g, "s")])), pm, top);
      paintMarksFront(g, P);
      bodyOps(g, pm, P, view);
      const h = headBack(P);
      g.head = { view, x: 4, y: hy0 + (f % 2) - h.dy, eyeRow: h.eyeRow, center: h.center };
      put(g, h.t, 4, hy0 + (f % 2) - h.dy);
      const tail = tailRows(0);
      if (tail.length) {
        const ty = hy0 + 13 + (P.cat ? 0 : 3);
        if (f % 2 === 0) put(g, tail, 22 + Math.max(P.build, 0), ty, null, pm, "tail");
        else put(g, mirrorRows(tail), 10 - tail[0].length - Math.max(P.build, 0), ty, null, pm, "tail");
        bodyOps(g, pm, P, view);
      } else if (P.tail === "none") layer(g, E(14, 25, 17, 28));
      head = null;
    } else {
      const s = sideBody(g, P, action, f, pm);
      sideMarksBody(g, P);
      bodyOps(g, pm, P, view);
      const MOOD_EYES = { sleep: "closed", content: "closed", calm: "closed", excited: "happy", love: "happy", perk: "happy", wink: "happy" };
      const eyes = s.eyes === "open" && recipe.mood ? MOOD_EYES[recipe.mood] || "open" : s.eyes;
      const h = headSide(P, eyes);
      g.head = { view, x: s.hx, y: s.hy - h.dy, eyeRow: h.eyeRow, center: h.center };
      head = () => {
        h.t.forEach((r, dy) => r.forEach((c, dx) => { const x = s.hx + dx, y = s.hy - h.dy + dy; if (c !== "." && inb(x, y)) g[y][x] = c; }));
        sideCollar(g, P, s.hx, s.hy);
      };
    }
    if (head) head();
    if (P.coat !== "smooth") { fluff(g, 30, 0); if (P.coat === "long") fluff(g, 30, 1); }
    if (view === "side" && action === "eat") { put(g, D.bowl, 20, 27); put(g, [["..yxyxyx..", "..........", "....yx...."][f]], 20, 26); }
    if (view === "side" && action === "lie") put(g, D.zzz[f % 2], 24, 3, "#");
    return g;
  }

  // ---------- colors ----------
  const hex2rgb = (h) => { h = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  const rgb2hex = (c) => "#" + c.map((v) => ("0" + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2)).join("").toUpperCase();
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const NOSES = { black: "#1E1A18", brown: "#6B4532", pink: "#E8A0A4", liver: "#8A4A3A" };
  const EYES = { dark: "#2B1A0C", blue: "#4F9FE0", amber: "#D99A2E", green: "#8DBF45", hazel: "#A0783C", odd: "#4F9FE0" };
  /** The palette a recipe paints with: the base pet's letters, the recipe's colors on top, then the body roles. */
  function palette(recipe) {
    const P = resolve(recipe), b = P.b, c = recipe.colors || {}, pal = {};
    for (const k in b.pal) pal[k] = hex2rgb(b.pal[k]);
    for (const key in c) { const letters = b.keys[key]; if (letters) for (const l of letters) pal[l] = hex2rgb(c[key]); }
    const coat = pal.F, sum = coat[0] + coat[1] + coat[2];
    // ears swapped onto a head that has no ear color of its own: a little darker than the coat, or the recipe's
    if (!pal.S || (c.ear && !b.keys.ear)) pal.S = c.ear ? hex2rgb(c.ear) : mix(coat, [0, 0, 0], 0.22);
    let shade = sum > 200 ? coat.map((v) => Math.floor(v * 0.82)) : coat.map((v) => Math.min(255, Math.floor(v * 0.75 + 10)));
    if (sum > 690) shade = [226, 216, 204];
    const dark = c.dark ? hex2rgb(c.dark) : mix(coat, [20, 16, 14], 0.7);
    const white = c.white ? hex2rgb(c.white) : [247, 242, 234];
    const tan = c.tan ? hex2rgb(c.tan) : [200, 128, 58];
    const pick = (v, fallback) => ({ white, coat, tan, dark }[v] || fallback);
    const roles = { O: pal.O, F: coat, s: shade, H: pal.H || coat, M: pick(recipe.chest, pal[P.spec.chest]), p: pick(recipe.paws, pal[P.spec.paw]),
      k: dark, t: tan, w: white, g: mix(coat, dark, 0.45), u: c.patch ? hex2rgb(c.patch) : [226, 138, 60],
      e: hex2rgb(EYES[recipe.eyes] || EYES.dark), n: hex2rgb(NOSES[recipe.nose] || NOSES.black), j: hex2rgb("#C98A2E"), R: [232, 109, 79], r: [184, 72, 52], x: [150, 96, 52], y: [200, 140, 80] };
    if (!pal.W) pal.W = [255, 255, 255];
    return { pal, roles };
  }
  /** RGBA pixels (Uint8ClampedArray, 32 x 32) for a grid. */
  function pixels(g, pp) {
    const out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = g[y][x]; if (t === ".") continue;
      const c = t[0] === "#" ? pp.pal[t.slice(1)] : pp.roles[t];
      if (!c) continue;
      const i = (y * W + x) * 4; out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
    }
    return out;
  }

  const MOTIONS = [["Front", "front", "idle", 2, 500], ["Back", "back", "idle", 2, 500], ["Side", "side", "idle", 2, 500], ["Walk", "side", "walk", 4, 170],
    ["Lie (asleep)", "side", "lie", 2, 800], ["Eat", "side", "eat", 2, 300], ["Poop", "side", "poop", 2, 400]];
  const api = { init, frame, palette, pixels, resolve, hex2rgb, rgb2hex, mix, MOTIONS, EYES, W, H };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PetGen = api;
})(typeof window !== "undefined" ? window : globalThis);
