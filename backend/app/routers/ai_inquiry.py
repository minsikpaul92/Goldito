"""POST /api/ai/inquiry-reply — the sitter's reply DRAFT to an owner's question about a stay (phase-07B 7B.3).

The server gathers the facts (availability, quote, pets, the sitter's profile and policies, RAG sources), the model
only writes prose in the sitter's voice, and every amount / date in the draft is checked against the facts. The
draft is stored as `author='ai'`, which the owner can never read; the sitter sends it (7B.6).
"""

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.ai import inquiry as logic
from app.ai import tone
from app.ai.prompts import load_prompt
from app.config import get_settings
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import authz, nebius, rag

router = APIRouter(prefix="/api/ai", tags=["ai"])
log = logging.getLogger("pawddy.ai")

TIMEOUT_S = 45.0  # architecture §7: inquiry-reply 45 s
MAX_TOKENS = 350
INTENTS = ("accept", "decline", "suggest_dates")


class InquiryReplyRequest(BaseModel):
    inquiry_id: UUID
    # Sitter only: make a fresh draft, optionally leaning one way (the intent chips, 7B.6).
    regenerate: bool = False
    intent: str | None = Field(default=None, pattern="^(accept|decline|suggest_dates)$")


class Source(BaseModel):
    id: str
    type: str
    label: str
    text: str


class InquiryReplyResponse(BaseModel):
    """What the caller gets. The owner gets an acknowledgement only: the draft is the sitter's until they send it."""

    message_id: str
    body: str | None
    can_host: bool | None
    needs_sitter: bool | None
    quote: dict | None
    availability: dict | None
    sources: list[Source]
    model: str
    latency_ms: int
    reused: bool = False
    auto_scheduled_at: str | None = None


def _now() -> datetime:
    return datetime.now(UTC)


def _one(response) -> dict | None:
    return response.data[0] if response.data else None


