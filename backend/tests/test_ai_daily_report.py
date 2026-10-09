"""POST /api/ai/daily-report (phase-07 7.2): the source_snapshot is the model's whole input, drafts upsert,
a sent report is never rewritten, and only the sitter who has the pet that day can ask."""

import json
from datetime import UTC, date, datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from app.ai.daily_report import age_years, clean_chips, tidy_body
from app.routers import ai_daily_report
from app.services import authz, nebius
from fastapi import HTTPException

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_media_sign import PET_ID, SITTER_ID, owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client

REAL_ASSERT_ON_DUTY = authz.assert_on_duty_for
OTHER_SITTER = "00000000-0000-4000-8000-000000000009"
NOW = datetime(2026, 10, 15, 20, 0, tzinfo=UTC)  # 16:00 in Toronto (EDT)
TODAY = date(2026, 10, 15)


def at(hh_mm: str, day: str = "2026-10-15") -> str:
    """A UTC instant on the test day."""
    return f"{day}T{hh_mm}:00+00:00"


def make_db(*, pick_up: str = "2026-10-16T12:00:00+00:00", **extra) -> FakeDB:
    tables = dict(
        pets=[
            {
                "id": PET_ID, "name": "Max", "species": "dog", "breed": "Maltese", "birthdate": "2022-03-01",
                "notes": "Loves squirrels, shy with strangers",
            }
        ],
        pet_allergies=[{"pet_id": PET_ID, "allergen": "chicken"}, {"pet_id": "other-pet", "allergen": "beef"}],
        pet_cautions=[
            {"pet_id": PET_ID, "text": "No knocking — text me instead", "active": True},
            {"pet_id": PET_ID, "text": "Switched off", "active": False},
        ],
        bookings=[{"id": "b1", "sitter_id": SITTER_ID, "status": "confirmed"}],
        booking_pets=[{"booking_id": "b1", "pet_id": PET_ID}],
        booking_handoffs=[
            {"booking_id": "b1", "kind": "drop_off", "scheduled_at": "2026-10-15T12:00:00+00:00"},
            {"booking_id": "b1", "kind": "pick_up", "scheduled_at": pick_up},
        ],
        care_tasks=[
            {
                "id": "t-med", "pet_id": PET_ID, "type": "medication", "title": "Heartworm pill",
                "dose": "1 pill, hidden in a lickable treat", "notes": None,
            },
            {"id": "t-walk", "pet_id": PET_ID, "type": "walk", "title": "Walk", "dose": "20 minutes", "notes": "Avoid the dog park"},
            {"id": "t-dinner", "pet_id": PET_ID, "type": "feeding", "title": "Dinner"},
        ],
        task_logs=[
            {"task_id": "t-med", "pet_id": PET_ID, "due_at": at("12:00"), "status": "done", "completed_at": at("12:04")},
            {"task_id": "t-walk", "pet_id": PET_ID, "due_at": at("14:30"), "status": "pending", "completed_at": None},
            {"task_id": "t-dinner", "pet_id": PET_ID, "due_at": at("22:00"), "status": "pending", "completed_at": None},
        ],
        care_checkins=[
            {"pet_id": PET_ID, "created_by": SITTER_ID, "kind": "meal", "value": "all", "note_text": None, "media_id": None, "created_at": at("12:15")},
            {"pet_id": PET_ID, "created_by": SITTER_ID, "kind": "potty", "value": "normal", "note_text": None, "media_id": None, "created_at": at("15:02")},
            {"pet_id": PET_ID, "created_by": SITTER_ID, "kind": "walk", "value": "20", "note_text": None, "media_id": None, "created_at": at("14:00")},
            {"pet_id": PET_ID, "created_by": SITTER_ID, "kind": "note", "value": None, "note_text": "Met a golden retriever", "media_id": "m1", "created_at": at("18:10")},
            # Not today's / not this sitter's / not in the sitter's hours:
            {"pet_id": PET_ID, "created_by": SITTER_ID, "kind": "mood", "value": "tired", "note_text": None, "media_id": None, "created_at": at("15:00", "2026-10-14")},
            {"pet_id": PET_ID, "created_by": OTHER_SITTER, "kind": "mood", "value": "happy", "note_text": None, "media_id": None, "created_at": at("16:00")},
        ],
        feed_posts=[
            {"pet_id": PET_ID, "posted_by": SITTER_ID, "visibility": "shared", "caption": "Max sniffing autumn leaves", "created_at": at("14:55")},
            {"pet_id": PET_ID, "posted_by": SITTER_ID, "visibility": "private", "caption": "Secret photo", "created_at": at("15:00")},
        ],
        daily_reports=[],
    )
    tables.update(extra)
    return FakeDB(**tables)


