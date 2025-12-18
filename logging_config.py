import logging
import sys

def setup_logging(service_name: str, level=logging.INFO):
    """
    Unified logging setup for all services
    """
    logging.basicConfig(
        level=level,
        format=f'[{service_name}] [%(asctime)s] [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        handlers=[
            logging.StreamHandler(sys.stdout)
        ],
        force=True
    )