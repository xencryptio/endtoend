"""
OQS-based PQ Hybrid Group Detector
Uses OpenSSL with OQS provider to properly detect ML-KEM/Kyber hybrid support
"""
import os
import socket
import ssl
import subprocess
import json
import re
from typing import List, Dict, Optional

# PQ hybrid group definitions (IANA codes)
# Names must match those registered by the OQS provider (case-sensitive).
PQ_GROUPS = {
    0x6399: "X25519MLKEM768",         # IANA 25497 (standardized)
    0x639a: "SecP256r1MLKEM768",      # IANA 25498
    0x639b: "SecP384r1MLKEM1024",     # IANA 25499 — OQS registers this name
}

def detect_pq_groups(hostname: str, port: int = 443, timeout: int = 10) -> List[Dict]:
    """
    Detect PQ hybrid groups using OpenSSL s_client with OQS provider.
    For each candidate group we attempt a TLS 1.3 handshake offering only that
    group.  If the server completes the handshake ("CONNECTION ESTABLISHED" or
    a valid cipher is reported), the group is confirmed.
    """
    detected = []
    
    for group_id, group_name in PQ_GROUPS.items():
        try:
            cmd = [
                "openssl", "s_client",
                "-connect", f"{hostname}:{port}",
                "-groups", group_name,
                "-brief",
                "-no_ign_eof"
            ]
            
            result = subprocess.run(
                cmd,
                input=b"",
                capture_output=True,
                timeout=timeout,
                env={**os.environ, "OPENSSL_CONF": "/opt/oqs/ssl/openssl.cnf"}
            )
            
            stdout = result.stdout.decode('utf-8', errors='ignore')
            stderr = result.stderr.decode('utf-8', errors='ignore')
            combined = stdout + stderr
            
            # If the group name is unknown to this OpenSSL build, skip
            if "cannot be set" in stderr or "passed invalid argument" in stderr:
                continue
            
            # A successful PQ handshake: connection established with TLSv1.3
            # Note: openssl s_client -brief writes to stderr, not stdout
            if "CONNECTION ESTABLISHED" in combined or ("Cipher" in combined and "TLSv1.3" in combined):
                detected.append({
                    "id": group_id,
                    "name": group_name,
                    "type": "PQC-Hybrid",
                    "bits": 256,
                    "detection_method": "oqs-openssl"
                })
                    
        except subprocess.TimeoutExpired:
            continue
        except Exception:
            continue
    
    return detected


def detect_pq_with_python_ssl(hostname: str, port: int = 443) -> List[Dict]:
    """
    Fallback PQ detection. Previously this returned a false-positive
    'PQC-Hybrid-Inferred' entry for any server that supports TLS 1.3,
    which is meaningless — TLS 1.3 support does not imply PQC group support.
    The fallback now always returns empty; only the OQS OpenSSL probe
    (detect_pq_groups) produces authoritative results.
    """
    return []


def scan_pq_support(hostname: str, port: int = 443) -> Dict:
    """
    Complete PQ support scan combining multiple detection methods.
    """
    # Primary: OpenSSL s_client with OQS
    pq_groups = detect_pq_groups(hostname, port)
    
    # Fallback: Python SSL (limited)
    if not pq_groups:
        pq_groups = detect_pq_with_python_ssl(hostname, port)
    
    return {
        "host": hostname,
        "port": port,
        "pq_groups_detected": len(pq_groups),
        "pq_groups": pq_groups,
        "detection_available": True,
        "scanner_type": "oqs-openssl"
    }
