import re
import json
import subprocess
from datetime import datetime
import platform

# ---------------------------
# Utility Functions
# ---------------------------

def windows_run(cmd, use_powershell=True):
    """Run command on Windows, optionally with PowerShell."""
    try:
        if use_powershell:
            full_cmd = ['powershell', '-Command', cmd]
        else:
            full_cmd = cmd if isinstance(cmd, list) else cmd.split()
        
        result = subprocess.run(
            full_cmd,
            capture_output=True,
            text=True,
            timeout=30,
            shell=False
        )
        return result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        return "", "Command timed out"
    except Exception as e:
        return "", str(e)

def safe_run(func, *args, **kwargs):
    """Safely execute function and handle errors."""
    try:
        return func(*args, **kwargs)
    except Exception as e:
        return {"error": str(e)}

# ---------------------------
# Crypto Information Collection
# ---------------------------

def get_crypto_characteristics(crypto_data):
    """Get cryptographic characteristics without strength assessment."""
    characteristics = []
    
    sig_algo = crypto_data.get("signature_algorithm", "").lower()
    if "md5" in sig_algo:
        characteristics.append("uses_md5_signature")
    elif "sha1" in sig_algo:
        characteristics.append("uses_sha1_signature")
    elif "sha256" in sig_algo:
        characteristics.append("uses_sha256_signature")
    elif "sha384" in sig_algo:
        characteristics.append("uses_sha384_signature")
    elif "sha512" in sig_algo:
        characteristics.append("uses_sha512_signature")
    
    pub_key_algo = crypto_data.get("public_key_algorithm", "").lower()
    if "rsa" in pub_key_algo:
        characteristics.append("rsa_algorithm")
    elif "ecdsa" in pub_key_algo or "ecc" in pub_key_algo:
        characteristics.append("ecdsa_algorithm")
    elif "dsa" in pub_key_algo:
        characteristics.append("dsa_algorithm")
    
    return characteristics

def classify_cipher_suite(cipher_name):
    """Classify cipher suite type without strength judgment."""
    cipher_lower = cipher_name.lower()
    
    if "aes_256" in cipher_lower or "aes256" in cipher_lower:
        return "aes256_family"
    elif "aes_128" in cipher_lower or "aes128" in cipher_lower:
        return "aes128_family"
    elif "aes_192" in cipher_lower or "aes192" in cipher_lower:
        return "aes192_family"
    elif "chacha20" in cipher_lower:
        return "chacha20_family"
    elif "3des" in cipher_lower:
        return "3des_family"
    elif "des" in cipher_lower and "3des" not in cipher_lower:
        return "des_family"
    elif "rc4" in cipher_lower:
        return "rc4_family"
    elif "rc2" in cipher_lower:
        return "rc2_family"
    
    return "other_cipher"

def classify_protocol_version(protocol):
    """Classify protocol version without strength assessment."""
    protocol_str = str(protocol).lower()
    
    if "ssl 2" in protocol_str or "ssl2" in protocol_str:
        return "sslv2"
    elif "ssl 3" in protocol_str or "ssl3" in protocol_str:
        return "sslv3"
    elif "tls 1.0" in protocol_str or "tls1.0" in protocol_str:
        return "tlsv1_0"
    elif "tls 1.1" in protocol_str or "tls1.1" in protocol_str:
        return "tlsv1_1"
    elif "tls 1.2" in protocol_str or "tls1.2" in protocol_str:
        return "tlsv1_2"
    elif "tls 1.3" in protocol_str or "tls1.3" in protocol_str:
        return "tlsv1_3"
    
    return "unknown_protocol"

# ---------------------------
# System Context Information
# ---------------------------

def get_system_crypto_context():
    """Get system crypto context information."""
    context = {}
    
    os_out, _ = windows_run("(Get-WmiObject Win32_OperatingSystem).Caption")
    context['os_info'] = os_out
    
    version_out, _ = windows_run("(Get-WmiObject Win32_OperatingSystem).Version")
    context['os_version'] = version_out
    
    build_out, _ = windows_run("(Get-WmiObject Win32_OperatingSystem).BuildNumber")
    context['build_number'] = build_out
    
    arch_out, _ = windows_run("(Get-WmiObject Win32_OperatingSystem).OSArchitecture")
    context['architecture'] = arch_out
    
    computer_out, _ = windows_run("$env:COMPUTERNAME")
    context['computer_name'] = computer_out
    
    return context

