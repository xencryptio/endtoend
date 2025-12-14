// components/ui/unified-card.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

interface UnifiedCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'premium' | 'bordered' | 'metric';
  padding?: 'compact' | 'default' | 'spacious' | 'none';
  hoverable?: boolean;
  clickable?: boolean;
  borderAccent?: 'primary' | 'success' | 'warning' | 'destructive' | 'emerald' | null;   
}

export const UnifiedCard = ({
  variant = 'default',
  padding = 'default',
  hoverable = false,
  clickable = false,
  borderAccent = null,
  className,
  children,
  ...props
}: UnifiedCardProps) => {
  const baseStyles = "rounded-xl border shadow-sm transition-all duration-300";

  const variantStyles = {
    default: "bg-card text-card-foreground",
    premium: "backdrop-blur-xl bg-card/80 border-2 shadow-lg hover:shadow-xl",
    bordered: "bg-card border-2 border-primary/20",
    metric: "bg-card shadow-md hover:shadow-lg hover:scale-[1.01] transition-all duration-200"
  };

  const paddingStyles = {
    compact: "p-4",
    default: "p-6",
    spacious: "p-8",
    none: "p-0"
  };

  const borderAccentStyles = {
    primary: "border-l-4 border-primary",
    success: "border-l-4 border-success",
    warning: "border-l-4 border-warning",
    destructive: "border-l-4 border-destructive",
    emerald: "border-l-4 border-emerald-500",
  };

  return (
    <div className={cn(
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