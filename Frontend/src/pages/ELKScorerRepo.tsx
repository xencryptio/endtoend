import { useEffect, useState, useCallback } from 'react';
import { Search, Plus, Edit2, Trash2, X, Save, RefreshCw, Database, Code2, ShieldCheck, ShieldOff } from 'lucide-react';
import { ELK_API_URL } from '../api/elkClient';
import { motion } from 'framer-motion';

interface RepoPattern {
  id: string;
  algorithm: string;
  patterns: string[];
  category: string;
  quantum_resistance_type: string;
  quantum_safe: boolean;
  is_pqc: boolean;
  description: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

const RESISTANCE_COLORS: Record<string, string> = {
  fully_resistant: 'bg-emerald-100 text-emerald-800',
  grover_resistant: 'bg-cyan-100 text-cyanald-800',
  vulnerable: 'bg-orange-100 text-orange-800',
  deprecated: 'bg-red-100 text-red-800',
  construction: 'bg-blue-100 text-blue-800',
  mode: 'bg-slate-100 text-slate-700',
  unknown: 'bg-gray-100 text-gray-600',
};

const defaultPattern = (): Partial<RepoPattern> => ({
  algorithm: '',
  patterns: [''],
  category: 'Unknown',
  quantum_resistance_type: 'unknown',
  quantum_safe: false,
  is_pqc: false,
  description: '',
  active: true,
});

export default function ELKScorerRepo() {
  const [patterns, setPatterns] = useState<RepoPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 100;

  const [modal, setModal] = useState<{
    open: boolean; mode: 'create' | 'edit';
    data: Partial<RepoPattern>; saving: boolean; err: string | null;
  }>({ open: false, mode: 'create', data: defaultPattern(), saving: false, err: null });

  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPatterns = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), active: 'true' });
      if (search) params.set('search', search);
      const r = await fetch(`${ELK_API_URL}/api/repo-patterns?${params}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setPatterns(data.patterns);
      setTotal(data.total);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { fetchPatterns(); }, [fetchPatterns]);

  const openCreate = () => setModal({ open: true, mode: 'create', data: defaultPattern(), saving: false, err: null });
  const openEdit = (p: RepoPattern) => setModal({ open: true, mode: 'edit', data: { ...p, patterns: [...p.patterns] }, saving: false, err: null });
  const closeModal = () => setModal(m => ({ ...m, open: false }));

  const savePattern = async () => {
    setModal(m => ({ ...m, saving: true, err: null }));
    const { mode, data } = modal;
    const cleanedPatterns = (data.patterns || []).filter(p => p.trim() !== '');
    if (!data.algorithm?.trim()) return setModal(m => ({ ...m, saving: false, err: 'Algorithm name is required' }));
    if (!cleanedPatterns.length) return setModal(m => ({ ...m, saving: false, err: 'At least one regex pattern is required' }));
    try {
      const body = { ...data, patterns: cleanedPatterns };
      const url = mode === 'create' ? `${ELK_API_URL}/api/repo-patterns` : `${ELK_API_URL}/api/repo-patterns/${data.algorithm}`;
      const r = await fetch(url, { method: mode === 'create' ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      closeModal();
      fetchPatterns();
    } catch (e: any) { setModal(m => ({ ...m, saving: false, err: e.message })); }
  };

  const deletePattern = async (name: string) => {
    if (!confirm(`Deactivate pattern "${name}"?`)) return;
    await fetch(`${ELK_API_URL}/api/repo-patterns/${name}`, { method: 'DELETE' });
    fetchPatterns();
  };

  const seedPatterns = async (overwrite = false) => {
    setSeeding(true); setSeedMsg(null);
    try {
      const r = await fetch(`${ELK_API_URL}/api/repo-patterns/_seed?overwrite=${overwrite}`, { method: 'POST' });
      const d = await r.json();
      setSeedMsg(d.message);
      fetchPatterns();
    } catch (e: any) { setSeedMsg(`Error: ${e.message}`); }
    finally { setSeeding(false); }
  };

  const refreshCache = async () => {
    setRefreshing(true);
    try {
      const r = await fetch(`${ELK_API_URL}/api/repo-patterns/_refresh-cache`, { method: 'POST' });
      const d = await r.json();
      setSeedMsg(d.message || 'Cache refreshed');
    } catch (e: any) { setSeedMsg(`Cache refresh failed: ${e.message}`); }
    finally { setRefreshing(false); }
  };

  const setPatternLine = (idx: number, val: string) => {
    setModal(m => {
      const patterns = [...(m.data.patterns || [])];
      patterns[idx] = val;
      return { ...m, data: { ...m.data, patterns } };
    });
  };
  const addPatternLine = () => setModal(m => ({ ...m, data: { ...m.data, patterns: [...(m.data.patterns || []), ''] } }));
  const removePatternLine = (idx: number) => setModal(m => {
    const patterns = (m.data.patterns || []).filter((_, i) => i !== idx);
    return { ...m, data: { ...m.data, patterns: patterns.length ? patterns : [''] } };
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Code2 className="w-7 h-7 text-violet-600" /> ELK Scorer — Repo Patterns
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Regex patterns used by the repo scanner to detect crypto algorithms in source code.
            Stored in <code className="bg-gray-100 px-1 rounded text-violet-700">crypto-repo-patterns</code> (ES).
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={openCreate} className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> Add Pattern
          </button>
          <button onClick={() => seedPatterns(false)} disabled={seeding} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            <Database className="w-4 h-4" /> {seeding ? 'Seeding…' : 'Seed Built-ins'}
          </button>
          <button onClick={refreshCache} disabled={refreshing} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh Cache
          </button>
        </div>
      </div>

      {seedMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 text-sm flex justify-between">
          {seedMsg}
          <button onClick={() => setSeedMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Active', value: total, color: 'violet' },
          { label: 'PQC Algorithms', value: patterns.filter(p => p.is_pqc).length, color: 'emerald' },
          { label: 'Vulnerable', value: patterns.filter(p => p.quantum_resistance_type === 'vulnerable').length, color: 'orange' },
          { label: 'Deprecated', value: patterns.filter(p => p.quantum_resistance_type === 'deprecated').length, color: 'red' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border p-4">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text" placeholder="Search algorithms…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading patterns…</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <strong>Error:</strong> {error}
          {error.includes('empty') || error.includes('seed') ? (
            <div className="mt-2">
              <button onClick={() => seedPatterns(false)} className="bg-red-600 text-white px-3 py-1 rounded text-sm">
                Seed Built-in Patterns Now
              </button>
            </div>
          ) : null}
        </div>
      ) : patterns.length === 0 ? (
        <div className="text-center py-16 space-y-3 text-gray-500">
          <Database className="w-10 h-10 mx-auto opacity-30" />
          <p>No patterns found. Seed the built-in algorithms to get started.</p>
          <button onClick={() => seedPatterns(false)} className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm">
            Seed Built-in Patterns
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Algorithm</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Resistance</th>
                <th className="px-4 py-3 text-center">Quantum Safe</th>
                <th className="px-4 py-3 text-center">PQC</th>
                <th className="px-4 py-3 text-center">Patterns</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {patterns.map(p => (
                <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="hover:bg-gray-50 dark:hover:bg-gray-750">
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{p.algorithm}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">{p.category}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RESISTANCE_COLORS[p.quantum_resistance_type] || RESISTANCE_COLORS.unknown}`}>
                      {p.quantum_resistance_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.quantum_safe
                      ? <ShieldCheck className="w-4 h-4 text-emerald-500 mx-auto" />
                      : <ShieldOff className="w-4 h-4 text-gray-300 mx-auto" />}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.is_pqc && <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">PQC</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">{p.patterns?.length ?? 0}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deletePattern(p.algorithm)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          {total > PAGE_SIZE && (
            <div className="flex justify-between items-center px-4 py-3 border-t text-sm text-gray-500">
              <span>Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 border rounded disabled:opacity-40">Prev</button>
                <button onClick={() => setPage(p => p + 1)} disabled={page * PAGE_SIZE >= total} className="px-2 py-1 border rounded disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">
                {modal.mode === 'create' ? 'Add Repo Pattern' : `Edit — ${modal.data.algorithm}`}
              </h2>
              <button onClick={closeModal}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {modal.err && <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-2 text-sm">{modal.err}</div>}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Algorithm Name *</label>
                  <input value={modal.data.algorithm || ''} disabled={modal.mode === 'edit'}
                    onChange={e => setModal(m => ({ ...m, data: { ...m.data, algorithm: e.target.value.toUpperCase() } }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400 focus:outline-none disabled:bg-gray-50"
                    placeholder="e.g. AES" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <input value={modal.data.category || ''} onChange={e => setModal(m => ({ ...m, data: { ...m.data, category: e.target.value } }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400 focus:outline-none"
                    placeholder="e.g. Symmetric Encryption" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quantum Resistance Type</label>
                <select value={modal.data.quantum_resistance_type || 'unknown'}
                  onChange={e => setModal(m => ({ ...m, data: { ...m.data, quantum_resistance_type: e.target.value } }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400 focus:outline-none">
                  {['fully_resistant', 'grover_resistant', 'vulnerable', 'deprecated', 'construction', 'mode', 'unknown'].map(v =>
                    <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!modal.data.quantum_safe}
                    onChange={e => setModal(m => ({ ...m, data: { ...m.data, quantum_safe: e.target.checked } }))}
                    className="w-4 h-4 rounded" />
                  Quantum Safe
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!modal.data.is_pqc}
                    onChange={e => setModal(m => ({ ...m, data: { ...m.data, is_pqc: e.target.checked } }))}
                    className="w-4 h-4 rounded" />
                  PQC Algorithm
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input value={modal.data.description || ''} onChange={e => setModal(m => ({ ...m, data: { ...m.data, description: e.target.value } }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400 focus:outline-none"
                  placeholder="Optional description" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-600">Regex Patterns *</label>
                  <button onClick={addPatternLine} className="text-xs text-violet-600 hover:text-violet-800 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                <div className="space-y-2">
                  {(modal.data.patterns || ['']).map((pat, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input value={pat} onChange={e => setPatternLine(idx, e.target.value)}
                        className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-violet-400 focus:outline-none"
                        placeholder={`\\bAES[-_]?(128|192|256)\\b`} />
                      <button onClick={() => removePatternLine(idx)} className="p-2 text-gray-400 hover:text-red-500">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Python regex syntax. Use <code>\b</code> for word boundaries.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={closeModal} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={savePattern} disabled={modal.saving}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                <Save className="w-4 h-4" />
                {modal.saving ? 'Saving…' : modal.mode === 'create' ? 'Create' : 'Save Changes'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
