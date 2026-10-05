"""Run the care-plan prompt on sample requests against the live model (phase-06 6.12).

    cd backend && PYTHONPATH=. .venv/bin/python -m scripts.try_care_plan

The same prompt → chat_json → normalize path the endpoint uses, without auth or a database.
Use it to tune `app/ai/prompts/care_plan/system.md`.
"""

import json

from app.ai.care_plan import RawPlan, normalize
from app.ai.prompts import load_prompt
from app.services import nebius

SAMPLES = [
    (
        "Max",
        "dog",
        "Meals: 8:00 AM — 1 cup of kibble\n"
        "Medication: 2:00 PM — 1 skin pill, hidden in a lickable treat\n"
        "Heads-up: No knocking or doorbell — text me instead.\n"
        "          Keep other dogs away on walks.",
    ),
    (
        "Mochi",
        "cat",
        "Feed her half a can at 7 AM and 6 PM. Clean the litter box every evening at 8.\n"
        "Please take her for a walk at 5 PM.\n"
        "She hides under the bed if the door slams — close it gently.",
    ),
    (
        "Max",
        "dog",
        "morning and night: kibble (1 cup). thyroid pill 8am & 8pm with cheese.\n"
        "afternoon walk around 3:30pm, he pulls on the leash!\n"
        "Allergic to chicken — NO chicken treats.\n"
        "play fetch whenever.",
    ),
]


def main() -> None:
    for name, species, text in SAMPLES:
        messages = [
            {"role": "system", "content": load_prompt("care_plan/system.md")},
            {"role": "user", "content": f"Pet: {name} ({species})\n\nOwner's request:\n{text}"},
        ]
        raw, result = nebius.chat_json("report", messages, RawPlan, endpoint="care-plan", max_tokens=900)
        plan = normalize(raw, species)
        print(f"\n=== {name} ({species}) — {result.latency_ms} ms")
        print(json.dumps({"tasks": plan.tasks, "cautions": plan.cautions, "skipped": plan.skipped}, indent=2))


if __name__ == "__main__":
    main()
