"""Create or refresh the demo accounts (phase-10 10.1 — accounts part).

Judges and the Try demo buttons sign in with these. Safe to run again: it resets
their password, name, and role metadata, and gives the demo sitter her services and
prices (without prices checkout cannot quote). Uses the Supabase Admin API with the service
role (D19 — never insert into auth.users with SQL); the signup trigger creates the
`profiles` + owner/sitter rows from user_metadata. Pets, bookings, and tasks join
this script in Phase 10.1.

    cd backend
    .venv/Scripts/python -m scripts.seed_demo           # Windows (create / refresh)
    .venv/bin/python -m scripts.seed_demo               # macOS / Linux
    .venv/Scripts/python -m scripts.seed_demo --check   # read-only: report only

Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_PASSWORD from backend/.env.
"""

import argparse
import sys
from dataclasses import dataclass

from app.config import get_settings
from app.deps.supabase import get_service_client
from supabase import Client

PAGE_SIZE = 200


@dataclass(frozen=True)
class DemoUser:
    email: str
    role: str
    display_name: str


DEMO_USERS = (
    DemoUser("demo-owner@goldito.test", "owner", "Robert"),
    DemoUser("demo-sitter@goldito.test", "sitter", "Chloe"),
)


# Chloe's menu (phase-03c Goal): boarding $55 / house sitting $70 a night, daycare $35 a day,
# +50% for each extra pet, +25% on a holiday — a 3-night boarding stay with 2 pets over
# Thanksgiving quotes $268.13 CAD. A rate can only be set for a service the sitter offers.
DEMO_SITTER_SERVICES = ["boarding", "house_sitting"]
DEMO_SITTER_RATES = {
    "boarding_nightly": 55,
    "house_sitting_nightly": 70,
    "daycare_daily": 35,
    "extra_pet_pct": 50,
    "holiday_pct": 25,
}


def find_user_id(client: Client, email: str) -> str | None:
    page = 1
    while True:
        users = client.auth.admin.list_users(page=page, per_page=PAGE_SIZE)
        for user in users:
            if (user.email or "").lower() == email:
                return user.id
        if len(users) < PAGE_SIZE:
            return None
        page += 1


def ensure_user(client: Client, demo: DemoUser, password: str) -> tuple[str, str]:
    metadata = {"role": demo.role, "display_name": demo.display_name}
    user_id = find_user_id(client, demo.email)
    if user_id is None:
        created = client.auth.admin.create_user(
            {
                "email": demo.email,
                "password": password,
                "email_confirm": True,
                "user_metadata": metadata,
            }
        )
        return created.user.id, "created"
    client.auth.admin.update_user_by_id(
        user_id, {"password": password, "email_confirm": True, "user_metadata": metadata}
    )
    return user_id, "updated"


def check_profile(client: Client, user_id: str, demo: DemoUser) -> str | None:
    """None when the trigger-made rows match, otherwise what is wrong."""
    rows = (
        client.table("profiles")
        .select("role, display_name")
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        return "profiles row missing — is the signup trigger (003) applied?"
    if rows[0]["role"] != demo.role:
        return f"profiles.role is {rows[0]['role']}, expected {demo.role}"
    role_table = f"{demo.role}_profiles"
    if not client.table(role_table).select("id").eq("id", user_id).limit(1).execute().data:
        return f"{role_table} row missing"
    return None


def ensure_sitter_rates(client: Client, sitter_id: str) -> str:
    """Services first (the rates trigger checks them), then the price row. Returns what it did."""
    client.table("sitter_profiles").update({"services": DEMO_SITTER_SERVICES}).eq(
        "id", sitter_id
    ).execute()
    existing = (
        client.table("sitter_rates").select("sitter_id").eq("sitter_id", sitter_id).limit(1).execute().data
    )
    if existing:
        client.table("sitter_rates").update(DEMO_SITTER_RATES).eq("sitter_id", sitter_id).execute()
        return "updated"
    client.table("sitter_rates").insert({"sitter_id": sitter_id, **DEMO_SITTER_RATES}).execute()
    return "created"


def check_sitter_rates(client: Client, sitter_id: str) -> str | None:
    """None when the sitter has a price row, otherwise what is wrong."""
    rows = client.table("sitter_rates").select("sitter_id").eq("sitter_id", sitter_id).limit(1).execute().data
    return None if rows else "no sitter_rates row — checkout cannot quote (run without --check)"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="read-only: report, change nothing")
    args = parser.parse_args()

    settings = get_settings()
    if not args.check and (not settings.demo_password or len(settings.demo_password) < 6):
        print("Set DEMO_PASSWORD (6+ characters) in backend/.env first.", file=sys.stderr)
        return 1

    client = get_service_client()
    all_ok = True
    for demo in DEMO_USERS:
        if args.check:
            user_id = find_user_id(client, demo.email)
            action = "exists" if user_id else "missing"
        else:
            user_id, action = ensure_user(client, demo, settings.demo_password)
        problem = check_profile(client, user_id, demo) if user_id else "account not created yet"
        if user_id and demo.role == "sitter" and problem is None:
            if args.check:
                problem = check_sitter_rates(client, user_id)
            else:
                action = f"{action}, rates {ensure_sitter_rates(client, user_id)}"
        all_ok = all_ok and problem is None
        status = "ok" if problem is None else problem
        print(f"{demo.email:<26} {demo.role:<6} {action:<8} {status}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
