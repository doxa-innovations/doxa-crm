from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum as SQLEnum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class CampaignType(str, enum.Enum):
    email = "email"
    sms = "sms"
    event = "event"
    social = "social"
    cold_call = "cold_call"


class CampaignStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    paused = "paused"
    completed = "completed"


class CampaignEnrollmentStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    unsubscribed = "unsubscribed"


class CampaignSequenceChannel(str, enum.Enum):
    email = "email"
    sms = "sms"
    call = "call"
    task = "task"
    social = "social"


class CampaignMetricEventType(str, enum.Enum):
    sent = "sent"
    opened = "opened"
    clicked = "clicked"
    replied = "replied"
    converted = "converted"


class Campaign(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "campaigns"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[CampaignType] = mapped_column(
        SQLEnum(CampaignType, name="campaign_type"),
        nullable=False,
    )
    status: Mapped[CampaignStatus] = mapped_column(
        SQLEnum(CampaignStatus, name="campaign_status"),
        nullable=False,
        default=CampaignStatus.draft,
        server_default=CampaignStatus.draft.value,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    target_segment: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    budget: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    owner = relationship("User")
    enrollments: Mapped[list[CampaignEnrollment]] = relationship(
        "CampaignEnrollment",
        back_populates="campaign",
        cascade="all, delete-orphan",
    )
    sequence_steps: Mapped[list[CampaignSequenceStep]] = relationship(
        "CampaignSequenceStep",
        back_populates="campaign",
        cascade="all, delete-orphan",
        order_by="CampaignSequenceStep.step_index",
    )
    metrics: Mapped[list[CampaignMetric]] = relationship(
        "CampaignMetric",
        back_populates="campaign",
        cascade="all, delete-orphan",
    )


class CampaignEnrollment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "campaign_enrollments"
    __table_args__ = (
        UniqueConstraint(
            "campaign_id",
            "contact_id",
            name="uq_campaign_enrollments_campaign_id_contact_id",
        ),
    )

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("contacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    step_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    status: Mapped[CampaignEnrollmentStatus] = mapped_column(
        SQLEnum(CampaignEnrollmentStatus, name="campaign_enrollment_status"),
        nullable=False,
        default=CampaignEnrollmentStatus.active,
        server_default=CampaignEnrollmentStatus.active.value,
    )

    campaign: Mapped[Campaign] = relationship("Campaign", back_populates="enrollments")
    contact = relationship("Contact")


class CampaignSequenceStep(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "campaign_sequence_steps"
    __table_args__ = (
        UniqueConstraint(
            "campaign_id",
            "step_index",
            name="uq_campaign_sequence_steps_campaign_id_step_index",
        ),
    )

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    step_index: Mapped[int] = mapped_column(Integer, nullable=False)
    channel: Mapped[CampaignSequenceChannel] = mapped_column(
        SQLEnum(CampaignSequenceChannel, name="campaign_sequence_channel"),
        nullable=False,
    )
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    delay_days: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    variant: Mapped[str | None] = mapped_column(String(1), nullable=True)

    campaign: Mapped[Campaign] = relationship("Campaign", back_populates="sequence_steps")


class CampaignMetric(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "campaign_metrics"

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("contacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    step_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("campaign_sequence_steps.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    event_type: Mapped[CampaignMetricEventType] = mapped_column(
        SQLEnum(CampaignMetricEventType, name="campaign_metric_event_type"),
        nullable=False,
    )

    campaign: Mapped[Campaign] = relationship("Campaign", back_populates="metrics")
    contact = relationship("Contact")
    step = relationship("CampaignSequenceStep")
