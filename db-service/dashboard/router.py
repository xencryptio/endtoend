from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db

from .builders.full_dashboard import build_full_dashboard_view
from .builders.suborganization import build_suborg_view
from .builders.application import build_application_view

router = APIRouter(prefix="/api", tags=["dashboard"])

@router.get("/dashboard")
def full_dashboard(db: Session = Depends(get_db)):
    return build_full_dashboard_view(db)

@router.get("/suborg/{suborg_id}/dashboard")
def suborganization_dashboard(suborg_id: str, db: Session = Depends(get_db)):
    return build_suborg_view(suborg_id, db)

@router.get("/app/{app_id}/dashboard")
def application_dashboard(app_id: str, db: Session = Depends(get_db)):
    return build_application_view(app_id, db)