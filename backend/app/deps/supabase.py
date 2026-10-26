from functools import lru_cache

import httpx
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions

from app.config import get_settings


@lru_cache
def get_service_client() -> Client:
    """Service-role Supabase client (bypasses RLS — see backend/README.md before using it)."""
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    # Idle connections are dropped after 5 s, so a request never reuses one that Supabase already closed
    # ("RemoteProtocolError: Server disconnected": chips, demo reset).
    http = httpx.Client(http2=False, timeout=30, limits=httpx.Limits(keepalive_expiry=5))
    return create_client(settings.supabase_url, settings.supabase_service_role_key, options=SyncClientOptions(httpx_client=http))
