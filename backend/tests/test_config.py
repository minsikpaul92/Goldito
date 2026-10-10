"""Settings: a flag copied from .env.example without a value must not stop the API from starting."""

import pytest
from app.config import Settings


@pytest.mark.parametrize("value", ["", "  "])
def test_an_empty_flag_falls_back_to_its_default(monkeypatch, value):
    monkeypatch.setenv("DEMO_RESET_ENABLED", value)
    monkeypatch.setenv("MEET_INVITE_ATTENDEES", value)
    settings = Settings(_env_file=None)
    assert settings.demo_reset_enabled is False and settings.meet_invite_attendees is True


@pytest.mark.parametrize(("value", "expected"), [("1", True), ("true", True), ("0", False), ("false", False)])
def test_a_set_flag_is_read(monkeypatch, value, expected):
    monkeypatch.setenv("DEMO_RESET_ENABLED", value)
    assert Settings(_env_file=None).demo_reset_enabled is expected


def test_the_example_file_boots(monkeypatch):
    for name in ("DEMO_RESET_ENABLED", "MEET_INVITE_ATTENDEES"):
        monkeypatch.delenv(name, raising=False)
    assert Settings(_env_file=".env.example").demo_reset_enabled is False