@router.post("/inquiry-reply", response_model=InquiryReplyResponse)
def inquiry_reply(
    body: InquiryReplyRequest,
    user: CurrentUser = Depends(get_current_user),
) -> InquiryReplyResponse:
    db = get_service_client()
    inquiry = _one(
        db.table("inquiries").select("*").eq("id", str(body.inquiry_id)).limit(1).execute()
    )
    if not inquiry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found.")
    if user.id not in (inquiry["owner_id"], inquiry["sitter_id"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This isn't your inquiry."
        )
    if (body.regenerate or body.intent) and user.id != inquiry["sitter_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the sitter can ask for another draft.",
        )

    messages = (
        db.table("inquiry_messages").select("*").eq("inquiry_id", inquiry["id"]).execute().data
    )
    messages.sort(key=lambda m: str(m.get("created_at", "")))
    drafts = [m for m in messages if m["author"] == "ai"]
    if drafts and not body.regenerate:
        return _redact(
            _reuse(drafts[-1]), user, inquiry
        )  # idempotent: asking twice never makes a second draft
    if drafts and body.regenerate:
        _note_discarded(db, inquiry, drafts[-1])
    questions = [m for m in messages if m["author"] == "owner"]
    if not questions:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This inquiry has no question yet."
        )
    question = questions[-1]

    tz = ZoneInfo(get_settings().app_timezone)
    today = _now().astimezone(tz).date()
    started = datetime.now(UTC)
    owner = (
        _one(
            db.table("profiles")
            .select("display_name")
            .eq("id", inquiry["owner_id"])
            .limit(1)
            .execute()
        )
        or {}
    )
    sitter = (
        _one(
            db.table("profiles")
            .select("display_name")
            .eq("id", inquiry["sitter_id"])
            .limit(1)
            .execute()
        )
        or {}
    )
    owner_name = _first_name(owner.get("display_name"), "there")
    sitter_name = sitter.get("display_name") or "the sitter"

    grounding = None
    draft = None
    model_name = "template"
    try:
        grounding = _gather(db, inquiry, question, user, tz, today, owner_name, sitter_name)
        logic.assert_no_secrets(grounding)
    except (authz.RpcError, HTTPException) as exc:
        log.warning("inquiry-reply: could not gather the facts (%s)", exc)
        grounding = None

    if grounding is not None:
        draft, model_name = _write(
            db, grounding, question["body"], inquiry["sitter_id"], body.intent, sitter_name
        )

    if draft is None:
        text = logic.fixed_reply(
            owner_name,
            sitter_name,
            grounding,
            model_failed=grounding is None or model_name == "failed",
        )
        can_host = bool(grounding and grounding["availability"]["can_host"])
        needs = True
    else:
        text, can_host, needs = (
            draft.reply.strip(),
            grounding["availability"]["can_host"],
            draft.needs_sitter,
        )
    if logic.asks_if_ai(question["body"]) or (grounding and grounding["policy_conflicts"]):
        needs = True

    sources = grounding["sources"] if grounding else []
    used = set(draft.used_sources) if draft else set()
    saved = (
        db.table("inquiry_messages")
        .insert(
            {
                "inquiry_id": inquiry["id"],
                "author": "ai",
                "sender_id": None,
                "body": text,
                "drafted_by_ai": True,
                "status": "draft",
                "model": model_name,
                "latency_ms": int((datetime.now(UTC) - started).total_seconds() * 1000),
                "grounding": {
                    "quote": grounding["quote"] if grounding else None,
                    "availability": grounding["availability"] if grounding else None,
                    "sources": [s for s in sources if not used or s["id"] in used],
                    "needs_sitter": needs,
                    "policy_conflicts": grounding["policy_conflicts"] if grounding else [],
                    "intent": body.intent,
                },
            }
        )
        .execute()
        .data[0]
    )

    if logic.asks_if_ai(question["body"]):
        # "Are you an AI?" must be answered by the sitter themselves (D36): say so, apart from "draft ready".
        db.table("notifications").insert(
            {
                "user_id": inquiry["sitter_id"],
                "type": "inquiry_needs_you",
                "title": f"{owner_name} asked if they're talking to a person — please reply yourself",
                "ref_id": inquiry["id"],
            }
        ).execute()

    # The owner's question joins the knowledge base for this owner × sitter pair (never the sitter's reply).
    try:
        rag.index_source(
            db,
            source_type="inquiry",
            source_id=question["id"],
            text=question["body"],
            sitter_id=inquiry["sitter_id"],
            owner_id=inquiry["owner_id"],
        )
    except (nebius.AIUnavailable, ValueError):
        log.info("inquiry-reply: question not indexed")

    scheduled = None
    if (
        not body.regenerate
        and not body.intent
        and user.id == inquiry["owner_id"]
        and not needs
        and draft is not None
        and model_name not in ("failed", "checked-template", "template")
    ):
        scheduled = _auto_publish(db, inquiry, text, grounding, owner_name)

    return _redact(
        InquiryReplyResponse(
            message_id=str(saved["id"]),
            body=text,
            can_host=can_host,
            needs_sitter=needs,
            quote=grounding["quote"] if grounding else None,
            availability=grounding["availability"]
            if grounding
            else {"can_host": True, "unavailable_days": []},
            sources=[Source(**s) for s in sources if not used or s["id"] in used],
            model=model_name,
            latency_ms=saved["latency_ms"] or 0,
            auto_scheduled_at=scheduled,
        ),
        user,
        inquiry,
    )


def _redact(
    response: InquiryReplyResponse, user: CurrentUser, inquiry: dict
) -> InquiryReplyResponse:
    """The owner never receives the draft, not even in this response (RLS hides it everywhere else too)."""
    if user.id != inquiry["owner_id"]:
        return response
    return InquiryReplyResponse(
        message_id=response.message_id,
        body=None,
        can_host=None,
        needs_sitter=None,
        quote=None,
        availability=None,
        sources=[],
        model="",
        latency_ms=response.latency_ms,
        reused=response.reused,
        auto_scheduled_at=response.auto_scheduled_at,
    )


