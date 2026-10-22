"""Temporary demo reset (testing only): `POST /api/demo/reset`.

Puts the caller's own demo account (an owner or a sitter) back into one of a few known states from the Profile → Demo tools
sheet, so a manual test can start from "before any booking" without a terminal. It deletes
data, so it is off unless `DEMO_RESET_ENABLED=1` (answers 404 as if it did not exist) and only
the demo accounts may call it, each resetting only itself. Remove it before judging: unset the variable, then delete
this file, `app/services/demo_reset.py` and the Demo tools sheet (fixed demo accounts, see the GitHub issues).
"""

import logging
import threading
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.config import get_settings
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import demo_accounts, demo_reset

router = APIRouter(prefix="/api/demo", tags=["demo"])
logger = logging.getLogger(__name__)

# One reset per demo set at a time: two overlapping runs delete and rebuild the same pair's rows under each other.
_running: dict[str, threading.Lock] = {}


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
    client = get_service_client()
    # The email only names the set; the account id below still decides who may reset it.
    demo_set = demo_accounts.set_for_email(user.email)
    if demo_set is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the demo accounts can reset the demo.")
    try:
        owner_id, sitter_id = demo_reset.demo_ids(client, demo_set)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if user.id not in (owner_id, sitter_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the demo accounts can reset the demo.")
    today = datetime.now(ZoneInfo(settings.app_timezone)).date()
    # Each account resets on its own: an owner resets the owner side, a sitter the sitter side.
    scope = demo_accounts.role_for_email(user.email)
    lock = _running.setdefault(demo_set.key, threading.Lock())
    if not lock.acquire(blocking=False):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A reset is already running. Wait for it to finish.")
    try:
        report = demo_reset.reset(client, owner_id, sitter_id, today, state=body.state, apply=True, demo_set=demo_set, scope=scope)
    except Exception as exc:
        # An HTTPException keeps the CORS headers; a bare 500 does not, and the browser then only says "Failed to fetch".
        logger.exception("demo reset failed")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Reset failed: {str(exc)[:200]}") from exc
    finally:
        lock.release()
    return ResetResponse(state=body.state, deleted={label: rows for label, rows in report if rows})
