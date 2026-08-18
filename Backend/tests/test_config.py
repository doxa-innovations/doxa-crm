from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings

BASE_ENV = {
    "DATABASE_URL": "postgresql+asyncpg://postgres:password@db.example.com:5432/postgres",
    "REDIS_URL": "redis://localhost:6379/0",
    "SECRET_KEY": "unit-test-secret-key-that-is-long-enough",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_KEY": "unit-test-supabase-key",
    "WEBHOOK_SECRET": "unit-test-webhook-secret-long-enough-ok",
}


def build_settings(**overrides) -> Settings:
    return Settings(**{**BASE_ENV, **overrides})


def test_cors_origins_parses_comma_separated_list():
    settings = build_settings(
        ENVIRONMENT="production",
        CORS_ORIGINS="https://crm.example.com, https://admin.example.com",
    )

    assert settings.cors_origins == ["https://crm.example.com", "https://admin.example.com"]


def test_cors_origins_ignores_blank_entries():
    settings = build_settings(ENVIRONMENT="production", CORS_ORIGINS="https://crm.example.com,,  ,")

    assert settings.cors_origins == ["https://crm.example.com"]


def test_cors_origins_defaults_to_localhost_in_development():
    settings = build_settings(ENVIRONMENT="development", CORS_ORIGINS="")

    assert settings.cors_origins == ["http://localhost:3000", "http://127.0.0.1:3000"]


def test_production_requires_cors_origins():
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        build_settings(ENVIRONMENT="production", CORS_ORIGINS="")


def test_production_rejects_placeholder_secret_key():
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        build_settings(
            ENVIRONMENT="production",
            CORS_ORIGINS="https://crm.example.com",
            SECRET_KEY="change-me-to-a-random-32-byte-or-longer-secret-key",
        )


def test_production_rejects_placeholder_webhook_secret():
    with pytest.raises(ValidationError, match="WEBHOOK_SECRET"):
        build_settings(
            ENVIRONMENT="production",
            CORS_ORIGINS="https://crm.example.com",
            WEBHOOK_SECRET="change-me-webhook-secret-at-least-32-chars",
        )


def test_test_environment_does_not_require_cors_origins():
    settings = build_settings(ENVIRONMENT="test", CORS_ORIGINS="")

    assert settings.cors_origins == []


def test_log_level_defaults_to_info():
    assert build_settings(ENVIRONMENT="test").log_level == "INFO"
