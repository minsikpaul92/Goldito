"""RAG over `knowledge_chunks` (phase-07B 7B.2): split, embed, index, search.

Service role only — the table has no client policy. Every source type carries the ids that bound who may
ever retrieve it (architecture §9): a sitter's policy by sitter, a pet's Life Record / care request by pet,
an inquiry only for its owner × sitter pair. `match_knowledge` applies those filters in SQL.
"""

import re
from typing import Literal

from app.services import nebius

SourceType = Literal["sitter_policy", "life_record", "inquiry", "care_request"]

CHUNK_MAX = 800

_SCOPE: dict[str, str] = {"sitter_policy": "sitter", "life_record": "pet", "care_request": "pet", "inquiry": "owner"}
# The ids each source type must have (a missing one would make a chunk reachable by the wrong search).
_REQUIRED: dict[str, tuple[str, ...]] = {
    "sitter_policy": ("sitter_id",),
    "life_record": ("pet_id",),
    "care_request": ("pet_id",),
    "inquiry": ("sitter_id", "owner_id"),
}
_SENTENCE = re.compile(r"(?<=[.!?])\s+")


def chunk_text(text: str, limit: int = CHUNK_MAX) -> list[str]:
    """Paragraphs of at most `limit` characters: short paragraphs are joined, long ones split on sentences
    (and on words as a last resort)."""
    paragraphs = [" ".join(p.split()) for p in re.split(r"\n\s*\n|\r\n\s*\r\n", text or "")]
    pieces: list[str] = []
    for para in filter(None, paragraphs):
        if len(para) <= limit:
            pieces.append(para)
            continue
        current = ""
        for sentence in _SENTENCE.split(para):
            for part in _hard_split(sentence, limit):
                if current and len(current) + 1 + len(part) > limit:
                    pieces.append(current)
                    current = part
                else:
                    current = f"{current} {part}".strip()
        if current:
            pieces.append(current)
    # Join neighbours that fit together so tiny lines do not become tiny chunks.
    chunks: list[str] = []
    for piece in pieces:
        if chunks and len(chunks[-1]) + 2 + len(piece) <= limit:
            chunks[-1] = f"{chunks[-1]}\n\n{piece}"
        else:
            chunks.append(piece)
    return chunks


def _hard_split(text: str, limit: int) -> list[str]:
    out: list[str] = []
    while len(text) > limit:
        cut = text.rfind(" ", 0, limit)
        cut = cut if cut > 0 else limit
        out.append(text[:cut].strip())
        text = text[cut:].strip()
    if text:
        out.append(text)
    return out


def index_source(
    db,
    *,
    source_type: SourceType,
    source_id: str,
    text: str,
    sitter_id: str | None = None,
    pet_id: str | None = None,
    owner_id: str | None = None,
) -> int:
    """Replace everything indexed for this source with `text`. Returns the number of chunks (0 = removed only)."""
    ids = {"sitter_id": sitter_id, "pet_id": pet_id, "owner_id": owner_id}
    missing = [k for k in _REQUIRED[source_type] if not ids[k]]
    if missing:
        raise ValueError(f"{source_type} needs {', '.join(missing)}")

    chunks = chunk_text(text)
    vectors = nebius.embed(chunks, endpoint="rag-index") if chunks else []
    # Embed first, then swap: a failed embedding leaves the old index in place.
    db.table("knowledge_chunks").delete().eq("source_type", source_type).eq("source_id", source_id).execute()
    if chunks:
        rows = [
            {
                "scope": _SCOPE[source_type],
                "sitter_id": sitter_id,
                "pet_id": pet_id,
                "owner_id": owner_id,
                "source_type": source_type,
                "source_id": source_id,
                "chunk_no": i,
                "content": chunk,
                "embedding": vector,
            }
            for i, (chunk, vector) in enumerate(zip(chunks, vectors, strict=True))
        ]
        db.table("knowledge_chunks").insert(rows).execute()
    return len(chunks)


def search(db, query: str, *, sitter_id: str, pet_ids: list[str], owner_id: str, k: int = 5) -> list[dict]:
    """The `k` closest chunks the pair may see: `{content, source_type, source_id, similarity}`."""
    if not query.strip():
        return []
    (vector,) = nebius.embed([query], endpoint="rag-search")
    response = db.rpc(
        "match_knowledge",
        {"p_query": vector, "p_sitter": sitter_id, "p_pets": pet_ids, "p_owner": owner_id, "p_k": k},
    ).execute()
    return list(response.data or [])
