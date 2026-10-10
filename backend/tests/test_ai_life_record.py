"""POST /api/ai/life-record (phase-07C 7C.4): parties only, finished stays only, idempotent, facts-only snapshot,
and the model's words checked against the evidence."""

import json
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from app.ai import life_record as lr
from app.routers import ai_life_record
from app.services import nebius, rag
from postgrest.exceptions import APIError

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_media_sign import OWNER_ID, SITTER_ID, owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client

BOOKING = "00000000-0000-4000-8000-0000000000e1"
MAX = "00000000-0000-4000-8000-0000000000c1"
MOCHI = "00000000-0000-4000-8000-0000000000c2"
NOW = datetime(2026, 10, 13, 20, 0, tzinfo=UTC)


def at(day: str, hh_mm: str = "12:00") -> str:
    return f"2026-10-{day}T{hh_mm}:00+00:00"


def make_db(*, finished: bool = True, **extra) -> FakeDB:
    tables = dict(
        bookings=[{"id": BOOKING, "owner_id": OWNER_ID, "sitter_id": SITTER_ID, "status": "confirmed"}],
        booking_handoffs=[
            {"booking_id": BOOKING, "kind": "drop_off", "status": "agreed", "scheduled_at": at("09"), "completed_at": at("09")},
            {"booking_id": BOOKING, "kind": "pick_up", "status": "agreed", "scheduled_at": at("12", "20:00"), "completed_at": at("12", "20:05") if finished else None},
        ],
        booking_pets=[{"booking_id": BOOKING, "pet_id": MAX}, {"booking_id": BOOKING, "pet_id": MOCHI}],
        pets=[
            {"id": MAX, "name": "Max", "species": "dog", "breed": "Maltese", "birthdate": "2022-03-01"},
            {"id": MOCHI, "name": "Mochi", "species": "cat", "breed": None, "birthdate": None},
        ],
        pet_allergies=[{"pet_id": MAX, "allergen": "chicken"}],
        pet_cautions=[{"pet_id": MAX, "text": "Text instead of knocking", "active": True}, {"pet_id": MAX, "text": "Old", "active": False}],
        care_tasks=[
            {"id": "t-pill", "pet_id": MAX, "type": "medication", "title": "Skin pill"},
            {"id": "t-walk", "pet_id": MAX, "type": "walk", "title": "Walk"},
            {"id": "t-meal", "pet_id": MOCHI, "type": "feeding", "title": "Dinner"},
        ],
        task_logs=[
            {"task_id": "t-pill", "pet_id": MAX, "due_at": at("10", "12:00"), "status": "done", "note_text": "Hid it in a treat"},
            {"task_id": "t-pill", "pet_id": MAX, "due_at": at("11", "12:00"), "status": "done", "note_text": None},
            {"task_id": "t-walk", "pet_id": MAX, "due_at": at("11", "14:00"), "status": "pending", "note_text": None},
            {"task_id": "t-pill", "pet_id": MAX, "due_at": at("05", "12:00"), "status": "done", "note_text": "before the stay"},
            {"task_id": "t-meal", "pet_id": MOCHI, "due_at": at("10", "18:00"), "status": "done", "note_text": None},
        ],
        care_checkins=[
            {"pet_id": MAX, "created_by": SITTER_ID, "kind": "meal", "value": "all", "note_text": None, "created_at": at("10", "08:00")},
            {"pet_id": MAX, "created_by": SITTER_ID, "kind": "potty", "value": "normal", "note_text": None, "created_at": at("10", "09:00")},
            {"pet_id": MAX, "created_by": "someone-else", "kind": "mood", "value": "tired", "note_text": "not this sitter", "created_at": at("10", "10:00")},
            {"pet_id": MAX, "created_by": SITTER_ID, "kind": "note", "value": None, "note_text": "Chased a squirrel", "created_at": at("11", "10:00")},
        ],
        daily_reports=[
            {"pet_id": MAX, "sitter_id": SITTER_ID, "status": "sent", "body": "A calm day with Max.", "report_date": "2026-10-10", "sent_at": at("10", "22:00")},
            {"pet_id": MAX, "sitter_id": SITTER_ID, "status": "draft", "body": "UNSENT DRAFT", "report_date": "2026-10-11", "sent_at": None},
        ],
        inquiries=[{"id": "i1", "owner_id": OWNER_ID, "sitter_id": SITTER_ID, "pet_ids": [MAX], "booking_id": None, "created_at": at("01")}],
        inquiry_messages=[
            {"inquiry_id": "i1", "author": "owner", "body": "Can you give Max his pill at 2 PM?", "created_at": at("01", "10:00")},
            {"inquiry_id": "i1", "author": "ai", "body": "AI DRAFT", "created_at": at("01", "10:01")},
            {"inquiry_id": "i1", "author": "sitter", "body": "SITTER REPLY", "created_at": at("01", "10:05")},
        ],
        pet_life_records=[],
        notifications=[],
    )
    tables.update(extra)
    return FakeDB(**tables)


