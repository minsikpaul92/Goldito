"""The owner's agent: a pet parent writing to the person who may look after their animals. It sees its own pets, its own
dates and the quote the chat shows, and nothing of the sitter's rates, policy or availability."""

import re

from app.ai import chat as logic
from app.ai.chat_agents.base import ChatAgent

# The owner has no samples of their own, so they get a voice of their own: a pet parent talking to the person who will
# look after their animals, not a host (the sitter's voice is their style card and their own replies).
OWNER_STYLE = (
    "A pet owner writing to their sitter: relaxed, direct and a little caring, like a text to someone you are trusting "
    "with your pet. Talk about your own pets by name and what they need, thank the sitter for specifics, and ask one "
    "practical thing when it helps (pick-up time, feeding, a photo update). Never use host words like \"my place\", "
    "\"I can host\" or \"I'll take care of\"; you are the one asking, not the one hosting."
)

_HOSTING = re.compile(r"\b(my (?:place|home|house)|i can (?:host|take|watch)|i(?:'ll| will) (?:take care|look after|host))\b", re.IGNORECASE)


class OwnerAgent(ChatAgent):
    role = "owner"
    model_setting = "model_chat_owner"

    def facts(self, raw: dict, messages: list[dict]) -> dict:
        card = logic.shown_quote(messages)
        return {
            "owner": raw["owner"],
            "sitter": {"name": raw["sitter"]["name"]},
            **({"inquiry": raw["inquiry"]} if raw.get("inquiry") else {}),
            "availability": {"can_host": True, "unavailable_days": []},
            # What the chat shows: the quote card's own numbers, never a price worked out from the sitter's rates.
            "quote": card,
            "pets": raw.get("pets", []),
        }

    def style(self, db, ctx: dict, chip: str, last_them: dict | None) -> str:
        return OWNER_STYLE

    def fallback_chips(self, *, started: bool, facts: dict) -> list[str]:
        return logic.generic_chips("owner", started=started, can_host=None)

    def extra_problems(self, text: str, facts: dict) -> list[str]:
        return ["it talks like a host, but I am the owner asking for care"] if _HOSTING.search(text) else []
