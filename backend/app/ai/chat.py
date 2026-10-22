"""The chat AI's rules (phase-03D 3D.5, #142, D62): chips and one short draft, never sent by the model.

The model only picks and words. What is true (availability, dates, prices) comes from the database and is checked
here after the fact, like the inquiry draft's checks, so a chip or draft can never carry an invented amount or date.
"""

import re
from datetime import datetime
from difflib import SequenceMatcher

from app.ai import inquiry as logic

REPEAT_RATIO = 0.85  # a draft this close to a recent message is a repeat
REPEAT_WINDOW = 4  # ... of the last this-many texts, from either side
WINDOW = 20  # the last messages every call reads
SUMMARY_OVER = 40  # a thread longer than this keeps a rolling summary of everything before the window
SUMMARY_STEP = 10  # ... refreshed when this many older messages are not in it yet
MAX_CHIPS = 3
CHIP_MAX = 36
DRAFT_MAX = 600
ACTION_MIN_CONFIDENCE = 0.7  # below this the model is guessing: no action chip at all

# The things a person can do next from the chat (D62). The code decides which are possible right now; the model may point
# at one when the other person's last message leads to it, and a person always presses it. `label` is what the chip says,
# `meaning` is what the model reads (it never writes a label).
ACTIONS: dict[str, dict[str, str]] = {
    "request_booking": {"label": "Request booking", "meaning": "I ask the sitter to take the stay (a first step, not a promise)."},
    "send_quote": {"label": "Send quote", "meaning": "I price the stay for the owner with my saved rates."},
    "interest": {"label": "Yes, let's meet", "meaning": "I say yes to meeting first; my dates are held for this owner."},
    "meet_time": {"label": "Pick a time", "meaning": "I choose a time and place for the Meet & Greet."},
    "meet_accept": {"label": "Accept", "meaning": "I accept the Meet & Greet time they suggested."},
    "meet_skip": {"label": "Skip Meet & Greet", "meaning": "I ask to skip the Meet & Greet."},
    "agree": {"label": "I'd like to book", "meaning": "I, the owner, say I want to book this sitter."},
    "accept": {"label": "I accept", "meaning": "I, the sitter, accept this booking."},
    "final_quote": {"label": "Send final quote", "meaning": "I send the final quote now that we both agreed."},
    "confirm_quote": {"label": "Confirm quote", "meaning": "I confirm the final quote."},
    "pay": {"label": "Pay", "meaning": "I pay for the stay (a demo payment)."},
}

_NUMBER = re.compile(r"\d")
_CLOCK = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s?([AP]M)\b", re.IGNORECASE)
_GREETING = re.compile(r"^\W*(?:hi|hey|hello|hiya|howdy|dear|good (?:morning|afternoon|evening))\b", re.IGNORECASE)
_NAME_FIRST = re.compile(r"^\s*[A-Z][a-z]+:\s")
# The other side asked about money: a price, a rate, a quote, a fee or "how much".
_MONEY_TALK = re.compile(r"\b(price|prices|pricing|cost|costs|how much|rate|rates|quote|fee|fees|charge|charges|total|pay|payment|deposit)\b|\$", re.IGNORECASE)
_EMOJI_SPECIES = {"cat": re.compile("[\U0001F408\U0001F431\U0001F63A-\U0001F640]"), "dog": re.compile("[\U0001F415\U0001F436\U0001F429]")}
_UNAVAILABLE = re.compile(r"\b(?:i(?:'m| am)|we(?:'re| are)|already|fully)\s+booked\b|\bfully booked\b|\bno room\b|\bunavailable\b", re.IGNORECASE)


# Who hands over: the stay card never says it, so the text the model reads does (the owner drops off and picks up).
HANDOFF = "The owner drops off and picks up."


_EMAIL = re.compile(r"\S+@\S+")
_DIGIT_RUN = re.compile(r"\d[\d\s().-]*\d")
_LONG_DIGITS = re.compile(r"\d{4,}")


def _digits(match: re.Match) -> str:
    """A phone number (7+ digits) goes whole; otherwise only runs of 4+ digits (entry codes), so "Oct 10-12" stays."""
    run = match.group(0)
    if sum(ch.isdigit() for ch in run) >= 7:
        return "#"
    return _LONG_DIGITS.sub("#", run)


