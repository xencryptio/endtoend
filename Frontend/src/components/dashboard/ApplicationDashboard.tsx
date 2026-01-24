import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { getAppDashboard } from "@/api/dashboard";
import { getScoreTextClass, getRiskBadgeClass } from "@/utils/dashboardUtils";
import {
  Activity,
  ArrowLeft,
  Server,
  Github,
  AlertOctagon,
  Shield,
  Code2,
  Database,
} from "lucide-react";
import type { ApplicationDetail } from "@/types/dashboardTypes";

export default function ApplicationDashboard() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  // ===== FETCH APPLICATION DATA =====
  const { data: appData, isLoading, error } = useQuery<ApplicationDetail>({
    queryKey: ["app-dashboard", appId],
    queryFn: () => getAppDashboard(appId!),
    enabled: !!appId,
  });

  // ===== THEME TRANSITION =====
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
  if (error || !appData) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500">Failed to load application data</p>
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
  const {
    application,
    pqc_ready,
    risk_level,
    algorithms_used = [],
    repo_urls = [],
    repo_names = [],
    server_hostnames = [],
    vulnerabilities = 0,
    total_algorithms = 0,
    total_certificates = 0,
    alg_changes = 0,
    cert_changes = 0,
    status = "Unknown",
  } = appData;

  const safeRiskLevel = risk_level || "Unknown";

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
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-medium">Back</span>
        </motion.button>

        {/* Title & Status */}
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0 },
          }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
              <Database className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <AnimatePresence mode="wait">
                <motion.h2
                  key={application}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="text-3xl font-bold tracking-tight text-foreground"
                >
                  {application}
                </motion.h2>
              </AnimatePresence>
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getRiskBadgeClass(safeRiskLevel)}`}>
                  {safeRiskLevel} Risk
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-muted border border-border">
                  {status}
                </span>
              </div>
            </div>
          </div>

          {/* PQC Score Badge */}
          <div className="flex flex-col items-end">
            <p className="text-sm font-medium text-muted-foreground mb-1">PQC Readiness</p>
            <div className={`text-5xl font-bold ${getScoreTextClass(pqc_ready)}`}>
              {pqc_ready}%
            </div>
          </div>
        </motion.div>
      </motion.header>

      {/* ===== HIGH RISK WARNING ===== */}
      {(risk_level === "Very High" || risk_level === "High") && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-red-50 dark:bg-red-950/30 border-l-4 border-red-500 p-4 rounded-r-lg"
        >
          <div className="flex items-start gap-3">
            <AlertOctagon className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-red-800 dark:text-red-300">
                Critical Security Alert
              </h3>
              <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                This application has a {risk_level.toLowerCase()} risk level with {vulnerabilities} active vulnerabilities. 
                Immediate cryptographic migration is required.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ===== STATISTICS CARDS ===== */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {/* Vulnerabilities */}
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">Vulnerabilities</p>
            <AlertOctagon className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-foreground">{vulnerabilities}</p>
        </div>

        {/* Algorithms */}
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">Total Algorithms</p>
            <Code2 className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-foreground">{total_algorithms}</p>
        </div>

        {/* Algorithm Changes */}
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">Alg Changes Made</p>
            <Shield className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-foreground">{alg_changes}</p>
        </div>

        {/* Certificate Changes */}
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">Cert Changes Made</p>
            <Shield className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-foreground">{cert_changes}</p>
        </div>
      </motion.div>

      {/* ===== DETAILS GRID ===== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* Cryptographic Algorithms */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Code2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-foreground">
              Cryptographic Algorithms
            </h3>
          </div>
          {algorithms_used.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {algorithms_used.map((algo, index) => (
                <motion.span
                  key={algo}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-mono border border-blue-200 dark:border-blue-800"
                >
                  {algo}
                </motion.span>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground italic">No algorithms detected</p>
          )}
        </div>

        {/* Linked Repositories */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Github className="w-5 h-5 text-foreground" />
            <h3 className="text-lg font-semibold text-foreground">
              Linked Repositories
            </h3>
          </div>
          {repo_names.length > 0 ? (
            <div className="space-y-2">
              {repo_names.map((repo, idx) => (
                <motion.a
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  href={repo_urls[idx] || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 p-3 bg-muted hover:bg-muted/80 rounded-lg border border-border transition-colors group"
                >
                  <Github className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    {repo}
                  </span>
                </motion.a>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground italic">No repositories linked</p>
          )}
        </div>

        {/* Infrastructure */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-5 h-5 text-green-600 dark:text-green-400" />
            <h3 className="text-lg font-semibold text-foreground">Infrastructure</h3>
          </div>
          {server_hostnames.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {server_hostnames.map((hostname, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800"
                >
                  <Server className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-green-800 dark:text-green-300 truncate">
                    {hostname}
                  </span>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground italic">No servers detected</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
