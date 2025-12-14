import React, { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Upload, X, File } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UnifiedFileInputProps {
  label: string;
  accept?: string;
  helperText?: string;
  errorText?: string;
  onFileSelect: (file: File) => void;
  onFileRemove?: () => void;
  selectedFile?: File | null;
  maxSize?: number; // in MB
  dragAndDrop?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Standardized file input with drag & drop support
 * Handles validation and error states consistently
 */
export const UnifiedFileInput: React.FC<UnifiedFileInputProps> = ({
  label,
  accept = '*',
  helperText,
  errorText,
  onFileSelect,
  onFileRemove,
  selectedFile,
  maxSize = 10,
  dragAndDrop = true,
  disabled = false,
  className,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const validateFile = (file: File): boolean => {
    setLocalError(null);

    // Size validation
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSize) {
      setLocalError(`File size must be less than ${maxSize}MB`);
      return false;
    }

    // Type validation
    if (accept !== '*') {
      const acceptedTypes = accept.split(',').map(t => t.trim());
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!acceptedTypes.some(type => file.name.toLowerCase().endsWith(type) || fileExtension === type)) {
        setLocalError(`Please upload ${accept} files only`);
        return false;
      }
    }

    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      onFileSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && validateFile(file)) {
      onFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const displayError = errorText || localError;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Label */}
      <label className="block text-sm font-semibold text-foreground">
        {label}
      </label>

      {/* File Input Area */}
      {!selectedFile ? (
        <div
          onDrop={dragAndDrop ? handleDrop : undefined}
          onDragOver={dragAndDrop ? handleDragOver : undefined}
          onDragLeave={dragAndDrop ? handleDragLeave : undefined}
          className={cn(
            "relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200",
            isDragging && "border-primary bg-primary/5",
            !isDragging && "border-border hover:border-primary/50",
            disabled && "opacity-50 cursor-not-allowed",
            displayError && "border-destructive bg-destructive/5"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            disabled={disabled}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
          
          <div className="flex flex-col items-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">
                {dragAndDrop ? 'Drag & drop a file or click to select' : 'Click to select a file'}
              </p>
              {helperText && (
                <p className="text-xs text-muted-foreground mt-1">{helperText}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        // Selected File Display
        <div className="flex items-center justify-between p-4 border-2 rounded-xl bg-muted/50">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <File className="h-5 w-5 text-primary flex-shrink-0" />
            <span className="font-medium truncate" title={selectedFile.name}>
              {selectedFile.name}
            </span>
          </div>
          {onFileRemove && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onFileRemove}
              className="flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {/* Error Message */}
      {displayError && (
        <p className="text-sm text-destructive font-medium">{displayError}</p>
      )}
    </div>
  );
};
