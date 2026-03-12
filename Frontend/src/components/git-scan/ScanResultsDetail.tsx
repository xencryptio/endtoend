import React, { useState, useEffect } from 'react';
import { RefreshCw, Shield, AlertTriangle, Clock, Package, XCircle, CheckCircle, ArrowLeft, Eye, Loader2, FileText, Hash, Zap } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { UnifiedMetricCard, UnifiedBackButton } from "@/components/ui/unified";
import { ScanDetail, Algorithm } from './types';

const API_URL = import.meta.env.VITE_REPO_SCAN_API_URL;

// Clean repo URL for display: https://github.com/user/repo.git → user/repo
const formatRepoName = (url: string): string => {
  try {
    return url
      .replace(/^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\//, '')
      .replace(/\.git$/, '');
  } catch {
    return url;
  }
};

// Helper function to get color for letter grades
const getGradeColor = (grade: string): string => {
  if (!grade) return 'text-zinc-500';
  const letter = grade.charAt(0);
  switch (letter) {
    case 'A': return 'text-emerald-600 dark:text-emerald-400';
    case 'B': return 'text-primary';
    case 'C': return 'text-warning';
    case 'D': return 'text-orange-600 dark:text-orange-400';
    case 'F': return 'text-rose-600 dark:text-rose-400';
    default: return 'text-zinc-600 dark:text-zinc-400';
  }
};

// Helper function to get color for score progress bars
const getScoreBarColor = (score: number): string => {
  if (score >= 90) return 'bg-emerald-500';
  if (score >= 80) return 'bg-primary';
  if (score >= 70) return 'bg-warning';
  if (score >= 60) return 'bg-orange-500';
  return 'bg-rose-500';
};

// Helper function to get risk level information
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

// Helper function to display category names nicely
const getCategoryDisplayName = (category: string): string => {
  const names: Record<string, string> = {
    'kex': 'Key Exchange',
    'signature': 'Digital Signatures',
    'symmetric': 'Symmetric Encryption',
    'hash': 'Hash Functions'
  };
  return names[category] || category;
};

// Add this helper function at the top of your component
const isDataReady = (scanDetail: ScanDetail | null): boolean => {
  if (!scanDetail) return false;
  
  // Check if critical data is loaded
  const hasBasicData = !!(
    scanDetail.overall_security_score !== undefined &&
    scanDetail.overall_grade &&
    scanDetail.quantum_readiness_percentage !== undefined
  );
  
  return hasBasicData;
};

const SkeletonCard = () => (
  <div className="bg-card/60 rounded-2xl p-6 border backdrop-blur-sm animate-pulse h-48">
    <div className="h-4 bg-muted/50 rounded w-1/3 mb-6"></div>
    <div className="flex items-end gap-3 mb-6">
        <div className="h-12 bg-muted/50 rounded w-16"></div>
        <div className="h-8 bg-muted/50 rounded w-8"></div>
    </div>
    <div className="h-3 bg-muted/50 rounded-full w-full"></div>
  </div>
);

interface AlgorithmSectionProps {
  title: string;
  description: string;
  algorithms: (Algorithm & { name: string })[];
  type: 'safe' | 'unsafe' | 'pqc';
  onViewOccurrences: (algorithmName: string) => void;
}

const AlgorithmSection: React.FC<AlgorithmSectionProps> = ({ title, description, algorithms, type, onViewOccurrences }) => {
  const sectionIcon = type === 'unsafe'
    ? <AlertTriangle className="w-4 h-4 text-rose-500" />
    : type === 'pqc'
    ? <Zap className="w-4 h-4 text-primary" />
    : <Shield className="w-4 h-4 text-emerald-500" />;

  const headerBg = type === 'pqc'
    ? 'bg-primary/5 dark:bg-primary/10 border-primary/20'
    : type === 'safe'
    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-800/30'
    : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/50 dark:border-rose-800/30';

  const countBg = type === 'pqc'
    ? 'bg-primary/10 text-primary border-primary/20'
    : type === 'safe'
    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
    : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';

  return (
    <div className="mb-8">
      {/* Section header */}
      <div className={`flex items-center justify-between px-4 py-3 rounded-t-xl border ${headerBg}`}>
        <div className="flex items-center gap-2.5">
          {sectionIcon}
          <div>
            <h3 className="text-sm font-bold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${countBg}`}>
          {algorithms.length}
        </span>
      </div>

      {/* Accordion list */}
      <div className="border border-t-0 rounded-b-xl overflow-hidden">
        <Accordion type="multiple" className="w-full">
          {algorithms.map((algo) => (
            <AccordionItem key={algo.name} value={algo.name} className="border-b last:border-b-0">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 transition-colors gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Quantum status icon */}
                  {algo.quantum_safe
                    ? <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    : <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                  }

                  {/* Algorithm name */}
                  <span className="font-semibold text-sm text-foreground truncate">
                    {algo.name}
                  </span>

                  {/* Category */}
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/60 px-2 py-0.5 rounded flex-shrink-0 hidden sm:inline-flex">
                    {algo.category}
                  </span>

                  {/* Deprecated badge */}
                  {algo.deprecated && (
                    <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded flex-shrink-0">
                      DEPRECATED
                    </span>
                  )}

                  <div className="flex-1" />

                  {/* Stats */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0 hidden md:flex">
                    <span className="tabular-nums">{algo.occurrences} usage{algo.occurrences !== 1 ? 's' : ''}</span>
                    <span className="text-border">·</span>
                    <span className="tabular-nums">{algo.files_affected || 0} file{(algo.files_affected || 0) !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Grade */}
                  {algo.grade && (
                    <span className={`text-base font-bold flex-shrink-0 min-w-[2rem] text-right ${getGradeColor(algo.grade)}`}>
                      {algo.grade}
                    </span>
                  )}
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-4 pb-4">
                <div className="ml-7 space-y-3">
                  {/* Badges row */}
                  <div className="flex flex-wrap gap-2">
                    {algo.security_level && (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold ${
                        algo.security_level === 'critical'
                          ? 'bg-destructive/10 text-destructive'
                          : algo.security_level === 'high'
                          ? 'bg-success/10 text-success'
                          : algo.security_level === 'medium'
                          ? 'bg-warning/10 text-warning'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {algo.security_level.toUpperCase()} SECURITY
                      </span>
                    )}
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold ${
                      algo.quantum_safe
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                    }`}>
                      {algo.quantum_safe ? 'QUANTUM-SAFE' : 'QUANTUM-VULNERABLE'}
                    </span>
                    {algo.quantum_resistance_type && (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold ${
                        algo.quantum_resistance_type === 'fully_resistant' || algo.quantum_resistance_type === 'grover_resistant'
                          ? 'bg-primary/10 text-primary'
                          : algo.quantum_resistance_type === 'vulnerable'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {algo.quantum_resistance_type.replace('_', ' ').toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Reason */}
                  {algo.quantum_safety_reason && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {algo.quantum_safety_reason}
                    </p>
                  )}

                  {/* Stats + action row */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-5 text-xs">
                      <div>
                        <span className="text-muted-foreground">Active Usages: </span>
                        <span className="font-semibold text-foreground">{algo.occurrences}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Files: </span>
                        <span className="font-semibold text-foreground">{algo.files_affected || 0}</span>
                      </div>
                      {(algo.commented_occurrences ?? 0) > 0 && (
                        <div title="Found in comments/docstrings (excluded from scoring)">
                          <span className="text-muted-foreground">In Comments: </span>
                          <span className="font-semibold text-muted-foreground/60">{algo.commented_occurrences}</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onViewOccurrences(algo.name); }}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      View Occurrences
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
};

import AlgorithmFindingsModal from './AlgorithmFindingsModal';
import RepoSuggestionsPanel from './RepoSuggestionsPanel';

interface ScanResultsDetailProps {
  scanId: number;
  onBack: () => void;
}

const ScanResultsDetail: React.FC<ScanResultsDetailProps> = ({ scanId, onBack }) => {
  const [scanDetail, setScanDetail] = useState<ScanDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<string | null>(null);
  const [isFindingsModalOpen, setIsFindingsModalOpen] = useState(false);


  useEffect(() => {
    const loadScanDetail = async (id: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/api/scans/${id}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch scan details. Status: ${response.status}`);
        }
        const data: ScanDetail = await response.json();
        setScanDetail(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load scan details');
      } finally {
        setIsLoading(false);
      }
    };

    loadScanDetail(scanId);
  }, [scanId]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-6">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <div className="space-y-2">
              <p className="text-base font-bold text-foreground">Loading scan details</p>
              <p className="text-sm text-muted-foreground font-medium">Please wait...</p>
            </div>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="text-center max-w-md bg-card text-card-foreground rounded-2xl p-8 shadow-[0_8px_24px_rgba(0,0,0,0.1)] border">
            <div className="w-20 h-20 bg-gradient-to-br from-rose-100 to-rose-200 dark:from-rose-900/40 dark:to-rose-950/60 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <XCircle className="w-10 h-10 text-rose-600 dark:text-rose-400" />
            </div>
            <p className="text-xl font-bold text-foreground mb-3 tracking-tight">Error Loading Scan</p>
            <p className="text-sm text-muted-foreground leading-relaxed bg-muted/50 p-4 rounded-lg border">
              {error}
            </p>
          </div>
        </div>
      );
    }

    // ADD THIS CHECK - Wait for data to be fully ready
    if (!isDataReady(scanDetail)) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-6">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <div className="space-y-2">
              <p className="text-base font-bold text-foreground">Processing scan data</p>
              <p className="text-sm text-muted-foreground font-medium">Almost ready...</p>
            </div>
          </div>
        </div>
      );
    }

    if (!scanDetail) {
      return <div className="text-center p-10">No scan details found.</div>;
    }

    const data = scanDetail;
    const algorithms = data.algorithms || {};
    const truePQC: (Algorithm & { name: string })[] = [];
    const quantumSafe: (Algorithm & { name: string })[] = [];
    const quantumVulnerable: (Algorithm & { name: string })[] = [];
    
    Object.entries(algorithms).forEach(([name, info]) => {
      const algoWithName = { name, ...info };
      
      if (info.is_pqc) {
        truePQC.push(algoWithName);
      } else if (info.quantum_safe) {
        quantumSafe.push(algoWithName);
      } else {
        quantumVulnerable.push(algoWithName);
      }
    });

    const handleViewOccurrences = (algorithmName: string) => {
      setSelectedAlgorithm(algorithmName);
      setIsFindingsModalOpen(true);
    };

    const handleCloseModal = () => {
      setIsFindingsModalOpen(false);
      setSelectedAlgorithm(null);
    };

    const quantumSafeCount = quantumSafe.length;
    const quantumVulnerableCount = quantumVulnerable.length;
    const truePQCCount = truePQC.length;

    return (
      <div className="p-6 bg-background">
        <div className="bg-card/70 text-card-foreground p-8 rounded-2xl mb-8 shadow-[0_2px_10px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.3)] border backdrop-blur-sm">
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-6 items-center text-sm">
              <div>
                <strong>Branch:</strong>{' '}
                <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-primary/5 dark:bg-primary/50 text-primary text-xs font-semibold border border-primary/20 dark:border-primary/90 shadow-sm">
                  {data.branch_name || 'main'}
                </span>
              </div>
              <div>
                <strong>Platform:</strong>{' '}
                <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-primary/5 dark:bg-primary/50 text-primary text-xs font-semibold border border-primary/20 dark:border-primary/90 shadow-sm">
                  {data.platform || 'Unknown'}
                </span>
              </div>
              <div>
                <strong>Last Scanned:</strong> {new Date(data.last_scanned).toLocaleString()}
              </div>
            </div>
            <div className="mt-3">
              <strong>Commit Hash:</strong>{' '}
              <code className="bg-white dark:bg-slate-700 px-2 py-1 rounded text-xs">{data.repo_hash}</code>
            </div>
          </div>
        </div>

        <div className="bg-card/80 border rounded-2xl p-6 mb-8 shadow-[0_4px_14px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.4)] backdrop-blur-sm">
          <div className="mb-6 pb-4 border-b">
            <h3 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/40 flex items-center justify-center">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              Overall Security Assessment
            </h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-card/60 rounded-xl p-5 border">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Security Score</div>
              <div className="flex items-end gap-2 mb-3">
                <div className="text-5xl font-bold text-foreground tracking-tight">
                  {data.overall_security_score?.toFixed(1) ?? 'N/A'}
                </div>
                <div className={`text-2xl font-bold mb-1 ${getGradeColor(data.overall_grade ?? '')}`}>
                  {data.overall_grade ?? 'N/A'}
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-700 ease-out ${getScoreBarColor(data.overall_security_score ?? 0)}`}
                  style={{ width: `${data.overall_security_score ?? 0}%` }}
                />
              </div>
            </div>

            <div className="bg-card/60 rounded-xl p-5 border">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Quantum Readiness</div>
              <div className="flex items-end gap-1.5 mb-3">
                <div className="text-5xl font-bold text-foreground tracking-tight">
                  {data.quantum_readiness_percentage?.toFixed(1) ?? '0.0'}
                </div>
                <div className="text-2xl font-bold text-muted-foreground mb-1">%</div>
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                Quantum-safe operations by weighted usage
              </div>
            </div>

            <div className="bg-card/60 rounded-xl p-5 border">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Risk Level</div>
              <div className={`text-2xl font-bold tracking-tight mb-2 ${getRiskLevelInfo(data.overall_security_score ?? 0).color}`}>
                {getRiskLevelInfo(data.overall_security_score ?? 0).label}
              </div>
              <div className={`inline-flex items-center px-2.5 py-1.5 rounded-md text-[10px] font-semibold border ${
                (data.overall_security_score ?? 0) >= 80
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
                  : (data.overall_security_score ?? 0) >= 60
                  ? 'bg-warning/5 dark:bg-warning/30 border-warning/20 dark:border-warning/90 text-warning'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'
              }`}>
                {getRiskLevelInfo(data.overall_security_score ?? 0).description}
              </div>
            </div>
          </div>
        </div>

        {data.category_scores && Object.keys(data.category_scores).length > 0 && (
          <div className="border rounded-xl overflow-hidden mb-8">
            <div className="flex items-center gap-2.5 px-4 py-3 bg-muted/20 border-b">
              <Package className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Security by Category</h3>
            </div>
            <div className="divide-y">
              {Object.entries(data.category_scores).map(([category, score]) => (
                <div key={category} className="px-4 py-3 flex items-center gap-4">
                  <div className="w-36 flex-shrink-0">
                    <div className="text-xs font-bold text-foreground">{getCategoryDisplayName(category)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {score.algorithm_count} algo{score.algorithm_count !== 1 ? 's' : ''}
                      {score.best_algorithm && <> &middot; Best: <span className="text-emerald-600 dark:text-emerald-400">{score.best_algorithm}</span></>}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-700 ease-out ${getScoreBarColor(score.score)}`}
                        style={{ width: `${score.score}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-lg font-bold tabular-nums ${getGradeColor(score.grade)}`}>{score.score.toFixed(0)}</span>
                    <span className={`text-xs font-bold ${getGradeColor(score.grade)}`}>{score.grade}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <UnifiedMetricCard
            label="Files Scanned"
            value={data.total_files || 0}
            icon={<FileText size={16} />}
            iconColor="muted"
          />
          <UnifiedMetricCard
            label="Total Algorithms"
            value={Object.keys(algorithms).length}
            icon={<Hash size={16} />}
            iconColor="muted"
          />
          <UnifiedMetricCard
            label="True PQC"
            value={truePQCCount}
            description="Kyber, Dilithium, SPHINCS+"
            icon={<Zap size={16} />}
            iconColor="primary"
          />
          <UnifiedMetricCard
            label="Quantum-Safe"
            value={quantumSafeCount}
            description="AES-256, SHA-512, etc."
            icon={<Shield size={16} />}
            iconColor="success"
          />
          <UnifiedMetricCard
            label="Vulnerable"
            value={quantumVulnerableCount}
            description="RSA, ECDSA, weak sizes"
            icon={<AlertTriangle size={16} />}
            iconColor="destructive"
          />
        </div>

        {quantumVulnerable.length > 0 && (
          <AlgorithmSection 
            title="Quantum-Vulnerable Algorithms" 
            description="Will be broken by quantum computers: RSA, ECDSA, DH, or weak parameters (AES-128, SHA-256)" 
            algorithms={quantumVulnerable} 
            type="unsafe"
            onViewOccurrences={handleViewOccurrences}
          />
        )}
        {truePQC.length > 0 && (
          <AlgorithmSection 
            title="Post-Quantum Cryptography (PQC)" 
            description="Mathematically resistant to quantum attacks: Kyber, Dilithium, SPHINCS+, Falcon, NTRU" 
            algorithms={truePQC} 
            type="pqc"
            onViewOccurrences={handleViewOccurrences}
          />
        )}
        {quantumSafe.length > 0 && (
          <AlgorithmSection 
            title="Quantum-Safe (Classical)" 
            description="Classical algorithms with quantum-resistant parameters: AES-256, SHA-512, ChaCha20-256" 
            algorithms={quantumSafe} 
            type="safe"
            onViewOccurrences={handleViewOccurrences}
          />
        )}

        {/* Migration Plan & Quantum Readiness */}
        {(scanDetail?.migration_plan || scanDetail?.quantum_readiness_detail) && (
          <div className="mt-8">
            <RepoSuggestionsPanel
              migrationPlan={scanDetail.migration_plan ?? null}
              quantumReadiness={scanDetail.quantum_readiness_detail ?? null}
              criticalVulnerabilities={scanDetail.critical_vulnerabilities}
            />
          </div>
        )}
        
        {selectedAlgorithm && (
          <AlgorithmFindingsModal
            isOpen={isFindingsModalOpen}
            onClose={handleCloseModal}
            scanId={scanId}
            algorithmName={selectedAlgorithm}
            scanDetail={scanDetail}
          />
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-card border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/40">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                  {scanDetail?.repo_url ? formatRepoName(scanDetail.repo_url) : '...'}
                </h1>
                <div className="text-sm text-slate-600 dark:text-slate-400 font-medium">Post-Quantum Cryptography Security Analysis</div>
              </div>
            </div>
            <UnifiedBackButton onClick={onBack} label="Back" />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-10">
        {renderContent()}
      </main>
    </div>
  );
};

export default ScanResultsDetail;