"""Cloudinary signed upload (phase-04 4.1–4.2)."""

from typing import Literal
from uuid import UUID

import cloudinary.api
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator

from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import authz
from app.services import cloudinary as cloudinary_service

router = APIRouter(prefix="/api/media", tags=["media"])

Purpose = Literal["feed", "task_proof", "report", "handoff", "safety_label"]
ResourceType = Literal["image", "video"]


class SignRequest(BaseModel):
    pet_id: UUID
    resource_type: ResourceType
    purpose: Purpose
    booking_id: UUID | None = None
    # Video trim picked in the app (seconds). Cloudinary keeps only this part (phase-04 4.7).
    trim_start: float | None = Field(default=None, ge=0, le=86_400)
    trim_duration: float | None = Field(default=None, gt=0, le=cloudinary_service.MAX_VIDEO_SECONDS)

    @model_validator(mode="after")
    def trim_is_video_only(self) -> "SignRequest":
        has_trim = self.trim_start is not None or self.trim_duration is not None
        if has_trim and self.resource_type != "video":
            raise ValueError("trim only applies to videos")
        return self


class SignResponse(BaseModel):
    cloud_name: str
    api_key: str
    timestamp: int
    signature: str
    folder: str
    upload_url: str
    transformation: str


class CompleteRequest(BaseModel):
    pet_id: UUID
    public_id: str = Field(min_length=1)
    resource_type: ResourceType
    purpose: Purpose
    booking_id: UUID | None = None
    width: int | None = None
    height: int | None = None
    duration: float | None = None


class CompleteResponse(BaseModel):
    media_id: str
    public_id: str
    secure_url: str
    thumb_url: str


def _authorize_media(
    user: CurrentUser,
    *,
    pet_id: UUID,
    purpose: Purpose,
    booking_id: UUID | None,
) -> None:
    if user.role == "owner":
        # Owners add their own feed photos (5.8); every other purpose belongs to the sitter.
        if purpose != "feed":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Owners can only upload feed photos.",
            )
        authz.assert_owner_of(user, pet_id)
    elif purpose == "handoff":
        if booking_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="booking_id is required for handoff photos.",
            )
        authz.assert_booked_sitter(user, booking_id, pet_id=pet_id, from_hours_before=2)
    else:
        authz.assert_on_duty_for(user, pet_id)


@router.post("/sign", response_model=SignResponse)
def sign_upload(
    body: SignRequest,
    user: CurrentUser = Depends(get_current_user),
) -> SignResponse:
    _authorize_media(
        user, pet_id=body.pet_id, purpose=body.purpose, booking_id=body.booking_id
    )

    try:
        params = cloudinary_service.sign(
            pet_id=str(body.pet_id),
            purpose=body.purpose,
            resource_type=body.resource_type,
            trim_start=body.trim_start,
            trim_duration=body.trim_duration,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloudinary is not configured.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    return SignResponse(
        cloud_name=params.cloud_name,
        api_key=params.api_key,
        timestamp=params.timestamp,
        signature=params.signature,
        folder=params.folder,
        upload_url=params.upload_url,
        transformation=params.transformation,
    )


@router.post("/complete", response_model=CompleteResponse)
def complete_upload(
    body: CompleteRequest,
    user: CurrentUser = Depends(get_current_user),
) -> CompleteResponse:
    _authorize_media(
        user, pet_id=body.pet_id, purpose=body.purpose, booking_id=body.booking_id
    )

    prefix = cloudinary_service.media_folder(str(body.pet_id), body.purpose) + "/"
    if not body.public_id.startswith(prefix):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="public_id does not match the signed folder.",
        )

    try:
        cloudinary_service.configure_cloudinary()
        resource = cloudinary.api.resource(body.public_id, resource_type=body.resource_type)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloudinary is not configured.",
        ) from exc
    except Exception as exc:  # noqa: BLE001 — Cloudinary SDK raises varied types
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cloudinary resource not found.",
        ) from exc

    # Trust what Cloudinary stored over what the client says about the file.
    width = resource.get("width") or body.width
    height = resource.get("height") or body.height
    duration = resource.get("duration") or body.duration
    secure_url = resource.get("secure_url") or cloudinary_service.delivery_url(
        body.public_id, resource_type=body.resource_type
    )
    thumb = (
        cloudinary_service.video_poster_url(body.public_id)
        if body.resource_type == "video"
        else cloudinary_service.thumb_url(body.public_id)
    )

    db = get_service_client()
    # Retrying /complete for the same upload returns the same media row (no duplicates).
    try:
        existing = (
            db.table("media")
            .select("id, uploaded_by, pet_id")
            .eq("cloudinary_public_id", body.public_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not save media row.",
        ) from exc
    if existing.data:
        found = existing.data[0]
        if found["uploaded_by"] != user.id or found["pet_id"] != str(body.pet_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This upload is already registered.",
            )
        return CompleteResponse(
            media_id=found["id"],
            public_id=body.public_id,
            secure_url=secure_url,
            thumb_url=thumb,
        )

    row = {
        "pet_id": str(body.pet_id),
        "uploaded_by": user.id,
        "cloudinary_public_id": body.public_id,
        "resource_type": body.resource_type,
        "purpose": body.purpose,
        "width": width,
        "height": height,
        "duration_s": duration,
    }
    try:
        inserted = db.table("media").insert(row).execute()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not save media row.",
        ) from exc
    if not inserted.data:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not save media row.",
        )
    media_id = inserted.data[0]["id"]
    return CompleteResponse(
        media_id=media_id,
        public_id=body.public_id,
        secure_url=secure_url,
        thumb_url=thumb,
    )
