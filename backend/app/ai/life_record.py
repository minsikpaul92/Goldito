"""Pet Life Record (phase-07C 7C.4): what one stay taught us about a pet, for the NEXT sitter.

The model writes handover notes; everything it may use is gathered into one JSON `source_snapshot` here, and what it
writes is checked against that evidence afterwards (no walk without a walk, no medicine without a medication task, no
entry or contact details), so a wrong sentence is dropped rather than remembered.
"""

import re
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.ai.daily_report import MISSED_AFTER, age_years, parse_ts

TEXT_FIELDS = ("eats", "meds", "potty", "behavior")
LIST_FIELDS = ("heads_up", "sitter_tips", "changed_since_last")
MAX_ITEMS = 5
ITEM_MAX = 160
REPORTS_MAX = 5
REPORT_CHARS = 500
QUESTIONS_MAX = 5
QUESTION_CHARS = 200

# Keys / words that must never be stored (D31, and contact details).
FORBIDDEN_KEYS = ("lockbox", "buzzer", "address", "entry", "door", "phone", "email", "emergency", "password", "code")
FORBIDDEN = re.compile(
    r"\b(lockbox|buzzer|door ?code|entry (?:code|info)|home address|passcode)\b|[\w.+-]+@[\w-]+\.[\w.-]+|\+?\d(?:[\s().-]?\d){9,}",
    re.IGNORECASE,
)
_SENTENCE = re.compile(r"(?<=[.!?])\s+")


class LifeRecord(BaseModel):
    """What the model returns (and what is stored in `pet_life_records.summary`)."""

    eats: str | None = None
    meds: str | None = None
    potty: str | None = None
    behavior: str | None = None
    heads_up: list[str] = Field(default_factory=list)
    sitter_tips: list[str] = Field(default_factory=list)
    changed_since_last: list[str] = Field(default_factory=list)

    @field_validator(*TEXT_FIELDS, mode="before")
    @classmethod
    def _text(cls, value):
        if value is None:
            return None
        text = " ".join(str(value).split())
        return text or None

    @field_validator(*LIST_FIELDS, mode="before")
    @classmethod
    def _list(cls, value):
        if not isinstance(value, list):
            return []
        return [" ".join(str(v).split()) for v in value if str(v).strip()]


def _clean(text: str | None, limit: int) -> str | None:
    text = " ".join((text or "").split())
    return text[:limit].rstrip() or None


def build_snapshot(
    *,
    pet: dict,
    allergies: list[str],
    cautions: list[str],
    tasks: list[dict],
    task_logs: list[dict],
    checkins: list[dict],
    reports: list[str],
    owner_questions: list[str],
    previous: dict | None,
    start: datetime,
    end: datetime,
    now: datetime,
    tz,
) -> dict:
    """The model's whole input for one pet. No ids of media, no addresses, no contact details."""
    by_id = {t["id"]: t for t in tasks}
    grouped: dict[tuple[str, str], dict] = {}
    for log in sorted(task_logs, key=lambda r: r["due_at"]):
        task = by_id.get(log["task_id"])
        due = parse_ts(log["due_at"])
        if not task or not (start <= due <= end):
            continue
        done = log["status"] == "done"
        if not done and now <= due + MISSED_AFTER:
            continue
        entry = grouped.setdefault(
            (task["type"], task["title"]),
            {"type": task["type"], "title": _clean(task["title"], 40), "done": 0, "missed": 0, "notes": []},
        )
        entry["done" if done else "missed"] += 1
        if done and (note := _clean(log.get("note_text"), 120)):
            entry["notes"].append(note)
    snap_tasks = [{**g, "notes": g["notes"][:3]} for g in grouped.values()]

    snap_checkins = []
    for c in sorted(checkins, key=lambda r: r["created_at"]):
        at = parse_ts(c["created_at"])
        if not (start <= at <= end):
            continue
        entry = {"day": at.astimezone(tz).date().isoformat(), "kind": c["kind"]}
        if c.get("value"):
            entry["value"] = c["value"]
        if note := _clean(c.get("note_text"), 160):
            entry["note"] = note
        snap_checkins.append(entry)

    born = pet.get("birthdate")
    snapshot = {
        "pet": {
            "name": pet["name"],
            "species": pet["species"],
            **({"breed": pet["breed"]} if pet.get("breed") else {}),
            **({"age_years": a} if (a := age_years(born, end.astimezone(tz).date())) is not None else {}),
            **({"allergies": allergies[:8]} if allergies else {}),
            **({"cautions": cautions[:8]} if cautions else {}),
        },
        "stay": {
            "from": start.astimezone(tz).date().isoformat(),
            "to": end.astimezone(tz).date().isoformat(),
            "days": (end.astimezone(tz).date() - start.astimezone(tz).date()).days + 1,
        },
        "tasks": snap_tasks,
        "checkins": snap_checkins,
        "reports": [t for t in (_clean(r, REPORT_CHARS) for r in reports[:REPORTS_MAX]) if t],
        "owner_questions": [t for t in (_clean(q, QUESTION_CHARS) for q in owner_questions[:QUESTIONS_MAX]) if t],
        "previous_record": previous,
    }
    return snapshot


