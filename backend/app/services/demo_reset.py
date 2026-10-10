"""Put the two demo accounts into a known test state (review FB-10 + the temporary demo reset).

Five states, each a point to start a manual test from:

- `empty`      the owner has no pets; the sitter has her schedule, services and prices
- `pets`       Max + Mochi, nothing else (before any booking)
- `confirmed`  `pets` + one booking the sitter accepted, before checkout (Finish booking)
- `ready`      the same, paid; drop-off is in an hour, so the sitter's Received is open (it opens 2 h before)
- `in_care`    paid and received a moment ago: the pets are with the sitter (check-ins, photos, reports)

What the two accounts did **with each other** is deleted first (their bookings and inquiries, the
owner's pets' care data, the owner's inquiry index, the voice the sitter learned from those replies,
their notices that are not about another booking). Anything with a third account stays: another
owner's booking with the sitter (and its reports, Life Records and notices), another sitter's
inquiry from the owner. If the sitter has a confirmed booking with someone else, her schedule is
kept as it is (removing it would break that booking). Cloudinary files, the sitter's policy text
and index, her style card and her seeded tone samples stay. The `confirmed` booking is made with the real RPCs, signed in as the two
demo users, so it passes the same rules a person's does. Used by `scripts/reset_demo.py`
and (while it is switched on, for testing only) `POST /api/demo/reset`.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

import httpx
from supabase import Client

from app.config import get_settings
from app.services import authz
from app.services.demo_accounts import DEMO_USERS, ensure_sitter_rates, find_user_id

State = Literal["empty", "pets", "confirmed", "ready", "in_care"]
STATES: tuple[State, ...] = ("empty", "pets", "confirmed", "ready", "in_care")

OPEN_DAYS = 60
# Knowledge chunks that come from stays; the sitter's own policy text (`sitter_policy`) stays.
STAY_CHUNKS = ["life_record", "inquiry", "care_request"]
# Samples the sitter's approvals made; the seeded `history` samples stay (they are the voice).
LEARNED_SAMPLES = ["approved", "edited", "regenerated"]
PETS = (
    # name, species, breed, years old, kg, allergens — what the demo story shows on Home
    ("Max", "dog", "Maltese", 4, 3.2, ["chicken"]),
    ("Mochi", "cat", "Domestic Shorthair", 3, 4.1, []),
)


@dataclass(frozen=True)
class Step:
    label: str
    table: str
    # Every column must match one of its values (an `in` filter per column).
    where: dict[str, list] = field(default_factory=dict)
    # Columns that must be null.
    nulls: tuple[str, ...] = ()


def plan(
    owner_id: str,
    sitter_id: str,
    pet_ids: list[str],
    state: State = "pets",
    *,
    pair_message_ids: list[str] | None = None,
    keep_schedule: bool = False,
) -> list[Step]:
    """What to delete, in order. Only the pair's own bookings and inquiries; their children cascade.
    `pair_message_ids` are the messages of the pair's inquiries (the voice learned from them goes first,
    before the inquiries take the link with them)."""
    pair = {"owner_id": [owner_id], "sitter_id": [sitter_id]}
    steps = [
        Step("learned tone samples", "tone_samples", {"sitter_id": [sitter_id], "source": LEARNED_SAMPLES, "source_message_id": pair_message_ids or []}),
        Step("bookings", "bookings", pair),
        Step("inquiries", "inquiries", pair),
        # Notices about a booking went with it; one about another account's booking stays.
        Step("notifications", "notifications", {"user_id": [owner_id, sitter_id]}, nulls=("booking_id",)),
    ]
    for label, table in (
        ("feed posts", "feed_posts"),
        ("daily reports (pets)", "daily_reports"),
        ("quick check-ins", "care_checkins"),
        ("task logs", "task_logs"),
        ("care tasks", "care_tasks"),
        ("care requests", "care_requests"),
        ("care change requests", "care_change_requests"),
        ("pet cautions", "pet_cautions"),
        ("Life Records", "pet_life_records"),
        ("media rows", "media"),
    ):
        steps.append(Step(label, table, {"pet_id": pet_ids}))
    steps += [
        Step("knowledge chunks (pets)", "knowledge_chunks", {"source_type": STAY_CHUNKS, "pet_id": pet_ids}),
        Step("knowledge chunks (owner)", "knowledge_chunks", {"source_type": STAY_CHUNKS, "owner_id": [owner_id]}),
    ]
    if not keep_schedule:
        steps.append(Step("schedule rows", "sitter_availability", {"sitter_id": [sitter_id]}))
    if state == "empty":
        steps.append(Step("pets", "pets", {"owner_id": [owner_id]}))
    return steps


def _query(client: Client, step: Step, op: str):
    query = client.table(step.table).select("id") if op == "count" else client.table(step.table).delete()
    for column, values in step.where.items():
        query = query.in_(column, values)
    for column in step.nulls:
        query = query.is_(column, "null")
    return query.execute()


def count_rows(client: Client, step: Step) -> int:
    if any(not values for values in step.where.values()):
        return 0  # an empty `in ()` matches nothing (e.g. an owner with no pets yet)
    return len(_query(client, step, "count").data)


def delete_rows(client: Client, step: Step) -> None:
    if any(not values for values in step.where.values()):
        return
    _query(client, step, "delete")


def demo_ids(client: Client) -> tuple[str, str]:
    owner, sitter = (find_user_id(client, demo.email) for demo in DEMO_USERS)
    if not owner or not sitter:
        raise LookupError("A demo account is missing — run `python -m scripts.seed_demo` first.")
    return owner, sitter


def pair_message_ids(client: Client, owner_id: str, sitter_id: str) -> list[str]:
    """The messages of the inquiries between the two demo accounts."""
    inquiries = client.table("inquiries").select("id").eq("owner_id", owner_id).eq("sitter_id", sitter_id).execute().data
    if not inquiries:
        return []
    rows = client.table("inquiry_messages").select("id").in_("inquiry_id", [i["id"] for i in inquiries]).execute().data
    return [row["id"] for row in rows]


def sitter_has_other_bookings(client: Client, owner_id: str, sitter_id: str) -> bool:
    """A confirmed booking of the sitter with someone else: her schedule must stay (the availability guard
    refuses to remove the slots it holds)."""
    rows = client.table("bookings").select("id").eq("sitter_id", sitter_id).neq("owner_id", owner_id).eq("status", "confirmed").limit(1).execute().data
    return bool(rows)


def owner_pet_ids(client: Client, owner_id: str) -> list[str]:
    rows = client.table("pets").select("id").eq("owner_id", owner_id).execute().data
    return [row["id"] for row in rows]


def ensure_pets(client: Client, owner_id: str, today: date) -> list[str]:
    """Create Max / Mochi when missing (never duplicates one that is there). Returns what was added."""
    existing = {row["name"] for row in client.table("pets").select("id, name").eq("owner_id", owner_id).execute().data}
    added = []
    for name, species, breed, years, kg, allergens in PETS:
        if name in existing:
            continue
        birthdate = today.replace(year=today.year - years, day=min(today.day, 28))
        pet = (
            client.table("pets")
            .insert(
                {
                    "owner_id": owner_id,
                    "species": species,
                    "name": name,
                    "breed": breed,
                    "birthdate": birthdate.isoformat(),
                    "weight_kg": kg,
                }
            )
            .execute()
            .data[0]
        )
        for allergen in allergens:
            client.table("pet_allergies").insert({"pet_id": pet["id"], "allergen": allergen}).execute()
        added.append(name)
    return added


def open_schedule(client: Client, sitter_id: str, today: date) -> int:
    """Open the next 60 days in the sitter's default hours, nothing blocked. Returns the rows added."""
    profile = (
        client.table("sitter_profiles")
        .select("default_hours, default_max_pets")
        .eq("id", sitter_id)
        .limit(1)
        .execute()
        .data[0]
    )
    end = today + timedelta(days=OPEN_DAYS)
    rows = [
        {
            "sitter_id": sitter_id,
            "kind": "open",
            "start_date": today.isoformat(),
            "end_date": end.isoformat(),
            "slot": slot,
            "starts_at": hours[0],
            "ends_at": hours[1],
            "max_pets": profile["default_max_pets"],
        }
        for slot, hours in profile["default_hours"].items()
    ]
    for row in rows:
        client.table("sitter_availability").insert(row).execute()
    return len(rows)


