"""
Crypto Agent Installer for Windows
Installs the service with all dependencies and configuration
Run as Administrator
"""

import os
import sys
import subprocess
import shutil
import json
import ctypes
import socket
import urllib.request
import urllib.error
from pathlib import Path

# Check for admin privileges
def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

if not is_admin():
    print("="*60)
    print("ERROR: This installer must be run as Administrator!")
    print("="*60)
    print("\nRight-click on this file and select 'Run as administrator'")
    print("Or run from an elevated command prompt/PowerShell.")
    input("\nPress Enter to exit...")
    sys.exit(1)

# Configuration
INSTALL_DIR = r"C:\Program Files\CryptoAgent"
DATA_DIR = r"C:\ProgramData\CryptoAgent"
SERVICE_NAME = "CryptoAgentService"
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")

# Default configuration
DEFAULT_CONFIG = {
    "api_base_url": "http://localhost:9000",
    "poll_interval": 5,
    "log_level": "INFO"
}

def load_config():
    """Load configuration from config.json if exists"""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return DEFAULT_CONFIG

def save_config(config):
    """Save configuration to config.json"""
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=4)
    print(f"[+] Configuration saved to: {CONFIG_FILE}")

def test_server_connectivity(url):
    """Test if the server is reachable"""
    try:
        # Parse URL to get host and port
        from urllib.parse import urlparse
        parsed = urlparse(url)
        host = parsed.hostname
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
        
        # Test socket connection
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        result = sock.connect_ex((host, port))
        sock.close()
        
        if result == 0:
            # Also try HTTP request
            try:
                req = urllib.request.Request(url, method='HEAD')
                req.add_header('User-Agent', 'CryptoAgent-Installer/1.0')
                urllib.request.urlopen(req, timeout=10)
                return True, "Server is reachable and responding"
            except urllib.error.HTTPError as e:
                # Server responded with an HTTP error, but it's reachable
                return True, f"Server reachable (HTTP {e.code})"
            except Exception as e:
                return True, f"Port open but HTTP check failed: {e}"
        else:
            return False, f"Cannot connect to {host}:{port}"
    except socket.gaierror:
        return False, f"Cannot resolve hostname: {host}"
    except Exception as e:
        return False, f"Connection test failed: {e}"

