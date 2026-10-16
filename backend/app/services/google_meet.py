"""Google Calendar events with a Google Meet link for video Meet & Greets (3B.11, D45).

The Goldito Google account is the organizer: a refresh token from its one-time consent
(scope calendar.events, OAuth app published *In production*) buys short-lived access
tokens. One event per booking; rescheduling patches it (same link), cancelling deletes it.
Right after the event is created the Meet room is opened to anyone with the link (Meet REST API,
scope meetings.space.settings): the guests are not the host, and a room that asks the host to
admit them would leave them waiting forever. Without that scope the link still works, it just
asks to join.
"""

import logging
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Protocol

import httpx

from app.config import Settings

TOKEN_URL = "https://oauth2.googleapis.com/token"
CALENDAR_URL = "https://www.googleapis.com/calendar/v3/calendars"
MEET_SPACES_URL = "https://meet.googleapis.com/v2/spaces"
EVENT_MINUTES = 30
# Meet links are usually ready at once; when the conference is still "pending", look again.
PENDING_RETRIES = 3
PENDING_WAIT_S = 1.0
# Calendar's per-calendar write limit: exponential backoff, 1 s → 2 s → 4 s.
RATE_LIMIT_RETRIES = 3
RATE_LIMIT_WAIT_S = 1.0


logger = logging.getLogger(__name__)


class GoogleMeetError(Exception):
    """Google refused or could not be reached."""


@dataclass(frozen=True)
class MeetEvent:
    event_id: str
    link: str | None


class MeetClient(Protocol):
    def create(
        self, *, request_id: str, summary: str, start: datetime, attendees: list[str], timezone: str
    ) -> MeetEvent: ...

    def reschedule(self, event_id: str, *, start: datetime, timezone: str) -> MeetEvent: ...

    def delete(self, event_id: str) -> None: ...


def _when(start: datetime, timezone: str) -> dict:
    end = start + timedelta(minutes=EVENT_MINUTES)
    return {
        "start": {"dateTime": start.isoformat(), "timeZone": timezone},
        "end": {"dateTime": end.isoformat(), "timeZone": timezone},
    }


def _meet_link(event: dict) -> str | None:
    if event.get("hangoutLink"):
        return event["hangoutLink"]
    for entry in (event.get("conferenceData") or {}).get("entryPoints") or []:
        if entry.get("entryPointType") == "video" and entry.get("uri"):
            return entry["uri"]
    return None


def _rate_limited(response: httpx.Response) -> bool:
    if response.status_code == 429:
        return True
    if response.status_code != 403:
        return False
    try:
        errors = (response.json().get("error") or {}).get("errors") or []
    except ValueError:
        return False
    return any(e.get("reason") in ("rateLimitExceeded", "userRateLimitExceeded") for e in errors)


def _reason(response: httpx.Response) -> str:
    """", rateLimitExceeded: …" from a Google error body, for logs (never secrets)."""
    try:
        error = response.json().get("error") or {}
    except ValueError:
        return ""
    reasons = ",".join(e.get("reason", "") for e in error.get("errors") or [] if e.get("reason"))
    return f", {reasons}: {error.get('message', '')}" if reasons or error.get("message") else ""


def _pending(event: dict) -> bool:
    status = ((event.get("conferenceData") or {}).get("createRequest") or {}).get("status") or {}
    return status.get("statusCode") == "pending"


