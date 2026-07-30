import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { motion } from "framer-motion";
import { Shield, Lock, Cpu, GitBranch, Globe, CheckCircle, Zap, Server, Lock as LockIcon, Code2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Animated floating feature pill
const FeaturePill = ({
  icon,
  label,
  description,
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  delay: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.5 }}
    className="flex flex-col gap-1 bg-gradient-to-br from-white/8 to-white/3 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 hover:border-white/20 hover:bg-white/12 transition-all"
  >
    <div className="flex items-center gap-2">
      {icon}
      <span className="font-semibold">{label}</span>
    </div>
    {description && <p className="text-xs text-slate-400">{description}</p>}
  </motion.div>
);

const LoginPage = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate("/elk/dashboard", { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSuccess = (response: CredentialResponse) => {
    if (response.credential) {
      login(response.credential);
      toast.success("Welcome to XENCRYPT - Your Quantum-Safe Future Starts Now");
      navigate("/elk/dashboard", { replace: true });
    }
  };

  const handleError = () => {
    toast.error("Google sign-in failed. Please try again.");
  };

  return (
    <div className="min-h-screen flex bg-[#080c14] overflow-hidden">

      {/* ── Left panel — branding ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-14 relative"
      >
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        {/* Glow blobs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-purple-600/20 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-blue-600/15 blur-[80px] pointer-events-none" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 via-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-900/60 animate-pulse">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-white font-bold text-xl tracking-wide">XENCRYPT</span>
            <span className="text-xs text-cyan-400 font-semibold">Post-Quantum Ready</span>
          </div>
        </div>

        {/* Main copy */}
        <div className="relative z-10 space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <h1 className="text-5xl xl:text-6xl font-black text-white leading-tight">
              Prepare Your
              <br />
              <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                IT Assets for Tomorrow
              </span>
            </h1>
            <p className="mt-6 text-slate-300 text-lg leading-relaxed max-w-lg font-light">
              Scan your <span className="font-semibold text-cyan-300">Domains</span> • <span className="font-semibold text-blue-300">Repositories</span> • <span className="font-semibold text-purple-300">Servers</span> • <span className="font-semibold text-indigo-300">Endpoints</span> for cryptographic vulnerabilities and Post-Quantum readiness.
            </p>
            <p className="mt-4 text-slate-400 text-sm">
              Ensure your organization is quantum-safe before threats emerge.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="space-y-3"
          >
            <p className="text-xs uppercase tracking-wider text-cyan-400 font-semibold">🔐 What We Scan</p>
            <div className="grid grid-cols-2 gap-3">
              <FeaturePill 
                icon={<Globe className="h-4 w-4 text-cyan-400" />}
                label="TLS Endpoints"
                description="Detect weak encryption protocols"
                delay={0.5}
              />
              <FeaturePill 
                icon={<GitBranch className="h-4 w-4 text-blue-400" />}
                label="Code Repositories"
                description="Audit dependencies & packages"
                delay={0.6}
              />
              <FeaturePill 
                icon={<Server className="h-4 w-4 text-purple-400" />}
                label="System Agents"
                description="Monitor OS & infrastructure"
                delay={0.7}
              />
              <FeaturePill 
                icon={<Cpu className="h-4 w-4 text-indigo-400" />}
                label="PQC Scoring"
                description="Quantum readiness analysis"
                delay={0.8}
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.5 }}
            className="pt-4"
          >
            <p className="text-xs text-slate-500 flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 bg-cyan-500 rounded-full"></span>
              Supported by industry-leading PQC standards
            </p>
          </motion.div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-xs text-slate-600">
          © 2026 XENCRYPT · Post-Quantum Cryptography Platform
        </p>
      </motion.div>

      {/* ── Right panel — login form ──────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        {/* Subtle right-side glow */}
        <div className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full bg-purple-800/10 blur-[80px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="relative z-10 w-full max-w-md"
        >
          {/* Mobile logo (hidden on lg) */}
          <div className="lg:hidden flex items-center gap-3 mb-10 justify-center">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 via-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-900/60 animate-pulse">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-white font-bold text-lg tracking-wide">XENCRYPT</span>
              <span className="text-xs text-cyan-400 font-semibold">Post-Quantum Ready</span>
            </div>
          </div>

          {/* Card */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">

            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white">Join XENCRYPT</h2>
              <p className="text-sm text-slate-400 mt-2">
                Start your quantum-safe transformation today. Secure sign-in with your Google account.
              </p>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-white/8" />
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <LockIcon className="h-3 w-3" /> Enterprise-Grade Security
              </span>
              <div className="flex-1 h-px bg-white/8" />
            </div>

            {/* Google button */}
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleSuccess}
                onError={handleError}
                theme="filled_blue"
                shape="rectangular"
                size="large"
                text="signin_with"
                logo_alignment="center"
                width="340"
              />
            </div>

            {/* Trust note */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="mt-6 flex items-start gap-2.5 p-4 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-xl border border-cyan-500/20"
            >
              <CheckCircle className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
              <div className="flex flex-col gap-1">
                <p className="text-xs text-slate-200 font-semibold leading-relaxed">
                  100% Secure & Compliant
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Your Google account is used only for authentication. We never store or share your personal data.
                </p>
              </div>
            </motion.div>
          </div>

          {/* Below-card note */}
          <p className="text-center text-xs text-slate-500 mt-6">
            By signing in, you agree to XENCRYPT's <span className="text-cyan-400 hover:underline cursor-pointer">Security Audit Terms</span> and <span className="text-cyan-400 hover:underline cursor-pointer">Privacy Policy</span>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;
