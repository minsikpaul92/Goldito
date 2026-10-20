"""The demo reset deletes only the two demo accounts' stay data, then rebuilds the starting state (FB-10)."""

from datetime import date

import pytest
from app.services import demo_accounts, demo_reset
from scripts import reset_demo

from tests.fakes import FakeDB

OWNER = "00000000-0000-4000-8000-0000000000a1"
SITTER = "00000000-0000-4000-8000-0000000000b1"
OTHER_OWNER = "00000000-0000-4000-8000-0000000000a2"
OTHER_SITTER = "00000000-0000-4000-8000-0000000000b2"
MAX = "00000000-0000-4000-8000-0000000000c1"
TODAY = date(2026, 10, 9)


def world() -> FakeDB:
    return FakeDB(
        pets=[{"id": MAX, "owner_id": OWNER, "name": "Max"}, {"id": "other-pet", "owner_id": OTHER_OWNER, "name": "Coco"}],
        pet_allergies=[],
        bookings=[
            {"id": "b-demo", "owner_id": OWNER, "sitter_id": SITTER},
            {"id": "b-other", "owner_id": OTHER_OWNER, "sitter_id": OTHER_SITTER},
        ],
        inquiries=[{"id": "q-demo", "owner_id": OWNER, "sitter_id": SITTER}],
        inquiry_messages=[{"id": "m-demo", "inquiry_id": "q-demo"}],
        notifications=[
            {"id": "n1", "user_id": OWNER},
            {"id": "n2", "user_id": SITTER},
            {"id": "n3", "user_id": OTHER_OWNER},
        ],
        daily_reports=[{"id": "r1", "pet_id": MAX, "sitter_id": SITTER}],
        feed_posts=[{"id": "f1", "pet_id": MAX}, {"id": "f2", "pet_id": "other-pet"}],
        pet_life_records=[{"id": "l1", "pet_id": MAX}],
        knowledge_chunks=[
            {"id": "k-life", "source_type": "life_record", "pet_id": MAX, "owner_id": None, "sitter_id": None},
            {"id": "k-inq", "source_type": "inquiry", "pet_id": None, "owner_id": OWNER, "sitter_id": SITTER},
            {"id": "k-policy", "source_type": "sitter_policy", "pet_id": None, "owner_id": None, "sitter_id": SITTER},
            {"id": "k-other", "source_type": "life_record", "pet_id": "other-pet", "owner_id": None, "sitter_id": None},
        ],
        tone_samples=[
            {"id": "t-history", "sitter_id": SITTER, "source": "history"},
            {"id": "t-approved", "sitter_id": SITTER, "source": "approved", "source_message_id": "m-demo"},
        ],
        sitter_availability=[{"id": "a-old", "sitter_id": SITTER, "kind": "blocked"}],
        sitter_profiles=[
            {
                "id": SITTER,
                "default_max_pets": 2,
                "default_hours": {"morning": ["08:00", "12:00"], "afternoon": ["12:00", "18:00"], "overnight": ["18:00", "08:00"]},
                "services": ["boarding"],
            }
        ],
        sitter_rates=[],
        owner_profiles=[{"id": OWNER}],
        profiles=[{"id": OWNER, "display_name": "x"}, {"id": SITTER, "display_name": "y"}],
    )


def ids(db: FakeDB, table: str) -> set[str]:
    return {row["id"] for row in db.tables[table]}


def test_a_dry_run_counts_and_changes_nothing():
    db = world()
    before = {name: list(rows) for name, rows in db.tables.items()}

    report = dict(demo_reset.reset(db, OWNER, SITTER, TODAY, apply=False))

    assert {name: db.tables[name] for name in before} == before  # (the fake adds empty tables when queried)
    assert report["bookings"] == 1
    assert report["notifications"] == 2
    assert report["Life Records"] == 1


def test_apply_removes_only_the_demo_accounts_stay_data():
    db = world()

    demo_reset.reset(db, OWNER, SITTER, TODAY, apply=True)

    assert ids(db, "bookings") == {"b-other"}
    assert ids(db, "inquiries") == set()
    assert ids(db, "notifications") == {"n3"}
    assert ids(db, "daily_reports") == set()
    assert ids(db, "feed_posts") == {"f2"}
    assert ids(db, "pet_life_records") == set()
    # The sitter's policy text and the seeded voice stay; what her approvals taught goes.
    assert ids(db, "knowledge_chunks") == {"k-policy", "k-other"}
    assert ids(db, "tone_samples") == {"t-history"}


