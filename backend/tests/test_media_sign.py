"""POST /api/media/sign (phase-04 4.1)."""

import time
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from app.config import get_settings
from app.deps.auth import Profile, get_profile_lookup
from app.main import app
from app.services import authz
from app.services import cloudinary as cloudinary_service
from fastapi.testclient import TestClient

SUPABASE_URL = "https://example.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
JWT_SECRET = "test-jwt-secret-with-at-least-32-characters"

OWNER_ID = "00000000-0000-4000-8000-000000000001"
SITTER_ID = "00000000-0000-4000-8000-000000000002"
PET_ID = "00000000-0000-4000-8000-0000000000aa"

PROFILES = {
    OWNER_ID: Profile(id=OWNER_ID, role="owner", display_name="Robert"),
    SITTER_ID: Profile(id=SITTER_ID, role="sitter", display_name="Chloe"),
}


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", JWT_SECRET)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test")
    monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "goldito-test")
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
            "email": "sitter@goldito.test",
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
            "email": "owner@goldito.test",
            "aud": "authenticated",
            "iss": ISSUER,
            "role": "authenticated",
            "iat": now,
            "exp": now + 300,
        },
        JWT_SECRET,
        algorithm="HS256",
    )


def test_owner_cannot_sign_non_feed_purposes(client: TestClient) -> None:
    response = client.post(
        "/api/media/sign",
        headers={"Authorization": f"Bearer {owner_token()}"},
        json={"pet_id": PET_ID, "resource_type": "image", "purpose": "task_proof"},
    )
    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"


