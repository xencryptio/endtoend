import React, { useState, useEffect, useRef } from "react";
import { connectSSEWithPost } from "@/lib/scanApi";
// Helper to fetch onboarding org/suborg/app/domain hierarchy
const fetchOnboardingDomains = async () => {
  const DB_API_BASE = (import.meta.env.VITE_DB_API_URL as string | undefined) || 'http://localhost:8001';
  const base = DB_API_BASE.replace(/\/$/, '');
  const orgsRes = await fetch(`${base}/organizations`);
  if (!orgsRes.ok) return [];

  const orgs = await orgsRes.json();
  const result = [] as any[];

  for (const org of orgs) {
    const orgDomainsRes = await fetch(`${base}/organizations/${org.id}/domains`);
    const orgDomains = orgDomainsRes.ok ? await orgDomainsRes.json() : [];

    const suborgsRes = await fetch(`${base}/organizations/${org.id}/suborganizations`);
    const suborgs = suborgsRes.ok ? await suborgsRes.json() : [];

    const suborgList = [] as any[];
    for (const suborg of suborgs) {
      const suborgDomainsRes = await fetch(`${base}/suborganizations/${suborg.id}/domains`);
      const suborgDomains = suborgDomainsRes.ok ? await suborgDomainsRes.json() : [];

      const appsRes = await fetch(`${base}/suborganizations/${suborg.id}/applications`);
      const apps = appsRes.ok ? await appsRes.json() : [];

      const appList = [] as any[];
      for (const app of apps) {
        const appDomainsRes = await fetch(`${base}/applications/${app.id}/domains`);
        const appDomains = appDomainsRes.ok ? await appDomainsRes.json() : [];
        appList.push({ ...app, domains: appDomains });
      }

      suborgList.push({ ...suborg, domains: suborgDomains, applications: appList });
    }

    result.push({ ...org, domains: orgDomains, suborgs: suborgList });
  }

  return result;
};
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AlertTriangle,ArrowLeft, ArrowRight, Globe, RefreshCw, Play, Edit, Save, RotateCcw, Plus, Check, X, Shield, Lock, Hash, Key, Zap, Trash2, Activity, FileText, Eye, Loader2 } from "lucide-react";
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
import { apiFetch } from '@/lib/api';
import { ELK_API_URL } from '@/api/elkClient';

// ============================================================================
// TYPE DEFINITIONS (Single Source of Truth)
// ============================================================================

/**
 * Canonical status type for scan results.
 * This is the SINGLE SOURCE OF TRUTH for scan_status values.
 */
export type ScanStatus = 'completed' | 'failed' | 'pending' | 'http_skipped';

/**
 * Normalize any status string to the canonical ScanStatus type.
 * Handles backend returning different formats and maps them to our strict union.
 */
const normalizeScanStatus = (result: any): ScanStatus => {
  const s = (result.scan_status || result.status || '').toLowerCase();
  if (s === 'completed') return 'completed';
  if (s === 'failed') return 'failed';
  if (s === 'http_skipped') return 'http_skipped';
  // ELK states: submitted → pending, in_progress → pending
  if (s === 'pending' || s === 'submitted' || s === 'in_progress' || s === 'processing') return 'pending';
  return 'failed';
};

/** Map ELK/API status to the ScanResult.status union type. */
const mapToScanResultStatus = (s: string): 'pending' | 'processing' | 'completed' | 'failed' => {
  const l = (s || '').toLowerCase();
  if (l === 'completed') return 'completed';
  if (l === 'failed') return 'failed';
  if (l === 'in_progress' || l === 'processing') return 'processing';
  return 'pending'; // submitted, pending, unknown
};

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

interface WebScanProps {
  onBack: () => void;
  apiBaseUrl: string;
  autoLoadDomain?: string;
  autoScanUrl?: string;
  initialTab?: 'scan' | 'history';
}

interface ScanResult {
  request_id: string;
  id?: number;
  primary_domain?: string;
  domain_list?: string[];
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requested_at: string;
  total_urls: number;
  execution_time_seconds?: number;
  scan_status?: ScanStatus;
  
  // Progress fields
  progressPercentage?: number;
  completedUrls?: number;
  successful_count?: number;
  failed_count?: number;
  
