"""POST /api/breed-needs: what a breed needs, in up to three lines with their sources (11.15 S4).

Public breed facts keyed by species and breed text, so any signed-in person may ask (the sitter's card, the owner's own).
A search only happens for a breed that is not in the reviewed list or the cache, and each person has a small daily limit
on those, to protect the search credits.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.ai.breed_needs import valid_breed_text
from app.deps import limits
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import breed_needs

router = APIRouter(prefix="/api", tags=["breed-needs"])

# Shares the shape of the AI limit (app/deps/limits.py) but counts only real searches, not cache hits.
_searches = limits.DailyLimit(20, "Too many new breeds today.", per_day_demo=200)


class BreedNeedsRequest(BaseModel):
    species: Literal["dog", "cat"]
    breed: str = Field(min_length=2, max_length=60)


@router.post("/breed-needs", response_model=breed_needs.Needs)
def breed_needs_route(body: BreedNeedsRequest, user: CurrentUser = Depends(get_current_user)) -> breed_needs.Needs:
    if not valid_breed_text(body.breed):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That doesn't look like a breed.")
    if not breed_needs.ENABLED:
        return breed_needs.Needs()

    def limited_search(species: str, breed: str):
        if not _searches.allow(user.id, demo=(user.email or "").lower().endswith(limits.DEMO_DOMAIN)):
            raise _Limited
        return breed_needs.search_needs(species, breed)

    try:
        return breed_needs.lookup(body.species, body.breed, get_service_client(), searcher=limited_search)
    except _Limited as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many new breeds today.") from exc


class _Limited(Exception):
    pass
