"""POST /api/geo/geocode — a home address → a point on the map (phase-06b 6B.2, D32).
POST /api/geo/reverse — a point → "Trinity Bellwoods, Toronto", so the Profile can say where the home pin is.
POST /api/geo/suggest — an address or postal code → up to five real addresses to pick from (Profile "Check address").

Only used when someone saves their home address (or reads their location), so the trip screens have a destination
and the person sees where the pin landed. The lookup is the free
OpenStreetMap Nominatim service (no key). Its usage policy asks for an identifying User-Agent and at most one request
a second, which is what this does. The address text goes to OpenStreetMap — the privacy page says so.
"""

import json
import logging
import re
import threading
import time
from pathlib import Path

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


POSTAL_CODE = re.compile(r"^\s*([A-Za-z]\d[A-Za-z])\s*(\d[A-Za-z]\d)?\s*$")
# First three characters of a Canadian postal code -> [city, province, lat, lng] (GeoNames, CC BY 4.0). OpenStreetMap
# knows few postal codes, so a code it cannot find still gets its area, enough to search sitters near it.
POSTAL_AREAS: dict[str, list] = json.loads((Path(__file__).parent.parent / "data" / "ca_postal_areas.json").read_text())


def _search_many(address: str) -> list[dict]:
    postal = POSTAL_CODE.match(address)
    # A postal code is searched as "M4P 1V4" whatever the spelling ("m4p1v4").
    query = f"{postal.group(1).upper()} {postal.group(2).upper()}" if postal and postal.group(2) else address
    return _get(
        NOMINATIM_URL,
        {"q": query, "format": "jsonv2", "limit": 5, "addressdetails": 1, "countrycodes": "ca"},
    )


def postal_area_suggestion(address: str) -> "Suggestion | None":
    """The area of a postal code ("M4P, Toronto, ON") when OpenStreetMap had nothing for it."""
    postal = POSTAL_CODE.match(address)
    area = POSTAL_AREAS.get(postal.group(1).upper()) if postal else None
    if not area:
        return None
    city, province, lat, lng = area
    return Suggestion(label=f"{postal.group(1).upper()}, {city}, {province}", lat=lat, lng=lng)


def _reverse(lat: float, lng: float) -> dict:
    # The point is rounded to 3 decimals (about 100 m) before it leaves for OpenStreetMap: a neighbourhood name
    # does not need more, and the exact spot of a home stays here.
    return _get(
        NOMINATIM_REVERSE_URL,
        {"lat": round(lat, 3), "lon": round(lng, 3), "format": "jsonv2", "zoom": 18, "addressdetails": 1},
    )


def place_label(hit: dict) -> str | None:
    """'Trinity Bellwoods, Toronto' from a Nominatim hit; falls back to the road when there is no neighbourhood."""
    parts = hit.get("address") or {}
    area = parts.get("neighbourhood") or parts.get("suburb") or parts.get("quarter") or parts.get("road")
    city = parts.get("city") or parts.get("town") or parts.get("village") or parts.get("municipality")
    label = ", ".join(p for p in (area, city) if p)
    return label or None


def postal_area(hit: dict) -> str | None:
    """'M6J' from a Canadian postal code ('M6J 1G1'): the first three characters, which name the area. The point the
    lookup got is rounded to about 100 m, so the full code could belong to the next building."""
    code = ((hit.get("address") or {}).get("postcode") or "").replace(" ", "").upper()
    area = code[:3]
    return area if len(area) == 3 and area[0].isalpha() and area[1].isdigit() and area[2].isalpha() else None


def street_address(hit: dict) -> str | None:
    """'Dundas St W, Toronto, M6J' for the Profile's home address: the street, the city and the postal area, never
    the house number or the full code (the lookup point is rounded to about 100 m, so both could be the neighbour's)."""
    parts = hit.get("address") or {}
    city = parts.get("city") or parts.get("town") or parts.get("village") or parts.get("municipality")
    line = ", ".join(p for p in (parts.get("road"), city, postal_area(hit)) if p)
    return line or None


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


class Suggestion(BaseModel):
    label: str
    lat: float
    lng: float


class SuggestResponse(BaseModel):
    results: list[Suggestion]


def address_line(hit: dict) -> str | None:
    """'127 Broadway Ave, Toronto, ON M4P 1V9' from a Nominatim hit, for the person to pick from a short list."""
    parts = hit.get("address") or {}
    street = " ".join(p for p in (parts.get("house_number"), parts.get("road")) if p)
    city = parts.get("city") or parts.get("town") or parts.get("village") or parts.get("municipality")
    province = (parts.get("ISO3166-2-lvl4") or "").removeprefix("CA-") or None
    area = " ".join(p for p in (province, parts.get("postcode")) if p)
    line = ", ".join(p for p in (street, city, area) if p)
    return line or None


@router.post("/suggest", response_model=SuggestResponse)
def suggest(body: GeocodeRequest, _user: CurrentUser = Depends(get_current_user)) -> SuggestResponse:
    """Up to five real places for what the person typed, one lookup per press of "Check address". Never one per
    keystroke: the public Nominatim service does not allow search-as-you-type."""
    try:
        hits = _search_many(body.address.strip())
    except (httpx.HTTPError, ValueError) as exc:
        log.info("suggest: lookup failed (%s)", exc.__class__.__name__)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="The map lookup is unavailable right now.") from exc
    results: list[Suggestion] = []
    for hit in hits if isinstance(hits, list) else []:
        try:
            lat, lng = float(hit["lat"]), float(hit["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        label = address_line(hit)
        if label and not any(r.label == label for r in results):
            results.append(Suggestion(label=label, lat=lat, lng=lng))
    if not results:
        area = postal_area_suggestion(body.address.strip())
        if area:
            results.append(area)
    return SuggestResponse(results=results)


class ReverseRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class ReverseResponse(BaseModel):
    found: bool
    label: str | None = None
    # The first three characters of the postal code, e.g. "M6J".
    postal: str | None = None
    # A street line without the house number, to start the home address from (see street_address).
    address: str | None = None


@router.post("/reverse", response_model=ReverseResponse)
def reverse(body: ReverseRequest, _user: CurrentUser = Depends(get_current_user)) -> ReverseResponse:
    try:
        hit = _reverse(body.lat, body.lng)
    except (httpx.HTTPError, ValueError) as exc:
        log.info("reverse: lookup failed (%s)", exc.__class__.__name__)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="The map lookup is unavailable right now.") from exc
    if not isinstance(hit, dict):
        return ReverseResponse(found=False)
    label = place_label(hit)
    return ReverseResponse(found=label is not None, label=label, postal=postal_area(hit), address=street_address(hit))
