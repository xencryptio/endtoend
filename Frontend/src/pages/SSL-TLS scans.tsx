import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Globe,
  Computer,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Building2,
  GitBranch,
  Play,
  Eye,
  Clock,
  XCircle,
  Plus,
  Monitor,
  Folder,
  AlertCircle,
  Lock,
  Code,
  Wifi,
  Zap,
  Server,
} from "lucide-react";
import { UnifiedCard } from "@/components/ui/unified";
import { cn } from "@/lib/utils";
import WebScan from "@/components/scan/webscan";
import GitScan from "@/components/git-scan/git-scan";
import { toast } from "sonner";

// ============================================================================
// CONSTANTS
// ============================================================================

const DB_API          = (import.meta.env.VITE_DB_API_URL          as string | undefined) || "http://localhost:8001";
const ONBOARDING_API  = (import.meta.env.VITE_ONBOARDING_API_URL   as string | undefined) || "http://localhost:8008";
const SYSTEM_SCAN_API = (import.meta.env.VITE_SYSTEM_SCAN_API_URL  as string | undefined) || "http://localhost:9000";
const SCAN_API        = (import.meta.env.VITE_SCAN_API_URL         as string | undefined) || "http://localhost:8000";
const REPO_SCAN_API   = (import.meta.env.VITE_REPO_SCAN_API_URL    as string | undefined) || "http://localhost:8003";

// ============================================================================
// TYPES
// ============================================================================

type MainView  = "scan-center" | "webscan-full" | "gitscan-full" | "selectedscan";
type MainTab   = "single" | "bulk" | "schedule";
type AssetType = "endpoint" | "url" | "repo";

interface RepoItem   { id: string; repo_url: string; repo_name?: string; branch_to_scan?: string; }
interface DomainItem { id: string; domain: string; }
interface ServerItem { id: string; server_name?: string; hostname?: string; ip_address?: string; }
interface OrgNode {
  id: string; organization_name: string;
  repos: RepoItem[]; domains: DomainItem[]; servers: ServerItem[];
  dataLoaded: boolean; loading: boolean; expanded: boolean;
}

interface TLSScanRow  { request_id: string; url?: string; primary_domain?: string; scan_status: string; requested_at: string; quantum_score?: number; quantum_grade?: string; }
interface RepoScanRow { id: number; repo_url: string; branch_name: string; scan_status: string; created_at: string; overall_security_score?: number; quantum_readiness_percentage?: number; overall_grade?: string; }
interface AgentTaskRow { task_id: string; agent_id: string; status: string; created_at: string; }

// ============================================================================
// HELPERS
// ============================================================================

const fmtTime = (s: string): string => {
  try {
    const d = Date.now() - new Date(s).getTime();
    if (d < 60000) return "just now";
    if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
    return `${Math.floor(d / 86400000)}d ago`;
  } catch { return "—"; }
};

const gradeColor = (g?: string): string => {
  if (!g) return "text-muted-foreground";
  const u = g.toUpperCase();
  if (u.startsWith("A")) return "text-emerald-500";
  if (u.startsWith("B")) return "text-blue-500";
  if (u.startsWith("C")) return "text-amber-500";
  if (u.startsWith("D")) return "text-orange-500";
  return "text-red-500";
};

const StatusDot: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case "completed": case "cached":
      return <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />;
    case "failed": case "http_skipped":
      return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
    case "in_progress":
      return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin shrink-0" />;
    case "pending":
      return <Clock className="h-4 w-4 text-amber-500 shrink-0" />;
    default:
      return <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
};

const sLabel = (s: string) =>
  ({ completed: "Completed", cached: "Cached", failed: "Failed", pending: "Queued", in_progress: "In Progress", http_skipped: "Skipped" }[s] ?? s);

