import re
import json
import subprocess
from datetime import datetime

# ---------------------------
# Utility Functions
# ---------------------------

def local_run(cmd, sudo=False, sudo_pass=None):
    """Run command locally, optionally with sudo."""
    if sudo and sudo_pass:
        cmd = f"echo '{sudo_pass}' | sudo -S {cmd}"
    elif sudo:
        cmd = f"sudo {cmd}"
    
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30
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
    
    # Signature algorithm information
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
    
    # Public key algorithm information
    pub_key_algo = crypto_data.get("public_key_algorithm", "").lower()
    if "rsa" in pub_key_algo:
        characteristics.append("rsa_algorithm")
    elif "ecdsa" in pub_key_algo:
        characteristics.append("ecdsa_algorithm")
    elif "dsa" in pub_key_algo:
        characteristics.append("dsa_algorithm")
    
    return characteristics

def classify_cipher_type(cipher_name):
    """Classify cipher type without strength judgment."""
    cipher_lower = cipher_name.lower()
    
    # Cipher families
    if "aes256" in cipher_lower:
        return "aes256_family"
    elif "aes128" in cipher_lower:
        return "aes128_family"
    elif "aes192" in cipher_lower:
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
    protocol_lower = protocol.lower()
    
    if any(v in protocol_lower for v in ["sslv2", "ssl2"]):
        return "sslv2"
    elif any(v in protocol_lower for v in ["sslv3", "ssl3"]):
        return "sslv3"
    elif any(v in protocol_lower for v in ["tlsv1.0", "tlsv1_0", "tls1.0"]):
        return "tlsv1_0"
    elif any(v in protocol_lower for v in ["tlsv1.1", "tlsv1_1", "tls1.1"]):
        return "tlsv1_1"
    elif any(v in protocol_lower for v in ["tlsv1.2", "tlsv1_2", "tls1.2"]):
        return "tlsv1_2"
    elif any(v in protocol_lower for v in ["tlsv1.3", "tlsv1_3", "tls1.3"]):
        return "tlsv1_3"
    
    return "unknown_protocol"

# ---------------------------
# Informational Data Extraction
# ---------------------------

def extract_crypto_info_only(cert_data):
    """Extract cryptographic information from certificate."""
    if not isinstance(cert_data, dict):
        return None
    
    crypto_info = {
        "key_algorithm": cert_data.get("public_key_algorithm"),
        "key_size": cert_data.get("public_key_bits"),
        "signature_algorithm": cert_data.get("signature_algorithm"),
        "characteristics": get_crypto_characteristics(cert_data),
    }
    
    return crypto_info

def is_expiring_soon(cert_data, days_threshold=90):
    """Check if certificate expires within threshold days."""
    not_after = cert_data.get("not_after")
    if not not_after:
        return False
    
    try:
        if "T" in not_after:  # ISO format
            exp_date = datetime.fromisoformat(not_after.replace("Z", "+00:00"))
        else:  # String format
            return False  # Skip complex parsing
        
        days_until_expiry = (exp_date - datetime.now()).days
        return days_until_expiry <= days_threshold
    except:
        return False

# ---------------------------
# System Context Information
# ---------------------------

def get_system_crypto_context(sudo, sudo_pass):
    """Get system crypto context information."""
    context = {}
    
    # OS information
    os_out, _ = local_run("cat /etc/os-release | grep -E '(NAME=|VERSION_ID=)'", sudo, sudo_pass)
    context['os_info'] = os_out
    
    # Kernel version
    context['kernel_version'], _ = local_run("uname -r", sudo, sudo_pass)
    
    # Available crypto modules
    crypto_modules_out, _ = local_run("lsmod | grep -i crypt", sudo, sudo_pass)
    context['crypto_modules'] = crypto_modules_out.splitlines() if crypto_modules_out else []
    
    return context

# ---------------------------
# OpenSSL Information Collection
# ---------------------------

