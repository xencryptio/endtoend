import uuid
import logging
from fastapi import Request
import time # Import time for latency calculation

logger = logging.getLogger(__name__)

async def correlation_middleware(request: Request, call_next):
    # Retrieve existing or generate new correlation ID
    correlation_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
    request.state.correlation_id = correlation_id # Store in request state for endpoint access
    
    # Optional: Retrieve Agent ID if present (for system-scaner)
    agent_id = request.headers.get("X-Agent-ID", "N/A")

    log_extra = {
        "correlation_id": correlation_id,
        "path": request.url.path,
        "method": request.method,
    }
    if agent_id != "N/A":
        log_extra["agent_id"] = agent_id

    # Log incoming request
    logger.info(f"-> {request.method} {request.url.path}", extra=log_extra)
    
    start_time = time.time()
    response = None
    try:
        response = await call_next(request)
    except Exception as e:
        # Log unhandled exceptions
        logger.exception(f"Unhandled exception for {request.method} {request.url.path}", extra=log_extra)
        raise e
    finally:
        process_time = time.time() - start_time
        status_code = response.status_code if response else 500 # Default to 500 if no response
        
        # Add correlation ID to response headers
        if response:
            response.headers["X-Correlation-ID"] = correlation_id
        
        log_extra["status_code"] = status_code
        log_extra["process_time"] = f"{process_time:.4f}s"
        
        # Log outgoing response
        logger.info(f"<- {request.method} {request.url.path} {status_code}", extra=log_extra)
    
    return response