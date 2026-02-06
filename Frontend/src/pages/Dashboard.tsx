import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { getAllDashboards } from "@/api/dashboard";
import { MetricCard } from "@/components/dashboard/MetricCard";
import RiskBreakdown from "@/components/dashboard/RiskBreakdown";
import { RiskDistributionChart } from "@/components/dashboard/RiskDistributionChart";
import { VulnerabilityChart } from "@/components/dashboard/VulnerabilityChart";
import { SubOrgCards } from "@/components/dashboard/SubOrgCards";
import {
  calculateAveragePQC,
  countSecureApps,
  getTotalVulnerabilities,
} from "@/utils/dashboardUtils";
import {
  Activity,
  Shield,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Building2
} from "lucide-react";
import type { OrganizationDashboard } from "@/types/dashboardTypes";

export default function Dashboard() {
  const [selectedOrg, setSelectedOrg] = useState<OrganizationDashboard | null>(null);

  // ===== FETCH DASHBOARD-2 DATA =====
  const { data: dashboards, isLoading, error } = useQuery({
    queryKey: ["dashboard-home"],
    queryFn: getAllDashboards,
  });

  // ===== AUTO-SELECT FIRST ORG =====
  useEffect(() => {
    if (dashboards && dashboards.length > 0 && !selectedOrg) {
      setSelectedOrg(dashboards[0]);
    }
  }, [dashboards, selectedOrg]);

  // ===== THEME TRANSITION INJECTION (Dashboard-1 style) =====
  useEffect(() => {
    const styleId = "theme-transition-style";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.innerHTML = `
      body, div, button, header, footer, main, section, a,
      h1, h2, h3, h4, h5, h6, p, span, label, input, select, textarea,
      table, th, td, svg {
        transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;
        transition-timing-function: ease-out;
        transition-duration: 0.3s;
      }
    `;
    document.head.appendChild(style);
  }, []);

  // ===== LOADING STATE (Dashboard-1 animation) =====
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Activity className="w-8 h-8 text-primary" />
        </motion.div>
      </div>
    );
  }

  // ===== ERROR STATE =====
  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500">Failed to load dashboard data</p>
        <p className="text-sm text-muted-foreground mt-2">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  // ===== COMPUTE METRICS FROM DASHBOARD-2 DATA OR USE EMPTY STATE =====
  const summary = selectedOrg?.summary || {
    total_applications: 0,
    total_vulnerabilities: 0,
    secure_applications: 0,
    pqc_readiness_percent: 0,
  };

  const applications = selectedOrg?.applications || [];
  const risk_distribution =
    selectedOrg?.risk_distribution ?? {
      Low: 0,
      Medium: 0,
      High: 0,
      "Very High": 0,
    };
  const organization_name = selectedOrg?.organization_name || "Organization";

  return (
    <motion.div
      className="space-y-6 p-4 sm:p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      {/* ===== HEADER (Dashboard-1 styling) ===== */}
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
            <AnimatePresence mode="wait">
              <motion.h2
                key={organization_name}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                className="text-3xl font-bold tracking-tight text-foreground absolute whitespace-nowrap"
              >
                {organization_name} Overview
              </motion.h2>
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.header>

      {/* ===== EMPTY STATE NOTICE (if no data) ===== */}
      {!selectedOrg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
        >
          <p className="text-sm text-blue-800 dark:text-blue-300">
            No organization data available. Showing empty dashboard structure.
          </p>
        </motion.div>
      )}

      {/* ===== METRIC CARDS (Dashboard-1 UI + Dashboard-2 data) ===== */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <MetricCard
          title="Total Applications"
          value={summary.total_applications}
          icon={Activity}
          iconBgColor="bg-blue-50 dark:bg-blue-950/30"
          iconColor="text-blue-600 dark:text-blue-400"
        />
        <MetricCard
          title="Total Vulnerabilities"
          value={summary.total_vulnerabilities}
          icon={AlertTriangle}
          iconBgColor="bg-red-50 dark:bg-red-950/30"
          iconColor="text-red-600 dark:text-red-400"
        />
        <MetricCard
          title="Secure Applications"
          value={summary.secure_applications}
          icon={CheckCircle}
          iconBgColor="bg-green-50 dark:bg-green-950/30"
          iconColor="text-green-600 dark:text-green-400"
        />
        <MetricCard
          title="PQC Readiness"
          value={`${summary.pqc_readiness_percent}%`}
          icon={Shield}
          iconBgColor="bg-purple-50 dark:bg-purple-950/30"
          iconColor="text-purple-600 dark:text-purple-400"
        />
      </motion.div>

      {/* ===== CHARTS SECTION ===== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* Risk Distribution */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Risk Distribution
          </h3>
          <RiskDistributionChart data={risk_distribution} />
        </div>

        {/* Top Vulnerabilities */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Top Vulnerable Applications
          </h3>
          <VulnerabilityChart applications={applications} />
        </div>
      </motion.div>

      {/* ===== SUB-ORGANIZATIONS SECTION ===== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card rounded-xl border border-border p-6 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-6">
          <Building2 className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">
            Sub-Organizations
          </h3>
        </div>
        <SubOrgCards applications={applications} />
      </motion.div>

      {/* ===== APPLICATIONS TABLE (Dashboard-2 data, Dashboard-1 styling) ===== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <RiskBreakdown data={applications} />
      </motion.div>
    </motion.div>
  );
}