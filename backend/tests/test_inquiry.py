"""POST /api/ai/inquiry-reply (phase-07B 7B.3 · 7B.4): the facts are gathered by the server, the model only writes,
and every amount / date / voice rule is checked after the fact. The model is mocked; the gathering and checks are real."""

import json
from datetime import datetime
from types import SimpleNamespace

import pytest
from app.ai import inquiry as logic
from app.routers import ai_inquiry
from app.services import authz, nebius, rag

from tests import test_ai_daily_report as daily
from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_media_sign import OWNER_ID, PET_ID, SITTER_ID, owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client

INQ = "00000000-0000-4000-8000-0000000000e1"
OTHER = "00000000-0000-4000-8000-0000000000e9"
QUOTE = {
    "service": "boarding", "nights": 3, "days": 0, "unit_price": 55, "base": 165, "extra_pets": 82.5,
    "holiday_days": [{"day": "2026-10-12", "name": "Thanksgiving"}], "holiday_surcharge": 20.63,
    "total": 268.13, "currency": "CAD", "rate_version": "t",
}
GOOD = "Hi Robert! I'm available for Max from Oct 9 to Oct 12 🐾 The total is $268.13 CAD, including Thanksgiving. Tap **Request booking** to hold these dates."


def schedule_rows(blocked: str | None = None) -> list[dict]:
    rows = []
    for day in ("2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"):
        for slot in ("morning", "afternoon", "overnight"):
            rows.append({"day": day, "slot": slot, "state": "blocked" if day == blocked else "open", "remaining": 2})
    return rows


def make_db(question: str = "Can you give Max his pill at 2 PM?", **extra) -> FakeDB:
    tables = dict(
        inquiries=[{
            "id": INQ, "owner_id": OWNER_ID, "sitter_id": SITTER_ID, "service_type": "boarding",
            "drop_off_at": "2026-10-09T11:30:00+00:00", "pick_up_at": "2026-10-12T21:00:00+00:00",
            "pet_ids": [PET_ID], "status": "open",
        }],
        inquiry_messages=[{"id": "q1", "inquiry_id": INQ, "author": "owner", "body": question, "created_at": "2026-10-07T10:00:00+00:00"}],
        profiles=[{"id": OWNER_ID, "display_name": "Robert"}, {"id": SITTER_ID, "display_name": "Chloe"}],
        sitter_profiles=[{"id": SITTER_ID, "bio": "Cozy home, big backyard", "service_area": "Toronto", "experience_years": 5, "policies": "No dogs over 20 kg."}],
        pets=[
            {"id": PET_ID, "name": "Max", "species": "dog", "breed": "Maltese", "birthdate": "2022-03-01", "weight_kg": 5, "notes": "Pill in a treat"},
            {"id": "other-pet", "name": "Coco", "species": "dog", "breed": None, "birthdate": None, "weight_kg": 30, "notes": "SECRET"},
        ],
        pet_allergies=[{"pet_id": PET_ID, "allergen": "chicken"}, {"pet_id": "other-pet", "allergen": "beef"}],
        pet_cautions=[{"pet_id": PET_ID, "text": "No knocking", "active": True}],
    )
    tables.update(extra)
    return FakeDB(**tables)


class Model:
    """Stands in for nebius.chat_json: one answer per call (a dict for the Draft, or an exception)."""

    def __init__(self, *answers) -> None:
        self.answers = list(answers)
        self.calls: list[dict] = []

    def __call__(self, role, messages, schema, **kwargs):
        self.calls.append({"role": role, "messages": [dict(m) for m in messages], **kwargs})
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        data = {"reply": answer} if isinstance(answer, str) else answer
        return schema.model_validate(data), SimpleNamespace(model="nano", latency_ms=500, text=json.dumps(data))

    @property
    def facts(self) -> dict:
        return json.loads(self.calls[0]["messages"][-1]["content"])