class Model:
    """Stands in for nebius.chat: records what it was given, answers with `text`."""

    def __init__(self, text: str = "I loved today with Max! 🐶") -> None:
        self.text = text
        self.queue: list[str] = []  # answers to give first, one per call, before falling back to `text`
        self.calls: list[dict] = []

    def __call__(self, role, messages, **kwargs):
        self.calls.append({"role": role, "messages": [dict(m) for m in messages], **kwargs})
        text = self.queue.pop(0) if self.queue else self.text
        return SimpleNamespace(text=text, model="nvidia/report-model", latency_ms=410)

    @property
    def snapshot(self) -> dict:
        return json.loads(self.calls[-1]["messages"][-1]["content"])


@pytest.fixture
def setup(monkeypatch):
    def _setup(db: FakeDB | None = None, text: str = "I loved today with Max! 🐶"):
        db = db or make_db()
        model = Model(text)
        monkeypatch.setattr(ai_daily_report, "get_service_client", lambda: db)
        monkeypatch.setattr(ai_daily_report, "_now", lambda: NOW)
        monkeypatch.setattr(authz, "assert_on_duty_for", lambda user, pet_id: None)
        monkeypatch.setattr(nebius, "chat", model)
        monkeypatch.setattr(nebius, "embed", lambda texts, **kw: [[0.1] * 3 for _ in texts])
        return db, model

    return _setup


def post(client, token=None, **body):
    return client.post(
        "/api/ai/daily-report",
        headers={"Authorization": f"Bearer {token or sitter_token()}"},
        json={"pet_id": PET_ID, **body},
    )


# --- the snapshot: the model's whole input ------------------------------------------------------


def test_the_snapshot_holds_todays_records_and_what_the_sitter_kept(client, setup):
    _, model = setup()
    response = post(client, chips=["Watching a squirrel", "Park walk"], sitter_note="She got so excited", photos=["Max looking up at a squirrel"])
    assert response.status_code == 200
    snap = model.snapshot
    # The owner's own information about the pet is part of it (active Heads-ups and this pet's allergies only).
    assert snap["pet"] == {
        "species": "dog",
        "name": "Max",
        "breed": "Maltese",
        "age_years": 4,
        "owner_notes": "Loves squirrels, shy with strangers",
        "allergies": ["chicken"],
        "heads_up": ["No knocking — text me instead"],
    }
    assert snap["date"] == "2026-10-15"
    # Done and missed tasks only (the 22:00 dinner is in the future), in the app's timezone.
    assert snap["tasks"] == [
        {
            "type": "medication", "title": "Heartworm pill", "due": "08:00", "status": "done", "completed_at": "08:04",
            "owner_dose": "1 pill, hidden in a lickable treat",  # what the owner asked for
        },
        {"type": "walk", "title": "Walk", "due": "10:30", "status": "missed", "owner_dose": "20 minutes", "owner_notes": "Avoid the dog park"},
    ]
    assert snap["checks"] == {"meal": "all", "potty": "normal", "walk_minutes": 20, "meds": "done"}
    assert [c["kind"] for c in snap["checkins"]] == ["meal", "walk", "potty", "note"]  # only this sitter, only today
    assert snap["checkins"][-1] == {"time": "14:10", "kind": "note", "has_photo": True, "note_text": "Met a golden retriever"}
    assert snap["photos"] == [
        {"time": "10:55", "caption": "Max sniffing autumn leaves", "source": "feed"},  # the private post is not here
        {"time": "16:00", "caption": "Max looking up at a squirrel", "source": "report"},
    ]
    assert snap["chips"] == ["Watching a squirrel", "Park walk"] and snap["sitter_note"] == "She got so excited"


