"""Voice sign-up (11.15 S3): a recording becomes text the owner can fix, then facts for the pet profile.

`POST /api/ai/pet-voice/transcribe` is the recording to text. Nothing is saved and the audio is not kept.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.deps.auth import CurrentUser, get_current_user
from app.services import stt

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
    """The request body is the recording itself, with its audio content type (no form, no file name)."""
    _owner_only(user)
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
