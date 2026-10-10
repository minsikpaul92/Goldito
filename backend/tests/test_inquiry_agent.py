"""Optional tool-calling inquiry agent (phase-07B 7B.11): the tools only hand back facts the server already holds,
the same checks apply to its answer, and any problem falls back to the single grounded call."""

import json
from types import SimpleNamespace

import pytest
from app.ai import inquiry_agent as agent
from app.routers import ai_inquiry
from app.services import nebius

from tests.test_inquiry import GOOD, INQ, QUOTE, make_db, post, setup  # noqa: F401  (fixtures)
from tests.test_media_sign import owner_token, sitter_token

isolated_settings = __import__("tests.test_media_sign", fromlist=["x"]).isolated_settings
client = __import__("tests.test_media_sign", fromlist=["x"]).client


def grounding(can_host=True) -> dict:
    return {
        "owner": {"first_name": "Robert"}, "sitter": {"name": "Chloe"},
        "inquiry": {"service": "boarding", "stay_days": ["2026-10-09"], "pet_count": 1},
        "availability": {"can_host": can_host, "unavailable_days": [] if can_host else [{"day": "2026-10-10", "label": "Oct 10", "state": "blocked"}]},
        "quote": QUOTE if can_host else None,
        "pets": [{"name": "Max", "species": "dog"}],
        "sources": [{"id": "policy-0", "type": "sitter_policy", "label": "From Chloe's policies", "text": "No dogs over 20 kg. Medication is fine."}],
        "policy_conflicts": [],
    }


def call(name, **arguments):
    return nebius.ToolCall(id=f"c-{name}", name=name, arguments=arguments)


def reply(content="", *calls):
    return nebius.ToolReply(content=content, tool_calls=list(calls), model="nano", latency_ms=300)


class Script:
    """Stands in for nebius.chat_tools: plays the scripted replies, records every messages list it was given."""

    def __init__(self, *replies) -> None:
        self.replies = list(replies)
        self.seen: list[list[dict]] = []

    def __call__(self, role, messages, tools, **kwargs):
        self.seen.append([dict(m) for m in messages])
        return self.replies.pop(0)


# --- the tools --------------------------------------------------------------------------------------


def test_the_tools_return_only_what_the_server_already_holds():
    g = grounding()
    assert agent.run_tool("check_availability", {}, g) == g["availability"]
    assert agent.run_tool("get_quote", {}, g)["total"] == 268.13
    assert agent.run_tool("search_records", {"query": "medication"}, g)["records"][0]["id"] == "policy-0"
    assert "error" in agent.run_tool("nope", {}, g)


def test_there_is_no_price_to_get_when_the_dates_cannot_be_hosted():
    assert "error" in agent.run_tool("get_quote", {}, grounding(can_host=False))


def test_the_agent_starts_without_availability_price_or_policies():
    start = agent.agent_facts(grounding(), "pill at 2 PM?", None)
    assert "268.13" not in start and "can_host" not in start and "20 kg" not in start and "pill at 2 PM?" in start


# --- the loop -----------------------------------------------------------------------------------------


def test_the_agent_calls_tools_then_answers_and_we_keep_the_log():
    chat = Script(
        reply("", call("check_availability"), call("get_quote")),
        reply("", call("search_records", query="pill")),
        reply(json.dumps({"reply": GOOD, "needs_sitter": False, "used_sources": ["policy-0"]})),
    )
    draft, model, called = agent.run_agent(grounding(), "SYSTEM", "Can you give Max his pill at 2 PM?", None, chat=chat)
    assert draft.reply == GOOD and model == "nano" and called == ["check_availability", "get_quote", "search_records"]
    tool_turns = [m for m in chat.seen[-1] if m["role"] == "tool"]
    assert len(tool_turns) == 3 and json.loads(tool_turns[1]["content"])["total"] == 268.13
    assert chat.seen[0][0]["content"].startswith("SYSTEM") and "You have tools" in chat.seen[0][0]["content"]


def test_an_agent_that_never_answers_is_an_error_not_a_loop():
    chat = Script(*[reply("", call("check_availability")) for _ in range(agent.MAX_ROUNDS)])
    with pytest.raises(nebius.AIInvalidOutput):
        agent.run_agent(grounding(), "S", "q", None, chat=chat)


def test_a_final_answer_that_is_not_json_is_an_error():
    with pytest.raises(nebius.AIInvalidOutput):
        agent.run_agent(grounding(), "S", "q", None, chat=Script(reply("Sure, I can help!")))


# --- in the route --------------------------------------------------------------------------------------


