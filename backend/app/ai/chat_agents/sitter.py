"""The sitter's agent: the warm host. It sees its rates, policy, availability and the quote for the stay, and writes in the
sitter's own anonymized voice."""

import re

from app.ai import chat as logic
from app.ai import inquiry as inquiry_logic
from app.ai import tone
from app.ai.chat_agents.base import ChatAgent

# Reversed hand-over: the owner drops off and picks up, so "I pick up" / "I'll drop off" is wrong in the sitter's mouth.
_OWNER_HANDS_OVER = re.compile(r"\b(?:i|i'll|i will|i can|i could|i'd)\s+(?:be\s+)?(?:pick(?:ing)?|drop(?:ping)?)\b", re.IGNORECASE)


class SitterAgent(ChatAgent):
    role = "sitter"
    model_setting = "model_chat_sitter"

    def state(self, messages: list[dict], me_id: str) -> str:
        """first_reply: the owner has written and I have not yet, so I greet and say who I am before anything else."""
        state = super().state(messages, me_id)
        if state == "reply" and not any(m.get("kind") == "text" and m.get("sender_id") == me_id for m in messages):
            return "first_reply"
        return state

    def facts(self, raw: dict, messages: list[dict], *, state: str, last_them: str) -> dict:
        """Money (the quote and my rates) is in the facts only when the owner asked about it or a quote card is in the
        chat, and never in my first reply: that one introduces me, the price comes with the Send quote step."""
        asked = state != "first_reply" and (logic.asks_about_money(last_them) or logic.shown_quote(messages) is not None)
        # The owner's care checklist is for the sitter once there is a booking, not before.
        raw = {**raw, "pets": [{k: v for k, v in p.items() if k != "checklist"} for p in raw.get("pets", [])]}
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
        if state == "follow_up":
            return ["Any questions for me?", "Shall we set a Meet & Greet?"]
        return logic.generic_chips("sitter", started=started, can_host=facts["availability"].get("can_host"))

    def extra_problems(self, text: str, facts: dict) -> list[str]:
        if _OWNER_HANDS_OVER.search(text):
            return ["it says I pick up or drop off, but the owner drops off and picks up"]
        return []
