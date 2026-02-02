import asyncio
import ssl
import socket
import asyncio.subprocess
import re
from typing import List, Dict, Optional

from cryptography import x509
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

async def get_full_cert_chain(ip: str, port: int, domain: str) -> List[bytes]:
    """Use openssl s_client -showcerts to get full chain"""
    cmd = f"echo Q | openssl s_client -showcerts -servername {domain} -connect {ip}:{port}"
    
    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, _ = await proc.communicate()
    certs_pem = stdout.decode('utf-8', errors='ignore')
    
    # Use regex to find all PEM certificates
    pem_certs = re.findall(r"-----BEGIN CERTIFICATE-----.+?-----END CERTIFICATE-----", certs_pem, re.DOTALL)
    
    full_chain = []
    for pem_data in pem_certs:
        try:
            # Convert PEM to DER
            cert_obj = x509.load_pem_x509_certificate(pem_data.encode(), default_backend())
            der_cert = cert_obj.public_bytes(encoding=serialization.Encoding.DER)
            full_chain.append(der_cert)
        except Exception:
            continue
            
    return full_chain

async def scan_with_openssl(ip: str, port: int, domain: str, timeout: int = 300) -> dict:
    """
    Perform TLS handshakes using Python's ssl module (OpenSSL backend).
    Returns raw TLS data including protocols, ciphers, and certificates.
    """
    result = {
        "ip": ip,
        "port": port,
        "domain": domain,
        "protocols": [],
        "cipher_suites": [],
        "certificates": [],
        "named_groups": [],
        "alpn": None,
        "ocsp_stapling": False,
        "server_cipher_order_preference": None
    }
    
    # Get full certificate chain
    cert_chain = await get_full_cert_chain(ip, port, domain)
    if cert_chain:
        result["certificates"] = cert_chain
        
    # Check for OCSP stapling
    result["ocsp_stapling"] = await check_ocsp_stapling(ip, port, domain)
    
    # Test TLS 1.2
    tls12_data = await probe_protocol(ip, port, domain, ssl.PROTOCOL_TLSv1_2, "TLS 1.2", timeout) # Pass timeout
    if tls12_data:
        result["protocols"].append("TLS 1.2")
        result["cipher_suites"].extend(tls12_data.get("ciphers", []))
        if not result["certificates"]:
            result["certificates"] = tls12_data.get("certificates", [])
        if tls12_data.get("alpn"):
            result["alpn"] = tls12_data.get("alpn")
    
    # Test TLS 1.3
    tls13_data = await probe_protocol(ip, port, domain, ssl.PROTOCOL_TLS_CLIENT, "TLS 1.3", timeout) # Pass timeout
    if tls13_data:
        result["protocols"].append("TLS 1.3")
        result["cipher_suites"].extend(tls13_data.get("ciphers", []))
        if not result["certificates"]:
            result["certificates"] = tls13_data.get("certificates", [])
        if tls13_data.get("alpn") and not result["alpn"]:
            result["alpn"] = tls13_data.get("alpn")
            
    # Probe for supported groups
    supported_groups = await probe_supported_groups(ip, port, domain)
    result["named_groups"] = supported_groups
    
    # Check server cipher order preference
    result["server_cipher_order_preference"] = await get_server_cipher_preference(ip, port, domain)
    
    return result

async def get_server_cipher_preference(ip: str, port: int, domain: str) -> bool:
    """Test server cipher preference by sending different cipher lists."""
    
    async def test_cipher_order(cipher_list: str) -> Optional[str]:
        try:
            cmd = f"openssl s_client -ciphersuites {cipher_list} -connect {ip}:{port} -servername {domain}"
            proc = await asyncio.create_subprocess_shell(
                cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate(b"")
            output = stdout.decode('utf-8', errors='ignore')
            
            for line in output.splitlines():
                if "Cipher is" in line:
                    return line.split("Cipher is")[1].strip()
            return None
        except Exception:
            return None

    # Test 1: Strong → weak order
    cipher_list_1 = "TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256"
    chosen_1 = await test_cipher_order(cipher_list_1)

    # Test 2: Weak → strong (reversed)
    cipher_list_2 = "TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_256_GCM_SHA384"
    chosen_2 = await test_cipher_order(cipher_list_2)

    # Test 3: Randomized order
    cipher_list_3 = "TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384"
    chosen_3 = await test_cipher_order(cipher_list_3)
    
    return chosen_1 == chosen_2 == chosen_3


async def check_ocsp_stapling(ip: str, port: int, domain: str) -> bool:
    """Check if OCSP stapling is enabled using subprocess"""
    
    try:
        cmd = f"openssl s_client -status -connect {ip}:{port} -servername {domain}"
        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate(b"")
        output = stdout.decode('utf-8', errors='ignore')
        
        return "OCSP Response Status: successful" in output
    except:
        return False

async def scan_application_layer(ip: str, port: int, domain: str, timeout: int = 5) -> dict:
    """NEW: Application layer scanning - ALPN, OCSP, HTTP headers"""
    
    result = {
        "alpn": None,
        "ocsp_stapling": await check_ocsp_stapling(ip, port, domain),
        "http_headers": {}
    }
    
    try:
        # ALPN detection
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        context.set_alpn_protocols(['h2', 'http/1.1'])
        
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout) # Use the passed timeout
        await asyncio.get_event_loop().run_in_executor(None, sock.connect, (ip, port))
        
        ssl_sock = context.wrap_socket(sock, server_hostname=domain)
        result["alpn"] = ssl_sock.selected_alpn_protocol()
        
        # HTTP headers (send HEAD request over TLS)
        ssl_sock.send(f"HEAD / HTTP/1.1\r\nHost: {domain}\r\n\r\n".encode())
        response = ssl_sock.recv(4096).decode('utf-8', errors='ignore')
        
        # Parse headers
        headers = {}
        for line in response.split('\r\n')[1:]:
            if ':' in line:
                key, value = line.split(':', 1)
                headers[key.strip()] = value.strip()
        
        result["http_headers"] = headers
        ssl_sock.close()
        
    except Exception:
        pass
    
    return result


