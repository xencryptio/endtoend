"""add suborganizations and applications

Revision ID: 0002_add_suborg_and_app_tables
Revises: 0001_create_onboarding_tables
Create Date: 2025-12-26 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0002_add_suborg_and_app_tables'
down_revision = '0001_create_onboarding_tables'
branch_labels = None
depends_on = None


def upgrade():
    # Create suborganizations table
    op.create_table(
        'suborganizations',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('organization_id', sa.String(length=36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('suborganization_name', sa.String(length=255), nullable=False, index=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('metadata_json', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    # Create applications table
    op.create_table(
        'applications',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('suborganization_id', sa.String(length=36), sa.ForeignKey('suborganizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('application_name', sa.String(length=255), nullable=False, index=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('metadata_json', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    # Add suborganization_id and application_id to repositories
    op.add_column('repositories', sa.Column('suborganization_id', sa.String(length=36), nullable=True))
    op.add_column('repositories', sa.Column('application_id', sa.String(length=36), nullable=True))
    op.create_foreign_key('fk_repositories_suborganization', 'repositories', 'suborganizations', ['suborganization_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_repositories_application', 'repositories', 'applications', ['application_id'], ['id'], ondelete='SET NULL')

    # Add suborganization_id and application_id to servers
    op.add_column('servers', sa.Column('suborganization_id', sa.String(length=36), nullable=True))
    op.add_column('servers', sa.Column('application_id', sa.String(length=36), nullable=True))
    op.create_foreign_key('fk_servers_suborganization', 'servers', 'suborganizations', ['suborganization_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_servers_application', 'servers', 'applications', ['application_id'], ['id'], ondelete='SET NULL')

    # Add suborganization_id and application_id to domains
    op.add_column('domains', sa.Column('suborganization_id', sa.String(length=36), nullable=True))
    op.add_column('domains', sa.Column('application_id', sa.String(length=36), nullable=True))
    op.create_foreign_key('fk_domains_suborganization', 'domains', 'suborganizations', ['suborganization_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_domains_application', 'domains', 'applications', ['application_id'], ['id'], ondelete='SET NULL')

    # Add suborganization_id and application_id to scan_jobs
    op.add_column('scan_jobs', sa.Column('suborganization_id', sa.String(length=36), nullable=True))
    op.add_column('scan_jobs', sa.Column('application_id', sa.String(length=36), nullable=True))
    op.create_foreign_key('fk_scanjobs_suborganization', 'scan_jobs', 'suborganizations', ['suborganization_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_scanjobs_application', 'scan_jobs', 'applications', ['application_id'], ['id'], ondelete='SET NULL')

    # Indexes - Only create for columns added to existing tables
    # Note: organization_id and suborganization_id indexes are already created by index=True in create_table above
    op.create_index(op.f('ix_repositories_suborganization_id'), 'repositories', ['suborganization_id'], unique=False)
    op.create_index(op.f('ix_repositories_application_id'), 'repositories', ['application_id'], unique=False)


def downgrade():
    # Drop added columns/constraints
    op.drop_index(op.f('ix_repositories_application_id'), table_name='repositories')
    op.drop_index(op.f('ix_repositories_suborganization_id'), table_name='repositories')

    op.drop_constraint('fk_scanjobs_application', 'scan_jobs', type_='foreignkey')
    op.drop_constraint('fk_scanjobs_suborganization', 'scan_jobs', type_='foreignkey')
    op.drop_column('scan_jobs', 'application_id')
    op.drop_column('scan_jobs', 'suborganization_id')

    op.drop_constraint('fk_domains_application', 'domains', type_='foreignkey')
    op.drop_constraint('fk_domains_suborganization', 'domains', type_='foreignkey')
    op.drop_column('domains', 'application_id')
    op.drop_column('domains', 'suborganization_id')

    op.drop_constraint('fk_servers_application', 'servers', type_='foreignkey')
    op.drop_constraint('fk_servers_suborganization', 'servers', type_='foreignkey')
    op.drop_column('servers', 'application_id')
    op.drop_column('servers', 'suborganization_id')

    op.drop_constraint('fk_repositories_application', 'repositories', type_='foreignkey')
    op.drop_constraint('fk_repositories_suborganization', 'repositories', type_='foreignkey')
    op.drop_column('repositories', 'application_id')
    op.drop_column('repositories', 'suborganization_id')

    # No need to drop indexes that were created automatically by index=True in create_table
    # They will be dropped automatically when the tables are dropped
    
    op.drop_table('applications')
    op.drop_table('suborganizations')