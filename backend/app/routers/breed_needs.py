"""POST /api/breed-needs: what a breed needs, in up to three lines with their sources (11.15 S4).

Public breed facts keyed by species and breed text, so any signed-in person may ask (the sitter's card, the owner's own).
A search only happens for a breed that is not in the reviewed list or the cache, and each person has a small daily limit
on those, to protect the search credits.
"""

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.ai.breed_needs import valid_breed_text
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import breed_needs

router = APIRouter(prefix="/api", tags=["breed-needs"])

SEARCHES_PER_DAY = 20
_searches: dict[tuple[str, str], int] = {}


class BreedNeedsRequest(BaseModel):
    species: Literal["dog", "cat"]
    breed: str = Field(min_length=2, max_length=60)


def _allow_search(user_id: str) -> bool:
    today = datetime.now(UTC).date().isoformat()
    for key in [k for k in _searches if k[1] != today]:
        del _searches[key]
    count = _searches.get((user_id, today), 0)
    if count >= SEARCHES_PER_DAY:
        return False
    _searches[(user_id, today)] = count + 1
    return True


@router.post("/breed-needs", response_model=breed_needs.Needs)
def breed_needs_route(body: BreedNeedsRequest, user: CurrentUser = Depends(get_current_user)) -> breed_needs.Needs:
    if not valid_breed_text(body.breed):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That doesn't look like a breed.")

    def limited_search(species: str, breed: str):
        if not _allow_search(user.id):
            raise _Limited
        return breed_needs.search_needs(species, breed)

    try:
        return breed_needs.lookup(body.species, body.breed, get_service_client(), searcher=limited_search)
    except _Limited as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many new breeds today.") from exc


class _Limited(Exception):
    pass