def with_a_third_account(db: FakeDB) -> FakeDB:
    """Another owner (a judge, say) booked and asked the demo sitter; the demo owner asked another sitter."""
    db.tables["bookings"].append({"id": "b-judge", "owner_id": OTHER_OWNER, "sitter_id": SITTER, "status": "confirmed"})
    db.tables["inquiries"] += [
        {"id": "q-judge", "owner_id": OTHER_OWNER, "sitter_id": SITTER},
        {"id": "q-elsewhere", "owner_id": OWNER, "sitter_id": OTHER_SITTER},
    ]
    db.tables["inquiry_messages"].append({"id": "m-judge", "inquiry_id": "q-judge"})
    db.tables["notifications"] += [
        {"id": "n-judge-booking", "user_id": SITTER, "booking_id": "b-judge"},
        {"id": "n-plain", "user_id": SITTER, "booking_id": None},
    ]
    db.tables["daily_reports"].append({"id": "r-judge", "pet_id": "other-pet", "sitter_id": SITTER})
    db.tables["pet_life_records"].append({"id": "l-judge", "pet_id": "other-pet", "booking_id": "b-judge"})
    db.tables["knowledge_chunks"].append({"id": "k-judge-inq", "source_type": "inquiry", "pet_id": None, "owner_id": OTHER_OWNER, "sitter_id": SITTER})
    db.tables["tone_samples"].append({"id": "t-judge", "sitter_id": SITTER, "source": "approved", "source_message_id": "m-judge"})
    return db


def test_another_accounts_booking_inquiry_and_what_came_of_them_stay():
    db = with_a_third_account(world())

    demo_reset.reset(db, OWNER, SITTER, TODAY, apply=True)

    assert ids(db, "bookings") == {"b-other", "b-judge"}
    assert ids(db, "inquiries") == {"q-judge", "q-elsewhere"}
    assert ids(db, "notifications") == {"n3", "n-judge-booking"}
    assert ids(db, "daily_reports") == {"r-judge"}
    assert ids(db, "pet_life_records") == {"l-judge"}
    assert "k-judge-inq" in ids(db, "knowledge_chunks")
    assert ids(db, "tone_samples") == {"t-history", "t-judge"}


def test_the_sitters_schedule_stays_while_she_has_another_owners_confirmed_booking():
    db = with_a_third_account(world())

    report = dict(demo_reset.reset(db, OWNER, SITTER, TODAY, apply=True))

    assert ids(db, "sitter_availability") == {"a-old"}  # not removed (the guard would refuse), not doubled
    assert "schedule rows" not in report and any(label.startswith("schedule kept") for label in report)


def test_apply_rebuilds_the_starting_state():
    db = world()

    demo_reset.reset(db, OWNER, SITTER, TODAY, apply=True)

    # Max is already there (not duplicated); Mochi is added.
    owner_pets = sorted(p["name"] for p in db.tables["pets"] if p["owner_id"] == OWNER)
    assert owner_pets == ["Max", "Mochi"]
    # Three open slots for 60 days from today, in the sitter's default hours, nothing blocked.
    rows = db.tables["sitter_availability"]
    assert sorted(r["slot"] for r in rows) == ["afternoon", "morning", "overnight"]
    assert {r["kind"] for r in rows} == {"open"}
    assert {(r["start_date"], r["end_date"]) for r in rows} == {("2026-10-09", "2026-12-08")}
    assert {r["max_pets"] for r in rows} == {2}
    # Prices exist, and the names match the demo story.
    assert len(db.tables["sitter_rates"]) == 1
    assert {p["id"]: p["display_name"] for p in db.tables["profiles"]} == {OWNER: "Robert", SITTER: "Chloe"}
    assert db.tables["sitter_profiles"][0]["services"] == ["boarding", "house_sitting"]
    # Both homes have a map point, so Start trip has a destination (06B).
    assert (db.tables["sitter_profiles"][0]["home_lat"], db.tables["sitter_profiles"][0]["home_lng"]) == (43.6502, -79.3896)  # Chloe: 299 Queen St W
    assert (db.tables["owner_profiles"][0]["home_lat"], db.tables["owner_profiles"][0]["home_lng"]) == (43.6534, -79.3841)  # Robert: 100 Queen St W


