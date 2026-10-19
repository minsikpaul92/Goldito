"""POST /api/profile-photos/sign · /complete and DELETE /api/profile-photos/{id} (#135, 014g)."""

from types import SimpleNamespace

import cloudinary.api
import cloudinary.uploader
import pytest
from app.routers import profile_photos
from app.services import cloudinary as cloudinary_service

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_media_sign import OWNER_ID, SITTER_ID, owner_token, sitter_token

# Reuse the media-sign fixtures (JWT settings, test client).
isolated_settings = base.isolated_settings
client = base.client

PHOTO_ID = "00000000-0000-4000-8000-0000000000d1"


class CloudinaryError(Exception):
    """What the Cloudinary SDK raises for a missing file or a failed call (anything but RuntimeError)."""


def public_id(user_id: str, name: str = "abc") -> str:
    return f"goldito/profile/{user_id}/{name}"


class PhotosDB(FakeDB):
    """FakeDB plus the two functions of 014g that the router calls."""

    def __init__(self, **tables: list[dict]) -> None:
        super().__init__(profile_photos=[], **tables)
        self.full_for: set[str] = set()

    def rpc(self, name: str, params: dict):
        db = self

        class _Call:
            def execute(self_inner):  # noqa: N805
                rows = db.tables["profile_photos"]
                if name == "add_profile_photo":
                    mine = [r for r in rows if r["profile_id"] == params["p_profile"]]
                    if params["p_profile"] in db.full_for or len(mine) >= 8:
                        raise RuntimeError("too_many_photos")
                    row = {
                        "id": f"photo-{len(rows) + 1}",
                        "profile_id": params["p_profile"],
                        "public_id": params["p_public_id"],
                        "position": len(mine),
                    }
                    rows.append(row)
                    return SimpleNamespace(data=row)
                if name == "remove_profile_photo":
                    db.tables["profile_photos"] = [
                        r for r in rows if not (r["id"] == params["p_id"] and r["profile_id"] == params["p_profile"])
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


def test_sign_puts_the_upload_in_the_persons_own_folder(client) -> None:
    for user_id, token in ((SITTER_ID, sitter_token()), (OWNER_ID, owner_token())):
        response = client.post("/api/profile-photos/sign", headers=headers(token))
        assert response.status_code == 200
        body = response.json()
        assert body["folder"] == f"goldito/profile/{user_id}"
        assert body["transformation"] == cloudinary_service.INCOMING_IMAGE
        assert body["upload_url"].endswith("/image/upload")
        assert body["signature"]


def test_sign_needs_a_signed_in_person(client) -> None:
    assert client.post("/api/profile-photos/sign").status_code == 401


def test_complete_registers_the_photo_at_the_end(client, monkeypatch, cloud) -> None:
    db = PhotosDB()
    monkeypatch.setattr(profile_photos, "get_service_client", lambda: db)
    response = client.post(
        "/api/profile-photos/complete", headers=headers(sitter_token()), json={"public_id": public_id(SITTER_ID)}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["position"] == 0
    assert body["public_id"] == public_id(SITTER_ID)
    assert "f_auto,q_auto" in body["url"]
    assert "c_fill" in body["thumb_url"]
    assert db.tables["profile_photos"][0]["profile_id"] == SITTER_ID


def test_complete_twice_returns_the_same_photo(client, monkeypatch, cloud) -> None:
    db = PhotosDB()
    monkeypatch.setattr(profile_photos, "get_service_client", lambda: db)
    body = {"public_id": public_id(SITTER_ID)}
    first = client.post("/api/profile-photos/complete", headers=headers(sitter_token()), json=body)
    second = client.post("/api/profile-photos/complete", headers=headers(sitter_token()), json=body)
    assert first.json()["id"] == second.json()["id"]
    assert len(db.tables["profile_photos"]) == 1


def test_complete_refuses_someone_elses_folder(client, monkeypatch, cloud) -> None:
    db = PhotosDB()
    monkeypatch.setattr(profile_photos, "get_service_client", lambda: db)
    response = client.post(
        "/api/profile-photos/complete", headers=headers(owner_token()), json={"public_id": public_id(SITTER_ID)}
    )
    assert response.status_code == 422
    assert db.tables["profile_photos"] == []


def test_complete_refuses_a_file_cloudinary_does_not_have(client, monkeypatch, cloud) -> None:
    cloud["missing"] = True
    db = PhotosDB()
    monkeypatch.setattr(profile_photos, "get_service_client", lambda: db)
    response = client.post(
        "/api/profile-photos/complete", headers=headers(sitter_token()), json={"public_id": public_id(SITTER_ID)}
    )
    assert response.status_code == 422
    assert db.tables["profile_photos"] == []


def test_the_ninth_photo_is_refused_with_a_clear_message(client, monkeypatch, cloud) -> None:
    db = PhotosDB()
    db.full_for.add(SITTER_ID)
    monkeypatch.setattr(profile_photos, "get_service_client", lambda: db)
    response = client.post(
        "/api/profile-photos/complete", headers=headers(sitter_token()), json={"public_id": public_id(SITTER_ID)}
    )
    assert response.status_code == 409
    assert "up to 8" in response.json()["detail"]


def test_delete_removes_the_file_then_the_row(client, monkeypatch, cloud) -> None:
    db = PhotosDB()
    db.tables["profile_photos"].append(
        {"id": PHOTO_ID, "profile_id": SITTER_ID, "public_id": public_id(SITTER_ID), "position": 0}
    )
    monkeypatch.setattr(profile_photos, "get_service_client", lambda: db)
    response = client.delete(f"/api/profile-photos/{PHOTO_ID}", headers=headers(sitter_token()))
    assert response.status_code == 200
    assert response.json() == {"deleted": True}
    assert cloud["destroyed"] == [{"id": public_id(SITTER_ID), "resource_type": "image", "invalidate": True}]
    assert db.tables["profile_photos"] == []


def test_delete_is_for_the_owner_of_the_photo_only(client, monkeypatch, cloud) -> None:
    db = PhotosDB()
    db.tables["profile_photos"].append(
        {"id": PHOTO_ID, "profile_id": SITTER_ID, "public_id": public_id(SITTER_ID), "position": 0}
    )
    monkeypatch.setattr(profile_photos, "get_service_client", lambda: db)
    response = client.delete(f"/api/profile-photos/{PHOTO_ID}", headers=headers(owner_token()))
    assert response.status_code == 404
    assert cloud["destroyed"] == []
    assert len(db.tables["profile_photos"]) == 1


def test_delete_keeps_the_row_when_the_file_cannot_be_removed(client, monkeypatch, cloud) -> None:
    cloud["destroy_error"] = True
    db = PhotosDB()
    db.tables["profile_photos"].append(
        {"id": PHOTO_ID, "profile_id": SITTER_ID, "public_id": public_id(SITTER_ID), "position": 0}
    )
    monkeypatch.setattr(profile_photos, "get_service_client", lambda: db)
    response = client.delete(f"/api/profile-photos/{PHOTO_ID}", headers=headers(sitter_token()))
    assert response.status_code == 502
    assert len(db.tables["profile_photos"]) == 1
