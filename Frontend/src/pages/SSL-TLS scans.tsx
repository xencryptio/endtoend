import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Globe,
  Github,
  Computer,
  Zap,
  ListChecks,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ArrowLeft,
  CheckCircle,
  Building2,
  GitBranch,
} from "lucide-react";
import { UnifiedEntryCard, UnifiedCard } from "@/components/ui/unified";
import { typography } from "@/lib/design-tokens";
import WebScan from "@/components/scan/webscan";
import GitScan from "@/components/git-scan/git-scan";
import { toast } from "sonner";

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type ViewType = "dashboard" | "webscan" | "gitscan" | "masterscan" | "selectedscan";

const DB_API          = (import.meta.env.VITE_DB_API_URL          as string | undefined) || 'http://localhost:8001';
const ONBOARDING_API  = (import.meta.env.VITE_ONBOARDING_API_URL   as string | undefined) || 'http://localhost:8008';
const SYSTEM_SCAN_API = (import.meta.env.VITE_SYSTEM_SCAN_API_URL  as string | undefined) || 'http://localhost:9000';
const API_CONFIG = { scanApi: (import.meta.env.VITE_SCAN_API_URL as string | undefined) || 'http://localhost:8000' };

interface RepoItem {
  id: string;
  repo_url: string;
  repo_name?: string;
  branch_to_scan?: string;
}

interface DomainItem {
  id: string;
  domain: string;
}

interface ServerItem {
  id: string;
  server_name?: string;
  hostname?: string;
  ip_address?: string;
  agent_id?: string; // resolved from system-scan
}

interface OrgNode {
  id: string;
  organization_name: string;
  repos: RepoItem[];
  domains: DomainItem[];
  servers: ServerItem[];
  dataLoaded: boolean;
  loading: boolean;
  expanded: boolean;
}

// ============================================================================
// MASTER SCAN VIEW
// ============================================================================

const MasterScanView = ({ onBack }: { onBack: () => void }) => {
  const [summary, setSummary] = useState<{ orgs: number; repos: number; domains: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const orgsRes = await fetch(`${DB_API}/organizations`);
        const orgs: any[] = orgsRes.ok ? await orgsRes.json() : [];
        let totalRepos = 0;
        let totalDomains = 0;
        await Promise.all(
          orgs.map(async (org) => {
            const [rRes, dRes] = await Promise.all([
              fetch(`${DB_API}/organizations/${org.id}/repositories`),
              fetch(`${DB_API}/organizations/${org.id}/domains`),
            ]);
            if (rRes.ok) totalRepos += (await rRes.json()).length;
            if (dRes.ok) totalDomains += (await dRes.json()).length;
          })
        );
        setSummary({ orgs: orgs.length, repos: totalRepos, domains: totalDomains });
      } catch {
        setSummary({ orgs: 0, repos: 0, domains: 0 });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const launch = async () => {
    setScanning(true);
    try {
      const res = await fetch(`${ONBOARDING_API}/api/master-scan`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.message || "Master scan failed");
      setResult(data);
      toast.success("Master scan launched successfully!");
    } catch (e: any) {
      toast.error("Failed to launch master scan: " + e.message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-[calc(100vh-8rem)] p-6 max-w-3xl mx-auto"
    >
      <div className="flex items-center gap-3 mb-8">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Master Scan</h1>
          <p className="text-sm text-muted-foreground">Scan all onboarded repositories and domains at once</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : result ? (
        <UnifiedCard className="p-6 space-y-5">
          <div className="flex items-center gap-3 text-green-600 dark:text-green-400">
            <CheckCircle className="h-6 w-6" />
            <h2 className="text-lg font-semibold">Master Scan Launched!</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Organizations", value: result.total_organizations },
              { label: "Repos Queued", value: result.total_repos },
              { label: "Domains Queued", value: result.total_domains },
            ].map(({ label, value }) => (
              <div key={label} className="text-center p-4 rounded-lg bg-muted/50">
                <div className="text-3xl font-bold">{value}</div>
                <div className="text-sm text-muted-foreground mt-1">{label}</div>
              </div>
            ))}
          </div>
          {result.triggered_scans?.repo_scan_job_id && (
            <p className="text-xs text-muted-foreground font-mono">Repo Job ID: {result.triggered_scans.repo_scan_job_id}</p>
          )}
          {result.triggered_scans?.tls_scan_job_id && (
            <p className="text-xs text-muted-foreground font-mono">TLS Job ID: {result.triggered_scans.tls_scan_job_id}</p>
          )}
          <Button onClick={onBack} className="w-full mt-2">Back to Scan Center</Button>
        </UnifiedCard>
      ) : (
        <UnifiedCard className="p-6 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Organizations", value: summary!.orgs, icon: Building2 },
              { label: "Repositories", value: summary!.repos, icon: GitBranch },
              { label: "Domains", value: summary!.domains, icon: Globe },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="text-center p-4 rounded-lg bg-muted/50 space-y-2">
                <Icon className="h-5 w-5 mx-auto text-primary" />
                <div className="text-3xl font-bold">{value}</div>
                <div className="text-sm text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            Clicking <strong>Launch Master Scan</strong> will trigger TLS/SSL scans for all{" "}
            <strong>{summary!.domains}</strong> domains and repository scans for all{" "}
            <strong>{summary!.repos}</strong> repositories across <strong>{summary!.orgs}</strong> organizations.
          </p>
          <Button
            className="w-full gap-2"
            size="lg"
            disabled={scanning || (summary!.repos === 0 && summary!.domains === 0)}
            onClick={launch}
          >
            {scanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {scanning ? "Launching..." : "Launch Master Scan"}
          </Button>
          {summary!.repos === 0 && summary!.domains === 0 && (
            <p className="text-xs text-center text-muted-foreground">
              No onboarded data found. Please onboard organizations first.
            </p>
          )}
        </UnifiedCard>
      )}
    </motion.div>
  );
};

