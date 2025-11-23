import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, Download, ChevronRight, ChevronDown, Play, Server, Activity, Clock, CheckCircle, AlertCircle, Loader, Search, X, FileDown, Terminal, BookOpen, Shield, Lock, Cpu, FileText, Key, Network, HardDrive, ArrowLeft, Copy, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AgentResultsPage } from '@/components/system-scan/scan-results';


// Access environment variables
const VITE_SYSTEM_SCAN_API_URL = import.meta.env.VITE_SYSTEM_SCAN_API_URL;

// Corporate Color System
const COLORS = {
  primary: '#1e3a8a',      // Deep navy for primary actions
  accent: '#3b82f6',       // Electric blue for CTAs
  success: '#10b981',      // Green for success states
  warning: '#f59e0b',      // Amber for warnings
  critical: '#ef4444',     // Red for errors
  neutral: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  }
};

// Button Styles
const BUTTON_STYLES = {
  primary: "h-10 px-6 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-base rounded-md transition-colors duration-150 flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
  secondary: "h-10 px-6 bg-white hover:bg-gray-50 active:bg-gray-100 text-slate-700 font-medium text-base rounded-md border border-slate-300 transition-colors duration-150 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
  danger: "h-10 px-6 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium text-base rounded-md transition-colors duration-150 flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
  ghost: "h-10 px-4 hover:bg-gray-100 active:bg-gray-200 text-slate-700 font-medium text-base rounded-md transition-colors duration-150 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
};


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
  audit_results: {
    _metadata?: AuditMetadata; // eslint-disable-line @typescript-eslint/no-explicit-any
    // Linux structure
    with_sudo?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    without_sudo?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    // Windows structure
    cryptoapi_info?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    tls_ssl_configuration?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    certificate_stores?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    installed_crypto_software?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    // Common sections
    system_context?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    hardware_crypto?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    system_security?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
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

interface AuditMetadata {
  hostname: string;
  timestamp: string;
  platform: 'Windows' | 'Linux';
  audit_type: string;
}

interface SectionData {
  title: string;
  icon: React.ReactNode;
  color: string;
  data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  subsections?: {
    title: string;
    data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
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
}) => ( // eslint-disable-line @typescript-eslint/no-unused-vars
  <div className={`inline-flex items-center gap-1 text-sm font-medium ${status ? 'text-green-600' : 'text-red-600'}`}>
    {status ? <CheckCircle size={14} /> : <X size={14} />}
    <span className="text-slate-900 dark:text-slate-100">{status ? trueText : falseText}</span>
  </div>
);

// Status Badge Component
const StatusBadge: React.FC<{ status: boolean | string; label?: string }> = ({ status, label }) => {
  if (status === true || status === 'enabled') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-md text-sm font-medium">
        <CheckCircle size={14} />
        {label || 'Enabled'}
      </div>
    );
  }
  if (status === false || status === 'disabled') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-md text-sm font-medium">
        <AlertCircle size={14} />
        {label || 'Disabled'}
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-md text-sm font-medium">
      <AlertCircle size={14} />
      {label || 'Warning'}
    </div>
  );
};

const detectOS = (auditResults: any): 'Windows' | 'Linux' => {
  // Method 1: Check for Windows-specific sections
  if (auditResults.cryptoapi_info || auditResults.tls_ssl_configuration) {
    return 'Windows';
  }
  
  // Method 2: Check for Linux-specific structure
  if (auditResults.with_sudo || auditResults.without_sudo) {
    return 'Linux';
  }
  
  // Method 3: Check _metadata if present
  if (auditResults._metadata?.platform) {
    return auditResults._metadata.platform === 'Windows' ? 'Windows' : 'Linux';
  }
  
  // Default fallback
  return 'Linux';
};

