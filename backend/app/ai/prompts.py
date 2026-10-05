"""Prompt files live in `app/ai/prompts/` so they can be tuned without touching code (§9)."""

from functools import lru_cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent / "prompts"


@lru_cache
def load_prompt(name: str) -> str:
    """The text of `app/ai/prompts/<name>` (e.g. `care_plan/system.md`)."""
    path = (PROMPTS_DIR / name).resolve()
    if PROMPTS_DIR.resolve() not in path.parents:
        raise ValueError("prompt path must stay inside app/ai/prompts")
    return path.read_text(encoding="utf-8")
