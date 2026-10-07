"""Video Meet & Greet link endpoint and Google Calendar client (3B.11). Google is mocked."""

import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime

import httpx
import jwt
import pytest
from app.config import Settings, get_settings
from app.deps.auth import Profile, get_profile_lookup
from app.main import app
from app.routers import meet_greet
from app.routers.meet_greet import MeetGreetBooking, get_booking_store, get_meet_client
from app.services import google_meet
from app.services.google_meet import GoogleCalendarMeetClient, GoogleMeetError, MeetEvent
from fastapi.testclient import TestClient

SUPABASE_URL = "https://example.supabase.co"
JWT_SECRET = "test-jwt-secret-with-at-least-32-characters"
OWNER_ID = "00000000-0000-4000-8000-000000000001"
SITTER_ID = "00000000-0000-4000-8000-000000000002"
OUTSIDER_ID = "00000000-0000-4000-8000-000000000003"
BOOKING_ID = "00000000-0000-4000-8000-0000000000e1"
# Oct 6 2030, 7:00 PM in Toronto (EDT).
AT = datetime(2030, 10, 6, 23, 0, tzinfo=UTC)
MEET = "https://meet.google.com/abc-defg-hij"

PROFILES = {
    OWNER_ID: Profile(id=OWNER_ID, role="owner", display_name="Robert"),
    SITTER_ID: Profile(id=SITTER_ID, role="sitter", display_name="Chloe"),
    OUTSIDER_ID: Profile(id=OUTSIDER_ID, role="sitter", display_name="Paul"),
}

AGREED = MeetGreetBooking(
    id=BOOKING_ID,
    owner_id=OWNER_ID,
    sitter_id=SITTER_ID,
    status="requested",
    meet_greet_status="agreed",
    mode="video",
    at=AT,
    link=None,
    event_id=None,
    owner_name="Robert",
    sitter_name="Chloe",
    pet_names=["Max", "Mochi"],
    owner_email="robert@example.com",
    sitter_email="demo-sitter@pawddy.test",
)


@dataclass
class FakeStore:
    booking: MeetGreetBooking | None
    saved: list[dict] = field(default_factory=list)
    notices: list[dict] = field(default_factory=list)

    def get(self, booking_id: str) -> MeetGreetBooking | None:
        return self.booking if self.booking and self.booking.id == booking_id else None

    def save_event(self, booking_id: str, *, link: str | None, event_id: str | None) -> None:
        self.saved.append({"booking_id": booking_id, "link": link, "event_id": event_id})

    def claim_event(self, booking_id: str, *, link: str | None, event_id: str, expect_event_id: str | None) -> bool:
        current = self.get(booking_id)
        if current is None or current.link is not None or current.event_id != expect_event_id:
            return False
        self.booking = replace(current, link=link, event_id=event_id)
        self.saved.append({"booking_id": booking_id, "link": link, "event_id": event_id})
        return True

    def notify(self, user_ids: list[str], booking_id: str, title: str, body: str | None) -> None:
        self.notices.append({"user_ids": user_ids, "title": title, "body": body})


@dataclass
class FakeMeet:
    link: str | None = MEET
    fail: bool = False
    calls: list[tuple] = field(default_factory=list)

    on_create: Callable[[], None] | None = None

    def create(self, **kwargs) -> MeetEvent:
        self.calls.append(("create", kwargs))
        if self.on_create:
            self.on_create()
        if self.fail:
            raise GoogleMeetError("boom")
        return MeetEvent(event_id="evt-1", link=self.link)

    def reschedule(self, event_id: str, **kwargs) -> MeetEvent:
        self.calls.append(("reschedule", event_id, kwargs))
        return MeetEvent(event_id=event_id, link=self.link)

    def delete(self, event_id: str) -> None:
        self.calls.append(("delete", event_id))


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", JWT_SECRET)
    monkeypatch.setenv("APP_TIMEZONE", "America/Toronto")
    monkeypatch.setenv("MEET_INVITE_ATTENDEES", "true")
    get_settings.cache_clear()
    app.dependency_overrides[get_profile_lookup] = lambda: PROFILES.get
    yield
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def use(store: FakeStore, meet: FakeMeet | None) -> None:
    app.dependency_overrides[get_booking_store] = lambda: store
    app.dependency_overrides[get_meet_client] = lambda: meet


