"""What the two demo accounts did before today, so Bookings, Moments (Photos and Diary) and the chat have something to show.

Built by `demo_reset.reset` after the starting state. Written with the service role (past dates cannot go through the
booking RPCs), except the cancelled request, which uses the real ones:

- two stays that are over (August and September, 3 nights, both pets): paid, handed over and returned, so they sit under
  Past; per care day and pet one shared photo and one sent Diary page by the sitter
- one request the owner cancelled (a stay three weeks ahead)
- three private Diary pages of the owner (August, September and October), each with a private photo of their own
- `in_care` only: a few shared photos from today's care, and one private photo of the sitter

The photos are files the sitter and owner "uploaded": Cloudinary ids `goldito/seed/<set>/<species>_<n>` that
`scripts.seed_photos` uploaded once from `frontend/assets/demo`. A seed media row is removed and written again on every
reset, which also takes its feed posts with it.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from supabase import Client

from app.config import get_settings
from app.services.demo_accounts import DEFAULT_SET, DEMO_SITTER_RATES, DemoSet

SEED_FOLDER = "goldito/seed"
PHOTOS_PER_SPECIES = 14  # ids `<species>_00` .. `<species>_13` per set
PHOTO_SIZE = (900, 1200)  # every demo photo is 3:4

# Where each species' photos come from (relative to frontend/assets/demo); ids cycle over the list.
SEED_FILES: dict[str, tuple[str, ...]] = {
    "dog": (
        "mumu/mumu_lake_walk.jpg",
        "mumu/mumu_green_toy.jpg",
        "mood/maltese_tug_toy.jpg",
        "mood/maltese_cafe_street.jpg",
        "mumu/mumu_blossom_basket.jpg",
        "mumu/mumu_leather_chair.jpg",
        "mumu/mumu_pink_jacket_bed.jpg",
        "mumu/mumu_car_hat.jpg",
        "mumu/mumu_red_pillow.jpg",
        "mumu/mumu_stroller_hat.jpg",
        "mood/terrier_tongue_out_kitchen.jpg",
        "mumu/mumu_party_hat.jpg",
        "mumu/mumu_car_tongue_out.jpg",
        "mood/maltese_grass_leash.jpg",
    ),
    "cat": (
        "mood/orange_cat_lying_relaxed.jpg",
        "mood/cream_cat_wary_hallway.jpg",
        "mood/tortoiseshell_cat_belly_up_trusting.jpg",
        "mood/gray_cat_blank_stare.jpg",
        "mood/black_cat_startled_curious.jpg",
    ),
}

CATEGORIES = ("meal", "walk", "play", "nap")  # a care day's photo tags, in turn
DAY_TAGS = {"meal": "meal", "walk": "walk", "play": "other", "nap": "nap"}

# One line per care day, in the sitter's voice. {n} is the pet's name.
SITTER_LINES: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "dog": (
        (
            "{n} settled in quickly and finished dinner.",
            "A long walk by the lake, then a nap in the sun.",
            "Lots of fetch in the yard today.",
            "Last day: a short walk and cuddles before pick-up.",
        ),
        (
            "{n} trotted in like a regular. Dinner gone in a minute.",
            "Park day. {n} met two new friends.",
            "Rainy, so we played tug indoors.",
            "Quiet morning, home safe at pick-up.",
        ),
    ),
    "cat": (
        (
            "{n} hid under the bed for an hour, then came out to explore.",
            "Breakfast eaten, window nap in the afternoon.",
            "Lots of purring on the couch today.",
            "Relaxed morning, ready for pick-up.",
        ),
        (
            "{n} walked right in and claimed the armchair.",
            "Played with the feather toy until nap time.",
            "A sunny spot, a long nap and a small treat.",
            "Calm last day. All packed up.",
        ),
    ),
}
OWNER_LINES = (
    "First night without {n}. The house is too quiet. The sitter's photos help.",
    "{n}'s vet check went well. Weight is steady.",
    "{n} learned to wait at the door. A treat after every walk.",
)


@dataclass
class Pet:
    id: str
    name: str
    species: str


@dataclass
class Photos:
    """Hands out the next seed photo of a species and writes its media row."""

    client: Client
    set_key: str
    used: dict[str, int] = field(default_factory=dict)

    def media(self, pet: Pet, uploaded_by: str, created_at: datetime) -> str:
        n = self.used.get(pet.species, 0)
        self.used[pet.species] = n + 1
        n %= PHOTOS_PER_SPECIES
        row = {
            "pet_id": pet.id,
            "uploaded_by": uploaded_by,
            "cloudinary_public_id": seed_public_id(self.set_key, pet.species, n),
            "resource_type": "image",
            "purpose": "feed",
            "width": PHOTO_SIZE[0],
            "height": PHOTO_SIZE[1],
            "created_at": created_at.isoformat(),
        }
        return self.client.table("media").insert(row).execute().data[0]["id"]


def seed_public_id(set_key: str, species: str, n: int) -> str:
    return f"{SEED_FOLDER}/{set_key}/{species}_{n:02d}"


def seed_photo_files(set_key: str) -> list[tuple[str, str]]:
    """(Cloudinary id, file under frontend/assets/demo) for every photo a set can use."""
    files = []
    for species, names in SEED_FILES.items():
        for n in range(PHOTOS_PER_SPECIES):
            files.append((seed_public_id(set_key, species, n), names[n % len(names)]))
    return files


def stay_years(today: date) -> int:
    """The year of the August and September stays: the latest one that is already over."""
    return today.year if date(today.year, 9, 19) < today else today.year - 1


def species_of(pet: dict) -> str:
    return "cat" if pet.get("species") == "cat" else "dog"


def _at(day: date, clock: time, tz: ZoneInfo) -> datetime:
    return datetime.combine(day, clock, tz)


def _booking_price(pets: int, nights: int) -> dict:
    unit = DEMO_SITTER_RATES["boarding_nightly"]
    base = unit * nights
    extra = base * DEMO_SITTER_RATES["extra_pet_pct"] / 100 * (pets - 1)
    return {
        "service": "boarding",
        "nights": nights,
        "days": nights + 1,
        "unit_price": unit,
        "base": base,
        "extra_pets": extra,
        "holiday_days": [],
        "holiday_surcharge": 0,
        "total": base + extra,
        "currency": "CAD",
        "rate_version": "seed",
    }


def seed_past_stay(
    client: Client,
    owner_id: str,
    sitter_id: str,
    pets: list[Pet],
    start: date,
    photos: Photos,
    which: int,
) -> str:
    """A finished boarding stay: paid, dropped off and picked up, a shared photo and a sent page per care day and pet."""
    tz = ZoneInfo(get_settings().app_timezone)
    nights = 3
    drop_off, pick_up = (
        _at(start, time(9, 30), tz),
        _at(start + timedelta(days=nights), time(17, 0), tz),
    )
    made = drop_off - timedelta(days=9)
    booking = (
        client.table("bookings")
        .insert(
            {
                "owner_id": owner_id,
                "sitter_id": sitter_id,
                "start_date": start.isoformat(),
                "end_date": (start + timedelta(days=nights)).isoformat(),
                "status": "confirmed",
                "service_type": "boarding",
                "meet_greet_status": "skipped",
                "sitter_interest_at": made.isoformat(),
                "owner_agreed_at": made.isoformat(),
                "sitter_accepted_at": (made + timedelta(hours=3)).isoformat(),
                "responded_at": (made + timedelta(hours=3)).isoformat(),
                "paid_at": (made + timedelta(hours=5)).isoformat(),
                "price_snapshot": _booking_price(len(pets), nights),
                "created_at": made.isoformat(),
            }
        )
        .execute()
        .data[0]["id"]
    )
    for pet in pets:
        client.table("booking_pets").insert(
            {
                "booking_id": booking,
                "pet_id": pet.id,
                "care_range": f"[{drop_off.isoformat()},{pick_up.isoformat()})",
                "active": True,
            }
        ).execute()
    for kind, when in (("drop_off", drop_off), ("pick_up", pick_up)):
        client.table("booking_handoffs").insert(
            {
                "booking_id": booking,
                "kind": kind,
                "scheduled_at": when.isoformat(),
                "location_type": "sitter_home",
                "within_sitter_hours": True,
                "status": "agreed",
                "proposed_by": owner_id,
                "responded_at": made.isoformat(),
                "completed_at": when.isoformat(),
            }
        ).execute()
    for day in range(nights + 1):
        posted = _at(start + timedelta(days=day), time(15, 0), tz)
        for pet in pets:
            media = photos.media(pet, sitter_id, posted)
            tag = CATEGORIES[day % len(CATEGORIES)]
            line = SITTER_LINES[pet.species][which][day].format(n=pet.name)
            client.table("feed_posts").insert(
                {
                    "pet_id": pet.id,
                    "sitter_id": sitter_id,
                    "posted_by": sitter_id,
                    "media_id": media,
                    "caption": line,
                    "caption_source": "task",
                    "category": DAY_TAGS[tag],
                    "visibility": "shared",
                    "created_at": posted.isoformat(),
                    "taken_at": posted.isoformat(),
                }
            ).execute()
            client.table("daily_reports").insert(
                {
                    "pet_id": pet.id,
                    "sitter_id": sitter_id,
                    "report_date": (start + timedelta(days=day)).isoformat(),
                    "body": line,
                    "status": "sent",
                    "inputs": {"seed": True},
                    "sent_at": (posted + timedelta(hours=4)).isoformat(),
                    "media_id": media,
                }
            ).execute()
    return booking


def seed_owner_pages(
    client: Client, owner_id: str, pets: list[Pet], today: date, photos: Photos
) -> None:
    """Three private pages of the owner (August, September, October) with a private photo each."""
    tz = ZoneInfo(get_settings().app_timezone)
    year = stay_years(today)
    days = (date(year, 8, 20), date(year, 9, 24), today)
    for i, day in enumerate(days):
        pet = pets[i % len(pets)]
        written = (
            _at(day, time(20, 30), tz) if day < today else datetime.now(tz) - timedelta(hours=1)
        )
        media = photos.media(pet, owner_id, written)
        client.table("feed_posts").insert(
            {
                "pet_id": pet.id,
                "sitter_id": None,
                "posted_by": owner_id,
                "media_id": media,
                "visibility": "private",
                "created_at": written.isoformat(),
                "taken_at": written.isoformat(),
            }
        ).execute()
        client.table("daily_reports").insert(
            {
                "pet_id": pet.id,
                "sitter_id": owner_id,
                "report_date": day.isoformat(),
                "body": OWNER_LINES[i].format(n=pet.name),
                "status": "sent",
                "inputs": {"by": "owner"},
                "sent_at": written.isoformat(),
                "media_id": media,
            }
        ).execute()


def seed_today_photos(client: Client, sitter_id: str, pets: list[Pet], photos: Photos) -> None:
    """In care now: two shared photos per pet from the sitter, and one private photo that only the sitter sees."""
    now = datetime.now(ZoneInfo(get_settings().app_timezone))
    lines = ("Settling in.", "Snack time.")
    for k, line in enumerate(lines):
        for pet in pets:
            posted = now - timedelta(minutes=40 - 15 * k)
            client.table("feed_posts").insert(
                {
                    "pet_id": pet.id,
                    "sitter_id": sitter_id,
                    "posted_by": sitter_id,
                    "media_id": photos.media(pet, sitter_id, posted),
                    "caption": line,
                    "caption_source": "task",
                    "category": "meal" if k else "mood",
                    "visibility": "shared",
                    "created_at": posted.isoformat(),
                    "taken_at": posted.isoformat(),
                }
            ).execute()
    posted = now - timedelta(minutes=5)
    client.table("feed_posts").insert(
        {
            "pet_id": pets[0].id,
            "sitter_id": sitter_id,
            "posted_by": sitter_id,
            "media_id": photos.media(pets[0], sitter_id, posted),
            "caption": None,
            "caption_source": "task",
            "visibility": "private",
            "created_at": posted.isoformat(),
            "taken_at": posted.isoformat(),
        }
    ).execute()


def clear_seed_media(client: Client, pet_ids: list[str], set_key: str) -> None:
    """Remove the seed photos of the pets (their feed posts go with them), so a reset can write them again."""
    if pet_ids:
        client.table("media").delete().in_("pet_id", pet_ids).like(
            "cloudinary_public_id", f"{SEED_FOLDER}/{set_key}/%"
        ).execute()


def seed_history(
    client: Client,
    owner_id: str,
    sitter_id: str,
    today: date,
    state: str,
    demo_set: DemoSet = DEFAULT_SET,
    cancelled: str | None = None,
) -> None:
    """Write the stays that are over, the owner's pages and, for `in_care`, today's photos. `cancelled` is the id of the
    cancelled request from `seed_cancelled_request`: its notices are removed so the bell stays quiet."""
    rows = (
        client.table("pets")
        .select("id, name, species")
        .eq("owner_id", owner_id)
        .order("name")
        .execute()
        .data
    )
    pets = [Pet(r["id"], r["name"], species_of(r)) for r in rows]
    if not pets:
        return
    clear_seed_media(client, [p.id for p in pets], demo_set.key)
    photos = Photos(client, demo_set.key)
    year = stay_years(today)
    for which, start in enumerate((date(year, 8, 12), date(year, 9, 16))):
        seed_past_stay(client, owner_id, sitter_id, pets, start, photos, which)
    seed_owner_pages(client, owner_id, pets, today, photos)
    if state == "in_care":
        seed_today_photos(client, sitter_id, pets, photos)
    if cancelled:
        client.table("notifications").delete().eq("booking_id", cancelled).execute()
