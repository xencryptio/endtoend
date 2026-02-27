import asyncio
import socket
from urllib.parse import urlparse
from typing import List
from .openssl_runner import scan_with_openssl, scan_application_layer
from .normalize import normalize_endpoint_data, merge_with_application_data

async def scan_domain(url: str, timeout: int = 5, progress_tracker=None) -> dict:
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
    tasks = [scan_endpoint(ip, port, domain, timeout, progress_tracker) for ip in ips]
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
    Resolve domain to IPv4 addresses (preferred for Docker environments).
    Falls back to IPv6 only if no IPv4 addresses are found.
    Returns list of unique IPs, IPv4 first.
    """
    loop = asyncio.get_event_loop()
    try:
        # Prefer IPv4 — Docker bridge networks typically lack IPv6 routing
        infos_v4 = await loop.getaddrinfo(domain, None, family=socket.AF_INET, type=socket.SOCK_STREAM)
        ipv4_ips = list(set([info[4][0] for info in infos_v4]))
        if ipv4_ips:
            return ipv4_ips  # Return IPv4 only — avoids failed IPv6 scans ending up as endpoints[0]
    except Exception:
        pass
    try:
        # Fallback to IPv6 if no IPv4 addresses
        infos_v6 = await loop.getaddrinfo(domain, None, family=socket.AF_INET6, type=socket.SOCK_STREAM)
        return list(set([info[4][0] for info in infos_v6]))
    except Exception:
        return []

async def scan_endpoint(ip: str, port: int, domain: str, timeout: int = 5, progress_tracker=None) -> dict:
    """Scan a single endpoint - 3 phases"""
    
    # Track DNS phase
    if progress_tracker:
        progress_tracker.start_phase(domain, "dns_lookup")
        progress_tracker.complete_phase(domain, "dns_lookup")
    
    # PHASE 1: Original TLS crypto scan
    if progress_tracker:
        progress_tracker.start_phase(domain, "tls_handshake")
    raw_data = await scan_with_openssl(ip, port, domain, timeout)
    if progress_tracker:
        progress_tracker.complete_phase(domain, "tls_handshake")
    
    # PHASE 2: Application layer
    if progress_tracker:
        progress_tracker.start_phase(domain, "cipher_enumeration")
    app_data = await scan_application_layer(ip, port, domain, timeout)
    if progress_tracker:
        progress_tracker.complete_phase(domain, "cipher_enumeration")
    
    # PHASE 3: Normalize crypto data
    if progress_tracker:
        progress_tracker.start_phase(domain, "cert_parsing")
    normalized = normalize_endpoint_data(raw_data, ip, port)
    if progress_tracker:
        progress_tracker.complete_phase(domain, "cert_parsing")
    
    # PHASE 4: Merge everything
    if progress_tracker:
        progress_tracker.start_phase(domain, "formatting")
    final = merge_with_application_data(normalized, app_data)
    if progress_tracker:
        progress_tracker.complete_phase(domain, "formatting")
    
    return final