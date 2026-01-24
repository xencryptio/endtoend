import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { getSubOrgDashboard } from "@/api/dashboard";
import { MetricCard } from "./MetricCard";
import RiskBreakdown from "./RiskBreakdown";
import { RiskDistributionChart } from "./RiskDistributionChart";
import { VulnerabilityChart } from "./VulnerabilityChart";
import {
  Activity,
  Shield,
  AlertTriangle,
  CheckCircle,
  ArrowLeft,
  Building2,
} from "lucide-react";
import type { SubOrgDashboard as SubOrgDashboardType } from "@/types/dashboardTypes";

export default function SubOrgDashboard() {
  const { subOrgId } = useParams<{ subOrgId: string }>();
  const navigate = useNavigate();

  // ===== FETCH SUB-ORG DATA =====
  const { data: subOrgData, isLoading, error } = useQuery<SubOrgDashboardType>({
    queryKey: ["suborg-dashboard", subOrgId],
    queryFn: () => getSubOrgDashboard(subOrgId!),
    enabled: !!subOrgId,
  });

  // ===== THEME TRANSITION (Dashboard-1 style) =====
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

  // ===== LOADING STATE =====
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
  if (error || !subOrgData) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500">Failed to load sub-organization data</p>
        <button
          onClick={() => navigate("/")}
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  // ===== EXTRACT DATA =====
  const { suborganization_name, summary, applications, risk_distribution } = subOrgData;

  return (
    <motion.div
      className="space-y-6 p-4 sm:p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      {/* ===== HEADER WITH BACK BUTTON ===== */}
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
        className="space-y-4"
      >
        {/* Back Button */}
        <motion.button
          variants={{
            hidden: { opacity: 0, x: -20 },
            visible: { opacity: 1, x: 0 },
          }}
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-medium">Back to Organization Dashboard</span>
        </motion.button>

        {/* Title */}
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0 },
          }}
          className="flex items-center gap-3"
        >
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
            <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <AnimatePresence mode="wait">
              <motion.h2
                key={suborganization_name}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                className="text-3xl font-bold tracking-tight text-foreground"
              >
                {suborganization_name}
              </motion.h2>
            </AnimatePresence>
            <p className="text-sm text-muted-foreground mt-1">
              Sub-Organization Security Posture
            </p>
          </div>
        </motion.div>
      </motion.header>

      {/* ===== METRIC CARDS ===== */}
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
            Application Vulnerabilities
          </h3>
          <VulnerabilityChart applications={applications} />
        </div>
      </motion.div>

      {/* ===== APPLICATIONS TABLE ===== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <RiskBreakdown data={applications} />
      </motion.div>
    </motion.div>
  );
}
