import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface Column<T> {
  key: keyof T | string;
  header: React.ReactNode;
  width?: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface UnifiedTableProps<T> {
  data: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  className?: string;
  striped?: boolean;
  hoverable?: boolean;
}

/**
 * Standardized table component with loading, empty states
 * Responsive behavior: scrollable on small screens
 */
export function UnifiedTable<T>({
  data,
  columns,
  isLoading = false,
  emptyMessage = 'No data available',
  onRowClick,
  className,
  striped = true,
  hoverable = true,
}: UnifiedTableProps<T>) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <span className="text-2xl">📋</span>
        </div>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("overflow-x-auto rounded-xl border", className)}>
      <table className="w-full text-sm">
        <thead className="bg-muted/80 backdrop-blur-sm sticky top-0 z-10">
          <tr className="border-b-2">
            {columns.map((col, idx) => (
              <th
                key={idx}
                className={cn(
                  "px-6 py-4 text-left text-xs font-bold uppercase tracking-widest",
                  "text-muted-foreground",
                  col.className
                )}
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "transition-colors duration-150",
                striped && rowIdx % 2 === 0 && "bg-muted/30",
                hoverable && "hover:bg-muted/50",
                onRowClick && "cursor-pointer"
              )}
            >
              {columns.map((col, colIdx) => (
                <td
                  key={colIdx}
                  className={cn(
                    "px-6 py-4 text-foreground",
                    col.className
                  )}
                >
                  {col.render
                    ? col.render(row)
                    : String((row as any)[col.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
