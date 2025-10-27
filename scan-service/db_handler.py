"""
Database Handler Module
Handles all database operations for SSL scan results
"""
import requests
import logging
import os
from typing import Dict, Any, Optional, List
from datetime import datetime


logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

class DatabaseHandler:
    """Handles all database operations for scan results."""
    
    def __init__(self, db_service_url: Optional[str] = None):
        """Initialize database handler with service URL."""
        self.db_service_url = db_service_url or os.getenv("DB_SERVICE_URL", "http://db-service:8001")
        logger.info("📡 Attempting to connect to database service at: %s", self.db_service_url)
        self.enabled = self._check_connection()
        
        if self.enabled:
            logger.info("✅ Database service is available and ready!")
        else:
            logger.warning("Database service is NOT available. Data will NOT be persisted!")
    
    def _check_connection(self) -> bool:
        """Check if database service is available."""
        try:
            response = requests.get(f"{self.db_service_url}/health", timeout=5)
            if response.status_code == 200:
                return True
            else:
                logger.warning("⚠️ Database health check failed with status: %s, Response: %s", response.status_code, response.text)
                return False
        except requests.exceptions.ConnectionError as e:
            logger.error("❌ Cannot connect to database service: Connection refused at %s/health", self.db_service_url)
            return False
        except Exception as e:
            logger.error("❌ Database service connection error: %s", e)
            return False
    
    def create_scan_batch(self, batch_id: str, total_urls: int, max_concurrent: int) -> bool:
        """Create a new scan batch in database."""
        if not self.enabled:
            logger.warning("Database disabled, skipping batch creation for %s", batch_id)
            return False
        
        try:
            payload = {
                "batch_id": batch_id,
                "total_urls": total_urls,
                "max_concurrent": max_concurrent,
                "status": "pending"
            }
            logger.info("📦 Creating batch in database: %s", payload)
            
            response = requests.post(
                f"{self.db_service_url}/scans/batch",
                json=payload,
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info("✅ Created batch %s in database", batch_id)
                return True
            else:
                logger.error("❌ Failed to create batch: %s - %s", response.status_code, response.text)
                return False
        except Exception as e:
            logger.exception("Exception creating batch in DB: %s", e)
            return False
    
    def save_scan_result(self, result: Dict[str, Any], batch_id: str) -> bool:
        """Save a successful scan result to database."""
        if not self.enabled:
            logger.warning("Database disabled, skipping result save for %s", result.get('url'))
            return False

        try:
            # Extract raw_response
            raw_response = result.get("raw_response")
            
            # If raw_response is None or empty, construct from available fields
            if not raw_response or not isinstance(raw_response, dict):
                logger.warning("⚠️ No valid raw_response for %s, constructing from result fields.", result.get('url'))
                raw_response = {
                    "domain": result.get("url", ""),
                    "quantum_score": result.get("quantum_score"),
                    "quantum_grade": result.get("quantum_grade"),
                    "tls_configuration": {
                        "supported_protocols": []
                    },
                    "pqc_analysis": {
                        "overall_score": result.get("quantum_score"),
                        "overall_grade": result.get("quantum_grade"),
                        "security_level": "unknown",
                        "quantum_ready": False,
                        "hybrid_ready": False
                    } if result.get("quantum_score") else {}
                }

            logger.info("💾 SAVING TO DB: URL: %s, Batch: %s, ReqID: %s, Score: %s, Grade: %s",
                       result.get('url'), batch_id, result.get('request_id'), 
                       result.get('quantum_score'), result.get('quantum_grade'))

            # 🔧 FIX: Map quantum_score/grade to pqc_overall_score/grade
            # The db-service will extract pqc_overall_score/grade from raw_response
            # but we need to include these for backward compatibility and for the validator in schemas.py
            db_data = {
                "batch_id": batch_id,
                "request_id": result.get("request_id"),
                "url": result.get("url"),
                "status": "completed",
                "scan_type": "crypto_audit",
                "requested_at": result.get("requested_at"),
                "completed_at": datetime.now().isoformat(),
                "execution_time_seconds": result.get("execution_time_seconds"),
                "quantum_score": result.get("quantum_score"),
                "quantum_grade": result.get("quantum_grade"),
                "raw_response": raw_response,
                "error_message": None,
            }

            logger.info("-> Sending payload to: %s/scans/result", self.db_service_url)

            response = requests.post(
                f"{self.db_service_url}/scans/result",
                json=db_data,
                timeout=30
            )

            logger.info("<- Response status: %s", response.status_code)
            
            if response.status_code == 200:
                response_data = response.json()
                logger.info("✅ Successfully saved result to DB! ID: %s, PQC Score: %s",
                           response_data.get('id'), response_data.get('pqc_overall_score'))
                return True
            else:
                logger.error("❌ Failed to save result: %s - %s", response.status_code, response.text)
                return False

        except Exception as e:
            logger.exception("💥 Exception saving result to DB for URL %s", result.get('url'))
            return False

    def save_failed_scan(self, domain: str, error: str, batch_id: str, request_id: str) -> bool:
        """Save a failed scan to database."""
        if not self.enabled:
            logger.warning("Database disabled, skipping failed scan for %s", domain)
            return False
        
        try:
            db_data = {
                "batch_id": batch_id,
                "request_id": request_id,
                "url": domain,
                "status": "failed",
                "scan_type": "crypto_audit",
                "requested_at": datetime.now().isoformat(),
                "completed_at": datetime.now().isoformat(),
                "error_message": error
            }
            
            logger.info("💾 Saving FAILED scan to database for: %s", domain)
            
            response = requests.post(
                f"{self.db_service_url}/scans/result",
                json=db_data,
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info("✅ Saved FAILED scan for %s to database", domain)
                return True
            else:
                logger.error("❌ Failed to save FAILED scan: %s - %s", response.status_code, response.text)
                return False
        except Exception as e:
            logger.exception("Exception saving failed scan to DB: %s", e)
            return False
    
    def update_batch_status(self, batch_id: str, status: str, successful: int = 0, failed: int = 0) -> bool:
        """Update scan batch status in database."""
        if not self.enabled:
            logger.warning("Database disabled, skipping batch update for %s", batch_id)
            return False
        
        try:
            payload = {
                "status": status,
                "successful_count": successful,
                "failed_count": failed
            }
            logger.info("🔄 Updating batch %s status: %s", batch_id, payload)
            
            response = requests.put(
                f"{self.db_service_url}/scans/batch/{batch_id}",
                json=payload,
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info("✅ Updated batch %s status to %s", batch_id, status)
                return True
            else:
                logger.error("❌ Failed to update batch status: %s - %s", response.status_code, response.text)
                return False
        except Exception as e:
            logger.exception("Exception updating batch status: %s", e)
            return False
    
    def get_scan_results(self, batch_id: Optional[str] = None, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """Fetch scan results from database."""
        if not self.enabled:
            return []
        
        try:
            params = {"limit": limit, "offset": offset}
            if batch_id:
                params["batch_id"] = batch_id
            
            response = requests.get(
                f"{self.db_service_url}/scans/results",
                params=params,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                return data if isinstance(data, list) else data.get("results", [])
            else:
                logger.warning("⚠️ Failed to fetch results: %s", response.status_code)
                return []
        except Exception as e:
            logger.warning("⚠️ Failed to fetch results from DB: %s", e)
            return []
    
    def get_batch_info(self, batch_id: str) -> Optional[Dict[str, Any]]:
        """Get information about a specific batch."""
        if not self.enabled:
            return None
        
        try:
            response = requests.get(
                f"{self.db_service_url}/scans/batch/{batch_id}",
                timeout=10
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.warning("⚠️ Failed to fetch batch info for %s: %s", batch_id, response.status_code)
                return None
        except Exception as e:
            logger.warning("⚠️ Failed to fetch batch info: %s", e)
            return None
    
    def get_all_batches(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """Get all scan batches."""
        if not self.enabled:
            return []
        
        try:
            response = requests.get(
                f"{self.db_service_url}/scans/batch",
                params={"limit": limit, "offset": offset},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                return data if isinstance(data, list) else data.get("batches", [])
            else:
                logger.warning("⚠️ Failed to fetch batches: %s", response.status_code)
                return []
        except Exception as e:
            logger.warning("⚠️ Failed to fetch batches from DB: %s", e)
            return []
    
    def search_scans(self, url: Optional[str] = None, status: Optional[str] = None, 
                     from_date: Optional[str] = None, to_date: Optional[str] = None,
                     limit: int = 100) -> List[Dict[str, Any]]:
        """Search scan results with filters."""
        if not self.enabled:
            return []
        
        try:
            params = {"limit": limit}
            if url:
                params["url"] = url
            if status:
                params["status"] = status
            if from_date:
                params["from_date"] = from_date
            if to_date:
                params["to_date"] = to_date
            
            response = requests.get(
                f"{self.db_service_url}/scans/results",
                params=params,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                return data if isinstance(data, list) else data.get("results", [])
            else:
                logger.warning("⚠️ Search failed: %s", response.status_code)
                return []
        except Exception as e:
            logger.warning("⚠️ Failed to search scans: %s", e)
            return []

    def delete_batch_from_db(self, batch_id: str) -> bool:
        """Delete a batch and all its associated results from database."""
        if not self.enabled:
            logger.warning("Database disabled, skipping batch deletion for %s", batch_id)
            return False
        
        try:
            logger.info("🗑️ Deleting batch %s from database...", batch_id)
            
            response = requests.delete(
                f"{self.db_service_url}/scans/batch/{batch_id}",
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info("✅ Deleted batch %s and all its results from database", batch_id)
                return True
            else:
                logger.error("❌ Failed to delete batch: %s - %s", response.status_code, response.text)
                return False
        except Exception as e:
            logger.exception("Exception deleting batch from DB: %s", e)
            return False

    def delete_result_from_db(self, result_id: int) -> bool:
        """Delete a single scan result from database."""
        if not self.enabled:
            logger.warning("Database disabled, skipping result deletion for %s", result_id)
            return False
        
        try:
            logger.info("🗑️ Deleting result %s from database...", result_id)
            
            response = requests.delete(
                f"{self.db_service_url}/scans/result/{result_id}",
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info("✅ Deleted result %s from database", result_id)
                return True
            else:
                logger.error("❌ Failed to delete result: %s - %s", response.status_code, response.text)
                return False
        except Exception as e:
            logger.exception("Exception deleting result from DB: %s", e)
            return False

    def clear_all_from_db(self) -> Dict[str, Any]:
        """Clear all data from database."""
        if not self.enabled:
            logger.warning("Database disabled, skipping clear all operation")
            return {"error": "Database disabled"}
        
        try:
            logger.info("🗑️ Clearing ALL data from database...")
            
            response = requests.delete(
                f"{self.db_service_url}/scans/clear-all",
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info("✅ Cleared database: %s batches and %s results deleted", 
                       data.get('deleted_batches', 0), data.get('deleted_results', 0))
                return data
            else:
                logger.error("❌ Failed to clear database: %s", response.status_code)
                return {"error": f"Failed with status {response.status_code}"}
        except Exception as e:
            logger.exception("Exception clearing database: %s", e)
            return {"error": str(e)}