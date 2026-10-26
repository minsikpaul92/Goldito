"""POST /api/ai/pet-review-chips (#407): the stay's sitter only, finished stays only, stay chips when the model is down,
and the facts come from this stay alone."""

import json
from types import SimpleNamespace

import pytest
from app.ai import pet_review as pr
from app.routers import ai_pet_review
from app.services import nebius

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_media_sign import OWNER_ID, SITTER_ID, owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client

BOOKING = "00000000-0000-4000-8000-0000000000e1"
MAX = "00000000-0000-4000-8000-0000000000c1"
MOCHI = "00000000-0000-4000-8000-0000000000c2"


def at(day: str, hh_mm: str = "12:00") -> str:
    return f"2026-10-{day}T{hh_mm}:00+00:00"


def make_db(*, finished: bool = True, **extra) -> FakeDB:
    tables = dict(
        bookings=[{"id": BOOKING, "owner_id": OWNER_ID, "sitter_id": SITTER_ID, "status": "confirmed"}],
        booking_handoffs=[
            {"booking_id": BOOKING, "kind": "drop_off", "status": "agreed", "scheduled_at": at("09"), "completed_at": at("09")},
            {"booking_id": BOOKING, "kind": "pick_up", "status": "agreed", "scheduled_at": at("12", "20:00"), "completed_at": at("12", "20:05") if finished else None},
        ],
        booking_pets=[{"booking_id": BOOKING, "pet_id": MAX}],
        pets=[{"id": MAX, "name": "Max", "species": "dog"}, {"id": MOCHI, "name": "Mochi", "species": "cat"}],
        care_checkins=[
            {"pet_id": MAX, "created_by": SITTER_ID, "kind": "meal", "value": "all", "created_at": at("10", "08:00")},
            {"pet_id": MAX, "created_by": SITTER_ID, "kind": "walk", "value": "30", "created_at": at("10", "09:00")},
            {"pet_id": MAX, "created_by": SITTER_ID, "kind": "mood", "value": "happy", "created_at": at("11", "09:00")},
            {"pet_id": MAX, "created_by": SITTER_ID, "kind": "nap", "value": None, "created_at": at("05", "09:00")},
            {"pet_id": MAX, "created_by": "someone-else", "kind": "mood", "value": "tired", "created_at": at("10", "10:00")},
        ],
        task_logs=[
            {"pet_id": MAX, "due_at": at("10", "12:00"), "status": "done"},
            {"pet_id": MAX, "due_at": at("01", "12:00"), "status": "done"},
        ],
        pet_life_records=[{"booking_id": BOOKING, "pet_id": MAX, "summary": {"behavior": "Excited by squirrels.", "eats": None, "sitter_tips": []}}],
    )
    tables.update(extra)
    return FakeDB(**tables)


class Model:
    def __init__(self, answer) -> None:
        self.answer = answer
        self.calls: list[dict] = []

    def __call__(self, role, messages, schema, **kwargs):
        self.calls.append({"role": role, "messages": messages, **kwargs})
        if isinstance(self.answer, Exception):
            raise self.answer
        return schema.model_validate(self.answer), SimpleNamespace(model="nano", latency_ms=300, text="")

    def facts(self) -> dict:
        return json.loads(self.calls[0]["messages"][-1]["content"])


@pytest.fixture
def setup(monkeypatch):
    def _setup(answer=None, db=None):
        db = db or make_db()
        model = Model(answer if answer is not None else {"chips": ["Chased every squirrel", "x" * 60]})
        monkeypatch.setattr(ai_pet_review, "get_service_client", lambda: db)
        monkeypatch.setattr(nebius, "chat_json", model)
        return SimpleNamespace(db=db, model=model)

    return _setup


def post(client, token=None, pet=MAX):
    return client.post(
        "/api/ai/pet-review-chips",
        headers={"Authorization": f"Bearer {token or sitter_token()}"},
        json={"booking_id": BOOKING, "pet_id": pet},
    )


def test_the_owner_gets_403_and_the_model_is_never_called(client, setup):
    s = setup()
    assert post(client, owner_token()).status_code == 403
    assert s.model.calls == []


def test_a_pet_not_in_the_stay_is_a_404(client, setup):
    setup()
    assert post(client, pet=MOCHI).status_code == 404


def test_a_stay_that_is_not_finished_is_a_409(client, setup):
    setup(db=make_db(finished=False))
    res = post(client)
    assert res.status_code == 409
    assert res.json()["detail"] == "stay_not_finished"


def test_model_chips_come_first_then_the_stay_and_general_ones(client, setup):
    s = setup()
    res = post(client)
    assert res.status_code == 200
    body = res.json()
    assert body["source"] == "ai"
    # The 60-character chip is dropped, never cut mid-phrase.
    assert body["chips"][:3] == ["Chased every squirrel", "Ate well every day", "Loved our walks"]
    assert len(body["chips"]) == pr.MAX_CHIPS
    assert s.model.calls[0]["role"] == "fast"


def test_only_this_sitter_and_this_stay_feed_the_facts(client, setup):
    s = setup()
    post(client)
    facts = s.model.facts()
    # The nap before the stay, the other person's mood and the task before the stay are left out.
    assert facts["checkins"] == {"meal": 1, "walk": 1, "mood": 1}
    assert facts["moods"] == {"happy": 1}
    assert facts["tasks_done"] == 1
    assert facts["life_record"] == {"behavior": "Excited by squirrels."}


def test_the_model_down_still_gives_the_stay_chips(client, setup):
    setup(answer=nebius.AIUnavailable("down"))
    body = post(client).json()
    assert body["source"] == "stay"
    assert body["chips"] == ["Ate well every day", "Loved our walks", "Always happy to see me", "Easy with the care routine", *pr.GENERAL]


def test_a_cat_with_nothing_logged_gets_the_general_chips():
    facts = pr.stay_facts({"name": "Mochi", "species": "cat"}, [{"kind": "walk", "value": "10"}], 0, None)
    assert pr.stay_chips(facts) == []
    assert pr.merge([], pr.stay_chips(facts)) == pr.GENERAL


def test_merge_drops_repeats_in_any_case():
    assert pr.merge(["loved our walks"], ["Loved our walks"]) == ["loved our walks", *pr.GENERAL]
