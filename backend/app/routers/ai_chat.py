"""POST /api/ai/chat-chips and /api/ai/chat-draft (phase-03D 3D.5, #142, D62).

Chips: two or three short options for replying to what the other person just wrote, matched to MY side. Draft: the chip
the person tapped becomes one short message in their voice, shown in the box to edit. Nothing is sent or saved here, and
nothing is ever sent by the model (D62): the person presses Send.

The thread's state lives in Postgres: the last messages, a rolling summary kept on the thread when it is long, and the
facts the database knows (availability, quote, pets, the sitter's policy and rates). The backend keeps nothing.
"""

import json
import logging
from datetime import date
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.ai import chat as logic
from app.ai import inquiry as inquiry_logic
from app.ai.chat_agents import agent_for
from app.ai.prompts import load_prompt
from app.config import get_settings
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.routers.ai_inquiry import _first_name, _gather, _now, _one
from app.services import authz, nebius

router = APIRouter(prefix="/api/ai", tags=["ai"])
log = logging.getLogger("goldito.ai")



class ChatChipsRequest(BaseModel):
    thread_id: UUID


class Chip(BaseModel):
    id: str
    label: str


class ChatAction(BaseModel):
    id: str
    label: str


class ChatChipsResponse(BaseModel):
    chips: list[Chip]
    # One thing to do next (open a card or a sheet) when their last message leads to it; the person presses it (D62).
    action: ChatAction | None = None
    # The other person's latest text the chips answer (null at the start of a chat); the app asks again when it changes.
    for_message_id: str | None = None
    source: str  # model | fallback


class ChatDraftRequest(BaseModel):
    thread_id: UUID
    chip: str = Field(min_length=1, max_length=logic.CHIP_MAX * 2)


class ChatDraftResponse(BaseModel):
    text: str
    source: str  # model | fallback


class ChipsOut(BaseModel):
    chips: list[str] = Field(default_factory=list)
    action: str | None = None
    confidence: float | None = None


class DraftOut(BaseModel):
    reply: str


class SummaryOut(BaseModel):
    summary: str


