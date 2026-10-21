"""The demo accounts: who they are, how to find them, and the sitter's services and prices.

The accounts come in sets, one owner and one sitter per teammate, so a reset only touches the set of whoever asks
for it. The first set is the default pair (Robert and Chloe) that the judges and the seed always used.
Shared by `scripts/seed_demo.py`, `scripts/reset_demo.py` and the demo reset service.
"""

from dataclasses import dataclass
from datetime import UTC, datetime

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


# What the owner would have answered in the sign-up questions (11.15, 014v), so the "at a glance" card shows on the demo
# pets without going through the flow. Keys follow frontend/features/ownerOnboarding/questions.ts.
DEMO_PET_PROFILES: dict[str, dict] = {
    "Max": {
        "v": 1,
        "coat": "white",
        "answers": {"d1": 4, "d2": 3, "d3": 4, "d4": 3, "d5": 2, "d6": 3, "d7": 2, "d8": 3, "d9": 3, "d10": 4, "d11": 3, "d12": 2},
        "safety": {"s1": "never", "s2": "all", "s3": "excited", "s4": "never", "s5": "nothing", "s6": "listed"},
    },
    "Mochi": {
        "v": 1,
        "coat": "gray",
        "answers": {"c1": 2, "c2": 2, "c3": 3, "c4": 3, "c5": 3, "c6": 2, "c7": 3, "c8": 2, "c9": 2, "c10": 2},
        "safety": {"s1": "never", "s2": "picky", "s3": "never", "s4": "never", "s5": "nothing", "s6": "none"},
    },
}


# Every demo pet's coat (one of COATS in frontend/features/ownerOnboarding/questions.ts), so each pixel pet (11.12) has
# its real color: the pets without sign-up answers get a profile with only the coat.
DEMO_COATS: dict[str, str] = {
    "Max": "white",
    "Mochi": "gray",
    "Biscuit": "mixed",
    "Luna": "cream",
    "Cooper": "orange",
    "Olive": "gray",
    "Teddy": "white",
    "Leo": "brown",
}


