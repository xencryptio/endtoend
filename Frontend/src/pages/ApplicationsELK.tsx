// ============================================================================
// ELK APPLICATIONS — Hierarchical view (Organization → SubOrg → Application)
// with rolled-up scan stats and click-through to scan history per asset.
// ============================================================================

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Layers,
  AppWindow,
  Globe,
  GitBranch,
  Server,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Eye,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UnifiedCard } from "@/components/ui/unified";
import { cn } from "@/lib/utils";
import {
  elkApi,
  formatDateTime,
  ElkApplicationsResponse,
  ElkOrgView,
  ElkSubOrgView,
  ElkAppView,
  ElkScanSnippet,
} from "@/api/elkClient";

// ---------------------------------------------------------------------------
const readinessClass = (pct?: number | null) => {
  if (pct == null) return "bg-muted text-muted-foreground";
  if (pct >= 80) return "bg-emerald-100 text-emerald-700";
  if (pct >= 60) return "bg-blue-100 text-blue-700";
  if (pct >= 40) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
};

const readinessBar = (pct?: number | null) => {
  if (pct == null) return "bg-muted";
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 60) return "bg-blue-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-red-500";
};

const gradeColor = (grade?: string | null) => {
  if (!grade) return "text-muted-foreground";
  if (grade.startsWith("A")) return "text-emerald-600";
  if (grade.startsWith("B")) return "text-blue-600";
  if (grade.startsWith("C")) return "text-amber-600";
  if (grade.startsWith("D")) return "text-orange-600";
  return "text-red-600";
};

