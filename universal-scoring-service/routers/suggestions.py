"""
Suggestions Router — generates actionable QR migration recommendations
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Any, Dict, Optional
from core.suggestions import generate_suggestions
from exceptions import APIError
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/suggestions", tags=["suggestions"])


class SuggestionsRequest(BaseModel):
    pqc_result: Dict[str, Any]


@router.post("/generate")
async def generate(request: SuggestionsRequest):
    """
    Given a PQC scoring result (from /api/v1/score/*), return an actionable
    migration suggestions document with roadmap, gap analysis, and CNSA 2.0
    compliance summary.
    """
    try:
        return generate_suggestions(request.pqc_result)
    except Exception as e:
        logger.exception(f"Suggestions generation failed: {e}")
        raise APIError(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code="suggestions_failed",
            message=str(e),
        )
