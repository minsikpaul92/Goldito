"""POST /api/ai/caption — a photo → a warm caption + an album category (phase-09 9.1 · 9.5).

The sitter only uploads; the vision model looks at the picture (a video gives its first frame) and the result goes
straight into the feed post. It never blocks posting: when anything goes wrong the answer is still 200, with a plain
fallback caption and no category, so the app needs no error branch.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator

from app.ai import tone
from app.ai.prompts import load_prompt
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import authz, nebius
from app.services import cloudinary as cloudinary_service

router = APIRouter(prefix="/api/ai", tags=["ai"])
log = logging.getLogger("goldito.ai")

TIMEOUT_S = 20.0  # phase-09: no caption after this, the fallback is used
MAX_TOKENS = 120
CATEGORIES = ("meal", "walk", "nap", "play", "other")
CAPTION_MAX = 200
CAPTION_MEDIA_PURPOSES = ("feed",)


class CaptionRequest(BaseModel):
    pet_id: UUID
    media_id: UUID


class CaptionResponse(BaseModel):
    caption: str
    category: str | None
    source: str  # "ai" | "fallback"
    model: str
    latency_ms: int


class Captioned(BaseModel):
    """What the model returns."""

    caption: str
    category: str = "other"

    @field_validator("category", mode="before")
    @classmethod
    def _category(cls, value):
        text = str(value or "").strip().lower()
        return text if text in CATEGORIES else "other"


def fallback_caption(name: str) -> str:
    return f"{name} had a lovely moment today 🐾"


def tidy_caption(text: str) -> str:
    """No quotes, no think blocks, no hashtags; at most the first two sentences when it runs long."""
    text = nebius.strip_think(text or "").strip().strip('"').strip()
    text = " ".join(word for word in text.split() if not word.startswith("#"))
    if len(text) > CAPTION_MAX:
        sentences = [s for s in text.replace("!", "!|").replace("?", "?|").replace(". ", ".|").split("|") if s.strip()]
        text = " ".join(s.strip() for s in sentences[:2])[:CAPTION_MAX].rstrip()
    return text


@router.post("/caption", response_model=CaptionResponse)
def caption(body: CaptionRequest, user: CurrentUser = Depends(get_current_user)) -> CaptionResponse:
    authz.assert_on_duty_for(user, body.pet_id)
    db = get_service_client()
    pet_id = str(body.pet_id)

    found = db.table("pets").select("name, species").eq("id", pet_id).limit(1).execute().data
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet not found.")
    pet = found[0]

    media = (
        db.table("media")
        .select("id, pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose")
        .eq("id", str(body.media_id))
        .limit(1)
        .execute()
        .data
    )
    row = media[0] if media else None
    if (
        not row
        or row["pet_id"] != pet_id
        or row["uploaded_by"] != user.id
        or row["purpose"] not in CAPTION_MEDIA_PURPOSES
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="That photo isn't yours to caption.")

    fallback = CaptionResponse(
        caption=fallback_caption(pet["name"]), category=None, source="fallback", model="fallback", latency_ms=0
    )
    try:
        data_url = cloudinary_service.fetch_as_data_url(row["cloudinary_public_id"], row["resource_type"])
        voice = tone.compose(db, user.id, kind="report", query="")  # style card only: a caption has no situation to match
        messages = [
            {"role": "system", "content": load_prompt("caption/system.md") + f"\n\nStyle notes for this sitter: {voice.style_notes}"},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"Pet: {pet['name']} ({pet['species']})"},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            },
        ]
        parsed, result = nebius.chat_json(
            "vision", messages, Captioned, endpoint="caption", max_tokens=MAX_TOKENS, temperature=0.8, timeout=TIMEOUT_S
        )
    except (
        nebius.AIUnavailable,
        nebius.AIInvalidOutput,
        cloudinary_service.MediaFetchError,
        ValueError,
    ) as exc:
        log.info("caption: using the fallback (%s)", exc)
        return fallback

    text = tidy_caption(parsed.caption)
    if not text:
        return fallback
    return CaptionResponse(
        caption=text, category=parsed.category, source="ai", model=result.model, latency_ms=result.latency_ms
    )
