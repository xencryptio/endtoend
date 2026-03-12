"""add migration_plan and quantum_readiness_detail JSON columns to repositories

Revision ID: 002
Revises: 001
Create Date: 2025-01-01
"""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    existing_tables = insp.get_table_names()

    if 'repositories' in existing_tables:
        existing_cols = {c['name'] for c in insp.get_columns('repositories')}

        if 'migration_plan' not in existing_cols:
            op.add_column('repositories', sa.Column('migration_plan', sa.JSON(), nullable=True))

        if 'quantum_readiness_detail' not in existing_cols:
            op.add_column('repositories', sa.Column('quantum_readiness_detail', sa.JSON(), nullable=True))

        if 'critical_vulnerabilities' not in existing_cols:
            op.add_column('repositories', sa.Column('critical_vulnerabilities', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('repositories', 'critical_vulnerabilities')
    op.drop_column('repositories', 'quantum_readiness_detail')
    op.drop_column('repositories', 'migration_plan')
