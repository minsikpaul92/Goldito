"""Voice sign-up (11.15 S3): a recording becomes text the owner can fix, then facts for the pet profile.

`POST /api/ai/pet-voice/transcribe` is the recording to text; `POST /api/ai/pet-voice` is the (fixed) text to facts.
Nothing is saved, the audio is not kept, and neither the audio nor the words are logged.
"""

import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.ai.pet_voice import Facts, RawFacts, validate_facts
from app.ai.prompts import load_prompt
from app.ai.sitter_voice import Pick, RawPicks, validate_picks
from app.deps.auth import CurrentUser, get_current_user
from app.services import nebius, stt

router = APIRouter(prefix="/api/ai", tags=["ai"])

# 60 seconds of browser audio is well under 1 MB; this leaves room for a high bit rate and still refuses a file upload.
MAX_AUDIO_BYTES = 5 * 1024 * 1024


class TranscribeResponse(BaseModel):
    transcript: str


def _owner_only(user: CurrentUser) -> None:
    if user.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owners can use this.")


@router.post("/pet-voice/transcribe", response_model=TranscribeResponse)
async def pet_voice_transcribe(request: Request, user: CurrentUser = Depends(get_current_user)) -> TranscribeResponse:
    """The request body is the recording itself, with its audio content type (no form, no file name).

    Owners (pet answers) and sitters (onboarding answers) both use it; it only turns sound into text."""
    content_type = request.headers.get("content-type", "")
    if stt.audio_extension(content_type) is None:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Send the recording as audio.")
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="That recording is too long.")
    audio = await request.body()
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="That recording is too long.")
    if len(audio) < 1000:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That recording is empty.")

    try:
        text = await run_in_threadpool(stt.transcribe, audio, content_type, hint="A pet owner describing their dog or cat.")
    except stt.STTUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice isn't available right now. You can type it instead.",
        ) from exc
    except stt.STTFailed as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="We couldn't read that recording. Try again, or type it instead.",
        ) from exc
    return TranscribeResponse(transcript=text)


class Option(BaseModel):
    value: str = Field(min_length=1, max_length=20)
    label: str = Field(min_length=1, max_length=80)


class Question(BaseModel):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{0,11}$")
    prompt: str = Field(min_length=1, max_length=200)
    options: list[Option] = Field(min_length=2, max_length=6)


class PetVoiceRequest(BaseModel):
    species: Literal["dog", "cat"]
    name: str = Field(default="", max_length=40)
    transcript: str = Field(min_length=1, max_length=1500)
    # The questions the app still has open, with their options: the app is the one source of the wording.
    questions: list[Question] = Field(default_factory=list, max_length=30)


class PetVoiceResponse(Facts):
    model: str
    latency_ms: int


EXTRACT_TIMEOUT_S = 20.0


@router.post("/pet-voice", response_model=PetVoiceResponse)
def pet_voice(body: PetVoiceRequest, user: CurrentUser = Depends(get_current_user)) -> PetVoiceResponse:
    """Facts from what the owner said, each with a quote the server found in the text. A suggestion, never a save."""
    _owner_only(user)
    text = " ".join(body.transcript.split())
    if not text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Say or type something first.")

    # The name is only a label for the model; it is not trusted as an instruction.
    context = {
        "pet": {"name": body.name.strip() or None, "species": body.species},
        "questions": [
            {"key": q.key, "question": q.prompt, "options": [{"value": o.value, "label": o.label} for o in q.options]}
            for q in body.questions
        ],
    }
    messages = [
        {"role": "system", "content": load_prompt("pet_voice/system.md")},
        {"role": "user", "content": f"{json.dumps(context, ensure_ascii=False)}\n\n<transcript>\n{text}\n</transcript>"},
    ]
    try:
        raw, result = nebius.chat_json(
            "fast", messages, RawFacts, endpoint="pet-voice", timeout=EXTRACT_TIMEOUT_S, max_tokens=700
        )
    except nebius.AIUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="We couldn't read that just now. You can answer the questions yourself.",
        ) from exc
    except nebius.AIInvalidOutput as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="We couldn't read that just now. You can answer the questions yourself.",
        ) from exc

    options = {q.key: {o.value for o in q.options} for q in body.questions}
    facts = validate_facts(raw, text, options)
    return PetVoiceResponse(**facts.model_dump(), model=result.model, latency_ms=result.latency_ms)


class SitterQuestion(BaseModel):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{0,23}$")
    prompt: str = Field(min_length=1, max_length=200)
    multi: bool = False
    options: list[Option] = Field(min_length=2, max_length=8)


class SitterVoiceRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=1500)
    # Each question with its options and whether several may be picked: the app is the one source of the wording.
    questions: list[SitterQuestion] = Field(min_length=1, max_length=20)




class SitterVoiceResponse(BaseModel):
    answers: dict[str, Pick]
    model: str
    latency_ms: int


@router.post("/sitter-voice", response_model=SitterVoiceResponse)
def sitter_voice(body: SitterVoiceRequest, user: CurrentUser = Depends(get_current_user)) -> SitterVoiceResponse:
    """Picks for the sitter's onboarding questions from what they said, each with a quote the server found in the text."""
    if user.role != "sitter":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only sitters can use this.")
    text = " ".join(body.transcript.split())
    if not text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Say or type something first.")

    context = [
        {"key": q.key, "question": q.prompt, "multi": q.multi, "options": [{"value": o.value, "label": o.label} for o in q.options]}
        for q in body.questions
    ]
    messages = [
        {"role": "system", "content": load_prompt("sitter_voice/system.md")},
        {"role": "user", "content": f"{json.dumps({'questions': context}, ensure_ascii=False)}\n\n<transcript>\n{text}\n</transcript>"},
    ]
    try:
        raw, result = nebius.chat_json(
            "fast", messages, RawPicks, endpoint="sitter-voice", timeout=EXTRACT_TIMEOUT_S, max_tokens=700
        )
    except (nebius.AIUnavailable, nebius.AIInvalidOutput) as exc:
        code = status.HTTP_503_SERVICE_UNAVAILABLE if isinstance(exc, nebius.AIUnavailable) else status.HTTP_502_BAD_GATEWAY
        raise HTTPException(status_code=code, detail="We couldn't read that just now. You can answer the questions yourself.") from exc

    options = {q.key: ({o.value for o in q.options}, q.multi) for q in body.questions}
    return SitterVoiceResponse(answers=validate_picks(raw, text, options), model=result.model, latency_ms=result.latency_ms)
