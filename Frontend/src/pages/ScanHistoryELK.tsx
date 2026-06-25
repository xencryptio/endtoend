// ============================================================================
// SCAN HISTORY ELK — Trend timeline for a specific asset
// ============================================================================
// "On Jan 1 you were at X. After our remediation, you're now at Y."
// This is the page you show customers.
// ============================================================================

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Clock,
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  Calendar,
  Shield,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  History,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { UnifiedCard } from "@/components/ui/unified";
import { toast } from "sonner";
import {
  elkApi,
  ElkAssetHistory,
  ElkScanDocument,
  gradeColor,
  readinessColor,
  formatDateTime,
} from "@/api/elkClient";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Asset picker — when no asset_id in URL, show a list to choose from
// ---------------------------------------------------------------------------
const AssetPicker: React.FC<{ onPick: (id: string) => void }> = ({ onPick }) => {
  const [docs, setDocs] = useState<ElkScanDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    elkApi
      .latestResults("all", 500)
      .then((r) => setDocs(r.results))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = docs.filter(
    (d) =>
      !filter ||
      d.asset_label.toLowerCase().includes(filter.toLowerCase()) ||
      d.asset_id.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <UnifiedCard>
      <div className="flex items-center gap-2 mb-4">
        <History className="h-5 w-5 text-purple-600" />
        <h3 className="text-lg font-semibold">Pick an asset to view its history</h3>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search assets…"
          className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-background"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No assets yet
        </p>
      ) : (
        <div className="max-h-[480px] overflow-y-auto divide-y">
          {filtered.map((d) => (
            <button
              key={d.asset_id}
              onClick={() => onPick(d.asset_id)}
              className="w-full text-left flex items-center gap-3 p-3 hover:bg-muted/50 transition"
            >
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-medium",
                  d.asset_type === "domain"
                    ? "bg-emerald-100 text-emerald-700"
                    : d.asset_type === "repo"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-amber-100 text-amber-700"
                )}
              >
                {d.asset_type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{d.asset_label}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {d.asset_id}
                </p>
              </div>
              <span className={cn("font-bold", gradeColor(d.overall_grade))}>
                {d.overall_grade || "—"}
              </span>
            </button>
          ))}
        </div>
      )}
    </UnifiedCard>
  );
};