def auth(user_id: str) -> dict:
    now = int(time.time())
    token = jwt.encode(
        {
            "sub": user_id,
            "aud": "authenticated",
            "iss": f"{SUPABASE_URL}/auth/v1",
            "iat": now,
            "exp": now + 300,
        },
        JWT_SECRET,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def post(path: str, user_id: str | None = OWNER_ID):
    headers = auth(user_id) if user_id else {}
    return TestClient(app).post(f"/api/meet-greet/{path}", json={"booking_id": BOOKING_ID}, headers=headers)


# --- POST /api/meet-greet/video-link -------------------------------------------------------


def test_needs_a_signed_in_party() -> None:
    use(FakeStore(AGREED), FakeMeet())
    assert post("video-link", None).status_code == 401
    response = post("video-link", OUTSIDER_ID)
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_only_for_an_agreed_video_meet_and_greet() -> None:
    for booking in (
        replace(AGREED, meet_greet_status="proposed"),
        replace(AGREED, mode="in_person"),
        replace(AGREED, status="cancelled"),
    ):
        meet = FakeMeet()
        use(FakeStore(booking), meet)
        response = post("video-link")
        assert response.status_code == 409
        assert response.json()["code"] == "conflict"
        assert meet.calls == []


def test_without_google_setup_the_app_keeps_its_fallback() -> None:
    use(FakeStore(AGREED), None)
    response = post("video-link", SITTER_ID)
    assert response.status_code == 503
    assert response.json()["code"] == "not_configured"


def test_creates_the_event_saves_the_link_and_tells_both_sides() -> None:
    store, meet = FakeStore(AGREED), FakeMeet()
    use(store, meet)
    response = post("video-link", SITTER_ID)

    assert response.status_code == 200
    assert response.json() == {"link": MEET, "status": "created"}
    kind, kwargs = meet.calls[0]
    assert kind == "create"
    assert kwargs["summary"] == "Goldito Meet & Greet — Max, Mochi & Chloe"
    assert kwargs["start"] == AT
    assert kwargs["timezone"] == "America/Toronto"
    # The demo .test address never gets an invite.
    assert kwargs["attendees"] == ["robert@example.com"]
    assert kwargs["request_id"] == f"goldito-{BOOKING_ID}-{int(AT.timestamp())}"
    assert store.saved == [{"booking_id": BOOKING_ID, "link": MEET, "event_id": "evt-1"}]
    assert store.notices == [
        {
            "user_ids": [OWNER_ID, SITTER_ID],
            "title": "Video Meet & Greet on Oct 6, 7:00 PM — join with Google Meet",
            "body": "Max & Mochi",
        }
    ]


def test_invites_can_be_switched_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEET_INVITE_ATTENDEES", "false")
    get_settings.cache_clear()
    meet = FakeMeet()
    use(FakeStore(AGREED), meet)
    assert post("video-link").status_code == 200
    assert meet.calls[0][1]["attendees"] == []


def test_is_idempotent_once_the_link_exists() -> None:
    meet = FakeMeet()
    use(FakeStore(replace(AGREED, link=MEET, event_id="evt-1")), meet)
    response = post("video-link")
    assert response.json() == {"link": MEET, "status": "existing"}
    assert meet.calls == []


def test_a_reschedule_patches_the_same_event() -> None:
    store, meet = FakeStore(replace(AGREED, event_id="evt-1")), FakeMeet()
    use(store, meet)
    response = post("video-link")
    assert response.json() == {"link": MEET, "status": "rescheduled"}
    assert meet.calls[0][:2] == ("reschedule", "evt-1")
    assert store.saved[-1]["event_id"] == "evt-1"


def test_a_still_pending_conference_saves_the_event_without_notices() -> None:
    store = FakeStore(AGREED)
    use(store, FakeMeet(link=None))
    response = post("video-link")
    assert response.json() == {"link": None, "status": "pending"}
    assert store.saved == [{"booking_id": BOOKING_ID, "link": None, "event_id": "evt-1"}]
    assert store.notices == []


def test_when_both_sides_ask_at_once_the_first_link_wins() -> None:
    store = FakeStore(AGREED)
    first = "https://meet.google.com/first-one"

    def other_request_saves_first() -> None:
        store.booking = replace(AGREED, link=first, event_id="evt-0")

    meet = FakeMeet(on_create=other_request_saves_first)
    use(store, meet)
    response = post("video-link", SITTER_ID)
    assert response.json() == {"link": first, "status": "existing"}
    # Our duplicate Calendar event is deleted; the saved one stays, and nobody gets a second notice.
    assert meet.calls[-1] == ("delete", "evt-1")
    assert store.booking.event_id == "evt-0"
    assert store.notices == []


def test_google_errors_are_502() -> None:
    store = FakeStore(AGREED)
    use(store, FakeMeet(fail=True))
    response = post("video-link")
    assert response.status_code == 502
    assert response.json()["code"] == "upstream_error"
    assert store.saved == []


# --- POST /api/meet-greet/video-link/release ----------------------------------------------


def test_release_deletes_the_event_of_a_cancelled_booking() -> None:
    store, meet = FakeStore(replace(AGREED, status="cancelled", link=MEET, event_id="evt-1")), FakeMeet()
    use(store, meet)
    response = post("video-link/release")
    assert response.json() == {"link": None, "status": "released"}
    assert meet.calls == [("delete", "evt-1")]
    assert store.saved == [{"booking_id": BOOKING_ID, "link": None, "event_id": None}]


def test_release_keeps_a_meeting_that_is_still_a_video_call() -> None:
    meet = FakeMeet()
    use(FakeStore(replace(AGREED, link=MEET, event_id="evt-1")), meet)
    assert post("video-link/release").json() == {"link": MEET, "status": "kept"}
    use(FakeStore(AGREED), meet)
    assert post("video-link/release").json() == {"link": None, "status": "none"}
    assert meet.calls == []


def test_switching_to_in_person_releases_the_video_event() -> None:
    meet = FakeMeet()
    use(FakeStore(replace(AGREED, mode="in_person", meet_greet_status="proposed", event_id="evt-1")), meet)
    assert post("video-link/release").json()["status"] == "released"
    assert meet.calls == [("delete", "evt-1")]


# --- GoogleCalendarMeetClient over a mocked Google ----------------------------------------


def google_settings(**overrides) -> Settings:
    base = {
        "GOOGLE_OAUTH_CLIENT_ID": "client",
        "GOOGLE_OAUTH_CLIENT_SECRET": "secret",
        "GOOGLE_OAUTH_REFRESH_TOKEN": "refresh",
        "MEET_INVITE_ATTENDEES": "true",
    }
    return Settings(**{**base, **overrides})


def test_client_refreshes_the_token_and_requests_a_meet_conference(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(google_meet, "PENDING_WAIT_S", 0)
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "at-1", "expires_in": 3600})
        if request.method == "POST":
            # Google is still preparing the conference on the first answer.
            return httpx.Response(
                200,
                json={"id": "evt-9", "conferenceData": {"createRequest": {"status": {"statusCode": "pending"}}}},
            )
        return httpx.Response(200, json={"id": "evt-9", "hangoutLink": MEET})

    client = GoogleCalendarMeetClient(google_settings(), http=httpx.Client(transport=httpx.MockTransport(handler)))
    event = client.create(
        request_id="req-1",
        summary="Goldito Meet & Greet — Max & Chloe",
        start=AT,
        attendees=["robert@example.com"],
        timezone="America/Toronto",
    )

    assert event == MeetEvent(event_id="evt-9", link=MEET)
    token, create, poll = seen
    assert b"grant_type=refresh_token" in token.content
    assert create.headers["Authorization"] == "Bearer at-1"
    assert create.url.params["conferenceDataVersion"] == "1"
    assert create.url.params["sendUpdates"] == "all"
    body = json.loads(create.content)
    assert body["conferenceData"]["createRequest"] == {
        "requestId": "req-1",
        "conferenceSolutionKey": {"type": "hangoutsMeet"},
    }
    assert body["attendees"] == [{"email": "robert@example.com"}]
    assert body["start"]["timeZone"] == "America/Toronto"
    assert poll.method == "GET" and poll.url.path.endswith("/events/evt-9")


