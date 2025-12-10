import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Box, Typography, IconButton, CircularProgress, Alert, Tooltip, TextField } from '@mui/material';
import { X as XIcon, FileText, ChevronDown, ChevronRight, Folder, Copy, Search } from 'lucide-react';
import { AlgorithmFindingsResponse, FileFinding, FindingDetail } from './types';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';

const API_URL = import.meta.env.VITE_REPO_SCAN_API_URL;

// Helper to detect language from file extension
const detectLanguage = (filePath: string): string => {
  const extension = filePath.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'py': return 'python';
    case 'js': return 'javascript';
    case 'ts': return 'typescript';
    case 'jsx': return 'javascript';
    case 'tsx': return 'typescript';
    case 'java': return 'java';
    case 'c': return 'c';
    case 'cpp': return 'cpp';
    case 'cs': return 'csharp';
    case 'go': return 'go';
    case 'rs': return 'rust';
    case 'rb': return 'ruby';
    case 'php': return 'php';
    case 'swift': return 'swift';
    case 'kt': return 'kotlin';
    case 'sh': return 'bash';
    case 'html': return 'html';
    case 'css': return 'css';
    case 'scss': return 'scss';
    case 'yaml': return 'yaml';
    case 'yml': return 'yaml';
    case 'json': return 'json';
    case 'xml': return 'xml';
    case 'sql': return 'sql';
    case 'md': return 'markdown';
    // Add more languages as needed
    default: return 'plaintext';
  }
};

interface AlgorithmFindingsModalProps {
  open: boolean;
  onClose: () => void;
  scanId: number | null;
  algorithmName: string | null;
  repoUrl: string;
  branch: string;
}

const style = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '80%',
  maxWidth: '1200px',
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  p: 4,
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
};