def demo_pet_profile(name: str) -> dict | None:
    """The `pets.profile` a demo pet starts with: its sign-up answers and coat, or only the coat."""
    if name in DEMO_PET_PROFILES:
        return DEMO_PET_PROFILES[name]
    if name in DEMO_COATS:
        return {"v": 1, "answers": {}, "safety": {}, "coat": DEMO_COATS[name]}
    return None


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
    DemoSet(
        "daniel",
        "Daniel",
        DemoUser("demo-owner-daniel@goldito.test", "owner", "David"),
        DemoUser("demo-sitter-daniel@goldito.test", "sitter", "Daniel"),
        pets=(
            ("Teddy", "dog", "Maltese", 4, 3.2, ["chicken"]),
            ("Leo", "cat", "British Shorthair", 4, 5.1, []),
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

# What a demo sitter said in onboarding (014f), so the profile an owner opens shows a real "About" and the search can
# tell sitters apart. Built-in questions only, display text; the same answers for every demo sitter.
# (key, answer text or None, choice or None)
DEMO_SITTER_ANSWERS: tuple[tuple[str, str | None, str | None], ...] = (
    ("walks_per_day", "Two walks, morning and evening, longer on weekends.", "2"),
    ("meals_per_day", "I follow your feeding plan.", "2"),
    ("home_all_day", "I work from home, so someone is always around.", "home"),
    ("activity", "Playtime in the yard, then quiet time on the couch.", "relaxed"),
    ("park_nearby", "There is a dog park a 5 minute walk away.", "yes"),
    ("dog_sizes", None, "small,medium"),
    ("cats", "Cats are welcome, they get their own room.", "yes"),
)

# Where the demo homes are on the map (Phase 06B, D32): public landmark addresses in Toronto, never a real person's
# home. Each account has its own, so the sitter search shows a spread of distances (about 0.6 to 14 km).
# address, lat, lng
DEMO_HOMES: dict[str, tuple[str, float, float]] = {
    "demo-owner@goldito.test": ("100 Queen St W, Toronto, ON M5H 2N2", 43.6534, -79.3841),
    "demo-owner-paul@goldito.test": ("127 Broadway Avenue, Toronto, ON M4P 0E3", 43.710201, -79.3923434),
    "demo-owner-allen@goldito.test": ("1 Yonge St, Toronto, ON M5E 1W7", 43.6419, -79.3752),
    "demo-owner-daniel@goldito.test": ("5100 Yonge St, Toronto, ON M2N 5V7", 43.7686, -79.4128),
    "demo-sitter@goldito.test": ("299 Queen St W, Toronto, ON M5V 2Z5", 43.6502, -79.3896),
    "demo-sitter-paul@goldito.test": ("55 Mill St, Toronto, ON M5A 3C4", 43.6503, -79.3596),
    "demo-sitter-allen@goldito.test": ("2 Bloor St W, Toronto, ON M4W 3E2", 43.6709, -79.3866),
    "demo-sitter-daniel@goldito.test": ("3401 Dufferin St, Toronto, ON M6A 2T9", 43.7253, -79.4524),
}

# The rough place owners see for a demo sitter ("Toronto M4W"), never the street.
DEMO_SERVICE_AREAS = {
    "demo-sitter@goldito.test": "Toronto M5V",
    "demo-sitter-paul@goldito.test": "Toronto M5A",
    "demo-sitter-allen@goldito.test": "Toronto M4W",
    "demo-sitter-daniel@goldito.test": "Toronto M6A",
}

# A demo account that is not in DEMO_HOMES gets a point by role.
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


def ensure_sitter_answers(client: Client, sitter_id: str) -> None:
    """Give a demo sitter the onboarding answers and mark onboarding as done (014f), so signing in does not send
    her through the questions. A sitter who already has answers (a teammate filled them in) keeps them."""
    has_answers = client.table("sitter_profile_answers").select("question_key").eq("sitter_id", sitter_id).limit(1).execute().data
    if not has_answers:
        for position, (key, answer, choice) in enumerate(DEMO_SITTER_ANSWERS):
            client.table("sitter_profile_answers").insert(
                {"sitter_id": sitter_id, "question_key": key, "answer": answer, "choice": choice, "position": position}
            ).execute()
    client.table("sitter_profiles").update({"onboarded_at": datetime.now(UTC).isoformat()}).eq("id", sitter_id).is_(
        "onboarded_at", "null"
    ).execute()


def ensure_owner_onboarded(client: Client, owner_id: str) -> None:
    """Mark a demo owner as done with the sign-up questions (014v), so signing in does not send them through the flow."""
    client.table("owner_profiles").update({"onboarded_at": datetime.now(UTC).isoformat()}).eq("id", owner_id).is_(
        "onboarded_at", "null"
    ).execute()


def check_sitter_rates(client: Client, sitter_id: str) -> str | None:
    """None when the sitter has a price row, otherwise what is wrong."""
    rows = client.table("sitter_rates").select("sitter_id").eq("sitter_id", sitter_id).limit(1).execute().data
    return None if rows else "no sitter_rates row — checkout cannot quote (run without --check)"


def ensure_home_point(client: Client, role: str, user_id: str, email: str | None = None) -> None:
    """Give a demo account its home address and point so the sitter search and Start trip work (06B)."""
    home = DEMO_HOMES.get((email or "").lower())
    if home:
        address, lat, lng = home
        fields = {"home_address": address, "home_lat": lat, "home_lng": lng}
        if role == "sitter" and (email or "").lower() in DEMO_SERVICE_AREAS:
            fields["service_area"] = DEMO_SERVICE_AREAS[(email or "").lower()]
    else:
        lat, lng = DEMO_HOME_POINTS[role]
        fields = {"home_lat": lat, "home_lng": lng}
    client.table(f"{role}_profiles").update(fields).eq("id", user_id).execute()
