"""POST /api/ai/pet-photo (11.15 S2): breed and coat suggestions from the owner's own upload. The model guesses, the server tidies."""

from types import SimpleNamespace

import pytest
from app.ai.pet_photo import COATS, RawGuess, clean
from app.services import cloudinary as cloudinary_service
from app.services import nebius

from tests import test_media_sign as base
from tests.test_media_sign import OWNER_ID, SITTER_ID, owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client


def mine(name: str = "abc") -> str:
    return f"goldito/pet-profile/{OWNER_ID}/{name}"


# --- the pure tidy-up ------------------------------------------------------------------------------


def test_up_to_three_distinct_short_breeds_and_a_coat_from_the_list():
    guess = clean(
        RawGuess(species="dog", breeds=["Maltese", "maltese", " Poodle   mix ", "", "Shih Tzu", "Bichon Frise"], coat="White"),
        "dog",
    )
    assert guess.species_match is True
    assert guess.breeds == ["Maltese", "Poodle mix", "Shih Tzu"]
    assert guess.coat_color == "white"


def test_a_coat_outside_the_list_is_dropped():
    assert clean(RawGuess(species="cat", breeds=[], coat="chartreuse"), "cat").coat_color is None
    assert clean(RawGuess(species="cat", breeds=[], coat=None), "cat").coat_color is None
    assert all(c == c.lower() for c in COATS)


def test_a_long_or_odd_breed_is_dropped():
    guess = clean(RawGuess(species="dog", breeds=["x" * 61, 5, "Corgi"]), "dog")
    assert guess.breeds == ["Corgi"]


def test_another_animal_or_no_pet_offers_nothing():
    other = clean(RawGuess(species="cat", breeds=["Siamese"], coat="cream"), "dog")
    assert other == other.model_copy(update={"species_match": False, "breeds": [], "coat_color": None})
    assert clean(RawGuess(species="other", breeds=["Maltese"], coat="white"), "dog").species_match is False
    assert clean(RawGuess(), "dog").species_match is False


# --- the route -------------------------------------------------------------------------------------


def headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def model(monkeypatch):
    state = {"answer": RawGuess(species="dog", breeds=["Maltese", "Poodle mix"], coat="white"), "sent": None, "error": None, "fetched": []}

    def fetch(public_id, *a, **k):
        state["fetched"].append(public_id)
        if state.get("fetch_error"):
            raise cloudinary_service.MediaFetchError("x")
        return "data:image/jpeg;base64,AAAA"

    def chat_json(role, messages, schema, **kw):
        state["sent"] = {"role": role, "messages": messages, **kw}
        if state["error"]:
            raise state["error"]
        return state["answer"], SimpleNamespace(model="vision-model", latency_ms=900)

    monkeypatch.setattr(cloudinary_service, "fetch_as_data_url", fetch)
    monkeypatch.setattr(nebius, "chat_json", chat_json)
    return state


def test_the_owner_gets_breed_guesses_and_a_coat(client, model) -> None:
    response = client.post("/api/ai/pet-photo", json={"public_id": mine(), "species": "dog"}, headers=headers(owner_token()))
    assert response.status_code == 200
    assert response.json() == {
        "species_match": True,
        "breeds": ["Maltese", "Poodle mix"],
        "coat_color": "white",
        "model": "vision-model",
        "latency_ms": 900,
    }
    assert model["sent"]["role"] == "vision"
    assert model["fetched"] == [mine()]
    content = model["sent"]["messages"][1]["content"]
    assert {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,AAAA"}} in content


def test_only_the_owners_own_uploads_reach_the_model(client, model) -> None:
    other = f"goldito/pet-profile/{SITTER_ID}/abc"
    assert client.post("/api/ai/pet-photo", json={"public_id": other, "species": "dog"}, headers=headers(owner_token())).status_code == 403
    assert client.post("/api/ai/pet-photo", json={"public_id": "goldito/profile/x/y", "species": "dog"}, headers=headers(owner_token())).status_code == 403
    assert model["fetched"] == []


def test_only_owners_may_ask(client, model) -> None:
    assert client.post("/api/ai/pet-photo", json={"public_id": mine(), "species": "dog"}, headers=headers(sitter_token())).status_code == 403
    assert client.post("/api/ai/pet-photo", json={"public_id": mine(), "species": "dog"}).status_code == 401


def test_a_bad_species_is_refused(client, model) -> None:
    assert client.post("/api/ai/pet-photo", json={"public_id": mine(), "species": "bird"}, headers=headers(owner_token())).status_code == 422


def test_a_photo_that_cannot_be_opened_and_model_trouble(client, model) -> None:
    owner = headers(owner_token())
    body = {"public_id": mine(), "species": "dog"}
    model["fetch_error"] = True
    assert client.post("/api/ai/pet-photo", json=body, headers=owner).status_code == 422
    model["fetch_error"] = False
    model["error"] = nebius.AIUnavailable("down")
    assert client.post("/api/ai/pet-photo", json=body, headers=owner).status_code == 503
    model["error"] = nebius.AIInvalidOutput("junk")
    assert client.post("/api/ai/pet-photo", json=body, headers=owner).status_code == 502
