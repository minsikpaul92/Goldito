"""Demo reset (`POST /api/demo/reset`) and Judge seats (`POST /api/demo/seat`, #411).

The reset puts the caller's own demo account (an owner or a sitter) back into one of a few known states from the
Profile → Demo tools sheet, so a manual test can start from "before any booking" without a terminal. It deletes
data, so for the team's sets it is off unless `DEMO_RESET_ENABLED=1` (answers 404 as if it did not exist) and only
the demo accounts may call it, each resetting only itself.

A judge set is different: the judge holds the set's seat (015t), and both its accounts are the judge's. Taking a seat
that another browser held resets the whole set to a clean stay; the judge panel (#413) resets the set to a scene's
state. Both need the seat's holder id, so a judge whose seat expired and went to someone else cannot reset it.
"""

import logging
import threading
from datetime import datetime
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from supabase import Client

from app.config import get_settings
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import demo_accounts, demo_reset
from app.services.demo_accounts import DemoSet

router = APIRouter(prefix="/api/demo", tags=["demo"])
logger = logging.getLogger(__name__)

# One reset per demo set at a time: two overlapping runs delete and rebuild the same pair's rows under each other.
_running: dict[str, threading.Lock] = {}

DemoState = Literal["empty", "pets", "past", "confirmed", "ready", "in_care", "returned"]
# Where a judge starts after taking a seat: the two pets, never met (a clean stay).
JUDGE_START: DemoState = "pets"


class ResetRequest(BaseModel):
    state: DemoState
    # The browser's seat holder id; required for a judge set.
    holder: UUID | None = None


class ResetResponse(BaseModel):
    state: str
    deleted: dict[str, int]


class SeatRequest(BaseModel):
    set: str
    holder: UUID


class SeatResponse(BaseModel):
    set: str
    fresh: bool


def _run_reset(client: Client, demo_set: DemoSet, state: str, scope: str, ids: tuple[str, str] | None = None) -> list[tuple[str, int]]:
    """Reset one set under its lock. 409 while another reset of the set runs, 500 (with CORS headers) on failure."""
    if ids is None:
        ids = _ids(client, demo_set)
    owner_id, sitter_id = ids
    today = datetime.now(ZoneInfo(get_settings().app_timezone)).date()
    lock = _running.setdefault(demo_set.key, threading.Lock())
    if not lock.acquire(blocking=False):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A reset is already running. Wait for it to finish.")
    try:
        return demo_reset.reset(client, owner_id, sitter_id, today, state=state, apply=True, demo_set=demo_set, scope=scope)
    except Exception as exc:
        # An HTTPException keeps the CORS headers; a bare 500 does not, and the browser then only says "Failed to fetch".
        logger.exception("demo reset failed")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Reset failed: {str(exc)[:200]}") from exc
    finally:
        lock.release()


def _ids(client: Client, demo_set: DemoSet) -> tuple[str, str]:
    try:
        return demo_reset.demo_ids(client, demo_set)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


def _seat_held(client: Client, set_key: str, holder: UUID | None) -> bool:
    if holder is None:
        return False
    return bool(client.rpc("judge_seat_held", {"p_set": set_key, "p_holder": str(holder)}).execute().data)


@router.post("/reset", response_model=ResetResponse)
def reset_demo(body: ResetRequest, user: CurrentUser = Depends(get_current_user)) -> ResetResponse:
    settings = get_settings()
    # The email only names the set; the account id below still decides who may reset it.
    demo_set = demo_accounts.set_for_email(user.email)
    judge = demo_set is not None and demo_set.judge
    if not judge and not settings.demo_reset_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if demo_set is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the demo accounts can reset the demo.")
    client = get_service_client()
    owner_id, sitter_id = _ids(client, demo_set)
    if user.id not in (owner_id, sitter_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the demo accounts can reset the demo.")
    if judge and not _seat_held(client, demo_set.key, body.holder):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Your judge seat has timed out.")
    # A team account resets on its own (owner side or sitter side); a judge resets the whole set.
    scope = "both" if judge else demo_accounts.role_for_email(user.email)
    report = _run_reset(client, demo_set, body.state, scope, (owner_id, sitter_id))
    return ResetResponse(state=body.state, deleted={label: rows for label, rows in report if rows})


@router.post("/seat", response_model=SeatResponse)
def take_seat(body: SeatRequest) -> SeatResponse:
    """Take a Judge seat before signing in. One browser wins a seat (015t); when it was another browser's, the set
    goes back to a clean stay before the judge signs in."""
    demo_set = next((s for s in demo_accounts.JUDGE_SETS if s.key == body.set), None)
    if demo_set is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such judge seat.")
    client = get_service_client()
    rows = client.rpc("claim_judge_seat", {"p_set": demo_set.key, "p_holder": str(body.holder)}).execute().data or []
    claim = rows[0] if rows else {}
    if not claim.get("ok"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"{demo_set.label} is in use.")
    fresh = bool(claim.get("fresh"))
    if fresh:
        try:
            _run_reset(client, demo_set, JUDGE_START, "both")
        except HTTPException:
            # Free the seat with no holder, so the next try starts fresh again instead of on a half-reset stay.
            client.table("judge_seats").update({"holder": None, "heartbeat_at": "-infinity"}).eq("set_key", demo_set.key).execute()
            raise
    return SeatResponse(set=demo_set.key, fresh=fresh)
