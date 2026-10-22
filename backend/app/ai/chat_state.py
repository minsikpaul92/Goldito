"""Where the booking is, in words the chat AI can act on (D62): what is done, what I can do now, who is waiting for whom.

The database knows the stage (`booking_stage`) and whose turn it is (`booking_next_actor`, D60); the app's footer knows which
buttons are possible (`chat.available_actions`). This only turns them into one small object, so the model stops asking for
what is settled and picks what comes next. It never decides anything: a person still presses every button.
"""

import re
from datetime import UTC, datetime

from app.ai.chat import ACTIONS

STEPS = ("hello", "decide", "meet_greet", "agree", "pay", "handoff", "care", "done")
LABEL = {
    "hello": "Say hello",
    "decide": "Talk and decide whether to book",
    "meet_greet": "Meet & Greet",
    "agree": "Both say yes to the booking",
    "pay": "Final quote and payment",
    "handoff": "Drop-off",
    "care": "The stay",
    "done": "Pick-up and review",
}
_STAGE_STEP = {
    "requested": "decide",
    "meet_greet": "meet_greet",
    "confirm": "agree",
    "awaiting_payment": "pay",
    "paid": "handoff",
    "in_care": "care",
    "completed": "done",
}
# What a step leaves behind once it is over.
_DONE = {
    "hello": "Said hello",
    "decide": "Booking requested",
    "meet_greet": "Meet & Greet done",
    "agree": "Both said yes to the booking",
    "pay": "Paid",
    "handoff": "Pets handed over",
    "care": "The stay is over",
}
# What I am waiting for from the other person, by step and by my side (only when it is their turn).
_WAITING = {
    ("decide", "owner"): "the sitter's answer to my booking request",
    ("meet_greet", "owner"): "their answer about the Meet & Greet",
    ("meet_greet", "sitter"): "their answer about the Meet & Greet",
    ("agree", "owner"): "the sitter's yes to the booking",
    ("agree", "sitter"): "the owner's yes to the booking",
    ("pay", "owner"): "the sitter's final quote",
    ("pay", "sitter"): "the owner's payment",
}
_HANDOFF_NOW = {
    "owner": "Arrange when I bring my pets to the sitter's home",
    "sitter": "Be ready to receive the pets when the owner brings them",
}
_CARE_NOW = {
    "owner": "Nothing to do but read the sitter's updates and photos",
    "sitter": "Look after the pets and share photos and the daily report with the owner",
}


