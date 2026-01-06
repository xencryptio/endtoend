// import React, { useEffect, useState } from 'react';
// import { UnifiedCard } from '@/components/ui/unified';
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
// import { Button } from '@/components/ui/button';
// import ConfirmationModal from '@/components/ui/ConfirmationModal';
// import { toast } from 'sonner';

// const DB_API_BASE = 'http://localhost:8001';
// const BATCH_API_BASE = 'http://localhost:8008'; // kept for reference if needed

// const ONboardingDataPage: React.FC = () => {
//   const [orgs, setOrgs] = useState<any[]>([]);
//   const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
//   const [repos, setRepos] = useState<any[]>([]);
//   const [servers, setServers] = useState<any[]>([]);
//   const [domains, setDomains] = useState<any[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [suborgs, setSuborgs] = useState<any[]>([]);
//   const [expandedSuborgs, setExpandedSuborgs] = useState<Record<string, boolean>>({});
//   const [appsBySuborg, setAppsBySuborg] = useState<Record<string, any[]>>({});

//   const loadAppsForSuborg = async (suborgId: string) => {
//     try {
//       if (appsBySuborg[suborgId]) return; // already loaded
//       const res = await fetch(`${DB_API_BASE}/suborganizations/${suborgId}/applications`);
//       if (!res.ok) {
//         setAppsBySuborg(prev => ({ ...prev, [suborgId]: [] }));
//         return;
//       }
//       const data = await res.json();
//       setAppsBySuborg(prev => ({ ...prev, [suborgId]: data }));
//     } catch (err) {
//       setAppsBySuborg(prev => ({ ...prev, [suborgId]: [] }));
//     }
//   }

//   const [confirmModal, setConfirmModal] = useState<null | { title: string; message: string; type?: 'danger' | 'warning' | 'info'; onConfirm: () => void }>(null);

//   useEffect(() => {
//     (async () => {
//       try {
//         const r = await fetch(`${DB_API_BASE}/organizations`);
//         if (!r.ok) {
//           console.error('Failed to fetch organizations', r.status, r.statusText);
//           setOrgs([]);
//           return;
//         }
//         const data = await r.json();
//         setOrgs(data);
//         if (data.length > 0) setSelectedOrg(data[0].id);
//       } catch (err) {
//         console.error('Error fetching organizations', err);
//         setOrgs([]);
//       }
//     })();
//   }, []);

//   useEffect(() => {
//     if (!selectedOrg) return;
//     setLoading(true);
//     (async () => {
//       try {
//         const [r1, r2, r3] = await Promise.all([
//           fetch(`${DB_API_BASE}/organizations/${selectedOrg}/repositories`),
//           fetch(`${DB_API_BASE}/organizations/${selectedOrg}/servers`),
//           fetch(`${DB_API_BASE}/organizations/${selectedOrg}/domains`),
//         ]);
//         if (r1.ok) setRepos(await r1.json()); else setRepos([]);
//         if (r2.ok) setServers(await r2.json()); else setServers([]);
//         if (r3.ok) setDomains(await r3.json()); else setDomains([]);

//         // Fetch suborganizations for this org
//         try {
//           const r4 = await fetch(`${DB_API_BASE}/organizations/${selectedOrg}/suborganizations`);
//           if (r4.ok) {
//             const subs = await r4.json();
//             setSuborgs(subs);
//           } else {
//             setSuborgs([]);
//           }
//         } catch (err) {
//           setSuborgs([]);
//         }
//       } catch (err) {
//         setRepos([]); setServers([]); setDomains([]);
//       } finally {
//         setLoading(false);
//       }
//     })();
//   }, [selectedOrg]);

