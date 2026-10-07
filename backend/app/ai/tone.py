"""The sitter's voice for AI drafts (D35). Phase 07B 7B.8 fills this in (style card + the sitter's own examples).

Until then every sitter gets the same neutral style notes and no example replies, so the draft prompt can already
call `compose()` and will pick up the real layer without a change.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Tone:
    style_notes: str
    # Chat turns (user = the facts, assistant = the sitter's reply) shown to the model as worked examples.
    examples: list[dict] = field(default_factory=list)


DEFAULT_STYLE = "Friendly, plain and brief. Warm greeting by name, one or two sentences of substance, a gentle close."


def compose(sitter_id: str, *, kind: str, intent: str | None = None, query: str = "") -> Tone:
    return Tone(style_notes=DEFAULT_STYLE)
