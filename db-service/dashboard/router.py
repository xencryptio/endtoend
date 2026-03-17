from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db

from .builders.full_dashboard import build_full_dashboard_view
from .builders.suborganization import build_suborg_view
from .builders.application import build_application_view

router = APIRouter(prefix="/api", tags=["dashboard"])

VALID_STATUSES = {"Not Started", "Planned", "In Progress", "Completed", "On Hold"}

class StatusUpdate(BaseModel):
    status: str

@router.get("/dashboard")
def full_dashboard(db: Session = Depends(get_db)):
    return build_full_dashboard_view(db)

@router.get("/suborg/{suborg_id}/dashboard")
def suborganization_dashboard(suborg_id: str, db: Session = Depends(get_db)):
    return build_suborg_view(suborg_id, db)

@router.get("/app/{app_id}/dashboard")
def application_dashboard(app_id: str, db: Session = Depends(get_db)):
    return build_application_view(app_id, db)

@router.patch("/app/{app_id}/status")
def update_app_status(app_id: str, body: StatusUpdate, db: Session = Depends(get_db)):
    """Update the migration status of an application."""
    if body.status not in VALID_STATUSES:
        from fastapi import HTTPException
        raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(sorted(VALID_STATUSES))}")
    db.execute(
        text("UPDATE applications SET migration_status = :status, updated_at = NOW() WHERE id = :id"),
        {"status": body.status, "id": app_id}
    )
    db.commit()
    return {"app_id": app_id, "status": body.status}

@router.get("/pqc-trend")
def pqc_trend(db: Session = Depends(get_db)):
    """Return monthly avg PQC scores from scan_results (last 12 months)
    plus 6 future blank months for the migration trajectory view."""
    query = text("""
        SELECT
            TO_CHAR(DATE_TRUNC('month', sr.completed_at), 'YYYY-MM') AS month,
            ROUND(AVG(sr.pqc_overall_score)::numeric, 1) AS avg_pqc
        FROM scan_results sr
        WHERE sr.pqc_overall_score IS NOT NULL
          AND LOWER(sr.scan_status) = 'completed'
          AND sr.completed_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', sr.completed_at)
        ORDER BY month
    """)
    rows = db.execute(query).fetchall()
    real_data = {r.month: float(r.avg_pqc) for r in rows}

    # Build 12-month window: 6 past months + current + 5 future months
    from datetime import datetime
    now = datetime.utcnow()
    months = []
    for offset in range(-5, 7):  # -5 to +6 inclusive = 12 months
        year = now.year + (now.month - 1 + offset) // 12
        month = (now.month - 1 + offset) % 12 + 1
        key = f"{year:04d}-{month:02d}"
        months.append({"month": key, "pqc": real_data.get(key)})
    return months