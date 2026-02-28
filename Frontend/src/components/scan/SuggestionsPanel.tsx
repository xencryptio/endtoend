/**
 * SuggestionsPanel — Enterprise-grade quantum readiness action plan.
 * Derived entirely from pqc_analysis. No additional API calls.
 */
import React, { useState } from "react";
import {
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Shield,
  Clock,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComponentScore {
  weighted_average: number;
  grade: string;
  pqc_percentage: number;
  hybrid_percentage: number;
  quantum_safe_count: number;
  algorithm_count: number;
}

interface QuantumReadinessDetail {
  hndl_risk?: string;
  hndl_reason?: string;
  migration_tier?: number;
  migration_note?: string;
  hybrid_kex_groups?: string[];
  classical_kex_groups?: string[];
  signature_algorithms?: string[];
  strong_symmetric?: string[];
  weak_symmetric?: string[];
  kex_score?: number;
  sym_score?: number;
  sig_score?: number;
  nist_standards_used?: string[];
  draft_standards_used?: string[];
  legacy_protocols?: string[];
  proto_score?: number;
}

interface PqcAnalysis {
  overall_score: number;
  overall_grade: string;
  security_level: string;
  quantum_ready: boolean;
  hybrid_ready: boolean;
  quantum_readiness_detail?: QuantumReadinessDetail;
  components?: {
    kex?: ComponentScore;
    signature?: ComponentScore;
    symmetric?: ComponentScore;
    hash?: ComponentScore;
    [key: string]: ComponentScore | undefined;
  };
  compliance_status?: Record<string, boolean>;
  critical_vulnerabilities?: string[];
}

interface SuggestionsPanelProps {
  pqcAnalysis: PqcAnalysis | null | undefined;
  domain?: string;
}

// ---------------------------------------------------------------------------
// Derived data (same logic, cleaner output shape)
// ---------------------------------------------------------------------------

interface ActionStep {
  step: number;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "ONGOING";
  title: string;
  /** One-sentence imperative summary shown always */
  summary: string;
  /** Config snippet — shown inline when present */
  snippet?: string;
  /** Full explanation — hidden behind "Details" toggle */
  detail: string;
  effort: string;
  impact: string;
  nistRef: string;
}

function deriveData(p: PqcAnalysis, domain: string) {
  const hybrid_ready = p.hybrid_ready ?? false;
  const quantum_ready = p.quantum_ready ?? false;
  const qr = p.quantum_readiness_detail ?? {};
  const comps = p.components ?? {};
  const kexScore = comps.kex?.weighted_average ?? 0;
  const symScore = comps.symmetric?.weighted_average ?? 0;
  const sigScore = comps.signature?.weighted_average ?? 0;
  const hndlRisk = (qr.hndl_risk as string) ?? (hybrid_ready ? "low" : "high");
  const migrationTier = qr.migration_tier ?? (hybrid_ready ? (symScore >= 70 ? 1 : 2) : 3);
  const hybridGroups = qr.hybrid_kex_groups ?? [];
  const nistStandards = qr.nist_standards_used ?? [];
  const draftStandards = qr.draft_standards_used ?? [];
  const weakSym = qr.weak_symmetric ?? [];
  const legacyProtocols = (qr.legacy_protocols as string[] | undefined) ?? [];
  const compliance = p.compliance_status ?? {};

  // Action steps
  const steps: ActionStep[] = [];
  let n = 1;

  if (legacyProtocols.length > 0) {
    steps.push({
      step: n++,
      priority: "CRITICAL",
      title: "Disable Deprecated TLS Protocols",
      summary: `Remove ${legacyProtocols.join(" and ")} — legacy sessions bypass PQC hybrid key exchange entirely.`,
      snippet: "ssl_protocols TLSv1.2 TLSv1.3;  # nginx\nSSLProtocol -all +TLSv1.2 +TLSv1.3  # apache\n# OpenSSL: MinProtocol = TLSv1.2",
      detail:
        `This server accepts ${legacyProtocols.join(" and ")}, deprecated by NIST SP 800-52r2 (2024), PCI DSS 4.0 §4.2.1, and RFC 8996. ` +
        "Even with PQC hybrid KEX deployed on TLS 1.3, clients negotiating these legacy versions receive zero quantum protection " +
        "and remain exposed to POODLE, BEAST, SWEET32, and record-and-decrypt interception. " +
        "Apply the change at every layer: origin server, CDN, and load balancer.",
      effort: "Low — one config line per layer",
      impact: "Closes downgrade attack vector; required for PCI DSS 4.0 compliance",
      nistRef: "NIST SP 800-52r2 §3.1  PCI DSS 4.0 §4.2.1  RFC 8996",
    });
  }

  if (!hybrid_ready) {
    steps.push({
      step: n++,
      priority: "CRITICAL",
      title: "Deploy PQC Hybrid Key Exchange",
      summary: "Add X25519MLKEM768 as the first TLS named group — this single change eliminates HNDL exposure.",
      snippet: "# OpenSSL 3.2+ / nginx 1.25+\nssl_ecdh_curve X25519MLKEM768:X25519MLKEM1024:X25519:prime256v1;\n\n# Go 1.23+ (server)\ntls.Config{CurvePreferences: []tls.CurveID{tls.X25519MLKEM768}}",
      detail:
        "Configure X25519MLKEM768 (FIPS 203 / IANA group 4588) as the first named group so it is negotiated " +
        "against all compliant clients. Add X25519MLKEM1024 (group 4589) as secondary. " +
        "Classical groups (X25519, P-256) remain in the list for backward compatibility — hybrid mode means " +
        "both algorithms must be broken to compromise the session. " +
        "Requires OpenSSL 3.2+, BoringSSL (trunk), or Go 1.23+.",
      effort: "Low–Medium — library upgrade may be needed",
      impact: "Eliminates Harvest-Now-Decrypt-Later risk for all future TLS sessions",
      nistRef: "NIST FIPS 203 (ML-KEM)  CISA PQC Migration Guidance 2024 §3.2",
    });
  } else if (kexScore < 70) {
    steps.push({
      step: n++,
      priority: "HIGH",
      title: "Promote ML-KEM Groups to Top of Preference List",
      summary: "Ensure ML-KEM-768/1024 groups are listed first so they are actually negotiated, not just available.",
      snippet: "# Verify group negotiation in production:\nopenssl s_client -connect " + domain + ":443 -groups X25519MLKEM768 2>&1 | grep 'Server Temp Key'",
      detail:
        `Hybrid KEX score is moderate (${kexScore.toFixed(0)}/100). Having the groups available is insufficient ` +
        "if classical groups appear earlier in the preference list — the server will negotiate X25519 with modern clients " +
        "rather than X25519MLKEM768. Audit your TLS configuration and move ML-KEM groups to the top.",
      effort: "Low — config reorder only",
      impact: "Ensures hybrid KEX is actually used, not just configured",
      nistRef: "NIST FIPS 203 (ML-KEM)  IETF RFC 8446 §4.2.7",
    });
  }

  if (symScore < 70) {
    steps.push({
      step: n++,
      priority: "HIGH",
      title: "Harden Symmetric Cipher Suite",
      summary: "Enable only AES-256-GCM and ChaCha20-Poly1305; remove all CBC, 3DES, and RC4 cipher suites.",
      snippet: "# nginx — TLS 1.3 only (symmetric is already AES-256)\nssl_ciphers TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256;\n\n# TLS 1.2 fallback (if needed)\nssl_ciphers ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;",
      detail:
        `Symmetric score is ${symScore.toFixed(0)}/100. AES-256 provides ~128-bit post-quantum security (Grover-halved from 256). ` +
        "AES-128 provides only ~64-bit post-quantum security — insufficient. " +
        "Ensure TLS 1.3 (where AES-256-GCM is the default) is used for all sessions. " +
        (weakSym.length > 0 ? `Weak suites currently accepted: ${weakSym.slice(0, 4).join(", ")}.` : ""),
      effort: "Low — cipher list configuration",
      impact: "Achieves Grover-safe symmetric layer per CNSA 2.0",
      nistRef: "NIST SP 800-52r2 §3.3.1.1  CNSA 2.0",
    });
  }

  if (!hybrid_ready || kexScore < 75) {
    steps.push({
      step: n++,
      priority: "HIGH",
      title: "Enforce TLS 1.3 as Minimum Protocol",
      summary: "Disable TLS 1.2 or restrict it to AEAD-only suites; TLS 1.3 mandates forward secrecy by design.",
      snippet: "# Test: confirm TLS 1.3 is negotiated\nopenssl s_client -connect " + domain + ":443 -tls1_3 -brief",
      detail:
        "TLS 1.3 eliminates negotiation of weak cipher suites and removes RSA key exchange. " +
        "If legacy client support requires TLS 1.2, restrict its cipher list to ECDHE+AEAD only " +
        "(ECDHE-ECDSA-AES256-GCM-SHA384, ECDHE-RSA-AES256-GCM-SHA384). " +
        "Remove any suite containing CBC, RC4, or 3DES.",
      effort: "Low — server configuration",
      impact: "Eliminates downgrade attacks and AEAD enforcement",
      nistRef: "NIST SP 800-52r2  PCI DSS 4.0 req. 4.2.1",
    });
  }

  if (sigScore < 20) {
    steps.push({
      step: n++,
      priority: "MEDIUM",
      title: "Upgrade Certificate to ECDSA (Interim Step)",
      summary: "Replace RSA-2048 certificates with ECDSA P-256/P-384 now; plan ML-DSA migration when CAs support it (~2026-2028).",
      detail:
        `Certificate signature score is ${sigScore.toFixed(0)}/100. No public CA currently issues ML-DSA (FIPS 204) or SLH-DSA (FIPS 205) certificates. ` +
        "ECDSA P-384 is the best available option today. Subscribe to CA/Browser Forum announcements for PQC certificate availability. " +
        "Hybrid X.509 certificates (classical + ML-DSA) may be available as an intermediate step.",
      effort: "Low — certificate reissuance",
      impact: "Improves current security posture; prepares for PQC certificate migration",
      nistRef: "NIST FIPS 204 (ML-DSA)  FIPS 205 (SLH-DSA)",
    });
  }

  steps.push({
    step: n++,
    priority: "MEDIUM",
    title: "Monitor CA Support for PQC Certificates",
    summary: "No public CA issues ML-DSA certs today — subscribe to CA/Browser Forum updates and plan rotation for ~2026–2028.",
    detail:
      "NIST finalised ML-DSA (FIPS 204) and SLH-DSA (FIPS 205) in August 2024. Public CAs are expected to begin issuing PQC certificates " +
      "between 2026 and 2028. Plan a certificate rotation workflow now so you can execute it quickly when CAs go live. " +
      "Hybrid X.509 certificates (traditional + ML-DSA in a single cert) may allow a graceful transition.",
    effort: "Monitor only — no action required today",
    impact: "Completes quantum readiness once PQC certs are available",
    nistRef: "NIST FIPS 204 (ML-DSA)  FIPS 205 (SLH-DSA)",
  });

  if (nistStandards.length > 0) {
    steps.push({
      step: n++,
      priority: "LOW",
      title: "Retire Kyber Draft Groups After Broad Adoption",
      summary: "Once 95%+ of clients support FIPS 203 ML-KEM, remove draft Kyber groups to simplify your TLS config.",
      detail:
        "Kyber draft groups (X25519Kyber768Draft00, etc.) provided early hybrid KEX before IETF standardisation. " +
        "With ML-KEM now finalised (FIPS 203), these draft groups are redundant for clients that support the final standard. " +
        "Remove them once client adoption of final ML-KEM groups exceeds ~95% in your traffic.",
      effort: "Low — remove from named-groups list",
      impact: "Configuration hygiene — no security change",
      nistRef: "IETF Hybrid TLS Key Exchange (draft)",
    });
  }

  steps.push({
    step: n++,
    priority: "ONGOING",
    title: "Automate Cryptographic Inventory (Crypto-Agility)",
    summary: "Add PQC scanning to your CI/CD pipeline and maintain a Cryptographic Bill of Materials (CBOM).",
    snippet: "# Re-scan after every TLS config change or library update\n# Integrate this tool via its REST API into your pipeline",
    detail:
      "Re-scan on every server configuration change and after TLS library upgrades. " +
      "Maintain a Cryptographic Bill of Materials (CBOM) as recommended by CISA to track every cryptographic asset. " +
      "Crypto-agility — the ability to swap algorithms quickly — is the meta-goal of PQC migration.",
    effort: "Medium — pipeline integration",
    impact: "Continuous visibility into cryptographic posture",
    nistRef: "CISA Quantum-Readiness Roadmap 2023  NISTIR 8547",
  });

  // Positives
  const positives: string[] = [];
  if (quantum_ready) positives.push("Quantum Readiness achieved — hybrid KEX and Grover-safe symmetric are both active.");
  if (hybrid_ready) positives.push(`PQC hybrid key exchange deployed (${hybridGroups.length} group${hybridGroups.length !== 1 ? "s" : ""}). Modern clients negotiate post-quantum-secure sessions.`);
  if (nistStandards.length > 0) positives.push(`NIST FIPS 203 ML-KEM groups active: ${nistStandards.slice(0, 4).join(", ")}.`);
  if (draftStandards.length > 0) positives.push(`Kyber draft groups also supported: ${draftStandards.slice(0, 4).join(", ")} — backward-compatible with older clients.`);
  if (symScore >= 80) positives.push(`Symmetric encryption is Grover-safe (${symScore.toFixed(0)}/100). AES-256 provides ~128-bit post-quantum security.`);
  else if (symScore >= 60) positives.push(`Symmetric encryption adequate (${symScore.toFixed(0)}/100) with modern TLS 1.3 suites.`);
  if (compliance["PCI DSS 4.0"]) positives.push("PCI DSS 4.0 cryptographic requirements met.");
  if (compliance["NIST 800-52r2"]) positives.push("NIST SP 800-52r2 compliance met.");

  const tierLabels: Record<number, string> = {
    1: "Tier 1 — Migration Complete",
    2: "Tier 2 — KEX Done, Symmetric Pending",
    3: "Tier 3 — Not Started",
  };
  const tierLabel = tierLabels[migrationTier] ?? "Tier 3 — Not Started";

  return { steps, positives, migrationTier, tierLabel, hndlRisk, hybridGroups, legacyProtocols };
}

// ---------------------------------------------------------------------------
// Priority config
// ---------------------------------------------------------------------------

const PRIORITY = {
  CRITICAL: {
    label: "Critical",
    leftBorder: "border-l-2 border-l-red-600 dark:border-l-red-500",
    text: "text-red-600 dark:text-red-400",
    badge: "text-red-600 dark:text-red-400",
    order: 0,
  },
  HIGH: {
    label: "High",
    leftBorder: "border-l-2 border-l-orange-500 dark:border-l-orange-400",
    text: "text-orange-600 dark:text-orange-400",
    badge: "text-orange-600 dark:text-orange-400",
    order: 1,
  },
  MEDIUM: {
    label: "Medium",
    leftBorder: "border-l-2 border-l-amber-500 dark:border-l-amber-400",
    text: "text-amber-600 dark:text-amber-500",
    badge: "text-amber-700 dark:text-amber-400",
    order: 2,
  },
  LOW: {
    label: "Low",
    leftBorder: "border-l-2 border-l-blue-400 dark:border-l-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    badge: "text-blue-600 dark:text-blue-400",
    order: 3,
  },
  ONGOING: {
    label: "Ongoing",
    leftBorder: "border-l-2 border-l-slate-300 dark:border-l-slate-600",
    text: "text-muted-foreground",
    badge: "text-muted-foreground",
    order: 4,
  },
} as const;

// ---------------------------------------------------------------------------
// ActionCard — the core building block
// ---------------------------------------------------------------------------

const ActionCard: React.FC<{ step: ActionStep; index: number }> = ({ step, index }) => {
  const [open, setOpen] = useState(false);
  const p = PRIORITY[step.priority];

  return (
    <div className={`border border-border ${p.leftBorder} rounded-r bg-card overflow-hidden`}>
      {/* Always-visible row */}
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Priority label + step number — compact left column */}
        <div className="flex-shrink-0 w-16 pt-0.5">
          <div className={`text-xs font-bold uppercase ${p.text}`}>{p.label}</div>
          <div className="text-xs text-muted-foreground/60 tabular-nums">Step {step.step}</div>
        </div>

        {/* Title + summary + snippet + chips */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground mb-0.5">{step.title}</div>
          <p className="text-sm text-muted-foreground leading-relaxed">{step.summary}</p>

          {step.snippet && (
            <div className="mt-2 bg-slate-900 dark:bg-black rounded-sm px-3 py-2">
              <pre className="text-[11px] font-mono text-slate-200 whitespace-pre overflow-x-auto leading-relaxed">
                {step.snippet}
              </pre>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span><span className="font-medium text-foreground/70">Effort:</span> {step.effort}</span>
            <span><span className="font-medium text-foreground/70">Impact:</span> {step.impact}</span>
          </div>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Expandable details */}
      {open && (
        <div className="border-t border-border/50 px-4 py-3 bg-muted/10">
          <p className="text-sm text-foreground/80 leading-relaxed">{step.detail}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground/60 pt-1.5">
            <Shield className="w-2.5 h-2.5 flex-shrink-0" />
            <span>{step.nistRef}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const SuggestionsPanel: React.FC<SuggestionsPanelProps> = ({
  pqcAnalysis,
  domain = "This server",
}) => {
  const [showPositives, setShowPositives] = useState(false);

  if (!pqcAnalysis) {
    return (
      <div className="border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
        No PQC analysis data available.
      </div>
    );
  }

  const { steps, positives, migrationTier, tierLabel, hndlRisk, hybridGroups } = deriveData(
    pqcAnalysis,
    domain
  );

  // Sort by priority order so CRITICAL always leads
  const sortedSteps = [...steps].sort(
    (a, b) => PRIORITY[a.priority].order - PRIORITY[b.priority].order
  );

  const criticalCount = steps.filter((s) => s.priority === "CRITICAL").length;
  const highCount     = steps.filter((s) => s.priority === "HIGH").length;
  const actionCount   = criticalCount + highCount;

  const hndlColor =
    hndlRisk === "low"
      ? "text-emerald-600 dark:text-emerald-400"
      : hndlRisk === "medium"
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";

  const tierColor =
    migrationTier === 1
      ? "text-emerald-600 dark:text-emerald-400"
      : migrationTier === 2
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";

  const cnsa = [
    {
      label: "ML-KEM Hybrid KEX",
      ok: pqcAnalysis.hybrid_ready,
      detail: pqcAnalysis.hybrid_ready
        ? `${hybridGroups.length} group(s) active`
        : "Deploy X25519MLKEM768",
    },
    {
      label: "AES-256 Symmetric",
      ok: (pqcAnalysis.components?.symmetric?.weighted_average ?? 0) >= 70,
      detail:
        (pqcAnalysis.components?.symmetric?.weighted_average ?? 0) >= 70
          ? "Grover-safe ciphers in use"
          : "Upgrade to AES-256-GCM",
    },
    {
      label: "PQC Certificates",
      ok: false,
      pending: true,
      detail: "Awaiting CA support (~2026–2028)",
    },
  ];

  return (
    <div className="border border-border rounded overflow-hidden">
      {/*  Panel header  */}
      <div className="flex items-center justify-between px-5 py-3 bg-muted/20 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-foreground">Quantum Migration Action Plan</span>
          {actionCount > 0 && (
            <span className="text-xs font-semibold border border-red-400 dark:border-red-700 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-sm">
              {actionCount} urgent
            </span>
          )}
        </div>
        {/* Status strip */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            HNDL Risk:{" "}
            <span className={`font-semibold capitalize ${hndlColor}`}>{hndlRisk}</span>
          </span>
          <span>·</span>
          <span className={`font-semibold ${tierColor}`}>{tierLabel}</span>
        </div>
      </div>

      {/*  Action steps  */}
      <div className="p-4 space-y-1.5 bg-card">
        {sortedSteps.map((step, i) => (
          <ActionCard key={step.step} step={step} index={i} />
        ))}
      </div>

      {/*  CNSA 2.0 Checklist — compact 3-column  */}
      <div className="border-t border-border px-5 py-3.5 bg-muted/10">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          CNSA 2.0 Compliance
        </div>
        <div className="grid grid-cols-3 divide-x divide-border">
          {cnsa.map(({ label, ok, pending, detail }) => (
            <div key={label} className="px-3 first:pl-0 last:pr-0">
              <div className="flex items-center gap-1 mb-0.5">
                {ok ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                ) : pending ? (
                  <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                )}
                <span className="text-xs font-semibold text-foreground">{label}</span>
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed pl-4">{detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/*  What's working (collapsed by default)  */}
      {positives.length > 0 && (
        <div className="border-t border-border">
          <button
            onClick={() => setShowPositives((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-2.5 bg-muted/10 hover:bg-muted/20 transition-colors text-left"
          >
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-foreground">What's already working</span>
              <span className="text-xs px-1 py-0.5 rounded-sm bg-muted text-muted-foreground font-medium">
                {positives.length}
              </span>
            </div>
            {showPositives ? (
              <ChevronUp className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
          {showPositives && (
            <div className="px-5 py-3 bg-card space-y-1.5 border-t border-border">
              {positives.map((item, i) => (
                <div key={i} className="flex items-start gap-1.5 text-sm text-foreground/80">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SuggestionsPanel;
