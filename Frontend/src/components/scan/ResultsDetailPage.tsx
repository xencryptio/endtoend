import React, { useState, useMemo, useEffect } from "react";
import {
  Search, Globe, Lock, Key, Shield, Zap, Check, CheckCircle, AlertCircle,
  AlertTriangle, ShieldAlert, ChevronDown, TrendingUp, TrendingDown,
  Calendar, Database, Info, X, Hash
} from "lucide-react";
import { UnifiedBackButton } from "@/components/ui/unified";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SuggestionsPanel from "./SuggestionsPanel";

// ── Types ─────────────────────────────────────────────────────────────────────
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

// ── Color helpers ─────────────────────────────────────────────────────────────
const gradeColor = (g: string): string => {
  if (!g) return "text-muted-foreground";
  const u = g.toUpperCase();
  if (u.startsWith("A")) return "text-emerald-500";
  if (u.startsWith("B")) return "text-blue-500";
  if (u.startsWith("C")) return "text-amber-500";
  if (u.startsWith("D")) return "text-orange-500";
  return "text-red-500";
};
const scoreColor = (s: number): string => {
  if (s >= 90) return "text-emerald-500";
  if (s >= 75) return "text-blue-500";
  if (s >= 60) return "text-amber-500";
  if (s >= 45) return "text-orange-500";
  return "text-red-500";
};
const scoreBg = (s: number): string => {
  if (s >= 90) return "bg-emerald-500";
  if (s >= 75) return "bg-blue-500";
  if (s >= 60) return "bg-amber-500";
  if (s >= 45) return "bg-orange-500";
  return "bg-red-500";
};
const scoreBarBg = (s: number): string => {
  if (s >= 90) return "bg-emerald-500/20";
  if (s >= 75) return "bg-blue-500/20";
  if (s >= 60) return "bg-amber-500/20";
  if (s >= 45) return "bg-orange-500/20";
  return "bg-red-500/20";
};
const gradeBorder = (g: string): string => {
  if (!g) return "border-border text-muted-foreground";
  const u = g.toUpperCase();
  if (u.startsWith("A")) return "border-emerald-500 text-emerald-600 dark:text-emerald-400";
  if (u.startsWith("B")) return "border-blue-500 text-blue-600 dark:text-blue-400";
  if (u.startsWith("C")) return "border-amber-500 text-amber-600 dark:text-amber-400";
  if (u.startsWith("D")) return "border-orange-500 text-orange-600 dark:text-orange-400";
  return "border-red-500 text-red-600 dark:text-red-400";
};

const gradeToScore = (g: string): number => {
  if (!g) return 0;
  const map: Record<string, number> = { 'A+': 97, 'A': 90, 'A-': 85, 'B+': 78, 'B': 72, 'B-': 68, 'C+': 58, 'C': 52, 'C-': 45, 'D': 38, 'F': 20 };
  return map[g] ?? 50;
};

// Derive grades from cipher data when the backend doesn't provide them
const deriveEncGrade = (encName: string): string => {
  if (!encName) return '';
  const u = encName.toUpperCase();
  if (u.includes('CHACHA20') || u.includes('AES-256-GCM') || u.includes('AES_256_GCM')) return 'A';
  if (u.includes('AES-256') || u.includes('AES_256')) return 'A-';
  if (u.includes('AES-128-GCM') || u.includes('AES_128_GCM')) return 'B+';
  if (u.includes('AES-128') || u.includes('AES_128')) return 'B';
  if (u.includes('3DES') || u.includes('RC4') || u.includes('DES')) return 'F';
  return 'C';
};

const deriveKexGrade = (kex: string, cipherName: string): string => {
  if (!kex && !cipherName) return '';
  const u = (kex || cipherName || '').toUpperCase();
  if (u.includes('MLKEM') || u.includes('KYBER') || u.includes('X25519MLKEM')) return 'A+';
  if (u.includes('X25519') || u.includes('X448')) return 'A-';
  if (u.includes('ECDHE') || u.includes('ECDH')) return 'B+';
  if (u.includes('DHE') || u.includes('DH')) return 'C+';
  if (u.includes('RSA')) return 'F';
  return '';
};

const compLabel = (k: string): string => ({
  kex: "Key Exchange", signature: "Signatures", symmetric: "Symmetric",
  certificate: "Certificate", protocol: "Protocol"
}[k] || k);

const compIcon = (k: string): React.ReactNode => ({
  kex: <Key className="w-4 h-4" />, signature: <Shield className="w-4 h-4" />,
  symmetric: <Lock className="w-4 h-4" />, certificate: <CheckCircle className="w-4 h-4" />,
  protocol: <Globe className="w-4 h-4" />,
}[k] || <Shield className="w-4 h-4" />);

