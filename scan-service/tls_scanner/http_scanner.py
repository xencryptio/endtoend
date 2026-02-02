import asyncio
from typing import Dict, Optional

async def get_security_headers(ip: str, port: int, domain: str) -> Dict[str, str]:
    """
    After a successful TLS handshake, send an HTTP HEAD or GET request and parse
    security headers from the response.
    """
    headers = {}
    
    async def try_request(method: str):
        nonlocal headers
        try:
            reader, writer = await asyncio.open_connection(ip, port, ssl=True, server_hostname=domain)
            
            request = f"{method} / HTTP/1.1\r\nHost: {domain}\r\nConnection: close\r\n\r\n"
            writer.write(request.encode())
            await writer.drain()
            
            while True:
                line = await reader.readline()
                if not line.strip():
                    break
                
                line = line.decode().strip()
                if ":" in line:
                    key, value = line.split(":", 1)
                    headers[key.strip().lower()] = value.strip()

            writer.close()
            await writer.wait_closed()
        except Exception:
            pass

    # Try HEAD first
    await try_request("HEAD")
    
    # If HEAD fails, fallback to GET
    if not headers:
        await try_request("GET")
        
    # Extract common security headers
    security_headers = {
        "Strict-Transport-Security": headers.get("strict-transport-security"),
        "Content-Security-Policy": headers.get("content-security-policy"),
        "X-Frame-Options": headers.get("x-frame-options"),
        "X-Content-Type-Options": headers.get("x-content-type-options"),
        "Referrer-Policy": headers.get("referrer-policy"),
        "Permissions-Policy": headers.get("permissions-policy"),
    }
    
    return {k: v for k, v in security_headers.items() if v is not None}