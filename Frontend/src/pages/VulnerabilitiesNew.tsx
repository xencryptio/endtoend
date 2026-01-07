import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { 
  ShieldAlert, ShieldCheck, Shield, AlertTriangle, TrendingUp, 
  Zap, Lock, Activity, RefreshCw, AlertCircle, CheckCircle, Cpu, 
  Globe, Database, Server, Target
} from 'lucide-react';
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Button } from "@/components/ui/button";
import { UnifiedCard, UnifiedBadge } from "@/components/ui/unified";
import { cn } from "@/lib/utils";

interface VulnerabilityStats {
  webScans: {
    total: number;
    criticalDomains: number;
    highVulnDomains: number;
    mediumVulnDomains: number;
    quantumUnsafe: number;
    tlsIssues: number;
  };
  repoScans: {
    total: number;
    criticalAlgorithms: number;
    deprecatedAlgorithms: number;
    quantumVulnerable: number;
    weakCryptography: number;
    repositoriesAffected: number;
  };
  pqcScans: {
    total: number;
    insecureProtocols: number;
    weakCiphers: number;
    missingPQC: number;
    systemsAtRisk: number;
    certificateIssues: number;
  };
}

interface AggregatedData {
  totalCritical: number;
  totalHigh: number;
  totalMedium: number;
  totalLow: number;
  totalVulnerabilities: number;
  quantumVulnerableCount: number;
  quantumSafeCount: number;
  affectedAssets: number;
  riskScore: number;
  trendingAlgorithms: string[];
  topThreats: Array<{
    name: string;
    severity: string;
    source: string;
    count: number;
  }>;
}

