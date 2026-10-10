"""Video Meet & Greet links (phase-03b 3B.11, D45).

After both sides agree on a video Meet & Greet (005 `respond_meet_greet`), the app calls
`POST /api/meet-greet/video-link`: the Goldito Google account creates a 30-minute Calendar
event with a Google Meet link, the link is saved on the booking (service role) and both
sides get `meet_greet_link_ready`. Calling it again is safe. After a reschedule the same
event is patched (same link). `…/release` deletes the event once the booking is cancelled
or the meeting is no longer a video call.
"""

from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from typing import Literal, Protocol
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.config import get_settings
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services.google_meet import GoogleCalendarMeetClient, GoogleMeetError, MeetClient

router = APIRouter(prefix="/api/meet-greet", tags=["meet-greet"])


@dataclass(frozen=True)
class MeetGreetBooking:
    id: str
    owner_id: str
    sitter_id: str
    status: str
    meet_greet_status: str
    mode: str | None
    at: datetime | None
    link: str | None
    event_id: str | None
    owner_name: str
    sitter_name: str
    pet_names: list[str]
    owner_email: str | None
    sitter_email: str | None


class BookingStore(Protocol):
    def get(self, booking_id: str) -> MeetGreetBooking | None: ...

    def save_event(self, booking_id: str, *, link: str | None, event_id: str | None) -> None: ...

    def claim_event(
        self, booking_id: str, *, link: str | None, event_id: str, expect_event_id: str | None
    ) -> bool:
        """Save only if the booking still has no link and the event we started from; False = someone else saved first."""
        ...

    def notify(self, user_ids: list[str], booking_id: str, title: str, body: str | None) -> None: ...


