"""Cloudinary signed upload + delivery helpers (phase-04)."""

import base64
import re
from dataclasses import dataclass
from time import time

import cloudinary
import cloudinary.utils
import httpx

from app.config import get_settings

PURPOSES = ("feed", "task_proof", "report", "handoff", "safety_label")
RESOURCE_TYPES = ("image", "video")

# Incoming transformations (Media normalize policy, phase-04). Applied to the stored original
# at upload time; delivery URLs still use f_auto,q_auto. Never f_auto on incoming.
INCOMING_IMAGE = "c_limit,w_2000/q_auto"
MAX_VIDEO_SECONDS = 30
# Long edge <= 1280 px; the first part (`so_…,du_…`) is the trim and is built per upload.
_INCOMING_VIDEO_TAIL = "c_limit,w_1280,h_1280/q_auto"
# Without a user trim: the first 30 s (safety net behind the client check).
INCOMING_VIDEO = f"so_0,du_{MAX_VIDEO_SECONDS}/{_INCOMING_VIDEO_TAIL}"
INCOMING_TRANSFORMATIONS = {"image": INCOMING_IMAGE, "video": INCOMING_VIDEO}


def _seconds(value: float) -> str:
    """`10.0` -> `10`, `10.456` -> `10.46` (Cloudinary accepts decimal seconds)."""
    return f"{round(value, 2):g}"


def incoming_transformation(
    resource_type: str,
    *,
    trim_start: float | None = None,
    trim_duration: float | None = None,
) -> str:
    """Incoming transformation for a signed upload. A video trim is picked by the user in the
    trim sheet; the numbers are checked here, then signed, so the client cannot change them."""
    if resource_type not in RESOURCE_TYPES:
        raise ValueError(f"unsupported resource_type: {resource_type}")
    if trim_start is None and trim_duration is None:
        return INCOMING_TRANSFORMATIONS[resource_type]
    if resource_type != "video":
        raise ValueError("trim only applies to videos")
    start = 0.0 if trim_start is None else trim_start
    duration = float(MAX_VIDEO_SECONDS) if trim_duration is None else trim_duration
    if not (start >= 0 and 0 < duration <= MAX_VIDEO_SECONDS):
        raise ValueError(f"trim must start at 0 or later and last 1..{MAX_VIDEO_SECONDS} seconds")
    return f"so_{_seconds(start)},du_{_seconds(duration)}/{_INCOMING_VIDEO_TAIL}"


@dataclass(frozen=True)
class SignParams:
    cloud_name: str
    api_key: str
    timestamp: int
    signature: str
    folder: str
    upload_url: str
    transformation: str


def _configured() -> tuple[str, str, str]:
    settings = get_settings()
    cloud = settings.cloudinary_cloud_name
    key = settings.cloudinary_api_key
    secret = settings.cloudinary_api_secret
    if not cloud or not key or not secret:
        raise RuntimeError("CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must be set")
    return cloud, key, secret


def configure_cloudinary() -> None:
    cloud, key, secret = _configured()
    cloudinary.config(cloud_name=cloud, api_key=key, api_secret=secret, secure=True)


def media_folder(pet_id: str, purpose: str) -> str:
    return f"pawddy/{pet_id}/{purpose}"


def sign(
    *,
    pet_id: str,
    purpose: str,
    resource_type: str,
    trim_start: float | None = None,
    trim_duration: float | None = None,
) -> SignParams:
    """Sign folder + incoming transformation + timestamp for a direct browser upload.

    The client must send exactly these values (`folder`, `timestamp`, `transformation`) or the
    signature will not match. The API secret never leaves the server.
    """
    if purpose not in PURPOSES:
        raise ValueError(f"unsupported purpose: {purpose}")
    if resource_type not in RESOURCE_TYPES:
        raise ValueError(f"unsupported resource_type: {resource_type}")
    cloud, key, secret = _configured()
    folder = media_folder(pet_id, purpose)
    timestamp = int(time())
    transformation = incoming_transformation(
        resource_type, trim_start=trim_start, trim_duration=trim_duration
    )
    signature = cloudinary.utils.api_sign_request(
        {"folder": folder, "timestamp": timestamp, "transformation": transformation},
        secret,
    )
    upload_url = f"https://api.cloudinary.com/v1_1/{cloud}/{resource_type}/upload"
    return SignParams(
        cloud_name=cloud,
        api_key=key,
        timestamp=timestamp,
        signature=signature,
        folder=folder,
        upload_url=upload_url,
        transformation=transformation,
    )


