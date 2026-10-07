"""Tone layer (phase-07B 7B.8 · 7B.9): the sitter's style card + their own examples, anonymized learning,
edit ratio, and the record-reply route. Auto-sent messages never become samples."""

from types import SimpleNamespace

import pytest
from app.ai import tone
from app.routers import tone as tone_router
from app.services import nebius

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_inquiry import INQ, make_db
from tests.test_media_sign import OWNER_ID, SITTER_ID, owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client


class ToneDB:
    """FakeDB + the match_tone rpc, with insert returning the stored row."""

    def __init__(self, samples=None, **tables) -> None:
        self.inner = tables.pop("inner", None) or FakeDB(tone_samples=[], **tables)
        self.samples = samples or []
        self.rpcs: list[tuple[str, dict]] = []

    def table(self, name):
        return self.inner.table(name)

    def rpc(self, name, params):
        self.rpcs.append((name, params))
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=self.samples))


@pytest.fixture(autouse=True)
def embeddings(monkeypatch):
    calls: list[list[str]] = []
    monkeypatch.setattr(nebius, "embed", lambda texts, **kw: calls.append(list(texts)) or [[0.1] * 3 for _ in texts])
    return calls


# --- compose ----------------------------------------------------------------------------------------


def test_a_sitter_with_no_card_and_no_history_gets_the_default_style():
    db = ToneDB(sitter_profiles=[{"id": "s1", "style_card": None}])
    result = tone.compose(db, "s1", kind="inquiry", query="")
    assert result.style_notes == tone.default_style() and result.examples == 0 and db.rpcs == []


def test_the_sitters_style_card_and_their_own_examples_shape_the_notes(embeddings):
    db = ToneDB(
        samples=[{"context_summary": "asks about a pill", "final_text": "Hi {OWNER}! Happy to help 🐾", "source": "approved"}],
        sitter_profiles=[{"id": "s1", "style_card": "Warm and breezy, one paw emoji."}],
    )
    result = tone.compose(db, "s1", kind="inquiry", intent="accept", query="boarding for 1 pet(s): pill at 2 PM?")
    assert result.style_notes.startswith("Warm and breezy, one paw emoji.")
    assert "Situation: asks about a pill" in result.style_notes and "Reply: Hi {OWNER}! Happy to help 🐾" in result.style_notes
    assert "{PRICE} and {DATE}" in result.style_notes and result.examples == 1
    name, params = db.rpcs[0]
    assert name == "match_tone" and params["p_sitter"] == "s1" and params["p_kind"] == "inquiry" and params["p_k"] == 3
    assert embeddings == [["accept boarding for 1 pet(s): pill at 2 PM?"]]


def test_two_sitters_get_different_notes_for_the_same_question():
    db = ToneDB(sitter_profiles=[{"id": "lucy", "style_card": "Breezy, emojis."}, {"id": "paul", "style_card": "Calm and precise, no emojis."}])
    lucy = tone.compose(db, "lucy", query="pill?").style_notes
    paul = tone.compose(db, "paul", query="pill?").style_notes
    assert lucy != paul and "Breezy" in lucy and "precise" in paul


def test_a_search_outage_still_gives_the_style_card(monkeypatch):
    def down(texts, **kw):
        raise nebius.AIUnavailable("down")

    monkeypatch.setattr(nebius, "embed", down)
    db = ToneDB(sitter_profiles=[{"id": "s1", "style_card": "Short."}])
    result = tone.compose(db, "s1", query="anything")
    assert result.style_notes == "Short." and result.examples == 0


def test_a_database_without_the_tone_tables_never_blocks_a_draft():
    result = tone.compose(object(), "s1", query="x")  # no .table at all
    assert result.style_notes == tone.default_style()


# --- edit ratio -----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("draft", "final", "expected"),
    [
        ("Hi Chloe! All good.", "Hi Chloe! All good.", 0.0),
        ("one two three four", "one two three five", 0.25),
        ("a b", "x y z", 1.0),
        ("", "", 0.0),
        ("one two", "one", 0.5),
    ],
)
def test_the_edit_ratio_is_word_edit_distance_over_the_longer_text(draft, final, expected):
    assert tone.edit_ratio(draft, final) == expected


# --- anonymize --------------------------------------------------------------------------------------


def test_examples_are_stored_without_names_amounts_dates_or_contact_details():
    text = "Hi Chloe! Max and Mochi can stay Oct 9 to October 12 (2026-10-09) for $268.13 CAD. Call +1 416 555 0199 or chloe@example.com."
    out = tone.anonymize(text, owner_names=["Chloe"], pet_names=["Max", "Mochi"])
    assert out == "Hi {OWNER}! {PET} and {PET} can stay {DATE} to {DATE} ({DATE}) for {PRICE}. Call or ."
    assert "Chloe" not in out and "555" not in out and "@" not in out


