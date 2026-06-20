import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RefreshCw, Shield, AlertTriangle, Clock, Package, XCircle, CheckCircle, ArrowLeft, Eye, Loader2, Trash2, RotateCcw, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UnifiedCard, UnifiedBadge, UnifiedBackButton, UnifiedRefreshButton, UnifiedInlineRefresh, UnifiedActionLoading, UnifiedResultCard } from '@/components/ui/unified';
import { typography } from '@/lib/design-tokens';
import { Scan, StatusType } from './types';
import ScanResultsDetail from './ScanResultsDetail';

// Helper to fetch onboarding org/suborg/app/repo hierarchy — fully parallel with Promise.all
const fetchOnboardingRepos = async () => {
  const DB_API_BASE = (import.meta.env.VITE_DB_API_URL as string | undefined) || 'http://localhost:8001';
  const base = DB_API_BASE.replace(/\/$/, '');

  const orgsRes = await fetch(`${base}/organizations`);
  if (!orgsRes.ok) return [];
  const orgs = await orgsRes.json();

  return Promise.all(orgs.map(async (org: any) => {
    // Fetch org repos + suborgs in parallel
    const [orgReposRes, suborgsRes] = await Promise.all([
      fetch(`${base}/organizations/${org.id}/repositories`),
      fetch(`${base}/organizations/${org.id}/suborganizations`),
    ]);
    const [orgRepos, suborgs] = await Promise.all([
      orgReposRes.ok ? orgReposRes.json() : Promise.resolve([]),
      suborgsRes.ok ? suborgsRes.json() : Promise.resolve([]),
    ]);

    // Fetch all suborg repos + apps in parallel
    const suborgList = await Promise.all((suborgs as any[]).map(async (suborg: any) => {
      const [subReposRes, appsRes] = await Promise.all([
        fetch(`${base}/suborganizations/${suborg.id}/repositories`),
        fetch(`${base}/suborganizations/${suborg.id}/applications`),
      ]);
      const [suborgRepos, apps] = await Promise.all([
        subReposRes.ok ? subReposRes.json() : Promise.resolve([]),
        appsRes.ok ? appsRes.json() : Promise.resolve([]),
      ]);

      // Fetch all app repos in parallel
      const appList = await Promise.all((apps as any[]).map(async (app: any) => {
        const appReposRes = await fetch(`${base}/applications/${app.id}/repositories`);
        const appRepos = appReposRes.ok ? await appReposRes.json() : [];
        return { ...app, repositories: appRepos };
      }));

      return { ...suborg, repositories: suborgRepos, applications: appList };
    }));

    return { ...org, repositories: orgRepos, suborgs: suborgList };
  }));
};

// ─── ScanRow — defined OUTSIDE CryptoScanner so React.memo works correctly ───
interface ScanRowProps {
  scan: Scan;
  onView: (id: number) => void;
  onRetry: (scan: Scan) => void;
  onDelete: (id: number) => void;
  retryingId: number | null;
  deletingId: number | null;
}

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];
const DEFAULT_PAGE_SIZE = 10;

