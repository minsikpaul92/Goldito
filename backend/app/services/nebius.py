"""Nebius Token Factory client (phase-07 7.1, architecture §9).

One code path for every model: Token Factory speaks the OpenAI Chat Completions API, so the
`openai` SDK is pointed at the role's base URL with the role's model id (settings, from env).

Findings from the live check (2026-10-04):
- Reasoning: Nemotron models think by default (the thinking arrives in a separate `reasoning`
  field, but it costs time). `extra_body={"chat_template_kwargs": {"enable_thinking": False}}`
  turns it off — Super answers in ~0.25 s instead of ~0.8 s. Pass `reasoning=True` to keep it
  (the Phase 08 safety step). The MiniCPM vision model gets no such flag.
- `response_format={"type": "json_object"}` works on Nano and Super; `chat_json` still extracts the
  first `{…}` block and validates it, because a model may wrap or pad its answer.
- Streaming works, so TTFT (first content token) is measured; when streaming is refused the call
  falls back to a plain request and TTFT is null.
"""

import json
import logging
import re
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI
from pydantic import BaseModel, ValidationError

from app.config import get_settings

Role = Literal["fast", "report", "safety", "vision"]

logger = logging.getLogger("goldito.ai")

DEFAULT_TIMEOUT_S = 45.0
EMBED_BATCH = 16


class AIUnavailable(RuntimeError):
    """The model could not be reached or refused the call (not configured, network, upstream error)."""


class AIInvalidOutput(RuntimeError):
    """The model answered, but not with JSON that fits the schema — even after one correction."""


@dataclass(frozen=True)
class ChatResult:
    text: str
    model: str
    latency_ms: int
    ttft_ms: int | None
    prompt_tokens: int | None
    completion_tokens: int | None


def _role_config(role: Role) -> tuple[str, str]:
    s = get_settings()
    return {
        "fast": (s.model_fast, s.model_fast_base_url),
        "report": (s.model_report, s.model_report_base_url),
        "safety": (s.model_safety, s.model_safety_base_url),
        "vision": (s.model_vision, s.model_vision_base_url),
    }[role]


@lru_cache
def _client(base_url: str) -> OpenAI:
    """One client per base URL (the regions differ)."""
    key = get_settings().nebius_api_key
    if not key:
        raise AIUnavailable("NEBIUS_API_KEY is not set.")
    return OpenAI(base_url=base_url, api_key=key, max_retries=0)


_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)


def strip_think(text: str) -> str:
    """Drop `<think>…</think>` blocks (and an unclosed leading one) some models put in the answer."""
    text = _THINK.sub("", text)
    if "<think>" in text:
        text = text.split("<think>", 1)[0]
    return text.strip()


def _log_call(**fields: Any) -> None:
    """One structured line per call (§9): numbers only — never the prompt, the answer or an image."""
    logger.info("ai_call %s", json.dumps(fields, separators=(",", ":")))


def _bad_request(exc: Exception) -> bool:
    return isinstance(exc, APIStatusError) and exc.status_code in (400, 422)


