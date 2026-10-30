"""Treat check rules (Phase 12.1, D23 · D61): what the server knows without asking a model.

The rule table (`prompts/safety/toxic_rules.json`) gives the first verdict: a registered allergen or an ingredient toxic
to the species is DANGER, an ingredient that may hide an allergen is WARNING. The model may add findings but the final
status is never lower than the rules' (`worst`). Matching is whole-word and case-insensitive.
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Literal

from app.ai.prompts import load_json

Status = Literal["SAFE", "WARNING", "DANGER"]
SEVERITY: dict[str, int] = {"SAFE": 0, "WARNING": 1, "DANGER": 2}

MAX_QUERIES = 4
log = logging.getLogger("goldito.ai")


def worst(*statuses: str) -> Status:
    """The most serious of the given statuses."""
    return max(statuses, key=lambda s: SEVERITY[s])  # type: ignore[return-value]


def _rules() -> dict:
    return load_json("safety/toxic_rules.json")


def _mentions(text: str, word: str) -> bool:
    return re.search(rf"(?<![a-z]){re.escape(word.lower())}(?![a-z])", text.lower()) is not None


def _mentions_any(text: str, words: list[str], exclude: list[str] | None = None) -> bool:
    if exclude and any(_mentions(text, e) for e in exclude):
        return False
    return any(_mentions(text, w) for w in words)


def allergen_keys(allergen: str) -> list[str]:
    """The rule-table keys for what a person typed: 'Eggs ' → ['egg'], 'poultry' → ['chicken', 'turkey']."""
    key = " ".join(allergen.strip().lower().split())
    rules = _rules()
    if key in rules["allergen_keys"]:
        return rules["allergen_keys"][key]
    aliases = rules["allergen_aliases"]
    if key not in aliases and key.endswith("s") and key[:-1] in aliases:
        return [key[:-1]]
    if key not in aliases:
        log.info("safety: allergy not in the rule table (%s)", key[:40])
    return [key]


def allergen_words(allergen: str) -> list[str]:
    """What a registered allergy matches on a label: the words typed, its keys, and their aliases."""
    aliases = _rules()["allergen_aliases"]
    words = {" ".join(allergen.strip().lower().split())}
    for key in allergen_keys(allergen):
        words.add(key)
        words.update(aliases.get(key, []))
    return sorted(words)


def allergen_exclusions(allergen: str) -> list[str]:
    """Label words that look like the allergen but are not: 'peanut butter' is not dairy."""
    table = _rules()["allergen_not"]
    return sorted({w for key in allergen_keys(allergen) for w in table.get(key, [])})


def _has_allergen(ingredient: str, allergen: str) -> bool:
    return _mentions_any(ingredient, allergen_words(allergen), allergen_exclusions(allergen))


@dataclass
class RuleFindings:
    status: Status = "SAFE"
    matched_allergens: list[str] = field(default_factory=list)
    toxic_ingredients: list[str] = field(default_factory=list)
    hidden_sources: list[dict] = field(default_factory=list)
    sources: list[dict] = field(default_factory=list)


def check_rules(ingredients: list[str], allergens: list[str], species: str) -> RuleFindings:
    """The server's first verdict from the label alone."""
    rules = _rules()
    found = RuleFindings()
    pet_allergens = [a.strip().lower() for a in allergens if a.strip()]

    for allergen in pet_allergens:
        if any(_has_allergen(ingredient, allergen) for ingredient in ingredients):
            found.matched_allergens.append(allergen)

    for rule in rules["toxic"]:
        if species not in rule["species"]:
            continue
        for ingredient in ingredients:
            if _mentions_any(ingredient, rule["aliases"], rule.get("not")):
                if ingredient not in found.toxic_ingredients:
                    found.toxic_ingredients.append(ingredient)

    named = {i for i in ingredients for a in pet_allergens if _has_allergen(i, a)}
    for hidden in rules["hidden_sources"]:
        for ingredient in ingredients:
            # "chicken liver" already names the animal: it is a match above, not a hidden source.
            if ingredient in named or not _mentions(ingredient, hidden["term"]):
                continue
            # "beef liver" names its animal, so nothing is hidden; if that animal is an allergy it matched above.
            if _mentions_any(ingredient, rules["animal_words"]):
                continue
            # Only an allergen this pet has makes it a warning; name the first one the term may hide.
            hit = next((a for a in pet_allergens if set(allergen_keys(a)) & set(hidden["may_contain"])), None)
            if hit and not any(h["ingredient"] == ingredient for h in found.hidden_sources):
                found.hidden_sources.append({"ingredient": ingredient, "may_contain": hit, "reason": hidden["reason"]})

    if found.matched_allergens or found.toxic_ingredients:
        found.status = "DANGER"
    elif found.hidden_sources:
        found.status = "WARNING"
    return found


