import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { UnifiedCard, UnifiedBackButton, UnifiedFileInput } from "@/components/ui/unified";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { typography } from "@/lib/design-tokens";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, UploadCloud, FileText, Github, Loader2, Download, Trash2, RefreshCw, XCircle, Server, Terminal, BookOpen, CheckCircle, Activity, AlertCircle, ArrowRight, Globe } from "lucide-react";

// ============================================================================ 
// INTERFACES & TYPES
// ============================================================================ 

interface Job {
    job_id: string;
    scan_type: string;
    status: string;
    total_items: number;
    completed_items: number;
    failed_items: number;
    started_at: string;
}

interface Repository {
    id: number;
    full_name: string;
    default_branch: string;
    clone_url?: string;
    branches?: string[];
    description?: string;
}

interface FileInfo {
  name: string;
  size: number;
  modified: string;
}

type ViewType = 'dashboard' | 'tls' | 'repo' | 'system';

// ============================================================================ 
// CONSTANTS
// ============================================================================ 

const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
};

// API base URLs
const BATCH_API_BASE = 'http://localhost:8008';  // Excel Batch Scanner API
const AGENT_API_BASE = 'http://localhost:9000';  // Crypto Audit API Server

// ============================================================================ 
// HELPER COMPONENTS
// ============================================================================ 

