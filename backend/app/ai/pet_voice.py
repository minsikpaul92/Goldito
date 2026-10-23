"""Voice sign-up (11.15 S3): what the model may say about a pet, and what the server lets through.

The model reads the owner's (fixed) text and proposes facts. Every fact has a quote, and the server checks that the
quote is really in the text and that the value fits it. A fact that fails any check is dropped, never repaired.
"""

import re
from typing import Any

from pydantic import BaseModel, field_validator


class RawFact(BaseModel):
    """Loose on purpose: `validate_facts` tightens it."""

    value: Any = None
    quote: str = ""

    @field_validator("quote", mode="before")
    @classmethod
    def _null_quote_is_no_quote(cls, value: Any) -> Any:
        # The model writes "quote": null for what was not said; that is a fact without a quote, not a broken answer.
        return "" if value is None else value


class RawFacts(BaseModel):
    breed: RawFact | None = None
    age_years: RawFact | None = None
    weight_kg: RawFact | None = None
    foods: list[RawFact] = []
    answers: dict[str, RawFact] = {}
    notes: dict[str, RawFact] = {}

    @field_validator("foods", mode="before")
    @classmethod
    def _no_empty_foods(cls, value: Any) -> Any:
        # An item the model has nothing for comes back as null: skip it, keep the rest.
        return [] if value is None else [item for item in value if item is not None] if isinstance(value, list) else value

    @field_validator("answers", "notes", mode="before")
    @classmethod
    def _no_empty_entries(cls, value: Any) -> Any:
        if value is None:
            return {}
        if not isinstance(value, dict):
            return value
        # `"likes": null` is "nothing said"; a bare string is the quote itself.
        return {key: ({"quote": item} if isinstance(item, str) else item) for key, item in value.items() if item is not None}


class Fact(BaseModel):
    value: str | int | float
    quote: str


class Facts(BaseModel):
    breed: Fact | None = None
    age_years: Fact | None = None
    weight_kg: Fact | None = None
    foods: list[Fact] = []
    answers: dict[str, Fact] = {}
    # What the owner said for the free-text items of the numbered list, in their own words (the key says which item).
    notes: dict[str, Fact] = {}


# The free-text items of the list the owner reads from: what the pet eats, what it is like, likes, dislikes, cautions.
NOTE_KEYS = ("eats", "personality", "likes", "dislikes", "careful")
MAX_NOTE = 300
# What an owner says for an item that has nothing to tell: not a note.
EMPTY_NOTES = {"nothing", "nothing special", "nothing in particular", "none", "no", "nope", "not really", "n a", "na"}
MAX_FOODS = 8
MAX_BREED = 60
MAX_FOOD = 40
LB_TO_KG = 0.45359237

_WORDS = re.compile(r"[a-z0-9]+(?:\.[0-9]+)?")
_NUMBER_WORDS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
    "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
}


def _tokens(text: str) -> list[str]:
    return _WORDS.findall(text.lower())


def quote_in(quote: str, text: str) -> bool:
    """The quote, ignoring case and punctuation, is a run of whole words in the text. Three characters at least."""
    q, t = _tokens(quote), _tokens(text)
    if len(" ".join(q)) < 3:
        return False
    return any(t[i : i + len(q)] == q for i in range(len(t) - len(q) + 1))


def numbers_in(text: str) -> list[float]:
    """Numbers said in digits or in words ("four", "twenty five")."""
    found: list[float] = []
    tokens = _tokens(text)
    i = 0
    while i < len(tokens):
        token = tokens[i]
        if token in _NUMBER_WORDS:
            n = _NUMBER_WORDS[token]
            if n >= 20 and n % 10 == 0 and i + 1 < len(tokens) and tokens[i + 1] in _NUMBER_WORDS and _NUMBER_WORDS[tokens[i + 1]] < 10:
                n += _NUMBER_WORDS[tokens[i + 1]]
                i += 1
            found.append(float(n))
        else:
            try:
                found.append(float(token))
            except ValueError:
                pass
        i += 1
    return found


def _same_words(value: str, quote: str) -> bool:
    """Every word of the value has a word in the quote that starts the same way (a spelling slip is tolerated)."""
    wanted = [w for w in _tokens(value) if len(w) >= 3]
    said = _tokens(quote)
    return bool(wanted) and all(any(s[:4] == w[:4] for s in said) for w in wanted)


def _as_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def validate_facts(raw: RawFacts, text: str, options: dict[str, set[str]]) -> Facts:
    """`options` maps each question key the app asked about to the option values it may answer with."""
    facts = Facts()

    if raw.breed and isinstance(raw.breed.value, str):
        breed = " ".join(raw.breed.value.split())
        if breed and len(breed) <= MAX_BREED and quote_in(raw.breed.quote, text) and _same_words(breed, raw.breed.quote):
            facts.breed = Fact(value=breed, quote=raw.breed.quote.strip())

    if raw.age_years:
        years = _as_float(raw.age_years.value)
        quote = raw.age_years.quote
        if years is not None and years == int(years) and 0 <= years <= 30 and quote_in(quote, text):
            small = years == 0 and any(w in _tokens(quote) for w in ("month", "months", "week", "weeks", "puppy", "kitten"))
            if small or years in numbers_in(quote):
                facts.age_years = Fact(value=int(years), quote=quote.strip())

    if raw.weight_kg:
        kg = _as_float(raw.weight_kg.value)
        quote = raw.weight_kg.quote
        if kg is not None and 0 < kg < 200 and quote_in(quote, text):
            kg = round(kg, 1)
            said = numbers_in(quote)
            pounds = any(w in _tokens(quote) for w in ("pound", "pounds", "lb", "lbs"))
            # Said in pounds, the value must be the converted one: 13 pounds is 5.9 kg, never 13.
            if any(abs(kg - (round(n * LB_TO_KG, 1) if pounds else n)) <= 0.15 for n in said):
                facts.weight_kg = Fact(value=kg, quote=quote.strip())

    seen: set[str] = set()
    for food in raw.foods[:MAX_FOODS * 2]:
        if not isinstance(food.value, str):
            continue
        name = " ".join(food.value.lower().split())
        if name and len(name) <= MAX_FOOD and name not in seen and quote_in(food.quote, text) and _same_words(name, food.quote):
            seen.add(name)
            facts.foods.append(Fact(value=name, quote=food.quote.strip()))
        if len(facts.foods) >= MAX_FOODS:
            break

    for key, answer in raw.answers.items():
        allowed = options.get(key)
        if allowed is None or answer.value is None:
            continue
        value = str(answer.value)
        if value in allowed and quote_in(answer.quote, text):
            facts.answers[key] = Fact(value=value, quote=answer.quote.strip())

    # Notes are the owner's own words for an item, so the quote is the value. It has to be in the text.
    for key in NOTE_KEYS:
        note = raw.notes.get(key)
        words = " ".join(note.quote.split()) if note else ""
        if words and len(words) <= MAX_NOTE and " ".join(_tokens(words)) not in EMPTY_NOTES and quote_in(words, text):
            facts.notes[key] = Fact(value=words, quote=words)

    return facts
