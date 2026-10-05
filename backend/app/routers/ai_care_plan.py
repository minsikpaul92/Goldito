"""POST /api/ai/care-plan — owner's care request → checklist draft (phase-06 6.12). Saves nothing."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.ai.care_plan import RawPlan, normalize
from app.ai.prompts import load_prompt
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import authz, nebius

router = APIRouter(prefix="/api/ai", tags=["ai"])

TIMEOUT_S = 45.0  # architecture §7: care-plan 45 s


class CarePlanRequest(BaseModel):
    pet_id: UUID
    text: str = Field(min_length=1, max_length=2000)


class PlanTask(BaseModel):
    type: str
    time: str
    title: str
    dose: str | None = None
    notes: str | None = None


class Skipped(BaseModel):
    type: str
    title: str
    reason: str


class CarePlanResponse(BaseModel):
    tasks: list[PlanTask]
    cautions: list[str]
    skipped: list[Skipped]
    model: str
    latency_ms: int


@router.post("/care-plan", response_model=CarePlanResponse)
def care_plan(
    body: CarePlanRequest,
    user: CurrentUser = Depends(get_current_user),
) -> CarePlanResponse:
    """A DRAFT only: the owner reviews it in the app, and the app saves it (care_requests,
    care_tasks, pet_cautions). The server removes what can't be valid for this pet (D23)."""
    authz.assert_owner_of(user, body.pet_id)

    found = (
        get_service_client()
        .table("pets")
        .select("name, species")
        .eq("id", str(body.pet_id))
        .limit(1)
        .execute()
    )
    if not found.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet not found.")
    pet = found.data[0]

    messages = [
        {"role": "system", "content": load_prompt("care_plan/system.md")},
        {
            "role": "user",
            "content": f"Pet: {pet['name']} ({pet['species']})\n\nOwner's request:\n{body.text.strip()}",
        },
    ]
    try:
        raw, result = nebius.chat_json(
            "report", messages, RawPlan, endpoint="care-plan", timeout=TIMEOUT_S, max_tokens=900
        )
    except nebius.AIUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The checklist helper is unavailable right now. You can add tasks by hand.",
        ) from exc
    except nebius.AIInvalidOutput as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't turn that into a checklist. Try rewording it, or add tasks by hand.",
        ) from exc

    plan = normalize(raw, pet["species"])
    return CarePlanResponse(
        tasks=[PlanTask(**t) for t in plan.tasks],
        cautions=plan.cautions,
        skipped=[Skipped(**s) for s in plan.skipped],
        model=result.model,
        latency_ms=result.latency_ms,
    )
