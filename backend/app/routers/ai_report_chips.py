"""POST /api/ai/report-chips — suggested chips for the sitter's end-of-day note (phase-07 7.7, D38).

The day's records become chips with no model. Up to two photos go through the vision model for a
one-line description and one or two episode chips. A photo that fails or is slow is left out, so the
sitter still gets the day's record chips. Saves nothing: the sitter's kept chips go to `/daily-report`.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.ai.daily_report import build_snapshot, care_intervals, day_bounds, has_facts
from app.ai.prompts import load_prompt
from app.ai.report_chips import MAX_PHOTOS, PhotoRead, day_summary, photo_messages, record_chips
from app.config import get_settings
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.routers.ai_daily_report import _now, _one, _sitter_bookings, load_day_records
from app.services import authz, nebius
from app.services import cloudinary as cloudinary_service

router = APIRouter(prefix="/api/ai", tags=["ai"])
logger = logging.getLogger("pawddy.ai")

PHOTO_TIMEOUT_S = 20.0  # phase-07 7.7: no photo chips after this, the day's record chips only
PHOTO_PURPOSES = ("report", "feed", "task_proof")


class ReportChipsRequest(BaseModel):
    pet_id: UUID
    media_ids: list[UUID] = Field(default_factory=list, max_length=MAX_PHOTOS)


class Chip(BaseModel):
    id: str
    kind: str  # record | episode
    label: str
    source: str  # checkin | task | feed | vision
    check: str | None = None  # the `skip` key when a record chip is switched off
    value: str | None = None  # a record chip's recorded value (meal / potty / mood / walk minutes), editable
    media_id: str | None = None


class PhotoDescription(BaseModel):
    media_id: str
    description: str


class DaySummary(BaseModel):
    tasks_done: int
    tasks_missed: int
    checkins: int


class ReportChipsResponse(BaseModel):
    summary: DaySummary
    chips: list[Chip]
    photos: list[PhotoDescription]


@router.post("/report-chips", response_model=ReportChipsResponse)
def report_chips(
    body: ReportChipsRequest,
    user: CurrentUser = Depends(get_current_user),
) -> ReportChipsResponse:
    authz.assert_on_duty_for(user, body.pet_id)

    db = get_service_client()
    pet_id = str(body.pet_id)
    tz = ZoneInfo(get_settings().app_timezone)
    now = _now()
    day = now.astimezone(tz).date()
    day_start, day_end = day_bounds(day, tz)

    pet = _one(db.table("pets").select("name, species, breed, birthdate, notes").eq("id", pet_id).limit(1).execute())
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet not found.")
    intervals = care_intervals(_sitter_bookings(db, user.id, pet_id), day_start, day_end)
    if not intervals:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not on duty for this pet today.")

    # The day's own records (no photo, no chip, nothing turned off yet): what was recorded, as chips.
    snapshot = build_snapshot(
        pet=pet,
        day=day,
        tz=tz,
        intervals=intervals,
        **load_day_records(db, pet_id, user.id, day_start, day_end),
        report_photos=[],
        chips=[],
        sitter_note=None,
        skip=[],
        now=now,
    )
    chips = record_chips(snapshot) if has_facts(snapshot) else []

    media = _sitter_media(db, user.id, pet_id, [str(m) for m in body.media_ids])
    photos: list[dict] = []
    for media_id, read in _read_photos(pet["name"], media):
        if read.description:
            photos.append({"media_id": media_id, "description": read.description})
        for i, label in enumerate(read.chips):
            chips.append(
                {"id": f"photo-{media_id}-{i}", "kind": "episode", "label": label, "source": "vision", "media_id": media_id}
            )
    return ReportChipsResponse(summary=DaySummary(**day_summary(snapshot)), chips=[Chip(**c) for c in chips], photos=[PhotoDescription(**p) for p in photos])


def _sitter_media(db, sitter_id: str, pet_id: str, media_ids: list[str]) -> list[dict]:
    """The sitter's own images of this pet. Anything else is refused, not skipped (the app never sends it)."""
    out: list[dict] = []
    for media_id in dict.fromkeys(media_ids):
        row = _one(
            db.table("media")
            .select("id, pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose")
            .eq("id", media_id)
            .limit(1)
            .execute()
        )
        if (
            not row
            or row["pet_id"] != pet_id
            or row["uploaded_by"] != sitter_id
            or row["purpose"] not in PHOTO_PURPOSES
            or row["resource_type"] != "image"
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="That photo isn't yours to use here.")
        out.append(row)
    return out


def _read_photos(pet_name: str, media: list[dict]) -> list[tuple[str, PhotoRead]]:
    """Describe each photo with the vision model, in parallel. A photo that fails or runs late is dropped."""
    if not media:
        return []
    system = load_prompt("report_chips/system.md")

    def read(row: dict) -> PhotoRead:
        data_url = cloudinary_service.fetch_as_data_url(row["cloudinary_public_id"], row["resource_type"])
        parsed, _ = nebius.chat_json(
            "vision",
            photo_messages(system, pet_name, data_url),
            PhotoRead,
            endpoint="report-chips",
            max_tokens=200,
            temperature=0.2,
            timeout=PHOTO_TIMEOUT_S,
        )
        return parsed

    pool = ThreadPoolExecutor(max_workers=len(media))
    futures = [(row["id"], pool.submit(read, row)) for row in media]
    out: list[tuple[str, PhotoRead]] = []
    for media_id, future in futures:
        try:
            out.append((media_id, future.result(timeout=PHOTO_TIMEOUT_S)))
        except (FutureTimeout, nebius.AIUnavailable, nebius.AIInvalidOutput, cloudinary_service.MediaFetchError, ValueError):
            logger.info("report-chips: left out photo %s", media_id)
    pool.shutdown(wait=False)
    return out
