import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronDown, FileText, Shield, AlertTriangle, CheckCircle, AlertCircle,
  Search, Server, Key, Hash, Lock, Globe, Database, Zap, Monitor,
  TrendingDown, TrendingUp, Calendar, XCircle, Loader2, Eye, GitBranch,
  Package, Info
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UnifiedBackButton } from "@/components/ui/unified";
import { ScanDetail, Algorithm } from './types';
import AlgorithmFindingsModal from './AlgorithmFindingsModal';
import RepoSuggestionsPanel from './RepoSuggestionsPanel';

const API_URL = import.meta.env.VITE_REPO_SCAN_API_URL;

const formatRepoName = (url: string): string => {
  try {
    return url
      .replace(/^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\//, '')
      .replace(/\.git$/, '');
  } catch { return url; }
};

// ── shared color helpers ──────────────────────────────────────────────────────
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
const categoryLabel = (c: string) => {
  const m: Record<string, string> = { kex: 'Key Exchange', signature: 'Signatures', symmetric: 'Symmetric', hash: 'Hash' };
  return m[c] || c;
};

// ── shared sub-components ─────────────────────────────────────────────────────
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

const CategoryBar: React.FC<{ name: string; score: number; grade: string; count: number }> = ({ name, score, grade, count }) => (
  <div className="flex items-center gap-3">
    <div className="w-32 flex-shrink-0 flex items-center gap-1.5">
      <span className="text-muted-foreground">{typeIcon(name)}</span>
      <span className="text-xs font-medium text-muted-foreground truncate">{categoryLabel(name)}</span>
    </div>
    <div className={`flex-1 h-2.5 rounded-full overflow-hidden ${scoreBarBg(score)}`}>
      <div className={`h-full rounded-full ${scoreBg(score)} transition-all duration-700`} style={{ width: `${score}%` }} />
    </div>
    <div className="w-24 flex-shrink-0 flex items-center gap-2 justify-end">
      <span className="text-[10px] text-muted-foreground">{count} algo{count !== 1 ? 's' : ''}</span>
      <span className={`text-sm font-bold tabular-nums ${scoreColor(score)}`}>{score.toFixed(0)}</span>
      <span className={`text-sm font-black ${gradeColor(grade)}`}>{grade}</span>
    </div>
  </div>
);

// ── Repo-specific AlgoRow ─────────────────────────────────────────────────────
const AlgoRow: React.FC<{
  name: string;
  algo: Algorithm;
  onViewOccurrences: (name: string) => void;
}> = ({ name, algo, onViewOccurrences }) => {
  const [open, setOpen] = useState(false);
  const score = algo.final_score ?? 0;
  const cat = algo.algorithm_type || algo.category || '';

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${open ? 'border-border' : 'border-border/60'}`}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left">
        <div className={`w-14 h-7 rounded flex items-center justify-center text-xs font-bold flex-shrink-0 text-white ${scoreBg(score)}`}>
          {score.toFixed(0)}
        </div>
        <span className="font-mono text-sm font-semibold flex-1 min-w-0 truncate">{name}</span>
        <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block tabular-nums">
          {algo.occurrences} use{algo.occurrences !== 1 ? 's' : ''}
        </span>
        <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block tabular-nums">
          {algo.files_affected} file{algo.files_affected !== 1 ? 's' : ''}
        </span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 hidden sm:block ${typeBadgeColor(cat)}`}>
          {cat}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {algo.quantum_safe
            ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
            : <AlertCircle className="h-3.5 w-3.5 text-red-400/70" />}
          {algo.is_pqc && <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded font-semibold">PQC</span>}
          {algo.deprecated && <span className="px-1.5 py-0.5 text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded font-semibold">OLD</span>}
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t bg-muted/10 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Quantum Safety</p>
              <span className={`px-2.5 py-1 rounded text-xs font-bold ${algo.quantum_safe ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                {algo.quantum_safe ? 'Quantum-Safe' : 'Quantum-Vulnerable'}
              </span>
              {algo.quantum_resistance_type && (
                <p className="text-xs text-muted-foreground mt-2 capitalize">{algo.quantum_resistance_type.replace(/_/g, ' ')}</p>
              )}
              {algo.quantum_safety_reason && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{algo.quantum_safety_reason}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Usage in Codebase</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Active usages</span><span className="font-semibold">{algo.occurrences}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Files affected</span><span className="font-semibold">{algo.files_affected}</span></div>
                {(algo.commented_occurrences ?? 0) > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">In comments</span><span className="text-muted-foreground">{algo.commented_occurrences}</span></div>
                )}
              </div>
              <Button variant="outline" size="sm" className="mt-3 h-7 text-xs"
                onClick={e => { e.stopPropagation(); onViewOccurrences(name); }}>
                <Eye className="h-3 w-3 mr-1" /> View in files
              </Button>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Scoring</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Base score</span><span>{algo.base_score?.toFixed(1) ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Final score</span><span className={`font-bold ${scoreColor(score)}`}>{score.toFixed(1)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Grade</span><span className={`font-bold ${gradeColor(algo.grade)}`}>{algo.grade}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Security level</span><span className="capitalize">{algo.security_level || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Deprecated</span><span className={algo.deprecated ? 'text-red-500 font-semibold' : 'text-emerald-500'}>{algo.deprecated ? 'Yes' : 'No'}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
interface ScanResultsDetailProps {
  scanId: number;
  onBack: () => void;
}

const ScanResultsDetail: React.FC<ScanResultsDetailProps> = ({ scanId, onBack }) => {
  const [scanDetail, setScanDetail] = useState<ScanDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'summary' | 'findings' | 'details'>('summary');
  const [algoFilter, setAlgoFilter] = useState<string>('all');
  const [qualFilter, setQualFilter] = useState<string>('all');
  const [algoSearch, setAlgoSearch] = useState('');
  const [detailSection, setDetailSection] = useState<'migration' | 'quantum' | 'raw'>('migration');
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<string | null>(null);
  const [isFindingsModalOpen, setIsFindingsModalOpen] = useState(false);

  useEffect(() => {
    setIsLoading(true); setError(null);
    fetch(`${API_URL}/api/scans/${scanId}`)
      .then(r => { if (!r.ok) throw new Error(`Status ${r.status}`); return r.json(); })
      .then((data: ScanDetail) => setScanDetail(data))
      .catch(e => setError(e.message || 'Failed to load scan details'))
      .finally(() => setIsLoading(false));
  }, [scanId]);

  const algoEntries = useMemo(() => {
    if (!scanDetail?.algorithms) return [];
    return Object.entries(scanDetail.algorithms).map(([name, algo]) => ({ name, algo }));
  }, [scanDetail]);

  const algoTypes = useMemo(() =>
    Array.from(new Set(algoEntries.map(({ algo }) => algo.algorithm_type || algo.category || ''))).filter(Boolean),
    [algoEntries]);

  const filtered = useMemo(() => {
    let list = algoEntries;
    if (algoFilter !== 'all') list = list.filter(({ algo }) => (algo.algorithm_type || algo.category) === algoFilter);
    if (qualFilter === 'pqc') list = list.filter(({ algo }) => algo.is_pqc);
    else if (qualFilter === 'safe') list = list.filter(({ algo }) => algo.quantum_safe && !algo.is_pqc);
    else if (qualFilter === 'vulnerable') list = list.filter(({ algo }) => !algo.quantum_safe);
    if (algoSearch) {
      const q = algoSearch.toLowerCase();
      list = list.filter(({ name, algo }) =>
        name.toLowerCase().includes(q) ||
        (algo.algorithm_type || '').toLowerCase().includes(q) ||
        (algo.quantum_safety_reason || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [algoEntries, algoFilter, qualFilter, algoSearch]);

  // Loading / error states
  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
        <p className="text-sm font-semibold text-muted-foreground">Loading scan details…</p>
      </div>
    </div>
  );
  if (error) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center max-w-md bg-card rounded-2xl p-8 border">
        <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-lg font-bold mb-2">Failed to load</p>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    </div>
  );
  if (!scanDetail) return null;

  const data = scanDetail;
  const score = data.overall_security_score ?? 0;
  const grade = data.overall_grade ?? 'F';
  const qr = data.quantum_readiness_detail;
  const truePQC   = algoEntries.filter(({ algo }) => algo.is_pqc).length;
  const safe      = algoEntries.filter(({ algo }) => algo.quantum_safe && !algo.is_pqc).length;
  const vuln      = algoEntries.filter(({ algo }) => !algo.quantum_safe).length;

  const riskColor = score >= 80 ? 'text-emerald-500' : score >= 60 ? 'text-amber-500' : score >= 45 ? 'text-orange-500' : 'text-red-500';
  const riskLabel = score >= 90 ? 'Low Risk' : score >= 80 ? 'Med-Low Risk' : score >= 70 ? 'Medium Risk' : score >= 60 ? 'Med-High Risk' : 'High Risk';

  const migStepColor = (p: string) => {
    if (p === 'CRITICAL') return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800';
    if (p === 'HIGH') return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800';
    if (p === 'MEDIUM') return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    return 'bg-muted text-muted-foreground border-border';
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* STICKY HEADER */}
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center gap-3 py-3">
          <UnifiedBackButton onClick={onBack} label="Back" />
          <div className="flex items-center gap-2 min-w-0 ml-1">
            <GitBranch className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="font-semibold text-sm truncate">{formatRepoName(data.repo_url)}</span>
            <span className="text-muted-foreground/40 hidden sm:block">·</span>
            <span className="text-xs text-muted-foreground hidden sm:block">{data.branch_name}</span>
          </div>
          <div className="ml-auto flex-shrink-0">
            <span className={`text-sm font-black ${gradeColor(grade)}`}>{grade}</span>
            <span className="text-xs text-muted-foreground ml-1">{score.toFixed(1)}/100</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Critical vulns */}
        {(data.critical_vulnerabilities ?? []).length > 0 && (
          <div className="flex gap-3 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-700 dark:text-red-300 mb-1">Critical vulnerabilities detected</p>
              <ul className="space-y-0.5">
                {(data.critical_vulnerabilities ?? []).map((v, i) => <li key={i} className="text-xs text-red-600 dark:text-red-400">• {v}</li>)}
              </ul>
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
                <ScoreRing score={score} grade={grade} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${riskColor === 'text-emerald-500' || riskColor === 'text-blue-500'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'}`}>
                      {riskLabel}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                      (qr?.quantum_readiness_percentage ?? data.quantum_readiness_percentage ?? 0) >= 50
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                    }`}>
                      {(data.quantum_readiness_percentage ?? 0).toFixed(1)}% Quantum-Ready
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-muted border border-border">{data.platform || 'Unknown platform'}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatPill label="Algorithms" value={algoEntries.length} />
                    <StatPill label="True PQC" value={truePQC} color="text-blue-500" />
                    <StatPill label="Quantum-Safe" value={safe} color="text-emerald-500" />
                    <StatPill label="Vulnerable" value={vuln} color={vuln > 0 ? 'text-red-500' : 'text-muted-foreground'} />
                    <StatPill label="Files Scanned" value={data.total_files} />
                  </div>
                </div>
              </div>
            </div>

            {/* Category scores */}
            {data.category_scores && Object.keys(data.category_scores).length > 0 && (
              <Card className="border">
                <CardHeader className="border-b py-3 px-5">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Package className="h-4 w-4" /> Security by Category
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-3.5">
                  {Object.entries(data.category_scores).map(([cat, s]) => (
                    <CategoryBar key={cat} name={cat} score={s.score} grade={s.grade} count={s.algorithm_count} />
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Quantum readiness detail */}
            {qr && (
              <Card className="border">
                <CardHeader className="border-b py-3 px-5">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Zap className="h-4 w-4" /> Quantum Readiness
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-muted/40 rounded-xl">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Risk Level</p>
                    <p className={`text-sm font-bold capitalize ${
                      qr.risk_level === 'low' ? 'text-emerald-500' : qr.risk_level === 'medium' ? 'text-amber-500' : 'text-red-500'
                    }`}>{qr.risk_level}</p>
                    {qr.risk_reason && <p className="text-xs text-muted-foreground mt-1">{qr.risk_reason}</p>}
                  </div>
                  <div className="p-4 bg-muted/40 rounded-xl">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Migration Status</p>
                    <p className="text-sm font-bold capitalize">{(qr.migration_status || '').replace(/_/g, ' ')}</p>
                    {qr.migration_note && <p className="text-xs text-muted-foreground mt-1">{qr.migration_note}</p>}
                  </div>
                  <div className="p-4 bg-muted/40 rounded-xl">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Operations</p>
                    <div className="flex items-center gap-2">
                      <div className={`flex-1 h-2 rounded-full overflow-hidden ${scoreBarBg(score)}`}>
                        <div className={`h-full rounded-full ${scoreBg(score)}`}
                          style={{ width: `${qr.total_crypto_operations > 0 ? (qr.quantum_safe_operations / qr.total_crypto_operations * 100) : 0}%` }} />
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                        {qr.quantum_safe_operations}/{qr.total_crypto_operations}
                      </span>
                    </div>
                  </div>
                  {qr.pqc_algorithms?.length > 0 && (
                    <div className="p-4 bg-muted/40 rounded-xl">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">PQC Algorithms Found</p>
                      <div className="flex flex-wrap gap-1">
                        {qr.pqc_algorithms.map(a => (
                          <span key={a} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-semibold rounded">{a}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Footer metadata */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground px-1">
              <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Scanned {new Date(data.last_scanned).toLocaleString()}</span>
              <span className="flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" /> {data.branch_name}</span>
              <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Commit: <code>{data.repo_hash?.slice(0, 12)}</code></span>
            </div>
          </div>
        )}

        {/* ═══ FINDINGS TAB ═══ */}
        {tab === 'findings' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Type filter */}
              <div className="flex flex-wrap gap-1.5">
                {(['all', ...algoTypes] as string[]).map(t => {
                  const cnt = t === 'all' ? algoEntries.length : algoEntries.filter(({ algo }) => (algo.algorithm_type || algo.category) === t).length;
                  return (
                    <button key={t} onClick={() => setAlgoFilter(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                        algoFilter === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'
                      }`}>
                      {t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)} <span className="opacity-70">({cnt})</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Quantum filter + search */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'pqc', label: `PQC (${truePQC})` },
                  { id: 'safe', label: `Safe (${safe})` },
                  { id: 'vulnerable', label: `Vulnerable (${vuln})` },
                ].map(f => (
                  <button key={f.id} onClick={() => setQualFilter(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                      qualFilter === f.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'
                    }`}>{f.label}</button>
                ))}
              </div>
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-muted/40 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Search algorithm name…" value={algoSearch} onChange={e => setAlgoSearch(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {algoEntries.length} algorithms</span>
              <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Strong → <TrendingDown className="h-3.5 w-3.5 text-red-400" /> Weak</span>
            </div>
            <div className="space-y-1.5">
              {filtered.length === 0
                ? <div className="py-16 text-center text-sm text-muted-foreground">No algorithms match your filter.</div>
                : [...filtered].sort((a, b) => (b.algo.final_score ?? 0) - (a.algo.final_score ?? 0)).map(({ name, algo }) => (
                    <AlgoRow key={name} name={name} algo={algo}
                      onViewOccurrences={n => { setSelectedAlgorithm(n); setIsFindingsModalOpen(true); }} />
                  ))
              }
            </div>
          </div>
        )}

        {/* ═══ DETAILS TAB ═══ */}
        {tab === 'details' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {([
                { id: 'migration', label: 'Migration Plan', icon: <Zap className="h-3.5 w-3.5" /> },
                { id: 'quantum', label: 'Quantum Detail', icon: <Shield className="h-3.5 w-3.5" /> },
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

            {/* Migration Plan */}
            {detailSection === 'migration' && (
              data.migration_plan
                ? <RepoSuggestionsPanel
                    migrationPlan={data.migration_plan}
                    quantumReadiness={data.quantum_readiness_detail ?? null}
                    criticalVulnerabilities={data.critical_vulnerabilities}
                  />
                : <div className="py-16 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                    <Info className="h-8 w-8 text-muted-foreground/50" />
                    No migration plan available for this scan.
                  </div>
            )}

            {/* Quantum Detail */}
            {detailSection === 'quantum' && qr && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="border">
                  <CardHeader className="border-b py-3 px-4"><CardTitle className="text-sm font-semibold">Vulnerable Algorithms</CardTitle></CardHeader>
                  <CardContent className="p-4 space-y-1 max-h-64 overflow-y-auto">
                    {(qr.vulnerable_algorithms ?? []).map(a => (
                      <div key={a} className="px-2.5 py-1.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded text-xs font-mono text-red-700 dark:text-red-300">{a}</div>
                    ))}
                    {(qr.vulnerable_algorithms ?? []).length === 0 && <p className="text-xs text-muted-foreground">None found.</p>}
                  </CardContent>
                </Card>
                <Card className="border">
                  <CardHeader className="border-b py-3 px-4"><CardTitle className="text-sm font-semibold">Deprecated Algorithms</CardTitle></CardHeader>
                  <CardContent className="p-4 space-y-1 max-h-64 overflow-y-auto">
                    {(qr.deprecated_algorithms ?? []).map(a => (
                      <div key={a} className="px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded text-xs font-mono text-amber-700 dark:text-amber-300">{a}</div>
                    ))}
                    {(qr.deprecated_algorithms ?? []).length === 0 && <p className="text-xs text-muted-foreground">None found.</p>}
                  </CardContent>
                </Card>
                <Card className="border">
                  <CardHeader className="border-b py-3 px-4"><CardTitle className="text-sm font-semibold">Grover-Safe Algorithms</CardTitle></CardHeader>
                  <CardContent className="p-4 space-y-1 max-h-64 overflow-y-auto">
                    {(qr.grover_safe_algorithms ?? []).map(a => (
                      <div key={a} className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded text-xs font-mono text-emerald-700 dark:text-emerald-300">{a}</div>
                    ))}
                    {(qr.grover_safe_algorithms ?? []).length === 0 && <p className="text-xs text-muted-foreground">None found.</p>}
                  </CardContent>
                </Card>
                <Card className="border">
                  <CardHeader className="border-b py-3 px-4"><CardTitle className="text-sm font-semibold">PQC Algorithms</CardTitle></CardHeader>
                  <CardContent className="p-4 space-y-1 max-h-64 overflow-y-auto">
                    {(qr.pqc_algorithms ?? []).map(a => (
                      <div key={a} className="px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded text-xs font-mono text-blue-700 dark:text-blue-300">{a}</div>
                    ))}
                    {(qr.pqc_algorithms ?? []).length === 0 && <p className="text-xs text-muted-foreground">No true PQC algorithms detected.</p>}
                  </CardContent>
                </Card>
              </div>
            )}
            {detailSection === 'quantum' && !qr && (
              <div className="py-16 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <Info className="h-8 w-8 text-muted-foreground/50" />
                No quantum readiness detail available.
              </div>
            )}

            {/* Raw JSON */}
            {detailSection === 'raw' && (
              <Card className="border">
                <CardHeader className="border-b py-3 px-4"><CardTitle className="text-sm font-semibold">Raw JSON</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <pre className="p-4 text-xs font-mono overflow-auto max-h-[600px] bg-muted/30">{JSON.stringify(data, null, 2)}</pre>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>

      {selectedAlgorithm && (
        <AlgorithmFindingsModal
          isOpen={isFindingsModalOpen}
          onClose={() => { setIsFindingsModalOpen(false); setSelectedAlgorithm(null); }}
          scanId={scanId}
          algorithmName={selectedAlgorithm}
          scanDetail={scanDetail}
        />
      )}
    </div>
  );
};

export default ScanResultsDetail;
