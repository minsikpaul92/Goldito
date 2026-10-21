"""Daily limits on the paid routes (audit 2026-10-21): every AI call and every upload signature counts per person."""

from datetime import UTC, datetime

import pytest
from app.deps import limits
from app.main import app

from tests import test_media_sign as base
from tests.test_media_sign import sitter_token

isolated_settings = base.isolated_settings
client = base.client


def test_a_person_gets_per_day_calls_then_none_and_others_are_not_affected() -> None:
    limit = limits.DailyLimit(2, "x")
    assert [limit.allow("a"), limit.allow("a"), limit.allow("a")] == [True, True, False]
    assert limit.allow("b")


def test_a_shared_demo_account_has_a_bigger_budget() -> None:
    limit = limits.DailyLimit(1, "x", per_day_demo=3)
    assert [limit.allow("demo", demo=True) for _ in range(4)] == [True, True, True, False]


def test_the_count_starts_again_the_next_day(monkeypatch) -> None:
    limit = limits.DailyLimit(1, "x")
    days = iter([datetime(2026, 10, 21, tzinfo=UTC), datetime(2026, 10, 21, tzinfo=UTC), datetime(2026, 10, 22, tzinfo=UTC)])

    class Clock:
        @staticmethod
        def now(tz):
            return next(days)

    monkeypatch.setattr(limits, "datetime", Clock)
    assert [limit.allow("a"), limit.allow("a"), limit.allow("a")] == [True, False, True]
    assert len(limit._counts) == 1  # yesterday's counts are dropped


PAID_PREFIXES = ("/api/ai/", "/api/rag/", "/api/tone/")
SIGN_PATHS = {"/api/media/sign", "/api/pet-photos/sign", "/api/profile-photos/sign"}


def paid_paths() -> list[str]:
    return sorted(path for path, ops in app.openapi()["paths"].items() if path.startswith(PAID_PREFIXES) and "post" in ops)


def test_every_ai_route_is_on_the_list() -> None:
    paths = paid_paths()
    assert "/api/ai/chat-chips" in paths and "/api/ai/pet-voice/transcribe" in paths
    assert len(paths) >= 14


@pytest.mark.parametrize("path", paid_paths())
def test_every_ai_route_answers_429_once_the_day_is_used(client, monkeypatch, path) -> None:
    monkeypatch.setattr(limits.ai_calls, "per_day_demo", 0)  # the test accounts are @goldito.test
    response = client.post(path, json={}, headers={"Authorization": f"Bearer {sitter_token()}"})
    assert response.status_code == 429
    assert response.json() == {"detail": "Daily AI limit reached. Try again tomorrow.", "code": "rate_limited"}


@pytest.mark.parametrize("path", sorted(SIGN_PATHS))
def test_every_upload_signature_answers_429_once_the_day_is_used(client, monkeypatch, path) -> None:
    monkeypatch.setattr(limits.uploads, "per_day_demo", 0)
    response = client.post(path, json={}, headers={"Authorization": f"Bearer {sitter_token()}"})
    assert response.status_code == 429
    assert response.json() == {"detail": "Daily upload limit reached. Try again tomorrow.", "code": "rate_limited"}


def test_without_a_token_it_is_still_401_not_429(client, monkeypatch) -> None:
    monkeypatch.setattr(limits.ai_calls, "per_day_demo", 0)
    assert client.post("/api/ai/caption", json={}).status_code == 401