def _context(db, user: CurrentUser, thread_id: UUID) -> dict:
    thread = _one(db.table("chat_threads").select("*").eq("id", str(thread_id)).limit(1).execute())
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found.")
    if user.id not in (thread["owner_id"], thread["sitter_id"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This isn't your chat.")
    messages = db.table("chat_messages").select("*").eq("thread_id", str(thread_id)).execute().data
    messages.sort(key=lambda m: str(m.get("created_at", "")))
    role = "owner" if user.id == thread["owner_id"] else "sitter"
    names = {
        p["id"]: p.get("display_name") or ""
        for p in db.table("profiles").select("id, display_name").in_("id", [thread["owner_id"], thread["sitter_id"]]).execute().data
    }
    return {
        "thread": thread,
        "messages": messages,
        "role": role,
        "owner_name": _first_name(names.get(thread["owner_id"]), "the owner"),
        "sitter_name": _first_name(names.get(thread["sitter_id"]), "the sitter"),
    }


def _facts(db, user: CurrentUser, ctx: dict, last_them: str, tz: ZoneInfo, today: date, *, with_sources: bool = True) -> dict:
    """The facts the database knows. With a stay: the inquiry's own gathering (availability, quote, pets, policy); without
    one only the sitter and their rates. Entry codes and addresses never get here (D31)."""
    thread = ctx["thread"]
    stay = logic.latest_stay(ctx["messages"])
    facts: dict | None = None
    if stay and stay.get("pets"):
        # Book care's service: the stay card has none, so boarding unless the sitter only offers house sitting.
        profile = _one(db.table("sitter_profiles").select("services").eq("id", thread["sitter_id"]).limit(1).execute()) or {}
        services = profile.get("services") or ["boarding"]
        inquiry = {
            "sitter_id": thread["sitter_id"],
            "owner_id": thread["owner_id"],
            "service_type": stay.get("service_type") or ("boarding" if "boarding" in services else services[0]),
            "drop_off_at": stay["drop_off_at"],
            "pick_up_at": stay["pick_up_at"],
            "pet_ids": [p["id"] for p in stay["pets"]],
        }
        try:
            facts = _gather(db, inquiry, {"body": last_them}, user, tz, today, ctx["owner_name"], ctx["sitter_name"], with_sources=with_sources)
        except (authz.RpcError, HTTPException) as exc:
            log.warning("chat: could not gather the facts (%s)", exc)
    if facts is None:
        sitter = _one(db.table("sitter_profiles").select("bio, service_area, policies, accepts_multiple_owners").eq("id", thread["sitter_id"]).limit(1).execute()) or {}
        facts = {
            "owner": {"first_name": ctx["owner_name"]},
            "sitter": {"name": ctx["sitter_name"], **({"service_area": sitter["service_area"]} if sitter.get("service_area") else {})},
            "availability": {"can_host": True, "unavailable_days": [], "unchecked": True},
            "quote": None,
            "pets": [],
            "sources": [],
            "policy_conflicts": [],
        }
    rates = _one(db.table("sitter_rates").select("boarding_nightly, house_sitting_nightly, daycare_daily").eq("sitter_id", thread["sitter_id"]).limit(1).execute()) or {}
    facts["rates"] = {k: float(rates[k]) for k in ("boarding_nightly", "house_sitting_nightly", "daycare_daily") if rates.get(k) is not None}
    inquiry_logic.assert_no_secrets(facts)
    return facts


def _actions(db, user: CurrentUser, ctx: dict) -> list[str]:
    """The actions that are possible for me right now. The booking's stage is the database's own (booking_stage through
    get_booking_stages, D60), never worked out here; when it can't be read there are no actions."""
    thread, messages = ctx["thread"], ctx["messages"]
    rows = (
        db.table("bookings")
        .select("id, status, created_at, owner_id, sitter_id, meet_greet_status, meet_greet_proposed_by, sitter_interest_at, owner_agreed_at, sitter_accepted_at")
        .eq("owner_id", thread["owner_id"])
        .eq("sitter_id", thread["sitter_id"])
        .execute()
        .data
    )
    booking = next(iter(sorted((r for r in rows if r.get("status") in ("requested", "confirmed")), key=lambda r: str(r.get("created_at", "")), reverse=True)), None)
    stage = None
    if booking:
        try:
            stages = authz.rpc_json(user.access_token, "get_booking_stages", {"p_ids": [booking["id"]]})
            stage = next((r["stage"] for r in stages or [] if r.get("booking_id") == booking["id"]), None)
        except (authz.RpcError, HTTPException) as exc:
            log.warning("chat: could not read the booking stage (%s)", exc)
            return []
        if stage is None:
            return []
    stay = logic.latest_stay(messages)
    return logic.available_actions(ctx["role"], booking, stage, has_stay=bool(stay), priced=logic.is_priced(messages, stay), messages=messages)


def _ensure_summary(db, ctx: dict, tz: ZoneInfo) -> str | None:
    """The rolling summary of everything before the window, refreshed when enough older messages are not in it yet."""
    thread, messages = ctx["thread"], ctx["messages"]
    fresh = logic.summary_due(messages, thread.get("ai_summary_upto"))
    if fresh:
        payload = {
            "previous": thread.get("ai_summary") or "",
            "messages": [
                {"who": "owner" if m.get("sender_id") == thread["owner_id"] else "sitter", "text": d["text"]}
                for m in fresh
                if (d := logic.describe(m, thread["owner_id"], tz))
            ],
        }
        try:
            out, _ = nebius.chat_json(
                "fast",
                [{"role": "system", "content": load_prompt("chat/summary.md")}, {"role": "user", "content": json.dumps(payload)}],
                SummaryOut,
                endpoint="chat-summary",
                max_tokens=300,
            )
            summary = out.summary.strip()[:2000]
            db.table("chat_threads").update({"ai_summary": summary, "ai_summary_upto": fresh[-1]["created_at"]}).eq("id", thread["id"]).execute()
            thread["ai_summary"], thread["ai_summary_upto"] = summary, fresh[-1]["created_at"]
        except Exception as exc:  # noqa: BLE001 - a missing summary column (014m not applied) or a model outage must not stop the chips
            log.warning("chat: summary not refreshed (%s)", exc)
    return thread.get("ai_summary") or None


def _prompt_input(db, user: CurrentUser, ctx: dict, tz: ZoneInfo, today: date, *, with_sources: bool = True) -> tuple[dict, dict, dict | None]:
    """(the model input without the task, the facts this side may read, the other person's latest text message)."""
    messages = ctx["messages"]
    agent = agent_for(ctx["role"])
    texts_them = [m for m in messages if m.get("kind") == "text" and m.get("sender_id") != user.id]
    last_them = texts_them[-1] if texts_them else None
    summary = _ensure_summary(db, ctx, tz) if len(messages) > logic.SUMMARY_OVER else None
    _, recent = logic.split_window(messages)
    state = agent.state(messages, user.id)
    facts = agent.facts(
        _facts(db, user, ctx, (last_them or {}).get("body", ""), tz, today, with_sources=with_sources),
        messages,
        state=state,
        last_them=(last_them or {}).get("body", ""),
    )
    inquiry_logic.assert_no_secrets(facts)
    me = ctx["owner_name"] if ctx["role"] == "owner" else ctx["sitter_name"]
    them = ctx["sitter_name"] if ctx["role"] == "owner" else ctx["owner_name"]
    base = {
        "role": ctx["role"],
        "state": state,
        "me": me,
        "them": them,
        **({"summary": summary} if summary else {}),
        "recent": logic.transcript(recent, user.id, tz),
        "facts": facts,
    }
    return base, facts, last_them


@router.post("/chat-chips", response_model=ChatChipsResponse)
def chat_chips(body: ChatChipsRequest, user: CurrentUser = Depends(get_current_user)) -> ChatChipsResponse:
    db = get_service_client()
    ctx = _context(db, user, body.thread_id)
    tz = ZoneInfo(get_settings().app_timezone)
    today = _now().astimezone(tz).date()
    agent = agent_for(ctx["role"])
    base, facts, last_them = _prompt_input(db, user, ctx, tz, today, with_sources=False)
    started = any(m.get("kind") == "text" for m in ctx["messages"])
    for_id = last_them["id"] if last_them else None
    # A chat where I spoke last has nothing to answer: no chips (the app shows none), except my opener when it is empty.
    last_text = next((m for m in reversed(ctx["messages"]) if m.get("kind") == "text"), None)
    if started and last_text and last_text.get("sender_id") == user.id:
        return ChatChipsResponse(chips=[], for_message_id=for_id, source="model")

    # What the person could do next, if their last message leads to it (only when there is something to answer).
    available = _actions(db, user, ctx) if last_them else []
    if available:
        base["actions"] = {a: logic.ACTIONS[a]["meaning"] for a in available}

    labels: list[str] = []
    source = "model"
    action: dict | None = None
    try:
        out, _ = nebius.chat_json(
            "fast",
            [{"role": "system", "content": agent.prompt("chips")}, {"role": "user", "content": json.dumps(base)}],
            ChipsOut,
            endpoint="chat-chips",
            max_tokens=200,
            model=agent.model(),
        )
        seen: set[str] = set()
        for label in out.chips:
            label = " ".join(label.split())
            if label and label.lower() not in seen and not logic.chip_problems(label):
                seen.add(label.lower())
                labels.append(label)
        labels = labels[: logic.MAX_CHIPS]
        action = logic.chosen_action(out.action, out.confidence, available)
        labels = agent.keep_chips(labels, facts)
    except (nebius.AIUnavailable, nebius.AIInvalidOutput) as exc:
        log.warning("chat-chips: model failed (%s)", exc)
    if len(labels) < 2:
        source = "fallback"
        labels = agent.fallback_chips(started=started, state=base["state"], facts=facts)
    return ChatChipsResponse(
        chips=[Chip(id=f"c{i}", label=c) for i, c in enumerate(labels)],
        action=ChatAction(**action) if action else None,
        for_message_id=for_id,
        source=source,
    )


@router.post("/chat-draft", response_model=ChatDraftResponse)
def chat_draft(body: ChatDraftRequest, user: CurrentUser = Depends(get_current_user)) -> ChatDraftResponse:
    db = get_service_client()
    ctx = _context(db, user, body.thread_id)
    tz = ZoneInfo(get_settings().app_timezone)
    today = _now().astimezone(tz).date()
    agent = agent_for(ctx["role"])
    base, facts, last_them = _prompt_input(db, user, ctx, tz, today)
    chip = " ".join(body.chip.split())
    if logic.chip_problems(chip[: logic.CHIP_MAX * 2]) and len(chip) > logic.CHIP_MAX * 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That option is too long.")

    style = agent.style(db, ctx, chip, last_them)
    payload = {**base, "chip": chip, "style_notes": style}
    messages = [{"role": "system", "content": agent.prompt("draft")}, {"role": "user", "content": json.dumps(payload)}]
    sitter_first = ctx["sitter_name"] if ctx["role"] == "sitter" else None

    for attempt in range(2):
        try:
            out, _ = nebius.chat_json("fast", messages, DraftOut, endpoint="chat-draft", max_tokens=300, temperature=0.4, model=agent.model())
        except (nebius.AIUnavailable, nebius.AIInvalidOutput) as exc:
            log.warning("chat-draft: model failed (%s)", exc)
            break
        text = inquiry_logic.fill_placeholders(out.reply.strip(), {**facts, "owner": facts["owner"], "pets": facts.get("pets", [])})
        known = json.dumps({"recent": base["recent"], "facts": facts, "summary": base.get("summary", "")})
        problems = agent.problems(text, facts, known, sitter_first)
        if not problems:
            return ChatDraftResponse(text=text, source="model")
        log.info("chat-draft: attempt %s rejected (%s)", attempt + 1, "; ".join(problems))
        messages = [
            *messages,
            {"role": "assistant", "content": json.dumps({"reply": out.reply})},
            {"role": "user", "content": "Rewrite it. Problems: " + "; ".join(problems) + ". Return only the JSON."},
        ]
    return ChatDraftResponse(text=logic.fixed_draft(chip), source="fallback")
