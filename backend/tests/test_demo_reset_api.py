"""POST /api/demo/reset: off by default, demo accounts only (the temporary testing reset)."""

import pytest
from app.config import get_settings
from app.deps.auth import CurrentUser, get_current_user
from app.main import app
from app.routers import demo
from fastapi.testclient import TestClient


def user(email: str) -> CurrentUser:
    return CurrentUser(id="u1", email=email, role="owner", display_name="Robert", access_token="t")


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test")
    monkeypatch.delenv("DEMO_RESET_ENABLED", raising=False)
    get_settings.cache_clear()
    yield TestClient(app)
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def sign_in_as(email: str) -> None:
    app.dependency_overrides[get_current_user] = lambda: user(email)


def enable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEMO_RESET_ENABLED", "1")
    get_settings.cache_clear()


def test_it_does_not_exist_unless_switched_on(client: TestClient):
    sign_in_as("demo-owner@goldito.test")

    assert client.post("/api/demo/reset", json={"state": "pets"}).status_code == 404


def test_only_the_demo_accounts_may_reset(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    enable(monkeypatch)
    sign_in_as("someone-real@example.com")

    assert client.post("/api/demo/reset", json={"state": "pets"}).status_code == 403


def test_an_unknown_state_is_refused(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    enable(monkeypatch)
    sign_in_as("demo-owner@goldito.test")

    assert client.post("/api/demo/reset", json={"state": "everything"}).status_code == 422


def test_a_demo_account_resets_to_the_chosen_state(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    enable(monkeypatch)
    sign_in_as("demo-sitter@goldito.test")
    seen = {}

    def fake_reset(_client, owner_id, sitter_id, today, *, state, apply):
        seen.update(owner=owner_id, sitter=sitter_id, state=state, apply=apply)
        return [("bookings (owner side)", 1), ("notifications", 0)]

    monkeypatch.setattr(demo, "get_service_client", lambda: object())
    monkeypatch.setattr(demo.demo_reset, "demo_ids", lambda _c: ("o1", "s1"))
    monkeypatch.setattr(demo.demo_reset, "reset", fake_reset)

    response = client.post("/api/demo/reset", json={"state": "confirmed"})

    assert response.status_code == 200
    assert response.json() == {"state": "confirmed", "deleted": {"bookings (owner side)": 1}}
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
