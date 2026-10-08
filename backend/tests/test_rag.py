"""RAG service (phase-07B 7B.2): chunking, replace-on-reindex, scoped ids, search, and the reindex routes."""

from types import SimpleNamespace

import pytest
from app.routers import rag as rag_router
from app.services import authz, nebius, rag

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_media_sign import PET_ID, SITTER_ID, owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client


class ChunksDB:
    """knowledge_chunks table + match_knowledge rpc, in memory."""

    def __init__(self, **tables) -> None:
        self.inner = FakeDB(knowledge_chunks=[], **tables)
        self.rpcs: list[tuple[str, dict]] = []

    @property
    def rows(self) -> list[dict]:
        return self.inner.tables["knowledge_chunks"]

    def table(self, name):
        query = self.inner.table(name)
        if name != "knowledge_chunks":
            return query
        original_insert = query.insert
        query.insert = lambda payload: (
            [original_insert(r).execute() for r in payload] and SimpleNamespace(execute=lambda: SimpleNamespace(data=payload))
            if isinstance(payload, list)
            else original_insert(payload)
        )
        return query

    def rpc(self, name, params):
        self.rpcs.append((name, params))
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=[{"content": "x", "source_type": "sitter_policy", "source_id": "s", "similarity": 0.9}]))


@pytest.fixture
def embed(monkeypatch):
    calls: list[list[str]] = []

    def fake(texts, *, endpoint="embed"):
        calls.append(list(texts))
        return [[float(len(t))] * 3 for t in texts]

    monkeypatch.setattr(nebius, "embed", fake)
    return calls


# --- chunking ------------------------------------------------------------------------------------


def test_short_paragraphs_join_up_to_the_limit_and_none_exceeds_it():
    text = "\n\n".join(f"Rule {i}: " + "x" * 120 for i in range(20))
    chunks = rag.chunk_text(text)
    assert len(chunks) > 1 and all(len(c) <= rag.CHUNK_MAX for c in chunks)
    assert "Rule 0" in chunks[0] and "Rule 19" in chunks[-1]


def test_a_long_paragraph_splits_on_sentences_then_words():
    sentences = " ".join(f"This is sentence number {i}." for i in range(80))
    chunks = rag.chunk_text(sentences)
    assert all(len(c) <= rag.CHUNK_MAX for c in chunks) and len(chunks) >= 3
    assert not any(c.endswith("sentence number") for c in chunks[:-1])  # cut at sentence ends
    wall = "word " * 500
    assert all(len(c) <= rag.CHUNK_MAX for c in rag.chunk_text(wall))
    unbroken = "a" * 2000
    assert [len(c) for c in rag.chunk_text(unbroken)] == [800, 800, 400]


def test_empty_text_has_no_chunks():
    assert rag.chunk_text("") == [] and rag.chunk_text("  \n\n  ") == []


# --- indexing --------------------------------------------------------------------------------------


def test_reindexing_replaces_the_source_and_leaves_others(embed):
    db = ChunksDB()
    db.rows.append({"source_type": "sitter_policy", "source_id": "other", "chunk_no": 0, "content": "keep me"})
    assert rag.index_source(db, source_type="sitter_policy", source_id="chloe", text="No dogs over 20 kg.\n\nNo cats at night.", sitter_id="chloe") == 1
    first = [r for r in db.rows if r["source_id"] == "chloe"]
    assert len(first) == 1 and first[0]["scope"] == "sitter" and first[0]["sitter_id"] == "chloe"
    assert first[0]["chunk_no"] == 0 and len(first[0]["embedding"]) == 3

    rag.index_source(db, source_type="sitter_policy", source_id="chloe", text="Only small dogs.", sitter_id="chloe")
    assert [r["content"] for r in db.rows if r["source_id"] == "chloe"] == ["Only small dogs."]  # no duplicates
    assert any(r["content"] == "keep me" for r in db.rows)


def test_empty_text_removes_the_source_without_embedding(embed):
    db = ChunksDB()
    rag.index_source(db, source_type="sitter_policy", source_id="chloe", text="Something.", sitter_id="chloe")
    embed.clear()
    assert rag.index_source(db, source_type="sitter_policy", source_id="chloe", text="  ", sitter_id="chloe") == 0
    assert [r for r in db.rows if r["source_id"] == "chloe"] == [] and embed == []


def test_a_failed_embedding_keeps_the_old_index(monkeypatch, embed):
    db = ChunksDB()
    rag.index_source(db, source_type="sitter_policy", source_id="chloe", text="Old rules.", sitter_id="chloe")

    def down(texts, *, endpoint="embed"):
        raise nebius.AIUnavailable("down")

    monkeypatch.setattr(nebius, "embed", down)
    with pytest.raises(nebius.AIUnavailable):
        rag.index_source(db, source_type="sitter_policy", source_id="chloe", text="New rules.", sitter_id="chloe")
    assert [r["content"] for r in db.rows] == ["Old rules."]


