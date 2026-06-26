// ============================================================================
// PQC ANALYST DASHBOARD — Reads ES documents through elk-query-api
// ============================================================================
// One-call dashboard powered by /api/elk/analyst. NO Kibana dependency.
// Renders panels with Recharts. Scales to many domains / repos / endpoints.
// ============================================================================

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Database,
  Globe,
  GitBranch,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { elkApi, ElkAnalystDashboard, formatDateTime } from "@/api/elkClient";

// ---------------------------------------------------------------------------
// Reusable bits
// ---------------------------------------------------------------------------
const CATEGORY_COLORS = [
  "#2563EB", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#06B6D4", // cyan
  "#F97316", // orange
  "#84CC16", // lime
  "#EC4899", // pink
  "#64748B", // slate
];

const Card: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, icon, children, className = "" }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
    className={`rounded-xl border bg-card text-card-foreground shadow-sm p-5 ${className}`}
  >
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
      {icon && <div className="text-muted-foreground">{icon}</div>}
    </div>
    {children}
  </motion.div>
);

const Kpi: React.FC<{
  label: string;
  value: string | number;
  hint?: string;
  color: string;
  icon: React.ReactNode;
}> = ({ label, value, hint, color, icon }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
    className="rounded-xl border bg-card shadow-sm p-4"
  >
    <div className="flex items-center justify-between">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
    </div>
    <p className="text-3xl font-bold mt-3">{value}</p>
    {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
  </motion.div>
);

const Empty: React.FC<{ msg?: string }> = ({ msg = "No data yet." }) => (
  <div className="py-10 text-center text-sm text-muted-foreground">{msg}</div>
);

const fmt = (b: { key: string | number | boolean }) =>
  b.key === true || b.key === "true"
    ? "Enabled"
    : b.key === false || b.key === "false"
    ? "Disabled"
    : String(b.key);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const PqcAnalystDashboard: React.FC = () => {
  const [data, setData] = useState<ElkAnalystDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<"hour" | "day" | "week" | "month">(
    "day"
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await elkApi.analyst(interval);
      setData(d);
    } catch (e: any) {
      const msg = e?.message || "Failed to load analyst dashboard";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000); // auto-refresh every 60s
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval]);

  // ----- chart-ready memoized data ------------------------------------------
  const trend = useMemo(() => {
    if (!data) return [];
    // Pivot per-asset-type readiness into one row per timestamp
    return data.qr_trend.map((p) => {
      const row: any = {
        ts: new Date(p.timestamp).toLocaleDateString(),
        total: p.avg_readiness,
        vulns: p.total_vulnerabilities,
      };
      for (const t of p.by_type) {
        row[`${t.type}_readiness`] = t.avg_readiness;
        row[`${t.type}_vulns`] = t.total_vulnerabilities;
      }
      return row;
    });
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="animate-spin h-6 w-6 text-muted-foreground mr-3" />
        <p className="text-muted-foreground">Loading analyst dashboard…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6">
        <Card title="Error loading dashboard" icon={<AlertTriangle />}>
          <p className="text-sm text-red-600">{error}</p>
          <Button onClick={load} className="mt-4" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" /> Retry
          </Button>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { kpi, by_asset_type, by_grade, score_by_type, domains, repos,
          endpoints, at_risk } = data;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ───── Header ───── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-purple-500" />
            PQC Analyst — Multi-Asset Crypto Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live view from Elasticsearch · {kpi.total_scans} scans across
            {" "}{kpi.unique_assets} unique assets · Last refreshed{" "}
            {formatDateTime(data.generated_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value as any)}
            className="text-sm border rounded-md px-3 py-1.5 bg-background"
          >
            <option value="hour">Hourly</option>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
          <Button onClick={load} size="sm" variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ───── KPI row ───── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Kpi
          label="Total scans"
          value={kpi.total_scans}
          icon={<Database className="h-5 w-5 text-blue-600" />}
          color="bg-blue-50"
        />
        <Kpi
          label="Unique assets"
          value={kpi.unique_assets}
          icon={<Server className="h-5 w-5 text-emerald-600" />}
          color="bg-emerald-50"
        />
        <Kpi
          label="Avg PQC score"
          value={`${kpi.avg_score.toFixed(1)}`}
          hint="0–100, higher is better"
          icon={<ShieldCheck className="h-5 w-5 text-amber-600" />}
          color="bg-amber-50"
        />
        <Kpi
          label="Avg quantum readiness"
          value={`${kpi.avg_readiness.toFixed(1)}%`}
          icon={<Activity className="h-5 w-5 text-violet-600" />}
          color="bg-violet-50"
        />
        <Kpi
          label="Total vulnerabilities"
          value={kpi.total_vulnerabilities}
          icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
          color="bg-red-50"
        />
        <Kpi
          label="Code findings (repos)"
          value={kpi.total_findings.toLocaleString()}
          icon={<BarChart3 className="h-5 w-5 text-orange-600" />}
          color="bg-orange-50"
        />
      </div>

      {/* ───── Asset-type breakdown ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Scans by asset type" icon={<Activity className="h-4 w-4" />}>
          {by_asset_type.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={by_asset_type.map((b) => ({ name: fmt(b), value: b.count }))}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={85}
                  innerRadius={45}
                  label
                >
                  {by_asset_type.map((_, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <RTooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Average PQC score by asset type">
          {score_by_type.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={score_by_type}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="type" />
                <YAxis domain={[0, 100]} />
                <RTooltip />
                <Legend />
                <Bar dataKey="avg_score" name="Avg score" fill={CATEGORY_COLORS[0]} />
                <Bar dataKey="avg_readiness" name="Avg readiness %" fill={CATEGORY_COLORS[1]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Overall grade distribution">
          {by_grade.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={by_grade.map((b) => ({ grade: fmt(b), count: b.count }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="grade" />
                <YAxis allowDecimals={false} />
                <RTooltip />
                <Bar dataKey="count" fill={CATEGORY_COLORS[2]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ───── Trend ───── */}
      <Card
        title="Quantum readiness % over time"
        subtitle={`Aggregated by ${interval}, split per asset type`}
        icon={<Activity className="h-4 w-4" />}
      >
        {trend.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="ts" />
              <YAxis domain={[0, 100]} />
              <RTooltip />
              <Legend />
              <Line type="monotone" dataKey="total" name="All assets"
                    stroke="#0f172a" strokeWidth={2} />
              <Line type="monotone" dataKey="domain_readiness" name="Domain"
                    stroke={CATEGORY_COLORS[0]} />
              <Line type="monotone" dataKey="repo_readiness" name="Repo"
                    stroke={CATEGORY_COLORS[1]} />
              <Line type="monotone" dataKey="asset_readiness" name="Endpoint"
                    stroke={CATEGORY_COLORS[3]} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ───── Domain panels ───── */}
      <h2 className="text-lg font-semibold flex items-center gap-2 mt-4">
        <Globe className="h-5 w-5 text-blue-600" /> Domains · TLS posture
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Top primary cipher suites">
          <SimpleBar data={domains.cipher_suites} color={CATEGORY_COLORS[0]} />
        </Card>
        <Card title="Public key algorithms">
          <SimplePie data={domains.public_key_algorithms} />
        </Card>
        <Card title="Top certificate issuers">
          <SimpleBar data={domains.issuers} color={CATEGORY_COLORS[5]} />
        </Card>
      </div>

      {/* Domain hygiene */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="HSTS enabled">
          <SimplePie data={domains.hsts} statusPalette />
        </Card>
        <Card title="OCSP stapling active">
          <SimplePie data={domains.ocsp_stapling} statusPalette />
        </Card>
        <Card title="Certificate Transparency">
          <SimplePie data={domains.ct_present} statusPalette />
        </Card>
        <Card title="Forward secrecy (ephemeral KEX)">
          <SimplePie data={domains.ephemeral_key_exchange} statusPalette />
        </Card>
      </div>

      {/* ───── Repo panels ───── */}
      <h2 className="text-lg font-semibold flex items-center gap-2 mt-4">
        <GitBranch className="h-5 w-5 text-emerald-600" /> Repositories · Code posture
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Top vulnerable algorithms across all repos">
          <SimpleBar data={repos.vulnerable_algorithms} color={CATEGORY_COLORS[3]} horizontal />
        </Card>
        <Card title="Findings per repo (top 15)">
          {repos.findings_by_repo.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(240, repos.findings_by_repo.length * 28)}>
              <BarChart data={repos.findings_by_repo} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="repo" width={150} />
                <RTooltip />
                <Bar dataKey="findings" fill={CATEGORY_COLORS[6]} name="Findings" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Algorithm composition (sums across all repos)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={[
                { name: "True PQC", value: repos.composition.true_pqc },
                { name: "Quantum safe", value: repos.composition.quantum_safe },
                { name: "Quantum vulnerable", value: repos.composition.quantum_vulnerable },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <RTooltip />
              <Bar dataKey="value">
                <Cell fill="#10B981" />
                <Cell fill="#3B82F6" />
                <Cell fill="#EF4444" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Platforms">
          <SimplePie data={repos.platforms} />
        </Card>

        <Card title="Top algorithms seen (all)">
          <SimpleBar data={repos.algorithm_names} color={CATEGORY_COLORS[4]} />
        </Card>
      </div>

      {/* ───── Endpoint panels ───── */}
      <h2 className="text-lg font-semibold flex items-center gap-2 mt-4">
        <Server className="h-5 w-5 text-violet-600" /> Endpoints · Host posture
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card title="FIPS mode enabled">
          <SimplePie data={endpoints.fips} statusPalette />
        </Card>
        <Card title="Weak providers by host" className="lg:col-span-1">
          {endpoints.weak_providers_by_host.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={endpoints.weak_providers_by_host} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="host" width={120} />
                <RTooltip />
                <Bar dataKey="weak_providers" fill={CATEGORY_COLORS[3]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Weak ciphers by host">
          {endpoints.weak_ciphers_by_host.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={endpoints.weak_ciphers_by_host} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="host" width={120} />
                <RTooltip />
                <Bar dataKey="weak_ciphers" fill={CATEGORY_COLORS[6]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Operating systems">
          <SimplePie data={endpoints.os} />
        </Card>
      </div>

      {/* ───── At-risk asset table ───── */}
      <Card
        title="Top at-risk assets (lowest PQC score)"
        subtitle="Sorted ascending by average overall_score across all scans"
        icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
      >
        {at_risk.length === 0 ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2 px-3">Asset</th>
                  <th className="text-left py-2 px-3">Type</th>
                  <th className="text-left py-2 px-3">Grade</th>
                  <th className="text-right py-2 px-3">Scans</th>
                  <th className="text-right py-2 px-3">Avg score</th>
                  <th className="text-right py-2 px-3">Avg readiness %</th>
                  <th className="text-right py-2 px-3">Total vulns</th>
                </tr>
              </thead>
              <tbody>
                {at_risk.map((row, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-2 px-3 font-medium">{row.label}</td>
                    <td className="py-2 px-3 capitalize">{row.type || "—"}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        gradeBg(row.grade)
                      }`}>
                        {row.grade || "—"}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">{row.scans}</td>
                    <td className="py-2 px-3 text-right">{row.avg_score.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right">{row.avg_readiness.toFixed(1)}%</td>
                    <td className="py-2 px-3 text-right">{row.total_vulnerabilities}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
const SimpleBar: React.FC<{
  data: { key: string | number | boolean; count: number }[];
  color: string;
  horizontal?: boolean;
}> = ({ data, color, horizontal = false }) => {
  if (!data.length) return <Empty />;
  const items = data.map((b) => ({ name: fmt(b), value: b.count }));
  const height = horizontal ? Math.max(240, items.length * 22) : 240;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={items} layout={horizontal ? "vertical" : "horizontal"}
                margin={{ left: horizontal ? 80 : 5 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        {horizontal ? (
          <>
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={160} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
          </>
        )}
        <RTooltip />
        <Bar dataKey="value" fill={color} />
      </BarChart>
    </ResponsiveContainer>
  );
};

const STATUS_COLORS: Record<string, string> = {
  Enabled: "#10B981",
  Disabled: "#EF4444",
  true: "#10B981",
  false: "#EF4444",
};

const SimplePie: React.FC<{
  data: { key: string | number | boolean; count: number }[];
  statusPalette?: boolean;
}> = ({ data, statusPalette = false }) => {
  if (!data.length) return <Empty />;
  const items = data.map((b) => ({ name: fmt(b), value: b.count }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={items} dataKey="value" nameKey="name"
             outerRadius={85} innerRadius={45} label>
          {items.map((it, i) => (
            <Cell
              key={i}
              fill={
                statusPalette && STATUS_COLORS[it.name]
                  ? STATUS_COLORS[it.name]
                  : CATEGORY_COLORS[i % CATEGORY_COLORS.length]
              }
            />
          ))}
        </Pie>
        <Legend />
        <RTooltip />
      </PieChart>
    </ResponsiveContainer>
  );
};

const gradeBg = (g?: string | null) => {
  if (!g) return "bg-muted text-muted-foreground";
  if (g.startsWith("A")) return "bg-emerald-100 text-emerald-700";
  if (g.startsWith("B")) return "bg-blue-100 text-blue-700";
  if (g.startsWith("C")) return "bg-amber-100 text-amber-700";
  if (g.startsWith("D")) return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-700";
};

export default PqcAnalystDashboard;
