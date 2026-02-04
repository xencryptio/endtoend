"""
Progress tracking for TLS scans.
Tracks phases, calculates ETA, manages retry history.
All in-memory - no database changes.
"""

from typing import Dict, List, Optional
from datetime import datetime
from collections import deque
import time


class PhaseTimer:
    """Timer for tracking individual scan phases"""
    
    def __init__(self):
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None
        
    def start(self):
        self.start_time = time.time()
        
    def stop(self) -> float:
        self.end_time = time.time()
        return self.duration()
        
    def duration(self) -> float:
        if self.start_time and self.end_time:
            return round(self.end_time - self.start_time, 2)
        return 0.0


class DomainProgress:
    """Track progress for a single domain"""
    
    def __init__(self, domain: str):
        self.domain = domain
        self.phases: Dict[str, PhaseTimer] = {}
        self.current_phase: Optional[str] = None
        self.status: str = "pending"  # pending, processing, completed, failed
        self.error: Optional[str] = None
        self.total_duration: float = 0.0
        self.start_time: float = time.time()
        
    def start_phase(self, phase: str):
        """Start tracking a phase"""
        self.current_phase = phase
        if phase not in self.phases:
            self.phases[phase] = PhaseTimer()
        self.phases[phase].start()
        
    def complete_phase(self, phase: str) -> float:
        """Complete a phase and return duration"""
        if phase in self.phases:
            duration = self.phases[phase].stop()
            if phase == self.current_phase:
                self.current_phase = None
            return duration
        return 0.0
        
    def mark_completed(self):
        """Mark domain scan as completed"""
        self.status = "completed"
        self.total_duration = round(time.time() - self.start_time, 2)
        
    def mark_failed(self, error: str):
        """Mark domain scan as failed"""
        self.status = "failed"
        self.error = error
        self.total_duration = round(time.time() - self.start_time, 2)
        
    def get_phase_breakdown(self) -> Dict[str, float]:
        """Get all phase durations"""
        return {
            phase: timer.duration() 
            for phase, timer in self.phases.items()
        }


