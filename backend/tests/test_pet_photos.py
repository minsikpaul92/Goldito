"""POST /api/pet-photos/sign · /complete and DELETE /api/pet-photos/{id} (11.15 S1, 014v)."""

from types import SimpleNamespace

import cloudinary.api
import cloudinary.uploader
import pytest
from app.routers import pet_photos
from app.services import cloudinary as cloudinary_service

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_media_sign import OWNER_ID, SITTER_ID, owner_token, sitter_token

# Reuse the media-sign fixtures (JWT settings, test client).
isolated_settings = base.isolated_settings
client = base.client

PET_ID = "00000000-0000-4000-8000-0000000000c1"
PHOTO_ID = "00000000-0000-4000-8000-0000000000d1"


class CloudinaryError(Exception):
    """What the Cloudinary SDK raises for a missing file or a failed call (anything but RuntimeError)."""


def public_id(user_id: str, name: str = "abc") -> str:
    return f"goldito/pet-profile/{user_id}/{name}"


class PhotosDB(FakeDB):
    """FakeDB plus the two functions of 014v that the router calls."""

    def __init__(self, **tables: list[dict]) -> None:
        super().__init__(pet_photos=[], pets=[{"id": PET_ID, "owner_id": OWNER_ID}], **tables)
        self.full = False

    def rpc(self, name: str, params: dict):
        db = self

        class _Call:
            def execute(self_inner):  # noqa: N805
                rows = db.tables["pet_photos"]
                if name == "add_pet_photo":
                    mine = [r for r in rows if r["pet_id"] == params["p_pet"]]
                    if db.full or len(mine) >= 8:
                        raise RuntimeError("too_many_photos")
                    row = {
                        "id": f"photo-{len(rows) + 1}",
                        "pet_id": params["p_pet"],
                        "public_id": params["p_public_id"],
                        "position": len(mine),
                    }
                    rows.append(row)
                    return SimpleNamespace(data=row)
                if name == "remove_pet_photo":
                    db.tables["pet_photos"] = [
                        r for r in rows if not (r["id"] == params["p_id"] and r["pet_id"] == params["p_pet"])
                    ]
                    return SimpleNamespace(data=None)
                raise AssertionError(name)

        return _Call()


@pytest.fixture
def cloud(monkeypatch: pytest.MonkeyPatch) -> dict:
    """Cloudinary calls recorded instead of made; `missing` makes `resource()` fail like an unknown upload."""
    state = {"destroyed": [], "missing": False, "destroy_error": False}
    monkeypatch.setattr(cloudinary_service, "configure_cloudinary", lambda: None)

    def resource(public_id: str, **_kw):
        if state["missing"]:
            raise CloudinaryError("Resource not found")
        return {"public_id": public_id}

    def destroy(public_id: str, **kw):
        if state["destroy_error"]:
            raise CloudinaryError("boom")
        state["destroyed"].append({"id": public_id, **kw})

    monkeypatch.setattr(cloudinary.api, "resource", resource)
    monkeypatch.setattr(cloudinary.uploader, "destroy", destroy)
    return state


def headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def complete(client, token: str, user_id: str = OWNER_ID, pet_id: str = PET_ID, name: str = "abc"):
    return client.post(
        "/api/pet-photos/complete",
        headers=headers(token),
        json={"pet_id": pet_id, "public_id": public_id(user_id, name)},
    )


def test_sign_puts_the_upload_in_the_owners_own_folder(client) -> None:
    response = client.post("/api/pet-photos/sign", headers=headers(owner_token()))
    assert response.status_code == 200
    body = response.json()
    assert body["folder"] == f"goldito/pet-profile/{OWNER_ID}"
    assert body["transformation"] == cloudinary_service.INCOMING_IMAGE
    assert body["upload_url"].endswith("/image/upload")
    assert body["signature"]


def test_sign_needs_a_signed_in_person(client) -> None:
    assert client.post("/api/pet-photos/sign").status_code == 401


def test_complete_registers_the_photo_at_the_end(client, monkeypatch, cloud) -> None:
    db = PhotosDB()
    monkeypatch.setattr(pet_photos, "get_service_client", lambda: db)
    response = complete(client, owner_token())
    assert response.status_code == 200
    body = response.json()
    assert body["position"] == 0
    assert body["pet_id"] == PET_ID
    assert body["public_id"] == public_id(OWNER_ID)
    assert "f_auto,q_auto" in body["url"]
    assert "c_fill" in body["thumb_url"]
    assert db.tables["pet_photos"][0]["pet_id"] == PET_ID