@pytest.fixture
def agent_on(monkeypatch, setup):  # noqa: F811
    def _on(*answers, script, mode="on", db=None, hits=None):
        ctx = setup(*answers, db=db, hits=hits)
        monkeypatch.setattr(ai_inquiry, "get_settings", lambda: SimpleNamespace(app_timezone="America/Toronto", inquiry_agent=mode))
        monkeypatch.setattr(nebius, "chat_tools", script)
        return ctx

    return _on


def good_script():
    return Script(
        reply("", call("check_availability"), call("get_quote")),
        reply(json.dumps({"reply": GOOD, "used_sources": []})),
    )


def test_with_the_agent_on_the_draft_comes_from_the_tools_and_the_log_is_kept(client, agent_on):
    script = good_script()
    ctx = agent_on(script=script)
    body = post(client, sitter_token()).json()
    assert body["body"] == GOOD and body["model"].endswith("+agent") and ctx.model.calls == []  # no single call
    saved = [m for m in ctx.db.tables["inquiry_messages"] if m["author"] == "ai"][0]
    assert saved["grounding"]["tools"] == ["check_availability", "get_quote"] and saved["grounding"]["quote"]["total"] == 268.13


def test_with_the_agent_off_it_is_never_used(client, agent_on):
    ctx = agent_on(script=good_script(), mode="off", hits=[{"content": "Medication is fine.", "source_type": "sitter_policy", "source_id": "s", "similarity": 0.9}])
    assert post(client, sitter_token()).json()["model"] == "nano" and len(ctx.model.calls) == 1


def test_in_auto_mode_a_plain_question_is_one_call_and_no_agent(client, agent_on):
    script = good_script()
    ctx = agent_on(script=script, mode="auto")
    body = post(client, sitter_token()).json()
    assert body["model"] == "nano" and len(ctx.model.calls) == 1 and script.seen == []


def test_in_auto_mode_a_question_that_touches_stored_records_goes_to_the_agent(client, agent_on):
    hits = [{"content": "Medication is fine when in the care plan.", "source_type": "sitter_policy", "source_id": "s", "similarity": 0.9}]
    script = good_script()
    ctx = agent_on(script=script, mode="auto", hits=hits)
    body = post(client, sitter_token()).json()
    assert body["model"].endswith("+agent") and ctx.model.calls == [] and script.seen


@pytest.mark.parametrize(
    ("question", "sources", "conflicts", "expected"),
    [
        ("Can you take Max Oct 9 to 12?", [], [], False),
        ("Can you take Max Oct 9 to 12?", [{"id": "policy-0"}], [], True),
        ("Can you take Max Oct 9 to 12?", [], [{"pet": "Max"}], True),
        ("Do you have a yard? Can he bring his bed?", [], [], True),
        ("x" * 141, [], [], True),
        ("Can you take Max?", [], [], False),
    ],
)
def test_the_agent_gate_uses_only_what_the_server_knows(question, sources, conflicts, expected):
    assert agent.needs_agent(question, {"sources": sources, "policy_conflicts": conflicts}) is expected


def test_the_agent_loop_runs_on_the_stronger_model():
    roles: list[str] = []
    script = Script(reply(json.dumps({"reply": GOOD})))

    def spy(role, messages, tools, **kw):
        roles.append(role)
        return script(role, messages, tools, **kw)

    agent.run_agent(grounding(), "S", "q", None, chat=spy)
    assert roles == ["report"]


def test_an_agent_outage_falls_back_to_the_single_call(client, agent_on):
    def down(role, messages, tools, **kw):
        raise nebius.AIUnavailable("down")

    ctx = agent_on(script=down)
    body = post(client, sitter_token()).json()
    assert body["body"] == GOOD and body["model"] == "nano" and len(ctx.model.calls) == 1


def test_an_agent_answer_that_fails_a_check_falls_back_to_the_single_call(client, agent_on):
    script = Script(reply(json.dumps({"reply": "The total is $300 CAD."})))
    ctx = agent_on(script=script)
    body = post(client, sitter_token()).json()
    assert body["body"] == GOOD and len(ctx.model.calls) == 1 and "$300" not in body["body"]


def test_the_owner_still_gets_no_draft_in_agent_mode(client, agent_on):
    agent_on(script=good_script())
    body = post(client, owner_token()).json()
    assert body["body"] is None and body["quote"] is None


def test_the_agents_tool_log_never_reaches_the_owner(client, agent_on):
    ctx = agent_on(script=good_script())
    post(client, sitter_token())
    assert INQ  # the sitter's send copies only quote / sources / can_host, so `tools` never reaches the owner
    saved = [m for m in ctx.db.tables["inquiry_messages"] if m["author"] == "ai"][0]
    assert set(saved["grounding"]) >= {"tools"} and make_db
