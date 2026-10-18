"""The demo accounts: who they are, how to find them, and the sitter's services and prices.

The accounts come in sets, one owner and one sitter per teammate, so a reset only touches the set of whoever asks
for it. The first set is the default pair (Robert and Chloe) that the judges and the seed always used.
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


# name, species, breed, years old, kg, allergens: what the demo story shows on the owner's Home. The dog has a chicken
# allergy in every set, so the Treat check samples (chicken jerky) come out the same for everyone.
Pet = tuple[str, str, str, int, float, list[str]]

MAX_AND_MOCHI: tuple[Pet, ...] = (
    ("Max", "dog", "Maltese", 4, 3.2, ["chicken"]),
    ("Mochi", "cat", "Domestic Shorthair", 3, 4.1, []),
)


@dataclass(frozen=True)
class DemoSet:
    key: str
    label: str
    owner: DemoUser
    sitter: DemoUser
    pets: tuple[Pet, ...] = MAX_AND_MOCHI


# Keep in sync with frontend/lib/demo.ts.
DEMO_SETS = (
    DemoSet(
        "chloe",
        "Chloe",
        DemoUser("demo-owner@goldito.test", "owner", "Robert"),
        DemoUser("demo-sitter@goldito.test", "sitter", "Chloe"),
    ),
    DemoSet(
        "paul",
        "Paul",
        DemoUser("demo-owner-paul@goldito.test", "owner", "Peter"),
        DemoUser("demo-sitter-paul@goldito.test", "sitter", "Paul"),
        pets=(
            ("Biscuit", "dog", "Beagle", 5, 10.4, ["chicken"]),
            ("Luna", "cat", "Siamese", 2, 3.6, []),
        ),
    ),
    DemoSet(
        "allen",
        "Allen",
        DemoUser("demo-owner-allen@goldito.test", "owner", "Alex"),
        DemoUser("demo-sitter-allen@goldito.test", "sitter", "Allen"),
        pets=(
            ("Cooper", "dog", "Corgi", 3, 11.2, ["chicken"]),
            ("Olive", "cat", "British Shorthair", 4, 5.1, []),
        ),
    ),
)
DEFAULT_SET = DEMO_SETS[0]
# Every demo account, for the seed.
DEMO_USERS = tuple(user for demo_set in DEMO_SETS for user in (demo_set.owner, demo_set.sitter))


def set_for_email(email: str | None) -> DemoSet | None:
    """The set an email belongs to, or None. The email only names the set; the caller's id still decides."""
    lowered = (email or "").lower()
    return next((s for s in DEMO_SETS if lowered in (s.owner.email, s.sitter.email)), None)


def role_for_email(email: str | None) -> str | None:
    """"owner" or "sitter" for a demo account's email, otherwise None."""
    lowered = (email or "").lower()
    demo_set = set_for_email(lowered)
    if demo_set is None:
        return None
    return "owner" if lowered == demo_set.owner.email else "sitter"


def set_for_key(key: str) -> DemoSet:
    for demo_set in DEMO_SETS:
        if demo_set.key == key:
            return demo_set
    raise KeyError(key)


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

# Where the two demo homes are on the map (Phase 06B, D32): made-up points at park level, not real addresses.
# Chloe's place sits by Trinity Bellwoods Park, Robert's by Riverdale Park, about 7 km apart.
DEMO_HOME_POINTS = {
    "sitter": (43.6477, -79.4194),
    "owner": (43.6644, -79.3573),
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


def ensure_home_point(client: Client, role: str, user_id: str) -> None:
    """Give a demo account a home point so Start trip has a destination (06B)."""
    lat, lng = DEMO_HOME_POINTS[role]
    client.table(f"{role}_profiles").update({"home_lat": lat, "home_lng": lng}).eq("id", user_id).execute()