def test_anonymize_keeps_paragraph_breaks_and_possessives():
    out = tone.anonymize("Max's bed is ready.\n\nSee you soon, Chloe!", owner_names=["Chloe"], pet_names=["Max"])
    assert out == "{PET} bed is ready.\n\nSee you soon, {OWNER}!"


# --- record_sample --------------------------------------------------------------------------------------


def test_a_sent_as_is_reply_is_an_approved_sample_with_ratio_zero():
    db = ToneDB()
    row = tone.record_sample(db, sitter_id="s1", source="approved", kind="inquiry", context_summary="asks about a pill", draft="Hi {OWNER}!", final_text="Hi {OWNER}!")
    assert row["source"] == "approved" and row["edit_ratio"] == 0.0 and len(row["embedding"]) == 3


def test_a_discarded_draft_is_kept_as_a_negative_signal_without_a_ratio():
    db = ToneDB()
    row = tone.record_sample(db, sitter_id="s1", source="regenerated", kind="inquiry", context_summary="x", draft="Too formal.", final_text="")
    assert row["edit_ratio"] is None and row["final_text"] == "" and row["draft"] == "Too formal."


# --- the route --------------------------------------------------------------------------------------------


def thread(db: FakeDB, *, body="Hi Chloe! I'm available. 🐾", confirmed="2026-10-07T10:05:00+00:00", ai=True):
    db.tables["inquiry_messages"] += [
        {
            "id": "draft1", "inquiry_id": INQ, "author": "ai", "body": "Hi Chloe! I'm available. 🐾", "status": "draft",
            "grounding": {"intent": "accept"}, "created_at": "2026-10-07T10:00:05+00:00",
        },
        {
            "id": "sent1", "inquiry_id": INQ, "author": "sitter", "sender_id": SITTER_ID, "body": body, "drafted_by_ai": ai,
            "confirmed_by_sitter_at": confirmed, "status": "sent", "created_at": "2026-10-07T10:06:00+00:00",
        },
    ]
    db.tables["inquiry_messages"][0]["created_at"] = "2026-10-07T10:00:00+00:00"
    db.tables["tone_samples"] = []
    return db


@pytest.fixture
def route(monkeypatch):
    def _route(db):
        monkeypatch.setattr(tone_router, "get_service_client", lambda: db)
        return db

    return _route


def record(client, token=None):
    return client.post("/api/tone/record-reply", headers={"Authorization": f"Bearer {token or sitter_token()}"}, json={"inquiry_id": INQ})


def test_an_approved_reply_is_recorded_once_and_anonymized(client, route):
    db = route(thread(make_db()))
    assert record(client).json() == {"recorded": 1}
    (sample,) = db.tables["tone_samples"]
    assert sample["source"] == "approved" and sample["edit_ratio"] == 0.0 and sample["intent"] == "accept"
    assert sample["source_message_id"] == "sent1" and sample["sitter_id"] == SITTER_ID
    assert "Chloe" not in sample["final_text"] and "{OWNER}" in sample["final_text"]
    assert "Max" not in sample["context_summary"]
    assert record(client).json() == {"recorded": 0}  # once per message
    assert len(db.tables["tone_samples"]) == 1


def test_an_edited_reply_records_how_much_was_changed(client, route):
    db = route(thread(make_db(), body="Hi Chloe! I'm available, and a pill at 2 PM is no problem. 🐾"))
    assert record(client).json() == {"recorded": 1}
    sample = db.tables["tone_samples"][0]
    assert sample["source"] == "edited" and 0 < sample["edit_ratio"] < 1


def test_an_auto_sent_reply_is_never_recorded(client, route):
    db = route(thread(make_db(), confirmed=None))
    assert record(client).json() == {"recorded": 0} and db.tables["tone_samples"] == []


def test_a_reply_the_sitter_typed_themselves_is_not_a_draft_sample(client, route):
    route(thread(make_db(), ai=False))
    assert record(client).json() == {"recorded": 0}


def test_only_the_threads_sitter_may_record(client, route):
    route(thread(make_db()))
    assert record(client, owner_token()).status_code == 403


def test_an_embedding_outage_just_records_nothing(client, route, monkeypatch):
    def down(texts, **kw):
        raise nebius.AIUnavailable("down")

    monkeypatch.setattr(nebius, "embed", down)
    db = route(thread(make_db()))
    assert record(client).status_code == 200 and db.tables["tone_samples"] == []
    assert OWNER_ID  # imported for the fixtures above