const CodeSnippet: React.FC<{ finding: FindingDetail, repoUrl: string, branch: string, filePath: string }> = ({ finding, repoUrl, branch, filePath }) => {
  const githubUrl = `${repoUrl}/blob/${branch}/${filePath}#L${finding.line_number}`;
  const language = detectLanguage(filePath);

  const handleCopy = () => {
    navigator.clipboard.writeText(finding.code_snippet)
      .then(() => alert('Code snippet copied to clipboard!'))
      .catch(err => console.error('Failed to copy text: ', err));
  };

  return (
    <Box sx={{ 
      p: 1.5, 
      my: 1, 
      backgroundColor: 'grey.100',
      borderRadius: '4px', 
      fontFamily: 'monospace', 
      fontSize: '0.8rem',
      border: '1px solid',
      borderColor: 'grey.300'
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Line {finding.line_number}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Copy code snippet">
            <IconButton size="small" onClick={handleCopy}>
              <Copy style={{ fontSize: '0.9rem' }} />
            </IconButton>
          </Tooltip>
          <a href={githubUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', fontSize: '0.75rem' }}>
            View on GitHub
          </a>
        </Box>
      </Box>
      <SyntaxHighlighter
        language={language}
        style={atomOneDark}
        showLineNumbers={true}
        startingLineNumber={finding.line_number}
        wrapLines={true}
        lineProps={(lineNumber: number) => {
          return {
            style: {
              backgroundColor: lineNumber === finding.line_number 
                ? 'rgba(255, 255, 0, 0.2)' // Highlight matched line
                : 'transparent'
            }
          };
        }}
        customStyle={{ padding: '0', margin: '0', background: 'none' }}
      >
        {finding.code_snippet}
      </SyntaxHighlighter>
    </Box>
  );
};


const FileItem: React.FC<{ file: FileFinding, repoUrl: string, branch: string }> = ({ file, repoUrl, branch }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Box sx={{ my: 1 }}>
      <Box 
        onClick={() => setIsExpanded(!isExpanded)}
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          cursor: 'pointer', 
          p: 1,
          borderRadius: '4px',
          '&:hover': { backgroundColor: 'action.hover' }
        }}
      >
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <FileText size={16} style={{ marginLeft: '8px', marginRight: '8px' }} />
        <Typography variant="body2" sx={{ flexGrow: 1 }}>
          {file.file_path} ({file.occurrence_count})
        </Typography>
      </Box>
      {isExpanded && (
        <Box sx={{ pl: 4, borderLeft: '1px solid', borderColor: 'grey.400', ml: 2 }}>
          {file.findings.map((finding, index) => (
            <CodeSnippet key={index} finding={finding} repoUrl={repoUrl} branch={branch} filePath={file.file_path} />
          ))}
          {file.has_more && (
            <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
              ... and {file.occurrence_count - file.showing} more occurrences.
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};

const DirectoryGroup: React.FC<{ directory: string, files: FileFinding[], repoUrl: string, branch: string }> = ({ directory, files, repoUrl, branch }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    const totalOccurrences = useMemo(() => {
        return files.reduce((acc, file) => acc + file.occurrence_count, 0);
    }, [files]);

    return (
        <Box sx={{ my: 1.5 }}>
            <Box 
                onClick={() => setIsExpanded(!isExpanded)}
                sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    cursor: 'pointer', 
                    p: 1, 
                    borderRadius: '4px',
                    backgroundColor: 'grey.200',
                    '&:hover': { backgroundColor: 'grey.300' }
                }}
            >
                {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                <Folder size={20} style={{ marginLeft: '8px', marginRight: '8px' }} />
                <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
                    {directory} ({totalOccurrences} occurrences)
                </Typography>
            </Box>
            {isExpanded && (
                <Box sx={{ pl: 2, ml: 2 }}>
                    {files.map((file) => (
                        <FileItem key={file.file_path} file={file} repoUrl={repoUrl} branch={branch} />
                    ))}
                </Box>
            )}
        </Box>
    );
};

const AlgorithmFindingsModal: React.FC<AlgorithmFindingsModalProps> = ({ open, onClose, scanId, algorithmName, repoUrl, branch }) => {
  const [data, setData] = useState<AlgorithmFindingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredFiles, setFilteredFiles] = useState<FileFinding[]>([]);

  useEffect(() => {
    if (open && scanId && algorithmName) {
      const fetchFindings = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const response = await fetch(`${API_URL}/api/scans/${scanId}/algorithm/${algorithmName}/findings`);
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Error: ${response.status}`);
          }
          const result: AlgorithmFindingsResponse = await response.json();
          setData(result);
          setFilteredFiles(result.files); // Initialize filtered files with all files
        } catch (err: any) {
          setError(err.message);
        } finally {
          setIsLoading(false);
        }
      };
      fetchFindings();
    }
  }, [open, scanId, algorithmName]);

  useEffect(() => {
    if (data) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      const newFilteredFiles = data.files.filter(file => 
        file.file_path.toLowerCase().includes(lowerCaseSearchTerm) ||
        file.findings.some(finding => finding.code_snippet.toLowerCase().includes(lowerCaseSearchTerm))
      );
      setFilteredFiles(newFilteredFiles);
    }
  }, [searchTerm, data]);

  const groupedByDirectory = useMemo(() => {
    if (!filteredFiles.length) return {};
    const grouped = new Map<string, FileFinding[]>();
    filteredFiles.forEach(file => {
        const dir = file.directory || 'root';
        if (!grouped.has(dir)) {
            grouped.set(dir, []);
        }
        grouped.get(dir)!.push(file);
    });
    return Object.fromEntries(grouped.entries());
  }, [filteredFiles]);

  return (
    <Modal open={open} onClose={onClose}>
      <Box sx={style}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: 1, borderColor: 'divider', pb: 2, mb: 2 }}>
          <Typography variant="h6" component="h2">
            Code Findings for "{algorithmName}"
          </Typography>
          <IconButton onClick={onClose}>
            <XIcon />
          </IconButton>
        </Box>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search files and snippets..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <Search style={{ marginRight: '8px', color: 'grey.500' }} />
            ),
          }}
          sx={{ mb: 2 }}
        />
        <Box sx={{ overflowY: 'auto', flexGrow: 1 }}>
          {isLoading && <CircularProgress />}
          {error && <Alert severity="error">{error}</Alert>}
          {data && (
            <>
              <Typography variant="subtitle1" gutterBottom>
                Found {filteredFiles.length} matching files out of {data.total_files} total.
              </Typography>
              {Object.entries(groupedByDirectory).map(([dir, files]) => (
                <DirectoryGroup key={dir} directory={dir} files={files} repoUrl={repoUrl} branch={branch} />
              ))}
              {filteredFiles.length === 0 && (
                <Typography variant="body1" sx={{ mt: 2, textAlign: 'center', color: 'text.secondary' }}>
                  No files found matching your search term.
                </Typography>
              )}
            </>
          )}
        </Box>
      </Box>
    </Modal>
  );
};

export default AlgorithmFindingsModal;
