import { Loader2, AlertTriangle, Database, RefreshCw } from "lucide-react";

export const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-8">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
    <span className="ml-2 text-muted-foreground text-sm sm:text-base">Fetching data from backend API...</span>
  </div>
);

interface ErrorDisplayProps {
  error: string | null;
  onRetry: () => void;
}

export const ErrorDisplay = ({ error, onRetry }: ErrorDisplayProps) => (
  <div className="flex flex-col items-center justify-center py-8 space-y-4">
    <AlertTriangle className="h-12 w-12 text-destructive" />
    <div className="text-center max-w-full px-4">
      <h3 className="text-lg font-semibold text-destructive">Backend Connection Error</h3>
      <p className="text-muted-foreground max-w-md break-words">{error}</p>
      <p className="text-sm text-muted-foreground mt-2 break-all">
        Make sure your backend API is running at https://backend-ed29.onrender.com/api/apps2
      </p>
      <button
        onClick={onRetry}
        className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors mx-auto"
      >
        <RefreshCw className="h-4 w-4" />
        Retry Connection
      </button>
    </div>
  </div>
);

interface EmptyStateProps {
  onRefresh: () => void;
}

export const EmptyState = ({ onRefresh }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-8 space-y-4">
    <Database className="h-12 w-12 text-muted-foreground" />
    <div className="text-center">
      <h3 className="text-lg font-semibold">No Data Available</h3>
      <p className="text-muted-foreground">No algorithms found in the backend database</p>
      <button
        onClick={onRefresh}
        className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors mx-auto"
      >
        <RefreshCw className="h-4 w-4" />
        Refresh Data
      </button>
    </div>
  </div>
);