@pytest.fixture
def setup(monkeypatch):
    def _setup(*answers, db=None, blocked=None, quote=QUOTE, hits=None, shortfall=None):
        db = db or make_db()
        model = Model(*(answers or (GOOD,)))
        indexed: list[dict] = []
        searches: list[dict] = []
        capacity_calls: list[dict] = []
        if blocked and shortfall is None:
            # A blocked day has no room in any of its slots (stay_capacity_check, 011c).
            shortfall = ", ".join(f"{blocked} {slot}" for slot in ("morning", "afternoon", "overnight"))

        def rpc(token, fn, params, **kw):
            if fn == "get_sitter_schedule":
                return schedule_rows(blocked)
            if fn == "stay_capacity_check":
                capacity_calls.append(params)
                if isinstance(shortfall, Exception):
                    raise shortfall
                return shortfall
            if fn == "quote_booking":
                if quote is None:
                    raise authz.RpcError(fn, 400, "service_not_offered")
                return quote
            raise AssertionError(fn)

        def search(_db, query, **kw):
            searches.append({"query": query, **kw})
            return hits or []

        monkeypatch.setattr(ai_inquiry, "get_service_client", lambda: db)
        monkeypatch.setattr(ai_inquiry, "_now", lambda: daily.NOW)
        monkeypatch.setattr(authz, "rpc_json", rpc)
        monkeypatch.setattr(rag, "search", search)
        monkeypatch.setattr(rag, "index_source", lambda _db, **kw: indexed.append(kw) or 1)
        monkeypatch.setattr(nebius, "chat_json", model)
        # One grounded call unless a test turns the agent on.
        monkeypatch.setattr(ai_inquiry, "get_settings", lambda: SimpleNamespace(app_timezone="America/Toronto", inquiry_agent="off"))
        monkeypatch.setattr(nebius, "embed", lambda texts, **kw: [[0.1] * 3 for _ in texts])
        return SimpleNamespace(db=db, model=model, indexed=indexed, searches=searches, capacity_calls=capacity_calls)

    return _setup


def post(client, token=None, **body):
    # The sitter by default: they get the whole draft back. The owner gets an acknowledgement only (see below).
    return client.post("/api/ai/inquiry-reply", headers={"Authorization": f"Bearer {token or sitter_token()}"}, json={"inquiry_id": INQ, **body})


def drafts(ctx) -> list[dict]:
    return [m for m in ctx.db.tables["inquiry_messages"] if m["author"] == "ai"]


# --- the happy path ------------------------------------------------------------------------------


def test_a_checked_draft_is_saved_as_the_sitters_private_draft_with_its_facts(client, setup):
    ctx = setup()
    response = post(client)
    assert response.status_code == 200
    body = response.json()
    assert body["body"] == GOOD and body["can_host"] is True and body["quote"]["total"] == 268.13 and body["reused"] is False
    (saved,) = drafts(ctx)
    assert saved["status"] == "draft" and saved["sender_id"] is None and saved["drafted_by_ai"] is True
    assert saved["grounding"]["quote"]["total"] == 268.13 and saved["model"] == "nano"
    call = ctx.model.calls[0]
    assert call["role"] == "fast" and call["endpoint"] == "inquiry-reply" and call["max_tokens"] == 350 and call["timeout"] == 45.0
    assert "first person" in call["messages"][0]["content"]


def test_b_thanksgiving_is_in_the_facts_and_the_total_is_the_servers(client, setup):
    ctx = setup()
    post(client)
    quote = ctx.model.facts["quote"]
    assert quote["holiday_days"] == [{"day": "2026-10-12", "name": "Thanksgiving"}] and quote["total"] == 268.13
    assert ctx.model.facts["inquiry"]["service"] == "boarding" and ctx.model.facts["owner"] == {"first_name": "Robert"}


# --- availability -------------------------------------------------------------------------------------


