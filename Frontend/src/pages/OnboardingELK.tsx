// ============================================================================
// ELK ONBOARDING — Submit organisations directly into Elasticsearch (bypasses
// the legacy Postgres onboarding service). Supports JSON + CSV upload and
// optionally fires scans against the TLS / Repo scanners automatically.
// ============================================================================

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  FileJson,
  FileSpreadsheet,
  Download,
  Rocket,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  History,
  Building2,
  Layers,
  AppWindow,
  Globe,
  GitBranch,
  Server,
  Mail,
  User,
  Calendar,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { UnifiedCard } from "@/components/ui/unified";
import { cn } from "@/lib/utils";
import {
  elkApi,
  formatDateTime,
  ElkOnboardingBatch,
  ElkOnboardedOrg,
  ElkOnboardedOrgDetail,
} from "@/api/elkClient";

type Tab = "json" | "csv" | "history" | "organizations";

const SAMPLE_JSON = {
  organization: {
    organization_name: "Amazon Inc.",
    organization_email: "security@amazon.com",
  },
  created_by: "onboarding@amazon.com",
  suborganizations: [
    {
      suborganization_name: "Amazon Web Services (AWS)",
      applications: [
        {
          application_name: "EC2",
          repositories: [
            {
              repo_url: "https://github.com/aws/amazon-ec2-metadata-mock",
              repo_name: "amazon-ec2-metadata-mock",
              branch_to_scan: "main",
            },
          ],
          domains: [{ domain: "console.aws.amazon.com" }],
          servers: [
            {
              hostname: "ec2-prod-1",
              ip_address: "192.168.29.69",
              operating_system: "Windows",
            },
          ],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}> = ({ active, onClick, icon: Icon, label }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
      active
        ? "bg-primary text-primary-foreground shadow-md"
        : "bg-muted text-muted-foreground hover:bg-muted/80"
    )}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

const KPI: React.FC<{ label: string; value: string | number; icon: React.ElementType; color?: string }> = ({
  label,
  value,
  icon: Icon,
  color = "text-blue-600",
}) => (
  <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
    <div className={cn("p-2 rounded-md bg-background", color)}>
      <Icon className="h-4 w-4" />
    </div>
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  </div>
);

// ============================================================================
// JSON TAB
// ============================================================================
const JsonTab: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [text, setText] = useState(JSON.stringify(SAMPLE_JSON, null, 2));
  const [triggerScans, setTriggerScans] = useState(true);
  const [createdBy, setCreatedBy] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setLastResult(null);
    try {
      const parsed = JSON.parse(text);
      if (createdBy && !parsed.created_by) parsed.created_by = createdBy;
      parsed.trigger_scans = triggerScans;
      const res = await elkApi.onboardingJSON(parsed);
      setLastResult(res);
      toast.success(
        `Onboarded — ${res.totals.applications} app(s), ${res.totals.repositories} repo(s), ${res.totals.domains} domain(s)`
      );
      onSuccess();
    } catch (e: any) {
      toast.error(e?.message || "Onboarding failed");
    } finally {
      setSubmitting(false);
    }
  };

  const loadSample = () => setText(JSON.stringify(SAMPLE_JSON, null, 2));

  return (
    <div className="space-y-4">
      <UnifiedCard className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <FileJson className="h-5 w-5 text-blue-600" />
              JSON Onboarding
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Submit one organization with sub-orgs, applications, repositories, domains and servers.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadSample}>
            Load sample
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <Label className="text-xs">Created by (optional)</Label>
            <Input
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div className="flex items-end gap-3 pb-1">
            <Switch
              id="json-trigger"
              checked={triggerScans}
              onCheckedChange={setTriggerScans}
            />
            <Label htmlFor="json-trigger" className="cursor-pointer">
              Trigger scans immediately after onboarding
            </Label>
          </div>
        </div>

        <Textarea
          className="font-mono text-xs h-[400px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex justify-end mt-3">
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            Onboard
          </Button>
        </div>
      </UnifiedCard>

      {lastResult && (
        <UnifiedCard className="p-6 border-green-200 bg-green-50/40">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="font-semibold">Onboarding succeeded</span>
            <span className="text-xs text-muted-foreground">batch_id: {lastResult.batch_id}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
            <KPI label="Sub-orgs" value={lastResult.totals.suborganizations} icon={Layers} />
            <KPI label="Apps" value={lastResult.totals.applications} icon={AppWindow} />
            <KPI label="Repos" value={lastResult.totals.repositories} icon={GitBranch} color="text-purple-600" />
            <KPI label="Domains" value={lastResult.totals.domains} icon={Globe} color="text-cyan-600" />
            <KPI label="Servers" value={lastResult.totals.servers} icon={Server} color="text-orange-600" />
          </div>
          {triggerScans && (
            <div className="mt-3 text-xs text-muted-foreground">
              Triggered: {lastResult.triggered.repos_ok} repo OK / {lastResult.triggered.repos_failed} failed,{" "}
              {lastResult.triggered.domains_ok} domain OK / {lastResult.triggered.domains_failed} failed
            </div>
          )}
        </UnifiedCard>
      )}
    </div>
  );
};

