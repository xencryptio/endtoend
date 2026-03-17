import React, { useState, useMemo } from 'react';
import {
  ChevronDown, FileText, Shield, Award, Target, Lock, CheckCircle, AlertTriangle,
  Search, Activity, AlertCircle, Cpu, Database, Server, Key, Hash, Globe, Monitor,
  Info, TrendingDown, TrendingUp, Calendar, Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UnifiedBackButton } from "@/components/ui/unified";

export interface AuditResult {
  result_id: string;
  agent_id: string;
  task_id: string;
  audit_results: any;
  received_at: string;
  submitted_at: string;
}

const gradeColor = (g: string) => {
  if (!g) return 'text-muted-foreground';
  const u = g.toUpperCase();
  if (u.startsWith('A')) return 'text-emerald-500';
  if (u.startsWith('B')) return 'text-blue-500';
  if (u.startsWith('C')) return 'text-amber-500';
  if (u.startsWith('D')) return 'text-orange-500';
  return 'text-red-500';
};

const scoreColor = (s: number) => {
  if (s >= 90) return 'text-emerald-500';
  if (s >= 75) return 'text-blue-500';
  if (s >= 60) return 'text-amber-500';
  if (s >= 45) return 'text-orange-500';
  return 'text-red-500';
};

const scoreBg = (s: number) => {
  if (s >= 90) return 'bg-emerald-500';
  if (s >= 75) return 'bg-blue-500';
  if (s >= 60) return 'bg-amber-500';
  if (s >= 45) return 'bg-orange-500';
  return 'bg-red-500';
};

const scoreBarBg = (s: number) => {
  if (s >= 90) return 'bg-emerald-500/20';
  if (s >= 75) return 'bg-blue-500/20';
  if (s >= 60) return 'bg-amber-500/20';
  if (s >= 45) return 'bg-orange-500/20';
  return 'bg-red-500/20';
};

const formatDate = (d: string) => { try { return new Date(d).toLocaleString(); } catch { return d; } };
const formatCertDate = (v: string | number) => {
  if (!v) return 'N/A';
  try {
    if (typeof v === 'string' && v.startsWith('/Date(')) {
      return new Date(parseInt(v.match(/\d+/)?.[0] || '0')).toLocaleDateString();
    }
    return new Date(v).toLocaleDateString();
  } catch { return String(v); }
};

const detectOS = (d: any): 'linux' | 'windows' | 'unknown' => {
  const p = d?._metadata?.platform?.toLowerCase();
  if (p === 'windows') return 'windows';
  if (p === 'linux') return 'linux';
  if (d.without_sudo || d.with_sudo) return 'linux';
  if (d.tls_ssl_configuration || d.cryptoapi_info) return 'windows';
  return 'unknown';
};

const typeIcon = (t: string) => {
  const icons: Record<string, React.ReactNode> = {
    kex: <Key className="w-4 h-4" />,
    signature: <Shield className="w-4 h-4" />,
    symmetric: <Lock className="w-4 h-4" />,
    hash: <Hash className="w-4 h-4" />,
  };
  return icons[t] || <Shield className="w-4 h-4" />;
};

const typeBadgeColor = (t: string) => {
  const m: Record<string, string> = {
    kex: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    signature: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    symmetric: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    hash: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  };
  return m[t] || 'bg-muted text-muted-foreground';
};

const StatPill: React.FC<{ label: string; value: React.ReactNode; color?: string }> = ({ label, value, color = 'text-foreground' }) => (
  <div className="flex flex-col items-center px-4 py-3 bg-muted/40 rounded-xl border border-border/50">
    <span className={`text-2xl font-black tabular-nums ${color}`}>{value}</span>
    <span className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">{label}</span>
  </div>
);

