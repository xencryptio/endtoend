import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Building2, FolderTree, ArrowRight, Package, Globe, Server, GitBranch, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";

const DB_API_BASE = import.meta.env.VITE_DB_API_URL || 'http://localhost:8001';
const REPO_SCAN_API = import.meta.env.VITE_REPO_SCAN_API_URL || 'http://localhost:8003';
const TLS_SCAN_API = import.meta.env.VITE_TLS_SCAN_API_URL || 'http://localhost:8000';

interface Organization {
  id: string;
  organization_name: string;
  organization_email: string;
  total_repositories: number;
  total_domains: number;
  total_servers: number;
  created_at: string;
}

interface SubOrganization {
  id: string;
  suborganization_name: string;
  organization_id: string;
}

interface Application {
  id: string;
  application_name: string;
  suborganization_id: string;
  organization_id: string;
  created_at: string;
}

interface RepoScanResult {
  status: string;
  total_vulnerabilities?: number;
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
  pqc_readiness_percentage?: number;
  last_scan_date?: string;
}

interface DomainScanResult {
  status: string;
  pqc_ready?: boolean;
  pqc_grade?: string;
  pqc_score?: number;
  tls_version?: string;
  total_algorithms?: number;
  vulnerable_algorithms?: number;
  last_scan_date?: string;
}

interface Repository {
  id: string;
  repo_name: string;
  repo_url: string;
  branch_to_scan: string;
  application_id: string;
  created_at: string;
  scan_result?: RepoScanResult;
}

interface Domain {
  id: string;
  domain: string;
  application_id: string;
  created_at: string;
  scan_result?: DomainScanResult;
}

interface Server {
  id: string;
  server_name?: string;
  operating_system?: string;
  hostname?: string;
  ip_address?: string;
  mac_address?: string;
  agent_status?: string;
  application_id?: string;
  created_at: string;
  last_heartbeat?: string;
  agent_activity_status?: string; // Status from assets scan page
}

interface ApplicationWithDetails extends Application {
  repositories: Repository[];
  domains: Domain[];
  servers: Server[];
  suborgName?: string;
}

