"""POST /api/ai/report-chips (phase-07 7.7): the day's records become chips with no model, photos go
through the vision model for a description + episode chips, and a slow or failed photo never blocks the rest."""

from types import SimpleNamespace

import pytest
from app.routers import ai_daily_report, ai_report_chips
from app.services import authz, nebius
from app.services import cloudinary as cloudinary_service

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_ai_daily_report import NOW, OTHER_SITTER, make_db
from tests.test_media_sign import PET_ID, SITTER_ID, sitter_token

isolated_settings = base.isolated_settings
client = base.client

M1, M2 = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"


def media_row(media_id: str, **over) -> dict:
    return {
        "id": media_id, "pet_id": PET_ID, "uploaded_by": SITTER_ID, "purpose": "report", "resource_type": "image",
        "cloudinary_public_id": f"goldito/{PET_ID}/report/{media_id[:4]}", **over,
    }


class Vision:
    """Stands in for nebius.chat_json: one answer per call, or an exception."""

    def __init__(self, *answers) -> None:
        self.answers = list(answers)
        self.calls: list[dict] = []

    def __call__(self, role, messages, schema, **kwargs):
        self.calls.append({"role": role, "messages": messages, **kwargs})
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return schema.model_validate(answer), SimpleNamespace(model="vision", latency_ms=300)


@pytest.fixture
def setup(monkeypatch):
    def _setup(*answers, db: FakeDB | None = None):
        db = db or make_db(media=[media_row(M1), media_row(M2)])
        vision = Vision(*answers)
        monkeypatch.setattr(ai_report_chips, "get_service_client", lambda: db)
        monkeypatch.setattr(ai_report_chips, "_now", lambda: NOW)
        monkeypatch.setattr(authz, "assert_on_duty_for", lambda user, pet_id: None)
        monkeypatch.setattr(nebius, "chat_json", vision)
        monkeypatch.setattr(cloudinary_service, "fetch_as_data_url", lambda *a, **k: "data:image/jpeg;base64,AAAA")
        return db, vision

    return _setup


def post(client, token=None, **body):
    return client.post(
        "/api/ai/report-chips",
        headers={"Authorization": f"Bearer {token or sitter_token()}"},
        json={"pet_id": PET_ID, **body},
    )


def labels(response) -> list[str]:
    return [c["label"] for c in response.json()["chips"]]


def test_the_days_records_become_chips_without_any_model_call(client, setup):
    _, vision = setup()
    response = post(client)
    assert response.status_code == 200
    assert vision.calls == []
    chips = {c["id"]: c for c in response.json()["chips"]}
    assert chips["rec-meal"] == {
        "id": "rec-meal", "kind": "record", "label": "Ate everything", "source": "checkin", "check": "meal", "value": "all", "media_id": None,
    }
    assert chips["rec-potty"]["label"] == "Normal potty" and chips["rec-walk"]["label"] == "Walk · 20 min"
    assert chips["rec-walk"]["value"] == "20"
    # The line above the chips: today's tasks (one done, the 14:30 walk missed) and this sitter's check-ins.
    assert response.json()["summary"] == {"tasks_done": 1, "tasks_missed": 1, "checkins": 4}
    assert chips["rec-meds"]["check"] == "meds" and chips["rec-meds"]["source"] == "task"
    # Episodes: the sitter's own check-in note and the shared feed caption — not the private post, not other sitters.
    assert "Met a golden retriever" in labels(response) and "Max sniffing autumn leaves" in labels(response)
    assert "Secret photo" not in labels(response)
    assert "rec-mood" not in chips  # the only mood check-in today is another sitter's


def test_a_photo_gives_a_description_and_episode_chips(client, setup):
    _, vision = setup({"description": "Max looking up at a squirrel", "chips": ["Watching a squirrel", "Park walk"]})
    response = post(client, media_ids=[M1])
    body = response.json()
    assert body["photos"] == [{"media_id": M1, "description": "Max looking up at a squirrel"}]
    vision_chips = [c for c in body["chips"] if c["source"] == "vision"]
    assert [c["label"] for c in vision_chips] == ["Watching a squirrel", "Park walk"]
    assert all(c["media_id"] == M1 and c["kind"] == "episode" for c in vision_chips)
    call = vision.calls[0]
    assert call["role"] == "vision" and call["endpoint"] == "report-chips"
    content = call["messages"][-1]["content"]
    assert content[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_two_photos_at_most_and_long_or_extra_chips_are_trimmed(client, setup):
    long = "A very long label that goes on and on forever and ever"
    setup({"description": "d", "chips": ["One", "Two", "Three", long]}, {"description": "", "chips": []})
    response = post(client, media_ids=[M1, M2])
    vision_labels = [c["label"] for c in response.json()["chips"] if c["source"] == "vision"]
    assert vision_labels == ["One", "Two"]
    assert response.json()["photos"] == [{"media_id": M1, "description": "d"}]  # an empty description is not kept
    assert post(client, media_ids=[M1, M2, "33333333-3333-4333-8333-333333333333"]).status_code == 422


def test_a_failed_photo_is_left_out_and_the_records_still_come(client, setup):
    setup(nebius.AIUnavailable("down"), {"description": "Max napping", "chips": ["Napping"]})
    response = post(client, media_ids=[M1, M2])
    assert response.status_code == 200
    assert [p["media_id"] for p in response.json()["photos"]] == [M2]
    assert "Ate everything" in labels(response) and "Napping" in labels(response)


def test_a_photo_that_cannot_be_fetched_is_left_out(client, setup, monkeypatch):
    setup()
    monkeypatch.setattr(
        cloudinary_service, "fetch_as_data_url", lambda *a, **k: (_ for _ in ()).throw(cloudinary_service.MediaFetchError("x"))
    )
    response = post(client, media_ids=[M1])
    assert response.status_code == 200 and response.json()["photos"] == []


@pytest.mark.parametrize(
    "row",
    [
        {"uploaded_by": OTHER_SITTER},
        {"pet_id": "other-pet"},
        {"resource_type": "video"},
        {"purpose": "safety_label"},
    ],
)
def test_someone_elses_or_unsuitable_media_is_refused(client, setup, row):
    setup(db=make_db(media=[media_row(M1, **row)]))
    assert post(client, media_ids=[M1]).status_code == 403


def test_an_unknown_media_id_is_refused(client, setup):
    setup(db=make_db(media=[]))
    assert post(client, media_ids=[M1]).status_code == 403


def test_a_quiet_day_has_no_chips_and_no_model_call(client, setup):
    db = make_db(care_checkins=[], task_logs=[], feed_posts=[], media=[])
    _, vision = setup(db=db)
    response = post(client)
    assert response.status_code == 200 and response.json() == {
        "summary": {"tasks_done": 0, "tasks_missed": 0, "checkins": 0}, "chips": [], "photos": [],
    }
    assert vision.calls == []


def test_a_sitter_not_on_duty_today_gets_403(client, setup):
    setup(db=make_db(pick_up="2026-10-15T12:30:00+00:00", booking_handoffs=[
        {"booking_id": "b1", "kind": "drop_off", "scheduled_at": "2026-10-14T12:00:00+00:00"},
        {"booking_id": "b1", "kind": "pick_up", "scheduled_at": "2026-10-14T20:00:00+00:00"},
    ], media=[]))
    assert post(client).status_code == 403


def test_it_requires_a_signed_in_user(client, setup):
    setup()
    assert client.post("/api/ai/report-chips", json={"pet_id": PET_ID}).status_code == 401
    assert ai_daily_report.load_day_records  # shared loader stays public for both routes