def sync_display_names(client: Client, owner_id: str, sitter_id: str) -> None:
    """profiles.display_name is only written by the signup trigger, so a renamed demo user keeps the old one (M-24)."""
    ids = {"owner": owner_id, "sitter": sitter_id}
    for demo in DEMO_USERS:
        client.table("profiles").update({"display_name": demo.display_name}).eq("id", ids[demo.role]).execute()


def tone_history_count(client: Client, sitter_id: str) -> int:
    rows = client.table("tone_samples").select("id").eq("sitter_id", sitter_id).eq("source", "history").execute().data
    return len(rows)


def sign_in(email: str) -> str:
    """The access token of a demo user (password grant), to call the booking RPCs as that user."""
    settings = get_settings()
    if not settings.demo_password or not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("DEMO_PASSWORD, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    response = httpx.post(
        f"{settings.supabase_url.rstrip('/')}/auth/v1/token",
        params={"grant_type": "password"},
        headers={"apikey": settings.supabase_service_role_key},
        json={"email": email, "password": settings.demo_password},
        timeout=10.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Could not sign in {email} ({response.status_code}) — run `python -m scripts.seed_demo`.")
    return response.json()["access_token"]


def stay_times(state: State, now: datetime, today: date) -> tuple[datetime, datetime]:
    """Drop-off and pick-up for a state. `ready` and `in_care` start soon on purpose: the sitter's Received
    opens 2 h before the agreed drop-off, and care tools work from 30 min before it."""
    if state == "ready":
        drop_off = now + timedelta(hours=1)
    elif state == "in_care":
        drop_off = now + timedelta(minutes=3)  # a request cannot start in the past, so a little ahead
    else:
        drop_off = datetime.combine(today + timedelta(days=2), time(9, 30), now.tzinfo)
    pick_up = datetime.combine(drop_off.date() + timedelta(days=3), time(17, 0), now.tzinfo)
    return drop_off, pick_up


def _insert_as(token: str, table: str, row: dict) -> None:
    """Insert a row as a signed-in user (their JWT), the way the app does, so row-level rules apply."""
    settings = get_settings()
    response = httpx.post(
        f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}",
        headers={
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        json=row,
        timeout=10.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Could not insert into {table} ({response.status_code}): {response.text[:200]}")


def _sign_and_pay(owner_token: str, owner_id: str, owner_name: str, booking: str) -> None:
    """What the checkout does: sign every required consent (demo values), then the demo payment."""
    for kind in authz.rpc_json(owner_token, "required_consents", {"p_booking": booking}):
        details: dict = {}
        if kind == "emergency_vet":
            details = {"limit_cad": 500, "vet_clinic_name": "Demo Vet Clinic"}
        elif kind == "safe_return":
            details = {"receiver_name": owner_name}
        _insert_as(
            owner_token,
            "booking_consents",
            {
                "booking_id": booking,
                "kind": kind,
                "version": "1",
                "signer_id": owner_id,
                "signer_name": owner_name,
                "details": details,
            },
        )
    authz.rpc_json(owner_token, "pay_booking_demo", {"p_booking": booking}, timeout=20.0)


# A booking creator takes (client, owner_id, sitter_id, today, state) and returns the booking id; tests pass a fake.
Booker = Callable[[Client, str, str, date, State], str]


def book_for_state(client: Client, owner_id: str, sitter_id: str, today: date, state: State) -> str:
    """The owner requests a boarding stay (both pets, the sitter's place), the Meet & Greet is skipped by
    agreement and the sitter accepts ("Chloe accepted — Finish booking"). `ready` and `in_care` go on with
    the checkout (consents + demo payment); `in_care` also has the sitter tap Received."""
    owner_demo, sitter_demo = (next(d for d in DEMO_USERS if d.role == role) for role in ("owner", "sitter"))
    owner_token, sitter_token = sign_in(owner_demo.email), sign_in(sitter_demo.email)
    tz = ZoneInfo(get_settings().app_timezone)
    drop_off, pick_up = stay_times(state, datetime.now(tz), today)
    booking = authz.rpc_json(
        owner_token,
        "request_booking",
        {
            "p_sitter": sitter_id,
            "p_pets": owner_pet_ids(client, owner_id),
            "p_drop_off_at": drop_off.isoformat(),
            "p_drop_off_location_type": "sitter_home",
            "p_drop_off_note": None,
            "p_pick_up_at": pick_up.isoformat(),
            "p_pick_up_location_type": "sitter_home",
            "p_pick_up_note": None,
            "p_note": None,
            "p_service_type": "boarding",
        },
        timeout=20.0,
    )
    authz.rpc_json(owner_token, "request_skip_meet_greet", {"p_booking": booking})
    authz.rpc_json(sitter_token, "respond_skip_meet_greet", {"p_booking": booking, "p_accept": True})
    authz.rpc_json(sitter_token, "respond_booking", {"p_booking": booking, "p_accept": True})
    if state in ("ready", "in_care"):
        _sign_and_pay(owner_token, owner_id, owner_demo.display_name, booking)
    if state == "in_care":
        authz.rpc_json(sitter_token, "complete_handoff", {"p_booking": booking, "p_kind": "drop_off"})
    return booking


def reset(
    client: Client,
    owner_id: str,
    sitter_id: str,
    today: date,
    *,
    state: State = "pets",
    apply: bool,
    book: Booker = book_for_state,
) -> list[tuple[str, int]]:
    """Dry run counts each step; apply deletes, then builds the state. Returns (label, rows)."""
    if state not in STATES:
        raise ValueError(f"unknown state {state!r}")
    report = []
    keep_schedule = sitter_has_other_bookings(client, owner_id, sitter_id)
    steps = plan(
        owner_id, sitter_id, owner_pet_ids(client, owner_id), state,
        pair_message_ids=pair_message_ids(client, owner_id, sitter_id), keep_schedule=keep_schedule,
    )
    for step in steps:
        report.append((step.label, count_rows(client, step)))
        if apply:
            delete_rows(client, step)
    if keep_schedule:
        report.append(("schedule kept (the sitter has another owner's confirmed booking)", 0))
    if apply:
        if state != "empty":
            ensure_pets(client, owner_id, today)
        ensure_sitter_rates(client, sitter_id)
        if not keep_schedule:
            open_schedule(client, sitter_id, today)
        sync_display_names(client, owner_id, sitter_id)
        if state in ("confirmed", "ready", "in_care"):
            book(client, owner_id, sitter_id, today, state)
    return report
