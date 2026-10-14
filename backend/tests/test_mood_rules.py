"""Mood rules (Phase 12.2a, D61): tags → eight emotion percentages, computed by the server, always adding up to 100."""

import pytest
from app.ai import mood_rules as rules

SLEEPING = {"ears": "relaxed", "eyes": "closed", "mouth": "closed_relaxed", "posture": "curled_up", "activity": "sleeping"}
PLAYING = {"ears": "forward", "eyes": "wide", "mouth": "holding_toy", "tail": "high_wagging", "posture": "play_bow", "activity": "playing"}
GROWLING = {"ears": "pinned_back", "eyes": "hard_stare", "mouth": "teeth_showing", "body_tension": "stiff"}
HAPPY = {"ears": "relaxed", "eyes": "soft", "mouth": "open_relaxed", "tail": "wagging", "body_tension": "relaxed"}


@pytest.mark.parametrize("tags", [SLEEPING, PLAYING, GROWLING, HAPPY, {}], ids=["sleeping", "playing", "growling", "happy", "nothing"])
def test_every_answer_has_all_eight_emotions_as_whole_numbers_adding_up_to_100(tags):
    pct = rules.percentages(tags)
    assert list(pct) == list(rules.EMOTIONS)
    assert all(isinstance(v, int) and v >= 0 for v in pct.values())
    assert sum(pct.values()) == 100


@pytest.mark.parametrize(
    ("tags", "expected"),
    [(SLEEPING, "sleepy"), (PLAYING, "excited"), (GROWLING, "angry"), (HAPPY, "happy")],
    ids=["sleeping", "playing", "growling", "happy"],
)
def test_the_strongest_emotion_follows_the_body_language(tags, expected):
    assert rules.top(rules.percentages(tags)) == expected


def test_the_same_tags_always_give_the_same_percentages():
    assert rules.percentages(dict(HAPPY)) == rules.percentages(dict(HAPPY))


def test_no_readable_signal_is_calm_and_a_little_curious():
    assert rules.percentages({"ears": "not_visible", "eyes": "???"}) == {
        "happy": 0, "relaxed": 50, "excited": 0, "curious": 50, "sleepy": 0, "anxious": 0, "angry": 0, "sad": 0,
    }


@pytest.mark.parametrize(
    ("field", "value", "expected"),
    [("mouth", "Open Relaxed", "open_relaxed"), ("tail", "high-wagging", "high_wagging"), ("eyes", "sparkly", "not_visible"), ("ears", None, "not_visible")],
)
def test_tags_are_tidied_and_unknown_values_count_as_not_visible(field, value, expected):
    assert rules.clean_tag(field, value) == expected


def test_rounding_left_over_goes_to_the_largest():
    # Thirds: 33.3 each → 33 + 33 + 34, the extra point on the first of the largest.
    assert rules.to_percent({"happy": 1, "relaxed": 1, "curious": 1}) == {
        "happy": 34, "relaxed": 33, "excited": 0, "curious": 33, "sleepy": 0, "anxious": 0, "angry": 0, "sad": 0,
    }


def test_frames_of_a_video_are_averaged_back_to_100():
    frames = [rules.percentages(SLEEPING), rules.percentages(HAPPY), rules.percentages(HAPPY), rules.percentages(PLAYING)]
    avg = rules.average(frames)
    assert sum(avg.values()) == 100
    assert rules.top(avg) == "happy"
    assert rules.closest(frames, avg) in (1, 2)  # a happy frame is the one shown


def test_the_rule_sentence_says_seems_and_names_the_pet():
    assert rules.fallback_summary("Max", "dog", rules.percentages(SLEEPING)).startswith("Max seems sleepy")
    assert rules.fallback_summary(None, "cat", {"happy": 100}) == "This cat seems happy."
    assert rules.fallback_summary(None, "dog", {"happy": 60, "curious": 40}) == "This pup seems happy and a little curious."
