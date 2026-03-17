// ============================================
// DASHBOARD-2 API TYPES (SINGLE SOURCE OF TRUTH)
// ============================================

// ===== ORGANIZATION LEVEL =====
export interface OrganizationSummary {
  total_vulnerabilities: number;
  pqc_readiness_percent: number;
  total_applications: number;
  secure_applications: number;
}

export interface OrganizationDashboard {
  organization_id: string;
  organization_name: string;
  summary: OrganizationSummary;
  risk_distribution: {
    Low: number;
    Medium: number;
    High: number;
    "Very High": number;
  };
  applications: ApplicationSummary[];
}

// ===== SUB-ORGANIZATION LEVEL =====
export interface SubOrgSummary {
  total_applications: number;
  pqc_readiness_percent: number;
  secure_applications: number;
  total_vulnerabilities: number;
}

export interface SubOrgDashboard {
  view: "suborganization";
  suborganization_id: string;
  suborganization_name: string;
  summary: SubOrgSummary;
  risk_distribution: {
    Low: number;
    Medium: number;
    High: number;
    "Very High": number;
    Unknown: number;
  };
  applications: ApplicationSummary[];
}

// ===== APPLICATION LEVEL =====
export interface ApplicationSummary {
  "Application ID": string;
  application: string;
  "Sub Org": string;
  "Sub Org ID": string;
  pqc_ready: number;
  vulnerabilities: number;
  risk_level: "Low" | "Medium" | "High" | "Very High";
  status?: string;
  scan_coverage?: {
    domains_total: number;
    domains_scanned: number;
    repos_total: number;
    repos_scanned: number;
    assets_total: number;
    assets_online: number;
  };
}

export interface ApplicationDetail {
  view: "application_detail";
  Organisation: string;
  "Org ID": string;
  "Sub Org": string;
  "Sub Org ID": string;
  "Org Target Migration Data": string;
  application: string;
  "Application ID": string;
  pqc_ready: number;
  risk_level: string;
  status: string;
  alg_changes: number;
  cert_changes: number;
  total_algorithms: number;
  total_certificates: number;
  total_pqc_vulnerable_algorithms: number;
  total_pqc_vulnerable_certificates: number;
  vulnerabilities: number;
  time_complexity: string;
  current_date: string;
  "App Category": string;
  algorithms_used: string[];
  repo_urls: string[];
  repo_names: string[];
  repo_count: number;
  server_hostnames: string[];
  server_count: number;
  active_agent_count: number;
}

// ===== VIEW MANAGEMENT =====
export type DashboardView = "organization" | "suborg" | "application";

export interface DashboardState {
  view: DashboardView;
  organizationId?: string;
  subOrgId?: string;
  applicationId?: string;
}