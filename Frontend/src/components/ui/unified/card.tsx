// components/ui/unified/card.tsx
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UnifiedBadge } from "./badge";

/* ============================================================================
 * BASE CARD
 * ========================================================================== */

export interface UnifiedCardProps
  extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "premium" | "bordered" | "metric";
  padding?: "compact" | "default" | "spacious" | "none";
  hoverable?: boolean;
  clickable?: boolean;
  borderAccent?:
    | "primary"
    | "success"
    | "warning"
    | "destructive"
    | "emerald"
    | null;
}

export const UnifiedCard = ({
  variant = "default",
  padding = "default",
  hoverable = false,
  clickable = false,
  borderAccent = null,
  className,
  children,
  ...props
}: UnifiedCardProps) => {
  const baseStyles =
    "rounded-xl border bg-card text-card-foreground shadow-sm transition-all duration-300";

  const variantStyles = {
    default: "",
    premium: "backdrop-blur-xl bg-card/80 border-2 shadow-lg",
    bordered: "border-2 border-primary/20",
    metric: "shadow-md hover:shadow-lg hover:scale-[1.01]",
  };

  const paddingStyles = {
    compact: "p-4",
    default: "p-6",
    spacious: "p-8",
    none: "p-0",
  };

  const borderAccentStyles = {
    primary: "border-l-4 border-primary",
    success: "border-l-4 border-success",
    warning: "border-l-4 border-warning",
    destructive: "border-l-4 border-destructive",
    emerald: "border-l-4 border-emerald-500",
  };

  return (
    <div
      className={cn(
        baseStyles,
        variantStyles[variant],
        paddingStyles[padding],
        hoverable && "hover:shadow-lg hover:scale-[1.01]",
        clickable && "cursor-pointer",
        borderAccent && borderAccentStyles[borderAccent],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

/* ============================================================================
 * METRIC CARD
 * ========================================================================== */

export interface UnifiedMetricCardProps {
  label: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  iconColor?: "primary" | "success" | "warning" | "destructive" | "muted";
  trend?: { value: number; isPositive: boolean };
  className?: string;
  onClick?: () => void;
}

export const UnifiedMetricCard = ({
  label,
  value,
  description,
  icon,
  iconColor = "primary",
  trend,
  className,
  onClick,
}: UnifiedMetricCardProps) => {
  const iconColorStyles = {
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    warning: "text-warning bg-warning/10",
    destructive: "text-destructive bg-destructive/10",
    muted: "text-muted-foreground bg-muted/10",
  };

  return (
    <UnifiedCard
      variant="metric"
      clickable={!!onClick}
      onClick={onClick}
      className={className}
    >
      <div className="flex items-center justify-between pb-3">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {label}
        </h3>
        {icon && (
          <div
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center",
              iconColorStyles[iconColor]
            )}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="text-3xl font-bold mb-1">{value}</div>

      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      {trend && (
        <div
          className={cn(
            "text-xs font-semibold mt-1",
            trend.isPositive ? "text-success" : "text-destructive"
          )}
        >
          {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
        </div>
      )}
    </UnifiedCard>
  );
};

/* ============================================================================
 * RESULT CARD
 * ========================================================================== */

interface MetricDisplay {
  label: string;
  value: string | number;
}

export interface UnifiedResultCardProps {
  title: string;
  description?: string;
  status?: "success" | "error" | "warning" | "info" | "neutral";
  statusLabel?: string;
  metrics?: MetricDisplay[];
  icon?: React.ReactNode;
  actions?: Array<{
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    variant?: "default" | "outline" | "destructive" | "ghost";
    disabled?: boolean;
  }>;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export const UnifiedResultCard = ({
  title,
  description,
  status = "neutral",
  statusLabel,
  metrics = [],
  icon,
  actions = [],
  onClick,
  className,
  children,
}: UnifiedResultCardProps) => {
  return (
    <UnifiedCard
      padding="none"
      clickable={!!onClick}
      onClick={onClick}
      className={cn("overflow-hidden", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1">
            {icon && <div>{icon}</div>}
            <h4 className="font-semibold truncate">{title}</h4>
          </div>
          {description && (
            <p className="text-xs text-muted-foreground truncate">
              {description}
            </p>
          )}
        </div>

        {status !== "neutral" && (
          <UnifiedBadge
            variant={status}
            label={statusLabel ?? status.toUpperCase()}
          />
        )}
      </div>

      {/* Metrics */}
      {metrics.length > 0 && (
        <div className="px-6 pb-4 grid grid-cols-2 gap-3">
          {metrics.map((m, i) => (
            <div
              key={i}
              className="rounded-lg bg-muted/30 p-3 text-center"
            >
              <div className="text-xs text-muted-foreground mb-1">
                {m.label}
              </div>
              <div className="text-2xl font-bold">{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {children && <div className="px-6 pb-4">{children}</div>}

      {/* Actions */}
      {actions.length > 0 && (
        <div className="p-6 pt-0 flex flex-wrap gap-2">
          {actions.map((a, i) => (
            <Button
              key={i}
              size="sm"
              variant={a.variant ?? "default"}
              disabled={a.disabled}
              onClick={(e) => {
                e.stopPropagation();
                a.onClick();
              }}
            >
              {a.icon}
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </UnifiedCard>
  );
};