def collect_openssl_crypto_info(sudo, sudo_pass):
    """Collect OpenSSL cryptographic information."""
    openssl_info = {}
    
    # OpenSSL version and features
    version_out, _ = local_run("openssl version -a", sudo, sudo_pass)
    openssl_info['version_details'] = version_out
    openssl_info['fips_mode_enabled'] = "fips" in version_out.lower()
    
    # Available algorithms
    algorithms = {}
    for algo in ['aes128', 'aes192', 'aes256', 'des', '3des', 'sha1', 'sha256', 'sha384', 'sha512', 'md5']:
        test_out, _ = local_run(f"echo 'test' | openssl dgst -{algo} 2>/dev/null", sudo, sudo_pass)
        algorithms[algo] = {
            'available': bool(test_out and "unknown" not in test_out.lower()),
            'output_sample': test_out[:50] if test_out else None
        }
    
    openssl_info['available_algorithms'] = algorithms
    
    # Cipher information
    cipher_out, _ = local_run("openssl ciphers ALL", sudo, sudo_pass)
    cipher_analysis = analyze_cipher_characteristics(cipher_out)
    openssl_info['cipher_information'] = cipher_analysis
    
    # Protocol support
    protocols = []
    for proto in ['ssl2', 'ssl3', 'tls1', 'tls1_1', 'tls1_2', 'tls1_3']:
        proto_out, _ = local_run(f"openssl ciphers -{proto} 2>/dev/null", sudo, sudo_pass)
        protocols.append({
            "protocol": proto,
            "type": classify_protocol_version(proto),
            "cipher_count": len(proto_out.split(':')) if proto_out else 0,
            "available": bool(proto_out)
        })
    openssl_info['protocol_support'] = protocols
    
    return openssl_info

def analyze_cipher_characteristics(cipher_output):
    """Analyze cipher characteristics without strength assessment."""
    if not cipher_output:
        return {"error": "no_cipher_data"}
    
    ciphers = cipher_output.split(':')
    cipher_types = {}
    
    cipher_details = []
    
    for cipher in ciphers:
        cipher_type = classify_cipher_type(cipher)
        cipher_types[cipher_type] = cipher_types.get(cipher_type, 0) + 1
        
        cipher_details.append({
            "name": cipher,
            "type": cipher_type
        })
    
    return {
        "cipher_type_distribution": cipher_types,
        "total_ciphers": len(ciphers),
        "cipher_details": cipher_details[:20],  # First 20 for brevity
    }

# ---------------------------
# SSH Information Collection
# ---------------------------

def collect_ssh_crypto_info(sudo, sudo_pass):
    """Collect SSH cryptographic information."""
    ssh_crypto = {}
    
    # SSH version information
    ssh_version_out, _ = local_run("ssh -V 2>&1", sudo, sudo_pass)
    ssh_crypto['version_info'] = ssh_version_out
    ssh_crypto['version_details'] = parse_ssh_version_info(ssh_version_out)
    
    # Algorithm information
    algo_info = {}
    for algo_type in ['cipher', 'mac', 'kex', 'key']:
        algo_out, _ = local_run(f"ssh -Q {algo_type} 2>/dev/null", sudo, sudo_pass)
        if algo_out:
            algorithms = algo_out.splitlines()
            algo_info[algo_type] = {
                'total_count': len(algorithms),
                'algorithms': algorithms,
                'algorithm_types': categorize_ssh_algorithms(algorithms, algo_type)
            }
    
    ssh_crypto['algorithm_information'] = algo_info
    
    # SSH configuration information
    sshd_config_out, _ = local_run("grep -E '^(Ciphers|MACs|KexAlgorithms|Protocol|HostKeyAlgorithms)' /etc/ssh/sshd_config 2>/dev/null", sudo, sudo_pass)
    if sshd_config_out:
        ssh_crypto['configuration'] = parse_ssh_config_info(sshd_config_out)
    
    return ssh_crypto

def parse_ssh_version_info(version_output):
    """Parse SSH version information."""
    version_info = {}
    
    # Extract version number
    version_match = re.search(r'openssh[_\s](\d+\.\d+)', version_output.lower())
    if version_match:
        version_info['version_number'] = version_match.group(1)
        version_info['major_version'] = int(float(version_match.group(1)))
    
    # Extract additional information
    if "portable" in version_output.lower():
        version_info['portable_version'] = True
    
    if "ubuntu" in version_output.lower():
        version_info['distribution'] = "ubuntu"
    elif "debian" in version_output.lower():
        version_info['distribution'] = "debian"
    elif "rhel" in version_output.lower():
        version_info['distribution'] = "rhel"
    
    return version_info

