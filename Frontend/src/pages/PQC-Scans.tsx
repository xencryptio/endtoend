import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, Download, ChevronRight, ChevronDown, Play, Server, Activity, Clock, CheckCircle, AlertCircle, Loader, Search, X, FileDown, Terminal, BookOpen, Shield, Lock, Cpu, FileText, Key, Network, HardDrive } from 'lucide-react';

// API Configuration
const API_BASE_URL = 'http://localhost:9000';

// Types
interface Agent {
  agent_id: string;
  hostname: string;
  ip_address: string;
  os_info: string;
  registered_at: string;
  last_seen: string;
  status: string;
  minutes_since_last_seen: number;
}

interface Task {
  task_id: string;
  agent_id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface Stats {
  agents: {
    total: number;
    active: number;
    inactive: number;
  };
  tasks: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
  };
  results: {
    total: number;
  };
}

interface FileInfo {
  name: string;
  size: number;
  modified: string;
}

interface AuditResult {
  result_id: string;
  agent_id: string;
  task_id: string;
  audit_results: any;
  received_at: string;
  submitted_at: string;
}

interface AgentTaskInfo {
  completed_scans: number;
  pending_tasks: number;
  in_progress_tasks: number;
  last_scan: string | null;
  total_scans: number;
}

interface TaskResultPair {
  task: Task;
  result: AuditResult | null;
}

// 1. Data Structure Organization
interface SectionData {
  title: string;
  icon: React.ReactNode;
  color: string;
  data: any;
  subsections?: {
    title: string;
    data: any;
  }[];
}

interface ProcessedAuditResult {
  result_id: string;
  agent_id: string;
  task_id: string;
  submitted_at: string;
  received_at: string;
  sections: SectionData[];
  rawJson: any;
}

