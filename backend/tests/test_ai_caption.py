"""POST /api/ai/caption (phase-09 9.1 · 9.5): vision caption + album category, never blocks posting."""

from types import SimpleNamespace

import pytest
from app.ai.prompts import load_prompt
from app.routers import ai_caption
from app.services import authz, nebius
from app.services import cloudinary as cloudinary_service

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_media_sign import OWNER_ID, PET_ID, SITTER_ID, owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client

MEDIA = "11111111-1111-4111-8111-111111111111"


def media_row(**over) -> dict:
    return {
        "id": MEDIA, "pet_id": PET_ID, "uploaded_by": SITTER_ID, "purpose": "feed", "resource_type": "image",
        "cloudinary_public_id": f"goldito/{PET_ID}/feed/abc", **over,
    }


def make_db(**extra) -> FakeDB:
    tables = dict(
        pets=[{"id": PET_ID, "name": "Max", "species": "dog"}],
        media=[media_row()],
        sitter_profiles=[{"id": SITTER_ID, "style_card": None}],
    )
    tables.update(extra)
    return FakeDB(**tables)


class Vision:
    def __init__(self, *answers) -> None:
        self.answers = list(answers)
        self.calls: list[dict] = []

    def __call__(self, role, messages, schema, **kwargs):
        self.calls.append({"role": role, "messages": messages, **kwargs})
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return schema.model_validate(answer), SimpleNamespace(model="vision-model", latency_ms=1234)


@pytest.fixture
def setup(monkeypatch):
    def _setup(*answers, db=None, fetch_error: Exception | None = None):
        db = db or make_db()
        vision = Vision(*answers)
        fetched: list[tuple] = []

        def fetch(public_id, resource_type="image", **kw):
            fetched.append((public_id, resource_type))
            if fetch_error:
                raise fetch_error
            return "data:image/jpeg;base64,AAAA"

        monkeypatch.setattr(ai_caption, "get_service_client", lambda: db)
        monkeypatch.setattr(authz, "assert_on_duty_for", lambda user, pet_id: None)
        monkeypatch.setattr(nebius, "chat_json", vision)
        monkeypatch.setattr(cloudinary_service, "fetch_as_data_url", fetch)
        monkeypatch.setattr(nebius, "embed", lambda texts, **kw: [[0.1] * 3 for _ in texts])
        return SimpleNamespace(db=db, vision=vision, fetched=fetched)

    return _setup


def post(client, token=None, **over):
    return client.post(
        "/api/ai/caption",
        headers={"Authorization": f"Bearer {token or sitter_token()}"},
        json={"pet_id": PET_ID, "media_id": MEDIA, **over},
    )


def test_a_photo_gets_a_caption_and_an_album_category(client, setup):
    ctx = setup({"caption": "\"Max sniffing autumn leaves with his tail going 🍂 #fall\"", "category": "walk"})
    body = post(client).json()
    assert body == {
        "caption": "Max sniffing autumn leaves with his tail going 🍂", "category": "walk",
        "source": "ai", "model": "vision-model", "latency_ms": 1234,
    }
    call = ctx.vision.calls[0]
    assert call["role"] == "vision" and call["endpoint"] == "caption" and call["max_tokens"] == 120 and call["timeout"] == 20.0
    content = call["messages"][-1]["content"]
    assert content[0] == {"type": "text", "text": "Pet: Max (dog)"} and content[1]["image_url"]["url"].startswith("data:image/jpeg")
    assert "Style notes for this sitter" in call["messages"][0]["content"]
    assert ctx.fetched == [(f"goldito/{PET_ID}/feed/abc", "image")]


def test_a_video_is_captioned_from_its_first_frame(client, setup):
    ctx = setup({"caption": "Max zooming across the yard!", "category": "play"}, db=make_db(media=[media_row(resource_type="video")]))
    assert post(client).json()["category"] == "play"
    assert ctx.fetched[0][1] == "video"


@pytest.mark.parametrize("given", ["Meal", " NAP ", "snack", "", None])
def test_the_category_is_always_one_of_the_five(client, setup, given):
    setup({"caption": "A sweet moment.", "category": given})
    assert post(client).json()["category"] in ("meal", "nap", "other")


def test_an_unknown_category_becomes_other_and_a_known_one_survives_casing(client, setup):
    setup({"caption": "x y.", "category": "snack"}, {"caption": "x y.", "category": " NAP "})
    assert post(client).json()["category"] == "other"
    assert post(client).json()["category"] == "nap"


def test_a_long_caption_is_cut_to_two_sentences(client, setup):
    long = "Max looks so happy in the sun. " * 10 + "The end."
    setup({"caption": long, "category": "play"})
    text = post(client).json()["caption"]
    assert len(text) <= 200 and text.count(".") <= 2


@pytest.mark.parametrize(
    "case",
    ["unavailable", "invalid", "fetch", "empty"],
)
def test_anything_going_wrong_is_still_a_200_with_the_fallback(client, setup, case):
    if case == "unavailable":
        ctx = setup(nebius.AIUnavailable("down"))
    elif case == "invalid":
        ctx = setup(nebius.AIInvalidOutput("bad"))
    elif case == "fetch":
        ctx = setup({"caption": "never used"}, fetch_error=cloudinary_service.MediaFetchError("gone"))
    else:
        ctx = setup({"caption": '  ""  ', "category": "walk"})
    response = post(client)
    assert response.status_code == 200
    assert response.json() == {"caption": "Max had a lovely moment today 🐾", "category": None, "source": "fallback", "model": "fallback", "latency_ms": 0}
    assert ctx.vision is not None


def test_someone_elses_or_unsuitable_media_is_refused(client, setup):
    for over in ({"uploaded_by": OWNER_ID}, {"pet_id": "other-pet"}, {"purpose": "task_proof"}):
        setup(db=make_db(media=[media_row(**over)]))
        assert post(client).status_code == 403
    setup(db=make_db(media=[]))
    assert post(client).status_code == 403


def test_an_unknown_pet_is_a_404(client, setup):
    setup(db=make_db(pets=[]))
    assert post(client).status_code == 404


def test_the_prompt_asks_for_a_caption_and_one_of_the_five_categories():
    prompt = load_prompt("caption/system.md")
    for word in ("meal", "walk", "nap", "play", "other", "No medical claims"):
        assert word in prompt


def test_only_a_sitter_on_duty_may_ask(client, monkeypatch):
    monkeypatch.setattr(ai_caption, "get_service_client", lambda: make_db())
    assert post(client, owner_token()).status_code == 403