async def probe_supported_groups(ip: str, port: int, domain: str) -> List[str]:
    """Test each curve using openssl subprocess"""
    curves = ["X25519", "secp256r1", "secp384r1", "X448"]
    
    supported = []
    
    for curve in curves:
        cmd = f"openssl s_client -groups {curve} -connect {ip}:{port} -servername {domain}"
        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        _, stderr = await proc.communicate(b"")
        
        # Check if the handshake was successful (crude check)
        if "handshake failure" not in stderr.decode('utf-8', errors='ignore'):
            supported.append(curve)
    
    return supported

def extract_key_size(cipher_name: str) -> Optional[int]:
    """Extract key size in bits from cipher suite name"""
    if "256" in cipher_name:
        return 256
    elif "128" in cipher_name:
        return 128
    elif "AES" in cipher_name and "GCM" in cipher_name:
        return 256  # Default for AES-GCM
    return None

async def probe_protocol(ip: str, port: int, domain: str, protocol: int, protocol_name: str, timeout: int = 5) -> Optional[dict]:
    """
    Probe a specific TLS protocol version.
    Returns cipher suites and certificates if successful.
    """
    loop = asyncio.get_event_loop()
    
    try:
        # Create SSL context
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        
        # Set ALPN protocols
        context.set_alpn_protocols(['h2', 'http/1.1'])
        
        # For TLS 1.3, configure appropriately
        if protocol_name == "TLS 1.3":
            context.minimum_version = ssl.TLSVersion.TLSv1_3
            context.maximum_version = ssl.TLSVersion.TLSv1_3
        elif protocol_name == "TLS 1.2":
            context.minimum_version = ssl.TLSVersion.TLSv1_2
            context.maximum_version = ssl.TLSVersion.TLSv1_2
        
        # ✅ FIX: Support both IPv4 and IPv6
        sock = None
        last_error = None
        
        try:
            # Get all possible address families for this IP
            addrinfo_list = socket.getaddrinfo(
                ip, port, 
                socket.AF_UNSPEC,  # Accept both IPv4 and IPv6
                socket.SOCK_STREAM
            )
            
            # Try each address family until one works
            for family, socktype, proto, canonname, sockaddr in addrinfo_list:
                try:
                    sock = socket.socket(family, socktype, proto)
                    sock.settimeout(timeout)
                    await loop.run_in_executor(None, sock.connect, sockaddr)
                    break  # Success - stop trying
                except OSError as e:
                    last_error = e
                    if sock:
                        sock.close()
                    sock = None
                    continue
            
            if sock is None:
                error_msg = f"Could not connect: {last_error}" if last_error else "No valid address families"
                print(f"Error probing protocol {protocol_name}: {error_msg}")
                return None
                
        except Exception as e:
            print(f"Error resolving {ip}: {e}")
            return None
        
        # Wrap with SSL
        ssl_sock = context.wrap_socket(sock, server_hostname=domain)
        
        # Get additional extension data
        server_hostname = ssl_sock.server_hostname
        tls_version = ssl_sock.version()
        negotiated_cipher = ssl_sock.cipher()
        alpn = ssl_sock.selected_alpn_protocol()

        # Get peer certificate
        peer_cert = ssl_sock.getpeercert(binary_form=True)

        # Build cert chain
        cert_chain = []
        if peer_cert:
            cert_chain.append(peer_cert)
        
        # Enumerate supported ciphers
        ciphers = await get_supported_ciphers(ip, port, domain, protocol_name)
        
        cipher_details = []
        for cipher_name in ciphers:
            cipher_details.append({
                "name": cipher_name,
                "protocol": protocol_name,
                "bits": extract_key_size(cipher_name)
            })
        
        ssl_sock.close()
        
        return {
            "ciphers": cipher_details,
            "certificates": cert_chain,
            "alpn": alpn,
            "server_hostname": server_hostname,
            "tls_version": tls_version,
            "negotiated_cipher": negotiated_cipher
        }
        
    except Exception as e:
        print(f"Error probing protocol {protocol_name}: {e}")
        return None

