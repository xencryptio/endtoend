import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Save, RotateCcw, ArrowLeft, Library, LayoutGrid, ArrowRight } from "lucide-react";
import { CryptoTable, CryptoAlgorithm, ColumnDef } from "@/components/profile/crypto table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Applications from "@/components/profile/applications";

// Types for API data
interface ApiCryptoAlgorithm {
  Section: string;
  Algorithm_Name: string;
  Variant: string;
  Purpose: string;
  Usage_Context: string;
  Status_Today: string;
  PQC_Status: string;
  Priority: string;
  Classical_Recommended: string;
  Quantum_Recommended: string;
  NIST_Reference: string;
  Notes: string;
}

// API configuration - centralized backend URLs
const API_CONFIG = {
  cryptoApi: import.meta.env.VITE_BACKEND_URL,
};

// API fetching and data processing
const fetchDataFromAPI = async (): Promise<ApiCryptoAlgorithm[]> => {
  try {
    const response = await fetch(`${API_CONFIG.cryptoApi}/apps3`);
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    const result = await response.json();
    console.log('✅ API data fetched successfully');
    return result.data || [];
  } catch (error) {
    console.error('❌ Failed to fetch data from API:', error);
    return [];
  }
};

const transformApiData = (apiData: ApiCryptoAlgorithm[]): CryptoAlgorithm[] => {
  return apiData.map((item, index) => ({
    id: `${item.Algorithm_Name}-${index}`,
    algorithm_name: item.Algorithm_Name,
    variant: item.Variant,
    purpose: item.Purpose,
    usage_context: item.Usage_Context ? item.Usage_Context.split(',').map(s => s.trim()) : [],
    status_today: item.Status_Today,
    pqc_status: item.PQC_Status,
    priority: item.Priority,
    classical_recommended: item.Classical_Recommended,
    quantum_recommended: item.Quantum_Recommended,
    nist_reference: item.NIST_Reference ? item.NIST_Reference.split(',').map(s => s.trim()) : [],
    notes: item.Notes,
    section: item.Section,
    visible: false,
  }));
};

const categorizeApiData = (transformedData: CryptoAlgorithm[]) => {
  const categories: { [key: string]: CryptoAlgorithm[] } = {
    symmetric: [],
    asymmetric: [],
    hash: [],
    mac_kdf: [],
    pqc: [],
  };
  
  const keywordMap = {
    pqc: ['kyber', 'dilithium', 'falcon', 'sphincs', 'ntru', 'bike'],
    mac_kdf: ['hmac', 'cmac', 'pbkdf2', 'hkdf', 'argon', 'bcrypt', 'scrypt', 'gcm', 'ccm', 'chacha20', 'poly1305'],
    asymmetric: ['rsa', 'ecc', 'dsa', 'diffie-hellman', 'x25519', 'ed25519'],
    hash: ['sha', 'md5'],
    symmetric: ['aes', 'des', 'rc4', 'rc5', 'blowfish', 'camellia', 'seed'],
  };  

  transformedData.forEach(item => {
    const section = item.section?.toLowerCase() || '';
    if (section.includes('asymmetric')) {
      categories.asymmetric.push(item);
    } else if (section.includes('symmetric')) {
      categories.symmetric.push(item);
    } else if (section.includes('hash')) {
      categories.hash.push(item);
    } else if (section.includes('mac') || section.includes('kdf')) {
      categories.mac_kdf.push(item);
    } else if (section.includes('post-quantum')) {
      categories.pqc.push(item);
    } else {
      const name = item.algorithm_name.toLowerCase();
      let found = false;
      for (const category in keywordMap) {
        if (keywordMap[category].some(keyword => name.includes(keyword))) {
          categories[category as keyof typeof categories].push(item);
          found = true;
          break;
        }
      }
      if (!found) {
        console.warn(`Could not categorize: ${item.algorithm_name}`);
      }
    }
  });

  return categories;
};

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

const fetchCryptographicProfiles = async () => {
  const response = await fetch(`${API_CONFIG.cryptoApi}/apps4`);
  if (!response.ok) throw new Error('Network response was not ok');
  return response.json();
};

type ViewType = 'dashboard' | 'tables' | 'applications';