export default function OnboardingNew() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [subOrgs, setSubOrgs] = useState<SubOrganization[]>([]);
  const [applications, setApplications] = useState<ApplicationWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [view, setView] = useState<'orgs' | 'apps'>('orgs');

  const normalizeRepoUrl = (url: string) => {
    return url
      .trim()
      .replace(/\.git$/i, '')
      .replace(/\/$/, '')
      .toLowerCase();
  };

  const normalizeDomain = (url: string) => {
    try {
      const sanitized = url.trim().toLowerCase();
      const parsed = new URL(sanitized.startsWith('http') ? sanitized : `https://${sanitized}`);
      const hostname = parsed.hostname.replace(/^www\./, '');
      return hostname;
    } catch {
      return url.trim().toLowerCase().replace(/^www\./, '');
    }
  };

  const loadOrganizations = async () => {
    try {
      const response = await fetch(`${DB_API_BASE}/organizations`);
      if (response.ok) {
        const data = await response.json();
        setOrganizations(data);
      }
    } catch (error) {
      console.error('Failed to load organizations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrgDetails = async (orgId: string) => {
    setIsLoading(true);
    try {
      // Load sub-organizations
      const suborgsRes = await fetch(`${DB_API_BASE}/organizations/${orgId}/suborganizations`);
      const suborgsData = suborgsRes.ok ? await suborgsRes.json() : [];
      setSubOrgs(suborgsData);

      // Get onboarding batches for this org to fetch tls_scan_batch_id
      // Use supported endpoint and filter client-side to avoid 404s
      let batches: any[] = [];
      try {
        const listRes = await fetch(`${DB_API_BASE}/onboarding-batches?limit=100`);
        if (listRes.ok) {
          const allBatches = await listRes.json();
          batches = (Array.isArray(allBatches) ? allBatches : [])
            .filter((b: any) => b.organization_id === orgId);
        } else {
          console.warn('Failed to fetch onboarding batches list:', listRes.status);
        }
      } catch (error) {
        console.warn('Error fetching onboarding batches list', error);
      }
      
      const latestBatch = batches.length > 0
        ? batches.slice().sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        : null;
      
      // Fetch TLS scan results from scan-service (crypto_audit service port 8000)
      // Strategy: Always search all batches to find domain scans (domains can be scanned in any batch)
      let tlsResults: any[] = [];
      try {
        const scanServiceUrl = import.meta.env.VITE_SCAN_SERVICE_URL || 'http://localhost:8000';
        
        // First try the stored batch if available
        if (latestBatch?.tls_scan_batch_id) {
          try {
            const tlsRes = await fetch(`${scanServiceUrl}/results/batch/${latestBatch.tls_scan_batch_id}`);
            if (tlsRes.ok) {
              const tlsData = await tlsRes.json();
              if (tlsData.results && tlsData.results.length > 0) {
                tlsResults = tlsData.results;
              }
            }
          } catch (error) {
            console.warn('Failed to fetch TLS scan results from stored batch, will search all batches');
          }
        }
        
        // Always search through ALL batches to ensure we find all domain scans
        // Domains might be scanned across multiple batches
        try {
          const batchesRes = await fetch(`${scanServiceUrl}/batches?limit=100`);
          if (batchesRes.ok) {
            const allBatches = await batchesRes.json();
            const batchResults: any[] = [];
            
            // Fetch results from all batches in parallel for performance
            const batchPromises = allBatches.map(batch =>
              fetch(`${scanServiceUrl}/results/batch/${batch.batch_id}`)
                .then(res => res.ok ? res.json() : null)
                .catch(() => null)
            );
            
            const batchDataArray = await Promise.all(batchPromises);
            for (const batchData of batchDataArray) {
              if (batchData?.results && batchData.results.length > 0) {
                batchResults.push(...batchData.results);
              }
            }
            
            // Use all results found (merge with stored batch results, avoiding duplicates)
            if (batchResults.length > 0) {
              const resultMap = new Map();
              [...tlsResults, ...batchResults].forEach(result => {
                const key = `${result.url || result.domain}`;
                if (!resultMap.has(key) || new Date(result.completed_at || result.requested_at) > new Date(resultMap.get(key).completed_at || resultMap.get(key).requested_at)) {
                  resultMap.set(key, result); // Keep newest result
                }
              });
              tlsResults = Array.from(resultMap.values());
            }
          }
        } catch (error) {
          console.warn('Failed to search all TLS batches, using stored batch results only');
        }
      } catch (error) {
        console.error('Failed to fetch TLS scan results:', error);
      }

      // Load all applications with their resources
      const allApps: ApplicationWithDetails[] = [];
      let orgServers: Server[] = [];

      // Fetch agents from system scan API to match with servers by IP
      let agentsMap = new Map<string, any>();
      try {
        const SYSTEM_SCAN_API = import.meta.env.VITE_SYSTEM_SCAN_API_URL || 'http://localhost:9000';
        const agentsRes = await fetch(`${SYSTEM_SCAN_API}/api/v1/admin/agents`);
        if (agentsRes.ok) {
          const contentType = agentsRes.headers.get("content-type");
          if (!contentType?.includes("application/json")) {
            const text = await agentsRes.text();
            throw new Error(`Expected JSON from ${SYSTEM_SCAN_API}, but got ${contentType}. Response: ${text.slice(0, 100)}`);
          }
          const agentsData = await agentsRes.json();
          const agents = agentsData.success && agentsData.agents ? agentsData.agents : [];
          agents.forEach((agent: any) => {
            if (agent.ip_address) {
              agentsMap.set(agent.ip_address, agent);
            }
          });
        }
      } catch (error) {
        console.warn('Failed to load agents from system scan:', error);
      }

      try {
        const serversRes = await fetch(`${DB_API_BASE}/organizations/${orgId}/servers`);
        const serversData = serversRes.ok ? await serversRes.json() : [];
        
        // Enrich servers with agent activity status
        orgServers = serversData.map((server: Server) => {
          const agent = server.ip_address ? agentsMap.get(server.ip_address) : null;
          return {
            ...server,
            agent_activity_status: agent?.status || 'inactive'
          };
        });
      } catch (error) {
        console.error('Failed to load servers:', error);
      }
      
      for (const suborg of suborgsData) {
        const appsRes = await fetch(`${DB_API_BASE}/suborganizations/${suborg.id}/applications`);
        const appsData = appsRes.ok ? await appsRes.json() : [];

        for (const app of appsData) {
          // Load repositories for this app
          const reposRes = await fetch(`${DB_API_BASE}/applications/${app.id}/repositories`);
          const repos = reposRes.ok ? await reposRes.json() : [];

          // Load domains for this app
          const domainsRes = await fetch(`${DB_API_BASE}/applications/${app.id}/domains`);
          const domains = domainsRes.ok ? await domainsRes.json() : [];

          // Map servers that belong to this app
          const serversForApp = orgServers.filter((server: Server) => server.application_id === app.id);

          // Fetch scan results for repositories
          const reposWithScans = await Promise.all(
            repos.map(async (repo: Repository) => {
              const scanResult = await fetchRepoScanResult(repo.repo_url);
              return { ...repo, scan_result: scanResult };
            })
          );

          // Match domains with TLS scan results
          const domainsWithScans = domains.map((domain: Domain) => {
            const domKey = normalizeDomain(domain.domain);
            console.log(`🔍 Looking for domain: ${domain.domain} (normalized: ${domKey})`);
            console.log(`   Available TLS results count: ${tlsResults.length}`);
            
            // PERMANENT FIX: Try multiple variations to handle normalization differences
            // 1. Direct normalized match
            // 2. Match with www. prefix if not present
            // 3. Match without www. prefix if present
            const domainVariations = [
              domKey,                          // primevideo.com
              `www.${domKey}`,                 // www.primevideo.com
              domKey.replace(/^www\./, ''),    // remove www if present (redundant but safe)
            ];
            
            // Try multiple fields in TLS results: url, domain, scanned_domain
            const tlsResult = tlsResults.find((result: any) => {
              const resultUrl = result.url || result.domain || result.scanned_domain || '';
              const normalizedResult = normalizeDomain(resultUrl);
              
              // Check if any variation matches
              const matched = domainVariations.some(variation => 
                normalizedResult === variation || 
                normalizedResult === normalizeDomain(variation)
              );
              
              if (matched) {
                console.log(`   ✅ MATCHED: ${resultUrl} => ${normalizedResult} (matched with ${domain.domain})`);
                return true;
              }
              return false;
            });
            
            if (!tlsResult && tlsResults.length > 0) {
              console.log(`   ❌ NOT MATCHED. Tried variations: ${domainVariations.join(', ')}`);
              console.log(`   Available URLs in results:`, tlsResults.map((r: any) => {
                const url = r.url || r.domain || 'no-url';
                return `${url} (normalized: ${normalizeDomain(url)})`;
              }));
            }
            
            const scanResult = tlsResult ? parseTLSScanResult(tlsResult) : undefined;
            return { ...domain, scan_result: scanResult };
          });

          allApps.push({
            ...app,
            repositories: reposWithScans,
            domains: domainsWithScans,
            servers: serversForApp,
            suborgName: suborg.suborganization_name
          });
        }
      }

      setApplications(allApps);
      setView('apps');
    } catch (error) {
      console.error('Failed to load organization details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRepoScanResult = async (repoUrl: string): Promise<RepoScanResult | undefined> => {
    try {
      // First get all scans to find the one matching this repo
      const response = await fetch(`${REPO_SCAN_API}/api/scans?limit=500`);
      if (response.ok) {
        const scans = await response.json();
        const normalizedTarget = normalizeRepoUrl(repoUrl);
        const repoScan = scans.find((scan: any) => normalizeRepoUrl(scan.repo_url || '') === normalizedTarget);
        
        if (repoScan && repoScan.id) {
          // Fetch detailed scan results using scan ID
          const detailsResponse = await fetch(`${REPO_SCAN_API}/api/scans/${repoScan.id}`);
          if (detailsResponse.ok) {
            const details = await detailsResponse.json();
            
            // Calculate vulnerability counts from algorithms
            let critical = 0, high = 0, medium = 0, low = 0;
            if (details.algorithms) {
              Object.values(details.algorithms).forEach((algo: any) => {
                if (algo.risk_level === 'Critical') critical += algo.occurrence_count || 0;
                else if (algo.risk_level === 'High') high += algo.occurrence_count || 0;
                else if (algo.risk_level === 'Medium') medium += algo.occurrence_count || 0;
                else if (algo.risk_level === 'Low') low += algo.occurrence_count || 0;
              });
            }
            
            return {
              status: details.scan_status || repoScan.scan_status || 'unknown',
              total_vulnerabilities: critical + high + medium + low,
              critical,
              high,
              medium,
              low,
              pqc_readiness_percentage: details.quantum_readiness_percentage,
              last_scan_date: details.last_scanned || repoScan.last_scanned
            };
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch repo scan result:', error);
    }
    return undefined;
  };

  const fetchDomainScanResult = async (domain: string): Promise<DomainScanResult | undefined> => {
    try {
      // Try to get the latest scan for this domain from the scans endpoint
      const response = await fetch(`${TLS_SCAN_API}/scans/result?domain=${encodeURIComponent(domain)}`);
      if (response.ok) {
        const result = await response.json();
        return {
          status: result.status || 'unknown',
          pqc_ready: result.pqc_ready,
          total_algorithms: result.total_algorithms,
          vulnerable_algorithms: result.vulnerable_algorithms,
          last_scan_date: result.scan_date || result.created_at
        };
      }
    } catch (error) {
      console.error('Failed to fetch domain scan result:', error);
    }
    return undefined;
  };
  
  const parseTLSScanResult = (tlsResult: any): DomainScanResult => {
    const status = tlsResult.scan_status || tlsResult.status || 'unknown';
    const raw = tlsResult.raw_response || {};

    return {
      status,
      pqc_ready: tlsResult.pqc_quantum_ready ?? raw?.pqc_quantum_ready ?? false,
      pqc_grade: tlsResult.pqc_overall_grade || raw?.pqc_overall_grade,
      pqc_score: tlsResult.pqc_overall_score || raw?.pqc_overall_score,
      tls_version: tlsResult.tls_version || raw?.tls_version || tlsResult.supported_protocols,
      // For scan-service, we don't have algorithm counts, so these stay undefined
      total_algorithms: undefined,
      vulnerable_algorithms: undefined,
      last_scan_date: tlsResult.completed_at || tlsResult.requested_at || tlsResult.created_at || raw?.scan_date
    };
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (view === 'orgs') {
      await loadOrganizations();
    } else if (selectedOrg) {
      await loadOrgDetails(selectedOrg.id);
    }
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadOrganizations();
  }, []);

  if (isLoading && view === 'orgs') {
    return (
      <div className="min-h-dvh bg-background p-6 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-lg">Loading organizations...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="min-h-dvh bg-background p-4 sm:p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
              {view === 'orgs' ? 'Organizations' : selectedOrg?.organization_name}
            </h1>
            <p className="text-muted-foreground mt-1">
              {view === 'orgs' 
                ? 'View all onboarded organizations and their applications'
                : 'Applications across all sub-organizations'
              }
            </p>
          </div>
          <div className="flex gap-2">
            {view === 'apps' && (
              <Button
                variant="outline"
                onClick={() => {
                  setView('orgs');
                  setSelectedOrg(null);
                }}
              >
                Back to Organizations
              </Button>
            )}
            <Button
              onClick={handleRefresh}
              variant="outline"
              disabled={isRefreshing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Organizations View */}
        {view === 'orgs' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {organizations.map((org) => (
              <Card
                key={org.id}
                className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02]"
                onClick={() => {
                  setSelectedOrg(org);
                  loadOrgDetails(org.id);
                }}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Building2 className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{org.organization_name}</h3>
                        <p className="text-xs text-muted-foreground">{org.organization_email}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        Repositories
                      </span>
                      <Badge variant="outline">{org.total_repositories}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        Domains
                      </span>
                      <Badge variant="outline">{org.total_domains}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        Servers
                      </span>
                      <Badge variant="outline">{org.total_servers}</Badge>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(org.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}

            {organizations.length === 0 && (
              <div className="col-span-full">
                <Card>
                  <CardContent className="text-center py-12">
                    <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Organizations Found</h3>
                    <p className="text-muted-foreground">
                      Start by onboarding your first organization
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Applications View */}
        {view === 'apps' && (
          <div className="space-y-6">
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-lg">Loading applications...</p>
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Sub-Organizations</p>
                          <p className="text-2xl font-bold">{subOrgs.length}</p>
                        </div>
                        <FolderTree className="h-8 w-8 text-primary" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Applications</p>
                          <p className="text-2xl font-bold">{applications.length}</p>
                        </div>
                        <Package className="h-8 w-8 text-success" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Repositories</p>
                          <p className="text-2xl font-bold">
                            {applications.reduce((sum, app) => sum + app.repositories.length, 0)}
                          </p>
                        </div>
                        <GitBranch className="h-8 w-8 text-warning" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Domains</p>
                          <p className="text-2xl font-bold">
                            {applications.reduce((sum, app) => sum + app.domains.length, 0)}
                          </p>
                        </div>
                        <Globe className="h-8 w-8 text-purple-500" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Servers</p>
                          <p className="text-2xl font-bold">
                            {applications.reduce((sum, app) => sum + (app.servers?.length || 0), 0)}
                          </p>
                        </div>
                        <Server className="h-8 w-8 text-blue-500" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Applications List */}
                <div className="space-y-4">
                  {applications.map((app) => (
                    <Card key={app.id}>
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="text-xl font-semibold flex items-center gap-2">
                              <Package className="h-5 w-5 text-primary" />
                              {app.application_name}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {app.suborgName}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {new Date(app.created_at).toLocaleDateString()}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {/* Repositories */}
                          {app.repositories.length > 0 && (
                            <div className="min-w-0 overflow-hidden">
                              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                <GitBranch className="h-4 w-4" />
                                Repositories ({app.repositories.length})
                              </h4>
                              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                                {app.repositories.map((repo) => (
                                  <div
                                    key={repo.id}
                                    className="p-3 bg-muted/50 rounded border hover:bg-muted/70 transition-colors cursor-pointer"
                                    onClick={() => {
                                      // Navigate to Scans page, Repository Scan tab with repo to auto-load
                                      navigate('/SSL-TLS scans', { 
                                        state: { 
                                          defaultView: 'gitscan', 
                                          autoLoadRepo: repo.repo_url 
                                        } 
                                      });
                                    }}
                                  >
                                    <div className="flex items-start justify-between mb-2">
                                      <div className="flex-1">
                                        <div className="font-medium text-sm truncate">
                                          {repo.repo_name || repo.repo_url.split('/').pop()}
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">
                                          {repo.repo_url}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                          Branch: <code className="bg-background px-1 rounded">{repo.branch_to_scan}</code>
                                        </div>
                                      </div>
                                      {repo.scan_result && (
                                        <Badge 
                                          variant={
                                            repo.scan_result.status === 'completed' ? 'default' :
                                            repo.scan_result.status === 'failed' ? 'destructive' :
                                            repo.scan_result.status === 'in_progress' ? 'secondary' :
                                            'outline'
                                          }
                                          className="ml-2"
                                        >
                                          {repo.scan_result.status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                          {repo.scan_result.status === 'failed' && <XCircle className="h-3 w-3 mr-1" />}
                                          {repo.scan_result.status === 'in_progress' && <Clock className="h-3 w-3 mr-1" />}
                                          {repo.scan_result.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                                          {repo.scan_result.status}
                                        </Badge>
                                      )}
                                    </div>

                                    {repo.scan_result?.status === 'completed' && (
                                      <div className="space-y-2 mt-2 pt-2 border-t">
                                        {/* Vulnerabilities */}
                                        {repo.scan_result.total_vulnerabilities !== undefined && (
                                          <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground flex items-center gap-1">
                                              <AlertTriangle className="h-3 w-3" />
                                              Vulnerabilities
                                            </span>
                                            <div className="flex gap-1">
                                              {repo.scan_result.critical !== undefined && repo.scan_result.critical > 0 && (
                                                <Badge variant="destructive" className="text-xs h-5">
                                                  C: {repo.scan_result.critical}
                                                </Badge>
                                              )}
                                              {repo.scan_result.high !== undefined && repo.scan_result.high > 0 && (
                                                <Badge variant="destructive" className="text-xs h-5 bg-orange-500">
                                                  H: {repo.scan_result.high}
                                                </Badge>
                                              )}
                                              {repo.scan_result.medium !== undefined && repo.scan_result.medium > 0 && (
                                                <Badge variant="secondary" className="text-xs h-5 bg-yellow-500">
                                                  M: {repo.scan_result.medium}
                                                </Badge>
                                              )}
                                              {repo.scan_result.low !== undefined && repo.scan_result.low > 0 && (
                                                <Badge variant="outline" className="text-xs h-5">
                                                  L: {repo.scan_result.low}
                                                </Badge>
                                              )}
                                              {repo.scan_result.total_vulnerabilities === 0 && (
                                                <Badge variant="default" className="text-xs h-5 bg-green-500">
                                                  Clean
                                                </Badge>
                                              )}
                                            </div>
                                          </div>
                                        )}

                                        {/* PQC Readiness */}
                                        {repo.scan_result.pqc_readiness_percentage !== undefined && (
                                          <div className="space-y-1">
                                            <div className="flex items-center justify-between text-xs">
                                              <span className="text-muted-foreground">PQC Ready</span>
                                              <span className="font-medium">{repo.scan_result.pqc_readiness_percentage}%</span>
                                            </div>
                                            <div className="w-full bg-muted rounded-full h-1.5">
                                              <div 
                                                className={`h-1.5 rounded-full transition-all ${
                                                  repo.scan_result.pqc_readiness_percentage >= 80 ? 'bg-green-500' :
                                                  repo.scan_result.pqc_readiness_percentage >= 50 ? 'bg-yellow-500' :
                                                  'bg-red-500'
                                                }`}
                                                style={{ width: `${repo.scan_result.pqc_readiness_percentage}%` }}
                                              />
                                            </div>
                                          </div>
                                        )}

                                        {/* Last Scan Date */}
                                        {repo.scan_result.last_scan_date && (
                                          <div className="text-xs text-muted-foreground">
                                            Scanned {new Date(repo.scan_result.last_scan_date).toLocaleString()}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {!repo.scan_result && (
                                      <div className="mt-2 pt-2 border-t">
                                        <Badge variant="outline" className="text-xs">No scan data</Badge>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Domains */}
                          {app.domains.length > 0 && (
                            <div className="min-w-0 overflow-hidden">
                              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                <Globe className="h-4 w-4" />
                                Domains ({app.domains.length})
                              </h4>
                              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                                {app.domains.map((domain) => (
                                  <div
                                    key={domain.id}
                                    className="p-3 bg-muted/50 rounded border hover:bg-muted/70 transition-colors cursor-pointer"
                                    onClick={() => {
                                      // Navigate to SSL/TLS scans history and auto-open results for this domain
                                      navigate('/SSL-TLS scans', { 
                                        state: { 
                                          defaultView: 'webscan', 
                                          autoLoadDomain: domain.domain,
                                          openHistory: true
                                        } 
                                      });
                                    }}
                                  >
                                    <div className="flex items-start justify-between mb-2">
                                      <div className="flex-1">
                                        <div className="font-medium text-sm">{domain.domain}</div>
                                        <div className="text-xs text-muted-foreground">
                                          Added {new Date(domain.created_at).toLocaleDateString()}
                                        </div>
                                      </div>
                                      {domain.scan_result && (
                                        <Badge 
                                          variant={
                                            domain.scan_result.status === 'completed' ? 'default' :
                                            domain.scan_result.status === 'failed' ? 'destructive' :
                                            domain.scan_result.status === 'in_progress' ? 'secondary' :
                                            'outline'
                                          }
                                          className="ml-2"
                                        >
                                          {domain.scan_result.status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                          {domain.scan_result.status === 'failed' && <XCircle className="h-3 w-3 mr-1" />}
                                          {domain.scan_result.status === 'in_progress' && <Clock className="h-3 w-3 mr-1" />}
                                          {domain.scan_result.status}
                                        </Badge>
                                      )}
                                    </div>

                                    {domain.scan_result?.status === 'completed' && (
                                      <div className="space-y-2 mt-2 pt-2 border-t">
                                        {/* PQC Ready Status */}
                                        {domain.scan_result.pqc_ready !== undefined && (
                                          <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">PQC Ready</span>
                                            <Badge 
                                              variant={domain.scan_result.pqc_ready ? 'default' : 'destructive'}
                                              className={`text-xs h-5 ${domain.scan_result.pqc_ready ? 'bg-green-500' : ''}`}
                                            >
                                              {domain.scan_result.pqc_ready ? (
                                                <><CheckCircle2 className="h-3 w-3 mr-1" />Yes</>
                                              ) : (
                                                <><XCircle className="h-3 w-3 mr-1" />No</>
                                              )}
                                            </Badge>
                                          </div>
                                        )}

                                        {/* Algorithms */}
                                        {domain.scan_result.total_algorithms !== undefined && (
                                          <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Algorithms</span>
                                            <div className="flex gap-1">
                                              <Badge variant="outline" className="text-xs h-5">
                                                Total: {domain.scan_result.total_algorithms}
                                              </Badge>
                                              {domain.scan_result.vulnerable_algorithms !== undefined && domain.scan_result.vulnerable_algorithms > 0 && (
                                                <Badge variant="destructive" className="text-xs h-5">
                                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                                  Vulnerable: {domain.scan_result.vulnerable_algorithms}
                                                </Badge>
                                              )}
                                            </div>
                                          </div>
                                        )}

                                        {/* Last Scan Date */}
                                        {domain.scan_result.last_scan_date && (
                                          <div className="text-xs text-muted-foreground">
                                            Scanned {new Date(domain.scan_result.last_scan_date).toLocaleString()}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {!domain.scan_result && (
                                      <div className="mt-2 pt-2 border-t">
                                        <Badge variant="outline" className="text-xs">No scan data</Badge>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Servers */}
                          {app.servers.length > 0 && (
                            <div className="min-w-0 overflow-hidden">
                              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                <Server className="h-4 w-4" />
                                Servers ({app.servers.length})
                              </h4>
                              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                                {app.servers.map((server) => {
                                  // Use agent_activity_status from assets scan, fallback to inactive
                                  const activityStatus = (server.agent_activity_status || 'inactive').toLowerCase();
                                  const statusVariant = activityStatus === 'active' || activityStatus === 'online'
                                    ? 'default'
                                    : activityStatus === 'inactive'
                                      ? 'outline'
                                      : activityStatus === 'installing' || activityStatus === 'pending'
                                        ? 'secondary'
                                        : activityStatus === 'error' || activityStatus === 'failed'
                                          ? 'destructive'
                                          : 'outline';

                                  return (
                                    <div
                                      key={server.id}
                                      className="p-3 bg-muted/50 rounded border hover:bg-muted/70 transition-colors cursor-pointer"
                                      onClick={() => {
                                        if (server.ip_address) {
                                          navigate('/PQC-Scans', {
                                            state: { focusIp: server.ip_address }
                                          });
                                        }
                                      }}
                                    >
                                      <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1">
                                          <div className="font-medium text-sm">
                                            {server.server_name || server.hostname || server.ip_address || 'Server'}
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            {server.hostname || 'Hostname N/A'}
                                          </div>
                                          <div className="text-xs text-muted-foreground flex flex-wrap gap-3 mt-1">
                                            {server.ip_address && <span>IP: {server.ip_address}</span>}
                                            {server.operating_system && <span>OS: {server.operating_system}</span>}
                                          </div>
                                        </div>
                                        {server.agent_status && (
                                          <Badge variant={statusVariant} className="ml-2 capitalize">
                                            {activityStatus.replace(/_/g, ' ')}
                                          </Badge>
                                        )}
                                      </div>

                                      {(server.last_heartbeat || server.mac_address) && (
                                        <div className="text-xs text-muted-foreground border-t pt-2 mt-2 space-y-1">
                                          {server.last_heartbeat && (
                                            <div>Last heartbeat {new Date(server.last_heartbeat).toLocaleString()}</div>
                                          )}
                                          {server.mac_address && <div>MAC: {server.mac_address}</div>}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {app.repositories.length === 0 && app.domains.length === 0 && app.servers.length === 0 && (
                            <div className="col-span-full text-center py-12 text-muted-foreground">
                              No repositories, domains, or servers configured
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {applications.length === 0 && (
                    <Card>
                      <CardContent className="text-center py-12">
                        <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No Applications Found</h3>
                        <p className="text-muted-foreground">
                          This organization has no applications yet
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
