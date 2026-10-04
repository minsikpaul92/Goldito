"""Cloudinary signed upload + delivery helpers (phase-04)."""

from dataclasses import dataclass
from time import time

import cloudinary
import cloudinary.utils

from app.config import get_settings

PURPOSES = ("feed", "task_proof", "report", "handoff", "safety_label")
RESOURCE_TYPES = ("image", "video")

# Incoming transformations (Media normalize policy, phase-04). Applied to the stored original
# at upload time; delivery URLs still use f_auto,q_auto. Never f_auto on incoming.
INCOMING_IMAGE = "c_limit,w_2000/q_auto"
# Safety net behind the client trim/compress: first 30 s, long edge <= 1280 px.
INCOMING_VIDEO = "so_0,du_30/c_limit,w_1280,h_1280/q_auto"
INCOMING_TRANSFORMATIONS = {"image": INCOMING_IMAGE, "video": INCOMING_VIDEO}


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
    return f"pawnote/{pet_id}/{purpose}"


def sign(*, pet_id: str, purpose: str, resource_type: str) -> SignParams:
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
    transformation = INCOMING_TRANSFORMATIONS[resource_type]
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
