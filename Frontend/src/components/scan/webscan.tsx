import React, { useState, useEffect, useRef } from "react";
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
  // ✅ Map backend status values to frontend "completed"
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

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

interface WebScanProps {
  onBack: () => void;
  apiBaseUrl: string;
  autoLoadDomain?: string;
  initialTab?: 'scan' | 'history';
}

interface ScanResult {
  request_id: string;
  id?: number;
  batch_id?: string;
  primary_domain?: string;
  domain_list?: string[];
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requested_at: string;
  total_urls: number;
  execution_time_seconds?: number;
  scan_status?: ScanStatus;
  
  // ✅ ADD THESE NEW FIELDS
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

const deleteScanBatch = async (apiBaseUrl: string, batchId: string): Promise<boolean> => {
  try {
    const normalizedBaseUrl = apiBaseUrl.replace(/\/$/, '');
    
    // FIXED: Use correct endpoint path
    const deleteUrl = `${normalizedBaseUrl}/scans/batch/${batchId}`;
    console.log('🗑️ Attempting to delete batch at:', deleteUrl);
    
    const response = await apiFetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    
    if (response) {
      console.log('✅ Batch deleted successfully:', response);
      return true;
    } else {
      console.error('❌ Delete failed with status');
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
    // Call the scan-service which proxies to db-service
    const normalizedBaseUrl = apiBaseUrl.replace(/\/$/, '');
    console.log(`🔄 Fetching batches from: ${normalizedBaseUrl}/batches`);
    
    const response = await apiFetch(`${normalizedBaseUrl}/batches`);
    console.log(`✅ Response received:`, response);
    
    // Handle both array and object with 'batches' key
    const batches = Array.isArray(response) ? response : (response.batches || []);
    console.log(`📊 Loaded ${batches.length} batches from database`);
    console.log(`📋 Batches:`, batches);
    
    // ✅ FIX: Load execution times AND detailed results for completed batches
    const batchesWithExecutionTime = await Promise.all(
      batches.map(async (batch: any) => {
        // ✅ ONLY load details for COMPLETED batches
        if (batch.status === 'completed' && batch.batch_id) {
          try {
            const details = await loadBatchDetails(normalizedBaseUrl, batch.batch_id);
            const totalExecutionTime = details.reduce((sum: number, result: any) => 
              sum + (result.execution_time_seconds || 0), 0
            );
            return { ...batch, execution_time_seconds: totalExecutionTime, detailedResults: details };
          } catch (error) {
            console.warn(`Failed to load details for batch ${batch.batch_id}:`, error);
            return batch;
          }
        }
        // ✅ Return batch as-is if not completed
        return batch;
      })
    );
    
    // Convert batches to ScanResult format
    const result = batchesWithExecutionTime.map((batch: any) => {
      // ✅ FIX: Calculate total from successful + failed counts
      const totalUrls = (batch.successful_count || 0) + (batch.failed_count || 0);
      const rp = batch.request_payload || {};
      const rpDomains = Array.isArray(rp.domains) ? rp.domains : [];
      const rpDomainString = typeof rp.domain_string === 'string' ? rp.domain_string : '';
      const parsedFromString = rpDomainString
        ? rpDomainString
            .split(/[\n,\s]+/)
            .map((d: string) => d.trim())
            .filter((d: string) => d.length > 0)
        : [];

      const rawDomainCandidates = Array.isArray(batch.domains)
        ? batch.domains
        : Array.isArray(batch.domain_list)
        ? batch.domain_list
        : Array.isArray(batch.urls)
        ? batch.urls
        : Array.isArray(batch.url_list)
        ? batch.url_list
        : Array.isArray(batch.domain_urls)
        ? batch.domain_urls
        : [];
      const domainCandidates = [
        ...rawDomainCandidates.map((d: any) => (typeof d === 'string' ? d : d?.domain || d?.url)),
        ...rpDomains.map((d: any) => (typeof d === 'string' ? d : d?.domain || d?.url)),
        ...parsedFromString
      ]
        .filter((d: any): d is string => Boolean(d))
        .filter((value: string, index: number, self: string[]) => self.indexOf(value) === index);
      const primaryDomain = domainCandidates[0] || batch.domain || batch.url;
      
      return {
        request_id: batch.batch_id,
        batch_id: batch.batch_id,
        url: primaryDomain || `Batch with ${totalUrls} domains`,
        primary_domain: primaryDomain,
        domain_list: domainCandidates.length > 0 ? domainCandidates : [],
        status: batch.status as 'pending' | 'processing' | 'completed' | 'failed',
        requested_at: batch.created_at,
        total_urls: totalUrls,
        execution_time_seconds: batch.execution_time_seconds || 0,
        scan_status: normalizeScanStatus({ status: batch.status }),
        successful_count: batch.successful_count || 0,
        failed_count: batch.failed_count || 0,
        error_message: batch.status === 'failed' ? 'Batch processing failed' : undefined,
        finalDomainProgress: {},
        detailedResults: batch.detailedResults || [] // ✅ Use pre-loaded detailed results
      };
    });
    
    console.log(`✅ Converted ${result.length} scans for display`);
    return result;
  } catch (error) {
    console.error('❌ Error loading historical scans from database:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return [];
  }
};

const loadBatchDetails = async (apiBaseUrl: string, batchId: string): Promise<ScanResult[]> => {
  try {
    // Normalize base URL to avoid trailing slash
    const normalizedBaseUrl = apiBaseUrl.replace(/\/$/, '');
    
    // Fetch batch results
    const response = await apiFetch(`${normalizedBaseUrl}/results/batch/${batchId}`);
    
    console.log(`API Response for batch ${batchId}:`, response);
    
    const results = Array.isArray(response) ? response : (response.results || response.data || []);
    
    if (!results || results.length === 0) {
      console.warn(`No results found for batch ${batchId}`);
      return [];
    }
    
    // Map and normalize results
    return results.map((result: any): ScanResult => {
      const normalizedStatus = normalizeScanStatus(result);
      console.log(`🔍 Normalizing result for ${result.url}:`, {
        original_scan_status: result.scan_status,
        original_status: result.status,
        normalized: normalizedStatus
      });
      
      return {
        ...result,
        scan_status: normalizedStatus,
        domain_list: Array.isArray(result.domain_list)
          ? result.domain_list.filter((d): d is string => typeof d === 'string')
          : [],
        total_urls: result.total_urls ?? 1,
        execution_time_seconds: result.execution_time_seconds ?? 0
      };
    });
  } catch (error) {
    console.error('Error loading batch details:', error);
    throw error;
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

const connectSSEWithPost = async (
  apiBaseUrl: string,
  domains: string,
  saveToDb: boolean,
  onStart: (requestId: string) => void,
  onProgress: (data: any) => void,
  onComplete: (data: any) => void,
  onError: (error: string) => void
) => {
  try {
    const normalizedBaseUrl = apiBaseUrl.replace(/\/$/, '');
    const fullUrl = `${normalizedBaseUrl}/scan-with-progress`;  // ✅ CORRECT ENDPOINT

    console.log('🔍 SSE Connection:', fullUrl);

    const response = await fetch(fullUrl, {  // ✅ DO NOT use apiFetch (it parses JSON)
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        domain: domains,
        max_concurrent: 5,
        save_to_db: saveToDb
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
    let batchIdReceived = false;

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            // ✅ CRITICAL: Extract batch_id from FIRST event
            if (!batchIdReceived && data.batch_id) {
              onStart(data.batch_id);
              batchIdReceived = true;
            }
            
            // ✅ Route events to appropriate handlers
            if (data.type === 'progress_snapshot') {
              onProgress(data);  // ✅ THIS UPDATES PROGRESS BAR
            } else if (data.type === 'domain_complete') {
              onProgress(data);
            } else if (data.type === 'complete' || data.type === 'progress_summary') {
              onComplete(data);
              return;  // ✅ Exit SSE stream
            } else if (data.type === 'cancelled') {
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
    console.error('SSE error:', err);
    onError(err instanceof Error ? err.message : 'Unknown error');
  }
};

// ============================================================================
// MAIN WEBSCAN COMPONENT
// ============================================================================

const WebScan: React.FC<WebScanProps> = ({ onBack, apiBaseUrl, autoLoadDomain, initialTab }) => {
  const [activeTab, setActiveTab] = useState<'scan' | 'history' | 'onboarded'>(initialTab || 'scan');
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
  const [expandedProgress, setExpandedProgress] = useState<Set<string>>(new Set());
  const [roundHistory, setRoundHistory] = useState<RoundInfo[]>([]);
  const [currentRound, setCurrentRound] = useState(1);const [viewingResultsFor, setViewingResultsFor] = useState<string | null>(null);
  const [expandedDomainUrl, setExpandedDomainUrl] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false); // Track if we've already auto-loaded

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
        
        console.log(`📡 Polling batch ${batchId}...`);
        const response = await apiFetch(`${apiBaseUrl}/batch/${batchId}`);
        
        // Update scan history with latest status
        setScanHistory(prev => prev.map(scan => {
          if (scan.batch_id === batchId || scan.request_id === batchId) {
            // Calculate progress for batch scans
            const totalUrls = response.total_domains || scan.total_urls;
            const completedUrls = (response.successful_count || 0) + (response.failed_count || 0);
            const progressPercentage = totalUrls > 0 ? (completedUrls / totalUrls) * 100 : 0;

            return {
              ...scan,
              status: response.status,
              scan_status: normalizeScanStatus({ status: response.status }),
              total_urls: totalUrls,
              successful_count: response.successful_count || 0,
              failed_count: response.failed_count || 0,
              execution_time_seconds: response.execution_time_seconds || scan.execution_time_seconds,
              // ✅ ADD PROGRESS TRACKING
              progressPercentage,
              completedUrls,
              // ✅ Store detailed results if available
              detailedResults: response.results || scan.detailedResults
            };
          }
          return scan;
        }));

        // ✅ STOP POLLING IF SCAN IS COMPLETE OR FAILED
        if (response.status === 'completed' || response.status === 'failed') {
          console.log(`✅ Batch ${batchId} finished with status: ${response.status}`);
          stopPollingBatch(batchId);

          // Load full batch details for completed scans
          if (response.status === 'completed') {
            const details = await loadBatchDetails(apiBaseUrl, batchId);
            setScanHistory(prev => prev.map(scan =>
              scan.batch_id === batchId || scan.request_id === batchId
                ? { ...scan, detailedResults: details }
                : scan
            ));
          }
        }
      } catch (error) {
        console.error(`❌ Error polling batch ${batchId}:`, error);
        // Don't stop polling on error - backend might be temporarily unavailable
      }
    }, 3000); // Poll every 3 seconds

    pollingIntervalsRef.current.set(batchId, pollInterval);
  };

  // ✅ NEW FUNCTION: Stop polling a batch
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
      const batchId = scan.batch_id || scan.request_id;
      if (batchId && !pollingBatches.has(batchId)) {
        startPollingBatch(batchId);
      }
    });
  }, [scanHistory.length]); // Only run when number of scans changes


  // ✅ NEW PROGRESS CALCULATION (REPLACE)
  const getProgressForBatch = (batchId: string, scan: ScanResult) => {
    // ✅ 1. If SSE is active, use live progress
    if (liveProgress[batchId]) {
      return {
        percentage: liveProgress[batchId].percentage,
        completed: liveProgress[batchId].completed,
        current_phase: liveProgress[batchId].current_phase,
        current_domain: liveProgress[batchId].current_domain,
        eta_seconds: liveProgress[batchId].eta_seconds
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
    };
    
    initializeScans();
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

      // If not found, try loading details sequentially for completed scans until a match
      if (!matchingScan) {
        console.log('📥 No scans with loaded details, searching completed scans for domain...');

        // Sort completed scans by newest first
        const completedScans = scanHistory
          .filter(scan => scan.status === 'completed')
          .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());

        const findMatch = async () => {
          for (const scan of completedScans) {
            console.log('🔄 Loading batch details for scan:', scan.request_id);
            try {
              const details = await loadBatchDetails(apiBaseUrl, scan.batch_id!);
              // Update in-memory history so UI remains consistent
              setScanHistory(prev => prev.map(s => s.request_id === scan.request_id ? { ...s, detailedResults: details } : s));

              const hasMatch = details?.some(r => r.url?.toLowerCase().includes(domainLower));
              if (hasMatch) {
                console.log('✅ Found matching domain in scan:', scan.request_id);
                setActiveTab('history');
                setHasAutoLoaded(true);
                setViewingResultsFor(scan.request_id);
                return;
              }
            } catch (e) {
              console.warn('Failed loading details for scan', scan.request_id, e);
            }
          }
          console.log('⚠️ No completed scans contained the target domain');
        };

        // Trigger the search and exit effect
        findMatch();
        return;
      }

      if (matchingScan && matchingScan.status === 'completed') {
        console.log('✅ Found matching scan:', matchingScan.request_id);
        setActiveTab('history');
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

  // ============================================================================
  // NO localStorage STORAGE - DATABASE IS THE SOURCE OF TRUTH
  // ============================================================================
  // Removed: useEffect that saves/loads from localStorage
  // Also removed: Auto-load execution times effect (caused infinite loop on refresh)
  // Solution: Load execution times on-demand when user clicks "View Results"

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
    setRetryingId(scan.request_id);
    try {
      // CRITICAL FIX: Fetch actual domains from batch details, not from scan.url
      // scan.url contains "Batch with X domains" which is not valid for retry
      showMessage(`Loading batch details for retry...`, 'info');
      
      let domainsToRetry: string[] = [];
      try {
        const batchDetails = await loadBatchDetails(apiBaseUrl, scan.batch_id || scan.request_id);
        if (batchDetails && batchDetails.length > 0) {
          // Extract unique domains from batch results
          domainsToRetry = [...new Set(batchDetails.map((result: any) => result.url || result.domain).filter(Boolean))];
          console.log(`📋 Found ${domainsToRetry.length} domains to retry:`, domainsToRetry);
        }
      } catch (error) {
        console.error('Failed to load batch details for retry:', error);
      }
      
      // Fallback: if no domains found, check if scan.url is a valid domain
      if (domainsToRetry.length === 0) {
        if (scan.url && !scan.url.toLowerCase().startsWith('batch with')) {
          domainsToRetry = [scan.url] as string[];
          console.log(`📋 Using scan.url as fallback: ${scan.url}`);
        } else {
          showMessage(`Cannot retry: No valid domains found in batch`, 'error');
          return;
        }
      }
      
      showMessage(`Retrying scan for ${domainsToRetry.length} domain(s)...`, 'info');
      
      // DELETE the old failed scan FIRST before creating new one
      const idToDelete = scan.batch_id || scan.request_id;
      console.log(`🗑️ Deleting old scan with ID: ${idToDelete}`);
      console.log(`📌 Scan object before delete:`, { request_id: scan.request_id, batch_id: scan.batch_id, status: scan.status });
      
      const deleteSuccess = await deleteScanBatch(apiBaseUrl, idToDelete);
      console.log(`✅ Delete success: ${deleteSuccess}`);
      
      if (deleteSuccess) {
        showMessage(`Old failed scan removed`, 'success');
        // Update UI to remove the deleted scan immediately
        console.log(`📝 Filtering out scan with request_id: ${scan.request_id}`);
        setScanHistory(prevHistory => {
          const filtered = prevHistory.filter(s => {
            console.log(`  Comparing: ${s.request_id} vs ${scan.request_id}`);
            return s.request_id !== scan.request_id;
          });
          console.log(`📊 History before filter: ${prevHistory.length}, after filter: ${filtered.length}`);
          return filtered;
        });
      } else {
        console.warn('❌ Could not delete old scan, proceeding with retry anyway');
      }
      
      // Create new scan request with actual domains
      const response = await apiFetch(`${apiBaseUrl}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domainsToRetry.join(','),
          max_concurrent: 5,
          save_to_db: true
        })
      });

      console.log('✅ Retry scan completed:', response);
      showMessage(`Retry scan completed successfully!`, 'success');
      
      // Switch to history tab and refresh
      setActiveTab('history');
      setTimeout(async () => {
        const historicalScans = await loadHistoricalScans(apiBaseUrl);
        console.log(`📊 Refreshed history with ${historicalScans.length} scans`);
        if (historicalScans && historicalScans.length > 0) {
          setScanHistory(historicalScans);
        }
      }, 1000);
    } catch (error) {
      console.error('Error retrying scan:', error);
      showMessage('Failed to retry scan', 'error');
    } finally {
      setRetryingId(null);
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
  
  const handleScanSubmit = async (e: React.FormEvent, directUrl?: string) => {
    e.preventDefault();
    
    const sourceUrls = directUrl || urls;
    const urlList = sourceUrls
      .split(/[\n,\s]+/)
      .map(u => u.trim())
      .filter(u => u !== '');

    if (urlList.length === 0) {
      showMessage('Please enter at least one URL', 'error');
      return;
    }

    setIsScanning(true);
    setUrls('');
    showMessage(`Starting scan for ${urlList.length} URL(s)...`, 'info');

    // ✅ CRITICAL: Create optimistic entry BEFORE SSE
    const tempBatchId = `temp_${Date.now()}`;
    const optimisticScan: ScanResult = {
      request_id: tempBatchId,
      batch_id: tempBatchId,
      url: urlList.length === 1 ? urlList[0] : `Batch with ${urlList.length} domains`,
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
    setActiveTab('history');  // ✅ Switch to history BEFORE starting scan

    try {
      // ✅ CRITICAL: Use SSE endpoint instead of blocking POST
      await connectSSEWithPost(
        apiBaseUrl,
        urlList.join(','),
        true,  // save_to_db
        
        // ✅ ON START: Update with real batch_id
        (realBatchId: string) => {
          console.log('🆔 Received real batch ID:', realBatchId);
          setScanHistory(prev => prev.map(scan =>
            scan.request_id === tempBatchId
              ? { ...scan, request_id: realBatchId, batch_id: realBatchId }
              : scan
          ));
          setCurrentRequestId(realBatchId);
        },
        
        // ✅ ON PROGRESS: Update live progress
        (data: any) => {
          console.log('📊 Progress update:', data);
          
          if (data.type === 'progress_snapshot') {
            const batchId = data.batch_id || currentRequestId || tempBatchId;
            
            // ✅ CRITICAL: Update live progress state
            updateLiveProgress(batchId, data);
            
            // ✅ Also update scan history for persistence
            setScanHistory(prev => prev.map(scan => {
              if (scan.batch_id === batchId || scan.batch_id === tempBatchId) {
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
          setIsScanning(false);
          setIsCancelling(false);
          setCurrentRequestId(null);
          
          const batchId = data.batch_id || currentRequestId || tempBatchId;
          
          // ✅ CRITICAL: Clear live progress
          clearLiveProgress(batchId);
          
          // ✅ Load full results from database
          try {
            const details = await loadBatchDetails(apiBaseUrl, batchId);
            
            setScanHistory(prev => prev.map(scan =>
              scan.batch_id === batchId || scan.request_id === tempBatchId
                ? {
                    ...scan,
                    status: 'completed',
                    scan_status: 'completed',
                    progressPercentage: 100,
                    completedUrls: scan.total_urls,
                    successful_count: data.successful_count || scan.successful_count,
                    failed_count: data.failed_count || scan.failed_count,
                    detailedResults: details
                  }
                : scan
            ));
            
            showMessage('✅ Scan completed successfully!', 'success');
          } catch (error) {
            console.error('Failed to load results:', error);
            showMessage('Scan completed but failed to load results', 'warning');
          }
        },
        
        // ✅ ON ERROR: Handle failures
        (error: string) => {
          console.error('❌ Scan failed:', error);
          setIsScanning(false);
          setIsCancelling(false);
          setCurrentRequestId(null);
          
          setScanHistory(prev => prev.filter(s => !s.request_id.startsWith('temp_')));
          showMessage(`Scan failed: ${error}`, 'error');
        }
      );
    } catch (error) {
      console.error('❌ SSE connection failed:', error);
      setIsScanning(false);
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

  const handleLoadBatchDetails = async (requestId: string) => {
    const scan = scanHistory.find(s => s.request_id === requestId);
    if (!scan || !scan.batch_id) {
      showMessage('Could not find batch to load.', 'error');
      return;
    }
  
    try {
      console.log(`Loading batch details for ${scan.batch_id}...`);
      const details = await loadBatchDetails(apiBaseUrl, scan.batch_id);
      console.log(`Loaded ${details.length} details for batch ${scan.batch_id}`, details);
      
      if (details && details.length > 0) {
        // ✅ FIX: Calculate total execution time from all results
        const totalExecutionTime = details.reduce((sum, result) => {
          return sum + (result.execution_time_seconds || 0);
        }, 0);
        const singleDomain = details.length === 1 ? details[0].url : undefined;
  
        // ✅ Update scan history with new data
        setScanHistory(prev => prev.map(s =>
          s.request_id === requestId
            ? {
                ...s,
                detailedResults: details,
                execution_time_seconds: totalExecutionTime,
                primary_domain: singleDomain || s.primary_domain,
                domain_list: details
                  .map((d) => d.url)
                  .filter((url): url is string => Boolean(url))
              }
            : s
        ));
        
        // ✅ FIX: Delay navigation until after state is committed
        setTimeout(() => {
          setViewingResultsFor(requestId);
        }, 0);
      } else {
        showMessage('No details found for this batch. The batch may have no results.', 'warning');
        console.warn(`No details returned for batch ${scan.batch_id}`);
      }
    } catch (error) {
      console.error('Error loading batch details:', error);
      showMessage('Failed to load batch details: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
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

              <Button
                onClick={handleScanSubmit}
                disabled={isScanning || (!urls && !uploadedFile)}
                size="lg"
                className="w-full"
              >
                <UnifiedActionLoading
                  isLoading={isScanning}
                  loadingText="Submitting Scan..."
                  defaultText="Start Crypto Scan"
                  icon={<Shield className="w-5 h-5 mr-2" />}
                />
              </Button>
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
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Scan History</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {scanHistory.length} total scans
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={async () => {
                    showMessage('Refreshing scan history from database...', 'info');
                    try {
                      const historicalScans = await loadHistoricalScans(apiBaseUrl);
                      if (historicalScans && historicalScans.length > 0) {
                        setScanHistory(historicalScans);
                        showMessage('Scan history refreshed', 'success');
                      } else {
                        showMessage('No scan history found', 'info');
                      }
                    } catch (error) {
                      console.error('Error refreshing scan history:', error);
                      showMessage('Failed to refresh scan history', 'error');
                    }
                  }}
                  size="sm"
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                </Button>
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
            </div>

            {scanHistory.length === 0 ? (
              <UnifiedCard padding="spacious" className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">No scans found</p>
              </UnifiedCard>
            ) : (
              <div className="space-y-4">
                {/* Flatten scan history to show domain-wise results */}
                {scanHistory.flatMap((scan) => {
                  // If scan has detailed results (individual domains), show each domain separately
                  if (scan.detailedResults && scan.detailedResults.length > 0) {
                    return scan.detailedResults.map((domainScan, idx) => ({
                      ...domainScan,
                      parentBatch: scan,
                      domainIndex: idx,
                      isIndividualDomain: true
                    }));
                  }
                  // Otherwise show the batch as-is
                  return [{
                    ...scan,
                    parentBatch: scan,
                    domainIndex: 0,
                    isIndividualDomain: false
                  }];
                }).filter(item => item && item.parentBatch).map((scan) => {
                  const isIndividualDomain = scan.isIndividualDomain === true;
                  const parentBatch = scan.parentBatch || scan;
                  
                  const executionTime = (() => {
                    // For individual domain scans, show their execution time
                    if (isIndividualDomain && scan.execution_time_seconds) {
                      return `${scan.execution_time_seconds.toFixed(2)}s`;
                    }
                    
                    if (scan.detailedResults && scan.detailedResults.length > 0) {
                      const totalTime = scan.detailedResults.reduce((sum, result) => {
                        return sum + (result.execution_time_seconds || 0);
                      }, 0);
              
                      return totalTime > 0 
                        ? `${totalTime.toFixed(2)}s`
                        : 'N/A';
                    }
              
                    // Show execution time if available, otherwise N/A
                    if (scan.execution_time_seconds !== undefined && scan.execution_time_seconds > 0) {
                      return `${scan.execution_time_seconds.toFixed(2)}s`;
                    }
                    return 'N/A';
                  })();

                  const deleteLogic = async () => {
                    // For individual domain results, delete the entire parent batch
                    const batchId = parentBatch.batch_id || parentBatch.request_id;
                    showMessage('Deleting scan batch...', 'info');
                    
                    const success = await deleteScanBatch(apiBaseUrl, batchId);
                    
                    if (success) {
                      setScanHistory(prev => 
                        prev.filter(s => s.request_id !== parentBatch.request_id)
                      );
                      showMessage('Scan batch deleted successfully', 'success');
                    } else {
                      showMessage('Failed to delete scan batch', 'error');
                    }
                  };

                  // Determine quantum readiness status for completed scans
                  const getQuantumStatus = () => {
                    // Handle HTTP skipped explicitly
                    if (scan.scan_status === 'http_skipped') return 'HTTP/UNREACHABLE';
                    // Handle failed scans
                    if (scan.status === 'failed') return 'FAILED';

                    if (scan.status !== 'completed') return scan.status.toUpperCase();

                    // For individual domains, check their specific quantum analysis
                    if (isIndividualDomain && scan.raw_response?.pqc_analysis) {
                      return scan.raw_response.pqc_analysis.quantum_ready ? 'QUANTUM READY' : 'NOT QUANTUM READY';
                    }
                    
                    // Check if any detailed result has quantum analysis
                    if (scan.detailedResults && scan.detailedResults.length > 0) {
                      const hasQuantumReady = scan.detailedResults.some(result => 
                        result.raw_response?.pqc_analysis?.quantum_ready === true
                      );
                      const hasQuantumNotReady = scan.detailedResults.some(result => 
                        result.raw_response?.pqc_analysis?.quantum_ready === false
                      );
                      
                      // If all are quantum ready
                      if (hasQuantumReady && !hasQuantumNotReady) return 'QUANTUM READY';
                      // If some or all are not quantum ready
                      if (hasQuantumNotReady) return 'NOT QUANTUM READY';
                    }
                    
                    return scan.status.toUpperCase();
                  };

                  // For domain-wise display, show the actual domain
                  const domainLabel = isIndividualDomain 
                    ? scan.url
                    : (scan.primary_domain ||
                      (scan.domain_list && scan.domain_list.length === 1 ? scan.domain_list[0] : undefined) ||
                      (scan.detailedResults && scan.detailedResults.length === 1 ? scan.detailedResults[0].url : undefined));
                  
                  const shouldShowDomainHint = !domainLabel && scan.total_urls === 1;
                  
                                    // Generate unique key for domain-wise display
                                    // Use database ID if available for guaranteed uniqueness
                                    const uniqueKey = isIndividualDomain
                                      ? (scan.id
                                          ? `result-${scan.id}`
                                          : `${parentBatch.request_id}-${scan.domainIndex}-${Date.now()}-${Math.random()}`)
                                      : (scan.id
                                          ? `batch-result-${scan.id}`
                                          : scan.request_id);
                  // Prepare metrics for individual domains (null-safe pqc_analysis)
                  const pqcAnalysis = scan.raw_response?.pqc_analysis;
                  const pqcScore = pqcAnalysis && typeof pqcAnalysis.overall_score === 'number'
                    ? pqcAnalysis.overall_score.toFixed(1)
                    : 'N/A';
                  const pqcGrade = pqcAnalysis?.overall_grade || 'N/A';
                  const quantumStatus = pqcAnalysis?.quantum_ready === true ? 'Quantum Ready' : 'Not Ready';

                  return (
                                        <UnifiedResultCard
                                          key={uniqueKey}
                                          className={scan.status === 'processing' ? 'animate-pulse bg-gradient-to-r from-transparent via-primary/5 to-transparent bg-[length:1000px_100%]' : ''}
                                          title={isIndividualDomain ? scan.url : `Request ID: ${scan.request_id}`}
                                          description={isIndividualDomain ? '' : new Date(scan.requested_at || parentBatch.requested_at).toLocaleString()}
                                          status={
                                            scan.status === 'completed' ? 'success' :
                                            scan.status === 'failed' || scan.error_message ? 'error' :
                                            scan.status === 'processing' ? 'info' : 'warning'
                                          }
                                          statusLabel={getQuantumStatus()}
                                          icon={getStatusIcon(scan.status)}
                                          metrics={isIndividualDomain ? [
                                            { 
                                              label: "PQC Score", 
                                              value: pqcScore,
                                              valueClassName: getGradeColor(pqcGrade)
                                            },
                                            { 
                                              label: "Grade", 
                                              value: pqcGrade,
                                              valueClassName: getGradeColor(pqcGrade)
                                            },
                                            { 
                                              label: "Status", 
                                              value: quantumStatus,
                                              valueClassName: pqcAnalysis?.quantum_ready ? 'text-success' : 'text-destructive'
                                            }
                                          ] : [
                                            { label: "URLs", value: scan.total_urls },
                                            // ✅ SHOW LIVE PROGRESS FOR PROCESSING SCANS
                                            ...(scan.status === 'processing' || scan.status === 'pending' ? [{
                                              label: "Progress",
                                              value: `${scan.completedUrls || 0}/${scan.total_urls}`,
                                              valueClassName: 'text-primary'
                                            }] : []),
                                            { label: "Execution Time", value: executionTime }
                                          ]}
                                          actions={[
                                            ...((scan.status === 'completed' || scan.scan_status === 'http_skipped' || (scan.status === 'failed' && (isIndividualDomain || (scan.detailedResults && scan.detailedResults.length > 0)))) ? [{
                                              label: "View Results",
                                              icon: <Eye size={16} />,
                                              onClick: () => {
                                                if (isIndividualDomain) {
                                                  // For individual domains, directly open the domain detail modal
                                                  setExpandedDomainUrl(scan.url);
                                                  handleLoadBatchDetails(parentBatch.request_id);
                                                } else {
                                                  // For batches, show the batch results page
                                                  handleLoadBatchDetails(scan.request_id);
                                                }
                                              },
                                              variant: "outline" as const
                                            }] : []),
                                            ...((scan.status === 'failed' || scan.status === 'pending' || scan.status === 'processing') ? [{
                                              label: retryingId === parentBatch.request_id ? "Retrying..." : "Retry",
                                              icon: retryingId === parentBatch.request_id ? <RefreshCw size={16} className="animate-spin" /> : <RotateCcw size={16} />,
                                              onClick: () => retryScan(parentBatch),
                                              variant: "outline" as const,
                                              disabled: retryingId === parentBatch.request_id
                                            }] : []),
                                            {
                                              label: "Delete",
                                              icon: <Trash2 size={16} />,
                                              onClick: deleteLogic,
                                              variant: "destructive" as const
                                            }
                                          ]}
                                        >
                                          {!isIndividualDomain && (domainLabel || shouldShowDomainHint) && (
                                            <div className="mb-3 text-sm">
                                              <span className="font-semibold text-foreground">Domain:</span>{' '}
                                              <span className="text-muted-foreground break-all">
                                                {domainLabel || 'Load results to view domain'}
                                              </span>
                                            </div>
                                          )}
                    
                    
                                          {/* ✅ REPLACE existing progress bar code */}
                                          {(scan.status === 'processing' || scan.status === 'pending') && (
                                            <div className="mt-4 space-y-2">
                                              {(() => {
                                                const batchId = scan.batch_id || scan.request_id;
                                                const progress = getProgressForBatch(batchId, scan);
                                                
                                                return (
                                                  <>
                                                    <div className="flex items-center justify-between text-sm">
                                                      <span className="text-muted-foreground">
                                                        {activeSSEConnections.has(batchId) ? (
                                                          <UnifiedInlineRefresh 
                                                            isRefreshing={true} 
                                                            size="sm" 
                                                            label={
                                                              progress.current_phase 
                                                                ? `${progress.current_phase.replace(/_/g, ' ')}...`
                                                                : 'Scanning...'
                                                            }
                                                            className="text-primary" 
                                                          />
                                                        ) : (
                                                          'Pending...'
                                                        )}
                                                      </span>
                                                      <div className="flex items-center gap-2">
                                                        <span className="font-medium">
                                                          {progress.percentage.toFixed(0)}%
                                                        </span>
                                                        {progress.eta_seconds && progress.eta_seconds > 0 && (
                                                          <span className="text-xs text-muted-foreground">
                                                            ETA: {progress.eta_seconds}s
                                                          </span>
                                                        )}
                                                      </div>
                                                    </div>
                                                    
                                                    {/* ✅ Show current domain being scanned */}
                                                    {progress.current_domain && (
                                                      <div className="text-xs text-muted-foreground">
                                                        Scanning: {progress.current_domain}
                                                      </div>
                                                    )}
                                                    
                                                    {/* ✅ Smooth progress bar */}
                                                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                                                      <motion.div
                                                        className="bg-primary h-full rounded-full"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${progress.percentage}%` }}
                                                        transition={{ duration: 0.5, ease: "easeInOut" }}
                                                      />
                                                    </div>
                                                    
                                                    {/* ✅ Domain breakdown */}
                                                    {scan.total_urls > 1 && (
                                                      <div className="mt-3 text-xs text-muted-foreground space-y-1">
                                                        <div className="flex justify-between">
                                                          <span>✅ Successful:</span>
                                                          <span className="font-medium text-success">{scan.successful_count || 0}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                          <span>❌ Failed:</span>
                                                          <span className="font-medium text-destructive">{scan.failed_count || 0}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                          <span>⏳ Remaining:</span>
                                                          <span className="font-medium text-warning">
                                                            {scan.total_urls - (progress.completed || 0)}
                                                          </span>
                                                        </div>
                                                      </div>
                                                    )}
                                                  </>
                                                );
                                              })()}
                                            </div>
                                          )}
                                          
                                          {/* PROGRESS DISPLAY */}
                                          {scan.status === 'processing' && expandedProgress.has(isIndividualDomain ? parentBatch.request_id : scan.request_id) && (
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
                                            expandedSummary.has(isIndividualDomain ? parentBatch.request_id : scan.request_id) && (
                                              <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-4 col-span-full border-t pt-4"
                                              >
                                                {/* For individual domains, show their specific results */}
                                                {isIndividualDomain ? (
                                                  <ProgressDisplay 
                                                    scanProgress={{ 
                                                      total: 1, 
                                                      completed: 1 
                                                    }}
                                                    domainProgress={{
                                                      [scan.url]: {
                                                        status: scan.scan_status?.toLowerCase() === 'completed' 
                                                          ? 'completed' 
                                                          : scan.scan_status?.toLowerCase() === 'http_skipped' 
                                                          ? 'http_skipped' 
                                                          : 'failed',
                                                        duration: scan.execution_time_seconds,
                                                        error: scan.error_message,
                                                        round: 1
                                                      }
                                                    }}
                                                    processingDomains={{}}
                                                    roundHistory={[]}
                                                    isActiveProgress={false}
                                                  />
                                                ) : (
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
                                                        if (scanStatus === 'completed') {
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
                                                )}
                                              </motion.div>
                                            )}
                                        </UnifiedResultCard>
                  )
                })}
              </div>
            )}
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