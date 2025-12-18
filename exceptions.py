from fastapi import HTTPException

class APIError(HTTPException):
    """
    Standardized API error with structured details
    """
    def __init__(self, status_code: int, error_code: str, message: str, details=None):
        self.error_code = error_code
        self.details = details
        super().__init__(status_code=status_code, detail={
            "error": error_code,
            "message": message,
            "details": details
        })