# What to talk about at each step and what not to, by step and side (a missing side falls back to "both"). The model reads it as
# `progress.guide`: the steer a good sitter or owner would give themselves ("now we plan the drop-off, not the price").
GUIDE: dict[tuple[str, str], dict[str, str]] = {
    ("hello", "owner"): {"talk_about": "say hello, which pets need care and when", "avoid": "prices, long lists of needs"},
    ("hello", "sitter"): {"talk_about": "greet them by name, say who I am, say if I can host these dates", "avoid": "prices before they ask"},
    ("decide", "owner"): {
        "talk_about": "what I still want to know: routine, allergies, medication; when I am ready, request the booking or ask for a quote",
        "avoid": "drop-off details, thanking again",
    },
    ("decide", "sitter"): {
        "talk_about": "answer from the facts, ask about the pets' routine, offer a quote or to meet first",
        "avoid": "holding dates before I say yes to meeting",
    },
    ("meet_greet", "both"): {
        "talk_about": "a time and place for the Meet & Greet, what to bring, what to ask in person",
        "avoid": "the price and the dates again, the drop-off",
    },
    ("agree", "both"): {"talk_about": "last questions, then yes to the booking", "avoid": "planning the Meet & Greet again"},
    ("pay", "owner"): {"talk_about": "the final quote and paying it", "avoid": "new prices, the dates again"},
    ("pay", "sitter"): {"talk_about": "the final quote and any question about it", "avoid": "new prices, the dates again"},
    ("handoff", "owner"): {
        "talk_about": "when and where I bring the pets, what I pack (food, medication, the checklist)",
        "avoid": "payment, quotes, the Meet & Greet",
    },
    ("handoff", "sitter"): {"talk_about": "the drop-off time and place, what to bring", "avoid": "payment, quotes, the Meet & Greet"},
    ("care", "owner"): {
        "talk_about": "a short thanks, a photo or how the pets are; the pick-up time near the end",
        "avoid": "the drop-off, payment, thanking again and again",
    },
    ("care", "sitter"): {"talk_about": "how the pets are doing, a photo, the pick-up time near the end", "avoid": "booking steps, the drop-off, payment"},
    ("closed", "both"): {"talk_about": "a polite goodbye", "avoid": "booking steps"},
}
# After the stay (the sitter pressed Returned) the talk has three phases, told apart from what was typed since the return:
#   closing:       nobody on my side has said the closing words yet (thanks for the stay, a pleasure, welcome back)
#   after_closing: I closed; now a check-in (how have you been, how is Max) or a look back at the stay
#   chat:          a check-in was made by either side; no more closings or check-ins, only the talk that follows (for the
#                  sitter it leads to the next booking, so the owner remembers me)
DONE_GUIDE: dict[tuple[str, str], dict[str, str]] = {
    ("closing", "owner"): {
        "talk_about": "thank the sitter for looking after the pets and say I will book again, or ask how they have been",
        "avoid": "new plans, logistics, care questions, greetings, asking for a quote",
    },
    ("closing", "sitter"): {
        "talk_about": "thank them, say it was a pleasure having the pets and they are welcome back, or ask how the pets are doing",
        "avoid": "new plans, logistics, care questions, greetings, asking for a quote",
    },
    ("after_closing", "owner"): {
        "talk_about": "ask how the sitter has been, share how the pets are doing, a memory of the stay or a photo",
        "avoid": "thanking for the stay again, booking logistics",
    },
    ("after_closing", "sitter"): {
        "talk_about": "ask how the pets and the owner have been, a happy memory of the stay (only from the facts), a gentle hint that I would love to host again",
        "avoid": "thanking again, prices, dates",
    },
    ("chat", "owner"): {
        "talk_about": "keep chatting: answer, share news about the pets, mention plans when it fits",
        "avoid": "closing thanks, asking how they are again, quotes unless I have a trip",
    },
    ("chat", "sitter"): {
        "talk_about": "keep chatting about the pets and the owner's news; when it fits ask about upcoming trips and say I would love to look after the pets again, so the owner remembers me",
        "avoid": "closing thanks, asking how they are again, pushing prices or dates",
    },
}
CLOSING_CHIPS = {"owner": ["Thanks for everything!", "I'll book again"], "sitter": ["It was a pleasure!", "Welcome back anytime!"]}
# The fallback chips when a chat after the check-in has no good model chips.
CHAT_FALLBACK_CHIPS = {"owner": ["Good to hear!", "We'll be in touch"], "sitter": ["Any trips coming up?", "Happy to help again"]}

_CLOSING_WORDS = re.compile(r"\b(thank(?:s| you)|pleasure|welcome back|book (?:you )?again|grateful|loved having|had a great time)\b", re.IGNORECASE)
_CHECKIN = re.compile(
    r"\bhow (?:are|have) you\b|\bhow (?:have )?things\b|\bhow(?:'s| is| are) (?:everything|it going|things)\b|\bhope you(?:'re| are)\b"
    r"|\bhow(?:'s| is| are| was| were| has| have) [^.?!]{0,30}\b(?:doing|been)\b",
    re.IGNORECASE,
)


def _instant(value) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def is_checkin(text: str, pet_names: list[str]) -> bool:
    """A "how have you been" or "how is Max doing" line."""
    names = "|".join(re.escape(n) for n in pet_names if n)
    return bool(_CHECKIN.search(text) or (names and re.search(rf"\bhow(?:'s| is| are| was| were) (?:{names}|he|she|they)\b", text, re.IGNORECASE)))


def is_closing(text: str) -> bool:
    return bool(_CLOSING_WORDS.search(text))


