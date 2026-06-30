// ============================================================================
// ELK VULNERABILITIES — algorithms found across all ELK-indexed scans whose
// scorer score falls below a user-configurable threshold.
// ============================================================================
// Data: GET /api/elk/vulnerabilities (joins crypto-scans-* with
//       crypto-algorithm-scores). Default threshold = 70.
// ============================================================================

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Search,
  Database,
  Globe,
  GitBranch,
  Server,
  ChevronDown,
  ChevronRight,
  Download,
  Filter,
  FileText,
  Hash,
  Code2,
  Cpu,
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
import { Button } from "@/components/ui/button";
import { UnifiedCard } from "@/components/ui/unified";
import { toast } from "sonner";
import {
  elkApi,
  ElkVulnerabilitiesResponse,
  ElkVulnFinding,
  formatDateTime,
} from "@/api/elkClient";
import { cn } from "@/lib/utils";

type AssetType = "all" | "domain" | "repo" | "asset";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const scoreBadgeColor = (score: number) => {
  if (score >= 70) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (score >= 50) return "bg-amber-100 text-amber-700 border-amber-200";
  if (score >= 30) return "bg-orange-100 text-orange-700 border-orange-200";
  return "bg-red-100 text-red-700 border-red-200";
};

const scoreBarColor = (score: number) => {
  if (score >= 70) return "#10B981";
  if (score >= 50) return "#F59E0B";
  if (score >= 30) return "#F97316";
  return "#EF4444";
};

const TypeIcon: React.FC<{ type: string; className?: string }> = ({ type, className }) => {
  const cls = className || "h-4 w-4";
  if (type === "domain") return <Globe className={cls} />;
  if (type === "repo") return <GitBranch className={cls} />;
  if (type === "asset") return <Server className={cls} />;
  return <Database className={cls} />;
};

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------
const Kpi: React.FC<{
  label: string;
  value: string | number;
  hint?: string;
  color: string;
  icon: React.ReactNode;
}> = ({ label, value, hint, color, icon }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="rounded-xl border bg-card shadow-sm p-4"
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </div>
      <div className={cn("p-2 rounded-lg", color)}>{icon}</div>
    </div>
  </motion.div>
);

