import uuid
import logging
from fastapi import Request

logger = logging.getLogger(__name__)

async def correlation_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id

    logger.info(f"[REQ {request_id}] --> {request.method} {request.url.path}")

    try:
        response = await call_next(request)
    except Exception as e:
        logger.exception(f"[REQ {request_id}] 💥 Unhandled exception")
        raise

    logger.info(f"[REQ {request_id}] <-- {response.status_code}")
    response.headers["X-Request-ID"] = request_id
    return response
