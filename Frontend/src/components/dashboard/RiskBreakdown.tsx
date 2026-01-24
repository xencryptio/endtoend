import { Badge } from "@/components/ui/badge";
import { ApplicationSummary } from "@/types/dashboardTypes";
import { getRiskBadgeClass, getScoreTextClass } from "@/utils/dashboardUtils";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface RiskBreakdownProps {
  data: ApplicationSummary[];
}

export default function RiskBreakdown({ data }: RiskBreakdownProps) {
  const navigate = useNavigate();

  if (!data || data.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <p className="text-muted-foreground">No applications found</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="bg-card rounded-xl border border-border shadow-sm overflow-hidden"
    >
      <div className="p-6 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground">Applications</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {data.length} total applications
        </p>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Application
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Sub-Org
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                PQC Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Vulnerabilities
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Risk Level
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {data.map((app, index) => (
              <motion.tr
                key={app["Application ID"]}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => navigate(`/app/${app["Application ID"]}`)}
                className="hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="font-medium text-foreground">{app.application}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                  {app["Sub Org"]}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`font-semibold ${getScoreTextClass(app.pqc_ready)}`}>
                    {app.pqc_ready}%
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                  {app.vulnerabilities || 0}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge className={getRiskBadgeClass(app.risk_level)}>
                    {app.risk_level}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <ArrowRight className="w-4 h-4 text-muted-foreground inline-block" />
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