// ---------------------------------------------------------------------------
// Expandable evidence row
// ---------------------------------------------------------------------------
const EvidenceBlock: React.FC<{ finding: ElkVulnFinding }> = ({ finding }) => {
  const ev = finding.evidence || {};
  if (finding.source_type === "domain") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <Field label="URL" value={ev.url} />
        <Field label="Role" value={finding.role} />
        <Field label="TLS Version" value={ev.tls_version} />
        <Field label="Cipher Suite" value={ev.cipher_suite} />
        <Field label="Public Key Size" value={ev.public_key_size_bits ? `${ev.public_key_size_bits} bits` : null} />
        <Field label="Cert Issuer" value={ev.cert_issuer} />
        <Field label="Cert Subject" value={ev.cert_subject} />
        <Field label="HSTS" value={ev.hsts_enabled === undefined ? null : ev.hsts_enabled ? "enabled" : "disabled"} />
        <Field label="OCSP Stapling" value={ev.ocsp_stapling_active === undefined ? null : ev.ocsp_stapling_active ? "active" : "inactive"} />
        <Field label="CT Present" value={ev.ct_present === undefined ? null : ev.ct_present ? "yes" : "no"} />
      </div>
    );
  }
  if (finding.source_type === "repo") {
    const samples = (ev.samples as any[]) || [];
    const files = (ev.files as string[]) || [];
    return (
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Repository" value={ev.repo_url} />
          <Field label="Branch" value={ev.branch_name} />
          <Field label="Platform" value={ev.platform} />
          <Field label="Findings" value={ev.findings_count} />
          <Field label="Files affected" value={files.length} />
          <Field label="Category" value={ev.category} />
        </div>
        {files.length > 0 && (
          <div>
            <p className="font-semibold text-muted-foreground mb-1 flex items-center gap-1">
              <FileText className="h-3 w-3" /> Files
            </p>
            <div className="flex flex-wrap gap-1">
              {files.map((f, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded bg-muted text-[11px] font-mono"
                  title={f}
                >
                  {f.length > 50 ? `…${f.slice(-50)}` : f}
                </span>
              ))}
            </div>
          </div>
        )}
        {samples.length > 0 && (
          <div>
            <p className="font-semibold text-muted-foreground mb-1 flex items-center gap-1">
              <Code2 className="h-3 w-3" /> Sample findings
            </p>
            <div className="space-y-1">
              {samples.map((s: any, i: number) => (
                <div key={i} className="rounded border bg-muted/30 p-2 font-mono text-[11px]">
                  <div className="flex justify-between text-muted-foreground mb-1">
                    <span className="truncate">{s.file_path || "—"}</span>
                    {s.line_number != null && (
                      <span className="ml-2 flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        {s.line_number}
                      </span>
                    )}
                  </div>
                  {s.code_snippet && (
                    <pre className="whitespace-pre-wrap break-all text-foreground">
                      {s.code_snippet}
                    </pre>
                  )}
                  {s.match_text && !s.code_snippet && (
                    <code className="text-foreground">{s.match_text}</code>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
  if (finding.source_type === "asset") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <Field label="Host" value={ev.hostname || ev.computer_name} />
        <Field label="IP" value={ev.ip_address} />
        <Field label="OS" value={ev.os_info} />
        <Field label="FIPS Mode" value={ev.fips_mode_enabled === undefined ? null : ev.fips_mode_enabled ? "enabled" : "disabled"} />
        <Field label="Organization" value={ev.organization_name} />
        <Field label="Application" value={ev.application_name} />
        <Field label="Role" value={finding.role} />
        {ev.provider && (
          <Field
            label="Provider"
            value={
              typeof ev.provider === "object"
                ? ev.provider.provider_name || JSON.stringify(ev.provider)
                : String(ev.provider)
            }
          />
        )}
        {ev.cipher && (
          <Field
            label="Cipher"
            value={
              typeof ev.cipher === "object"
                ? ev.cipher.name || JSON.stringify(ev.cipher)
                : String(ev.cipher)
            }
          />
        )}
      </div>
    );
  }
  return <pre className="text-xs">{JSON.stringify(ev, null, 2)}</pre>;
};

const Field: React.FC<{ label: string; value: any }> = ({ label, value }) => {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium break-words">{String(value)}</p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const ELKVulnerabilities: React.FC = () => {
  const [threshold, setThreshold] = useState<number>(70);
  const [pendingThreshold, setPendingThreshold] = useState<number>(70);
  const [type, setType] = useState<AssetType>("all");
  const [data, setData] = useState<ElkVulnerabilitiesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchData = async (t = threshold, ty = type) => {
    try {
      setLoading(true);
      const res = await elkApi.vulnerabilities(t, ty, 1000);
      setData(res);
    } catch (e: any) {
      toast.error(`Failed to load vulnerabilities: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(threshold, type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold, type]);

  const filteredFindings = useMemo(() => {
    if (!data) return [] as ElkVulnFinding[];
    if (!search) return data.findings;
    const s = search.toLowerCase();
    return data.findings.filter(
      (f) =>
        f.algorithm.toLowerCase().includes(s) ||
        f.asset_label.toLowerCase().includes(s) ||
        f.asset_id.toLowerCase().includes(s) ||
        (f.component_type || "").toLowerCase().includes(s) ||
        (f.role || "").toLowerCase().includes(s)
    );
  }, [data, search]);

  const toggleRow = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const histogramData = useMemo(() => {
    if (!data) return [];
    return data.histogram.slice(0, 15).map((h) => ({
      name: h.algorithm.length > 18 ? `${h.algorithm.slice(0, 16)}…` : h.algorithm,
      full: h.algorithm,
      score: h.score,
      occurrences: h.occurrences,
      assets: h.assets_affected,
      fill: scoreBarColor(h.score),
    }));
  }, [data]);

  const compositionData = useMemo(() => {
    if (!data) return [];
    const qsCount = data.histogram.filter((h) => h.quantum_safe).length;
    const qvCount = data.histogram.length - qsCount;
    return [
      { name: "Quantum-Safe", value: qsCount, fill: "#10B981" },
      { name: "Quantum-Vulnerable", value: qvCount, fill: "#EF4444" },
    ].filter((d) => d.value > 0);
  }, [data]);

  const exportCsv = () => {
    if (!filteredFindings.length) return;
    const headers = [
      "algorithm",
      "score",
      "quantum_safe",
      "component_type",
      "source_type",
      "asset_label",
      "asset_id",
      "role",
      "scanned_at",
    ];
    const rows = filteredFindings.map((f) =>
      headers.map((h) => JSON.stringify((f as any)[h] ?? "")).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `elk-vulnerabilities-t${threshold}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary = data?.summary;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">ELK Vulnerabilities</h1>
              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">
                ELK
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Algorithms detected in scans whose scorer score is below the threshold.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={!filteredFindings.length}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button onClick={() => fetchData()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Threshold + filters */}
        <UnifiedCard className="mb-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-end gap-4">
              <div className="flex-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <Filter className="h-3 w-3" />
                  Score Threshold — show algorithms below
                </label>
                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={pendingThreshold}
                    onChange={(e) => setPendingThreshold(Number(e.target.value))}
                    onMouseUp={() => setThreshold(pendingThreshold)}
                    onTouchEnd={() => setThreshold(pendingThreshold)}
                    onKeyUp={() => setThreshold(pendingThreshold)}
                    className="w-full"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={pendingThreshold}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      setPendingThreshold(v);
                    }}
                    onBlur={() => setThreshold(pendingThreshold)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setThreshold(pendingThreshold);
                    }}
                    className="w-20 px-2 py-1 border rounded-md text-sm text-center font-mono"
                  />
                  <span
                    className={cn(
                      "px-2 py-1 rounded text-xs font-semibold border",
                      scoreBadgeColor(pendingThreshold)
                    )}
                  >
                    &lt; {pendingThreshold}
                  </span>
                </div>
              </div>

              {/* Type tabs */}
              <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
                {(["all", "domain", "repo", "asset"] as AssetType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={cn(
                      "px-3 py-1.5 text-sm rounded-md transition capitalize flex items-center gap-1",
                      type === t
                        ? "bg-white shadow text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <TypeIcon type={t} className="h-3 w-3" />
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by algorithm, asset, role, or component type…"
                className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-background"
              />
            </div>
          </div>
        </UnifiedCard>

        {/* KPI grid */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi
              label="Assets Scanned"
              value={summary.total_assets_scanned}
              hint="Latest scan per asset"
              color="bg-blue-100 text-blue-600"
              icon={<Database className="h-4 w-4" />}
            />
            <Kpi
              label="Algorithms Found"
              value={summary.unique_algorithms_found}
              hint="Unique across all scans"
              color="bg-violet-100 text-violet-600"
              icon={<Cpu className="h-4 w-4" />}
            />
            <Kpi
              label="Below Threshold"
              value={summary.algorithms_below_threshold}
              hint={`${summary.algorithms_below_threshold_pct}% of detected algorithms`}
              color="bg-red-100 text-red-600"
              icon={<ShieldAlert className="h-4 w-4" />}
            />
            <Kpi
              label="Affected Assets"
              value={`${summary.assets_with_vulnerabilities} / ${summary.total_assets_scanned}`}
              hint={`${summary.assets_with_vulnerabilities_pct}% of assets`}
              color="bg-amber-100 text-amber-600"
              icon={<AlertTriangle className="h-4 w-4" />}
            />
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <UnifiedCard className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold">Top vulnerable algorithms</h3>
                <p className="text-xs text-muted-foreground">
                  Lowest scores first · bar height = occurrences across assets
                </p>
              </div>
            </div>
            {histogramData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                No algorithms below threshold {threshold}.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={histogramData} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" angle={-30} textAnchor="end" interval={0} fontSize={11} />
                  <YAxis fontSize={11} />
                  <RTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as any;
                      return (
                        <div className="rounded-md bg-popover border p-2 shadow text-xs">
                          <p className="font-semibold">{p.full}</p>
                          <p>Score: <span className="font-mono">{p.score}</span></p>
                          <p>Occurrences: {p.occurrences}</p>
                          <p>Affected assets: {p.assets}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="occurrences">
                    {histogramData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </UnifiedCard>

          <UnifiedCard>
            <h3 className="text-sm font-semibold mb-1">Quantum safety mix</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Of algorithms below threshold
            </p>
            {compositionData.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={compositionData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    label={(d: any) => `${d.value}`}
                  >
                    {compositionData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" height={24} iconType="circle" />
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </UnifiedCard>
        </div>

        {/* Detail table */}
        <UnifiedCard>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold">Detailed findings</h3>
              <p className="text-xs text-muted-foreground">
                {filteredFindings.length} finding{filteredFindings.length === 1 ? "" : "s"} · click a
                row to inspect where & how it was detected
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="text-left py-2 px-2 w-6"></th>
                  <th className="text-left py-2 px-2">Algorithm</th>
                  <th className="text-left py-2 px-2">Score</th>
                  <th className="text-left py-2 px-2">Quantum-Safe</th>
                  <th className="text-left py-2 px-2">Source</th>
                  <th className="text-left py-2 px-2">Asset</th>
                  <th className="text-left py-2 px-2">Role</th>
                  <th className="text-left py-2 px-2">Scanned</th>
                </tr>
              </thead>
              <tbody>
                {filteredFindings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      {loading
                        ? "Loading…"
                        : "No vulnerabilities below the current threshold."}
                    </td>
                  </tr>
                ) : (
                  filteredFindings.map((f, idx) => {
                    const key = `${f.scan_id}-${f.algorithm}-${f.role}-${idx}`;
                    const isOpen = expanded.has(key);
                    return (
                      <React.Fragment key={key}>
                        <tr
                          className={cn(
                            "border-b cursor-pointer transition",
                            isOpen ? "bg-muted/50" : "hover:bg-muted/30"
                          )}
                          onClick={() => toggleRow(key)}
                        >
                          <td className="py-2 px-2 align-top">
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </td>
                          <td className="py-2 px-2 align-top">
                            <p className="font-semibold">{f.algorithm}</p>
                            {f.component_type && (
                              <p className="text-[11px] text-muted-foreground">
                                {f.component_type}
                              </p>
                            )}
                          </td>
                          <td className="py-2 px-2 align-top">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-xs font-mono font-semibold border",
                                scoreBadgeColor(f.score)
                              )}
                            >
                              {f.score}
                            </span>
                          </td>
                          <td className="py-2 px-2 align-top">
                            {f.quantum_safe ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                                <ShieldCheck className="h-3 w-3" /> Yes
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-600 text-xs font-medium">
                                <ShieldAlert className="h-3 w-3" /> No
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 align-top">
                            <span className="inline-flex items-center gap-1 text-xs capitalize px-2 py-0.5 rounded bg-muted">
                              <TypeIcon type={f.source_type} className="h-3 w-3" />
                              {f.source_type}
                            </span>
                          </td>
                          <td className="py-2 px-2 align-top max-w-[260px]">
                            <p className="font-medium truncate" title={f.asset_label}>
                              {f.asset_label}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate font-mono">
                              {f.asset_id}
                            </p>
                          </td>
                          <td className="py-2 px-2 align-top text-xs text-muted-foreground">
                            {f.role}
                          </td>
                          <td className="py-2 px-2 align-top text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(f.scanned_at)}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b bg-muted/10">
                            <td colSpan={8} className="py-3 px-4">
                              <div className="space-y-3">
                                {(f.reason || f.migration || f.resistance) && (
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                    <Field label="Resistance" value={f.resistance} />
                                    <Field label="Reason" value={f.reason} />
                                    <Field label="Migration" value={f.migration} />
                                  </div>
                                )}
                                <div>
                                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                                    Where it was found
                                  </p>
                                  <EvidenceBlock finding={f} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </UnifiedCard>
      </div>
    </div>
  );
};

export default ELKVulnerabilities;
