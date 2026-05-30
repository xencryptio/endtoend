// CRITICAL FIXES for Network Data Display Issues:
// 
// 1. FIXED: pqc_analysis is nested in raw_response.pqc_analysis (not directly on domain)
// 2. FIXED: Updated all references from domain.pqc_analysis to domain.raw_response?.pqc_analysis
// 3. FIXED: Added safe navigation operators throughout to prevent crashes
// 4. FIXED: Compliance status extraction from correct path
//
// Changes made in the following functions:
// - calculateCryptoInventory() 
// - calculateTypeDistribution()
// - calculateUsageFrequency()
// - buildVulnerabilityList()
// - calculateCategories()
// - Compliance display in footer

import { useMemo, useState, useEffect, type ElementType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  Cpu,
  ShieldOff,
  AlertTriangle,
  Info,
  TrendingUp,
  Database,
  Code,
  Globe,
  Server,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  RefreshCw,
  Download,
  Filter,
  Search,
  X,
  Network,
  HardDrive,
  Terminal,
  Lock,
  Unlock,
  Zap,
  Activity,
  Eye,
  Layers,
  GitBranch,
} from "lucide-react";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

// Network API Types - FIXED STRUCTURE
interface NetworkDomain {
  url: string;
  pqc_overall_score: number;
  pqc_overall_grade: string;
  pqc_quantum_ready: boolean;
  pqc_security_level: string;
  tls_version?: string;
  primary_cipher_suite?: string;
  primary_signature_algorithm?: string;
  primary_hash_algorithm?: string;
  raw_response?: {
    pqc_analysis?: {
      components?: {
        [key: string]: {
          score: number;
          grade: string;
          algorithm_count: number;
          quantum_safe_count: number;
          algorithms?: Array<{
            algorithm: string;
            algorithm_type: string;
            quantum_safe: boolean;
            security_level?: string;
            quantum_safety_reason?: string;
            recommended_replacement?: string[];
            is_hybrid?: boolean;
            deprecated?: boolean;
            final_score?: number;
          }>;
        };
      };
      critical_vulnerabilities?: string[];
      compliance_status?: Record<string, boolean>;
    };
    tls_configuration?: {
      supported_protocols?: string[];
    };
  };
}

// Code API Types
interface CodeRepository {
  repo_url: string;
  overall_security_score: number;
  algorithms?: Array<{
    algorithm: string;
    category: string;
    quantum_safe: boolean;
    occurrences: number;
    findings?: Array<{
      file_path: string;
      line_number: number;
      context?: string;
    }>;
  }>;
  category_scores?: Array<{
    category_type: string;
    score: number;
    grade: string;
  }>;
}

// System API Types
interface SystemAgent {
  agent_id: string;
  submitted_at: string;
  raw_audit_results?: {
    pqc_score?: {
      overall_score: number;
      overall_grade: string;
      components?: Record<string, {
        score: number;
        grade: string;
        algorithms?: Array<{
          algorithm: string;
          quantum_safe: boolean;
          security_level?: string;
          quantum_safety_reason?: string;
          deprecated?: boolean;
        }>;
      }>;
      algorithm_scores?: Array<{
        algorithm: string;
        quantum_safe: boolean;
      }>;
      critical_vulnerabilities?: string[];
    };
    without_sudo?: {
      system_context?: {
        os_info?: string;
      };
      openssl_crypto?: {
        version_details?: string;
        fips_mode_enabled?: boolean;
        cipher_information?: {
          cipher_type_distribution?: Record<string, number>;
          cipher_details?: Array<{
            name: string;
          }>;
        };
      };
      ssh_crypto?: {
        algorithm_information?: {
          cipher?: {
            total_count?: number;
            algorithm_types?: Record<string, string[]>;
            algorithms?: string[];
          };
        };
        configuration?: {
          configured_kex?: {
            kex_algorithms?: string[];
          };
        };
      };
      certificates?: {
        certificates?: Array<{
          path: string;
          crypto_information?: {
            signature_algorithm: string;
            key_size: number;
          };
        }>;
      };
    };
  };
}

type VulnerabilitySource = "domain" | "repo" | "system";

// Processed vulnerability type
interface ProcessedVulnerability {
  vulnerability_id: string;
  algorithm: string;
  type: string;
  severity: string;
  quantum_risk: string;
  pqc_status: string;
  usage: {
    total_instances: number;
    network_endpoints: number;
    source_code_occurrences: number;
    system_configs: number;
  };
  affected_layers: string[];
  evidence: {
    network?: {
      tls_version?: string;
      cipher_suite?: string;
      certificate?: Record<string, any>;
    } | null;
    source_code?: {
      files: Array<{
        file_path: string;
        line_number: number;
        snippet: string;
      }>;
    } | null;
    system?: {
      openssl_version: string;
      ssh_kex: string[];
    } | null;
  };
  recommendation: {
    strategy: string;
    preferred_algorithms: string[];
    migration_type: string;
    priority: string;
  };
  origin: {
    source: VulnerabilitySource;
    reference: string;
  };
}

interface Category {
  risk_score: number;
  grade: string;
  algorithms: string[];
}

