"""POST /api/ai/care-plan (phase-06 6.12): server rules over the model's draft, auth, error mapping."""

from types import SimpleNamespace

import pytest
from app.ai.care_plan import RawPlan, RawTask, normalize, to_hhmm
from app.routers import ai_care_plan
from app.services import authz, nebius

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_media_sign import PET_ID, owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client

CAT_ID = "00000000-0000-4000-8000-0000000000bb"
REAL_ASSERT_OWNER_OF = authz.assert_owner_of  # the fixtures below replace it; this test needs the real one


def raw(*tasks: RawTask, cautions: list[str] | None = None) -> RawPlan:
    return RawPlan(tasks=list(tasks), cautions=cautions or [])


def task(type_: str, time: str | None, title: str | None = None, **kw) -> RawTask:
    return RawTask(type=type_, time=time, title=title, **kw)


# --- the pure rules ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("8:00 AM", "08:00"),
        ("8am", "08:00"),
        ("2 PM", "14:00"),
        ("12:30 pm", "12:30"),
        ("12 AM", "00:00"),
        ("14:00", "14:00"),
        ("8:05", "08:05"),
        ("25:00", None),
        ("13 pm", None),
        ("noon", None),
        ("", None),
        (None, None),
    ],
)
def test_times_become_hhmm(value, expected):
    assert to_hhmm(value) == expected


def test_a_cat_gets_no_walk_and_a_dog_no_litter():
    cat = normalize(raw(task("walk", "17:00", "Walk"), task("litter", "20:00", "Litter")), "cat")
    assert [t["type"] for t in cat.tasks] == ["litter"]
    assert cat.skipped == [{"type": "walk", "title": "Walk", "reason": "Cats don't go on walks."}]
    dog = normalize(raw(task("litter", "20:00", "Litter"), task("walk", "17:00", "Walk")), "dog")
    assert [t["type"] for t in dog.tasks] == ["walk"]
    assert dog.skipped[0]["reason"] == "Dogs don't use a litter box."


def test_unknown_types_and_missing_times_are_left_out_with_a_reason():
    plan = normalize(raw(task("grooming", "10:00"), task("feeding", None, "Dinner"), task("feeding", "soon")), "dog")
    assert plan.tasks == []
    assert [s["reason"] for s in plan.skipped] == [
        "Not a task type Pawddy knows.",
        "No clock time was given.",
        "No clock time was given.",
    ]


def test_duplicates_collapse_and_tasks_are_sorted_by_time():
    plan = normalize(
        raw(
            task("feeding", "18:00", "Dinner"),
            task("feeding", "8am", "Breakfast"),
            task("feeding", "6:00 PM", "dinner"),  # same task, written differently
        ),
        "dog",
    )
    assert [(t["time"], t["title"]) for t in plan.tasks] == [("08:00", "Breakfast"), ("18:00", "Dinner")]


def test_text_is_trimmed_and_capped_and_missing_titles_get_a_default():
    plan = normalize(
        raw(
            task("medication", "9:00", None, dose="  1   pill  ", notes="x" * 300),
            cautions=["  No   chicken  ", "no chicken", "y" * 150],
        ),
        "dog",
    )
    t = plan.tasks[0]
    assert (t["title"], t["dose"], len(t["notes"])) == ("Medication", "1 pill", 200)
    assert plan.cautions[0] == "No chicken" and len(plan.cautions) == 2 and len(plan.cautions[1]) == 100


def test_task_and_caution_counts_are_capped():
    many = [task("feeding", f"{h:02d}:00", f"Meal {h}") for h in range(1, 16)]
    plan = normalize(raw(*many, cautions=[f"Careful {i}" for i in range(12)]), "dog")
    assert len(plan.tasks) == 12 and len(plan.cautions) == 8
    assert sum(1 for s in plan.skipped if s["reason"] == "Too many tasks in one request.") == 3


# --- the endpoint -----------------------------------------------------------------------------


@pytest.fixture
def pets(monkeypatch):
    db = FakeDB(
        pets=[
            {"id": PET_ID, "name": "Max", "species": "dog"},
            {"id": CAT_ID, "name": "Mochi", "species": "cat"},
        ]
    )
    monkeypatch.setattr(ai_care_plan, "get_service_client", lambda: db)
    monkeypatch.setattr(authz, "assert_owner_of", lambda user, pet_id: None)
    return db


