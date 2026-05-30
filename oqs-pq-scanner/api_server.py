"""
OQS PQ Scanner API Server
Provides HTTP API for PQ hybrid group detection
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging

from pq_detector import scan_pq_support

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="OQS PQ Scanner", version="1.0")


class ScanRequest(BaseModel):
    host: str
    port: int = 443
    timeout: int = 10


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy", "scanner": "oqs-pq-detector"}


@app.post("/scan-pq")
async def scan_pq(request: ScanRequest):
    """
    Scan for PQ hybrid group support.
    Returns list of detected PQ groups.
    """
    try:
        logger.info(f"Scanning {request.host}:{request.port} for PQ groups")
        
        result = scan_pq_support(request.host, request.port)
        
        logger.info(f"PQ scan complete: {result['pq_groups_detected']} groups detected")
        
        return result
        
    except Exception as e:
        logger.error(f"PQ scan failed for {request.host}: {e}")
        raise HTTPException(status_code=500, detail=f"PQ scan failed: {str(e)}")


@app.get("/")
async def root():
    return {
        "service": "OQS PQ Scanner",
        "version": "1.0",
        "description": "Post-Quantum hybrid group detector using OQS-OpenSSL",
        "endpoints": {
            "/health": "Health check",
            "/scan-pq": "Detect PQ hybrid groups (POST)"
        }
    }
