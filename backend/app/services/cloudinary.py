"""Cloudinary signed upload + delivery helpers (phase-04)."""

from dataclasses import dataclass
from time import time

import cloudinary
import cloudinary.utils

from app.config import get_settings

PURPOSES = ("feed", "task_proof", "report", "handoff", "safety_label")
RESOURCE_TYPES = ("image", "video")


@dataclass(frozen=True)
class SignParams:
    cloud_name: str
    api_key: str
    timestamp: int
    signature: str
    folder: str
    upload_url: str


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
    """Sign folder + timestamp for a direct browser upload (no API secret in the client)."""
    if purpose not in PURPOSES:
        raise ValueError(f"unsupported purpose: {purpose}")
    if resource_type not in RESOURCE_TYPES:
        raise ValueError(f"unsupported resource_type: {resource_type}")
    cloud, key, secret = _configured()
    folder = media_folder(pet_id, purpose)
    timestamp = int(time())
    signature = cloudinary.utils.api_sign_request(
        {"folder": folder, "timestamp": timestamp},
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
    )


def delivery_url(public_id: str, *, resource_type: str = "image", transform: str = "f_auto,q_auto") -> str:
    cloud, _, _ = _configured()
    return f"https://res.cloudinary.com/{cloud}/{resource_type}/upload/{transform}/{public_id}"


def thumb_url(public_id: str, *, w: int = 400) -> str:
    return delivery_url(public_id, transform=f"f_auto,q_auto,c_fill,w_{w},h_{w}")


def video_poster_url(public_id: str, *, w: int = 400) -> str:
    cloud, _, _ = _configured()
    return f"https://res.cloudinary.com/{cloud}/video/upload/so_0,f_jpg,w_{w}/{public_id}.jpg"
