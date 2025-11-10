import React, { useState, useEffect } from 'react';
import { RefreshCw, Shield, AlertTriangle, Clock, Package, XCircle, CheckCircle } from 'lucide-react';

// Types
interface Algorithm {
  name: string;
  category: string;
  pqc_safe: boolean;
  occurrences: number;
  files_affected: number;
}

interface ScanDetail {
  id: number;
  repo_url: string;
  repo_hash: string;
  last_scanned: string;
  total_files: number;
  algorithms: Record<string, Algorithm>;
  pqc_safe_count: number;
  pqc_vulnerable_count: number;
}

interface Scan {
  id: number;
  repo_url: string;
  scan_status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cached';
  last_scanned: string;
  total_files: number;
  total_files_to_scan: number;
  pqc_safe_count: number;
  pqc_vulnerable_count: number;
  current_status: string;
}

type StatusType = 'error' | 'success' | 'info';

const API_URL = import.meta.env.VITE_REPO_SCAN_API_URL

const CryptoScanner: React.FC = () => {
  const [repoUrl, setRepoUrl] = useState('');
  const [scans, setScans] = useState<Scan[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [scanDetailsCache, setScanDetailsCache] = useState<Map<number, ScanDetail>>(new Map());
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState<StatusType>('info');
  const [showStatus, setShowStatus] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const showStatusMessage = (message: string, type: StatusType = 'info') => {
    setStatusMessage(message);
    setStatusType(type);
    setShowStatus(true);
    setTimeout(() => setShowStatus(false), 5000);
  };

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

    setIsScanning(true);
    try {
      const response = await fetch(`${API_URL}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: repoUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Scan failed');
      }

      if (data.cached) {
        showStatusMessage('✓ Using cached scan results', 'success');
      } else {
        showStatusMessage('✓ Scan queued successfully! Click "Refresh" to check progress.', 'success');
      }

      await loadHistory();
    } catch (error: any) {
      if (error.name === 'TimeoutError') {
        showStatusMessage('Request timeout - Please check if the backend is running', 'error');
      } else if (error.message.includes('Failed to fetch')) {
        showStatusMessage('Cannot connect to backend server. Ensure Flask is running.', 'error');
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
          <div>
            <span className="inline-flex items-center px-3 py-1 rounded bg-yellow-100 text-yellow-800 text-sm font-medium">
              <Clock className="w-3 h-3 mr-1" /> Queued
            </span>
            {currentStatus && (
              <div className="text-xs text-yellow-800 mt-1">Waiting for worker...</div>
            )}
          </div>
        );
      case 'in_progress':
        return (
          <div>
            <span className="inline-flex items-center px-3 py-1 rounded bg-blue-100 text-blue-800 text-sm font-medium">
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> In Progress
            </span>
            {currentStatus && (
              <div className="text-xs text-blue-800 mt-1">{currentStatus}</div>
            )}
          </div>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded bg-green-100 text-green-800 text-sm font-medium">
            <CheckCircle className="w-3 h-3 mr-1" /> Completed
          </span>
        );
      case 'failed':
        return (
          <div>
            <span className="inline-flex items-center px-3 py-1 rounded bg-red-100 text-red-800 text-sm font-medium">
              <XCircle className="w-3 h-3 mr-1" /> Failed
            </span>
            {currentStatus && (
              <div className="text-xs text-red-600 mt-1">{currentStatus}</div>
            )}
          </div>
        );
      case 'cached':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded bg-indigo-100 text-indigo-800 text-sm font-medium">
            <Package className="w-3 h-3 mr-1" /> Cached
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded bg-gray-100 text-gray-800 text-sm font-medium">
            Unknown
          </span>
        );
    }
  };

  const renderExpandedContent = (data: ScanDetail) => {
    const algorithms = data.algorithms || {};
    const safe: (Algorithm & { name: string })[] = [];
    const unsafe: (Algorithm & { name: string })[] = [];

    Object.entries(algorithms).forEach(([name, info]) => {
      if (info.pqc_safe) {
        safe.push({ name, ...info });
      } else {
        unsafe.push({ name, ...info });
      }
    });

    return (
      <div className="p-6 bg-gray-50">
        <div className="bg-gray-100 p-4 rounded-lg mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <strong>Commit Hash:</strong>{' '}
              <code className="bg-white px-2 py-1 rounded text-xs">{data.repo_hash}</code>
            </div>
            <div>
              <strong>Last Scanned:</strong> {new Date(data.last_scanned).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Files Scanned
            </div>
            <div className="text-3xl font-semibold text-gray-900">{data.total_files || 0}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Algorithms Found
            </div>
            <div className="text-3xl font-semibold text-gray-900">{Object.keys(algorithms).length}</div>
          </div>
          <div className="bg-white border-l-4 border-green-500 rounded-lg p-5">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              PQC Safe
            </div>
            <div className="text-3xl font-semibold text-green-600">{safe.length}</div>
          </div>
          <div className="bg-white border-l-4 border-red-500 rounded-lg p-5">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              PQC Vulnerable
            </div>
            <div className="text-3xl font-semibold text-red-600">{unsafe.length}</div>
          </div>
        </div>

        {unsafe.length > 0 && (
          <AlgorithmSection title="PQC Vulnerable Algorithms" algorithms={unsafe} type="unsafe" />
        )}
        {safe.length > 0 && (
          <AlgorithmSection title="PQC Safe Algorithms" algorithms={safe} type="safe" />
        )}
      </div>
    );
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
          className={`border-b border-gray-200 ${
            canView ? 'cursor-pointer hover:bg-gray-50' : ''
          }`}
        >
          <td className="px-4 py-3 text-gray-900">{scan.repo_url}</td>
          <td className="px-4 py-3">
            {getStatusBadge(scan.scan_status, scan.current_status)}
          </td>
          <td className="px-4 py-3 text-gray-900">
            {new Date(scan.last_scanned).toLocaleString()}
          </td>
          <td className="px-4 py-3 text-gray-900">{fileCountDisplay}</td>
          <td className="px-4 py-3 text-green-600 font-semibold">
            {scan.pqc_safe_count || '-'}
          </td>
          <td className="px-4 py-3 text-red-600 font-semibold">
            {scan.pqc_vulnerable_count || '-'}
          </td>
          <td className="px-4 py-3">
            {canView ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleRow(scan.id);
                }}
                className="px-3 py-1 bg-white border border-gray-300 rounded text-gray-700 text-sm hover:bg-gray-50"
              >
                {isExpanded ? 'Hide' : 'View'}
              </button>
            ) : (
              <button
                disabled
                className="px-3 py-1 bg-gray-100 border border-gray-300 rounded text-gray-500 text-sm cursor-not-allowed"
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
          <tr className="bg-gray-50">
            <td colSpan={7}>
              {scanDetailsCache.has(scan.id) ? (
                renderExpandedContent(scanDetailsCache.get(scan.id)!)
              ) : (
                <div className="p-6 text-center text-gray-600">Loading details...</div>
              )}
            </td>
          </tr>
        )}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-5 py-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center text-2xl">
              🔐
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Crypto Scanner</h1>
              <div className="text-sm text-gray-600">Post-Quantum Cryptography Security Analysis</div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-5 py-8">
        {showStatus && (
          <div
            className={`mb-6 p-3 rounded-lg border ${
              statusType === 'error'
                ? 'bg-red-50 border-red-500 text-red-900'
                : statusType === 'success'
                ? 'bg-green-50 border-green-500 text-green-900'
                : 'bg-blue-50 border-blue-500 text-blue-900'
            }`}
          >
            {statusMessage}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <div className="mb-5 pb-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Repository Scan</h2>
            <p className="text-sm text-gray-600">
              Analyze GitHub repositories for cryptographic algorithm usage and PQC readiness
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="repoUrl">
              GitHub Repository URL
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                id="repoUrl"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && scanRepository()}
                placeholder="https://github.com/username/repository"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={scanRepository}
                disabled={isScanning}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {isScanning ? (
                  <>
                    <RefreshCw className="w-4 h-4 inline mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Scan Repository'
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex justify-between items-center mb-5 pb-4 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Scan History</h2>
            </div>
            <button
              onClick={refreshHistory}
              disabled={isRefreshing}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 inline mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Repository
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Last Updated
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Files
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    PQC Safe
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    PQC Vulnerable
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      Loading history...
                    </td>
                  </tr>
                ) : scans.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
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
  algorithms: (Algorithm & { name: string })[];
  type: 'safe' | 'unsafe';
}> = ({ title, algorithms, type }) => {
  const borderColor = type === 'safe' ? 'border-green-500' : 'border-red-500';
  const badgeColor = type === 'safe' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  const icon = type === 'safe' ? <Shield className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />;

  return (
    <div className="mb-6">
      <div className={`flex items-center justify-between p-4 bg-gray-50 border ${borderColor} border-l-4 rounded-lg`}>
        <div className="flex items-center gap-3 text-lg font-semibold text-gray-900">
          {icon}
          <span>{title}</span>
        </div>
        <span className={`px-3 py-1 rounded text-sm font-medium ${badgeColor}`}>
          {algorithms.length} Found
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
        {algorithms.map((algo, idx) => (
          <div key={`${algo.name}-${idx}`} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-base font-semibold text-gray-900 mb-1">{algo.name}</div>
            <div className="text-sm text-gray-600 mb-3">{algo.category}</div>
            <div className="flex gap-4 pt-3 border-t border-gray-200 text-sm text-gray-600">
              <span>{algo.occurrences} occurrences</span>
              <span>{algo.files_affected || 0} files</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CryptoScanner;