"""POST /api/sweep/bookings: a secret-header endpoint that runs the database sweep (BS-2)."""

import pytest
from app.config import get_settings
from app.main import app
from app.routers import sweep
from fastapi.testclient import TestClient


class FakeRpc:
    def __init__(self, calls: list[str]):
        self.calls = calls

    def execute(self):
        self.calls.append("executed")

        class Result:
            data = {"stalled": 2, "cancelled": 1}

        return Result()


class FakeClient:
    def __init__(self):
        self.calls: list[str] = []

    def rpc(self, name: str):
        self.calls.append(name)
        return FakeRpc(self.calls)


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test")
    monkeypatch.delenv("CRON_SECRET", raising=False)
    get_settings.cache_clear()
    fake = FakeClient()
    monkeypatch.setattr(sweep, "get_service_client", lambda: fake)
    test_client = TestClient(app)
    test_client.fake = fake  # type: ignore[attr-defined]
    yield test_client
    get_settings.cache_clear()


def set_secret(monkeypatch: pytest.MonkeyPatch, value: str = "s3cret") -> None:
    monkeypatch.setenv("CRON_SECRET", value)
    get_settings.cache_clear()


def test_it_does_not_exist_until_a_secret_is_set(client: TestClient):
    assert client.post("/api/sweep/bookings", headers={"X-Cron-Secret": "anything"}).status_code == 404
    assert client.fake.calls == []  # type: ignore[attr-defined]


def test_a_missing_or_wrong_secret_looks_like_a_404(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    set_secret(monkeypatch)

    assert client.post("/api/sweep/bookings").status_code == 404
    assert client.post("/api/sweep/bookings", headers={"X-Cron-Secret": "wrong"}).status_code == 404
    assert client.fake.calls == []  # type: ignore[attr-defined]


def test_the_right_secret_runs_the_database_sweep(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    set_secret(monkeypatch)

    response = client.post("/api/sweep/bookings", headers={"X-Cron-Secret": "s3cret"})

    assert response.status_code == 200
    assert response.json() == {"stalled": 2, "cancelled": 1}
    assert client.fake.calls[0] == "sweep_stale_bookings"  # type: ignore[attr-defined]
