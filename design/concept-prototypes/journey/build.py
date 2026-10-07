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
    "pawnote-concept-d-expressive.html",
]
START, END = "<!-- journey:start -->", "<!-- journey:end -->"

css = (HERE / "journey.css").read_text() + (HERE / "onboard.css").read_text()
js = (HERE / "journey.js").read_text() + (HERE / "onboard.js").read_text()
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
