"""add sms settings

Revision ID: 0016_sms_settings
Revises: 0015_add_sms_campaign_type
Create Date: 2026-07-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0016_sms_settings"
down_revision: Union[str, Sequence[str], None] = "0015_add_sms_campaign_type"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sms_settings",
        sa.Column("api_key", sa.String(length=500), nullable=True),
        sa.Column("identifier_id", sa.String(length=255), nullable=True),
        sa.Column("sender_name", sa.String(length=255), nullable=True),
        sa.Column("base_url", sa.String(length=500), nullable=False, server_default="https://api.afromessage.com"),
        sa.Column("send_path", sa.String(length=255), nullable=False, server_default="/api/send"),
        sa.Column("method", sa.String(length=10), nullable=False, server_default="POST"),
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sms_settings")),
    )


def downgrade() -> None:
    op.drop_table("sms_settings")
