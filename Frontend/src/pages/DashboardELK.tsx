// ============================================================================
// DASHBOARD ELK — Reads everything from Elasticsearch via elk-query-api
// ============================================================================
// This is the ELK-backed twin of PQC_DASHBOARD.tsx. Once verified, the old
// Postgres-backed dashboard can be retired.
// ============================================================================

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Shield,
  AlertTriangle,
  TrendingUp,
  Database,
  RefreshCw,
  Globe,
  GitBranch,
  Server,
  Activity,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { UnifiedCard } from "@/components/ui/unified";
import { toast } from "sonner";
import {
  elkApi,
  ElkDashboardResponse,
  ElkGlobalTimelinePoint,
  gradeColor,
  readinessColor,
  formatDateTime,
} from "@/api/elkClient";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------
const SummaryCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: "emerald" | "blue" | "amber" | "red" | "purple";
}> = ({ title, value, subtitle, icon, color }) => {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-200",
    blue: "bg-blue-50 text-blue-600 border-blue-200",
    amber: "bg-amber-50 text-amber-600 border-amber-200",
    red: "bg-red-50 text-red-600 border-red-200",
    purple: "bg-purple-50 text-purple-600 border-purple-200",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <UnifiedCard className={cn("border", colorMap[color])}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-2">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>
            )}
          </div>
          <div className="p-2 rounded-lg bg-white/50">{icon}</div>
        </div>
      </UnifiedCard>
    </motion.div>
  );
};

