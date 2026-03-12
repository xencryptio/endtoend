/**
 * RepoSuggestionsPanel — Quantum readiness migration plan for repository scans.
 * Displays actionable migration steps, CNSA 2.0 checklist, and quantum readiness summary.
 * Data comes entirely from the scan detail — no additional API calls.
 */
import React, { useState } from "react";
import {
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Shield,
  AlertTriangle,
  Code,
  FileWarning,
  Zap,
} from "lucide-react";
import type { MigrationPlan, MigrationStep, QuantumReadinessDetail } from "./types";

// ---------------------------------------------------------------------------
// Priority config
// ---------------------------------------------------------------------------
const PRIORITY: Record<
  string,
  { color: string; bg: string; border: string; order: number }
> = {
  CRITICAL: {
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-800/60",
    order: 0,
  },
  HIGH: {
    color: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800/60",
    order: 1,
  },
  MEDIUM: {
    color: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800/60",
    order: 2,
  },
  LOW: {
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-50 dark:bg-slate-900/30",
    border: "border-slate-200 dark:border-slate-700/60",
    order: 3,
  },
  ONGOING: {
    color: "text-purple-700 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-950/30",
    border: "border-purple-200 dark:border-purple-800/60",
    order: 4,
  },
};

// ---------------------------------------------------------------------------
// ActionCard
// ---------------------------------------------------------------------------
const ActionCard: React.FC<{ step: MigrationStep; index: number }> = ({
  step,
  index,
}) => {
  const [open, setOpen] = useState(false);
  const p = PRIORITY[step.priority] ?? PRIORITY.MEDIUM;

  return (
    <div className={`border ${p.border} rounded-lg overflow-hidden`}>
      {/* Header row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-start gap-3 px-4 py-2.5 text-left ${p.bg} hover:brightness-95 transition-all`}
      >
        {/* Priority badge */}
        <span
          className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${p.color} bg-white/60 dark:bg-white/5 border ${p.border} flex-shrink-0 mt-0.5`}
        >
          {step.priority}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-foreground">
            {step.title}
          </div>
          <div className="text-xs text-foreground/70 mt-0.5 line-clamp-2">
            {step.summary}
          </div>
          {/* Chips */}
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {step.affected_files > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                <FileWarning className="w-2.5 h-2.5" />
                {step.affected_files} file{step.affected_files > 1 ? "s" : ""}
              </span>
            )}
            {step.occurrences > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                <Code className="w-2.5 h-2.5" />
                {step.occurrences} occurrence{step.occurrences > 1 ? "s" : ""}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
              Effort: {step.effort}
            </span>
            <span className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
              → {step.replacement}
            </span>
          </div>
        </div>

        {/* Chevron */}
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        )}
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-border/50 px-4 py-3 bg-muted/10 space-y-2">
          <p className="text-sm text-foreground/80 leading-relaxed">
            {step.detail}
          </p>
          {step.code_example && (
            <pre className="text-xs bg-zinc-900 text-zinc-200 p-3 rounded-md overflow-x-auto font-mono whitespace-pre-wrap">
              {step.code_example}
            </pre>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground/60 pt-1">
            <div className="flex items-center gap-1">
              <Shield className="w-2.5 h-2.5 flex-shrink-0" />
              <span>{step.nist_ref}</span>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 flex-shrink-0" />
              <span>{step.impact}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface RepoSuggestionsPanelProps {
  migrationPlan: MigrationPlan | null | undefined;
  quantumReadiness: QuantumReadinessDetail | null | undefined;
  criticalVulnerabilities?: string[];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const RepoSuggestionsPanel: React.FC<RepoSuggestionsPanelProps> = ({
  migrationPlan,
  quantumReadiness,
  criticalVulnerabilities,
}) => {
  const [showVulns, setShowVulns] = useState(false);

  if (!migrationPlan && !quantumReadiness) {
    return (
      <div className="border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
        No migration plan data available.
      </div>
    );
  }

  const steps = migrationPlan?.steps ?? [];
  const sortedSteps = [...steps].sort(
    (a, b) =>
      (PRIORITY[a.priority]?.order ?? 5) - (PRIORITY[b.priority]?.order ?? 5)
  );

  const criticalCount = migrationPlan?.critical_count ?? 0;
  const highCount = migrationPlan?.high_count ?? 0;
  const urgentCount = criticalCount + highCount;

  const riskLevel = quantumReadiness?.risk_level ?? "medium";
  const migrationStatus = quantumReadiness?.migration_status ?? "not_started";

  const riskColor =
    riskLevel === "low"
      ? "text-emerald-600 dark:text-emerald-400"
      : riskLevel === "medium"
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";

  const statusLabels: Record<string, { label: string; color: string }> = {
    complete: {
      label: "PQC Migration Complete",
      color: "text-emerald-600 dark:text-emerald-400",
    },
    in_progress: {
      label: "Migration In Progress",
      color: "text-amber-600 dark:text-amber-400",
    },
    not_started: {
      label: "Migration Not Started",
      color: "text-rose-600 dark:text-rose-400",
    },
    not_applicable: {
      label: "N/A",
      color: "text-slate-500 dark:text-slate-400",
    },
  };
  const statusInfo = statusLabels[migrationStatus] ?? statusLabels.not_started;

  // CNSA 2.0 checklist for source code
  const hasVulnerableAsym =
    (quantumReadiness?.vulnerable_algorithms?.length ?? 0) > 0;
  const hasDeprecated =
    (quantumReadiness?.deprecated_algorithms?.length ?? 0) > 0;
  const hasPqc = (quantumReadiness?.pqc_algorithms?.length ?? 0) > 0;
  const hasGroverSafe =
    (quantumReadiness?.grover_safe_algorithms?.length ?? 0) > 0;

  const cnsa = [
    {
      label: "PQC Algorithms Used",
      ok: hasPqc,
      detail: hasPqc
        ? `${quantumReadiness!.pqc_algorithms.length} PQC algorithm(s)`
        : "No PQC algorithms detected",
    },
    {
      label: "No Deprecated Crypto",
      ok: !hasDeprecated,
      detail: hasDeprecated
        ? `${quantumReadiness!.deprecated_algorithms.join(", ")}`
        : "No deprecated algorithms found",
    },
    {
      label: "Quantum-Safe Symmetric",
      ok: hasGroverSafe,
      detail: hasGroverSafe
        ? "256-bit symmetric ciphers in use"
        : "Upgrade symmetric keys to 256-bit",
    },
    {
      label: "No Quantum-Vulnerable KEX/Sig",
      ok: !hasVulnerableAsym,
      detail: hasVulnerableAsym
        ? `${quantumReadiness!.vulnerable_algorithms.slice(0, 3).join(", ")}${(quantumReadiness!.vulnerable_algorithms.length > 3 ? "..." : "")}`
        : "All asymmetric crypto is quantum-safe",
    },
  ];

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-3 bg-muted/20 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-foreground">
            Quantum Migration Action Plan
          </span>
          {urgentCount > 0 && (
            <span className="text-xs font-semibold border border-red-400 dark:border-red-700 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-sm">
              {urgentCount} urgent
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            Risk:{" "}
            <span className={`font-semibold capitalize ${riskColor}`}>
              {riskLevel}
            </span>
          </span>
          <span>·</span>
          <span className={`font-semibold ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>
      </div>

      {/* Quantum Readiness Summary */}
      {quantumReadiness && (
        <div className="px-5 py-3 border-b border-border bg-card">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-foreground">
                {quantumReadiness.quantum_readiness_percentage.toFixed(1)}%
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Quantum Ready
              </div>
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">
                {quantumReadiness.quantum_safe_operations}
                <span className="text-xs font-normal text-muted-foreground">
                  /{quantumReadiness.total_crypto_operations}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Safe Operations
              </div>
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">
                {migrationPlan?.estimated_effort ?? "N/A"}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Est. Effort
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {quantumReadiness.migration_note}
          </p>
        </div>
      )}

      {/* Critical Vulnerabilities */}
      {criticalVulnerabilities && criticalVulnerabilities.length > 0 && (
        <div className="px-5 py-3 border-b border-border bg-red-50/50 dark:bg-red-950/20">
          <button
            onClick={() => setShowVulns((v) => !v)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs font-semibold text-red-700 dark:text-red-400">
                {criticalVulnerabilities.length} Critical Finding
                {criticalVulnerabilities.length > 1 ? "s" : ""}
              </span>
            </div>
            {showVulns ? (
              <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </button>
          {showVulns && (
            <ul className="mt-2 space-y-1">
              {criticalVulnerabilities.map((v, i) => (
                <li
                  key={i}
                  className="text-xs text-red-700 dark:text-red-300 flex items-start gap-1.5"
                >
                  <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {v}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Action steps */}
      <div className="p-4 space-y-1.5 bg-card">
        {sortedSteps.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-4">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            No migration actions required — codebase is quantum-ready.
          </div>
        ) : (
          sortedSteps.map((step, i) => (
            <ActionCard key={step.step} step={step} index={i} />
          ))
        )}
      </div>

      {/* CNSA 2.0 Compliance Checklist */}
      <div className="border-t border-border px-5 py-3.5 bg-muted/10">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          CNSA 2.0 Readiness (Source Code)
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cnsa.map(({ label, ok, detail }) => (
            <div key={label} className="space-y-0.5">
              <div className="flex items-center gap-1">
                {ok ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                )}
                <span className="text-xs font-semibold text-foreground">
                  {label}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground pl-5">
                {detail}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RepoSuggestionsPanel;
