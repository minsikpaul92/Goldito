import time
from types import SimpleNamespace

import jwt
import pytest
from app.config import get_settings
from app.deps import auth
from app.deps.auth import CurrentUser, Profile, get_profile_lookup, require_role
from app.main import app
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

SUPABASE_URL = "https://example.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
JWT_SECRET = "test-jwt-secret-with-at-least-32-characters"

OWNER_ID = "00000000-0000-4000-8000-000000000001"
SITTER_ID = "00000000-0000-4000-8000-000000000002"
NO_PROFILE_ID = "00000000-0000-4000-8000-000000000009"

PROFILES = {
    OWNER_ID: Profile(id=OWNER_ID, role="owner", display_name="Robert"),
    SITTER_ID: Profile(id=SITTER_ID, role="sitter", display_name="Chloe"),
}


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch: pytest.MonkeyPatch):
    # Env vars win over backend/.env, so tests never touch the real project.
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", JWT_SECRET)
    get_settings.cache_clear()
    app.dependency_overrides[get_profile_lookup] = lambda: PROFILES.get
    yield
    app.dependency_overrides.clear()
    get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def claims(user_id: str = OWNER_ID, **overrides) -> dict:
    now = int(time.time())
    base = {
        "sub": user_id,
        "email": "owner@pawddy.test",
        "aud": "authenticated",
        "iss": ISSUER,
        "role": "authenticated",
        "iat": now,
        "exp": now + 300,
    }
    return {**base, **overrides}


def hs256(payload: dict, secret: str = JWT_SECRET) -> str:
    return jwt.encode(payload, secret, algorithm="HS256")


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def es256_key(monkeypatch: pytest.MonkeyPatch):
    """A project signing key served by a fake JWKS client."""
    private_key = ec.generate_private_key(ec.SECP256R1())
    fake_jwks = SimpleNamespace(
        get_signing_key_from_jwt=lambda _token: SimpleNamespace(key=private_key.public_key())
    )
    monkeypatch.setattr(auth, "_jwks_client", lambda: fake_jwks)
    return private_key


def test_me_without_token_is_401(client: TestClient) -> None:
    response = client.get("/api/me")
    assert response.status_code == 401
    assert response.json() == {"detail": "Missing bearer token.", "code": "unauthorized"}
    assert response.headers["www-authenticate"] == "Bearer"


def test_me_with_garbage_token_is_401(client: TestClient) -> None:
    response = client.get("/api/me", headers=bearer("not-a-jwt"))
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_me_with_forged_token_is_401(client: TestClient) -> None:
    forged = hs256(claims(), secret="someone-elses-secret-also-32-chars-long")
    response = client.get("/api/me", headers=bearer(forged))
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid token.", "code": "unauthorized"}


def test_me_with_expired_token_is_401(client: TestClient) -> None:
    expired = hs256(claims(exp=int(time.time()) - 60))
    response = client.get("/api/me", headers=bearer(expired))
    assert response.status_code == 401
    assert response.json() == {"detail": "Token expired.", "code": "unauthorized"}


@pytest.mark.parametrize("field, value", [("aud", "anon"), ("iss", "https://evil.example/auth/v1")])
def test_me_with_wrong_audience_or_issuer_is_401(client: TestClient, field: str, value: str) -> None:
    response = client.get("/api/me", headers=bearer(hs256(claims(**{field: value}))))
    assert response.status_code == 401


def test_me_with_valid_legacy_hs256_token_returns_profile(client: TestClient) -> None:
    response = client.get("/api/me", headers=bearer(hs256(claims())))
    assert response.status_code == 200
    assert response.json() == {
        "id": OWNER_ID,
        "email": "owner@pawddy.test",
        "role": "owner",
        "display_name": "Robert",
    }


def test_me_with_es256_token_is_checked_against_jwks(client: TestClient, es256_key) -> None:
    token = jwt.encode(claims(SITTER_ID, email="sitter@pawddy.test"), es256_key, algorithm="ES256")
    response = client.get("/api/me", headers=bearer(token))
    assert response.status_code == 200
    assert response.json()["role"] == "sitter"


def test_me_with_es256_token_from_another_key_is_401(client: TestClient, es256_key) -> None:
    other_key = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode(claims(), other_key, algorithm="ES256")
    response = client.get("/api/me", headers=bearer(token))
    assert response.status_code == 401


def test_role_comes_from_profiles_not_token_metadata(client: TestClient) -> None:
    token = hs256(claims(user_metadata={"role": "sitter"}))
    response = client.get("/api/me", headers=bearer(token))
    assert response.json()["role"] == "owner"


def test_me_without_profile_is_403(client: TestClient) -> None:
    response = client.get("/api/me", headers=bearer(hs256(claims(NO_PROFILE_ID))))
    assert response.status_code == 403
    assert response.json() == {"detail": "No Goldito profile for this account.", "code": "forbidden"}


def test_require_role_lets_only_that_role_through() -> None:
    role_app = FastAPI()
    role_app.dependency_overrides[get_profile_lookup] = lambda: PROFILES.get

    @role_app.get("/sitter-only")
    def sitter_only(user: CurrentUser = Depends(require_role("sitter"))) -> dict:
        return {"id": user.id}

    role_client = TestClient(role_app)
    assert role_client.get("/sitter-only", headers=bearer(hs256(claims(SITTER_ID)))).status_code == 200
    blocked = role_client.get("/sitter-only", headers=bearer(hs256(claims(OWNER_ID))))
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "This action is for sitters."
