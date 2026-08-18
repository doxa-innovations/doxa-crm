from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class PipelineSummaryRow(BaseModel):
    stage_id: UUID | None = None
    stage: str
    probability: float
    count: int
    total_value: float
    weighted_value: float


class DealVelocityRow(BaseModel):
    stage_id: UUID | None = None
    stage: str
    avg_days: float


class WinLossRow(BaseModel):
    group: str | None = None
    status: str
    count: int
    value: float


class ForecastMonthRow(BaseModel):
    month: str
    count: int
    open_value: float
    weighted_value: float


class QuotaRow(BaseModel):
    user_id: UUID
    rep_name: str | None = None
    quota: float
    won_value: float
    attainment_percent: float


class LeadVolumeRow(BaseModel):
    group: str
    count: int


class LeadFunnelResponse(BaseModel):
    total_leads: int
    qualified_leads: int
    converted_leads: int
    won_deals: int
    qualification_rate: float
    conversion_rate: float
    win_rate: float


class LeadResponseTimeRow(BaseModel):
    rep_id: UUID | None = None
    rep_name: str | None = None
    avg_hours: float | None = None


class ActivityVolumeRow(BaseModel):
    activity_type: str
    rep_id: UUID | None = None
    rep_name: str | None = None
    count: int


class OverdueTaskRow(BaseModel):
    id: UUID
    title: str
    due_at: datetime
    owner_id: UUID
    assignee_name: str | None = None
    linked_to: str | None = None
    linked_type: str | None = None


class SequencePerformanceRow(BaseModel):
    campaign_id: UUID
    campaign_name: str
    sent: int
    opened: int
    clicked: int
    replied: int
    converted: int


class CustomerHealthRow(BaseModel):
    project_id: UUID
    project_name: str
    account_name: str | None = None
    owner_name: str | None = None
    health: str
    status: str


class RenewalPipelineRow(BaseModel):
    deal_id: UUID
    title: str
    account_name: str | None = None
    owner_name: str | None = None
    stage: str | None = None
    value: float
    weighted_value: float
    expected_close: date


class DashboardResponse(BaseModel):
    open_deals_count: int
    open_deals_value: float
    leads_this_month: int
    leads_last_month: int
    overdue_tasks_count: int
    activities_this_week: int
    pipeline_by_stage: list[PipelineSummaryRow]


class CustomReportFilter(BaseModel):
    field: str
    operator: Literal["eq", "ne", "gt", "gte", "lt", "lte", "contains", "in"]
    value: Any


class CustomReportDateRange(BaseModel):
    from_: date | None = Field(default=None, alias="from")
    to: date | None = None
    field: str = "created_at"


class CustomReportRequest(BaseModel):
    entity: Literal["deals", "leads", "contacts", "activities"]
    fields: list[str] = Field(min_length=1, max_length=20)
    filters: list[CustomReportFilter] = Field(default_factory=list)
    group_by: str | None = None
    sort_by: str | None = None
    sort_dir: Literal["asc", "desc"] = "asc"
    date_range: CustomReportDateRange | None = None

    @field_validator("fields")
    @classmethod
    def reject_duplicate_fields(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("fields must be unique")
        return value


class CustomReportResponse(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    total: int


class SalesQuotaCreate(BaseModel):
    user_id: UUID
    period_start: date
    period_end: date
    quota_amount: Decimal = Field(gt=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
