import { cn } from "@/lib/utils";
import { getRiskBadgeClass } from "@/utils/dashboardUtils";

interface BadgeProps {
  children: React.ReactNode;
  risk?: "Low" | "Medium" | "High" | "Very High";
  className?: string;
}

export function Badge({ children, risk, className }: BadgeProps) {
  const baseClass = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border";
  
  const riskClass = risk ? getRiskBadgeClass(risk) : "";
  
  return (
    <span className={cn(baseClass, riskClass, className)}>
      {children}
    </span>
  );
}