import React, { useMemo, useState } from 'react';
import {
  ChevronDown, ChevronUp, ExternalLink, X, FileText, Shield,
  Award, Target, Lock, CheckCircle, AlertTriangle,
  ArrowLeft, Search, Activity, AlertCircle, Cpu, Database, Server, Eye
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ============================================================================
// STYLING CONSTANTS
// ============================================================================

const premiumColors = {
  // Deep gradients
  primaryGradient: 'from-[#1A4FFF] via-[#4D8DFF] to-[#5FB6FF]',
  successGradient: 'from-emerald-500 via-green-500 to-teal-400',
  warningGradient: 'from-amber-500 via-orange-500 to-red-400',
  criticalGradient: 'from-red-600 via-rose-600 to-pink-600',

  // Glows
  primaryGlow: 'shadow-[0_0_40px_rgba(26,79,255,0.3)]',
  successGlow: 'shadow-[0_0_30px_rgba(16,185,129,0.25)]',
  criticalGlow: 'shadow-[0_0_30px_rgba(239,68,68,0.3)]',
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Agent {
  agent_id: string;
  hostname: string;
  ip_address: string;
  os_info: string;
  registered_at?: string;
  last_seen?: string;
  status?: string;
  minutes_since_last_seen?: number;
}

interface AuditResult {
  result_id: string;
  agent_id: string;
  task_id: string;
  audit_results: any;
  received_at: string;
  submitted_at: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { UnifiedResultCard, UnifiedMetricCard, UnifiedBackButton } from "@/components/ui/unified";
import { PQCExpandedResultModal } from './PQCExpandedResultModal';

// ... (other imports)

const getGradeColor = (grade: string) => {
  if (!grade) return 'text-muted-foreground';
  const g = grade.toUpperCase();
  if (g.startsWith('A')) return 'text-success';
  if (g.startsWith('B')) return 'text-primary';
  if (g.startsWith('C')) return 'text-warning';
  if (g.startsWith('D')) return 'text-orange-500';
  return 'text-destructive';
};

const getScoreColor = (score: number) => {
  if (score >= 90) return 'text-success';
  if (score >= 75) return 'text-primary';
  if (score >= 60) return 'text-warning';
  if (score >= 50) return 'text-orange-500';
  return 'text-destructive';
};

const getScoreBgColor = (score: number) => {
  if (score >= 90) return 'bg-success';
  if (score >= 75) return 'bg-primary';
  if (score >= 60) return 'bg-warning';
  if (score >= 50) return 'bg-orange-500';
  return 'bg-destructive';
};

const getGradeBgColor = (grade: string) => {
  if (!grade) return 'from-destructive to-rose-700';
  const g = grade.toUpperCase();
  if (g.startsWith('A')) return 'from-success to-emerald-600';
  if (g.startsWith('B')) return 'from-primary to-cyan-600';
  if (g.startsWith('C')) return 'from-warning to-orange-500';
  if (g.startsWith('D')) return 'from-orange-500 to-red-500';
  return 'from-destructive to-rose-700';
};
const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
};

// ============================================================================
// PQC RESULT CARD COMPONENT
// ============================================================================

export const PQCResultCard: React.FC<{
  result: AuditResult;
  index: number;
  onViewDetails: (result: AuditResult) => void;
}> = ({ result, onViewDetails }) => {
  const pqcScore = result.audit_results?.pqc_score || {};
  const overallScore = pqcScore.overall_score || 0;
  const overallGrade = pqcScore.overall_grade || 'N/A';
  const hasScoring = pqcScore.overall_score !== undefined;

  const totalScans = Object.entries(pqcScore.components || {}).reduce(
    (sum, [, comp]: [string, any]) => sum + (comp.algorithms?.length || 0), 
    0
  );
  const quantumSafeCount = Object.entries(pqcScore.components || {}).reduce(
    (sum, [, comp]: [string, any]) => sum + (comp.quantum_safe_count || 0), 
    0
  );
  const successRate = totalScans > 0 ? ((quantumSafeCount / totalScans) * 100).toFixed(0) : 0;
  
  const securityLevel = pqcScore.security_level;

  const securityLevelBadge = securityLevel ? (
    <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold ${
      securityLevel === 'high'
        ? 'bg-success/10 text-success'
        : securityLevel === 'medium'
          ? 'bg-primary/10 text-primary'
          : 'bg-destructive/10 text-destructive'
    }`}>
      {securityLevel.toUpperCase()} SECURITY
    </span>
  ) : null;

  return (
    <UnifiedResultCard
      title="Audit Scan"
      description={result.task_id}
      status={hasScoring ? "success" : "error"}
      statusLabel={hasScoring ? "Completed" : "Failed"}
      icon={<FileText size={20} />}
      metrics={hasScoring ? [
        { label: "Total Scans", value: totalScans },
        { label: "Overall Score", value: overallScore.toFixed(1) },
        { label: "Grade", value: overallGrade }
      ] : undefined}
      onClick={() => onViewDetails(result)}
    >
      {!hasScoring && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm font-semibold">PQC scoring not available</p>
          </div>
        </div>
      )}
      {hasScoring && securityLevelBadge}
    </UnifiedResultCard>
  );
};

// ============================================================================
// AGENT RESULTS PAGE - MAIN DASHBOARD COMPONENT
// ============================================================================

export const AgentResultsPage: React.FC<{
  agent: Agent;
  results: AuditResult[];
  onBack: () => void;
}> = ({ agent, results, onBack }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedResult, setSelectedResult] = useState<AuditResult | null>(null);

  const filteredResults = useMemo(() => {
    if (!searchQuery) return results;
    return results.filter(r =>
      r.task_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      new Date(r.submitted_at).toLocaleString().toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [results, searchQuery]);

  const stats = useMemo(() => {
    const successful = results.filter(r => r.audit_results).length;
    return {
      total: results.length,
      successful,
      failed: results.length - successful,
      successRate: results.length > 0 ? ((successful / results.length) * 100).toFixed(0) : '0',
    };
  }, [results]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border shadow-[var(--shadow-card)]">
        <div className="max-w-7xl mx-auto px-8 py-12">
          <UnifiedBackButton onClick={onBack} label="Back" className="mb-4" />

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
                {agent.hostname}
              </h1>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="font-mono">{agent.ip_address}</span>
                </div>
                <span>•</span>
                <span>{agent.os_info}</span>
                <span>•</span>
                <span className="font-mono text-xs">ID: {agent.agent_id.substring(0, 16)}...</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-12">
        {/* Stats Cards - PHASE 3 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-8 mb-8">
          <UnifiedMetricCard
            label="Total Scans"
            value={stats.total}
            description="All scan attempts"
            icon={<Activity size={18} />}
            iconColor="primary"
          />
          <UnifiedMetricCard
            label="Successful"
            value={stats.successful}
            description="Completed successfully"
            icon={<CheckCircle size={18} />}
            iconColor="success"
          />
          <UnifiedMetricCard
            label="Failed"
            value={stats.failed}
            description="Completed with errors"
            icon={<AlertCircle size={18} />}
            iconColor="destructive"
          />
        </div>

        {/* Search Bar - PHASE 14 */}
        <div className="bg-card text-card-foreground rounded-lg p-4 sm:p-6 border shadow-sm mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                size={20}
              />
              <input
                type="text"
                placeholder="Search by task ID or date..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 h-14 rounded-lg border bg-muted text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <X size={20} />
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Showing {filteredResults.length} of {results.length} results
          </p>
        </div>

        {/* Results Grid */}
        {filteredResults.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {filteredResults.map((result, index) => (
              <PQCResultCard
                key={result.result_id}
                result={result}
                index={index}
                onViewDetails={() => setSelectedResult(result)}
              />
            ))}
          </div> // This closes the grid div
        ) : ( // This is the "else" part of the ternary
          <div>
            <Card className="
    shadow-md
    border border-slate-200 dark:border-slate-700
  ">
              <CardContent className="flex flex-col items-center justify-center py-24">
                <div className="w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-6"><Search className="w-12 h-12 text-slate-400" /></div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
                  {searchQuery ? 'No results found' : 'No scan results available'}
                </p>
                <p className="text-base text-slate-500 dark:text-slate-400">
                  {searchQuery ? 'Try adjusting your search query' : 'Run a scan to see results here'}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Detailed Results Modal */}
      {selectedResult && <PQCExpandedResultModal result={selectedResult} onClose={() => setSelectedResult(null)} />}
    </div>
  );
};

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default AgentResultsPage;