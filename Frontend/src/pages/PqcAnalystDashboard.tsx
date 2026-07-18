// ============================================================================
// PQC ANALYST DASHBOARD — Reads ES documents through elk-query-api
// ============================================================================
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Database,
  Globe,
  GitBranch,
  RefreshCw,
  Server,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Award,
  Layers,
  Cpu,
  Lock,
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
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { elkApi, ElkAnalystDashboard, formatDateTime } from "@/api/elkClient";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CATEGORY_COLORS = [
  "#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#06B6D4", "#F97316", "#84CC16", "#EC4899", "#64748B",
];

const GRADE_STYLES: Record<string, { bg: string; text: string; bar: string }> = {
  "A+": { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", bar: "#10B981" },
  "A-": { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", bar: "#10B981" },
  A:   { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", bar: "#10B981" },
  B:   { bg: "bg-blue-100 dark:bg-blue-900/40",       text: "text-blue-700 dark:text-blue-300",       bar: "#3B82F6" },
  C:   { bg: "bg-amber-100 dark:bg-amber-900/40",     text: "text-amber-700 dark:text-amber-300",     bar: "#F59E0B" },
  D:   { bg: "bg-orange-100 dark:bg-orange-900/40",   text: "text-orange-700 dark:text-orange-300",   bar: "#F97316" },
  F:   { bg: "bg-red-100 dark:bg-red-900/40",         text: "text-red-700 dark:text-red-300",         bar: "#EF4444" },
};

const gradeBg = (g?: string | null): string => {
  if (!g) return "bg-muted text-muted-foreground";
  const key = Object.keys(GRADE_STYLES).find((k) => g.startsWith(k)) ?? "F";
  const s = GRADE_STYLES[key];
  return `${s.bg} ${s.text}`;
};

const gradeBarColor = (g?: string | null): string => {
  if (!g) return "#64748B";
  const key = Object.keys(GRADE_STYLES).find((k) => g.startsWith(k)) ?? "F";
  return GRADE_STYLES[key].bar;
};

const scoreColor = (s: number): string =>
  s >= 80 ? "#10B981" : s >= 60 ? "#3B82F6" : s >= 40 ? "#F59E0B" : "#EF4444";

const fmt = (b: { key: string | number | boolean }): string =>
  b.key === true || b.key === "true" ? "Enabled"
  : b.key === false || b.key === "false" ? "Disabled"
  : String(b.key);

// ---------------------------------------------------------------------------
// Reusable UI components
// ---------------------------------------------------------------------------

const Card: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  collapsible?: boolean;
}> = ({ title, subtitle, icon, children, className = "", collapsible = false }) => {
  const [open, setOpen] = useState(true);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={`rounded-xl border bg-card text-card-foreground shadow-sm ${className}`}
    >
      <div
        className={`flex items-center justify-between px-5 pt-5 pb-4 ${collapsible ? "cursor-pointer select-none" : ""}`}
        onClick={collapsible ? () => setOpen((v) => !v) : undefined}
      >
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          {collapsible && (open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden px-5 pb-5"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const Kpi: React.FC<{
  label: string;
  value: string | number;
  hint?: string;
  iconBg: string;
  icon: React.ReactNode;
  progress?: number;
  progressColor?: string;
}> = ({ label, value, hint, iconBg, icon, progress, progressColor = "#2563EB" }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.22 }}
    className="rounded-xl border bg-card shadow-sm p-4 flex flex-col gap-2"
  >
    <div className="flex items-center justify-between">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className={`p-2 rounded-lg ${iconBg}`}>{icon}</div>
    </div>
    <p className="text-3xl font-bold leading-tight">{value}</p>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    {progress !== undefined && (
      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ backgroundColor: progressColor }}
        />
      </div>
    )}
  </motion.div>
);

const ScoreBadge: React.FC<{ score: number }> = ({ score }) => (
  <span
    className="inline-flex items-center font-bold rounded text-xs px-1.5 py-0.5"
    style={{ background: `${scoreColor(score)}22`, color: scoreColor(score) }}
  >
    {score.toFixed(1)}
  </span>
);