def chat(
    role: Role,
    messages: list[dict[str, Any]],
    *,
    endpoint: str = "",
    reasoning: bool = False,
    json_mode: bool = False,
    max_tokens: int = 800,
    temperature: float = 0.2,
    timeout: float = DEFAULT_TIMEOUT_S,
    _retried: bool = False,
) -> ChatResult:
    """One chat completion. Returns the answer text (think blocks removed) plus the call's numbers."""
    model, base_url = _role_config(role)
    client = _client(base_url)

    kwargs: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "timeout": timeout,
    }
    if role != "vision":
        kwargs["extra_body"] = {"chat_template_kwargs": {"enable_thinking": reasoning}}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    started = time.perf_counter()
    ttft_ms: int | None = None
    text = ""
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    ok = False
    try:
        try:
            stream = client.chat.completions.create(
                stream=True, stream_options={"include_usage": True}, **kwargs
            )
            parts: list[str] = []
            for chunk in stream:
                if chunk.usage is not None:
                    prompt_tokens = chunk.usage.prompt_tokens
                    completion_tokens = chunk.usage.completion_tokens
                if not chunk.choices:
                    continue
                piece = chunk.choices[0].delta.content
                if piece:
                    if ttft_ms is None:
                        ttft_ms = int((time.perf_counter() - started) * 1000)
                    parts.append(piece)
            text = "".join(parts)
        except Exception as exc:  # noqa: BLE001
            if not _bad_request(exc):
                raise
            # Streaming (or JSON mode) refused for this model: ask again without it.
            kwargs.pop("response_format", None)
            response = client.chat.completions.create(**kwargs)
            ttft_ms = None
            text = response.choices[0].message.content or ""
            if response.usage is not None:
                prompt_tokens = response.usage.prompt_tokens
                completion_tokens = response.usage.completion_tokens
        ok = True
    except (APIConnectionError, APITimeoutError) as exc:
        raise AIUnavailable("Could not reach the model.") from exc
    except APIStatusError as exc:
        raise AIUnavailable(f"The model refused the request ({exc.status_code}).") from exc
    finally:
        _log_call(
            role=role,
            model=model,
            endpoint=endpoint,
            ttft_ms=ttft_ms,
            latency_ms=int((time.perf_counter() - started) * 1000),
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            retried=_retried,
            ok=ok,
        )

    return ChatResult(
        text=strip_think(text),
        model=model,
        latency_ms=int((time.perf_counter() - started) * 1000),
        ttft_ms=ttft_ms,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class ToolReply:
    """One assistant turn when tools are offered: either the answer (`content`) or tools to run (`tool_calls`)."""

    content: str
    tool_calls: list[ToolCall]
    model: str
    latency_ms: int

    def as_message(self) -> dict[str, Any]:
        """The assistant turn to append before the tool results (OpenAI chat format)."""
        message: dict[str, Any] = {"role": "assistant", "content": self.content or None}
        if self.tool_calls:
            message["tool_calls"] = [
                {"id": c.id, "type": "function", "function": {"name": c.name, "arguments": json.dumps(c.arguments)}}
                for c in self.tool_calls
            ]
        return message


def chat_tools(
    role: Role,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    *,
    endpoint: str = "",
    max_tokens: int = 400,
    temperature: float = 0.2,
    timeout: float = 30.0,
) -> ToolReply:
    """One non-streaming completion with tools (Nemotron tool calling works on Token Factory, 2026-10-07)."""
    model, base_url = _role_config(role)
    client = _client(base_url)
    started = time.perf_counter()
    ok = False
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            max_tokens=max_tokens,
            temperature=temperature,
            timeout=timeout,
            extra_body={"chat_template_kwargs": {"enable_thinking": False}},
        )
        message = response.choices[0].message
        calls: list[ToolCall] = []
        for call in message.tool_calls or []:
            try:
                arguments = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                arguments = {}
            calls.append(ToolCall(call.id, call.function.name, arguments if isinstance(arguments, dict) else {}))
        if response.usage is not None:
            prompt_tokens, completion_tokens = response.usage.prompt_tokens, response.usage.completion_tokens
        ok = True
    except (APIConnectionError, APITimeoutError) as exc:
        raise AIUnavailable("Could not reach the model.") from exc
    except APIStatusError as exc:
        raise AIUnavailable(f"The model refused the request ({exc.status_code}).") from exc
    finally:
        _log_call(
            role=role,
            model=model,
            endpoint=endpoint,
            ttft_ms=None,
            latency_ms=int((time.perf_counter() - started) * 1000),
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            retried=False,
            ok=ok,
        )
    return ToolReply(
        content=strip_think(message.content or ""),
        tool_calls=calls,
        model=model,
        latency_ms=int((time.perf_counter() - started) * 1000),
    )


def extract_json(text: str) -> Any:
    """The first balanced `{…}` block of `text`, parsed. Raises ValueError when there is none."""
    start = text.find("{")
    while start != -1:
        depth, in_str, escaped = 0, False, False
        for i in range(start, len(text)):
            ch = text[i]
            if in_str:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == '"':
                    in_str = False
            elif ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start : i + 1])
                    except json.JSONDecodeError:
                        break
        start = text.find("{", start + 1)
    raise ValueError("no JSON object in the answer")


def chat_json[T: BaseModel](
    role: Role,
    messages: list[dict[str, Any]],
    schema: type[T],
    *,
    endpoint: str = "",
    **kwargs: Any,
) -> tuple[T, ChatResult]:
    """Ask for JSON that fits `schema`. One correction retry, then `AIInvalidOutput`."""
    result = chat(role, messages, endpoint=endpoint, json_mode=True, **kwargs)
    try:
        return schema.model_validate(extract_json(result.text)), result
    except (ValueError, ValidationError):
        pass

    retry_messages = [
        *messages,
        {"role": "assistant", "content": result.text},
        {
            "role": "user",
            "content": "Return only valid JSON matching the schema — no explanation, no code fence.",
        },
    ]
    retry = chat(role, retry_messages, endpoint=endpoint, json_mode=True, _retried=True, **kwargs)
    try:
        return schema.model_validate(extract_json(retry.text)), retry
    except (ValueError, ValidationError) as exc:
        raise AIInvalidOutput("The model did not return valid JSON.") from exc


def embed(texts: list[str], *, endpoint: str = "embed") -> list[list[float]]:
    """Embeddings for RAG (D33): `MODEL_EMBED` at `MODEL_EMBED_DIM` dimensions, batches of ≤ 16."""
    s = get_settings()
    client = _client(s.model_embed_base_url)
    vectors: list[list[float]] = []
    for i in range(0, len(texts), EMBED_BATCH):
        batch = texts[i : i + EMBED_BATCH]
        started = time.perf_counter()
        ok = False
        tokens: int | None = None
        try:
            response = client.embeddings.create(
                model=s.model_embed, input=batch, dimensions=s.model_embed_dim, timeout=DEFAULT_TIMEOUT_S
            )
            vectors.extend(list(item.embedding) for item in sorted(response.data, key=lambda d: d.index))
            tokens = response.usage.prompt_tokens if response.usage else None
            ok = True
        except (APIConnectionError, APITimeoutError) as exc:
            raise AIUnavailable("Could not reach the embedding model.") from exc
        except APIStatusError as exc:
            raise AIUnavailable(f"The embedding model refused the request ({exc.status_code}).") from exc
        finally:
            _log_call(
                role="embed",
                model=s.model_embed,
                endpoint=endpoint,
                ttft_ms=None,
                latency_ms=int((time.perf_counter() - started) * 1000),
                prompt_tokens=tokens,
                completion_tokens=None,
                retried=False,
                ok=ok,
            )
    return vectors
