"""The demo reset deletes only the two demo accounts' stay data, then rebuilds the starting state (FB-10)."""

from datetime import date

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
            {"id": "t-approved", "sitter_id": SITTER, "source": "approved"},
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
        profiles=[{"id": OWNER, "display_name": "x"}, {"id": SITTER, "display_name": "y"}],
    )


def ids(db: FakeDB, table: str) -> set[str]:
    return {row["id"] for row in db.tables[table]}


def test_a_dry_run_counts_and_changes_nothing():
    db = world()
    before = {name: list(rows) for name, rows in db.tables.items()}

    report = dict(reset_demo.reset(db, OWNER, SITTER, TODAY, apply=False))

    assert {name: db.tables[name] for name in before} == before  # (the fake adds empty tables when queried)
    assert report["bookings (owner side)"] == 1
    assert report["notifications"] == 2
    assert report["Life Records"] == 1


def test_apply_removes_only_the_demo_accounts_stay_data():
    db = world()

    reset_demo.reset(db, OWNER, SITTER, TODAY, apply=True)

    assert ids(db, "bookings") == {"b-other"}
    assert ids(db, "inquiries") == set()
    assert ids(db, "notifications") == {"n3"}
    assert ids(db, "daily_reports") == set()
    assert ids(db, "feed_posts") == {"f2"}
    assert ids(db, "pet_life_records") == set()
    # The sitter's policy text and the seeded voice stay; what her approvals taught goes.
    assert ids(db, "knowledge_chunks") == {"k-policy", "k-other"}
    assert ids(db, "tone_samples") == {"t-history"}


def test_apply_rebuilds_the_starting_state():
    db = world()

    reset_demo.reset(db, OWNER, SITTER, TODAY, apply=True)

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


def test_an_owner_with_no_pets_yet_does_not_break_the_plan():
    db = world()
    db.tables["pets"] = []

    report = dict(reset_demo.reset(db, OWNER, SITTER, TODAY, apply=True))

    assert report["feed posts"] == 0
    assert sorted(p["name"] for p in db.tables["pets"]) == ["Max", "Mochi"]
