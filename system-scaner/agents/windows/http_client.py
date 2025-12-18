import httpx
import time
import logging

logger = logging.getLogger(__name__)

async def log_and_raise(response: httpx.Response, url: str):
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP call to {url} failed with status {e.response.status_code}")
        raise

async def call_service(
    method: str,
    url: str,
    json: dict = None,
    params: dict = None,
    headers: dict = None,
    timeout: int = 10,
):
    start = time.time()
    logger.info(f"Calling service: {method} {url}")
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            res = await client.request(method, url, json=json, params=params, headers=headers)
            await log_and_raise(res, url)
            latency = time.time() - start
            logger.info(f"Service call to {url} successful ({latency:.2f}s)")
            return res
        except httpx.TimeoutException:
            logger.error(f"Service call to {url} timed out")
            raise
        except httpx.RequestError as e:
            logger.error(f"Request error while calling {url}: {e}")
            raise