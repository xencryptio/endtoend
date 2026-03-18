"""
Crypto Agent Uninstaller for Windows
Completely removes the service, files, and data
Run as Administrator
"""

import os
import sys
import subprocess
import shutil
import time
import ctypes

# Check for admin privileges
def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

if not is_admin():
    print("ERROR: This uninstaller must be run as Administrator!")
    print("Right-click and select 'Run as administrator'")
    input("Press Enter to exit...")
    sys.exit(1)

# Configuration
INSTALL_DIR = r"C:\Program Files\CryptoAgent"
DATA_DIR = r"C:\ProgramData\CryptoAgent"
SERVICE_NAME = "CryptoAgentService"

def stop_service():
    """Stop the Windows service"""
    print("[*] Stopping service...")
    
    try:
        # Check if service exists
        result = subprocess.run(
            ['sc', 'query', SERVICE_NAME],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print("    ℹ Service not found (may already be uninstalled)")
            return True
        
        # Stop the service
        result = subprocess.run(
            ['sc', 'stop', SERVICE_NAME],
            capture_output=True,
            text=True
        )
        
        if 'STOPPED' in result.stdout or 'not started' in result.stdout.lower():
            print("    ✓ Service stopped")
            time.sleep(2)  # Wait for service to stop
            return True
        else:
            print("    ⚠ Service may already be stopped")
            return True
            
    except Exception as e:
        print(f"    ⚠ Warning: {e}")
        return True  # Continue anyway

def uninstall_service():
    """Uninstall Windows service"""
    print("[*] Uninstalling service...")
    
    service_script = os.path.join(INSTALL_DIR, 'crypto_agent_service_windows.py')
    
    # Try using the service script first
    if os.path.exists(service_script):
        try:
            result = subprocess.run(
                [sys.executable, service_script, 'remove'],
                capture_output=True,
                text=True,
                cwd=INSTALL_DIR,
                timeout=10
            )
            
            if result.returncode == 0:
                print("    ✓ Service uninstalled successfully")
                return True
        except Exception as e:
            print(f"    ⚠ Service script method failed: {e}")
    
    # Fallback: use sc delete
    try:
        result = subprocess.run(
            ['sc', 'delete', SERVICE_NAME],
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0 or 'does not exist' in result.stdout.lower():
            print("    ✓ Service removed")
            return True
        else:
            print(f"    ⚠ sc delete result: {result.stdout}")
            return True  # Continue anyway
            
    except Exception as e:
        print(f"    ⚠ Warning: {e}")
        return True  # Continue anyway

def remove_files():
    """Remove installation files"""
    print("[*] Removing installation files...")
    
    removed = False
    
    # Remove installation directory
    if os.path.exists(INSTALL_DIR):
        try:
            shutil.rmtree(INSTALL_DIR)
            print(f"    ✓ Removed: {INSTALL_DIR}")
            removed = True
        except Exception as e:
            print(f"    ✗ Failed to remove {INSTALL_DIR}: {e}")
    else:
        print(f"    ℹ Directory not found: {INSTALL_DIR}")
    
    return removed

def remove_data():
    """Remove data directory"""
    print("[*] Removing data files...")
    
    if not os.path.exists(DATA_DIR):
        print(f"    ℹ Directory not found: {DATA_DIR}")
        return True
    
    print(f"\nThe data directory contains logs and configuration:")
    print(f"  {DATA_DIR}")
    
    choice = input("\nDo you want to remove all data? (yes/no): ").strip().lower()
    
    if choice in ['yes', 'y']:
        try:
            shutil.rmtree(DATA_DIR)
            print(f"    ✓ Removed: {DATA_DIR}")
            return True
        except Exception as e:
            print(f"    ✗ Failed to remove {DATA_DIR}: {e}")
            return False
    else:
        print("    ℹ Data directory preserved")
        return True

def clean_registry():
    """Clean up any registry entries (optional)"""
    print("[*] Cleaning registry entries...")
    
    try:
        # This is handled by sc delete, but we can verify
        result = subprocess.run(
            ['sc', 'query', SERVICE_NAME],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print("    ✓ Service registry entries cleaned")
        else:
            print("    ⚠ Service may still exist in registry")
            
    except Exception as e:
        print(f"    ⚠ Warning: {e}")
    
    return True

def main():
    """Main uninstallation process"""
    print("="*60)
    print("CRYPTO AGENT UNINSTALLER")
    print("="*60)
    print()
    print("This will completely remove Crypto Agent from your system.")
    print()
    
    confirm = input("Are you sure you want to continue? (yes/no): ").strip().lower()
    
    if confirm not in ['yes', 'y']:
        print("\nUninstallation cancelled.")
        input("Press Enter to exit...")
        return
    
    print("\n" + "="*60)
    print("UNINSTALLATION")
    print("="*60)
    print()
    
    # Stop service
    stop_service()
    
    # Uninstall service
    uninstall_service()
    
    # Wait a moment for service cleanup
    time.sleep(2)
    
    # Remove files
    remove_files()
    
    # Remove data (with confirmation)
    remove_data()
    
    # Clean registry
    clean_registry()
    
    print("\n" + "="*60)
    print("UNINSTALLATION COMPLETED!")
    print("="*60)
    print("\nCrypto Agent has been removed from your system.")
    
    # Check if anything remains
    if os.path.exists(INSTALL_DIR) or os.path.exists(DATA_DIR):
        print("\nNote: Some files could not be automatically removed.")
        if os.path.exists(INSTALL_DIR):
            print(f"  - {INSTALL_DIR}")
        if os.path.exists(DATA_DIR):
            print(f"  - {DATA_DIR}")
        print("You may need to remove them manually.")
    
    input("\nPress Enter to exit...")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nUninstallation cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n[!] Uninstallation error: {e}")
        input("Press Enter to exit...")
        sys.exit(1)