@pytest.mark.parametrize(
    ("source_type", "ids", "scope"),
    [
        ("sitter_policy", {"sitter_id": "s"}, "sitter"),
        ("life_record", {"pet_id": "p"}, "pet"),
        ("care_request", {"pet_id": "p"}, "pet"),
        ("inquiry", {"sitter_id": "s", "owner_id": "o"}, "owner"),
    ],
)
def test_each_source_type_carries_its_scope_ids(embed, source_type, ids, scope):
    db = ChunksDB()
    rag.index_source(db, source_type=source_type, source_id="x", text="hello", **ids)
    assert db.rows[0]["scope"] == scope
    with pytest.raises(ValueError):
        rag.index_source(db, source_type=source_type, source_id="y", text="hello")  # no ids at all


def test_an_inquiry_needs_both_the_sitter_and_the_owner(embed):
    with pytest.raises(ValueError, match="owner_id"):
        rag.index_source(ChunksDB(), source_type="inquiry", source_id="x", text="hi", sitter_id="s")


# --- search ----------------------------------------------------------------------------------------


def test_search_embeds_the_query_and_passes_the_scope_to_sql(embed):
    db = ChunksDB()
    hits = rag.search(db, "Can you give a pill?", sitter_id="s", pet_ids=["p1", "p2"], owner_id="o", k=3)
    assert hits[0]["similarity"] == 0.9 and embed == [["Can you give a pill?"]]
    name, params = db.rpcs[0]
    assert name == "match_knowledge"
    assert params["p_sitter"] == "s" and params["p_pets"] == ["p1", "p2"] and params["p_owner"] == "o" and params["p_k"] == 3
    assert len(params["p_query"]) == 3


def test_a_blank_query_searches_nothing(embed):
    assert rag.search(ChunksDB(), "  ", sitter_id="s", pet_ids=[], owner_id="o") == [] and embed == []


# --- routes ------------------------------------------------------------------------------------------


@pytest.fixture
def routes(monkeypatch, embed):
    db = ChunksDB(
        sitter_profiles=[{"id": SITTER_ID, "policies": "No dogs over 20 kg."}],
        care_requests=[{"id": "cr1", "pet_id": PET_ID, "raw_text": "Pill at 2 PM in a treat."}],
    )
    monkeypatch.setattr(rag_router, "get_service_client", lambda: db)
    return db


def post(client, path, token, **body):
    return client.post(path, headers={"Authorization": f"Bearer {token}"}, json=body)


def test_a_sitter_reindexes_their_own_policies(client, routes):
    response = post(client, "/api/rag/reindex-sitter", sitter_token())
    assert response.status_code == 200 and response.json() == {"chunks": 1}
    assert routes.rows[0]["source_type"] == "sitter_policy" and routes.rows[0]["source_id"] == SITTER_ID


def test_an_owner_cannot_reindex_sitter_policies(client, routes):
    assert post(client, "/api/rag/reindex-sitter", owner_token()).status_code == 403
    assert routes.rows == []


def test_an_owner_reindexes_a_care_request_for_their_pet(client, routes, monkeypatch):
    monkeypatch.setattr(authz, "assert_owner_of", lambda user, pet_id: None)
    response = post(client, "/api/rag/reindex-care-request", owner_token(), care_request_id="00000000-0000-4000-8000-0000000000f1")
    assert response.status_code == 404  # unknown id
    routes.inner.tables["care_requests"][0]["id"] = "00000000-0000-4000-8000-0000000000f1"
    response = post(client, "/api/rag/reindex-care-request", owner_token(), care_request_id="00000000-0000-4000-8000-0000000000f1")
    assert response.status_code == 200 and routes.rows[0]["pet_id"] == PET_ID and routes.rows[0]["scope"] == "pet"


def test_a_sitter_cannot_reindex_a_care_request(client, routes):
    routes.inner.tables["care_requests"][0]["id"] = "00000000-0000-4000-8000-0000000000f1"
    # The real assert_owner_of refuses any non-owner.
    response = post(client, "/api/rag/reindex-care-request", sitter_token(), care_request_id="00000000-0000-4000-8000-0000000000f1")
    assert response.status_code == 403 and routes.rows == []


def test_an_embedding_outage_is_a_503_not_a_crash(client, routes, monkeypatch):
    def down(texts, *, endpoint="embed"):
        raise nebius.AIUnavailable("down")

    monkeypatch.setattr(nebius, "embed", down)
    assert post(client, "/api/rag/reindex-sitter", sitter_token()).status_code == 503
