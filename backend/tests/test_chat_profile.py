"""What sign-up told the chat (app/ai/chat_profile.py): plain facts from the owner's and the sitter's own answers."""

from app.ai import chat_profile as cp


def test_the_personality_levels_are_words_from_the_average_of_each_axis():
    out = cp.pet_profile({"answers": {"d1": 4, "d2": 3, "d3": 4, "d4": 1, "d7": 3}}, [])
    assert out["personality"] == {"Sociability": "Social", "Sensitivity": "Unfazed", "Energy": "Active"}  # 3.67 rounds to 4


def test_a_cat_has_its_own_axes_and_unknown_keys_are_ignored():
    out = cp.pet_profile({"answers": {"c10": 4, "zz": 4, "d1": 9}}, [])
    assert out["personality"] == {"Handling": "Easygoing"}


def test_the_safety_answers_are_the_owners_words_and_a_skipped_one_is_left_out():
    out = cp.pet_profile({"safety": {"s1": "once", "s3": "unsure", "s5": "both", "s9": "x", "s2": "bogus"}}, [])
    assert out["safety"] == [
        "has snapped once",
        "owner is not sure about slipping out",
        "daily medication and a condition to watch",
    ]


def test_allergies_are_listed_none_only_when_the_owner_said_so_and_otherwise_not_answered():
    assert cp.pet_profile({}, ["chicken", "wheat"])["allergies"] == "allergic to chicken, wheat"
    assert cp.pet_profile({"safety": {"s6": "none"}}, [])["allergies"] == "none, the owner says"
    assert cp.pet_profile({"safety": {"s6": "listed"}}, [])["allergies"] == cp.NOT_ANSWERED
    assert cp.pet_profile(None, [])["allergies"] == cp.NOT_ANSWERED
    assert cp.pet_profile("garbage", [])["allergies"] == cp.NOT_ANSWERED


def test_the_checklist_is_the_active_tasks_earliest_first_with_free_text_scrubbed():
    rows = [
        {"type": "feeding", "title": "Dinner", "scheduled_time": "18:30:00", "active": True},
        {"type": "medication", "title": "Apoquel", "dose": "1 tablet", "scheduled_time": "08:00:00", "notes": "Call 416-555-0199 if he vomits", "active": True},
        {"type": "walk", "title": "Old walk", "scheduled_time": "12:00:00", "active": False},
    ]
    out = cp.checklist(rows)
    assert [t["task"] for t in out] == ["Apoquel", "Dinner"]
    assert out[0]["time"] == "8:00 AM" and out[0]["dose"] == "1 tablet" and "416" not in out[0]["note"]
    assert out[1]["time"] == "6:30 PM"


def test_the_sitters_answers_are_short_lines_and_the_handoff_answer_is_left_out():
    rows = [
        {"question_key": "park_nearby", "choice": "yes", "position": 1},
        {"question_key": "walks_per_day", "choice": "3", "answer": "Morning, noon and evening", "position": 2},
        {"question_key": "dog_sizes", "choice": "small,medium", "position": 3},
        {"question_key": "handoff", "choice": "sitter_picks_up", "position": 4},
        {"question_key": "custom_1", "question_text": "Do you have a fenced yard?", "answer": "Yes, a small one", "position": 5},
    ]
    assert cp.sitter_answers(rows) == [
        "a park near home: yes",
        "3 walks a day (Morning, noon and evening)",
        "takes dog sizes: small, medium",
        "Do you have a fenced yard?: Yes, a small one",
    ]


def test_who_i_am_names_the_person_their_pets_or_their_work():
    pets = [{"name": "Max", "breed": "Maltese", "species": "dog"}, {"name": "Luna", "species": "cat"}]
    assert cp.i_am("owner", "Robert", "Chloe", pets=pets) == "I am Robert, a pet owner with Max (Maltese) and Luna (cat). I am writing to Chloe, a sitter I may book."
    assert cp.i_am("sitter", "Chloe", "Robert", pets=[], service_area="Toronto") == "I am Chloe, a pet sitter in Toronto. I am writing to Robert, a pet owner who may book me."
