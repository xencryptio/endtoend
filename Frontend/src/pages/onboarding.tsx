import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, UploadCloud, FileText, Github, Loader2, Download, Trash2, RefreshCw, XCircle, Server, Terminal, BookOpen, CheckCircle, Activity, AlertCircle } from "lucide-react";

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
// HELPER COMPONENTS
// ============================================================================

const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
};

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
                <p className="text-xl font-bold text-green-500">{progress.completed}</p>
            </div>
            <div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-xl font-bold text-red-500">{progress.failed}</p>
            </div>
            <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold">{progress.completed + progress.failed}</p>
            </div>
        </div>

        <div className="max-h-48 overflow-y-auto bg-background rounded p-3 font-mono text-xs border">
            {logs.map((log, idx) => (
                <div key={idx} className={`mb-1 p-1 rounded text-xs ${log.level === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}>
                    <span className="font-semibold">[{log.timestamp}]</span> {log.message}
                </div>
            ))}
        </div>
    </div>
);

const FileDropzone = ({ onFileSelect, selectedFile, fileType }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (files: FileList | null) => {
        if (files && files[0]) {
            if (files[0].name.endsWith('.xlsx') || files[0].name.endsWith('.xls')) {
                onFileSelect(files[0]);
            } else {
                alert(`Please select an Excel file (.xlsx or .xls) for ${fileType} scans.`);
                onFileSelect(null);
            }
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        handleFileChange(e.dataTransfer.files);
    };

    return (
        <div
            className="border-2 border-dashed border-muted-foreground/50 rounded-lg p-8 text-center cursor-pointer hover:bg-accent hover:border-primary/50 transition-all duration-300"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
        >
            <UploadCloud className="w-12 h-12 mx-auto text-primary mb-4" />
            <p className="text-muted-foreground">Drop Excel file here or click to browse</p>
            <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls" onChange={(e) => handleFileChange(e.target.files)} />
            {selectedFile && (
                <div className="mt-4 text-primary font-semibold flex items-center justify-center gap-2">
                    <FileText className="w-5 h-5" />
                    <span>{selectedFile.name}</span>
                </div>
            )}
        </div>
    );
};

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
            const response = await fetch(`${apiUrl}/api/v1/files/download-zip/${folderType}`);
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


    const colorClass = folderType === 'linux'
        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
        : 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400';

    return (
        <Card className="shadow-lg">
            <CardContent className="p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className={`p-4 rounded-xl ${colorClass}`}>
                            {icon}
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
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
                    <button
                        onClick={handleDownload}
                        className="w-full sm:w-auto px-6 py-3 rounded-lg font-semibold text-base bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                    >
                        <Download size={20} />
                        Download {title}
                    </button>
                </div>
            </CardContent>
        </Card>
    );
};

const LinuxInstructionsCard: React.FC = () => (
    <Card className="mt-6 border-l-4 border-l-blue-500">
        <CardHeader>
            <div className="flex items-center gap-3">
                <BookOpen className="text-blue-600 dark:text-blue-400" size={24} />
                <CardTitle className="text-xl">Linux Setup Instructions</CardTitle>
            </div>
        </CardHeader>
        <CardContent>
            <ol className="space-y-5">
                {[
                    { num: 1, text: 'Download the Linux Agent ZIP file', note: 'Click the download button above' },
                    { num: 2, text: 'Extract the ZIP file', code: 'unzip Linux_Agent.zip' },
                    { num: 3, text: 'Navigate to the extracted folder', code: 'cd "Linux Agent"' },
                    { num: 4, text: 'Make the installer executable', code: 'chmod +x install_crypto_agent.sh' },
                    { num: 5, text: 'Run the installer with sudo', code: 'sudo ./install_crypto_agent.sh' },
                    { num: 6, text: 'Verify installation', note: 'The agent will automatically start and register with the server' },
                ].map(step => (
                    <li key={step.num} className="flex gap-4">
                        <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-600 dark:bg-blue-500 text-white flex items-center justify-center text-base font-bold shadow-md">{step.num}</span>
                        <div className="flex-1">
                            <p className="text-slate-900 dark:text-slate-100 font-medium">{step.text}</p>
                            {step.note && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{step.note}</p>}
                            {step.code && <code className="block mt-3 px-4 py-3 rounded-lg text-sm bg-slate-900 dark:bg-slate-950 text-emerald-400 font-mono shadow-inner">{step.code}</code>}
                        </div>
                    </li>
                ))}
            </ol>
        </CardContent>
    </Card>
);

const WindowsInstructionsCard: React.FC = () => (
    <Card className="mt-6 border-l-4 border-l-purple-500">
        <CardHeader>
            <div className="flex items-center gap-3">
                <BookOpen className="text-purple-600 dark:text-purple-400" size={24} />
                <CardTitle className="text-xl">Windows Setup Instructions</CardTitle>
            </div>
        </CardHeader>
        <CardContent>
            <ol className="space-y-5">
                {[
                    { num: 1, text: 'Download the Windows Agent ZIP file', note: 'Click the download button above' },
                    { num: 2, text: 'Extract the ZIP file to a directory', note: 'Example: C:\\CryptoAgent' },
                    { num: 3, text: 'Open Command Prompt or PowerShell as Administrator', note: 'Right-click and select "Run as Administrator"' },
                    { num: 4, text: 'Navigate to the extracted folder', code: 'cd C:\\CryptoAgent' },
                    { num: 5, text: 'Run the installer script', code: 'python install.py' },
                    { num: 6, text: 'Verify installation', note: 'The agent will be installed as a Windows service and start automatically' },
                ].map(step => (
                    <li key={step.num} className="flex gap-4">
                        <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-purple-600 dark:bg-purple-500 text-white flex items-center justify-center text-base font-bold shadow-md">{step.num}</span>
                        <div className="flex-1">
                            <p className="text-slate-900 dark:text-slate-100 font-medium">{step.text}</p>
                            {step.note && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{step.note}</p>}
                            {step.code && <code className="block mt-3 px-4 py-3 rounded-lg text-sm bg-slate-900 dark:bg-slate-950 text-emerald-400 font-mono shadow-inner">{step.code}</code>}
                        </div>
                    </li>
                ))}
            </ol>
        </CardContent>
    </Card>
);

const ConfigurationCard: React.FC<{ apiUrl: string }> = ({ apiUrl }) => (
    <Card className="border-l-4 border-l-green-500">
        <CardHeader>
            <div className="flex items-center gap-3">
                <BookOpen className="text-green-600 dark:text-green-400" size={24} />
                <CardTitle className="text-xl">Configuration</CardTitle>
            </div>
            <CardDescription>Both agents use the same configuration file format</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="mb-6">
                <p className="text-slate-900 dark:text-slate-100 mb-4">Edit the <code className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-sm font-mono">config.json</code> file to configure:</p>
                <div className="space-y-4">
                    {[
                        { label: 'server_url', desc: 'API server address', value: apiUrl, required: true },
                        { label: 'poll_interval', desc: 'How often the agent checks for tasks', value: '30 seconds (default)', required: false },
                        { label: 'agent_id', desc: 'Unique identifier for the agent', value: 'Auto-generated on first run', required: false },
                    ].map((item, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-4 bg-white dark:bg-slate-800 rounded-lg border border-green-200 dark:border-green-800">
                            <CheckCircle size={20} className="flex-shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <code className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100">{item.label}</code>
                                    {item.required && <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded font-semibold">Required</span>}
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{item.desc}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1 font-mono">{item.value}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="p-5 rounded-lg bg-white dark:bg-slate-800 border border-green-200 dark:border-green-800">
                <p className="text-sm font-semibold mb-3 text-green-900 dark:text-green-300">Example config.json:</p>
                <pre className="text-sm bg-slate-900 dark:bg-slate-950 text-emerald-400 font-mono p-4 rounded-lg overflow-x-auto">{`{
  "server_url": "${apiUrl}",
  "poll_interval": 30,
  "agent_id": "auto-generated-uuid"
}`}</pre>
            </div>
        </CardContent>
    </Card>
);

const MonitoringCard: React.FC = () => (
    <Card className="border-l-4 border-l-amber-500">
        <CardHeader>
            <div className="flex items-center gap-3">
                <Activity className="text-amber-600 dark:text-amber-400" size={24} />
                <CardTitle className="text-xl">Monitoring & Management</CardTitle>
            </div>
            <CardDescription>Understanding agent behavior and dashboard features</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="space-y-4">
                {[
                    { icon: <Activity size={20} />, text: 'Agents automatically send heartbeats every poll interval', color: 'text-blue-600 dark:text-blue-400' },
                    { icon: <Download size={20} />, text: 'Use the "Scan" button in the dashboard to manually initiate a crypto audit', color: 'text-green-600 dark:text-green-400' },
                    { icon: <ArrowLeft size={20} />, text: 'View audit results by clicking the arrow next to each agent', color: 'text-purple-600 dark:text-purple-400' },
                    { icon: <AlertCircle size={20} />, text: 'Agents are marked inactive if no heartbeat is received for 1 minute', color: 'text-red-600 dark:text-red-400' },
                    { icon: <RefreshCw size={20} />, text: 'Enable auto-refresh to automatically update the dashboard every 10 seconds', color: 'text-indigo-600 dark:text-indigo-400' },
                ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-4 p-4 bg-white dark:bg-slate-800 rounded-lg border border-amber-200 dark:border-amber-800">
                        <div className={`flex-shrink-0 mt-0.5 ${item.color}`}>{item.icon}</div>
                        <p className="text-slate-900 dark:text-slate-100">{item.text}</p>
                    </div>
                ))}
            </div>
        </CardContent>
    </Card>
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


    const API_BASE = 'http://localhost:9000';

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
                fetch(`${API_BASE}/api/v1/files/list/linux`),
                fetch(`${API_BASE}/api/v1/files/list/windows`)
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
            const response = await fetch(`${API_BASE}/api/batch-jobs`);
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
            const response = await fetch(`${API_BASE}/api/github/discover`, {
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
        const eventSource = new EventSource(`${API_BASE}/api/batch-jobs/${jobId}/stream`);
        
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
        startScan(`${API_BASE}/api/tls-scan/batch`, formData, 'tls');
    };
        
    const startRepoScan = () => {
        if (!repoFile) return;
        const formData = new FormData();
        formData.append('file', repoFile);
        startScan(`${API_BASE}/api/repo-scan/batch`, formData, 'repo');
    };
        
    const exportJob = (jobId: string) => {
        window.open(`${API_BASE}/api/batch-jobs/${jobId}/export`, '_blank');
    };
    
    const deleteJob = async (jobId: string) => {
        if (!confirm('Are you sure you want to delete this job?')) return;
        await fetch(`${API_BASE}/api/batch-jobs/${jobId}`, { method: 'DELETE' });
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
            const response = await fetch(`${API_BASE}/api/repo-scan/batch-from-github`, {
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
                    <header className="text-center mb-12">
                        <h1 className="text-4xl font-bold tracking-tight">Batch Scanner</h1>
                        <p className="text-lg text-muted-foreground mt-2">Scan multiple domains or repositories at once.</p>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
                        <motion.div whileHover={{ y: -5, scale: 1.02 }}>
                            <Card onClick={() => setView('tls')} className="h-full flex flex-col justify-between cursor-pointer group hover:border-primary transition-all">
                                <CardHeader>
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg"><UploadCloud className="h-8 w-8 text-blue-500" /></div>
                                        <div>
                                            <CardTitle className="text-2xl">TLS/SSL Scanner</CardTitle>
                                            <CardDescription>Scan domains from an Excel file.</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-muted-foreground">Upload a spreadsheet with a list of domains to check their TLS/SSL certificate configurations.</p>
                                </CardContent>
                            </Card>
                        </motion.div>
                        <motion.div whileHover={{ y: -5, scale: 1.02 }}>
                            <Card onClick={() => setView('repo')} className="h-full flex flex-col justify-between cursor-pointer group hover:border-primary transition-all">
                                <CardHeader>
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg"><Github className="h-8 w-8 text-purple-500" /></div>
                                        <div>
                                            <CardTitle className="text-2xl">Repository Scanner</CardTitle>
                                            <CardDescription>Scan repos from GitHub or Excel.</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-muted-foreground">Analyze Git repositories for cryptographic algorithm usage and security best practices.</p>
                                </CardContent>
                            </Card>
                        </motion.div>
                        <motion.div whileHover={{ y: -5, scale: 1.02 }}>
                            <Card 
                                onClick={() => setView('system')} 
                                className="h-full flex flex-col justify-between cursor-pointer group hover:border-primary transition-all"
                            >
                                <CardHeader>
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                            <Download className="h-8 w-8 text-green-500" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-2xl">System Scanner</CardTitle>
                                            <CardDescription>Download and setup agents.</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-muted-foreground">Download agents for Linux and Windows to scan system cryptographic configurations.</p>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>

                    <Card className="mt-12 max-w-6xl mx-auto">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Recent Batch Jobs</CardTitle>
                            <Button variant="outline" size="sm" onClick={loadJobs}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
                        </CardHeader>
                        <CardContent>
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
                                                <td className="p-3"><span className={`px-2 py-1 text-xs font-bold rounded-full bg-${job.status === 'completed' ? 'green' : 'yellow'}-500/20 text-${job.status === 'completed' ? 'green' : 'yellow'}-600`}>{job.status}</span></td>
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
                        </CardContent>
                    </Card>
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
                    <Button variant="ghost" onClick={navigateBack} className="mb-6"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard</Button>
                    
                    {/* TLS SCANNER VIEW */}
                    {view === 'tls' && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-2xl">TLS/SSL Scanner</CardTitle>
                                <CardDescription>Upload an Excel file with a 'domain' column.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {!showProgress ? (
                                    <>
                                        <FileDropzone onFileSelect={setTlsFile} selectedFile={tlsFile} fileType="TLS" />
                                        <Button className="w-full mt-6" disabled={!tlsFile} onClick={startTLSScan}>Start TLS Scan</Button>
                                    </>
                                ) : (
                                    <ScanProgress progress={scanProgress} logs={scanProgress.logs} />
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* REPO SCANNER VIEW */}
                    {view === 'repo' && (
                        <Tabs defaultValue="github">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="github">From GitHub</TabsTrigger>
                                <TabsTrigger value="excel">From Excel</TabsTrigger>
                            </TabsList>
                            <TabsContent value="github">
  <Card>
    <CardHeader>
      <CardTitle>Discover from GitHub</CardTitle>
      <CardDescription>
        Enter a GitHub username or organization URL to find public repositories.
      </CardDescription>
    </CardHeader>

    <CardContent>
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
        <p className="text-red-500 text-sm mt-2 flex items-center gap-2">
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
                        ? 'bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50' 
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
    </CardContent>
  </Card>
</TabsContent>
                            <TabsContent value="excel">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Scan from Excel</CardTitle>
                                        <CardDescription>Upload an Excel file with 'repo_url' and 'branch_name' columns.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        {!showProgress ? (
                                            <>
                                                <FileDropzone onFileSelect={setRepoFile} selectedFile={repoFile} fileType="Repo" />
                                                <Button className="w-full mt-6" disabled={!repoFile} onClick={startRepoScan}>Start Scan from Excel</Button>
                                            </>
                                        ) : (
                                            <ScanProgress progress={scanProgress} logs={scanProgress.logs} />
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    )}
                    {view === 'system' && (
                        <motion.div key="system" variants={cardVariants} initial="hidden" animate="visible" exit="exit" className="p-4 md:p-8">
                            
                            
                            <div className="max-w-6xl mx-auto">
                                <header className="text-center mb-8">
                                    <h1 className="text-4xl font-bold tracking-tight">System Agent Downloads</h1>
                                    <p className="text-lg text-muted-foreground mt-2">
                                        Download agents and follow setup instructions for your platform
                                    </p>
                                </header>

                                <div className="space-y-12">
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
                                            apiUrl={API_BASE}
                                        />
                                        <LinuxInstructionsCard />
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
                                            apiUrl={API_BASE}
                                        />
                                        <WindowsInstructionsCard />
                                    </section>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default OnboardingPage;