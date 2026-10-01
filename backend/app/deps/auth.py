"""Supabase JWT verification and the current user (phase-03 3.4, architecture D14)."""

from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

import jwt
from fastapi import Depends, Header, HTTPException, status

from app.config import get_settings
from app.deps.supabase import get_service_client

Role = Literal["owner", "sitter"]

ASYMMETRIC_ALGORITHMS = {"ES256", "RS256"}
AUDIENCE = "authenticated"


@dataclass(frozen=True)
class Profile:
    id: str
    role: Role
    display_name: str


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None
    role: Role
    display_name: str
    # Kept for user-scoped Supabase calls (RLS, RPCs such as is_on_duty_for).
    access_token: str


ProfileLookup = Callable[[str], Profile | None]


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    settings = get_settings()
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL must be set to verify tokens")
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=600)


def verify_supabase_jwt(token: str) -> dict:
    """Return the token claims, or raise 401.

    ES256/RS256 tokens are checked against the project JWKS; legacy HS256 tokens
    fall back to SUPABASE_JWT_SECRET (D14).
    """
    settings = get_settings()
    try:
        algorithm = jwt.get_unverified_header(token).get("alg")
    except jwt.PyJWTError as exc:
        raise _unauthorized("Invalid token.") from exc

    if algorithm in ASYMMETRIC_ALGORITHMS:
        try:
            key = _jwks_client().get_signing_key_from_jwt(token).key
        except jwt.PyJWKClientConnectionError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not reach Supabase to verify the token.",
            ) from exc
        except jwt.PyJWTError as exc:
            raise _unauthorized("Invalid token.") from exc
    elif algorithm == "HS256" and settings.supabase_jwt_secret:
        key = settings.supabase_jwt_secret
    else:
        raise _unauthorized("Invalid token.")

    issuer = f"{settings.supabase_url.rstrip('/')}/auth/v1" if settings.supabase_url else None
    try:
        return jwt.decode(
            token,
            key,
            algorithms=[algorithm],
            audience=AUDIENCE,
            issuer=issuer,
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise _unauthorized("Token expired.") from exc
    except jwt.PyJWTError as exc:
        raise _unauthorized("Invalid token.") from exc


def _service_profile_lookup(user_id: str) -> Profile | None:
    result = (
        get_service_client()
        .table("profiles")
        .select("id, role, display_name")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    row = result.data[0]
    if row.get("role") not in ("owner", "sitter"):
        return None
    return Profile(id=row["id"], role=row["role"], display_name=row["display_name"])


def get_profile_lookup() -> ProfileLookup:
    """Overridable in tests; reads `profiles` with the service role."""
    return _service_profile_lookup


def bearer_token(authorization: str | None = Header(default=None)) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized("Missing bearer token.")
    return token.strip()


def get_current_user(
    token: str = Depends(bearer_token),
    lookup: ProfileLookup = Depends(get_profile_lookup),
) -> CurrentUser:
    claims = verify_supabase_jwt(token)
    # Role comes from `profiles`, never from JWT user_metadata (users can edit their metadata).
    profile = lookup(claims["sub"])
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No PawNote profile for this account.",
        )
    return CurrentUser(
        id=profile.id,
        email=claims.get("email"),
        role=profile.role,
        display_name=profile.display_name,
        access_token=token,
    )


def require_role(role: Role) -> Callable[..., CurrentUser]:
    """Dependency for role-only routes, e.g. `Depends(require_role("sitter"))`."""

    def dependency(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action is for {role}s.",
            )
        return user

    return dependency
