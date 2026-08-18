from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["development", "staging", "production", "test"]

PLACEHOLDER_SECRETS = frozenset(
    {
        "change-me-to-a-random-32-byte-or-longer-secret-key",
        "change-me-webhook-secret-at-least-32-chars",
    }
)

RELAXED_ENVIRONMENTS = frozenset({"development", "test"})


class Settings(BaseSettings):
    database_url: str = Field(alias="DATABASE_URL")
    redis_url: str = Field(alias="REDIS_URL")
    secret_key: str = Field(alias="SECRET_KEY")
    environment: Environment = Field(default="development", alias="ENVIRONMENT")
    supabase_url: str = Field(alias="SUPABASE_URL")
    supabase_key: str = Field(alias="SUPABASE_KEY")
    db_pool_size: int = Field(default=1, ge=1, le=20, alias="DB_POOL_SIZE")
    db_max_overflow: int = Field(default=1, ge=0, le=40, alias="DB_MAX_OVERFLOW")
    resend_api_key: str | None = Field(default=None, alias="RESEND_API_KEY")
    resend_from_email: str = Field(default="crm@example.com", alias="RESEND_FROM_EMAIL")
    mailersend_api_key: str | None = Field(default=None, alias="MAILERSEND_API_KEY")
    mailersend_from_email: str = Field(default="crm@example.com", alias="MAILERSEND_FROM_EMAIL")
    mailersend_from_name: str = Field(default="Doxa CRM", alias="MAILERSEND_FROM_NAME")
    mailersend_webhook_secret: str | None = Field(default=None, alias="MAILERSEND_WEBHOOK_SECRET")
    afromessage_api_key: str | None = Field(default=None, alias="AFROMESSAGE_API_KEY")
    afromessage_identifier_id: str | None = Field(default=None, alias="AFROMESSAGE_IDENTIFIER_ID")
    afromessage_sender_name: str | None = Field(default=None, alias="AFROMESSAGE_SENDER_NAME")
    afromessage_base_url: str = Field(default="https://api.afromessage.com", alias="AFROMESSAGE_BASE_URL")
    afromessage_send_path: str = Field(default="/api/send", alias="AFROMESSAGE_SEND_PATH")
    afromessage_method: str = Field(default="POST", alias="AFROMESSAGE_METHOD")
    r2_endpoint_url: str | None = Field(default=None, alias="R2_ENDPOINT_URL")
    r2_access_key_id: str | None = Field(default=None, alias="R2_ACCESS_KEY_ID")
    r2_secret_access_key: str | None = Field(default=None, alias="R2_SECRET_ACCESS_KEY")
    r2_bucket_name: str | None = Field(default=None, alias="R2_BUCKET_NAME")
    r2_region_name: str = Field(default="auto", alias="R2_REGION_NAME")
    meilisearch_url: str | None = Field(default=None, alias="MEILISEARCH_URL")
    meilisearch_api_key: str | None = Field(default=None, alias="MEILISEARCH_API_KEY")
    webhook_secret: str = Field(default="change-me-webhook-secret-at-least-32-chars", alias="WEBHOOK_SECRET")
    cors_origins_raw: str = Field(default="", alias="CORS_ORIGINS")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        return value

    @field_validator("webhook_secret")
    @classmethod
    def validate_webhook_secret(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError("WEBHOOK_SECRET must be at least 32 characters long")
        return value

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def cors_origins(self) -> list[str]:
        configured = [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]
        if configured:
            return configured
        if self.is_development:
            return ["http://localhost:3000", "http://127.0.0.1:3000"]
        return []

    @model_validator(mode="after")
    def validate_production_configuration(self) -> "Settings":
        if self.environment in RELAXED_ENVIRONMENTS:
            return self

        if not self.cors_origins:
            raise ValueError(
                "CORS_ORIGINS must list at least one origin when ENVIRONMENT is not development"
            )
        if self.secret_key in PLACEHOLDER_SECRETS:
            raise ValueError("SECRET_KEY must not use the example placeholder outside development")
        if self.webhook_secret in PLACEHOLDER_SECRETS:
            raise ValueError("WEBHOOK_SECRET must not use the example placeholder outside development")

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
