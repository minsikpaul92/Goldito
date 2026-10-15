"""Treat check rules (Phase 12.1): the server's verdict from the label alone, and the searches it asks for."""

import pytest
from app.ai import safety


def test_a_registered_allergen_is_danger_also_under_another_name():
    found = safety.check_rules(["chicken breast", "rice"], ["Chicken"], "dog")
    assert found.status == "DANGER" and found.matched_allergens == ["chicken"]
    # The Phase 08 example: a chicken allergy and "hydrolyzed poultry protein".
    assert safety.check_rules(["hydrolyzed poultry protein"], ["chicken"], "dog").status == "DANGER"


def test_toxic_ingredients_depend_on_the_species():
    assert safety.check_rules(["raisins", "oats"], [], "dog").toxic_ingredients == ["raisins"]
    assert safety.check_rules(["macadamia nut"], [], "dog").status == "DANGER"
    assert safety.check_rules(["macadamia nut"], [], "cat").status == "SAFE"
    lily = safety.check_rules(["lily extract", "salmon"], [], "cat")
    assert lily.status == "DANGER" and lily.toxic_ingredients == ["lily extract"]
    assert lily.sources and lily.sources[0]["domain"] == "aspca.org"
    assert safety.check_rules(["lily extract"], [], "dog").status == "SAFE"


def test_whole_words_only_and_listed_exceptions_do_not_trip():
    # "grapeseed oil" is not grapes, "cocoa butter" is not chocolate, "sugar alcohol" is not alcohol.
    assert safety.check_rules(["grapeseed oil", "cocoa butter", "sugar alcohol"], [], "dog").status == "SAFE"
    # "eggplant" is not egg; "chickpea" is not chicken.
    assert safety.check_rules(["eggplant", "chickpea flour"], ["egg", "chicken"], "dog").status == "SAFE"


def test_a_possible_hidden_source_of_this_pets_allergen_is_a_warning():
    found = safety.check_rules(["sweet potato", "animal fat"], ["chicken"], "dog")
    assert found.status == "WARNING"
    assert found.hidden_sources == [
        {"ingredient": "animal fat", "may_contain": "chicken", "reason": found.hidden_sources[0]["reason"]}
    ]
    # Without that allergy, animal fat alone is not a warning.
    assert safety.check_rules(["sweet potato", "animal fat"], [], "dog").status == "SAFE"
    # An ingredient that names the animal is a match, not a hidden source.
    named = safety.check_rules(["chicken liver"], ["chicken"], "dog")
    assert named.status == "DANGER" and named.hidden_sources == []


@pytest.mark.parametrize(
    ("allergy", "ingredient"),
    [
        ("eggs", "dried egg product"),
        ("poultry", "chicken breast"),
        ("milk", "sodium caseinate"),
        ("fish", "fishmeal"),
        ("fish", "catfish"),
        ("dairy", "buttermilk powder"),
    ],
)
def test_an_allergy_typed_freely_still_matches_label_words(allergy, ingredient):
    # SR-2: free-typed allergy names and label spellings the whole-word match used to miss.
    found = safety.check_rules([ingredient], [allergy], "dog")
    assert found.status == "DANGER" and found.matched_allergens == [allergy]


@pytest.mark.parametrize(
    ("allergy", "ingredient", "status"),
    [
        ("dairy", "peanut butter", "SAFE"),
        ("dairy", "butter", "DANGER"),
        ("milk", "coconut milk", "SAFE"),
        ("milk", "goat milk", "DANGER"),
        ("chicken", "beef liver", "SAFE"),
        ("chicken", "liver", "WARNING"),
        ("chicken", "chicken liver", "DANGER"),
        ("chicken", "natural chicken flavor", "DANGER"),
        ("beef", "natural chicken flavor", "SAFE"),
        ("chicken", "animal fat", "WARNING"),
    ],
)
def test_look_alikes_and_named_animals_do_not_raise_false_alarms(allergy, ingredient, status):
    # SR-3: "peanut butter" is not dairy, and "beef liver" hides no chicken.
    assert safety.check_rules([ingredient], [allergy], "dog").status == status


def test_allergen_keys_normalize_what_a_person_typed():
    assert safety.allergen_keys("Eggs ") == ["egg"]
    assert safety.allergen_keys("poultry") == ["chicken", "turkey"]
    assert safety.allergen_keys("Cow's milk") == ["milk"]
    assert safety.allergen_keys("kiwi") == ["kiwi"]
    # A typed group name still finds hidden sources of its members.
    assert safety.check_rules(["animal fat"], ["poultry"], "dog").status == "WARNING"
    assert safety.check_rules(["chicken meal"], ["chicken"], "dog").status == "DANGER"
    assert safety.check_rules(["sweet potato"], ["chicken"], "dog").status == "SAFE"


def test_worst_keeps_the_most_serious():
    assert safety.worst("SAFE", "WARNING") == "WARNING"
    assert safety.worst("DANGER", "SAFE") == "DANGER"


def test_searches_put_hidden_sources_and_toxins_first_and_never_exceed_four():
    findings = safety.check_rules(["animal fat", "raisins", "oats", "rice", "carrot"], ["chicken"], "dog")
    queries = safety.search_queries(["animal fat", "raisins", "oats", "rice", "carrot"], ["chicken"], "dog", "Trail Mix", findings)
    assert [q.text for q in queries] == [
        "animal fat chicken derived",
        "raisins toxic dogs",
        "Trail Mix dog treat recall",
        "animal fat safe for dogs",
    ]
    assert queries[2].topic == "news" and queries[2].time_range == "year"


def test_a_plain_label_still_gets_searched_so_there_is_always_a_source():
    queries = safety.search_queries(["sweet potato"], [], "dog", None, safety.check_rules(["sweet potato"], [], "dog"))
    assert [q.text for q in queries] == ["sweet potato safe for dogs"]


def test_the_rules_only_message_names_the_pet_and_what_to_do():
    found = safety.check_rules(["chicken"], ["chicken"], "dog")
    assert safety.fallback_message("Max", "DANGER", found) == "Max is allergic to chicken, and this treat contains it. Don't feed it."
    plain = safety.check_rules(["sweet potato"], [], "dog")
    assert "couldn't double-check" in safety.fallback_message("Max", "WARNING", plain)
