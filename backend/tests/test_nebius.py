"""Nebius client (phase-07 7.1): roles, reasoning flag, streaming + TTFT, JSON rules, embed batching."""

import json
import logging
from types import SimpleNamespace

import httpx
import openai
import pytest
from app.config import get_settings
from app.services import nebius
from pydantic import BaseModel


class Plan(BaseModel):
    title: str
    n: int


def chunk(text=None, usage=None):
    delta = SimpleNamespace(content=text)
    return SimpleNamespace(choices=[SimpleNamespace(delta=delta)] if text is not None else [], usage=usage)


def usage(p=11, c=7):
    return SimpleNamespace(prompt_tokens=p, completion_tokens=c)


class FakeCompletions:
    """Plays back scripted answers; records every call's kwargs."""

    def __init__(self, answers):
        self.answers = list(answers)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        if kwargs.get("stream"):
            return iter([chunk(answer[: len(answer) // 2]), chunk(answer[len(answer) // 2 :]), chunk(None, usage())])
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=answer))], usage=usage()
        )


class FakeEmbeddings:
    def __init__(self):
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        data = [SimpleNamespace(index=i, embedding=[float(i)] * 3) for i in range(len(kwargs["input"]))]
        return SimpleNamespace(data=list(reversed(data)), usage=SimpleNamespace(prompt_tokens=5))


def install(monkeypatch, *answers):
    completions = FakeCompletions(answers)
    embeddings = FakeEmbeddings()
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions), embeddings=embeddings)
    monkeypatch.setattr(nebius, "_client", lambda base_url: client)
    return completions, embeddings


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    monkeypatch.setenv("NEBIUS_API_KEY", "test-key")
    monkeypatch.setenv("MODEL_REPORT", "nvidia/report-model")
    monkeypatch.setenv("MODEL_FAST", "nvidia/fast-model")
    monkeypatch.setenv("MODEL_VISION", "openbmb/vision-model")
    get_settings.cache_clear()
    nebius._client.cache_clear()
    yield
    get_settings.cache_clear()


def bad_request():
    request = httpx.Request("POST", "https://x")
    return openai.BadRequestError("nope", response=httpx.Response(400, request=request), body=None)


def test_strip_think_removes_blocks_and_an_unclosed_one():
    assert nebius.strip_think("<think>hmm</think>\nHello") == "Hello"
    assert nebius.strip_think("Hello <think>never closed") == "Hello"


def test_chat_uses_the_role_model_and_turns_reasoning_off(monkeypatch):
    completions, _ = install(monkeypatch, "hello there")
    result = nebius.chat("report", [{"role": "user", "content": "hi"}], endpoint="t")
    call = completions.calls[0]
    assert call["model"] == "nvidia/report-model"
    assert call["extra_body"] == {"chat_template_kwargs": {"enable_thinking": False}}
    assert result.text == "hello there"
    assert result.ttft_ms is not None
    assert (result.prompt_tokens, result.completion_tokens) == (11, 7)


def test_reasoning_can_be_kept_on_and_vision_gets_no_flag(monkeypatch):
    completions, _ = install(monkeypatch, "a", "b")
    nebius.chat("report", [], reasoning=True)
    nebius.chat("vision", [])
    assert completions.calls[0]["extra_body"] == {"chat_template_kwargs": {"enable_thinking": True}}
    assert "extra_body" not in completions.calls[1]
    assert completions.calls[1]["model"] == "openbmb/vision-model"


def test_streaming_refused_falls_back_to_a_plain_call(monkeypatch):
    completions, _ = install(monkeypatch, bad_request(), "plain answer")
    result = nebius.chat("fast", [])
    assert result.text == "plain answer"
    assert result.ttft_ms is None
    assert completions.calls[0]["stream"] is True and "stream" not in completions.calls[1]


def test_the_metrics_line_has_numbers_and_never_the_text(monkeypatch, caplog):
    install(monkeypatch, "SECRET ANSWER")
    with caplog.at_level(logging.INFO, logger="goldito.ai"):
        nebius.chat("fast", [{"role": "user", "content": "SECRET PROMPT"}], endpoint="care-plan")
    line = next(r.getMessage() for r in caplog.records if "ai_call" in r.getMessage())
    fields = json.loads(line.split("ai_call ", 1)[1])
    assert fields["role"] == "fast" and fields["endpoint"] == "care-plan" and fields["ok"] is True
    assert {"ttft_ms", "latency_ms", "prompt_tokens", "completion_tokens", "retried"} <= set(fields)
    assert "SECRET" not in line


def test_missing_key_is_unavailable(monkeypatch):
    monkeypatch.delenv("NEBIUS_API_KEY", raising=False)
    monkeypatch.setenv("NEBIUS_API_KEY", "")
    get_settings.cache_clear()
    with pytest.raises(nebius.AIUnavailable):
        nebius.chat("fast", [])


def test_network_errors_are_unavailable(monkeypatch):
    install(monkeypatch, openai.APIConnectionError(request=httpx.Request("POST", "https://x")))
    with pytest.raises(nebius.AIUnavailable):
        nebius.chat("fast", [])


def test_chat_json_extracts_the_object_from_a_noisy_answer(monkeypatch):
    install(monkeypatch, 'Sure!\n```json\n{"title": "Walk {the dog}", "n": 2}\n```')
    plan, _ = nebius.chat_json("fast", [], Plan)
    assert plan == Plan(title="Walk {the dog}", n=2)


def test_chat_json_retries_once_with_a_correction_then_succeeds(monkeypatch):
    completions, _ = install(monkeypatch, "not json at all", '{"title": "ok", "n": 1}')
    plan, result = nebius.chat_json("fast", [{"role": "user", "content": "x"}], Plan)
    assert plan.n == 1 and result.text.startswith("{")
    retry_messages = completions.calls[1]["messages"]
    assert retry_messages[-1]["content"].startswith("Return only valid JSON")
    assert completions.calls[0]["response_format"] == {"type": "json_object"}


def test_chat_json_gives_up_after_one_retry(monkeypatch):
    completions, _ = install(monkeypatch, '{"title": 1}', "still wrong")
    with pytest.raises(nebius.AIInvalidOutput):
        nebius.chat_json("fast", [], Plan)
    assert len(completions.calls) == 2


def test_embed_batches_sixteen_at_a_time_and_keeps_order(monkeypatch):
    _, embeddings = install(monkeypatch)
    vectors = nebius.embed([f"t{i}" for i in range(20)])
    assert [len(c["input"]) for c in embeddings.calls] == [16, 4]
    assert embeddings.calls[0]["dimensions"] == 1024
    assert len(vectors) == 20 and vectors[3] == [3.0, 3.0, 3.0]


def test_load_prompt_stays_inside_the_prompts_folder():
    from app.ai.prompts import load_prompt

    with pytest.raises(ValueError):
        load_prompt("../../config.py")
