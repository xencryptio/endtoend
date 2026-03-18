"""add commented_occurrences to scan_results

Revision ID: 001
Revises: 
Create Date: 2026-02-28
"""
from alembic import op
import sqlalchemy as sa

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Create tables that don't yet exist (idempotent on fresh install)
    from app import Base
    Base.metadata.create_all(bind=conn)

    # Add commented_occurrences column if it doesn't exist yet
    insp = sa.inspect(conn)
    existing_tables = insp.get_table_names()

    if 'scan_results' in existing_tables:
        existing_cols = {c['name'] for c in insp.get_columns('scan_results')}
        if 'commented_occurrences' not in existing_cols:
            op.add_column(
                'scan_results',
                sa.Column('commented_occurrences', sa.Integer(), nullable=True, server_default='0')
            )


def downgrade() -> None:
    try:
        op.drop_column('scan_results', 'commented_occurrences')
    except Exception:
        pass
