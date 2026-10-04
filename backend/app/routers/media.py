"""Cloudinary signed upload (phase-04 4.1–4.2)."""

from typing import Literal
from uuid import UUID

import cloudinary.api
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.deps.auth import CurrentUser, require_role
from app.deps.supabase import get_service_client
from app.services import authz, cloudinary as cloudinary_service

router = APIRouter(prefix="/api/media", tags=["media"])

Purpose = Literal["feed", "task_proof", "report", "handoff", "safety_label"]
ResourceType = Literal["image", "video"]


class SignRequest(BaseModel):
    pet_id: UUID
    resource_type: ResourceType
    purpose: Purpose
    booking_id: UUID | None = None


class SignResponse(BaseModel):
    cloud_name: str
    api_key: str
    timestamp: int
    signature: str
    folder: str
    upload_url: str


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
    if purpose == "handoff":
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
    user: CurrentUser = Depends(require_role("sitter")),
) -> SignResponse:
    _authorize_media(
        user, pet_id=body.pet_id, purpose=body.purpose, booking_id=body.booking_id
    )

    try:
        params = cloudinary_service.sign(
            pet_id=str(body.pet_id),
            purpose=body.purpose,
            resource_type=body.resource_type,
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
    )


@router.post("/complete", response_model=CompleteResponse)
def complete_upload(
    body: CompleteRequest,
    user: CurrentUser = Depends(require_role("sitter")),
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

    width = body.width if body.width is not None else resource.get("width")
    height = body.height if body.height is not None else resource.get("height")
    duration = body.duration if body.duration is not None else resource.get("duration")
    secure_url = resource.get("secure_url") or cloudinary_service.delivery_url(
        body.public_id, resource_type=body.resource_type
    )
    thumb = (
        cloudinary_service.video_poster_url(body.public_id)
        if body.resource_type == "video"
        else cloudinary_service.thumb_url(body.public_id)
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
        inserted = get_service_client().table("media").insert(row).execute()
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
