// ============================================================================
// ELK API CLIENT
// ============================================================================
// Centralized client for the elk-query-api service.
// All ELK-backed pages should import from here.
// ============================================================================

export const ELK_API_URL =
  (import.meta as any).env?.VITE_ELK_QUERY_API_URL || "http://localhost:9101";

// ----- Types ---------------------------------------------------------------
export interface ElkScanDocument {
  scan_id: string;
  asset_id: string;
  asset_type: "domain" | "repo" | "asset";
  asset_label: string;
  organization_id?: string;
  scanned_at: string;
  ingested_at: string;
  quantum_ready: boolean;
  quantum_readiness_percentage: number;
  overall_grade?: string;
  overall_score?: number;
  vulnerabilities_count: number;
  // Type-specific
  url?: string;
  repo_url?: string;
  branch_name?: string;
  agent_id?: string;
  task_id?: string;
  os_info?: string;
  computer_name?: string;
  fips_mode_enabled?: boolean;
  quantum_safe_count?: number;
  quantum_vulnerable_count?: number;
  raw?: any;
}

export interface ElkDashboardResponse {
  summary: {
    total_assets: number;
    domains_count: number;
    repos_count: number;
    assets_count: number;
    quantum_ready_count: number;
    quantum_ready_domains: number;
    quantum_ready_repos: number;
    quantum_ready_assets: number;
    total_vulnerabilities: number;
    avg_quantum_readiness: number;
  };
  latest_scans: {
    domains: ElkScanDocument[];
    repos: ElkScanDocument[];
    assets: ElkScanDocument[];
  };
}

export interface ElkTimelinePoint {
  scanned_at: string;
  scan_id: string;
  overall_grade?: string;
  overall_score?: number;
  quantum_readiness_percentage?: number;
  quantum_ready?: boolean;
  vulnerabilities_count?: number;
}

export interface ElkAssetHistory {
  asset_id: string;
  scan_count: number;
  first_scan: string | null;
  latest_scan: string | null;
  timeline: ElkTimelinePoint[];
  full_history: ElkScanDocument[];
}

export interface ElkGlobalTimelinePoint {
  timestamp: string;
  scan_count: number;
  avg_readiness: number;
  total_vulnerabilities: number;
  by_type: { type: string; scan_count: number; avg_readiness: number }[];
}

// -- Analyst dashboard --
export interface ElkTermBucket {
  key: string | number | boolean;
  count: number;
}

export interface ElkAnalystDashboard {
  generated_at: string;
  interval: string;
  kpi: {
    total_scans: number;
    unique_assets: number;
    avg_score: number;
    avg_readiness: number;
    total_vulnerabilities: number;
    total_findings: number;
    quantum_ready_count: number;
  };
  by_asset_type: ElkTermBucket[];
  by_grade: ElkTermBucket[];
  score_by_type: Array<{
    type: string;
    scans: number;
    avg_score: number;
    avg_readiness: number;
    total_vulnerabilities: number;
  }>;
  qr_trend: Array<{
    timestamp: string;
    scans: number;
    avg_readiness: number;
    total_vulnerabilities: number;
    by_type: Array<{
      type: string;
      scans: number;
      avg_readiness: number;
      total_vulnerabilities: number;
    }>;
  }>;
  domains: {
    cipher_suites: ElkTermBucket[];
    public_key_algorithms: ElkTermBucket[];
    issuers: ElkTermBucket[];
    tls_versions: ElkTermBucket[];
    hsts: ElkTermBucket[];
    ocsp_stapling: ElkTermBucket[];
    ct_present: ElkTermBucket[];
    ephemeral_key_exchange: ElkTermBucket[];
  };
  repos: {
    vulnerable_algorithms: ElkTermBucket[];
    algorithm_names: ElkTermBucket[];
    platforms: ElkTermBucket[];
    findings_by_repo: Array<{
      repo: string;
      scans: number;
      findings: number;
      total_files: number;
      total_algorithms: number;
    }>;
    composition: {
      true_pqc: number;
      quantum_safe: number;
      quantum_vulnerable: number;
    };
  };
  endpoints: {
    fips: ElkTermBucket[];
    os: ElkTermBucket[];
    architectures: ElkTermBucket[];
    weak_providers_by_host: Array<{
      host: string;
      scans: number;
      weak_providers: number;
    }>;
    weak_ciphers_by_host: Array<{
      host: string;
      scans: number;
      weak_ciphers: number;
    }>;
    total_certificate_stores: number;
    total_weak_providers: number;
    total_weak_ciphers: number;
  };
  at_risk: Array<{
    label: string;
    type: string | null;
    grade: string | null;
    scans: number;
    avg_score: number;
    avg_readiness: number;
    total_vulnerabilities: number;
  }>;
}

