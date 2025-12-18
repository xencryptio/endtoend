import httpx
import logging
import time

logger = logging.getLogger(__name__)

async def call_service(
    method: str,
    url: str,
    json=None,
    headers=None,
    timeout=10,
    **kwargs
):
    """
    Unified HTTP client with logging for all inter-service calls
    """
    start = time.time()
    logger.debug(f"📡 Calling {method} {url}")

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.request(
                method=method,
                url=url,
                json=json,
                headers=headers,
                **kwargs
            )
            
            elapsed = time.time() - start
            
            if response.status_code >= 400:
                logger.error(f"❌ {method} {url} returned {response.status_code} ({elapsed:.2f}s)")
            else:
                logger.debug(f"✅ {method} {url} success ({elapsed:.2f}s)")
            
            response.raise_for_status()
            return response

    except httpx.TimeoutException:
        logger.error(f"⏱️ {method} {url} timed out after {timeout}s")
        raise
    except httpx.HTTPStatusError as e:
        logger.error(f"❌ {method} {url} failed with status {e.response.status_code}")
        raise
    except Exception as e:
        logger.error(f"💥 {method} {url} failed: {str(e)}")
        raise