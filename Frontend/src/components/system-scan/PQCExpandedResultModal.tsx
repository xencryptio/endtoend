import React, { useState } from 'react';
import {
  ChevronDown, ChevronUp, ExternalLink, X, FileText, Shield,
  Award, Target, Lock, CheckCircle, AlertTriangle,
  ArrowLeft, Search, Activity, AlertCircle, Cpu, Database, Server, Eye
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================
export interface AuditResult {
  result_id: string;
  agent_id: string;
  task_id: string;
  audit_results: any;
  received_at: string;
  submitted_at: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
const getGradeColor = (grade: string) => {
    if (!grade) return 'text-muted-foreground';
    const g = grade.toUpperCase();
    if (g.startsWith('A')) return 'text-success';
    if (g.startsWith('B')) return 'text-primary';
    if (g.startsWith('C')) return 'text-warning';
    if (g.startsWith('D')) return 'text-orange-500';
    return 'text-destructive';
  };
  
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-success';
    if (score >= 75) return 'text-primary';
    if (score >= 60) return 'text-warning';
    if (score >= 50) return 'text-orange-500';
    return 'text-destructive';
  };
  
  const getScoreBgColor = (score: number) => {
    if (score >= 90) return 'bg-success';
    if (score >= 75) return 'bg-primary';
    if (score >= 60) return 'bg-warning';
    if (score >= 50) return 'bg-orange-500';
    return 'bg-destructive';
  };

const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };
  

// ============================================================================
// PQC EXPANDED RESULT MODAL
// ============================================================================

