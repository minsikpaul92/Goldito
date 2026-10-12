"""POST /api/ai/handoff-check (phase-06b 6B.5): the model reports what it sees, the server decides ok / warning."""

from types import SimpleNamespace

import pytest
from app.ai.prompts import load_prompt
from app.routers import ai_handoff_check
from app.services import authz, nebius
from app.services import cloudinary as cloudinary_service
from fastapi import HTTPException

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_media_sign import OWNER_ID, PET_ID, SITTER_ID, owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client

MEDIA = "11111111-1111-4111-8111-111111111111"
BOOKING = "00000000-0000-4000-8000-0000000000b1"


def media_row(**over) -> dict:
    return {
        "id": MEDIA, "pet_id": PET_ID, "uploaded_by": SITTER_ID, "purpose": "handoff", "resource_type": "image",
        "cloudinary_public_id": f"goldito/{PET_ID}/handoff/abc", **over,
    }


def make_db(**extra) -> FakeDB:
    tables = dict(pets=[{"id": PET_ID, "name": "Max", "species": "dog"}], media=[media_row()], handoff_checks=[])
    tables.update(extra)
    return FakeDB(**tables)


SEEN_DOG = {"pet_visible": True, "species_match": True, "crate_visible": None, "restraint_visible": None, "concerns": []}


class Vision:
    def __init__(self, *answers) -> None:
        self.answers = list(answers)
        self.calls: list[dict] = []

    def __call__(self, role, messages, schema, **kwargs):
        self.calls.append({"role": role, "messages": messages, **kwargs})
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return schema.model_validate(answer), SimpleNamespace(model="vision-model", latency_ms=900)


@pytest.fixture
def setup(monkeypatch):
    def _setup(*answers, db=None, fetch_error: Exception | None = None, booked: Exception | None = None):
        db = db or make_db()
        vision = Vision(*answers)
        fetched: list[tuple] = []
        asked: list[dict] = []

        def fetch(public_id, resource_type="image", **kw):
            fetched.append((public_id, resource_type))
            if fetch_error:
                raise fetch_error
            return "data:image/jpeg;base64,AAAA"

        def assert_booked(user, booking_id, **kw):
            asked.append({"booking_id": str(booking_id), **kw})
            if booked:
                raise booked

        monkeypatch.setattr(ai_handoff_check, "get_service_client", lambda: db)
        monkeypatch.setattr(authz, "assert_booked_sitter", assert_booked)
        monkeypatch.setattr(nebius, "chat_json", vision)
        monkeypatch.setattr(cloudinary_service, "fetch_as_data_url", fetch)
        return SimpleNamespace(db=db, vision=vision, fetched=fetched, asked=asked)

    return _setup


def post(client, token=None, **over):
    return client.post(
        "/api/ai/handoff-check",
        headers={"Authorization": f"Bearer {token or sitter_token()}"},
        json={"booking_id": BOOKING, "media_id": MEDIA, "check_type": "pet_checkin", "handoff_kind": "drop_off", **over},
    )


def test_a_dog_at_the_door_is_ok_and_the_check_is_saved(client, setup):
    ctx = setup(SEEN_DOG)
    body = post(client).json()
    assert body["status"] == "ok" and body["model"] == "vision-model" and body["latency_ms"] == 900
    assert body["findings"]["pet_visible"] is True
    (saved,) = ctx.db.tables["handoff_checks"]
    assert body["check_id"] == saved["id"]
    assert saved["booking_id"] == BOOKING and saved["handoff_kind"] == "drop_off" and saved["check_type"] == "pet_checkin"
    assert saved["media_id"] == MEDIA and saved["status"] == "ok" and saved["model"] == "vision-model"
    call = ctx.vision.calls[0]
    assert call["role"] == "vision" and call["endpoint"] == "handoff-check" and call["timeout"] == 20.0
    content = call["messages"][-1]["content"]
    assert content[0]["text"] == "Check type: pet_checkin\nPet: Max (dog)" and content[1]["image_url"]["url"].startswith("data:image/jpeg")
    assert ctx.fetched == [(f"goldito/{PET_ID}/handoff/abc", "image")]
    # The sitter is checked for this booking, this pet, from 2 h before the drop-off.
    assert ctx.asked == [{"booking_id": BOOKING, "pet_id": __import__("uuid").UUID(PET_ID), "from_hours_before": 2}]


def test_an_empty_room_is_a_warning(client, setup):
    ctx = setup({"pet_visible": False, "species_match": False, "concerns": ["No animal in the photo"]})
    body = post(client).json()
    assert body["status"] == "warning" and body["findings"]["concerns"] == ["No animal in the photo"]
    assert ctx.db.tables["handoff_checks"][0]["status"] == "warning"