# ---------------------------
# Enhanced Windows CryptoAPI
# ---------------------------

def collect_cryptoapi_info():
    """Collect comprehensive Windows CryptoAPI information."""
    crypto_info = {}
    
    # Cryptographic providers
    providers_cmd = """
    Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography\\Defaults\\Provider' | 
    Select-Object PSChildName | ConvertTo-Json -Compress
    """
    providers_out, _ = windows_run(providers_cmd)
    
    if providers_out:
        try:
            providers_data = json.loads(providers_out)
            if isinstance(providers_data, list):
                crypto_info['cryptographic_providers'] = {
                    'count': len(providers_data),
                    'providers': [p.get('PSChildName', '') for p in providers_data]
                }
            elif isinstance(providers_data, dict):
                crypto_info['cryptographic_providers'] = {
                    'count': 1,
                    'providers': [providers_data.get('PSChildName', '')]
                }
        except:
            crypto_info['cryptographic_providers'] = {'error': 'Failed to parse providers'}
    
    # Enhanced algorithm information
    algorithms_cmd = """
    Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography\\OID\\EncodingType 0\\CryptDllFindOIDInfo' | 
    Select-Object PSChildName | ConvertTo-Json -Compress
    """
    algo_out, _ = windows_run(algorithms_cmd)
    
    if algo_out:
        try:
            algo_data = json.loads(algo_out)
            if isinstance(algo_data, list):
                crypto_info['registered_oid_algorithms'] = {
                    'count': len(algo_data),
                    'algorithms': [a.get('PSChildName', '') for a in algo_data[:50]]
                }
        except:
            pass
    
    # FIPS mode status
    fips_cmd = """
    (Get-ItemProperty -Path 'HKLM:\\System\\CurrentControlSet\\Control\\Lsa\\FipsAlgorithmPolicy' -Name Enabled -ErrorAction SilentlyContinue).Enabled
    """
    fips_out, _ = windows_run(fips_cmd)
    crypto_info['fips_mode_enabled'] = fips_out.strip() == "1"
    
    # ECC Curve support
    ecc_cmd = """
    Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography\\OID\\EncodingType 0\\CryptDllFindOIDInfo' | 
    Where-Object { $_.PSChildName -like '*1.2.840.10045*' -or $_.PSChildName -like '*1.3.132*' } | 
    Select-Object PSChildName | ConvertTo-Json -Compress
    """
    ecc_out, _ = windows_run(ecc_cmd)
    
    if ecc_out and ecc_out != "":
        try:
            ecc_data = json.loads(ecc_out)
            if not isinstance(ecc_data, list):
                ecc_data = [ecc_data]
            crypto_info['ecc_curves_registered'] = {
                'count': len(ecc_data),
                'curves': [e.get('PSChildName', '') for e in ecc_data]
            }
        except:
            pass
    
    return crypto_info

# ---------------------------
# Enhanced TLS/SSL Configuration
# ---------------------------

