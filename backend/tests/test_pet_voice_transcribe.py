"""Voice sign-up, step one: a recording becomes text (11.15 S3). Groq is stubbed; the key and the audio are never logged."""

import httpx
import pytest
from app.config import get_settings
from app.services import stt

from tests import test_media_sign as base
from tests.test_media_sign import owner_token, sitter_token

isolated_settings = base.isolated_settings
client = base.client

AUDIO = b"\x1aE\xdf\xa3" + b"x" * 2000


@pytest.fixture
def groq_key(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class FakeResponse:
    def __init__(self, body=None, status=200):
        self._body, self.status_code = body if body is not None else {"text": " Max is a  Maltese. "}, status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("x", request=httpx.Request("POST", stt.GROQ_URL), response=self)

    def json(self):
        return self._body


def headers(token: str, content_type: str = "audio/webm;codecs=opus") -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": content_type}


def test_the_recording_goes_to_groq_and_the_text_comes_back_tidy(client, monkeypatch, groq_key) -> None:
    sent = {}

    def post(url, headers, data, files, timeout):
        sent.update(url=url, headers=headers, data=data, files=files)
        return FakeResponse()

    monkeypatch.setattr(stt.httpx, "post", post)
    response = client.post("/api/ai/pet-voice/transcribe", content=AUDIO, headers=headers(owner_token()))
    assert response.status_code == 200
    assert response.json() == {"transcript": "Max is a Maltese."}
    assert sent["url"] == stt.GROQ_URL
    assert sent["headers"]["Authorization"] == "Bearer gsk-test"
    assert sent["data"]["model"] == "whisper-large-v3-turbo"
    name, body, mime = sent["files"]["file"]
    assert name == "voice.webm" and body == AUDIO and mime == "audio/webm"


def test_safari_recordings_are_mp4(client, monkeypatch, groq_key) -> None:
    sent = {}
    monkeypatch.setattr(stt.httpx, "post", lambda *a, **k: sent.update(k) or FakeResponse())
    assert client.post("/api/ai/pet-voice/transcribe", content=AUDIO, headers=headers(owner_token(), "audio/mp4")).status_code == 200
    assert sent["files"]["file"][0] == "voice.m4a"


def test_owners_and_sitters_may_send_a_recording_but_not_without_signing_in(client, monkeypatch, groq_key) -> None:
    monkeypatch.setattr(stt.httpx, "post", lambda *a, **k: FakeResponse())
    assert client.post("/api/ai/pet-voice/transcribe", content=AUDIO, headers=headers(sitter_token())).status_code == 200
    assert client.post("/api/ai/pet-voice/transcribe", content=AUDIO, headers={"Content-Type": "audio/webm"}).status_code == 401


def test_something_that_is_not_audio_is_refused(client, monkeypatch, groq_key) -> None:
    monkeypatch.setattr(stt.httpx, "post", lambda *a, **k: pytest.fail("must not reach the speech service"))
    response = client.post("/api/ai/pet-voice/transcribe", content=AUDIO, headers=headers(owner_token(), "application/json"))
    assert response.status_code == 415


def test_an_empty_or_huge_recording_is_refused_before_anything_is_sent(client, monkeypatch, groq_key) -> None:
    monkeypatch.setattr(stt.httpx, "post", lambda *a, **k: pytest.fail("must not reach the speech service"))
    assert client.post("/api/ai/pet-voice/transcribe", content=b"abc", headers=headers(owner_token())).status_code == 422
    big = b"x" * (5 * 1024 * 1024 + 1)
    assert client.post("/api/ai/pet-voice/transcribe", content=big, headers=headers(owner_token())).status_code == 413


def test_no_key_says_voice_is_unavailable_and_to_type(client, monkeypatch) -> None:
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setattr(stt, "get_settings", lambda: get_settings().model_copy(update={"groq_api_key": None}))
    response = client.post("/api/ai/pet-voice/transcribe", content=AUDIO, headers=headers(owner_token()))
    assert response.status_code == 503
    assert "type" in response.json()["detail"]


def test_a_service_error_and_a_timeout_are_told_apart(client, monkeypatch, groq_key) -> None:
    monkeypatch.setattr(stt.httpx, "post", lambda *a, **k: FakeResponse(status=429))
    assert client.post("/api/ai/pet-voice/transcribe", content=AUDIO, headers=headers(owner_token())).status_code == 502

    def slow(*a, **k):
        raise httpx.ReadTimeout("slow")

    monkeypatch.setattr(stt.httpx, "post", slow)
    assert client.post("/api/ai/pet-voice/transcribe", content=AUDIO, headers=headers(owner_token())).status_code == 503


def test_a_reply_without_text_is_a_failure(client, monkeypatch, groq_key) -> None:
    monkeypatch.setattr(stt.httpx, "post", lambda *a, **k: FakeResponse({"nope": 1}))
    assert client.post("/api/ai/pet-voice/transcribe", content=AUDIO, headers=headers(owner_token())).status_code == 502


def test_nothing_said_is_an_empty_text(client, monkeypatch, groq_key) -> None:
    monkeypatch.setattr(stt.httpx, "post", lambda *a, **k: FakeResponse({"text": " "}))
    response = client.post("/api/ai/pet-voice/transcribe", content=AUDIO, headers=headers(owner_token()))
    assert response.status_code == 200 and response.json() == {"transcript": ""}


def test_extensions() -> None:
    assert stt.audio_extension("audio/webm;codecs=opus") == "webm"
    assert stt.audio_extension("AUDIO/MP4") == "m4a"
    assert stt.audio_extension("video/webm") is None
    assert stt.audio_extension(None) is None
