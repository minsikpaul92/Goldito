"""The two demo accounts: who they are, how to find them, and the sitter's services and prices.

Shared by `scripts/seed_demo.py`, `scripts/reset_demo.py` and the demo reset service.
"""

from dataclasses import dataclass

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