def assert_no_secrets(value, path: str = "") -> None:
    """Raises when any key in the snapshot looks like entry info, an address or a contact detail (D31)."""
    if isinstance(value, dict):
        for key, inner in value.items():
            if any(bad in str(key).lower() for bad in FORBIDDEN_KEYS):
                raise ValueError(f"forbidden key in the snapshot: {path}{key}")
            assert_no_secrets(inner, f"{path}{key}.")
    elif isinstance(value, list):
        for i, inner in enumerate(value):
            assert_no_secrets(inner, f"{path}{i}.")


def evidence(snapshot: dict) -> dict[str, bool]:
    """What the stay actually contains, per topic — from records, not from the model."""
    kinds = {c["kind"] for c in snapshot["checkins"]}
    types = {t["type"] for t in snapshot["tasks"] if t["done"] or t["missed"]}
    return {
        "walk": "walk" in kinds or "walk" in types,
        "meds": "medication" in types,
        "potty": "potty" in kinds,
        "eats": "meal" in kinds or "feeding" in types,
    }


def _previous_has(previous: dict | None, field: str) -> bool:
    return bool(previous and previous.get(field))


def _previous_mentions(previous: dict | None, word: str) -> bool:
    return bool(previous) and word in " ".join(str(v) for v in previous.values()).lower()


def _trim_sentences(text: str, keep: int = 2) -> str:
    parts = [p for p in _SENTENCE.split(text) if p.strip()]
    return " ".join(parts[:keep])


def enforce(record: LifeRecord, snapshot: dict) -> dict:
    """The record that may be stored: unsupported topics and sentences dropped, secrets removed, lengths capped."""
    ev = evidence(snapshot)
    previous = snapshot.get("previous_record")
    out: dict = {}
    walk_ok = ev["walk"] or _previous_mentions(previous, "walk")

    def ok(text: str | None) -> str | None:
        if not text or FORBIDDEN.search(text):
            return None
        sentences = [
            s for s in _SENTENCE.split(text) if s.strip() and (walk_ok or "walk" not in s.lower())
        ]
        return _trim_sentences(" ".join(sentences)) or None

    topic_for = {"eats": "eats", "meds": "meds", "potty": "potty"}
    for field in TEXT_FIELDS:
        text = ok(getattr(record, field))
        topic = topic_for.get(field)
        if text and topic and not ev[topic] and not _previous_has(previous, field):
            text = None  # no evidence this stay and nothing before: the model made it up
        out[field] = text
    for field in LIST_FIELDS:
        items = [t for t in (ok(i) for i in getattr(record, field)) if t]
        out[field] = [i[:ITEM_MAX].rstrip() for i in items[:MAX_ITEMS]]
    return out


def record_text(summary: dict) -> str:
    """The record as plain lines — what is stored as `body` and indexed for search."""
    labels = (("eats", "Eats"), ("meds", "Meds"), ("potty", "Potty"), ("behavior", "Behavior"))
    lines = [f"{label}: {summary[key]}" for key, label in labels if summary.get(key)]
    for key, label in (("heads_up", "Heads-up"), ("sitter_tips", "Sitter tips"), ("changed_since_last", "Changed since last time")):
        if summary.get(key):
            lines.append(f"{label}: {'; '.join(summary[key])}")
    return "\n".join(lines)


def is_empty(summary: dict) -> bool:
    return not record_text(summary)


__all__ = ["LifeRecord", "assert_no_secrets", "build_snapshot", "enforce", "evidence", "record_text", "is_empty", "date"]
