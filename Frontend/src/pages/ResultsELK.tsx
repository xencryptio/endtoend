// ============================================================================
// RESULTS ELK — Browse all scan results from Elasticsearch
// ============================================================================
// Filterable, paginated browser. Click any row to view full timeline.
// ============================================================================

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Database,
  Globe,
  GitBranch,
  Server,
  Search,
  Filter,
  Download,
  RefreshCw,
  Clock,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UnifiedCard } from "@/components/ui/unified";
import { toast } from "sonner";
import {
  elkApi,
  ElkScanDocument,
  gradeColor,
  readinessColor,
  formatDateTime,
} from "@/api/elkClient";
import { cn } from "@/lib/utils";

type AssetType = "all" | "domain" | "repo" | "asset";

const ResultsELK: React.FC = () => {
  const navigate = useNavigate();
  const [type, setType] = useState<AssetType>("all");
  const [showHistory, setShowHistory] = useState(false); // true = all docs, false = latest only
  const [docs, setDocs] = useState<ElkScanDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = showHistory
        ? await elkApi.allResults(type, 500)
        : await elkApi.latestResults(type, 500);
      setDocs(res.results);
      setTotal((res as any).total ?? res.count);
    } catch (e: any) {
      toast.error(`Failed to load: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [type, showHistory]);

  const filtered = useMemo(() => {
    if (!search) return docs;
    const s = search.toLowerCase();
    return docs.filter(
      (d) =>
        d.asset_label.toLowerCase().includes(s) ||
        d.asset_id.toLowerCase().includes(s) ||
        (d.overall_grade || "").toLowerCase().includes(s)
    );
  }, [docs, search]);

  const exportCsv = () => {
    if (!filtered.length) return;
    const headers = [
      "scan_id",
      "asset_id",
      "asset_type",
      "asset_label",
      "scanned_at",
      "overall_grade",
      "overall_score",
      "quantum_readiness_percentage",
      "quantum_ready",
      "vulnerabilities_count",
    ];
    const rows = filtered.map((d) =>
      headers.map((h) => JSON.stringify((d as any)[h] ?? "")).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `elk-scans-${type}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">Scan Results</h1>
              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">
                ELK
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {showHistory
                ? "Every scan ever recorded (full audit trail)"
                : "Latest result per asset (current state)"}
              {" · "}
              {total} document(s)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button onClick={fetchData} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <UnifiedCard className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Type tabs */}
            <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
              {(["all", "domain", "repo", "asset"] as AssetType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    "px-3 py-1 text-sm rounded-md transition capitalize",
                    type === t
                      ? "bg-white shadow text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t === "all" ? (
                    <Database className="h-3 w-3 inline mr-1" />
                  ) : t === "domain" ? (
                    <Globe className="h-3 w-3 inline mr-1" />
                  ) : t === "repo" ? (
                    <GitBranch className="h-3 w-3 inline mr-1" />
                  ) : (
                    <Server className="h-3 w-3 inline mr-1" />
                  )}
                  {t}
                </button>
              ))}
            </div>

            {/* History toggle */}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showHistory}
                onChange={(e) => setShowHistory(e.target.checked)}
                className="rounded"
              />
              Show full history (audit trail)
            </label>

            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name / grade / id…"
                className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-background"
              />
            </div>
          </div>
        </UnifiedCard>

        {/* Results table */}
        <UnifiedCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Type</th>
                  <th className="text-left py-2 px-3 font-medium">Asset</th>
                  <th className="text-left py-2 px-3 font-medium">Scanned</th>
                  <th className="text-left py-2 px-3 font-medium">Grade</th>
                  <th className="text-left py-2 px-3 font-medium">Readiness</th>
                  <th className="text-left py-2 px-3 font-medium">Vulns</th>
                  <th className="text-right py-2 px-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-muted-foreground"
                    >
                      No documents yet. Trigger a scan and wait for sync (~60 s).
                    </td>
                  </tr>
                ) : (
                  filtered.map((d) => (
                    <motion.tr
                      key={d.scan_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b hover:bg-muted/40 transition"
                    >
                      <td className="py-3 px-3">
                        <TypeBadge type={d.asset_type} />
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-medium truncate max-w-[260px]" title={d.asset_label}>
                          {d.asset_label}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-[260px]">
                          {d.asset_id}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(d.scanned_at)}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={cn("font-bold text-lg", gradeColor(d.overall_grade))}>
                          {d.overall_grade || "—"}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
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
                          <span className="text-xs">
                            {(d.quantum_readiness_percentage || 0).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {d.vulnerabilities_count > 0 ? (
                          <span className="inline-flex items-center gap-1 text-red-600 text-xs font-medium">
                            <AlertTriangle className="h-3 w-3" />
                            {d.vulnerabilities_count}
                          </span>
                        ) : (
                          <span className="text-emerald-600 text-xs">✓ 0</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() =>
                            navigate(
                              `/elk/history?asset_id=${encodeURIComponent(d.asset_id)}`
                            )
                          }
                          className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium"
                        >
                          Timeline
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </UnifiedCard>
      </div>
    </div>
  );
};

const TypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const cfg: Record<string, { bg: string; label: string; icon: any }> = {
    domain: { bg: "bg-emerald-100 text-emerald-700", label: "Domain", icon: Globe },
    repo: { bg: "bg-blue-100 text-blue-700", label: "Repo", icon: GitBranch },
    asset: { bg: "bg-amber-100 text-amber-700", label: "Asset", icon: Server },
  };
  const c = cfg[type] || { bg: "bg-muted", label: type, icon: Database };
  const Icon = c.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
        c.bg
      )}
    >
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
};

export default ResultsELK;
