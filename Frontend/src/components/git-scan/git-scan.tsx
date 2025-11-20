import React, { useState, useEffect } from 'react';
import { RefreshCw, Shield, AlertTriangle, Clock, Package, XCircle, CheckCircle, ArrowLeft, Eye } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Scan, StatusType } from './types';
import ScanResultsDetail from './ScanResultsDetail';

interface CryptoScannerProps {
  onBack: () => void;
}

const API_URL = import.meta.env.VITE_REPO_SCAN_API_URL

const formatRepoName = (url: string) => {
  try {
    const parts = url.replace(/^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\//, '');
    return parts;
  } catch {
    return url;
  }
};


const CryptoScanner: React.FC<CryptoScannerProps> = ({ onBack }) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [branchName, setBranchName] = useState('main');
  const [detectedPlatform, setDetectedPlatform] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [scans, setScans] = useState<Scan[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState<StatusType>('info');
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

  useEffect(() => {
    loadHistory();
  }, []);

  const showStatusMessage = (message: string, type: StatusType = 'info') => {
    setStatusMessage(message);
    setStatusType(type);
    setShowStatus(true);
    setTimeout(() => setShowStatus(false), 5000);
  };

  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      loadHistory();
    }, 4000); // Faster polling - every 2 seconds instead of 3
    
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const showStatusMessageWithTimeout = (message: string, type: StatusType = 'info') => {
    setStatusMessage(message);
    setStatusType(type);
    setShowStatus(true);
    setTimeout(() => setShowStatus(false), 5000);
  };

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
        setBranchName(data.default_branch); // Auto-select default branch
        setShowManualBranchInput(false);
        showStatusMessage(`Found ${data.total_count} branches`, 'success');
      } else {
        // If branch fetch fails, allow manual entry
        setBranchFetchError(data.detail || 'Could not fetch branches');
        setShowManualBranchInput(true);
        setAvailableBranches([]);
        showStatusMessage(
          'Could not fetch branches automatically. Please enter branch name manually.', 
          'info'
        );
      }
    } catch (error) {
      setBranchFetchError('Network error while fetching branches');
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

        showStatusMessage(data.detail || 'Invalid URL', 'error');
      }
    } catch (error) {
      setDetectedPlatform('');
      setAvailableBranches([]);

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

  const loadHistory = async () => {
    try {
      const response = await fetch(`${API_URL}/api/scans`);
      const data: Scan[] = await response.json();
      setScans(data);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load history:', error);
      showStatusMessage('Failed to fetch scan history', 'error');
      setIsLoading(false);
    }
  };

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
        throw new Error(data.detail || 'Scan failed');
      }
  
      if (data.cached) {
        showStatusMessageWithTimeout('✓ Using cached scan results', 'success');
      } else {
        showStatusMessageWithTimeout('✓ Scan queued successfully! Auto-refreshing...', 'success');
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
        showStatusMessageWithTimeout('Request timeout - Please check if the backend is running', 'error');
      } else if (error.message.includes('Failed to fetch')) {
        showStatusMessageWithTimeout('Cannot connect to backend server. Ensure backend is running.', 'error');
      } else {
        showStatusMessageWithTimeout(error.message, 'error');
      }
    } finally {
      setTimeout(() => setIsScanning(false), 2000);
    }
  };

  const refreshHistory = async () => {
    setIsRefreshing(true);
    await loadHistory();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  useEffect(() => {
    const hasInProgress = scans.some(s => 
      s.scan_status === 'in_progress' || s.scan_status === 'pending'
    );
    // Don't stop auto-refresh immediately - give it time to show completion
    if (!hasInProgress && autoRefresh) {
      // Wait 5 seconds before stopping to ensure UI updates
      setTimeout(() => setAutoRefresh(false), 5000);
    }
  }, [scans, autoRefresh]);

  const handleViewResults = (scanId: number) => {
    setSelectedScanId(scanId);
    setCurrentView('detail');
  };

    // Create a separate component for each row to avoid Fragment issues
    const ScanRow: React.FC<{ scan: Scan }> = ({ scan }) => {
      const canView = scan.scan_status === 'completed' || scan.scan_status === 'cached';
      const fileCountDisplay =
        scan.scan_status === 'in_progress' && scan.total_files_to_scan > 0
          ? `${scan.total_files || 0} / ${scan.total_files_to_scan}`
          : scan.total_files || '-';
  
      return (
        <>
          <tr
            className="border-b hover:bg-muted/50 transition-all duration-200 group"
          >
            <td className="px-6 py-5 text-sm text-slate-900 dark:text-slate-100 font-medium">
              <div className="break-words text-xs leading-tight" title={scan.repo_url}>
                {formatRepoName(scan.repo_url)}
              </div>
            </td>
            <td className="px-6 py-5 text-sm text-slate-900 dark:text-slate-100 font-medium">
              <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-200 dark:border-blue-900 shadow-sm">
                {scan.branch_name || 'main'}
              </span>
            </td>
            <td className="px-6 py-5 text-sm text-slate-900 dark:text-slate-100 font-medium">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium shadow-sm">
                {scan.platform || 'Unknown'}
              </span>
            </td>
            <td className="px-6 py-5 text-sm text-slate-900 dark:text-slate-100 font-medium">
              {(() => {
                switch (scan.scan_status) {
                  case 'pending':
                    return (
                      <div className="text-xs">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-xs font-semibold border border-amber-200 dark:border-amber-900 shadow-sm">
                          <Clock className="w-3.5 h-3.5" /> Queued
                        </span>
                        {scan.current_status && (
                          <div className="text-yellow-800 dark:text-yellow-300 mt-1">Waiting for worker...</div>
                        )}
                      </div>
                    );
                  case 'in_progress':
                    return (
                      <div className="text-xs">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-200 dark:border-blue-900 shadow-sm">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> In Progress
                        </span>
                        {scan.current_status && (
                          <div className="text-blue-800 dark:text-blue-300 mt-1">{scan.current_status}</div>
                        )}
                      </div>
                    );
                  case 'completed':
                    return (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold border border-emerald-200 dark:border-emerald-900 shadow-sm">
                        <CheckCircle className="w-3.5 h-3.5" /> Completed
                      </span>
                    );
                  case 'failed':
                    return (
                      <div className="text-xs">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-xs font-semibold border border-rose-200 dark:border-rose-900 shadow-sm">
                          <XCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                        {scan.current_status && (
                          <div className="text-red-600 dark:text-red-300 mt-1">{scan.current_status}</div>
                        )}
                      </div>
                    );
                  default:
                    return <span className="inline-flex items-center px-3 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-sm font-medium">Unknown</span>;
                }
              })()}
            </td>
            <td className="px-6 py-5 text-sm text-slate-900 dark:text-slate-100 font-medium">{fileCountDisplay}</td>
            <td className="px-6 py-5 text-sm text-emerald-600 font-semibold">
              {scan.quantum_safe_count || '-'}
            </td>
            <td className="px-6 py-5 text-sm text-rose-600 font-semibold">
              {scan.quantum_vulnerable_count || '-'}
            </td>
            <td className="px-6 py-5 text-sm text-slate-900 dark:text-slate-100 font-medium">
              {canView ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewResults(scan.id);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-card border-2 rounded-lg text-card-foreground text-sm font-semibold hover:bg-muted hover:border-blue-500 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-200 shadow-sm hover:shadow-md group"
                >
                  <Eye className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  <span>View Results</span>
                </button>
              ) : (
                <button
                  disabled
                  className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-500 dark:text-gray-400 text-xs cursor-not-allowed"
                >
                  {scan.scan_status === 'pending'
                    ? 'Queued'
                    : scan.scan_status === 'in_progress'
                    ? 'Scanning...'
                    : 'Failed'}
                </button>
              )}
            </td>
          </tr>
        </>
      );
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
      <header className="bg-card border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/30">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Crypto Scanner</h1>
                <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">Post-Quantum Cryptography Security Analysis</div>
              </div>
            </div>
            <Button variant="outline" onClick={onBack} className="font-medium">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {showStatus && (
          <div
            className={`fixed top-20 right-6 z-50 p-4 rounded-lg shadow-xl backdrop-blur-md animate-in slide-in-from-right duration-300 max-w-md ${
              statusType === 'error'
                ? 'bg-red-50 dark:bg-red-950/90 border-2 border-red-200 dark:border-red-900 text-red-900 dark:text-red-100 shadow-xl'
                : statusType === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/90 border-2 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-100 shadow-xl'
                : 'bg-blue-50 dark:bg-blue-950/90 border-2 border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-100 shadow-xl'
            }`}
          >
            <div className="flex items-start gap-3">
              {statusType === 'error' ? <XCircle className="w-5 h-5 flex-shrink-0" /> :
               statusType === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> :
               <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
              <span className="text-sm font-medium">{statusMessage}</span>
            </div>
          </div>
        )}

        <div className="bg-card text-card-foreground rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)] border p-8 mb-12 transition-all duration-300 hover:shadow-[0_8px_16px_rgba(0,0,0,0.12)]">
          <div className="mb-6 pb-5 border-b">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Repository Scan</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
              Analyze GitHub repositories for cryptographic algorithm usage and PQC readiness
            </p>
          </div>

          <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5 uppercase tracking-wider" htmlFor="repoUrl">
                Repository URL
              </label>
              
              <div className="mb-4">
                <div className="relative">
                  <input
                    type="text"
                    id="repoUrl" // The id should be unique
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/username/repository"
                    className="w-full pl-11 pr-4 py-3.5 border-2 rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm"
                  />
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                </div>
                
                {isValidating && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Validating URL...</span>
                  </div>
                )}
                
                {detectedPlatform && !isValidating && (
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-medium shadow-sm">
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
                  <div className="w-full px-4 py-3 border rounded-lg bg-muted/50 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                    <span className="text-sm text-slate-600 dark:text-slate-400">Fetching branches...</span>
                  </div>
                ) : availableBranches.length > 0 && !showManualBranchInput ? (
                  <>
                    <select
                      id="branchName"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      className="w-full px-4 py-3.5 border-2 rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm"
                    >
                      {availableBranches.map((branch) => (
                        <option key={branch} value={branch}>
                          {branch}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {availableBranches.length} branches available
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowManualBranchInput(true)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Enter manually instead
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      id="branchName"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      placeholder="main"
                      className="w-full px-4 py-3.5 border-2 rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm"
                    />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {branchFetchError || 'Enter branch name (default: main)'}
                    </p>
                    {availableBranches.length === 0 && detectedPlatform && !isFetchingBranches && (
                      <button
                        type="button"
                        onClick={() => fetchBranches(repoUrl)}
                        className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Retry fetching branches
                      </button>
                    )}
                  </>
                )}
              </div>

              <button
                onClick={scanRepository}
                disabled={isScanning || !repoUrl.trim() || !branchName.trim()}
                className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold text-base hover:from-blue-700 hover:to-blue-800 hover:shadow-xl hover:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-slate-400 disabled:to-slate-500 transition-all duration-300 flex items-center justify-center gap-2.5"
              >
                {isScanning ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Submitting Scan...</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5" />
                    <span>Scan Repository</span>
                  </>
                )}
              </button>
            </div>
        </div>

        <div className="bg-card text-card-foreground rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)] border p-8 transition-all duration-300 hover:shadow-[0_8px_16px_rgba(0,0,0,0.12)]">
          <div className="flex justify-between items-center mb-6 pb-5 border-b">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Scan History</h2>
            </div>
            <button
              onClick={refreshHistory}
              disabled={isRefreshing}
              className={`px-4 py-2.5 bg-white dark:bg-slate-900 border rounded-lg text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-all duration-200 flex items-center gap-2 ${
                autoRefresh ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'border'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing || autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? 'Auto-refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 z-10 backdrop-blur-sm">
                <tr className="bg-muted/80 border-b-2">
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest min-w-[180px]">
                    Repository
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest min-w-[90px]">
                    Branch
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest min-w-[90px]">
                    Platform
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest min-w-[140px]">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest min-w-[70px]">
                    Files
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest min-w-[90px]">
                    Quantum Safe
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest min-w-[90px]">
                    Vulnerable
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest min-w-[130px]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr className="bg-card">
                    <td colSpan={8}>
                      <div className="flex flex-col items-center justify-center py-16 space-y-4">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full border-4 border-slate-200 dark:border-slate-800"></div>
                          <div className="absolute top-0 left-0 w-12 h-12 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
                        </div>
                        <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Loading scan history...</p>
                      </div>
                    </td>
                  </tr>
                ) : scans.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 rounded-2xl flex items-center justify-center shadow-inner mb-4">
                          <Shield className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                        </div>
                        <p className="text-base font-medium text-slate-900 dark:text-slate-100 mb-1">No scans yet</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Start by scanning your first repository above</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  scans.map((scan) => <ScanRow key={scan.id} scan={scan} />)
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CryptoScanner;