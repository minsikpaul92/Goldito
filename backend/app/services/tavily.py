"""Tavily web search for the treat check (Phase 12.1, D59 · D61).

Every check searches, and only on trusted veterinary and government sites — no retry without the domain filter. The
searches run together under one time limit; a search that fails or is late is simply left out, and an unset key means
no search at all (the check still answers from the label, the rules and the model).
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor, wait
from urllib.parse import urlparse

import httpx

from app.ai.safety import Query
from app.config import get_settings

log = logging.getLogger("goldito.tavily")

SEARCH_URL = "https://api.tavily.com/search"
TRUSTED_DOMAINS = ["fda.gov"]
TOTAL_TIMEOUT_S = 8.0
MAX_RESULTS = 3
EXCERPT_CHARS = 400


def _domain(url: str) -> str:
    host = urlparse(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


def search(
    query: Query, *, api_key: str, timeout: float, domains: list[str] | None = None, excerpt_chars: int = EXCERPT_CHARS
) -> list[dict]:
    """One basic search (1 credit) on the trusted domains (the treat check's, or `domains`): [{title, url, domain, content}]."""
    domains = domains or TRUSTED_DOMAINS
    payload: dict = {
        "query": query.text,
        "search_depth": "basic",
        "topic": query.topic,
        "max_results": MAX_RESULTS,
        "include_domains": domains,
    }
    if query.time_range:
        payload["time_range"] = query.time_range
    response = httpx.post(SEARCH_URL, json=payload, headers={"Authorization": f"Bearer {api_key}"}, timeout=timeout)
    response.raise_for_status()
    hits = []
    for item in response.json().get("results") or []:
        url = str(item.get("url") or "")
        domain = _domain(url)
        # The filter is Tavily's; keep only what really is on a trusted site.
        if not url or not any(domain == d or domain.endswith(f".{d}") for d in domains):
            continue
        hits.append({
            "title": str(item.get("title") or domain)[:200],
            "url": url,
            "domain": domain,
            "content": " ".join(str(item.get("content") or "").split())[:excerpt_chars],
        })
    return hits


def search_many(queries: list[Query]) -> tuple[list[dict], bool]:
    """All the queries at once, within TOTAL_TIMEOUT_S. Returns (unique hits in query order, whether search ran)."""
    api_key = get_settings().tavily_api_key
    if not api_key or not queries:
        log.info("tavily: skipped (%s)", "no key" if not api_key else "no queries")
        return [], False
    started = time.monotonic()
    pool = ThreadPoolExecutor(max_workers=len(queries))
    futures = [pool.submit(search, q, api_key=api_key, timeout=TOTAL_TIMEOUT_S) for q in queries]
    done, _late = wait(futures, timeout=TOTAL_TIMEOUT_S)
    pool.shutdown(wait=False, cancel_futures=True)
    hits: list[dict] = []
    seen: set[str] = set()
    ok = 0
    for future in futures:
        if future not in done:
            continue
        try:
            results = future.result()
        except (httpx.HTTPError, ValueError) as exc:
            log.info("tavily: a search failed (%s)", exc.__class__.__name__)
            continue
        ok += 1
        for hit in results:
            if hit["url"] not in seen:
                seen.add(hit["url"])
                hits.append(hit)
    log.info(
        "tavily_call %s",
        {"queries": len(queries), "ok": ok, "hits": len(hits), "latency_ms": int((time.monotonic() - started) * 1000)},
    )
    return hits, ok > 0