def categorize_ssh_algorithms(algorithms, algo_type):
    """Categorize SSH algorithms by type."""
    categories = {}
    
    for algo in algorithms:
        algo_lower = algo.lower()
        
        if algo_type == "cipher":
            if "aes" in algo_lower:
                if "aes256" in algo_lower:
                    category = "aes256_ciphers"
                elif "aes192" in algo_lower:
                    category = "aes192_ciphers"
                else:
                    category = "aes128_ciphers"
            elif "chacha20" in algo_lower:
                category = "chacha20_ciphers"
            elif "3des" in algo_lower:
                category = "3des_ciphers"
            elif "des" in algo_lower:
                category = "des_ciphers"
            else:
                category = "other_ciphers"
        
        elif algo_type == "mac":
            if "sha256" in algo_lower:
                category = "sha256_macs"
            elif "sha384" in algo_lower:
                category = "sha384_macs"
            elif "sha512" in algo_lower:
                category = "sha512_macs"
            elif "sha1" in algo_lower:
                category = "sha1_macs"
            elif "md5" in algo_lower:
                category = "md5_macs"
            else:
                category = "other_macs"
        
        elif algo_type == "kex":
            if "diffie-hellman" in algo_lower:
                category = "diffie_hellman_kex"
            elif "ecdh" in algo_lower:
                category = "ecdh_kex"
            elif "curve25519" in algo_lower:
                category = "curve25519_kex"
            else:
                category = "other_kex"
        
        else:
            category = f"other_{algo_type}"
        
        categories[category] = categories.get(category, [])
        categories[category].append(algo)
    
    return categories

def parse_ssh_config_info(config_output):
    """Parse SSH configuration information."""
    config_info = {}
    
    for line in config_output.splitlines():
        line = line.strip()
        if line.startswith("Ciphers"):
            ciphers = line.split()[1].split(',')
            config_info['configured_ciphers'] = {
                'count': len(ciphers),
                'ciphers': ciphers,
                'cipher_types': categorize_ssh_algorithms(ciphers, "cipher")
            }
        elif line.startswith("MACs"):
            macs = line.split()[1].split(',')
            config_info['configured_macs'] = {
                'count': len(macs),
                'macs': macs,
                'mac_types': categorize_ssh_algorithms(macs, "mac")
            }
        elif line.startswith("KexAlgorithms"):
            kex = line.split()[1].split(',')
            config_info['configured_kex'] = {
                'count': len(kex),
                'kex_algorithms': kex,
                'kex_types': categorize_ssh_algorithms(kex, "kex")
            }
        elif line.startswith("Protocol"):
            protocol = line.split()[1]
            config_info['protocol_version'] = protocol
        elif line.startswith("HostKeyAlgorithms"):
            host_keys = line.split()[1].split(',')
            config_info['host_key_algorithms'] = {
                'count': len(host_keys),
                'algorithms': host_keys
            }
    
    return config_info

# ---------------------------
# Certificate Information Collection
# ---------------------------

def collect_certificates_info(sudo, sudo_pass):
    """Collect certificate information."""
    cert_info = {}
    
    # Find certificates in common locations
    search_paths = ["/etc/ssl", "/etc/pki", "/usr/share/ca-certificates", "/etc/nginx/ssl", "/etc/apache2/ssl"]
    
    all_certificates = []
    
    for base_path in search_paths:
        cert_files_out, _ = local_run(f"find {base_path} -name '*.crt' -o -name '*.pem' -o -name '*.cert' 2>/dev/null | head -30", sudo, sudo_pass)
        
        for cert_path in cert_files_out.splitlines():
            if cert_path.strip():
                cert_content_out, _ = local_run(f"openssl x509 -in {cert_path} -noout -text 2>/dev/null", sudo, sudo_pass)
                
                if cert_content_out:
                    cert_data = parse_certificate_info(cert_content_out)
                    if cert_data:
                        crypto_info = extract_crypto_info_only(cert_data)
                        
                        if crypto_info:
                            cert_entry = {
                                "path": cert_path,
                                "crypto_information": crypto_info,
                            }
                            all_certificates.append(cert_entry)
    
    cert_info['certificates'] = all_certificates[:10]  # Show first 10 for brevity
    cert_info['search_paths_used'] = search_paths
    
    return cert_info

