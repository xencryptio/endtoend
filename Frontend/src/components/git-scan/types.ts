export interface Algorithm {
    name: string;
    category: string;
    algorithm_type: string; // kex, signature, symmetric, hash
    is_pqc: boolean; // True ONLY for actual PQC algorithms
    occurrences: number;          // real (non-commented) occurrences
    commented_occurrences?: number; // occurrences found inside comments / docstrings
    files_affected: number;
    base_score: number;
    final_score: number;
    grade: string;
    deprecated: boolean;
    security_level: string;
    quantum_safe: boolean; // ✅ PRIMARY field: Actually quantum-safe?
    quantum_safety_reason: string; // ✅ NEW: Explanation
    quantum_resistance_type: string; // ✅ NEW: Classification
    weighted_score: number;
  }
  
  export interface CategoryScore {
    score: number; // Average score for this category
    grade: string; // Letter grade for category
    algorithm_count: number; // How many algorithms in this category
    best_algorithm: string; // Name of best performing algorithm
    worst_algorithm: string; // Name of worst performing algorithm
  }
  
  export interface MigrationStep {
    step: number;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ONGOING';
    title: string;
    summary: string;
    detail: string;
    affected_files: number;
    occurrences: number;
    replacement: string;
    effort: string;
    impact: string;
    nist_ref: string;
    code_example?: string;
  }
  
  export interface MigrationPlan {
    steps: MigrationStep[];
    total_steps: number;
    critical_count: number;
    high_count: number;
    urgent_count: number;
    estimated_effort: string;
  }
  
  export interface QuantumReadinessDetail {
    quantum_readiness_percentage: number;
    risk_level: 'critical' | 'high' | 'medium' | 'low';
    risk_reason: string;
    migration_status: 'complete' | 'in_progress' | 'not_started' | 'not_applicable';
    migration_note: string;
    pqc_algorithms: string[];
    vulnerable_algorithms: string[];
    deprecated_algorithms: string[];
    grover_safe_algorithms: string[];
    total_crypto_operations: number;
    quantum_safe_operations: number;
  }

  export interface ScanDetail {
    repo_id: number;
    repo_url: string;
    platform: string;
    branch_name: string;
    repo_hash: string;
    last_scanned: string;
    total_files: number;
    algorithms: Record<string, Algorithm>;
    quantum_safe_count: number;
    quantum_vulnerable_count: number;
    true_pqc_count: number;
    overall_security_score: number;
    overall_grade: string;
    quantum_readiness_percentage: number;
    category_scores: Record<string, CategoryScore>;
    migration_plan?: MigrationPlan;
    quantum_readiness_detail?: QuantumReadinessDetail;
    critical_vulnerabilities?: string[];
  }
  
  export interface Scan {
    id: number;
    repo_url: string;
    repo_name?: string;  // Optional display name (derived from repo_url if not set)
    repo_hash: string;
    branch_name: string;
    platform: string;
    scan_status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cached';
    last_scanned: string;
    total_files: number;
    total_files_to_scan: number;
    quantum_safe_count: number; // ✅ RENAMED
    quantum_vulnerable_count: number; // ✅ RENAMED
    overall_security_score: number; // Security score 0-100
    overall_grade: string; // Letter grade A-F
    quantum_readiness_percentage: number; // Quantum readiness 0-100
    current_status: string;
  }
  
  export type StatusType = 'error' | 'success' | 'info';

// --- Types for Algorithm Findings Modal ---

export interface FindingDetail {
  line_number: number;
  code_snippet: string;
  match_text: string;
}

export interface FileFinding {
  file_path: string;
  occurrence_count: number;
  directory: string;
  findings: FindingDetail[];
  has_more: boolean;
  showing: number;
}

export interface AlgorithmFindingsResponse {
  algorithm: string;
  total_occurrences: number;
  total_files: number;
  files: FileFinding[];
  directory_summary: Record<string, number>;
}