"""add migration_status column to applications table

Revision ID: 0008_add_migration_status_to_applications
Revises: 0007_add_scoring_policies
Create Date: 2026-05-03 00:00:00.000000

Background
----------
The `migration_status` column was added directly to the Windows development
database but was never captured in a migration file. This means any fresh
database (Mac, CI, staging) is missing the column, causing the main dashboard
query to fail with:

    ERROR: column a.migration_status does not exist

This migration adds the column safely using IF NOT EXISTS so it is harmless
to re-run on a Windows database that already has the column.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0008_add_migration_status'
down_revision = '0007_add_scoring_policies'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use raw SQL with IF NOT EXISTS so this is idempotent on databases
    # (e.g. Windows dev) that already have the column.
    op.execute("""
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS migration_status VARCHAR(100) DEFAULT NULL
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE applications
        DROP COLUMN IF EXISTS migration_status
    """)