const formatDate = (val: string | undefined): string => {
  if (!val) return "N/A";
  try { return new Date(val).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return val; }
};

// ── Shared atoms ──────────────────────────────────────────────────────────────
const Row: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono = false }) => (
  <div className="flex items-start justify-between py-2 border-b border-border/40 last:border-0 gap-6">
    <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0 w-28">{label}</span>
    <span className={`text-xs text-right text-foreground break-all leading-relaxed ${mono ? "font-mono" : ""}`}>{value}</span>
  </div>
);

const PassBadge: React.FC<{ pass: boolean; yes?: string; no?: string }> = ({ pass, yes = "Yes", no = "No" }) =>
  pass
    ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium"><Check className="w-3 h-3" />{yes}</span>
    : <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-medium"><X className="w-3 h-3" />{no}</span>;

const ScoreRing: React.FC<{ score: number; grade: string }> = ({ score, grade }) => {
  const r = 52; const circ = 2 * Math.PI * r; const filled = (score / 100) * circ;
  const color = score >= 90 ? '#10b981' : score >= 75 ? '#3b82f6' : score >= 60 ? '#f59e0b' : score >= 45 ? '#f97316' : '#ef4444';
  return (
    <div className="relative flex-shrink-0">
      <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/30" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black tabular-nums" style={{ color }}>{grade || 'F'}</span>
        <span className="text-xs font-semibold text-muted-foreground">{score.toFixed(1)}</span>
      </div>
    </div>
  );
};

const StatPill: React.FC<{ label: string; value: React.ReactNode; color?: string }> = ({ label, value, color = 'text-foreground' }) => (
  <div className="flex flex-col items-center px-4 py-3 bg-muted/40 rounded-xl border border-border/50">
    <span className={`text-2xl font-black tabular-nums ${color}`}>{value}</span>
    <span className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">{label}</span>
  </div>
);

const TLSComponentBar: React.FC<{ name: string; comp: ComponentScore }> = ({ name, comp }) => {
  const score = comp.weighted_average ?? 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 flex-shrink-0 flex items-center gap-1.5">
        <span className="text-muted-foreground">{compIcon(name)}</span>
        <span className="text-xs font-medium text-muted-foreground truncate">{compLabel(name)}</span>
      </div>
      <div className={`flex-1 h-2.5 rounded-full overflow-hidden ${scoreBarBg(score)}`}>
        <div className={`h-full rounded-full ${scoreBg(score)} transition-all duration-700`} style={{ width: `${score}%` }} />
      </div>
      <div className="w-24 flex-shrink-0 flex items-center gap-2 justify-end">
        {comp.pqc_percentage > 0
          ? <span className="text-[10px] text-muted-foreground">{comp.pqc_percentage}% PQC</span>
          : <span className="text-[10px] text-muted-foreground/40 italic">{name === 'symmetric' || name === 'protocol' ? 'N/A' : '0%'}</span>}
        <span className={`text-sm font-bold tabular-nums ${scoreColor(score)}`}>{score.toFixed(0)}</span>
        <span className={`text-sm font-black ${gradeColor(comp.grade)}`}>{comp.grade}</span>
      </div>
    </div>
  );
};