def test_a_blocked_day_means_no_quote_no_price_and_cannot_host(client, setup):
    ctx = setup("Hi Robert! I can't take Max on Oct 10 — want me to look at other dates?", blocked="2026-10-10")
    body = post(client).json()
    assert body["can_host"] is False and body["quote"] is None
    assert body["availability"]["unavailable_days"] == [{"day": "2026-10-10", "label": "Oct 10", "state": "blocked"}]
    assert ctx.model.facts["quote"] is None and "$" not in body["body"]


def test_availability_is_the_booking_engines_rule_for_this_stay_and_these_pets(client, setup):
    ctx = setup()
    assert post(client).json()["can_host"] is True
    assert ctx.capacity_calls == [{
        "p_sitter": SITTER_ID, "p_drop_off_at": "2026-10-09T11:30:00+00:00",
        "p_pick_up_at": "2026-10-12T21:00:00+00:00", "p_pet_count": 1,
    }]


def test_a_slot_without_room_for_all_the_pets_means_cannot_host_even_when_no_day_is_blocked(client, setup):
    # RV-1: every day reads "open" in the schedule, but one night has a spot for fewer pets than asked.
    ctx = setup("Hi Robert! I can't take Max on Oct 10 — want me to look at other dates?", shortfall="2026-10-10 overnight")
    body = post(client).json()
    assert body["can_host"] is False and body["quote"] is None and "$" not in body["body"]
    assert body["availability"]["unavailable_days"] == [{"day": "2026-10-10", "label": "Oct 10", "state": "no_room"}]
    assert ctx.model.facts["quote"] is None


def test_a_stay_in_no_open_slot_is_unavailable_on_every_day(client, setup):
    setup("Hi Robert! I can't take Max on those days — want me to look at other dates?", shortfall="no_open_slot")
    availability = post(client).json()["availability"]
    assert availability["can_host"] is False and availability["reason"] == "no_open_slot"
    assert [d["label"] for d in availability["unavailable_days"]] == ["Oct 9", "Oct 10", "Oct 11", "Oct 12"]


def test_when_the_capacity_check_fails_nothing_is_promised_and_the_sitter_decides(client, setup):
    ctx = setup(
        "Hi Robert! Thanks for asking about Max — I'll check my calendar and confirm shortly. 🐾",
        shortfall=authz.RpcError("stay_capacity_check", 500, "boom"),
    )
    body = post(client).json()
    assert body["needs_sitter"] is True and body["quote"] is None and "$" not in body["body"]
    assert "availability_note" in ctx.model.facts and ctx.model.facts["quote"] is None
    (saved,) = drafts(ctx)
    assert saved["grounding"]["needs_sitter"] is True


def test_a_price_in_a_draft_for_unavailable_dates_is_rewritten_then_replaced(client, setup):
    ctx = setup("Sure! That's $268.13.", "Still $268.13 for you!", blocked="2026-10-10")
    body = post(client).json()
    assert len(ctx.model.calls) == 2 and body["model"] == "checked-template"
    assert "$" not in body["body"] and "Oct 10" in body["body"] and body["can_host"] is False


# --- the numbers and dates are checked ----------------------------------------------------------------------


def test_c_an_amount_that_is_not_in_the_quote_is_rewritten_once(client, setup):
    ctx = setup("Hi Robert! The total is $300 CAD.", GOOD)
    body = post(client).json()
    assert body["body"] == GOOD and len(ctx.model.calls) == 2
    retry = ctx.model.calls[1]["messages"]
    assert "$300" in retry[-1]["content"] and retry[-2]["role"] == "assistant"


def test_c_a_second_wrong_amount_falls_back_to_the_fixed_text_with_the_real_total(client, setup):
    ctx = setup("Total is $300.", "It is $299 CAD.")
    body = post(client).json()
    assert body["model"] == "checked-template" and "$268.13 CAD" in body["body"] and "$300" not in body["body"]
    assert "Request booking" in body["body"] and body["quote"]["total"] == 268.13
    assert len(drafts(ctx)) == 1


def test_an_item_of_the_quote_may_be_mentioned(client, setup):
    setup("Hi Robert! $55 a night, $20.63 for Thanksgiving, $268.13 CAD total. 🐾")
    assert post(client).json()["model"] == "nano"


