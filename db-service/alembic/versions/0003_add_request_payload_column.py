"""add request_payload column to scan_batches

Revision ID: 0003_add_request_payload_column
Revises: 0002_add_suborg_and_app_tables
Create Date: 2025-12-31 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

# revision identifiers, used by Alembic.
revision = '0003_add_request_payload_column'
down_revision = '0002_add_suborg_and_app_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add request_payload column to scan_batches table
    op.add_column('scan_batches', sa.Column('request_payload', JSON, nullable=True))


def downgrade() -> None:
    # Remove request_payload column from scan_batches table
    op.drop_column('scan_batches', 'request_payload')
