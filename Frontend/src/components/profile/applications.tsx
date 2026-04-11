// @ts-nocheck
import React, { useState, useRef, useMemo } from 'react';
import { ArrowLeft, Save, RotateCcw, CheckCircle, Building2, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CryptoTable, CryptoAlgorithm, ColumnDef } from '@/components/profile/crypto table';
import { DEFAULT_ALGORITHM_LIBRARY, computeProfileAdjustmentFactor } from '@/data/algorithmLibrary';

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_KEYS = ['symmetric', 'asymmetric', 'hash', 'mac_kdf', 'pqc'] as const;
type SectionKey = typeof SECTION_KEYS[number];

const SECTION_NAMES: Record<SectionKey, string> = {
  symmetric:  'Symmetric Algorithms',
  asymmetric: 'Asymmetric Algorithms',
  hash:       'Hash Functions',
  mac_kdf:    'MACs & KDFs',
  pqc:        'Post-Quantum Cryptography',
};

const commonColumns: ColumnDef[] = [
  { key: 'algorithm_name', header: 'Algorithm' },
  { key: 'variant',        header: 'Variant' },
  { key: 'purpose',        header: 'Purpose' },
  { key: 'priority',       header: 'Priority' },
  { key: 'usage_context',  header: 'Usage Context' },
  { key: 'status_today',   header: 'Status' },
  { key: 'pqc_status',     header: 'PQC Status' },
  { key: 'notes',          header: 'Notes' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function suborgStorageKey(id: string) {
  return `suborg_algorithm_profile_${id}`;
}

function defaultSection(key: SectionKey): CryptoAlgorithm[] {
  return DEFAULT_ALGORITHM_LIBRARY.filter(a => a.section === SECTION_NAMES[key]) as CryptoAlgorithm[];
}

function loadSectionFor(suborgId: string, key: SectionKey): CryptoAlgorithm[] {
  for (const storageKey of [suborgStorageKey(suborgId), 'org_algorithm_profile']) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed[key]?.length) return parsed[key] as CryptoAlgorithm[];
    } catch {}
  }
  return defaultSection(key);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SubOrg = {
  id: string;
  name: string;
  appCount: number;
  hasCustomProfile: boolean;
  factor: number;
};

