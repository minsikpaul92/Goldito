"""POST /api/ai/daily-report — the sitter's end-of-day note as a draft (phase-07 7.2).

Assembles the day's records into a `source_snapshot` (the model's whole input), asks Nemotron Super
to write it up in the sitter's voice, and upserts a `daily_reports` draft. Nothing reaches the owner
until the sitter sends it (7.5).
"""

import json
import logging
from datetime import UTC, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.ai import tone
from app.ai.daily_report import (
    CHECK_KEYS,
    MAX_CHIPS,
    NOTE_MAX,
    broken_rules,
    build_snapshot,
    care_intervals,
    clean_overrides,
    day_bounds,
    few_shot_messages,
    has_facts,
    quiet_day_body,
    tidy_body,
    word_count,
)
from app.ai.prompts import load_json, load_prompt
from app.config import get_settings
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import authz, nebius

router = APIRouter(prefix="/api/ai", tags=["ai"])
logger = logging.getLogger("goldito.ai")

TIMEOUT_S = 60.0
MAX_TOKENS = 400
TARGET_WORDS = (60, 220)


class DailyReportRequest(BaseModel):
    pet_id: UUID
    # The chips the sitter kept (their text), a short note, up to two photo descriptions (7.7),
    # and the checks the sitter turned off ("meal" | "potty" | "walk" | "mood" | "meds").
    chips: list[str] = Field(default_factory=list, max_length=MAX_CHIPS)
    sitter_note: str | None = Field(default=None, max_length=NOTE_MAX)
    photos: list[str] = Field(default_factory=list, max_length=2)
    skip: list[str] = Field(default_factory=list, max_length=len(CHECK_KEYS))
    # Corrections to a recorded value: {"meal": "most", "walk": "30"} (see `clean_overrides`).
    overrides: dict[str, str] = Field(default_factory=dict, max_length=len(CHECK_KEYS))


class DailyReportResponse(BaseModel):
    report_id: str
    body: str
    status: str
    model: str
    latency_ms: int


@router.post("/daily-report", response_model=DailyReportResponse)
def daily_report(
    body: DailyReportRequest,
    user: CurrentUser = Depends(get_current_user),
) -> DailyReportResponse:
    authz.assert_on_duty_for(user, body.pet_id)

    db = get_service_client()
    pet_id = str(body.pet_id)
    tz = ZoneInfo(get_settings().app_timezone)
    now = _now()
    day = now.astimezone(tz).date()
    day_start, day_end = day_bounds(day, tz)

    pet = _one(db.table("pets").select("name, species, breed, birthdate, notes").eq("id", pet_id).limit(1).execute())
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet not found.")

    existing = _one(
        db.table("daily_reports")
        .select("id, status")
        .eq("pet_id", pet_id)
        .eq("report_date", day.isoformat())
        .eq("sitter_id", user.id)
        .limit(1)
        .execute()
    )
    if existing and existing["status"] == "sent":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="report_already_sent")

    intervals = care_intervals(_sitter_bookings(db, user.id, pet_id), day_start, day_end)
    if not intervals:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not on duty for this pet today.")

    records = load_day_records(db, pet_id, user.id, day_start, day_end)

    snapshot = build_snapshot(
        pet=pet,
        day=day,
        tz=tz,
        intervals=intervals,
        **records,
        report_photos=body.photos,
        chips=body.chips,
        sitter_note=body.sitter_note,
        skip=body.skip,
        now=now,
        overrides=body.overrides,
    )

    if not has_facts(snapshot):
        # Nothing was recorded: a fixed, honest line — the model is not asked, so it cannot make anything up.
        text, model_name, latency_ms = quiet_day_body(pet["name"]), "template", 0
    else:
        voice = tone.compose(db, user.id, kind="report", query=_report_situation(snapshot))
        messages = [
            {"role": "system", "content": load_prompt("daily_report/system.md") + f"\n\nStyle notes for this sitter: {voice.style_notes}"},
            *few_shot_messages(load_json("daily_report/few_shot.json")),
            {"role": "user", "content": json.dumps(snapshot, ensure_ascii=False)},
        ]
        try:
            result = nebius.chat(
                "report",
                messages,
                endpoint="daily-report",
                max_tokens=MAX_TOKENS,
                temperature=0.4,
                timeout=TIMEOUT_S,
            )
            broken = broken_rules(tidy_body(result.text), snapshot)
            if broken:
                # One more try, told exactly what to fix and a little more careful.
                logger.info("daily-report broke rules %s; retrying once", broken)
                messages += [
                    {"role": "assistant", "content": result.text},
                    {
                        "role": "user",
                        "content": "Rewrite it without these problems: "
                        + "; ".join(broken)
                        + ". Do not use he/she/his/her for the pet and do not say anything was on time or right away. "
                        "Same facts only. Output only the report text.",
                    },
                ]
                result = nebius.chat(
                    "report",
                    messages,
                    endpoint="daily-report",
                    max_tokens=MAX_TOKENS,
                    temperature=0.2,
                    timeout=TIMEOUT_S,
                )
        except nebius.AIUnavailable as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The report helper is unavailable right now. You can write the note yourself.",
            ) from exc
        text, model_name, latency_ms = tidy_body(result.text), result.model, result.latency_ms
        if not text:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Couldn't write the report. Try again.",
            )
        words = word_count(text)
        if not TARGET_WORDS[0] <= words <= TARGET_WORDS[1]:
            logger.info("daily-report length outside target: %s words", words)

    row = {
        "body": text,
        "status": "draft",
        "inputs": {
            "chips": snapshot["chips"],
            "sitter_note": snapshot["sitter_note"],
            "photos": [p["caption"] for p in snapshot["photos"] if p["source"] == "report"],
            "skip": [k for k in body.skip if k in CHECK_KEYS],
            "overrides": clean_overrides(body.overrides),
        },
        "source_snapshot": snapshot,
        "model": model_name,
        "updated_at": now.isoformat(),
    }
    if existing:
        saved = db.table("daily_reports").update(row).eq("id", existing["id"]).execute().data[0]
    else:
        saved = (
            db.table("daily_reports")
            .insert({"pet_id": pet_id, "sitter_id": user.id, "report_date": day.isoformat(), **row})
            .execute()
            .data[0]
        )
    return DailyReportResponse(
        report_id=str(saved["id"]),
        body=text,
        status="draft",
        model=model_name,
        latency_ms=latency_ms,
    )


