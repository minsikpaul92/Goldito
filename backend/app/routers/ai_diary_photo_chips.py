"""POST /api/ai/diary-photo-chips: chips from the photos on an owner's own diary page.

The sitter's Report screen gets chips from the day's records and photos (`/report-chips`). An owner has no records to
read, so only the photos they put on their own page go through the vision model: a one-line description and up to two
episode chips each, which they tap to put a line on the page. A photo that fails or is slow is left out. Saves nothing.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.deps import limits
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.routers.ai_report_chips import PHOTO_PURPOSES, Chip, PhotoDescription, _one, _read_photos
from app.services import authz

router = APIRouter(prefix="/api/ai", tags=["ai"], dependencies=[Depends(limits.ai_calls)])
logger = logging.getLogger("goldito.ai")

MAX_PAGE_PHOTOS = 4


class DiaryPhotoChipsRequest(BaseModel):
    pet_id: UUID
    media_ids: list[UUID] = Field(min_length=1, max_length=MAX_PAGE_PHOTOS)


class DiaryPhotoChipsResponse(BaseModel):
    chips: list[Chip]
    photos: list[PhotoDescription]


@router.post("/diary-photo-chips", response_model=DiaryPhotoChipsResponse)
def diary_photo_chips(
    body: DiaryPhotoChipsRequest,
    user: CurrentUser = Depends(get_current_user),
) -> DiaryPhotoChipsResponse:
    authz.assert_owner_of(user, body.pet_id)
    db = get_service_client()
    pet_id = str(body.pet_id)
    pet = _one(db.table("pets").select("name").eq("id", pet_id).limit(1).execute())
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet not found.")

    media = _owner_media(db, user.id, pet_id, [str(m) for m in body.media_ids])
    chips: list[dict] = []
    photos: list[dict] = []
    for media_id, read in _read_photos(pet["name"], media, endpoint="diary-photo-chips"):
        if read.description:
            photos.append({"media_id": media_id, "description": read.description})
        for i, label in enumerate(read.chips):
            chips.append({"id": f"photo-{media_id}-{i}", "kind": "episode", "label": label, "source": "vision", "media_id": media_id})
    return DiaryPhotoChipsResponse(chips=[Chip(**c) for c in chips], photos=[PhotoDescription(**p) for p in photos])


def _owner_media(db, owner_id: str, pet_id: str, media_ids: list[str]) -> list[dict]:
    """The owner's own images of this pet. Anything else is refused, not skipped (the app never sends it)."""
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
            or row["uploaded_by"] != owner_id
            or row["purpose"] not in PHOTO_PURPOSES
            or row["resource_type"] != "image"
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="That photo isn't yours to use here.")
        out.append(row)
    return out