def test_client_reschedule_delete_and_errors() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "at-1", "expires_in": 3600})
        if request.method == "PATCH":
            return httpx.Response(200, json={"id": "evt-9", "hangoutLink": MEET})
        if request.method == "DELETE":
            return httpx.Response(410)  # Google: "Resource has been deleted" - already gone is fine
        return httpx.Response(500)

    client = GoogleCalendarMeetClient(google_settings(), http=httpx.Client(transport=httpx.MockTransport(handler)))
    assert client.reschedule("evt-9", start=AT, timezone="America/Toronto").link == MEET
    client.delete("evt-9")
    with pytest.raises(GoogleMeetError):
        client.create(request_id="r", summary="s", start=AT, attendees=[], timezone="America/Toronto")
    # One token refresh for all three calls.
    assert sum(1 for r in seen if r.url.host == "oauth2.googleapis.com") == 1


def test_client_backs_off_when_google_rate_limits(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(google_meet, "RATE_LIMIT_WAIT_S", 0)
    calls = {"patch": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "at-1", "expires_in": 3600})
        calls["patch"] += 1
        if calls["patch"] < 3:
            # What Google answers to back-to-back writes on one calendar.
            return httpx.Response(
                403, json={"error": {"message": "Rate Limit Exceeded", "errors": [{"reason": "rateLimitExceeded"}]}}
            )
        return httpx.Response(200, json={"id": "evt-9", "hangoutLink": MEET})

    client = GoogleCalendarMeetClient(google_settings(), http=httpx.Client(transport=httpx.MockTransport(handler)))
    assert client.reschedule("evt-9", start=AT, timezone="America/Toronto").link == MEET
    assert calls["patch"] == 3