const fmtRepo = (url: string): string => {
  try { return url.replace(/^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\//, "").replace(/\.git$/, ""); }
  catch { return url; }
};

// ============================================================================
// INLINE HISTORY — TLS / URL SCANS
// ============================================================================

const InlineTLSHistory: React.FC<{ onView: (domain?: string) => void; refreshKey: number }> = ({ onView, refreshKey }) => {
  const [scans, setScans] = useState<TLSScanRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${SCAN_API}/results`)
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        const arr: any[] = Array.isArray(d) ? d : (d?.results ?? []);
        setScans(arr.slice(0, 8).map((r: any) => ({
          request_id: r.request_id || String(r.id),
          url: r.url,
          primary_domain: r.url,
          scan_status: r.status === "processing" ? "in_progress" : (r.status ?? "pending"),
          requested_at: r.created_at || r.requested_at || "",
          quantum_score: r.pqc_analysis?.overall_score ?? r.quantum_score,
          quantum_grade: r.pqc_analysis?.overall_grade ?? r.quantum_grade,
        })));
      })
      .catch(() => setScans([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
      <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading history…</span>
    </div>
  );
  if (!scans.length) return (
    <p className="py-8 text-center text-sm text-muted-foreground">No TLS scans yet. Run your first scan above.</p>
  );

  return (
    <div className="space-y-1.5">
      {scans.map(s => (
        <div key={s.request_id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/40 hover:bg-muted/30 hover:border-border/70 transition-colors">
          <StatusDot status={s.scan_status} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{s.url || s.primary_domain || "Unknown"}</p>
            <p className="text-xs text-muted-foreground">{fmtTime(s.requested_at)} · {sLabel(s.scan_status)}</p>
          </div>
          {s.quantum_grade && <span className={`text-sm font-bold tabular-nums shrink-0 ${gradeColor(s.quantum_grade)}`}>{s.quantum_grade}</span>}
          {s.quantum_score != null && <span className="text-xs text-muted-foreground tabular-nums shrink-0 hidden sm:inline">{s.quantum_score.toFixed(0)}/100</span>}
          {s.scan_status === "completed" && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 shrink-0" onClick={() => onView(s.url || s.primary_domain)}>
              <Eye className="h-3 w-3" /> View
            </Button>
          )}
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// INLINE HISTORY — REPOSITORY SCANS
// ============================================================================

const InlineRepoHistory: React.FC<{ onView: (repo?: string) => void; refreshKey: number }> = ({ onView, refreshKey }) => {
  const [scans, setScans] = useState<RepoScanRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${REPO_SCAN_API}/api/scans?limit=8`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setScans(Array.isArray(d) ? d.slice(0, 8) : (d?.scans ?? []).slice(0, 8)))
      .catch(() => setScans([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
      <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading history…</span>
    </div>
  );
  if (!scans.length) return (
    <p className="py-8 text-center text-sm text-muted-foreground">No repository scans yet. Run your first scan above.</p>
  );

  return (
    <div className="space-y-1.5">
      {scans.map(s => (
        <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/40 hover:bg-muted/30 hover:border-border/70 transition-colors">
          <StatusDot status={s.scan_status} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{fmtRepo(s.repo_url)}</p>
            <p className="text-xs text-muted-foreground">{s.branch_name || "main"} · {fmtTime(s.created_at)} · {sLabel(s.scan_status)}</p>
          </div>
          {s.overall_grade && <span className={`text-sm font-bold tabular-nums shrink-0 ${gradeColor(s.overall_grade)}`}>{s.overall_grade}</span>}
          {s.quantum_readiness_percentage != null && <span className="text-xs text-muted-foreground tabular-nums shrink-0 hidden sm:inline">PQC {Math.round(s.quantum_readiness_percentage)}%</span>}
          {(s.scan_status === "completed" || s.scan_status === "cached") && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 shrink-0" onClick={() => onView(s.repo_url)}>
              <Eye className="h-3 w-3" /> View
            </Button>
          )}
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// INLINE HISTORY — ENDPOINT / AGENT SCANS
// ============================================================================

interface AgentRow { agent_id: string; hostname: string; ip_address: string; status: string; last_seen: string; }

const InlineAgentHistory: React.FC<{ onView: () => void; refreshKey: number }> = ({ onView, refreshKey }) => {
  const [agents,   setAgents]   = useState<AgentRow[]>([]);
  const [tasks,    setTasks]    = useState<AgentTaskRow[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${SYSTEM_SCAN_API}/api/v1/admin/agents`).then(r => r.ok ? r.json() : { agents: [] }),
      fetch(`${SYSTEM_SCAN_API}/api/v1/admin/tasks`).then(r => r.ok ? r.json() : { tasks: [] }),
    ])
      .then(([agentsData, tasksData]) => {
        setAgents((agentsData?.agents ?? []).slice(0, 8));
        setTasks(tasksData?.tasks ?? []);
      })
      .catch(() => { setAgents([]); setTasks([]); })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
      <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading agents…</span>
    </div>
  );
  if (!agents.length) return (
    <p className="py-8 text-center text-sm text-muted-foreground">No agents registered yet. Install an agent on your endpoint to begin.</p>
  );

  return (
    <div className="space-y-1.5">
      {agents.map(a => {
        const agentTasks  = tasks.filter(t => t.agent_id === a.agent_id);
        const pending     = agentTasks.filter(t => t.status === "pending" || t.status === "in_progress").length;
        const completed   = agentTasks.filter(t => t.status === "completed").length;
        const isActive    = a.status === "active";
        return (
          <div key={a.agent_id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/40 hover:bg-muted/30 hover:border-border/70 transition-colors">
            <span className={cn("h-2 w-2 rounded-full shrink-0", isActive ? "bg-emerald-500" : "bg-muted-foreground/40")} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{a.hostname || a.ip_address}</p>
              <p className="text-xs text-muted-foreground">
                {a.ip_address}{a.last_seen ? ` · seen ${fmtTime(a.last_seen)}` : ""}
                {pending > 0 ? ` · ${pending} pending` : ""}
                {completed > 0 ? ` · ${completed} done` : ""}
              </p>
            </div>
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium shrink-0", isActive ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
              {isActive ? "Active" : "Inactive"}
            </span>
            {completed > 0 && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 shrink-0" onClick={onView}>
                <Eye className="h-3 w-3" /> View
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// SINGLE ASSET TAB
// ============================================================================

const ASSET_CONFIGS = [
  { id: "endpoint" as AssetType, icon: Monitor,  label: "Endpoint",   hint: "IP or hostname", iconClass: "text-amber-600 dark:text-amber-400",  bgClass: "bg-amber-50 dark:bg-amber-900/10",  scanDesc: "Scans: cipher suites, cert store, TLS config, key lengths via installed agent." },
  { id: "url"      as AssetType, icon: Globe,    label: "HTTPS URL",  hint: "Full URL",        iconClass: "text-blue-600 dark:text-blue-400",    bgClass: "bg-blue-50 dark:bg-blue-900/10",    scanDesc: "Scans: TLS version, cipher negotiation, cert chain, key algorithm + length, expiry." },
  { id: "repo"     as AssetType, icon: Folder,   label: "Repository", hint: "org/repo",        iconClass: "text-yellow-600 dark:text-yellow-500", bgClass: "bg-yellow-50 dark:bg-yellow-900/10", scanDesc: "Scans: hardcoded secrets, weak algorithm calls, insecure library usage, crypto config files." },
] as const;

const SingleAssetTab: React.FC<{
  onOpenWebScan: (domain?: string) => void;
  onOpenGitScan: (repo?: string) => void;
  onOpenAssets: () => void;
}> = ({ onOpenWebScan, onOpenGitScan, onOpenAssets }) => {
  const [assetType,   setAssetType]   = useState<AssetType>("url");
  const [endpointVal, setEndpointVal] = useState("");
  const [urlVal,      setUrlVal]      = useState("");
  const [repoVal,     setRepoVal]     = useState("");
  const [branchVal,   setBranchVal]   = useState("main");
  const [refreshKey,  setRefreshKey]  = useState(0);
  const [availableBranches,    setAvailableBranches]    = useState<string[]>([]);
  const [isFetchingBranches,   setIsFetchingBranches]   = useState(false);
  const [showManualBranch,     setShowManualBranch]     = useState(false);

  const cfg = ASSET_CONFIGS.find(c => c.id === assetType)!;

  const fetchBranches = (url: string) => {
    if (!url.trim()) { setAvailableBranches([]); setShowManualBranch(false); return; }
    setIsFetchingBranches(true);
    fetch(`${REPO_SCAN_API}/api/fetch-branches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: url }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.branches && d.branches.length > 0) {
          setAvailableBranches(d.branches);
          setBranchVal(d.default_branch || "main");
          setShowManualBranch(false);
        } else {
          setAvailableBranches([]);
          setShowManualBranch(true);
        }
      })
      .catch(() => { setAvailableBranches([]); setShowManualBranch(true); })
      .finally(() => setIsFetchingBranches(false));
  };

  useEffect(() => {
    const timer = setTimeout(() => { if (assetType === "repo") fetchBranches(repoVal); }, 600);
    return () => clearTimeout(timer);
  }, [repoVal, assetType]);

  const handleRun = () => {
    if (assetType === "url") {
      if (!urlVal.trim()) { toast.error("Please enter a URL to scan"); return; }
      onOpenWebScan(urlVal.trim());
    } else if (assetType === "repo") {
      if (!repoVal.trim()) { toast.error("Please enter a repository"); return; }
      onOpenGitScan(repoVal.trim());
    } else {
      if (!endpointVal.trim()) { toast.error("Please enter an IP or hostname"); return; }
      onOpenAssets();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">
      {/* ── LEFT: scan form ── */}
      <UnifiedCard className="p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Asset Type</h3>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {ASSET_CONFIGS.map(({ id, icon: Icon, label, hint, iconClass, bgClass }) => {
            const active = assetType === id;
            return (
              <button
                key={id}
                onClick={() => { setAssetType(id); setRefreshKey(k => k + 1); }}
                className={cn(
                  "flex flex-col items-center justify-center p-4 rounded-xl border-2 gap-2.5 transition-all cursor-pointer text-center",
                  active ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-border/80 hover:bg-muted/20"
                )}
              >
                <div className={cn("p-2.5 rounded-xl", active ? "bg-primary/10" : bgClass)}>
                  <Icon className={cn("h-5 w-5", active ? "text-primary" : iconClass)} />
                </div>
                <div>
                  <p className={cn("text-sm font-semibold leading-tight", active ? "text-primary" : "text-foreground")}>{label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
                </div>
              </button>
            );
          })}
        </div>

        {assetType === "endpoint" && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">IP / Hostname</label>
              <Input value={endpointVal} onChange={e => setEndpointVal(e.target.value)} placeholder="10.0.0.1 or server.company.com" className="font-mono text-sm" onKeyDown={e => e.key === "Enter" && handleRun()} />
            </div>
            <p className="text-xs text-muted-foreground">{cfg.scanDesc}</p>
          </div>
        )}

        {assetType === "url" && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">HTTPS URL</label>
              <Input value={urlVal} onChange={e => setUrlVal(e.target.value)} placeholder="https://api.example.com" className="font-mono text-sm" onKeyDown={e => e.key === "Enter" && handleRun()} />
            </div>
            <p className="text-xs text-muted-foreground">{cfg.scanDesc}</p>
          </div>
        )}

        {assetType === "repo" && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Repository</label>
              <Input value={repoVal} onChange={e => setRepoVal(e.target.value)} placeholder="org/repo  or  https://github.com/org/repo" className="font-mono text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Branch</label>
              {isFetchingBranches ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-muted/20 text-sm text-muted-foreground">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Fetching branches...
                </div>
              ) : availableBranches.length > 0 && !showManualBranch ? (
                <select value={branchVal} onChange={e => setBranchVal(e.target.value)} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  {availableBranches.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              ) : (
                <Input value={branchVal} onChange={e => setBranchVal(e.target.value)} placeholder="main" className="font-mono text-sm" />
              )}
              {availableBranches.length > 0 && !showManualBranch && <p className="text-xs text-muted-foreground mt-1">{availableBranches.length} branches available</p>}
              {showManualBranch && repoVal && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Enter branch name manually</p>}
            </div>
            <p className="text-xs text-muted-foreground">{cfg.scanDesc}</p>
          </div>
        )}

        <Button className="w-full mt-5 gap-2 font-medium" onClick={handleRun}>
          <Play className="h-4 w-4 fill-white" /> Run Scan Now
        </Button>
      </UnifiedCard>

      {/* ── RIGHT: history panel ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {assetType === "url"      && "Recent TLS / URL Scans"}
            {assetType === "repo"     && "Recent Repository Scans"}
            {assetType === "endpoint" && "Recent Endpoint Scans"}
          </h3>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => { if (assetType === "url") onOpenWebScan(); else if (assetType === "repo") onOpenGitScan(); else onOpenAssets(); }}>
            View All <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
        <UnifiedCard className="p-4">
          {assetType === "url"      && <InlineTLSHistory   refreshKey={refreshKey} onView={d => onOpenWebScan(d)} />}
          {assetType === "repo"     && <InlineRepoHistory  refreshKey={refreshKey} onView={r => onOpenGitScan(r)} />}
          {assetType === "endpoint" && <InlineAgentHistory refreshKey={refreshKey} onView={onOpenAssets} />}
        </UnifiedCard>
      </div>
    </div>
  );
};

// ============================================================================
// BULK / LOB TAB
// ============================================================================

const SCAN_TYPE_OPTIONS = [
  { id: "endpoint", icon: Monitor, label: "Endpoint Crypto",    desc: "Cipher suites, cert stores, key lengths via agent" },
  { id: "tls",      icon: Lock,    label: "TLS / Certificates", desc: "Protocol version, cert chain, expiry, algorithm" },
  { id: "source",   icon: Code,    label: "Source Code",        desc: "Hardcoded keys, weak algorithm calls, crypto configs" },
  { id: "network",  icon: Wifi,    label: "Network Protocols",  desc: "SSH versions, deprecated protocols" },
] as const;

const BulkLOBTab: React.FC<{ onViewSelectedScan: () => void }> = ({ onViewSelectedScan }) => {
  const [scope,    setScope]    = useState("full");
  const [scanning, setScanning] = useState(false);
  const [result,   setResult]   = useState<any>(null);
  const [summary,  setSummary]  = useState<{ repos: number; domains: number; servers: number } | null>(null);
  const [scanTypes, setScanTypes] = useState({ endpoint: true, tls: true, source: true, network: true });

  useEffect(() => {
    (async () => {
      try {
        const orgsRes = await fetch(`${DB_API}/organizations`);
        const orgs: any[] = orgsRes.ok ? await orgsRes.json() : [];
        let repos = 0, domains = 0, servers = 0;
        await Promise.all(orgs.map(async (org) => {
          const [rR, dR, sR] = await Promise.all([
            fetch(`${DB_API}/organizations/${org.id}/repositories`),
            fetch(`${DB_API}/organizations/${org.id}/domains`),
            fetch(`${DB_API}/organizations/${org.id}/servers`),
          ]);
          if (rR.ok) repos   += (await rR.json()).length;
          if (dR.ok) domains += (await dR.json()).length;
          if (sR.ok) servers += (await sR.json()).length;
        }));
        setSummary({ repos, domains, servers });
      } catch { setSummary({ repos: 0, domains: 0, servers: 0 }); }
    })();
  }, []);

  const launch = async () => {
    if (scope === "custom") { onViewSelectedScan(); return; }
    setScanning(true);
    try {
      const res  = await fetch(`${ONBOARDING_API}/api/master-scan`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.message || "Bulk scan failed");
      setResult(data);
      toast.success("Bulk scan launched successfully!");
    } catch (e: any) {
      toast.error("Failed: " + e.message);
    } finally { setScanning(false); }
  };

  const total = summary ? summary.repos + summary.domains + summary.servers : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">
      <UnifiedCard className="p-6">
      <h3 className="text-sm font-semibold text-foreground mb-4">Bulk / LOB Scan</h3>

      <div className="mb-5">
        <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Scope</label>
        <select value={scope} onChange={e => { setScope(e.target.value); setResult(null); }}
          className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="full">Full Organization ({total} assets)</option>
          <option value="custom">Custom Selection — pick specific assets</option>
        </select>
      </div>

      <div className="space-y-3.5 mb-6">
        {SCAN_TYPE_OPTIONS.map(({ id, icon: Icon, label, desc }) => (
          <label key={id} className="flex items-start gap-3 cursor-pointer">
            <Checkbox checked={scanTypes[id as keyof typeof scanTypes]} onCheckedChange={v => setScanTypes(p => ({ ...p, [id]: Boolean(v) }))} className="mt-0.5 shrink-0" />
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">{label}</p>
              </div>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          </label>
        ))}
      </div>

      {result && (
        <div className="mb-4 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-900/10 flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Scan launched — {result.total_repos ?? 0} repos, {result.total_domains ?? 0} domains queued.
          </p>
        </div>
      )}

      <Button className="w-full gap-2 font-medium" disabled={scanning} onClick={launch}>
        {scanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
        {scanning ? "Launching…" : scope === "custom" ? "Configure Selection →" : "Run Bulk Scan"}
      </Button>
      </UnifiedCard>

      {/* ── RIGHT: info panel ── */}
      <div className="space-y-4">
        <UnifiedCard className="p-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">About Bulk Scanning</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Bulk scans run across all onboarded assets simultaneously. Choose <strong className="text-foreground">Full Organization</strong> to scan everything, or <strong className="text-foreground">Custom Selection</strong> to pick specific repositories, domains, and endpoints.
          </p>
          <div className="space-y-2.5">
            {summary && [
              { label: "Repositories", value: summary.repos, icon: Folder },
              { label: "Domains",      value: summary.domains, icon: Globe },
              { label: "Servers",      value: summary.servers, icon: Server },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />{label}
                </div>
                <span className="text-sm font-semibold tabular-nums">{value}</span>
              </div>
            ))}
          </div>
        </UnifiedCard>
        <UnifiedCard className="p-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">Scan Types</h3>
          <div className="space-y-3">
            {SCAN_TYPE_OPTIONS.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="p-1.5 rounded-md bg-muted shrink-0 mt-0.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
                <div><p className="text-sm font-medium text-foreground">{label}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
              </div>
            ))}
          </div>
        </UnifiedCard>
      </div>
    </div>
  );
};

