"""remove telegram messaging fields

Revision ID: 0014_remove_telegram_messaging
Revises: 0013_campaign_messaging_channels
Create Date: 2026-07-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0014_remove_telegram_messaging"
down_revision: Union[str, Sequence[str], None] = "0013_campaign_messaging_channels"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE contacts DROP COLUMN IF EXISTS telegram_opted_in_at")
    op.execute("ALTER TABLE contacts DROP COLUMN IF EXISTS telegram_username")
    op.execute("ALTER TABLE contacts DROP COLUMN IF EXISTS telegram_chat_id")


def downgrade() -> None:
    pass