class Model:
    def __init__(self, *answers) -> None:
        self.answers = list(answers)
        self.calls: list[dict] = []

    def __call__(self, role, messages, schema, **kwargs):
        self.calls.append({"role": role, "messages": messages, **kwargs})
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return schema.model_validate(answer), SimpleNamespace(model="super", latency_ms=900, text="")

    def snapshot(self, i: int = 0) -> dict:
        return json.loads(self.calls[i]["messages"][-1]["content"])


MAX_RECORD = {
    "eats": "Finishes breakfast.", "meds": "Takes the skin pill inside a treat.", "potty": "Normal.",
    "behavior": "Excited by squirrels.", "heads_up": ["Chicken allergy"], "sitter_tips": ["Text instead of knocking"], "changed_since_last": [],
}


@pytest.fixture
def setup(monkeypatch):
    def _setup(*answers, db=None):
        db = db or make_db()
        model = Model(*(answers or (MAX_RECORD, {"eats": "Eats dinner.", "behavior": "Calm."})))
        indexed: list[dict] = []
        monkeypatch.setattr(ai_life_record, "get_service_client", lambda: db)
        monkeypatch.setattr(ai_life_record, "_now", lambda: NOW)
        monkeypatch.setattr(nebius, "chat_json", model)
        monkeypatch.setattr(rag, "index_source", lambda _db, **kw: indexed.append(kw) or 1)
        return SimpleNamespace(db=db, model=model, indexed=indexed)

    return _setup


def post(client, token=None):
    return client.post("/api/ai/life-record", headers={"Authorization": f"Bearer {token or owner_token()}"}, json={"booking_id": BOOKING})


# --- access ------------------------------------------------------------------------------------------


def test_a_third_party_gets_403_and_the_model_is_never_called(client, setup):
    db = make_db()
    db.tables["bookings"][0].update(owner_id="x", sitter_id="y")
    ctx = setup(db=db)
    assert post(client).status_code == 403 and ctx.model.calls == []


def test_an_unknown_booking_is_a_404(client, setup):
    db = make_db()
    db.tables["bookings"].clear()
    setup(db=db)
    assert post(client).status_code == 404


@pytest.mark.parametrize("case", ["not_returned", "requested"])
def test_a_stay_that_is_not_finished_is_a_409(client, setup, case):
    db = make_db(finished=False)
    if case == "requested":
        db.tables["bookings"][0]["status"] = "requested"
    ctx = setup(db=db)
    response = post(client)
    assert response.status_code == 409 and response.json()["detail"] == "stay_not_finished" and ctx.model.calls == []


@pytest.mark.parametrize("token", [owner_token, sitter_token])
def test_either_party_may_ask(client, setup, token):
    setup()
    assert post(client, token()).status_code == 200


# --- the record ----------------------------------------------------------------------------------------


def test_each_pet_gets_one_record_stored_indexed_and_announced(client, setup):
    ctx = setup()
    body = post(client).json()
    assert [r["pet_name"] for r in body["records"]] == ["Max", "Mochi"] and not any(r["reused"] for r in body["records"])
    max_record = body["records"][0]["summary"]
    assert max_record["meds"] == "Takes the skin pill inside a treat." and max_record["heads_up"] == ["Chicken allergy"]
    assert len(ctx.db.tables["pet_life_records"]) == 2
    saved = ctx.db.tables["pet_life_records"][0]
    assert saved["booking_id"] == BOOKING and saved["sitter_id"] == SITTER_ID and saved["model"] == "super"
    assert (saved["stay_from"], saved["stay_to"]) == ("2026-10-09", "2026-10-12")
    assert saved["body"].startswith("Eats: Finishes breakfast.") and "Heads-up: Chicken allergy" in saved["body"]
    assert [i["source_type"] for i in ctx.indexed] == ["life_record", "life_record"] and ctx.indexed[0]["pet_id"] == MAX
    notices = [n for n in ctx.db.tables["notifications"] if n["type"] == "life_record_updated"]
    assert [n["title"] for n in notices] == ["Max's Life Record is updated 📖", "Mochi's Life Record is updated 📖"]
    assert all(n["user_id"] == OWNER_ID for n in notices)
    call = ctx.model.calls[0]
    assert call["role"] == "report" and call["endpoint"] == "life-record" and "next sitter" in call["messages"][0]["content"].lower()