const Profile = () => {
  const [symmetricData, setSymmetricData] = useState<CryptoAlgorithm[]>([]);
  const [asymmetricData, setAsymmetricData] = useState<CryptoAlgorithm[]>([]);
  const [hashData, setHashData] = useState<CryptoAlgorithm[]>([]);
  const [macKdfData, setMacKdfData] = useState<CryptoAlgorithm[]>([]);
  const [pqcData, setPqcData] = useState<CryptoAlgorithm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<ViewType>('dashboard');

  const [isSymmetricEdited, setIsSymmetricEdited] = useState(false);
  const [isAsymmetricEdited, setIsAsymmetricEdited] = useState(false);
  const [isHashEdited, setIsHashEdited] = useState(false);
  const [isMacKdfEdited, setIsMacKdfEdited] = useState(false);
  const [isPqcEdited, setIsPqcEdited] = useState(false);

  const initialCategorizedData = useRef<{ [key: string]: CryptoAlgorithm[] }>({});
  const [showApplications, setShowApplications] = useState(false);
  const [applicationsData, setApplicationsData] = useState<any>(null);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const [applicationsRefreshing, setApplicationsRefreshing] = useState(false);
  const [allAlgorithms, setAllAlgorithms] = useState<any[]>([]);
  const [allAlgorithmsLoading, setAllAlgorithmsLoading] = useState(true);
  const [allAlgorithmsError, setAllAlgorithmsError] = useState<string | null>(null);

  useEffect(() => {
    const initializeData = async () => {
      try {
        const apiData = await fetchDataFromAPI();
        const transformedData = transformApiData(apiData);
        const categorizedData = categorizeApiData(transformedData);

        const withVisible = (data: CryptoAlgorithm[], count: number) =>
          data.map((item, index) => ({ ...item, visible: index < count }));

        const initialSymmetric = withVisible(categorizedData.symmetric || [], 3);
        const initialAsymmetric = withVisible(categorizedData.asymmetric || [], 3);
        const initialHash = withVisible(categorizedData.hash || [], 3);
        const initialMacKdf = withVisible(categorizedData.mac_kdf || [], 3);
        const initialPqc = withVisible(categorizedData.pqc || [], 3);

        initialCategorizedData.current = { symmetric: initialSymmetric, asymmetric: initialAsymmetric, hash: initialHash, mac_kdf: initialMacKdf, pqc: initialPqc };

        setSymmetricData(initialSymmetric);
        setAsymmetricData(initialAsymmetric);
        setHashData(initialHash);
        setMacKdfData(initialMacKdf);
        setPqcData(initialPqc);

      } catch (error) {
        console.error('❌ Error initializing profile data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeData();
  }, []);

  // Fetch applications data
  useEffect(() => {
    if (!showApplications) return;
    setApplicationsLoading(true);
    setApplicationsError(null);
    fetchCryptographicProfiles()
      .then((data) => {
        setApplicationsData(data);
        setApplicationsLoading(false);
      })
      .catch((err) => {
        setApplicationsError(err.message || "Failed to fetch applications");
        setApplicationsLoading(false);
      });
  }, [showApplications]);

  const fetchAllAlgorithms = async () => {
    try {
      const response = await fetch(`${API_CONFIG.cryptoApi}/apps3`);
      if (!response.ok) throw new Error("Failed to fetch algorithms");
      const result = await response.json();
      setAllAlgorithms(result.data || []);
    } catch (err: any) {
      setAllAlgorithmsError(err.message || "Failed to fetch algorithms");
    } finally {
      setAllAlgorithmsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllAlgorithms();
  }, []);

  const handleApplicationsRefresh = () => {
    setApplicationsRefreshing(true);
    fetchCryptographicProfiles()
      .then((data) => {
        setApplicationsData(data);
        setApplicationsRefreshing(false);
      })
      .catch((err) => {
        setApplicationsError(err.message || "Failed to fetch applications");
        setApplicationsRefreshing(false);
      });
  };

  const handleSaveChanges = () => {
    console.log("Saving all changes...");
    console.log("Symmetric:", symmetricData);
    console.log("Asymmetric:", asymmetricData);
    console.log("Hash:", hashData);
    console.log("MAC/KDF:", macKdfData);
    console.log("PQC:", pqcData);
  };

  const handleReset = () => {
    setSymmetricData([...(initialCategorizedData.current.symmetric || [])]);
    setAsymmetricData([...(initialCategorizedData.current.asymmetric || [])]);
    setHashData([...(initialCategorizedData.current.hash || [])]);
    setMacKdfData([...(initialCategorizedData.current.mac_kdf || [])]);
    setPqcData([...(initialCategorizedData.current.pqc || [])]);
    setIsSymmetricEdited(false);
    setIsAsymmetricEdited(false);
    setIsHashEdited(false);
    setIsMacKdfEdited(false);
    setIsPqcEdited(false);
    console.log("All tables reset to original state.");
  };

  const onSymmetricUpdate = useCallback((d: CryptoAlgorithm[]) => {
    setSymmetricData(d);
    setIsSymmetricEdited(true);
  }, []);
  const onSymmetricReset = useCallback(() => {
    setSymmetricData([...(initialCategorizedData.current.symmetric || [])]);
    setIsSymmetricEdited(false);
  }, []);

  const onAsymmetricUpdate = useCallback((d: CryptoAlgorithm[]) => {
    setAsymmetricData(d);
    setIsAsymmetricEdited(true);
  }, []);
  const onAsymmetricReset = useCallback(() => {
    setAsymmetricData([...(initialCategorizedData.current.asymmetric || [])]);
    setIsAsymmetricEdited(false);
  }, []);

  const onHashUpdate = useCallback((d: CryptoAlgorithm[]) => {
    setHashData(d);
    setIsHashEdited(true);
  }, []);
  const onHashReset = useCallback(() => {
    setHashData([...(initialCategorizedData.current.hash || [])]);
    setIsHashEdited(false);
  }, []);

  const onMacKdfUpdate = useCallback((d: CryptoAlgorithm[]) => {
    setMacKdfData(d);
    setIsMacKdfEdited(true);
  }, []);
  const onMacKdfReset = useCallback(() => {
    setMacKdfData([...(initialCategorizedData.current.mac_kdf || [])]);
    setIsMacKdfEdited(false);
  }, []);

  const onPqcUpdate = useCallback((d: CryptoAlgorithm[]) => {
    setPqcData(d);
    setIsPqcEdited(true);
  }, []);
  const onPqcReset = useCallback(() => {
    setPqcData([...(initialCategorizedData.current.pqc || [])]);
    setIsPqcEdited(false);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p>Loading Admin Page...</p>
        </div>
      </div>
    );
  }

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
          isLoading={applicationsLoading || allAlgorithmsLoading}
          error={applicationsError || allAlgorithmsError}
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
              <Button variant="outline" onClick={() => setView('dashboard')}><ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard</Button>
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

            <div className="mt-8 flex justify-end gap-4">
              <Button onClick={handleSaveChanges}><Save className="h-4 w-4 mr-2" /> Save Changes</Button>
              <Button variant="outline" onClick={handleReset}><RotateCcw className="h-4 w-4 mr-2" /> Reset All</Button>
            </div>
          </motion.div>
        )
      )}
    </AnimatePresence>
  );
};

export default Profile;