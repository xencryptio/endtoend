"""
Universal PQC Scoring Microservice
Single service with one core scoring engine, multiple endpoints
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import scoring
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

app = FastAPI(
    title="Universal PQC Scoring Service",
    description="Centralized post-quantum cryptography scoring for agent, TLS, and repository scans",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(scoring.router)

@app.get("/")
async def root():
    return {
        "service": "Universal PQC Scoring Service",
        "version": "1.0.0",
        "endpoints": {
            "agent": "/api/v1/score/agent-audit",
            "tls": "/api/v1/score/tls-scan",
            "repository": "/api/v1/score/repository",
            "generic": "/api/v1/score/generic",
            "algorithms": "/api/v1/score/algorithms",
            "health": "/api/v1/score/health"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9500)