const Empty: React.FC<{ msg?: string }> = ({ msg = "No data yet." }) => (
  <div className="py-10 text-center text-sm text-muted-foreground">{msg}</div>
);

const ScoreBar: React.FC<{ value: number; max?: number; color?: string }> = ({
  value, max = 100, color,
}) => (
  <div className="flex items-center gap-2 w-full">
    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${Math.min(100, (value / max) * 100)}%`,
          backgroundColor: color ?? scoreColor(value),
        }}
      />
    </div>
    <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
      {value.toFixed(0)}
    </span>
  </div>
);

// ---------------------------------------------------------------------------
// Chart sub-components
// ---------------------------------------------------------------------------

const SimpleBar: React.FC<{
  data: { key: string | number | boolean; count: number }[];
  color: string;
  horizontal?: boolean;
}> = ({ data, color, horizontal = false }) => {
  if (!data.length) return <Empty />;
  const items = data.map((b) => ({ name: fmt(b), value: b.count }));
  const height = horizontal ? Math.max(220, items.length * 26) : 220;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={items}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ left: horizontal ? 0 : 5, right: 5, top: 5, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        {horizontal ? (
          <>
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          </>
        )}
        <RTooltip />
        <Bar dataKey="value" fill={color} radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};

const STATUS_COLORS: Record<string, string> = {
  Enabled: "#10B981", Disabled: "#EF4444", true: "#10B981", false: "#EF4444",
};

const SimplePie: React.FC<{
  data: { key: string | number | boolean; count: number }[];
  statusPalette?: boolean;
}> = ({ data, statusPalette = false }) => {
  if (!data.length) return <Empty />;
  const items = data.map((b) => ({ name: fmt(b), value: b.count }));
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={items}
          dataKey="value"
          nameKey="name"
          outerRadius={80}
          innerRadius={48}
          paddingAngle={2}
          label={({ percent }) => (percent > 0.06 ? `${(percent * 100).toFixed(0)}%` : "")}
        >
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
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <RTooltip formatter={(v: number) => [`${v} (${((v / total) * 100).toFixed(1)}%)`, ""]} />
      </PieChart>
    </ResponsiveContainer>
  );
};

const GradeBar: React.FC<{
  data: { key: string | number | boolean; count: number }[];
}> = ({ data }) => {
  if (!data.length) return <Empty />;
  const ORDER = ["A+", "A", "A-", "B", "C", "D", "F", "T"];
  const items = data
    .map((b) => ({ grade: String(b.key), count: b.count, color: gradeBarColor(String(b.key)) }))
    .sort((a, b) => ORDER.indexOf(a.grade) - ORDER.indexOf(b.grade));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={items} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="grade" tick={{ fontSize: 12, fontWeight: 600 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <RTooltip />
        <Bar dataKey="count" name="Assets" radius={[4, 4, 0, 0]}>
          {items.map((it, i) => <Cell key={i} fill={it.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const PqcAnalystDashboard: React.FC = () => {
  const [data, setData] = useState<ElkAnalystDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<"hour" | "day" | "week" | "month">("day");
  const [activeTab, setActiveTab] = useState<"domains" | "repos" | "endpoints">("domains");

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
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval]);

  const trend = useMemo(() => {
    if (!data) return [];
    return data.qr_trend.map((p) => {
      const row: any = {
        ts: new Date(p.timestamp).toLocaleDateString(),
        "All Assets": parseFloat(p.avg_readiness.toFixed(1)),
        Vulnerabilities: p.total_vulnerabilities,
      };
      for (const t of p.by_type) {
        row[t.type.charAt(0).toUpperCase() + t.type.slice(1)] = parseFloat(t.avg_readiness.toFixed(1));
      }
      return row;
    });
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <RefreshCw className="animate-spin h-8 w-8 text-purple-500" />
        <p className="text-sm text-muted-foreground">Loading analyst dashboard…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6">
        <Card title="Error loading dashboard" icon={<AlertTriangle className="h-4 w-4 text-red-500" />}>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <Button onClick={load} size="sm">
            <RefreshCw className="h-4 w-4 mr-2" /> Retry
          </Button>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { kpi, by_asset_type, by_grade, score_by_type, domains, repos, endpoints, at_risk } = data;

  const quantumReadyPct = kpi.unique_assets > 0
    ? Math.round((kpi.quantum_ready_count / kpi.unique_assets) * 100) : 0;

  const TABS = [
    { id: "domains" as const, label: "Domains / TLS",  icon: <Globe className="h-4 w-4" /> },
    { id: "repos" as const,   label: "Repositories",   icon: <GitBranch className="h-4 w-4" /> },
    { id: "endpoints" as const, label: "Endpoints",    icon: <Server className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-5 p-4 md:p-6">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-purple-500" />
            PQC Analyst Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {kpi.total_scans.toLocaleString()} scans · {kpi.unique_assets} unique assets ·
            Last updated {formatDateTime(data.generated_at)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
          <Button onClick={load} size="sm" variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Summary banner ──────────────────────────────────────────── */}
      <div className={`rounded-xl border p-4 flex flex-wrap items-center gap-4 ${
        quantumReadyPct >= 80
          ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30"
          : quantumReadyPct >= 50
          ? "bg-blue-50 border-blue-200 dark:bg-blue-950/30"
          : "bg-red-50 border-red-200 dark:bg-red-950/30"
      }`}>
        <div className={`p-3 rounded-full ${
          quantumReadyPct >= 80 ? "bg-emerald-100" : quantumReadyPct >= 50 ? "bg-blue-100" : "bg-red-100"
        }`}>
          {quantumReadyPct >= 80
            ? <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            : quantumReadyPct >= 50
            ? <ShieldCheck className="h-6 w-6 text-blue-600" />
            : <XCircle className="h-6 w-6 text-red-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">
            {quantumReadyPct >= 80 ? "Good quantum posture"
              : quantumReadyPct >= 50 ? "Partial quantum readiness"
              : "Quantum readiness needs attention"}
          </p>
          <p className="text-sm text-muted-foreground">
            {kpi.quantum_ready_count} of {kpi.unique_assets} assets are quantum-ready ·{" "}
            {kpi.total_vulnerabilities.toLocaleString()} total vulnerabilities ·
            Avg PQC score {kpi.avg_score.toFixed(1)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-3xl font-bold" style={{ color: scoreColor(quantumReadyPct) }}>
            {quantumReadyPct}%
          </p>
          <p className="text-xs text-muted-foreground">quantum ready</p>
        </div>
      </div>

      {/* ── KPI row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi
          label="Total scans"
          value={kpi.total_scans.toLocaleString()}
          icon={<Database className="h-4 w-4 text-blue-600" />}
          iconBg="bg-blue-50 dark:bg-blue-950/40"
        />
        <Kpi
          label="Unique assets"
          value={kpi.unique_assets}
          icon={<Server className="h-4 w-4 text-emerald-600" />}
          iconBg="bg-emerald-50 dark:bg-emerald-950/40"
        />
        <Kpi
          label="Avg PQC score"
          value={kpi.avg_score.toFixed(1)}
          hint="0–100"
          progress={kpi.avg_score}
          progressColor={scoreColor(kpi.avg_score)}
          icon={<ShieldCheck className="h-4 w-4 text-amber-600" />}
          iconBg="bg-amber-50 dark:bg-amber-950/40"
        />
        <Kpi
          label="Avg readiness"
          value={`${kpi.avg_readiness.toFixed(1)}%`}
          hint="quantum ready %"
          progress={kpi.avg_readiness}
          progressColor={scoreColor(kpi.avg_readiness)}
          icon={<Activity className="h-4 w-4 text-violet-600" />}
          iconBg="bg-violet-50 dark:bg-violet-950/40"
        />
        <Kpi
          label="Quantum ready"
          value={`${kpi.quantum_ready_count}/${kpi.unique_assets}`}
          hint={`${quantumReadyPct}% of assets`}
          progress={quantumReadyPct}
          progressColor="#10B981"
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          iconBg="bg-emerald-50 dark:bg-emerald-950/40"
        />
        <Kpi
          label="Vulnerabilities"
          value={kpi.total_vulnerabilities.toLocaleString()}
          hint={`${kpi.total_findings.toLocaleString()} code findings`}
          icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
          iconBg="bg-red-50 dark:bg-red-950/40"
        />
      </div>

      {/* ── Overview row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Asset distribution" icon={<Layers className="h-4 w-4" />}>
          <SimplePie data={by_asset_type} />
        </Card>

        <Card title="Grade distribution" icon={<Award className="h-4 w-4" />}>
          <GradeBar data={by_grade} />
        </Card>

        <Card title="Score by asset type" icon={<BarChart3 className="h-4 w-4" />}>
          {score_by_type.length === 0 ? <Empty /> : (
            <div className="space-y-3 pt-1">
              {score_by_type.map((row, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium capitalize">{row.type}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{row.scans} scans</span>
                      <ScoreBadge score={row.avg_score} />
                    </div>
                  </div>
                  <ScoreBar value={row.avg_score} color={CATEGORY_COLORS[i]} />
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Readiness {row.avg_readiness.toFixed(1)}%</span>
                    <span>{row.total_vulnerabilities} vulns</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Trend ───────────────────────────────────────────────────── */}
      <Card
        title="Quantum readiness over time"
        subtitle={`Aggregated by ${interval} · split per asset type`}
        icon={<TrendingUp className="h-4 w-4" />}
        collapsible
      >
        {trend.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trend} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <defs>
                {["All Assets", "Domain", "Repo", "Asset"].map((k, i) => (
                  <linearGradient key={k} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={i === 0 ? "#0f172a" : CATEGORY_COLORS[i]} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={i === 0 ? "#0f172a" : CATEGORY_COLORS[i]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="ts" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <RTooltip formatter={(v: number) => [`${v}%`, ""]} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="All Assets" stroke="#0f172a" strokeWidth={2}
                    fill="url(#grad-0)" dot={false} />
              <Area type="monotone" dataKey="Domain" stroke={CATEGORY_COLORS[0]} strokeWidth={1.5}
                    fill="url(#grad-1)" dot={false} />
              <Area type="monotone" dataKey="Repo" stroke={CATEGORY_COLORS[1]} strokeWidth={1.5}
                    fill="url(#grad-2)" dot={false} />
              <Area type="monotone" dataKey="Asset" stroke={CATEGORY_COLORS[3]} strokeWidth={1.5}
                    fill="url(#grad-3)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ── Asset-type tabs ─────────────────────────────────────────── */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-purple-500 text-purple-600 bg-purple-50/50 dark:bg-purple-950/20"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── Domains tab ─────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === "domains" && (
          <motion.div key="domains" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card title="Primary cipher suites" icon={<Lock className="h-4 w-4" />}>
                <SimpleBar data={domains.cipher_suites} color={CATEGORY_COLORS[0]} />
              </Card>
              <Card title="TLS versions in use" icon={<Shield className="h-4 w-4" />}>
                <SimpleBar data={domains.tls_versions} color={CATEGORY_COLORS[1]} />
              </Card>
              <Card title="Public key algorithms" icon={<Cpu className="h-4 w-4" />}>
                <SimplePie data={domains.public_key_algorithms} />
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card title="Top certificate issuers" icon={<Award className="h-4 w-4" />}>
                <SimpleBar data={domains.issuers} color={CATEGORY_COLORS[5]} />
              </Card>

              <Card title="Domain hygiene signals" subtitle="TLS best-practice adoption rates">
                <div className="space-y-3 pt-1">
                  {[
                    { label: "HSTS",                        data: domains.hsts },
                    { label: "OCSP stapling",               data: domains.ocsp_stapling },
                    { label: "Certificate Transparency",    data: domains.ct_present },
                    { label: "Forward secrecy (eph. KEX)",  data: domains.ephemeral_key_exchange },
                  ].map(({ label, data: d }) => {
                    const enabled = d.find((b) => b.key === true || b.key === "true")?.count ?? 0;
                    const disabled = d.find((b) => b.key === false || b.key === "false")?.count ?? 0;
                    const total = enabled + disabled;
                    const pct = total > 0 ? Math.round((enabled / total) * 100) : 0;
                    return (
                      <div key={label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{label}</span>
                          <span className="text-muted-foreground">{enabled}/{total} ({pct}%)</span>
                        </div>
                        <ScoreBar
                          value={pct}
                          color={pct >= 80 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444"}
                        />
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card title="Forward secrecy distribution" icon={<ShieldCheck className="h-4 w-4" />}>
                <SimplePie data={domains.ephemeral_key_exchange} statusPalette />
              </Card>
            </div>
          </motion.div>
        )}

        {/* ── Repos tab ───────────────────────────────────────────── */}
        {activeTab === "repos" && (
          <motion.div key="repos" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card title="Algorithm composition" subtitle="Summed across all repos" icon={<Layers className="h-4 w-4" />}>
                {(() => {
                  const c = repos.composition;
                  const total = c.true_pqc + c.quantum_safe + c.quantum_vulnerable;
                  const rows = [
                    { name: "True PQC",          value: c.true_pqc,            color: "#6D28D9" },
                    { name: "Quantum safe",       value: c.quantum_safe,        color: "#10B981" },
                    { name: "Quantum vulnerable", value: c.quantum_vulnerable,  color: "#EF4444" },
                  ];
                  return (
                    <div className="space-y-3 pt-1">
                      {rows.map((r) => (
                        <div key={r.name} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{r.name}</span>
                            <span className="text-muted-foreground text-xs">
                              {r.value.toLocaleString()}
                              {total > 0 && ` (${((r.value / total) * 100).toFixed(1)}%)`}
                            </span>
                          </div>
                          <ScoreBar value={total > 0 ? (r.value / total) * 100 : 0} color={r.color} />
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground pt-1 text-right">
                        {total.toLocaleString()} total algorithms
                      </p>
                    </div>
                  );
                })()}
              </Card>

              <Card title="Platforms" icon={<GitBranch className="h-4 w-4" />}>
                <SimplePie data={repos.platforms} />
              </Card>

              <Card title="Top vulnerable algorithms" icon={<AlertTriangle className="h-4 w-4" />}>
                <SimpleBar data={repos.vulnerable_algorithms} color={CATEGORY_COLORS[3]} />
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card title="All algorithm names" subtitle="Most frequently found across repos">
                <SimpleBar data={repos.algorithm_names} color={CATEGORY_COLORS[4]} />
              </Card>

              <Card title="Findings per repository" subtitle="Top 15 by finding count">
                {repos.findings_by_repo.length === 0 ? <Empty /> : (
                  <div className="space-y-2 pt-1">
                    {repos.findings_by_repo.slice(0, 15).map((r, i) => (
                      <div key={i} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium truncate max-w-[60%]" title={r.repo}>
                            {r.repo.replace(/^https?:\/\/(www\.)?github\.com\//, "")}
                          </span>
                          <span className="text-muted-foreground">{r.findings.toLocaleString()} findings</span>
                        </div>
                        <ScoreBar
                          value={r.findings}
                          max={repos.findings_by_repo[0].findings}
                          color={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </motion.div>
        )}

        {/* ── Endpoints tab ───────────────────────────────────────── */}
        {activeTab === "endpoints" && (
          <motion.div key="endpoints" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Total cert stores",  value: endpoints.total_certificate_stores.toLocaleString(), icon: <Database className="h-4 w-4 text-blue-600" />,    bg: "bg-blue-50 dark:bg-blue-950/40" },
                { label: "Weak providers",     value: endpoints.total_weak_providers.toLocaleString(),     icon: <AlertTriangle className="h-4 w-4 text-red-600" />, bg: "bg-red-50 dark:bg-red-950/40" },
                { label: "Weak ciphers",       value: endpoints.total_weak_ciphers.toLocaleString(),       icon: <XCircle className="h-4 w-4 text-orange-600" />,    bg: "bg-orange-50 dark:bg-orange-950/40" },
                { label: "FIPS-enabled hosts", value: `${endpoints.fips.find((b) => b.key === true || b.key === "true")?.count ?? 0}`, icon: <ShieldCheck className="h-4 w-4 text-emerald-600" />, bg: "bg-emerald-50 dark:bg-emerald-950/40" },
              ].map((k, i) => (
                <Kpi key={i} label={k.label} value={k.value} icon={k.icon} iconBg={k.bg} />
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card title="Operating systems" icon={<Server className="h-4 w-4" />}>
                <SimplePie data={endpoints.os} />
              </Card>
              <Card title="Architectures" icon={<Cpu className="h-4 w-4" />}>
                <SimplePie data={endpoints.architectures} />
              </Card>
              <Card title="FIPS mode distribution">
                <SimplePie data={endpoints.fips} statusPalette />
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card title="Weak providers by host" subtitle="Hosts with most legacy crypto providers">
                {endpoints.weak_providers_by_host.length === 0 ? <Empty /> : (
                  <div className="space-y-2 pt-1">
                    {endpoints.weak_providers_by_host.map((r, i) => (
                      <div key={i} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium truncate max-w-[65%]" title={r.host}>{r.host}</span>
                          <span className="text-muted-foreground">{r.weak_providers} weak</span>
                        </div>
                        <ScoreBar
                          value={r.weak_providers}
                          max={endpoints.weak_providers_by_host[0].weak_providers}
                          color="#EF4444"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Weak ciphers by host" subtitle="Hosts with most deprecated cipher suites">
                {endpoints.weak_ciphers_by_host.length === 0 ? <Empty /> : (
                  <div className="space-y-2 pt-1">
                    {endpoints.weak_ciphers_by_host.map((r, i) => (
                      <div key={i} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium truncate max-w-[65%]" title={r.host}>{r.host}</span>
                          <span className="text-muted-foreground">{r.weak_ciphers} ciphers</span>
                        </div>
                        <ScoreBar
                          value={r.weak_ciphers}
                          max={endpoints.weak_ciphers_by_host[0].weak_ciphers}
                          color="#F97316"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── At-risk table ───────────────────────────────────────────── */}
      <Card
        title="At-risk assets"
        subtitle="Sorted by lowest PQC score · assets most needing remediation"
        icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
        collapsible
      >
        {at_risk.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {["Asset", "Type", "Grade", "PQC Score", "Readiness", "Vulns", "Scans"].map((h) => (
                    <th key={h} className={`py-2 px-3 text-xs uppercase text-muted-foreground font-medium ${
                      ["Vulns", "Scans"].includes(h) ? "text-right" : "text-left"
                    }`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {at_risk.map((row, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3 font-medium max-w-[180px] truncate" title={row.label}>
                      {row.label}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground capitalize">
                      {row.type || "—"}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${gradeBg(row.grade)}`}>
                        {row.grade || "—"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 min-w-[140px]">
                      <ScoreBar value={row.avg_score} />
                    </td>
                    <td className="py-2.5 px-3 min-w-[140px]">
                      <ScoreBar value={row.avg_readiness} color={scoreColor(row.avg_readiness)} />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {row.total_vulnerabilities > 0
                        ? <span className="text-red-600 font-semibold">{row.total_vulnerabilities}</span>
                        : <span className="text-emerald-600">0</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted-foreground">{row.scans}</td>
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

export default PqcAnalystDashboard;