// ---------------------------------------------------------------------------
// Mini timeline chart (pure SVG — no extra deps)
// ---------------------------------------------------------------------------
const TimelineChart: React.FC<{ points: ElkGlobalTimelinePoint[] }> = ({
  points,
}) => {
  if (!points.length)
    return (
      <div className="text-center text-muted-foreground py-12">
        No timeline data yet. Run a few scans, then refresh.
      </div>
    );

  const W = 700;
  const H = 200;
  const PAD = 30;
  const max = Math.max(100, ...points.map((p) => p.avg_readiness));
  const min = 0;

  const xStep = (W - PAD * 2) / Math.max(1, points.length - 1);
  const yScale = (v: number) =>
    H - PAD - ((v - min) / (max - min)) * (H - PAD * 2);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${PAD + i * xStep} ${yScale(p.avg_readiness)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* axis */}
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#e5e7eb" />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#e5e7eb" />
      {/* path */}
      <path d={path} fill="none" stroke="rgb(16 185 129)" strokeWidth={2} />
      {/* points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={PAD + i * xStep}
            cy={yScale(p.avg_readiness)}
            r={3}
            fill="rgb(16 185 129)"
          />
          <title>
            {new Date(p.timestamp).toLocaleString()}: {p.avg_readiness}% (
            {p.scan_count} scans)
          </title>
        </g>
      ))}
      {/* y labels */}
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <text
            x={PAD - 6}
            y={yScale(v) + 4}
            fontSize="10"
            textAnchor="end"
            fill="#6b7280"
          >
            {v}%
          </text>
          <line
            x1={PAD}
            y1={yScale(v)}
            x2={W - PAD}
            y2={yScale(v)}
            stroke="#f3f4f6"
          />
        </g>
      ))}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const DashboardELK: React.FC = () => {
  const [data, setData] = useState<ElkDashboardResponse | null>(null);
  const [timeline, setTimeline] = useState<ElkGlobalTimelinePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [esConnected, setEsConnected] = useState<boolean | null>(null);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [dash, tl, health] = await Promise.all([
        elkApi.dashboard(),
        elkApi.globalTimeline("day"),
        elkApi.health().catch(() => ({ elasticsearch: false } as any)),
      ]);
      setData(dash);
      setTimeline(tl.timeline);
      setEsConnected(!!health.elasticsearch);
      setLastRefresh(new Date());
    } catch (e: any) {
      console.error(e);
      toast.error(`ELK API error: ${e.message || e}`);
      setEsConnected(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, []);

  const s = data?.summary;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                PQC Dashboard
              </h1>
              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">
                ELK · Audit Trail
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time view powered by Elasticsearch · every scan stored
              immutably for compliance
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs">
              <p className="text-muted-foreground">Elasticsearch</p>
              <p
                className={cn(
                  "font-medium",
                  esConnected ? "text-emerald-600" : "text-red-600"
                )}
              >
                {esConnected === null
                  ? "…"
                  : esConnected
                  ? "Connected"
                  : "Disconnected"}
              </p>
            </div>
            <div className="text-right text-xs">
              <p className="text-muted-foreground">Last refresh</p>
              <p className="font-mono">{lastRefresh.toLocaleTimeString()}</p>
            </div>
            <Button onClick={fetchAll} disabled={loading}>
              <RefreshCw
                className={cn("h-4 w-4 mr-2", loading && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        {s && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <SummaryCard
              title="Total Assets"
              value={s.total_assets}
              subtitle={`${s.domains_count} domains · ${s.repos_count} repos · ${s.assets_count} systems`}
              icon={<Database className="h-5 w-5" />}
              color="blue"
            />
            <SummaryCard
              title="Quantum Ready"
              value={`${s.quantum_ready_count}/${s.total_assets}`}
              subtitle={`${s.quantum_ready_domains} dom · ${s.quantum_ready_repos} repo · ${s.quantum_ready_assets} sys`}
              icon={<Shield className="h-5 w-5" />}
              color="emerald"
            />
            <SummaryCard
              title="Vulnerabilities"
              value={s.total_vulnerabilities}
              subtitle={
                s.total_vulnerabilities === 0 ? "All clear" : "Across all assets"
              }
              icon={<AlertTriangle className="h-5 w-5" />}
              color="red"
            />
            <SummaryCard
              title="Avg PQC Readiness"
              value={`${s.avg_quantum_readiness}%`}
              subtitle={
                s.avg_quantum_readiness >= 75 ? "Excellent" : "Needs improvement"
              }
              icon={<TrendingUp className="h-5 w-5" />}
              color="purple"
            />
          </div>
        )}

        {/* Timeline */}
        <UnifiedCard className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-purple-600" />
              <h3 className="text-lg font-semibold">
                Quantum Readiness Over Time
              </h3>
            </div>
            <span className="text-xs text-muted-foreground">
              Aggregated daily · powered by ES date_histogram
            </span>
          </div>
          <TimelineChart points={timeline} />
        </UnifiedCard>

        {/* Three latest-scan tables */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <LatestSection
            title="Latest Domain Scans"
            icon={<Globe className="h-4 w-4 text-emerald-600" />}
            docs={data?.latest_scans.domains || []}
            primaryLabel="URL"
            primaryKey="asset_label"
          />
          <LatestSection
            title="Latest Repo Scans"
            icon={<GitBranch className="h-4 w-4 text-blue-600" />}
            docs={data?.latest_scans.repos || []}
            primaryLabel="Repo"
            primaryKey="asset_label"
          />
          <LatestSection
            title="Latest Asset Scans"
            icon={<Server className="h-4 w-4 text-amber-600" />}
            docs={data?.latest_scans.assets || []}
            primaryLabel="Host"
            primaryKey="asset_label"
          />
        </div>

        {/* Tip */}
        <UnifiedCard className="mt-6 border-purple-200 bg-purple-50/50">
          <div className="flex items-start gap-3">
            <BarChart3 className="h-5 w-5 text-purple-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-purple-900">
                For deeper analytics, open Kibana:
              </p>
              <p className="text-purple-700 mt-1">
                <a
                  href="http://localhost:5601"
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-mono"
                >
                  http://localhost:5601
                </a>{" "}
                — view raw documents, build custom visualisations, export PDFs.
              </p>
            </div>
          </div>
        </UnifiedCard>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Latest scans section
// ---------------------------------------------------------------------------
const LatestSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  docs: any[];
  primaryLabel: string;
  primaryKey: string;
}> = ({ title, icon, docs, primaryLabel }) => {
  return (
    <UnifiedCard>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="font-semibold">{title}</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {docs.length}
        </span>
      </div>
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No scans indexed yet
        </p>
      ) : (
        <div className="space-y-2">
          {docs.slice(0, 6).map((d) => (
            <div
              key={d.scan_id}
              className="flex items-center gap-3 p-2 rounded hover:bg-muted/50"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" title={d.asset_label}>
                  {d.asset_label}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDateTime(d.scanned_at)}
                </p>
              </div>
              <div className="text-right">
                <p className={cn("font-bold", gradeColor(d.overall_grade))}>
                  {d.overall_grade || "—"}
                </p>
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                  <div
                    className={cn(
                      "h-full",
                      readinessColor(d.quantum_readiness_percentage)
                    )}
                    style={{
                      width: `${d.quantum_readiness_percentage || 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </UnifiedCard>
  );
};

export default DashboardELK;
