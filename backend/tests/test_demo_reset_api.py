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

    def fake_reset(_client, owner_id, sitter_id, today, *, state, apply, demo_set, scope):
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
        lambda _c, owner_id, sitter_id, today, *, state, apply, demo_set, scope: seen.append((owner_id, sitter_id, demo_set.key, scope)) or [],
    )
    sign_in_as("po", "demo-owner-paul@goldito.test")

    assert client.post("/api/demo/reset", json={"state": "pets"}).status_code == 200
    assert seen == [("po", "ps", "paul", "owner")]  # an owner resets the owner side only


def test_a_set_cannot_reset_another_sets_accounts(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    enable(monkeypatch)
    monkeypatch.setattr(demo.demo_reset, "demo_ids", lambda _c, demo_set=None: ("po", "ps"))
    sign_in_as("o1", "demo-owner-paul@goldito.test")  # Paul's email on the default owner's id

    assert client.post("/api/demo/reset", json={"state": "pets"}).status_code == 403


def test_a_sitter_account_resets_the_sitter_side_only(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    enable(monkeypatch)
    monkeypatch.setattr(demo.demo_reset, "demo_ids", lambda _c, demo_set=None: ("po", "ps"))
    scopes = []
    monkeypatch.setattr(
        demo.demo_reset, "reset", lambda _c, *a, scope, **k: scopes.append(scope) or []
    )
    sign_in_as("ps", "demo-sitter-paul@goldito.test")

    assert client.post("/api/demo/reset", json={"state": "pets"}).status_code == 200
    assert scopes == ["sitter"]



def test_a_failed_reset_answers_json_not_a_bare_500(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    enable(monkeypatch)
    sign_in_as(DEMO_OWNER)

    def boom(*a, **k):
        raise RuntimeError("Could not insert into booking_consents (403)")

    monkeypatch.setattr(demo.demo_reset, "reset", boom)
    response = client.post("/api/demo/reset", json={"state": "in_care"})

    assert response.status_code == 500
    assert "booking_consents" in response.json()["detail"]
    demo._running.clear()


def test_a_second_reset_of_the_same_set_is_refused_while_one_runs(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    enable(monkeypatch)
    sign_in_as(DEMO_OWNER)
    answers = []

    def reset_while_another_runs(*a, **k):
        answers.append(client.post("/api/demo/reset", json={"state": "pets"}).status_code)
        return []

    monkeypatch.setattr(demo.demo_reset, "reset", reset_while_another_runs)

    assert client.post("/api/demo/reset", json={"state": "pets"}).status_code == 200
    assert answers == [409]
    demo._running.clear()


# Judge seats (#411): a judge set resets without DEMO_RESET_ENABLED, but only for the browser that holds its seat.

JUDGE_OWNER, JUDGE_SITTER = "jo", "js"
HOLDER = "00000000-0000-4000-8000-0000000000ea"


class SeatClient:
    """Answers the 015t RPCs from a dict of seat holders; records table writes."""

    def __init__(self, held: dict[str, str] | None = None, claim: dict | None = None):
        self.held = held or {}
        self.claim = claim or {"ok": True, "fresh": True}
        self.calls: list[tuple[str, dict]] = []
        self.updates: list[dict] = []

    def rpc(self, name: str, params: dict):
        self.calls.append((name, params))
        if name == "judge_seat_held":
            data = self.held.get(params["p_set"]) == params["p_holder"]
        else:
            data = [self.claim]
        return _Done(data)

    def table(self, _name: str):
        client = self

        class Update:
            def update(self, values):
                client.updates.append(values)
                return self

            def eq(self, *_a):
                return self

            def execute(self):
                return _Done(None)

        return Update()


class _Done:
    def __init__(self, data):
        self.data = data

    def execute(self):
        return self


def judge_client(monkeypatch: pytest.MonkeyPatch, seats: SeatClient) -> list:
    monkeypatch.setattr(demo, "get_service_client", lambda: seats)
    monkeypatch.setattr(demo.demo_reset, "demo_ids", lambda _c, demo_set=None: (JUDGE_OWNER, JUDGE_SITTER))
    resets = []
    monkeypatch.setattr(
        demo.demo_reset,
        "reset",
        lambda _c, owner_id, sitter_id, today, *, state, apply, demo_set, scope: resets.append((demo_set.key, state, scope)) or [],
    )
    return resets


def test_a_judge_resets_the_whole_set_without_the_team_switch(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    resets = judge_client(monkeypatch, SeatClient(held={"judge2": HOLDER}))
    sign_in_as(JUDGE_OWNER, "demo-owner-judge2@goldito.test")

    response = client.post("/api/demo/reset", json={"state": "in_care", "holder": HOLDER})

    assert response.status_code == 200
    assert resets == [("judge2", "in_care", "both")]


@pytest.mark.parametrize("holder", [None, "00000000-0000-4000-8000-0000000000eb"])
def test_a_judge_without_the_seat_cannot_reset(client: TestClient, monkeypatch: pytest.MonkeyPatch, holder):
    resets = judge_client(monkeypatch, SeatClient(held={"judge2": HOLDER}))
    sign_in_as(JUDGE_SITTER, "demo-sitter-judge2@goldito.test")

    response = client.post("/api/demo/reset", json={"state": "pets", "holder": holder})

    assert response.status_code == 409
    assert resets == []


def test_taking_a_fresh_seat_resets_the_set_to_a_clean_stay(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    seats = SeatClient(claim={"ok": True, "fresh": True})
    resets = judge_client(monkeypatch, seats)

    response = client.post("/api/demo/seat", json={"set": "judge3", "holder": HOLDER})

    assert response.json() == {"set": "judge3", "fresh": True}
    assert seats.calls == [("claim_judge_seat", {"p_set": "judge3", "p_holder": HOLDER})]
    assert resets == [("judge3", "pets", "both")]


def test_the_same_browser_taking_its_seat_again_keeps_the_stay(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    resets = judge_client(monkeypatch, SeatClient(claim={"ok": True, "fresh": False}))

    assert client.post("/api/demo/seat", json={"set": "judge3", "holder": HOLDER}).json()["fresh"] is False
    assert resets == []


def test_a_seat_in_use_is_refused(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    resets = judge_client(monkeypatch, SeatClient(claim={"ok": False, "fresh": False}))

    response = client.post("/api/demo/seat", json={"set": "judge1", "holder": HOLDER})

    assert response.status_code == 409
    assert response.json()["detail"] == "Judge 1 is in use."
    assert resets == []


@pytest.mark.parametrize("key", ["chloe", "paul", "nobody"])
def test_only_judge_sets_have_seats(client: TestClient, monkeypatch: pytest.MonkeyPatch, key: str):
    judge_client(monkeypatch, SeatClient())

    assert client.post("/api/demo/seat", json={"set": key, "holder": HOLDER}).status_code == 404


def test_a_failed_reset_frees_the_seat_with_no_holder(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    seats = SeatClient()
    judge_client(monkeypatch, seats)

    def boom(*a, **k):
        raise RuntimeError("down")

    monkeypatch.setattr(demo.demo_reset, "reset", boom)

    assert client.post("/api/demo/seat", json={"set": "judge4", "holder": HOLDER}).status_code == 500
    assert seats.updates == [{"holder": None, "heartbeat_at": "-infinity"}]
    demo._running.clear()


def test_the_judge_sets_keep_the_story_names():
    from app.services import demo_accounts

    keys = [s.key for s in demo_accounts.JUDGE_SETS]
    assert keys == ["judge1", "judge2", "judge3", "judge4"]
    for judge in demo_accounts.JUDGE_SETS:
        assert judge.owner.email.endswith("@goldito.test") and judge.sitter.email.endswith("@goldito.test")
        assert (judge.owner.display_name, judge.sitter.display_name) == ("Robert", "Chloe")
        assert [p[0] for p in judge.pets] == ["Max", "Mochi"]
        assert demo_accounts.DEMO_HOMES[judge.owner.email] == demo_accounts.DEMO_HOMES["demo-owner@goldito.test"]
    # The judges' accounts are seeded with everyone else's.
    assert {s.owner.email for s in demo_accounts.JUDGE_SETS} <= {u.email for u in demo_accounts.DEMO_USERS}
