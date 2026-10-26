"""Build the breed needs list for review (11.15 S4, T2 in docs/plan/tavily.md).

Runs the same search and quote check the app uses for a new breed, for the breeds below, and writes
`app/data/breed_needs.json`. Every entry is written with `"reviewed": false`: a person (Seulgi) reads each line against
its source link, fixes or deletes it, and sets `"reviewed": true`. The app shows reviewed and unreviewed lines alike, but
only a reviewed line is ever called checked in the README.

    cd backend
    .venv/bin/python -m scripts.build_breed_needs            # all breeds
    .venv/bin/python -m scripts.build_breed_needs poodle     # only breeds whose name contains this

Reads TAVILY_API_KEY and NEBIUS_API_KEY from backend/.env. One search (1 credit) per breed; entries that already exist
in the file are kept (a reviewed entry is never overwritten).
"""

import json
import sys
from pathlib import Path

from app.ai.breed_needs import normalize_breed
from app.services.breed_needs import search_needs

OUT = Path(__file__).resolve().parent.parent / "app" / "data" / "breed_needs.json"

# Common in Canada; the owner's choice of breeds to cover is on the meeting agenda.
DOGS = [
    "Labrador Retriever", "Golden Retriever", "French Bulldog", "German Shepherd", "Poodle", "Bulldog", "Beagle",
    "Rottweiler", "Dachshund", "Pembroke Welsh Corgi", "Siberian Husky", "Shih Tzu", "Chihuahua", "Maltese",
    "Pomeranian", "Yorkshire Terrier", "Boston Terrier", "Cavalier King Charles Spaniel", "Australian Shepherd",
    "Border Collie",
]
CATS = [
    "Domestic Shorthair", "Domestic Longhair", "Siamese", "Maine Coon", "Ragdoll", "Persian", "British Shorthair",
    "Bengal",
]


def main() -> int:
    only = (sys.argv[1].lower() if len(sys.argv) > 1 else "").strip()
    data = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"dog": {}, "cat": {}}
    added = skipped = empty = 0
    for species, names in (("dog", DOGS), ("cat", CATS)):
        for name in names:
            key = normalize_breed(name)
            if only and only not in key:
                continue
            if key in data[species]:
                skipped += 1
                continue
            found = search_needs(species, key)
            if not found or not found[0]:
                empty += 1
                print(f"  nothing for {species} {name}")
                continue
            chips, sources = found
            data[species][key] = {
                "name": name,
                "aliases": [],
                "chips": [c.model_dump() for c in chips],
                "sources": [s.model_dump() for s in sources],
                "reviewed": False,
            }
            added += 1
            print(f"  {species} {name}: {len(chips)} lines")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"added {added}, kept {skipped}, nothing found for {empty}. Written to {OUT.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
