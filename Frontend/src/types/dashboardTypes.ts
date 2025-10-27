// types/dashboardTypes.ts
export interface CSVData {
  application: string;
  pqc_ready: number;
  vulnerabilities: number;
  risk_level: "Low" | "Medium" | "High" | "Very High";
  status: string;
  alg_changes: number;
  cert_changes: number;
  total_pqc_vulnerable_certificates: number;
  total_pqc_vulnerable_algorithms: number;
  "Sub Org": string;
}

export interface GroupedData {
  subOrg: string;
  avgPqcReady: number;
  avgVulnerabilities: number;
  mostCommonStatus: string;
  riskDistribution: Record<string, number>;
  apps: CSVData[];
}
