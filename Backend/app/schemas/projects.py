from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import ProjectHealth


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    account_id: UUID
    deal_id: UUID | None = None
    status: str = Field(default="active", min_length=1, max_length=80)
    start_date: date
    end_date: date
    health: ProjectHealth = ProjectHealth.green
    owner_id: UUID | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Acme Onboarding",
                "account_id": "00000000-0000-0000-0000-000000000003",
                "status": "active",
                "start_date": "2026-06-15",
                "end_date": "2026-07-15",
                "health": "green",
            }
        }
    )


class ProjectUpdate(BaseModel):
    portal_enabled: bool | None = None
    portal_expires_at: datetime | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    status: str | None = Field(default=None, min_length=1, max_length=80)
    start_date: date | None = None
    end_date: date | None = None
    health: ProjectHealth | None = None
    owner_id: UUID | None = None
    is_active: bool | None = None


class MilestoneCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    due_date: date


class MilestoneUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    due_date: date | None = None
    completed_at: datetime | None = None


class MilestoneResponse(BaseModel):
    id: UUID
    project_id: UUID
    title: str
    due_date: date
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProjectDocumentResponse(BaseModel):
    customer_visible: bool = False
    id: UUID
    project_id: UUID
    filename: str
    file_size: int
    mime_type: str | None
    storage_key: str
    uploaded_by: UUID
    description: str | None = None
    download_url: str
    created_at: datetime
    updated_at: datetime


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    account_id: UUID
    account_name: str | None = None
    deal_id: UUID | None = None
    status: str
    start_date: date
    end_date: date
    health: ProjectHealth
    owner_id: UUID
    owner_name: str | None = None
    portal_enabled: bool = True
    portal_expires_at: datetime | None = None
    portal_token: str
    is_active: bool
    milestones: list[MilestoneResponse] = Field(default_factory=list)
    documents: list[ProjectDocumentResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class PortalMilestoneResponse(BaseModel):
    title: str
    due_date: date
    completed: bool


class PortalDocumentResponse(BaseModel):
    filename: str
    download_url: str


class ProjectPortalResponse(BaseModel):
    support_email: str | None = None
    updated_at: datetime
    documents: list[PortalDocumentResponse] = Field(default_factory=list)
    project_name: str
    account_name: str | None = None
    health: ProjectHealth
    milestones: list[PortalMilestoneResponse]
    status: str
    start_date: date
    end_date: date
