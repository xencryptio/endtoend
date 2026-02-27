/**
 * SuggestionsPanel
 *
 * Renders a quantum readiness migration guide derived entirely from the
 * pqc_analysis object that is already embedded in each scan result.
 * No additional API calls are made.
 */
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Shield,
  Zap,
  Cpu,
  Lock,
  Info,
  AlertCircle,
  ArrowRight,
  Clock,
  Layers,
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
  /** The pqc_analysis object from the scan result */
  pqcAnalysis: PqcAnalysis | null | undefined;
  domain?: string;
}

// ---------------------------------------------------------------------------
// Derived suggestion logic (mirrors suggestions.py in TypeScript)
// ---------------------------------------------------------------------------

interface RoadmapStep {
  step: number;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "ONGOING";
  title: string;
  description: string;
  nistRef: string;
  effort: string;
  impact: string;
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
  const score = p.overall_score;
  const grade = p.overall_grade;

  // ---- Overall assessment ---
  let assessment: string;
  if (quantum_ready) {
    assessment =
      `${domain} has achieved Quantum Readiness Tier 1. ` +
      `PQC hybrid key exchange is active and symmetric encryption is Grover-safe, ` +
      `eliminating HNDL risk for active sessions. Grade: ${grade} (${score.toFixed(1)}/100).`;
  } else if (hybrid_ready) {
    assessment =
      `${domain} is on the quantum migration path (grade ${grade}, ${score.toFixed(1)}/100). ` +
      "PQC hybrid key exchange is deployed, substantially reducing HNDL exposure. " +
      "Complete the transition by hardening symmetric algorithms.";
  } else {
    assessment =
      `${domain} uses classical TLS (grade ${grade}, ${score.toFixed(1)}/100). ` +
      "No PQC hybrid key exchange detected. Data encrypted today is vulnerable to retroactive " +
      "decryption once cryptographically-relevant quantum computers (CRQCs) are available. " +
      "Deploying X25519MLKEM768 is the single highest-impact change you can make.";
  }

  // ---- Positives ---
  const positives: string[] = [];
  if (quantum_ready) positives.push("Quantum Readiness ACHIEVED — hybrid KEX + Grover-safe symmetric active.");
  if (hybrid_ready) {
    positives.push(
      `PQC Hybrid Key Exchange deployed (${hybridGroups.length} hybrid group(s)). Modern clients use post-quantum-secure key agreement.`
    );
  }
  if (nistStandards.length > 0) {
    positives.push(`NIST-standardised ML-KEM groups active: ${nistStandards.slice(0, 4).join(", ")} (FIPS 203).`);
  }
  if (draftStandards.length > 0) {
    positives.push(`Kyber draft groups also supported: ${draftStandards.slice(0, 4).join(", ")} — backward-compatible with older clients.`);
  }
  if (symScore >= 80) {
    positives.push(`Symmetric encryption is Grover-safe (${symScore.toFixed(0)}/100). AES-256 provides ~128-bit post-quantum security.`);
  } else if (symScore >= 60) {
    positives.push(`Symmetric encryption is adequate (${symScore.toFixed(0)}/100) with modern TLS 1.3 cipher suites.`);
  }
  if (compliance["PCI DSS 4.0"]) positives.push("PCI DSS 4.0 cryptographic requirements met.");
  if (compliance["NIST 800-52r2"]) positives.push("NIST SP 800-52r2 compliance met.");

