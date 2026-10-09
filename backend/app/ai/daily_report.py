"""Daily report (phase-07 7.2): what the sitter did today, as the facts the model may use.

The model only writes prose. Everything it is allowed to say — tasks, check-ins, photos, the checks
the sitter kept — is assembled here into one JSON `source_snapshot`, so the report can be traced back
to records and a turned-off chip never reaches the prompt.
"""

import json
import re
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

# D9: a pending task counts as missed this long after its time.
MISSED_AFTER = timedelta(minutes=60)

# What the sitter can turn off on the Report screen → the records that feed it.
CHECK_KEYS = ("meal", "potty", "walk", "mood", "meds")
TASK_TYPE_FOR_CHECK = {"meal": "feeding", "walk": "walk", "meds": "medication"}
CHECKIN_KIND_FOR_CHECK = {"meal": "meal", "potty": "potty", "walk": "walk", "mood": "mood"}

# The values the sitter can correct on the Report screen (the check-in's own one-tap values).
OVERRIDE_VALUES = {
    "meal": ("all", "most", "little", "none"),
    "potty": ("normal", "soft", "none"),
    "mood": ("happy", "calm", "tired"),
}
MAX_WALK_MINUTES = 240

MAX_CHIPS = 8
CHIP_MAX = 40
NOTE_MAX = 200
CAPTION_MAX = 160
MAX_FEED_PHOTOS = 6
MAX_REPORT_PHOTOS = 2

Interval = tuple[datetime, datetime]


def parse_ts(value: str | datetime) -> datetime:
    """An ISO timestamp from the database → an aware datetime."""
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def day_bounds(day: date, tz: ZoneInfo) -> Interval:
    """The local day as [start, end) in UTC."""
    start = datetime.combine(day, time.min, tzinfo=tz)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=tz)
    return start.astimezone(UTC), end.astimezone(UTC)


def care_intervals(bookings: list[dict], day_start: datetime, day_end: datetime) -> list[Interval]:
    """The parts of the day this sitter had the pet: each booking's drop-off → pick-up, cut to the day.

    A booking is `{"drop_off": iso, "pick_up": iso}` (the agreed handoff times). Morning with one
    sitter and afternoon with another gives each of them only their own hours.
    """
    out: list[Interval] = []
    for b in bookings:
        start = max(parse_ts(b["drop_off"]), day_start)
        end = min(parse_ts(b["pick_up"]), day_end)
        if start < end:
            out.append((start, end))
    return sorted(out)


def in_any(moment: datetime, intervals: list[Interval]) -> bool:
    return any(start <= moment < end for start, end in intervals)


def _clean(text: str | None, limit: int) -> str | None:
    text = " ".join((text or "").split())
    return text[:limit].rstrip() or None


def _hhmm(moment: datetime, tz: ZoneInfo) -> str:
    return moment.astimezone(tz).strftime("%H:%M")


def age_years(birthdate: str | None, today: date) -> int | None:
    if not birthdate:
        return None
    try:
        born = date.fromisoformat(birthdate[:10])
    except ValueError:
        return None
    years = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    return years if years >= 0 else None