// ── Cipher row ────────────────────────────────────────────────────────────────
const CipherRow: React.FC<{ cipher: any }> = ({ cipher }) => {
  const [open, setOpen] = useState(false);
  const isTls13 = cipher.protocol === 'TLS 1.3';

  // Use backend grades if available, fall back to derived
  const kexGrade = cipher.kex_pqc_grade
    || (isTls13 ? '' : deriveKexGrade(cipher.key_exchange || '', cipher.name || ''));
  const encGrade = cipher.encryption_pqc_grade || deriveEncGrade(cipher.encryption || '');

  // For TLS 1.3, show the enc grade as the primary badge (KEX comes from curves section)
  const badgeGrade = isTls13 ? encGrade : (kexGrade || encGrade);
  const badgeLabel = isTls13 ? 'ENC' : 'KEX';

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${open ? 'border-border' : 'border-border/60'}`}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left">
        {badgeGrade
          ? <span className={`w-10 h-6 rounded border-2 flex items-center justify-center text-xs font-black flex-shrink-0 ${gradeBorder(badgeGrade)}`}>{badgeGrade}</span>
          : <span className="w-10 h-6 rounded bg-muted flex items-center justify-center text-[9px] text-muted-foreground flex-shrink-0">{badgeLabel}</span>}
        <code className="font-mono text-xs font-semibold flex-1 min-w-0 truncate">{cipher.name}</code>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${
          cipher.protocol === 'TLS 1.3'
            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
        }`}>{cipher.protocol}</span>
        {cipher.encryption && <span className="text-xs text-muted-foreground flex-shrink-0 hidden md:block">{cipher.encryption}</span>}
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 pt-2 border-t bg-muted/10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-muted-foreground font-semibold uppercase tracking-wide mb-1">
              {isTls13 ? 'ENC Grade' : 'KEX Grade'}
            </p>
            {isTls13
              ? <p className={`font-black text-lg ${gradeColor(encGrade)}`}>{encGrade || '—'}</p>
              : kexGrade
                ? <p className={`font-black text-lg ${gradeColor(kexGrade)}`}>{kexGrade}</p>
                : <p className="text-xs text-muted-foreground italic">See Curves</p>}
          </div>
          <div>
            <p className="text-muted-foreground font-semibold uppercase tracking-wide mb-1">
              {isTls13 ? 'KEX' : 'Enc Grade'}
            </p>
            {isTls13
              ? <p className="text-xs text-muted-foreground italic">From Curves section</p>
              : <p className={`font-black text-lg ${gradeColor(encGrade)}`}>{encGrade || '—'}</p>}
          </div>
          {cipher.encryption && <div><p className="text-muted-foreground font-semibold uppercase tracking-wide mb-1">Encryption</p>
            <p className="font-mono">{cipher.encryption}</p></div>}
          {cipher.hash && <div><p className="text-muted-foreground font-semibold uppercase tracking-wide mb-1">Hash</p>
            <p className="font-mono">{cipher.hash}</p></div>}
          {isTls13 && <div className="col-span-2 sm:col-span-4">
            <p className="text-[10px] text-muted-foreground/70 italic">TLS 1.3 separates cipher from key exchange — KEX grade is shown in the Elliptic Curves section below, based on your supported key share groups.</p>
          </div>}
        </div>
      )}
    </div>
  );
};

