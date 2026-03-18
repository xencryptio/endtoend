#!/usr/bin/env python3
"""
Example usage of the TLS scanner API.
Run this after starting the server with: python main.py
"""

import requests
import json

def scan_url(url: str):
    """Scan a URL and print the results."""
    api_url = "http://localhost:8000/scan"
    
    payload = {"url": url}
    
    print(f"Scanning {url}...")
    
    try:
        response = requests.post(api_url, json=payload, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        
        print(f"\n{'='*80}")
        print(f"Domain: {result['domain']}")
        print(f"Endpoints found: {len(result['endpoints'])}")
        print(f"{'='*80}\n")
        
        for i, endpoint in enumerate(result['endpoints'], 1):
            print(f"Endpoint {i}:")
            print(f"  IP: {endpoint['ip']}:{endpoint['port']}")
            print(f"  Protocols: {', '.join(endpoint['protocols'])}")
            
            # TLS 1.3 ciphers
            tls13 = endpoint['tls_configuration']['tls_1_3_cipher_suites']
            if tls13:
                print(f"\n  TLS 1.3 Cipher Suites ({len(tls13)}):")
                for cipher in tls13[:3]:  # Show first 3
                    print(f"    - {cipher['name']}")
                    print(f"      KEX: {cipher['key_exchange']}, Symmetric: {cipher['symmetric_encryption']}")
            
            # TLS 1.2 ciphers
            tls12 = endpoint['tls_configuration']['tls_1_2_cipher_suites']
            if tls12:
                print(f"\n  TLS 1.2 Cipher Suites ({len(tls12)}):")
                for cipher in tls12[:3]:  # Show first 3
                    print(f"    - {cipher['name']}")
                    print(f"      KEX: {cipher['key_exchange']}, Auth: {cipher['authentication']}")
            
            # Elliptic curves
            curves = endpoint['supported_elliptic_curves']
            if curves:
                print(f"\n  Supported Elliptic Curves ({len(curves)}):")
                for curve in curves:
                    print(f"    - {curve['name']} ({curve['bits']} bits)")
            
            # Leaf certificate
            leaf_certs = endpoint['certificates']['leaf_certificates']
            if leaf_certs:
                cert = leaf_certs[0]
                print(f"\n  Leaf Certificate:")
                print(f"    Public Key: {cert['public_key_algorithm']} ({cert['public_key_size']} bits)")
                print(f"    Signature: {cert['signature_algorithm']}")
            
            print(f"\n{'-'*80}\n")
        
        # Optionally save full result
        with open(f"scan_result_{result['domain']}.json", "w") as f:
            json.dump(result, f, indent=2)
        print(f"Full results saved to scan_result_{result['domain']}.json")
        
    except requests.exceptions.RequestException as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Example scans
    urls = [
        "https://www.google.com",
        "https://www.cloudflare.com",
        "https://example.com"
    ]
    
    for url in urls:
        scan_url(url)
        print("\n")
