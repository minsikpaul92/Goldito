"""POST /api/ai/pet-review-chips: chips for the sitter's review of one pet after a stay (#407, D38).

Only the sitter of that booking, only once the pets are back (409 before). The stay's check-ins become chips with
no model; Nemotron adds a few from the same facts and the pet's Life Record. A model failure is not an error: the
sitter gets the stay's chips. Saves nothing: the sitter's picks go straight to `pet_reviews` (RLS, `015u`).
"""

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.ai import pet_review as pr
from app.ai.daily_report import parse_ts
from app.ai.prompts import load_prompt
from app.deps import limits
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import nebius

router = APIRouter(prefix="/api/ai", tags=["ai"], dependencies=[Depends(limits.ai_calls)])
log = logging.getLogger("goldito.ai")

TIMEOUT_S = 20.0


class PetReviewChipsRequest(BaseModel):
    booking_id: UUID
    pet_id: UUID


class PetReviewChipsResponse(BaseModel):
    chips: list[str]
    source: str  # ai | stay


@router.post("/pet-review-chips", response_model=PetReviewChipsResponse)
def pet_review_chips(body: PetReviewChipsRequest, user: CurrentUser = Depends(get_current_user)) -> PetReviewChipsResponse:
    db = get_service_client()
    booking_id, pet_id = str(body.booking_id), str(body.pet_id)
    found = db.table("bookings").select("id, sitter_id, status").eq("id", booking_id).limit(1).execute().data
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    if found[0]["sitter_id"] != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This isn't your booking.")
    if not db.table("booking_pets").select("pet_id").eq("booking_id", booking_id).eq("pet_id", pet_id).limit(1).execute().data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This pet wasn't in the stay.")

    handoffs = db.table("booking_handoffs").select("kind, status, scheduled_at, completed_at").eq("booking_id", booking_id).execute().data
    drop = next((h for h in handoffs if h["kind"] == "drop_off" and h["status"] == "agreed"), None)
    pick = next((h for h in handoffs if h["kind"] == "pick_up" and h["status"] == "agreed"), None)
    if found[0]["status"] != "confirmed" or not pick or not pick.get("completed_at"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="stay_not_finished")
    start = parse_ts((drop or {}).get("completed_at") or (drop or {}).get("scheduled_at") or pick["scheduled_at"])
    end = parse_ts(pick["completed_at"])

    pet = db.table("pets").select("id, name, species").eq("id", pet_id).limit(1).execute().data[0]
    checkins = [
        c
        for c in db.table("care_checkins").select("kind, value, created_at").eq("pet_id", pet_id).eq("created_by", user.id).execute().data
        if start <= parse_ts(c["created_at"]) <= end
    ]
    tasks_done = sum(
        1
        for t in db.table("task_logs").select("due_at, status").eq("pet_id", pet_id).eq("status", "done").execute().data
        if start <= parse_ts(t["due_at"]) <= end
    )
    record = db.table("pet_life_records").select("summary").eq("booking_id", booking_id).eq("pet_id", pet_id).limit(1).execute().data
    facts = pr.stay_facts(pet, checkins, tasks_done, record[0]["summary"] if record else None)
    stay = pr.stay_chips(facts)

    messages = [
        {"role": "system", "content": load_prompt("pet_review/system.md")},
        {"role": "user", "content": json.dumps(facts, ensure_ascii=False)},
    ]
    try:
        parsed, _ = nebius.chat_json("fast", messages, pr.ReviewChips, endpoint="pet-review-chips", max_tokens=200, temperature=0.4, timeout=TIMEOUT_S)
    except (nebius.AIUnavailable, nebius.AIInvalidOutput) as exc:
        log.info("pet-review-chips: model failed (%s), stay chips only", exc)
        return PetReviewChipsResponse(chips=pr.merge([], stay), source="stay")
    return PetReviewChipsResponse(chips=pr.merge(parsed.chips, stay), source="ai" if parsed.chips else "stay")