interface ProcessedData {
  overallRisk: {
    score: number;
    grade: string;
  };
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  cryptoInventory: {
    total_algorithms_detected: number;
    quantum_vulnerable_algorithms: number;
    post_quantum_ready_algorithms: number;
    hybrid_compatible_algorithms: number;
  };
  typeDistribution: Record<string, number>;
  usageFrequency: Array<{
    algorithm: string;
    total_occurrences: number;
    contexts: {
      network: number;
      source_code: number;
      system: number;
    };
  }>;
  vulnerabilities: ProcessedVulnerability[];
  categories: Record<string, Category>;
  metadata: {
    network_scans: number;
    code_repos: number;
    system_agents: number;
    last_updated: string;
  };
  compliance: Record<string, boolean>;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const average = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const scoreToGrade = (score: number): string => {
  if (score >= 90) return "A";
  if (score >= 80) return "B+";
  if (score >= 70) return "B";
  if (score >= 60) return "C+";
  if (score >= 50) return "C";
  if (score >= 40) return "D+";
  if (score >= 30) return "D";
  return "F";
};

const getSeverityColor = (severity: string) => {
  switch (severity.toLowerCase()) {
    case "critical":
      return "bg-destructive/10 text-destructive";
    case "high":
      return "bg-warning/10 text-warning";
    case "medium":
    case "low":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const getPQCStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case "quantum-vulnerable":
      return "bg-destructive/10 text-destructive";
    case "hybrid-compatible":
      return "bg-warning/10 text-warning";
    case "post-quantum-ready":
    case "quantum-resistant":
      return "bg-success/10 text-success";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const getRiskGradeColor = (grade: string) => {
  if (grade.startsWith("A")) return "text-success";
  if (grade.startsWith("B")) return "text-primary";
  if (grade.startsWith("C")) return "text-warning";
  if (grade.startsWith("D")) return "text-warning";
  return "text-destructive";
};

const SOURCE_META: Record<VulnerabilitySource, { label: string; icon: ElementType; chipClass: string }> = {
  domain: {
    label: "Domain Scan",
    icon: Globe,
    chipClass: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800",
  },
  repo: {
    label: "Repository Scan",
    icon: GitBranch,
    chipClass: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800",
  },
  system: {
    label: "System Agent",
    icon: Server,
    chipClass: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800",
  },
};

const formatSourceReference = (source: VulnerabilitySource, reference: string): string => {
  const raw = (reference || "unknown").trim();
  if (!raw) return "unknown";

  if (source === "domain") {
    return raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }

  if (source === "repo") {
    return raw.replace(/^https?:\/\//i, "").replace(/\.git$/i, "");
  }

  return raw;
};

// ============================================================================
// DATA PROCESSING FUNCTIONS - FIXED
// ============================================================================

const calculateOverallRisk = (
  networkData: NetworkDomain[],
  codeData: CodeRepository[],
  systemData: SystemAgent[]
) => {
  const networkScores = networkData.map(d => d.pqc_overall_score);
  const codeScores = codeData.map(d => d.overall_security_score);
  const systemScores = systemData.map(d => d.raw_audit_results?.pqc_score?.overall_score || 0);

  const avgNetwork = average(networkScores);
  const avgCode = average(codeScores);
  const avgSystem = average(systemScores);

  const overallScore = (avgNetwork * 0.4) + (avgCode * 0.35) + (avgSystem * 0.25);

  return {
    score: Math.round(overallScore * 100) / 100,
    grade: scoreToGrade(overallScore)
  };
};

const calculateSeverityCounts = (
  networkData: NetworkDomain[],
  codeData: CodeRepository[],
  systemData: SystemAgent[]
) => {
  const networkCritical = networkData.filter(d => d.pqc_security_level === "critical").length;
  const networkHigh = networkData.filter(d => d.pqc_security_level === "high").length;
  const networkMedium = networkData.filter(d => d.pqc_security_level === "medium").length;
  const networkLow = networkData.filter(d => d.pqc_security_level === "low").length;

  const codeCritical = codeData.filter(d => d.overall_security_score < 30).length;
  const codeHigh = codeData.filter(d => d.overall_security_score >= 30 && d.overall_security_score < 50).length;
  const codeMedium = codeData.filter(d => d.overall_security_score >= 50 && d.overall_security_score < 70).length;
  const codeLow = codeData.filter(d => d.overall_security_score >= 70).length;

  const systemCritical = systemData.filter(d => d.raw_audit_results?.pqc_score?.overall_grade === "F").length;
  const systemHigh = systemData.filter(d => ["D", "D+"].includes(d.raw_audit_results?.pqc_score?.overall_grade || "")).length;
  const systemMedium = systemData.filter(d => ["C", "C+"].includes(d.raw_audit_results?.pqc_score?.overall_grade || "")).length;
  const systemLow = systemData.filter(d => ["B", "B+", "A"].includes(d.raw_audit_results?.pqc_score?.overall_grade || "")).length;

  return {
    critical: networkCritical + codeCritical + systemCritical,
    high: networkHigh + codeHigh + systemHigh,
    medium: networkMedium + codeMedium + systemMedium,
    low: networkLow + codeLow + systemLow
  };
};

// FIXED: Access pqc_analysis from raw_response
const calculateCryptoInventory = (
  networkData: NetworkDomain[],
  codeData: CodeRepository[],
  systemData: SystemAgent[]
) => {
  const allAlgorithms = new Set<string>();
  const quantumVulnerable = new Set<string>();
  const pqcReady = new Set<string>();

  // From Network - FIXED PATH
  networkData.forEach(domain => {
    const components = domain.raw_response?.pqc_analysis?.components || {};
    Object.values(components).forEach(component => {
      component.algorithms?.forEach(algo => {
        allAlgorithms.add(algo.algorithm);
        if (!algo.quantum_safe) quantumVulnerable.add(algo.algorithm);
        if (algo.quantum_safe) pqcReady.add(algo.algorithm);
      });
    });
  });

  // From Code
  codeData.forEach(repo => {
    repo.algorithms?.forEach(algo => {
      allAlgorithms.add(algo.algorithm);
      if (!algo.quantum_safe) quantumVulnerable.add(algo.algorithm);
      if (algo.quantum_safe) pqcReady.add(algo.algorithm);
    });
  });

  // From System
  systemData.forEach(agent => {
    const algos = agent.raw_audit_results?.pqc_score?.algorithm_scores || [];
    algos.forEach(algo => {
      allAlgorithms.add(algo.algorithm);
      if (!algo.quantum_safe) quantumVulnerable.add(algo.algorithm);
      if (algo.quantum_safe) pqcReady.add(algo.algorithm);
    });
  });

  return {
    total_algorithms_detected: allAlgorithms.size,
    quantum_vulnerable_algorithms: quantumVulnerable.size,
    post_quantum_ready_algorithms: pqcReady.size,
    hybrid_compatible_algorithms: allAlgorithms.size - quantumVulnerable.size - pqcReady.size
  };
};

// FIXED: Access pqc_analysis from raw_response
const calculateTypeDistribution = (
  networkData: NetworkDomain[],
  codeData: CodeRepository[],
  systemData: SystemAgent[]
) => {
  const distribution: Record<string, number> = {};

  // From Network - FIXED PATH
  networkData.forEach(domain => {
    const components = domain.raw_response?.pqc_analysis?.components || {};
    Object.entries(components).forEach(([type, data]) => {
      distribution[type] = (distribution[type] || 0) + (data.algorithm_count || 0);
    });
  });

  // From Code
  codeData.forEach(repo => {
    repo.algorithms?.forEach(algo => {
      const type = algo.category || "unknown";
      distribution[type] = (distribution[type] || 0) + algo.occurrences;
    });
  });

  // From System
  systemData.forEach(agent => {
    const ciphers = agent.raw_audit_results?.without_sudo?.openssl_crypto?.cipher_information?.cipher_type_distribution || {};
    Object.entries(ciphers).forEach(([type, count]) => {
      distribution[type] = (distribution[type] || 0) + count;
    });
  });

  return distribution;
};

// FIXED: Access pqc_analysis from raw_response
const calculateUsageFrequency = (
  networkData: NetworkDomain[],
  codeData: CodeRepository[],
  systemData: SystemAgent[]
) => {
  const usage = new Map<string, {
    algorithm: string;
    total_occurrences: number;
    contexts: { network: number; source_code: number; system: number };
  }>();

  const addUsage = (algorithm: string, source: 'network' | 'source_code' | 'system', count: number) => {
    if (!usage.has(algorithm)) {
      usage.set(algorithm, {
        algorithm,
        total_occurrences: 0,
        contexts: { network: 0, source_code: 0, system: 0 }
      });
    }
    const entry = usage.get(algorithm)!;
    entry.total_occurrences += count;
    entry.contexts[source] += count;
  };

  // Network data - FIXED PATH
  networkData.forEach(domain => {
    const components = domain.raw_response?.pqc_analysis?.components || {};
    Object.values(components).forEach(component => {
      component.algorithms?.forEach(algo => {
        addUsage(algo.algorithm, 'network', 1);
      });
    });
  });

  // Code data
  codeData.forEach(repo => {
    repo.algorithms?.forEach(algo => {
      addUsage(algo.algorithm, 'source_code', algo.occurrences);
    });
  });

  // System data
  systemData.forEach(agent => {
    const algos = agent.raw_audit_results?.pqc_score?.algorithm_scores || [];
    algos.forEach(algo => {
      addUsage(algo.algorithm, 'system', 1);
    });
  });

  return Array.from(usage.values()).sort((a, b) => b.total_occurrences - a.total_occurrences);
};

// FIXED: Access pqc_analysis from raw_response
const buildVulnerabilityList = (
  networkData: NetworkDomain[],
  codeData: CodeRepository[],
  systemData: SystemAgent[]
): ProcessedVulnerability[] => {
  const vulnerabilities: ProcessedVulnerability[] = [];

  // From Network - include component type and algorithm index for unique keys
  networkData.forEach(domain => {
    const components = domain.raw_response?.pqc_analysis?.components || {};
    Object.entries(components).forEach(([componentType, component]) => {
      component.algorithms?.forEach((algo, algoIndex) => {
        if (!algo.quantum_safe || algo.deprecated) {
          vulnerabilities.push({
            vulnerability_id: `net-${domain.url}-${componentType}-${algo.algorithm}-${algoIndex}`,
            algorithm: algo.algorithm,
            type: algo.algorithm_type,
            severity: algo.security_level || "medium",
            quantum_risk: algo.quantum_safety_reason || "Quantum computer can break this algorithm",
            pqc_status: algo.quantum_safe ? 'quantum-resistant' : 'quantum-vulnerable',
            usage: {
              total_instances: 1,
              network_endpoints: 1,
              source_code_occurrences: 0,
              system_configs: 0
            },
            affected_layers: ['network'],
            evidence: {
              network: {
                tls_version: domain.tls_version,
                cipher_suite: domain.primary_cipher_suite,
                certificate: {
                  signature_algorithm: domain.primary_signature_algorithm,
                  hash_algorithm: domain.primary_hash_algorithm
                }
              },
              source_code: null,
              system: null
            },
            recommendation: {
              strategy: "Upgrade to quantum-resistant alternative",
              preferred_algorithms: algo.recommended_replacement || [],
              migration_type: algo.is_hybrid ? "hybrid" : "full_replacement",
              priority: algo.security_level === "critical" ? "immediate" : "high"
            },
            origin: {
              source: "domain",
              reference: domain.url || "unknown-domain",
            },
          });
        }
      });
    });
  });

  // From Code - include repo index and algorithm index for uniqueness
  codeData.forEach((repo, repoIndex) => {
    repo.algorithms?.forEach((algo, algoIndex) => {
      if (!algo.quantum_safe) {
        vulnerabilities.push({
          vulnerability_id: `code-${repoIndex}-${algo.algorithm}-${algo.category}-${algoIndex}`,
          algorithm: algo.algorithm,
          type: algo.category,
          severity: algo.occurrences > 20 ? 'critical' : algo.occurrences > 10 ? 'high' : 'medium',
          quantum_risk: "Quantum computer can break this algorithm",
          pqc_status: 'quantum-vulnerable',
          usage: {
            total_instances: algo.occurrences,
            network_endpoints: 0,
            source_code_occurrences: algo.occurrences,
            system_configs: 0
          },
          affected_layers: ['source_code'],
          evidence: {
            network: null,
            source_code: {
              files: (algo.findings || []).slice(0, 3).map(f => ({
                file_path: f.file_path,
                line_number: f.line_number,
                snippet: f.context || ""
              }))
            },
            system: null
          },
          recommendation: {
            strategy: "Replace in source code",
            preferred_algorithms: [],
            migration_type: "code_refactor",
            priority: "high"
          },
          origin: {
            source: "repo",
            reference: repo.repo_url || `repo-${repoIndex + 1}`,
          },
        });
      }
    });
  });

  // From System - include component type and algorithm index
  systemData.forEach(agent => {
    const components = agent.raw_audit_results?.pqc_score?.components || {};
    Object.entries(components).forEach(([componentType, component]) => {
      component.algorithms?.forEach((algo, algoIndex) => {
        if (!algo.quantum_safe || algo.deprecated) {
          vulnerabilities.push({
            vulnerability_id: `sys-${agent.agent_id}-${componentType}-${algo.algorithm}-${algoIndex}`,
            algorithm: algo.algorithm,
            type: componentType,
            severity: algo.security_level || "medium",
            quantum_risk: algo.quantum_safety_reason || "Quantum vulnerability detected",
            pqc_status: 'quantum-vulnerable',
            usage: {
              total_instances: 1,
              network_endpoints: 0,
              source_code_occurrences: 0,
              system_configs: 1
            },
            affected_layers: ['system'],
            evidence: {
              network: null,
              source_code: null,
              system: {
                openssl_version: agent.raw_audit_results?.without_sudo?.openssl_crypto?.version_details || "unknown",
                ssh_kex: agent.raw_audit_results?.without_sudo?.ssh_crypto?.configuration?.configured_kex?.kex_algorithms || []
              }
            },
            recommendation: {
              strategy: "Update system configuration",
              preferred_algorithms: [],
              migration_type: "system_upgrade",
              priority: "medium"
            },
            origin: {
              source: "system",
              reference: agent.agent_id || "unknown-agent",
            },
          });
        }
      });
    });
  });

  return vulnerabilities;
};

// FIXED: Access pqc_analysis from raw_response
const calculateCategories = (
  networkData: NetworkDomain[],
  codeData: CodeRepository[],
  systemData: SystemAgent[]
): Record<string, Category> => {
  const categories: Record<string, Category> = {};
  const categoryAlgorithms: Record<string, Set<string>> = {
    kex: new Set(),
    signature: new Set(),
    symmetric: new Set(),
    hash: new Set()
  };
  const categoryScores: Record<string, number[]> = {
    kex: [],
    signature: [],
    symmetric: [],
    hash: []
  };

  // From Network - FIXED PATH
  networkData.forEach(domain => {
    const components = domain.raw_response?.pqc_analysis?.components || {};
    Object.entries(components).forEach(([type, data]) => {
      if (categoryAlgorithms[type]) {
        data.algorithms?.forEach(algo => {
          categoryAlgorithms[type].add(algo.algorithm);
          if (algo.final_score !== undefined) {
            categoryScores[type].push(algo.final_score);
          }
        });
      }
    });
  });

  // From Code
  codeData.forEach(repo => {
    repo.category_scores?.forEach(cat => {
      const type = cat.category_type;
      if (categoryScores[type]) {
        categoryScores[type].push(cat.score);
      }
    });
  });

  // From System
  systemData.forEach(agent => {
    const components = agent.raw_audit_results?.pqc_score?.components || {};
    Object.entries(components).forEach(([type, data]) => {
      if (categoryScores[type]) {
        categoryScores[type].push(data.score);
      }
    });
  });

  // Calculate averages
  Object.keys(categoryAlgorithms).forEach(type => {
    const scores = categoryScores[type];
    const avgScore = average(scores);
    categories[type] = {
      risk_score: Math.round(avgScore * 100) / 100,
      grade: scoreToGrade(avgScore),
      algorithms: Array.from(categoryAlgorithms[type])
    };
  });

  return categories;
};

// ============================================================================
// API FETCH FUNCTIONS
// ============================================================================

const DB_API_BASE = (import.meta.env.VITE_DB_API_URL as string | undefined) || "http://localhost:8001";

const getErrorMessage = async (response: Response): Promise<string> => {
  try {
    const bodyText = await response.text();
    if (!bodyText) return "";

    try {
      const parsed = JSON.parse(bodyText);
      if (typeof parsed?.detail === "string") return parsed.detail;
      if (typeof parsed?.message === "string") return parsed.message;
      if (typeof parsed?.detail?.message === "string") return parsed.detail.message;
    } catch {
      // Fall back to raw response text when body is not JSON
    }

    return bodyText.slice(0, 240);
  } catch {
    return "";
  }
};

const fetchNetworkVulnerabilities = async (): Promise<NetworkDomain[]> => {
  const response = await fetch(`${DB_API_BASE}/vulnerabilities/network`);
  if (!response.ok) {
    const details = await getErrorMessage(response);
    throw new Error(`Network API Error: ${response.status}${details ? ` - ${details}` : ""}`);
  }
  return await response.json();
};

const fetchCodeVulnerabilities = async (): Promise<CodeRepository[]> => {
  const response = await fetch(`${DB_API_BASE}/vulnerabilities/code`);
  if (!response.ok) {
    const details = await getErrorMessage(response);
    throw new Error(`Code API Error: ${response.status}${details ? ` - ${details}` : ""}`);
  }
  return await response.json();
};

const fetchSystemVulnerabilities = async (): Promise<SystemAgent[]> => {
  const response = await fetch(`${DB_API_BASE}/vulnerabilities/system`);
  if (!response.ok) {
    const details = await getErrorMessage(response);
    throw new Error(`System API Error: ${response.status}${details ? ` - ${details}` : ""}`);
  }
  return await response.json();
};

// ============================================================================
// UI COMPONENTS (unchanged)
// ============================================================================

const MetricCard = ({
  title,
  value,
  icon: Icon,
  variant = "default",
}: {
  title: string;
  value: string | number;
  icon?: ElementType;
  variant?: "default" | "critical" | "success" | "warning";
}) => {
  const variants = {
    default: "bg-card border-border shadow-sm",
    critical: "bg-red-50/80 border-red-200 dark:bg-red-950/20 dark:border-red-800/70 shadow-sm",
    success: "bg-emerald-50/80 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/70 shadow-sm",
    warning: "bg-amber-50/80 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/70 shadow-sm",
  };

  const iconColors = {
    default: "text-muted-foreground",
    critical: "text-red-500",
    success: "text-emerald-500",
    warning: "text-amber-500",
  };

  return (
    <div className={`border rounded-xl p-4 ${variants[variant]}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {Icon && <Icon className={`w-4 h-4 ${iconColors[variant]}`} />}
      </div>
      <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
    </div>
  );
}

const RiskGauge = ({ score, grade }: { score: number; grade: string }) => {
  return (
    <div className="flex flex-col items-center justify-center p-6">
      <div className="text-6xl font-bold text-foreground mb-2">
        {grade}
      </div>
      <div className="text-sm font-medium text-muted-foreground">Risk Grade</div>
      <div className="text-xs text-muted-foreground mt-1">{score}/100</div>
    </div>
  );
};

const DistributionChart = ({ distribution }: { distribution: Record<string, number> }) => {
  const data = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  const maxValue = Math.max(...data.map(([_, value]) => value));

  return (
    <div className="space-y-4">
      {data.map(([type, count], index) => (
        <motion.div
          key={type}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: index * 0.05 }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground capitalize">
              {type.replace(/_/g, " ")}
            </span>
            <span className="text-sm font-bold text-primary">{count}</span>
          </div>
          
          <div className="relative h-2 bg-muted border border-border rounded overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(count / maxValue) * 100}%` }}
              transition={{ duration: 1, delay: index * 0.05 }}
              className="h-full bg-primary"
            />
          </div>
        </motion.div>
      ))}
    </div>
  );
};