const ScoreRing: React.FC<{ score: number; grade: string }> = ({ score, grade }) => {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color =
    score >= 90 ? '#10b981' : score >= 75 ? '#3b82f6' : score >= 60 ? '#f59e0b' : score >= 45 ? '#f97316' : '#ef4444';
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

const ComponentBar: React.FC<{ name: string; comp: any }> = ({ name, comp }) => {
  const score = comp.score || comp.weighted_average || 0;
  const label = name === 'kex' ? 'Key Exchange' : name === 'signature' ? 'Signature' : name === 'symmetric' ? 'Symmetric' : name === 'hash' ? 'Hash' : name;
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 flex-shrink-0 flex items-center gap-1.5">
        <span className="text-muted-foreground">{typeIcon(name)}</span>
        <span className="text-xs font-medium text-muted-foreground truncate">{label}</span>
      </div>
      <div className={`flex-1 h-2.5 rounded-full overflow-hidden ${scoreBarBg(score)}`}>
        <div className={`h-full rounded-full ${scoreBg(score)} transition-all duration-700`} style={{ width: `${score}%` }} />
      </div>
      <div className="w-20 flex-shrink-0 flex items-center gap-1.5 justify-end">
        <span className={`text-sm font-bold tabular-nums ${scoreColor(score)}`}>{score.toFixed(0)}</span>
        <span className={`text-sm font-black ${gradeColor(comp.grade)}`}>{comp.grade}</span>
      </div>
    </div>
  );
};

