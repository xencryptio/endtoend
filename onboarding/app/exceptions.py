from fastapi import HTTPException
from datetime import datetime
from typing import Optional, Dict, Any

class APIError(HTTPException):
    """Standardized API error response"""
    
    def __init__(
        self,
        status_code: int,
        error_code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ):
        detail = {
            "error": error_code,
            "message": message,
            "timestamp": datetime.now().isoformat()
        }
        
        if details:
            detail["details"] = details
        
        super().__init__(status_code=status_code, detail=detail)