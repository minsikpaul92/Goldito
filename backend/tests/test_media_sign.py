"""POST /api/media/sign (phase-04 4.1)."""

import time
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from app.config import get_settings
from app.deps.auth import Profile, get_profile_lookup
from app.main import app
from app.services import authz, cloudinary as cloudinary_service
from fastapi.testclient import TestClient

SUPABASE_URL = "https://example.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
JWT_SECRET = "test-jwt-secret-with-at-least-32-characters"

OWNER_ID = "00000000-0000-4000-8000-000000000001"
SITTER_ID = "00000000-0000-4000-8000-000000000002"
PET_ID = "00000000-0000-4000-8000-0000000000aa"

PROFILES = {
    OWNER_ID: Profile(id=OWNER_ID, role="owner", display_name="Chloe"),
    SITTER_ID: Profile(id=SITTER_ID, role="sitter", display_name="Lucy"),
}


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", JWT_SECRET)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test")
    monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "pawnote-test")
    monkeypatch.setenv("CLOUDINARY_API_KEY", "123456789012345")
    monkeypatch.setenv("CLOUDINARY_API_SECRET", "cloudinary-api-secret-for-tests")
    get_settings.cache_clear()
    app.dependency_overrides[get_profile_lookup] = lambda: PROFILES.get
    yield
    app.dependency_overrides.clear()
    get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def sitter_token() -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": SITTER_ID,
            "email": "sitter@pawnote.test",
            "aud": "authenticated",
            "iss": ISSUER,
            "role": "authenticated",
            "iat": now,
            "exp": now + 300,
        },
        JWT_SECRET,
        algorithm="HS256",
    )


def owner_token() -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": OWNER_ID,
            "email": "owner@pawnote.test",
            "aud": "authenticated",
            "iss": ISSUER,
            "role": "authenticated",
            "iat": now,
            "exp": now + 300,
        },
        JWT_SECRET,
        algorithm="HS256",
    )


def test_sign_requires_sitter(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(authz, "assert_on_duty_for", lambda *_a, **_k: None)
    response = client.post(
        "/api/media/sign",
        headers={"Authorization": f"Bearer {owner_token()}"},
        json={"pet_id": PET_ID, "resource_type": "image", "purpose": "feed"},
    )
    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"


def test_sign_forbidden_when_not_on_duty(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def deny(_user, _pet_id):
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not on duty for this pet.")

    monkeypatch.setattr(authz, "assert_on_duty_for", deny)
    response = client.post(
        "/api/media/sign",
        headers={"Authorization": f"Bearer {sitter_token()}"},
        json={"pet_id": PET_ID, "resource_type": "image", "purpose": "feed"},
    )
    assert response.status_code == 403
    assert "on duty" in response.json()["detail"].lower()


def test_sign_returns_folder_and_signature(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(authz, "assert_on_duty_for", lambda *_a, **_k: None)
    monkeypatch.setattr(
        cloudinary_service,
        "sign",
        lambda **kwargs: SimpleNamespace(
            cloud_name="pawnote-test",
            api_key="123456789012345",
            timestamp=1_700_000_000,
            signature="sig-abc",
            folder=f"pawnote/{kwargs['pet_id']}/{kwargs['purpose']}",
            upload_url="https://api.cloudinary.com/v1_1/pawnote-test/image/upload",
        ),
    )
    response = client.post(
        "/api/media/sign",
        headers={"Authorization": f"Bearer {sitter_token()}"},
        json={"pet_id": PET_ID, "resource_type": "image", "purpose": "feed"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["folder"] == f"pawnote/{PET_ID}/feed"
    assert body["signature"] == "sig-abc"
    assert body["upload_url"].endswith("/image/upload")
    assert body["cloud_name"] == "pawnote-test"


def test_handoff_requires_booking_id(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(authz, "assert_on_duty_for", lambda *_a, **_k: None)
    response = client.post(
        "/api/media/sign",
        headers={"Authorization": f"Bearer {sitter_token()}"},
        json={"pet_id": PET_ID, "resource_type": "image", "purpose": "handoff"},
    )
    assert response.status_code == 422


def test_complete_rejects_folder_traversal(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(authz, "assert_on_duty_for", lambda *_a, **_k: None)
    response = client.post(
        "/api/media/complete",
        headers={"Authorization": f"Bearer {sitter_token()}"},
        json={
            "pet_id": PET_ID,
            "public_id": "pawnote/other-pet/feed/hack",
            "resource_type": "image",
            "purpose": "feed",
        },
    )
    assert response.status_code == 422
    assert "folder" in response.json()["detail"].lower()


def test_handoff_uses_booked_sitter_check(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    called: dict = {}

    def booked(user, booking_id, *, pet_id=None, from_hours_before=2):
        called["booking_id"] = str(booking_id)
        called["pet_id"] = str(pet_id) if pet_id else None
        called["from_hours_before"] = from_hours_before

    monkeypatch.setattr(authz, "assert_booked_sitter", booked)
    monkeypatch.setattr(
        cloudinary_service,
        "sign",
        lambda **kwargs: SimpleNamespace(
            cloud_name="pawnote-test",
            api_key="k",
            timestamp=1,
            signature="s",
            folder=f"pawnote/{kwargs['pet_id']}/handoff",
            upload_url="https://api.cloudinary.com/v1_1/pawnote-test/image/upload",
        ),
    )
    booking_id = str(uuid4())
    response = client.post(
        "/api/media/sign",
        headers={"Authorization": f"Bearer {sitter_token()}"},
        json={
            "pet_id": PET_ID,
            "resource_type": "image",
            "purpose": "handoff",
            "booking_id": booking_id,
        },
    )
    assert response.status_code == 200
    assert called["booking_id"] == booking_id
    assert called["pet_id"] == PET_ID
    assert called["from_hours_before"] == 2