@dataclass
class Query:
    text: str
    topic: Literal["general", "news"] = "general"
    time_range: str | None = None


def search_queries(
    ingredients: list[str], allergens: list[str], species: str, product: str | None, findings: RuleFindings
) -> list[Query]:
    """Up to four keyword searches for every check (D61: Tavily always, FDA pages only).

    Hidden allergen sources first, then toxic ingredients, then a recall check for the product; whatever room is left
    goes to the first ingredients. What the searches find is evidence for the model; a page is shown to the owner only
    when `sources_to_show` lets it through.
    """
    queries: list[Query] = []

    def add(query: Query) -> None:
        if len(queries) < MAX_QUERIES and query.text not in (q.text for q in queries):
            queries.append(query)

    for hidden in findings.hidden_sources[:2]:
        add(Query(f"{hidden['ingredient']} {hidden['may_contain']} derived"))
    for ingredient in findings.toxic_ingredients[:1]:
        add(Query(f"{ingredient} toxic {species}s"))
    if product:
        add(Query(f"{product} {species} treat recall", topic="news", time_range="year"))
    for ingredient in ingredients:
        add(Query(f"{ingredient} safe for {species}s"))
    return queries


def _mentions(text: str, term: str) -> bool:
    """The whole word or phrase appears (a plural 's' is allowed), case-insensitive."""
    return re.search(rf"(?<![a-z0-9]){re.escape(term.lower())}s?(?![a-z0-9])", text.lower()) is not None


def sources_to_show(
    hits: list[dict], cited: list[int], terms: list[str], *, rule_allergen_hit: bool, limit: int
) -> list[dict]:
    """The search pages the owner may see: never one that is unrelated to this verdict.

    - A verdict that the pet's own allergy and the label already settle (`rule_allergen_hit`) shows no pages: the search
      cannot add to it, and a page that only mentions the food (a recall, a bland diet) would look like proof.
    - Otherwise a page is shown only when the model cited it (`cited` are 1-based numbers of the excerpts it was given)
      and its title or text names one of the `terms` (the product, or an ingredient or allergen the verdict is about).
    """
    if rule_allergen_hit:
        return []
    shown: list[dict] = []
    for n in cited:
        if not 1 <= n <= len(hits):
            continue
        hit = hits[n - 1]
        words = f"{hit.get('title', '')} {hit.get('content', '')}"
        if hit in shown or not any(t.strip() and _mentions(words, t.strip()) for t in terms):
            continue
        shown.append(hit)
        if len(shown) == limit:
            break
    return shown


def partial_message(pet_name: str) -> str:
    """What the result says when only part of the ingredient list could be read."""
    return (
        f"We could only read part of the label, so we can't call this safe for {pet_name}. "
        "Retake a photo of the whole ingredient list."
    )


def fallback_message(pet_name: str, status: Status, findings: RuleFindings) -> str:
    """What the result says when the reasoning model could not answer (rules only)."""
    if findings.matched_allergens:
        return f"{pet_name} is allergic to {', '.join(findings.matched_allergens)}, and this treat contains it. Don't feed it."
    if findings.toxic_ingredients:
        return f"This treat contains {', '.join(findings.toxic_ingredients)}, which is unsafe for {pet_name}. Don't feed it."
    if findings.hidden_sources:
        hidden = findings.hidden_sources[0]
        return f"The {hidden['ingredient']} may contain {hidden['may_contain']}, which {pet_name} is allergic to. Ask the owner first."
    return f"Nothing on this label is on our list for {pet_name}, but we couldn't double-check it. Read the label once more before feeding."