  // ... rest of existing fields
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

const deleteScanResult = async (apiBaseUrl: string, resultId: number): Promise<boolean> => {
  try {
    const normalizedBaseUrl = apiBaseUrl.replace(/\/$/, '');
    
    const deleteUrl = `${normalizedBaseUrl}/scans/result/${resultId}`;
    console.log('🗑️ Attempting to delete result at:', deleteUrl);
    
    const response = await apiFetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    
    if (response) {
      console.log('✅ Result deleted successfully:', response);
      return true;
    } else {
      console.error('❌ Delete failed with status');
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
    
    const response = await apiFetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    
    if (response) {
      console.log('✅ All data cleared successfully:', response);
      return true;
    } else {
      console.error('❌ Clear all failed with status');
      return false;
    }
  } catch (error) {
    console.error('❌ Error clearing all scans:', error);
    return false;
  }
};

const loadHistoricalScans = async (apiBaseUrl: string) => {
  try {
    // Call the scan-service which proxies to db-service - now uses single scan results
    const normalizedBaseUrl = apiBaseUrl.replace(/\/$/, '');
    console.log(`🔄 Fetching scan results from: ${normalizedBaseUrl}/results`);
    
    const response = await apiFetch(`${normalizedBaseUrl}/results`);
    console.log(`✅ Response received:`, response);
    
    // Handle both array and object with 'results' key
    const results = Array.isArray(response) ? response : (response.results || []);
    console.log(`📊 Loaded ${results.length} scan results from database`);
    
    // Convert results to ScanResult format (each is now independent)
    const convertedResults = results.map((result: any): ScanResult => {
      const normalizedStatus = normalizeScanStatus(result);
      
      return {
        request_id: result.request_id || `scan_${result.id}`,
        id: result.id,
        url: result.url || 'Unknown URL',
        primary_domain: result.url,
        domain_list: [result.url].filter(Boolean),
        status: mapToScanResultStatus(result.status || result.scan_status || ''),
        requested_at: result.created_at || result.requested_at,
        total_urls: 1, // Each result is a single URL
        execution_time_seconds: result.execution_time_seconds || 0,
        scan_status: normalizedStatus,
        successful_count: normalizedStatus === 'completed' ? 1 : 0,
        failed_count: normalizedStatus === 'failed' || normalizedStatus === 'http_skipped' ? 1 : 0,
        error_message: result.error_message,
        tls_version: result.tls_version,
        public_key_size_bits: result.public_key_size_bits,
        public_key_algorithm: result.public_key_algorithm,
        cert_subject: result.cert_subject,
        cert_issuer: result.cert_issuer,
        cert_not_before: result.cert_not_before,
        cert_not_after: result.cert_not_after,
        cipher_suite_name: result.cipher_suite_name,
        pqc_analysis: result.pqc_analysis || result.raw_response?.pqc_analysis,
        raw_response: result.raw_response,
        finalDomainProgress: {}
      };
    });
    
    console.log(`✅ Converted ${convertedResults.length} scans for display`);
    return convertedResults;
  } catch (error) {
    console.error('❌ Error loading historical scans from database:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return [];
  }
};

// Load details for a specific scan result by ID
const loadScanDetails = async (apiBaseUrl: string, resultId: number): Promise<ScanResult | null> => {
  try {
    const normalizedBaseUrl = apiBaseUrl.replace(/\/$/, '');
    const response = await apiFetch(`${normalizedBaseUrl}/results/${resultId}`);
    
    if (!response) {
      console.warn(`No result found for ID ${resultId}`);
      return null;
    }
    
    const normalizedStatus = normalizeScanStatus(response);
    
    return {
      ...response,
      request_id: response.request_id || `scan_${response.id}`,
      scan_status: normalizedStatus,
      domain_list: [response.url].filter(Boolean),
      total_urls: 1,
      execution_time_seconds: response.execution_time_seconds ?? 0
    };
  } catch (error) {
    console.error('Error loading scan details:', error);
    return null;
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed': 
      return <div className="h-2 w-2 bg-success rounded-full" />;
    case 'failed': 
      return <div className="h-2 w-2 bg-destructive rounded-full" />;
    case 'processing': 
      return (
        <div className="relative h-2 w-2">
          <div className="absolute h-2 w-2 bg-primary rounded-full animate-ping" />
          <div className="absolute h-2 w-2 bg-primary rounded-full" />
        </div>
      );
    case 'pending':
      return <div className="h-2 w-2 bg-warning rounded-full animate-pulse" />;
    default: 
      return <div className="h-2 w-2 bg-muted-foreground rounded-full" />;
  }
};

// ============================================================================
// MAIN WEBSCAN COMPONENT
// ============================================================================

const WebScan: React.FC<WebScanProps> = ({ onBack, apiBaseUrl, autoLoadDomain, autoScanUrl, initialTab }) => {
  const [activeTab, setActiveTab] = useState<'scan' | 'history' | 'onboarded'>(initialTab || 'scan');
  const [urls, setUrls] = useState('');
  const [activeScanCount, setActiveScanCount] = useState(0); // ✅ Track number of active scans
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
  const [expandedProgress, setExpandedProgress] = useState<Set<string>>(new Set());
  const [roundHistory, setRoundHistory] = useState<RoundInfo[]>([]);
  const [currentRound, setCurrentRound] = useState(1);const [viewingResultsFor, setViewingResultsFor] = useState<string | null>(null);
  const [expandedDomainUrl, setExpandedDomainUrl] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);

  // History table state
  const [histPage, setHistPage] = useState(1);
  const HIST_PAGE_SIZE = 10;
  const [histFilter, setHistFilter] = useState<'all' | 'completed' | 'in_progress' | 'submitted' | 'failed'>('all');
  const [histSearch, setHistSearch] = useState('');

  // ✅ NEW: Track live SSE progress separately from database
  const [liveProgress, setLiveProgress] = useState<{[key: string]: {
    percentage: number;
    completed: number;
    total: number;
    current_phase?: string;
    current_domain?: string;
    eta_seconds?: number;
  }}> ({});

  // ✅ NEW: Track active SSE connections
  const [activeSSEConnections, setActiveSSEConnections] = useState<Set<string>>(new Set());

  // Add these new state variables at the top of the component (around line 300)
  const [pollingBatches, setPollingBatches] = useState<Set<string>>(new Set());
  const pollingIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // ✅ NEW FUNCTION: Poll a specific batch for status updates
  const startPollingBatch = (batchId: string) => {
    // ✅ Skip if temporary ID
    if (batchId.startsWith('temp_')) {
      console.warn(`⚠️ Skipping poll for temporary ID: ${batchId}`);
      return;
    }
    
    // ✅ CRITICAL: Don't poll if SSE is active
    if (activeSSEConnections.has(batchId)) {
      console.log(`⏸️ SSE active for ${batchId}, skipping polling`);
      return;
    }
    
    // ✅ Don't start duplicate polling
    if (pollingBatches.has(batchId)) {
      console.log(`Already polling ${batchId}`);
      return;
    }

    console.log(`🔄 Starting polling for batch ${batchId}`);
    setPollingBatches(prev => new Set(prev).add(batchId));

    const pollInterval = setInterval(async () => {
      try {
        // ✅ CRITICAL: Stop polling if SSE became active
        if (activeSSEConnections.has(batchId)) {
          console.log(`🛑 SSE became active for ${batchId}, stopping polling`);
          stopPollingBatch(batchId);
          return;
        }
        
        console.log(`📡 Polling scan ${batchId}...`);
        // Poll for scan status - use results endpoint for single-scan architecture
        const response = await apiFetch(`${apiBaseUrl}/results`);
        const results = Array.isArray(response) ? response : (response.results || []);
        const matchingResult = results.find((r: any) => r.request_id === batchId);
        
        if (!matchingResult) {
          console.log(`No matching result found for ${batchId}`);
          return;
        }
        
        // Update scan history with latest status
        setScanHistory(prev => prev.map(scan => {
          if (scan.request_id === batchId) {
            const newStatus = mapToScanResultStatus(matchingResult.status || matchingResult.scan_status || '');
            return {
              ...scan,
              status: newStatus,
              scan_status: normalizeScanStatus({ status: matchingResult.status }),
              total_urls: 1,
              successful_count: newStatus === 'completed' ? 1 : 0,
              failed_count: newStatus === 'failed' ? 1 : 0,
              execution_time_seconds: matchingResult.execution_time_seconds || scan.execution_time_seconds,
              completedUrls: newStatus === 'completed' ? 1 : 0
            };
          }
          return scan;
        }));

        // ✅ STOP POLLING IF SCAN IS COMPLETE OR FAILED
        const finalStatus = (matchingResult.status || matchingResult.scan_status || '').toLowerCase();
        if (finalStatus === 'completed' || finalStatus === 'failed') {
          console.log(`✅ Scan ${batchId} finished with status: ${finalStatus}`);
          stopPollingBatch(batchId);
        }
      } catch (error) {
        console.error(`❌ Error polling scan ${batchId}:`, error);
        // Don't stop polling on error - backend might be temporarily unavailable
      }
    }, 3000); // Poll every 3 seconds

    pollingIntervalsRef.current.set(batchId, pollInterval);
  };

  // ✅ NEW FUNCTION: Stop polling a scan
  const stopPollingBatch = (batchId: string) => {
    const interval = pollingIntervalsRef.current.get(batchId);
    if (interval) {
      clearInterval(interval);
      pollingIntervalsRef.current.delete(batchId);
    }
    setPollingBatches(prev => {
      const newSet = new Set(prev);
      newSet.delete(batchId);
      return newSet;
    });
    console.log(`⏹️ Stopped polling batch ${batchId}`);
  };

  // ✅ Clean up SSE connections on unmount
  useEffect(() => {
    return () => {
      // Clear all live progress
      setLiveProgress({});
      setActiveSSEConnections(new Set());
      
      // Stop all polling
      pollingIntervalsRef.current.forEach(interval => clearInterval(interval));
      pollingIntervalsRef.current.clear();
    };
  }, []);

  // ✅ AUTO-START POLLING FOR PENDING/PROCESSING SCANS ON LOAD
  useEffect(() => {
    const processingScans = scanHistory.filter(scan => 
      scan.status === 'pending' || scan.status === 'processing'
    );

    processingScans.forEach(scan => {
      const requestId = scan.request_id;
      if (requestId && !pollingBatches.has(requestId)) {
        startPollingBatch(requestId);
      }
    });
  }, [scanHistory.length]); // Only run when number of scans changes


  // ✅ Progress calculation for scan
  const getProgressForScan = (requestId: string, scan: ScanResult) => {
    // ✅ 1. If SSE is active, use live progress
    if (liveProgress[requestId]) {
      return {
        percentage: liveProgress[requestId].percentage,
        completed: liveProgress[requestId].completed,
        current_phase: liveProgress[requestId].current_phase,
        current_domain: liveProgress[requestId].current_domain,
        eta_seconds: liveProgress[requestId].eta_seconds
      };
    }
    
    // ✅ 2. Fallback to database polling
    if (scan.progressPercentage !== undefined) {
      return {
        percentage: scan.progressPercentage,
        completed: scan.completedUrls || 0,
        current_phase: undefined,
        current_domain: undefined,
        eta_seconds: undefined
      };
    }
    
    // ✅ 3. Default to 0
    return {
      percentage: 0,
      completed: 0,
      current_phase: undefined,
      current_domain: undefined,
      eta_seconds: undefined
    };
  };

// ✅ NEW: Update live progress from SSE
const updateLiveProgress = (batchId: string, data: any) => {
  setLiveProgress(prev => ({
    ...prev,
    [batchId]: {
      percentage: data.percentage || 0,
      completed: data.completed || 0,
      total: data.total || 0,
      current_phase: data.current_phase,
      current_domain: data.current_domain,
      eta_seconds: data.eta_seconds
    }
  }));
  
  // ✅ Mark SSE as active
  setActiveSSEConnections(prev => new Set(prev).add(batchId));
};

// ✅ NEW: Clear live progress when SSE ends
const clearLiveProgress = (batchId: string) => {
  setLiveProgress(prev => {
    const newProgress = { ...prev };
    delete newProgress[batchId];
    return newProgress;
  });
  
  setActiveSSEConnections(prev => {
    const newSet = new Set(prev);
    newSet.delete(batchId);
    return newSet;
  });
};


  // Load historical scans on component mount from the API
  useEffect(() => {
    const initializeScans = async () => {
      console.log('🚀 WebScan component mounted, loading scan history from database...');
      const historicalScans = await loadHistoricalScans(apiBaseUrl);
      console.log(`📈 loadHistoricalScans returned ${historicalScans.length} scans`);
      if (historicalScans && historicalScans.length > 0) {
        console.log(`✅ Setting scan history with ${historicalScans.length} scans`);
        console.log('Scans:', historicalScans);
        setScanHistory(historicalScans);
      } else {
        console.log('⚠️ No scans found in database, setting empty array');
        setScanHistory([]);
      }

      // Auto-trigger a new scan if requested via prop
      if (autoScanUrl) {
        const dummyEvent = { preventDefault: () => {} } as React.FormEvent;
        handleScanSubmit(dummyEvent, autoScanUrl);
      }
    };
    
    initializeScans();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBaseUrl]);

  // Auto-load domain scan results if navigated from Applications page
  useEffect(() => {
    if (autoLoadDomain && scanHistory.length > 0 && !hasAutoLoaded) {
      console.log('🔍 Auto-loading results for domain:', autoLoadDomain);
      console.log('📊 Available scan history:', scanHistory);
      
      // Find the most recent completed scan that includes this domain
      const domainLower = autoLoadDomain.toLowerCase();
      
      // First, check scans that already have detailed results loaded
      let matchingScan = scanHistory.find(scan => {
        if (scan.detailedResults && scan.detailedResults.length > 0) {
          const hasMatch = scan.detailedResults.some(result => 
            result.url?.toLowerCase().includes(domainLower)
          );
          if (hasMatch) {
            console.log('✅ Found scan with loaded details:', scan.request_id);
          }
          return hasMatch;
        }
        return false;
      });

      // If not found, check completed scans directly (single-scan architecture)
      if (!matchingScan) {
        console.log('📥 Searching completed scans for domain...');

        // Sort completed scans by newest first
        const completedScans = scanHistory
          .filter(scan => scan.status === 'completed')
          .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());

        // In single-scan architecture, each scan has its own URL
        const foundScan = completedScans.find(scan => 
          scan.url?.toLowerCase().includes(domainLower)
        );

        if (foundScan) {
          console.log('✅ Found matching domain in scan:', foundScan.request_id);
          setHasAutoLoaded(true);
          setViewingResultsFor(foundScan.request_id);
          return;
        }
        
        console.log('⚠️ No completed scans contained the target domain');
        return;
      }

      if (matchingScan && matchingScan.status === 'completed') {
        console.log('✅ Found matching scan:', matchingScan.request_id);
        setHasAutoLoaded(true);
        
        // Show results immediately since details are already loaded
        console.log('📊 Showing detailed results');
        setTimeout(() => {
          setViewingResultsFor(matchingScan.request_id);
        }, 100);
      } else {
        console.log('⚠️ No matching completed scan found for domain:', autoLoadDomain);
      }
    }
  }, [autoLoadDomain, scanHistory, hasAutoLoaded]);

  

  const showMessage = (text: string, type: 'success' | 'error' | 'info' | 'warning') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleCancelScan = async () => {
    if (!currentRequestId) return;
    
    setIsCancelling(true);
    try {
      await apiFetch(`${apiBaseUrl}/cancel-scan/${currentRequestId}`, {
        method: 'POST'
      });
      showMessage('Cancelling scan...', 'warning');
    } catch (error) {
      showMessage('Failed to cancel scan', 'error');
    }
  };

  const retryScan = async (scan: ScanResult) => {
    // Determine domain to retry
    const domain = scan.url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || '';
    if (!domain) {
      showMessage('Cannot retry: no domain found', 'error');
      return;
    }

    // Delete the old stuck record from ELK first
    if (scan.request_id && !scan.request_id.startsWith('temp_')) {
      try {
        await apiFetch(`${ELK_API_URL}/api/elk/scan-by-request/${scan.request_id}`, { method: 'DELETE' });
        setScanHistory(prev => prev.filter(s => s.request_id !== scan.request_id));
      } catch { /* ignore delete errors */ }
    }

    // Re-use the same SSE submit path so progress is tracked properly
    const dummyEvent = { preventDefault: () => {} } as React.FormEvent;
    handleScanSubmit(dummyEvent, domain);
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

  // Handle tab visibility change - reload history when user switches back
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && activeTab === 'history') {
        console.log('📟 Page became visible, reloading scan history from database...');
        const loadLatest = async () => {
          const historicalScans = await loadHistoricalScans(apiBaseUrl);
          if (historicalScans && historicalScans.length > 0) {
            setScanHistory(historicalScans);
          }
        };
        loadLatest();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [apiBaseUrl, activeTab]);

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

  // ============================================================================
  // NEW QUEUE-BASED SCANNING (Database is source of truth)
  // ============================================================================
  
  // ✅ NEW: Reset stuck scan counter
  const resetScanCounter = () => {
    setActiveScanCount(0);
    showMessage('Ready for new scan', 'info');
  };

  const handleScanSubmit = async (e: React.FormEvent, directUrl?: string) => {
    e.preventDefault();
    
    // ✅ ALLOW CONCURRENT SCANS - multiple scans can run at the same time
    
    const sourceUrls = directUrl || urls;
    const urlList = sourceUrls
      .split(/[\n,\s]+/)
      .map(u => u.trim())
      .filter(u => u !== '');

    if (urlList.length === 0) {
      showMessage('Please enter at least one URL', 'error');
      return;
    }

    // ✅ INCREMENT active scan count
    setActiveScanCount(prev => prev + 1);
    // ✅ IMMEDIATELY RESET to normal state
    setActiveScanCount(0);
    setUrls('');
    showMessage(`Starting scan for ${urlList.length} URL(s)...`, 'info');

    // ✅ CRITICAL: Create optimistic entry BEFORE SSE
    const tempRequestId = `temp_${Date.now()}`;
    const optimisticScan: ScanResult = {
      request_id: tempRequestId,
      url: urlList.length === 1 ? urlList[0] : `Scanning ${urlList.length} domains`,
      primary_domain: urlList[0],
      domain_list: urlList,
      status: 'processing',  // ✅ Set to processing immediately
      scan_status: 'pending',
      requested_at: new Date().toISOString(),
      total_urls: urlList.length,
      execution_time_seconds: 0,
      progressPercentage: 0,  // ✅ Start at 0%
      completedUrls: 0,
      successful_count: 0, // Initialize
      failed_count: 0,     // Initialize
      detailedResults: []
    };

    setScanHistory(prev => [optimisticScan, ...prev]);
    // ✅ DO NOT redirect - user can navigate manually if they want

    try {
      // ✅ CRITICAL: Use SSE endpoint instead of blocking POST
      await connectSSEWithPost(
        apiBaseUrl,
        urlList.join(','),
        true,  // save_to_db
        
        // ✅ ON START: Update with real request_id
        (realRequestId: string) => {
          console.log('🆔 Received real request ID:', realRequestId);
          setScanHistory(prev => prev.map(scan =>
            scan.request_id === tempRequestId
              ? { ...scan, request_id: realRequestId }
              : scan
          ));
          setCurrentRequestId(realRequestId);
        },
        
        // ✅ ON PROGRESS: Update live progress
        (data: any) => {
          console.log('📊 Progress update:', data);
          
          if (data.type === 'progress_snapshot') {
            const requestId = data.request_id || currentRequestId || tempRequestId;
            
            // ✅ CRITICAL: Update live progress state
            updateLiveProgress(requestId, data);
            
            // ✅ Also update scan history for persistence
            setScanHistory(prev => prev.map(scan => {
              if (scan.request_id === requestId || scan.request_id === tempRequestId) {
                return {
                  ...scan,
                  progressPercentage: data.percentage || 0,
                  completedUrls: data.completed || 0,
                  total_urls: data.total || scan.total_urls,
                  status: 'processing'
                };
              }
              return scan;
            }));
          }
          
          // ✅ Update domain-level progress
          if (data.type === 'domain_complete') {
            setDomainProgress(prev => ({
              ...prev,
              [data.domain]: {
                status: data.status,
                duration: data.duration,
                round: data.round
              }
            }));
          }
        },
        
        // ✅ ON COMPLETE: Load final results from database
        async (data: any) => {
          console.log('✅ Scan complete:', data);
          setIsCancelling(false);
          setCurrentRequestId(null);
          
          const requestId = data.request_id || currentRequestId || tempRequestId;
          
          // ✅ CRITICAL: Clear live progress
          clearLiveProgress(requestId);
          
          // ✅ Reload results from database to get final saved data
          try {
            const historicalScans = await loadHistoricalScans(apiBaseUrl);
            
            if (historicalScans && historicalScans.length > 0) {
              // Replace entire history with DB data (source of truth)
              setScanHistory(historicalScans);
              showMessage('✅ Scan completed successfully!', 'success');
            } else {
              // DB returned nothing — save failed on the backend.
              // Remove the optimistic entry so the user isn't confused by a
              // "completed" entry with no data that opens a blank detail page.
              setScanHistory(prev => prev.filter(s =>
                s.request_id !== requestId && s.request_id !== tempRequestId
              ));
              showMessage(
                '⚠️ Scan finished but results were not saved. Check that db-service is running and migrations applied (docker compose down -v && docker compose up --build).',
                'warning'
              );
            }
          } catch (error) {
            console.error('Failed to load results:', error);
            // Don't leave a broken optimistic entry in the list
            setScanHistory(prev => prev.filter(s =>
              s.request_id !== requestId && s.request_id !== tempRequestId
            ));
            showMessage('Scan completed but failed to load results from database', 'warning');
          }
        },
        
        // ✅ ON ERROR: Handle failures
        (error: string) => {
          console.error('❌ Scan failed:', error);
          setIsCancelling(false);
          setCurrentRequestId(null);
          
          setScanHistory(prev => prev.filter(s => !s.request_id.startsWith('temp_')));
          showMessage(`Scan failed: ${error}`, 'error');
        }
      );
    } catch (error) {
      console.error('❌ SSE connection failed:', error);
      setScanHistory(prev => prev.filter(s => !s.request_id.startsWith('temp_')));
      showMessage('Failed to connect to scan service', 'error');
    }
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

  // Handle viewing scan details (for single scan architecture)
  const handleViewScanDetails = async (requestId: string) => {
    const scan = scanHistory.find(s => s.request_id === requestId);
    if (!scan) {
      showMessage('Could not find scan to view.', 'error');
      return;
    }

    try {
      console.log(`Loading scan details for ${requestId}...`);

      // If the scan entry has no raw_response, the DB save may have failed or
      // we only have the optimistic entry. Attempt to fetch the real record by
      // numeric id from the DB before opening the detail view.
      if (!scan.raw_response && scan.id) {
        console.log(`⚠️ scan.raw_response is missing for ${requestId}, fetching from DB by id ${scan.id}...`);
        const fullScan = await loadScanDetails(apiBaseUrl, scan.id);
        if (fullScan && fullScan.raw_response) {
          // Merge the DB record into history and open detail page
          setScanHistory(prev => prev.map(s =>
            s.request_id === requestId ? { ...s, ...fullScan, request_id: requestId } : s
          ));
          setViewingResultsFor(requestId);
          return;
        }

        // Still no data — the result was never saved to the DB
        showMessage(
          'Scan result was not saved to the database. Please rebuild and try again, or check service logs.',
          'error'
        );
        return;
      }

      // For single scan architecture, the scan itself has all the details
      setViewingResultsFor(requestId);
    } catch (error) {
      console.error('Error loading scan details:', error);
      showMessage('Failed to load scan details: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
    }
  };

  const calculateSecurityScore = (result: any) => {
    if (result.scan_status !== 'completed') return 0;
  
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

  // Onboarding domains state
  const [onboardingDomains, setOnboardingDomains] = useState<any[]>([]);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  useEffect(() => {
    setOnboardingLoading(true);
    fetchOnboardingDomains()
      .then(setOnboardingDomains)
      .finally(() => setOnboardingLoading(false));
  }, []);

  // Scan handler for onboarding domain
  const handleOnboardingDomainScan = (domain: string) => {
    setUrls(domain); // Update textarea for visibility
    // ✅ FIX: Pass domain directly to avoid state race condition
    const dummyEvent = { preventDefault: () => {} } as React.FormEvent;
    handleScanSubmit(dummyEvent, domain);
  };

  // Check if viewing results - if yes, show detail page instead of history
  if (viewingResultsFor) {
    const scanToView = scanHistory.find(s => s.request_id === viewingResultsFor);
    if (scanToView) {
      return (
        <ResultsDetailPage
          scan={scanToView}
          onBack={() => {
            setViewingResultsFor(null);
            setExpandedDomainUrl(null);
          }}
          targetDomain={autoLoadDomain || expandedDomainUrl || undefined}
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
        <div className="flex items-center gap-2">
          <UnifiedBackButton onClick={onBack} label="Back" />
        </div>
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
        <button
          onClick={() => setActiveTab('onboarded')}
          className={`px-6 py-3 border-b-2 transition-colors ${
            activeTab === 'onboarded'
              ? 'border-primary text-primary'
              : 'border-transparent hover:text-primary'
          }`}
        >
          Onboarded Domains
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'scan' && (
          <motion.div
            key="scan-tab"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <UnifiedCard variant="premium" padding="spacious" className="mb-12">
              <div className="mb-6 pb-5 border-b">
                <h2 className="text-2xl font-bold tracking-tight">TLS/SSL Crypto Scan</h2>
                <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                  Analyze domains for TLS configuration, cryptographic algorithms, and PQC readiness
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6 items-start mb-6">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5 uppercase tracking-wider" htmlFor="urls">
                    Domain Input
                  </label>
                  <textarea
                    id="urls"
                    value={urls}
                    onChange={(e) => setUrls(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { handleScanSubmit(e as any); } }}
                    placeholder="example.com&#10;google.com, github.com"
                    className="w-full p-3 border rounded-lg min-h-[150px] resize-y bg-background"
                    disabled={!!uploadedFile}
                  />
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    Enter domains separated by <strong>commas</strong>, <strong>spaces</strong>, or <strong>new lines</strong>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5 uppercase tracking-wider">
                    Upload File
                  </label>
                  <UnifiedFileInput
                    label=""
                    accept=".txt"
                    helperText="File must be .txt, < 1MB. One URL per line. Lines starting with # are ignored."
                    selectedFile={uploadedFile}
                    onFileSelect={handleFileSelect}
                    onFileRemove={removeFile}
                    maxSize={1}
                    dragAndDrop={true}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleScanSubmit}
                  disabled={!urls && !uploadedFile}
                  size="lg"
                  className="w-full"
                >
                  <UnifiedActionLoading
                    isLoading={false}
                    loadingText="Submitting Scan..."
                    defaultText="Start Crypto Scan"
                    icon={<Shield className="w-5 h-5 mr-2" />}
                  />
                </Button>
              </div>
            </UnifiedCard>
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div
            key="history-tab"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="space-y-4"
          >
            {/* Header + controls */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <h3 className="text-lg font-semibold">Scan History</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{scanHistory.length} scans in Elasticsearch</p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {/* Search */}
                <input
                  type="text"
                  placeholder="Search domain…"
                  value={histSearch}
                  onChange={e => { setHistSearch(e.target.value); setHistPage(1); }}
                  className="h-8 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring w-44"
                />
                {/* Status filter */}
                <select
                  value={histFilter}
                  onChange={e => { setHistFilter(e.target.value as any); setHistPage(1); }}
                  className="h-8 px-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="all">All statuses</option>
                  <option value="completed">Completed</option>
                  <option value="in_progress">In Progress</option>
                  <option value="submitted">Submitted</option>
                  <option value="failed">Failed</option>
                </select>
                {/* Refresh */}
                <Button variant="outline" size="sm" onClick={async () => {
                  showMessage('Refreshing…', 'info');
                  const h = await loadHistoricalScans(apiBaseUrl);
                  if (h.length > 0) { setScanHistory(h); showMessage('Refreshed', 'success'); }
                  else showMessage('No scans found', 'info');
                }}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
                </Button>
                {/* Clear all */}
                <Button variant="outline" size="sm" onClick={async () => {
                  if (!confirm('Delete ALL scan history from Elasticsearch? This cannot be undone.')) return;
                  showMessage('Clearing…', 'info');
                  try {
                    await apiFetch(`${ELK_API_URL}/api/elk/scans/clear-all`, { method: 'DELETE' });
                    setScanHistory([]);
                    showMessage('All scan history deleted', 'success');
                  } catch { showMessage('Failed to clear history', 'error'); }
                }}>
                  Clear All
                </Button>
              </div>
            </div>

            {/* Table */}
            {(() => {
              // Filter + search
              const filtered = scanHistory.filter(s => {
                const matchSearch = !histSearch || (s.url || '').toLowerCase().includes(histSearch.toLowerCase());
                const rawStatus = (s.status || s.scan_status || '').toLowerCase();
                const elkStatus = rawStatus === 'processing' ? 'in_progress' : rawStatus;
                const matchFilter = histFilter === 'all' || elkStatus === histFilter;
                return matchSearch && matchFilter;
              });

              const totalPages = Math.max(1, Math.ceil(filtered.length / HIST_PAGE_SIZE));
              const safePage = Math.min(histPage, totalPages);
              const pageItems = filtered.slice((safePage - 1) * HIST_PAGE_SIZE, safePage * HIST_PAGE_SIZE);

              const gradeBadge = (grade?: string) => {
                if (!grade || grade === 'N/A') return <span className="text-muted-foreground text-xs">—</span>;
                const colors: Record<string, string> = {
                  'A+': 'bg-emerald-500/15 text-emerald-600 border-emerald-200',
                  A: 'bg-emerald-500/15 text-emerald-600 border-emerald-200',
                  B: 'bg-blue-500/15 text-blue-600 border-blue-200',
                  C: 'bg-amber-500/15 text-amber-600 border-amber-200',
                  D: 'bg-orange-500/15 text-orange-600 border-orange-200',
                  F: 'bg-red-500/15 text-red-600 border-red-200',
                };
                const cls = colors[grade.toUpperCase()] || colors.F;
                return <span className={`text-xs font-bold px-2 py-0.5 rounded border ${cls}`}>{grade}</span>;
              };

              const statusBadge = (scan: typeof scanHistory[0]) => {
                const raw = (scan.status || scan.scan_status || '').toLowerCase();
                const s = raw === 'processing' ? 'in_progress' : raw;
                const cfg: Record<string, { label: string; cls: string; dot: string }> = {
                  completed:   { label: 'Completed',   cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-200', dot: 'bg-emerald-500' },
                  in_progress: { label: 'In Progress', cls: 'bg-blue-500/10 text-blue-600 border-blue-200',         dot: 'bg-blue-500 animate-pulse' },
                  submitted:   { label: 'Submitted',   cls: 'bg-slate-500/10 text-slate-600 border-slate-200',      dot: 'bg-slate-400' },
                  pending:     { label: 'Submitted',   cls: 'bg-slate-500/10 text-slate-600 border-slate-200',      dot: 'bg-slate-400' },
                  failed:      { label: 'Failed',      cls: 'bg-red-500/10 text-red-600 border-red-200',            dot: 'bg-red-500' },
                };
                const { label, cls, dot } = cfg[s] || { label: s.toUpperCase(), cls: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' };
                return (
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded border ${cls}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                    {label}
                  </span>
                );
              };

              if (filtered.length === 0) {
                return (
                  <UnifiedCard padding="spacious" className="flex items-center justify-center py-12">
                    <p className="text-muted-foreground text-sm">
                      {histSearch || histFilter !== 'all' ? 'No scans match the current filter.' : 'No scans found.'}
                    </p>
                  </UnifiedCard>
                );
              }

              return (
                <div className="space-y-3">
                  {/* Table */}
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Domain</th>
                          <th className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs">Score</th>
                          <th className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs">Grade</th>
                          <th className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs">Status</th>
                          <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs hidden md:table-cell">Scanned</th>
                          <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs hidden lg:table-cell">Time</th>
                          <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {pageItems.map((scan, idx) => {
                          const pqcA = scan.raw_response?.pqc_analysis;
                          const score = pqcA?.overall_score ?? scan.raw_response?.pqc_overall_score ?? (scan as any).pqc_overall_score;
                          const grade = pqcA?.overall_grade ?? scan.raw_response?.pqc_overall_grade ?? (scan as any).pqc_overall_grade;
                          const rawStatus = (scan.status || '').toLowerCase();
                          const isDone = rawStatus === 'completed';
                          const isBusy = rawStatus === 'processing' || rawStatus === 'pending';

                          const fmtTime = (s: string) => {
                            if (!s) return '—';
                            try {
                              const ms = Date.now() - new Date(s).getTime();
                              if (ms < 60000) return 'just now';
                              if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
                              if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
                              return `${Math.floor(ms / 86400000)}d ago`;
                            } catch { return '—'; }
                          };

                          return (
                            <tr key={scan.request_id || idx} className="hover:bg-muted/30 transition-colors">
                              {/* Domain */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 max-w-xs">
                                  <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="truncate font-medium text-sm" title={scan.url}>{scan.url || '—'}</span>
                                </div>
                              </td>
                              {/* Score */}
                              <td className="px-3 py-3 text-center">
                                {isDone && score != null
                                  ? <span className="font-semibold tabular-nums">{Number(score).toFixed(0)}</span>
                                  : <span className="text-muted-foreground text-xs">—</span>}
                              </td>
                              {/* Grade */}
                              <td className="px-3 py-3 text-center">
                                {isDone ? gradeBadge(grade) : <span className="text-muted-foreground text-xs">—</span>}
                              </td>
                              {/* Status */}
                              <td className="px-3 py-3 text-center">{statusBadge(scan)}</td>
                              {/* Scanned at */}
                              <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden md:table-cell">
                                {fmtTime(scan.requested_at)}
                              </td>
                              {/* Exec time */}
                              <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden lg:table-cell">
                                {scan.execution_time_seconds ? `${Number(scan.execution_time_seconds).toFixed(1)}s` : '—'}
                              </td>
                              {/* Actions */}
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {isDone && (
                                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                                      onClick={() => handleViewScanDetails(scan.request_id)}>
                                      <Eye className="h-3 w-3" /> View
                                    </Button>
                                  )}
                                  {isBusy && (
                                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                                      onClick={() => retryScan(scan)}
                                      disabled={retryingId === scan.request_id}>
                                      {retryingId === scan.request_id
                                        ? <RefreshCw className="h-3 w-3 animate-spin" />
                                        : <RotateCcw className="h-3 w-3" />}
                                      Retry
                                    </Button>
                                  )}
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                    onClick={async () => {
                                      if (!scan.request_id || scan.request_id.startsWith('temp_')) {
                                        setScanHistory(prev => prev.filter(s => s.request_id !== scan.request_id));
                                        return;
                                      }
                                      try {
                                        await apiFetch(`${ELK_API_URL}/api/elk/scan-by-request/${scan.request_id}`, { method: 'DELETE' });
                                        setScanHistory(prev => prev.filter(s => s.request_id !== scan.request_id));
                                        showMessage('Deleted', 'success');
                                      } catch { showMessage('Delete failed', 'error'); }
                                    }}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {(safePage - 1) * HIST_PAGE_SIZE + 1}–{Math.min(safePage * HIST_PAGE_SIZE, filtered.length)} of {filtered.length}
                      </span>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                          disabled={safePage <= 1}
                          onClick={() => setHistPage(p => Math.max(1, p - 1))}>
                          ‹ Prev
                        </Button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
                          const p = start + i;
                          return (
                            <Button key={p} size="sm"
                              variant={p === safePage ? 'default' : 'outline'}
                              className="h-7 w-7 p-0 text-xs"
                              onClick={() => setHistPage(p)}>
                              {p}
                            </Button>
                          );
                        })}
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                          disabled={safePage >= totalPages}
                          onClick={() => setHistPage(p => Math.min(totalPages, p + 1))}>
                          Next ›
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </motion.div>
        )}

        {/* Onboarded Domains Tab */}
        {activeTab === 'onboarded' && (
          <motion.div
            key="onboarded-tab"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="mt-8 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Onboarded Domains</h2>
            <p className="text-sm text-muted-foreground mt-1">Quick scan access for your onboarded organizations</p>
          </div>
        </div>
        
        {onboardingLoading ? (
          <div className="flex items-center justify-center p-8 border rounded-lg bg-muted/20">
            <div className="text-muted-foreground">Loading onboarding domains...</div>
          </div>
        ) : onboardingDomains.length === 0 ? (
          <div className="flex items-center justify-center p-8 border rounded-lg bg-muted/20">
            <div className="text-muted-foreground">No onboarding domains found.</div>
          </div>
        ) : (
          <div className="space-y-6">
            {onboardingDomains.map(org => (
              <div key={org.id} className="border rounded-lg p-6 bg-card shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4 pb-4 border-b">
                  <div className="p-2 bg-primary/10 rounded">
                    <Globe className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{org.organization_name}</h3>
                    <p className="text-xs text-muted-foreground">Organization ID: {org.id}</p>
                  </div>
                </div>

                {org.domains && org.domains.length > 0 && (
                  <div className="mb-4">
                    <div className="text-sm font-medium text-muted-foreground mb-3">Organization Domains</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {org.domains.map((d: any) => (
                        <div key={d.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border hover:border-primary/50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{d.domain || d.domain_name}</div>
                            <div className="text-xs text-muted-foreground">ID: {d.id}</div>
                          </div>
                          <Button 
                            size="sm" 
                            className="ml-2 shrink-0" 
                            onClick={() => handleOnboardingDomainScan(d.domain || d.domain_name)}
                          >
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

                        {so.domains && so.domains.length > 0 && (
                          <div className="mb-4">
                            <div className="text-sm font-medium text-muted-foreground mb-2">Sub-Organization Domains</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {so.domains.map((d: any) => (
                                <div key={d.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border hover:border-primary/50 transition-colors">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm truncate">{d.domain || d.domain_name}</div>
                                    <div className="text-xs text-muted-foreground">ID: {d.id}</div>
                                  </div>
                                  <Button 
                                    size="sm" 
                                    className="ml-2 shrink-0" 
                                    onClick={() => handleOnboardingDomainScan(d.domain || d.domain_name)}
                                  >
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
                                {app.domains && app.domains.length > 0 && (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {app.domains.map((d: any) => (
                                      <div key={d.id} className="flex items-center justify-between p-2 bg-muted/30 rounded border hover:border-primary/50 transition-colors">
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-xs truncate">{d.domain || d.domain_name}</div>
                                          <div className="text-[10px] text-muted-foreground">ID: {d.id}</div>
                                        </div>
                                        <Button 
                                          size="sm" 
                                          className="ml-2 shrink-0 h-7 px-2 text-xs" 
                                          onClick={() => handleOnboardingDomainScan(d.domain || d.domain_name)}
                                        >
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default WebScan;