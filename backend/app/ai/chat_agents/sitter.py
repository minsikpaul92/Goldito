"""The sitter's agent: the warm host. It sees its rates, policy, availability and the quote for the stay, and writes in the
sitter's own anonymized voice."""

from app.ai import chat as logic
from app.ai import inquiry as inquiry_logic
from app.ai import tone
from app.ai.chat_agents.base import ChatAgent


class SitterAgent(ChatAgent):
    role = "sitter"
    model_setting = "model_chat_sitter"

    def facts(self, raw: dict, messages: list[dict]) -> dict:
        return raw

    def style(self, db, ctx: dict, chip: str, last_them: dict | None) -> str:
        # The sitter's own anonymized replies to owners ("inquiry" samples) are the closest voice for a chat reply too.
        return tone.compose(db, ctx["thread"]["sitter_id"], kind="inquiry", query=f"{chip}: {(last_them or {}).get('body', '')}").style_notes

    def keep_chips(self, labels: list[str], facts: dict) -> list[str]:
        if facts["availability"].get("can_host") is False:
            return [c for c in labels if not inquiry_logic._SAYS_YES.search(c)]
        return labels

    def fallback_chips(self, *, started: bool, facts: dict) -> list[str]:
        return logic.generic_chips("sitter", started=started, can_host=facts["availability"].get("can_host"))
