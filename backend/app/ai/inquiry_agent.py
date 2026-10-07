"""Inquiry reply by a tool-calling agent (phase-07B 7B.11, D46) — optional, behind `INQUIRY_AGENT`.

The model chooses which facts it needs by calling three tools; the tools are thin wrappers over what the server has
already gathered (availability, the quote, the sitter's records), so a tool can never return anything the one-call path
would not have had. Everything after the model is unchanged: the same checks on the final text (D29 numbers, D31 entry
info, D35 voice) — and when anything is off (a tool error, a bad answer, a failed check) the caller falls back to the
single grounded call.
"""

import json
import logging
from collections.abc import Callable

from app.ai import inquiry as logic
from app.services import nebius

log = logging.getLogger("pawddy.ai")

MAX_ROUNDS = 4
TIMEOUT_S = 25.0

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "check_availability",
            "description": "Is the sitter free for this inquiry's stay? Returns can_host and any days they cannot take.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_quote",
            "description": "The price of this stay from the server (total, per-night rate, extra pet, holiday surcharge). "
            "Only exists when the sitter is available.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_records",
            "description": "Search the sitter's own policies and the pets' records and earlier messages for what answers the question.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "What to look for, in a few words."}},
                "required": ["query"],
            },
        },
    },
]

AGENT_NOTE = (
    "\n\nYou have tools. Before you answer, call check_availability (always), get_quote (when the sitter can host) and "
    "search_records (for anything about policies, the home or the pets). The JSON you get only has the trip, the pets and the "
    "question — availability, price and policies come only from the tools. When you have what you need, answer with the JSON object."
)


LONG_QUESTION = 140


def needs_agent(question: str, grounding: dict) -> bool:
    """Is this inquiry worth the agent's extra rounds? Decided from what the server already knows — no model call.

    Yes when the question touches stored knowledge (RAG found policies / records / earlier messages), when a house
    rule may rule the pet out, or when it asks several things at once. A plain "can you take Max Oct 9–12?" is one
    grounded call: the facts are already complete, and the agent would only add latency.
    """
    if grounding["sources"] or grounding["policy_conflicts"]:
        return True
    return len(question) > LONG_QUESTION or question.count("?") >= 2


def run_tool(name: str, arguments: dict, grounding: dict) -> dict:
    """The tool's result — always from the facts the server already holds."""
    if name == "check_availability":
        return grounding["availability"]
    if name == "get_quote":
        if not grounding["availability"]["can_host"]:
            return {"error": "The sitter cannot host these dates, so there is no price."}
        return grounding["quote"] or {"error": "No price is available for these dates."}
    if name == "search_records":
        query = str(arguments.get("query", "")).lower().split()
        sources = grounding["sources"]
        hits = [s for s in sources if any(word in s["text"].lower() for word in query)] or sources
        return {"records": [{"id": s["id"], "source": s["label"], "text": s["text"]} for s in hits]}
    return {"error": f"Unknown tool {name}."}


def agent_facts(grounding: dict, question: str, intent: str | None) -> str:
    """What the agent starts with: the trip and the pets, never the availability, price or policies."""
    payload = {
        **{k: grounding[k] for k in ("owner", "sitter", "inquiry", "pets")},
        **({"policy_conflicts": grounding["policy_conflicts"]} if grounding["policy_conflicts"] else {}),
        "owner_question": question,
        **({"sitter_intent": intent} if intent else {}),
    }
    return json.dumps(payload, ensure_ascii=False)


def run_agent(
    grounding: dict,
    system: str,
    question: str,
    intent: str | None,
    *,
    chat: Callable | None = None,
) -> tuple[logic.Draft, str, list[str]]:
    """Returns (draft, model, the tools it called). Raises `AIUnavailable` / `AIInvalidOutput` when it can't finish."""
    chat = chat or nebius.chat_tools  # looked up at call time so it can be replaced
    messages: list[dict] = [
        {"role": "system", "content": system + AGENT_NOTE},
        {"role": "user", "content": agent_facts(grounding, question, intent)},
    ]
    called: list[str] = []
    for _ in range(MAX_ROUNDS):
        # The stronger model (Nemotron Super) drives the tool loop; the one-call path stays on Nano.
        reply = chat("report", messages, TOOLS, endpoint="inquiry-agent", max_tokens=400, timeout=TIMEOUT_S)
        if not reply.tool_calls:
            try:
                draft = logic.Draft.model_validate(nebius.extract_json(reply.content))
            except (ValueError, TypeError) as exc:
                raise nebius.AIInvalidOutput("The agent did not answer with JSON.") from exc
            return draft, reply.model, called
        messages.append(reply.as_message())
        for call in reply.tool_calls:
            called.append(call.name)
            result = run_tool(call.name, call.arguments, grounding)
            messages.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result, ensure_ascii=False)})
    raise nebius.AIInvalidOutput("The agent kept calling tools.")
