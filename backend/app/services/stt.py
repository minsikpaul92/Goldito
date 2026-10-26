"""Speech to text for voice sign-up (11.15 S3).

Token Factory has no speech-to-text, so the recording goes to Groq (`whisper-large-v3-turbo`, free plan, OpenAI-style
endpoint). The audio is sent once and never stored; only the text comes back. Nothing here logs the audio or the text.
"""

import logging
import time

import httpx

from app.config import get_settings

log = logging.getLogger("goldito.ai")

GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
TIMEOUT_S = 20.0

# What the browsers record: Chrome and Firefox webm or ogg, Safari mp4. The extension tells Groq the format.
EXTENSIONS = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
}


class STTUnavailable(RuntimeError):
    """No key is set, or the service cannot be reached."""


class STTFailed(RuntimeError):
    """The service answered with an error or something that is not text."""


def audio_extension(content_type: str | None) -> str | None:
    """`audio/webm;codecs=opus` is webm; anything that is not a known audio type is None."""
    base = (content_type or "").split(";", 1)[0].strip().lower()
    return EXTENSIONS.get(base)


def transcribe(audio: bytes, content_type: str, *, hint: str | None = None, timeout: float = TIMEOUT_S) -> str:
    """The words in the recording, as plain text ('' when nothing was said)."""
    settings = get_settings()
    if not settings.groq_api_key:
        raise STTUnavailable("GROQ_API_KEY is not set.")
    extension = audio_extension(content_type)
    if extension is None:
        raise STTFailed("Unsupported audio type.")

    data = {"model": settings.groq_stt_model, "response_format": "json", "temperature": "0"}
    if hint:
        # A short hint helps with names and breeds; Whisper uses it as the start of the text.
        data["prompt"] = hint[:200]
    started = time.perf_counter()
    ok = False
    try:
        response = httpx.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            data=data,
            files={"file": (f"voice.{extension}", audio, f"audio/{extension}")},
            timeout=timeout,
        )
        response.raise_for_status()
        text = response.json().get("text")
        if not isinstance(text, str):
            raise STTFailed("The speech service did not return text.")
        ok = True
        return " ".join(text.split())
    except httpx.TimeoutException as exc:
        raise STTUnavailable("The speech service took too long.") from exc
    except httpx.HTTPStatusError as exc:
        raise STTFailed(f"The speech service answered {exc.response.status_code}.") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise STTUnavailable("The speech service could not be reached.") from exc
    finally:
        # Numbers only: never the audio and never the words.
        log.info(
            "stt_call ok=%s ms=%d bytes=%d", ok, int((time.perf_counter() - started) * 1000), len(audio)
        )