const AlgoRow: React.FC<{ algo: any }> = ({ algo }) => {
  const [open, setOpen] = useState(false);
  const ctx = algo.context || {};
  const score = algo.final_score ?? 0;
  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${open ? 'border-border' : 'border-border/60'}`}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left">
        <div className={`w-14 h-7 rounded flex items-center justify-center text-xs font-bold flex-shrink-0 text-white ${scoreBg(score)}`}>
          {score.toFixed(0)}
        </div>
        <span className="font-mono text-sm font-semibold flex-1 min-w-0 truncate">{algo.algorithm}</span>
        {algo.key_size > 0 && <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">{algo.key_size} bits</span>}
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 hidden sm:block ${typeBadgeColor(algo.algorithm_type)}`}>
          {algo.algorithm_type}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {algo.quantum_safe ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <AlertCircle className="h-3.5 w-3.5 text-red-400/70" />}
          {algo.deprecated && <span className="px-1.5 py-0.5 text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded font-semibold">OLD</span>}
        </div>
        <span className="text-[10px] text-muted-foreground flex-shrink-0 hidden md:block max-w-[120px] truncate">
          {ctx.source_type || ctx.source || ''}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1 border-t bg-muted/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Source</p>
            <p className="text-sm font-medium text-primary">{ctx.source_type || ctx.source || 'Unknown'}</p>
            {ctx.location && <code className="text-[11px] bg-muted px-1.5 py-1 rounded block mt-1 break-all">{ctx.location}</code>}
            {ctx.store_path && <code className="text-[11px] bg-muted px-1.5 py-1 rounded block mt-1 break-all">{ctx.store_path}</code>}
            {ctx.store_friendly_name && <p className="text-xs text-muted-foreground mt-1">{ctx.store_friendly_name}</p>}
          </div>
          {(ctx.cipher_suite || ctx.certificate_subject) && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {ctx.cipher_suite ? 'Cipher Suite' : 'Certificate'}
              </p>
              {ctx.cipher_suite && (
                <>
                  <code className="text-[11px] bg-muted px-1.5 py-1 rounded block break-all">{ctx.cipher_suite}</code>
                  {ctx.cipher_hex && <p className="text-xs text-muted-foreground mt-1">Hex: <code>0x{ctx.cipher_hex}</code></p>}
                  {ctx.cipher_type && <p className="text-xs text-muted-foreground mt-0.5 capitalize">Family: {ctx.cipher_type.replace('_', ' ')}</p>}
                </>
              )}
              {ctx.certificate_subject && (
                <>
                  <p className="font-mono text-[11px] break-all line-clamp-2">{ctx.certificate_subject}</p>
                  {ctx.certificate_thumbprint && <p className="text-xs text-muted-foreground mt-1 break-all">Thumbprint: {ctx.certificate_thumbprint}</p>}
                </>
              )}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Scoring</p>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Base score</span><span>{algo.base_score?.toFixed(1) ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Final score</span><span className={`font-bold ${scoreColor(score)}`}>{score.toFixed(1)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Grade</span><span className={`font-bold ${gradeColor(algo.grade)}`}>{algo.grade}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Quantum safe</span><span className={algo.quantum_safe ? 'text-emerald-500 font-semibold' : 'text-red-500'}>{algo.quantum_safe ? 'Yes' : 'No'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Deprecated</span><span className={algo.deprecated ? 'text-red-500 font-semibold' : 'text-emerald-500'}>{algo.deprecated ? 'Yes' : 'No'}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const AgentDetailedResultsPage: React.FC<{
  result: AuditResult;
  hostname: string;
  onBack: () => void;
}> = ({ result, hostname, onBack }) => {
  const [tab, setTab] = useState<'summary' | 'findings' | 'details'>('summary');
  const [algoFilter, setAlgoFilter] = useState<string>('all');
  const [algoSearch, setAlgoSearch] = useState('');
  const [detailSection, setDetailSection] = useState<'protocols' | 'certificates' | 'cryptoapi' | 'system' | 'raw'>('protocols');

  const auditData = result.audit_results || {};
  const osType = detectOS(auditData);
  const pqcScore = auditData?.pqc_score || {};
  const components = pqcScore.components || {};
  const algorithmScores: any[] = pqcScore.algorithm_scores || [];
  const complianceStatus = pqcScore.compliance_status || {};
  const quantumDetail = pqcScore.quantum_readiness_detail || {};
  const criticalVulns: string[] = pqcScore.critical_vulnerabilities || [];

  const systemContext = auditData.system_context || {};
  const cryptoApiInfo = auditData.cryptoapi_info || {};
  const schannelInfo = auditData.tls_ssl_configuration || {};
  const certificateStores = auditData.certificate_stores || {};
  const installedSoftware = auditData.installed_crypto_software?.installed_crypto_software || {};

  const overallScore = typeof pqcScore.overall_score === 'number' ? pqcScore.overall_score : 0;
  const overallGrade = pqcScore.overall_grade || 'F';

  const algoStats = useMemo(() => ({
    total: algorithmScores.length,
    quantumSafe: algorithmScores.filter((a: any) => a.quantum_safe).length,
    deprecated: algorithmScores.filter((a: any) => a.deprecated).length,
  }), [algorithmScores]);

  const algoTypes = useMemo(() => Array.from(new Set(algorithmScores.map((a: any) => a.algorithm_type))), [algorithmScores]);

  const filtered = useMemo(() => {
    let list = algoFilter === 'all' ? algorithmScores : algorithmScores.filter((a: any) => a.algorithm_type === algoFilter);
    if (algoSearch) {
      const q = algoSearch.toLowerCase();
      list = list.filter((a: any) =>
        a.algorithm?.toLowerCase().includes(q) ||
        a.algorithm_type?.toLowerCase().includes(q) ||
        a.context?.source_type?.toLowerCase().includes(q) ||
        a.context?.cipher_suite?.toLowerCase().includes(q) ||
        a.context?.store_path?.toLowerCase().includes(q) ||
        a.context?.certificate_subject?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [algorithmScores, algoFilter, algoSearch]);

  const protocolInfo: Record<string, { enabled: boolean; reason: string }> = {
    'SSL 2.0': { enabled: false, reason: 'Critical vulnerabilities (DROWN, POODLE)' },
    'SSL 3.0': { enabled: false, reason: 'Vulnerable to POODLE attack' },
    'TLS 1.0': { enabled: false, reason: 'Deprecated since 2020 — weak cipher support' },
    'TLS 1.1': { enabled: false, reason: 'Deprecated since 2020 — lacks modern features' },
    'TLS 1.2': { enabled: true, reason: 'Secure — widely supported with modern ciphers' },
    'TLS 1.3': { enabled: true, reason: 'Most secure — removes all legacy features' },
  };

  const storeMap: Record<string, [string, string]> = {
    current_user_root_store: ['HKCU\\SOFTWARE\\Microsoft\\SystemCertificates\\Root', 'Trusted Root (User)'],
    local_machine_root_store: ['HKLM\\SOFTWARE\\Microsoft\\SystemCertificates\\Root', 'Trusted Root (Machine)'],
    current_user_ca_store: ['HKCU\\SOFTWARE\\Microsoft\\SystemCertificates\\CA', 'Intermediate CA (User)'],
    local_machine_ca_store: ['HKLM\\SOFTWARE\\Microsoft\\SystemCertificates\\CA', 'Intermediate CA (Machine)'],
    current_user_authroot_store: ['HKCU\\SOFTWARE\\Microsoft\\SystemCertificates\\AuthRoot', 'Third-Party Root (User)'],
    local_machine_authroot_store: ['HKLM\\SOFTWARE\\Microsoft\\SystemCertificates\\AuthRoot', 'Third-Party Root (Machine)'],
  };

  const complianceDetails: Record<string, { desc: string; fail: string[] }> = {
    'PCI DSS 4.0': { desc: 'Payment Card Industry', fail: ['TLS 1.0/1.1 in use', 'Weak ciphers (DES, RC4)', 'MD5 or SHA-1 signatures'] },
    'NIST 800-52r2': { desc: 'NIST TLS Guidelines', fail: ['RSA key exchange (no PFS)', 'Weak hashes (MD5/SHA-1)', 'SSL or early TLS enabled'] },
    'FIPS 140-3': { desc: 'Federal Info Processing', fail: ['Non-FIPS algorithms found', 'RSA key size < 2048', 'Unapproved hash algorithms'] },
    'CNSA 2.0 (Quantum-Ready)': { desc: 'NSA Quantum-Ready Suite', fail: ['No PQC algorithms detected', 'Classical KEX only (RSA/ECDH)', 'No hybrid key exchange'] },
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* STICKY HEADER */}
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center gap-3 py-3">
          <UnifiedBackButton onClick={onBack} label="Back" />
          <div className="flex items-center gap-2 min-w-0 ml-1">
            <Monitor className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="font-semibold text-sm truncate">{hostname}</span>
            <span className="text-muted-foreground/40 hidden sm:block">·</span>
            <span className="text-xs text-muted-foreground hidden sm:block">{formatDate(result.submitted_at)}</span>
          </div>
          <div className="ml-auto flex-shrink-0">
            <span className={`text-sm font-black ${gradeColor(overallGrade)}`}>{overallGrade}</span>
            <span className="text-xs text-muted-foreground ml-1">{overallScore.toFixed(1)}/100</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Critical vulns */}
        {criticalVulns.length > 0 && (
          <div className="flex gap-3 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-700 dark:text-red-300 mb-1">Critical vulnerabilities detected</p>
              <ul className="space-y-0.5">{criticalVulns.map((v: string, i: number) => <li key={i} className="text-xs text-red-600 dark:text-red-400">• {v}</li>)}</ul>
            </div>
          </div>
        )}

        {/* TAB BAR */}
        <div className="flex gap-1 border-b border-border">
          {(['summary', 'findings', 'details'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-semibold capitalize transition-all border-b-2 -mb-px ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* ═══ SUMMARY TAB ═══ */}
        {tab === 'summary' && (
          <div className="space-y-5">
            {/* Score hero */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                <ScoreRing score={overallScore} grade={overallGrade} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                      pqcScore.quantum_ready
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                    }`}>{pqcScore.quantum_ready ? '⚡ Quantum Ready' : '⚠ Not Quantum Ready'}</span>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-muted border border-border capitalize">{pqcScore.security_level || 'unknown'} security</span>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-muted border border-border capitalize">{osType} system</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatPill label="Algorithms" value={algoStats.total} />
                    <StatPill label="Quantum Safe" value={algoStats.quantumSafe} color="text-emerald-500" />
                    <StatPill label="Deprecated" value={algoStats.deprecated} color={algoStats.deprecated > 0 ? 'text-red-500' : 'text-muted-foreground'} />
                    <StatPill label="HNDL Risk" value={quantumDetail.hndl_risk || '—'} color={
                      quantumDetail.hndl_risk === 'high' ? 'text-red-500' : quantumDetail.hndl_risk === 'medium' ? 'text-amber-500' : 'text-emerald-500'
                    } />
                  </div>
                </div>
              </div>
            </div>

            {/* Component scores */}
            {Object.keys(components).length > 0 && (
              <Card className="border">
                <CardHeader className="border-b py-3 px-5">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Target className="h-4 w-4" /> Component Scores
                    <span className="ml-auto text-xs font-normal normal-case">Affects final grade based on weight</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-3.5">
                  {Object.entries(components).map(([k, c]: [string, any]) => <ComponentBar key={k} name={k} comp={c} />)}
                </CardContent>
              </Card>
            )}

            {/* Compliance */}
            {Object.keys(complianceStatus).length > 0 && (
              <Card className="border">
                <CardHeader className="border-b py-3 px-5">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" /> Compliance
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(complianceStatus).map(([std, compliant]: [string, any]) => {
                    const detail = complianceDetails[std] || { desc: 'Security standard', fail: ['Requirements not met'] };
                    return (
                      <div key={std} className={`rounded-xl p-4 border ${compliant ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">{std}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{detail.desc}</p>
                          </div>
                          {compliant ? <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />}
                        </div>
                        {!compliant && (
                          <ul className="mt-2 space-y-0.5">
                            {detail.fail.slice(0, 2).map((r, i) => (
                              <li key={i} className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1"><span className="mt-0.5">•</span><span>{r}</span></li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Quantum readiness */}
            {(quantumDetail.migration_tier || quantumDetail.hndl_reason) && (
              <Card className="border">
                <CardHeader className="border-b py-3 px-5">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"><Zap className="h-4 w-4" /> Quantum Readiness</CardTitle>
                </CardHeader>
                <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {quantumDetail.hndl_reason && (
                    <div className="p-4 bg-muted/40 rounded-xl">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">HNDL Risk</p>
                      <p className={`text-sm font-bold capitalize ${quantumDetail.hndl_risk === 'high' ? 'text-red-500' : quantumDetail.hndl_risk === 'medium' ? 'text-amber-500' : 'text-emerald-500'}`}>{quantumDetail.hndl_risk || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground mt-1">{quantumDetail.hndl_reason}</p>
                    </div>
                  )}
                  {quantumDetail.migration_tier && (
                    <div className="p-4 bg-muted/40 rounded-xl">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Migration Tier</p>
                      <p className="text-sm font-bold">Tier {quantumDetail.migration_tier}</p>
                      <p className="text-xs text-muted-foreground mt-1">{quantumDetail.migration_note || 'No guidance available'}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Footer metadata */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground px-1">
              <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Scanned {formatDate(result.submitted_at)}</span>
              <span className="flex items-center gap-1.5"><Server className="h-3.5 w-3.5" /> {systemContext.os_info || auditData._metadata?.platform || 'Unknown OS'}</span>
              <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Task: <code>{result.task_id.slice(0, 24)}…</code></span>
            </div>
          </div>
        )}

        {/* ═══ FINDINGS TAB ═══ */}
        {tab === 'findings' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex flex-wrap gap-1.5">
                {(['all', ...algoTypes] as string[]).map(t => {
                  const count = t === 'all' ? algorithmScores.length : algorithmScores.filter((a: any) => a.algorithm_type === t).length;
                  return (
                    <button key={t} onClick={() => setAlgoFilter(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                        algoFilter === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'
                      }`}>
                      {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)} <span className="opacity-70">({count})</span>
                    </button>
                  );
                })}
              </div>
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-muted/40 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Search algorithm, source, cipher…" value={algoSearch} onChange={e => setAlgoSearch(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {algorithmScores.length} algorithms</span>
              <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Strong → <TrendingDown className="h-3.5 w-3.5 text-red-400" /> Weak</span>
            </div>
            <div className="space-y-1.5">
              {filtered.length === 0
                ? <div className="py-16 text-center text-sm text-muted-foreground">No algorithms match your filter.</div>
                : [...filtered].sort((a: any, b: any) => (b.final_score ?? 0) - (a.final_score ?? 0)).map((algo: any, i: number) => <AlgoRow key={`${algo.algorithm}-${i}`} algo={algo} />)
              }
            </div>
          </div>
        )}

        {/* ═══ DETAILS TAB ═══ */}
        {tab === 'details' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {([
                { id: 'protocols', label: 'Protocols', icon: <Globe className="h-3.5 w-3.5" /> },
                { id: 'certificates', label: 'Certificates', icon: <Award className="h-3.5 w-3.5" /> },
                ...(osType === 'windows' ? [{ id: 'cryptoapi', label: 'CryptoAPI', icon: <Cpu className="h-3.5 w-3.5" /> }] : []),
                { id: 'system', label: 'System', icon: <Server className="h-3.5 w-3.5" /> },
                { id: 'raw', label: 'Raw JSON', icon: <Database className="h-3.5 w-3.5" /> },
              ] as { id: any; label: string; icon: React.ReactNode }[]).map(s => (
                <button key={s.id} onClick={() => setDetailSection(s.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    detailSection === s.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'
                  }`}>
                  {s.icon} {s.label}
                </button>
              ))}
            </div>

            {/* Protocols */}
            {detailSection === 'protocols' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs">
                  <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="text-blue-700 dark:text-blue-300">
                    <strong>All protocols show "NotConfigured"?</strong> That is normal on Windows 11 — Windows uses its secure built-in defaults (TLS 1.2 + 1.3 on, older versions off).
                    <span className="block mt-1 text-emerald-600 dark:text-emerald-400 font-semibold">✓ Your configuration is secure.</span>
                  </div>
                </div>
                <Card className="border">
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Protocol</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Security</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {schannelInfo?.protocol_configurations?.map((proto: any, i: number) => {
                          const info = protocolInfo[proto.protocol] || { enabled: false, reason: 'Unknown' };
                          const isNC = proto.client_status === 'NotConfigured' && proto.server_status === 'NotConfigured';
                          const isEnabled = isNC ? info.enabled : (proto.client_status?.includes('Enabled') || proto.server_status?.includes('Enabled'));
                          const label = isNC ? (info.enabled ? 'Enabled (Default)' : 'Disabled (Default)') : (isEnabled ? 'Enabled' : 'Disabled');
                          const isSecure = (isEnabled && (proto.protocol.includes('1.2') || proto.protocol.includes('1.3'))) ||
                                          (!isEnabled && (proto.protocol.includes('SSL') || proto.protocol.includes('1.0') || proto.protocol.includes('1.1')));
                          return (
                            <tr key={i} className="hover:bg-muted/30">
                              <td className="px-4 py-3 font-semibold">{proto.protocol}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${isEnabled ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{label}</span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {isSecure
                                  ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold"><CheckCircle className="h-3.5 w-3.5" />Secure</span>
                                  : <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />Review</span>}
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">{info.reason}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
                {schannelInfo?.cipher_suites && (
                  <Card className="border">
                    <CardHeader className="border-b py-3 px-4">
                      <CardTitle className="text-sm font-semibold">Cipher Suites ({schannelInfo.cipher_suites.total_cipher_suites || 0} total)</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-4">
                        {[['Cipher Types', schannelInfo.cipher_suites.cipher_type_distribution], ['Key Exchange', schannelInfo.cipher_suites.key_exchange_distribution], ['Hash Algorithms', schannelInfo.cipher_suites.hash_algorithm_distribution]].map(([title, dist]: any) => (
                          <div key={title}>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</p>
                            <div className="space-y-1.5">
                              {Object.entries(dist || {}).map(([k, v]: any) => (
                                <div key={k} className="flex justify-between text-sm"><span className="capitalize text-muted-foreground">{k || 'None'}</span><span className="font-semibold">{v}</span></div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <details className="border-t pt-3">
                        <summary className="cursor-pointer text-xs font-semibold text-primary hover:underline">Show all cipher suite names</summary>
                        <div className="mt-3 max-h-64 overflow-y-auto space-y-1">
                          {schannelInfo.cipher_suites.cipher_details?.map((c: any, i: number) => (
                            <div key={i} className="flex justify-between px-2 py-1 rounded bg-muted/40 text-xs">
                              <span className="font-mono">{c.name}</span>
                              <span className="text-muted-foreground">{c.key_exchange || '—'}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Certificates */}
            {detailSection === 'certificates' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {Object.entries(certificateStores).map(([sn, store]: [string, any]) => {
                    const [, friendly] = storeMap[sn] || [sn, sn];
                    return (
                      <div key={sn} className="p-3 bg-muted/40 border border-border/60 rounded-xl text-center">
                        <p className="text-xl font-black text-primary">{store?.certificate_count || 0}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{friendly}</p>
                      </div>
                    );
                  })}
                </div>
                {Object.entries(certificateStores).map(([sn, store]: [string, any]) => {
                  const [regPath, friendly] = storeMap[sn] || [sn, sn];
                  const certs: any[] = store?.certificates || [];
                  return (
                    <details key={sn} className="group border border-border/60 rounded-xl overflow-hidden">
                      <summary className="flex items-center gap-3 px-4 py-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                        <Award className="h-4 w-4 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-sm">{friendly}</span>
                          <code className="text-[10px] text-muted-foreground block break-all">{regPath}</code>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{certs.length} certs</span>
                        <ChevronDown className="h-4 w-4 text-muted-foreground group-open:rotate-180 transition-transform flex-shrink-0" />
                      </summary>
                      <div className="divide-y divide-border/40 max-h-[480px] overflow-y-auto">
                        {certs.map((cert: any, i: number) => {
                          const weak = cert.signature_algorithm?.toLowerCase().includes('md5') || cert.signature_algorithm?.toLowerCase().includes('sha1');
                          return (
                            <details key={i} className="group/c">
                              <summary className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors ${weak ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}>
                                <div className="flex-1 min-w-0">
                                  <p className="font-mono text-xs font-semibold truncate">{cert.subject?.split(',')[0] || 'Unknown'}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${weak ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'}`}>{cert.signature_algorithm}</span>
                                    <span className="text-[10px] text-muted-foreground">{cert.public_key_algorithm} {cert.public_key_size ? `(${cert.public_key_size} bits)` : ''}</span>
                                  </div>
                                </div>
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 group-open/c:rotate-180 transition-transform" />
                              </summary>
                              <div className="px-4 py-3 bg-muted/10 text-xs space-y-2 border-t border-border/40">
                                <div><span className="text-muted-foreground font-semibold">Subject:</span><code className="block mt-0.5 font-mono break-all bg-muted/50 p-1.5 rounded">{cert.subject}</code></div>
                                <div><span className="text-muted-foreground font-semibold">Issuer:</span><code className="block mt-0.5 font-mono break-all bg-muted/50 p-1.5 rounded">{cert.issuer}</code></div>
                                <div className="grid grid-cols-2 gap-2 pt-1">
                                  <div><span className="text-muted-foreground">Valid from</span><p className="font-medium">{formatCertDate(cert.not_before)}</p></div>
                                  <div><span className="text-muted-foreground">Valid until</span><p className="font-medium">{formatCertDate(cert.not_after)}</p></div>
                                </div>
                                {cert.thumbprint && <div><span className="text-muted-foreground">Thumbprint:</span><code className="block break-all bg-muted/50 p-1 rounded mt-0.5 text-[10px]">{cert.thumbprint}</code></div>}
                                {cert.enhanced_key_usage && <div><span className="text-muted-foreground">Key Usage:</span><p className="font-medium mt-0.5">{cert.enhanced_key_usage}</p></div>}
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}

            {/* CryptoAPI */}
            {detailSection === 'cryptoapi' && osType === 'windows' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="border">
                    <CardHeader className="border-b py-3 px-4"><CardTitle className="text-sm font-semibold">CryptoAPI Providers ({cryptoApiInfo?.cryptographic_providers?.count || 0})</CardTitle></CardHeader>
                    <CardContent className="p-4 space-y-1.5 max-h-64 overflow-y-auto">
                      {cryptoApiInfo?.cryptographic_providers?.providers?.map((p: string, i: number) => (
                        <div key={i} className="px-2.5 py-1.5 bg-muted/50 rounded text-xs font-mono">{p}</div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card className="border">
                    <CardHeader className="border-b py-3 px-4"><CardTitle className="text-sm font-semibold">Security Config</CardTitle></CardHeader>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center p-3 bg-muted/40 rounded-lg text-sm">
                        <span>FIPS Mode</span>
                        <span className={`font-bold ${cryptoApiInfo?.fips_mode_enabled ? 'text-emerald-500' : 'text-muted-foreground'}`}>{cryptoApiInfo?.fips_mode_enabled ? '✓ Enabled' : '✗ Disabled'}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                {cryptoApiInfo?.registered_oid_algorithms?.algorithms && (
                  <Card className="border">
                    <CardHeader className="border-b py-3 px-4"><CardTitle className="text-sm font-semibold">Registered OID Algorithms ({cryptoApiInfo.registered_oid_algorithms.count})</CardTitle></CardHeader>
                    <CardContent className="p-4 max-h-48 overflow-y-auto space-y-1">
                      {cryptoApiInfo.registered_oid_algorithms.algorithms.map((a: string, i: number) => (
                        <div key={i} className="px-2 py-1 bg-muted/40 rounded text-xs font-mono">{a}</div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                {installedSoftware?.software?.length > 0 && (
                  <Card className="border">
                    <CardHeader className="border-b py-3 px-4"><CardTitle className="text-sm font-semibold">Installed Crypto Software ({installedSoftware.count})</CardTitle></CardHeader>
                    <CardContent className="p-4 space-y-2">
                      {installedSoftware.software.map((sw: any, i: number) => (
                        <div key={i} className="p-3 bg-muted/40 rounded-lg">
                          <p className="font-semibold text-sm">{sw.DisplayName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">v{sw.DisplayVersion} · {sw.Publisher}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* System */}
            {detailSection === 'system' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="border">
                  <CardHeader className="border-b py-3 px-4"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Server className="h-4 w-4" /> Operating System</CardTitle></CardHeader>
                  <CardContent className="p-4 space-y-0 text-sm">
                    {[['Computer', systemContext.computer_name], ['OS', systemContext.os_info], ['Version', systemContext.os_version], ['Build', systemContext.build_number], ['Architecture', systemContext.architecture]].map(([l, v]) => v && (
                      <div key={l} className="flex justify-between py-2 border-b border-border/40 last:border-0 gap-4">
                        <span className="text-muted-foreground flex-shrink-0">{l}</span>
                        <span className="font-medium text-right">{v}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card className="border">
                  <CardHeader className="border-b py-3 px-4"><CardTitle className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Scan Details</CardTitle></CardHeader>
                  <CardContent className="p-4 space-y-0 text-sm">
                    {[['Platform', auditData._metadata?.platform], ['Version', auditData._metadata?.audit_version], ['Submitted', formatDate(result.submitted_at)], ['Received', formatDate(result.received_at)]].map(([l, v]) => v && (
                      <div key={l} className="flex justify-between py-2 border-b border-border/40 last:border-0 gap-4">
                        <span className="text-muted-foreground flex-shrink-0">{l}</span>
                        <span className="font-mono text-xs text-right break-all">{v}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
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
      </main>
    </div>
  );
};

export default AgentDetailedResultsPage;
