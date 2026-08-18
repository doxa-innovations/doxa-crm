from __future__ import annotations

import logging

import httpx
import pytest

from app.logging_config import build_logging_config, configure_logging
from app.main import create_app


def test_build_logging_config_uses_requested_level():
    config = build_logging_config("debug")

    assert config["root"]["level"] == "DEBUG"


def test_build_logging_config_falls_back_to_info_for_invalid_level():
    config = build_logging_config("not-a-level")

    assert config["root"]["level"] == "INFO"


def test_build_logging_config_defines_a_console_handler_with_a_formatter():
    config = build_logging_config("INFO")

    assert config["handlers"]["console"]["formatter"] == "standard"
    assert "%(asctime)s" in config["formatters"]["standard"]["format"]


def test_configure_logging_attaches_a_handler_to_root():
    configure_logging("INFO")

    assert logging.getLogger().handlers


@pytest.mark.asyncio
async def test_unhandled_exception_is_logged_and_returns_error_envelope(caplog):
    app = create_app()

    @app.get("/boom")
    async def boom():
        raise RuntimeError("kaboom")

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)

    with caplog.at_level(logging.ERROR, logger="app.main"):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/boom")

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error", "code": "internal_error"}
    assert any("kaboom" in record.getMessage() or record.exc_info for record in caplog.records)
