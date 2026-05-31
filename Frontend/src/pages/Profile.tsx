import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Save, RotateCcw, ArrowLeft, Library, LayoutGrid, ArrowRight, CheckCircle } from "lucide-react";
import { CryptoTable, CryptoAlgorithm, ColumnDef } from "@/components/profile/crypto table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Applications from "@/components/profile/applications";
import { UnifiedBackButton } from "@/components/ui/unified";
import { DEFAULT_ALGORITHM_LIBRARY, ALGORITHM_SECTIONS } from "@/data/algorithmLibrary";

// ─── Backend config (only used for saving custom profiles & applications) ───
const DB_API = (import.meta.env.VITE_DB_API_URL as string | undefined) || 'http://localhost:8001';

// ─── Column definitions (shared across all tables) ───────────────────────────
const commonColumns: ColumnDef[] = [
  { key: "algorithm_name", header: "Algorithm" },
  { key: "variant", header: "Variant" },
  { key: "purpose", header: "Purpose" },
  { key: "priority", header: "Priority" },
  { key: "usage_context", header: "Usage Context" },
  { key: "status_today", header: "Status" },
  { key: "pqc_status", header: "PQC Status" },
  { key: "notes", header: "Notes" },
];

/** Pull algorithms for a given section from the local library. */
const sectionData = (section: string): CryptoAlgorithm[] =>
  DEFAULT_ALGORITHM_LIBRARY.filter(a => a.section === section) as CryptoAlgorithm[];

type ViewType = 'dashboard' | 'tables' | 'applications';
type SaveStatus = 'idle' | 'saving' | 'success';

