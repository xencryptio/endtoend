
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
from logging_config import setup_logging
import httpx
from http_client import call_service
import asyncio
from exceptions import APIError

# Import the crypto audit function
from windows_audit import crypto_information_audit

# Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://192.168.91.128:9000")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "5"))
LOG_FILE = os.getenv("AGENT_LOG_FILE", "C:\\ProgramData\\CryptoAgent\\crypto_agent.log")
AGENT_ID_FILE = os.getenv("AGENT_ID_FILE", "C:\\ProgramData\\CryptoAgent\\agent_id.txt")
AGENT_PROFILE = os.getenv("AGENT_PROFILE", "default")

# Setup logging
os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
setup_logging("CRYPTO-AGENT-WINDOWS", logging.INFO)
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
                "platform": self.platform,  # ✅ EXPLICIT PLATFORM
                "os_info": os_info,
                "kernel_version": platform.release(),
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Error getting system info: {e}")
            return None
    
    def register_agent(self):
        """Register this agent with the API server"""
        async def _async_register():
            try:
                system_info = self.get_system_info()
                if not system_info:
                    logger.error("Failed to get system information")
                    return False
                
                url = f"{API_BASE_URL}/api/v1/agent/register"
                headers = {
                  "X-Agent-ID": self.agent_id,
                  "X-Agent-Profile": AGENT_PROFILE
                }

                response = await call_service("POST", url, json=system_info, headers=headers, timeout=10)
                
                return response.status_code == 200
                    
            except httpx.RequestError as e:
                logger.error(f"Registration request failed: {e}")
                raise APIError(status_code=500, error_code="network_error", message=f"Registration network request failed: {e}")
            except Exception as e:
                logger.error(f"Unexpected error during registration: {e}")
                raise APIError(status_code=500, error_code="unexpected_error", message=f"Unexpected error during registration: {e}")
        
        success = asyncio.run(_async_register())
        if success:
            logger.info("Agent registered successfully")
            self.registered = True
        return success
    
    def send_system_info(self):
        """Send current system information to API server"""
        async def _async_send():
            try:
                system_info = self.get_system_info()
                if not system_info:
                    return False
                
                url = f"{API_BASE_URL}/api/v1/system/info"
                headers = {
                  "X-Agent-ID": self.agent_id,
                  "X-Agent-Profile": AGENT_PROFILE
                }

                response = await call_service("POST", url, json=system_info, headers=headers, timeout=10)
                
                return response.status_code == 200
                    
            except httpx.RequestError as e:
                logger.error(f"Error sending system info: {e}")
                raise APIError(status_code=500, error_code="network_error", message=f"Network error sending system info: {e}")
            except Exception as e:
                logger.error(f"Unexpected error sending system info: {e}")
                raise APIError(status_code=500, error_code="unexpected_error", message=f"Unexpected error sending system info: {e}")
        
        success = asyncio.run(_async_send())
        if success:
            logger.debug("System info sent successfully")
        return success
    
    def fetch_action(self):
        """Poll the API server for pending actions"""
        async def _async_fetch():
            try:
                url = f"{API_BASE_URL}/api/v1/agent/fetchaction/{self.agent_id}"
                headers = {
                  "X-Agent-ID": self.agent_id,
                  "X-Agent-Profile": AGENT_PROFILE
                }

                response = await call_service("GET", url, headers=headers, timeout=10)
                
                return response.json()
                    
            except httpx.RequestError as e:
                logger.error(f"Error fetching action: {e}")
                raise APIError(status_code=500, error_code="network_error", message=f"Network error fetching action: {e}")
            except Exception as e:
                logger.error(f"Unexpected error fetching action: {e}")
                raise APIError(status_code=500, error_code="unexpected_error", message=f"Unexpected error fetching action: {e}")
        return asyncio.run(_async_fetch())
    
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
            
            # ✅ VERIFY PLATFORM IN METADATA
            if '_metadata' in audit_results:
                logger.info(f"Platform in audit results: {audit_results['_metadata'].get('platform', 'NOT FOUND')}")
            else:
                logger.warning("No _metadata found in audit results!")
            
            return audit_results

        except Exception as e:
            logger.error(f"Error performing crypto audit: {e}")
            return None
    
    def send_audit_results(self, task_id, audit_results):
        """Send audit results to API server"""
        async def _async_send():
            try:
                url = f"{API_BASE_URL}/api/v1/audit/result"
                
                payload = {
                    "agent_id": self.agent_id,
                    "task_id": task_id,
                    "os": "Windows",  # ✅ ADD PLATFORM TO PAYLOAD
                    "audit_results": audit_results,
                    "timestamp": datetime.now().isoformat()
                }
                
                logger.info(f"Sending audit results with os: {payload.get('os')}")
                
                headers = {
                  "X-Agent-ID": self.agent_id,
                  "X-Agent-Profile": AGENT_PROFILE
                }

                response = await call_service("POST", url, json=payload, headers=headers, timeout=30)
                
                return response.status_code == 200
                    
            except httpx.RequestError as e:
                logger.error(f"Error sending audit results: {e}")
                import traceback
                logger.error(traceback.format_exc())
                raise APIError(status_code=500, error_code="network_error", message=f"Network error sending audit results: {e}")
            except Exception as e:
                logger.error(f"Unexpected error sending audit results: {e}")
                import traceback
                logger.error(traceback.format_exc())
                raise APIError(status_code=500, error_code="unexpected_error", message=f"Unexpected error sending audit results: {e}")
        
        success = asyncio.run(_async_send())
        if success:
            logger.info(f"Audit results sent successfully (Task: {task_id})")
        return success
    
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
        # The 'self.platform' attribute does not exist, removing this line.
        # logger.info(f"Platform: {self.platform}")
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
                        success = self.send_audit_results(task_id, audit_results)
                        if success:
                            logger.info(f"Successfully completed task {task_id}")
                        else:
                            logger.error(f"Failed to send results for task {task_id}")
                    else:
                        logger.error("Audit failed, no results to send")
                
                # Sleep for polling interval
                time.sleep(POLL_INTERVAL)
                
            except APIError as e:
                logger.error(f"Error in main loop with APIError: {e.message} (Code: {e.error_code})")
                import traceback
                logger.error(traceback.format_exc())
                if self.running:
                    time.sleep(POLL_INTERVAL)
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                import traceback
                logger.error(traceback.format_exc())
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