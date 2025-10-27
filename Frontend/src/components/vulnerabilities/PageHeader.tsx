import { RefreshCw } from "lucide-react";

interface PageHeaderProps {
  onRefresh: () => void;
  loading: boolean;
}

export function PageHeader({ onRefresh, loading }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Vulnerabilities</h2>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors disabled:opacity-50 shrink-0 text-sm sm:text-base"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        <span className="hidden sm:inline">Refresh</span>
        <span className="sm:hidden">Refresh</span>
      </button>
    </div>
  );
}