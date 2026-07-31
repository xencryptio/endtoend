// frontend/src/App.tsx
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "@/contexts/AuthContext";
import { Layout } from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AnimatePresence } from "framer-motion";
import LoginPage from "./pages/Login";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import MigrationAssist from "./pages/migrationassist";
import Integration from "./pages/integration";
import Scan from "./pages/SSL-TLS scans";
import SystemScan from "./pages/AssetsScans";
import Readinessanalysis from "./pages/Readinessanalysis";
import NotFound from "./pages/NotFound";

// ─── ELK-powered pages ───────────────────────────────────────────────────────
import DashboardELK from "./pages/DashboardELK";
import ResultsELK from "./pages/ResultsELK";
import ScanHistoryELK from "./pages/ScanHistoryELK";
import PqcAnalystDashboard from "./pages/PqcAnalystDashboard";
import ELKScorerDashboard from "./pages/ELKScorerDashboard";
import ELKScorerRepo from "./pages/ELKScorerRepo";
import ELKVulnerabilities from "./pages/ELKVulnerabilities";
import OnboardingELK from "./pages/OnboardingELK";
import ApplicationsELK from "./pages/ApplicationsELK";

const GOOGLE_CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ?? "";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5 },
  },
});

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Root → ELK dashboard (protected) */}
        <Route path="/" element={<Navigate to="/elk/dashboard" replace />} />

        {/* Protected standalone tools */}
        <Route path="/scans"             element={<ProtectedRoute><Scan /></ProtectedRoute>} />
        <Route path="/assets-scans"      element={<ProtectedRoute><SystemScan /></ProtectedRoute>} />
        <Route path="/Readinessanalysis" element={<ProtectedRoute><Readinessanalysis /></ProtectedRoute>} />
        <Route path="/reports"           element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/settings"          element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/migrationAssist"   element={<ProtectedRoute><MigrationAssist /></ProtectedRoute>} />
        <Route path="/integration"       element={<ProtectedRoute><Integration /></ProtectedRoute>} />

        {/* Protected ELK routes */}
        <Route path="/elk/dashboard"       element={<ProtectedRoute><DashboardELK /></ProtectedRoute>} />
        <Route path="/elk/results"         element={<ProtectedRoute><ResultsELK /></ProtectedRoute>} />
        <Route path="/elk/history"         element={<ProtectedRoute><ScanHistoryELK /></ProtectedRoute>} />
        <Route path="/elk/analyst"         element={<ProtectedRoute><PqcAnalystDashboard /></ProtectedRoute>} />
        <Route path="/elk/scorer"          element={<ProtectedRoute><ELKScorerDashboard /></ProtectedRoute>} />
        <Route path="/elk/scorer-repo"     element={<ProtectedRoute><ELKScorerRepo /></ProtectedRoute>} />
        <Route path="/elk/vulnerabilities" element={<ProtectedRoute><ELKVulnerabilities /></ProtectedRoute>} />
        <Route path="/elk/onboarding"      element={<ProtectedRoute><OnboardingELK /></ProtectedRoute>} />
        <Route path="/elk/applications"    element={<ProtectedRoute><ApplicationsELK /></ProtectedRoute>} />

        {/* Legacy redirects */}
        <Route path="/dashboard"       element={<Navigate to="/elk/dashboard" replace />} />
        <Route path="/pqc-dashboard"   element={<Navigate to="/elk/analyst" replace />} />
        <Route path="/applications"    element={<Navigate to="/elk/applications" replace />} />
        <Route path="/vulnerabilities" element={<Navigate to="/elk/vulnerabilities" replace />} />
        <Route path="/onboarding"      element={<Navigate to="/elk/onboarding" replace />} />

        {/* 404 Fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
  );
};

const App = () => (
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <AuthProvider>
      <ThemeProvider attribute="class" defaultTheme="light">
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Sonner />
            <BrowserRouter>
              {/* Login renders standalone — no sidebar/header */}
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/*" element={
                  <Layout>
                    <AnimatedRoutes />
                  </Layout>
                } />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </AuthProvider>
  </GoogleOAuthProvider>
);

export default App;