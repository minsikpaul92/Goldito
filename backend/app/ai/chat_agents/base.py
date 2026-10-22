"""What both chat agents share. A side only differs in the four things a subclass fills in: its prompts (one folder per
side under prompts/chat), the facts it may see, its voice and its extra checks."""

from app.ai import chat as logic
from app.ai.prompts import load_prompt
from app.config import get_settings


class ChatAgent:
    role = ""
    # The name of the per-side draft model setting; blank = the fast model.
    model_setting = ""

    def prompt(self, name: str) -> str:
        return load_prompt(f"chat/{self.role}/{name}.md")

    def model(self) -> str | None:
        """The draft's model."""
        return (getattr(get_settings(), self.model_setting, None) or "").strip() or None

    def chips_model(self) -> str | None:
        """The chips' model, shared by both sides; blank = the fast model."""
        return (getattr(get_settings(), "model_chat_chips", None) or "").strip() or None

    def state(self, messages: list[dict], me_id: str) -> str:
        """opening: nobody has written. reply: the other person spoke last, so even an owner answers instead of introducing
        themselves. follow_up: I spoke last, so there is nothing to answer, only something to add."""
        last = next((m for m in reversed(messages) if m.get("kind") == "text"), None)
        if last is None:
            return "opening"
        return "follow_up" if last.get("sender_id") == me_id else "reply"

    def facts(self, raw: dict, messages: list[dict], *, state: str, last_them: str) -> dict:
        """The part of what the database knows that this side may read."""
        raise NotImplementedError

    def style(self, db, ctx: dict, chip: str, last_them: dict | None) -> str:
        raise NotImplementedError

    def keep_chips(self, labels: list[str], facts: dict) -> list[str]:
        return labels

    def fallback_chips(self, *, started: bool, state: str, facts: dict) -> list[str]:
        return logic.generic_chips(self.role, started=started, can_host=None)

    def extra_problems(self, text: str, facts: dict) -> list[str]:
        return []

    def problems(self, text: str, facts: dict, known: str, sitter_first: str | None = None, previous: list[str] | None = None) -> list[str]:
        out = [*logic.chat_problems(text, facts, self.role, sitter_first, known), *self.extra_problems(text, facts)]
        if previous and logic.repeats(text, previous):
            out.append("it repeats what was already said in the chat, say something new")
        return out