  // ---- Gaps ---
  const gaps: string[] = [];
  if (!hybrid_ready) {
    gaps.push(
      "No PQC hybrid key exchange detected — CRITICAL gap. " +
        "Without hybrid KEX, recorded TLS sessions can be decrypted once CRQCs arrive. " +
        "Solution: add X25519MLKEM768 as the first named group in your TLS configuration."
    );
  } else if (kexScore < 70) {
    gaps.push(
      `Hybrid KEX score moderate (${kexScore.toFixed(0)}/100). Ensure ML-KEM-768/1024 groups are listed BEFORE classical groups on the server so they are negotiated preferentially.`
    );
  }
  if (symScore < 60) {
    gaps.push(
      `Symmetric encryption score low (${symScore.toFixed(0)}/100). Disable 3DES/RC4 and TLS 1.0/1.1 ciphers. Prioritise AES-256-GCM and ChaCha20-Poly1305.`
    );
  }
  if (sigScore < 20) {
    gaps.push(
      `Certificate signature score very low (${sigScore.toFixed(0)}/100). Consider ECDSA P-256/P-384 as an interim upgrade. Monitor CA support for ML-DSA (FIPS 204) certificates, expected ~2026-2028.`
    );
  }
  if (weakSym.length > 0) {
    gaps.push(`Weak symmetric suites still accepted: ${weakSym.slice(0, 3).join(", ")}. Disable these to raise the symmetric component score.`);
  }
  if (legacyProtocols.length > 0) {
    gaps.push(
      `Deprecated TLS protocols accepted: ${legacyProtocols.join(", ")}. ` +
      "TLS 1.0 and TLS 1.1 are deprecated by NIST SP 800-52r2, PCI DSS 4.0, and RFC 8996. " +
      "Legacy sessions bypass PQC hybrid key exchange, exposing traffic to downgrade attacks (POODLE, BEAST) and record-and-decrypt interception. " +
      "Disable these protocol versions at your server and CDN/load balancer layer immediately."
    );
  }
  if (!compliance["CNSA 2.0 (Quantum-Ready)"]) {
    gaps.push("Not yet CNSA 2.0 compliant. Full compliance requires ML-KEM hybrid KEX + AES-256. Certificate migration awaits PQC CA availability.");
  }