// Visual indicator component for status
const StatusIndicator: React.FC<{ status: boolean; trueText?: string; falseText?: string }> = ({ 
  status, 
  trueText = 'Yes', 
  falseText = 'No' 
}) => (
  <div className={`inline-flex items-center gap-1 text-sm font-medium ${status ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
    {status ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
    <span>{status ? trueText : falseText}</span>
  </div>
);

// Status Badge Component
const StatusBadge: React.FC<{ status: boolean | string; label?: string }> = ({ status, label }) => {
  if (status === true || status === 'enabled') {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full text-sm font-medium">
        <CheckCircle size={14} />
        {label || 'Enabled'}
      </div>
    );
  }
  if (status === false || status === 'disabled') {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-sm font-medium">
        <AlertCircle size={14} />
        {label || 'Disabled'}
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-sm font-medium">
      <AlertCircle size={14} />
      {label || 'Warning'}
    </div>
  );
};

// 2. Data Processing Function
const processAuditResults = (auditResults: any): SectionData[] => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const sections: SectionData[] = [];

  // System Context Section
  if (auditResults.system_context) {
    sections.push({
      title: 'System Context',
      icon: <Server size={18} />,
      color: 'blue',
      data: {
        'Operating System': auditResults.system_context.os_info, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
        'Kernel Version': auditResults.system_context.kernel_version,
        'Crypto Modules Loaded': auditResults.system_context.crypto_modules?.length || 0
      }
    });
  }

  // OpenSSL Crypto Section
  if (auditResults.openssl_crypto) {
    const openssl = auditResults.openssl_crypto;
    
    // Build Available Algorithms subsection with cleaner format
    const availableAlgos: any[] = [];
    if (openssl.available_algorithms) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      Object.entries(openssl.available_algorithms).forEach(([key, value]: [string, any]) => {
        if (value.available) {
          availableAlgos.push({
            'Algorithm': key.toUpperCase(),
            'Status': '✓ Available'
          });
        }
      });
    }

    // Build Cipher Distribution
    const cipherDist: any[] = [];
    if (openssl.cipher_information?.cipher_type_distribution) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      Object.entries(openssl.cipher_information.cipher_type_distribution).forEach(([key, value]) => {
        const readableKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        cipherDist.push({
          'Type': readableKey,
          'Count': `${value} ciphers`
        });
      });
    }

    // Build Protocol Support
    const protocols: any[] = [];
    if (openssl.protocol_support) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      openssl.protocol_support
        .filter((proto: any) => proto.available)
        .forEach((proto: any) => {
          protocols.push({
            'Protocol': proto.protocol.toUpperCase().replace('_', '.'),
            'Status': '✓ Enabled',
            'Cipher Count': proto.cipher_count
          });
      });
    }

    // Build Cipher Details
    const cipherDetails: any[] = [];
    if (openssl.cipher_information?.cipher_details) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      openssl.cipher_information.cipher_details.slice(0, 10).forEach((cipher: any) => {
        cipherDetails.push({
          'Cipher Name': cipher.name,
          'Type': cipher.type.replace(/_/g, ' ')
        });
      });
    }

    sections.push({
      title: 'OpenSSL Configuration',
      icon: <Lock size={18} />,
      color: 'green',
      data: {
        'OpenSSL Version': openssl.version_details?.split('\n')[0] || 'N/A', // eslint-disable-line @typescript-eslint/no-unsafe-member-access
        'FIPS Mode': openssl.fips_mode_enabled ? '✓ Enabled' : '✗ Disabled',
        'Total Ciphers': openssl.cipher_information?.total_ciphers || 0,
        'Platform': openssl.version_details?.split('\n').find((l: string) => l.includes('platform:'))?.split(':')[1]?.trim() || 'N/A'
      },
      subsections: [
        {
          title: 'Available Hash & Cipher Algorithms',
          data: availableAlgos
        },
        {
          title: 'Cipher Type Distribution',
          data: cipherDist
        },
        {
          title: 'Available Protocol Support',
          data: protocols
        },
        {
          title: 'Cipher Details (Top 10)',
          data: cipherDetails
        }
      ]
    });
  }

  // SSH Configuration Section
  if (auditResults.ssh_crypto) {
    const ssh = auditResults.ssh_crypto;
    
    // Build Configured Ciphers
    const ciphers: any[] = [];
    if (ssh.configuration?.configured_ciphers) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      ssh.configuration.configured_ciphers.ciphers?.forEach((cipher: string) => {
        ciphers.push({ 'Cipher': cipher });
      });
    }

    // Build MACs
    const macs: any[] = [];
    if (ssh.configuration?.configured_macs) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      ssh.configuration.configured_macs.macs?.forEach((mac: string) => {
        macs.push({ 'MAC': mac });
      });
    }

    // Build Key Exchange
    const kex: any[] = [];
    if (ssh.configuration?.configured_kex) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      ssh.configuration.configured_kex.kex_algorithms?.forEach((algo: string) => {
        kex.push({ 'Algorithm': algo });
      });
    }

    // Build Host Key Algorithms
    const hostKeys: any[] = [];
    if (ssh.configuration?.host_key_algorithms) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      ssh.configuration.host_key_algorithms.algorithms?.forEach((algo: string) => {
        hostKeys.push({ 'Algorithm': algo });
      });
    }

    sections.push({
      title: 'SSH Configuration',
      icon: <Network size={18} />,
      color: 'purple',
      data: {
        'SSH Version': ssh.version_info || 'Not Available', // eslint-disable-line @typescript-eslint/no-unsafe-member-access
        'Protocol Version': ssh.configuration?.protocol_version || 'N/A',
        'Distribution': ssh.version_details?.distribution || 'N/A',
        'Total Ciphers': ssh.configuration?.configured_ciphers?.count || 0,
        'Total MACs': ssh.configuration?.configured_macs?.count || 0
      },
      subsections: [
        {
          title: `Configured Ciphers (${ciphers.length})`,
          data: ciphers
        },
        {
          title: `Message Authentication Codes (${macs.length})`,
          data: macs
        },
        {
          title: `Key Exchange Algorithms (${kex.length})`,
          data: kex
        },
        {
          title: `Host Key Algorithms (${hostKeys.length})`,
          data: hostKeys
        }
      ]
    });
  }

  // Certificates Section
  if (auditResults.certificates) {
    const certSummary: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      'Total Certificates Found': auditResults.certificates.certificates?.length || 0,
      'Search Paths Used': auditResults.certificates.search_paths_used?.length || 0
    };

    const certSubsections = auditResults.certificates.certificates?.map((cert: any, idx: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const certName = cert.path.split('/').pop() || `Certificate ${idx + 1}`;
      return {
          title: `${idx + 1}. ${certName}`,
          data: {
            'File Path': cert.path,
            'Key Algorithm': cert.crypto_information.key_algorithm,
            'Key Size': `${cert.crypto_information.key_size} bits`,
            'Signature Algorithm': cert.crypto_information.signature_algorithm,
            'Uses SHA-1': cert.crypto_information.characteristics?.includes('uses_sha1_signature') ? '⚠️ Yes' : '✓ No',
            'Uses SHA-256': cert.crypto_information.characteristics?.includes('uses_sha256_signature') ? '✓ Yes' : 'No',
            'RSA Algorithm': cert.crypto_information.characteristics?.includes('rsa_algorithm') ? '✓ Yes' : 'No'
          }
      };
    }) || [];

    sections.push({
      title: 'Certificates',
      icon: <FileText size={18} />,
      color: 'amber',
      data: certSummary,
      subsections: certSubsections
    });
  }

  // Hardware Crypto Features Section
  if (auditResults.hardware_crypto) {
    const hw = auditResults.hardware_crypto;
    
    // Build CPU Features with readable names
    const cpuFeatures: any[] = [];
    if (hw.cpu_crypto_features) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      const featureNames: any = {
        'aes_instructions': 'AES-NI',
        'random_number_generator': 'Hardware RNG',
        'secure_random_seed': 'Secure Random Seed',
        'sha_extensions': 'SHA Extensions',
        'advanced_vector_extensions': 'AVX Support',
        'advanced_vector_extensions_2': 'AVX2 Support',
        'carry_less_multiplication': 'CLMUL Support'
      };
      
      Object.entries(hw.cpu_crypto_features).forEach(([key, value]) => {
        const readableName = featureNames[key] || key;
        if (value) {
          cpuFeatures.push({
            'Feature': readableName,
            'Status': '✓ Supported'
          });
        }
      });
    }

    // Build Devices Info
    const devices: any[] = [];
    if (hw.random_devices && hw.random_devices.length > 0) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      devices.push({ 'Device Type': 'Random Devices', 'Devices': hw.random_devices.join(', ') });
    }
    if (hw.tpm_devices && hw.tpm_devices.length > 0) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      devices.push({ 'Device Type': 'TPM Devices', 'Devices': hw.tpm_devices.join(', ') });
    } else {
      devices.push({ 'Device Type': 'TPM Devices', 'Devices': 'None Found' });
    }
    if (hw.crypto_devices && hw.crypto_devices.length > 0) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      devices.push({ 'Device Type': 'Crypto Devices', 'Devices': hw.crypto_devices.join(', ') });
    } else {
      devices.push({ 'Device Type': 'Crypto Devices', 'Devices': 'None Found' });
    }

    sections.push({
      title: 'Hardware Crypto Features',
      icon: <Cpu size={18} />,
      color: 'indigo',
      data: {
        'CPU Model': hw.cpu_information || 'N/A', // eslint-disable-line @typescript-eslint/no-unsafe-member-access
        'Total Crypto Features': hw.crypto_feature_count || 0
      },
      subsections: [
        {
          title: 'Enabled CPU Cryptographic Features',
          data: cpuFeatures
        },
        {
          title: 'Hardware Devices',
          data: devices
        }
      ]
    });
  }

  // System Security Section
  if (auditResults.system_security) {
    const security = auditResults.system_security;
    
    // Build Crypto Libraries list
    const libraries: any[] = [];
    if (security.crypto_libraries) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      (security.crypto_libraries as string[]).forEach((lib: string) => {
        const libName = lib.split('=>')[0]?.trim() || lib;
        libraries.push({ 'Library': libName });
      });
    }

    // Build Kernel Algorithms
    const kernelAlgos: { Algorithm: string; Category: string; }[] = [];
    if (security.kernel_crypto_algorithms) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      (security.kernel_crypto_algorithms as string[]).forEach((algo: string) => {
        const algoName = algo.split(':')[1]?.trim() || algo;
        let category = 'Other';
        if (algoName.includes('hmac')) category = 'HMAC'; // eslint-disable-line no-param-reassign
        else if (algoName.includes('gcm')) category = 'GCM';
        else if (algoName.includes('aes')) category = 'AES';
        
        kernelAlgos.push({
          'Algorithm': algoName,
          'Category': category
        });
      });
    }

    sections.push({ // eslint-disable-line @typescript-eslint/no-unsafe-assignment
      title: 'System Security',
      icon: <Shield size={18} />,
      color: 'red',
      data: {
        'FIPS Kernel Mode': security.fips_kernel_mode ? '✓ Enabled' : '✗ Disabled', // eslint-disable-line @typescript-eslint/no-unsafe-member-access
        'System Entropy': `${security.system_entropy} bits`,
        'Crypto Libraries': security.crypto_libraries?.length || 0,
        'Kernel Algorithms': security.kernel_crypto_algorithms?.length || 0
      },
      subsections: [
        {
          title: 'Cryptographic Libraries',
          data: libraries
        },
        {
          title: 'Kernel Crypto Algorithms',
          data: kernelAlgos
        }
      ]
    });
  }

  return sections; // eslint-disable-line @typescript-eslint/no-unsafe-return
};

// 3. Component for Section Display with Document 2 styling
const CollapsibleSection: React.FC<{
  section: SectionData;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ section, isExpanded, onToggle }) => {
  const [expandedSubsections, setExpandedSubsections] = useState<Set<number>>(new Set());

  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-emerald-600',
    purple: 'from-purple-500 to-pink-600',
    amber: 'from-amber-500 to-orange-600',
    indigo: 'from-indigo-500 to-purple-600',
    red: 'from-red-500 to-rose-600',
  }[section.color] || 'from-slate-500 to-slate-600';

  const toggleSubsection = (idx: number) => {
    setExpandedSubsections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) {
        newSet.delete(idx);
      } else {
        newSet.add(idx);
      }
      return newSet;
    });
  };

  const InfoRow = ({ label, value }: { label: string; value: any }) => (
    <div className="flex flex-col sm:flex-row py-3 border-b border-slate-200 dark:border-slate-700 last:border-0 gap-2">
      <span className="text-sm font-medium text-slate-600 dark:text-slate-400 flex-shrink-0">{label}</span>
      <span className="text-sm text-slate-900 dark:text-slate-100 font-mono break-words min-w-0 flex-1">
        {String(value)}
      </span>
    </div>
  );

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <button // eslint-disable-line @typescript-eslint/no-misused-promises
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 bg-gradient-to-br ${colorClasses} rounded-lg text-white`}>
            {section.icon}
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{section.title}</h3>
        </div>
        <div className={`transition-transform duration-500 ease-in-out ${isExpanded ? 'rotate-180' : ''}`}>
          <ChevronDown size={20} className="text-slate-400" />
        </div>
      </button>
      
      <div 
        className={`transition-all duration-500 ease-in-out ${
          isExpanded ? 'max-h-[8000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
        style={{ overflow: isExpanded ? 'visible' : 'hidden' }}
      >
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
          {/* Main Data */}
          <div className="bg-white dark:bg-slate-900 rounded-lg p-4 mb-4">
            {Object.entries(section.data).map(([key, value]) => (
              <InfoRow key={key} label={key} value={value} />
            ))}
          </div>

          {/* Subsections */}
          {section.subsections && section.subsections.length > 0 && (
            <div className="space-y-3">
              {section.subsections.map((subsection, idx) => (
                <div key={idx} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <button // eslint-disable-line @typescript-eslint/no-misused-promises
                    onClick={() => toggleSubsection(idx)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`transition-transform duration-500 ease-in-out ${expandedSubsections.has(idx) ? 'rotate-90' : ''}`}>
                        <ChevronRight size={18} className="text-slate-600 dark:text-slate-400" />
                      </div>
                      <h4 className="font-semibold text-slate-800 dark:text-slate-100">{subsection.title}</h4>
                    </div>
                  </button>
                  
                  <div 
                    className={`transition-all duration-500 ease-in-out ${
                      expandedSubsections.has(idx) ? 'max-h-[4000px] opacity-100' : 'max-h-0 opacity-0'
                    }`}
                    style={{ overflow: expandedSubsections.has(idx) ? 'visible' : 'hidden' }}
                  >
                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50">
                      {Array.isArray(subsection.data) ? (
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                        {subsection.data.map((item: any, itemIdx: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                            <div key={itemIdx} className="bg-white dark:bg-slate-900 rounded p-3 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
                          <div className="grid grid-cols-1">
                                {Object.entries(item).map(([key, value]) => (
                              <div key={key} className="flex flex-col sm:flex-row gap-2 py-1">
                                <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 sm:min-w-[100px]">{key}:</span>
                                <span className="text-sm font-medium text-slate-900 dark:text-slate-100 font-mono break-words min-w-0 flex-1">
                                      {String(value)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-white dark:bg-slate-900 rounded p-3">
                          {Object.entries(subsection.data).map(([key, value]) => (
                            <InfoRow key={key} label={key} value={value} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const RawJsonSection: React.FC<{ auditResults: any }> = ({ auditResults }) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden animate-slideInDown mt-4">
    <div className="p-4 bg-slate-800 dark:bg-slate-900 border-b border-slate-700"> // eslint-disable-line @typescript-eslint/no-unsafe-assignment
      <h4 className="font-semibold text-white flex items-center gap-2">
        <FileText size={18} />
        Complete Raw JSON Data
      </h4>
    </div>
    <pre className="p-4 overflow-auto max-h-96 text-xs bg-slate-900 dark:bg-slate-950 text-green-400 font-mono max-w-full w-full break-words whitespace-pre-wrap"> // eslint-disable-line @typescript-eslint/no-unsafe-assignment
      {JSON.stringify(auditResults, null, 2)}
    </pre> // eslint-disable-line @typescript-eslint/no-unsafe-argument
  </div>
);

const CryptoAuditDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'downloads' | 'docs'>('dashboard');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [linuxFiles, setLinuxFiles] = useState<FileInfo[]>([]);
  const [windowsFiles, setWindowsFiles] = useState<FileInfo[]>([]);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [agentResults, setAgentResults] = useState<Map<string, AuditResult[]>>(new Map());
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [triggeredScans, setTriggeredScans] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [loadingResults, setLoadingResults] = useState<Set<string>>(new Set());
  const [retryingResults, setRetryingResults] = useState<Set<string>>(new Set());
  const [tabTransition, setTabTransition] = useState(false);

  const processedCompletionsRef = useRef<Set<string>>(new Set());
  const prevTasksRef = useRef<Task[]>([]);
  
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/stats`);
      const data = await response.json();
      if (data.success) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
        setStats(data);
        return data;
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      setError('Failed to fetch statistics');
    }
    return null;
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/agents`);
      const data = await response.json();
      if (data.success) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
        setAgents(data.agents);
        return data.agents;
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
      setError('Failed to fetch agents');
    }
    return [];
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/tasks`);
      const data = await response.json();
      if (data.success) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
        setTasks(data.tasks);
        return data.tasks;
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setError('Failed to fetch tasks');
    }
    return [];
  }, []);

  const fetchAgentResults = useCallback(async (agentId: string) => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/agent/${agentId}/results`);
      const data = await response.json();
      if (data.success) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
        setAgentResults(prev => new Map(prev).set(agentId, data.results));
      }
    } catch (error) {
      console.error('Error fetching agent results:', error);
      setError(`Failed to fetch results for agent ${agentId}`);
    }
  }, []);

  const fetchFiles = useCallback(async () => {
    try {
      const [linuxResponse, windowsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/files/list/linux`),
        fetch(`${API_BASE_URL}/api/v1/files/list/windows`)
      ]);
      const linuxData = await linuxResponse.json();
      const windowsData = await windowsResponse.json();
      
      if (linuxData.success) setLinuxFiles(linuxData.files); // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      if (windowsData.success) setWindowsFiles(windowsData.files); // eslint-disable-line @typescript-eslint/no-unsafe-member-access
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    const [, , newTasks] = await Promise.all([fetchStats(), fetchAgents(), fetchTasks()]);

    setTriggeredScans(prev => {
      const newSet = new Set(prev);
      const activeTasks = (newTasks || []).filter(t =>
        t.status === 'pending' || t.status === 'in_progress'
      ).map(t => t.agent_id);
      prev.forEach(agentId => {
        if (!activeTasks.includes(agentId)) newSet.delete(agentId);
      });
      return newSet;
    });

    const expandedAgentIds = Array.from(expandedAgents);
    await Promise.all(expandedAgentIds.map(id => fetchAgentResults(id)));
    
    setLastUpdate(new Date());
    setLoading(false);
    setIsInitialLoad(false);
  }, [fetchStats, fetchAgents, fetchTasks, expandedAgents, fetchAgentResults]);
  
  const agentTaskInfo = useMemo<Map<string, AgentTaskInfo>>(() => {
    const info = new Map<string, AgentTaskInfo>();
    agents.forEach(agent => {
      const agentTasks = tasks.filter(t => t.agent_id === agent.agent_id);
      const completed = agentTasks.filter(t => t.status === 'completed');
      
      let lastScan: string | null = null;
      if (completed.length > 0) {
        lastScan = completed.reduce((latest, task) => 
          task.completed_at && new Date(task.completed_at) > new Date(latest || 0) ? task.completed_at : latest,
          null as string | null
        );
      }

      info.set(agent.agent_id, {
        completed_scans: completed.length,
        pending_tasks: agentTasks.filter(t => t.status === 'pending').length,
        in_progress_tasks: agentTasks.filter(t => t.status === 'in_progress').length,
        last_scan: lastScan,
        total_scans: agentTasks.length,
      });
    });
    return info;
  }, [agents, tasks]);

  const triggerScan = async (agentId: string) => {
    setTriggeredScans(prev => new Set(prev).add(agentId));
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/trigger-scan/${agentId}`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
        const poll = async (retries: number, delay: number) => {
          if (retries === 0) return;
          
          const tasksResponse = await fetch(`${API_BASE_URL}/api/v1/admin/tasks`);
          const tasksData = await tasksResponse.json();
          
          if (tasksData.success) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
            setTasks(tasksData.tasks);
            await fetchAgents();

            const agentTask = tasksData.tasks.find((t: Task) => 
              t.agent_id === agentId && 
              (t.status === 'pending' || t.status === 'in_progress')
            );

            if (agentTask) {
              setTimeout(() => poll(retries - 1, delay * 1.5), delay); // eslint-disable-line @typescript-eslint/no-misused-promises
            } else {
              setTriggeredScans(prev => {
                const newSet = new Set(prev);
                newSet.delete(agentId);
                return newSet;
              });
            }
          }
        };
        poll(5, 1500);
      }
    } catch (error) {
      console.error('Error triggering scan:', error);
      setTriggeredScans(prev => {
        const newSet = new Set(prev);
        newSet.delete(agentId);
        return newSet;
      });
    }
  };

  const retryFetchResult = async (agentId: string, taskId: string) => {
    setRetryingResults(prev => new Set(prev).add(taskId));
    try {
      await fetchAgentResults(agentId);
      await fetchTasks();
    } catch (e) {
      console.error("Retry fetch failed", e);
    } finally {
      setRetryingResults(prev => {
        const newSet = new Set(prev);
        newSet.delete(taskId);
        return newSet;
      });
    }
  };

  const toggleAgentResults = async (agentId: string) => {
    const newExpanded = new Set(expandedAgents);
    if (newExpanded.has(agentId)) {
      newExpanded.delete(agentId);
    } else {
      newExpanded.add(agentId);
      if (!agentResults.has(agentId)) {
        setLoadingResults(prev => new Set(prev).add(agentId));
        await fetchAgentResults(agentId);
        setLoadingResults(prev => {
          const newSet = new Set(prev);
          newSet.delete(agentId);
          return newSet;
        });
      }
    }
    setExpandedAgents(newExpanded);
  };

  const toggleResultDetails = (resultId: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(resultId)) {
      newExpanded.delete(resultId);
    } else {
      newExpanded.add(resultId);
    }
    setExpandedResults(newExpanded);
  };

  const allResults = useMemo(() => {
    return Array.from(agentResults.values()).flat();
  }, [agentResults]);

  const filteredAgents = useMemo(() => {
    return agents.filter(agent => {
      const info = agentTaskInfo.get(agent.agent_id);

      const matchesSearch = searchQuery === '' || 
        agent.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.agent_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.ip_address.includes(searchQuery);
      
      let matchesStatus = true;
      switch (statusFilter) {
        case 'all':
          matchesStatus = true;
          break;
        case 'active':
        case 'inactive':
          matchesStatus = agent.status === statusFilter;
          break;
        case 'has_pending':
          matchesStatus = (info?.pending_tasks ?? 0) > 0;
          break;
        case 'has_completed':
          matchesStatus = (info?.completed_scans ?? 0) > 0;
          break;
        default:
          matchesStatus = true;
      }

      return matchesSearch && matchesStatus;
    });
  }, [agents, searchQuery, statusFilter, agentTaskInfo]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDateTime = (dateString: string): string => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRelativeTime = (dateString: string): string => {
    const diff = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const formatTimeSince = (minutes: number): string => {
    if (minutes < 1) return '<1 min ago';
    if (minutes === 1) return '1 min ago';
    if (minutes < 60) return `${minutes} mins ago`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  const handleTabChange = (tab: 'dashboard' | 'downloads' | 'docs') => {
    setTabTransition(true);
    setTimeout(() => {
      setActiveTab(tab);
      setTabTransition(false);
    }, 150);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(refreshAll, 10000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, refreshAll]);

  useEffect(() => {
    refreshAll();
    fetchFiles();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdate(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const previousTasks = prevTasksRef.current;
    if (previousTasks.length > 0 && tasks.length > 0) {
      tasks.forEach(newTask => {
        const oldTask = previousTasks.find(t => t.task_id === newTask.task_id);
        if (oldTask && oldTask.status === 'in_progress' && newTask.status === 'completed') {
          const completionKey = `${newTask.agent_id}_${newTask.task_id}`;
          if (processedCompletionsRef.current.has(completionKey)) {
            return;
          }
          processedCompletionsRef.current.add(completionKey);

          console.log(`Task ${newTask.task_id} for agent ${newTask.agent_id} just completed. Fetching results.`);          
          
          const fetchAndExpand = async () => {
            await fetchAgentResults(newTask.agent_id);
            await fetchStats();
          };
          fetchAndExpand();
        }
      });
    }
    prevTasksRef.current = tasks;
  }, [tasks, fetchAgentResults, fetchStats]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 animate-slideIn">
              <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
                <Activity className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                  Crypto Audit Manager
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  Enterprise Security Dashboard
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            {(['dashboard', 'downloads', 'docs'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`px-4 sm:px-6 py-3 font-medium text-sm sm:text-base transition-all relative ${
                  activeTab === tab 
                    ? 'text-indigo-600 dark:text-indigo-400' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab === 'dashboard' && 'Dashboard'}
                {tab === 'downloads' && 'Downloads'}
                {tab === 'docs' && 'Documentation'}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 animate-slideInX" />
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 transition-opacity duration-300 ${tabTransition ? 'opacity-0' : 'opacity-100'}`}>
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg animate-slideInDown">
            <div className="flex items-center gap-2">
              <AlertCircle className="text-red-600 dark:text-red-400" size={20} />
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fadeIn">
            {isInitialLoad ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => (
                  <SkeletonStatCard key={i} />
                ))}
              </div>
            ) : stats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <StatCard title="Total Agents" value={stats.agents.total} icon={<Server size={20} />} color="indigo" />
                <StatCard title="Active" value={stats.agents.active} icon={<CheckCircle size={20} />} color="green" />
                <StatCard title="Inactive" value={stats.agents.inactive} icon={<AlertCircle size={20} />} color="red" />
                <StatCard title="Pending" value={stats.tasks.pending} icon={<Clock size={20} />} color="amber" />
                <StatCard title="Completed" value={stats.tasks.completed} icon={<CheckCircle size={20} />} color="emerald" />
              </div>
            )}

            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <button
                  onClick={refreshAll}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg font-medium text-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-md hover:shadow-lg"
                >
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm text-white transition-all flex items-center gap-2 shadow-md hover:shadow-lg ${
                    autoRefresh 
                      ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700' 
                      : 'bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800'
                  }`}
                >
                  <Activity size={16} className={autoRefresh ? 'animate-pulse' : ''} />
                  Auto-Refresh {autoRefresh ? 'ON' : 'OFF'}
                </button>
                <div className="ml-auto text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  Last Updated: {lastUpdate.toLocaleTimeString()}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type="text"
                    placeholder="Search agents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="has_pending">Has Pending Tasks</option>
                  <option value="has_completed">Has Completed Scans</option>
                </select>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                  Crypt Inventory by assets ({filteredAgents.length})
                </h3>
              </div>
              {isInitialLoad ? (
                <LoadingState />
              ) : filteredAgents.length === 0 ? (
                <EmptyState message="No agents found" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 w-12"></th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Hostname</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">IP Address</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">OS</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Scans</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Created</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Last Seen</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 min-w-[120px]">
                          <span className="hidden sm:inline">Time Since Contact</span>
                          <span className="sm:hidden">Last Contact</span>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 w-24">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredAgents.map((agent) => (
                        <AgentRow
                          key={agent.agent_id}
                          agent={agent}
                          info={agentTaskInfo.get(agent.agent_id)}
                          expanded={expandedAgents.has(agent.agent_id)}
                          onToggle={() => toggleAgentResults(agent.agent_id)}
                          onTriggerScan={() => triggerScan(agent.agent_id)}
                          isScanTriggered={triggeredScans.has(agent.agent_id)}
                          results={agentResults.get(agent.agent_id) || []}
                          tasks={tasks}
                          expandedResults={expandedResults}
                          toggleResultDetails={toggleResultDetails}
                          loadingResults={loadingResults.has(agent.agent_id)}
                          formatDateTime={formatDateTime}
                          formatTimeSince={formatTimeSince}
                          onRetryFetch={retryFetchResult}
                          retryingResults={retryingResults}
                          getRelativeTime={getRelativeTime}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'downloads' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-start gap-3">
                <FileDown className="text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-1" size={24} />
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">Agent Downloads</h2>
                  <p className="text-slate-600 dark:text-slate-400 mb-4">Download the agent files for your operating system. Extract and run the agent to connect to the audit system.</p>
                  <button
                    className="px-4 py-2 rounded-lg font-medium text-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center gap-2 shadow-md hover:shadow-lg"
                    onClick={fetchFiles}
                  >
                    <RefreshCw size={16} />
                    Refresh File List
                  </button>
                </div>
              </div>
            </div>
            <FileDownloadSection
              title="Linux Agent"
              folderType="linux"
              files={linuxFiles}
              formatBytes={formatBytes}
            />
            <FileDownloadSection
              title="Windows Agent"
              folderType="windows"
              files={windowsFiles}
              formatBytes={formatBytes}
            />
          </div>
        )}

        {activeTab === 'docs' && (
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm animate-fadeIn">
            <DocumentationSection />
          </div>
        )}
      </main>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideInX {
          from {
            transform: scaleX(0);
          }
          to {
            transform: scaleX(1);
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        
        .animate-slideIn {
          animation: slideIn 0.4s ease-out;
        }
        
        .animate-slideInDown {
          animation: slideInDown 0.3s ease-out;
        }
        
        .animate-slideInX {
          animation: slideInX 0.3s ease-out;
          transform-origin: left;
        }
      `}</style>
    </div>
  );
};

// Helper Components
const SkeletonStatCard: React.FC = () => (
  <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm animate-pulse">
    <div className="h-10 w-10 bg-slate-200 dark:bg-slate-800 rounded-lg mb-3"></div>
    <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-16 mb-2"></div>
    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24"></div>
  </div>
);

const StatCard: React.FC<{ title: string; value: number; icon: React.ReactNode; color: string }> = ({ title, value, icon, color }) => {
  const colorClasses = {
    indigo: 'from-indigo-500 to-purple-600',
    green: 'from-green-500 to-emerald-600',
    amber: 'from-amber-500 to-orange-600',
    emerald: 'from-emerald-500 to-teal-600',
    red: 'from-red-500 to-rose-600',
  }[color];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all">
      <div className={`inline-flex p-2 rounded-lg bg-gradient-to-br ${colorClasses} mb-3`}>
        <div className="text-white">{icon}</div>
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-1">{value}</div>
      <div className="text-sm text-slate-600 dark:text-slate-400">{title}</div>
    </div>
  );
};

const Badge: React.FC<{ status: string }> = ({ status }) => {
  const styles = {
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    inactive: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  }[status] || 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles}`}>
      {status.replace('_', ' ')}
    </span>
  );
};

