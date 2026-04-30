#!/usr/bin/env python3
"""
ssl_scanner.py — In-house SSL/TLS scanner
Produces a Qualys SSL Labs quality JSON report with zero external API dependency.

Usage:
    python ssl_scanner.py <hostname> [port] [output.json]

Examples:
    python ssl_scanner.py amazon.com
    python ssl_scanner.py amazon.com 443
    python ssl_scanner.py amazon.com 443 report.json

Requirements:
    pip install cryptography dnspython
"""
import sys
import ssl
try:
    # For OpenSSL 3.x: load the legacy provider to enable TLS 1.0/1.1
    ssl._ssl._lib.ERR_clear_error()
    ssl._ssl._lib.OSSL_PROVIDER_load(ssl._ssl._lib._ssl, b"legacy")
    print("[DEBUG] OpenSSL legacy provider loaded.")
except Exception as e:
    print(f"[DEBUG] Could not load OpenSSL legacy provider: {e}")
import os

# Add package dir to path so we can run as a script
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sslscanner.orchestrator import run


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    raw_host = sys.argv[1]
    for prefix in ("https://", "http://"):
        if raw_host.lower().startswith(prefix):
            raw_host = raw_host[len(prefix):]
            break
    host = raw_host.split("/")[0]
    port     = 443
    out_file = None

    for arg in sys.argv[2:]:
        if arg.isdigit():
            port = int(arg)
        else:
            out_file = arg

    run(host, port, out_file)


if __name__ == "__main__":
    main()