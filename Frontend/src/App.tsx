// frontend/src/App.tsx
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AnimatePresence } from "framer-motion";
import Dashboard from "./pages/Dashboard";
import PQC_DASHBOARD from "./pages/PQC_DASHBOARD";
import Applications from "./pages/Applications";
import Vulnerabilities2 from "./pages/Vulnerabilities2";
import Profile from "./pages/Profile";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import MigrationAssist from "./pages/migrationassist";
import Integration from "./pages/integration";
import Scan from "./pages/SSL-TLS scans";
import SystemScan from "./pages/AssetsScans";
import Readinessanalysis from "./pages/Readinessanalysis";
import Onboarding from "./pages/onboarding";
import SubOrgDashboard from './components/dashboard/SubOrgDashboard'; // New Import
import ApplicationDashboard from './components/dashboard/ApplicationDashboard'; // New Import
import NotFound from "./pages/NotFound";

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
        {/* Main Dashboard - Organization View */}
        <Route path="/" element={<Dashboard />} />
        
        {/* Sub-Organization View */}
        <Route path="/suborg/:subOrgId" element={<SubOrgDashboard />} />
        
        {/* Application View */}
        <Route path="/app/:appId" element={<ApplicationDashboard />} />

        {/* PQC Analysis Dashboard */}
        <Route path="/pqc-dashboard" element={<PQC_DASHBOARD />} />

        {/* Existing routes */}
        <Route path="/applications" element={<Applications />} />
        <Route path="/vulnerabilities" element={<Vulnerabilities2 />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/scans" element={<Scan />} />
        <Route path="/assets-scans" element={<SystemScan />} />
        <Route path="/Readinessanalysis" element={<Readinessanalysis />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/migrationAssist" element={<MigrationAssist />} />
        <Route path="/integration" element={<Integration />} />
        <Route path="/onboarding" element={<Onboarding />} />
        
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