def collect_tls_ssl_info():
    """Collect comprehensive TLS/SSL configuration."""
    tls_info = {}
    
    # Protocol configurations
    protocols = ['SSL 2.0', 'SSL 3.0', 'TLS 1.0', 'TLS 1.1', 'TLS 1.2', 'TLS 1.3']
    protocol_status = []
    
    for proto in protocols:
        proto_key = proto.replace(' ', ' ')
        
        client_cmd = f"""
        $path = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecurityProviders\\SCHANNEL\\Protocols\\{proto_key}\\Client'
        if (Test-Path $path) {{
            $enabled = (Get-ItemProperty -Path $path -Name Enabled -ErrorAction SilentlyContinue).Enabled
            $disabledByDefault = (Get-ItemProperty -Path $path -Name DisabledByDefault -ErrorAction SilentlyContinue).DisabledByDefault
            Write-Output "$enabled|$disabledByDefault"
        }} else {{
            Write-Output "NotConfigured"
        }}
        """
        client_out, _ = windows_run(client_cmd)
        
        server_cmd = f"""
        $path = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecurityProviders\\SCHANNEL\\Protocols\\{proto_key}\\Server'
        if (Test-Path $path) {{
            $enabled = (Get-ItemProperty -Path $path -Name Enabled -ErrorAction SilentlyContinue).Enabled
            $disabledByDefault = (Get-ItemProperty -Path $path -Name DisabledByDefault -ErrorAction SilentlyContinue).DisabledByDefault
            Write-Output "$enabled|$disabledByDefault"
        }} else {{
            Write-Output "NotConfigured"
        }}
        """
        server_out, _ = windows_run(server_cmd)
        
        protocol_status.append({
            'protocol': proto,
            'type': classify_protocol_version(proto),
            'client_status': client_out,
            'server_status': server_out
        })
    
    tls_info['protocol_configurations'] = protocol_status
    
    # Enhanced cipher suite collection with error handling
    ciphers_cmd = """
    try {
        $ciphers = Get-TlsCipherSuite -ErrorAction Stop
        $ciphers | Select-Object Name, 
            @{N='Protocols';E={$_.Protocols -join ','}}, 
            Exchange, Cipher, Hash, 
            @{N='CipherSuite';E={[Convert]::ToString($_.CipherSuite, 16)}} | 
        ConvertTo-Json -Compress -Depth 3
    } catch {
        Write-Output '{"error": "' + $_.Exception.Message + '"}'
    }
    """
    ciphers_out, _ = windows_run(ciphers_cmd)
    
    if ciphers_out and ciphers_out != "":
        try:
            cipher_data = json.loads(ciphers_out)
            if 'error' not in cipher_data:
                if not isinstance(cipher_data, list):
                    cipher_data = [cipher_data]
                cipher_analysis = analyze_cipher_suites(cipher_data)
                tls_info['cipher_suites'] = cipher_analysis
            else:
                tls_info['cipher_suites'] = cipher_data
        except Exception as e:
            tls_info['cipher_suites'] = {'error': str(e)}
    
    # Cipher suite order
    order_cmd = """
    $order = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Cryptography\\Configuration\\SSL\\00010002' -Name Functions -ErrorAction SilentlyContinue).Functions
    if ($order) {
        $order -split ',' | Select-Object -First 20 | ConvertTo-Json -Compress
    }
    """
    order_out, _ = windows_run(order_cmd)
    
    if order_out and order_out != "":
        try:
            order_data = json.loads(order_out)
            if isinstance(order_data, str):
                order_data = [order_data]
            tls_info['cipher_suite_order'] = {
                'count': len(order_data),
                'order': order_data
            }
        except:
            pass
    
    # Hash algorithms
    hash_cmd = """
    Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography\\OID\\EncodingType 0\\CryptDllFindOIDInfo' | 
    Where-Object { $_.PSChildName -like '*2.16.840.1.101.3.4.2*' -or $_.PSChildName -like '*1.3.14.3.2*' } | 
    Select-Object PSChildName | ConvertTo-Json -Compress
    """
    hash_out, _ = windows_run(hash_cmd)
    
    if hash_out and hash_out != "":
        try:
            hash_data = json.loads(hash_out)
            if not isinstance(hash_data, list):
                hash_data = [hash_data]
            tls_info['registered_hash_algorithms'] = {
                'count': len(hash_data),
                'algorithms': [h.get('PSChildName', '') for h in hash_data]
            }
        except:
            pass
    
    return tls_info

def analyze_cipher_suites(cipher_data):
    """Analyze cipher suite characteristics."""
    cipher_types = {}
    protocol_distribution = {}
    exchange_methods = {}
    hash_algorithms = {}
    
    cipher_details = []
    
    for cipher in cipher_data:
        name = cipher.get('Name', '')
        protocols = cipher.get('Protocols', '')
        exchange = cipher.get('Exchange', '')
        hash_algo = cipher.get('Hash', '')
        
        cipher_type = classify_cipher_suite(name)
        cipher_types[cipher_type] = cipher_types.get(cipher_type, 0) + 1
        
        # Protocol distribution
        if protocols:
            for proto in str(protocols).split(','):
                proto = proto.strip()
                if proto:
                    proto_type = classify_protocol_version(proto)
                    protocol_distribution[proto_type] = protocol_distribution.get(proto_type, 0) + 1
        
        # Exchange methods
        if exchange:
            exchange_methods[exchange] = exchange_methods.get(exchange, 0) + 1
        
        # Hash algorithms
        if hash_algo:
            hash_algorithms[hash_algo] = hash_algorithms.get(hash_algo, 0) + 1
        
        cipher_details.append({
            'name': name,
            'type': cipher_type,
            'protocols': protocols,
            'key_exchange': exchange,
            'cipher_algorithm': cipher.get('Cipher', ''),
            'hash_algorithm': hash_algo,
            'cipher_suite_hex': cipher.get('CipherSuite', '')
        })
    
    return {
        'cipher_type_distribution': cipher_types,
        'protocol_distribution': protocol_distribution,
        'key_exchange_distribution': exchange_methods,
        'hash_algorithm_distribution': hash_algorithms,
        'total_cipher_suites': len(cipher_data),
        'cipher_details': cipher_details[:50]  # First 50
    }

