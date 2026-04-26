import { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { getAllDashboards, updateAppStatus, getPQCTrend } from "@/api/dashboard";
import { computeProfileAdjustmentFactor } from "@/data/algorithmLibrary";
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  Activity, Shield, AlertTriangle, CheckCircle, TrendingUp,
  Building2, ArrowRight, Zap, Lock, Server, Code2,
  AlertOctagon, Globe, GitBranch, Cpu, ChevronRight, Wifi, WifiOff
} from "lucide-react";
import type { OrganizationDashboard, ApplicationSummary } from "@/types/dashboardTypes";
import { dedupeApplications, getRiskBadgeClass, getScoreTextClass } from "@/utils/dashboardUtils";

// ── helpers ──────────────────────────────────────────────────────────────────
const RISK_COLORS: Record<string, string> = {
  Low: "#10b981", Medium: "#f59e0b", High: "#f97316", "Very High": "#ef4444",
};

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.5rem",
    fontSize: "12px",
  },
};

function ScoreArc({ value }: { value: number }) {
  const size = 160;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = Math.PI * r; // half-circle
  const offset = circ - (value / 100) * circ;
  const color = value >= 80 ? "#10b981" : value >= 60 ? "#f59e0b" : value >= 40 ? "#f97316" : "#ef4444";
  return (
    <svg width={size} height={size / 2 + stroke} viewBox={`0 0 ${size} ${size / 2 + stroke}`}>
      <path d={`M${stroke / 2},${size / 2} A${r},${r} 0 0 1 ${size - stroke / 2},${size / 2}`}
        fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} strokeLinecap="round" />
      <path d={`M${stroke / 2},${size / 2} A${r},${r} 0 0 1 ${size - stroke / 2},${size / 2}`}
        fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 1s ease, stroke 0.5s ease" }} />
    </svg>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ComponentType<any>; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl border border-border p-5 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-3xl font-bold text-foreground mt-4">{value}</p>
      <p className="text-sm font-medium text-foreground mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </motion.div>
  );
}

