"""The sitter's voice for AI drafts (D35): their style card plus a few of their own past replies.

`compose()` is the one place that turns "who is writing" into prompt text. Nothing here ever carries a fact:
amounts, dates, availability and the pets come from the server's facts, and examples keep `{PRICE}` / `{DATE}`
placeholders. A sitter with no history simply gets the default style; a search outage never blocks a draft.

`record_reply_sample()` learns from what the sitter does with a draft (sent as is → `approved`, changed →
`edited` with an `edit_ratio`, thrown away → `regenerated`). Auto-sent messages are never recorded.
"""

import logging
import re
from dataclasses import dataclass, field

from app.ai.prompts import load_prompt
from app.services import nebius

log = logging.getLogger("goldito.ai")

EXAMPLES = 3
CONTEXT_MAX = 600
TEXT_MAX = 2000
_WORD = re.compile(r"\S+")


@dataclass(frozen=True)
class Tone:
    """Text for the draft prompt. `examples` is how many of the sitter's own replies it contains."""

    style_notes: str
    examples: int = 0
    # Kept for callers that want chat-turn examples; the notes already contain them.
    turns: list[dict] = field(default_factory=list)


def default_style() -> str:
    return load_prompt("tone/default_style.md").strip()


def compose(db, sitter_id: str, *, kind: str = "inquiry", intent: str | None = None, query: str = "") -> Tone:
    """Style notes for `sitter_id`: their style card (or the default) and their closest past replies to `query`."""
    card = None
    try:
        found = db.table("sitter_profiles").select("style_card").eq("id", sitter_id).limit(1).execute()
        card = (found.data[0].get("style_card") if found.data else None) or None
    except Exception as exc:  # noqa: BLE001 — a missing card must never block a draft
        log.info("tone: no style card (%s)", exc)
    notes = (card or default_style()).strip()

    samples: list[dict] = []
    if query.strip():
        try:
            (vector,) = nebius.embed([f"{intent or ''} {query}".strip()], endpoint="tone-search")
            samples = db.rpc(
                "match_tone", {"p_query": vector, "p_sitter": sitter_id, "p_kind": kind, "p_k": EXAMPLES}
            ).execute().data or []
        except Exception as exc:  # noqa: BLE001
            log.info("tone: no examples (%s)", exc)
    if samples:
        lines = [
            "",
            "How this sitter has written before. Copy the voice (greeting, closing, emoji, sentence length), "
            "never the facts. {OWNER}, {PET}, {PRICE} and {DATE} in the examples are placeholders for real values.",
        ]
        for i, s in enumerate(samples[:EXAMPLES], start=1):
            lines.append(f"{i}. Situation: {s['context_summary']}\n   Reply: {s['final_text']}")
        notes += "\n" + "\n".join(lines)
    return Tone(style_notes=notes, examples=len(samples[:EXAMPLES]))


_AMOUNT = re.compile(r"\$\s?\d[\d,]*(?:\.\d+)?(?:\s?CAD)?", re.IGNORECASE)
_MONTH_DAY = re.compile(
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?\b", re.IGNORECASE
)
_ISO_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
_PHONE = re.compile(r"(?<![\w-])\+?\d(?:[\s().-]?\d){9,}(?![\w-])")


def anonymize(text: str, *, owner_names: list[str] | None = None, pet_names: list[str] | None = None) -> str:
    """What may be stored as a style example: no names, amounts, dates, phone numbers or e-mail addresses (D35)."""
    out = _EMAIL.sub("", text or "")
    out = _AMOUNT.sub("{PRICE}", out)
    out = _MONTH_DAY.sub("{DATE}", out)
    out = _ISO_DATE.sub("{DATE}", out)
    out = _PHONE.sub("", out)
    for placeholder, names in (("{OWNER}", owner_names or []), ("{PET}", pet_names or [])):
        for name in sorted({n for n in names if n and n.strip()}, key=len, reverse=True):
            out = re.sub(rf"\b{re.escape(name.strip())}(?:'s)?\b", placeholder, out, flags=re.IGNORECASE)
    return " ".join(out.split()) if "\n" not in out else re.sub(r"[ \t]+", " ", out).strip()


def words(text: str) -> list[str]:
    return _WORD.findall(text or "")


def edit_ratio(draft: str, final: str) -> float:
    """Word-level edit distance ÷ the longer text, 0 = sent as is, 1 = completely rewritten."""
    a, b = words(draft), words(final)
    if not a and not b:
        return 0.0
    previous = list(range(len(b) + 1))
    for i, wa in enumerate(a, start=1):
        current = [i]
        for j, wb in enumerate(b, start=1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (wa != wb)))
        previous = current
    return round(previous[-1] / max(len(a), len(b)), 4)


def record_sample(
    db,
    *,
    sitter_id: str,
    source: str,
    kind: str,
    context_summary: str,
    final_text: str,
    draft: str | None = None,
    intent: str | None = None,
    source_message_id: str | None = None,
) -> dict:
    """Store one sample (embedding the situation). Raises `nebius.AIUnavailable` when it can't be embedded."""
    context = " ".join(context_summary.split())[:CONTEXT_MAX]
    (vector,) = nebius.embed([context], endpoint="tone-record")
    row = {
        "sitter_id": sitter_id,
        "kind": kind,
        "source": source,
        "intent": intent,
        "context_summary": context,
        "draft": draft,
        "final_text": final_text[:TEXT_MAX],
        "edit_ratio": edit_ratio(draft, final_text) if source in ("approved", "edited") and draft is not None else None,
        "source_message_id": source_message_id,
        "embedding": vector,
    }
    return db.table("tone_samples").insert(row).execute().data[0]
