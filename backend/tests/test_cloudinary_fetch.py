"""fetch_as_data_url — model-sized image from Cloudinary as a base64 data URL (phase-04 4.6)."""

import base64

import httpx
import pytest
from app.config import get_settings
from app.services import cloudinary as cloudinary_service
from app.services.cloudinary import MediaFetchError, fetch_as_data_url, vision_url

PET_ID = "00000000-0000-4000-8000-0000000000aa"
IMAGE_ID = f"pawnote/{PET_ID}/feed/abc123"
JPEG_BYTES = b"\xff\xd8\xff\xe0fake-jpeg-bytes"


@pytest.fixture(autouse=True)
def cloudinary_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "pawnote-test")
    monkeypatch.setenv("CLOUDINARY_API_KEY", "123456789012345")
    monkeypatch.setenv("CLOUDINARY_API_SECRET", "cloudinary-api-secret-for-tests")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def client_returning(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_vision_url_image_is_1024_jpeg_without_upscale() -> None:
    assert vision_url(IMAGE_ID) == (
        f"https://res.cloudinary.com/pawnote-test/image/upload/c_limit,w_1024,f_jpg/{IMAGE_ID}"
    )


def test_vision_url_video_uses_first_frame_poster() -> None:
    url = vision_url(f"pawnote/{PET_ID}/report/clip1", "video")
    assert url == (
        "https://res.cloudinary.com/pawnote-test/video/upload/"
        f"so_0,c_limit,w_1024,f_jpg/pawnote/{PET_ID}/report/clip1.jpg"
    )


@pytest.mark.parametrize(
    "public_id",
    [
        "",
        "sample",  # not ours
        "pawnote/",
        "pawnote/only-one-part",
        f"other/{PET_ID}/feed/abc",
        f"pawnote/{PET_ID}/feed/../../secret",
        f"pawnote/{PET_ID}/feed/abc?x=1",
        f"pawnote/{PET_ID}/feed/abc#frag",
        f"pawnote/{PET_ID}/feed/abc.jpg",
        f"pawnote/{PET_ID}/feed/a b",
        "https://evil.example/pawnote/x/y/z",
    ],
)
def test_vision_url_rejects_ids_that_are_not_ours(public_id: str) -> None:
    with pytest.raises(ValueError):
        vision_url(public_id)


def test_vision_url_rejects_unknown_resource_type() -> None:
    with pytest.raises(ValueError):
        vision_url(IMAGE_ID, "raw")


def test_fetch_returns_base64_data_url() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, content=JPEG_BYTES, headers={"content-type": "image/jpeg"})

    data_url = fetch_as_data_url(IMAGE_ID, http=client_returning(handler))

    assert seen == [vision_url(IMAGE_ID)]
    prefix = "data:image/jpeg;base64,"
    assert data_url.startswith(prefix)
    assert base64.b64decode(data_url[len(prefix) :]) == JPEG_BYTES


def test_fetch_video_asks_for_the_poster_frame() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, content=JPEG_BYTES, headers={"content-type": "image/jpeg"})

    fetch_as_data_url(f"pawnote/{PET_ID}/report/clip1", "video", http=client_returning(handler))
    assert "/video/upload/so_0," in seen[0]
    assert seen[0].endswith(".jpg")


def test_fetch_maps_http_errors_to_media_fetch_error() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, text="Resource not found")

    with pytest.raises(MediaFetchError, match="404"):
        fetch_as_data_url(IMAGE_ID, http=client_returning(handler))


def test_fetch_maps_network_errors_to_media_fetch_error() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timed out")

    with pytest.raises(MediaFetchError, match="reach"):
        fetch_as_data_url(IMAGE_ID, http=client_returning(handler))


def test_fetch_rejects_non_image_response() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>login</html>", headers={"content-type": "text/html"})

    with pytest.raises(MediaFetchError, match="not return an image"):
        fetch_as_data_url(IMAGE_ID, http=client_returning(handler))


def test_fetch_rejects_empty_and_oversized_bodies(monkeypatch: pytest.MonkeyPatch) -> None:
    def empty(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"", headers={"content-type": "image/jpeg"})

    with pytest.raises(MediaFetchError):
        fetch_as_data_url(IMAGE_ID, http=client_returning(empty))

    monkeypatch.setattr(cloudinary_service, "VISION_MAX_BYTES", 8)

    def big(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=JPEG_BYTES, headers={"content-type": "image/jpeg"})

    with pytest.raises(MediaFetchError, match="too large"):
        fetch_as_data_url(IMAGE_ID, http=client_returning(big))


def test_bad_public_id_never_reaches_the_network() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request expected")

    with pytest.raises(ValueError):
        fetch_as_data_url("pawnote/x/../y", http=client_returning(handler))
