import { useEffect, useState } from 'react';
import {
  Search, Plus, Edit2, Trash2, X, Save, Check, AlertCircle,
  Archive, RotateCcw, ShieldCheck, Download,
} from 'lucide-react';
import { ELK_API_URL } from '../api/elkClient';
import { motion } from 'framer-motion';

interface BackupEntry {
  name: string;
  size_bytes: number;
  modified_at: string;
  created_at: string | null;
  count: number | null;
  is_baseline: boolean;
  is_auto: boolean;
}

interface Algorithm {
  id: string;
  algorithm: string;
  component_type: string;
  base_score: number;
  quantum_safe: boolean;
  resistance: string;
  category: string;
  reason: string;
  migration: string;
  active: boolean;
  tags?: string[];
  variants?: Record<string, any>;
}

interface ApiListResponse {
  total: number;
  page: number;
  page_size: number;
  algorithms: Algorithm[];
}

interface ModalState {
  isOpen: boolean;
  mode: 'edit' | 'create';
  algorithm: Partial<Algorithm> | null;
  saving: boolean;
  error: string | null;
}

const defaultAlgorithm = (): Partial<Algorithm> => ({
  algorithm: '',
  component_type: 'symmetric',
  base_score: 50,
  quantum_safe: false,
  resistance: 'vulnerable',
  category: 'unknown',
  reason: '',
  migration: '',
  active: true,
  tags: [],
});

