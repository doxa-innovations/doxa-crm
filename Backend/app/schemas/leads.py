from __future__ import annotations

from datetime import datetime, date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import LeadSource, LeadStatus


class LeadCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=3, max_length=320)
    phone: str = Field(min_length=1, max_length=50)
    company: str = Field(min_length=1, max_length=255)
    source: LeadSource
    score: int = Field(default=0, ge=0, le=100)
    status: LeadStatus = LeadStatus.new
    assigned_to: UUID | None = None
    campaign_id: UUID | None = None
    utm_source: str | None = Field(default=None, max_length=120)
    utm_campaign: str | None = Field(default=None, max_length=255)
    utm_medium: str | None = Field(default=None, max_length=120)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "full_name": "Ada Lovelace",
                "email": "ada@acme.com",
                "phone": "+15555550123",
                "company": "Acme",
                "source": "website",
                "utm_source": "linkedin",
                "utm_campaign": "spring-demo",
            }
        }
    )


class LeadUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    email: str | None = Field(default=None, min_length=3, max_length=320)
    phone: str | None = Field(default=None, min_length=1, max_length=50)
    company: str | None = Field(default=None, min_length=1, max_length=255)
    source: LeadSource | None = None
    score: int | None = Field(default=None, ge=0, le=100)
    status: LeadStatus | None = None
    assigned_to: UUID | None = None
    campaign_id: UUID | None = None
    utm_source: str | None = Field(default=None, max_length=120)
    utm_campaign: str | None = Field(default=None, max_length=255)
    utm_medium: str | None = Field(default=None, max_length=120)
    is_active: bool | None = None


class LeadAssignRequest(BaseModel):
    user_id: UUID | None = None
    method: str = Field(default="manual", pattern="^(manual|round_robin|territory)$")
    territory: str | None = None


class LeadScoreResponse(BaseModel):
    lead_id: UUID
    score: int


class LeadConvertRequest(BaseModel):
    account_id: UUID | None = None
    currency: str = Field(default="USD", pattern="^[A-Z]{3}$")
    expected_close: date | None = None
    create_account: bool = False
    account_name: str | None = Field(default=None, max_length=255)
    create_deal: bool = False
    deal_title: str | None = Field(default=None, max_length=255)
    deal_value: Decimal | None = Field(default=None, ge=0)
    pipeline_id: UUID | None = None


class LeadConvertResponse(BaseModel):
    lead: "LeadResponse"
    contact_id: UUID
    account_id: UUID | None = None
    deal_id: UUID | None = None


class LeadMergeRequest(BaseModel):
    primary_lead_id: UUID
    duplicate_lead_id: UUID


class LeadImportError(BaseModel):
    row: int
    reason: str


class LeadImportSummary(BaseModel):
    imported: int
    skipped: int
    errors: list[LeadImportError] = Field(default_factory=list)


class DuplicateLeadPair(BaseModel):
    lead_id: UUID
    duplicate_lead_id: UUID
    similarity_score: float = Field(ge=0, le=1)
    reason: str


class LeadResponse(BaseModel):
    id: UUID
    full_name: str
    email: str
    phone: str
    company: str
    source: LeadSource
    score: int
    status: LeadStatus
    assigned_to: UUID
    assigned_to_name: str | None = None
    campaign_id: UUID | None
    utm_source: str | None = None
    utm_campaign: str | None = None
    utm_medium: str | None = None
    converted_at: datetime | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


LeadConvertResponse.model_rebuild()