// ============================================================================
// SCHEDULES TAB
// ============================================================================

const SchedulesTab: React.FC = () => {
  const [schedules, setSchedules] = useState([
    { id: "full-org",    name: "Full Organization Scan", freq: "Weekly · Sun 02:00 UTC", detail: "All assets",       enabled: true },
    { id: "endpoint",    name: "Endpoint Scan",          freq: "Daily · 02:00 UTC",      detail: "All endpoints",    enabled: true },
    { id: "tls-url",     name: "TLS / URL Scan",         freq: "Daily · 03:00 UTC",      detail: "All HTTPS URLs",   enabled: true },
    { id: "source-code", name: "Source Code Scan",       freq: "On every git push",      detail: "All repositories", enabled: true },
  ]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">
      {/* ── LEFT: schedule list ── */}
      <div className="space-y-3">
        {schedules.map(s => (
          <UnifiedCard key={s.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1 pr-4">
                <p className="text-sm font-semibold text-foreground">{s.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.freq} · {s.detail}</p>
              </div>
              <button
                onClick={() => setSchedules(prev => prev.map(x => x.id === s.id ? { ...x, enabled: !x.enabled } : x))}
                role="switch" aria-checked={s.enabled}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                  s.enabled ? "bg-primary" : "bg-muted-foreground/30"
                )}
              >
                <span className={cn("pointer-events-none block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform", s.enabled ? "translate-x-5" : "translate-x-0.5")} />
              </button>
            </div>
          </UnifiedCard>
        ))}
        <Button variant="outline" size="sm" className="gap-2 w-full mt-1" onClick={() => toast.info("Schedule configuration coming soon")}>
          <Plus className="h-4 w-4" /> Add Schedule
        </Button>
      </div>

      {/* ── RIGHT: about schedules ── */}
      <UnifiedCard className="p-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">About Scheduled Scans</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5">
          Scheduled scans run automatically at defined intervals, keeping your cryptographic posture continuously monitored without manual intervention.
        </p>
        <div className="space-y-4">
          {[
            { title: "Continuous Coverage",     desc: "Never miss a newly introduced vulnerability — scans run even when you're not watching." },
            { title: "Trend Tracking",           desc: "Historical scan data builds over time, letting you track PQC readiness improvements." },
            { title: "Alert on Regression",      desc: "Get notified if a previously passing asset fails on a subsequent scheduled run." },
          ].map(({ title, desc }) => (
            <div key={title} className="flex items-start gap-3">
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <div><p className="text-sm font-medium text-foreground">{title}</p><p className="text-xs text-muted-foreground mt-0.5">{desc}</p></div>
            </div>
          ))}
        </div>
      </UnifiedCard>
    </div>
  );
};