def fake_model(monkeypatch, plan: RawPlan, seen: list | None = None):
    def chat_json(role, messages, schema, **kwargs):
        if seen is not None:
            seen.append((role, messages, kwargs))
        return plan, SimpleNamespace(model="nvidia/report-model", latency_ms=321)

    monkeypatch.setattr(nebius, "chat_json", chat_json)


def post(client, token, pet_id=PET_ID, text="Meals: 8:00 AM — 1 cup of kibble"):
    return client.post(
        "/api/ai/care-plan",
        headers={"Authorization": f"Bearer {token}"},
        json={"pet_id": pet_id, "text": text},
    )


def test_the_documented_example_becomes_a_checklist_and_heads_ups(client, pets, monkeypatch):
    seen: list = []
    fake_model(
        monkeypatch,
        raw(
            task("medication", "2:00 PM", "Skin pill", dose="1 skin pill, hidden in a lickable treat"),
            task("feeding", "08:00", "Breakfast", dose="1 cup of kibble"),
            cautions=["No knocking or doorbell — text me instead.", "Keep other dogs away on walks."],
        ),
        seen,
    )
    response = post(client, owner_token())
    assert response.status_code == 200
    body = response.json()
    assert [(t["type"], t["time"]) for t in body["tasks"]] == [("feeding", "08:00"), ("medication", "14:00")]
    assert len(body["cautions"]) == 2 and body["skipped"] == []
    assert (body["model"], body["latency_ms"]) == ("nvidia/report-model", 321)
    # The pet's name and species go to the model; the report role is used.
    role, messages, kwargs = seen[0]
    assert role == "report" and "Max (dog)" in messages[1]["content"] and kwargs["endpoint"] == "care-plan"


def test_a_cat_walk_comes_back_skipped(client, pets, monkeypatch):
    fake_model(monkeypatch, raw(task("walk", "17:00", "Walk"), task("feeding", "07:00", "Breakfast")))
    body = post(client, owner_token(), pet_id=CAT_ID, text="walk at 5 PM, breakfast 7").json()
    assert [t["type"] for t in body["tasks"]] == ["feeding"]
    assert body["skipped"][0]["reason"] == "Cats don't go on walks."


def test_nothing_is_saved(client, pets, monkeypatch):
    fake_model(monkeypatch, raw(task("feeding", "08:00", "Breakfast")))
    before = {name: list(rows) for name, rows in pets.tables.items()}
    assert post(client, owner_token()).status_code == 200
    assert pets.tables == before


def test_someone_who_does_not_own_the_pet_is_refused(client, pets, monkeypatch):
    from fastapi import HTTPException

    def deny(user, pet_id):
        raise HTTPException(status_code=403, detail="That is not your pet.")

    monkeypatch.setattr(authz, "assert_owner_of", deny)
    fake_model(monkeypatch, raw())
    assert post(client, owner_token()).status_code == 403


def test_a_sitter_is_refused(client, pets, monkeypatch):
    # The real guard, not the stub: only owners may ask.
    monkeypatch.setattr(authz, "assert_owner_of", REAL_ASSERT_OWNER_OF)
    response = post(client, sitter_token())
    assert response.status_code == 403


def test_text_must_be_present_and_at_most_2000_characters(client, pets, monkeypatch):
    fake_model(monkeypatch, raw())
    assert post(client, owner_token(), text="").status_code == 422
    assert post(client, owner_token(), text="x" * 2001).status_code == 422
    assert post(client, owner_token(), text="x" * 2000).status_code == 200


def test_unknown_pet_is_404(client, pets, monkeypatch):
    fake_model(monkeypatch, raw())
    assert post(client, owner_token(), pet_id="00000000-0000-4000-8000-000000000999").status_code == 404


def test_model_trouble_is_mapped_to_helpful_errors(client, pets, monkeypatch):
    def unavailable(*a, **k):
        raise nebius.AIUnavailable("down")

    monkeypatch.setattr(nebius, "chat_json", unavailable)
    unavailable_response = post(client, owner_token())
    assert unavailable_response.status_code == 503
    assert "add tasks by hand" in unavailable_response.json()["detail"]

    def invalid(*a, **k):
        raise nebius.AIInvalidOutput("bad")

    monkeypatch.setattr(nebius, "chat_json", invalid)
    assert post(client, owner_token()).status_code == 502

