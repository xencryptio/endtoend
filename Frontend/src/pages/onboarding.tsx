import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { UnifiedCard, UnifiedEntryCard, UnifiedBackButton, UnifiedFileInput } from "@/components/ui/unified";
import { typography } from "@/lib/design-tokens";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, UploadCloud, FileText, Github, Loader2, Download, Trash2, RefreshCw, XCircle, Server, Terminal, BookOpen, CheckCircle, Activity, AlertCircle, ArrowRight, Globe, X, AlertTriangle } from "lucide-react";

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

interface Toast {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    duration?: number;
}

interface ConfirmModal {
    show: boolean;
    title: string;
    message: string;
    type: 'danger' | 'warning' | 'info';
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
}

// ============================================================================ 
// CONSTANTS
// ============================================================================ 

const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
};

const toastVariants = {
    hidden: { opacity: 0, x: 100, scale: 0.8 },
    visible: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, x: 100, scale: 0.8 },
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

// Toast Notification Component
const ToastNotification: React.FC<Toast & { onDismiss: () => void }> = ({ 
    type, 
    message, 
    onDismiss 
}) => {
    const icons = {
        success: <CheckCircle className="w-5 h-5" />,
        error: <XCircle className="w-5 h-5" />,
        warning: <AlertTriangle className="w-5 h-5" />,
        info: <AlertCircle className="w-5 h-5" />
    };

    const colors = {
        success: 'bg-success/10 dark:bg-success/20 text-success border-success/20',
        error: 'bg-destructive/10 dark:bg-destructive/20 text-destructive border-destructive/20',
        warning: 'bg-warning/10 dark:bg-warning/20 text-warning border-warning/20',
        info: 'bg-primary/10 dark:bg-primary/20 text-primary border-primary/20'
    };

    return (
        <motion.div
            variants={toastVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={`flex items-start gap-3 min-w-[320px] max-w-md p-4 rounded-lg border shadow-lg backdrop-blur-sm ${colors[type]}`}
        >
            <div className="flex-shrink-0 mt-0.5">{icons[type]}</div>
            <p className="flex-1 text-sm font-medium text-foreground">{message}</p>
            <button
                onClick={onDismiss}
                className="flex-shrink-0 hover:opacity-70 transition-opacity"
            >
                <X className="w-4 h-4" />
            </button>
        </motion.div>
    );
};

// Confirmation Modal Component
const ConfirmationModal: React.FC<ConfirmModal> = ({
    show,
    title,
    message,
    type,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel
}) => {
    if (!show) return null;

    const typeColors = {
        danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        warning: 'bg-warning text-warning-foreground hover:bg-warning/90',
        info: 'bg-primary text-primary-foreground hover:bg-primary/90'
    };

    const typeIcons = {
        danger: <AlertTriangle className="w-6 h-6 text-destructive" />,
        warning: <AlertCircle className="w-6 h-6 text-warning" />,
        info: <AlertCircle className="w-6 h-6 text-primary" />
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onCancel}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-background border rounded-lg shadow-2xl max-w-md w-full p-6"
                >
                    <div className="flex items-start gap-4 mb-4">
                        <div className="flex-shrink-0">{typeIcons[type]}</div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
                            <p className="text-sm text-muted-foreground">{message}</p>
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end">
                        <Button
                            variant="outline"
                            onClick={onCancel}
                        >
                            {cancelLabel}
                        </Button>
                        <Button
                            className={typeColors[type]}
                            onClick={() => {
                                onConfirm();
                                onCancel();
                            }}
                        >
                            {confirmLabel}
                        </Button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
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
    showToast: (type: string, message: string, duration?: number) => void;
}> = ({ title, folderType, icon, description, files, loading, formatBytes, apiUrl, showToast }) => {
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
            showToast('success', `${title} downloaded successfully!`, 3000);
        } catch (error: any) {
            console.error('Download error:', error);
            showToast('error', `Failed to download: ${error.message}`, 5000);
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

    // Toast and Modal States
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null);

    // Toast Management
    const showToast = (type: 'success' | 'error' | 'warning' | 'info', message: string, duration: number = 5000) => {
        const id = Date.now().toString() + Math.random();
        const newToast: Toast = { id, type, message, duration };
        setToasts(prev => [...prev, newToast]);
        
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, duration);
    };

    const dismissToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    // Confirmation Modal Management
    const showConfirmModal = (
        title: string,
        message: string,
        onConfirm: () => void,
        type: 'danger' | 'warning' | 'info' = 'info',
        confirmLabel: string = 'Confirm',
        cancelLabel: string = 'Cancel'
    ) => {
        setConfirmModal({
            show: true,
            title,
            message,
            type,
            confirmLabel,
            cancelLabel,
            onConfirm,
            onCancel: () => setConfirmModal(null)
        });
    };

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
            showToast('error', 'Failed to load agent files', 5000);
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
                id: repo.id ?? index
            }));
            
            console.log('📦 Discovered repos with IDs:', reposWithIds.map(r => ({ name: r.full_name, id: r.id })));
            
            setDiscoveredRepos(reposWithIds);
            setSelectedRepos(new Set(reposWithIds.map(r => r.id)));
            showToast('success', `Successfully discovered ${reposWithIds.length} repositories`, 4000);
        } catch (error: any) {
            setGithubError(error.message || 'An unknown error occurred.');
            showToast('error', error.message || 'Failed to discover repositories', 5000);
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
                showToast('success', `Scan completed! Job ID: ${jobId.substring(0, 8)}...`, 5000);
                eventSource.close();
                loadJobs();
            }
        };
        
        eventSource.onerror = () => {
            setScanProgress(prev => ({ ...prev, logs: [...prev.logs, { timestamp: new Date().toLocaleTimeString(), level: 'error', message: 'Connection lost. Refresh jobs list for final status.' }] }));
            showToast('warning', 'Connection lost. Refresh the jobs list to see final status.', 7000);
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
            showToast('success', `${type.toUpperCase()} scan started successfully! Job ID: ${result.job_id.substring(0, 8)}...`, 4000);
            connectSSE(result.job_id);
            loadJobs();
        } catch (error: any) {
            showToast('error', `Failed to start ${type} scan: ${error.message}`, 5000);
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
        showToast('info', 'Opening export in new tab...', 3000);
    };
    
    const deleteJob = async (jobId: string) => {
        showConfirmModal(
            'Delete Job',
            'Are you sure you want to delete this job? This action cannot be undone.',
            async () => {
                try {
                    await fetch(`${BATCH_API_BASE}/api/batch-jobs/${jobId}`, { method: 'DELETE' });
                    showToast('success', 'Job deleted successfully', 3000);
                    loadJobs();
                } catch (error) {
                    showToast('error', 'Failed to delete job', 5000);
                }
            },
            'danger',
            'Delete',
            'Cancel'
        );
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
          return new Set();
        } else {
          return new Set(discoveredRepos.map(r => r.id));
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
        
        if (selectedReposList.length === 0) {
            showToast('warning', 'Please select at least one repository to scan', 4000);
            return;
        }
    
        const reposToScan = selectedReposList.map(repo => ({
            repo_url: repo.clone_url || `https://github.com/${repo.full_name}.git`,
            branch_name: repoBranches[repo.id] || repo.default_branch
        }));
    
        showConfirmModal(
            'Start Repository Scan',
            `You are about to scan ${reposToScan.length} ${reposToScan.length === 1 ? 'repository' : 'repositories'}. This may take some time depending on the size of the repositories. Do you want to proceed?`,
            async () => {
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
                    showToast('success', `Scan started successfully! Job ID: ${result.job_id.substring(0, 8)}...`, 5000);
                    setDiscoveredRepos([]);
                    setSelectedRepos(new Set());
                    loadJobs();
                } catch (error: any) {
                    showToast('error', `Failed to start scan: ${error.message}`, 5000);
                }
            },
            'warning',
            'Start Scan',
            'Cancel'
        );
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
        <>
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
                            <UnifiedEntryCard
                                icon={UploadCloud}
                                title="TLS/SSL Scanner"
                                subtitle="Scan domains from an Excel file"
                                description="Upload a spreadsheet with a list of domains to check their TLS/SSL certificate configurations and ensure secure connections across your infrastructure."
                                actionLabel="Start Scan"
                                onClick={() => setView('tls')}
                                variant="premium"
                            />

                            <UnifiedEntryCard
                                icon={Github}
                                title="Repository Scanner"
                                subtitle="Scan repos from GitHub or Excel"
                                description="Analyze Git repositories for cryptographic algorithm usage and security best practices. Discover vulnerabilities and ensure compliance with modern standards."
                                actionLabel="Start Scan"
                                onClick={() => setView('repo')}
                                variant="premium"
                            />

                            <UnifiedEntryCard
                                icon={Download}
                                title="System Scanner"
                                subtitle="Download and setup agents"
                                description="Download agents for Linux and Windows to scan system cryptographic configurations. Deploy lightweight agents to monitor and audit your infrastructure in real-time."
                                actionLabel="Download Agents"
                                onClick={() => setView('system')}
                                variant="premium"
                            />
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
                                                <div className="mt-3 p-3 rounded-lg bg-destructive/10 dark:bg-destructive/20 border border-destructive/20">
                                                    <p className="text-destructive text-sm flex items-center gap-2">
                                                        <XCircle className="w-4 h-4" />
                                                        {githubError}
                                                    </p>
                                                </div>
                                            )}

                                            {/* Loading */}
                                            {isDiscovering && (
                                                <div className="text-center p-10">
                                                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                                                    <p className="text-sm text-muted-foreground mt-3">Discovering repositories...</p>
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
                                                showToast={showToast}
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
                                                showToast={showToast}
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

            {/* Toast Container - Fixed position at bottom-right */}
            <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
                <AnimatePresence>
                    {toasts.map(toast => (
                        <div key={toast.id} className="pointer-events-auto">
                            <ToastNotification
                                {...toast}
                                onDismiss={() => dismissToast(toast.id)}
                            />
                        </div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Confirmation Modal */}
            {confirmModal && <ConfirmationModal {...confirmModal} />}
        </>
    );
};

export default OnboardingPage;