const Profile = () => {
  // ── Local-library state (one state slice per table section) ──────────────
  const [symmetricData, setSymmetricData] = useState<CryptoAlgorithm[]>(() => sectionData('Symmetric Algorithms'));
  const [asymmetricData, setAsymmetricData] = useState<CryptoAlgorithm[]>(() => sectionData('Asymmetric Algorithms'));
  const [hashData, setHashData] = useState<CryptoAlgorithm[]>(() => sectionData('Hash Functions'));
  const [macKdfData, setMacKdfData] = useState<CryptoAlgorithm[]>(() => sectionData('MACs & KDFs'));
  const [pqcData, setPqcData] = useState<CryptoAlgorithm[]>(() => sectionData('Post-Quantum Cryptography'));

  // Original snapshots for reset
  const initialCategorizedData = useRef({
    symmetric: sectionData('Symmetric Algorithms'),
    asymmetric: sectionData('Asymmetric Algorithms'),
    hash: sectionData('Hash Functions'),
    mac_kdf: sectionData('MACs & KDFs'),
    pqc: sectionData('Post-Quantum Cryptography'),
  });

  const [isSymmetricEdited, setIsSymmetricEdited] = useState(false);
  const [isAsymmetricEdited, setIsAsymmetricEdited] = useState(false);
  const [isHashEdited, setIsHashEdited] = useState(false);
  const [isMacKdfEdited, setIsMacKdfEdited] = useState(false);
  const [isPqcEdited, setIsPqcEdited] = useState(false);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const [view, setView] = useState<ViewType>('dashboard');

  // ── Load persisted profile from localStorage (instant, no network) ────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('org_algorithm_profile');
      if (!saved) return;
      const profile = JSON.parse(saved);
      if (profile.symmetric?.length)  { setSymmetricData(profile.symmetric);  setIsSymmetricEdited(true); }
      if (profile.asymmetric?.length) { setAsymmetricData(profile.asymmetric); setIsAsymmetricEdited(true); }
      if (profile.hash?.length)       { setHashData(profile.hash);             setIsHashEdited(true); }
      if (profile.mac_kdf?.length)    { setMacKdfData(profile.mac_kdf);        setIsMacKdfEdited(true); }
      if (profile.pqc?.length)        { setPqcData(profile.pqc);               setIsPqcEdited(true); }
    } catch {
      // Corrupted localStorage — ignore and use defaults
    }
  }, []);

  // ── Applications section state ───────────────────────────────────────────
  const [applicationsData, setApplicationsData] = useState<any>(null);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const [applicationsRefreshing, setApplicationsRefreshing] = useState(false);

  // allAlgorithms for the applications sub-panel "Add from library" modal
  const allAlgorithms = DEFAULT_ALGORITHM_LIBRARY;

  // ── Fetch applications profile only when that view is opened ─────────────
  useEffect(() => {
    if (view !== 'applications') return;
    setApplicationsLoading(true);
    setApplicationsError(null);
    fetch(`${DB_API}/api/dashboard`)
      .then(r => { if (!r.ok) throw new Error('Failed to load'); return r.json(); })
      .then(data => {
        // Build app crypto-profile from dashboard data so no Render.com call needed
        setApplicationsData(data);
        setApplicationsLoading(false);
      })
      .catch(err => {
        setApplicationsError(err.message || 'Failed to fetch applications');
        setApplicationsLoading(false);
      });
  }, [view]);

  const handleApplicationsRefresh = () => {
    setApplicationsRefreshing(true);
    fetch(`${DB_API}/api/dashboard`)
      .then(r => r.json())
      .then(data => { setApplicationsData(data); setApplicationsRefreshing(false); })
      .catch(err => { setApplicationsError(err.message); setApplicationsRefreshing(false); });
  };

  // ── Save custom profile (localStorage primary, backend background sync) ──
  const handleSaveChanges = async () => {
    setSaveStatus('saving');
    const payload = {
      symmetric: symmetricData,
      asymmetric: asymmetricData,
      hash: hashData,
      mac_kdf: macKdfData,
      pqc: pqcData,
    };

    // 1. Always save to localStorage — instant, no CORS, survives page refresh
    try {
      localStorage.setItem('org_algorithm_profile', JSON.stringify(payload));
    } catch (e) {
      console.warn('localStorage unavailable:', e);
    }

    // 2. Background sync to backend (silent — doesn't affect UI on failure)
    fetch(`${DB_API}/api/org/algorithm-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => { /* backend not yet available — localStorage is the fallback */ });

    setSaveStatus('success');
    setIsSymmetricEdited(false);
    setIsAsymmetricEdited(false);
    setIsHashEdited(false);
    setIsMacKdfEdited(false);
    setIsPqcEdited(false);
    setTimeout(() => setSaveStatus('idle'), 3000);
  };

  // ── Reset all tables to the built-in defaults ─────────────────────────────
  const handleReset = () => {
    setSymmetricData([...initialCategorizedData.current.symmetric]);
    setAsymmetricData([...initialCategorizedData.current.asymmetric]);
    setHashData([...initialCategorizedData.current.hash]);
    setMacKdfData([...initialCategorizedData.current.mac_kdf]);
    setPqcData([...initialCategorizedData.current.pqc]);
    setIsSymmetricEdited(false);
    setIsAsymmetricEdited(false);
    setIsHashEdited(false);
    setIsMacKdfEdited(false);
    setIsPqcEdited(false);
    localStorage.removeItem('org_algorithm_profile');
  };

  // ── Per-table update/reset callbacks ─────────────────────────────────────
  const onSymmetricUpdate = useCallback((d: CryptoAlgorithm[]) => { setSymmetricData(d); setIsSymmetricEdited(true); }, []);
  const onSymmetricReset  = useCallback(() => { setSymmetricData([...initialCategorizedData.current.symmetric]);  setIsSymmetricEdited(false); }, []);
  const onAsymmetricUpdate = useCallback((d: CryptoAlgorithm[]) => { setAsymmetricData(d); setIsAsymmetricEdited(true); }, []);
  const onAsymmetricReset  = useCallback(() => { setAsymmetricData([...initialCategorizedData.current.asymmetric]); setIsAsymmetricEdited(false); }, []);
  const onHashUpdate = useCallback((d: CryptoAlgorithm[]) => { setHashData(d); setIsHashEdited(true); }, []);
  const onHashReset  = useCallback(() => { setHashData([...initialCategorizedData.current.hash]); setIsHashEdited(false); }, []);
  const onMacKdfUpdate = useCallback((d: CryptoAlgorithm[]) => { setMacKdfData(d); setIsMacKdfEdited(true); }, []);
  const onMacKdfReset  = useCallback(() => { setMacKdfData([...initialCategorizedData.current.mac_kdf]); setIsMacKdfEdited(false); }, []);
  const onPqcUpdate = useCallback((d: CryptoAlgorithm[]) => { setPqcData(d); setIsPqcEdited(true); }, []);
  const onPqcReset  = useCallback(() => { setPqcData([...initialCategorizedData.current.pqc]); setIsPqcEdited(false); }, []);

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  return (
    <AnimatePresence mode="wait">
      {view === 'applications' ? (
        <Applications
          data={applicationsData}
          isLoading={applicationsLoading}
          error={applicationsError}
          onRefresh={handleApplicationsRefresh}
          isRefreshing={applicationsRefreshing}
          onBack={() => setView('dashboard')}
          allAlgorithms={allAlgorithms}
        />
      ) : (
        view === 'dashboard' ? (
          <motion.div
            key="dashboard"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] p-4"
          >
            <div className="w-full max-w-6xl mx-auto">
              <div className="text-center mb-12">
                <h1 className="text-4xl font-bold tracking-tight">Admin Control Center</h1>
                <p className="text-lg text-muted-foreground mt-2">Select a profile to manage.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <motion.div whileHover={{ y: -5, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300 }}>
                  <Card
                    onClick={() => setView('tables')}
                    className="h-full flex flex-col justify-between cursor-pointer group border-2 hover:border-primary/50 transition-all"
                  >
                    <CardHeader>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-primary/10 rounded-lg">
                          <Library className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-2xl">Organizational Cryptography Profile</CardTitle>
                          <CardDescription className="text-base">View and manage all cryptographic algorithm tables.</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">
                        Configure symmetric, asymmetric, hash functions, MACs, KDFs, and Post-Quantum algorithms. Set visibility, edit properties, and add new entries to the organization's crypto standards.
                      </p>
                    </CardContent>
                    <div className="p-6 pt-0">
                      <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        Manage Profile <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </div>
                  </Card>
                </motion.div>
                
                <motion.div whileHover={{ y: -5, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300 }}>
                  <Card
                    onClick={() => setView('applications')}
                    className="h-full flex flex-col justify-between cursor-pointer group border-2 hover:border-primary/50 transition-all"
                  >
                    <CardHeader>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-secondary rounded-lg">
                          <LayoutGrid className="h-8 w-8 text-secondary-foreground" />
                        </div>
                        <div>
                          <CardTitle className="text-2xl">Applications</CardTitle>
                          <CardDescription className="text-base">View and manage cryptographic profiles for applications.</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">
                        Dynamically view application-specific cryptographic profiles and settings.
                      </p>
                    </CardContent>
                    <div className="p-6 pt-0">
                      <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        Manage Applications <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="tables"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="p-4 sm:p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold">Cryptography Profile Management</h1>
              <UnifiedBackButton onClick={() => setView('dashboard')} label="Back" />
            </div>

            <div className="space-y-8">
              <CryptoTable 
                title="Symmetric Algorithms" 
                data={symmetricData} 
                columns={commonColumns} 
                isEdited={isSymmetricEdited}
                onUpdate={onSymmetricUpdate}
                onReset={onSymmetricReset}
              />
              <CryptoTable 
                title="Asymmetric Algorithms" 
                data={asymmetricData} 
                columns={commonColumns} 
                isEdited={isAsymmetricEdited} 
                onUpdate={onAsymmetricUpdate}
                onReset={onAsymmetricReset}
              />
              <CryptoTable 
                title="Hash Functions" 
                data={hashData} 
                columns={commonColumns} 
                isEdited={isHashEdited} 
                onUpdate={onHashUpdate}
                onReset={onHashReset}
              />
              <CryptoTable 
                title="MACs & KDFs" 
                data={macKdfData} 
                columns={commonColumns} isEdited={isMacKdfEdited} 
                onUpdate={onMacKdfUpdate}
                onReset={onMacKdfReset}
              />
              <CryptoTable 
                title="Post-Quantum Cryptography" 
                data={pqcData} columns={commonColumns} isEdited={isPqcEdited} 
                onUpdate={onPqcUpdate}
                onReset={onPqcReset}
              />
            </div>

            <div className="mt-8 flex items-center justify-end gap-4">
              {saveStatus === 'success' && (
                <span className="flex items-center gap-1 text-sm text-success">
                  <CheckCircle className="h-4 w-4" /> Profile saved. Dashboard scores updated automatically.
                </span>
              )}
              <Button onClick={handleSaveChanges} disabled={saveStatus === 'saving'}>
                <Save className="h-4 w-4 mr-2" />
                {saveStatus === 'saving' ? 'Saving…' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-2" /> Reset All
              </Button>
            </div>
          </motion.div>
        )
      )}
    </AnimatePresence>
  );
};

export default Profile;