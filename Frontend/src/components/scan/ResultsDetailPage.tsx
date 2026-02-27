import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Search, 
  X, 
  Globe, 
  Lock, 
  Key, 
  Hash, 
  Shield, 
  Zap, 
  Check, 
  CheckCircle, 
  AlertTriangle, 
  ShieldAlert, 
  Info, 
  Clock,
  FileText,
  Package,
  Loader2,
  Eye,
  ChevronRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedBackButton, UnifiedMetricCard } from "@/components/ui/unified";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import SuggestionsPanel from "./SuggestionsPanel";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface ScanResult {
  id?: number;
  batch_id?: string;
  request_id: string;
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
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
  finalDomainProgress?: {[key: string]: {status: string, duration?: number}};
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

/**
 * Canonical status type for scan results.
 * This is the SINGLE SOURCE OF TRUTH for scan_status values.
 */
export type ScanStatus = 'completed' | 'failed' | 'pending' | 'http_skipped';

interface ResultsDetailPageProps {
  scan: ScanResult;
  onBack: () => void;
  targetDomain?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalizes scan status values from backend to canonical ScanStatus type.
 * Maps various backend status values to our frontend ScanStatus enum.
 */
const normalizeScanStatus = (result: any): ScanStatus => {
  // ✅ Map backend status to frontend "completed"
  if (result.scan_status === 'completed' || result.status === 'completed') {
    return 'completed';
  }
  if (result.scan_status === 'failed') return 'failed';
  if (result.scan_status === 'pending') return 'pending';
  if (result.scan_status === 'http_skipped') return 'http_skipped';

  // Fallback checks
  if (result.status === 'pending' || result.status === 'processing') return 'pending';

  return 'failed';
};

/**
 * Calculates security score from scan result.
 * Returns 0 if scan is not completed, otherwise returns PQC analysis score.
 */
const calculateSecurityScore = (result: any): number => {
  if (result.scan_status !== 'completed') return 0;

  // Prioritize new PQC analysis
  if (result.raw_response?.pqc_analysis) {
    return result.raw_response.pqc_analysis.overall_score;
  }

  // Fallback to quantum_score if available
  if (typeof result.quantum_score === 'number') {
    return result.quantum_score;
  }

  return 0;
};

const getGradeColor = (grade: string): string => {
  if (!grade) return 'text-zinc-500';
  const g = grade.toUpperCase();
  if (g.startsWith('A')) return 'text-emerald-600 dark:text-emerald-400';
  if (g.startsWith('B')) return 'text-primary';
  if (g.startsWith('C')) return 'text-warning';
  if (g.startsWith('D')) return 'text-orange-600 dark:text-orange-400';
  return 'text-rose-600 dark:text-rose-400';
};

const getScoreBarColor = (score: number): string => {
  if (score >= 90) return 'bg-emerald-500';
  if (score >= 80) return 'bg-primary';
  if (score >= 70) return 'bg-warning';
  if (score >= 60) return 'bg-orange-500';
  return 'bg-rose-500';
};

const getRiskLevelInfo = (score: number): { label: string; color: string; description: string } => {
  if (score >= 90) return {
    label: 'Low Risk',
    color: 'text-emerald-600 dark:text-emerald-400',
    description: 'Excellent cryptographic security posture'
  };
  if (score >= 80) return {
    label: 'Medium-Low Risk',
    color: 'text-primary',
    description: 'Good security with minor improvements needed'
  };
  if (score >= 70) return {
    label: 'Medium Risk',
    color: 'text-warning',
    description: 'Adequate security but needs attention'
  };
  if (score >= 60) return {
    label: 'Medium-High Risk',
    color: 'text-orange-600 dark:text-orange-400',
    description: 'Significant security concerns present'
  };
  return {
    label: 'High Risk',
    color: 'text-rose-600 dark:text-rose-400',
    description: 'Critical security vulnerabilities detected'
  };
};

const getSectionIcon = (section: string) => {
  const icons: Record<string, React.ReactNode> = {
    "kex": <Key className="w-5 h-5" />,
    "signature": <Shield className="w-5 h-5" />,
    "symmetric": <Lock className="w-5 h-5" />,
    "certificate": <Shield className="w-5 h-5" />,
    "protocol": <Globe className="w-5 h-5" />
  };
  return icons[section] || <Shield className="w-5 h-5" />;
};

const getCategoryDisplayName = (category: string): string => {
  const names: Record<string, string> = {
    'kex': 'Key Exchange',
    'signature': 'Digital Signatures',
    'symmetric': 'Symmetric Encryption',
    'certificate': 'Certificate Security',
    'protocol': 'Protocol Security'
  };
  return names[category] || category;
};

const PQCStatusBadges: React.FC<{
  is_pqc?: boolean;
  is_hybrid?: boolean;
  quantum_safe?: boolean;
}> = ({ is_pqc, is_hybrid, quantum_safe }) => (
  <div className="flex items-center gap-2 flex-wrap">
    {is_pqc && <span className="px-1.5 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 rounded text-purple-700 dark:text-purple-300">PQC</span>}
    {is_hybrid && <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 rounded text-blue-700 dark:text-blue-300">Hybrid</span>}
    {quantum_safe && <span className="px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300">Quantum-Safe</span>}
  </div>
);

// ============================================================================
// DETAIL COMPONENTS FOR DOMAIN DETAIL PAGE
// ============================================================================

const TechnicalInfoCard: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  onViewDetails: () => void;
  itemCount?: number;
}> = ({ title, description, icon, onViewDetails, itemCount }) => {
  return (
    <button
      onClick={onViewDetails}
      className="w-full text-left group bg-card hover:bg-muted/40 border border-border hover:border-primary/30 rounded-xl p-4 transition-all duration-200 flex items-center justify-between gap-4 shadow-sm hover:shadow-md"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm text-foreground truncate">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">{description}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {itemCount !== undefined && (
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">{itemCount}</span>
        )}
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
      </div>
    </button>
  );
};

const TechnicalDetailModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ isOpen, onClose, title, icon, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card text-card-foreground rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            {icon}
            <h3 className="text-xl font-bold">{title}</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          <div className="space-y-4">
            {children}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: string | React.ReactNode; className?: string }> = ({ label, value, className = '' }) => (
  <div className={`flex justify-between items-start py-1 ${className}`}>
    <span className="text-slate-500 font-semibold text-xs uppercase tracking-wider min-w-0 flex-shrink">{label}:</span>
    <span className="text-foreground text-right ml-4 min-w-0 break-words text-sm">{value}</span>
  </div>
);

const gradeAccent = (grade: string) => {
  if (!grade) return { border: 'border-l-slate-300', bg: 'bg-slate-50/50 dark:bg-slate-900/20', ring: 'bg-slate-100 dark:bg-slate-800', icon: 'text-slate-500' };
  const g = grade.toUpperCase();
  if (g.startsWith('A')) return { border: 'border-l-emerald-500', bg: 'bg-emerald-50/40 dark:bg-emerald-950/20', ring: 'bg-emerald-100 dark:bg-emerald-900/40', icon: 'text-emerald-600 dark:text-emerald-400' };
  if (g.startsWith('B')) return { border: 'border-l-blue-500', bg: 'bg-blue-50/40 dark:bg-blue-950/20', ring: 'bg-blue-100 dark:bg-blue-900/40', icon: 'text-blue-600 dark:text-blue-400' };
  if (g.startsWith('C')) return { border: 'border-l-yellow-500', bg: 'bg-yellow-50/40 dark:bg-yellow-950/10', ring: 'bg-yellow-100 dark:bg-yellow-900/40', icon: 'text-yellow-600 dark:text-yellow-400' };
  if (g.startsWith('D')) return { border: 'border-l-orange-500', bg: 'bg-orange-50/40 dark:bg-orange-950/10', ring: 'bg-orange-100 dark:bg-orange-900/40', icon: 'text-orange-600 dark:text-orange-400' };
  return { border: 'border-l-rose-500', bg: 'bg-rose-50/40 dark:bg-rose-950/20', ring: 'bg-rose-100 dark:bg-rose-900/40', icon: 'text-rose-600 dark:text-rose-400' };
};

const ComponentScoreCard: React.FC<{ name: string; data: ComponentScore }> = ({ name, data }) => {
  const accent = gradeAccent(data.grade);
  const score = data.weighted_average;
  const barColor = getScoreBarColor(score);
  const barWidth = Math.min(100, Math.max(0, score));
  const algCount = (data as any).algorithm_count;

  return (
    <div className={`relative rounded-xl border-l-4 border border-border ${accent.border} ${accent.bg} shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${accent.ring}`}>
            <span className={accent.icon}>{getSectionIcon(name)}</span>
          </div>
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest leading-tight">
            {getCategoryDisplayName(name)}
          </span>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${accent.ring} ${getGradeColor(data.grade)}`}>
          {data.grade}
        </span>
      </div>

      {/* Score number + bar */}
      <div className="px-5 pb-4">
        <div className="flex items-end gap-2 mb-2">
          <span className={`text-4xl font-bold tracking-tight ${getGradeColor(data.grade)}`}>
            {score.toFixed(1)}
          </span>
          <span className="text-sm text-slate-400 dark:text-slate-500 mb-1 font-medium">/100</span>
        </div>
        <div className="h-2 bg-slate-200/70 dark:bg-slate-700/50 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border/60 mx-5" />

      {/* Stats row */}
      <div className="px-5 py-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wide font-semibold mb-0.5">PQC %</div>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{data.pqc_percentage}%</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wide font-semibold mb-0.5">Quantum-Safe</div>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{data.quantum_safe_count}</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wide font-semibold mb-0.5">Algorithms</div>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{algCount ?? '—'}</div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// DOMAIN DETAIL PAGE COMPONENT
// ============================================================================

const DomainDetailPage: React.FC<{
  result: ScanResult;
  onBack: () => void;
}> = ({ result, onBack }) => {
  // 🔍 DEBUG: Log the result being received
  console.log('🎯 DomainDetailPage received result:', {
    url: result.url,
    scan_status: result.scan_status,
    status: result.status,
    raw_response_exists: !!result.raw_response,
    pqc_analysis_exists: !!result.raw_response?.pqc_analysis
  });

  const [activeModal, setActiveModal] = useState<string | null>(null);
  const isSuccess = result.scan_status?.toLowerCase() === 'completed';
  
  console.log('✅ isSuccess:', isSuccess, 'scan_status:', result.scan_status);

  const pqcScore = result.raw_response?.pqc_analysis?.overall_score ?? result.quantum_score ?? 'N/A';
  const pqcGrade = result.raw_response?.pqc_analysis?.overall_grade ?? result.quantum_grade ?? 'N/A';
  const quantumReady = result.raw_response?.pqc_analysis?.quantum_ready ?? false;
  const securityLevel = result.raw_response?.pqc_analysis?.security_level ?? 'unknown';
  const hybridReady = result.raw_response?.pqc_analysis?.hybrid_ready ?? false;
  const legacyProtocols: string[] = result.raw_response?.pqc_analysis?.quantum_readiness_detail?.legacy_protocols ?? [];

  const rawData = result.raw_response || {};
  const tlsConfig = rawData.tls_configuration || {};
  const certChain = rawData.certificate_chain || {};
  const leafCert = certChain.leaf_certificate || {};
  const signatureAlgorithms = rawData.signature_algorithms || {};
  
  const getHashFromCipherName = (name: string): string => {
    const hashMatch = name.match(/SHA\d+/);
    if (hashMatch) return hashMatch[0];
    if (name.endsWith('_SHA')) return 'SHA1';
    return 'N/A';
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="bg-card/95 border-b border-border/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-foreground tracking-tight">Quantum Security Report</h1>
                <div className="text-xs text-muted-foreground font-mono">{result.url}</div>
              </div>
            </div>
            <UnifiedBackButton onClick={onBack} label="Back to Results" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {isSuccess ? (
          <div className="space-y-8">
            {/* ═══ HERO ASSESSMENT BANNER ═══ */}
            <div className="bg-card/80 border rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.07)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] backdrop-blur-sm">
              {/* Top accent stripe */}
              <div className={`h-1.5 w-full ${getScoreBarColor(typeof pqcScore === 'number' ? pqcScore : 0)}`} />

              <div className="p-8">
                {/* Domain strip */}
                <div className="flex flex-wrap items-center gap-3 mb-6">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-slate-400" />
                    <code className="text-sm font-semibold text-slate-700 dark:text-slate-300">{result.url}</code>
                  </div>
                  {result.tls_version && (
                    <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">
                      {result.tls_version}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Scan Complete
                  </span>
                </div>

                {/* Main score row */}
                <div className="flex flex-col md:flex-row md:items-center gap-8">
                  {/* Score block */}
                  <div className="flex items-end gap-4 flex-shrink-0">
                    <div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">PQC Score</div>
                      <div className="flex items-end gap-3">
                        <span className="text-7xl font-black text-slate-900 dark:text-slate-100 leading-none tracking-tight">
                          {typeof pqcScore === 'number' ? pqcScore.toFixed(1) : pqcScore}
                        </span>
                        <div className="mb-2 flex flex-col items-start gap-1">
                          <span className={`text-3xl font-black leading-none ${getGradeColor(pqcGrade as string)}`}>{pqcGrade}</span>
                          <span className="text-xs text-slate-400 font-medium">out of 100</span>
                        </div>
                      </div>
                      {/* Score bar */}
                      <div className="mt-3 h-2.5 w-64 max-w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ease-out ${getScoreBarColor(typeof pqcScore === 'number' ? pqcScore : 0)}`}
                          style={{ width: `${typeof pqcScore === 'number' ? pqcScore : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Vertical divider */}
                  <div className="hidden md:block w-px self-stretch bg-border" />

                  {/* Status chips */}
                  <div className="flex flex-wrap gap-3 flex-1">
                    {/* Security level */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Security Level</span>
                      <span className="text-base font-bold capitalize text-slate-800 dark:text-slate-200">{securityLevel}</span>
                    </div>

                    <div className="hidden md:block w-px self-stretch bg-border" />

                    {/* Quantum Ready */}
                    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold ${
                      quantumReady
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                    }`}>
                      {quantumReady ? <CheckCircle className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      Quantum Ready
                    </div>

                    {/* Hybrid Ready */}
                    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold ${
                      hybridReady
                        ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                        : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                    }`}>
                      {hybridReady ? <CheckCircle className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      Hybrid KEX
                    </div>

                    {/* Risk level chip */}
                    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold ${
                      (typeof pqcScore === 'number' ? pqcScore : 0) >= 80
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                        : (typeof pqcScore === 'number' ? pqcScore : 0) >= 60
                        ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300'
                        : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                    }`}>
                      <AlertTriangle className="w-4 h-4" />
                      {getRiskLevelInfo(typeof pqcScore === 'number' ? pqcScore : 0).label}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Legacy Protocol Warning — standalone alert when TLS 1.0/1.1 accepted */}
            {legacyProtocols.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-2xl p-6 shadow-[0_2px_10px_rgba(220,38,38,0.10)] flex items-start gap-5">
                <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/50 flex items-center justify-center flex-shrink-0">
                  <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h4 className="font-bold text-red-700 dark:text-red-300 text-base">
                      Deprecated TLS Protocols Detected
                    </h4>
                    {legacyProtocols.map((proto) => (
                      <span key={proto} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-200 dark:bg-red-900/60 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-700">
                        {proto}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-red-700/80 dark:text-red-300/80 leading-relaxed">
                    This server still accepts{" "}
                    <strong>{legacyProtocols.join(" and ")}</strong>, which are deprecated by
                    NIST SP 800-52r2 (2024), PCI DSS 4.0 §4.2.1, and RFC 8996.{" "}
                    Legacy sessions bypass PQC hybrid key exchange entirely — even an A+ hybrid
                    server is exposing some users to downgrade attacks (POODLE, BEAST) and
                    historical traffic interception through these versions.{" "}
                    <strong>Disable TLS 1.0/1.1 at your server and CDN/load-balancer layer immediately.</strong>
                  </p>
                </div>
              </div>
            )}

            {/* Component Security Analysis */}
            {result.raw_response?.pqc_analysis?.components && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/40 flex items-center justify-center">
                    <Package className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground tracking-tight">Component Security Analysis</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Per-category PQC grade and quantum-readiness breakdown</p>
                  </div>
                </div>

                {/* Stacked wide on mobile, multi-col on desktop */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  {Object.entries(result.raw_response.pqc_analysis.components).map(([key, value]: [string, any]) => (
                    <ComponentScoreCard key={key} name={key} data={value} />
                  ))}
                </div>

                {/* Grade legend */}
                <div className="flex flex-wrap gap-3 pt-1">
                  {[
                    { grade: 'A', label: 'Quantum-safe', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
                    { grade: 'B', label: 'Mostly secure', color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
                    { grade: 'C', label: 'Needs attention', color: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800' },
                    { grade: 'D', label: 'At risk', color: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800' },
                    { grade: 'F', label: 'Critical', color: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800' },
                  ].map(({ grade, label, color }) => (
                    <span key={grade} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${color}`}>
                      <span className="font-black">{grade}</span>
                      <span className="font-medium opacity-80">{label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Quantum Readiness Suggestions */}
            <SuggestionsPanel
              pqcAnalysis={result.raw_response?.pqc_analysis}
              domain={result.url}
            />

            {/* Detailed Technical Information */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/40 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground tracking-tight">Detailed Technical Information</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Click any row to inspect the full data</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* TLS/SSL Configuration Card */}
                <TechnicalInfoCard
                  title="TLS/SSL Configuration"
                  description="Protocol versions and cipher information"
                  icon={<Lock className="w-5 h-5 text-primary" />}
                  onViewDetails={() => setActiveModal('tls-config')}
                  itemCount={4}
                />

                {/* Elliptic Curves Card */}
                {tlsConfig.supported_elliptic_curves?.curves && tlsConfig.supported_elliptic_curves.curves.length > 0 && (
                  <TechnicalInfoCard
                    title="Elliptic Curves"
                    description="Supported key exchange curves"
                    icon={<Key className="w-5 h-5 text-primary" />}
                    onViewDetails={() => setActiveModal('elliptic-curves')}
                    itemCount={tlsConfig.supported_elliptic_curves.curves.length}
                  />
                )}

                {/* Certificate Chain Card */}
                <TechnicalInfoCard
                  title="Certificate Chain"
                  description="Certificate hierarchy and validation"
                  icon={<Shield className="w-5 h-5 text-primary" />}
                  onViewDetails={() => setActiveModal('cert-chain')}
                  itemCount={(certChain.intermediate_certificates || []).length + 1}
                />

                {/* Certificate Signatures Card */}
                {signatureAlgorithms.certificate_signatures && signatureAlgorithms.certificate_signatures.length > 0 && (
                  <TechnicalInfoCard
                    title="Certificate Signatures"
                    description="Signature algorithms in the certificate chain"
                    icon={<FileText className="w-5 h-5 text-primary" />}
                    onViewDetails={() => setActiveModal('cert-signatures')}
                    itemCount={signatureAlgorithms.certificate_signatures.length}
                  />
                )}

                {/* Handshake Signature Algorithms Card */}
                <TechnicalInfoCard
                  title="Handshake Signature Algorithms"
                  description="Algorithms used during TLS handshake"
                  icon={<Zap className="w-5 h-5 text-primary" />}
                  onViewDetails={() => setActiveModal('handshake-signatures')}
                  itemCount={signatureAlgorithms.handshake_signatures?.length || 0}
                />

                {/* Cipher Suites Card */}
                <TechnicalInfoCard
                  title="Cipher Suites"
                  description="Supported TLS cipher suites and encryption methods"
                  icon={<Lock className="w-5 h-5 text-primary" />}
                  onViewDetails={() => setActiveModal('cipher-suites')}
                  itemCount={(tlsConfig['tls_1.3_cipher_suites']?.suites?.length || 0) + (tlsConfig['tls_1.2_cipher_suites']?.suites?.length || 0)}
                />

                {/* Security Headers Card */}
                <TechnicalInfoCard
                  title="Security Headers"
                  description="HTTP security headers configuration"
                  icon={<Shield className="w-5 h-5 text-primary" />}
                  onViewDetails={() => setActiveModal('security-headers')}
                  itemCount={5}
                />

                {/* Raw Scan Data Card */}
                {rawData && Object.keys(rawData).length > 0 && (
                  <TechnicalInfoCard
                    title="Raw Scan Data (JSON)"
                    description="Complete unformatted scan response"
                    icon={<FileText className="w-5 h-5 text-primary" />}
                    onViewDetails={() => setActiveModal('raw-data')}
                  />
                )}
              </div>
            </div>
              <TechnicalDetailModal
                isOpen={activeModal === 'tls-config'}
                onClose={() => setActiveModal(null)}
                title="TLS/SSL Configuration"
                icon={<Lock className="w-5 h-5 text-primary" />}
              >
                <DetailRow label="Supported Protocols" value={(tlsConfig.supported_protocols || []).join(', ') || 'N/A'} />
                <DetailRow label="Cipher Protocol" value={result.cipher_protocol || 'N/A'} />
                <DetailRow label="Cipher Suite" value={result.cipher_suite_name || 'N/A'} />
                <DetailRow label="Cipher Strength" value={result.cipher_strength_bits ? `${result.cipher_strength_bits} bits` : 'N/A'} />
              </TechnicalDetailModal>

              <TechnicalDetailModal
                isOpen={activeModal === 'elliptic-curves'}
                onClose={() => setActiveModal(null)}
                title="Elliptic Curves"
                icon={<Key className="w-5 h-5 text-primary" />}
              >
                {(tlsConfig.supported_elliptic_curves?.curves || []).map((curve: any, idx: number) => (
                  <div key={idx} className="p-4 bg-muted/50 rounded-xl">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium">{curve.name}</div>
                      <div className="text-sm text-muted-foreground">{curve.type} ({curve.bits} bits)</div>
                    </div>
                    {curve.curve_pqc_score !== undefined && (
                      <div className="mt-2 flex items-center justify-between">
                        <PQCStatusBadges 
                          is_pqc={curve.curve_is_pqc}
                          is_hybrid={curve.curve_is_hybrid}
                          quantum_safe={curve.curve_quantum_safe}
                        />
                        <div className={`text-sm font-semibold ${getGradeColor(curve.curve_pqc_grade)}`}>
                          {curve.curve_pqc_grade} ({curve.curve_pqc_score})
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </TechnicalDetailModal>

              <TechnicalDetailModal
                isOpen={activeModal === 'cert-chain'}
                onClose={() => setActiveModal(null)}
                title="Certificate Chain"
                icon={<Shield className="w-5 h-5 text-primary" />}
              >
                <div className="space-y-4">
                  <div className="mb-4 p-5 bg-muted/50 rounded-xl">
                  <div className="font-semibold mb-2">Leaf Certificate</div>
                  <DetailRow label="Subject" value={result.cert_subject || 'N/A'} />
                  <DetailRow label="Issuer" value={result.cert_issuer || 'N/A'} />
                  <DetailRow label="Valid From" value={result.cert_not_before || 'N/A'} />
                  <DetailRow label="Valid Until" value={result.cert_not_after || 'N/A'} />
                  <DetailRow label="Public Key Algorithm" value={result.public_key_algorithm || 'N/A'} />
                  <DetailRow label="Public Key Size" value={result.public_key_size_bits ? `${result.public_key_size_bits} bits` : 'N/A'} />
                  <DetailRow label="Certificate Transparency" value={
                    leafCert.certificate_transparency ? (
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span className="text-emerald-600">Enabled</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <X className="w-4 h-4 text-rose-600" />
                        <span className="text-rose-600">Disabled</span>
                      </div>
                    )
                  } />
                  {leafCert.cert_pqc_score !== undefined && (
                    <div className="mt-3 pt-3 border-t">
                      <DetailRow label="PQC Grade" value={
                        <span className={`font-bold ${getGradeColor(leafCert.cert_pqc_grade)}`}>
                          {leafCert.cert_pqc_grade} ({leafCert.cert_pqc_score})
                        </span>
                      } />
                      <DetailRow label="Status" value={
                        <PQCStatusBadges 
                          is_pqc={leafCert.cert_is_pqc}
                          is_hybrid={leafCert.cert_is_hybrid}
                          quantum_safe={leafCert.cert_quantum_safe}
                        />
                      } />
                    </div>
                  )}
                </div>

                  {(certChain.intermediate_certificates || []).map((cert: any, index: number) => (
                  <div key={`intermediate-${index}`} className="mb-4 p-5 bg-muted/50 rounded-xl">
                    <div className="font-semibold mb-2">Intermediate Certificate {index + 1}</div>
                    <DetailRow label="Public Key Algorithm" value={cert.public_key_algorithm || 'N/A'} />
                    <DetailRow label="Public Key Size" value={`${cert.public_key_size || 'N/A'} bits`} />
                    {cert.cert_pqc_score !== undefined && (
                      <div className="mt-2 pt-2 border-t">
                        <DetailRow label="PQC Grade" value={
                          <span className={`font-bold ${getGradeColor(cert.cert_pqc_grade)}`}>
                            {cert.cert_pqc_grade} ({cert.cert_pqc_score})
                          </span>
                        } />
                        <DetailRow label="Status" value={
                          <PQCStatusBadges 
                            is_pqc={cert.cert_is_pqc}
                            is_hybrid={cert.cert_is_hybrid}
                            quantum_safe={cert.cert_quantum_safe}
                          />
                        } />
                      </div>
                    )}
                  </div>
                ))}
                </div>
              </TechnicalDetailModal>

              <TechnicalDetailModal
                isOpen={activeModal === 'cert-signatures'}
                onClose={() => setActiveModal(null)}
                title="Certificate Signatures"
                icon={<FileText className="w-5 h-5 text-primary" />}
              >
                <div className="space-y-3">
                  {signatureAlgorithms.certificate_signatures.map((sig: any, idx: number) => (
                    <div key={idx} className="p-5 bg-muted/50 rounded-xl">
                      <div className="font-semibold mb-2">Position {sig.position}: {sig.certificate_subject}</div>
                      <DetailRow label="Signature Algorithm" value={sig.signature_algorithm} />
                      <DetailRow label="Hash Algorithm" value={sig.hash_algorithm} />
                      <DetailRow label="Public Key" value={`${sig.public_key_type} (${sig.public_key_size} bits)`} />
                      {sig.sig_pqc_score !== undefined && (
                        <div className="mt-2 pt-2 border-t">
                          <DetailRow label="PQC Grade" value={
                            <span className={`font-bold ${getGradeColor(sig.sig_pqc_grade)}`}>
                              {sig.sig_pqc_grade} ({sig.sig_pqc_score})
                            </span>
                          } />
                          <DetailRow label="Status" value={
                            <PQCStatusBadges 
                              is_pqc={sig.sig_is_pqc}
                              is_hybrid={sig.sig_is_hybrid}
                              quantum_safe={sig.sig_quantum_safe}
                            />
                          } />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </TechnicalDetailModal>

              <TechnicalDetailModal
                isOpen={activeModal === 'handshake-signatures'}
                onClose={() => setActiveModal(null)}
                title="Handshake Signature Algorithms"
                icon={<Zap className="w-5 h-5 text-primary" />}
              >
                {signatureAlgorithms.handshake_signatures && signatureAlgorithms.handshake_signatures.length > 0 ? (
                  <div className="space-y-3">
                    {signatureAlgorithms.handshake_signatures.map((sig: any, idx: number) => (
                      <div key={idx} className="p-4 bg-muted/50 rounded-xl">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-medium">{sig.algorithm}</div>
                          <div className="text-sm text-muted-foreground">{sig.protocol}</div>
                        </div>
                        {sig.sig_pqc_score !== undefined && (
                          <div className="mt-2 flex items-center justify-between">
                            <PQCStatusBadges 
                              is_pqc={sig.sig_is_pqc}
                              is_hybrid={sig.sig_is_hybrid}
                              quantum_safe={sig.sig_quantum_safe}
                            />
                            <div className={`text-sm font-semibold ${getGradeColor(sig.sig_pqc_grade)}`}>
                              {sig.sig_pqc_grade} ({sig.sig_pqc_score})
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No handshake signature algorithms available</p>
                )}
              </TechnicalDetailModal>

              <TechnicalDetailModal
                isOpen={activeModal === 'cipher-suites'}
                onClose={() => setActiveModal(null)}
                title="Cipher Suites"
                icon={<Lock className="w-5 h-5 text-primary" />}
              >
                {tlsConfig['tls_1.3_cipher_suites'] && (
                  <div className="mb-6">
                    <div className="font-semibold mb-2 flex justify-between items-center">
                      <span>TLS 1.3 Cipher Suites</span>
                      {tlsConfig['tls_1.3_cipher_suites'].component_kex_score !== undefined && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">KEX Score: </span>
                          <span className={`font-bold ${getGradeColor(tlsConfig['tls_1.3_cipher_suites'].component_kex_grade)}`}>
                            {tlsConfig['tls_1.3_cipher_suites'].component_kex_grade} ({tlsConfig['tls_1.3_cipher_suites'].component_kex_score})
                          </span>
                        </div>
                      )}
                    </div>
                    {(tlsConfig['tls_1.3_cipher_suites'].suites || []).map((cipher: any, idx: number) => (
                      <div key={idx} className="border-b border-border last:border-0 py-3">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{cipher.name}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Encryption: {cipher.encryption} | Hash: {getHashFromCipherName(cipher.name)}
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground ml-4">
                            {cipher.key_exchange} {cipher.curve_bits ? `(${cipher.curve_bits} bits)` : ''}
                          </div>
                        </div>
                        {cipher.kex_pqc_score !== undefined && (
                          <div className="flex gap-4 text-xs mt-2">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">KEX:</span>
                              <span className={`font-semibold ${getGradeColor(cipher.kex_pqc_grade)}`}>
                                {cipher.kex_pqc_grade} ({cipher.kex_pqc_score})
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {tlsConfig['tls_1.2_cipher_suites'] && (
                  <div>
                    <div className="font-semibold mb-2 flex justify-between items-center">
                      <span>TLS 1.2 Cipher Suites</span>
                      {tlsConfig['tls_1.2_cipher_suites'].component_kex_score !== undefined && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">KEX Score: </span>
                          <span className={`font-bold ${getGradeColor(tlsConfig['tls_1.2_cipher_suites'].component_kex_grade)}`}>
                            {tlsConfig['tls_1.2_cipher_suites'].component_kex_grade} ({tlsConfig['tls_1.2_cipher_suites'].component_kex_score})
                          </span>
                        </div>
                      )}
                    </div>
                    {(tlsConfig['tls_1.2_cipher_suites'].suites || []).map((cipher: any, idx: number) => (
                      <div key={idx} className="border-b border-border last:border-0 py-3">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{cipher.name}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Encryption: {cipher.encryption} | Hash: {getHashFromCipherName(cipher.name)}
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground ml-4">
                            {cipher.key_exchange} {cipher.curve_bits ? `(${cipher.curve_bits} bits)` : ''}
                          </div>
                        </div>
                        {cipher.kex_pqc_score !== undefined && (
                          <div className="flex gap-4 text-xs mt-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">KEX:</span>
                              <span className={`font-semibold ${getGradeColor(cipher.kex_pqc_grade)}`}>
                                {cipher.kex_pqc_grade} ({cipher.kex_pqc_score})
                              </span>
                              <PQCStatusBadges 
                                is_pqc={cipher.kex_is_pqc}
                                is_hybrid={cipher.kex_is_hybrid}
                                quantum_safe={cipher.kex_quantum_safe}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">Encryption:</span>
                              <span className={`font-semibold ${getGradeColor(cipher.encryption_pqc_grade)}`}>
                                {cipher.encryption_pqc_grade} ({cipher.encryption_pqc_score})
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TechnicalDetailModal>

              <TechnicalDetailModal
                isOpen={activeModal === 'security-headers'}
                onClose={() => setActiveModal(null)}
                title="Security Headers"
                icon={<Shield className="w-5 h-5 text-primary" />}
              >
                <DetailRow label="HSTS Enabled" value={
                  result.hsts_enabled ? (
                    <span className="text-emerald-600 font-semibold">✓ Enabled</span>
                  ) : (
                    <span className="text-rose-600 font-semibold">✗ Disabled</span>
                  )
                } />
                <DetailRow label="CSP Enabled" value={
                  result.csp_enabled ? (
                    <span className="text-emerald-600 font-semibold">✓ Enabled</span>
                  ) : (
                    <span className="text-rose-600 font-semibold">✗ Disabled</span>
                  )
                } />
                <DetailRow label="X-Frame-Options" value={
                  result.x_frame_options_enabled ? (
                    <span className="text-emerald-600 font-semibold">✓ Enabled</span>
                  ) : (
                    <span className="text-rose-600 font-semibold">✗ Disabled</span>
                  )
                } />
                <DetailRow label="OCSP Stapling" value={
                  result.ocsp_stapling_active ? (
                    <span className="text-emerald-600 font-semibold">✓ Active</span>
                  ) : (
                    <span className="text-rose-600 font-semibold">✗ Inactive</span>
                  )
                } />
              </TechnicalDetailModal>

              <TechnicalDetailModal
                isOpen={activeModal === 'raw-data'}
                onClose={() => setActiveModal(null)}
                title="Raw Scan Data (JSON)"
                icon={<FileText className="w-5 h-5 text-primary" />}
              >
                <div className="bg-slate-900 dark:bg-slate-950 p-6 rounded-xl overflow-auto max-h-96">
                  <pre className="text-xs font-mono text-slate-100 whitespace-pre-wrap break-words">
                    {JSON.stringify(rawData, null, 2)}
                  </pre>
                </div>
              </TechnicalDetailModal>
          </div>
        ) : (
          // Failed/HTTP Scan View
          <div className="max-w-2xl mx-auto">
            <div className={`p-8 rounded-2xl ${
              result.scan_status === 'http_skipped' 
                ? 'bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-200 dark:border-amber-900' 
                : 'bg-rose-50 dark:bg-rose-950/30 border-2 border-rose-200 dark:border-rose-900'
            }`}>
              {result.scan_status === 'http_skipped' ? (
                <>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/40 rounded-2xl flex items-center justify-center">
                      <AlertTriangle className="w-8 h-8 text-amber-600" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-amber-900 dark:text-amber-100">
                        HTTP Domain - Cannot Scan
                      </h2>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        This domain uses unsecured HTTP protocol
                      </p>
                    </div>
                  </div>
                  <p className="text-amber-800 dark:text-amber-200 mb-4 leading-relaxed">
                    {result.error_message || 'This domain uses HTTP instead of HTTPS. We can only analyze TLS/SSL encrypted connections (HTTPS).'}
                  </p>
                  <div className="bg-amber-100 dark:bg-amber-900/40 rounded-xl p-6">
                    <p className="font-semibold text-amber-900 dark:text-amber-100 mb-3">Why can't we scan this domain?</p>
                    <ul className="list-disc list-inside space-y-2 text-amber-800 dark:text-amber-200 text-sm">
                      <li>HTTP domains don't use encryption</li>
                      <li>No cryptographic data is available to analyze</li>
                      <li>TLS/SSL certificates are only present on HTTPS connections</li>
                      <li>Post-quantum cryptography analysis requires encrypted traffic</li>
                    </ul>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/40 rounded-2xl flex items-center justify-center">
                      <ShieldAlert className="w-8 h-8 text-rose-600" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-rose-900 dark:text-rose-100">
                        Scan Failed
                      </h2>
                      <p className="text-sm text-rose-700 dark:text-rose-300">
                        Unable to complete security analysis
                      </p>
                    </div>
                  </div>
                  <p className="text-rose-800 dark:text-rose-200 leading-relaxed">
                    {result.error_message || 'An unknown error occurred during the scan. Please try again or contact support if the issue persists.'}
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
// DOMAIN CARD COMPONENT FOR LIST VIEW
// ============================================================================

const DomainCard: React.FC<{
  result: ScanResult;
  onViewDetails: () => void;
}> = ({ result, onViewDetails }) => {
  const isSuccess = result.scan_status === 'completed';
  const isHttpSkipped = result.scan_status === 'http_skipped';
  const pqcScore = result.raw_response?.pqc_analysis?.overall_score ?? 'N/A';
  const pqcGrade = result.raw_response?.pqc_analysis?.overall_grade ?? 'N/A';
  const quantumReady = result.raw_response?.pqc_analysis?.quantum_ready ?? false;

  return (
    <Card 
      className="cursor-pointer transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-2xl hover:-translate-y-1 shadow-md"
      onClick={onViewDetails}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-6 pt-6">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Domain Scan
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1 truncate">{result.url}</p>
        </div>
        <div>
          {isSuccess ? (
            <span className="px-2 py-1 text-xs rounded-full bg-success/10 text-success font-semibold">
              ● Completed
            </span>
          ) : isHttpSkipped ? (
            <span className="px-2 py-1 text-xs rounded-full bg-amber-500/10 text-amber-600 font-semibold">
              ● HTTP
            </span>
          ) : (
            <span className="px-2 py-1 text-xs rounded-full bg-destructive/10 text-destructive font-semibold">
              ● Failed
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-6 pb-6">
        <div className="space-y-4">
          <div>
            <h5 className="font-semibold truncate text-base mb-1">{result.url}</h5>
            <div className="text-xs text-muted-foreground">
              {isSuccess ? (
                <span className="text-success">Scan successful</span>
              ) : isHttpSkipped ? (
                <span className="text-amber-600">HTTP - Not scannable</span>
              ) : (
                <span className="text-destructive">Scan failed</span>
              )}
            </div>
          </div>

          {isSuccess && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/30 p-3 rounded-lg text-center">
                <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">PQC Score</div>
                <div className="font-bold text-sm">{typeof pqcScore === 'number' ? pqcScore.toFixed(1) : 'N/A'}</div>
              </div>
              <div className="bg-muted/30 p-3 rounded-lg text-center">
                <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Grade</div>
                <div className={`font-bold text-sm ${getGradeColor(pqcGrade as string)}`}>
                  {pqcGrade}
                </div>
              </div>
              <div className="bg-muted/30 p-3 rounded-lg text-center">
                <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Status</div>
                <div className={`font-bold text-sm ${quantumReady ? 'text-success' : 'text-destructive'}`}>
                  {quantumReady ? 'Ready' : 'Not Ready'}
                </div>
              </div>
            </div>
          )}
          
          {isHttpSkipped && (
            <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg text-xs text-amber-800 dark:text-amber-200">
              <p className="font-medium">Cannot analyze HTTP domains. HTTPS required.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ============================================================================
// MAIN RESULTS DETAIL PAGE COMPONENT
// ============================================================================

const ResultsDetailPage: React.FC<ResultsDetailPageProps> = ({ scan, onBack, targetDomain }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<ScanResult | null>(null);

  // For single-scan architecture: if no detailedResults, the scan itself is the result
  // Show DomainDetailPage directly
  const isSingleScan = !scan.detailedResults || scan.detailedResults.length === 0;
  
  // If this is a single scan, show the domain detail page directly
  if (isSingleScan && scan.url && !scan.url.startsWith('Scanning')) {
    return (
      <DomainDetailPage 
        result={scan} 
        onBack={onBack} 
      />
    );
  }

  // If a target domain is provided (e.g., from Applications page), pre-filter to it
  useEffect(() => {
    if (targetDomain && scan.detailedResults) {
      setSearchQuery(targetDomain);
      // Auto-select the domain if found
      const matchingResult = scan.detailedResults?.find(
        result => result.url.toLowerCase() === targetDomain.toLowerCase()
      );
      if (matchingResult) {
        setSelectedDomain(matchingResult);
      }
    }
  }, [targetDomain, scan.detailedResults]);

  // Filter results based on search query
  const filteredResults = useMemo(() => {
    if (!scan.detailedResults) return [];
    return scan.detailedResults.filter(result =>
      result.url.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [scan.detailedResults, searchQuery]);

  // Calculate summary stats
  const stats = useMemo(() => {
    if (!scan.detailedResults) return { successful: 0, failed: 0 };
    return {
      successful: scan.detailedResults.filter(r => r.scan_status === 'completed').length,
      failed: scan.detailedResults.filter(r => r.scan_status !== 'completed').length,
    };
  }, [scan.detailedResults]);

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  // If a domain is selected, show the detail page
  if (selectedDomain) {
    return (
      <DomainDetailPage 
        result={selectedDomain} 
        onBack={() => setSelectedDomain(null)} 
      />
    );
  }

  // Otherwise, show the list view
  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ duration: 0.3 }}
      className="p-4 sm:p-6 max-w-7xl mx-auto"
    >
      {/* Header */}
      <div className="mb-8">
        <UnifiedBackButton 
          onClick={onBack}
          label="Back to Scan History"
          className="mb-4"
        />
        
        <div>
          <h2 className="text-3xl sm:text-4xl font-bold">
            Scan Results
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Request ID: {scan.request_id}
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Successful</p>
                <h3 className="text-2xl font-bold mt-2">{stats.successful}</h3>
              </div>
              <div className="p-3 rounded-full bg-success/10 dark:bg-success/20">
                <CheckCircle className="w-6 h-6 text-success" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Failed</p>
                <h3 className="text-2xl font-bold mt-2">{stats.failed}</h3>
              </div>
              <div className="p-3 rounded-full bg-destructive/10 dark:bg-destructive/20">
                <ShieldAlert className="w-6 h-6 text-destructive" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <h3 className="text-2xl font-bold mt-2">{scan.detailedResults?.length ?? 0}</h3>
              </div>
              <div className="p-3 rounded-full bg-primary/10 dark:bg-primary/20">
                <Globe className="w-6 h-6 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Duration</p>
                <h3 className="text-2xl font-bold mt-2">{scan.execution_time_seconds?.toFixed(2) ?? 'N/A'}s</h3>
              </div>
              <div className="p-3 rounded-full bg-muted/10 dark:bg-muted/20">
                <Clock className="w-6 h-6 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-8 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by domain name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-12 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500/20 transition-all"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Showing {filteredResults.length} of {scan.detailedResults?.length ?? 0} domains
        </p>
      </div>

      {/* Domain Cards Grid */}
      {filteredResults.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredResults.map((result, index) => (
            <motion.div
              key={result.id || `${result.url}-${index}-${result.requested_at || Date.now()}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.4 }}
            >
              <DomainCard
                result={result}
                onViewDetails={() => setSelectedDomain(result)}
              />
            </motion.div>
          ))}
        </div>
      ) : (
        <Card className="bg-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {searchQuery ? 'No domains found' : 'No results available'}
            </p>
            <p className="text-sm text-slate-500">
              {searchQuery ? 'Try adjusting your search' : 'Start by running a scan'}
            </p>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
};

export default ResultsDetailPage;