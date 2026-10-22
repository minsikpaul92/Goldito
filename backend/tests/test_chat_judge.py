"""The chat draft's judge (app/ai/chat_judge.py): one cheap call whose failure never blocks a draft. The model is mocked."""

import json
from types import SimpleNamespace

import pytest
from app.ai import chat_judge
from app.services import nebius

PAYLOAD = {"role": "sitter", "state": "reply", "chip": "Let me check", "recent": [{"who": "them", "text": "Hi"}], "facts": {"pets": []}, "style_notes": "warm"}


def answer(monkeypatch, outcome):
    """nebius.chat answers with `outcome` (a dict is the JSON text, a string is raw text, an exception is raised)."""
    calls: list[dict] = []

    def chat(role, messages, **kwargs):
        calls.append({"role": role, "messages": messages, **kwargs})
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(text=outcome if isinstance(outcome, str) else json.dumps(outcome))

    monkeypatch.setattr(nebius, "chat", chat)
    return calls


def test_a_fitting_draft_has_no_issues(monkeypatch):
    calls = answer(monkeypatch, {"ok": True, "issues": []})
    assert chat_judge.check(PAYLOAD, "Sure, I will check.") == []
    call = calls[0]
    assert call["role"] == "report" and call["json_mode"] and call["timeout"] == chat_judge.TIMEOUT_S
    assert not call.get("reasoning")  # no thinking: one fast call
    sent = json.loads(call["messages"][-1]["content"])
    assert sent["draft"] == "Sure, I will check." and sent["chip"] == "Let me check" and "style_notes" not in sent


def test_the_issues_are_kept_short_and_capped(monkeypatch):
    answer(monkeypatch, {"ok": False, "issues": ["  remove   the park ", "", "x" * 500, "b", "c"]})
    issues = chat_judge.check(PAYLOAD, "text")
    assert issues[0] == "remove the park" and len(issues) == chat_judge.MAX_ISSUES and len(issues[1]) == chat_judge.ISSUE_MAX


def test_a_no_without_a_reason_still_rejects(monkeypatch):
    answer(monkeypatch, {"ok": False, "issues": []})
    assert chat_judge.check(PAYLOAD, "text") == ["it does not fit the conversation"]


@pytest.mark.parametrize("outcome", [nebius.AIUnavailable("slow"), "no json here", '{"ok": "maybe-not", "issues": 3}'])
def test_a_judge_that_is_down_slow_or_unreadable_is_skipped(monkeypatch, outcome):
    answer(monkeypatch, outcome)
    assert chat_judge.check(PAYLOAD, "text") is None
