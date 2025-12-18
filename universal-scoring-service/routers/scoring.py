"""
Universal Scoring Router
Single router file with endpoints for all scoring types
ALL endpoints use the SAME core scoring logic
"""
from fastapi import APIRouter, HTTPException, status
from core.scorer import UniversalPQCScorer
from core.models import UniversalScoringRequest, UniversalScoringResponse
import logging
from exceptions import APIError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/score", tags=["scoring"])

# ⭐ Single scorer instance used by ALL endpoints
scorer = UniversalPQCScorer()


@router.post("/agent-audit", response_model=UniversalScoringResponse)
async def score_agent_audit(request: UniversalScoringRequest):
    """
    Score agent audit results (Linux/Windows crypto configurations)
    
    The scoring logic is IDENTICAL to TLS and repository scoring.
    Only the endpoint name is different for client convenience.
    """
    logger.info("Entered /agent-audit endpoint")
    try:
        if request.scoring_type != "agent":
            raise APIError(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code="invalid_scoring_type",
                message=f"Invalid scoring_type '{request.scoring_type}' for /agent-audit endpoint"
            )
        
        # ⭐ Call the SAME universal scoring engine
        result = scorer.score_algorithms(
            algorithms=[algo.dict() for algo in request.algorithms],
            scoring_type="agent",
            metadata=request.metadata
        )
        
        # Add metadata passthrough
        result["metadata"] = {
            **request.metadata,
            "scoring_service": "universal-pqc-scorer",
            "endpoint": "/agent-audit"
        }
        
        logger.info("Agent audit scored successfully")
        return UniversalScoringResponse(**result)
        
    except APIError:
        raise
    except Exception as e:
        logger.exception(f"Agent scoring failed: {e}", exc_info=True)
        raise APIError(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code="agent_scoring_failed",
            message=f"Scoring failed: {str(e)}"
        )


@router.post("/tls-scan", response_model=UniversalScoringResponse)
async def score_tls_scan(request: UniversalScoringRequest):
    """
    Score TLS/SSL scan results (cipher suites, certificates, protocols)
    
    Uses the SAME scoring logic as agent and repository endpoints.
    """
    logger.info("Entered /tls-scan endpoint")
    try:
        if request.scoring_type != "tls":
            raise APIError(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code="invalid_scoring_type",
                message=f"Invalid scoring_type '{request.scoring_type}' for /tls-scan endpoint"
            )
        
        # ⭐ Call the SAME universal scoring engine
        result = scorer.score_algorithms(
            algorithms=[algo.dict() for algo in request.algorithms],
            scoring_type="tls",
            metadata=request.metadata,
            raw_response=request.raw_response
        )
        
        result["metadata"] = {
            **request.metadata,
            "scoring_service": "universal-pqc-scorer",
            "endpoint": "/tls-scan"
        }
        
        logger.info("TLS scan scored successfully")
        return UniversalScoringResponse(**result)
        
    except APIError:
        raise
    except Exception as e:
        logger.exception(f"TLS scoring failed: {e}", exc_info=True)
        raise APIError(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code="tls_scoring_failed",
            message=f"Scoring failed: {str(e)}"
        )


@router.post("/repository", response_model=UniversalScoringResponse)
async def score_repository(request: UniversalScoringRequest):
    """
    Score repository code scan results (detected crypto algorithms in code)
    
    Uses the SAME scoring logic as agent and TLS endpoints.
    """
    logger.info("Entered /repository endpoint")
    try:
        if request.scoring_type != "repository":
            raise APIError(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code="invalid_scoring_type",
                message=f"Invalid scoring_type '{request.scoring_type}' for /repository endpoint"
            )
        
        # ⭐ Call the SAME universal scoring engine
        result = scorer.score_algorithms(
            algorithms=[algo.dict() for algo in request.algorithms],
            scoring_type="repository",
            metadata=request.metadata
        )
        
        result["metadata"] = {
            **request.metadata,
            "scoring_service": "universal-pqc-scorer",
            "endpoint": "/repository"
        }
        
        logger.info("Repository scored successfully")
        return UniversalScoringResponse(**result)
        
    except APIError:
        raise
    except Exception as e:
        logger.exception(f"Repository scoring failed: {e}", exc_info=True)
        raise APIError(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code="repo_scoring_failed",
            message=f"Scoring failed: {str(e)}"
        )


@router.post("/generic", response_model=UniversalScoringResponse)
async def score_generic(request: UniversalScoringRequest):
    """
    Generic scoring endpoint - accepts any scoring_type
    
    Useful for future extensions or custom integrations.
    Uses the SAME universal scoring logic.
    """
    logger.info("Entered /generic endpoint")
    try:
        # ⭐ Call the SAME universal scoring engine (no type restriction)
        result = scorer.score_algorithms(
            algorithms=[algo.dict() for algo in request.algorithms],
            scoring_type=request.scoring_type,
            metadata=request.metadata,
            raw_response=request.raw_response
        )
        
        result["metadata"] = {
            **request.metadata,
            "scoring_service": "universal-pqc-scorer",
            "endpoint": "/generic"
        }
        
        logger.info("Generic request scored successfully")
        return UniversalScoringResponse(**result)
        
    except Exception as e:
        logger.exception(f"Generic scoring failed: {e}", exc_info=True)
        raise APIError(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code="generic_scoring_failed",
            message=f"Scoring failed: {str(e)}"
        )


@router.get("/algorithms")
async def list_algorithms():
    """
    List all algorithms in the resistance table
    
    Useful for clients to validate algorithm names before scoring.
    """
    logger.info("Entered /algorithms endpoint")
    try:
        algorithms = {
            "kex": list(scorer.resistance_table.get("kex", {}).keys()),
            "signature": list(scorer.resistance_table.get("signature", {}).keys()),
            "symmetric": list(scorer.resistance_table.get("symmetric", {}).keys()),
            "hash": list(scorer.resistance_table.get("hash", {}).keys()),
            "pqc_algorithms": list(scorer.pqc_algorithms),
            "deprecated_algorithms": list(scorer.deprecated_algorithms)
        }
        logger.info("Algorithms listed successfully")
        return algorithms
    except Exception as e:
        logger.exception(f"Failed to list algorithms: {e}", exc_info=True)
        raise APIError(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code="list_algorithms_failed",
            message="Failed to retrieve algorithm list"
        )


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    logger.info("Health check called")
    return {
        "status": "healthy",
        "service": "universal-pqc-scorer",
        "version": "1.0.0"
    }
