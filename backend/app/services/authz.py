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


def _rpc_bool(access_token: str, fn: str, params: dict) -> bool:
    settings = get_settings()
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc/{fn}"
    try:
        response = httpx.post(url, headers=_rest_headers(access_token), json=params, timeout=10.0)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Supabase for authorization.",
        ) from exc
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Authorization check failed.",
        )
    return bool(response.json())


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


def assert_booked_sitter(
    user: CurrentUser,
    booking_id: UUID,
    *,
    pet_id: UUID | None = None,
    from_hours_before: float = 2,
) -> None:
    """Sitter on the booking, from `from_hours_before` before agreed drop-off (handoff photos)."""
    if user.role != "sitter":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action is for sitters.",
        )
    db = get_service_client()
    result = (
        db.table("bookings")
        .select("id, sitter_id, status, booking_pets(pet_id), booking_handoffs(kind, status, agreed_at)")
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
    if row["status"] not in ("confirmed", "in_progress"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This booking is not ready for handoff photos.",
        )
    if pet_id is not None:
        pet_ids = {bp["pet_id"] for bp in (row.get("booking_pets") or [])}
        if str(pet_id) not in pet_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="That pet is not on this booking.",
            )
    drop = next(
        (
            h
            for h in (row.get("booking_handoffs") or [])
            if h.get("kind") == "drop_off" and h.get("status") == "agreed"
        ),
        None,
    )
    if not drop or not drop.get("agreed_at"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Drop-off time is not agreed yet.",
        )
    agreed = datetime.fromisoformat(drop["agreed_at"].replace("Z", "+00:00"))
    if agreed.tzinfo is None:
        agreed = agreed.replace(tzinfo=UTC)
    earliest = agreed - timedelta(hours=from_hours_before)
    if datetime.now(UTC) < earliest:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Handoff photos unlock 2 hours before drop-off.",
        )
