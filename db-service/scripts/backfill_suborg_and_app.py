"""Backfill existing organizations to have a default suborganization and application.

This script creates a SubOrganization named 'default' for each existing Organization (if one does not exist)
and an Application named 'default' under that SubOrganization, then updates existing Repositories/Servers/Domains
to point to the newly created Application and SubOrganization.

Use cautiously in staging before running in production.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import models
import uuid

DATABASE_URL = "sqlite:///./test.db"  # replace with your DB URL or use environment

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


def run_backfill():
    db = SessionLocal()
    try:
        orgs = db.query(models.Organization).all()
        for org in orgs:
            # create suborg default if not exists
            suborg = db.query(models.SubOrganization).filter(models.SubOrganization.organization_id == org.id, models.SubOrganization.suborganization_name == 'default').first()
            if not suborg:
                suborg = models.SubOrganization(id=str(uuid.uuid4()), organization_id=org.id, suborganization_name='default')
                db.add(suborg)
                db.commit()
                db.refresh(suborg)
                print(f"Created suborg {suborg.id} for org {org.id}")

            # create app default if not exists
            app = db.query(models.Application).filter(models.Application.suborganization_id == suborg.id, models.Application.application_name == 'default').first()
            if not app:
                app = models.Application(id=str(uuid.uuid4()), suborganization_id=suborg.id, application_name='default')
                db.add(app)
                db.commit()
                db.refresh(app)
                print(f"Created app {app.id} for suborg {suborg.id}")

            # update repositories, servers, domains that do not already have an application
            repos = db.query(models.Repository).filter(models.Repository.organization_id == org.id, models.Repository.application_id.is_(None)).all()
            for r in repos:
                r.suborganization_id = suborg.id
                r.application_id = app.id

            servers = db.query(models.Server).filter(models.Server.organization_id == org.id, models.Server.application_id.is_(None)).all()
            for s in servers:
                s.suborganization_id = suborg.id
                s.application_id = app.id

            domains = db.query(models.Domain).filter(models.Domain.organization_id == org.id, models.Domain.application_id.is_(None)).all()
            for d in domains:
                d.suborganization_id = suborg.id
                d.application_id = app.id

            db.commit()
            print(f"Backfilled org {org.id}: {len(repos)} repos, {len(servers)} servers, {len(domains)} domains")

    finally:
        db.close()


if __name__ == '__main__':
    run_backfill()