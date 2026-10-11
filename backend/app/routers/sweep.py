"""POST /api/sweep/bookings: the booking-steps sweep (BS-2), called every 15 minutes by cron-job.org.

`sweep_stale_bookings()` (011l) asks both sides to set a Meet & Greet time 2 days after the sitter's first
yes, and cancels the booking 3 days after that question when nothing moved. It runs in the database; this
endpoint only triggers it. Not a user endpoint: it needs the shared secret in `X-Cron-Secret` and answers 404
(as if it did not exist) when `CRON_SECRET` is not set or the header is wrong.
"""

import hmac

from fastapi import APIRouter, Header, HTTPException, status

from app.config import get_settings
from app.deps.supabase import get_service_client

router = APIRouter(prefix="/api/sweep", tags=["sweep"])


@router.post("/bookings")
def sweep_bookings(x_cron_secret: str | None = Header(default=None)) -> dict:
    secret = get_settings().cron_secret
    if not secret or not x_cron_secret or not hmac.compare_digest(secret, x_cron_secret):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    result = get_service_client().rpc("sweep_stale_bookings").execute()
    return result.data or {"stalled": 0, "cancelled": 0}
