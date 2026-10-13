"""POST /api/ai/safety-check (Phase 12.1, D61): label → rules → trusted-site search → Ultra, never below the rules."""

from types import SimpleNamespace

import pytest
from app.ai.safety import Query
from app.routers import ai_safety_check
from app.services import authz, nebius, tavily
from app.services import cloudinary as cloudinary_service
from fastapi import HTTPException

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_media_sign import OWNER_ID, PET_ID, SITTER_ID, owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client

MEDIA = "22222222-2222-4222-8222-222222222222"
OTHER_PET = "00000000-0000-4000-8000-0000000000bb"


def media_row(**over) -> dict:
    return {
        "id": MEDIA, "pet_id": PET_ID, "uploaded_by": OWNER_ID, "purpose": "safety_label", "resource_type": "image",
        "cloudinary_public_id": f"goldito/{PET_ID}/safety_label/abc", **over,
    }


def make_db(*, allergens=("chicken",), species="dog", **extra) -> FakeDB:
    tables = dict(
        pets=[{"id": PET_ID, "name": "Max", "species": species, "breed": "Maltese", "weight_kg": 4}],
        pet_allergies=[{"pet_id": PET_ID, "allergen": a} for a in allergens],
        media=[media_row()],
        safety_checks=[],
    )
    tables.update(extra)
    return FakeDB(**tables)


def label(*ingredients, product="Crunchy Bites", readable=True) -> dict:
    return {"readable": readable, "product_name": product, "ingredients": list(ingredients)}


def judged(status="SAFE", message="Looks fine for Max.", **over) -> dict:
    return {"safety_status": status, "warning_message": message, **over}


class Models:
    """Stands in for nebius.chat_json: the vision answer, then the Ultra answer (a dict or an exception)."""

    def __init__(self, vision, reasoning) -> None:
        self.answers = {"vision": vision, "safety": reasoning}
        self.calls: list[dict] = []

    def __call__(self, role, messages, schema, **kwargs):
        self.calls.append({"role": role, "messages": messages, **kwargs})
        answer = self.answers[role]
        if isinstance(answer, Exception):
            raise answer
        return schema.model_validate(answer), SimpleNamespace(model=f"{role}-model", latency_ms=500)


@pytest.fixture
def setup(monkeypatch):
    def _setup(vision, reasoning=None, *, db=None, hits=None, searched=True, owner_ok=True, on_duty=True):
        db = db or make_db()
        models = Models(vision, reasoning if reasoning is not None else judged())
        searches: list[list[Query]] = []

        def owner_of(user, pet_id):
            if not owner_ok or str(pet_id) != PET_ID:
                raise HTTPException(status_code=403, detail="That is not your pet.")

        def duty(user, pet_id):
            if not on_duty:
                raise HTTPException(status_code=403, detail="You are not on duty for this pet.")

        def search_many(queries):
            searches.append(queries)
            return (hits if hits is not None else []), searched

        monkeypatch.setattr(ai_safety_check, "get_service_client", lambda: db)
        monkeypatch.setattr(authz, "assert_owner_of", owner_of)
        monkeypatch.setattr(authz, "assert_on_duty_for", duty)
        monkeypatch.setattr(nebius, "chat_json", models)
        monkeypatch.setattr(cloudinary_service, "fetch_as_data_url", lambda *a, **k: "data:image/jpeg;base64,AAAA")
        monkeypatch.setattr(tavily, "search_many", search_many)
        return SimpleNamespace(db=db, models=models, searches=searches)

    return _setup


def post(client, token=None, **over):
    return client.post(
        "/api/ai/safety-check",
        headers={"Authorization": f"Bearer {token or owner_token()}"},
        json={"pet_id": PET_ID, "media_id": MEDIA, **over},
    )


HIT = {"title": "People foods to avoid", "url": "https://www.aspca.org/foods", "domain": "aspca.org", "content": "Avoid..."}


def test_an_owner_checks_a_plain_treat_and_it_is_saved_with_its_sources(client, setup):
    ctx = setup(label("sweet potato", "glycerin"), judged("SAFE", "Looks fine for Max."), hits=[HIT])
    body = post(client).json()
    assert body["safety_status"] == "SAFE" and body["double_checked"] is True and body["sources_unavailable"] is False
    assert body["detected_ingredients"] == ["sweet potato", "glycerin"] and body["product_name"] == "Crunchy Bites"
    assert body["sources"] == [{"title": "People foods to avoid", "url": "https://www.aspca.org/foods", "domain": "aspca.org"}]
    assert body["model"] == "safety-model" and body["warning_message"] == "Looks fine for Max."
    (saved,) = ctx.db.tables["safety_checks"]
    assert body["safety_check_id"] == saved["id"]
    assert saved["pet_id"] == PET_ID and saved["checked_by"] == OWNER_ID and saved["media_id"] == MEDIA
    assert saved["safety_status"] == "SAFE" and saved["model_vision"] == "vision-model" and saved["model_reasoning"] == "safety-model"
    assert saved["result_json"]["rule_status"] == "SAFE" and saved["result_json"]["queries"]
    # The vision model reads the photo; Ultra thinks, with the pet, the rules and the site excerpts.
    vision, ultra = ctx.models.calls
    assert vision["role"] == "vision" and vision["timeout"] == 30.0
    assert vision["messages"][1]["content"][1]["image_url"]["url"].startswith("data:image/jpeg")
    assert ultra["role"] == "safety" and ultra["reasoning"] is True and ultra["timeout"] == 60.0
    facts = ultra["messages"][1]["content"]
    assert '"allergies": ["chicken"]' in facts and '"source": "aspca.org"' in facts
    # Every check searches (D61), here with the first ingredients.
    assert [q.text for q in ctx.searches[0]][:1] == ["Crunchy Bites dog treat recall"]


