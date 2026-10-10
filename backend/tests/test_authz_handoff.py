"""authz.assert_booked_sitter — who may upload handoff photos, and when."""

import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from app.deps.auth import CurrentUser
from app.services import authz
from fastapi import HTTPException

SITTER_ID = "00000000-0000-4000-8000-000000000002"
OTHER_SITTER = "00000000-0000-4000-8000-000000000003"
PET_ID = "00000000-0000-4000-8000-0000000000aa"
BOOKING_ID = "00000000-0000-4000-8000-0000000000b1"

SCHEMA = (Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "001_initial_schema.sql").read_text(
    encoding="utf-8"
)


def table_columns(table: str) -> set[str]:
    block = SCHEMA.split(f"create table public.{table} (", 1)[1].split("\n);", 1)[0]
    return {m.group(1) for m in re.finditer(r"^\s{2}([a-z_]+)\s", block, re.MULTILINE)} - {"check", "constraint"}


class FakeClient:
    """Answers the one bookings query and remembers what was selected."""

    def __init__(self, row: dict | None) -> None:
        self.row, self.selected = row, ""

    def table(self, name: str):
        assert name == "bookings"
        return self

    def select(self, columns: str):
        self.selected = columns
        return self

    def eq(self, *_a):
        return self

    def limit(self, _n):
        return self

    def execute(self):
        return SimpleNamespace(data=[self.row] if self.row else [])


def iso(delta: timedelta) -> str:
    return (datetime.now(UTC) + delta).isoformat()


def booking(*, status="confirmed", sitter=SITTER_ID, active=True, drop_in=timedelta(hours=1), pick_in=timedelta(days=2)):
    return {
        "id": BOOKING_ID,
        "sitter_id": sitter,
        "status": status,
        "booking_pets": [{"pet_id": PET_ID, "active": active}],
        "booking_handoffs": [
            {"kind": "drop_off", "status": "superseded", "scheduled_at": iso(-timedelta(days=9)), "completed_at": None},
            {"kind": "drop_off", "status": "agreed", "scheduled_at": iso(drop_in), "completed_at": None},
            {"kind": "pick_up", "status": "agreed", "scheduled_at": iso(pick_in), "completed_at": None},
        ],
    }


def sitter() -> CurrentUser:
    return CurrentUser(id=SITTER_ID, email=None, role="sitter", display_name="Chloe", access_token="t")


def check(monkeypatch: pytest.MonkeyPatch, row: dict | None) -> FakeClient:
    client = FakeClient(row)
    monkeypatch.setattr(authz, "get_service_client", lambda: client)
    authz.assert_booked_sitter(sitter(), BOOKING_ID, pet_id=PET_ID)
    return client


def test_selects_only_columns_that_exist(monkeypatch: pytest.MonkeyPatch) -> None:
    client = check(monkeypatch, booking())
    embedded = dict(re.findall(r"(\w+)\(([^)]*)\)", client.selected))
    for table, cols in embedded.items():
        wanted = {c.strip() for c in cols.split(",")}
        assert wanted <= table_columns(table), f"{table}: {wanted - table_columns(table)} not in schema"
    top = {c.strip() for c in re.sub(r"\w+\([^)]*\)", "", client.selected).split(",") if c.strip()}
    assert top <= table_columns("bookings")


def test_open_from_two_hours_before_drop_off(monkeypatch: pytest.MonkeyPatch) -> None:
    check(monkeypatch, booking(drop_in=timedelta(hours=1, minutes=50)))


def test_locked_earlier_than_two_hours_before_drop_off(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(HTTPException) as err:
        check(monkeypatch, booking(drop_in=timedelta(hours=2, minutes=10)))
    assert err.value.status_code == 403
    assert "2 hours before" in err.value.detail


def test_open_during_the_stay_and_just_after_pick_up(monkeypatch: pytest.MonkeyPatch) -> None:
    check(monkeypatch, booking(drop_in=-timedelta(days=2), pick_in=-timedelta(hours=1)))


def test_closed_two_hours_after_pick_up(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(HTTPException) as err:
        check(monkeypatch, booking(drop_in=-timedelta(days=3), pick_in=-timedelta(hours=3)))
    assert err.value.status_code == 403
    assert "ended" in err.value.detail


@pytest.mark.parametrize(
    ("row", "status_code"),
    [
        (None, 404),
        (booking(status="requested"), 403),
        (booking(status="cancelled"), 403),
        (booking(sitter=OTHER_SITTER), 403),
        (booking(active=False), 403),
    ],
)
def test_refuses_other_bookings(monkeypatch: pytest.MonkeyPatch, row: dict | None, status_code: int) -> None:
    with pytest.raises(HTTPException) as err:
        check(monkeypatch, row)
    assert err.value.status_code == status_code