def test_a_date_outside_the_stay_is_a_problem(client, setup):
    ctx = setup("Hi Robert! I could do Oct 20 instead.", GOOD)
    assert post(client).json()["body"] == GOOD and len(ctx.model.calls) == 2


def test_h_a_price_placeholder_is_filled_with_the_servers_total(client, setup):
    ctx = setup("Hi {OWNER}! {PET} is welcome Oct 9 to Oct 12. The total is {PRICE}. Tap **Request booking**.")
    body = post(client).json()
    assert body["body"] == "Hi Robert! Max is welcome Oct 9 to Oct 12. The total is $268.13 CAD. Tap **Request booking**."
    assert len(ctx.model.calls) == 1 and body["model"] == "nano"


def test_h_a_date_placeholder_cannot_be_guessed_so_it_is_rewritten_then_replaced(client, setup):
    ctx = setup("Hi Robert! I'm away on {DATE}. Total {PRICE}.", "Still {DATE}. {PRICE}")
    body = post(client).json()
    assert "{DATE}" not in body["body"] and "{PRICE}" not in body["body"]
    assert body["model"] == "checked-template" and len(ctx.model.calls) == 2


def test_h_a_price_placeholder_for_unavailable_dates_is_a_problem(client, setup):
    ctx = setup("Hi Robert! Total {PRICE}.", "Total {PRICE}", blocked="2026-10-10")
    body = post(client).json()
    assert "{PRICE}" not in body["body"] and body["model"] == "checked-template" and len(ctx.model.calls) == 2


# --- voice and honesty ------------------------------------------------------------------------------------------


def test_g_a_third_person_draft_is_rewritten_then_replaced_by_a_first_person_text(client, setup):
    ctx = setup("Hi Robert! Chloe is available for Max, says Chloe's assistant.", "Chloe will confirm the pill time.")
    body = post(client).json()
    assert body["model"] == "checked-template" and "Chloe" not in body["body"] and "assistant" not in body["body"].lower()
    assert "I'll" in body["body"] or "I can" in body["body"] or "Thanks" in body["body"]
    assert len(ctx.model.calls) == 2


def test_i_an_are_you_an_ai_question_never_gets_a_human_claim_and_needs_the_sitter(client, setup):
    ctx = setup(
        "Hi Robert! I'm a real person, promise.",
        {"reply": "Hi Robert! I'll answer that one myself shortly. 🐾", "needs_sitter": True},
        db=make_db("Are you an AI?"),
    )
    body = post(client).json()
    assert body["needs_sitter"] is True and "real person" not in body["body"] and len(ctx.model.calls) == 2


def test_i_even_if_the_model_forgets_the_flag_an_ai_question_needs_the_sitter(client, setup):
    setup(GOOD, db=make_db("is this a bot or a human?"))
    assert post(client).json()["needs_sitter"] is True


@pytest.mark.parametrize("text", ["Are you an AI?", "r u a bot", "Am I talking to a real person?", "Is this automated?"])
def test_the_ai_question_detector(text):
    assert logic.asks_if_ai(text)


@pytest.mark.parametrize("text", ["Can you give Max his pill at 2 PM?", "Do you have a yard?", "Is there a bot-proof fence?"])
def test_the_ai_question_detector_leaves_normal_questions_alone(text):
    assert not logic.asks_if_ai(text)


# --- sources and policy ---------------------------------------------------------------------------------------------


def test_d_a_policy_that_applies_comes_with_its_source_and_the_models_needs_sitter(client, setup):
    hits = [{"content": "No dogs over 20 kg.", "source_type": "sitter_policy", "source_id": SITTER_ID, "similarity": 0.8}]
    ctx = setup({"reply": "Hi Robert! I'll confirm if I can take a dog that size. The total would be $268.13 CAD.", "needs_sitter": True, "used_sources": ["policy-0"]}, hits=hits)
    body = post(client).json()
    assert body["needs_sitter"] is True
    assert body["sources"] == [{"id": "policy-0", "type": "sitter_policy", "label": "From Chloe's policies", "text": "No dogs over 20 kg."}]
    assert ctx.model.facts["policies_and_notes"][0]["text"] == "No dogs over 20 kg."


