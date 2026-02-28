import React, { useState, useMemo, useEffect } from "react";
import {
  Search,
  X,
  Globe,
  Lock,
  Key,
  Shield,
  Zap,
  Check,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { UnifiedBackButton } from "@/components/ui/unified";
import { Input } from "@/components/ui/input";
import SuggestionsPanel from "./SuggestionsPanel";

// ============================================================================
// TYPES
// ============================================================================

interface ScanResult {
  id?: number;
  batch_id?: string;
  request_id: string;
  url: string;
  status: "pending" | "processing" | "completed" | "failed";
  requested_at: string;
  total_urls: number;
  execution_time_seconds?: number;
  scan_status?: string;
  tls_version?: string;
  public_key_size_bits?: number;
  cipher_suite_name?: string;
  cipher_protocol?: string;
  cipher_strength_bits?: number;
  ephemeral_key_exchange?: boolean;
  cert_subject?: string;
  cert_issuer?: string;
  cert_serial_number?: string;
  cert_not_before?: string;
  cert_not_after?: string;
  public_key_algorithm?: string;
  hsts_enabled?: boolean;
  csp_enabled?: boolean;
  x_frame_options_enabled?: boolean;
  ocsp_stapling_active?: boolean;
  ct_present?: boolean;
  error_message?: string;
  raw_response?: any;
  quantum_score?: number;
  quantum_grade?: string;
  detailedResults?: ScanResult[];
  finalDomainProgress?: { [key: string]: { status: string; duration?: number } };
  pqc_analysis?: {
    overall_score: number;
    overall_grade: string;
    security_level: string;
    quantum_ready: boolean;
    hybrid_ready: boolean;
    components: {
      kex: ComponentScore;
      signature: ComponentScore;
      symmetric: ComponentScore;
      certificate: ComponentScore;
      protocol: ComponentScore;
    };
  };
}

interface ComponentScore {
  weighted_average: number;
  grade: string;
  pqc_percentage: number;
  quantum_safe_count: number;
}

export type ScanStatus = "completed" | "failed" | "pending" | "http_skipped";

interface ResultsDetailPageProps {
  scan: ScanResult;
  onBack: () => void;
  targetDomain?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

const getGradeColor = (grade: string): string => {
  if (!grade) return "text-zinc-500";
  const g = grade.toUpperCase();
  if (g.startsWith("A")) return "text-emerald-600 dark:text-emerald-400";
  if (g.startsWith("B")) return "text-blue-600 dark:text-blue-400";
  if (g.startsWith("C")) return "text-amber-600 dark:text-amber-400";
  if (g.startsWith("D")) return "text-orange-600 dark:text-orange-400";
  return "text-rose-600 dark:text-rose-400";
};

const getScoreBarColor = (score: number): string => {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 80) return "bg-blue-500";
  if (score >= 70) return "bg-amber-500";
  if (score >= 60) return "bg-orange-500";
  return "bg-rose-500";
};

/** Minimal enterprise badge: colored text + border only, no background fill */
const getGradeBg = (grade: string): string => {
  if (!grade) return "border-slate-300 dark:border-slate-600 text-slate-500";
  const g = grade.toUpperCase();
  if (g.startsWith("A")) return "border-emerald-500 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400";
  if (g.startsWith("B")) return "border-blue-500 dark:border-blue-700 text-blue-700 dark:text-blue-400";
  if (g.startsWith("C")) return "border-amber-500 dark:border-amber-600 text-amber-700 dark:text-amber-400";
  if (g.startsWith("D")) return "border-orange-500 dark:border-orange-600 text-orange-700 dark:text-orange-400";
  return "border-red-500 dark:border-red-700 text-red-700 dark:text-red-400";
};

const getCategoryDisplayName = (category: string): string => {
  const names: Record<string, string> = {
    kex: "Key Exchange",
    signature: "Digital Signatures",
    symmetric: "Symmetric Encryption",
    certificate: "Certificate Security",
    protocol: "Protocol Security",
  };
  return names[category] || category;
};

const formatDate = (val: string | undefined): string => {
  if (!val) return "N/A";
  try {
    return new Date(val).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return val;
  }
};

// ============================================================================
// ATOMS
// ============================================================================

const Row: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({
  label,
  value,
  mono = false,
}) => (
  <div className="flex items-start justify-between py-2 border-b border-border/40 last:border-0 gap-6">
    <span className="text-sm text-muted-foreground whitespace-nowrap flex-shrink-0 w-32">{label}</span>
    <span className={`text-sm text-right text-foreground break-all leading-relaxed ${mono ? "font-mono" : ""}`}>
      {value}
    </span>
  </div>
);

const PassBadge: React.FC<{ pass: boolean; yes?: string; no?: string }> = ({
  pass,
  yes = "Yes",
  no = "No",
}) =>
  pass ? (
    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
      <Check className="w-3 h-3" />
      {yes}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-medium">
      <X className="w-3 h-3" />
      {no}
    </span>
  );

/** Minimal inline status tag — border only, no fill */
const Tag: React.FC<{ children: React.ReactNode; variant?: "default" | "ok" | "warn" | "bad" }> = ({
  children,
  variant = "default",
}) => {
  const cls =
    variant === "ok"
      ? "border-emerald-500 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400"
      : variant === "warn"
      ? "border-amber-500 dark:border-amber-700 text-amber-700 dark:text-amber-400"
      : variant === "bad"
      ? "border-red-500 dark:border-red-700 text-red-700 dark:text-red-400"
      : "border-border text-muted-foreground";
  return (
    <span className={`inline-block border text-xs font-medium px-1.5 py-0.5 rounded-sm leading-none ${cls}`}>
      {children}
    </span>
  );
};

const Accordion: React.FC<{
  title: string;
  icon: React.ReactNode;
  badge?: string | number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, icon, badge, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground/70">{icon}</span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge !== undefined && (
            <span className="px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground text-xs font-medium tabular-nums">
              {badge}
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-4 py-4 space-y-1.5 bg-card">{children}</div>}
    </div>
  );
};

