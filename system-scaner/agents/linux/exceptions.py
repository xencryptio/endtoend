"""
Custom exception classes for API errors
"""

from typing import Dict, Any, Optional

class APIError(Exception):
    """Custom exception for API errors with structured details."""

    def __init__(self, status_code: int, error_code: str, message: str, details: Optional[Dict[str, Any]] = None):
        """
        Initialize the APIError.

        Args:
            status_code (int): The HTTP status code associated with the error.
            error_code (str): A unique code identifying the type of error (e.g., "invalid_input", "not_found").
            message (str): A human-readable error message.
            details (Optional[Dict[str, Any]]): Optional dictionary for additional error details.
        """
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.details = details

    def to_dict(self) -> Dict[str, Any]:
        """Convert the exception instance to a dictionary."""
        return {
            "status_code": self.status_code,
            "error_code": self.error_code,
            "message": self.message,
            "details": self.details
        }

    def __str__(self) -> str:
        """Return a string representation of the error."""
        if self.details:
            return f"APIError: {self.status_code} - {self.error_code} - {self.message} (Details: {self.details})"
        return f"APIError: {self.status_code} - {self.error_code} - {self.message}"
