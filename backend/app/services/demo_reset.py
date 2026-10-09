"""Put the two demo accounts into a known test state (review FB-10 + the temporary demo reset).

Three states, each a point to start a manual test from:

- `empty`      the owner has no pets; the sitter has her schedule, services and prices
- `pets`       Max + Mochi, nothing else (before any booking)
- `confirmed`  `pets` + one booking the sitter accepted, before checkout (Finish booking)

Everything the stays, inquiries and reports of the two accounts created is deleted first;
Cloudinary files, the sitter's policy text and index, her style card and her seeded tone
samples stay. The `confirmed` booking is made with the real RPCs, signed in as the two
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

State = Literal["empty", "pets", "confirmed"]
STATES: tuple[State, ...] = ("empty", "pets", "confirmed")

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


def plan(owner_id: str, sitter_id: str, pet_ids: list[str], state: State = "pets") -> list[Step]:
    """What to delete, in order. Bookings and inquiries go first; their children cascade."""
    both = [owner_id, sitter_id]
    steps = [
        Step("bookings (owner side)", "bookings", {"owner_id": both}),
        Step("bookings (sitter side)", "bookings", {"sitter_id": both}),
        Step("inquiries (owner side)", "inquiries", {"owner_id": both}),
        Step("inquiries (sitter side)", "inquiries", {"sitter_id": both}),
        Step("notifications", "notifications", {"user_id": both}),
        Step("daily reports (sitter)", "daily_reports", {"sitter_id": [sitter_id]}),
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
        Step("knowledge chunks (sitter)", "knowledge_chunks", {"source_type": STAY_CHUNKS, "sitter_id": [sitter_id]}),
        Step("learned tone samples", "tone_samples", {"sitter_id": [sitter_id], "source": LEARNED_SAMPLES}),
        Step("schedule rows", "sitter_availability", {"sitter_id": [sitter_id]}),
    ]
    if state == "empty":
        steps.append(Step("pets", "pets", {"owner_id": [owner_id]}))
    return steps


def _query(client: Client, step: Step, op: str):
    query = client.table(step.table).select("id") if op == "count" else client.table(step.table).delete()
    for column, values in step.where.items():
        query = query.in_(column, values)
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


# A booking creator takes (client, owner_id, sitter_id, today) and returns the booking id; tests pass a fake.
Booker = Callable[[Client, str, str, date], str]


def book_and_accept(client: Client, owner_id: str, sitter_id: str, today: date) -> str:
    """Owner requests a boarding stay (both pets, sitter's place), the Meet & Greet is skipped by
    agreement and the sitter accepts: the state "Chloe accepted — Finish booking"."""
    owner_email, sitter_email = (demo.email for demo in sorted(DEMO_USERS, key=lambda d: d.role != "owner"))
    owner_token, sitter_token = sign_in(owner_email), sign_in(sitter_email)
    tz = ZoneInfo(get_settings().app_timezone)
    drop_off = datetime.combine(today + timedelta(days=2), time(9, 30), tz)
    pick_up = datetime.combine(today + timedelta(days=5), time(17, 0), tz)
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
    return booking


def reset(
    client: Client,
    owner_id: str,
    sitter_id: str,
    today: date,
    *,
    state: State = "pets",
    apply: bool,
    book: Booker = book_and_accept,
) -> list[tuple[str, int]]:
    """Dry run counts each step; apply deletes, then builds the state. Returns (label, rows)."""
    if state not in STATES:
        raise ValueError(f"unknown state {state!r}")
    report = []
    for step in plan(owner_id, sitter_id, owner_pet_ids(client, owner_id), state):
        report.append((step.label, count_rows(client, step)))
        if apply:
            delete_rows(client, step)
    if apply:
        if state != "empty":
            ensure_pets(client, owner_id, today)
        ensure_sitter_rates(client, sitter_id)
        open_schedule(client, sitter_id, today)
        sync_display_names(client, owner_id, sitter_id)
        if state == "confirmed":
            book(client, owner_id, sitter_id, today)
    return report