def test_an_owner_with_no_pets_yet_does_not_break_the_plan():
    db = world()
    db.tables["pets"] = []

    report = dict(demo_reset.reset(db, OWNER, SITTER, TODAY, apply=True))

    assert report["feed posts"] == 0
    assert sorted(p["name"] for p in db.tables["pets"]) == ["Max", "Mochi"]


def test_the_confirmation_accepts_reset_in_any_case_and_nothing_else():
    assert all(reset_demo.confirmed(a) for a in ("reset", "RESET", "Reset", "  reset \n"))
    assert not any(reset_demo.confirmed(a) for a in ("", "yes", "resett", "re set"))


def test_the_empty_state_leaves_the_owner_without_pets_but_the_sitter_ready():
    db = world()

    demo_reset.reset(db, OWNER, SITTER, TODAY, state="empty", apply=True)

    assert [p["id"] for p in db.tables["pets"] if p["owner_id"] == OWNER] == []
    assert any(p["owner_id"] == OTHER_OWNER for p in db.tables["pets"])  # other owners keep theirs
    assert len(db.tables["sitter_rates"]) == 1
    assert len(db.tables["sitter_availability"]) == 3


def test_the_confirmed_state_books_after_everything_is_ready_and_pets_does_not():
    db = world()
    calls = []

    def book(client, owner_id, sitter_id, today, state, demo_set):
        # By now the pets, prices and schedule must already exist for the booking RPCs to accept it.
        calls.append((owner_id, sitter_id, today, state, len(client.tables["sitter_availability"]), len(client.tables["sitter_rates"])))
        return "b-new"

    demo_reset.reset(db, OWNER, SITTER, TODAY, state="pets", apply=True, book=book)
    assert calls == []

    demo_reset.reset(db, OWNER, SITTER, TODAY, state="confirmed", apply=True, book=book)
    assert calls == [(OWNER, SITTER, TODAY, "confirmed", 3, 1)]

    calls.clear()
    for state in ("ready", "in_care"):
        demo_reset.reset(db, OWNER, SITTER, TODAY, state=state, apply=True, book=book)
    assert [c[3] for c in calls] == ["ready", "in_care"]


def test_a_dry_run_never_books_and_an_unknown_state_is_refused():
    db = world()

    def book(*_args):
        raise AssertionError("a dry run must not book")

    demo_reset.reset(db, OWNER, SITTER, TODAY, state="confirmed", apply=False, book=book)

    import pytest

    with pytest.raises(ValueError):
        demo_reset.reset(db, OWNER, SITTER, TODAY, state="bogus", apply=False)  # type: ignore[arg-type]


def test_each_booked_state_starts_where_its_test_needs_it():
    from datetime import datetime
    from zoneinfo import ZoneInfo

    now = datetime(2026, 10, 9, 22, 15, tzinfo=ZoneInfo("America/Toronto"))

    confirmed_drop, confirmed_pick = demo_reset.stay_times("confirmed", now, TODAY)
    assert (confirmed_drop.date().isoformat(), confirmed_drop.hour, confirmed_drop.minute) == ("2026-10-11", 9, 30)
    assert confirmed_pick.date().isoformat() == "2026-10-14"

    # `ready`: an hour away, inside the 2 h before which the sitter cannot tap Received.
    ready_drop, ready_pick = demo_reset.stay_times("ready", now, TODAY)
    assert ready_drop == datetime(2026, 10, 9, 23, 15, tzinfo=ZoneInfo("America/Toronto"))
    assert (ready_pick.date().isoformat(), ready_pick.hour) == ("2026-10-12", 17)

    # `in_care`: minutes away, so the care window (30 min early) is open the moment it is built.
    care_drop, _ = demo_reset.stay_times("in_care", now, TODAY)
    assert (care_drop - now).total_seconds() == 180


