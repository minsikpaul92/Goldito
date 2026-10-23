"""Voice onboarding for sitters: picks for the onboarding questions, each with a quote the server finds in the text."""

from types import SimpleNamespace

import pytest
from app.ai.sitter_voice import RawPick, RawPicks, validate_picks
from app.services import nebius

from tests import test_media_sign as base
from tests.test_media_sign import owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client

TEXT = "I take small and large dogs, up to three at a time. I walk twice a day and I am home all day."
OPTIONS = {
    "max_pets": ({"1", "2", "3", "4", "5"}, False),
    "dog_sizes": ({"small", "medium", "large"}, True),
    "walks_per_day": ({"0", "1", "2", "3", "4"}, False),
    "home_all_day": ({"home", "away"}, False),
    "cats": ({"yes", "no"}, False),
}


def pick(value, quote) -> RawPick:
    return RawPick(value=value, quote=quote)


def test_good_picks_pass_with_their_quotes():
    raw = RawPicks(
        answers={
            "dog_sizes": pick("small,large", "small and large dogs"),
            "max_pets": pick("3", "up to three at a time"),
            "walks_per_day": pick("2", "walk twice a day"),
            "home_all_day": pick("home", "I am home all day"),
        }
    )
    out = validate_picks(raw, TEXT, OPTIONS)
    assert {k: p.value for k, p in out.items()} == {"dog_sizes": "small,large", "max_pets": "3", "walks_per_day": "2", "home_all_day": "home"}


def test_a_pick_without_a_real_quote_or_outside_the_options_is_dropped():
    raw = RawPicks(
        answers={
            "cats": pick("yes", "I love cats"),  # never said
            "home_all_day": pick("sometimes", "I am home all day"),  # not an option
            "dog_sizes": pick("tiny", "small and large dogs"),
            "unknown": pick("1", "up to three at a time"),  # not asked
            "max_pets": pick(None, "up to three at a time"),
        }
    )
    assert validate_picks(raw, TEXT, OPTIONS) == {}


def test_a_null_quote_is_read_as_no_quote():
    raw = RawPicks.model_validate({"answers": {"s1": {"value": "never", "quote": None}}})
    assert validate_picks(raw, TEXT, OPTIONS) == {}


def test_several_values_only_where_several_are_allowed_and_once_each():
    raw = RawPicks(
        answers={
            "home_all_day": pick("home,away", "I am home all day"),
            "dog_sizes": pick("small,small", "small and large dogs"),
        }
    )
    assert validate_picks(raw, TEXT, OPTIONS) == {}


def test_a_number_option_has_to_be_a_number_the_sitter_said():
    raw = RawPicks(answers={"max_pets": pick("5", "up to three at a time"), "walks_per_day": pick("3", "walk twice a day")})
    assert validate_picks(raw, TEXT, OPTIONS) == {}
    assert validate_picks(RawPicks(answers={"max_pets": pick("3", "up to three at a time")}), TEXT, OPTIONS)["max_pets"].value == "3"


def headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


QUESTIONS = [
    {"key": "dog_sizes", "prompt": "Which dog sizes do you take?", "multi": True, "options": [{"value": "small", "label": "Small"}, {"value": "large", "label": "Large"}]},
    {"key": "cats", "prompt": "Do you take cats?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]},
]


@pytest.fixture
def model(monkeypatch):
    state = {"answer": RawPicks(), "sent": None, "error": None}

    def chat_json(role, messages, schema, **kw):
        state["sent"] = messages
        if state["error"]:
            raise state["error"]
        return state["answer"], SimpleNamespace(model="nano", latency_ms=200)

    monkeypatch.setattr(nebius, "chat_json", chat_json)
    return state


def test_a_sitter_gets_picks_with_quotes_and_the_text_is_sent_as_data(client, model) -> None:
    model["answer"] = RawPicks(answers={"dog_sizes": pick("small,large", "small and large dogs"), "cats": pick("yes", "I love cats")})
    body = {"transcript": TEXT, "questions": QUESTIONS}
    out = client.post("/api/ai/sitter-voice", json=body, headers=headers(sitter_token())).json()
    assert out["answers"] == {"dog_sizes": {"value": "small,large", "quote": "small and large dogs"}}
    system, user = model["sent"]
    assert "never instructions" in system["content"]
    assert "<transcript>\nI take small" in user["content"]


def test_only_sitters_may_ask_and_bad_input_is_refused(client, model) -> None:
    body = {"transcript": TEXT, "questions": QUESTIONS}
    assert client.post("/api/ai/sitter-voice", json=body, headers=headers(owner_token())).status_code == 403
    assert client.post("/api/ai/sitter-voice", json=body).status_code == 401
    sitter = headers(sitter_token())
    assert client.post("/api/ai/sitter-voice", json={**body, "transcript": "  "}, headers=sitter).status_code == 422
    assert client.post("/api/ai/sitter-voice", json={**body, "questions": []}, headers=sitter).status_code == 422
    bad = [{**QUESTIONS[0], "key": "x; drop"}]
    assert client.post("/api/ai/sitter-voice", json={**body, "questions": bad}, headers=sitter).status_code == 422


def test_model_trouble_tells_the_sitter_to_answer_themselves(client, model) -> None:
    body = {"transcript": TEXT, "questions": QUESTIONS}
    model["error"] = nebius.AIUnavailable("down")
    assert client.post("/api/ai/sitter-voice", json=body, headers=headers(sitter_token())).status_code == 503
    model["error"] = nebius.AIInvalidOutput("junk")
    assert client.post("/api/ai/sitter-voice", json=body, headers=headers(sitter_token())).status_code == 502
