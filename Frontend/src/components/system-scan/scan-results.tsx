import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Search, X, Activity, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

// These types would be imported from your main types file
interface Agent {
  agent_id: string;
  hostname: string;
  ip_address: string;
  os_info: string;
}

interface AuditResult {
  result_id: string;
  agent_id: string;
  task_id: string;
  audit_results: any;
  received_at: string;
  submitted_at: string;
}

// These components would be imported from your main file or a shared components file
const ResultCard: React.FC<any> = () => null; // Placeholder
const ExpandedResultModal: React.FC<any> = () => null; // Placeholder

export const AgentResultsPage: React.FC<{
  agent: Agent;
  results: AuditResult[];
  onBack: () => void;
  // We need to pass the actual components in since they are not defined here
  ResultCardComponent: React.FC<any>;
  ExpandedResultModalComponent: React.FC<any>;
}> = ({ agent, results, onBack, ResultCardComponent, ExpandedResultModalComponent }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<AuditResult | null>(null);

  // Filter results
  const filteredResults = useMemo(() => {
    if (!searchQuery) return results;
    return results.filter(r =>
      r.task_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      new Date(r.submitted_at).toLocaleString().toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [results, searchQuery]);

  // Calculate stats
  const stats = useMemo(() => {
    const successful = results.filter(r => r.audit_results).length;
    return {
      total: results.length,
      successful,
      failed: results.length - successful,
      successRate: results.length > 0 ? ((successful / results.length) * 100).toFixed(0) : '0',
      latestScan: results.length > 0 ? results[0] : null
    };
  }, [results]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <motion.button
            whileHover={{ x: -4 }}
            onClick={onBack}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 mb-4 transition-colors font-medium"
          >
            <ArrowLeft size={20} />
            Back to Dashboard
          </motion.button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                {agent.hostname}
              </h1>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="font-mono">{agent.ip_address}</span>
                </div>
                <span>•</span>
                <span>{agent.os_info}</span>
                <span>•</span>
                <span className="font-mono text-xs">
                  ID: {agent.agent_id.substring(0, 16)}...
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="relative overflow-hidden backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border border-white/20 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-gradient-to-br from-blue-500/10 to-blue-600/10 rounded-full blur-2xl" />
              <CardContent className="p-6 text-center relative z-10">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                  <Activity className="w-6 h-6 text-white" />
                </div>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {stats.total}
                </div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-2">
                  Total Scans
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="relative overflow-hidden backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border border-white/20 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-gradient-to-br from-green-500/10 to-emerald-600/10 rounded-full blur-2xl" />
              <CardContent className="p-6 text-center relative z-10">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/30">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                  {stats.successRate}%
                </div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-2">
                  Success Rate
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="relative overflow-hidden backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border border-white/20 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-gradient-to-br from-emerald-500/10 to-green-600/10 rounded-full blur-2xl" />
              <CardContent className="p-6 text-center relative z-10">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {stats.successful}
                </div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-2">
                  Successful
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="relative overflow-hidden backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border border-white/20 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-gradient-to-br from-red-500/10 to-rose-600/10 rounded-full blur-2xl" />
              <CardContent className="p-6 text-center relative z-10">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-500/30">
                  <AlertCircle className="w-6 h-6 text-white" />
                </div>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {stats.failed}
                </div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-2">
                  Failed
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mb-8 relative"
        >
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by task ID or date..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-12 h-14 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
              <X size={20} />
            </button>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 ml-1">
            Showing {filteredResults.length} of {results.length} results
          </p>
        </motion.div>

        {/* Results Grid */}
        {filteredResults.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredResults.map((result, index) => (
              <ResultCardComponent
                key={result.result_id}
                result={result}
                index={index}
                isExpanded={expandedResultId === result.result_id}
                onToggle={() => setExpandedResultId(
                  expandedResultId === result.result_id ? null : result.result_id
                )}
                onViewDetails={() => setSelectedResult(result)}
              />
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border border-white/20">
              <CardContent className="flex flex-col items-center justify-center py-20">
                <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                  <Search className="w-10 h-10 text-slate-400" />
                </div>
                <p className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {searchQuery ? 'No results found' : 'No scan results available'}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {searchQuery ? 'Try adjusting your search query' : 'Run a scan to see results here'}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Detailed Results Modal */}
      <AnimatePresence>
        {selectedResult && (
          <ExpandedResultModalComponent
            result={selectedResult}
            onClose={() => setSelectedResult(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};