def test_the_stay_is_checked_out_then_received_in_the_right_order(monkeypatch):
    """ready = accept → sign → pay; in_care also taps Received; confirmed stops after the sitter accepts."""
    calls = []

    def fake_rpc(token, fn, params, **_):
        calls.append((token, fn))
        return ["emergency_vet", "safe_return"] if fn == "required_consents" else "b-1"

    monkeypatch.setattr(demo_reset.authz, "rpc_json", fake_rpc)
    monkeypatch.setattr(demo_reset, "sign_in", lambda email: "owner-token" if "owner" in email else "sitter-token")
    inserted = []
    monkeypatch.setattr(demo_reset, "_insert_as", lambda token, table, row: inserted.append((token, table, row["kind"], row["signer_id"])))
    monkeypatch.setattr(demo_reset, "owner_pet_ids", lambda *_: ["pet-1"])
    db = world()

    def run(state):
        calls.clear()
        inserted.clear()
        demo_reset.book_for_state(db, OWNER, SITTER, TODAY, state)
        return [fn for _t, fn in calls]

    base = ["request_booking", "express_interest", "request_skip_meet_greet", "respond_skip_meet_greet", "respond_booking"]
    assert run("confirmed") == base
    assert inserted == []
    assert run("ready") == [*base, "required_consents", "pay_booking_demo"]
    assert inserted == [("owner-token", "booking_consents", "emergency_vet", OWNER), ("owner-token", "booking_consents", "safe_return", OWNER)]
    assert run("in_care") == [*base, "required_consents", "pay_booking_demo", "complete_handoff"]
    assert calls[-1] == ("sitter-token", "complete_handoff")  # Received is the sitter's, after the owner paid


def test_a_pair_that_has_met_before_just_goes_on_without_a_first_yes(monkeypatch):
    calls = []

    def fake_rpc(token, fn, args, **kw):
        calls.append(fn)
        if fn == "express_interest":
            raise demo_reset.authz.RpcError(fn, 400, "interest_not_needed")
        return ["emergency_vet", "safe_return"] if fn == "required_consents" else "b-1"

    monkeypatch.setattr(demo_reset.authz, "rpc_json", fake_rpc)
    monkeypatch.setattr(demo_reset, "sign_in", lambda email: "token")
    monkeypatch.setattr(demo_reset, "owner_pet_ids", lambda *_: ["pet-1"])

    demo_reset.book_for_state(world(), OWNER, SITTER, TODAY, "confirmed")

    assert calls == ["request_booking", "express_interest", "request_skip_meet_greet", "respond_skip_meet_greet", "respond_booking"]


def test_any_other_error_on_the_first_yes_stops_the_reset(monkeypatch):
    def fake_rpc(token, fn, args, **kw):
        if fn == "express_interest":
            raise demo_reset.authz.RpcError(fn, 400, "sitter_unavailable")
        return "b-1"

    monkeypatch.setattr(demo_reset.authz, "rpc_json", fake_rpc)
    monkeypatch.setattr(demo_reset, "sign_in", lambda email: "token")
    monkeypatch.setattr(demo_reset, "owner_pet_ids", lambda *_: ["pet-1"])

    with pytest.raises(demo_reset.authz.RpcError):
        demo_reset.book_for_state(world(), OWNER, SITTER, TODAY, "confirmed")


def test_an_owner_reset_keeps_the_sitters_own_data():
    """The owner side: pets and their care data go, the pair's bookings go, the sitter's schedule and voice stay."""
    db = world()
    db.tables["care_tasks"] = [{"id": "ct1", "pet_id": MAX}]

    demo_reset.reset(db, OWNER, SITTER, TODAY, state="empty", apply=True, scope="owner")

    assert ids(db, "bookings") == {"b-other"}
    assert ids(db, "care_tasks") == set()
    assert ids(db, "pets") == {"other-pet"}
    assert ids(db, "notifications") == {"n2", "n3"}  # the sitter's notice stays
    assert ids(db, "sitter_availability") == {"a-old"}  # her schedule stays
    assert db.tables["sitter_rates"] == []  # nothing was built on her side
    assert db.tables["profiles"][1]["display_name"] == "y"  # and her name was not touched


def test_a_sitter_reset_keeps_the_owners_own_data():
    """The sitter side: her schedule is reopened and the pair's bookings go, the owner's pets and care plan stay."""
    db = world()
    db.tables["care_tasks"] = [{"id": "ct1", "pet_id": MAX}]

    demo_reset.reset(db, OWNER, SITTER, TODAY, state="pets", apply=True, scope="sitter")

    assert ids(db, "bookings") == {"b-other"}
    assert ids(db, "pets") == {MAX, "other-pet"}
    assert ids(db, "care_tasks") == {"ct1"}  # the owner's care plan stays
    assert ids(db, "daily_reports") == set()  # what the stay left on the pet goes with the booking
    assert ids(db, "notifications") == {"n1", "n3"}  # the owner's notice stays
    assert "a-old" not in ids(db, "sitter_availability")  # her schedule was reopened
    assert len(db.tables["sitter_rates"]) == 1
    assert db.tables["profiles"][0]["display_name"] == "x"  # the owner's name was not touched


