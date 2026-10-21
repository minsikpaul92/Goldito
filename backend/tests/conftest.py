import pytest
from app.deps import limits


@pytest.fixture(autouse=True)
def fresh_daily_limits():
    """The daily limits count in memory for the whole process: each test starts from zero."""
    limits.ai_calls.reset()
    limits.uploads.reset()
    yield
