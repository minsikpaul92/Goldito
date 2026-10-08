"""Authorization helpers for service-role routes (architecture §5)."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import httpx
from fastapi import HTTPException, status

from app.config import get_settings
from app.deps.auth import CurrentUser
from app.deps.supabase import get_service_client


def _rest_headers(access_token: str) -> dict[str, str]:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    # apikey unlocks PostgREST; Authorization carries the caller's JWT so auth.uid() works.
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }


def rpc_json(access_token: str, fn: str, params: dict, *, timeout: float = 10.0):
    """Call a Postgres function as the signed-in user (their JWT), so `auth.uid()` works inside it."""
    settings = get_settings()
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc/{fn}"
    try:
        response = httpx.post(url, headers=_rest_headers(access_token), json=params, timeout=timeout)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Supabase for authorization.",
        ) from exc
    if response.status_code >= 400:
        message = ""
        try:
            message = str(response.json().get("message", ""))
        except ValueError:
            pass
        raise RpcError(fn, response.status_code, message)
    return response.json()


class RpcError(RuntimeError):
    """A user-scoped RPC refused (its Postgres `raise exception` text is in `.message`)."""

    def __init__(self, fn: str, status_code: int, message: str) -> None:
        super().__init__(f"{fn} failed ({status_code}): {message}")
        self.fn, self.status_code, self.message = fn, status_code, message


def _rpc_bool(access_token: str, fn: str, params: dict) -> bool:
    try:
        return bool(rpc_json(access_token, fn, params))
    except RpcError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Authorization check failed.",
        ) from exc


def assert_on_duty_for(user: CurrentUser, pet_id: UUID) -> None:
    """Sitter may write media for this pet during the care window (JWT-scoped RPC)."""
    if user.role != "sitter":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action is for sitters.",
        )
    if not _rpc_bool(user.access_token, "is_on_duty_for", {"pet": str(pet_id)}):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not on duty for this pet.",
        )


def assert_owner_of(user: CurrentUser, pet_id: UUID) -> None:
    """Owner may write feed media for their own pet (any time, no booking needed)."""
    if user.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action is for owners.",
        )
    result = (
        get_service_client()
        .table("pets")
        .select("id")
        .eq("id", str(pet_id))
        .eq("owner_id", user.id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="That is not your pet.",
        )


def _parse_ts(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _agreed(handoffs: list[dict], kind: str) -> dict | None:
    return next((h for h in handoffs if h.get("kind") == kind and h.get("status") == "agreed"), None)


def assert_booked_sitter(
    user: CurrentUser,
    booking_id: UUID,
    *,
    pet_id: UUID | None = None,
    from_hours_before: float = 2,
    until_hours_after: float = 2,
) -> None:
    """Sitter on a confirmed booking, from `from_hours_before` before the agreed drop-off
    to `until_hours_after` after the pick-up (handoff photos)."""
    if user.role != "sitter":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action is for sitters.",
        )
    db = get_service_client()
    result = (
        db.table("bookings")
        .select(
            "id, sitter_id, status, booking_pets(pet_id, active), "
            "booking_handoffs(kind, status, scheduled_at, completed_at)"
        )
        .eq("id", str(booking_id))
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    row = result.data[0]
    if row["sitter_id"] != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not the sitter for this booking.",
        )
    if row["status"] != "confirmed":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This booking is not ready for handoff photos.",
        )
    if pet_id is not None:
        pet_ids = {bp["pet_id"] for bp in (row.get("booking_pets") or []) if bp.get("active", True)}
        if str(pet_id) not in pet_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="That pet is not on this booking.",
            )
    handoffs = row.get("booking_handoffs") or []
    drop = _agreed(handoffs, "drop_off")
    if not drop or not drop.get("scheduled_at"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Drop-off time is not agreed yet.",
        )
    now = datetime.now(UTC)
    if now < _parse_ts(drop["scheduled_at"]) - timedelta(hours=from_hours_before):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Handoff photos unlock 2 hours before drop-off.",
        )
    pick = _agreed(handoffs, "pick_up")
    pick_at = pick and (pick.get("completed_at") or pick.get("scheduled_at"))
    if pick_at and now > _parse_ts(pick_at) + timedelta(hours=until_hours_after):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This stay has ended.",
        )
