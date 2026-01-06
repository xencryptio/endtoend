"""create onboarding tables

Revision ID: 0001_create_onboarding_tables
Revises: 
Create Date: 2025-12-24 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0001_create_onboarding_tables'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'organizations',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('organization_name', sa.String(length=255), nullable=False),
        sa.Column('organization_type', sa.String(length=100)),
        sa.Column('industry', sa.String(length=100)),
        sa.Column('organization_email', sa.String(length=255)),
        sa.Column('contact_person', sa.String(length=255)),
        sa.Column('onboarding_date', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='pending'),
        sa.Column('total_repositories', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_servers', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_windows_servers', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_linux_servers', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_domains', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_active_agents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_calculated_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'repositories',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('organization_id', sa.String(length=36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('project_name', sa.String(length=255)),
        sa.Column('repo_name', sa.String(length=255)),
        sa.Column('repo_url', sa.String(length=1024), nullable=False),
        sa.Column('branch_to_scan', sa.String(length=255), server_default='main'),
        sa.Column('scan_frequency', sa.String(length=50)),
        sa.Column('last_scan_time', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'servers',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('organization_id', sa.String(length=36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('server_name', sa.String(length=255)),
        sa.Column('operating_system', sa.String(length=50)),
        sa.Column('hostname', sa.String(length=255)),
        sa.Column('ip_address', sa.String(length=100)),
        sa.Column('mac_address', sa.String(length=100)),
        sa.Column('agent_status', sa.String(length=50), server_default='not_installed'),
        sa.Column('last_heartbeat', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'server_credentials',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('server_id', sa.String(length=36), sa.ForeignKey('servers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('cred_type', sa.String(length=50), nullable=False),
        sa.Column('username', sa.String(length=255)),
        sa.Column('secret_encrypted', sa.Text()),
        sa.Column('metadata_json', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'domains',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('organization_id', sa.String(length=36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('domain', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'onboarding_jobs',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('organization_id', sa.String(length=36), sa.ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('job_type', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), server_default='queued'),
        sa.Column('rows_processed', sa.Integer(), server_default='0'),
        sa.Column('errors', sa.JSON(), nullable=True),
        sa.Column('created_by', sa.String(length=255)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'scan_jobs',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('organization_id', sa.String(length=36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('target_type', sa.String(length=50), nullable=False),
        sa.Column('target_id', sa.String(length=36)),
        sa.Column('scan_type', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), server_default='queued'),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )

    # Missing tables required for scan-service
    op.create_table(
        'scan_batches',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('batch_id', sa.String(), nullable=False),
        sa.Column('total_urls', sa.Integer(), nullable=False),
        sa.Column('successful_count', sa.Integer(), server_default='0'),
        sa.Column('failed_count', sa.Integer(), server_default='0'),
        sa.Column('max_concurrent', sa.Integer(), server_default='5'),
        sa.Column('status', sa.String(), server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_scan_batches_batch_id'), 'scan_batches', ['batch_id'], unique=True)
    op.create_index(op.f('ix_scan_batches_status'), 'scan_batches', ['status'], unique=False)

    op.create_table(
        'scan_results',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('batch_id', sa.String(), sa.ForeignKey('scan_batches.batch_id', ondelete='CASCADE'), nullable=False),
        sa.Column('request_id', sa.String(), nullable=False),
        sa.Column('url', sa.String(), nullable=False),
        sa.Column('scan_status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('scan_type', sa.String(), server_default='crypto_audit'),
        sa.Column('requested_at', sa.DateTime(timezone=True)),
        sa.Column('completed_at', sa.DateTime(timezone=True)),
        sa.Column('execution_time_seconds', sa.Float()),
        sa.Column('pqc_quantum_ready', sa.Boolean(), server_default='false'),
        sa.Column('pqc_hybrid_ready', sa.Boolean(), server_default='false'),
        sa.Column('tls_version', sa.String()),
        sa.Column('supported_protocols', sa.String()),
        sa.Column('primary_cipher_suite', sa.String()),
        sa.Column('kex_score', sa.Float()),
        sa.Column('kex_grade', sa.String(length=5)),
        sa.Column('cert_pqc_score', sa.Float()),
        sa.Column('cert_pqc_grade', sa.String(length=5)),
        sa.Column('cert_is_pqc', sa.Boolean(), server_default='false'),
        sa.Column('cert_transparency', sa.Boolean(), server_default='false'),
        sa.Column('cert_subject', sa.String(length=255)),
        sa.Column('cert_issuer', sa.String(length=255)),
        sa.Column('cert_serial_number', sa.String(length=255)),
        sa.Column('cert_not_before', sa.DateTime()),
        sa.Column('cert_not_after', sa.DateTime()),
        sa.Column('primary_signature_algorithm', sa.String()),
        sa.Column('primary_hash_algorithm', sa.String()),
        sa.Column('public_key_algorithm', sa.String(length=100)),
        sa.Column('public_key_size_bits', sa.Integer()),
        sa.Column('ephemeral_key_exchange', sa.Boolean(), server_default='false'),
        sa.Column('hsts_enabled', sa.Boolean(), server_default='false'),
        sa.Column('ocsp_stapling_active', sa.Boolean(), server_default='false'),
        sa.Column('ct_present', sa.Boolean(), server_default='false'),
        sa.Column('error_message', sa.Text()),
        sa.Column('raw_response', sa.JSON()),
        sa.Column('pqc_overall_score', sa.Float()),
        sa.Column('pqc_overall_grade', sa.String(length=5)),
        sa.Column('pqc_security_level', sa.String(length=50)),
    )
    op.create_index(op.f('ix_scan_results_batch_id'), 'scan_results', ['batch_id'], unique=False)
    op.create_index(op.f('ix_scan_results_request_id'), 'scan_results', ['request_id'], unique=True)
    op.create_index(op.f('ix_scan_results_url'), 'scan_results', ['url'], unique=False)


def downgrade():
    op.drop_table('scan_results')
    op.drop_table('scan_batches')
    op.drop_table('scan_jobs')
    op.drop_table('onboarding_jobs')
    op.drop_table('domains')
    op.drop_table('server_credentials')
    op.drop_table('servers')
    op.drop_table('repositories')
    op.drop_table('organizations')