def test_a_weight_limit_in_the_sitters_policy_is_enforced_by_the_server(client, setup):
    db = make_db()
    db.tables["pets"][0]["weight_kg"] = 25
    ctx = setup({"reply": f"{GOOD} Max is fine!", "needs_sitter": False}, db=db)
    body = post(client).json()
    facts = ctx.model.facts
    assert facts["policy_conflicts"] == [{"pet": "Max", "weight_kg": 25.0, "limit": "No dogs over 20 kg."}]
    assert body["needs_sitter"] is True  # whatever the model says
    assert ctx.db.tables["inquiry_messages"][-1]["grounding"]["policy_conflicts"][0]["pet"] == "Max"


def test_a_pet_under_the_limit_is_not_flagged(client, setup):
    ctx = setup()
    post(client)
    assert "policy_conflicts" not in ctx.model.facts


@pytest.mark.parametrize(
    ("policy", "weight", "flagged"),
    [
        ("No dogs over 20 kg.", 25, True),
        ("No dogs over 20 kg.", 20, False),
        ("I don't take pets above 40 lbs.", 20, True),  # 20 kg ≈ 44 lb
        ("I don't take pets above 40 lbs.", 15, False),
        ("Cancellation: 48 hours notice. Dogs more than 12.5 kg need approval.", 13, True),
        ("No limits, all sizes welcome.", 80, False),
    ],
)
def test_the_weight_limit_parser(policy, weight, flagged):
    assert bool(logic.policy_conflicts(policy, [{"name": "Max", "weight_kg": weight}])) is flagged


def test_a_reply_without_the_total_is_rewritten(client, setup):
    ctx = setup("Hi Robert! I'm available Oct 9 to Oct 12. Tap **Request booking**.", GOOD)
    assert post(client).json()["body"] == GOOD and len(ctx.model.calls) == 2
    assert "268.13" in ctx.model.calls[1]["messages"][-1]["content"]


def test_e_a_life_record_is_a_source(client, setup):
    hits = [{"content": "Takes pills best in a treat.", "source_type": "life_record", "source_id": "lr1", "similarity": 0.9, "pet_id": PET_ID}]
    ctx = setup({"reply": GOOD, "used_sources": ["record-0"]}, hits=hits)
    body = post(client).json()
    assert body["sources"][0]["type"] == "life_record" and body["sources"][0]["label"] == "From Max's Life Record"
    assert drafts(ctx)[0]["grounding"]["sources"][0]["id"] == "record-0"


def test_k_the_search_is_scoped_to_this_sitter_owner_and_pets(client, setup):
    ctx = setup()
    post(client)
    (search,) = ctx.searches
    assert search["sitter_id"] == SITTER_ID and search["owner_id"] == OWNER_ID and search["pet_ids"] == [PET_ID]
    assert "pill" in search["query"]


def test_only_this_inquirys_pets_reach_the_facts(client, setup):
    ctx = setup()
    post(client)
    pets = ctx.model.facts["pets"]
    assert [p["name"] for p in pets] == ["Max"] and pets[0]["allergies"] == ["chicken"] and pets[0]["heads_up"] == ["No knocking"]
    assert "SECRET" not in json.dumps(ctx.model.facts) and "beef" not in json.dumps(ctx.model.facts)


def test_f_the_facts_hold_no_entry_address_or_contact_keys(client, setup):
    ctx = setup()
    post(client)
    logic.assert_no_secrets(ctx.model.facts)  # raises on any forbidden key
    text = json.dumps(ctx.model.facts).lower()
    assert not any(word in text for word in ("lockbox", "buzzer", "home_address", "phone"))
    with pytest.raises(ValueError):
        logic.assert_no_secrets({"pets": [{"name": "Max", "lockbox_code": "1234"}]})
    with pytest.raises(ValueError):
        logic.assert_no_secrets({"owner": {"home_address": "1 Main St"}})


