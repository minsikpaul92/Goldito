"""Where the booking is, in words the chat AI can act on (D62): what is done, what I can do now, who is waiting for whom.

The database knows the stage (`booking_stage`) and whose turn it is (`booking_next_actor`, D60); the app's footer knows which
buttons are possible (`chat.available_actions`). This only turns them into one small object, so the model stops asking for
what is settled and picks what comes next. It never decides anything: a person still presses every button.
"""

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
) -> dict:
    """`{step, step_label, turn, now, waiting_for, done, later}`. `turn` is who has to act next in the booking ("me",
    "them", "both" or "nobody"), `now` what I can do right now (first person, the same words as the chips' actions), `done`
    and `later` the steps either side of this one. A closed booking (declined or cancelled) is `{step: "closed"}`."""
    mine = any(m.get("kind") == "text" and m.get("sender_id") == me_id for m in messages)
    theirs = any(m.get("kind") == "text" and m.get("sender_id") != me_id for m in messages)
    if booking is None:
        step = "decide" if mine and theirs else "hello"
    else:
        step = _STAGE_STEP.get(stage or "", "closed")
    if step == "closed":
        return {"step": "closed", "step_label": "The booking is closed", "turn": "nobody", "now": [], "waiting_for": None, "done": [], "later": []}

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
    return {"step": step, "step_label": LABEL[step], "turn": turn, "now": now, "waiting_for": waiting, "done": done, "later": later}
