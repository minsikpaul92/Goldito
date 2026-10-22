"""No em or en dashes in anything the models read as an example or the app shows from its data (product rule): the prompts
teach the style, so they carry none either. Model output is cleaned in `nebius.strip_think`."""

from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"
DASHES = "–—―"


def test_the_prompts_and_the_breed_data_have_no_em_or_en_dash():
    bad = []
    for path in [*(APP / "ai" / "prompts").rglob("*"), *(APP / "data").rglob("*.json")]:
        if path.is_file() and path.suffix in {".md", ".json"} and any(c in path.read_text(encoding="utf-8") for c in DASHES):
            bad.append(str(path.relative_to(APP)))
    assert bad == []
