"""Inquiry reply (phase-07B 7B.3): the facts a draft may use, and the checks a draft must pass.

The model writes prose only. Availability, the quote, the pets and the sources are gathered by the server;
every amount and date in the draft is checked against them afterwards, so a number that is not in the
facts never reaches the sitter (D29), and nothing about the entry or an address is ever put in (D31).
"""

import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field

MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
QUESTION_MAX = 300
MAX_SOURCES = 5
SOURCE_TEXT_MAX = 400

# Keys / words that must never be in the facts or the reply (D31 + other people's details).
FORBIDDEN_KEYS = ("lockbox", "buzzer", "address", "entry", "door", "phone", "email", "emergency", "password", "code")
FORBIDDEN_WORDS = re.compile(r"\b(lockbox|buzzer|door ?code|entry (?:code|info)|home address|passcode)\b", re.IGNORECASE)

_AI_QUESTION = re.compile(
    r"\b(are you|r u|is this|am i (?:talking|speaking|chatting)|is (?:it|someone|this) )[^.?!]{0,30}"
    r"(an? )?(ai|a\.i\.|bot|robot|chatbot|human|real person|real human|actual person|automated)\b|"
    r"\bwho(?:'s| is) (?:this|writing|replying)\b|\bis this (?:automated|a bot)\b",
    re.IGNORECASE,
)
_CLAIMS_HUMAN = re.compile(
    r"\b(i am|i'm) (?:a )?(?:real |actual )?(?:human|person)\b|\bnot (?:an? )?(?:ai|bot|robot)\b", re.IGNORECASE
)
_THIRD_PERSON = re.compile(r"\b(assistant|chatbot|virtual|language model|as an ai|i am an ai|i'm an ai)\b", re.IGNORECASE)
_MONEY = re.compile(r"\$\s?(\d[\d,]*(?:\.\d{1,2})?)")
_DATE = re.compile(r"\b(" + "|".join(MONTHS) + r")[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b", re.IGNORECASE)
_PLACEHOLDER = re.compile(r"\{[A-Z_]{2,}\}|\{\{[^}]*\}\}")


class Draft(BaseModel):
    """What the model returns."""

    reply: str
    can_host: bool = True
    needs_sitter: bool = False
    used_sources: list[str] = Field(default_factory=list)


def asks_if_ai(question: str) -> bool:
    return bool(_AI_QUESTION.search(question or ""))


def human_date(day: date) -> str:
    return f"{MONTHS[day.month - 1]} {day.day}"


def stay_days(drop_off: datetime, pick_up: datetime, tz: ZoneInfo) -> list[date]:
    first, last = drop_off.astimezone(tz).date(), pick_up.astimezone(tz).date()
    return [first + timedelta(days=i) for i in range((last - first).days + 1)]


def availability(rows: list[dict], days: list[date]) -> dict:
    """Which days of the stay the sitter can't take: any slot that day blocked or full.

    `rows` are `get_sitter_schedule` rows (`day`, `state`). A day with no row at all is not counted. Closed
    slots (outside the sitter's hours) are normal and never make a day unavailable.
    """
    wanted = {d.isoformat() for d in days}
    worst: dict[str, str] = {}
    for row in rows:
        day = str(row["day"])[:10]
        if day not in wanted:
            continue
        state = row["state"]
        if state == "blocked" or (state == "full" and worst.get(day) != "blocked"):
            worst[day] = state
    unavailable = [{"day": d, "label": human_date(date.fromisoformat(d)), "state": worst[d]} for d in sorted(worst)]
    return {"can_host": not unavailable, "unavailable_days": unavailable}


def pet_facts(pet: dict, allergies: list[str], cautions: list[str], today: date) -> dict:
    out: dict = {"name": pet["name"], "species": pet["species"]}
    if pet.get("breed"):
        out["breed"] = pet["breed"]
    if pet.get("birthdate"):
        try:
            born = date.fromisoformat(str(pet["birthdate"])[:10])
            out["age_years"] = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
        except ValueError:
            pass
    if pet.get("weight_kg") is not None:
        out["weight_kg"] = float(pet["weight_kg"])
    if pet.get("notes"):
        out["owner_notes"] = " ".join(str(pet["notes"]).split())[:200]
    if allergies:
        out["allergies"] = allergies[:8]
    if cautions:
        out["heads_up"] = cautions[:8]
    return out


