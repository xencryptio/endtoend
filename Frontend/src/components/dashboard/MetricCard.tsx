import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  gradient?: boolean;
  iconClassName?: string;
}

export function MetricCard({ 
  title, 
  value, 
  change, 
  changeType = "neutral", 
  icon: Icon,
  gradient = false,
  iconClassName
}: MetricCardProps) {
  const changeColors = {
    positive: "text-success",
    negative: "text-destructive", 
    neutral: "text-muted-foreground"
  };

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-200 rounded-xl p-4",
        "bg-glass-light dark:bg-glass-dark backdrop-blur-md",
        "hover:shadow-lg dark:hover:shadow-xl", // Enhanced hover effect for dark mode
        "border border-border dark:border-white/10", // Optional: subtle border for visibility
        gradient && "bg-gradient-to-br from-card to-accent/10"
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={cn("h-4 w-4 text-primary", iconClassName)} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl lg:text-3xl font-bold text-foreground">{value}</div>
        {change && (
          <p className={cn("text-xs mt-1", changeColors[changeType])}>
            {change}
          </p>
        )}
      </CardContent>

      {gradient && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
      )}
    </Card>
  );
}
