import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Download, ChevronRight, ChevronDown, Play, Server, Activity, Clock, CheckCircle, AlertCircle, Loader, Search, X, FileDown, Terminal, BookOpen } from 'lucide-react';

// API Configuration
const API_BASE_URL = 'http://localhost:9000';

// Types
interface Agent {
  agent_id: string;
  hostname: string;
  ip_address: string;
  os_info: string;
  registered_at: string;
  last_seen: string;
  status: string;
  minutes_since_last_seen: number;
}

interface Task {
  task_id: string;
  agent_id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface Stats {
  agents: {
    total: number;
    active: number;
    inactive: number;
  };
  tasks: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
  };
  results: {
    total: number;
  };
}

interface FileInfo {
  name: string;
  size: number;
  modified: string;
}

interface AuditResult {
  result_id: string;
  agent_id: string;
  task_id: string;
  audit_results: any;
  received_at: string;
  submitted_at: string;
}

interface AgentTaskInfo {
  completed_scans: number;
  pending_tasks: number;
  in_progress_tasks: number;
  last_scan: string | null;
  total_scans: number;
}

interface TaskResultPair {
  task: Task;
  result: AuditResult | null;
}

const CryptoAuditDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'downloads' | 'docs'>('dashboard');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [linuxFiles, setLinuxFiles] = useState<FileInfo[]>([]);
  const [windowsFiles, setWindowsFiles] = useState<FileInfo[]>([]);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [agentResults, setAgentResults] = useState<Map<string, AuditResult[]>>(new Map());
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [triggeredScans, setTriggeredScans] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [loadingResults, setLoadingResults] = useState<Set<string>>(new Set());
  const [tabTransition, setTabTransition] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/stats`);
      const data = await response.json();
      if (data.success) {
        setStats(data);
        setError(null);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      setError('Failed to fetch statistics');
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/agents`);
      const data = await response.json();
      if (data.success) {
        setAgents(data.agents);
        setError(null);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
      setError('Failed to fetch agents');
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/tasks`);
      const data = await response.json();
      if (data.success) {
        setTasks(data.tasks);
        setError(null);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setError('Failed to fetch tasks');
    }
  }, []);

  const fetchAgentResults = useCallback(async (agentId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/agent/${agentId}/results`);
      const data = await response.json();
      if (data.success) {
        setAgentResults(prev => new Map(prev).set(agentId, data.results));
      }
    } catch (error) {
      console.error('Error fetching agent results:', error);
    }
  }, []);

  const fetchFiles = useCallback(async () => {
    try {
      const [linuxResponse, windowsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/files/list/linux`),
        fetch(`${API_BASE_URL}/api/v1/files/list/windows`)
      ]);
      const linuxData = await linuxResponse.json();
      const windowsData = await windowsResponse.json();
      
      if (linuxData.success) setLinuxFiles(linuxData.files);
      if (windowsData.success) setWindowsFiles(windowsData.files);
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchAgents(), fetchTasks()]);

    // Conditionally clear triggeredScans: only remove if task is no longer pending/in_progress
    setTriggeredScans(prev => {
      const newSet = new Set(prev);
      const activeTasks = tasks.filter(t =>
        t.status === 'pending' || t.status === 'in_progress'
      ).map(t => t.agent_id);
      prev.forEach(agentId => {
        if (!activeTasks.includes(agentId)) newSet.delete(agentId);
      });
      return newSet;
    });

    const expandedAgentIds = Array.from(expandedAgents);
    await Promise.all(expandedAgentIds.map(id => fetchAgentResults(id)));
    
    setLastUpdate(new Date());
    setLoading(false);
    setIsInitialLoad(false);
  }, [fetchStats, fetchAgents, fetchTasks, expandedAgents, fetchAgentResults]);
  
  const agentTaskInfo = useMemo<Map<string, AgentTaskInfo>>(() => {
    const info = new Map<string, AgentTaskInfo>();
    agents.forEach(agent => {
      const agentTasks = tasks.filter(t => t.agent_id === agent.agent_id);
      const completed = agentTasks.filter(t => t.status === 'completed');
      
      let lastScan: string | null = null;
      if (completed.length > 0) {
        lastScan = completed.reduce((latest, task) => 
          task.completed_at && new Date(task.completed_at) > new Date(latest || 0) ? task.completed_at : latest,
          null as string | null
        );
      }

      info.set(agent.agent_id, {
        completed_scans: completed.length,
        pending_tasks: agentTasks.filter(t => t.status === 'pending').length,
        in_progress_tasks: agentTasks.filter(t => t.status === 'in_progress').length,
        last_scan: lastScan,
        total_scans: agentTasks.length,
      });
    });
    return info;
  }, [agents, tasks]);

  const triggerScan = async (agentId: string) => {
    setTriggeredScans(prev => new Set(prev).add(agentId));
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/trigger-scan/${agentId}`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        await Promise.all([fetchTasks(), fetchAgents()]); // Refresh agents to update status badges
        setTimeout(async () => { // Add a delay then refresh again to catch status change
          await Promise.all([fetchTasks(), fetchAgents()]);
        }, 1000);
      }
    } catch (error) {
      console.error('Error triggering scan:', error);
      setTriggeredScans(prev => {
        const newSet = new Set(prev);
        newSet.delete(agentId);
        return newSet;
      });
    }
  };

  const toggleAgentResults = async (agentId: string) => {
    const newExpanded = new Set(expandedAgents);
    if (newExpanded.has(agentId)) {
      newExpanded.delete(agentId);
    } else {
      newExpanded.add(agentId);
      if (!agentResults.has(agentId)) {
        setLoadingResults(prev => new Set(prev).add(agentId));
        await fetchStats(); // Refresh stats to update counts after getting results
        await fetchAgentResults(agentId);
        setLoadingResults(prev => {
          const newSet = new Set(prev);
          newSet.delete(agentId);
          return newSet;
        });
      }
    }
    setExpandedAgents(newExpanded);
  };

  const toggleResultDetails = (resultId: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(resultId)) {
      newExpanded.delete(resultId);
    } else {
      newExpanded.add(resultId);
    }
    setExpandedResults(newExpanded);
  };

  const allResults = useMemo(() => {
    return Array.from(agentResults.values()).flat();
  }, [agentResults]);

  const filteredAgents = useMemo(() => {
    return agents.filter(agent => {
      const info = agentTaskInfo.get(agent.agent_id);

      const matchesSearch = searchQuery === '' || 
        agent.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.agent_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.ip_address.includes(searchQuery);
      
      let matchesStatus = true;
      switch (statusFilter) {
        case 'all':
          matchesStatus = true;
          break;
        case 'active':
        case 'inactive':
          matchesStatus = agent.status === statusFilter;
          break;
        case 'has_pending':
          matchesStatus = (info?.pending_tasks ?? 0) > 0;
          break;
        case 'has_completed':
          matchesStatus = (info?.completed_scans ?? 0) > 0;
          break;
        default:
          matchesStatus = true;
      }

      return matchesSearch && matchesStatus;
    });
  }, [agents, searchQuery, statusFilter, agentTaskInfo]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDateTime = (dateString: string): string => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRelativeTime = (dateString: string): string => {
    const diff = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const formatTimeSince = (minutes: number): string => {
    if (minutes < 1) return '<1 min ago';
    if (minutes === 1) return '1 min ago';
    if (minutes < 60) return `${minutes} mins ago`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };


  const handleTabChange = (tab: 'dashboard' | 'downloads' | 'docs') => {
    setTabTransition(true);
    setTimeout(() => {
      setActiveTab(tab);
      setTabTransition(false);
    }, 150);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(refreshAll, 10000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, refreshAll]);

  useEffect(() => {
    refreshAll();
    fetchFiles();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdate(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 animate-slideIn">
              <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
                <Activity className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                  Crypto Audit Manager
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  Enterprise Security Dashboard
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            {(['dashboard', 'downloads', 'docs'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`px-4 sm:px-6 py-3 font-medium text-sm sm:text-base transition-all relative ${
                  activeTab === tab 
                    ? 'text-indigo-600 dark:text-indigo-400' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab === 'dashboard' && 'Dashboard'}
                {tab === 'downloads' && 'Downloads'}
                {tab === 'docs' && 'Documentation'}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 animate-slideInX" />
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 transition-opacity duration-300 ${tabTransition ? 'opacity-0' : 'opacity-100'}`}>
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg animate-slideInDown">
            <div className="flex items-center gap-2">
              <AlertCircle className="text-red-600 dark:text-red-400" size={20} />
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fadeIn">
            {isInitialLoad ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => (
                  <SkeletonStatCard key={i} />
                ))}
              </div>
            ) : stats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <StatCard title="Total Agents" value={stats.agents.total} icon={<Server size={20} />} color="indigo" />
                <StatCard title="Active" value={stats.agents.active} icon={<CheckCircle size={20} />} color="green" />
                <StatCard title="Inactive" value={stats.agents.inactive} icon={<AlertCircle size={20} />} color="red" />
                <StatCard title="Pending" value={stats.tasks.pending} icon={<Clock size={20} />} color="amber" />
                <StatCard title="Completed" value={stats.tasks.completed} icon={<CheckCircle size={20} />} color="emerald" />
              </div>
            )}

            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <button
                  onClick={refreshAll}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg font-medium text-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-md hover:shadow-lg"
                >
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm text-white transition-all flex items-center gap-2 shadow-md hover:shadow-lg ${
                    autoRefresh 
                      ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700' 
                      : 'bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800'
                  }`}
                >
                  <Activity size={16} className={autoRefresh ? 'animate-pulse' : ''} />
                  Auto-Refresh {autoRefresh ? 'ON' : 'OFF'}
                </button>
                <div className="ml-auto text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  Last Updated: {lastUpdate.toLocaleTimeString()}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type="text"
                    placeholder="Search agents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="has_pending">Has Pending Tasks</option>
                  <option value="has_completed">Has Completed Scans</option>
                </select>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                  Registered Agents ({filteredAgents.length})
                </h3>
              </div>
              {isInitialLoad ? (
                <LoadingState />
              ) : filteredAgents.length === 0 ? (
                <EmptyState message="No agents found" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 w-12"></th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Hostname</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">IP Address</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">OS</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Scans</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Last Seen</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Time Since Contact</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 w-24">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredAgents.map((agent) => (
                        <AgentRow
                          key={agent.agent_id}
                          agent={agent}
                          info={agentTaskInfo.get(agent.agent_id)}
                          expanded={expandedAgents.has(agent.agent_id)}
                          onToggle={() => toggleAgentResults(agent.agent_id)}
                          onTriggerScan={() => triggerScan(agent.agent_id)}
                          isScanTriggered={triggeredScans.has(agent.agent_id)}
                          results={agentResults.get(agent.agent_id) || []}
                          tasks={tasks}
                          expandedResults={expandedResults}
                          toggleResultDetails={toggleResultDetails}
                          loadingResults={loadingResults.has(agent.agent_id)}
                          formatDateTime={formatDateTime}
                          formatTimeSince={formatTimeSince}
                          getRelativeTime={getRelativeTime}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">Recent Tasks</h3>
              </div>
              {tasks.length === 0 ? (
                <EmptyState message="No tasks found" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Task ID</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Agent</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Results</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Created</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Started At</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Completed At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {tasks.slice(0, 10).map((task) => {
                        const agent = agents.find(a => a.agent_id === task.agent_id);
                        return (
                          <tr key={task.task_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-4 py-3">
                              <code className="text-xs text-slate-600 dark:text-slate-400">{task.task_id.substring(0, 8)}...</code>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                {agent && <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{agent.hostname}</span>}
                                <code className="text-xs text-slate-500 dark:text-slate-400">{task.agent_id.substring(0, 8)}...</code>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge status={task.status} />
                            </td>
                            <td className="px-4 py-3">
                              {allResults.some(r => r.task_id === task.task_id) 
                                ? <CheckCircle size={18} className="text-green-600 dark:text-green-400" />
                                : <span className="text-xs text-slate-400">-</span>
                              }
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                              {formatDateTime(task.created_at)}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                              {task.started_at ? formatDateTime(task.started_at) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                              {task.completed_at ? formatDateTime(task.completed_at) : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'downloads' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-start gap-3">
                <FileDown className="text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-1" size={24} />
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">Agent Downloads</h2>
                  <p className="text-slate-600 dark:text-slate-400 mb-4">Download the agent files for your operating system. Extract and run the agent to connect to the audit system.</p>
                  <button
                    className="px-4 py-2 rounded-lg font-medium text-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center gap-2 shadow-md hover:shadow-lg"
                    onClick={fetchFiles}
                  >
                    <RefreshCw size={16} />
                    Refresh File List
                  </button>
                </div>
              </div>
            </div>
            <FileDownloadSection
              title="Linux Agent"
              folderType="linux"
              files={linuxFiles}
              formatBytes={formatBytes}
            />
            <FileDownloadSection
              title="Windows Agent"
              folderType="windows"
              files={windowsFiles}
              formatBytes={formatBytes}
            />
          </div>
        )}

        {activeTab === 'docs' && (
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm animate-fadeIn">
            <DocumentationSection />
          </div>
        )}
      </main>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideInX {
          from {
            transform: scaleX(0);
          }
          to {
            transform: scaleX(1);
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        
        .animate-slideIn {
          animation: slideIn 0.4s ease-out;
        }
        
        .animate-slideInDown {
          animation: slideInDown 0.3s ease-out;
        }
        
        .animate-slideInX {
          animation: slideInX 0.3s ease-out;
          transform-origin: left;
        }
      `}</style>
    </div>
  );
};

