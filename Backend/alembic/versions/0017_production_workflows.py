"""Portal sharing, invitation lifecycle and email suppression.

Revision ID: 0017_production_workflows
Revises: 0016_sms_settings
"""
from alembic import op
import sqlalchemy as sa
revision = "0017_production_workflows"
down_revision = "0016_sms_settings"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('projects', sa.Column('portal_enabled', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('projects', sa.Column('portal_expires_at', sa.DateTime(timezone=True)))
    op.add_column('project_documents', sa.Column('customer_visible', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('contacts', sa.Column('email_opted_out_at', sa.DateTime(timezone=True)))
    op.create_table('user_invitations',
        sa.Column('token_hash', sa.String(64), primary_key=True),
        sa.Column('email', sa.String(320), nullable=False, index=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True)))
    op.create_table('user_preferences',
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('data', sa.JSON(), nullable=False))

def downgrade():
    op.drop_table('user_preferences')
    op.drop_table('user_invitations')
    op.drop_column('contacts', 'email_opted_out_at')
    op.drop_column('project_documents', 'customer_visible')
    op.drop_column('projects', 'portal_expires_at')
    op.drop_column('projects', 'portal_enabled')