  // ---- Roadmap ---
  const roadmap: RoadmapStep[] = [];
  let n = 1;
  if (legacyProtocols.length > 0) {
    roadmap.push({
      step: n++,
      priority: "CRITICAL",
      title: "Disable Deprecated TLS Protocols",
      description:
        `This server accepts ${legacyProtocols.join(" and ")}, deprecated by NIST SP 800-52r2, PCI DSS 4.0 (§4.2.1), and RFC 8996. ` +
        "Even when PQC hybrid KEX is deployed on TLS 1.3, sessions that negotiate legacy protocol versions receive none of that protection. " +
        "Attackers can force a downgrade to these versions (POODLE, BEAST, SWEET32) and intercept traffic. " +
        "Set MinProtocol = TLSv1.2 in OpenSSL, ssl_protocols TLSv1.2 TLSv1.3 in nginx, " +
        "or SSLProtocol -all +TLSv1.2 +TLSv1.3 in Apache. Verify at your CDN/load balancer layer as well.",
      nistRef: "NIST SP 800-52r2 §3.1, PCI DSS 4.0 §4.2.1, RFC 8996",
      effort: "Low — one configuration line per server/CDN",
      impact: "Closes downgrade attack vector; required for PCI DSS 4.0 and CNSA 2.0 compliance",
    });
  }
  if (!hybrid_ready) {
    roadmap.push({
      step: n++,
      priority: "CRITICAL",
      title: "Deploy PQC Hybrid Key Exchange",
      description:
        "Configure X25519MLKEM768 (FIPS 203 / IANA group 4588) as the first TLS named group. " +
        "Add X25519MLKEM1024 (group 4589) as secondary. This single change eliminates HNDL " +
        "exposure for all future TLS sessions.",
      nistRef: "NIST FIPS 203 (ML-KEM), CISA PQC Migration Guidance 2024 §3.2",
      effort: "Low-Medium — OpenSSL 3.2+ / BoringSSL / Go 1.23+ with one config line",
      impact: "Eliminates Harvest-Now-Decrypt-Later risk immediately",
    });
  }
  if (symScore < 70) {
    roadmap.push({
      step: n++,
      priority: "HIGH",
      title: "Harden Symmetric Cipher Suite",
      description:
        "Enable only AES-256-GCM-SHA384 and TLS_CHACHA20_POLY1305_SHA256. " +
        "Remove CBC-mode suites and any suite using RC4, 3DES, or DES. " +
        "Disable TLS 1.0 and TLS 1.1 entirely.",
      nistRef: "NIST SP 800-52r2 §3.3.1.1, CNSA 2.0",
      effort: "Low — server configuration change only",
      impact: "Achieves 128-bit post-quantum security for symmetric layer (Grover-safe)",
    });
  }
  if (!hybrid_ready || kexScore < 75) {
    roadmap.push({
      step: n++,
      priority: "HIGH",
      title: "Enable TLS 1.3 Exclusively",
      description:
        "TLS 1.3 mandates forward secrecy and eliminates negotiation of weak cipher suites. " +
        "Disable TLS 1.0 and TLS 1.1. Restrict TLS 1.2 to strong AEAD-only cipher suites if legacy client support is needed.",
      nistRef: "NIST SP 800-52r2, PCI DSS 4.0 requirement 4.2.1",
      effort: "Low — server configuration change",
      impact: "Eliminates downgrade attacks and enforces AEAD-only ciphers",
    });
  }
  roadmap.push({
    step: n++,
    priority: "MEDIUM",
    title: "Monitor CA Support for PQC Certificates",
    description:
      "No public CA currently issues ML-DSA (FIPS 204) or SLH-DSA (FIPS 205) certificates. " +
      "Subscribe to CA/Browser Forum announcements. Plan a certificate rotation when CAs start issuing PQC certs (~2026-2028). " +
      "Hybrid X.509 certificates (classical + ML-DSA) may be available as an intermediate step.",
    nistRef: "NIST FIPS 204 (ML-DSA), FIPS 205 (SLH-DSA)",
    effort: "Monitor only — no action required today",
    impact: "Completes quantum readiness once PQC certs are available",
  });
  if (nistStandards.length > 0) {
    roadmap.push({
      step: n++,
      priority: "LOW",
      title: "Retire Kyber Draft Groups After Broad ML-KEM Adoption",
      description:
        "Once client adoption of FIPS 203 ML-KEM groups exceeds ~95%, remove draft Kyber groups " +
        "(X25519Kyber768Draft00, etc.) to reduce configuration complexity.",
      nistRef: "IETF Hybrid TLS Key Exchange (draft)",
      effort: "Low — remove from named-groups list",
      impact: "Simplification — no security regression",
    });
  }
  roadmap.push({
    step: n++,
    priority: "ONGOING",
    title: "Automate Cryptographic Inventory (Crypto-Agility)",
    description:
      "Integrate PQC scanning into your CI/CD pipeline. Re-scan on every server configuration change " +
      "and after TLS library upgrades. Maintain a Cryptographic Bill of Materials (CBOM) as recommended by CISA.",
    nistRef: "CISA Quantum-Readiness Roadmap 2023, NISTIR 8547",
    effort: "Medium — pipeline integration",
    impact: "Continuous visibility into cryptographic posture",
  });

  // ---- NIST timeline ---
  const timelines: Record<number, string> = {
    1: "You are at CNSA 2.0 Tier 1 — hybrid KEX deployed and symmetric is Grover-safe. CISA recommends completing certificate migration by 2030.",
    2: "You are at CNSA 2.0 Tier 2 — hybrid KEX deployed but symmetric needs hardening. CISA recommends completing symmetric hardening in 2025.",
    3: "You are at CNSA 2.0 Tier 3 — KEX migration not yet started. CISA and NSA CNSA 2.0 mark KEX migration as the highest priority for 2024/2025. Commercial deadline: 2026-2028.",
  };
  const nistTimeline = timelines[migrationTier] ?? timelines[3];