class GoogleCalendarMeetClient:
    """Calendar API v3 over httpx with the Goldito account's refresh token."""

    def __init__(self, settings: Settings, http: httpx.Client | None = None) -> None:
        if not settings.google_meet_configured:
            raise GoogleMeetError("Google Meet is not configured")
        self._settings = settings
        self._http = http or httpx.Client(timeout=10.0)
        self._token: str | None = None
        self._token_expires = 0.0

    def _access_token(self) -> str:
        if self._token and time.monotonic() < self._token_expires - 60:
            return self._token
        s = self._settings
        try:
            response = self._http.post(
                TOKEN_URL,
                data={
                    "client_id": s.google_oauth_client_id,
                    "client_secret": s.google_oauth_client_secret,
                    "refresh_token": s.google_oauth_refresh_token,
                    "grant_type": "refresh_token",
                },
            )
        except httpx.HTTPError as exc:
            raise GoogleMeetError("Could not reach Google") from exc
        if response.status_code != 200:
            raise GoogleMeetError(f"Google token refresh failed ({response.status_code})")
        body = response.json()
        self._token = body["access_token"]
        self._token_expires = time.monotonic() + float(body.get("expires_in", 3600))
        return self._token

    def _call(self, method: str, path: str, *, params: dict | None = None, json: dict | None = None) -> dict:
        url = f"{CALENDAR_URL}/{self._settings.google_calendar_id}/events{path}"
        for attempt in range(RATE_LIMIT_RETRIES + 1):
            try:
                response = self._http.request(
                    method,
                    url,
                    params=params,
                    json=json,
                    headers={"Authorization": f"Bearer {self._access_token()}"},
                )
            except httpx.HTTPError as exc:
                raise GoogleMeetError("Could not reach Google") from exc
            # Back-to-back writes to one calendar get "rateLimitExceeded" — back off and retry.
            if not _rate_limited(response) or attempt == RATE_LIMIT_RETRIES:
                break
            time.sleep(RATE_LIMIT_WAIT_S * 2**attempt)
        if response.status_code in (404, 410) and method == "DELETE":
            return {}  # already gone (410 = deleted before)
        if response.status_code >= 300:
            raise GoogleMeetError(f"Google Calendar {method} failed ({response.status_code}{_reason(response)})")
        return response.json() if response.content else {}

    def _settle(self, event: dict) -> MeetEvent:
        for _ in range(PENDING_RETRIES):
            if not _pending(event) or _meet_link(event):
                break
            time.sleep(PENDING_WAIT_S)
            event = self._call("GET", f"/{event['id']}", params={"conferenceDataVersion": 1})
        return MeetEvent(event_id=event["id"], link=_meet_link(event))

    def _open_access(self, link: str | None) -> None:
        """Let anyone with the link in without the host admitting them. Best effort: a failure
        (scope not granted yet, Meet API off) is logged and the link is still returned.
        Meet only edits a room by its space id, so the meeting code in the link is looked up first."""
        meeting_code = (link or "").rstrip("/").rsplit("/", 1)[-1]
        if not meeting_code:
            return
        try:
            headers = {"Authorization": f"Bearer {self._access_token()}"}
            space = self._http.get(f"{MEET_SPACES_URL}/{meeting_code}", headers=headers)
            if space.status_code >= 300:
                logger.warning("Meet space lookup failed (%s%s)", space.status_code, _reason(space))
                return
            response = self._http.patch(
                f"https://meet.googleapis.com/v2/{space.json()['name']}",
                params={"updateMask": "config.accessType"},
                json={"config": {"accessType": "OPEN"}},
                headers=headers,
            )
        except (httpx.HTTPError, GoogleMeetError, KeyError, ValueError) as exc:
            logger.warning("Meet open access skipped: %s", exc)
            return
        if response.status_code >= 300:
            logger.warning("Meet open access failed (%s%s)", response.status_code, _reason(response))

    def _send_updates(self, attendees: list[str] | None = None) -> str:
        if attendees is not None and not attendees:
            return "none"
        return "all" if self._settings.meet_invite_attendees else "none"

    def create(
        self, *, request_id: str, summary: str, start: datetime, attendees: list[str], timezone: str
    ) -> MeetEvent:
        event = self._call(
            "POST",
            "",
            params={"conferenceDataVersion": 1, "sendUpdates": self._send_updates(attendees)},
            json={
                "summary": summary,
                "description": "Goldito Meet & Greet — say hi before the first stay.",
                **_when(start, timezone),
                "attendees": [{"email": email} for email in attendees],
                "conferenceData": {
                    "createRequest": {
                        "requestId": request_id,
                        "conferenceSolutionKey": {"type": "hangoutsMeet"},
                    }
                },
            },
        )
        created = self._settle(event)
        self._open_access(created.link)
        return created

    def reschedule(self, event_id: str, *, start: datetime, timezone: str) -> MeetEvent:
        event = self._call(
            "PATCH",
            f"/{event_id}",
            params={"conferenceDataVersion": 1, "sendUpdates": self._send_updates()},
            json=_when(start, timezone),
        )
        return self._settle(event)

    def delete(self, event_id: str) -> None:
        self._call("DELETE", f"/{event_id}", params={"sendUpdates": self._send_updates()})
