"""add onboarding_batches table

Revision ID: 20260103_101657
Revises: 
Create Date: 2026-01-03 10:16:57

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20260103_101657'
down_revision = '0003_add_request_payload_column'  # Point to existing head
branch_labels = None
depends_on = None


def upgrade():
    # Create onboarding_batches table
    op.create_table('onboarding_batches',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('organization_id', sa.String(length=36), nullable=False),
        sa.Column('organization_name', sa.String(length=255), nullable=False),
        sa.Column('created_by', sa.String(length=255), nullable=True),
        sa.Column('repo_scan_job_id', sa.String(length=36), nullable=True),
        sa.Column('tls_scan_batch_id', sa.String(), nullable=True),
        sa.Column('total_repos', sa.Integer(), nullable=True),
        sa.Column('total_domains', sa.Integer(), nullable=True),
        sa.Column('total_servers', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_onboarding_batches_created_at'), 'onboarding_batches', ['created_at'], unique=False)
    op.create_index(op.f('ix_onboarding_batches_organization_id'), 'onboarding_batches', ['organization_id'], unique=False)
    op.create_index(op.f('ix_onboarding_batches_repo_scan_job_id'), 'onboarding_batches', ['repo_scan_job_id'], unique=False)
    op.create_index(op.f('ix_onboarding_batches_tls_scan_batch_id'), 'onboarding_batches', ['tls_scan_batch_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_onboarding_batches_tls_scan_batch_id'), table_name='onboarding_batches')
    op.drop_index(op.f('ix_onboarding_batches_repo_scan_job_id'), table_name='onboarding_batches')
    op.drop_index(op.f('ix_onboarding_batches_organization_id'), table_name='onboarding_batches')
    op.drop_index(op.f('ix_onboarding_batches_created_at'), table_name='onboarding_batches')
    op.drop_table('onboarding_batches')