def test_an_allergen_is_danger_even_when_the_model_says_safe(client, setup):
    ctx = setup(label("chicken breast", "rice"), judged("SAFE", "Looks fine."))
    body = post(client).json()
    assert body["safety_status"] == "DANGER" and body["matched_allergens"] == ["chicken"]
    assert body["warning_message"] == "Max is allergic to chicken, and this treat contains it. Don't feed it."
    assert ctx.db.tables["safety_checks"][0]["result_json"]["model_status"] == "SAFE"


def test_a_species_toxin_is_danger(client, setup):
    ctx = setup(label("lily extract", "salmon"), judged("WARNING"), db=make_db(allergens=(), species="cat"))
    body = post(client).json()
    assert body["safety_status"] == "DANGER" and body["toxic_ingredients"] == ["lily extract"]
    assert any(s["domain"] == "aspca.org" for s in body["sources"])
    assert ctx.searches[0][0].text == "lily extract toxic cats"


def test_a_possible_hidden_allergen_is_a_warning_with_the_reason(client, setup):
    ctx = setup(label("sweet potato", "animal fat"), judged("WARNING", "Ask the owner first."))
    body = post(client).json()
    assert body["safety_status"] == "WARNING"
    assert body["hidden_sources"][0]["ingredient"] == "animal fat" and body["hidden_sources"][0]["may_contain"] == "chicken"
    assert ctx.searches[0][0].text == "animal fat chicken derived"


def test_the_model_can_raise_the_status_but_not_lower_it(client, setup):
    setup(label("sweet potato", "mystery gum"), judged("WARNING", "We don't know mystery gum.", unknown_ingredients=["mystery gum"]))
    body = post(client).json()
    assert body["safety_status"] == "WARNING" and body["unknown_ingredients"] == ["mystery gum"]


def test_without_ultra_the_rules_answer_and_never_say_safe(client, setup):
    ctx = setup(label("sweet potato"), nebius.AIUnavailable("down"))
    body = post(client).json()
    assert body["safety_status"] == "WARNING" and body["double_checked"] is False
    assert "couldn't double-check" in body["warning_message"]
    assert ctx.db.tables["safety_checks"][0]["model_reasoning"] is None
    danger = setup(label("chicken"), nebius.AIInvalidOutput("bad json"))
    assert post(client).json()["safety_status"] == "DANGER"
    assert danger.db.tables["safety_checks"][0]["safety_status"] == "DANGER"


def test_no_search_this_time_is_said_and_the_check_still_answers(client, setup):
    setup(label("sweet potato"), judged("SAFE"), searched=False)
    body = post(client).json()
    assert body["sources_unavailable"] is True and body["safety_status"] == "SAFE" and body["sources"] == []


def test_an_unreadable_label_is_a_422_and_nothing_is_saved(client, setup):
    ctx = setup(label(readable=False))
    response = post(client)
    assert response.status_code == 422 and "closer" in response.json()["detail"].lower()
    assert ctx.db.tables["safety_checks"] == [] and len(ctx.models.calls) == 1


def test_the_vision_model_down_is_a_503(client, setup):
    setup(nebius.AIUnavailable("down"))
    assert post(client).status_code == 503


def test_the_sitter_on_duty_can_check_and_is_recorded(client, setup):
    ctx = setup(label("sweet potato"), db=make_db(media=[media_row(uploaded_by=SITTER_ID)]))
    assert post(client, sitter_token()).status_code == 200
    assert ctx.db.tables["safety_checks"][0]["checked_by"] == SITTER_ID


def test_a_sitter_off_duty_and_an_owner_of_another_pet_are_refused(client, setup):
    setup(label("x"), db=make_db(media=[media_row(uploaded_by=SITTER_ID)]), on_duty=False)
    assert post(client, sitter_token()).status_code == 403
    setup(label("x"), owner_ok=False)
    assert post(client).status_code == 403


@pytest.mark.parametrize(
    "row",
    [media_row(uploaded_by=SITTER_ID), media_row(pet_id=OTHER_PET), media_row(purpose="feed")],
    ids=["someone else's photo", "another pet's photo", "not a label photo"],
)
def test_only_my_own_label_photo_of_this_pet_is_checked(client, setup, row):
    ctx = setup(label("x"), db=make_db(media=[row]))
    assert post(client).status_code == 403
    assert ctx.models.calls == []


def test_the_model_output_is_tidied(client, setup):
    setup(label(" Chicken Breast ", "chicken breast", "", "Rice."), judged("danger", "  <think>x</think>Don't  feed it. "))
    body = post(client).json()
    assert body["detected_ingredients"] == ["chicken breast", "rice"]
    assert body["safety_status"] == "DANGER"