// ============================================================================
// SELECTED SCAN VIEW
// ============================================================================

const SelectedScanView = ({ onBack }: { onBack: () => void }) => {
  const [orgs, setOrgs] = useState<OrgNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [agentMap, setAgentMap] = useState<Record<string, string>>({});
  // active tab per org: "repos" | "domains" | "assets"
  const [activeTab, setActiveTab] = useState<Record<string, "repos" | "domains" | "assets">>({});
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${SYSTEM_SCAN_API}/api/v1/admin/agents`);
        if (res.ok) {
          const data = await res.json();
          const map: Record<string, string> = {};
          for (const a of (data.agents || [])) {
            if (a.ip_address && a.agent_id) map[a.ip_address] = a.agent_id;
            if (a.hostname && a.agent_id) map[a.hostname] = a.agent_id;
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
        setOrgs(
          data.map((o) => ({
            id: o.id,
            organization_name: o.organization_name,
            repos: [],
            domains: [],
            servers: [],
            dataLoaded: false,
            loading: false,
            expanded: false,
          }))
        );
      } catch {
        setOrgs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleExpand = async (orgId: string) => {
    const org = orgs.find((o) => o.id === orgId);
    if (!org) return;
    if (org.dataLoaded) {
      setOrgs((prev) => prev.map((o) => (o.id === orgId ? { ...o, expanded: !o.expanded } : o)));
      return;
    }
    setOrgs((prev) => prev.map((o) => (o.id === orgId ? { ...o, expanded: true, loading: true } : o)));
    try {
      const [rRes, dRes, sRes] = await Promise.all([
        fetch(`${DB_API}/organizations/${orgId}/repositories`),
        fetch(`${DB_API}/organizations/${orgId}/domains`),
        fetch(`${DB_API}/organizations/${orgId}/servers`),
      ]);
      const repos: RepoItem[] = rRes.ok ? await rRes.json() : [];
      const domains: DomainItem[] = dRes.ok ? await dRes.json() : [];
      const servers: ServerItem[] = sRes.ok ? await sRes.json() : [];
      setOrgs((prev) =>
        prev.map((o) => (o.id === orgId ? { ...o, repos, domains, servers, dataLoaded: true, loading: false } : o))
      );
      // default to first non-empty tab
      setActiveTab((prev) => ({
        ...prev,
        [orgId]: repos.length ? "repos" : domains.length ? "domains" : "assets",
      }));
    } catch {
      setOrgs((prev) => prev.map((o) => (o.id === orgId ? { ...o, loading: false } : o)));
    }
  };

  const toggleRepo = (url: string) =>
    setSelectedRepos((prev) => { const n = new Set(prev); n.has(url) ? n.delete(url) : n.add(url); return n; });
  const toggleDomain = (d: string) =>
    setSelectedDomains((prev) => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n; });
  const toggleAgent = (id: string) =>
    setSelectedAgents((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const resolveAgentId = (s: ServerItem): string | undefined =>
    (s.ip_address && agentMap[s.ip_address]) || (s.hostname && agentMap[s.hostname]) || undefined;

  // Section-level select-all toggles
  const toggleAllRepos = (org: OrgNode, e: React.MouseEvent) => {
    e.stopPropagation();
    const urls = org.repos.map((r) => r.repo_url);
    const allSel = urls.every((u) => selectedRepos.has(u));
    setSelectedRepos((prev) => {
      const n = new Set(prev);
      allSel ? urls.forEach((u) => n.delete(u)) : urls.forEach((u) => n.add(u));
      return n;
    });
  };
  const toggleAllDomains = (org: OrgNode, e: React.MouseEvent) => {
    e.stopPropagation();
    const names = org.domains.map((d) => d.domain);
    const allSel = names.every((d) => selectedDomains.has(d));
    setSelectedDomains((prev) => {
      const n = new Set(prev);
      allSel ? names.forEach((d) => n.delete(d)) : names.forEach((d) => n.add(d));
      return n;
    });
  };
  const toggleAllServers = (org: OrgNode, e: React.MouseEvent) => {
    e.stopPropagation();
    const ids = org.servers.map((s) => s.id);
    const allSel = ids.every((id) => selectedAgents.has(id));
    setSelectedAgents((prev) => {
      const n = new Set(prev);
      allSel ? ids.forEach((id) => n.delete(id)) : ids.forEach((id) => n.add(id));
      return n;
    });
  };

  const toggleOrgAll = (org: OrgNode) => {
    const repoUrls = org.repos.map((r) => r.repo_url);
    const domainNames = org.domains.map((d) => d.domain);
    const serverIds = org.servers.map((s) => s.id);
    const allSel =
      repoUrls.every((r) => selectedRepos.has(r)) &&
      domainNames.every((d) => selectedDomains.has(d)) &&
      serverIds.every((s) => selectedAgents.has(s));
    if (allSel) {
      setSelectedRepos((prev) => { const n = new Set(prev); repoUrls.forEach((r) => n.delete(r)); return n; });
      setSelectedDomains((prev) => { const n = new Set(prev); domainNames.forEach((d) => n.delete(d)); return n; });
      setSelectedAgents((prev) => { const n = new Set(prev); serverIds.forEach((s) => n.delete(s)); return n; });
    } else {
      setSelectedRepos((prev) => new Set([...prev, ...repoUrls]));
      setSelectedDomains((prev) => new Set([...prev, ...domainNames]));
      setSelectedAgents((prev) => new Set([...prev, ...serverIds]));
    }
  };

  const selectAll = () => {
    setSelectedRepos(new Set(orgs.flatMap((o) => o.repos.map((r) => r.repo_url))));
    setSelectedDomains(new Set(orgs.flatMap((o) => o.domains.map((d) => d.domain))));
    setSelectedAgents(new Set(orgs.flatMap((o) => o.servers.map((s) => s.id))));
  };
  const deselectAll = () => { setSelectedRepos(new Set()); setSelectedDomains(new Set()); setSelectedAgents(new Set()); };

  const launch = async () => {
    if (selectedRepos.size === 0 && selectedDomains.size === 0 && selectedAgents.size === 0) {
      toast.error("Select at least one asset to scan");
      return;
    }
    setScanning(true);
    try {
      const resolvedAgentIds = orgs
        .flatMap((o) => o.servers.filter((s) => selectedAgents.has(s.id)))
        .map((s) => resolveAgentId(s))
        .filter((id): id is string => Boolean(id));

      const payload = {
        repos: orgs.flatMap((o) =>
          o.repos.filter((r) => selectedRepos.has(r.repo_url))
            .map((r) => ({ repo_url: r.repo_url, branch_name: r.branch_to_scan || "main" }))
        ),
        domains: orgs.flatMap((o) =>
          o.domains.filter((d) => selectedDomains.has(d.domain)).map((d) => d.domain)
        ),
        agent_ids: resolvedAgentIds,
      };
      const res = await fetch(`${ONBOARDING_API}/api/selected-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.message || "Selected scan failed");
      setResult(data);
      toast.success("Selected scan launched!");
    } catch (e: any) {
      toast.error("Scan failed: " + e.message);
    } finally {
      setScanning(false);
    }
  };

  const totalSelected = selectedRepos.size + selectedDomains.size + selectedAgents.size;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 max-w-4xl mx-auto"
    >
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Selected Scan</h1>
            <p className="text-sm text-muted-foreground">Expand an organization, then pick what to scan</p>
          </div>
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

      {/* ── Result banner ── */}
      {result && (
        <div className="mb-4 p-4 rounded-lg border border-green-500/30 bg-green-50/50 dark:bg-green-900/10 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
          <span className="text-sm font-medium text-green-700 dark:text-green-300">
            Scan launched — {result.total_repos} repos, {result.total_domains} domains, {result.total_agents ?? 0} assets queued.
          </span>
        </div>
      )}

      {/* ── Body ── */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : orgs.length === 0 ? (
        <UnifiedCard className="p-10 text-center text-muted-foreground">
          No organizations onboarded yet. Go to <strong>Onboarding</strong> to add one.
        </UnifiedCard>
      ) : (
        <div className="space-y-3">
          {orgs.map((org) => {
            const tab = activeTab[org.id] ?? "repos";

            const repoSelCount = org.repos.filter((r) => selectedRepos.has(r.repo_url)).length;
            const domSelCount  = org.domains.filter((d) => selectedDomains.has(d.domain)).length;
            const asstSelCount = org.servers.filter((s) => selectedAgents.has(s.id)).length;

            const orgAllSel =
              org.dataLoaded &&
              org.repos.length + org.domains.length + org.servers.length > 0 &&
              org.repos.every((r) => selectedRepos.has(r.repo_url)) &&
              org.domains.every((d) => selectedDomains.has(d.domain)) &&
              org.servers.every((s) => selectedAgents.has(s.id));

            const tabs: { key: "repos" | "domains" | "assets"; icon: React.ElementType; label: string; count: number; selCount: number }[] = [
              { key: "repos",   icon: GitBranch, label: "Repositories", count: org.repos.length,    selCount: repoSelCount },
              { key: "domains", icon: Globe,     label: "Domains",       count: org.domains.length,  selCount: domSelCount  },
              { key: "assets",  icon: Computer,  label: "Assets",        count: org.servers.length,  selCount: asstSelCount },
            ].filter((t) => !org.dataLoaded || t.count > 0);

            return (
              <UnifiedCard key={org.id} className="overflow-hidden">
                {/* ── Org header ── */}
                <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                  <button
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    onClick={() => toggleExpand(org.id)}
                  >
                    {org.expanded
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-semibold truncate">{org.organization_name}</span>
                    {org.dataLoaded && (
                      <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                        {org.repos.length}r · {org.domains.length}d · {org.servers.length}a
                      </span>
                    )}
                    {org.loading && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground ml-1 shrink-0" />}
                  </button>

                  {org.dataLoaded && org.repos.length + org.domains.length + org.servers.length > 0 && (
                    <button
                      onClick={() => toggleOrgAll(org)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50 shrink-0 transition-colors ml-2"
                    >
                      <Checkbox checked={orgAllSel} className="pointer-events-none h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{orgAllSel ? "Deselect all" : "Select all"}</span>
                    </button>
                  )}
                </div>

                {/* ── Expanded: tab bar + panel ── */}
                {org.expanded && !org.loading && org.dataLoaded && (
                  <div className="border-t">
                    {org.repos.length === 0 && org.domains.length === 0 && org.servers.length === 0 ? (
                      <p className="px-5 py-4 text-sm text-muted-foreground">No repositories, domains or servers found.</p>
                    ) : (
                      <>
                        {/* Tab bar */}
                        <div className="flex border-b bg-muted/20 w-full">
                          {tabs.map(({ key, icon: Icon, label, count, selCount }) => {
                            const isActive = tab === key;
                            return (
                              <button
                                key={key}
                                onClick={() => setActiveTab((p) => ({ ...p, [org.id]: key }))}
                                className={`relative flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors select-none
                                  ${isActive
                                    ? "text-primary border-b-2 border-primary bg-background"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border-b-2 border-transparent"
                                  }`}
                              >
                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                <span>{label}</span>
                                {/* total count pill */}
                                <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono
                                  ${isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                                  {count}
                                </span>
                                {/* selected badge */}
                                {selCount > 0 && (
                                  <span className="absolute top-1 right-2 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                                    {selCount}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Panel */}
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={`${org.id}-${tab}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.15 }}
                            className="px-4 py-3"
                          >
                            {/* ── Repositories panel ── */}
                            {tab === "repos" && (
                              <>
                                {/* Section header with select-all */}
                                <div className="flex items-center justify-between mb-2 px-1">
                                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    {repoSelCount > 0 ? `${repoSelCount} of ${org.repos.length} selected` : `${org.repos.length} repositories`}
                                  </span>
                                  <button
                                    onClick={(e) => toggleAllRepos(org, e)}
                                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <Checkbox
                                      checked={repoSelCount === org.repos.length && org.repos.length > 0}
                                      className="pointer-events-none h-3.5 w-3.5"
                                    />
                                    {repoSelCount === org.repos.length && org.repos.length > 0 ? "Deselect all" : "Select all"}
                                  </button>
                                </div>
                                <div className="space-y-0.5">
                                  {org.repos.map((repo) => (
                                    <label
                                      key={repo.id}
                                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors
                                        ${selectedRepos.has(repo.repo_url) ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/40 border border-transparent"}`}
                                    >
                                      <Checkbox
                                        checked={selectedRepos.has(repo.repo_url)}
                                        onCheckedChange={() => toggleRepo(repo.repo_url)}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="text-sm font-medium truncate">
                                          {repo.repo_name || repo.repo_url.split("/").slice(-1)[0]}
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">{repo.repo_url}</div>
                                      </div>
                                      <span className="shrink-0 text-xs bg-muted px-2 py-0.5 rounded font-mono text-muted-foreground">
                                        {repo.branch_to_scan || "main"}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              </>
                            )}

                            {/* ── Domains panel ── */}
                            {tab === "domains" && (
                              <>
                                <div className="flex items-center justify-between mb-2 px-1">
                                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    {domSelCount > 0 ? `${domSelCount} of ${org.domains.length} selected` : `${org.domains.length} domains`}
                                  </span>
                                  <button
                                    onClick={(e) => toggleAllDomains(org, e)}
                                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <Checkbox
                                      checked={domSelCount === org.domains.length && org.domains.length > 0}
                                      className="pointer-events-none h-3.5 w-3.5"
                                    />
                                    {domSelCount === org.domains.length && org.domains.length > 0 ? "Deselect all" : "Select all"}
                                  </button>
                                </div>
                                <div className="space-y-0.5">
                                  {org.domains.map((d) => (
                                    <label
                                      key={d.id}
                                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors
                                        ${selectedDomains.has(d.domain) ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/40 border border-transparent"}`}
                                    >
                                      <Checkbox
                                        checked={selectedDomains.has(d.domain)}
                                        onCheckedChange={() => toggleDomain(d.domain)}
                                      />
                                      <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      <span className="text-sm">{d.domain}</span>
                                    </label>
                                  ))}
                                </div>
                              </>
                            )}

                            {/* ── Assets panel ── */}
                            {tab === "assets" && (
                              <>
                                <div className="flex items-center justify-between mb-2 px-1">
                                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    {asstSelCount > 0 ? `${asstSelCount} of ${org.servers.length} selected` : `${org.servers.length} assets`}
                                  </span>
                                  <button
                                    onClick={(e) => toggleAllServers(org, e)}
                                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <Checkbox
                                      checked={asstSelCount === org.servers.length && org.servers.length > 0}
                                      className="pointer-events-none h-3.5 w-3.5"
                                    />
                                    {asstSelCount === org.servers.length && org.servers.length > 0 ? "Deselect all" : "Select all"}
                                  </button>
                                </div>
                                <div className="space-y-0.5">
                                  {org.servers.map((s) => {
                                    const agentId = resolveAgentId(s);
                                    return (
                                      <label
                                        key={s.id}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors
                                          ${selectedAgents.has(s.id) ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/40 border border-transparent"}`}
                                      >
                                        <Checkbox
                                          checked={selectedAgents.has(s.id)}
                                          onCheckedChange={() => toggleAgent(s.id)}
                                        />
                                        <div className="min-w-0 flex-1">
                                          <div className="text-sm font-medium truncate">
                                            {s.server_name || s.hostname || s.ip_address || "Unnamed server"}
                                          </div>
                                          <div className="text-xs text-muted-foreground truncate">
                                            {[s.ip_address, s.hostname].filter(Boolean).join(" · ")}
                                          </div>
                                        </div>
                                        {agentId ? (
                                          <span className="shrink-0 text-xs bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-2 py-0.5 rounded font-mono border border-green-200 dark:border-green-800">
                                            agent ready
                                          </span>
                                        ) : (
                                          <span className="shrink-0 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                                            no agent
                                          </span>
                                        )}
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

      {/* ── Sticky footer ── */}
      {totalSelected > 0 && (
        <div className="sticky bottom-6 mt-6 flex justify-center pointer-events-none">
          <div className="pointer-events-auto bg-background/95 backdrop-blur border shadow-xl rounded-full px-5 py-3 flex items-center gap-4">
            <div className="flex items-center gap-3 text-sm">
              {selectedRepos.size > 0 && (
                <span className="flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-semibold">{selectedRepos.size}</span>
                  <span className="text-muted-foreground hidden sm:inline">repos</span>
                </span>
              )}
              {selectedDomains.size > 0 && (
                <span className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-semibold">{selectedDomains.size}</span>
                  <span className="text-muted-foreground hidden sm:inline">domains</span>
                </span>
              )}
              {selectedAgents.size > 0 && (
                <span className="flex items-center gap-1.5">
                  <Computer className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-semibold">{selectedAgents.size}</span>
                  <span className="text-muted-foreground hidden sm:inline">assets</span>
                </span>
              )}
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
// MAIN SCAN COMPONENT (DASHBOARD CONTROLLER)
// ============================================================================

const Scan = () => {
  const [view, setView] = useState<ViewType>("dashboard");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const state = location.state as { defaultView?: ViewType; autoLoadDomain?: string; autoLoadRepo?: string; openHistory?: boolean } | null;
    if (state?.defaultView && ["webscan", "gitscan", "dashboard"].includes(state.defaultView)) {
      setView(state.defaultView);
    }
  }, [location]);

  const [pendingAutoLoadDomain, setPendingAutoLoadDomain] = useState<string | undefined>(undefined);
  const [pendingAutoLoadRepo, setPendingAutoLoadRepo] = useState<string | undefined>(undefined);
  const [forceHistoryTab, setForceHistoryTab] = useState<boolean>(false);

  useEffect(() => {
    const state = location.state as { defaultView?: ViewType; autoLoadDomain?: string; autoLoadRepo?: string; openHistory?: boolean } | null;
    if (state?.autoLoadDomain || state?.autoLoadRepo) {
      setPendingAutoLoadDomain(state.autoLoadDomain);
      setPendingAutoLoadRepo(state.autoLoadRepo);
      setForceHistoryTab(Boolean(state?.openHistory || state?.autoLoadDomain));
      window.history.replaceState({}, document.title, location.pathname);
    }
  }, [location]);

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  return (
    <AnimatePresence mode="wait">
      {view === "webscan" ? (
        <WebScan
          key="webscan"
          onBack={() => setView("dashboard")}
          apiBaseUrl={API_CONFIG.scanApi}
          autoLoadDomain={pendingAutoLoadDomain}
          initialTab={forceHistoryTab ? "history" : "scan"}
        />
      ) : view === "gitscan" ? (
        <GitScan
          key="gitscan"
          onBack={() => setView("dashboard")}
          autoLoadRepo={pendingAutoLoadRepo as any}
        />
      ) : view === "masterscan" ? (
        <MasterScanView key="masterscan" onBack={() => setView("dashboard")} />
      ) : view === "selectedscan" ? (
        <SelectedScanView key="selectedscan" onBack={() => setView("dashboard")} />
      ) : (
        <motion.div
          key="dashboard"
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center justify-start min-h-[calc(100vh-8rem)] p-8"
        >
          <div className="w-full max-w-6xl mx-auto space-y-10">
            <div className="text-center">
              <h1 className={typography.display}>Scan Center</h1>
              <p className="text-lg text-muted-foreground mt-2">Select a scan type to begin.</p>
            </div>

            {/* Bulk Scans */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 pl-1">
                Bulk Scans
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <UnifiedEntryCard
                  icon={Zap}
                  title="Master Scan"
                  subtitle="Scan all onboarded data"
                  description="One-click scan for every repository and domain across all onboarded organizations. Triggers TLS/SSL and repo scans simultaneously."
                  actionLabel="Launch"
                  onClick={() => setView("masterscan")}
                  variant="premium"
                />
                <UnifiedEntryCard
                  icon={ListChecks}
                  title="Selected Scan"
                  subtitle="Pick exactly what to scan"
                  description="Browse all onboarded organizations, expand each one to see individual repositories, domains and assets, then scan only what you choose."
                  actionLabel="Configure"
                  onClick={() => setView("selectedscan")}
                  variant="premium"
                />
              </div>
            </div>

            {/* Scan Tools */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 pl-1">
                Scan Tools
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <UnifiedEntryCard
                  icon={Globe}
                  title="TLS/SSL Scan"
                  subtitle="Scan · History · Reports"
                  description="Run a new TLS/SSL scan, browse scan history, and drill into detailed cryptographic reports for any previously scanned domain."
                  actionLabel="Open"
                  onClick={() => setView("webscan")}
                  variant="premium"
                />
                <UnifiedEntryCard
                  icon={Github}
                  title="Repository Scan"
                  subtitle="Scan · History · Reports"
                  description="Scan a GitHub repository, view past scans, and explore detailed Post-Quantum Cryptography readiness reports for each result."
                  actionLabel="Open"
                  onClick={() => setView("gitscan")}
                  variant="premium"
                />
                <UnifiedEntryCard
                  icon={Computer}
                  title="Assets Scan"
                  subtitle="Agents · Tasks · Results"
                  description="Manage registered system agents, trigger crypto inventory scans, and review detailed cryptographic findings across your infrastructure."
                  actionLabel="Open"
                  onClick={() => navigate("/assets-scans")}
                  variant="premium"
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Scan;