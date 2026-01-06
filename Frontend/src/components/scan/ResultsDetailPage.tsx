import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search, X, Globe, Lock, Key, Hash, Shield, Zap, Check, CheckCircle, AlertTriangle, ShieldAlert, Info, Clock, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedBackButton } from "@/components/ui/unified";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
 
interface ScanResult {
  request_id: string;
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requested_at: string;
  total_urls: number;
  execution_time_seconds?: number;
  scan_status?: string;
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

interface ResultsDetailPageProps {
  scan: ScanResult;
  onBack: () => void;
  targetDomain?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getGradeColor = (grade: string): string => {
  if (!grade) return 'text-muted-foreground';
  const g = grade.toUpperCase();
  if (g.startsWith('A')) return 'text-success';
  if (g.startsWith('B')) return 'text-primary';
  if (g.startsWith('C')) return 'text-warning';
  if (g.startsWith('D')) return 'text-orange-500';
  return 'text-destructive';
};

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

const PQCStatusBadges: React.FC<{
  is_pqc?: boolean;
  is_hybrid?: boolean;
  quantum_safe?: boolean;
}> = ({ is_pqc, is_hybrid, quantum_safe }) => (
  <div className="flex items-center gap-2 flex-wrap">
    {is_pqc && <span className="px-1.5 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 rounded text-purple-700 dark:text-purple-300">PQC</span>}
    {is_hybrid && <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 rounded text-blue-700 dark:text-blue-300">Hybrid</span>}
    {quantum_safe && <span className="px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 rounded text-green-700 dark:text-green-300">Quantum-Safe</span>}
  </div>
);


// ============================================================================
// DETAIL COMPONENTS
// ============================================================================

const DetailSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl mb-4 bg-card">
      <div 
        className="flex items-center justify-between p-3 bg-muted hover:bg-muted/80 cursor-pointer transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        <h4 className="font-medium">{title}</h4>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ArrowLeft className="h-4 w-4" />
        </motion.div>
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-6 space-y-2">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: string | React.ReactNode; className?: string }> = ({ label, value, className = '' }) => (
  <div className={`flex justify-between items-start py-1 ${className}`}>
    <span className="text-slate-500 font-semibold text-xs uppercase tracking-wider min-w-0 flex-shrink">{label}:</span>
    <span className="text-foreground text-right ml-4 min-w-0 break-words">{value}</span>
  </div>
);

const ComponentScoreCard: React.FC<{ name: string; data: ComponentScore }> = ({ name, data }) => {
  return (
    <TooltipProvider>
      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-3">
          {getSectionIcon(name)}
          <div>
            <div className="font-medium capitalize">{name}</div>
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              {data.pqc_percentage}% PQC ΓÇó {data.quantum_safe_count} quantum-safe
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 justify-end">
            <div className={`text-lg font-bold ${getGradeColor(data.grade)}`}>
              {data.grade}
            </div>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3 w-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p>This score reflects both classical strength and PQC readiness.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="text-sm text-muted-foreground">
            Weighted Score: {data.weighted_average.toFixed(1)}/100
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

const PQCAnalysisSection: React.FC<{ analysis: any }> = ({ analysis }) => {
  if (!analysis) return null;

  return (
    <DetailSection title="Post-Quantum Cryptography Analysis">
      <div className="p-6 bg-muted/50 rounded-xl mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">Overall Score</span>
            <div className="text-2xl font-bold">{analysis.overall_score.toFixed(2)}/100</div>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">Grade</span>
            <div className={`text-2xl font-bold ${getGradeColor(analysis.overall_grade)}`}>
              {analysis.overall_grade}
            </div>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">Security Level</span>
            <div className="text-lg font-semibold capitalize">{analysis.security_level}</div>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">Quantum Ready</span>
            <div className="text-lg flex items-center gap-2">
              {analysis.quantum_ready 
                ? <><div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center"><Check className="w-3 h-3 text-emerald-600" /></div><span>Yes</span></>
                : <><div className="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center"><X className="w-3 h-3 text-rose-600" /></div><span>No</span></>}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h5 className="font-semibold text-sm">Component Analysis</h5>
        {Object.entries(analysis.components).map(([key, value]: [string, any]) => (
          <ComponentScoreCard key={key} name={key} data={value} />
        ))}
      </div>
    </DetailSection>
  );
};

const DetailedSections: React.FC<{ result: any }> = ({ result }) => {
  const rawData = result.raw_response || {};
  const tlsConfig = rawData.tls_configuration || {};
  const certChain = rawData.certificate_chain || {};
  const leafCert = certChain.leaf_certificate || {};
  const signatureAlgorithms = rawData.signature_algorithms || {};
  
  const getHashFromCipherName = (name: string): string => {
    const hashMatch = name.match(/SHA\d+/);
    if (hashMatch) return hashMatch[0];
    if (name.endsWith('_SHA')) return 'SHA1';
    return 'N/A';
  };

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-4">
      <DetailSection title="TLS/SSL Information">
        <DetailRow label="Supported Protocols" value={(tlsConfig.supported_protocols || []).join(', ') || 'N/A'} />
      </DetailSection>

      <DetailSection title="Elliptic Curves">
        {(tlsConfig.supported_elliptic_curves?.curves || []).map((curve: any, idx: number) => (
          <div key={idx} className="p-4 bg-muted/50 rounded-xl mb-2">
            <div className="flex justify-between items-start">
              <div className="font-medium">{curve.name}</div>
              <div className="text-sm text-muted-foreground">{curve.type} ({curve.bits} bits)</div>
            </div>
            {curve.curve_pqc_score !== undefined && (
              <div className="mt-2 flex items-center justify-between">
                <PQCStatusBadges 
                  is_pqc={curve.curve_is_pqc}
                  is_hybrid={curve.curve_is_hybrid}
                  quantum_safe={curve.curve_quantum_safe}
                />
                <div className={`text-sm font-semibold ${getGradeColor(curve.curve_pqc_grade)}`}>{curve.curve_pqc_grade} ({curve.curve_pqc_score})</div>
              </div>
            )}
          </div>
        ))}
      </DetailSection>

      <DetailSection title="Certificate Chain">
        <div className="mb-4 p-5 bg-muted/50 rounded-xl">
          <div className="font-semibold mb-2">Leaf Certificate</div>
          <DetailRow label="Certificate" value={leafCert.certificate || 'N/A'} />
          <DetailRow label="Subject Alt Names" value={(leafCert.subject_alternative_names || []).join(', ') || 'N/A'} />
          <DetailRow label="Certificate Transparency" value={leafCert.certificate_transparency ? <div className="flex items-center gap-2"><div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center"><Check className="w-3 h-3 text-emerald-600" /></div><span>Yes</span></div> : <div className="flex items-center gap-2"><div className="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center"><X className="w-3 h-3 text-rose-600" /></div><span>No</span></div>} />
          {leafCert.cert_pqc_score !== undefined && (
            <div className="mt-3 pt-3 border-t">
              <DetailRow label="PQC Grade" value={<span className={`font-bold ${getGradeColor(leafCert.cert_pqc_grade)}`}>{leafCert.cert_pqc_grade} ({leafCert.cert_pqc_score})</span>} />
              <DetailRow label="Status" value={<PQCStatusBadges 
                is_pqc={leafCert.cert_is_pqc}
                is_hybrid={leafCert.cert_is_hybrid}
                quantum_safe={leafCert.cert_quantum_safe}
              />} />
            </div>
          )}
        </div>

        {(certChain.intermediate_certificates || []).map((cert: any, index: number) => (
          <div key={`intermediate-${index}`} className="mb-4 p-5 bg-muted/50 rounded-xl">
            <div className="font-semibold mb-2">Intermediate Certificate {index + 1}</div>
            <DetailRow label="Public Key Algorithm" value={cert.public_key_algorithm || 'N/A'} />
            <DetailRow label="Public Key Size" value={`${cert.public_key_size || 'N/A'} bits`} />
            {cert.cert_pqc_score !== undefined && (
              <div className="mt-2 pt-2 border-t">
                <DetailRow label="PQC Grade" value={<span className={`font-bold ${getGradeColor(cert.cert_pqc_grade)}`}>{cert.cert_pqc_grade} ({cert.cert_pqc_score})</span>} />
                <DetailRow label="Status" value={<PQCStatusBadges 
                  is_pqc={cert.cert_is_pqc}
                  is_hybrid={cert.cert_is_hybrid}
                  quantum_safe={cert.cert_quantum_safe}
                />} />
              </div>
            )}
          </div>
        ))}
      </DetailSection>

      {signatureAlgorithms.certificate_signatures && signatureAlgorithms.certificate_signatures.length > 0 && (
        <DetailSection title="Certificate Signatures">
          <div className="space-y-3">
            {signatureAlgorithms.certificate_signatures.map((sig: any, idx: number) => (
              <div key={idx} className="p-5 bg-muted/50 rounded-xl">
                <div className="font-semibold mb-2">Position {sig.position}: {sig.certificate_subject}</div>
                <DetailRow label="Signature Algorithm" value={sig.signature_algorithm} />
                <DetailRow label="Hash Algorithm" value={sig.hash_algorithm} />
                <DetailRow label="Public Key" value={`${sig.public_key_type} (${sig.public_key_size} bits)`} />
                {sig.sig_pqc_score !== undefined && (
                  <div className="mt-2 pt-2 border-t">
                    <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Signature Analysis</div>
                    <DetailRow label="PQC Grade" value={<span className={`font-bold ${getGradeColor(sig.sig_pqc_grade)}`}>{sig.sig_pqc_grade} ({sig.sig_pqc_score})</span>} />
                    <DetailRow label="Status" value={<PQCStatusBadges 
                      is_pqc={sig.sig_is_pqc}
                      is_hybrid={sig.sig_is_hybrid}
                      quantum_safe={sig.sig_quantum_safe}
                    />} />
                  </div>
                )}
                {sig.hash_pqc_score !== undefined && (
                  <div className="mt-2 pt-2 border-t">
                    <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Hash Analysis</div>
                    <DetailRow label="PQC Grade" value={<span className={`font-bold ${getGradeColor(sig.hash_pqc_grade)}`}>{sig.hash_pqc_grade} ({sig.hash_pqc_score})</span>} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      <DetailSection title="Handshake Signature Algorithms">
        {signatureAlgorithms.handshake_signatures && signatureAlgorithms.handshake_signatures.length > 0 ? (
          <div className="space-y-3">
            {signatureAlgorithms.handshake_signatures.map((sig: any, idx: number) => (
              <div key={idx} className="p-4 bg-muted/50 rounded-xl">
                <div className="flex justify-between items-start">
                  <div className="font-medium">{sig.algorithm}</div>
                  <div className="text-sm text-muted-foreground">{sig.protocol}</div>
                </div>
                {sig.sig_pqc_score !== undefined && (
                  <div className="mt-2 flex items-center justify-between">
                    <PQCStatusBadges 
                      is_pqc={sig.sig_is_pqc}
                      is_hybrid={sig.sig_is_hybrid}
                      quantum_safe={sig.sig_quantum_safe}
                    />
                    <div className={`text-sm font-semibold ${getGradeColor(sig.sig_pqc_grade)}`}>{sig.sig_pqc_grade} ({sig.sig_pqc_score})</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No handshake signature algorithms available</p>
        )}
      </DetailSection>

      <DetailSection title="Cipher Suites">
        {tlsConfig['tls_1.3_cipher_suites'] && (
          <div className="mb-6">
            <div className="font-semibold mb-2 flex justify-between items-center">
              <span>TLS 1.3 Cipher Suites</span>
              {tlsConfig['tls_1.3_cipher_suites'].component_kex_score !== undefined && (
                <div className="text-sm">
                  <span className="text-muted-foreground">KEX Score: </span>
                  <span className={`font-bold ${getGradeColor(tlsConfig['tls_1.3_cipher_suites'].component_kex_grade)}`}>
                    {tlsConfig['tls_1.3_cipher_suites'].component_kex_grade} ({tlsConfig['tls_1.3_cipher_suites'].component_kex_score})
                  </span>
                </div>
              )}
            </div>
            {(tlsConfig['tls_1.3_cipher_suites'].suites || []).map((cipher: any, idx: number) => (
              <div key={idx} className="border-b border-border last:border-0 py-3">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="font-medium">{cipher.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Encryption: {cipher.encryption} | Hash: {getHashFromCipherName(cipher.name)}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground ml-4">
                    {cipher.key_exchange} {cipher.curve_bits ? `(${cipher.curve_bits} bits)` : ''}
                  </div>
                </div>
                
                {cipher.kex_pqc_score !== undefined && (
                  <div className="flex gap-4 text-xs mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">KEX:</span>
                      <span className={`font-semibold ${getGradeColor(cipher.kex_pqc_grade)}`}>
                        {cipher.kex_pqc_grade} ({cipher.kex_pqc_score})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {tlsConfig['tls_1.2_cipher_suites'] && (
          <div>
            <div className="font-semibold mb-2 flex justify-between items-center">
              <span>TLS 1.2 Cipher Suites</span>
              {tlsConfig['tls_1.2_cipher_suites'].component_kex_score !== undefined && (
                <div className="text-sm">
                  <span className="text-muted-foreground">KEX Score: </span>
                  <span className={`font-bold ${getGradeColor(tlsConfig['tls_1.2_cipher_suites'].component_kex_grade)}`}>
                    {tlsConfig['tls_1.2_cipher_suites'].component_kex_grade} ({tlsConfig['tls_1.2_cipher_suites'].component_kex_score})
                  </span>
                </div>
              )}
            </div>
            {(tlsConfig['tls_1.2_cipher_suites'].suites || []).map((cipher: any, idx: number) => (
              <div key={idx} className="border-b border-border last:border-0 py-3">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="font-medium">{cipher.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Encryption: {cipher.encryption} | Hash: {getHashFromCipherName(cipher.name)}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground ml-4">
                    {cipher.key_exchange} {cipher.curve_bits ? `(${cipher.curve_bits} bits)` : ''}
                  </div>
                </div>
                
                {cipher.kex_pqc_score !== undefined && (
                  <div className="flex gap-4 text-xs mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">KEX:</span>
                      <span className={`font-semibold ${getGradeColor(cipher.kex_pqc_grade)}`}>
                        {cipher.kex_pqc_grade} ({cipher.kex_pqc_score})
                      </span>
                      <PQCStatusBadges 
                        is_pqc={cipher.kex_is_pqc}
                        is_hybrid={cipher.kex_is_hybrid}
                        quantum_safe={cipher.kex_quantum_safe}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Encryption:</span>
                      <span className={`font-semibold ${getGradeColor(cipher.encryption_pqc_grade)}`}>
                        {cipher.encryption_pqc_grade} ({cipher.encryption_pqc_score})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      {rawData.pqc_analysis && (
        <PQCAnalysisSection analysis={rawData.pqc_analysis} />
      )}

      {rawData && Object.keys(rawData).length > 0 && (
        <DetailSection title="Raw Scan Data (JSON)">
          <div className="bg-muted p-6 rounded-xl overflow-auto max-h-80">
            <pre className="text-xs font-mono whitespace-pre-wrap break-words">
              {JSON.stringify(rawData, null, 2)}
            </pre>
          </div>
        </DetailSection>
      )}
    </div>
  );
};

// ============================================================================
// MODAL COMPONENT
// ============================================================================

const ExpandedDetailModal: React.FC<{
  result: ScanResult;
  onClose: () => void;
}> = ({ result, onClose }) => {
  const isSuccess = result.scan_status?.toLowerCase() === 'completed';
  const pqcScore =
    (result as any).pqc_overall_score ?? // Top-level first
    result.raw_response?.pqc_analysis?.overall_score ?? // Then nested
    result.quantum_score ?? // Legacy fallback
    'N/A';

  const pqcGrade =
    (result as any).pqc_overall_grade ??
    result.raw_response?.pqc_analysis?.overall_grade ??
    result.quantum_grade ??
    'N/A';

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-md z-40"
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
        <Card className="flex flex-col h-full shadow-2xl border border-slate-200 dark:border-slate-700 bg-card ring-1 ring-black/5">
          {/* Modal Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <div className="flex-1">
              <h3 className="text-xl font-bold truncate">{result.url}</h3>
              <div className="text-sm text-muted-foreground mt-1">
                {isSuccess 
                  ? <div className="flex items-center gap-2"><div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center"><Check className="w-3 h-3 text-emerald-600" /></div><span>Scan Successful</span></div>
                  : <div className="flex items-center gap-2"><div className="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center"><X className="w-3 h-3 text-rose-600" /></div><span>Scan Failed</span></div>}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="ml-4 flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Modal Content */}
          <CardContent className="flex-1 overflow-y-auto p-6">
            {isSuccess ? (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center p-4 bg-muted/50 rounded-xl">
                  <div>
                    <div className="text-xs uppercase tracking-wider font-semibold text-slate-500">PQC Score</div>
                    <div className="text-3xl font-bold mt-2">
                      {typeof pqcScore === 'number' ? pqcScore.toFixed(2) : pqcScore}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider font-semibold text-slate-500">Status</div>
                    <div className={`text-3xl font-bold mt-2 ${getGradeColor(pqcGrade as string)}`}>
                      {pqcGrade}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider font-semibold text-slate-500">Status</div>
                    <div className="text-2xl font-bold mt-2 flex items-center justify-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center"><Check className="w-3 h-3 text-emerald-600" /></div>
                      <span>Ready</span>
                    </div>
                  </div>
                </div>

                {/* Detailed Sections */}
                <DetailedSections result={result} />
              </div>
            ) : (
              <div className={`p-6 rounded-xl ${result.scan_status === 'http_skipped' ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-rose-50 dark:bg-rose-950/30'}`}>
                {result.scan_status === 'http_skipped' ? (
                  <>
                    <div className="flex items-center gap-3 mb-3">
                      <AlertTriangle className="w-6 h-6 text-amber-600" />
                      <p className="font-semibold text-lg text-amber-900 dark:text-amber-100">
                        HTTP Domain - Cannot Scan
                      </p>
                    </div>
                    <p className="text-amber-800 dark:text-amber-200 mb-3">
                      {result.error_message || 'This domain uses HTTP instead of HTTPS. we can only analyze TLS/SSL encrypted connections (HTTPS).'}
                    </p>
                    <div className="bg-amber-100 dark:bg-amber-900/40 rounded-lg p-4 text-sm">
                      <p className="font-semibold text-amber-900 dark:text-amber-100 mb-2">Why can't we scan this domain?</p>
                      <ul className="list-disc list-inside space-y-1 text-amber-800 dark:text-amber-200">
                        
                        <li>HTTP domains don't use encryption</li>
                        <li>No cryptographic data is available to analyze</li>
                      </ul>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-lg mb-2">Scan Failed</p>
                    <p>{result.error_message || 'An unknown error occurred during the scan.'}</p>
                  </>
                )}
              </div>
            )}
          </CardContent>

          {/* Modal Footer */}
          <div className="border-t p-6 flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              Click outside or press the close button to dismiss
            </p>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button variant="outline" onClick={onClose}>
                <X className="h-4 w-4 mr-2" /> Close
              </Button>
            </motion.div>
          </div>
        </Card>
      </motion.div>
    </>
  );
};

// ============================================================================
// DOMAIN CARD COMPONENT
// ============================================================================

const DomainCard: React.FC<{
  result: ScanResult;
  onExpand: () => void;
}> = ({ result, onExpand }) => {
  const isSuccess = result.scan_status === 'completed';
  const isHttpSkipped = result.scan_status === 'http_skipped';
  const pqcScore = result.raw_response?.pqc_analysis?.overall_score ?? 'N/A';
  const pqcGrade = result.raw_response?.pqc_analysis?.overall_grade ?? 'N/A';

  return (
    <Card 
      className="cursor-pointer transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-2xl hover:-translate-y-1 shadow-md"
      onClick={onExpand}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 px-6 pt-6">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Domain Scan
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1 truncate">{result.url}</p>
        </div>
        <div>
          {isSuccess ? (
            <span className="px-2 py-1 text-xs rounded-full bg-success/10 text-success font-semibold">
              ● Completed
            </span>
          ) : isHttpSkipped ? (
            <span className="px-2 py-1 text-xs rounded-full bg-amber-500/10 text-amber-600 font-semibold">
              ● HTTP
            </span>
          ) : (
            <span className="px-2 py-1 text-xs rounded-full bg-destructive/10 text-destructive font-semibold">
              ● Failed
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-6 pb-6">
        <div className="space-y-4">
          <div>
            <h5 className="font-semibold truncate text-base mb-1">{result.url}</h5>
            <div className="text-xs text-muted-foreground">
              {isSuccess ? (
                <span className="text-success">Scan successful</span>
              ) : isHttpSkipped ? (
                <span className="text-amber-600">HTTP - Not scannable</span>
              ) : (
                <span className="text-destructive">Scan failed</span>
              )}
            </div>
          </div>

          {isSuccess && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/30 p-3 rounded-lg text-center">
                <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">PQC Score</div>
                <div className="font-bold text-sm">{typeof pqcScore === 'number' ? pqcScore.toFixed(1) : 'N/A'}</div>
              </div>
              <div className="bg-muted/30 p-3 rounded-lg text-center">
                <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Grade</div>
                <div className={`font-bold text-sm ${getGradeColor(pqcGrade as string)}`}>
                  {pqcGrade}
                </div>
              </div>
              <div className="bg-muted/30 p-3 rounded-lg text-center">
                <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Status</div>
                <div className="font-bold text-sm text-emerald-600">Ready</div>
              </div>
            </div>
          )}
          
          {isHttpSkipped && (
            <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg text-xs text-amber-800 dark:text-amber-200">
              <p className="font-medium">Cannot analyze HTTP domains. We requires HTTPS.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ============================================================================
// MAIN RESULTS DETAIL PAGE COMPONENT
// ============================================================================

const ResultsDetailPage: React.FC<ResultsDetailPageProps> = ({ scan, onBack, targetDomain }) => {
  const [searchQuery, setSearchQuery] = useState('');

  // If a target domain is provided (e.g., from Applications page), pre-filter to it
  useEffect(() => {
    if (targetDomain) {
      setSearchQuery(targetDomain);
    }
  }, [targetDomain]);
  const [expandedResult, setExpandedResult] = useState<ScanResult | null>(null);

  // Filter results based on search query
  const filteredResults = useMemo(() => {
    if (!scan.detailedResults) return [];
    return scan.detailedResults.filter(result =>
      result.url.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [scan.detailedResults, searchQuery]);

  // Calculate summary stats
  const stats = useMemo(() => {
    if (!scan.detailedResults) return { successful: 0, failed: 0 };
    return {
      successful: scan.detailedResults.filter(r => r.scan_status === 'completed').length,
      failed: scan.detailedResults.filter(r => r.scan_status !== 'completed').length,
    };
  }, [scan.detailedResults]);

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ duration: 0.3 }}
      className="p-4 sm:p-6 max-w-7xl mx-auto"
    >
      {/* Header */}
      <div className="mb-8">
        <UnifiedBackButton 
          onClick={onBack}
          label="Back to Scan History"
          className="mb-4"
        />
        
        <div>
          <h2 className="text-3xl sm:text-4xl font-bold">
            Scan Results
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Request ID: {scan.request_id}
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Successful</p>
                <h3 className="text-2xl font-bold mt-2">{stats.successful}</h3>
              </div>
              <div className="p-3 rounded-full bg-success/10 dark:bg-success/20">
                <CheckCircle className="w-6 h-6 text-success" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Failed</p>
                <h3 className="text-2xl font-bold mt-2">{stats.failed}</h3>
              </div>
              <div className="p-3 rounded-full bg-destructive/10 dark:bg-destructive/20">
                <ShieldAlert className="w-6 h-6 text-destructive" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <h3 className="text-2xl font-bold mt-2">{scan.detailedResults?.length ?? 0}</h3>
              </div>
              <div className="p-3 rounded-full bg-primary/10 dark:bg-primary/20">
                <Globe className="w-6 h-6 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-md hover:shadow-lg hover:scale-[1.01] transition duration-200">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Duration</p>
                <h3 className="text-2xl font-bold mt-2">{scan.execution_time_seconds?.toFixed(2) ?? 'N/A'}s</h3>
              </div>
              <div className="p-3 rounded-full bg-muted/10 dark:bg-muted/20">
                <Clock className="w-6 h-6 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-8 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by domain name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-12 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500/20 transition-all"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Showing {filteredResults.length} of {scan.detailedResults?.length ?? 0} domains
        </p>
      </div>

      {/* Domain Cards Grid */}
      {filteredResults.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredResults.map((result, index) => (
            <motion.div
              key={result.url}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.4 }}
            >
              <DomainCard
                result={result}
                onExpand={() => setExpandedResult(result)}
              />
            </motion.div>
          ))}
        </div>
      ) : (
        <Card className="bg-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {searchQuery ? 'No domains found' : 'No results available'}
            </p>
            <p className="text-sm text-slate-500">
              {searchQuery ? 'Try adjusting your search' : 'Start by running a scan'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Expanded Modal */}
      <AnimatePresence>
        {expandedResult && (
          <ExpandedDetailModal
            result={expandedResult}
            onClose={() => setExpandedResult(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ResultsDetailPage;
