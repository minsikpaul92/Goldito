"""Breed needs lookup (11.15 S4): the reviewed list first, then the cache, then one search on trusted sites.

A breed is searched once: the answer (or "found nothing") is cached in `breed_notes` (014w). A failure (no key, a slow
site, the model down) answers "none" and is not cached, so the next card tries again.
"""

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Literal

import httpx
from pydantic import BaseModel

from app.ai.breed_needs import (
    DOMAINS,
    Chip,
    RawNeeds,
    Source,
    base_breed,
    normalize_breed,
    reviewed_list,
    validate_chips,
)
from app.ai.prompts import load_prompt
from app.ai.safety import Query
from app.config import get_settings
from app.services import nebius, tavily

log = logging.getLogger("goldito.breed_needs")

FOUND_TTL = timedelta(days=30)
EMPTY_TTL = timedelta(days=3)
SEARCH_TIMEOUT_S = 8.0
# A breed page needs more room than a treat label: the needs are a few sentences in.
EXCERPT_CHARS = 1500
MODEL_TIMEOUT_S = 20.0


# Off since 2026-10-28: the stored and searched text came from VCA (its terms forbid reuse and derivative works) and
# Merck (its terms were not checked), so no breed page is searched or summarized. The lookup answers with nothing and touches no search or DB.
ENABLED = False


class Needs(BaseModel):
    chips: list[Chip] = []
    sources: list[Source] = []
    # list = the reviewed list, cache = an earlier search, search = a search just now, none = nothing to show
    origin: Literal["list", "cache", "search", "none"] = "none"
    # The breed the lookup was made for when it differs from what the owner wrote ("poodle mix" -> "poodle").
    basis: str | None = None


def _query(species: str, breed: str) -> Query:
    topic = "exercise needs grooming" if species == "dog" else "activity needs grooming"
    return Query(f"{breed} {species} breed information {topic}")


def _fresh(row: dict, now: datetime) -> bool:
    try:
        fetched = datetime.fromisoformat(str(row["fetched_at"]).replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return False
    return now - fetched < (FOUND_TTL if row.get("found") else EMPTY_TTL)


def _from_entry(entry: dict, origin: str, basis: str | None) -> Needs:
    return Needs(
        chips=[Chip(**c) for c in entry.get("chips", [])],
        sources=[Source(**s) for s in entry.get("sources", [])],
        origin=origin,  # type: ignore[arg-type]
        basis=basis,
    )


def search_needs(species: str, breed: str) -> tuple[list[Chip], list[Source]] | None:
    """One search plus one model call. None when it could not run (no key, a failure); ([], []) when it found nothing."""
    api_key = get_settings().tavily_api_key
    if not api_key:
        return None
    try:
        hits = tavily.search(
            _query(species, breed), api_key=api_key, timeout=SEARCH_TIMEOUT_S, domains=DOMAINS[species], excerpt_chars=EXCERPT_CHARS
        )
    except (httpx.HTTPError, ValueError) as exc:
        log.info("breed-needs: search failed (%s)", exc.__class__.__name__)
        return None
    hits = hits[:3]
    if not hits:
        return [], []
    listing = "\n\n".join(
        f"{i}. {h['title']} ({h['domain']})\n{h['content']}" for i, h in enumerate(hits, start=1)
    )
    messages = [
        {"role": "system", "content": load_prompt("breed_needs/system.md")},
        {"role": "user", "content": f"Breed: {breed} ({species})\n\n<results>\n{listing}\n</results>"},
    ]
    try:
        raw, _ = nebius.chat_json("fast", messages, RawNeeds, endpoint="breed-needs", timeout=MODEL_TIMEOUT_S, max_tokens=500)
    except (nebius.AIUnavailable, nebius.AIInvalidOutput) as exc:
        log.info("breed-needs: model failed (%s)", exc.__class__.__name__)
        return None
    return validate_chips(raw, hits)


def lookup(species: str, breed: str, db, *, now: datetime | None = None, searcher=search_needs) -> Needs:
    now = now or datetime.now(UTC)
    key = normalize_breed(breed)
    base = base_breed(key)
    basis = base.title() if base != key else None

    entry = reviewed_list().get(species, {}).get(key) or reviewed_list().get(species, {}).get(base)
    if entry:
        return _from_entry(entry, "list", basis)

    rows = db.table("breed_notes").select("species, breed_key, chips, sources, found, fetched_at").eq("species", species).eq("breed_key", base).limit(1).execute().data
    if rows and _fresh(rows[0], now):
        row = rows[0]
        if not row["found"]:
            return Needs(origin="none", basis=basis)
        return _from_entry(row, "cache", basis)

    found = searcher(species, base)
    if found is None:
        return Needs(origin="none", basis=basis)
    chips, sources = found
    db.table("breed_notes").upsert(
        {
            "species": species,
            "breed_key": base,
            "chips": json.loads(json.dumps([c.model_dump() for c in chips])),
            "sources": [s.model_dump() for s in sources],
            "found": bool(chips),
            "fetched_at": now.isoformat(),
        },
        on_conflict="species,breed_key",
    ).execute()
    if not chips:
        return Needs(origin="none", basis=basis)
    return Needs(chips=chips, sources=sources, origin="search", basis=basis)
