"""POST /api/ai/pet-mood (Phase 12.2a, D61): crops → vision tags → rule percentages → one "seems" line per pet."""

import base64
from types import SimpleNamespace

import pytest
from app.routers import ai_pet_mood
from app.services import authz, nebius
from fastapi import HTTPException

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_media_sign import PET_ID, owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client

SLEEPING = {"species": "dog", "ears": "relaxed", "eyes": "closed", "mouth": "closed_relaxed", "posture": "curled_up", "activity": "sleeping"}
HAPPY = {"species": "dog", "ears": "relaxed", "eyes": "soft", "mouth": "open_relaxed", "tail": "wagging", "body_tension": "relaxed"}
PLAYING = {"species": "dog", "ears": "forward", "mouth": "holding_toy", "tail": "high_wagging", "posture": "play_bow", "activity": "playing"}


def image(tag: str) -> str:
    """A tiny distinct data URL per crop, so the fake model can answer per crop whatever order the threads run in."""
    return "data:image/jpeg;base64," + base64.b64encode(tag.encode()).decode()


def crop(tag: str, x: float = 0.1) -> dict:
    return {"box": {"x": x, "y": 0.2, "w": 0.3, "h": 0.4}, "image": image(tag)}


class Models:
    """Stands in for nebius.chat_json: vision answers by crop image, the fast model answers the summaries."""

    def __init__(self, tags: dict[str, object], summaries=None) -> None:
        self.tags = tags
        self.summaries = summaries
        self.calls: list[dict] = []

    def __call__(self, role, messages, schema, **kwargs):
        self.calls.append({"role": role, "messages": messages, **kwargs})
        if role == "vision":
            url = messages[1]["content"][1]["image_url"]["url"]
            answer = self.tags[base64.b64decode(url.split(",", 1)[1]).decode()]
        else:
            answer = self.summaries
        if isinstance(answer, Exception):
            raise answer
        return schema.model_validate(answer), SimpleNamespace(model=f"{role}-model", latency_ms=300)


@pytest.fixture
def setup(monkeypatch):
    def _setup(tags, summaries=None, *, owner_ok=True, on_duty=True):
        db = FakeDB(pets=[{"id": PET_ID, "name": "Max", "species": "dog"}])
        models = Models(tags, summaries if summaries is not None else {"summaries": ["Max seems happy and a little relaxed."]})

        def owner_of(user, pet_id):
            if not owner_ok:
                raise HTTPException(status_code=403, detail="That is not your pet.")

        def duty(user, pet_id):
            if not on_duty:
                raise HTTPException(status_code=403, detail="You are not on duty for this pet.")

        monkeypatch.setattr(ai_pet_mood, "get_service_client", lambda: db)
        monkeypatch.setattr(authz, "assert_owner_of", owner_of)
        monkeypatch.setattr(authz, "assert_on_duty_for", duty)
        monkeypatch.setattr(nebius, "chat_json", models)
        return models

    return _setup


def post(client, frames, token=None, **over):
    return client.post(
        "/api/ai/pet-mood",
        headers={"Authorization": f"Bearer {token or owner_token()}"},
        json={"frames": frames, **over},
    )


