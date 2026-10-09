"""Reset the two demo accounts to a clean test state (review FB-10).

Walking the whole flow from the first booking needs both accounts empty: the owner has
only her pets, the sitter has an open schedule and her prices. This script deletes what
the stays, inquiries and reports of the two demo accounts created, then makes sure the
starting state exists. It is a hosted-database write and cannot be undone, so:

    cd backend
    .venv/bin/python -m scripts.reset_demo            # dry run: counts what would go, changes nothing
    .venv/bin/python -m scripts.reset_demo --apply    # asks you to type reset, then deletes + re-seeds

Cascades (booking handoffs, slots, consents, reviews, Life Records, thread messages) go
with their booking / inquiry. Cloudinary files are not touched. The sitter's policy text
and its index, her style card and her "history" tone samples are kept (re-indexing costs
model calls); the script tells you if the history samples are missing.

Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from backend/.env. Never run it against
a project that holds real data: it is for the demo project only.
"""

import argparse
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.deps.supabase import get_service_client
from scripts import seed_demo
from supabase import Client

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


def plan(owner_id: str, sitter_id: str, pet_ids: list[str]) -> list[Step]:
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
    owner, sitter = (seed_demo.find_user_id(client, demo.email) for demo in seed_demo.DEMO_USERS)
    if not owner or not sitter:
        raise SystemExit("A demo account is missing — run `python -m scripts.seed_demo` first.")
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
    for demo in seed_demo.DEMO_USERS:
        client.table("profiles").update({"display_name": demo.display_name}).eq("id", ids[demo.role]).execute()


def tone_history_count(client: Client, sitter_id: str) -> int:
    rows = client.table("tone_samples").select("id").eq("sitter_id", sitter_id).eq("source", "history").execute().data
    return len(rows)


def reset(client: Client, owner_id: str, sitter_id: str, today: date, *, apply: bool) -> list[tuple[str, int]]:
    """Dry run counts each step; apply deletes, then re-creates the starting state. Returns (label, rows)."""
    steps = plan(owner_id, sitter_id, owner_pet_ids(client, owner_id))
    report = []
    for step in steps:
        rows = count_rows(client, step)
        report.append((step.label, rows))
        if apply:
            delete_rows(client, step)
    if apply:
        ensure_pets(client, owner_id, today)
        seed_demo.ensure_sitter_rates(client, sitter_id)
        open_schedule(client, sitter_id, today)
        sync_display_names(client, owner_id, sitter_id)
    return report


def confirmed(answer: str) -> bool:
    """`reset` in any case, with stray spaces ignored."""
    return answer.strip().lower() == "reset"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="really delete (default: dry run)")
    parser.add_argument("--yes", action="store_true", help="skip the typed confirmation (with --apply)")
    args = parser.parse_args()

    settings = get_settings()
    client = get_service_client()
    owner_id, sitter_id = demo_ids(client)
    today = datetime.now(ZoneInfo(settings.app_timezone)).date()

    print(f"Project: {settings.supabase_url}")
    print(f"Owner {owner_id[:8]}… · sitter {sitter_id[:8]}…  ({'APPLY' if args.apply else 'dry run'})")
    if args.apply and not args.yes:
        answer = input("This deletes the demo accounts' stays, inquiries, reports and notices. Type reset to continue: ")
        if not confirmed(answer):
            print("Cancelled — nothing changed.")
            return 1

    for label, rows in reset(client, owner_id, sitter_id, today, apply=args.apply):
        print(f"  {'deleted' if args.apply else 'would delete':<13} {rows:>4}  {label}")
    print("  (rows that cascade from bookings and inquiries go with them)")

    if args.apply:
        print(f"Re-created: Max + Mochi if missing · services + prices · {OPEN_DAYS} open days · display names")
    else:
        print("Dry run only — add --apply to delete and re-create the starting state.")
    if tone_history_count(client, sitter_id) == 0:
        print("Note: the sitter has no seeded tone samples — run `python scripts/seed_tone.py --apply`.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
