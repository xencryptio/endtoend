import React, { useState, useEffect } from 'react';
import { RefreshCw, Shield, AlertTriangle, Clock, Package, XCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { Button } from "@/components/ui/button";

// Types
interface Algorithm {
    name: string;
    category: string;
    algorithm_type: string; // kex, signature, symmetric, hash
    // ✅ REMOVED: quantum_resistant field
    is_pqc: boolean; // True ONLY for actual PQC algorithms
    occurrences: number;
    files_affected: number;
    base_score: number;
    final_score: number;
    grade: string;
    deprecated: boolean;
    security_level: string;
    quantum_safe: boolean; // ✅ PRIMARY field: Actually quantum-safe?
    quantum_safety_reason: string; // ✅ NEW: Explanation
    quantum_resistance_type: string; // ✅ NEW: Classification
    weighted_score: number;
  }
  
  interface CategoryScore {
    score: number; // Average score for this category
    grade: string; // Letter grade for category
    algorithm_count: number; // How many algorithms in this category
    best_algorithm: string; // Name of best performing algorithm
    worst_algorithm: string; // Name of worst performing algorithm
  }
  
  interface ScanDetail {
    id: number;
    repo_url: string;
    platform: string;
    branch_name: string;
    repo_hash: string;
    last_scanned: string;
    total_files: number;
    algorithms: Record<string, Algorithm>;
    quantum_safe_count: number; // ✅ RENAMED: Actually quantum-safe
    quantum_vulnerable_count: number; // ✅ RENAMED: Actually vulnerable
    true_pqc_count: number; // Count of actual PQC algorithms
    overall_security_score: number;
    overall_grade: string;
    // ✓ THIS IS THE CORRECT PERCENTAGE
    quantum_readiness_percentage: number; // Based on occurrences, not types
    category_scores: Record<string, CategoryScore>;
  }
  
  interface Scan {
  id: number;
  repo_url: string;
  repo_hash: string;
  branch_name: string;
  platform: string;
  scan_status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cached';
  last_scanned: string;
  total_files: number;
  total_files_to_scan: number;
  quantum_safe_count: number; // ✅ RENAMED
  quantum_vulnerable_count: number; // ✅ RENAMED
  current_status: string;
}

type StatusType = 'error' | 'success' | 'info';

interface CryptoScannerProps {
  onBack: () => void;
}

const API_URL = import.meta.env.VITE_REPO_SCAN_API_URL

// Helper function to get color for letter grades
const getGradeColor = (grade: string): string => {
  if (!grade) return 'text-gray-500';
  const letter = grade.charAt(0);
  switch (letter) {
    case 'A': return 'text-green-600 dark:text-green-400';
    case 'B': return 'text-blue-600 dark:text-blue-400';
    case 'C': return 'text-yellow-600 dark:text-yellow-400';
    case 'D': return 'text-orange-600 dark:text-orange-400';
    case 'F': return 'text-red-600 dark:text-red-400';
    default: return 'text-gray-600 dark:text-gray-400';
  }
};

// Helper function to get color for score progress bars
const getScoreBarColor = (score: number): string => {
  if (score >= 90) return 'bg-green-500';
  if (score >= 80) return 'bg-blue-500';
  if (score >= 70) return 'bg-yellow-500';
  if (score >= 60) return 'bg-orange-500';
  return 'bg-red-500';
};

// Helper function to get risk level information
const getRiskLevelInfo = (score: number): { label: string; color: string; description: string } => {
  if (score >= 90) return {
    label: 'Low Risk',
    color: 'text-green-600 dark:text-green-400',
    description: 'Excellent cryptographic security posture'
  };
  if (score >= 80) return {
    label: 'Medium-Low Risk',
    color: 'text-blue-600 dark:text-blue-400',
    description: 'Good security with minor improvements needed'
  };
  if (score >= 70) return {
    label: 'Medium Risk',
    color: 'text-yellow-600 dark:text-yellow-400',
    description: 'Adequate security but needs attention'
  };
  if (score >= 60) return {
    label: 'Medium-High Risk',
    color: 'text-orange-600 dark:text-orange-400',
    description: 'Significant security concerns present'
  };
  return {
    label: 'High Risk',
    color: 'text-red-600 dark:text-red-400',
    description: 'Critical security vulnerabilities detected'
  };
};

const CryptoScanner: React.FC<CryptoScannerProps> = ({ onBack }) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [branchName, setBranchName] = useState('main');
  const [detectedPlatform, setDetectedPlatform] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [scans, setScans] = useState<Scan[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [scanDetailsCache, setScanDetailsCache] = useState<Map<number, ScanDetail>>(new Map());
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState<StatusType>('info');
  const [showStatus, setShowStatus] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);

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
      } else {
        setDetectedPlatform('');
        showStatusMessage(data.detail || 'Invalid URL', 'error');
      }
    } catch (error) {
      setDetectedPlatform('');
    } finally {
      setIsValidating(false);
    }
  };

  // Debounce URL validation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (repoUrl) {
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

  const toggleRow = async (scanId: number) => {
    const newExpandedRows = new Set(expandedRows);
    
    if (newExpandedRows.has(scanId)) {
      newExpandedRows.delete(scanId);
    } else {
      newExpandedRows.add(scanId);
      
      if (!scanDetailsCache.has(scanId)) {
        try {
          const response = await fetch(`${API_URL}/api/scans/${scanId}`);
          const data: ScanDetail = await response.json();
          setScanDetailsCache(new Map(scanDetailsCache).set(scanId, data));
        } catch (error) {
          console.error('Failed to load scan details:', error);
          showStatusMessage('Failed to load scan details', 'error');
        }
      }
    }
    
    setExpandedRows(newExpandedRows);
  };

  const getStatusBadge = (status: string, currentStatus?: string) => {
    switch (status) {
      case 'pending':
        return (
          <div className="text-xs">
            <span className="inline-flex items-center px-3 py-1 rounded bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 text-sm font-medium">
              <Clock className="w-3 h-3 mr-1" /> Queued
            </span>
            {currentStatus && (
              <div className="text-yellow-800 dark:text-yellow-300 mt-1">Waiting for worker...</div>
            )}
          </div>
        );
      case 'in_progress':
        return (
          <div className="text-xs">
            <span className="inline-flex items-center px-3 py-1 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 text-sm font-medium">
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> In Progress
            </span>
            {currentStatus && (
              <div className="text-blue-800 dark:text-blue-300 mt-1">{currentStatus}</div>
            )}
          </div>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-sm font-medium">
            <CheckCircle className="w-3 h-3 mr-1" /> Completed
          </span>
        );
      case 'failed':
        return (
          <div className="text-xs">
            <span className="inline-flex items-center px-3 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-sm font-medium">
              <XCircle className="w-3 h-3 mr-1" /> Failed
            </span>
            {currentStatus && (
              <div className="text-red-600 dark:text-red-300 mt-1">{currentStatus}</div>
            )}
          </div>
        );
      case 'cached':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 text-sm font-medium">
            <Package className="w-3 h-3 mr-1" /> Cached
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-sm font-medium">
            Unknown
          </span>
        );
    }
  };

  const renderExpandedContent = (data: ScanDetail) => {
    const algorithms = data.algorithms || {};
    // ✅ CORRECTED: Categorize by ACTUAL quantum safety
    const truePQC: (Algorithm & { name: string })[] = [];
    const quantumSafe: (Algorithm & { name: string })[] = [];
    const quantumVulnerable: (Algorithm & { name: string })[] = [];
    
    Object.entries(algorithms).forEach(([name, info]) => {
      const algoWithName = { name, ...info };
      
      if (info.is_pqc) {
        // TRUE PQC: Kyber, Dilithium, SPHINCS+, NTRU, Falcon, etc.
        truePQC.push(algoWithName);
      } else if (info.quantum_safe) {
        // Quantum-Safe Classical: AES-256, SHA-512, ChaCha20-256
        quantumSafe.push(algoWithName);
      } else {
        // Quantum-Vulnerable: RSA, ECDSA, DH, AES-128, SHA-256
        quantumVulnerable.push(algoWithName);
      }
    });

    // ✅ CORRECTED: Calculate counts from categorized arrays
    const quantumSafeCount = quantumSafe.length;
    const quantumVulnerableCount = quantumVulnerable.length;
    const truePQCCount = truePQC.length;


    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900">
        <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <strong>Branch:</strong>{' '}
                <span className="inline-flex items-center px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 text-xs font-medium ml-2">
                  {data.branch_name || 'main'}
                </span>
              </div>
              <div>
                <strong>Platform:</strong>{' '}
                <span className="inline-flex items-center px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs font-medium ml-2">
                  {data.platform || 'Unknown'}
                </span>
              </div>
              <div>
                <strong>Last Scanned:</strong> {new Date(data.last_scanned).toLocaleString()}
              </div>
            </div>
            <div className="mt-3">
              <strong>Commit Hash:</strong>{' '}
              <code className="bg-white dark:bg-gray-700 px-2 py-1 rounded text-xs">{data.repo_hash}</code>
            </div>
          </div>
        </div>

        {/* NEW SECTION: Overall Security Metrics */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            Overall Security Assessment
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Overall Security Score Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-5 shadow-sm">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                Security Score
              </div>
              <div className="flex items-end gap-3">
                <div className="text-4xl font-bold text-gray-900 dark:text-gray-100">
                  {data.overall_security_score?.toFixed(1) || 'N/A'}
                </div>
                <div className={`text-2xl font-semibold mb-1 ${
                  getGradeColor(data.overall_grade)
                }`}>
                  {data.overall_grade || 'N/A'}
                </div>
              </div>
              <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${
                    getScoreBarColor(data.overall_security_score || 0)
                  }`}
                  style={{ width: `${data.overall_security_score || 0}%` }}
                />
              </div>
            </div>

            {/* ✓ FIXED: Quantum Readiness Card with Correct Explanation */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-5 shadow-sm">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                Quantum Readiness
              </div>
              <div className="flex items-end gap-2">
                <div className="text-4xl font-bold text-gray-900 dark:text-gray-100">
                  {data.quantum_readiness_percentage?.toFixed(1) || '0.0'}%
                </div>
              </div>
              <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                Percentage of cryptographic <strong>operations</strong> (by occurrence count) 
                using quantum-safe algorithms with adequate key sizes
                <div className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                  Based on weighted usage, not algorithm count
                </div>
              </div>
            </div>

            {/* Risk Level Indicator */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-5 shadow-sm">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                Risk Level
              </div>
              <div className={`text-2xl font-semibold ${
                getRiskLevelInfo(data.overall_security_score || 0).color
              }`}>
                {getRiskLevelInfo(data.overall_security_score || 0).label}
              </div>
              <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                {getRiskLevelInfo(data.overall_security_score || 0).description}
              </div>
            </div>
          </div>
        </div>

        {/* NEW SECTION: Category Breakdown */}
        {data.category_scores && Object.keys(data.category_scores).length > 0 && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-purple-600" />
              Security by Algorithm Category
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(data.category_scores).map(([category, score]) => (
                <div key={category} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase">
                      {getCategoryDisplayName(category)}
                    </div>
                    <div className={`text-lg font-bold ${getGradeColor(score.grade)}`}>
                      {score.grade}
                    </div>
                  </div>
                  
                  <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                    {score.score.toFixed(1)}
                  </div>
                  
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
                    <div 
                      className={`h-full ${getScoreBarColor(score.score)}`}
                      style={{ width: `${score.score}%` }}
                    />
                  </div>
                  
                  <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <div>{score.algorithm_count} algorithm{score.algorithm_count !== 1 ? 's' : ''}</div>
                    <div className="truncate" title={score.best_algorithm}>
                      Best: {score.best_algorithm}
                    </div>
                    <div className="truncate" title={score.worst_algorithm}>
                      Worst: {score.worst_algorithm}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ✅ CORRECTED: Summary Statistics with Clear Labels */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Files Scanned
            </div>
            <div className="text-3xl font-semibold text-gray-900 dark:text-gray-100">{data.total_files || 0}</div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Total Algorithms
            </div>
            <div className="text-3xl font-semibold text-gray-900 dark:text-gray-100">{Object.keys(algorithms).length}</div>
          </div>
          
          {/* ✅ True PQC Algorithms */}
          <div className="bg-white dark:bg-gray-800 border-l-4 border-purple-500 rounded-lg p-5">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              🔮 True PQC
            </div>
            <div className="text-3xl font-semibold text-purple-600">{truePQCCount}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Kyber, Dilithium, SPHINCS+
            </div>
          </div>
          
          {/* ✅ Quantum-Safe (Classical) */}
          <div className="bg-white dark:bg-gray-800 border-l-4 border-green-500 rounded-lg p-5">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              ✅ Quantum-Safe
            </div>
            <div className="text-3xl font-semibold text-green-600">{quantumSafeCount}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              AES-256, SHA-512, etc.
            </div>
          </div>
          
          {/* ✅ Quantum-Vulnerable */}
          <div className="bg-white dark:bg-gray-800 border-l-4 border-red-500 rounded-lg p-5">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              ⚠️ Vulnerable
            </div>
            <div className="text-3xl font-semibold text-red-600">{quantumVulnerableCount}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              RSA, ECDSA, weak sizes
            </div>
          </div>
        </div>

        {/* ✅ CORRECTED: Display 3 Sections with Clear Descriptions */}
        {quantumVulnerable.length > 0 && (
          <AlgorithmSection 
            title="⚠️ Quantum-Vulnerable Algorithms" 
            description="Will be broken by quantum computers: RSA, ECDSA, DH, or weak parameters (AES-128, SHA-256)" 
            algorithms={quantumVulnerable} 
            type="unsafe" 
          />
        )}
        {truePQC.length > 0 && (
          <AlgorithmSection 
            title="🔮 Post-Quantum Cryptography (PQC)" 
            description="Mathematically resistant to quantum attacks: Kyber, Dilithium, SPHINCS+, Falcon, NTRU" 
            algorithms={truePQC} 
            type="pqc" 
          />
        )}
        {quantumSafe.length > 0 && (
          <AlgorithmSection 
            title="✅ Quantum-Safe (Classical)" 
            description="Classical algorithms with quantum-resistant parameters: AES-256, SHA-512, ChaCha20-256" 
            algorithms={quantumSafe} 
            type="safe" 
          />
        )}
      </div>
    );
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

    // Create a separate component for each row to avoid Fragment issues
    const ScanRow: React.FC<{ scan: Scan }> = ({ scan }) => {
      const canView = scan.scan_status === 'completed' || scan.scan_status === 'cached';
      const isExpanded = expandedRows.has(scan.id);
      const fileCountDisplay =
        scan.scan_status === 'in_progress' && scan.total_files_to_scan > 0
          ? `${scan.total_files || 0} / ${scan.total_files_to_scan}`
          : scan.total_files || '-';
  
      return (
        <>
          <tr
            onClick={() => canView && toggleRow(scan.id)}
            className={`border-b border-gray-200 dark:border-gray-700 ${
              canView ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : ''
            }`}
          >
            <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
              <div className="max-w-xs truncate" title={scan.repo_url}>
                {scan.repo_url}
              </div>
            </td>
            <td className="px-4 py-3">
              <span className="inline-flex items-center px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 text-xs font-medium">
                {scan.branch_name || 'main'}
              </span>
            </td>
            <td className="px-4 py-3">
              <span className="inline-flex items-center px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium">
                {scan.platform || 'Unknown'}
              </span>
            </td>
            <td className="px-4 py-3">
              {getStatusBadge(scan.scan_status, scan.current_status)}
            </td>
            <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
              {new Date(scan.last_scanned).toLocaleString()}
            </td>
            <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{fileCountDisplay}</td>
            <td className="px-4 py-3 text-green-600 font-semibold">
              {scan.quantum_safe_count || '-'}
            </td>
            <td className="px-4 py-3 text-red-600 font-semibold">
              {scan.quantum_vulnerable_count || '-'}
            </td>
            <td className="px-4 py-3">
              {canView ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleRow(scan.id);
                  }}
                  className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  {isExpanded ? 'Hide' : 'View'}
                </button>
              ) : (
                <button
                  disabled
                  className="px-3 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-500 dark:text-gray-400 text-sm cursor-not-allowed"
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
          {canView && isExpanded && (
            <tr className="bg-gray-50 dark:bg-gray-800/50">
              <td colSpan={9}>
                {scanDetailsCache.has(scan.id) ? (
                  renderExpandedContent(scanDetailsCache.get(scan.id)!)
                ) : (
                  <div className="p-6 text-center text-gray-600 dark:text-gray-400">Loading details...</div>
                )}
              </td>
            </tr>
          )}
        </>
      );
    };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-5 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center text-2xl">
                🔐
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Crypto Scanner</h1>
                <div className="text-sm text-gray-600 dark:text-gray-400">Post-Quantum Cryptography Security Analysis</div>
              </div>
            </div>
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-5 py-8">
        {showStatus && (
          <div
            className={`mb-6 p-3 rounded-lg border ${
              statusType === 'error'
                ? 'bg-red-50 dark:bg-red-900/30 border-red-500 text-red-900 dark:text-red-200'
                : statusType === 'success'
                ? 'bg-green-50 dark:bg-green-900/30 border-green-500 text-green-900 dark:text-green-200'
                : 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-900 dark:text-blue-200'
            }`}
          >
            {statusMessage}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 mb-6">
          <div className="mb-5 pb-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Repository Scan</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Analyze GitHub repositories for cryptographic algorithm usage and PQC readiness
            </p>
          </div>

          <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2" htmlFor="repoUrl">
                Repository URL
              </label>
              
              <div className="mb-3">
                <input
                  type="text"
                  id="repoUrl"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/username/repository"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                
                {isValidating && (
                  <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    <RefreshCw className="w-3 h-3 inline mr-1 animate-spin" />
                    Validating URL...
                  </div>
                )}
                
                {detectedPlatform && !isValidating && (
                  <div className="mt-2 inline-flex items-center px-3 py-1 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 text-sm">
                    <Shield className="w-3 h-3 mr-1" />
                    Detected: {detectedPlatform}
                  </div>
                )}
              </div>

              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2" htmlFor="branchName">
                  Branch Name
                </label>
                <input
                  type="text"
                  id="branchName"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="main"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Default: main (change to develop, master, etc. if needed)
                </p>
              </div>

              <button
                onClick={scanRepository}
                disabled={isScanning || !repoUrl.trim() || !branchName.trim()}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
              >
                {isScanning ? (
                  <><RefreshCw className="w-4 h-4 inline mr-2 animate-spin" /> Submitting Scan...</>
                ) : (
                  <><Shield className="w-4 h-4 inline mr-2" /> Scan Repository</>
                )}
              </button>
            </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex justify-between items-center mb-5 pb-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Scan History</h2>
            </div>
            <button
              onClick={refreshHistory}
              disabled={isRefreshing}
              className={`px-4 py-2 bg-white dark:bg-gray-800 border rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors ${
                autoRefresh ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/50' : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              <RefreshCw className={`w-4 h-4 inline mr-2 ${isRefreshing || autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? 'Auto-refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Repository
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Branch
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Platform
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Last Updated
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Files
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Quantum Safe
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Vulnerable
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                      Loading history...
                    </td>
                  </tr>
                ) : scans.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                      No scans yet
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

const AlgorithmSection: React.FC<{
  title: string;
  description: string; // ✓ NEW: Add description
  algorithms: (Algorithm & { name: string })[];
  type: 'safe' | 'unsafe' | 'pqc'; // ✓ FIXED: Added 'pqc' type
}> = ({ title, description, algorithms, type }) => {
  // ✓ FIXED: Define colors for 3 types
  const getBorderColor = () => {
    switch (type) {
      case 'pqc': return 'border-purple-500';
      case 'safe': return 'border-green-500';
      case 'unsafe': return 'border-red-500';
    }
  };
  const getBadgeColor = () => {
    switch (type) {
      case 'pqc': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200';
      case 'safe': return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200';
      case 'unsafe': return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200';
    }
  };
  const getIcon = () => {
    switch (type) {
      case 'pqc': return <Shield className="w-5 h-5 text-purple-600" />;
      case 'safe': return <Shield className="w-5 h-5 text-green-600" />;
      case 'unsafe': return <AlertTriangle className="w-5 h-5 text-red-600" />;
    }
  };

  return (
    <div className="mb-6">
      <div className={`flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 border ${getBorderColor()} border-l-4 rounded-lg`}>
        <div>
          <div className="flex items-center gap-3 text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {getIcon()}
            <span>{title}</span>
          </div>
          {/* ✓ NEW: Show description */}
          <div className="text-sm text-gray-600 dark:text-gray-400 ml-8">
            {description}
          </div>
        </div>
        <span className={`px-3 py-1 rounded text-sm font-medium ${getBadgeColor()}`}>
          {algorithms.length} Found
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
        {algorithms.map((algo, idx) => (
          <div key={`${algo.name}-${idx}`} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-lg transition-shadow">
            {/* Algorithm Name and Grade */}
            <div className="flex items-start justify-between mb-2">
              <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {algo.name}
              </div>
              {algo.grade && (
                <div className={`text-xl font-bold ${getGradeColor(algo.grade)}`}>
                  {algo.grade}
                </div>
              )}
            </div>
            
            {/* Category and Type */}
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {algo.category}
            </div>
            
            {/* Security Level Badge */}
            {algo.security_level && (
              <div className="mb-3">
                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                  algo.security_level === 'critical' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200' :
                  algo.security_level === 'high' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' :
                  algo.security_level === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200' :
                  'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                }`}>
                  {algo.security_level.toUpperCase()} SECURITY
                </span>
                {algo.deprecated && (
                  <span className="ml-2 inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200">
                    DEPRECATED
                  </span>
                )}
              </div>
            )}
            
            {/* Score Display */}
            {algo.final_score !== undefined && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">Security Score</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {algo.final_score.toFixed(1)}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getScoreBarColor(algo.final_score)}`}
                    style={{ width: `${algo.final_score}%` }}
                  />
                </div>
              </div>
            )}
            
            {/* Usage Statistics */}
            <div className="flex gap-4 pt-3 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
              <span title="Total occurrences in code">
                {algo.occurrences} occurrence{algo.occurrences !== 1 ? 's' : ''}
              </span>
              <span title="Number of files affected">
                {algo.files_affected || 0} file{algo.files_affected !== 1 ? 's' : ''}
              </span>
            </div>
            
            {/* ✅ CORRECTED: Show quantum safety with explanation */}
            {algo.quantum_safe !== undefined && (
              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                {/* Quantum Safety Status */}
                <div className={`text-xs font-medium ${
                  algo.quantum_safe ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {algo.quantum_safe ? '✅ Quantum-Safe' : '⚠️ Quantum-Vulnerable'}
                </div>
                
                {/* Explanation */}
                {algo.quantum_safety_reason && (
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {algo.quantum_safety_reason}
                  </div>
                )}
                
                {/* Classification Badge */}
                {algo.quantum_resistance_type && (
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      algo.quantum_resistance_type === 'fully_resistant' 
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200'
                        : algo.quantum_resistance_type === 'grover_resistant'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                        : algo.quantum_resistance_type === 'vulnerable'
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                    }`}>
                      {algo.quantum_resistance_type.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CryptoScanner;