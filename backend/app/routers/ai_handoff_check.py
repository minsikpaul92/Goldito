"""POST /api/ai/handoff-check — the sitter's handoff photo, read by the vision model (phase-06b 6B.5).

The model only reports what it can see (pet visible, species, crate / seatbelt); the status is decided here, by rule,
so a chatty or wrong model cannot approve a photo. It never blocks the handoff: when anything goes wrong the answer is
still 200 with status `unchecked`, and that is stored too so Received can point at the photo.
"""

import logging
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator, model_validator

from app.ai.prompts import load_prompt
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import authz, nebius
from app.services import cloudinary as cloudinary_service

router = APIRouter(prefix="/api/ai", tags=["ai"])
log = logging.getLogger("goldito.ai")

TIMEOUT_S = 20.0  # phase-06b: no answer after this, the photo is saved as `unchecked`
MAX_TOKENS = 200
MAX_CONCERNS = 3
CONCERN_MAX = 120

CheckType = Literal["pet_checkin", "vehicle_safety", "return"]
HandoffKind = Literal["drop_off", "pick_up"]
Status = Literal["ok", "warning", "unchecked"]


class HandoffCheckRequest(BaseModel):
    booking_id: UUID
    media_id: UUID
    check_type: CheckType
    handoff_kind: HandoffKind

    @model_validator(mode="after")
    def _kind_matches_check(self):
        # Check-in is the drop-off, Return is the pick-up; the car check applies to either.
        if (self.check_type == "pet_checkin" and self.handoff_kind != "drop_off") or (
            self.check_type == "return" and self.handoff_kind != "pick_up"
        ):
            raise ValueError("check_type does not fit this handoff")
        return self


class HandoffFindings(BaseModel):
    """What the model returns: observations only."""

    pet_visible: bool | None = None
    species_match: bool | None = None
    crate_visible: bool | None = None
    restraint_visible: bool | None = None
    concerns: list[str] = Field(default_factory=list)

    @field_validator("pet_visible", "species_match", "crate_visible", "restraint_visible", mode="before")
    @classmethod
    def _yes_no(cls, value):
        if isinstance(value, str):
            text = value.strip().lower()
            if text in ("true", "yes", "y"):
                return True
            if text in ("false", "no", "n"):
                return False
            return None
        return value

    @field_validator("concerns", mode="before")
    @classmethod
    def _concerns(cls, value):
        if not isinstance(value, list):
            return []
        tidy = [nebius.strip_think(str(item)).strip()[:CONCERN_MAX] for item in value]
        return [item for item in tidy if item][:MAX_CONCERNS]


class HandoffCheckResponse(BaseModel):
    check_id: str
    status: Status
    findings: HandoffFindings
    model: str | None
    latency_ms: int


def decide_status(check_type: str, findings: HandoffFindings) -> Status:
    """The rule the app shows: a photo is `ok` only when the model saw what that check needs."""
    if check_type == "vehicle_safety":
        secured = bool(findings.crate_visible) or bool(findings.restraint_visible)
        return "ok" if findings.pet_visible and secured else "warning"
    return "ok" if findings.pet_visible and findings.species_match else "warning"


@router.post("/handoff-check", response_model=HandoffCheckResponse)
def handoff_check(body: HandoffCheckRequest, user: CurrentUser = Depends(get_current_user)) -> HandoffCheckResponse:
    db = get_service_client()

    media = (
        db.table("media")
        .select("id, pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose")
        .eq("id", str(body.media_id))
        .limit(1)
        .execute()
        .data
    )
    row = media[0] if media else None
    if not row or row["uploaded_by"] != user.id or row["purpose"] != "handoff":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="That photo isn't yours to check.")
    # The sitter on this booking, inside the handoff window, and the pet is one of the booking's.
    authz.assert_booked_sitter(user, body.booking_id, pet_id=UUID(row["pet_id"]), from_hours_before=2)

    found = db.table("pets").select("name, species").eq("id", row["pet_id"]).limit(1).execute().data
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet not found.")
    pet = found[0]

    findings = HandoffFindings()
    verdict: Status = "unchecked"
    model: str | None = None
    latency_ms = 0
    try:
        data_url = cloudinary_service.fetch_as_data_url(row["cloudinary_public_id"], row["resource_type"])
        messages = [
            {"role": "system", "content": load_prompt("handoff_check/system.md")},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"Check type: {body.check_type}\nPet: {pet['name']} ({pet['species']})"},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            },
        ]
        findings, result = nebius.chat_json(
            "vision", messages, HandoffFindings, endpoint="handoff-check", max_tokens=MAX_TOKENS, temperature=0.1, timeout=TIMEOUT_S
        )
        verdict = decide_status(body.check_type, findings)
        model, latency_ms = result.model, result.latency_ms
    except (
        nebius.AIUnavailable,
        nebius.AIInvalidOutput,
        cloudinary_service.MediaFetchError,
        ValueError,
    ) as exc:
        log.info("handoff-check: saved as unchecked (%s)", exc)

    saved = (
        db.table("handoff_checks")
        .insert(
            {
                "booking_id": str(body.booking_id),
                "handoff_kind": body.handoff_kind,
                "check_type": body.check_type,
                "media_id": str(body.media_id),
                "status": verdict,
                "findings": findings.model_dump() if verdict != "unchecked" else {},
                "model": model,
                "latency_ms": latency_ms or None,
            }
        )
        .execute()
        .data
    )
    return HandoffCheckResponse(
        check_id=saved[0]["id"], status=verdict, findings=findings, model=model, latency_ms=latency_ms
    )