  return { assessment, positives, gaps, roadmap, nistTimeline, migrationTier, hndlRisk, hybridGroups, legacyProtocols };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const priorityConfig = {
  CRITICAL: { color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900", dot: "bg-red-500" },
  HIGH:     { color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900", dot: "bg-orange-500" },
  MEDIUM:   { color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900", dot: "bg-yellow-500" },
  LOW:      { color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900", dot: "bg-blue-500" },
  ONGOING:  { color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700", dot: "bg-slate-400" },
};

const hndlConfig = {
  low:    { label: "Low HNDL Risk",    color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900", icon: CheckCircle },
  medium: { label: "Medium HNDL Risk", color: "text-yellow-700 dark:text-yellow-300",  bg: "bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-900",   icon: AlertTriangle },
  high:   { label: "High HNDL Risk",   color: "text-red-700 dark:text-red-300",         bg: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900",               icon: XCircle },
};

interface AccordionProps {
  title: string;
  icon: React.ReactNode;
  badgeCount?: number;
  badgeVariant?: "success" | "warning" | "danger";
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const Accordion: React.FC<AccordionProps> = ({ title, icon, badgeCount, badgeVariant = "success", defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  const badgeColors = {
    success: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300",
    warning: "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300",
    danger:  "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300",
  };
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 bg-card hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="font-semibold text-foreground">{title}</span>
          {badgeCount !== undefined && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeColors[badgeVariant]}`}>
              {badgeCount}
            </span>
          )}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-2 bg-card/60 space-y-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const SuggestionsPanel: React.FC<SuggestionsPanelProps> = ({ pqcAnalysis, domain = "This server" }) => {
  if (!pqcAnalysis) {
    return (
      <div className="bg-card/80 border rounded-2xl p-8 text-center text-muted-foreground text-sm">
        No PQC analysis data available to generate suggestions.
      </div>
    );
  }

  const { assessment, positives, gaps, roadmap, nistTimeline, migrationTier, hndlRisk, hybridGroups, legacyProtocols } =
    deriveData(pqcAnalysis, domain);

  const hndl = hndlConfig[hndlRisk as keyof typeof hndlConfig] ?? hndlConfig.high;
  const HndlIcon = hndl.icon;

  const tierLabels = ["", "Tier 1 — Migration Complete", "Tier 2 — KEX Done, Sym Pending", "Tier 3 — Migration Not Started"];
  const tierColors = ["", "text-emerald-600", "text-yellow-600", "text-red-600"];

  return (
    <div className="bg-card/80 border rounded-2xl p-10 shadow-[0_4px_14px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.4)] backdrop-blur-sm space-y-6">
      {/* Header */}
      <div className="pb-6 border-b">
        <h3 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/40 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          Quantum Readiness Suggestions
        </h3>
        <p className="text-sm text-muted-foreground mt-2">
          Actionable migration guidance based on NIST FIPS 203/204/205 and CISA PQC Migration Guidance 2024.
        </p>
      </div>

      {/* Summary strip: HNDL risk + Migration tier */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* HNDL risk badge */}
        <div className={`flex items-start gap-4 p-5 rounded-xl border ${hndl.bg}`}>
          <HndlIcon className={`w-6 h-6 mt-0.5 flex-shrink-0 ${hndl.color}`} />
          <div>
            <div className={`font-bold text-sm ${hndl.color}`}>{hndl.label}</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {pqcAnalysis.quantum_readiness_detail?.hndl_reason ??
                (hndlRisk === "low"
                  ? "Hybrid PQC/classical key exchange is deployed. HNDL attacks are mitigated for active sessions."
                  : "No PQC hybrid KEX detected. Data encrypted today may be decryptable by future quantum computers.")}
            </div>
          </div>
        </div>

        {/* Migration tier */}
        <div className="flex items-start gap-4 p-5 rounded-xl border bg-card/60">
          <Layers className="w-6 h-6 mt-0.5 flex-shrink-0 text-primary" />
          <div>
            <div className={`font-bold text-sm ${tierColors[migrationTier]}`}>
              CNSA 2.0 {tierLabels[migrationTier]}
            </div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{nistTimeline}</div>
          </div>
        </div>
      </div>

      {/* Legacy Protocol Alert — shown prominently when TLS 1.0/1.1 are accepted */}
      {legacyProtocols.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-4 p-5 rounded-xl border bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800"
        >
          <XCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-red-700 dark:text-red-300 mb-2 flex flex-wrap items-center gap-2">
              Deprecated TLS Protocols Detected
              {legacyProtocols.map((proto) => (
                <span key={proto} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-200 dark:bg-red-900/60 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-700">
                  {proto}
                </span>
              ))}
            </div>
            <p className="text-xs text-red-700/80 dark:text-red-300/80 leading-relaxed">
              This server accepts <strong>{legacyProtocols.join(" and ")}</strong>, which are
              deprecated by NIST SP 800-52r2 (2024), PCI DSS 4.0 §4.2.1, and RFC 8996.{" "}
              Even if PQC hybrid key exchange is deployed on TLS 1.3, clients that negotiate
              these legacy versions receive <em>no</em> quantum protection and remain exposed to
              downgrade attacks (POODLE, BEAST, SWEET32) and historical traffic interception.{" "}
              This is especially significant for servers testing cutting-edge PQC: legacy protocol
              acceptance at the CDN or load-balancer layer completely undermines the PQC migration
              effort for affected sessions.{" "}
              <strong>Disable TLS 1.0/1.1 in your server and CDN configuration immediately.</strong>
            </p>
          </div>
        </motion.div>
      )}

      {/* Overall assessment */}
      <div className="p-5 rounded-xl bg-muted/30 border flex items-start gap-3">
        <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <p className="text-sm text-foreground leading-relaxed">{assessment}</p>
      </div>
      {/* Positive findings */}
      {positives.length > 0 && (
        <Accordion
          title="What's Working Well"
          icon={<CheckCircle className="w-5 h-5 text-emerald-600" />}
          badgeCount={positives.length}
          badgeVariant="success"
          defaultOpen={true}
        >
          {positives.map((p, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50">
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-foreground leading-relaxed">{p}</span>
            </div>
          ))}
        </Accordion>
      )}

      {/* Gaps */}
      {gaps.length > 0 && (
        <Accordion
          title="Gaps & Risks"
          icon={<AlertCircle className="w-5 h-5 text-yellow-600" />}
          badgeCount={gaps.length}
          badgeVariant="warning"
          defaultOpen={true}
        >
          {gaps.map((g, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50/50 dark:bg-yellow-950/20 border border-yellow-100 dark:border-yellow-900/50">
              <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-foreground leading-relaxed">{g}</span>
            </div>
          ))}
        </Accordion>
      )}

      {/* Migration roadmap */}
      <Accordion
        title="Migration Roadmap"
        icon={<ArrowRight className="w-5 h-5 text-primary" />}
        badgeCount={roadmap.length}
        badgeVariant="success"
        defaultOpen={false}
      >
        <div className="space-y-4 pt-2">
          {roadmap.map((step) => {
            const pc = priorityConfig[step.priority];
            return (
              <div key={step.step} className={`p-4 rounded-xl border ${pc.bg}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${pc.dot} flex-shrink-0`}>
                    {step.step}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-xs font-bold uppercase tracking-wider ${pc.color}`}>{step.priority}</span>
                      <span className="font-semibold text-sm text-foreground">{step.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-2">{step.description}</p>
                    <div className="flex flex-wrap gap-4 text-xs">
                      <span className="text-muted-foreground">
                        <span className="font-semibold text-foreground">Effort:</span> {step.effort}
                      </span>
                      <span className="text-muted-foreground">
                        <span className="font-semibold text-foreground">Impact:</span> {step.impact}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground/70 flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      {step.nistRef}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Accordion>

      {/* CNSA 2.0 Summary */}
      <div className="pt-2 border-t">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">CNSA 2.0 Compliance Snapshot</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {[
            {
              label: "ML-KEM Hybrid KEX",
              ok: pqcAnalysis.hybrid_ready,
              detail: pqcAnalysis.hybrid_ready
                ? `${hybridGroups.length} group(s) detected`
                : "Add X25519MLKEM768",
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
              detail: "Awaiting CA support (~2026-2028)",
            },
          ].map(({ label, ok, detail }) => (
            <div
              key={label}
              className={`p-3 rounded-lg border flex items-start gap-2 ${
                ok
                  ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900"
                  : "bg-muted/30 border-border"
              }`}
            >
              {ok ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-semibold text-foreground">{label}</div>
                <div className="text-muted-foreground mt-0.5">{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SuggestionsPanel;
