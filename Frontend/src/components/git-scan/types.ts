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
  
  export interface ScanDetail {
    repo_id: number;
    repo_url: string;
    platform: string;
    branch_name: string;
    repo_hash: string;
    last_scanned: string;
    total_files: number;
    algorithms: Record<string, Algorithm>;
    quantum_safe_count: number; // ✅ RENAMED: Actually quantum-safe
    quantum_vulnerable_count: number; // ✅ RENAMED: Actually vulnerable
    true_pqc_count: number; // Count of actual PQC algorithms
    overall_security_score: number;
    overall_grade: string;
    quantum_readiness_percentage: number; // Based on occurrences, not types
    category_scores: Record<string, CategoryScore>;
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