// ── Domain Detail Page ────────────────────────────────────────────────────────
const DomainDetailPage: React.FC<{ result: ScanResult; onBack: () => void }> = ({ result, onBack }) => {
  const [tab, setTab] = useState<'summary' | 'findings' | 'details'>('summary');
  const [cipherFilter, setCipherFilter] = useState<'all' | 'tls13' | 'tls12'>('all');
  const [cipherSearch, setCipherSearch] = useState('');
  const [detailSection, setDetailSection] = useState<'certificates' | 'compliance' | 'migration' | 'raw'>('certificates');

  const isSuccess = result.scan_status?.toLowerCase() === "completed";
  const rawData = result.raw_response || {};
  const pqcAnalysis = rawData.pqc_analysis || {};
  const pqcScore = pqcAnalysis.overall_score ?? result.quantum_score ?? null;
  const pqcGrade = pqcAnalysis.overall_grade ?? result.quantum_grade ?? "F";
  const quantumReady = pqcAnalysis.quantum_ready ?? false;
  const securityLevel = pqcAnalysis.security_level ?? "unknown";
  const hybridReady = pqcAnalysis.hybrid_ready ?? false;
  const legacyProtocols: string[] = pqcAnalysis.quantum_readiness_detail?.legacy_protocols ?? [];
  const tlsConfig = rawData.tls_configuration || {};
  const certChain = rawData.certificate_chain || {};
  const leafCert = certChain.leaf_certificate || {};
  const signatureAlgorithms = rawData.signature_algorithms || {};
  const secFeatures = pqcAnalysis.security_features || {};
  const certAnalysis = pqcAnalysis.certificate_analysis || {};
  const complianceStatus: Record<string, boolean> = pqcAnalysis.compliance_status || {};
  const criticalVulns: string[] = pqcAnalysis.critical_vulnerabilities || [];
  const components: Record<string, ComponentScore> | undefined = pqcAnalysis.components;
  const serverIp: string = rawData.server_ip || "";
  const serverPort: number | null = rawData.port || null;
  const scoreNum = typeof pqcScore === "number" ? pqcScore : 0;

  const tls13Suites: any[] = (tlsConfig["tls_1.3_cipher_suites"]?.suites ?? []).map((c: any) => ({ ...c, protocol: 'TLS 1.3' }));
  const tls12Suites: any[] = (tlsConfig["tls_1.2_cipher_suites"]?.suites ?? []).map((c: any) => ({ ...c, protocol: 'TLS 1.2' }));
  const allCiphers = [...tls13Suites, ...tls12Suites];

  const filteredCiphers = useMemo(() => {
    let list = cipherFilter === 'tls13' ? tls13Suites : cipherFilter === 'tls12' ? tls12Suites : allCiphers;
    if (cipherSearch) { const q = cipherSearch.toLowerCase(); list = list.filter(c => c.name?.toLowerCase().includes(q) || c.encryption?.toLowerCase().includes(q)); }
    return list;
  }, [cipherFilter, cipherSearch, tls13Suites, tls12Suites, allCiphers]);

  const riskLabel = scoreNum >= 90 ? "Low Risk" : scoreNum >= 80 ? "Med-Low Risk" : scoreNum >= 70 ? "Medium Risk" : scoreNum >= 60 ? "Med-High Risk" : "High Risk";
  const riskColorClass = scoreNum >= 80 ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
    : scoreNum >= 60 ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
    : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800";

  const complianceDetails: Record<string, { desc: string; fails: string[] }> = {
    'PCI DSS 4.0':        { desc: 'Payment Card Industry',           fails: ['TLS 1.0/1.1 in use', 'Weak ciphers (RC4, DES)', 'MD5 or SHA-1 signatures'] },
    'NIST 800-52r2':      { desc: 'NIST TLS Guidelines',             fails: ['RSA key exchange (no PFS)', 'Weak hashes (MD5/SHA-1)', 'SSL or early TLS enabled'] },
    'FIPS 140-3':         { desc: 'Federal Info Processing',         fails: ['Non-FIPS algorithms', 'RSA key < 2048 bits', 'Unapproved hash algorithms'] },
    'CNSA 2.0 (Quantum-Ready)': { desc: 'NSA Quantum-Ready Suite',  fails: ['No PQC algorithms detected', 'Classical KEX only', 'No hybrid key exchange'] },
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* STICKY HEADER */}
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center gap-3 py-3">
          <UnifiedBackButton onClick={onBack} label="Back" />
          <div className="flex items-center gap-2 min-w-0 ml-1">
            <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <code className="font-mono text-sm font-semibold truncate">{result.url}</code>
            {result.tls_version && <><span className="text-muted-foreground/40 hidden sm:block">·</span><span className="text-xs text-muted-foreground hidden sm:block">{result.tls_version}</span></>}
          </div>
          {pqcScore !== null && (
            <div className="ml-auto flex-shrink-0">
              <span className={`text-sm font-black ${gradeColor(pqcGrade as string)}`}>{pqcGrade}</span>
              <span className="text-xs text-muted-foreground ml-1">{scoreNum.toFixed(1)}/100</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {isSuccess ? (<>
          {/* Critical vulns / legacy protocol alert */}
          {(criticalVulns.length > 0 || legacyProtocols.length > 0) && (
            <div className="flex gap-3 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                {legacyProtocols.length > 0 && (
                  <p className="text-sm font-bold text-red-700 dark:text-red-300 mb-1">
                    Deprecated TLS protocols accepted: {legacyProtocols.map(p => <code key={p} className="mx-1 px-1 py-0.5 bg-red-100 dark:bg-red-900/40 rounded text-xs">{p}</code>)}
                  </p>
                )}
                {criticalVulns.map((v, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">• {v}</p>)}
              </div>
            </div>
          )}

          {/* TAB BAR */}
          <div className="flex gap-1 border-b border-border">
            {(['summary', 'findings', 'details'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-5 py-2.5 text-sm font-semibold capitalize transition-all border-b-2 -mb-px ${
                  tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
                }`}>{t}</button>
            ))}
          </div>

          {/* ═══ SUMMARY TAB ═══ */}
          {tab === 'summary' && (
            <div className="space-y-5">
              {/* Score hero */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                  <ScoreRing score={scoreNum} grade={pqcGrade as string} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      {result.tls_version && <span className="px-3 py-1 rounded-full text-xs font-bold bg-muted border border-border">{result.tls_version}</span>}
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        quantumReady ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'}`}>
                        {quantumReady ? '⚡ Quantum Ready' : '⚠ Not Quantum Ready'}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        hybridReady ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                          : 'bg-muted text-muted-foreground border-border'}`}>
                        {hybridReady ? '🔗 Hybrid KEX' : 'No Hybrid KEX'}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${riskColorClass}`}>{riskLabel}</span>
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-muted border border-border capitalize">{securityLevel}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatPill label="Cipher Suites" value={allCiphers.length} />
                      <StatPill label="TLS 1.3" value={tls13Suites.length} color="text-emerald-500" />
                      <StatPill label="TLS 1.2" value={tls12Suites.length} color="text-blue-500" />
                      <StatPill label="Elliptic Curves" value={tlsConfig.supported_elliptic_curves?.curves?.length ?? 0} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Component bars */}
              {components && Object.keys(components).length > 0 && (
                <Card className="border">
                  <CardHeader className="border-b py-3 px-5">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <Shield className="h-4 w-4" /> Component Scores
                      <span className="ml-auto text-xs font-normal normal-case text-muted-foreground">Hover score for definition</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 space-y-3.5">
                    {Object.entries(components).map(([k, v]) => <TLSComponentBar key={k} name={k} comp={v} />)}
                    <p className="text-xs text-muted-foreground pt-1">A ≥ 80 · B ≥ 65 · C ≥ 50 · D ≥ 35 · F &lt; 35 &nbsp;| NIST PQC = ML-KEM/ML-DSA only (AES-256 is quantum-safe but not PQC)</p>
                  </CardContent>
                </Card>
              )}

              {/* TLS config + Leaf cert */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border">
                  <CardHeader className="border-b py-3 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2"><Lock className="h-4 w-4" /> TLS Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <Row label="Domain" value={<code className="font-mono text-xs">{rawData.domain || result.url || "N/A"}</code>} />
                    {serverIp && <Row label="Server IP" value={<code className="font-mono text-xs">{serverIp}</code>} />}
                    {serverPort && <Row label="Port" value={serverPort} />}
                    <Row label="Protocols" value={(tlsConfig.supported_protocols || []).join(", ") || result.tls_version || "N/A"} mono />
                    <Row label="Active Cipher" value={result.cipher_suite_name || "N/A"} mono />
                    <Row label="PFS" value={<PassBadge pass={!!secFeatures.pfs_supported} yes={`Yes (${secFeatures.pfs_percentage?.toFixed(0) ?? "?"}% of suites)`} no="No" />} />
                    <Row label="SNI" value={<PassBadge pass={!!secFeatures.sni_supported} yes="Supported" no="Not detected" />} />
                    <Row label="HSTS" value={<PassBadge pass={!!secFeatures.hsts_enabled} yes={`Enabled${secFeatures.hsts_max_age ? ` (${secFeatures.hsts_max_age}s)` : ""}`} no="Disabled" />} />
                  </CardContent>
                </Card>
                <Card className="border">
                  <CardHeader className="border-b py-3 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2"><Shield className="h-4 w-4" /> Leaf Certificate</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <Row label="Subject" value={leafCert.subject || result.cert_subject || "N/A"} mono />
                    <Row label="Issuer" value={leafCert.issuer || result.cert_issuer || "N/A"} mono />
                    <Row label="Valid From" value={formatDate(leafCert.valid_from || result.cert_not_before)} />
                    <Row label="Valid Until" value={formatDate(leafCert.valid_until || result.cert_not_after)} />
                    <Row label="Public Key" value={`${leafCert.public_key_algorithm || result.public_key_algorithm || "N/A"} ${leafCert.public_key_size || result.public_key_size_bits ? `(${leafCert.public_key_size || result.public_key_size_bits} bits)` : ""}`} />
                    <Row label="OCSP Stapling" value={<PassBadge pass={!!certAnalysis.ocsp_stapling} yes="Active" no="Inactive" />} />
                    <Row label="Cert Transparency" value={<PassBadge pass={!!certAnalysis.cert_transparency} yes="Present" no="Not detected" />} />
                    {leafCert.cert_pqc_grade && <Row label="PQC Grade" value={<span className={`font-bold ${gradeColor(leafCert.cert_pqc_grade)}`}>{leafCert.cert_pqc_grade}</span>} />}
                  </CardContent>
                </Card>
              </div>

              {/* Footer */}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground px-1">
                {serverIp && <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> {serverIp}{serverPort ? `:${serverPort}` : ''}</span>}
                <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Scanned {formatDate(result.requested_at)}</span>
              </div>
            </div>
          )}

          {/* ═══ FINDINGS TAB ═══ */}
          {tab === 'findings' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { id: 'all', label: `All (${allCiphers.length})` },
                    { id: 'tls13', label: `TLS 1.3 (${tls13Suites.length})` },
                    { id: 'tls12', label: `TLS 1.2 (${tls12Suites.length})` },
                  ] as { id: 'all' | 'tls13' | 'tls12'; label: string }[]).map(f => (
                    <button key={f.id} onClick={() => setCipherFilter(f.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                        cipherFilter === f.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'
                      }`}>{f.label}</button>
                  ))}
                </div>
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-muted/40 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Search cipher suites…" value={cipherSearch} onChange={e => setCipherSearch(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center text-xs text-muted-foreground px-1">
                <span>Showing <span className="font-semibold text-foreground">{filteredCiphers.length}</span> cipher suites · Badge = KEX PQC grade</span>
              </div>
              <div className="space-y-1.5">
                {filteredCiphers.length === 0
                  ? <div className="py-12 text-center text-sm text-muted-foreground">No cipher suites match your filter.</div>
                  : filteredCiphers.map((c, i) => <CipherRow key={`${c.name}-${i}`} cipher={c} />)}
              </div>

              {/* Elliptic Curves */}
              {(tlsConfig.supported_elliptic_curves?.curves?.length ?? 0) > 0 && (
                <div className="pt-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Key className="h-3.5 w-3.5" /> Elliptic Curves ({tlsConfig.supported_elliptic_curves.curves.length})</p>
                  <div className="space-y-1.5">
                    {tlsConfig.supported_elliptic_curves.curves.map((curve: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5 border border-border/60 rounded-lg bg-card/50">
                        {curve.curve_pqc_grade
                          ? <span className={`w-10 h-6 rounded border-2 flex items-center justify-center text-xs font-black flex-shrink-0 ${gradeBorder(curve.curve_pqc_grade)}`}>{curve.curve_pqc_grade}</span>
                          : <span className="w-10 h-6 rounded bg-muted flex-shrink-0" />}
                        <code className="font-mono text-xs font-semibold flex-1">{curve.name}</code>
                        <span className="text-xs text-muted-foreground">{curve.type}</span>
                        <span className="text-xs text-muted-foreground">{curve.bits} bits</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Handshake Signatures */}
              {(signatureAlgorithms.handshake_signatures?.length ?? 0) > 0 && (
                <div className="pt-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Handshake Signatures ({signatureAlgorithms.handshake_signatures.length})</p>
                  <div className="space-y-1.5">
                    {signatureAlgorithms.handshake_signatures.map((sig: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5 border border-border/60 rounded-lg bg-card/50">
                        {sig.sig_pqc_grade
                          ? <span className={`w-10 h-6 rounded border-2 flex items-center justify-center text-xs font-black flex-shrink-0 ${gradeBorder(sig.sig_pqc_grade)}`}>{sig.sig_pqc_grade}</span>
                          : <span className="w-10 h-6 rounded bg-muted flex-shrink-0" />}
                        <code className="font-mono text-xs font-semibold flex-1 truncate">{sig.algorithm}</code>
                        <span className="text-xs text-muted-foreground hidden sm:block">{sig.protocol}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ DETAILS TAB ═══ */}
          {tab === 'details' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {([
                  { id: 'certificates', label: 'Certificates', icon: <Shield className="h-3.5 w-3.5" /> },
                  { id: 'compliance', label: 'Compliance', icon: <CheckCircle className="h-3.5 w-3.5" /> },
                  { id: 'migration', label: 'Migration Plan', icon: <Zap className="h-3.5 w-3.5" /> },
                  { id: 'raw', label: 'Raw JSON', icon: <Database className="h-3.5 w-3.5" /> },
                ] as { id: any; label: string; icon: React.ReactNode }[]).map(s => (
                  <button key={s.id} onClick={() => setDetailSection(s.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      detailSection === s.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'
                    }`}>{s.icon} {s.label}</button>
                ))}
              </div>

              {/* Certificates */}
              {detailSection === 'certificates' && (
                <div className="space-y-3">
                  <Card className="border">
                    <CardHeader className="border-b py-3 px-4"><CardTitle className="text-sm font-semibold">Leaf Certificate</CardTitle></CardHeader>
                    <CardContent className="p-4">
                      <Row label="Subject" value={leafCert.subject || result.cert_subject || "N/A"} mono />
                      <Row label="Issuer" value={leafCert.issuer || result.cert_issuer || "N/A"} mono />
                      <Row label="Valid From" value={formatDate(leafCert.valid_from || result.cert_not_before)} />
                      <Row label="Valid Until" value={formatDate(leafCert.valid_until || result.cert_not_after)} />
                      <Row label="Public Key" value={`${leafCert.public_key_algorithm || "N/A"} (${leafCert.public_key_size || result.public_key_size_bits || "?"} bits)`} />
                      {(leafCert.subject_alternative_names?.length ?? 0) > 0 && (
                        <Row label="SANs" value={<span className="font-mono text-xs">{leafCert.subject_alternative_names.join(", ")}</span>} />
                      )}
                      {leafCert.cert_pqc_grade && <Row label="PQC Grade" value={<span className={`font-bold text-base ${gradeColor(leafCert.cert_pqc_grade)}`}>{leafCert.cert_pqc_grade} ({leafCert.cert_pqc_score})</span>} />}
                    </CardContent>
                  </Card>
                  {(certChain.intermediate_certificates ?? []).map((cert: any, i: number) => (
                    <Card key={i} className="border">
                      <CardHeader className="border-b py-3 px-4"><CardTitle className="text-sm font-semibold">Intermediate Certificate {i + 1}</CardTitle></CardHeader>
                      <CardContent className="p-4">
                        <Row label="Public Key" value={`${cert.public_key_algorithm || "N/A"} (${cert.public_key_size || "?"} bits)`} />
                        {cert.cert_pqc_grade && <Row label="PQC Grade" value={<span className={`font-bold ${gradeColor(cert.cert_pqc_grade)}`}>{cert.cert_pqc_grade} ({cert.cert_pqc_score})</span>} />}
                      </CardContent>
                    </Card>
                  ))}
                  {(signatureAlgorithms.certificate_signatures?.length ?? 0) > 0 && (
                    <Card className="border">
                      <CardHeader className="border-b py-3 px-4"><CardTitle className="text-sm font-semibold">Certificate Signature Algorithms ({signatureAlgorithms.certificate_signatures.length})</CardTitle></CardHeader>
                      <CardContent className="p-0 divide-y divide-border">
                        {signatureAlgorithms.certificate_signatures.map((sig: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                            {sig.sig_pqc_grade && <span className={`text-xs font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${gradeBorder(sig.sig_pqc_grade)}`}>{sig.sig_pqc_grade}</span>}
                            <code className="font-mono text-xs flex-1">{sig.signature_algorithm}</code>
                            <span className="text-xs text-muted-foreground hidden sm:block">{sig.public_key_type} · {sig.public_key_size} bits · {sig.hash_algorithm}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Compliance */}
              {detailSection === 'compliance' && (
                <div className="space-y-3">
                  {Object.keys(complianceStatus).length > 0
                    ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {Object.entries(complianceStatus).map(([std, passed]) => {
                          const detail = complianceDetails[std] || { desc: 'Security standard', fails: [] };
                          return (
                            <div key={std} className={`rounded-xl p-4 border ${passed ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-sm">{std}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">{detail.desc}</p>
                                </div>
                                {passed ? <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />}
                              </div>
                              {!passed && detail.fails.length > 0 && (
                                <ul className="mt-2 space-y-0.5">
                                  {detail.fails.map((r, i) => <li key={i} className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1"><span>•</span><span>{r}</span></li>)}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    : <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2"><Info className="h-8 w-8 opacity-40" />No compliance data available.</div>}
                  {criticalVulns.length > 0 && (
                    <Card className="border-red-200 dark:border-red-800">
                      <CardHeader className="border-b py-3 px-4 bg-red-50 dark:bg-red-950/20"><CardTitle className="text-sm font-semibold text-red-700 dark:text-red-300">Critical Findings</CardTitle></CardHeader>
                      <CardContent className="p-4 space-y-2">
                        {criticalVulns.map((v, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{v}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Migration */}
              {detailSection === 'migration' && (
                result.raw_response?.pqc_analysis
                  ? <SuggestionsPanel pqcAnalysis={result.raw_response.pqc_analysis} domain={result.url} />
                  : <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2"><Info className="h-8 w-8 opacity-40" />No migration plan available.</div>
              )}

              {/* Raw JSON */}
              {detailSection === 'raw' && (
                <Card className="border">
                  <CardHeader className="border-b py-3 px-4"><CardTitle className="text-sm font-semibold">Raw JSON</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <pre className="p-4 text-xs font-mono overflow-auto max-h-[600px] bg-muted/30">{JSON.stringify(result, null, 2)}</pre>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>) : (
          /* Failed / HTTP skipped */
          <div className="max-w-xl mx-auto pt-6">
            <div className={`p-5 rounded-xl border ${result.scan_status === "http_skipped" ? "border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/10" : "border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-950/10"}`}>
              {result.scan_status === "http_skipped" ? (
                <>
                  <div className="flex items-center gap-2.5 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <div><div className="text-sm font-bold text-amber-800 dark:text-amber-100">HTTP Domain — Cannot Scan</div>
                      <div className="text-xs text-amber-600 dark:text-amber-300">No TLS/SSL encryption present</div></div>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-200 leading-relaxed">{result.error_message || "PQC analysis requires an encrypted HTTPS connection."}</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 mb-2">
                    <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <div><div className="text-sm font-bold text-red-800 dark:text-red-100">Scan Failed</div>
                      <div className="text-xs text-red-600 dark:text-red-300">Unable to complete security analysis</div></div>
                  </div>
                  <p className="text-xs text-red-700 dark:text-red-200 leading-relaxed">{result.error_message || "An unknown error occurred. Please retry."}</p>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// ── Domain Card (list view) ───────────────────────────────────────────────────
const DomainCard: React.FC<{ result: ScanResult; onViewDetails: () => void }> = ({ result, onViewDetails }) => {
  const isSuccess = result.scan_status === "completed";
  const isHttpSkipped = result.scan_status === "http_skipped";
  const pqcScore = result.raw_response?.pqc_analysis?.overall_score ?? null;
  const pqcGrade = result.raw_response?.pqc_analysis?.overall_grade ?? "—";
  const quantumReady = result.raw_response?.pqc_analysis?.quantum_ready ?? false;
  const scoreNum = typeof pqcScore === "number" ? pqcScore : 0;

  return (
    <button onClick={onViewDetails}
      className="w-full text-left bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-md transition-all duration-200">
      <div className="flex items-start justify-between gap-3 mb-3">
        <code className="text-sm font-mono font-semibold text-foreground truncate flex-1">{result.url}</code>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 border ${
          isSuccess ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
          : isHttpSkipped ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
          : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
        }`}>{isSuccess ? "Completed" : isHttpSkipped ? "HTTP" : "Failed"}</span>
      </div>
      {isSuccess && pqcScore !== null ? (
        <div className="flex items-center gap-4">
          <span className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-black flex-shrink-0 border-2 ${gradeBorder(pqcGrade as string)}`}>{pqcGrade}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="text-xl font-black tabular-nums text-foreground">{scoreNum.toFixed(1)}</span>
              <span className="text-xs text-muted-foreground">/100</span>
              {quantumReady && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 ml-1">⚡ Quantum Ready</span>}
            </div>
            <div className={`h-1.5 rounded-full overflow-hidden ${scoreBarBg(scoreNum)}`}>
              <div className={`h-full rounded-full ${scoreBg(scoreNum)}`} style={{ width: `${scoreNum}%` }} />
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

// ── Results Detail Page (router) ──────────────────────────────────────────────
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
      const match = scan.detailedResults?.find(r => r.url.toLowerCase() === targetDomain.toLowerCase());
      if (match) setSelectedDomain(match);
    }
  }, [targetDomain, scan.detailedResults]);

  const filteredResults = useMemo(() => {
    if (!scan.detailedResults) return [];
    return scan.detailedResults.filter(r => r.url.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [scan.detailedResults, searchQuery]);

  const stats = useMemo(() => {
    if (!scan.detailedResults) return { successful: 0, failed: 0, total: 0 };
    return {
      successful: scan.detailedResults.filter(r => r.scan_status === "completed").length,
      failed: scan.detailedResults.filter(r => r.scan_status !== "completed").length,
      total: scan.detailedResults.length,
    };
  }, [scan.detailedResults]);

  if (selectedDomain) return <DomainDetailPage result={selectedDomain} onBack={() => setSelectedDomain(null)} />;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <UnifiedBackButton onClick={onBack} label="Back to Scan History" className="mb-4" />
        <h2 className="text-sm font-bold text-foreground">Scan Results</h2>
        <p className="text-xs text-muted-foreground mt-0.5 font-mono">{scan.request_id}</p>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-5">
        {[
          { label: "Completed", value: stats.successful, color: "text-emerald-600 dark:text-emerald-400" },
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
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Filter domains..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-8 text-xs" />
        {searchQuery && <p className="text-xs text-muted-foreground mt-1">{filteredResults.length} of {stats.total} domains</p>}
      </div>
      {filteredResults.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {filteredResults.map((result, index) => (
            <DomainCard key={result.id || `${result.url}-${index}`} result={result} onViewDetails={() => setSelectedDomain(result)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Globe className="w-7 h-7 text-muted-foreground/30 mb-2" />
          <p className="text-sm font-medium text-muted-foreground">{searchQuery ? "No matching domains" : "No results available"}</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">{searchQuery ? "Try a different filter" : "Run a scan to see results here"}</p>
        </div>
      )}
    </div>
  );
};

export default ResultsDetailPage;