def scrub(text: str | None) -> str:
    """Chat text made safe for a prompt and the stored summary (D29, D31, R20-7): one line, no emails, no phone numbers
    or entry codes. Names are not removed here; they stay out of the log instead."""
    clean = " ".join((text or "").split())
    clean = _EMAIL.sub("", clean)
    clean = _DIGIT_RUN.sub(_digits, clean)
    return " ".join(clean.split())


def _clip(text: str, n: int = 240) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= n else text[: n - 1] + "…"


def _when(iso: str, tz) -> str:
    moment = datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(tz)
    return f"{logic.MONTHS[moment.month - 1]} {moment.day} {moment.strftime('%-I:%M %p')}"


_QUOTE_STATUS = {
    "sent": "sent, waiting for the owner",
    "confirmed": "confirmed by the owner",
    "replaced": "replaced by a newer quote",
    "declined": "declined by the owner",
}


def _meet_greet_text(booking: dict, me_id: str, tz) -> str | None:
    """The Meet & Greet card in words, from the booking's own columns (the card only holds the booking's id)."""
    status = booking.get("meet_greet_status")
    mine = lambda who: "me" if who == me_id else "them"  # noqa: E731
    plan = ""
    if booking.get("meet_greet_at"):
        place = scrub(booking.get("meet_greet_place"))
        plan = f" for {_when(booking['meet_greet_at'], tz)}, " + ("by video" if booking.get("meet_greet_mode") == "video" else f"in person{' at ' + place if place else ''}")
    if status == "required":
        return "Meet & Greet: the sitter said yes to meeting first, no time chosen yet"
    if status == "proposed":
        return f"Meet & Greet proposed by {mine(booking.get('meet_greet_proposed_by'))}{plan}, waiting for the other person's answer"
    if status == "agreed":
        return f"Meet & Greet agreed{plan}"
    if status == "done":
        return "Meet & Greet done"
    if status == "skip_requested":
        return f"Skipping the Meet & Greet was asked by {mine(booking.get('meet_greet_skip_requested_by'))}, waiting for the other person's answer"
    if status == "skipped":
        return "Meet & Greet skipped"
    return None


def _step_card_text(card_type: str, booking: dict, me_id: str, tz) -> str | None:
    """What a booking step card says right now (meet_greet, agreement, payment). Cards are updated in place, so this is the
    booking's current state, not a log."""
    if card_type == "meet_greet":
        return _meet_greet_text(booking, me_id, tz)
    if card_type == "agreement":
        owner = "agreed" if booking.get("owner_agreed_at") else "not yet"
        sitter = "accepted" if booking.get("sitter_accepted_at") else "not yet"
        return f"Agreement to book: the owner {owner}, the sitter {sitter}"
    if card_type == "payment":
        return "Payment: paid" if booking.get("paid_at") else "Payment: waiting for the owner to pay"
    return None


def describe(message: dict, me_id: str, tz, booking: dict | None = None) -> dict | None:
    """One message for the prompt and the summary: who said it and what (cards in square brackets), scrubbed like the
    typed text. Empty cards are left out. `booking` is the pair's live booking: the step cards (Meet & Greet, agreement,
    payment) say what the booking says, from "app"."""
    who = "me" if message.get("sender_id") == me_id else "them"
    if message.get("kind") == "text":
        return {"who": who, "text": _clip(scrub(message.get("body")))}
    card = message.get("card") or {}
    if card.get("type") in ("meet_greet", "agreement", "payment"):
        if not booking or str(booking.get("id")) != str(card.get("booking_id")):
            return None
        text = _step_card_text(card["type"], booking, me_id, tz)
        return {"who": "app", "text": f"[{text}]"} if text else None
    if card.get("type") == "quote" and isinstance(card.get("quote"), dict):
        total = card.get("total") if card.get("total") is not None else card["quote"].get("total")
        status = _QUOTE_STATUS.get(card.get("status"), "sent")
        return {"who": who, "text": f"[Quote {card['quote'].get('currency', '')} {total} for {card['quote'].get('service', 'the stay')}, {status}]".replace("  ", " ")}
    pets = ", ".join(p.get("name", "") for p in card.get("pets", []))
    if card.get("type") == "stay" and card.get("drop_off_at") and card.get("pick_up_at"):
        return {"who": who, "text": f"[Stay {_when(card['drop_off_at'], tz)} to {_when(card['pick_up_at'], tz)}, {pets}. {HANDOFF}]"}
    if card.get("type") == "request" and card.get("drop_off_at") and card.get("pick_up_at"):
        note = f" Note: {_clip(scrub(card['note']), 160)}" if scrub(card.get("note")) else ""
        return {"who": who, "text": f"[Booking request {_when(card['drop_off_at'], tz)} to {_when(card['pick_up_at'], tz)}, {pets}. {HANDOFF}{note}]"}
    return None