def test_asking_twice_makes_one_record_per_pet(client, setup):
    ctx = setup()
    first = post(client).json()
    second = post(client, sitter_token()).json()
    assert all(r["reused"] for r in second["records"])
    assert [r["record_id"] for r in second["records"]] == [r["record_id"] for r in first["records"]]
    assert len(ctx.db.tables["pet_life_records"]) == 2 and len(ctx.model.calls) == 2
    assert len([n for n in ctx.db.tables["notifications"] if n["type"] == "life_record_updated"]) == 2


class UniqueRecordsDB(FakeDB):
    """pet_life_records has unique (booking_id, pet_id), like 011."""

    def table(self, name: str):
        query = super().table(name)
        if name == "pet_life_records":
            execute = query.execute

            def guarded():
                p = query.payload or {}
                taken = any(r["booking_id"] == p.get("booking_id") and r["pet_id"] == p.get("pet_id") for r in self.tables[name])
                if query.op == "insert" and taken:
                    raise APIError({"message": "duplicate key value violates unique constraint", "code": "23505", "hint": None, "details": None})
                return execute()

            query.execute = guarded
        return query


def other_request_wrote(db: FakeDB, pet_id: str) -> None:
    db.tables["pet_life_records"].append({"id": f"other-{pet_id[-2:]}", "booking_id": BOOKING, "pet_id": pet_id, "summary": {"eats": "From the other request."}})


def test_a_record_stored_by_a_concurrent_request_is_reused_without_a_500_or_a_second_notice(client, setup, monkeypatch):
    db = UniqueRecordsDB(**make_db().tables)
    ctx = setup(db=db)

    def slow_model(role, messages, schema, **kwargs):
        other_request_wrote(db, MAX if not ctx.model.calls else MOCHI)  # the other request finishes while this one waits
        return ctx.model(role, messages, schema, **kwargs)

    monkeypatch.setattr(nebius, "chat_json", slow_model)
    response = post(client)
    assert response.status_code == 200
    records = response.json()["records"]
    assert [r["record_id"] for r in records] == ["other-c1", "other-c2"] and all(r["reused"] for r in records)
    assert records[0]["summary"] == {"eats": "From the other request."}
    assert len(db.tables["pet_life_records"]) == 2 and ctx.indexed == [] and db.tables["notifications"] == []


def test_a_record_stored_while_the_evidence_is_read_skips_the_model(client, setup, monkeypatch):
    ctx = setup()
    build = lr.build_snapshot

    def build_then_other_request_writes(**kwargs):
        other_request_wrote(ctx.db, kwargs["pet"]["id"])
        return build(**kwargs)

    monkeypatch.setattr(lr, "build_snapshot", build_then_other_request_writes)
    response = post(client)
    assert response.status_code == 200 and all(r["reused"] for r in response.json()["records"])
    assert ctx.model.calls == [] and ctx.db.tables["notifications"] == []


def test_another_database_error_on_insert_is_not_swallowed(client, setup):
    class BrokenDB(FakeDB):
        def table(self, name: str):
            query = super().table(name)
            if name == "pet_life_records":
                execute = query.execute

                def failing():
                    if query.op == "insert":
                        raise APIError({"message": "boom", "code": "XX000", "hint": None, "details": None})
                    return execute()

                query.execute = failing
            return query

    setup(db=BrokenDB(**make_db().tables))
    with pytest.raises(APIError):
        post(client)


def test_the_snapshot_is_only_this_stay_this_sitter_and_what_was_sent(client, setup):
    ctx = setup()
    post(client)
    snap = ctx.model.snapshot(0)
    assert snap["pet"] == {"name": "Max", "species": "dog", "breed": "Maltese", "age_years": 4, "allergies": ["chicken"], "cautions": ["Text instead of knocking"]}
    assert snap["stay"] == {"from": "2026-10-09", "to": "2026-10-12", "days": 4}
    tasks = {(t["type"], t["title"]): t for t in snap["tasks"]}
    assert tasks[("medication", "Skin pill")]["done"] == 2 and tasks[("medication", "Skin pill")]["notes"] == ["Hid it in a treat"]  # not the day before the stay
    assert tasks[("walk", "Walk")] == {"type": "walk", "title": "Walk", "done": 0, "missed": 1, "notes": []}
    assert [(c["kind"], c.get("value"), c.get("note")) for c in snap["checkins"]] == [("meal", "all", None), ("potty", "normal", None), ("note", None, "Chased a squirrel")]
    assert snap["reports"] == ["A calm day with Max."] and snap["owner_questions"] == ["Can you give Max his pill at 2 PM?"]
    assert snap["previous_record"] is None
    text = json.dumps(snap)
    assert "UNSENT DRAFT" not in text and "AI DRAFT" not in text and "SITTER REPLY" not in text and "not this sitter" not in text
    lr.assert_no_secrets(snap)


