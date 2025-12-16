import React from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ============================================================================
 * Unified Back Button
 * ========================================================================== */

interface UnifiedBackButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Standardized back button for all pages
 * Icon + label with consistent spacing and outline style
 */
export const UnifiedBackButton: React.FC<UnifiedBackButtonProps> = ({
  onClick,
  label = "Back",
  className,
  disabled = false,
}) => {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className={cn("gap-2 font-medium", className)}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
};

/* ============================================================================
 * Unified Refresh Button
 * ========================================================================== */

interface UnifiedRefreshButtonProps {
  onClick: () => void;
  isRefreshing?: boolean;
  autoRefresh?: boolean;
  className?: string;
  disabled?: boolean;
  label?: string;
  autoLabel?: string;
}

/**
 * Standardized refresh button
 * Supports manual refresh + auto-refresh state with spinner
 */
export const UnifiedRefreshButton: React.FC<UnifiedRefreshButtonProps> = ({
  onClick,
  isRefreshing = false,
  autoRefresh = false,
  className,
  disabled = false,
  label = "Refresh",
  autoLabel = "Auto-refreshing...",
}) => {
  const isActive = isRefreshing || autoRefresh;

  return (
    <Button
      onClick={onClick}
      disabled={disabled || isRefreshing}
      variant={autoRefresh ? "default" : "outline"}
      className={cn(
        "gap-2 font-medium",
        autoRefresh && "bg-success hover:bg-success/90",
        className
      )}
    >
      <RefreshCw
        className={cn(
          "h-4 w-4",
          isActive && "animate-spin"
        )}
      />
      {autoRefresh ? autoLabel : label}
    </Button>
  );
};