def test_owner_signs_feed_photo_for_own_pet(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    owners_pets = {PET_ID}

    def check(user, pet_id):
        from fastapi import HTTPException, status

        if str(pet_id) not in owners_pets:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="That is not your pet.")

    monkeypatch.setattr(authz, "assert_owner_of", check)
    monkeypatch.setattr(
        cloudinary_service,
        "sign",
        lambda **kw: SimpleNamespace(
            cloud_name="c",
            api_key="k",
            timestamp=1,
            signature="s",
            folder=f"goldito/{kw['pet_id']}/{kw['purpose']}",
            upload_url="u",
            transformation="t",
        ),
    )
    headers = {"Authorization": f"Bearer {owner_token()}"}
    ok = client.post(
        "/api/media/sign",
        headers=headers,
        json={"pet_id": PET_ID, "resource_type": "image", "purpose": "feed"},
    )
    assert ok.status_code == 200
    other = client.post(
        "/api/media/sign",
        headers=headers,
        json={"pet_id": str(uuid4()), "resource_type": "image", "purpose": "feed"},
    )
    assert other.status_code == 403


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
            cloud_name="goldito-test",
            api_key="123456789012345",
            timestamp=1_700_000_000,
            signature="sig-abc",
            folder=f"goldito/{kwargs['pet_id']}/{kwargs['purpose']}",
            upload_url="https://api.cloudinary.com/v1_1/goldito-test/image/upload",
            transformation=cloudinary_service.INCOMING_IMAGE,
        ),
    )
    response = client.post(
        "/api/media/sign",
        headers={"Authorization": f"Bearer {sitter_token()}"},
        json={"pet_id": PET_ID, "resource_type": "image", "purpose": "feed"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["folder"] == f"goldito/{PET_ID}/feed"
    assert body["signature"] == "sig-abc"
    assert body["upload_url"].endswith("/image/upload")
    assert body["cloud_name"] == "goldito-test"
    assert body["transformation"] == cloudinary_service.INCOMING_IMAGE


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
            "public_id": "goldito/other-pet/feed/hack",
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
            cloud_name="goldito-test",
            api_key="k",
            timestamp=1,
            signature="s",
            folder=f"goldito/{kwargs['pet_id']}/handoff",
            upload_url="https://api.cloudinary.com/v1_1/goldito-test/image/upload",
            transformation=cloudinary_service.INCOMING_IMAGE,
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


def _expected_signature(params: dict) -> str:
    import cloudinary.utils

    return cloudinary.utils.api_sign_request(params, "cloudinary-api-secret-for-tests")


def test_sign_image_signs_incoming_transformation() -> None:
    """Stored originals are normalized on upload: long edge 2000 px, q_auto, never f_auto."""
    params = cloudinary_service.sign(pet_id=PET_ID, purpose="feed", resource_type="image")
    assert params.transformation == "c_limit,w_2000/q_auto"
    assert "f_auto" not in params.transformation
    assert params.signature == _expected_signature(
        {
            "folder": params.folder,
            "timestamp": params.timestamp,
            "transformation": params.transformation,
        }
    )
    # A client that drops or edits the transformation can no longer match the signature.
    assert params.signature != _expected_signature(
        {"folder": params.folder, "timestamp": params.timestamp}
    )


def test_sign_video_caps_duration_and_resolution() -> None:
    params = cloudinary_service.sign(pet_id=PET_ID, purpose="report", resource_type="video")
    assert params.transformation == "so_0,du_30/c_limit,w_1280,h_1280/q_auto"
    assert params.upload_url.endswith("/video/upload")
    assert params.signature == _expected_signature(
        {
            "folder": params.folder,
            "timestamp": params.timestamp,
            "transformation": params.transformation,
        }
    )


def test_sign_endpoint_returns_incoming_transformation(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(authz, "assert_on_duty_for", lambda *_a, **_k: None)
    response = client.post(
        "/api/media/sign",
        headers={"Authorization": f"Bearer {sitter_token()}"},
        json={"pet_id": PET_ID, "resource_type": "video", "purpose": "feed"},
    )
    assert response.status_code == 200
    assert response.json()["transformation"] == cloudinary_service.INCOMING_VIDEO


def test_sign_video_trim_is_signed() -> None:
    """The user's trim window ends up in the signed incoming transformation."""
    params = cloudinary_service.sign(
        pet_id=PET_ID, purpose="feed", resource_type="video", trim_start=10, trim_duration=20.5
    )
    assert params.transformation == "so_10,du_20.5/c_limit,w_1280,h_1280/q_auto"
    assert params.signature == _expected_signature(
        {
            "folder": params.folder,
            "timestamp": params.timestamp,
            "transformation": params.transformation,
        }
    )


def test_sign_video_trim_defaults_fill_the_missing_side() -> None:
    only_start = cloudinary_service.incoming_transformation("video", trim_start=4)
    assert only_start.startswith("so_4,du_30/")
    only_len = cloudinary_service.incoming_transformation("video", trim_duration=12)
    assert only_len.startswith("so_0,du_12/")


@pytest.mark.parametrize(
    ("start", "duration"),
    [(-1, 10), (0, 0), (0, 31), (5, -2)],
)
def test_sign_rejects_out_of_range_trim(start: float, duration: float) -> None:
    with pytest.raises(ValueError):
        cloudinary_service.incoming_transformation(
            "video", trim_start=start, trim_duration=duration
        )


def test_sign_rejects_trim_on_images() -> None:
    with pytest.raises(ValueError):
        cloudinary_service.incoming_transformation("image", trim_duration=10)


def test_sign_endpoint_passes_trim_through(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(authz, "assert_on_duty_for", lambda *_a, **_k: None)
    response = client.post(
        "/api/media/sign",
        headers={"Authorization": f"Bearer {sitter_token()}"},
        json={
            "pet_id": PET_ID,
            "resource_type": "video",
            "purpose": "feed",
            "trim_start": 12,
            "trim_duration": 18,
        },
    )
    assert response.status_code == 200
    assert response.json()["transformation"].startswith("so_12,du_18/")


@pytest.mark.parametrize(
    ("resource_type", "trim"),
    [
        ("video", {"trim_duration": 31}),  # over the 30 s limit
        ("video", {"trim_duration": 0}),
        ("video", {"trim_start": -3, "trim_duration": 10}),
        ("image", {"trim_duration": 10}),  # trim is for videos only
    ],
)
def test_sign_endpoint_rejects_bad_trim(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, resource_type: str, trim: dict
) -> None:
    monkeypatch.setattr(authz, "assert_on_duty_for", lambda *_a, **_k: None)
    response = client.post(
        "/api/media/sign",
        headers={"Authorization": f"Bearer {sitter_token()}"},
        json={"pet_id": PET_ID, "resource_type": resource_type, "purpose": "feed", **trim},
    )
    assert response.status_code == 422


def _complete_body() -> dict:
    return {
        "pet_id": PET_ID,
        "public_id": f"goldito/{PET_ID}/feed/abc",
        "resource_type": "image",
        "purpose": "feed",
        "width": 1,
        "height": 1,
    }


def test_complete_is_idempotent_and_prefers_cloudinary_size(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routers import media

    from tests.fakes import FakeDB

    db = FakeDB(media=[])
    monkeypatch.setattr(authz, "assert_on_duty_for", lambda *_a, **_k: None)
    monkeypatch.setattr(media, "get_service_client", lambda: db)
    monkeypatch.setattr(media.cloudinary.api, "resource", lambda *_a, **_k: {"width": 2000, "height": 1500})
    headers = {"Authorization": f"Bearer {sitter_token()}"}

    first = client.post("/api/media/complete", headers=headers, json=_complete_body())
    second = client.post("/api/media/complete", headers=headers, json=_complete_body())
    assert first.status_code == second.status_code == 200
    assert first.json()["media_id"] == second.json()["media_id"]
    assert len(db.tables["media"]) == 1
    assert (db.tables["media"][0]["width"], db.tables["media"][0]["height"]) == (2000, 1500)


def test_complete_conflicts_when_another_user_registered_it(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routers import media

    from tests.fakes import FakeDB

    db = FakeDB(
        media=[
            {
                "id": "m1",
                "uploaded_by": "someone-else",
                "pet_id": PET_ID,
                "cloudinary_public_id": f"goldito/{PET_ID}/feed/abc",
            }
        ]
    )
    monkeypatch.setattr(authz, "assert_on_duty_for", lambda *_a, **_k: None)
    monkeypatch.setattr(media, "get_service_client", lambda: db)
    monkeypatch.setattr(media.cloudinary.api, "resource", lambda *_a, **_k: {})
    response = client.post(
        "/api/media/complete",
        headers={"Authorization": f"Bearer {sitter_token()}"},
        json=_complete_body(),
    )
    assert response.status_code == 409