def clean_chips(chips: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for chip in chips:
        text = _clean(chip, CHIP_MAX)
        if text and text.lower() not in seen:
            seen.add(text.lower())
            out.append(text)
    return out[:MAX_CHIPS]


def clean_overrides(overrides: dict[str, str] | None) -> dict[str, str]:
    """The sitter's corrections that make sense: a known check with an allowed value, walk as minutes."""
    out: dict[str, str] = {}
    for key, value in (overrides or {}).items():
        if key in OVERRIDE_VALUES and value in OVERRIDE_VALUES[key]:
            out[key] = value
        elif key == "walk" and value.isdigit() and 0 < int(value) <= MAX_WALK_MINUTES:
            out[key] = str(int(value))
    return out


def apply_overrides(checkins: list[dict], overrides: dict[str, str]) -> list[dict]:
    """Where the sitter corrected a value, that kind has exactly one check-in carrying their value."""
    if not overrides:
        return checkins
    out: list[dict] = []
    seen: set[str] = set()
    for c in checkins:
        value = overrides.get(c["kind"])
        if value is None:
            out.append(c)
        elif c["kind"] not in seen:
            seen.add(c["kind"])
            out.append({**c, "value": value})
    return out


def build_snapshot(
    *,
    pet: dict,
    day: date,
    tz: ZoneInfo,
    intervals: list[Interval],
    tasks: list[dict],
    task_logs: list[dict],
    checkins: list[dict],
    feed_posts: list[dict],
    allergies: list[str],
    heads_up: list[str],
    report_photos: list[str],
    chips: list[str],
    sitter_note: str | None,
    skip: list[str],
    now: datetime,
    overrides: dict[str, str] | None = None,
    off: list[str] | None = None,
) -> dict:
    """The JSON that is the model's whole input. Only records inside `intervals`; nothing the sitter turned off.

    `off` are the episode chips the sitter turned off (`note-{checkin_id}`, `feed-{post_id}`): that note or
    feed caption is left out. Items that can become an episode chip carry `_ref` (the chip id); `model_view`
    drops it before the model sees the snapshot.
    """
    off_refs = set(off or [])
    off = {k for k in skip if k in CHECK_KEYS}
    off_task_types = {TASK_TYPE_FOR_CHECK[k] for k in off if k in TASK_TYPE_FOR_CHECK}
    off_kinds = {CHECKIN_KIND_FOR_CHECK[k] for k in off if k in CHECKIN_KIND_FOR_CHECK}
    by_id = {t["id"]: t for t in tasks}

    snap_tasks: list[dict] = []
    for log in sorted(task_logs, key=lambda r: r["due_at"]):
        due = parse_ts(log["due_at"])
        task = by_id.get(log["task_id"])
        if not task or not in_any(due, intervals) or task["type"] in off_task_types:
            continue
        done = log["status"] == "done"
        if not done and now <= due + MISSED_AFTER:
            continue  # not due yet / still within the hour: nothing to report
        entry = {
            "type": task["type"],
            "title": _clean(task["title"], 40) or task["type"],
            "due": _hhmm(due, tz),
            "status": "done" if done else "missed",
        }
        # What the owner asked for, in their words (a done task means it was carried out).
        for key in ("dose", "notes"):
            if value := _clean(task.get(key), 120):
                entry[f"owner_{key}"] = value
        if done and log.get("completed_at"):
            entry["completed_at"] = _hhmm(parse_ts(log["completed_at"]), tz)
        snap_tasks.append(entry)

    snap_checkins: list[dict] = []
    for c in sorted(checkins, key=lambda r: r["created_at"]):
        at = parse_ts(c["created_at"])
        if not in_any(at, intervals) or c["kind"] in off_kinds:
            continue
        ref = f"note-{c['id']}" if c.get("id") else None
        note = _clean(c.get("note_text"), NOTE_MAX)
        if note and ref in off_refs:
            if c["kind"] == "note":
                continue  # a note check-in is nothing but its text
            note = None
        entry = {"time": _hhmm(at, tz), "kind": c["kind"], "has_photo": bool(c.get("media_id"))}
        if c.get("value"):
            entry["value"] = c["value"]
        if note:
            entry["note_text"] = note
            if ref:
                entry["_ref"] = ref
        snap_checkins.append(entry)

    snap_checkins = apply_overrides(snap_checkins, clean_overrides(overrides))

    photos: list[dict] = []
    for post in sorted(feed_posts, key=lambda r: r["created_at"]):
        # A task / check-in photo's caption ("🍽️ Breakfast — done") repeats a record the sitter can
        # already turn off or correct, so it is not a separate fact (it would get around that).
        if post.get("caption_source") == "task":
            continue
        ref = f"feed-{post['id']}" if post.get("id") else None
        if ref in off_refs:
            continue
        at = parse_ts(post["created_at"])
        caption = _clean(post.get("caption"), CAPTION_MAX)
        if caption and in_any(at, intervals):
            photos.append({"time": _hhmm(at, tz), "caption": caption, "source": "feed", **({"_ref": ref} if ref else {})})
    photos = photos[:MAX_FEED_PHOTOS]
    for caption in report_photos[:MAX_REPORT_PHOTOS]:
        text = _clean(caption, CAPTION_MAX)
        if text:
            photos.append({"time": _hhmm(now, tz), "caption": text, "source": "report"})

    checks: dict = {}
    last = {}
    for c in snap_checkins:
        if c["kind"] in ("meal", "potty", "mood") and c.get("value"):
            last[c["kind"]] = c["value"]
    checks.update(last)
    minutes = sum(int(c["value"]) for c in snap_checkins if c["kind"] == "walk" and str(c.get("value", "")).isdigit())
    if minutes:
        checks["walk_minutes"] = minutes
    med_status = [t["status"] for t in snap_tasks if t["type"] == "medication"]
    if med_status:
        checks["meds"] = "missed" if "missed" in med_status else "done"

    snapshot: dict = {
        "pet": {
            "species": pet["species"],
            "name": pet["name"],
            **({"breed": pet["breed"]} if pet.get("breed") else {}),
            **({"age_years": a} if (a := age_years(pet.get("birthdate"), day)) is not None else {}),
            # The owner's own information about the pet: background, never something that happened today.
            **({"owner_notes": n} if (n := _clean(pet.get("notes"), NOTE_MAX)) else {}),
            **({"allergies": cleaned} if (cleaned := [a for a in (_clean(x, 40) for x in allergies) if a][:8]) else {}),
            **({"heads_up": h} if (h := [t for t in (_clean(x, 100) for x in heads_up) if t][:8]) else {}),
        },
        "date": day.isoformat(),
        "tasks": snap_tasks,
        "photos": photos,
        "checkins": snap_checkins,
        "checks": checks,
        "chips": clean_chips(chips),
        "sitter_note": _clean(sitter_note, NOTE_MAX),
    }
    return snapshot


def few_shot_messages(examples: list[dict]) -> list[dict]:
    """Worked examples as chat turns: the snapshot as the user, the report as the assistant."""
    out: list[dict] = []
    for ex in examples:
        out.append({"role": "user", "content": json.dumps(ex["input"], ensure_ascii=False)})
        out.append({"role": "assistant", "content": ex["output"]})
    return out


_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def tidy_body(text: str) -> str:
    """The model's text without think blocks, wrapping quotes or stray whitespace."""
    text = _THINK.sub("", text).strip()
    if len(text) >= 2 and text[0] == text[-1] == '"':
        text = text[1:-1].strip()
    return text


def model_view(value):
    """The snapshot as the model sees it: without internal keys (those starting with `_`)."""
    if isinstance(value, dict):
        return {k: model_view(v) for k, v in value.items() if not str(k).startswith("_")}
    if isinstance(value, list):
        return [model_view(v) for v in value]
    return value


def word_count(text: str) -> int:
    return len(text.split())


def has_facts(snapshot: dict) -> bool:
    """Is there anything at all the model could say? (Chips, a note, photos, tasks or check-ins.)"""
    return any(snapshot.get(key) for key in ("tasks", "photos", "checkins", "chips", "sitter_note"))


def quiet_day_body(pet_name: str) -> str:
    """When nothing was recorded the report is this — no model, so nothing can be invented."""
    return (
        f"Hi {pet_name}'s family! I spent the day with {pet_name} today, and there is nothing "
        "special to report. I'll share more as soon as there is something to tell. 💛"
    )


_PRONOUNS = re.compile(r"\b(he|she|his|her|him|hers)\b", re.IGNORECASE)
_PUNCTUALITY = re.compile(r"\b(on time|right away|right on time|punctually)\b", re.IGNORECASE)


def broken_rules(text: str, snapshot: dict) -> list[str]:
    """Rules the prompt states but a model sometimes breaks — checked after the fact.

    - a gendered pronoun for the pet (its sex is unknown), unless the sitter's own words in the snapshot use it
    - a claim of punctuality ("on time", "right away"): the snapshot has times, not promptness
    """
    source = json.dumps(snapshot, ensure_ascii=False)
    found: list[str] = []
    allowed = {m.group(0).lower() for m in _PRONOUNS.finditer(source)}
    if any(m.group(0).lower() not in allowed for m in _PRONOUNS.finditer(text)):
        found.append("gendered pronoun")
    if _PUNCTUALITY.search(text):
        found.append("punctuality claim")
    return found
