"""POST /api/ai/diary-entry: the owner's own diary page, written from the chips they kept.

The owner has no records to read, so the page comes only from the photo chips they kept and the words they already
wrote on it. Saves nothing: the owner reads it on the page, edits it and saves the page themselves. If the model is
down the kept chips come back as a plain list, so there is always something to edit.
"""

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.ai.prompts import load_prompt
from app.deps import limits
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.routers.ai_report_chips import _one
from app.services import authz, nebius

router = APIRouter(prefix="/api/ai", tags=["ai"], dependencies=[Depends(limits.ai_calls)])
logger = logging.getLogger("goldito.ai")

MAX_CHIPS = 8
CHIP_MAX = 60
NOTE_MAX = 600
TIMEOUT_S = 25.0


class DiaryEntryRequest(BaseModel):
    pet_id: UUID
    chips: list[str] = Field(default_factory=list, max_length=MAX_CHIPS)
    note: str | None = None

    @field_validator("chips", mode="before")
    @classmethod
    def _chips(cls, value):
        if not isinstance(value, list):
            return []
        return [str(c).strip()[:CHIP_MAX] for c in value if str(c).strip()]

    @field_validator("note", mode="before")
    @classmethod
    def _note(cls, value):
        text = value.strip() if isinstance(value, str) else ""
        return text[:NOTE_MAX] or None


class DiaryEntryResponse(BaseModel):
    body: str
    fallback: bool = False


@router.post("/diary-entry", response_model=DiaryEntryResponse)
def diary_entry(body: DiaryEntryRequest, user: CurrentUser = Depends(get_current_user)) -> DiaryEntryResponse:
    authz.assert_owner_of(user, body.pet_id)
    if not body.chips and not body.note:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Add a photo or a few words first.")
    pet = _one(get_service_client().table("pets").select("name, species").eq("id", str(body.pet_id)).limit(1).execute())
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet not found.")

    view = {"name": pet["name"], "species": pet["species"], "chips": body.chips, "note": body.note}
    try:
        result = nebius.chat(
            "report",
            [{"role": "system", "content": load_prompt("diary_entry/system.md")}, {"role": "user", "content": json.dumps(view, ensure_ascii=False)}],
            endpoint="diary-entry",
            max_tokens=400,
            temperature=0.4,
            timeout=TIMEOUT_S,
        )
        text = result.text.strip()
    except nebius.AIUnavailable as exc:
        logger.warning("diary-entry: model unavailable (%s); returning the plain list", exc)
        text = ""
    if text:
        return DiaryEntryResponse(body=text)
    return DiaryEntryResponse(body=_plain(pet["name"], body.chips, body.note), fallback=True)


def _plain(name: str, chips: list[str], note: str | None) -> str:
    """The owner's words, then each kept moment as a line with the pet's name."""
    lines = [note] if note else []
    lines += [f"{name}: {chip}." for chip in chips]
    return "\n".join(lines)
