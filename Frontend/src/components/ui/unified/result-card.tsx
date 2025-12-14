import React from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react';

type ResultStatus = 'success' | 'warning' | 'error' | 'pending' | 'info';

interface UnifiedResultCardProps {
  status: ResultStatus;
  title: string;
  description?: string;
  metrics?: Array<{
    label: string;
    value: string | number;
    emphasis?: boolean;
  }>;
  children?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

/**
 * Specialized card for displaying scan results and metrics
 * Different from UnifiedCard - this has built-in status indicators
 */
export const UnifiedResultCard: React.FC<UnifiedResultCardProps> = ({
  status,
  title,
  description,
  metrics,
  children,
  onClick,
  className,
}) => {
  const statusConfig = {
    success: {
      icon: CheckCircle,
      borderColor: 'border-success',
      bgColor: 'bg-success/5',
      iconColor: 'text-success',
      indicatorColor: 'bg-success',
    },
    warning: {
      icon: AlertTriangle,
      borderColor: 'border-warning',
      bgColor: 'bg-warning/5',
      iconColor: 'text-warning',
      indicatorColor: 'bg-warning',
    },
    error: {
      icon: XCircle,
      borderColor: 'border-destructive',
      bgColor: 'bg-destructive/5',
      iconColor: 'text-destructive',
      indicatorColor: 'bg-destructive',
    },
    pending: {
      icon: Clock,
      borderColor: 'border-primary',
      bgColor: 'bg-primary/5',
      iconColor: 'text-primary',
      indicatorColor: 'bg-primary',
    },
    info: {
      icon: CheckCircle,
      borderColor: 'border-primary',
      bgColor: 'bg-primary/5',
      iconColor: 'text-primary',
      indicatorColor: 'bg-primary',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative rounded-xl border-2 p-6 shadow-sm transition-all duration-300",
        "backdrop-blur-sm bg-card",
        config.borderColor,
        config.bgColor,
        onClick && "cursor-pointer hover:shadow-lg hover:-translate-y-1",
        className
      )}
    >
      {/* Status Indicator Dot */}
      <div className="absolute top-4 right-4">
        <div className={cn(
          "w-3 h-3 rounded-full animate-pulse shadow-lg",
          config.indicatorColor
        )} />
      </div>

      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className={cn(
          "p-2 rounded-lg",
          config.bgColor
        )}>
          <Icon className={cn("h-5 w-5", config.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      {metrics && metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t">
          {metrics.map((metric, idx) => (
            <div key={idx} className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {metric.label}
              </p>
              <p className={cn(
                "font-bold",
                metric.emphasis ? "text-2xl" : "text-lg"
              )}>
                {metric.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Additional Content */}
      {children && (
        <div className="mt-4 pt-4 border-t">
          {children}
        </div>
      )}
    </div>
  );
};
