import logging

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.deps.supabase import get_service_client

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/deep")
def health_deep() -> JSONResponse:
    """One tiny read from Supabase, pinged once a day so the free project never sits idle for 7 days (10.7).

    Public on purpose: it returns no data, and a failure says only that the database is unreachable.
    """
    try:
        get_service_client().table("profiles").select("id").limit(1).execute()
    except Exception:
        logger.exception("health/deep: Supabase check failed")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "error", "database": "unavailable"},
        )
    return JSONResponse(content={"status": "ok", "database": "ok"})