// ---------------------------------------------------------------------------
const KPI: React.FC<{
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
  hint?: string;
}> = ({ label, value, icon: Icon, color = "from-blue-500 to-blue-600", hint }) => {
  const isLongText = typeof value === "string" && value.length > 12;
  return (
    <UnifiedCard className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div
            className={cn(
              "font-bold mt-1 truncate",
              isLongText ? "text-sm" : "text-2xl"
            )}
            title={String(value)}
          >
            {value}
          </div>
          {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
        </div>
        <div className={cn("p-2 rounded-lg bg-gradient-to-br text-white shrink-0", color)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </UnifiedCard>
  );
};

const StatChip: React.FC<{ label: string; value: number | string; color?: string }> = ({
  label,
  value,
  color = "bg-muted",
}) => (
  <span className={cn("px-2 py-1 rounded text-[11px] font-medium", color)}>
    {label}: <strong>{value}</strong>
  </span>
);

// ---------------------------------------------------------------------------
// Scan row with "View timeline" redirect
// ---------------------------------------------------------------------------
const ScanRow: React.FC<{
  label: React.ReactNode;
  assetId?: string;
  scanCount: number;
  scan: ElkScanSnippet | null;
}> = ({ label, assetId, scanCount, scan }) => {
  const navigate = useNavigate();
  return (
    <tr className="border-b hover:bg-muted/40">
      <td className="py-1.5 px-2 text-xs">{label}</td>
      <td className="py-1.5 px-2 text-center text-xs">
        {scan ? (
          <span className="text-emerald-600 font-semibold">{scanCount}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </td>
      <td className="py-1.5 px-2 text-center text-xs">
        {scan?.overall_grade ? (
          <span className={cn("font-bold", gradeColor(scan.overall_grade))}>{scan.overall_grade}</span>
        ) : (
          "—"
        )}
      </td>
      <td className="py-1.5 px-2 text-xs">
        {scan?.quantum_readiness_percentage != null ? (
          <div className="flex items-center gap-1">
            <div className="flex-1 bg-muted rounded h-1.5 max-w-[80px]">
              <div
                className={cn("h-1.5 rounded", readinessBar(scan.quantum_readiness_percentage))}
                style={{ width: `${scan.quantum_readiness_percentage}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums">
              {scan.quantum_readiness_percentage.toFixed(0)}%
            </span>
          </div>
        ) : (
          "—"
        )}
      </td>
      <td className="py-1.5 px-2 text-center text-xs">
        {scan?.vulnerabilities_count != null ? (
          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px]",
              scan.vulnerabilities_count > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
            )}
          >
            {scan.vulnerabilities_count}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="py-1.5 px-2 text-[10px] text-muted-foreground">
        {scan?.scanned_at ? formatDateTime(scan.scanned_at) : "Not scanned"}
      </td>
      <td className="py-1.5 px-2 text-right">
        {assetId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] gap-1"
            onClick={() => navigate(`/elk/history?asset_id=${encodeURIComponent(assetId)}`)}
            disabled={!scan}
          >
            <Eye className="h-3 w-3" />
            View
          </Button>
        )}
      </td>
    </tr>
  );
};

// ---------------------------------------------------------------------------
// Application card
// ---------------------------------------------------------------------------
const AppCard: React.FC<{ app: ElkAppView }> = ({ app }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-lg bg-background overflow-hidden">
      <div
        className="p-3 cursor-pointer hover:bg-muted/40 flex items-center gap-3"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <AppWindow className="h-5 w-5 text-indigo-600" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{app.application_name}</div>
          <div className="text-[11px] text-muted-foreground">
            {app.stats.resources_total} resources • {app.stats.scanned} scanned •{" "}
            <span className={cn("font-medium", app.stats.total_vulnerabilities > 0 && "text-red-600")}>
              {app.stats.total_vulnerabilities} vulns
            </span>
          </div>
        </div>
        <div className="hidden lg:flex gap-1.5 flex-wrap justify-end">
          <StatChip label="Repos" value={app.repositories.total} color="bg-purple-100 text-purple-700" />
          <StatChip label="Domains" value={app.domains.total} color="bg-cyan-100 text-cyan-700" />
          <StatChip label="Servers" value={app.servers.total} color="bg-orange-100 text-orange-700" />
          {app.stats.avg_readiness != null && (
            <span
              className={cn(
                "px-2 py-1 rounded text-[11px] font-medium",
                readinessClass(app.stats.avg_readiness)
              )}
            >
              {app.stats.avg_readiness.toFixed(0)}% ready
            </span>
          )}
        </div>
      </div>

      {open && (
        <div className="p-3 bg-muted/20 border-t space-y-4">
          {/* Stats summary row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div className="p-2 bg-background rounded border">
              <div className="text-muted-foreground">Resources</div>
              <div className="font-bold text-base">{app.stats.resources_total}</div>
            </div>
            <div className="p-2 bg-background rounded border">
              <div className="text-muted-foreground">Scanned</div>
              <div className="font-bold text-base text-blue-600">{app.stats.scanned}</div>
            </div>
            <div className="p-2 bg-background rounded border">
              <div className="text-muted-foreground">Quantum-ready</div>
              <div className="font-bold text-base text-emerald-600">
                {app.stats.quantum_ready_resources}
              </div>
            </div>
            <div className="p-2 bg-background rounded border">
              <div className="text-muted-foreground">Vulnerabilities</div>
              <div className={cn(
                "font-bold text-base",
                app.stats.total_vulnerabilities > 0 ? "text-red-600" : "text-emerald-600"
              )}>
                {app.stats.total_vulnerabilities}
              </div>
            </div>
            <div className="p-2 bg-background rounded border">
              <div className="text-muted-foreground">Avg readiness</div>
              <div className="font-bold text-base">
                {app.stats.avg_readiness != null ? `${app.stats.avg_readiness.toFixed(1)}%` : "—"}
              </div>
            </div>
          </div>

          {/* Repositories */}
          {app.repositories.items.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-1 flex items-center gap-1">
                <GitBranch className="h-3.5 w-3.5 text-purple-600" />
                Repositories ({app.repositories.total})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-1 px-2">Repo</th>
                      <th className="py-1 px-2 text-center">Scans</th>
                      <th className="py-1 px-2 text-center">Grade</th>
                      <th className="py-1 px-2">Readiness</th>
                      <th className="py-1 px-2 text-center">Vulns</th>
                      <th className="py-1 px-2">Last scan</th>
                      <th className="py-1 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {app.repositories.items.map((r, i) => (
                      <ScanRow
                        key={r.asset_id || r.repo_url || i}
                        label={
                          <span className="flex flex-col">
                            <span className="font-medium truncate max-w-[300px]">
                              {r.repo_name || r.repo_url}
                            </span>
                            <span className="text-[9px] text-muted-foreground truncate max-w-[300px]">
                              {r.repo_url} • {r.branch_to_scan || "main"}
                            </span>
                          </span>
                        }
                        assetId={r.asset_id}
                        scanCount={r.scan_count}
                        scan={r.latest_scan}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Domains */}
          {app.domains.items.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-1 flex items-center gap-1">
                <Globe className="h-3.5 w-3.5 text-cyan-600" />
                Domains ({app.domains.total})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-1 px-2">Domain</th>
                      <th className="py-1 px-2 text-center">Scans</th>
                      <th className="py-1 px-2 text-center">Grade</th>
                      <th className="py-1 px-2">Readiness</th>
                      <th className="py-1 px-2 text-center">Vulns</th>
                      <th className="py-1 px-2">Last scan</th>
                      <th className="py-1 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {app.domains.items.map((d, i) => (
                      <ScanRow
                        key={d.asset_id || d.domain || i}
                        label={<span className="font-medium">{d.domain}</span>}
                        assetId={d.asset_id}
                        scanCount={d.scan_count}
                        scan={d.latest_scan}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Servers */}
          {app.servers.items.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-1 flex items-center gap-1">
                <Server className="h-3.5 w-3.5 text-orange-600" />
                Servers ({app.servers.total})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-1 px-2">Hostname</th>
                      <th className="py-1 px-2">IP</th>
                      <th className="py-1 px-2">OS</th>
                      <th className="py-1 px-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {app.servers.items.map((s, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-1 px-2">{s.hostname || "—"}</td>
                        <td className="py-1 px-2 font-mono text-[10px]">{s.ip_address || "—"}</td>
                        <td className="py-1 px-2">{s.operating_system || "—"}</td>
                        <td className="py-1 px-2 text-center">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                            Manual scan
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-org block
// ---------------------------------------------------------------------------
const SubOrgBlock: React.FC<{ so: ElkSubOrgView }> = ({ so }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-l-2 border-purple-300 pl-3 ml-2">
      <div
        className="py-2 cursor-pointer flex items-center gap-2"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Layers className="h-4 w-4 text-purple-600" />
        <span className="font-semibold">{so.suborganization_name}</span>
        <div className="flex gap-1.5 flex-wrap text-[11px] ml-auto">
          <StatChip label="Apps" value={so.stats.applications} color="bg-indigo-100 text-indigo-700" />
          <StatChip label="Resources" value={so.stats.resources_total} />
          <StatChip label="Scanned" value={so.stats.scanned} color="bg-blue-100 text-blue-700" />
          <StatChip
            label="Vulns"
            value={so.stats.total_vulnerabilities}
            color={
              so.stats.total_vulnerabilities > 0
                ? "bg-red-100 text-red-700"
                : "bg-emerald-100 text-emerald-700"
            }
          />
          {so.stats.avg_readiness != null && (
            <span className={cn("px-2 py-1 rounded text-[11px]", readinessClass(so.stats.avg_readiness))}>
              {so.stats.avg_readiness.toFixed(0)}% ready
            </span>
          )}
        </div>
      </div>
      {open && (
        <div className="space-y-2 mt-1 mb-3">
          {so.applications.map((app) => (
            <AppCard key={app.app_id} app={app} />
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Org block
// ---------------------------------------------------------------------------
const OrgBlock: React.FC<{ org: ElkOrgView }> = ({ org }) => {
  const [open, setOpen] = useState(true);
  return (
    <UnifiedCard className="p-4">
      <div
        className="flex items-center gap-3 cursor-pointer mb-2"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        <Building2 className="h-6 w-6 text-blue-600" />
        <div className="flex-1 min-w-0">
          <div className="text-lg font-bold truncate">{org.organization_name}</div>
          <div className="text-xs text-muted-foreground">
            {org.organization_email && <span>{org.organization_email} • </span>}
            Updated {formatDateTime(org.updated_at)}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs justify-end">
          <StatChip label="Apps" value={org.stats.applications} color="bg-indigo-100 text-indigo-700" />
          <StatChip label="Scanned" value={org.stats.scanned} color="bg-blue-100 text-blue-700" />
          <StatChip
            label="Vulns"
            value={org.stats.total_vulnerabilities}
            color={
              org.stats.total_vulnerabilities > 0
                ? "bg-red-100 text-red-700"
                : "bg-emerald-100 text-emerald-700"
            }
          />
          {org.stats.avg_readiness != null && (
            <span className={cn("px-2 py-1 rounded text-xs", readinessClass(org.stats.avg_readiness))}>
              {org.stats.avg_readiness.toFixed(0)}% ready
            </span>
          )}
        </div>
      </div>

      {open && (
        <div className="space-y-2">
          {org.suborganizations.map((so) => (
            <SubOrgBlock key={so.suborg_id} so={so} />
          ))}
        </div>
      )}
    </UnifiedCard>
  );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
const ApplicationsELK: React.FC = () => {
  const [data, setData] = useState<ElkApplicationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await elkApi.applications(1000);
      setData(r);
      // Default to first org if nothing selected yet or selection no longer exists
      setSelectedOrgId((cur) => {
        if (cur && r.organizations.some((o) => o.org_id === cur)) return cur;
        return r.organizations[0]?.org_id || "";
      });
    } catch (e: any) {
      toast.error(e?.message || "Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Scope to the currently selected org (or all orgs when "__ALL__" picked)
  const scopedOrgs = useMemo<ElkOrgView[]>(() => {
    if (!data) return [];
    if (selectedOrgId === "__ALL__") return data.organizations;
    const one = data.organizations.find((o) => o.org_id === selectedOrgId);
    return one ? [one] : [];
  }, [data, selectedOrgId]);

  // Aggregated summary across whatever is currently scoped
  const scopedSummary = useMemo(() => {
    let scanned = 0;
    let vulns = 0;
    let apps = 0;
    const readinessVals: number[] = [];
    for (const o of scopedOrgs) {
      apps += o.stats.applications;
      scanned += o.stats.scanned;
      vulns += o.stats.total_vulnerabilities;
      if (o.stats.avg_readiness != null) readinessVals.push(o.stats.avg_readiness);
    }
    return {
      organizations: scopedOrgs.length,
      applications: apps,
      scanned_resources: scanned,
      total_vulnerabilities: vulns,
      avg_readiness:
        readinessVals.length > 0
          ? readinessVals.reduce((a, b) => a + b, 0) / readinessVals.length
          : null,
    };
  }, [scopedOrgs]);

  const filteredOrgs = useMemo(() => {
    if (!scopedOrgs.length) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return scopedOrgs;
    return scopedOrgs
      .map((o) => {
        const subs = o.suborganizations
          .map((so) => {
            const apps = so.applications.filter(
              (a) =>
                a.application_name.toLowerCase().includes(q) ||
                so.suborganization_name.toLowerCase().includes(q) ||
                o.organization_name.toLowerCase().includes(q)
            );
            return apps.length ? { ...so, applications: apps } : null;
          })
          .filter(Boolean) as ElkSubOrgView[];
        return subs.length ? { ...o, suborganizations: subs } : null;
      })
      .filter(Boolean) as ElkOrgView[];
  }, [scopedOrgs, filter]);

  // Charts data — derived from scopedOrgs (not full data)
  const topAppsChart = useMemo(() => {
    const flat: { name: string; vulns: number; readiness: number | null }[] = [];
    for (const o of scopedOrgs) {
      for (const so of o.suborganizations) {
        for (const a of so.applications) {
          flat.push({
            name: a.application_name,
            vulns: a.stats.total_vulnerabilities,
            readiness: a.stats.avg_readiness,
          });
        }
      }
    }
    flat.sort((a, b) => b.vulns - a.vulns);
    return flat.slice(0, 10);
  }, [scopedOrgs]);

  const readinessPieData = useMemo(() => {
    let ready = 0;
    let notReady = 0;
    let unscanned = 0;
    for (const o of scopedOrgs) {
      for (const so of o.suborganizations) {
        for (const a of so.applications) {
          ready += a.stats.quantum_ready_resources;
          const scanned = a.stats.scanned;
          notReady += Math.max(0, scanned - a.stats.quantum_ready_resources);
          unscanned += Math.max(0, a.stats.resources_total - scanned);
        }
      }
    }
    return [
      { name: "Quantum ready", value: ready, color: "#10B981" },
      { name: "Scanned, not ready", value: notReady, color: "#F59E0B" },
      { name: "Unscanned", value: unscanned, color: "#94A3B8" },
    ].filter((d) => d.value > 0);
  }, [scopedOrgs]);

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <AppWindow className="h-6 w-6 text-indigo-600" />
              <h1 className="text-2xl font-bold">ELK Applications</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              All onboarded applications with rolled-up scan stats. Click a scan to view its full timeline.
            </p>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" className="gap-2">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* Organisation selector */}
      {data && data.organizations.length > 0 && (
        <UnifiedCard className="p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Building2 className="h-4 w-4 text-blue-600" />
              Organization:
            </div>
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="px-3 py-1.5 text-sm border rounded-md bg-background min-w-[260px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="__ALL__">All organizations ({data.organizations.length})</option>
              {data.organizations.map((o) => (
                <option key={o.org_id} value={o.org_id}>
                  {o.organization_name} — {o.stats.applications} apps, {o.stats.total_vulnerabilities} vulns
                </option>
              ))}
            </select>
            {selectedOrgId && selectedOrgId !== "__ALL__" && (
              <span className="text-xs text-muted-foreground">
                Showing 1 of {data.organizations.length}
              </span>
            )}
          </div>
        </UnifiedCard>
      )}

      {/* KPIs (scoped to selection) */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPI
            label={selectedOrgId === "__ALL__" ? "Organizations" : "Organization"}
            value={
              selectedOrgId === "__ALL__"
                ? scopedSummary.organizations
                : scopedOrgs[0]?.organization_name || "—"
            }
            icon={Building2}
            color="from-blue-500 to-blue-600"
          />
          <KPI label="Applications" value={scopedSummary.applications} icon={AppWindow} color="from-indigo-500 to-indigo-600" />
          <KPI
            label="Scanned resources"
            value={scopedSummary.scanned_resources}
            icon={Activity}
            color="from-cyan-500 to-cyan-600"
          />
          <KPI
            label="Total vulnerabilities"
            value={scopedSummary.total_vulnerabilities}
            icon={AlertTriangle}
            color={
              scopedSummary.total_vulnerabilities > 0
                ? "from-red-500 to-red-600"
                : "from-emerald-500 to-emerald-600"
            }
          />
          <KPI
            label="Avg readiness"
            value={
              scopedSummary.avg_readiness != null
                ? `${scopedSummary.avg_readiness.toFixed(1)}%`
                : "—"
            }
            icon={TrendingUp}
            color="from-emerald-500 to-emerald-600"
          />
        </div>
      )}

      {/* Charts */}
      {data && (topAppsChart.length > 0 || readinessPieData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <UnifiedCard className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-600" />
              Top 10 apps by vulnerabilities
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topAppsChart} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" angle={-25} textAnchor="end" height={70} fontSize={10} />
                <YAxis fontSize={10} />
                <RTooltip />
                <Bar dataKey="vulns" radius={[4, 4, 0, 0]}>
                  {topAppsChart.map((d, i) => (
                    <Cell key={i} fill={d.vulns > 5 ? "#EF4444" : d.vulns > 0 ? "#F59E0B" : "#10B981"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </UnifiedCard>

          <UnifiedCard className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Quantum readiness breakdown (resources)
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={readinessPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(d: any) => `${d.value}`}
                >
                  {readinessPieData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <RTooltip />
              </PieChart>
            </ResponsiveContainer>
          </UnifiedCard>
        </div>
      )}

      {/* Filter */}
      <UnifiedCard className="p-3">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by organisation, sub-org or application name…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9"
          />
        </div>
      </UnifiedCard>

      {/* Hierarchy */}
      {loading && !data ? (
        <UnifiedCard className="p-12 text-center text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
          Loading applications…
        </UnifiedCard>
      ) : filteredOrgs.length === 0 ? (
        <UnifiedCard className="p-12 text-center text-muted-foreground">
          {data
            ? "No applications match the current filter."
            : "No organisations onboarded yet — onboard one from the ELK Onboarding page."}
        </UnifiedCard>
      ) : (
        <div className="space-y-3">
          {filteredOrgs.map((o) => (
            <OrgBlock key={o.org_id} org={o} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ApplicationsELK;