// ============================================================================
// COMPONENT SCORE TABLE
// ============================================================================

const COL_HEADERS: { label: string; tooltip: string; align?: string }[] = [
  {
    label: "Component",
    tooltip: "Algorithm category being evaluated (Key Exchange, Digital Signatures, Symmetric Encryption, Protocol Security)",
  },
  {
    label: "Score Bar",
    tooltip: "Visual representation of the weighted composite score (0–100). Red = critical risk, orange = degraded, blue = acceptable, green = strong.",
  },
  {
    label: "Score",
    tooltip: "Weighted composite score (0–100) for this category. Accounts for algorithm strength, key size, deprecation status, and quantum resistance.",
    align: "text-right",
  },
  {
    label: "Grade",
    tooltip: "Letter grade derived from score. A+ ≥ 95 · A ≥ 80 · B ≥ 65 · C ≥ 50 · D ≥ 35 · F < 35",
    align: "text-right",
  },
  {
    label: "NIST PQC",
    tooltip: "% of algorithms in this category that are formal NIST PQC standards (ML-KEM, ML-DSA, SLH-DSA). AES-256 and TLS 1.3 are quantum-safe but are not NIST PQC algorithms — shown as N/A where no PQC standard applies.",
    align: "text-right",
  },
  {
    label: "Q-Safe #",
    tooltip: "Count of algorithms in this category that resist quantum attacks. For symmetric: 256-bit keys are Grover-resistant. For KEX/Sig: requires ML-KEM or ML-DSA.",
    align: "text-right",
  },
];

