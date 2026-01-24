import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Building2, ArrowRight, TrendingUp } from "lucide-react";
import { getScoreTextClass } from "@/utils/dashboardUtils";

interface SubOrgCardsProps {
  applications: Array<{
    "Sub Org": string;
    "Sub Org ID": string;
    pqc_ready: number;
    vulnerabilities: number;
  }>;
}

export function SubOrgCards({ applications }: SubOrgCardsProps) {
  const navigate = useNavigate();

  // Group by sub-org
  const subOrgMap = applications.reduce((acc, app) => {
    const subOrgId = app["Sub Org ID"];
    const subOrgName = app["Sub Org"];
    
    if (!acc[subOrgId]) {
      acc[subOrgId] = {
        id: subOrgId,
        name: subOrgName,
        appCount: 0,
        totalVulns: 0,
        avgPQC: 0,
        pqcScores: []
      };
    }
    
    acc[subOrgId].appCount++;
    acc[subOrgId].totalVulns += app.vulnerabilities || 0;
    acc[subOrgId].pqcScores.push(app.pqc_ready);
    
    return acc;
  }, {} as Record<string, any>);

  // Calculate averages
  const subOrgs = Object.values(subOrgMap).map((org: any) => ({
    ...org,
    avgPQC: Math.round(org.pqcScores.reduce((a: number, b: number) => a + b, 0) / org.pqcScores.length)
  }));

  if (subOrgs.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No sub-organizations found
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {subOrgs.map((org, index) => (
        <motion.div
          key={org.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          onClick={() => navigate(`/suborg/${org.id}`)}
          className="bg-card rounded-xl border border-border p-6 shadow-sm hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
              <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
          </div>
          
          <h3 className="font-semibold text-foreground mb-2 line-clamp-1">
            {org.name}
          </h3>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Applications</span>
              <span className="font-medium text-foreground">{org.appCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">PQC Readiness</span>
              <span className={`font-semibold ${getScoreTextClass(org.avgPQC)}`}>
                {org.avgPQC}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vulnerabilities</span>
              <span className="font-medium text-foreground">{org.totalVulns}</span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
