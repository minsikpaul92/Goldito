"""The demo seed gives the sitter her services and prices (FB-7): without them checkout cannot quote."""

from scripts import seed_demo

from tests.fakes import FakeDB

SITTER = "00000000-0000-4000-8000-0000000000b1"


def test_rates_are_created_after_the_services_they_need():
    db = FakeDB(sitter_profiles=[{"id": SITTER, "services": ["boarding"]}], sitter_rates=[])

    assert seed_demo.ensure_sitter_rates(db, SITTER) == "created"

    assert db.tables["sitter_profiles"][0]["services"] == ["boarding", "house_sitting"]
    (row,) = db.tables["sitter_rates"]
    assert row["sitter_id"] == SITTER
    # The phase-03c Goal values: a 3-night boarding stay, 2 pets, Thanksgiving quotes $268.13.
    assert (row["boarding_nightly"], row["house_sitting_nightly"], row["daycare_daily"]) == (55, 70, 35)
    assert (row["extra_pet_pct"], row["holiday_pct"]) == (50, 25)


def test_running_it_again_refreshes_the_row_instead_of_adding_one():
    db = FakeDB(
        sitter_profiles=[{"id": SITTER, "services": ["boarding", "house_sitting"]}],
        sitter_rates=[{"sitter_id": SITTER, "boarding_nightly": 10, "extra_pet_pct": 0, "holiday_pct": 0}],
    )

    assert seed_demo.ensure_sitter_rates(db, SITTER) == "updated"

    (row,) = db.tables["sitter_rates"]
    assert row["boarding_nightly"] == 55
    assert row["holiday_pct"] == 25


def test_check_reports_a_sitter_with_no_prices():
    empty = FakeDB(sitter_rates=[])
    assert "no sitter_rates row" in (seed_demo.check_sitter_rates(empty, SITTER) or "")

    seeded = FakeDB(sitter_rates=[{"sitter_id": SITTER}])
    assert seed_demo.check_sitter_rates(seeded, SITTER) is None
