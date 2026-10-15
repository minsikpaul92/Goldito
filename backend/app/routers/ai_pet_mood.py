"""POST /api/ai/pet-mood — Snap → Mood (Phase 12.2a, D61, D42 as changed by D61).

The browser finds each pet (MediaPipe box) and sends the crops — one frame for a photo, four for a short video.
Per crop the vision model returns body-language tags only; the server's rule table (`ai/mood_rules.py`) turns them
into eight emotion percentages that add up to 100, averaged over the frames; the fast model writes one "seems" line
per pet. For fun only — nothing is saved, and the disclaimer always comes back with the result.
"""

import base64
import binascii
import json
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator, model_validator

from app.ai import mood_rules
from app.ai.prompts import load_prompt
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import authz, nebius

router = APIRouter(prefix="/api/ai", tags=["ai"])
log = logging.getLogger("goldito.ai")

MAX_CROPS = 8
MAX_FRAMES = 4
MAX_CROP_BYTES = 300_000
VISION_TIMEOUT_S = 25.0
VISION_WORKERS = 4
SUMMARY_TIMEOUT_S = 15.0
SUMMARY_MAX = 140
DISCLAIMER = "For fun only — not a behavior or health assessment."
IMAGE_PREFIXES = ("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,")
# A summary that says any of these falls back to the rule sentence (D42: no medical or pain words).
BANNED_WORDS = re.compile(
    r"\b(pain\w*|hurt\w*|sick\w*|ill|illness|injur\w*|disease\w*|diagnos\w*|symptom\w*|vets?|veterinar\w*|"
    r"medic\w*|stress\w*|depress\w*|abuse\w*|suffer\w*|health\w*)\b"
)


class Box(BaseModel):
    """Where the pet is in the frame, as fractions of its width and height."""

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)


class Crop(BaseModel):
    box: Box
    image: str

    @field_validator("image")
    @classmethod
    def _image(cls, value: str) -> str:
        prefix = next((p for p in IMAGE_PREFIXES if value.startswith(p)), None)
        if not prefix:
            raise ValueError("crop must be a JPEG, PNG or WebP data URL")
        try:
            size = len(base64.b64decode(value[len(prefix):], validate=True))
        except (binascii.Error, ValueError) as exc:
            raise ValueError("crop is not valid base64") from exc
        if size > MAX_CROP_BYTES:
            raise ValueError("crop is too large (300 KB max)")
        return value


class Frame(BaseModel):
    index: int = Field(ge=0)
    # Left to right as the app sorts them: the n-th crop of every frame is the same pet.
    crops: list[Crop] = Field(default_factory=list)


class PetMoodRequest(BaseModel):
    pet_id: UUID | None = None
    frames: list[Frame] = Field(min_length=1, max_length=MAX_FRAMES)

    @model_validator(mode="after")
    def _limits(self):
        total = sum(len(f.crops) for f in self.frames)
        if total == 0:
            raise ValueError("no pet crops")
        if total > MAX_CROPS:
            raise ValueError(f"at most {MAX_CROPS} crops")
        return self


class MoodTags(BaseModel):
    """What the vision model saw (values off the list become `not_visible`)."""

    species: str = "none"
    ears: str = "not_visible"
    eyes: str = "not_visible"
    mouth: str = "not_visible"
    tail: str = "not_visible"
    posture: str = "not_visible"
    body_tension: str = "not_visible"
    activity: str = "not_visible"
    toy: str = "not_visible"

    @field_validator("species", mode="before")
    @classmethod
    def _species(cls, value):
        text = str(value or "").strip().lower()
        return text if text in ("dog", "cat") else "none"

    @model_validator(mode="after")
    def _clean(self):
        for field in mood_rules.FIELDS:
            setattr(self, field, mood_rules.clean_tag(field, getattr(self, field)))
        return self


class Summaries(BaseModel):
    summaries: list[str] = Field(default_factory=list)


class Emotions(BaseModel):
    happy: int
    relaxed: int
    excited: int
    curious: int
    sleepy: int
    anxious: int
    angry: int
    sad: int


class PetMood(BaseModel):
    frame: int
    box: Box
    emotions: Emotions
    top: str
    summary: str
    frames_used: int


class PetMoodResponse(BaseModel):
    pets: list[PetMood]
    disclaimer: str
    model: str
    latency_ms: int


def _pet(user: CurrentUser, pet_id: UUID | None) -> dict | None:
    """The named pet, when there is one: its owner, or the sitter on duty for it (same rule as Treat check)."""
    if pet_id is None:
        return None
    if user.role == "owner":
        authz.assert_owner_of(user, pet_id)
    else:
        authz.assert_on_duty_for(user, pet_id)
    rows = get_service_client().table("pets").select("id, name, species").eq("id", str(pet_id)).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet not found.")
    return rows[0]


def _vision_prompt() -> str:
    text = load_prompt("mood/vision_system.md")
    for field in mood_rules.FIELDS:
        text = text.replace("{" + field + "}", ", ".join(f'"{v}"' for v in mood_rules.tag_options(field)))
    return text


