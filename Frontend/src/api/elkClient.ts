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
    scanned: number;
    cipher_suites: ElkTermBucket[];
    public_key_algorithms: ElkTermBucket[];
    issuers: ElkTermBucket[];
    tls_versions: ElkTermBucket[];
    supported_protocols: ElkTermBucket[];
    deprecated_protocols: ElkTermBucket[];
    key_sizes: ElkTermBucket[];
    signature_algorithms: ElkTermBucket[];
    hsts: ElkTermBucket[];
    ocsp_stapling: ElkTermBucket[];
    ct_present: ElkTermBucket[];
    ephemeral_key_exchange: ElkTermBucket[];
    quantum_ready: ElkTermBucket[];
    hybrid_ready: ElkTermBucket[];
    avg_score: number;
    avg_kex_pqc: number;
    top_algorithms_by_occurrence: ElkTermBucket[];
    category_composition: ElkTermBucket[];
    vulnerable_by_occurrence: ElkTermBucket[];
    pqc_by_occurrence: ElkTermBucket[];
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
    top_algorithms_by_occurrence: ElkTermBucket[];
    vulnerable_by_occurrence: ElkTermBucket[];
    category_composition: ElkTermBucket[];
    deprecated_usage: ElkTermBucket[];
    deprecated_total_occurrences: number;
  };
  endpoints: {
    fips: ElkTermBucket[];
    os: ElkTermBucket[];
    architectures: ElkTermBucket[];
    providers: ElkTermBucket[];
    installed_software: ElkTermBucket[];
    cipher_hash_algorithms: ElkTermBucket[];
    by_host: Array<{
      host: string;
      scans: number;
      avg_score: number;
      grade: string | null;
      os: string | null;
      fips: string | boolean | null;
      vulnerabilities: number;
      weak_ciphers: number;
      weak_providers: number;
    }>;
    top_algorithms_by_occurrence: ElkTermBucket[];
    category_composition: ElkTermBucket[];
    vulnerable_by_occurrence: ElkTermBucket[];
    deprecated_usage: ElkTermBucket[];
    deprecated_total_occurrences: number;
    total_certificate_stores: number;
    total_weak_providers: number;
    total_weak_ciphers: number;
    total_strong_ciphers: number;
    avg_score: number;
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

  // ----- Onboarding (ELK-direct) -----
  onboardingJSON: (payload: Record<string, any>) =>
    fetch(`${ELK_API_URL}/api/elk/onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as any).detail || `HTTP ${r.status}`);
      return j as ElkOnboardingResponse;
    }),
  onboardingCSV: (file: File, createdBy?: string, triggerScans = true) => {
    const fd = new FormData();
    fd.append("file", file);
    if (createdBy) fd.append("created_by", createdBy);
    fd.append("trigger_scans", String(triggerScans));
    return fetch(`${ELK_API_URL}/api/elk/onboarding/csv`, {
      method: "POST",
      body: fd,
    }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as any).detail || `HTTP ${r.status}`);
      return j as ElkOnboardingResponse;
    });
  },
  onboardingCSVTemplateURL: () => `${ELK_API_URL}/api/elk/onboarding/csv-template`,
  onboardingBatches: (size = 100) =>
    jsonGet<{ total: number; batches: ElkOnboardingBatch[] }>(
      `/api/elk/onboarding/batches?size=${size}`
    ),
  onboardingBatchDelete: (batchId: string) =>
    fetch(`${ELK_API_URL}/api/elk/onboarding/batches/${encodeURIComponent(batchId)}`, {
      method: "DELETE",
    }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
  onboardedOrganizations: (size = 200) =>
    jsonGet<{ total: number; organizations: ElkOnboardedOrg[] }>(
      `/api/elk/onboarding/organizations?size=${size}`
    ),
  onboardedOrganizationDetail: (orgId: string) =>
    jsonGet<ElkOnboardedOrgDetail>(
      `/api/elk/onboarding/organizations/${encodeURIComponent(orgId)}`
    ),
  onboardedOrganizationDelete: (orgId: string) =>
    fetch(
      `${ELK_API_URL}/api/elk/onboarding/organizations/${encodeURIComponent(orgId)}`,
      { method: "DELETE" }
    ).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),

  // ----- Applications (ELK-direct) -----
  applications: (size = 500) =>
    jsonGet<ElkApplicationsResponse>(`/api/elk/applications?size=${size}`),
  applicationDetail: (appId: string) =>
    jsonGet<ElkApplicationDetail>(
      `/api/elk/applications/${encodeURIComponent(appId)}`
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

// ----- Onboarding / Applications types ------------------------------------
export interface ElkOnboardingResponse {
  ok: boolean;
  org_id: string;
  batch_id: string;
  totals: {
    suborganizations: number;
    applications: number;
    repositories: number;
    domains: number;
    servers: number;
  };
  triggered: {
    repos_ok: number;
    repos_failed: number;
    domains_ok: number;
    domains_failed: number;
    details: {
      repos: Array<Record<string, any>>;
      domains: Array<Record<string, any>>;
    };
  };
}

export interface ElkOnboardingBatch {
  batch_id: string;
  org_id: string;
  organization_name: string;
  created_by?: string | null;
  submitted_at: string;
  source: "json" | "csv" | string;
  trigger_scans: boolean;
  totals: { repositories: number; domains: number; servers: number };
  triggered: {
    repos_ok: number;
    repos_failed: number;
    domains_ok: number;
    domains_failed: number;
  };
}

export interface ElkOnboardedOrg {
  org_id: string;
  organization_name: string;
  organization_email?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  totals: {
    suborganizations: number;
    applications: number;
    repositories: number;
    domains: number;
    servers: number;
  };
}

export interface ElkOnboardedOrgDetail extends ElkOnboardedOrg {
  suborganizations: Array<{
    suborg_id: string;
    suborganization_name: string;
    applications: Array<{
      app_id: string;
      application_name: string;
      repositories: Array<{ repo_url: string; repo_name?: string; branch_to_scan?: string; asset_id?: string }>;
      domains: Array<{ domain: string; asset_id?: string }>;
      servers: Array<{ hostname?: string; ip_address?: string; operating_system?: string }>;
    }>;
  }>;
}

export interface ElkScanSnippet {
  scan_id: string | null;
  scanned_at: string | null;
  overall_grade?: string | null;
  overall_score?: number | null;
  quantum_readiness_percentage?: number | null;
  quantum_ready?: boolean | null;
  vulnerabilities_count?: number | null;
  asset_type?: string | null;
}

export interface ElkAppView {
  app_id: string;
  application_name: string;
  repositories: {
    items: Array<{ repo_url: string; repo_name?: string; branch_to_scan?: string; asset_id?: string; scan_count: number; latest_scan: ElkScanSnippet | null }>;
    total: number;
    scanned: number;
    unscanned: number;
    quantum_ready: number;
    total_vulnerabilities: number;
    avg_readiness: number | null;
    avg_score: number | null;
  };
  domains: {
    items: Array<{ domain: string; asset_id?: string; scan_count: number; latest_scan: ElkScanSnippet | null }>;
    total: number;
    scanned: number;
    unscanned: number;
    quantum_ready: number;
    total_vulnerabilities: number;
    avg_readiness: number | null;
    avg_score: number | null;
  };
  servers: {
    items: Array<{ hostname?: string; ip_address?: string; operating_system?: string; latest_scan?: ElkScanSnippet | null }>;
    total: number;
    scanned: number;
    total_vulnerabilities: number;
  };
  stats: {
    resources_total: number;
    scanned: number;
    total_vulnerabilities: number;
    avg_readiness: number | null;
    quantum_ready_resources: number;
  };
}

export interface ElkSubOrgView {
  suborg_id: string;
  suborganization_name: string;
  applications: ElkAppView[];
  stats: {
    applications: number;
    resources_total: number;
    scanned: number;
    total_vulnerabilities: number;
    avg_readiness: number | null;
  };
}

export interface ElkOrgView {
  org_id: string;
  organization_name: string;
  organization_email?: string | null;
  created_by?: string | null;
  updated_at?: string | null;
  totals: any;
  suborganizations: ElkSubOrgView[];
  stats: {
    applications: number;
    scanned: number;
    total_vulnerabilities: number;
    avg_readiness: number | null;
  };
}

export interface ElkApplicationsResponse {
  summary: {
    organizations: number;
    applications: number;
    scanned_resources: number;
    total_vulnerabilities: number;
    avg_readiness: number | null;
  };
  organizations: ElkOrgView[];
}

export interface ElkApplicationDetail {
  organization: { org_id: string; organization_name: string };
  suborganization: { suborg_id: string; suborganization_name: string };
  application: ElkAppView;
}