const ScanRow = React.memo<ScanRowProps>(({ scan, onView, onRetry, onDelete, retryingId, deletingId }) => {
  const canView = scan.scan_status === 'completed' || scan.scan_status === 'cached';
  const fileCountDisplay =
    scan.scan_status === 'in_progress' && scan.total_files_to_scan > 0
      ? `${scan.total_files || 0} / ${scan.total_files_to_scan}`
      : scan.total_files || '-';

  const getStatusBadge = () => {
    switch (scan.scan_status) {
      case 'pending': return 'warning';
      case 'in_progress': return 'info';
      case 'completed': return 'success';
      case 'failed': return 'error';
      case 'cached': return 'success';
      default: return 'neutral';
    }
  };

  const getStatusLabel = () => {
    switch (scan.scan_status) {
      case 'pending': return 'Queued';
      case 'in_progress': return 'In Progress';
      case 'completed': return 'Completed';
      case 'failed': return 'Failed';
      case 'cached': return 'Cached';
      default: return scan.scan_status || 'Unknown';
    }
  };

  const getStatusIcon = () => {
    switch (scan.scan_status) {
      case 'pending': return <Clock className="h-5 w-5" />;
      case 'in_progress': return <RefreshCw className="h-5 w-5 animate-spin" />;
      case 'completed':
      case 'cached': return <CheckCircle className="h-5 w-5" />;
      case 'failed': return <XCircle className="h-5 w-5" />;
      default: return <Shield className="h-5 w-5" />;
    }
  };

  const quantumReadinessDisplay = scan.quantum_readiness_percentage !== undefined && scan.quantum_readiness_percentage !== null
    ? `${Math.round(scan.quantum_readiness_percentage)}%`
    : 'N/A';
  const riskLevelDisplay = scan.overall_grade ?? 'N/A';
  const securityScoreDisplay = scan.overall_security_score !== undefined && scan.overall_security_score !== null
    ? `${Math.round(scan.overall_security_score)}/100`
    : 'N/A';

  return (
    <UnifiedResultCard
      key={scan.id}
      title={formatRepoName(scan.repo_url)}
      description={`${scan.platform || 'Unknown'} • Branch: ${scan.branch_name || 'main'} • ${fileCountDisplay} files`}
      status={getStatusBadge()}
      statusLabel={getStatusLabel()}
      icon={getStatusIcon()}
      metrics={[
        { label: "Quantum Readiness", value: quantumReadinessDisplay, valueClassName: "text-primary" },
        { label: "Risk Level", value: riskLevelDisplay, valueClassName: "text-warning" },
        { label: "Security Score", value: securityScoreDisplay, valueClassName: "text-success" }
      ]}
      actions={[
        ...(canView ? [{
          label: "View Results",
          icon: <Eye className="w-4 h-4 mr-2" />,
          onClick: () => onView(scan.id),
          variant: "outline" as const
        }] : []),
        ...((scan.scan_status === 'failed' || scan.scan_status === 'in_progress' || scan.scan_status === 'pending') ? [{
          label: retryingId === scan.id ? "Retrying..." : "Retry",
          icon: retryingId === scan.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />,
          onClick: () => onRetry(scan),
          variant: "outline" as const,
          disabled: retryingId === scan.id
        }] : []),
        {
          label: "Delete",
          icon: deletingId === scan.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />,
          onClick: () => onDelete(scan.id),
          variant: "destructive" as const,
          disabled: deletingId === scan.id
        }
      ]}
    >
      {scan.scan_status === 'failed' && scan.error_detail ? (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2 mb-2">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{scan.error_detail}</span>
        </div>
      ) : scan.current_status ? (
        <div className="text-sm text-muted-foreground mb-2">{scan.current_status}</div>
      ) : null}
    </UnifiedResultCard>
  );
});
ScanRow.displayName = 'ScanRow';

interface CryptoScannerProps {
  onBack: () => void;
  autoLoadRepo?: string;
}

const API_URL = import.meta.env.VITE_REPO_SCAN_API_URL