def delivery_url(public_id: str, *, resource_type: str = "image", transform: str = "f_auto,q_auto") -> str:
    cloud, _, _ = _configured()
    return f"https://res.cloudinary.com/{cloud}/{resource_type}/upload/{transform}/{public_id}"


def thumb_url(public_id: str, *, w: int = 400) -> str:
    return delivery_url(public_id, transform=f"f_auto,q_auto,c_fill,w_{w},h_{w}")


def video_poster_url(public_id: str, *, w: int = 400) -> str:
    cloud, _, _ = _configured()
    return f"https://res.cloudinary.com/{cloud}/video/upload/so_0,f_jpg,w_{w}/{public_id}.jpg"


# --- AI vision input (architecture D12) -------------------------------------------------
# The model server may not be able to fetch external URLs, so the backend downloads a small
# JPEG from Cloudinary and hands the model a base64 data URL.
VISION_TRANSFORM = "c_limit,w_1024,f_jpg"  # c_limit: never upscale a small photo
VISION_VIDEO_TRANSFORM = "so_0," + VISION_TRANSFORM  # poster frame of a video
VISION_FETCH_TIMEOUT_S = 10.0
VISION_MAX_BYTES = 5 * 1024 * 1024  # a 1024 px JPEG is far below this; guards a bad response

# Our public ids are `pawddy/<pet_id>/<purpose>/<random>` — nothing else may reach the URL.
# `pawnote/` is the folder from before the rename; media uploaded then still lives there.
_PUBLIC_ID_RE = re.compile(r"^(?:pawddy|pawnote)/[A-Za-z0-9_\-]+(?:/[A-Za-z0-9_\-]+)+$")


class MediaFetchError(RuntimeError):
    """Could not load an image for the model. Callers decide the fallback (e.g. `unchecked`)."""


def vision_url(public_id: str, resource_type: str = "image") -> str:
    """Cloudinary URL of the 1024 px JPEG the model sees (a video gives its first frame)."""
    if resource_type not in RESOURCE_TYPES:
        raise ValueError(f"unsupported resource_type: {resource_type}")
    if not _PUBLIC_ID_RE.fullmatch(public_id):
        raise ValueError("public_id must be a pawddy/ media id")
    if resource_type == "video":
        return delivery_url(public_id, resource_type="video", transform=VISION_VIDEO_TRANSFORM) + ".jpg"
    return delivery_url(public_id, transform=VISION_TRANSFORM)


def fetch_as_data_url(
    public_id: str,
    resource_type: str = "image",
    *,
    http: httpx.Client | None = None,
) -> str:
    """Download the model-sized JPEG and return it as `data:image/jpeg;base64,...`.

    Only fetches; it does not check that the caller may see this media. The AI router must
    confirm the media belongs to the pet / booking first (authz, phase 06B · 08 · 09).
    Raises ValueError for a bad id, MediaFetchError when the image cannot be loaded.
    """
    url = vision_url(public_id, resource_type)
    client = http or httpx.Client(timeout=VISION_FETCH_TIMEOUT_S)
    try:
        response = client.get(url)
    except httpx.HTTPError as exc:
        raise MediaFetchError("Could not reach Cloudinary.") from exc
    finally:
        if http is None:
            client.close()
    if response.status_code != 200:
        raise MediaFetchError(f"Cloudinary returned {response.status_code} for this media.")
    if not response.headers.get("content-type", "").startswith("image/"):
        raise MediaFetchError("Cloudinary did not return an image.")
    body = response.content
    if not body or len(body) > VISION_MAX_BYTES:
        raise MediaFetchError("The image is empty or too large for the model.")
    return "data:image/jpeg;base64," + base64.b64encode(body).decode("ascii")
