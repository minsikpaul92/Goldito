"""POST /api/tone/record-reply — learn from what the sitter sent (phase-07B 7B.9, D35 · D36).

Called by the app right after the sitter sends. For each reply that started as an AI draft and that the sitter
approved themselves (`confirmed_by_sitter_at`), it stores a style sample: `approved` when the text is the draft,
`edited` with an `edit_ratio` when they changed it. Auto-sent replies (no confirmation) are never recorded.
Everything stored is anonymized first. One sample per message, so calling it twice is harmless.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.ai import tone
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import nebius

router = APIRouter(prefix="/api/tone", tags=["tone"])
log = logging.getLogger("pawddy.ai")


class RecordRequest(BaseModel):
    inquiry_id: UUID


class RecordResponse(BaseModel):
    recorded: int


@router.post("/record-reply", response_model=RecordResponse)
def record_reply(body: RecordRequest, user: CurrentUser = Depends(get_current_user)) -> RecordResponse:
    db = get_service_client()
    found = db.table("inquiries").select("*").eq("id", str(body.inquiry_id)).limit(1).execute()
    if not found.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found.")
    inquiry = found.data[0]
    if inquiry["sitter_id"] != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This isn't your inquiry.")

    messages = db.table("inquiry_messages").select("*").eq("inquiry_id", inquiry["id"]).execute().data
    messages.sort(key=lambda m: str(m.get("created_at", "")))
    done = {
        r["source_message_id"]
        for r in db.table("tone_samples").select("source_message_id").eq("sitter_id", user.id).execute().data
        if r.get("source_message_id")
    }
    owner = (db.table("profiles").select("display_name").eq("id", inquiry["owner_id"]).limit(1).execute().data or [{}])[0]
    pets = db.table("pets").select("name").in_("id", [str(p) for p in inquiry["pet_ids"]]).execute().data
    names = {
        "owner_names": [n for n in (owner.get("display_name") or "").split() if n],
        "pet_names": [p["name"] for p in pets],
    }

    recorded = 0
    for i, message in enumerate(messages):
        if message["author"] != "sitter" or not message.get("drafted_by_ai") or not message.get("confirmed_by_sitter_at"):
            continue  # typed by the sitter, or sent automatically: not a sample
        if message["id"] in done:
            continue
        before = messages[:i]
        draft = next((m for m in reversed(before) if m["author"] == "ai"), None)
        question = next((m for m in reversed(before) if m["author"] == "owner"), None)
        if not draft or not question:
            continue
        final = message["body"].strip()
        source = "approved" if final == draft["body"].strip() else "edited"
        try:
            tone.record_sample(
                db,
                sitter_id=user.id,
                source=source,
                kind="inquiry",
                intent=(draft.get("grounding") or {}).get("intent"),
                context_summary=tone.anonymize(f"{inquiry['service_type']}: {question['body']}", **names),
                draft=tone.anonymize(draft["body"], **names),
                final_text=tone.anonymize(final, **names),
                source_message_id=message["id"],
            )
            recorded += 1
        except (nebius.AIUnavailable, ValueError) as exc:
            log.info("tone: not recorded (%s)", exc)
    return RecordResponse(recorded=recorded)
