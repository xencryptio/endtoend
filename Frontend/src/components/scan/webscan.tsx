import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AlertTriangle,ArrowLeft, ArrowRight, Globe, RefreshCw, Play, Edit, Save, RotateCcw, Plus, Check, X, Shield, Lock, Hash, Key, Zap, Trash2, Activity, FileText, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UnifiedBackButton, UnifiedResultCard, UnifiedCard, UnifiedFileInput, UnifiedActionLoading, UnifiedInlineRefresh } from "@/components/ui/unified";
import ResultsDetailPage from "./ResultsDetailPage";

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

interface WebScanProps {
  onBack: () => void;
  apiBaseUrl: string;
}

interface ScanResult {
  request_id: string;
  id?: number; // ADD THIS for individual result deletion
  batch_id?: string; // ADD THIS
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requested_at: string;
  total_urls: number;
  execution_time_seconds?: number;
  scan_status?: 'success' | 'http_skipped' | 'failed' | 'pending';
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

interface DomainProgressInfo {
  status: string;
  duration?: number;
  error?: string;
  round?: number;
  startedAt?: string;
  timeInCurrentRound?: number;
}
interface RoundInfo {
  round: number;
  duration: number;
  domainsProcessed: number;
}

interface ProgressDisplayProps {
  scanProgress: { total: number; completed: number };
  domainProgress: {[key: string]: DomainProgressInfo};
  processingDomains: {[key: string]: DomainProgressInfo};
  currentRound?: number;
  roundHistory: RoundInfo[];
  onCancel?: () => void;
  isCancelling?: boolean;
  isActiveProgress?: boolean;
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const getSectionIcon = (section: string) => {
  const icons: Record<string, React.ReactNode> = {
    "Symmetric Algorithms": <Lock className="w-5 h-5" />,
    "Asymmetric Algorithms": <Key className="w-5 h-5" />,
    "Hash Functions": <Hash className="w-5 h-5" />,
    "MACs & KDFs": <Shield className="w-5 h-5" />,
    "Post-Quantum Cryptography": <Zap className="w-5 h-5" />,
    "kex": <Key className="w-5 h-5" />,
    "signature": <Shield className="w-5 h-5" />,
    "symmetric": <Lock className="w-5 h-5" />,
    "certificate": <Shield className="w-5 h-5" />,
    "protocol": <Globe className="w-5 h-5" />
  };
  return icons[section] || <Shield className="w-5 h-5" />;
};

const getStatusBadge = (status: string) => {
  const colors: Record<string, string> = {
    "Strong": "bg-success/10 text-success dark:bg-success/50 dark:text-success",
    "Medium": "bg-warning/10 text-warning dark:bg-warning/50 dark:text-warning",
    "Weak": "bg-destructive/10 text-destructive dark:bg-destructive/50 dark:text-destructive",
    "Safe": "bg-primary/10 text-primary dark:bg-primary/50 dark:text-primary",
    "Standardized": "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300"
  };
  return colors[status] || "bg-muted text-muted-foreground";
};

const getGradeColor = (grade: string): string => {
  if (!grade) return 'text-muted-foreground';
  if (grade.startsWith('A')) return 'text-success';
  if (grade.startsWith('B')) return 'text-primary';
  if (grade.startsWith('C')) return 'text-warning';
  if (grade.startsWith('D')) return 'text-warning';
  return 'text-destructive';
};

const ProgressDisplay: React.FC<ProgressDisplayProps> = ({ 
  scanProgress, 
  domainProgress, 
  processingDomains, 
  currentRound, 
  roundHistory, 
  onCancel, 
  isCancelling,
  isActiveProgress = false
}) => {
  if (Object.keys(domainProgress).length === 0) return null;

  // Calculate counts first properly
  const failedDomains = Object.entries(domainProgress).filter(
    ([, info]) => info.status === 'failed' || info.status === 'http_skipped'
  );
  const httpSkippedCount = failedDomains.filter(([, info]) => info.status === 'http_skipped').length;
  const actualFailedCount = failedDomains.length - httpSkippedCount;
  const successfulCount = Object.values(domainProgress).filter(i => i.status === 'completed').length;
  
  const percentage = scanProgress.total > 0 ? (scanProgress.completed / scanProgress.total) * 100 : 0;

  return (
    <UnifiedCard padding="default" className="mb-6">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-lg">
            {isActiveProgress
              ? `Scan Progress... (Round ${currentRound || 1})`
              : 'Scan Summary'}
          </h3>
          {scanProgress.total > 0 && (
            <p className="text-muted-foreground text-sm">
              {scanProgress.completed}/{scanProgress.total} domains scanned ({percentage.toFixed(0)}%)
            </p>
          )}
        </div>
        {isActiveProgress && onCancel && (
  <Button 
    variant="destructive" 
    size="sm"
    onClick={onCancel}
    disabled={isCancelling}
  >
    <UnifiedActionLoading
      isLoading={isCancelling}
      loadingText="Cancelling..."
      defaultText="Cancel Scan"
      icon={<X className="h-4 w-4 mr-2" />}
    />
  </Button>
)}
      </div>
      <div className="mt-4">
        {scanProgress.total > 0 && (
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden mb-4">
            <motion.div
              className="bg-primary h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            />
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-h-60 overflow-y-auto">
          {/* Successful Section */}
          <div>
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
              <Check className="h-4 w-4 text-success" />
              Successful ({successfulCount})
            </h4>
            <div className="space-y-1">
              {Object.entries(domainProgress)
                .filter(([, info]) => info.status === 'completed')
                .map(([domain, info]) => (
                  <div key={domain} className="flex items-center justify-between text-sm py-1 px-2 bg-success/10 dark:bg-success/20 rounded-md">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-success" />
                      <span className="truncate" title={domain}>{domain}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {info.round && <span className="text-xs text-muted-foreground">R{info.round}</span>}
                      {info.duration && (
                        <span className="text-muted-foreground text-xs font-mono">{info.duration.toFixed(1)}s</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Processing Section (Only shown during active scans) */}
          {isActiveProgress && (
            <div>
              <div className="font-semibold text-sm mb-2">
                <UnifiedInlineRefresh isRefreshing={true} size="sm" label={`In Progress (${Object.keys(processingDomains).length})`} className="text-primary" />
              </div>
              <div className="space-y-1">
                {Object.entries(processingDomains).map(([domain, info]) => (
                  <div key={domain} className="text-sm py-1 px-2 bg-primary/10 dark:bg-primary/20 rounded-md">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="truncate">{domain}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HTTP Skipped Section */}
          <div>
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              HTTP/Unreachable ({httpSkippedCount})
            </h4>
            <div className="space-y-2">
              {failedDomains
                .filter(([, info]) => info.status === 'http_skipped')
                .map(([domain, info]) => (
                  <div key={domain} className="p-2 rounded-md bg-warning/10 dark:bg-warning/20">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-warning" />
                      <span className="truncate font-medium text-xs" title={domain}>{domain}</span>
                    </div>
                    <div className="text-xs mt-1 text-warning">
                      HTTP/Unreachable - cannot scan
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Failed Section */}
          <div>
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
              <X className="h-4 w-4 text-destructive" />
              Failed ({actualFailedCount})
            </h4>
            <div className="space-y-2">
              {failedDomains
                .filter(([, info]) => info.status === 'failed')
                .map(([domain, info]) => (
                  <div key={domain} className="p-2 rounded-md bg-destructive/10 dark:bg-destructive/20">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-destructive" />
                      <span className="truncate font-medium text-xs" title={domain}>{domain}</span>
                    </div>
                    {info.error && (
                      <div className="text-xs mt-1 text-destructive">
                        {info.error}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </UnifiedCard>
  );
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const deleteScanBatch = async (apiBaseUrl: string, batchId: string): Promise<boolean> => {
  try {
    const normalizedBaseUrl = apiBaseUrl.replace(/\/$/, '');
    
    // FIXED: Use correct endpoint path
    const deleteUrl = `${normalizedBaseUrl}/scans/batch/${batchId}`;
    console.log('🗑️ Attempting to delete batch at:', deleteUrl);
    
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response OK:', response.ok);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Batch deleted successfully:', data);
      return true;
    } else {
      const errorData = await response.text();
      console.error('❌ Delete failed with status', response.status, ':', errorData);
      return false;
    }
  } catch (error) {
    console.error('❌ Error deleting batch:', error);
    return false;
  }
};

const deleteScanResult = async (apiBaseUrl: string, resultId: number): Promise<boolean> => {
  try {
    const normalizedBaseUrl = apiBaseUrl.replace(/\/$/, '');
    
    // FIXED: Use correct endpoint path
    const deleteUrl = `${normalizedBaseUrl}/scans/result/${resultId}`;
    console.log('🗑️ Attempting to delete result at:', deleteUrl);
    
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response OK:', response.ok);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Result deleted successfully:', data);
      return true;
    } else {
      const errorData = await response.text();
      console.error('❌ Delete failed with status', response.status, ':', errorData);
      return false;
    }
  } catch (error) {
    console.error('❌ Error deleting result:', error);
    return false;
  }
};

// FIXED: Clear all function with proper error handling
const clearAllScans = async (apiBaseUrl: string): Promise<boolean> => {
  try {
    const normalizedBaseUrl = apiBaseUrl.replace(/\/$/, '');
    
    // FIXED: Use correct endpoint path
    const deleteUrl = `${normalizedBaseUrl}/scans/clear-all`;
    console.log('🗑️ Attempting to clear all at:', deleteUrl);
    
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response OK:', response.ok);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ All data cleared successfully:', data);
      return true;
    } else {
      const errorData = await response.text();
      console.error('❌ Clear all failed with status', response.status, ':', errorData);
      return false;
    }
  } catch (error) {
    console.error('❌ Error clearing all scans:', error);
    return false;
  }
};

const loadHistoricalScans = async (apiBaseUrl: string) => {
  try {
    // Call the scan-service which proxies to db-service
    const normalizedBaseUrl = apiBaseUrl.replace(/\/$/, '');
    const response = await fetch(`${normalizedBaseUrl}/batches`);
    
    if (!response.ok) {
      console.warn(`Failed to load historical scans: ${response.status}`);
      return [];
    }
    
    const batchesData = await response.json();
    // Handle both array and object with 'batches' key
    const batches = Array.isArray(batchesData) ? batchesData : (batchesData.batches || []);
    
    // Convert batches to ScanResult format
    console.log(`📊 Loaded ${batches.length} batches from database`);
    
    // Convert batches to ScanResult format
    return batches.map((batch: any) => {
      // ✅ FIX: Calculate total from successful + failed counts
      const totalUrls = (batch.successful_count || 0) + (batch.failed_count || 0);
      
      return {
        request_id: batch.batch_id,
        batch_id: batch.batch_id,
        url: `Batch with ${totalUrls} domains`,
        status: batch.status as 'pending' | 'processing' | 'completed' | 'failed',
        requested_at: batch.created_at,
        total_urls: totalUrls,
        execution_time_seconds: undefined,
        scan_status: batch.status === 'completed' ? 'success' : 'failed',
        successful_count: batch.successful_count || 0,
        failed_count: batch.failed_count || 0,
        error_message: batch.status === 'failed' ? 'Batch processing failed' : undefined,
        finalDomainProgress: {},
        detailedResults: [] // Will be loaded on demand
      };
    });
  } catch (error) {
    console.error('Error loading historical scans from database:', error);
    return [];
  }
};

const loadBatchDetails = async (apiBaseUrl: string, batchId: string) => {
  try {
    // Normalize base URL to avoid trailing slash
    const normalizedBaseUrl = apiBaseUrl.replace(/\/$/, '');
    
    // Fetch batch results
    const response = await fetch(`${normalizedBaseUrl}/results/batch/${batchId}`);
    
    if (!response.ok) {
      console.warn(`Failed to load batch details for ${batchId}: ${response.status}`);
      return [];
    }
    const data = await response.json();
    const results = Array.isArray(data) ? data : (data.results || []);
    
    // Map and normalize results
    return results.map((result: any) => ({
        ...result,
        scan_status: result.scan_status
          ? result.scan_status
          : result.status === 'completed'
            ? 'completed'
            : (result.scan_status === 'http_skipped' ? 'http_skipped' : 'failed'),
        total_urls: 1,
        
        // ✅ FIX: Ensure execution_time_seconds is preserved or defaults to 0
        execution_time_seconds: result.execution_time_seconds || 0
      }));
  } catch (error) {
    console.error('Error loading batch details:', error);
    return [];
  }
};



const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed': return <div className="h-2 w-2 bg-success rounded-full" />;
    case 'failed': return <div className="h-2 w-2 bg-destructive rounded-full" />;
    case 'processing': return <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />;
    default: return <div className="h-2 w-2 bg-warning rounded-full" />;
  }
};

const connectSSEWithPost = async (
  apiBaseUrl: string,
  domains: string,
  saveToDb: boolean,  // ADD THIS PARAMETER
  onStart: (requestId: string) => void,
  onProgress: (data: any) => void,
  onComplete: (data: any) => void,
  onError: (error: string) => void
) => {
  try {
    // Normalize API base URL (remove trailing slash)
    const normalizedBaseUrl = apiBaseUrl.replace(/\/$/, '');
    const fullUrl = `${normalizedBaseUrl}/scan-with-progress`;

    console.log('🔍 Attempting to connect to:', fullUrl);
    console.log('📦 Request body:', {
      domain: domains,
      max_concurrent: 5,
      save_to_db: saveToDb  // ADD THIS
    });

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        domain: domains,
        max_concurrent: 5,
        save_to_db: saveToDb  // ADD THIS - This is critical!
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No response body');
    }

    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      // Process complete SSE messages
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || ''; // Keep incomplete message in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'start') {
              onStart(data.request_id);
              onProgress(data);
            } else if (data.type === 'domain_processing') {
              onProgress(data);
            } else if (data.type === 'round_start') { // Restored this handler
              onProgress(data);
            } else if (data.type === 'domain_complete') {
              onProgress(data);
            } else if (data.type === 'round_complete') {
              onProgress(data);
            } else if (data.type === 'retry_wait') {
              // Handle retry_wait separately to show a specific message
              onProgress(data);
            } else if (data.type === 'cancelled') {
              onComplete(data);
              return;
            } else if (data.type === 'complete') {
              onComplete(data);
              return;
            }
          } catch (err) {
            console.error('Parse error:', err);
          }
        }
      }
    }
  } catch (err) {
    console.error('Fetch SSE error:', err);
    onError(err instanceof Error ? err.message : 'Unknown error'); // Pass empty tempRequestId on fetch error
  }
};

// ============================================================================
// MAIN WEBSCAN COMPONENT
// ============================================================================

const WebScan: React.FC<WebScanProps> = ({ onBack, apiBaseUrl }) => {
  const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');
  const [urls, setUrls] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [scanProgress, setScanProgress] = useState({ total: 0, completed: 0 });
  const [expandedSummary, setExpandedSummary] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [domainProgress, setDomainProgress] = useState<{[key: string]: DomainProgressInfo}>({});
  const [processingDomains, setProcessingDomains] = useState<{[key: string]: DomainProgressInfo}>({});
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null); // ADD THIS
  const [expandedProgress, setExpandedProgress] = useState<Set<string>>(new Set());
  const [roundHistory, setRoundHistory] = useState<RoundInfo[]>([]);
  const [currentRound, setCurrentRound] = useState(1);const [viewingResultsFor, setViewingResultsFor] = useState<string | null>(null);

  // Load historical scans on component mount from the API
  useEffect(() => {
    const initializeScans = async () => {
      console.log('Loading scan history from database...');
      const historicalScans = await loadHistoricalScans(apiBaseUrl);
      if (historicalScans && historicalScans.length > 0) {
        console.log(`Loaded ${historicalScans.length} scans from database`);
        setScanHistory(historicalScans);
      } else {
        console.log('No scans found in database');
      }
    };
    
    initializeScans();
  }, [apiBaseUrl]);

  // ============================================================================
  // NO localStorage STORAGE - DATABASE IS THE SOURCE OF TRUTH
  // ============================================================================
  // Removed: useEffect that saves/loads from localStorage
  // The database is now the single source of truth

  const showMessage = (text: string, type: 'success' | 'error' | 'info' | 'warning') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleCancelScan = async () => {
    if (!currentRequestId) return;
    
    setIsCancelling(true);
    try {
      const response = await fetch(`${apiBaseUrl}/cancel-scan/${currentRequestId}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        showMessage('Cancelling scan...', 'warning');
      }
    } catch (error) {
      showMessage('Failed to cancel scan', 'error');
    }
  };

  const processFileUrls = async (file: File): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const text = e.target?.result as string;
        // Split by newlines and filter empty lines
        const urls = text
          .split('\n')
          .map(line => line.trim())
          .filter(line => line !== '' && !line.startsWith('#')); // Allow comments with #
        resolve(urls);
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleFileSelect = async (file: File) => {
    // Validate file type
    if (!file.name.endsWith('.txt')) {
      showMessage('Please upload a .txt file only', 'error');
      return;
    }

    // Validate file size (max 1MB)
    if (file.size > 1024 * 1024) {
      showMessage('File size should be less than 1MB', 'error');
      return;
    }

    try {
      const urls = await processFileUrls(file);
      if (urls.length === 0) {
        showMessage('No valid URLs found in the file', 'warning');
        return;
      }

      setUploadedFile(file);
      setUrls(urls.join('\n')); // Add URLs to textarea
      showMessage(`Successfully loaded ${urls.length} URL(s) from file`, 'success');
    } catch (error) {
      showMessage('Error reading file: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { const files = e.target.files; if (files && files.length > 0) { handleFileSelect(files[0]); } };
  const removeFile = () => { setUploadedFile(null); setUrls(''); showMessage('File removed and URLs cleared', 'info'); };

  const generateRequestId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  };

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const urlList = urls
      .split(/[\s,\n]+/)
      .map(u => u.trim().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, ''))
      .filter(u => u !== '');

    if (urlList.length === 0) {
      showMessage('Please enter at least one URL', 'error');
      return;
    }

    const tempRequestId = generateRequestId(); // This will be used to track the scan before we get a real ID
    const overallStartTime = Date.now();
    
    setIsScanning(true);
    setScanProgress({ total: urlList.length, completed: 0 });
    setDomainProgress({});
    setExpandedSummary(new Set()); // Clear summary on new scan
    setProcessingDomains({});
    setRoundHistory([]);
    setCurrentRequestId(null);
    setIsCancelling(false);
    setCurrentBatchId(null);
    showMessage(`Initiating scan for ${urlList.length} URL(s)...`, 'info');

    const pendingScan: ScanResult = {
      request_id: tempRequestId,
      url: urlList.join(', '),
      status: 'processing',
      requested_at: new Date().toISOString(),
      total_urls: urlList.length,
    };

    setScanHistory(prev => [pendingScan, ...prev]);

    const accumulatedResults: ScanResult[] = [];
    let actualRequestId: string | null = null;

    await connectSSEWithPost(
      apiBaseUrl,
      urlList.join(','),
      true,  // ADD THIS - Enable database persistence
      
      // onStart callback
      (requestId) => {
        actualRequestId = requestId;
        setCurrentRequestId(requestId);
      }, // onProgress callback
      
      // onProgress callback
      (data) => {
        if (data.type === 'start') {
          const backendRequestId = data.request_id;
          const backendBatchId = data.batch_id;
          setCurrentRequestId(backendRequestId);
          setCurrentBatchId(backendBatchId);
          setScanHistory(prev => prev.map(scan => 
            scan.request_id === tempRequestId
              ? { ...scan, request_id: backendRequestId, batch_id: backendBatchId }
              : scan
          ));
          setScanProgress({ total: data.total_domains, completed: 0 });
          showMessage(`Starting scan of ${data.total_domains} domains...`, 'info');
        } else if (data.type === 'round_start') {
          setCurrentRound(data.round);
          setRoundHistory(prev => [...prev, {
            round: data.round,
            duration: 0,
            domainsProcessed: 0
          }]);
        } else if (data.type === 'domain_processing') {
          setProcessingDomains(prev => ({
            ...prev,
            [data.domain]: {
              status: 'processing',
              round: data.round,
              startedAt: data.started_at, // Use backend's field name
              timeInCurrentRound: 0
            }
          }));
        } else if (data.type === 'domain_complete') {
          // FIRST: Remove from processing
          setProcessingDomains(prev => {
            const newProcessing = {...prev};
            delete newProcessing[data.domain];
            return newProcessing;
          });

          // Update overall progress
          setScanProgress({ 
            total: data.total_domains, 
            completed: data.completed 
          });
          // Update individual domain progress
          setDomainProgress(prev => ({
            ...prev,
            [data.domain]: {
              status: data.status,
              duration: data.duration,
              error: data.error,
              round: data.round,
              timeInCurrentRound: data.time_in_current_round
            }
          }));

          // If scan succeeded, store the result
          if (data.status === 'completed' && data.result) {
            // ✅ CRITICAL FIX: Extract PQC scores to top level
            const pqcScore = 
              data.result.pqc_overall_score ?? // eslint-disable-line @typescript-eslint/no-unsafe-member-access
              data.result.raw_response?.pqc_analysis?.overall_score ?? // eslint-disable-line @typescript-eslint/no-unsafe-member-access
              0;
            
            const pqcGrade = 
              data.result.pqc_overall_grade ?? 
              data.result.raw_response?.pqc_analysis?.overall_grade ?? 
              'F';

            accumulatedResults.push({ // eslint-disable-line @typescript-eslint/no-unsafe-assignment
              ...data.result,
              request_id: actualRequestId || tempRequestId,
              // ✅ ADD: Ensure top-level PQC fields exist
              pqc_overall_score: pqcScore,
              pqc_overall_grade: pqcGrade,
            });
          } else if (data.status === 'failed' || data.status === 'http_skipped') {
            // Add a result for the failed domain // eslint-disable-line @typescript-eslint/no-unsafe-assignment
            accumulatedResults.push({
              request_id: actualRequestId || tempRequestId,
              url: data.domain,
              status: 'failed',
              scan_status: 'failed',
              error_message: data.error || 'Scan failed for an unknown reason.', // eslint-disable-line @typescript-eslint/no-unsafe-assignment
              requested_at: new Date().toISOString(),
              total_urls: 1,
              execution_time_seconds: data.duration,
              raw_response: data.result,
            });
          }

          // Show progress message
        } else if (data.type === 'round_complete') {
          setRoundHistory(prev => prev.map(r => r.round === data.round ? {
            ...r, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
            duration: data.duration,
            domainsProcessed: data.domains_processed
          } : r));
        } else if (data.type === 'retry_wait') {
          showMessage(
            `⏳ Waiting ${data.delay}s before retry round ${data.next_round}. Retrying ${data.domains_to_retry} failed domains...`,
            'info'
          );
        } // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      }, // onComplete callback
      
      // onComplete callback
      (data) => {
        const endTime = Date.now();
        const executionTimeSeconds = (endTime - overallStartTime) / 1000;
      
        console.log('📦 Scan completed with data:', {
          type: data.type, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
          batch_id: data.batch_id,
          save_to_db: data.saved_to_db,
          successful: data.summary?.successful,
          failed: data.summary?.failed,
          total_results: accumulatedResults.length,
          currentBatchId
        });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const finalDomainStatusFromBackend = data.all_domains_status || domainProgress;
        const successfulCount = data.summary?.successful || 0;
        const failedCount = data.summary?.failed || 0;
        const totalScanned = successfulCount + failedCount;
        const hasFailures = failedCount > 0;
      
        // CRITICAL FIX: Use currentBatchId to find and update the correct scan
        setScanHistory(prev => prev.map(scan => {
          // Match by batch_id if available, otherwise by request_id
          const isMatchingScan = (scan.batch_id && currentBatchId && scan.batch_id === currentBatchId) ||
                                 (scan.request_id && actualRequestId && scan.request_id === actualRequestId) ||
                                 (scan.request_id && tempRequestId && scan.request_id === tempRequestId);
      
          if (isMatchingScan) {
            console.log('✅ Updating scan in history:', {
              request_id: scan.request_id, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
              batch_id: currentBatchId,
              results: accumulatedResults.length
            });
      
            return {
              ...scan, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
              status: (data.type === 'cancelled' || (hasFailures && totalScanned === scan.total_urls)) // eslint-disable-line @typescript-eslint/no-unsafe-member-access
                ? 'failed' 
                : 'completed',
              detailedResults: accumulatedResults,
              finalDomainProgress: finalDomainStatusFromBackend, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
              execution_time_seconds: executionTimeSeconds,
              successful_count: successfulCount,
              failed_count: failedCount,
              error_message: data.message || (hasFailures ? `${failedCount} domains failed.` : undefined)
            };
          }
          return scan;
        }));
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        setDomainProgress(finalDomainStatusFromBackend);
      
        showMessage(
          data.type === 'cancelled' 
            ? 'Scan cancelled.' 
            : `Scan completed! ${successfulCount} successful, ${failedCount} failed.`,
          hasFailures ? 'warning' : 'success'
        );
      
        // ✅ CRITICAL: Reload history from database
        const reloadHistory = async () => {
          console.log('🔄 Reloading scan history from database...');
          const historicalScans = await loadHistoricalScans(apiBaseUrl);
          if (historicalScans && historicalScans.length > 0) {
            setScanHistory(historicalScans);
            console.log(`✅ Reloaded ${historicalScans.length} scans from database`);
          }
        };
      
        // Reload after 1 second to ensure database has saved
        setTimeout(reloadHistory, 1000);
      
        // Cleanup
        setCurrentRequestId(null);
        setIsCancelling(false);
        setIsScanning(false);
        setScanProgress({ total: 0, completed: 0 });
        setProcessingDomains({}); // Clear processing domains
        setExpandedProgress(new Set());
        setCurrentBatchId(null); // ✅ ADD: Clear batch ID
      },
      
      // onError callback
      (error) => {
        const endTime = Date.now();
        const executionTimeSeconds = (endTime - overallStartTime) / 1000;

        setDomainProgress(currentProgress => {
          setScanHistory(prev => prev.map(scan => 
            scan.request_id === (actualRequestId || tempRequestId)
              ? { // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                  ...scan,
                  request_id: actualRequestId || tempRequestId,
                  status: 'failed',
                  error_message: error,
                  execution_time_seconds: executionTimeSeconds,
                  detailedResults: accumulatedResults.length > 0 ? accumulatedResults : undefined,
                  finalDomainProgress: { ...currentProgress }
                }
              : scan
          ));
          return currentProgress; // Return unchanged
        });

        showMessage(`❌ Scan failed: ${error}`, 'error');
        setCurrentRequestId(null);
        setIsCancelling(false);
        setIsScanning(false);
      },
    );
  };

  const toggleSummary = (requestId: string) => {
    // Toggle Summary
    setExpandedSummary(prev => {
      const newSet = new Set(prev);
      if (newSet.has(requestId)) newSet.delete(requestId);
      else newSet.add(requestId);
      return newSet;
    });
  };

  const toggleProgress = (requestId: string) => {
    setExpandedProgress(prev => {
      const newSet = new Set(prev);
      if (newSet.has(requestId)) newSet.delete(requestId);
      else newSet.add(requestId);
      return newSet;
    });
  };

  const handleLoadBatchDetails = async (requestId: string) => {
    const scan = scanHistory.find(s => s.request_id === requestId);
    if (!scan || !scan.batch_id) {
      showMessage('Could not find batch to load.', 'error');
      return;
    }
  
    try {
      const details = await loadBatchDetails(apiBaseUrl, scan.batch_id);
      if (details && details.length > 0) {
        // ✅ FIX: Calculate total execution time from all results
        const totalExecutionTime = details.reduce((sum, result) => {
          return sum + (result.execution_time_seconds || 0);
        }, 0);
  
        // ✅ Update scan history with new data
        setScanHistory(prev => prev.map(s =>
          s.request_id === requestId
            ? {
                ...s,
                detailedResults: details,
                execution_time_seconds: totalExecutionTime  // ✅ ADD THIS
              }
            : s
        ));
      } else {
        showMessage('No details found for this batch.', 'warning');
      }
    } catch (error) {
      showMessage('Failed to load batch details.', 'error');
    }

    // ✅ FIX: Delay navigation until after state is committed
    setTimeout(() => {
      setViewingResultsFor(requestId);
    }, 0);
  };

  const calculateSecurityScore = (result: any) => {
    if (result.scan_status !== 'success') return 0;
  
    // Prioritize new PQC analysis
    if (result.raw_response?.pqc_analysis) {
      return result.raw_response.pqc_analysis.overall_score;
    }
  
    // Fallback to quantum_score
    if (result.quantum_score !== undefined) {
      return result.quantum_score;
    }
  
    // Original calculation as last resort
    let score = 0;
    if (result.tls_version?.includes('TLS 1.3')) score += 25;
    else if (result.tls_version?.includes('TLS 1.2')) score += 20;
    
    const keySize = result.public_key_size_bits || 0;
    if (keySize >= 4096) score += 20;
    else if (keySize >= 2048) score += 15;
    
    if (result.ephemeral_key_exchange) score += 15;
    if (result.ct_present) score += 10;
    
    return Math.max(0, Math.min(score, 100));
  };

  const getSecurityIndicator = (result: any) => {
    const grade = result.quantum_grade;
    if (!grade && result.raw_response?.pqc_analysis?.overall_grade) {
      return getGradeColor(result.raw_response.pqc_analysis.overall_grade);
    } else if (grade) {
      return getGradeColor(grade);
    } else {
      const score = calculateSecurityScore(result);
      if (score >= 80) return 'bg-success';
      if (score >= 60) return 'bg-warning';
      return 'bg-destructive';
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  // Check if viewing results - if yes, show detail page instead of history
  if (viewingResultsFor) {
    const scanToView = scanHistory.find(s => s.request_id === viewingResultsFor);
    if (scanToView) {
      return (
        <ResultsDetailPage
          scan={scanToView}
          onBack={() => setViewingResultsFor(null)}
        />
      );
    }
    // If scanToView is not found, fall back to the main view.
    // This can happen if history is cleared while viewing details.
  }
  
  // Otherwise show normal UI
  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ duration: 0.3 }}
      className="p-4 sm:p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 dark:bg-primary/30 rounded-lg">
            <Globe className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Web Scan</h1>
            <p className="text-muted-foreground">Scan your web assets for cryptographic vulnerabilities</p>
          </div>
        </div>
        <UnifiedBackButton onClick={onBack} label="Back" />
      </div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-success/10 dark:bg-success/30 text-success' :
            message.type === 'error' ? 'bg-destructive/10 dark:bg-destructive/30 text-destructive' :
            message.type === 'warning' ? 'bg-warning/10 dark:bg-warning/30 text-warning' :
            'bg-primary/10 dark:bg-primary/30 text-primary'
          }`}
        >
          {message.text}
        </motion.div>
      )}

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
          Scan History ({scanHistory.length})
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'scan' ? (
          <motion.div
            key="scan-tab"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="space-y-6"
          >
            <div className="grid md:grid-cols-2 gap-6 items-start">
              <UnifiedCard padding="default">
                <div className="mb-4">
                  <h3 className="font-semibold text-lg">Manually Enter Domains</h3>
                  <p className="text-muted-foreground text-sm">
                    Type or paste domains directly.
                  </p>
                </div>
                <textarea
                  id="urls"
                  value={urls}
                  onChange={(e) => setUrls(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { handleScanSubmit(e as any); } }}
                  placeholder="example.com&#10;google.com, github.com"
                  className="w-full p-3 border rounded-lg min-h-[150px] resize-y bg-background"
                  disabled={!!uploadedFile}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  Enter domains separated by <strong>commas</strong>, <strong>spaces</strong>, or <strong>new lines</strong>.
                </p>
              </UnifiedCard>

              <UnifiedCard padding="default">
                <UnifiedFileInput
                  label="Upload a .txt File"
                  accept=".txt"
                  helperText="File must be .txt, < 1MB. One URL per line. Lines starting with # are ignored."
                  selectedFile={uploadedFile}
                  onFileSelect={handleFileSelect}
                  onFileRemove={removeFile}
                  maxSize={1}
                  dragAndDrop={true}
                />
              </UnifiedCard>
            </div>
            <div className="mt-6">
                <Button
                  onClick={handleScanSubmit}
                  disabled={isScanning || (!urls && !uploadedFile)}
                  className="w-full sm:w-auto"
                >
                  <UnifiedActionLoading
                    isLoading={isScanning}
                    loadingText="Scanning..."
                    defaultText="Start Crypto Scan"
                    icon={<Play className="h-4 w-4 mr-2" />}
                  />
                </Button>            </div>
          </motion.div>
        ) : (
          <motion.div
            key="history-tab"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Scan History</h3>
              <Button 
                variant="outline" 
                onClick={async () => {
                  showMessage('Clearing all scan history...', 'info');
                  
                  try {
                    const success = await clearAllScans(apiBaseUrl);
                    
                    if (success) {
                      setScanHistory([]);
                      showMessage('All scan history deleted successfully', 'success');
                    } else {
                      showMessage('Failed to clear all scans', 'error');
                    }
                  } catch (error) {
                    console.error('Error during clear all:', error);
                    showMessage('Error clearing scan history', 'error');
                  }
                }}
                size="sm"
              >
                Clear All
              </Button>
            </div>

            {scanHistory.length === 0 ? (
              <UnifiedCard padding="spacious" className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">No scans found</p>
              </UnifiedCard>
            ) : (
              <div className="space-y-4">
                {scanHistory.map((scan) => {
                  const executionTime = (() => {
                    if (scan.detailedResults && scan.detailedResults.length > 0) {
                      const totalTime = scan.detailedResults.reduce((sum, result) => {
                        return sum + (result.execution_time_seconds || 0);
                      }, 0);
              
                      return totalTime > 0 
                        ? `${totalTime.toFixed(2)}s`
                        : 'N/A';
                    }
              
                    return scan.execution_time_seconds !== undefined
                      ? `${scan.execution_time_seconds.toFixed(2)}s`
                      : 'N/A';
                  })();

                  const deleteLogic = async () => {
                    const batchId = scan.batch_id || scan.request_id;
                    showMessage('Deleting scan batch...', 'info');
                    
                    const success = await deleteScanBatch(apiBaseUrl, batchId);
                    
                    if (success) {
                      setScanHistory(prev => 
                        prev.filter(s => s.request_id !== scan.request_id)
                      );
                      showMessage('Scan batch deleted successfully', 'success');
                    } else {
                      showMessage('Failed to delete scan batch', 'error');
                    }
                  };

                  return (
                    <UnifiedResultCard
                      key={scan.request_id}
                      title={`Request ID: ${scan.request_id}`}
                      description={new Date(scan.requested_at).toLocaleString()}
                      status={
                        scan.status === 'completed' ? 'success' :
                        scan.status === 'failed' || scan.error_message ? 'error' :
                        scan.status === 'processing' ? 'info' : 'warning'
                      }
                      statusLabel={scan.status.toUpperCase()}
                      icon={getStatusIcon(scan.status)}
                      metrics={[
                        { label: "URLs", value: scan.total_urls },
                        { label: "Execution Time", value: executionTime }
                      ]}
                      actions={[
                        ...(scan.status === 'processing' ? [{
                          label: expandedProgress.has(scan.request_id) ? 'Hide Progress' : 'View Progress',
                          icon: <Activity size={16} />,
                          onClick: () => toggleProgress(scan.request_id),
                          variant: "outline" as const
                        }] : []),
                        ...((scan.status === 'completed' || (scan.status === 'failed' && scan.detailedResults && scan.detailedResults.length > 0)) ? [{
                          label: "View Results",
                          icon: <Eye size={16} />,
                          onClick: () => handleLoadBatchDetails(scan.request_id),
                          variant: "outline" as const
                        }] : []),
                        {
                          label: "Delete",
                          icon: <Trash2 size={16} />,
                          onClick: deleteLogic,
                          variant: "destructive" as const
                        }
                      ]}
                    >
                      {/* PROGRESS DISPLAY */}
                      {scan.status === 'processing' && expandedProgress.has(scan.request_id) && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-4 col-span-full"
                        >
                          <ProgressDisplay 
                            scanProgress={scanProgress} 
                            domainProgress={domainProgress}
                            processingDomains={processingDomains}
                            onCancel={handleCancelScan}
                            roundHistory={roundHistory}
                            isCancelling={isCancelling}
                            currentRound={currentRound}
                            isActiveProgress={true}
                          />
                        </motion.div>
                      )}

                      {/* SUMMARY DISPLAY */}
                      {(scan.status === 'completed' || scan.status === 'failed') && 
                        expandedSummary.has(scan.request_id) && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-4 col-span-full border-t pt-4"
                          >
                            <ProgressDisplay 
                                scanProgress={{ 
                                total: scan.total_urls, 
                                completed: scan.total_urls 
                                }}
                                domainProgress={(() => {
                                const progress: {[key: string]: DomainProgressInfo} = {};
                                
                                scan.detailedResults?.forEach((result) => {
                                    const domain = result.url;
                                    
                                    const scanStatus = result.scan_status?.toLowerCase();
                                    let status = 'failed';
                                    if (scanStatus === 'success' || scanStatus === 'completed') {
                                    status = 'completed';
                                    } else if (scanStatus === 'http_skipped') {
                                    status = 'http_skipped';
                                    }
                                    
                                    progress[domain] = {
                                    status: status,
                                    duration: result.execution_time_seconds,
                                    error: result.error_message,
                                    round: (result as any).round || 1
                                    };
                                });
                                
                                return progress;
                                })()}
                                processingDomains={{}}
                                roundHistory={[]}
                                isActiveProgress={false}
                            />
                          </motion.div>
                        )}
                    </UnifiedResultCard>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default WebScan;