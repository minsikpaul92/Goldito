"""Pet profile photos: signed upload, register, delete (11.15 S1, 014v)."""

from uuid import UUID

import cloudinary.api
import cloudinary.uploader
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.routers.media import SignResponse
from app.services import cloudinary as cloudinary_service

router = APIRouter(prefix="/api/pet-photos", tags=["pet-photos"])


class CompleteRequest(BaseModel):
    pet_id: UUID
    public_id: str = Field(min_length=1, max_length=200)


class PhotoResponse(BaseModel):
    id: str
    pet_id: str
    public_id: str
    position: int
    url: str
    thumb_url: str


class DeleteResponse(BaseModel):
    deleted: bool


def _bad_gateway(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)


def _photo(row: dict) -> PhotoResponse:
    public_id = row["public_id"]
    return PhotoResponse(
        id=row["id"],
        pet_id=row["pet_id"],
        public_id=public_id,
        position=row["position"],
        url=cloudinary_service.delivery_url(public_id),
        thumb_url=cloudinary_service.thumb_url(public_id),
    )


@router.post("/sign", response_model=SignResponse)
def sign_pet_photo(user: CurrentUser = Depends(get_current_user)) -> SignResponse:
    """A signed-in person signs an upload into their own folder. Whose pet it joins is checked at `complete`."""
    try:
        params = cloudinary_service.sign_pet_photo(user.id)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloudinary is not configured.",
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


@router.post("/complete", response_model=PhotoResponse)
def complete_pet_photo(
    body: CompleteRequest,
    user: CurrentUser = Depends(get_current_user),
) -> PhotoResponse:
    """Register an uploaded photo at the end of the pet's list. Retrying the same upload returns the same row."""
    if not body.public_id.startswith(cloudinary_service.pet_photo_folder(user.id) + "/"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="public_id does not match the signed folder.",
        )

    db = get_service_client()
    try:
        pet = (
            db.table("pets").select("id").eq("id", str(body.pet_id)).eq("owner_id", user.id).limit(1).execute()
        )
        existing = (
            db.table("pet_photos")
            .select("id, pet_id, public_id, position")
            .eq("pet_id", str(body.pet_id))
            .eq("public_id", body.public_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        raise _bad_gateway("Could not save the photo.") from exc
    if not pet.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet not found.")
    if existing.data:
        return _photo(existing.data[0])

    try:
        cloudinary_service.configure_cloudinary()
        cloudinary.api.resource(body.public_id, resource_type="image")
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloudinary is not configured.",
        ) from exc
    except Exception as exc:  # noqa: BLE001, Cloudinary SDK raises varied types
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cloudinary resource not found.",
        ) from exc

    try:
        added = db.rpc(
            "add_pet_photo",
            {"p_owner": user.id, "p_pet": str(body.pet_id), "p_public_id": body.public_id},
        ).execute()
    except Exception as exc:  # noqa: BLE001
        if "too_many_photos" in str(exc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A pet keeps up to 8 photos. Remove one first.",
            ) from exc
        raise _bad_gateway("Could not save the photo.") from exc
    row = added.data[0] if isinstance(added.data, list) and added.data else added.data
    if not row:
        raise _bad_gateway("Could not save the photo.")
    return _photo(row)


@router.delete("/{photo_id}", response_model=DeleteResponse)
def delete_pet_photo(
    photo_id: UUID,
    user: CurrentUser = Depends(get_current_user),
) -> DeleteResponse:
    """The pet's owner only. The file goes first, so a failure leaves everything as it was and the owner can retry."""
    db = get_service_client()
    try:
        found = db.table("pet_photos").select("id, pet_id, public_id").eq("id", str(photo_id)).limit(1).execute()
        pet = (
            db.table("pets").select("id").eq("id", found.data[0]["pet_id"]).eq("owner_id", user.id).limit(1).execute()
            if found.data
            else None
        )
    except Exception as exc:  # noqa: BLE001
        raise _bad_gateway("Couldn't remove the photo. Try again.") from exc
    if not found.data or not pet or not pet.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found.")

    try:
        cloudinary_service.configure_cloudinary()
        cloudinary.uploader.destroy(found.data[0]["public_id"], resource_type="image", invalidate=True)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloudinary is not configured.",
        ) from exc
    except Exception as exc:  # noqa: BLE001, Cloudinary SDK raises varied types
        raise _bad_gateway("Couldn't remove the photo file. Try again.") from exc

    try:
        db.rpc(
            "remove_pet_photo",
            {"p_owner": user.id, "p_pet": found.data[0]["pet_id"], "p_id": str(photo_id)},
        ).execute()
    except Exception as exc:  # noqa: BLE001
        raise _bad_gateway("Couldn't remove the photo. Try again.") from exc
    return DeleteResponse(deleted=True)
