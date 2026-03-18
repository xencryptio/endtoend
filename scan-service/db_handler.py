import httpx
import logging
from typing import Dict, Any, Optional
from datetime import datetime
from http_client import call_service

logger = logging.getLogger(__name__)

class DatabaseHandler:
    """
    Database handler for scan-service.
    Now uses single-scan architecture (no batches).
    Each URL is an independent scan result.
    """
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
    
    async def save_scan_result(self, result: Dict[str, Any]) -> bool:
        """Save a single scan result to database (no batch required)."""
        await self._ensure_connected()
        
        if not self.enabled:
            logger.warning(f"⚠️  Database disabled, skipping result save for {result.get('url')}")
            return False
        
        try:
            db_data = {
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
            
            logger.info(f"💾 Saving scan result for {result.get('url')}")
            
            response = await call_service(
                "POST",
                f"{self.db_service_url}/scans/result",
                json=db_data,
                timeout=30
            )
            
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

    async def get_scan_results(self, status: Optional[str] = None, limit: int = 100, offset: int = 0):
        """Fetch scan results from database."""
        await self._ensure_connected()
        
        if not self.enabled:
            logger.warning("Database disabled, returning empty list")
            return []
        
        try:
            params = {"limit": limit, "skip": offset}
            if status:
                params["status"] = status
            
            response = await call_service(
                "GET",
                f"{self.db_service_url}/scans",
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

    async def get_scan_by_url(self, url: str):
        """Get scan result for a specific URL."""
        await self._ensure_connected()
        
        if not self.enabled:
            return None
        
        try:
            response = await call_service(
                "GET",
                f"{self.db_service_url}/scans/url/{url}",
                timeout=10
            )
            
            if response.status_code == 404:
                return None
            
            return response.json()
        except Exception as e:
            logger.exception("Exception getting scan by URL")
            return None

    async def get_scan_by_id(self, result_id: int):
        """Get a specific scan result by ID."""
        await self._ensure_connected()
        
        if not self.enabled:
            return None
        
        try:
            response = await call_service(
                "GET",
                f"{self.db_service_url}/scans/result/{result_id}",
                timeout=10
            )
            
            if response.status_code == 404:
                return None
            
            return response.json()
        except Exception as e:
            logger.exception("Exception getting scan by ID")
            return None

    async def search_scans(self, pqc_grade: Optional[str] = None, 
                          quantum_ready: Optional[bool] = None,
                          tls_version: Optional[str] = None,
                          status: Optional[str] = None, 
                          limit: int = 100):
        """Search scan results with filters using normalized fields."""
        await self._ensure_connected()
        
        if not self.enabled:
            return []
        
        try:
            params = {"limit": limit}
            if pqc_grade:
                params["pqc_grade"] = pqc_grade
            if quantum_ready is not None:
                params["quantum_ready"] = quantum_ready
            if tls_version:
                params["tls_version"] = tls_version
            if status:
                params["status"] = status
            
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
    
    async def save_failed_scan(self, domain: str, error_message: str, request_id: str) -> bool:
        """Save a failed scan to database with proper structure."""
        await self._ensure_connected()
        
        if not self.enabled:
            logger.warning("Database disabled, skipping failed scan save")
            return False
        
        try:
            # Determine if this is HTTP-skipped or a real failure
            is_http_skipped = any(keyword in error_message.upper() for keyword in ["HTTP", "UNREACHABLE", "DNS_FAILED"])
            
            db_data = {
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

    async def get_statistics(self) -> Dict[str, Any]:
        """Get scan statistics from database."""
        await self._ensure_connected()
        
        if not self.enabled:
            return {"error": "Database not enabled"}
        
        try:
            response = await call_service(
                "GET",
                f"{self.db_service_url}/scans/statistics",
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json()
            return {}
        except Exception as e:
            logger.exception("Exception getting statistics")
            return {"error": str(e)}