// ============================================================================
// CSV TAB
// ============================================================================
const CsvTab: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [triggerScans, setTriggerScans] = useState(true);
  const [createdBy, setCreatedBy] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const handleSubmit = async () => {
    if (!file) {
      toast.error("Choose a CSV file first");
      return;
    }
    setSubmitting(true);
    setLastResult(null);
    try {
      const res = await elkApi.onboardingCSV(file, createdBy || undefined, triggerScans);
      setLastResult(res);
      toast.success(`Onboarded — ${res.totals.applications} application(s)`);
      onSuccess();
    } catch (e: any) {
      toast.error(e?.message || "CSV onboarding failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <UnifiedCard className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            CSV Onboarding
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Bulk upload organisations through a single CSV. One row per resource (repo/domain/server).
          </p>
        </div>
        <a href={elkApi.onboardingCSVTemplateURL()} target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Download template
          </Button>
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div>
          <Label className="text-xs">Created by (optional)</Label>
          <Input
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
            placeholder="you@company.com"
          />
        </div>
        <div className="flex items-end gap-3 pb-1">
          <Switch id="csv-trigger" checked={triggerScans} onCheckedChange={setTriggerScans} />
          <Label htmlFor="csv-trigger" className="cursor-pointer">
            Trigger scans immediately after onboarding
          </Label>
        </div>
      </div>

      <div className="border-2 border-dashed rounded-lg p-6 text-center">
        <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-3">Drop a CSV here or click to select</p>
        <Input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="max-w-md mx-auto"
        />
        {file && (
          <p className="text-xs mt-3">
            <strong>{file.name}</strong> — {(file.size / 1024).toFixed(1)} KB
          </p>
        )}
      </div>

      <div className="flex justify-end mt-4">
        <Button onClick={handleSubmit} disabled={submitting || !file} className="gap-2">
          {submitting ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Rocket className="h-4 w-4" />
          )}
          Onboard CSV
        </Button>
      </div>

      {lastResult && (
        <div className="mt-4 p-4 bg-green-50/40 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="font-semibold">CSV onboarded</span>
          </div>
          <div className="text-xs text-muted-foreground">
            batch_id: {lastResult.batch_id} • org_id: {lastResult.org_id}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm mt-3">
            <KPI label="Sub-orgs" value={lastResult.totals.suborganizations} icon={Layers} />
            <KPI label="Apps" value={lastResult.totals.applications} icon={AppWindow} />
            <KPI label="Repos" value={lastResult.totals.repositories} icon={GitBranch} color="text-purple-600" />
            <KPI label="Domains" value={lastResult.totals.domains} icon={Globe} color="text-cyan-600" />
            <KPI label="Servers" value={lastResult.totals.servers} icon={Server} color="text-orange-600" />
          </div>
        </div>
      )}
    </UnifiedCard>
  );
};

