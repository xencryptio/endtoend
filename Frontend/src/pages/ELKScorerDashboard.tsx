import { useEffect, useState } from 'react';
import { Search, Plus, Edit2, Trash2, X, Save, Check, AlertCircle } from 'lucide-react';
import { ELK_API_URL } from '../api/elkClient';
import { motion } from 'framer-motion';

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
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={openCreateModal}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
          >
            <Plus size={20} /> Add Algorithm
          </motion.button>
        </div>

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
    </div>
  );
}