// ============================================================================
// SELECTED SCAN VIEW (org tree picker — Bulk → Custom)
// ============================================================================

const SelectedScanView = ({ onBack }: { onBack: () => void }) => {
  const [orgs, setOrgs]                           = useState<OrgNode[]>([]);
  const [loading, setLoading]                     = useState(true);
  const [selectedRepos,   setSelectedRepos]       = useState<Set<string>>(new Set());
  const [selectedDomains, setSelectedDomains]     = useState<Set<string>>(new Set());
  const [selectedAgents,  setSelectedAgents]      = useState<Set<string>>(new Set());
  const [agentMap, setAgentMap]                   = useState<Record<string, string>>({});
  const [activeTab, setActiveTab]                 = useState<Record<string, "repos" | "domains" | "assets">>({});
  const [scanning, setScanning]                   = useState(false);
  const [result,   setResult]                     = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${SYSTEM_SCAN_API}/api/v1/admin/agents`);
        if (res.ok) {
          const data = await res.json();
          const map: Record<string, string> = {};
          for (const a of (data.agents || [])) {
            if (a.ip_address && a.agent_id) map[a.ip_address] = a.agent_id;
            if (a.hostname   && a.agent_id) map[a.hostname]   = a.agent_id;
          }
          setAgentMap(map);
        }
      } catch { /* optional */ }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${DB_API}/organizations`);
        const data: any[] = res.ok ? await res.json() : [];
        setOrgs(data.map(o => ({ id: o.id, organization_name: o.organization_name, repos: [], domains: [], servers: [], dataLoaded: false, loading: false, expanded: false })));
      } catch { setOrgs([]); }
      finally  { setLoading(false); }
    })();
  }, []);

  const toggleExpand = async (orgId: string) => {
    const org = orgs.find(o => o.id === orgId);
    if (!org) return;
    if (org.dataLoaded) { setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, expanded: !o.expanded } : o)); return; }
    setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, expanded: true, loading: true } : o));
    try {
      const [rRes, dRes, sRes] = await Promise.all([
        fetch(`${DB_API}/organizations/${orgId}/repositories`),
        fetch(`${DB_API}/organizations/${orgId}/domains`),
        fetch(`${DB_API}/organizations/${orgId}/servers`),
      ]);
      const repos:   RepoItem[]   = rRes.ok ? await rRes.json() : [];
      const domains: DomainItem[] = dRes.ok ? await dRes.json() : [];
      const servers: ServerItem[] = sRes.ok ? await sRes.json() : [];
      setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, repos, domains, servers, dataLoaded: true, loading: false } : o));
      setActiveTab(prev => ({ ...prev, [orgId]: repos.length ? "repos" : domains.length ? "domains" : "assets" }));
    } catch { setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, loading: false } : o)); }
  };

  const toggleRepo   = (url: string) => setSelectedRepos  (p => { const n = new Set(p); n.has(url) ? n.delete(url) : n.add(url); return n; });
  const toggleDomain = (d: string)   => setSelectedDomains(p => { const n = new Set(p); n.has(d)   ? n.delete(d)   : n.add(d);   return n; });
  const toggleAgent  = (id: string)  => setSelectedAgents (p => { const n = new Set(p); n.has(id)  ? n.delete(id)  : n.add(id);  return n; });

  const resolveAgentId = (s: ServerItem) =>
    (s.ip_address && agentMap[s.ip_address]) || (s.hostname && agentMap[s.hostname]) || undefined;

  const toggleAllRepos    = (org: OrgNode, e: React.MouseEvent) => { e.stopPropagation(); const urls = org.repos.map(r => r.repo_url); const a = urls.every(u => selectedRepos.has(u)); setSelectedRepos(p => { const n = new Set(p); a ? urls.forEach(u => n.delete(u)) : urls.forEach(u => n.add(u)); return n; }); };
  const toggleAllDomains  = (org: OrgNode, e: React.MouseEvent) => { e.stopPropagation(); const ns = org.domains.map(d => d.domain); const a = ns.every(d => selectedDomains.has(d)); setSelectedDomains(p => { const n = new Set(p); a ? ns.forEach(d => n.delete(d)) : ns.forEach(d => n.add(d)); return n; }); };
  const toggleAllServers  = (org: OrgNode, e: React.MouseEvent) => { e.stopPropagation(); const ids = org.servers.map(s => s.id); const a = ids.every(id => selectedAgents.has(id)); setSelectedAgents(p => { const n = new Set(p); a ? ids.forEach(id => n.delete(id)) : ids.forEach(id => n.add(id)); return n; }); };

  const toggleOrgAll = (org: OrgNode) => {
    const ru = org.repos.map(r => r.repo_url); const dn = org.domains.map(d => d.domain); const si = org.servers.map(s => s.id);
    const allSel = ru.every(r => selectedRepos.has(r)) && dn.every(d => selectedDomains.has(d)) && si.every(s => selectedAgents.has(s));
    if (allSel) { setSelectedRepos(p => { const n = new Set(p); ru.forEach(r => n.delete(r)); return n; }); setSelectedDomains(p => { const n = new Set(p); dn.forEach(d => n.delete(d)); return n; }); setSelectedAgents(p => { const n = new Set(p); si.forEach(s => n.delete(s)); return n; }); }
    else { setSelectedRepos(p => new Set([...p, ...ru])); setSelectedDomains(p => new Set([...p, ...dn])); setSelectedAgents(p => new Set([...p, ...si])); }
  };

  const selectAll   = () => { setSelectedRepos(new Set(orgs.flatMap(o => o.repos.map(r => r.repo_url)))); setSelectedDomains(new Set(orgs.flatMap(o => o.domains.map(d => d.domain)))); setSelectedAgents(new Set(orgs.flatMap(o => o.servers.map(s => s.id)))); };
  const deselectAll = () => { setSelectedRepos(new Set()); setSelectedDomains(new Set()); setSelectedAgents(new Set()); };

  const launch = async () => {
    if (selectedRepos.size === 0 && selectedDomains.size === 0 && selectedAgents.size === 0) { toast.error("Select at least one asset to scan"); return; }
    setScanning(true);
    try {
      const resolvedAgentIds = orgs.flatMap(o => o.servers.filter(s => selectedAgents.has(s.id))).map(s => resolveAgentId(s)).filter((id): id is string => Boolean(id));
      const payload = {
        repos: orgs.flatMap(o => o.repos.filter(r => selectedRepos.has(r.repo_url)).map(r => ({ repo_url: r.repo_url, branch_name: r.branch_to_scan || "main" }))),
        domains: orgs.flatMap(o => o.domains.filter(d => selectedDomains.has(d.domain)).map(d => d.domain)),
        agent_ids: resolvedAgentIds,
      };
      const res = await fetch(`${ONBOARDING_API}/api/selected-scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.message || "Selected scan failed");
      setResult(data); toast.success("Selected scan launched!");
    } catch (e: any) { toast.error("Scan failed: " + e.message); }
    finally { setScanning(false); }
  };

  const totalSelected = selectedRepos.size + selectedDomains.size + selectedAgents.size;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
          <div><h1 className="text-2xl font-bold">Selected Scan</h1><p className="text-sm text-muted-foreground">Expand an organization, then pick what to scan</p></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
          <Button variant="outline" size="sm" onClick={deselectAll}>Deselect All</Button>
          <Button size="sm" className="gap-2" disabled={totalSelected === 0 || scanning} onClick={launch}>
            {scanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {scanning ? "Launching…" : `Scan Selected (${totalSelected})`}
          </Button>
        </div>
      </div>

      {result && (
        <div className="mb-4 p-4 rounded-lg border border-green-500/30 bg-green-50/50 dark:bg-green-900/10 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
          <span className="text-sm font-medium text-green-700 dark:text-green-300">Scan launched — {result.total_repos} repos, {result.total_domains} domains, {result.total_agents ?? 0} assets queued.</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : orgs.length === 0 ? (
        <UnifiedCard className="p-10 text-center text-muted-foreground">No organizations onboarded yet. Go to <strong>Onboarding</strong> to add one.</UnifiedCard>
      ) : (
        <div className="space-y-3">
          {orgs.map(org => {
            const tab         = activeTab[org.id] ?? "repos";
            const repoSelCount = org.repos.filter(r  => selectedRepos.has(r.repo_url)).length;
            const domSelCount  = org.domains.filter(d => selectedDomains.has(d.domain)).length;
            const asstSelCount = org.servers.filter(s => selectedAgents.has(s.id)).length;
            const orgAllSel   = org.dataLoaded && org.repos.length + org.domains.length + org.servers.length > 0 &&
              org.repos.every(r => selectedRepos.has(r.repo_url)) && org.domains.every(d => selectedDomains.has(d.domain)) && org.servers.every(s => selectedAgents.has(s.id));
            const tabs: { key: "repos" | "domains" | "assets"; icon: React.ElementType; label: string; count: number; selCount: number }[] = [
              { key: "repos",   icon: GitBranch, label: "Repositories", count: org.repos.length,   selCount: repoSelCount },
              { key: "domains", icon: Globe,     label: "Domains",      count: org.domains.length, selCount: domSelCount  },
              { key: "assets",  icon: Computer,  label: "Assets",       count: org.servers.length, selCount: asstSelCount },
            ].filter(t => !org.dataLoaded || t.count > 0);

            return (
              <UnifiedCard key={org.id} className="overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                  <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => toggleExpand(org.id)}>
                    {org.expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-semibold truncate">{org.organization_name}</span>
                    {org.dataLoaded && <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{org.repos.length}r · {org.domains.length}d · {org.servers.length}a</span>}
                    {org.loading && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground ml-1 shrink-0" />}
                  </button>
                  {org.dataLoaded && org.repos.length + org.domains.length + org.servers.length > 0 && (
                    <button onClick={() => toggleOrgAll(org)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50 shrink-0 transition-colors ml-2">
                      <Checkbox checked={orgAllSel} className="pointer-events-none h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{orgAllSel ? "Deselect all" : "Select all"}</span>
                    </button>
                  )}
                </div>

                {org.expanded && !org.loading && org.dataLoaded && (
                  <div className="border-t">
                    {org.repos.length === 0 && org.domains.length === 0 && org.servers.length === 0 ? (
                      <p className="px-5 py-4 text-sm text-muted-foreground">No repositories, domains or servers found.</p>
                    ) : (
                      <>
                        <div className="flex border-b bg-muted/20 w-full">
                          {tabs.map(({ key, icon: Icon, label, count, selCount }) => {
                            const isActive = tab === key;
                            return (
                              <button key={key} onClick={() => setActiveTab(p => ({ ...p, [org.id]: key }))}
                                className={cn("relative flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors select-none",
                                  isActive ? "text-primary border-b-2 border-primary bg-background" : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border-b-2 border-transparent")}>
                                <Icon className="h-3.5 w-3.5 shrink-0" /><span>{label}</span>
                                <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-mono", isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{count}</span>
                                {selCount > 0 && <span className="absolute top-1 right-2 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">{selCount}</span>}
                              </button>
                            );
                          })}
                        </div>

                        <AnimatePresence mode="wait">
                          <motion.div key={`${org.id}-${tab}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }} className="px-4 py-3">

                            {tab === "repos" && (
                              <>
                                <div className="flex items-center justify-between mb-2 px-1">
                                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{repoSelCount > 0 ? `${repoSelCount} of ${org.repos.length} selected` : `${org.repos.length} repositories`}</span>
                                  <button onClick={e => toggleAllRepos(org, e)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                    <Checkbox checked={repoSelCount === org.repos.length && org.repos.length > 0} className="pointer-events-none h-3.5 w-3.5" />
                                    {repoSelCount === org.repos.length && org.repos.length > 0 ? "Deselect all" : "Select all"}
                                  </button>
                                </div>
                                <div className="space-y-0.5">
                                  {org.repos.map(repo => (
                                    <label key={repo.id} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors border", selectedRepos.has(repo.repo_url) ? "bg-primary/5 border-primary/20" : "hover:bg-muted/40 border-transparent")}>
                                      <Checkbox checked={selectedRepos.has(repo.repo_url)} onCheckedChange={() => toggleRepo(repo.repo_url)} />
                                      <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{repo.repo_name || repo.repo_url.split("/").slice(-1)[0]}</div><div className="text-xs text-muted-foreground truncate">{repo.repo_url}</div></div>
                                      <span className="shrink-0 text-xs bg-muted px-2 py-0.5 rounded font-mono text-muted-foreground">{repo.branch_to_scan || "main"}</span>
                                    </label>
                                  ))}
                                </div>
                              </>
                            )}

                            {tab === "domains" && (
                              <>
                                <div className="flex items-center justify-between mb-2 px-1">
                                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{domSelCount > 0 ? `${domSelCount} of ${org.domains.length} selected` : `${org.domains.length} domains`}</span>
                                  <button onClick={e => toggleAllDomains(org, e)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                    <Checkbox checked={domSelCount === org.domains.length && org.domains.length > 0} className="pointer-events-none h-3.5 w-3.5" />
                                    {domSelCount === org.domains.length && org.domains.length > 0 ? "Deselect all" : "Select all"}
                                  </button>
                                </div>
                                <div className="space-y-0.5">
                                  {org.domains.map(d => (
                                    <label key={d.id} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors border", selectedDomains.has(d.domain) ? "bg-primary/5 border-primary/20" : "hover:bg-muted/40 border-transparent")}>
                                      <Checkbox checked={selectedDomains.has(d.domain)} onCheckedChange={() => toggleDomain(d.domain)} />
                                      <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="text-sm">{d.domain}</span>
                                    </label>
                                  ))}
                                </div>
                              </>
                            )}

                            {tab === "assets" && (
                              <>
                                <div className="flex items-center justify-between mb-2 px-1">
                                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{asstSelCount > 0 ? `${asstSelCount} of ${org.servers.length} selected` : `${org.servers.length} assets`}</span>
                                  <button onClick={e => toggleAllServers(org, e)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                    <Checkbox checked={asstSelCount === org.servers.length && org.servers.length > 0} className="pointer-events-none h-3.5 w-3.5" />
                                    {asstSelCount === org.servers.length && org.servers.length > 0 ? "Deselect all" : "Select all"}
                                  </button>
                                </div>
                                <div className="space-y-0.5">
                                  {org.servers.map(s => {
                                    const agentId = resolveAgentId(s);
                                    return (
                                      <label key={s.id} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors border", selectedAgents.has(s.id) ? "bg-primary/5 border-primary/20" : "hover:bg-muted/40 border-transparent")}>
                                        <Checkbox checked={selectedAgents.has(s.id)} onCheckedChange={() => toggleAgent(s.id)} />
                                        <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{s.server_name || s.hostname || s.ip_address || "Unnamed server"}</div><div className="text-xs text-muted-foreground truncate">{[s.ip_address, s.hostname].filter(Boolean).join(" · ")}</div></div>
                                        {agentId ? (<span className="shrink-0 text-xs bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-2 py-0.5 rounded font-mono border border-green-200 dark:border-green-800">agent ready</span>)
                                          : (<span className="shrink-0 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">no agent</span>)}
                                      </label>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </motion.div>
                        </AnimatePresence>
                      </>
                    )}
                  </div>
                )}
              </UnifiedCard>
            );
          })}
        </div>
      )}

      {totalSelected > 0 && (
        <div className="sticky bottom-6 mt-6 flex justify-center pointer-events-none">
          <div className="pointer-events-auto bg-background/95 backdrop-blur border shadow-xl rounded-full px-5 py-3 flex items-center gap-4">
            <div className="flex items-center gap-3 text-sm">
              {selectedRepos.size > 0 && (<span className="flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-semibold">{selectedRepos.size}</span><span className="text-muted-foreground hidden sm:inline">repos</span></span>)}
              {selectedDomains.size > 0 && (<span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-semibold">{selectedDomains.size}</span><span className="text-muted-foreground hidden sm:inline">domains</span></span>)}
              {selectedAgents.size > 0 && (<span className="flex items-center gap-1.5"><Server className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-semibold">{selectedAgents.size}</span><span className="text-muted-foreground hidden sm:inline">assets</span></span>)}
            </div>
            <div className="w-px h-5 bg-border" />
            <Button size="sm" className="gap-2 rounded-full" disabled={scanning} onClick={launch}>
              {scanning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              {scanning ? "Launching…" : "Scan Selected"}
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
};

// ============================================================================
// MAIN SCAN COMPONENT
// ============================================================================

const Scan = () => {
  const [mainView,       setMainView]       = useState<MainView>("scan-center");
  const [mainTab,        setMainTab]        = useState<MainTab>("single");
  const [autoLoadDomain, setAutoLoadDomain] = useState<string | undefined>(undefined);
  const [autoLoadRepo,   setAutoLoadRepo]   = useState<string | undefined>(undefined);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const state = location.state as { defaultView?: string; autoLoadDomain?: string; autoLoadRepo?: string; openHistory?: boolean } | null;
    if (state?.defaultView === "webscan") { setAutoLoadDomain(state.autoLoadDomain); setMainView("webscan-full"); }
    else if (state?.defaultView === "gitscan") { setAutoLoadRepo(state.autoLoadRepo); setMainView("gitscan-full"); }
    if (state) window.history.replaceState({}, document.title, location.pathname);
  }, [location]);

  const handleBack = () => { setMainView("scan-center"); setAutoLoadDomain(undefined); setAutoLoadRepo(undefined); };

  if (mainView === "webscan-full") {
    return <WebScan key="webscan" onBack={handleBack} apiBaseUrl={SCAN_API} autoScanUrl={autoLoadDomain} initialTab="history" />;
  }
  if (mainView === "gitscan-full") {
    return <GitScan key="gitscan" onBack={handleBack} autoLoadRepo={autoLoadRepo as any} />;
  }
  if (mainView === "selectedscan") {
    return <SelectedScanView onBack={() => setMainView("scan-center")} />;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div key="scan-center" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="min-h-[calc(100vh-8rem)]">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-8 pb-20 space-y-6">

          <div>
            <h1 className="text-3xl font-bold tracking-tight">Scan Center</h1>
            <p className="text-sm text-muted-foreground mt-1">Trigger an immediate scan on any asset type</p>
          </div>

          <div className="flex gap-2 flex-wrap">
            {([
              { id: "single"   as MainTab, label: "Single Asset" },
              { id: "bulk"     as MainTab, label: "Bulk / LOB"   },
              { id: "schedule" as MainTab, label: "Schedules"    },
            ]).map(({ id, label }) => (
              <button key={id} onClick={() => setMainTab(id)}
                className={cn("px-5 py-2 rounded-full text-sm font-medium border-2 transition-all",
                  mainTab === id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-border/80")}>
                {label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {mainTab === "single" && (
              <motion.div key="single" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                <SingleAssetTab
                  onOpenWebScan={d => { setAutoLoadDomain(d); setMainView("webscan-full"); }}
                  onOpenGitScan={r => { setAutoLoadRepo(r);   setMainView("gitscan-full"); }}
                  onOpenAssets={() => navigate("/assets-scans")}
                />
              </motion.div>
            )}
            {mainTab === "bulk" && (
              <motion.div key="bulk" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                <BulkLOBTab onViewSelectedScan={() => setMainView("selectedscan")} />
              </motion.div>
            )}
            {mainTab === "schedule" && (
              <motion.div key="schedule" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                <SchedulesTab />
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default Scan;