def done_phase(messages: list[dict], me_id: str, returned_at: str | None, pet_names: list[str]) -> str:
    """closing, after_closing or chat, from the texts written since the pets came home (all texts when that time is unknown)."""
    since = _instant(returned_at) if returned_at else None
    after = [
        m for m in messages
        if m.get("kind") == "text" and (since is None or ((at := _instant(m.get("created_at"))) is not None and at > since))
    ]
    if any(is_checkin(str(m.get("body") or ""), pet_names) for m in after):
        return "chat"
    if any(m.get("sender_id") == me_id and is_closing(str(m.get("body") or "")) for m in after):
        return "after_closing"
    return "closing"


def checkin_chips(role: str, pet_names: list[str]) -> list[str]:
    """The check-in chips (labels only; the draft words them). The sitter asks after the pets by name."""
    if role == "owner":
        return ["How have you been?"]
    names = [n for n in pet_names if n][:2]
    pets = (f"How is {names[0]} doing?" if len(names) == 1 else f"How are {names[0]} and {names[1]}?") if names else "How are the pets?"
    return [pets if len(pets) <= 36 else "How are the pets?", "How have you been?"]


def done_chips(role: str, phase: str, model_labels: list[str], pet_names: list[str]) -> list[str]:
    """The chips after the stay. closing: the closing words and one check-in. after_closing: the check-in and a look back at
    the stay (the model's). chat: the model's chips minus any closing or check-in, so it never closes or checks in twice."""
    if phase == "closing":
        return [*CLOSING_CHIPS[role], checkin_chips(role, pet_names)[0]]
    free = [c for c in model_labels if not is_closing(c) and not is_checkin(c, pet_names)]
    if phase == "after_closing":
        return [*checkin_chips(role, pet_names), *free][:3]
    return free[:3] if len(free) >= 2 else list(CHAT_FALLBACK_CHIPS[role])


def guide(step: str, role: str, phase: str | None = None) -> dict[str, str]:
    if step == "done":
        return DONE_GUIDE[(phase or "closing", role)]
    return GUIDE.get((step, role)) or GUIDE.get((step, "both")) or {}


def progress(
    role: str,
    messages: list[dict],
    me_id: str,
    booking: dict | None,
    stage: str | None,
    next_actor: str | None,
    available: list[str],
    *,
    has_stay: bool,
    priced: bool,
    done_phase: str | None = None,
) -> dict:
    """`{step, step_label, turn, now, waiting_for, done, later, guide}`. `turn` is who has to act next in the booking ("me",
    "them", "both" or "nobody"), `now` what I can do right now (first person, the same words as the chips' actions), `done`
    and `later` the steps either side of this one. A closed booking (declined or cancelled) is `{step: "closed"}`."""
    mine = any(m.get("kind") == "text" and m.get("sender_id") == me_id for m in messages)
    theirs = any(m.get("kind") == "text" and m.get("sender_id") != me_id for m in messages)
    if booking is None:
        step = "decide" if mine and theirs else "hello"
    else:
        step = _STAGE_STEP.get(stage or "", "closed")
    if step == "closed":
        return {"step": "closed", "step_label": "The booking is closed", "turn": "nobody", "now": [], "waiting_for": None, "done": [], "later": [], "guide": guide("closed", role)}

    no_meet = booking is not None and booking.get("meet_greet_status") == "not_needed"
    order = [s for s in STEPS if not (s == "meet_greet" and no_meet)]
    at = order.index(step)
    done = [_DONE[s] for s in order[:at]]
    if booking is not None and booking.get("meet_greet_status") == "skipped":
        done = ["Meet & Greet skipped" if d == _DONE["meet_greet"] else d for d in done]
    if has_stay and step in ("hello", "decide"):
        done.append("Stay dates shared")
    if priced and step != "done":
        done.append("A quote was sent")
    later = [LABEL[s] for s in order[at + 1 :]]

    turn = "nobody"
    if next_actor in ("owner", "sitter"):
        turn = "me" if next_actor == role else "them"
    elif next_actor == "both":
        turn = "both"

    now = [ACTIONS[a]["meaning"] for a in available if a in ACTIONS]
    waiting = _WAITING.get((step, role)) if turn == "them" else None
    if step == "hello":
        now, waiting = (["Say hello and who I am"], None) if not mine else ([], "their reply to my hello")
    elif step == "handoff":
        now.append(_HANDOFF_NOW[role])
    elif step == "care":
        now.append(_CARE_NOW[role])
    return {"step": step, "step_label": LABEL[step], "turn": turn, "now": now, "waiting_for": waiting, "done": done, "later": later, "guide": guide(step, role, done_phase), **({"phase": done_phase or "closing"} if step == "done" else {})}