def test_a_draft_that_mentions_entry_info_is_a_problem(client, setup):
    ctx = setup("Hi Robert! Leave the lockbox code with me.", GOOD)
    assert post(client).json()["body"] == GOOD and len(ctx.model.calls) == 2


# --- access, idempotence, regeneration --------------------------------------------------------------------------------


def test_only_the_two_parties_may_ask(client, setup):
    ctx = setup()
    ctx.db.tables["inquiries"][0]["owner_id"] = OTHER
    ctx.db.tables["inquiries"][0]["sitter_id"] = OTHER
    assert post(client).status_code == 403 and ctx.model.calls == []


def test_an_unknown_inquiry_is_a_404(client, setup):
    ctx = setup()
    ctx.db.tables["inquiries"].clear()
    assert post(client).status_code == 404


def test_a_new_owner_message_after_the_reply_gets_a_new_draft_with_the_conversation(client, setup):
    # FB-34: the owner writes again after the sitter answered — a fresh draft, written in context.
    ctx = setup(GOOD, "Hi Robert! Yes, I can give Max his pill at 2 PM — no problem. 🐾")
    first = post(client).json()
    ctx.db.tables["inquiry_messages"] += [
        {"id": "s1", "inquiry_id": INQ, "author": "sitter", "body": GOOD, "status": "sent", "created_at": "2026-10-07T10:05:00+00:00"},
        {"id": "q2", "inquiry_id": INQ, "author": "owner", "body": "Great — and can he sleep on the sofa?", "status": "sent", "created_at": "2099-01-01T00:00:00+00:00"},
    ]
    second = post(client).json()
    assert second["reused"] is False and second["message_id"] != first["message_id"]
    assert len(drafts(ctx)) == 2 and len(ctx.model.calls) == 2
    facts = json.loads(ctx.model.calls[1]["messages"][-1]["content"])
    assert facts["owner_question"] == "Great — and can he sleep on the sofa?"
    assert facts["conversation_so_far"] == [
        {"from": "owner", "text": "Can you give Max his pill at 2 PM?"},
        {"from": "me", "text": GOOD},
    ]
    # A follow-up need not repeat the total (the first answer gave it).
    assert "$" not in second["body"]


def test_asking_twice_makes_one_draft(client, setup):
    ctx = setup()
    first = post(client).json()
    second = post(client).json()
    assert second["reused"] is True and second["message_id"] == first["message_id"] and second["body"] == first["body"]
    assert len(drafts(ctx)) == 1 and len(ctx.model.calls) == 1
    assert second["quote"]["total"] == 268.13


def test_the_sitter_can_ask_for_a_fresh_draft_with_an_intent(client, setup):
    ctx = setup(GOOD, "Hi Robert! Unfortunately I can't this time — want me to look at other dates?")
    post(client)
    response = post(client, sitter_token(), regenerate=True, intent="decline")
    assert response.status_code == 200 and response.json()["reused"] is False
    assert len(drafts(ctx)) == 2 and ctx.model.calls[1]["messages"][-1]["content"].count('"sitter_intent": "decline"') == 1


def test_the_owner_cannot_regenerate_or_steer_the_draft(client, setup):
    setup()
    post(client)
    assert post(client, owner_token(), regenerate=True).status_code == 403
    assert post(client, owner_token(), intent="accept").status_code == 403
    assert post(client, sitter_token(), intent="bogus").status_code == 422


def test_the_owners_question_is_indexed_for_this_pair_only(client, setup):
    ctx = setup()
    post(client)
    assert ctx.indexed == [
        {"source_type": "inquiry", "source_id": "q1", "text": "Can you give Max his pill at 2 PM?", "sitter_id": SITTER_ID, "owner_id": OWNER_ID}
    ]


def test_an_inquiry_without_a_question_is_a_409(client, setup):
    ctx = setup()
    ctx.db.tables["inquiry_messages"].clear()
    assert post(client).status_code == 409


