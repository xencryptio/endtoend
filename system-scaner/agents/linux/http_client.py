"""
HTTP client for making API calls
"""
import httpx
import time
import logging
import asyncio

from exceptions import APIError # Import custom APIError

logger = logging.getLogger(__name__)

async def _log_and_raise_for_status(response: httpx.Response, url: str):
    """
    Checks the response status code and logs/raises an APIError if it's a client or server error.
    """
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as e:
        status_code = e.response.status_code
        error_message = f"HTTP call to {url} failed with status {status_code}"
        
        # Attempt to parse error details from response body
        error_details = None
        try:
            error_details = e.response.json()
        except json.JSONDecodeError:
            error_details = {"response_body": e.response.text}
        
        # Use a generic error code if not specified in details
        error_code = error_details.get("error_code", "http_status_error") if isinstance(error_details, dict) else "http_status_error"

        logger.error(f"{error_message}. Details: {error_details}")
        raise APIError(status_code=status_code, error_code=error_code, message=error_message, details=error_details)
    except Exception as e:
        # Catch any other exceptions from raise_for_status
        logger.error(f"An unexpected error occurred while checking HTTP status for {url}: {e}")
        raise APIError(status_code=500, error_code="unexpected_http_error", message=f"Unexpected error checking status: {e}")


async def call_service(
    method: str,
    url: str,
    json: dict = None,
    params: dict = None,
    headers: dict = None,
    timeout: int = 10,
) -> httpx.Response:
    """
    Makes an asynchronous HTTP call to a service.

    Args:
        method (str): The HTTP method (e.g., "GET", "POST").
        url (str): The URL to call.
        json (dict, optional): JSON payload for the request body. Defaults to None.
        params (dict, optional): Query parameters for the request. Defaults to None.
        headers (dict, optional): Custom headers for the request. Defaults to None.
        timeout (int, optional): Request timeout in seconds. Defaults to 10.

    Returns:
        httpx.Response: The HTTP response object.

    Raises:
        APIError: If the request fails, times out, or receives a non-2xx status code.
    """
    start = time.time()
    logger.debug(f"Calling service: {method} {url} with timeout {timeout}s")
    
    # httpx.AsyncClient should ideally be managed at a higher level (e.g., FastAPI app state)
    # for persistent connections, but for simple agent calls, creating it per call is acceptable.
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            res = await client.request(method, url, json=json, params=params, headers=headers)
            await _log_and_raise_for_status(res, url) # Use the improved status checker
            
            latency = time.time() - start
            logger.info(f"Service call to {url} successful (Status: {res.status_code}, Latency: {latency:.2f}s)")
            return res
        except httpx.TimeoutException:
            error_message = f"Service call to {url} timed out after {timeout}s"
            logger.error(error_message)
            raise APIError(status_code=408, error_code="request_timeout", message=error_message)
        except httpx.RequestError as e:
            error_message = f"Network or request error while calling {url}: {e}"
            logger.error(error_message)
            raise APIError(status_code=500, error_code="network_error", message=error_message)
        except APIError:
            # Re-raise APIError that came from _log_and_raise_for_status
            raise
        except Exception as e:
            error_message = f"An unexpected error occurred during service call to {url}: {e}"
            logger.error(error_message)
            raise APIError(status_code=500, error_code="unexpected_error", message=error_message)

