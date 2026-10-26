"""Per-pet review chips (#407, D38): short phrases the sitter picks for each pet after a stay.

Two sources. The stay's check-ins become chips here with no model, so the sitter always has something to pick.
Nemotron adds a few warmer phrases from the same facts and the pet's Life Record of this stay. Every chip is the
sitter speaking (D35), short, and says nothing the stay did not show.
"""

from collections import Counter

from pydantic import BaseModel, Field, field_validator

from app.ai.daily_report import CHIP_MAX, _chip

MAX_CHIPS = 6
MAX_AI_CHIPS = 4

# Always offered last: true of any stay the sitter is happy to review.
GENERAL = ["A joy to look after", "Would happily sit again"]


class ReviewChips(BaseModel):
    """What the model returns."""

    chips: list[str] = Field(default_factory=list)

    @field_validator("chips", mode="before")
    @classmethod
    def _chips(cls, value):
        if not isinstance(value, list):
            return []
        out = [c for c in (_chip(item, CHIP_MAX) for item in value if isinstance(item, str)) if c and "…" not in c]
        return out[:MAX_AI_CHIPS]


def stay_facts(pet: dict, checkins: list[dict], tasks_done: int, record: dict | None) -> dict:
    """The facts the chips may use: tallies of what the sitter logged, and the Life Record's summary lines."""
    kinds = Counter(c["kind"] for c in checkins)
    values = {kind: Counter(c.get("value") for c in checkins if c["kind"] == kind and c.get("value")) for kind in ("meal", "mood")}
    summary = record or {}
    return {
        "pet": {"name": pet["name"], "species": pet["species"]},
        "checkins": dict(kinds),
        "meals": dict(values["meal"]),
        "moods": dict(values["mood"]),
        "tasks_done": tasks_done,
        "life_record": {k: summary.get(k) for k in ("eats", "behavior", "sitter_tips") if summary.get(k)},
    }


def stay_chips(facts: dict) -> list[str]:
    """Chips from the logged facts alone, in the sitter's voice."""
    out: list[str] = []
    meals = Counter(facts["meals"])
    if meals and meals["all"] + meals["most"] >= sum(meals.values()) / 2:
        out.append("Ate well every day")
    if facts["checkins"].get("walk") and facts["pet"]["species"] == "dog":
        out.append("Loved our walks")
    moods = Counter(facts["moods"])
    if moods:
        top = moods.most_common(1)[0][0]
        out.append({"happy": "Always happy to see me", "calm": "So calm and easy", "tired": "Took it easy"}.get(top, ""))
    if facts["checkins"].get("nap"):
        out.append("Napped like a pro")
    if facts["tasks_done"]:
        out.append("Easy with the care routine")
    return [c for c in out if c]


def merge(ai: list[str], stay: list[str]) -> list[str]:
    """Model chips first, then the stay's, then the general ones; no repeats, at most MAX_CHIPS."""
    out: list[str] = []
    for chip in (*ai, *stay, *GENERAL):
        if chip.lower() not in {c.lower() for c in out}:
            out.append(chip)
    return out[:MAX_CHIPS]


__all__ = ["GENERAL", "MAX_CHIPS", "ReviewChips", "merge", "stay_chips", "stay_facts"]
