// frontend/src/App.tsx
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AnimatePresence } from "framer-motion";
import Profile from "./pages/Profile";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import MigrationAssist from "./pages/migrationassist";
import Integration from "./pages/integration";
import Scan from "./pages/SSL-TLS scans";
import SystemScan from "./pages/AssetsScans";
import Readinessanalysis from "./pages/Readinessanalysis";
import NotFound from "./pages/NotFound";

// ─── ELK-powered pages (the only dashboards now) ───────────────────────────
import DashboardELK from "./pages/DashboardELK";
import ResultsELK from "./pages/ResultsELK";
import ScanHistoryELK from "./pages/ScanHistoryELK";
import PqcAnalystDashboard from "./pages/PqcAnalystDashboard";
import ELKScorerDashboard from "./pages/ELKScorerDashboard";
import ELKVulnerabilities from "./pages/ELKVulnerabilities";
import OnboardingELK from "./pages/OnboardingELK";
import ApplicationsELK from "./pages/ApplicationsELK";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5 }, // 5 minutes
  },
});

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Root → ELK dashboard */}
        <Route path="/" element={<Navigate to="/elk/dashboard" replace />} />

        {/* Standalone tools */}
        <Route path="/profile" element={<Profile />} />
        <Route path="/scans" element={<Scan />} />
        <Route path="/assets-scans" element={<SystemScan />} />
        <Route path="/Readinessanalysis" element={<Readinessanalysis />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/migrationAssist" element={<MigrationAssist />} />
        <Route path="/integration" element={<Integration />} />

        {/* ELK-backed routes (the only dashboard set now) */}
        <Route path="/elk/dashboard" element={<DashboardELK />} />
        <Route path="/elk/results" element={<ResultsELK />} />
        <Route path="/elk/history" element={<ScanHistoryELK />} />
        <Route path="/elk/analyst" element={<PqcAnalystDashboard />} />
        <Route path="/elk/scorer" element={<ELKScorerDashboard />} />
        <Route path="/elk/vulnerabilities" element={<ELKVulnerabilities />} />
        <Route path="/elk/onboarding" element={<OnboardingELK />} />
        <Route path="/elk/applications" element={<ApplicationsELK />} />

        {/* Legacy redirects so any saved bookmarks still work */}
        <Route path="/dashboard" element={<Navigate to="/elk/dashboard" replace />} />
        <Route path="/pqc-dashboard" element={<Navigate to="/elk/analyst" replace />} />
        <Route path="/applications" element={<Navigate to="/elk/applications" replace />} />
        <Route path="/vulnerabilities" element={<Navigate to="/elk/vulnerabilities" replace />} />
        <Route path="/onboarding" element={<Navigate to="/elk/onboarding" replace />} />

        {/* 404 Fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
  );
};

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <Layout>
            <AnimatedRoutes />
          </Layout>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;