# --- failure -----------------------------------------------------------------------------------------------------------


def test_a_model_outage_still_saves_a_safe_draft_for_the_sitter(client, setup):
    ctx = setup(nebius.AIUnavailable("down"))
    response = post(client)
    assert response.status_code == 200
    body = response.json()
    assert body["needs_sitter"] is True and body["model"] == "failed" and "reply" in body["body"]
    assert "$" not in body["body"] and drafts(ctx)[0]["status"] == "draft"


def test_invalid_model_output_is_handled_like_an_outage(client, setup):
    setup(nebius.AIInvalidOutput("bad json"))
    assert post(client).json()["needs_sitter"] is True


def test_when_the_schedule_cannot_be_read_the_draft_is_the_safe_text(client, setup, monkeypatch):
    ctx = setup()

    def boom(token, fn, params, **kw):
        raise authz.RpcError(fn, 500, "boom")

    monkeypatch.setattr(authz, "rpc_json", boom)
    body = post(client).json()
    assert body["needs_sitter"] is True and ctx.model.calls == [] and "$" not in body["body"]


def test_without_a_quote_the_model_is_told_not_to_name_a_price(client, setup):
    ctx = setup("Hi Robert! I'm available Oct 9 to Oct 12 and I'll send the price shortly.", quote=None)
    body = post(client).json()
    assert body["quote"] is None and "quote_note" in ctx.model.facts and "$" not in body["body"]


# --- the sitter's voice (7B.8) and what a draft teaches (7B.9) --------------------------------------------------


def test_the_sitters_style_card_is_in_the_draft_prompt(client, setup):
    db = make_db()
    db.tables["sitter_profiles"][0]["style_card"] = "Calm and precise. No emojis."
    ctx = setup(db=db)
    post(client)
    system = ctx.model.calls[0]["messages"][0]["content"]
    assert "Style notes for this sitter: Calm and precise. No emojis." in system


def test_without_a_style_card_the_default_style_is_used(client, setup):
    ctx = setup()
    post(client)
    assert "Friendly, plain and brief" in ctx.model.calls[0]["messages"][0]["content"]


def test_a_discarded_draft_is_kept_as_a_negative_signal_anonymized(client, setup):
    ctx = setup(GOOD, "Hi Robert! Different take: $268.13 CAD for Max.")
    post(client)
    post(client, sitter_token(), regenerate=True)
    (sample,) = ctx.db.tables["tone_samples"]
    assert sample["source"] == "regenerated" and sample["final_text"] == "" and sample["edit_ratio"] is None
    assert "Robert" not in sample["draft"] and "$268.13" not in sample["draft"] and "{PRICE}" in sample["draft"]


def test_an_are_you_an_ai_question_also_tells_the_sitter_directly(client, setup):
    ctx = setup(GOOD, db=make_db("Are you an AI?"))
    post(client)
    notices = [n for n in ctx.db.tables["notifications"] if n["type"] == "inquiry_needs_you"]
    assert len(notices) == 1 and notices[0]["user_id"] == SITTER_ID and notices[0]["ref_id"] == INQ
    assert "reply yourself" in notices[0]["title"]


def test_a_normal_question_sends_no_extra_notice(client, setup):
    ctx = setup()
    post(client)
    assert not ctx.db.tables.get("notifications")


# --- the owner never receives the draft (D36) ---------------------------------------------------------------------------


def test_the_owner_who_asks_gets_an_acknowledgement_and_no_draft_content(client, setup):
    ctx = setup()
    body = post(client, owner_token()).json()
    assert body["body"] is None and body["quote"] is None and body["availability"] is None and body["sources"] == []
    assert body["message_id"] and body["needs_sitter"] is None and body["model"] == ""
    (saved,) = drafts(ctx)
    assert saved["status"] == "draft" and "$268.13" in saved["body"]
    again = post(client, owner_token()).json()  # the idempotent path is redacted too
    assert again["reused"] is True and again["body"] is None and again["quote"] is None
    assert len(drafts(ctx)) == 1


