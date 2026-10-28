"""POST /api/ai/diary-entry: an owner's own page from the chips they kept; a plain list when the model is down."""

from types import SimpleNamespace

import pytest
from app.routers import ai_diary_entry
from app.services import nebius

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_media_sign import OWNER_ID, PET_ID, owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client


class Chat:
    def __init__(self, *answers) -> None:
        self.answers = list(answers)
        self.calls: list[dict] = []

    def __call__(self, role, messages, **kwargs):
        self.calls.append({"role": role, "messages": messages, **kwargs})
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return SimpleNamespace(text=answer, model="report", latency_ms=200)


@pytest.fixture
def setup(monkeypatch):
    def _setup(*answers):
        db = FakeDB(pets=[{"id": PET_ID, "owner_id": OWNER_ID, "name": "Max", "species": "dog"}])
        chat = Chat(*answers)
        monkeypatch.setattr(ai_diary_entry, "get_service_client", lambda: db)
        monkeypatch.setattr("app.services.authz.get_service_client", lambda: db)
        monkeypatch.setattr(nebius, "chat", chat)
        return chat

    return _setup


def post(client, token=None, **body):
    return client.post("/api/ai/diary-entry", headers={"Authorization": f"Bearer {token or owner_token()}"}, json={"pet_id": PET_ID, **body})


def test_the_kept_chips_and_words_go_to_the_model_and_the_text_comes_back(client, setup):
    chat = setup("Max lay on a blanket today. We loved it.")
    response = post(client, chips=["Lying on a blanket"], note="A quiet one")
    assert response.status_code == 200
    assert response.json() == {"body": "Max lay on a blanket today. We loved it.", "fallback": False}
    sent = chat.calls[0]["messages"][1]["content"]
    assert "Lying on a blanket" in sent and "A quiet one" in sent and "Max" in sent


def test_a_model_that_is_down_gives_the_plain_list(client, setup):
    setup(nebius.AIUnavailable("down"))
    response = post(client, chips=["Lying on a blanket", "Sniffing a toy"], note="A quiet one")
    assert response.status_code == 200
    assert response.json() == {"body": "A quiet one\nMax: Lying on a blanket.\nMax: Sniffing a toy.", "fallback": True}


def test_nothing_to_write_from_is_refused(client, setup):
    chat = setup()
    assert post(client).status_code == 422
    assert chat.calls == []


def test_a_sitter_cannot_use_it(client, setup):
    setup()
    assert post(client, token=sitter_token(), chips=["x"]).status_code == 403
