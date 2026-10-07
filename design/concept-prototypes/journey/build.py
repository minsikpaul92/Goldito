"""Inline the journey + onboarding layers (journey.*, onboard.*) into each concept file.

Each concept HTML has one marker pair, placed right before its main <script>:
    <!-- journey:start --> ... <!-- journey:end -->
Run from anywhere:  python3 design/concept-prototypes/journey/build.py
The concept files stay single-file and work offline.
"""
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
CONCEPTS = [
    "pawnote-concept-a-calm-core.html",
    "pawnote-concept-b-full-tamagotchi.html",
    "pawnote-concept-c-balanced-skin.html",
]
START, END = "<!-- journey:start -->", "<!-- journey:end -->"

css = (HERE / "journey.css").read_text() + (HERE / "onboard.css").read_text() + (HERE / "look.css").read_text()
js = (HERE / "journey.js").read_text() + (HERE / "onboard.js").read_text() + (HERE / "look.js").read_text() + (HERE / "follow.js").read_text()
block = f"{START}\n<style id=\"journey-css\">\n{css}</style>\n<script id=\"journey-js\">\n{js}</script>\n{END}"

for name in CONCEPTS:
    path = ROOT / name
    html = path.read_text()
    if START not in html or END not in html:
        print(f"skip {name}: no journey markers yet")
        continue
    html = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: block, html, flags=re.S)
    path.write_text(html)
    print(f"built {name}")

# Expressive = the Balanced journey + the Expressive layer (journey/expressive-layer.html), regenerated every build
# so fixes to Balanced and the shared layers reach it automatically.
c = (ROOT / "pawnote-concept-c-balanced-skin.html").read_text()
layer = (HERE / "expressive-layer.html").read_text()
d = (c.replace("<title>Balanced Skin</title>", "<title>Expressive</title>", 1)
      .replace("Balanced &middot; soft tint, photo-first", "Expressive &middot; display type, color blocks, illustrations", 1)
      .replace("family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap", "family=Lilita+One&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap", 1)
      .replace(END, END + "\n" + layer.strip(), 1))
(ROOT / "pawnote-concept-d-expressive.html").write_text(d)
print("built pawnote-concept-d-expressive.html (from Balanced + expressive-layer.html)")
