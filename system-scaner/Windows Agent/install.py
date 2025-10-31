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
from pathlib import Path

# Check for admin privileges
def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

if not is_admin():
    print("ERROR: This installer must be run as Administrator!")
    print("Right-click and select 'Run as administrator'")
    input("Press Enter to exit...")
    sys.exit(1)

# Configuration
INSTALL_DIR = r"C:\Program Files\CryptoAgent"
DATA_DIR = r"C:\ProgramData\CryptoAgent"
SERVICE_NAME = "CryptoAgentService"
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")

# Default configuration
DEFAULT_CONFIG = {
    "api_base_url": "http://nipunnegi:9000",
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
            except:
                print(f"    ✗ Failed to install {package}")
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
    """Update service file with configuration"""
    print("[*] Updating service configuration...")
    
    config = load_config()
    service_file = os.path.join(INSTALL_DIR, 'crypto_agent_service_windows.py')
    
    try:
        with open(service_file, 'r') as f:
            content = f.read()
        
        # Update configuration in the service file
        content = content.replace(
            'API_BASE_URL = "http://192.168.91.128:9000"',
            f'API_BASE_URL = "{config["api_base_url"]}"'
        )
        content = content.replace(
            'POLL_INTERVAL = 5',
            f'POLL_INTERVAL = {config["poll_interval"]}'
        )
        
        with open(service_file, 'w') as f:
            f.write(content)
        
        print("    ✓ Configuration updated")
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
    
    print(f"\nCurrent API URL: {config['api_base_url']}")
    new_url = input("Enter new API URL (or press Enter to keep current): ").strip()
    if new_url:
        config['api_base_url'] = new_url
    
    print(f"\nCurrent poll interval: {config['poll_interval']} seconds")
    new_interval = input("Enter new poll interval (or press Enter to keep current): ").strip()
    if new_interval and new_interval.isdigit():
        config['poll_interval'] = int(new_interval)
    
    save_config(config)
    return config

def main():
    """Main installation process"""
    print("="*60)
    print("CRYPTO AGENT INSTALLER")
    print("="*60)
    print()
    
    # Interactive configuration
    config = configure_interactive()
    
    print("\n" + "="*60)
    print("INSTALLATION")
    print("="*60)
    print()
    
    # Check dependencies
    if not check_dependencies():
        print("\n[!] Failed to install dependencies")
        input("Press Enter to exit...")
        return
    
    # Create directories
    create_directories()
    
    # Copy files
    if not copy_files():
        print("\n[!] Failed to copy service files")
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
    print(f"\nService Name: {SERVICE_NAME}")
    print("\nService Management Commands:")
    print(f"  Start:   sc start {SERVICE_NAME}")
    print(f"  Stop:    sc stop {SERVICE_NAME}")
    print(f"  Status:  sc query {SERVICE_NAME}")
    print("\nTo uninstall, run: uninstall.exe (or uninstall.py) as Administrator")
    
    input("\nPress Enter to exit...")

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"\n[!] Installation failed: {e}")
        input("Press Enter to exit...")
        sys.exit(1)