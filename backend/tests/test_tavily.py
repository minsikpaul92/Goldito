"""Tavily for the treat check (Phase 12.1): trusted sites only, all searches at once, a failure is left out."""

import time

import httpx
import pytest
from app.ai.safety import Query
from app.config import get_settings
from app.services import tavily


@pytest.fixture
def key(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "tvly-test")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class FakeResponse:
    def __init__(self, results):
        self._results = results

    def raise_for_status(self):
        return None

    def json(self):
        return {"results": self._results}


def test_one_search_sends_the_trusted_domains_and_keeps_only_their_hits(monkeypatch):
    sent = {}

    def post(url, json, headers, timeout):
        sent.update(url=url, json=json, headers=headers)
        return FakeResponse([
            {"title": "Grapes and raisins", "url": "https://www.fda.gov/grapes", "content": "Grapes  can\ncause kidney failure."},
            {"title": "Blog", "url": "https://randomblog.example/grapes", "content": "x"},
            {"title": "FDA label", "url": "https://accessdata.fda.gov/poison/raisins", "content": "y"},
        ])

    monkeypatch.setattr(tavily.httpx, "post", post)
    hits = tavily.search(Query("raisins toxic dogs", topic="news", time_range="year"), api_key="k", timeout=5)
    assert sent["url"] == tavily.SEARCH_URL and sent["headers"]["Authorization"] == "Bearer k"
    assert sent["json"]["include_domains"] == tavily.TRUSTED_DOMAINS
    assert sent["json"]["topic"] == "news" and sent["json"]["time_range"] == "year"
    assert [h["domain"] for h in hits] == ["fda.gov", "accessdata.fda.gov"]
    assert hits[0]["content"] == "Grapes can cause kidney failure."


def test_no_key_means_no_search(monkeypatch):
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    get_settings.cache_clear()
    monkeypatch.setattr(tavily, "search", lambda *a, **k: pytest.fail("must not search without a key"))
    assert tavily.search_many([Query("x")]) == ([], False)
    get_settings.cache_clear()


def test_many_searches_merge_without_duplicates_and_skip_a_failure(monkeypatch, key):
    def search(query, *, api_key, timeout):
        if query.text == "bad":
            raise httpx.ConnectError("down")
        return [{"title": query.text, "url": "https://fda.gov/same", "domain": "fda.gov", "content": ""},
                {"title": query.text, "url": f"https://fda.gov/{query.text}", "domain": "fda.gov", "content": ""}]

    monkeypatch.setattr(tavily, "search", search)
    hits, ran = tavily.search_many([Query("a"), Query("bad"), Query("b")])
    assert ran is True
    assert [h["url"] for h in hits] == ["https://fda.gov/same", "https://fda.gov/a", "https://fda.gov/b"]


def test_every_search_failing_reports_that_search_did_not_run(monkeypatch, key):
    def search(query, *, api_key, timeout):
        raise httpx.HTTPStatusError("429", request=None, response=None)

    monkeypatch.setattr(tavily, "search", search)
    assert tavily.search_many([Query("a")]) == ([], False)


def test_a_late_search_is_left_out(monkeypatch, key):
    monkeypatch.setattr(tavily, "TOTAL_TIMEOUT_S", 0.2)

    def search(query, *, api_key, timeout):
        if query.text == "slow":
            time.sleep(1)
        return [{"title": "t", "url": f"https://fda.gov/{query.text}", "domain": "fda.gov", "content": ""}]

    monkeypatch.setattr(tavily, "search", search)
    hits, ran = tavily.search_many([Query("fast"), Query("slow")])
    assert ran is True and [h["url"] for h in hits] == ["https://fda.gov/fast"]
