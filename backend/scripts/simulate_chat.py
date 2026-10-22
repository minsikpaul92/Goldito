"""A 20 message booking chat between a fake owner and a fake sitter, to compare chat AI settings (03D, #249 · #238).

    .venv/bin/python scripts/simulate_chat.py [--turns 20] [--repeat 2] label=chips_model,draft_model,judge ...

Example: before=fast,fast,off  after=fast,nvidia/nemotron-3-super-120b-a12b,on  ("fast" = MODEL_FAST, judge on|off).

Each turn is what the app does: the real chips prompt, a tap on one chip (like a person), the real draft prompt, the
real rule checks, one rewrite, and (judge on) the real judge. Fake data, no database, nothing saved. Both sides only tap
chips, so it is a harder test than a real chat. Ultra then rates the whole chat. One run per setting is a hint, not a proof.
"""

import json
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai import chat as logic  # noqa: E402
from app.ai import chat_judge  # noqa: E402
from app.ai import inquiry as inquiry_logic  # noqa: E402
from app.ai.chat_agents import agent_for  # noqa: E402
from app.ai.chat_agents.owner import OWNER_STYLE  # noqa: E402
from app.ai.prompts import load_prompt  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.routers.ai_chat import ChipsOut, DraftOut, SummaryOut  # noqa: E402
from app.services import nebius  # noqa: E402
from pydantic import BaseModel  # noqa: E402

OWNER, SITTER = "owner-id", "sitter-id"
TZ = ZoneInfo(get_settings().app_timezone)
SITTER_STYLE = "Warm, friendly and brief, like a text from a caring neighbor who loves dogs. First person."
STAY = {
    "type": "stay", "drop_off_at": "2026-10-24T15:00:00+00:00", "pick_up_at": "2026-10-27T22:00:00+00:00",
    "pets": [{"id": "p1", "name": "Max"}],
}
RAW = {
    "owner": {"first_name": "Robert"},
    "sitter": {"name": "Chloe", "service_area": "Downtown", "takes_one_owner_at_a_time": True},
    "inquiry": {"service": "boarding", "stay_days": ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"], "pet_count": 1,
                "drop_off_label": "Oct 24", "pick_up_label": "Oct 27"},
    "availability": {"can_host": True, "unavailable_days": []},
    "quote": None,
    "pets": [{"id": "p1", "name": "Max", "species": "dog", "breed": "Maltese", "weight_kg": 5, "notes": "Pill in a treat"}],
    "sources": [],
    "policy_conflicts": [],
    "rates": {"boarding_nightly": 60.0},
}
KINDS = ("repeat", "off_topic", "invented", "wrong_role", "fragment", "other")


class Rated(BaseModel):
    score: int
    summary: str
    bad: list[dict]


