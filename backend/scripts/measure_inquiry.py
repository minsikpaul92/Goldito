"""Latency of an inquiry draft, split by step (phase-07B 7B.7). Real Token Factory, synthetic facts, no DB writes.

    .venv/bin/python scripts/measure_inquiry.py [runs]

Steps: the embedding the RAG search and the tone search each need, the Nano draft (with ~2k tokens of facts and a
style card, including one rewrite when a check fails), and — for the part that is not the model — a few hosted
Supabase round trips. Medians and maxima are printed as a table for notes/model-ids.md.
"""

import json
import statistics
import sys
import time
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai import inquiry as logic  # noqa: E402
from app.ai import tone  # noqa: E402
from app.ai.prompts import PROMPTS_DIR  # noqa: E402
from app.deps.supabase import get_service_client  # noqa: E402
from app.routers import ai_inquiry as router  # noqa: E402
from app.services import nebius  # noqa: E402

QUESTIONS = [
    "Can you give Max his pill at 2 PM?",
    "Do you have a yard? Max loves to run.",
    "Is it okay if Mochi is shy at first?",
    "Can you send photos every day?",
    "What happens if Max gets sick?",
    "Can I drop off a day early?",
    "Does the price include walks?",
    "Max is on a raw diet, is that ok?",
    "Can I bring his own bed?",
    "Is there another dog at your place?",
]
QUOTE = {
    "service": "boarding", "nights": 3, "days": 0, "unit_price": 55, "base": 165, "extra_pets": 82.5,
    "holiday_days": [{"day": "2026-10-12", "name": "Thanksgiving"}], "holiday_surcharge": 20.63,
    "total": 268.13, "currency": "CAD", "rate_version": "measure",
}


class Style:
    """Tone lookups answered by the demo sitter's own samples, so only the embedding is measured."""

    def __init__(self, sitter: dict) -> None:
        self.sitter = sitter

    def table(self, _name):
        sitter = self.sitter

        class Q:
            def select(self, *_a):
                return self

            def eq(self, *_a):
                return self

            def limit(self, *_a):
                return self

            def execute(self):
                return type("R", (), {"data": [{"style_card": sitter["style_card"]}]})()

        return Q()

    def rpc(self, _name, _params):
        rows = [{"context_summary": s["context_summary"], "final_text": s["final_text"]} for s in self.sitter["samples"]]
        return type("R", (), {"execute": lambda self: type("R", (), {"data": rows})()})()


def facts(question: str) -> dict:
    tz = ZoneInfo("America/Toronto")
    days = logic.stay_days(router._ts("2026-10-09T11:30:00+00:00"), router._ts("2026-10-12T21:00:00+00:00"), tz)
    sources = [
        {"id": f"policy-{i}", "type": "sitter_policy", "label": "From Lucy's policies",
         "text": "I welcome dogs and cats up to 20 kg. Medication is fine when written in the care plan. Daily photos are included. " * 3}
        for i in range(5)
    ]
    return {
        "owner": {"first_name": "Chloe"},
        "sitter": {"name": "Lucy", "bio": "Cozy home with a big backyard", "service_area": "Toronto", "experience_years": 5},
        "inquiry": {
            "service": "boarding", "drop_off": "2026-10-09T07:30-04:00", "pick_up": "2026-10-12T17:00-04:00",
            "drop_off_label": "Oct 9", "pick_up_label": "Oct 12", "stay_days": [d.isoformat() for d in days], "pet_count": 2,
        },
        "availability": {"can_host": True, "unavailable_days": []},
        "quote": QUOTE,
        "pets": [
            {"name": "Max", "species": "dog", "breed": "Maltese", "age_years": 4, "weight_kg": 5, "owner_notes": "Pill in a treat", "allergies": ["chicken"]},
            {"name": "Mochi", "species": "cat", "age_years": 3},
        ],
        "sources": sources,
        "policy_conflicts": [],
    }


def timed(fn):
    start = time.perf_counter()
    result = fn()
    return result, (time.perf_counter() - start) * 1000


def summary(values: list[float]) -> str:
    return f"{statistics.median(values):.0f} ms | {max(values):.0f} ms"


def main() -> None:
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    sitter = json.loads((PROMPTS_DIR / "tone" / "demo_sitters.json").read_text(encoding="utf-8"))[0]
    db = get_service_client()
    embed, draft, total, supabase = [], [], [], []
    for i in range(runs):
        question = QUESTIONS[i % len(QUESTIONS)]
        grounding = facts(question)
        _, e = timed(lambda q=question: nebius.embed([q], endpoint="measure"))
        embed.append(e)
        (_, ms) = timed(lambda: db.table("profiles").select("id").limit(1).execute())
        supabase.append(ms)
        result, d = timed(lambda g=grounding, q=question: router._write(Style(sitter), g, q, "s", None, "Lucy"))
        draft.append(d)
        # `_write` includes the tone embedding and the model call (and a rewrite if a check failed).
        total.append(e + d)
        reply = result[0].reply if result[0] else "(fixed text)"
        print(f"{i + 1:2}. embed {e:5.0f} ms · tone+draft {d:5.0f} ms · {reply[:70]!r}")
    print("\n| Step | median | max |\n| :--- | :--- | :--- |")
    print(f"| RAG query embedding | {summary(embed)} |")
    print(f"| Tone search + Nano draft (incl. rewrite) | {summary(draft)} |")
    print(f"| Hosted Supabase round trip (one query) | {summary(supabase)} |")
    print(f"| Estimated draft total (embedding + tone + draft + ~4 parallel gathers) | {summary([t + 120 for t in total])} |")


if __name__ == "__main__":
    main()
