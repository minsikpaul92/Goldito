"""What the sign-up told the chat about the two people, as plain facts for the chat AI's prompts (D62).

The owner's answers about a pet (`pets.profile`), the foods it is allergic to, its care checklist, and the sitter's onboarding
answers are all things a person already told the app. The model reads them, it never makes them up: a pet with nothing
recorded is "not answered", never "none". The levels and the wording follow `frontend/features/ownerOnboarding/scoring.ts`
and `questions.ts` (keep them in step).
"""

from app.ai.chat import scrub

# Chart question key to its axis (the dog questions d1..d12, the cat questions c1..c10), as in questions.ts.
_AXIS = {
    **dict.fromkeys(("d1", "d2", "d3", "c1", "c2", "c3"), "Sociability"),
    **dict.fromkeys(("d4", "d5", "d6", "c4", "c5", "c6"), "Sensitivity"),
    **dict.fromkeys(("d7", "d8", "c7", "c8"), "Energy"),
    **dict.fromkeys(("d9", "d10", "c9"), "Appetite"),
    **dict.fromkeys(("d11", "d12"), "Trainability"),
    "c10": "Handling",
}
_WORDS = {
    "Sociability": ("Reserved", "Selective", "Friendly", "Social"),
    "Sensitivity": ("Unfazed", "Mild", "Sensitive", "Very sensitive"),
    "Energy": ("Couch", "Steady", "Active", "Very active"),
    "Appetite": ("Light", "Steady", "Hearty", "Food-driven"),
    "Trainability": ("Learning", "Basics", "Reliable", "Star pupil"),
    "Handling": ("Resists", "Tolerates", "Accepts", "Easygoing"),
}
# What each safety pick says. The owner answers these, the app never pre-selects them.
_SAFETY = {
    "s1": {
        "never": "never bitten or snapped at a person",
        "once": "has snapped once",
        "more": "has snapped more than once",
        "unsure": "owner is not sure about biting or snapping",
    },
    "s2": {
        "all": "gets along with other animals",
        "picky": "picky about some animals",
        "none": "can't be with other animals",
        "unsure": "owner is not sure about other animals",
    },
    "s3": {
        "never": "never slips out of a door or gate",
        "excited": "sometimes slips out when excited",
        "often": "often tries to slip out",
        "unsure": "owner is not sure about slipping out",
    },
    "s4": {
        "never": "never guards food, toys or spaces",
        "animals": "guards from other animals",
        "people": "guards from people too",
        "unsure": "owner is not sure about guarding",
    },
    "s5": {
        "nothing": "no health issue to know",
        "medication": "daily medication",
        "condition": "a condition to watch",
        "both": "daily medication and a condition to watch",
    },
}
MAX_CHECKLIST = 12
NOT_ANSWERED = "not answered yet: do not say there are none"


def allergy_status(allergies: list[str], profile: dict | None) -> str:
    """The foods question in words. Only an answered "none" means none; an empty list alone is "not answered"."""
    if allergies:
        return "allergic to " + ", ".join(allergies[:8])
    if ((profile or {}).get("safety") or {}).get("s6") == "none":
        return "none, the owner says"
    return NOT_ANSWERED


def pet_profile(profile: dict | None, allergies: list[str]) -> dict:
    """One pet's sign-up answers: the personality levels in words, the safety answers, the allergy status. Anything the
    owner skipped is left out (and so is not claimed)."""
    profile = profile if isinstance(profile, dict) else {}
    scores: dict[str, list[int]] = {}
    answers = profile.get("answers") if isinstance(profile.get("answers"), dict) else {}
    for key, value in answers.items():
        if key in _AXIS and value in (1, 2, 3, 4):
            scores.setdefault(_AXIS[key], []).append(value)
    personality = {
        axis: _WORDS[axis][min(4, max(1, round(sum(values) / len(values)))) - 1] for axis, values in scores.items()
    }
    safety_raw = profile.get("safety") if isinstance(profile.get("safety"), dict) else {}
    safety = [_SAFETY[key][value] for key, value in sorted(safety_raw.items()) if key in _SAFETY and value in _SAFETY[key]]
    return {
        **({"personality": personality} if personality else {}),
        **({"safety": safety} if safety else {}),
        "allergies": allergy_status(allergies, profile),
    }


def _clock(value: str) -> str:
    hour, minute = (int(x) for x in str(value).split(":")[:2])
    return f"{(hour % 12) or 12}:{minute:02d} {'AM' if hour < 12 else 'PM'}"


def checklist(rows: list[dict]) -> list[dict]:
    """A pet's active care tasks (what the owner wants done each day), earliest first, free text scrubbed."""
    tasks = sorted((r for r in rows if r.get("active", True)), key=lambda r: str(r.get("scheduled_time", "")))
    out = []
    for row in tasks[:MAX_CHECKLIST]:
        out.append(
            {
                "time": _clock(row["scheduled_time"]) if row.get("scheduled_time") else None,
                "type": row.get("type"),
                "task": scrub(row.get("title"))[:80],
                **({"dose": scrub(row["dose"])[:60]} if row.get("dose") else {}),
                **({"note": scrub(row["notes"])[:120]} if row.get("notes") else {}),
            }
        )
    return out


_YES_NO = {"yes": "yes", "no": "no"}
_ANSWER_LINE = {
    "multiple_owners": lambda c: f"looks after more than one household at a time: {_YES_NO.get(c, c)}",
    "max_pets": lambda c: f"can look after up to {c} pets at once",
    "walks_per_day": lambda c: f"{c} walks a day",
    "meals_per_day": lambda c: f"{c} meals a day",
    "home_all_day": lambda c: {"home": "home all day", "away": "away at work"}.get(c, c),
    "activity": lambda c: {"active": "active", "relaxed": "mostly relaxed at home"}.get(c, c),
    "park_nearby": lambda c: f"a park near home: {_YES_NO.get(c, c)}",
    "dog_sizes": lambda c: "takes dog sizes: " + c.replace(",", ", "),
    "cats": lambda c: f"takes cats: {_YES_NO.get(c, c)}",
}


def sitter_answers(rows: list[dict]) -> list[str]:
    """The sitter's onboarding answers as short lines (every owner can read them). The hand-over answer is left out: the
    chat's rule is that the owner drops off and picks up."""
    rows = sorted(rows, key=lambda r: (r.get("position") or 0, str(r.get("question_key"))))
    out: list[str] = []
    for row in rows:
        key, choice, answer = row.get("question_key", ""), row.get("choice"), scrub(row.get("answer"))[:160]
        if key == "handoff":
            continue
        if key.startswith("custom_") and answer:
            out.append(f"{scrub(row.get('question_text'))[:80]}: {answer}")
        elif key in _ANSWER_LINE and choice:
            line = _ANSWER_LINE[key](choice)
            out.append(f"{line} ({answer})" if answer else line)
    return out


def i_am(role: str, me: str, other: str, *, pets: list[dict], service_area: str | None = None) -> str:
    """Who I am in this chat, in one or two sentences: the person the model writes as."""
    if role == "owner":
        names = " and ".join(
            f"{p['name']} ({p.get('breed') or p.get('species') or 'pet'})" for p in pets[:4] if p.get("name")
        )
        mine = f"I am {me}, a pet owner" + (f" with {names}" if names else "")
        return f"{mine}. I am writing to {other}, a sitter I may book."
    place = f" in {service_area}" if service_area else ""
    return f"I am {me}, a pet sitter{place}. I am writing to {other}, a pet owner who may book me."
