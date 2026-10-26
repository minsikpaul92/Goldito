"""POST /api/ai/pet-photo: a pet photo becomes breed and coat suggestions (11.15 S2).

The photo is one the owner just uploaded to their own pet-photo folder during sign-up (the pet is not saved yet). The
answer is a suggestion for the owner to confirm; nothing is saved here.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.ai.pet_photo import PhotoGuess, RawGuess, clean
from app.ai.prompts import load_prompt
from app.deps import limits
from app.deps.auth import CurrentUser, get_current_user
from app.services import cloudinary as cloudinary_service
from app.services import nebius

router = APIRouter(prefix="/api/ai", tags=["ai"], dependencies=[Depends(limits.ai_calls)])

TIMEOUT_S = 20.0  # the app stops waiting after 15 s (docs/plan/pet-profile-onboarding.md §7)


class PetPhotoRequest(BaseModel):
    public_id: str = Field(min_length=1, max_length=200)
    species: Literal["dog", "cat"]


class PetPhotoResponse(PhotoGuess):
    model: str
    latency_ms: int


@router.post("/pet-photo", response_model=PetPhotoResponse)
def pet_photo(body: PetPhotoRequest, user: CurrentUser = Depends(get_current_user)) -> PetPhotoResponse:
    if user.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owners can use this.")
    # Only the owner's own uploads: the model never sees someone else's photo.
    if not body.public_id.startswith(cloudinary_service.pet_photo_folder(user.id) + "/"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="That photo isn't yours to use here.")

    try:
        data_url = cloudinary_service.fetch_as_data_url(body.public_id)
    except (cloudinary_service.MediaFetchError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="We couldn't open that photo."
        ) from exc

    messages = [
        {"role": "system", "content": load_prompt("pet_photo/system.md")},
        {
            "role": "user",
            "content": [
                # The owner's choice is not told to the model: it would follow it. The server compares afterwards.
                {"type": "text", "text": "Guess the species, breeds and coat color of the pet in this photo."},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        },
    ]
    try:
        raw, result = nebius.chat_json(
            "vision", messages, RawGuess, endpoint="pet-photo", max_tokens=200, temperature=0.2, timeout=TIMEOUT_S
        )
    except nebius.AIUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Photo hints are unavailable.") from exc
    except nebius.AIInvalidOutput as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="We couldn't read that photo.") from exc

    guess = clean(raw, body.species)
    return PetPhotoResponse(**guess.model_dump(), model=result.model, latency_ms=result.latency_ms)
