import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, X, Globe, Lock, Hash, Key, Zap, Shield, 
  Check, AlertTriangle, XCircle, CheckCircle 
} from "lucide-react";
import { 
  UnifiedCard, 
  UnifiedBadge, 
  UnifiedBackButton,
  UnifiedResultCard 
} from "@/components/ui/unified";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  finalDomainProgress?: { [key: string]: { status: string, duration?: number } };
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
}