def parse_certificate_info(cert_text):
    """Parse certificate for all relevant information."""
    cert_data = {}
    
    # Public key algorithm and size
    pub_key_match = re.search(r"Public Key Algorithm:\s*(.*)", cert_text)
    if pub_key_match:
        cert_data["public_key_algorithm"] = pub_key_match.group(1).strip()
    
    key_size_match = re.search(r"Public-Key:\s*\((\d+)\s*bit\)", cert_text)
    if key_size_match:
        cert_data["public_key_bits"] = int(key_size_match.group(1))
    
    # Signature algorithm
    sig_algo_match = re.search(r"Signature Algorithm:\s*(.*)", cert_text)
    if sig_algo_match:
        cert_data["signature_algorithm"] = sig_algo_match.group(1).strip()
    
    # Subject and Issuer
    subject_match = re.search(r"Subject:\s*(.*)", cert_text)
    if subject_match:
        cert_data["subject"] = subject_match.group(1).strip()
    
    issuer_match = re.search(r"Issuer:\s*(.*)", cert_text)
    if issuer_match:
        cert_data["issuer"] = issuer_match.group(1).strip()
    
    # Serial Number
    serial_match = re.search(r"Serial Number:\s*([^\s]+)", cert_text)
    if serial_match:
        cert_data["serial_number"] = serial_match.group(1).strip()
    
    # Validity dates
    not_before_match = re.search(r"Not Before\s*:\s*(.*)", cert_text)
    if not_before_match:
        cert_data["not_before"] = not_before_match.group(1).strip()
    
    not_after_match = re.search(r"Not After\s*:\s*(.*)", cert_text)
    if not_after_match:
        cert_data["not_after"] = not_after_match.group(1).strip()
    
    return cert_data

# ---------------------------
# Hardware Information Collection
# ---------------------------

def collect_hardware_crypto_info(sudo, sudo_pass):
    """Collect hardware cryptographic information."""
    hw_crypto = {}
    
    # CPU cryptographic features
    cpu_flags_out, _ = local_run("grep flags /proc/cpuinfo | head -1", sudo, sudo_pass)
    if cpu_flags_out:
        flags = cpu_flags_out.split(':')[1] if ':' in cpu_flags_out else cpu_flags_out
        
        # Crypto-related CPU features
        crypto_features = {
            "aes_instructions": "aes" in flags,
            "random_number_generator": "rdrand" in flags,
            "secure_random_seed": "rdseed" in flags,
            "sha_extensions": "sha_ni" in flags,
            "advanced_vector_extensions": "avx" in flags,
            "advanced_vector_extensions_2": "avx2" in flags,
            "carry_less_multiplication": "pclmulqdq" in flags
        }
        
        hw_crypto['cpu_crypto_features'] = crypto_features
        hw_crypto['crypto_feature_count'] = sum(crypto_features.values())
    
    # CPU information
    cpu_info_out, _ = local_run("grep -E '(model name|vendor_id)' /proc/cpuinfo | head -2", sudo, sudo_pass)
    hw_crypto['cpu_information'] = cpu_info_out
    
    # Hardware security modules
    tpm_out, _ = local_run("ls /dev/tpm* 2>/dev/null", sudo, sudo_pass)
    hw_crypto['tpm_devices'] = tpm_out.splitlines() if tpm_out.strip() else []
    
    # Hardware RNG
    hwrng_out, _ = local_run("ls /dev/hwrng /dev/random /dev/urandom 2>/dev/null", sudo, sudo_pass)
    hw_crypto['random_devices'] = hwrng_out.splitlines() if hwrng_out.strip() else []
    
    # Crypto devices
    crypto_devices_out, _ = local_run("ls /dev/crypto* 2>/dev/null", sudo, sudo_pass)
    hw_crypto['crypto_devices'] = crypto_devices_out.splitlines() if crypto_devices_out.strip() else []
    
    return hw_crypto

# ---------------------------
# System Security Information
# ---------------------------