def test_a_corrected_value_replaces_the_recorded_one_everywhere_in_the_snapshot(client, setup):
    _, model = setup()
    response = post(client, overrides={"meal": "most", "walk": "35", "mood": "calm", "bogus": "x", "potty": "wet"})
    assert response.status_code == 200
    snap = model.snapshot
    # Allowed values only: bogus kinds and values are dropped. Mood had no check-in today, so it stays absent.
    assert snap["checks"] == {"meal": "most", "potty": "normal", "walk_minutes": 35, "meds": "done"}
    assert [(c["kind"], c.get("value")) for c in snap["checkins"] if c["kind"] in ("meal", "walk")] == [("meal", "most"), ("walk", "35")]


def test_the_report_prompt_carries_the_sitters_style_notes(client, setup):
    db = make_db()
    db.tables["sitter_profiles"] = [{"id": SITTER_ID, "style_card": "Breezy, one paw emoji."}]
    _, model = setup(db)
    post(client)
    assert "Style notes for this sitter: Breezy, one paw emoji." in model.calls[0]["messages"][0]["content"]


def test_the_model_gets_the_report_prompt_and_the_snapshot_and_nothing_else(client, setup):
    _, model = setup()
    post(client)
    call = model.calls[0]
    assert call["role"] == "report" and call["endpoint"] == "daily-report" and call["max_tokens"] == 400
    roles = [m["role"] for m in call["messages"]]
    assert roles[0] == "system" and roles[-1] == "user"
    # The worked examples sit between them as user/assistant pairs, in the same JSON shape.
    assert roles[1:-1] == ["user", "assistant"] * ((len(roles) - 2) // 2) and len(roles) > 2
    assert "say only what the JSON says" in call["messages"][0]["content"]
    assert set(json.loads(call["messages"][1]["content"])) == set(model.snapshot)


def test_a_check_the_sitter_turned_off_never_reaches_the_model(client, setup):
    _, model = setup()
    post(client, skip=["potty", "meds"])
    snap = model.snapshot
    assert "potty" not in snap["checks"] and "meds" not in snap["checks"]
    assert all(c["kind"] != "potty" for c in snap["checkins"])
    assert all(t["type"] != "medication" for t in snap["tasks"])
    assert "meal" in snap["checks"]  # what stayed on is still there


def with_episodes(db: FakeDB) -> FakeDB:
    """Two notes (one on a meal check-in), a shared photo, and a check-in photo's automatic caption."""
    db.tables["care_checkins"] += [
        {"id": "c-note2", "pet_id": PET_ID, "created_by": SITTER_ID, "kind": "note", "value": None, "note_text": "Threw up a little after lunch", "media_id": None, "created_at": at("17:00")},
        {"id": "c-meal2", "pet_id": PET_ID, "created_by": SITTER_ID, "kind": "meal", "value": "most", "note_text": "Left the carrots", "media_id": None, "created_at": at("19:00")},
    ]
    db.tables["feed_posts"] += [
        {"id": "f-park", "pet_id": PET_ID, "posted_by": SITTER_ID, "visibility": "shared", "caption": "Zoomies at the park", "caption_source": "ai", "created_at": at("16:30")},
        {"id": "f-task", "pet_id": PET_ID, "posted_by": SITTER_ID, "visibility": "shared", "caption": "🍽️ Dinner — done", "caption_source": "task", "created_at": at("19:05")},
    ]
    return db


def model_input(model) -> str:
    return model.calls[-1]["messages"][-1]["content"]


def test_a_turned_off_note_chip_never_reaches_the_model(client, setup):
    _, model = setup(with_episodes(make_db()))
    assert post(client, off=["note-c-note2", "note-c-meal2"]).status_code == 200
    assert "Threw up" not in model_input(model) and "carrots" not in model_input(model)
    # The note check-in is gone; the meal check-in stays with its value, only its note is dropped.
    assert all(c.get("note_text") != "Threw up a little after lunch" for c in model.snapshot["checkins"])
    assert {"kind": "meal", "value": "most"}.items() <= next(c for c in model.snapshot["checkins"] if c["time"] == "15:00").items()
    assert "Met a golden retriever" in model_input(model)  # a note still on stays


def test_a_turned_off_feed_chip_never_reaches_the_model(client, setup):
    _, model = setup(with_episodes(make_db()))
    post(client, off=["feed-f-park", "feed-unknown", "rec-meal"])  # unknown ids are ignored
    assert "Zoomies" not in model_input(model) and "Max sniffing autumn leaves" in model_input(model)
    assert model.snapshot["checks"]["meal"] == "most"  # `off` is for episodes; records are turned off with `skip`


def test_a_task_photo_caption_is_not_a_separate_fact(client, setup):
    _, model = setup(with_episodes(make_db()))
    post(client, skip=["meal"])
    assert "Dinner — done" not in model_input(model)  # it would bring the turned-off meal back
    assert [p["caption"] for p in model.snapshot["photos"]] == ["Max sniffing autumn leaves", "Zoomies at the park"]


def test_the_model_never_sees_the_internal_chip_refs_but_the_draft_keeps_them(client, setup):
    db, model = setup(with_episodes(make_db()))
    post(client, off=["note-c-note2"])
    assert "_ref" not in model_input(model) and "c-meal2" not in model_input(model)
    saved = db.tables["daily_reports"][0]
    assert saved["inputs"]["off"] == ["note-c-note2"]
    assert any(p.get("_ref") == "feed-f-park" for p in saved["source_snapshot"]["photos"])


def test_without_chips_note_or_photos_the_days_records_still_make_a_report(client, setup):
    db, model = setup()
    assert post(client).status_code == 200
    snap = model.snapshot
    assert snap["chips"] == [] and snap["sitter_note"] is None
    assert all(p["source"] == "feed" for p in snap["photos"])


def test_a_day_with_nothing_recorded_is_a_fixed_line_and_the_model_is_not_asked(client, setup):
    db = make_db(task_logs=[], care_checkins=[], feed_posts=[])
    db, model = setup(db)
    body = post(client).json()
    assert model.calls == []  # nothing to say → nothing it could invent
    assert body["model"] == "template" and body["status"] == "draft"
    assert "nothing special to report" in body["body"] and "Max" in body["body"]
    # The owner's notes, allergies and Heads-ups are background: on their own they are not a day's facts.
    assert "chicken" not in body["body"] and "squirrel" not in body["body"]
    assert db.tables["daily_reports"][0]["model"] == "template"
    # …but a chip or a note is a fact, so then the model writes.
    post(client, chips=["Nap in the sun"])
    assert len(model.calls) == 1


def test_only_the_hours_this_sitter_had_the_pet_are_reported(client, setup):
    # Picked up at 15:00 UTC (11:00 local): the walk's due time (14:30 UTC) is in, the 15:02 potty is out.
    _, model = setup(make_db(pick_up="2026-10-15T15:00:00+00:00"))
    post(client)
    snap = model.snapshot
    assert [c["kind"] for c in snap["checkins"]] == ["meal", "walk"]
    assert [t["type"] for t in snap["tasks"]] == ["medication", "walk"]
    assert "potty" not in snap["checks"] and snap["photos"] == [{"time": "10:55", "caption": "Max sniffing autumn leaves", "source": "feed"}]


def test_a_missed_walk_is_not_counted_as_minutes_or_done(client, setup):
    db = make_db()
    db.tables["care_checkins"] = [c for c in db.tables["care_checkins"] if c["kind"] != "walk"]
    _, model = setup(db)
    post(client)
    snap = model.snapshot
    assert "walk_minutes" not in snap["checks"]
    assert any(t["type"] == "walk" and t["status"] == "missed" for t in snap["tasks"])


# --- saving ------------------------------------------------------------------------------------


def test_a_draft_is_saved_with_its_inputs_snapshot_and_model(client, setup):
    db, _ = setup()
    body = post(client, chips=["Park walk"], sitter_note="Fun day").json()
    assert body["status"] == "draft" and body["model"] == "nvidia/report-model" and body["latency_ms"] == 410
    assert body["body"] == "I loved today with Max! 🐶"
    (row,) = db.tables["daily_reports"]
    assert row["id"] == body["report_id"]
    assert (row["pet_id"], row["sitter_id"], row["report_date"], row["status"]) == (PET_ID, SITTER_ID, "2026-10-15", "draft")
    assert row["inputs"]["chips"] == ["Park walk"] and row["inputs"]["sitter_note"] == "Fun day"
    assert row["source_snapshot"]["pet"]["name"] == "Max" and row["model"] == "nvidia/report-model"


def test_generating_again_overwrites_the_same_days_draft(client, setup):
    db, model = setup()
    first = post(client).json()
    model.text = "A second take on the day."
    second = post(client, chips=["Nap in the sun"]).json()
    assert second["report_id"] == first["report_id"]
    (row,) = db.tables["daily_reports"]
    assert row["body"] == "A second take on the day." and row["inputs"]["chips"] == ["Nap in the sun"]


def test_after_a_report_is_sent_the_next_one_is_a_new_draft_about_what_happened_since(client, setup):
    sent = {"id": "r1", "pet_id": PET_ID, "sitter_id": SITTER_ID, "report_date": "2026-10-15", "status": "sent", "body": "Sent.", "sent_at": at("15:00")}
    db, model = setup(make_db(daily_reports=[sent]))
    response = post(client)
    assert response.status_code == 200 and response.json()["report_id"] != "r1"
    assert db.tables["daily_reports"][0]["body"] == "Sent."  # the sent one is never rewritten
    assert [r["status"] for r in db.tables["daily_reports"]] == ["sent", "draft"]
    snap = model.snapshot
    # Only what happened after 11:00 Toronto (15:00 UTC): the potty and the note, not the meal, walk or pill before it.
    assert [c["kind"] for c in snap["checkins"]] == ["potty", "note"]
    assert snap["checks"] == {"potty": "normal"} and snap["tasks"] == []  # the 10:30 walk and 08:00 pill were before


def test_the_chips_after_a_sent_report_are_the_records_since(client, setup, monkeypatch):
    from app.routers import ai_report_chips

    sent = {"id": "r1", "pet_id": PET_ID, "sitter_id": SITTER_ID, "report_date": "2026-10-15", "status": "sent", "body": "Sent.", "sent_at": at("15:00")}
    db, _ = setup(make_db(daily_reports=[sent]))
    monkeypatch.setattr(ai_report_chips, "get_service_client", lambda: db)
    monkeypatch.setattr(ai_report_chips, "_now", lambda: NOW)
    response = client.post("/api/ai/report-chips", headers={"Authorization": f"Bearer {sitter_token()}"}, json={"pet_id": PET_ID})
    assert response.status_code == 200, response.text
    chips = response.json()["chips"]
    assert "rec-meal" not in [c["id"] for c in chips] and "rec-potty" in [c["id"] for c in chips]


def test_another_sitters_report_does_not_block_this_one(client, setup):
    db = make_db(daily_reports=[{"id": "r9", "pet_id": PET_ID, "sitter_id": OTHER_SITTER, "report_date": "2026-10-15", "status": "sent", "body": "Theirs."}])
    db, _ = setup(db)
    assert post(client).status_code == 200
    assert len(db.tables["daily_reports"]) == 2


def test_a_report_that_breaks_a_rule_is_rewritten_once(client, setup):
    db, model = setup()
    model.queue = ["Max ate his dinner right on time!", "Max had dinner and a lovely evening."]
    body = post(client, chips=["Evening snack"]).json()
    assert body["body"] == "Max had dinner and a lovely evening."
    assert len(model.calls) == 2
    retry = model.calls[1]["messages"][-1]["content"]
    assert "gendered pronoun" in retry and "punctuality claim" in retry
    assert model.calls[1]["temperature"] == 0.2


def test_a_pronoun_the_sitter_used_is_not_a_broken_rule():
    from app.ai.daily_report import broken_rules

    assert broken_rules("Bori got so excited, she loved it.", {"sitter_note": "she got so excited"}) == []
    assert broken_rules("Max loved his walk.", {"sitter_note": None}) == ["gendered pronoun"]
    assert broken_rules("Dinner was served right on time.", {}) == ["punctuality claim"]
    assert broken_rules("Max and I had a lovely, quiet evening.", {}) == []


def test_the_model_text_is_tidied_before_it_is_saved(client, setup):
    db, _ = setup(text='<think>plan</think>\n"Max had a lovely day."  ')
    assert post(client).json()["body"] == "Max had a lovely day."


# --- who may ask, and what goes wrong ------------------------------------------------------------


def test_a_sitter_not_on_duty_is_refused(client, setup, monkeypatch):
    _, model = setup()

    def deny(user, pet_id):
        raise HTTPException(status_code=403, detail="You are not on duty for this pet.")

    monkeypatch.setattr(authz, "assert_on_duty_for", deny)
    assert post(client).status_code == 403 and model.calls == []


def test_an_owner_is_refused_by_the_real_guard(client, setup, monkeypatch):
    setup()
    monkeypatch.setattr(authz, "assert_on_duty_for", REAL_ASSERT_ON_DUTY)
    assert post(client, token=owner_token()).status_code == 403


def test_a_sitter_with_no_booking_today_is_refused(client, setup):
    db = make_db()
    db.tables["bookings"] = [{"id": "b1", "sitter_id": OTHER_SITTER, "status": "confirmed"}]
    _, model = setup(db)
    assert post(client).status_code == 403 and model.calls == []


def test_unknown_pet_is_404(client, setup):
    db = make_db()
    db.tables["pets"] = []
    setup(db)
    assert post(client).status_code == 404


def test_a_model_outage_saves_a_plain_list_of_what_the_sitter_kept(client, setup, monkeypatch):
    db, _ = setup(with_episodes(make_db()))

    def down(*a, **k):
        raise nebius.AIUnavailable("down")

    monkeypatch.setattr(nebius, "chat", down)
    response = post(
        client, chips=["Met a golden retriever", "Park walk"], sitter_note="Such a sweet boy", photos=["Max looking up at a squirrel"],
        skip=["potty"], overrides={"meal": "most"}, off=["note-c-note2"],
    )
    assert response.status_code == 200
    out = response.json()
    assert out["fallback"] is True and out["model"] == "template-fallback" and out["status"] == "draft"
    assert out["body"].splitlines() == [
        "Hi Max's family! Here's Max's day:",
        "• Ate most of it",  # the sitter's correction
        "• Walk · 20 min",
        "• Medication given",
        "• Met a golden retriever",
        "• Park walk",
        "• Max looking up at a squirrel",
        "",
        "Such a sweet boy",
    ]
    assert "potty" not in out["body"].lower() and "Threw up" not in out["body"]  # turned off stays off
    saved = db.tables["daily_reports"][0]
    assert saved["status"] == "draft" and saved["body"] == out["body"] and saved["model"] == "template-fallback"


def test_an_empty_model_answer_also_falls_back_to_the_plain_list(client, setup, monkeypatch):
    db, _ = setup()
    monkeypatch.setattr(nebius, "chat", Model("<think>only thoughts</think>"))
    out = post(client, chips=["Park walk"]).json()
    assert out["fallback"] is True and "• Park walk" in out["body"]
    assert len(db.tables["daily_reports"]) == 1


def test_a_written_report_is_not_a_fallback(client, setup):
    setup()
    assert post(client).json()["fallback"] is False


def test_more_than_eight_kept_chips_write_a_report_from_the_first_eight(client, setup):
    _, model = setup()
    response = post(client, chips=[f"Highlight {i}" for i in range(12)])
    assert response.status_code == 200
    assert model.snapshot["chips"] == [f"Highlight {i}" for i in range(8)]


def test_input_limits(client, setup):
    setup()
    assert post(client, chips=[f"c{i}" for i in range(31)]).status_code == 422
    assert post(client, photos=["a", "b", "c"]).status_code == 422
    assert post(client, sitter_note="x" * 201).status_code == 422
    assert post(client, sitter_note="x" * 200).status_code == 200


# --- the pure helpers -----------------------------------------------------------------------------


def test_age_chips_and_text_helpers():
    assert age_years("2022-03-01", date(2026, 10, 15)) == 4
    assert age_years("2022-12-01", date(2026, 10, 15)) == 3  # birthday not reached yet
    assert age_years(None, TODAY) is None and age_years("soon", TODAY) is None
    assert clean_chips(["  Park   walk ", "park walk", "", "x" * 60]) == ["Park walk", "x" * 40]
    assert tidy_body("<think>a</think> hi ") == "hi"


def test_the_morning_and_afternoon_sitters_each_get_their_own_hours():
    from app.ai.daily_report import care_intervals, day_bounds

    tz = ZoneInfo("America/Toronto")
    start, end = day_bounds(TODAY, tz)
    morning = care_intervals([{"drop_off": "2026-10-14T12:00:00+00:00", "pick_up": "2026-10-15T16:00:00+00:00"}], start, end)
    afternoon = care_intervals([{"drop_off": "2026-10-15T16:00:00+00:00", "pick_up": "2026-10-16T12:00:00+00:00"}], start, end)
    assert morning[0][0] == start and morning[0][1] == datetime(2026, 10, 15, 16, 0, tzinfo=UTC)
    assert afternoon[0] == (datetime(2026, 10, 15, 16, 0, tzinfo=UTC), end)  # cut at local midnight
