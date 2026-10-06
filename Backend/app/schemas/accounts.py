from __future__ import annotations

from datetime import datetime, date
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import AccountTier, DealStatus

CustomFields = dict[str, str | int | float | bool]


def validate_custom_fields(value: dict[str, Any] | None) -> dict[str, Any]:
    if value is None:
        return {}

    for field_name, field_value in value.items():
        if not isinstance(field_name, str):
            raise ValueError("Custom field keys must be strings")
        if not isinstance(field_value, (str, int, float, bool)):
            raise ValueError("Custom field values must be strings, numbers, or booleans")

    return value


class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    industry: str = Field(min_length=1, max_length=120)
    size: str = Field(min_length=1, max_length=120)
    website: str = Field(min_length=1, max_length=500)
    address: dict[str, Any] = Field(default_factory=dict)
    tier: AccountTier
    owner_id: UUID | None = None
    custom_fields: CustomFields = Field(default_factory=dict)

    @field_validator("custom_fields")
    @classmethod
    def validate_create_custom_fields(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_custom_fields(value)


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    industry: str | None = Field(default=None, min_length=1, max_length=120)
    size: str | None = Field(default=None, min_length=1, max_length=120)
    website: str | None = Field(default=None, min_length=1, max_length=500)
    address: dict[str, Any] | None = None
    tier: AccountTier | None = None
    owner_id: UUID | None = None
    custom_fields: CustomFields | None = None
    is_active: bool | None = None

    @field_validator("custom_fields")
    @classmethod
    def validate_update_custom_fields(cls, value: dict[str, Any] | None) -> dict[str, Any]:
        return validate_custom_fields(value)


class AccountResponse(BaseModel):
    id: UUID
    name: str
    industry: str
    size: str
    website: str
    address: dict[str, Any]
    tier: AccountTier
    owner_id: UUID
    owner_name: str | None = None
    custom_fields: CustomFields
    is_active: bool
    linked_contact_count: int = 0
    total_deal_value: Decimal = Decimal("0")  # Legacy USD-only field
    deal_values_by_currency: dict[str, Decimal] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AccountDealResponse(BaseModel):
    id: UUID
    title: str
    value: Decimal
    currency: str
    status: DealStatus
    expected_close: date
    contact_id: UUID
    account_id: UUID
    owner_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
