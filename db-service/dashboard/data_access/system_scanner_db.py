import os
import logging
import json
from typing import Dict, Any, List
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

log = logging.getLogger(__name__)

def fetch_system_metrics() -> Dict[str, Any]:
    """
    Fetches system agent audit results from system_scanner_db.
    Returns a dictionary where keys are hostnames/IPs and values are their metrics.
    """
    system_scanner_engine = create_engine(
        os.getenv("SYSTEM_SCANNER_DB_URL", "postgresql://scanuser:scanpass@postgres:5432/system_scanner_db"),
        pool_pre_ping=True
    )
    system_session = None
    system_metrics = {}
    
    try:
        system_session = sessionmaker(bind=system_scanner_engine)()
        
        system_query = text("""
            SELECT 
                a.agent_id,
                a.hostname,
                a.ip_address,
                r.audit_results::text AS audit_json,
                r.submitted_at
            FROM agents a
            LEFT JOIN results r ON a.agent_id = r.agent_id
            WHERE r.audit_results IS NOT NULL
            ORDER BY r.submitted_at DESC
        """)
        
        system_results = system_session.execute(system_query).fetchall()
        
        for row in system_results:
            try:
                audit_data = json.loads(row.audit_json) if row.audit_json else {}
                
                # Extract vulnerability indicators
                vulnerabilities = []
                
                # Check OpenSSL version
                openssl_version = audit_data.get('openssl_version', '')
                if openssl_version and openssl_version < '3.0':
                    vulnerabilities.append('outdated_openssl')
                
                # Check SSH config
                ssh_config = audit_data.get('ssh_config', {})
                if ssh_config:
                    # Check for weak ciphers
                    ciphers = ssh_config.get('ciphers', [])
                    weak_ciphers = ['3des', 'des', 'rc4', 'md5']
                    if any(weak in str(ciphers).lower() for weak in weak_ciphers):
                        vulnerabilities.append('weak_ssh_ciphers')
                
                # Check certificates
                certificates = audit_data.get('certificates', [])
                for cert in certificates:
                    if cert.get('expired'):
                        vulnerabilities.append('expired_certificate')
                    if cert.get('key_size', 0) < 2048:
                        vulnerabilities.append('weak_certificate_key')
                
                system_metrics[row.hostname or row.ip_address] = {
                    'agent_id': row.agent_id,
                    'vulnerabilities': vulnerabilities,
                    'vulnerability_count': len(vulnerabilities),
                    'audit_data': audit_data,
                    'last_scan': row.submitted_at
                }
                
            except json.JSONDecodeError:
                log.warning(f"Failed to parse audit_results for agent {row.agent_id}")
        
        log.info(f"✅ Fetched {len(system_metrics)} system agent metrics")
        log.info(f"🔍 Available agents in system_scanner_db: {list(system_metrics.keys())}")
        
    except Exception as e:
        log.error(f"❌ Error fetching system scanner data: {e}")
    finally:
        if system_session:
            system_session.close()
        system_scanner_engine.dispose()
            
    return system_metrics


def fetch_agent_status_by_ip() -> Dict[str, Dict[str, Any]]:
    """
    Fetches live agent status from system_scanner_db agents table.
    Returns dict keyed by ip_address with status info.
    Agent is 'active' if last_seen is within 5 minutes, otherwise 'offline'.
    Agents that never connected (last_seen IS NULL) are 'not_installed'.
    """
    system_scanner_engine = create_engine(
        os.getenv("SYSTEM_SCANNER_DB_URL", "postgresql://scanuser:scanpass@postgres:5432/system_scanner_db"),
        pool_pre_ping=True
    )
    session = None
    agent_map: Dict[str, Dict[str, Any]] = {}

    try:
        session = sessionmaker(bind=system_scanner_engine)()
        query = text("""
            SELECT
                agent_id, hostname, ip_address, os_info, last_seen,
                CASE
                    WHEN last_seen IS NULL THEN 'not_installed'
                    WHEN last_seen >= NOW() - INTERVAL '5 minutes' THEN 'active'
                    ELSE 'offline'
                END AS live_status
            FROM agents
            ORDER BY ip_address
        """)
        rows = session.execute(query).fetchall()
        for row in rows:
            ip = row.ip_address
            if ip:
                agent_map[ip] = {
                    "agent_id": row.agent_id,
                    "hostname": row.hostname,
                    "ip_address": ip,
                    "os_info": row.os_info,
                    "last_seen": str(row.last_seen) if row.last_seen else None,
                    "status": row.live_status,
                }
        log.info(f"✅ Fetched live agent status for {len(agent_map)} agents by IP")
    except Exception as e:
        log.error(f"❌ Error fetching agent status: {e}")
    finally:
        if session:
            session.close()
        system_scanner_engine.dispose()

    return agent_map
