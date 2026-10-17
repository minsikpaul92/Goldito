"""POST /api/geo/geocode — a home address → a point on the map (phase-06b 6B.2, D32).
POST /api/geo/reverse — a point → "Trinity Bellwoods, Toronto", so the Profile can say where the home pin is.

Only used when someone saves their home address (or reads their location), so the trip screens have a destination
and the person sees where the pin landed. The lookup is the free
OpenStreetMap Nominatim service (no key). Its usage policy asks for an identifying User-Agent and at most one request
a second, which is what this does. The address text goes to OpenStreetMap — the privacy page says so.
"""

import logging
import threading
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.deps.auth import CurrentUser, get_current_user

router = APIRouter(prefix="/api/geo", tags=["geo"])
log = logging.getLogger("goldito.geo")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
USER_AGENT = "Goldito/0.1 (pet care hackathon demo; https://goldito-petcare.vercel.app)"
TIMEOUT_S = 8.0
MIN_GAP_S = 1.0  # Nominatim policy: at most one request a second

_gate = threading.Lock()
_last_call = 0.0


class GeocodeRequest(BaseModel):
    address: str = Field(min_length=3, max_length=200)


class GeocodeResponse(BaseModel):
    found: bool
    lat: float | None = None
    lng: float | None = None
    # A coarse "near …" line for the person to eyeball — neighbourhood and city, no house number.
    label: str | None = None


def _get(url: str, params: dict):
    """One Nominatim request, spaced at least a second after the previous one (any user)."""
    global _last_call
    with _gate:
        wait = MIN_GAP_S - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        try:
            response = httpx.get(
                url,
                params=params,
                headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
                timeout=TIMEOUT_S,
            )
            response.raise_for_status()
            return response.json()
        finally:
            _last_call = time.monotonic()


def _search(address: str) -> list[dict]:
    return _get(
        NOMINATIM_URL,
        {"q": address, "format": "jsonv2", "limit": 1, "addressdetails": 1, "countrycodes": "ca"},
    )


def _reverse(lat: float, lng: float) -> dict:
    # The point is rounded to 3 decimals (about 100 m) before it leaves for OpenStreetMap: a neighbourhood name
    # does not need more, and the exact spot of a home stays here.
    return _get(
        NOMINATIM_REVERSE_URL,
        {"lat": round(lat, 3), "lon": round(lng, 3), "format": "jsonv2", "zoom": 16, "addressdetails": 1},
    )


def place_label(hit: dict) -> str | None:
    """'Trinity Bellwoods, Toronto' from a Nominatim hit; falls back to the road when there is no neighbourhood."""
    parts = hit.get("address") or {}
    area = parts.get("neighbourhood") or parts.get("suburb") or parts.get("quarter") or parts.get("road")
    city = parts.get("city") or parts.get("town") or parts.get("village") or parts.get("municipality")
    label = ", ".join(p for p in (area, city) if p)
    return label or None


@router.post("/geocode", response_model=GeocodeResponse)
def geocode(body: GeocodeRequest, _user: CurrentUser = Depends(get_current_user)) -> GeocodeResponse:
    try:
        hits = _search(body.address.strip())
    except (httpx.HTTPError, ValueError) as exc:
        log.info("geocode: lookup failed (%s)", exc.__class__.__name__)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="The map lookup is unavailable right now.") from exc
    if not hits:
        return GeocodeResponse(found=False)
    hit = hits[0]
    try:
        lat, lng = float(hit["lat"]), float(hit["lon"])
    except (KeyError, TypeError, ValueError):
        return GeocodeResponse(found=False)
    return GeocodeResponse(found=True, lat=lat, lng=lng, label=place_label(hit))


class ReverseRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class ReverseResponse(BaseModel):
    found: bool
    label: str | None = None


@router.post("/reverse", response_model=ReverseResponse)
def reverse(body: ReverseRequest, _user: CurrentUser = Depends(get_current_user)) -> ReverseResponse:
    try:
        hit = _reverse(body.lat, body.lng)
    except (httpx.HTTPError, ValueError) as exc:
        log.info("reverse: lookup failed (%s)", exc.__class__.__name__)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="The map lookup is unavailable right now.") from exc
    label = place_label(hit) if isinstance(hit, dict) else None
    return ReverseResponse(found=label is not None, label=label)
