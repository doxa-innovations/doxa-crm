"""add campaign messaging channels

Revision ID: 0013_campaign_messaging_channels
Revises: 0012_add_task_type
Create Date: 2026-07-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0013_campaign_messaging_channels"
down_revision: Union[str, Sequence[str], None] = "0012_add_task_type"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE campaign_sequence_channel ADD VALUE IF NOT EXISTS 'sms'")

    op.add_column("contacts", sa.Column("sms_opted_in_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("contacts", sa.Column("sms_opted_out_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("contacts", "sms_opted_out_at")
    op.drop_column("contacts", "sms_opted_in_at")
