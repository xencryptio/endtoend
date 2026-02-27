"""Migrate scan_results to single-scan architecture (drop batch_id FK, add created_at, unique request_id)

Revision ID: 0004_create_scan_results_table
Revises: 20260103_101657
Create Date: 2026-02-27 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

# revision identifiers, used by Alembic.
revision = '0004_create_scan_results_table'
down_revision = '20260103_101657'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # The old scan_results table (created in 0001) used batch-based architecture:
    #   - batch_id NOT NULL FK → scan_batches   (blocks all single-scan inserts)
    #   - no created_at column
    #   - request_id was NOT unique
    #
    # The new single-scan architecture requires:
    #   - no batch_id FK
    #   - unique request_id
    #   - created_at for ordering
    #
    # Safe strategy: rename old table, create new one, drop old.
    # -------------------------------------------------------------------------

    # Step 1a: Rename old indexes first — PostgreSQL does NOT rename indexes
    # automatically when a table is renamed, so they keep their original names
    # and would conflict when we create the new table's indexes.
    op.execute("ALTER INDEX IF EXISTS ix_scan_results_request_id RENAME TO ix_scan_results_old_request_id")
    op.execute("ALTER INDEX IF EXISTS ix_scan_results_url RENAME TO ix_scan_results_old_url")
    op.execute("ALTER INDEX IF EXISTS ix_scan_results_batch_id RENAME TO ix_scan_results_old_batch_id")

    # Step 1b: Rename old table out of the way
    op.rename_table('scan_results', 'scan_results_old')

    # Step 2: Create new scan_results table (no batch_id, correct schema)
    op.create_table(
        'scan_results',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('request_id', sa.String(), nullable=False, unique=True, index=True),
        sa.Column('url', sa.String(), nullable=False, index=True),

        # Status (plain String — avoids PostgreSQL ENUM type dependency)
        sa.Column('scan_status', sa.String(50), nullable=False, server_default='pending'),
        sa.Column('status', sa.String(50), nullable=False, server_default='pending', index=True),
        sa.Column('scan_type', sa.String(100), server_default='crypto_audit'),

        # Timestamps
        sa.Column('requested_at', sa.DateTime(timezone=True), nullable=True, index=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('execution_time_seconds', sa.Float(), nullable=True),

        # PQC / Quantum fields
        sa.Column('pqc_overall_score', sa.Float(), nullable=True, index=True),
        sa.Column('pqc_overall_grade', sa.String(5), nullable=True, index=True),
        sa.Column('pqc_security_level', sa.String(50), nullable=True),
        sa.Column('pqc_quantum_ready', sa.Boolean(), nullable=True, server_default='false', index=True),
        sa.Column('pqc_hybrid_ready', sa.Boolean(), nullable=True, server_default='false'),

        # TLS fields
        sa.Column('tls_version', sa.String(), nullable=True, index=True),
        sa.Column('supported_protocols', sa.String(), nullable=True),
        sa.Column('primary_cipher_suite', sa.String(), nullable=True),

        # Key Exchange fields
        sa.Column('kex_score', sa.Float(), nullable=True),
        sa.Column('kex_grade', sa.String(5), nullable=True),

        # Certificate fields
        sa.Column('cert_pqc_score', sa.Float(), nullable=True),
        sa.Column('cert_pqc_grade', sa.String(5), nullable=True),
        sa.Column('cert_is_pqc', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('cert_transparency', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('cert_subject', sa.String(255), nullable=True),
        sa.Column('cert_issuer', sa.String(255), nullable=True),
        sa.Column('cert_serial_number', sa.String(255), nullable=True),
        sa.Column('cert_not_before', sa.DateTime(), nullable=True),
        sa.Column('cert_not_after', sa.DateTime(), nullable=True),

        # Signature algorithm fields
        sa.Column('primary_signature_algorithm', sa.String(), nullable=True),
        sa.Column('primary_hash_algorithm', sa.String(), nullable=True),

        # Security feature fields
        sa.Column('public_key_algorithm', sa.String(100), nullable=True),
        sa.Column('public_key_size_bits', sa.Integer(), nullable=True),
        sa.Column('ephemeral_key_exchange', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('hsts_enabled', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('ocsp_stapling_active', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('ct_present', sa.Boolean(), nullable=True, server_default='false'),

        # Error info
        sa.Column('error_message', sa.Text(), nullable=True),

        # Full raw JSON response for complete audit trail
        sa.Column('raw_response', JSON, nullable=True),

        # Automatic timestamp
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    )

    # Composite indexes for common query patterns
    op.create_index(
        'idx_scan_results_status_pqc',
        'scan_results',
        ['scan_status', 'pqc_overall_grade']
    )
    op.create_index(
        'idx_scan_results_quantum_ready',
        'scan_results',
        ['pqc_quantum_ready', 'pqc_overall_score']
    )

    # Step 3: Drop the old table (no longer needed)
    op.drop_table('scan_results_old')


def downgrade() -> None:
    op.drop_index('idx_scan_results_quantum_ready', table_name='scan_results')
    op.drop_index('idx_scan_results_status_pqc', table_name='scan_results')
    op.drop_table('scan_results')
