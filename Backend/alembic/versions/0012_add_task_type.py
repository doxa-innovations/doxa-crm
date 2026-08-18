"""add type to tasks

Revision ID: 0012_add_task_type
Revises: 0011_audit_logs
Create Date: 2026-06-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0012_add_task_type"
down_revision: Union[str, Sequence[str], None] = "0011_audit_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

activity_type = postgresql.ENUM(
    "call",
    "email",
    "meeting",
    "note",
    "task",
    name="activity_type",
    create_type=False,
)


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("type", activity_type, server_default="task", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("tasks", "type")