// ---------------------------------------------------------------------------
// Timeline line chart (SVG, no deps)
// ---------------------------------------------------------------------------
const HistoryChart: React.FC<{ history: ElkAssetHistory }> = ({ history }) => {
  const pts = history.timeline;
  if (pts.length < 2)
    return (
      <p className="text-center text-muted-foreground py-12">
        Need at least 2 scans to draw a trend. Rescan to build history.
      </p>
    );

  const W = 800;
  const H = 250;
  const PAD = 40;

  const xs = pts.map((p) => new Date(p.scanned_at).getTime());
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xRange = xMax - xMin || 1;

  const scaleX = (t: number) => PAD + ((t - xMin) / xRange) * (W - PAD * 2);
  const scaleY = (v: number) => H - PAD - (v / 100) * (H - PAD * 2);

  const path = pts
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${scaleX(new Date(p.scanned_at).getTime())} ${scaleY(
          p.quantum_readiness_percentage || 0
        )}`
    )
    .join(" ");

  const fillPath =
    `${path} L ${scaleX(xMax)} ${H - PAD} L ${scaleX(xMin)} ${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(168 85 247)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="rgb(168 85 247)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* y grid */}
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line
            x1={PAD}
            y1={scaleY(v)}
            x2={W - PAD}
            y2={scaleY(v)}
            stroke="#f3f4f6"
          />
          <text x={PAD - 8} y={scaleY(v) + 4} fontSize="10" textAnchor="end" fill="#6b7280">
            {v}%
          </text>
        </g>
      ))}
      {/* axes */}
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#d1d5db" />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#d1d5db" />
      {/* area + line */}
      <path d={fillPath} fill="url(#trendGrad)" />
      <path d={path} fill="none" stroke="rgb(147 51 234)" strokeWidth={2.5} />
      {/* points */}
      {pts.map((p, i) => (
        <g key={i}>
          <circle
            cx={scaleX(new Date(p.scanned_at).getTime())}
            cy={scaleY(p.quantum_readiness_percentage || 0)}
            r={4}
            fill="rgb(147 51 234)"
            stroke="white"
            strokeWidth={2}
          />
          <title>
            {new Date(p.scanned_at).toLocaleString()} —{" "}
            {(p.quantum_readiness_percentage || 0).toFixed(1)}% (grade{" "}
            {p.overall_grade || "—"})
          </title>
        </g>
      ))}
      {/* x labels */}
      {pts.map(
        (p, i) =>
          (i === 0 || i === pts.length - 1) && (
            <text
              key={`x${i}`}
              x={scaleX(new Date(p.scanned_at).getTime())}
              y={H - PAD + 16}
              fontSize="10"
              textAnchor={i === 0 ? "start" : "end"}
              fill="#6b7280"
            >
              {new Date(p.scanned_at).toLocaleDateString()}
            </text>
          )
      )}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const ScanHistoryELK: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const assetId = params.get("asset_id") || "";

  const [history, setHistory] = useState<ElkAssetHistory | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHistory = async () => {
    if (!assetId) return;
    try {
      setLoading(true);
      const h = await elkApi.assetHistory(assetId, 200);
      setHistory(h);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [assetId]);

  // No asset selected — show picker
  if (!assetId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">Scan History</h1>
            <p className="text-sm text-muted-foreground mt-1">
              View the full timeline for any asset stored in Elasticsearch
            </p>
          </div>
          <AssetPicker
            onPick={(id) => setParams({ asset_id: id })}
          />
        </div>
      </div>
    );
  }

  const first = history?.timeline[0];
  const latest = history?.timeline[history.timeline.length - 1];
  const delta =
    first && latest
      ? (latest.quantum_readiness_percentage || 0) -
        (first.quantum_readiness_percentage || 0)
      : 0;
  const improved = delta > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/elk/history")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Asset Timeline</h1>
              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">
                ELK · Audit Trail
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-1">{assetId}</p>
          </div>
          <Button onClick={fetchHistory} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {!history || history.scan_count === 0 ? (
          <UnifiedCard className="py-12 text-center">
            <p className="text-muted-foreground">No history found for this asset.</p>
          </UnifiedCard>
        ) : (
          <>
            {/* Summary tiles */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <UnifiedCard>
                <p className="text-xs text-muted-foreground">Scans recorded</p>
                <p className="text-3xl font-bold mt-1">{history.scan_count}</p>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Since {formatDateTime(history.first_scan || undefined)}
                </p>
              </UnifiedCard>
              <UnifiedCard>
                <p className="text-xs text-muted-foreground">First scan</p>
                <p
                  className={cn(
                    "text-3xl font-bold mt-1",
                    gradeColor(first?.overall_grade)
                  )}
                >
                  {first?.overall_grade || "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {(first?.quantum_readiness_percentage || 0).toFixed(1)}% ready
                </p>
              </UnifiedCard>
              <UnifiedCard>
                <p className="text-xs text-muted-foreground">Latest scan</p>
                <p
                  className={cn(
                    "text-3xl font-bold mt-1",
                    gradeColor(latest?.overall_grade)
                  )}
                >
                  {latest?.overall_grade || "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {(latest?.quantum_readiness_percentage || 0).toFixed(1)}% ready
                </p>
              </UnifiedCard>
              <UnifiedCard
                className={cn(
                  improved
                    ? "border-emerald-200 bg-emerald-50"
                    : delta < 0
                    ? "border-red-200 bg-red-50"
                    : ""
                )}
              >
                <p className="text-xs text-muted-foreground">Change</p>
                <p
                  className={cn(
                    "text-3xl font-bold mt-1 flex items-center gap-1",
                    improved ? "text-emerald-600" : delta < 0 ? "text-red-600" : ""
                  )}
                >
                  {improved ? <TrendingUp className="h-6 w-6" /> : delta < 0 ? <TrendingDown className="h-6 w-6" /> : null}
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {improved
                    ? "Posture improved 🎉"
                    : delta < 0
                    ? "Posture regressed"
                    : "No change"}
                </p>
              </UnifiedCard>
            </div>

            {/* Trend chart */}
            <UnifiedCard className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-purple-600" />
                <h3 className="text-lg font-semibold">
                  Quantum Readiness Over Time
                </h3>
              </div>
              <HistoryChart history={history} />
            </UnifiedCard>

            {/* Full timeline list */}
            <UnifiedCard>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Scan-by-scan log</h3>
                <span className="ml-auto text-xs text-muted-foreground">
                  {history.scan_count} document(s) · oldest first
                </span>
              </div>

              <div className="space-y-2">
                {history.timeline.map((t, i) => {
                  const prev = i > 0 ? history.timeline[i - 1] : null;
                  const diff = prev
                    ? (t.quantum_readiness_percentage || 0) -
                      (prev.quantum_readiness_percentage || 0)
                    : 0;
                  return (
                    <motion.div
                      key={t.scan_id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="flex items-center gap-4 p-3 rounded border bg-white/50"
                    >
                      <div className="w-12 text-center">
                        <p className="text-xs text-muted-foreground">Scan</p>
                        <p className="font-mono text-sm font-bold">#{i + 1}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {formatDateTime(t.scanned_at)}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          scan_id: {t.scan_id}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className={cn("font-bold text-xl", gradeColor(t.overall_grade))}>
                          {t.overall_grade || "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">grade</p>
                      </div>
                      <div className="text-center w-24">
                        <p className="font-bold">
                          {(t.quantum_readiness_percentage || 0).toFixed(1)}%
                        </p>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                          <div
                            className={cn(
                              "h-full",
                              readinessColor(t.quantum_readiness_percentage)
                            )}
                            style={{
                              width: `${t.quantum_readiness_percentage || 0}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="w-16 text-center">
                        {prev && (
                          <span
                            className={cn(
                              "inline-flex items-center text-xs font-medium",
                              diff > 0
                                ? "text-emerald-600"
                                : diff < 0
                                ? "text-red-600"
                                : "text-muted-foreground"
                            )}
                          >
                            {diff > 0 ? "+" : ""}
                            {diff.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div className="w-12 text-right">
                        {t.quantum_ready ? (
                          <CheckCircle className="h-5 w-5 text-emerald-500 inline" />
                        ) : (
                          <Shield className="h-5 w-5 text-amber-500 inline" />
                        )}
                      </div>
                      <div className="w-16 text-right">
                        {(t.vulnerabilities_count || 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 text-red-600 text-xs font-medium">
                            <AlertTriangle className="h-3 w-3" />
                            {t.vulnerabilities_count}
                          </span>
                        ) : (
                          <span className="text-emerald-600 text-xs">✓</span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </UnifiedCard>
          </>
        )}
      </div>
    </div>
  );
};

export default ScanHistoryELK;
