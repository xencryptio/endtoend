// frontend/src/pages/Dashboard.tsx
import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { DashboardMetrics } from "@/components/dashboard/DashboardMetrics";
import RiskBreakdown from "@/components/dashboard/RiskBreakdown";
import MigrationAndRiskCharts from "@/components/dashboard/MigrationAndRiskCharts";
import OrganizationalRiskChart from "@/components/dashboard/OrganizationalRiskChart";
import {
  generateTimelineChart,
  groupDataBySubOrg,
  getRiskChartData,
  calculateMetrics,
  calculateAvgMigration,
  getAssetDistributionData,
} from "@/utils/dashboardUtils";
import { CSVData } from "@/types/dashboardTypes";
import { Activity } from "lucide-react";

export default function Dashboard() {
  const [data, setData] = useState<CSVData[]>([]);
  const [orgName, setOrgName] = useState<string>("");
  const [timelineOption, setTimelineOption] = useState({});
  const [expandedSubOrgs, setExpandedSubOrgs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Inject global styles for smooth theme transition.
    // Ideally, this should be in a global stylesheet or a root layout component.
    const styleId = 'theme-transition-style';
    if (document.getElementById(styleId)) {
      return;
    }
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      body,
      div,
      button,
      header,
      footer,
      main,
      section,
      a,
      h1, h2, h3, h4, h5, h6,
      p,
      span,
      label,
      input,
      select,
      textarea,
      table,
      th,
      td,
      svg {
        transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;
        transition-timing-function: ease-out;
        transition-duration: 0.3s;
      }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_BACKEND_URL}/apps`)
      .then((res) => res.json())
      .then((apps: CSVData[]) => {
        setData(apps);
        const chart = generateTimelineChart(apps);
        setTimelineOption(chart);
        if (apps && apps.length > 0 && apps[0]["Sub Org"]) {
          setOrgName(apps[0]["Organisation"]);
        }
      })
      .catch(console.error);
  }, []);

  const grouped = useMemo(() => groupDataBySubOrg(data), [data]);
  const assetDistributionData = useMemo(() => getAssetDistributionData(data), [data]);
  const riskChartData = useMemo(() => getRiskChartData(data), [data]);
  const {
    totalApps,
    avgPQC,
    totalVulns,
    secureApps,
    totalAlgChanges,
    totalCertChanges,
    avgAlgPerApp,
    avgCertPerApp,
  } = useMemo(() => calculateMetrics(data), [data]);
  const avgMigration = useMemo(() => calculateAvgMigration(data), [data]);

  // Fixed: Convert object to array format
  const vulnerabilityByQuarter = useMemo(() => {
    const quarterMap: Record<string, { algorithms: number; certificates: number }> = {};

    data.forEach(app => {
      const quarter = app["Org Target Migration Data"];
      if (!quarterMap[quarter]) {
        quarterMap[quarter] = { algorithms: 0, certificates: 0 };
      }

      const algVuln = (app.total_pqc_vulnerable_algorithms || 0) - (app.alg_changes || 0);
      const certVuln = (app.total_pqc_vulnerable_certificates || 0) - (app.cert_changes || 0);

      quarterMap[quarter].algorithms += Math.max(0, algVuln);
      quarterMap[quarter].certificates += Math.max(0, certVuln);
    });

    // Convert object to array format as expected by the component
    return Object.entries(quarterMap).map(([name, data]) => ({
      name,
      algorithms: data.algorithms,
      certificates: data.certificates,
    }));
  }, [data]);

  const applicationsByQuarter = useMemo(() => {
    const quarterMap: Record<string, number> = {};

    data.forEach((app) => {
      const quarter = app["Org Target Migration Data"];
      if (!quarterMap[quarter]) {
        quarterMap[quarter] = 0;
      }
      quarterMap[quarter]++;
    });

    return Object.entries(quarterMap).map(([name, count]) => ({
      name,
      count,
    }));
  }, [data]);

  const toggleExpand = (subOrg: string) => {
    setExpandedSubOrgs((prev) => ({ ...prev, [subOrg]: !prev[subOrg] }));
  };

  return (
    <motion.div
      className="space-y-6 p-4 sm:p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      {/* Enterprise-Level Header with framer-motion */}
      <motion.header
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: { staggerChildren: 0.15 },
          },
        }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0 },
          }}
        >
          <div className="relative h-9 flex items-center">
  {/* Wrapper with flex for vertical alignment */}
  <AnimatePresence mode="wait">
    <motion.h2
      key={orgName || "overview"}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.2 }}
      className="text-3xl font-bold tracking-tight text-foreground absolute whitespace-nowrap"
    >
      {orgName ? `${orgName} Overview` : "Overview"}
    </motion.h2>
  </AnimatePresence>
</div>

        </motion.div>
      </motion.header>

      {/* Metric Cards */}
      <DashboardMetrics
        totalApps={totalApps}
        totalAlgChanges={totalAlgChanges}
        totalCertChanges={totalCertChanges}
        avgAlgPerApp={avgAlgPerApp}
        avgCertPerApp={avgCertPerApp}
        totalVulns={totalVulns}
        secureApps={secureApps}
        avgMigration={avgMigration}
        avgPQC={avgPQC}
      />

      {/* Charts */}
      <MigrationAndRiskCharts
        vulnerabilityByQuarter={vulnerabilityByQuarter}
        riskChartData={riskChartData}
        assetDistributionData={assetDistributionData}
        applicationsByQuarter={applicationsByQuarter}
      />

      {/* Application Table */}
      <RiskBreakdown data={data} />
    </motion.div>
  );
}