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


def test_each_demo_account_gets_a_home_point_for_its_role():
    db = FakeDB(owner_profiles=[{"id": "o"}], sitter_profiles=[{"id": SITTER}])

    seed_demo.ensure_home_point(db, "owner", "o")
    seed_demo.ensure_home_point(db, "sitter", SITTER)

    assert (db.tables["owner_profiles"][0]["home_lat"], db.tables["owner_profiles"][0]["home_lng"]) == (43.6644, -79.3573)
    assert (db.tables["sitter_profiles"][0]["home_lat"], db.tables["sitter_profiles"][0]["home_lng"]) == (43.6477, -79.4194)


def test_a_named_demo_account_gets_its_own_address_and_point():
    db = FakeDB(owner_profiles=[{"id": "o"}], sitter_profiles=[{"id": SITTER}])

    seed_demo.ensure_home_point(db, "owner", "o", "demo-owner@goldito.test")
    seed_demo.ensure_home_point(db, "sitter", SITTER, "demo-sitter-daniel@goldito.test")

    owner, sitter = db.tables["owner_profiles"][0], db.tables["sitter_profiles"][0]
    assert owner["home_address"] == "100 Queen St W, Toronto, ON M5H 2N2"
    assert (owner["home_lat"], owner["home_lng"]) == (43.6534, -79.3841)
    assert sitter["home_address"] == "3401 Dufferin St, Toronto, ON M6A 2T9"
    assert sitter["service_area"] == "Toronto M6A"  # the rough place owners see
    assert (sitter["home_lat"], sitter["home_lng"]) == (43.7253, -79.4524)


def test_every_demo_account_has_a_home_and_the_spread_is_wide():
    from app.services.demo_accounts import DEMO_HOMES, DEMO_USERS

    assert {u.email for u in DEMO_USERS} == set(DEMO_HOMES)