//   return (
//     <div className="p-6 max-w-6xl mx-auto">
//       <UnifiedCard padding="none">
//         <div className="p-6 flex items-start justify-between">
//           <div>
//             <h1 className="text-2xl font-bold">ONboarding Data</h1>
//             <p className="text-muted-foreground mt-1">View onboarding data organization-wise (repositories, servers, domains).</p>
//           </div>
//           <div>
//             <Button onClick={async () => {
//               // manual refresh
//               try {
//                 const r = await fetch(`${DB_API_BASE}/organizations`);
//                 if (!r.ok) return;
//                 const data = await r.json();
//                 setOrgs(data);
//                 <div className="p-6 max-w-6xl mx-auto">
//                   <UnifiedCard padding="none">
//                     <div className="p-6 flex items-start justify-between">
//                       <div>
//                         <h1 className="text-2xl font-bold">ONboarding Data</h1>
//                         <p className="text-muted-foreground mt-1">View onboarding data organization-wise.</p>
//                       </div>
//                       <div>
//                         <Button onClick={async () => {
//                           // manual refresh
//                           try {
//                             const r = await fetch(`${DB_API_BASE}/organizations`);
//                             if (!r.ok) return;
//                             const data = await r.json();
//                             setOrgs(data);
//                             if (data.length > 0 && !selectedOrg) setSelectedOrg(data[0].id);
//                           } catch (err) {
//                             console.error('Refresh failed', err);
//                           }
//                         }}>Refresh Orgs</Button>
//                       </div>
//                     </div>

//                     <div className="p-6 space-y-4">
//                       <div className="flex items-center gap-4">
//                         <label className="text-sm font-medium">Organization</label>
//                         <Select value={selectedOrg ?? ''} onValueChange={(v) => setSelectedOrg(v)}>
//                           <SelectTrigger className="w-80">
//                             <SelectValue placeholder={orgs.length === 0 ? 'No organizations found' : 'Select organization'} />
//                           </SelectTrigger>
//                           <SelectContent>
//                             {orgs.length === 0 ? (
//                               <div className="p-3 text-sm text-muted-foreground">No organizations available. Submit onboarding data first.</div>
//                             ) : orgs.map(o => (
//                               <SelectItem key={o.id} value={o.id}>{o.organization_name}</SelectItem>
//                             ))}
//                           </SelectContent>
//                         </Select>
//                         <Button onClick={() => { if (selectedOrg) { setSelectedOrg(selectedOrg); } }}>Refresh Data</Button>
//                         <Button variant="destructive" onClick={async () => {
//                           if (!selectedOrg) return toast.error('Select an organization first');
//                           setConfirmModal({
//                             title: 'Delete Organization',
//                             message: 'Delete this organization and all its onboarding data? This cannot be undone.',
//                             type: 'danger',
//                             onConfirm: async () => {
//                               try {
//                                 const res = await fetch(`${DB_API_BASE}/organizations/${selectedOrg}`, { method: 'DELETE' });
//                                 if (!res.ok) {
//                                   const txt = await res.text();
//                                   throw new Error(txt || res.statusText);
//                                 }
//                                 toast.success('Organization deleted successfully');
//                                 // Refresh orgs list
//                                 const r = await fetch(`${DB_API_BASE}/organizations`);
//                                 if (r.ok) {
//                                   const data = await r.json();
//                                   setOrgs(data);
//                                   setSelectedOrg(data.length ? data[0].id : null);
//                                 } else {
//                                   setOrgs([]); setSelectedOrg(null);
//                                 }
//                               } catch (err: any) {
//                                 console.error('Delete failed', err);
//                                 toast.error('Delete failed: ' + (err.message || err));
//                               }
//                             }
//                           });
//                         }}>Delete Organization</Button>
//                       </div>

//                       {/* Organization Details */}
//                       {selectedOrg && (() => {
//                         const orgDetails = orgs.find(o => o.id === selectedOrg);
//                         return (
//                           <UnifiedCard>
//                             <div className="p-4">
//                               <h3 className="font-semibold">Organization Details</h3>
//                               {orgDetails ? (
//                                 <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
//                                   <div><strong>Name:</strong> {orgDetails.organization_name}</div>
//                                   <div><strong>Type:</strong> {orgDetails.organization_type ?? '—'}</div>
//                                   <div><strong>Industry:</strong> {orgDetails.industry ?? '—'}</div>
//                                   <div><strong>Contact:</strong> {orgDetails.organization_email ?? orgDetails.contact_person ?? '—'}</div>
//                                 </div>
//                               ) : (
//                                 <p className="text-sm text-muted-foreground">No organization details available.</p>
//                               )}
//                             </div>
//                           </UnifiedCard>
//                         );
//                       })()}

