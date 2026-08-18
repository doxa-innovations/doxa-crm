from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import ActivityType, TaskPriority, TaskStatus

ACTIVITY_LOG_TYPES = {
    ActivityType.call,
    ActivityType.email,
    ActivityType.meeting,
    ActivityType.note,
}


class LinkedEntityMixin(BaseModel):
    lead_id: UUID | None = None
    contact_id: UUID | None = None
    deal_id: UUID | None = None
    account_id: UUID | None = None

    @model_validator(mode="after")
    def require_linked_entity(self):
        if not any((self.lead_id, self.contact_id, self.deal_id, self.account_id)):
            raise ValueError("At least one linked entity is required")
        return self


class ActivityCreate(LinkedEntityMixin):
    type: ActivityType
    subject: str = Field(min_length=1, max_length=255)
    body: str = Field(min_length=1)
    outcome: str | None = Field(default=None, max_length=255)
    duration_minutes: int | None = Field(default=None, ge=0)
    owner_id: UUID | None = None
    scheduled_at: datetime | None = None
    completed_at: datetime | None = None

    @model_validator(mode="after")
    def reject_task_activity_type(self):
        if self.type not in ACTIVITY_LOG_TYPES:
            raise ValueError("Use /tasks for task activities")
        return self


class ActivityUpdate(BaseModel):
    type: ActivityType | None = None
    subject: str | None = Field(default=None, min_length=1, max_length=255)
    body: str | None = Field(default=None, min_length=1)
    outcome: str | None = Field(default=None, max_length=255)
    duration_minutes: int | None = Field(default=None, ge=0)
    lead_id: UUID | None = None
    contact_id: UUID | None = None
    deal_id: UUID | None = None
    account_id: UUID | None = None
    owner_id: UUID | None = None
    scheduled_at: datetime | None = None
    completed_at: datetime | None = None

    @model_validator(mode="after")
    def reject_task_activity_type(self):
        if self.type == ActivityType.task:
            raise ValueError("Use /tasks for task activities")
        return self


class ActivityResponse(BaseModel):
    id: UUID
    type: ActivityType
    subject: str
    body: str
    outcome: str | None
    duration_minutes: int | None
    lead_id: UUID | None
    contact_id: UUID | None
    deal_id: UUID | None
    account_id: UUID | None
    owner_id: UUID
    owner_name: str | None = None
    scheduled_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EmailLogCreate(BaseModel):
    from_email: str = Field(min_length=3, max_length=320, alias="from")
    to_email: str = Field(min_length=3, max_length=320, alias="to")
    subject: str = Field(min_length=1, max_length=255)
    body: str = Field(min_length=1)
    contact_email: str = Field(min_length=3, max_length=320)


class TaskCreate(LinkedEntityMixin):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    type: ActivityType = ActivityType.task
    status: TaskStatus = TaskStatus.pending
    priority: TaskPriority = TaskPriority.medium
    due_at: datetime | None = None
    activity_id: UUID | None = None
    owner_id: UUID | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    type: ActivityType | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    due_at: datetime | None = None
    completed_at: datetime | None = None
    activity_id: UUID | None = None
    lead_id: UUID | None = None
    contact_id: UUID | None = None
    deal_id: UUID | None = None
    account_id: UUID | None = None
    owner_id: UUID | None = None


class TaskSnoozeRequest(BaseModel):
    new_due: datetime


class TaskResponse(BaseModel):
    id: UUID
    title: str
    description: str | None
    type: ActivityType = ActivityType.task
    status: TaskStatus
    priority: TaskPriority
    due_at: datetime | None
    completed_at: datetime | None
    activity_id: UUID | None
    lead_id: UUID | None
    lead_name: str | None = None
    contact_id: UUID | None
    contact_name: str | None = None
    deal_id: UUID | None
    deal_name: str | None = None
    account_id: UUID | None
    account_name: str | None = None
    owner_id: UUID
    owner_name: str | None = None
    assigned_to_name: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