def test_photos_are_added_in_order(client, monkeypatch, cloud) -> None:
    db = PhotosDB()
    monkeypatch.setattr(pet_photos, "get_service_client", lambda: db)
    positions = [complete(client, owner_token(), name=name).json()["position"] for name in ("a", "b", "c")]
    assert positions == [0, 1, 2]


def test_complete_twice_returns_the_same_photo(client, monkeypatch, cloud) -> None:
    db = PhotosDB()
    monkeypatch.setattr(pet_photos, "get_service_client", lambda: db)
    first = complete(client, owner_token())
    second = complete(client, owner_token())
    assert first.json()["id"] == second.json()["id"]
    assert len(db.tables["pet_photos"]) == 1


def test_complete_refuses_someone_elses_folder(client, monkeypatch, cloud) -> None:
    db = PhotosDB()
    monkeypatch.setattr(pet_photos, "get_service_client", lambda: db)
    response = client.post(
        "/api/pet-photos/complete",
        headers=headers(owner_token()),
        json={"pet_id": PET_ID, "public_id": public_id(SITTER_ID)},
    )
    assert response.status_code == 422
    assert db.tables["pet_photos"] == []


def test_complete_is_for_the_pets_owner_only(client, monkeypatch, cloud) -> None:
    db = PhotosDB()
    monkeypatch.setattr(pet_photos, "get_service_client", lambda: db)
    response = complete(client, sitter_token(), user_id=SITTER_ID)
    assert response.status_code == 404
    assert db.tables["pet_photos"] == []


def test_complete_refuses_a_file_cloudinary_does_not_have(client, monkeypatch, cloud) -> None:
    cloud["missing"] = True
    db = PhotosDB()
    monkeypatch.setattr(pet_photos, "get_service_client", lambda: db)
    response = complete(client, owner_token())
    assert response.status_code == 422
    assert db.tables["pet_photos"] == []


def test_the_ninth_photo_is_refused_with_a_clear_message(client, monkeypatch, cloud) -> None:
    db = PhotosDB()
    db.full = True
    monkeypatch.setattr(pet_photos, "get_service_client", lambda: db)
    response = complete(client, owner_token())
    assert response.status_code == 409
    assert "up to 8" in response.json()["detail"]


def test_delete_removes_the_file_then_the_row(client, monkeypatch, cloud) -> None:
    db = PhotosDB()
    db.tables["pet_photos"].append(
        {"id": PHOTO_ID, "pet_id": PET_ID, "public_id": public_id(OWNER_ID), "position": 0}
    )
    monkeypatch.setattr(pet_photos, "get_service_client", lambda: db)
    response = client.delete(f"/api/pet-photos/{PHOTO_ID}", headers=headers(owner_token()))
    assert response.status_code == 200
    assert response.json() == {"deleted": True}
    assert cloud["destroyed"] == [{"id": public_id(OWNER_ID), "resource_type": "image", "invalidate": True}]
    assert db.tables["pet_photos"] == []


def test_delete_is_for_the_pets_owner_only(client, monkeypatch, cloud) -> None:
    db = PhotosDB()
    db.tables["pet_photos"].append(
        {"id": PHOTO_ID, "pet_id": PET_ID, "public_id": public_id(OWNER_ID), "position": 0}
    )
    monkeypatch.setattr(pet_photos, "get_service_client", lambda: db)
    response = client.delete(f"/api/pet-photos/{PHOTO_ID}", headers=headers(sitter_token()))
    assert response.status_code == 404
    assert cloud["destroyed"] == []
    assert len(db.tables["pet_photos"]) == 1


def test_delete_keeps_the_row_when_the_file_cannot_be_removed(client, monkeypatch, cloud) -> None:
    cloud["destroy_error"] = True
    db = PhotosDB()
    db.tables["pet_photos"].append(
        {"id": PHOTO_ID, "pet_id": PET_ID, "public_id": public_id(OWNER_ID), "position": 0}
    )
    monkeypatch.setattr(pet_photos, "get_service_client", lambda: db)
    response = client.delete(f"/api/pet-photos/{PHOTO_ID}", headers=headers(owner_token()))
    assert response.status_code == 502
    assert len(db.tables["pet_photos"]) == 1