const formatRepoName = (url: string) => {
  try {
    return url
      .replace(/^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\//, '')
      .replace(/\.git$/, '');
  } catch {
    return url;
  }
};


const CryptoScanner: React.FC<CryptoScannerProps> = ({ onBack, autoLoadRepo }) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [branchName, setBranchName] = useState('main');
  const [detectedPlatform, setDetectedPlatform] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [scans, setScans] = useState<Scan[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState<'destructive' | 'success' | 'warning' | 'default'>('default');
  const [showStatus, setShowStatus] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [currentView, setCurrentView] = useState<'list' | 'detail'>('list');
  const [selectedScanId, setSelectedScanId] = useState<number | null>(null);
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [isFetchingBranches, setIsFetchingBranches] = useState(false);
  const [branchFetchError, setBranchFetchError] = useState('');
  const [showManualBranchInput, setShowManualBranchInput] = useState(false);
  const [onboardingRepos, setOnboardingRepos] = useState<any[]>([]);
  const [onboardingReposLoading, setOnboardingReposLoading] = useState(false);
  const [isAutoScanFromOnboarding, setIsAutoScanFromOnboarding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'scan' | 'history' | 'onboarded'>('scan');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [historySearch, setHistorySearch] = useState('');
  const [jumpPage, setJumpPage] = useState('');
  // Ref to detect unchanged polls and skip re-renders
  const scansSignatureRef = useRef('');

  // ── defined BEFORE the useEffects that call it to avoid TDZ error ──
  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/scans?limit=200`);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data: Scan[] = await response.json();
      // Smart diff — skip setScans if data hasn't changed (no unnecessary re-renders)
      const newSig = data.map(s => `${s.id}:${s.scan_status}:${s.total_files ?? 0}`).join('|');
      if (newSig !== scansSignatureRef.current) {
        scansSignatureRef.current = newSig;
        setScans(data);
        setCurrentPage(1);
        setHistorySearch('');
      }
      setIsLoading(false);
    } catch (error) {
      showStatusMessage('Failed to fetch scan history', 'error');
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Auto-load or auto-trigger repo scan when navigated from Scan Center
  const autoLoadHandledRef = React.useRef(false);
  useEffect(() => {
    if (!autoLoadRepo || autoLoadHandledRef.current) return;

    // Case 1: history already loaded — try to find a matching completed scan
    if (scans.length > 0) {
      autoLoadHandledRef.current = true;
      const repoLower = autoLoadRepo.toLowerCase();
      const matchingScan = scans.find(scan =>
        scan.repo_url?.toLowerCase().includes(repoLower) ||
        scan.repo_name?.toLowerCase().includes(repoLower)
      );
      if (matchingScan && matchingScan.scan_status === 'completed') {
        handleViewResults(matchingScan.id);
        return;
      }
      // No existing completed scan — trigger a fresh scan
      handleOnboardingRepoScan(autoLoadRepo, 'main');
      return;
    }

    // Case 2: history not yet loaded (isLoading still true) — wait, will re-run when scans loads
    // But if loading is done and scans is empty, trigger immediately
    if (!isLoading) {
      autoLoadHandledRef.current = true;
      handleOnboardingRepoScan(autoLoadRepo, 'main');
    }
  }, [autoLoadRepo, scans, isLoading]);

  useEffect(() => {
    setOnboardingReposLoading(true);
    fetchOnboardingRepos()
      .then(setOnboardingRepos)
      .finally(() => setOnboardingReposLoading(false));
  }, []);

  const showStatusMessage = (message: string | any, type: 'info' | 'success' | 'error' = 'info') => {
    // Ensure message is always a string
    const msgStr = typeof message === 'string' ? message : (typeof message === 'object' ? JSON.stringify(message) : String(message));
    setStatusMessage(msgStr);
    let variant: 'destructive' | 'success' | 'warning' | 'default' = 'default';
    if (type === 'error') variant = 'destructive';
    if (type === 'success') variant = 'success';
    if (type === 'info') variant = 'warning';
    setStatusType(variant);
    setShowStatus(true);
    setTimeout(() => setShowStatus(false), 5000);
  };

  const deleteScan = useCallback(async (scanId: number) => {
    if (!window.confirm('Are you sure you want to delete this scan and all its results? This action cannot be undone.')) {
      return;
    }

    setDeletingId(scanId);
    try {
      const response = await fetch(`${API_URL}/api/scans/${scanId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete scan');
      }

      showStatusMessage('✓ Scan deleted successfully', 'success');
      await loadHistory();
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : 'Failed to delete scan';
      showStatusMessage(errMsg, 'error');
    } finally {
      setDeletingId(null);
    }
  }, [loadHistory]);

  const retryScan = useCallback(async (scan: Scan) => {
    setRetryingId(scan.id);
    try {
      // DELETE the old failed scan FIRST before creating new one
      console.log(`🗑️ Deleting old scan with ID: ${scan.id}`);
      const deleteResponse = await fetch(`${API_URL}/api/scans/${scan.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      const deleteData = await deleteResponse.json();
      
      if (deleteResponse.ok) {
        showStatusMessage('✓ Old failed scan removed', 'success');
      } else {
        console.warn('Could not delete old scan, proceeding with retry anyway');
      }

      // Now create a new scan request
      const response = await fetch(`${API_URL}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          repo_url: scan.repo_url, 
          branch_name: scan.branch_name 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Retry scan failed');
      }

      showStatusMessage('✓ Retry scan initiated successfully!', 'success');
      setAutoRefresh(true); // Start auto-refresh
      await loadHistory();
      
      // Stop auto-refresh after 5 minutes
      setTimeout(() => setAutoRefresh(false), 300000);
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : 'Failed to retry scan';
      showStatusMessage(errMsg, 'error');
    } finally {
      setRetryingId(null);
    }
  }, [loadHistory]);

  useEffect(() => {
    if (!autoRefresh) return;
    // Only keep polling while at least one scan is actively in-progress or pending
    const hasActive = scans.some(s => s.scan_status === 'in_progress' || s.scan_status === 'pending');
    if (!hasActive) {
      setAutoRefresh(false);
      return;
    }
    const interval = setInterval(() => {
      loadHistory();
    }, 8000); // 8 s is sufficient; aggressive 4 s polling caused unnecessary re-renders
    return () => clearInterval(interval);
  }, [autoRefresh, scans, loadHistory]);

  const fetchBranches = async (url: string) => {
    if (!url.trim()) {
      return;
    }
  
    setIsFetchingBranches(true);
    setBranchFetchError('');
    
    try {
      const response = await fetch(`${API_URL}/api/fetch-branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: url }),
      });
  
      const data = await response.json();
  
      if (response.ok) {
        setAvailableBranches(data.branches);
        const selectedBranch = data.default_branch;
        setBranchName(selectedBranch); // Auto-select default branch
        setShowManualBranchInput(false);
        showStatusMessage(`Found ${data.total_count} branches`, 'success');
        
        // 🚀 If this is from onboarding, auto-trigger scan after branches are fetched
        if (isAutoScanFromOnboarding && url.trim() && selectedBranch.trim()) {
          setTimeout(() => {
            // Trigger the scan with the fetched branch
            performScanWithRepo(url, selectedBranch);
          }, 500);
        }
      } else {
        // If branch fetch fails, allow manual entry
        const errorMsg = typeof data === 'object' ? (data.detail || data.message || JSON.stringify(data)) : String(data);
        setBranchFetchError(errorMsg || 'Could not fetch branches');
        setShowManualBranchInput(true);
        setAvailableBranches([]);
        showStatusMessage(
          'Could not fetch branches automatically. Please enter branch name manually.', 
          'info'
        );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Network error while fetching branches';
      setBranchFetchError(errorMsg);
      setShowManualBranchInput(true);
      setAvailableBranches([]);
    } finally {
      setIsFetchingBranches(false);
    }
  };

  const validateUrl = async (url: string) => {
    if (!url.trim()) {
      setDetectedPlatform('');
      return;

    }
  
    setIsValidating(true);
    try {
      const response = await fetch(`${API_URL}/api/validate-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: url }),
      });
  
      const data = await response.json();
  
      if (response.ok) {
        setDetectedPlatform(data.platform);
        setRepoUrl(data.normalized_url); // Use normalized URL
        
        // ✅ NEW: Automatically fetch branches after URL is validated
        await fetchBranches(data.normalized_url);
      } else {
        setDetectedPlatform('');
        setAvailableBranches([]);
        const errorMsg = typeof data === 'object' ? (data.detail || data.message || 'Invalid URL') : String(data);
        showStatusMessage(errorMsg, 'error');
      }
    } catch (error) {
      setDetectedPlatform('');
      setAvailableBranches([]);
      const errorMsg = error instanceof Error ? error.message : 'Network error';
      showStatusMessage(errorMsg, 'error');

    } finally {
      setIsValidating(false);
    }
  };

  // Debounce URL validation
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only validate if the user has entered something
      const urlToValidate = repoUrl.trim();
      if (urlToValidate) {
        validateUrl(repoUrl);
      }
    }, 800); // Wait 800ms after user stops typing
  
    return () => clearTimeout(timer);
  }, [repoUrl]);

  const scanRepository = async () => {
    if (!repoUrl.trim()) {
      showStatusMessage('Please enter a repository URL', 'error');
      return;
    }

    if (!branchName.trim()) {
      showStatusMessage('Please enter a branch name', 'error');
      return;
    }

    setIsScanning(true);
    try {
      const response = await fetch(`${API_URL}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: repoUrl, branch_name: branchName }),
      });

      const data = await response.json();
  
      if (!response.ok) {
        throw new Error(data.detail?.message || data.detail || 'Scan failed');
      }

      // Backend now returns a failed record (HTTP 200) instead of throwing 4xx
      if (data.scan_status === 'failed') {
        showStatusMessage(`Scan failed: ${data.error_detail || data.current_status || 'Unknown error'}`, 'error');
        await loadHistory();
        return;
      }
  
      if (data.cached) {
        showStatusMessage('✓ Using cached scan results', 'success');
      } else {
        showStatusMessage('✓ Scan queued successfully! Auto-refreshing...', 'success');
        setAutoRefresh(true); // Start auto-refresh
        
        // Stop auto-refresh after 5 minutes
        setTimeout(() => setAutoRefresh(false), 300000);
      }
  
      await loadHistory();

      // Force another refresh after 2 seconds to catch quick completions
      setTimeout(() => {
        loadHistory();
      }, 2000);
    } catch (error: any) {
      if (error.name === 'TimeoutError') {
        showStatusMessage('Request timeout - Please check if the backend is running', 'error');
      } else if (error.message.includes('Failed to fetch')) {
        showStatusMessage('Cannot connect to backend server. Ensure backend is running.', 'error');
      } else {
        showStatusMessage(error.message, 'error');
      }
    } finally {
      setTimeout(() => setIsScanning(false), 2000);
    }
  };

  const refreshHistory = useCallback(async () => {
    setIsRefreshing(true);
    await loadHistory();
    setTimeout(() => setIsRefreshing(false), 500);
  }, [loadHistory]);

  const deleteAllScans = useCallback(async () => {
    if (!window.confirm('Delete ALL scan history? This removes every repository scan record.')) return;
    setDeletingAll(true);
    try {
      const response = await fetch(`${API_URL}/api/scans`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to delete all scans');
      }
      showStatusMessage('All scan history deleted', 'success');
      scansSignatureRef.current = '';
      setScans([]);
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : 'Failed to delete all scans';
      showStatusMessage(errMsg, 'error');
    } finally {
      setDeletingAll(false);
    }
  }, []);

  const handleOnboardingRepoScan = useCallback((url: string, branch?: string) => {
    if (!url) return;
    setRepoUrl(url);
    setBranchName(branch || 'main');
    setCurrentView('list');
    setIsAutoScanFromOnboarding(true);
    void validateUrl(url);
  }, []);

  const performScanWithRepo = async (url: string, branch: string) => {
    if (!url.trim() || !branch.trim()) {
      showStatusMessage('Please ensure URL and branch are available', 'error');
      setIsAutoScanFromOnboarding(false);
      return;
    }

    setIsScanning(true);
    setIsAutoScanFromOnboarding(false); // Reset flag
    try {
      const response = await fetch(`${API_URL}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: url, branch_name: branch }),
      });

      const data = await response.json();

      if (data.scan_status === 'cached') {
        showStatusMessage('✓ Using cached scan results', 'success');
        await loadHistory();
      } else if (data.scan_status === 'queued' || data.scan_status === 'pending') {
        showStatusMessage('✓ Scan queued successfully! Auto-refreshing...', 'success');
        setAutoRefresh(true);
      } else {
        showStatusMessage('Scan submitted', 'success');
      }
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        showStatusMessage('Cannot connect to backend server. Ensure backend is running.', 'error');
      } else {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        showStatusMessage(errMsg, 'error');
      }
    } finally {
      setTimeout(() => setIsScanning(false), 2000);
    }
  };

  const handleViewResults = useCallback((scanId: number) => {
    setSelectedScanId(scanId);
    setCurrentView('detail');
  }, []);

  // Pagination + search helpers
  const filteredScans = useMemo(() => {
    if (!historySearch.trim()) return scans;
    const q = historySearch.toLowerCase();
    return scans.filter(s =>
      s.repo_url?.toLowerCase().includes(q) ||
      s.branch_name?.toLowerCase().includes(q) ||
      s.scan_status?.toLowerCase().includes(q) ||
      s.overall_grade?.toLowerCase().includes(q)
    );
  }, [scans, historySearch]);

  const totalPages = Math.max(1, Math.ceil(filteredScans.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedScans = useMemo(
    () => filteredScans.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredScans, safePage, pageSize]
  );

  // Page number buttons with ellipsis (e.g. 1 … 4 5 6 … 12)
  const pageButtons = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (safePage > 3) pages.push('...');
    for (let p = Math.max(2, safePage - 1); p <= Math.min(totalPages - 1, safePage + 1); p++) pages.push(p);
    if (safePage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  }, [totalPages, safePage]);

  const handlePageSizeChange = (val: string) => {
    setPageSize(Number(val));
    setCurrentPage(1);
  };
  const handleJumpPage = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const n = parseInt(jumpPage);
      if (!isNaN(n)) setCurrentPage(Math.max(1, Math.min(totalPages, n)));
      setJumpPage('');
    }
  };

  if (currentView === 'detail' && selectedScanId) {
    return (
      <ScanResultsDetail 
        scanId={selectedScanId}
        onBack={() => setCurrentView('list')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-card border-b">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 dark:bg-primary/30 rounded-lg">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Crypto Scanner</h1>
                <p className="text-muted-foreground">Post-Quantum Cryptography Security Analysis</p>
              </div>
            </div>
            <UnifiedBackButton onClick={onBack} label="Back" />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {showStatus && (
          <Alert variant={statusType} className="fixed top-20 right-6 z-50 max-w-md">
            {statusType === 'destructive' ? <XCircle className="h-4 w-4" /> : statusType === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <AlertTitle>
              {statusType === 'destructive' ? 'Error' : statusType === 'success' ? 'Success' : 'Info'}
            </AlertTitle>
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        )}

        {/* Tab Navigation */}
        <div className="flex mb-6 border-b">
          <button
            onClick={() => setActiveTab('scan')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'scan'
                ? 'border-primary text-primary'
                : 'border-transparent hover:text-primary'
            }`}
          >
            New Scan
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-primary text-primary'
                : 'border-transparent hover:text-primary'
            }`}
          >
            Scan History ({scans.length})
          </button>
          <button
            onClick={() => setActiveTab('onboarded')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'onboarded'
                ? 'border-primary text-primary'
                : 'border-transparent hover:text-primary'
            }`}
          >
            Onboarded Repositories
          </button>
        </div>

        {activeTab === 'scan' && (
        <UnifiedCard variant="premium" padding="spacious" className="mb-12">
          <div className="mb-6 pb-5 border-b">
            <h2 className={typography.h2}>Repository Scan</h2>
            <p className="text-sm text-muted-foreground font-medium leading-relaxed">
              Analyze GitHub repositories for cryptographic algorithm usage and PQC readiness
            </p>
          </div>

          <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5 uppercase tracking-wider" htmlFor="repoUrl">
                Repository URL
              </label>
              
              <div className="mb-4">
              <div className="relative">
                  <Input
                    type="text"
                    id="repoUrl"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/username/repository"
                    className="pl-11"
                  />
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                </div>
                
                <UnifiedInlineRefresh
  isRefreshing={isValidating}
  label="Validating URL..."
  size="sm"
  className="mt-3"
/>
                
                {detectedPlatform && !isValidating && (
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 dark:bg-primary/30 text-primary text-sm font-medium shadow-sm">
                    <CheckCircle className="w-4 h-4" />
                    <span>Detected: {detectedPlatform}</span>
                  </div>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5 uppercase tracking-wider" htmlFor="branchName">
                  Branch Name
                </label>
                
                {isFetchingBranches ? (
                  <div className="w-full h-10 px-4 py-2 border rounded-md bg-muted/50">
                    <UnifiedInlineRefresh
                      isRefreshing={true}
                      label="Fetching branches..."
                      size="md"
                    />
                  </div>
                ) : availableBranches.length > 0 && !showManualBranchInput ? (
                  <>
                    <Select value={branchName} onValueChange={setBranchName}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableBranches.map((branch) => (
                          <SelectItem key={branch} value={branch}>
                            {branch}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {availableBranches.length} branches available
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowManualBranchInput(true)}
                        className="text-xs text-primary hover:underline"
                      >
                        Enter manually instead
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <Input
                      type="text"
                      id="branchName"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      placeholder="main"
                    />
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      {typeof branchFetchError === 'string' ? branchFetchError : (branchFetchError ? String(branchFetchError) : 'Enter branch name (default: main)')}
                    </p>
                    {availableBranches.length === 0 && detectedPlatform && !isFetchingBranches && (
                      <button
                        type="button"
                        onClick={() => fetchBranches(repoUrl)}
                        className="mt-2 text-xs text-primary hover:underline"
                      >
                        Retry fetching branches
                      </button>
                    )}
                  </>
                )}
              </div>

              <Button
                onClick={scanRepository}
                disabled={isScanning || !repoUrl.trim() || !branchName.trim()}
                size="lg"
                className="w-full"
              >
                <UnifiedActionLoading
                  isLoading={isScanning}
                  loadingText="Submitting Scan..."
                  defaultText="Scan Repository"
                  icon={<Shield className="w-5 h-5 mr-2" />}
                />
              </Button>
            </div>
        </UnifiedCard>
        )}

        {activeTab === 'history' && (
        <UnifiedCard>
          <div className="p-8">
            <div className="flex flex-col gap-4 mb-6 pb-5 border-b">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-foreground tracking-tight">Scan History</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{filteredScans.length} of {scans.length} repositories</p>
                  <UnifiedInlineRefresh
                    isRefreshing={isRefreshing && !autoRefresh}
                    label=""
                    size="md"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={deleteAllScans}
                    disabled={deletingAll || isLoading}
                    className="text-destructive hover:text-destructive"
                  >
                    {deletingAll ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                    Clear All
                  </Button>
                  <UnifiedRefreshButton
                    onClick={refreshHistory}
                    isRefreshing={isRefreshing}
                    autoRefresh={autoRefresh}
                  />
                </div>
              </div>

              {/* Search + per-page controls */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={e => { setHistorySearch(e.target.value); setCurrentPage(1); }}
                    placeholder="Filter by URL, branch, status, grade…"
                    className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  {historySearch && (
                    <button onClick={() => { setHistorySearch(''); setCurrentPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={e => handlePageSizeChange(e.target.value)}
                    className="border rounded-md px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span>per page</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl">
              {isLoading ? (
                <div className="text-center py-16">
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-sm font-semibold text-muted-foreground">Loading scan history...</p>
                  </div>
                </div>
              ) : scans.length === 0 ? (
                <div className="text-center py-16">
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <Shield className="w-12 h-12 text-muted-foreground" />
                    <p className="text-base font-medium text-foreground">No scans yet</p>
                    <p className="text-sm text-muted-foreground">Start by scanning your first repository above</p>
                  </div>
                </div>
              ) : filteredScans.length === 0 ? (
                <div className="text-center py-16">
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <Search className="w-12 h-12 text-muted-foreground" />
                    <p className="text-base font-medium text-foreground">No results for "{historySearch}"</p>
                    <button onClick={() => setHistorySearch('')} className="text-sm text-primary hover:underline">Clear filter</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {paginatedScans.map((scan) => (
                      <ScanRow
                        key={scan.id}
                        scan={scan}
                        onView={handleViewResults}
                        onRetry={retryScan}
                        onDelete={deleteScan}
                        retryingId={retryingId}
                        deletingId={deletingId}
                      />
                    ))}
                  </div>

                  {/* Pagination controls */}
                  {totalPages >= 1 && filteredScans.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 pt-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        Showing {filteredScans.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredScans.length)} of {filteredScans.length} {historySearch ? 'filtered' : ''} scans
                      </p>

                      <div className="flex items-center gap-1">
                        {/* First page */}
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentPage(1)} disabled={safePage === 1}>
                          <ChevronsLeft className="w-4 h-4" />
                        </Button>
                        {/* Prev */}
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>
                          <ChevronLeft className="w-4 h-4" />
                        </Button>

                        {/* Page number buttons */}
                        {pageButtons.map((p, i) =>
                          p === '...' ? (
                            <span key={`ellipsis-${i}`} className="h-8 w-8 flex items-center justify-center text-sm text-muted-foreground">…</span>
                          ) : (
                            <Button
                              key={p}
                              variant={p === safePage ? 'default' : 'outline'}
                              size="sm"
                              className="h-8 w-8 p-0 text-xs"
                              onClick={() => setCurrentPage(p as number)}
                            >
                              {p}
                            </Button>
                          )
                        )}

                        {/* Next */}
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                        {/* Last page */}
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages}>
                          <ChevronsRight className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Jump to page */}
                      {totalPages > 5 && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                          <span>Go to</span>
                          <input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={jumpPage}
                            onChange={e => setJumpPage(e.target.value)}
                            onKeyDown={handleJumpPage}
                            placeholder={String(safePage)}
                            className="w-14 border rounded-md px-2 py-1 text-sm text-center bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
        </div>
        </UnifiedCard>
        )}

        {/* Onboarded Repositories Section */}
        {activeTab === 'onboarded' && (
        <UnifiedCard>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold">Onboarded Repositories</h2>
                <p className="text-sm text-muted-foreground mt-1">Quick scan access for your onboarded git repositories</p>
              </div>
            </div>
            
            {onboardingReposLoading ? (
              <div className="flex items-center justify-center p-8 border rounded-lg bg-muted/20">
                <div className="text-muted-foreground">Loading onboarding repositories...</div>
              </div>
            ) : onboardingRepos.length === 0 ? (
              <div className="flex items-center justify-center p-8 border rounded-lg bg-muted/20">
                <div className="text-muted-foreground">No onboarding repositories found.</div>
              </div>
            ) : (
              <div className="space-y-6">
                {onboardingRepos.map(org => (
                  <div key={org.id} className="border rounded-lg p-6 bg-card shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-4 pb-4 border-b">
                      <div className="p-2 bg-primary/10 rounded">
                        <Shield className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">{org.organization_name}</h3>
                        <p className="text-xs text-muted-foreground">Organization ID: {org.id}</p>
                      </div>
                    </div>

                    {org.repositories && org.repositories.length > 0 && (
                      <div className="mb-4">
                        <div className="text-sm font-medium text-muted-foreground mb-3">Organization Repositories</div>
                        <div className="grid grid-cols-1 gap-3">
                          {org.repositories.map((r: any) => (
                            <div key={r.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border hover:border-primary/50 transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{r.repo_url || r.repository_url}</div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  <span className="mr-3">ID: {r.id}</span>
                                  {(r.branch_to_scan || r.default_branch) && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-primary/10 text-primary">
                                      Branch: {r.branch_to_scan || r.default_branch}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Button 
                                size="sm" 
                                className="ml-2 shrink-0" 
                                onClick={() => handleOnboardingRepoScan(r.repo_url || r.repository_url, r.branch_to_scan || r.default_branch)}
                              >
                                <Shield className="h-4 w-4 mr-1" />
                                Scan
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {org.suborgs && org.suborgs.length > 0 && (
                      <div className="space-y-4">
                        {org.suborgs.map((so: any) => (
                          <div key={so.id} className="pl-4 border-l-2 border-primary/30">
                            <div className="mb-3">
                              <h4 className="font-semibold text-base">{so.suborganization_name}</h4>
                              <p className="text-xs text-muted-foreground">Sub-Organization ID: {so.id}</p>
                            </div>

                            {so.repositories && so.repositories.length > 0 && (
                              <div className="mb-4">
                                <div className="text-sm font-medium text-muted-foreground mb-2">Sub-Organization Repositories</div>
                                <div className="grid grid-cols-1 gap-3">
                                  {so.repositories.map((r: any) => (
                                    <div key={r.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border hover:border-primary/50 transition-colors">
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm truncate">{r.repo_url || r.repository_url}</div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                          <span className="mr-3">ID: {r.id}</span>
                                          {(r.branch_to_scan || r.default_branch) && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-primary/10 text-primary">
                                              Branch: {r.branch_to_scan || r.default_branch}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <Button 
                                        size="sm" 
                                        className="ml-2 shrink-0" 
                                        onClick={() => handleOnboardingRepoScan(r.repo_url || r.repository_url, r.branch_to_scan || r.default_branch)}
                                      >
                                        <Shield className="h-4 w-4 mr-1" />
                                        Scan
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {so.applications && so.applications.length > 0 && (
                              <div className="space-y-3 pl-4">
                                {so.applications.map((app: any) => (
                                  <div key={app.id} className="bg-background/50 p-4 rounded-lg border">
                                    <div className="mb-3">
                                      <h5 className="font-medium text-sm">{app.application_name}</h5>
                                      <p className="text-xs text-muted-foreground">Application ID: {app.id}</p>
                                    </div>
                                    {app.repositories && app.repositories.length > 0 && (
                                      <div className="space-y-2">
                                        {app.repositories.map((r: any) => (
                                          <div key={r.id} className="flex items-center justify-between p-2 bg-muted/30 rounded border hover:border-primary/50 transition-colors">
                                            <div className="flex-1 min-w-0">
                                              <div className="font-medium text-xs truncate">{r.repo_url || r.repository_url}</div>
                                              <div className="text-[10px] text-muted-foreground mt-1">
                                                <span className="mr-2">ID: {r.id}</span>
                                                {(r.branch_to_scan || r.default_branch) && (
                                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                                    {r.branch_to_scan || r.default_branch}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            <Button 
                                              size="sm" 
                                              className="ml-2 shrink-0 h-7 px-2 text-xs" 
                                              onClick={() => handleOnboardingRepoScan(r.repo_url || r.repository_url, r.branch_to_scan || r.default_branch)}
                                            >
                                              <Shield className="h-3 w-3 mr-1" />
                                              Scan
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </UnifiedCard>
        )}
      </div>
    </div>
  );
};

export default CryptoScanner;