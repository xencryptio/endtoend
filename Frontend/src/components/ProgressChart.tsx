import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface ProgressItem {
  label: string;
  value: number;
  total: number;
  color: "primary" | "success" | "warning" | "destructive";
}

interface ProgressChartProps {
  title: string;
  items: ProgressItem[];
}

export function ProgressChart({ title, items }: ProgressChartProps) {
  const getProgressColor = (color: string) => {
    const colors = {
      primary: "bg-primary",
      success: "bg-success", 
      warning: "bg-warning",
      destructive: "bg-destructive"
    };
    return colors[color as keyof typeof colors] || "bg-primary";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item, index) => {
          const percentage = (item.value / item.total) * 100;
          return (
            <div key={index} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-foreground font-medium">{item.label}</span>
                <span className="text-muted-foreground">
                  {item.value}/{item.total} ({percentage.toFixed(1)}%)
                </span>
              </div>
              <Progress 
                value={percentage} 
                className="h-2"
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}