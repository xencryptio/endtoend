
"""
Windows Crypto Agent Service
Runs as a Windows service with administrator privileges
Polls API for commands and sends crypto audit results
"""

import time
import socket
import platform
import requests
import json
import uuid
from datetime import datetime
import logging
import sys
import os
import servicemanager
import win32event
import win32service
import win32serviceutil

# Import the crypto audit function
from windows_audit import crypto_information_audit

# Configuration
API_BASE_URL = "http://192.168.91.128:9000"  # Change this to your API server URL
POLL_INTERVAL = 5  # seconds
LOG_FILE = "C:\\ProgramData\\CryptoAgent\\crypto_agent.log"
AGENT_ID_FILE = "C:\\ProgramData\\CryptoAgent\\agent_id.txt"

# Setup logging
os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("CryptoAgentWindows")


class CryptoAgentService(win32serviceutil.ServiceFramework):
    """Windows Service for Crypto Agent"""
    
    _svc_name_ = "CryptoAgentService"
    _svc_display_name_ = "Crypto Agent Service"
    _svc_description_ = "Monitors and audits cryptographic configurations on Windows systems"
    
    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.stop_event = win32event.CreateEvent(None, 0, 0, None)
        self.running = True
        self.agent_id = self.get_or_create_agent_id()
        self.hostname = socket.gethostname()
        self.ip_address = self.get_ip_address()
        self.registered = False
        
    def get_or_create_agent_id(self):
        """Get existing agent ID or create a new one"""
        try:
            os.makedirs(os.path.dirname(AGENT_ID_FILE), exist_ok=True)
            
            if os.path.exists(AGENT_ID_FILE):
                with open(AGENT_ID_FILE, 'r') as f:
                    agent_id = f.read().strip()
                    logger.info(f"Loaded existing agent ID: {agent_id}")
                    return agent_id
            else:
                agent_id = str(uuid.uuid4())
                with open(AGENT_ID_FILE, 'w') as f:
                    f.write(agent_id)
                logger.info(f"Created new agent ID: {agent_id}")
                return agent_id
        except Exception as e:
            logger.error(f"Error managing agent ID: {e}")
            return str(uuid.uuid4())
    
    def get_ip_address(self):
        """Get the primary IP address of the system"""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return "127.0.0.1"
    
    def get_system_info(self):
        """Collect basic system information"""
        try:
            os_info = f"{platform.system()} {platform.release()}"
            
            # Get Windows version info
            try:
                import winreg
                key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, 
                                    r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
                product_name = winreg.QueryValueEx(key, "ProductName")[0]
                build = winreg.QueryValueEx(key, "CurrentBuild")[0]
                os_info = f"{product_name} (Build {build})"
                winreg.CloseKey(key)
            except:
                pass
            
            return {
                "agent_id": self.agent_id,
                "hostname": self.hostname,
                "ip_address": self.ip_address,
                "os_info": os_info,
                "kernel_version": platform.release(),
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Error getting system info: {e}")
            return None
    
    def register_agent(self):
        """Register this agent with the API server"""
        try:
            system_info = self.get_system_info()
            if not system_info:
                logger.error("Failed to get system information")
                return False
            
            url = f"{API_BASE_URL}/api/v1/agent/register"
            response = requests.post(url, json=system_info, timeout=10)
            
            if response.status_code == 200:
                logger.info("Agent registered successfully")
                self.registered = True
                return True
            else:
                logger.error(f"Registration failed: {response.status_code} - {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Registration request failed: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error during registration: {e}")
            return False
    
    def send_system_info(self):
        """Send current system information to API server"""
        try:
            system_info = self.get_system_info()
            if not system_info:
                return False
            
            url = f"{API_BASE_URL}/api/v1/system/info"
            response = requests.post(url, json=system_info, timeout=10)
            
            if response.status_code == 200:
                logger.debug("System info sent successfully")
                return True
            else:
                logger.warning(f"Failed to send system info: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending system info: {e}")
            return False
    
    def fetch_action(self):
        """Poll the API server for pending actions"""
        try:
            url = f"{API_BASE_URL}/api/v1/agent/fetchaction/{self.agent_id}"
            response = requests.get(url, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                return data
            else:
                logger.warning(f"Fetch action failed: {response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"Error fetching action: {e}")
            return None
    
    def perform_crypto_audit(self):
        """Execute cryptographic audit locally - NO LOCAL STORAGE"""
        try:
            logger.info("Starting cryptographic audit...")
            
            # Run the audit - returns results directly, no file saving
            audit_results, hostname = crypto_information_audit()
            
            if "error" in audit_results:
                logger.error(f"Audit failed: {audit_results['error']}")
                return None
            
            logger.info("Cryptographic audit completed successfully")
            
            # DO NOT save to local storage - results will be sent directly to API
            return audit_results
            
        except Exception as e:
            logger.error(f"Error performing crypto audit: {e}")
            return None
    
    def send_audit_results(self, task_id, audit_results):
        """Send audit results to API server"""
        try:
            url = f"{API_BASE_URL}/api/v1/audit/result"
            
            payload = {
                "agent_id": self.agent_id,
                "task_id": task_id,
                "audit_results": audit_results,
                "timestamp": datetime.now().isoformat()
            }
            
            response = requests.post(url, json=payload, timeout=30)
            
            if response.status_code == 200:
                logger.info(f"Audit results sent successfully (Task: {task_id})")
                return True
            else:
                logger.error(f"Failed to send audit results: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending audit results: {e}")
            return False
    
    def SvcStop(self):
        """Called when the service is being stopped"""
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.stop_event)
        self.running = False
        logger.info("Service stop requested")
    
    def SvcDoRun(self):
        """Main service execution method"""
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, '')
        )
        self.main()
    
    def main(self):
        """Main service loop"""
        logger.info(f"Crypto Agent Service started (Agent ID: {self.agent_id})")
        logger.info(f"Hostname: {self.hostname}, IP: {self.ip_address}")
        logger.info(f"Running with Administrator privileges: {self.is_admin()}")
        
        # Initial registration and system info
        retry_count = 0
        max_retries = 5
        
        while not self.registered and retry_count < max_retries and self.running:
            logger.info(f"Attempting registration (attempt {retry_count + 1}/{max_retries})...")
            if self.register_agent():
                # Send initial system info
                self.send_system_info()
                break
            retry_count += 1
            if self.running:
                time.sleep(10)
        
        if not self.registered:
            logger.error("Failed to register agent after multiple attempts.")
            return
        
        # Main polling loop
        logger.info(f"Entering main polling loop (interval: {POLL_INTERVAL}s)")
        
        while self.running:
            try:
                # Check if service stop was requested
                if win32event.WaitForSingleObject(self.stop_event, 0) == win32event.WAIT_OBJECT_0:
                    break
                
                # Fetch action from server
                action_data = self.fetch_action()
                
                if action_data and action_data.get("scan_flag"):
                    task_id = action_data.get("task_id")
                    logger.info(f"Scan requested (Task ID: {task_id})")
                    
                    # Perform crypto audit (no local storage)
                    audit_results = self.perform_crypto_audit()
                    
                    if audit_results:
                        # Send results directly to API
                        self.send_audit_results(task_id, audit_results)
                        logger.info("Audit results sent to API - no local storage")
                    else:
                        logger.error("Audit failed, no results to send")
                
                # Sleep for polling interval
                time.sleep(POLL_INTERVAL)
                
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                if self.running:
                    time.sleep(POLL_INTERVAL)
        
        logger.info("Crypto Agent Service stopped")
    
    @staticmethod
    def is_admin():
        """Check if running with administrator privileges"""
        try:
            import ctypes
            return ctypes.windll.shell32.IsUserAnAdmin() != 0
        except:
            return False


if __name__ == '__main__':
    if len(sys.argv) == 1:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(CryptoAgentService)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        win32serviceutil.HandleCommandLine(CryptoAgentService)