# --- what is left to talk about --------------------------------------------------------------------------------------


def _pets(facts: dict) -> list[dict]:
    return facts.get("pets") or []


def _has_medication(facts: dict) -> bool:
    for pet in _pets(facts):
        if any(t.get("type") == "medication" for t in pet.get("checklist", [])):
            return True
        if "daily medication" in " ".join((pet.get("profile") or {}).get("safety", [])) or re.search(r"\b(pill|medic)", str(pet.get("owner_notes", "")), re.I):
            return True
    return False


def _is_sensitive(facts: dict) -> bool:
    return any(
        pet.get("heads_up") or (pet.get("profile") or {}).get("personality", {}).get("Sensitivity") in ("Sensitive", "Very sensitive")
        for pet in _pets(facts)
    )


# id, label the model reads, what a message must say to cover it, whether it matters for these pets, and the last step it is
# still worth raising in. Safety first. Only subjects the facts can answer: the app knows no vet, so there is no vet topic
# (the model made up clinics for it).
TOPICS = (
    ("allergies", "food allergies", r"allerg", lambda f: True, "handoff"),
    ("medication", "medication", r"\b(pills?|medic\w*|doses?|tablets?|apoquel)\b", _has_medication, "handoff"),
    ("feeding", "meals and treats", r"\b(feed\w*|food|meals?|breakfast|dinner|treats?|kibble)\b", lambda f: True, "handoff"),
    ("walks", "walks and play", r"\b(walks?|walking|park|exercise|play\w*)\b", lambda f: any(p.get("species") == "dog" for p in _pets(f)), "handoff"),
    ("litter", "the litter box", r"\blitter\b", lambda f: any(p.get("species") == "cat" for p in _pets(f)), "handoff"),
    ("stress", "what stresses them", r"\b(noises?|nervous|anxious|scared|stress\w*|thunder|fireworks)\b", _is_sensitive, "handoff"),
    ("updates", "photo updates", r"\b(photos?|pics?|pictures?|updates?)\b", lambda f: True, "care"),
    ("drop_off", "the drop-off", r"\bdrop[- ]?off\b", lambda f: True, "handoff"),
    ("pick_up", "the pick-up", r"\bpick[- ]?up\b", lambda f: True, "care"),
)
MAX_OPEN = 5


def topics(messages: list[dict], me_id: str, facts: dict, step: str) -> dict | None:
    """What has and has not come up yet, from what was typed (cards do not count). A topic is covered once two texts or one
    text from each side mention it, and it is only raised while it still matters (the pet's needs before the drop-off, the
    updates and the pick-up until the stay is over). None before hello and after the stay: nothing is left to steer."""
    if step in ("hello", "done", "closed"):
        return None
    texts = [(m.get("sender_id") == me_id, str(m.get("body") or "")) for m in messages if m.get("kind") == "text"]
    open_: list[str] = []
    covered: list[str] = []
    for _id, label, pattern, relevant, until in TOPICS:
        if STEPS.index(step) > STEPS.index(until) or not relevant(facts):
            continue
        hits = [mine for mine, body in texts if re.search(pattern, body, re.IGNORECASE)]
        (covered if len(hits) >= 2 or {True, False} <= set(hits) else open_).append(label)
    return {"open": open_[:MAX_OPEN], "covered": covered}
