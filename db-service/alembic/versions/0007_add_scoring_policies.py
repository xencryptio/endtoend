"""Compatibility revision for legacy deployments.

Revision ID: 0007_add_scoring_policies
Revises: 0004_create_scan_results_table
Create Date: 2026-04-27 00:00:00.000000
"""

# revision identifiers, used by Alembic.
revision = '0007_add_scoring_policies'
down_revision = '0004_create_scan_results_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Legacy revision placeholder: schema changes were removed or consolidated.
    pass


def downgrade() -> None:
    pass