def source_label(source_type: str, sitter_name: str, pet_names: dict[str, str], pet_id: str | None) -> str:
    if source_type == "sitter_policy":
        return f"From {sitter_name}'s policies"
    if source_type == "life_record":
        return f"From {pet_names.get(pet_id or '', 'your pet')}'s Life Record"
    if source_type == "care_request":
        return f"From {pet_names.get(pet_id or '', 'your pet')}'s care request"
    return "From your earlier messages"


def clean_sources(hits: list[dict], labels: dict[str, str]) -> list[dict]:
    """RAG hits as `{id, type, label, text}` with stable ids (`policy-0`, `record-1`, …)."""
    prefix = {"sitter_policy": "policy", "life_record": "record", "care_request": "request", "inquiry": "earlier"}
    out: list[dict] = []
    for hit in hits[:MAX_SOURCES]:
        kind = hit["source_type"]
        out.append(
            {
                "id": f"{prefix.get(kind, 'source')}-{len(out)}",
                "type": kind,
                "label": labels.get(str(hit.get("source_id")), prefix.get(kind, "source")),
                "text": " ".join(str(hit["content"]).split())[:SOURCE_TEXT_MAX],
            }
        )
    return out


def assert_no_secrets(value, path: str = "") -> None:
    """Raises if any key in the facts looks like entry info, an address, a phone number … (D31)."""
    if isinstance(value, dict):
        for key, inner in value.items():
            lowered = str(key).lower()
            if any(bad in lowered for bad in FORBIDDEN_KEYS):
                raise ValueError(f"forbidden key in the facts: {path}{key}")
            assert_no_secrets(inner, f"{path}{key}.")
    elif isinstance(value, list):
        for i, inner in enumerate(value):
            assert_no_secrets(inner, f"{path}{i}.")


def _money_values(quote: dict | None) -> set[float]:
    if not quote:
        return set()
    out: set[float] = set()
    for key in ("total", "base", "extra_pets", "holiday_surcharge", "unit_price"):
        if quote.get(key) is not None:
            out.add(round(float(quote[key]), 2))
    return out


def _allowed_dates(grounding: dict) -> set[tuple[int, int]]:
    out: set[tuple[int, int]] = set()
    for key in ("stay_days",):
        for iso in grounding.get("inquiry", {}).get(key, []):
            d = date.fromisoformat(iso)
            out.add((d.month, d.day))
    for item in grounding.get("availability", {}).get("unavailable_days", []):
        d = date.fromisoformat(item["day"])
        out.add((d.month, d.day))
    for item in (grounding.get("quote") or {}).get("holiday_days", []):
        d = date.fromisoformat(item["day"])
        out.add((d.month, d.day))
    return out


def reply_problems(text: str, grounding: dict, question: str = "", intent: str | None = None) -> list[str]:
    """What is wrong with a draft, in words the model can act on. Empty = it passes."""
    problems: list[str] = []
    allowed_money = _money_values(grounding.get("quote")) if grounding["availability"]["can_host"] else set()
    for match in _MONEY.finditer(text):
        amount = round(float(match.group(1).replace(",", "")), 2)
        if amount not in allowed_money:
            problems.append(
                f"the amount ${match.group(1)} is not in the facts"
                if allowed_money
                else "it mentions a price, but there is no quote for these dates"
            )
            break
    allowed_dates = _allowed_dates(grounding)
    for match in _DATE.finditer(text):
        month = MONTHS.index(match.group(1)[:3].title()) + 1
        if (month, int(match.group(2))) not in allowed_dates:
            problems.append(f"the date {match.group(0)} is not in the facts")
            break
    quote = grounding.get("quote")
    if intent != "decline" and quote and grounding["availability"]["can_host"] and f"{float(quote['total']):.2f}" not in text.replace(",", ""):
        problems.append(f"it must state the total, ${float(quote['total']):.2f} {quote.get('currency', 'CAD')}")
    if _PLACEHOLDER.search(text):
        problems.append("it still contains a placeholder like {PRICE}")
    sitter = grounding["sitter"]["name"]
    first = sitter.split()[0] if sitter else ""
    if _THIRD_PERSON.search(text) or (first and re.search(rf"\b{re.escape(first)}(?:'s)? (is|has|will|can|would|may)\b", text)):
        problems.append("it talks about the sitter in the third person or mentions an assistant — write as the sitter, in the first person")
    if FORBIDDEN_WORDS.search(text):
        problems.append("it mentions entry or address information")
    if _CLAIMS_HUMAN.search(text) and asks_if_ai(question):
        problems.append("it claims to be a human or denies being an AI")
    if not text.strip():
        problems.append("it is empty")
    return problems