def _auto_publish(db, inquiry: dict, text: str, grounding: dict, owner_name: str) -> str | None:
    """Auto-send mode (D36 · D37): the reply goes out in the sitter's name at a human pace. Returns when it appears.

    Only for a sitter who switched it on (with consent), and only for a draft that needs nothing from them. The reply
    is stored now with a later `visible_at`; the owner's notice carries the same time, so nothing is announced early.
    """
    profile = _one(
        db.table("sitter_profiles")
        .select("ai_reply_mode, ai_consent_at")
        .eq("id", inquiry["sitter_id"])
        .limit(1)
        .execute()
    )
    if not profile or profile.get("ai_reply_mode") != "auto" or not profile.get("ai_consent_at"):
        return None
    typing_s, visible_s = logic.human_delay(text)
    now = _now()
    typing_at = (now + timedelta(seconds=typing_s)).isoformat()
    visible_at = (now + timedelta(seconds=visible_s)).isoformat()
    db.table("inquiry_messages").insert(
        {
            "inquiry_id": inquiry["id"],
            "author": "sitter",
            "sender_id": inquiry["sitter_id"],
            "body": text,
            "drafted_by_ai": True,
            "status": "sent",
            # No confirmation: nobody approved this one, so it never becomes a style sample.
            "confirmed_by_sitter_at": None,
            "visible_at": visible_at,
            "grounding": {
                "quote": grounding["quote"],
                "sources": grounding["sources"],
                "availability": {"can_host": grounding["availability"]["can_host"]},
            },
        }
    ).execute()
    db.table("inquiries").update({"reply_typing_at": typing_at, "reply_visible_at": visible_at}).eq(
        "id", inquiry["id"]
    ).execute()
    sitter = (
        _one(
            db.table("profiles")
            .select("display_name")
            .eq("id", inquiry["sitter_id"])
            .limit(1)
            .execute()
        )
        or {}
    )
    db.table("notifications").insert(
        {
            "user_id": inquiry["owner_id"],
            "type": "inquiry_replied",
            "title": f"{sitter.get('display_name', 'Your sitter')} replied to your question 💬",
            "body": text[:140],
            "ref_id": inquiry["id"],
            "visible_at": visible_at,
        }
    ).execute()
    return visible_at


def _note_discarded(db, inquiry: dict, draft: dict) -> None:
    """A draft the sitter threw away is a negative signal for their voice (kept, never used as an example)."""
    try:
        names = _names(db, inquiry)
        tone.record_sample(
            db,
            sitter_id=inquiry["sitter_id"],
            source="regenerated",
            kind="inquiry",
            context_summary=tone.anonymize(f"{inquiry['service_type']} inquiry", **names),
            final_text="",
            draft=tone.anonymize(draft["body"], **names),
            intent=(draft.get("grounding") or {}).get("intent"),
        )
    except Exception as exc:  # noqa: BLE001 — learning must never get in the way of a new draft
        log.info("tone: regenerate not recorded (%s)", exc)


def _names(db, inquiry: dict) -> dict:
    owner = (
        _one(
            db.table("profiles")
            .select("display_name")
            .eq("id", inquiry["owner_id"])
            .limit(1)
            .execute()
        )
        or {}
    )
    pets = (
        db.table("pets")
        .select("name")
        .in_("id", [str(p) for p in inquiry["pet_ids"]])
        .execute()
        .data
    )
    return {
        "owner_names": [n for n in (owner.get("display_name") or "").split() if n],
        "pet_names": [p["name"] for p in pets],
    }


def _reuse(message: dict) -> InquiryReplyResponse:
    g = message.get("grounding") or {}
    return InquiryReplyResponse(
        message_id=str(message["id"]),
        body=message["body"],
        can_host=bool((g.get("availability") or {}).get("can_host", True)),
        needs_sitter=bool(g.get("needs_sitter")),
        quote=g.get("quote"),
        availability=g.get("availability") or {"can_host": True, "unavailable_days": []},
        sources=[Source(**s) for s in g.get("sources", [])],
        model=message.get("model") or "",
        latency_ms=message.get("latency_ms") or 0,
        reused=True,
    )