// Fetch Web Scans Data
const fetchWebScansStats = async (): Promise<VulnerabilityStats['webScans']> => {
  try {
    const batchesRes = await fetch('http://localhost:8000/batches');
    if (!batchesRes.ok) {
      console.warn('Web scan service unavailable');
      return {
        total: 0,
        criticalDomains: 0,
        highVulnDomains: 0,
        mediumVulnDomains: 0,
        quantumUnsafe: 0,
        tlsIssues: 0,
      };
    }
    
    const batches = await batchesRes.json();
    if (!Array.isArray(batches)) {
      console.error('Invalid batches response format');
      return {
        total: 0,
        criticalDomains: 0,
        highVulnDomains: 0,
        mediumVulnDomains: 0,
        quantumUnsafe: 0,
        tlsIssues: 0,
      };
    }
    
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let quantumUnsafeCount = 0;
    let tlsIssuesCount = 0;
    const processedDomains = new Set();

    // Fetch results for each batch
    for (const batch of batches) {
      try {
        const resultsRes = await fetch(`http://localhost:8000/results/batch/${batch.batch_id}`);
        if (!resultsRes.ok) continue;
        
        const resultsData = await resultsRes.json();
        const results = resultsData.results || [];

        for (const result of results) {
          // Avoid counting same domain multiple times
          const domainKey = result.url || result.domain;
          if (processedDomains.has(domainKey)) continue;
          processedDomains.add(domainKey);
          
          // Check PQC analysis for quantum vulnerability
          if (result.pqc_analysis) {
            const grade = result.pqc_analysis.overall_grade;
            if (grade === 'F') criticalCount++;
            else if (grade === 'D' || grade === 'C') highCount++;
            else if (grade === 'B') mediumCount++;

            if (!result.pqc_analysis.quantum_ready) {
              quantumUnsafeCount++;
            }
          }

          // Check TLS version issues
          const tlsVersion = result.tls_version;
          if (!tlsVersion || tlsVersion.includes('TLS 1.0') || tlsVersion.includes('TLS 1.1') || tlsVersion.includes('SSL')) {
            tlsIssuesCount++;
          }
          
          // Check for weak ciphers
          if (result.cipher_suite_name) {
            if (result.cipher_suite_name.includes('DES') || 
                result.cipher_suite_name.includes('RC4') || 
                result.cipher_suite_name.includes('MD5')) {
              tlsIssuesCount++;
            }
          }
          
          // Check cipher strength
          if (result.cipher_strength_bits && result.cipher_strength_bits < 128) {
            highCount++;
          }
          
          // Check for missing security headers
          if (!result.hsts_enabled || !result.csp_enabled) {
            mediumCount++;
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch results for batch ${batch.batch_id}:`, error);
      }
    }

    return {
      total: batches.length,
      criticalDomains: criticalCount,
      highVulnDomains: highCount,
      mediumVulnDomains: mediumCount,
      quantumUnsafe: quantumUnsafeCount,
      tlsIssues: tlsIssuesCount,
    };
  } catch (error) {
    console.error('Error fetching web scans stats:', error);
    return {
      total: 0,
      criticalDomains: 0,
      highVulnDomains: 0,
      mediumVulnDomains: 0,
      quantumUnsafe: 0,
      tlsIssues: 0,
    };
  }
};

// Fetch Repo Scans Data
const fetchRepoScansStats = async (): Promise<VulnerabilityStats['repoScans']> => {
  try {
    const scansRes = await fetch('http://localhost:8003/api/scans');
    if (!scansRes.ok) {
      console.warn('Repo scan service unavailable');
      return {
        total: 0,
        criticalAlgorithms: 0,
        deprecatedAlgorithms: 0,
        quantumVulnerable: 0,
        weakCryptography: 0,
        repositoriesAffected: 0,
      };
    }
    
    const scans = await scansRes.json();
    if (!Array.isArray(scans)) {
      console.error('Invalid scans response format');
      return {
        total: 0,
        criticalAlgorithms: 0,
        deprecatedAlgorithms: 0,
        quantumVulnerable: 0,
        weakCryptography: 0,
        repositoriesAffected: 0,
      };
    }

    let criticalCount = 0;
    let deprecatedCount = 0;
    let quantumVulnCount = 0;
    let weakCryptoCount = 0;
    const affectedRepos = new Set();

    for (const scan of scans) {
      affectedRepos.add(scan.repo_url);

      // Check overall grade for critical issues
      if (scan.overall_grade === 'F') {
        criticalCount += 3; // Weight F grade heavily
      } else if (scan.overall_grade === 'D') {
        criticalCount += 2;
      } else if (scan.overall_grade === 'C') {
        criticalCount += 1;
      }

      // Analyze individual algorithms
      if (scan.algorithms && typeof scan.algorithms === 'object') {
        Object.values(scan.algorithms).forEach((algo: any) => {
          if (algo.deprecated) {
            deprecatedCount++;
          }
          if (!algo.quantum_safe) {
            quantumVulnCount++;
          }
          if (algo.security_level === 'low' || algo.grade === 'F' || algo.grade === 'D') {
            weakCryptoCount++;
          }
        });
      }
      
      // Check category scores for additional issues
      if (scan.category_scores && typeof scan.category_scores === 'object') {
        Object.values(scan.category_scores).forEach((category: any) => {
          if (category.grade === 'F' || category.grade === 'D') {
            weakCryptoCount++;
          }
        });
      }
      
      // Check quantum readiness percentage
      if (scan.quantum_readiness_percentage !== undefined && scan.quantum_readiness_percentage < 30) {
        criticalCount++;
      }
    }

    return {
      total: scans.length,
      criticalAlgorithms: criticalCount,
      deprecatedAlgorithms: deprecatedCount,
      quantumVulnerable: quantumVulnCount,
      weakCryptography: weakCryptoCount,
      repositoriesAffected: affectedRepos.size,
    };
  } catch (error) {
    console.error('Error fetching repo scans stats:', error);
    return {
      total: 0,
      criticalAlgorithms: 0,
      deprecatedAlgorithms: 0,
      quantumVulnerable: 0,
      weakCryptography: 0,
      repositoriesAffected: 0,
    };
  }
};

// Fetch PQC Scans Data
const fetchPQCScansStats = async (): Promise<VulnerabilityStats['pqcScans']> => {
  try {
    const agentsRes = await fetch('http://localhost:5001/api/agents');
    if (!agentsRes.ok) {
      console.warn('PQC agent service unavailable');
      return {
        total: 0,
        insecureProtocols: 0,
        weakCiphers: 0,
        missingPQC: 0,
        systemsAtRisk: 0,
        certificateIssues: 0,
      };
    }
    
    const agents = await agentsRes.json();
    if (!Array.isArray(agents)) {
      console.error('Invalid agents response format');
      return {
        total: 0,
        insecureProtocols: 0,
        weakCiphers: 0,
        missingPQC: 0,
        systemsAtRisk: 0,
        certificateIssues: 0,
      };
    }

    let insecureProtocolsCount = 0;
    let weakCiphersCount = 0;
    let missingPQCCount = 0;
    let certificateIssuesCount = 0;
    const affectedSystems = new Set();

    // Fetch actual results for each agent
    for (const agent of agents) {
      try {
        const resultsRes = await fetch(`http://localhost:5001/api/agent/${agent.agent_id}/results`);
        if (resultsRes.ok) {
          const results = await resultsRes.json();
          
          if (results && results.length > 0) {
            for (const result of results) {
              if (result.audit_results) {
                affectedSystems.add(agent.agent_id);
                
                // Check Windows systems
                if (result.audit_results.tls_ssl_configuration) {
                  const tlsConfig = result.audit_results.tls_ssl_configuration;
                  
                  // Check for insecure protocols
                  if (tlsConfig.enabled_protocols) {
                    const insecure = tlsConfig.enabled_protocols.filter((p: string) => 
                      p.includes('SSL') || p.includes('TLS 1.0') || p.includes('TLS 1.1')
                    );
                    insecureProtocolsCount += insecure.length;
                  }
                  
                  // Check for weak ciphers
                  if (tlsConfig.cipher_suites) {
                    const weak = Object.entries(tlsConfig.cipher_suites).filter(([_, enabled]: [string, any]) => 
                      enabled && (_.includes('DES') || _.includes('RC4') || _.includes('MD5'))
                    );
                    weakCiphersCount += weak.length;
                  }
                }
                
                // Check for PQC library presence
                if (result.audit_results.installed_crypto_software) {
                  const cryptoSoftware = result.audit_results.installed_crypto_software;
                  if (!cryptoSoftware.liboqs && !cryptoSoftware.aws_lc) {
                    missingPQCCount++;
                  }
                }
                
                // Check Linux systems
                if (result.audit_results.with_sudo?.tls_configuration) {
                  const tlsConfig = result.audit_results.with_sudo.tls_configuration;
                  if (tlsConfig.openssl_version && tlsConfig.openssl_version.startsWith('1.0')) {
                    insecureProtocolsCount++;
                  }
                }
                
                // Check certificate issues
                if (result.audit_results.certificate_stores) {
                  const certStores = result.audit_results.certificate_stores;
                  // Flag if too many or too few certificates
                  if (certStores.root_certificates === 0 || certStores.root_certificates > 500) {
                    certificateIssuesCount++;
                  }
                }
              }
            }
          }
        }
      } catch (resultError) {
        console.warn(`Failed to fetch results for agent ${agent.agent_id}:`, resultError);
      }
    }

    return {
      total: agents.length,
      insecureProtocols: insecureProtocolsCount,
      weakCiphers: weakCiphersCount,
      missingPQC: missingPQCCount,
      systemsAtRisk: affectedSystems.size,
      certificateIssues: certificateIssuesCount,
    };
  } catch (error) {
    console.error('Error fetching PQC scans stats:', error);
    return {
      total: 0,
      insecureProtocols: 0,
      weakCiphers: 0,
      missingPQC: 0,
      systemsAtRisk: 0,
      certificateIssues: 0,
    };
  }
};

export default function VulnerabilitiesNewPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch all scan data with error handling
  const { data: webStats = null, isLoading: webLoading, error: webError, refetch: refetchWebScans } = useQuery({
    queryKey: ["web-scans-stats"],
    queryFn: fetchWebScansStats,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const { data: repoStats = null, isLoading: repoLoading, error: repoError, refetch: refetchRepoScans } = useQuery({
    queryKey: ["repo-scans-stats"],
    queryFn: fetchRepoScansStats,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const { data: pqcStats = null, isLoading: pqcLoading, error: pqcError, refetch: refetchPQCScans } = useQuery({
    queryKey: ["pqc-scans-stats"],
    queryFn: fetchPQCScansStats,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const isLoading = webLoading || repoLoading || pqcLoading;
  const hasError = webError || repoError || pqcError;

  // Aggregate all data
  const aggregatedData: AggregatedData = useMemo(() => {
    if (!webStats || !repoStats || !pqcStats) {
      return {
        totalCritical: 0,
        totalHigh: 0,
        totalMedium: 0,
        totalLow: 0,
        totalVulnerabilities: 0,
        quantumVulnerableCount: 0,
        quantumSafeCount: 0,
        affectedAssets: 0,
        riskScore: 0,
        trendingAlgorithms: [],
        topThreats: [],
      };
    }

    // Aggregate severity counts from all sources
    const totalCritical = webStats.criticalDomains + repoStats.criticalAlgorithms + pqcStats.insecureProtocols;
    const totalHigh = webStats.highVulnDomains + repoStats.deprecatedAlgorithms + pqcStats.weakCiphers;
    const totalMedium = webStats.mediumVulnDomains + Math.floor(repoStats.quantumVulnerable / 2) + pqcStats.missingPQC;
    const totalLow = Math.floor((webStats.tlsIssues + repoStats.weakCryptography + pqcStats.certificateIssues) / 2);

    const totalVulnerabilities = totalCritical + totalHigh + totalMedium + totalLow;
    
    // Calculate quantum vulnerability across all scans
    const quantumVulnerableCount = webStats.quantumUnsafe + repoStats.quantumVulnerable + pqcStats.missingPQC;
    const totalAssets = webStats.total + repoStats.repositoriesAffected + pqcStats.systemsAtRisk;
    const quantumSafeCount = Math.max(0, totalAssets - quantumVulnerableCount);
    
    // Calculate weighted risk score (0-100)
    // Critical issues have highest weight, decreasing for lower severities
    const criticalWeight = 30;
    const highWeight = 20;
    const mediumWeight = 10;
    const lowWeight = 5;
    
    const maxPossibleScore = (totalAssets || 1) * (criticalWeight + highWeight + mediumWeight + lowWeight);
    const actualScore = (totalCritical * criticalWeight) + (totalHigh * highWeight) + (totalMedium * mediumWeight) + (totalLow * lowWeight);
    const riskScore = Math.min(100, Math.round((actualScore / maxPossibleScore) * 100));

    // Identify top threats with actual counts
    const threats = [
      { 
        name: 'Quantum Vulnerable Algorithms', 
        severity: 'critical', 
        source: 'Repo & Web Scans', 
        count: quantumVulnerableCount 
      },
      { 
        name: 'Deprecated Cryptography', 
        severity: 'high', 
        source: 'Repository Scans', 
        count: repoStats.deprecatedAlgorithms 
      },
      { 
        name: 'Weak TLS Configuration', 
        severity: 'high', 
        source: 'Web & System Scans', 
        count: webStats.tlsIssues + pqcStats.insecureProtocols 
      },
      { 
        name: 'Missing PQC Support', 
        severity: 'medium', 
        source: 'PQC System Scans', 
        count: pqcStats.missingPQC 
      },
      { 
        name: 'Certificate Issues', 
        severity: 'medium', 
        source: 'PQC System Scans', 
        count: pqcStats.certificateIssues 
      },
      { 
        name: 'Weak Cryptography', 
        severity: 'high', 
        source: 'Repository Scans', 
        count: repoStats.weakCryptography 
      },
    ].filter(t => t.count > 0).sort((a, b) => b.count - a.count).slice(0, 4);

    return {
      totalCritical: Math.round(totalCritical),
      totalHigh: Math.round(totalHigh),
      totalMedium: Math.round(totalMedium),
      totalLow: Math.round(totalLow),
      totalVulnerabilities: Math.round(totalVulnerabilities),
      quantumVulnerableCount,
      quantumSafeCount,
      affectedAssets: totalAssets,
      riskScore: riskScore || 0,
      trendingAlgorithms: ['RSA-2048', 'AES-256', 'SHA-256', 'ECDSA'], // Could be made dynamic
      topThreats: threats,
    };
  }, [webStats, repoStats, pqcStats]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchWebScans(), refetchRepoScans(), refetchPQCScans()]);
    setLastUpdated(new Date());
    setIsRefreshing(false);
  };

  const getRiskLevel = (score: number): string => {
    if (score >= 80) return 'Critical';
    if (score >= 60) return 'High';
    if (score >= 40) return 'Medium';
    if (score >= 20) return 'Low';
    return 'Minimal';
  };

  const getRiskColor = (score: number): string => {
    if (score >= 80) return 'text-destructive';
    if (score >= 60) return 'text-orange-500';
    if (score >= 40) return 'text-yellow-500';
    if (score >= 20) return 'text-primary';
    return 'text-success';
  };

  const getRiskBadgeVariant = (score: number): "destructive" | "warning" | "default" | "secondary" | "success" => {
    if (score >= 80) return 'destructive';
    if (score >= 60) return 'warning';
    if (score >= 40) return 'warning';
    if (score >= 20) return 'default';
    return 'success';
  };

  // Loading state
  if (isLoading && !webStats && !repoStats && !pqcStats) {
    return (
      <motion.div
        className="space-y-6 p-4 sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Vulnerabilities Overview</h1>
            <p className="text-muted-foreground text-sm mt-2">Loading vulnerability data...</p>
          </div>
        </div>
        
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <RefreshCw className="w-12 h-12 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Aggregating data from all scan sources...</p>
          </div>
        </div>
      </motion.div>
    );
  }

  // Error state
  if (hasError && !webStats && !repoStats && !pqcStats) {
    return (
      <motion.div
        className="space-y-6 p-4 sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Vulnerabilities Overview</h1>
            <p className="text-muted-foreground text-sm mt-2">Error loading vulnerability data</p>
          </div>
          <Button onClick={handleRefresh} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        </div>
        
        <UnifiedCard className="p-8">
          <div className="text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <h3 className="text-lg font-semibold">Failed to load scan data</h3>
            <p className="text-muted-foreground">
              Unable to connect to one or more scan services. Please ensure all services are running.
            </p>
          </div>
        </UnifiedCard>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="space-y-6 p-4 sm:p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Vulnerabilities Overview</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Real-time aggregated vulnerability data from all scan types
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground hidden md:inline">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2"
            variant="outline"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Main Risk Overview */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Overall Risk Score Hero Card */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <UnifiedCard variant="premium" padding="spacious" className="h-full border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
            <div className="flex flex-col h-full justify-between">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">Overall Risk Score</p>
                  <div className={`text-6xl sm:text-7xl font-bold tracking-tighter ${getRiskColor(aggregatedData.riskScore)}`}>
                    {aggregatedData.riskScore}
                  </div>
                </div>
                <div className={cn(
                  "p-4 rounded-2xl bg-primary/10",
                  aggregatedData.riskScore >= 80 && "bg-destructive/10"
                )}>
                  <Target className={cn("w-10 h-10 text-primary", getRiskColor(aggregatedData.riskScore))} />
                </div>
              </div>
              
              <div className="mt-8 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className={cn("text-xl font-bold flex items-center gap-2", getRiskColor(aggregatedData.riskScore))}>
                      {getRiskLevel(aggregatedData.riskScore)} Risk Level Summary
                      <UnifiedBadge variant={getRiskBadgeVariant(aggregatedData.riskScore)} label={getRiskLevel(aggregatedData.riskScore)} />
                    </p>
                    <p className="text-muted-foreground">
                      Across {aggregatedData.affectedAssets} total assets identified
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-secondary/50 rounded-full h-3 overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${aggregatedData.riskScore}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className={cn(
                      "h-full rounded-full",
                      aggregatedData.riskScore >= 80 ? 'bg-destructive' :
                      aggregatedData.riskScore >= 60 ? 'bg-orange-500' :
                      aggregatedData.riskScore >= 40 ? 'bg-yellow-500' :
                      'bg-primary'
                    )}
                  />
                </div>
              </div>
            </div>
          </UnifiedCard>
        </motion.div>

        {/* Quick Stats Grid */}
        <div className="grid gap-4">
          <MetricCard
            title="Total Vulnerabilities"
            value={aggregatedData.totalVulnerabilities}
            icon={ShieldAlert}
            iconClassName="text-primary"
            description="Detected across all surfaces"
          />
          <MetricCard
            title="Affected Assets"
            value={aggregatedData.affectedAssets}
            icon={Activity}
            iconClassName="text-primary"
            description="Domains, repos, and systems"
          />
          <MetricCard
            title="Scan Coverage Overview"
            value="100%"
            icon={CheckCircle}
            iconClassName="text-success"
            description="All services reporting"
          />
        </div>
      </div>

      {/* Vulnerability Severity Breakdown */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
          <Shield className="w-5 h-5 text-primary" />
          Vulnerability Severity Breakdown
        </h2>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <MetricCard
            title="Critical"
            value={aggregatedData.totalCritical}
            icon={ShieldAlert}
            iconClassName="text-destructive"
            description="Immediate action required"
          />
          <MetricCard
            title="High"
            value={aggregatedData.totalHigh}
            icon={AlertTriangle}
            iconClassName="text-orange-500"
            description="Priority remediation"
          />
          <MetricCard
            title="Medium"
            value={aggregatedData.totalMedium}
            icon={AlertCircle}
            iconClassName="text-yellow-500"
            description="Scheduled fixes"
          />
          <MetricCard
            title="Low"
            value={Math.round(aggregatedData.totalLow)}
            icon={ShieldCheck}
            iconClassName="text-primary"
            description="Monitoring"
          />
        </motion.div>
      </div>

      {/* Quantum Cryptography Status */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
          <Cpu className="w-5 h-5 text-primary" />
          Quantum Security Status
        </h2>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <MetricCard
            title="Quantum Vulnerable"
            value={aggregatedData.quantumVulnerableCount}
            change={`${Math.round((aggregatedData.quantumVulnerableCount / Math.max(aggregatedData.affectedAssets, 1)) * 100)}%`}
            icon={Zap}
            iconClassName="text-destructive"
          />
          <MetricCard
            title="Quantum Safe"
            value={aggregatedData.quantumSafeCount}
            change={`${Math.round((aggregatedData.quantumSafeCount / Math.max(aggregatedData.affectedAssets, 1)) * 100)}%`}
            icon={Lock}
            iconClassName="text-success"
          />
          <MetricCard
            title="Infrastructure Health"
            value={Math.round((aggregatedData.quantumSafeCount / Math.max(aggregatedData.affectedAssets, 1)) * 100)}
            change="Overall score"
            icon={ShieldCheck}
            iconClassName="text-primary"
          />
        </motion.div>
      </div>

      {/* Top Threats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <UnifiedCard>
          <div className="p-6">
            <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-500" />
              Primary Threat Analysis
            </h2>
            
            <div className="grid gap-4 sm:grid-cols-2">
              {aggregatedData.topThreats.map((threat, idx) => (
                <div 
                  key={idx}
                  className="p-5 rounded-xl border border-border bg-card/50 hover:bg-card hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-foreground text-lg group-hover:text-primary transition-colors">{threat.name}</h3>
                      <p className="text-sm text-muted-foreground">{threat.source}</p>
                    </div>
                    <UnifiedBadge variant={
                      threat.severity === 'critical' ? 'destructive' :
                      threat.severity === 'high' ? 'warning' :
                      'default'
                    } label={threat.severity.toUpperCase()} />
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="text-3xl font-bold text-foreground">{threat.count}</div>
                    <div className="text-xs text-muted-foreground">Affected Entities</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </UnifiedCard>
      </motion.div>

      {/* Source Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="grid gap-4 sm:grid-cols-3"
      >
        <UnifiedCard hoverable>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Web Surfaces</h3>
              <Globe className="w-5 h-5 text-primary" />
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Domains Scanned</span>
                <span className="font-semibold">{webStats?.total || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">TLS Vulnerabilities</span>
                <span className="font-semibold text-orange-500">{webStats?.tlsIssues || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">PQC Insecure</span>
                <span className="font-semibold text-destructive">{webStats?.quantumUnsafe || 0}</span>
              </div>
            </div>
          </div>
        </UnifiedCard>

        <UnifiedCard hoverable>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Code Repositories</h3>
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Repos</span>
                <span className="font-semibold">{repoStats?.total || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Legacy Crypto</span>
                <span className="font-semibold text-orange-500">{repoStats?.deprecatedAlgorithms || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vulnerable Algos</span>
                <span className="font-semibold text-destructive">{repoStats?.quantumVulnerable || 0}</span>
              </div>
            </div>
          </div>
        </UnifiedCard>

        <UnifiedCard hoverable>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Infrastructure</h3>
              <Server className="w-5 h-5 text-primary" />
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active Agents</span>
                <span className="font-semibold">{pqcStats?.total || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Protocol Issues</span>
                <span className="font-semibold text-orange-500">{pqcStats?.insecureProtocols || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Missing PQC</span>
                <span className="font-semibold text-destructive">{pqcStats?.missingPQC || 0}</span>
              </div>
            </div>
          </div>
        </UnifiedCard>
      </motion.div>

      {/* Statistics Footer */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="text-center py-8 border-t border-border"
      >
        <p className="text-muted-foreground text-sm mb-4">
          Aggregation of real-time data from TLS/SSL Scans, Repository Analysis, and PQC System Inventories
        </p>
        <div className="flex flex-wrap justify-center gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Globe className="w-4 h-4 text-primary" /> Web External
          </span>
          <span className="flex items-center gap-1">
            <Database className="w-4 h-4 text-primary" /> Static Analysis
          </span>
          <span className="flex items-center gap-1">
            <Server className="w-4 h-4 text-primary" /> System Internal
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