def test_one_photo_one_pet_gives_eight_percentages_a_line_and_the_disclaimer(client, setup):
    models = setup({"a": HAPPY})
    res = post(client, [{"index": 0, "crops": [crop("a")]}], pet_id=PET_ID)
    assert res.status_code == 200
    body = res.json()
    assert body["disclaimer"] == "For fun only — not a behavior or health assessment."
    [pet] = body["pets"]
    assert set(pet["emotions"]) == {"happy", "relaxed", "excited", "curious", "sleepy", "anxious", "angry", "sad"}
    assert sum(pet["emotions"].values()) == 100
    assert pet["top"] == "happy"
    assert pet["summary"] == "Max seems happy and a little relaxed."
    assert pet["box"] == {"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4} and pet["frame"] == 0 and pet["frames_used"] == 1
    roles = [c["role"] for c in models.calls]
    assert roles == ["vision", "fast"]
    vision = models.calls[0]
    assert vision["endpoint"] == "pet-mood-vision" and vision["temperature"] == 0.0
    # The prompt lists the allowed tags and asks for no numbers; the summary gets the pet's name and top moods.
    assert '"open_relaxed"' in vision["messages"][0]["content"] and "never give numbers" in vision["messages"][0]["content"]
    assert '"name": "Max"' in models.calls[1]["messages"][1]["content"]


def test_tug_of_war_reads_as_excited_and_the_summary_hears_it_is_play(client, setup):
    tug = {"species": "dog", "ears": "relaxed", "eyes": "soft", "mouth": "open_relaxed", "posture": "sitting",
           "body_tension": "relaxed", "activity": "watching", "toy": "in_mouth"}
    models = setup({"a": tug}, {"summaries": ["Max looks excited about this tug game."]})
    [pet] = post(client, [{"index": 0, "crops": [crop("a")]}], pet_id=PET_ID).json()["pets"]
    assert pet["top"] == "excited"
    assert '"activity": "playing"' in models.calls[1]["messages"][1]["content"]
    assert '"in_mouth"' in models.calls[0]["messages"][0]["content"]


def test_the_same_photo_twice_gives_the_same_percentages(client, setup):
    setup({"a": HAPPY})
    first = post(client, [{"index": 0, "crops": [crop("a")]}]).json()["pets"][0]["emotions"]
    second = post(client, [{"index": 0, "crops": [crop("a")]}]).json()["pets"][0]["emotions"]
    assert first == second


def test_two_dogs_in_one_photo_get_a_box_and_a_table_each(client, setup):
    setup({"left": SLEEPING, "right": PLAYING}, {"summaries": ["This pup seems sleepy.", "This pup looks excited to play."]})
    body = post(client, [{"index": 0, "crops": [crop("left", 0.05), crop("right", 0.6)]}], pet_id=PET_ID).json()
    assert [p["top"] for p in body["pets"]] == ["sleepy", "excited"]
    assert [p["box"]["x"] for p in body["pets"]] == [0.05, 0.6]
    assert all(sum(p["emotions"].values()) == 100 for p in body["pets"])
    assert [p["summary"] for p in body["pets"]] == ["This pup seems sleepy.", "This pup looks excited to play."]


def test_a_video_averages_its_frames_and_shows_the_most_typical_one(client, setup):
    setup({"f0": SLEEPING, "f1": HAPPY, "f2": HAPPY, "f3": PLAYING})
    frames = [{"index": i, "crops": [crop(f"f{i}", 0.1 * (i + 1))]} for i in (3, 0, 2, 1)]  # any order
    [pet] = post(client, frames).json()["pets"]
    assert pet["frames_used"] == 4 and sum(pet["emotions"].values()) == 100
    assert pet["top"] == "happy"
    assert pet["frame"] in (1, 2)
    assert pet["box"]["x"] == pytest.approx(0.1 * (pet["frame"] + 1))


def test_a_crop_the_model_cannot_read_or_that_shows_no_pet_is_left_out(client, setup):
    setup({"ok": HAPPY, "down": nebius.AIUnavailable("x"), "empty": {"species": "none"}})
    frames = [{"index": 0, "crops": [crop("ok")]}, {"index": 1, "crops": [crop("down")]}, {"index": 2, "crops": [crop("empty")]}]
    [pet] = post(client, frames).json()["pets"]
    assert pet["frames_used"] == 1 and pet["frame"] == 0


def test_no_pet_found_is_a_422_and_the_model_down_is_a_503(client, setup):
    setup({"empty": {"species": "none"}})
    res = post(client, [{"index": 0, "crops": [crop("empty")]}])
    assert res.status_code == 422 and "couldn't find a pet" in res.json()["detail"]
    setup({"down": nebius.AIUnavailable("x")})
    assert post(client, [{"index": 0, "crops": [crop("down")]}]).status_code == 503


@pytest.mark.parametrize(
    "line",
    ["Max seems to be in pain.", "Max looks a bit sick today.", "Max is happy.", "Ask your vet — Max seems tired.", "x" * 150],
    ids=["pain", "sick", "no seems", "vet", "too long"],
)
def test_a_summary_with_health_words_or_without_seems_falls_back_to_the_rule_sentence(client, setup, line):
    setup({"a": SLEEPING}, {"summaries": [line]})
    [pet] = post(client, [{"index": 0, "crops": [crop("a")]}], pet_id=PET_ID).json()["pets"]
    assert pet["summary"].startswith("Max seems sleepy")


def test_a_chill_summary_is_kept(client, setup):
    setup({"a": HAPPY}, {"summaries": ["Max seems chill and happy 😊"]})
    assert post(client, [{"index": 0, "crops": [crop("a")]}], pet_id=PET_ID).json()["pets"][0]["summary"] == "Max seems chill and happy 😊"


def test_the_summary_model_down_still_answers_with_rule_sentences(client, setup):
    setup({"a": HAPPY}, nebius.AIUnavailable("x"))
    [pet] = post(client, [{"index": 0, "crops": [crop("a")]}]).json()["pets"]
    assert pet["summary"].startswith("This pup seems happy")


@pytest.mark.parametrize(
    "frames",
    [
        [],
        [{"index": 0, "crops": []}],
        [{"index": 0, "crops": [crop(str(i)) for i in range(9)]}],
        [{"index": i, "crops": [crop("a")]} for i in range(5)],
        [{"index": 0, "crops": [{"box": {"x": 0, "y": 0, "w": 0.5, "h": 0.5}, "image": "https://example.com/dog.jpg"}]}],
        [{"index": 0, "crops": [{"box": {"x": 0, "y": 0, "w": 0.5, "h": 0.5}, "image": "data:image/jpeg;base64," + base64.b64encode(b"\0" * 300_001).decode()}]}],
        [{"index": 0, "crops": [{"box": {"x": 0, "y": 0, "w": 1.5, "h": 0.5}, "image": image("a")}]}],
    ],
    ids=["no frames", "no crops", "nine crops", "five frames", "not a data url", "too big", "box out of range"],
)
def test_bad_requests_are_refused_before_any_model_call(client, setup, frames):
    models = setup({"a": HAPPY})
    assert post(client, frames).status_code == 422
    assert models.calls == []


def test_a_named_pet_must_be_mine_or_in_my_care(client, setup):
    models = setup({"a": HAPPY}, owner_ok=False)
    assert post(client, [{"index": 0, "crops": [crop("a")]}], pet_id=PET_ID).status_code == 403
    setup({"a": HAPPY}, on_duty=False)
    assert post(client, [{"index": 0, "crops": [crop("a")]}], sitter_token(), pet_id=PET_ID).status_code == 403
    assert models.calls == []
    # Without a pet anyone signed in may try it (nothing is saved).
    setup({"a": HAPPY})
    assert post(client, [{"index": 0, "crops": [crop("a")]}], sitter_token()).status_code == 200


def test_signed_out_is_refused(client):
    assert client.post("/api/ai/pet-mood", json={"frames": [{"index": 0, "crops": [crop("a")]}]}).status_code == 401
