"""Where the booking is for the chat AI (app/ai/chat_state.py): the database's stage and next actor, in words."""

from app.ai import chat_state as cs

OWNER, SITTER = "o", "s"


def texts(*senders):
    return [{"kind": "text", "sender_id": s, "body": "x"} for s in senders]


def run(role="owner", messages=None, booking=None, stage=None, next_actor=None, available=(), **kw):
    me = OWNER if role == "owner" else SITTER
    return cs.progress(role, messages if messages is not None else texts(OWNER, SITTER), me, booking, stage, next_actor, list(available), has_stay=kw.get("has_stay", True), priced=kw.get("priced", False))


def test_before_anyone_has_said_hello_the_step_is_hello():
    assert run("sitter", texts(OWNER))["now"] == ["Say hello and who I am"]
    out = run("owner", texts(OWNER))
    assert out["step"] == "hello" and out["now"] == [] and out["waiting_for"] == "their reply to my hello"


def test_once_both_spoke_with_no_booking_the_owner_can_request_and_the_sitter_can_quote():
    owner = run("owner", available=["request_booking"])
    assert owner["step"] == "decide" and owner["done"] == ["Said hello", "Stay dates shared"]
    assert "ask the sitter to take the stay" in owner["now"][0]
    assert "later" in owner and owner["later"][0] == "Meet & Greet"
    sitter = run("sitter", available=["send_quote"])
    assert "price the stay" in sitter["now"][0]


def test_a_requested_booking_waits_for_the_sitter_and_each_side_reads_its_own_turn():
    booking = {"meet_greet_status": "required"}
    owner = run("owner", booking=booking, stage="requested", next_actor="sitter")
    assert owner["turn"] == "them" and owner["waiting_for"] == "the sitter's answer to my booking request" and owner["done"][0] == "Said hello"
    sitter = run("sitter", booking=booking, stage="requested", next_actor="sitter", available=["interest"])
    assert sitter["turn"] == "me" and sitter["waiting_for"] is None and "meeting first" in sitter["now"][0]


def test_meet_greet_agree_pay_each_name_what_is_done_and_what_is_next():
    booking = {"meet_greet_status": "done"}
    agree = run("owner", booking=booking, stage="confirm", next_actor="sitter", available=[])
    assert agree["step"] == "agree" and "Meet & Greet done" in agree["done"] and agree["waiting_for"] == "the sitter's yes to the booking"
    pay = run("owner", booking={"meet_greet_status": "done"}, stage="awaiting_payment", next_actor="owner", available=["pay"], priced=True)
    assert pay["step"] == "pay" and pay["turn"] == "me" and "Both said yes to the booking" in pay["done"] and "A quote was sent" in pay["done"]
    assert pay["later"] == ["Drop-off", "The stay", "Pick-up and review"]


def test_a_repeat_pair_has_no_meet_and_greet_step_and_a_skipped_one_says_skipped():
    repeat = run("owner", booking={"meet_greet_status": "not_needed"}, stage="paid")
    assert "Meet & Greet" not in repeat["later"] and not any("Meet" in d for d in repeat["done"])
    skipped = run("owner", booking={"meet_greet_status": "skipped"}, stage="awaiting_payment", next_actor="owner")
    assert "Meet & Greet skipped" in skipped["done"]


def test_after_payment_the_owner_arranges_the_drop_off_and_the_sitter_gets_ready():
    owner = run("owner", booking={"meet_greet_status": "done"}, stage="paid")
    sitter = run("sitter", booking={"meet_greet_status": "done"}, stage="paid")
    assert owner["step"] == "handoff" and "bring my pets" in owner["now"][0]
    assert "receive the pets" in sitter["now"][0] and owner["turn"] == sitter["turn"] == "nobody"


def test_in_care_and_a_closed_booking():
    assert run("owner", booking={}, stage="in_care")["step"] == "care"
    closed = run("owner", booking={}, stage="cancelled")
    assert closed["step"] == "closed" and closed["now"] == [] and closed["later"] == []


# --- topics ----------------------------------------------------------------------------------------------------------

DOG_FACTS = {"pets": [{"name": "Max", "species": "dog", "allergies": ["chicken"], "profile": {"safety": ["daily medication"]}, "checklist": [{"type": "medication"}]}]}
CAT_FACTS = {"pets": [{"name": "Luna", "species": "cat"}]}


def said(*pairs):
    return [{"kind": "text", "sender_id": who, "body": body} for who, body in pairs]


def test_topics_are_open_until_two_texts_or_both_sides_mention_them():
    messages = said((OWNER, "Max is allergic to chicken."), (SITTER, "Thanks, I will note the allergy."), (OWNER, "He takes a pill at 8."))
    out = cs.topics(messages, OWNER, DOG_FACTS, "decide")
    assert "food allergies" in out["covered"] and "medication" not in out["covered"]  # one mention is not settled
    assert out["open"][0] == "medication" and "walks and play" in out["open"]
    assert "the litter box" not in out["open"] + out["covered"]  # a dog has none


def test_topics_depend_on_the_pets_and_are_capped_safety_first():
    out = cs.topics([], OWNER, CAT_FACTS, "decide")
    assert out["open"][:2] == ["food allergies", "meals and treats"] and "the litter box" in out["open"] and len(out["open"]) == cs.MAX_OPEN
    assert "medication" not in out["open"] and "walks and play" not in out["open"]


def test_no_topics_before_hello_after_the_stay_or_when_the_booking_is_closed():
    for step in ("hello", "done", "closed"):
        assert cs.topics([], OWNER, DOG_FACTS, step) is None


def test_topics_stop_mattering_as_the_booking_moves_on():
    handoff = cs.topics([], OWNER, DOG_FACTS, "handoff")
    assert handoff["open"][0] == "food allergies"
    care = cs.topics([], OWNER, DOG_FACTS, "care")
    assert care["open"] == ["photo updates", "the pick-up"] and care["covered"] == []  # the pet's needs were for before the drop-off
