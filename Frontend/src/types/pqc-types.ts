export interface AlgorithmScore {
    algorithm: string;
    algorithm_type: string;
    base_score: number;
    key_size: number;
    key_size_score: number;
    curve_strength: number;
    final_score: number;
    grade: string;
    is_pqc: boolean;
    is_hybrid: boolean;
    position: number;
    weighted_score: number;
    security_level: string;
    quantum_safe: boolean;
    deprecated: boolean;
    vulnerabilities: string[];
  }
  
  export interface ComponentAnalysis {
    component_type: string;
    algorithms: AlgorithmScore[];
    average_score: number;
    weighted_average: number;
    grade: string;
    weight_in_final: number;
    best_algorithm: string;
    worst_algorithm: string;
    pqc_percentage: number;
    hybrid_percentage: number;
    deprecated_count: number;
    quantum_safe_count: number;
    pfs_enabled: boolean;
  }
  
  export interface ProtocolAnalysis {
    supported_versions: string[];
    deprecated_versions: string[];
    version_scores: Record<string, number>;
    compression_enabled: boolean;
    renegotiation_secure: boolean;
    heartbeat_enabled: boolean;
    session_resumption: string;
    downgrade_protection: boolean;
  }
  
  export interface CertificateAnalysis {
    total_certificates: number;
    weak_signatures: number;
    strong_signatures: number;
    validity_period_days: number;
    cert_transparency: boolean;
    ocsp_stapling: boolean;
    key_pinning: boolean;
    chain_consistent: boolean;
    signature_algorithms: string[];
    hash_algorithms: string[];
  }
  
  export interface SecurityFeatures {
    hsts_enabled: boolean;
    hsts_max_age: number;
    pfs_supported: boolean;
    pfs_percentage: number;
    sni_supported: boolean;
    alpn_supported: string[];
    supported_extensions: string[];
  }
  
  export interface PQCScore {
    domain: string;
    timestamp: string;
    overall_score: number;
    overall_grade: string;
    security_level: string;
    components: Record<string, ComponentAnalysis>;
    individual_scores: AlgorithmScore[];
    protocol_analysis: ProtocolAnalysis;
    certificate_analysis: CertificateAnalysis;
    security_features: SecurityFeatures;
    quantum_ready: boolean;
    hybrid_ready: boolean;
    critical_vulnerabilities: string[];
    compliance_status: Record<string, boolean>;
    error?: string;
  }
  
  export interface Agent {
    agent_id: string;
    hostname: string;
    ip_address: string;
    os_info: string;
  }
  
  export interface AuditResult {
    result_id: string;
    agent_id: string;
    task_id: string;
    audit_results: {
      pqc_score?: PQCScore;
      [key: string]: any;
    };
    received_at: string;
    submitted_at: string;
  }
  