"""
Algorithm Score Loader from Elasticsearch
Provides a cached, in-memory lookup table for algorithm scores loaded from ES.
"""

import os
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Try to import elasticsearch, but make it optional
try:
    from elasticsearch import Elasticsearch
    HAS_ELASTICSEARCH = True
except ImportError:
    HAS_ELASTICSEARCH = False
    logger.warning("Elasticsearch client not available - will fall back to hardcoded scores")


class AlgorithmScoreLoader:
    """
    Loads algorithm scores from Elasticsearch and caches them in memory.
    Falls back to hardcoded scores if ES is unavailable.
    """
    
    def __init__(self, es_url: Optional[str] = None, fallback_dict: Optional[Dict] = None):
        """
        Initialize the loader.
        
        Args:
            es_url: Elasticsearch URL (default: from ELASTICSEARCH_URL env var)
            fallback_dict: Dictionary to use if ES fails (default: None)
        """
        self.es_url = es_url or os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
        self.fallback_dict = fallback_dict or {}
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.last_loaded = None
        self.es_client = None
        
        # Try to connect to ES
        if HAS_ELASTICSEARCH:
            try:
                self.es_client = Elasticsearch([self.es_url], request_timeout=5)
                self._load_from_es()
            except Exception as e:
                logger.warning(f"Failed to connect to Elasticsearch at {self.es_url}: {e}")
                logger.warning("Using fallback algorithm scores")
                self.cache = self.fallback_dict.copy()
        else:
            self.cache = self.fallback_dict.copy()
    
    def _load_from_es(self) -> None:
        """Load all active algorithms from Elasticsearch."""
        if not self.es_client:
            return
        
        try:
            result = self.es_client.search(
                index="crypto-algorithm-scores",
                query={"term": {"active": True}},
                size=10000,
                timeout="5s"
            )
            
            self.cache = {}
            for hit in result.get("hits", {}).get("hits", []):
                source = hit["_source"]
                algo_name = source.get("algorithm", "").upper()
                
                if algo_name:
                    self.cache[algo_name] = {
                        "base_score": source.get("base_score", 0),
                        "quantum_safe": source.get("quantum_safe", False),
                        "resistance": source.get("resistance", "unknown"),
                        "category": source.get("category", "unknown"),
                        "reason": source.get("reason", ""),
                        "migration": source.get("migration", ""),
                        "variants": source.get("variants", {}),
                        "component_type": source.get("component_type", "unknown"),
                        "tags": source.get("tags", []),
                    }
            
            self.last_loaded = datetime.now(timezone.utc)
            logger.info(f"Loaded {len(self.cache)} algorithm scores from Elasticsearch")
        
        except Exception as e:
            logger.error(f"Failed to load algorithms from ES: {e}")
            if self.fallback_dict:
                self.cache = self.fallback_dict.copy()
                logger.warning("Falling back to hardcoded algorithm scores")
    
    def reload(self) -> bool:
        """
        Reload algorithms from Elasticsearch.
        
        Returns:
            True if reload was successful, False otherwise
        """
        try:
            self._load_from_es()
            return True
        except Exception as e:
            logger.error(f"Failed to reload algorithms: {e}")
            return False
    
    def get(self, algo_name: str, default: Optional[Dict] = None) -> Optional[Dict]:
        """
        Get algorithm score by name.
        
        Args:
            algo_name: Algorithm name (case-insensitive)
            default: Default value if not found
        
        Returns:
            Algorithm data dict or default
        """
        algo_upper = algo_name.upper()
        return self.cache.get(algo_upper, default)
    
    def get_base_score(self, algo_name: str, default: float = 0) -> float:
        """Get base score for an algorithm (0-100)."""
        algo = self.get(algo_name)
        return algo.get("base_score", default) if algo else default
    
    def get_quantum_safe(self, algo_name: str, default: bool = False) -> bool:
        """Get quantum safety flag for an algorithm."""
        algo = self.get(algo_name)
        return algo.get("quantum_safe", default) if algo else default
    
    def is_deprecated(self, algo_name: str) -> bool:
        """Check if algorithm is deprecated."""
        algo = self.get(algo_name)
        return algo.get("resistance") == "deprecated" if algo else False
    
    def get_all_names(self) -> list:
        """Get all cached algorithm names."""
        return list(self.cache.keys())
    
    def __len__(self) -> int:
        """Return number of cached algorithms."""
        return len(self.cache)