class SupabaseBookingStore:
    """Bookings through the service role — only after the caller is checked as a party."""

    def __init__(self) -> None:
        self._db = get_service_client()

    def _email(self, user_id: str) -> str | None:
        try:
            return self._db.auth.admin.get_user_by_id(user_id).user.email
        except Exception:  # noqa: BLE001 — a missing email only means no invite
            return None

    def get(self, booking_id: str) -> MeetGreetBooking | None:
        result = (
            self._db.table("bookings")
            .select(
                "id, owner_id, sitter_id, status, meet_greet_status, meet_greet_mode, meet_greet_at, "
                "meet_greet_link, meet_greet_event_id, "
                "owner:profiles!bookings_owner_id_fkey(display_name), "
                "sitter:profiles!bookings_sitter_id_fkey(display_name), "
                "booking_pets(pets(name))"
            )
            .eq("id", booking_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        row = result.data[0]
        at = row.get("meet_greet_at")
        return MeetGreetBooking(
            id=row["id"],
            owner_id=row["owner_id"],
            sitter_id=row["sitter_id"],
            status=row["status"],
            meet_greet_status=row["meet_greet_status"],
            mode=row.get("meet_greet_mode"),
            at=datetime.fromisoformat(at) if at else None,
            link=row.get("meet_greet_link"),
            event_id=row.get("meet_greet_event_id"),
            owner_name=(row.get("owner") or {}).get("display_name") or "the owner",
            sitter_name=(row.get("sitter") or {}).get("display_name") or "the sitter",
            pet_names=sorted(
                bp["pets"]["name"] for bp in row.get("booking_pets") or [] if bp.get("pets")
            ),
            owner_email=self._email(row["owner_id"]),
            sitter_email=self._email(row["sitter_id"]),
        )

    def save_event(self, booking_id: str, *, link: str | None, event_id: str | None) -> None:
        self._db.table("bookings").update(
            {"meet_greet_link": link, "meet_greet_event_id": event_id}
        ).eq("id", booking_id).execute()

    def claim_event(
        self, booking_id: str, *, link: str | None, event_id: str, expect_event_id: str | None
    ) -> bool:
        query = (
            self._db.table("bookings")
            .update({"meet_greet_link": link, "meet_greet_event_id": event_id})
            .eq("id", booking_id)
            .is_("meet_greet_link", "null")
        )
        if expect_event_id is None:
            query = query.is_("meet_greet_event_id", "null")
        else:
            query = query.eq("meet_greet_event_id", expect_event_id)
        return bool(query.execute().data)

    def notify(self, user_ids: list[str], booking_id: str, title: str, body: str | None) -> None:
        self._db.table("notifications").insert(
            [
                {
                    "user_id": uid,
                    "booking_id": booking_id,
                    "ref_id": booking_id,
                    "type": "meet_greet_link_ready",
                    "title": title,
                    "body": body,
                }
                for uid in user_ids
            ]
        ).execute()


def get_booking_store() -> BookingStore:
    return SupabaseBookingStore()


@lru_cache
def _meet_client() -> GoogleCalendarMeetClient:
    return GoogleCalendarMeetClient(get_settings())


def get_meet_client() -> MeetClient | None:
    """None until the Goldito Google account is set up — the app then keeps its fallback."""
    if not get_settings().google_meet_configured:
        return None
    return _meet_client()


class BookingRef(BaseModel):
    booking_id: UUID


class VideoLinkResponse(BaseModel):
    link: str | None
    status: Literal["created", "rescheduled", "existing", "pending", "released", "kept", "none"]


def _load(store: BookingStore, booking_id: UUID, user: CurrentUser) -> MeetGreetBooking:
    booking = store.get(str(booking_id))
    if booking is None or user.id not in (booking.owner_id, booking.sitter_id):
        # Same answer for "no such booking" and "not yours".
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    return booking


def _local(at: datetime) -> str:
    """"Oct 6, 7:00 PM" in the app timezone (same as fmt_local_datetime in 005)."""
    local = at.astimezone(ZoneInfo(get_settings().app_timezone))
    hour = local.hour % 12 or 12
    return f"{local:%b} {local.day}, {hour}:{local.minute:02d} {'AM' if local.hour < 12 else 'PM'}"


def _invitees(booking: MeetGreetBooking) -> list[str]:
    if not get_settings().meet_invite_attendees:
        return []
    emails = [booking.owner_email, booking.sitter_email]
    # Demo accounts use the reserved .test domain — never send them invites.
    return [e for e in emails if e and not e.lower().endswith(".test")]


@router.post("/video-link", response_model=VideoLinkResponse)
def create_video_link(
    body: BookingRef,
    user: CurrentUser = Depends(get_current_user),
    store: BookingStore = Depends(get_booking_store),
    client: MeetClient | None = Depends(get_meet_client),
) -> VideoLinkResponse:
    booking = _load(store, body.booking_id, user)
    if (
        booking.status != "requested"
        or booking.mode != "video"
        or booking.meet_greet_status != "agreed"
        or booking.at is None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The video Meet & Greet is not agreed yet.",
        )
    if booking.link:
        return VideoLinkResponse(link=booking.link, status="existing")
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Meet links are not set up yet.",
        )

    timezone = get_settings().app_timezone
    try:
        if booking.event_id:
            event = client.reschedule(booking.event_id, start=booking.at, timezone=timezone)
            outcome: Literal["created", "rescheduled"] = "rescheduled"
        else:
            pets = ", ".join(booking.pet_names) or "your pet"
            event = client.create(
                # Same booking + time → same conference request (Google de-duplicates it).
                request_id=f"goldito-{booking.id}-{int(booking.at.timestamp())}",
                # "Goldito Meet & Greet — Max, Mochi & Chloe"
                summary=f"Goldito Meet & Greet — {pets} & {booking.sitter_name}",
                start=booking.at,
                attendees=_invitees(booking),
                timezone=timezone,
            )
            outcome = "created"
    except GoogleMeetError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Google Meet could not create the link. Try again.",
        ) from exc

    # Owner and sitter can ask at the same moment: the first save wins, the other keeps that link.
    if not store.claim_event(booking.id, link=event.link, event_id=event.event_id, expect_event_id=booking.event_id):
        if outcome == "created":
            try:
                client.delete(event.event_id)
            except GoogleMeetError:
                pass  # an extra Calendar event is harmless; the saved one is what both sides see
        current = store.get(booking.id)
        link = current.link if current else None
        return VideoLinkResponse(link=link, status="existing" if link else "pending")
    if not event.link:
        return VideoLinkResponse(link=None, status="pending")
    store.notify(
        [booking.owner_id, booking.sitter_id],
        booking.id,
        f"Video Meet & Greet on {_local(booking.at)} — join with Google Meet",
        " & ".join(booking.pet_names) or None,
    )
    return VideoLinkResponse(link=event.link, status=outcome)


@router.post("/video-link/release", response_model=VideoLinkResponse)
def release_video_link(
    body: BookingRef,
    user: CurrentUser = Depends(get_current_user),
    store: BookingStore = Depends(get_booking_store),
    client: MeetClient | None = Depends(get_meet_client),
) -> VideoLinkResponse:
    """Delete the Calendar event once the booking ended or the meeting is not a video call."""
    booking = _load(store, body.booking_id, user)
    if not booking.event_id:
        return VideoLinkResponse(link=None, status="none")
    still_video = (
        booking.status in ("requested", "confirmed")
        and booking.mode == "video"
        and booking.meet_greet_status in ("proposed", "agreed", "done")
    )
    if still_video:
        return VideoLinkResponse(link=booking.link, status="kept")
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Meet links are not set up yet.",
        )
    try:
        client.delete(booking.event_id)
    except GoogleMeetError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Google Calendar could not delete the event. Try again.",
        ) from exc
    store.save_event(booking.id, link=None, event_id=None)
    return VideoLinkResponse(link=None, status="released")