// ----- Fetch helpers -------------------------------------------------------
async function jsonGet<T>(path: string): Promise<T> {
  const r = await fetch(`${ELK_API_URL}${path}`);
  if (!r.ok) {
    throw new Error(`ELK API ${path} -> ${r.status} ${r.statusText}`);
  }
  return r.json();
}

export const elkApi = {
  health: () => jsonGet<{ status: string; elasticsearch: boolean }>("/health"),
  stats: () =>
    jsonGet<{ domain: number; repo: number; asset: number; total: number }>(
      "/api/elk/stats"
    ),
  dashboard: () => jsonGet<ElkDashboardResponse>("/api/elk/dashboard"),
  latestResults: (type: "domain" | "repo" | "asset" | "all" = "all", size = 100) =>
    jsonGet<{ type: string; count: number; results: ElkScanDocument[] }>(
      `/api/elk/results?type=${type}&size=${size}`
    ),
  allResults: (
    type: "domain" | "repo" | "asset" | "all" = "all",
    size = 200,
    assetId?: string
  ) =>
    jsonGet<{
      type: string;
      total: number;
      count: number;
      results: ElkScanDocument[];
    }>(
      `/api/elk/results/all?type=${type}&size=${size}${
        assetId ? `&asset_id=${encodeURIComponent(assetId)}` : ""
      }`
    ),
  assetHistory: (assetId: string, size = 100) =>
    jsonGet<ElkAssetHistory>(
      `/api/elk/history/${encodeURIComponent(assetId)}?size=${size}`
    ),
  globalTimeline: (interval: "hour" | "day" | "week" | "month" = "day") =>
    jsonGet<{ interval: string; timeline: ElkGlobalTimelinePoint[] }>(
      `/api/elk/timeline?interval=${interval}`
    ),
  scanList: (
    type: "domain" | "repo" | "asset" | "all" = "all",
    page = 1,
    pageSize = 25
  ) =>
    jsonGet<{
      page: number;
      page_size: number;
      total: number;
      scans: ElkScanDocument[];
    }>(`/api/elk/scans?type=${type}&page=${page}&page_size=${pageSize}`),
  analyst: (interval: "hour" | "day" | "week" | "month" = "day") =>
    jsonGet<ElkAnalystDashboard>(`/api/elk/analyst?interval=${interval}`),
  vulnerabilities: (
    threshold = 70,
    type: "domain" | "repo" | "asset" | "all" = "all",
    size = 500
  ) =>
    jsonGet<ElkVulnerabilitiesResponse>(
      `/api/elk/vulnerabilities?threshold=${threshold}&type=${type}&size=${size}`
    ),
};

// ----- Vulnerabilities types ------------------------------------------------
export interface ElkVulnFinding {
  algorithm: string;
  score: number;
  quantum_safe: boolean;
  component_type?: string | null;
  resistance?: string | null;
  reason?: string | null;
  migration?: string | null;
  source_type: "domain" | "repo" | "asset" | string;
  asset_id: string;
  asset_label: string;
  scan_id: string;
  scanned_at: string;
  role: string;
  evidence: Record<string, any>;
}

export interface ElkVulnHistogramEntry {
  algorithm: string;
  score: number;
  quantum_safe: boolean;
  component_type?: string | null;
  occurrences: number;
  assets_affected: number;
  by_type: { domain: number; repo: number; asset: number };
}

export interface ElkVulnerabilitiesResponse {
  threshold: number;
  type: string;
  summary: {
    total_assets_scanned: number;
    assets_with_vulnerabilities: number;
    assets_with_vulnerabilities_pct: number;
    unique_algorithms_found: number;
    algorithms_below_threshold: number;
    algorithms_below_threshold_pct: number;
    total_findings: number;
  };
  histogram: ElkVulnHistogramEntry[];
  findings: ElkVulnFinding[];
}

// ----- Display helpers -----------------------------------------------------
export const gradeColor = (grade?: string) => {
  if (!grade) return "text-muted-foreground";
  if (grade.startsWith("A")) return "text-emerald-600";
  if (grade.startsWith("B")) return "text-blue-600";
  if (grade.startsWith("C")) return "text-amber-600";
  if (grade.startsWith("D")) return "text-orange-600";
  return "text-red-600";
};

export const readinessColor = (pct?: number) => {
  if (pct === undefined || pct === null) return "bg-muted";
  if (pct >= 80) return "bg-gradient-to-r from-emerald-400 to-emerald-600";
  if (pct >= 60) return "bg-gradient-to-r from-blue-400 to-blue-600";
  if (pct >= 40) return "bg-gradient-to-r from-amber-400 to-amber-600";
  return "bg-gradient-to-r from-red-400 to-red-600";
};

export const formatDateTime = (iso?: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};