const LoadingState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-12">
    <Loader className="animate-spin text-indigo-600 dark:text-indigo-400 mb-4" size={32} />
    <p className="text-slate-600 dark:text-slate-400">Loading data...</p>
  </div>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center py-12">
    <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
      <AlertCircle className="text-slate-400" size={32} />
    </div>
    <p className="text-slate-600 dark:text-slate-400">{message}</p>
  </div>
);

const AgentRow: React.FC<{
  agent: Agent;
  info?: AgentTaskInfo;
  expanded: boolean;
  onToggle: () => void;
  onTriggerScan: () => void;
  isScanTriggered: boolean;
  results: AuditResult[];
  tasks: Task[];
  expandedResults: Set<string>;
  toggleResultDetails: (id: string) => void;
  loadingResults: boolean;
  formatDateTime: (date: string) => string;
  formatTimeSince: (minutes: number) => string;
  onRetryFetch: (agentId: string, taskId: string) => void;
  retryingResults: Set<string>;
  getRelativeTime: (date: string) => string;
}> = ({ agent, info, expanded, onToggle, onTriggerScan, isScanTriggered, results, tasks, expandedResults, toggleResultDetails, loadingResults, formatDateTime, formatTimeSince, onRetryFetch, retryingResults, getRelativeTime }) => {
  const isScanning = isScanTriggered && (info?.in_progress_tasks ?? 0) > 0;

  return (
    <>
      <tr className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all duration-200 ${expanded ? 'bg-slate-50 dark:bg-slate-800/30' : ''}`}>
        <td className="px-4 py-3">
          <button
            onClick={onToggle}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200"
          >
            {expanded ? (
              <ChevronDown size={18} className="text-slate-700 dark:text-slate-300 transition-transform" />
            ) : (
              <ChevronRight size={18} className="text-slate-700 dark:text-slate-300 transition-transform" />
            )}
          </button>
        </td>
        <td className="px-4 py-3">
          <div className="font-medium text-slate-900 dark:text-slate-100">{agent.hostname}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{agent.agent_id.substring(0, 16)}...</div>
        </td>
        <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{agent.ip_address}</td>
        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-sm">{agent.os_info}</td>
        <td className="px-4 py-3">
          <div className="flex flex-col gap-1">
            {info && info.total_scans > 0 && (
              <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                {info.total_scans} scan{info.total_scans !== 1 ? 's' : ''}
              </div>
            )}
            {info && info.completed_scans > 0 && (
              <Badge status="completed" />
            )}
            {info && info.in_progress_tasks > 0 && (
              <Badge status="in_progress" />
            )}
            {info && info.pending_tasks > 0 && (
              <Badge status="pending" />
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <Badge status={agent.status} />
        </td>
        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
          {formatDateTime(agent.registered_at)}
        </td>
        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
          {formatDateTime(agent.last_seen)}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs ${
            agent.minutes_since_last_seen < 2 ? 'text-green-600 dark:text-green-400 font-semibold' : 
            agent.minutes_since_last_seen > 5 ? 'text-red-600 dark:text-red-400 font-semibold' : 
            'text-slate-600 dark:text-slate-400'
          }`}>
            {formatTimeSince(agent.minutes_since_last_seen)}
          </span>
        </td>
        <td className="px-4 py-3">
          <button
            onClick={onTriggerScan}
            disabled={isScanning}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md"
          >
            {isScanning ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
            {isScanning ? 'Scanning...' : 'Scan'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 dark:bg-slate-800/30">
          <td colSpan={10} className="px-4 py-4 w-full">
            {loadingResults ? (
              <LoadingState />
            ) : (
              <div className="animate-slideInDown w-full overflow-x-hidden">
                <AgentResultsView
                  agentId={agent.agent_id}
                  tasks={tasks}
                  results={results}
                  expandedResults={expandedResults}
                  toggleResultDetails={toggleResultDetails}
                  onRetryFetch={onRetryFetch}
                  retryingResults={retryingResults}
                  getRelativeTime={getRelativeTime}
                />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
};

// 4. Update AgentResultsView Component with Document 2 styling
const AgentResultsView: React.FC<{
  agentId: string;
  tasks: Task[];
  results: AuditResult[];
  expandedResults: Set<string>;
  toggleResultDetails: (id: string) => void;
  onRetryFetch: (agentId: string, taskId: string) => void;
  retryingResults: Set<string>;
  getRelativeTime: (date: string) => string;
}> = ({ agentId, tasks, results, expandedResults, toggleResultDetails, onRetryFetch, retryingResults, getRelativeTime }) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set()); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [showRawJson, setShowRawJson] = useState(false);

  // Get only the latest completed result
  const latestResult = useMemo(() => {
    const completedResults = results
      .filter(r => r.audit_results)
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
    
    return completedResults.length > 0 ? completedResults[0] : null;
  }, [results]);

  const processedSections = useMemo(() => {
    if (!latestResult) return []; // eslint-disable-line @typescript-eslint/no-unsafe-return
    
    const auditData = latestResult.audit_results.with_sudo || 
                      latestResult.audit_results.without_sudo || 
                      latestResult.audit_results;
    
    return processAuditResults(auditData);
  }, [latestResult]);

  const toggleSection = (sectionTitle: string) => { // eslint-disable-line @typescript-eslint/no-unused-vars
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionTitle)) {
        newSet.delete(sectionTitle);
      } else {
        newSet.add(sectionTitle);
      }
      return newSet;
    });
  };

  if (!latestResult) {
    return (
      <div className="text-center py-8 text-slate-600 dark:text-slate-400">
        <AlertCircle className="mx-auto mb-3" size={32} />
        <p>No audit results available for this agent</p>
      </div>
    );
  }

  const auditData = latestResult.audit_results.with_sudo ||  // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                    latestResult.audit_results.without_sudo || 
                    latestResult.audit_results;

  return (
    <div className="space-y-4">
      {/* Header with metadata */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-4 rounded-lg border border-indigo-200 dark:border-indigo-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-2">
              Latest Audit Result
            </h4>
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-slate-600 dark:text-slate-400">Submitted: </span>
                <span className="text-slate-900 dark:text-slate-100">
                  {new Date(latestResult.submitted_at).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-slate-600 dark:text-slate-400">Task ID: </span>
                <code className="text-xs">{latestResult.task_id.substring(0, 16)}...</code>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">OpenSSL Version</div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate"
               title={auditData.openssl_crypto?.version_details?.split('\n')[0] || 'N/A'}>
            {auditData.openssl_crypto?.version_details?.split('\n')[0]?.split(' ')[1] || 'N/A'}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Total Ciphers</div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate"
               title={String(auditData.openssl_crypto?.cipher_information?.total_ciphers || 0)}>
            {auditData.openssl_crypto?.cipher_information?.total_ciphers || 0}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Certificates</div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate"
               title={String(auditData.certificates?.certificates?.length || 0)}>
            {auditData.certificates?.certificates?.length || 0}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">CPU Features</div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate"
               title={String(auditData.hardware_crypto?.crypto_feature_count || 0)}>
            {auditData.hardware_crypto?.crypto_feature_count || 0}
          </div>
        </div>
      </div>

      {/* Sections with Document 2 styling */}
      <div className="space-y-4">
        {processedSections.map((section) => (
          <CollapsibleSection
            key={section.title}
            section={section}
            isExpanded={expandedSections.has(section.title)}
            onToggle={() => toggleSection(section.title)}
          />
        ))}
        
        {/* Raw JSON Section */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowRawJson(!showRawJson)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-slate-500 to-slate-600 rounded-lg text-white">
                <FileText size={18} />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Raw JSON Data</h3>
            </div>
            <div className={`transition-transform duration-500 ease-in-out ${showRawJson ? 'rotate-180' : ''}`}>
              <ChevronDown size={20} className="text-slate-400" />
            </div>
          </button>
          
          <div 
            className={`transition-all duration-500 ease-in-out ${
              showRawJson ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
            }`}
            style={{ overflow: showRawJson ? 'visible' : 'hidden' }}
          >
            <div className="border-t border-slate-200 dark:border-slate-700">
              <pre className="p-4 overflow-auto max-h-96 text-xs bg-slate-900 dark:bg-slate-950 text-green-400 font-mono">
                {JSON.stringify(latestResult.audit_results, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Historical scans summary */}
      {results.length > 1 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <Clock size={16} />
            <span className="text-sm font-medium">
              Showing latest result. {results.length - 1} previous scan{results.length > 2 ? 's' : ''} available in history.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

const FileDownloadSection: React.FC<{
  title: string;
  folderType: string;
  files: FileInfo[];
  formatBytes: (bytes: number) => string;
}> = ({ title, folderType, files, formatBytes }) => {
  const icon = folderType === 'linux' ? <Terminal size={24} /> : <Server size={24} />;
  const color = folderType === 'linux' ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400';
  
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={color}>{icon}</div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          </div>
          <a
            href={`${API_BASE_URL}/api/v1/files/download-zip/${folderType}`}
            download
            className="px-4 py-2 rounded-lg font-medium text-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
          >
            <Download size={16} />
            Download ZIP
          </a>
        </div>
      </div>
    </div>
  );
};

const DocumentationSection: React.FC = () => (
  <div>
    <div className="flex items-start gap-3 mb-8">
      <BookOpen className="text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-1" size={28} />
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          Setup Documentation
        </h2>
        <p className="text-slate-600 dark:text-slate-400">
          Follow these steps to install and configure the crypto audit agents on your systems.
        </p>
      </div>
    </div>
    
    <div className="space-y-6">
      <div className="rounded-xl border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/10 p-6">
        <h3 className="text-xl font-bold mb-4 text-blue-700 dark:text-blue-400">Linux Agent Setup</h3>
        <ol className="space-y-4">
          {[
            { num: 1, text: 'Download the Linux Agent ZIP file from the downloads section' },
            { num: 2, text: 'Extract the ZIP file:', code: 'unzip Linux_Agent.zip' },
            { num: 3, text: 'Navigate to folder:', code: 'cd "Linux Agent"' },
            { num: 4, text: 'Make executable:', code: 'chmod +x install_crypto_agent.sh' },
            { num: 5, text: 'Run installer:', code: 'sudo ./install_crypto_agent.sh' },
            { num: 6, text: 'Agent will automatically start and register with the server' },
          ].map(step => (
            <li key={step.num} className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 dark:bg-blue-500 text-white flex items-center justify-center text-sm font-bold">
                {step.num}
              </span>
              <div className="flex-1">
                <span className="text-slate-900 dark:text-slate-100">{step.text}</span>
                {step.code && (
                  <code className="block mt-1 px-3 py-2 rounded-lg text-sm bg-slate-900 dark:bg-slate-950 text-green-400 font-mono border border-slate-700">
                    {step.code}
                  </code>
                )}
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 p-4 rounded-lg bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800">
          <p className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300">Expected Files:</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">crypto_agent.py, install_crypto_agent.sh, config.json</p>
        </div>
      </div>

      <div className="rounded-xl border-l-4 border-purple-500 bg-purple-50 dark:bg-purple-900/10 p-6">
        <h3 className="text-xl font-bold mb-4 text-purple-700 dark:text-purple-400">Windows Agent Setup</h3>
        <ol className="space-y-4">
          {[
            { num: 1, text: 'Download the Windows Agent ZIP file from the downloads section' },
            { num: 2, text: 'Extract the ZIP file to a directory (e.g., C:\\CryptoAgent)' },
            { num: 3, text: 'Open Command Prompt or PowerShell as Administrator' },
            { num: 4, text: 'Navigate to the extracted folder' },
            { num: 5, text: 'Run installer:', code: 'python install.py' },
            { num: 6, text: 'The agent will be installed as a Windows service and start automatically' },
          ].map(step => (
            <li key={step.num} className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-purple-600 dark:bg-purple-500 text-white flex items-center justify-center text-sm font-bold">
                {step.num}
              </span>
              <div className="flex-1">
                <span className="text-slate-900 dark:text-slate-100">{step.text}</span>
                {step.code && (
                  <code className="block mt-1 px-3 py-2 rounded-lg text-sm bg-slate-900 dark:bg-slate-950 text-green-400 font-mono border border-slate-700">
                    {step.code}
                  </code>
                )}
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 p-4 rounded-lg bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800">
          <p className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300">Expected Files:</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">crypto_agent.py, install.py, config.json</p>
        </div>
      </div>

      <div className="rounded-xl border-l-4 border-green-500 bg-green-50 dark:bg-green-900/10 p-6">
        <h3 className="text-xl font-bold mb-4 text-green-700 dark:text-green-400">Configuration</h3>
        <p className="mb-4 text-slate-900 dark:text-slate-100">
          Edit the <code className="px-2 py-1 rounded text-sm bg-slate-900 dark:bg-slate-950 text-green-400 font-mono">config.json</code> file to configure:
        </p>
        <ul className="space-y-3">
          {[
            { label: 'server_url', desc: 'API server address (default: http://localhost:9000)' },
            { label: 'poll_interval', desc: 'How often the agent checks for tasks (default: 30 seconds)' },
            { label: 'agent_id', desc: 'Auto-generated unique identifier for the agent' },
          ].map((item, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <CheckCircle size={20} className="flex-shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
              <div>
                <strong className="text-slate-900 dark:text-slate-100">{item.label}:</strong>
                <span className="text-slate-700 dark:text-slate-300"> {item.desc}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-900/10 p-6">
        <h3 className="text-xl font-bold mb-4 text-orange-700 dark:text-orange-400">Monitoring & Management</h3>
        <ul className="space-y-3">
          {[
            { icon: <Activity size={20} />, text: 'Agents automatically send heartbeats every poll interval' },
            { icon: <Play size={20} />, text: 'Use the "Scan" button to manually initiate a crypto audit' },
            { icon: <ChevronRight size={20} />, text: 'View audit results by clicking the arrow next to each agent' },
            { icon: <AlertCircle size={20} />, text: 'Agents are marked inactive if no heartbeat is received for 1 minute' },
            { icon: <RefreshCw size={20} />, text: 'Enable auto-refresh to automatically update the dashboard every 10 seconds' },
          ].map((item, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <div className="flex-shrink-0 text-orange-600 dark:text-orange-400 mt-0.5">
                {item.icon}
              </div>
              <span className="text-slate-900 dark:text-slate-100">{item.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </div>
);

export default CryptoAuditDashboard;