const ComponentTable: React.FC<{ components: Record<string, ComponentScore> }> = ({
  components,
}) => (
  <div className="border border-border rounded overflow-hidden">
    {/* 6-column grid: name | bar | score-number | grade | nist-pqc | q-safe */}
    <div className="grid grid-cols-[1.2fr_2fr_3.5rem_3rem_4.5rem_4rem] gap-3 items-center px-4 py-3 bg-muted/30 border-b border-border">
      {COL_HEADERS.map((h) => (
        <span
          key={h.label}
          className={`text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-help ${h.align ?? ""}`}
          title={h.tooltip}
        >
          {h.label}
        </span>
      ))}
    </div>
    {Object.entries(components).map(([key, data], i) => {
      const score = data.weighted_average;
      const pqcCell =
        data.pqc_percentage > 0
          ? `${data.pqc_percentage}%`
          : key === "symmetric" || key === "protocol"
          ? null   // render N/A span below
          : "0%";
      const pqcTitle =
        key === "symmetric"
          ? "AES-256 & ChaCha20 are Grover-resistant (quantum-safe) but are not NIST PQC algorithms — no PQC standard for symmetric ciphers exists yet"
          : key === "protocol"
          ? "TLS 1.3 is quantum-safe with PQC key exchange but is not itself a NIST PQC protocol standard"
          : data.pqc_percentage === 0
          ? "No NIST PQC algorithms (ML-KEM, ML-DSA) detected in this category. Deploy PQC algorithms to increase this value."
          : undefined;
      return (
        <div
          key={key}
          className={`grid grid-cols-[1.2fr_2fr_3.5rem_3rem_4.5rem_4rem] gap-3 items-center px-4 py-3.5 ${
            i < Object.keys(components).length - 1 ? "border-b border-border/50" : ""
          }`}
        >
          {/* Component name */}
          <span className="text-sm font-medium text-foreground">{getCategoryDisplayName(key)}</span>

          {/* Score bar */}
          <div className="h-2 bg-muted rounded-sm overflow-hidden">
            <div
              className={`h-full ${getScoreBarColor(score)} transition-all duration-700`}
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>

          {/* Score number */}
          <span className={`text-sm font-bold tabular-nums text-right ${getGradeColor(data.grade)}`}>
            {score.toFixed(1)}
          </span>

          {/* Grade badge — border-only */}
          <span
            className={`text-xs font-bold px-1.5 py-0.5 rounded-sm border text-right justify-self-end font-mono ${getGradeBg(
              data.grade
            )}`}
          >
            {data.grade}
          </span>

          {/* NIST PQC % */}
          <span
            className="text-sm text-right tabular-nums text-muted-foreground"
            title={pqcTitle}
          >
            {pqcCell ?? <span className="text-xs text-muted-foreground/50 italic">N/A</span>}
          </span>

          {/* Q-Safe count */}
          <span className="text-sm text-right tabular-nums text-muted-foreground">
            {data.quantum_safe_count}
          </span>
        </div>
      );
    })}
  </div>
);

// ============================================================================
// DOMAIN DETAIL PAGE
// ============================================================================