const processAuditResults = (auditResults: any): SectionData[] => { // eslint-disable-line @typescript-eslint/no-explicit-any

  try {
    const os = detectOS(auditResults);
    
    // Normalize data - get the actual audit data regardless of OS
    let normalizedData: any;

    if (os === 'Windows') {
      // Windows data is already at the root level
      normalizedData = auditResults;
    } else {
      // Linux data needs extraction from with_sudo/without_sudo
      normalizedData = auditResults.with_sudo || auditResults.without_sudo || auditResults;
    }

    const sections: SectionData[] = [];

    // System Context Section
    if (normalizedData.system_context) {
      sections.push({
        title: 'System Context',
        icon: <Server size={18} />,
        color: 'blue',
        data: {
          'Operating System': normalizedData.system_context.os_info,
          'Kernel Version': normalizedData.system_context.kernel_version,
          'Crypto Modules Loaded': normalizedData.system_context.crypto_modules?.length || 0
        }
      });
    }

    if (os === 'Windows' && normalizedData.cryptoapi_info) {
      const cryptoapi = normalizedData.cryptoapi_info;

      sections.push({
        title: 'Windows CryptoAPI',
        icon: <Key size={18} />,
        color: 'blue',
        data: {
          'FIPS Mode': cryptoapi.fips_mode_enabled ? 'Enabled' : 'Disabled',
          'Crypto Providers': cryptoapi.cryptographic_providers?.count || 0,
          'Registered Algorithms': cryptoapi.registered_oid_algorithms?.count || 0,
          'ECC Curves': cryptoapi.ecc_curves_registered?.count || 0
        },
        subsections: [
          {
            title: 'Cryptographic Providers',
            data: (cryptoapi.cryptographic_providers?.providers || []).map((p: string) => ({
              'Provider': p
            }))
          },
          // Add more subsections for algorithms, curves, etc.
        ]
      });
    }

    if (os === 'Windows' && normalizedData.tls_ssl_configuration) {
      const tlsConfig = normalizedData.tls_ssl_configuration;

      // Build protocol status
      const protocolStatus: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (tlsConfig.protocol_configurations) {
        tlsConfig.protocol_configurations.forEach((proto: any) => {
          protocolStatus.push({
            'Protocol': proto.protocol,
            'Type': proto.type,
            'Client': proto.client_status,
            'Server': proto.server_status
          });
        });
      }

      sections.push({
        title: 'TLS/SSL Configuration',
        icon: <Lock size={18} />,
        color: 'green',
        data: {
          'Total Cipher Suites': tlsConfig.cipher_suites?.total_cipher_suites || 0,
          'Cipher Suite Order': tlsConfig.cipher_suite_order?.count || 0,
          'Registered Hashes': tlsConfig.registered_hash_algorithms?.count || 0
        },
        subsections: [
          {
            title: 'Protocol Configurations',
            data: protocolStatus
          },
          {
            title: 'Cipher Suite Distribution',
            data: Object.entries(tlsConfig.cipher_suites?.cipher_type_distribution || {}).map(([key, value]) => ({
              'Type': key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              'Count': `${value} ciphers`
            }))
          },
          {
            title: 'Cipher Details',
            data: (tlsConfig.cipher_suites?.cipher_details || []).slice(0, 15).map((c: any) => ({
              'Name': c.name,
              'Type': c.type,
              'Protocols': c.protocols,
              'Key Exchange': c.key_exchange
            }))
          }
        ]
      });
    }

    if (os === 'Linux' && normalizedData.openssl_crypto) {
      const openssl = normalizedData.openssl_crypto;

      // Build Available Algorithms subsection with cleaner format
      const availableAlgos: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (openssl.available_algorithms) {
        Object.entries(openssl.available_algorithms).forEach(([key, value]: [string, any]) => {
          if (value.available) {
            availableAlgos.push({
              'Algorithm': key.toUpperCase(),
              'Status': 'Available'
            });
          }
        });
      }

      // Build Cipher Distribution
      const cipherDist: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (openssl.cipher_information?.cipher_type_distribution) {
        Object.entries(openssl.cipher_information.cipher_type_distribution).forEach(([key, value]) => {
          const readableKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          cipherDist.push({
            'Type': readableKey,
            'Count': `${value} ciphers`
          });
        });
      }

      // Build Protocol Support
      const protocols: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (openssl.protocol_support) {
        openssl.protocol_support
          .filter((proto: any) => proto.available)
          .forEach((proto: any) => {
            protocols.push({
              'Protocol': proto.protocol.toUpperCase().replace('_', '.'),
              'Status': 'Enabled',
              'Cipher Count': proto.cipher_count
            });
        });
      }

      // Build Cipher Details
      const cipherDetails: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (openssl.cipher_information?.cipher_details) {
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
          'OpenSSL Version': openssl.version_details?.split('\n')[0] || 'N/A',
          'FIPS Mode': openssl.fips_mode_enabled ? 'Enabled' : 'Disabled',
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

    if (os === 'Linux' && normalizedData.ssh_crypto) {
      const ssh = normalizedData.ssh_crypto;

      // Build Configured Ciphers
      const ciphers: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (ssh.configuration?.configured_ciphers) {
        ssh.configuration.configured_ciphers.ciphers?.forEach((cipher: string) => {
          ciphers.push({ 'Cipher': cipher });
        });
      }

      // Build MACs
      const macs: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (ssh.configuration?.configured_macs) {
        ssh.configuration.configured_macs.macs?.forEach((mac: string) => {
          macs.push({ 'MAC': mac });
        });
      }

      // Build Key Exchange
      const kex: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (ssh.configuration?.configured_kex) {
        ssh.configuration.configured_kex.kex_algorithms?.forEach((algo: string) => {
          kex.push({ 'Algorithm': algo });
        });
      }

      // Build Host Key Algorithms
      const hostKeys: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (ssh.configuration?.host_key_algorithms) {
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

    if (normalizedData.certificates || (os === 'Windows' && normalizedData.certificate_stores)) {
      if (os === 'Linux' && normalizedData.certificates) {
        const certSummary: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
          'Total Certificates Found': normalizedData.certificates.certificates?.length || 0,
          'Search Paths Used': normalizedData.certificates.search_paths_used?.length || 0
        };

        const certSubsections = normalizedData.certificates.certificates?.map((cert: any, idx: number) => {
          const certName = cert.path.split('/').pop() || `Certificate ${idx + 1}`; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
          return {
              title: `${idx + 1}. ${certName}`,
              data: {
                'File Path': cert.path,
                'Key Algorithm': cert.crypto_information.key_algorithm,
                'Key Size': `${cert.crypto_information.key_size} bits`,
                'Signature Algorithm': cert.crypto_information.signature_algorithm,
                'Uses SHA-1': cert.crypto_information.characteristics?.includes('uses_sha1_signature') ? 'Yes' : 'No',
                'Uses SHA-256': cert.crypto_information.characteristics?.includes('uses_sha256_signature') ? 'Yes' : 'No',
                'RSA Algorithm': cert.crypto_information.characteristics?.includes('rsa_algorithm') ? 'Yes' : 'No'
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
      } else if (os === 'Windows' && normalizedData.certificate_stores) {
        const stores = normalizedData.certificate_stores;

        // Aggregate all certificates from all stores
        const allCerts: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
        let totalCount = 0;

        Object.entries(stores).forEach(([, storeData]: [string, any]) => {
          if (storeData.certificates) {
            totalCount += storeData.certificate_count || 0; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
            
            storeData.certificates.forEach((cert: any) => {
              allCerts.push({
                'Store': storeData.store_name,
                'Subject': cert.subject,
                'Issuer': cert.issuer,
                'Algorithm': cert.public_key_algorithm,
                'Key Size': `${cert.public_key_size} bits`,
                'Signature': cert.signature_algorithm,
                'Valid Until': cert.not_after,
                'Private Key': cert.has_private_key ? 'Yes' : 'No'
              });
            });
          }
        });

        sections.push({
          title: 'Certificate Stores',
          icon: <FileText size={18} />,
          color: 'amber',
          data: {
            'Total Certificates': totalCount,
            'Certificate Stores': Object.keys(stores).length
          },
          subsections: [
            {
              title: 'Certificates (All Stores)',
              data: allCerts.slice(0, 20) // Show first 20
            }
          ]
        });
      }
    }

    if (normalizedData.hardware_crypto) {
      const hw = normalizedData.hardware_crypto;

      // Build CPU Features with readable names
      const cpuFeatures: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (hw.cpu_crypto_features) {
        const featureNames: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
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
              'Status': 'Supported'
            });
          }
        });
      }

      // Build Devices Info
      const devices: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (hw.random_devices && hw.random_devices.length > 0) {
        devices.push({ 'Device Type': 'Random Devices', 'Devices': hw.random_devices.join(', ') });
      }
      if (hw.tpm_devices && hw.tpm_devices.length > 0) {
        devices.push({ 'Device Type': 'TPM Devices', 'Devices': hw.tpm_devices.join(', ') });
      } else {
        devices.push({ 'Device Type': 'TPM Devices', 'Devices': 'None Found' });
      }
      if (hw.crypto_devices && hw.crypto_devices.length > 0) {
        devices.push({ 'Device Type': 'Crypto Devices', 'Devices': hw.crypto_devices.join(', ') });
      } else {
        devices.push({ 'Device Type': 'Crypto Devices', 'Devices': 'None Found' });
      }
      
      sections.push({
        title: 'Hardware Crypto Features',
        icon: <Cpu size={18} />,
        color: 'indigo',
        data: {
          'CPU Model': hw.cpu_information || 'N/A',
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

    if (os === 'Windows' && normalizedData.installed_crypto_software?.installed_crypto_software) {
      const software = normalizedData.installed_crypto_software.installed_crypto_software;

      sections.push({
        title: 'Installed Crypto Software',
        icon: <HardDrive size={18} />,
        color: 'purple',
        data: {
          'Installed Applications': software.count || 0
        },
        subsections: [
          {
            title: 'Crypto-Related Software',
            data: (software.software || []).map((app: any) => ({
              'Application': app.DisplayName,
              'Version': app.DisplayVersion,
              'Publisher': app.Publisher,
              'Install Date': app.InstallDate || 'Unknown'
            }))
          }
        ]
      });
    }

    if (normalizedData.system_security) {
      const security = normalizedData.system_security;

      // Build Crypto Libraries list
      const libraries: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (security.crypto_libraries) {
        (security.crypto_libraries as string[]).forEach((lib: string) => {
          const libName = lib.split('=>')[0]?.trim() || lib;
          libraries.push({ 'Library': libName });
        });
      }
      
      // Build Kernel Algorithms
      const kernelAlgos: { Algorithm: string; Category: string; }[] = [];
      if (security.kernel_crypto_algorithms) {
        (security.kernel_crypto_algorithms as string[]).forEach((algo: string) => {
          const algoName = algo.split(':')[1]?.trim() || algo; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
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

      sections.push({
        title: 'System Security',
        icon: <Shield size={18} />,
        color: 'red',
        data: {
          'FIPS Kernel Mode': security.fips_kernel_mode ? 'Enabled' : 'Disabled',
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

    return sections;

  } catch (error) {
    console.error('Error processing audit results:', error);
    // Return error section
    return [{
      title: 'Processing Error',
      icon: <AlertCircle size={18} />,
      color: 'red',
      data: {
        'Error': 'Failed to process audit data',
        'Details': String(error)
      }
    }];
  }
};

const AgentResultsView: React.FC<{
  agentId: string;
  tasks: Task[];
  results: AuditResult[];
  expandedResults: Set<string>;
  toggleResultDetails: (id: string) => void;
  onRetryFetch: (agentId: string, taskId: string) => void;
  retryingResults: Set<string>;
  getRelativeTime: (date: string) => string;
}> = ({ agentId, tasks, results, expandedResults, toggleResultDetails, onRetryFetch, retryingResults, getRelativeTime }) => { // eslint-disable-line @typescript-eslint/no-unused-vars
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showRawJson, setShowRawJson] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('');

  const latestResult = useMemo(() => {
    const completedResults = results
      .filter(r => r.audit_results)
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

    return completedResults.length > 0 ? completedResults[0] : null;
  }, [results]);

  const os = latestResult ? detectOS(latestResult.audit_results) : 'Linux';

  const processedSections = useMemo(() => {
    if (!latestResult) return [];
    return processAuditResults(latestResult.audit_results);
  }, [latestResult]);

  useEffect(() => {
    if (processedSections.length > 0 && !activeSection) {
      setActiveSection(processedSections[0].title);
    }
  }, [processedSections, activeSection]);

  const toggleSection = (sectionTitle: string) => {
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

  return (
    <div className="space-y-4">
      {/* Header with metadata */}
      <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-lg border-l-4 border-blue-500">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3">
              Latest Audit Result
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div className="flex flex-col gap-1">
                <span className="text-slate-600 dark:text-slate-400 text-xs font-medium uppercase tracking-wide">Submitted</span>
                <span className="text-slate-900 dark:text-slate-100 font-semibold">
                  {new Date(latestResult.submitted_at).toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-slate-600 dark:text-slate-400 text-xs font-medium uppercase tracking-wide">Task ID</span>
                <code className="text-slate-900 dark:text-slate-100 font-semibold">{latestResult.task_id.substring(0, 16)}...</code>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-slate-600 dark:text-slate-400 text-xs font-medium uppercase tracking-wide">OS</span>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    os === 'Windows' ? 'bg-blue-500' : 'bg-green-500'
                  }`} />
                  <span className="text-slate-900 dark:text-slate-100 font-semibold">
                    {os}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {os === 'Linux' ? (
          <>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-6 shadow-sm border-l-4 border-blue-500 min-h-[120px] flex flex-col justify-between">
              <div className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">OpenSSL Version</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100 truncate"
                   title={(latestResult?.audit_results.with_sudo || latestResult?.audit_results.without_sudo)?.openssl_crypto?.version_details?.split('\n')[0] || 'N/A'}>
                {((latestResult?.audit_results.with_sudo || latestResult?.audit_results.without_sudo)?.openssl_crypto?.version_details?.split('\n')[0]?.split(' ')[1]) || 'N/A'}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-6 shadow-sm border-l-4 border-blue-500 min-h-[120px] flex flex-col justify-between">
              <div className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">Total Ciphers</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {(latestResult?.audit_results.with_sudo || latestResult?.audit_results.without_sudo)?.openssl_crypto?.cipher_information?.total_ciphers || 0}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-6 shadow-sm border-l-4 border-blue-500 min-h-[120px] flex flex-col justify-between">
              <div className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">Certificates</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {(latestResult?.audit_results.with_sudo || latestResult?.audit_results.without_sudo)?.certificates?.certificates?.length || 0}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-6 shadow-sm border-l-4 border-blue-500 min-h-[120px] flex flex-col justify-between">
              <div className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">CPU Features</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {(latestResult?.audit_results.with_sudo || latestResult?.audit_results.without_sudo)?.hardware_crypto?.crypto_feature_count || 0}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-6 shadow-sm border-l-4 border-blue-500 min-h-[120px] flex flex-col justify-between">
              <div className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">FIPS Mode</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {latestResult?.audit_results.cryptoapi_info?.fips_mode_enabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-6 shadow-sm border-l-4 border-blue-500 min-h-[120px] flex flex-col justify-between">
              <div className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">Cipher Suites</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {latestResult?.audit_results.tls_ssl_configuration?.cipher_suites?.total_cipher_suites || 0}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-6 shadow-sm border-l-4 border-blue-500 min-h-[120px] flex flex-col justify-between">
              <div className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">Certificates</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {(Object.values(latestResult?.audit_results.certificate_stores || {}) as any[]).reduce((sum: number, store: any) => 
                  sum + (store.certificate_count || 0), 0)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-6 shadow-sm border-l-4 border-blue-500 min-h-[120px] flex flex-col justify-between">
              <div className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">Crypto Providers</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {latestResult?.audit_results.cryptoapi_info?.cryptographic_providers?.count || 0}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sections with Document 2 styling */}
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-700">
            {processedSections.map((section) => (
              <button
                key={section.title}
                onClick={() => setActiveSection(section.title)}
                className={`flex items-center gap-2 px-6 py-4 whitespace-nowrap font-medium transition-colors relative ${
                  activeSection === section.title
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {section.icon}
                <span>{section.title}</span>
                {activeSection === section.title && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
            ))}
          </div>
          
          {/* Active Section Content */}
          <div className="p-6">
            {processedSections
              .filter(section => section.title === activeSection)
              .map(section => (
                <div key={section.title}>
                  {/* Main Data */}
                  <div className="bg-white dark:bg-slate-900 rounded-lg p-4 mb-4">
                    {Object.entries(section.data).map(([key, value]) => (
                      <InfoRow key={key} label={key} value={value} />
                    ))}
                  </div>

                  {/* Subsections */}
                  {section.subsections && section.subsections.length > 0 && (
                    <div className="space-y-4">
                      {section.subsections.map((subsection, idx) => (
                        <CollapsibleSubsection key={idx} subsection={subsection} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
        
        {/* Raw JSON Section */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <button // eslint-disable-line @typescript-eslint/no-misused-promises
            onClick={() => setShowRawJson(!showRawJson)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors duration-150"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <FileText size={18} className="text-slate-700 dark:text-slate-300" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Raw JSON Data</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 hidden sm:inline">Click to {showRawJson ? 'hide' : 'show'}</span>
              <ChevronRight 
                size={20} 
                className={`text-slate-400 transition-transform duration-200 ${showRawJson ? 'rotate-90' : ''}`}
              />
            </div>
          </button>
          
          <div 
            className={`transition-all duration-500 ease-in-out ${
              showRawJson ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
            }`}
            style={{ overflow: showRawJson ? 'auto' : 'hidden' }}
          >
            <div className="border-t border-slate-200 dark:border-slate-700">
              <div className="relative p-6">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(latestResult.audit_results, null, 2));
                  }}
                  className="absolute top-4 right-4 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-md transition-colors duration-150 flex items-center gap-1.5 z-10"
                >
                  <FileDown size={14} />
                  Copy JSON
                </button>
                <pre className="overflow-auto max-h-96 text-sm bg-slate-950 text-emerald-400 font-mono leading-relaxed">
                  {JSON.stringify(latestResult.audit_results, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Historical scans summary */}
      {results.length > 1 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 leading-relaxed">
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

const CollapsibleSubsection: React.FC<{
  subsection: { title: string; data: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}> = ({ subsection }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors duration-150"
      >
        <ChevronRight 
          size={18} 
          className={`text-slate-500 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
        />
        <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-left">{subsection.title}</h4>
      </button>
      
      <div 
        className={`transition-all duration-300 ${
          isExpanded ? 'max-h-[4000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
        style={{ overflow: isExpanded ? 'auto' : 'hidden' }}
      >
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/30">
          {Array.isArray(subsection.data) ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
            {subsection.data.map((item: any, itemIdx: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                <div key={itemIdx} className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors duration-150">
              <div className="grid grid-cols-1">
                    {Object.entries(item).map(([key, value]) => (
                  <div key={key} className="flex flex-col sm:flex-row gap-2 py-1">
                    <span className="text-sm text-slate-500 dark:text-slate-400 flex-shrink-0 sm:min-w-[100px]">{key}:</span>
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
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const InfoRow = ({ label, value }: { label: string; value: any }) => (
  <div className="flex flex-col sm:flex-row py-4 border-b border-slate-100 dark:border-slate-800 last:border-0 gap-2">
    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 sm:min-w-[160px]">{label}</span>
    <span className="text-base text-slate-900 dark:text-slate-100 font-mono break-words flex-1">
      {String(value)}
    </span>
  </div>
);

const CollapsibleSection: React.FC<{
  section: SectionData;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ section, isExpanded, onToggle }) => {
  const [expandedSubsections, setExpandedSubsections] = useState<Set<number>>(new Set());

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


  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <button // eslint-disable-line @typescript-eslint/no-misused-promises
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors duration-150"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-blue-600 dark:text-blue-400">
              {section.icon}
            </div>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{section.title}</h3>
        </div>
        <ChevronRight 
          size={20} 
          className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
        />
      </button>
      
      <div 
        className={`transition-all duration-300 ${
          isExpanded ? 'max-h-[4000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
        style={{ overflow: isExpanded ? 'auto' : 'hidden' }}
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
            <div className="space-y-4">
              {section.subsections.map((subsection, idx) => (
                <div key={idx} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <button // eslint-disable-line @typescript-eslint/no-misused-promises
                    onClick={() => toggleSubsection(idx)}
                    className="w-full px-6 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors duration-150"
                  >
                    <ChevronRight 
                      size={18} 
                      className={`text-slate-500 transition-transform duration-200 flex-shrink-0 ${expandedSubsections.has(idx) ? 'rotate-90' : ''}`}
                    />
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-left">{subsection.title}</h4>
                  </button>
                  
                  <div 
                    className={`transition-all duration-300 ${
                      expandedSubsections.has(idx) ? 'max-h-[4000px] opacity-100' : 'max-h-0 opacity-0'
                    }`}
                    style={{ overflow: expandedSubsections.has(idx) ? 'auto' : 'hidden' }}
                  >
                    <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/30">
                      {Array.isArray(subsection.data) ? (
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                        {subsection.data.map((item: any, itemIdx: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                            <div key={itemIdx} className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors duration-150">
                          <div className="grid grid-cols-1">
                                {Object.entries(item).map(([key, value]) => (
                              <div key={key} className="flex flex-col sm:flex-row gap-2 py-1">
                                <span className="text-sm text-slate-500 dark:text-slate-400 flex-shrink-0 sm:min-w-[100px]">{key}:</span>
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
  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden mt-4">
    <div className="p-4 bg-slate-800 dark:bg-slate-900 border-b border-slate-700">
      <h4 className="font-semibold text-white flex items-center gap-2">
        <FileText size={18} />
        Complete Raw JSON Data
      </h4>
    </div>
    {/* eslint-disable @typescript-eslint/no-unsafe-argument */}
    <pre className="p-4 overflow-auto max-h-96 text-xs bg-slate-900 dark:bg-slate-950 text-green-400 font-mono max-w-full w-full break-words whitespace-pre-wrap">
      {JSON.stringify(auditResults, null, 2)}
    </pre>
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
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'agent-results'>('dashboard');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const processedCompletionsRef = useRef<Set<string>>(new Set());
  const prevTasksRef = useRef<Task[]>([]);
  
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${VITE_SYSTEM_SCAN_API_URL}/api/v1/admin/stats`);
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
      const response = await fetch(`${VITE_SYSTEM_SCAN_API_URL}/api/v1/admin/agents`);
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
      const response = await fetch(`${VITE_SYSTEM_SCAN_API_URL}/api/v1/admin/tasks`);
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
      const response = await fetch(`${VITE_SYSTEM_SCAN_API_URL}/api/v1/admin/agent/${agentId}/results`);
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
        fetch(`${VITE_SYSTEM_SCAN_API_URL}/api/v1/files/list/linux`),
        fetch(`${VITE_SYSTEM_SCAN_API_URL}/api/v1/files/list/windows`)
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
    try {
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
      setIsInitialLoad(false);
    } finally {
      setLoading(false);
    }
  }, [fetchStats, fetchAgents, fetchTasks, expandedAgents, fetchAgentResults]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // R = Refresh
      if (e.key === 'r' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        refreshAll();
      }
      // A = Toggle auto-refresh
      if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAutoRefresh(!autoRefresh);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [autoRefresh, refreshAll]);
  
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
      const response = await fetch(`${VITE_SYSTEM_SCAN_API_URL}/api/v1/admin/trigger-scan/${agentId}`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
        const poll = async (retries: number, delay: number) => {
          if (retries === 0) return;
          
          const tasksResponse = await fetch(`${VITE_SYSTEM_SCAN_API_URL}/api/v1/admin/tasks`);
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
    if (!dateString) return '';
    const diff = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const formatTimeSince = (minutes: number): string => {
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 min ago';
    if (minutes < 60) return `${minutes} mins ago`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
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
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      

      <nav className="bg-card border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
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
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="text-red-600 dark:text-red-400" size={20} />
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <AnimatePresence mode="wait">
            {currentPage === 'dashboard' ? (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
              {/* ALL YOUR EXISTING DASHBOARD CONTENT */}
              {/* Stats cards, search, table, etc. */}
              {isInitialLoad ? (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {[...Array(5)].map((_, i) => (
                    <SkeletonStatCard key={i} />
                  ))}
                </div>
              ) : stats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <StatCard title="Total Agents" value={stats.agents.total} icon={<Server size={20} />} color="indigo" />
                  <StatCard title="Active" value={stats.agents.active} icon={<CheckCircle size={20} />} color="green" />
                  <StatCard title="Inactive" value={stats.agents.inactive} icon={<AlertCircle size={20} />} color="red" />
                  <StatCard title="Pending" value={stats.tasks.pending} icon={<Clock size={20} />} color="amber" />
                  <StatCard title="Completed" value={stats.tasks.completed} icon={<CheckCircle size={20} />} color="emerald" />
                </div>
              )}
  
              <div className="bg-card text-card-foreground rounded-lg p-4 sm:p-6 border shadow-sm">
                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <button
                    onClick={refreshAll}
                    disabled={loading}
                    className={BUTTON_STYLES.primary}
                  >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    {loading ? 'Refreshing...' : 'Refresh'}
                  </button>
                  <button
                    onClick={() => setAutoRefresh(!autoRefresh)}
                    className={`${BUTTON_STYLES.primary} ${autoRefresh ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-600 hover:bg-slate-700'}`}
                  >
                    <Activity size={16} className={autoRefresh ? 'animate-pulse' : ''} />
                    Auto-Refresh {autoRefresh ? 'ON' : 'OFF'}
                  </button>
                  <div className="ml-auto text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                    <div className="text-xs text-slate-500 hidden lg:flex items-center gap-4">
                      <span><kbd className="px-2 py-1 bg-slate-100 rounded text-xs border border-slate-300">⌘R</kbd> Refresh</span>
                      <span><kbd className="px-2 py-1 bg-slate-100 rounded text-xs border border-slate-300">⌘A</kbd> Auto-refresh</span>
                    </div>
                    <div className="lg:hidden">Last Updated: {lastUpdate.toLocaleTimeString()}</div>
                  </div>
                </div>
              </div>
  
              <div className="bg-card text-card-foreground rounded-lg p-4 sm:p-6 border shadow-sm">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                    <input
                      type="text"
                      placeholder="Search agents..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-10 h-14 rounded-lg border bg-muted text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
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
                    className="px-4 py-2 rounded-lg border bg-muted text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all h-14 md:w-auto"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="has_pending">Has Pending Tasks</option>
                    <option value="has_completed">Has Completed Scans</option>
                  </select>
                </div>
              </div>
  
              <div className="bg-card text-card-foreground rounded-lg border shadow-sm overflow-hidden">
                <div className="p-4 sm:p-6 border-b">
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                    Crypto Inventory by Assets ({filteredAgents.length})
                  </h3>
                </div>
                
                {/* Add loading overlay for smooth refresh */}
                <div className="relative">
                  <AnimatePresence>
                    {loading && !isInitialLoad && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-20 flex items-center justify-center"
                      >
                        <div className="bg-white dark:bg-slate-900 px-6 py-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 flex items-center gap-3">
                          <Loader className="animate-spin text-blue-600" size={20} />
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            Updating data...
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
              
                  {isInitialLoad ? (
                    <div className="p-6">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="animate-pulse flex items-center gap-6 py-4 border-b">
                          <div className="h-10 w-10 bg-slate-200 dark:bg-slate-700 rounded" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
                            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                          </div>
                          <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                        </div>
                      ))}
                    </div>
                  ) : filteredAgents.length === 0 ? (
                    <EmptyState message="No agents found" />
                  ) : (
                    <>
                      {/* Desktop Table */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full table-fixed">
                          <thead className="bg-muted border-b-2">
                            <tr style={{ height: '56px' }}>
                              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 dark:text-slate-300 w-1/4">
                                Agent
                              </th>
                              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 dark:text-slate-300 w-1/6">
                                IP Address
                              </th>
                              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 dark:text-slate-300 w-1/6">
                                Operating System
                              </th>
                              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 dark:text-slate-300 w-1/6">
                                Status
                              </th>
                              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 dark:text-slate-300 w-1/6">
                                Scans
                              </th>
                              <th className="px-6 py-4 text-center text-sm font-semibold text-slate-700 dark:text-slate-300 w-32">
                                Actions
                              </th>
                              <th className="px-6 py-4 text-center text-sm font-semibold text-slate-700 dark:text-slate-300 w-16">
                                {/* Expand toggle */}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
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
                                onNavigateToResults={(agent) => {
                                  setSelectedAgent(agent);
                                  setCurrentPage('agent-results');
                                }}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
              
                      {/* Mobile Cards */}
                      <div className="block md:hidden p-4">
                        {filteredAgents.map((agent) => (
                          <MobileAgentCard
                            key={agent.agent_id}
                            agent={agent}
                            info={agentTaskInfo.get(agent.agent_id)}
                            onToggle={() => toggleAgentResults(agent.agent_id)}
                            onTriggerScan={() => triggerScan(agent.agent_id)}
                            isScanTriggered={triggeredScans.has(agent.agent_id)}
                            formatTimeSince={formatTimeSince}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
            ) : currentPage === 'agent-results' && selectedAgent ? (
              <motion.div
                key="agent-results"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <AgentResultsPage
                  agent={selectedAgent}
                  results={agentResults.get(selectedAgent.agent_id) || []}
                  onBack={() => {
                    setCurrentPage('dashboard');
                    setSelectedAgent(null);
                  }}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        )}

        {activeTab === 'downloads' && (
          <div className="space-y-6">
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
          <div className="bg-card text-card-foreground rounded-lg p-6 sm:p-8 border shadow-sm">
            <DocumentationSection />
          </div>
        )}
      </main>
    </div>
  );
};

// Helper Components
const SkeletonStatCard: React.FC = () => (
  <div className="bg-card rounded-lg p-4 sm:p-6 border shadow-sm animate-pulse">
    <div className="h-10 w-10 bg-slate-200 dark:bg-slate-800 rounded-lg mb-3"></div>
    <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-16 mb-2"></div>
    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24"></div>
  </div>
);

const StatCard: React.FC<{ title: string; value: number; icon: React.ReactNode; color: string }> = ({ 
  title, value, icon, color 
}) => {
  const borderColors = {
    indigo: 'border-blue-500',
    green: 'border-green-500',
    amber: 'border-amber-500',
    emerald: 'border-emerald-500',
    red: 'border-red-500',
  }[color];

  return (
    <div className={`bg-card text-card-foreground rounded-lg p-6 border-l-4 ${borderColors} shadow-sm min-h-[140px] flex flex-col justify-between`}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-slate-500 dark:text-slate-400 text-sm font-medium">{title}</div>
        <div className={`text-${color}-600`}>{icon}</div>
      </div>
      <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
};

const Badge: React.FC<{ status: string }> = ({ status }) => {
  const styles = {
    completed: 'bg-green-50 text-green-700 border border-green-200',
    in_progress: 'bg-blue-50 text-blue-700 border border-blue-200',
    pending: 'bg-amber-50 text-amber-700 border border-amber-200',
    active: 'bg-green-50 text-green-700 border border-green-200',
    inactive: 'bg-red-50 text-red-700 border border-red-200',
  }[status] || 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400';

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium border ${styles}`}>
      {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
    </span>
  );
};

const LoadingState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-16">
    <Loader className="animate-spin text-indigo-600 dark:text-indigo-400 mb-4" size={32} />
    <p className="text-slate-600 dark:text-slate-400">Loading data...</p>
  </div>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center py-16">
    <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-800 mb-4">
      <AlertCircle className="text-slate-400" size={40} />
    </div>
    <p className="text-base font-medium text-slate-700 dark:text-slate-300 mb-2">{message}</p>
    <p className="text-sm text-slate-500 dark:text-slate-400">Try adjusting your filters or search query</p>
  </div>
);

const MobileAgentCard: React.FC<{
  agent: Agent;
  info?: AgentTaskInfo;
  onToggle: () => void;
  onTriggerScan: () => void;
  isScanTriggered: boolean;
  formatTimeSince: (minutes: number) => string;
}> = ({ agent, info, onToggle, onTriggerScan, isScanTriggered, formatTimeSince }) => {
  return (
    <div className="bg-card text-card-foreground rounded-lg border p-4 mb-4 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base text-slate-900 dark:text-slate-100 truncate">
            {agent.hostname}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{agent.ip_address}</p>
        </div>
        <Badge status={agent.status} />
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
        <div>
          <span className="text-slate-500 dark:text-slate-400">OS:</span>
          <p className="text-slate-900 dark:text-slate-100 truncate">{agent.os_info}</p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Last Seen:</span>
          <p className="text-slate-900 dark:text-slate-100">
            {formatTimeSince(agent.minutes_since_last_seen)}
          </p>
        </div>
      </div>
      
      {info && info.completed_scans > 0 && (
        <div className="mb-3 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Scans: </span>
          <span className="text-slate-900 dark:text-slate-100 font-medium">
            {info.completed_scans} completed
          </span>
        </div>
      )}
      
      <div className="flex gap-2">
        <button
          onClick={onTriggerScan}
          disabled={isScanTriggered}
          className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium text-sm disabled:opacity-50 transition-colors"
        >
          {isScanTriggered ? 'Scanning...' : 'Scan'}
        </button>
        <button
          onClick={onToggle}
          className="h-10 px-4 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
        >
          Details
        </button>
      </div>
    </div>
  );
};

const SimplifiedAgentView: React.FC<{
  agent: Agent;
  results: AuditResult[];
  info?: AgentTaskInfo;
  formatTimeSince: (minutes: number) => string;
  onViewResults: () => void; // NEW PROP
}> = ({ agent, results, info, formatTimeSince, onViewResults }) => {
  const latestResult = results.length > 0 ? results[0] : null;
  const successRate = results.length > 0 
    ? ((results.filter(r => r.audit_results).length / results.length) * 100).toFixed(0)
    : '0';

  return (
    <div className="space-y-6">
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-lg p-5 border-l-4 border-blue-500 shadow-sm">
          <div className="text-slate-600 dark:text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
            Total Scans
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            {results.length}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-lg p-5 border-l-4 border-green-500 shadow-sm">
          <div className="text-slate-600 dark:text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
            Success Rate
          </div>
          <div className="text-3xl font-bold text-green-600 dark:text-green-400">
            {successRate}%
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-lg p-5 border-l-4 border-purple-500 shadow-sm">
          <div className="text-slate-600 dark:text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
            Latest Scan
          </div>
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {latestResult 
              ? new Date(latestResult.submitted_at).toLocaleDateString() 
              : 'N/A'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-lg p-5 border-l-4 border-amber-500 shadow-sm">
          <div className="text-slate-600 dark:text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
            Last Contact
          </div>
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {formatTimeSince(agent.minutes_since_last_seen)}
          </div>
        </div>
      </div>

      {/* Agent Details Card */}
      <div className="bg-card text-card-foreground rounded-lg p-6 border shadow-sm">
        <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Server size={20} className="text-blue-600" />
          Agent Information
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Hostname
            </span>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {agent.hostname}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              IP Address
          </span> 
            <span className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100">
              {agent.ip_address}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Operating System
            </span>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {agent.os_info}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Registered
            </span>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {new Date(agent.registered_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* View Results Button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onViewResults}
        className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-semibold text-base transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-3"
      >
        <FileText size={20} />
        View All Scan Results ({results.length})
        <ChevronRight size={20} />
      </motion.button>
    </div>
  );
};

const ResultCard: React.FC<{
  result: AuditResult;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onViewDetails: () => void;
}> = ({ result, index, isExpanded, onToggle, onViewDetails }) => {
  const hasData = !!result.audit_results;
  const os = hasData ? detectOS(result.audit_results) : 'Unknown';
  
  // Get key metrics
  const getKeyMetrics = () => {
    if (!hasData) return null;
    
    const normalizedData = os === 'Windows' 
      ? result.audit_results 
      : result.audit_results.with_sudo || result.audit_results.without_sudo || result.audit_results;

    if (os === 'Linux') {
      return {
        opensslVersion: normalizedData.openssl_crypto?.version_details?.split('\n')[0]?.split(' ')[1] || 'N/A',
        totalCiphers: normalizedData.openssl_crypto?.cipher_information?.total_ciphers || 0,
        certificates: normalizedData.certificates?.certificates?.length || 0,
        cpuFeatures: normalizedData.hardware_crypto?.crypto_feature_count || 0
      };
    } else {
      return {
        fipsMode: normalizedData.cryptoapi_info?.fips_mode_enabled ? 'Enabled' : 'Disabled',
        cipherSuites: normalizedData.tls_ssl_configuration?.cipher_suites?.total_cipher_suites || 0,
        certificates: (Object.values(normalizedData.certificate_stores || {}) as any[]).reduce((sum: number, store: any) => 
          sum + (store.certificate_count || 0), 0),
        cryptoProviders: normalizedData.cryptoapi_info?.cryptographic_providers?.count || 0
      };
    }
  };

  const metrics = getKeyMetrics();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      whileHover={{ y: -4 }}
      className="group"
    >
      <Card className={`relative overflow-hidden backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border-2 transition-all duration-300 cursor-pointer ${
        hasData 
          ? 'border-green-200 dark:border-green-800 hover:border-green-400 dark:hover:border-green-600 hover:shadow-xl hover:shadow-green-500/10' 
          : 'border-red-200 dark:border-red-800 hover:border-red-400 dark:hover:border-red-600 hover:shadow-xl hover:shadow-red-500/10'
      }`}>
        {/* Gradient Overlay */}
        <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
          hasData 
            ? 'bg-gradient-to-br from-green-500/5 to-emerald-500/5' 
            : 'bg-gradient-to-br from-red-500/5 to-rose-500/5'
        }`} />

        <CardContent className="p-6 relative z-10">
          {/* Card Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-3 h-3 rounded-full ${
                  hasData 
                    ? 'bg-green-500 shadow-lg shadow-green-500/50 animate-pulse' 
                    : 'bg-red-500 shadow-lg shadow-red-500/50'
                }`} />
                <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
                  Scan #{index + 1}
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Clock size={12} />
                <span>{new Date(result.submitted_at).toLocaleString()}</span>
              </div>
            </div>

            {/* OS Badge */}
            <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
              os === 'Windows' 
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                : os === 'Linux'
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}>
              {os}
            </div>
          </div>

          {/* Status Badge */}
          <div className="mb-4">
            {hasData ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-sm font-semibold">
                <CheckCircle size={16} />
                Scan Completed
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm font-semibold">
                <AlertCircle size={16} />
                Scan Failed
              </div>
            )}
          </div>

          {/* Key Metrics Grid */}
          {hasData && metrics && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              {os === 'Linux' ? (
                <>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                      OpenSSL
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate" title={metrics.opensslVersion}>
                      {metrics.opensslVersion}
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Ciphers
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {metrics.totalCiphers}
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Certificates
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {metrics.certificates}
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                      CPU Features
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {metrics.cpuFeatures}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                      FIPS Mode
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {metrics.fipsMode}
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Cipher Suites
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {metrics.cipherSuites}
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Certificates
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {metrics.certificates}
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Providers
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {metrics.cryptoProviders}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Quick Info */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="grid grid-cols-2 gap-3 text-xs mb-4">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Task ID:</span>
                <div className="font-mono text-slate-900 dark:text-slate-100 mt-1 truncate" title={result.task_id}>
                  {result.task_id.substring(0, 16)}...
                </div>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Received:</span>
                <div className="font-medium text-slate-900 dark:text-slate-100 mt-1">
                  {new Date(result.received_at).toLocaleTimeString()}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetails();
                }}
                disabled={!hasData}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
              >
                <FileText size={16} />
                View Details
              </motion.button>

              {hasData && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(JSON.stringify(result.audit_results, null, 2));
                  }}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center"
                  title="Copy JSON"
                >
                  <Copy size={16} />
                </motion.button>
              )}
            </div>
          </div>

          {/* Expand Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="w-full mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            <span className="font-medium">
              {isExpanded ? 'Hide' : 'Show'} Additional Info
            </span>
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Expanded Additional Info */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="pt-3 space-y-2 text-xs">
                  <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded">
                    <span className="text-slate-500 dark:text-slate-400">Result ID:</span>
                    <span className="font-mono text-slate-900 dark:text-slate-100">
                      {result.result_id.substring(0, 12)}...
                    </span>
                  </div>
                  <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded">
                    <span className="text-slate-500 dark:text-slate-400">Agent ID:</span>
                    <span className="font-mono text-slate-900 dark:text-slate-100">
                      {result.agent_id.substring(0, 12)}...
                    </span>
                  </div>
                  <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded">
                    <span className="text-slate-500 dark:text-slate-400">Duration:</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {((new Date(result.received_at).getTime() - new Date(result.submitted_at).getTime()) / 1000).toFixed(2)}s
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const ExpandedResultModal: React.FC<{
  result: AuditResult;
  onClose: () => void;
}> = ({ result, onClose }) => {
  const [activeTab, setActiveTab] = useState<string>('overview');

  const hasData = !!result.audit_results;
  const os = hasData ? detectOS(result.audit_results) : 'Unknown';
  const processedSections = hasData ? processAuditResults(result.audit_results) : [];

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-md z-40"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="fixed inset-4 md:inset-8 lg:inset-16 z-50 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <Card className="flex flex-col h-full shadow-2xl border-2 border-white/20 ring-1 ring-black/5 backdrop-blur-xl bg-white/95 dark:bg-slate-900/95 overflow-hidden">
          {/* Modal Header */}
          <div className="flex-shrink-0 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border-b-2 border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-4 h-4 rounded-full ${
                    hasData 
                      ? 'bg-green-500 shadow-lg shadow-green-500/50 animate-pulse' 
                      : 'bg-red-500 shadow-lg shadow-red-500/50'
                  }`} />
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    Detailed Scan Results
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <Clock size={14} />
                    <span>{new Date(result.submitted_at).toLocaleString()}</span>
                  </div>
                  <span>•</span>
                  <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    os === 'Windows' 
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                      : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                  }`}>
                    {os}
                  </div>
                  <span>•</span>
                  <span className="font-mono text-xs">
                    Task: {result.task_id.substring(0, 16)}...
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="flex-shrink-0 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <X className="h-6 w-6" />
              </Button>
            </div>
          </div>

          {/* Tabs Navigation */}
          {hasData && (
            <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              <div className="flex overflow-x-auto">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-6 py-4 font-medium text-sm transition-colors relative whitespace-nowrap ${
                    activeTab === 'overview'
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Overview
                  {activeTab === 'overview' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>
                {processedSections.map((section) => (
                  <button
                    key={section.title}
                    onClick={() => setActiveTab(section.title)}
                    className={`px-6 py-4 font-medium text-sm transition-colors relative whitespace-nowrap ${
                      activeTab === section.title
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {section.icon}
                      <span>{section.title}</span>
                    </div>
                    {activeTab === section.title && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                    )}
                  </button>
                ))}
                <button
                  onClick={() => setActiveTab('raw')}
                  className={`px-6 py-4 font-medium text-sm transition-colors relative whitespace-nowrap ${
                    activeTab === 'raw'
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText size={16} />
                    <span>Raw JSON</span>
                  </div>
                  {activeTab === 'raw' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Modal Content */}
          <CardContent className="flex-1 overflow-y-auto p-6">
            {!hasData ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                  <AlertCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
                </div>
                <p className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  Scan Failed
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400 text-center max-w-md">
                  No audit data is available for this scan. The agent may have encountered an error during execution.
                </p>
              </div>
            ) : (
              <>
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                  >
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {os === 'Linux' ? (
                        <>
                          <StatBox
                            label="OpenSSL Version"
                            value={(result.audit_results.with_sudo || result.audit_results.without_sudo)?.openssl_crypto?.version_details?.split('\n')[0]?.split(' ')[1] || 'N/A'}
                            color="blue"
                          />
                          <StatBox
                            label="Total Ciphers"
                            value={(result.audit_results.with_sudo || result.audit_results.without_sudo)?.openssl_crypto?.cipher_information?.total_ciphers || 0}
                            color="green"
                          />
                          <StatBox
                            label="Certificates"
                            value={(result.audit_results.with_sudo || result.audit_results.without_sudo)?.certificates?.certificates?.length || 0}
                            color="amber"
                          />
                          <StatBox
                            label="CPU Features"
                            value={(result.audit_results.with_sudo || result.audit_results.without_sudo)?.hardware_crypto?.crypto_feature_count || 0}
                            color="purple"
                          />
                        </>
                      ) : (
                        <>
                          <StatBox
                            label="FIPS Mode"
                            value={result.audit_results.cryptoapi_info?.fips_mode_enabled ? 'Enabled' : 'Disabled'}
                            color="blue"
                          />
                          <StatBox
                            label="Cipher Suites"
                            value={result.audit_results.tls_ssl_configuration?.cipher_suites?.total_cipher_suites || 0}
                            color="green"
                          />
                          <StatBox
                            label="Certificates"
                            value={(Object.values(result.audit_results.certificate_stores || {}) as any[]).reduce((sum: number, store: any) => sum + (store.certificate_count || 0), 0)}
                            color="amber"
                          />
                          <StatBox
                            label="Crypto Providers"
                            value={result.audit_results.cryptoapi_info?.cryptographic_providers?.count || 0}
                            color="purple"
                          />
                        </>
                      )}
                    </div>

                    {/* Sections Overview */}
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
                        Available Data Sections
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {processedSections.map((section) => (
                          <button
                            key={section.title}
                            onClick={() => setActiveTab(section.title)}
                            className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-600 transition-colors group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors">
                                <div className="text-blue-600 dark:text-blue-400">
                                  {section.icon}
                                </div>
                              </div>
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {section.title}
                              </span>
                            </div>
                            <ChevronRight size={18} className="text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Section Tabs Content */}
                {processedSections.map((section) => (
                  activeTab === section.title && (
                    <motion.div
                      key={section.title}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-4"
                    >
                      <div className="bg-white dark:bg-slate-900 rounded-lg p-4 mb-4">
                        {Object.entries(section.data).map(([key, value]) => (
                          <InfoRow key={key} label={key} value={value} />
                        ))}
                      </div>
                      {section.subsections && section.subsections.length > 0 && (
                        <div className="space-y-4">
                          {section.subsections.map((subsection, idx) => (
                            <CollapsibleSubsection key={idx} subsection={subsection} />
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )
                ))}

                {/* Raw JSON Tab */}
                {activeTab === 'raw' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <RawJsonSection auditResults={result.audit_results} />
                  </motion.div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
};

const StatBox: React.FC<{ label: string; value: string | number; color: string }> = ({ label, value, color }) => (
  <div className={`bg-white dark:bg-slate-900 rounded-lg p-4 border-l-4 border-${color}-500 shadow-sm`}>
    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
      {label}
    </div>
    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 truncate" title={String(value)}>
      {value}
    </div>
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
  onNavigateToResults: (agent: Agent) => void; // NEW
}> = ({ 
  agent, 
  info, 
  expanded, 
  onToggle, 
  onTriggerScan, 
  isScanTriggered, 
  results, 
  tasks, 
  expandedResults, 
  toggleResultDetails, 
  loadingResults, 
  formatDateTime, 
  formatTimeSince, 
  onRetryFetch, 
  retryingResults, 
  getRelativeTime,
  onNavigateToResults // NEW
}) => { // eslint-disable-line @typescript-eslint/no-unused-vars
  const isScanning = isScanTriggered && (info?.in_progress_tasks ?? 0) > 0;

  return (
    <>
      <motion.tr
        layout
        initial={false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={`border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors duration-150 ${
          expanded ? 'bg-slate-50 dark:bg-slate-800/50' : ''
        }`}
        style={{ minHeight: '72px' }}
      >
        {/* Agent Info Column */}
        <td className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              agent.status === 'active' 
                ? 'bg-green-100 dark:bg-green-900/30' 
                : 'bg-red-100 dark:bg-red-900/30'
            }`}>
              <Server size={20} className={
                agent.status === 'active' 
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-red-600 dark:text-red-400'
              } />
            </div>
            <div>
              <div className="font-semibold text-base text-slate-900 dark:text-slate-100">
                {agent.hostname}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                ID: {agent.agent_id.substring(0, 12)}
              </div>
            </div>
          </div>
        </td>

        {/* IP Address */}
        <td className="px-6 py-4">
          <span className="text-sm font-mono text-slate-700 dark:text-slate-300">
            {agent.ip_address}
          </span>
        </td>

        {/* Operating System */}
        <td className="px-6 py-4">
          <span className="text-sm text-slate-700 dark:text-slate-300">
            {agent.os_info}
          </span>
        </td>

        {/* Status with Time */}
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${
              agent.status === 'active' 
                ? 'bg-green-500 shadow-lg shadow-green-500/50 animate-pulse' 
                : 'bg-red-500 shadow-lg shadow-red-500/50'
            }`} />
            <div>
              <div className={`text-sm font-semibold capitalize ${
                agent.status === 'active' 
                  ? 'text-green-700 dark:text-green-400' 
                  : 'text-red-700 dark:text-red-400'
              }`}>
                {agent.status}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {formatTimeSince(agent.minutes_since_last_seen)}
              </div>
            </div>
          </div>
        </td>

        {/* Scans Count */}
        <td className="px-6 py-4">
          {info && info.total_scans > 0 ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-900/30 rounded-md">
                <CheckCircle size={14} className="text-green-600 dark:text-green-400" />
                <span className="text-sm font-semibold text-green-700 dark:text-green-300">
                  {info.completed_scans}
                </span>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                of {info.total_scans}
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">No scans</span>
          )}
        </td>

        {/* Action Button */}
        <td className="px-6 py-4 text-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTriggerScan();
            }}
            disabled={isScanning}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {isScanning ? (
              <span className="flex items-center gap-2">
                <Loader size={14} className="animate-spin" />
                Scanning...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Play size={14} />
                Scan
              </span>
            )}
          </button>
        </td>

        {/* Expand Toggle */}
        <td className="px-6 py-4 text-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            title={expanded ? "Hide details" : "Show details"}
          >
            <ChevronRight
              size={20}
              className={`text-slate-500 dark:text-slate-400 transition-transform duration-300 ${
                expanded ? 'rotate-90' : ''
              }`}
            />
          </button>
        </td>
      </motion.tr>

      {/* Expanded Details Row */}
      <AnimatePresence>
        {expanded && (
          <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-slate-50 dark:bg-slate-800/30"
          >
            <td colSpan={7} className="px-6 py-0">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="py-6">
                  {loadingResults ? (
                    <LoadingState />
                  ) : (
                    <SimplifiedAgentView
                      agent={agent}
                      results={results}
                      info={info}
                      formatTimeSince={formatTimeSince}
                      onViewResults={() => {
                        // This callback will be passed from parent
                        onNavigateToResults(agent);
                      }} />
                  )}
                </div>
              </motion.div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
};

const FileDownloadSection: React.FC<{
  title: string;
  folderType: string;
  files: FileInfo[];
  formatBytes: (bytes: number) => string;
}> = ({ title, folderType, files, formatBytes }) => { // eslint-disable-line @typescript-eslint/no-unused-vars
  const icon = folderType === 'linux' ? <Terminal size={24} /> : <Server size={24} />;
  
  return (
    <div className="bg-card text-card-foreground rounded-lg border shadow-sm overflow-hidden">
      <div className="p-6">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${folderType === 'linux' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
              {icon}
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {folderType === 'linux' ? 'For Ubuntu, Debian, RHEL, CentOS' : 'For Windows Server 2016+'}
              </p>
            </div>
          </div>
          
          <a
            href={`${VITE_SYSTEM_SCAN_API_URL}/api/v1/files/download-zip/${folderType}`}
            download
            className="px-6 py-3 h-12 rounded-md font-medium text-base bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap" // eslint-disable-line react/jsx-no-target-blank
          >
            <Download size={18} />
            Download
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
        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
          Follow these steps to install and configure the crypto audit agents on your systems.
        </p>
      </div>
    </div>
    
    <div className="space-y-6">
      <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/10 p-6">
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
              <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-base font-bold shadow-sm">
                {step.num}
              </span>
              <div className="flex-1">
                <span className="text-slate-900 dark:text-slate-100">{step.text}</span>
                {step.code && (
                  <code className="block mt-2 px-4 py-3 rounded-md text-base bg-slate-950 text-emerald-400 font-mono leading-relaxed">
                    {step.code}
                  </code>
                )}
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 p-6 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-semibold mb-3 text-blue-900 dark:text-blue-300">Expected Files:</p>
          <div className="flex flex-wrap gap-2">
            {['crypto_agent.py', 'install_crypto_agent.sh', 'config.json'].map(file => (
              <code key={file} className="px-2 py-1 rounded text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono border border-slate-200 dark:border-slate-700">
                {file}
              </code>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border-l-4 border-purple-500 bg-purple-50 dark:bg-purple-900/10 p-6">
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
              <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center text-base font-bold shadow-sm">
                {step.num}
              </span>
              <div className="flex-1">
                <span className="text-slate-900 dark:text-slate-100">{step.text}</span>
                {step.code && (
                  <code className="block mt-2 px-4 py-3 rounded-md text-base bg-slate-950 text-emerald-400 font-mono leading-relaxed">
                    {step.code}
                  </code>
                )}
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 p-6 rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-semibold mb-3 text-purple-900 dark:text-purple-300">Expected Files:</p>
          <div className="flex flex-wrap gap-2">
            {['crypto_agent.py', 'install.py', 'config.json'].map(file => (
              <code key={file} className="px-2 py-1 rounded text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono border border-slate-200 dark:border-slate-700">
                {file}
              </code>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border-l-4 border-green-500 bg-green-50 dark:bg-green-900/10 p-6">
        <h3 className="text-xl font-bold mb-4 text-green-700 dark:text-green-400">Configuration</h3>
        <p className="mb-4 text-slate-900 dark:text-slate-100 leading-relaxed">
          Edit the <code className="px-2 py-1 rounded text-sm bg-slate-900 dark:bg-slate-950 text-green-400 font-mono">config.json</code> file to configure:
        </p>
        <ul className="space-y-3">
          {[
            { label: 'server_url', desc: `API server address (default: ${VITE_SYSTEM_SCAN_API_URL})` },
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

      <div className="rounded-lg border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-900/10 p-6">
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