def load_day_records(db, pet_id: str, sitter_id: str, day_start: datetime, day_end: datetime) -> dict:
    """The day's raw records for one pet and sitter, as the keyword arguments `build_snapshot` takes."""
    lo, hi = day_start.isoformat(), day_end.isoformat()
    tasks = db.table("care_tasks").select("id, type, title, dose, notes").eq("pet_id", pet_id).execute().data
    logs = (
        db.table("task_logs")
        .select("task_id, due_at, status, completed_at")
        .eq("pet_id", pet_id)
        .gte("due_at", lo)
        .lt("due_at", hi)
        .execute()
        .data
    )
    checkins = (
        db.table("care_checkins")
        .select("kind, value, note_text, media_id, created_at")
        .eq("pet_id", pet_id)
        .eq("created_by", sitter_id)
        .gte("created_at", lo)
        .lt("created_at", hi)
        .execute()
        .data
    )
    posts = (
        db.table("feed_posts")
        .select("caption, created_at")
        .eq("pet_id", pet_id)
        .eq("posted_by", sitter_id)
        .eq("visibility", "shared")
        .gte("created_at", lo)
        .lt("created_at", hi)
        .execute()
        .data
    )
    allergies = [a["allergen"] for a in db.table("pet_allergies").select("allergen").eq("pet_id", pet_id).execute().data]
    heads_up = [
        c["text"] for c in db.table("pet_cautions").select("text").eq("pet_id", pet_id).eq("active", True).execute().data
    ]
    return {
        "tasks": tasks,
        "task_logs": logs,
        "checkins": checkins,
        "feed_posts": posts,
        "allergies": allergies,
        "heads_up": heads_up,
    }


def _report_situation(snapshot: dict) -> str:
    """One line for finding the sitter's own earlier reports: the kind of day, never its facts."""
    pet = snapshot["pet"]
    kinds = sorted({c["kind"] for c in snapshot["checkins"]} | {t["type"] for t in snapshot["tasks"]})
    return f"daily report for a {pet['species']}: {', '.join(kinds) or 'quiet day'}"


def _now() -> datetime:
    return datetime.now(UTC)


def _one(response) -> dict | None:
    return response.data[0] if response.data else None


def _sitter_bookings(db, sitter_id: str, pet_id: str) -> list[dict]:
    """This sitter's confirmed bookings that include the pet, each as its agreed drop-off → pick-up."""
    out: list[dict] = []
    bookings = db.table("bookings").select("id").eq("sitter_id", sitter_id).eq("status", "confirmed").execute().data
    for b in bookings:
        if not db.table("booking_pets").select("pet_id").eq("booking_id", b["id"]).eq("pet_id", pet_id).execute().data:
            continue
        handoffs = db.table("booking_handoffs").select("kind, scheduled_at").eq("booking_id", b["id"]).execute().data
        times = {h["kind"]: h["scheduled_at"] for h in handoffs}
        if "drop_off" in times and "pick_up" in times:
            out.append({"drop_off": times["drop_off"], "pick_up": times["pick_up"]})
    return out
