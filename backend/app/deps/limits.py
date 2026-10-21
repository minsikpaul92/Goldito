"""Per-person daily limits on the paid routes (audit 2026-10-21): sign-up is open while judging runs, so one account
cannot burn the AI quota or the upload credits.

shortcut: counts live in memory on the one Render instance, so a restart or a second instance resets them. Move them to
a table if the backend ever runs on more than one instance.
"""

from datetime import UTC, datetime

from fastapi import Depends, HTTPException, status

from app.deps.auth import CurrentUser, get_current_user

DEMO_DOMAIN = "@goldito.test"


class DailyLimit:
    """Allows `per_day` calls per person per UTC day; the shared demo accounts get `per_day_demo` (many judges, one
    account). As a dependency it returns the current user, or a 429 with `detail` once the day's calls are used."""

    def __init__(self, per_day: int, detail: str, *, per_day_demo: int | None = None) -> None:
        self.per_day = per_day
        self.per_day_demo = per_day_demo or per_day
        self.detail = detail
        self._counts: dict[tuple[str, str], int] = {}

    def allow(self, user_id: str, *, demo: bool = False) -> bool:
        today = datetime.now(UTC).date().isoformat()
        for key in [k for k in self._counts if k[1] != today]:
            del self._counts[key]
        count = self._counts.get((user_id, today), 0)
        if count >= (self.per_day_demo if demo else self.per_day):
            return False
        self._counts[(user_id, today)] = count + 1
        return True

    def reset(self) -> None:
        self._counts.clear()

    def __call__(self, user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not self.allow(user.id, demo=(user.email or "").lower().endswith(DEMO_DOMAIN)):
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=self.detail)
        return user


# Every /api/ai/* call (and the embedding routes) shares one budget; photo and video upload signatures have their own.
ai_calls = DailyLimit(100, "Daily AI limit reached. Try again tomorrow.", per_day_demo=1000)
uploads = DailyLimit(100, "Daily upload limit reached. Try again tomorrow.", per_day_demo=1000)
