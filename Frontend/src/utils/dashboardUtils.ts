// ============================================
// DASHBOARD-2 UTILITY FUNCTIONS
// NO UI LOGIC, NO JSX, PURE FUNCTIONS ONLY
// ============================================

import { ApplicationSummary } from "@/types/dashboardTypes";

type GenericApplication = Record<string, unknown>;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function toSafeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getApplicationIdentityKey(app: GenericApplication): string {
  const appId = normalizeText(app["Application ID"]);
  if (appId) return `id:${appId}`;

  const appName = normalizeText(app.application);
  const subOrg = normalizeText(app["Sub Org"] ?? app["Sub_Org"] ?? app.sub_org);
  if (appName || subOrg) return `name:${appName}|suborg:${subOrg}`;

  return "";
}

export function dedupeApplications<T extends GenericApplication>(apps: T[]): T[] {
  const deduped = new Map<string, T>();

  apps.forEach((app, index) => {
    const key = getApplicationIdentityKey(app) || `index:${index}`;
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, app);
      return;
    }

    const existingCoverage = existing["scan_coverage"] ? 1 : 0;
    const currentCoverage = app["scan_coverage"] ? 1 : 0;
    const existingSignal = toSafeNumber(existing["pqc_ready"]) + toSafeNumber(existing["vulnerabilities"]);
    const currentSignal = toSafeNumber(app["pqc_ready"]) + toSafeNumber(app["vulnerabilities"]);

    if (currentCoverage > existingCoverage || (currentCoverage === existingCoverage && currentSignal >= existingSignal)) {
      deduped.set(key, app);
    }
  });

  return Array.from(deduped.values());
}

// ===== RISK UTILITIES =====
export function getRiskColor(risk: string): string {
  const riskMap: Record<string, string> = {
    Low: "#10b981",      // green-500
    Medium: "#f59e0b",   // amber-500
    High: "#f97316",     // orange-500
    "Very High": "#ef4444" // red-500
  };
  return riskMap[risk] || "#6b7280"; // gray-500 fallback
}

export function getRiskBadgeClass(risk: string): string {
  const classMap: Record<string, string> = {
    Low: "bg-green-100 text-green-800 border-green-200",
    Medium: "bg-amber-100 text-amber-800 border-amber-200",
    High: "bg-orange-100 text-orange-800 border-orange-200",
    "Very High": "bg-red-100 text-red-800 border-red-200"
  };
  return classMap[risk] || "bg-gray-100 text-gray-800 border-gray-200";
}

// ===== SCORE UTILITIES =====
export function getScoreTextClass(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  if (score >= 40) return "text-orange-600";
  return "text-red-600";
}

export function getScoreBgClass(score: number): string {
  if (score >= 80) return "bg-green-50";
  if (score >= 60) return "bg-amber-50";
  if (score >= 40) return "bg-orange-50";
  return "bg-red-50";
}

// ===== CHART DATA TRANSFORMERS =====
export function transformRiskDistribution(distribution: Record<string, number>) {
  return [
    { name: "Low", value: distribution.Low || 0, fill: "#10b981" },
    { name: "Medium", value: distribution.Medium || 0, fill: "#f59e0b" },
    { name: "High", value: distribution.High || 0, fill: "#f97316" },
    { name: "Very High", value: distribution["Very High"] || 0, fill: "#ef4444" }
  ];
}

export function transformApplicationsByRisk(apps: ApplicationSummary[]) {
  const riskCount: Record<string, number> = {
    Low: 0,
    Medium: 0,
    High: 0,
    "Very High": 0
  };

  apps.forEach(app => {
    riskCount[app.risk_level] = (riskCount[app.risk_level] || 0) + 1;
  });

  return [
    { name: "Low", count: riskCount.Low },
    { name: "Medium", count: riskCount.Medium },
    { name: "High", count: riskCount.High },
    { name: "Very High", count: riskCount["Very High"] }
  ];
}

// ===== AGGREGATION UTILITIES =====
export function calculateAveragePQC(apps: ApplicationSummary[]): number {
  if (!apps.length) return 0;
  const sum = apps.reduce((acc, app) => acc + app.pqc_ready, 0);
  return Math.round((sum / apps.length) * 10) / 10;
}

export function countSecureApps(apps: ApplicationSummary[]): number {
  return apps.filter(app => app.pqc_ready >= 80).length;
}

export function getTotalVulnerabilities(apps: ApplicationSummary[]): number {
  return apps.reduce((sum, app) => sum + (app.vulnerabilities || 0), 0);
}