const DomainDetailPage: React.FC<{ result: ScanResult; onBack: () => void }> = ({
  result,
  onBack,
}) => {
  const isSuccess = result.scan_status?.toLowerCase() === "completed";
  const pqcScore = result.raw_response?.pqc_analysis?.overall_score ?? result.quantum_score ?? null;
  const pqcGrade = result.raw_response?.pqc_analysis?.overall_grade ?? result.quantum_grade ?? "—";
  const quantumReady = result.raw_response?.pqc_analysis?.quantum_ready ?? false;
  const securityLevel = result.raw_response?.pqc_analysis?.security_level ?? "unknown";
  const hybridReady = result.raw_response?.pqc_analysis?.hybrid_ready ?? false;
  const legacyProtocols: string[] =
    result.raw_response?.pqc_analysis?.quantum_readiness_detail?.legacy_protocols ?? [];

  const rawData = result.raw_response || {};
  const tlsConfig = rawData.tls_configuration || {};
  const certChain = rawData.certificate_chain || {};
  const leafCert = certChain.leaf_certificate || {};
  const signatureAlgorithms = rawData.signature_algorithms || {};
  const secFeatures = rawData.pqc_analysis?.security_features || {};
  const certAnalysis = rawData.pqc_analysis?.certificate_analysis || {};
  const complianceStatus: Record<string, boolean> = rawData.pqc_analysis?.compliance_status || {};
  const criticalVulns: string[] = rawData.pqc_analysis?.critical_vulnerabilities || [];
  const serverIp: string = rawData.server_ip || "";
  const serverPort: number | null = rawData.port || null;
  const components = result.raw_response?.pqc_analysis?.components;

  const scoreNum = typeof pqcScore === "number" ? pqcScore : null;
  const riskLabel = !scoreNum
    ? "Unknown"
    : scoreNum >= 90 ? "Low Risk"
    : scoreNum >= 80 ? "Med-Low Risk"
    : scoreNum >= 70 ? "Medium Risk"
    : scoreNum >= 60 ? "Med-High Risk"
    : "High Risk";
  const riskColor = !scoreNum
    ? "text-zinc-500"
    : scoreNum >= 80 ? "text-emerald-600 dark:text-emerald-400"
    : scoreNum >= 60 ? "text-amber-600 dark:text-amber-400"
    : "text-rose-600 dark:text-rose-400";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sticky header — minimal bar */}
      <header className="sticky top-0 z-30 bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Shield className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Quantum Security Report
            </span>
            <span className="text-muted-foreground/30 hidden sm:block">|</span>
            <code className="text-xs font-mono text-foreground hidden sm:block truncate max-w-sm">
              {result.url}
            </code>
          </div>
          <UnifiedBackButton onClick={onBack} label="Back" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        {isSuccess ? (
          <>
            {/* Score card */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex flex-col md:flex-row md:items-start gap-6">
                {/* Grade + score */}
                <div className="flex items-center gap-6 flex-shrink-0">
                  <div
                    className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl font-black border-2 ${getGradeBg(
                      pqcGrade as string
                    )}`}
                  >
                    {pqcGrade}
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                      PQC Score
                    </div>
                    <div className="text-5xl font-black text-foreground leading-none tabular-nums">
                      {scoreNum !== null ? scoreNum.toFixed(1) : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">out of 100</div>
                    <div className="mt-3 h-1.5 w-48 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${getScoreBarColor(
                          scoreNum ?? 0
                        )}`}
                        style={{ width: `${scoreNum ?? 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="hidden md:block w-px self-stretch bg-border" />

                {/* Domain + status chips */}
                <div className="flex-1 min-w-0">
                  <code className="block text-sm font-mono font-semibold text-foreground mb-4 truncate">
                    {result.url}
                  </code>
                  <div className="flex flex-wrap gap-2">
                    {result.tls_version && (
                      <span className="px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-bold border border-border">
                        {result.tls_version}
                      </span>
                    )}
                    <span
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                        quantumReady
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                          : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {quantumReady ? " Quantum Ready" : " Not Quantum Ready"}
                    </span>
                    <span
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                        hybridReady
                          ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                          : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {hybridReady ? " Hybrid KEX" : " No Hybrid KEX"}
                    </span>
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border bg-muted border-border ${riskColor}`}>
                      {riskLabel}
                    </span>
                    <span className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-bold border border-border capitalize">
                      {securityLevel}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Legacy protocol alert ─────────────────────────────────── */}
            {legacyProtocols.length > 0 && (
              <div className="border border-red-300 dark:border-red-800 rounded p-4 flex gap-3 bg-red-50/40 dark:bg-red-950/10">
                <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <span className="text-xs font-bold text-red-700 dark:text-red-300">
                      Deprecated TLS Protocols Accepted:
                    </span>
                    {legacyProtocols.map((proto) => (
                      <code
                        key={proto}
                        className="text-xs font-mono bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-200 px-1.5 py-0.5 rounded-sm border border-red-200 dark:border-red-700"
                      >
                        {proto}
                      </code>
                    ))}
                  </div>
                  <p className="text-xs text-red-700/90 dark:text-red-300/90 leading-relaxed">
                    Deprecated by NIST SP 800-52r2, PCI DSS 4.0 §4.2.1, and RFC 8996. Legacy
                    sessions bypass PQC hybrid key exchange, exposing traffic to POODLE, BEAST,
                    and historical interception.{" "}
                    <strong>Disable TLS 1.0/1.1 at the server and CDN layer.</strong>
                  </p>
                </div>
              </div>
            )}

            {/* ── Component breakdown ─────────────────────────────────── */}
            {components && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Component Breakdown
                </div>
                <ComponentTable components={components} />
                <p className="text-xs text-muted-foreground mt-2">
                  A ≥ 80 — B ≥ 65 — C ≥ 50 — D ≥ 35 — F &lt; 35 &nbsp;|  Hover column headers for definitions
                </p>
              </div>
            )}

            {/* ── TLS + Certificate panels ────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* TLS summary */}
              <div className="bg-card border border-border rounded p-4">
                <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-border">
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">TLS Configuration</span>
                </div>
                <Row label="Domain" value={<code className="font-mono text-xs">{rawData.domain || result.url || "N/A"}</code>} />
                {serverIp && <Row label="Server IP" value={<code className="font-mono text-xs">{serverIp}</code>} />}
                {serverPort && <Row label="Port" value={serverPort} />}
                <Row
                  label="Protocols"
                  value={(tlsConfig.supported_protocols || []).join(", ") || result.tls_version || "N/A"}
                  mono
                />
                <Row label="Active Cipher" value={result.cipher_suite_name || "N/A"} mono />
                {result.cipher_strength_bits && (
                  <Row label="Cipher Strength" value={`${result.cipher_strength_bits} bits`} />
                )}
                <Row
                  label="Perfect Forward Secrecy"
                  value={
                    <PassBadge
                      pass={!!secFeatures.pfs_supported}
                      yes={`Yes (${secFeatures.pfs_percentage?.toFixed(0) ?? "?"}% of suites)`}
                      no="No"
                    />
                  }
                />
                <Row label="SNI" value={<PassBadge pass={!!secFeatures.sni_supported} yes="Supported" no="Not detected" />} />
                <Row
                  label="HSTS"
                  value={
                    <PassBadge
                      pass={!!secFeatures.hsts_enabled}
                      yes={`Enabled${secFeatures.hsts_max_age ? `  max-age ${secFeatures.hsts_max_age}s` : ""}`}
                      no="Disabled"
                    />
                  }
                />
              </div>

              {/* Certificate summary */}
              <div className="bg-card border border-border rounded p-4">
                <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-border">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">Leaf Certificate</span>
                </div>
                <Row label="Subject" value={leafCert.subject || result.cert_subject || "N/A"} mono />
                <Row label="Issuer" value={leafCert.issuer || result.cert_issuer || "N/A"} mono />
                <Row label="Valid From" value={formatDate(leafCert.valid_from || result.cert_not_before)} />
                <Row label="Valid Until" value={formatDate(leafCert.valid_until || result.cert_not_after)} />
                <Row
                  label="Public Key"
                  value={`${leafCert.public_key_algorithm || result.public_key_algorithm || "N/A"}${
                    leafCert.public_key_size || result.public_key_size_bits
                      ? `  ${leafCert.public_key_size || result.public_key_size_bits} bits`
                      : ""
                  }`}
                />
                <Row label="OCSP Stapling" value={<PassBadge pass={!!certAnalysis.ocsp_stapling} yes="Active" no="Inactive" />} />
                <Row label="Cert Transparency" value={<PassBadge pass={!!certAnalysis.cert_transparency} yes="Present" no="Not detected" />} />
                <Row label="Chain Integrity" value={<PassBadge pass={!!certAnalysis.chain_consistent} yes="Consistent" no="Inconsistent" />} />
              </div>
            </div>

            {/* ── Migration action plan ────────────────────────────────── */}
            <SuggestionsPanel
              pqcAnalysis={result.raw_response?.pqc_analysis}
              domain={result.url}
            />

            {/* ── Deep-dive accordions ────────────────────────────────── */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Technical Details
              </div>
              <div className="space-y-2">

                {/* Cipher Suites */}
                {((tlsConfig["tls_1.3_cipher_suites"]?.suites?.length ?? 0) +
                  (tlsConfig["tls_1.2_cipher_suites"]?.suites?.length ?? 0)) > 0 && (
                  <Accordion
                    title="Cipher Suites"
                    icon={<Lock className="w-3.5 h-3.5" />}
                    badge={
                      (tlsConfig["tls_1.3_cipher_suites"]?.suites?.length || 0) +
                      (tlsConfig["tls_1.2_cipher_suites"]?.suites?.length || 0)
                    }
                  >
                    {(tlsConfig["tls_1.3_cipher_suites"]?.suites?.length ?? 0) > 0 && (
                      <div className="mb-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">TLS 1.3</div>
                        <div className="rounded border border-border overflow-hidden">
                          {tlsConfig["tls_1.3_cipher_suites"].suites.map((cipher: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 last:border-0 bg-card">
                              <code className="text-sm font-mono text-foreground">{cipher.name}</code>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground ml-4 flex-shrink-0">
                                <span>{cipher.encryption}</span>
                                {cipher.kex_pqc_grade && (
                                  <span className={`font-bold ${getGradeColor(cipher.kex_pqc_grade)}`}>
                                    KEX {cipher.kex_pqc_grade}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(tlsConfig["tls_1.2_cipher_suites"]?.suites?.length ?? 0) > 0 && (
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">TLS 1.2</div>
                        <div className="rounded border border-border overflow-hidden">
                          {tlsConfig["tls_1.2_cipher_suites"].suites.map((cipher: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 last:border-0 bg-card">
                              <code className="text-sm font-mono text-foreground">{cipher.name}</code>
                              <div className="flex items-center gap-3 text-sm ml-4 flex-shrink-0">
                                {cipher.kex_pqc_grade && (
                                  <span className={`font-medium ${getGradeColor(cipher.kex_pqc_grade)}`}>KEX {cipher.kex_pqc_grade}</span>
                                )}
                                {cipher.encryption_pqc_grade && (
                                  <span className={`font-medium ${getGradeColor(cipher.encryption_pqc_grade)}`}>ENC {cipher.encryption_pqc_grade}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Accordion>
                )}

                {/* Elliptic Curves */}
                {(tlsConfig.supported_elliptic_curves?.curves?.length ?? 0) > 0 && (
                  <Accordion
                    title="Elliptic Curves"
                    icon={<Key className="w-3.5 h-3.5" />}
                    badge={tlsConfig.supported_elliptic_curves.curves.length}
                  >
                    <div className="rounded border border-border overflow-hidden">
                      {tlsConfig.supported_elliptic_curves.curves.map((curve: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 last:border-0 bg-card">
                          <div>
                            <code className="text-sm font-mono font-semibold text-foreground">{curve.name}</code>
                            <span className="text-sm text-muted-foreground ml-2">{curve.type} · {curve.bits} bits</span>
                          </div>
                          {curve.curve_pqc_grade && (
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-sm border ml-4 flex-shrink-0 font-mono ${getGradeBg(curve.curve_pqc_grade)}`}>
                              {curve.curve_pqc_grade}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </Accordion>
                )}

                {/* Certificate Chain */}
                <Accordion
                  title="Certificate Chain"
                  icon={<Shield className="w-3.5 h-3.5" />}
                  badge={(certChain.intermediate_certificates || []).length + 1}
                >
                  <div className="mb-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Leaf Certificate</div>
                    <div className="bg-muted/20 rounded px-3 py-2.5">
                      <Row label="Subject" value={leafCert.subject || result.cert_subject || "N/A"} mono />
                      <Row label="Issuer" value={leafCert.issuer || result.cert_issuer || "N/A"} mono />
                      <Row label="Valid From" value={formatDate(leafCert.valid_from || result.cert_not_before)} />
                      <Row label="Valid Until" value={formatDate(leafCert.valid_until || result.cert_not_after)} />
                      <Row label="Key Algorithm" value={leafCert.public_key_algorithm || result.public_key_algorithm || "N/A"} />
                      <Row label="Key Size" value={(leafCert.public_key_size || result.public_key_size_bits) ? `${leafCert.public_key_size || result.public_key_size_bits} bits` : "N/A"} />
                      {(leafCert.subject_alternative_names?.length ?? 0) > 0 && (
                        <Row label="SANs" value={<span className="text-xs font-mono">{leafCert.subject_alternative_names.join(", ")}</span>} />
                      )}
                      {leafCert.cert_pqc_grade && (
                        <Row label="PQC Grade" value={<span className={`font-bold ${getGradeColor(leafCert.cert_pqc_grade)}`}>{leafCert.cert_pqc_grade} ({leafCert.cert_pqc_score})</span>} />
                      )}
                    </div>
                  </div>

                  {(certChain.intermediate_certificates || []).map((cert: any, index: number) => (
                    <div key={`inter-${index}`} className="mb-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Intermediate {index + 1}</div>
                      <div className="bg-muted/20 rounded px-3 py-2.5">
                        <Row label="Key Algorithm" value={cert.public_key_algorithm || "N/A"} />
                        <Row label="Key Size" value={cert.public_key_size ? `${cert.public_key_size} bits` : "N/A"} />
                        {cert.cert_pqc_grade && (
                          <Row label="PQC Grade" value={<span className={`font-bold font-mono ${getGradeColor(cert.cert_pqc_grade)}`}>{cert.cert_pqc_grade} ({cert.cert_pqc_score})</span>} />
                        )}
                      </div>
                    </div>
                  ))}

                  {(signatureAlgorithms.certificate_signatures?.length ?? 0) > 0 && (
                    <div className="mt-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Signature Algorithms</div>
                      <div className="rounded border border-border overflow-hidden">
                        {signatureAlgorithms.certificate_signatures.map((sig: any, idx: number) => (
                          <div key={idx} className="px-4 py-2.5 border-b border-border/50 last:border-0 bg-card">
                            <div className="flex items-center justify-between">
                              <code className="text-sm font-mono text-foreground">{sig.signature_algorithm}</code>
                              {sig.sig_pqc_grade && (
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-sm border ml-3 flex-shrink-0 font-mono ${getGradeBg(sig.sig_pqc_grade)}`}>
                                  {sig.sig_pqc_grade}
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground mt-0.5">
                              {sig.public_key_type} · {sig.public_key_size} bits · Hash: {sig.hash_algorithm}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Accordion>

                {/* Handshake Signature Algorithms */}
                {(signatureAlgorithms.handshake_signatures?.length ?? 0) > 0 && (
                  <Accordion
                    title="Handshake Signature Algorithms"
                    icon={<Zap className="w-3.5 h-3.5" />}
                    badge={signatureAlgorithms.handshake_signatures.length}
                  >
                    <div className="rounded border border-border overflow-hidden">
                      {signatureAlgorithms.handshake_signatures.map((sig: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between px-3 py-2 border-b border-border/50 last:border-0 bg-card">
                          <div>
                            <code className="text-[11px] font-mono font-semibold text-foreground">{sig.algorithm}</code>
                            <span className="text-[11px] text-muted-foreground ml-2">{sig.protocol}</span>
                          </div>
                          {sig.sig_pqc_grade && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm border ml-3 flex-shrink-0 font-mono ${getGradeBg(sig.sig_pqc_grade)}`}>
                              {sig.sig_pqc_grade}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </Accordion>
                )}

                {/* Compliance */}
                {Object.keys(complianceStatus).length > 0 && (
                  <Accordion
                    title="Compliance Status"
                    icon={<CheckCircle className="w-3.5 h-3.5" />}
                    badge={Object.keys(complianceStatus).length}
                  >
                    <div className="rounded border border-border overflow-hidden mb-3">
                      {Object.entries(complianceStatus).map(([standard, passed]) => (
                        <div key={standard} className="flex items-center justify-between px-3 py-2 border-b border-border/50 last:border-0 bg-card">
                          <span className="text-xs font-medium text-foreground">{standard}</span>
                          <PassBadge pass={passed} yes="Compliant" no="Non-Compliant" />
                        </div>
                      ))}
                    </div>
                    {criticalVulns.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 mb-1.5">Critical Findings</div>
                        {criticalVulns.map((v, i) => (
                          <div key={i} className="flex items-start gap-2 px-3 py-2 border border-red-200 dark:border-red-800 rounded mb-1 text-xs text-red-700 dark:text-red-200 bg-red-50/40 dark:bg-red-950/10">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-red-500" />
                            {v}
                          </div>
                        ))}
                      </div>
                    )}
                  </Accordion>
                )}
              </div>
            </div>
          </>
        ) : (
          /* ── Failed / HTTP ───────────────────────────────────── */
          <div className="max-w-xl mx-auto pt-6">
            <div className={`p-5 rounded border ${
              result.scan_status === "http_skipped"
                ? "border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/10"
                : "border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-950/10"
            }`}>
              {result.scan_status === "http_skipped" ? (
                <>
                  <div className="flex items-center gap-2.5 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-bold text-amber-800 dark:text-amber-100">HTTP Domain — Cannot Scan</div>
                      <div className="text-xs text-amber-600 dark:text-amber-300">No TLS/SSL encryption present</div>
                    </div>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-200 leading-relaxed">
                    {result.error_message || "PQC analysis requires an encrypted HTTPS connection."}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 mb-2">
                    <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-bold text-red-800 dark:text-red-100">Scan Failed</div>
                      <div className="text-xs text-red-600 dark:text-red-300">Unable to complete security analysis</div>
                    </div>
                  </div>
                  <p className="text-xs text-red-700 dark:text-red-200 leading-relaxed">
                    {result.error_message || "An unknown error occurred. Please retry."}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// ============================================================================
// DOMAIN CARD  (list view)
// ============================================================================

const DomainCard: React.FC<{ result: ScanResult; onViewDetails: () => void }> = ({
  result,
  onViewDetails,
}) => {
  const isSuccess = result.scan_status === "completed";
  const isHttpSkipped = result.scan_status === "http_skipped";
  const pqcScore = result.raw_response?.pqc_analysis?.overall_score ?? null;
  const pqcGrade = result.raw_response?.pqc_analysis?.overall_grade ?? "—";
  const quantumReady = result.raw_response?.pqc_analysis?.quantum_ready ?? false;

  return (
    <button
      onClick={onViewDetails}
      className="w-full text-left bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <code className="text-sm font-mono font-semibold text-foreground truncate flex-1">{result.url}</code>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 border ${
          isSuccess
            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
            : isHttpSkipped
            ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
            : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
        }`}>
          {isSuccess ? "Completed" : isHttpSkipped ? "HTTP" : "Failed"}
        </span>
      </div>

      {isSuccess && pqcScore !== null ? (
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-black flex-shrink-0 ${getGradeBg(pqcGrade as string)}`}>
            {pqcGrade}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="text-xl font-black tabular-nums text-foreground">{(pqcScore as number).toFixed(1)}</span>
              <span className="text-xs text-muted-foreground">/100</span>
              {quantumReady && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 ml-1"> Quantum Ready</span>
              )}
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${getScoreBarColor(pqcScore as number)}`} style={{ width: `${pqcScore}%` }} />
            </div>
          </div>
        </div>
      ) : isHttpSkipped ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">HTTP protocol — no TLS to analyze</p>
      ) : (
        <p className="text-xs text-muted-foreground">Scan did not complete</p>
      )}
    </button>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ResultsDetailPage: React.FC<ResultsDetailPageProps> = ({ scan, onBack, targetDomain }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<ScanResult | null>(null);

  const isSingleScan = !scan.detailedResults || scan.detailedResults.length === 0;
  if (isSingleScan && scan.url && !scan.url.startsWith("Scanning")) {
    return <DomainDetailPage result={scan} onBack={onBack} />;
  }

  useEffect(() => {
    if (targetDomain && scan.detailedResults) {
      setSearchQuery(targetDomain);
      const match = scan.detailedResults?.find(
        (r) => r.url.toLowerCase() === targetDomain.toLowerCase()
      );
      if (match) setSelectedDomain(match);
    }
  }, [targetDomain, scan.detailedResults]);

  const filteredResults = useMemo(() => {
    if (!scan.detailedResults) return [];
    return scan.detailedResults.filter((r) =>
      r.url.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [scan.detailedResults, searchQuery]);

  const stats = useMemo(() => {
    if (!scan.detailedResults) return { successful: 0, failed: 0, total: 0 };
    return {
      successful: scan.detailedResults.filter((r) => r.scan_status === "completed").length,
      failed: scan.detailedResults.filter((r) => r.scan_status !== "completed").length,
      total: scan.detailedResults.length,
    };
  }, [scan.detailedResults]);

  if (selectedDomain) {
    return <DomainDetailPage result={selectedDomain} onBack={() => setSelectedDomain(null)} />;
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <UnifiedBackButton onClick={onBack} label="Back to Scan History" className="mb-4" />
        <h2 className="text-sm font-bold text-foreground">Scan Results</h2>
        <p className="text-xs text-muted-foreground mt-0.5 font-mono">{scan.request_id}</p>
      </div>

      {/* Stats strip — compact bar */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {[
          { label: "Completed", value: stats.successful, color: "text-emerald-700 dark:text-emerald-400" },
          { label: "Failed",    value: stats.failed,     color: "text-red-600 dark:text-red-400" },
          { label: "Total",     value: stats.total,      color: "text-foreground" },
          { label: "Duration",  value: scan.execution_time_seconds ? `${scan.execution_time_seconds.toFixed(1)}s` : "—", color: "text-muted-foreground" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-border rounded px-3 py-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">{label}</div>
            <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Filter domains..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-8 text-xs" />
        {searchQuery && (
          <p className="text-xs text-muted-foreground mt-1">{filteredResults.length} of {stats.total} domains</p>
        )}
      </div>

      {filteredResults.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {filteredResults.map((result, index) => (
            <DomainCard
              key={result.id || `${result.url}-${index}`}
              result={result}
              onViewDetails={() => setSelectedDomain(result)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Globe className="w-7 h-7 text-muted-foreground/30 mb-2" />
          <p className="text-sm font-medium text-muted-foreground">
            {searchQuery ? "No matching domains" : "No results available"}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            {searchQuery ? "Try a different filter" : "Run a scan to see results here"}
          </p>
        </div>
      )}
    </div>
  );
};

export default ResultsDetailPage;
