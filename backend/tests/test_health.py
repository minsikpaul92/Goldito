from app.main import app
from app.routers import health
from fastapi.testclient import TestClient

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


class _Query:
    def __init__(self, calls: list[str], fail: bool) -> None:
        self.calls, self.fail = calls, fail

    def select(self, columns: str) -> "_Query":
        self.calls.append(f"select {columns}")
        return self

    def limit(self, n: int) -> "_Query":
        self.calls.append(f"limit {n}")
        return self

    def execute(self):
        if self.fail:
            raise RuntimeError("connection refused")
        return object()


class _Db:
    def __init__(self, fail: bool = False) -> None:
        self.calls: list[str] = []
        self.fail = fail

    def table(self, name: str) -> _Query:
        self.calls.append(f"table {name}")
        return _Query(self.calls, self.fail)


def test_health_deep_reads_one_row_from_supabase(monkeypatch) -> None:
    db = _Db()
    monkeypatch.setattr(health, "get_service_client", lambda: db)
    response = client.get("/health/deep")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
    assert db.calls == ["table profiles", "select id", "limit 1"]


def test_health_deep_says_503_without_details_when_supabase_is_down(monkeypatch) -> None:
    monkeypatch.setattr(health, "get_service_client", lambda: _Db(fail=True))
    response = client.get("/health/deep")
    assert response.status_code == 503
    assert response.json() == {"status": "error", "database": "unavailable"}
    assert "refused" not in response.text


def test_plain_health_never_touches_supabase(monkeypatch) -> None:
    def boom():
        raise AssertionError("/health must not call Supabase")

    monkeypatch.setattr(health, "get_service_client", boom)
    assert client.get("/health").status_code == 200