// pqc readiness spark mini-bars per suborg
function PQCSparkBar({ score }: { score: number }) {
  const bars = 12;
  const filled = Math.round((score / 100) * bars);
  const color = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : score >= 40 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="flex items-end gap-0.5 h-5">
      {Array.from({ length: bars }).map((_, i) => {
        const height = 6 + (i / (bars - 1)) * 14;
        return (
          <div key={i}
            className={`w-1 rounded-sm transition-all ${i < filled ? color : "bg-muted"}`}
            style={{ height }} />
        );
      })}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
const STATUS_OPTIONS = ["Not Started", "Planned", "In Progress", "Completed", "On Hold"] as const;
const statusColors: Record<string, string> = {
  "Not Started": "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700",
  "Planned": "bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  "In Progress": "bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  "Completed": "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  "On Hold": "bg-purple-100 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedOrg, setSelectedOrg] = useState<OrganizationDashboard | null>(null);
  const [hoveredApp, setHoveredApp] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const { data: dashboards, isLoading, error } = useQuery({
    queryKey: ["dashboard-home"],
    queryFn: getAllDashboards,
  });

  const { data: trendRaw } = useQuery({
    queryKey: ["pqc-trend"],
    queryFn: getPQCTrend,
  });

  useEffect(() => {
    if (dashboards && dashboards.length > 0 && !selectedOrg) setSelectedOrg(dashboards[0]);
  }, [dashboards, selectedOrg]);

  // ── Org profile adjustment (from localStorage) ────────────────────────────
  const profileAdjustment = useMemo(() => {
    try {
      const saved = localStorage.getItem('org_algorithm_profile');
      if (!saved) return 1;
      return computeProfileAdjustmentFactor(JSON.parse(saved));
    } catch { return 1; }
  }, []);

  // ── computed (must come before suborgAdjustments) ────────────────────────
  const apps = useMemo(() => dedupeApplications(selectedOrg?.applications ?? []), [selectedOrg]);
  const dist = useMemo(() => {
    const counts = { Low: 0, Medium: 0, High: 0, "Very High": 0 };
    apps.forEach(app => {
      if (app.risk_level in counts) counts[app.risk_level as keyof typeof counts] += 1;
    });
    return counts;
  }, [apps]);
  const rawSummary = useMemo(() => selectedOrg?.summary ?? { total_applications: 0, total_vulnerabilities: 0, secure_applications: 0, pqc_readiness_percent: 0 }, [selectedOrg]);

  // Per-sub-org adjustment factors (sub-org profile → org-wide profile → 1)
  const suborgAdjustments = useMemo(() => {
    const map: Record<string, number> = {};
    apps.forEach(a => {
      const id = a["Sub Org ID"];
      if (id in map) return;
      try {
        const raw = localStorage.getItem(`suborg_algorithm_profile_${id}`);
        if (raw) { map[id] = computeProfileAdjustmentFactor(JSON.parse(raw)); return; }
      } catch {}
      map[id] = profileAdjustment; // fall back to org-wide
    });
    return map;
  }, [apps, profileAdjustment]);

  // Apps with per-sub-org adjusted PQC score
  const adjustedApps = useMemo(() => apps.map(a => ({
    ...a,
    _adjPQC: Math.min(100, Math.round(a.pqc_ready * (suborgAdjustments[a["Sub Org ID"]] ?? profileAdjustment) * 10) / 10),
  })), [apps, suborgAdjustments, profileAdjustment]);

  const hasCustomProfile = profileAdjustment !== 1 || Object.values(suborgAdjustments).some(f => f !== 1);

  // Summary uses average of per-sub-org adjusted PQC scores
  const summary = useMemo(() => {
    if (!adjustedApps.length) return rawSummary;
    const totalApplications = adjustedApps.length;
    const totalVulnerabilities = adjustedApps.reduce((sum, app) => sum + (app.vulnerabilities || 0), 0);
    const secureApplications = adjustedApps.filter(app => app._adjPQC >= 80).length;
    const avgPQC = adjustedApps.reduce((sum, app) => sum + app._adjPQC, 0) / totalApplications;

    return {
      total_applications: totalApplications,
      total_vulnerabilities: totalVulnerabilities,
      secure_applications: secureApplications,
      pqc_readiness_percent: Math.min(100, Math.round(avgPQC * 10) / 10),
    };
  }, [rawSummary, adjustedApps]);
  const orgName = selectedOrg?.organization_name ?? "Organization";

  // build trend data \u2014 use adjusted combined PQC readiness for current month
  const trendData = useMemo(() => {
    if (!trendRaw) return [];
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return trendRaw.map((t: { month: string; pqc: number | null }) => {
      const [, m] = t.month.split("-");
      // Override current month with the adjusted combined PQC readiness from dashboard
      const pqcValue = t.month === currentKey && summary.pqc_readiness_percent > 0
        ? summary.pqc_readiness_percent
        : t.pqc;
      return { name: monthNames[parseInt(m, 10) - 1], pqc: pqcValue };
    });
  }, [trendRaw, summary.pqc_readiness_percent]);

  // sub-org aggregation — uses per-sub-org adjusted PQC
  const subOrgData = useMemo(() => {
    const map: Record<string, { name: string; id: string; apps: number; vulns: number; pqcScores: number[] }> = {};
    adjustedApps.forEach(a => {
      const id = a["Sub Org ID"]; const name = a["Sub Org"];
      if (!map[id]) map[id] = { name, id, apps: 0, vulns: 0, pqcScores: [] };
      map[id].apps++;
      map[id].vulns += a.vulnerabilities || 0;
      map[id].pqcScores.push(a._adjPQC);
    });
    return Object.values(map).map(o => ({
      ...o,
      avgPQC: o.pqcScores.length ? Math.round(o.pqcScores.reduce((a, b) => a + b, 0) / o.pqcScores.length) : 0,
    })).sort((a, b) => b.vulns - a.vulns);
  }, [adjustedApps]);

  // risk distribution pie
  const pieData = [
    { name: "Low", value: dist.Low, color: RISK_COLORS.Low },
    { name: "Medium", value: dist.Medium, color: RISK_COLORS.Medium },
    { name: "High", value: dist.High, color: RISK_COLORS.High },
    { name: "Very High", value: dist["Very High"], color: RISK_COLORS["Very High"] },
  ].filter(d => d.value > 0);

  // top-5 apps by vulns (bar chart)
  const topApps = useMemo(() =>
    [...apps].sort((a, b) => b.vulnerabilities - a.vulnerabilities).slice(0, 6).map(a => ({
      name: a.application.length > 14 ? a.application.slice(0, 14) + "…" : a.application,
      vulns: a.vulnerabilities,
      pqc: a.pqc_ready,
    })), [apps]);

  // radar data per sub-org (top 6)
  const radarData = useMemo(() => {
    const top6 = subOrgData.slice(0, 6);
    return top6.map(o => ({
      org: o.name.length > 10 ? o.name.slice(0, 10) + "…" : o.name,
      PQC: o.avgPQC,
      "Low Risk": 100 - (o.vulns * 5),
    }));
  }, [subOrgData]);

  // per-app PQC comparison — per-sub-org adjusted
  const appPQCData = useMemo(() =>
    [...adjustedApps].sort((a, b) => a._adjPQC - b._adjPQC).map(a => ({
      name: a.application.length > 16 ? a.application.slice(0, 16) + "…" : a.application,
      pqc: a._adjPQC,
      vulns: a.vulnerabilities,
    })), [adjustedApps]);

  // overall scan coverage for the banner
  const overallCoverage = useMemo(() => {
    let dt = 0, ds = 0, rt = 0, rs = 0, at = 0, ao = 0;
    apps.forEach(a => {
      const c = a.scan_coverage;
      if (!c) return;
      dt += c.domains_total; ds += c.domains_scanned;
      rt += c.repos_total; rs += c.repos_scanned;
      at += c.assets_total; ao += c.assets_online;
    });
    return { dt, ds, rt, rs, at, ao, total: dt + rt + at, scanned: ds + rs + ao };
  }, [apps]);

  // ── loading / error ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
          <Activity className="w-8 h-8 text-primary" />
        </motion.div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-8 text-center">
        <AlertOctagon className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <p className="text-red-500 font-semibold">Failed to load dashboard</p>
        <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
      </div>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      className="space-y-6 p-4 sm:p-6 max-w-[1600px] mx-auto"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* ── header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <AnimatePresence mode="wait">
            <motion.h1 key={orgName}
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              className="text-3xl font-bold tracking-tight text-foreground"
            >
              {orgName}
            </motion.h1>
          </AnimatePresence>
          <p className="text-sm text-muted-foreground mt-0.5">Post-Quantum Cryptography Security Dashboard</p>
        </div>
        {/* org switcher if multiple */}
        {dashboards && dashboards.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {dashboards.map(d => (
              <button key={d.organization_id}
                onClick={() => setSelectedOrg(d)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedOrg?.organization_id === d.organization_id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                {d.organization_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── custom org profile banner ── */}
      {hasCustomProfile && (() => {
        const customSuborgs = Object.entries(suborgAdjustments).filter(([, f]) => f !== 1);
        return (
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl px-5 py-3 flex items-center gap-3">
            <Shield className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Custom Algorithm Profile Active</p>
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                {customSuborgs.length > 0
                  ? `${customSuborgs.length} sub-org${customSuborgs.length > 1 ? 's' : ''} have custom scoring. Per-sub-org PQC scores are adjusted independently.`
                  : `Org-wide scoring adjustment: ${profileAdjustment > 1 ? "+" : ""}${Math.round((profileAdjustment - 1) * 100)}%.`
                } To reset, go to Profile → Reset All.
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── scan coverage banner ── */}
      {overallCoverage.total > 0 && overallCoverage.scanned < overallCoverage.total && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl px-5 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Partial Scan Coverage</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Scores reflect only completed scans. {overallCoverage.at > 0 && overallCoverage.ao < overallCoverage.at && (
                <span className="font-semibold">{overallCoverage.at - overallCoverage.ao} of {overallCoverage.at} asset{overallCoverage.at > 1 ? 's' : ''} offline — agent not installed or unreachable. </span>
              )}{overallCoverage.dt > 0 && overallCoverage.ds < overallCoverage.dt && (
                <span>{overallCoverage.dt - overallCoverage.ds} domain{overallCoverage.dt - overallCoverage.ds > 1 ? 's' : ''} not yet scanned. </span>
              )}{overallCoverage.rt > 0 && overallCoverage.rs < overallCoverage.rt && (
                <span>{overallCoverage.rt - overallCoverage.rs} repo{overallCoverage.rt - overallCoverage.rs > 1 ? 's' : ''} not yet scanned. </span>
              )}
            </p>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            {[{ label: "Domains", done: overallCoverage.ds, total: overallCoverage.dt, icon: Globe },
              { label: "Repos", done: overallCoverage.rs, total: overallCoverage.rt, icon: GitBranch },
              { label: "Assets", done: overallCoverage.ao, total: overallCoverage.at, icon: overallCoverage.ao === overallCoverage.at ? Wifi : WifiOff },
            ].filter(s => s.total > 0).map(s => (
              <div key={s.label} className="text-center">
                <s.icon className={`w-3.5 h-3.5 mx-auto mb-0.5 ${s.done === s.total ? 'text-emerald-500' : 'text-amber-500'}`} />
                <p className="text-[10px] font-bold text-amber-800 dark:text-amber-300">{s.done}/{s.total}</p>
                <p className="text-[9px] text-amber-600 dark:text-amber-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4 stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Total Applications" value={summary.total_applications}
          sub="Across all sub-orgs" color="bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400" />
        <StatCard icon={AlertTriangle} label="Total Vulnerabilities" value={summary.total_vulnerabilities}
          sub="PQC-unsafe findings" color="bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400" />
        <StatCard icon={CheckCircle} label="Secure Applications" value={summary.secure_applications}
          sub={`${summary.total_applications ? Math.round((summary.secure_applications / summary.total_applications) * 100) : 0}% of total`}
          color="bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400" />
        <StatCard icon={Shield} label="PQC Readiness" value={`${summary.pqc_readiness_percent}%`}
          sub="Combined score" color="bg-purple-100 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400" />
      </div>

      {/* ── PQC score arc + trend timeline ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* arc score */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col items-center justify-center">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Quantum Readiness</p>
          <div className="relative">
            <ScoreArc value={summary.pqc_readiness_percent} />
            <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
              <span className={`text-3xl font-black ${getScoreTextClass(summary.pqc_readiness_percent)}`}>
                {summary.pqc_readiness_percent}%
              </span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 w-full text-center text-xs">
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-muted-foreground">Secure</p>
              <p className="font-bold text-emerald-600">{summary.secure_applications}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-muted-foreground">At Risk</p>
              <p className="font-bold text-red-500">{summary.total_applications - summary.secure_applications}</p>
            </div>
          </div>
        </div>

        {/* PQC Readiness Trend — 6-month trajectory timeline */}
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">PQC Readiness Trend</p>
              <p className="text-xs text-muted-foreground">6-month trajectory</p>
            </div>
            <TrendingUp className="w-5 h-5 text-emerald-500" />
          </div>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <Tooltip {...tooltipStyle} formatter={(v: number | null) => v !== null ? [`${v}%`, "PQC Score"] : ["—", "No data"]} />
                <Area type="monotone" dataKey="pqc" stroke="#8b5cf6" strokeWidth={2}
                  fill="url(#trendGrad)" dot={{ r: 4, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 2 }}
                  connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-44 text-muted-foreground text-sm">Loading trend data…</div>
          )}
        </div>
      </div>

      {/* ── PQC Readiness by Application ── */}
      <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-foreground">PQC Readiness by Application</p>
            <p className="text-xs text-muted-foreground">Sorted lowest → highest — all scores from scan results</p>
          </div>
          <Shield className="w-5 h-5 text-purple-500" />
        </div>
        {appPQCData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(120, appPQCData.length * 44)}>
            <BarChart data={appPQCData} barSize={20} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(v: number) => `${v}%`} />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} width={120} />
              <Tooltip {...tooltipStyle} formatter={(v: number, n: string) => n === "pqc" ? [`${v}%`, "PQC Score"] : [v, "Vulns"]} />
              <Bar dataKey="pqc" radius={[0, 4, 4, 0]} name="PQC Score">
                {appPQCData.map((entry, i) => (
                  <Cell key={i} fill={entry.pqc >= 80 ? "#10b981" : entry.pqc >= 60 ? "#f59e0b" : entry.pqc >= 40 ? "#f97316" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No application data yet</div>
        )}
      </div>

      {/* ── risk pie + vuln bar chart ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* risk pie */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Risk Distribution</p>
              <p className="text-xs text-muted-foreground">Applications by risk level</p>
            </div>
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          {pieData.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                    paddingAngle={3} dataKey="value">
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip {...tooltipStyle} formatter={(v: number, n: string) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-xs text-muted-foreground flex-1">{d.name}</span>
                    <span className="text-xs font-bold text-foreground">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No risk data yet</div>
          )}
        </div>

        {/* top-6 vuln bar + pqc */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Top Vulnerable Applications</p>
              <p className="text-xs text-muted-foreground">Vulnerabilities vs PQC score</p>
            </div>
            <AlertOctagon className="w-5 h-5 text-red-500" />
          </div>
          {topApps.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topApps} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <Tooltip {...tooltipStyle} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="vulns" fill="#ef4444" radius={[4, 4, 0, 0]} name="Vulns" />
                <Bar yAxisId="right" dataKey="pqc" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="PQC %" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No application data yet</div>
          )}
        </div>
      </div>

      {/* ── sub-org radar + sub-org cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* radar */}
        {radarData.length >= 3 && (
          <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Sub-Org Radar</p>
                <p className="text-xs text-muted-foreground">PQC score by department</p>
              </div>
              <Cpu className="w-5 h-5 text-blue-500" />
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="org" fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <PolarRadiusAxis angle={30} domain={[0, 100]} fontSize={9} />
                <Radar name="PQC" dataKey="PQC" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} />
                <Tooltip {...tooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* sub-org cards */}
        <div className={`${radarData.length >= 3 ? "lg:col-span-2" : "lg:col-span-3"} bg-card rounded-2xl border border-border p-6 shadow-sm`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Sub-Organizations</p>
              <p className="text-xs text-muted-foreground">{subOrgData.length} departments</p>
            </div>
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          {subOrgData.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {subOrgData.slice(0, 6).map((org, i) => (
                <motion.button key={org.id}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => navigate(`/suborg/${org.id}`)}
                  className="w-full text-left bg-muted/40 hover:bg-muted/70 rounded-xl p-4 transition-colors group border border-transparent hover:border-border"
                >
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-semibold text-foreground line-clamp-1">{org.name}</p>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all flex-shrink-0" />
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{org.apps} apps · {org.vulns} vulns</span>
                    <span className={`text-xs font-bold ${getScoreTextClass(org.avgPQC)}`}>{org.avgPQC}%</span>
                  </div>
                  <PQCSparkBar score={org.avgPQC} />
                </motion.button>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No sub-organizations found</div>
          )}
        </div>
      </div>

      {/* ── all applications table ── */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">All Applications</p>
            <p className="text-xs text-muted-foreground mt-0.5">{adjustedApps.length} total — click to view detail</p>
          </div>
          <Code2 className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                {["Application", "Sub-Org", "PQC Score", "Vulns", "Risk", "Scan Coverage", "Status", ""].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {adjustedApps.map((app, i) => (
                <motion.tr key={app["Application ID"]}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  onMouseEnter={() => setHoveredApp(app["Application ID"])}
                  onMouseLeave={() => setHoveredApp(null)}
                  onClick={() => navigate(`/app/${app["Application ID"]}`)}
                  className={`cursor-pointer transition-colors ${hoveredApp === app["Application ID"] ? "bg-muted/50" : ""}`}
                >
                  <td className="px-5 py-3.5 font-medium text-foreground whitespace-nowrap">{app.application}</td>
                  <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">{app["Sub Org"]}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                          style={{ width: `${(app as any)._adjPQC ?? app.pqc_ready}%`, background: ((app as any)._adjPQC ?? app.pqc_ready) >= 80 ? "#10b981" : ((app as any)._adjPQC ?? app.pqc_ready) >= 60 ? "#f59e0b" : "#ef4444" }} />
                      </div>
                      <span className={`font-semibold tabular-nums ${getScoreTextClass((app as any)._adjPQC ?? app.pqc_ready)}`}>{(app as any)._adjPQC ?? app.pqc_ready}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`font-semibold ${app.vulnerabilities > 0 ? "text-red-500" : "text-emerald-500"}`}>{app.vulnerabilities}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${getRiskBadgeClass(app.risk_level)}`}>{app.risk_level}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    {app.scan_coverage ? (
                      <div className="flex items-center gap-1.5">
                        {[{ label: "D", done: app.scan_coverage.domains_scanned, total: app.scan_coverage.domains_total },
                          { label: "R", done: app.scan_coverage.repos_scanned, total: app.scan_coverage.repos_total },
                          { label: "A", done: app.scan_coverage.assets_online, total: app.scan_coverage.assets_total },
                        ].filter(s => s.total > 0).map(s => (
                          <span key={s.label}
                            title={`${s.label === "D" ? "Domains" : s.label === "R" ? "Repos" : "Assets"}: ${s.done}/${s.total}`}
                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold border ${
                              s.done >= s.total
                                ? "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 border-emerald-200 dark:border-emerald-800"
                                : s.done > 0
                                  ? "bg-amber-100 dark:bg-amber-950/30 text-amber-600 border-amber-200 dark:border-amber-800"
                                  : "bg-red-100 dark:bg-red-950/30 text-red-500 border-red-200 dark:border-red-800"
                            }`}>
                            {s.label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                    <select
                      value={app.status || "Not Started"}
                      disabled={updatingStatus === app["Application ID"]}
                      onChange={async (e) => {
                        const newStatus = e.target.value;
                        setUpdatingStatus(app["Application ID"]);
                        try {
                          await updateAppStatus(app["Application ID"], newStatus);
                          queryClient.invalidateQueries({ queryKey: ["dashboard-home"] });
                        } catch (err) { console.error("Failed to update status", err); }
                        setUpdatingStatus(null);
                      }}
                      className={`px-2 py-1 rounded-full text-[11px] font-semibold border cursor-pointer bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/30 ${statusColors[app.status || "Not Started"] || statusColors["Not Started"]}`}
                    >
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <ArrowRight className="w-4 h-4 text-muted-foreground inline-block group-hover:text-foreground" />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          {apps.length === 0 && (
            <div className="py-16 text-center text-muted-foreground text-sm">
              No applications onboarded yet. Start by onboarding a domain or repository.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}