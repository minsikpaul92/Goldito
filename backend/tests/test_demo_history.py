"""The demo reset leaves a past behind: finished stays, a cancelled request, the owner's pages and photos."""

from datetime import date

from app.services import demo_history, demo_reset
from app.services.demo_accounts import set_for_key

from tests.fakes import FakeDB

OWNER = "00000000-0000-4000-8000-0000000000a1"
SITTER = "00000000-0000-4000-8000-0000000000b1"
MAX = "00000000-0000-4000-8000-0000000000c1"
MOCHI = "00000000-0000-4000-8000-0000000000c2"
TODAY = date(2026, 10, 25)


def world() -> FakeDB:
    return FakeDB(
        pets=[
            {"id": MAX, "owner_id": OWNER, "name": "Max", "species": "dog"},
            {"id": MOCHI, "owner_id": OWNER, "name": "Mochi", "species": "cat"},
        ],
        notifications=[
            {"id": "n-cancelled", "user_id": SITTER, "booking_id": "b-cancelled"},
            {"id": "n-keep", "user_id": SITTER, "booking_id": "b-main"},
        ],
    )


def run(db: FakeDB, state: str = "pets") -> None:
    demo_history.seed_history(db, OWNER, SITTER, TODAY, state, set_for_key("chloe"), "b-cancelled")


def test_two_finished_stays_in_august_and_september():
    db = world()
    run(db)

    stays = db.tables["bookings"]
    assert [b["start_date"] for b in stays] == ["2026-08-12", "2026-09-16"]
    assert all(
        b["status"] == "confirmed" and b["paid_at"] and b["price_snapshot"]["total"] == 247.5
        for b in stays
    )
    assert len(db.tables["booking_pets"]) == 4
    done = [
        h for h in db.tables["booking_handoffs"] if h["completed_at"] and h["status"] == "agreed"
    ]
    assert sorted(h["kind"] for h in done) == ["drop_off"] * 2 + ["pick_up"] * 2


def test_one_shared_photo_and_one_sent_page_per_care_day_and_pet():
    db = world()
    run(db)

    shared = [p for p in db.tables["feed_posts"] if p["visibility"] == "shared"]
    sitter_pages = [r for r in db.tables["daily_reports"] if r["sitter_id"] == SITTER]
    assert len(shared) == len(sitter_pages) == 16  # 2 stays x 4 care days x 2 pets
    assert all(
        p["posted_by"] == SITTER and p["caption_source"] == "task" for p in shared
    )  # 'task' sends no notice
    assert all(r["status"] == "sent" and r["media_id"] for r in sitter_pages)
    assert {r["pet_id"] for r in sitter_pages} == {MAX, MOCHI}


def test_the_owner_has_a_private_page_and_photo_for_august_september_and_october():
    db = world()
    run(db)

    pages = [r for r in db.tables["daily_reports"] if r["sitter_id"] == OWNER]
    assert [r["report_date"] for r in pages] == ["2026-08-20", "2026-09-24", "2026-10-25"]
    assert all(r["inputs"] == {"by": "owner"} and r["status"] == "sent" for r in pages)
    private = [p for p in db.tables["feed_posts"] if p["visibility"] == "private"]
    assert [p["posted_by"] for p in private] == [OWNER] * 3
    assert all(p["sitter_id"] is None for p in private)


def test_a_dog_gets_dog_photos_and_a_cat_cat_photos():
    db = world()
    run(db)

    by_pet = {}
    for m in db.tables["media"]:
        by_pet.setdefault(m["pet_id"], []).append(m["cloudinary_public_id"])
    assert all("/dog_" in i for i in by_pet[MAX])
    assert all("/cat_" in i for i in by_pet[MOCHI])
    ids = [m["cloudinary_public_id"] for m in db.tables["media"]]
    assert len(ids) == len(set(ids))  # the column is unique


def test_in_care_adds_todays_shared_photos_and_one_private_one_of_the_sitter():
    past, today = world(), world()
    run(past, "pets")
    run(today, "in_care")

    extra = [p for p in today.tables["feed_posts"]][len(past.tables["feed_posts"]) :]
    assert len(extra) == 5
    assert sorted(p["visibility"] for p in extra) == ["private"] + ["shared"] * 4
    assert all(p["posted_by"] == SITTER for p in extra)


def test_running_it_again_writes_the_seed_photos_once():
    db = world()
    run(db)
    media = len(db.tables["media"])
    run(db)

    assert len(db.tables["media"]) == media


def test_the_cancelled_request_leaves_no_notice():
    db = world()
    run(db)

    assert [n["id"] for n in db.tables["notifications"]] == ["n-keep"]


def test_no_pets_no_history():
    db = FakeDB(pets=[])
    run(db)

    assert "bookings" not in db.tables or db.tables["bookings"] == []


def test_every_set_has_enough_photo_ids_for_its_longest_run():
    for species in ("dog", "cat"):
        assert (
            len([f for f in demo_history.seed_photo_files("chloe") if f"/{species}_" in f[0]])
            == demo_history.PHOTOS_PER_SPECIES
        )


def test_reset_builds_the_history_after_the_booking_and_skips_it_without_pets(monkeypatch):
    calls = []
    monkeypatch.setattr(demo_reset.demo_history, "seed_history", lambda *a: calls.append(a))
    monkeypatch.setattr(demo_reset, "cancelled_request", lambda *_a: "b-cancelled")
    monkeypatch.setattr(demo_reset, "ensure_pets", lambda *a, **k: [])
    monkeypatch.setattr(demo_reset, "ensure_sitter_rates", lambda *a: "")
    monkeypatch.setattr(demo_reset, "ensure_home_point", lambda *a: None)
    monkeypatch.setattr(demo_reset, "ensure_owner_onboarded", lambda *a: None)
    monkeypatch.setattr(demo_reset, "ensure_sitter_answers", lambda *a: None)
    monkeypatch.setattr(demo_reset, "open_schedule", lambda *a: 0)
    monkeypatch.setattr(demo_reset, "sync_display_names", lambda *a, **k: None)

    db = world()
    demo_reset.reset(db, OWNER, SITTER, TODAY, state="pets", apply=True)
    demo_reset.reset(db, OWNER, SITTER, TODAY, state="empty", apply=True)

    assert [c[4] for c in calls] == ["pets"]
    assert calls[0][6] == "b-cancelled"
