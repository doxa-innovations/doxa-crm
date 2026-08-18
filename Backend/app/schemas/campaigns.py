from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import (
    CampaignEnrollmentStatus,
    CampaignMetricEventType,
    CampaignSequenceChannel,
    CampaignStatus,
    CampaignType,
)


class CampaignMetricsResponse(BaseModel):
    sent: int = 0
    opened: int = 0
    clicked: int = 0
    replied: int = 0
    converted: int = 0


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: CampaignType
    status: CampaignStatus = CampaignStatus.draft
    start_date: date
    end_date: date
    target_segment: dict = Field(default_factory=dict)
    budget: Decimal = Field(ge=0)
    owner_id: UUID | None = None


class CampaignUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: CampaignType | None = None
    status: CampaignStatus | None = None
    start_date: date | None = None
    end_date: date | None = None
    target_segment: dict | None = None
    budget: Decimal | None = Field(default=None, ge=0)
    owner_id: UUID | None = None


class CampaignResponse(BaseModel):
    id: UUID
    name: str
    type: CampaignType
    status: CampaignStatus
    start_date: date
    end_date: date
    target_segment: dict
    budget: Decimal
    owner_id: UUID
    owner_name: str | None = None
    enrollment_count: int = 0
    metrics: CampaignMetricsResponse = Field(default_factory=CampaignMetricsResponse)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CampaignEnrollmentResponse(BaseModel):
    id: UUID
    campaign_id: UUID
    contact_id: UUID
    contact_name: str | None = None
    contact_email: str | None = None
    enrolled_at: datetime
    step_index: int
    status: CampaignEnrollmentStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CampaignEnrollRequest(BaseModel):
    contact_ids: list[UUID] = Field(min_length=1)


class CampaignStepCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=255)
    body: str | None = None
    delay_days: int = Field(default=0, ge=0)
    variant: str | None = Field(default=None, max_length=1)
    channel: CampaignSequenceChannel = CampaignSequenceChannel.email


class CampaignStepUpdate(BaseModel):
    subject: str | None = Field(default=None, min_length=1, max_length=255)
    body: str | None = None
    delay_days: int | None = Field(default=None, ge=0)
    variant: str | None = Field(default=None, max_length=1)
    channel: CampaignSequenceChannel | None = None


class CampaignStepResponse(BaseModel):
    id: UUID
    campaign_id: UUID
    step_index: int
    channel: CampaignSequenceChannel
    subject: str
    body: str | None
    delay_days: int
    variant: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CampaignStepsReorderRequest(BaseModel):
    step_ids: list[UUID] = Field(min_length=1)


class CampaignMetricResponse(BaseModel):
    id: UUID
    campaign_id: UUID
    contact_id: UUID
    step_id: UUID | None
    event_type: CampaignMetricEventType
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CampaignMetricCreate(BaseModel):
    contact_id: UUID
    event_type: CampaignMetricEventType
    step_id: UUID | None = None