//                       <UnifiedCard>
//                         <div className="p-4">
//                           <h3 className="font-semibold">Sub-Organizations</h3>
//                           {suborgs.length === 0 ? (
//                             <p className="text-sm text-muted-foreground">No sub-organizations found for this organization.</p>
//                           ) : (
//                             <div className="space-y-2">
//                               {suborgs.map(so => (
//                                 <div key={so.id} className="p-2 border rounded">
//                                   <div className="flex items-center justify-between">
//                                     <div>
//                                       <strong>{so.suborganization_name}</strong>
//                                       <div className="text-sm text-muted-foreground">ID: {so.id}</div>
//                                     </div>
//                                     <div className="flex items-center gap-2">
//                                       <Button size="sm" onClick={async () => {
//                                         const next = !expandedSuborgs[so.id];
//                                         setExpandedSuborgs(prev => ({ ...prev, [so.id]: next }));
//                                         if (next) await loadAppsForSuborg(so.id);
//                                       }}>{expandedSuborgs[so.id] ? 'Hide Apps' : 'View Apps'}</Button>
//                                     </div>
//                                   </div>

//                                   {expandedSuborgs[so.id] && (
//                                     <div className="mt-2">
//                                       {(!appsBySuborg[so.id] || appsBySuborg[so.id].length === 0) ? (
//                                         <div className="text-sm text-muted-foreground">No applications found.</div>
//                                       ) : (
//                                         <div className="space-y-2">
//                                           {appsBySuborg[so.id].map(app => (
//                                             <div key={app.id} className="p-2 border rounded">
//                                               <div className="flex items-center justify-between">
//                                                 <div>
//                                                   <strong>{app.application_name}</strong>
//                                                 </div>
//                                               </div>
//                                             </div>
//                                           ))}
//                                         </div>
//                                       )}
//                                     </div>
//                                   )}
//                                 </div>
//                               ))}
//                             </div>
//                           )}
//                         </div>
//                       </UnifiedCard>

//                       {/* Confirmation Modal */}
//                       {confirmModal && (
//                         <ConfirmationModal
//                           show={true}
//                           title={confirmModal.title}
//                           message={confirmModal.message}
//                           type={confirmModal.type as any}
//                           confirmLabel="Confirm"
//                           cancelLabel="Cancel"
//                           onConfirm={confirmModal.onConfirm}
//                           onCancel={() => setConfirmModal(null)}
//                         />
//                       )}

//                     </div>
//                   </UnifiedCard>
//                 </div>
//   );
import React, { useEffect, useState } from 'react';
import { UnifiedCard } from '@/components/ui/unified';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { toast } from 'sonner';

const DB_API_BASE = 'http://localhost:8001';
const BATCH_API_BASE = 'http://localhost:8008'; // kept for reference if needed

const ONboardingDataPage: React.FC = () => {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [repos, setRepos] = useState<any[]>([]);
  const [servers, setServers] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [suborgs, setSuborgs] = useState<any[]>([]);
  const [expandedSuborgs, setExpandedSuborgs] = useState<Record<string, boolean>>({});
  const [appsBySuborg, setAppsBySuborg] = useState<Record<string, any[]>>({});

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

  const [confirmModal, setConfirmModal] = useState<null | { title: string; message: string; type?: 'danger' | 'warning' | 'info'; onConfirm: () => void }>(null);

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <UnifiedCard padding="none">
        <div className="p-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">ONboarding Data</h1>
            <p className="text-muted-foreground mt-1">View onboarding data organization-wise (repositories, servers, domains).</p>
          </div>
          <div>
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
            }}>Refresh Orgs</Button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Organization</label>
            <Select value={selectedOrg ?? ''} onValueChange={(v) => setSelectedOrg(v)}>
              <SelectTrigger className="w-80">
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
            <Button onClick={() => { if (selectedOrg) { setSelectedOrg(selectedOrg); } }}>Refresh Data</Button>
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
            }}>Delete Organization</Button>
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
    </div>
  );
};

export default ONboardingDataPage;