def _first_name(display_name: str | None, fallback: str) -> str:
    return (display_name or "").split()[0] if (display_name or "").strip() else fallback


def _gather(
    db,
    inquiry: dict,
    question: dict,
    user: CurrentUser,
    tz: ZoneInfo,
    today: date,
    owner_name: str,
    sitter_name: str,
) -> dict:
    drop_off = _ts(inquiry["drop_off_at"])
    pick_up = _ts(inquiry["pick_up_at"])
    days = logic.stay_days(drop_off, pick_up, tz)
    pet_ids = [str(p) for p in inquiry["pet_ids"]]

    def schedule():
        end = min(days[-1], days[0].fromordinal(days[0].toordinal() + 92))
        return authz.rpc_json(
            user.access_token,
            "get_sitter_schedule",
            {
                "p_sitter": inquiry["sitter_id"],
                "p_from": days[0].isoformat(),
                "p_to": end.isoformat(),
            },
        )

    def quote():
        try:
            return authz.rpc_json(
                user.access_token,
                "quote_booking",
                {
                    "p_sitter": inquiry["sitter_id"],
                    "p_service": inquiry["service_type"],
                    "p_drop_off_at": inquiry["drop_off_at"],
                    "p_pick_up_at": inquiry["pick_up_at"],
                    "p_pet_count": len(pet_ids),
                },
            )
        except authz.RpcError as exc:
            log.info("inquiry-reply: no quote (%s)", exc.message)
            return None

    def sources():
        query = f"{question['body']} ({inquiry['service_type']}, {', '.join(d.isoformat() for d in (days[0], days[-1]))})"
        try:
            return rag.search(
                db,
                query,
                sitter_id=inquiry["sitter_id"],
                pet_ids=pet_ids,
                owner_id=inquiry["owner_id"],
                k=logic.MAX_SOURCES,
            )
        except Exception as exc:  # noqa: BLE001 — a search outage must not stop the draft
            log.info("inquiry-reply: no sources (%s)", exc)
            return []

    def pet_records():
        # Only this inquiry's pets, and only the columns a reply may use.
        pets = (
            db.table("pets")
            .select("id, name, species, breed, birthdate, weight_kg, notes")
            .in_("id", pet_ids)
            .execute()
            .data
        )
        allergies = (
            db.table("pet_allergies")
            .select("pet_id, allergen")
            .in_("pet_id", pet_ids)
            .execute()
            .data
        )
        cautions = (
            db.table("pet_cautions")
            .select("pet_id, text, active")
            .in_("pet_id", pet_ids)
            .execute()
            .data
        )
        return pets, allergies, cautions

    with ThreadPoolExecutor(max_workers=4) as pool:
        f_schedule, f_quote, f_sources, f_pets = (
            pool.submit(f) for f in (schedule, quote, sources, pet_records)
        )
        rows = f_schedule.result()
        quote_json = f_quote.result()
        hits = f_sources.result()
        pets_rows, allergies, cautions = f_pets.result()

    avail = logic.availability(rows, days)
    pets = [
        logic.pet_facts(
            p,
            [a["allergen"] for a in allergies if a["pet_id"] == p["id"]],
            [c["text"] for c in cautions if c["pet_id"] == p["id"] and c.get("active")],
            today,
        )
        for p in pets_rows
    ]
    pet_names = {str(p["id"]): p["name"] for p in pets_rows}
    labels = {
        str(h.get("source_id")): logic.source_label(
            h["source_type"], sitter_name, pet_names, _pet_of(h, pets_rows)
        )
        for h in hits
    }
    profile = (
        _one(
            db.table("sitter_profiles")
            .select("bio, service_area, experience_years, policies")
            .eq("id", inquiry["sitter_id"])
            .limit(1)
            .execute()
        )
        or {}
    )

    return {
        "owner": {"first_name": owner_name},
        "sitter": {
            "name": sitter_name,
            **({"bio": profile["bio"][:300]} if profile.get("bio") else {}),
            **({"service_area": profile["service_area"]} if profile.get("service_area") else {}),
            **(
                {"experience_years": profile["experience_years"]}
                if profile.get("experience_years") is not None
                else {}
            ),
        },
        "inquiry": {
            "service": inquiry["service_type"],
            "drop_off": drop_off.astimezone(tz).isoformat(timespec="minutes"),
            "pick_up": pick_up.astimezone(tz).isoformat(timespec="minutes"),
            "drop_off_label": f"{logic.human_date(days[0])}",
            "pick_up_label": f"{logic.human_date(days[-1])}",
            "stay_days": [d.isoformat() for d in days],
            "pet_count": len(pet_ids),
        },
        "availability": avail,
        "quote": quote_json if avail["can_host"] else None,
        "pets": pets,
        "sources": logic.clean_sources(hits, labels),
        "policy_conflicts": logic.policy_conflicts(profile.get("policies"), pets),
    }


