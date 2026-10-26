"""Build data/brand.json for the plugin's Brand page from SVG logo files (no PNGs).

For each version: icon master and symbol master from design/brand/logo-files/, Devpost from logo-files when it has an SVG,
otherwise from data/brand-svg/ (generated with the brand session's own scripts in design/brand/source:
masters.devpost(key) for the diary deco versions, bells.px_devpost(way) for the pixel bells), and the gold tag's
Devpost from design/brand/goldito-devpost-logo.svg.

Figma's SVG import drops <pattern> fills, so every pattern fill is expanded here into real tiles clipped to the shape.
Run: python3 design/figma-plugin/brand_svg.py, then python3 design/figma-plugin/build.py
"""
import json, math, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent
LOGOS = HERE.parent / "brand" / "logo-files"
EXTRA = HERE / "data" / "brand-svg"
VERSIONS = [  # group, name, key (file stem after "goldito-")
    ("Original", "Bell + g · v2.1", "original"),
    ("Pixel bell", "Coral on cream", "pixel-paw-coral"), ("Pixel bell", "Cocoa on peach", "pixel-paw-cocoa"), ("Pixel bell", "Apricot on sky", "pixel-paw-apricot"),
    ("Diary deco", "Polaroid page", "polaroid"), ("Diary deco", "Four-cut strip", "fourcut"), ("Diary deco", "Sticker sheet", "stickers"),
    ("Diary deco", "Washi tape", "tape"), ("Diary deco", "A letter from your pet", "letter"),
]

NUM = r"-?\d*\.?\d+(?:e-?\d+)?"

def bbox(tag):
    a = lambda n, d=0.0: float(re.search(rf'\s{n}="({NUM})"', tag).group(1)) if re.search(rf'\s{n}="({NUM})"', tag) else d
    if tag.startswith("<rect"):
        return a("x"), a("y"), a("x") + a("width"), a("y") + a("height")
    if tag.startswith("<circle"):
        return a("cx") - a("r"), a("cy") - a("r"), a("cx") + a("r"), a("cy") + a("r")
    if tag.startswith("<ellipse"):
        return a("cx") - a("rx"), a("cy") - a("ry"), a("cx") + a("rx"), a("cy") + a("ry")
    d = re.search(r'\sd="([^"]+)"', tag)
    if d:  # the patterned paths here are M/L polygons: their points bound them
        n = [float(x) for x in re.findall(NUM, d.group(1))]
        xs, ys = n[0::2], n[1::2]
        return min(xs), min(ys), max(xs), max(ys)
    return None

def expand_patterns(svg):
    pats = {m.group(1): m for m in re.finditer(r'<pattern\s+id="([^"]+)"([^>]*)>(.*?)</pattern>', svg, re.S)}
    if not pats:
        return svg
    seq = [0]
    def tiles(pid, box):
        m = pats[pid]; attrs, body = m.group(2), m.group(3)
        w = float(re.search(rf'width="({NUM})"', attrs).group(1)); h = float(re.search(rf'height="({NUM})"', attrs).group(1))
        rot = re.search(rf'patternTransform="rotate\(({NUM})\)"', attrs)
        ang = math.radians(float(rot.group(1))) if rot else 0.0
        x0, y0, x1, y1 = box
        # Cover the box in pattern space (undo the rotation of its corners).
        pts = [(x, y) for x in (x0, x1) for y in (y0, y1)]
        inv = [(x * math.cos(-ang) - y * math.sin(-ang), x * math.sin(-ang) + y * math.cos(-ang)) for x, y in pts]
        px0, py0 = min(p[0] for p in inv), min(p[1] for p in inv); px1, py1 = max(p[0] for p in inv), max(p[1] for p in inv)
        i0, i1, j0, j1 = math.floor(px0 / w), math.ceil(px1 / w), math.floor(py0 / h), math.ceil(py1 / h)
        cells = "".join(f'<g transform="translate({i * w:g} {j * h:g})">{body}</g>' for i in range(i0, i1) for j in range(j0, j1))
        return f'<g transform="rotate({math.degrees(ang):g})">{cells}</g>' if ang else cells
    def repl(m):
        tag, pid = m.group(0), m.group(1)
        if pid not in pats:
            return tag
        box = bbox(tag)
        if not box:
            return tag
        seq[0] += 1; cid = f"pc{seq[0]}"
        shape = re.sub(r'\sfill="url\(#[^)]+\)"', "", tag)
        return f'<clipPath id="{cid}">{shape}</clipPath><g clip-path="url(#{cid})">{tiles(pid, box)}</g>'
    out = re.sub(r'<(?:rect|circle|ellipse|path)\b[^>]*\sfill="url\(#([^)]+)\)"[^>]*/>', repl, svg)
    return re.sub(r'<pattern\s+id="[^"]+"[^>]*>.*?</pattern>', "", out, flags=re.S)

def load(path):
    s = path.read_text()
    return expand_patterns(re.sub(r"<\?xml[^>]*>\s*", "", s))

def devpost_path(key):
    if key == "original":
        return HERE.parent / "brand" / "goldito-devpost-logo.svg"
    p = LOGOS / f"goldito-{key}-devpost.svg"
    return p if p.exists() else EXTRA / f"goldito-{key}-devpost.svg"

out = []
for group, name, key in VERSIONS:
    out.append({"group": group, "name": name, "key": key,
                "icon": load(LOGOS / f"goldito-{key}-icon-master.svg"),
                "symbol": load(LOGOS / f"goldito-{key}-symbol-master.svg"),
                "devpost": load(devpost_path(key))})
(HERE / "data" / "brand.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
print(f"brand.json: {len(out)} versions, all SVG · {sum(len(v[k]) for v in out for k in ('icon', 'symbol', 'devpost')) // 1024} KB · patterns left: "
      f"{sum(v[k].count('<pattern') for v in out for k in ('icon', 'symbol', 'devpost'))}")