def check_existing_service():
    """Check if service already exists"""
    try:
        result = subprocess.run(
            ['sc', 'query', SERVICE_NAME],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            return True, "running" if "RUNNING" in result.stdout else "stopped"
        return False, None
    except:
        return False, None

def check_dependencies():
    """Check if required Python packages are installed"""
    print("[*] Checking dependencies...")
    required = ['requests', 'pywin32']
    missing = []
    
    for package in required:
        try:
            if package == 'pywin32':
                import win32service
            else:
                __import__(package)
            print(f"    ✓ {package}")
        except ImportError:
            print(f"    ✗ {package} - MISSING")
            missing.append(package)
    
    if missing:
        print(f"\n[!] Missing packages: {', '.join(missing)}")
        print("[*] Installing missing packages...")
        for package in missing:
            try:
                subprocess.run([sys.executable, '-m', 'pip', 'install', package], 
                             check=True, capture_output=True)
                print(f"    ✓ Installed {package}")
            except Exception as e:
                print(f"    ✗ Failed to install {package}: {e}")
                return False
    
    return True

def create_directories():
    """Create necessary directories"""
    print("[*] Creating directories...")
    os.makedirs(INSTALL_DIR, exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)
    print(f"    ✓ {INSTALL_DIR}")
    print(f"    ✓ {DATA_DIR}")

def copy_files():
    """Copy service files to installation directory"""
    print("[*] Copying service files...")
    
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    files_to_copy = [
        'crypto_agent_service_windows.py',
        'windows_audit.py'
    ]
    
    for filename in files_to_copy:
        src = os.path.join(current_dir, filename)
        dst = os.path.join(INSTALL_DIR, filename)
        
        if os.path.exists(src):
            shutil.copy2(src, dst)
            print(f"    ✓ {filename}")
        else:
            print(f"    ✗ {filename} - NOT FOUND")
            return False
    
    return True

def update_service_config():
    """Update service file with configuration using regex for reliability"""
    print("[*] Updating service configuration...")
    
    import re
    
    config = load_config()
    service_file = os.path.join(INSTALL_DIR, 'crypto_agent_service_windows.py')
    
    try:
        with open(service_file, 'r') as f:
            content = f.read()
        
        # Use regex for more reliable replacement
        # Update API_BASE_URL
        content = re.sub(
            r'API_BASE_URL\s*=\s*["\'][^"\']*["\']',
            f'API_BASE_URL = "{config["api_base_url"]}"',
            content
        )
        
        # Update POLL_INTERVAL
        content = re.sub(
            r'POLL_INTERVAL\s*=\s*\d+',
            f'POLL_INTERVAL = {config["poll_interval"]}',
            content
        )
        
        with open(service_file, 'w') as f:
            f.write(content)
        
        print(f"    ✓ API URL: {config['api_base_url']}")
        print(f"    ✓ Poll Interval: {config['poll_interval']}s")
        return True
    except Exception as e:
        print(f"    ✗ Failed to update configuration: {e}")
        return False

def install_service():
    """Install Windows service"""
    print("[*] Installing Windows service...")
    
    service_script = os.path.join(INSTALL_DIR, 'crypto_agent_service_windows.py')
    
    try:
        # Install service
        result = subprocess.run(
            [sys.executable, service_script, 'install'],
            capture_output=True,
            text=True,
            cwd=INSTALL_DIR
        )
        
        if result.returncode == 0:
            print("    ✓ Service installed successfully")
            return True
        else:
            print(f"    ✗ Installation failed: {result.stderr}")
            return False
    except Exception as e:
        print(f"    ✗ Installation error: {e}")
        return False

def start_service():
    """Start the Windows service"""
    print("[*] Starting service...")
    
    service_script = os.path.join(INSTALL_DIR, 'crypto_agent_service_windows.py')
    
    try:
        result = subprocess.run(
            [sys.executable, service_script, 'start'],
            capture_output=True,
            text=True,
            cwd=INSTALL_DIR
        )
        
        if result.returncode == 0:
            print("    ✓ Service started successfully")
            return True
        else:
            print(f"    ✗ Failed to start: {result.stderr}")
            return False
    except Exception as e:
        print(f"    ✗ Start error: {e}")
        return False

def configure_interactive():
    """Interactive configuration"""
    print("\n" + "="*60)
    print("CONFIGURATION")
    print("="*60)
    
    config = load_config()
    
    # Check for existing service
    exists, status = check_existing_service()
    if exists:
        print(f"\n[!] Service '{SERVICE_NAME}' already exists (Status: {status})")
        choice = input("Do you want to reinstall? (y/n): ").strip().lower()
        if choice != 'y':
            print("[*] Installation cancelled.")
            input("Press Enter to exit...")
            sys.exit(0)
        # Stop and remove existing service
        print("[*] Stopping existing service...")
        subprocess.run(['sc', 'stop', SERVICE_NAME], capture_output=True)
        print("[*] Removing existing service...")
        subprocess.run(['sc', 'delete', SERVICE_NAME], capture_output=True)
        import time
        time.sleep(2)  # Wait for service to be fully removed
    
    # API URL Configuration
    print(f"\nCurrent API URL: {config['api_base_url']}")
    new_url = input("Enter new API URL (or press Enter to keep current): ").strip()
    if new_url:
        # Validate URL format
        if not new_url.startswith('http://') and not new_url.startswith('https://'):
            new_url = 'http://' + new_url
        config['api_base_url'] = new_url
    
    # Test connectivity
    print(f"\n[*] Testing connectivity to {config['api_base_url']}...")
    reachable, message = test_server_connectivity(config['api_base_url'])
    if reachable:
        print(f"    ✓ {message}")
    else:
        print(f"    ✗ {message}")
        print("\n[!] WARNING: Server is not reachable from this machine!")
        print("    The agent will not be able to communicate with the server.")
        print("    Please ensure:")
        print("    1. The server is running")
        print("    2. Firewall allows connections to the server port")
        print("    3. The URL is correct (include port if non-standard)")
        choice = input("\nContinue anyway? (y/n): ").strip().lower()
        if choice != 'y':
            print("[*] Installation cancelled.")
            input("Press Enter to exit...")
            sys.exit(0)
    
    # Poll interval
    print(f"\nCurrent poll interval: {config['poll_interval']} seconds")
    new_interval = input("Enter new poll interval (or press Enter to keep current): ").strip()
    if new_interval and new_interval.isdigit():
        interval = int(new_interval)
        if interval < 1:
            print("    [!] Minimum poll interval is 1 second, using 1")
            interval = 1
        elif interval > 300:
            print("    [!] Maximum poll interval is 300 seconds, using 300")
            interval = 300
        config['poll_interval'] = interval
    
    save_config(config)
    return config

def main():
    """Main installation process"""
    print("="*60)
    print("CRYPTO AGENT INSTALLER v1.1")
    print("="*60)
    print()
    print(f"Python Version: {sys.version.split()[0]}")
    print(f"Python Path: {sys.executable}")
    print(f"Install Directory: {INSTALL_DIR}")
    print(f"Data Directory: {DATA_DIR}")
    
    # Interactive configuration
    config = configure_interactive()
    
    print("\n" + "="*60)
    print("INSTALLATION")
    print("="*60)
    print()
    
    # Check dependencies
    if not check_dependencies():
        print("\n[!] Failed to install dependencies")
        print("    Try running: pip install requests pywin32")
        input("Press Enter to exit...")
        return
    
    # Create directories
    create_directories()
    
    # Copy files
    if not copy_files():
        print("\n[!] Failed to copy service files")
        print("    Check that the source files exist in the same directory as this installer")
        input("Press Enter to exit...")
        return
    
    # Update service configuration
    if not update_service_config():
        print("\n[!] Failed to update service configuration")
        input("Press Enter to exit...")
        return
    
    # Install service
    if not install_service():
        print("\n[!] Failed to install service")
        print("    Try running: python crypto_agent_service_windows.py install")
        input("Press Enter to exit...")
        return
    
    # Start service
    if not start_service():
        print("\n[!] Failed to start service")
        print("[*] You can start it manually using: sc start CryptoAgentService")
    
    print("\n" + "="*60)
    print("INSTALLATION COMPLETED SUCCESSFULLY!")
    print("="*60)
    print(f"\nInstallation directory: {INSTALL_DIR}")
    print(f"Data directory: {DATA_DIR}")
    print(f"Log file: {os.path.join(DATA_DIR, 'crypto_agent.log')}")
    print(f"Configuration file: {CONFIG_FILE}")
    print(f"\nAPI Server: {config['api_base_url']}")
    print(f"Poll Interval: {config['poll_interval']} seconds")
    print(f"\nService Name: {SERVICE_NAME}")
    print("\n" + "-"*60)
    print("SERVICE MANAGEMENT COMMANDS:")
    print("-"*60)
    print(f"  Start:    sc start {SERVICE_NAME}")
    print(f"  Stop:     sc stop {SERVICE_NAME}")
    print(f"  Status:   sc query {SERVICE_NAME}")
    print(f"  Restart:  sc stop {SERVICE_NAME} && sc start {SERVICE_NAME}")
    print(f"  Remove:   sc delete {SERVICE_NAME}")
    print("\n" + "-"*60)
    print("TROUBLESHOOTING:")
    print("-"*60)
    print(f"  View logs: type \"{os.path.join(DATA_DIR, 'crypto_agent.log')}\"")
    print(f"  Edit config: notepad \"{CONFIG_FILE}\"")
    print(f"  Test audit: python \"{os.path.join(INSTALL_DIR, 'windows_audit.py')}\"")
    print("\nTo uninstall, run: uninstall.exe (or uninstall.py) as Administrator")
    
    input("\nPress Enter to exit...")

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"\n[!] Installation failed: {e}")
        input("Press Enter to exit...")
        sys.exit(1)