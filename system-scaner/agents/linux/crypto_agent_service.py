#!/usr/bin/env python3
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

# Import the crypto audit function from your existing module
from linux_server import crypto_information_audit

# Configuration - Read from environment variables
API_BASE_URL = os.getenv("CRYPTO_API_BASE_URL", "http://system-scan:9000")
POLL_INTERVAL = int(os.getenv("CRYPTO_POLL_INTERVAL", "10"))
LOG_FILE = os.getenv("CRYPTO_LOG_FILE", "/var/log/crypto_agent.log")
AGENT_ID_FILE = os.getenv("CRYPTO_AGENT_ID_FILE", "/var/lib/crypto_agent/agent_id")

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("CryptoAgent")

class CryptoAgentService:
    def __init__(self):
        self.agent_id = self.get_or_create_agent_id()
        self.hostname = socket.gethostname()
        self.ip_address = self.get_ip_address()
        self.running = True
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
            
            if platform.system() == "Linux":
                try:
                    with open('/etc/os-release', 'r') as f:
                        for line in f:
                            if line.startswith('PRETTY_NAME='):
                                os_info = line.split('=')[1].strip().strip('"')
                                break
                except:
                    pass
            
            kernel_version = platform.release()
            
            return {
                "agent_id": self.agent_id,
                "hostname": self.hostname,
                "ip_address": self.ip_address,
                "os_info": os_info,
                "kernel_version": kernel_version,
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
                logger.error(f"Registration failed: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"Registration request failed: {e}")
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
        """Execute cryptographic audit"""
        try:
            logger.info("Starting cryptographic audit...")
            audit_results, hostname = crypto_information_audit("root", None)
            
            if "error" in audit_results:
                logger.error(f"Audit failed: {audit_results['error']}")
                return None
            
            logger.info("Cryptographic audit completed successfully")
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
    
    def run(self):
        """Main service loop"""
        logger.info(f"Crypto Agent Service started (Agent ID: {self.agent_id})")
        logger.info(f"API Base URL: {API_BASE_URL}")
        
        # Registration
        retry_count = 0
        max_retries = 5
        
        while not self.registered and retry_count < max_retries:
            logger.info(f"Attempting registration (attempt {retry_count + 1}/{max_retries})...")
            if self.register_agent():
                self.send_system_info()
                break
            retry_count += 1
            time.sleep(10)
        
        if not self.registered:
            logger.error("Failed to register agent after multiple attempts. Exiting.")
            return
        
        # Main polling loop
        logger.info(f"Entering main polling loop (interval: {POLL_INTERVAL}s)")
        
        while self.running:
            try:
                action_data = self.fetch_action()
                
                if action_data and action_data.get("scan_flag"):
                    task_id = action_data.get("task_id")
                    logger.info(f"Scan requested (Task ID: {task_id})")
                    
                    audit_results = self.perform_crypto_audit()
                    
                    if audit_results:
                        self.send_audit_results(task_id, audit_results)
                    else:
                        logger.error("Audit failed, no results to send")
                
                time.sleep(POLL_INTERVAL)
                
            except KeyboardInterrupt:
                logger.info("Received shutdown signal")
                self.running = False
                break
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                time.sleep(POLL_INTERVAL)
        
        logger.info("Crypto Agent Service stopped")

def main():
    """Entry point for the service"""
    try:
        service = CryptoAgentService()
        service.run()
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()