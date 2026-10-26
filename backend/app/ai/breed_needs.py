"""Breed needs for the sitter's card (11.15 S4): three short lines per breed, each from a trusted site.

Two paths end in the same shape: the reviewed list (`app/data/breed_needs.json`, built by `scripts/build_breed_needs.py` and
checked by a person) and, for a breed not in it, a search on trusted sites summarized by the model. In both the model only
rephrases what the excerpt says, and the server keeps a line only when its quote is really in that excerpt.
"""

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from app.ai.pet_voice import _tokens, quote_in

KINDS = ("exercise", "grooming", "care")
KIND_LABEL = {"exercise": "Exercise", "grooming": "Grooming", "care": "Watch for"}
MAX_CHIPS = 3
MAX_TEXT = 60
DATA = Path(__file__).resolve().parent.parent / "data" / "breed_needs.json"

# Only trusted veterinary and breed-club sites, per species (docs/plan/tavily.md).
DOMAINS = {
    "dog": ["akc.org", "vcahospitals.com", "merckvetmanual.com"],
    "cat": ["icatcare.org", "cfa.org", "vcahospitals.com", "merckvetmanual.com"],
}


class Chip(BaseModel):
    kind: Literal["exercise", "grooming", "care"]
    text: str
    # Index into the needs' `sources` of the page this came from.
    source: int
    # The words on that page the line rests on, kept so a person can check the line against the page.
    quote: str | None = None


class Source(BaseModel):
    title: str
    url: str


class RawChip(BaseModel):
    kind: str = ""
    text: str = ""
    quote: str = ""
    source: int | None = None


class RawNeeds(BaseModel):
    chips: list[RawChip] = []


_MIX = re.compile(r"\b(mix|mixed|cross|crossbreed|x)\b")


def normalize_breed(text: str) -> str:
    """Lowercase letters and single spaces: " Golden-Retriever " is "golden retriever"."""
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text.lower()).split())


def base_breed(key: str) -> str:
    """"poodle mix" is looked up as "poodle" (the card says it is based on it)."""
    return " ".join(_MIX.sub(" ", key).split()) or key


def valid_breed_text(text: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z][A-Za-z .'\-]{1,59}", text.strip()))


@lru_cache
def reviewed_list() -> dict[str, dict[str, dict]]:
    """species -> normalized name or alias -> entry. Missing file or a bad one is an empty list, not a crash."""
    try:
        raw = json.loads(DATA.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"dog": {}, "cat": {}}
    out: dict[str, dict[str, dict]] = {"dog": {}, "cat": {}}
    for species in out:
        for entry in (raw.get(species) or {}).values():
            for name in [entry.get("name", ""), *entry.get("aliases", [])]:
                if normalize_breed(name):
                    out[species][normalize_breed(name)] = entry
    return out


def supported(text: str, quote: str) -> bool:
    """The short line is about what the quote says: at least half of its longer words appear in the quote (a spelling
    ending is tolerated). A real quote under an unrelated line ("heat" over a sentence about cold) does not pass."""
    words = [w for w in _tokens(text) if len(w) >= 4]
    if not words:
        return True
    said = _tokens(quote)
    hits = sum(any(s[:4] == w[:4] for s in said) for w in words)
    return hits >= 1 and hits * 2 >= len(words)


def validate_chips(raw: RawNeeds, hits: list[dict]) -> tuple[list[Chip], list[Source]]:
    """Keeps at most three needs: a known kind used once, a short text, and a quote found in the excerpt of its page.

    `hits` are numbered from 1 in the prompt; the sources returned are only the pages a kept need came from.
    """
    chips: list[Chip] = []
    sources: list[Source] = []
    used: set[str] = set()
    for item in raw.chips:
        kind = item.kind.strip().lower()
        text = " ".join(item.text.split())
        n = item.source
        if kind not in KINDS or kind in used or not text or len(text) > MAX_TEXT:
            continue
        if not isinstance(n, int) or not 1 <= n <= len(hits):
            continue
        hit = hits[n - 1]
        if not quote_in(item.quote, f"{hit.get('title', '')} {hit.get('content', '')}") or not supported(text, item.quote):
            continue
        link = Source(title=str(hit.get("title") or hit.get("domain") or "Source")[:120], url=str(hit["url"]))
        if link not in sources:
            sources.append(link)
        used.add(kind)
        chips.append(Chip(kind=kind, text=text, source=sources.index(link), quote=" ".join(item.quote.split())[:300]))
        if len(chips) == MAX_CHIPS:
            break
    return chips, sources