def collect_system_security_info(sudo, sudo_pass):
    """Collect system security and compliance information."""
    security_info = {}
    
    # FIPS mode status
    fips_enabled_out, _ = local_run("cat /proc/sys/crypto/fips_enabled 2>/dev/null", sudo, sudo_pass)
    security_info['fips_kernel_mode'] = fips_enabled_out.strip() == "1"
    
    # System crypto policy (RHEL/CentOS/Fedora)
    crypto_policy_out, _ = local_run("update-crypto-policies --show 2>/dev/null", sudo, sudo_pass)
    if crypto_policy_out:
        security_info['system_crypto_policy'] = crypto_policy_out.strip()
    
    # Available crypto libraries
    crypto_libs_out, _ = local_run("ldconfig -p | grep -E '(ssl|crypto|gnutls)' | head -10", sudo, sudo_pass)
    security_info['crypto_libraries'] = crypto_libs_out.splitlines() if crypto_libs_out else []
    
    # Kernel crypto modules
    crypto_modules_out, _ = local_run("cat /proc/crypto | grep 'name' | head -20", sudo, sudo_pass)
    security_info['kernel_crypto_algorithms'] = crypto_modules_out.splitlines() if crypto_modules_out else []
    
    # System entropy
    entropy_out, _ = local_run("cat /proc/sys/kernel/random/entropy_avail 2>/dev/null", sudo, sudo_pass)
    if entropy_out.strip():
        security_info['system_entropy'] = int(entropy_out.strip())
    
    return security_info

# ---------------------------
# Main Information Collection
# ---------------------------

def crypto_information_audit(username, sudo_pass=None):
    """Perform informational crypto audit on local machine."""
    
    # Get hostname for identification
    hostname, _ = local_run("hostname", False, None)
    if not hostname:
        hostname = "localhost"

    # Information collection sections
    info_sections = {
        'system_context': get_system_crypto_context,
        'openssl_crypto': collect_openssl_crypto_info,
        'ssh_crypto': collect_ssh_crypto_info,
        'certificates': collect_certificates_info,
        'hardware_crypto': collect_hardware_crypto_info,
        'system_security': collect_system_security_info
    }

    results = {}
    
    for mode in ["without_sudo", "with_sudo"]:
        sudo = mode == "with_sudo"
        print(f"Collecting crypto information {mode}...")
        
        results[mode] = {}
        for section_name, collect_function in info_sections.items():
            print(f"  Collecting {section_name}...")
            results[mode][section_name] = safe_run(collect_function, sudo, sudo_pass)
    
    return results, hostname

# ---------------------------
# Run Crypto Information Audit
# ---------------------------

# if __name__ == "__main__":
#     # Configuration - Update these values
#     username = "123"  # Your local username
#     sudo_pass = "123"  # Your sudo password
#     output_dir = "/tmp"  # Directory where JSON will be saved

#     print(f"Starting local crypto information audit...")
#     audit_data, hostname = crypto_information_audit(username, sudo_pass)

#     if "error" in audit_data:
#         print(f"Audit failed: {audit_data['error']}")
#         exit(1)

#     # Save results
#     timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
#     filename = f"{output_dir}/crypto_info_audit_{hostname}_{timestamp}.json"
    
#     try:
#         with open(filename, "w", encoding="utf-8") as f:
#             json.dump(audit_data, f, indent=2, ensure_ascii=False)
#         print(f"\n[+] Crypto information audit results saved to {filename}")
        
#         # Print final audit summary
#         print(f"\n=== AUDIT COMPLETION SUMMARY ===")
#         print(f"Hostname: {hostname}")
#         total_sections = 0
#         successful_sections = 0
        
#         for mode in audit_data.keys():
#             if mode not in ["error", "information_summary"]:
#                 print(f"\n{mode.upper()}:")
#                 for section, result in audit_data[mode].items():
#                     total_sections += 1
#                     if isinstance(result, dict) and 'error' in result:
#                         print(f"  ✗ {section}: ERROR - {result['error']}")
#                     else:
#                         print(f"  ✓ {section}: OK")
#                         successful_sections += 1
        
#         print(f"\nAUDIT COMPLETION: {successful_sections}/{total_sections} sections successful")
#         print(f"Coverage: {(successful_sections/total_sections*100):.1f}%")
                        
#     except Exception as e:
#         print(f"Error saving results: {str(e)}")