// ============================================================================
// HISTORY TAB
// ============================================================================
const HistoryTab: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [batches, setBatches] = useState<ElkOnboardingBatch[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await elkApi.onboardingBatches(200);
      setBatches(r.batches);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const handleDelete = async (batchId: string) => {
    if (!confirm(`Delete batch ${batchId}? (organisation data is kept)`)) return;
    try {
      await elkApi.onboardingBatchDelete(batchId);
      toast.success("Batch deleted");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    }
  };

  return (
    <UnifiedCard className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <History className="h-5 w-5 text-blue-600" />
          Onboarding history ({batches.length})
        </h3>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {batches.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No onboarding batches yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 px-2">Organisation</th>
                <th className="py-2 px-2">Source</th>
                <th className="py-2 px-2">Submitted</th>
                <th className="py-2 px-2">By</th>
                <th className="py-2 px-2 text-right">Repos</th>
                <th className="py-2 px-2 text-right">Domains</th>
                <th className="py-2 px-2 text-right">Servers</th>
                <th className="py-2 px-2">Scans</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.batch_id} className="border-b hover:bg-muted/40">
                  <td className="py-2 px-2 font-medium">{b.organization_name}</td>
                  <td className="py-2 px-2">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded text-xs",
                        b.source === "csv"
                          ? "bg-green-100 text-green-700"
                          : "bg-blue-100 text-blue-700"
                      )}
                    >
                      {b.source.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-xs text-muted-foreground">
                    {formatDateTime(b.submitted_at)}
                  </td>
                  <td className="py-2 px-2 text-xs">{b.created_by || "—"}</td>
                  <td className="py-2 px-2 text-right">{b.totals.repositories}</td>
                  <td className="py-2 px-2 text-right">{b.totals.domains}</td>
                  <td className="py-2 px-2 text-right">{b.totals.servers}</td>
                  <td className="py-2 px-2 text-xs">
                    {b.trigger_scans ? (
                      <span className="text-green-700">
                        {b.triggered.repos_ok + b.triggered.domains_ok} OK /{" "}
                        <span className="text-red-700">
                          {b.triggered.repos_failed + b.triggered.domains_failed} fail
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">not triggered</span>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(b.batch_id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </UnifiedCard>
  );
};

// ============================================================================
// ORGANIZATIONS TAB
// ============================================================================
const OrgRow: React.FC<{
  org: ElkOnboardedOrg;
  onDelete: () => void;
}> = ({ org, onDelete }) => {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ElkOnboardedOrgDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setOpen((o) => !o);
    if (!detail && !open) {
      setLoading(true);
      try {
        const d = await elkApi.onboardedOrganizationDetail(org.org_id);
        setDetail(d);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${org.organization_name} and all its data?`)) return;
    try {
      await elkApi.onboardedOrganizationDelete(org.org_id);
      toast.success("Organization deleted");
      onDelete();
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/40"
        onClick={toggle}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Building2 className="h-5 w-5 text-blue-600" />
        <div className="flex-1">
          <div className="font-semibold">{org.organization_name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-3">
            {org.organization_email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {org.organization_email}
              </span>
            )}
            {org.created_by && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {org.created_by}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDateTime(org.updated_at)}
            </span>
          </div>
        </div>
        <div className="hidden md:flex gap-2 text-xs">
          <span className="px-2 py-1 bg-muted rounded">{org.totals.suborganizations} suborg</span>
          <span className="px-2 py-1 bg-muted rounded">{org.totals.applications} apps</span>
          <span className="px-2 py-1 bg-muted rounded">{org.totals.repositories} repos</span>
          <span className="px-2 py-1 bg-muted rounded">{org.totals.domains} domains</span>
          <span className="px-2 py-1 bg-muted rounded">{org.totals.servers} servers</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          className="text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {open && (
        <div className="p-3 bg-muted/20 border-t">
          {loading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : detail ? (
            <div className="space-y-2">
              {detail.suborganizations.map((so) => (
                <div key={so.suborg_id} className="bg-background rounded p-2 border">
                  <div className="font-medium flex items-center gap-2 mb-1">
                    <Layers className="h-4 w-4 text-purple-600" />
                    {so.suborganization_name}
                  </div>
                  <div className="pl-6 space-y-1">
                    {so.applications.map((app) => (
                      <div key={app.app_id} className="text-xs">
                        <span className="font-semibold inline-flex items-center gap-1">
                          <AppWindow className="h-3 w-3" />
                          {app.application_name}
                        </span>
                        <span className="text-muted-foreground ml-2">
                          {app.repositories.length} repo, {app.domains.length} domain, {app.servers.length} server
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

const OrgsTab: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [orgs, setOrgs] = useState<ElkOnboardedOrg[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await elkApi.onboardedOrganizations(500);
      setOrgs(r.organizations);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  return (
    <UnifiedCard className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-600" />
          Onboarded organizations ({orgs.length})
        </h3>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {orgs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No organizations onboarded yet.
        </div>
      ) : (
        <div className="space-y-2">
          {orgs.map((o) => (
            <OrgRow key={o.org_id} org={o} onDelete={load} />
          ))}
        </div>
      )}
    </UnifiedCard>
  );
};

// ============================================================================
// MAIN
// ============================================================================
const OnboardingELK: React.FC = () => {
  const [tab, setTab] = useState<Tab>("json");
  const [refreshKey, setRefreshKey] = useState(0);

  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-1">
          <Rocket className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold">ELK Onboarding</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Onboard organisations directly into Elasticsearch and trigger scans against the TLS / Repo / System scanners.
        </p>
      </motion.div>

      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === "json"} onClick={() => setTab("json")} icon={FileJson} label="JSON" />
        <TabButton active={tab === "csv"} onClick={() => setTab("csv")} icon={FileSpreadsheet} label="CSV" />
        <TabButton active={tab === "history"} onClick={() => setTab("history")} icon={History} label="History" />
        <TabButton
          active={tab === "organizations"}
          onClick={() => setTab("organizations")}
          icon={Building2}
          label="Organizations"
        />
      </div>

      {tab === "json" && <JsonTab onSuccess={bump} />}
      {tab === "csv" && <CsvTab onSuccess={bump} />}
      {tab === "history" && <HistoryTab refreshKey={refreshKey} />}
      {tab === "organizations" && <OrgsTab refreshKey={refreshKey} />}
    </div>
  );
};

export default OnboardingELK;
