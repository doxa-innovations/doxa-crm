from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import DealStatus, TaskPriority, TaskStatus
from app.schemas.accounts import CustomFields, validate_custom_fields


def _normalize_tags(tags: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()

    for tag in tags:
        clean_tag = tag.strip()
        if clean_tag and clean_tag not in seen:
            normalized.append(clean_tag)
            seen.add(clean_tag)

    return normalized


class ContactCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=320)
    phone: str = Field(min_length=1, max_length=50)
    title: str = Field(min_length=1, max_length=160)
    account_id: UUID | None = None
    owner_id: UUID | None = None
    tags: list[str] = Field(default_factory=list)
    custom_fields: CustomFields = Field(default_factory=dict)
    sms_opted_in_at: datetime | None = None
    sms_opted_out_at: datetime | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "first_name": "Ada",
                "last_name": "Lovelace",
                "email": "ada@example.com",
                "phone": "+15555550123",
                "title": "CTO",
                "tags": ["vip"],
                "custom_fields": {"preferred_channel": "email"},
                "sms_opted_in_at": "2026-07-06T09:00:00Z",
            }
        }
    )

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str]) -> list[str]:
        return _normalize_tags(value)

    @field_validator("custom_fields")
    @classmethod
    def validate_create_custom_fields(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_custom_fields(value)


class ContactUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=120)
    last_name: str | None = Field(default=None, min_length=1, max_length=120)
    email: str | None = Field(default=None, min_length=3, max_length=320)
    phone: str | None = Field(default=None, min_length=1, max_length=50)
    title: str | None = Field(default=None, min_length=1, max_length=160)
    account_id: UUID | None = None
    owner_id: UUID | None = None
    tags: list[str] | None = None
    custom_fields: CustomFields | None = None
    is_active: bool | None = None
    sms_opted_in_at: datetime | None = None
    sms_opted_out_at: datetime | None = None

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return _normalize_tags(value)

    @field_validator("custom_fields")
    @classmethod
    def validate_update_custom_fields(cls, value: dict[str, Any] | None) -> dict[str, Any]:
        return validate_custom_fields(value)


class ContactTagsUpdate(BaseModel):
    tags: list[str] = Field(default_factory=list)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str]) -> list[str]:
        return _normalize_tags(value)


class ContactResponse(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    email: str
    phone: str
    title: str
    account_id: UUID | None
    account_name: str | None = None
    owner_id: UUID
    owner_name: str | None = None
    tags: list[str]
    custom_fields: CustomFields
    is_active: bool
    sms_opted_in_at: datetime | None = None
    sms_opted_out_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ContactDealTimelineData(BaseModel):
    value: Decimal
    currency: str
    status: DealStatus


class ContactTaskTimelineData(BaseModel):
    status: TaskStatus
    priority: TaskPriority


class ContactTimelineItem(BaseModel):
    id: UUID
    type: Literal["activity", "task", "note", "deal"]
    title: str
    occurred_at: datetime
    description: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
