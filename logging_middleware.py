import uuid
import logging
from fastapi import Request

logger = logging.getLogger(__name__)

async def correlation_middleware(request: Request, call_next):
    """
    Adds correlation ID to every request for traceability
    """
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id

    logger.info(f"-> {request.method} {request.url.path}")

    try:
        response = await call_next(request)
        logger.info(f"<- {request.method} {request.url.path} {response.status_code}")
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception as e:
        logger.exception(f"💥 Unhandled exception in {request.url.path}")
        raise