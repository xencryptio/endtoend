export interface RawApiData {
  Algorithm: string;
  Type: string;
  Strength?: string;
  "NIST Status"?: boolean;
  PQC: boolean;
  Usage?: number;
  "Implementation Complexity"?: string;
  Description?: string;
  "Quantum Vulnerability"?: string;
  "Recommended Replacement"?: string;
}

export interface UnifiedData {
  id: number;
  name: string;
  type: string;
  strength: number;
  nistStatus: 'Standardized' | 'Draft' | 'Deprecated';
  isPqc: boolean;
  usage: number;
  implementationComplexity: string;
  description: string;
  quantumVulnerability: string;
  recommendedReplacement: string;
  performanceImpact: number;
  adoptionRate: number;
  title: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  affectedSystems: string[];
  status: string;
  discoveredDate: string;
}

export interface Vulnerability {
  id: number;
  title: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  description: string;
  affectedSystems: string[];
  status: string;
  discoveredDate: string;
}

export interface AlgorithmData extends Omit<UnifiedData, 'severity' | 'affectedSystems' | 'status' | 'discoveredDate' | 'title'> {}

export interface SeverityCounts {
  Critical: number;
  High: number;
  Medium: number;
  Low: number;
}

export interface PQCStats {
  total: number;
  pqc: number;
  legacy: number;
  pqcPercentage: string | number;
}

export interface TypeDistribution {
  type: string;
  count: number;
}