class ScanProgressTracker:
    """
    Main progress tracker for batch scans.
    Tracks all domains, calculates ETA, manages retry history.
    """
    
    # Define standard phases
    PHASES = [
        "protocol_check",      # Check if HTTP/HTTPS
        "dns_lookup",          # Resolve domain
        "tls_handshake",       # Initial TLS connection
        "protocol_probe",      # Test TLS 1.2, 1.3
        "cipher_enumeration",  # Enumerate cipher suites
        "curve_probe",         # Test elliptic curves
        "cert_parsing",        # Parse certificates
        "scoring",             # PQC scoring
        "formatting"           # Format for frontend
    ]
    
    def __init__(self, total_domains: int, batch_id: str):
        self.total_domains = total_domains
        self.batch_id = batch_id
        self.domains: Dict[str, DomainProgress] = {}
        
        # Completion tracking
        self.completed_count = 0
        self.failed_count = 0
        
        # ETA calculation (keep last 10 domain times)
        self.completion_times = deque(maxlen=10)
        
        # Retry tracking
        self.retry_history: Dict[str, List[Dict]] = {}
        
        # Overall timing
        self.batch_start_time = time.time()
        
    def register_domain(self, domain: str):
        """Register a domain for tracking"""
        if domain not in self.domains:
            self.domains[domain] = DomainProgress(domain)
            
    def start_phase(self, domain: str, phase: str) -> Dict:
        """
        Start a phase for a domain.
        Returns SSE event data.
        """
        if domain not in self.domains:
            self.register_domain(domain)
            
        self.domains[domain].start_phase(phase)
        
        return {
            "type": "domain_phase",
            "domain": domain,
            "phase": phase,
            "status": "started",
            "timestamp": datetime.now().isoformat()
        }
        
    def complete_phase(self, domain: str, phase: str) -> Dict:
        """
        Complete a phase for a domain.
        Returns SSE event data.
        """
        duration = 0.0
        if domain in self.domains:
            duration = self.domains[domain].complete_phase(phase)
            
        return {
            "type": "domain_phase",
            "domain": domain,
            "phase": phase,
            "status": "completed",
            "duration": duration,
            "timestamp": datetime.now().isoformat()
        }
        
    def mark_domain_completed(self, domain: str):
        """Mark domain as successfully completed"""
        if domain in self.domains:
            self.domains[domain].mark_completed()
            self.completed_count += 1
            self.completion_times.append(self.domains[domain].total_duration)
            
    def mark_domain_failed(self, domain: str, error: str, round_num: int):
        """Mark domain as failed"""
        if domain in self.domains:
            self.domains[domain].mark_failed(error)
            self.failed_count += 1
            
        # Add to retry history
        if domain not in self.retry_history:
            self.retry_history[domain] = []
            
        self.retry_history[domain].append({
            "round": round_num,
            "error": error,
            "timestamp": datetime.now().isoformat()
        })
        
    def calculate_eta(self) -> Optional[float]:
        """
        Calculate estimated time remaining.
        Returns seconds, or None if not enough data.
        """
        if len(self.completion_times) < 3:
            return None  # Need at least 3 samples
            
        avg_time = sum(self.completion_times) / len(self.completion_times)
        remaining = self.total_domains - self.completed_count - self.failed_count
        
        return round(avg_time * remaining, 1)
        
    def get_progress_snapshot(self) -> Dict:
        """Get current progress state with ACCURATE phase-based calculation."""
        
        # Calculate completion percentage based on phases
        total_phases = len(self.PHASES)
        total_possible_progress = self.total_domains * total_phases
        
        completed_progress = 0
        for domain_progress in self.domains.values():
            if domain_progress.status == "completed":
                completed_progress += total_phases
            elif domain_progress.status == "failed":
                completed_progress += len(domain_progress.phases)
            else:
                # In progress - count completed phases
                completed_progress += len(domain_progress.phases)
        
        percentage = round((completed_progress / total_possible_progress) * 100, 2) if total_possible_progress > 0 else 0
        
        # ... rest of existing code ...
        eta = self.calculate_eta()
        elapsed = round(time.time() - self.batch_start_time, 2)
        
        # Calculate average time per domain
        avg_time = None
        if self.completion_times:
            avg_time = round(sum(self.completion_times) / len(self.completion_times), 2)
        
        return {
            "type": "progress_snapshot",
            "batch_id": self.batch_id,
            "total": self.total_domains,
            "completed": self.completed_count,
            "failed": self.failed_count,
            "remaining": self.total_domains - self.completed_count - self.failed_count,
            "percentage": percentage,  # ✅ NOW ACCURATE
            "eta_seconds": eta,
            "avg_time_per_domain": avg_time,
            "elapsed_seconds": elapsed,
            "timestamp": datetime.now().isoformat()
        }
        
    def get_domain_status(self, domain: str) -> Optional[Dict]:
        """Get current status of a specific domain"""
        if domain not in self.domains:
            return None
            
        dom = self.domains[domain]
        return {
            "domain": domain,
            "status": dom.status,
            "current_phase": dom.current_phase,
            "completed_phases": list(dom.phases.keys()),
            "phase_breakdown": dom.get_phase_breakdown(),
            "total_duration": dom.total_duration,
            "error": dom.error
        }
        
    def get_retry_history(self, domain: str) -> List[Dict]:
        """Get retry history for a domain"""
        return self.retry_history.get(domain, [])
        
    def get_final_summary(self) -> Dict:
        """
        Get final summary when all scans complete.
        Includes detailed breakdowns.
        """
        total_elapsed = round(time.time() - self.batch_start_time, 2)
        
        # Calculate average phase times across all successful domains
        phase_averages = {}
        for phase in self.PHASES:
            times = []
            for domain_progress in self.domains.values():
                if domain_progress.status == "completed" and phase in domain_progress.phases:
                    times.append(domain_progress.phases[phase].duration())
            
            if times:
                phase_averages[phase] = round(sum(times) / len(times), 2)
        
        return {
            "type": "progress_summary",
            "batch_id": self.batch_id,
            "total_domains": self.total_domains,
            "completed": self.completed_count,
            "failed": self.failed_count,
            "total_elapsed_seconds": total_elapsed,
            "average_phase_times": phase_averages,
            "retry_summary": {
                domain: len(history) 
                for domain, history in self.retry_history.items()
            },
            "timestamp": datetime.now().isoformat()
        }