export default function ELKScorerDashboard() {
  const [algorithms, setAlgorithms] = useState<Algorithm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [componentFilter, setComponentFilter] = useState('');
  const [quantumSafeFilter, setQuantumSafeFilter] = useState<'all' | 'true' | 'false'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(50);
  
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    mode: 'create',
    algorithm: null,
    saving: false,
    error: null,
  });

  // Backup / restore state
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupBusy, setBackupBusy] = useState<string | null>(null);
  const [backupMsg, setBackupMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadBackups = async () => {
    try {
      setBackupsLoading(true);
      const r = await fetch(`${ELK_API_URL}/api/algorithm-backups`);
      if (!r.ok) throw new Error('Failed to load backups');
      const data = await r.json();
      setBackups(data.backups || []);
    } catch (err) {
      setBackupMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Load failed' });
    } finally {
      setBackupsLoading(false);
    }
  };

  const openBackups = () => {
    setBackupsOpen(true);
    setBackupMsg(null);
    loadBackups();
  };

  const createBackup = async () => {
    try {
      setBackupBusy('create');
      setBackupMsg(null);
      const label = window.prompt(
        'Optional label for this backup (letters/digits/dashes; leave blank for timestamp only):',
        ''
      );
      if (label === null) {
        setBackupBusy(null);
        return;
      }
      const r = await fetch(`${ELK_API_URL}/api/algorithm-backups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(label ? { label } : {}),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Backup failed');
      setBackupMsg({ kind: 'ok', text: `Backup saved: ${data.name} (${data.count} algorithms)` });
      await loadBackups();
    } catch (err) {
      setBackupMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Backup failed' });
    } finally {
      setBackupBusy(null);
    }
  };

  const restoreBaseline = async () => {
    if (!window.confirm(
      'Restore the GOLDEN baseline?\n\n' +
      'This will REPLACE every algorithm with the original 343-doc factory seed. ' +
      'A pre-restore snapshot of the current state will be saved automatically so you can undo.'
    )) return;
    try {
      setBackupBusy('baseline');
      setBackupMsg(null);
      const r = await fetch(`${ELK_API_URL}/api/algorithm-backups/_restore_baseline`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Restore failed');
      setBackupMsg({ kind: 'ok', text: `Baseline restored: ${data.restored} algorithms` });
      await loadBackups();
      await loadAlgorithms();
    } catch (err) {
      setBackupMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Restore failed' });
    } finally {
      setBackupBusy(null);
    }
  };

  const restoreFrom = async (name: string) => {
    if (!window.confirm(
      `Restore from "${name}"?\n\n` +
      'This will REPLACE the current algorithm scorer state. ' +
      'A pre-restore snapshot of the current state will be saved automatically.'
    )) return;
    try {
      setBackupBusy(name);
      setBackupMsg(null);
      const r = await fetch(`${ELK_API_URL}/api/algorithm-backups/_restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Restore failed');
      setBackupMsg({ kind: 'ok', text: `Restored ${data.restored} algorithms from ${name}` });
      await loadBackups();
      await loadAlgorithms();
    } catch (err) {
      setBackupMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Restore failed' });
    } finally {
      setBackupBusy(null);
    }
  };

  const deleteBackup = async (name: string) => {
    if (!window.confirm(`Delete backup "${name}"? This cannot be undone.`)) return;
    try {
      setBackupBusy(name);
      const r = await fetch(`${ELK_API_URL}/api/algorithm-backups/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Delete failed');
      setBackupMsg({ kind: 'ok', text: `Deleted ${name}` });
      await loadBackups();
    } catch (err) {
      setBackupMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Delete failed' });
    } finally {
      setBackupBusy(null);
    }
  };

  // Load algorithms
  useEffect(() => {
    loadAlgorithms();
  }, [page, componentFilter, quantumSafeFilter]);

  const loadAlgorithms = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${ELK_API_URL}/api/algorithms?page=${page}&page_size=${pageSize}${componentFilter ? `&component_type=${componentFilter}` : ''}${quantumSafeFilter !== 'all' ? `&quantum_safe=${quantumSafeFilter === 'true'}` : ''}`,
        { method: 'GET' }
      );

      if (!response.ok) throw new Error('Failed to load algorithms');
      const data: ApiListResponse = await response.json();
      
      setAlgorithms(data.algorithms);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load algorithms');
    } finally {
      setLoading(false);
    }
  };

  // Open edit modal
  const openEditModal = (algo: Algorithm) => {
    setModal({
      isOpen: true,
      mode: 'edit',
      algorithm: { ...algo },
      saving: false,
      error: null,
    });
  };

  // Open create modal
  const openCreateModal = () => {
    setModal({
      isOpen: true,
      mode: 'create',
      algorithm: defaultAlgorithm(),
      saving: false,
      error: null,
    });
  };

  // Close modal
  const closeModal = () => {
    setModal({
      isOpen: false,
      mode: 'create',
      algorithm: null,
      saving: false,
      error: null,
    });
  };

  // Save algorithm
  const saveAlgorithm = async () => {
    const algo = modal.algorithm;
    if (!algo || !algo.algorithm) {
      setModal(prev => ({ ...prev, error: 'Algorithm name is required' }));
      return;
    }

    setModal(prev => ({ ...prev, saving: true, error: null }));
    
    try {
      const url = modal.mode === 'edit' 
        ? `${ELK_API_URL}/api/algorithms/${algo.algorithm}`
        : `${ELK_API_URL}/api/algorithms`;
      
      const response = await fetch(url, {
        method: modal.mode === 'edit' ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(algo),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save');
      }

      setModal(prev => ({ ...prev, isOpen: false }));
      await loadAlgorithms();
    } catch (err) {
      setModal(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Save failed',
        saving: false,
      }));
    }
  };

  // Delete/deactivate algorithm
  const deleteAlgorithm = async (algoName: string) => {
    if (!window.confirm(`Deactivate algorithm "${algoName}"?`)) return;

    try {
      const response = await fetch(`${ELK_API_URL}/api/algorithms/${algoName}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Delete failed');
      await loadAlgorithms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  // Filter algorithms locally for search
  const filteredAlgos = algorithms.filter(algo =>
    algo.algorithm.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto"
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
              🔐 ELK Algorithm Scorer
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              Manage algorithm base scores and quantum-safe classifications
            </p>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={createBackup}
              disabled={backupBusy === 'create'}
              title="Save a snapshot of the current algorithm catalog"
              className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              <Archive size={18} /> {backupBusy === 'create' ? 'Saving…' : 'Backup'}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={openBackups}
              title="Browse and restore from saved backups"
              className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 rounded-lg font-medium"
            >
              <RotateCcw size={18} /> Restore…
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={restoreBaseline}
              disabled={backupBusy === 'baseline'}
              title="Reset to the immutable factory baseline (golden 343-doc seed)"
              className="flex items-center gap-2 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-800/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 px-3 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              <ShieldCheck size={18} /> {backupBusy === 'baseline' ? 'Restoring…' : 'Restore Baseline'}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
            >
              <Plus size={20} /> Add Algorithm
            </motion.button>
          </div>
        </div>

        {/* Backup status banner */}
        {backupMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-lg p-3 mb-4 flex items-center justify-between gap-2 ${
              backupMsg.kind === 'ok'
                ? 'bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
            }`}
          >
            <div className="flex items-center gap-2">
              {backupMsg.kind === 'ok' ? <Check size={18} /> : <AlertCircle size={18} />}
              <span className="text-sm">{backupMsg.text}</span>
            </div>
            <button onClick={() => setBackupMsg(null)} className="opacity-70 hover:opacity-100">
              <X size={16} />
            </button>
          </motion.div>
        )}

        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search size={18} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search algorithms..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
              />
            </div>

            {/* Component Type Filter */}
            <select
              value={componentFilter}
              onChange={(e) => {
                setComponentFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
            >
              <option value="">All Types</option>
              <option value="kex">Key Exchange (KEX)</option>
              <option value="signature">Signature</option>
              <option value="symmetric">Symmetric</option>
              <option value="hash">Hash</option>
              <option value="protocol">Protocol</option>
              <option value="mode">Mode</option>
            </select>

            {/* Quantum Safe Filter */}
            <select
              value={quantumSafeFilter}
              onChange={(e) => {
                setQuantumSafeFilter(e.target.value as any);
                setPage(1);
              }}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
            >
              <option value="all">All</option>
              <option value="true">Quantum-Safe Only</option>
              <option value="false">Quantum-Vulnerable Only</option>
            </select>

            {/* Info */}
            <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/30 px-4 py-2 rounded-lg">
              <div className="text-sm">
                <p className="text-slate-600 dark:text-slate-400">Showing:</p>
                <p className="font-semibold text-blue-600 dark:text-blue-400">
                  {filteredAlgos.length} of {total}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6 flex items-center gap-2"
          >
            <AlertCircle size={20} className="text-red-600 dark:text-red-400" />
            <span className="text-red-700 dark:text-red-400">{error}</span>
          </motion.div>
        )}

        {/* Algorithms Table */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin">⚙️</div>
              <p className="mt-2 text-slate-600 dark:text-slate-400">Loading algorithms...</p>
            </div>
          ) : filteredAlgos.length === 0 ? (
            <div className="p-8 text-center">
              <AlertCircle size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-slate-600 dark:text-slate-400">No algorithms found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-100 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">Algorithm</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">Type</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">Score</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">Quantum Safe</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">Resistance</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">Status</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-200">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {filteredAlgos.map((algo) => (
                    <motion.tr
                      key={algo.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                    >
                      <td className="px-6 py-4">
                        <span className="font-mono font-semibold text-slate-900 dark:text-white">
                          {algo.algorithm}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-medium px-2 py-1 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded">
                          {algo.component_type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 max-w-xs">
                            <div
                              className={`h-2 rounded-full transition ${
                                algo.base_score >= 80 ? 'bg-green-600' :
                                algo.base_score >= 60 ? 'bg-yellow-600' :
                                algo.base_score >= 40 ? 'bg-orange-600' :
                                'bg-red-600'
                              }`}
                              style={{ width: `${algo.base_score}%` }}
                            />
                          </div>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 min-w-12">
                            {algo.base_score.toFixed(0)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          {algo.quantum_safe ? (
                            <>
                              <Check size={18} className="text-green-600" />
                              <span className="text-sm font-medium text-green-700 dark:text-green-400">Safe</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle size={18} className="text-red-600" />
                              <span className="text-sm font-medium text-red-700 dark:text-red-400">Vulnerable</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-medium px-2 py-1 rounded ${
                          algo.resistance === 'deprecated' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                          algo.resistance === 'vulnerable' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                          algo.resistance === 'grover_resistant' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                          'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}>
                          {algo.resistance}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-medium px-2 py-1 rounded ${
                          algo.active 
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                        }`}>
                          {algo.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => openEditModal(algo)}
                            className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg transition"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => deleteAlgorithm(algo.algorithm)}
                            className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg transition"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </motion.button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex justify-between items-center mt-6">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 dark:text-white"
            >
              Previous
            </button>
            <span className="text-slate-600 dark:text-slate-400">
              Page {page} of {Math.ceil(total / pageSize)}
            </span>
            <button
              onClick={() => setPage(Math.min(Math.ceil(total / pageSize), page + 1))}
              disabled={page >= Math.ceil(total / pageSize)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 dark:text-white"
            >
              Next
            </button>
          </div>
        )}
      </motion.div>

      {/* Modal */}
      {modal.isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={closeModal}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {modal.mode === 'edit' ? 'Edit Algorithm' : 'Create New Algorithm'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
              >
                <X size={24} className="text-slate-600 dark:text-slate-400" />
              </button>
            </div>

            {modal.error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                <AlertCircle size={18} className="text-red-600 dark:text-red-400" />
                <span className="text-red-700 dark:text-red-400">{modal.error}</span>
              </div>
            )}

            <div className="space-y-4 max-h-96 overflow-y-auto">
              {/* Algorithm Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Algorithm Name *
                </label>
                <input
                  type="text"
                  value={modal.algorithm?.algorithm || ''}
                  onChange={(e) =>
                    setModal(prev => ({
                      ...prev,
                      algorithm: { ...prev.algorithm, algorithm: e.target.value.toUpperCase() }
                    }))
                  }
                  disabled={modal.mode === 'edit'}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-600"
                  placeholder="e.g., AES-256"
                />
              </div>

              {/* Component Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Component Type *
                </label>
                <select
                  value={modal.algorithm?.component_type || ''}
                  onChange={(e) =>
                    setModal(prev => ({
                      ...prev,
                      algorithm: { ...prev.algorithm, component_type: e.target.value }
                    }))
                  }
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                >
                  <option value="kex">Key Exchange (KEX)</option>
                  <option value="signature">Signature</option>
                  <option value="symmetric">Symmetric</option>
                  <option value="hash">Hash</option>
                  <option value="protocol">Protocol</option>
                  <option value="mode">Mode</option>
                </select>
              </div>

              {/* Base Score */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Base Score (0-100)
                </label>
                <div className="flex gap-4">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={modal.algorithm?.base_score || 50}
                    onChange={(e) =>
                      setModal(prev => ({
                        ...prev,
                        algorithm: { ...prev.algorithm, base_score: parseFloat(e.target.value) }
                      }))
                    }
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={modal.algorithm?.base_score || 50}
                    onChange={(e) =>
                      setModal(prev => ({
                        ...prev,
                        algorithm: { ...prev.algorithm, base_score: parseFloat(e.target.value) || 0 }
                      }))
                    }
                    className="w-20 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                  />
                </div>
              </div>

              {/* Quantum Safe */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Quantum Safe
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modal.algorithm?.quantum_safe || false}
                    onChange={(e) =>
                      setModal(prev => ({
                        ...prev,
                        algorithm: { ...prev.algorithm, quantum_safe: e.target.checked }
                      }))
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-slate-700 dark:text-slate-300">
                    {modal.algorithm?.quantum_safe ? '✓ Quantum-Safe' : '✗ Quantum-Vulnerable'}
                  </span>
                </label>
              </div>

              {/* Resistance Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Resistance Type
                </label>
                <select
                  value={modal.algorithm?.resistance || 'vulnerable'}
                  onChange={(e) =>
                    setModal(prev => ({
                      ...prev,
                      algorithm: { ...prev.algorithm, resistance: e.target.value }
                    }))
                  }
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                >
                  <option value="vulnerable">Vulnerable</option>
                  <option value="deprecated">Deprecated</option>
                  <option value="grover_resistant">Grover Resistant</option>
                  <option value="pqc_resistant">PQC Resistant</option>
                  <option value="classical">Classical</option>
                </select>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Reason for Score
                </label>
                <textarea
                  value={modal.algorithm?.reason || ''}
                  onChange={(e) =>
                    setModal(prev => ({
                      ...prev,
                      algorithm: { ...prev.algorithm, reason: e.target.value }
                    }))
                  }
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                  placeholder="Why this score?"
                  rows={3}
                />
              </div>

              {/* Migration Path */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Migration / Recommendation
                </label>
                <textarea
                  value={modal.algorithm?.migration || ''}
                  onChange={(e) =>
                    setModal(prev => ({
                      ...prev,
                      algorithm: { ...prev.algorithm, migration: e.target.value }
                    }))
                  }
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white"
                  placeholder="How to migrate or improve?"
                  rows={3}
                />
              </div>

              {/* Active Status */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modal.algorithm?.active !== false}
                    onChange={(e) =>
                      setModal(prev => ({
                        ...prev,
                        algorithm: { ...prev.algorithm, active: e.target.checked }
                      }))
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-slate-700 dark:text-slate-300">Active</span>
                </label>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={closeModal}
                disabled={modal.saving}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 dark:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={saveAlgorithm}
                disabled={modal.saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {modal.saving ? (
                  <>
                    <span className="inline-block animate-spin">⚙️</span>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={18} /> Save
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Backups Modal */}
      {backupsOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setBackupsOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center p-5 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Archive size={20} /> Algorithm Scorer Backups
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Stored on the host at <code>./algo-backups/</code> — survives Elasticsearch volume wipes.
                </p>
              </div>
              <button onClick={() => setBackupsOpen(false)} className="text-slate-500 hover:text-slate-800 dark:hover:text-white">
                <X size={22} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {backupsLoading ? (
                <div className="text-center py-8 text-slate-500">Loading backups…</div>
              ) : backups.length === 0 ? (
                <div className="text-center py-8 text-slate-500">No backups found</div>
              ) : (
                backups.map((b) => {
                  const busy = backupBusy === b.name;
                  return (
                    <div
                      key={b.name}
                      className={`border rounded-lg p-4 flex items-start justify-between gap-4 ${
                        b.is_baseline
                          ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white break-all">
                            {b.name}
                          </span>
                          {b.is_baseline && (
                            <span className="text-[10px] uppercase tracking-wide bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 px-2 py-0.5 rounded-full font-semibold">
                              Baseline
                            </span>
                          )}
                          {b.is_auto && (
                            <span className="text-[10px] uppercase tracking-wide bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded-full font-semibold">
                              Auto
                            </span>
                          )}
                          {b.name.startsWith('pre-restore-') && (
                            <span className="text-[10px] uppercase tracking-wide bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-semibold">
                              Pre-Restore
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                          {b.count != null && <span className="font-semibold">{b.count} algorithms</span>}
                          {b.count != null && ' • '}
                          {(b.size_bytes / 1024).toFixed(1)} KB
                          {' • '}
                          {new Date(b.created_at || b.modified_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => restoreFrom(b.name)}
                          disabled={busy}
                          title="Replace the live algorithm scorer with this backup"
                          className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded"
                        >
                          <RotateCcw size={14} /> Restore
                        </button>
                        {!b.is_baseline && (
                          <button
                            onClick={() => deleteBackup(b.name)}
                            disabled={busy}
                            title="Delete this backup file"
                            className="flex items-center gap-1 text-sm bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/60 disabled:opacity-50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 px-3 py-1.5 rounded"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40 sticky bottom-0">
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Download size={12} />
                Baseline cannot be deleted. Auto-snapshot is refreshed on every edit.
              </div>
              <button
                onClick={loadBackups}
                disabled={backupsLoading}
                className="text-sm bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 px-3 py-1.5 rounded disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
