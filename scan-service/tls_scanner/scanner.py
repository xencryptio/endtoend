import asyncio
import socket
from urllib.parse import urlparse
from typing import List
from .openssl_runner import scan_with_openssl, scan_application_layer
from .normalize import normalize_endpoint_data, merge_with_application_data

async def scan_domain(url: str, timeout: int = 5) -> dict:
    """
    Main orchestration function.
    Coordinates DNS resolution, parallel endpoint scanning, and normalization.
    """
    # Parse URL to get domain and port
    parsed = urlparse(url)
    domain = parsed.hostname
    port = parsed.port or 443
    
    if not domain:
        raise ValueError("Invalid URL: cannot extract domain")
    
    # Resolve all IPs for the domain
    ips = await resolve_ips(domain)
    
    if not ips:
        raise ValueError(f"Could not resolve domain: {domain}")
    
    # Scan all endpoints in parallel
    tasks = [scan_endpoint(ip, port, domain, timeout) for ip in ips]
    endpoint_results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Filter out failed scans
    valid_results = []
    for result in endpoint_results:
        if not isinstance(result, Exception):
            valid_results.append(result)
    
    if not valid_results:
        raise ValueError("All endpoint scans failed")
    
    return {
        "domain": domain,
        "endpoints": valid_results
    }

async def resolve_ips(domain: str) -> List[str]:
    """
    Resolve domain to all IP addresses.
    Returns list of unique IPs.
    """
    loop = asyncio.get_event_loop()
    try:
        # Get address info for both IPv4 and IPv6
        infos = await loop.getaddrinfo(domain, None, family=socket.AF_UNSPEC, type=socket.SOCK_STREAM)
        ips = list(set([info[4][0] for info in infos]))
        return ips
    except Exception:
        return []

async def scan_endpoint(ip: str, port: int, domain: str, timeout: int = 5) -> dict:
    """Scan a single endpoint - 3 phases"""
    
    # PHASE 1: Original TLS crypto scan (DON'T CHANGE THIS)
    raw_data = await scan_with_openssl(ip, port, domain, timeout)
    
    # PHASE 2: Application layer (NEW - runs in parallel ideally)
    app_data = await scan_application_layer(ip, port, domain, timeout) # Pass timeout
    
    # PHASE 3: Normalize crypto data (KEEP ORIGINAL)
    normalized = normalize_endpoint_data(raw_data, ip, port)
    
    # PHASE 4: Merge everything (NEW)
    final = merge_with_application_data(normalized, app_data)
    
    return final