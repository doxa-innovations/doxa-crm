"""add sms campaign type

Revision ID: 0015_add_sms_campaign_type
Revises: 0014_remove_telegram_messaging
Create Date: 2026-07-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0015_add_sms_campaign_type"
down_revision: Union[str, Sequence[str], None] = "0014_remove_telegram_messaging"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE campaign_type ADD VALUE IF NOT EXISTS 'sms'")


def downgrade() -> None:
    pass