def turn(cfg: dict, role: str, messages: list[dict], summary: str | None = None) -> dict:
    agent = agent_for(role)
    me = OWNER if role == "owner" else SITTER
    state = agent.state(messages, me)
    last_them = next((m for m in reversed(messages) if m["kind"] == "text" and m["sender_id"] != me), None)
    facts = agent.facts(RAW, messages, state=state, last_them=(last_them or {}).get("body", ""))
    base = {
        "role": role, "state": state,
        "me": "Robert" if role == "owner" else "Chloe", "them": "Chloe" if role == "owner" else "Robert",
        "recent": logic.transcript(messages[-logic.WINDOW:], me, TZ), "facts": facts,
        **({"summary": summary} if summary else {}),
    }
    timing = {"chips_s": 0.0, "draft_s": 0.0, "judge_s": 0.0}
    started = time.perf_counter()
    chip_fallback = False
    try:
        out, _ = nebius.chat_json(
            "fast", [{"role": "system", "content": agent.prompt("chips")}, {"role": "user", "content": json.dumps(base)}],
            ChipsOut, endpoint="sim-chips", max_tokens=200, model=cfg["chips"],
        )
        chips = [c for c in (" ".join(c.split()) for c in out.chips) if c and not logic.chip_problems(c)][:3]
    except (nebius.AIUnavailable, nebius.AIInvalidOutput):
        chips = []
    timing["chips_s"] = time.perf_counter() - started
    if len(chips) < 2:
        chip_fallback = True
        chips = agent.fallback_chips(started=True, state=state, facts=facts)
    chip = chips[(len(messages) // 2) % len(chips)]
    payload = {**base, "chip": chip, "style_notes": OWNER_STYLE if role == "owner" else SITTER_STYLE}
    msgs = [{"role": "system", "content": agent.prompt("draft")}, {"role": "user", "content": json.dumps(payload)}]
    sitter_first = "Chloe" if role == "sitter" else None
    previous = [m["body"] for m in messages if m["kind"] == "text"][-logic.REPEAT_WINDOW:]
    known = json.dumps({"recent": base["recent"], "facts": facts})
    rejected: list[str] = []
    judge_stops = 0
    judge_skips = 0
    result = {"role": role, "chip": chip, "chip_fallback": chip_fallback}
    for attempt in range(2):
        began = time.perf_counter()
        try:
            out, _ = nebius.chat_json("fast", msgs, DraftOut, endpoint="sim-draft", max_tokens=300, temperature=0.4, model=cfg["draft"])
        except (nebius.AIUnavailable, nebius.AIInvalidOutput):
            timing["draft_s"] += time.perf_counter() - began
            rejected.append("model_failed")
            break
        timing["draft_s"] += time.perf_counter() - began
        text = inquiry_logic.fill_placeholders(out.reply.strip(), {**facts, "pets": facts.get("pets", [])})
        problems = agent.problems(text, facts, known, sitter_first, previous)
        if not problems and cfg["judge"] and attempt == 0:
            began = time.perf_counter()
            judged = chat_judge.check(payload, text)
            timing["judge_s"] += time.perf_counter() - began
            if judged is None:
                judge_skips += 1
            elif judged:
                judge_stops += 1
            problems = judged or []
        if not problems:
            return {**result, "text": text, "source": "model", "attempts": attempt + 1, "rejected": rejected, "judge_stops": judge_stops, "judge_skips": judge_skips, **timing}
        rejected += problems
        msgs = [*msgs, {"role": "assistant", "content": json.dumps({"reply": out.reply})},
                {"role": "user", "content": "Rewrite it. Problems: " + "; ".join(problems) + ". Return only the JSON."}]
    return {**result, "text": logic.fixed_draft(chip), "source": "fallback", "attempts": 2, "rejected": rejected, "judge_stops": judge_stops, "judge_skips": judge_skips, **timing}


def refresh_summary(messages: list[dict], summary: str | None, upto: str | None) -> tuple[str | None, str | None]:
    """The rolling summary of a long chat, as the app keeps it (ai_chat._ensure_summary): older messages the summary does
    not cover yet are folded in by the fast model once enough have piled up."""
    fresh = logic.summary_due(messages, upto)
    if not fresh:
        return summary, upto
    payload = {
        "previous": logic.scrub(summary),
        "messages": [{"who": "owner" if m["sender_id"] == OWNER else "sitter", "text": d["text"]} for m in fresh if (d := logic.describe(m, OWNER, TZ))],
    }
    try:
        out, _ = nebius.chat_json("fast", [{"role": "system", "content": load_prompt("chat/summary.md")}, {"role": "user", "content": json.dumps(payload)}],
                                  SummaryOut, endpoint="sim-summary", max_tokens=300)
        return logic.scrub(out.summary)[:2000], fresh[-1]["created_at"]
    except (nebius.AIUnavailable, nebius.AIInvalidOutput):
        return summary, upto


def converse(cfg: dict, turns: int) -> list[dict]:
    messages = [{"kind": "card", "sender_id": OWNER, "card": STAY, "body": None, "created_at": "000000"}]
    log: list[dict] = []
    summary = upto = None
    role = "sitter"  # the stay card opened the chat, so the sitter answers first like in the app
    for _ in range(turns):
        summary, upto = refresh_summary(messages, summary, upto)
        res = turn(cfg, role, messages, summary)
        log.append(res)
        messages.append({"kind": "text", "sender_id": OWNER if role == "owner" else SITTER, "body": res["text"], "created_at": f"{len(messages):06d}"})
        role = "owner" if role == "sitter" else "sitter"
    return log


RATER = """You review a chat between a pet owner (Robert) and a pet sitter (Chloe) written by an app that drafts messages.
Facts known to both: one dog, Max (Maltese, 5 kg, takes a pill in a treat). Stay Oct 24 to Oct 27, boarding at the sitter's
home. The sitter's nightly rate is $60 (no quote card was sent). The owner drops off and picks up. The sitter is available.
Nothing else was given: no park, walk, toy, blanket, food, address, schedule or time unless an earlier message said it.
Rate each message for: does it follow the previous message, does it say what the tapped option says, does it sound like a real
person in that role. List only messages with a real problem, each with a kind: repeat (says again what was said), off_topic
(ignores the last message or the tapped option), invented (a concrete detail nobody gave), wrong_role, fragment (one or two
words or a button label), other. Return ONLY JSON:
{"score": 1-10 for the whole conversation, "summary": "two sentences", "bad": [{"n": message number, "kind": "...", "issue": "short"}]}
Be strict."""


def rate(log: list[dict]) -> Rated | None:
    lines = [f"{i + 1}. {'Owner' if t['role'] == 'owner' else 'Sitter'} (tapped option: {t['chip']}): {t['text']}" for i, t in enumerate(log)]
    try:
        out, _ = nebius.chat_json("safety", [{"role": "system", "content": RATER}, {"role": "user", "content": "\n".join(lines)}],
                                  Rated, endpoint="sim-rate", max_tokens=3000)
        return out
    except (nebius.AIUnavailable, nebius.AIInvalidOutput) as exc:
        print("rating failed:", exc)
        return None


def run(job: tuple[str, dict, int]) -> tuple[str, list[dict], Rated | None]:
    label, cfg, turns = job
    log = converse(cfg, turns)
    return label, log, rate(log)


def main() -> None:
    args = sys.argv[1:]
    opts = {"--turns": 20, "--repeat": 1}
    for name in opts:
        if name in args:
            i = args.index(name)
            opts[name] = int(args[i + 1])
            args = args[:i] + args[i + 2:]
    jobs = []
    for spec in args:
        label, value = spec.split("=", 1)
        chips, draft, judge = value.split(",")
        cfg = {"chips": None if chips == "fast" else chips, "draft": None if draft == "fast" else draft, "judge": judge == "on"}
        jobs += [(f"{label}#{n + 1}", cfg, opts["--turns"]) for n in range(opts["--repeat"])]
    with ThreadPoolExecutor(len(jobs)) as pool:
        results = list(pool.map(run, jobs))
    print(f"{'run':<22}{'score':>6}{'draft fallback':>16}{'chip fallback':>15}{'rewrites':>10}{'judge stops':>13}{'judge skips':>13}  " + "  ".join(KINDS))
    for label, log, rated in results:
        kinds = [sum(1 for b in (rated.bad if rated else []) if b.get("kind") == k) for k in KINDS]
        print(
            f"{label:<22}{(rated.score if rated else '-'):>6}{sum(t['source'] == 'fallback' for t in log):>16}"
            f"{sum(t['chip_fallback'] for t in log):>15}{sum(t['attempts'] == 2 and t['source'] == 'model' for t in log):>10}"
            f"{sum(t['judge_stops'] for t in log):>13}{sum(t['judge_skips'] for t in log):>13}  " + "  ".join(f"{k:>{len(n)}}" for k, n in zip(kinds, KINDS))
        )
    print("\nseconds per turn (median / worst): chips, draft with rewrites, judge, and the three together")
    for label, log, _ in results:
        def span(key: str) -> str:
            values = [t[key] for t in log]
            return f"{statistics.median(values):.2f} / {max(values):.2f}"
        totals = [t["chips_s"] + t["draft_s"] + t["judge_s"] for t in log]
        print(f"{label:<22} chips {span('chips_s')}   draft {span('draft_s')}   judge {span('judge_s')}   all {statistics.median(totals):.2f} / {max(totals):.2f}")
    print("\nbad messages by position (1-20 / 21-35 / 36+)")
    for label, log, rated in results:
        bad = [int(b.get("n", 0)) for b in (rated.bad if rated else [])]
        print(f"{label:<22} {sum(n <= 20 for n in bad)} / {sum(20 < n <= 35 for n in bad)} / {sum(n > 35 for n in bad)}")
    for label, log, rated in results:
        print(f"\n=== {label}: {rated.summary if rated else ''}")
        for i, t in enumerate(log):
            print(f"{i + 1:>2}. [{t['role']}] {t['text']}  <- {t['chip']}" + (f"  !{t['rejected']}" if t["rejected"] else ""))


if __name__ == "__main__":
    main()
