"""
Migration script: Move algorithm scores from hardcoded dicts to Elasticsearch.
Run this ONCE before starting the app with ES.
"""

import json
import os
from datetime import datetime
from elasticsearch import Elasticsearch

# Import the hardcoded tables
import sys
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)

sys.path.insert(0, os.path.join(project_root, 'repo_scanner'))
sys.path.insert(0, os.path.join(project_root, 'universal-scoring-service', 'core'))

from repo_scoring import REPO_ALGORITHM_SCORES
from algorithms import PQ_RESISTANCE_TABLE, PQC_ALGORITHMS, DEPRECATED_ALGORITHMS, HYBRID_ALGORITHMS

ES_HOST = "http://localhost:9201"
INDEX_NAME = "crypto-algorithm-scores"

def create_index(es_client):
    """Create the ES index with proper mappings."""
    
    mapping = {
        "mappings": {
            "properties": {
                "algorithm": {"type": "keyword"},
                "component_type": {"type": "keyword"},  # kex, signature, symmetric, hash, protocol, mode
                "base_score": {"type": "float"},
                "quantum_safe": {"type": "boolean"},
                "resistance": {"type": "keyword"},  # vulnerable, deprecated, grover_resistant, etc
                "category": {"type": "keyword"},
                "reason": {"type": "text", "analyzer": "standard"},
                "migration": {"type": "text", "analyzer": "standard"},
                "variants": {
                    "type": "nested",
                    "properties": {
                        "key": {"type": "keyword"},
                        "score": {"type": "float"},
                        "safe": {"type": "boolean"},
                        "reason": {"type": "text"}
                    }
                },
                "active": {"type": "boolean"},
                "created_at": {"type": "date"},
                "last_updated": {"type": "date"},
                "tags": {"type": "keyword"},  # for searching, e.g. "pqc", "nist", "hybrid"
            }
        },
        "settings": {
            "number_of_shards": 1,
            "number_of_replicas": 0
        }
    }
    
    if es_client.indices.exists(index=INDEX_NAME):
        print(f"Index {INDEX_NAME} already exists. Deleting and recreating...")
        es_client.indices.delete(index=INDEX_NAME)
    
    es_client.indices.create(index=INDEX_NAME, body=mapping)
    print(f"✓ Created index: {INDEX_NAME}")


def migrate_repo_algorithms(es_client):
    """Migrate REPO_ALGORITHM_SCORES from repo_scoring.py"""
    
    actions = []
    now = datetime.utcnow().isoformat() + "Z"
    
    for algo_name, algo_data in REPO_ALGORITHM_SCORES.items():
        doc = {
            "algorithm": algo_name,
            "component_type": algo_data.get("category", "unknown"),
            "base_score": algo_data.get("base_score", 0),
            "quantum_safe": algo_data.get("quantum_safe", False),
            "resistance": algo_data.get("resistance", "unknown"),
            "category": algo_data.get("category", "unknown"),
            "reason": algo_data.get("reason", ""),
            "migration": algo_data.get("migration", ""),
            "active": True,
            "created_at": now,
            "last_updated": now,
            "tags": [],
        }
        
        # Handle variants (e.g., AES-128, AES-256)
        if "variants" in algo_data:
            variants = []
            for variant_key, variant_data in algo_data["variants"].items():
                variants.append({
                    "key": variant_key,
                    "score": variant_data.get("score", 0),
                    "safe": variant_data.get("safe", False),
                    "reason": variant_data.get("reason", "")
                })
            doc["variants"] = variants
        
        # Add tags
        tags = []
        if algo_data.get("quantum_safe"):
            tags.append("quantum_safe")
        if algo_data.get("resistance") == "deprecated":
            tags.append("deprecated")
        doc["tags"] = tags
        
        actions.append({"index": {"_index": INDEX_NAME}})
        actions.append(doc)
    
    # Bulk insert
    if actions:
        es_client.bulk(body=actions)
        print(f"✓ Migrated {len(REPO_ALGORITHM_SCORES)} repo algorithms")