def _read(image: str) -> tuple[MoodTags, str] | None:
    """Tags for one crop, or None when the model is unavailable or answers badly — that crop is just left out."""
    try:
        tags, result = nebius.chat_json(
            "vision",
            [
                {"role": "system", "content": _vision_prompt()},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Tag this pet's body language."},
                        {"type": "image_url", "image_url": {"url": image}},
                    ],
                },
            ],
            MoodTags,
            endpoint="pet-mood-vision",
            max_tokens=200,
            temperature=0.0,
            timeout=VISION_TIMEOUT_S,
        )
    except (nebius.AIUnavailable, nebius.AIInvalidOutput) as exc:
        log.info("pet-mood: a crop was left out (%s)", exc.__class__.__name__)
        return None
    return tags, result.model


def _clean_summary(text: str) -> str | None:
    line = " ".join(nebius.strip_think(str(text or "")).split()).strip().strip('"')
    lower = f" {line.lower()} "
    if not line or len(line) > SUMMARY_MAX or not any(w in lower for w in (" seem", " look")):
        return None
    if BANNED_WORDS.search(lower):
        return None
    return line


def _summaries(pet: dict | None, moods: list[dict]) -> list[str]:
    name = pet["name"] if pet and len(moods) == 1 else None
    fallbacks = [mood_rules.fallback_summary(name, m["species"], m["emotions"]) for m in moods]
    facts = [
        {
            "name": name,
            "species": m["species"],
            "moods": {e: v for e, v in sorted(m["emotions"].items(), key=lambda kv: -kv[1])[:3]},
            "activity": m["activity"],
        }
        for m in moods
    ]
    try:
        parsed, _ = nebius.chat_json(
            "fast",
            [
                {"role": "system", "content": load_prompt("mood/summary_system.md")},
                {"role": "user", "content": json.dumps({"pets": facts}, ensure_ascii=False)},
            ],
            Summaries,
            endpoint="pet-mood-summary",
            max_tokens=200,
            temperature=0.7,
            timeout=SUMMARY_TIMEOUT_S,
        )
    except (nebius.AIUnavailable, nebius.AIInvalidOutput) as exc:
        log.info("pet-mood: rule summaries (%s)", exc.__class__.__name__)
        return fallbacks
    out = []
    for i, fallback in enumerate(fallbacks):
        line = _clean_summary(parsed.summaries[i]) if i < len(parsed.summaries) else None
        out.append(line or fallback)
    return out


@router.post("/pet-mood", response_model=PetMoodResponse)
def pet_mood(body: PetMoodRequest, user: CurrentUser = Depends(get_current_user)) -> PetMoodResponse:
    started = time.monotonic()
    pet = _pet(user, body.pet_id)
    frames = sorted(body.frames, key=lambda f: f.index)
    jobs = [(fi, ci, crop) for fi, frame in enumerate(frames) for ci, crop in enumerate(frame.crops)]
    with ThreadPoolExecutor(max_workers=min(VISION_WORKERS, len(jobs))) as pool:
        answers = list(pool.map(lambda job: _read(job[2].image), jobs))

    # The n-th crop of every frame is the same pet; a crop the model could not read or that shows no pet is left out.
    per_pet: dict[int, list[dict]] = {}
    model = "rules"
    for (fi, ci, crop), answer in zip(jobs, answers, strict=True):
        if answer is None:
            continue
        tags, model = answer
        if tags.species == "none":
            continue
        per_pet.setdefault(ci, []).append(
            {"frame": frames[fi].index, "box": crop.box, "tags": tags, "emotions": mood_rules.percentages(tags.model_dump())}
        )
    if not per_pet:
        if all(a is None for a in answers):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Couldn't read the mood right now. Try again in a moment.",
            )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="We couldn't find a pet — try a clearer photo."
        )

    moods = []
    for ci in sorted(per_pet):
        seen = per_pet[ci]
        emotions = mood_rules.average(s["emotions"] for s in seen)
        shown = seen[mood_rules.closest([s["emotions"] for s in seen], emotions)]
        species = max(("dog", "cat"), key=lambda sp: sum(s["tags"].species == sp for s in seen))
        moods.append(
            {
                "frame": shown["frame"], "box": shown["box"], "emotions": emotions, "species": species,
                "activity": mood_rules.resolve(shown["tags"].model_dump())["activity"], "frames_used": len(seen),
            }
        )
    lines = _summaries(pet, moods)

    return PetMoodResponse(
        pets=[
            PetMood(
                frame=m["frame"], box=m["box"], emotions=Emotions(**m["emotions"]), top=mood_rules.top(m["emotions"]),
                summary=line, frames_used=m["frames_used"],
            )
            for m, line in zip(moods, lines, strict=True)
        ],
        disclaimer=DISCLAIMER,
        model=model,
        latency_ms=int((time.monotonic() - started) * 1000),
    )
