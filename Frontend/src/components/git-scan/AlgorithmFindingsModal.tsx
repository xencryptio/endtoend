import React, { useState, useEffect } from 'react';
import { UnifiedModal, UnifiedExpandable } from '@/components/ui/unified';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from "@/components/ui/button";
import { AlgorithmFindingsResponse, FileFinding, ScanDetail } from './types';
import { Loader2, File, Folder, Code, XCircle, Search, ExternalLink } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';

// Load languages for prismjs
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-ruby';


const API_URL = import.meta.env.VITE_REPO_SCAN_API_URL;

interface AlgorithmFindingsModalProps {
  scanId: number;
  algorithmName: string;
  isOpen: boolean;
  onClose: () => void;
  scanDetail: ScanDetail | null;
}

const AlgorithmFindingsModal: React.FC<AlgorithmFindingsModalProps> = ({ scanId, algorithmName, isOpen, onClose, scanDetail }) => {
  const [findings, setFindings] = useState<AlgorithmFindingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredFiles, setFilteredFiles] = useState<FileFinding[]>([]);

  useEffect(() => {
    if (isOpen) {
      const fetchFindings = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const response = await fetch(`${API_URL}/api/scans/${scanId}/algorithm/${encodeURIComponent(algorithmName)}/findings`);
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Failed to fetch findings. Status: ${response.status}` }));
            throw new Error(errorData.detail);
          }
          const data: AlgorithmFindingsResponse = await response.json();
          setFindings(data);
        } catch (err: any) {
          setError(err.message || 'Failed to load findings.');
        } finally {
          setIsLoading(false);
        }
      };
      fetchFindings();
    }
  }, [isOpen, scanId, algorithmName]);

  useEffect(() => {
    if (findings) {
      const filtered = findings.files.filter(file =>
        file.file_path.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredFiles(filtered);
    }
  }, [findings, searchTerm]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col justify-center items-center h-64 space-y-4">
          <Loader2 className="animate-spin h-12 w-12 text-primary" />
          <p className="text-sm text-muted-foreground">Loading occurrences...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-8 space-y-4">
          <div className="w-16 h-16 mx-auto bg-destructive/10 dark:bg-destructive/30 rounded-full flex items-center justify-center">
            <XCircle className="w-8 h-8 text-destructive" />
          </div>
          <p className="text-destructive font-medium">{error}</p>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      );
    }

    if (!findings || findings.files.length === 0) {
      return (
        <div className="text-center py-12 space-y-3">
          <div className="w-16 h-16 mx-auto bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
            <File className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-slate-600 dark:text-slate-400">No occurrences found for this algorithm.</p>
        </div>
      );
    }

    const filesByDirectory = filteredFiles.reduce((acc, file) => {
      const dir = file.directory || 'root';
      if (!acc[dir]) {
        acc[dir] = [];
      }
      acc[dir].push(file);
      return acc;
    }, {} as Record<string, FileFinding[]>);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 p-2 border rounded-lg">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={`Search in ${filteredFiles.length} files...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')}>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{findings.total_occurrences} occurrences</span>
          <span>•</span>
          <span>{filteredFiles.length} of {findings.total_files} files shown</span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto space-y-2 p-1">
          {Object.keys(filesByDirectory).length > 0 ? (
            Object.entries(filesByDirectory)
              .sort(([dirA], [dirB]) => dirA.localeCompare(dirB))
              .map(([dir, files]) => (
              <DirectoryView key={dir} directory={dir} files={files} scanDetail={scanDetail} />
            ))
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-slate-600 dark:text-slate-400">No files match your search.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <UnifiedModal 
      isOpen={isOpen} 
      onOpenChange={onClose} 
      size="xl"
    >
      <DialogHeader>
        <DialogTitle>Code Occurrences: {algorithmName}</DialogTitle>
        <DialogDescription>
          Detailed findings for the {algorithmName} algorithm.
        </DialogDescription>
      </DialogHeader>
      {renderContent()}
    </UnifiedModal>
  );
};

const DirectoryView: React.FC<{ directory: string; files: FileFinding[], scanDetail: ScanDetail | null }> = ({ directory, files, scanDetail }) => {
  return (
    <UnifiedExpandable
      defaultOpen
      trigger={
        <div className="flex items-center w-full text-left text-sm font-medium">
          <Folder className="h-4 w-4 mr-2 text-warning" />
          <span className="font-bold">{directory}</span>
          <span className="ml-2 text-xs text-muted-foreground">({files.length} {files.length === 1 ? 'file' : 'files'})</span>
        </div>
      }
    >
        <div className="pl-6 border-l-2 border-muted ml-2">
          {files
            .sort((a,b) => a.file_path.localeCompare(b.file_path))
            .map(file => (
              <FileView key={file.file_path} file={file} scanDetail={scanDetail} />
          ))}
        </div>
    </UnifiedExpandable>
  );
};


const FileView: React.FC<{ file: FileFinding, scanDetail: ScanDetail | null }> = ({ file, scanDetail }) => {
    const getLanguage = (filepath: string) => {
        const ext = filepath.split('.').pop()?.toLowerCase();
        const langMap: Record<string, string> = {
            'py': 'python', 'js': 'javascript', 'ts': 'typescript',
            'jsx': 'jsx', 'tsx': 'tsx', 'java': 'java', 'cpp': 'cpp',
            'c': 'c', 'go': 'go', 'rs': 'rust', 'rb': 'ruby'
        };
        return langMap[ext || ''] || 'clike';
    };

    return (
        <UnifiedExpandable
            trigger={
                <div className="flex items-center w-full text-left text-sm">
                    <File className="h-4 w-4 mr-2 text-primary" />
                    <span className="font-medium">{file.file_path}</span>
                    <span className="ml-auto text-xs text-muted-foreground pr-2">
                        {file.occurrence_count} {file.occurrence_count === 1 ? 'occurrence' : 'occurrences'}
                    </span>
                </div>
            }
        >
            <div className="pl-6 border-l-2 border-primary/20 ml-2 mt-1 space-y-2 py-2">
                {file.findings.map((finding, index) => (
                <div key={index} className="my-2">
                  <div className="p-3 bg-muted/50 rounded-lg border">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                                <Code className="h-3 w-3" />
                                <span className="font-mono">Line {finding.line_number}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={() => {
                                        if (scanDetail) {
                                            const githubUrl = `${scanDetail.repo_url.replace('.git', '')}/blob/${scanDetail.branch_name}/${file.file_path}#L${finding.line_number}`;
                                            window.open(githubUrl, '_blank');
                                        }
                                    }}
                                >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    View on GitHub
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={() => navigator.clipboard.writeText(finding.code_snippet || '')}
                                >
                                    Copy
                                </Button>
                            </div>
                        </div>
                        {/* FIXED: Added proper overflow containment and word breaking */}
                        <div className="overflow-x-auto w-full">
                          <pre className="text-xs !bg-background p-3 rounded !m-0 max-w-full overflow-x-auto">
                              <code
                                  className={`language-${getLanguage(file.file_path)} !whitespace-pre-wrap break-words`}
                                  style={{ 
                                    wordBreak: 'break-word',
                                    overflowWrap: 'anywhere',
                                    display: 'block',
                                    maxWidth: '100%'
                                  }}
                                  dangerouslySetInnerHTML={{
                                      __html: Prism.highlight(
                                          finding.code_snippet || '',
                                          Prism.languages[getLanguage(file.file_path)] || Prism.languages.clike,
                                          getLanguage(file.file_path)
                                      )
                                  }} 
                               />
                          </pre>
                        </div>
                    </div>
                </div>
                ))}
                {file.has_more && (
                    <Button variant="link" size="sm" className="mt-2 text-primary">
                        Show all {file.occurrence_count} occurrences →
                    </Button>
                )} 
            </div>
        </UnifiedExpandable>
    );
};

export default AlgorithmFindingsModal;