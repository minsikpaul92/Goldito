"""Care request → checklist draft (phase-06 6.12). The model proposes; the server decides what is valid."""

import re
from dataclasses import dataclass, field

from pydantic import BaseModel

TASK_TYPES = ("medication", "walk", "feeding", "litter", "play", "sleep")
TYPE_LABEL = {
    "medication": "Medication",
    "walk": "Walk",
    "feeding": "Meal",
    "litter": "Litter",
    "play": "Play",
    "sleep": "Nap",
}
MAX_TASKS = 12
MAX_CAUTIONS = 8


class RawTask(BaseModel):
    """What the model may say (loose on purpose — `normalize` tightens it)."""

    type: str
    time: str | None = None
    title: str | None = None
    dose: str | None = None
    notes: str | None = None


class RawPlan(BaseModel):
    tasks: list[RawTask] = []
    cautions: list[str] = []


@dataclass
class Plan:
    tasks: list[dict] = field(default_factory=list)
    cautions: list[str] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)


_TIME = re.compile(r"^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\s*$|^\s*(\d{1,2}):(\d{2})\s*$", re.IGNORECASE)


def to_hhmm(value: str | None) -> str | None:
    """"8:00 AM" / "2pm" / "14:00" / "8:00" → "HH:MM"; None when it is not a clock time."""
    if not value:
        return None
    match = _TIME.match(value)
    if not match:
        return None
    if match.group(4) is not None:  # plain 24 h "H:MM"
        hour, minute = int(match.group(4)), int(match.group(5))
    else:
        hour, minute = int(match.group(1)), int(match.group(2) or 0)
        if not 1 <= hour <= 12:
            return None
        hour = hour % 12 + (12 if match.group(3).lower() == "p" else 0)
    if not (0 <= hour < 24 and 0 <= minute < 60):
        return None
    return f"{hour:02d}:{minute:02d}"


def _clean(value: str | None, limit: int) -> str | None:
    value = " ".join((value or "").split())
    return value[:limit].rstrip() or None


def species_blocks(task_type: str, species: str) -> str | None:
    """Same rule as the database guard (D23): walks are for dogs, litter boxes for cats."""
    if task_type == "walk" and species == "cat":
        return "Cats don't go on walks."
    if task_type == "litter" and species == "dog":
        return "Dogs don't use a litter box."
    return None


def normalize(raw: RawPlan, species: str) -> Plan:
    """Keep what is valid for this pet, say why the rest was left out, drop duplicates."""
    plan = Plan()
    seen: set[tuple[str, str, str]] = set()

    for task in raw.tasks:
        task_type = task.type.strip().lower()
        title = _clean(task.title, 40) or TYPE_LABEL.get(task_type, "Task")
        if task_type not in TASK_TYPES:
            plan.skipped.append({"type": task_type, "title": title, "reason": "Not a task type Goldito knows."})
            continue
        blocked = species_blocks(task_type, species)
        if blocked:
            plan.skipped.append({"type": task_type, "title": title, "reason": blocked})
            continue
        time = to_hhmm(task.time)
        if time is None:
            plan.skipped.append({"type": task_type, "title": title, "reason": "No clock time was given."})
            continue
        key = (task_type, time, title.lower())
        if key in seen:
            continue
        seen.add(key)
        if len(plan.tasks) >= MAX_TASKS:
            plan.skipped.append({"type": task_type, "title": title, "reason": "Too many tasks in one request."})
            continue
        plan.tasks.append(
            {
                "type": task_type,
                "time": time,
                "title": title,
                "dose": _clean(task.dose, 60),
                "notes": _clean(task.notes, 200),
            }
        )

    seen_cautions: set[str] = set()
    for caution in raw.cautions:
        text = _clean(caution, 100)
        if text and text.lower() not in seen_cautions and len(plan.cautions) < MAX_CAUTIONS:
            seen_cautions.add(text.lower())
            plan.cautions.append(text)

    plan.tasks.sort(key=lambda t: t["time"])
    return plan
