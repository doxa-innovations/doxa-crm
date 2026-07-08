from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SmsSettingUpdate(BaseModel):
    """Payload for updating the AfroMessage SMS credentials.

    ``api_key`` is optional: omit it (or send ``null``) to keep the stored key
    unchanged. Send an empty string to clear it.
    """

    api_key: str | None = Field(default=None, max_length=500)
    identifier_id: str | None = Field(default=None, max_length=255)
    sender_name: str | None = Field(default=None, max_length=255)
    base_url: str | None = Field(default=None, min_length=1, max_length=500)
    send_path: str | None = Field(default=None, min_length=1, max_length=255)
    method: str | None = Field(default=None, pattern="(?i)^(GET|POST)$")


class SmsSettingResponse(BaseModel):
    id: UUID
    api_key_set: bool
    api_key_preview: str | None
    identifier_id: str | None
    sender_name: str | None
    base_url: str
    send_path: str
    method: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
