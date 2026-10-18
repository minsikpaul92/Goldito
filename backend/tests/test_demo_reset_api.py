"""POST /api/demo/reset: off by default, demo accounts only (the temporary testing reset)."""

import pytest
from app.config import get_settings
from app.deps.auth import CurrentUser, get_current_user
from app.main import app
from app.routers import demo
from fastapi.testclient import TestClient

DEMO_OWNER, DEMO_SITTER = "o1", "s1"


def user(user_id: str, email: str) -> CurrentUser:
    return CurrentUser(id=user_id, email=email, role="owner", display_name="Robert", access_token="t")


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test")
    monkeypatch.delenv("DEMO_RESET_ENABLED", raising=False)
    get_settings.cache_clear()
    monkeypatch.setattr(demo, "get_service_client", lambda: object())
    monkeypatch.setattr(demo.demo_reset, "demo_ids", lambda _c, _set=None: (DEMO_OWNER, DEMO_SITTER))
    yield TestClient(app)
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def sign_in_as(user_id: str, email: str = "demo-owner@goldito.test") -> None:
    app.dependency_overrides[get_current_user] = lambda: user(user_id, email)


def enable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEMO_RESET_ENABLED", "1")
    get_settings.cache_clear()


def test_it_does_not_exist_unless_switched_on(client: TestClient):
    sign_in_as(DEMO_OWNER)

    assert client.post("/api/demo/reset", json={"state": "pets"}).status_code == 404


def test_only_the_demo_accounts_may_reset(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    enable(monkeypatch)
    sign_in_as("u-real", "someone-real@example.com")

    assert client.post("/api/demo/reset", json={"state": "pets"}).status_code == 403


def test_a_demo_email_on_another_account_is_not_enough(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    enable(monkeypatch)
    sign_in_as("u-real", "demo-owner@goldito.test")  # the account id decides, not the email claim

    assert client.post("/api/demo/reset", json={"state": "pets"}).status_code == 403


@pytest.mark.parametrize("state", ["ready", "in_care"])
def test_the_new_states_are_accepted(client: TestClient, monkeypatch: pytest.MonkeyPatch, state: str):
    enable(monkeypatch)
    sign_in_as(DEMO_OWNER)
    monkeypatch.setattr(demo.demo_reset, "reset", lambda *a, **k: [])

    assert client.post("/api/demo/reset", json={"state": state}).json()["state"] == state


def test_an_unknown_state_is_refused(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    enable(monkeypatch)
    sign_in_as(DEMO_OWNER)

    assert client.post("/api/demo/reset", json={"state": "everything"}).status_code == 422


def test_a_demo_account_resets_to_the_chosen_state(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    enable(monkeypatch)
    sign_in_as(DEMO_SITTER, "demo-sitter@goldito.test")
    seen = {}

    def fake_reset(_client, owner_id, sitter_id, today, *, state, apply, demo_set):
        seen.update(owner=owner_id, sitter=sitter_id, state=state, apply=apply)
        return [("bookings", 1), ("notifications", 0)]

    monkeypatch.setattr(demo.demo_reset, "reset", fake_reset)

    response = client.post("/api/demo/reset", json={"state": "confirmed"})

    assert response.status_code == 200
    assert response.json() == {"state": "confirmed", "deleted": {"bookings": 1}}
    assert seen == {"owner": "o1", "sitter": "s1", "state": "confirmed", "apply": True}


def test_rpc_json_accepts_the_empty_answer_of_a_void_function(monkeypatch: pytest.MonkeyPatch):
    import httpx
    from app.services import authz

    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test")
    get_settings.cache_clear()
    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(204, request=httpx.Request("POST", "https://x")))

    assert authz.rpc_json("token", "request_skip_meet_greet", {"p_booking": "b1"}) is None
    get_settings.cache_clear()


def test_each_set_resets_only_its_own_pair(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    """Paul's owner resets Paul's pair; the default pair is not touched (the point of the sets)."""
    enable(monkeypatch)
    def ids(_client, demo_set=None):
        return {"paul": ("po", "ps"), "chloe": ("o1", "s1")}[demo_set.key]

    monkeypatch.setattr(demo.demo_reset, "demo_ids", ids)
    seen = []
    monkeypatch.setattr(
        demo.demo_reset,
        "reset",
        lambda _c, owner_id, sitter_id, today, *, state, apply, demo_set: seen.append((owner_id, sitter_id, demo_set.key)) or [],
    )
    sign_in_as("po", "demo-owner-paul@goldito.test")

    assert client.post("/api/demo/reset", json={"state": "pets"}).status_code == 200
    assert seen == [("po", "ps", "paul")]


def test_a_set_cannot_reset_another_sets_accounts(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    enable(monkeypatch)
    monkeypatch.setattr(demo.demo_reset, "demo_ids", lambda _c, demo_set=None: ("po", "ps"))
    sign_in_as("o1", "demo-owner-paul@goldito.test")  # Paul's email on the default owner's id

    assert client.post("/api/demo/reset", json={"state": "pets"}).status_code == 403