# --- auto-send at a human pace (7B.10) -----------------------------------------------------------------------------------


def auto_db(**profile) -> FakeDB:
    db = make_db()
    db.tables["sitter_profiles"][0].update({"ai_reply_mode": "auto", "ai_consent_at": "2026-10-01T00:00:00+00:00", **profile})
    return db


def sitter_messages(ctx) -> list[dict]:
    return [m for m in ctx.db.tables["inquiry_messages"] if m["author"] == "sitter"]


def test_in_auto_mode_the_reply_is_scheduled_not_shown_and_the_owner_notice_waits(client, setup):
    ctx = setup(db=auto_db())
    body = post(client, owner_token()).json()
    (reply,) = sitter_messages(ctx)
    assert reply["status"] == "sent" and reply["drafted_by_ai"] is True and reply["sender_id"] == SITTER_ID
    assert reply["confirmed_by_sitter_at"] is None  # nobody approved it: never a style sample
    assert reply["grounding"]["quote"]["total"] == 268.13 and "needs_sitter" not in reply["grounding"]
    # It appears later: 15–40 s from "now" (test clock), and the owner's inquiry carries just the two times.
    now = daily.NOW
    visible = datetime.fromisoformat(reply["visible_at"])
    assert 15 <= (visible - now).total_seconds() <= 40
    inquiry = ctx.db.tables["inquiries"][0]
    assert inquiry["reply_visible_at"] == reply["visible_at"] and 0 < (datetime.fromisoformat(inquiry["reply_typing_at"]) - now).total_seconds() < 15
    assert body["auto_scheduled_at"] == reply["visible_at"] and body["body"] is None
    (notice,) = [n for n in ctx.db.tables["notifications"] if n["type"] == "inquiry_replied"]
    assert notice["user_id"] == OWNER_ID and notice["visible_at"] == reply["visible_at"] and notice["ref_id"] == INQ


@pytest.mark.parametrize(
    "case",
    ["manual", "no_consent", "policy_conflict", "model_failed", "checked_template", "sitter_calls", "regenerate"],
)
def test_auto_send_stays_out_of_the_way_when_the_sitter_must_decide(client, setup, case):
    db = auto_db()
    answers = [GOOD]
    caller, extra = owner_token(), {}
    if case == "manual":
        db.tables["sitter_profiles"][0]["ai_reply_mode"] = "manual"
    elif case == "no_consent":
        db.tables["sitter_profiles"][0]["ai_consent_at"] = None
    elif case == "policy_conflict":
        db.tables["pets"][0]["weight_kg"] = 25
    elif case == "model_failed":
        answers = [nebius.AIUnavailable("down")]
    elif case == "checked_template":
        answers = ["Total $300.", "Still $300."]
    elif case == "sitter_calls":
        caller = sitter_token()
    elif case == "regenerate":
        caller, extra = sitter_token(), {"regenerate": True}
        answers = [GOOD, GOOD]
    ctx = setup(*answers, db=db)
    if case == "regenerate":
        post(client, sitter_token())  # the first draft (the sitter asked, so no auto-send)
    post(client, caller, **extra)
    assert sitter_messages(ctx) == [] and "inquiry_replied" not in [n["type"] for n in ctx.db.tables.get("notifications", [])]
    assert "reply_visible_at" not in ctx.db.tables["inquiries"][0]


def test_an_are_you_an_ai_question_is_never_auto_answered(client, setup):
    db = auto_db()
    db.tables["inquiry_messages"][0]["body"] = "Are you an AI?"
    ctx = setup(db=db)
    post(client, owner_token())
    assert sitter_messages(ctx) == []


@pytest.mark.parametrize(("chars", "total"), [(0, 15), (100, 16), (300, 28), (2000, 40)])
def test_the_default_human_delay_aims_at_about_thirty_seconds(chars, total):
    typing, visible = logic.human_delay("x" * chars)
    assert typing == 4 and visible == total