def test_each_set_gets_its_own_pets():
    """Paul's owner is given Biscuit and Luna, not Max and Mochi, so the sets are told apart on Home."""
    from app.services.demo_accounts import set_for_key

    db = world()
    db.tables["pets"] = []

    demo_reset.reset(db, OWNER, SITTER, TODAY, state="pets", apply=True, demo_set=set_for_key("paul"), scope="owner")

    assert sorted(p["name"] for p in db.tables["pets"]) == ["Biscuit", "Luna"]
    dog = next(p for p in db.tables["pets"] if p["name"] == "Biscuit")
    assert dog["species"] == "dog"
    assert [a["allergen"] for a in db.tables["pet_allergies"]] == ["chicken"]  # the Treat check demo still works


def test_all_pet_names_in_the_demo_sets_differ():
    from app.services.demo_accounts import DEMO_SETS

    names = [pet[0] for demo_set in DEMO_SETS for pet in demo_set.pets]
    assert len(names) == len(set(names))



def chat_of(db: FakeDB):
    threads = [t for t in db.tables["chat_threads"] if t["owner_id"] == OWNER and t["sitter_id"] == SITTER]
    assert len(threads) == 1
    return [m for m in db.tables["chat_messages"] if m["thread_id"] == threads[0]["id"]]


def test_the_reset_replaces_the_pairs_chat_and_keeps_another_pairs():
    db = world()
    db.tables["chat_threads"] = [
        {"id": "t-old", "owner_id": OWNER, "sitter_id": SITTER},
        {"id": "t-other", "owner_id": OTHER_OWNER, "sitter_id": SITTER},
    ]

    demo_reset.reset(db, OWNER, SITTER, TODAY, state="pets", apply=True)

    assert "t-old" not in ids(db, "chat_threads")
    assert "t-other" in ids(db, "chat_threads")


def test_a_pets_state_chat_has_the_stay_card_and_a_short_talk_but_no_request():
    db = world()

    demo_reset.reset(db, OWNER, SITTER, TODAY, state="pets", apply=True)

    messages = chat_of(db)
    assert [(m["kind"], (m["card"] or {}).get("type")) for m in messages] == [("card", "stay"), ("text", None), ("text", None)]
    assert [p["name"] for p in messages[0]["card"]["pets"]] == ["Max", "Mochi"]
    assert messages[0]["sender_id"] == OWNER and messages[2]["sender_id"] == SITTER


def test_a_booked_state_chat_also_has_the_request_card_of_the_booking():
    db = world()

    demo_reset.reset(db, OWNER, SITTER, TODAY, state="confirmed", apply=True, book=lambda *_a: "b-new")

    cards = [m["card"] for m in chat_of(db) if m["kind"] == "card"]
    assert [c["type"] for c in cards] == ["stay", "request"]
    assert cards[1]["booking_id"] == "b-new" and cards[1]["service_type"] == "boarding"


def test_the_empty_state_has_no_chat_and_no_favorite():
    db = world()

    demo_reset.reset(db, OWNER, SITTER, TODAY, state="empty", apply=True)

    assert db.tables.get("chat_threads", []) == []
    assert db.tables.get("owner_favorite_sitters", []) == []


def test_the_set_sitter_is_the_owners_one_favorite_and_a_second_reset_does_not_double_it():
    db = world()

    demo_reset.reset(db, OWNER, SITTER, TODAY, state="pets", apply=True)
    demo_reset.reset(db, OWNER, SITTER, TODAY, state="pets", apply=True)

    assert db.tables["owner_favorite_sitters"] == [{"id": db.tables["owner_favorite_sitters"][0]["id"], "owner_id": OWNER, "sitter_id": SITTER}]


def test_the_sitter_gets_her_onboarding_answers_and_is_marked_done():
    db = world()

    demo_reset.reset(db, OWNER, SITTER, TODAY, state="pets", apply=True)
    demo_reset.reset(db, OWNER, SITTER, TODAY, state="pets", apply=True)

    answers = [a for a in db.tables["sitter_profile_answers"] if a["sitter_id"] == SITTER]
    assert [a["question_key"] for a in answers] == [k for k, _a, _c in demo_accounts.DEMO_SITTER_ANSWERS]  # replaced, not doubled
    assert all(a["answer"] or a["choice"] for a in answers)
    assert db.tables["sitter_profiles"][0]["onboarded_at"] is not None
