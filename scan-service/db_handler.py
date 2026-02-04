import httpx
import logging
from typing import Dict, Any, Optional
from datetime import datetime
from http_client import call_service

logger = logging.getLogger(__name__)

class DatabaseHandler:
    def __init__(self):
        import os
        self.db_service_url = os.getenv("DB_SERVICE_URL", "http://db-service:8001")
        logger.info(f"📊 Attempting to connect to database service at: {self.db_service_url}")
        self.enabled = False
        self._connection_checked = False
    
    async def _ensure_connected(self):
        """Check connection on first use"""
        if not self._connection_checked:
            self._connection_checked = True
            try:
                response = await call_service("GET", f"{self.db_service_url}/health", timeout=5)
                self.enabled = response.status_code == 200
                if self.enabled:
                    logger.info("✅ Database service is available")
                else:
                    logger.warning("⚠️ Database service health check failed")
            except Exception as e:
                logger.error(f"❌ Cannot connect to database service: {e}")
                self.enabled = False
    
    async def create_scan_batch(self, batch_id, total_urls, max_concurrent, request_payload=None):
        """Create a new scan batch in database."""
        await self._ensure_connected()
        if not self.enabled:
            logger.warning("Database disabled, skipping batch creation")
            return False

        try:
            logger.info(f"Creating batch {batch_id} with payload: {request_payload}")
            response = await call_service(
                "POST",
                f"{self.db_service_url}/scans/batch",
                json={
                    "batch_id": batch_id,
                    "total_urls": total_urls,
                    "max_concurrent": max_concurrent,
                    "request_payload": request_payload
                },
                timeout=10
            )
            
            if response.status_code not in (200, 201):
                logger.error(f"DB service returned {response.status_code}: {response.text}")
                return False
                
            return True
        except Exception as e:
            logger.error(f"Exception creating batch: {e}")
            return False
    
    async def save_scan_result(self, result: Dict[str, Any], batch_id: str) -> bool:  # ✅ CORRECT INDENTATION
        """Save a scan result to database."""
        await self._ensure_connected()
        
        if not self.enabled:
            logger.warning(f"⚠️  Database disabled, skipping result save for batch {batch_id}")
            return False
        
        try:
            db_data = {
                "batch_id": batch_id,
                "request_id": result.get("request_id"),
                "url": result.get("url"),
                "status": "completed",
                "scan_status": result.get("scan_status", "completed"),
                "scan_type": "crypto_audit",
                "requested_at": result.get("requested_at"),
                "completed_at": result.get("completed_at") or datetime.now().isoformat(),
                "execution_time_seconds": result.get("execution_time_seconds", 0),
                "pqc_overall_score": result.get("pqc_overall_score", 0),
                "pqc_overall_grade": result.get("pqc_overall_grade", "F"),
                "raw_response": result.get("raw_response", {}),
                "error_message": result.get("error_message"),
            }
            
            logger.info(f"💾 Saving result for {result.get('url')} to batch {batch_id}")
            
            response = await call_service(
                "POST",
                f"{self.db_service_url}/scans/result",
                json=db_data,
                timeout=30
            )
            
            # ✅ FIX: Check status BEFORE logging success
            if response.status_code in (200, 201):
                logger.info(f"✅ Result saved for {result.get('url')}")
                return True
            else:
                logger.error(f"❌ Failed to save result: {response.status_code}")
                try:
                    error_detail = response.json()
                    logger.error(f"❌ Error details: {error_detail}")
                except:
                    logger.error(f"❌ Response text: {response.text}")
                return False
                
        except Exception as e:
            logger.exception(f"❌ Exception saving result to DB: {e}")
            return False
    
    async def update_batch_status(self, batch_id: str, status: str, successful: int = 0, failed: int = 0) -> bool:
        """Update scan batch status."""
        await self._ensure_connected()
        
        if not self.enabled:
            logger.warning("Database disabled, skipping batch update")
            return False
        
        try:
            payload = {
                "status": status,
                "successful_count": successful,
                "failed_count": failed
            }
            
            logger.info(f"📝 Updating batch {batch_id}: {status} (success={successful}, failed={failed})")
            
            response = await call_service(
                "PUT",
                f"{self.db_service_url}/scans/batch/{batch_id}",
                json=payload,
                timeout=10
            )
            
            success = response.status_code == 200
            if success:
                logger.info(f"✅ Batch {batch_id} updated")
            else:
                logger.error(f"❌ Failed to update batch: {response.status_code}")
            return success
            
        except Exception as e:
            logger.exception("Exception updating batch status")
            return False

    async def get_scan_results(self, batch_id: Optional[str] = None, limit: int = 100, offset: int = 0):
        """Fetch scan results from database."""
        await self._ensure_connected()
        
        if not self.enabled:
            logger.warning("Database disabled, returning empty list")
            return []
        
        try:
            params = {"limit": limit, "offset": offset}
            if batch_id:
                params["batch_id"] = batch_id
            
            response = await call_service(
                "GET",
                f"{self.db_service_url}/scans/results",
                params=params,
                timeout=30
            )
            
            if response.status_code == 404:
                logger.warning("Results endpoint returned 404, returning empty list")
                return []
            
            return response.json()
        except Exception as e:
            logger.exception("Exception getting scan results")
            return []

    async def get_batch_info(self, batch_id: str):
        """Get information about a specific batch."""
        await self._ensure_connected()
        
        if not self.enabled:
            return {}
        
        try:
            response = await call_service(
                "GET",
                f"{self.db_service_url}/scans/batch/{batch_id}",
                timeout=10
            )
            
            if response.status_code == 404:
                return {}
            
            return response.json()
        except Exception as e:
            logger.exception("Exception getting batch info")
            return {}

    async def get_all_batches(self, limit: int = 50, offset: int = 0):
        """Get all scan batches."""
        await self._ensure_connected()
        
        if not self.enabled:
            logger.warning("Database disabled, returning empty list")
            return []
        
        try:
            response = await call_service(
                "GET",
                f"{self.db_service_url}/scans/batch",
                params={"limit": limit, "offset": offset},
                timeout=30
            )
            
            if response.status_code == 404:
                logger.warning("Batches endpoint not found, returning empty list")
                return []
            
            return response.json()
        except Exception as e:
            logger.exception("Exception getting all batches")
            return []

    async def search_scans(self, url: Optional[str] = None, status: Optional[str] = None, 
                          from_date: Optional[str] = None, to_date: Optional[str] = None, limit: int = 100):
        """Search scan results with filters."""
        await self._ensure_connected()
        
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
            
            response = await call_service(
                "GET",
                f"{self.db_service_url}/scans/search",
                params=params,
                timeout=30
            )
            
            if response.status_code == 404:
                return []
            
            return response.json()
        except Exception as e:
            logger.exception("Exception searching scans")
            return []
    
    async def save_failed_scan(self, domain: str, error_message: str, batch_id: str, request_id: str) -> bool:
        """Save a failed scan to database with proper structure."""
        await self._ensure_connected()
        
        if not self.enabled:
            logger.warning("Database disabled, skipping failed scan save")
            return False
        
        try:
            # Determine if this is HTTP-skipped or a real failure
            is_http_skipped = any(keyword in error_message.upper() for keyword in ["HTTP", "UNREACHABLE", "DNS_FAILED"])
            
            db_data = {
                "batch_id": batch_id,
                "request_id": request_id,
                "url": domain,
                "status": "completed",  # Use "completed" for consistency
                "scan_status": "http_skipped" if is_http_skipped else "failed",
                "scan_type": "crypto_audit",
                "requested_at": datetime.now().isoformat(),
                "completed_at": datetime.now().isoformat(),
                "execution_time_seconds": 0,
                "error_message": error_message,
                "pqc_overall_score": 0,
                "pqc_overall_grade": "F",
                "pqc_hybrid_ready": False,
                "raw_response": {
                    "domain": domain,
                    "scan_status": "http_skipped" if is_http_skipped else "failed",
                    "error_detail": error_message,
                    "scan_metadata": {
                        "attempt": 0,
                        "cached": False,
                        "timestamp": datetime.now().isoformat()
                    },
                    "tls_configuration": {
                        "supported_protocols": [],
                        "tls_1.2_cipher_suites": {"server_preference": "disabled", "suites": []},
                        "tls_1.3_cipher_suites": {"server_preference": "disabled", "suites": []},
                        "supported_elliptic_curves": {"server_preference": "disabled", "curves": []}
                    },
                    "certificate_chain": {
                        "leaf_certificate": {},
                        "intermediate_certificates": [],
                        "root_certificates": []
                    },
                    "signature_algorithms": {
                        "certificate_signatures": [],
                        "handshake_signatures": []
                    },
                    "pqc_analysis": {
                        "overall_score": 0,
                        "overall_grade": "F",
                        "security_level": "None",
                        "quantum_ready": False,
                        "hybrid_ready": False,
                        "components": {}
                    }
                }
            }
            
            response = await call_service(
                "POST",
                f"{self.db_service_url}/scans/result",
                json=db_data,
                timeout=30
            )
            
            return response.status_code in (200, 201)
        except Exception as e:
            logger.exception("Exception saving failed scan")
            return False

    async def delete_batch_from_db(self, batch_id: str) -> bool:
        """Delete a batch and its results from database."""
        await self._ensure_connected()
        
        if not self.enabled:
            return False
        
        try:
            response = await call_service(
                "DELETE",
                f"{self.db_service_url}/scans/batch/{batch_id}",
                timeout=30
            )
            
            return response.status_code in (200, 204)
        except Exception as e:
            logger.exception("Exception deleting batch")
            return False

    async def delete_result_from_db(self, result_id: int) -> bool:
        """Delete a single result from database."""
        await self._ensure_connected()
        
        if not self.enabled:
            return False
        
        try:
            response = await call_service(
                "DELETE",
                f"{self.db_service_url}/scans/result/{result_id}",
                timeout=30
            )
            
            return response.status_code in (200, 204)
        except Exception as e:
            logger.exception("Exception deleting result")
            return False

    async def clear_all_from_db(self) -> Dict[str, Any]:
        """Clear all data from database."""
        await self._ensure_connected()
        
        if not self.enabled:
            return {"error": "Database not enabled"}
        
        try:
            response = await call_service(
                "DELETE",
                f"{self.db_service_url}/scans/clear-all",
                timeout=60
            )
            
            return response.json()
        except Exception as e:
            logger.exception("Exception clearing all data")
            return {"error": str(e)}

