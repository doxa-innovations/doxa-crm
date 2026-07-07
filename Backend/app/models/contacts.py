from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SQLEnum, ForeignKey, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AccountTier(str, enum.Enum):
    enterprise = "enterprise"
    smb = "smb"
    startup = "startup"


class CustomFieldEntityType(str, enum.Enum):
    lead = "lead"
    contact = "contact"
    account = "account"
    deal = "deal"
    project = "project"


class CustomFieldType(str, enum.Enum):
    text = "text"
    number = "number"
    date = "date"
    boolean = "boolean"
    select = "select"
    json = "json"


class Account(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "accounts"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    industry: Mapped[str] = mapped_column(String(120), nullable=False)
    size: Mapped[str] = mapped_column(String(120), nullable=False)
    website: Mapped[str] = mapped_column(String(500), nullable=False)
    address: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    custom_fields: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    tier: Mapped[AccountTier] = mapped_column(
        SQLEnum(AccountTier, name="account_tier"),
        nullable=False,
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )

    owner = relationship("User")


class Contact(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "contacts"

    first_name: Mapped[str] = mapped_column(String(120), nullable=False)
    last_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String(64)),
        nullable=False,
        default=list,
        server_default=text("'{}'::varchar[]"),
    )
    custom_fields: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    sms_opted_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sms_opted_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    account = relationship("Account")
    owner = relationship("User")


class ContactTag(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "contact_tags"

    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)


class CustomField(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "custom_fields"
    __table_args__ = (
        UniqueConstraint("entity_type", "name", name="uq_custom_fields_entity_type_name"),
    )

    entity_type: Mapped[CustomFieldEntityType] = mapped_column(
        SQLEnum(CustomFieldEntityType, name="custom_field_entity_type"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    field_type: Mapped[CustomFieldType] = mapped_column(
        SQLEnum(CustomFieldType, name="custom_field_type"),
        nullable=False,
    )
    options: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    is_required: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
