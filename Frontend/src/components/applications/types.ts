export interface CSVData {
  application: string;
  sub_org: string;
  risk_level: string;
  time_complexity: string;
  time_quarter: string;
  pqc_ready: number;
  vulnerabilities: number;
  algorithms_used: string;
  last_scan: string;
}

export interface SubOrg {
  name: string;
  total_apps: number;
  pqc_ready_percentage: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  pqc_status: string;
}

export interface FilterOption {
  category: "risk" | "quarter" | "timeComplexity";
  label: string;
  value: string;
}

export interface ValueBasedTag {
  tag: string;
  description: string;
}