async def get_tls13_ciphers_subprocess(ip: str, port: int, domain: str) -> List[str]:
    """Use OpenSSL subprocess to enumerate TLS 1.3 ciphers (more reliable)"""
    
    test_ciphers = [
        "TLS_AES_256_GCM_SHA384",
        "TLS_CHACHA20_POLY1305_SHA256",
        "TLS_AES_128_GCM_SHA256",
        "TLS_AES_128_CCM_SHA256"
    ]
    
    supported = []
    
    for cipher in test_ciphers:
        cmd = f"echo Q | openssl s_client -tls1_3 -ciphersuites {cipher} -connect {ip}:{port} -servername {domain} 2>&1"
        
        try:
            proc = await asyncio.create_subprocess_shell(
                cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            output = stdout.decode('utf-8', errors='ignore')
            
            # Check if handshake succeeded
            if "Cipher is " + cipher in output or "New, TLSv1.3" in output:
                supported.append(cipher)
        except Exception:
            continue
    
    return supported

async def get_supported_ciphers(ip: str, port: int, domain: str, protocol_name: str) -> List[str]:
    """Enumerate all supported cipher suites by testing each one"""
    
    # For TLS 1.3, use subprocess (more reliable)
    if protocol_name == "TLS 1.3":
        return await get_tls13_ciphers_subprocess(ip, port, domain)
    
    # For TLS 1.2, use existing Python ssl approach
    elif protocol_name == "TLS 1.2":
        test_ciphers = [
            # ECDHE ciphers
            "ECDHE-RSA-AES256-GCM-SHA384",
            "ECDHE-RSA-AES128-GCM-SHA256",
            "ECDHE-ECDSA-AES256-GCM-SHA384",
            "ECDHE-ECDSA-AES128-GCM-SHA256",
            "ECDHE-RSA-CHACHA20-POLY1305",
            "ECDHE-ECDSA-CHACHA20-POLY1305",
            "ECDHE-RSA-AES256-SHA384",
            "ECDHE-RSA-AES128-SHA256",
            # DHE ciphers
            "DHE-RSA-AES256-GCM-SHA384",
            "DHE-RSA-AES128-GCM-SHA256",
            # Static RSA (legacy)
            "AES256-GCM-SHA384",
            "AES128-GCM-SHA256",
            "AES256-SHA256",
            "AES128-SHA256",
            "AES256-SHA",
            "AES128-SHA",
            # ADD THESE:
            "ECDHE-ECDSA-AES256-SHA384",
            "ECDHE-ECDSA-AES128-SHA256",
            "DHE-RSA-AES256-SHA256",
            "DHE-RSA-AES128-SHA256",
            "ECDHE-RSA-AES256-SHA",
            "ECDHE-RSA-AES128-SHA",
            "DHE-RSA-AES256-SHA",
            "DHE-RSA-AES128-SHA",
            # Legacy (but still seen)
            "DES-CBC3-SHA",
        ]
    else:
        test_ciphers = []
    
    supported = []
    
    # Test each cipher sequentially (parallel causes connection issues)
    for cipher in test_ciphers:
        is_supported = await test_cipher_support(ip, port, domain, cipher, protocol_name)
        if is_supported:
            supported.append(cipher)
    
    return supported


async def test_cipher_support(ip: str, port: int, domain: str, cipher: str, protocol_name: str) -> bool:
    """Test if a specific cipher is supported"""
    
    try:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        
        # CRITICAL: Set protocol version BEFORE setting ciphers
        if protocol_name == "TLS 1.3":
            context.minimum_version = ssl.TLSVersion.TLSv1_3
            context.maximum_version = ssl.TLSVersion.TLSv1_3
            context.set_ciphersuites(cipher)
        elif protocol_name == "TLS 1.2":
            context.minimum_version = ssl.TLSVersion.TLSv1_2
            context.maximum_version = ssl.TLSVersion.TLSv1_2
            context.set_ciphers(cipher)
        
        # Create socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(3)
        
        # Wrap and connect
        ssl_sock = context.wrap_socket(sock, server_hostname=domain)
        
        # Use asyncio executor to avoid blocking
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, ssl_sock.connect, (ip, port))
        
        # Success - cleanup
        ssl_sock.close()
        sock.close()
        return True
        
    except (ssl.SSLError, socket.timeout, ConnectionRefusedError, OSError):
        return False
    except Exception:
        return False