const UsageHeatmap = ({ data }: { 
  data: Array<{
    algorithm: string;
    total_occurrences: number;
    contexts: { network: number; source_code: number; system: number };
  }>;
}) => {
  const topAlgorithms = data.slice(0, 10);
  const maxOccurrences = Math.max(...topAlgorithms.map(d => d.total_occurrences));

  return (
    <div className="grid grid-cols-1 gap-3">
      {topAlgorithms.map((item, index) => {
        const intensity = (item.total_occurrences / maxOccurrences) * 100;
        const variant = 
          intensity > 75 ? "destructive" :
          intensity > 50 ? "warning" :
          intensity > 25 ? "warning" :
          "primary";

        const variantClasses = {
          destructive: "border-destructive/50 bg-destructive/5",
          warning: "border-warning/50 bg-warning/5",
          primary: "border-primary/50 bg-primary/5"
        };

        return (
          <motion.div
            key={item.algorithm}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: index * 0.05 }}
            className={`border ${variantClasses[variant]} rounded-lg p-3 hover:shadow-md transition-shadow`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-foreground">{item.algorithm}</span>
              <span className="text-lg font-bold text-foreground">{item.total_occurrences}</span>
            </div>
            
            <div className="flex gap-2 text-xs">
              {item.contexts.network > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 bg-muted border border-border rounded">
                  <Globe className="w-3 h-3" />
                  {item.contexts.network}
                </div>
              )}
              {item.contexts.source_code > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 bg-muted border border-border rounded">
                  <Code className="w-3 h-3" />
                  {item.contexts.source_code}
                </div>
              )}
              {item.contexts.system > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 bg-muted border border-border rounded">
                  <Server className="w-3 h-3" />
                  {item.contexts.system}
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

const CategoryPanel = ({ name, category }: { name: string; category: Category }) => {
  return (
    <div className="border border-border bg-card rounded-lg p-4 hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-foreground font-bold capitalize">
              {name.replace(/_/g, " ")}
            </h4>
          </div>
          <div className="text-xs text-muted-foreground">{category.algorithms.length} algorithms</div>
        </div>
        
        <div className="text-right">
          <div className={`text-3xl font-bold ${getRiskGradeColor(category.grade)}`}>
            {category.grade}
          </div>
          <div className="text-xs text-muted-foreground">{category.risk_score}/100</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {category.algorithms.slice(0, 6).map((alg) => (
          <span
            key={alg}
            className="px-2 py-1 bg-muted text-muted-foreground border border-border rounded text-xs hover:border-primary/50 hover:text-foreground transition-colors"
          >
            {alg}
          </span>
        ))}
        {category.algorithms.length > 6 && (
          <span className="px-2 py-1 bg-muted text-muted-foreground border border-border rounded text-xs">
            +{category.algorithms.length - 6}
          </span>
        )}
      </div>
    </div>
  );
};

const DataSourceBadge = ({ 
  icon: Icon, 
  label, 
  count
}: { 
  icon: any; 
  label: string; 
  count: number;
}) => {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-border/70 bg-background/80 rounded-full text-xs font-medium">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold text-foreground">{count}</span>
    </div>
  );
};

const SourcePill = ({ source, reference, compact = false }: { source: VulnerabilitySource; reference: string; compact?: boolean }) => {
  const sourceMeta = SOURCE_META[source];
  const SourceIcon = sourceMeta.icon;
  const normalizedRef = formatSourceReference(source, reference);

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full border ${sourceMeta.chipClass}`}>
        <SourceIcon className="w-3 h-3" />
        {sourceMeta.label}
      </span>
      <div
        className={`text-xs text-muted-foreground ${compact ? "max-w-[220px] truncate" : "font-mono break-all"}`}
        title={normalizedRef}
      >
        {normalizedRef}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PQCDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [pqcStatusFilter, setPqcStatusFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [selectedVuln, setSelectedVuln] = useState<ProcessedVulnerability | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 25;

  const clearFilters = () => {
    setSearchTerm("");
    setSeverityFilter("");
    setPqcStatusFilter("");
    setSourceFilter("");
    setCurrentPage(1);
  };

  // Fetch all three endpoints
  const { data: networkData, isLoading: networkLoading, error: networkError, refetch: refetchNetwork } = useQuery<NetworkDomain[], Error>({
    queryKey: ["vulnerabilities-network"],
    queryFn: fetchNetworkVulnerabilities,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const { data: codeData, isLoading: codeLoading, error: codeError, refetch: refetchCode } = useQuery<CodeRepository[], Error>({
    queryKey: ["vulnerabilities-code"],
    queryFn: fetchCodeVulnerabilities,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const { data: systemData, isLoading: systemLoading, error: systemError, refetch: refetchSystem } = useQuery<SystemAgent[], Error>({
    queryKey: ["vulnerabilities-system"],
    queryFn: fetchSystemVulnerabilities,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Process combined data
  const processedData: ProcessedData | null = useMemo(() => {
    if (!networkData || !codeData || !systemData) return null;

    return {
      overallRisk: calculateOverallRisk(networkData, codeData, systemData),
      severityCounts: calculateSeverityCounts(networkData, codeData, systemData),
      cryptoInventory: calculateCryptoInventory(networkData, codeData, systemData),
      typeDistribution: calculateTypeDistribution(networkData, codeData, systemData),
      usageFrequency: calculateUsageFrequency(networkData, codeData, systemData),
      vulnerabilities: buildVulnerabilityList(networkData, codeData, systemData),
      categories: calculateCategories(networkData, codeData, systemData),
      metadata: {
        network_scans: networkData.length,
        code_repos: codeData.length,
        system_agents: systemData.length,
        last_updated: new Date().toISOString()
      },
      // FIXED: Get compliance from correct path
      compliance: networkData[0]?.raw_response?.pqc_analysis?.compliance_status || {}
    };
  }, [networkData, codeData, systemData]);

  // Filter vulnerabilities
  const filteredVulnerabilities = useMemo(() => {
    if (!processedData) return [];

    return processedData.vulnerabilities.filter((vuln) => {
      const matchesSearch =
        searchTerm === "" ||
        vuln.algorithm.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vuln.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vuln.quantum_risk.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vuln.origin.reference.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesSeverity =
        severityFilter === "" || vuln.severity.toLowerCase() === severityFilter.toLowerCase();

      const matchesPQC =
        pqcStatusFilter === "" || vuln.pqc_status.toLowerCase() === pqcStatusFilter.toLowerCase();

      const matchesSource =
        sourceFilter === "" || vuln.origin.source === sourceFilter;

      return matchesSearch && matchesSeverity && matchesPQC && matchesSource;
    });
  }, [processedData, searchTerm, severityFilter, pqcStatusFilter, sourceFilter]);

  const sourceBreakdown = useMemo(() => {
    const totals = { domain: 0, repo: 0, system: 0 };
    filteredVulnerabilities.forEach((vuln) => {
      totals[vuln.origin.source] += 1;
    });
    return totals;
  }, [filteredVulnerabilities]);

  const pagedVulnerabilities = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredVulnerabilities.slice(start, start + PAGE_SIZE);
  }, [filteredVulnerabilities, currentPage]);

  const activeFilterCount = [
    searchTerm.trim() !== "",
    severityFilter !== "",
    pqcStatusFilter !== "",
    sourceFilter !== "",
  ].filter(Boolean).length;

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredVulnerabilities.length / PAGE_SIZE));
    if (currentPage > maxPage) setCurrentPage(maxPage);
  }, [filteredVulnerabilities.length, currentPage]);

  const isLoading = networkLoading || codeLoading || systemLoading;
  const hasError = networkError || codeError || systemError;

  const combinedErrorMessage = [
    networkError?.message,
    codeError?.message,
    systemError?.message,
  ].filter(Boolean).join(" | ");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-16 h-16 border-4 border-primary border-t-transparent mx-auto mb-6"
          />
          <h2 className="text-2xl font-bold text-foreground mb-2">Initializing Scan...</h2>
          <p className="text-sm text-muted-foreground">Aggregating network, code, and system data</p>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-2xl w-full text-center border border-destructive/50 bg-destructive/5 rounded-lg p-8 space-y-4">
          <ShieldAlert className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="text-2xl font-bold text-foreground">Vulnerabilities Data Unavailable</h2>
          <p className="text-sm text-muted-foreground">
            {combinedErrorMessage || "One or more vulnerability data sources could not be loaded."}
          </p>
          <button
            onClick={() => {
              void Promise.all([refetchNetwork(), refetchCode(), refetchSystem()]);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (!processedData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center border border-destructive/50 bg-destructive/5 rounded-lg p-8">
          <ShieldAlert className="w-20 h-20 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-4">
            Data Integration Failed
          </h2>
          <p className="text-muted-foreground">Unable to process vulnerability data from all sources</p>
        </div>
      </div>
    );
  }

  // Check if all data sources are empty
  const hasNoData = 
    (!networkData || networkData.length === 0) &&
    (!codeData || codeData.length === 0) &&
    (!systemData || systemData.length === 0);

  if (hasNoData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center border border-border bg-card rounded-xl p-10 space-y-4">
          <div className="relative">
            <Shield className="w-20 h-20 text-muted-foreground/30 mx-auto" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 border-4 border-dashed border-muted-foreground/20 rounded-full" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-foreground">No Vulnerability Data</h2>
          <p className="text-sm text-muted-foreground">
            No scans, repositories, or system agents have been analyzed yet.
            Start by scanning a domain, analyzing code, or collecting system data.
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={() => window.location.href = "/scan"}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90"
            >
              <Globe className="w-4 h-4" /> Scan Domain
            </button>
            <button
              onClick={() => {
                void Promise.all([refetchNetwork(), refetchCode(), refetchSystem()]);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-muted text-foreground hover:bg-muted/80"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <style>{`
        ::-webkit-scrollbar {
          width: 8px;
        }

        ::-webkit-scrollbar-track {
          background: hsl(var(--background));
        }

        ::-webkit-scrollbar-thumb {
          background: hsl(var(--muted));
          border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--muted-foreground));
        }
      `}</style>

      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/10 via-emerald-500/5 to-transparent" />
        {/* Header */}
        <div className="relative z-10 border-b bg-card/80 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
              Post-Quantum Cryptography Dashboard
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base mt-2">
              Multi-source vulnerability assessment
            </p>
          </div>

          <div className="border-t bg-muted/20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
              <DataSourceBadge icon={Globe} label="Network" count={processedData.metadata.network_scans} />
              <DataSourceBadge icon={GitBranch} label="Repos" count={processedData.metadata.code_repos} />
              <DataSourceBadge icon={Server} label="Agents" count={processedData.metadata.system_agents} />
              
              <div className="ml-auto text-xs text-muted-foreground">
                Last updated: {new Date(processedData.metadata.last_updated).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
          {/* Risk Score Hero */}
          <div className="relative overflow-hidden border border-border bg-gradient-to-r from-primary/10 via-card to-emerald-500/10 rounded-2xl p-8">
            <div className="absolute -right-12 -top-12 w-40 h-40 bg-primary/20 blur-3xl rounded-full pointer-events-none" />
            <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-3">
                  Overall Quantum Risk Assessment
                </div>
                <div className="text-6xl sm:text-7xl font-bold text-foreground mb-3">
                  {processedData.overallRisk.grade}
                </div>
                <div className="text-muted-foreground text-sm">
                  Risk Score: <span className="text-foreground font-bold">{processedData.overallRisk.score}</span>/100
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-background/70 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Critical</div>
                  <div className="text-xl font-bold text-red-500">{processedData.severityCounts.critical}</div>
                </div>
                <div className="rounded-xl border border-border bg-background/70 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">High</div>
                  <div className="text-xl font-bold text-amber-500">{processedData.severityCounts.high}</div>
                </div>
                <div className="rounded-xl border border-border bg-background/70 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total</div>
                  <div className="text-xl font-bold text-foreground">{processedData.vulnerabilities.length}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Critical"
              value={processedData.severityCounts.critical}
              icon={ShieldAlert}
              variant="critical"
            />
            <MetricCard
              title="High Risk"
              value={processedData.severityCounts.high}
              icon={ShieldAlert}
              variant="warning"
            />
            <MetricCard
              title="Medium Risk"
              value={processedData.severityCounts.medium}
              icon={Shield}
              variant="default"
            />
            <MetricCard
              title="Low Risk"
              value={processedData.severityCounts.low}
              icon={ShieldCheck}
              variant="success"
            />
          </div>

          {/* Cryptographic Inventory */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total Algorithms"
              value={processedData.cryptoInventory.total_algorithms_detected}
              icon={Cpu}
              variant="default"
            />
            <MetricCard
              title="Quantum Vulnerable"
              value={processedData.cryptoInventory.quantum_vulnerable_algorithms}
              icon={Unlock}
              variant="critical"
            />
            <MetricCard
              title="Hybrid Compatible"
              value={processedData.cryptoInventory.hybrid_compatible_algorithms}
              icon={Shield}
              variant="warning"
            />
            <MetricCard
              title="Post Quantum Ready"
              value={processedData.cryptoInventory.post_quantum_ready_algorithms}
              icon={Lock}
              variant="success"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="border border-border bg-card/95 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <span>Algorithm Type Distribution</span>
              </h3>
              <DistributionChart distribution={processedData.typeDistribution} />
            </div>

            <div className="border border-border bg-card/95 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                <span>Usage Heatmap</span>
              </h3>
              <UsageHeatmap data={processedData.usageFrequency} />
            </div>
          </div>

          {/* Vulnerabilities Section */}
          <div>
            <div className="mb-6 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <h2 className="text-3xl font-bold flex items-center gap-3">
                  <Database className="w-7 h-7 text-primary" />
                  <span>Multi-Source Vulnerabilities</span>
                </h2>

                <div className="flex flex-wrap items-center gap-2">
                  <DataSourceBadge icon={Globe} label="Domain" count={sourceBreakdown.domain} />
                  <DataSourceBadge icon={GitBranch} label="Repo" count={sourceBreakdown.repo} />
                  <DataSourceBadge icon={Server} label="System" count={sourceBreakdown.system} />
                  {activeFilterCount > 0 && (
                    <span className="inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-full border border-primary/40 bg-primary/10 text-primary">
                      {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card/95 p-4 sm:p-5 shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search algorithm, risk, source reference..."
                      className="w-full pl-11 pr-11 py-2.5 bg-background border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm rounded-xl"
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <button
                    onClick={clearFilters}
                    className="px-3.5 py-2.5 text-sm rounded-xl border border-border bg-background hover:bg-muted/40 text-foreground transition-colors"
                  >
                    Reset Filters
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 mr-1 text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                    <Filter className="w-3.5 h-3.5" />
                    Filters
                  </div>

                  <select
                    value={severityFilter}
                    onChange={(e) => { setSeverityFilter(e.target.value); setCurrentPage(1); }}
                    className="px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground"
                  >
                    <option value="">All Severity</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>

                  <select
                    value={pqcStatusFilter}
                    onChange={(e) => { setPqcStatusFilter(e.target.value); setCurrentPage(1); }}
                    className="px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground"
                  >
                    <option value="">All PQC Status</option>
                    <option value="quantum-vulnerable">Quantum Vulnerable</option>
                    <option value="hybrid-compatible">Hybrid Compatible</option>
                    <option value="post-quantum-ready">Post-Quantum Ready</option>
                  </select>

                  <select
                    value={sourceFilter}
                    onChange={(e) => { setSourceFilter(e.target.value); setCurrentPage(1); }}
                    className="px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground"
                  >
                    <option value="">All Sources</option>
                    <option value="domain">Domain Scan</option>
                    <option value="repo">Repository Scan</option>
                    <option value="system">System Agent</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
                <div className="text-sm text-muted-foreground">
                  Showing <span className="font-bold text-foreground">{filteredVulnerabilities.length}</span> of{" "}
                  <span className="font-bold text-foreground">{processedData.vulnerabilities.length}</span> vulnerabilities
                </div>
                <div className="text-xs text-muted-foreground">Select a row to open detailed evidence and remediation</div>
              </div>
            </div>

            <div className="overflow-x-auto border border-border bg-card rounded-2xl shadow-sm">
              <table className="w-full table-auto text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Algorithm</th>
                    <th className="text-left p-3">Severity</th>
                    <th className="text-left p-3">PQC Status</th>
                    <th className="text-left p-3">Source</th>
                    <th className="text-right p-3">Instances</th>
                    <th className="text-center p-3"> </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVulnerabilities.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((vuln, idx) => (
                    <tr
                      key={vuln.vulnerability_id}
                      className="border-t border-border hover:bg-muted/10 cursor-pointer"
                      onClick={() => setSelectedVuln(vuln)}
                    >
                      <td className="p-3 align-top">
                        <div className="font-medium text-foreground">{vuln.algorithm}</div>
                        <div className="text-xs text-muted-foreground">{vuln.type}</div>
                      </td>
                      <td className="p-3 align-top">
                        <span className={`px-2 py-1 text-xs font-bold border rounded ${getSeverityColor(vuln.severity)}`}>
                          {vuln.severity}
                        </span>
                      </td>
                      <td className="p-3 align-top">
                        <span className={`px-2 py-1 text-xs font-bold border rounded ${getPQCStatusColor(vuln.pqc_status)}`}>
                          {vuln.pqc_status.replace(/-/g, " ")}
                        </span>
                      </td>
                      <td className="p-3 align-top">
                        {(() => {
                          const sourceMeta = SOURCE_META[vuln.origin.source];
                          const SourceIcon = sourceMeta.icon;
                          return (
                            <div className="space-y-1">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full border ${sourceMeta.chipClass}`}>
                                <SourceIcon className="w-3 h-3" />
                                {sourceMeta.label}
                              </span>
                              <div className="text-xs text-muted-foreground max-w-[250px] truncate" title={vuln.origin.reference}>
                                {formatSourceReference(vuln.origin.source, vuln.origin.reference)}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-3 align-top text-right">
                        <div className="font-bold text-foreground">{vuln.usage.total_instances}</div>
                      </td>
                      <td className="p-3 text-center">
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filteredVulnerabilities.length > PAGE_SIZE && (
              <div className="flex items-center justify-end gap-2 mt-3">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1 bg-background border border-border rounded-md text-sm"
                >
                  Previous
                </button>
                <div className="text-sm text-muted-foreground">
                  Page {currentPage} of {Math.ceil(filteredVulnerabilities.length / PAGE_SIZE)}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredVulnerabilities.length / PAGE_SIZE), p + 1))}
                  className="px-3 py-1 bg-background border border-border rounded-md text-sm"
                >
                  Next
                </button>
              </div>
            )}

            {/* Drawer */}
            <AnimatePresence>
              {selectedVuln && (
                <>
                  <motion.div
                    key="backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.4 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black z-40"
                    onClick={() => setSelectedVuln(null)}
                  />

                  <motion.aside
                    key="drawer"
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'tween' }}
                    className="fixed right-0 top-0 h-full w-[44rem] max-w-full bg-background z-50 border-l border-border shadow-lg overflow-auto"
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-2xl font-bold text-foreground">{selectedVuln.algorithm}</h3>
                          <div className="text-xs text-muted-foreground mt-1">{selectedVuln.type}</div>
                          <div className="mt-2">
                            {(() => {
                              const sourceMeta = SOURCE_META[selectedVuln.origin.source];
                              const SourceIcon = sourceMeta.icon;
                              return (
                                <div className="space-y-1">
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full border ${sourceMeta.chipClass}`}>
                                    <SourceIcon className="w-3 h-3" />
                                    {sourceMeta.label}
                                  </span>
                                  <div className="text-xs text-muted-foreground font-mono break-all">
                                    {formatSourceReference(selectedVuln.origin.source, selectedVuln.origin.reference)}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setSelectedVuln(null)} className="text-muted-foreground hover:text-foreground">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-6 space-y-6">
                        <div>
                          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                            <Database className="w-3 h-3" />
                            Usage Distribution
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="border border-primary/50 bg-primary/5 rounded-lg p-3">
                              <Globe className="w-5 h-5 text-primary mb-2" />
                              <div className="text-2xl font-bold text-foreground">{selectedVuln.usage.network_endpoints}</div>
                              <div className="text-xs text-muted-foreground">Network</div>
                            </div>

                            <div className="border border-border bg-card rounded-lg p-3">
                              <Code className="w-5 h-5 text-foreground mb-2" />
                              <div className="text-2xl font-bold text-foreground">{selectedVuln.usage.source_code_occurrences}</div>
                              <div className="text-xs text-muted-foreground">Code</div>
                            </div>

                            <div className="border border-border bg-card rounded-lg p-3">
                              <Server className="w-5 h-5 text-foreground mb-2" />
                              <div className="text-2xl font-bold text-foreground">{selectedVuln.usage.system_configs}</div>
                              <div className="text-xs text-muted-foreground">System</div>
                            </div>
                          </div>
                        </div>

                        {(selectedVuln.evidence.network || selectedVuln.evidence.source_code || selectedVuln.evidence.system) && (
                          <div>
                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                              <Eye className="w-3 h-3" />
                              Evidence Trail
                            </div>
                            <div className="space-y-2">
                              {selectedVuln.evidence.network && (
                                <div className="border border-primary/50 bg-primary/5 rounded-lg p-3 text-xs">
                                  <div className="text-foreground font-bold mb-2 flex items-center gap-2">
                                    <Network className="w-3 h-3" />
                                    Network Layer
                                  </div>
                                  <div className="space-y-1 text-muted-foreground">
                                    {selectedVuln.evidence.network.tls_version && <div>TLS: {selectedVuln.evidence.network.tls_version}</div>}
                                    {selectedVuln.evidence.network.cipher_suite && <div className="truncate">Cipher: {selectedVuln.evidence.network.cipher_suite}</div>}
                                  </div>
                                </div>
                              )}

                              {selectedVuln.evidence.source_code && selectedVuln.evidence.source_code.files.length > 0 && (
                                <div className="border border-border bg-card rounded-lg p-3 text-xs">
                                  <div className="text-foreground font-bold mb-2 flex items-center gap-2">
                                    <Code className="w-3 h-3" />
                                    Source Code
                                  </div>
                                  {selectedVuln.evidence.source_code.files.slice(0, 5).map((file, i) => (
                                    <div key={i} className="text-muted-foreground mt-2 border-l-2 border-border pl-2">
                                      <div className="text-foreground text-xs">{file.file_path}:{file.line_number}</div>
                                      <div className="text-muted-foreground text-xs mt-1 truncate">{file.snippet}</div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {selectedVuln.evidence.system && (
                                <div className="border border-border bg-card rounded-lg p-3 text-xs">
                                  <div className="text-foreground font-bold mb-2 flex items-center gap-2">
                                    <HardDrive className="w-3 h-3" />
                                    System Config
                                  </div>
                                  <div className="space-y-1 text-muted-foreground">
                                    <div>OpenSSL: {selectedVuln.evidence.system.openssl_version}</div>
                                    {selectedVuln.evidence.system.ssh_kex.length > 0 && (
                                      <div>SSH Kex: {selectedVuln.evidence.system.ssh_kex.slice(0, 3).join(", ")}</div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        <div>
                          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                            <AlertTriangle className="w-3 h-3" />
                            Remediation
                          </div>
                          <div className="border border-warning/50 bg-warning/5 rounded-lg p-4">
                            <div className="flex items-start gap-3 mb-3">
                              <Zap className="w-5 h-5 text-warning flex-shrink-0 mt-1" />
                              <div>
                                <div className="text-foreground font-bold text-sm mb-1">{selectedVuln.recommendation.strategy}</div>
                                <div className="text-xs text-muted-foreground">Priority: <span className="text-foreground font-bold">{selectedVuln.recommendation.priority.toUpperCase()}</span> | Type: {selectedVuln.recommendation.migration_type.toUpperCase()}</div>
                              </div>
                            </div>

                            {selectedVuln.recommendation.preferred_algorithms.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {selectedVuln.recommendation.preferred_algorithms.map((alg) => (
                                  <span key={alg} className="px-3 py-1 bg-success/20 text-success border border-success/30 rounded text-xs font-bold">→ {alg}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.aside>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Categories */}
          <div>
            <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
              <Shield className="w-7 h-7 text-primary" />
              <span>Cryptographic Categories</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(processedData.categories).map(([name, category]) => (
                <CategoryPanel key={name} name={name} category={category} />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border pt-6 pb-4">
            <div className="flex items-start gap-3 text-xs text-muted-foreground">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
              <div className="space-y-2">
                <p>
                  <span className="text-foreground font-bold">Data Integration:</span> Network ({processedData.metadata.network_scans} scans) + Code ({processedData.metadata.code_repos} repos) + System ({processedData.metadata.system_agents} agents)
                </p>
                <p>
                  <span className="text-foreground font-bold">Compliance Status:</span> {
                    Object.entries(processedData.compliance)
                      .map(([key, value]) => `${key}: ${value ? '✓' : '✗'}`)
                      .join(' | ') || 'No compliance data available'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}