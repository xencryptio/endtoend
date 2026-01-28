import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Globe, Github } from "lucide-react";
import {
  UnifiedEntryCard,
} from "@/components/ui/unified";
import { typography } from "@/lib/design-tokens";
import WebScan from '@/components/scan/webscan';
import GitScan from "@/components/git-scan/git-scan";




type ViewType = 'dashboard' | 'webscan' | 'gitscan';

// ============================================================================
// API CONFIGURATION
// ============================================================================

const API_CONFIG = {
  scanApi: import.meta.env.VITE_SCAN_API_URL
};



// ============================================================================
// MAIN SCAN COMPONENT (DASHBOARD CONTROLLER)
// ============================================================================

const Scan = () => {
  const [view, setView] = useState<ViewType>('dashboard');
  const location = useLocation();
  // Handle navigation from Applications page
  useEffect(() => {
    const state = location.state as { defaultView?: ViewType; autoLoadDomain?: string; autoLoadRepo?: string; openHistory?: boolean } | null;
    if (state?.defaultView) {
      // Filter out invalid views like 'tables' if they come from old links
      if (state.defaultView === 'webscan' || state.defaultView === 'gitscan' || state.defaultView === 'dashboard') {
        setView(state.defaultView);
      }
    }
  }, [location]);

  // Capture auto-load data once and clear navigation state to avoid re-triggering
  const [pendingAutoLoadDomain, setPendingAutoLoadDomain] = useState<string | undefined>(undefined);
  const [pendingAutoLoadRepo, setPendingAutoLoadRepo] = useState<string | undefined>(undefined);
  const [forceHistoryTab, setForceHistoryTab] = useState<boolean>(false);

  useEffect(() => {
    const state = location.state as { defaultView?: ViewType; autoLoadDomain?: string; autoLoadRepo?: string; openHistory?: boolean } | null;
    if (state?.autoLoadDomain || state?.autoLoadRepo) {
      setPendingAutoLoadDomain(state.autoLoadDomain);
      setPendingAutoLoadRepo(state.autoLoadRepo);
      setForceHistoryTab(Boolean(state?.openHistory || state?.autoLoadDomain));
      // Clear state so subsequent interactions aren't affected
      window.history.replaceState({}, document.title, location.pathname);
    }
  }, [location]);



  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  // ============================================================================
  // RENDER LOGIC
  // ============================================================================

  return (
    <AnimatePresence mode="wait">
      {view === 'webscan' ? (
        // WebScan handles its own UI completely
        <WebScan
          key="webscan"
          onBack={() => setView('dashboard')}
          apiBaseUrl={API_CONFIG.scanApi}
          autoLoadDomain={pendingAutoLoadDomain}
          initialTab={forceHistoryTab ? 'history' : 'scan'}
        />
      ) : view === 'gitscan' ? (
        <GitScan
          key="gitscan"
          onBack={() => setView('dashboard')}
          autoLoadRepo={pendingAutoLoadRepo as any}
        />
      ) : (
        // Dashboard View - Simple Navigation with UnifiedEntryCard
        <motion.div
          key="dashboard"
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] p-4"
        >
          <div className="w-full max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <h1 className={typography.display}>Scan Center</h1>
              <p className="text-lg text-muted-foreground mt-2">Select a scan type to begin.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <UnifiedEntryCard
                icon={Globe}
                title="TLS/SSL Scan"
                subtitle="Scan your web assets"
                description="Initiate scans on your public-facing websites and APIs to identify cryptographic weaknesses and compliance issues."
                actionLabel="Start Scan"
                onClick={() => setView('webscan')}
                variant="premium"
              />
              <UnifiedEntryCard
                icon={Github}
                title="Repository Scan"
                subtitle="Scan your repositories"
                description="Analyze GitHub repositories for cryptographic algorithm usage and Post-Quantum Cryptography readiness."
                actionLabel="Start Scan"
                onClick={() => setView('gitscan')}
                variant="premium"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Scan;