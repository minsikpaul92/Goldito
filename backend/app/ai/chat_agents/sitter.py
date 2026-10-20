"""The sitter's agent: the warm host. It sees its rates, policy, availability and the quote for the stay, and writes in the
sitter's own anonymized voice."""

from app.ai import chat as logic
from app.ai import inquiry as inquiry_logic
from app.ai import tone
from app.ai.chat_agents.base import ChatAgent


class SitterAgent(ChatAgent):
    role = "sitter"
    model_setting = "model_chat_sitter"

    def state(self, messages: list[dict], me_id: str) -> str:
        """first_reply: the owner has written and I have not yet, so I greet and say who I am before anything else."""
        if not any(m.get("kind") == "text" for m in messages):
            return "opening"
        if not any(m.get("kind") == "text" and m.get("sender_id") == me_id for m in messages):
            return "first_reply"
        return "reply"

    def facts(self, raw: dict, messages: list[dict], *, state: str, last_them: str) -> dict:
        """Money (the quote and my rates) is in the facts only when the owner asked about it or a quote card is in the
        chat, and never in my first reply: that one introduces me, the price comes with the Send quote step."""
        asked = state != "first_reply" and (logic.asks_about_money(last_them) or logic.shown_quote(messages) is not None)
        if asked:
            return raw
        return {**raw, "quote": None, "rates": {}}

    def style(self, db, ctx: dict, chip: str, last_them: dict | None) -> str:
        # The sitter's own anonymized replies to owners ("inquiry" samples) are the closest voice for a chat reply too.
        return tone.compose(db, ctx["thread"]["sitter_id"], kind="inquiry", query=f"{chip}: {(last_them or {}).get('body', '')}").style_notes

    def keep_chips(self, labels: list[str], facts: dict) -> list[str]:
        if facts["availability"].get("can_host") is False:
            return [c for c in labels if not inquiry_logic._SAYS_YES.search(c)]
        return labels

    def fallback_chips(self, *, started: bool, state: str, facts: dict) -> list[str]:
        if state == "first_reply":
            return ["Hi, nice to meet you", "Happy to help"]
        return logic.generic_chips("sitter", started=started, can_host=facts["availability"].get("can_host"))
