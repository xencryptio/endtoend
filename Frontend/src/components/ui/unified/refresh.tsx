import React from "react";
import { motion } from "framer-motion";
import { RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================================
 * Unified Inline Refresh Indicator
 * ========================================================================== */

interface UnifiedInlineRefreshProps {
  isRefreshing: boolean;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Small inline spinner for data refresh scenarios
 * Shows next to headers/titles while keeping content visible
 */
export const UnifiedInlineRefresh: React.FC<UnifiedInlineRefreshProps> = ({
  isRefreshing,
  label = "Updating...",
  size = 'sm',
  className
}) => {
  if (!isRefreshing) return null;

  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  return (
    <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
      <RefreshCw className={cn("animate-spin", sizeClasses[size])} />
      {label && <span className="text-xs font-medium">{label}</span>}
    </div>
  );
};

/* ============================================================================
 * Unified Table Refresh Overlay
 * ========================================================================== */

interface UnifiedTableRefreshProps {
  isRefreshing: boolean;
  message?: string;
}

/**
 * Subtle overlay for table refreshes
 * Keeps content visible with semi-transparent backdrop
 */
export const UnifiedTableRefresh: React.FC<UnifiedTableRefreshProps> = ({
  isRefreshing,
  message = "Updating data..."
}) => {
  if (!isRefreshing) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-20 flex items-center justify-center"
    >
      <div className="bg-white dark:bg-slate-900 px-6 py-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 flex items-center gap-3">
        <Loader2 className="animate-spin text-primary" size={20} />
        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {message}
        </span>
      </div>
    </motion.div>
  );
};

/* ============================================================================
 * Unified Action Loading (for buttons)
 * ========================================================================== */

interface UnifiedActionLoadingProps {
  isLoading: boolean;
  loadingText?: string;
  defaultText: string;
  icon?: React.ReactNode;
}

/**
 * Button loading state handler
 * Shows spinner inside button during actions
 */
export const UnifiedActionLoading: React.FC<UnifiedActionLoadingProps> = ({
  isLoading,
  loadingText = "Processing...",
  defaultText,
  icon
}) => {
  return (
    <>
      {isLoading ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          {loadingText}
        </>
      ) : (
        <>
          {icon}
          {defaultText}
        </>
      )}
    </>
  );
};