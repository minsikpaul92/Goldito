"""Seed the demo sitters' voice (phase-07B 7B.8): a style card and a few example replies each.

Fictional sitters only (`app/ai/prompts/tone/demo_sitters.json`); real history never goes in the repo (`data/raw/`).
Idempotent: a sitter's `history` samples are replaced, their approved / edited ones are left alone.

    .venv/bin/python scripts/seed_tone.py            # dry run: shows what it would do
    .venv/bin/python scripts/seed_tone.py --apply    # writes to the Supabase project in backend/.env
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai import tone  # noqa: E402
from app.ai.prompts import PROMPTS_DIR  # noqa: E402
from app.deps.supabase import get_service_client  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    sitters = json.loads((PROMPTS_DIR / "tone" / "demo_sitters.json").read_text(encoding="utf-8"))
    db = get_service_client()
    for entry in sitters:
        found = db.table("profiles").select("id").eq("role", "sitter").eq("display_name", entry["display_name"]).execute().data
        if not found:
            print(f"- {entry['display_name']}: no sitter with that name, skipped")
            continue
        sitter_id = found[0]["id"]
        print(f"- {entry['display_name']}: style card + {len(entry['samples'])} examples" + ("" if args.apply else " (dry run)"))
        if not args.apply:
            continue
        db.table("sitter_profiles").update({"style_card": entry["style_card"]}).eq("id", sitter_id).execute()
        db.table("tone_samples").delete().eq("sitter_id", sitter_id).eq("source", "history").execute()
        for sample in entry["samples"]:
            tone.record_sample(
                db,
                sitter_id=sitter_id,
                source="history",
                kind=sample["kind"],
                intent=sample.get("intent"),
                context_summary=sample["context_summary"],
                final_text=sample["final_text"],
            )


if __name__ == "__main__":
    main()
