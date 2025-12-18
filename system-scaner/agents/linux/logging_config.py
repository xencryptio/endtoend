"""
Unified logging configuration for all services
"""
import logging
import sys
from datetime import datetime

def setup_logging(service_name: str, level: int = logging.INFO):
    """
    Setup unified logging format for all services
    
    Args:
        service_name: Name of the service (e.g., "SCAN-SERVICE", "DB-SERVICE")
        level: Logging level (default: INFO)
    """
    # Create formatter
    formatter = logging.Formatter(
        f'[{service_name}] [%(asctime)s] [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    
    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # Log initialization
    root_logger.info(f"{service_name} logging initialized at {logging.getLevelName(level)} level")
    
    return root_logger