def transcript(messages: list[dict], me_id: str, tz, booking: dict | None = None) -> list[dict]:
    return [d for d in (describe(m, me_id, tz, booking) for m in messages) if d]


def split_window(messages: list[dict]) -> tuple[list[dict], list[dict]]:
    """(older, recent): the last WINDOW messages are read as they are, the rest only through the summary."""
    return messages[:-WINDOW], messages[-WINDOW:]


def summary_due(messages: list[dict], upto: str | None) -> list[dict]:
    """The older messages the stored summary does not cover yet, when it is time to refresh it (else [])."""
    if len(messages) <= SUMMARY_OVER:
        return []
    older, _ = split_window(messages)
    fresh = [m for m in older if upto is None or str(m["created_at"]) > str(upto)]
    return fresh if len(fresh) >= SUMMARY_STEP or (upto is None and fresh) else []


def chip_problems(label: str) -> list[str]:
    """Why a chip label is not allowed: numbers (amounts, dates) belong to the draft step, which has the facts."""
    problems = []
    if not label.strip():
        problems.append("empty")
    if len(label) > CHIP_MAX:
        problems.append("too long")
    if _NUMBER.search(label):
        problems.append("it contains a number")
    if logic.FORBIDDEN_WORDS.search(label) or logic._THIRD_PERSON.search(label):
        problems.append("it mentions entry information or an assistant")
    return problems


def greets(text: str | None) -> bool:
    """Whether a message opens with a greeting (Hi, Hey, Hello, Good morning ...). Only a first message greets."""
    return bool(text and _GREETING.search(text))


def asks_about_money(text: str | None) -> bool:
    return bool(text and _MONEY_TALK.search(text))


def wrong_species_emoji(text: str, pets: list[dict]) -> str | None:
    """A cat or dog emoji for a species the stay does not have (a cat for two dogs); None when it fits or can't be known."""
    species = {str(p.get("species", "")).lower() for p in pets}
    if not species:
        return None
    for name, pattern in _EMOJI_SPECIES.items():
        if pattern.search(text) and name not in species:
            return name
    return None


_NO_ALLERGY = re.compile(
    r"\b(?:no (?:known |food )?allerg(?:y|ies)|not allergic|(?:doesn't|does not|don't|do not|has no|have no) (?:have )?(?:any )?(?:known )?(?:food )?allerg(?:y|ies)|allergy[- ]free)\b"
    r"(?!\s+(?:beyond|other than|besides|except|apart))",
    re.IGNORECASE,
)


def allergy_denial(text: str, pets: list[dict]) -> str | None:
    """A sentence that says there are no allergies when the facts list some, or when the owner never answered. A sentence
    that names a pet is judged by that pet; one that names none, by every pet. Why it is wrong, or None."""
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        if not _NO_ALLERGY.search(sentence):
            continue
        named = [p for p in pets if p.get("name") and re.search(rf"\b{re.escape(p['name'])}\b", sentence)]
        for pet in named or pets:
            if pet.get("allergies"):
                return f"it says {pet.get('name', 'the pet')} has no allergies, but the facts list {', '.join(pet['allergies'])}"
            if str((pet.get("profile") or {}).get("allergies", "")).startswith("not answered"):
                return "it says there are no allergies, but the owner has not answered that yet"
    return None


def _plain(text: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]+", " ", text.lower()).split())


def repeats(text: str, previous: list[str]) -> bool:
    """Whether a draft says (nearly) what one of the last texts already said: the same words, a close variant, or the
    same long sentence inside a bigger one."""
    now = _plain(text)
    for old in previous[-REPEAT_WINDOW:]:
        before = _plain(old)
        if not now or not before:
            continue
        if now == before or SequenceMatcher(None, now, before).ratio() >= REPEAT_RATIO:
            return True
        short, long_ = sorted((now, before), key=len)
        if len(short.split()) >= 5 and short in long_:
            return True
    return False


