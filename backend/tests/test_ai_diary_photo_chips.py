"""POST /api/ai/diary-photo-chips: the vision model reads the photos an owner put on their own diary page."""

from types import SimpleNamespace

import pytest
from app.routers import ai_diary_photo_chips
from app.services import cloudinary as cloudinary_service
from app.services import nebius

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_media_sign import OWNER_ID, PET_ID, owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client

M1 = "11111111-1111-4111-8111-111111111111"


def media_row(media_id: str, **over) -> dict:
    return {
        "id": media_id, "pet_id": PET_ID, "uploaded_by": OWNER_ID, "purpose": "feed", "resource_type": "image",
        "cloudinary_public_id": f"goldito/{PET_ID}/feed/{media_id[:4]}", **over,
    }


class Vision:
    def __init__(self, *answers) -> None:
        self.answers = list(answers)
        self.calls = 0

    def __call__(self, role, messages, schema, **kwargs):
        self.calls += 1
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return schema.model_validate(answer), SimpleNamespace(model="vision", latency_ms=300)


@pytest.fixture
def setup(monkeypatch):
    def _setup(*answers, media=None):
        db = FakeDB(pets=[{"id": PET_ID, "owner_id": OWNER_ID, "name": "Max"}], media=media if media is not None else [media_row(M1)])
        vision = Vision(*answers)
        monkeypatch.setattr(ai_diary_photo_chips, "get_service_client", lambda: db)
        monkeypatch.setattr("app.services.authz.get_service_client", lambda: db)
        monkeypatch.setattr(nebius, "chat_json", vision)
        monkeypatch.setattr(cloudinary_service, "fetch_as_data_url", lambda *a, **k: "data:image/jpeg;base64,AAAA")
        return vision

    return _setup


def post(client, token=None, **body):
    return client.post(
        "/api/ai/diary-photo-chips",
        headers={"Authorization": f"Bearer {token or owner_token()}"},
        json={"pet_id": PET_ID, "media_ids": [M1], **body},
    )


def test_a_photo_becomes_a_description_and_episode_chips(client, setup):
    setup({"description": "Max lying on a blanket", "chips": ["Lying on a blanket", "Sniffing a toy"]})
    response = post(client)
    assert response.status_code == 200
    body = response.json()
    assert [c["label"] for c in body["chips"]] == ["Lying on a blanket", "Sniffing a toy"]
    assert all(c["kind"] == "episode" and c["source"] == "vision" and c["media_id"] == M1 for c in body["chips"])
    assert body["photos"] == [{"media_id": M1, "description": "Max lying on a blanket"}]


def test_a_photo_that_fails_is_left_out(client, setup):
    setup(nebius.AIUnavailable("down"))
    response = post(client)
    assert response.status_code == 200
    assert response.json() == {"chips": [], "photos": []}


def test_only_the_owners_own_photo_of_this_pet(client, setup):
    vision = setup(media=[media_row(M1, uploaded_by="99999999-9999-4999-8999-999999999999")])
    assert post(client).status_code == 403
    assert vision.calls == 0


def test_a_sitter_cannot_use_it(client, setup):
    setup()
    assert post(client, token=sitter_token()).status_code == 403


def test_more_than_four_photos_are_refused(client, setup):
    setup()
    ids = [f"{i}1111111-1111-4111-8111-111111111111" for i in range(5)]
    assert post(client, media_ids=ids).status_code == 422
