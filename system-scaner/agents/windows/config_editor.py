"""
Crypto Agent Configuration Editor
Allows updating configuration without reinstalling
Run as Administrator to update and restart service
"""

import os
import sys
import json
import subprocess
import ctypes

# Check for admin privileges
def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

# Configuration
DATA_DIR = r"C:\ProgramData\CryptoAgent"
INSTALL_DIR = r"C:\Program Files\CryptoAgent"
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
SERVICE_NAME = "CryptoAgentService"
SERVICE_FILE = os.path.join(INSTALL_DIR, 'crypto_agent_service_windows.py')

# Default configuration template
DEFAULT_CONFIG = {
    "api_base_url": "http://192.168.91.128:9000",
    "poll_interval": 5,
    "log_level": "INFO",
    "description": "Crypto Agent Configuration File"
}

def load_config():
    """Load current configuration"""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"[!] Error loading config: {e}")
    return DEFAULT_CONFIG.copy()

def save_config(config):
    """Save configuration to file"""
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=4)
        print(f"[+] Configuration saved to: {CONFIG_FILE}")
        return True
    except Exception as e:
        print(f"[!] Error saving config: {e}")
        return False

def display_config(config):
    """Display current configuration"""
    print("\n" + "="*60)
    print("CURRENT CONFIGURATION")
    print("="*60)
    for key, value in config.items():
        if key != "description":
            print(f"  {key}: {value}")
    print("="*60)

def update_service_file(config):
    """Update service file with new configuration"""
    if not os.path.exists(SERVICE_FILE):
        print(f"[!] Service file not found: {SERVICE_FILE}")
        return False
    
    try:
        # Read current service file
        with open(SERVICE_FILE, 'r') as f:
            content = f.read()
        
        # Backup original
        backup_file = SERVICE_FILE + '.backup'
        with open(backup_file, 'w') as f:
            f.write(content)
        
        # Update API_BASE_URL
        import re
        content = re.sub(
            r'API_BASE_URL\s*=\s*["\'].*?["\']',
            f'API_BASE_URL = "{config["api_base_url"]}"',
            content
        )
        
        # Update POLL_INTERVAL
        content = re.sub(
            r'POLL_INTERVAL\s*=\s*\d+',
            f'POLL_INTERVAL = {config["poll_interval"]}',
            content
        )
        
        # Write updated content
        with open(SERVICE_FILE, 'w') as f:
            f.write(content)
        
        print("[+] Service file updated successfully")
        return True
        
    except Exception as e:
        print(f"[!] Error updating service file: {e}")
        return False

def restart_service():
    """Restart the Windows service"""
    print("\n[*] Restarting service...")
    
    try:
        # Stop service
        print("    Stopping service...", end=" ")
        subprocess.run(['sc', 'stop', SERVICE_NAME], 
                      capture_output=True, timeout=10)
        print("OK")
        
        import time
        time.sleep(3)
        
        # Start service
        print("    Starting service...", end=" ")
        result = subprocess.run(['sc', 'start', SERVICE_NAME], 
                              capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0:
            print("OK")
            print("[+] Service restarted successfully")
            return True
        else:
            print("FAILED")
            print(f"[!] Error: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"\n[!] Error restarting service: {e}")
        return False

def edit_config_interactive():
    """Interactive configuration editor"""
    config = load_config()
    
    while True:
        display_config(config)
        print("\nOptions:")
        print("  1. Change API URL")
        print("  2. Change Poll Interval")
        print("  3. Change Log Level")
        print("  4. Save and Apply (requires restart)")
        print("  5. Save without Apply")
        print("  6. Reset to Defaults")
        print("  0. Exit without saving")
        
        choice = input("\nEnter your choice: ").strip()
        
        if choice == '1':
            print(f"\nCurrent API URL: {config['api_base_url']}")
            new_url = input("Enter new API URL: ").strip()
            if new_url:
                config['api_base_url'] = new_url
                print("[+] API URL updated")
        
        elif choice == '2':
            print(f"\nCurrent poll interval: {config['poll_interval']} seconds")
            new_interval = input("Enter new poll interval (seconds): ").strip()
            if new_interval.isdigit():
                config['poll_interval'] = int(new_interval)
                print("[+] Poll interval updated")
            else:
                print("[!] Invalid number")
        
        elif choice == '3':
            print(f"\nCurrent log level: {config['log_level']}")
            print("Options: DEBUG, INFO, WARNING, ERROR, CRITICAL")
            new_level = input("Enter new log level: ").strip().upper()
            if new_level in ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']:
                config['log_level'] = new_level
                print("[+] Log level updated")
            else:
                print("[!] Invalid log level")
        
        elif choice == '4':
            if not is_admin():
                print("\n[!] Administrator privileges required to restart service")
                print("[!] Please run as Administrator or choose option 5")
                continue
            
            print("\n[*] Saving configuration and applying changes...")
            if save_config(config):
                if update_service_file(config):
                    print("\n[*] Configuration applied to service file")
                    
                    confirm = input("\nRestart service now? (yes/no): ").strip().lower()
                    if confirm in ['yes', 'y']:
                        if restart_service():
                            print("\n[+] Configuration applied successfully!")
                            input("\nPress Enter to exit...")
                            break
                    else:
                        print("\n[!] Changes will take effect after manual service restart")
                        input("\nPress Enter to exit...")
                        break
        
        elif choice == '5':
            if save_config(config):
                print("\n[+] Configuration saved")
                print("[!] Note: Service must be reinstalled or manually updated")
                print("    to apply these changes")
                input("\nPress Enter to continue...")
        
        elif choice == '6':
            confirm = input("\nReset to default configuration? (yes/no): ").strip().lower()
            if confirm in ['yes', 'y']:
                config = DEFAULT_CONFIG.copy()
                print("[+] Configuration reset to defaults")
        
        elif choice == '0':
            print("\nExiting without saving...")
            break
        
        else:
            print("\n[!] Invalid choice")

def view_only_mode():
    """View configuration without editing"""
    config = load_config()
    display_config(config)
    print("\n[!] Running in view-only mode (not Administrator)")
    print("[!] Run as Administrator to make changes")
    input("\nPress Enter to exit...")

def main():
    """Main function"""
    print("="*60)
    print("CRYPTO AGENT CONFIGURATION EDITOR")
    print("="*60)
    
    if not os.path.exists(CONFIG_FILE) and not os.path.exists(SERVICE_FILE):
        print("\n[!] Crypto Agent does not appear to be installed")
        print(f"[!] Expected config: {CONFIG_FILE}")
        print(f"[!] Expected service: {SERVICE_FILE}")
        input("\nPress Enter to exit...")
        return
    
    if is_admin():
        print("\n[+] Running with Administrator privileges")
        print("[+] Full edit mode enabled")
        edit_config_interactive()
    else:
        print("\n[!] Not running as Administrator")
        view_only_mode()

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nCancelled by user.")
        sys.exit(0)
    except Exception as e:
        print(f"\n[!] Error: {e}")
        input("Press Enter to exit...")
        sys.exit(1)