const ScanProgress = ({ progress, logs }) => (
    <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <div className="mb-4">
            <div className="h-4 bg-background rounded-full overflow-hidden border">
                <motion.div
                    className="h-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.percentage}%` }}
                    transition={{ duration: 0.5 }}
                />
            </div>
            <div className="text-center text-sm font-medium mt-2">{progress.percentage}% Complete</div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
            <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className={`${typography.h3} text-success`}>{progress.completed}</p>
            </div>
            <div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className={`${typography.h3} text-destructive`}>{progress.failed}</p>
            </div>
            <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className={typography.h3}>{progress.completed + progress.failed}</p>
            </div>
        </div>

        <div className="max-h-48 overflow-y-auto bg-background rounded p-3 font-mono text-xs border">
            {logs.map((log, idx) => (
                <div key={idx} className={`mb-1 p-1 rounded text-xs ${log.level === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                    <span className="font-semibold">[{log.timestamp}]</span> {log.message}
                </div>
            ))}
        </div>
    </div>
);



const SystemDownloadCard: React.FC<{
    title: string;
    folderType: string;
    icon: React.ReactNode;
    description: string;
    files: FileInfo[];
    loading: boolean;
    formatBytes: (bytes: number) => string;
    apiUrl: string;
}> = ({ title, folderType, icon, description, files, loading, formatBytes, apiUrl }) => {
    const handleDownload = async () => {
        try {
            const response = await fetch(`${AGENT_API_BASE}/api/v1/files/download-zip/${folderType}`);
            if (!response.ok) {
                throw new Error(`Download failed: ${response.statusText}`);
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${title.replace(/\s+/g, '_')}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error: any) {
            console.error('Download error:', error);
            alert(`Failed to download: ${error.message}`);
        }
    };

    const colorClass = 'bg-primary/5 dark:bg-primary/20 text-primary';

    return (
        <UnifiedCard className="shadow-lg p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className={`p-4 rounded-xl ${colorClass}`}>
                            {icon}
                        </div>
                        <div>
                            <h2 className={typography.h2}>
                                {title}
                            </h2>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                {description}
                            </p>
                            {!loading && files.length > 0 && (
                                <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                                    Size: {formatBytes(files[0].size)}
                                </p>
                            )}
                        </div>
                    </div>
                    <Button
                        onClick={handleDownload}
                        size="lg"
                        className="w-full sm:w-auto"
                    >
                        <Download size={20} className="mr-2" />
                        Download {title}
                    </Button>
                </div>
        </UnifiedCard>
    );
};

// ============================================================================ 
// INSTRUCTION CARD COMPONENTS
// ============================================================================ 

const LinuxInstructionsCard = () => (
    <UnifiedCard padding="none">
        <div className="p-6">
            <div className="flex items-center gap-3">
                <BookOpen className="text-primary" size={24} />
                <h3 className={typography.h3}>Linux Setup Instructions</h3>
            </div>
        </div>
        <div className="p-6">
            <ol className="space-y-6">
                {[ 
                    { num: 1, text: 'Download the Linux Agent ZIP file', note: 'Click the download button above' },
                    { num: 2, text: 'Extract the ZIP file', code: 'unzip Linux_Agent.zip' },
                    { num: 3, text: 'Navigate to the extracted folder', code: 'cd "Linux Agent"' },
                    { num: 4, text: 'Make the installer executable', code: 'chmod +x install_crypto_agent.sh' },
                    { num: 5, text: 'Run the installer with sudo', code: 'sudo ./install_crypto_agent.sh' },
                    { num: 6, text: 'Verify installation', note: 'The agent will automatically start and register with the server' },
                ].map(step => (
                    <li key={step.num} className="flex gap-4">
                        <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary text-white flex items-center justify-center text-base font-bold shadow-md">{step.num}</span>
                        <div className="flex-1">
                            <p className="text-slate-900 dark:text-slate-100 font-medium">{step.text}</p>
                            {step.note && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{step.note}</p>}
                            {step.code && <code className="block mt-3 px-4 py-3 rounded-lg text-sm bg-slate-900 dark:bg-slate-950 text-emerald-400 font-mono shadow-inner">{step.code}</code>}
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    </UnifiedCard>
);

const WindowsInstructionsCard = () => (
    <UnifiedCard padding="none">
        <div className="p-6">
            <div className="flex items-center gap-3">
                <BookOpen className="text-primary" size={24} />
                <h3 className={typography.h3}>Windows Setup Instructions</h3>
            </div>
        </div>
        <div className="p-6">
            <ol className="space-y-6">
                {[ 
                    { num: 1, text: 'Download the Windows Agent ZIP file', note: 'Click the download button above' },
                    { num: 2, text: 'Extract the ZIP file to a directory', note: 'Example: C:\\CryptoAgent' },
                    { num: 3, text: 'Open Command Prompt or PowerShell as Administrator', note: 'Right-click and select "Run as Administrator"' },
                    { num: 4, text: 'Navigate to the extracted folder', code: 'cd C:\\CryptoAgent' },
                    { num: 5, text: 'Run the installer script', code: 'python install.py' },
                    { num: 6, text: 'Verify installation', note: 'The agent will be installed as a Windows service and start automatically' },
                ].map(step => (
                    <li key={step.num} className="flex gap-4">
                        <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-scan-pqc text-white flex items-center justify-center text-base font-bold shadow-md">{step.num}</span>
                        <div className="flex-1">
                            <p className="text-slate-900 dark:text-slate-100 font-medium">{step.text}</p>
                            {step.note && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{step.note}</p>}
                            {step.code && <code className="block mt-3 px-4 py-3 rounded-lg text-sm bg-slate-900 dark:bg-slate-950 text-emerald-400 font-mono shadow-inner">{step.code}</code>}
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    </UnifiedCard>
);

const ConfigurationCard = () => (
    <UnifiedCard padding="none">
        <div className="p-6">
            <div className="flex items-center gap-3">
                <BookOpen className="text-primary" size={24} />
                <h3 className={typography.h3}>Configuration</h3>
            </div>
            <p className="text-muted-foreground text-sm">Both agents use the same configuration file format</p>
        </div>
        <div className="p-6">
            <div className="mb-6">
                <p className="text-slate-900 dark:text-slate-100 mb-4">Edit the <code className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-sm font-mono">config.json</code> file to configure:</p>
                <div className="space-y-4">
                    {[ 
                        { label: 'server_url', desc: 'API server address', value: AGENT_API_BASE, required: true },
                        { label: 'poll_interval', desc: 'How often the agent checks for tasks', value: '30 seconds (default)', required: false },
                        { label: 'agent_id', desc: 'Unique identifier for the agent', value: 'Auto-generated on first run', required: false },
                    ].map((item, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-4 bg-white dark:bg-slate-800 rounded-lg border border-primary/20 dark:border-primary/30">
                            <CheckCircle size={20} className="flex-shrink-0 text-success mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <code className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100">{item.label}</code>
                                    {item.required && <span className="text-xs px-2 py-0.5 bg-destructive/10 dark:bg-destructive/30 text-destructive rounded font-semibold">Required</span>}
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{item.desc}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1 font-mono">{item.value}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="p-5 rounded-lg bg-white dark:bg-slate-800 border border-primary/20 dark:border-primary/30">
                <p className="text-sm font-semibold mb-3 text-success">Example config.json:</p>
                <pre className="text-sm bg-slate-900 dark:bg-slate-950 text-emerald-400 font-mono p-4 rounded-lg overflow-x-auto">{`{
  "server_url": "${AGENT_API_BASE}",
  "poll_interval": 30,
  "agent_id": "auto-generated-uuid"
}`}</pre>
            </div>
        </div>
    </UnifiedCard>
);

const MonitoringCard = () => (
    <UnifiedCard padding="none">
        <div className="p-6">
            <div className="flex items-center gap-3">
                <Activity className="text-primary" size={24} />
                <h3 className={typography.h3}>Monitoring & Management</h3>
            </div>
            <p className="text-muted-foreground text-sm">Understanding agent behavior and dashboard features</p>
        </div>
        <div className="p-6">
            <div className="space-y-4">
                {[ 
                    { icon: <Activity size={20} />, text: 'Agents automatically send heartbeats every poll interval', color: 'text-primary' },
                    { icon: <Download size={20} />, text: 'Use the "Scan" button in the dashboard to manually initiate a crypto audit', color: 'text-success' },
                    { icon: <ArrowLeft size={20} />, text: 'View audit results by clicking the arrow next to each agent', color: 'text-scan-pqc' },
                    { icon: <AlertCircle size={20} />, text: 'Agents are marked inactive if no heartbeat is received for 1 minute', color: 'text-destructive' },
                    { icon: <RefreshCw size={20} />, text: 'Enable auto-refresh to automatically update the dashboard every 10 seconds', color: 'text-primary' },
                ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-4 p-4 bg-white dark:bg-slate-800 rounded-lg border border-primary/20 dark:border-primary/30">
                        <div className={`flex-shrink-0 mt-0.5 ${item.color}`}>{item.icon}</div>
                        <p className="text-slate-900 dark:text-slate-100">{item.text}</p>
                    </div>
                ))}
            </div>
        </div>
    </UnifiedCard>
);

// ============================================================================ 
// MAIN ONBOARDING COMPONENT
// ============================================================================ 

const OnboardingPage = () => {
    // View State
    const [view, setView] = useState<ViewType>('dashboard');

    // Component State
    const [tlsFile, setTlsFile] = useState<File | null>(null);
    const [repoFile, setRepoFile] = useState<File | null>(null);
    const [githubUrl, setGithubUrl] = useState('');
    const [discoveredRepos, setDiscoveredRepos] = useState<Repository[]>([]);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [selectedRepos, setSelectedRepos] = useState<Set<number>>(new Set());
    const [repoBranches, setRepoBranches] = useState<Record<number, string>>({});

    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [scanProgress, setScanProgress] = useState({
        percentage: 0,
        completed: 0,
        failed: 0,
        logs: [] as Array<{ timestamp: string; level: string; message: string }>
    });
    const [showProgress, setShowProgress] = useState(false);

    // Loading and Error States
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [githubError, setGithubError] = useState('');
    const [linuxFiles, setLinuxFiles] = useState<FileInfo[]>([]);
    const [windowsFiles, setWindowsFiles] = useState<FileInfo[]>([]);
    const [systemLoading, setSystemLoading] = useState(false);

    // Fetch jobs on mount and periodically
    useEffect(() => {
        if (view === 'dashboard') {
            loadJobs();
            const interval = setInterval(loadJobs, 30000);
            return () => clearInterval(interval);
        }
        if (view === 'system') {
            fetchAgentFiles();
        }
    }, [view]);

    const fetchAgentFiles = async () => {
        setSystemLoading(true);
        try {
            const [linuxResponse, windowsResponse] = await Promise.all([
                fetch(`${AGENT_API_BASE}/api/v1/files/list/linux`),
                fetch(`${AGENT_API_BASE}/api/v1/files/list/windows`)
            ]);
            const linuxData = await linuxResponse.json();
            const windowsData = await windowsResponse.json();
            
            if (linuxData.success) setLinuxFiles(linuxData.files);
            if (windowsData.success) setWindowsFiles(windowsData.files);
        } catch (error) {
            console.error('Error fetching files:', error);
        } finally {
            setSystemLoading(false);
        }
    };

    const loadJobs = async () => {
        try {
            const response = await fetch(`${BATCH_API_BASE}/api/batch-jobs`);
            if (!response.ok) throw new Error('API Error');
            const data = await response.json();
            setJobs(data.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()));
        } catch (error) {
            console.error('Error loading jobs:', error);
            setJobs([]);
        }
    };
    
    const discoverGitHubRepos = async () => {
        setIsDiscovering(true);
        setGithubError('');
        setDiscoveredRepos([]);
        try {
            const response = await fetch(`${BATCH_API_BASE}/api/github/discover`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ github_url: githubUrl })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'Failed to discover repositories.');
            
            // Ensure each repo has a unique id
            const reposWithIds = data.repositories.map((repo, index) => ({
                ...repo,
                id: repo.id ?? index // Use repo.id if available, otherwise use index as fallback
            }));
            
            console.log('📦 Discovered repos with IDs:', reposWithIds.map(r => ({ name: r.full_name, id: r.id })));
            
            setDiscoveredRepos(reposWithIds);
            setSelectedRepos(new Set(reposWithIds.map(r => r.id)));
        } catch (error: any) {
            setGithubError(error.message || 'An unknown error occurred.');
        } finally {
            setIsDiscovering(false);
        }
    };

    const connectSSE = (jobId: string) => {
        const eventSource = new EventSource(`${BATCH_API_BASE}/api/batch-jobs/${jobId}/stream`);
        
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'progress') {
                setScanProgress(prev => ({
                    percentage: Math.round(data.data.percentage || 0),
                    completed: data.data.completed,
                    failed: data.data.failed,
                    logs: [...prev.logs, {
                        timestamp: new Date().toLocaleTimeString(),
                        level: data.data.status === 'completed' ? 'success' : 'error',
                        message: data.data.error ? `${data.data.domain || data.data.repo_url} - Failed: ${data.data.error}` : `${data.data.domain || data.data.repo_url} - Completed`
                    }]
                }));
            } else if (data.type === 'complete') {
                setScanProgress(prev => ({ ...prev, logs: [...prev.logs, { timestamp: new Date().toLocaleTimeString(), level: 'success', message: `✅ Scan finished! Job ID: ${jobId.substring(0, 8)}...` }] }));
                eventSource.close();
                loadJobs();
            }
        };
        
        eventSource.onerror = () => {
            setScanProgress(prev => ({ ...prev, logs: [...prev.logs, { timestamp: new Date().toLocaleTimeString(), level: 'error', message: 'Connection lost. Refresh jobs list for final status.' }] }));
            eventSource.close();
        };
    };

    const startScan = async (url: string, formData: FormData, type: 'tls' | 'repo') => {
        try {
            const response = await fetch(url, { method: 'POST', body: formData });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Scan request failed');
            }
            const result = await response.json();
            setActiveJobId(result.job_id);
            setShowProgress(true);
            setScanProgress({
                percentage: 0,
                completed: 0,
                failed: 0,
                logs: [{ timestamp: new Date().toLocaleTimeString(), level: 'info', message: `Scan started with Job ID: ${result.job_id.substring(0, 8)}...` }]
            });
            connectSSE(result.job_id);
            loadJobs();
        } catch (error: any) {
            alert(`Error starting ${type} scan: ${error.message}`);
        }
    };

    const startTLSScan = () => {
        if (!tlsFile) return;
        const formData = new FormData();
        formData.append('file', tlsFile);
        startScan(`${BATCH_API_BASE}/api/tls-scan/batch`, formData, 'tls');
    };
        
    const startRepoScan = () => {
        if (!repoFile) return;
        const formData = new FormData();
        formData.append('file', repoFile);
        startScan(`${BATCH_API_BASE}/api/repo-scan/batch`, formData, 'repo');
    };
        
    const exportJob = (jobId: string) => {
        window.open(`${BATCH_API_BASE}/api/batch-jobs/${jobId}/export`, '_blank');
    };
    
    const deleteJob = async (jobId: string) => {
        if (!confirm('Are you sure you want to delete this job?')) return;
        await fetch(`${BATCH_API_BASE}/api/batch-jobs/${jobId}`, { method: 'DELETE' });
        loadJobs();
    };

    const toggleRepoSelection = (repoId: number) => {
        setSelectedRepos(prev => {
            const newSet = new Set(prev);
            if (newSet.has(repoId)) newSet.delete(repoId);
            else newSet.add(repoId);
            return newSet;
        });
    };
    
    const toggleSelectAll = () => {
      setSelectedRepos(prev => {
        if (prev.size === discoveredRepos.length) {
          return new Set(); // unselect all
        } else {
          return new Set(discoveredRepos.map(r => r.id)); // select all
        }
      });
    };
    
    const handleBranchChange = (repoId: number, branch: string) => {
        setRepoBranches(prev => ({
            ...prev,
            [repoId]: branch,
        }));
    };
    
    const startGitHubRepoScan = async () => {
        const selectedReposList = discoveredRepos.filter(repo => selectedRepos.has(repo.id));
        if (selectedReposList.length === 0) return alert('Please select at least one repository to scan.');
    
        const reposToScan = selectedReposList.map(repo => ({
            repo_url: repo.clone_url || `https://github.com/${repo.full_name}.git`,
            branch_name: repoBranches[repo.id] || repo.default_branch
        }));
    
        if (!confirm(`You are about to scan ${reposToScan.length} repositories. Proceed?`)) return;
    
        try {
            const response = await fetch(`${BATCH_API_BASE}/api/repo-scan/batch-from-github`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repos: reposToScan })
            });
    
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Scan request failed');
            }
    
            const result = await response.json();
            alert(`✅ Scan started! Job ID: ${result.job_id.substring(0, 8)}...`);
            setDiscoveredRepos([]);
            loadJobs();
        } catch (error: any) {
            alert('Error starting scan: ' + error.message);
        }
    };

    const resetScanState = () => {
        setShowProgress(false);
        setActiveJobId(null);
        setScanProgress({ percentage: 0, completed: 0, failed: 0, logs: [] });
        setTlsFile(null);
        setRepoFile(null);
    };

    const navigateBack = () => {
        setView('dashboard');
        resetScanState();
    }

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    // ============================================================================ 
    // RENDER LOGIC
    // ============================================================================ 

    return (
        <AnimatePresence mode="wait">
            {view === 'dashboard' && (
                <motion.div
                    key="dashboard"
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="p-4 md:p-8"
                >
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-primary/10 rounded-lg">
                                <UploadCloud className="h-8 w-8 text-primary" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold">Onboarding</h1>
                                <p className="text-muted-foreground">Get started by scanning your assets</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
                        {/* TLS/SSL Scanner Card */}
                        <UnifiedCard
                            variant="premium"
                            onClick={() => setView('tls')}
                            className="h-full flex flex-col justify-between cursor-pointer group"
                        >
                            <CardHeader>
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="p-3 bg-primary/10 rounded-xl">
                                        <UploadCloud className="h-8 w-8 text-primary" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-2xl">TLS/SSL Scanner</CardTitle>
                                        <CardDescription className="text-base">Scan domains from an Excel file</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground">
                                    Upload a spreadsheet with a list of domains to check their TLS/SSL certificate configurations and ensure secure connections across your infrastructure.
                                </p>
                            </CardContent>
                            <div className="p-6 pt-0">
                                <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                    Start Scan <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </div>
                        </UnifiedCard>

                        {/* Repository Scanner Card */}
                        <UnifiedCard
                            variant="premium"
                            onClick={() => setView('repo')}
                            className="h-full flex flex-col justify-between cursor-pointer group"
                        >
                            <CardHeader>
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="p-3 bg-primary/10 rounded-xl">
                                        <Github className="h-8 w-8 text-primary" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-2xl">Repository Scanner</CardTitle>
                                        <CardDescription className="text-base">Scan repos from GitHub or Excel</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground">
                                    Analyze Git repositories for cryptographic algorithm usage and security best practices. Discover vulnerabilities and ensure compliance with modern standards.
                                </p>
                            </CardContent>
                            <div className="p-6 pt-0">
                                <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                    Start Scan <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </div>
                        </UnifiedCard>

                        {/* System Scanner Card */}
                        <UnifiedCard
                            variant="premium"
                            onClick={() => setView('system')}
                            className="h-full flex flex-col justify-between cursor-pointer group"
                        >
                            <CardHeader>
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="p-3 bg-primary/10 rounded-xl">
                                        <Download className="h-8 w-8 text-primary" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-2xl">System Scanner</CardTitle>
                                        <CardDescription className="text-base">Download and setup agents</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground">
                                    Download agents for Linux and Windows to scan system cryptographic configurations. Deploy lightweight agents to monitor and audit your infrastructure in real-time.
                                </p>
                            </CardContent>
                            <div className="p-6 pt-0">
                                <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                    Download Agents <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </div>
                        </UnifiedCard>
                    </div>

                    <UnifiedCard className="mt-12 max-w-6xl mx-auto">
                        <div className="p-6">
                            <div className="flex flex-row items-center justify-between">
                                <h3 className="text-lg font-bold">Recent Batch Jobs</h3>
                                <Button variant="outline" size="sm" onClick={loadJobs}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
                            </div>
                        </div>
                        <div className="p-6">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="text-left text-muted-foreground">
                                            <th className="p-3">Job ID</th>
                                            <th className="p-3">Type</th>
                                            <th className="p-3">Status</th>
                                            <th className="p-3">Progress</th>
                                            <th className="p-3">Started</th>
                                            <th className="p-3">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {jobs.length > 0 ? jobs.map(job => (
                                            <tr key={job.job_id} className="border-t">
                                                <td className="p-3 font-mono text-sm">{job.job_id.substring(0, 8)}...</td>
                                                <td className="p-3 uppercase">{job.scan_type}</td>
                                                <td className="p-3"><span className={`px-2 py-1 text-xs font-bold rounded-full ${job.status === 'completed' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>{job.status}</span></td>
                                                <td className="p-3">{`${job.completed_items + job.failed_items} / ${job.total_items}`}</td>
                                                <td className="p-3 text-sm">{new Date(job.started_at).toLocaleString()}</td>
                                                <td className="p-3 space-x-2">
                                                    {job.status.toLowerCase() === 'completed' && <Button size="sm" variant="outline" onClick={() => exportJob(job.job_id)}><Download className="w-4 h-4" /></Button>}
                                                    <Button size="sm" variant="destructive" onClick={() => deleteJob(job.job_id)}><Trash2 className="w-4 h-4" /></Button>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan={6} className="text-center p-8 text-muted-foreground">No jobs found.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </UnifiedCard>
                </motion.div>
            )}

            {[ 'tls', 'repo', 'system' ].includes(view) && (
                 <motion.div
                    key={view}
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="p-4 md:p-8 max-w-4xl mx-auto"
                >
                    <UnifiedBackButton onClick={navigateBack} label="Back" className="mb-6" />
                    
                    {/* TLS SCANNER VIEW */}
                    {view === 'tls' && (
                        <UnifiedCard padding="none">
                            <div className="p-6">
                                <h2 className={typography.h2}>TLS/SSL Scanner</h2>
                                <p className="text-muted-foreground">Upload an Excel file with a 'domain' column.</p>
                            </div>
                            <div className="p-6">
                                {!showProgress ? (
                                    <>
                                        <UnifiedFileInput
                                          label="Upload Excel File"
                                          accept=".xlsx,.xls"
                                          helperText="Upload an Excel file with a 'domain' column."
                                          selectedFile={tlsFile}
                                          onFileSelect={setTlsFile}
                                          onFileRemove={() => setTlsFile(null)}
                                          dragAndDrop={true}
                                        />
                                        <Button className="w-full mt-6" disabled={!tlsFile} onClick={startTLSScan}>Start TLS Scan</Button>
                                    </>
                                ) : (
                                    <ScanProgress progress={scanProgress} logs={scanProgress.logs} />
                                )}
                            </div>
                        </UnifiedCard>
                    )}

                    {/* REPO SCANNER VIEW */}
                    {view === 'repo' && (
                        <Tabs defaultValue="github">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="github">From GitHub</TabsTrigger>
                                <TabsTrigger value="excel">From Excel</TabsTrigger>
                            </TabsList>
                            <TabsContent value="github">
                                <UnifiedCard padding="none">
                                    <div className="p-6">
                                        <h3 className="text-lg font-bold">Discover from GitHub</h3>
                                        <p className="text-muted-foreground text-sm">
                                            Enter a GitHub username or organization URL to find public repositories.
                                        </p>
                                    </div>

                                    <div className="p-6">
                                        {/* URL + Discover */}
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="e.g., https://github.com/torvalds"
                                                value={githubUrl}
                                                onChange={(e) => setGithubUrl(e.target.value)}
                                            />
                                            <Button onClick={discoverGitHubRepos} disabled={isDiscovering}>
                                                {isDiscovering ? <Loader2 className="w-4 h-4 animate-spin" /> : "Discover"}
                                            </Button>
                                        </div>

                                        {/* Error */}
                                        {githubError && (
                                            <p className="text-destructive text-sm mt-2 flex items-center gap-2">
                                                <XCircle className="w-4 h-4" />
                                                {githubError}
                                            </p>
                                        )}

                                        {/* Loading */}
                                        {isDiscovering && (
                                            <div className="text-center p-10">
                                                <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                                            </div>
                                        )}

                                        {/* Repos list with branch selector */}
                                        {!isDiscovering && discoveredRepos.length > 0 && (
                                            <div className="mt-6">
                                                <div className="mb-3">
                                                    <h3 className="font-bold">{discoveredRepos.length} Repos Found</h3>
                                                </div>

                                                <div className="max-h-60 overflow-y-auto border rounded-md">
                                                    <table className="w-full text-xs md:text-sm">
                                                        <thead className="bg-muted sticky top-0 z-10">
                                                            <tr className="text-left text-muted-foreground">
                                                                <th className="p-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={discoveredRepos.length > 0 && selectedRepos.size === discoveredRepos.length}
                                                                            onChange={toggleSelectAll}
                                                                            className="cursor-pointer w-4 h-4 accent-primary"
                                                                        />
                                                                        <span className="font-semibold">Select All</span>
                                                                    </div>
                                                                </th>
                                                                <th className="p-2">Repository</th>
                                                                <th className="p-2">Branch</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {discoveredRepos.map((repo) => (
                                                                <tr
                                                                    key={repo.id}
                                                                    className={`border-t last:border-b-0 transition-colors ${ 
                                                                        selectedRepos.has(repo.id) 
                                                                            ? 'bg-primary/5 dark:bg-primary/30 hover:bg-primary/10 dark:hover:bg-primary/50' 
                                                                            : 'hover:bg-accent/50'
                                                                    }`}
                                                                >
                                                                    <td className="p-2 align-middle">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={selectedRepos.has(repo.id)}
                                                                            onChange={() => toggleRepoSelection(repo.id)}
                                                                            className="cursor-pointer w-4 h-4 accent-primary"
                                                                        />
                                                                    </td>
                                                                    <td className="p-2 align-middle font-medium truncate max-w-[220px]">
                                                                        {repo.full_name.split('/')[1]}
                                                                    </td>
                                                                    <td className="p-2 align-middle">
                                                                        <select
                                                                            className="w-full min-w-[180px] max-w-full px-3 py-2 border border-border rounded-md text-sm font-medium bg-background focus:outline-none focus:ring-2 focus:ring-primary whitespace-nowrap"
                                                                            value={repoBranches[repo.id] || repo.default_branch}
                                                                            onChange={(e) => handleBranchChange(repo.id, e.target.value)}
                                                                        >
                                                                            {repo.branches && repo.branches.length > 0 ? (
                                                                                repo.branches.map((branch) => (
                                                                                    <option key={branch} value={branch}>
                                                                                        {branch}
                                                                                        {branch === repo.default_branch ? " (default)" : ""}
                                                                                    </option>
                                                                                ))
                                                                            ) : (
                                                                                <option value={repo.default_branch}>
                                                                                    {repo.default_branch} (default)
                                                                                </option>
                                                                            )}
                                                                        </select>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <p className="text-sm text-muted-foreground">Total Repositories</p>
                                                            <p className="text-2xl font-bold">{discoveredRepos.length}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-sm text-muted-foreground">Selected</p>
                                                            <p className="text-2xl font-bold text-primary">{selectedRepos.size}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-sm text-muted-foreground">Not Selected</p>
                                                            <p className="text-2xl font-bold text-muted-foreground">
                                                                {discoveredRepos.length - selectedRepos.size}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <Button
                                                    className="w-full mt-4"
                                                    onClick={startGitHubRepoScan}
                                                    disabled={selectedRepos.size === 0}
                                                >
                                                    Scan Selected ({selectedRepos.size})
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </UnifiedCard>
                            </TabsContent>
                            <TabsContent value="excel">
                                <UnifiedCard padding="none">
                                    <div className="p-6">
                                        <h3 className="text-lg font-bold">Scan from Excel</h3>
                                        <p className="text-muted-foreground text-sm">Upload an Excel file with 'repo_url' and 'branch_name' columns.</p>
                                    </div>
                                    <div className="p-6">
                                        {!showProgress ? (
                                            <>
                                                <UnifiedFileInput
                                                  label="Upload Excel File"
                                                  accept=".xlsx,.xls"
                                                  helperText="Upload an Excel file with 'repo_url' and 'branch_name' columns."
                                                  selectedFile={repoFile}
                                                  onFileSelect={setRepoFile}
                                                  onFileRemove={() => setRepoFile(null)}
                                                  dragAndDrop={true}
                                                />
                                                <Button className="w-full mt-6" disabled={!repoFile} onClick={startRepoScan}>Start Scan from Excel</Button>
                                            </>
                                        ) : (
                                            <ScanProgress progress={scanProgress} logs={scanProgress.logs} />
                                        )}
                                    </div>
                                </UnifiedCard>
                            </TabsContent>
                        </Tabs>
                    )}

                    {/* SYSTEM SCANNER VIEW */}
                    {view === 'system' && (
                        <div className="space-y-8">
                            <div className="max-w-6xl mx-auto">
                                <header className="text-center mb-8">
                                    <h1 className={typography.display}>System Agent Downloads</h1>
                                    <p className="text-lg text-muted-foreground mt-2">
                                        Download agents and follow setup instructions for your platform
                                    </p>
                                </header>

                                <div className="space-y-10">
                                    {/* Linux Section */}
                                    <section>
                                        <SystemDownloadCard
                                            title="Linux Agent"
                                            folderType="linux"
                                            icon={<Terminal size={28} />}
                                            description="For Ubuntu, Debian, RHEL, CentOS"
                                            files={linuxFiles}
                                            loading={systemLoading}
                                            formatBytes={formatBytes}
                                            apiUrl={AGENT_API_BASE}
                                        />
                                        <div className="mt-6">
                                            <LinuxInstructionsCard />
                                        </div>
                                    </section>

                                    {/* Windows Section */}
                                    <section>
                                        <SystemDownloadCard
                                            title="Windows Agent"
                                            folderType="windows"
                                            icon={<Server size={28} />}
                                            description="For Windows Server 2016+"
                                            files={windowsFiles}
                                            loading={systemLoading}
                                            formatBytes={formatBytes}
                                            apiUrl={AGENT_API_BASE}
                                        />
                                        <div className="mt-6">
                                            <WindowsInstructionsCard />
                                        </div>
                                    </section>

                                    {/* Configuration Section */}
                                    <section>
                                        <ConfigurationCard />
                                    </section>

                                    {/* Monitoring Section */}
                                    <section>
                                        <MonitoringCard />
                                    </section>
                                </div>
                            </div>
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default OnboardingPage;