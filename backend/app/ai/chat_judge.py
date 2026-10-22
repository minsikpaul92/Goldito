"""The chat draft's judge: a second model reads a draft that already passed the rule checks and says whether it fits.

The rules in `chat.py` catch what a pattern can (an amount, a date, a time, a person, a repeat). They cannot tell that a draft
ignores the question, invents a park or says the introduction twice. The judge does, with the same facts the writer had.
It only ever adds problems to the rewrite step; when it cannot answer in time the draft stands as it did before the judge.
"""

import json
import logging

from pydantic import BaseModel, Field, ValidationError

from app.ai.prompts import load_prompt
from app.services import nebius

log = logging.getLogger("goldito.ai")

TIMEOUT_S = 6.0  # a slow judge is skipped, never waited for
MAX_ISSUES = 3
ISSUE_MAX = 200


class Verdict(BaseModel):
    ok: bool = True
    issues: list[str] = Field(default_factory=list)


def check(payload: dict, draft: str) -> list[str] | None:
    """What is wrong with `draft`, in words the writer can act on ([] = it fits). None when the judge could not answer
    (down, slow or not JSON): the caller keeps the draft and stops judging this request.

    `payload` is what the writer read (side, state, chip, summary, recent, facts); the voice notes are not needed."""
    message = {k: v for k, v in payload.items() if k != "style_notes"} | {"draft": draft}
    try:
        result = nebius.chat(
            "report",
            [{"role": "system", "content": load_prompt("chat/judge.md")}, {"role": "user", "content": json.dumps(message)}],
            endpoint="chat-judge",
            json_mode=True,
            max_tokens=200,
            temperature=0,
            timeout=TIMEOUT_S,
        )
        verdict = Verdict.model_validate(nebius.extract_json(result.text))
    except (nebius.AIUnavailable, ValueError, ValidationError) as exc:
        log.warning("chat-judge skipped (%s)", type(exc).__name__)
        return None
    if verdict.ok:
        return []
    issues = [" ".join(i.split())[:ISSUE_MAX] for i in verdict.issues if i.strip()][:MAX_ISSUES]
    return issues or ["it does not fit the conversation"]
