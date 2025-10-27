import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Eye, RefreshCw } from "lucide-react";
import { SubOrg } from "./types";

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case "Good": return "default";
    case "Warning": return "secondary";
    case "Critical": return "destructive";
    default: return "outline";
  }
};

const getRiskColor = (risk: string) => {
  switch (risk) {
    case "Low": return "text-green-600";
    case "Medium": return "text-yellow-600";
    case "High": return "text-red-600";
    default: return "text-gray-500";
  }
};

const getProgressBarColor = (percentage: number) => {
  if (percentage >= 80) return "bg-green-600";
  if (percentage >= 60) return "bg-yellow-600";
  return "bg-red-600";
};

interface SubOrgCardProps {
  subOrg: SubOrg;
  onClick: (name: string) => void;
}

function SubOrgCard({ subOrg, onClick }: SubOrgCardProps) {
  return (
    <Card 
      className="hover:shadow-lg transition-all cursor-pointer transform hover:scale-105"
      onClick={() => onClick(subOrg.name)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-xl font-semibold text-foreground">
              {subOrg.name}
            </CardTitle>
          </div>
          <Badge variant={getStatusBadgeVariant(subOrg.pqc_status)}>
            {subOrg.pqc_status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-foreground">Applications</span>
          <span className="text-base text-muted-foreground">{subOrg.total_apps}</span>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-foreground">High Risk</span>
            <span className={`text-base font-semibold ${getRiskColor("High")}`}>{subOrg.high_risk_count}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-foreground">Medium Risk</span>
            <span className={`text-base font-semibold ${getRiskColor("Medium")}`}>{subOrg.medium_risk_count}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-foreground">Low Risk</span>
            <span className={`text-base font-semibold ${getRiskColor("Low")}`}>{subOrg.low_risk_count}</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-base font-medium text-foreground">PQC Readiness</span>
            <span className="text-base text-muted-foreground">{subOrg.pqc_ready_percentage}%</span>
          </div>
          <div className="relative w-full bg-muted rounded-full h-2.5">
            <div 
              className={`h-2.5 rounded-full transition-all duration-300 ${getProgressBarColor(subOrg.pqc_ready_percentage)}`}
              style={{ width: `${subOrg.pqc_ready_percentage}%` }}
            />
          </div>
        </div>

        <Button variant="outline" size="sm" className="w-full gap-2">
          <Eye className="h-4 w-4" />
          View Details
        </Button>
      </CardContent>
    </Card>
  );
}

interface SubOrgsViewProps {
  subOrgs: SubOrg[];
  onSubOrgClick: (name: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function SubOrgsView({ subOrgs, onSubOrgClick, onRefresh, isRefreshing }: SubOrgsViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-bold text-foreground">Sub-Organizations</h2>
          <p className="text-lg text-muted-foreground">
            Overview of post-quantum cryptography readiness across all departments
          </p>
        </div>
        <Button 
          variant="outline" 
          className="gap-2"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Data
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {subOrgs.map((subOrg, index) => (
          <SubOrgCard
            key={index}
            subOrg={subOrg}
            onClick={onSubOrgClick}
          />
        ))}
      </div>
    </div>
  );
}