"""Voice onboarding for sitters: the sitter's (fixed) text becomes picks for the onboarding questions.

The model proposes; a pick only passes when its quote is really in the text, its value is one of the question's options,
and a number option is a number the sitter said. Nothing is saved here: the sitter sees each pick and keeps or changes it.
"""

from typing import Any

from pydantic import BaseModel

from app.ai.pet_voice import _tokens, numbers_in, quote_in


class RawPick(BaseModel):
    value: Any = None
    quote: str = ""


class RawPicks(BaseModel):
    answers: dict[str, RawPick] = {}


class Pick(BaseModel):
    value: str
    quote: str


def validate_picks(raw: RawPicks, text: str, options: dict[str, tuple[set[str], bool]]) -> dict[str, Pick]:
    """`options` maps each asked question key to (its option values, whether several may be picked)."""
    out: dict[str, Pick] = {}
    for key, item in raw.answers.items():
        asked = options.get(key)
        if asked is None or item.value is None or not quote_in(item.quote, text):
            continue
        allowed, multi = asked
        parts = [p.strip() for p in str(item.value).split(",") if p.strip()]
        if not parts or len(set(parts)) != len(parts) or (len(parts) > 1 and not multi):
            continue
        if any(p not in allowed for p in parts):
            continue
        # A number option (walks a day, pets at once) has to be a number that was said, in digits or in words.
        said = numbers_in(item.quote)
        # "once a day" and "twice a day" are counts too.
        said += [float(n) for word, n in (("once", 1), ("twice", 2)) if word in _tokens(item.quote)]
        if any(p.isdigit() and float(p) not in said for p in parts):
            continue
        out[key] = Pick(value=",".join(parts), quote=item.quote.strip())
    return out
