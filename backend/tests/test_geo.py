"""POST /api/geo/geocode (phase-06b 6B.2): address → point, via Nominatim, signed-in users only.
POST /api/geo/reverse: point → a coarse "neighbourhood, city" label."""

import httpx
import pytest
from app.routers import geo

from tests import test_media_sign as base
from tests.test_media_sign import owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client

HIT = {
    "lat": "43.6477",
    "lon": "-79.4194",
    "address": {
        "house_number": "12",
        "road": "Dundas St W",
        "neighbourhood": "Trinity Bellwoods",
        "city": "Toronto",
        "postcode": "M6J 1G1",
    },
}


def post(client, token=None, address="12 Dundas St W, Toronto"):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.post("/api/geo/geocode", headers=headers, json={"address": address})


def test_an_address_becomes_a_point_and_a_coarse_label(client, monkeypatch):
    seen: list[str] = []
    monkeypatch.setattr(geo, "_search", lambda address: seen.append(address) or [HIT])
    body = post(client, sitter_token(), address="  12 Dundas St W, Toronto ").json()
    assert body == {"found": True, "lat": 43.6477, "lng": -79.4194, "label": "Trinity Bellwoods, Toronto"}
    assert seen == ["12 Dundas St W, Toronto"]  # trimmed
    assert "12" not in body["label"]  # no house number in the label


def test_an_address_nobody_knows_is_found_false(client, monkeypatch):
    monkeypatch.setattr(geo, "_search", lambda address: [])
    assert post(client, owner_token()).json() == {"found": False, "lat": None, "lng": None, "label": None}


def test_a_hit_without_a_usable_point_is_found_false(client, monkeypatch):
    monkeypatch.setattr(geo, "_search", lambda address: [{"lat": "north", "lon": "?"}])
    assert post(client, owner_token()).json()["found"] is False


def test_the_label_falls_back_to_the_road_or_nothing():
    assert geo.place_label({"address": {"road": "Dundas St W", "town": "Oakville"}}) == "Dundas St W, Oakville"
    assert geo.place_label({"address": {"suburb": "Riverdale"}}) == "Riverdale"
    assert geo.place_label({}) is None


def test_the_map_service_being_down_is_a_502(client, monkeypatch):
    def down(address):
        raise httpx.ConnectError("no route")

    monkeypatch.setattr(geo, "_search", down)
    response = post(client, owner_token())
    assert response.status_code == 502


def test_it_needs_a_signed_in_user_and_a_real_address(client, monkeypatch):
    monkeypatch.setattr(geo, "_search", lambda address: [HIT])
    assert post(client).status_code == 401
    assert post(client, owner_token(), address="ab").status_code == 422
    assert post(client, owner_token(), address="x" * 201).status_code == 422


def test_the_lookup_identifies_goldito_and_asks_for_one_result_in_canada(monkeypatch):
    calls: list[dict] = []

    class Reply:
        def raise_for_status(self):
            pass

        def json(self):
            return []

    def fake_get(url, **kwargs):
        calls.append({"url": url, **kwargs})
        return Reply()

    monkeypatch.setattr(geo.httpx, "get", fake_get)
    monkeypatch.setattr(geo, "MIN_GAP_S", 0)
    assert geo._search("12 Dundas St W") == []
    call = calls[0]
    assert call["url"] == "https://nominatim.openstreetmap.org/search"
    assert call["headers"]["User-Agent"].startswith("Goldito/")
    assert call["params"] == {"q": "12 Dundas St W", "format": "jsonv2", "limit": 1, "addressdetails": 1, "countrycodes": "ca"}


@pytest.mark.parametrize("gap", [0.3])
def test_two_lookups_are_spaced_at_least_a_gap_apart(monkeypatch, gap):
    stamps: list[float] = []

    class Reply:
        def raise_for_status(self):
            pass

        def json(self):
            return []

    monkeypatch.setattr(geo.httpx, "get", lambda url, **kw: stamps.append(geo.time.monotonic()) or Reply())
    monkeypatch.setattr(geo, "MIN_GAP_S", gap)
    geo._search("first")
    geo._search("second")
    assert stamps[1] - stamps[0] >= gap - 0.02


def post_reverse(client, token=None, lat=43.6477, lng=-79.4194):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.post("/api/geo/reverse", headers=headers, json={"lat": lat, "lng": lng})


def test_a_point_becomes_a_coarse_label(client, monkeypatch):
    seen: list[tuple[float, float]] = []
    monkeypatch.setattr(geo, "_reverse", lambda lat, lng: seen.append((lat, lng)) or HIT)
    body = post_reverse(client, owner_token()).json()
    assert body == {"found": True, "label": "Trinity Bellwoods, Toronto", "postal": "M6J"}
    assert "12" not in body["label"]  # no house number
    assert "1G1" not in str(body)  # only the area part of the postal code
    assert seen == [(43.6477, -79.4194)]


def test_a_point_nobody_can_name_is_found_false(client, monkeypatch):
    monkeypatch.setattr(geo, "_reverse", lambda lat, lng: {"error": "Unable to geocode"})
    assert post_reverse(client, owner_token()).json() == {"found": False, "label": None, "postal": None}


def test_the_reverse_lookup_sends_a_rounded_point(monkeypatch):
    calls: list[dict] = []

    class Reply:
        def raise_for_status(self):
            pass

        def json(self):
            return {}

    monkeypatch.setattr(geo.httpx, "get", lambda url, **kw: calls.append({"url": url, **kw}) or Reply())
    monkeypatch.setattr(geo, "MIN_GAP_S", 0)
    geo._reverse(43.647712345, -79.419498765)
    call = calls[0]
    assert call["url"] == "https://nominatim.openstreetmap.org/reverse"
    assert call["headers"]["User-Agent"].startswith("Goldito/")
    assert call["params"]["lat"] == 43.648 and call["params"]["lon"] == -79.419  # about 100 m, not the exact spot


def test_the_reverse_lookup_being_down_is_a_502_and_it_needs_sign_in(client, monkeypatch):
    def down(lat, lng):
        raise httpx.ConnectError("no route")

    monkeypatch.setattr(geo, "_reverse", down)
    assert post_reverse(client, owner_token()).status_code == 502
    assert post_reverse(client).status_code == 401
    assert post_reverse(client, owner_token(), lat=123).status_code == 422


def test_the_postal_area_is_the_first_three_characters_or_nothing():
    assert geo.postal_area({"address": {"postcode": "M6J 1G1"}}) == "M6J"
    assert geo.postal_area({"address": {"postcode": "m6j1g1"}}) == "M6J"
    assert geo.postal_area({"address": {"postcode": "90210"}}) is None  # not a Canadian code
    assert geo.postal_area({"address": {}}) is None
    assert geo.postal_area({}) is None