def sent_report(day: str, body: str) -> dict:
    return {"pet_id": MAX, "sitter_id": SITTER_ID, "status": "sent", "body": body, "report_date": f"2026-{day}", "sent_at": f"2026-{day}T22:00:00+00:00"}


def test_a_second_stay_with_the_same_sitter_uses_only_this_stays_reports(client, setup):
    db = make_db()
    db.tables["daily_reports"] = [
        sent_report("09-02", "OLD STAY day one."),
        sent_report("09-03", "OLD STAY day two."),
        sent_report("10-10", "A calm day with Max."),
    ]
    ctx = setup(db=db)
    post(client)
    assert ctx.model.snapshot(0)["reports"] == ["A calm day with Max."]


def test_a_long_stay_gives_the_newest_five_reports_oldest_first(client, setup):
    db = make_db()
    db.tables["booking_handoffs"][1].update(scheduled_at=at("16", "20:00"), completed_at=at("16", "20:05"))
    db.tables["daily_reports"] = [sent_report(f"10-{d:02d}", f"Day {d}.") for d in range(9, 16)]  # 7 reports
    ctx = setup(db=db)
    post(client)
    assert ctx.model.snapshot(0)["reports"] == ["Day 11.", "Day 12.", "Day 13.", "Day 14.", "Day 15."]


def test_the_questions_come_from_the_inquiry_that_became_this_booking(client, setup):
    db = make_db()
    db.tables["inquiries"] += [
        {"id": "i-this", "owner_id": OWNER_ID, "sitter_id": SITTER_ID, "pet_ids": [MAX], "booking_id": BOOKING, "created_at": at("05")},
        {"id": "i-later", "owner_id": OWNER_ID, "sitter_id": SITTER_ID, "pet_ids": [MAX], "booking_id": None, "created_at": at("20")},
    ]
    db.tables["inquiry_messages"] += [
        {"inquiry_id": "i-this", "author": "owner", "body": "He hides under the bed at night.", "created_at": at("05", "09:00")},
        {"inquiry_id": "i-later", "author": "owner", "body": "AFTER THE STAY", "created_at": at("20", "09:00")},
    ]
    ctx = setup(db=db)
    post(client)
    assert ctx.model.snapshot(0)["owner_questions"] == ["He hides under the bed at night."]


def test_without_a_linked_inquiry_only_ones_made_before_the_stay_ended_count(client, setup):
    db = make_db()
    db.tables["inquiries"].append({"id": "i-later", "owner_id": OWNER_ID, "sitter_id": SITTER_ID, "pet_ids": [MAX], "booking_id": None, "created_at": at("20")})
    db.tables["inquiry_messages"].append({"inquiry_id": "i-later", "author": "owner", "body": "AFTER THE STAY", "created_at": at("20", "09:00")})
    ctx = setup(db=db)
    post(client)
    assert ctx.model.snapshot(0)["owner_questions"] == ["Can you give Max his pill at 2 PM?"]


def test_the_previous_record_is_given_to_the_model_and_a_change_is_kept(client, setup):
    previous = {"eats": "Finishes 1 cup.", "meds": "Takes the pill in a treat.", "potty": None, "behavior": None, "heads_up": [], "sitter_tips": [], "changed_since_last": []}
    db = make_db(pet_life_records=[{"pet_id": MAX, "booking_id": "old", "summary": previous, "created_at": "2026-09-01T00:00:00+00:00"}])
    ctx = setup({**MAX_RECORD, "changed_since_last": ["Now eats breakfast faster"]}, {"eats": "Eats dinner."}, db=db)
    out = post(client).json()
    assert ctx.model.snapshot(0)["previous_record"] == previous
    assert "input wins" in ctx.model.calls[0]["messages"][0]["content"]
    assert out["records"][0]["summary"]["changed_since_last"] == ["Now eats breakfast faster"]


