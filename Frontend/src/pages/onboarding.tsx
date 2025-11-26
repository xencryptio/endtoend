
import React, { useState, useEffect, useRef } from 'react';

// Reusable Icon Components (extracted from original SVG strings)
const LockClosedIcon = (props) => (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
);

const CodeBracketIcon = (props) => (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
);

const CloudArrowUpIcon = (props) => (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
);

const GitHubIcon = (props) => (
    <svg {...props} fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
);

const ClipboardDocumentListIcon = (props) => (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
);

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
    clone_url?: string; // ADD THIS
    branches?: string[]; // ADD THIS
    description?: string;
}


const OnboardingPage = () => {
    // Component State
    const [activeRepoTab, setActiveRepoTab] = useState('github');
    const [tlsFile, setTlsFile] = useState(null);
    const [repoFile, setRepoFile] = useState(null);
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
        logs: [] as Array<{timestamp: string, level: string, message: string}>
    });
    const [showProgress, setShowProgress] = useState(false);

    // Loading and Error States
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [githubError, setGithubError] = useState('');

    const API_BASE = 'http://localhost:8008';

    // File Upload Refs
    const tlsFileInputRef = useRef(null);
    const repoFileInputRef = useRef(null);

    // Fetch jobs on mount and periodically
    useEffect(() => {
        loadJobs();
        const interval = setInterval(loadJobs, 30000);
        return () => clearInterval(interval);
    }, []);

    const loadJobs = async () => {
        // if (MOCK_MODE) { setJobs([]); return; } // Uncomment for mock mode
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
    const handleFileSelect = (file, fileSetter, expectedType) => {
        if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
            fileSetter(file);
        } else {
            alert(`Please select an Excel file (.xlsx or .xls) for ${expectedType} scans.`);
            fileSetter(null);
        }
    };
    
    const handleDrop = (e, fileSetter, type) => {
        e.preventDefault();
        e.stopPropagation();
        handleFileSelect(e.dataTransfer.files[0], fileSetter, type);
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
            setDiscoveredRepos(data.repositories); // Auto-select all repos and initialize branches
            setSelectedRepos(new Set(data.repositories.map(r => r.id)));
            const branches: Record<number, string> = {};
            data.repositories.forEach(r => {
                branches[r.id] = r.default_branch;
            });
            setRepoBranches(branches);
        } catch (error) {
            let errorMessage = error.message;
            let errorIcon = '❌';

            if (error.message.includes('404') || error.message.includes('not found')) {
                errorIcon = '🔍';
                errorMessage = 'GitHub user not found. Please check the username and try again.';
            } else if (error.message.includes('rate limit')) {
                errorIcon = '⏰';
                errorMessage = 'GitHub API rate limit exceeded. Please wait a moment and try again.';
            } else if (error.message.includes('Invalid')) {
                errorIcon = '⚠️';
                errorMessage = 'Invalid GitHub URL format. Expected: https://github.com/username';
            }

            setGithubError(`${errorIcon} ${errorMessage}`);
        } finally {
            setIsDiscovering(false);
        }
    };

    const connectSSE = (jobId: string, scanType: 'tls' | 'repo') => {
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
                        message: data.data.error 
                            ? `${data.data.domain || data.data.repo_url} - Failed: ${data.data.error}`
                            : `${data.data.domain || data.data.repo_url} - Completed`
                    }]
                }));
            } else if (data.type === 'complete') {
                setScanProgress(prev => ({
                    ...prev,
                    logs: [...prev.logs, {
                        timestamp: new Date().toLocaleTimeString(),
                        level: 'success',
                        message: `✅ Scan finished! Job ID: ${jobId.substring(0, 8)}...`
                    }]
                }));
                eventSource.close();
                loadJobs();
            }
        };
        
        eventSource.onerror = () => {
            setScanProgress(prev => ({
                ...prev,
                logs: [...prev.logs, {
                    timestamp: new Date().toLocaleTimeString(),
                    level: 'error',
                    message: 'Connection lost. Refresh jobs list for final status.'
                }]
            }));
            eventSource.close();
        };
    };

    const startTLSScan = async () => {
        if (!tlsFile) return;
        
        const formData = new FormData();
        formData.append('file', tlsFile);
        
        try {
            const response = await fetch(`${API_BASE}/api/tls-scan/batch`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Scan request failed');
            }
            
            const result = await response.json();
            
            // Initialize progress display
            setActiveJobId(result.job_id);
            setShowProgress(true);
            setScanProgress({
                percentage: 0,
                completed: 0,
                failed: 0,
                logs: [{
                    timestamp: new Date().toLocaleTimeString(),
                    level: 'info',
                    message: `Scan started with Job ID: ${result.job_id.substring(0, 8)}...`
                }]
            });
            
            // Connect to SSE stream
            connectSSE(result.job_id, 'tls');
            
            // Refresh jobs list
            loadJobs();
            
        } catch (error: any) {
            alert('Error starting TLS scan: ' + error.message);
        }
    };
        
    const startRepoScan = async () => {
        if (!repoFile) return;
        
        const formData = new FormData();
        formData.append('file', repoFile);
        
        try {
            const response = await fetch(`${API_BASE}/api/repo-scan/batch`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Scan request failed');
            }
            
            const result = await response.json();
            
            // Initialize progress display
            setActiveJobId(result.job_id);
            setShowProgress(true);
            setScanProgress({
                percentage: 0,
                completed: 0,
                failed: 0,
                logs: [{
                    timestamp: new Date().toLocaleTimeString(),
                    level: 'info',
                    message: `Scan started with Job ID: ${result.job_id.substring(0, 8)}...`
                }]
            });
            
            // Connect to SSE stream
            connectSSE(result.job_id, 'repo');
            
            // Refresh jobs list
            loadJobs();
            
        } catch (error: any) {
            alert('Error starting repo scan: ' + error.message);
        }
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
            if (newSet.has(repoId)) {
                newSet.delete(repoId);
            } else {
                newSet.add(repoId);
            }
            return newSet;
        });
    };
    
    const toggleSelectAll = () => {
        if (selectedRepos.size === discoveredRepos.length) {
            setSelectedRepos(new Set());
        } else {
            setSelectedRepos(new Set(discoveredRepos.map(r => r.id)));
            // Initialize branches for all repos
            const branches: Record<number, string> = {};
            discoveredRepos.forEach(r => {
                branches[r.id] = r.default_branch;
            });
            setRepoBranches(branches);
        }
    };
    
    const handleBranchChange = (repoId: number, branch: string) => {
        setRepoBranches(prev => ({ ...prev, [repoId]: branch }));
    };

    const startGitHubRepoScan = async () => {
        const selectedReposList = discoveredRepos.filter(repo => selectedRepos.has(repo.id));
        
        if (selectedReposList.length === 0) {
            alert('Please select at least one repository to scan.');
            return;
        }
    
        const reposToScan = selectedReposList.map(repo => ({
            repo_url: repo.clone_url || `https://github.com/${repo.full_name}.git`,
            branch_name: repoBranches[repo.id] || repo.default_branch
        }));
    
        const confirmMsg = `You are about to scan ${reposToScan.length} repositories:\n\n${
            reposToScan.slice(0, 5).map(r => `• ${r.repo_url.split('/').slice(-2).join('/')} (${r.branch_name})`).join('\n')
        }${reposToScan.length > 5 ? `\n... and ${reposToScan.length - 5} more` : ''}\n\nProceed?`;
    
        if (!confirm(confirmMsg)) return;
    
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
            setDiscoveredRepos([]); // Clear the list
            loadJobs();
        } catch (error: any) {
            alert('Error starting scan: ' + error.message);
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-8 bg-background text-foreground">
            {/* Header */}
            <header className="bg-card text-card-foreground p-8 rounded-lg shadow-lg mb-8 text-center">
                <h1 className="text-4xl font-bold mb-2">📊 Batch Scanner Dashboard</h1>
                <p className="text-muted-foreground">Scan TLS/SSL domains or Git repositories from Excel or directly from GitHub</p>
            </header>

            {/* Main Content */}
            <main className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* TLS Scanner Card */}
                <div className="bg-card text-card-foreground p-8 rounded-lg shadow-lg">
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
                        <LockClosedIcon className="w-8 h-8 text-primary" /> TLS/SSL Scanner
                    </h2>
                    <div className="bg-muted text-muted-foreground p-3 rounded-md mb-4 text-sm">
                        <h3 className="font-semibold text-primary mb-2">Excel Format:</h3>
                        <code className="bg-card/50 p-2 block rounded text-xs">| domain |<br />| example.com |</code>
                    </div>

                    <div 
                        className="border-2 border-dashed border-primary rounded-lg p-8 text-center cursor-pointer hover:bg-accent hover:border-primary-glow transition-colors"
                        onClick={() => tlsFileInputRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, setTlsFile, 'TLS')}
                    >
                        <CloudArrowUpIcon className="w-12 h-12 mx-auto text-primary mb-2" />
                        <p>Drop Excel file here or click to browse</p>
                        <input type="file" ref={tlsFileInputRef} className="hidden" accept=".xlsx,.xls" onChange={(e) => handleFileSelect(e.target.files?.[0], setTlsFile, 'TLS')} />
                        {tlsFile && <div className="mt-2 text-primary font-semibold">📄 {tlsFile.name}</div>}
                    </div>

                    <button className="btn w-full mt-4" disabled={!tlsFile} onClick={startTLSScan}>Start TLS Scan</button>
                    {showProgress && (
                        <div className="mt-6 p-4 bg-muted rounded-md">
                            <div className="mb-4">
                                <div className="h-8 bg-background rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-primary to-purple-600 flex items-center justify-center text-white font-semibold transition-all duration-300"
                                        style={{ width: `${scanProgress.percentage}%` }}
                                    >
                                        {scanProgress.percentage}%
                                    </div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-2 mb-4">
                                <div className="bg-background p-3 rounded text-center">
                                    <div className="text-xs text-muted-foreground">Completed</div>
                                    <div className="text-2xl font-bold text-primary">{scanProgress.completed}</div>
                                </div>
                                <div className="bg-background p-3 rounded text-center">
                                    <div className="text-xs text-muted-foreground">Failed</div>
                                    <div className="text-2xl font-bold text-red-500">{scanProgress.failed}</div>
                                </div>
                                <div className="bg-background p-3 rounded text-center">
                                    <div className="text-xs text-muted-foreground">Total</div>
                                    <div className="text-2xl font-bold">{scanProgress.completed + scanProgress.failed}</div>
                                </div>
                            </div>
                            
                            <div className="max-h-48 overflow-y-auto bg-background rounded p-3 font-mono text-xs">
                                {scanProgress.logs.map((log, idx) => (
                                    <div 
                                        key={idx} 
                                        className={`mb-2 p-2 rounded ${
                                            log.level === 'success' ? 'bg-green-500/10 text-green-600' :
                                            log.level === 'error' ? 'bg-red-500/10 text-red-600' :
                                            'bg-blue-500/10 text-blue-600'
                                        }`}
                                    >
                                        [{log.timestamp}] {log.message}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Repository Scanner Card */}
                <div className="bg-card text-card-foreground p-8 rounded-lg shadow-lg">
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
                        <CodeBracketIcon className="w-8 h-8 text-primary" /> Repository Scanner
                    </h2>
                    
                    {/* Tabs */}
                    <div className="flex border-b border-border mb-4">
                        <button className={`tab-btn ${activeRepoTab === 'github' ? 'active' : ''}`} onClick={() => setActiveRepoTab('github')}>From GitHub</button>
                        <button className={`tab-btn ${activeRepoTab === 'excel' ? 'active' : ''}`} onClick={() => setActiveRepoTab('excel')}>From Excel</button>
                    </div>

                    {/* GitHub Tab Content */}
                    <div className={activeRepoTab === 'github' ? 'block' : 'hidden'}>
                         <div className="mb-4">
                            <label htmlFor="github-url" className="flex items-center gap-2 font-semibold mb-2">
                                <GitHubIcon className="w-5 h-5" /> GitHub Account URL
                            </label>
                            <input 
                                type="text" 
                                id="github-url"
                                placeholder="e.g., https://github.com/torvalds"
                                className="input w-full font-mono"
                                value={githubUrl}
                                onChange={(e) => setGithubUrl(e.target.value)}
                            />
                        </div>
                        <div className="bg-blue-100/20 border-l-4 border-blue-500 text-blue-700 dark:text-blue-300 p-3 rounded-md mb-4 text-sm">
                            <strong>💡 Tip:</strong> Enter a GitHub username or URL to discover public repos.
                        </div>
                        <button className="btn w-full" onClick={discoverGitHubRepos} disabled={isDiscovering}>
                            {isDiscovering ? <div className="spinner" /> : '🔍 Discover Repositories'}
                        </button>
                        {githubError && (
                            <div className="error-message mt-4 flex items-start gap-3">
                                <span className="text-2xl">{githubError.split(' ')[0]}</span>
                                <div>{githubError.substring(githubError.indexOf(' ') + 1)}</div>
                            </div>
                        )}
                        {isDiscovering && (
                            <div className="text-center p-10 bg-muted/50 rounded-md mt-4">
                                <div className="spinner mx-auto mb-4" style={{
                                    width: '40px', 
                                    height: '40px', 
                                    borderWidth: '4px',
                                    borderColor: 'hsl(var(--primary))',
                                    borderTopColor: 'transparent'
                                }} />
                                <p className="font-semibold">Discovering repositories...</p>
                                <p className="text-sm text-muted-foreground mt-2">Fetching user data from GitHub</p>
                            </div>
                        )}
                        
                        {/* Discovered Repos List */}
                        {!isDiscovering && discoveredRepos.length > 0 && (
                            <div className="mt-6">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="font-bold text-lg">
                                        {discoveredRepos.length} Repositories Found
                                    </h3>
                                    <div className="flex gap-2">
                                        <button 
                                            className="btn-secondary px-3 py-1 text-sm"
                                            onClick={() => toggleSelectAll()}
                                        >
                                            {selectedRepos.size === discoveredRepos.length ? '❌ Deselect All' : '✅ Select All'}
                                        </button>
                                    </div>
                                </div>
                                <div className="max-h-60 overflow-y-auto border border-border rounded-md">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted sticky top-0">
                                            <tr>
                                                <th className="p-2 text-left">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedRepos.size === discoveredRepos.length && discoveredRepos.length > 0}
                                                        onChange={toggleSelectAll}
                                                    />
                                                </th>
                                                <th className="p-2 text-left">Repository</th>
                                                <th className="p-2 text-left">Description</th>
                                                <th className="p-2 text-left">Branch</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {discoveredRepos.map((repo) => (
                                                <tr key={repo.id} className="border-b border-border last:border-0 hover:bg-accent">
                                                    <td className="p-2">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedRepos.has(repo.id)}
                                                            onChange={() => toggleRepoSelection(repo.id)}
                                                        />
                                                    </td>
                                                    <td className="p-2 font-medium">{repo.full_name}</td>
                                                    <td className="p-2 text-muted-foreground text-sm">
                                                        {repo.description || <i>No description</i>}
                                                    </td>
                                                    <td className="p-2">
                                                        <select 
                                                            className="w-full p-1 border border-border rounded text-sm"
                                                            value={repoBranches[repo.id] || repo.default_branch}
                                                            onChange={(e) => handleBranchChange(repo.id, e.target.value)}
                                                        >
                                                            {repo.branches && repo.branches.length > 0 ? (
                                                                repo.branches.map(branch => (
                                                                    <option key={branch} value={branch}>
                                                                        {branch}{branch === repo.default_branch ? ' ⭐' : ''}
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
                                <button 
                                    className="btn w-full mt-4" 
                                    onClick={startGitHubRepoScan}
                                    disabled={selectedRepos.size === 0}
                                >
                                    Scan Selected Repositories ({selectedRepos.size})
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Excel Tab Content */}
                    <div className={activeRepoTab === 'excel' ? 'block' : 'hidden'}>
                        <div className="bg-muted text-muted-foreground p-3 rounded-md mb-4 text-sm">
                            <h3 className="font-semibold text-primary mb-2">Excel Format:</h3>
                            <code className="bg-card/50 p-2 block rounded text-xs">| repo_url | branch_name |<br />| https://... | main |</code>
                        </div>

                         <div 
                            className="border-2 border-dashed border-primary rounded-lg p-8 text-center cursor-pointer hover:bg-accent hover:border-primary-glow transition-colors"
                            onClick={() => repoFileInputRef.current?.click()}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDrop(e, setRepoFile, 'Repo')}
                        >
                            <CloudArrowUpIcon className="w-12 h-12 mx-auto text-primary mb-2" />
                            <p>Drop Excel file here or click to browse</p>
                            <input type="file" ref={repoFileInputRef} className="hidden" accept=".xlsx,.xls" onChange={(e) => handleFileSelect(e.target.files?.[0], setRepoFile, 'Repo')} />
                            {repoFile && <div className="mt-2 text-primary font-semibold">📄 {repoFile.name}</div>}
                        </div>

                        <button className="btn w-full mt-4" disabled={!repoFile} onClick={startRepoScan}>Start Scan from Excel</button>
                        {showProgress && (
                            <div className="mt-6 p-4 bg-muted rounded-md">
                                <div className="mb-4">
                                    <div className="h-8 bg-background rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-gradient-to-r from-primary to-purple-600 flex items-center justify-center text-white font-semibold transition-all duration-300"
                                            style={{ width: `${scanProgress.percentage}%` }}
                                        >
                                            {scanProgress.percentage}%
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-3 gap-2 mb-4">
                                    <div className="bg-background p-3 rounded text-center">
                                        <div className="text-xs text-muted-foreground">Completed</div>
                                        <div className="text-2xl font-bold text-primary">{scanProgress.completed}</div>
                                    </div>
                                    <div className="bg-background p-3 rounded text-center">
                                        <div className="text-xs text-muted-foreground">Failed</div>
                                        <div className="text-2xl font-bold text-red-500">{scanProgress.failed}</div>
                                    </div>
                                    <div className="bg-background p-3 rounded text-center">
                                        <div className="text-xs text-muted-foreground">Total</div>
                                        <div className="text-2xl font-bold">{scanProgress.completed + scanProgress.failed}</div>
                                    </div>
                                </div>
                                
                                <div className="max-h-48 overflow-y-auto bg-background rounded p-3 font-mono text-xs">
                                    {scanProgress.logs.map((log, idx) => (
                                        <div 
                                            key={idx} 
                                            className={`mb-2 p-2 rounded ${
                                                log.level === 'success' ? 'bg-green-500/10 text-green-600' :
                                                log.level === 'error' ? 'bg-red-500/10 text-red-600' :
                                                'bg-blue-500/10 text-blue-600'
                                            }`}
                                        >
                                            [{log.timestamp}] {log.message}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Jobs List */}
            <div className="bg-card text-card-foreground p-8 rounded-lg shadow-lg">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
                    <ClipboardDocumentListIcon className="w-8 h-8 text-primary" /> Batch Jobs
                </h2>
                <button className="btn-secondary mb-4" onClick={loadJobs}>🔄 Refresh Jobs</button>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                        <thead className="border-b border-border">
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
                                <tr key={job.job_id} className="border-b border-border last:border-0 hover:bg-accent">
                                    <td className="p-3 font-mono text-sm">{job.job_id.substring(0, 8)}...</td>
                                    <td className="p-3">{job.scan_type.toUpperCase()}</td>
                                    <td className="p-3">
                                        <span className={`status-badge status-${job.status.toLowerCase()}`}>{job.status}</span>
                                    </td>
                                    <td className="p-3">{`${job.completed_items + job.failed_items} / ${job.total_items}`}</td>
                                    <td className="p-3 text-sm">{new Date(job.started_at).toLocaleString()}</td>
                                    <td className="p-3 space-x-2">
                                        {job.status.toLowerCase() === 'completed' && <button className="btn-action export" onClick={() => exportJob(job.job_id)}>Export</button>}
                                        <button className="btn-action delete" onClick={() => deleteJob(job.job_id)}>Delete</button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="text-center p-8 text-muted-foreground">No jobs found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
// Add some base styling to complement index.css, mimicking the original page's custom styles but using theme variables.
// In a real app, this would be in a separate CSS file or handled by a CSS-in-JS solution.
const GlobalStyles = () => (
    <style>{`
        .btn {
            @apply inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md font-semibold text-white transition-all;
            background-image: var(--gradient-primary);
            box-shadow: var(--shadow-primary);
        }
        .btn:hover {
            transform: translateY(-2px);
            filter: brightness(1.1);
        }
        .btn:disabled {
            @apply opacity-50 cursor-not-allowed;
            transform: none;
            box-shadow: none;
            filter: none;
        }
        .btn-secondary {
            @apply bg-secondary text-secondary-foreground px-4 py-2 rounded-md font-semibold hover:bg-muted;
        }
        .input {
            @apply w-full p-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-ring focus:border-ring;
        }
        .tab-btn {
            @apply px-4 py-2 font-semibold text-muted-foreground border-b-2 border-transparent hover:text-foreground;
        }
        .tab-btn.active {
            @apply text-primary border-primary;
        }
        .spinner {
            width: 1.25rem;
            height: 1.25rem;
            border: 2px solid rgba(255,255,255,0.5);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .status-badge { @apply px-3 py-1 text-xs font-bold rounded-full; }
        .status-pending { @apply bg-yellow-400/20 text-yellow-500; }
        .status-in_progress { @apply bg-blue-400/20 text-blue-500; }
        .status-completed { @apply bg-green-400/20 text-green-500; }
        .status-failed { @apply bg-red-400/20 text-red-500; }

        .btn-action { @apply text-xs font-semibold px-2 py-1 rounded-md text-white; }
        .btn-action.export { background-color: hsl(var(--success)); }
        .btn-action.delete { background-color: hsl(var(--destructive)); }
        .error-message { @apply p-4 rounded-md bg-destructive/10 text-destructive border border-destructive/20; }
    `}</style>
);

const OnboardingPageContainer = () => (
    <>
        <GlobalStyles />
        <OnboardingPage />
    </>
)

export default OnboardingPageContainer;