def generic_chips(role: str, *, started: bool, can_host: bool | None) -> list[str]:
    """What is offered when the model is down: plain, safe, and the same words every time."""
    if not started:
        return ["Hi, nice to meet you"] if role == "sitter" else ["Hi, I need care for my pets"]
    if role == "sitter":
        return ["Yes, I can host", "Let me check"] if can_host is not False else ["Sorry, those days are full", "Let me check"]
    return ["Thank you!", "I have a question", "Can I request a booking?"]


def fixed_draft(label: str) -> str:
    """The safe text when the model can't pass the checks: the chip's own words, as a sentence."""
    text = label.strip().rstrip(".!")
    return (text[:1].upper() + text[1:] + ".") if text else ""


def chat_problems(text: str, grounding: dict, role: str, sitter_first: str | None = None, known: str = "", greeted: bool = False) -> list[str]:
    """What is wrong with a draft, in words the model can act on. Empty = it passes. `greeted`: I already wrote in this chat."""
    problems: list[str] = []
    if greeted and greets(text):
        problems.append("it greets again, but I already greeted: start with the answer, no Hi or Hey")
    availability = grounding.get("availability") or {}
    can_host = availability.get("can_host", True)
    allowed = logic._money_values(grounding.get("quote")) if can_host else set()
    allowed |= {round(float(v), 2) for v in (grounding.get("rates") or {}).values() if v is not None}
    for match in logic._MONEY.finditer(text):
        amount = round(float(match.group(1).replace(",", "")), 2)
        if amount not in allowed:
            problems.append(f"the amount ${match.group(1)} is not in the facts" if allowed else "it mentions a price, but there is no quote or rate in the facts")
            break
    allowed_dates = logic._allowed_dates(grounding)
    for match in logic._DATE.finditer(text):
        month = logic.MONTHS.index(match.group(1)[:3].title()) + 1
        if (month, int(match.group(2))) not in allowed_dates:
            problems.append(f"the date {match.group(0)} is not in the facts")
            break
    seen = {(int(h), int(m or 0), ap.upper()) for h, m, ap in _CLOCK.findall(known)}
    for h, m, ap in _CLOCK.findall(text):
        if (int(h), int(m or 0), ap.upper()) not in seen:  # a time nobody mentioned is a guess
            problems.append(f"the time {h}{':' + m if m else ''} {ap.upper()} is not in the chat or the facts")
            break
    if _NAME_FIRST.search(text):
        problems.append("it starts with a name and a colon, write the message itself")
    if role == "sitter" and not can_host and logic._SAYS_YES.search(text):
        problems.append("it says I can host, but these dates are not available")
    if role == "sitter" and can_host and not availability.get("unchecked") and _UNAVAILABLE.search(text):
        problems.append("it says I am booked or unavailable, but the facts say I can host these dates")
    if logic._PLACEHOLDER.search(text):
        problems.append("it still contains a placeholder")
    if logic.FORBIDDEN_WORDS.search(text):
        problems.append("it mentions entry or address information")
    if logic._THIRD_PERSON.search(text) or (
        role == "sitter" and sitter_first and re.search(rf"\b{re.escape(sitter_first)}(?:'s)? (is|has|will|can|would|may)\b", text)
    ):
        problems.append("it talks about me in the third person or mentions an assistant, write in the first person")
    denial = allergy_denial(text, grounding.get("pets") or [])
    if denial:
        problems.append(denial)
    wrong = wrong_species_emoji(text, grounding.get("pets") or [])
    if wrong:
        problems.append(f"it has a {wrong} emoji, but the pets are not a {wrong}")
    if not text.strip():
        problems.append("it is empty")
    if len(text) > DRAFT_MAX:
        problems.append("it is too long")
    return problems