def test_client_gives_up_after_retries_and_says_why(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(google_meet, "RATE_LIMIT_WAIT_S", 0)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "at-1", "expires_in": 3600})
        return httpx.Response(403, json={"error": {"message": "Rate Limit Exceeded", "errors": [{"reason": "rateLimitExceeded"}]}})

    client = GoogleCalendarMeetClient(google_settings(), http=httpx.Client(transport=httpx.MockTransport(handler)))
    with pytest.raises(GoogleMeetError, match="rateLimitExceeded"):
        client.reschedule("evt-9", start=AT, timezone="America/Toronto")


def test_client_needs_the_google_settings() -> None:
    with pytest.raises(GoogleMeetError):
        GoogleCalendarMeetClient(Settings(GOOGLE_OAUTH_CLIENT_ID=None))


def test_router_reads_the_real_client_only_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    # Empty env vars win over a real backend/.env with Google values.
    for key in ("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN"):
        monkeypatch.setenv(key, "")
    get_settings.cache_clear()
    assert get_meet_client() is None
    monkeypatch.setattr(meet_greet, "_meet_client", lambda: "client")
    for key, value in {
        "GOOGLE_OAUTH_CLIENT_ID": "c",
        "GOOGLE_OAUTH_CLIENT_SECRET": "s",
        "GOOGLE_OAUTH_REFRESH_TOKEN": "r",
    }.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    assert get_meet_client() == "client"
