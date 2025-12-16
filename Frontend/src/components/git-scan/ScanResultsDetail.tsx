import React, { useState, useEffect } from 'react';
import { RefreshCw, Shield, AlertTriangle, Clock, Package, XCircle, CheckCircle, ArrowLeft, Eye, Loader2, FileText, Hash, Zap } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { UnifiedMetricCard, UnifiedBackButton } from "@/components/ui/unified";
import { ScanDetail, Algorithm } from './types';

const API_URL = import.meta.env.VITE_REPO_SCAN_API_URL;

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
  const getBorderColor = () => {
    switch (type) {
      case 'pqc': return 'border-blue-500';
      case 'safe': return 'border-emerald-500';
      case 'unsafe': return 'border-rose-500';
    }
  };

  const getBadgeColor = () => {
    switch (type) {
      case 'pqc': return 'bg-primary/10 dark:bg-primary/30 text-primary';
      case 'safe': return 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
      case 'unsafe': return 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'pqc': return <Shield className="w-5 h-5 text-primary" />;
      case 'safe': return <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case 'unsafe': return <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />;
    }
  };

  return (
    <div className="mb-6">
      <div className={`flex items-center justify-between p-6 ${
        type === 'pqc' 
          ? 'bg-primary/5 dark:bg-primary/40' 
          : type === 'safe' 
          ? 'bg-emerald-50 dark:bg-emerald-950/40'
          : 'bg-rose-50 dark:bg-rose-950/40'
      } border-2 ${getBorderColor()} rounded-2xl shadow-[0_4px_14px_rgba(0,0,0,0.06)] backdrop-blur-sm`}>
        <div>
          <div className="flex items-center gap-4 text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-3">
            {getIcon()}
            <span>{title}</span>
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400 font-medium ml-12 leading-relaxed">
            {description}
          </div>
        </div>
        <span className={`px-4 py-2 rounded-xl text-sm font-bold shadow-lg ${getBadgeColor()} border-2 ${
          type === 'pqc' ? 'border-blue-200 dark:border-blue-900' :
          type === 'safe' ? 'border-emerald-200 dark:border-emerald-900' :
          'border-rose-200 dark:border-rose-900'
        }`}>
          {algorithms.length} Found
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {algorithms.map((algo, idx) => (
          <div key={`${algo.name}-${idx}`} className="bg-card text-card-foreground border rounded-xl p-6 shadow-md hover:shadow-lg hover:scale-[1.01] transition-all duration-300 cursor-pointer">
            {/* Algorithm Name and Grade */}
            <div className="flex items-start justify-between mb-4">
              <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {algo.name}
              </div>
              {algo.grade && (
                <div className={`text-3xl font-bold ${getGradeColor(algo.grade)}`}>
                  {algo.grade}
                </div>
              )}
            </div>
            
            {/* Category and Type */}
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4 font-bold">
              {algo.category}
            </div>
            
            {/* Security Level Badge */}
            {algo.security_level && (
              <div className="mb-4 flex flex-wrap gap-2">
                <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-bold ${
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
                {algo.deprecated && (
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-600">
                    DEPRECATED
                  </span>
                )}
              </div>
            )}
            
            {/* Usage Statistics */}
            <div className="flex gap-6 pt-4 border-t mb-4">
              <div className="bg-muted/30 rounded-lg px-3 py-2 flex-1">
                <span className="text-muted-foreground font-semibold uppercase tracking-wide text-[10px] block mb-1">Occurrences</span>
                <span className="text-slate-900 dark:text-slate-100 font-bold text-lg">{algo.occurrences}</span>
              </div>
              <div className="bg-muted/30 rounded-lg px-3 py-2 flex-1">
                <span className="text-muted-foreground font-semibold uppercase tracking-wide text-[10px] block mb-1">Files</span>
                <span className="text-slate-900 dark:text-slate-100 font-bold text-lg">{algo.files_affected || 0}</span>
              </div>
            </div>
            
            {/* Quantum Safety Section */}
            {algo.quantum_safe !== undefined && (
              <div className="pt-4 border-t mb-4">
                {/* Quantum Safety Status */}
                <div className={`flex items-center gap-2 text-sm font-bold mb-3 ${
                  algo.quantum_safe ? 'text-success' : 'text-destructive'
                }`}>
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                    algo.quantum_safe 
                      ? 'bg-success/10' 
                      : 'bg-destructive/10'
                  }`}>
                    {algo.quantum_safe ? '✅' : '⚠️'}
                  </div>
                  {algo.quantum_safe ? 'Quantum-Safe' : 'Quantum-Vulnerable'}
                </div>
                
                {/* Explanation */}
                {algo.quantum_safety_reason && (
                  <div className="text-xs text-muted-foreground mt-3 leading-relaxed bg-muted/50 p-3 rounded-lg border">
                    {algo.quantum_safety_reason}
                  </div>
                )}
                
                {/* Classification Badge */}
                {algo.quantum_resistance_type && (
                  <div className="mt-3">
                    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-bold ${
                      algo.quantum_resistance_type === 'fully_resistant'
                        ? 'bg-primary/10 text-primary'
                        : algo.quantum_resistance_type === 'grover_resistant'
                        ? 'bg-primary/10 text-primary'
                        : algo.quantum_resistance_type === 'vulnerable'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {algo.quantum_resistance_type.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            )}
            
            {/* View Occurrences Button */}
            <Button 
              variant="default"
              className="w-full"
              onClick={() => onViewOccurrences(algo.name)}
            >
              <Eye className="h-4 w-4 mr-2" />
              View Occurrences
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

import AlgorithmFindingsModal from './AlgorithmFindingsModal';

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

        <div className="bg-card/80 border rounded-2xl p-10 mb-10 shadow-[0_4px_14px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.4)] backdrop-blur-sm">
          <div className="mb-8 pb-6 border-b">
            <h3 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/40 flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              Overall Security Assessment
            </h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-card/60 rounded-2xl p-6 shadow-[0_4px_14px_rgba(0,0,0,0.06)] border backdrop-blur-sm hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] hover:border-blue-500/30 transition-all duration-300 transform hover:-translate-y-1">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">
                Security Score
              </div>
              <div className="flex items-end gap-3 mb-4">
                <div className="text-6xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                  {data.overall_security_score?.toFixed(1) ?? 'N/A'}
                </div>
                <div className={`text-3xl font-bold mb-2 ${getGradeColor(data.overall_grade ?? '')}`}>
                  {data.overall_grade ?? 'N/A'}
                </div>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden shadow-inner">
                <div 
                  className={`h-full transition-all duration-700 ease-out shadow-sm ${getScoreBarColor(data.overall_security_score ?? 0)}`}
                  style={{ 
                    width: `${data.overall_security_score ?? 0}%`,
                    boxShadow: '0 0 10px currentColor'
                  }}
                />
              </div>
            </div>

            <div className="bg-card/60 rounded-2xl p-6 shadow-[0_4px_14px_rgba(0,0,0,0.06)] border backdrop-blur-sm hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] hover:border-blue-500/30 transition-all duration-300 transform hover:-translate-y-1">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">
                Quantum Readiness
              </div>
              <div className="flex items-end gap-2 mb-4">
                <div className="text-6xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                  {data.quantum_readiness_percentage?.toFixed(1) ?? '0.0'}
                </div>
                <div className="text-3xl font-bold text-slate-500 dark:text-slate-400 mb-2">%</div>
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Percentage of cryptographic <span className="font-semibold text-slate-900 dark:text-slate-100">operations</span> (by occurrence count) 
                using quantum-safe algorithms with adequate key sizes
                <div className="text-xs mt-2 text-slate-500 dark:text-slate-500 font-medium">
                  Based on weighted usage, not algorithm count
                </div>
              </div>
            </div>

            <div className="bg-card/60 rounded-2xl p-6 shadow-[0_4px_14px_rgba(0,0,0,0.06)] border backdrop-blur-sm hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] hover:border-blue-500/30 transition-all duration-300 transform hover:-translate-y-1">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">
                Risk Level
              </div>
              <div className={`text-3xl font-bold tracking-tight mb-4 ${getRiskLevelInfo(data.overall_security_score ?? 0).color}`}>
                {getRiskLevelInfo(data.overall_security_score ?? 0).label}
              </div>
              <div className={`inline-flex items-center px-3 py-2 rounded-lg text-xs font-semibold border ${
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
          <div className="bg-card/80 border rounded-2xl p-10 mb-10 shadow-[0_4px_14px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.4)] backdrop-blur-sm">
            <div className="mb-8 pb-6 border-b">
              <h3 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/40 flex items-center justify-center">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                Security by Algorithm Category
              </h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {Object.entries(data.category_scores).map(([category, score]) => (
                <div key={category} className="bg-card/70 rounded-xl p-6 border shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)] transition-all duration-300 transform hover:-translate-y-1 backdrop-blur-sm group">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                      {getCategoryDisplayName(category)}
                    </div>
                    <div className={`text-2xl font-bold ${getGradeColor(score.grade)} group-hover:scale-110 transition-transform`}>
                      {score.grade}
                    </div>
                  </div>
                  
                  <div className={`text-5xl font-bold tracking-tight mb-4 ${getGradeColor(score.grade)}`}>
                    {score.grade}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2 font-medium">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-500">Algorithms</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{score.algorithm_count}</span>
                    </div>
                    <div title={score.best_algorithm}>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Best:</span>
                      <span className="ml-1 truncate">{score.best_algorithm}</span>
                    </div>
                    <div title={score.worst_algorithm}>
                      <span className="text-rose-600 dark:text-rose-400 font-semibold">Worst:</span>
                      <span className="ml-1 truncate">{score.worst_algorithm}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-10">
          <UnifiedMetricCard
            label="Files Scanned"
            value={data.total_files || 0}
            icon={<FileText size={18} />}
            iconColor="muted"
          />
          <UnifiedMetricCard
            label="Total Algorithms"
            value={Object.keys(algorithms).length}
            icon={<Hash size={18} />}
            iconColor="muted"
          />
          <UnifiedMetricCard
            label="True PQC"
            value={truePQCCount}
            description="Kyber, Dilithium, SPHINCS+"
            icon={<Zap size={18} />}
            iconColor="primary"
          />
          <UnifiedMetricCard
            label="Quantum-Safe"
            value={quantumSafeCount}
            description="AES-256, SHA-512, etc."
            icon={<Shield size={18} />}
            iconColor="success"
          />
          <UnifiedMetricCard
            label="Vulnerable"
            value={quantumVulnerableCount}
            description="RSA, ECDSA, weak sizes"
            icon={<AlertTriangle size={18} />}
            iconColor="destructive"
          />
        </div>

        {quantumVulnerable.length > 0 && (
          <AlgorithmSection 
            title="⚠️ Quantum-Vulnerable Algorithms" 
            description="Will be broken by quantum computers: RSA, ECDSA, DH, or weak parameters (AES-128, SHA-256)" 
            algorithms={quantumVulnerable} 
            type="unsafe"
            onViewOccurrences={handleViewOccurrences}
          />
        )}
        {truePQC.length > 0 && (
          <AlgorithmSection 
            title="🔮 Post-Quantum Cryptography (PQC)" 
            description="Mathematically resistant to quantum attacks: Kyber, Dilithium, SPHINCS+, Falcon, NTRU" 
            algorithms={truePQC} 
            type="pqc"
            onViewOccurrences={handleViewOccurrences}
          />
        )}
        {quantumSafe.length > 0 && (
          <AlgorithmSection 
            title="✅ Quantum-Safe (Classical)" 
            description="Classical algorithms with quantum-resistant parameters: AES-256, SHA-512, ChaCha20-256" 
            algorithms={quantumSafe} 
            type="safe"
            onViewOccurrences={handleViewOccurrences}
          />
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
                  Scan Results for {scanDetail?.repo_url || '...'}
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