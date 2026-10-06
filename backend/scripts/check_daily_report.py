"""Live check of the daily report prompt (phase-07 7.4): runs a few snapshots through Nemotron Super.

    cd backend && .venv/bin/python scripts/check_daily_report.py

Needs the Nebius key in `.env`. Read the output against the checklist in
`app/ai/prompts/daily_report/PROMPT.md` — it is a human check, not a test (the model varies).
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.daily_report import few_shot_messages  # noqa: E402
from app.ai.prompts import load_json, load_prompt  # noqa: E402
from app.services import nebius  # noqa: E402

CASES = {
    "full day, owner info": {
        "pet": {"species": "dog", "name": "Max", "breed": "Maltese", "age_years": 4,
                "owner_notes": "Loves squirrels, shy with strangers", "allergies": ["chicken"],
                "heads_up": ["No knocking or doorbell — text me instead"]},
        "date": "2026-10-15",
        "tasks": [
            {"type": "medication", "title": "Skin pill", "due": "08:00", "status": "done", "completed_at": "08:04",
             "owner_dose": "1 skin pill, hidden in a lickable treat"},
            {"type": "walk", "title": "Walk", "due": "10:30", "status": "done", "completed_at": "10:52",
             "owner_dose": "20 minutes around the block"},
        ],
        "photos": [
            {"time": "10:55", "caption": "Max sniffing autumn leaves with a wagging tail", "source": "feed"},
            {"time": "17:40", "caption": "Max looking up at a squirrel on a tree", "source": "report"},
        ],
        "checkins": [{"time": "08:15", "kind": "meal", "value": "all", "has_photo": False}],
        "checks": {"meal": "all", "walk_minutes": 20, "meds": "done"},
        "chips": ["Watching a squirrel", "Park walk"],
        "sitter_note": "Max got so excited",
    },
    "sparse day, rich owner info (must not become events)": {
        "pet": {"species": "cat", "name": "Mochi", "owner_notes": "Hides when guests visit. Loves the window.",
                "allergies": ["fish"], "heads_up": ["Keep the bedroom door closed"]},
        "date": "2026-10-15",
        "tasks": [{"type": "feeding", "title": "Dinner", "due": "18:00", "status": "done", "completed_at": "18:03",
                   "owner_dose": "Half a can of wet food", "owner_notes": "Warm it a little"}],
        "photos": [], "checkins": [], "checks": {}, "chips": [], "sitter_note": None,
    },
    "missed walk only": {
        "pet": {"species": "dog", "name": "Bori"}, "date": "2026-10-15",
        "tasks": [{"type": "walk", "title": "Walk", "due": "10:30", "status": "missed"}],
        "photos": [], "checkins": [], "checks": {}, "chips": [], "sitter_note": None,
    },
}
PRONOUNS = re.compile(r"\b(he|she|his|her|him)\b", re.IGNORECASE)


def main() -> None:
    for name, snapshot in CASES.items():
        messages = [
            {"role": "system", "content": load_prompt("daily_report/system.md")},
            *few_shot_messages(load_json("daily_report/few_shot.json")),
            {"role": "user", "content": json.dumps(snapshot, ensure_ascii=False)},
        ]
        for run in range(1, 4):
            result = nebius.chat("report", messages, endpoint="daily-report", max_tokens=400, temperature=0.4)
            flag = "  ⚠ gendered pronoun" if PRONOUNS.search(result.text) else ""
            print(f"--- {name} · run {run} · {result.model} · {result.latency_ms} ms · {len(result.text.split())} words{flag}")
            print(result.text, "\n")


if __name__ == "__main__":
    main()
