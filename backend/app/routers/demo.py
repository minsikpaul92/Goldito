"""Temporary demo reset (testing only): `POST /api/demo/reset`.

Puts the two demo accounts back into one of a few known states from the Profile → Demo tools
sheet, so a manual test can start from "before any booking" without a terminal. It deletes
data, so it is off unless `DEMO_RESET_ENABLED=1` (answers 404 as if it did not exist) and only
the two demo accounts may call it. Remove it before judging: unset the variable, then delete
this file, `app/services/demo_reset.py` and the Demo tools sheet (docs/plan/TODO.md, "Demo reset").
"""

from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.config import get_settings
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import demo_reset
from app.services.demo_accounts import DEMO_USERS

router = APIRouter(prefix="/api/demo", tags=["demo"])


class ResetRequest(BaseModel):
    state: Literal["empty", "pets", "confirmed", "ready", "in_care"]


class ResetResponse(BaseModel):
    state: str
    deleted: dict[str, int]


@router.post("/reset", response_model=ResetResponse)
def reset_demo(body: ResetRequest, user: CurrentUser = Depends(get_current_user)) -> ResetResponse:
    settings = get_settings()
    if not settings.demo_reset_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if (user.email or "").lower() not in {demo.email for demo in DEMO_USERS}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the demo accounts can reset the demo.")

    client = get_service_client()
    try:
        owner_id, sitter_id = demo_reset.demo_ids(client)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    today = datetime.now(ZoneInfo(settings.app_timezone)).date()
    report = demo_reset.reset(client, owner_id, sitter_id, today, state=body.state, apply=True)
    return ResetResponse(state=body.state, deleted={label: rows for label, rows in report if rows})
