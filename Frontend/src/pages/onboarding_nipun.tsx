import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { UnifiedCard, UnifiedResultCard } from '@/components/ui/unified';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Trash2, Eye, RefreshCw, Globe, FileCode, Server, Download } from 'lucide-react';
import ConfirmationModal from '@/components/ui/ConfirmationModal';

const BATCH_API_BASE = 'http://localhost:8008';
const DB_API_BASE = 'http://localhost:8001';
const REPO_SCAN_API = 'http://localhost:8003';
const TLS_SCAN_API = 'http://localhost:8000';

interface OnboardingBatch {
  id: string;
  organization_id: string;
  organization_name: string;
  created_by: string;
  repo_scan_job_id: string | null;
  tls_scan_batch_id: string | null;
  total_repos: number;
  total_domains: number;
  total_servers: number;
  created_at: string;
}

const downloadSample = (path: string, filename?: string) => {
  const url = `/onboarding_samples/${path}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || path;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const OnboardingNipunPage: React.FC = () => {
  const [isOnboardingSubmitting, setIsOnboardingSubmitting] = useState(false);
  const [onboardingJSON, setOnboardingJSON] = useState<string>('');
  const [onboardingResponse, setOnboardingResponse] = useState<any | null>(null);
  const [onboardingBatches, setOnboardingBatches] = useState<OnboardingBatch[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  
  // Onboarding Data states
  const [orgs, setOrgs] = useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [repos, setRepos] = useState<any[]>([]);
  const [servers, setServers] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [suborgs, setSuborgs] = useState<any[]>([]);
  const [expandedSuborgs, setExpandedSuborgs] = useState<Record<string, boolean>>({});
  const [appsBySuborg, setAppsBySuborg] = useState<Record<string, any[]>>({});
  const [confirmModal, setConfirmModal] = useState<null | { title: string; message: string; type?: 'danger' | 'warning' | 'info'; onConfirm: () => void }>(null);

  // CSV onboarding removed

  // Load onboarding history on mount
  useEffect(() => {
    loadOnboardingBatches();
    loadOrganizations();
  }, []);

  const loadAppsForSuborg = async (suborgId: string) => {
    try {
      if (appsBySuborg[suborgId]) return; // already loaded
      const res = await fetch(`${DB_API_BASE}/suborganizations/${suborgId}/applications`);
      if (!res.ok) {
        setAppsBySuborg(prev => ({ ...prev, [suborgId]: [] }));
        return;
      }
      const data = await res.json();
      setAppsBySuborg(prev => ({ ...prev, [suborgId]: data }));
    } catch (err) {
      setAppsBySuborg(prev => ({ ...prev, [suborgId]: [] }));
    }
  }

  const loadOnboardingBatches = async () => {
    setIsLoadingBatches(true);
    try {
      const res = await fetch(`${DB_API_BASE}/onboarding-batches?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setOnboardingBatches(data);
      }
    } catch (err) {
      console.error('Failed to load onboarding batches:', err);
    } finally {
      setIsLoadingBatches(false);
    }
  };

  const loadOrganizations = async () => {
    try {
      const r = await fetch(`${DB_API_BASE}/organizations`);
      if (!r.ok) {
        console.error('Failed to fetch organizations', r.status, r.statusText);
        setOrgs([]);
        return;
      }
      const data = await r.json();
      setOrgs(data);
      if (data.length > 0) setSelectedOrg(data[0].id);
    } catch (err) {
      console.error('Error fetching organizations', err);
      setOrgs([]);
    }
  };

  useEffect(() => {
    if (!selectedOrg) return;
    setLoading(true);
    (async () => {
      try {
        const [r1, r2, r3] = await Promise.all([
          fetch(`${DB_API_BASE}/organizations/${selectedOrg}/repositories`),
          fetch(`${DB_API_BASE}/organizations/${selectedOrg}/servers`),
          fetch(`${DB_API_BASE}/organizations/${selectedOrg}/domains`),
        ]);
        if (r1.ok) setRepos(await r1.json()); else setRepos([]);
        if (r2.ok) setServers(await r2.json()); else setServers([]);
        if (r3.ok) setDomains(await r3.json()); else setDomains([]);

        // Fetch suborganizations for this org
        try {
          const r4 = await fetch(`${DB_API_BASE}/organizations/${selectedOrg}/suborganizations`);
          if (r4.ok) {
            const subs = await r4.json();
            setSuborgs(subs);
          } else {
            setSuborgs([]);
          }
        } catch (err) {
          setSuborgs([]);
        }
      } catch (err) {
        setRepos([]); setServers([]); setDomains([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedOrg]);

  const deleteOnboardingBatch = async (batchId: string) => {
    if (!confirm('Delete this onboarding batch record? (Organization and scans will NOT be deleted)')) {
      return;
    }
    
    try {
      const res = await fetch(`${DB_API_BASE}/onboarding-batches/${batchId}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        toast.success('Onboarding batch record deleted');
        loadOnboardingBatches();
      } else {
        toast.error('Failed to delete onboarding batch');
      }
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error('Error deleting onboarding batch');
    }
  };

  const deleteAllScansFromBatch = async (batch: OnboardingBatch) => {
    const confirmMsg = `Delete ALL ${batch.total_repos} repo scans and ${batch.total_domains} domain scans triggered from "${batch.organization_name}"? This cannot be undone.`;
    if (!confirm(confirmMsg)) {
      return;
    }

    let deletedRepos = 0;
    let deletedDomains = 0;

    try {
      // Delete repo scans if they exist
      if (batch.repo_scan_job_id) {
        // Get all repo scans and delete them
        // Note: We don't have a direct batch_id link, so we'll need to query by timestamp range
        // For now, just show a message
        toast.info('Repo scan deletion not yet implemented');
      }

      // Delete TLS scan batch if it exists
      if (batch.tls_scan_batch_id) {
        const res = await fetch(`${DB_API_BASE}/scans/batch/${batch.tls_scan_batch_id}`, {
          method: 'DELETE'
        });
        if (res.ok) {
          deletedDomains = batch.total_domains;
        }
      }

      toast.success(`Deleted ${deletedDomains} domain scans`);
    } catch (err) {
      console.error('Failed to delete scans:', err);
      toast.error('Error deleting scans');
    }
  };

  const handleJSONOnboardingSubmit = async () => {
    setIsOnboardingSubmitting(true);
    try {
      let payload = null;
      try {
        payload = JSON.parse(onboardingJSON);
      } catch (err) {
        toast.error('Invalid JSON payload. Please fix formatting.');
        setIsOnboardingSubmitting(false);
        return;
      }

      const res = await fetch(`${BATCH_API_BASE}/api/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));

      setOnboardingResponse(data);
      toast.success('Onboarding JSON submitted successfully');
      
      // Reload onboarding batches to show the new one
      setTimeout(() => loadOnboardingBatches(), 1000);
    } catch (err: any) {
      console.error('JSON onboarding error', err);
      alert('JSON onboarding failed: ' + (err.message || err));
    } finally {
      setIsOnboardingSubmitting(false);
    }
  };

  return (
    <motion.div
      className="min-h-screen bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
        {/* JSON Onboarding Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <UnifiedCard padding="none">
            <div className="p-6 sm:p-8 border-b bg-gradient-to-r from-primary/5 to-transparent">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground">JSON Onboarding</h2>
              <p className="text-muted-foreground mt-2">Paste a JSON payload to onboard an organization and automatically queue repo/domain scans.</p>
            </div>
            <div className="p-6 sm:p-8 space-y-4">
              <div>
                <label className="text-sm font-semibold mb-2 block">JSON Payload</label>
                <p className="text-muted-foreground text-sm mb-3">Use the sample JSON file as a template. Repositories and domains will be scanned automatically; server agents require manual installation.</p>
                <textarea
                  className="w-full min-h-[280px] p-4 border rounded-lg bg-muted/30 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  value={onboardingJSON}
                  onChange={(e) => setOnboardingJSON(e.target.value)}
                  placeholder="Paste your JSON payload here..."
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={handleJSONOnboardingSubmit} disabled={isOnboardingSubmitting} className="gap-2">
                  <RefreshCw className={`h-4 w-4 ${isOnboardingSubmitting ? 'animate-spin' : ''}`} />
                  {isOnboardingSubmitting ? 'Submitting...' : 'Submit JSON'}
                </Button>
                <Button variant="outline" onClick={() => downloadSample('onboarding_example_hierarchical.json','onboarding_example_hierarchical.json')} className="gap-2">
                  <Download className="h-4 w-4" />
                  Download Sample
                </Button>
              </div>
            </div>
            {onboardingResponse && (
              <div className="border-t p-6 sm:p-8 bg-muted/20">
                <h4 className="font-semibold text-sm mb-3">Onboarding Response</h4>
                <pre className="text-xs max-h-64 overflow-auto p-3 bg-background rounded border font-mono">{JSON.stringify(onboardingResponse, null, 2)}</pre>
              </div>
            )}
          </UnifiedCard>
        </motion.div>
        {/* Onboarding History Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Onboarding History</h2>
              <p className="text-muted-foreground mt-2">Track all onboarding operations and their triggered scans</p>
            </div>
            <Button
              variant="outline"
              onClick={loadOnboardingBatches}
              disabled={isLoadingBatches}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingBatches ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {isLoadingBatches ? (
            <UnifiedCard padding="spacious" className="flex items-center justify-center py-16">
              <div className="text-center">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Loading onboarding history...</p>
              </div>
            </UnifiedCard>
          ) : onboardingBatches.length === 0 ? (
            <UnifiedCard padding="spacious" className="flex items-center justify-center py-16">
              <div className="text-center">
                <p className="text-muted-foreground text-lg">No onboarding history found</p>
                <p className="text-sm text-muted-foreground mt-1">Submit a JSON payload above to get started</p>
              </div>
            </UnifiedCard>
          ) : (
            <div className="space-y-4">
            {onboardingBatches.map((batch) => (
              <UnifiedResultCard
                key={batch.id}
                title={batch.organization_name}
                description={`Onboarded by ${batch.created_by || 'Unknown'} • ${new Date(batch.created_at).toLocaleString()}`}
                status="success"
                statusLabel="ONBOARDED"
                icon={<div className="h-2 w-2 bg-success rounded-full" />}
                metrics={[
                  { 
                    label: "Repositories", 
                    value: batch.total_repos
                  },
                  { 
                    label: "Domains", 
                    value: batch.total_domains
                  },
                  { 
                    label: "Servers", 
                    value: batch.total_servers
                  }
                ]}
                actions={[
                  {
                    label: "View in DB",
                    icon: <Eye size={16} />,
                    onClick: () => {
                      window.open(`${DB_API_BASE}/organizations/${batch.organization_id}`, '_blank');
                    },
                    variant: "outline" as const
                  },
                  ...(batch.tls_scan_batch_id ? [{
                    label: "Delete All Scans",
                    icon: <Trash2 size={16} />,
                    onClick: () => deleteAllScansFromBatch(batch),
                    variant: "destructive" as const
                  }] : []),
                  {
                    label: "Delete Record",
                    icon: <Trash2 size={16} />,
                    onClick: () => deleteOnboardingBatch(batch.id),
                    variant: "outline" as const
                  }
                ]}
              >
                <div className="mt-4 pt-4 border-t space-y-2">
                  {batch.repo_scan_job_id && (
                    <div className="flex items-center gap-2 text-sm">
                      <FileCode className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Repo Scan Job ID:</span>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{batch.repo_scan_job_id}</code>
                    </div>
                  )}
                  {batch.tls_scan_batch_id && (
                    <div className="flex items-center gap-2 text-sm">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">TLS Scan Batch ID:</span>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{batch.tls_scan_batch_id}</code>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Organization ID:</span>
                    <code className="text-xs bg-muted px-2 py-1 rounded">{batch.organization_id}</code>
                  </div>
                </div>
              </UnifiedResultCard>
            ))}
            </div>
          )}
        </motion.div>

        {/* Onboarding Data Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <UnifiedCard padding="none">
            <div className="p-6 sm:p-8 border-b bg-gradient-to-r from-primary/5 to-transparent flex items-center justify-between">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Onboarding Data</h2>
                <p className="text-muted-foreground mt-2">View onboarding data organization-wise (repositories, servers, domains).</p>
              </div>
              <Button onClick={async () => {
                // manual refresh
                try {
                  const r = await fetch(`${DB_API_BASE}/organizations`);
                  if (!r.ok) return;
                  const data = await r.json();
                  setOrgs(data);
                  if (data.length > 0 && !selectedOrg) setSelectedOrg(data[0].id);
                } catch (err) {
                  console.error('Refresh failed', err);
                }
              }} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh Orgs
              </Button>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="text-sm font-medium block mb-2">Select Organization</label>
                  <Select value={selectedOrg ?? ''} onValueChange={(v) => setSelectedOrg(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder={orgs.length === 0 ? 'No organizations found' : 'Select organization'} />
                    </SelectTrigger>
                    <SelectContent>
                      {orgs.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">No organizations available. Submit onboarding data first.</div>
                      ) : orgs.map(o => (
                        <SelectItem key={o.id} value={o.id}>{o.organization_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => { if (selectedOrg) { setSelectedOrg(selectedOrg); } }} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Refresh Data
                </Button>
                <Button variant="destructive" onClick={async () => {
              if (!selectedOrg) return toast.error('Select an organization first');
              setConfirmModal({
                title: 'Delete Organization',
                message: 'Delete this organization and all its onboarding data? This cannot be undone.',
                type: 'danger',
                onConfirm: async () => {
                  try {
                    const res = await fetch(`${DB_API_BASE}/organizations/${selectedOrg}`, { method: 'DELETE' });
                    if (!res.ok) {
                      const txt = await res.text();
                      throw new Error(txt || res.statusText);
                    }
                    toast.success('Organization deleted successfully');
                    // Refresh orgs list
                    const r = await fetch(`${DB_API_BASE}/organizations`);
                    if (r.ok) {
                      const data = await r.json();
                      setOrgs(data);
                      setSelectedOrg(data.length ? data[0].id : null);
                    } else {
                      setOrgs([]); setSelectedOrg(null);
                    }
                  } catch (err: any) {
                    console.error('Delete failed', err);
                    toast.error('Delete failed: ' + (err.message || err));
                  }
                }
              });
            }} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Delete Organization
            </Button>
              </div>

          {/* Organization Details */}
          {selectedOrg && (() => {
            const orgDetails = orgs.find(o => o.id === selectedOrg);
            return (
              <UnifiedCard>
                <div className="p-4">
                  <h3 className="font-semibold">Organization Details</h3>
                  {orgDetails ? (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div><strong>Name:</strong> {orgDetails.organization_name}</div>
                      <div><strong>Type:</strong> {orgDetails.organization_type ?? '—'}</div>
                      <div><strong>Industry:</strong> {orgDetails.industry ?? '—'}</div>
                      <div><strong>Contact:</strong> {orgDetails.organization_email ?? orgDetails.contact_person ?? '—'}</div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No organization details available.</p>
                  )}
                </div>
              </UnifiedCard>
            );
          })()}

          <UnifiedCard>
            <div className="p-4">
              <h3 className="font-semibold">Sub-Organizations</h3>
              {suborgs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sub-organizations found for this organization.</p>
              ) : (
                <div className="space-y-2">
                  {suborgs.map(so => (
                    <div key={so.id} className="p-2 border rounded">
                      <div className="flex items-center justify-between">
                        <div>
                          <strong>{so.suborganization_name}</strong>
                          <div className="text-sm text-muted-foreground">ID: {so.id}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={async () => {
                            const next = !expandedSuborgs[so.id];
                            setExpandedSuborgs(prev => ({ ...prev, [so.id]: next }));
                            if (next) await loadAppsForSuborg(so.id);
                          }}>{expandedSuborgs[so.id] ? 'Hide Apps' : 'View Apps'}</Button>
                        </div>
                      </div>

                      {expandedSuborgs[so.id] && (
                        <div className="mt-2">
                          {(!appsBySuborg[so.id] || appsBySuborg[so.id].length === 0) ? (
                            <div className="text-sm text-muted-foreground">No applications found.</div>
                          ) : (
                            <div className="space-y-2">
                              {appsBySuborg[so.id].map(app => (
                                <div key={app.id} className="p-2 border rounded">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <strong>{app.application_name}</strong>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </UnifiedCard>

          {/* Confirmation Modal */}
          {confirmModal && (
            <ConfirmationModal
              show={true}
              title={confirmModal.title}
              message={confirmModal.message}
              type={confirmModal.type as any}
              confirmLabel="Confirm"
              cancelLabel="Cancel"
              onConfirm={confirmModal.onConfirm}
              onCancel={() => setConfirmModal(null)}
            />
          )}
            </div>
          </UnifiedCard>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default OnboardingNipunPage;
