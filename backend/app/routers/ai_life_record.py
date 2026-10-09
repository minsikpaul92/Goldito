"""POST /api/ai/life-record — a finished stay → one Pet Life Record per pet (phase-07C 7C.4).

Called by the app right after Returned (and by the booking page's Retry). One record per booking × pet: asking again
returns what is saved. The record is written by Nemotron Super from a facts-only `source_snapshot`, checked against
that evidence, stored, indexed for search (so the NEXT sitter's request, inquiry answers and care checklist can use it)
and the owner is told. A stay that was not finished is a 409; a model failure is a 503 and saves nothing for that pet.
"""

import json
import logging
from datetime import UTC, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.ai import life_record as lr
from app.ai.daily_report import parse_ts
from app.ai.prompts import load_prompt
from app.config import get_settings
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import nebius, rag

router = APIRouter(prefix="/api/ai", tags=["ai"])
log = logging.getLogger("goldito.ai")

TIMEOUT_S = 60.0
MAX_TOKENS = 700


class LifeRecordRequest(BaseModel):
    booking_id: UUID


class PetRecord(BaseModel):
    pet_id: str
    pet_name: str
    record_id: str
    summary: dict
    reused: bool


class LifeRecordResponse(BaseModel):
    records: list[PetRecord]


def _now() -> datetime:
    return datetime.now(UTC)


@router.post("/life-record", response_model=LifeRecordResponse)
def life_record(body: LifeRecordRequest, user: CurrentUser = Depends(get_current_user)) -> LifeRecordResponse:
    db = get_service_client()
    booking_id = str(body.booking_id)
    found = db.table("bookings").select("id, owner_id, sitter_id, status").eq("id", booking_id).limit(1).execute().data
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    booking = found[0]
    if user.id not in (booking["owner_id"], booking["sitter_id"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This isn't your booking.")

    handoffs = db.table("booking_handoffs").select("kind, status, scheduled_at, completed_at").eq("booking_id", booking_id).execute().data
    drop = next((h for h in handoffs if h["kind"] == "drop_off" and h["status"] == "agreed"), None)
    pick = next((h for h in handoffs if h["kind"] == "pick_up" and h["status"] == "agreed"), None)
    if booking["status"] != "confirmed" or not pick or not pick.get("completed_at"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="stay_not_finished")

    tz = ZoneInfo(get_settings().app_timezone)
    start = parse_ts((drop or {}).get("completed_at") or (drop or {}).get("scheduled_at") or pick["scheduled_at"])
    end = parse_ts(pick["completed_at"])
    pet_ids = [bp["pet_id"] for bp in db.table("booking_pets").select("pet_id").eq("booking_id", booking_id).execute().data]

    records: list[PetRecord] = []
    for pet_id in pet_ids:
        pet = db.table("pets").select("id, name, species, breed, birthdate").eq("id", pet_id).limit(1).execute().data
        if not pet:
            continue
        pet = pet[0]
        saved = (
            db.table("pet_life_records").select("id, summary").eq("booking_id", booking_id).eq("pet_id", pet_id).limit(1).execute().data
        )
        if saved:
            records.append(PetRecord(pet_id=pet_id, pet_name=pet["name"], record_id=str(saved[0]["id"]), summary=saved[0]["summary"], reused=True))
            continue
        records.append(_write_record(db, booking, pet, start, end, tz))
    return LifeRecordResponse(records=records)


def _write_record(db, booking: dict, pet: dict, start: datetime, end: datetime, tz) -> PetRecord:
    pet_id = str(pet["id"])
    sitter_id = booking["sitter_id"]
    allergies = [a["allergen"] for a in db.table("pet_allergies").select("allergen").eq("pet_id", pet_id).execute().data]
    cautions = [c["text"] for c in db.table("pet_cautions").select("text, active").eq("pet_id", pet_id).execute().data if c.get("active")]
    tasks = db.table("care_tasks").select("id, type, title").eq("pet_id", pet_id).execute().data
    logs = db.table("task_logs").select("task_id, due_at, status, note_text").eq("pet_id", pet_id).execute().data
    checkins = db.table("care_checkins").select("kind, value, note_text, created_at").eq("pet_id", pet_id).eq("created_by", sitter_id).execute().data
    reports = [
        r["body"]
        for r in sorted(
            db.table("daily_reports").select("body, report_date, sent_at").eq("pet_id", pet_id).eq("sitter_id", sitter_id).eq("status", "sent").execute().data,
            key=lambda r: str(r.get("sent_at") or ""),
        )
    ]
    questions: list[str] = []
    for inquiry in db.table("inquiries").select("id, pet_ids").eq("owner_id", booking["owner_id"]).eq("sitter_id", sitter_id).execute().data:
        if pet_id not in [str(p) for p in inquiry["pet_ids"]]:
            continue
        questions += [
            m["body"]
            for m in db.table("inquiry_messages").select("body, author").eq("inquiry_id", inquiry["id"]).eq("author", "owner").execute().data
        ]
    earlier = sorted(
        (r for r in db.table("pet_life_records").select("summary, created_at, booking_id").eq("pet_id", pet_id).execute().data if r["booking_id"] != booking["id"]),
        key=lambda r: str(r["created_at"]),
    )

    snapshot = lr.build_snapshot(
        pet=pet, allergies=allergies, cautions=cautions, tasks=tasks, task_logs=logs, checkins=checkins,
        reports=reports, owner_questions=questions, previous=earlier[-1]["summary"] if earlier else None,
        start=start, end=end, now=_now(), tz=tz,
    )
    lr.assert_no_secrets(snapshot)

    messages = [
        {"role": "system", "content": load_prompt("life_record/system.md")},
        {"role": "user", "content": json.dumps(snapshot, ensure_ascii=False)},
    ]
    try:
        parsed, result = nebius.chat_json("report", messages, lr.LifeRecord, endpoint="life-record", max_tokens=MAX_TOKENS, temperature=0.2, timeout=TIMEOUT_S)
    except (nebius.AIUnavailable, nebius.AIInvalidOutput) as exc:
        log.warning("life-record: model failed (%s)", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Couldn't write {pet['name']}'s Life Record right now. Try again.",
        ) from exc

    summary = lr.enforce(parsed, snapshot)
    text = lr.record_text(summary)
    row = (
        db.table("pet_life_records")
        .insert(
            {
                "pet_id": pet_id, "booking_id": booking["id"], "sitter_id": sitter_id, "summary": summary,
                "body": text, "source_snapshot": snapshot, "model": result.model,
                "stay_from": snapshot["stay"]["from"], "stay_to": snapshot["stay"]["to"],
            }
        )
        .execute()
        .data[0]
    )
    if text:
        try:
            rag.index_source(db, source_type="life_record", source_id=str(row["id"]), text=text, pet_id=pet_id)
        except (nebius.AIUnavailable, ValueError):
            log.info("life-record: not indexed")
    db.table("notifications").insert(
        {
            "user_id": booking["owner_id"], "pet_id": pet_id, "booking_id": booking["id"], "type": "life_record_updated",
            "title": f"{pet['name']}'s Life Record is updated 📖", "ref_id": row["id"],
        }
    ).execute()
    return PetRecord(pet_id=pet_id, pet_name=pet["name"], record_id=str(row["id"]), summary=summary, reused=False)