# --- no invented facts -------------------------------------------------------------------------------------------


def test_no_walk_in_the_stay_means_no_walk_in_the_record(client, setup):
    db = make_db()
    db.tables["task_logs"] = [row for row in db.tables["task_logs"] if row["task_id"] != "t-walk"]  # the walk was never due / done
    setup({**MAX_RECORD, "behavior": "Loves long walks. Calm indoors.", "sitter_tips": ["Walk him twice a day", "Text instead of knocking"]}, {}, db=db)
    summary = post(client).json()["records"][0]["summary"]
    assert summary["behavior"] == "Calm indoors." and summary["sitter_tips"] == ["Text instead of knocking"]


def test_a_walk_that_really_happened_may_be_mentioned(client, setup):
    db = make_db()
    db.tables["care_checkins"].append({"pet_id": MAX, "created_by": SITTER_ID, "kind": "walk", "value": "30", "note_text": None, "created_at": at("11", "15:00")})
    setup({**MAX_RECORD, "behavior": "Enjoys his 30-minute walk."}, {}, db=db)
    assert post(client).json()["records"][0]["summary"]["behavior"] == "Enjoys his 30-minute walk."


def test_without_a_medication_task_meds_is_null(client, setup):
    db = make_db()
    db.tables["care_tasks"] = [t for t in db.tables["care_tasks"] if t["type"] != "medication"]
    setup({**MAX_RECORD, "meds": "Takes the skin pill inside a treat."}, {}, db=db)
    assert post(client).json()["records"][0]["summary"]["meds"] is None


def test_a_habit_from_the_previous_record_can_be_carried_over(client, setup):
    db = make_db(pet_life_records=[{"pet_id": MOCHI, "booking_id": "old", "summary": {"potty": "Twice a day.", "eats": None, "meds": None, "behavior": None}, "created_at": "2026-09-01T00:00:00+00:00"}])
    setup(MAX_RECORD, {"potty": "Twice a day, normal."}, db=db)
    out = post(client).json()["records"][1]["summary"]
    assert out["potty"] == "Twice a day, normal."  # no potty logged this stay, but the record before had it


def test_entry_and_contact_details_never_get_stored(client, setup):
    ctx = setup({**MAX_RECORD, "heads_up": ["Lockbox code is 4821", "Chicken allergy"], "sitter_tips": ["Call +1 416 555 0199", "Text instead of knocking"], "behavior": "Email me at a@b.com."}, {})
    summary = post(client).json()["records"][0]["summary"]
    assert summary["heads_up"] == ["Chicken allergy"] and summary["sitter_tips"] == ["Text instead of knocking"] and summary["behavior"] is None
    stored = json.dumps(ctx.db.tables["pet_life_records"][0])
    assert "4821" not in stored and "555" not in stored and "a@b.com" not in stored


def test_the_record_is_capped_to_two_sentences_and_five_items(client, setup):
    long = {**MAX_RECORD, "eats": "One. Two. Three.", "sitter_tips": [f"Tip {i}" for i in range(9)]}
    summary_ctx = setup(long, {})
    summary = post(client).json()["records"][0]["summary"]
    assert summary["eats"] == "One. Two." and len(summary["sitter_tips"]) == 5 and summary_ctx.model.calls


# --- failure ---------------------------------------------------------------------------------------------------------


def test_a_model_outage_is_a_503_and_saves_nothing_for_that_pet(client, setup):
    ctx = setup(nebius.AIUnavailable("down"))
    response = post(client)
    assert response.status_code == 503 and "Max" in response.json()["detail"]
    assert ctx.db.tables["pet_life_records"] == [] and ctx.db.tables["notifications"] == []


def test_a_retry_after_a_partial_failure_only_writes_the_missing_pet(client, setup):
    ctx = setup(MAX_RECORD, nebius.AIUnavailable("down"), {"eats": "Eats dinner."})
    assert post(client).status_code == 503 and len(ctx.db.tables["pet_life_records"]) == 1
    body = post(client).json()
    assert [r["reused"] for r in body["records"]] == [True, False] and len(ctx.db.tables["pet_life_records"]) == 2


def test_the_evidence_helper_reads_the_records_not_the_model():
    snap = {"checkins": [{"kind": "meal"}, {"kind": "walk"}], "tasks": [{"type": "medication", "done": 0, "missed": 1}, {"type": "play", "done": 0, "missed": 0}]}
    assert lr.evidence(snap) == {"walk": True, "meds": True, "potty": False, "eats": True}