_LIMIT = re.compile(
    r"\b(?:over|above|more than|heavier than|exceeding|larger than)\s*(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs|pounds?)\b", re.IGNORECASE
)


def policy_conflicts(policies: str | None, pets: list[dict]) -> list[dict]:
    """Weight limits in the sitter's own policy text that a pet is over ("No dogs over 20 kg."). Deterministic, so a
    small model can't wave a pet through: the draft is told, and `needs_sitter` is forced."""
    out: list[dict] = []
    for sentence in re.split(r"(?<=[.!?\n])\s+", policies or ""):
        for match in _LIMIT.finditer(sentence):
            limit = float(match.group(1))
            kg = limit if match.group(2).lower().startswith("kg") else limit * 0.45359237
            for pet in pets:
                if pet.get("weight_kg") is not None and pet["weight_kg"] > kg + 1e-9:
                    out.append({"pet": pet["name"], "weight_kg": pet["weight_kg"], "limit": sentence.strip()[:160]})
    return out


def fill_placeholders(text: str, grounding: dict) -> str:
    """{OWNER}, {PET} and {PRICE} (from the sitter's own examples) become the real values. {DATE} is left as is on
    purpose: it is a problem for the checks, never a guess."""
    out = text.replace("{OWNER}", grounding["owner"]["first_name"])
    names = [p["name"] for p in grounding["pets"]]
    if names:
        out = out.replace("{PET}", " and ".join([", ".join(names[:-1]), names[-1]] if len(names) > 1 else names))
    quote = grounding.get("quote")
    if quote and grounding["availability"]["can_host"]:
        out = out.replace("{PRICE}", f"${float(quote['total']):.2f} {quote.get('currency', 'CAD')}")
    return out


def situation(question: str, grounding: dict) -> str:
    """One line describing what was asked — the search key for the sitter's own examples."""
    inquiry = grounding["inquiry"]
    return f"{inquiry['service']} for {inquiry['pet_count']} pet(s): {question}"[:600]


def fixed_reply(owner_name: str, sitter_first: str, grounding: dict | None, *, model_failed: bool) -> str:
    """The safe text used when the model is down or can't pass the checks. Built only from the facts."""
    if grounding is None or model_failed:
        return f"Thanks, {owner_name}! I got your message and I'll reply properly very soon. 🐾"
    pets = ", ".join(p["name"] for p in grounding["pets"]) or "your pet"
    inquiry = grounding["inquiry"]
    window = f"{inquiry['drop_off_label']} to {inquiry['pick_up_label']}"
    if not grounding["availability"]["can_host"]:
        days = ", ".join(d["label"] for d in grounding["availability"]["unavailable_days"])
        return (
            f"Hi {owner_name}! Thanks for asking about {pets} for {window}. "
            f"Unfortunately I can't take them on {days}. Want me to look at other dates?"
        )
    quote = grounding.get("quote")
    if grounding.get("policy_conflicts"):
        return (
            f"Hi {owner_name}! Thanks for asking about {pets} for {window}. "
            "One of my house rules may not fit this stay, so I'll check and get back to you shortly."
        )
    if quote:
        return (
            f"Hi {owner_name}! Thanks for asking about {pets} for {window} 🐾 "
            f"The total would be ${float(quote['total']):.2f} {quote.get('currency', 'CAD')}. "
            "I'll confirm the details shortly. Tap **Request booking** to hold these dates."
        )
    return f"Hi {owner_name}! Thanks for asking about {pets} for {window}. I'll confirm the details shortly."