// ─── Sub-Org Profile Editor ───────────────────────────────────────────────────
const EditableTableRow = ({ 
  algorithm, 
  isEditing, 
  onEdit, 
  onSave, 
  onCancel, 
  onChange 
}: {
  algorithm: any;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onChange: (field: string, value: string) => void;
}) => {
  if (isEditing) {
    return (
      <tr className="bg-warning/5 dark:bg-warning/20">
        <td className="px-4 py-4">
          <input
            className="w-full p-1 border rounded text-sm mt-1"
            value={algorithm.usage_context}
            onChange={(e) => onChange('usage_context', e.target.value)}
            aria-label="Usage context"
          />
        </td>
        <td className="px-4 py-4">
          <input
            className="w-full p-1 border rounded text-sm"
            value={algorithm.variant}
            onChange={(e) => onChange('variant', e.target.value)}
            aria-label="Algorithm variant"
          />
        </td>
        <td className="px-4 py-4">
          <input
            className="w-full p-1 border rounded text-sm"
            value={algorithm.purpose}
            onChange={(e) => onChange('purpose', e.target.value)}
            aria-label="Algorithm purpose"
          />
        </td>
        <td className="px-4 py-4">
          <select
            className="w-full p-1 border rounded text-sm"
            value={algorithm.status_today}
            onChange={(e) => onChange('status_today', e.target.value)}
            aria-label="Status today"
          >
            <option value="Strong">Strong</option>
            <option value="Medium">Medium</option>
            <option value="Weak">Weak</option>
            <option value="Safe">Safe</option>
          </select>
        </td>
        <td className="px-4 py-4">
          <select
            className="w-full p-1 border rounded text-sm"
            value={algorithm.pqc_status}
            onChange={(e) => onChange('pqc_status', e.target.value)}
            aria-label="PQC status"
          >
            <option value="Safe">Safe</option>
            <option value="Medium">Medium</option>
            <option value="Weak">Weak</option>
            <option value="Standardized">Standardized</option>
          </select>
        </td>
        <td className="px-4 py-4">
          <select
            className="w-full p-1 border rounded text-sm"
            value={algorithm.priority}
            onChange={(e) => onChange('priority', e.target.value)}
            aria-label="Priority level"
          >
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </td>
        <td className="px-4 py-4">
          <input
            className="w-full p-1 border rounded text-sm"
            value={algorithm.notes}
            onChange={(e) => onChange('notes', e.target.value)}
            aria-label="Algorithm notes"
          />
        </td>
        <td className="px-4 py-4">
          <div className="flex space-x-1">
            <Button size="sm" variant="ghost" onClick={onSave}>
              <Check className="w-3 h-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-muted/50">
      <td className="px-4 py-4 align-top">
        <div className="font-medium text-foreground max-h-18 overflow-y-auto">{algorithm.name || algorithm.algorithm_name}</div>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="text-sm text-foreground max-h-18 overflow-y-auto">
          {algorithm.variant}
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="text-sm text-foreground max-h-18 overflow-y-auto">
          {algorithm.purpose}
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="text-sm text-foreground max-h-18 overflow-y-auto">
          {algorithm.usage_context}
        </div>
      </td>
      <td className="px-4 py-4 whitespace-nowrap">
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(algorithm.status_today)}`}>
          {algorithm.status_today}
        </span>
      </td>
      <td className="px-4 py-4 whitespace-nowrap">
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(algorithm.pqc_status)}`}>
          {algorithm.pqc_status}
        </span>
      </td>
      <td className="px-4 py-4 whitespace-nowrap">
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
          algorithm.priority === 'High' ? 'bg-destructive/10 text-destructive dark:bg-destructive/50 dark:text-destructive' :
          algorithm.priority === 'Medium' ? 'bg-warning/10 text-warning dark:bg-warning/50 dark:text-warning' :
          'bg-success/10 text-success dark:bg-success/50 dark:text-success'
        }`}>
          {algorithm.priority}
        </span>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="text-sm text-foreground max-h-18 overflow-y-auto">
          {algorithm.notes}
        </div>
      </td>
      <td className="px-4 py-4">
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Edit className="w-3 h-3" />
        </Button>
      </td>
    </tr>
  );
};

// Enhanced table component with editing capabilities
const EditableTable = ({ 
  algorithms, 
  sectionName, 
  availableAlgorithms, 
  onAlgorithmsChange, 
  originalAlgorithms 
}: {
  algorithms: any[];
  sectionName: string;
  availableAlgorithms: any[];
  onAlgorithmsChange: (algorithms: any[]) => void;
  originalAlgorithms: any[];
}) => {
  const [isTableEditMode, setIsTableEditMode] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newRow, setNewRow] = useState<Partial<any>>({});
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [tempEditData, setTempEditData] = useState<any>({});

  const isEdited = JSON.stringify(algorithms) !== JSON.stringify(originalAlgorithms);

  const handleTableEdit = () => {
    setIsEditModalOpen(true);
  };
  const handleAlgorithmSelectionChange = (newAlgorithms: any[]) => {
    onAlgorithmsChange(newAlgorithms);
  };

  const handleAddRow = () => {
    const newAlgorithm = {
      // Use a unique ID for new rows
      id: `custom-${Date.now()}`,
      // Default values for a new custom algorithm
      name: 'New Algorithm',
      variant: '',
      purpose: '',
      usage_context: '',
      status_today: 'Medium',
      pqc_status: 'Safe',
      priority: 'Medium',
      classical_recommended: 'yes',
      quantum_recommended: 'yes',
      nist_reference: '',
      notes: 'Custom added algorithm',
      isCustom: true
    };
    onAlgorithmsChange([...algorithms, newAlgorithm]);
  };

  const handleAddRowModal = () => {
    setNewRow({
      id: `custom-${Date.now()}`,
      name: 'New Custom Algorithm',
      variant: '',
      purpose: '',
      usage_context: '',
      status_today: 'Medium',
      pqc_status: 'Safe',
      priority: 'Medium',
      notes: 'Custom added algorithm',
      isCustom: true,
    });
    setIsAddModalOpen(true);
  };

  const handleRowEdit = (index: number) => {
    setEditingRowIndex(index);
    setTempEditData({ ...algorithms[index] });
  };

  const handleRowSave = () => {
    if (editingRowIndex !== null) {
      const updatedAlgorithms = [...algorithms];
      updatedAlgorithms[editingRowIndex] = tempEditData;
      onAlgorithmsChange(updatedAlgorithms);
      setEditingRowIndex(null);
      setTempEditData({});
    }
  };

  const handleRowCancel = () => {
    setEditingRowIndex(null);
    setTempEditData({});
  };

  const handleFieldChange = (field: string, value: string) => {
    setTempEditData({ ...tempEditData, [field]: value });
  };

  const handleTableReset = () => {
    onAlgorithmsChange([...originalAlgorithms]);
    setEditingRowIndex(null);
  };

  const dropdownOptions: Record<string, string[]> = {
    status_today: ['Strong', 'Medium', 'Weak', 'Safe'],
    pqc_status: ['Safe', 'Medium', 'Weak', 'Standardized'],
    priority: ['High', 'Medium', 'Low'],
  };
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <Badge variant={isEdited ? "destructive" : "secondary"}>
            {isEdited ? "Edited" : "Default"}
          </Badge>
        </div>
        <div className="space-x-2">
          <Button size="sm" variant="outline" onClick={handleTableEdit}>
            <Edit className="w-4 h-4 mr-2" /> Edit
          </Button>
          <Button size="sm" variant="outline" onClick={handleTableReset} disabled={!isEdited}>
            <RotateCcw className="w-4 h-4 mr-2" /> Reset
          </Button>
        </div>
      </div>
      {(!algorithms || algorithms.length === 0) ? (
        <div className="text-center py-4 text-muted-foreground">
          <p>No algorithms in this category</p>
          <div className="mt-4 space-x-2">
            <Button size="sm" variant="outline" onClick={handleTableEdit} >
              <Edit className="w-4 h-4 mr-1" /> Add Algorithms
            </Button>
            <Button size="sm" variant="outline" onClick={handleAddRowModal}>
              <Plus className="w-4 h-4 mr-1" /> Add Custom Row
            </Button>
          </div>
        </div>
      ) : (
        <div>
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Algorithm</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Variant</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Purpose</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Usage Context</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status Today</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">PQC Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[100px]">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {algorithms.map((algo, index) => (
                  <EditableTableRow
                    key={index}
                    algorithm={editingRowIndex === index ? tempEditData : algo}
                    isEditing={editingRowIndex === index}
                    onEdit={() => handleRowEdit(index)}
                    onSave={handleRowSave}
                    onCancel={handleRowCancel}
                    onChange={handleFieldChange}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="ghost" className="mt-2 w-full" onClick={handleAddRowModal}>
            <Plus className="w-4 h-4 mr-2" /> Add Row
          </Button>
        </div>
      )}

      {/* Edit Algorithms Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit Algorithms for {sectionName}</DialogTitle>
          </DialogHeader>
          <AlgorithmSelectionContent
            availableAlgorithms={availableAlgorithms}
            selectedAlgorithms={algorithms}
            onSelectionChange={handleAlgorithmSelectionChange}
            onClose={() => setIsEditModalOpen(false)}
            sectionName={sectionName}
          />
        </DialogContent>
      </Dialog>

      {/* Add New Row Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Custom Row to {sectionName}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {Object.keys(newRow).filter(k => !['id', 'isCustom'].includes(k)).map(key => (
              <div key={key}>
                <Label htmlFor={key} className="text-sm font-medium capitalize">{key.replace(/_/g, ' ')}</Label>
                {dropdownOptions[key] ? (
                  <Select
                    value={(newRow as any)[key] || ''}
                    onValueChange={(value) => setNewRow({ ...newRow, [key]: value })}
                  >
                    <SelectTrigger id={key}>
                      <SelectValue placeholder={`Select ${key.replace(/_/g, ' ')}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {dropdownOptions[key].map(option => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={key}
                    value={(newRow as any)[key] || ''}
                    onChange={(e) => setNewRow({ ...newRow, [key]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={() => {
              onAlgorithmsChange([...algorithms, newRow]);
              setIsAddModalOpen(false);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function SubOrgEditor({ suborg, onBack }: { suborg: SubOrg; onBack: () => void }) {
  const initialRef = useRef({
    symmetric:  loadSectionFor(suborg.id, 'symmetric'),
    asymmetric: loadSectionFor(suborg.id, 'asymmetric'),
    hash:       loadSectionFor(suborg.id, 'hash'),
    mac_kdf:    loadSectionFor(suborg.id, 'mac_kdf'),
    pqc:        loadSectionFor(suborg.id, 'pqc'),
  });

  const [symmetric,  setSymmetric]  = useState<CryptoAlgorithm[]>(initialRef.current.symmetric);
  const [asymmetric, setAsymmetric] = useState<CryptoAlgorithm[]>(initialRef.current.asymmetric);
  const [hash,       setHash]       = useState<CryptoAlgorithm[]>(initialRef.current.hash);
  const [macKdf,     setMacKdf]     = useState<CryptoAlgorithm[]>(initialRef.current.mac_kdf);
  const [pqc,        setPqc]        = useState<CryptoAlgorithm[]>(initialRef.current.pqc);

  const [isSymEdited,    setIsSymEdited]    = useState(false);
  const [isAsymEdited,   setIsAsymEdited]   = useState(false);
  const [isHashEdited,   setIsHashEdited]   = useState(false);
  const [isMacKdfEdited, setIsMacKdfEdited] = useState(false);
  const [isPqcEdited,    setIsPqcEdited]    = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');

  const anyEdited = isSymEdited || isAsymEdited || isHashEdited || isMacKdfEdited || isPqcEdited;

  const handleSave = () => {
    setSaveStatus('saving');
    const payload = { symmetric, asymmetric, hash, mac_kdf: macKdf, pqc };
    try { localStorage.setItem(suborgStorageKey(suborg.id), JSON.stringify(payload)); } catch {}
    setSaveStatus('success');
    setIsSymEdited(false); setIsAsymEdited(false); setIsHashEdited(false);
    setIsMacKdfEdited(false); setIsPqcEdited(false);
    setTimeout(() => setSaveStatus('idle'), 3500);
  };

  const handleReset = () => {
    setSymmetric(defaultSection('symmetric'));
    setAsymmetric(defaultSection('asymmetric'));
    setHash(defaultSection('hash'));
    setMacKdf(defaultSection('mac_kdf'));
    setPqc(defaultSection('pqc'));
    setIsSymEdited(false); setIsAsymEdited(false); setIsHashEdited(false);
    setIsMacKdfEdited(false); setIsPqcEdited(false);
    try { localStorage.removeItem(suborgStorageKey(suborg.id)); } catch {}
  };

  return (
    <motion.div
      key="editor"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25 }}
      className="p-4 sm:p-6"
    >
      <div className="flex items-center gap-4 mb-6">
        <Button onClick={onBack} variant="outline" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <div>
          <h2 className="text-xl font-bold text-foreground">{suborg.name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Algorithm scoring profile — changes only affect this sub-org's PQC scores
          </p>
        </div>
      </div>

      <div className="mb-6 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl px-5 py-3 flex items-start gap-3">
        <Shield className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-400">
          Editing here overrides the org-wide profile for <strong>{suborg.name}</strong> only.
          Other sub-orgs are unaffected.
        </p>
      </div>

      <div className="space-y-8">
        <CryptoTable title="Symmetric Algorithms"      data={symmetric}  columns={commonColumns} isEdited={isSymEdited}    onUpdate={d => { setSymmetric(d);  setIsSymEdited(true); }}    onReset={() => { setSymmetric(defaultSection('symmetric'));   setIsSymEdited(false); }} />
        <CryptoTable title="Asymmetric Algorithms"     data={asymmetric} columns={commonColumns} isEdited={isAsymEdited}   onUpdate={d => { setAsymmetric(d); setIsAsymEdited(true); }}   onReset={() => { setAsymmetric(defaultSection('asymmetric')); setIsAsymEdited(false); }} />
        <CryptoTable title="Hash Functions"            data={hash}       columns={commonColumns} isEdited={isHashEdited}   onUpdate={d => { setHash(d);       setIsHashEdited(true); }}   onReset={() => { setHash(defaultSection('hash'));             setIsHashEdited(false); }} />
        <CryptoTable title="MACs & KDFs"               data={macKdf}     columns={commonColumns} isEdited={isMacKdfEdited} onUpdate={d => { setMacKdf(d);     setIsMacKdfEdited(true); }} onReset={() => { setMacKdf(defaultSection('mac_kdf'));         setIsMacKdfEdited(false); }} />
        <CryptoTable title="Post-Quantum Cryptography" data={pqc}        columns={commonColumns} isEdited={isPqcEdited}    onUpdate={d => { setPqc(d);        setIsPqcEdited(true); }}    onReset={() => { setPqc(defaultSection('pqc'));               setIsPqcEdited(false); }} />
      </div>

      <div className="mt-8 flex items-center justify-end gap-4 flex-wrap">
        {saveStatus === 'success' && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle className="h-4 w-4" />
            Saved — {suborg.name} scores updated on next Dashboard load.
          </span>
        )}
        <Button onClick={handleSave} disabled={saveStatus === 'saving'}>
          <Save className="h-4 w-4 mr-2" />
          {saveStatus === 'saving' ? 'Saving…' : 'Save Changes'}
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={!anyEdited && !suborg.hasCustomProfile}>
          <RotateCcw className="h-4 w-4 mr-2" /> Reset to Defaults
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Sub-Org List ─────────────────────────────────────────────────────────────

function SubOrgList({
  suborgs,
  onSelect,
  onBack,
}: {
  suborgs: SubOrg[];
  onSelect: (s: SubOrg) => void;
  onBack: () => void;
}) {
  return (
    <motion.div
      key="list"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.25 }}
      className="p-4 sm:p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Sub-Organisation Profiles</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Edit the algorithm scoring profile for each sub-org independently.
            Custom overrides only affect that sub-org's PQC readiness scores.
          </p>
        </div>
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </div>

      {suborgs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="w-14 h-14 mx-auto mb-4 opacity-20" />
          <p className="font-medium">No sub-organisations found</p>
          <p className="text-sm mt-1">Make sure the dashboard has loaded data before opening this view.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {suborgs.map(s => (
            <motion.div
              key={s.id}
              whileHover={{ y: -4, scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 300 }}
              onClick={() => onSelect(s)}
              className="bg-card border border-border rounded-xl p-5 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 bg-primary/10 rounded-lg">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <Badge variant={s.hasCustomProfile ? 'destructive' : 'secondary'}>
                  {s.hasCustomProfile
                    ? `Custom (${s.factor > 1 ? '+' : ''}${Math.round((s.factor - 1) * 100)}%)`
                    : 'Default'}
                </Badge>
              </div>
              <h3 className="font-semibold text-foreground mb-1">{s.name}</h3>
              <p className="text-xs text-muted-foreground">
                {s.appCount} application{s.appCount !== 1 ? 's' : ''}
              </p>
              {s.hasCustomProfile && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                  <Shield className="w-3 h-3" />
                  Algorithm scoring customised
                </div>
              )}
              <div className="mt-4 text-xs text-primary font-medium">Click to edit profile →</div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function Applications({
  data,
  isLoading,
  error,
  onRefresh,
  isRefreshing,
  onBack,
  allAlgorithms,
}: {
  data: any;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  isRefreshing: boolean;
  onBack: () => void;
  allAlgorithms: any[];
}) {
  const [selectedSuborg, setSelectedSuborg] = useState<SubOrg | null>(null);

  const suborgs: SubOrg[] = useMemo(() => {
    const dataArray = Array.isArray(data) ? data : data ? [data] : [];
    const suborgMap: Record<string, { name: string; appCount: number }> = {};
    dataArray.forEach((org: any) => {
      (org.applications ?? []).forEach((app: any) => {
        const id   = app['Sub Org ID']  ?? app.sub_org_id  ?? '';
        const name = app['Sub Org']     ?? app.sub_org     ?? 'Unknown';
        if (!id) return;
        if (!suborgMap[id]) suborgMap[id] = { name, appCount: 0 };
        suborgMap[id].appCount++;
      });
    });
    return Object.entries(suborgMap).map(([id, info]) => {
      let hasCustomProfile = false;
      let factor = 1;
      try {
        const raw = localStorage.getItem(suborgStorageKey(id));
        if (raw) { hasCustomProfile = true; factor = computeProfileAdjustmentFactor(JSON.parse(raw)); }
      } catch {}
      return { id, ...info, hasCustomProfile, factor };
    });
  }, [data]);

  if (isLoading || isRefreshing) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading sub-organisations…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-destructive">
          <p className="font-semibold mb-2">Failed to load</p>
          <p className="text-sm">{error}</p>
          <Button onClick={onRefresh} variant="outline" className="mt-4">Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {selectedSuborg ? (
        <SubOrgEditor
          key={`editor-${selectedSuborg.id}`}
          suborg={selectedSuborg}
          onBack={() => setSelectedSuborg(null)}
        />
      ) : (
        <SubOrgList
          key="list"
          suborgs={suborgs}
          onSelect={setSelectedSuborg}
          onBack={onBack}
        />
      )}
    </AnimatePresence>
  );
}