export const PQCExpandedResultModal: React.FC<{
  result: AuditResult;
  onClose: () => void;
}> = ({ result, onClose }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const auditData = result.audit_results || {};

  // ✅ Add OS detection helper
  const detectOS = (auditData: any): 'linux' | 'windows' | 'unknown' => {
    const platform = auditData?._metadata?.platform?.toLowerCase();
    if (platform === 'windows') return 'windows';
    if (platform === 'linux') return 'linux';

    // Fallback detection for older data without metadata
    if (auditData.without_sudo || auditData.with_sudo) return 'linux';
    if (auditData.tls_ssl_configuration || auditData.cryptoapi_info) return 'windows';
    return 'unknown';
  };

  const osType = detectOS(auditData);

  const pqcScore = result.audit_results?.pqc_score || {};
  const components = pqcScore.components || {};
  const protocolAnalysis = pqcScore.protocol_analysis || {};
  const certificateAnalysis = pqcScore.certificate_analysis || {};
  const securityFeatures = pqcScore.security_features || {};
  const complianceStatus = pqcScore.compliance_status || {};
  const individualScores = pqcScore.individual_scores || [];

  // ✅ Use conditional data extraction
  let systemContext: any, opensslCrypto: any, sshCrypto: any, certificates: any, hardwareCrypto: any, systemSecurity: any, cryptoApiInfo: any, schannelInfo: any;

  if (osType === 'linux') {
    const dataRoot = auditData.with_sudo || auditData.without_sudo || {};
    systemContext = dataRoot.system_context || {};
    opensslCrypto = dataRoot.openssl_crypto || {};
    sshCrypto = dataRoot.ssh_crypto || {};
    certificates = dataRoot.certificates || {};
    hardwareCrypto = dataRoot.hardware_crypto || {};
    systemSecurity = dataRoot.system_security || {};
  } else if (osType === 'windows') {
    systemContext = auditData.system_context || {};
    certificates = auditData.certificate_stores || {}; // Map to certificates for consistency
    cryptoApiInfo = auditData.cryptoapi_info || {};
    schannelInfo = auditData.tls_ssl_configuration || {};
    // Set Linux-specific data to empty objects to prevent errors
    opensslCrypto = {}; sshCrypto = {}; hardwareCrypto = {}; systemSecurity = {};
  }

  const hasData = result && result.audit_results;

  return (
    <div
      className="
    fixed inset-0 
    bg-black/70
    backdrop-blur-sm
    z-50 
    flex items-center justify-center 
    p-6 
    overflow-y-auto
  "
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="
    bg-card 
    rounded-xl 
    shadow-2xl
    border-2 border-border
    max-w-7xl w-full max-h-[90vh] 
    overflow-hidden flex flex-col
  "
      >
        {/* Header - Clean Style */}
        <CardHeader className="border-b px-6 py-4 bg-card">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl font-bold">Detailed Scan Results</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {formatDate(result.submitted_at)} - {result.task_id}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>

        {/* Overall Score Section - Simplified */}
        <div className="px-6 py-6 border-b bg-muted/50">
          <div className="grid grid-cols-4 gap-6">
            {[
              { label: 'Overall Score', value: pqcScore.overall_score?.toFixed(1) || 'N/A', size: 'text-4xl' },
              { label: 'Grade', value: pqcScore.overall_grade || 'N/A', size: 'text-4xl' },
              { label: 'Quantum Ready', value: pqcScore.quantum_ready ? '✓' : '✗', size: 'text-4xl' },
              { label: 'Security Level', value: pqcScore.security_level || 'N/A', size: 'text-xl', isBadge: true }
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <div className={`${stat.size} font-bold mb-1 tracking-tight ${stat.isBadge ? 'bg-primary/10 text-primary py-1 px-3 rounded-full inline-block' : ''}`}>{stat.value}</div>
                <div className="text-xs uppercase tracking-wider font-medium text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 border-b border-border px-6">
          <div className="flex gap-4 overflow-x-auto">
            {
              (osType === 'windows'
                ? ['overview', 'components', 'algorithms', 'compliance', 'protocols', 'certificates', 'schannel', 'cryptoapi', 'system', 'raw']
                : ['overview', 'components', 'algorithms', 'compliance', 'protocols', 'certificates', 'system', 'openssl', 'ssh', 'hardware', 'security', 'raw']
              ).map((tab) => {
                const tabIcons: { [key: string]: React.ReactNode } = {
                  overview: <Activity size={14} />,
                  components: <Target size={14} />,
                  algorithms: <Lock size={14} />,
                  compliance: <CheckCircle size={14} />,
                  protocols: <Shield size={14} />,
                  certificates: <Award size={14} />,
                  system: <Server size={14} />,
                  openssl: <FileText size={14} />,
                  ssh: <Lock size={14} />,
                  hardware: <Cpu size={14} />,
                  security: <Shield size={14} />,
                  raw: <Database size={14} />,
                  cryptoapi: <Cpu size={14} />,
                  schannel: <Shield size={14} />,
                };

                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`
    px-6 py-4 
    font-bold text-sm capitalize 
    transition-all duration-300
                    border-b-2
    whitespace-nowrap 
    flex items-center gap-3
    ${activeTab === tab
                        ? 'border-primary text-primary bg-primary/5'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted'
                      }
                  }`}
                  >
                    {tabIcons[tab]}
                    {tab}
                  </button>
                );
              })}
          </div>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto flex-1">
          {!hasData ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-16 text-muted-foreground mb-4" />
              <p className="text-lg font-semibold text-foreground">
                No audit data available
              </p>
            </div>
          ) : (<>
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {/* Total Scans */}
                  <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-6 pt-6">
                      <CardTitle className="text-sm font-semibold text-muted-foreground">Total Scans</CardTitle>
                      <div className="p-3 rounded-full bg-primary/10">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                    </CardHeader>
                    <CardContent className="px-6 pb-6">
                      <div className="text-3xl font-bold mb-2">{individualScores.length}</div>
                      <p className="text-sm font-medium text-muted-foreground">Algorithms analyzed</p>
                    </CardContent>
                  </Card>


                  {/* Successful */}
                  <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-6 pt-6">
                      <CardTitle className="text-sm font-semibold text-muted-foreground">Successful</CardTitle>
                      <div className="p-3 rounded-full bg-success/10">
                        <CheckCircle className="h-5 w-5 text-success" />
                      </div>
                    </CardHeader>
                    <CardContent className="px-6 pb-6">
                      <div className="text-3xl font-bold text-success mb-2">
                        {individualScores.filter((a: any) => a.quantum_safe).length}
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">Quantum ready</p>
                    </CardContent>
                  </Card>

                  {/* Failed */}
                  <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-6 pt-6">
                      <CardTitle className="text-sm font-semibold text-muted-foreground">Failed</CardTitle>
                      <div className="p-3 rounded-full bg-destructive/10">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                      </div>
                    </CardHeader>
                    <CardContent className="px-6 pb-6">
                      <div className="text-3xl font-bold text-destructive mb-2">
                        {individualScores.length - individualScores.filter((a: any) => a.quantum_safe).length}
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">Non-compliant</p>
                    </CardContent>
                  </Card>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                    <CardHeader className="bg-muted/30">
                      <CardTitle className="text-xl font-bold tracking-tight">Component Scores</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 p-6">
                      {Object.entries(components).map(([key, comp]: [string, any]) => (
                        <div key={key}>
                          <div className="flex justify-between text-sm mb-2">
                            <span className="font-semibold uppercase tracking-wide">{key.replace('_', ' ')}</span>
                            <span className={`font-bold ${getScoreColor(comp.weighted_average)}`}>
                              {comp.weighted_average?.toFixed(1)} ({comp.grade})
                            </span>
                          </div>
                          <div className="h-3 bg-muted rounded-full overflow-hidden shadow-inner">
                            <div
                              className={`
                                h-full 
                                ${getScoreBgColor(comp.weighted_average || 0)}
                                rounded-full
                                shadow-lg
                                relative
                                overflow-hidden
                              `}
                              style={{ width: `${comp.weighted_average || 0}%` }}
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                    <CardHeader className="bg-muted/30">
                      <CardTitle className="text-xl font-bold tracking-tight">Security Features</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 p-6">
                      {[
                        ['HSTS Enabled', securityFeatures.hsts_enabled],
                        ['PFS Supported', securityFeatures.pfs_supported],
                        ['SNI Supported', securityFeatures.sni_supported]
                      ].map(([label, value]) => (
                        <div key={String(label)} className="flex justify-between text-sm">
                          <span>{label}</span>
                          <span className={value ? 'text-success' : 'text-destructive'}>{value ? '✓ Yes' : '✗ No'}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm">
                        <span>PFS Coverage</span>
                        <span className="font-semibold">{securityFeatures.pfs_percentage?.toFixed(1) || 0}%</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* COMPONENTS TAB */}
            {activeTab === 'components' && (
              <div className="space-y-6">
                {Object.entries(components).map(([key, comp]: [string, any]) => (
                  <Card key={key} className="shadow-md hover:shadow-lg transition-shadow duration-200">
                    <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                      <CardTitle className="text-xl font-bold tracking-tight uppercase flex items-center justify-between">
                        <span>{key.replace('_', ' ')}</span>
                        <span className={`text-2xl ${getScoreColor(comp.weighted_average)}`}>{comp.weighted_average?.toFixed(1)} ({comp.grade})</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="text-sm"><span className="text-muted-foreground">Average Score:</span><span className="ml-2 font-semibold">{comp.average_score?.toFixed(1)}</span></div>
                        <div className="text-sm"><span className="text-muted-foreground">Weight:</span><span className="ml-2 font-semibold">{(comp.weight_in_final * 100).toFixed(0)}%</span></div>
                        <div className="text-sm"><span className="text-muted-foreground">PQC %:</span><span className="ml-2 font-semibold">{comp.pqc_percentage?.toFixed(1)}%</span></div>
                        <div className="text-sm"><span className="text-muted-foreground">Quantum Safe:</span><span className="ml-2 font-semibold">{comp.quantum_safe_count}</span></div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Hybrid %:</span>
                          <span className="ml-2 font-semibold">{comp.hybrid_percentage?.toFixed(1)}%</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Deprecated:</span>
                          <span className="ml-2 font-semibold text-destructive">{comp.deprecated_count}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">PFS Enabled:</span>
                          <span className={`ml-2 font-semibold ${comp.pfs_enabled ? 'text-success' : 'text-muted-foreground'}`}>
                            {comp.pfs_enabled ? '✓' : '✗'}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="text-sm"><span className="text-muted-foreground">Best:</span><span className="ml-2 font-mono text-xs">{comp.best_algorithm}</span></div>
                        <div className="text-sm"><span className="text-muted-foreground">Worst:</span><span className="ml-2 font-mono text-xs">{comp.worst_algorithm}</span></div>
                      </div>
                      <div className="text-xs text-muted-foreground">{comp.algorithms?.length || 0} algorithms analyzed</div>
                      {comp.algorithms && comp.algorithms.length > 0 && (
                        <details className="mt-4">
                          <summary className="cursor-pointer text-sm font-semibold text-primary hover:text-primary/90">
                            View All {comp.algorithms.length} Algorithms in this Component
                          </summary>
                          <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                            {comp.algorithms.map((algo: any, idx: number) => (
                              <div key={idx} className="p-2 bg-muted/50 rounded text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-semibold">{algo.algorithm}</span>
                                  <span className={`font-bold ${getScoreColor(algo.final_score)}`}>
                                    {algo.final_score?.toFixed(1)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* ALGORITHMS TAB */}
            {activeTab === 'algorithms' && (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground mb-4">Showing {individualScores.length} individual algorithm scores</div>
                <motion.div>
                  {individualScores.slice(0, 50).map((algo: any, idx: number) => (
                    <motion.div
                      key={idx}
                      className="mb-4"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.05 }}
                    >
                      <Card key={idx} className="border-l-4 border-primary/20 shadow-sm hover:shadow-md transition-shadow">
                        <CardContent className="p-4 bg-card">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex-1">
                              <div className="font-mono text-sm font-bold text-foreground">{algo.algorithm}</div>
                              <div className="text-xs text-muted-foreground capitalize">{algo.algorithm_type} • Position: {algo.position}</div>
                            </div>
                            <div className="text-right">
                              <div className={`text-2xl font-bold ${getScoreColor(algo.final_score)}`}>{algo.final_score?.toFixed(1)}</div>
                              <div className={`text-sm font-bold ${getGradeColor(algo.grade)}`}>{algo.grade}</div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mt-3">
                            <div><span className="text-muted-foreground">Base:</span><span className="ml-1 font-semibold">{algo.base_score}</span></div>
                            <div><span className="text-muted-foreground">Key Size:</span><span className="ml-1 font-semibold">{algo.key_size} bits</span></div>
                            <div><span className="text-muted-foreground">Curve:</span><span className="ml-1 font-semibold">{algo.curve_strength?.toFixed(1) || 'N/A'}</span></div>
                            <div><span className="text-muted-foreground">Weighted:</span><span className="ml-1 font-semibold">{algo.weighted_score?.toFixed(1)}</span></div>
                            <div>
                              <span className="text-muted-foreground">Key Size Score:</span>
                              <span className="ml-1 font-semibold">{algo.key_size_score}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Security Level:</span>
                              <span className={`ml-1 font-semibold capitalize ${algo.security_level === 'high' ? 'text-success' :
                                algo.security_level === 'medium' ? 'text-primary' :
                                  algo.security_level === 'low' ? 'text-warning' :
                                    'text-destructive'
                                }`}>
                                {algo.security_level}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            {algo.is_pqc && (
                              <span className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-xs font-bold uppercase tracking-wide rounded-full shadow-lg shadow-purple-500/30 border-2 border-purple-400/20">
                                PQC
                              </span>
                            )}
                            {algo.is_hybrid && <span className="px-3 py-1.5 bg-primary/10 text-primary text-xs rounded-full font-semibold">Hybrid</span>}
                            {algo.quantum_safe && (
                              <span className="px-3 py-1.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xs font-bold uppercase tracking-wide rounded-full shadow-lg shadow-green-500/30 border-2 border-green-400/20">
                                Quantum Safe
                              </span>
                            )}
                            {algo.deprecated && (
                              <span className="px-3 py-1.5 bg-gradient-to-r from-red-600 to-rose-700 text-white text-xs font-bold uppercase tracking-wide rounded-full shadow-lg shadow-red-500/30 border-2 border-red-400/20 animate-pulse">
                                Deprecated
                              </span>
                            )}
                          </div>
                          {algo.vulnerabilities && algo.vulnerabilities.length > 0 && (
                            <div className="
  mt-3 p-6 
  bg-destructive/10
  border-2 border-destructive/20
  rounded-2xl
  shadow-lg shadow-red-500/10
">
                              <p className="
    text-base font-bold text-destructive 
    mb-3 
    flex items-center gap-2
  ">
                                <AlertTriangle size={20} />
                                ⚠️ Vulnerabilities:
                              </p>
                              <div className="space-y-2">
                                {algo.vulnerabilities.map((vuln: string, i: number) => (
                                  <p key={i} className="text-sm text-foreground flex items-start gap-2">
                                    <span className="text-destructive mt-0.5">•</span>
                                    {vuln}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            )}

            {/* COMPLIANCE TAB */}
            {activeTab === 'compliance' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(complianceStatus).map(([standard, compliant]: [string, any]) => (
                  <Card key={standard} className="shadow-md hover:shadow-lg transition-shadow duration-200">
                    <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                      <CardTitle>{standard}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 flex items-center justify-between">
                      <span className={`text-2xl ${compliant ? 'text-success' : 'text-destructive'}`}>{compliant ? '✓' : '✗'}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* PROTOCOLS TAB - ENHANCED */}
            {activeTab === 'protocols' && (
              <div className="space-y-4">
                {/* ADD NEW: Protocol Version Scores */}
                <Card>
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>Protocol Version Scores</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(protocolAnalysis.version_scores || {}).map(([version, score]: [string, any]) => (
                        <div key={version}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-semibold">{version}</span>
                            <span className={`font-bold ${getScoreColor(score)}`}>{score}</span>
                          </div>
                          <div className="bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${getScoreBgColor(score)}`}
                              style={{ width: `${score}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Existing supported/deprecated versions cards... */}
                <Card>
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>Supported Protocols</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {protocolAnalysis.supported_versions?.map((v: string) => (
                        <div key={v} className={`px-3 py-2 rounded-full text-sm font-semibold border-2 shadow-sm ${
                          protocolAnalysis.deprecated_versions?.includes(v)
                            ? 'bg-destructive/10 text-destructive border-destructive/20'
                            : 'bg-primary/10 text-primary border-primary/20'
                          }`}>
                          {v}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {protocolAnalysis.deprecated_versions?.length > 0 && (
                  <Card>
                    <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                      <CardTitle className="text-destructive flex items-center gap-2">
                        <AlertTriangle size={18} />
                        Deprecated Protocols
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {protocolAnalysis.deprecated_versions.map((v: string) => (
                          <div key={v} className="px-3 py-2 rounded-full text-sm font-semibold border-2 shadow-sm bg-destructive/10 text-destructive border-destructive/20">
                            {v}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* ADD NEW: Protocol Features Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle className="text-base">Protocol Features</CardTitle>
                  </CardHeader>
                    <CardContent className="space-y-2">
                      {[
                        ['Compression', protocolAnalysis.compression_enabled],
                        ['Secure Renegotiation', protocolAnalysis.renegotiation_secure],
                        ['Heartbeat', protocolAnalysis.heartbeat_enabled],
                        ['Downgrade Protection', protocolAnalysis.downgrade_protection]
                      ].map(([label, value]) => (
                        <div key={String(label)} className="flex justify-between text-sm">
                          <span>{label}</span>
                          <span className={value ? 'text-success' : 'text-destructive'}>
                            {value ? '✓' : '✗'}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle className="text-base">Session Management</CardTitle>
                  </CardHeader>
                    <CardContent>
                      <div className="text-center py-4 text-muted-foreground">
                        <p className="text-sm text-slate-500 mb-2">Session Resumption</p>
                        <p className="text-2xl font-bold capitalize">
                          {protocolAnalysis.session_resumption || 'Unknown'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* CERTIFICATES TAB - ENHANCED */}
            {activeTab === 'certificates' && (
              <div className="space-y-6">
                {/* Certificate Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                    <CardHeader className="bg-muted/30">
                      <CardTitle>Certificate Statistics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 p-6">
                      <div className="flex justify-between text-sm p-3 bg-muted/30 rounded-lg">
                        <span className="text-muted-foreground">Total Certificates</span>
                        <span className="font-semibold">{certificateAnalysis.total_certificates || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm p-3 bg-muted/30 rounded-lg">
                        <span className="text-muted-foreground">Strong Signatures</span>
                        <span className="font-semibold text-success">{certificateAnalysis.strong_signatures || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm p-3 bg-muted/30 rounded-lg">
                        <span className="text-muted-foreground">Weak Signatures</span>
                        <span className="font-semibold text-destructive">{certificateAnalysis.weak_signatures || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm p-3 bg-muted/30 rounded-lg">
                        <span className="text-muted-foreground">Validity Period</span>
                        <span className="font-semibold">{certificateAnalysis.validity_period_days || 0} days</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                    <CardHeader className="bg-muted/30">
                      <CardTitle>Certificate Features</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 p-6">
                      {[
                        ['Certificate Transparency', certificateAnalysis.cert_transparency],
                        ['OCSP Stapling', certificateAnalysis.ocsp_stapling],
                        ['Key Pinning', certificateAnalysis.key_pinning],
                        ['Chain Consistent', certificateAnalysis.chain_consistent]
                      ].map(([label, value]) => (
                        <div key={String(label)} className="flex justify-between text-sm p-3 bg-muted/30 rounded-lg">
                          <span className="text-muted-foreground">{label}</span>
                          <span className={value ? 'text-success' : 'text-destructive'}>{value ? '✓' : '✗'}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>

                {/* Detailed Certificate List */}
                {/* ✅ OS-SPECIFIC CERTIFICATE RENDERING */}
                {osType === 'linux' && certificates.certificates?.map((cert: any, i: number) => (
                  <div key={i} className="p-4 border border-border rounded-lg">
                    <p className="font-mono text-sm font-semibold break-all mb-3">{cert.path}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div><p className="font-semibold">{cert.crypto_information?.key_algorithm}</p></div>
                      <div><p className="font-semibold">{cert.crypto_information?.key_size} bits</p></div>
                      <div><p className="font-semibold text-xs">{cert.crypto_information?.signature_algorithm}</p></div>
                      {/* ... characteristics ... */}
                    </div>
                  </div>
                ))}

                {osType === 'windows' && Object.entries(certificates).map(([storeName, store]: [string, any]) => (
                  <Card key={storeName}>
                    <CardHeader><CardTitle>{store.store_name || storeName}</CardTitle></CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-3">
                        {store.certificate_count || 0} certificates
                      </p>
                      <div className="space-y-2">
                        {store.certificates?.slice(0, 5).map((cert: any, i: number) => (
                          <div key={i} className="p-3 bg-muted/50 rounded">
                            <div className="font-mono text-xs mb-2 truncate">{cert.subject}</div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>Algo: {cert.signature_algorithm}</div>
                              <div>Size: {cert.public_key_size} bits</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader><CardTitle className="text-base">Signature Algorithms</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        {certificateAnalysis.signature_algorithms?.map((algo: string, i: number) => (
                          <div key={i} className="px-2 py-1 bg-accent/50 text-accent-foreground rounded text-xs font-mono">
                            {algo}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-base">Hash Algorithms</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        {certificateAnalysis.hash_algorithms?.map((algo: string, i: number) => (
                          <div key={i} className={`px-2 py-1 rounded text-xs font-mono ${algo === 'SHA1'
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-success/10 text-success'
                            }`}>
                            {algo}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
            {/* SYSTEM TAB */}
            {activeTab === 'system' && (
              <div className="space-y-6">
                {/* OS Information Card */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle className="flex items-center gap-2">
                      <Activity size={18} />
                      System Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm text-muted-foreground">Operating System</span>
                        <pre className="mt-1 p-2 bg-muted/50 rounded text-xs">
                          {systemContext.os_info || 'N/A'}
                        </pre>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Kernel Version</span>
                        <p className="mt-1 font-mono text-sm">{systemContext.kernel_version || 'N/A'}</p>
                      </div>
                    </div>

                    {/* Crypto Modules */}
                    <div>
                      <span className="text-sm text-muted-foreground">Loaded Crypto Modules</span>
                      {systemContext.crypto_modules?.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {systemContext.crypto_modules.map((mod: any, i: number) => (
                            <span key={i} className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-mono">
                              {mod}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-sm text-slate-400">No modules loaded</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Metadata Card */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>Scan Metadata</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm p-6">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Result ID</span>
                      <code className="text-xs">{result.result_id}</code>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Agent ID</span>
                      <code className="text-xs">{result.agent_id}</code>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Received At</span>
                      <span>{formatDate(result.received_at)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Domain</span>
                      <span>{pqcScore.domain || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Scan Timestamp</span>
                      <span>{formatDate(pqcScore.timestamp)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
            {/* OPENSSL TAB */}
            {activeTab === 'openssl' && (
              <div className="space-y-6">
                {/* Version Info */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>OpenSSL Version</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <pre className="p-3 bg-muted/50 rounded text-xs overflow-x-auto">
                      {opensslCrypto.version_details || 'N/A'}
                    </pre>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">FIPS Mode:</span>
                      <span className={`font-semibold ${opensslCrypto.fips_mode_enabled ? 'text-success' : 'text-destructive'}`}>
                        {opensslCrypto.fips_mode_enabled ? '✓ Enabled' : '✗ Disabled'}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Available Algorithms */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>Available Hash Algorithms</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {Object.entries(opensslCrypto.available_algorithms || {}).map(([name, data]: [string, any]) => (
                        <div key={name} className={`p-3 rounded-lg border-2 ${data.available
                          ? 'border-success/50 bg-success/10'
                          : 'border-destructive/50 bg-destructive/10'
                          }`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold uppercase text-sm">{name}</span>
                            <span className={data.available ? 'text-success' : 'text-destructive'}>
                              {data.available ? '✓' : '✗'}
                            </span>
                          </div>
                          {data.output_sample && (
                            <code className="text-xs block truncate text-muted-foreground">
                              {data.output_sample}
                            </code>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Cipher Distribution */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>Cipher Suite Distribution ({opensslCrypto.cipher_information?.total_ciphers || 0} total)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      {Object.entries(opensslCrypto.cipher_information?.cipher_type_distribution || {}).map(([type, count]: [string, any]) => (
                        <div key={type}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-semibold capitalize">{type.replace('_', ' ')}</span>
                            <span className="text-muted-foreground">{count} ciphers</span>
                          </div>
                          <div className="bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${(count / opensslCrypto.cipher_information?.total_ciphers) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Cipher Details (first 10) */}
                    <div className="mt-4">
                      <p className="text-xs text-muted-foreground mb-2">Sample Ciphers:</p>
                      <div className="flex flex-wrap gap-2">
                        {opensslCrypto.cipher_information?.cipher_details?.slice(0, 10).map((cipher: any, i: number) => (
                          <span key={i} className="px-2 py-1 bg-muted/50 rounded text-xs font-mono">
                            {cipher.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Protocol Support */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>Protocol Support Details</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-2">
                      {opensslCrypto.protocol_support?.map((proto: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-semibold">{proto.protocol}</span>
                            <span className="text-xs text-muted-foreground capitalize">({proto.type})</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-muted-foreground">
                              {proto.cipher_count} ciphers
                            </span>
                            <span className={proto.available ? 'text-success' : 'text-destructive'}>
                              {proto.available ? '✓ Available' : '✗ Unavailable'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
            {/* SSH TAB */}
            {activeTab === 'ssh' && (
              <div className="space-y-6">
                {/* SSH Version */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>SSH Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="mb-4">
                      <span className="text-sm text-muted-foreground">Version Info</span>
                      <pre className="mt-1 p-2 bg-muted/50 rounded text-xs">
                        {sshCrypto.version_info || 'SSH not detected'}
                      </pre>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Protocol Version: </span>
                      <span className="font-semibold">{sshCrypto.configuration?.protocol_version || 'N/A'}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Configured Ciphers */}
                {sshCrypto.configuration?.configured_ciphers && (
                                  <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                                    <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                                      <CardTitle>Configured Ciphers ({sshCrypto.configuration.configured_ciphers.count})</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                      <div className="space-y-3">
                                        {Object.entries(sshCrypto.configuration.configured_ciphers.cipher_types || {}).map(([type, ciphers]: [string, any]) => (
                                          <div key={type}>
                                            <p className="text-sm font-semibold text-foreground mb-2 capitalize">
                                              {type.replace('_', ' ')}
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                              {ciphers.map((cipher: string, i: number) => (
                                                <span key={i} className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-mono">
                                                  {cipher}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </CardContent>
                                  </Card>                )}

                {/* MACs */}
                {sshCrypto.configuration?.configured_macs && (
                                  <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                                    <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                                      <CardTitle>Message Authentication Codes ({sshCrypto.configuration.configured_macs.count})</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                      <div className="space-y-3">
                                        {Object.entries(sshCrypto.configuration.configured_macs.mac_types || {}).map(([type, macs]: [string, any]) => (
                                          <div key={type}>
                                            <p className="text-sm font-semibold text-foreground mb-2 capitalize">
                                              {type.replace('_', ' ')}
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                              {macs.map((mac: string, i: number) => (
                                                <span key={i} className="px-2 py-1 bg-accent/50 text-accent-foreground rounded text-xs font-mono">
                                                  {mac}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </CardContent>
                                  </Card>                )}

                {/* Key Exchange Algorithms */}
                {sshCrypto.configuration?.configured_kex && (
                                  <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                                    <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                                      <CardTitle>Key Exchange Algorithms ({sshCrypto.configuration.configured_kex.count})</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                      <div className="flex flex-wrap gap-2">
                                        {sshCrypto.configuration.configured_kex.kex_algorithms?.map((kex: string, i: number) => (
                                          <span key={i} className="px-3 py-2 bg-success/10 text-success rounded text-sm font-mono">
                                            {kex}
                                          </span>
                                        ))}
                                      </div>
                                    </CardContent>
                                  </Card>                )}

                {/* Host Key Algorithms */}
                {sshCrypto.configuration?.host_key_algorithms && (
                                  <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                                    <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                                      <CardTitle>Host Key Algorithms ({sshCrypto.configuration.host_key_algorithms.count})</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                      <div className="flex flex-wrap gap-2">
                                        {sshCrypto.configuration.host_key_algorithms.algorithms?.map((algo: string, i: number) => (
                                          <span key={i} className="px-3 py-2 bg-warning/10 text-warning rounded text-sm font-mono">
                                            {algo}
                                          </span>
                                        ))}
                                      </div>
                                    </CardContent>
                                  </Card>                )}
              </div>
            )}
            {/* HARDWARE TAB */}
            {activeTab === 'hardware' && (
              <div className="space-y-6">
                {/* CPU Information */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>CPU Information</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <pre className="p-3 bg-muted/50 rounded text-xs overflow-x-auto">
                      {hardwareCrypto.cpu_information || 'N/A'}
                    </pre>
                  </CardContent>
                </Card>

                {/* CPU Crypto Features */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>CPU Cryptographic Features ({hardwareCrypto.crypto_feature_count || 0} features)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {Object.entries(hardwareCrypto.cpu_crypto_features || {}).map(([feature, supported]: [string, any]) => (
                        <div key={feature} className={`p-3 rounded-lg border-2 ${supported
                          ? 'border-success/50 bg-success/10'
                          : 'border-border bg-muted/50'
                          }`}>
                          <div className="flex items-center gap-2">
                            <span className={supported ? 'text-success text-lg' : 'text-muted-foreground text-lg'}>
                              {supported ? '✓' : '○'}
                            </span>
                            <span className="text-sm font-semibold capitalize">
                              {feature.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Hardware Devices */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {/* TPM Devices */}
                  <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                    <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                      <CardTitle className="text-base">TPM Devices</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      {hardwareCrypto.tpm_devices?.length > 0 ? (
                        <div className="space-y-1">
                          {hardwareCrypto.tpm_devices.map((dev: string, i: number) => (
                            <div key={i} className="text-sm font-mono bg-muted/50 p-2 rounded">
                              {dev}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No TPM devices detected</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Random Devices */}
                  <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                    <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                      <CardTitle className="text-base">Random Devices</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      {hardwareCrypto.random_devices?.length > 0 ? (
                        <div className="space-y-1">
                          {hardwareCrypto.random_devices.map((dev: string, i: number) => (
                            <div key={i} className="text-sm font-mono bg-success/10 text-success p-2 rounded">
                              {dev}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No random devices</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Crypto Devices */}
                  <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                    <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                      <CardTitle className="text-base">Crypto Devices</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      {hardwareCrypto.crypto_devices?.length > 0 ? (
                        <div className="space-y-1">
                          {hardwareCrypto.crypto_devices.map((dev: string, i: number) => (
                            <div key={i} className="text-sm font-mono bg-primary/10 text-primary p-2 rounded">
                              {dev}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No crypto accelerators detected</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
            {/* WINDOWS - CRYPTOAPI TAB */}
            {activeTab === 'cryptoapi' && osType === 'windows' && (
              /* ✅ FIXED CRYPTOAPI TAB */
              <div className="space-y-6">
                {/* CryptoAPI Providers */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>CryptoAPI Providers</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="mb-4">
                      <p className="text-sm text-muted-foreground mb-2">
                        Total Providers: {cryptoApiInfo?.cryptographic_providers?.count || 0}
                      </p>
                    </div>

                    {cryptoApiInfo?.cryptographic_providers?.providers?.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {cryptoApiInfo.cryptographic_providers.providers.map((provider: string, i: number) => (
                          <div key={i} className="p-3 bg-primary/10 text-primary rounded-lg font-mono text-sm">
                            {provider}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No providers found</p>
                    )}
                  </CardContent>
                </Card>

                {/* FIPS Mode Status */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>Security Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 p-6">
                    <div className="flex justify-between text-sm p-2 bg-muted/50 rounded">
                      <span>FIPS Mode Enabled</span>
                      <span className={cryptoApiInfo?.fips_mode_enabled ? 'text-success font-semibold' : 'text-muted-foreground'}>
                        {cryptoApiInfo?.fips_mode_enabled ? '✓ Yes' : '✗ No'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm p-2 bg-muted/50 rounded">
                      <span>ECC Curves Registered</span>
                      <span className="font-semibold">{cryptoApiInfo?.ecc_curves_registered?.count || 0}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Registered OID Algorithms */}
                {cryptoApiInfo?.registered_oid_algorithms?.algorithms && (
                                  <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                                    <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                                      <CardTitle>Registered OID Algorithms ({cryptoApiInfo.registered_oid_algorithms.count})</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                      <div className="max-h-64 overflow-y-auto">
                                        <div className="space-y-1">
                                          {cryptoApiInfo.registered_oid_algorithms.algorithms.map((algo: string, i: number) => (
                                            <div key={i} className="px-2 py-1 bg-muted/50 rounded text-xs font-mono">
                                              {algo}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>                )}
              </div>
            )}

            {/* WINDOWS - SCHANNEL TAB */}
            {activeTab === 'schannel' && osType === 'windows' && (
              /* ✅ FIXED SCHANNEL TAB */
              <div className="space-y-6">
                {/* Protocol Configurations */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>Schannel Protocol Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-2">
                      {schannelInfo?.protocol_configurations?.map((proto: any, i: number) => (
                        <div key={i} className="p-3 bg-muted/50 rounded">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold">{proto.protocol}</span>
                            <span className="text-xs text-muted-foreground capitalize">{proto.type}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Client: </span>
                              <span className={proto.client_status.includes('1') ? 'text-success' : 'text-muted-foreground'}>
                                {proto.client_status}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Server: </span>
                              <span className={proto.server_status.includes('1') ? 'text-success' : 'text-muted-foreground'}>
                                {proto.server_status}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Cipher Suites */}
                {schannelInfo?.cipher_suites?.cipher_details && (
                                  <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                                    <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                                      <CardTitle>Windows Cipher Suites ({schannelInfo.cipher_suites.cipher_details.length})</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                      <div className="space-y-2">
                                        {schannelInfo.cipher_suites.cipher_details.slice(0, 20).map((cipher: any, i: number) => (
                                          <div key={i} className="p-3 border border-border rounded">
                                            <div className="font-mono text-sm font-semibold mb-1">{cipher.name}</div>
                                            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                                              <div>KEX: {cipher.key_exchange}</div>
                                              <div>Cipher: {cipher.cipher_algorithm}</div>
                                              <div>Hash: {cipher.hash_algorithm}</div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </CardContent>
                                  </Card>                )}

                {/* Cipher Suite Order (if cipher_details failed) */}
                {schannelInfo?.cipher_suite_order?.order && (
                                  <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                                    <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                                      <CardTitle>Cipher Suite Order ({schannelInfo.cipher_suite_order.count})</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                      <div className="flex flex-wrap gap-2">
                                        {schannelInfo.cipher_suite_order.order.slice(0, 30).map((cipher: string, i: number) => (
                                          <span key={i} className="px-2 py-1 bg-accent/50 text-accent-foreground rounded text-xs font-mono">
                                            {cipher}
                                          </span>
                                        ))}
                                      </div>
                                    </CardContent>
                                  </Card>                )}
              </div>
            )}
            {/* SECURITY TAB */}
            {activeTab === 'security' && (
              <div className="space-y-6">
                {/* System Security Status */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>System Security Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 p-6">
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded">
                      <span className="font-semibold">FIPS Kernel Mode</span>
                      <span className={`text-lg ${systemSecurity.fips_kernel_mode ? 'text-success' : 'text-muted-foreground'}`}>
                        {systemSecurity.fips_kernel_mode ? '✓ Enabled' : '✗ Disabled'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded">
                      <span className="font-semibold">System Entropy</span>
                      <span className="text-lg font-bold text-primary">{systemSecurity.system_entropy || 0} bits</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Crypto Libraries */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>Cryptographic Libraries</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    {systemSecurity.crypto_libraries?.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {systemSecurity.crypto_libraries.map((lib: string, i: number) => (
                          <span key={i} className="px-3 py-2 bg-primary/10 text-primary rounded font-mono text-sm">
                            {lib}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No additional crypto libraries detected</p>
                    )}
                  </CardContent>
                </Card>

                {/* Kernel Crypto Algorithms */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>Kernel Cryptographic Algorithms ({systemSecurity.kernel_crypto_algorithms?.length || 0})</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="max-h-64 overflow-y-auto">
                      <div className="space-y-1">
                        {systemSecurity.kernel_crypto_algorithms?.map((algo: string, i: number) => (
                          <div key={i} className="px-3 py-2 bg-muted/50 rounded font-mono text-xs">
                            {algo}
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Extended Protocol Analysis */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>Advanced Protocol Features</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 p-6">
                    {[
                      ['Compression Enabled', protocolAnalysis.compression_enabled],
                      ['Secure Renegotiation', protocolAnalysis.renegotiation_secure],
                      ['Heartbeat Extension', protocolAnalysis.heartbeat_enabled],
                      ['Downgrade Protection', protocolAnalysis.downgrade_protection]
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex justify-between text-sm p-2 bg-muted/50 rounded">
                        <span>{label}</span>
                        <span className={value ? 'text-success font-semibold' : 'text-muted-foreground'}>
                          {value ? '✓ Yes' : '✗ No'}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm p-2 bg-muted/50 rounded">
                      <span>Session Resumption</span>
                      <span className="font-semibold capitalize">{protocolAnalysis.session_resumption || 'Unknown'}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Extended Security Features */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle>Extended Security Features</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 p-6">
                    <div className="flex justify-between text-sm p-2 bg-muted/50 rounded">
                      <span>HSTS Max Age</span>
                      <span className="font-semibold">{securityFeatures.hsts_max_age || 0} seconds</span>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground block mb-2">ALPN Protocols</span>
                      {securityFeatures.alpn_supported?.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {securityFeatures.alpn_supported.map((proto: string, i: number) => (
                            <span key={i} className="px-2 py-1 bg-primary/10 text-primary rounded text-xs">
                              {proto}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No ALPN protocols</p>
                      )}
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground block mb-2">TLS Extensions</span>
                      {securityFeatures.supported_extensions?.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {securityFeatures.supported_extensions.map((ext: string, i: number) => (
                            <span key={i} className="px-2 py-1 bg-accent/50 text-accent-foreground rounded text-xs">
                              {ext}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No extensions detected</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Critical Vulnerabilities */}
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 border-b">
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="text-destructive" size={18} />
                      Critical Vulnerabilities
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    {pqcScore.critical_vulnerabilities?.length > 0 ? (
                      <div className="space-y-2">
                        {pqcScore.critical_vulnerabilities.map((vuln: any, i: number) => (
                          <div key={i} className="p-3 bg-destructive/10 border border-destructive/20 rounded">
                            <p className="font-semibold text-destructive">{vuln.name || vuln}</p>
                            {vuln.description && <p className="text-sm text-muted-foreground mt-1">{vuln.description}</p>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-success">
                        <CheckCircle size={18} />
                        <span>No critical vulnerabilities detected</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
            {/* RAW JSON TAB */}
            {activeTab === 'raw' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Complete JSON Data</h3>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(result, null, 2));
                      // You might want to add a toast notification here
                    }}
                    className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-semibold transition-colors"
                  >
                    Copy to Clipboard
                  </button>
                </div>
                <pre className="p-4 bg-background text-foreground rounded-lg overflow-x-auto max-h-[600px] overflow-y-auto text-xs font-mono">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
};

export default PQCExpandedResultModal;