def _pet_of(hit: dict, pets_rows: list[dict]) -> str | None:
    # Life Record / care request hits are scoped to one of the inquiry's pets; the label names it when we can.
    return (
        str(hit["pet_id"])
        if hit.get("pet_id")
        else (str(pets_rows[0]["id"]) if len(pets_rows) == 1 else None)
    )


def _ts(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _facts_message(grounding: dict, question: str, intent: str | None) -> str:
    payload = {
        **{
            k: grounding[k] for k in ("owner", "sitter", "inquiry", "availability", "quote", "pets")
        },
        **(
            {"policy_conflicts": grounding["policy_conflicts"]}
            if grounding["policy_conflicts"]
            else {}
        ),
        "policies_and_notes": [
            {"id": s["id"], "source": s["label"], "text": s["text"]} for s in grounding["sources"]
        ],
        "sources": [s["id"] for s in grounding["sources"]],
        "owner_question": question,
        **({"sitter_intent": intent} if intent else {}),
    }
    if grounding["quote"] is None and grounding["availability"]["can_host"]:
        payload["quote_note"] = (
            "No price is available for these dates: do not state any price; say I'll send it."
        )
    # The model never sees the stay_days list or labels it doesn't need beyond what's useful for dates.
    return json.dumps(payload, ensure_ascii=False)


def _write(
    db, grounding: dict, question: str, sitter_id: str, intent: str | None, sitter_name: str
) -> tuple[logic.Draft | None, str]:
    """The model's draft after the checks, or (None, why) when it must be replaced by the fixed text."""
    voice = tone.compose(
        db, sitter_id, kind="inquiry", intent=intent, query=logic.situation(question, grounding)
    )
    system = (
        load_prompt("inquiry/system.md") + f"\n\nStyle notes for this sitter: {voice.style_notes}"
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": _facts_message(grounding, question, intent)},
    ]
    try:
        draft, result = nebius.chat_json(
            "fast",
            messages,
            logic.Draft,
            endpoint="inquiry-reply",
            max_tokens=MAX_TOKENS,
            temperature=0.4,
            timeout=TIMEOUT_S,
        )
        draft.reply = logic.fill_placeholders(draft.reply, grounding)
        problems = logic.reply_problems(draft.reply, grounding, question, intent)
        if problems:
            log.info("inquiry-reply broke rules %s; retrying once", problems)
            messages += [
                {"role": "assistant", "content": result.text},
                {
                    "role": "user",
                    "content": "Rewrite the reply without these problems: "
                    + "; ".join(problems)
                    + ". Use only the facts in the JSON, write as the sitter in the first person, and return the same JSON shape.",
                },
            ]
            draft, result = nebius.chat_json(
                "fast",
                messages,
                logic.Draft,
                endpoint="inquiry-reply",
                max_tokens=MAX_TOKENS,
                temperature=0.2,
                timeout=TIMEOUT_S,
            )
            draft.reply = logic.fill_placeholders(draft.reply, grounding)
            if logic.reply_problems(draft.reply, grounding, question, intent):
                return None, "checked-template"
        return draft, result.model
    except (nebius.AIUnavailable, nebius.AIInvalidOutput) as exc:
        log.warning("inquiry-reply: model failed (%s)", exc)
        return None, "failed"