# ---------------------------
# Enhanced Certificate Store
# ---------------------------

def collect_certificate_store_info():
    """Collect comprehensive Windows certificate store information."""
    cert_info = {}
    
    stores = {
        'My': 'Personal',
        'Root': 'Trusted Root',
        'CA': 'Intermediate CA',
        'TrustedPublisher': 'Trusted Publishers',
        'TrustedPeople': 'Trusted People',
        'AuthRoot': 'Third-Party Root',
        'Disallowed': 'Untrusted Certificates'
    }
    
    for store_key, store_name in stores.items():
        # Current User store
        cu_cmd = f"""
        try {{
            $certs = Get-ChildItem -Path "Cert:\\CurrentUser\\{store_key}" -ErrorAction Stop
            $certs | Select-Object Subject, Issuer, NotBefore, NotAfter, Thumbprint, 
                                   @{{Name='SignatureAlgorithm';Expression={{$_.SignatureAlgorithm.FriendlyName}}}},
                                   @{{Name='PublicKeyAlgorithm';Expression={{$_.PublicKey.Oid.FriendlyName}}}},
                                   @{{Name='PublicKeySize';Expression={{$_.PublicKey.Key.KeySize}}}},
                                   @{{Name='HasPrivateKey';Expression={{$_.HasPrivateKey}}}},
                                   @{{Name='EnhancedKeyUsage';Expression={{($_.EnhancedKeyUsageList | Select-Object -ExpandProperty FriendlyName) -join ','}}}} -First 15 | 
            ConvertTo-Json -Compress -Depth 3
        }} catch {{
            Write-Output '{{}}'
        }}
        """
        cu_out, _ = windows_run(cu_cmd)
        
        if cu_out and cu_out != "" and cu_out != "{}":
            try:
                cert_data = json.loads(cu_out)
                if not isinstance(cert_data, list):
                    cert_data = [cert_data]
                
                parsed_certs = []
                for cert in cert_data:
                    crypto_info = {
                        'subject': cert.get('Subject', ''),
                        'issuer': cert.get('Issuer', ''),
                        'thumbprint': cert.get('Thumbprint', ''),
                        'signature_algorithm': cert.get('SignatureAlgorithm', ''),
                        'public_key_algorithm': cert.get('PublicKeyAlgorithm', ''),
                        'public_key_size': cert.get('PublicKeySize', 0),
                        'has_private_key': cert.get('HasPrivateKey', False),
                        'not_before': cert.get('NotBefore', ''),
                        'not_after': cert.get('NotAfter', ''),
                        'enhanced_key_usage': cert.get('EnhancedKeyUsage', ''),
                        'characteristics': get_crypto_characteristics({
                            'signature_algorithm': cert.get('SignatureAlgorithm', ''),
                            'public_key_algorithm': cert.get('PublicKeyAlgorithm', '')
                        })
                    }
                    parsed_certs.append(crypto_info)
                
                cert_info[f'current_user_{store_key.lower()}_store'] = {
                    'store_name': store_name,
                    'certificate_count': len(parsed_certs),
                    'certificates': parsed_certs
                }
            except:
                pass
        
        # Local Machine store
        lm_cmd = f"""
        try {{
            $certs = Get-ChildItem -Path "Cert:\\LocalMachine\\{store_key}" -ErrorAction Stop
            $certs | Select-Object Subject, Issuer, NotBefore, NotAfter, Thumbprint, 
                                   @{{Name='SignatureAlgorithm';Expression={{$_.SignatureAlgorithm.FriendlyName}}}},
                                   @{{Name='PublicKeyAlgorithm';Expression={{$_.PublicKey.Oid.FriendlyName}}}},
                                   @{{Name='PublicKeySize';Expression={{$_.PublicKey.Key.KeySize}}}},
                                   @{{Name='EnhancedKeyUsage';Expression={{($_.EnhancedKeyUsageList | Select-Object -ExpandProperty FriendlyName) -join ','}}}} -First 15 | 
            ConvertTo-Json -Compress -Depth 3
        }} catch {{
            Write-Output '{{}}'
        }}
        """
        lm_out, _ = windows_run(lm_cmd)
        
        if lm_out and lm_out != "" and lm_out != "{}":
            try:
                cert_data = json.loads(lm_out)
                if not isinstance(cert_data, list):
                    cert_data = [cert_data]
                
                parsed_certs = []
                for cert in cert_data:
                    crypto_info = {
                        'subject': cert.get('Subject', ''),
                        'issuer': cert.get('Issuer', ''),
                        'thumbprint': cert.get('Thumbprint', ''),
                        'signature_algorithm': cert.get('SignatureAlgorithm', ''),
                        'public_key_algorithm': cert.get('PublicKeyAlgorithm', ''),
                        'public_key_size': cert.get('PublicKeySize', 0),
                        'not_before': cert.get('NotBefore', ''),
                        'not_after': cert.get('NotAfter', ''),
                        'enhanced_key_usage': cert.get('EnhancedKeyUsage', ''),
                        'characteristics': get_crypto_characteristics({
                            'signature_algorithm': cert.get('SignatureAlgorithm', ''),
                            'public_key_algorithm': cert.get('PublicKeyAlgorithm', '')
                        })
                    }
                    parsed_certs.append(crypto_info)
                
                cert_info[f'local_machine_{store_key.lower()}_store'] = {
                    'store_name': store_name,
                    'certificate_count': len(parsed_certs),
                    'certificates': parsed_certs
                }
            except:
                pass
    
    return cert_info