// Helper Components
const SkeletonStatCard: React.FC = () => (
  <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm animate-pulse">
    <div className="h-10 w-10 bg-slate-200 dark:bg-slate-800 rounded-lg mb-3"></div>
    <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-16 mb-2"></div>
    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24"></div>
  </div>
);

const StatCard: React.FC<{ title: string; value: number; icon: React.ReactNode; color: string }> = ({ title, value, icon, color }) => {
  const colorClasses = {
    indigo: 'from-indigo-500 to-purple-600',
    green: 'from-green-500 to-emerald-600',
    amber: 'from-amber-500 to-orange-600',
    emerald: 'from-emerald-500 to-teal-600',
    red: 'from-red-500 to-rose-600',
  }[color];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all">
      <div className={`inline-flex p-2 rounded-lg bg-gradient-to-br ${colorClasses} mb-3`}>
        <div className="text-white">{icon}</div>
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-1">{value}</div>
      <div className="text-sm text-slate-600 dark:text-slate-400">{title}</div>
    </div>
  );
};

const Badge: React.FC<{ status: string }> = ({ status }) => {
  const styles = {
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    inactive: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  }[status] || 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles}`}>
      {status.replace('_', ' ')}
    </span>
  );
};

const LoadingState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-12">
    <Loader className="animate-spin text-indigo-600 dark:text-indigo-400 mb-4" size={32} />
    <p className="text-slate-600 dark:text-slate-400">Loading data...</p>
  </div>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center py-12">
    <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
      <AlertCircle className="text-slate-400" size={32} />
    </div>
    <p className="text-slate-600 dark:text-slate-400">{message}</p>
  </div>
);

const AgentRow: React.FC<{
  agent: Agent;
  info?: AgentTaskInfo;
  expanded: boolean;
  onToggle: () => void;
  onTriggerScan: () => void;
  isScanTriggered: boolean;
  results: AuditResult[];
  tasks: Task[];
  expandedResults: Set<string>;
  toggleResultDetails: (id: string) => void;
  loadingResults: boolean;
  formatDateTime: (date: string) => string;
  formatTimeSince: (minutes: number) => string;
  getRelativeTime: (date: string) => string;
}> = ({ agent, info, expanded, onToggle, onTriggerScan, isScanTriggered, results, tasks, expandedResults, toggleResultDetails, loadingResults, formatDateTime, formatTimeSince, getRelativeTime }) => {
  const isScanning = isScanTriggered && (info?.in_progress_tasks ?? 0) > 0;

  return (
    <>
      <tr className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all duration-200 ${expanded ? 'bg-slate-50 dark:bg-slate-800/30' : ''}`}>
        <td className="px-4 py-3">
          <button
            onClick={onToggle}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200"
          >
            {expanded ? (
              <ChevronDown size={18} className="text-slate-700 dark:text-slate-300 transition-transform" />
            ) : (
              <ChevronRight size={18} className="text-slate-700 dark:text-slate-300 transition-transform" />
            )}
          </button>
        </td>
        <td className="px-4 py-3">
          <div className="font-medium text-slate-900 dark:text-slate-100">{agent.hostname}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{agent.agent_id.substring(0, 16)}...</div>
        </td>
        <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{agent.ip_address}</td>
        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-sm">{agent.os_info}</td>
        <td className="px-4 py-3">
          <div className="flex flex-col gap-1">
            {info && info.total_scans > 0 && (
              <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                {info.total_scans} scan{info.total_scans !== 1 ? 's' : ''}
              </div>
            )}
            {info && info.completed_scans > 0 && (
              <Badge status="completed" />
            )}
            {info && info.in_progress_tasks > 0 && (
              <Badge status="in_progress" />
            )}
            {info && info.pending_tasks > 0 && (
              <Badge status="pending" />
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <Badge status={agent.status} />
        </td>
        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
          {formatDateTime(agent.last_seen)}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs ${
            agent.minutes_since_last_seen < 2 ? 'text-green-600 dark:text-green-400 font-semibold' : 
            agent.minutes_since_last_seen > 5 ? 'text-red-600 dark:text-red-400 font-semibold' : 
            'text-slate-600 dark:text-slate-400'
          }`}>
            {formatTimeSince(agent.minutes_since_last_seen)}
          </span>
        </td>
        <td className="px-4 py-3">
          <button
            onClick={onTriggerScan}
            disabled={isScanning}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md"
          >
            {isScanning ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
            {isScanning ? 'Scanning...' : 'Scan'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 dark:bg-slate-800/30">
          <td colSpan={9} className="px-4 py-4">
            {loadingResults ? (
              <LoadingState />
            ) : (
              <div className="animate-slideInDown">
                <AgentResultsView
                  agentId={agent.agent_id}
                  tasks={tasks}
                  results={results}
                  expandedResults={expandedResults}
                  toggleResultDetails={toggleResultDetails}
                  getRelativeTime={getRelativeTime}
                />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
};

const AgentResultsView: React.FC<{
  agentId: string;
  tasks: Task[];
  results: AuditResult[];
  expandedResults: Set<string>;
  toggleResultDetails: (id: string) => void;
  getRelativeTime: (date: string) => string;
}> = ({ agentId, tasks, results, expandedResults, toggleResultDetails, getRelativeTime }) => {
  const agentTasks = tasks.filter(t => t.agent_id === agentId);
  
  const taskResultPairs: TaskResultPair[] = agentTasks.map(task => ({
    task,
    result: results.find(r => r.task_id === task.task_id) || null
  }));
  
  taskResultPairs.sort((a, b) => 
    new Date(b.task.created_at).getTime() - new Date(a.task.created_at).getTime()
  );

  if (taskResultPairs.length === 0) {
    return (
      <div className="text-center py-8 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="inline-flex p-3 rounded-full bg-slate-100 dark:bg-slate-800 mb-3">
          <AlertCircle className="text-slate-400" size={24} />
        </div>
        <p>No scans found for this agent</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-base font-bold mb-4 text-slate-900 dark:text-slate-100">
        Scan History ({taskResultPairs.length} total)
      </h4>
      {taskResultPairs.map(({ task, result }) => {
        const isExpanded = result && expandedResults.has(result.result_id);
        
        return (
          <div 
            key={task.task_id} 
            className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <div
              onClick={() => result && toggleResultDetails(result.result_id)}
              className={`p-4 flex flex-wrap items-center justify-between gap-4 transition-colors ${
                result ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''
              }`}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <Badge status={task.status} />
                <div>
                  <span className="font-medium text-slate-900 dark:text-slate-100 text-sm">Task: </span>
                  <code className="text-xs text-slate-600 dark:text-slate-400">{task.task_id.substring(0, 16)}...</code>
                </div>
                {result && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
                    <CheckCircle size={16} />
                    Results Available
                  </div>
                )}
                {!result && task.status === 'completed' && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                    <Clock size={16} />
                    Awaiting Results
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  {task.completed_at 
                    ? `Completed ${getRelativeTime(task.completed_at)}` 
                    : task.started_at
                    ? `Started ${getRelativeTime(task.started_at)}`
                    : `Created ${getRelativeTime(task.created_at)}`}
                </div>
                {result && (
                  isExpanded ? (
                    <ChevronDown size={20} className="text-slate-700 dark:text-slate-300" />
                  ) : (
                    <ChevronRight size={20} className="text-slate-700 dark:text-slate-300" />
                  )
                )}
              </div>
            </div>
            {isExpanded && result && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 animate-slideInDown">
                <div className="mb-3 flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Submitted: </span>
                    <span className="text-slate-900 dark:text-slate-100">{new Date(result.submitted_at).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Received: </span>
                    <span className="text-slate-900 dark:text-slate-100">{new Date(result.received_at).toLocaleString()}</span>
                  </div>
                </div>
                <pre className="rounded-lg p-4 overflow-auto text-xs max-h-96 bg-slate-900 dark:bg-slate-950 text-green-400 font-mono border border-slate-700">
                  {JSON.stringify(result.audit_results, null, 2)}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const FileDownloadSection: React.FC<{
  title: string;
  folderType: string;
  files: FileInfo[];
  formatBytes: (bytes: number) => string;
}> = ({ title, folderType, files, formatBytes }) => {
  const icon = folderType === 'linux' ? <Terminal size={24} /> : <Server size={24} />;
  const color = folderType === 'linux' ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400';
  
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={color}>{icon}</div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          </div>
          <a
            href={`${API_BASE_URL}/api/v1/files/download-zip/${folderType}`}
            download
            className="px-4 py-2 rounded-lg font-medium text-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
          >
            <Download size={16} />
            Download ZIP
          </a>
        </div>
      </div>
    </div>
  );
};

const DocumentationSection: React.FC = () => (
  <div>
    <div className="flex items-start gap-3 mb-8">
      <BookOpen className="text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-1" size={28} />
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          Setup Documentation
        </h2>
        <p className="text-slate-600 dark:text-slate-400">
          Follow these steps to install and configure the crypto audit agents on your systems.
        </p>
      </div>
    </div>
    
    <div className="space-y-6">
      <div className="rounded-xl border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/10 p-6">
        <h3 className="text-xl font-bold mb-4 text-blue-700 dark:text-blue-400">Linux Agent Setup</h3>
        <ol className="space-y-4">
          {[
            { num: 1, text: 'Download the Linux Agent ZIP file from the downloads section' },
            { num: 2, text: 'Extract the ZIP file:', code: 'unzip Linux_Agent.zip' },
            { num: 3, text: 'Navigate to folder:', code: 'cd "Linux Agent"' },
            { num: 4, text: 'Make executable:', code: 'chmod +x install_crypto_agent.sh' },
            { num: 5, text: 'Run installer:', code: 'sudo ./install_crypto_agent.sh' },
            { num: 6, text: 'Agent will automatically start and register with the server' },
          ].map(step => (
            <li key={step.num} className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 dark:bg-blue-500 text-white flex items-center justify-center text-sm font-bold">
                {step.num}
              </span>
              <div className="flex-1">
                <span className="text-slate-900 dark:text-slate-100">{step.text}</span>
                {step.code && (
                  <code className="block mt-1 px-3 py-2 rounded-lg text-sm bg-slate-900 dark:bg-slate-950 text-green-400 font-mono border border-slate-700">
                    {step.code}
                  </code>
                )}
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 p-4 rounded-lg bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800">
          <p className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300">Expected Files:</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">crypto_agent.py, install_crypto_agent.sh, config.json</p>
        </div>
      </div>

      <div className="rounded-xl border-l-4 border-purple-500 bg-purple-50 dark:bg-purple-900/10 p-6">
        <h3 className="text-xl font-bold mb-4 text-purple-700 dark:text-purple-400">Windows Agent Setup</h3>
        <ol className="space-y-4">
          {[
            { num: 1, text: 'Download the Windows Agent ZIP file from the downloads section' },
            { num: 2, text: 'Extract the ZIP file to a directory (e.g., C:\\CryptoAgent)' },
            { num: 3, text: 'Open Command Prompt or PowerShell as Administrator' },
            { num: 4, text: 'Navigate to the extracted folder' },
            { num: 5, text: 'Run installer:', code: 'python install.py' },
            { num: 6, text: 'The agent will be installed as a Windows service and start automatically' },
          ].map(step => (
            <li key={step.num} className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-purple-600 dark:bg-purple-500 text-white flex items-center justify-center text-sm font-bold">
                {step.num}
              </span>
              <div className="flex-1">
                <span className="text-slate-900 dark:text-slate-100">{step.text}</span>
                {step.code && (
                  <code className="block mt-1 px-3 py-2 rounded-lg text-sm bg-slate-900 dark:bg-slate-950 text-green-400 font-mono border border-slate-700">
                    {step.code}
                  </code>
                )}
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 p-4 rounded-lg bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800">
          <p className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300">Expected Files:</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">crypto_agent.py, install.py, config.json</p>
        </div>
      </div>

      <div className="rounded-xl border-l-4 border-green-500 bg-green-50 dark:bg-green-900/10 p-6">
        <h3 className="text-xl font-bold mb-4 text-green-700 dark:text-green-400">Configuration</h3>
        <p className="mb-4 text-slate-900 dark:text-slate-100">
          Edit the <code className="px-2 py-1 rounded text-sm bg-slate-900 dark:bg-slate-950 text-green-400 font-mono">config.json</code> file to configure:
        </p>
        <ul className="space-y-3">
          {[
            { label: 'server_url', desc: 'API server address (default: http://localhost:9000)' },
            { label: 'poll_interval', desc: 'How often the agent checks for tasks (default: 30 seconds)' },
            { label: 'agent_id', desc: 'Auto-generated unique identifier for the agent' },
          ].map((item, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <CheckCircle size={20} className="flex-shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
              <div>
                <strong className="text-slate-900 dark:text-slate-100">{item.label}:</strong>
                <span className="text-slate-700 dark:text-slate-300"> {item.desc}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-900/10 p-6">
        <h3 className="text-xl font-bold mb-4 text-orange-700 dark:text-orange-400">Monitoring & Management</h3>
        <ul className="space-y-3">
          {[
            { icon: <Activity size={20} />, text: 'Agents automatically send heartbeats every poll interval' },
            { icon: <Play size={20} />, text: 'Use the "Scan" button to manually initiate a crypto audit' },
            { icon: <ChevronRight size={20} />, text: 'View audit results by clicking the arrow next to each agent' },
            { icon: <AlertCircle size={20} />, text: 'Agents are marked inactive if no heartbeat is received for 1 minute' },
            { icon: <RefreshCw size={20} />, text: 'Enable auto-refresh to automatically update the dashboard every 10 seconds' },
          ].map((item, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <div className="flex-shrink-0 text-orange-600 dark:text-orange-400 mt-0.5">
                {item.icon}
              </div>
              <span className="text-slate-900 dark:text-slate-100">{item.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </div>
);

export default CryptoAuditDashboard;