"""What both chat agents share. A side only differs in the four things a subclass fills in: its prompts (one folder per
side under prompts/chat), the facts it may see, its voice and its extra checks."""

from app.ai import chat as logic
from app.ai.prompts import load_prompt
from app.config import get_settings


class ChatAgent:
    role = ""
    # The name of the optional per-side model setting; unset = the fast model.
    model_setting = ""

    def prompt(self, name: str) -> str:
        return load_prompt(f"chat/{self.role}/{name}.md")

    def model(self) -> str | None:
        return (getattr(get_settings(), self.model_setting, None) or "").strip() or None

    def state(self, messages: list[dict]) -> str:
        # An empty chat is an opening; once anyone has written, even an owner answers instead of introducing themselves.
        return "reply" if any(m.get("kind") == "text" for m in messages) else "opening"

    def facts(self, raw: dict, messages: list[dict]) -> dict:
        """The part of what the database knows that this side may read."""
        raise NotImplementedError

    def style(self, db, ctx: dict, chip: str, last_them: dict | None) -> str:
        raise NotImplementedError

    def keep_chips(self, labels: list[str], facts: dict) -> list[str]:
        return labels

    def fallback_chips(self, *, started: bool, facts: dict) -> list[str]:
        return logic.generic_chips(self.role, started=started, can_host=None)

    def extra_problems(self, text: str, facts: dict) -> list[str]:
        return []

    def problems(self, text: str, facts: dict, known: str, sitter_first: str | None = None) -> list[str]:
        return [*logic.chat_problems(text, facts, self.role, sitter_first, known), *self.extra_problems(text, facts)]
