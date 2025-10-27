import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CSVData {
  application: string;
  pqc_ready: number;
  vulnerabilities: number;
  risk_level: "Low" | "Medium" | "High" | "Very High";
  status: string;
  alg_changes: number;
  cert_changes: number;
  total_pqc_vulnerable_certificates: number;
  total_pqc_vulnerable_algorithms: number;
  "Sub Org": string;
}

interface GroupedData {
  subOrg: string;
  avgPqcReady: number;
  avgVulnerabilities: number;
  mostCommonStatus: string;
  riskDistribution: Record<string, number>;
  apps: CSVData[];
}

const riskColors: Record<string, string> = {
  Low: "#10b981",
  Medium: "#facc15",
  High: "#f97316",
  "Very High": "#dc2626",
};

const badgeColor = (level: string) =>
  level === "Low"
    ? "bg-green-100 text-green-800"
    : level === "Medium"
    ? "bg-yellow-100 text-yellow-800"
    : level === "High"
    ? "bg-orange-100 text-orange-800"
    : "bg-red-100 text-red-800";

const RiskBreakdown: React.FC<{ data: CSVData[] }> = ({ data }) => {
  const [expandedSubOrgs, setExpandedSubOrgs] = useState<Record<string, boolean>>({});

  const grouped: GroupedData[] = useMemo(() => {
    return Object.values(
      data.reduce((acc: Record<string, GroupedData>, app) => {
        const subOrg = app["Sub Org"];
        // vulnerabilityCount = vulnerable certs + vulnerable algos - cert changes - algo changes
        const vulnerabilityCount =
          (app.total_pqc_vulnerable_certificates || 0) +
          (app.total_pqc_vulnerable_algorithms || 0) -
          (app.cert_changes || 0) -
          (app.alg_changes || 0);

        if (!acc[subOrg]) {
          acc[subOrg] = {
            subOrg,
            avgPqcReady: 0,
            avgVulnerabilities: 0,
            mostCommonStatus: "",
            riskDistribution: {},
            apps: [],
          };
        }

        acc[subOrg].apps.push({ ...app, vulnerabilities: vulnerabilityCount });
        return acc;
      }, {})
    ).map((group) => {
      const totalApps = group.apps.length;
      group.avgPqcReady = group.apps.reduce((sum, a) => sum + a.pqc_ready, 0) / totalApps;
      group.avgVulnerabilities =
        group.apps.reduce((sum, a) => sum + a.vulnerabilities, 0) / totalApps;

      const statusCount: Record<string, number> = {};
      const riskCount: Record<string, number> = {};
      group.apps.forEach((app) => {
        statusCount[app.status] = (statusCount[app.status] || 0) + 1;
        riskCount[app.risk_level] = (riskCount[app.risk_level] || 0) + 1;
      });

      group.mostCommonStatus = Object.entries(statusCount).sort((a, b) => b[1] - a[1])[0][0];
      group.riskDistribution = riskCount;
      return group;
    });
  }, [data]);

  const toggleExpand = (subOrg: string) => {
    setExpandedSubOrgs((prev) => ({ ...prev, [subOrg]: !prev[subOrg] }));
  };

  return (
    <>
    <style>
      {`
        @media (max-width: 768px) {
          td[data-label]::before {
            content: attr(data-label);
            font-weight: bold;
            display: block;
          }
        }
      `}
    </style>
    <Card>
  <CardHeader>
    <CardTitle className="text-lg font-semibold text-foreground">
      Organizational Risk Breakdown
    </CardTitle>
  </CardHeader>
  <CardContent className="p-0 md:p-4">
    <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
      <table className="w-full text-sm whitespace-nowrap table-auto">
        <thead className="border-b bg-muted/50">
          <tr className="text-left text-muted-foreground">
            <th className="py-3 px-4 font-medium">Sub Org</th>
            <th className="py-3 px-4 font-medium">Avg PQC Ready</th>
            <th className="py-3 px-4 font-medium">Avg Vulnerabilities</th>
            <th className="py-3 px-4 font-medium">Risk Distribution</th>
            <th className="py-3 px-4 font-medium">Common Status</th>
          </tr>
        </thead>
        <motion.tbody>
          {grouped.map((group) => (
            <React.Fragment key={group.subOrg}>
              <motion.tr
                whileHover={{ backgroundColor: "hsl(var(--muted) / 0.5)" }}
                className="border-b transition-colors"
              >
                <td className="p-4 font-semibold text-foreground">
                  <button
                    onClick={() => toggleExpand(group.subOrg)}
                    className="flex items-center gap-2 w-full text-left"
                  >
                    {expandedSubOrgs[group.subOrg] ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    {group.subOrg}
                  </button>
                </td>
                <td className="p-4">
                  <div className="relative w-full max-w-[120px] h-2 bg-muted rounded-full">
                    <div
                      className="h-2 bg-blue-500 rounded-full"
                      style={{ width: `${group.avgPqcReady}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {group.avgPqcReady.toFixed(1)}%
                  </div>
                </td>
                <td className="p-4">{group.avgVulnerabilities.toFixed(1)}</td>
                <td className="p-4">
                  <div className="flex items-center gap-1">
                    {Object.entries(group.riskDistribution).map(([level, count]) => (
                      <span
                        key={level}
                        className={`px-2 py-0.5 text-xs rounded-full font-medium ${badgeColor(level)}`}
                      >
                        {level}: {count}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-4">
                  <span className="text-xs bg-muted px-2 py-1 rounded-full font-medium">
                    {group.mostCommonStatus}
                  </span>
                </td>
              </motion.tr>

              {/* Expanded rows (apps) stay inline too */}
              <AnimatePresence>
                {expandedSubOrgs[group.subOrg] &&
                  group.apps.map((app, j) => (
                    <motion.tr
                      key={`${group.subOrg}-${j}`}
                      whileHover={{ backgroundColor: "hsl(var(--muted) / 0.3)" }}
                      className="border-b bg-muted/20 text-sm transition-colors"
                    >
                      <td className="p-4 text-muted-foreground">↳ {app.application}</td>
                      <td className="p-4">
                        <div className="w-full max-w-[100px] h-2 bg-muted-foreground/20 rounded-full">
                          <div
                            className="h-2 bg-blue-600 rounded-full"
                            style={{ width: `${app.pqc_ready}%` }}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {app.pqc_ready}%
                        </div>
                      </td>
                      <td className="p-4">{app.vulnerabilities}</td>
                      <td className="p-4">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeColor(app.risk_level)}`}
                        >
                          {app.risk_level}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="text-xs bg-muted px-2 py-1 rounded-full font-medium">
                          {app.status}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
              </AnimatePresence>
            </React.Fragment>
          ))}
        </motion.tbody>
      </table>
    </div>
  </CardContent>
</Card>

    </>
  );
};

export default RiskBreakdown;