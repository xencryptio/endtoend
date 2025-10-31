import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Download, ChevronRight, ChevronDown, Play, Server, Activity, Clock, CheckCircle, AlertCircle, Loader, Moon, Sun, Search, Filter, X } from 'lucide-react';

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

  // Fetch functions with error handling
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/stats`);
      const data = await response.json();
      if (data.success) {
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/agents`);
      const data = await response.json();
      if (data.success) {
        setAgents(data.agents);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/tasks`);
      const data = await response.json();
      if (data.success) {
        setTasks(data.tasks);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
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
    setLastUpdate(new Date());
    setLoading(false);
  }, [fetchStats, fetchAgents, fetchTasks]);
  
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
        // The task will show up on the next refresh
        await fetchTasks();
      }
    } catch (error) {
      console.error('Error triggering scan:', error);
    }
  };

  const toggleAgentResults = async (agentId: string) => {
    const newExpanded = new Set(expandedAgents);
    if (newExpanded.has(agentId)) {
      newExpanded.delete(agentId);
    } else {
      newExpanded.add(agentId);
      if (!agentResults.has(agentId)) {
        await fetchAgentResults(agentId);
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

  // Filtered agents
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
  }, [agents, searchQuery, statusFilter]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  // Auto-refresh effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(refreshAll, 10000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, refreshAll]);

  // Initial load
  useEffect(() => {
    refreshAll();
    fetchFiles();
  }, []);

  return (
    <div className="min-h-screen transition-colors duration-200 bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="border-b transition-colors bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                <Activity className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  Crypto Audit Manager
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Enterprise Security Dashboard
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            {(['dashboard', 'downloads', 'docs'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-6 py-3 font-medium transition-all relative"
                style={{ color: activeTab === tab ? '#6366f1' : 'var(--text-secondary)' }}
              >
                {tab === 'dashboard' && 'Dashboard'}
                {tab === 'downloads' && 'Downloads'}
                {tab === 'docs' && 'Documentation'}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'dashboard' && (
          <>
            {/* Stats Grid */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
                <StatCard title="Total Agents" value={stats.agents.total} gradient='linear-gradient(135deg, #667eea 0%, #764ba2 100%)' icon={<Server size={20} />} />
                <StatCard title="Active" value={stats.agents.active} gradient='linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)' icon={<CheckCircle size={20} />} />
                <StatCard title="Inactive" value={stats.agents.inactive} gradient='linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' icon={<AlertCircle size={20} />} />
                <StatCard title="Pending" value={stats.tasks.pending} gradient='linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' icon={<Clock size={20} />} />
                <StatCard title="In Progress" value={stats.tasks.in_progress} gradient='linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' icon={<Loader size={20} />} />
                <StatCard title="Completed" value={stats.tasks.completed} gradient='linear-gradient(135deg, #10b981 0%, #059669 100%)' icon={<CheckCircle size={20} />} />
              </div>
            )}

            {/* Controls */}
            <div className="rounded-xl p-6 mb-8 shadow-lg bg-white dark:bg-slate-800">
              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={refreshAll}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg font-medium transition-all hover:scale-105 disabled:opacity-50 flex items-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}
                >
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all hover:scale-105 flex items-center gap-2 ${
                    autoRefresh ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-amber-500 to-orange-500'
                  }`}
                  style={{ color: 'white' }}
                >
                  <Activity size={16} />
                  Auto-Refresh {autoRefresh ? 'ON' : 'OFF'}
                </button>
                <div className="ml-auto text-sm text-slate-600 dark:text-slate-400">
                  Last Updated: {lastUpdate.toLocaleTimeString()}
                </div>
              </div>
            </div>

            {/* Search and Filter */}
            <div className="rounded-xl p-6 mb-8 shadow-lg bg-white dark:bg-slate-800">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type="text"
                    placeholder="Search agents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 rounded-lg border-2 transition-all focus:outline-none focus:border-blue-500 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2 rounded-lg border-2 transition-all focus:outline-none focus:border-blue-500 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="has_pending">Has Pending Tasks</option>
                  <option value="has_completed">Has Completed Scans</option>
                </select>
              </div>
            </div>

            {/* Agents */}
            <div className="rounded-xl shadow-lg overflow-hidden bg-white dark:bg-slate-800">
              <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Registered Agents ({filteredAgents.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"></th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Hostname</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">IP Address</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">OS</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Activity</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Last Seen</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgents.map((agent, idx) => (
                      <React.Fragment key={agent.agent_id}>{(() => {
                        const info = agentTaskInfo.get(agent.agent_id);
                        const isScanTriggered = triggeredScans.has(agent.agent_id) && (info?.in_progress_tasks ?? 0) > 0;
                        return (
                        <tr 
                          className="border-b transition-colors hover:bg-opacity-50 border-slate-200 dark:border-slate-700 even:bg-transparent odd:bg-slate-50/50 dark:odd:bg-slate-800/50"
                        >
                          <td className="px-6 py-4">
                            <button
                              onClick={() => toggleAgentResults(agent.agent_id)}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-slate-900 dark:text-slate-100"
                            >
                              {expandedAgents.has(agent.agent_id) ? (
                                <ChevronDown size={18} />
                              ) : (
                                <ChevronRight size={18} />
                              )}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-900 dark:text-slate-100">{agent.hostname}</div>
                            <div className="text-xs text-slate-600 dark:text-slate-400">{agent.agent_id}</div>
                          </td>
                          <td className="px-6 py-4 text-slate-900 dark:text-slate-100">{agent.ip_address}</td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{agent.os_info}</td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                            <div className="flex flex-col gap-1.5">
                              {info && info.completed_scans > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                  {info.completed_scans} completed
                                </span>
                              )}
                              {info && info.pending_tasks > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                                  {info.pending_tasks} pending
                                </span>
                              )}
                              {info?.last_scan && (
                                <div className="text-xs mt-1">Last scan: {new Date(info.last_scan).toLocaleDateString()}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                            <div className="text-sm">{agent.minutes_since_last_seen} min ago</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                              agent.status === 'active' 
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            }`}>
                              {agent.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => !isScanTriggered && triggerScan(agent.agent_id)}
                              disabled={isScanTriggered}
                              className="px-3 py-1 rounded-lg text-xs font-medium transition-all hover:scale-105 flex items-center gap-1"
                              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}
                            >
                              {isScanTriggered ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
                              {isScanTriggered ? 'Pending...' : 'Scan'}
                            </button>
                          </td>
                        </tr>
                        );
                      })()}
                        {expandedAgents.has(agent.agent_id) && (
                          <tr className="bg-slate-50 dark:bg-slate-900">
                            <td colSpan={7} className="px-6 py-4">
                              <AgentResultsView
                                agentId={agent.agent_id}
                                tasks={tasks}
                                results={agentResults.get(agent.agent_id) || []}
                                expandedResults={expandedResults}
                                toggleResultDetails={toggleResultDetails}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Tasks */}
            <div className="rounded-xl shadow-lg overflow-hidden mt-8 bg-white dark:bg-slate-800">
              <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Recent Tasks</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Task ID</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Agent</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Results</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.slice(0, 10).map((task, idx) => (
                      <tr key={task.task_id} className="border-b transition-colors border-slate-200 dark:border-slate-700 even:bg-transparent odd:bg-slate-50/50 dark:odd:bg-slate-800/50">
                        <td className="px-6 py-4">
                          <code className="text-xs text-slate-600 dark:text-slate-400">{task.task_id}</code>
                        </td>
                        <td className="px-6 py-4">
                          <code className="text-xs text-slate-600 dark:text-slate-400">{task.agent_id}</code>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            task.status === 'completed' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : task.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                          }`}>
                            {task.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {allResults.some(r => r.task_id === task.task_id) && (
                            <CheckCircle size={18} className="text-green-500" />
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                          {formatDate(task.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === 'downloads' && (
          <div className="space-y-6">
            <div className="rounded-xl shadow-lg p-6 bg-white dark:bg-slate-800">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Agent Downloads</h2>
                <p className="mt-2 text-slate-600 dark:text-slate-400">Download the agent files for your operating system. Extract and run the agent to connect to the audit system.</p>
                <div className="mt-4">
                    <button
                        className="px-4 py-2 rounded-lg font-medium transition-all hover:scale-105 flex items-center gap-2 bg-green-500 text-white"
                        onClick={fetchFiles}
                    >
                        <RefreshCw size={16} /> Refresh File List
                    </button>
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
          <div className="rounded-xl shadow-lg p-8 bg-white dark:bg-slate-800">
            <DocumentationSection />
          </div>
        )}
      </div>
    </div>
  );
};

// Helper Components
const StatCard: React.FC<{ title: string; value: number; gradient: string; icon: React.ReactNode }> = ({ title, value, gradient, icon }) => (
  <div className="rounded-xl p-6 shadow-lg transform transition-all hover:scale-105" style={{ background: gradient }}>
    <div className="flex items-center justify-between mb-2">
      <div className="text-white opacity-80">{icon}</div>
    </div>
    <div className="text-3xl font-bold text-white mb-1">{value}</div>
    <div className="text-sm text-white opacity-90">{title}</div>
  </div>
);

const AgentResultsView: React.FC<{
  agentId: string;
  tasks: Task[];
  results: AuditResult[];
  expandedResults: Set<string>;
  toggleResultDetails: (id: string) => void;
}> = ({ agentId, tasks, results, expandedResults, toggleResultDetails }) => {
  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-slate-600 dark:text-slate-400">
        No audit results found
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h4 className="text-lg font-bold mb-4 text-slate-900 dark:text-slate-100">
        Audit Results ({results.length})
      </h4>
      {results.map(result => {
        const task = tasks.find(t => t.task_id === result.task_id);
        return (
        <div 
          key={result.result_id} 
          className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700"
        >
          <div
            onClick={() => toggleResultDetails(result.result_id)}
            className="p-4 cursor-pointer flex flex-wrap items-center justify-between gap-4 transition-colors hover:opacity-80 bg-slate-50/50 dark:bg-slate-800/50"
          >
            <div className="flex items-center gap-4">
              {task && (
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  task.status === 'completed' 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : task.status === 'in_progress'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                }`}>
                  {task.status}
                </span>
              )}
              <div>
                <span className="font-medium text-slate-900 dark:text-slate-100">Task: </span>
                <code className="text-sm text-slate-600 dark:text-slate-400">{result.task_id}</code>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {task?.completed_at ? `Completed ${new Date(task.completed_at).toLocaleString()}` : `Received ${new Date(result.received_at).toLocaleString()}`}
              </span>
              {expandedResults.has(result.result_id) ? (
                <ChevronDown size={20} className="text-slate-900 dark:text-slate-100" />
              ) : (
                <ChevronRight size={20} className="text-slate-900 dark:text-slate-100" />
              )}
            </div>
          </div>
          {expandedResults.has(result.result_id) && (
            <div className="p-4 bg-white dark:bg-slate-800">
              <pre className="rounded-lg p-4 overflow-auto text-xs max-h-96 bg-slate-50 dark:bg-slate-900 text-green-600 dark:text-green-400">
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
}> = ({ title, folderType, files, formatBytes }) => (
  <div className="rounded-xl shadow-lg overflow-hidden bg-white dark:bg-slate-800">
    <div className="p-6 border-b border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h3>
        <a
          href={`${API_BASE_URL}/api/v1/files/download-zip/${folderType}`}
          download
          className="px-4 py-2 rounded-lg font-medium transition-all hover:scale-105 flex items-center gap-2"
          style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', textDecoration: 'none' }}
        >
          <Download size={16} />
          Download ZIP
        </a>
      </div>
    </div>
  </div>
);

const DocumentationSection: React.FC = () => (
  <div>
    <h2 className="text-3xl font-bold mb-8 text-slate-900 dark:text-slate-100">
      Setup Documentation
    </h2>
    
    <div className="space-y-8">
      {/* Linux Section */}
      <div className="p-6 rounded-lg border-l-4 border-blue-500 bg-slate-50 dark:bg-slate-900">
        <h3 className="text-xl font-bold mb-4 text-blue-500">Linux Agent Setup</h3>
        <ol className="space-y-3 text-slate-900 dark:text-slate-100">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">1</span>
            <span>Download the Linux Agent ZIP file from the downloads section</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">2</span>
            <span>Extract the ZIP file: <code className="px-2 py-1 rounded text-sm bg-slate-100 dark:bg-slate-950 text-green-600 dark:text-green-400">unzip Linux_Agent.zip</code></span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">3</span>
            <span>Navigate to folder: <code className="px-2 py-1 rounded text-sm bg-slate-100 dark:bg-slate-950 text-green-600 dark:text-green-400">cd "Linux Agent"</code></span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">4</span>
            <span>Make executable: <code className="px-2 py-1 rounded text-sm bg-slate-100 dark:bg-slate-950 text-green-600 dark:text-green-400">chmod +x install_crypto_agent.sh</code></span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">5</span>
            <span>Run installer: <code className="px-2 py-1 rounded text-sm bg-slate-100 dark:bg-slate-950 text-green-600 dark:text-green-400">sudo ./install_crypto_agent.sh</code></span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">6</span>
            <span>Agent will automatically start and register with the server</span>
          </li>
        </ol>
        <div className="mt-4 p-4 rounded-lg bg-white dark:bg-slate-800">
          <p className="text-sm font-semibold mb-2 text-slate-600 dark:text-slate-400">Expected Files:</p>
          <p className="text-sm text-slate-900 dark:text-slate-100">crypto_agent.py, install_crypto_agent.sh, config.json</p>
        </div>
      </div>

      {/* Windows Section */}
      <div className="p-6 rounded-lg border-l-4 border-purple-500 bg-slate-50 dark:bg-slate-900">
        <h3 className="text-xl font-bold mb-4 text-purple-500">Windows Agent Setup</h3>
        <ol className="space-y-3 text-slate-900 dark:text-slate-100">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">1</span>
            <span>Download the Windows Agent ZIP file from the downloads section</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">2</span>
            <span>Extract the ZIP file to a directory (e.g., C:\CryptoAgent)</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">3</span>
            <span>Open Command Prompt or PowerShell as Administrator</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">4</span>
            <span>Navigate to the extracted folder</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">5</span>
            <span>Run installer: <code className="px-2 py-1 rounded text-sm bg-slate-100 dark:bg-slate-950 text-green-600 dark:text-green-400">python install.py</code></span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">6</span>
            <span>The agent will be installed as a Windows service and start automatically</span>
          </li>
        </ol>
        <div className="mt-4 p-4 rounded-lg bg-white dark:bg-slate-800">
          <p className="text-sm font-semibold mb-2 text-slate-600 dark:text-slate-400">Expected Files:</p>
          <p className="text-sm text-slate-900 dark:text-slate-100">crypto_agent.py, install.py, config.json</p>
        </div>
      </div>

      {/* Configuration Section */}
      <div className="p-6 rounded-lg border-l-4 border-green-500 bg-slate-50 dark:bg-slate-900">
        <h3 className="text-xl font-bold mb-4 text-green-500">Configuration</h3>
        <p className="mb-4 text-slate-900 dark:text-slate-100">
          Edit the <code className="px-2 py-1 rounded text-sm bg-slate-100 dark:bg-slate-950 text-green-600 dark:text-green-400">config.json</code> file to configure:
        </p>
        <ul className="space-y-2 text-slate-900 dark:text-slate-100">
          <li className="flex items-start gap-2">
            <CheckCircle size={20} className="flex-shrink-0 text-green-500 mt-0.5" />
            <div>
              <strong>server_url:</strong> API server address (default: http://localhost:9000)
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle size={20} className="flex-shrink-0 text-green-500 mt-0.5" />
            <div>
              <strong>poll_interval:</strong> How often the agent checks for tasks (default: 30 seconds)
            </div>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle size={20} className="flex-shrink-0 text-green-500 mt-0.5" />
            <div>
              <strong>agent_id:</strong> Auto-generated unique identifier for the agent
            </div>
          </li>
        </ul>
      </div>

      {/* Monitoring Section */}
      <div className="p-6 rounded-lg border-l-4 border-orange-500 bg-slate-50 dark:bg-slate-900">
        <h3 className="text-xl font-bold mb-4 text-orange-500">Monitoring & Management</h3>
        <ul className="space-y-2 text-slate-900 dark:text-slate-100">
          <li className="flex items-start gap-2">
            <Activity size={20} className="flex-shrink-0 text-orange-500 mt-0.5" />
            <span>Agents automatically send heartbeats every poll interval</span>
          </li>
          <li className="flex items-start gap-2">
            <Play size={20} className="flex-shrink-0 text-orange-500 mt-0.5" />
            <span>Use the "Trigger Scan" button to manually initiate a crypto audit</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={20} className="flex-shrink-0 text-orange-500 mt-0.5" />
            <span>View audit results by clicking the arrow next to each agent</span>
          </li>
          <li className="flex items-start gap-2">
            <AlertCircle size={20} className="flex-shrink-0 text-orange-500 mt-0.5" />
            <span>Agents are marked inactive if no heartbeat is received for 1 minute</span>
          </li>
          <li className="flex items-start gap-2">
            <RefreshCw size={20} className="flex-shrink-0 text-orange-500 mt-0.5" />
            <span>Enable auto-refresh to automatically update the dashboard every 10 seconds</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
);

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleString();
};

export default CryptoAuditDashboard;