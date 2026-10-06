from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import ActivityType, DealStatus, TaskPriority, TaskStatus


class DealCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    type: str = Field(default="new_business", min_length=1, max_length=80)
    value: Decimal = Field(ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    pipeline_id: UUID
    stage_id: UUID | None = None
    probability: float | None = Field(default=None, ge=0, le=100)
    expected_close: date
    contact_id: UUID
    account_id: UUID
    owner_id: UUID | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Acme New Business",
                "type": "new_business",
                "value": "25000.00",
                "currency": "USD",
                "pipeline_id": "00000000-0000-0000-0000-000000000001",
                "expected_close": "2026-07-31",
                "contact_id": "00000000-0000-0000-0000-000000000002",
                "account_id": "00000000-0000-0000-0000-000000000003",
            }
        }
    )


class DealUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    type: str | None = Field(default=None, min_length=1, max_length=80)
    value: Decimal | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    pipeline_id: UUID | None = None
    stage_id: UUID | None = None
    probability: float | None = Field(default=None, ge=0, le=100)
    expected_close: date | None = None
    contact_id: UUID | None = None
    account_id: UUID | None = None
    owner_id: UUID | None = None
    status: DealStatus | None = None
    lost_reason: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class DealMoveStageRequest(BaseModel):
    stage_id: UUID
    lost_reason: str | None = Field(default=None, max_length=500)


class DealLostRequest(BaseModel):
    lost_reason: str = Field(min_length=1, max_length=500)


class DealCollaboratorCreate(BaseModel):
    user_id: UUID
    role: str = Field(default="collaborator", min_length=1, max_length=80)


class DealCollaboratorResponse(BaseModel):
    user_id: UUID
    role: str
    user_name: str | None = None


class DealActivityResponse(BaseModel):
    id: UUID
    type: ActivityType
    subject: str
    body: str
    outcome: str | None = None
    scheduled_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DealTaskResponse(BaseModel):
    id: UUID
    title: str
    description: str | None = None
    status: TaskStatus
    priority: TaskPriority
    due_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DealSummary(BaseModel):
    id: UUID
    title: str
    type: str = "new_business"
    value: Decimal
    currency: str
    probability: float
    expected_close: date
    status: DealStatus
    owner_id: UUID
    stage_id: UUID
    account_id: UUID
    contact_id: UUID

    model_config = ConfigDict(from_attributes=True)


class DealResponse(DealSummary):
    pipeline_id: UUID
    pipeline_name: str | None = None
    stage_name: str | None = None
    account_name: str | None = None
    contact_name: str | None = None
    owner_name: str | None = None
    lost_reason: str | None = None
    closed_at: datetime | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class DealStageHistoryResponse(BaseModel):
    id: UUID
    deal_id: UUID
    from_stage_id: UUID | None
    to_stage_id: UUID
    changed_by: UUID | None
    note: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DealDetailResponse(DealResponse):
    activities: list[DealActivityResponse] = Field(default_factory=list)
    tasks: list[DealTaskResponse] = Field(default_factory=list)
    collaborators: list[DealCollaboratorResponse] = Field(default_factory=list)
    stage_history: list[DealStageHistoryResponse] = Field(default_factory=list)


class DealForecastStage(BaseModel):
    stage: str
    count: int
    value: float
    weighted: float


class DealForecastResponse(BaseModel):
    currency: str = "USD"
    total_weighted: float
    total_open: float
    by_stage: list[DealForecastStage]


class KanbanStage(BaseModel):
    stage_id: UUID
    name: str
    probability: float
    deals: list[DealSummary] = Field(default_factory=list)


class DealKanbanResponse(BaseModel):
    stages: list[KanbanStage]
