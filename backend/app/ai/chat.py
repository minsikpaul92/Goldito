"""The chat AI's rules (phase-03D 3D.5, #142, D62): chips and one short draft, never sent by the model.

The model only picks and words. What is true (availability, dates, prices) comes from the database and is checked
here after the fact, like the inquiry draft's checks, so a chip or draft can never carry an invented amount or date.
"""

import re
from datetime import datetime

from app.ai import inquiry as logic

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
_NAME_FIRST = re.compile(r"^\s*[A-Z][a-z]+:\s")
_UNAVAILABLE = re.compile(r"\b(?:i(?:'m| am)|we(?:'re| are)|already|fully)\s+booked\b|\bfully booked\b|\bno room\b|\bunavailable\b", re.IGNORECASE)


def _clip(text: str, n: int = 240) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= n else text[: n - 1] + "…"


def _when(iso: str, tz) -> str:
    moment = datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(tz)
    return f"{logic.MONTHS[moment.month - 1]} {moment.day} {moment.strftime('%-I:%M %p')}"


def describe(message: dict, me_id: str, tz) -> dict | None:
    """One message for the prompt: who said it and what (cards in square brackets). Empty cards are left out."""
    who = "me" if message.get("sender_id") == me_id else "them"
    if message.get("kind") == "text":
        return {"who": who, "text": _clip(message.get("body") or "")}
    card = message.get("card") or {}
    pets = ", ".join(p.get("name", "") for p in card.get("pets", []))
    if card.get("type") == "stay" and card.get("drop_off_at") and card.get("pick_up_at"):
        return {"who": who, "text": f"[Stay {_when(card['drop_off_at'], tz)} to {_when(card['pick_up_at'], tz)}, {pets}]"}
    if card.get("type") == "request" and card.get("drop_off_at") and card.get("pick_up_at"):
        note = f" Note: {_clip(card['note'], 160)}" if card.get("note") else ""
        return {"who": who, "text": f"[Booking request {_when(card['drop_off_at'], tz)} to {_when(card['pick_up_at'], tz)}, {pets}.{note}]"}
    return None


def transcript(messages: list[dict], me_id: str, tz) -> list[dict]:
    return [d for d in (describe(m, me_id, tz) for m in messages) if d]


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


def chat_problems(text: str, grounding: dict, role: str, sitter_first: str | None = None, known: str = "") -> list[str]:
    """What is wrong with a draft, in words the model can act on. Empty = it passes."""
    problems: list[str] = []
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
