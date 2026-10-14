"""Mood rules (Phase 12.2a, D61): body-language tags → eight emotion percentages, computed by the server.

The vision model only describes what it sees with fixed tags (ears, eyes, mouth, …); it never gives numbers.
This table turns the tags into scores, so the same tags always give the same percentages. For fun only —
the words here are everyday moods, never health or pain.
"""

from collections.abc import Iterable, Mapping

EMOTIONS = ("happy", "relaxed", "excited", "curious", "sleepy", "anxious", "angry", "sad")

# Each tag value adds points to some emotions. Unknown or not-visible values add nothing.
WEIGHTS: dict[str, dict[str, dict[str, int]]] = {
    "ears": {
        "forward": {"curious": 2, "excited": 1},
        "relaxed": {"relaxed": 2, "happy": 1},
        "back": {"anxious": 2, "sad": 1},
        "pinned_back": {"anxious": 3, "angry": 1},
    },
    "eyes": {
        "soft": {"happy": 2, "relaxed": 1},
        "wide": {"curious": 2, "excited": 1, "anxious": 1},
        "half_closed": {"sleepy": 3, "relaxed": 1},
        "closed": {"sleepy": 4},
        "droopy": {"sad": 2, "sleepy": 1},
        "hard_stare": {"angry": 3, "anxious": 1},
        "whale_eye": {"anxious": 3},
    },
    "mouth": {
        "open_relaxed": {"happy": 4, "relaxed": 1},
        "closed_relaxed": {"relaxed": 2},
        "panting": {"excited": 2, "happy": 1},
        "holding_toy": {"excited": 2, "happy": 2},
        "yawning": {"sleepy": 2, "anxious": 1},
        "tense_closed": {"anxious": 2},
        "teeth_showing": {"angry": 4},
    },
    "tail": {
        "high_wagging": {"excited": 3, "happy": 2},
        "wagging": {"happy": 3},
        "neutral": {"relaxed": 1},
        "low": {"sad": 2, "anxious": 1},
        "tucked": {"anxious": 3, "sad": 1},
        "puffed": {"angry": 2, "anxious": 2},
    },
    "posture": {
        "play_bow": {"excited": 3, "happy": 2},
        "standing": {"curious": 1},
        "sitting": {"relaxed": 1, "curious": 1},
        "lying_relaxed": {"relaxed": 3},
        "curled_up": {"sleepy": 2, "relaxed": 1},
        "crouched": {"anxious": 3},
    },
    "body_tension": {
        "relaxed": {"relaxed": 1, "happy": 1},
        "neutral": {},
        "stiff": {"angry": 2, "anxious": 2},
    },
    "activity": {
        "sleeping": {"sleepy": 5},
        "resting": {"relaxed": 2, "sleepy": 1},
        "playing": {"excited": 3, "happy": 2},
        "exploring": {"curious": 3},
        "watching": {"curious": 2},
        "eating": {"happy": 2},
        "hiding": {"anxious": 3, "sad": 1},
    },
}

# A pet with no readable signals still gets an answer: calm and a little curious.
PRIOR = {"relaxed": 1, "curious": 1}

FIELDS = tuple(WEIGHTS)


def tag_options(field: str) -> list[str]:
    """The values the vision prompt may use for a field (plus `not_visible`)."""
    return [*WEIGHTS[field], "not_visible"]


def clean_tag(field: str, value: object) -> str:
    """Lower case, spaces → underscores; anything off the list counts as `not_visible`."""
    text = "_".join(str(value or "").strip().lower().replace("-", " ").split())
    return text if text in WEIGHTS[field] else "not_visible"


def scores(tags: Mapping[str, str]) -> dict[str, int]:
    """Raw points per emotion for one pet in one frame."""
    total = dict.fromkeys(EMOTIONS, 0)
    for emotion, points in PRIOR.items():
        total[emotion] += points
    for field in FIELDS:
        for emotion, points in WEIGHTS[field].get(clean_tag(field, tags.get(field)), {}).items():
            total[emotion] += points
    return total


def to_percent(values: Mapping[str, float]) -> dict[str, int]:
    """Whole percentages in `EMOTIONS` order that add up to exactly 100; the rounding left-over goes to the largest."""
    total = sum(max(0.0, float(values.get(e, 0))) for e in EMOTIONS)
    if total <= 0:
        return to_percent(PRIOR)
    raw = {e: max(0.0, float(values.get(e, 0))) * 100 / total for e in EMOTIONS}
    out = {e: round(v) for e, v in raw.items()}
    largest = max(EMOTIONS, key=lambda e: (raw[e], -EMOTIONS.index(e)))
    out[largest] += 100 - sum(out.values())
    return out


def percentages(tags: Mapping[str, str]) -> dict[str, int]:
    return to_percent(scores(tags))


def average(frames: Iterable[Mapping[str, int]]) -> dict[str, int]:
    """The same pet over several video frames: the mean of each emotion, back to whole percentages."""
    frames = list(frames)
    if not frames:
        return to_percent(PRIOR)
    return to_percent({e: sum(f.get(e, 0) for f in frames) / len(frames) for e in EMOTIONS})


def top(emotions: Mapping[str, int]) -> str:
    """The strongest emotion; ties go to the one listed first."""
    return max(EMOTIONS, key=lambda e: (emotions.get(e, 0), -EMOTIONS.index(e)))


def closest(frames: list[Mapping[str, int]], target: Mapping[str, int]) -> int:
    """Index of the frame whose percentages are nearest the average — the one whose box is shown."""
    return min(range(len(frames)), key=lambda i: sum(abs(frames[i].get(e, 0) - target.get(e, 0)) for e in EMOTIONS))


def fallback_summary(name: str | None, species: str | None, emotions: Mapping[str, int]) -> str:
    """The rule sentence when the summary model is unavailable or says something it must not."""
    who = name or ("This cat" if species == "cat" else "This pup")
    first = top(emotions)
    rest = {e: v for e, v in emotions.items() if e != first}
    second = top(rest)
    if rest.get(second, 0) >= 20:
        return f"{who} seems {first} and a little {second}."
    return f"{who} seems {first}."
