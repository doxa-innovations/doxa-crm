from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class SmsSetting(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Singleton row holding the workspace AfroMessage SMS credentials.

    Only one row is expected; the service layer reads/creates the first row.
    """

    __tablename__ = "sms_settings"

    api_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    identifier_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sender_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False, default="https://api.afromessage.com")
    send_path: Mapped[str] = mapped_column(String(255), nullable=False, default="/api/send")
    method: Mapped[str] = mapped_column(String(10), nullable=False, default="POST")