# ---------------------------
# Installed Crypto Software
# ---------------------------

def collect_installed_crypto_software():
    """Collect information about installed cryptographic software."""
    software_info = {}
    
    # Look for crypto-related installed software
    software_cmd = """
    Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* |
    Where-Object {$_.DisplayName -match 'crypt|ssl|tls|certificate|security|vpn|encrypt'} |
    Select-Object DisplayName, DisplayVersion, Publisher, InstallDate -First 20 |
    ConvertTo-Json -Compress
    """
    software_out, _ = windows_run(software_cmd)
    
    if software_out and software_out != "":
        try:
            software_data = json.loads(software_out)
            if not isinstance(software_data, list):
                software_data = [software_data]
            software_info['installed_crypto_software'] = {
                'count': len(software_data),
                'software': software_data
            }
        except:
            pass
    
    return software_info

# ---------------------------
# Main Information Collection
# ---------------------------

def crypto_information_audit():
    """
    Perform comprehensive informational crypto audit on Windows machine.
    Returns results directly without saving to local storage.
    """
    
    hostname, _ = windows_run("$env:COMPUTERNAME")
    if not hostname:
        hostname = platform.node()

    # Enhanced information collection sections
    info_sections = {
        'system_context': get_system_crypto_context,
        'cryptoapi_info': collect_cryptoapi_info,
        'tls_ssl_configuration': collect_tls_ssl_info,
        'certificate_stores': collect_certificate_store_info,
        'installed_crypto_software': collect_installed_crypto_software
    }

    results = {}
    
    print("=" * 60)
    print("WINDOWS CRYPTOGRAPHIC INFORMATION AUDIT")
    print("=" * 60)
    print(f"Hostname: {hostname}")
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    print()
    
    for section_name, collect_function in info_sections.items():
        print(f"[*] Collecting {section_name.replace('_', ' ').title()}...", end=" ")
        results[section_name] = safe_run(collect_function)
        if isinstance(results[section_name], dict) and 'error' in results[section_name]:
            print(f"Warning: {results[section_name]['error']}")
        else:
            print("OK")
    
    print()
    print("=" * 60)
    print("AUDIT COMPLETED - Results ready for API transmission")
    print("=" * 60)
    
    return results, hostname