def test_the_wrong_species_is_a_warning(client, setup):
    setup({"pet_visible": True, "species_match": False})
    assert post(client).json()["status"] == "warning"


@pytest.mark.parametrize(
    ("findings", "expected"),
    [
        ({"pet_visible": True, "crate_visible": True, "restraint_visible": False}, "ok"),
        ({"pet_visible": True, "crate_visible": False, "restraint_visible": True}, "ok"),
        ({"pet_visible": True, "crate_visible": False, "restraint_visible": False}, "warning"),
        ({"pet_visible": True, "crate_visible": None, "restraint_visible": None}, "warning"),
        ({"pet_visible": False, "crate_visible": True, "restraint_visible": True}, "warning"),
    ],
)
def test_a_car_photo_is_ok_only_with_a_crate_or_a_restraint_and_the_pet(client, setup, findings, expected):
    setup({"species_match": True, **findings})
    assert post(client, check_type="vehicle_safety").json()["status"] == expected


def test_the_model_saying_ok_cannot_approve_a_car_without_a_crate(client, setup):
    # The rule is the server's: no crate and no restraint is a warning however the model words it.
    setup({"pet_visible": True, "species_match": True, "crate_visible": False, "restraint_visible": False, "concerns": ["Looks safe and secure"]})
    assert post(client, check_type="vehicle_safety", handoff_kind="pick_up").json()["status"] == "warning"


@pytest.mark.parametrize("case", ["unavailable", "timeout", "invalid", "fetch"])
def test_anything_going_wrong_is_a_200_unchecked_and_still_saved(client, setup, case):
    if case == "unavailable":
        ctx = setup(nebius.AIUnavailable("down"))
    elif case == "timeout":
        ctx = setup(nebius.AIUnavailable("The request timed out."))
    elif case == "invalid":
        ctx = setup(nebius.AIInvalidOutput("bad"))
    else:
        ctx = setup(SEEN_DOG, fetch_error=cloudinary_service.MediaFetchError("gone"))
    response = post(client)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "unchecked" and body["model"] is None and body["latency_ms"] == 0
    (saved,) = ctx.db.tables["handoff_checks"]
    assert saved["status"] == "unchecked" and saved["findings"] == {} and saved["model"] is None and saved["latency_ms"] is None


def test_the_model_answering_yes_and_no_in_words_still_works(client, setup):
    setup({"pet_visible": "Yes", "species_match": "true", "crate_visible": "no", "restraint_visible": "maybe", "concerns": "none"})
    body = post(client).json()
    assert body["status"] == "ok" and body["findings"]["crate_visible"] is False and body["findings"]["restraint_visible"] is None
    assert body["findings"]["concerns"] == []


def test_concerns_are_short_and_few(client, setup):
    setup({"pet_visible": True, "species_match": True, "concerns": ["a" * 300, "b", "", "c", "d"]})
    concerns = post(client).json()["findings"]["concerns"]
    assert len(concerns) == 3 and all(len(c) <= 120 for c in concerns)


def test_someone_elses_or_unsuitable_media_is_refused(client, setup):
    for over in ({"uploaded_by": OWNER_ID}, {"purpose": "feed"}, {"purpose": "task_proof"}):
        ctx = setup(db=make_db(media=[media_row(**over)]))
        assert post(client).status_code == 403
        assert ctx.db.tables["handoff_checks"] == []
    setup(db=make_db(media=[]))
    assert post(client).status_code == 403


def test_a_sitter_not_on_this_booking_is_refused_and_nothing_is_saved(client, setup):
    ctx = setup(SEEN_DOG, booked=HTTPException(status_code=403, detail="You are not the sitter for this booking."))
    assert post(client).status_code == 403
    assert ctx.db.tables["handoff_checks"] == [] and ctx.vision.calls == [] and ctx.fetched == []


def test_an_owner_is_refused(client, setup):
    ctx = setup(SEEN_DOG)
    assert post(client, owner_token()).status_code == 403
    assert ctx.vision.calls == []


def test_an_unknown_pet_is_a_404(client, setup):
    setup(db=make_db(pets=[]))
    assert post(client).status_code == 404


@pytest.mark.parametrize(
    "over",
    [{"check_type": "pet_checkin", "handoff_kind": "pick_up"}, {"check_type": "return", "handoff_kind": "drop_off"}, {"check_type": "selfie"}],
)
def test_a_check_that_does_not_fit_the_handoff_is_rejected(client, setup, over):
    setup(SEEN_DOG)
    assert post(client, **over).status_code == 422


def test_the_prompt_covers_the_three_checks_and_forbids_medical_talk():
    prompt = load_prompt("handoff_check/system.md")
    for word in ("pet_checkin", "return", "vehicle_safety", "crate_visible", "restraint_visible", "never write anything about the pet's health"):
        assert word.lower() in prompt.lower()