def final_quote(messages: list[dict], booking_id: str) -> dict | None:
    """The final quote of a booking: the newest quote card (not replaced) posted after its payment card, with whether a fee
    still waits for the owner's answer. None before there is a payment card or a quote (same rule as the app's footer)."""
    paid_at = next(
        (i for i, m in enumerate(messages) if m.get("kind") == "card" and (m.get("card") or {}).get("type") == "payment" and (m.get("card") or {}).get("booking_id") == booking_id),
        None,
    )
    if paid_at is None:
        return None
    later = [
        m["card"] for m in messages[paid_at + 1 :]
        if m.get("kind") == "card" and (m.get("card") or {}).get("type") == "quote" and m["card"].get("status") != "replaced"
    ]
    if not later:
        return None
    card = later[-1]
    return {"status": card.get("status"), "fee_waiting": any(e.get("status") == "offered" for e in card.get("extras") or [])}


def available_actions(
    role: str,
    booking: dict | None,
    stage: str | None,
    *,
    has_stay: bool,
    priced: bool,
    messages: list[dict],
) -> list[str]:
    """The action ids that are possible for me right now, from the booking as the database computes it (`stage` is
    booking_stage). Mirrors what the app's footer would let me do; the app checks again before it shows a chip."""
    owner = role == "owner"
    live = booking is not None and stage not in (None, "completed", "declined", "cancelled")
    out: list[str] = []
    if not live:
        return ["request_booking"] if owner else (["send_quote"] if has_stay and not priced else [])
    me_agreed = booking.get("owner_agreed_at") if owner else booking.get("sitter_accepted_at")
    mg_status = booking.get("meet_greet_status")
    mine = booking.get("owner_id") if owner else booking.get("sitter_id")
    if stage == "requested" and not owner:
        out.append("interest")
    if stage == "meet_greet" and booking.get("sitter_interest_at"):
        if mg_status == "required":
            out.append("meet_time")
        if mg_status == "proposed" and booking.get("meet_greet_proposed_by") != mine:
            out.append("meet_accept")
        if mg_status in ("required", "proposed", "agreed"):
            out.append("meet_skip")
    if stage == "confirm" and not me_agreed:
        out.append("agree" if owner else "accept")
    if stage == "awaiting_payment":
        final = final_quote(messages, booking["id"])
        if not owner and final is None and any(m.get("kind") == "card" and (m.get("card") or {}).get("type") == "payment" for m in messages):
            out.append("final_quote")
        if owner and final and final["status"] == "sent" and not final["fee_waiting"]:
            out.append("confirm_quote")
        if owner and final and final["status"] == "confirmed":
            out.append("pay")
    if not owner and has_stay and not priced and stage in ("requested", "meet_greet", "confirm"):
        out.append("send_quote")
    return out


def chosen_action(action: str | None, confidence: float | None, available: list[str]) -> dict | None:
    """The model's pick, only if it is one of the possible actions and the model is sure; the label is ours."""
    if not action or action not in available or float(confidence or 0) < ACTION_MIN_CONFIDENCE:
        return None
    return {"id": action, "label": ACTIONS[action]["label"]}


def shown_quote(messages: list[dict]) -> dict | None:
    """The quote the chat shows: the newest quote card that is not replaced, with its total (accepted fees included).
    None when there is no quote card; a price the chat does not show is never worked out from anyone's rates."""
    for m in reversed(messages):
        card = m.get("card") or {}
        if m.get("kind") == "card" and card.get("type") == "quote" and card.get("status") != "replaced" and isinstance(card.get("quote"), dict):
            quote = dict(card["quote"])
            if card.get("total") is not None:
                quote["total"] = card["total"]
            return quote
    return None


def latest_stay(messages: list[dict]) -> dict | None:
    """The newest stay or request card with dates (what the chat is about)."""
    for m in reversed(messages):
        card = m.get("card") or {}
        if m.get("kind") == "card" and card.get("type") in ("stay", "request") and card.get("drop_off_at"):
            return card
    return None


def _instant(value) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def is_priced(messages: list[dict], stay: dict | None) -> bool:
    """A quote that is not replaced already prices the stay on the latest stay or request card."""
    if not stay:
        return False
    drop, pick = _instant(stay.get("drop_off_at")), _instant(stay.get("pick_up_at"))
    return any(
        m.get("kind") == "card"
        and (m.get("card") or {}).get("type") == "quote"
        and m["card"].get("status") != "replaced"
        and _instant(m["card"].get("drop_off_at")) == drop
        and _instant(m["card"].get("pick_up_at")) == pick
        for m in messages
    )