def migrate_tls_algorithms(es_client):
    """Migrate PQ_RESISTANCE_TABLE from universal-scoring-service/core/algorithms.py"""
    
    actions = []
    now = datetime.utcnow().isoformat() + "Z"
    
    component_info = {
        "kex": {"category": "key_exchange", "reason_prefix": "Key exchange algorithm"},
        "signature": {"category": "signature", "reason_prefix": "Signature algorithm"},
        "symmetric": {"category": "symmetric", "reason_prefix": "Symmetric cipher"},
        "hash": {"category": "hash", "reason_prefix": "Hash function"},
        "protocol": {"category": "protocol", "reason_prefix": "Protocol version"},
    }
    
    for component_type, algorithms in PQ_RESISTANCE_TABLE.items():
        info = component_info.get(component_type, {})
        
        for algo_name, base_score in algorithms.items():
            # Check if it's already in (from repo_scoring)
            existing = es_client.search(
                index=INDEX_NAME,
                query={"term": {"algorithm": algo_name.lower()}},
                size=1
            )
            
            if existing["hits"]["total"]["value"] > 0:
                # Already exists, skip to avoid duplicates
                continue
            
            # Determine quantum safety and resistance
            is_deprecated = algo_name in DEPRECATED_ALGORITHMS
            is_pqc = any(pqc in algo_name.upper() for pqc in PQC_ALGORITHMS)
            is_hybrid = any(hyb in algo_name.upper() for hyb in HYBRID_ALGORITHMS)
            
            quantum_safe = base_score >= 80 or is_pqc
            if is_deprecated:
                resistance = "deprecated"
            elif base_score < 20:
                resistance = "vulnerable"
            elif is_pqc or is_hybrid:
                resistance = "pqc_resistant"
            else:
                resistance = "classical"
            
            doc = {
                "algorithm": algo_name,
                "component_type": component_type,
                "base_score": float(base_score),
                "quantum_safe": quantum_safe,
                "resistance": resistance,
                "category": info.get("category", "unknown"),
                "reason": f"{info.get('reason_prefix', '')} — TLS score: {base_score}",
                "migration": "Review for TLS 1.3 + NIST PQC compatibility" if not quantum_safe else "Already modern",
                "active": True,
                "created_at": now,
                "last_updated": now,
                "tags": [],
            }
            
            # Add tags
            tags = []
            if quantum_safe:
                tags.append("quantum_safe")
            if is_pqc:
                tags.append("pqc_nist")
            if is_hybrid:
                tags.append("hybrid")
            if is_deprecated:
                tags.append("deprecated")
            doc["tags"] = tags
            
            actions.append({"index": {"_index": INDEX_NAME}})
            actions.append(doc)
    
    # Bulk insert
    if actions:
        es_client.bulk(body=actions)
        print(f"✓ Migrated {len(actions) // 2} TLS algorithms")


def main():
    """Run the migration."""
    
    try:
        print(f"Attempting to connect to Elasticsearch at {ES_HOST}...")
        es = Elasticsearch([ES_HOST])
        
        # Try a simple ping
        try:
            result = es.info()
            print(f"✓ Connected to Elasticsearch: {result['version']['number']}")
        except Exception as ping_err:
            print(f"Ping failed with error: {ping_err}")
            print("Trying to connect anyway...")
        
        # Check if indices API is working
        try:
            indices = es.indices.get_alias(index="*")
            print(f"✓ Found {len(indices)} existing indices")
        except Exception as idx_err:
            print(f"Cannot list indices: {idx_err}")
        
        # Step 1: Create index
        create_index(es)
        
        # Step 2: Migrate repo algorithms
        migrate_repo_algorithms(es)
        
        # Step 3: Migrate TLS algorithms
        migrate_tls_algorithms(es)
        
        # Verify
        count = es.count(index=INDEX_NAME)
        print(f"\n✓ Migration complete! Total algorithms in ES: {count['count']}")
        
        return True
    
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
