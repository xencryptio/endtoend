// components/ui/unified-badge.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'pqc' | 'neutral';

interface UnifiedBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: BadgeVariant;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  pill?: boolean; // rounded-full vs rounded-md
}

export const UnifiedBadge = ({ 
  variant, 
  label, 
  size = 'md',
  pill = true,
  className,
  ...props
}: UnifiedBadgeProps) => {
  const baseStyles = "inline-flex items-center font-semibold";
  
  const sizeStyles = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
    lg: "px-3 py-1.5 text-base"
  };
  
  const variantStyles = {
    success: "bg-success/10 text-success border border-success/20",
    warning: "bg-warning/10 text-warning border border-warning/20",
    error: "bg-destructive/10 text-destructive border border-destructive/20",
    info: "bg-primary/10 text-primary border border-primary/20",
    pqc: "bg-scan-pqc/10 text-scan-pqc border border-scan-pqc/20",
    neutral: "bg-muted text-muted-foreground border"
  };
  
  return (
    <span className={cn(
      baseStyles,
      sizeStyles[size],
      variantStyles[variant],
      pill ? "rounded-full" : "rounded-md",
      className
    )}
    {...props}
    >
      {label}
    </span>
  );
};
