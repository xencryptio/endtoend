import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import React, { useState, useEffect } from 'react';
import { RefreshCw, Shield, AlertTriangle, Clock, Package, XCircle, CheckCircle, ArrowLeft, Eye, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UnifiedCard, UnifiedBadge, UnifiedBackButton, UnifiedRefreshButton } from '@/components/ui/unified';
import { typography } from '@/lib/design-tokens';
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

  useEffect(() => {
    loadHistory();
  }, []);

  const showStatusMessage = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setStatusMessage(message);
    let variant: 'destructive' | 'success' | 'warning' | 'default' = 'default';
    if (type === 'error') variant = 'destructive';
    if (type === 'success') variant = 'success';
    if (type === 'info') variant = 'warning';
    setStatusType(variant);
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

    const ScanRow: React.FC<{ scan: Scan }> = ({ scan }) => {
      const canView = scan.scan_status === 'completed' || scan.scan_status === 'cached';
      const fileCountDisplay =
        scan.scan_status === 'in_progress' && scan.total_files_to_scan > 0
          ? `${scan.total_files || 0} / ${scan.total_files_to_scan}`
          : scan.total_files || '-';
  
      const getStatusBadge = () => {
        switch (scan.scan_status) {
          case 'pending':
            return <UnifiedBadge variant="warning" label="Queued" />;
          case 'in_progress':
            return <UnifiedBadge variant="info" label="In Progress" />;
          case 'completed':
            return <UnifiedBadge variant="success" label="Completed" />;
          case 'failed':
            return <UnifiedBadge variant="error" label="Failed" />;
          default:
            return <UnifiedBadge variant="neutral" label="Unknown" />;
        }
      };

      return (
        <>
          <tr
            className="border-b hover:bg-muted/50 transition-all duration-200 group"
          >
            <td className="px-6 py-5 text-sm text-foreground font-medium">
              <div className="break-words text-xs leading-tight" title={scan.repo_url}>
                {formatRepoName(scan.repo_url)}
              </div>
            </td>
            <td className="px-6 py-5 text-sm">
              <UnifiedBadge variant="neutral" label={scan.branch_name || 'main'} pill={false} />
            </td>
            <td className="px-6 py-5 text-sm">
              <UnifiedBadge variant="neutral" label={scan.platform || 'Unknown'} pill={false} />
            </td>
            <td className="px-6 py-5 text-sm">
                {getStatusBadge()}
                {scan.current_status && (
                    <div className="text-xs text-muted-foreground mt-1">{scan.current_status}</div>
                )}
            </td>
            <td className="px-6 py-5 text-sm font-medium">{fileCountDisplay}</td>
            <td className="px-6 py-5 text-sm text-success font-semibold">
              {scan.quantum_safe_count || '-'}
            </td>
            <td className="px-6 py-5 text-sm text-destructive font-semibold">
              {scan.quantum_vulnerable_count || '-'}
            </td>
            <td className="px-6 py-5 text-sm font-medium">
              {canView ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewResults(scan.id);
                  }}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Results
                </Button>
              ) : (
                <Button
                  disabled
                  variant="secondary"
                  size="sm"
                >
                  {scan.scan_status === 'pending'
                    ? 'Queued'
                    : scan.scan_status === 'in_progress'
                    ? 'Scanning...'
                    : 'Failed'}
                </Button>
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
      <header className="bg-card border-b">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-lg">
                <Shield className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className={typography.h1}>Crypto Scanner</h1>
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
                
                {isValidating && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Validating URL...</span>
                  </div>
                )}
                
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
                  <div className="w-full h-10 px-4 py-2 border rounded-md bg-muted/50 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Fetching branches...</span>
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
                      {branchFetchError || 'Enter branch name (default: main)'}
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
                {isScanning ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                    <span>Submitting Scan...</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5 mr-2" />
                    <span>Scan Repository</span>
                  </>
                )}
              </Button>
            </div>
        </UnifiedCard>

        <UnifiedCard>
          <div className="p-8">
            <div className="flex justify-between items-center mb-6 pb-5 border-b">
              <div>
                <h2 className="text-2xl font-bold text-foreground tracking-tight">Scan History</h2>
              </div>
              <UnifiedRefreshButton
                onClick={refreshHistory}
                isRefreshing={isRefreshing}
                autoRefresh={autoRefresh}
              />
            </div>

            <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/80">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Repository
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Branch
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Platform
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Files
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Quantum Safe
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Vulnerable
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16">
                        <div className="flex flex-col items-center justify-center space-y-4">
                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                            <p className="text-sm font-semibold text-muted-foreground">Loading scan history...</p>
                        </div>
                    </td>
                  </tr>
                ) : scans.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16">
                        <div className="flex flex-col items-center justify-center space-y-4">
                            <Shield className="w-12 h-12 text-muted-foreground" />
                            <p className="text-base font-medium text-foreground">No scans yet</p>
                            <p className="text-sm text-muted-foreground">Start by scanning your first repository above</p>
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
        </UnifiedCard>
      </div>
    </div>
  );
};

export default CryptoScanner;