"""Report chips (phase-07 7.7, D38): the day's facts as short chips the sitter keeps or turns off.

Two sources. The day's records (check-ins, tasks, feed captions) become chips here with no model at all,
so they are exactly what was recorded. Photos go through the vision model, which only describes what
it can see. The sitter's kept chips are what `/api/ai/daily-report` is allowed to write about.
"""

from pydantic import BaseModel, Field, field_validator

from app.ai.daily_report import CAPTION_MAX, CHIP_MAX, NOTE_MAX, _clean

MAX_PHOTOS = 2
MAX_PHOTO_CHIPS = 2

MEAL = {"all": "Ate everything", "most": "Ate most of it", "little": "Ate a little", "none": "Skipped the meal"}
POTTY = {"normal": "Normal potty", "soft": "Soft stool", "none": "No potty yet"}
MOOD = {"happy": "Happy mood", "calm": "Calm mood", "tired": "Tired mood"}


class PhotoRead(BaseModel):
    """What the vision model says about one photo."""

    description: str = ""
    chips: list[str] = Field(default_factory=list)

    @field_validator("description", mode="before")
    @classmethod
    def _description(cls, value):
        return _clean(value if isinstance(value, str) else "", CAPTION_MAX) or ""

    @field_validator("chips", mode="before")
    @classmethod
    def _chips(cls, value):
        if not isinstance(value, list):
            return []
        seen: set[str] = set()
        out: list[str] = []
        for item in value:
            text = _clean(item if isinstance(item, str) else "", CHIP_MAX)
            if text and text.lower() not in seen:
                seen.add(text.lower())
                out.append(text)
        return out[:MAX_PHOTO_CHIPS]


def record_chips(snapshot: dict) -> list[dict]:
    """Chips for what was recorded today, from a snapshot built without any chips or turned-off checks.

    Each carries `check` (the key the Report screen sends in `skip` when it is switched off) or None
    for an episode, which is just left out of the chips the sitter keeps.
    """
    checks = snapshot["checks"]
    out: list[dict] = []

    def add(chip_id: str, label: str, source: str, check: str | None) -> None:
        out.append({"id": chip_id, "kind": "record", "label": label, "source": source, "check": check})

    if label := MEAL.get(checks.get("meal")):
        add("rec-meal", label, "checkin", "meal")
    if label := POTTY.get(checks.get("potty")):
        add("rec-potty", label, "checkin", "potty")
    if minutes := checks.get("walk_minutes"):
        add("rec-walk", f"Walk · {minutes} min", "checkin", "walk")
    if label := MOOD.get(checks.get("mood")):
        add("rec-mood", label, "checkin", "mood")
    if meds := checks.get("meds"):
        add("rec-meds", "Medication given" if meds == "done" else "Missed a medication", "task", "meds")

    for i, c in enumerate(c for c in snapshot["checkins"] if c.get("note_text")):
        if label := _clean(c["note_text"], CHIP_MAX):
            out.append({"id": f"note-{i}", "kind": "episode", "label": label, "source": "checkin", "check": None})
    for i, p in enumerate(p for p in snapshot["photos"] if p["source"] == "feed"):
        if label := _clean(p["caption"], CHIP_MAX):
            out.append({"id": f"feed-{i}", "kind": "episode", "label": label, "source": "feed", "check": None})
    return out


def photo_messages(system: str, pet_name: str, data_url: str) -> list[dict]:
    return [
        {"role": "system", "content": system},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": f"The pet's name is {pet_name}."},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        },
    ]


__all__ = ["MAX_PHOTOS", "NOTE_MAX", "PhotoRead", "photo_messages", "record_chips"]
